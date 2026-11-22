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
  if(n%13===0) g.fillStyle([0x9d858e,0x8da47c,0xb47e59][floor],0.28).fillRect(x+4,y+8,3+n%5,1).fillRect(x+7,y+9,2,2)
 }
 g.lineStyle(2,0xa899ac,0.33).strokeRect(19,19,474,250)
 for (let x=32;x<W-30;x+=48) for(const y of [18,269]) {
  if (Math.abs(x-W/2)<21) continue
  g.fillStyle(0x221d28).fillRect(x-5,y-5,10,10).fillStyle(0x9c858b).fillRect(x-3,y-3,6,5)
  if(x%4===0) g.fillStyle(0xcd7958).fillRect(x-1,y-4,2,3)
 }
}
