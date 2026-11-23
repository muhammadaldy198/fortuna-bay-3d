// Police for Fortuna Bay v2 — the FBPD wanted system. Stars rise on crimes
// (carjack, hitting peds, shooting, killing cops), cops chase with ramming
// pursuit, roadblocks at 4 stars, helicopter FALCON-1 with a searchlight
// at 3 stars. Break line of sight and the heat decays.
// v2: the heli is a first-class system, not a dot overhead — it patrols high,
// drops to a low TRACK offset AHEAD of the player (inside the chase camera's
// view), crosses the frame in periodic FLYBYs, and HOVERs in front of the
// player sweeping its spotlight. The spotlight is a threat: 5 s continuous
// in the pool and the player is BUSTED. The heli can be shot down.
import * as THREE from 'three';
import {
  COPS_PER_STAR, COP_SPEED, EVADE_SECONDS, HELI, HELI_STAR, ROADBLOCK_STAR,
  WANTED_MAX, nearestRoad,
} from './config.js';
import { makeDiscTexture } from './textures.js';

const COP_RESPAWN_DELAY = 8; // seconds before a wrecked cop is replaced
const HELI_DOWN_DELAY = 30; // seconds before a shot-down heli is replaced
const HELI_HP = 100;

export function createPolice(G) {
  const { scene, city, vehicles, rng, state, emit, on } = G;
  const cops = [];
  let heli = null;
  let roadblock = null;
  let clock = 0;
  let evadeT = 0;
  let bustT = 0;
  let lastGunshotHeat = -10;
  let heliDownT = 0;
  const pendingSpawns = []; // timestamps at which a wrecked cop is replaced

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  function playerHeading() {
    if (state.inCar && state.car) return state.car.yaw;
    return G.player.yaw;
  }

  // Where the cops think the player is (the decoy ghost, while it lasts).
  function chaseTarget() {
    if (state.decoy && performance.now() / 1000 < state.decoy.until) {
      return { x: state.decoy.x, z: state.decoy.z };
    }
    const pp = playerPos();
    return { x: pp.x, z: pp.z };
  }

  function addWanted(n) {
    if (state.wanted >= WANTED_MAX) return;
    state.wanted = Math.min(WANTED_MAX, state.wanted + n);
    evadeT = 0;
    emit('wanted', { wanted: state.wanted });
    if (G.audio) G.audio.wantedUp();
    syncForce(true);
  }

  function setWanted(n) {
    state.wanted = Math.max(0, Math.min(WANTED_MAX, n));
    evadeT = 0;
    emit('wanted', { wanted: state.wanted });
    syncForce(true);
  }

  // Crimes. Gunshot heat is throttled: at most one star per 3 seconds, so a
  // firefight climbs the stars instead of maxing them in one burst.
  on('carjack', () => addWanted(1));
  on('pedHit', () => addWanted(1));
  on('witness', () => addWanted(1));
  on('copDown', () => addWanted(2));
  on('gunshot', (e) => {
    if (clock - lastGunshotHeat < 3) return;
    const copNear = cops.some((c) => Math.hypot(c.pos.x - e.x, c.pos.z - e.z) < 40);
    if (state.wanted > 0 || copNear) {
      lastGunshotHeat = clock;
      addWanted(1);
    }
  });

  function spawnCop() {
    // Pick a point 60–130 m from the player, then snap the closer axis to a
    // road centreline so the cruiser starts on asphalt. The old version drew
    // uniform random road points and kept only the ones landing in a 45–150 m
    // annulus (~11% hit rate, 10 tries) — each spawn failed ~31% of the time,
    // so a 5-star force of 6 cops almost never formed, and the systems test
    // was a coin flip. This version always succeeds.
    const pp = playerPos();
    const a = rng.next() * Math.PI * 2;
    const d = 60 + rng.next() * 70;
    let x = pp.x + Math.sin(a) * d;
    let z = pp.z + Math.cos(a) * d;
    const dx = Math.abs(nearestRoad(x) - x);
    const dz = Math.abs(nearestRoad(z) - z);
    if (dx <= dz) x = nearestRoad(x);
    else z = nearestRoad(z);
    const car = vehicles.spawnCar('police', x, z, Math.atan2(pp.x - x, pp.z - z), { driver: 'police' });
    car._stuckT = 0;
    car._reverseT = 0;
    car._shootT = 1 + rng.next() * 2;
    cops.push(car);
    return car;
  }

  function buildRoadblock() {
    if (roadblock) return;
    const pp = playerPos();
    const heading = playerHeading();
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const bx = pp.x + fx * 55;
    const bz = pp.z + fz * 55;
    const cars = [];
    // Two cruisers parked across the road, nose to nose.
    for (const side of [-1, 1]) {
      const car = vehicles.spawnCar('police',
        bx - fz * side * 2.4, bz + fx * side * 2.4,
        heading + Math.PI / 2, { driver: 'police' });
      cars.push(car);
    }
    // A spike strip on the road between them.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.15, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    strip.position.set(bx, 0.1, bz);
    strip.rotation.y = heading + Math.PI / 2;
    scene.add(strip);
    roadblock = { cars, strip, x: bx, z: bz, triggered: false };
    emit('roadblock', { x: bx, z: bz });
  }

  function clearRoadblock() {
    if (!roadblock) return;
    for (const car of roadblock.cars) vehicles.removeCar(car);
    scene.remove(roadblock.strip);
    roadblock = null;
  }

  function buildHeli() {
    if (heli || heliDownT > 0) return;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a44 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5), bodyMat);
    group.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x2a4a6a }));
    nose.position.set(0, 0.1, 2.8);
    group.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), bodyMat);
    tail.position.set(0, 0.2, -4);
    group.add(tail);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.9), bodyMat);
    tailFin.position.set(0, 0.9, -5.6);
    group.add(tailFin);
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (const sx of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 4.2), skidMat);
      skid.position.set(sx, -1.0, 0);
      group.add(skid);
    }
    // Main rotor: two crossed blades + a translucent blur disc.
    const rotorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const rotor = new THREE.Group();
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.4), rotorMat);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 11), rotorMat);
    rotor.add(blade1);
    rotor.add(blade2);
    rotor.position.y = 1.1;
    group.add(rotor);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 24),
      new THREE.MeshBasicMaterial({
        map: makeDiscTexture(THREE),
        color: 0xbbbbbb, transparent: true, opacity: 0.35,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 1.15;
    group.add(disc);
    // Tail rotor.
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.3), rotorMat);
    tailRotor.position.set(0.4, 0.4, -5.6);
    group.add(tailRotor);
    // Nav lights: red left, green right, white strobe on the tail.
    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    navL.position.set(-1.15, 0, 0.5);
    group.add(navL);
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x22ff44 }));
    navR.position.set(1.15, 0, 0.5);
    group.add(navR);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strobe.position.set(0, 1.0, -5.6);
    group.add(strobe);
    // Searchlight cone: a unit cone inside an aiming group. The group sits
    // at the midpoint between heli and pool and lookAts the pool; the cone
    // child is rotated so its apex is at the heli and its base at the pool.
    // Its Y scale is the heli-to-pool distance, its XZ scale the pool radius.
    const coneGroup = new THREE.Group();
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: HELI.CONE_OPACITY,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16, 1, true), coneMat);
    cone.rotation.x = -Math.PI / 2;
    coneGroup.add(cone);
    scene.add(coneGroup);
    // Ground pool: a bright disc where the beam lands. The soft radial
    // texture gives it a feathered edge instead of a hard circle.
    const poolMat = new THREE.MeshBasicMaterial({
      map: makeDiscTexture(THREE),
      color: 0xfff2b0, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(HELI.SPOT_RADIUS, 24), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.1;
    scene.add(pool);
    // Blob shadow: a soft dark disc under the heli on the ground. Its
    // radius is HELI.SHADOW_SIZE (diameter) / 2, and it fades as the heli
    // climbs — a high heli casts a faint, wide shadow.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(HELI.SHADOW_SIZE / 2, 20),
      new THREE.MeshBasicMaterial({
        map: makeDiscTexture(THREE),
        color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    scene.add(shadow);
    const pp = playerPos();
    group.position.set(pp.x + 40, HELI.PATROL_ALT, pp.z - 40);
    scene.add(group);
    heli = {
      group, rotor, tailRotor, disc, strobe, coneGroup, cone, coneMat,
      pool, poolMat, shadow,
      mode: 'patrol', modeT: 0, orbitA: Math.atan2(-40, 40),
      flybyT: HELI.FLYBY_MIN + rng.next() * (HELI.FLYBY_MAX - HELI.FLYBY_MIN),
      flyFrom: null, flyTo: null, flyDur: 1,
      hoverT: 0, sweepA: 0,
      poolX: pp.x, poolZ: pp.z,
      // A fresh heli starts with a clean capture timer: the player is never
      // busted by the previous heli's half-filled beam.
      captureT: 0, hp: HELI_HP,
      velX: 0, velZ: 0, prevX: pp.x + 40, prevZ: pp.z - 40,
    };
    emit('heli', {});
  }

  function clearHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    scene.remove(heli.coneGroup);
    scene.remove(heli.pool);
    scene.remove(heli.shadow);
    heli = null;
    if (G.audio) {
      G.audio.setRotor(false);
      G.audio.setCaptureAlarm(false);
    }
  }

  // Shooting the heli: it goes down in flames, the heat jumps 2 stars, and
  // the FBPD needs 30 s to send a replacement.
  function damageHeli(amount) {
    if (!heli) return;
    heli.hp -= amount;
    if (heli.hp <= 0) {
      const hp = heli.group.position;
      if (G.effects) G.effects.explosion({ x: hp.x, y: hp.y, z: hp.z });
      if (G.audio) G.audio.explosion();
      clearHeli();
      heliDownT = HELI_DOWN_DELAY;
      emit('heliDown', { x: hp.x, z: hp.z });
      addWanted(2);
    }
  }

  // Bring the force in line with the wanted level. `immediate` fills a
  // deficit at once (new stars); otherwise only expired respawn timers fill.
  function syncForce(immediate) {
    const wanted = state.wanted;
    const desired = COPS_PER_STAR[wanted] || 0;
    // Remove surplus cops (farthest first) when the heat drops.
    while (cops.length > desired) {
      const pp = playerPos();
      let far = 0;
      let farD = -1;
      cops.forEach((c, i) => {
        const d = Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z);
        if (d > farD) { farD = d; far = i; }
      });
      vehicles.removeCar(cops[far]);
      cops.splice(far, 1);
    }
    if (immediate) {
      while (cops.length < desired) {
        if (!spawnCop()) break;
      }
    }
    if (wanted >= ROADBLOCK_STAR) buildRoadblock();
    else clearRoadblock();
    if (wanted >= HELI_STAR) buildHeli();
    else clearHeli();
    // The siren on/off + volume is driven every frame from update(), where
    // the nearest cop's distance is known.
  }

  // Readable wanted state for the HUD: what the FBPD is doing right now.
  function wantedState() {
    if (state.wanted === 0) return null;
    if (evadeT > 0.5) return 'SEARCHING';
    const pp = playerPos();
    const copNear = cops.some((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 40);
    if (copNear) return 'ACTIVE';
    return 'ESCAPING';
  }

  // Heli position for peds (cower), the player camera (shake) and the HUD.
  function heliPos() {
    if (!heli) return null;
    const p = heli.group.position;
    return { x: p.x, z: p.z, alt: p.y, mode: heli.mode };
  }

  // Searchlight pool on the ground, for peds and the minimap.
  function spotPool() {
    if (!heli) return null;
    return { x: heli.poolX, z: heli.poolZ, r: HELI.SPOT_RADIUS };
  }

  // Steer the heli toward (tx, tz, alt) at up to HELI.SPEED, banking into
  // the turn. Returns the distance left to the target.
  function steerHeli(tx, tz, alt, dt) {
    const hp = heli.group.position;
    const dx = tx - hp.x;
    const dz = tz - hp.z;
    const dist = Math.hypot(dx, dz);
    const speed = Math.min(HELI.SPEED, 6 + dist * 0.5);
    if (dist > 0.5) {
      hp.x += (dx / dist) * speed * dt;
      hp.z += (dz / dist) * speed * dt;
    }
    hp.y += (alt - hp.y) * Math.min(1, dt * 1.2);
    // Yaw toward the velocity, bank into the turn.
    const vx = (hp.x - heli.prevX) / Math.max(dt, 0.001);
    const vz = (hp.z - heli.prevZ) / Math.max(dt, 0.001);
    const v = Math.hypot(vx, vz);
    if (v > 1) {
      const wantYaw = Math.atan2(vx, vz);
      let diff = wantYaw - heli.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      heli.group.rotation.y += diff * Math.min(1, dt * 2);
      heli.group.rotation.z = Math.max(-0.3, Math.min(0.3, -diff * 0.6));
      heli.group.rotation.x = Math.max(-0.15, Math.min(0.15, v * 0.004));
    }
    heli.prevX = hp.x;
    heli.prevZ = hp.z;
    return dist;
  }

  function updateHeli(dt) {
    if (!heli) return;
    const pp = playerPos();
    // The heli chases the decoy ghost while Lola's decoy lasts — the pool
    // follows the ghost, so the real player can slip out of the light.
    const tp = chaseTarget();
    const heading = playerHeading();
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = -fz; // right vector of the player's heading
    const rz = fx;
    heli.modeT += dt;
    heli.flybyT -= dt;

    if (heli.mode === 'patrol') {
      // High orbit around the target while the heli gets into position.
      heli.orbitA += (HELI.SPEED / HELI.ORBIT_RADIUS) * dt;
      const tx = tp.x + Math.sin(heli.orbitA) * HELI.ORBIT_RADIUS;
      const tz = tp.z + Math.cos(heli.orbitA) * HELI.ORBIT_RADIUS;
      steerHeli(tx, tz, HELI.PATROL_ALT, dt);
      if (heli.modeT > 3) {
        heli.mode = 'track';
        heli.modeT = 0;
      }
    } else if (heli.mode === 'track') {
      // Low, AHEAD of the target — inside the chase camera's view.
      const tx = tp.x + fx * HELI.TRACK_AHEAD + rx * HELI.TRACK_SIDE;
      const tz = tp.z + fz * HELI.TRACK_AHEAD + rz * HELI.TRACK_SIDE;
      steerHeli(tx, tz, HELI.TRACK_ALT, dt);
      if (heli.flybyT <= 0) {
        // Flyby: cross in front of the camera, left to right.
        const leadX = tp.x + fx * HELI.FLYBY_LEAD;
        const leadZ = tp.z + fz * HELI.FLYBY_LEAD;
        heli.flyFrom = { x: leadX - rx * 50, z: leadZ - rz * 50 };
        heli.flyTo = { x: leadX + rx * 50, z: leadZ + rz * 50 };
        heli.flyDur = 100 / HELI.SPEED;
        heli.mode = 'flyby';
        heli.modeT = 0;
      }
    } else if (heli.mode === 'flyby') {
      const t = Math.min(1, heli.modeT / heli.flyDur);
      const tx = heli.flyFrom.x + (heli.flyTo.x - heli.flyFrom.x) * t;
      const tz = heli.flyFrom.z + (heli.flyTo.z - heli.flyFrom.z) * t;
      steerHeli(tx, tz, HELI.FLYBY_ALT, dt);
      if (t >= 1) {
        heli.mode = 'hover';
        heli.modeT = 0;
        heli.hoverT = HELI.HOVER_MIN + rng.next() * (HELI.HOVER_MAX - HELI.HOVER_MIN);
        heli.sweepA = rng.next() * Math.PI * 2;
      }
    } else if (heli.mode === 'hover') {
      // Hang in front of the target, sweeping the spotlight around them.
      const tx = tp.x + fx * HELI.HOVER_DIST;
      const tz = tp.z + fz * HELI.HOVER_DIST;
      steerHeli(tx, tz, HELI.TRACK_ALT, dt);
      heli.sweepA += dt * 0.9;
      if (heli.modeT > heli.hoverT) {
        heli.mode = 'track';
        heli.modeT = 0;
        heli.flybyT = HELI.FLYBY_MIN + rng.next() * (HELI.FLYBY_MAX - HELI.FLYBY_MIN);
      }
    }

    // Rotor + strobe. (The blur disc is radially symmetric, so spinning
    // it would be invisible — the rotor group carries the motion.)
    const rpm = (HELI.ROTOR_RPM * Math.PI * 2) / 60;
    heli.rotor.rotation.y += rpm * dt;
    heli.tailRotor.rotation.x += rpm * 2.4 * dt;
    // The strobe blinks on HELI.STROBE_INTERVAL (0.9 s): half the interval
    // on, half off — a slow double-flash reads as an aircraft, not a lamp.
    heli.strobe.visible = Math.floor(clock / HELI.STROBE_INTERVAL) % 2 === 0;

    // Spotlight pool: follows the target with lag; during a hover it sweeps
    // in a circle around them. The cone + pool never detach: the cone is
    // re-aimed at the pool every frame.
    const sweepR = heli.mode === 'hover' ? 9 : 0;
    const targetPoolX = tp.x + Math.sin(heli.sweepA) * sweepR;
    const targetPoolZ = tp.z + Math.cos(heli.sweepA) * sweepR;
    heli.poolX += (targetPoolX - heli.poolX) * Math.min(1, dt * 2.5);
    heli.poolZ += (targetPoolZ - heli.poolZ) * Math.min(1, dt * 2.5);
    heli.pool.position.x = heli.poolX;
    heli.pool.position.z = heli.poolZ;
    const hp = heli.group.position;
    const night = G.weather && G.weather.nightLevel !== undefined ? G.weather.nightLevel : 0;
    // The cone's base opacity is HELI.CONE_OPACITY from config; night makes
    // the beam read stronger against the dark (0.16 day → 0.24 night).
    heli.coneMat.opacity = HELI.CONE_OPACITY + night * 0.08;
    heli.poolMat.opacity = 0.22 + night * 0.16;
    const midX = (hp.x + heli.poolX) / 2;
    const midZ = (hp.z + heli.poolZ) / 2;
    const dist = Math.hypot(hp.x - heli.poolX, hp.y - 0.1, hp.z - heli.poolZ);
    heli.coneGroup.position.set(midX, hp.y / 2, midZ);
    heli.coneGroup.lookAt(heli.poolX, 0.1, heli.poolZ);
    heli.cone.scale.set(HELI.SPOT_RADIUS, dist, HELI.SPOT_RADIUS);
    // Blob shadow under the heli.
    heli.shadow.position.x = hp.x;
    heli.shadow.position.z = hp.z;
    heli.shadow.material.opacity = Math.max(0.12, 0.4 - hp.y * 0.004);

    // Rotor wash: dust + leaves blown outward while the heli is low.
    if (hp.y < 40 && G.effects) {
      const strength = 1 - Math.max(0, hp.y - 15) / 25;
      G.effects.wash(hp.x, hp.z, HELI.WASH_RADIUS, Math.max(0.2, strength));
    }
    // Rotor audio: louder when the heli is close to the player.
    if (G.audio) {
      const dHeli = Math.hypot(hp.x - pp.x, hp.z - pp.z);
      const level = Math.max(0.1, 1 - dHeli / 150);
      G.audio.setRotor(true, level);
    }

    // Capture timer: standing in the pool fills it; leaving drains it fast.
    // 5 s continuous in the light and the player is BUSTED. Disabled while
    // staging screenshots — the staged scenes hold the player in the light
    // on purpose, and a respawn mid-staging would ruin the shot.
    const dPool = Math.hypot(pp.x - heli.poolX, pp.z - heli.poolZ);
    if (dPool < HELI.SPOT_RADIUS) {
      heli.captureT += dt;
    } else {
      heli.captureT = Math.max(0, heli.captureT - dt * 3);
    }
    if (G.audio) G.audio.setCaptureAlarm(heli.captureT > 3);
    if (heli.captureT >= HELI.CAPTURE_SECONDS && !G.shotMode) {
      heli.captureT = 0;
      emit('busted', { by: 'spotlight' });
    }
  }

  function update(dt) {
    clock += dt;
    const pp = playerPos();
    const target = chaseTarget();
    if (heliDownT > 0) {
      heliDownT -= dt;
      if (heliDownT <= 0 && state.wanted >= HELI_STAR) buildHeli();
    }

    // Siren volume follows the nearest cop: loud up close, a whisper far away.
    // (G.audio at runtime — the destructured copy would be undefined, because
    // audio is created after police in main.js.)
    if (G.audio) {
      const nearest = cops.length
        ? Math.min(...cops.map((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z)))
        : Infinity;
      G.audio.setSiren(state.wanted > 0 && cops.length > 0, nearest === Infinity ? 0.15 : 1 - Math.min(0.85, nearest / 120));
    }

    // Wrecked cops are scheduled for replacement, not instantly respawned.
    for (let i = cops.length - 1; i >= 0; i--) {
      if (cops[i].wrecked) {
        vehicles.removeCar(cops[i]);
        cops.splice(i, 1);
        pendingSpawns.push(clock + COP_RESPAWN_DELAY);
      }
    }
    while (pendingSpawns.length > 0 && pendingSpawns[0] <= clock) {
      pendingSpawns.shift();
      if (state.wanted > 0 && cops.length < (COPS_PER_STAR[state.wanted] || 0)) spawnCop();
    }

    // Pursuit: lead the player, unstick by reversing, shoot on foot at 3+.
    const playerSpeed = state.inCar && state.car ? state.car.speed : G.player.speed;
    for (const cop of cops) {
      if (cop.wrecked) continue;
      const dx = target.x - cop.pos.x;
      const dz = target.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      // Lead the target: aim where it will be, not where it is.
      const lead = Math.min(1.2, dist / 60);
      const pvx = state.inCar && state.car ? state.car.vel.x : 0;
      const pvz = state.inCar && state.car ? state.car.vel.z : 0;
      const aimX = target.x + pvx * lead;
      const aimZ = target.z + pvz * lead;
      let throttle = 1;
      let steer = vehicles.steerToward(cop, aimX, aimZ);
      if (cop._reverseT > 0) {
        cop._reverseT -= dt;
        throttle = -1;
        steer = -steer;
      } else if (cop.speed < 1 && dist > 8) {
        cop._stuckT += dt;
        if (cop._stuckT > 2.5) {
          cop._stuckT = 0;
          cop._reverseT = 1;
        }
      } else {
        cop._stuckT = 0;
      }
      // Ease off when right on top of the player (ramming, not orbiting).
      if (dist < 6 && playerSpeed < 3) throttle = 0.3;
      cop.maxSpeed = COP_SPEED;
      vehicles.driveCar(cop, dt, throttle, steer, false);
      // Cops shoot at the player on foot (3+ stars, in range).
      if (!state.inCar && state.wanted >= 3 && dist < 26) {
        cop._shootT -= dt;
        if (cop._shootT <= 0) {
          cop._shootT = 2;
          emit('copShot', { from: { x: cop.pos.x, z: cop.pos.z } });
          if (G.effects) {
            G.effects.muzzle({ x: cop.pos.x, y: 1.4, z: cop.pos.z }, cop.yaw);
          }
        }
      }
    }

    // Roadblock spike strip: crossing it fast costs speed and health.
    if (roadblock && !roadblock.triggered && state.inCar && state.car) {
      const d = Math.hypot(state.car.pos.x - roadblock.x, state.car.pos.z - roadblock.z);
      if (d < 3 && state.car.speed > 5) {
        roadblock.triggered = true;
        state.car.vel.multiplyScalar(0.5);
        vehicles.damageCar(state.car, 10, 'spikes');
        if (G.audio) G.audio.crash(8);
      }
    }

    updateHeli(dt);

    // Busted: on foot, a cop close by, standing still. Disabled while
    // staging screenshots (the night shot stands still on purpose).
    if (!state.inCar && state.wanted > 0 && !G.shotMode) {
      const close = cops.some((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 4.5);
      if (close && G.player.speed < 1) {
        bustT += dt;
        if (bustT > 2.5) {
          bustT = 0;
          emit('busted', {});
        }
      } else {
        bustT = 0;
      }
    } else {
      bustT = 0;
    }

    // Evasion: unseen for EVADE_SECONDS, lose one star. The heli sees you
    // while it is overhead — outrun it (it tops out below a sport car).
    if (state.wanted > 0) {
      const copNear = cops.some((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 80);
      const heliSees = heli && Math.hypot(heli.group.position.x - pp.x, heli.group.position.z - pp.z) < 120;
      if (!copNear && !heliSees) {
        evadeT += dt;
        if (evadeT >= EVADE_SECONDS) {
          evadeT = 0;
          // Dropping from 3 stars to 2 escapes FALCON-1: it counts.
          if (state.wanted === 3 && heli) state.heliEscapes = (state.heliEscapes || 0) + 1;
          setWanted(state.wanted - 1);
        }
      } else {
        evadeT = 0;
      }
    }
  }

  return {
    cops,
    get heli() { return heli; },
    get roadblock() { return roadblock; },
    get captureT() { return heli ? heli.captureT : 0; },
    get captureMax() { return HELI.CAPTURE_SECONDS; },
    addWanted, setWanted, syncForce, update,
    damageHeli, wantedState, heliPos, spotPool,
  };
}
