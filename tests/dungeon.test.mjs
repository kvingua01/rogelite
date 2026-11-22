import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generate, floors} from '../src/dungeon.ts'
import {contractClear, decode, fresh, relicLevel} from '../src/data.ts'

test('300 layouts contain every room type and connect every patch to its miniboss',()=>{
 const types=['Entry','Combat','Treasure','Shop','Curse Altar','Secret','Trap','Miniboss','Boss','Event','Blacksmith']
 for(let seed=1;seed<=300;seed++){
  let state=seed
  const rooms=generate(()=>((state=Math.imul(1664525,state)+1013904223>>>0)/2**32))
  assert.equal(new Set(rooms.map(r=>r.x+','+r.y)).size,rooms.length)
  for(const type of types)assert.ok(rooms.some(r=>r.kind===type),type)
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
 const save={...fresh(),gold:91,materials:5,victories:1,unlocked:['Grave Axe'],blueprints:['Grave Axe'],upgrades:{Vitality:2},loadout:['Grave Axe','Grave Axe']}
 const decoded=decode(JSON.stringify(save))
 assert.deepEqual(decoded.loadout,['Grave Axe','Wooden Bow'])
 assert.deepEqual(decoded.blueprints,['Grave Axe'])
 assert.equal(decoded.gold,91)
 assert.equal(decoded.materials,5)
 assert.equal(decoded.victories,1)
 assert.equal(decoded.upgrades.Vitality,2)
 assert.deepEqual(decode('{ invalid'),fresh())
})

test('contracts count new combat clears and relic evolution caps at three',()=>{
 for(const room of ['Boss','Miniboss','Entry','Trap','Shop','Treasure'])assert.equal(contractClear(3,room,false),3)
 assert.equal(contractClear(3,'Combat',true),3)
 assert.equal(contractClear(3,'Combat',false),2)
 assert.equal(contractClear(1,'Combat',false),0)
 assert.deepEqual([0,1,2,3].map(relicLevel),[1,2,3,3])
})
