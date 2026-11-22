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
 await page.goto(host)
 await page.locator('canvas').waitFor()
 await page.getByRole('button',{name:/Enter the Keep/}).click()
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
 await page.getByRole('button',{name:/^Castle upgrades/}).click()
 await page.getByRole('button',{name:/^Ranged Weapon Training 0/}).click()
 await page.getByRole('button',{name:'Back to castle'}).click()
 await page.getByRole('button',{name:/Begin descent/}).click()
 await page.keyboard.press('KeyQ')
 assert.match(await page.locator('.selected').innerText(),/Wooden Bow/)
 assert.deepEqual(await read(g=>g.loadout.map(w=>w.slot)),[0,1])
 await page.keyboard.press('Tab')
 await page.getByRole('img',{name:'Expanded dungeon map'}).waitFor()
 await page.keyboard.press('Tab')
 const id=await read(g=>g.rooms[0].neighbors[0])
 await read(g=>{g.scene.player.setPosition(488,144)})
 await page.keyboard.down('KeyD')
 await page.waitForTimeout(530)
 await page.keyboard.up('KeyD')
 assert.deepEqual(await read(g=>[g.room.id,g.scene.locked]),[id,true],JSON.stringify(await read(g=>({p:[g.scene.player.x,g.scene.player.y],paused:g.paused,menu:g.menu}))))
 const meleeCheck=await read(g=>{
  const scene=g.scene
  const existing=scene.foes.find(foe=>foe.role==='melee')
  if(!existing)return null
  const previous=scene.elapsed
  const player=scene.player
  scene.player.setPosition(existing.x-80,existing.y)
  const priorGap=Math.hypot(existing.x-player.x,existing.y-player.y)
  existing.warn=0
  existing.next=previous-1
  scene.enemy(existing,.08)
  const chased=Math.hypot(existing.x-player.x,existing.y-player.y)<priorGap
  player.setPosition(existing.x-16,existing.y)
  scene.enemy(existing,.016)
  const telegraph=existing.warn>previous&&existing.sprite.angle!==0
  const priorShots=scene.shots
  scene.shots=[]
  const lineBetween=scene.fx.lineBetween
  let warningLines=0
  scene.fx.lineBetween=function(...args){warningLines++;return lineBetween.apply(this,args)}
  scene.renderFX(0)
  scene.fx.lineBetween=lineBetween
  scene.shots=priorShots
  const health=g.hp, shots=scene.shots.length
  scene.elapsed=existing.warn
  scene.invulnerable=0
  scene.enemy(existing,.016)
  const result={chased,telegraph,warningLines,damage:health-g.hp,shots:scene.shots.length-shots}
  g.hp=health
  return result
 })
 assert.ok(meleeCheck?.chased&&meleeCheck.telegraph&&meleeCheck.damage>=11&&meleeCheck.shots===0&&meleeCheck.warningLines===0,JSON.stringify(meleeCheck))
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
 assert.equal(offers.length,6)
 assert.ok(offers.every(offer=>!/relic|blueprint|material/i.test(offer)))
 await read(g=>g.gold(80))
 await page.getByRole('button',{name:'Leave shop'}).click()
 await page.keyboard.press('KeyF')
 const meleeOffer=page.locator('.panel .cards button').first()
 const purchased=await meleeOffer.evaluate(button=>button.firstChild.textContent)
 const balance=await read(g=>g.save.gold)
 await meleeOffer.click()
 await page.getByRole('button',{name:'Buy to inventory'}).click()
 assert.equal(await read(g=>g.save.gold),balance-34)
 await page.getByRole('button',{name:'Leave shop'}).click()
 await page.keyboard.press('KeyI')
 await page.getByRole('heading',{name:'Carried weapons'}).waitFor()
 await page.getByRole('button',{name:new RegExp('^'+purchased)}).click()
 assert.equal(await read(g=>g.loadout[0].name),purchased)
 await page.getByRole('button',{name:/^Rusty Sword/}).click()
 assert.equal(await read(g=>g.loadout[0].name),'Rusty Sword')
 assert.equal(await read(g=>g.carriedWeapons.size),3)
 await page.keyboard.press('KeyI')
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
 await page.locator('.panel .cards button').first().click()
 const leave=page.getByRole('button',{name:'Leave it'})
 if(await leave.isVisible())await leave.click()
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
 await read(g=>{g.gold(200);g.save.blueprints.push('Grave Axe');g.persist()})

 for(const name of ['Skeleton King','Blighted Guardian','Fallen King']){
  await read(g=>g.enter(g.rooms.find(r=>r.kind==='Boss').id,0,0))
  assert.equal(await page.locator('.boss').innerText(),name)
  await read(g=>g.scene.damage(g.scene.foes[0],100000))
  await page.getByText('Main boss defeated',{exact:true}).waitFor()
  await page.locator('.panel .cards button').first().click()
  const equip=page.getByRole('button',{name:/^Keep /})
  if(await equip.isVisible())await equip.click()
 }
 await page.getByText('The Fallen King is slain',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Return to castle'}).click()
 assert.equal(await read(g=>g.save.victories),1)
 assert.ok(await read(g=>g.save.materials)>=9)
 await page.getByRole('button',{name:/^Blacksmith/}).click()
 await page.getByRole('button',{name:/^Grave Axe/}).click()
 await page.getByRole('button',{name:'Back to castle'}).click()
 await page.getByRole('button',{name:/^Castle upgrades/}).click()
 await page.getByRole('button',{name:/^Vitality 0/}).click()
 await page.reload()
 await page.getByRole('button',{name:/Enter the Keep/}).click()
 assert.deepEqual(await read(g=>[g.save.upgrades.Vitality,g.save.unlocked.includes('Grave Axe'),g.save.victories,g.save.loadout[1]]),[1,true,1,'Wooden Bow'])
 await page.getByRole('button',{name:/^Challenges/}).click()
 await page.getByText('Swift Foes',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Back to castle'}).click()
 await page.getByRole('button',{name:/Begin descent/}).click()
 const balances=await read(g=>[g.save.gold,g.save.materials])
 await read(g=>g.hurt(9999))
 await page.getByText('Fallen in battle',{exact:true}).waitFor()
 assert.deepEqual(await read(g=>[g.save.gold,g.save.materials]),balances)
 assert.equal(await read(g=>g.carriedWeapons.size),0)
 assert.deepEqual(errors,[])
 console.log('Chromium smoke test passed')
} finally {
 await browser?.close()
 server.kill()
}
