// Weather for Fortuna Bay v2 — a full day/night cycle plus passing rain
// showers. The sun, sky, fog and window glow all follow the clock: golden
// hour at 17:30–19:00, deep night at 21:00–05:00 (the searchlight shot
// lives there), bright morning at 10:00. Rain is not decoration: it cuts
// grip (RAIN_GRIP_FACTOR), pulls the fog in, dims the sun, and plays rain
// noise. The first stretch is always clear for at least 150 s, so
// screenshots always see the staged light.
import * as THREE from 'three';
import {
  FOG_COLOR, FOG_FAR, FOG_NEAR, RAIN_FOG_FAR, RAIN_FOG_NEAR, RAIN_GRIP_FACTOR,
  SKY_HORIZON, WEATHER_CLEAR_MAX, WEATHER_CLEAR_MIN,
  WEATHER_RAIN_MAX, WEATHER_RAIN_MIN,
} from './config.js';

const RAIN_DROPS = 800;
const RAIN_AREA = 70; // the rain box follows the player

// Night sky: near-black blue zenith, dark slate horizon, dim moonlight.
const NIGHT_TOP = 0x050914;
const NIGHT_HORIZON = 0x1a2438;
const NIGHT_FOG = 0x0d1526;
const DAY_TOP = 0x3a6ab0;
const DAY_HORIZON = 0xa8d0f0;

export function createWeather(G) {
  const { scene, rng, emit } = G;
  let mode = 'clear';
  let timer = rng.range(WEATHER_CLEAR_MIN, WEATHER_CLEAR_MAX);
  let nightLevel = 0; // 0 = full day, 1 = full night
  let forcedHour = null; // ?time= / a shot stage pins the clock

  // Rain streaks: one Points cloud, recycled inside a box around the player.
  // Positions come from the SEEDED stream (rng), never Math.random — the
  // rain must look identical on a deterministic re-run of the same seed.
  const positions = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i++) {
    positions[i * 3] = (rng.next() - 0.5) * RAIN_AREA;
    positions[i * 3 + 1] = rng.next() * 30;
    positions[i * 3 + 2] = (rng.next() - 0.5) * RAIN_AREA;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xaaccee, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  const tmpTop = new THREE.Color();
  const tmpHorizon = new THREE.Color();
  const tmpFog = new THREE.Color();
  const tmpWarm = new THREE.Color(0xff9a4a);
  const dayTop = new THREE.Color(DAY_TOP);
  const dayHorizon = new THREE.Color(DAY_HORIZON);
  const nightTop = new THREE.Color(NIGHT_TOP);
  const nightHorizon = new THREE.Color(NIGHT_HORIZON);
  const nightFog = new THREE.Color(NIGHT_FOG);
  const dayFog = new THREE.Color(FOG_COLOR);
  const goldenHorizon = new THREE.Color(SKY_HORIZON);

  // The look of an hour: sun elevation drives nightLevel, sun intensity
  // and colour, the sky gradient and the fog. Golden hour (low sun) gets
  // the warm horizon from config; night gets the dark palette.
  function applyHour(hour) {
    const h = ((hour % 24) + 24) % 24;
    // Sun elevation: 0 at 06:00 and 18:00, 1 at noon, negative at night.
    const elev = Math.sin(((h - 6) / 12) * Math.PI);
    const target = elev <= 0 ? 1 : 1 - Math.min(1, elev * 2.2);
    nightLevel += (target - nightLevel) * 0.5; // ease toward the target
    if (Math.abs(target - nightLevel) < 0.01) nightLevel = target;
    const day = 1 - nightLevel;
    // Golden hour peaks when the sun is low but still up: |elev| small
    // and day > 0, so the warm horizon only ever tints daylight.
    const golden = Math.max(0, 1 - Math.abs(elev) * 3) * day; // warm near sunrise/sunset
    if (G.sun) {
      G.sun.intensity = 0.25 + day * 1.95;
      G.sun.color.setHex(0xffffff).lerp(tmpWarm, golden * 0.8);
      // The sun swings across the sky with the hour.
      const sunA = ((h - 6) / 12) * Math.PI;
      G.sun.position.set(Math.cos(sunA) * -300, Math.max(20, Math.sin(sunA) * 260), 120);
    }
    if (G.sky) {
      tmpTop.copy(nightTop).lerp(dayTop, day);
      // Golden hour warms the horizon toward the config orange.
      tmpHorizon.copy(nightHorizon).lerp(dayHorizon, day);
      tmpHorizon.lerp(goldenHorizon, golden * 0.9);
      G.sky.material.uniforms.top.value.copy(tmpTop);
      G.sky.material.uniforms.horizon.value.copy(tmpHorizon);
    }
    if (scene.fog) {
      tmpFog.copy(nightFog).lerp(dayFog, day);
      scene.fog.color.copy(tmpFog);
    }
    if (G.buildings) G.buildings.setNight(nightLevel);
  }

  function setMode(next) {
    mode = next;
    const raining = next === 'rain';
    rain.visible = raining;
    if (scene.fog) {
      scene.fog.near = raining ? RAIN_FOG_NEAR : FOG_NEAR;
      scene.fog.far = raining ? RAIN_FOG_FAR : FOG_FAR;
    }
    if (G.audio) G.audio.setRain(raining);
    timer = raining
      ? rng.range(WEATHER_RAIN_MIN, WEATHER_RAIN_MAX)
      : rng.range(WEATHER_CLEAR_MIN, WEATHER_CLEAR_MAX);
    if (raining) emit('toast', { text: 'Rain — the roads are slick!' });
    else emit('toast', { text: 'The rain cleared' });
  }

  // Pin the clock (URL flag or a shot stage) — the day/night cycle then
  // holds that hour instead of following game time.
  function setTimeOfDay(hour) {
    forcedHour = hour;
    applyHour(hour);
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0) setMode(mode === 'clear' ? 'rain' : 'clear');
    const hour = forcedHour !== null ? forcedHour : (G.state.timeMin / 60);
    applyHour(hour);
    // Rain dims the sun further on top of the time-of-day look.
    if (mode === 'rain' && G.sun) G.sun.intensity = Math.min(G.sun.intensity, 1.1);
    if (mode !== 'rain') return;
    // Recentre the rain box on the player and let the drops fall.
    const pp = G.state.inCar && G.state.car ? G.state.car.pos : G.player.pos;
    rain.position.set(pp.x, 0, pp.z);
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_DROPS; i++) {
      pos[i * 3 + 1] -= 30 * dt;
      pos[i * 3] -= 4 * dt; // slight wind
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 30;
        pos[i * 3] = (rng.next() - 0.5) * RAIN_AREA;
        pos[i * 3 + 2] = (rng.next() - 0.5) * RAIN_AREA;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  return {
    get raining() { return mode === 'rain'; },
    get gripFactor() { return mode === 'rain' ? RAIN_GRIP_FACTOR : 1; },
    get nightLevel() { return nightLevel; },
    setTimeOfDay, setMode, update,
  };
}
