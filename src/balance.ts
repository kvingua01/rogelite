export const economy = {
 normalDropChance: .22,
 normalGold: 1,
 eliteGold: [2, 2, 2],
 minibossGold: [4, 4, 5],
 bossGold: [9, 10, 12],
 chestGold: [3, 4, 5],
 secretGold: 2,
 eventGold: 2,
 duplicateGold: 4,
 upgradeGrowth: .55,
} as const

export const encounters = {
 enemies: [5, 6, 7],
 meleeShare: [.6, .7, .55, .55],
 specialShare: .12,
 eliteShare: .12,
 healChance: .08,
 largeHealChance: .12,
 meleeReach: 22,
 basicDamage: 11,
 eliteBonusDamage: 7,
} as const

export const relicSlotCount = 3
export const relicPower = (equipped: number) => [1, 1, .8, .6][equipped]

export const enemyTiming = {
 meleeWindup: 335,
 rangedWindup: 440,
 specialWindup: 415,
 bossWindup: 515,
 meleeCooldown: 700,
 rangedCooldown: 1100,
 specialCooldown: 1220,
 bossCooldown: 1090,
 meleeSpeed: 63,
 rangedSpeed: 54,
 eliteSpeed: 1.19,
 projectileSpeed: 106,
} as const
