// Saving: the player's progress (money, health, wanted level, mission,
// garage, position) lives in localStorage under SAVE_KEY, guarded so a
// browser with storage off simply plays without saving. Saves are plain
// JSON, versioned, and validated on load — a corrupt or foreign save is
// ignored, never trusted. Every field saveGame writes, applySave restores.

import { SAVE_KEY, BEST_KEY } from './config.js';

/** Read the raw save object, or null when there is none or it is invalid. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** Write the current progress of world G to storage. */
export function saveGame(G) {
  try {
    const data = {
      version: 1,
      money: G.money,
      health: G.player ? G.player.health : 100,
      wanted: G.wanted,
      missionIndex: G.mission ? G.mission.index : 0,
      missionsDone: G.mission ? G.mission.done : [],
      garage: G.garage ? G.garage.stored.map((c) => c.model) : [],
      position: G.player ? { x: G.player.pos.x, z: G.player.pos.z } : { x: 0, z: 0 },
      timeOfDay: G.timeOfDay,
      savedAt: G.frame,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Remove the save entirely. */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Apply a loaded save to world G (money, health, wanted, mission, garage, spot). */
export function applySave(G, data) {
  if (!data) return false;
  G.money = typeof data.money === 'number' ? data.money : G.money;
  if (G.player && typeof data.health === 'number') G.player.health = data.health;
  if (G.police && typeof data.wanted === 'number') G.police.setWanted(data.wanted);
  else if (typeof data.wanted === 'number') G.wanted = Math.max(0, Math.min(5, Math.floor(data.wanted)));
  if (G.mission && typeof data.missionIndex === 'number') G.mission.index = data.missionIndex;
  if (G.mission && Array.isArray(data.missionsDone)) G.mission.done = data.missionsDone;
  if (G.garage && Array.isArray(data.garage)) G.garage.restore(data.garage);
  if (G.player && data.position) {
    G.player.pos.x = data.position.x || 0;
    G.player.pos.z = data.position.z || 0;
  }
  if (typeof data.timeOfDay === 'number') G.timeOfDay = data.timeOfDay;
  return true;
}

/** The best (highest money ever banked) across visits. */
export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}
