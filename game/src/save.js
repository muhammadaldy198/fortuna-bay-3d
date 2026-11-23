// Save / load for Fortuna Bay. One localStorage slot, one schema version.
// Every access is guarded: in a sandboxed or private context localStorage
// can throw, and the game must still boot and play without a save.
import { SAVE_KEY, START_CASH } from './config.js';

const SAVE_VERSION = 1;

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
  };
}

// Read the save, or null when there is none / it is unreadable / wrong version.
// Each field is validated and falls back to its default, so a save written
// by an older build (or hand-edited) can never crash the game.
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    const fresh = defaultSave();
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      version: SAVE_VERSION,
      cash: num(data.cash, fresh.cash),
      respect: num(data.respect, 0),
      missionsDone: arr(data.missionsDone),
      missionIndex: num(data.missionIndex, 0),
      garage: arr(data.garage),
      pos: data.pos && typeof data.pos.x === 'number' && typeof data.pos.z === 'number' ? data.pos : null,
      weapon: typeof data.weapon === 'string' ? data.weapon : fresh.weapon,
      radio: num(data.radio, 0),
      bestRace: typeof data.bestRace === 'number' ? data.bestRace : null,
      packages: arr(data.packages),
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
