# fortuna-bay-3d

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/muhammadaldy198/fortuna-bay-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/muhammadaldy198/fortuna-bay-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Fortuna Bay 3D v2 — a sun-soaked 3D open-world beach city game on Isla Fortuna. Drive a living city through a full day/night cycle: 7 named districts, traffic and pedestrians, a 5-star FBPD wanted system with roadblocks and the FALCON-1 helicopter hunting you from 3 stars, 11 story missions plus taxi, courier and street-race side jobs, a 3-person crew (mechanic, hacker, decoy), a safehouse garage with respray and engine upgrades, hidden packages, a respect rank ladder, 3 synth radio stations, passing rain showers that make the roads slick — and a photo mode with a free drone camera. Everything runs offline in the browser — Three.js, procedural textures, synthesized audio, no network requests.

## What v2 proves (each screenshot shows it)

1. **FALCON-1 OVER THE STRIP** — golden hour, the heli tracking low ahead of the player's car, rule-of-thirds framing, the tower skyline behind.
2. **SEARCHLIGHT NIGHT** — 22:00, the volumetric spotlight cone and its pool on Ocean Plaza, glowing windows, peds cowering under the rotor wash.
3. **CHASE** — a daytime drift past a roadblock with the heli in the sky above, skid marks, and a smashed hydrant geyser.
4. **CITY SCALE** — birdseye over the whole island: coast, tower, port cranes, the full grid, the heli a small silhouette with its shadow and spotlight.

## Features

- **Open world:** 14×14 block city on an island — 7 named districts, a marina, a port with cranes, a boardwalk, a lighthouse, over 480 buildings with lit windows, a 120 m Fortuna Tower, two helipads and the Ocean Plaza fountain.
- **FALCON-1 (v2):** a first-class helicopter — high patrol, low tracking ahead of the player, periodic fly-bys across the camera, hover-and-sweep, rotor blur disc and strobes, volumetric spotlight with a ground pool and blob shadow, rotor wash that scatters dust and makes peds cower. 5 seconds in the beam and you're busted; shoot it down and the FBPD needs 30 s to replace it. Lola's decoy fools the heli too.
- **Living traffic (v2):** 26 AI cars that follow the grid, brake smoothly for the car ahead (IDM-lite), overtake with indicators, and pull over to the kerb for sirens; brake lights brighten under braking. 42 pedestrians who walk, flee gunfire, cower under rotor wash, run out of the searchlight, and call the police when they witness a crime.
- **Destructible streets (v2):** hydrants burst into geysers, lamps and trees topple when a car hits them, and respawn after 20 s.
- **Wanted system:** 0–5 stars with readable states (SEARCHING / ACTIVE / ESCAPING), FBPD pursuit with roadblocks and spike strips, line-of-sight evasion, busted/respawn at FBPD HQ and the hospital.
- **Missions:** 11 story missions (steal, tail, chase, checkpoint race, rampage, survival, heist, and "Out of the Light" — stay out of the searchlight for 60 s) plus taxi, courier, and street-race side jobs, with a beacon, objective banner, GPS route line on the minimap, and timer.
- **Photo mode (v2):** press O — drone camera (WASD + Q/E, mouse orbit, scroll FOV 25–90), rule-of-thirds grid (G), HUD hidden. URL flags pin the light: `?time=19:20&weather=golden-hour&wanted=3`.
- **Day/night cycle (v2):** the sun, sky, fog and window glow follow the clock — golden hour, deep night, bright morning.
- **Combat:** 5 weapons (fists, pistol, SMG, shotgun, rifle) with aim, hitscan, muzzle flash, and enemies that only shoot with line of sight.
- **Crew & garage:** Rico repairs your car, Vex scrubs a star, Lola sends a decoy; the safehouse heals you, stores cars, resprays, and upgrades engines.
- **Weather:** passing rain showers cut grip, pull the fog in, dim the sky, and play rain noise.
- **Save:** progress, cash, garage, collected packages, photo grid and heli escapes persist in localStorage.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no install.

For the four capture shots, open `/?shot=strip&seed=1` (or `night`, `chase`, `scale`) — the scenes are listed in `shots.json` at the entry root.

## Controls

WASD drive / walk · E enter car · M mission · 1–5 / Q weapons · Click shoot · Right-click aim · Space handbrake · Tab map · R radio · Z / X / C crew · G garage · O photo mode (G grid, scroll zoom) · Esc pause

---

<sub>Entered on [make.fun](https://make.fun/?ref=3p0axm2p&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
