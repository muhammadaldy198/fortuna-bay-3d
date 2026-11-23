// Combat for Fortuna Bay v2 — 5 weapons (fists + 4 guns), hitscan shooting
// with spread, melee, mission enemies, player health. Hit tests are manual
// sphere tests against the aim ray (no Raycaster setup, deterministic).
// v2: FALCON-1 can be shot out of the sky, and the melee hit test no longer
// divides by zero when an enemy stands exactly on the player. Spread and
// enemy fire use Math.random on purpose: combat is live gameplay, not part
// of the seeded deterministic sim (staged screenshots don't fire a shot).
import * as THREE from 'three';
import { ENEMY_HEALTH, WEAPONS } from './config.js';

const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
const KEY_TO_WEAPON = {
  Digit1: 'fists', Digit2: 'pistol', Digit3: 'smg', Digit4: 'shotgun', Digit5: 'rifle',
};

export function createCombat(G) {
  const { scene, state, input, emit, on } = G;
  const enemies = [];
  let cooldown = 0;

  function weapon() {
    return state.weapon || 'pistol';
  }

  function selectWeapon(key) {
    if (!WEAPONS[key]) return;
    state.weapon = key;
    cooldown = Math.max(cooldown, 0.15);
  }

  function cycleWeapon() {
    const i = WEAPON_ORDER.indexOf(weapon());
    selectWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  }

  function spawnEnemy(x, z, opts = {}) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0xa83434 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), torsoMat);
    torso.position.y = 1.15;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
    head.position.y = 1.68;
    group.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), darkMat);
    legL.position.set(-0.14, 0.42, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), darkMat);
    legR.position.set(0.14, 0.42, 0);
    group.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), darkMat);
    gun.position.set(0.3, 1.2, 0.4);
    group.add(gun);
    group.position.set(x, 0, z);
    scene.add(group);
    const enemy = {
      mesh: group,
      pos: new THREE.Vector3(x, 0, z),
      hp: opts.hp || ENEMY_HEALTH,
      speed: opts.speed || 3.4,
      shootT: 1 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      legL, legR,
    };
    enemies.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    const i = enemies.indexOf(enemy);
    if (i !== -1) enemies.splice(i, 1);
    scene.remove(enemy.mesh);
  }

  // Ray-sphere test: does the ray from origin along dir hit the sphere
  // (centre, radius) within maxDist? Returns the distance or Infinity.
  function raySphere(origin, dir, centre, radius, maxDist) {
    const ox = centre.x - origin.x;
    const oy = centre.y - origin.y;
    const oz = centre.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0 || tca > maxDist) return Infinity;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    if (d2 > radius * radius) return Infinity;
    return tca - Math.sqrt(radius * radius - d2);
  }

  function shoot() {
    const key = weapon();
    const def = WEAPONS[key];
    if (cooldown > 0) return;
    cooldown = 1 / def.rate;
    const pp = G.player.pos;
    const yaw = G.player.camYaw;
    const origin = { x: pp.x, y: 1.5, z: pp.z };
    if (def.melee) {
      // A punch: anything in front within range takes damage.
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      let hit = false;
      for (const enemy of [...enemies]) {
        const dx = enemy.pos.x - pp.x;
        const dz = enemy.pos.z - pp.z;
        const d = Math.hypot(dx, dz);
        if (d < def.range && d > 0.001 && (dx * fx + dz * fz) / d > 0.5) {
          damageEnemy(enemy, def.damage);
          hit = true;
        }
      }
      if (G.audio) G.audio.punch();
      if (hit && G.effects) G.effects.burst({ x: pp.x + fx * 1.5, y: 1.2, z: pp.z + fz * 1.5 }, 0xffcc66, 4, 3);
      return;
    }
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const spreadYaw = yaw + (Math.random() - 0.5) * def.spread * 2;
      const dir = { x: Math.sin(spreadYaw), y: 0, z: Math.cos(spreadYaw) };
      let bestD = def.range;
      let best = null;
      let bestKind = null;
      for (const enemy of enemies) {
        const d = raySphere(origin, dir, { x: enemy.pos.x, y: 1.2, z: enemy.pos.z }, 1.1, def.range);
        if (d < bestD) { bestD = d; best = enemy; bestKind = 'enemy'; }
      }
      if (G.vehicles) {
        for (const car of G.vehicles.cars) {
          if (car.wrecked) continue;
          const d = raySphere(origin, dir, { x: car.pos.x, y: 0.9, z: car.pos.z }, 2.4, def.range);
          if (d < bestD) { bestD = d; best = car; bestKind = 'car'; }
        }
      }
      if (G.peds) {
        for (const ped of G.peds.peds) {
          if (ped.state === 'down') continue;
          const d = raySphere(origin, dir, { x: ped.x, y: 1.1, z: ped.z }, 0.9, def.range);
          if (d < bestD) { bestD = d; best = ped; bestKind = 'ped'; }
        }
      }
      // The heli: shooting upward is approximated by testing the ray
      // against a tall vertical cylinder around the heli — the aim is
      // horizontal, so the test uses the heli's ground position with a
      // generous radius when it is low overhead. Above 45 m it is out of
      // range by design: you can only shoot FALCON-1 down when it comes low.
      if (G.police && G.police.heli) {
        const hp = G.police.heli.group.position;
        const d = raySphere(origin, dir, { x: hp.x, y: 1.5, z: hp.z }, 3.5, def.range);
        if (d < bestD && hp.y < 45) { bestD = d; best = 'heli'; bestKind = 'heli'; }
      }
      const hitX = origin.x + dir.x * bestD;
      const hitZ = origin.z + dir.z * bestD;
      if (bestKind === 'enemy') damageEnemy(best, def.damage);
      else if (bestKind === 'car') damageCar(best, def.damage);
      else if (bestKind === 'ped') emit('pedShot', { ped: best });
      else if (bestKind === 'heli' && G.police) {
        G.police.damageHeli(def.damage);
        if (G.effects && G.police.heli) {
          const hp = G.police.heli.group.position;
          G.effects.burst({ x: hp.x, y: hp.y, z: hp.z }, 0xffcc66, 4, 3);
        }
      }
      if (best && bestKind !== 'heli' && G.effects) G.effects.burst({ x: hitX, y: 1.2, z: hitZ }, 0xffcc66, 3, 3);
    }
    if (G.audio) G.audio.shot(key);
    if (G.effects) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      G.effects.muzzle({ x: pp.x + fx * 1, y: 1.45, z: pp.z + fz * 1 }, yaw);
    }
    emit('gunshot', { x: pp.x, z: pp.z });
  }

  function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      if (G.effects) G.effects.burst({ x: enemy.pos.x, y: 1.2, z: enemy.pos.z }, 0xff5544, 10, 5);
      removeEnemy(enemy);
      emit('enemyDown', { enemy });
    }
  }

  function damageCar(car, amount) {
    if (G.vehicles) G.vehicles.damageCar(car, amount, 'player');
  }

  function damagePlayer(amount, from) {
    state.health = Math.max(0, state.health - amount);
    emit('playerHurt', { amount, from });
    if (state.health <= 0) emit('died', { from });
  }

  // A cop's shot: 34% chance to hit for 7 damage.
  on('copShot', () => {
    if (Math.random() < 0.34) damagePlayer(7, 'cop');
  });

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (state.screen !== 'play' || state.inCar) return;
    // Photo mode owns the mouse: clicking must frame a shot, not fire one.
    // (Enemies keep moving below — only the player's input is gated.)
    if (!G.photo || !G.photo.active) {
      // Weapon switching.
      for (const [code, key] of Object.entries(KEY_TO_WEAPON)) {
        if (input.pressed(code)) selectWeapon(key);
      }
      if (input.pressed('KeyQ')) cycleWeapon();
      // Aim with the right mouse button.
      if (G.player) G.player.setAiming(input.rightDown());
      // Fire: hold for auto weapons, click (or F) for the rest.
      const def = WEAPONS[weapon()];
      const wantFire = def.auto ? input.mouseDown() : (input.takeClick() || input.pressed('KeyF'));
      if (wantFire) shoot();
    }

    // Enemies walk at the player and shoot inside 34 m.
    const pp = G.player.pos;
    for (const enemy of [...enemies]) {
      const dx = pp.x - enemy.pos.x;
      const dz = pp.z - enemy.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        enemy.mesh.rotation.y = Math.atan2(dx, dz);
        const step = enemy.speed * dt;
        let nx = enemy.pos.x + (dx / d) * step;
        let nz = enemy.pos.z + (dz / d) * step;
        [nx, nz] = G.city.collideCircle(nx, nz, 0.5);
        enemy.pos.x = nx;
        enemy.pos.z = nz;
        enemy.mesh.position.copy(enemy.pos);
        enemy.phase += dt * 6;
        enemy.legL.rotation.x = Math.sin(enemy.phase) * 0.5;
        enemy.legR.rotation.x = -Math.sin(enemy.phase) * 0.5;
      }
      if (d < 34 && !state.inCar && G.city.hasLineOfSight(enemy.pos.x, enemy.pos.z, pp.x, pp.z)) {
        enemy.shootT -= dt;
        if (enemy.shootT <= 0) {
          enemy.shootT = 1.2 + Math.random() * 1.4;
          if (G.effects) {
            G.effects.muzzle({ x: enemy.pos.x, y: 1.3, z: enemy.pos.z }, enemy.mesh.rotation.y);
          }
          if (Math.random() < 0.4) damagePlayer(6, 'enemy');
        }
      }
    }
  }

  return { enemies, spawnEnemy, removeEnemy, damageCar, damagePlayer, weapon, selectWeapon, cycleWeapon, update };
}
