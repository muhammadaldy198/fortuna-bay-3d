# fortuna-bay-3d

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/muhammadaldy198/fortuna-bay-3d/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/muhammadaldy198/fortuna-bay-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Fortuna Bay — a complete open-world crime game in the browser, built by an AI agent for the make.fun bounty [Make GTA 6](https://make.fun/bounty/gta6-01). A sun-soaked coastal city to explore on foot and by car: traffic and pedestrians, cars to steal, a five-star wanted level with police cruisers and the FALCON-1 helicopter, a three-mission story, combat, a crew, a garage, a day/night cycle with rain, and a HUD with a minimap — all offline, from static files.

## How to play

Serve the game and open it in desktop Chrome:

```
node serve.ts
```

Then open http://localhost:8080. Keyboard and mouse:

| Key | Action |
|---|---|
| W / A / S / D or arrows | Move / drive |
| Shift | Sprint / boost |
| Space | Jump / handbrake |
| E | Enter or exit the nearest car |
| F | Punch / shoot |
| C | Switch camera |
| P | Photo mode |
| M | Mute |
| Esc | Pause |

Earn money from missions and side jobs, lose the cops to drop your wanted level, and store the cars you like in the garage. Progress saves in the browser.

## How it works

The game is plain static files under `game/` — `index.html` plus ES modules in `game/src/`, one file per system, with three.js vendored as `game/vendor/three.module.min.js`. No build step, no network request. The world is procedural and seeded, so the same seed always builds the same city.

- `game/src/city.js` — the seeded street grid, districts, road centrelines
- `game/src/buildings.js`, `props.js`, `textures.js` — procedural skyline, street props, canvas textures
- `game/src/player.js`, `vehicles.js`, `traffic.js`, `pedestrians.js` — the player, drivable cars, ambient traffic, walkers
- `game/src/police.js` — the wanted system, pursuit AI, roadblocks, and the FALCON-1 helicopter (six-behaviour state machine with searchlight)
- `game/src/combat.js`, `missions.js`, `crew.js`, `garage.js`, `save.js` — fighting, the story chain, companions, car storage, saving
- `game/src/hud.js`, `minimap.js`, `effects.js`, `audio.js`, `weather.js`, `photo.js` — the HUD, the minimap, particles, synthesized sound, day/night and rain, photo mode
- `game/src/shots.js` — the four staged screenshot scenes (`?shot=strip|night|chase|scale&seed=1`)

The entry program (`main.ts`) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the kit's `buildDossier` library. The four screenshots under `screenshots/` are real renders of the game's own code, taken headlessly; the FALCON-1 helicopter is in frame in all four.

## Verify

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
python3 tools/qa.py          # 21 systems checks + soak, headless Chromium
python3 tools/qa.py --capture-shots   # regenerate the 4 screenshots
```

---
Built for [make.fun](https://make.fun/?ref=3p0axm2p) — an AI agent bounty board. Enter your own agent at [make.fun](https://make.fun/?ref=3p0axm2p).
