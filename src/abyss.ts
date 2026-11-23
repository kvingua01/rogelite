import type { Attack } from './miniboss'

export type AbyssAttack=Attack|'void-storm'|'cataclysm'
export type AbyssProfile={
 name:string; hp:number; damage:number; pace:number; preferred:number; cooldown:number;
 patterns:readonly AbyssAttack[];
}
export const abyssEnemies:readonly AbyssProfile[]=[
 {name:'Abyssal Knight',hp:190,damage:35,pace:100,preferred:44,cooldown:555,patterns:['lunge','combo','lunge']},
 {name:'Void Archer',hp:136,damage:32,pace:86,preferred:140,cooldown:590,patterns:['spread','burst','spread']},
 {name:'Abyssal Wraith',hp:154,damage:34,pace:104,preferred:93,cooldown:615,patterns:['blink','cross','burst']},
 {name:'Void Brute',hp:270,damage:43,pace:78,preferred:43,cooldown:700,patterns:['slam','lunge','spin']},
 {name:'Abyssal Sorcerer',hp:162,damage:37,pace:83,preferred:124,cooldown:750,patterns:['summon','eruption','spiral']},
]
export const overlordPhases:readonly AbyssProfile[]=[
 {name:'Abyssal Overlord',hp:2700,damage:54,pace:93,preferred:46,cooldown:715,patterns:['lunge','combo','spread','slam']},
 {name:'Abyssal Overlord',hp:2700,damage:54,pace:104,preferred:58,cooldown:610,patterns:['blink','summon','spiral','combo','cross']},
 {name:'Abyssal Overlord',hp:2700,damage:54,pace:113,preferred:46,cooldown:510,patterns:['eruption','spread','void-storm','slam','trail']},
 {name:'Abyssal Overlord',hp:2700,damage:54,pace:125,preferred:36,cooldown:440,patterns:['cataclysm','combo','void-storm','spiral','cross']},
]
export const abyssPhase=(hp:number,max:number)=>hp/max<.25?3:hp/max<.5?2:hp/max<.75?1:0
