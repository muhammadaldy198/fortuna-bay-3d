// Screenshot + QA staging for Fortuna Bay (?shot=cover|city|chase|
// mission|soak|systemstest). CRITICAL LESSON from Low Tide City: shot mode
// AUTO-STARTS gameplay — the title screen never shows in a screenshot.
// Every scene stages real game state (real cops, real missions, real HUD)
// and the capture tool waits for window.__shotReady.
import { ENEMY_HEALTH, PED_COUNT, TRAFFIC_COUNT } from './config.js';
import { clearSave, defaultSave, loadSave, writeSave } from './save.js';

export function createShots(G) {
  const { state, rng } = G;
  let sceneName = null;
  let settleLeft = 0;
  let isReady = false;
  let cameraFn = null;
  let soakT = 0;
  let soakSeconds = 20;
  let soakFrames = 0;
  let soakWaypoint = null;

  function resetState() {
    state.cash = 250;
    state.respect = 0;
    state.health = 100;
    state.wanted = 0;
    state.weapon = 'pistol';
    state.missionIndex = 0;
    state.missionsDone = [];
    state.garage = [];
    state.inCar = false;
    state.car = null;
    state.decoy = null;
    state.timeMin = 17 * 60 + 30;
    if (G.missions.current) G.missions.cleanup();
    G.police.setWanted(0);
  }

  function stageCover() {
    // The cover: a golden-hour chase. Player in a sport car downtown, 5
    // stars, FALCON-1 overhead, a roadblock ahead, mission 5 running.
    // The player DRIVES during the settle: a parked car lets the tail catch
    // the camera (first capture had a cruiser filling the frame, speed 0).
    const car = G.vehicles.spawnCar('sport', 0, -54, 0, { driver: null, color: 0xc84444 });
    G.vehicles.enterCar(car);
    G.missions.startMission(5);
    G.missions.jumpTo(1); // the evade step: "Lose the FBPD!"
    G.police.setWanted(5);
    G.input.setOverride({ x: 0, y: 0.7 }, []);
    // Pull-back chase camera that follows the car and looks well ahead, so
    // the roadblock and the converging cruisers stay in frame.
    cameraFn = (camera) => {
      const c = state.car;
      if (!c) return;
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      camera.position.set(c.pos.x - fx * 10, 4.5, c.pos.z - fz * 10);
      camera.lookAt(c.pos.x + fx * 25, 2, c.pos.z + fz * 25);
    };
    settleLeft = 150;
  }

  function stageCity() {
    // On foot on the boardwalk at dusk: skyline, peds, traffic, marina.
    G.player.setPos(0, 396, Math.PI);
    // Stage 8 peds at fixed boardwalk spots (deterministic — the old version
    // drew random points and kept only the ones that happened to land near,
    // which could stage nobody on a bad draw).
    const pedSpots = [
      [-24, 384], [-12, 402], [8, 388], [18, 404], [-6, 378],
      [28, 390], [-34, 396], [40, 402],
    ];
    G.peds.peds.slice(0, 8).forEach((ped, i) => {
      ped.x = pedSpots[i][0];
      ped.z = pedSpots[i][1];
    });
    for (let i = 0; i < 3; i++) {
      G.vehicles.spawnCar('civil', -30 + i * 30, 360, Math.PI / 2, { driver: null });
    }
    settleLeft = 60;
  }

  function stageChase() {
    // High-angle drift shot: the player car sliding past a roadblock,
    // heli searchlight sweeping the road, skid marks on the asphalt.
    // The camera FOLLOWS the car (the first capture used a fixed camera and
    // the car drove out of frame, leaving rooftops). The car holds throttle
    // so it keeps closing on the roadblock instead of coasting to a stop.
    const car = G.vehicles.spawnCar('sport', 0, 0, 0, { driver: null, color: 0x4488c8 });
    G.vehicles.enterCar(car);
    car.vel.set(0, 0, 14);
    G.police.setWanted(5);
    G.input.setOverride({ x: 0, y: 0.5 }, []);
    // Skid marks along the car's path (it travels ~15 m south in the settle).
    for (let i = 0; i < 10; i++) {
      G.effects.skid(-1 + i * 0.4, 2 + i * 1.2, 0.2);
    }
    cameraFn = (camera) => {
      const c = state.car;
      if (!c) return;
      // High rear view that follows the car, staying over the road centreline
      // (a side offset risks parking the camera inside a tower downtown):
      // car centre-frame, roadblock ahead in the upper frame, the tail
      // behind at the bottom edge.
      camera.position.set(c.pos.x - 4, 20, c.pos.z - 22);
      camera.lookAt(c.pos.x, 0, c.pos.z + 28);
    };
    settleLeft = 75;
  }

  function stageMission() {
    // Mission 7, the survive step: rifle out, enemies around the casino,
    // wanted 3, countdown running, cyan marker on the minimap.
    // The player stands at the intersection just east of the casino, facing
    // NORTH down the street canyon — the first two stagings faced a building
    // facade (v1) or the facades across the street (v2). Enemies stage on
    // the road ahead, against the skyline.
    G.player.setPos(54, 323, Math.PI);
    state.weapon = 'rifle';
    G.missions.startMission(7);
    G.missions.jumpTo(2); // survive step: 3 stars, 30 s
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      G.combat.spawnEnemy(54 + Math.sin(a) * 6, 300 + Math.cos(a) * 6);
    }
    settleLeft = 120;
  }

  function stageSoak(seconds) {
    // Autopilot: drive around the city for `seconds`, then report.
    soakSeconds = seconds;
    soakT = 0;
    soakFrames = 0;
    const car = G.vehicles.spawnCar('sport', 0, 0, 0, { driver: null });
    G.vehicles.enterCar(car);
    soakWaypoint = G.city.randomRoadPoint(rng);
  }

  function stageSystemsTest() {
    // Twelve checks over the live systems. Runs synchronously at stage.
    const checks = {};
    const errorsBefore = G.errorCount;
    try {
      checks.city = G.city.buildings.length > 100;
      checks.traffic = G.traffic.list.length === TRAFFIC_COUNT;
      checks.peds = G.peds.peds.length === PED_COUNT;
      checks.player = !!G.player.pos;
      const testCar = G.vehicles.spawnCar('civil', 500, 500, 0, { driver: null });
      checks.vehicles = !!testCar && G.vehicles.cars.includes(testCar);
      G.vehicles.removeCar(testCar);
      G.police.setWanted(1);
      checks.police = G.police.cops.length === 2;
      G.police.setWanted(0);
      const enemy = G.combat.spawnEnemy(500, 500);
      checks.combat = enemy.hp === ENEMY_HEALTH;
      G.combat.removeEnemy(enemy);
      checks.missions = G.missions.MISSIONS.length === 10;
      checks.crew = !!G.crew.cooldowns;
      checks.garage = !!G.city.landmarks.safehouse;
      writeSave(defaultSave());
      checks.save = loadSave() !== null;
      clearSave();
      checks.weather = !!G.weather && G.weather.gripFactor === 1;
    } catch (err) {
      checks.exception = false;
      console.error('systems test failed', err);
    }
    const ok = Object.values(checks).every(Boolean);
    window.__systemsTest = { ok, checks, errors: G.errorCount - errorsBefore };
    isReady = true;
  }

  function stage(name, urlParams) {
    sceneName = name;
    resetState();
    state.screen = 'play';
    if (name === 'cover') stageCover();
    else if (name === 'city') stageCity();
    else if (name === 'chase') stageChase();
    else if (name === 'mission') stageMission();
    else if (name === 'soak') stageSoak(Number(urlParams.get('seconds')) || 20);
    else if (name === 'systemstest') stageSystemsTest();
    else settleLeft = 30; // unknown scene: just settle and signal ready
  }

  function update(dt) {
    if (sceneName === 'soak') {
      soakT += dt;
      soakFrames++;
      const car = state.car;
      if (car && !car.wrecked) {
        const d = Math.hypot(soakWaypoint[0] - car.pos.x, soakWaypoint[1] - car.pos.z);
        if (d < 12) soakWaypoint = G.city.randomRoadPoint(rng);
        const steer = G.vehicles.steerToward(car, soakWaypoint[0], soakWaypoint[1]);
        // driveCar receives -ax.x as steer, so the override inverts it.
        G.input.setOverride({ x: -steer, y: 0.8 }, []);
      } else if (!state.inCar) {
        // On foot: walk to the nearest car and get in.
        const pp = G.player.pos;
        const near = G.vehicles.nearestCar(pp.x, pp.z, 60);
        if (near) {
          const d = Math.hypot(near.pos.x - pp.x, near.pos.z - pp.z);
          if (d < 4) G.vehicles.enterCar(near);
          else {
            const wantYaw = Math.atan2(near.pos.x - pp.x, near.pos.z - pp.z);
            const diff = wantYaw - G.player.camYaw;
            G.input.setOverride({ x: Math.max(-1, Math.min(1, diff)), y: 1 }, []);
          }
        }
      }
      if (soakT >= soakSeconds) {
        G.input.setOverride(null, []);
        window.__soakDone = {
          frames: soakFrames,
          seconds: Math.round(soakT),
          errors: G.errorCount,
          fps: Math.round(G.fpsAvg),
          wanted: state.wanted,
          mission: G.missions.current ? G.missions.current.def.name : null,
        };
        isReady = true;
      }
      return;
    }
    if (settleLeft > 0) {
      settleLeft--;
      if (settleLeft <= 0) isReady = true;
    }
  }

  return {
    stage, update,
    get ready() { return isReady; },
    get cameraFn() { return cameraFn; },
    get name() { return sceneName; },
  };
}
