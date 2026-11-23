// The crew: two companions who follow the player on foot, shoot at the
// player's enemies, and talk. Ghost can run a decoy — a distraction across
// town that pulls a star of heat off the player (one minute cooldown).
// They are people, not icons: names, lines, and a reason to keep them alive.

import * as THREE from 'three';

const CREW_DEFS = [
  { name: 'Maya', callsign: 'Wrench', color: 0x8e44ad, line: 'Maya: I got your back. Drive.' },
  { name: 'Dito', callsign: 'Ghost', color: 0x16a085, line: 'Dito: Cops are mine. Go dark.' },
];

/**
 * Create the crew for world G. Returns:
 * - members — the companion objects
 * - decoy() — pull one star of heat (60 s cooldown), or false if cooling down
 * - update(dt)
 */
export function createCrew(G) {
  const members = [];
  let decoyCooldown = 0;

  for (const def of CREW_DEFS) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.0, 0.45),
      new THREE.MeshLambertMaterial({ color: def.color }),
    );
    body.position.y = 1.05;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
    );
    head.position.y = 1.85;
    group.add(body, head);
    const spot = G.city.randomRoadPoint(G.rng.fork(def.name.length * 7 + 1));
    group.position.set(spot.x, 0, spot.z);
    G.scene.add(group);
    members.push({
      ...def,
      pos: group.position,
      mesh: group,
      speed: 7.5,
      shootCooldown: 2,
      following: true,
    });
  }

  function decoy() {
    if (decoyCooldown > 0) return false;
    if (G.wanted <= 0) return false;
    decoyCooldown = 60;
    G.police.setWanted(G.wanted - 1);
    if (G.hud) G.hud.message('Dito: decoy lit across town — heat is off you.');
    return true;
  }

  function update(dt) {
    decoyCooldown = Math.max(0, decoyCooldown - dt);
    for (const member of members) {
      if (!member.following) continue;
      const dx = G.player.pos.x - member.pos.x;
      const dz = G.player.pos.z - member.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) {
        const step = Math.min(dist - 4, member.speed * dt);
        member.pos.x += (dx / dist) * step;
        member.pos.z += (dz / dist) * step;
        member.mesh.rotation.y = Math.atan2(dx, dz);
      }
      // Shoot the nearest enemy in range.
      member.shootCooldown -= dt;
      if (member.shootCooldown <= 0 && G.combat.enemies.length > 0) {
        let best = null;
        let bestDist = 45;
        for (const enemy of G.combat.enemies) {
          const d = Math.hypot(enemy.pos.x - member.pos.x, enemy.pos.z - member.pos.z);
          if (d < bestDist) {
            bestDist = d;
            best = enemy;
          }
        }
        if (best) {
          member.shootCooldown = 2.2;
          best.health -= 17;
          if (G.effects) {
            G.effects.tracer(
              { x: member.pos.x, y: 1.4, z: member.pos.z },
              { x: best.pos.x, y: 1.2, z: best.pos.z },
            );
          }
          if (best.health <= 0) {
            G.scene.remove(best.mesh);
            G.combat.enemies.splice(G.combat.enemies.indexOf(best), 1);
            G.money += 50;
            if (G.hud) G.hud.message(`${member.name}: target down. +$50`);
          }
        }
      }
    }
  }

  return { members, decoy, update };
}
