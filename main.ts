// FORTUNA BAY 3D v2 — a working gta6-01 entry (Node 22, standard library
// only). The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES modules, the
// vendored three.js build, no network request at all). This program hands
// it in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. The game itself is a 3D open-world beach city
// — Isla Fortuna — with traffic, pedestrians, the FBPD wanted system,
// FALCON-1 as a first-class helicopter (low tracking, fly-bys, hover
// sweeps, a 5-second searchlight capture timer), 11 story missions, photo
// mode with a drone camera, a day/night cycle, destructible street
// furniture, crew, garage, radio and weather.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(here, 'game'))) {
  throw new Error('game/ is missing beside main.ts — nothing to hand in');
}
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (!existsSync(join(out, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry has no playable page');
}
mkdirSync(join(out, 'screenshots'), { recursive: true });
// The four v2 capture shots (shots.json at the entry root): 1-strip,
// 2-night, 3-chase, 4-scale — 1280x720 JPEGs, each with FALCON-1 in frame.
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
