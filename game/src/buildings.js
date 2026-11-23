// The skyline: procedural buildings on every block, drawn as instanced boxes
// so hundreds of towers cost only a handful of draw calls. Each block is cut
// into a 3x3 lot grid; most lots get a building whose height depends on its
// district (Downtown soars, the Marina stays low), with a seeded facade
// variant and a rooftop prop or two.

import * as THREE from 'three';
import { CITY } from './config.js';

const FACADE_COLORS = [0xb8b0a0, 0x8fa3b8, 0xc9a689, 0x9aa8a0, 0xd8cdb8];
const ROOF_COLORS = [0x6b655c, 0x7a7268, 0x5c564e];

/**
 * Build the skyline for world G. Returns { list, count } where list holds one
 * record per building: { x, z, w, d, h, district }. The meshes are instanced
 * (one InstancedMesh per facade colour) plus a second instanced mesh for the
 * rooftop boxes.
 */
export function createBuildings(G) {
  const rng = G.rng.fork(101);
  const textures = G.textures;
  const list = [];

  for (const block of G.city.blocks) {
    const lots = 3;
    const lotW = (block.x1 - block.x0) / lots;
    const lotD = (block.z1 - block.z0) / lots;
    for (let ix = 0; ix < lots; ix += 1) {
      for (let iz = 0; iz < lots; iz += 1) {
        if (!rng.chance(0.82)) continue;
        const w = lotW * rng.range(0.62, 0.9);
        const d = lotD * rng.range(0.62, 0.9);
        const x = block.x0 + ix * lotW + lotW / 2;
        const z = block.z0 + iz * lotD + lotD / 2;
        let h;
        if (block.district === 'Downtown') h = rng.range(28, 78);
        else if (block.district === 'The Strip') h = rng.range(14, 42);
        else if (block.district === 'Marina') h = rng.range(8, 20);
        else h = rng.range(10, 30);
        list.push({ x, z, w, d, h, district: block.district, variant: rng.int(0, FACADE_COLORS.length - 1) });
      }
    }
  }

  // One instanced box per facade variant; instance colour tints each tower.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let v = 0; v < FACADE_COLORS.length; v += 1) {
    const subset = list.filter((b) => b.variant === v);
    if (subset.length === 0) continue;
    const mat = new THREE.MeshLambertMaterial({ color: FACADE_COLORS[v], map: textures.facade[v % textures.facade.length] });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, subset.length);
    subset.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.08 + rng.range(-0.02, 0.04), rng.range(0.05, 0.2), rng.range(0.45, 0.65));
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    G.scene.add(mesh);
  }

  // Rooftop boxes (AC units, water tanks): one instanced mesh, a couple per
  // tall building, seeded positions on the roof.
  const roofSpots = [];
  for (const b of list) {
    if (b.h < 16) continue;
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i += 1) {
      roofSpots.push({
        x: b.x + rng.range(-b.w / 4, b.w / 4),
        y: b.h,
        z: b.z + rng.range(-b.d / 4, b.d / 4),
        s: rng.range(1.2, 2.6),
      });
    }
  }
  if (roofSpots.length > 0) {
    const roofMat = new THREE.MeshLambertMaterial({ color: ROOF_COLORS[0] });
    const roofMesh = new THREE.InstancedMesh(boxGeo, roofMat, roofSpots.length);
    roofSpots.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.scale.set(r.s, r.s * 0.7, r.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      roofMesh.setMatrixAt(i, dummy.matrix);
    });
    roofMesh.instanceMatrix.needsUpdate = true;
    G.scene.add(roofMesh);
  }

  // A few landmark towers near Downtown, taller than anything else, with
  // emissive crowns so the skyline reads at night.
  const landmarkMat = new THREE.MeshLambertMaterial({ color: 0x4a5a75, emissive: 0x223344 });
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xff2e88 });
  const landmarks = [
    { x: -40, z: -40, h: 110, w: 26 },
    { x: 48, z: 24, h: 96, w: 22 },
  ];
  for (const lm of landmarks) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(lm.w, lm.h, lm.w), landmarkMat);
    tower.position.set(lm.x, lm.h / 2, lm.z);
    G.scene.add(tower);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(lm.w * 0.4, 3, lm.w * 0.4), crownMat);
    crown.position.set(lm.x, lm.h + 1.5, lm.z);
    G.scene.add(crown);
    list.push({ x: lm.x, z: lm.z, w: lm.w, d: lm.w, h: lm.h, district: 'Downtown', variant: 1, landmark: true });
  }

  return { list, count: list.length };
}
