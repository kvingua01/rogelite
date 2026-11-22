import Phaser from 'phaser'
import { arena, cover, H, textures, tones, W } from './art'
import { type Effect, type Relic, type Weapon } from './data'
import { floors, type Room } from './dungeon'
import { encounters, enemyTiming } from './balance'
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
type Shot = Point & {vx:number;vy:number;life:number;damage:number;friendly:boolean;effects:Effects;pierce:number;bounce:number;home:number;hit:Set<Foe>}
type Foe = Point & {sprite:Phaser.GameObjects.Image; hp:number;max:number;kind:number;elite:boolean;effect?:Effect;large:boolean;boss:boolean;next:number;warn:number;angle:number;slow:number;slowPower:number;burn:number;dot:number;phase:number;role:'melee'|'ranged'|'special';flank:number;strike:number;attacks:number;pattern:number;echo:{time:number;angle:number;count:number;speed:number}|null;radius:number;damage:number}
type Hazard = Point & {r:number;warn:number;life:number;damage:number;color:number}
type Flash = Point & {life:number;max:number;color:number;angle?:number;r:number}
export interface CombatBridge {
 slot:0|1; loadout:[Weapon,Weapon|null]; paused:boolean; floor:number; room:Room; rooms:Room[]; hp:number; maxHP:number;
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
 flashes:Flash[]=[]
 drops:(Point & {amount:number})[]=[]
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
  this.foes=[]; this.shots=[]; this.hazards=[]; this.flashes=[]; this.drops=[]
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
   if(this.bossName) this.spawn(W*.69,H*.49,(floor*2+room.patch)%7,room.kind==='Boss',true)
   else {
    const count=encounters.enemies[floor]
    let specials=0
    for(let i=0;i<count;i++){
     const angle=(i+.3)*Math.PI*2/count
     let x=W/2+Math.cos(angle)*151
     let y=H/2+Math.sin(angle)*89
     if(Math.hypot(x-this.player.x,y-this.player.y)<76){
      const choices=[{x:87,y:101},{x:171,y:69},{x:247,y:125},{x:420,y:186},{x:335,y:218}]
      const safe=choices.find(p=>Math.hypot(p.x-this.player.x,p.y-this.player.y)>=76&&this.foes.every(f=>Math.hypot(f.x-p.x,f.y-p.y)>33))
      if(safe){x=safe.x;y=safe.y}
     }
     const foe=this.spawn(x,y,(floor*2+room.patch+i)%7,false,false,specials<count-2)
     if(foe.role==='special')specials++
    }
    const basic=this.foes.filter(foe=>foe.role!=='special')
    const meleeCount=Math.round(basic.length*encounters.meleeShare[room.patch])
    const offset=Math.floor(Math.random()*basic.length)
    basic.forEach((foe,index)=>{foe.role=(index+offset)%basic.length<meleeCount?'melee':'ranged'})
   }
  }
  if ((room.kind==='Trap' || (this.locked && (floor>0 || challenge.has('Scorched Ground')))) && !room.cleared) {
   const color=[0xbd7f82,0x9dc67b,0xff9960][floor]
   for(let i=0;i<(room.kind==='Trap'?6:2);i++) this.hazards.push({x:111+i%3*145,y:90+Math.floor(i/3)*110,r:13+(i%3)*3,warn:this.elapsed+600,life:Infinity,damage:11+floor*2,color})
  }
  this.drawRoom()
 }
 drawRoom() {
  const {room,floor,rooms}=this.bridge
  const g=this.backdrop.clear()
  arena(g,floors[floor].palettes[room.patch],floor,room.id)
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
  const elite=!large&&allowSpecial&&Math.random()<(challenge.has('Elite Host')?.42:encounters.eliteShare+floor*.035)
  const elements:Effect[]=['fire','poison','frost','lightning','shadow']
  const effect=!large&&allowSpecial&&Math.random()<.19?elements[(kind+floor)%elements.length]:undefined
  const role=large||elite||effect||(allowSpecial&&kind>=2&&Math.random()<encounters.specialShare)?'special':'melee'
  const max=(boss?encounters.bossHealth[floor]:large?encounters.minibossHealth[floor]:Math.round(encounters.basicHealth[floor]*[1.16,.85,.94,1.11,1,.89,.96][kind]))*(elite?1.8:1)*(large&&challenge.has('Iron Bosses')?1.45:1)
  const sprite=this.add.image(x,y,boss?'boss'+floor:'foe'+kind).setScale(boss?2.65:large?1.8:1).setDepth(3)
  if(effect) sprite.setTint(effectColor[effect])
  if(elite&&!effect) sprite.setTint(0xf2d393)
  const foe:Foe={x,y,sprite,kind,boss,large,elite,effect,max,hp:max,next:this.elapsed+450+Math.random()*350,warn:0,angle:0,slow:0,slowPower:0,burn:0,dot:0,phase:0,role,flank:(this.foes.length%2?1:-1),strike:0,attacks:0,pattern:0,echo:null,radius:boss?21:large?15:8,damage:(boss?encounters.bossDamage[floor]:large?encounters.minibossDamage[floor]:encounters.basicDamage[floor]+kind%3)+(elite?encounters.eliteBonusDamage:0)+(effect?2:0)}
  this.foes.push(foe)
  return foe
 }
 flash(x:number,y:number,r:number,color:number,angle?:number) {
  if(this.flashes.length<90) this.flashes.push({x,y,r,color,angle,life:180,max:180})
 }
 damage(foe:Foe,amount:number,effects:Effects={}) {
  if(foe.hp<=0) return
  const b=this.bridge
  foe.hp-=amount
  b.gainCharge('damage',amount)
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
   const target=this.foes.find(other=>other!==foe&&other.hp>0&&Phaser.Math.Distance.Between(other.x,other.y,foe.x,foe.y)<53*lightning)
   if(target) this.damage(target,amount*.28*lightning)
  }
  if(foe.hp>0) return
  foe.sprite.destroy()
  this.flash(foe.x,foe.y,foe.radius*2,0xeeb184)
  b.killed(foe.elite,foe.large)
  b.gainCharge('kills',1)
  if(b.relicLevel('Dusk Crown')===3) b.heal(duskHeal*b.power)
  if(!foe.large&&Math.random()<encounters.healChance) this.drops.push({x:foe.x,y:foe.y,amount:Math.random()<encounters.largeHealChance?35:15})
 }
 projectile(x:number,y:number,angle:number,speed:number,range:number,damage:number,friendly:boolean,effects:Effects={},pierce=0,bounce=0,home=0) {
  if(this.shots.length>=220) return
  this.shots.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:range/speed*1000,damage,friendly,effects,pierce,bounce,home,hit:new Set()})
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
   for(const foe of this.foes) {
    const distance=Phaser.Math.Distance.Between(p.x,p.y,foe.x,foe.y)
    if(distance<range+foe.radius&&(distance<19||Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(foe.y-p.y,foe.x-p.x)-angle))<1.03||burst)) this.damage(foe,amount,elements)
   }
  } else {
   const forks=b.relicLevel('Forked Bolt')
   const mirror=b.relicLevel('Mirror Quiver')
   const pierce=Math.round(((forks===3?2:0)+(combo('pierce')?2:0))*b.power)+(b.blessed('Broken Shield')&&elements.shadow?2:0)
   this.projectile(p.x,p.y,angle,225,weapon.range+mirrorRange(mirror)*b.power,amount,true,elements,pierce,mirror?Math.round(2*b.power):0,mirror===3?b.power:0)
   const spread=combo('split')?[-.34,-.17,.17,.34]:forks>=2?[-.2,.2]:forks===1?[.17]:[]
   for(const offset of spread) this.projectile(p.x,p.y,angle+offset,225,weapon.range+mirrorRange(mirror)*b.power,amount*.78*b.power,true,elements,pierce,mirror?Math.round(2*b.power):0,mirror===3?b.power:0)
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
 enemy(foe:Foe,delta:number) {
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
   this.flash(foe.x,foe.y,65,0xda94e1)
   this.hazards.push({x:foe.x,y:foe.y,r:48,warn:this.elapsed+620,life:this.elapsed+840,damage:foe.damage,color:0xf0a279})
   if(b.floor===1) for(const [dx,dy] of [[-60,0],[60,0],[0,-51],[0,51]]) this.hazards.push({
    x:clamp(foe.x+dx,26,W-26),y:clamp(foe.y+dy,28,H-28),r:31,warn:this.elapsed+780,life:this.elapsed+1010,damage:foe.damage+5,color:0xc8b46e,
   })
   if(b.floor===2&&phase===2) foe.echo={time:this.elapsed+760,angle:angle+.2,count:16,speed:126}
   if(b.floor===0) for(const dy of [-36,36]){
    const x=clamp(foe.x-Math.cos(angle)*57,42,W-42)
    const y=clamp(foe.y-Math.sin(angle)*57+dy,42,H-42)
    if(Math.hypot(p.x-x,p.y-y)>46)this.spawn(x,y,0)
   }
  }
  if(foe.warn&&this.elapsed>=foe.warn) {
   foe.warn=0
   const cooldown=foe.large?enemyTiming.bossCooldown:foe.role==='melee'?enemyTiming.meleeCooldown:foe.role==='ranged'?enemyTiming.rangedCooldown:enemyTiming.specialCooldown
   foe.next=this.elapsed+cooldown*(foe.elite?.8:1)-phase*160
   foe.strike=this.elapsed+160
   const pattern=foe.pattern
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
    for(let i=0;i<count;i++) this.hazards.push({x:clamp(p.x+(i%2?(i+1)*16:-i*13),26,W-26),y:clamp(p.y+i*12-8,28,H-28),r:foe.large?22:16,warn:this.elapsed+420+i*70,life:this.elapsed+1120+i*70,damage:foe.damage,color})
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
  } else if(!foe.warn&&this.elapsed>=foe.next) {
   const bossPatterns=[[3,2,5,0],[4,2,4,5],[3,5,2,5]]
   const cycle=foe.boss?bossPatterns[b.floor]:[foe.kind,foe.kind===3?2:3,foe.kind===5?4:5]
   const pattern=foe.large?cycle[(foe.attacks+phase)%cycle.length]:foe.role==='melee'?0:foe.role==='ranged'?1:foe.kind
   const reach=pattern===0?(foe.large?52:encounters.meleeReach+2):pattern===3?(foe.large?126:101):foe.large?300:foe.role==='ranged'?235:275
   if(range<reach){
    const windup=foe.large?enemyTiming.bossWindup:foe.role==='melee'?enemyTiming.meleeWindup:foe.role==='ranged'?enemyTiming.rangedWindup:enemyTiming.specialWindup
    foe.warn=this.elapsed+windup-phase*65
    foe.angle=angle
    foe.pattern=pattern
   }
  }
  const melee=foe.role==='melee'||(!foe.large&&foe.role==='special'&&foe.kind===0)
  const desired=foe.large?40:melee?15:foe.role==='ranged'?112:foe.kind===3?37:98
  const retreat=foe.role==='ranged'&&range<82
  if(!foe.warn&&(range>desired||retreat||(foe.role==='ranged'&&range>=82))){
   const speed=(foe.large?52:melee?enemyTiming.meleeSpeed:enemyTiming.rangedSpeed)+b.floor*7
   const step=speed*(foe.elite?enemyTiming.eliteSpeed:1)*(b.challenge.has('Swift Foes')?1.27:1)*(foe.slow>this.elapsed?1-foe.slowPower:1)*delta
   const strafe=foe.kind%2===0?foe.flank:Math.sin(this.elapsed/450+foe.kind)>0?1:-1
   let approach=retreat?angle+Math.PI:angle+(melee&&range>34?foe.flank*.42:0)
   if(foe.role==='ranged'&&range>=82&&range<=desired)approach=angle+strafe*Math.PI/2
   const out=(a:number)=>foe.x+Math.cos(a)*12<25||foe.x+Math.cos(a)*12>W-25||foe.y+Math.sin(a)*12<26||foe.y+Math.sin(a)*12>H-26
   if(out(approach)&&(retreat||foe.role==='ranged')){
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
   foe.x=clamp(foe.x,25,W-25);foe.y=clamp(foe.y,26,H-26)
  }
  const scale=foe.boss?2.65:foe.large?1.8:1
  const windup=foe.warn>0
  const striking=foe.strike>this.elapsed
  foe.sprite.setScale(scale*(striking?1.16:windup?.88:1),scale*(striking?.88:windup?1.12:1))
  foe.sprite.setAngle(windup?(p.x<foe.x?12:-12):striking?(p.x<foe.x?-14:14):0)
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
  if(shot.friendly) {
   for(const foe of this.foes) if(foe.hp>0&&!shot.hit.has(foe)&&Phaser.Math.Distance.Between(foe.x,foe.y,shot.x,shot.y)<foe.radius+2) {
    shot.hit.add(foe);this.damage(foe,shot.damage,shot.effects)
    if(shot.effects.fire&&this.bridge.relicLevel('Cinder Heart')===3) for(const target of this.foes) if(target!==foe&&Phaser.Math.Distance.Between(target.x,target.y,foe.x,foe.y)<30*this.bridge.power) this.damage(target,shot.damage*.35*this.bridge.power,{fire:this.bridge.power})
    if(shot.pierce--<=0) return false
   }
  } else if(Phaser.Math.Distance.Between(p.x,p.y,shot.x,shot.y)<9) {this.hitPlayer(shot.damage);return false}
  return shot.life>0
 }
 hitPlayer(amount:number) {
  if(this.elapsed<this.invulnerable||this.bridge.hp<=0) return
  this.invulnerable=this.elapsed+630
  this.bridge.hurt(amount)
  this.flash(this.player.x,this.player.y,16,0xe57c82)
 }
 renderFX(dt:number) {
  const g=this.fx.clear()
  for(const h of this.hazards) {
   g.fillStyle(h.color,this.elapsed<h.warn?.17:.25).fillCircle(h.x,h.y,h.r)
   g.lineStyle(1,h.color,.7).strokeCircle(h.x,h.y,h.r)
  }
  for(const f of this.foes) if(f.hp>0){
   if(f.elite) g.lineStyle(1,0xfad78a,.7).strokeEllipse(f.x,f.y+8,24,11)
   if(!f.large&&f.hp<f.max) g.fillStyle(0x382934).fillRect(f.x-9,f.y-15,18,2).fillStyle(0xdb8180).fillRect(f.x-9,f.y-15,18*f.hp/f.max,2)
  }
  for(const shot of this.shots) {
   const effect=Object.keys(shot.effects)[0] as Effect|undefined
   const color=effect?effectColor[effect]:shot.friendly?0xf7e3ad:0xf188a7
   g.lineStyle(1,color,.55).lineBetween(shot.x,shot.y,shot.x-shot.vx*.024,shot.y-shot.vy*.024)
   g.fillStyle(color).fillRect(shot.x-1,shot.y-1,3,3)
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
  for(const foe of [...this.foes]){
   if(foe.hp>0)this.enemy(foe,delta)
   if(b.paused||this.mode!=='run')return
  }
  this.shots=this.shots.filter(shot=>this.collision(shot,dt,delta))
  this.hazards=this.hazards.filter(h=>h.life>this.elapsed)
  for(const h of this.hazards) if(h.warn<=this.elapsed&&Phaser.Math.Distance.Between(h.x,h.y,this.player.x,this.player.y)<h.r) this.hitPlayer(h.damage)
  if(b.paused||this.mode!=='run') return
  this.drops=this.drops.filter(d=>{
   if(Phaser.Math.Distance.Between(d.x,d.y,this.player.x,this.player.y)>12||b.hp>=b.maxHP) return true
   b.heal(d.amount);return false
  })
  this.foes=this.foes.filter(f=>f.hp>0)
  if(this.locked&&this.foes.length===0) {
   this.locked=false;this.shots=[];this.hazards=[];this.drawRoom()
   b.clear()
  }
  this.renderFX(dt)
  if(this.elapsed>=this.hudTimer){this.hudTimer=this.elapsed+100;b.refresh()}
 }
}
