// Traffic AI for Fortuna Bay — cars follow the road grid intersection to
// intersection, brake for the car ahead, and stop when sirens are near.
// Right-hand traffic: each car drives its lane (3 m right of centreline).
import { GRID, HALF, LANE, PITCH, TRAFFIC_COUNT, TRAFFIC_SPEED, roadLine } from './config.js';

const RESPAWN_FAR = 340; // farther than this from the player, a car respawns

export function createTraffic(G) {
  const { city, vehicles, rng, state } = G;
  const list = [];

  // A grid direction: one of the four axis headings.
  function randomDir() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return dirs[Math.floor(rng.next() * dirs.length)];
  }

  function spawnNearPlayer() {
    const px = state.inCar && state.car ? state.car.pos.x : G.player.pos.x;
    const pz = state.inCar && state.car ? state.car.pos.z : G.player.pos.z;
    for (let tries = 0; tries < 12; tries++) {
      const [x, z] = city.randomRoadPoint(rng);
      const d = Math.hypot(x - px, z - pz);
      if (d > 80 && d < 220) return [x, z];
    }
    return city.randomRoadPoint(rng);
  }

  function addCar(x, z) {
    const kind = rng.chance(0.12) ? 'taxi' : rng.chance(0.1) ? 'sport' : 'civil';
    const dir = randomDir();
    const yaw = Math.atan2(dir[0], dir[1]);
    const car = vehicles.spawnCar(kind, x, z, yaw, { driver: 'traffic' });
    car._dir = dir;
    car._tx = x + dir[0] * PITCH;
    car._tz = z + dir[1] * PITCH;
    list.push(car);
    return car;
  }

  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const [x, z] = city.randomRoadPoint(rng);
    addCar(x, z);
  }

  // At an intersection, pick the next direction: straight (50%), left or
  // right (25% each). Never a U-turn.
  function nextDir(car) {
    const [dx, dz] = car._dir;
    const r = rng.next();
    if (r < 0.5) return [dx, dz];
    if (r < 0.75) return [-dz, dx]; // left turn
    return [dz, -dx]; // right turn
  }

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  // Is there a car ahead of `car` within `dist` metres and a narrow cone?
  function carAhead(car, dist) {
    const f = vehicles.forwardOf(car);
    for (const other of vehicles.cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > dist || d < 0.5) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot > 0.8) return true;
    }
    return false;
  }

  function update(dt) {
    const pp = playerPos();
    const sirensNear = state.wanted > 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const car = list[i];
      const distToPlayer = Math.hypot(car.pos.x - pp.x, car.pos.z - pp.z);
      // Wrecked or far away: recycle the car near the player.
      if (car.wrecked || distToPlayer > RESPAWN_FAR) {
        vehicles.removeCar(car);
        list.splice(i, 1);
        const [x, z] = spawnNearPlayer();
        addCar(x, z);
        continue;
      }
      // Reached the next intersection? Choose a new heading.
      const dTarget = Math.hypot(car._tx - car.pos.x, car._tz - car.pos.z);
      if (dTarget < 8) {
        // Snap the intersection to the road grid.
        const gx = Math.round((car.pos.x + HALF) / PITCH) * PITCH - HALF;
        const gz = Math.round((car.pos.z + HALF) / PITCH) * PITCH - HALF;
        car._dir = nextDir(car);
        car._tx = gx + car._dir[0] * PITCH;
        car._tz = gz + car._dir[1] * PITCH;
      }
      // Lane offset: 3 m to the right of the direction of travel.
      const f = vehicles.forwardOf(car);
      const laneX = car._tx + (-f.z) * LANE;
      const laneZ = car._tz + f.x * LANE;
      // Throttle: cruise at TRAFFIC_SPEED, brake for the car ahead, stop
      // for sirens.
      let throttle = 0;
      const fSpeed = car.vel.x * f.x + car.vel.z * f.z;
      if (sirensNear && distToPlayer < 90) {
        throttle = fSpeed > 0.5 ? -1 : 0; // pull over and stop
      } else if (carAhead(car, 11)) {
        throttle = fSpeed > 0.5 ? -1 : 0;
      } else {
        throttle = Math.max(0, Math.min(1, (TRAFFIC_SPEED - fSpeed) / 5));
      }
      const steer = vehicles.steerToward(car, laneX, laneZ);
      vehicles.driveCar(car, dt, throttle, steer, false);
    }
  }

  return { list, update };
}
