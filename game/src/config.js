// Fortuna Bay — shared constants and world geometry.
// Everything here is data: no Three.js, no DOM, no side effects. All systems
// import from this file so the city layout, the driving model and the economy
// stay consistent in one place. Units: metres, seconds, degrees as radians.

export const STEP = 1 / 60;
export const SAVE_KEY = 'fortuna-bay-save-v1';

// ---- City grid -------------------------------------------------------------
// The city is a 14x14 grid of blocks. Each block is 36 m wide with a 12 m road
// between blocks and a 3 m sidewalk on each side of the road, so one pitch is
// 54 m and the built-up city spans 756 m. The island (sand + sea) is wider.
export const BLOCK = 36;
export const ROAD = 12;
export const WALK = 3;
export const PITCH = BLOCK + ROAD + WALK * 2; // 54
export const GRID = 14;
export const CITY = GRID * PITCH; // 756
export const HALF = CITY / 2; // 378
export const ISLAND = 1120; // ground plane side (sand ring around the city)
export const SEA = 4200; // ocean plane side
export const LANE = 3; // right-hand lane offset from a road centreline

// Centre of block (i, j) in world coordinates (i, j in 0..GRID-1).
export function blockCenter(i, j) {
  return [(i - (GRID - 1) / 2) * PITCH, (j - (GRID - 1) / 2) * PITCH];
}

// World coordinate of road line k (k in 0..GRID; roads sit between blocks).
export function roadLine(k) {
  return (k - GRID / 2) * PITCH;
}

// Snap a coordinate to the nearest road centreline.
export function nearestRoad(v) {
  return Math.round(v / PITCH + GRID / 2) * PITCH - HALF;
}

// ---- Districts -------------------------------------------------------------
export const DISTRICTS = [
  { name: 'Vista Hills', i0: 0, i1: 13, j0: 0, j1: 2, style: 'villa', maxFloors: 3, color: 0xd8cdb8 },
  { name: 'Downtown', i0: 5, i1: 8, j0: 4, j1: 7, style: 'glass', maxFloors: 22, color: 0x8fa8c8 },
  { name: 'Old Town', i0: 0, i1: 4, j0: 4, j1: 8, style: 'terra', maxFloors: 5, color: 0xc89778 },
  { name: 'Marina', i0: 0, i1: 3, j0: 9, j1: 13, style: 'pastel', maxFloors: 8, color: 0xa8c8b8 },
  { name: 'Beachfront', i0: 4, i1: 10, j0: 11, j1: 13, style: 'pastel', maxFloors: 10, color: 0xf0d8a8 },
  { name: 'Portside', i0: 11, i1: 13, j0: 3, j1: 9, style: 'ware', maxFloors: 4, color: 0x98a8a8 },
  { name: 'Midtown', i0: 0, i1: 13, j0: 0, j1: 13, style: 'mid', maxFloors: 9, color: 0xb8a898 },
];

export function districtAt(i, j) {
  for (const d of DISTRICTS) {
    if (i >= d.i0 && i <= d.i1 && j >= d.j0 && j <= d.j1) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

export function districtAtPos(x, z) {
  const i = Math.floor(x / PITCH + GRID / 2);
  const j = Math.floor(z / PITCH + GRID / 2);
  if (i < 0 || i >= GRID || j < 0 || j >= GRID) return null;
  return districtAt(i, j);
}

// ---- Golden hour -----------------------------------------------------------
export const SKY_TOP = 0x2e4a7a;
export const SKY_HORIZON = 0xffb36b;
export const FOG_COLOR = 0xf2a56b;
export const FOG_NEAR = 180;
export const FOG_FAR = 900;
export const SUN_COLOR = 0xffd9a0;
export const SUN_POS = [-260, 150, 120];
export const AMBIENT = 0x8a7a9a;
export const WINDOW_LIT = 0xffc46b;

// ---- Clock -----------------------------------------------------------------
// The game starts at 17:30 and one in-game minute passes every 1.5 real seconds.
export const TIME_START = 17 * 60 + 30; // 1050
export const MINUTES_PER_SECOND = 2 / 3;

// ---- Player on foot --------------------------------------------------------
export const WALK_SPEED = 6;
export const SPRINT_SPEED = 9.5;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_HEIGHT = 1.8;

// ---- Driving ---------------------------------------------------------------
export const CAR_ACCEL = 16;
export const CAR_BRAKE = 28;
export const CAR_MAX_SPEED = 38;
export const CAR_MAX_REVERSE = 12;
export const CAR_STEER = 1.9;
export const CAR_GRIP = 6.5;
export const CAR_DRIFT_GRIP = 2.2;
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.9;

// ---- Weather ---------------------------------------------------------------
// Weather cycles between clear golden hour and a short rain shower. Rain cuts
// grip (the Low Tide City lesson: weather must change how the game feels),
// pulls the fog in, and shows a rain streak layer.
export const WEATHER_CLEAR_MIN = 150; // seconds of clear sky, minimum
export const WEATHER_CLEAR_MAX = 300;
export const WEATHER_RAIN_MIN = 45; // seconds of rain, minimum
export const WEATHER_RAIN_MAX = 90;
export const RAIN_GRIP_FACTOR = 0.62; // grip multiplier while it rains
export const RAIN_FOG_NEAR = 90;
export const RAIN_FOG_FAR = 480;

// ---- Ambient life ----------------------------------------------------------
export const TRAFFIC_COUNT = 26;
export const TRAFFIC_SPEED = 11;
export const PED_COUNT = 42;
export const PED_SPEED = 1.6;
export const PED_FLEE_SPEED = 5.5;

// ---- Police ----------------------------------------------------------------
export const WANTED_MAX = 5;
export const COPS_PER_STAR = [0, 2, 3, 4, 5, 6];
export const ROADBLOCK_STAR = 4;
export const HELI_STAR = 5;
export const EVADE_SECONDS = 14;
export const COP_SPEED = 40;
export const SIREN_RANGE = 90;

// ---- Combat ----------------------------------------------------------------
export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 2.2, range: 2.6, spread: 0, auto: false, melee: true },
  pistol: { name: 'Pistol', damage: 22, rate: 3.0, range: 60, spread: 0.02, auto: false },
  smg: { name: 'SMG', damage: 12, rate: 9.0, range: 55, spread: 0.05, auto: true },
  shotgun: { name: 'Shotgun', damage: 11, rate: 1.1, range: 26, spread: 0.09, auto: false, pellets: 6 },
  rifle: { name: 'Rifle', damage: 34, rate: 4.5, range: 90, spread: 0.012, auto: true },
};
export const PLAYER_HEALTH = 100;
export const ENEMY_HEALTH = 60;

// ---- Crew ------------------------------------------------------------------
export const CREW = {
  rico: { name: 'Rico', role: 'Mechanic', key: 'KeyZ', cooldown: 45, desc: 'Repairs your car to full' },
  vex: { name: 'Vex', role: 'Hacker', key: 'KeyX', cooldown: 90, desc: 'Drops one wanted star' },
  lola: { name: 'Lola', role: 'Decoy', key: 'KeyC', cooldown: 60, desc: 'Sends cops chasing a ghost' },
};

// ---- Economy & progression -------------------------------------------------
export const START_CASH = 250;
export const RESPAWN_FEE = 150;
export const BUSTED_FINE = 100;
export const PACKAGE_VALUE = 100;
export const RANKS = [
  'Nobody', 'Hustler', 'Wheelman', 'Fixer', 'Enforcer',
  'Lieutenant', 'Captain', 'Kingpin', 'Legend', 'Boss of Fortuna',
];
export const RANK_RESPECT = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

// ---- Radio -----------------------------------------------------------------
export const RADIO_STATIONS = [
  { name: 'SOL 88.5', desc: 'Latin gold', bpm: 96, root: 220 },
  { name: 'TIDE FM', desc: 'Synthwave', bpm: 112, root: 196 },
  { name: 'NEON 101', desc: 'Night drive', bpm: 128, root: 174.61 },
];

export const MISSION_COUNT = 10;
