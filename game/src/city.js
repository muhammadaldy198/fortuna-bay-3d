// City data for Fortuna Bay — generated from one seed, deterministic.
// Blocks, buildings, colliders, landmarks, spawn points, packages, race
// route. Rendering lives in buildings.js / props.js; this file is pure data.
// Collision is AABB for buildings and circles for trees, lamps and cranes.
import { BLOCK, GRID, HALF, PITCH, ROAD, blockCenter, districtAt, roadLine } from './config.js';
import { createRandom, hash2 } from './random.js';

// Nothing may leave this radius from the island centre (the ground plane is
// 1120 m wide, so 540 keeps the player on sand, not swimming).
export const ISLAND_LIMIT = 540;

// Landmark blocks: [blockI, blockJ, key, name, w, d, h, floors, color, style].
// The lighthouse and the beach are not blocks — they live outside the grid.
const LANDMARK_BLOCKS = [
  [6, 5, 'tower', 'Fortuna Tower', 24, 24, 120, 34, 0x7a9cc8, 'glass'],
  [7, 12, 'casino', 'Casino Fortuna', 26, 20, 14, 3, 0xd8b060, 'casino'],
  [3, 11, 'safehouse', 'Safehouse', 14, 12, 8, 2, 0xe8d8b8, 'villa'],
  [9, 8, 'gunshop', 'Ironworks Guns', 12, 10, 7, 1, 0x8a7a6a, 'shop'],
  [5, 5, 'police', 'FBPD Headquarters', 20, 16, 18, 5, 0x9ab0c8, 'civic'],
  [10, 6, 'hospital', 'Fortuna General', 18, 16, 16, 4, 0xf0f0e8, 'civic'],
  [12, 6, 'port', 'Port Fortuna', 28, 20, 10, 1, 0x98a8a8, 'ware'],
  [1, 12, 'marina', 'Marina Club', 14, 12, 10, 2, 0xa8c8b8, 'pastel'],
];

// Building size ranges per district style: [minW, maxW, minH, maxH, cells].
// Cells are the 2x2 slots inside a block (offsets ±9 m); warehouses take the
// whole block instead.
const STYLE_SIZES = {
  villa: [8, 13, 6, 10, 4],
  glass: [14, 20, 30, 80, 2],
  terra: [8, 11, 9, 16, 4],
  pastel: [10, 16, 12, 30, 3],
  ware: [18, 28, 8, 12, 1],
  mid: [10, 16, 15, 30, 3],
  casino: [26, 26, 14, 14, 1],
  shop: [12, 12, 7, 7, 1],
  civic: [18, 20, 16, 18, 1],
};

const SLOT_OFFSETS = [[-9, -9], [9, -9], [-9, 9], [9, 9]];

export function createCity(seed) {
  const rng = createRandom(seed);
  const blocks = [];
  const buildings = [];
  const colliders = []; // { x, z, hw, hd } boxes or { x, z, r } circles
  const trees = [];
  const lamps = [];

  const landmarkAt = new Map();
  for (const [i, j, key] of LANDMARK_BLOCKS) landmarkAt.set(`${i},${j}`, key);

  function addBuilding(x, z, w, d, h, floors, color, style, landmark = null) {
    const b = { x, z, w, d, h, floors, color, style, ry: hash2(Math.round(x), Math.round(z), seed) < 0.5 ? 0 : Math.PI / 2, landmark };
    buildings.push(b);
    // A rotated building swaps its footprint for collision purposes.
    const rotated = b.ry !== 0;
    colliders.push({ x, z, hw: (rotated ? d : w) / 2, hd: (rotated ? w : d) / 2 });
    return b;
  }

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const district = districtAt(i, j);
      const [cx, cz] = blockCenter(i, j);
      blocks.push({ i, j, x: cx, z: cz, district: district.name, style: district.style });
      const landmarkKey = landmarkAt.get(`${i},${j}`);
      if (landmarkKey) {
        const [, , , , w, d, h, floors, color, style] = LANDMARK_BLOCKS.find((l) => l[2] === landmarkKey);
        addBuilding(cx, cz, w, d, h, floors, color, style, landmarkKey);
        continue;
      }
      const [minW, maxW, minH, maxH, cells] = STYLE_SIZES[district.style] || STYLE_SIZES.mid;
      const slots = cells === 1 ? [[0, 0]] : SLOT_OFFSETS.slice(0, cells);
      for (const [ox, oz] of slots) {
        if (rng.chance(0.15)) continue; // an empty lot now and then
        const w = rng.range(minW, maxW);
        const d = rng.range(minW, maxW);
        const h = rng.range(minH, maxH);
        const floors = Math.max(1, Math.min(district.maxFloors, Math.round(h / 3.4)));
        const tone = rng.range(0.85, 1.1);
        const color = shadeInt(district.color, tone);
        addBuilding(cx + ox + rng.range(-2, 2), cz + oz + rng.range(-2, 2), w, d, h, floors, color, district.style);
      }
      // Trees on the sidewalk ring around the block.
      const treeCount = rng.int(0, 2);
      for (let t = 0; t < treeCount; t++) {
        const side = rng.int(0, 3);
        const along = rng.range(-BLOCK / 2, BLOCK / 2);
        const off = BLOCK / 2 + 1.5;
        let tx = cx;
        let tz = cz;
        if (side === 0) { tx += along; tz -= off; }
        if (side === 1) { tx += along; tz += off; }
        if (side === 2) { tx -= off; tz += along; }
        if (side === 3) { tx += off; tz += along; }
        trees.push({ x: tx, z: tz, s: rng.range(0.8, 1.3), palm: hash2(Math.round(tx), Math.round(tz), seed) < 0.6 });
        colliders.push({ x: tx, z: tz, r: 0.4 });
      }
    }
  }

  // Lamps at every other intersection.
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = roadLine(i) + ROAD / 2 + 1.5;
      const z = roadLine(j) + ROAD / 2 + 1.5;
      lamps.push({ x, z });
      colliders.push({ x, z, r: 0.3 });
    }
  }

  // Boardwalk palms: a row of tall palms along the beachfront promenade
  // (visible from the malecón in the city screenshot).
  for (let x = -HALF + 20; x <= HALF - 20; x += 18) {
    const px = x + rng.range(-2, 2);
    const pz = HALF + 8;
    trees.push({ x: px, z: pz, s: rng.range(1.2, 1.5), palm: true });
    colliders.push({ x: px, z: pz, r: 0.4 });
  }

  // Landmarks: the named places missions, the minimap and the HUD refer to.
  const landmarks = {};
  for (const [i, j, key, name] of LANDMARK_BLOCKS) {
    const [x, z] = blockCenter(i, j);
    landmarks[key] = { x, z, name };
  }
  landmarks.lighthouse = { x: -HALF - 60, z: HALF + 40, name: 'Isla Light' };
  landmarks.beach = { x: 0, z: HALF + 30, name: 'Fortuna Beach' };
  colliders.push({ x: landmarks.lighthouse.x, z: landmarks.lighthouse.z, r: 4 });
  // Port cranes (props.js builds them at the same spots).
  for (let k = 0; k < 3; k++) {
    colliders.push({ x: 300 + k * 40, z: -140, r: 3 });
  }

  // 10 hidden packages: near landmarks and at the city corners.
  const packageSpots = [
    [landmarks.tower.x + 16, landmarks.tower.z + 16],
    [landmarks.casino.x - 18, landmarks.casino.z - 18],
    [landmarks.safehouse.x + 14, landmarks.safehouse.z],
    [landmarks.gunshop.x, landmarks.gunshop.z + 14],
    [landmarks.police.x - 16, landmarks.police.z + 16],
    [landmarks.hospital.x + 16, landmarks.hospital.z - 16],
    [landmarks.port.x - 20, landmarks.port.z + 20],
    [landmarks.marina.x, landmarks.marina.z - 18],
    [landmarks.lighthouse.x + 12, landmarks.lighthouse.z - 12],
    [-HALF + 30, -HALF + 30],
  ];
  const packages = packageSpots.map(([x, z], id) => ({ id, x, z }));

  // Race route: an 8-checkpoint loop around the mid-city roads.
  const race = {
    checkpoints: [
      [162, 0], [162, 162], [0, 162], [-162, 162],
      [-162, 0], [-162, -162], [0, -162], [162, -162],
    ],
  };

  // Jump ramps: beach, port, hills.
  const ramps = [
    { x: 120, z: HALF + 20, ry: 0 },
    { x: 320, z: -60, ry: Math.PI / 2 },
    { x: -200, z: -HALF + 40, ry: Math.PI },
  ];

  // Push a circle (x, z, radius r) out of every collider it overlaps, then
  // clamp it to the island. Returns the corrected [x, z].
  function collideCircle(x, z, r) {
    for (const c of colliders) {
      if (c.r !== undefined) {
        const dx = x - c.x;
        const dz = z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = r + c.r;
        if (dist < min && dist > 0.0001) {
          x = c.x + (dx / dist) * min;
          z = c.z + (dz / dist) * min;
        }
      } else {
        const nx = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw));
        const nz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
        const dx = x - nx;
        const dz = z - nz;
        const dist = Math.hypot(dx, dz);
        if (dist < r) {
          if (dist > 0.0001) {
            x = nx + (dx / dist) * r;
            z = nz + (dz / dist) * r;
          } else {
            // Centre inside the box: push out along the smallest penetration.
            const px = c.hw + r - Math.abs(x - c.x);
            const pz = c.hd + r - Math.abs(z - c.z);
            if (px < pz) x = c.x + (x >= c.x ? c.hw + r : -c.hw - r);
            else z = c.z + (z >= c.z ? c.hd + r : -c.hd - r);
          }
        }
      }
    }
    const d = Math.hypot(x, z);
    if (d > ISLAND_LIMIT) {
      x = (x / d) * ISLAND_LIMIT;
      z = (z / d) * ISLAND_LIMIT;
    }
    return [x, z];
  }

  // True when (x, z) is on a road: within half a road width of a road line
  // in either axis.
  function isOnRoad(x, z) {
    const rx = Math.abs(x - nearestRoadLine(x));
    const rz = Math.abs(z - nearestRoadLine(z));
    return rx < ROAD / 2 || rz < ROAD / 2;
  }

  function nearestRoadLine(v) {
    return Math.round(v / PITCH + GRID / 2) * PITCH - HALF;
  }

  function randomRoadPoint(rngStream) {
    const k = rngStream.int(0, GRID);
    const t = rngStream.range(-HALF + 20, HALF - 20);
    return rngStream.chance(0.5) ? [roadLine(k), t] : [t, roadLine(k)];
  }

  function randomSidewalkPoint(rngStream) {
    const i = rngStream.int(0, GRID - 1);
    const j = rngStream.int(0, GRID - 1);
    const [cx, cz] = blockCenter(i, j);
    const side = rngStream.int(0, 3);
    const along = rngStream.range(-BLOCK / 2, BLOCK / 2);
    const off = BLOCK / 2 + 1.5;
    if (side === 0) return [cx + along, cz - off];
    if (side === 1) return [cx + along, cz + off];
    if (side === 2) return [cx - off, cz + along];
    return [cx + off, cz + along];
  }

  // Line of sight: true when the segment between two points crosses no
  // building footprint. Sampled every 2 m against the building AABBs, so
  // enemies (and cops) can't shoot the player through a tower.
  function hasLineOfSight(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      for (const b of buildings) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return false;
      }
    }
    return true;
  }

  return {
    seed, blocks, buildings, colliders, trees, lamps, landmarks, packages, race, ramps,
    collideCircle, isOnRoad, randomRoadPoint, randomSidewalkPoint, hasLineOfSight,
  };
}

// Multiply a hex colour's channels by f (clamped to 255).
function shadeInt(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
