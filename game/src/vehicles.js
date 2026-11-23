// Vehicles for Fortuna Bay — boxy cars with arcade driving (velocity vector
// + grip + handbrake drift), carjacking, damage, police light bars.
// Traffic and police AI steer cars through driveCar(); the player drives the
// car flagged driver === 'player'.
// Sign conventions (keep them straight): forward = (sin yaw, cos yaw); a
// positive steer turns toward +X. The player passes -ax.x as steer, because
// on screen (chase cam) D must turn toward -X. steerToward returns -cross*2.4.
import * as THREE from 'three';
import {
  CAR_ACCEL, CAR_BRAKE, CAR_DRIFT_GRIP, CAR_GRIP, CAR_LENGTH, CAR_MAX_REVERSE,
  CAR_MAX_SPEED, CAR_STEER, CAR_WIDTH,
} from './config.js';

const CIVIL_COLORS = [0xc84444, 0x4488c8, 0xe8e8e8, 0x44a868, 0xd8a83c, 0x8855aa, 0x333333, 0xe88a4a];
const KIND_SPEED = { civil: 34, sport: 44, police: 40, taxi: 34 };

let nextId = 1;

export function createVehicles(G) {
  const { scene, city, input, state, emit } = G;
  const cars = [];
  let clock = 0;

  function forwardOf(car) {
    return { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
  }

  function buildMesh(kind, colorHex) {
    const mesh = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.85, CAR_LENGTH), bodyMat);
    body.position.y = 0.6;
    mesh.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH - 0.25, 0.65, CAR_LENGTH * 0.45), glassMat);
    cabin.position.set(0, 1.3, -0.3);
    mesh.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const wheels = [];
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      mesh.add(wheel);
      wheels.push(wheel);
    }
    // Headlights (warm) and taillights (red).
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const sx of [-0.6, 0.6]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), headMat);
      head.position.set(sx, 0.65, CAR_LENGTH / 2 + 0.01);
      mesh.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), tailMat);
      tail.position.set(sx, 0.65, -CAR_LENGTH / 2 - 0.01);
      mesh.add(tail);
    }
    let lightBar = null;
    if (kind === 'police') {
      lightBar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.3;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
      blue.position.x = 0.3;
      lightBar.add(red);
      lightBar.add(blue);
      lightBar.position.y = 1.75;
      mesh.add(lightBar);
      // Black-and-white doors: a white roof band.
      const band = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.3, 2.2), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
      band.position.y = 0.85;
      mesh.add(band);
    }
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe040 }));
      sign.position.y = 1.7;
      mesh.add(sign);
    }
    return { mesh, wheels, lightBar, bodyMat };
  }

  function spawnCar(kind, x, z, yaw, opts = {}) {
    const colorHex = opts.color !== undefined ? opts.color
      : kind === 'police' ? 0x1a2a44
      : kind === 'taxi' ? 0xf0c040
      : CIVIL_COLORS[Math.floor(Math.random() * CIVIL_COLORS.length)];
    const { mesh, wheels, lightBar, bodyMat } = buildMesh(kind, colorHex);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);
    const car = {
      id: nextId++,
      kind, mesh, wheels, lightBar, bodyMat, color: colorHex,
      pos: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      yaw, speed: 0, steer: 0,
      hp: 100, maxSpeed: (KIND_SPEED[kind] || 34) * (opts.speedMul || 1),
      driver: opts.driver || null, // 'player' | 'traffic' | 'police' | 'scripted' | null (parked)
      lightsOn: kind === 'police',
      wrecked: false, smokeT: 0, skidT: 0, lastHitBy: null,
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i !== -1) cars.splice(i, 1);
    scene.remove(car.mesh);
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  // Steer value in [-1, 1] that turns the car toward (tx, tz).
  function steerToward(car, tx, tz) {
    const f = forwardOf(car);
    const dx = tx - car.pos.x;
    const dz = tz - car.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const cross = f.x * (dz / len) - f.z * (dx / len);
    return Math.max(-1, Math.min(1, -cross * 2.4));
  }

  // One physics step for one car. throttle in [-1, 1], steer in [-1, 1].
  function driveCar(car, dt, throttle, steer, handbrake) {
    if (car.wrecked) {
      car.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
      car.pos.addScaledVector(car.vel, dt);
      car.speed = car.vel.length();
      syncMesh(car, dt);
      return;
    }
    const f = forwardOf(car);
    let fSpeed = car.vel.x * f.x + car.vel.z * f.z;
    // Longitudinal: accelerate / brake / reverse / drag.
    if (throttle > 0) {
      fSpeed += CAR_ACCEL * throttle * dt;
    } else if (throttle < 0) {
      if (fSpeed > 0.5) fSpeed -= CAR_BRAKE * dt;
      else fSpeed += CAR_ACCEL * throttle * dt * 0.7;
    } else {
      fSpeed -= fSpeed * 0.35 * dt;
    }
    fSpeed = Math.max(-CAR_MAX_REVERSE, Math.min(car.maxSpeed, fSpeed));
    // Steering: sharper at low speed, reversed when reversing.
    const steerAuthority = Math.min(1, Math.abs(fSpeed) / 8);
    car.yaw += steer * CAR_STEER * dt * steerAuthority * (fSpeed >= 0 ? 1 : -1);
    car.steer = steer;
    // Grip: kill lateral velocity (rain and the handbrake cut grip).
    const rainFactor = G.weather ? G.weather.gripFactor : 1;
    const grip = (handbrake ? CAR_DRIFT_GRIP : CAR_GRIP) * rainFactor;
    const f2 = forwardOf(car);
    const latX = car.vel.x - f2.x * (car.vel.x * f2.x + car.vel.z * f2.z);
    const latZ = car.vel.z - f2.z * (car.vel.x * f2.x + car.vel.z * f2.z);
    const decay = Math.exp(-grip * dt);
    car.vel.set(
      f2.x * fSpeed + latX * decay,
      0,
      f2.z * fSpeed + latZ * decay,
    );
    car.pos.addScaledVector(car.vel, dt);
    car.speed = car.vel.length();

    // Two-circle collision against the city (nose + tail).
    let crashed = false;
    let crashSpeed = 0;
    for (const off of [1.7, -1.7]) {
      const px = car.pos.x + f2.x * off;
      const pz = car.pos.z + f2.z * off;
      const [nx, nz] = city.collideCircle(px, pz, 0.95);
      if (nx !== px || nz !== pz) {
        car.pos.x += nx - px;
        car.pos.z += nz - pz;
        if (!crashed) {
          crashed = true;
          crashSpeed = car.speed;
        }
        car.vel.multiplyScalar(0.35);
        car.speed = car.vel.length();
      }
    }
    if (crashed && crashSpeed > 6) {
      damageCar(car, Math.round((crashSpeed - 6) * 1.2), 'wall');
      if (G.audio) G.audio.crash(crashSpeed);
      if (G.effects) G.effects.burst({ x: car.pos.x, y: 0.8, z: car.pos.z }, 0xffcc66, 6, 4);
      emit('crash', { x: car.pos.x, z: car.pos.z, strength: crashSpeed });
    }

    // Car-vs-car: soft circle push.
    for (const other of cars) {
      if (other === car || other.wrecked) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.001) {
        const push = (3.4 - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        car.pos.x += ux * push;
        car.pos.z += uz * push;
        if (other.driver !== null) {
          other.pos.x -= ux * push;
          other.pos.z -= uz * push;
        }
        const closing = (car.vel.x - other.vel.x) * ux + (car.vel.z - other.vel.z) * uz;
        if (closing > 5) {
          const dmg = Math.round((closing - 5) * 1.5);
          damageCar(car, dmg, other.driver === 'player' ? 'player' : 'traffic');
          damageCar(other, dmg, car.driver === 'player' ? 'player' : 'traffic');
          if (G.audio) G.audio.crash(closing);
          emit('crash', { x: car.pos.x, z: car.pos.z, strength: closing });
        }
        car.vel.multiplyScalar(0.7);
      }
    }

    // Skid marks while drifting, smoke while badly damaged.
    const lateral = Math.abs(latX * -f2.z + latZ * f2.x);
    if ((handbrake || lateral > 6) && car.speed > 10 && G.effects) {
      car.skidT -= dt;
      if (car.skidT <= 0) {
        car.skidT = 0.06;
        G.effects.skid(car.pos.x - f2.x * 1.5, car.pos.z - f2.z * 1.5, car.yaw);
      }
    }
    if (car.hp < 30 && !car.wrecked && G.effects) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.25;
        G.effects.smoke({ x: car.pos.x + f2.x * 1.5, y: 1, z: car.pos.z + f2.z * 1.5 }, 1);
      }
    }
    syncMesh(car, dt);
  }

  function syncMesh(car, dt) {
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
    const spin = car.speed * dt * 2;
    for (const w of car.wheels) w.rotation.x += spin;
  }

  function damageCar(car, amount, by) {
    if (car.wrecked) return;
    car.hp -= amount;
    if (by) car.lastHitBy = by;
    if (car.hp <= 0) {
      car.hp = 0;
      car.wrecked = true;
      if (G.effects) G.effects.explosion({ x: car.pos.x, y: 1, z: car.pos.z });
      if (G.audio) G.audio.explosion();
      emit('explosion', { x: car.pos.x, z: car.pos.z });
      if (car.kind === 'police' && car.lastHitBy === 'player') emit('copDown', { x: car.pos.x, z: car.pos.z });
      if (car.driver === 'player') emit('playerCarWrecked', {});
    }
  }

  function enterCar(car) {
    const wasTraffic = car.driver === 'traffic';
    car.driver = 'player';
    state.inCar = true;
    state.car = car;
    if (G.player) G.player.group.visible = false;
    if (G.audio) G.audio.setEngine(true, 0);
    if (wasTraffic) emit('carjack', { x: car.pos.x, z: car.pos.z });
    return car;
  }

  function exitCar() {
    const car = state.car;
    if (!car) return;
    car.driver = null;
    state.inCar = false;
    state.car = null;
    if (G.player) {
      const f = forwardOf(car);
      G.player.setPos(car.pos.x - f.z * 2.5, car.pos.z + f.x * 2.5, car.yaw);
      G.player.group.visible = true;
    }
    if (G.audio) G.audio.setEngine(false, 0);
  }

  function updateCamera(camera) {
    const car = state.car;
    if (!car) return;
    const f = forwardOf(car);
    const speed = car.speed;
    const back = 7 + speed * 0.12;
    const up = 3 + speed * 0.02;
    const target = new THREE.Vector3(
      car.pos.x - f.x * back,
      up,
      car.pos.z - f.z * back,
    );
    const [cx, cz] = city.collideCircle(target.x, target.z, 0.6);
    target.x = cx;
    target.z = cz;
    target.y = Math.max(1.5, target.y);
    camera.position.lerp(target, 1 - Math.pow(0.001, 1 / 60));
    camera.lookAt(car.pos.x + f.x * 6, 1.5, car.pos.z + f.z * 6);
  }

  function update(dt) {
    clock += dt;
    // The player's car answers to the keyboard.
    const playerCar = state.inCar ? state.car : null;
    if (playerCar) {
      if (playerCar.wrecked) {
        // A wrecked car still coasts to a stop instead of freezing mid-motion.
        driveCar(playerCar, dt, 0, 0, false);
        if (G.audio) G.audio.setEngine(false, 0);
      } else {
        const ax = input.axis();
        const handbrake = input.held('Space');
        driveCar(playerCar, dt, ax.y, -ax.x, handbrake);
        if (G.audio) G.audio.setEngine(true, playerCar.speed / playerCar.maxSpeed);
      }
    }
    // Police light bars flash at 6 Hz.
    const flash = Math.floor(clock * 6) % 2 === 0;
    for (const car of cars) {
      if (car.lightBar && car.lightsOn) {
        car.lightBar.children[0].visible = flash;
        car.lightBar.children[1].visible = !flash;
      }
    }
  }

  return {
    cars,
    get playerCar() { return state.inCar ? state.car : null; },
    spawnCar, removeCar, nearestCar, enterCar, exitCar,
    driveCar, damageCar, forwardOf, steerToward, updateCamera, update,
  };
}
