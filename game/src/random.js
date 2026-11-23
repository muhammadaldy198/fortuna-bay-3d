// Seeded random numbers for Fortuna Bay: one mulberry32 stream per world, so
// the same seed always builds the same city, the same traffic and the same
// pedestrians. Nothing in the simulation uses Math.random or Date — every
// draw comes from the world's rng, which is what makes the dossier
// deterministic across runs.

/** A mulberry32 generator: small, fast, and good enough for a game world. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded random source. `seed` is any integer; the same seed gives
 * the same sequence. Methods:
 * - next() — a float in [0, 1)
 * - range(a, b) — a float in [a, b)
 * - int(a, b) — an integer in [a, b]
 * - pick(list) — one element of the list
 * - chance(p) — true with probability p
 * - fork(salt) — a fresh stream derived from this one (for subsystems that
 *   need their own sequence without disturbing the parent's).
 */
export function createRandom(seed) {
  const draw = mulberry32(seed);
  const source = {
    seed: seed >>> 0,
    next() {
      return draw();
    },
    range(a, b) {
      return a + draw() * (b - a);
    },
    int(a, b) {
      return a + Math.floor(draw() * (b - a + 1));
    },
    pick(list) {
      return list[Math.floor(draw() * list.length)];
    },
    chance(p) {
      return draw() < p;
    },
    fork(salt) {
      let mixed = (seed >>> 0) ^ Math.imul(salt | 0, 0x9e3779b1);
      mixed ^= mixed >>> 16;
      return createRandom(mixed >>> 0);
    },
  };
  return source;
}

/** Clamp a number into [low, high]. */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Linear interpolation between a and b at t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
