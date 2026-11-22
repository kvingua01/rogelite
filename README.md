# Cursed Knight

A single-player pixel-art browser roguelite. Enter the Last Keep, choose two starting weapons, and fight through three procedurally generated floors to reach the Fallen King. Gold, blueprints, and forge materials fund permanent progression between runs.

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
| E | Activate the equipped relic |
| F | Interact near a room's chest, altar, merchant, or other fixture |
| R | Open or close relic equipment |
| Tab | Expand the dungeon map |
| Escape | Pause or return to combat |

New saves start with the Rusty Sword. Buy Ranged Weapon Training at the castle for 125 gold to unlock the Wooden Bow and projectile slot. Existing ranged unlocks carry forward.

Relics can be collected freely during a run. Equip up to three through the relic inventory, including at most one active relic. One equipped relic runs at 100% power, two at 80% each, and three at 60% each.

Permanent progress is stored in localStorage for the current browser and origin. Refreshing during a run returns to the main menu with any permanent progress earned so far.

## Test and deploy

```sh
npm test
npm run test:browser
npm run build
npm run preview
```

The browser test uses a local Chromium installation at `/usr/bin/chromium`. Set `CHROMIUM_PATH` to use another executable. The smoke test drives the game in Chromium and uses controlled state for boss defeats and progression fixtures.

Upload the contents of `dist/` to a static host. For GitHub Pages, publish `dist/` as the Pages artifact through GitHub Actions. The production build uses relative asset URLs and can be served from a repository subpath. Saves are scoped to the deployed origin.
