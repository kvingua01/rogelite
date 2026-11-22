import { floors } from './dungeon.ts'

export type Attack = 'lunge'|'combo'|'spin'|'slam'|'spread'|'burst'|'spiral'|'summon'|'blink'|'eruption'|'trail'|'cross'
type Style = 'pursue'|'kite'|'blink'
type Mechanic = 'retinue'|'thorns'|'rift'|'guard'|'pools'|'web'|'spores'|'aftershock'|'embers'|'salvo'|'shade'|'inferno'
type Element = 'fire'|'poison'|'frost'|'lightning'|'shadow'
export type Profile = {
 name:string
 style:Style
 element:Element
 special:Mechanic
 phases:readonly [readonly Attack[],readonly Attack[],readonly Attack[]]
}
const profile = (name:string,style:Style,element:Element,special:Mechanic,
 opening:readonly Attack[],second:readonly Attack[],final:readonly Attack[]):Profile =>
 ({name,style,element,special,phases:[opening,second,final]})

export const minibosses = [
 [
  profile(floors[0].minis[0],'pursue','fire','retinue',['lunge','combo'],['slam','lunge','combo'],['summon','spin','slam','combo']),
  profile(floors[0].minis[1],'pursue','poison','thorns',['spread','slam'],['trail','slam','lunge'],['eruption','trail','lunge','spread']),
  profile(floors[0].minis[2],'blink','shadow','rift',['burst','spread'],['blink','burst','cross'],['spiral','blink','cross','burst']),
  profile(floors[0].minis[3],'pursue','lightning','guard',['combo','lunge'],['spin','cross','combo'],['slam','spin','cross','lunge']),
 ],
 [
  profile(floors[1].minis[0],'pursue','poison','pools',['lunge','spread'],['slam','trail','spread'],['eruption','lunge','slam','trail']),
  profile(floors[1].minis[1],'kite','frost','web',['burst','spread'],['summon','cross','burst'],['spiral','blink','summon','cross']),
  profile(floors[1].minis[2],'kite','poison','spores',['spread','eruption'],['burst','summon','spread'],['trail','spiral','burst','eruption']),
  profile(floors[1].minis[3],'pursue','frost','aftershock',['slam','combo'],['cross','lunge','slam'],['spin','eruption','cross','slam']),
 ],
 [
  profile(floors[2].minis[0],'pursue','fire','embers',['spread','lunge'],['trail','combo','spread'],['spiral','slam','trail','lunge']),
  profile(floors[2].minis[1],'pursue','lightning','salvo',['lunge','combo'],['burst','spin','lunge'],['cross','slam','burst','combo']),
  profile(floors[2].minis[2],'blink','shadow','shade',['spread','burst'],['blink','summon','burst'],['eruption','spiral','blink','summon']),
  profile(floors[2].minis[3],'pursue','fire','inferno',['lunge','spin'],['combo','trail','lunge'],['slam','spiral','combo','trail']),
 ],
] as const

export const phaseFor = (hp:number,max:number):0|1|2 => hp/max<.35?2:hp/max<.70?1:0

export const windups:Record<Attack,number> = {
 lunge:410,combo:390,spin:455,slam:540,spread:410,burst:360,spiral:490,
 summon:510,blink:415,eruption:500,trail:430,cross:435,
}
