import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generate, generateAbyss, floors} from '../src/dungeon.ts'
import {contractClear, decode, fresh, rangedTraining, relicLevel, unlockRanged, upgradeCost, upgrades} from '../src/data.ts'
import {economy, encounters, relicPower} from '../src/balance.ts'

test('300 layouts contain every room type and connect every patch to its miniboss',()=>{
 const types=['Entry','Combat','Treasure','Shop','Curse Altar','Secret','Trap','Miniboss','Boss','Event','Blacksmith']
 for(let seed=1;seed<=300;seed++){
  let state=seed
  const rooms=generate(()=>((state=Math.imul(1664525,state)+1013904223>>>0)/2**32))
  assert.equal(new Set(rooms.map(r=>r.x+','+r.y)).size,rooms.length)
  for(const type of types)assert.ok(rooms.some(r=>r.kind===type),type)
  assert.equal(rooms.filter(room=>room.fountain).length,1)
  const visit=(start,allowed)=>{
   const seen=new Set(),pending=[start]
   while(pending.length){
    const id=pending.pop()
    if(seen.has(id)||!allowed(rooms[id]))continue
    seen.add(id);pending.push(...rooms[id].neighbors)
   }
   return seen
  }
  assert.equal(visit(0,()=>true).size,rooms.length)
  for(const r of rooms)for(const id of r.neighbors){
   assert.ok(rooms[id].neighbors.includes(r.id))
   assert.equal(Math.abs(r.x-rooms[id].x)+Math.abs(r.y-rooms[id].y),1)
  }
  for(let patch=0;patch<4;patch++){
   const group=rooms.filter(r=>r.patch===patch&&!['Entry','Boss'].includes(r.kind))
   assert.ok(group.length>=3&&group.length<=7)
   assert.equal(group.filter(r=>r.kind==='Miniboss').length,1)
   assert.equal(visit(group[0].id,r=>group.includes(r)).size,group.length)
  }
 }
 assert.deepEqual(floors.map(f=>f.boss),['Skeleton King','Blighted Guardian','Fallen King','Abyssal Overlord'])
})

test('save decoding preserves progression and validates loadout against slots and unlocks',()=>{
 const save={...fresh(),version:1,gold:91,materials:5,victories:1,unlocked:['Grave Axe','Wooden Bow','Storm Staff'],blueprints:['Grave Axe'],upgrades:{Vitality:2},loadout:['Grave Axe','Grave Axe']}
 const decoded=decode(JSON.stringify(save))
 assert.deepEqual(decoded.loadout,['Grave Axe','Wooden Bow'])
 assert.deepEqual(decoded.blueprints,['Grave Axe'])
 assert.equal(decoded.gold,91)
 assert.equal(decoded.materials,5)
 assert.equal(decoded.victories,1)
 assert.equal(decoded.upgrades.Vitality,2)
 assert.equal(decoded.upgrades[rangedTraining],1)
 assert.ok(decoded.unlocked.includes('Storm Staff'))
 assert.deepEqual(decode(JSON.stringify({...save,loadout:['Grave Axe','Storm Staff']})).loadout,['Grave Axe','Storm Staff'])
 assert.deepEqual(decode('{ invalid'),fresh())
})

test('contracts count new combat clears and relic evolution caps at three',()=>{
 for(const room of ['Boss','Miniboss','Entry','Trap','Shop','Treasure'])assert.equal(contractClear(3,room,false),3)
 assert.equal(contractClear(3,'Combat',true),3)
 assert.equal(contractClear(3,'Combat',false),2)
 assert.equal(contractClear(1,'Combat',false),0)
 assert.deepEqual([0,1,2,3].map(relicLevel),[1,2,3,3])
})

test('fresh saves start melee-only and ranged training survives reload',()=>{
 const save=fresh()
 assert.deepEqual(decode(JSON.stringify(save)).loadout,['Rusty Sword',null])
 assert.ok(!save.unlocked.includes('Wooden Bow'))
 unlockRanged(save)
 unlockRanged(save)
 assert.deepEqual(decode(JSON.stringify(save)).loadout,['Rusty Sword','Wooden Bow'])
 assert.equal(save.unlocked.filter(name=>name==='Wooden Bow').length,1)
})
test('relic power applies evenly to the entire loadout',()=>{
 assert.deepEqual([1,2,3].map(count=>20*relicPower(count)),[20,16,12])
})
test('procedural floor gold estimates stay inside the economy targets',()=>{
 const layouts=Array.from({length:500},(_,seed)=>{
  let state=seed+1
  return generate(()=>((state=Math.imul(1664525,state)+1013904223>>>0)/2**32))
 })
 const averageRooms=layouts.reduce((sum,rooms)=>sum+rooms.filter(room=>room.kind==='Combat').length,0)/layouts.length
 const floorGold=encounters.enemies.slice(0,3).map((count,floor)=>{
  const eliteChance=encounters.eliteShare+floor*.035
  const enemyGold=eliteChance*economy.eliteGold[floor]+(1-eliteChance)*economy.normalDropChance*economy.normalGold
  return averageRooms*count*enemyGold+4*economy.minibossGold[floor]+economy.bossGold[floor]+economy.chestGold[floor]+economy.secretGold+economy.eventGold
 })
 assert.ok(floorGold[0]>=30&&floorGold[0]<=60,JSON.stringify(floorGold))
 const total=floorGold.reduce((sum,gold)=>sum+gold,0)
 assert.ok(total>=120&&total<=200,JSON.stringify(floorGold))
 assert.ok(upgrades.every(upgrade=>upgrade.cost>=100))
 assert.ok(upgradeCost(110,3)-upgradeCost(110,2)>upgradeCost(110,2)-upgradeCost(110,1))
})

test('minibosses each have three differentiated phases and an encounter-specific mechanic',async()=>{
 const {minibosses,phaseFor}=await import('../src/miniboss.ts')
 const profiles=minibosses.flat()
 assert.equal(profiles.length,12)
 assert.equal(new Set(profiles.map(p=>p.special)).size,12)
 assert.equal(new Set(profiles.map(p=>JSON.stringify(p.phases))).size,12)
 for(const profile of profiles){
  const [opening,middle,final]=profile.phases
  assert.ok(new Set(profile.phases.flat()).size>=4,profile.name)
  assert.ok(middle.some(attack=>!opening.includes(attack)),profile.name)
  assert.ok(final.some(attack=>![...opening,...middle].includes(attack)),profile.name)
 }
 assert.deepEqual([100,70,69,35,34].map(hp=>phaseFor(hp,100)),[0,0,1,1,2])
})

test('miniboss hit counts, shop burst, and sustained weapon damage stay in range',async()=>{
 const {weapons}=await import('../src/data.ts')
 const sword=weapons.find(w=>w.name==='Rusty Sword')
 for(const hp of encounters.minibossHealth){
  const hits=(weapon)=>Math.ceil(hp/weapon.damage)
  assert.ok(hits(sword)>=25&&hits(sword)<=40)
  for(const weapon of weapons.filter(w=>w.parent&&w.name!=='Abyssal Greatsword')){
   const strong=weapon.name==='Cinder Hammer'
   assert.ok(hits(weapon)>=(strong?10:15)&&hits(weapon)<=(strong?17:25),weapon.name)
   assert.ok(weapon.damage/weapon.delay*1000<=80,weapon.name)
   // Even three critical vollies with the spread pellet cap stay below full health.
   assert.ok(weapon.damage*1.6*(weapon.slot?1.24:1)*3<hp,weapon.name)
  }
 }
})

test('Abyss layouts round the Fallen King floor size and keep all doors connected',()=>{
 for(const sourceSize of [16,18,19,20,21,22,24,32])for(let seed=1;seed<=60;seed++){
  let state=seed
  const rooms=generateAbyss(sourceSize,()=>((state=Math.imul(1664525,state)+1013904223>>>0)/2**32))
  assert.equal(rooms.length,Math.round(sourceSize*3/8))
  assert.equal(rooms.filter(r=>r.kind==='Boss').length,1)
  assert.equal(new Set(rooms.map(r=>r.x+','+r.y)).size,rooms.length)
  const seen=new Set(),pending=[0]
  while(pending.length){
   const id=pending.pop()
   if(seen.has(id))continue
   seen.add(id)
   for(const next of rooms[id].neighbors){
    assert.ok(rooms[next].neighbors.includes(id))
    assert.equal(Math.abs(rooms[id].x-rooms[next].x)+Math.abs(rooms[id].y-rooms[next].y),1)
    pending.push(next)
   }
  }
  assert.equal(seen.size,rooms.length)
 }
})

test('only the Greatsword needs the fourth boss; legacy materials remain scrap',async()=>{
 const {weapons}=await import('../src/data.ts')
 const {recipes,canCraft,payRecipe,emptyBossMaterials,bossMaterials,abyssalWeapon}=await import('../src/materials.ts')
 const legacy=decode(JSON.stringify({...fresh(),version:2,materials:99,bossMaterials:{'Abyssal Essence':99},gold:12,abyssVictories:0}))
 assert.equal(legacy.materials,99)
 assert.deepEqual(legacy.bossMaterials,emptyBossMaterials())
 const recipesWithAbyss=Object.entries(recipes).filter(([,recipe])=>recipe['Abyssal Essence'])
 assert.deepEqual(recipesWithAbyss.map(([name])=>name),[abyssalWeapon])
 const greatsword=weapons.find(w=>w.name===abyssalWeapon)
 assert.ok(weapons.filter(w=>w.slot===0&&w!==greatsword).every(w=>w.damage<greatsword.damage&&w.damage/w.delay<greatsword.damage/greatsword.delay))
 assert.ok(3*greatsword.damage<encounters.bossHealth[0])
 assert.ok(weapons.filter(w=>w.parent&&w.name!==abyssalWeapon).every(w=>recipes[w.name]&&w.parent!==abyssalWeapon))
 const firstOnly={gold:999,materials:999,bossMaterials:{...emptyBossMaterials(),'Cursed Bone':999}}
 for(const weapon of ['Frost Pike','Cinder Hammer','Storm Staff','Night Knives',abyssalWeapon])assert.equal(canCraft(firstOnly,recipes[weapon]),false,weapon)
 const full={gold:120,materials:10,bossMaterials:{...emptyBossMaterials(),'Cursed Bone':10,'Blighted Heart':10,'Infernal Core':10}}
 for(const weapon of weapons.filter(w=>w.parent&&w.name!==abyssalWeapon))assert.ok(canCraft(full,recipes[weapon.name]))
 assert.equal(payRecipe(full,recipes[abyssalWeapon]),false)
 assert.equal(full.gold,120)
 full.bossMaterials['Abyssal Essence']=2
 assert.ok(bossMaterials.every(key=>recipes[abyssalWeapon][key]>0))
 const shortOnGold={...structuredClone(full),gold:99}
 const unchanged=structuredClone(shortOnGold)
 assert.equal(payRecipe(shortOnGold,recipes[abyssalWeapon]),false)
 assert.deepEqual(shortOnGold,unchanged)
 assert.ok(payRecipe(full,recipes[abyssalWeapon]))
 assert.equal(full.gold,20)
 assert.deepEqual(Object.values(full.bossMaterials),[7,5,8,0])
 assert.deepEqual(decode(JSON.stringify({...fresh(),bossMaterials:full.bossMaterials,abyssVictories:2})).bossMaterials,full.bossMaterials)
})

test('the Overlord has four exact thresholds and higher pressure in each phase',async()=>{
 const {abyssPhase,abyssEnemies,overlordPhases}=await import('../src/abyss.ts')
 assert.deepEqual([100,75,74,50,49,25,24].map(hp=>abyssPhase(hp,100)),[0,0,1,1,2,2,3])
 assert.equal(abyssEnemies.length,5)
 assert.equal(new Set(abyssEnemies.map(foe=>JSON.stringify(foe.patterns))).size,5)
 assert.ok(overlordPhases[0].hp>encounters.bossHealth[2]*2)
 assert.ok(overlordPhases[0].damage>encounters.bossDamage[2])
 for(let phase=1;phase<4;phase++){
  assert.ok(overlordPhases[phase].pace>overlordPhases[phase-1].pace)
  assert.ok(overlordPhases[phase].cooldown<overlordPhases[phase-1].cooldown)
 }
})

test('old inventory-only weapons are never promoted to permanent unlocks',()=>{
 const existing={...fresh(),unlocked:['Rusty Sword','Grave Axe'],loadout:['Cinder Hammer','Night Knives'],
  carriedWeapons:['Cinder Hammer','Night Knives'],temporaryWeapons:['Cinder Hammer','Night Knives']}
 const migrated=decode(JSON.stringify(existing))
 assert.deepEqual(migrated.unlocked,['Rusty Sword','Grave Axe'])
 assert.deepEqual(migrated.loadout,['Rusty Sword',null])
})
