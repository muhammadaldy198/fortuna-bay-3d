// Cars: arcade physics plus one shared instanced renderer for the whole
// fleet. Every car — the player's, traffic, police — is a plain data object
// (model, position, heading, speed, health); a single set of InstancedMeshes
// (bodies, cabins, wheels, headlights, light bars) draws all of them in a
// handful of draw calls, which is what keeps the frame rate alive on a
// software renderer.

import * as THREE from 'three';
import { CARS } from './config.js';

const MAX_CARS = 64;
const MAX_CRUISERS = 12;

/**
 * Create the vehicle fleet for world G. Returns:
 * - cars — every live car
 * - createCar(model, x, z, heading) — spawn a car of a CARS model
 * - drive(car, throttle, steer, dt) — arcade drive physics (throttle/steer in [-1, 1])
 * - removeCar(car) — take a car out of the fleet
 * - nearestCar(x, z, range) — the closest car to a point
 * - update(dt) — sync the instanced meshes to the cars
 *
 * A car is { model, spec, pos: Vector3, heading, speed, health, collide,
 * isCruiser, bodyColor }. Cops ARE cars (their .pos is the car position).
 */
export function createVehicles(G) {
  const cars = [];
  const dummy = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const offset = new THREE.Matrix4();
  const color = new THREE.Color();

  const bodyGeo = new THREE.BoxGeometry(2.0, 0.75, 4.4);
  bodyGeo.translate(0, 0.65, 0);
  const cabinGeo = new THREE.BoxGeometry(1.8, 0.7, 2.2);
  cabinGeo.translate(0, 1.35, -0.2);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const lightGeo = new THREE.BoxGeometry(0.4, 0.25, 0.15);
  const barGeo = new THREE.BoxGeometry(0.8, 0.22, 0.5);

  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_CARS);
  const cabins = new THREE.InstancedMesh(cabinGeo, new THREE.MeshLambertMaterial({ color: 0x1a2530 }), MAX_CARS);
  const wheels = new THREE.InstancedMesh(wheelGeo, new THREE.MeshLambertMaterial({ color: 0x141414 }), MAX_CARS * 4);
  const headlights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), MAX_CARS * 2);
  const lightbars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_CRUISERS * 2);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cabins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  headlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lightbars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(bodies);
  G.scene.add(cabins);
  G.scene.add(wheels);
  G.scene.add(headlights);
  G.scene.add(lightbars);

  const WHEEL_SPOTS = [
    [-0.9, 0.36, 1.45],
    [0.9, 0.36, 1.45],
    [-0.9, 0.36, -1.45],
    [0.9, 0.36, -1.45],
  ];
  const LIGHT_SPOTS = [
    [-0.65, 0.75, 2.21],
    [0.65, 0.75, 2.21],
  ];

  function createCar(model, x, z, heading) {
    const spec = CARS[model] || CARS.sedan;
    const car = {
      model,
      spec,
      pos: new THREE.Vector3(x, 0, z),
      heading: heading || 0,
      speed: 0,
      health: 100,
      collide: true,
      isCruiser: model === 'cruiser',
      bodyColor: spec.color,
      sirenPhase: 0,
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
  }

  function nearestCar(x, z, range) {
    let best = null;
    let bestDist = range;
    for (const car of cars) {
      const dx = car.pos.x - x;
      const dz = car.pos.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    }
    return best;
  }

  /** Push a circle out of nearby building boxes (cheap broad-phase first). */
  function collideBuildings(pos, radius) {
    const list = G.buildings.list;
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (Math.abs(pos.x - b.x) > b.w / 2 + radius + 2) continue;
      if (Math.abs(pos.z - b.z) > b.d / 2 + radius + 2) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const px = b.w / 2 + radius - Math.abs(dx);
      const pz = b.d / 2 + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) pos.x = b.x + (dx > 0 ? 1 : -1) * (b.w / 2 + radius);
        else pos.z = b.z + (dz > 0 ? 1 : -1) * (b.d / 2 + radius);
      }
    }
  }

  function drive(car, throttle, steer, dt) {
    const spec = car.spec;
    const grip = G.weather ? G.weather.grip : 1;
    car.speed += throttle * spec.accel * grip * dt;
    car.speed -= car.speed * 0.35 * dt;
    if (throttle < 0 && car.speed > 0.5) car.speed -= spec.brake * dt;
    const maxForward = spec.maxSpeed * grip;
    if (car.speed > maxForward) car.speed = maxForward;
    if (car.speed < -maxForward * 0.4) car.speed = -maxForward * 0.4;
    const speedFactor = Math.max(-1, Math.min(1, car.speed / spec.maxSpeed));
    car.heading += steer * spec.turn * speedFactor * dt * (car.speed < 0 ? -1 : 1);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    const bound = G.city.bounds - 6;
    car.pos.x = Math.max(-bound, Math.min(bound, car.pos.x));
    car.pos.z = Math.max(-bound, Math.min(bound, car.pos.z));
    if (car.collide) collideBuildings(car.pos, 2.2);
  }

  function update(dt) {
    const n = Math.min(cars.length, MAX_CARS);
    bodies.count = n;
    cabins.count = n;
    wheels.count = n * 4;
    headlights.count = n * 2;
    let bars = 0;
    for (let i = 0; i < n; i += 1) {
      const car = cars[i];
      dummy.position.copy(car.pos);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      bodies.setMatrixAt(i, matrix);
      cabins.setMatrixAt(i, matrix);
      color.setHex(car.bodyColor);
      bodies.setColorAt(i, color);
      for (let w = 0; w < 4; w += 1) {
        offset.makeTranslation(WHEEL_SPOTS[w][0], WHEEL_SPOTS[w][1], WHEEL_SPOTS[w][2]);
        offset.premultiply(matrix);
        wheels.setMatrixAt(i * 4 + w, offset);
      }
      for (let l = 0; l < 2; l += 1) {
        offset.makeTranslation(LIGHT_SPOTS[l][0], LIGHT_SPOTS[l][1], LIGHT_SPOTS[l][2]);
        offset.premultiply(matrix);
        headlights.setMatrixAt(i * 2 + l, offset);
      }
      if (car.isCruiser && bars < MAX_CRUISERS * 2) {
        car.sirenPhase += dt * 10;
        const on = Math.sin(car.sirenPhase) > 0;
        for (let s = 0; s < 2; s += 1) {
          offset.makeTranslation(s === 0 ? -0.45 : 0.45, 1.78, -0.2);
          offset.premultiply(matrix);
          lightbars.setMatrixAt(bars, offset);
          color.setHex(s === 0 ? (on ? 0xff2222 : 0x550000) : (on ? 0x000055 : 0x2244ff));
          lightbars.setColorAt(bars, color);
          bars += 1;
        }
      }
      if (car.health < 40 && G.effects) G.effects.smoke(car.pos.x, car.pos.y + 1, car.pos.z);
    }
    lightbars.count = bars;
    bodies.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
    headlights.instanceMatrix.needsUpdate = true;
    lightbars.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (lightbars.instanceColor) lightbars.instanceColor.needsUpdate = true;
  }

  return { cars, createCar, removeCar, nearestCar, drive, collideBuildings, update };
}
