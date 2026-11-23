// Missions for Fortuna Bay — 10 story missions (data-driven steps), 3
// repeatable side jobs (taxi, courier, street race). Each step has one
// objective; the beacon, minimap blip and HUD banner all read the current
// step. Fail states: timer, death, busted, target lost/spotted.
// Step types: go, driveTo, pickup, deliver, enterCar, steal, checkpoint,
// kill, rampage, survive, evade, tail, chase.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 0, name: 'First Ropes', giver: 'Mama Rosa', reward: 300, respect: 60,
    brief: 'Welcome to Fortuna. Run a few errands and learn the streets.',
    steps: [
      { type: 'go', at: 'safehouse', text: 'Meet Mama Rosa at the Safehouse' },
      { type: 'go', at: 'gunshop', text: 'Pick up the pistol at Ironworks Guns' },
      { type: 'go', at: 'casino', text: 'Deliver the package to Casino Fortuna' },
    ],
  },
  {
    id: 1, name: 'Hot Wheels', giver: 'Rico', reward: 500, respect: 80,
    brief: 'Rico needs a sport car. Borrow one. Permanently.',
    steps: [
      { type: 'steal', text: 'Steal a sport car' },
      { type: 'driveTo', at: 'safehouse', text: 'Bring it to the Safehouse garage' },
    ],
  },
  {
    id: 2, name: 'Tail the Rat', giver: 'Mama Rosa', reward: 600, respect: 100,
    brief: 'Someone is talking to the FBPD. Find out where he goes.',
    steps: [
      { type: 'tail', time: 35, text: "Tail the rat — stay back, don't get spotted" },
    ],
  },
  {
    id: 3, name: 'Deadline Dash', giver: 'Rico', reward: 700, respect: 120,
    brief: 'Six checkpoints, 150 seconds. Rico is timing you.',
    steps: [
      { type: 'checkpoint', points: [[162, 0], [162, 162], [0, 162], [-162, 162], [-162, 0], [-162, -162]], time: 150, text: 'Hit all 6 checkpoints' },
    ],
  },
  {
    id: 4, name: 'Dockside Trouble', giver: 'Vex', reward: 800, respect: 140,
    brief: 'A rival crew is leaning on the dock workers. Lean back.',
    steps: [
      { type: 'go', at: 'port', text: 'Get to Port Fortuna' },
      { type: 'kill', at: 'port', count: 5, text: 'Clear the dock crew' },
    ],
  },
  {
    id: 5, name: 'Getaway Driver', giver: 'Mama Rosa', reward: 900, respect: 160,
    brief: 'Pick up the crew at the casino and lose the heat.',
    steps: [
      { type: 'go', at: 'casino', text: 'Pick up the crew at Casino Fortuna' },
      { type: 'evade', stars: 2, text: 'Lose the FBPD — break line of sight!' },
      { type: 'driveTo', at: 'safehouse', text: 'Drop the crew at the Safehouse' },
    ],
  },
  {
    id: 6, name: 'Rampage on the Mile', giver: 'Lola', reward: 800, respect: 140,
    brief: 'Lola wants a show on the Mile. Wreck six cars.',
    steps: [
      { type: 'rampage', count: 6, time: 120, text: 'Wreck 6 cars on the Mile' },
    ],
  },
  {
    id: 7, name: 'The Big Score', giver: 'Mama Rosa', reward: 2500, respect: 300,
    brief: 'The casino skim. Take the guards, hold the heat, get clear.',
    steps: [
      { type: 'go', at: 'casino', text: 'Get to Casino Fortuna' },
      { type: 'kill', at: 'casino', count: 8, text: 'Take down the casino guards' },
      { type: 'survive', stars: 3, time: 30, text: 'Survive the heat' },
      { type: 'evade', text: 'Lose the FBPD and get clear!' },
    ],
  },
  {
    id: 8, name: 'Heat Wave', giver: 'Vex', reward: 1200, respect: 200,
    brief: 'Vex hacked the dispatch. Four stars, ninety seconds. Go.',
    steps: [
      { type: 'survive', stars: 4, time: 90, text: 'Survive 4 stars' },
    ],
  },
  {
    id: 9, name: 'Fortuna Rising', giver: 'Mama Rosa', reward: 5000, respect: 500,
    brief: 'The boss who ran this island is running. End it at Isla Light.',
    steps: [
      { type: 'chase', text: 'Run the boss off the road!' },
      { type: 'go', at: 'lighthouse', text: 'Meet Mama Rosa at Isla Light' },
    ],
  },
];

export function createMissions(G) {
  const { scene, city, vehicles, combat, rng, state, emit, on } = G;
  let active = null;
  let clock = 0;

  // The beacon: a pulsing cyan column + ground ring at the objective.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x44d0ff, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 30, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x44d0ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  ring.visible = false;
  scene.add(ring);

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  function resolvePos(step) {
    if (step.at && city.landmarks[step.at]) {
      const lm = city.landmarks[step.at];
      return [lm.x, lm.z];
    }
    if (step.pos) return step.pos;
    return [0, 0];
  }

  // Remove everything the current step spawned (enemies, scripted cars).
  function cleanupStep() {
    if (!active) return;
    for (const enemy of active.spawned) combat.removeEnemy(enemy);
    active.spawned = [];
    if (active.targetCar) {
      vehicles.removeCar(active.targetCar);
      active.targetCar = null;
    }
    if (active.bossCar) {
      vehicles.removeCar(active.bossCar);
      active.bossCar = null;
    }
  }

  function startStep(idx) {
    const step = active.def.steps[idx];
    active.stepIdx = idx;
    active.step = step;
    active.timer = step.time !== undefined ? step.time : null;
    active.marker = null;
    active.kills = 0;
    active.wrecked = 0;
    active.countedWrecks = new Set();
    active.cpIdx = 0;
    active.spawnT = 0;
    active.lostT = 0;
    active.routeT = 0;

    switch (step.type) {
      case 'go':
      case 'driveTo':
      case 'pickup':
      case 'deliver':
        active.marker = resolvePos(step);
        break;
      case 'checkpoint':
        active.marker = step.points[0];
        break;
      case 'kill': {
        const [x, z] = resolvePos(step);
        active.marker = [x, z];
        for (let i = 0; i < step.count; i++) {
          const a = rng.next() * Math.PI * 2;
          const r = 8 + rng.next() * 12;
          active.spawned.push(combat.spawnEnemy(x + Math.sin(a) * r, z + Math.cos(a) * r));
        }
        break;
      }
      case 'survive':
        if (step.stars && state.wanted < step.stars) G.police.setWanted(step.stars);
        break;
      case 'evade':
        if (step.stars && state.wanted < step.stars) G.police.setWanted(step.stars);
        break;
      case 'tail': {
        const pp = playerPos();
        // Spawn the target 25–45 m away on a road — never inside the
        // 12 m spotting range, or the mission fails the instant it starts.
        let tx = pp.x + 30;
        let tz = pp.z;
        for (let tries = 0; tries < 10; tries++) {
          const [x, z] = city.randomRoadPoint(rng);
          const d = Math.hypot(x - pp.x, z - pp.z);
          if (d > 25 && d < 45) { tx = x; tz = z; break; }
        }
        const car = vehicles.spawnCar('civil', tx, tz, rng.next() * Math.PI * 2, { driver: 'scripted', color: 0x888888 });
        active.targetCar = car;
        const [wx, wz] = city.randomRoadPoint(rng);
        active.waypoint = [wx, wz];
        break;
      }
      case 'chase': {
        const pp = playerPos();
        const heading = state.inCar && state.car ? state.car.yaw : G.player.yaw;
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        const car = vehicles.spawnCar('sport', pp.x + fx * 30, pp.z + fz * 30, heading, { driver: 'scripted', color: 0x1a1a1a, speedMul: 1.1 });
        active.bossCar = car;
        const [wx, wz] = city.randomRoadPoint(rng);
        active.waypoint = [wx, wz];
        break;
      }
      default:
        break;
    }
  }

  function nextStep() {
    cleanupStep();
    if (active.stepIdx + 1 >= active.def.steps.length) {
      complete();
    } else {
      startStep(active.stepIdx + 1);
    }
  }

  function complete() {
    // Capture everything before cleanup() nulls the active mission.
    const def = active.def;
    const wasSide = !!def.side;
    const timeUsed = active.step.time !== undefined && active.timer !== null
      ? active.step.time - active.timer : null;
    cleanup();
    state.cash += def.reward;
    state.respect += def.respect || 0;
    if (!wasSide) {
      if (!state.missionsDone.includes(def.id)) state.missionsDone.push(def.id);
      state.missionIndex = Math.max(state.missionIndex, def.id + 1);
    }
    if (def.side === 'race' && timeUsed !== null) {
      if (state.bestRace === null || timeUsed < state.bestRace) state.bestRace = timeUsed;
    }
    if (G.audio) G.audio.missionComplete();
    emit('missionComplete', { mission: def, reward: def.reward });
    if (G.saveGame) G.saveGame();
  }

  function fail(reason) {
    const def = active ? active.def : null;
    cleanup();
    emit('missionFailed', { mission: def, reason });
  }

  function cleanup() {
    cleanupStep();
    active = null;
    beacon.visible = false;
    ring.visible = false;
  }

  function startMission(id) {
    const def = MISSIONS[id];
    if (!def) return false;
    if (active) cleanup();
    active = { def, stepIdx: 0, step: null, timer: null, marker: null, spawned: [], targetCar: null, bossCar: null };
    startStep(0);
    emit('missionStart', { mission: def });
    return true;
  }

  function jumpTo(stepIdx) {
    if (!active) return;
    if (stepIdx < 0 || stepIdx >= active.def.steps.length) return;
    cleanupStep();
    startStep(stepIdx);
  }

  function startSideJob(kind) {
    if (active) cleanup();
    let def;
    if (kind === 'taxi') {
      const [px, pz] = city.randomRoadPoint(rng);
      const [dx, dz] = city.randomRoadPoint(rng);
      def = {
        name: 'Taxi Fare', giver: 'Dispatch', reward: 120, respect: 15, side: 'taxi',
        brief: 'A fare is waiting. Pick them up, drop them off.',
        steps: [
          { type: 'go', pos: [px, pz], text: 'Pick up the fare' },
          { type: 'driveTo', pos: [dx, dz], text: 'Drop the fare off' },
        ],
      };
    } else if (kind === 'courier') {
      const points = [0, 1, 2].map(() => city.randomRoadPoint(rng));
      def = {
        name: 'Courier Run', giver: 'Dispatch', reward: 180, respect: 20, side: 'courier',
        brief: 'Three drops, 120 seconds.',
        steps: [{ type: 'checkpoint', points, time: 120, text: 'Deliver 3 packages' }],
      };
    } else if (kind === 'race') {
      def = {
        name: 'Street Race', giver: 'Rico', reward: 400, respect: 40, side: 'race',
        brief: 'Eight checkpoints around the loop. Beat your best time.',
        steps: [{ type: 'checkpoint', points: city.race.checkpoints, time: 240, text: 'Race the loop' }],
      };
    } else {
      return false;
    }
    active = { def, stepIdx: 0, step: null, timer: null, marker: null, spawned: [], targetCar: null, bossCar: null };
    startStep(0);
    emit('missionStart', { mission: def });
    return true;
  }

  on('enemyDown', (e) => {
    if (active && active.spawned.includes(e.enemy)) active.kills++;
  });
  on('died', () => { if (active) fail('You died'); });
  on('busted', () => { if (active) fail('Busted by the FBPD'); });

  function update(dt) {
    clock += dt;
    if (!active) return;
    const step = active.step;
    const pp = playerPos();

    // Timer.
    if (active.timer !== null) {
      active.timer -= dt;
      if (active.timer <= 0) {
        fail('Time ran out');
        return;
      }
    }

    // Beacon follows the live marker.
    const m = marker();
    if (m) {
      beacon.visible = true;
      ring.visible = true;
      beacon.position.set(m[0], 15, m[1]);
      ring.position.set(m[0], 0.1, m[1]);
      const pulse = 0.75 + Math.sin(clock * 3) * 0.25;
      beaconMat.opacity = 0.3 * pulse;
      ringMat.opacity = 0.5 * pulse;
    } else {
      beacon.visible = false;
      ring.visible = false;
    }

    const distToMarker = m ? Math.hypot(pp.x - m[0], pp.z - m[1]) : Infinity;

    switch (step.type) {
      case 'go':
      case 'driveTo':
      case 'pickup':
      case 'deliver':
        if (distToMarker < 12) nextStep();
        break;
      case 'enterCar':
        if (state.inCar) nextStep();
        break;
      case 'steal':
        if (state.inCar && state.car && state.car.kind === 'sport') nextStep();
        break;
      case 'checkpoint':
        if (distToMarker < 12) {
          active.cpIdx++;
          if (active.cpIdx >= step.points.length) nextStep();
          else active.marker = step.points[active.cpIdx];
        }
        break;
      case 'kill':
        if (active.kills >= step.count) nextStep();
        break;
      case 'rampage': {
        for (const car of vehicles.cars) {
          if (car.wrecked && car.lastHitBy === 'player' && !active.countedWrecks.has(car.id)) {
            active.countedWrecks.add(car.id);
            active.wrecked++;
          }
        }
        if (active.wrecked >= step.count) nextStep();
        break;
      }
      case 'survive': {
        active.spawnT -= dt;
        if (active.spawnT <= 0) {
          active.spawnT = 6;
          for (let i = 0; i < 2; i++) {
            const a = rng.next() * Math.PI * 2;
            const r = 25 + rng.next() * 15;
            active.spawned.push(combat.spawnEnemy(pp.x + Math.sin(a) * r, pp.z + Math.cos(a) * r));
          }
        }
        break;
      }
      case 'evade':
        if (state.wanted === 0) nextStep();
        break;
      case 'tail': {
        const car = active.targetCar;
        if (!car || car.wrecked) {
          fail('The target got away');
          break;
        }
        // The target cruises its route.
        const dWp = Math.hypot(active.waypoint[0] - car.pos.x, active.waypoint[1] - car.pos.z);
        if (dWp < 10) active.waypoint = city.randomRoadPoint(rng);
        vehicles.driveCar(car, dt, 0.6, vehicles.steerToward(car, active.waypoint[0], active.waypoint[1]), false);
        const d = Math.hypot(pp.x - car.pos.x, pp.z - car.pos.z);
        if (d < 12) fail('You were spotted!');
        else if (d > 60) fail('You lost the target!');
        break;
      }
      case 'chase': {
        const car = active.bossCar;
        if (!car) break;
        if (car.wrecked || car.hp <= 25) {
          nextStep();
          break;
        }
        // The boss flees: re-pick a waypoint away from the player.
        active.routeT -= dt;
        const dWp = Math.hypot(active.waypoint[0] - car.pos.x, active.waypoint[1] - car.pos.z);
        if (active.routeT <= 0 || dWp < 10) {
          active.routeT = 2.5;
          let best = null;
          let bestD = -1;
          for (let t = 0; t < 6; t++) {
            const [wx, wz] = city.randomRoadPoint(rng);
            const d = Math.hypot(wx - pp.x, wz - pp.z);
            if (d > bestD) { bestD = d; best = [wx, wz]; }
          }
          active.waypoint = best;
        }
        vehicles.driveCar(car, dt, 1, vehicles.steerToward(car, active.waypoint[0], active.waypoint[1]), false);
        const d = Math.hypot(pp.x - car.pos.x, pp.z - car.pos.z);
        if (d > 150) {
          active.lostT += dt;
          if (active.lostT > 10) fail('The boss got away!');
        } else {
          active.lostT = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  function marker() {
    if (!active) return null;
    if (active.step.type === 'tail' && active.targetCar) {
      return [active.targetCar.pos.x, active.targetCar.pos.z];
    }
    if (active.step.type === 'chase' && active.bossCar) {
      return [active.bossCar.pos.x, active.bossCar.pos.z];
    }
    return active.marker;
  }

  function objective() {
    if (!active) return '';
    const step = active.step;
    let text = step.text;
    if (step.type === 'kill') text += ` (${active.kills}/${step.count})`;
    if (step.type === 'rampage') text += ` (${active.wrecked}/${step.count})`;
    if (step.type === 'checkpoint') text += ` (${active.cpIdx}/${step.points.length})`;
    return text;
  }

  return {
    MISSIONS,
    startMission, jumpTo, startSideJob, fail, cleanup, update,
    get current() { return active; },
    get objective() { return objective(); },
    get timer() { return active ? active.timer : null; },
    get marker() { return marker(); },
  };
}
