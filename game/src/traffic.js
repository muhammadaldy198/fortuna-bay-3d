// Ambient traffic: cars that drive the city's roads, turn at intersections,
// brake for whatever is ahead, and respawn near the player when they drift
// too far away. They keep the streets alive without ever leaving the asphalt.

import { POPULATION } from './config.js';

const TRAFFIC_MODELS = ['sedan', 'sedan', 'coupe', 'suv', 'taxi', 'truck'];

/**
 * Create the traffic system for world G. Returns { cars, update(dt) }.
 * Each traffic car owns a road (axis + line) and a direction; at the end of
 * its road it turns onto a perpendicular one. Cars slow for the car or the
 * player ahead of them.
 */
export function createTraffic(G) {
  const cars = [];
  const rng = G.rng.fork(404);

  function pickRoad() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const at = rng.pick(G.city.roadLines);
    return { axis, at, dir: rng.chance(0.5) ? 1 : -1 };
  }

  function spawnCar() {
    const road = pickRoad();
    const half = G.city.bounds - 30;
    const along = rng.range(-half, half);
    const x = road.axis === 'x' ? road.at + 3.5 : along;
    const z = road.axis === 'x' ? along : road.at + 3.5;
    const heading = road.axis === 'x' ? (road.dir > 0 ? 0 : Math.PI) : (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = G.vehicles.createCar(rng.pick(TRAFFIC_MODELS), x, z, heading);
    car.collide = false;
    const entry = { car, road, speed: rng.range(8, POPULATION.trafficSpeed) };
    cars.push(entry);
    return entry;
  }

  for (let i = 0; i < POPULATION.trafficCars; i += 1) spawnCar();

  function aheadClear(entry, distance) {
    const car = entry.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const px = car.pos.x + fx * distance;
    const pz = car.pos.z + fz * distance;
    // The player (on foot or in a car) blocks the lane.
    const pdx = G.player.pos.x - car.pos.x;
    const pdz = G.player.pos.z - car.pos.z;
    const ahead = pdx * fx + pdz * fz;
    if (ahead > 0 && ahead < distance + 3 && Math.abs(pdx * fz - pdz * fx) < 3.5) return false;
    // Another traffic car blocks the lane.
    for (const other of cars) {
      if (other === entry) continue;
      const dx = other.car.pos.x - car.pos.x;
      const dz = other.car.pos.z - car.pos.z;
      const a = dx * fx + dz * fz;
      if (a > 0 && a < distance + 4 && Math.abs(dx * fz - dz * fx) < 3.5) return false;
    }
    return true;
  }

  function update(dt) {
    const half = G.city.bounds - 20;
    for (const entry of cars) {
      const car = entry.car;
      const road = entry.road;
      // Steer back onto the road line and along it.
      const targetHeading = road.axis === 'x'
        ? (road.dir > 0 ? 0 : Math.PI)
        : (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2));
      const clear = aheadClear(entry, 12);
      const throttle = clear ? 0.55 : -0.6;
      G.vehicles.drive(car, throttle, steer, dt);
      // At the road's end, turn onto a perpendicular road.
      const along = road.axis === 'x' ? car.pos.z : car.pos.x;
      if ((road.dir > 0 && along > half) || (road.dir < 0 && along < -half)) {
        const cross = G.city.nearestRoad(car.pos.x, car.pos.z);
        road.axis = road.axis === 'x' ? 'z' : 'x';
        road.at = road.axis === 'x' ? cross.x : cross.z;
        road.dir = rng.chance(0.5) ? 1 : -1;
      }
      // Too far from the player: respawn near them.
      const dx = car.pos.x - G.player.pos.x;
      const dz = car.pos.z - G.player.pos.z;
      if (Math.hypot(dx, dz) > POPULATION.despawnRange) {
        const spot = G.city.randomRoadPoint(rng);
        const near = { x: G.player.pos.x + (spot.x - G.player.pos.x) * 0.4, z: G.player.pos.z + (spot.z - G.player.pos.z) * 0.4 };
        const snapped = G.city.nearestRoad(near.x, near.z);
        car.pos.set(snapped.x, 0, snapped.z);
        car.speed = 0;
        Object.assign(road, pickRoad());
      }
    }
  }

  return { cars: cars.map((c) => c.car), update };
}
