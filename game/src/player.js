// The player: on foot (walk, run, jump, punch) or behind the wheel of the
// nearest car. One mesh group follows the player on foot and hides when they
// drive; the camera follows either. Health, money and the wanted level live
// on G; this module owns movement, entering/exiting cars, and dying.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { ACTION_ENTER, ACTION_PUNCH } from './input.js';

/**
 * Create the player for world G. Returns:
 * - pos, heading, health, speed
 * - car — the car being driven, or null on foot
 * - mesh — the on-foot figure group
 * - update(dt) — move, enter/exit, punch, camera hint
 * - damage(amount) / heal(amount)
 * - reset(x, z)
 */
export function createPlayer(G) {
  const pos = new THREE.Vector3(0, 0, 40);
  let heading = 0;
  let verticalSpeed = 0;
  let onGround = true;
  let health = PLAYER.maxHealth;
  let car = null;
  let punchCooldown = 0;

  // The figure: torso, head, legs — simple boxes and a sphere, teal jacket.
  const mesh = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x1e7a6e }),
  );
  torso.position.y = 1.1;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.85;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legGeo = new THREE.BoxGeometry(0.26, 0.75, 0.3);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.18, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.18, 0.4, 0);
  mesh.add(torso);
  mesh.add(head);
  mesh.add(legL);
  mesh.add(legR);
  mesh.position.copy(pos);
  G.scene.add(mesh);

  function reset(x, z) {
    pos.set(x, 0, z);
    heading = 0;
    verticalSpeed = 0;
    health = PLAYER.maxHealth;
    car = null;
    mesh.visible = true;
    mesh.position.copy(pos);
  }

  function damage(amount) {
    health = Math.max(0, health - amount);
    if (G.hud) G.hud.flashDamage();
    if (health <= 0 && G.screen === 'play') G.screen = 'over';
  }

  function heal(amount) {
    health = Math.min(PLAYER.maxHealth, health + amount);
  }

  function update(dt) {
    punchCooldown = Math.max(0, punchCooldown - dt);
    const actions = G.input.takeActions();
    const input = G.input;

    if (car) {
      // Driving: the car answers the wheel; E steps out beside it.
      const driveInput = input.drive();
      G.vehicles.drive(car, driveInput.throttle, driveInput.steer, dt);
      pos.copy(car.pos);
      heading = car.heading;
      mesh.visible = false;
      mesh.position.copy(pos);
      if (actions & ACTION_ENTER) {
        const side = { x: car.pos.x + Math.cos(car.heading) * 3, z: car.pos.z - Math.sin(car.heading) * 3 };
        pos.set(side.x, 0, side.z);
        car.speed = 0;
        car = null;
        mesh.visible = true;
        mesh.position.copy(pos);
        if (G.audio) G.audio.door();
      }
      return;
    }

    // On foot: WASD moves relative to the camera yaw; Shift runs; Space jumps.
    const move = input.move();
    const run = input.sprint();
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const yaw = G.cameraYaw || 0;
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    let mx = right.x * move.x + forward.x * move.z;
    let mz = right.z * move.x + forward.z * move.z;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      heading = Math.atan2(mx, mz);
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      const swing = Math.sin(G.frame * 0.35) * 0.5;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
    } else {
      legL.rotation.x = 0;
      legR.rotation.x = 0;
    }
    if (input.jump() && onGround) {
      verticalSpeed = PLAYER.jumpSpeed;
      onGround = false;
    }
    if (!onGround) {
      verticalSpeed -= 22 * dt;
      pos.y += verticalSpeed * dt;
      if (pos.y <= 0) {
        pos.y = 0;
        verticalSpeed = 0;
        onGround = true;
      }
    }
    const bound = G.city.bounds - 4;
    pos.x = Math.max(-bound, Math.min(bound, pos.x));
    pos.z = Math.max(-bound, Math.min(bound, pos.z));
    G.vehicles.collideBuildings(pos, PLAYER.radius);
    mesh.position.copy(pos);
    mesh.rotation.y = heading;

    // Enter the nearest car; punch the nearest threat.
    if (actions & ACTION_ENTER) {
      const near = G.vehicles.nearestCar(pos.x, pos.z, PLAYER.enterCarRange);
      if (near) {
        car = near;
        mesh.visible = false;
        if (G.audio) G.audio.door();
        if (near.isCruiser) G.police.addWanted(1);
      }
    }
    if (actions & ACTION_PUNCH && punchCooldown <= 0) {
      punchCooldown = 0.45;
      if (G.combat) G.combat.punch(pos, heading);
      if (G.audio) G.audio.punch();
    }

    // Slow health regen out of combat.
    if (health < PLAYER.maxHealth && G.frame % 120 === 0) heal(1);
  }

  return {
    pos,
    get heading() {
      return heading;
    },
    set heading(value) {
      heading = value;
    },
    get health() {
      return health;
    },
    set health(value) {
      health = value;
    },
    get car() {
      return car;
    },
    set car(value) {
      car = value;
    },
    mesh,
    update,
    damage,
    heal,
    reset,
  };
}
