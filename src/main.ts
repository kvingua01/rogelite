import Phaser from 'phaser'
import { Combat, type CombatBridge } from './combat'
import { H, W } from './art'
import { challenges, colors, contracts, contractClear, decode, rarity, rangedTraining, unlockRanged, relicLevel, relics, upgradeCost, upgrades, weapons, type Relic, type Save, type Weapon } from './data'
import { floors, generate, sample, type Room } from './dungeon'
import { relicEffect } from './relic-effects'
import { economy, relicPower, relicSlotCount } from './balance'
import { type Building } from './castle'
import './style.css'

const hud=document.querySelector<HTMLElement>('#hud')!
const overlay=document.querySelector<HTMLElement>('#overlay')!
const saveKey='cursed-knight-v1'
const selectWeapon=(name:string)=>weapons.find(w=>w.name===name)!
const numerals=['','I','II','III']
const icons=['♨','☘','❄','ϟ','✧','◇','♛','♬','♦','↯','▣']
const icon=(relic:Relic)=>icons[relics.indexOf(relic)]
const pct=(n:number)=>Math.round(n*100)+'%'
const shuffled=<T,>(items:readonly T[])=>[...items].map(item=>({item,sort:Math.random()})).sort((a,b)=>a.sort-b.sort).map(({item})=>item)
type Handler=()=>void
type Choice={title:string; detail?:string; disabled?:boolean; cost?:number; action:Handler}
let audio:AudioContext|undefined
const bar=(value:number)=><string>`<i style="width:${Math.max(0,Math.min(100,value*100))}%"></i>`

class Game implements CombatBridge {
 save:Save
 scene=new Combat()
 loadout:[Weapon,Weapon|null]=[weapons[0],null]
 carriedWeapons=new Set<Weapon>()
 rooms:Room[]=[]
 room!:Room
 floor=0
 hp=100
 maxHP=100
 slot:0|1=0
 equipped:(Relic|null)[]=Array<Relic|null>(relicSlotCount).fill(null)
 activeCharges=new Map<string,number>()
 levels=new Map<string,number>()
 blessings=new Set<string>()
 challenge=new Set<string>()
 contract?:{name:string;remaining:number}
 paused=true
 menu='main'
 toast=''
 toastTimer=0
 started=0
 earnedGold=0
 earnedMaterials=0
 statsBonus=0
 dodgeDraughts=0
 mandatory=false
 stock=new Map<number,Choice[]>()
 hasSavedGame=false
 castleHUD=''
 constructor(){
  let raw:null|string=null
  try { raw=localStorage.getItem(saveKey) } catch { /* Private browsing can block storage. */ }
  this.save=decode(raw)
  this.hasSavedGame=raw!==null
  this.scene.bridge=this
  new Phaser.Game({type:Phaser.AUTO,parent:'game',width:W,height:H,pixelArt:true,roundPixels:true,backgroundColor:'#201722',scene:[this.scene],input:{keyboard:{capture:[32]}}})
  this.main()
  document.querySelector('#help')!.addEventListener('click',()=>{if(!this.mandatory)this.settings(this.returnAction())})
  window.addEventListener('keydown',event=>{
   if(event.code!=='Escape'&&(event.target instanceof HTMLSelectElement||event.target instanceof HTMLInputElement)) return
   const inRun=this.scene.mode==='run'
   if(event.code==='Escape'||(inRun&&event.code==='Tab'&&(!this.paused||this.menu==='map'))||(inRun&&event.code==='Space'&&!this.paused)) event.preventDefault()
   if(event.repeat||this.mandatory) return
   if(this.scene.mode==='castle'){
    if(event.code==='Escape')this.paused?this.castle():this.castlePause()
    if(event.code==='KeyE'&&!this.paused)this.castleInteract()
    return
   }
   if(event.code==='Escape'){
    if(this.scene.mode==='run') this.paused?this.resume():this.pause()
    else if(this.menu!=='main') this.castle()
   }
   if(this.scene.mode!=='run') return
   if(event.code==='Tab'&&(this.menu==='map'||!this.paused)) this.menu==='map'?this.resume():this.mapMenu()
   if(!this.paused&&event.code==='Space')this.scene.rollQueued=true
   if(!this.paused&&event.code==='KeyE')this.scene.relicQueued=true
   if(!this.paused&&event.code==='KeyQ')this.switchWeapon()
   if(event.code==='KeyR'){
    if(this.menu==='relics')this.resume()
    else if(!this.paused||this.menu==='weapons')this.inventory()
   }
   if(event.code==='KeyI'){
    if(this.menu==='weapons')this.resume()
    else if(!this.paused||this.menu==='relics')this.weaponInventory()
   }
   if(!this.paused&&event.code==='KeyF') this.interact()
  })
 }
 ready(){if(this.hasSavedGame)this.castle()}
 persist(){try {localStorage.setItem(saveKey,JSON.stringify(this.save));this.hasSavedGame=true} catch {this.notice('Browser storage is unavailable')}}
 level(name:string){return this.save.upgrades[name]??0}
 relicLevel(name:string){return this.equipped.some(relic=>relic?.name===name)?this.levels.get(name)??0:0}
 get power(){return relicPower(this.equipped.filter(Boolean).length)}
 get active(){return this.equipped.find(relic=>relic?.charge)??undefined}
 get charge(){const relic=this.active;return relic?this.activeCharges.get(relic.name)??relic.cap??0:0}
 set charge(amount:number){if(this.active)this.activeCharges.set(this.active.name,amount)}
 switchWeapon(){
  if(!this.loadout[1])return
  this.slot=this.slot===0?1:0
  this.refresh()
 }
 canEquipWeapon(weapon:Weapon){return weapon.slot===0||this.level(rangedTraining)>0}
 dungeonWeapons(){return weapons.filter(w=>w.parent&&this.canEquipWeapon(w))}
 resetRelics(){
  this.levels.clear()
  this.equipped.fill(null)
  this.activeCharges.clear()
 }
 curse(name:string){return this.contract?.name===name}
 blessed(name:string){return this.blessings.has(name)}
 sound(frequency:number){
  if(this.save.mute)return
  try{
   audio??=new AudioContext()
   if(audio.state!=='running'){void audio.resume().catch(()=>{});return}
   const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime
   oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,now)
   oscillator.frequency.exponentialRampToValueAtTime(frequency*.63,now+.085)
   gain.gain.setValueAtTime(.046,now);gain.gain.exponentialRampToValueAtTime(.001,now+.12)
   oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(now+.125)
  }catch{/* The game is playable without audio. */}
 }
 gold(amount:number){
  const total=amount*(1+this.level('Tithes')*.15+this.challenge.size*.13)
  const whole=Math.floor(total)
  const gain=whole+(total>whole&&Math.random()<total-whole?1:0)
  this.save.gold+=gain;this.earnedGold+=gain;this.persist()
 }
 heal(amount:number){this.hp=Math.min(this.maxHP,this.hp+amount*(1+this.level('Herbalism')*.2)*(this.curse('Hollow Cup')?.5:1));this.refresh()}
 hurt(amount:number){
  this.hp=Math.max(0,this.hp-Math.round(amount*(this.curse('Ashen Bargain')?1.4:1)))
  this.sound(80)
  if(!this.hp)this.finish(false)
  else this.refresh()
 }
 consumeDodgeDraught(){
  if(this.dodgeDraughts===0)return false
  this.dodgeDraughts--
  this.notice('Dodge draught consumed')
  return true
 }
 attackPower(damage:number){return damage*(1+this.level(this.slot?'Marksmanship':'Swordcraft')*.12+this.statsBonus)*(this.curse('Blunted Oath')?.7:1)*(this.blessed('Blunted Oath')?1.3:1)*(Math.random()<.05+this.level('Precision')*.05?1.6:1)}
 gainCharge(type:string,amount:number){
  if(this.active?.charge===type&&this.active.cap) this.charge=Math.min(this.active.cap,this.charge+amount)
 }
 killed(elite:boolean,large:boolean){
  if(large)return
  if(elite)this.gold(economy.eliteGold[this.floor])
  else if(Math.random()<economy.normalDropChance)this.gold(economy.normalGold)
 }
 notice(message:string){this.toast=message;this.toastTimer=performance.now()+3200;this.refresh()}
 addRelic(relic:Relic,done:Handler){
  const level=this.levels.get(relic.name)??0
  if(level===3){
   this.gold(economy.duplicateGold)
   this.notice('Maximum evolution · +'+economy.duplicateGold+' base gold')
   done();return
  }
  this.levels.set(relic.name,relicLevel(level))
  const empty=this.equipped.indexOf(null)
  if(level===0&&empty>=0&&(!relic.charge||!this.active))this.equipRelic(relic,empty)
  this.notice(relic.name+' · '+numerals[level+1]+(this.relicLevel(relic.name)?'':' · In inventory'))
  done()
 }
 equipRelic(relic:Relic,index:number){
  if(!this.levels.has(relic.name)||index<0||index>=relicSlotCount||this.relicLevel(relic.name))return
  if(relic.charge&&this.active&&this.equipped[index]!==this.active)return
  this.equipped[index]=relic
  this.refresh()
 }
 randomRelic(mainBoss=false){
  const bonus=mainBoss?1:0
  const weights=[64-this.floor*13-bonus*6,24+this.floor*4+bonus,10+this.floor*5+bonus*2,2+this.floor*4+bonus*3]
  let roll=Math.random()*100
  const rank=weights.findIndex(weight=>(roll-=weight)<0)
  return sample(relics.filter(relic=>relic.rank===rank))
 }
 blueprint(chance:number){
  const available=weapons.filter(w=>w.parent&&!this.save.blueprints.includes(w.name))
  if(!available.length||Math.random()>=chance)return ''
  const name=sample(available).name
  this.save.blueprints.push(name);this.persist()
  return 'Blueprint discovered · '+name
 }
 newRun(){
  this.loadout=[selectWeapon(this.save.loadout[0]),this.save.loadout[1]?selectWeapon(this.save.loadout[1]):null]
  this.carriedWeapons.clear()
  for(const weapon of this.loadout)if(weapon)this.carriedWeapons.add(weapon)
  this.maxHP=100+this.level('Vitality')*15;this.hp=this.maxHP
  this.slot=0;this.contract=undefined;this.resetRelics();this.blessings.clear()
  this.started=performance.now();this.earnedGold=0;this.earnedMaterials=0;this.statsBonus=0;this.dodgeDraughts=0
  this.scene.nextRoll=0;this.scene.nextAttack=0
  this.beginFloor(0)
 }
 beginFloor(floor:number){
  this.floor=floor;this.rooms=generate();this.stock.clear()
  this.enter(0,0,0);this.resume()
  this.notice(floors[floor].name)
 }
 enter(id:number,dx:number,dy:number){
  this.room=this.rooms[id];this.room.seen=true;this.scene.showRoom(dx,dy)
  this.refresh()
 }
 clear(){
  const kind=this.room.kind
  const wasCleared=this.room.cleared
  this.room.cleared=true
  if(wasCleared)return
  this.gainCharge('rooms',1)
  if(this.contract){
   const name=this.contract.name
   this.contract.remaining=contractClear(this.contract.remaining,kind,wasCleared)
   if(!this.contract.remaining){this.blessings.add(name);this.contract=undefined;this.notice('Blessing earned · '+name)}
  }
  if(kind==='Combat'&&this.blessed('Hollow Cup')) this.heal(5)
  if(kind==='Miniboss'){
   this.gold(economy.minibossGold[this.floor])
   const relic=this.randomRelic()
   this.mandatory=true
   this.dialog('Miniboss reward',this.scene.bossName,'Take the relic to continue.',[this.relicChoice(relic,()=>this.resume())])
  }
  if(kind==='Boss'){
   this.gold(economy.bossGold[this.floor])
   const amount=this.floor+2+this.challenge.size
   this.save.materials+=amount;this.earnedMaterials+=amount
   const discovery=this.blueprint(.58)
   this.persist()
   const finish=()=>this.floor===2?this.finish(true):this.beginFloor(this.floor+1)
   const loot=shuffled(relics.filter(r=>r.name!==this.active?.name))
   const first=this.randomRelic(true)
   const other=loot.find(r=>r.rank<=this.floor+1&&r!==first)??loot[0]
   const weapon=sample(this.dungeonWeapons())
   this.mandatory=true
   this.dialog('Main boss defeated',this.scene.bossName,`+${amount} forge material. Choose one reward. ${discovery}`,[
    this.relicChoice(first,finish),this.relicChoice(other,finish),
    {title:weapon.name,detail:this.weaponStats(weapon),action:()=>this.compare(weapon,finish)},
   ])
  }
 }
 relicChoice(relic:Relic,done:Handler):Choice{
  return {title:relic.name,detail:rarity[relic.rank]+' · '+relic.detail,action:()=>this.addRelic(relic,done)}
 }
 weaponStats(w:Weapon){return `${w.damage} damage · ${(w.delay/1000).toFixed(2)} s · ${w.range} range${w.effect?' · '+w.effect:''}`}
 compare(w:Weapon,done:Handler,purchase?:(apply:Handler)=>void){
  if(!this.canEquipWeapon(w)){done();return}
  const current=this.loadout[w.slot]
  const take=(equip:boolean)=>{
   const add=()=>{
    this.carriedWeapons.add(w)
    if(equip)this.loadout[w.slot]=w
    else this.notice(w.name+' added to weapon inventory · I')
    done()
   }
   if(purchase)purchase(add)
   else add()
  }
  this.dialog(w.slot?'Projectile slot':'Melee slot',w.name,`Found: ${this.weaponStats(w)} · Equipped: ${current?current.name+', '+this.weaponStats(current):'Empty'}`,[
   {title:purchase?'Buy and equip':'Equip',action:()=>take(true)},
   ...(purchase?[{title:'Buy to inventory',action:()=>take(false)}]:[]),
   {title:'Leave it',action:done},
  ])
 }
 interact(){
  const {room}=this
  if(Phaser.Math.Distance.Between(this.scene.player.x,this.scene.player.y,W/2,H/2)>42)return
  if(room.kind==='Shop'){this.shop();return}
  if(room.used)return
  if(room.kind==='Treasure'){
   this.dialog('Treasure chamber','Sealed coffer','Open the coffer and claim its contents.',[
    {title:'Open chest',action:()=>{
     room.used=true;this.scene.drawRoom();this.gold(economy.chestGold[this.floor])
     if(Math.random()<.35){this.save.materials++;this.earnedMaterials++;this.persist()}
     if(Math.random()<.12)this.heal(Math.random()<.15?35:15)
     const discovery=this.blueprint(.43)
     const relic=this.randomRelic()
     this.mandatory=true
     this.dialog('Chest opened',relic.name,discovery||'Claim the relic and choose whether to inspect the weapon.',[
      this.relicChoice(relic,()=>{
       if(Math.random()<.65)this.compare(sample(this.dungeonWeapons()),()=>this.resume())
       else this.resume()
      }),
     ])
    }},{title:'Leave',action:()=>this.resume()},
   ])
  }
  if(room.kind==='Curse Altar'){
   const choices=shuffled(contracts).slice(0,3)
   this.dialog('Curse altar','An oath in darkness',this.contract?'Finish your current contract first.':'Earn a blessing by clearing new combat rooms.',[
    ...choices.map(c=>({title:c.name,detail:`${c.debuff} for ${c.rooms} combat rooms. Reward: ${c.blessing}`,disabled:!!this.contract||this.blessed(c.name),action:()=>{
     room.used=true;this.contract={name:c.name,remaining:c.rooms};this.scene.drawRoom();this.resume()
    }})),{title:'Leave',action:()=>this.resume()},
   ])
  }
  if(room.kind==='Blacksmith'){
   this.dialog('Dungeon blacksmith','Field forge','Sharpen both weapons for +15% damage this run.',[{title:'Pay 25 gold',disabled:this.save.gold<25,action:()=>{
    this.save.gold-=25;room.used=true;this.statsBonus+=.15;this.persist();this.scene.drawRoom();this.resume()
   }},{title:'Leave',action:()=>this.resume()}])
  }
  if(room.kind==='Secret'||room.kind==='Event'){
   const claim=(drink:boolean)=>{
    room.used=true;this.scene.drawRoom()
    if(drink)this.heal(40+this.level('Springwater')*10)
    if(room.kind==='Secret'){
     this.gold(economy.secretGold);const found=this.blueprint(.85);if(found)this.notice(found)
    }else if(!drink)this.gold(economy.eventGold)
    this.resume()
   }
   this.dialog(room.kind,room.fountain?'The pilgrim’s fountain':room.kind==='Secret'?'Hidden sanctuary':'Abandoned shrine',
    room.fountain?'Drink once to restore 40 HP.':'Search the remains for supplies.',[
     ...(room.fountain?[{title:'Drink',action:()=>claim(true)}]:[]),
     {title:'Search the shrine',detail:room.kind==='Event'?'Collect '+economy.eventGold+' gold.':undefined,action:()=>claim(false)},
     {title:'Leave',action:()=>this.resume()},
    ])

  }
 }
 shop(){
  const id=this.room.id
  if(!this.stock.has(id)){
   const price=(n:number)=>Math.round(n*(1-this.level('Haggling')*.1))
   const offer=(title:string,cost:number,apply:Handler):Choice=>({
    title,detail:price(cost)+' gold',cost:price(cost),action:()=>{buy(apply,price(cost));this.shop()},
   })
   const buy=(apply:Handler,cost:number)=>{
    if(this.save.gold<cost)return
    this.save.gold-=cost;this.persist();apply()
   }
   const gear=(slot:number):Choice=>{
    const w=sample(weapons.filter(weapon=>weapon.parent&&weapon.slot===slot))
    const choice:Choice={title:w.name,cost:price(34+this.floor*8),detail:price(34+this.floor*8)+' gold · '+this.weaponStats(w),action:()=>{
     const cost=price(34+this.floor*8)
     if(choice.disabled||this.save.gold<cost){this.notice('Insufficient gold');return}
     this.compare(w,()=>this.shop(),apply=>buy(()=>{choice.disabled=true;apply()},cost))
    }}
    return choice
   }
   this.stock.set(id,[gear(0),...(this.loadout[1]?[gear(1)]:[]),offer('Large potion',17,()=>this.heal(35)),offer('Field tonic',22,()=>{this.statsBonus+=.08}),offer('Dodge draught',12,()=>{this.dodgeDraughts++})])
  }
  this.dialog('Merchant','Dungeon provisions',this.save.gold+' gold. Dodge draughts skip the next dodge cooldown.',[
   ...this.stock.get(id)!.map(choice=>({...choice,disabled:choice.disabled||this.save.gold<(choice.cost??0)})),{title:'Leave shop',action:()=>this.resume()},
  ])
 }
 finish(won:boolean){
  if(won){this.save.victories++;this.persist()}
  this.mandatory=false;this.resetRelics();this.carriedWeapons.clear();this.castle()
  const minutes=Math.floor((performance.now()-this.started)/60000)
  this.dialog(won?'Victory':'Fallen in battle',won?'The Fallen King is slain':'Return to the keep',`${floors[this.floor].name} · ${minutes} min · ${this.earnedGold} gold earned · ${this.earnedMaterials} forge material. ${won&&this.save.victories===1?'Challenges unlocked.':''}`,[{title:'Return to castle',action:()=>this.castle()}])
  this.menu='summary'
 }
 halt(){this.paused=true;hud.hidden=true;if(this.scene.player)this.scene.showCover()}
 mount(title:string,label:string,description:string,choices:Choice[],extra?:HTMLElement){
  this.paused=true
  const modal=document.createElement('div');modal.className='modal'
  const panel=document.createElement('section');panel.className='panel'
  const eyebrow=document.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent=label
  const heading=document.createElement('h2');heading.textContent=title
  panel.append(eyebrow,heading)
  if(description){const p=document.createElement('p');p.textContent=description;panel.append(p)}
  if(extra)panel.append(extra)
  const cards=document.createElement('div');cards.className='cards'
  for(const c of choices){
   const button=document.createElement('button');button.type='button';button.disabled=!!c.disabled
   button.textContent=c.title
   if(c.detail){
    const rank=rarity.findIndex(name=>c.detail?.startsWith(name+' ·'))
    if(rank>=0)button.style.color=colors[rank]
   }
   if(c.detail){const small=document.createElement('small');small.textContent=c.detail;button.append(small)}
   button.addEventListener('click',c.action);cards.append(button)
  }
  panel.append(cards);modal.append(panel);overlay.replaceChildren(modal)
 }
 dialog(label:string,title:string,description:string,choices:Choice[],extra?:HTMLElement){
  this.menu='dialog';this.mount(title,label,description,choices,extra)
 }
 main(){
  this.halt();this.menu='main'
  overlay.innerHTML='<div class="cover"><div class="hero"><div class="eyebrow">✦ &nbsp; THE LAST KEEP</div><h1>Cursed<br><em>Knight</em></h1><p>Descend into the cursed kingdom.<br>Return stronger, or join the fallen.</p><button class="primary" id="play">Enter the Keep &nbsp; →</button></div></div>'
  overlay.querySelector('#play')!.addEventListener('click',()=>{if(this.scene.player){this.sound(320);this.castle()}})
 }
 castle(){
  if(!this.hasSavedGame)this.persist()
  this.scene.showCastle(name=>upgrades.filter(u=>u.building===name).reduce((sum,u)=>sum+this.level(u.name),0))
  this.menu='castle';this.mandatory=false;this.paused=false
  overlay.replaceChildren()
  hud.hidden=false
  this.castleHUD=''
  this.castleStatus()
 }
 castleStatus(){
  const station=this.scene.castleStation()
  const display=`<div class="castle-status"><strong>The Last Keep</strong><div>◆ ${this.save.gold} gold · ${this.save.materials} forge material</div></div><div class="castle-controls">WASD · Walk &nbsp; ESC · Pause</div>${station?`<div class="castle-prompt">Press E · ${station.name==='Dungeon Gate'?'Enter the dungeon':'Talk to '+station.person}</div>`:''}`
  if(display!==this.castleHUD){hud.innerHTML=display;this.castleHUD=display}
 }
 castlePause(){
  this.dialog('The Last Keep','Paused','',[
   {title:'Resume',action:()=>this.castle()},
   {title:'Settings and controls',action:()=>this.settings(()=>this.castlePause())},
   {title:'Main menu',action:()=>this.main()},
  ])
 }
 castleInteract(){
  const station=this.scene.castleStation()
  if(!station)return
  this.sound(290)
  switch(station.name){
   case 'Blacksmith': this.craft();break
   case 'Main Hall': this.dialog(station.name,station.person,station.line,[{title:'Back to castle',action:()=>this.castle()}]);break
   case 'Dungeon Gate': this.challengeMenu(station.line);break
   default: this.improve(station.name,station.person,station.line)
  }
 }
 chooseLoadout(){
  const form=document.createElement('div')
  for(const slot of [0,1] as const){
   if(slot===1&&!this.level(rangedTraining)){
    const locked=document.createElement('p')
    locked.textContent='Projectile slot locked · Requires '+rangedTraining
    form.append(locked);continue
   }
   const label=document.createElement('label');label.textContent=slot?'Projectile':'Melee'
   const select=document.createElement('select')
   for(const w of weapons.filter(w=>w.slot===slot&&this.save.unlocked.includes(w.name))){
    const option=new Option(w.name,w.name);option.selected=this.save.loadout[slot]===w.name;select.add(option)
   }
   select.onchange=()=>{this.save.loadout[slot]=select.value;this.persist();details.textContent=this.weaponStats(selectWeapon(select.value))}
   label.append(select);form.append(label)
   const details=document.createElement('p');details.textContent=this.weaponStats(selectWeapon(select.value));form.append(details)
  }
  this.dialog('Castle armory','Starting equipment','Select one weapon for each slot.',[{title:'Back to castle',action:()=>this.castle()}],form)
 }
 craft(){
  this.dialog('Permanent crafting','Blacksmith',`Mara · Bring a blueprint and metal, and I’ll forge you something worth carrying. ${this.save.materials} forge material available.`,[
   ...weapons.filter(w=>w.parent).map(w=>{
    const crafted=this.save.unlocked.includes(w.name), blueprint=this.save.blueprints.includes(w.name), parent=this.save.unlocked.includes(w.parent!)
    const advanced=w.cost!>=4&&!this.level('Forge')
    return {title:w.name,detail:crafted?'Crafted':`${w.cost} material · Requires ${w.parent}${blueprint?'':' · Blueprint undiscovered'}${advanced?' · Requires Forge':''}${this.canEquipWeapon(w)?'':' · Requires '+rangedTraining}`,disabled:!this.canEquipWeapon(w)||crafted||!blueprint||!parent||advanced||this.save.materials<w.cost!,action:()=>{
     this.save.materials-=w.cost!;this.save.unlocked.push(w.name);this.persist();this.craft()
    }}
   }),{title:'Starting equipment',action:()=>this.chooseLoadout()},
   {title:'Workshop upgrades',action:()=>this.improve('Blacksmith','Mara the blacksmith','Unlock the forge annex for advanced recipes.')},
   {title:'Back to castle',action:()=>this.castle()},
  ])
 }
 improve(building:Building,person:string,line:string){
  this.dialog(person,building,line+' '+this.save.gold+' gold available.',[
   ...upgrades.filter(u=>u.building===building).map(u=>{
    const level=this.level(u.name),cost=upgradeCost(u.cost,level)
    return {title:u.name+' '+level+'/'+u.max,detail:`${u.building} · ${u.detail} · ${level>=u.max?'Maxed':cost+' gold'}${u.requires?' · Requires '+u.requires:''}`,disabled:level>=u.max||this.save.gold<cost||!!u.requires&&!this.level(u.requires),action:()=>{
     this.save.gold-=cost;this.save.upgrades[u.name]=level+1;if(u.name===rangedTraining)unlockRanged(this.save);this.persist();this.scene.showCastle(name=>upgrades.filter(u=>u.building===name).reduce((sum,u)=>sum+this.level(u.name),0));this.castleStatus();this.improve(building,person,line)
    }}
   }),{title:'Back to castle',action:()=>this.castle()},
  ])
 }
 challengeMenu(dialogue:string){
  const form=document.createElement('div')
  for(const name of this.save.victories?challenges:[]){
   const label=document.createElement('label'), input=document.createElement('input')
   input.type='checkbox';input.checked=this.challenge.has(name)
   input.onchange=()=>input.checked?this.challenge.add(name):this.challenge.delete(name)
   label.append(input,name);form.append(label)
  }
  this.dialog('The gatekeeper','Dungeon Gate',dialogue+(this.save.victories?' Challenge modifiers increase gold and main boss materials.':' Challenge modifiers unlock after your first victory.'),[{title:'Begin descent',action:()=>this.newRun()},{title:'Back to castle',action:()=>this.castle()}],form)
 }
 returnAction():Handler{
  if(this.menu==='summary')return ()=>this.castle()
  if(this.scene.mode==='run')return this.paused?()=>this.pause():()=>this.resume()
  if(this.menu==='main')return ()=>this.main()
  return ()=>this.castle()
 }
 settings(back:Handler){
  this.dialog('Settings','Controls','Castle: WASD walk, E interact · Dungeon: WASD move · Mouse aim · Left-click attack · Q or wheel switch weapons · Space dodge · E use active relic · F interact · I weapon inventory · R relic inventory · Tab map · Esc pause',[
   {title:this.save.mute?'Enable sound':'Mute sound',action:()=>{this.save.mute=!this.save.mute;this.persist();this.settings(back)}},
   {title:'Back',action:back},
  ])
 }
 pause(){
  this.dialog('Run paused','Take a breath','',[{title:'Resume',action:()=>this.resume()},{title:'Weapons',action:()=>this.weaponInventory()},{title:'Relics',action:()=>this.inventory()},{title:'Settings and controls',action:()=>this.settings(()=>this.pause())},{title:'End run',action:()=>this.dialog('End run','Return to the keep?','Run equipment and relics will reset.',[{title:'End run',action:()=>this.finish(false)},{title:'Keep playing',action:()=>this.pause()}])}])
 }
 resume(){
  this.paused=false;this.mandatory=false;this.menu='run';hud.hidden=false
  overlay.replaceChildren()
  this.refresh()
 }
 weaponInventory(){
  this.dialog('Run inventory','Carried weapons','Choose a weapon to equip it. The previous weapon stays in your inventory for this run.',[
   ...[...this.carriedWeapons].map(w=>({
    title:w.name,
    detail:(w.slot?'Projectile':'Melee')+' · '+(this.loadout[w.slot]===w?'Equipped · ':'')+this.weaponStats(w),
    disabled:this.loadout[w.slot]===w||!this.canEquipWeapon(w),
    action:()=>{
     this.loadout[w.slot]=w
     this.slot=w.slot
     this.refresh()
     this.weaponInventory()
    },
   })),
   {title:'Relics',action:()=>this.inventory()},
   {title:'Return to dungeon',action:()=>this.resume()},
  ])
  this.menu='weapons'
 }
 inventory(selected?:Relic){
  const slots=document.createElement('div')
  slots.className='relic-equipment'
  const title=document.createElement('p')
  const count=this.equipped.filter(Boolean).length
  title.textContent=count+' / '+relicSlotCount+' equipped · '+pct(this.power)+' power'
  slots.append(title)
  const row=document.createElement('div')
  row.className='relic-slots'
  this.equipped.forEach((relic,index)=>{
   const button=document.createElement('button')
   button.textContent=(index+1)+' · '+(relic?icon(relic)+' '+relic.name+' '+numerals[this.relicLevel(relic.name)]:'Empty')
   if(relic)button.style.color=colors[relic.rank]
   button.disabled=selected?!!selected.charge&&!!this.active&&relic!==this.active:!relic
   button.title=selected?'Equip '+selected.name+' in slot '+(index+1):'Unequip '+(relic?.name??'')
   if(selected&&!button.disabled){
    const resultingPower=relicPower(count+(relic?0:1))
    const result=document.createElement('small')
    result.textContent=pct(resultingPower)+' power'
    button.append(document.createElement('br'),result)
   }
   button.onclick=()=>{
    if(selected)this.equipRelic(selected,index)
    else {this.equipped[index]=null;this.refresh()}
    this.inventory()
   }
   row.append(button)
  })
  slots.append(row)
  if(selected){
   const preview=document.createElement('p')
   preview.textContent='Choose a slot for '+selected.name+'. Select an occupied slot to replace its relic.'
   slots.append(preview)
  }
  const owned=relics.filter(r=>this.levels.has(r.name))
  this.dialog('Run inventory','Relic equipment',owned.length?'Choose a relic to equip it. Select an equipped slot to unequip it.':'No relics collected this run. After the first fight, try the north or south door for the treasure room. Stand near the chest and press F to open it, then claim the guaranteed relic. Minibosses and main bosses also offer relics.',[
   ...owned.map(r=>{
    const level=this.levels.get(r.name)!
    const equipped=this.relicLevel(r.name)>0
    const effect=equipped
     ? relicEffect(r,level,this.power)
     : 'At '+pct(this.power)+': '+relicEffect(r,level,this.power)
    return {title:icon(r)+' '+r.name+' '+numerals[level],detail:rarity[r.rank]+' · '+(equipped?'Equipped':'In inventory')+' · '+r.detail+' '+effect,action:()=>{
     if(equipped){this.equipped[this.equipped.indexOf(r)]=null;this.refresh();this.inventory()}
     else this.inventory(r)
    }}
   }),
   {title:'Return to dungeon',action:()=>this.resume()},
  ],slots)
  this.menu='relics'
 }
 mapMarkup(full:boolean){
  const compass=this.relicLevel('Glass Compass')
  const revealed=new Set(this.rooms.filter(room=>room.seen||compass===3||
   (room.kind==='Secret'&&compass>=1)||(room.kind==='Treasure'&&compass>=2)||
   ((compass>=2||this.level('Survey'))&&room.kind!=='Secret'&&room.neighbors.some(id=>this.rooms[id].seen))).map(room=>room.id))
  const visible=this.rooms.filter(room=>revealed.has(room.id))
  const minX=Math.min(...visible.map(r=>r.x)),maxX=Math.max(...visible.map(r=>r.x))
  const minY=Math.min(...visible.map(r=>r.y)),maxY=Math.max(...visible.map(r=>r.y))
  const x=(room:Room)=>(room.x-minX)*18+9,y=(room:Room)=>(room.y-minY)*18+9
  const lines=visible.flatMap(r=>r.neighbors.filter(id=>id>r.id&&revealed.has(id)).map(id=>`<line x1="${x(r)}" y1="${y(r)}" x2="${x(this.rooms[id])}" y2="${y(this.rooms[id])}" stroke="#80646f" stroke-width="2"/>`))
  const glyph:Partial<Record<Room['kind'],string>>={Treasure:'+',Shop:'$',Boss:'B',Miniboss:'M','Curse Altar':'C',Trap:'!',Secret:'?',Blacksmith:'F',Event:'E'}
  const nodes=visible.map(r=>`<rect x="${x(r)-6}" y="${y(r)-6}" width="12" height="12" fill="${r===this.room?'#b15e62':r.seen?'#554052':'#39303d'}" stroke="${r===this.room?'#ffd194':r.cleared?'#b49e9d':'#85647a'}"/>${glyph[r.kind]?`<text x="${x(r)}" y="${y(r)+3.6}" text-anchor="middle" fill="#eed7b1">${glyph[r.kind]}</text>`:''}`)
  return `<svg class="map" role="img" aria-label="${full?'Expanded dungeon map':'Dungeon minimap'}" viewBox="0 0 ${(maxX-minX+1)*18} ${(maxY-minY+1)*18}">${lines.join('')}${nodes.join('')}</svg>`
 }
 mapMenu(){
  const map=document.createElement('div');map.innerHTML=this.mapMarkup(true)+'<p class="legend">+ Treasure · $ Shop · M Miniboss · B Main boss · C Altar · ! Trap · ? Secret · F Forge · E Event</p>'
  this.dialog('Dungeon map',floors[this.floor].name,'Visited rooms and revealed routes.',[{title:'Close map',action:()=>this.resume()}],map)
  this.menu='map'
 }
 refresh(){
  if(!this.room||hud.hidden)return
  const boss=this.scene.foes.find(f=>f.large&&f.hp>0)
  const area=floors[this.floor]
  const treasure=this.room.neighbors.map(id=>this.rooms[id]).find(room=>room.kind==='Treasure'&&!room.used)
  const hint=this.room.kind==='Treasure'&&!this.room.used?'F · Open chest for a guaranteed relic'
   : !this.levels.size&&this.room.kind==='Entry'?'Find your first relic in the treasure room after the first fight'
   : !this.levels.size&&treasure&&!this.scene.locked?'Treasure chest '+(treasure.y<this.room.y?'north':'south')+' · Guaranteed relic'
   : !this.room.used&&['Shop','Event','Blacksmith','Secret','Curse Altar'].includes(this.room.kind)?'F · '+this.room.kind:''
  const toast=performance.now()<this.toastTimer?this.toast:''
  hud.innerHTML=`<div class="status"><div>${Math.ceil(this.hp)} / ${this.maxHP} HP</div><div class="hp">${bar(this.hp/this.maxHP)}</div><div class="gold">◆ ${this.save.gold}</div><div>${this.floor+1} · ${area.biomes[this.room.patch]}</div>${this.contract?`<div>${this.contract.name} · ${this.contract.remaining} left</div>`:''}</div>
   <div class="mini">${this.mapMarkup(false)}</div>
   ${boss?`<div class="boss ${boss.mini?'miniboss-bar':''}">${this.scene.bossName}${boss.mini?' · Phase '+(boss.phase+1):''}<div class="hp">${bar(boss.hp/boss.max)}</div></div>`:''}
   ${toast?`<div class="toast">${toast}</div>`:''}${hint?`<div class="roomHint">${hint}</div>`:''}
   <div class="loadout">${this.loadout.map((w,i)=>`<span class="${i===this.slot?'selected':''}" title="${w?'':'Requires '+rangedTraining}">${i===0?'⚔':'➶'} ${w?.name??'Locked · '+rangedTraining}</span>`).join('')}</div>
   <div class="relic-hud"><div class="relic-hint">I — Weapons · R — Relics · ${pct(this.power)} power</div><div class="hud-slots">${this.equipped.map(relic=>relic?`<div class="hud-relic" title="${relic.name} · ${rarity[relic.rank]}" style="color:${colors[relic.rank]}">${icon(relic)} ${numerals[this.relicLevel(relic.name)]}${relic.cap?` · E<div class="charge" title="${pct(this.charge/relic.cap)} charged">${bar(this.charge/relic.cap)}</div>`:''}</div>`:'<div class="hud-relic empty" title="Empty relic slot">◇</div>').join('')}</div></div>`
 }
}
export const game=new Game()
