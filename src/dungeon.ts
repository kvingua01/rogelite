export const floors = [
  { name: 'Forgotten Castle', boss: 'Skeleton King', palettes: [0x534858, 0x3b5241, 0x47405d, 0x54434c], biomes: ['Abandoned Barracks', 'Castle Gardens', 'Haunted Library', 'Royal Dungeon'], minis: ['Iron Gaoler', 'Briar Sentinel', 'Ink Wraith', 'Chain Revenant'] },
  { name: 'Blighted Forest', boss: 'Blighted Guardian', palettes: [0x40584d, 0x4e4557, 0x63504b, 0x425755], biomes: ['Poison Swamp', 'Spider Hollow', 'Mushroom Grove', 'Ancient Ruins'], minis: ['Mire Toad', 'Silk Matriarch', 'Spore Lord', 'Moss Colossus'] },
  { name: 'Burning Fortress', boss: 'Fallen King', palettes: [0x633a36, 0x563b4b, 0x48404d, 0x654238], biomes: ['Lava Chambers', 'Demon Barracks', 'Ashen Crypt', 'Cursed Throne'], minis: ['Magma Wyrm', 'Horned Captain', 'Ash Lich', 'Ember Knight'] },
]
export type Kind = 'Entry' | 'Combat' | 'Treasure' | 'Shop' | 'Curse Altar' | 'Secret' | 'Trap' | 'Miniboss' | 'Boss' | 'Event' | 'Blacksmith'
export type Room = { id: number; x: number; y: number; patch: number; kind: Kind; neighbors: number[]; seen: boolean; cleared: boolean; used: boolean; fountain?:boolean }
export const sample = <T>(list: readonly T[], rng = Math.random): T => list[Math.floor(rng() * list.length)]
export function generate(rng = Math.random): Room[] {
  const rooms: Room[] = []
  const add = (x: number, y: number, patch: number, kind: Kind, from?: Room) => {
    const room = {id: rooms.length, x, y, patch, kind, neighbors: [] as number[], seen: false, cleared: false, used: false}
    if (from) { room.neighbors.push(from.id); from.neighbors.push(room.id) }
    rooms.push(room)
    return room
  }
  let last = add(0, 0, 0, 'Entry')
  const features: Kind[] = ['Treasure','Shop','Curse Altar','Secret','Trap','Event','Blacksmith','Combat']
  for (let patch = 0; patch < 4; patch++) {
    const middle = add(last.x + 1, last.y, patch, 'Combat', last)
    const count = 2
    const sign = rng() < 0.5 ? 1 : -1
    for (let branch = 0; branch < count; branch++) {
      const index = Math.floor(rng() * features.length)
      const kind = patch === 0 && branch === 0 ? 'Treasure' : features.splice(index, 1)[0]
      if (patch === 0 && branch === 0) features.splice(features.indexOf('Treasure'),1)
      add(middle.x, middle.y + sign * (branch ? -1 : 1), patch, kind, middle)
    }
    if (rng() < 0.7) {
      const turn = rng() < 0.5 ? -1 : 1
      last = add(middle.x + 1, middle.y, patch, 'Combat', middle)
      last = add(last.x, last.y + turn, patch, 'Miniboss', last)
    } else last = add(middle.x + 1, middle.y, patch, 'Miniboss', middle)
  }
  add(last.x + 1, last.y, 3, 'Boss', last)
  sample(rooms.filter(room=>room.kind==='Secret'||room.kind==='Event'),rng).fountain=true
  return rooms
}
