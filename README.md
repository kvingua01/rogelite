# Cursed Knight

A single-player pixel-art browser roguelite. Enter the Last Keep, choose your starting loadout, and fight through three procedurally generated floors to reach the Fallen King. Gold, blueprints, and forge materials fund permanent progression between runs.

## Play locally

Requires Node.js 22.18 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints in a desktop browser.

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left mouse button | Attack |
| Q or mouse wheel | Switch weapons |
| Space | Dodge |
| E | Talk to a nearby castle NPC or activate the equipped relic in a dungeon |
| F | Interact near a room's chest, altar, merchant, or other fixture |
| I | View the equipped weapons |
| R | Open or close relic equipment |
| Tab | Expand the dungeon map |
| Escape | Pause or return to combat |

Walk around the castle with WASD. Approach a station and press E to use it. The Blacksmith handles crafting and starting equipment. Training Grounds, Alchemist, Treasury, and Watchtower each offer their own upgrades. Enter a run at the Dungeon Gate, where challenges appear after the first victory. Escape closes a station menu or opens the castle pause menu while walking.

Each main boss grants one permanent material. The Blacksmith lists Cursed Bone, Blighted Heart, Infernal Core, Abyssal Essence, and Forge Scrap separately. Older general materials remain as Forge Scrap. Only the Abyssal Greatsword uses Abyssal Essence. Its blueprint can drop from the Abyssal Overlord.

Defeating the Fallen King records a normal victory and opens an optional portal to the Abyssal Depths. You can finish the run or carry your current health and equipment into the fourth floor. Abyssal victories are tracked separately.

New saves start with the Rusty Sword and Wooden Bow. Existing saves keep their equipped weapons and receive the Wooden Bow as a fallback if they had no ranged weapon.

Discover blueprints during runs and spend gold and materials at the castle Blacksmith to unlock weapons permanently. Equip one melee weapon and, after training, one ranged weapon before entering the dungeon. Press I during a run to view your locked loadout. Dungeon shops sell provisions.

You start each run without relics. A treasure room branches off the first combat room on every floor. Stand by the chest and press F, then claim its guaranteed relic. Equip up to three through the relic inventory, including at most one active relic. All equipped relics run at 100% power. The Training Grounds offer separate melee and ranged attack-speed upgrades.

Permanent progress is stored in localStorage for the current browser and origin. Refreshing during a run returns to the castle with any permanent progress earned so far.

## Test and deploy

```sh
npm test
npm run test:browser
npm run build
npm run preview
```

The browser test uses a local Chromium installation at `/usr/bin/chromium`. Set `CHROMIUM_PATH` to use another executable. The smoke test drives the game in Chromium and uses controlled state for boss defeats and progression fixtures.

Upload the contents of `dist/` to a static host. For GitHub Pages, publish `dist/` as the Pages artifact through GitHub Actions. The production build uses relative asset URLs and can be served from a repository subpath. Saves are scoped to the deployed origin.
