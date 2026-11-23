// Every tuning number in one place. Fortuna Bay is a fixed-size island city:
// a grid of blocks split by roads, a beach along the south edge, a harbour
// to the east. Nothing here depends on the screen size or the frame rate —
// the simulation steps at a fixed 60 Hz whatever the display does.

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The city: a square of CITY.size metres, roads every CITY.block metres. */
export const CITY = {
  size: 640,
  block: 80,
  roadWidth: 14,
  sidewalk: 4,
  islandLimit: 300,
  beachZ: 268,
  waterLevel: -0.6,
  districts: ['Downtown', 'Old Port', 'Marina', 'North Hills', 'The Strip', 'Harbor East'],
};

/** The player's on-foot tuning. */
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 11,
  jumpSpeed: 8,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
  enterCarRange: 4.5,
  punchDamage: 12,
  punchRange: 2.4,
  pistolDamage: 34,
  pistolRange: 90,
};

/** Car handling: one table, every car model picks a row. */
export const CARS = {
  sedan: { accel: 14, brake: 30, maxSpeed: 34, turn: 1.9, grip: 8.5, mass: 1.0, color: 0x3a6ea5 },
  coupe: { accel: 18, brake: 34, maxSpeed: 42, turn: 2.2, grip: 9.5, mass: 0.9, color: 0xc0392b },
  suv: { accel: 12, brake: 26, maxSpeed: 30, turn: 1.6, grip: 7.5, mass: 1.3, color: 0x2e4053 },
  taxi: { accel: 13, brake: 28, maxSpeed: 32, turn: 1.8, grip: 8.0, mass: 1.0, color: 0xf1c40f },
  cruiser: { accel: 20, brake: 38, maxSpeed: 46, turn: 2.4, grip: 10.5, mass: 1.1, color: 0x1a1a2e },
  truck: { accel: 9, brake: 22, maxSpeed: 24, turn: 1.3, grip: 6.5, mass: 1.8, color: 0x7f8c8d },
};

/** Traffic and pedestrian population. */
export const POPULATION = {
  trafficCars: 26,
  pedestrians: 42,
  trafficSpeed: 11,
  pedSpeed: 1.6,
  despawnRange: 220,
  spawnRange: 190,
};

/** The wanted system: stars 0–5, cops scale with heat. */
export const WANTED = {
  max: 5,
  decaySeconds: 45,
  copsPerStar: [0, 2, 4, 6, 8, 10],
  heliAtStar: 3,
  roadblockAtStar: 3,
  copSpawnMin: 60,
  copSpawnMax: 130,
};

/** The FALCON-1 helicopter: six behaviours, one state machine. */
export const HELI = {
  patrolAlt: 55,
  trackAlt: 26,
  orbitRadius: 42,
  climbRate: 9,
  descendRate: 12,
  cruiseSpeed: 26,
  trackSpeed: 18,
  flybyMinSeconds: 18,
  spotlightRange: 70,
};

/** Missions: three story jobs plus side work. */
export const MISSIONS = [
  { id: 'getaway', name: 'Getaway Driver', reward: 500, brief: 'Lose a 3-star wanted level and reach the Marina garage.' },
  { id: 'bigscore', name: 'The Big Score', reward: 1200, brief: 'Survive the harbour ambush and escape with the crew.' },
  { id: 'harborrun', name: 'Harbor Run', reward: 900, brief: 'Deliver the package to Harbor East before the timer runs out.' },
];

/** Day length in sim seconds, and the weather cycle. */
export const WEATHER = {
  dayLength: 480,
  rainChance: 0.25,
  rainGrip: 0.7,
  fogClear: 420,
  fogRain: 160,
};

/** Camera tuning. */
export const CAMERA = {
  fov: 70,
  chaseDistance: 9.5,
  chaseHeight: 3.4,
  lookHeight: 1.6,
  near: 0.1,
  far: 900,
};

/** The sun-soaked palette: warm sand, teal sea, neon nights. */
export const PALETTE = {
  skyDay: 0x87ceeb,
  skyNight: 0x0b1026,
  sunDay: 0xfff2cc,
  sunNight: 0x8fa3ff,
  sand: 0xe8d8a8,
  sea: 0x1e90a8,
  asphalt: 0x2b2f36,
  sidewalk: 0x9aa0a8,
  buildingGlass: 0x7fb2d9,
  neonPink: 0xff2e88,
  neonCyan: 0x22d3ee,
  heliBody: 0x1a1a2e,
  heliStripe: 0xffd23f,
};

/** Local storage keys for saves. */
export const SAVE_KEY = 'fortuna-bay.save.v1';
export const BEST_KEY = 'fortuna-bay.best.v1';

/** The default world seed (the ?seed= query overrides it). */
export const DEFAULT_SEED = 20261124;
