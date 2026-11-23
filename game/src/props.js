// Props for Fortuna Bay v2 — trees, lamps, containers, cranes, boats, beach
// umbrellas, billboards, neon signs, the lighthouse. Instanced where there
// are many; individual meshes only for the few landmarks. v2 adds: two
// helipads (Harbour + Marina), the Ocean Plaza fountain, and destructible
// street furniture — hydrants, lamps and trees can be knocked down by a
// speeding car (hydrants open a geyser) and respawn after 20 s.
import * as THREE from 'three';
import { HALF } from './config.js';
import { makeBillboardTexture, makeNeonTexture } from './textures.js';

const CONTAINER_COLORS = [0xc84444, 0x4488c8, 0x44a868, 0xd8a83c, 0x8855aa];
const UMBRELLA_COLORS = [0xe84a4a, 0x4a90e8, 0xf0c040, 0x4ae88a, 0xe84ad0, 0xffffff];
const RESPAWN_SECONDS = 20;

export function createProps(scene, city, rng) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Destructible registry: every knockable prop keeps its standing matrix,
  // its collider (to disable while down), and a respawn timer.
  const destructibles = []; // { kind, index, x, z, collider, down, timer }
  function registerDestructible(kind, index, x, z, collider) {
    const entry = { kind, index, x, z, collider, down: false, timer: 0 };
    destructibles.push(entry);
    return entry;
  }

  // ---- Trees: trunks + canopies (palms get a taller, slimmer canopy) ----
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 3, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.trees.length);
  trunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const canopyGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, city.trees.length);
  canopies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const treeStanding = []; // per-tree { trunk: Matrix4, canopy: Matrix4 }
  city.trees.forEach((t, i) => {
    const yaw = rng.next() * Math.PI;
    dummy.position.set(t.x, 1.5 * t.s, t.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(t.s, t.s, t.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const trunkMat4 = dummy.matrix.clone();
    dummy.position.set(t.x, (t.palm ? 3.6 : 3.1) * t.s, t.z);
    dummy.scale.set(t.s * (t.palm ? 0.8 : 1.1), t.s * (t.palm ? 1.1 : 0.75), t.s * (t.palm ? 0.8 : 1.1));
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    canopies.setColorAt(i, color.setHex(t.palm ? 0x2a8a4a : 0x3a7a3a));
    treeStanding.push({ trunk: trunkMat4, canopy: dummy.matrix.clone() });
    registerDestructible('tree', i, t.x, t.z, city.colliderAt(t.x, t.z));
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  scene.add(trunks);
  scene.add(canopies);

  // ---- Lamps: poles + warm glowing heads ----
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  poles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const lampStanding = [];
  city.lamps.forEach((l, i) => {
    dummy.position.set(l.x, 2.5, l.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    const poleMat4 = dummy.matrix.clone();
    dummy.position.set(l.x, 5.1, l.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    lampStanding.push({ pole: poleMat4, head: dummy.matrix.clone() });
    registerDestructible('lamp', i, l.x, l.z, city.colliderAt(l.x, l.z));
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // ---- Hydrants (v2): red bodies that burst into a geyser when smashed ----
  const hydGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc83232 });
  const hydrants = new THREE.InstancedMesh(hydGeo, hydMat, Math.max(1, city.hydrants.length));
  hydrants.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const hydStanding = [];
  city.hydrants.forEach((h, i) => {
    dummy.position.set(h.x, 0.4, h.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    hydrants.setMatrixAt(i, dummy.matrix);
    hydStanding.push(dummy.matrix.clone());
    registerDestructible('hydrant', i, h.x, h.z, h.collider);
  });
  hydrants.instanceMatrix.needsUpdate = true;
  scene.add(hydrants);

  // ---- Helipads (v2): dark disc, yellow ring, white H, edge lights ----
  const padEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  for (const pad of city.helipads) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(pad.radius, 32),
      new THREE.MeshLambertMaterial({ color: 0x2a2a30 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pad.x, 0.06, pad.z);
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(pad.radius - 0.6, pad.radius, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc22, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pad.x, 0.08, pad.z);
    scene.add(ring);
    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const dx of [-2.2, 2.2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 6), hMat);
      bar.position.set(pad.x + dx, 0.09, pad.z);
      scene.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.08, 0.9), hMat);
    cross.position.set(pad.x, 0.09, pad.z);
    scene.add(cross);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), padEdgeMat);
      light.position.set(pad.x + Math.cos(a) * pad.radius, 0.25, pad.z + Math.sin(a) * pad.radius);
      scene.add(light);
    }
  }

  // ---- Ocean Plaza fountain (v2): stone ring, water disc, centre column ----
  const plaza = city.plaza;
  const fountainRing = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.5, 8, 32),
    new THREE.MeshLambertMaterial({ color: 0x9a8a70 }),
  );
  fountainRing.rotation.x = Math.PI / 2;
  fountainRing.position.set(plaza.x, 0.5, plaza.z);
  scene.add(fountainRing);
  const fountainWater = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 32),
    new THREE.MeshLambertMaterial({ color: 0x4aa8d8 }),
  );
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(plaza.x, 0.35, plaza.z);
  scene.add(fountainWater);
  const fountainColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 2.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a8a70 }),
  );
  fountainColumn.position.set(plaza.x, 1.1, plaza.z);
  scene.add(fountainColumn);
  const fountainTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0x7ab8d8 }),
  );
  fountainTop.position.set(plaza.x, 2.5, plaza.z);
  scene.add(fountainTop);

  // ---- Port containers: stacked boxes in the port yard ----
  const containerSpots = [];
  for (let gx = 0; gx < 10; gx++) {
    for (let gz = 0; gz < 9; gz++) {
      if (rng.chance(0.3)) continue;
      const stack = 1 + Math.floor(rng.next() * 3);
      for (let s = 0; s < stack; s++) {
        containerSpots.push({ x: 288 + gx * 8.4, z: -140 + gz * 8, y: 1.3 + s * 2.6 });
      }
    }
  }
  const contGeo = new THREE.BoxGeometry(6, 2.6, 2.4);
  const contMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const containers = new THREE.InstancedMesh(contGeo, contMat, containerSpots.length);
  containerSpots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    containers.setMatrixAt(i, dummy.matrix);
    containers.setColorAt(i, color.setHex(CONTAINER_COLORS[i % CONTAINER_COLORS.length]));
  });
  containers.instanceMatrix.needsUpdate = true;
  if (containers.instanceColor) containers.instanceColor.needsUpdate = true;
  scene.add(containers);

  // ---- Port cranes (colliders live in city.js at the same spots) ----
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a83c });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  for (let k = 0; k < 3; k++) {
    const crane = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2, 30, 2), craneMat);
    tower.position.y = 15;
    crane.add(tower);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 1.5, 1.5), craneMat);
    jib.position.set(6, 30, 0);
    crane.add(jib);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12, 4), darkMat);
    cable.position.set(16, 24, 0);
    crane.add(cable);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.5), darkMat);
    hook.position.set(16, 18, 0);
    crane.add(hook);
    crane.position.set(300 + k * 40, 0, -140);
    crane.rotation.y = k * 0.4;
    scene.add(crane);
  }

  // ---- Boats bobbing in the sea south of the beach ----
  const boats = [];
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x4a90c8 });
  for (let i = 0; i < 12; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 1.8), i % 2 === 0 ? hullMat : hullMat2);
    hull.position.y = 0.2;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.4), hullMat);
    cabin.position.set(-0.5, 0.9, 0);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 4), darkMat);
    mast.position.set(0.8, 2, 0);
    boat.add(mast);
    boat.position.set(-385 + i * 70, -0.3, HALF + 26 + (i % 3) * 12);
    boat.rotation.y = rng.next() * Math.PI * 2;
    scene.add(boat);
    boats.push({ group: boat, phase: rng.next() * Math.PI * 2, baseY: -0.3 });
  }

  // ---- Beach umbrellas ----
  const umbPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4);
  const umbPoleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const umbTopGeo = new THREE.ConeGeometry(1.8, 0.8, 8);
  const umbTopMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const umbCount = 36;
  const umbPoles = new THREE.InstancedMesh(umbPoleGeo, umbPoleMat, umbCount);
  const umbTops = new THREE.InstancedMesh(umbTopGeo, umbTopMat, umbCount);
  for (let i = 0; i < umbCount; i++) {
    const col = i % 9;
    const row = Math.floor(i / 9);
    const x = -350 + col * 87 + rng.range(-8, 8);
    const z = HALF + 18 + row * 8 + rng.range(-2, 2);
    dummy.position.set(x, 1.1, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    umbPoles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2.4, z);
    dummy.updateMatrix();
    umbTops.setMatrixAt(i, dummy.matrix);
    umbTops.setColorAt(i, color.setHex(UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]));
  }
  umbPoles.instanceMatrix.needsUpdate = true;
  umbTops.instanceMatrix.needsUpdate = true;
  if (umbTops.instanceColor) umbTops.instanceColor.needsUpdate = true;
  scene.add(umbPoles);
  scene.add(umbTops);

  // ---- Billboards ----
  const billboards = [
    { x: 108, z: -108, ry: Math.PI / 4, line1: 'FORTUNA BAY', line2: 'VISIT ISLA FORTUNA', bg: '#1a4a7a' },
    { x: -162, z: 200, ry: -Math.PI / 4, line1: 'CASINO FORTUNA', line2: 'WIN BIG TONIGHT', bg: '#7a1a2a' },
    { x: 200, z: 300, ry: Math.PI / 2, line1: 'IRONWORKS GUNS', line2: 'PROTECT YOURSELF', bg: '#2a2a2a' },
  ];
  for (const b of billboards) {
    const tex = makeBillboardTexture(THREE, b.line1, b.line2, b.bg);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 6),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    board.position.set(b.x, 7, b.z);
    board.rotation.y = b.ry;
    scene.add(board);
    for (const dx of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), darkMat);
      post.position.set(b.x + dx * Math.cos(b.ry), 2, b.z - dx * Math.sin(b.ry));
      scene.add(post);
    }
  }

  // ---- Neon signs on the casino, the gunshop and the hospital ----
  const neonDefs = [
    { key: 'casino', text: 'FORTUNA', color: '#ff44aa' },
    { key: 'gunshop', text: 'GUNS', color: '#44ff88' },
    { key: 'hospital', text: 'HOSPITAL', color: '#44aaff' },
  ];
  for (const def of neonDefs) {
    const building = city.buildings.find((b) => b.landmark === def.key);
    if (!building) continue;
    const tex = makeNeonTexture(THREE, def.text, def.color);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(building.x, Math.min(5, building.h - 1), building.z + building.d / 2 + 0.3);
    scene.add(sign);
  }

  // ---- Lighthouse: white tower, red top, rotating beam ----
  const lh = city.landmarks.lighthouse;
  const towerMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 3, 24, 10),
    new THREE.MeshLambertMaterial({ color: 0xf0ede0 }),
  );
  towerMesh.position.set(lh.x, 12, lh.z);
  scene.add(towerMesh);
  const topBand = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.1, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0xc84444 }),
  );
  topBand.position.set(lh.x, 21, lh.z);
  scene.add(topBand);
  const lampRoom = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  lampRoom.position.set(lh.x, 25.5, lh.z);
  scene.add(lampRoom);
  const beamGeo = new THREE.ConeGeometry(5, 60, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // The beam hangs off a pivot at the lamp room so update() can sweep it.
  // The cone's apex sits at the pivot, its base 60 m out.
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.z = -Math.PI / 2; // point the cone sideways
  beam.translateY(30);
  const beamPivot = new THREE.Group();
  beamPivot.position.set(lh.x, 25.5, lh.z);
  beamPivot.add(beam);
  scene.add(beamPivot);

  // Fallen pose: tip the prop over in a random direction, lying near the
  // ground. The fall direction is seeded from the prop's position so a
  // reload shows the same wreck.
  function fallMatrix(x, z, height, scale) {
    const a = hashAngle(x, z);
    dummy.position.set(x + Math.cos(a) * height * 0.4, 0.3 * scale, z + Math.sin(a) * height * 0.4);
    dummy.rotation.set(0, -a, Math.PI / 2 * 0.92);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }

  function knockOne(entry) {
    entry.down = true;
    entry.timer = RESPAWN_SECONDS;
    if (entry.collider) entry.collider.disabled = true;
    if (entry.kind === 'tree') {
      const t = city.trees[entry.index];
      trunks.setMatrixAt(entry.index, fallMatrix(entry.x, entry.z, 3 * t.s, t.s));
      dummy.position.set(entry.x + 2, 0.5, entry.z + 1);
      dummy.rotation.set(0.4, 0, 0.9);
      dummy.scale.set(t.s, t.s * 0.6, t.s);
      dummy.updateMatrix();
      canopies.setMatrixAt(entry.index, dummy.matrix);
      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
    } else if (entry.kind === 'lamp') {
      poles.setMatrixAt(entry.index, fallMatrix(entry.x, entry.z, 5, 1));
      dummy.position.set(entry.x + 2.5, 0.35, entry.z + 1);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(entry.index, dummy.matrix);
      poles.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    } else if (entry.kind === 'hydrant') {
      // The hydrant shears off at the base: flatten it into the ground.
      dummy.position.set(entry.x, 0.05, entry.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.15, 1);
      dummy.updateMatrix();
      hydrants.setMatrixAt(entry.index, dummy.matrix);
      hydrants.instanceMatrix.needsUpdate = true;
    }
  }

  function restoreOne(entry) {
    entry.down = false;
    entry.timer = 0;
    if (entry.collider) entry.collider.disabled = false;
    if (entry.kind === 'tree') {
      trunks.setMatrixAt(entry.index, treeStanding[entry.index].trunk);
      canopies.setMatrixAt(entry.index, treeStanding[entry.index].canopy);
      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
    } else if (entry.kind === 'lamp') {
      poles.setMatrixAt(entry.index, lampStanding[entry.index].pole);
      heads.setMatrixAt(entry.index, lampStanding[entry.index].head);
      poles.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    } else if (entry.kind === 'hydrant') {
      hydrants.setMatrixAt(entry.index, hydStanding[entry.index]);
      hydrants.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    // Knock down every standing destructible within radius of (x, z).
    // Returns the list of newly knocked props so the caller can spawn
    // effects (a hydrant geyser, sparks, sound).
    knockAt(x, z, radius) {
      const knocked = [];
      const r2 = radius * radius;
      for (const entry of destructibles) {
        if (entry.down) continue;
        const dx = entry.x - x;
        const dz = entry.z - z;
        if (dx * dx + dz * dz > r2) continue;
        knockOne(entry);
        knocked.push({ type: entry.kind, x: entry.x, z: entry.z });
      }
      return knocked;
    },
    // How many props are currently knocked down — the systems test uses
    // this to assert knock + respawn without reading private state, and
    // qa.py surfaces it through the __systemsTest checks.
    downCount() {
      let n = 0;
      for (const entry of destructibles) if (entry.down) n++;
      return n;
    },
    // Boats bob, the lighthouse beam sweeps at 0.5 rad/s, knocked props
    // respawn after 20 s. dt defaults to one frame when the caller only
    // passes the clock (backwards compatible with the v1 call).
    update(t, dt = 0.016) {
      for (const b of boats) {
        b.group.position.y = b.baseY + Math.sin(t * 0.8 + b.phase) * 0.15;
        b.group.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.03;
      }
      beamPivot.rotation.y = t * 0.5;
      for (const entry of destructibles) {
        if (!entry.down) continue;
        entry.timer -= dt;
        if (entry.timer <= 0) restoreOne(entry);
      }
    },
  };
}

// A stable pseudo-random angle from a position (0..2π).
function hashAngle(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}
