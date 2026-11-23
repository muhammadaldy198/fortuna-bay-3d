// Boot and the one loop: the world is built module by module, then the game
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one) while the renderer paints what is there. Screens: title, play, paused
// and game over. ?seed=N fixes the world; ?shot=strip|night|chase|scale (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import * as THREE from 'three';
import { STEP, CAMERA, DEFAULT_SEED } from './config.js';
import { createRandom } from './random.js';
import { createTextures } from './textures.js';
import { createCity } from './city.js';
import { createBuildings } from './buildings.js';
import { createProps } from './props.js';
import { createVehicles } from './vehicles.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createCrew } from './crew.js';
import { createGarage } from './garage.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createWeather } from './weather.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createPhoto } from './photo.js';
import { stageShot } from './shots.js';
import { loadSave, saveGame, applySave } from './save.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
camera.position.set(0, 60, 160);

// The shared world state: every module reads and writes through G.
const G = {
  seed,
  rng: createRandom(seed),
  scene,
  camera,
  renderer,
  frame: 0,
  time: 0,
  timeOfDay: 10.5,
  screen: 'title',
  money: 250,
  wanted: 0,
  shotMode: false,
  cameraYaw: 0,
  cameraDistance: CAMERA.chaseDistance,
  fpsEma: 0,
  muted: false,
  shootCooldown: 0,
};

// Build the world, in dependency order: textures before anything that paints,
// city before anything that stands on it, actors before the systems that
// watch them, HUD last so it can read everything.
G.textures = createTextures(G);
G.city = createCity(G);
G.buildings = createBuildings(G);
G.props = createProps(G);
G.vehicles = createVehicles(G);
G.input = createInput(G);
G.player = createPlayer(G);
G.traffic = createTraffic(G);
G.pedestrians = createPedestrians(G);
G.police = createPolice(G);
G.combat = createCombat(G);
G.mission = createMissions(G);
G.crew = createCrew(G);
G.garage = createGarage(G);
G.effects = createEffects(G);
G.audio = createAudio(G);
G.weather = createWeather(G);
G.hud = createHud(G);
G.minimap = createMinimap(G);
G.photo = createPhoto(G);

// One fixed simulation step. In shot mode the player is driven by the shot
// staging, so player.update is skipped (the staging syncs player.pos to the
// car itself). On the title screen the world idles without the player.
G.step = function step(dt) {
  G.frame += 1;
  G.time += dt;
  if (!G.shotMode && G.screen === 'play') G.player.update(dt);
  G.traffic.update(dt);
  G.pedestrians.update(dt);
  G.police.update(dt);
  G.combat.update(dt);
  G.mission.update(dt);
  G.crew.update(dt);
  G.garage.update(dt);
  G.weather.update(dt);
  G.vehicles.update(dt);
  G.effects.update(dt);
  G.audio.update(dt);
};

function showScreen(name) {
  for (const id of ['title-screen', 'pause-screen', 'over-screen']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const show = document.getElementById(`${name}-screen`);
  if (show) show.style.display = 'flex';
  if (name === 'play') {
    const help = document.getElementById('help');
    if (help) help.style.display = G.shotMode ? 'none' : 'block';
  }
}

function announce(message) {
  if (status) status.textContent = message;
}

function startGame() {
  const saved = loadSave();
  if (saved) {
    applySave(G, saved);
    announce('Save loaded. Welcome back to Fortuna Bay.');
  }
  G.screen = 'play';
  showScreen('play');
  G.input.requestLock();
  announce('Playing. Press Enter to start the next job.');
  if (G.hud) G.hud.message('Fortuna Bay — press Enter for the next job, E to steal a car.');
}

function endGame() {
  G.screen = 'over';
  showScreen('over');
  const score = document.getElementById('final-score');
  if (score) score.textContent = `You banked $${G.money.toLocaleString('en-US')}.`;
  announce(`Wasted. You banked $${G.money}. Press Enter to try again.`);
}

function restartGame() {
  G.player.reset(0, 40);
  G.police.setWanted(0);
  G.money = 250;
  G.screen = 'play';
  showScreen('play');
  announce('Playing.');
}

/** The chase camera: behind the player, easing toward the ideal spot. */
function updateCamera(dt) {
  const target = G.player.pos;
  const heading = G.player.car ? G.player.car.heading : G.player.heading;
  // Ease the camera yaw toward the heading; the mouse adds a live offset.
  const mouse = G.input.takeMouse();
  G.cameraYaw -= mouse.dx * 0.0025;
  let diff = heading - G.cameraYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  G.cameraYaw += diff * Math.min(1, dt * 2.2);
  const dist = G.cameraDistance;
  const height = G.player.car ? CAMERA.chaseHeight : CAMERA.chaseHeight - 0.6;
  const wantX = target.x - Math.sin(G.cameraYaw) * dist;
  const wantZ = target.z - Math.cos(G.cameraYaw) * dist;
  const wantY = target.y + height;
  const k = 1 - Math.exp(-8 * dt);
  camera.position.x += (wantX - camera.position.x) * k;
  camera.position.y += (wantY - camera.position.y) * k;
  camera.position.z += (wantZ - camera.position.z) * k;
  camera.lookAt(target.x, target.y + CAMERA.lookHeight, target.z);
}

/** The title camera: a slow orbit over downtown. */
function updateTitleCamera(dt) {
  const t = G.time * 0.05;
  camera.position.set(Math.sin(t) * 190, 95, Math.cos(t) * 190);
  camera.lookAt(0, 10, 0);
}

/** Global keys: pause, photo mode, mute, camera, start/confirm. */
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (G.photo.active) {
      G.photo.toggle();
    } else if (G.screen === 'play') {
      G.screen = 'paused';
      showScreen('pause');
      saveGame(G);
      announce('Paused. Progress saved.');
    } else if (G.screen === 'paused') {
      G.screen = 'play';
      showScreen('play');
      announce('Playing.');
    }
  } else if (event.code === 'KeyP' && G.screen === 'play') {
    G.photo.toggle();
  } else if (event.code === 'KeyM') {
    G.muted = !G.muted;
    if (G.audio) G.audio.setMuted(G.muted);
  } else if (event.code === 'KeyC' && G.screen === 'play' && !G.photo.active) {
    const distances = [CAMERA.chaseDistance, 6, 13];
    const next = distances[(distances.indexOf(G.cameraDistance) + 1) % distances.length];
    G.cameraDistance = next;
  } else if (event.code === 'Enter') {
    if (G.screen === 'title') startGame();
    else if (G.screen === 'over') restartGame();
    else if (G.screen === 'play' && !G.mission.current) G.mission.start();
  }
});

canvas.addEventListener('click', () => {
  if (G.screen === 'title') startGame();
  else if (G.screen === 'over') restartGame();
  else if (G.screen === 'play') G.input.requestLock();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play') {
    G.screen = 'paused';
    showScreen('pause');
    saveGame(G);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function shootTowardCamera() {
  if (G.shootCooldown > 0 || G.player.car) return;
  G.shootCooldown = 0.22;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  G.combat.shoot(
    { x: G.player.pos.x, y: 1.4, z: G.player.pos.z },
    { x: dir.x, y: 0, z: dir.z },
  );
}

function runShot(name) {
  G.shotMode = true;
  G.screen = 'play';
  showScreen('play');
  stageShot(name, G);
  // A few more steps so the minimap (redrawn every 3rd frame) is painted.
  for (let i = 0; i < 3; i += 1) {
    G.step(STEP);
    G.hud.update();
    G.minimap.update();
  }
  // Heli position in normalized device coordinates, for the QA check.
  if (G.police.heli) {
    const ndc = G.police.heli.pos.clone().project(camera);
    window.__heliNdc = { x: ndc.x, y: ndc.y };
    window.__heliMode = G.police.heli.mode;
  } else {
    window.__heliNdc = null;
    window.__heliMode = null;
  }
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  showScreen('title');
  announce('Fortuna Bay. Press Enter or click to start.');

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (frameDt > 0) G.fpsEma = G.fpsEma * 0.95 + (1 / frameDt) * 0.05;
    G.shootCooldown = Math.max(0, G.shootCooldown - frameDt);

    if (G.photo.active) {
      G.photo.update(frameDt);
      renderer.render(scene, camera);
      return;
    }
    if (G.screen === 'title') {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        G.step(STEP);
        accumulator -= STEP;
      }
      updateTitleCamera(frameDt);
      renderer.render(scene, camera);
      return;
    }
    if (G.screen === 'paused' || G.screen === 'over') {
      if (G.screen === 'over') endGameCheck();
      renderer.render(scene, camera);
      return;
    }
    // Play: fixed steps, camera follow, shooting, HUD.
    accumulator += frameDt;
    while (accumulator >= STEP) {
      G.step(STEP);
      accumulator -= STEP;
    }
    if (G.input.isMouseDown()) shootTowardCamera();
    updateCamera(frameDt);
    G.hud.update();
    G.minimap.update();
    if (G.player.health <= 0 && G.screen === 'play') endGame();
    renderer.render(scene, camera);
  }

  function endGameCheck() {
    // The over screen is shown once by endGame(); nothing to do per frame.
  }

  requestAnimationFrame(frame);
}

// QA hooks: the whole world, the shot flag, and the error count.
window.__game = G;
window.__shotReady = false;
window.__heliNdc = null;

if (shot) runShot(shot);
else runGame();
