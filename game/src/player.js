// The player on foot: a boxy character with a walk cycle, and the
// over-shoulder camera. Driving lives in vehicles.js; this module owns the
// camera whenever the player is on foot.
// Conventions: yaw is a heading, forward = (sin yaw, cos yaw), so yaw = PI
// faces north (-Z). The camera sits behind the player along camYaw.
import * as THREE from 'three';
import { PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './config.js';

export function createPlayer(G) {
  const { scene, city, input } = G;

  const group = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0x2e8b8b });
  const jeansMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xc84444 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), jacketMat);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38), capMat);
  cap.position.y = 1.88;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.2), capMat);
  brim.position.set(0, 1.84, 0.26);
  group.add(brim);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), jeansMat);
  legL.position.set(-0.14, 0.42, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), jeansMat);
  legR.position.set(0.14, 0.42, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), jacketMat);
  armL.position.set(-0.37, 1.15, 0);
  group.add(armL);  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), jacketMat);
  armR.position.set(0.37, 1.15, 0);
  group.add(armR);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34), shoeMat);
  shoeL.position.set(-0.14, 0.05, 0.04);
  group.add(shoeL);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34), shoeMat);
  shoeR.position.set(0.14, 0.05, 0.04);
  group.add(shoeR);
  // Blob shadow: a soft dark disc under the player, so the character reads
  // as standing on the ground instead of floating over it.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  scene.add(group);

  const pos = new THREE.Vector3(0, 0, 300);
  let yaw = Math.PI; // facing north
  let camYaw = Math.PI;
  let camPitch = 0.12;
  let speed = 0;
  let aiming = false;
  let walkPhase = 0;
  let camPos = new THREE.Vector3(0, 4, 308);

  function forward() {
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  function setPos(x, z, newYaw) {
    pos.set(x, 0, z);
    yaw = newYaw;
    camYaw = newYaw;
    group.position.copy(pos);
    group.rotation.y = yaw;
  }

  function update(dt, active) {
    // Mouse look always applies (even on the title screen the camera orbits).
    const mouse = input.takeMouse();
    camYaw -= mouse.x * 0.0025;
    camPitch = Math.max(-0.4, Math.min(0.6, camPitch + mouse.y * 0.002));
    if (!active) {
      speed = 0;
      return;
    }
    const ax = input.axis();
    const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
    const targetSpeed = (ax.x !== 0 || ax.y !== 0)
      ? (sprint ? SPRINT_SPEED : WALK_SPEED)
      : 0;
    speed += (targetSpeed - speed) * Math.min(1, dt * 8);
    if (speed > 0.1) {
      // Camera-relative movement: forward on screen is camYaw.
      const mx = Math.sin(camYaw) * ax.y + Math.cos(camYaw) * ax.x;
      const mz = Math.cos(camYaw) * ax.y - Math.sin(camYaw) * ax.x;
      const len = Math.hypot(mx, mz) || 1;
      const moveYaw = Math.atan2(mx / len, mz / len);
      // Turn toward the movement direction (fast), or snap when aiming.
      let diff = moveYaw - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      yaw += diff * Math.min(1, dt * (aiming ? 20 : 10));
      const step = speed * dt;
      let nx = pos.x + (mx / len) * step;
      let nz = pos.z + (mz / len) * step;
      [nx, nz] = city.collideCircle(nx, nz, PLAYER_RADIUS);
      pos.x = nx;
      pos.z = nz;
      walkPhase += dt * speed * 1.6;
    }
    if (aiming) yaw = camYaw;
    // Walk cycle: legs and arms swing against each other.
    const swing = Math.min(1, speed / WALK_SPEED) * 0.55 * Math.sin(walkPhase);
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    group.position.copy(pos);
    group.rotation.y = yaw;
    // Cars push the player aside instead of passing through.
    if (G.vehicles) {
      for (const car of G.vehicles.cars) {
        if (car.wrecked || car.driver === 'player') continue;
        const dx = pos.x - car.pos.x;
        const dz = pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && d > 0.001) {
          pos.x = car.pos.x + (dx / d) * 1.9;
          pos.z = car.pos.z + (dz / d) * 1.9;
          group.position.copy(pos);
        }
      }
    }
  }

  function updateCamera(camera) {
    // Over-shoulder: behind along camYaw, up, and a touch to the side.
    // Aiming pulls the camera in close.
    const back = aiming ? 2.8 : 4.4;
    const up = aiming ? 1.9 : 2.3 + camPitch * 1.2;
    const side = aiming ? 0.9 : 0.75;
    const bx = Math.sin(camYaw);
    const bz = Math.cos(camYaw);
    const target = new THREE.Vector3(
      pos.x - bx * back + Math.cos(camYaw) * side,
      up,
      pos.z - bz * back - Math.sin(camYaw) * side,
    );
    // Keep the camera out of buildings and above the ground.
    const [cx, cz] = city.collideCircle(target.x, target.z, 0.6);
    target.x = cx;
    target.z = cz;
    target.y = Math.max(1.2, target.y);
    camPos.lerp(target, 1 - Math.pow(0.001, 1 / 60));
    camera.position.copy(camPos);
    camera.lookAt(pos.x + bx * 2, 1.5, pos.z + bz * 2);
  }

  return {
    group, pos,
    get yaw() { return yaw; },
    get camYaw() { return camYaw; },
    get speed() { return speed; },
    get aiming() { return aiming; },
    setAiming(v) { aiming = v; },
    setPos, forward, update, updateCamera,
  };
}
