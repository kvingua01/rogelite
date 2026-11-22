export const bossMaterials=['Cursed Bone','Blighted Heart','Infernal Core','Abyssal Essence'] as const
export type BossMaterial=typeof bossMaterials[number]
export type BossMaterials=Record<BossMaterial,number>
type Recipe=Partial<BossMaterials> & {scrap?:number}

export const abyssalWeapon='Abyssal Greatsword'
export const recipes:Readonly<Record<string,Recipe>> = {
 'Grave Axe':{'Cursed Bone':2},
 'Frost Pike':{'Cursed Bone':2,'Blighted Heart':2,scrap:1},
 'Cinder Hammer':{'Cursed Bone':2,'Blighted Heart':3,'Infernal Core':2,scrap:1},
 'Shade Dagger':{'Cursed Bone':1,'Blighted Heart':2,'Infernal Core':1,scrap:1},
 'Iron Crossbow':{'Cursed Bone':2},
 'Storm Staff':{'Cursed Bone':1,'Blighted Heart':3,scrap:1},
 'Venom Wand':{'Cursed Bone':2,'Blighted Heart':2,scrap:1},
 'Night Knives':{'Cursed Bone':1,'Blighted Heart':3,'Infernal Core':2,scrap:1},
 [abyssalWeapon]:{'Cursed Bone':3,'Blighted Heart':5,'Infernal Core':2,'Abyssal Essence':2},
}
export function emptyBossMaterials():BossMaterials{
 return {'Cursed Bone':0,'Blighted Heart':0,'Infernal Core':0,'Abyssal Essence':0}
}
type Wallet={materials:number;bossMaterials:BossMaterials}
export function canCraft(wallet:Wallet,recipe:Recipe){
 return wallet.materials>=(recipe.scrap??0)&&bossMaterials.every(material=>wallet.bossMaterials[material]>=(recipe[material]??0))
}
export function payRecipe(wallet:Wallet,recipe:Recipe){
 if(!canCraft(wallet,recipe))return false
 wallet.materials-=recipe.scrap??0
 for(const material of bossMaterials)wallet.bossMaterials[material]-=recipe[material]??0
 return true
}
export function recipeCost(recipe:Recipe){
 return [...bossMaterials.flatMap(material=>recipe[material]?[recipe[material]+' '+material]:[]),
  ...(recipe.scrap?[recipe.scrap+' Forge Scrap']:[])].join(' · ')
}
