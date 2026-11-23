// The law: a five-star wanted level, pursuit cruisers, roadblocks, and the
// FALCON-1 police helicopter — a six-behaviour state machine (patrol, track,
// spotlight, orbit, climb, return) with a searchlight cone and a light pool
// on the ground. Cops spawn on the roads around the player (an angle plus a
// distance, snapped to the nearest centreline, so the squad always forms);
// the siren is read from G.audio at run time, never captured at creation.

import * as THREE from 'three';
import { WANTED, HELI } from './config.js';

const HELI_MODES = ['patrol', 'track', 'spotlight', 'orbit', 'climb', 'return'];
const BASE = { x: 0, z: -280 };

/**
 * Create the police for world G. Returns:
 * - cops — the pursuit cruisers (cars; their .pos IS the car position)
 * - heli — the helicopter object, or null when none is up
 * - wanted — mirrored from G.wanted
 * - setWanted(n) / addWanted(n)
 * - update(dt)
 */
export function createPolice(G) {
  const cops = [];
  let heli = null;
  let roadblock = [];
  let captureTimer = 0;
  let quietTimer = 0;

  function setWanted(n) {
    G.wanted = Math.max(0, Math.min(WANTED.max, Math.floor(n)));
    quietTimer = 0;
  }

  function addWanted(n) {
    setWanted(G.wanted + n);
  }

  /** Spawn one cruiser on a road 60–130 m from the player. */
  function spawnCop() {
    const rng = G.rng;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(WANTED.copSpawnMin, WANTED.copSpawnMax);
    const raw = { x: G.player.pos.x + Math.sin(angle) * dist, z: G.player.pos.z + Math.cos(angle) * dist };
    const snapped = G.city.nearestRoad(raw.x, raw.z);
    const heading = Math.atan2(G.player.pos.x - snapped.x, G.player.pos.z - snapped.z);
    const car = G.vehicles.createCar('cruiser', snapped.x, snapped.z, heading);
    car.isCop = true;
    car.stuck = 0;
    cops.push(car);
    return car;
  }

  /** Two cruisers parked across the road ahead of the player. */
  function placeRoadblock() {
    for (const car of roadblock) {
      G.vehicles.removeCar(car);
      const idx = cops.indexOf(car);
      if (idx !== -1) cops.splice(idx, 1);
    }
    roadblock = [];
    const ahead = G.city.nearestRoad(
      G.player.pos.x + Math.sin(G.player.heading) * 45,
      G.player.pos.z + Math.cos(G.player.heading) * 45,
    );
    for (let i = 0; i < 2; i += 1) {
      const car = G.vehicles.createCar('cruiser', ahead.x + (i === 0 ? -3 : 3), ahead.z, G.player.heading + Math.PI / 2);
      car.isCop = true;
      car.roadblock = true;
      car.speed = 0;
      cops.push(car);
      roadblock.push(car);
    }
  }

  function buildHeli() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 3.4), bodyMat);
    body.position.y = 0;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.4, 3.0),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    stripe.position.y = 0.2;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.2), bodyMat);
    tail.position.set(0, 0.3, -3.6);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.8), bodyMat);
    fin.position.set(0, 0.8, -5.4);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.08, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    rotor.position.y = 1.1;
    const tailRotor = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.6, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    tailRotor.position.set(0.3, 0.8, -5.4);
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.0), skidMat);
    skidL.position.set(-0.9, -1.0, 0);
    const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.0), skidMat);
    skidR.position.set(0.9, -1.0, 0);
    group.add(body, stripe, tail, fin, rotor, tailRotor, skidL, skidR);
    // Searchlight cone (additive, see-through) and its ground pool.
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 16, 1, true), coneMat);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.15;
    G.scene.add(group);
    G.scene.add(cone);
    G.scene.add(pool);
    return {
      group,
      rotor,
      tailRotor,
      cone,
      pool,
      pos: group.position,
      alt: HELI.patrolAlt,
      mode: 'climb',
      modeTime: 0,
      angle: 0,
    };
  }

  function removeHeli() {
    if (!heli) return;
    G.scene.remove(heli.group);
    G.scene.remove(heli.cone);
    G.scene.remove(heli.pool);
    heli = null;
  }

  const DOWN = new THREE.Vector3(0, -1, 0);
  const tmpDir = new THREE.Vector3();
  const tmpMid = new THREE.Vector3();

  function updateHeli(dt) {
    if (!heli) return;
    heli.modeTime += dt;
    heli.rotor.rotation.y += dt * 22;
    heli.tailRotor.rotation.x += dt * 30;
    const target = G.player.pos;
    const dx = target.x - heli.pos.x;
    const dz = target.z - heli.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = heli.mode === 'track' ? HELI.trackSpeed : HELI.cruiseSpeed;

    if (heli.mode === 'climb') {
      heli.pos.y += HELI.climbRate * dt;
      if (heli.pos.y >= HELI.patrolAlt) {
        heli.pos.y = HELI.patrolAlt;
        heli.mode = 'patrol';
        heli.modeTime = 0;
      }
    } else if (heli.mode === 'patrol') {
      heli.angle += dt * 0.12;
      heli.pos.x = target.x + Math.sin(heli.angle) * 70;
      heli.pos.z = target.z + Math.cos(heli.angle) * 70;
      heli.pos.y += (HELI.patrolAlt - heli.pos.y) * dt;
      if (heli.modeTime > 3) {
        heli.mode = 'track';
        heli.modeTime = 0;
      }
    } else if (heli.mode === 'track') {
      const step = Math.min(dist, speed * dt);
      if (dist > 1) {
        heli.pos.x += (dx / dist) * step;
        heli.pos.z += (dz / dist) * step;
      }
      heli.pos.y += (HELI.trackAlt - heli.pos.y) * Math.min(1, dt * 0.8);
      if (dist < 40 && heli.modeTime > 2) {
        heli.mode = 'spotlight';
        heli.modeTime = 0;
      }
    } else if (heli.mode === 'spotlight') {
      heli.pos.x += (target.x - heli.pos.x) * Math.min(1, dt * 0.5);
      heli.pos.z += (target.z - heli.pos.z) * Math.min(1, dt * 0.5);
      heli.pos.y += (HELI.trackAlt - heli.pos.y) * Math.min(1, dt * 0.5);
      if (heli.modeTime > 8) {
        heli.mode = 'orbit';
        heli.modeTime = 0;
        heli.angle = Math.atan2(heli.pos.x - target.x, heli.pos.z - target.z);
      }
    } else if (heli.mode === 'orbit') {
      heli.angle += dt * 0.35;
      heli.pos.x = target.x + Math.sin(heli.angle) * HELI.orbitRadius;
      heli.pos.z = target.z + Math.cos(heli.angle) * HELI.orbitRadius;
      heli.pos.y += (HELI.trackAlt + 8 - heli.pos.y) * Math.min(1, dt * 0.5);
      if (heli.modeTime > 10) {
        heli.mode = 'track';
        heli.modeTime = 0;
      }
    } else if (heli.mode === 'return') {
      const bx = BASE.x - heli.pos.x;
      const bz = BASE.z - heli.pos.z;
      const bd = Math.hypot(bx, bz);
      const step = Math.min(bd, speed * dt);
      if (bd > 1) {
        heli.pos.x += (bx / bd) * step;
        heli.pos.z += (bz / bd) * step;
      }
      heli.pos.y += (8 - heli.pos.y) * Math.min(1, dt * 0.4);
      if (bd < 5 && heli.pos.y < 12) removeHeli();
    }
    if (!heli) return;
    // Face the direction of travel (or the player when hovering).
    const faceX = heli.mode === 'spotlight' || heli.mode === 'orbit' ? target.x - heli.pos.x : dx;
    const faceZ = heli.mode === 'spotlight' || heli.mode === 'orbit' ? target.z - heli.pos.z : dz;
    if (Math.hypot(faceX, faceZ) > 0.5) heli.group.rotation.y = Math.atan2(faceX, faceZ);
    heli.alt = heli.pos.y;
    // Searchlight: cone from the heli to the player, pool on the ground.
    const lit = heli.mode === 'track' || heli.mode === 'spotlight' || heli.mode === 'orbit';
    heli.cone.visible = lit;
    heli.pool.visible = lit;
    if (lit) {
      tmpDir.set(target.x - heli.pos.x, 0 - heli.pos.y, target.z - heli.pos.z).normalize();
      tmpMid.set(
        (heli.pos.x + target.x) / 2,
        heli.pos.y / 2,
        (heli.pos.z + target.z) / 2,
      );
      heli.cone.position.copy(tmpMid);
      heli.cone.quaternion.setFromUnitVectors(DOWN, tmpDir);
      const len = Math.hypot(target.x - heli.pos.x, heli.pos.y, target.z - heli.pos.z);
      heli.cone.scale.set(1, Math.max(0.4, len / 34), 1);
      heli.pool.position.set(target.x, 0.15, target.z);
    }
  }

  function update(dt) {
    // Wanted decay: stay quiet and out of sight, and the heat cools.
    if (G.wanted > 0) {
      quietTimer += dt;
      if (quietTimer > WANTED.decaySeconds) {
        setWanted(G.wanted - 1);
        quietTimer = 0;
      }
    }
    // Keep the squad at strength.
    const wantedCount = WANTED.copsPerStar[G.wanted] || 0;
    const patrolling = cops.filter((c) => !c.roadblock).length;
    if (patrolling < wantedCount) spawnCop();
    else if (patrolling > wantedCount && cops.length > 0) {
      const extra = cops.find((c) => !c.roadblock);
      if (extra) {
        G.vehicles.removeCar(extra);
        cops.splice(cops.indexOf(extra), 1);
      }
    }
    // Roadblocks at 3+ stars, refreshed when the player moves on.
    if (G.wanted >= WANTED.roadblockAtStar) {
      if (roadblock.length === 0) placeRoadblock();
      else {
        const dx = roadblock[0].pos.x - G.player.pos.x;
        const dz = roadblock[0].pos.z - G.player.pos.z;
        if (Math.hypot(dx, dz) > 160) placeRoadblock();
      }
    } else if (roadblock.length > 0) {
      for (const car of roadblock) {
        G.vehicles.removeCar(car);
        const idx = cops.indexOf(car);
        if (idx !== -1) cops.splice(idx, 1);
      }
      roadblock = [];
    }
    // Heli up at 3+ stars, home when the heat drops.
    if (G.wanted >= WANTED.heliAtStar && !heli) {
      heli = buildHeli();
      heli.pos.set(G.player.pos.x + 60, 8, G.player.pos.z - 60);
      heli.mode = 'climb';
      heli.modeTime = 0;
    } else if (G.wanted < WANTED.heliAtStar && heli && heli.mode !== 'return') {
      heli.mode = 'return';
      heli.modeTime = 0;
    }
    updateHeli(dt);
    // Pursuit: steer at the player, full throttle; roadblock cars sit still.
    let nearest = Infinity;
    for (const cop of cops) {
      if (cop.roadblock) continue;
      const dx = G.player.pos.x - cop.pos.x;
      const dz = G.player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearest) nearest = dist;
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      G.vehicles.drive(cop, 1, steer, dt);
      // Stuck against a wall? Back up and turn away.
      if (Math.abs(cop.speed) < 0.5) cop.stuck += dt;
      else cop.stuck = 0;
      if (cop.stuck > 2) {
        G.vehicles.drive(cop, -1, 1, dt);
        cop.stuck = 0;
      }
      // Despawn far cops; a fresh one spawns near the player instead.
      if (dist > 260) {
        G.vehicles.removeCar(cop);
        cops.splice(cops.indexOf(cop), 1);
      }
    }
    // Busted: a cop beside the player on foot for 3 seconds — never in shot
    // mode, where the scene must stay staged.
    if (!G.shotMode && G.wanted > 0 && !G.player.car && nearest < 6) {
      captureTimer += dt;
      if (captureTimer > 3) {
        captureTimer = 0;
        setWanted(0);
        G.money = Math.max(0, G.money - 100);
        if (G.hud) G.hud.banner('BUSTED — $100 fine');
      }
    } else {
      captureTimer = 0;
    }
    // Siren while any cop is out (audio read at run time, every frame).
    if (G.audio) G.audio.siren(cops.length > 0);
  }

  return {
    cops,
    get heli() {
      return heli;
    },
    modes: HELI_MODES,
    setWanted,
    addWanted,
    update,
  };
}
