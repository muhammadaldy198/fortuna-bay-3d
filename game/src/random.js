// Seeded randomness for Fortuna Bay. The whole city, the traffic palette and
// the mission staging are deterministic for a given seed, so a screenshot
// taken with ?seed=1 can be reproduced exactly. Two tools:
//  - mulberry32 / createRandom: a small stream you pull from in order.
//  - hash2: a position hash, stable no matter what order you ask in.

// mulberry32 — tiny, fast, good-enough PRNG. Returns a function that yields
// a float in [0, 1) on every call.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A convenience wrapper around one mulberry32 stream.
export function createRandom(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    // One element of arr, uniformly.
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // An independent stream derived from this one.
    fork() {
      return createRandom((next() * 0xffffffff) >>> 0);
    },
  };
}

// Deterministic 2D hash in [0, 1). The same (x, y, seed) always gives the same
// value, which is what the city generator uses for per-block and per-window
// decisions that must not depend on generation order.
export function hash2(x, y, seed = 1) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Hash a string to a uint32 seed, so ?seed=fortuna works as well as ?seed=1.
export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
