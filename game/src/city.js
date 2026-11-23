// The city itself: a seeded grid of streets and blocks on a square island.
// Roads run north-south and east-west every CITY.block metres; the cells
// between them are buildable blocks. Everything other modules need to know
// about the map — where the roads are, where a random road point is, which
// district a position sits in — comes from here. The ground, sea and beach
// wear the painted textures from textures.js (created before the city).

import * as THREE from 'three';
import { CITY } from './config.js';

/**
 * Create the city for world G. Builds the ground, the sea ring, the beach and
 * the street surfaces, and returns the map API:
 * - roads: [{ axis: 'x'|'z', at: number }] — the centrelines
 * - blocks: [{ x0, z0, x1, z1, cx, cz, district }] — buildable cells
 * - nearestRoad(x, z) — the closest point on any road centreline
 * - isRoad(x, z) — true when the point is on asphalt
 * - randomRoadPoint(rng) — a random point on a random road
 * - districtAt(x, z) — the district name for a position
 * - bounds — the island's half-size
 */
export function createCity(G) {
  const half = CITY.size / 2;
  const roadLines = [];
  for (let at = -half; at <= half; at += CITY.block) roadLines.push(at);

  const roads = [];
  for (const at of roadLines) {
    roads.push({ axis: 'x', at });
    roads.push({ axis: 'z', at });
  }

  const blocks = [];
  const lot = CITY.block - CITY.roadWidth;
  for (let ix = 0; ix < roadLines.length - 1; ix += 1) {
    for (let iz = 0; iz < roadLines.length - 1; iz += 1) {
      const x0 = roadLines[ix] + CITY.roadWidth / 2;
      const z0 = roadLines[iz] + CITY.roadWidth / 2;
      blocks.push({
        x0,
        z0,
        x1: x0 + lot,
        z1: z0 + lot,
        cx: x0 + lot / 2,
        cz: z0 + lot / 2,
        district: districtAt(x0 + lot / 2, z0 + lot / 2),
      });
    }
  }

  function nearestRoad(x, z) {
    let bestX = roadLines[0];
    let bestZ = roadLines[0];
    for (const line of roadLines) {
      if (Math.abs(x - line) < Math.abs(x - bestX)) bestX = line;
      if (Math.abs(z - line) < Math.abs(z - bestZ)) bestZ = line;
    }
    if (Math.abs(x - bestX) <= Math.abs(z - bestZ)) return { x: bestX, z };
    return { x, z: bestZ };
  }

  function isRoad(x, z) {
    const halfRoad = CITY.roadWidth / 2;
    for (const line of roadLines) {
      if (Math.abs(x - line) <= halfRoad || Math.abs(z - line) <= halfRoad) return true;
    }
    return false;
  }

  function randomRoadPoint(rng) {
    const road = rng.pick(roads);
    const along = rng.range(-half + 20, half - 20);
    if (road.axis === 'x') return { x: road.at, z: along };
    return { x: along, z: road.at };
  }

  function districtAt(x, z) {
    if (z > CITY.beachZ - 60) return 'Marina';
    if (x > half - 120) return 'Harbor East';
    if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'Downtown';
    if (x < -half + 120 && z < 0) return 'Old Port';
    if (z < -half + 120) return 'North Hills';
    return 'The Strip';
  }

  // Ground: a dirt-coloured base plane for the island, a textured sea plane
  // beyond it, and a textured sand strip for the beach.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 80, CITY.size + 80),
    new THREE.MeshLambertMaterial({ color: 0x55504a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  G.scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size * 4, CITY.size * 4),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: G.textures.water }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = CITY.waterLevel;
  G.scene.add(sea);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 80, 70),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: G.textures.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, half + 18);
  G.scene.add(sand);

  // The street surfaces: one plane per road, just above the ground, wearing
  // the dashed asphalt texture. A shared material keeps draw calls low.
  const streetMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: G.textures.asphalt });
  for (const road of roads) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size, CITY.roadWidth), streetMat);
    plane.rotation.x = -Math.PI / 2;
    if (road.axis === 'x') {
      plane.position.set(road.at, 0.02, 0);
      plane.rotation.z = Math.PI / 2;
    } else {
      plane.position.set(0, 0.02, road.at);
    }
    G.scene.add(plane);
  }

  return {
    roads,
    blocks,
    roadLines,
    bounds: half,
    nearestRoad,
    isRoad,
    randomRoadPoint,
    districtAt,
  };
}
