import type Phaser from 'phaser'

export const castleWidth=880
export const castleHeight=540
export const castleSpawn={x:440,y:270}
export const interactionRange=32
export type Point={x:number;y:number}
type Rect=Point & {w:number;h:number}

export const stations=[
 {name:'Blacksmith',person:'Mara the blacksmith',line:'Bring me a blueprint and metal, and I’ll forge you something worth carrying.',x:42,y:48,w:176,h:140,south:true,color:0x9e5c48},
 {name:'Main Hall',person:'The steward',line:'Rest here between descents. The courtyard leads to every workshop.',x:322,y:48,w:220,h:140,south:true,color:0x895278},
 {name:'Training Grounds',person:'Captain Alden',line:'A steady sword arm will take you further than luck.',x:638,y:48,w:200,h:140,south:true,color:0xa68558},
 {name:'Alchemist',person:'Iona the alchemist',line:'Even a little healing can get you through the next room.',x:42,y:354,w:176,h:140,south:false,color:0x588773},
 {name:'Treasury',person:'The treasurer',line:'Spend wisely. Gold you bring back belongs to the keep.',x:322,y:354,w:220,h:140,south:false,color:0xaa8152},
 {name:'Watchtower',person:'The lookout',line:'A quick step and a good map can save your life.',x:638,y:354,w:200,h:140,south:false,color:0x596f9e},
 {name:'Dungeon Gate',person:'The gatekeeper',line:'The stairs lead to the Forgotten Castle. Ready to descend?',x:737,y:218,w:101,h:102,south:true,color:0x975055},
] as const
export type Station=typeof stations[number]
export type Building=Exclude<Station['name'],'Main Hall'|'Dungeon Gate'>
type Unlock={forge:boolean;tower:boolean}
type Wall=Rect & {kind?:'annex'}

const center=(s:Station)=>Math.round(s.x+s.w/2)
export const stationPoint=(s:Station):Point=>({x:center(s),y:s.south?s.y+41:s.y+s.h-41})
const well={x:484,y:270,w:38,h:28}
const wallSize=9
const halfDoor=22
const floorY=(s:Station)=>s.south?s.y+s.h-wallSize:s.y
function walls(s:Station,unlock:Unlock):Wall[]{
 const door=center(s)
 const front=floorY(s)
 const back=s.south?s.y:s.y+s.h-wallSize
 const result:Wall[]=[
  {x:s.x,y:back,w:s.w,h:wallSize},
  {x:s.x,y:s.y,w:wallSize,h:s.h},
  {x:s.x+s.w-wallSize,y:s.y,w:wallSize,h:s.h},
  {x:s.x,y:front,w:door-halfDoor-s.x,h:wallSize},
  {x:door+halfDoor,y:front,w:s.x+s.w-door-halfDoor,h:wallSize},
 ]
 if((s.name==='Blacksmith'&&!unlock.forge)||(s.name==='Watchtower'&&!unlock.tower)){
  result.push({x:s.x+s.w-50,y:s.y+wallSize,w:7,h:s.h-wallSize*2,kind:'annex'})
 }
 return result
}
function props(s:Station):Rect[]{
 const npc=stationPoint(s)
 return [{x:s.x+(s.name==='Dungeon Gate'?13:22),y:s.y+56,w:s.name==='Dungeon Gate'?15:26,h:18},{x:npc.x-6,y:npc.y-8,w:12,h:16}]
}
const overlap=(point:Point,r:Rect,pad:number)=>point.x>r.x-pad&&point.x<r.x+r.w+pad&&point.y>r.y-pad&&point.y<r.y+r.h+pad
export function castleSolids(unlock:Unlock):Rect[]{
 return [well,...stations.flatMap(s=>[...walls(s,unlock),...props(s)])]
}
export function canWalk(solids:Rect[],point:Point){
 return point.x>=22&&point.x<=castleWidth-22&&point.y>=22&&point.y<=castleHeight-22&&!solids.some(rect=>overlap(point,rect,6))
}
export function nearbyStation(point:Point){
 return stations.find(s=>overlap(point,s,-wallSize)&&Math.hypot(point.x-stationPoint(s).x,point.y-stationPoint(s).y)<=interactionRange)
}
export function drawCastle(g:Phaser.GameObjects.Graphics,unlock:Unlock,improvements:(name:string)=>number){
 g.clear().fillStyle(0x181620).fillRect(0,0,castleWidth,castleHeight)
 g.fillStyle(0x39413d).fillRect(15,15,850,510)
 for(let y=16;y<525;y+=16)for(let x=16;x<865;x+=16){
  const n=(x*11+y*7+x*y)%97
  const path=(y>=222&&y<=312)||(Math.abs(x-432)<49)||(x>80&&x<168)||(x>694&&x<785)
  g.fillStyle(path?[0x59515a,0x645b61,0x514a55][n%3]:[0x3c453e,0x424842,0x383d3c][n%3]).fillRect(x,y,15,15)
  if(n%7===0)g.fillStyle(path?0x73666b:0x58604f).fillRect(x+4,y+5,4,2)
 }
 for(let x=12;x<866;x+=19){
  g.fillStyle(0x51424c).fillRect(x,7,17,10).fillRect(x,521,17,12)
  if(x%4===0)g.fillStyle(0x70616a).fillRect(x,4,13,6).fillRect(x,519,13,6)
 }
 g.fillStyle(0x51424c).fillRect(7,15,10,505).fillRect(863,15,10,505)
 g.fillStyle(0x30323a).fillRect(well.x-3,well.y+5,44,28)
 g.fillStyle(0x9b8587).fillRect(well.x,well.y,well.w,well.h)
 g.fillStyle(0x3d5a63).fillRect(well.x+5,well.y+4,28,19)
 g.fillStyle(0x78a1a1).fillRect(well.x+8,well.y+10,17,2).fillRect(well.x+17,well.y+17,12,2)
 for(const s of stations){
  const door=center(s)
  g.fillStyle(0x282431,.8).fillRect(s.x+5,s.y+7,s.w,s.h)
  g.fillStyle(0x544451).fillRect(s.x,s.y,s.w,s.h)
  for(let y=s.y+10;y<s.y+s.h-12;y+=12)for(let x=s.x+10;x<s.x+s.w-14;x+=14){
   const n=(x*13+y*17+x*y)%83
   g.fillStyle(n%3===0?0x645361:0x51434e).fillRect(x,y,13,11)
  }
  const npc=stationPoint(s)
  g.fillStyle(s.color,.52).fillRect(door-29,s.south?s.y+18:s.y+s.h-59,58,41)
  g.lineStyle(1,0xe0ae7e,.46).strokeRect(door-26,s.south?s.y+21:s.y+s.h-56,52,35)
  g.fillStyle(s.color).fillRect(door-halfDoor,floorY(s),halfDoor*2,wallSize)
  for(const wall of walls(s,unlock)){
   g.fillStyle(wall.kind==='annex'?0x685159:0x2d2833).fillRect(wall.x,wall.y,wall.w,wall.h)
   g.fillStyle(0x80707a,.63).fillRect(wall.x,wall.y,wall.w,2)
  }
  for(const x of [s.x+19,s.x+s.w-22]){
   const y=s.south?s.y+19:s.y+s.h-20
   g.fillStyle(0xf09951,.12).fillCircle(x,y,14).fillStyle(0x775052).fillRect(x-2,y,4,6)
   g.fillStyle(0xf2a663).fillRect(x-2,y-4,4,5).fillStyle(0xffe5a0).fillRect(x,y-6,2,5)
  }
  const table=props(s)[0]
  g.fillStyle(0x352a33).fillRect(table.x,table.y,table.w,table.h)
  g.fillStyle(s.color).fillRect(table.x+2,table.y+2,table.w-4,table.h-6)
  const count=Math.min(5,improvements(s.name))
  for(let i=0;i<count;i++){
   const x=s.x+s.w-25-(i%2)*14,y=s.y+24+Math.floor(i/2)*21
   g.fillStyle(0x352d3b).fillRect(x-3,y+5,10,6)
   if(s.name==='Training Grounds'){
    g.fillStyle(0x6f5051).fillCircle(x+2,y+1,6).fillStyle(0xd6a46c).fillCircle(x+2,y+1,4)
    g.fillStyle(0x9f5353).fillCircle(x+2,y+1,2).fillStyle(0x82685c).fillRect(x+1,y+6,2,6)
   }else if(s.name==='Treasury'){
    g.fillStyle(0x523837).fillRect(x-4,y,14,10).fillStyle(0xb99059).fillRect(x-4,y+2,14,2).fillRect(x+1,y+5,3,3)
   }else{
    g.fillStyle(s.color).fillRect(x-1,y+3,7,7).fillStyle(0xeabf7d).fillRect(x+1,y,3,4)
   }
  }
  if(s.name==='Watchtower'&&unlock.tower){
   g.fillStyle(0x3a3548).fillRect(s.x+s.w-52,s.y+17,39,s.h-34)
   for(let i=0;i<7;i++)g.fillStyle(0x777b9d).fillRect(s.x+s.w-46,s.y+26+i*13,27,4)
  }
  if(s.name==='Blacksmith'&&unlock.forge){
   g.fillStyle(0x452c39).fillRect(s.x+s.w-49,s.y+50,29,30)
   g.fillStyle(0xdf704e).fillRect(s.x+s.w-43,s.y+55,17,17).fillStyle(0xffbd66).fillRect(s.x+s.w-40,s.y+61,10,9)
  }
  g.fillStyle(0x241d29).fillEllipse(npc.x,npc.y+8,17,7)
  g.fillStyle(s.color).fillRect(npc.x-6,npc.y,12,10)
  g.fillStyle(0xd4ad87).fillRect(npc.x-4,npc.y-7,8,7)
  g.fillStyle(0x3f333d).fillRect(npc.x-5,npc.y-9,10,4).fillRect(npc.x-4,npc.y+9,3,3).fillRect(npc.x+1,npc.y+9,3,3)
 }
}
