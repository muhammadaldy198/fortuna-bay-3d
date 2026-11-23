// Screenshot + QA staging for Fortuna Bay v2 (?shot=strip|night|chase|
// scale|soak|systemstest). CRITICAL LESSON from Low Tide City: shot mode
// AUTO-STARTS gameplay — the title screen never shows in a screenshot.
// Every scene stages real game state (real cops, real missions, real HUD)
// and the capture tool waits for window.__shotReady. v2: FALCON-1 is IN
// FRAME in every shot — the v1 shots never showed the heli, because the
// chase camera looks forward-down while the heli patrolled high behind.
// The v2 heli TRACKs low ahead of the player, and each shot camera is
// aimed at the heli (or the frame is composed to include it).
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

  // Where FALCON-1 is right now (or a fallback above the player).
  function heliPos() {
    const h = G.police.heliPos ? G.police.heliPos() : null;
    if (h) return h;
    const pp = state.inCar && state.car ? state.car.pos : G.player.pos;
    return { x: pp.x, z: pp.z, alt: 30 };
  }

  function stageStrip() {
    // Shot 1 "FALCON-1 OVER THE STRIP": golden-hour hero. The player sits
    // in a red sport car on the beachfront road, 3 stars, mission 11
    // ("Out of the Light") running. The heli TRACKs low ahead of the car;
    // the camera sits LOW (y 2.2) behind the car looking UP at the heli,
    // so the heli lands upper-right on a rule-of-thirds point with the
    // tower skyline behind it. The car stays parked — a moving car would
    // outrun the heli's 26 m/s and leave it behind the frame.
    G.weather.setTimeOfDay(19.33); // 19:20 golden hour
    const car = G.vehicles.spawnCar('sport', 0, 324, Math.PI, { driver: null, color: 0xc84444 });
    G.vehicles.enterCar(car);
    G.missions.startMission(10); // Out of the Light
    G.police.setWanted(3);
    cameraFn = (camera) => {
      const c = state.car;
      if (!c) return;
      const h = heliPos();
      camera.position.set(c.pos.x - 7, 2.2, c.pos.z + 9);
      camera.lookAt(h.x, h.alt, h.z);
    };
    settleLeft = 300; // 5 s: patrol (3 s) -> track low ahead
  }

  function stageNight() {
    // Shot 2 "SEARCHLIGHT NIGHT": 22:00, the player on foot at Ocean Plaza,
    // 3 stars, the heli hovering in front sweeping its spotlight. Emissive
    // windows glow, the volumetric cone cuts the dark, the pool lights the
    // plaza. Peds cower under the rotor wash. Camera low behind the player,
    // framed between the player and the heli.
    G.weather.setTimeOfDay(22);
    G.player.setPos(-135, 297, Math.PI);
    // Stage 6 peds around the plaza so the wash has someone to scare.
    const pedSpots = [
      [-128, 290], [-142, 304], [-120, 300], [-150, 292], [-135, 310], [-125, 312],
    ];
    G.peds.peds.slice(0, 6).forEach((ped, i) => {
      ped.x = pedSpots[i][0];
      ped.z = pedSpots[i][1];
    });
    G.police.setWanted(3);
    cameraFn = (camera) => {
      const p = G.player.pos;
      const h = heliPos();
      camera.position.set(p.x - 5, 2.6, p.z + 8);
      // Aim between the heli and its pool so both read in the frame.
      camera.lookAt((h.x + p.x) / 2, h.alt * 0.55, (h.z + p.z) / 2);
    };
    settleLeft = 300;
  }

  function stageChase() {
    // Shot 3 "CHASE": day drift past a roadblock, 4 stars. The car holds
    // throttle toward the roadblock, skid marks on the asphalt, one hydrant
    // smashed open (geyser in frame). The camera is high-rear and TILTED
    // UP: it looks at a point between the car and the heli, so the heli
    // reads in the sky above the chase instead of being cropped out.
    G.weather.setTimeOfDay(17.5);
    const car = G.vehicles.spawnCar('sport', 0, 0, 0, { driver: null, color: 0x4488c8 });
    G.vehicles.enterCar(car);
    car.vel.set(0, 0, 14);
    G.police.setWanted(4);
    G.input.setOverride({ x: 0, y: 0.5 }, []);
    // Skid marks along the car's path (it travels ~15 m south in the settle).
    for (let i = 0; i < 10; i++) {
      G.effects.skid(-1 + i * 0.4, 2 + i * 1.2, 0.2);
    }
    // One smashed hydrant by the road: geyser + wreckage in frame. The
    // hydrant is the real nearest one to the chase line — the first draft
    // knocked at a fixed (6, 12) where no hydrant stands, so nothing broke.
    const hyd = G.city.hydrants.reduce((best, h) => {
      const d = Math.hypot(h.x - 0, h.z - 10);
      return !best || d < best.d ? { h, d } : best;
    }, null);
    if (hyd) {
      const knocked = G.props.knockAt(hyd.h.x, hyd.h.z, 1);
      for (const k of knocked) {
        if (k.type === 'hydrant') G.effects.geyser(k.x, k.z);
      }
    }
    cameraFn = (camera) => {
      const c = state.car;
      if (!c) return;
      const h = heliPos();
      // Pulled back and lowered (was 16 high, 22 behind): at 16/22 the car
      // sat ~33 deg below the view axis, so aiming between car and heli
      // pushed the heli out of the top of the frame. At 12/30 both fit
      // inside the 70 deg FOV with room to spare.
      camera.position.set(c.pos.x - 4, 12, c.pos.z - 30);
      // Aim at the TRUE midpoint between car (y~0) and heli (y=h.alt) — the
      // fixed y=9 aimed below the heli's track altitude and tilted the view
      // down, cropping the heli out (probe: NDC y 6.85 at 3 s).
      camera.lookAt((c.pos.x + h.x) / 2, h.alt / 2, (c.pos.z + h.z) / 2 + 10);
    };
    // 6 s: the heli spends its first 3 s in high patrol (55 m) and needs
    // ~3 s more in track to drop to 26 m and settle ahead of the car. At
    // 3 s it was still at 49 m, nearly overhead — out of frame. The capture
    // timer is disabled in shot mode, so the longer hold cannot bust the
    // player, and the first flyby is 18+ s out — the heli stays in track.
    settleLeft = 360;
  }

  function stageScale() {
    // Shot 4 "CITY SCALE": birdseye over the whole city at 10:00 — coast,
    // tower, port cranes, the full grid. The player drives downtown with
    // 3 stars; the heli is a small silhouette with its blob shadow and
    // spotlight pool on the streets below. Fixed high camera, slow orbit.
    G.weather.setTimeOfDay(10);
    const car = G.vehicles.spawnCar('sport', 0, -54, 0, { driver: null, color: 0xc84444 });
    G.vehicles.enterCar(car);
    G.police.setWanted(3);
    G.input.setOverride({ x: 0, y: 0.4 }, []);
    let orbitA = 0.6;
    cameraFn = (camera) => {
      orbitA += 0.0004;
      camera.position.set(Math.cos(orbitA) * 280, 260, Math.sin(orbitA) * 280 + 40);
      camera.lookAt(0, 0, 0);
    };
    settleLeft = 300;
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
    // Checks over the live systems. Runs synchronously at stage.
    // Each ?shot= is a fresh page load, so the test car, test enemy and
    // knocked hydrant left behind here never leak into a capture shot.
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
      checks.missions = G.missions.MISSIONS.length === 11;
      checks.crew = !!G.crew.cooldowns;
      checks.garage = !!G.city.landmarks.safehouse;
      writeSave(defaultSave());
      checks.save = loadSave() !== null;
      clearSave();
      checks.weather = !!G.weather && G.weather.gripFactor === 1;
      // v2 systems.
      G.police.setWanted(3);
      checks.heli = !!G.police.heli && !!G.police.heliPos() && !!G.police.spotPool();
      checks.capture = G.police.captureMax === 5;
      checks.wantedState = G.police.wantedState() !== null;
      G.police.setWanted(0);
      checks.photo = !!G.photo && typeof G.photo.toggle === 'function';
      checks.night = typeof G.buildings.setNight === 'function';
      const hyd = G.city.hydrants[0];
      checks.destructible = hyd ? G.props.knockAt(hyd.x, hyd.z, 1).length === 1 : false;
      // The knock must also register in the props down-count (the QA
      //-visible state), not just in the return value of knockAt.
      checks.destructibleDown = hyd ? G.props.downCount() === 1 : false;
      checks.trafficOvertake = G.traffic.list.every((c) => c._laneOff !== undefined);
      checks.dayNight = typeof G.weather.setTimeOfDay === 'function' && G.weather.nightLevel !== undefined;
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
    if (name === 'strip') stageStrip();
    else if (name === 'night') stageNight();
    else if (name === 'chase') stageChase();
    else if (name === 'scale') stageScale();
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
