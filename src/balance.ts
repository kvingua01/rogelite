export const economy = {
 goldRewardMultiplier: 2,
 normalDropChance: .18,
 normalGold: 1,
 eliteGold: [2, 2, 2, 4],
 minibossGold: [4, 4, 5],
 bossGold: [9, 10, 12, 38],
 chestGold: [3, 4, 5, 8],
 secretGold: 2,
 eventGold: 2,
 duplicateGold: 4,
 upgradeGrowth: .55,
} as const

export const waveSize = 3
export const healingRoomInterval = 6
export const regularAttackRate = .75
export const waveCount = (enemies:number) => Math.max(1,Math.round(enemies/waveSize))

export const encounters = {
 enemyDamageMultiplier: .75,
 enemies: [6, 8, 9, 5],
 meleeShare: [.6, .7, .55, .55],
 specialShare: .12,
 eliteShare: .14,
 healChance: .045,
 largeHealChance: .08,
 meleeReach: 22,
 basicDamage: [14, 20, 27],
 basicHealth: [49, 69, 92],
 minibossDamage: [20, 27, 36],
 minibossHealth: [650, 775, 900],
 bossDamage: [24, 33, 42, 54],
 bossHealth: [570, 805, 1050, 2700],
 eliteBonusDamage: 9,
} as const

export const relicSlotCount = 3
export const relicPower = (equipped: number) => [1, 1, .8, .6][equipped]

export const enemyTiming = {
 meleeCooldown: 575,
 rangedCooldown: 895,
 specialCooldown: 1000,
 bossCooldown: 910,
 meleeSpeed: 77,
 rangedSpeed: 61,
 eliteSpeed: 1.22,
 projectileSpeed: 122,
} as const
