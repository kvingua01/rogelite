export const bossMaterials=['Cursed Bone','Blighted Heart','Infernal Core','Abyssal Essence'] as const
export type BossMaterial=typeof bossMaterials[number]
export type BossMaterials=Record<BossMaterial,number>
type Recipe=Partial<BossMaterials> & {scrap?:number;gold?:number}

export const abyssalWeapon='Abyssal Greatsword'
export const recipes:Readonly<Record<string,Recipe>> = {
 'Grave Axe':{gold:30,'Cursed Bone':2},
 'Frost Pike':{gold:45,'Cursed Bone':2,'Blighted Heart':2,scrap:1},
 'Cinder Hammer':{gold:80,'Cursed Bone':2,'Blighted Heart':3,'Infernal Core':2,scrap:1},
 'Shade Dagger':{gold:65,'Cursed Bone':1,'Blighted Heart':2,'Infernal Core':1,scrap:1},
 'Iron Crossbow':{gold:35,'Cursed Bone':2},
 'Storm Staff':{gold:50,'Cursed Bone':1,'Blighted Heart':3,scrap:1},
 'Venom Wand':{gold:45,'Cursed Bone':2,'Blighted Heart':2,scrap:1},
 'Night Knives':{gold:70,'Cursed Bone':1,'Blighted Heart':3,'Infernal Core':2,scrap:1},
 [abyssalWeapon]:{gold:100,'Cursed Bone':3,'Blighted Heart':5,'Infernal Core':2,'Abyssal Essence':2},
}
export function emptyBossMaterials():BossMaterials{
 return {'Cursed Bone':0,'Blighted Heart':0,'Infernal Core':0,'Abyssal Essence':0}
}
type Wallet={gold:number;materials:number;bossMaterials:BossMaterials}
export function hasRecipeMaterials(wallet:Wallet,recipe:Recipe){
 return wallet.materials>=(recipe.scrap??0)&&bossMaterials.every(material=>wallet.bossMaterials[material]>=(recipe[material]??0))
}
export function canCraft(wallet:Wallet,recipe:Recipe){
 return hasRecipeMaterials(wallet,recipe)&&wallet.gold>=(recipe.gold??0)
}
export function payRecipe(wallet:Wallet,recipe:Recipe){
 if(!canCraft(wallet,recipe))return false
 wallet.gold-=recipe.gold??0
 wallet.materials-=recipe.scrap??0
 for(const material of bossMaterials)wallet.bossMaterials[material]-=recipe[material]??0
 return true
}
export function recipeCost(recipe:Recipe){
 return [...bossMaterials.flatMap(material=>recipe[material]?[recipe[material]+' '+material]:[]),
  ...(recipe.scrap?[recipe.scrap+' Forge Scrap']:[]),...(recipe.gold?[recipe.gold+' gold']:[])].join(' · ')
}
