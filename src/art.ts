import Phaser from 'phaser'

export const W = 512, H = 288
export const tones = [0xbcc5d3,0x9caf80,0xba88d3,0xe1a170,0x83bbb1,0xd98590,0xc8ba7e]
const knight = [
 '.........HHHH...........',
 '.......HHBBBBHH.........',
 '......HBBSSSSBBH........',
 '......HBSSSSSSBH........',
 '......HSSBBBSSSH........',
 '......HSBDDDBSSH........',
 '......HSBSSSSSSH........',
 '.......HBSSSSBH.........',
 '.......RHBBBBHR.........',
 '....HHHRRSSSRRRHH.......',
 '...HBBHRSSSSSRHBBH......',
 '...HSSHBSSBSSBHSBH......',
 '....HHHBSSBSSBHHH.......',
 '....RRHBSSSSSBHRR.......',
 '...RRRHBBBBBBHRRR.......',
 '...RR.HSSHHSSH.RR.......',
 '......HSBH.HBSH.........',
 '.....HBBH...HBBH........',
 '.....HHHH...HHHH........',
]
export function textures(scene: Phaser.Scene) {
 const make = (name:string, size:number, draw:(g:Phaser.GameObjects.Graphics)=>void) => {
  const g = scene.make.graphics({})
  draw(g)
  g.generateTexture(name,size,size)
  g.destroy()
 }
 make('knight',24,g=>{
  const palette:Record<string,number>={H:0x23212c,B:0x78839e,S:0xd6e0e5,D:0x211c26,R:0x9a343e}
  knight.forEach((line,y)=>[...line].forEach((pixel,x)=>{
   if(palette[pixel]) g.fillStyle(palette[pixel]).fillRect(x+1,y+2,1,1)
  }))
 })
 tones.forEach((tone,i)=>make('foe'+i,24,g=>{
  g.fillStyle(0x22202a).fillRect(4,6,16,14).fillRect(2,12,20,6).fillRect(5,19,5,3).fillRect(14,19,5,3)
  g.fillStyle(tone).fillRect(6,7,12,12).fillRect(4,12,16,5)
  g.fillRect(5+i%3,3,3,6).fillRect(16-i%3,3,3,6)
  if (i%3===0) g.fillRect(2,7,4,4).fillRect(18,7,4,4)
  if (i%3===1) g.fillRect(2,16,4,3).fillRect(18,16,4,3)
  if (i%3===2) g.fillRect(9,2,6,5).fillRect(10,18,4,4)
  g.fillStyle(0x2a202d).fillRect(7,10,3,3).fillRect(14,10,3,3).fillRect(10,16,4,2)
  g.fillStyle(0xffdf9c).fillRect(8,10,1,1).fillRect(15,10,1,1)
 }))
 ;[0xd9d3bb,0x90aa71,0xca7458].forEach((tone,i)=>make('boss'+i,24,g=>{
  const dark=[0x343043,0x344234,0x422234][i]
  const accent=[0x9a628e,0xced98a,0xffb267][i]
  g.fillStyle(0x211b27).fillRect(3,8,18,13).fillRect(5,5,14,15).fillRect(2,17,20,5)
  g.fillStyle(dark).fillRect(5,11,14,9).fillRect(6,19,4,4).fillRect(14,19,4,4)
  g.fillStyle(tone).fillRect(7,6,10,7).fillRect(9,13,6,3).fillRect(6,15,3,4).fillRect(15,15,3,4)
  g.fillStyle(accent).fillRect(6,5,12,2).fillRect(6,2,2,4).fillRect(11,1,2,5).fillRect(16,2,2,4)
  g.fillStyle(dark).fillRect(8,8,3,2).fillRect(13,8,3,2).fillRect(11,11,2,2)
  if(i===1) g.fillStyle(tone).fillRect(2,8,3,9).fillRect(19,8,3,9).fillRect(3,19,4,3).fillRect(17,19,4,3)
  else g.fillStyle(accent).fillRect(20,5,2,13).fillRect(18,14,6,2).fillRect(21,3,1,3)
 }))

 const abyssColors=[0x9469b0,0x714d9f,0x9386cf,0x694379,0xb47cd1]
 abyssColors.forEach((tone,i)=>make('abyss'+i,24,g=>{
  g.fillStyle(0x21172b).fillRect(5,5,14,16)
  g.fillStyle(tone).fillRect(6,8,12,11)
  g.fillStyle(0xedb7fa).fillRect(8,9,2,2).fillRect(14,9,2,2)
  if(i===0){
   g.fillStyle(0x4b3766).fillRect(4,11,4,9).fillRect(16,10,5,10)
   g.fillStyle(0xcfb0e9).fillRect(20,3,2,14).fillRect(18,14,6,2)
  }else if(i===1){
   g.fillStyle(0x422b61).fillRect(6,5,12,4).fillRect(6,18,4,5).fillRect(14,18,4,5)
   g.lineStyle(2,0xcf9de4).lineBetween(20,7,23,13).lineBetween(23,13,20,18)
  }else if(i===2){
   g.fillStyle(tone,.72).fillRect(4,13,16,4).fillRect(6,19,3,3).fillRect(13,20,2,4).fillRect(17,16,2,4)
  }else if(i===3){
   g.fillStyle(tone).fillRect(2,11,20,8).fillRect(4,17,6,6).fillRect(14,17,6,6)
   g.fillStyle(0xd194e3).fillRect(2,13,4,5).fillRect(18,13,5,5)
  }else{
   g.fillStyle(0x46305c).fillRect(8,3,8,5).fillRect(5,17,14,6)
   g.fillStyle(0xd9a6ee).fillRect(21,6,2,14).fillRect(19,3,5,4)
  }
 }))
 make('boss3',32,g=>{
  g.fillStyle(0x1c1228).fillRect(6,8,20,22).fillRect(2,14,28,12)
  g.fillStyle(0x623976).fillRect(8,11,16,16).fillRect(4,16,6,9).fillRect(22,16,6,9)
  g.fillStyle(0xa664b8).fillRect(10,8,12,8).fillRect(8,5,3,6).fillRect(21,5,3,6).fillRect(14,1,4,8)
  g.fillStyle(0xffc6f8).fillRect(11,11,3,2).fillRect(18,11,3,2).fillRect(14,20,4,4)
  g.fillStyle(0xd384e7).fillRect(27,4,3,16).fillRect(25,17,7,3)
 })

}
export function cover(g:Phaser.GameObjects.Graphics) {
 g.fillGradientStyle(0x211823,0x38232f,0x36222d,0x573341,1).fillRect(0,0,W,H)
 g.fillStyle(0xd29275,0.8).fillCircle(366,95,48)
 g.fillStyle(0x8a5058).fillRect(317,111,98,3).fillRect(320,122,91,3)
 for(let i=0;i<120;i++) {
  const x=(i*67)%W,y=(i*i*17)%220
  g.fillStyle(i%3===0?0xe49066:0xb4787c,i%5/12).fillRect(x,y,i%9===0?2:1,1)
 }
 for(let layer=0;layer<3;layer++) {
  g.fillStyle([0x553440,0x392732,0x231b25][layer])
  for(let i=0;i<32;i++) {
   const x=i*16, y=154+layer*28+Math.round(Math.sin(i*0.51+layer*2)*21)+((i*7)%5)*3
   g.fillRect(x,y,16,H-y)
  }
 }
 g.fillStyle(0x221b26).fillRect(302,146,154,86).fillRect(331,109,32,110).fillRect(392,120,29,109).fillRect(438,139,20,90)
 for(const [x,y,w] of [[302,146,22],[331,109,32],[392,120,29],[438,139,20]]) for(let j=0;j<w;j+=8) g.fillRect(x+j,y-5,5,6)
 g.fillRect(344,76,3,34).fillStyle(0x713b49).fillRect(347,78,21,9).fillRect(347,87,12,4)
 g.fillStyle(0xa76149).fillRect(345,129,3,11).fillRect(405,144,3,10).fillRect(376,168,3,9).fillRect(444,155,2,9)
 g.fillStyle(0x16141d).fillRect(0,240,W,48).fillRect(0,234,184,14).fillRect(424,231,88,16)
 for(let i=0;i<90;i++) g.fillStyle(i%3===0?0x58333b:0x31242d).fillRect(i*31%W,242+(i*7)%45,2+i%7,1+i%2)
}
export function arena(g:Phaser.GameObjects.Graphics, tone:number, floor:number, seed:number) {
 g.fillStyle(0x16151c).fillRect(0,0,W,H)
 g.fillStyle(tone).fillRect(16,16,480,256)
 for(let y=16;y<272;y+=16) for(let x=16;x<496;x+=16) {
  const n=(x*37+y*19+seed*17+x*y)%101
  g.fillStyle(n%5===0?0xffffff:0x0c0912,n%5===0?0.042:0.13+(n%5)*0.032).fillRect(x+1,y+1,15,15)
  if(n%13===0) g.fillStyle([0x9d858e,0x8da47c,0xb47e59,0x78528f][floor],0.28).fillRect(x+4,y+8,3+n%5,1).fillRect(x+7,y+9,2,2)
 }
 g.lineStyle(2,0xa899ac,0.33).strokeRect(19,19,474,250)
 for (let x=32;x<W-30;x+=48) for(const y of [18,269]) {
  if (Math.abs(x-W/2)<21) continue
  g.fillStyle(0x221d28).fillRect(x-5,y-5,10,10).fillStyle(0x9c858b).fillRect(x-3,y-3,6,5)
  if(x%4===0) g.fillStyle(0xcd7958).fillRect(x-1,y-4,2,3)
 }
}

export function abyssDecor(g:Phaser.GameObjects.Graphics,seed:number){
 for(let i=0;i<21;i++){
  const x=32+(i*67+seed*19)%448,y=34+(i*53+seed*13)%218
  g.lineStyle(1,0x160e21,.88).lineBetween(x,y,x+5,y+7).lineBetween(x+5,y+7,x+15,y+4)
 }
 for(const x of [55,164,348,457])for(const y of [27,256]){
  g.fillStyle(0x181121).fillRect(x-9,y-3,18,11)
  g.fillStyle(0x59366f).fillRect(x-7,y+5,14,4).fillRect(x-4,y-3,10,8)
  g.fillStyle(0xa45bd2).fillRect(x-2,y-6,5,9).fillStyle(0xe8a7ff).fillRect(x,y-3,2,6)
 }
}
export function drawAbyssPortal(g:Phaser.GameObjects.Graphics){
 g.fillStyle(0x2d153a).fillEllipse(W/2,H/2+8,58,21)
 g.fillStyle(0x623779).fillEllipse(W/2,H/2,48,53)
 g.fillStyle(0x0e0a19).fillEllipse(W/2,H/2,39,46)
 g.fillStyle(0x8250aa).fillRect(W/2-13,H/2-7,26,3).fillRect(W/2-6,H/2+7,16,2)
 g.fillStyle(0xe5adff).fillRect(W/2-2,H/2-11,4,3).fillRect(W/2+12,H/2+4,3,3)
}
