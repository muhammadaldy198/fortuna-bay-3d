// Pedestrians for Fortuna Bay — walkers on the sidewalks who flee gunfire
// and chases, call the police when they witness a crime, and go down when a
// car hits them. Rendered as four InstancedMeshes (torso, head, two legs)
// so 40+ peds cost four draw calls.
import * as THREE from 'three';
import { PED_COUNT, PED_FLEE_SPEED, PED_SPEED } from './config.js';

const SHIRT_COLORS = [0xc84444, 0x4488c8, 0x44a868, 0xd8a83c, 0x8855aa, 0xe8e8e8, 0xe88a4a, 0x4ad0d0];
const SKIN_COLORS = [0xc89878, 0x8a5a3a, 0xe8b898, 0x6a4030];

export function createPeds(G) {
  const { scene, city, rng, state, emit, on } = G;
  const peds = [];

  for (let i = 0; i < PED_COUNT; i++) {
    const [x, z] = city.randomSidewalkPoint(rng);
    const [wx, wz] = city.randomSidewalkPoint(rng);
    peds.push({
      x, z,
      dir: rng.next() * Math.PI * 2,
      wx, wz, // current waypoint
      speed: PED_SPEED * rng.range(0.8, 1.25),
      state: 'walk',
      stateT: 0,
      phase: rng.next() * Math.PI * 2,
      shirt: SHIRT_COLORS[i % SHIRT_COLORS.length],
      skin: SKIN_COLORS[i % SKIN_COLORS.length],
      called: false, // has this ped already called the police?
      callT: 0,
      fleeX: 0, fleeZ: 0,
    });
  }

  // Four instanced body parts.
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
  const torsoMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const torsos = new THREE.InstancedMesh(torsoGeo, torsoMat, PED_COUNT);
  const headGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const heads = new THREE.InstancedMesh(headGeo, headMat, PED_COUNT);
  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const legL = new THREE.InstancedMesh(legGeo, legMat, PED_COUNT);
  const legR = new THREE.InstancedMesh(legGeo, legMat, PED_COUNT);
  for (const m of [torsos, heads, legL, legR]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
  }
  peds.forEach((p, i) => {
    torsos.setColorAt(i, color.setHex(p.shirt));
    heads.setColorAt(i, color.setHex(p.skin));
  });
  if (torsos.instanceColor) torsos.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  function scare(x, z, radius, kind) {
    for (const p of peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > radius) continue;
      // Flee directly away from the scare.
      const away = Math.atan2(p.x - x, p.z - z);
      p.dir = away;
      p.fleeX = p.x + Math.sin(away) * 30;
      p.fleeZ = p.z + Math.cos(away) * 30;
      p.state = 'flee';
      p.stateT = 4 + rng.next() * 2;
      // A witness who sees a crime calls the FBPD (once per ped).
      if ((kind === 'gunshot' || kind === 'carjack') && !p.called && d < 26) {
        p.called = true;
        p.callT = 2;
      }
    }
  }

  on('gunshot', (e) => scare(e.x, e.z, 34, 'gunshot'));
  on('explosion', (e) => scare(e.x, e.z, 60, 'explosion'));
  on('crash', (e) => { if (e.strength > 8) scare(e.x, e.z, 26, 'crash'); });
  on('carjack', (e) => scare(e.x, e.z, 26, 'carjack'));
  // A shot ped goes down (and the shooter earns police attention).
  on('pedShot', (e) => {
    const p = e.ped;
    if (!p || p.state === 'down') return;
    p.state = 'down';
    p.stateT = 12;
    emit('pedHit', { x: p.x, z: p.z });
  });

  function respawnNearPlayer(p) {
    const pp = playerPos();
    for (let tries = 0; tries < 10; tries++) {
      const [x, z] = city.randomSidewalkPoint(rng);
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d > 40 && d < 220) {
        p.x = x;
        p.z = z;
        const [wx, wz] = city.randomSidewalkPoint(rng);
        p.wx = wx;
        p.wz = wz;
        p.state = 'walk';
        p.stateT = 0;
        return;
      }
    }
    // Fallback: anywhere on a sidewalk.
    const [x, z] = city.randomSidewalkPoint(rng);
    p.x = x;
    p.z = z;
    p.state = 'walk';
  }

  function update(dt) {
    const pp = playerPos();
    for (const p of peds) {
      // A witness finishing the call reports the crime.
      if (p.callT > 0) {
        p.callT -= dt;
        if (p.callT <= 0) emit('witness', { x: p.x, z: p.z });
      }
      if (p.state === 'down') {
        p.stateT -= dt;
        if (p.stateT <= 0) respawnNearPlayer(p);
        continue;
      }
      // Cars knock peds down.
      if (G.vehicles) {
        for (const car of G.vehicles.cars) {
          if (car.wrecked || car.speed < 4) continue;
          const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
          if (d < 1.9) {
            p.state = 'down';
            p.stateT = 12;
            if (car.driver === 'player') emit('pedHit', { x: p.x, z: p.z });
            break;
          }
        }
        if (p.state === 'down') continue;
      }
      let targetSpeed = p.speed;
      let tx = p.wx;
      let tz = p.wz;
      if (p.state === 'flee') {
        targetSpeed = PED_FLEE_SPEED;
        tx = p.fleeX;
        tz = p.fleeZ;
        p.stateT -= dt;
        if (p.stateT <= 0) {
          p.state = 'walk';
          const [wx, wz] = city.randomSidewalkPoint(rng);
          p.wx = wx;
          p.wz = wz;
        }
      }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) {
        if (p.state === 'walk') {
          const [wx, wz] = city.randomSidewalkPoint(rng);
          p.wx = wx;
          p.wz = wz;
        } else {
          p.fleeX = p.x + Math.sin(p.dir) * 30;
          p.fleeZ = p.z + Math.cos(p.dir) * 30;
        }
      } else {
        const wantDir = Math.atan2(dx / d, dz / d);
        let diff = wantDir - p.dir;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.dir += diff * Math.min(1, dt * 6);
        p.x += Math.sin(p.dir) * targetSpeed * dt;
        p.z += Math.cos(p.dir) * targetSpeed * dt;
        [p.x, p.z] = city.collideCircle(p.x, p.z, 0.4);
        p.phase += dt * targetSpeed * 2.4;
      }
      // Far from the player: recycle near the action.
      if (Math.hypot(p.x - pp.x, p.z - pp.z) > 320) respawnNearPlayer(p);
    }

    // Write the four instanced meshes.
    peds.forEach((p, i) => {
      const down = p.state === 'down';
      const swing = down ? 0 : Math.sin(p.phase) * 0.5;
      const bob = down ? 0 : Math.abs(Math.sin(p.phase)) * 0.05;
      // Torso.
      dummy.position.set(p.x, down ? 0.35 : 1.05 + bob, p.z);
      dummy.rotation.set(down ? Math.PI / 2 : 0, p.dir, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      torsos.setMatrixAt(i, dummy.matrix);
      // Head.
      dummy.position.set(p.x + (down ? Math.sin(p.dir) * 0.5 : 0), down ? 0.3 : 1.62 + bob, p.z + (down ? Math.cos(p.dir) * 0.5 : 0));
      dummy.rotation.set(down ? Math.PI / 2 : 0, p.dir, 0);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      // Legs swing against each other.
      for (const [mesh, side, phase] of [[legL, -0.14, swing], [legR, 0.14, -swing]]) {
        dummy.position.set(
          p.x + Math.cos(p.dir) * side,
          down ? 0.25 : 0.45 + bob,
          p.z - Math.sin(p.dir) * side,
        );
        dummy.rotation.set(down ? Math.PI / 2 : phase, p.dir, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    });
    torsos.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    legL.instanceMatrix.needsUpdate = true;
    legR.instanceMatrix.needsUpdate = true;
  }

  return { peds, update };
}
