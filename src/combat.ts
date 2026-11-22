import Phaser from 'phaser'
import { arena, cover, H, textures, tones, W } from './art'
import { type Effect, type Relic, type Weapon } from './data'
import { floors, type Room } from './dungeon'

const clamp = Phaser.Math.Clamp
const weaponRelicSynergies=[
 {weapon:'Cinder Hammer',relic:'Cinder Heart',level:2,contract:'',result:'blast'},
 {weapon:'',relic:'',level:0,contract:'Ashen Bargain',result:'blast'},
 {weapon:'Storm Staff',relic:'Forked Bolt',level:2,contract:'',result:'split'},
 {weapon:'Night Knives',relic:'Dusk Crown',level:1,contract:'Broken Shield',result:'pierce'},
] as const
const effectColor:Record<Effect,number> = {fire:0xff9167,poison:0x9bda85,frost:0x9bddff,lightning:0xffdc77,shadow:0xd29bf5}
type Point = {x:number;y:number}
type Shot = Point & {vx:number;vy:number;life:number;damage:number;friendly:boolean;effects:Effect[];pierce:number;bounce:number;home:boolean;hit:Set<Foe>}
type Foe = Point & {sprite:Phaser.GameObjects.Image; hp:number;max:number;kind:number;elite:boolean;effect?:Effect;large:boolean;boss:boolean;next:number;warn:number;angle:number;slow:number;burn:number;dot:number;phase:number;radius:number;damage:number}
type Hazard = Point & {r:number;warn:number;life:number;damage:number;color:number}
type Flash = Point & {life:number;max:number;color:number;angle?:number;r:number}
export interface CombatBridge {
 slot:0|1; loadout:[Weapon,Weapon]; paused:boolean; floor:number; room:Room; rooms:Room[]; hp:number; maxHP:number;
 active?:Relic; charge:number; challenge:Set<string>;
 level(name:string):number; has(name:string):boolean; curse(name:string):boolean; blessed(name:string):boolean;
 consumeDodgeDraught():boolean; attackPower(damage:number):number; hurt(damage:number):void; heal(amount:number):void; gainCharge(type:string, amount:number):void;
 killed(elite:boolean, large:boolean):void; clear():void; enter(id:number, dx:number,dy:number):void; interact():void; sound(frequency:number):void;
 refresh():void;
}
export class Combat extends Phaser.Scene {
 bridge!:CombatBridge
 player!:Phaser.GameObjects.Image
 backdrop!:Phaser.GameObjects.Graphics
 fx!:Phaser.GameObjects.Graphics
 keys!:Record<string,Phaser.Input.Keyboard.Key>
 mode='cover'
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
  this.input.on('wheel',()=>{if(this.mode==='run'&&!this.bridge.paused){this.bridge.slot=this.bridge.slot===0?1:0;this.bridge.refresh()}})
  this.showCover()
 }
 showCover() {
  this.mode='cover'; this.reset()
  this.player.setPosition(415,218).setScale(2.9).setVisible(true).clearTint().setAlpha(1)
  cover(this.backdrop.clear())
 }
 reset() {
  this.foes.forEach(foe=>foe.sprite.destroy())
  this.foes=[]; this.shots=[]; this.hazards=[]; this.flashes=[]; this.drops=[]
  this.fx.clear()
 }
 showRoom(dx=0,dy=0) {
  this.mode='run'; this.reset()
  const { room, floor, challenge }=this.bridge
  this.player.setScale(1).setPosition(dx>0?35:dx<0?W-35:W/2,dy>0?37:dy<0?H-37:H/2).setVisible(true).clearTint()
  this.attackQueued=false;this.rollQueued=false;this.relicQueued=false
  this.rollUntil=0; this.invulnerable=this.elapsed+280
  this.locked=!room.cleared&&['Combat','Miniboss','Boss'].includes(room.kind)
  const metadata=floors[floor]
  this.bossName=room.kind==='Boss'?metadata.boss:room.kind==='Miniboss'?metadata.minis[room.patch]:''
  if (this.locked) {
   if(this.bossName) this.spawn(W*.69,H*.49,(floor*2+room.patch)%7,room.kind==='Boss',true)
   else for(let i=0;i<4+floor;i++){
    const x=i%2===0?104+i*15:414-i*13
    const y=i%3===0?75:i%3===1?205:107
    this.spawn(x,y,(floor*2+room.patch+i)%7)
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
 spawn(x:number,y:number,kind:number,boss=false,large=false) {
  const {floor,challenge}=this.bridge
  const elite=!large&&Math.random()<(challenge.has('Elite Host')?.42:.09+floor*.04)
  const elements:Effect[]=['fire','poison','frost','lightning','shadow']
  const effect=!large&&Math.random()<.19?elements[(kind+floor)%elements.length]:undefined
  const max=(boss?420+floor*180:large?160+floor*95:36+floor*19)*(elite?1.65:1)*(large&&challenge.has('Iron Bosses')?1.45:1)
  const sprite=this.add.image(x,y,boss?'boss'+floor:'foe'+kind).setScale(boss?2.65:large?1.8:1).setDepth(3)
  if(effect) sprite.setTint(effectColor[effect])
  if(elite&&!effect) sprite.setTint(0xf2d393)
  this.foes.push({x,y,sprite,kind,boss,large,elite,effect,max,hp:max,next:this.elapsed+750+Math.random()*400,warn:0,angle:0,slow:0,burn:0,dot:0,phase:0,radius:boss?21:large?15:8,damage:(large?12:8)+floor*3+(elite?5:0)+(effect?2:0)})
 }
 flash(x:number,y:number,r:number,color:number,angle?:number) {
  if(this.flashes.length<90) this.flashes.push({x,y,r,color,angle,life:180,max:180})
 }
 damage(foe:Foe,amount:number,effects:Effect[]=[]) {
  if(foe.hp<=0) return
  const b=this.bridge
  foe.hp-=amount
  b.gainCharge('damage',amount)
  foe.sprite.setAlpha(.55)
  this.flash(foe.x,foe.y,8,effects[0]?effectColor[effects[0]]:0xf7ddac)
  if(effects.includes('fire')||effects.includes('poison')) {
   const level=Math.max(effects.includes('fire')?b.level('Cinder Heart'):0,effects.includes('poison')?b.level('Bog Idol'):0)
   foe.burn=this.elapsed+1300+level*200
   foe.dot=Math.max(foe.dot,amount*(.075+level*.035))
  }
  if(effects.includes('frost')||(effects.includes('poison')&&b.level('Bog Idol')===3)) foe.slow=this.elapsed+700+b.level('Rime Seal')*220
  if(effects.includes('lightning')) {
   const target=this.foes.find(other=>other!==foe&&other.hp>0&&Phaser.Math.Distance.Between(other.x,other.y,foe.x,foe.y)<53)
   if(target) this.damage(target,amount*.28,[])
  }
  if(foe.hp>0) return
  foe.sprite.destroy()
  this.flash(foe.x,foe.y,foe.radius*2,0xeeb184)
  b.killed(foe.elite,foe.large)
  b.gainCharge('kills',1)
  if(b.level('Dusk Crown')===3) b.heal(2)
  if(!foe.large&&Math.random()<.16) this.drops.push({x:foe.x,y:foe.y,amount:Math.random()<.22?35:15})
 }
 projectile(x:number,y:number,angle:number,speed:number,range:number,damage:number,friendly:boolean,effects:Effect[]=[],pierce=0,bounce=0,home=false) {
  if(this.shots.length>=220) return
  this.shots.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:range/speed*1000,damage,friendly,effects,pierce,bounce,home,hit:new Set()})
 }
 attack(angle:number) {
  const b=this.bridge, weapon=b.loadout[b.slot],p=this.player
  this.nextAttack=this.elapsed+weapon.delay
  const effects=new Set<Effect>()
  if(weapon.effect) effects.add(weapon.effect)
  const relicEffects:[string,Effect][]=[['Cinder Heart','fire'],['Bog Idol','poison'],['Rime Seal','frost'],['Forked Bolt','lightning'],['Dusk Crown','shadow']]
  for(const [name,effect] of relicEffects) if(b.has(name)) effects.add(effect)
  const elemental=[...effects]
  const synergies=weaponRelicSynergies.filter(rule=>
   (!rule.weapon||rule.weapon===weapon.name)&&(!rule.relic||b.level(rule.relic)>=rule.level)&&(!rule.contract||b.blessed(rule.contract)))
  const combo=(result:string)=>synergies.some(rule=>rule.result===result)
  const amount=b.attackPower(weapon.damage)*(b.level('Rime Seal')===3?1.16:1)*(b.level('Dusk Crown')?1+.09*b.level('Dusk Crown'):1)
  if(b.slot===0) {
   const burst=combo('blast')
   const range=weapon.range+(burst?15:0)
   this.flash(p.x,p.y,range,burst?effectColor.fire:0xf6d5a5,angle)
   for(const foe of this.foes) {
    const distance=Phaser.Math.Distance.Between(p.x,p.y,foe.x,foe.y)
    if(distance<range+foe.radius&&(distance<19||Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(foe.y-p.y,foe.x-p.x)-angle))<1.03||burst)) this.damage(foe,amount,elemental)
   }
  } else {
   const forks=b.level('Forked Bolt')
   const mirror=b.level('Mirror Quiver')
   const pierce=(forks===3?2:0)+(b.blessed('Broken Shield')&&effects.has('shadow')?2:0)+(combo('pierce')?2:0)
   for(const offset of combo('split')?[-.34,-.17,0,.17,.34]:forks>=2?[-.2,0,.2]:forks===1?[-.1,.1]:[0]) this.projectile(p.x,p.y,angle+offset,225,weapon.range+mirror*45,amount*(forks?.78:1),true,elemental,pierce,mirror?2:0,mirror===3)
  }
  b.sound(b.slot===0?170:285)
 }
 activate() {
  const b=this.bridge, relic=b.active
  if(!relic?.cap||b.charge<relic.cap) return
  const level=b.level(relic.name)
  b.charge=0
  this.flash(this.player.x,this.player.y,140,0xd9b4fc)
  if(relic.name==='Blood Chalice') b.heal(22+level*7)
  if(relic.name==='Grave Lantern'||(relic.name==='Blood Chalice'&&level===3)) this.invulnerable=this.elapsed+650+level*520
  if(relic.name==='Sun Bell'||relic.name==='Thunder Rune'||(relic.name==='Grave Lantern'&&level===3)) for(const foe of this.foes) {
   if(relic.name!=='Sun Bell'||Phaser.Math.Distance.Between(foe.x,foe.y,this.player.x,this.player.y)<140) this.damage(foe,27+level*14,relic.name==='Thunder Rune'?(level===3?['lightning','frost']:['lightning']):['fire'])
  }
  if(relic.name==='Sun Bell'&&level===3) b.heal(12)
  b.sound(500)
 }
 move(delta:number) {
  const b=this.bridge,k=this.keys,p=this.player
  const x=Number(k.D.isDown)-Number(k.A.isDown),y=Number(k.S.isDown)-Number(k.W.isDown)
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
  if(phase>foe.phase) {
   foe.phase=phase
   this.flash(foe.x,foe.y,65,0xda94e1)
   this.hazards.push({x:foe.x,y:foe.y,r:48,warn:this.elapsed+620,life:this.elapsed+840,damage:foe.damage,color:0xf0a279})
   if(b.floor===1) for(const [dx,dy] of [[-60,0],[60,0],[0,-51],[0,51]]) this.hazards.push({
    x:clamp(foe.x+dx,26,W-26),y:clamp(foe.y+dy,28,H-28),r:31,warn:this.elapsed+780,life:this.elapsed+1010,damage:foe.damage+5,color:0xc8b46e,
   })
   if(b.floor===2&&phase===2) for(let i=0;i<16;i++) this.projectile(foe.x,foe.y,i*Math.PI/8,106,500,foe.damage,false,['fire'])
   if(b.floor===0) for(const dy of [-27,27]) this.spawn(foe.x,clamp(foe.y+dy,35,H-35),0)
  }
  if(foe.warn&&this.elapsed>=foe.warn) {
   foe.warn=0
   foe.next=this.elapsed+(foe.large?1250:1480)-phase*210
   const bossPatterns=[[0,2,5],[4,2,4],[3,2,5]]
   const pattern=foe.boss?bossPatterns[b.floor][(Math.floor(this.elapsed/1050)+phase)%3]:foe.kind
   const color=foe.effect?effectColor[foe.effect]:tones[foe.kind]
   if(pattern===0||pattern===3) {
    const distance=pattern===3?Math.min(84,range):0
    foe.x=clamp(foe.x+Math.cos(foe.angle)*distance,26,W-26)
    foe.y=clamp(foe.y+Math.sin(foe.angle)*distance,28,H-28)
    this.hazards.push({x:foe.x,y:foe.y,r:foe.large?48:21,warn:this.elapsed,life:this.elapsed+140,damage:foe.damage,color})
   } else if(pattern===4) {
    const count=foe.large?3+phase:1
    for(let i=0;i<count;i++) this.hazards.push({x:clamp(p.x+(i%2?(i+1)*16:-i*13),26,W-26),y:clamp(p.y+i*12-8,28,H-28),r:foe.large?22:16,warn:this.elapsed+420+i*70,life:this.elapsed+1120+i*70,damage:foe.damage,color})
   } else {
    const radial=pattern===5||pattern===6||(foe.boss&&phase>0)
    const count=radial?7+phase*4+(b.challenge.has('Projectile Storm')?4:0):pattern===2?3:1
    for(let i=0;i<count;i++){
     const direction=foe.angle+(radial?i*Math.PI*2/count:(i-(count-1)/2)*.24)
     this.projectile(foe.x,foe.y,direction,84+b.floor*12+phase*9,480,foe.damage,false,foe.boss&&b.floor===2?['fire']:foe.effect?[foe.effect]:[])
    }
   }
  } else if(!foe.warn&&this.elapsed>=foe.next&&range<(foe.kind===0&&!foe.large?33:foe.kind===3&&!foe.large?100:300)) {
   foe.warn=this.elapsed+(foe.large?560:470)-phase*70
   foe.angle=angle
  }
  if(!foe.warn&&range>(foe.large?62:foe.kind===0?20:foe.kind===3?37:98)){
   const speed=(foe.large?31:45+b.floor*7)*(b.challenge.has('Swift Foes')?1.27:1)*(foe.slow>this.elapsed?.52:1)*delta
   foe.x+=Math.cos(angle)*speed;foe.y+=Math.sin(angle)*speed
   for(const other of this.foes){
    if(other===foe||other.hp<=0)continue
    const dx=foe.x-other.x,dy=foe.y-other.y,gap=Math.hypot(dx,dy)
    if(gap>0&&gap<foe.radius+other.radius) {
     foe.x+=dx/gap*delta*26;foe.y+=dy/gap*delta*26
    }
   }
   foe.x=clamp(foe.x,25,W-25);foe.y=clamp(foe.y,26,H-26)
  }
  foe.sprite.setPosition(foe.x,foe.y).setAlpha(Math.min(1,foe.sprite.alpha+delta*7)).setFlipX(p.x<foe.x)
  if(foe.burn>this.elapsed) this.damage(foe,foe.dot*delta)
 }
 collision(shot:Shot,dt:number,delta:number) {
  const p=this.player
  if(shot.home) {
   const target=this.foes.find(f=>f.hp>0&&!shot.hit.has(f)&&Phaser.Math.Distance.Between(f.x,f.y,shot.x,shot.y)<82)
   if(target) {
    const angle=Phaser.Math.Angle.RotateTo(Math.atan2(shot.vy,shot.vx),Math.atan2(target.y-shot.y,target.x-shot.x),delta*4)
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
    if(shot.effects.includes('fire')&&this.bridge.level('Cinder Heart')===3) for(const target of this.foes) if(target!==foe&&Phaser.Math.Distance.Between(target.x,target.y,foe.x,foe.y)<30) this.damage(target,shot.damage*.35,['fire'])
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
   if(f.warn) {
    const endX=f.x+Math.cos(f.angle)*(f.kind===3?82:29),endY=f.y+Math.sin(f.angle)*(f.kind===3?82:29)
    g.lineStyle(2,0xf6ac78,.8).lineBetween(f.x,f.y,endX,endY).strokeCircle(f.x,f.y,f.radius+4)
   }
   if(f.elite) g.lineStyle(1,0xfad78a,.7).strokeEllipse(f.x,f.y+8,24,11)
   if(!f.large&&f.hp<f.max) g.fillStyle(0x382934).fillRect(f.x-9,f.y-15,18,2).fillStyle(0xdb8180).fillRect(f.x-9,f.y-15,18*f.hp/f.max,2)
  }
  for(const shot of this.shots) {
   const color=shot.effects[0]?effectColor[shot.effects[0]]:shot.friendly?0xf7e3ad:0xf188a7
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
  if(this.mode!=='run'||!b||b.paused) return
  dt=Math.min(35,dt)
  this.elapsed+=dt
  const delta=dt/1000
  this.move(delta)
  if(b.paused||this.mode!=='run') return
  b.gainCharge('time',delta)
  for(const foe of [...this.foes]) if(foe.hp>0) this.enemy(foe,delta)
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
