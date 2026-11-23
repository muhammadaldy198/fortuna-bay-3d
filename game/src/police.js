// Police for Fortuna Bay — the FBPD wanted system. Stars rise on crimes
// (carjack, hitting peds, shooting, killing cops), cops chase with ramming
// pursuit, roadblocks at 4 stars, helicopter FALCON-1 with a searchlight
// at 5. Break line of sight and the heat decays.
import * as THREE from 'three';
import {
  COPS_PER_STAR, COP_SPEED, EVADE_SECONDS, HELI_STAR, ROADBLOCK_STAR,
  SIREN_RANGE, WANTED_MAX, nearestRoad,
} from './config.js';

const COP_RESPAWN_DELAY = 8; // seconds before a wrecked cop is replaced

export function createPolice(G) {
  const { scene, city, vehicles, rng, state, emit, on } = G;
  const cops = [];
  let heli = null;
  let roadblock = null;
  let clock = 0;
  let evadeT = 0;
  let bustT = 0;
  let lastGunshotHeat = -10;
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
    if (heli) return;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a44 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5), bodyMat);
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), bodyMat);
    tail.position.set(0, 0.2, -4);
    group.add(tail);
    const rotorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.4), rotorMat);
    rotor.position.y = 1.1;
    group.add(rotor);
    // Searchlight: a cone from the heli to the ground + a bright pool.
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 42, 12, 1, true), coneMat);
    cone.position.y = -21;
    cone.rotation.x = Math.PI;
    group.add(cone);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(7, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.1;
    scene.add(pool);
    const pp = playerPos();
    group.position.set(pp.x, 42, pp.z);
    scene.add(group);
    heli = { group, rotor, pool };
    emit('heli', {});
  }

  function clearHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    scene.remove(heli.pool);
    heli = null;
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

  function update(dt) {
    clock += dt;
    const pp = playerPos();
    const target = chaseTarget();

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

    // Helicopter: follows the player at 42 m, searchlight on the ground.
    if (heli) {
      const hp = heli.group.position;
      hp.x += (pp.x - hp.x) * Math.min(1, dt * 0.7);
      hp.z += (pp.z - hp.z) * Math.min(1, dt * 0.7);
      hp.y = 42;
      heli.rotor.rotation.y += dt * 30;
      heli.pool.position.x = pp.x;
      heli.pool.position.z = pp.z;
      // The cone leans from the heli toward the player.
      const dx = pp.x - hp.x;
      const dz = pp.z - hp.z;
      heli.group.rotation.x = Math.atan2(dz, 42) * 0.5;
      heli.group.rotation.z = -Math.atan2(dx, 42) * 0.5;
    }

    // Busted: on foot, a cop close by, standing still.
    if (!state.inCar && state.wanted > 0) {
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
          setWanted(state.wanted - 1);
        }
      } else {
        evadeT = 0;
      }
    }
  }

  return { cops, get heli() { return heli; }, get roadblock() { return roadblock; }, addWanted, setWanted, syncForce, update };
}
