import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generate, floors} from '../src/dungeon.ts'
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
 assert.deepEqual(floors.map(f=>f.boss),['Skeleton King','Blighted Guardian','Fallen King'])
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
 const floorGold=encounters.enemies.map((count,floor)=>{
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
