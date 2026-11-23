// Save / load for Fortuna Bay v2. One localStorage slot, one schema version.
// Every access is guarded: in a sandboxed or private context localStorage
// can throw, and the game must still boot and play without a save.
// Schema v2 adds the photo-mode preference and the spotlight-escape counter.
import { SAVE_KEY, START_CASH } from './config.js';

const SAVE_VERSION = 2;

// The fresh-game save shape. All fields are plain JSON values.
export function defaultSave() {
  return {
    version: SAVE_VERSION,
    cash: START_CASH,
    respect: 0,
    missionsDone: [],
    missionIndex: 0,
    garage: [],
    pos: null, // { x, z, yaw } or null = default spawn
    weapon: 'pistol',
    radio: 0,
    bestRace: null, // best race time in seconds, or null
    packages: [], // ids of collected hidden packages
    photoGrid: false, // photo mode rule-of-thirds grid on/off
    heliEscapes: 0, // times the player escaped the FALCON-1 spotlight
  };
}

// Read the save, or null when there is none / it is unreadable / wrong version.
// Each field is validated and falls back to its default, so a save written
// by an older build (or hand-edited) can never crash the game. Array entries
// are type-checked too — a hand-edited save with a string where an id belongs
// is filtered out instead of breaking mission lookup later.
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    const fresh = defaultSave();
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const arr = (v) => (Array.isArray(v) ? v : []);
    const numArr = (v) => arr(v).filter((x) => typeof x === 'number' && Number.isFinite(x));
    const strArr = (v) => arr(v).filter((x) => typeof x === 'string');
    // Garage entries are OBJECTS { kind, color, upgrades } (see garage.js
    // storeCar) — filtering them as strings would silently drop every
    // stored car on load. Validate the shape instead.
    const garageArr = (v) => arr(v).filter((g) => g && typeof g === 'object'
      && typeof g.kind === 'string' && typeof g.color === 'number')
      .map((g) => ({ kind: g.kind, color: g.color, upgrades: num(g.upgrades, 0) }));
    return {
      version: SAVE_VERSION,
      cash: num(data.cash, fresh.cash),
      respect: num(data.respect, 0),
      missionsDone: numArr(data.missionsDone),
      missionIndex: Math.max(0, num(data.missionIndex, 0)),
      garage: garageArr(data.garage),
      pos: data.pos && typeof data.pos.x === 'number' && typeof data.pos.z === 'number'
        ? { x: data.pos.x, z: data.pos.z, yaw: typeof data.pos.yaw === 'number' ? data.pos.yaw : Math.PI }
        : null,
      weapon: typeof data.weapon === 'string' ? data.weapon : fresh.weapon,
      radio: num(data.radio, 0),
      bestRace: typeof data.bestRace === 'number' ? data.bestRace : null,
      packages: numArr(data.packages), // package ids are NUMBERS (city.js), not strings
      photoGrid: typeof data.photoGrid === 'boolean' ? data.photoGrid : false,
      heliEscapes: Math.max(0, num(data.heliEscapes, 0)),
    };
  } catch {
    return null;
  }
}

// Write the save. Returns true on success, false when storage is unavailable.
export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // No storage, nothing to clear.
  }
}
