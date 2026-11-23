// Pedestrians: walkers on the sidewalks, drawn as two instanced meshes
// (bodies, heads) with a shirt colour each. They stroll along the roads,
// turn at intersections, and run when the heat is on — a high wanted level
// or a gunshot nearby sends them fleeing from the player.

import * as THREE from 'three';
import { POPULATION } from './config.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1];
const SKINS = [0xe8b88a, 0xc68642, 0x8d5524, 0xf1c27d];

/**
 * Create the pedestrian system for world G. Returns { list, update(dt) }.
 * Each pedestrian is { pos, heading, speed, road, dir, fleeing }.
 */
export function createPedestrians(G) {
  const rng = G.rng.fork(505);
  const list = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const bodyGeo = new THREE.CylinderGeometry(0.32, 0.38, 1.25, 8);
  bodyGeo.translate(0, 0.95, 0);
  const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), POPULATION.pedestrians);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), POPULATION.pedestrians);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(bodies);
  G.scene.add(heads);

  function spawnPed() {
    const spot = G.city.randomRoadPoint(rng);
    const side = rng.chance(0.5) ? 1 : -1;
    const onXRoad = Math.abs(spot.x - G.city.nearestRoad(spot.x, spot.z).x) < 0.01;
    const x = onXRoad ? spot.x + side * 9 : spot.x;
    const z = onXRoad ? spot.z : spot.z + side * 9;
    return {
      pos: new THREE.Vector3(x, 0, z),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, POPULATION.pedSpeed),
      shirt: rng.pick(SHIRTS),
      skin: rng.pick(SKINS),
      dir: rng.chance(0.5) ? 1 : -1,
      axis: onXRoad ? 'z' : 'x',
      fleeing: false,
      bob: rng.range(0, Math.PI * 2),
    };
  }

  for (let i = 0; i < POPULATION.pedestrians; i += 1) list.push(spawnPed());

  function update(dt) {
    const shotsRecent = G.combat && G.frame - G.combat.shotsFiredAt < 300;
    const scary = G.wanted >= 3 || shotsRecent;
    for (let i = 0; i < list.length; i += 1) {
      const ped = list[i];
      const dx = ped.pos.x - G.player.pos.x;
      const dz = ped.pos.z - G.player.pos.z;
      const distToPlayer = Math.hypot(dx, dz);
      ped.fleeing = scary && distToPlayer < 60;
      if (ped.fleeing) {
        ped.heading = Math.atan2(dx, dz);
        ped.pos.x += Math.sin(ped.heading) * 5.5 * dt;
        ped.pos.z += Math.cos(ped.heading) * 5.5 * dt;
      } else {
        // Stroll along the sidewalk; turn at the block's end.
        ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        if (rng.chance(0.002)) ped.heading += rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        if (Math.abs(ped.pos.x) > G.city.bounds - 10 || Math.abs(ped.pos.z) > G.city.bounds - 10) {
          ped.heading += Math.PI;
        }
      }
      const bound = G.city.bounds - 4;
      ped.pos.x = Math.max(-bound, Math.min(bound, ped.pos.x));
      ped.pos.z = Math.max(-bound, Math.min(bound, ped.pos.z));
      ped.bob += dt * (ped.fleeing ? 14 : 7);
      const hop = Math.abs(Math.sin(ped.bob)) * 0.08;
      dummy.position.set(ped.pos.x, hop, ped.pos.z);
      dummy.rotation.set(0, ped.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      color.setHex(ped.shirt);
      bodies.setColorAt(i, color);
      dummy.position.y = 1.72 + hop;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      color.setHex(ped.skin);
      heads.setColorAt(i, color);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  }

  return { list, update };
}
