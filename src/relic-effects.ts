import type { Relic } from './data'

export const dotRate = (level:number) => .075+level*.035
export const dotDuration = (level:number) => 1300+level*200
export const frostDuration = (level:number) => 700+level*220
export const shadowDamage = (level:number) => .09*level
export const rimeDamage = .16
export const duskHeal = 2
export const activeDamage = (level:number) => 27+level*14
export const chaliceHeal = (level:number) => 22+level*7
export const wardDuration = (level:number) => 650+level*520
export const bellRadius = 140
export const bellHeal = 12
export const mirrorRange = (level:number) => level*45

export function relicEffect(relic:Relic,level:number) {
 const rounded=(value:number)=>Math.round(value*100)/100
 const seconds=(ms:number)=>rounded(ms/1000)+' s'
 switch(relic.name){
  case 'Cinder Heart': return `Burn for ${seconds(dotDuration(level))} at ${rounded(dotRate(level)*100)}% of hit damage per second.${level===3?' Nearby foes take '+rounded(35)+'% splash damage.':''}`
  case 'Bog Idol': return `Poison for ${seconds(dotDuration(level))} at ${rounded(dotRate(level)*100)}% of hit damage per second.${level===3?' Also slows foes.':''}`
  case 'Rime Seal': return `Slow enemies by ${rounded(48)}% for ${seconds(frostDuration(level))}.${level===3?' Attack damage +'+rounded(100*rimeDamage)+'%.':''}`
  case 'Forked Bolt': return `Add ${level>=2?2:1} extra bolts at ${rounded(78)}% damage and chain for ${rounded(28)}% damage.${level===3?' Bolts pierce.':''}`
  case 'Glass Compass': return level===3?'Reveals the entire floor.':level===2?'Reveals secrets, treasure, and adjacent paths.':'Reveals secret rooms.'
  case 'Mirror Quiver': return `Bolts bounce and gain ${rounded(mirrorRange(level))} range.${level===3?' Bolts home in on enemies.':''}`
  case 'Dusk Crown': return `Attack damage +${rounded(100*shadowDamage(level))}%.${level===3?' Restore '+rounded(duskHeal)+' HP per kill.':''}`
  case 'Sun Bell': return `Shockwave deals ${rounded(activeDamage(level))} damage within ${rounded(bellRadius)} range.${level===3?' Restore '+rounded(bellHeal)+' HP.':''}`
  case 'Blood Chalice': return `Restore ${rounded(chaliceHeal(level))} HP.${level===3?' Invulnerable for '+seconds(wardDuration(level))+'.':''}`
  case 'Thunder Rune': return `Deal ${rounded(activeDamage(level))} damage to each foe.${level===3?' Also slows foes.':''}`
  case 'Grave Lantern': return `Invulnerable for ${seconds(wardDuration(level))}.${level===3?' Deal '+rounded(activeDamage(level))+' damage to each foe.':''}`
  default: return ''
 }
}
