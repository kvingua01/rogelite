import { economy } from './balance.ts'

export type Effect = 'fire'|'poison'|'frost'|'lightning'|'shadow'
export type Weapon = {name:string; damage:number; delay:number; range:number; slot:0|1; effect?:Effect; parent?:string; cost?:number}
export const weapons: Weapon[] = [
 {name:'Rusty Sword',damage:25,delay:350,range:42,slot:0},
 {name:'Wooden Bow',damage:17,delay:420,range:245,slot:1},
 {name:'Grave Axe',damage:45,delay:620,range:47,slot:0,parent:'Rusty Sword',cost:2},
 {name:'Frost Pike',damage:34,delay:420,range:68,slot:0,effect:'frost',parent:'Grave Axe',cost:3},
 {name:'Cinder Hammer',damage:60,delay:730,range:53,slot:0,effect:'fire',parent:'Grave Axe',cost:4},
 {name:'Shade Dagger',damage:20,delay:215,range:36,slot:0,effect:'shadow',parent:'Frost Pike',cost:4},
 {name:'Iron Crossbow',damage:32,delay:590,range:285,slot:1,parent:'Wooden Bow',cost:2},
 {name:'Storm Staff',damage:26,delay:480,range:245,slot:1,effect:'lightning',parent:'Iron Crossbow',cost:3},
 {name:'Venom Wand',damage:18,delay:295,range:211,slot:1,effect:'poison',parent:'Iron Crossbow',cost:3},
 {name:'Night Knives',damage:15,delay:225,range:168,slot:1,effect:'shadow',parent:'Venom Wand',cost:4},
]
export const rarity = ['Common','Rare','Epic','Legendary']
export const colors = ['#9acb86','#84b8e7','#c392ec','#f4c476']
export type Charge = 'time'|'damage'|'kills'|'rooms'
export type Relic = {name:string; rank:number; detail:string; effect?:Effect; charge?:Charge; cap?:number}
export const relics: Relic[] = [
 {name:'Cinder Heart',rank:0,detail:'Burn targets. At III, ignite nearby enemies.',effect:'fire'},
 {name:'Bog Idol',rank:0,detail:'Poison targets. At III, poison also slows.',effect:'poison'},
 {name:'Rime Seal',rank:1,detail:'Slow targets. At III, frost deals bonus damage.',effect:'frost'},
 {name:'Forked Bolt',rank:1,detail:'Fire extra bolts. At III, bolts pierce.',effect:'lightning'},
 {name:'Glass Compass',rank:0,detail:'Reveal secrets, then treasure and adjacent paths. At III, reveal the floor.'},
 {name:'Mirror Quiver',rank:2,detail:'Bolts bounce and gain range. At III, bolts home.'},
 {name:'Dusk Crown',rank:3,detail:'Empower attacks with shadow. At III, heal on kills.',effect:'shadow'},
 {name:'Sun Bell',rank:0,detail:'Send out a damaging shockwave. At III, heal.',charge:'time',cap:12},
 {name:'Blood Chalice',rank:1,detail:'Heal on use. At III, gain brief invulnerability.',charge:'damage',cap:260},
 {name:'Thunder Rune',rank:2,detail:'Strike all enemies. At III, briefly slow them.',charge:'kills',cap:7},
 {name:'Grave Lantern',rank:3,detail:'Gain a protective ward. At III, damage all enemies.',charge:'rooms',cap:3},
]
export const rangedTraining = 'Ranged Weapon Training'
export const upgrades = [
 {name:rangedTraining,building:'Training Grounds',detail:'Unlock the projectile slot and Wooden Bow',cost:125,max:1,requires:''},
 {name:'Vitality',building:'Training Grounds',detail:'+15 maximum HP',cost:110,max:4,requires:''},
 {name:'Swordcraft',building:'Training Grounds',detail:'+12% melee damage',cost:155,max:3,requires:'Vitality'},
 {name:'Marksmanship',building:'Training Grounds',detail:'+12% projectile damage',cost:155,max:3,requires:rangedTraining},
 {name:'Precision',building:'Training Grounds',detail:'+5% critical hit chance',cost:245,max:3,requires:'Swordcraft'},
 {name:'Forge',building:'Blacksmith',detail:'Unlock advanced crafting recipes',cost:245,max:1,requires:''},
 {name:'Herbalism',building:'Alchemist',detail:'+20% pickup and potion healing',cost:115,max:3,requires:''},
 {name:'Springwater',building:'Alchemist',detail:'+10 fountain healing',cost:180,max:3,requires:'Herbalism'},
 {name:'Tithes',building:'Treasury',detail:'+15% gold earned',cost:165,max:3,requires:''},
 {name:'Haggling',building:'Treasury',detail:'−10% shop prices',cost:245,max:3,requires:'Tithes'},
 {name:'Fleet Step',building:'Watchtower',detail:'+7% movement speed',cost:120,max:3,requires:''},
 {name:'Quick Roll',building:'Watchtower',detail:'−10% dodge cooldown',cost:165,max:3,requires:'Fleet Step'},
 {name:'Long Roll',building:'Watchtower',detail:'+10% dodge distance',cost:165,max:3,requires:'Fleet Step'},
 {name:'Survey',building:'Watchtower',detail:'Reveal paths from visited rooms',cost:285,max:1,requires:'Quick Roll'},
]
export const challenges = ['Swift Foes','Iron Bosses','Elite Host','Scorched Ground','Projectile Storm']
export const contracts = [
 {name:'Ashen Bargain',debuff:'Take 40% more damage',blessing:'Fire bursts on melee hits',rooms:3},
 {name:'Lead Boots',debuff:'Move 25% slower',blessing:'Move 20% faster',rooms:4},
 {name:'Blunted Oath',debuff:'Deal 30% less damage',blessing:'Deal 30% more damage',rooms:3},
 {name:'Hollow Cup',debuff:'Receive half healing',blessing:'Restore 5 HP after combat',rooms:5},
 {name:'Broken Shield',debuff:'Dodge cooldown is doubled',blessing:'Shadow bolts pierce',rooms:3},
]
export type Save = {version:2; gold:number; materials:number; blueprints:string[]; unlocked:string[]; loadout:[string,string|null]; upgrades:Record<string,number>; victories:number; mute:boolean}
export const fresh = ():Save => ({version:2,gold:0,materials:0,blueprints:[],unlocked:['Rusty Sword'],loadout:['Rusty Sword',null],upgrades:{},victories:0,mute:false})
export function decode(raw:string|null): Save {
 const base = fresh()
 try {
  const parsed = JSON.parse(raw ?? 'null')
  if (parsed?.version !== 1 && parsed?.version !== 2) return base
  for (const key of ['gold','materials','victories'] as const) if (Number.isSafeInteger(parsed[key]) && parsed[key] >= 0) base[key] = parsed[key]
  for (const key of ['blueprints','unlocked'] as const) if (Array.isArray(parsed[key])) base[key] = [...new Set([...base[key], ...weapons.filter(w=>parsed[key].includes(w.name)).map(w=>w.name)])]
  for (const slot of [0,1] as const) if (weapons.some(w=>w.slot===slot && w.name===parsed.loadout?.[slot] && base.unlocked.includes(w.name))) base.loadout[slot] = parsed.loadout[slot]
  for (const upgrade of upgrades) {
   const level = parsed.upgrades?.[upgrade.name]
   if (Number.isInteger(level) && level > 0) base.upgrades[upgrade.name] = Math.min(level,upgrade.max)
  }
  if (base.upgrades[rangedTraining] || base.unlocked.some(name=>weapons.some(w=>w.name===name&&w.slot===1))) unlockRanged(base)
  base.mute = parsed.mute === true
 } catch { return base }
 return base
}
export const relicLevel = (old: number) => Math.min(3, old + 1)
export const contractClear = (remaining: number, kind: string, alreadyCleared: boolean) => kind === 'Combat' && !alreadyCleared ? Math.max(0, remaining - 1) : remaining
export function unlockRanged(save:Save) {
 save.upgrades[rangedTraining]=1
 if(!save.unlocked.includes('Wooden Bow')) save.unlocked.push('Wooden Bow')
 save.loadout[1]??='Wooden Bow'
}
export const upgradeCost = (cost: number, level: number) => Math.round(cost * (1 + economy.upgradeGrowth * level * (level + 1) / 2))
