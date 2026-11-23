import Phaser from 'phaser'
import { Combat, type CombatBridge } from './combat'
import { H, W } from './art'
import { challenges, colors, contracts, contractClear, decode, rarity, relicLevel, relics, upgradeCost, upgrades, weapons, type Relic, type Save, type Weapon } from './data'
import { floors, generate, generateAbyss, sample, type Room } from './dungeon'
import { relicEffect } from './relic-effects'
import { economy, goldMultiplierForFloor, healingRoomInterval, relicSlotCount } from './balance'
import { type Building } from './castle'
import { abyssalWeapon, bossMaterials, emptyBossMaterials, hasRecipeMaterials, payRecipe, recipeCost, recipes } from './materials'
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
type Choice={title:string; detail?:string; disabled?:boolean; action:Handler}
let audio:AudioContext|undefined
const bar=(value:number)=><string>`<i style="width:${Math.max(0,Math.min(100,value*100))}%"></i>`

class Game implements CombatBridge {
 save:Save
 scene=new Combat()
 loadout:readonly [Weapon,Weapon]=[weapons[0],weapons[1]]
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
 roomsSinceHealing=0
 earnedBossMaterials=emptyBossMaterials()
 normalCompleted=false
 firstNormalVictory=false
 statsBonus=0
 dodgeDraughts=0
 mandatory=false
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
 get active(){return this.equipped.find(relic=>relic?.charge)??undefined}
 get charge(){const relic=this.active;return relic?this.activeCharges.get(relic.name)??relic.cap??0:0}
 set charge(amount:number){if(this.active)this.activeCharges.set(this.active.name,amount)}
 switchWeapon(){
  this.slot=this.slot===0?1:0
  this.refresh()
 }
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
  const gain=goldMultiplierForFloor(this.floor)*(whole+(total>whole&&Math.random()<total-whole?1:0))
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
 attackDelay(weapon:Weapon){
  const rank=this.level(weapon.slot===0?'Melee Attack Speed':'Ranged Attack Speed')
  return weapon.delay/(1+rank*.1)
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
   this.notice('Maximum evolution · +'+(economy.duplicateGold*goldMultiplierForFloor(this.floor))+' base gold')
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
 blueprint(chance:number,abyssOnly=false){
  const available=weapons.filter(w=>w.parent&&(w.name===abyssalWeapon)===abyssOnly&&!this.save.blueprints.includes(w.name))
  if(!available.length||Math.random()>=chance)return ''
  const name=sample(available).name
  this.save.blueprints.push(name);this.persist()
  return 'Blueprint discovered · '+name
 }
 newRun(){
  this.loadout=[selectWeapon(this.save.loadout[0]),selectWeapon(this.save.loadout[1])]
  this.maxHP=100+this.level('Vitality')*15;this.hp=this.maxHP
  this.slot=0;this.contract=undefined;this.resetRelics();this.blessings.clear()
  this.started=performance.now();this.earnedGold=0;this.earnedMaterials=0;this.earnedBossMaterials=emptyBossMaterials();this.normalCompleted=false;this.firstNormalVictory=false;this.statsBonus=0;this.dodgeDraughts=0
  this.scene.nextRoll=0;this.scene.nextAttack=0;this.scene.greatswordSwings=0
  this.roomsSinceHealing=0
  this.rooms=[]
  this.beginFloor(0)
 }
 beginFloor(floor:number){
  const unclaimedHealing=this.rooms.flatMap(room=>room.healingRewards??[])
  const rooms=floor===3?generateAbyss(this.rooms.length||20):generate()
  this.floor=floor;this.rooms=rooms
  this.enter(0,0,0)
  for(const drop of unclaimedHealing)this.scene.addRoomHealing(drop.amount)
  this.resume()
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
  if(kind==='Combat'){
   if(this.blessed('Hollow Cup'))this.heal(5)
   if(++this.roomsSinceHealing===healingRoomInterval){
    this.roomsSinceHealing=0
    this.scene.addRoomHealing(35)
    this.notice('Healing reward · 6 combat rooms cleared')
   }
  }
  if(kind==='Miniboss'){
   this.gold(economy.minibossGold[this.floor])
   const relic=this.randomRelic()
   this.mandatory=true
   this.dialog('Miniboss reward',this.scene.bossName,'Take the relic to continue.',[this.relicChoice(relic,()=>this.resume())])
  }
  if(kind==='Boss'){
   this.gold(economy.bossGold[this.floor])
   const material=bossMaterials[this.floor]
   this.save.bossMaterials[material]++
   this.earnedBossMaterials[material]++
   const discovery=this.blueprint(this.floor===3?.68:.58,this.floor===3)
   if(this.floor===2&&!this.normalCompleted){
    this.normalCompleted=true
    this.firstNormalVictory=this.save.victories===0
    this.save.victories++
   }
   if(this.floor===3)this.save.abyssVictories++
   this.persist()
   const finish=()=>this.floor===3?this.finish(true):this.floor===2?this.openAbyss():this.beginFloor(this.floor+1)
   const first=this.randomRelic(true)
   const loot=shuffled(relics.filter(r=>r!==first&&r.name!==this.active?.name))
   const choices=[first,...loot.filter(r=>r.rank<=this.floor+1),...loot.filter(r=>r.rank>this.floor+1)].slice(0,3)
   this.mandatory=true
   this.dialog('Main boss defeated',this.scene.bossName,`+1 ${material}. Choose one relic. ${discovery}`,
    choices.map(relic=>this.relicChoice(relic,finish)))
  }
 }
 openAbyss(){
  this.room.portal=true
  this.scene.drawRoom()
  this.refresh()
  this.abyssChoice()
 }
 abyssChoice(){
  this.dialog('Normal victory achieved','The Abyssal Depths',
   'A dark portal opens beyond the Fallen King. Your normal victory and rewards are saved. Enter with your current gear and health, or return to the castle.',[
    {title:'Enter the Abyss',action:()=>this.beginFloor(3)},
    {title:'Complete normal run',action:()=>this.finish(true)},
    {title:'Stay in the throne room',action:()=>this.resume()},
   ])
 }
 relicChoice(relic:Relic,done:Handler):Choice{
  return {title:relic.name,detail:rarity[relic.rank]+' · '+relic.detail,action:()=>this.addRelic(relic,done)}
 }
 weaponStats(w:Weapon){return `${w.damage} damage · ${(this.attackDelay(w)/1000).toFixed(2)} s · ${w.range} range${w.effect?' · '+w.effect:''}${w.name===abyssalWeapon?' · Every fourth swing releases a piercing void crescent':''}`}
 interact(){
  const {room}=this
  if(Phaser.Math.Distance.Between(this.scene.player.x,this.scene.player.y,W/2,H/2)>42)return
  if(room.portal){this.abyssChoice();return}
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
     this.dialog('Chest opened',relic.name,discovery||'Claim your relic.',[
      this.relicChoice(relic,()=>this.resume()),
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
     {title:'Search the shrine',detail:room.kind==='Event'?'Collect '+(economy.eventGold*goldMultiplierForFloor(this.floor))+' base gold.':undefined,action:()=>claim(false)},
     {title:'Leave',action:()=>this.resume()},
    ])

  }
 }
 shop(){
  const offer=(title:string,baseCost:number,apply:Handler):Choice=>{
   const cost=Math.round(baseCost*(1-this.level('Haggling')*.1))
   return {title,detail:cost+' gold',disabled:this.save.gold<cost,action:()=>{
    if(this.save.gold<cost)return
    this.save.gold-=cost
    this.persist()
    apply()
    this.shop()
   }}
  }
  this.dialog('Merchant','Dungeon provisions',this.save.gold+' gold. Dodge draughts skip the next dodge cooldown.',[
   offer('Large potion',17,()=>this.heal(35)),
   offer('Field tonic',22,()=>{this.statsBonus+=.08}),
   offer('Dodge draught',12,()=>{this.dodgeDraughts++}),
   {title:'Leave shop',action:()=>this.resume()},
  ])
 }
 finish(won:boolean){
  const abyssWon=won&&this.floor===3
  this.mandatory=false;this.resetRelics();this.castle()
  const minutes=Math.floor((performance.now()-this.started)/60000)
  const materials=recipeCost({...this.earnedBossMaterials,scrap:this.earnedMaterials})
  const title=abyssWon?'The Abyssal Overlord is slain':won?'The Fallen King is slain':'Return to the keep'
  const detail=`${floors[this.floor].name} · ${minutes} min · ${this.earnedGold} gold earned${materials?' · '+materials:''}.${this.firstNormalVictory?' Challenges unlocked.':''}${!won&&this.normalCompleted?' Normal victory recorded.':''}`
  this.dialog(abyssWon?'Abyssal victory':won?'Victory':'Fallen in battle',title,detail,[{title:'Return to castle',action:()=>this.castle()}])
  if(abyssWon)overlay.querySelector('.panel')?.classList.add('abyss-victory')
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
  const display=`<div class="castle-status"><strong>The Last Keep</strong><div>◆ ${this.save.gold} gold · ${this.save.materials} Forge Scrap</div><div>${this.save.victories} victories · ${this.save.abyssVictories} Abyssal victories</div></div><div class="castle-controls">WASD · Walk &nbsp; ESC · Pause</div>${station?`<div class="castle-prompt">Press E · ${station.name==='Dungeon Gate'?'Enter the dungeon':'Talk to '+station.person}</div>`:''}`
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
 atBlacksmith(){
  return this.scene.mode==='castle'&&this.scene.castleStation()?.name==='Blacksmith'
 }
 recipeStatus(w:Weapon){
  const recipe=recipes[w.name]
  if(!this.save.blueprints.includes(w.name))return 'Not discovered'
  if(w.parent&&!this.save.unlocked.includes(w.parent))return 'Requires '+w.parent
  if(w.requiresForge&&!this.level('Forge'))return 'Requires Forge'
  if(!hasRecipeMaterials(this.save,recipe))return 'Missing materials'
  if(this.save.gold<(recipe.gold??0))return 'Missing gold'
  return 'Ready to craft'
 }
 craft(){
  if(!this.atBlacksmith())return
  const scroll=this.menu==='blacksmith'?overlay.querySelector('.panel')?.scrollTop??0:0
  const workbench=document.createElement('div')
  const equipped=document.createElement('p')
  equipped.textContent='Equipped melee: '+this.save.loadout[0]+' · Equipped ranged: '+this.save.loadout[1]
  workbench.append(equipped)
  const list=document.createElement('div')
  list.className='forge-recipes'
  for(const weapon of weapons){
   const card=document.createElement('section')
   card.className='forge-recipe'
   const name=document.createElement('h3')
   name.textContent=weapon.name
   const owned=this.save.unlocked.includes(weapon.name)
   const isEquipped=this.save.loadout[weapon.slot]===weapon.name
   const status=document.createElement('strong')
   status.textContent=isEquipped?'Equipped':owned?(weapon.parent?'Crafted':'Unlocked'):weapon.parent?this.recipeStatus(weapon):'Starter weapon'
   const stats=document.createElement('small')
   stats.textContent=(weapon.slot?'Ranged':'Melee')+' · '+this.weaponStats(weapon)
   card.append(name,status,stats)
   if(weapon.parent){
    const blueprint=document.createElement('small')
    blueprint.textContent=this.save.blueprints.includes(weapon.name)?'Blueprint discovered':'Blueprint not discovered'
    const recipe=document.createElement('small')
    recipe.textContent=recipeCost(recipes[weapon.name])+' · Requires '+weapon.parent+(weapon.requiresForge?' and Forge':'')
    card.append(blueprint,recipe)
   }
   const button=document.createElement('button')
   button.type='button'
   button.textContent=(owned?'Equip ':'Craft ')+weapon.name
   button.disabled=owned?isEquipped:!weapon.parent||status.textContent!=='Ready to craft'
   button.onclick=()=>{
    if(!this.atBlacksmith())return
    if(owned){
     if(!this.save.unlocked.includes(weapon.name))return
     this.save.loadout[weapon.slot]=weapon.name
    }else{
     if(this.save.unlocked.includes(weapon.name)||this.recipeStatus(weapon)!=='Ready to craft'||!payRecipe(this.save,recipes[weapon.name]))return
     this.save.unlocked.push(weapon.name)
    }
    this.persist()
    this.craft()
   }
   if(weapon.parent||owned)card.append(button)
   list.append(card)
  }
  workbench.append(list)
  this.dialog('Permanent crafting','Blacksmith',`Mara · Craft and equip weapons before descending. ${this.save.gold} gold · ${this.save.materials} Forge Scrap · ${bossMaterials.map(material=>material+' '+this.save.bossMaterials[material]).join(' · ')}.`,[
   {title:'Workshop upgrades',action:()=>this.improve('Blacksmith','Mara the blacksmith','Unlock the forge annex for advanced recipes.')},
   {title:'Back to castle',action:()=>this.castle()},
  ],workbench)
  this.menu='blacksmith'
  const panel=overlay.querySelector('.panel')
  if(panel)panel.scrollTop=scroll
 }
 improve(building:Building,person:string,line:string){
  this.dialog(person,building,line+' '+this.save.gold+' gold available.',[
   ...upgrades.filter(u=>u.building===building).map(u=>{
    const level=this.level(u.name),cost=upgradeCost(u.cost,level)
    return {title:u.name+' '+level+'/'+u.max,detail:`${u.building} · ${u.detail} · ${level>=u.max?'Maxed':cost+' gold'}${u.requires?' · Requires '+u.requires:''}`,disabled:level>=u.max||this.save.gold<cost||!!u.requires&&!this.level(u.requires),action:()=>{
     this.save.gold-=cost;this.save.upgrades[u.name]=level+1;this.persist();this.scene.showCastle(name=>upgrades.filter(u=>u.building===name).reduce((sum,u)=>sum+this.level(u.name),0));this.castleStatus();this.improve(building,person,line)
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
  this.dialog('The gatekeeper','Dungeon Gate',dialogue+(this.save.victories?' Challenge modifiers increase gold. Boss materials are fixed at one per defeat.':' Challenge modifiers unlock after your first victory.'),[{title:'Begin descent',action:()=>this.newRun()},{title:'Back to castle',action:()=>this.castle()}],form)
 }
 returnAction():Handler{
  if(this.menu==='summary')return ()=>this.castle()
  if(this.scene.mode==='run')return this.paused?()=>this.pause():()=>this.resume()
  if(this.menu==='main')return ()=>this.main()
  return ()=>this.castle()
 }
 settings(back:Handler){
  this.dialog('Settings','Controls','Castle: WASD walk, E interact · Dungeon: WASD move · Mouse aim · Left-click attack · Q or wheel switch weapons · Space dodge · E use active relic · F interact · I equipped weapons · R relic inventory · Tab map · Esc pause',[
   {title:this.save.mute?'Enable sound':'Mute sound',action:()=>{this.save.mute=!this.save.mute;this.persist();this.settings(back)}},
   {title:'Back',action:back},
  ])
 }
 pause(){
  this.dialog('Run paused','Take a breath','',[{title:'Resume',action:()=>this.resume()},{title:'Weapons',action:()=>this.weaponInventory()},{title:'Relics',action:()=>this.inventory()},{title:'Settings and controls',action:()=>this.settings(()=>this.pause())},{title:'End run',action:()=>this.dialog('End run','Return to the keep?','Run relics and temporary buffs will reset.',[{title:'End run',action:()=>this.finish(false)},{title:'Keep playing',action:()=>this.pause()}])}])
 }
 resume(){
  this.paused=false;this.mandatory=false;this.menu='run';hud.hidden=false
  overlay.replaceChildren()
  this.refresh()
 }
 weaponInventory(){
  const equipped=document.createElement('div')
  for(const slot of [0,1] as const){
   const weapon=this.loadout[slot]
   const item=document.createElement('p')
   item.textContent=(slot?'Ranged · ':'Melee · ')+weapon.name+' · '+this.weaponStats(weapon)
   equipped.append(item)
  }
  this.dialog('Run equipment','Equipped weapons','Your loadout is locked for this run. Switch between your equipped weapons with Q or the mouse wheel.',[
   {title:'Relics',action:()=>this.inventory()},
   {title:'Return to dungeon',action:()=>this.resume()},
  ],equipped)
  this.menu='weapons'
 }
 inventory(selected?:Relic){
  const slots=document.createElement('div')
  slots.className='relic-equipment'
  const title=document.createElement('p')
  const count=this.equipped.filter(Boolean).length
  title.textContent=count+' / '+relicSlotCount+' equipped · 100% power'
  slots.append(title)
  const row=document.createElement('div')
  row.className='relic-slots'
  this.equipped.forEach((relic,index)=>{
   const button=document.createElement('button')
   button.textContent=(index+1)+' · '+(relic?icon(relic)+' '+relic.name+' '+numerals[this.relicLevel(relic.name)]:'Empty')
   if(relic)button.style.color=colors[relic.rank]
   button.disabled=selected?!!selected.charge&&!!this.active&&relic!==this.active:!relic
   button.title=selected?'Equip '+selected.name+' in slot '+(index+1):'Unequip '+(relic?.name??'')
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
    const effect=relicEffect(r,level)
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
  const nodes=visible.map(r=>`<rect x="${x(r)-6}" y="${y(r)-6}" width="12" height="12" fill="${r===this.room?'#b15e62':r.seen?'#554052':'#39303d'}" stroke="${r===this.room?'#ffd194':r.cleared?'#b49e9d':'#85647a'}"/>${r.portal||glyph[r.kind]?`<text x="${x(r)}" y="${y(r)+3.6}" text-anchor="middle" fill="#eed7b1">${r.portal?'◈':glyph[r.kind]}</text>`:''}`)
  return `<svg class="map" role="img" aria-label="${full?'Expanded dungeon map':'Dungeon minimap'}" viewBox="0 0 ${(maxX-minX+1)*18} ${(maxY-minY+1)*18}">${lines.join('')}${nodes.join('')}</svg>`
 }
 mapMenu(){
  const map=document.createElement('div');map.innerHTML=this.mapMarkup(true)+'<p class="legend">+ Treasure · $ Shop · M Miniboss · B Main boss · C Altar · ! Trap · ? Secret · F Forge · E Event · ◈ Abyssal portal</p>'
  this.dialog('Dungeon map',floors[this.floor].name,'Visited rooms and revealed routes.',[{title:'Close map',action:()=>this.resume()}],map)
  this.menu='map'
 }
 refresh(){
  if(!this.room||hud.hidden)return
  const boss=this.scene.foes.find(f=>f.large&&f.hp>0)
  const area=floors[this.floor]
  const treasure=this.room.neighbors.map(id=>this.rooms[id]).find(room=>room.kind==='Treasure'&&!room.used)
  const hint=this.room.portal?'F · Abyssal portal':this.room.kind==='Treasure'&&!this.room.used?'F · Open chest for a guaranteed relic'
   : !this.levels.size&&this.room.kind==='Entry'?'Find your first relic in the treasure room after the first fight'
   : !this.levels.size&&treasure&&!this.scene.locked?'Treasure chest '+(treasure.y<this.room.y?'north':'south')+' · Guaranteed relic'
   : !this.room.used&&['Shop','Event','Blacksmith','Secret','Curse Altar'].includes(this.room.kind)?'F · '+this.room.kind:''
  const toast=performance.now()<this.toastTimer?this.toast:''
  hud.innerHTML=`<div class="status"><div>${Math.ceil(this.hp)} / ${this.maxHP} HP</div><div class="hp">${bar(this.hp/this.maxHP)}</div><div class="gold">◆ ${this.save.gold}</div><div>${this.floor+1} · ${this.floor===3?area.name:area.biomes[this.room.patch]}</div>${this.scene.locked&&this.scene.totalWaves?`<div>Wave ${this.scene.wave} / ${this.scene.totalWaves}</div>`:''}${this.contract?`<div>${this.contract.name} · ${this.contract.remaining} left</div>`:''}</div>
   <div class="mini">${this.mapMarkup(false)}</div>
   ${boss?`<div class="boss ${boss.mini||this.floor===3?'miniboss-bar':''}">${this.scene.bossName}${boss.mini||this.floor===3?' · Phase '+(boss.phase+1)+(this.floor===3?' / 4':''):''}<div class="hp">${bar(boss.hp/boss.max)}</div></div>`:''}
   ${toast?`<div class="toast">${toast}</div>`:''}${hint?`<div class="roomHint">${hint}</div>`:''}
   <div class="loadout">${this.loadout.map((w,i)=>`<span class="${i===this.slot?'selected':''}" title="${w?'':'Starter weapon'}">${i===0?'⚔':'➶'} ${w.name}</span>`).join('')}</div>
   <div class="relic-hud"><div class="relic-hint">I — Weapons · R — Relics · 100% power</div><div class="hud-slots">${this.equipped.map(relic=>relic?`<div class="hud-relic" title="${relic.name} · ${rarity[relic.rank]}" style="color:${colors[relic.rank]}">${icon(relic)} ${numerals[this.relicLevel(relic.name)]}${relic.cap?` · E<div class="charge" title="${pct(this.charge/relic.cap)} charged">${bar(this.charge/relic.cap)}</div>`:''}</div>`:'<div class="hud-relic empty" title="Empty relic slot">◇</div>').join('')}</div></div>`
 }
}
export const game=new Game()
