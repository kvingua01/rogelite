import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const host='http://127.0.0.1:4178'
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'inherit'})
let browser
try {
 for(let attempt=0;;attempt++){
  try {if((await fetch(host)).ok)break} catch{/* Wait for Vite. */}
  if(attempt>=30)throw new Error('Vite did not become ready')
  await new Promise(resolve=>setTimeout(resolve,200))
 }
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 const read=fn=>page.evaluate(async source=>{
  const {game}=await import('/src/main.ts')
  return Function('g','return ('+source+')(g)')(game)
 },fn.toString())
 const atStation=async name=>{
  await page.evaluate(async name=>{
   const {game}=await import('/src/main.ts')
   const {stations,stationPoint}=await import('/src/castle.ts')
   const station=stations.find(s=>s.name===name)
   const point=stationPoint(station)
   game.scene.player.setPosition(point.x,point.y+(station.south?23:-23))
  },name)
  await page.keyboard.press('KeyE')
 }
 const walk=async (key,axis,limit,direction)=>{
  await page.keyboard.down(key)
  try{
   const deadline=Date.now()+6500
   while(Date.now()<deadline){
    const position=await read(g=>[g.scene.player.x,g.scene.player.y])
    if((position[axis==='x'?0:1]-limit)*direction>=0)return
    await page.waitForTimeout(25)
   }
   throw new Error('Castle walk timed out at '+await read(g=>[g.scene.player.x,g.scene.player.y]))
  } finally {await page.keyboard.up(key)}
 }
 await page.goto(host)
 await page.locator('canvas').waitFor()
 await page.getByRole('button',{name:/Enter the Keep/}).click()
 assert.deepEqual(await read(g=>[g.scene.mode,g.scene.player.x,g.scene.player.y]),['castle',440,270])
 await page.keyboard.press('KeyE')
 assert.equal(await read(g=>g.paused),false)
 await walk('KeyA','x',101,-1)
 await page.keyboard.down('KeyW')
 await page.waitForTimeout(1100)
 await page.keyboard.up('KeyW')
 assert.ok(await read(g=>g.scene.player.y>=193),JSON.stringify(await read(g=>[g.scene.player.x,g.scene.player.y])))
 await walk('KeyD','x',130,1)
 await walk('KeyW','y',112,-1)
 await page.getByText(/Press E · Talk to Mara/).waitFor()
 await page.keyboard.press('KeyE')
 await page.getByRole('heading',{name:'Blacksmith',exact:true}).waitFor()
 const smithPosition=await read(g=>g.scene.player.y)
 await page.keyboard.down('KeyS')
 await page.waitForTimeout(170)
 await page.keyboard.up('KeyS')
 assert.equal(await read(g=>g.scene.player.y),smithPosition)
 await page.keyboard.press('Escape')
 assert.equal(await read(g=>g.scene.player.y),smithPosition)
 for(const name of ['Main Hall','Training Grounds','Alchemist','Treasury','Watchtower']){
  await atStation(name)
  await page.getByRole('heading',{name:name==='Main Hall'?'The steward':name,exact:true}).waitFor()
  await page.keyboard.press('Escape')
 }
 await read(g=>g.scene.player.setPosition(440,270))
 await walk('KeyS','y',337,1)
 await walk('KeyD','x',787,1)
 await walk('KeyW','y',285,-1)
 await page.getByText(/Press E · Enter the dungeon/).waitFor()
 await page.keyboard.press('KeyE')
 await page.getByRole('button',{name:/Begin descent/}).click()
 await page.waitForSelector('.status')
 assert.match(await page.locator('.status').innerText(),/100 \/ 100 HP/)
 await page.keyboard.press('KeyR')
 await page.getByText(/No relics collected this run/).waitFor()
 await page.keyboard.press('KeyR')
 await page.keyboard.down('KeyD')
 await page.waitForTimeout(350)
 await page.keyboard.up('KeyD')
 assert.ok(await read(g=>g.scene.player.x)>270)
 await page.keyboard.press('Space')
 await page.waitForTimeout(130)
 assert.ok(await read(g=>g.scene.nextRoll>g.scene.elapsed&&g.scene.invulnerable>=g.scene.rollUntil))
 await page.keyboard.press('KeyQ')
 const canvas=page.locator('canvas')
 await canvas.hover()
 await page.mouse.wheel(0,100)
 assert.match(await page.locator('.selected').innerText(),/Rusty Sword/)
 assert.match(await page.locator('.loadout').innerText(),/Locked · Ranged Weapon Training/)
 assert.equal(await read(g=>g.loadout[1]),null)
 await read(g=>{g.finish(false);g.gold(125)})
 await page.getByRole('button',{name:'Return to castle'}).click()
 await atStation('Training Grounds')
 await page.getByRole('button',{name:/^Ranged Weapon Training 0/}).click()
 await page.getByRole('button',{name:'Back to castle'}).click()
 await atStation('Dungeon Gate')
 await page.getByRole('button',{name:/Begin descent/}).click()
 await page.keyboard.press('KeyQ')
 assert.match(await page.locator('.selected').innerText(),/Wooden Bow/)
 assert.deepEqual(await read(g=>g.loadout.map(w=>w.slot)),[0,1])
 await canvas.hover()
 await page.mouse.wheel(0,100)
 await page.locator('.selected').filter({hasText:'Rusty Sword'}).waitFor()
 await page.keyboard.press('KeyQ')
 await page.keyboard.press('Tab')
 await page.getByRole('img',{name:'Expanded dungeon map'}).waitFor()
 await page.keyboard.press('Tab')
 const id=await read(g=>g.rooms[0].neighbors[0])
 await read(g=>{g.scene.player.setPosition(488,144)})
 await page.keyboard.down('KeyD')
 await page.waitForTimeout(530)
 await page.keyboard.up('KeyD')
 assert.equal(await read(g=>g.scene.foes.length),6)
 assert.ok(await read(g=>g.scene.foes.every(f=>f.hp>=42&&f.damage>=14)))
 assert.deepEqual(await read(g=>[g.room.id,g.scene.locked]),[id,true],JSON.stringify(await read(g=>({p:[g.scene.player.x,g.scene.player.y],paused:g.paused,menu:g.menu}))))
 const timing=await read(g=>{
  const scene=g.scene,p=scene.player
  const melee=scene.foes.find(foe=>foe.role==='melee')
  const ranged=scene.foes.find(foe=>foe.role==='ranged')
  if(!melee||!ranged)return null
  const health=g.hp
  melee.x=240;melee.y=144;melee.next=scene.elapsed;melee.strike=0
  p.setPosition(180,144)
  scene.shots=[];scene.flashes=[];scene.hazards=[]
  scene.enemy(melee,.05)
  const chasing=melee.x<240&&melee.sprite.angle===0&&melee.sprite.scaleX===1
  const methods=['lineBetween','strokeCircle','fillCircle']
  const originals=methods.map(method=>scene.fx[method])
  let indicators=0
  methods.forEach((method,i)=>{scene.fx[method]=function(...args){indicators++;return originals[i].apply(this,args)}})
  scene.renderFX(0)
  methods.forEach((method,i)=>{scene.fx[method]=originals[i]})
  p.setPosition(melee.x-16,melee.y)
  scene.invulnerable=0
  const before=melee.attacks
  scene.enemy(melee,.016)
  const immediateDamage=health-g.hp
  const meleeOnCooldown=melee.next>scene.elapsed&&melee.attacks===before+1
  const afterStrike=melee.x
  p.setPosition(melee.x-60,melee.y)
  scene.enemy(melee,.016)
  const meleeMovedOnCooldown=melee.x<afterStrike&&melee.attacks===before+1
  ranged.x=320;ranged.y=144;ranged.next=scene.elapsed
  const shots=scene.shots.length
  scene.enemy(ranged,.016)
  const fired=scene.shots.length-shots
  const location={x:ranged.x,y:ranged.y}
  scene.enemy(ranged,.016)
  const rangedCooldown=ranged.next>scene.elapsed&&scene.shots.length===shots+fired
  const rangedMovedOnCooldown=Math.hypot(ranged.x-location.x,ranged.y-location.y)>0
  g.hp=health;scene.invulnerable=scene.elapsed+1000
  return {chasing,indicators,immediateDamage,baseDamage:melee.damage,meleeOnCooldown,meleeMovedOnCooldown,fired,rangedCooldown,rangedMovedOnCooldown,
   upright:melee.sprite.angle===0&&ranged.sprite.angle===0}
 })
 assert.ok(timing?.chasing&&timing.indicators===0&&timing.immediateDamage===Math.round(timing.baseDamage*.75)&&timing.meleeOnCooldown&&timing.meleeMovedOnCooldown&&
  timing.fired===1&&timing.rangedCooldown&&timing.rangedMovedOnCooldown&&timing.upright,JSON.stringify(timing))
 const eliteTiming=await read(g=>{
  const scene=g.scene,player=scene.player
  const elite=scene.spawn(305,145,4)
  elite.elite=true;elite.role='special';elite.next=scene.elapsed
  player.setPosition(240,145)
  const hazards=scene.hazards.length
  scene.enemy(elite,.016)
  const immediate=scene.hazards.length===hazards+1&&elite.next>scene.elapsed&&elite.sprite.angle===0
  scene.enemy(elite,.016)
  const cooledDown=scene.hazards.length===hazards+1
  elite.sprite.destroy()
  scene.foes.pop()
  scene.hazards.length=hazards
  return immediate&&cooledDown
 })
 assert.ok(eliteTiming)
 await read(g=>{const f=g.scene.foes[0];g.scene.player.setPosition(f.x-38,f.y);g.scene.nextAttack=0})
 const area=await page.locator('canvas').boundingBox()
 const point=await read(g=>({x:g.scene.foes[0].x,y:g.scene.foes[0].y}))
 await page.mouse.click(area.x+area.width*point.x/512,area.y+area.height*point.y/288)
 await page.waitForTimeout(450)
 assert.ok(await read(g=>g.scene.foes.some(f=>f.hp<f.max)))
 await page.keyboard.press('KeyQ')
 await read(g=>{const f=g.scene.foes[0];g.scene.player.setPosition(f.x-18,f.y);g.scene.nextAttack=0})
 const melee=await read(g=>({x:g.scene.foes[0].x,y:g.scene.foes[0].y,total:g.scene.foes.reduce((sum,f)=>sum+f.hp,0)}))
 await page.mouse.click(area.x+area.width*melee.x/512,area.y+area.height*melee.y/288)
 await page.waitForTimeout(80)
 assert.ok(await read(g=>g.scene.foes.reduce((sum,f)=>sum+f.hp,0))<melee.total)
 await read(g=>{
  g.contract={name:'Blunted Oath',remaining:1}
  for(const foe of g.scene.foes)g.scene.damage(foe,10000)
 })
 await page.waitForTimeout(140)
 assert.deepEqual(await read(g=>[g.room.cleared,g.scene.locked,g.blessed('Blunted Oath')]),[true,false,true])
 await read(g=>{g.scene.player.setPosition(17,144)})
 await page.waitForTimeout(120)
 assert.equal(await read(g=>g.room.kind),'Entry')
 await read(g=>g.enter(g.rooms.find(r=>r.kind==='Shop').id,0,0))
 await page.keyboard.press('KeyF')
 await page.getByText('Dungeon provisions',{exact:true}).waitFor()
 const offers=await page.locator('.panel .cards button').allTextContents()
 assert.deepEqual(offers,['Large potion17 gold','Field tonic22 gold','Dodge draught12 gold','Leave shop'])
 await read(g=>g.gold(80))
 await page.getByRole('button',{name:'Leave shop'}).click()
 await page.keyboard.press('KeyF')
 const balance=await read(g=>g.save.gold)
 await page.getByRole('button',{name:/^Field tonic/}).click()
 assert.equal(await read(g=>g.save.gold),balance-22)
 assert.ok(await read(g=>g.statsBonus>=.08))
 await page.getByRole('button',{name:'Leave shop'}).click()
 await page.keyboard.press('KeyI')
 await page.getByRole('heading',{name:'Equipped weapons'}).waitFor()
 assert.equal(await page.getByRole('button',{name:/Equip /}).count(),0)
 assert.deepEqual(await read(g=>g.loadout.map(w=>w?.name)),['Rusty Sword','Wooden Bow'])
 await page.keyboard.press('KeyI')
 await read(g=>g.craft())
 assert.equal(await read(g=>g.menu),'run')
 await read(g=>g.enter(g.rooms.find(r=>r.kind==='Treasure').id,0,0))
 await page.keyboard.press('KeyF')
 const beforeChest=await read(g=>g.save.materials)
 await page.evaluate(()=>{
  const open=[...document.querySelectorAll('.panel button')].find(button=>button.textContent==='Open chest')
  open.addEventListener('click',()=>{
   const original=Math.random
   Math.random=()=>0.05
   setTimeout(()=>{Math.random=original},0)
  },{capture:true,once:true})
 })
 await page.getByRole('button',{name:'Open chest'}).click()
 assert.equal(await read(g=>g.save.materials),beforeChest+1)
 assert.equal(await page.locator('.panel .cards button').count(),1)
 await page.locator('.panel .cards button').first().click()
 assert.equal(await read(g=>g.menu),'run')
 assert.ok(await read(g=>g.levels.size===1&&g.equipped.filter(Boolean).length===1))
 await read(async g=>{
  // Controlled loot fixtures for evolution and the discovery HUD.
  const {relics}=await import('/src/data.ts')
  const compass=relics.find(r=>r.name==='Glass Compass')
  for(let i=0;i<3;i++)g.addRelic(compass,()=>{})
 })
 assert.equal(await read(g=>g.relicLevel('Glass Compass')),3)
 assert.equal(await read(g=>(g.mapMarkup(true).match(/<rect/g)||[]).length),await read(g=>g.rooms.length))
 await read(async g=>{
  const {relics}=await import('/src/data.ts')
  g.resetRelics()
  for(const name of ['Blood Chalice','Cinder Heart','Rime Seal','Glass Compass','Sun Bell'])g.addRelic(relics.find(r=>r.name===name),()=>{})
 })
 assert.deepEqual(await read(g=>[g.levels.size,g.equipped.filter(Boolean).length,g.power,g.active.name]),[5,3,.6,'Blood Chalice'])
 assert.equal(await page.locator('.hud-relic').count(),3)
 await page.keyboard.press('KeyR')
 await page.getByRole('heading',{name:'Relic equipment'}).waitFor()
 assert.ok(await read(g=>g.paused))
 assert.match(await page.locator('.relic-equipment').innerText(),/60% power/)
 await page.getByTitle('Unequip Rime Seal',{exact:true}).click()
 assert.match(await page.locator('.relic-equipment').innerText(),/80% power/)
 await page.getByTitle('Unequip Cinder Heart',{exact:true}).click()
 assert.match(await page.locator('.relic-equipment').innerText(),/100% power/)
 await page.getByRole('button',{name:/Sun Bell/}).click()
 await page.getByTitle('Equip Sun Bell in slot 1',{exact:true}).click()
 assert.equal(await read(g=>g.active.name),'Sun Bell')
 await page.getByTitle('Unequip Sun Bell',{exact:true}).click()
 await page.keyboard.press('KeyR')
 assert.equal(await read(g=>g.paused),false)
 await read(g=>{g.hp=50;g.scene.activate()})
 assert.equal(await read(g=>g.hp),50)
 await read(async g=>{
  const {relics}=await import('/src/data.ts')
  for(const [index,name] of ['Blood Chalice','Cinder Heart','Rime Seal'].entries())g.equipRelic(relics.find(r=>r.name===name),index)
 })
 await page.keyboard.press('KeyE')
 await page.waitForFunction(async()=>{const{game}=await import('/src/main.ts');return game.charge===0})
 assert.ok(Math.abs(await read(g=>g.hp)-67.4)<.01)
 await read(g=>{g.gold(600);g.save.blueprints.push('Grave Axe');g.persist()})

 const miniReport=await read(async g=>{
  const {minibosses}=await import('/src/miniboss.ts')
  const {weapons}=await import('/src/data.ts')
  const scene=g.scene
  const report=[]
  const original=Math.random
  Math.random=()=>.99
  try{
   g.resetRelics();g.blessings.clear();g.statsBonus=0
   const start=(floor,patch)=>{
    g.beginFloor(floor)
    g.enter(g.rooms.find(r=>r.kind==='Miniboss'&&r.patch===patch).id,0,0)
    scene.player.setPosition(220,144)
    scene.invulnerable=Infinity
    return scene.foes[0]
   }
   for(const [floor,profiles] of minibosses.entries()){
    for(const [patch,profile] of profiles.entries()){
     let foe=start(floor,patch)
     const attacks=new Set()
     const stages=[]
     for(const [phase,ratio] of [1,.69,.34].entries()){
      foe.hp=foe.max*ratio
      const activity=()=>scene.foes.length+scene.shots.length+scene.hazards.length+scene.flashes.length
      const before=activity()
      scene.enemy(foe,.016)
      if(phase>0){
       if(foe.miniWarning?.attack!=='phase'||activity()!==before)throw Error('Missing phase warning')
       scene.elapsed=foe.miniWarning.at
       scene.enemy(foe,.016)
      }
      const special=phase===0||activity()>before
      stages.push({current:foe.phase,special})
      const use=scene.useMiniAttack
      let executed
      scene.useMiniAttack=function(foe,attack,aim){executed=attack;return use.call(this,foe,attack,aim)}
      for(const attack of profile.phases[phase]){
       foe.miniWarning=undefined;foe.next=scene.elapsed
       foe.x=268;foe.y=144
       foe.attacks=profile.phases[phase].indexOf(attack)
       executed=undefined
       scene.enemy(foe,.016)
       const warning=foe.miniWarning
       if(executed||!warning||warning.at<=scene.elapsed)continue
       const line=scene.fx.lineBetween,circle=scene.fx.strokeCircle
       let visible=false
       scene.fx.lineBetween=function(...args){visible=true;return line.apply(this,args)}
       scene.fx.strokeCircle=function(...args){visible=true;return circle.apply(this,args)}
       scene.renderFX(0)
       scene.fx.lineBetween=line;scene.fx.strokeCircle=circle
       scene.elapsed=warning.at
       scene.enemy(foe,.016)
       if(visible&&executed===attack&&foe.next>scene.elapsed&&foe.strike>scene.elapsed&&foe.sprite.angle===0)attacks.add(attack)
      }
      scene.useMiniAttack=use
     }
     foe=start(floor,patch)
     g.slot=0;g.loadout[0]=weapons[0]
     foe.x=270;foe.y=144;foe.resistUntil=Infinity
     scene.player.setPosition(232,144)
     let hits=0
     while(foe.hp>0&&hits<45){scene.attack(0);hits++;scene.elapsed+=350}
     report.push({name:profile.name,stages,attacks:attacks.size,hits})
    }
   }
   const weaponsTest=[]
   for(const weapon of weapons){
    const target=start(0,0)
    target.x=271;target.y=144;target.resistUntil=Infinity
    scene.player.setPosition(240,144)
    g.slot=weapon.slot;g.loadout[weapon.slot]=weapon
    scene.attack(0)
    for(const shot of scene.shots)scene.collision(shot,138,.138)
    weaponsTest.push({name:weapon.name,damage:target.max-target.hp,expected:weapon.damage})
   }
   const target=start(0,0)
   const {relics}=await import('/src/data.ts')
   const forks=relics.find(r=>r.name==='Forked Bolt')
   for(let i=0;i<3;i++)g.addRelic(forks,()=>{})
   g.save.upgrades.Marksmanship=2
   g.slot=1;g.loadout[1]=weapons.find(w=>w.name==='Storm Staff')
   target.x=267;target.y=144;target.resistUntil=Infinity
   scene.player.setPosition(245,144)
   Math.random=()=>0
   scene.attack(0)
   for(const shot of scene.shots)scene.collision(shot,98,.098)
   const maxVolley=g.loadout[1].damage*1.24*1.6*1.24
   const actualVolley=target.max-target.hp
   delete g.save.upgrades.Marksmanship
   g.resetRelics()
   const walker=start(0,0)
   walker.next=Infinity
   const pillar=scene.pillars[0]
   walker.x=pillar.x-32;walker.y=pillar.y
   scene.player.setPosition(pillar.x+100,pillar.y)
   for(let frame=0;frame<180;frame++){scene.elapsed+=16;scene.enemy(walker,.016)}
   const clearedPillar=walker.x>pillar.x+25&&scene.arenaOpen(walker,walker.radius)
   scene.shots=[];scene.flashes=[]
   scene.hazards=[{x:300,y:120,r:25,damage:20,color:0xff3333,life:scene.elapsed+650}]
   const fill=scene.fx.fillCircle
   let circles=0
   scene.fx.fillCircle=function(...args){circles++;return fill.apply(this,args)}
   scene.renderFX(0)
   const before=circles
   scene.elapsed+=650
   scene.renderFX(0)
   const after=circles
   scene.fx.fillCircle=fill
   return {report,weaponsTest,actualVolley,maxVolley,before,after,clearedPillar}
  }finally{Math.random=original}
 })
 for(const profile of miniReport.report){
  assert.deepEqual(profile.stages,[{current:0,special:true},{current:1,special:true},{current:2,special:true}],profile.name)
  assert.ok(profile.attacks>=4,profile.name)
  assert.ok(profile.hits>=25&&profile.hits<=40,JSON.stringify(profile))
 }
 for(const weapon of miniReport.weaponsTest)assert.ok(Math.abs(weapon.damage-weapon.expected)<.01,JSON.stringify(weapon))
 assert.ok(Math.abs(miniReport.actualVolley-miniReport.maxVolley)<.01,JSON.stringify(miniReport))
 assert.equal(miniReport.before,1)
 assert.equal(miniReport.after,1)
 assert.ok(miniReport.clearedPillar)
 await read(async g=>{
  const {weapons}=await import('/src/data.ts')
  g.beginFloor(0)
  g.enter(g.rooms.find(r=>r.kind==='Miniboss').id,0,0)
  g.loadout= g.save.loadout.map(name=>weapons.find(w=>w.name===name)??null)
  g.slot=0
 })
 const miniBalances=await read(g=>[g.save.gold,g.save.materials,g.levels.size])
 await read(g=>g.scene.damage(g.scene.foes[0],100000))
 await page.getByText('Miniboss reward',{exact:true}).waitFor()
 await page.locator('.panel .cards button').first().click()
 assert.deepEqual(await read(g=>[g.save.gold,g.save.materials,g.levels.size]),[miniBalances[0]+8,miniBalances[1],miniBalances[2]+1])
 for(const [name,material] of [['Skeleton King','Cursed Bone'],['Blighted Guardian','Blighted Heart'],['Fallen King','Infernal Core']]){
  await read(g=>g.enter(g.rooms.find(r=>r.kind==='Boss').id,0,0))
  assert.equal(await page.locator('.boss').innerText(),name)
  const dodge=await read(g=>{
   const scene=g.scene,foe=scene.foes[0],health=g.hp
   foe.x=100;foe.y=100
   scene.player.setPosition(126,100)
   foe.next=scene.elapsed
   const attacks=foe.attacks
   scene.invulnerable=scene.elapsed+205
   scene.enemy(foe,.016)
   return {health,after:g.hp,damage:foe.damage,max:foe.max,immediate:foe.attacks===attacks+1&&foe.next>scene.elapsed}
  })
  assert.equal(dodge.health,dodge.after)
  assert.ok(dodge.damage>=24&&dodge.max>=570&&dodge.immediate)
  await read(g=>g.scene.damage(g.scene.foes[0],100000))
  await page.getByText('Main boss defeated',{exact:true}).waitFor()
  const rewardNames=await page.locator('.panel .cards button').evaluateAll(buttons=>buttons.map(button=>button.firstChild.textContent))
  const relicNames=await page.evaluate(async()=> (await import('/src/data.ts')).relics.map(r=>r.name))
  assert.equal(new Set(rewardNames).size,3)
  assert.ok(rewardNames.every(name=>relicNames.includes(name)))
  await page.getByText(new RegExp('^\\+1 '+material)).waitFor()
  assert.equal(await page.evaluate(async material=>(await import('/src/main.ts')).game.save.bossMaterials[material],material),1)
  await page.locator('.panel .cards button').first().click()
  const equip=page.getByRole('button',{name:/^Keep /})
  if(await equip.isVisible())await equip.click()
 }
 await page.getByRole('button',{name:'Complete normal run'}).click()
 await page.getByText('The Fallen King is slain',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Return to castle'}).click()
 assert.equal(await read(g=>g.save.victories),1)
 assert.equal(await read(g=>g.save.materials),1)
 assert.deepEqual(await read(g=>Object.values(g.save.bossMaterials)),[1,1,1,0])
 await read(g=>{
  g.newRun()
  g.enter(g.rooms.find(r=>r.kind==='Boss').id,0,0)
  g.scene.damage(g.scene.foes[0],100000)
 })
 await page.getByText('Main boss defeated',{exact:true}).waitFor()
 await page.locator('.panel .cards button').first().click()
 await read(g=>g.hurt(9999))
 await page.getByText('Fallen in battle',{exact:true}).waitFor()
 assert.deepEqual(await read(g=>Object.values(g.save.bossMaterials)),[2,1,1,0])
 await page.getByRole('button',{name:'Return to castle'}).click()
 const annex=()=>read(g=>g.scene.castleWalls.some(wall=>wall.kind==='annex'&&wall.x===(g.scene.player.x<200?168:788)))
 await atStation('Blacksmith')
 assert.ok(await annex())
 await page.getByText(/Cursed Bone 2 · Blighted Heart 1 · Infernal Core 1 · Abyssal Essence 0/).waitFor()
 const axe=page.locator('.forge-recipe').filter({has:page.getByRole('heading',{name:'Grave Axe',exact:true})})
 await axe.getByText('Ready to craft',{exact:true}).waitFor()
 await axe.getByText('Blueprint discovered',{exact:true}).waitFor()
 const beforeCraft=await read(g=>g.save.gold)
 await axe.getByRole('button',{name:'Craft Grave Axe'}).click()
 assert.equal(await read(g=>g.save.gold),beforeCraft-30)
 await axe.getByText('Crafted',{exact:true}).waitFor()
 await axe.getByRole('button',{name:'Equip Grave Axe'}).click()
 await axe.getByText('Equipped',{exact:true}).waitFor()
 assert.deepEqual(await read(g=>g.save.loadout),['Grave Axe','Wooden Bow'])
 assert.deepEqual(await read(g=>Object.values(g.save.bossMaterials)),[0,1,1,0])
 await page.getByRole('button',{name:'Workshop upgrades'}).click()
 await page.getByRole('button',{name:/^Forge 0/}).click()
 assert.equal(await annex(),false)
 await page.keyboard.press('Escape')
 await atStation('Watchtower')
 assert.ok(await annex())
 await page.getByRole('button',{name:/^Fleet Step 0/}).click()
 assert.equal(await annex(),false)
 await page.keyboard.press('Escape')
 await atStation('Training Grounds')
 await page.getByRole('button',{name:/^Vitality 0/}).click()
 await page.reload()
 await page.getByText('The Last Keep',{exact:true}).waitFor()
 assert.equal(await read(g=>g.scene.mode),'castle')
 assert.ok(await read(g=>g.scene.castleWalls.every(wall=>wall.kind!=='annex')))
 assert.deepEqual(await read(g=>[g.save.upgrades.Vitality,g.save.unlocked.includes('Grave Axe'),g.save.victories,...g.save.loadout]),[1,true,1,'Grave Axe','Wooden Bow'])
 await atStation('Dungeon Gate')
 await page.getByText('Swift Foes',{exact:true}).waitFor()
 await page.getByRole('button',{name:/Begin descent/}).click()
 assert.deepEqual(await read(g=>g.loadout.map(w=>w?.name)),['Grave Axe','Wooden Bow'])
 const balances=await read(g=>[g.save.gold,g.save.materials])
 await read(g=>g.hurt(9999))
 await page.getByText('Fallen in battle',{exact:true}).waitFor()
 assert.equal(await read(g=>g.scene.mode),'castle')
 assert.deepEqual(await read(g=>[g.save.gold,g.save.materials]),balances)
 assert.ok(await read(g=>g.save.unlocked.includes('Grave Axe')))
 const enterAbyss=async ()=>{
  const size=await read(g=>{
   g.newRun()
   g.beginFloor(2)
   g.enter(g.rooms.find(r=>r.kind==='Boss').id,0,0)
   g.scene.damage(g.scene.foes[0],100000)
   return g.rooms.length
  })
  await page.getByText('Main boss defeated',{exact:true}).waitFor()
  await page.locator('.panel .cards button').first().click()
  await page.getByRole('button',{name:'Stay in the throne room'}).click()
  assert.equal(await read(g=>g.room.portal),true)
  await page.keyboard.press('KeyF')
  await page.getByRole('button',{name:'Enter the Abyss'}).click()
  assert.deepEqual(await read(g=>[g.floor,g.rooms.length]),[3,Math.round(size*3/8)])
  await page.getByText('4 · Abyssal Depths',{exact:true}).waitFor()
 }
 await enterAbyss()
 await page.keyboard.press('Tab')
 await page.getByRole('heading',{name:'Abyssal Depths',exact:true}).waitFor()
 await page.keyboard.press('Tab')
 const abyssCombat=await read(async g=>{
  const scene=g.scene
  const {abyssEnemies,overlordPhases}=await import('/src/abyss.ts')
  const room=g.rooms.find(r=>r.kind==='Combat')
  const profiles=[]
  const perform=scene.abyssAttack
  let executed
  scene.abyssAttack=function(foe,attack,aim){executed=attack;return perform.call(this,foe,attack,aim)}
  for(const [index,expected] of abyssEnemies.entries()){
   g.enter(room.id,0,0)
   const foe=scene.foes.find(f=>f.kind===index)
   scene.player.setPosition(215,141)
   scene.invulnerable=Infinity
   foe.x=280;foe.y=141;foe.next=scene.elapsed
   const x=foe.x,shots=scene.shots.length
   executed=undefined
   scene.enemy(foe,.016)
   profiles.push({name:foe.abyss.name,attack:executed,expected:expected.patterns[0],worked:foe.next>scene.elapsed&&foe.sprite.angle===0&&
    (foe.x!==x||scene.shots.length>shots||scene.pending.length>0||scene.foes.some(f=>f.summoned))})
  }
  g.enter(g.rooms.find(r=>r.kind==='Boss').id,0,0)
  const boss=scene.foes[0],stages=[]
  for(const [phase,ratio] of [1,.74,.49,.24].entries()){
   scene.player.setPosition(225,145)
   boss.x=276;boss.y=145;boss.hp=boss.max*ratio
   scene.invulnerable=Infinity
   const activity=()=>scene.hazards.length+scene.shots.length+scene.foes.length+scene.flashes.length
   const before=activity()
   scene.enemy(boss,.016)
   const transition=phase===0||activity()>before
   boss.x=276;boss.y=145;boss.attacks=0;boss.next=scene.elapsed
   const expected=overlordPhases[phase].patterns[0]
   executed=undefined
   scene.enemy(boss,.016)
   stages.push({phase:boss.phase,attack:executed,expected,worked:boss.strike>scene.elapsed&&boss.next>scene.elapsed&&boss.sprite.angle===0&&transition})
  }
  scene.abyssAttack=perform
  const {weapons}=await import('/src/data.ts')
  const old=g.loadout[0]
  g.loadout[0]=weapons.find(w=>w.name==='Abyssal Greatsword');g.slot=0
  scene.player.setPosition(185,145);boss.x=310;boss.y=145
  const before=boss.hp
  for(let hit=0;hit<4;hit++)scene.attack(0)
  const crescent=scene.shots.find(shot=>shot.crescent)
  if(crescent)scene.collision(crescent,555,.555)
  g.loadout[0]=old
  return {profiles,stages,health:boss.max,damage:boss.damage,crescentHit:boss.hp<before}
 })
 assert.equal(abyssCombat.profiles.length,5)
 assert.equal(abyssCombat.stages.length,4)
 for(const [phase,result] of abyssCombat.stages.entries()){
  assert.equal(result.phase,phase)
  assert.equal(result.attack,result.expected,JSON.stringify(result))
  assert.ok(result.worked,JSON.stringify(result))
 }
 for(const result of abyssCombat.profiles){
  assert.equal(result.attack,result.expected,JSON.stringify(result))
  assert.ok(result.worked,JSON.stringify(result))
 }
 assert.ok(abyssCombat.health>=2700&&abyssCombat.damage>=54&&abyssCombat.crescentHit)
 await read(g=>{
  for(const foe of g.scene.foes)g.scene.damage(foe,100000)
  const random=Math.random
  Math.random=()=>0
  try{g.clear()}finally{Math.random=random}
 })
 await page.getByText(/\+1 Abyssal Essence/).waitFor()
 await page.locator('.panel .cards button').first().click()
 await page.locator('.abyss-victory').getByText('The Abyssal Overlord is slain',{exact:true}).waitFor()
 assert.deepEqual(await read(g=>[g.save.victories,g.save.abyssVictories,g.save.bossMaterials['Abyssal Essence'],g.save.blueprints.includes('Abyssal Greatsword')]),[2,1,1,true])
 await page.getByRole('button',{name:'Return to castle'}).click()
 await enterAbyss()
 const abyssWallet=await read(g=>[g.save.gold,g.save.bossMaterials,g.save.victories,g.save.abyssVictories])
 await read(g=>g.hurt(9999))
 await page.getByText(/Normal victory recorded/).waitFor()
 await page.reload()
 await page.getByText('The Last Keep',{exact:true}).waitFor()
 assert.deepEqual(await read(g=>[g.save.gold,g.save.bossMaterials,g.save.victories,g.save.abyssVictories]),abyssWallet)
 assert.deepEqual(errors,[])
 console.log('Chromium smoke test passed')
} finally {
 await browser?.close()
 server.kill()
}
