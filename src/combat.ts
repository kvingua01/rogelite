import Phaser from 'phaser'
import { abyssDecor, arena, cover, drawAbyssPortal, H, textures, tones, W } from './art'
import { type Effect, type Relic, type Weapon } from './data'
import { floors, type HealingPickup, type Room } from './dungeon'
import { encounters, enemyTiming, regularAttackRate, waveCount, waveSize } from './balance'
import { abyssEnemies, abyssPhase, overlordPhases, type AbyssAttack, type AbyssProfile } from './abyss'
import { abyssalWeapon } from './materials'
import { minibosses, phaseFor, type Attack, type Profile } from './miniboss'
import { canWalk, castleHeight, castleSolids, castleSpawn, castleWidth, drawCastle, nearbyStation, stations } from './castle'
import { activeDamage, bellHeal, bellRadius, chaliceHeal, dotDuration, dotRate, duskHeal, frostDuration, mirrorRange, rimeDamage, shadowDamage, wardDuration } from './relic-effects'

const clamp = Phaser.Math.Clamp
const weaponRelicSynergies=[
 {weapon:'Cinder Hammer',relic:'Cinder Heart',level:2,contract:'',result:'blast'},
 {weapon:'',relic:'',level:0,contract:'Ashen Bargain',result:'blast'},
 {weapon:'Storm Staff',relic:'Forked Bolt',level:2,contract:'',result:'split'},
 {weapon:'Night Knives',relic:'Dusk Crown',level:1,contract:'Broken Shield',result:'pierce'},
] as const
const effectColor:Record<Effect,number> = {fire:0xff9167,poison:0x9bda85,frost:0x9bddff,lightning:0xffdc77,shadow:0xd29bf5}
const relicElements:Record<Effect,string>={fire:'Cinder Heart',poison:'Bog Idol',frost:'Rime Seal',lightning:'Forked Bolt',shadow:'Dusk Crown'}
type Effects = Partial<Record<Effect,number>>
type Point = {x:number;y:number}
type Volley = {limit:number; spent:Map<Foe,number>; affected:Set<Foe>}
type Shot = Point & {vx:number;vy:number;life:number;damage:number;friendly:boolean;effects:Effects;pierce:number;bounce:number;home:number;hit:Set<Foe>;volley?:Volley;crescent?:boolean}
type Foe = Point & {sprite:Phaser.GameObjects.Image; hp:number;max:number;kind:number;elite:boolean;effect?:Effect;large:boolean;boss:boolean;next:number;meleeInRangeSince?:number;angle:number;slow:number;slowPower:number;burn:number;dot:number;phase:number;role:'melee'|'ranged'|'special';flank:number;strike:number;attacks:number;echo:{time:number;angle:number;count:number;speed:number}|null;radius:number;damage:number;mini?:Profile;miniWarning?:{attack:Attack|'phase';aim:Point;angle:number;at:number};resistUntil:number;guardUntil:number;pursuit:number;abyss?:AbyssProfile;summoned?:boolean}
type Hazard = Point & {r:number;life:number;damage:number;color:number;environmental?:true}
type Flash = Point & {life:number;max:number;color:number;angle?:number;r:number}
export interface CombatBridge {
 slot:0|1; loadout:readonly [Weapon,Weapon|null]; paused:boolean; floor:number; room:Room; rooms:Room[]; hp:number; maxHP:number;
 readonly active?:Relic; charge:number; readonly power:number; challenge:Set<string>;
 level(name:string):number; relicLevel(name:string):number; switchWeapon():void; curse(name:string):boolean; blessed(name:string):boolean;
 consumeDodgeDraught():boolean; attackPower(damage:number):number; hurt(damage:number):void; heal(amount:number):void; gainCharge(type:string, amount:number):void;
 killed(elite:boolean, large:boolean):void; clear():void; enter(id:number, dx:number,dy:number):void; interact():void; sound(frequency:number):void;
 refresh():void; ready():void; castleStatus():void;
}
export class Combat extends Phaser.Scene {
 bridge!:CombatBridge
 player!:Phaser.GameObjects.Image
 backdrop!:Phaser.GameObjects.Graphics
 fx!:Phaser.GameObjects.Graphics
 keys!:Record<string,Phaser.Input.Keyboard.Key>
 mode='cover'
 castleLabels:Phaser.GameObjects.Text[]=[]
 castleWalls:ReturnType<typeof castleSolids>=[]
 foes:Foe[]=[]
 shots:Shot[]=[]
 hazards:Hazard[]=[]
 pillars:(Point & {r:number})[]=[]
 pending:{owner:Foe; time:number; execute:()=>void}[]=[]
 flashes:Flash[]=[]
 drops:HealingPickup[]=[]
 wave=0
 totalWaves=0
 elapsed=0
 nextAttack=0
 nextRoll=0
 rollUntil=0
 invulnerable=0
 dx=1
 dy=0
 attackQueued=false
 rollQueued=false
 relicQueued=false
 velocity={x:0,y:0}
 hudTimer=0
 locked=false
 bossName=''
 greatswordSwings=0
 create() {
  textures(this)
  this.backdrop=this.add.graphics()
  this.fx=this.add.graphics().setDepth(5)
  this.player=this.add.image(409,218,'knight').setDepth(4).setScale(2.9)
  this.keys=this.input.keyboard!.addKeys('W,A,S,D') as typeof this.keys
  this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{
   if(pointer.leftButtonDown()&&this.mode==='run'&&!this.bridge.paused)this.attackQueued=true
  })
  this.input.on('wheel',()=>{if(this.mode==='run'&&!this.bridge.paused)this.bridge.switchWeapon()})
  this.showCover()
  this.bridge.ready()
 }
 showCover() {
  this.mode='cover'; this.reset()
  this.leaveCastleCamera()
  this.player.setPosition(415,218).setScale(2.9).setVisible(true).clearTint().setAlpha(1)
  cover(this.backdrop.clear())
 }
 showCastle(improvements:(name:string)=>number){
  const inCastle=this.mode==='castle'
  this.mode='castle'
  if(!inCastle){
   this.reset()
   this.player.setPosition(castleSpawn.x,castleSpawn.y).setScale(1).setVisible(true).clearTint().setAlpha(1).setFlipX(false)
   const camera=this.cameras.main
   camera.setBounds(0,0,castleWidth,castleHeight).centerOn(this.player.x,this.player.y)
   camera.startFollow(this.player,true,.12,.12)
   this.castleLabels=stations.map(s=>this.add.text(s.x+s.w/2,s.y+12,s.name.toUpperCase(),{
    fontFamily:'monospace',fontSize:'10px',color:'#ffe0af',backgroundColor:'#29212c',padding:{x:4,y:2},
   }).setOrigin(.5,0).setDepth(2))
  }
  const unlock={forge:this.bridge.level('Forge')>0,tower:this.bridge.level('Fleet Step')>0}
  this.castleWalls=castleSolids(unlock)
  drawCastle(this.backdrop,unlock,improvements)
 }
 leaveCastleCamera(){
  this.cameras.main.stopFollow().removeBounds().setScroll(0,0)
  this.castleLabels.forEach(label=>label.destroy())
  this.castleLabels=[]
 }
 castleStation(){return nearbyStation(this.player)}
 walkCastle(delta:number){
  const {D,A,S,W}=this.keys
  const p=this.player
  const dx=Number(D.isDown)-Number(A.isDown),dy=Number(S.isDown)-Number(W.isDown)
  const magnitude=Math.hypot(dx,dy)
  if(magnitude){
   const pace=132*delta/magnitude
   if(canWalk(this.castleWalls,{x:p.x+dx*pace,y:p.y}))p.x+=dx*pace
   if(canWalk(this.castleWalls,{x:p.x,y:p.y+dy*pace}))p.y+=dy*pace
   if(dx)p.setFlipX(dx<0)
  }
  p.setScale(1,magnitude?1+Math.sin(this.elapsed/48)*.06:1)
  this.bridge.castleStatus()
 }
 reset() {
  this.foes.forEach(foe=>foe.sprite.destroy())
  this.foes=[]; this.shots=[]; this.hazards=[]; this.flashes=[]; this.drops=[]; this.pillars=[]; this.pending=[]
  this.wave=0;this.totalWaves=0
  this.fx.clear()
 }
 showRoom(dx=0,dy=0) {
  this.mode='run'; this.reset()
  this.leaveCastleCamera()
  const { room, floor, challenge }=this.bridge
  this.player.setScale(1).setPosition(dx>0?35:dx<0?W-35:W/2,dy>0?37:dy<0?H-37:H/2).setVisible(true).clearTint()
  this.attackQueued=false;this.rollQueued=false;this.relicQueued=false
  this.velocity={x:0,y:0}
  this.rollUntil=0; this.invulnerable=this.elapsed+280
  this.locked=!room.cleared&&['Combat','Miniboss','Boss'].includes(room.kind)
  const metadata=floors[floor]
  this.bossName=room.kind==='Boss'?metadata.boss:room.kind==='Miniboss'?metadata.minis[room.patch]:''
  if (this.locked) {
   if(this.bossName){
    if(floor===3)this.pillars=[{x:109,y:78,r:13},{x:404,y:210,r:13}]
    if(room.kind==='Miniboss')this.pillars=[{x:137,y:82+room.patch*7,r:12},{x:374,y:212-room.patch*7,r:12}]
    this.spawn(W*.65,H*.49,(floor*2+room.patch)%7,room.kind==='Boss',true)
   }
   else{
    this.totalWaves=waveCount(encounters.enemies[floor])
    this.spawnWave()
   }
  }
  this.drops.push(...room.healingRewards??[])
  if ((room.kind==='Trap' || (this.locked && (floor>0 || challenge.has('Scorched Ground')))) && !room.cleared) {
   const color=[0xbd7f82,0x9dc67b,0xff9960,0xaa56dd][floor]
   for(let i=0;i<(room.kind==='Trap'?6:2);i++) this.hazards.push({x:111+i%3*145,y:90+Math.floor(i/3)*110,r:13+(i%3)*3,life:Infinity,environmental:true,damage:floor===3?29:11+floor*2,color})
  }
  this.drawRoom()
 }
 spawnWave(){
  const {room,floor}=this.bridge
  const offsetForWave=this.wave*waveSize
  this.wave++
  const sites=[69,144,219].flatMap(y=>[84,170,256,342,428].map(x=>({x,y})))
  const spawns=Phaser.Utils.Array.Shuffle(sites)
   .filter(site=>Math.hypot(site.x-this.player.x,site.y-this.player.y)>=76&&this.arenaOpen(site,13))
   .slice(0,waveSize)
  let specials=0
  // Neither the regular floor caster nor the Abyssal Sorcerer belongs in combat waves.
  const kinds=floor===3?[0,1,2,3]:[0,1,2,3,5,6]
  const foes=spawns.map(({x,y},i)=>{
   const index=(room.patch+offsetForWave+i+(floor===3?0:floor*2))%kinds.length
   const foe=this.spawn(x,y,kinds[index],
    false,false,floor===3||specials<waveSize-2)
   if(foe.role==='special')specials++
   return foe
  })
  if(floor!==3){
   const basic=foes.filter(foe=>foe.role!=='special')
   const meleeCount=Math.min(basic.length-1,Math.round(basic.length*encounters.meleeShare[room.patch]))
   Phaser.Utils.Array.Shuffle(basic).forEach((foe,i)=>{foe.role=i<meleeCount?'melee':'ranged'})
  }
 }
 addRoomHealing(amount:number){
  const rewards=this.bridge.room.healingRewards??=[]
  this.bridge.room.healingRewards=rewards
  const sites=[96,144,192].flatMap(y=>[192,224,256,288,320].map(x=>({x,y})))
  const point=sites.find(site=>this.arenaOpen(site,12)&&Math.hypot(site.x-this.player.x,site.y-this.player.y)>24&&
   this.drops.every(drop=>Math.hypot(site.x-drop.x,site.y-drop.y)>20))??{x:W/2,y:H/2}
  const drop={...point,amount}
  rewards.push(drop)
  this.drops.push(drop)
 }
 drawRoom() {
  const {room,floor,rooms}=this.bridge
  const g=this.backdrop.clear()
  arena(g,floors[floor].palettes[room.patch],floor,room.id)
  if(floor===3){
   abyssDecor(g,room.id)
   for(const p of this.pillars)g.fillStyle(0x170f21).fillRect(p.x-12,p.y-13,24,23).fillStyle(0x56346a).fillRect(p.x-11,p.y-13,22,5)
  }
  if(room.portal)drawAbyssPortal(g)
  if(room.kind==='Miniboss'){
   const theme=[0xb78a7c,0x91ac79,0xd3946d][floor]
   g.lineStyle(2,theme,.6).strokeRect(32,30,W-64,H-60)
   for(const x of [65,447])for(const y of [62,226]){
    g.fillStyle(theme,.28).fillRect(x-7,y-13,14,24).fillStyle(theme,.72).fillRect(x-5,y-11,10,4)
   }
   for(const p of this.pillars){
    g.fillStyle(0x27232d).fillEllipse(p.x,p.y+6,30,19).fillRect(p.x-11,p.y-12,22,22)
    g.fillStyle(theme).fillRect(p.x-10,p.y-13,20,6).fillRect(p.x-9,p.y-6,4,13)
   }
  }
  for(const id of room.neighbors) {
   const next=rooms[id]
   const dx=next.x-room.x,dy=next.y-room.y
   const x=W/2+dx*(W/2-11),y=H/2+dy*(H/2-11)
   const hidden=next.kind==='Secret'&&!next.seen
   g.fillStyle(0x211923).fillRect(x-14,y-12,28,24)
   g.lineStyle(2,hidden?0x644d59:this.locked?0xc77479:0xe2ad78).strokeRect(x-14,y-12,28,24)
   if(!hidden) g.fillStyle(this.locked?0xbc6571:0xd6aa76).fillRect(x-4,y-3,8,6)
  }
  if(!['Entry','Combat','Trap','Miniboss','Boss'].includes(room.kind)) {
   g.fillStyle(0x251c28).fillRect(W/2-13,H/2-10,26,20)
   g.fillStyle(room.used?0x716374:0xd19a71).fillRect(W/2-10,H/2-8,20,14)
   g.fillStyle(0x473044).fillRect(W/2-2,H/2-3,4,5)
  }
 }
 spawn(x:number,y:number,kind:number,boss=false,large=false,allowSpecial=true) {
  const {floor,challenge}=this.bridge
  const abyss=floor===3?(boss?overlordPhases[0]:abyssEnemies[kind]):undefined
  const eliteChance=floor===3?(challenge.has('Elite Host')?.64:.38):(challenge.has('Elite Host')?.42:encounters.eliteShare+floor*.035)
  const elite=!large&&allowSpecial&&Math.random()<eliteChance
  const elements:Effect[]=['fire','poison','frost','lightning','shadow']
  const effect=!large&&allowSpecial&&Math.random()<.19?elements[(kind+floor)%elements.length]:undefined
  const role=large||elite||effect||(allowSpecial&&kind>=2&&Math.random()<encounters.specialShare)?'special':'melee'
  const max=(abyss?.hp??(boss?encounters.bossHealth[floor]:large?encounters.minibossHealth[floor]:Math.round(encounters.basicHealth[floor]*[1.16,.85,.94,1.11,1,.89,.96][kind])))*(elite?1.8:1)*(large&&challenge.has('Iron Bosses')?1.45:1)
  const sprite=this.add.image(x,y,boss?'boss'+floor:abyss?'abyss'+kind:'foe'+kind).setScale(boss?2.65:large?1.8:1).setDepth(3)
  if(effect) sprite.setTint(effectColor[effect])
  if(elite&&!effect) sprite.setTint(0xf2d393)
  const foe:Foe={x,y,sprite,kind,boss,large,elite,effect,abyss,max,hp:max,next:this.elapsed,angle:0,slow:0,slowPower:0,burn:0,dot:0,phase:0,role,flank:(this.foes.length%2?1:-1),strike:0,resistUntil:0,guardUntil:0,pursuit:0,mini:large&&!boss?minibosses[floor][this.bridge.room.patch]:undefined,attacks:0,echo:null,radius:boss?(abyss?25:21):large?15:abyss&&kind===3?13:8,damage:(abyss?.damage??(boss?encounters.bossDamage[floor]:large?encounters.minibossDamage[floor]:encounters.basicDamage[floor]+kind%3))+(elite?encounters.eliteBonusDamage:0)+(effect?2:0)}
  this.foes.push(foe)
  return foe
 }
 flash(x:number,y:number,r:number,color:number,angle?:number) {
  if(this.flashes.length<90) this.flashes.push({x,y,r,color,angle,life:180,max:180})
 }
 damage(foe:Foe,amount:number,effects:Effects={},directTargets?:Set<Foe>) {
  if(foe.hp<=0) return
  const b=this.bridge
  if(foe.guardUntil>this.elapsed)amount*=.72
  const dealt=Math.min(foe.hp,amount)
  foe.hp-=amount
  b.gainCharge('damage',dealt)
  if((foe.mini||foe.abyss)&&amount>=6&&this.elapsed>=foe.resistUntil&&!foe.miniWarning){
   const angle=Math.atan2(foe.y-this.player.y,foe.x-this.player.x)
   this.arenaStep(foe,angle,3,foe.radius)
   foe.resistUntil=this.elapsed+1250
  }
  if(amount>=1){
   foe.sprite.setAlpha(.55)
   const effect=Object.keys(effects)[0] as Effect|undefined
   this.flash(foe.x,foe.y,8,effect?effectColor[effect]:0xf7ddac)
  }
  for(const effect of ['fire','poison'] as const){
   const strength=effects[effect]
   if(!strength)continue
   const level=b.relicLevel(relicElements[effect])*(strength===1?b.power:1)
   const dot=amount*dotRate(level)*strength
   if(foe.burn<=this.elapsed||dot>=foe.dot){
    foe.burn=this.elapsed+dotDuration(level)*strength
    foe.dot=dot
   }
  }
  const slow=effects.frost??(b.relicLevel('Bog Idol')===3?effects.poison:0)
  if(slow){
   foe.slow=this.elapsed+frostDuration(b.relicLevel('Rime Seal')*(slow===1?b.power:1))*slow
   foe.slowPower=.48*slow
  }
  const lightning=effects.lightning
  if(lightning) {
   const target=this.foes.find(other=>other!==foe&&other.hp>0&&!directTargets?.has(other)&&Phaser.Math.Distance.Between(other.x,other.y,foe.x,foe.y)<53*lightning)
   if(target){directTargets?.add(target);this.damage(target,amount*.28*lightning)}
  }
  if(foe.hp>0) return
  foe.sprite.destroy()
  this.flash(foe.x,foe.y,foe.radius*2,0xeeb184)
  const grantsLoot=!(foe.abyss&&foe.summoned)
  if(grantsLoot)b.killed(foe.elite,foe.large)
  b.gainCharge('kills',1)
  if(grantsLoot&&b.relicLevel('Dusk Crown')===3) b.heal(duskHeal*b.power)
  if(grantsLoot&&!foe.large&&Math.random()<encounters.healChance) this.drops.push({x:foe.x,y:foe.y,amount:Math.random()<encounters.largeHealChance?35:15})
 }
 projectile(x:number,y:number,angle:number,speed:number,range:number,damage:number,friendly:boolean,effects:Effects={},pierce=0,bounce=0,home=0,volley?:Volley) {
  if(this.shots.length>=220)return
  const shot:Shot={x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:range/speed*1000,damage,friendly,effects,pierce,bounce,home,hit:new Set(),volley}
  this.shots.push(shot)
  return shot
 }
 attack(angle:number) {
  const b=this.bridge, weapon=b.loadout[b.slot],p=this.player
  if(!weapon)return
  this.nextAttack=this.elapsed+weapon.delay
  const elements:Effects={}
  for(const effect of Object.keys(relicElements) as Effect[]) if(b.relicLevel(relicElements[effect]))elements[effect]=b.power
  if(weapon.effect)elements[weapon.effect]=1
  const synergies=weaponRelicSynergies.filter(rule=>
   (!rule.weapon||rule.weapon===weapon.name)&&(!rule.relic||b.relicLevel(rule.relic)>=rule.level)&&(!rule.contract||b.blessed(rule.contract)))
  const combo=(result:string)=>synergies.find(rule=>rule.result===result)
  const amount=b.attackPower(weapon.damage)*(1+(b.relicLevel('Rime Seal')===3?rimeDamage*b.power:0))*(1+shadowDamage(b.relicLevel('Dusk Crown'))*b.power)
  if(b.slot===0) {
   const burst=combo('blast')
   const range=weapon.range+(burst?15*(burst.relic?b.power:1):0)
   this.flash(p.x,p.y,range,burst?effectColor.fire:0xf6d5a5,angle)
   const targets=new Set(this.foes.filter(foe=>{
    const distance=Phaser.Math.Distance.Between(p.x,p.y,foe.x,foe.y)
    return foe.hp>0&&distance<range+foe.radius&&this.arenaSight(p,foe)&&(distance<19||Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(foe.y-p.y,foe.x-p.x)-angle))<1.03||burst)
   }))
   const affected=new Set(targets)
   for(const foe of targets)this.damage(foe,amount,elements,affected)
   if(weapon.name===abyssalWeapon&&++this.greatswordSwings%4===0){
    const arc=this.projectile(p.x,p.y,angle,225,195,amount*.48,true,{shadow:1},3)
    if(arc){arc.crescent=true;arc.hit=targets}
    b.sound(390)
   }
  } else {
   const forks=b.relicLevel('Forked Bolt')
   const mirror=b.relicLevel('Mirror Quiver')
   const pierce=Math.round(((forks===3?2:0)+(combo('pierce')?2:0))*b.power)+(b.blessed('Broken Shield')&&elements.shadow?2:0)
   const volley:Volley={limit:amount*(1+.24*b.power),spent:new Map(),affected:new Set()}
   this.projectile(p.x,p.y,angle,225,weapon.range+mirrorRange(mirror)*b.power,amount,true,elements,pierce,mirror?Math.round(2*b.power):0,mirror===3?b.power:0,volley)
   const spread=combo('split')?[-.34,-.17,.17,.34]:forks>=2?[-.2,.2]:forks===1?[.17]:[]
   for(const offset of spread) this.projectile(p.x,p.y,angle+offset,225,weapon.range+mirrorRange(mirror)*b.power,amount*.78*b.power,true,elements,pierce,mirror?Math.round(2*b.power):0,mirror===3?b.power:0,volley)
  }
  b.sound(b.slot===0?170:285)
 }
 activate() {
  const b=this.bridge, relic=b.active
  if(!relic?.cap||b.charge<relic.cap) return
  const level=b.relicLevel(relic.name),power=b.power
  b.charge=0
  const radius=bellRadius*power
  this.flash(this.player.x,this.player.y,relic.name==='Sun Bell'?radius:90,0xd9b4fc)
  if(relic.name==='Blood Chalice') b.heal(chaliceHeal(level)*power)
  if(relic.name==='Grave Lantern'||(relic.name==='Blood Chalice'&&level===3)) this.invulnerable=Math.max(this.invulnerable,this.elapsed+wardDuration(level)*power)
  if(relic.name==='Sun Bell'||relic.name==='Thunder Rune'||(relic.name==='Grave Lantern'&&level===3)) for(const foe of this.foes) {
   const effects:Effects=relic.name==='Thunder Rune'?(level===3?{lightning:1,frost:power}:{lightning:1}):{fire:power}
   if(relic.name!=='Sun Bell'||Phaser.Math.Distance.Between(foe.x,foe.y,this.player.x,this.player.y)<radius) this.damage(foe,activeDamage(level)*power,effects)
  }
  if(relic.name==='Sun Bell'&&level===3) b.heal(bellHeal*power)
  b.sound(500)
 }
 move(delta:number) {
  const b=this.bridge,k=this.keys,p=this.player
  const x=Number(k.D.isDown)-Number(k.A.isDown),y=Number(k.S.isDown)-Number(k.W.isDown)
  const before={x:p.x,y:p.y}
  const aim=Math.atan2(this.input.activePointer.worldY-p.y,this.input.activePointer.worldX-p.x)
  p.setFlipX(Math.cos(aim)<0)
  if(this.rollQueued&&this.elapsed>=this.nextRoll) {
   const a=x||y?Math.atan2(y,x):aim
   this.dx=Math.cos(a);this.dy=Math.sin(a)
   this.rollUntil=this.elapsed+205
   this.invulnerable=Math.max(this.invulnerable,this.rollUntil)
   this.nextRoll=this.elapsed+(b.consumeDodgeDraught()?205:1050)*(1-b.level('Quick Roll')*.1)*(b.curse('Broken Shield')?2:1)
   b.sound(95)
  }
  this.rollQueued=false
  if(this.elapsed<this.rollUntil) {
   const speed=297*(1+b.level('Long Roll')*.1)*delta
   p.x+=this.dx*speed;p.y+=this.dy*speed
  } else if(x||y) {
   const speed=113*(1+b.level('Fleet Step')*.07)*(b.curse('Lead Boots')?.75:1)*(b.blessed('Lead Boots')?1.2:1)*delta/Math.hypot(x,y)
   p.x+=x*speed;p.y+=y*speed
  }
  if(!this.arenaOpen({x:p.x,y:before.y},7))p.x=before.x
  if(!this.arenaOpen(p,7))p.y=before.y
  if(!this.locked) for(const id of b.room.neighbors) {
   const next=b.rooms[id]
   const dx=next.x-b.room.x,dy=next.y-b.room.y
   if((dx!==0&&Math.abs(p.y-H/2)<18&&(dx<0?p.x<23:p.x>W-23))||(dy!==0&&Math.abs(p.x-W/2)<18&&(dy<0?p.y<24:p.y>H-24))) { b.enter(id,dx,dy);return }
  }
  p.x=clamp(p.x,21,W-21);p.y=clamp(p.y,22,H-22)
  this.velocity={x:(p.x-before.x)/delta,y:(p.y-before.y)/delta}
  p.setAlpha(this.elapsed<this.invulnerable?.65:1)
  p.setScale(1,this.elapsed<this.rollUntil?.8:x||y?1+Math.sin(this.elapsed/52)*.045:1)
  if((this.attackQueued||this.input.activePointer.leftButtonDown())&&this.elapsed>=this.nextAttack&&this.elapsed>=this.rollUntil) this.attack(aim)
  this.attackQueued=false
  if(this.relicQueued)this.activate()
  this.relicQueued=false
 }
 arenaOpen(point:Point,radius:number){
  return this.pillars.every(p=>Math.hypot(point.x-p.x,point.y-p.y)>=p.r+radius)
 }
 arenaSight(from:Point,to:Point){
  const distance=Math.hypot(to.x-from.x,to.y-from.y)
  for(let at=6;at<distance;at+=6){
   const t=at/distance
   if(!this.arenaOpen({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t},1))return false
  }
  return true
 }
 arenaStep(foe:Point,angle:number,distance:number,radius:number){
  if(distance<=0)return
  const steps=Math.ceil(distance/5)
  const dx=Math.cos(angle)*distance/steps,dy=Math.sin(angle)*distance/steps
  for(let i=0;i<steps;i++){
   const x=clamp(foe.x+dx,22+radius,W-22-radius),y=clamp(foe.y+dy,24+radius,H-24-radius)
   if(this.arenaOpen({x,y:foe.y},radius))foe.x=x
   if(this.arenaOpen({x:foe.x,y},radius))foe.y=y
  }
 }
 queue(owner:Foe,after:number,execute:()=>void){
  if(after===0)execute()
  else this.pending.push({owner,time:this.elapsed+after,execute})
 }
 miniPool(point:Point,foe:Foe,radius:number,life:number){
  const x=clamp(point.x,36,W-36),y=clamp(point.y,38,H-38)
  const color=effectColor[foe.mini?.element??'shadow']
  this.hazards.push({x,y,r:radius,life:this.elapsed+life,damage:foe.damage,color})
  this.flash(x,y,radius,color)
 }
 miniFire(foe:Foe,angle:number,count:number,arc:number,offset=0){
  const speed=(foe.abyss?152:113+this.bridge.floor*9)+foe.phase*10
  const effects:Effects={[foe.mini?.element??'shadow']:1}
  for(let i=0;i<count;i++){
   const direction=angle+(i-(count-1)/2)*arc+offset
   this.projectile(foe.x+Math.cos(direction)*17,foe.y+Math.sin(direction)*17,direction,speed,470,foe.damage,false,effects)
  }
 }
 miniSummon(foe:Foe,count:number){
  if(this.bridge.room.kind==='Combat')return
  const sites=[{x:74,y:67},{x:435,y:220},{x:232,y:217},{x:438,y:63},{x:83,y:220}]
  const active=this.foes.filter(f=>f.hp>0&&(foe.abyss?f.summoned:!f.large)).length
  const safe=sites.filter(p=>Math.hypot(p.x-this.player.x,p.y-this.player.y)>105&&this.arenaOpen(p,11)&&
   this.foes.every(f=>f.hp<=0||Math.hypot(f.x-p.x,f.y-p.y)>45))
  for(const point of safe.slice(0,Math.max(0,Math.min(count,3-active)))){
   const summon=this.spawn(point.x,point.y,foe.abyss?0:(foe.kind+this.bridge.floor)%7,false,false,false)
   summon.summoned=true
   this.flash(point.x,point.y,16,effectColor[foe.mini?.element??'shadow'])
  }
 }
 miniBlink(foe:Foe,angle:number){
  const p=this.player
  const spots=[angle+Math.PI*.6,angle-Math.PI*.6,angle+Math.PI].map(a=>({
   x:clamp(p.x+Math.cos(a)*98,44,W-44),y:clamp(p.y+Math.sin(a)*98,46,H-46),
  }))
  const spot=spots.find(point=>this.arenaOpen(point,foe.radius)&&Math.hypot(point.x-p.x,point.y-p.y)>72)
  if(!spot)return
  this.flash(foe.x,foe.y,20,effectColor[foe.mini?.element??'shadow'])
  Object.assign(foe,spot)
  this.flash(foe.x,foe.y,20,effectColor[foe.mini?.element??'shadow'])
 }
 miniStrike(foe:Foe,angle:number,reach:number,arc:number){
  const p=this.player,color=effectColor[foe.mini?.element??'shadow']
  this.flash(foe.x,foe.y,reach,color,arc<Math.PI?angle:undefined)
  if(Math.hypot(p.x-foe.x,p.y-foe.y)<reach&&this.arenaSight(foe,p)&&
     Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(p.y-foe.y,p.x-foe.x)-angle))<=arc){
   const health=this.bridge.hp
   this.hitPlayer(foe.damage)
   if(this.mode==='run'&&this.bridge.hp<health&&foe.abyss&&!foe.boss&&foe.kind===3)
    this.arenaStep(p,Math.atan2(p.y-foe.y,p.x-foe.x),30,7)
  }
 }
 useMiniAttack(foe:Foe,attack:Attack,aim:Point){
  const angle=foe.angle
  const phase=foe.phase
  switch(attack){
   case 'lunge':
    this.arenaStep(foe,angle,Math.min(110+phase*13,Math.max(0,Math.hypot(aim.x-foe.x,aim.y-foe.y)-23)),foe.radius)
    this.miniStrike(foe,angle,43,1.18)
    break
   case 'combo':
    this.arenaStep(foe,angle,30,foe.radius)
    this.miniStrike(foe,angle,45,1.22)
    this.queue(foe,220,()=>{
     this.arenaStep(foe,angle,25,foe.radius)
     this.miniStrike(foe,angle,49,1.45)
    })
    break
   case 'spin':
    this.arenaStep(foe,angle,24,foe.radius)
    this.miniStrike(foe,angle,55,Math.PI)
    if(phase>0)this.queue(foe,190,()=>this.miniFire(foe,angle,8,Math.PI/4))
    break
   case 'slam':
    this.arenaStep(foe,angle,38,foe.radius)
    this.miniStrike(foe,angle,57,Math.PI)
    if(this.bridge.hp>0)this.miniFire(foe,angle,phase===2?12:9,Math.PI*2/(phase===2?12:9))
    break
   case 'spread':
    this.miniFire(foe,angle,5+phase*2,.23)
    break
   case 'burst':
    for(let i=0;i<3+phase;i++)this.queue(foe,i*110,()=>this.miniFire(foe,angle,phase===2?3:1,.20,(i-1)*.1))
    break
   case 'spiral':
    for(let i=0;i<3+phase;i++)this.queue(foe,i*145,()=>this.miniFire(foe,angle,6,Math.PI/3,i*.2))
    break
   case 'summon':
    this.miniSummon(foe,phase===2?2:1)
    this.miniFire(foe,angle,5,.27)
    break
   case 'blink':
    this.miniBlink(foe,angle)
    this.miniFire(foe,Math.atan2(aim.y-foe.y,aim.x-foe.x),5,.25)
    break
   case 'eruption':
    this.miniPool(aim,foe,25+phase*3,440)
    for(const side of [-1,1])this.queue(foe,195,()=>this.miniPool({
     x:aim.x+Math.cos(angle+Math.PI/2)*side*43,y:aim.y+Math.sin(angle+Math.PI/2)*side*43,
    },foe,21,440))
    break
   case 'trail':
    for(let i=0;i<4+phase;i++)this.queue(foe,i*95,()=>{
     const point={x:foe.x,y:foe.y}
     this.arenaStep(foe,angle,18,foe.radius)
     this.miniPool(point,foe,16,1200+phase*240)
    })
    break
   case 'cross':
    this.miniFire(foe,angle,4,Math.PI/2)
    this.queue(foe,180,()=>this.miniFire(foe,angle,8,Math.PI/4,Math.PI/8))
  }
 }
 miniTransition(foe:Foe,profile:Profile,aim:Point){
  const angle=Math.atan2(aim.y-foe.y,aim.x-foe.x)
  // Phase changes replace any remaining hits from the previous attack.
  this.pending=this.pending.filter(action=>action.owner!==foe)
  foe.attacks=0
  foe.angle=angle
  foe.next=this.elapsed+930
  foe.strike=this.elapsed+190
  foe.sprite.setTint(foe.phase===2?0xffa28a:effectColor[profile.element])
  switch(profile.special){
   case 'retinue': this.miniSummon(foe,foe.phase);break
   case 'thorns': this.useMiniAttack(foe,'trail',aim);break
   case 'rift': this.miniBlink(foe,angle);this.miniFire(foe,angle,8,Math.PI/4);break
   case 'guard': foe.guardUntil=this.elapsed+650;this.miniFire(foe,angle,4,Math.PI/2);break
   case 'pools': for(const dx of [-47,47])this.miniPool({x:aim.x+dx,y:aim.y},foe,23,1700);break
   case 'web': this.miniSummon(foe,1);this.miniFire(foe,angle,7,.31);break
   case 'spores': this.useMiniAttack(foe,'eruption',aim);break
   case 'aftershock': this.useMiniAttack(foe,'slam',aim);break
   case 'embers': this.miniFire(foe,angle,10,Math.PI/5);this.miniPool(foe,foe,33,1250);break
   case 'salvo': this.useMiniAttack(foe,'burst',aim);break
   case 'shade': this.miniBlink(foe,angle);this.miniSummon(foe,1);break
   case 'inferno': this.useMiniAttack(foe,'spiral',aim);break
  }
 }
 tickMiniboss(foe:Foe,profile:Profile,delta:number){
  const p=this.player
  const angle=Math.atan2(p.y-foe.y,p.x-foe.x)
  const range=Math.hypot(p.x-foe.x,p.y-foe.y)
  const phase=phaseFor(foe.hp,foe.max)
  if(phase>foe.phase){
   foe.phase=phase
   this.pending=this.pending.filter(action=>action.owner!==foe)
   foe.miniWarning={attack:'phase',aim:{x:p.x,y:p.y},angle,at:this.elapsed+520}
  }
  if(this.bridge.paused)return
  const warning=foe.miniWarning
  if(warning&&this.elapsed>=warning.at){
   foe.miniWarning=undefined
   if(warning.attack==='phase')this.miniTransition(foe,profile,warning.aim)
   else{
    foe.angle=warning.angle
    foe.attacks++
    foe.strike=this.elapsed+190
    foe.next=this.elapsed+[840,655,500][phase]+(['spiral','trail','summon'].includes(warning.attack)?220:0)
    this.useMiniAttack(foe,warning.attack,warning.aim)
   }
   if(this.bridge.paused)return
  }else if(!warning&&this.elapsed>=foe.next){
   const attacks=profile.phases[phase]
   const current=attacks[foe.attacks%attacks.length]
   const reach:Partial<Record<Attack,number>>={lunge:159,combo:84,spin:85,slam:110,trail:185}
   const inRange=(attack:Attack)=>range<=(reach[attack]??390)
   const attack=inRange(current)?current:foe.pursuit>1800&&phase>0?attacks.find(inRange):undefined
   if(attack){
    const duration=['eruption','slam','spiral'].includes(attack)?500:400
    foe.miniWarning={attack,aim:{x:p.x,y:p.y},angle,at:this.elapsed+duration-phase*35}
   }
  }
  const moving=Math.hypot(this.velocity.x,this.velocity.y)>18
  foe.pursuit=moving?0:foe.pursuit+delta*1000
  const speed=(profile.style==='pursue'?79:71)+phase*11+this.bridge.floor*5
  const slow=foe.slow>this.elapsed?1-foe.slowPower*.65:1
  let bearing=angle
  if(profile.style!=='pursue'&&range<76)bearing=angle+Math.PI
  else if(range<(profile.style==='pursue'?42:118))bearing=angle+foe.flank*Math.PI/2
  const x=foe.x,y=foe.y
  const step=speed*slow*delta*(foe.miniWarning?0:1)*(this.bridge.challenge.has('Swift Foes')?1.27:1)
  this.arenaStep(foe,bearing,step,foe.radius)
  if(Math.hypot(foe.x-x,foe.y-y)<step*.25){
   const offsets=[foe.flank*.85,-foe.flank*.85,foe.flank*1.5,-foe.flank*1.5]
   for(const offset of offsets){
    this.arenaStep(foe,angle+offset,step,foe.radius)
    if(Math.hypot(foe.x-x,foe.y-y)>=step*.5)break
   }
  }
  const striking=foe.strike>this.elapsed
  const scale=2.08+phase*.12
  foe.sprite.setPosition(foe.x,foe.y).setFlipX(p.x<foe.x)
   .setScale(scale*(striking?1.17:1),scale*(striking||foe.guardUntil>this.elapsed?.88:1))
   .setAlpha(Math.min(1,foe.sprite.alpha+delta*7))
  if(foe.burn>this.elapsed)this.damage(foe,foe.dot*delta)
 }
 abyssAttack(foe:Foe,attack:AbyssAttack,aim:Point){
  switch(attack){
   case 'rift-strike':
    this.miniBlink(foe,foe.angle)
    foe.angle=Math.atan2(aim.y-foe.y,aim.x-foe.x)
    this.useMiniAttack(foe,'lunge',aim)
    break
   case 'void-storm':
    for(let i=0;i<4;i++)this.queue(foe,i*160,()=>this.miniFire(foe,foe.angle,9+foe.phase,Math.PI*2/(9+foe.phase),i*.24))
    break
   case 'cataclysm':
    this.useMiniAttack(foe,'slam',aim)
    if(this.mode!=='run')return
    this.queue(foe,230,()=>this.miniPool(aim,foe,39,925))
    this.queue(foe,430,()=>this.miniFire(foe,foe.angle,15,Math.PI*2/15,.21))
    break
   default:
    this.useMiniAttack(foe,attack,aim)
  }
 }
 meleeReady(foe:Foe,inRange:boolean){
  if(!inRange){
   foe.meleeInRangeSince=undefined
   return false
  }
  foe.meleeInRangeSince??=this.elapsed
  return this.elapsed-foe.meleeInRangeSince>=1000
 }
 tickAbyss(foe:Foe,delta:number){
  const p=this.player
  const angle=Math.atan2(p.y-foe.y,p.x-foe.x)
  const range=Math.hypot(p.x-foe.x,p.y-foe.y)
  const phase=foe.boss?abyssPhase(foe.hp,foe.max):0
  const profile=foe.boss?overlordPhases[phase]:foe.abyss!
  if(phase>foe.phase){
   foe.phase=phase
   foe.attacks=0
   foe.next=this.elapsed+920
   foe.strike=this.elapsed+175
   foe.angle=angle
   foe.sprite.setTint([0xffffff,0xc29aff,0xd675e2,0xff70e7][phase])
   this.pending=this.pending.filter(action=>action.owner!==foe)
   const aim={x:p.x,y:p.y}
   if(phase===1){
    this.miniBlink(foe,angle)
    this.miniSummon(foe,2)
   }else this.abyssAttack(foe,phase===2?'eruption':'cataclysm',aim)
   if(this.mode!=='run')return
  }
  const attack=profile.patterns[foe.attacks%profile.patterns.length]
  const reach:Partial<Record<AbyssAttack,number>>={lunge:165,combo:87,slam:117,spin:96,cataclysm:150,trail:175}
  const inRange=range<=(reach[attack]??360)
  const meleeMinion=!foe.large&&(foe.kind===0||foe.kind===3)
  const ready=meleeMinion?this.meleeReady(foe,inRange):inRange
  if(ready&&this.elapsed>=foe.next){
   foe.meleeInRangeSince=undefined
   foe.angle=angle
   if(!foe.boss&&foe.kind===1){
    foe.angle=Phaser.Math.Angle.RotateTo(angle,Math.atan2(p.y+clamp(this.velocity.y*.25,-42,42)-foe.y,p.x+clamp(this.velocity.x*.25,-42,42)-foe.x),.57)
   }
   foe.attacks++
   foe.strike=this.elapsed+175
   foe.next=this.elapsed+(profile.cooldown*(foe.elite?.85:1)+(['void-storm','cataclysm','spiral'].includes(attack)?260:0))/(foe.large?1:regularAttackRate)
   this.abyssAttack(foe,attack,{x:p.x,y:p.y})
   if(this.mode!=='run')return
  }
  const flank=foe.kind===2?Math.sin(this.elapsed/220+foe.x)>0?1:-1:foe.flank
  const ranged=profile.preferred>=90
  let direction=angle
  if(range<profile.preferred+12)direction=angle+flank*Math.PI/2
  const original={x:foe.x,y:foe.y}
  const speed=profile.pace*(foe.elite?1.15:1)*(foe.slow>this.elapsed?1-foe.slowPower*.55:1)*(this.bridge.challenge.has('Swift Foes')?1.18:1)
  const step=ranged&&range<profile.preferred-26?0:speed*delta
  this.arenaStep(foe,direction,step,foe.radius)
  if(Math.hypot(original.x-foe.x,original.y-foe.y)<step*.3)this.arenaStep(foe,angle+flank*1.1,step,foe.radius)
  for(const other of this.foes){
   if(other===foe||other.hp<=0)continue
   const gap=Math.hypot(foe.x-other.x,foe.y-other.y)
   if(gap>0&&gap<foe.radius+other.radius+6)this.arenaStep(foe,Math.atan2(foe.y-other.y,foe.x-other.x),delta*36,foe.radius)
  }
  const striking=foe.strike>this.elapsed
  const pulse=foe.boss&&phase===3?.09*Math.sin(this.elapsed/48):0
  const scale=foe.boss?2.25+phase*.14:foe.kind===3?1.38:1
  foe.sprite.setPosition(foe.x,foe.y).setFlipX(p.x<foe.x)
   .setScale(scale*(1+pulse+(striking?.16:0)),scale*(1-pulse-(striking?.1:0)))
   .setAlpha(Math.min(1,foe.sprite.alpha+delta*7))
  if(foe.burn>this.elapsed)this.damage(foe,foe.dot*delta)
 }
 enemy(foe:Foe,delta:number) {
  if(foe.abyss){this.tickAbyss(foe,delta);return}
  if(foe.mini){this.tickMiniboss(foe,foe.mini,delta);return}
  const p=this.player,b=this.bridge
  const range=Phaser.Math.Distance.Between(p.x,p.y,foe.x,foe.y)
  const angle=Math.atan2(p.y-foe.y,p.x-foe.x)
  const phase=foe.boss?(foe.hp<foe.max*.32?2:foe.hp<foe.max*.66?1:0):0
  if(foe.echo&&this.elapsed>=foe.echo.time){
   const echo=foe.echo
   foe.echo=null
   for(let i=0;i<echo.count;i++)this.projectile(foe.x,foe.y,echo.angle+i*Math.PI*2/echo.count,echo.speed,480,foe.damage,false,b.floor===2&&foe.boss?{fire:1}:{})
  }
  if(phase>foe.phase) {
   foe.phase=phase
   foe.sprite.setTint(0xd892b8)
   this.hazards.push({x:foe.x,y:foe.y,r:48,life:this.elapsed+220,damage:foe.damage,color:0xf0a279})
   if(b.floor===1) for(const [dx,dy] of [[-60,0],[60,0],[0,-51],[0,51]]) this.hazards.push({
    x:clamp(foe.x+dx,26,W-26),y:clamp(foe.y+dy,28,H-28),r:31,life:this.elapsed+230,damage:foe.damage+5,color:0xc8b46e,
   })
   if(b.floor===2&&phase===2) for(let i=0;i<16;i++)this.projectile(foe.x,foe.y,angle+.2+i*Math.PI/8,126,480,foe.damage,false,{fire:1})
   if(b.floor===0) for(const dy of [-36,36]){
    const x=clamp(foe.x-Math.cos(angle)*57,42,W-42)
    const y=clamp(foe.y-Math.sin(angle)*57+dy,42,H-42)
    if(Math.hypot(p.x-x,p.y-y)>46)this.spawn(x,y,0)
   }
  }
  const bossPatterns=[[3,2,5,0],[4,2,4,5],[3,5,2,5]]
  const cycle=foe.boss?bossPatterns[b.floor]:[foe.kind,foe.kind===3?2:3,foe.kind===5?4:5]
  const pattern=foe.large?cycle[(foe.attacks+phase)%cycle.length]:foe.role==='melee'?0:foe.role==='ranged'?1:foe.kind
  const reach=pattern===0?(foe.large?48:encounters.meleeReach):pattern===3?(foe.large?126:101):foe.large?300:foe.role==='ranged'?235:275
  const inRange=range<reach
  const meleeMinion=!foe.large&&(pattern===0||pattern===3)
  const ready=meleeMinion?this.meleeReady(foe,inRange):inRange
  if(ready&&this.elapsed>=foe.next){
   foe.meleeInRangeSince=undefined
   foe.angle=angle
   const cooldown=foe.large?enemyTiming.bossCooldown:foe.role==='melee'?enemyTiming.meleeCooldown:foe.role==='ranged'?enemyTiming.rangedCooldown:enemyTiming.specialCooldown
   foe.next=this.elapsed+(cooldown*(foe.elite?.8:1)-phase*160)/(foe.large?1:regularAttackRate)
   foe.strike=this.elapsed+160
   foe.attacks++
   const color=foe.effect?effectColor[foe.effect]:tones[foe.kind]
   if(pattern===0||pattern===3) {
    const distance=pattern===3?Math.min(foe.large?85:69,Math.max(0,range-12)):0
    foe.x=clamp(foe.x+Math.cos(foe.angle)*distance,26,W-26)
    foe.y=clamp(foe.y+Math.sin(foe.angle)*distance,28,H-28)
    const reach=foe.large?48:encounters.meleeReach
    this.flash(foe.x,foe.y,reach,color,foe.angle)
    const impactAngle=Math.atan2(p.y-foe.y,p.x-foe.x)
    if(Phaser.Math.Distance.Between(p.x,p.y,foe.x,foe.y)<reach&&Math.abs(Phaser.Math.Angle.Wrap(impactAngle-foe.angle))<1.3)this.hitPlayer(foe.damage)
    if(b.paused)return
   } else if(pattern===4) {
    const count=foe.large?3+phase:1
    const aim={x:p.x,y:p.y}
    for(let i=0;i<count;i++)this.queue(foe,i*70,()=>{
     this.hazards.push({x:clamp(aim.x+(i%2?(i+1)*16:-i*13),26,W-26),y:clamp(aim.y+i*12-8,28,H-28),r:foe.large?22:16,life:this.elapsed+700,damage:foe.damage,color})
    })
   } else {
    const radial=pattern===5||pattern===6
    const count=radial?(foe.boss?9+phase*3:foe.large?8:7)+(b.challenge.has('Projectile Storm')?4:0):pattern===2?(foe.large?5:3):1
    const speed=enemyTiming.projectileSpeed+b.floor*12+phase*9
    const bend=foe.role==='ranged'?Phaser.Math.Angle.RotateTo(foe.angle,Math.atan2(p.y+clamp(this.velocity.y*.24,-34,34)-foe.y,p.x+clamp(this.velocity.x*.24,-34,34)-foe.x),.48):foe.angle
    if(radial&&foe.large&&(foe.boss?phase>0:foe.hp<foe.max*.45)&&!foe.echo){
     foe.echo={time:this.elapsed+260,angle:bend+Math.PI/count,count,speed:speed*.84}
    }
    for(let i=0;i<count;i++){
     const direction=bend+(radial?i*Math.PI*2/count:(i-(count-1)/2)*.24)
     this.projectile(foe.x,foe.y,direction,speed,480,foe.damage,false,foe.boss&&b.floor===2?{fire:1}:foe.effect?{[foe.effect]:1}:{})
    }
   }
  }
  const melee=foe.role==='melee'||(!foe.large&&foe.role==='special'&&foe.kind===0)
  const desired=foe.large?40:melee?15:foe.role==='ranged'?112:foe.kind===3?37:98
  if(range>desired||(foe.role==='ranged'&&range>=82)){
   const speed=(foe.large?52:melee?enemyTiming.meleeSpeed:enemyTiming.rangedSpeed)+b.floor*7
   const previous={x:foe.x,y:foe.y}
   const step=speed*(foe.elite?enemyTiming.eliteSpeed:1)*(b.challenge.has('Swift Foes')?1.27:1)*(foe.slow>this.elapsed?1-foe.slowPower:1)*delta
   const strafe=foe.kind%2===0?foe.flank:Math.sin(this.elapsed/450+foe.kind)>0?1:-1
   let approach=angle+(melee&&range>34?foe.flank*.42:0)
   if(foe.role==='ranged'&&range>=82&&range<=desired)approach=angle+strafe*Math.PI/2
   const out=(a:number)=>foe.x+Math.cos(a)*12<25||foe.x+Math.cos(a)*12>W-25||foe.y+Math.sin(a)*12<26||foe.y+Math.sin(a)*12>H-26
   if(out(approach)&&foe.role==='ranged'){
    const side=angle+strafe*Math.PI/2
    approach=out(side)?angle-strafe*Math.PI/2:side
   }
   foe.x+=Math.cos(approach)*step;foe.y+=Math.sin(approach)*step
   for(const other of this.foes){
    if(other===foe||other.hp<=0)continue
    const dx=foe.x-other.x,dy=foe.y-other.y,gap=Math.hypot(dx,dy)
    if(gap>0&&gap<foe.radius+other.radius) {
     foe.x+=dx/gap*delta*26;foe.y+=dy/gap*delta*26
    }
   }
   if(!this.arenaOpen({x:foe.x,y:previous.y},foe.radius))foe.x=previous.x
   if(!this.arenaOpen(foe,foe.radius))foe.y=previous.y
   foe.x=clamp(foe.x,25,W-25);foe.y=clamp(foe.y,26,H-26)
  }
  const scale=foe.boss?2.65:foe.large?1.8:1
  const striking=foe.strike>this.elapsed
  foe.sprite.setScale(scale*(striking?1.16:1),scale*(striking?.88:1))
  foe.sprite.setPosition(foe.x,foe.y).setAlpha(Math.min(1,foe.sprite.alpha+delta*7)).setFlipX(p.x<foe.x)
  if(foe.burn>this.elapsed) this.damage(foe,foe.dot*delta)
 }
 collision(shot:Shot,dt:number,delta:number) {
  const p=this.player
  if(shot.home) {
   const target=this.foes.find(f=>f.hp>0&&!shot.hit.has(f)&&Phaser.Math.Distance.Between(f.x,f.y,shot.x,shot.y)<82*shot.home)
   if(target) {
    const angle=Phaser.Math.Angle.RotateTo(Math.atan2(shot.vy,shot.vx),Math.atan2(target.y-shot.y,target.x-shot.x),delta*4*shot.home)
    const speed=Math.hypot(shot.vx,shot.vy)
    shot.vx=Math.cos(angle)*speed;shot.vy=Math.sin(angle)*speed
   }
  }
  shot.x+=shot.vx*delta;shot.y+=shot.vy*delta;shot.life-=dt
  if(shot.x<19||shot.x>W-19||shot.y<19||shot.y>H-19) {
   if(shot.bounce<=0) return false
   if(shot.x<19||shot.x>W-19) shot.vx*=-1
   if(shot.y<19||shot.y>H-19) shot.vy*=-1
   shot.x=clamp(shot.x,19,W-19);shot.y=clamp(shot.y,19,H-19);shot.bounce--
  }
  if(!this.arenaOpen(shot,2))return false
  if(shot.friendly) {
   for(const foe of this.foes) if(foe.hp>0&&!shot.hit.has(foe)&&Phaser.Math.Distance.Between(foe.x,foe.y,shot.x,shot.y)<foe.radius+2) {
    shot.hit.add(foe)
    const spent=shot.volley?.spent.get(foe)??0
    const damage=shot.volley?Math.min(shot.damage,Math.max(0,shot.volley.limit-spent)):shot.damage
    shot.volley?.spent.set(foe,spent+damage)
    const affected=shot.volley?.affected??new Set<Foe>()
    affected.add(foe)
    if(damage>0)this.damage(foe,damage,spent?{}:shot.effects,affected)
    if(!spent&&shot.effects.fire&&this.bridge.relicLevel('Cinder Heart')===3) for(const target of this.foes){
     if(target.hp<=0||affected.has(target)||Math.hypot(target.x-foe.x,target.y-foe.y)>=30*this.bridge.power)continue
     affected.add(target)
     this.damage(target,damage*.35*this.bridge.power,{fire:this.bridge.power})
    }
    if(shot.pierce--<=0) return false
   }
  } else if(Phaser.Math.Distance.Between(p.x,p.y,shot.x,shot.y)<9) {this.hitPlayer(shot.damage);return false}
  return shot.life>0
 }
 hitPlayer(amount:number,environmental=false) {
  if(this.elapsed<this.invulnerable||this.bridge.hp<=0) return
  this.invulnerable=this.elapsed+630
  this.bridge.hurt(amount*(environmental?1:encounters.enemyDamageMultiplier))
  this.flash(this.player.x,this.player.y,16,0xe57c82)
 }
 renderFX(dt:number) {
  const g=this.fx.clear()
  for(const h of this.hazards) {
   if(this.elapsed>=h.life)continue
   g.fillStyle(h.color,.25).fillCircle(h.x,h.y,h.r)
   g.lineStyle(1,h.color,.7).strokeCircle(h.x,h.y,h.r)
  }
  for(const f of this.foes) if(f.hp>0){
   const warning=f.miniWarning
   if(warning){
    g.lineStyle(2,0xff735b,.9)
    if(warning.attack==='eruption'){
     g.fillStyle(0xf45c4c,.22).fillCircle(warning.aim.x,warning.aim.y,25+f.phase*3)
     g.strokeCircle(warning.aim.x,warning.aim.y,25+f.phase*3)
    }else if(['phase','spin','slam','spiral','summon'].includes(warning.attack)){
     g.strokeCircle(f.x,f.y,f.radius+9)
    }else{
     const length=Math.min(135,Math.hypot(warning.aim.x-f.x,warning.aim.y-f.y))
     g.lineBetween(f.x,f.y,f.x+Math.cos(warning.angle)*length,f.y+Math.sin(warning.angle)*length)
    }
   }
   if(f.elite) g.lineStyle(1,0xfad78a,.7).strokeEllipse(f.x,f.y+8,24,11)
   if(!f.large&&f.hp<f.max) g.fillStyle(0x382934).fillRect(f.x-9,f.y-15,18,2).fillStyle(0xdb8180).fillRect(f.x-9,f.y-15,18*f.hp/f.max,2)
  }
  for(const shot of this.shots) {
   const effect=Object.keys(shot.effects)[0] as Effect|undefined
   const color=effect?effectColor[effect]:shot.friendly?0xf7e3ad:0xf188a7
   g.lineStyle(1,color,.55).lineBetween(shot.x,shot.y,shot.x-shot.vx*.024,shot.y-shot.vy*.024)
   if(shot.crescent)g.lineStyle(3,color,.9).beginPath().arc(shot.x,shot.y,11,Math.atan2(shot.vy,shot.vx)-1.1,Math.atan2(shot.vy,shot.vx)+1.1).strokePath()
   else g.fillStyle(color).fillRect(shot.x-1,shot.y-1,3,3)
  }
  for(const d of this.drops) g.fillStyle(0x71bf9c).fillRect(d.x-3,d.y-4,6,8).fillStyle(0xe3f0ca).fillRect(d.x-1,d.y-3,2,4)
  for(const f of this.flashes) {
   const progress=f.life/f.max
   g.lineStyle(2,f.color,progress)
   if(f.angle!==undefined){g.beginPath().arc(f.x,f.y,f.r,f.angle-.82,f.angle+.82).strokePath()}
   else g.strokeCircle(f.x,f.y,f.r*(1.05-progress*.5))
   f.life-=dt
  }
  this.flashes=this.flashes.filter(f=>f.life>0)
 }
 update(_time:number, dt:number) {
  const b=this.bridge
  if(!b||b.paused||this.mode==='cover') return
  dt=Math.min(35,dt)
  this.elapsed+=dt
  const delta=dt/1000
  if(this.mode==='castle'){this.walkCastle(delta);return}
  this.move(delta)
  if(b.paused||this.mode!=='run') return
  b.gainCharge('time',delta)
  const due=this.pending.filter(action=>action.owner.hp>0&&action.time<=this.elapsed)
  this.pending=this.pending.filter(action=>action.owner.hp>0&&action.time>this.elapsed)
  for(const action of due){action.execute();if(b.paused||this.mode!=='run')return}
  for(const foe of [...this.foes]){
   if(foe.hp>0)this.enemy(foe,delta)
   if(b.paused||this.mode!=='run')return
  }
  this.shots=this.shots.filter(shot=>this.collision(shot,dt,delta))
  this.hazards=this.hazards.filter(h=>h.life>this.elapsed)
  for(const h of this.hazards) if(Phaser.Math.Distance.Between(h.x,h.y,this.player.x,this.player.y)<h.r) this.hitPlayer(h.damage,h.environmental)
  if(b.paused||this.mode!=='run') return
  this.drops=this.drops.filter(d=>{
   if(Phaser.Math.Distance.Between(d.x,d.y,this.player.x,this.player.y)>12||b.hp>=b.maxHP) return true
   const rewards=b.room.healingRewards
   const savedIndex=rewards?.indexOf(d)??-1
   if(savedIndex>=0)rewards?.splice(savedIndex,1)
   b.heal(d.amount);return false
  })
  this.foes=this.foes.filter(f=>f.hp>0)
  if(this.locked&&this.foes.length===0) {
   if(this.wave<this.totalWaves){
    this.shots=this.shots.filter(shot=>shot.friendly)
    this.hazards=this.hazards.filter(hazard=>hazard.environmental)
    this.pending=[]
    this.spawnWave()
   }else{
    this.locked=false;this.shots=[];this.hazards=[];this.pending=[];this.drawRoom()
    b.clear()
   }
  }
  this.renderFX(dt)
  if(this.elapsed>=this.hudTimer){this.hudTimer=this.elapsed+100;b.refresh()}
 }
}
