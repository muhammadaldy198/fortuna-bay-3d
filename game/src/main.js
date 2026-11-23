// FORTUNA BAY 3D v2 — boot and the one loop. The world advances in fixed
// 1/60 s steps; the renderer paints what is there. Screens: title, play,
// pause. ?seed=N fixes the city. ?shot=strip|night|chase|scale|soak|
// systemstest stages a scene and sets window.__shotReady (or
// __soakDone / __systemsTest) for the capture tool. ?time=HH:MM pins the
// clock, ?weather=golden-hour|night|rain sets the light, ?wanted=N sets
// the heat (manual photo sessions; shot stages set their own).
import * as THREE from 'three';
import {
  AMBIENT, BUSTED_FINE, FOG_COLOR, FOG_FAR, FOG_NEAR, ISLAND,
  MINUTES_PER_SECOND, MISSION_COUNT, PACKAGE_VALUE, PLAYER_HEALTH,
  RESPAWN_FEE, SEA, SKY_HORIZON, SKY_TOP, START_CASH, STEP, SUN_COLOR,
  SUN_POS, TIME_START, districtAtPos,
} from './config.js';
import { createRandom, seedFromString } from './random.js';
import { createCity } from './city.js';
import { createBuildings } from './buildings.js';
import { createProps } from './props.js';
import { createEffects } from './effects.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createCrew } from './crew.js';
import { createGarage } from './garage.js';
import { createAudio } from './audio.js';
import { createWeather } from './weather.js';
import { createHUD } from './hud.js';
import { createMinimap } from './minimap.js';
import { createInput } from './input.js';
import { createPhoto } from './photo.js';
import { createShots } from './shots.js';
import { makeGroundTexture, makeOceanTexture } from './textures.js';
import { clearSave, loadSave, writeSave } from './save.js';

const MAX_FRAME = 0.25;
const MAX_STEPS = 8;

const params = new URLSearchParams(window.location.search);
// ?seed= accepts a number or a name (?seed=fortuna hashes to a seed).
const seedParam = params.get('seed');
const SEED = seedParam === null ? 1 : (/^-?\d+$/.test(seedParam) ? Number(seedParam) || 1 : seedFromString(seedParam));
const SHOT = params.get('shot');
const SHOT_MODE = !!SHOT;

// ---- Renderer, scene, lights ------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 60, 420);

// Sky dome: a gradient shader, golden horizon to deep blue zenith.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      horizon: { value: new THREE.Color(SKY_HORIZON) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 horizon; void main() { float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
  }),
);
scene.add(sky);

const sun = new THREE.DirectionalLight(SUN_COLOR, 2.2);
sun.position.set(SUN_POS[0], SUN_POS[1], SUN_POS[2]);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x8aa0c8, 0x8a6a4a, 0.9));
scene.add(new THREE.AmbientLight(AMBIENT, 0.55));

// ---- Event bus ---------------------------------------------------------------
let errorCount = 0;
const listeners = new Map();
function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
}
function emit(event, data) {
  const fns = listeners.get(event);
  if (!fns) return;
  for (const fn of fns) {
    try {
      fn(data || {});
    } catch (err) {
      errorCount++;
      console.error(`event ${event} handler failed`, err);
    }
  }
}

// ---- State -------------------------------------------------------------------
const state = {
  screen: 'title',
  cash: START_CASH,
  respect: 0,
  health: PLAYER_HEALTH,
  wanted: 0,
  weapon: 'pistol',
  missionIndex: 0,
  missionsDone: [],
  garage: [],
  inCar: false,
  car: null,
  radio: 0,
  radioOn: false,
  decoy: null,
  bestRace: null,
  packages: [],
  timeMin: TIME_START,
  heliEscapes: 0,
};

// ---- World -------------------------------------------------------------------
const rng = createRandom(SEED);
const city = createCity(SEED);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ISLAND, ISLAND),
  new THREE.MeshLambertMaterial({ map: makeGroundTexture(THREE) }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const oceanTex = makeOceanTexture(THREE);
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(SEA, SEA),
  new THREE.MeshLambertMaterial({ map: oceanTex }),
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.4;
scene.add(ocean);

// ---- Context -----------------------------------------------------------------
// G.rng is the ONE seeded stream the whole game shares: city gen, traffic,
// ped spawns, mission picks, respray colours and the crew decoy all draw
// from it, so a fixed ?seed= replays the same world. Modules that need
// randomness must use G.rng (or the rng passed to them), never Math.random,
// except live combat spread / particle jitter, which is cosmetic.
const G = {
  scene, camera, renderer, city, rng, state, emit, on, sun, sky,
  fpsAvg: 60,
  shotMode: SHOT_MODE, // staging: the bust outcomes are disabled (police.js)
};
Object.defineProperty(G, 'errorCount', { get() { return errorCount; } });
Object.defineProperty(G, 'districtName', {
  get() {
    const pp = state.inCar && state.car ? state.car.pos : (G.player ? G.player.pos : { x: 0, z: 0 });
    const d = districtAtPos(pp.x, pp.z);
    return d ? d.name : 'Fortuna Bay';
  },
});

// ---- Systems (dependency order) ----------------------------------------------
const input = createInput(canvas);
G.input = input;
const buildings = createBuildings(scene, city);
G.buildings = buildings;
const props = createProps(scene, city, rng);
G.props = props;
const effects = createEffects(G);
G.effects = effects;
const player = createPlayer(G);
G.player = player;
const vehicles = createVehicles(G);
G.vehicles = vehicles;
const traffic = createTraffic(G);
G.traffic = traffic;
const peds = createPeds(G);
G.peds = peds;
const police = createPolice(G);
G.police = police;
const combat = createCombat(G);
G.combat = combat;
const missions = createMissions(G);
G.missions = missions;
const crew = createCrew(G);
G.crew = crew;
const garage = createGarage(G);
G.garage = garage;
const audio = createAudio();
G.audio = audio;
const weather = createWeather(G);
G.weather = weather;
const minimap = createMinimap(G);
G.minimap = minimap;
const photo = createPhoto(G);
G.photo = photo;

// Hidden packages: spinning cyan cubes at the city spots.
const packageMeshes = new Map();
{
  const pkgGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const pkgMat = new THREE.MeshBasicMaterial({ color: 0x44e0ff });
  for (const pkg of city.packages) {
    const mesh = new THREE.Mesh(pkgGeo, pkgMat);
    mesh.position.set(pkg.x, 1.2, pkg.z);
    scene.add(mesh);
    packageMeshes.set(pkg.id, mesh);
  }
}

// Parked cars around the city.
for (let i = 0; i < 8; i++) {
  const [x, z] = city.randomRoadPoint(rng);
  vehicles.spawnCar(rng.chance(0.25) ? 'sport' : 'civil', x, z, rng.next() * Math.PI * 2, { driver: null });
}

// ---- Save / load ---------------------------------------------------------------
function saveGame() {
  const pp = state.inCar && state.car ? state.car.pos : player.pos;
  const yaw = state.inCar && state.car ? state.car.yaw : player.yaw;
  writeSave({
    version: 2,
    cash: state.cash,
    respect: state.respect,
    missionsDone: state.missionsDone,
    missionIndex: state.missionIndex,
    garage: state.garage,
    pos: { x: pp.x, z: pp.z, yaw },
    weapon: state.weapon,
    radio: state.radio,
    bestRace: state.bestRace,
    packages: state.packages,
    photoGrid: photo.grid,
    heliEscapes: state.heliEscapes,
  });
}
G.saveGame = saveGame;

function applySave(data) {
  state.cash = data.cash;
  state.respect = data.respect;
  state.missionsDone = data.missionsDone || [];
  state.missionIndex = data.missionIndex || 0;
  state.garage = data.garage || [];
  state.weapon = data.weapon || 'pistol';
  state.radio = data.radio || 0;
  state.bestRace = data.bestRace ?? null;
  state.packages = data.packages || [];
  state.heliEscapes = data.heliEscapes || 0;
  photo.setGrid(!!data.photoGrid);
  if (data.pos) player.setPos(data.pos.x, data.pos.z, data.pos.yaw);
  for (const id of state.packages) {
    const mesh = packageMeshes.get(id);
    if (mesh) {
      scene.remove(mesh);
      packageMeshes.delete(id);
    }
  }
}

function resetState() {
  state.cash = START_CASH;
  state.respect = 0;
  state.health = PLAYER_HEALTH;
  state.wanted = 0;
  state.weapon = 'pistol';
  state.missionIndex = 0;
  state.missionsDone = [];
  state.garage = [];
  state.inCar = false;
  state.car = null;
  state.radio = 0;
  state.radioOn = false; // a fresh game starts silent until PLAY starts it
  state.decoy = null;
  state.bestRace = null;
  state.packages = [];
  state.timeMin = TIME_START;
  state.heliEscapes = 0;
  player.setPos(0, 300, Math.PI);
  player.group.visible = true;
}

// ---- HUD -----------------------------------------------------------------------
const hud = createHUD(G, {
  onPlay(useSave) {
    startGame(useSave);
  },
  onResume() {
    resumeGame();
  },
  onRestart() {
    clearSave();
    resetState();
    missions.cleanup();
    police.setWanted(0);
    resumeGame();
  },
  onSideJob(kind) {
    resumeGame();
    missions.startSideJob(kind);
  },
});
G.hud = hud;

const shots = createShots(G);
G.shots = shots;

// ---- Screens -------------------------------------------------------------------
const savedGame = loadSave();

function startGame(useSave) {
  if (useSave && savedGame) applySave(savedGame);
  else {
    clearSave();
    resetState();
  }
  state.screen = 'play';
  hud.hideTitle();
  audio.init();
  audio.setRadio(state.radio);
  state.radioOn = true;
}

function pauseGame() {
  if (state.screen !== 'play') return;
  state.screen = 'pause';
  hud.showPause();
  audio.setEngine(false, 0);
  input.releaseLock();
}

function resumeGame() {
  if (state.screen !== 'pause') return;
  state.screen = 'play';
  hud.hidePause();
  audio.init();
  if (state.inCar) audio.setEngine(true, 0);
}

// Death / busted: respawn at the hospital / FBPD HQ, minus a fee.
on('died', () => {
  const hospital = city.landmarks.hospital;
  respawnAt(hospital.x, hospital.z, RESPAWN_FEE, 'WASTED', `Hospital bill -$${RESPAWN_FEE}`);
});
on('busted', () => {
  const hq = city.landmarks.police;
  respawnAt(hq.x, hq.z, BUSTED_FINE, 'BUSTED', `Fine -$${BUSTED_FINE}`);
});
function respawnAt(x, z, fee, title, sub) {
  if (state.inCar && state.car) {
    state.car.driver = null;
    state.inCar = false;
    state.car = null;
  }
  state.health = PLAYER_HEALTH;
  state.cash = Math.max(0, state.cash - fee);
  police.setWanted(0);
  player.setPos(x + 6, z + 6, Math.PI);
  player.group.visible = true;
  audio.setEngine(false, 0);
  hud.bigBanner(title, sub);
}

// ---- Keys ----------------------------------------------------------------------
function handleKeys() {
  if (state.screen === 'title') {
    // Enter / Space start a fresh game, exactly like the PLAY button.
    if (input.pressed('Enter') || input.pressed('Space')) startGame(false);
    return;
  }
  if (state.screen === 'pause') {
    if (input.pressed('Escape') || input.pressed('KeyP') || input.pressed('Enter')) resumeGame();
    return;
  }
  // Play screen. Photo mode owns the keys while it is active: Esc/O exits
  // it, everything else goes to the drone (handled in photo.update).
  if (photo.active) {
    if (input.pressed('Escape') || input.pressed('KeyO')) photo.toggle();
    return;
  }
  if (input.pressed('KeyO')) {
    photo.toggle();
    return;
  }
  if (input.pressed('Escape') || input.pressed('KeyP')) {
    pauseGame();
    return;
  }
  if (input.pressed('KeyE')) {
    if (state.inCar) vehicles.exitCar();
    else {
      const car = vehicles.nearestCar(player.pos.x, player.pos.z, 4);
      if (car) vehicles.enterCar(car);
    }
  }
  if (input.pressed('KeyM') && !missions.current && state.missionIndex < MISSION_COUNT) {
    missions.startMission(state.missionIndex);
  }
  if (input.pressed('Enter') && !missions.current && state.missionIndex < MISSION_COUNT) {
    missions.startMission(state.missionIndex);
  }
  if (input.pressed('KeyT') && !missions.current) missions.startSideJob('taxi');
  if (input.pressed('KeyU') && !missions.current) missions.startSideJob('courier');
  if (input.pressed('KeyN') && !missions.current) missions.startSideJob('race');
  if (input.pressed('Tab')) minimap.toggleFull();
  if (input.pressed('KeyR')) {
    state.radio = (state.radio + 1) % 3;
    audio.setRadio(state.radio);
    state.radioOn = true;
  }
  if (input.pressed('KeyG')) {
    if (state.inCar) garage.storeCar();
    else garage.takeOut();
  }
  if (input.pressed('KeyH')) garage.respray();
  if (input.pressed('KeyJ')) garage.upgrade();
  if (input.pressed('KeyZ')) crew.use('rico');
  if (input.pressed('KeyX')) crew.use('vex');
  if (input.pressed('KeyC')) crew.use('lola');
}

// ---- Step ------------------------------------------------------------------------
let simT = 0;
function step(dt) {
  const playing = state.screen === 'play';
  simT += dt;
  if (playing) state.timeMin += dt * MINUTES_PER_SECOND;

  player.update(dt, playing && !state.inCar && !photo.active);
  // Photo mode freezes the PLAYER's inputs (the drone owns them) but the
  // world keeps simulating: traffic, cops and the heli all keep moving.
  if (playing && !photo.active) vehicles.update(dt);
  traffic.update(dt);
  peds.update(dt);
  police.update(dt);
  combat.update(dt);
  missions.update(dt);
  crew.update(dt);
  garage.update(dt);
  weather.update(dt);
  effects.update(dt);
  buildings.update(simT);
  props.update(simT, dt);
  audio.update(dt);
  if (playing) photo.update(dt);
  if (state.screen !== 'title') {
    minimap.update(dt);
    hud.update(dt);
  }
  if (playing) shots.update(dt);

  // Hidden packages: collect within 2 m.
  if (playing) {
    const pp = state.inCar && state.car ? state.car.pos : player.pos;
    for (const [id, mesh] of [...packageMeshes]) {
      mesh.rotation.y += dt * 2;
      mesh.position.y = 1.2 + Math.sin(simT * 2 + id) * 0.2;
      if (Math.hypot(pp.x - mesh.position.x, pp.z - mesh.position.z) < 2) {
        scene.remove(mesh);
        packageMeshes.delete(id);
        state.packages.push(id);
        state.cash += PACKAGE_VALUE;
        emit('package', { id });
        saveGame();
      }
    }
  }

  // Camera: photo mode wins, then the shot staging, then the usual cameras.
  if (state.screen === 'title') {
    const a = simT * 0.05;
    camera.position.set(Math.cos(a) * 220, 130, Math.sin(a) * 220 + 60);
    camera.lookAt(0, 10, 0);
  } else if (state.screen === 'play') {
    if (photo.active) photo.updateCamera(camera);
    else if (shots.cameraFn) shots.cameraFn(camera, dt);
    else if (state.inCar) vehicles.updateCamera(camera);
    else player.updateCamera(camera, dt);
  }
  // Ocean scroll.
  oceanTex.offset.x += dt * 0.004;
  oceanTex.offset.y += dt * 0.002;
}

// ---- Frame -------------------------------------------------------------------------
let lastT = performance.now();
let acc = 0;
let fpsEMA = 60;
let paintedFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(MAX_FRAME, (now - lastT) / 1000);
  lastT = now;
  if (rawDt > 0) fpsEMA += (1 / rawDt - fpsEMA) * 0.05;
  G.fpsAvg = fpsEMA;

  handleKeys();
  if (state.screen !== 'pause') {
    acc += rawDt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0; // drop the remainder, don't spiral
  }
  input.endFrame();
  renderer.render(scene, camera);

  // Shot mode: signal readiness after 2 painted frames past staging.
  if (SHOT_MODE && shots.ready) {
    paintedFrames++;
    if (paintedFrames >= 2 && !window.__shotReady) window.__shotReady = true;
  }
}

// Auto-pause when the tab hides (never in shot mode).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'play' && !SHOT_MODE) pauseGame();
});

// ---- URL flags (manual photo sessions only — shot stages set their own) ----
function applyUrlFlags() {
  const timeParam = params.get('time');
  if (timeParam) {
    const [hh, mm] = timeParam.split(':').map(Number);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      state.timeMin = (hh % 24) * 60 + (mm % 60);
      weather.setTimeOfDay(hh + mm / 60);
    }
  }
  const weatherParam = params.get('weather');
  if (weatherParam === 'night') weather.setTimeOfDay(22);
  else if (weatherParam === 'golden-hour') weather.setTimeOfDay(19.33);
  else if (weatherParam === 'rain') weather.setMode('rain');
  else if (weatherParam === 'morning') weather.setTimeOfDay(10);
  const wantedParam = params.get('wanted');
  if (wantedParam !== null) {
    const w = Number(wantedParam);
    if (Number.isFinite(w)) police.setWanted(Math.max(0, Math.min(5, Math.round(w))));
  }
}

// ---- Boot ----------------------------------------------------------------------------
window.__game = G;
if (SHOT_MODE) {
  hud.setSuppressBigBanner(true);
  hud.hideHelp();
  hud.hideTitle();
  state.screen = 'play';
  audio.init();
  shots.stage(SHOT, params);
} else {
  const saveText = savedGame
    ? `Continue — $${savedGame.cash} · ${savedGame.missionsDone.length}/11 missions`
    : '';
  hud.showTitle(!!savedGame, saveText);
  applyUrlFlags();
}
requestAnimationFrame(frame);
