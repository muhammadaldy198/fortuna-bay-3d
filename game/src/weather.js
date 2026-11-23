// Weather: a day/night cycle that moves the sun, recolours the sky and the
// fog, and rain that soaks the city — worse grip, closer fog, streaks in the
// air. The sun, the hemisphere light and the ambient light all live here;
// main.js only owns the scene they shine on.

import * as THREE from 'three';
import { WEATHER, PALETTE } from './config.js';

const DAY_COLOR = new THREE.Color(PALETTE.skyDay);
const NIGHT_COLOR = new THREE.Color(PALETTE.skyNight);
const DAY_SUN = new THREE.Color(PALETTE.sunDay);
const NIGHT_SUN = new THREE.Color(PALETTE.sunNight);

/**
 * Create the weather for world G. Returns:
 * - timeOfDay — hours 0–24 (also mirrored on G.timeOfDay)
 * - raining — is it raining
 * - grip — 1 dry, WEATHER.rainGrip wet
 * - setTimeOfDay(h) / setRain(on)
 * - update(dt)
 */
export function createWeather(G) {
  let timeOfDay = 10.5;
  let raining = false;
  let rainTimer = 90;
  let grip = 1;

  const sun = new THREE.DirectionalLight(0xfff2cc, 2.6);
  sun.position.set(120, 180, 60);
  G.scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1);
  G.scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  G.scene.add(ambient);
  G.scene.background = new THREE.Color(PALETTE.skyDay);
  G.scene.fog = new THREE.Fog(PALETTE.skyDay, 80, WEATHER.fogClear);

  // Rain streaks: a Points cloud in a box around the player, recycled as the
  // drops fall past the ground.
  const RAIN_COUNT = 500;
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    rainPos[i * 3] = G.rng.range(-60, 60);
    rainPos[i * 3 + 1] = G.rng.range(0, 60);
    rainPos[i * 3 + 2] = G.rng.range(-60, 60);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0xaaccee, size: 0.35, transparent: true, opacity: 0.55 }),
  );
  rain.visible = false;
  rain.frustumCulled = false;
  G.scene.add(rain);

  const skyColor = new THREE.Color();
  const sunColor = new THREE.Color();

  function applySky() {
    // Sun elevation: 0 at 6:00 and 18:00, 1 at noon, negative at night.
    const elevation = Math.sin(((timeOfDay - 6) / 12) * Math.PI);
    const dayness = Math.max(0, Math.min(1, elevation * 2.2 + 0.25));
    skyColor.copy(NIGHT_COLOR).lerp(DAY_COLOR, dayness);
    if (raining) skyColor.lerp(new THREE.Color(0x5a6672), 0.45);
    G.scene.background.copy(skyColor);
    G.scene.fog.color.copy(skyColor);
    sunColor.copy(NIGHT_SUN).lerp(DAY_SUN, dayness);
    sun.color.copy(sunColor);
    sun.intensity = 0.35 + dayness * 2.3;
    hemi.intensity = 0.35 + dayness * 0.8;
    ambient.intensity = 0.22 + dayness * 0.2;
    const azimuth = ((timeOfDay - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(azimuth) * 220, Math.max(25, Math.sin(azimuth) * 220), 90);
    const fogFar = raining ? WEATHER.fogRain : WEATHER.fogClear;
    G.scene.fog.far = fogFar;
    G.scene.fog.near = fogFar * 0.18;
    grip = raining ? WEATHER.rainGrip : 1;
    G.timeOfDay = timeOfDay;
  }

  function setTimeOfDay(h) {
    timeOfDay = ((h % 24) + 24) % 24;
    applySky();
  }

  function setRain(on) {
    raining = on;
    rain.visible = on;
    applySky();
  }

  function update(dt) {
    timeOfDay = (timeOfDay + (dt / WEATHER.dayLength) * 24) % 24;
    rainTimer -= dt;
    if (rainTimer <= 0) {
      rainTimer = G.rng.range(60, 180);
      setRain(G.rng.chance(WEATHER.rainChance));
    }
    applySky();
    if (raining) {
      rain.position.set(G.player.pos.x, 0, G.player.pos.z);
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        rainPos[i * 3 + 1] -= 42 * dt;
        if (rainPos[i * 3 + 1] < 0) {
          rainPos[i * 3 + 1] = 60;
          rainPos[i * 3] = G.rng.range(-60, 60);
          rainPos[i * 3 + 2] = G.rng.range(-60, 60);
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
  }

  applySky();
  return {
    get timeOfDay() {
      return timeOfDay;
    },
    get raining() {
      return raining;
    },
    get grip() {
      return grip;
    },
    setTimeOfDay,
    setRain,
    update,
  };
}
