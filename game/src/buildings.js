// Buildings for Fortuna Bay v2 — three InstancedMeshes, three draw calls:
// coloured boxes, flat roofs, and thousands of window quads (lit warm or
// dark glass). Windows are real quads on the facades, so they stay
// proportional on a 6 m villa and a 120 m tower alike. The Fortuna Tower
// gets an antenna and a blinking beacon. v2: setNight() brightens the lit
// windows by intensity (no extra lights — the cheap-night trick), so the
// night shot glows without costing a single draw call.
import * as THREE from 'three';
import { WINDOW_LIT } from './config.js';
import { hash2 } from './random.js';

const MAX_WINDOWS = 40000;

const ROOF_COLORS = {
  glass: 0x2a3444,
  terra: 0x8a5a44,
  villa: 0x6a4a34,
  pastel: 0xe8e0d0,
  ware: 0x5a5a5a,
  mid: 0x4a4a52,
  casino: 0xc8a040,
  shop: 0x5a4a3a,
  civic: 0x6a7a8a,
};

export function createBuildings(scene, city) {
  const buildings = city.buildings;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Bodies: one unit box, scaled per building, coloured per instance.
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, buildings.length);
  buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.rotation.set(0, b.ry, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, color.setHex(b.color));
  });
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  scene.add(bodies);

  // Roofs: a thin slab on top, coloured by style.
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, buildings.length);
  buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h + 0.15, b.z);
    dummy.rotation.set(0, b.ry, 0);
    dummy.scale.set(b.w * 1.04, 0.3, b.d * 1.04);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    roofs.setColorAt(i, color.setHex(ROOF_COLORS[b.style] || 0x4a4a52));
  });
  roofs.instanceMatrix.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  scene.add(roofs);

  // Rooftop AC units: small grey boxes on about a third of the roofs, so the
  // skyline has detail when seen from above (title orbit, heli shots).
  const acList = buildings.filter((b) => hash2(Math.round(b.x), Math.round(b.z), city.seed + 7) < 0.35);
  const acGeo = new THREE.BoxGeometry(1.4, 0.9, 1.4);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x777780 });
  const acs = new THREE.InstancedMesh(acGeo, acMat, Math.max(1, acList.length));
  acList.forEach((b, i) => {
    dummy.position.set(b.x + b.w * 0.2, b.h + 0.75, b.z - b.d * 0.2);
    dummy.rotation.set(0, b.ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    acs.setMatrixAt(i, dummy.matrix);
  });
  acs.instanceMatrix.needsUpdate = true;
  // Hide the unused slot when no building got an AC unit: an uninitialised
  // instance matrix would otherwise park a grey box at the world origin.
  acs.count = acList.length;
  scene.add(acs);

  // Windows: quads on the two long faces of each building. A window is lit
  // warm with probability 0.42 (hash2, so it never flickers between loads).
  // litFlags remembers which are lit so setNight() can brighten only those.
  const winGeo = new THREE.PlaneGeometry(1.5, 1.1);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const windows = new THREE.InstancedMesh(winGeo, winMat, MAX_WINDOWS);
  const litFlags = new Uint8Array(MAX_WINDOWS);
  let winCount = 0;
  const litColor = new THREE.Color(WINDOW_LIT);
  const litNight = new THREE.Color(0xffc860).multiplyScalar(1.5);
  const darkColor = new THREE.Color(0x2a3550);
  const darkNight = new THREE.Color(0x1a2238);
  // One place that knows a window's colour: lit windows glow warm (brighter
  // at night), dark windows are deep glass. Used by the build loop and by
  // setNight() alike, so the two can never drift apart.
  function windowColor(lit, night, out) {
    if (lit) return out.copy(litColor).lerp(litNight, night);
    return out.copy(darkColor).lerp(darkNight, night);
  }
  for (const b of buildings) {
    if (winCount >= MAX_WINDOWS) break; // cap reached: stop scanning floors
    const bays = Math.max(1, Math.floor(b.w / 4));
    const floorH = b.h / b.floors;
    for (let fl = 0; fl < b.floors; fl++) {
      const y = 2 + fl * floorH + floorH * 0.3;
      if (y > b.h - 1) break;
      for (let bay = 0; bay < bays; bay++) {
        const along = -b.w / 2 + (bay + 0.5) * (b.w / bays);
        for (const face of [1, -1]) {
          if (winCount >= MAX_WINDOWS) break;
          const lit = hash2(Math.round(b.x) + bay * 7, Math.round(b.z) + fl * 13 + (face > 0 ? 1 : 2), city.seed) < 0.42;
          // Face offset in local space, rotated by the building's yaw.
          const lx = along;
          const lz = face * (b.d / 2 + 0.06);
          const cos = Math.cos(b.ry);
          const sin = Math.sin(b.ry);
          dummy.position.set(b.x + lx * cos + lz * sin, y, b.z - lx * sin + lz * cos);
          dummy.rotation.set(0, b.ry + (face > 0 ? 0 : Math.PI), 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          windows.setMatrixAt(winCount, dummy.matrix);
          windows.setColorAt(winCount, windowColor(lit, 0, color));
          litFlags[winCount] = lit ? 1 : 0;
          winCount++;
        }
      }
    }
  }
  windows.count = winCount;
  windows.instanceMatrix.needsUpdate = true;
  if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
  scene.add(windows);

  // Fortuna Tower: antenna + blinking beacon on top.
  const tower = city.landmarks.tower;
  const towerBuilding = buildings.find((b) => b.landmark === 'tower');
  const towerH = towerBuilding ? towerBuilding.h : 120;
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 18, 6),
    new THREE.MeshLambertMaterial({ color: 0x333333 }),
  );
  antenna.position.set(tower.x, towerH + 9, tower.z);
  scene.add(antenna);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), beaconMat);
  beacon.position.set(tower.x, towerH + 18.5, tower.z);
  scene.add(beacon);

  let nightLevel = 0;
  const tmpColor = new THREE.Color();

  return {
    windowCount: winCount,
    buildingCount: buildings.length,
    // Brighten lit windows as night falls (level 0 = day, 1 = full night).
    // Only runs when the level actually changes — recolouring ~30k
    // instances every frame would be wasteful.
    setNight(level) {
      const clamped = Math.max(0, Math.min(1, level));
      if (Math.abs(clamped - nightLevel) < 0.02) return;
      nightLevel = clamped;
      for (let i = 0; i < winCount; i++) {
        windows.setColorAt(i, windowColor(litFlags[i] === 1, clamped, tmpColor));
      }
      if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    },
    // The beacon blinks at 1.4 Hz.
    update(t) {
      beacon.visible = Math.sin(t * Math.PI * 2 * 1.4) > -0.2;
    },
  };
}
