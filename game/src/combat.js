// Combat: fists and a pistol, plus the enemy NPCs missions throw at the
// player. Shooting is hitscan — a tracer, a muzzle flash, damage on the
// nearest enemy inside the aim cone. Kills pay cash and raise the heat.
// Every shot is timestamped so pedestrians know to run.

import * as THREE from 'three';
import { PLAYER } from './config.js';

/**
 * Create the combat system for world G. Returns:
 * - enemies — live enemy NPCs
 * - shotsFiredAt — the frame of the last shot (pedestrians watch it)
 * - punch(pos, heading) — melee hit in front of the player
 * - shoot(from, dir) — hitscan pistol shot along dir
 * - spawnEnemy(x, z) — add an enemy NPC
 * - update(dt)
 */
export function createCombat(G) {
  const enemies = [];
  let shotsFiredAt = -10000;

  function spawnEnemy(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x8e2f2f }),
    );
    body.position.y = 1.0;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
    );
    head.position.y = 1.85;
    group.add(body, head);
    group.position.set(x, 0, z);
    G.scene.add(group);
    const enemy = {
      pos: group.position,
      mesh: group,
      health: 60,
      speed: 4.5,
      shootCooldown: 1.5,
    };
    enemies.push(enemy);
    return enemy;
  }

  function killEnemy(enemy) {
    G.scene.remove(enemy.mesh);
    enemies.splice(enemies.indexOf(enemy), 1);
    G.money += 50;
    if (G.effects) G.effects.burst(enemy.pos.x, 1, enemy.pos.z, 0xaa2222, 14);
    if (G.hud) G.hud.message('+$50 — target down');
  }

  function punch(pos, heading) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const enemy of [...enemies]) {
      const dx = enemy.pos.x - pos.x;
      const dz = enemy.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / Math.max(dist, 0.001);
      if (dist < PLAYER.punchRange && facing > 0.5) {
        enemy.health -= PLAYER.punchDamage;
        enemy.pos.x += fx * 1.2;
        enemy.pos.z += fz * 1.2;
        if (G.effects) G.effects.burst(enemy.pos.x, 1.2, enemy.pos.z, 0xffffff, 6);
        if (enemy.health <= 0) killEnemy(enemy);
        return true;
      }
    }
    return false;
  }

  function shoot(from, dir) {
    shotsFiredAt = G.frame;
    if (G.audio) G.audio.gunshot();
    if (G.effects) G.effects.muzzle(from.x, from.y, from.z, dir);
    let best = null;
    let bestDist = PLAYER.pistolRange;
    for (const enemy of enemies) {
      const dx = enemy.pos.x - from.x;
      const dz = enemy.pos.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const facing = (dx * dir.x + dz * dir.z) / Math.max(dist, 0.001);
      if (facing < 0.92) continue;
      best = enemy;
      bestDist = dist;
    }
    const end = {
      x: from.x + dir.x * (best ? bestDist : PLAYER.pistolRange),
      y: from.y,
      z: from.z + dir.z * (best ? bestDist : PLAYER.pistolRange),
    };
    if (G.effects) G.effects.tracer(from, end);
    if (best) {
      best.health -= PLAYER.pistolDamage;
      if (G.effects) G.effects.burst(best.pos.x, 1.4, best.pos.z, 0xff4444, 8);
      if (best.health <= 0) killEnemy(best);
      else G.police.addWanted(1);
    }
    return best !== null;
  }

  function update(dt) {
    for (const enemy of [...enemies]) {
      const dx = G.player.pos.x - enemy.pos.x;
      const dz = G.player.pos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz);
      enemy.mesh.rotation.y = Math.atan2(dx, dz);
      if (dist > 24) {
        enemy.pos.x += (dx / dist) * enemy.speed * dt;
        enemy.pos.z += (dz / dist) * enemy.speed * dt;
      } else {
        enemy.shootCooldown -= dt;
        if (enemy.shootCooldown <= 0) {
          enemy.shootCooldown = 1.6 + G.rng.range(0, 0.8);
          if (G.rng.chance(0.55)) {
            G.player.damage(9);
            if (G.effects) {
              G.effects.tracer(
                { x: enemy.pos.x, y: 1.4, z: enemy.pos.z },
                { x: G.player.pos.x, y: 1.2, z: G.player.pos.z },
              );
            }
            if (G.audio) G.audio.gunshot();
          }
        }
      }
    }
  }

  return {
    enemies,
    get shotsFiredAt() {
      return shotsFiredAt;
    },
    punch,
    shoot,
    spawnEnemy,
    update,
  };
}
