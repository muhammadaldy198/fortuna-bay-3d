// Traffic AI for Fortuna Bay v2 — cars follow the road grid intersection
// to intersection, brake smoothly for the car ahead (IDM-lite: desired
// speed scales with the gap), pull over to the kerb when sirens are near,
// and overtake a slow car ahead when the left lane is clear. Right-hand
// traffic: each car drives its lane (3 m right of centreline).
import { HALF, LANE, PITCH, TRAFFIC_COUNT, TRAFFIC_SPEED } from './config.js';

const RESPAWN_FAR = 340; // farther than this from the player, a car respawns
const SIREN_PULL_OVER = 40; // sirens within this range make traffic pull over

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
    car._laneOff = LANE; // current lateral offset: LANE (right) or -LANE (overtaking)
    car._blockedT = 0; // how long a slow car ahead has blocked this car
    car._overtakeT = 0; // time left in the overtaking lane
    car._pullOver = false;
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

  // Distance to the nearest car ahead of `car` within `dist` metres and a
  // narrow cone, or Infinity when the road ahead is clear.
  function gapAhead(car, dist) {
    const f = vehicles.forwardOf(car);
    let best = Infinity;
    for (const other of vehicles.cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > dist || d < 0.5) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot > 0.8 && d < best) best = d;
    }
    return best;
  }

  // True when the lane to the left of `car` is clear for an overtake:
  // nothing within 12 m ahead or 6 m behind in that lane. Left of the
  // forward vector (fx, fz) is (fz, -fx) — the first draft used (-fz, fx),
  // which is the RIGHT side, so the clearance check watched the wrong lane.
  function leftLaneClear(car) {
    const f = vehicles.forwardOf(car);
    const lx = f.z;
    const lz = -f.x;
    for (const other of vehicles.cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const along = dx * f.x + dz * f.z;
      const side = dx * lx + dz * lz;
      if (along > -6 && along < 14 && side > 1 && side < 7) return false;
    }
    return true;
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
        // Overtaking ends at an intersection: return to the right lane.
        car._laneOff = LANE;
        car._overtakeT = 0;
        car._blockedT = 0;
      }
      const f = vehicles.forwardOf(car);
      const fSpeed = car.vel.x * f.x + car.vel.z * f.z;

      // Pull over: sirens close by mean stop at the kerb, right indicator on.
      car._pullOver = sirensNear && distToPlayer < SIREN_PULL_OVER;
      let laneOff = car._laneOff;
      if (car._pullOver) laneOff = LANE + 2.5;

      // IDM-lite: desired speed scales with the gap ahead — full speed when
      // the road is clear, easing to a stop as the gap closes under 8 m.
      const gap = gapAhead(car, 26);
      let desired = TRAFFIC_SPEED;
      if (car._pullOver) {
        desired = 0;
      } else if (gap < 8) {
        desired = 0;
      } else if (gap < 22) {
        desired = TRAFFIC_SPEED * (gap - 8) / 14;
      }
      // Overtake: blocked by a slow car for 3 s with a clear left lane?
      // Move left, pass, then return. Indicators show the manoeuvre.
      if (!car._pullOver && gap < 14 && gap !== Infinity) {
        car._blockedT += dt;
        if (car._blockedT > 3 && car._overtakeT <= 0 && leftLaneClear(car)) {
          car._overtakeT = 6;
          car._laneOff = -LANE;
          car._blockedT = 0;
        }
      } else {
        car._blockedT = 0;
      }
      if (car._overtakeT > 0) {
        car._overtakeT -= dt;
        if (car._overtakeT <= 0 || gap === Infinity) {
          car._laneOff = LANE;
          car._overtakeT = 0;
        }
      }
      car.indicator = car._pullOver ? 'right'
        : car._laneOff < 0 ? 'left'
        : null;

      // Lane offset: to the right of the direction of travel (or left when
      // overtaking, further right when pulling over).
      const laneX = car._tx + (-f.z) * laneOff;
      const laneZ = car._tz + f.x * laneOff;
      // Throttle from the speed error: smooth, never binary.
      const throttle = Math.max(-1, Math.min(1, (desired - fSpeed) / 5));
      const steer = vehicles.steerToward(car, laneX, laneZ);
      vehicles.driveCar(car, dt, throttle, steer, false);
    }
  }

  return { list, update };
}
