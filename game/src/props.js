// Street furniture: lamps, palms, hydrants, benches and neon signs, all
// placed from the seeded rng and drawn instanced so the street reads as a
// lived-in place without costing draw calls. Palms cluster near the beach;
// lamps line every road; hydrants and benches dot the sidewalks.

import * as THREE from 'three';
import { CITY } from './config.js';

/**
 * Place the street props for world G. Returns { counts } with the number of
 * each prop type placed. Everything is instanced: one mesh per prop type.
 */
export function createProps(G) {
  const rng = G.rng.fork(202);
  const dummy = new THREE.Object3D();
  const counts = { lamps: 0, palms: 0, hydrants: 0, benches: 0, signs: 0 };

  function instanced(geo, mat, spots) {
    if (spots.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y || 0, s.z);
      dummy.scale.set(s.sx || 1, s.sy || 1, s.sz || 1);
      dummy.rotation.set(0, s.rot || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    G.scene.add(mesh);
    return mesh;
  }

  // Street lamps: along both sides of every road, every 40 m.
  const lampSpots = [];
  const half = CITY.size / 2;
  for (const line of G.city.roadLines) {
    for (let at = -half + 20; at <= half - 20; at += 40) {
      lampSpots.push({ x: line + CITY.roadWidth / 2 + 1.5, z: at });
      lampSpots.push({ x: line - CITY.roadWidth / 2 - 1.5, z: at });
      lampSpots.push({ x: at, z: line + CITY.roadWidth / 2 + 1.5 });
      lampSpots.push({ x: at, z: line - CITY.roadWidth / 2 - 1.5 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  instanced(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }), lampSpots);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headSpots = lampSpots.map((s) => ({ x: s.x, y: 7, z: s.z }));
  instanced(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), headSpots);
  counts.lamps = lampSpots.length;

  // Palms: two rows along the beach plus scattered ones on the Strip.
  const palmSpots = [];
  for (let x = -half + 10; x <= half - 10; x += 18) {
    palmSpots.push({ x: x + rng.range(-3, 3), z: CITY.beachZ + rng.range(-4, 10), sy: rng.range(0.8, 1.3), rot: rng.range(0, Math.PI * 2) });
    if (rng.chance(0.5)) palmSpots.push({ x: x + rng.range(-3, 3), z: CITY.beachZ - 40 + rng.range(-6, 6), sy: rng.range(0.7, 1.1), rot: rng.range(0, Math.PI * 2) });
  }
  for (let i = 0; i < 40; i += 1) {
    palmSpots.push({ x: rng.range(-120, 120), z: rng.range(120, 240), sy: rng.range(0.7, 1.2), rot: rng.range(0, Math.PI * 2) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 6, 6);
  trunkGeo.translate(0, 3, 0);
  instanced(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), palmSpots);
  const crownGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  const crownSpots = palmSpots.map((s) => ({ x: s.x, y: 6 * (s.sy || 1) + 1, z: s.z, sy: s.sy }));
  instanced(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2e8b57 }), crownSpots);
  counts.palms = palmSpots.length;

  // Hydrants and benches: seeded sidewalk spots near road corners.
  const hydrantSpots = [];
  const benchSpots = [];
  for (const block of G.city.blocks) {
    if (rng.chance(0.6)) {
      hydrantSpots.push({ x: block.x0 - 2, z: block.z0 - 2, rot: rng.range(0, Math.PI * 2) });
    }
    if (rng.chance(0.45)) {
      benchSpots.push({ x: block.cx + rng.range(-8, 8), z: block.z1 + 2.5, rot: rng.range(0, Math.PI * 2) });
    }
  }
  const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8);
  hydrantGeo.translate(0, 0.45, 0);
  instanced(hydrantGeo, new THREE.MeshLambertMaterial({ color: 0xd32f2f }), hydrantSpots);
  counts.hydrants = hydrantSpots.length;
  const benchGeo = new THREE.BoxGeometry(2.2, 0.5, 0.7);
  benchGeo.translate(0, 0.45, 0);
  instanced(benchGeo, new THREE.MeshLambertMaterial({ color: 0x8d6e63 }), benchSpots);
  counts.benches = benchSpots.length;

  // Neon signs on the Strip: emissive boxes on building faces, pink and cyan.
  const signSpots = [];
  for (let i = 0; i < 26; i += 1) {
    signSpots.push({
      x: rng.range(-140, 140),
      y: rng.range(6, 18),
      z: rng.range(100, 250),
      sx: rng.range(3, 7),
      sy: 1.4,
      sz: 0.3,
      rot: rng.chance(0.5) ? 0 : Math.PI / 2,
    });
  }
  const signGeo = new THREE.BoxGeometry(1, 1, 1);
  instanced(signGeo, new THREE.MeshBasicMaterial({ color: 0xff2e88 }), signSpots.filter((_, i) => i % 2 === 0));
  instanced(signGeo, new THREE.MeshBasicMaterial({ color: 0x22d3ee }), signSpots.filter((_, i) => i % 2 === 1));
  counts.signs = signSpots.length;

  return { counts };
}
