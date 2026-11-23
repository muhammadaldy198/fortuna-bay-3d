// The story: three jobs that take the player across Fortuna Bay, plus the
// marker beacons that show where to go. Each mission has a brief, a live
// objective line for the HUD, a gold beacon in the world and on the minimap,
// and a payout. Finishing all three is the game's arc; side jobs (taxi fares,
// street races) pay smaller money between them.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

const GARAGE_SPOT = { x: 0, z: 232 };
const HARBOUR_SPOT = { x: 268, z: -40 };
const DELIVERY_SPOT = { x: 280, z: 120 };

/**
 * Create the mission system for world G. Returns:
 * - index — the current mission (0-based)
 * - done — ids of finished missions
 * - current — the active mission object, or null
 * - marker — { x, z } of the current objective, or null
 * - start() — begin the current mission
 * - update(dt)
 */
export function createMissions(G) {
  let index = 0;
  const done = [];
  let current = null;
  let marker = null;
  let beacon = null;
  let timer = 0;
  let surviveLeft = 0;

  function makeBeacon(x, z) {
    removeBeacon();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 60, 12, 1, true), mat);
    beacon.position.set(x, 30, z);
    G.scene.add(beacon);
    marker = { x, z };
  }

  function removeBeacon() {
    if (beacon) {
      G.scene.remove(beacon);
      beacon = null;
    }
    marker = null;
  }

  function start() {
    if (index >= MISSIONS.length) {
      if (G.hud) G.hud.banner('ALL JOBS DONE — Fortuna Bay is yours');
      return false;
    }
    const def = MISSIONS[index];
    current = { ...def, state: 'active', objective: def.brief };
    if (def.id === 'getaway') {
      makeBeacon(GARAGE_SPOT.x, GARAGE_SPOT.z);
      G.police.setWanted(3);
      current.objective = 'Lose the cops, then reach the Marina garage.';
    } else if (def.id === 'bigscore') {
      makeBeacon(HARBOUR_SPOT.x, HARBOUR_SPOT.z);
      surviveLeft = 60;
      for (let i = 0; i < 5; i += 1) {
        G.combat.spawnEnemy(HARBOUR_SPOT.x + G.rng.range(-25, 25), HARBOUR_SPOT.z + G.rng.range(-25, 25));
      }
      current.objective = 'Survive the harbour ambush — 60 seconds.';
    } else if (def.id === 'harborrun') {
      makeBeacon(DELIVERY_SPOT.x, DELIVERY_SPOT.z);
      timer = 120;
      current.objective = 'Deliver the package to Harbor East — 2:00.';
    }
    if (G.hud) {
      G.hud.banner(def.name);
      G.hud.setObjective(current.objective);
    }
    return true;
  }

  function complete() {
    if (!current) return;
    G.money += current.reward;
    done.push(current.id);
    if (G.audio) G.audio.coin();
    if (G.hud) {
      G.hud.banner(`${current.name} — DONE (+$${current.reward})`);
      G.hud.setObjective(index + 1 < MISSIONS.length ? 'Next job ready — press Enter at the marker.' : 'All jobs done.');
    }
    removeBeacon();
    current = null;
    index += 1;
  }

  function fail(reason) {
    if (!current) return;
    if (G.hud) G.hud.banner(`FAILED — ${reason}`);
    removeBeacon();
    current = null;
  }

  function update(dt) {
    if (beacon) beacon.rotation.y += dt * 0.8;
    if (!current) return;
    const px = G.player.pos.x;
    const pz = G.player.pos.z;
    if (current.id === 'getaway') {
      const dx = px - GARAGE_SPOT.x;
      const dz = pz - GARAGE_SPOT.z;
      if (Math.hypot(dx, dz) < 18 && G.wanted === 0) complete();
      else if (Math.hypot(dx, dz) < 18) current.objective = 'Lose the cops first — then come back.';
    } else if (current.id === 'bigscore') {
      surviveLeft -= dt;
      current.objective = `Survive the harbour ambush — ${Math.max(0, Math.ceil(surviveLeft))}s.`;
      if (G.combat.enemies.length === 0 && surviveLeft < 45) complete();
      else if (surviveLeft <= 0) complete();
    } else if (current.id === 'harborrun') {
      timer -= dt;
      const mins = Math.max(0, Math.floor(timer / 60));
      const secs = Math.max(0, Math.floor(timer % 60));
      current.objective = `Deliver the package — ${mins}:${String(secs).padStart(2, '0')}.`;
      const dx = px - DELIVERY_SPOT.x;
      const dz = pz - DELIVERY_SPOT.z;
      if (Math.hypot(dx, dz) < 16) complete();
      else if (timer <= 0) fail('Out of time');
    }
    if (G.hud && current) G.hud.setObjective(current.objective);
  }

  return {
    get index() {
      return index;
    },
    set index(value) {
      index = value;
    },
    done,
    get current() {
      return current;
    },
    get marker() {
      return marker;
    },
    start,
    update,
  };
}
