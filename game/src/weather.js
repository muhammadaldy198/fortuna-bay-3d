// Weather for Fortuna Bay — clear golden hour with passing rain showers.
// Rain is not decoration: it cuts grip (RAIN_GRIP_FACTOR), pulls the fog
// in, dims the sun, and plays rain noise. The first stretch is always
// clear for at least 150 s, so screenshots always see golden hour.
import * as THREE from 'three';
import {
  FOG_COLOR, FOG_FAR, FOG_NEAR, RAIN_FOG_FAR, RAIN_FOG_NEAR, RAIN_GRIP_FACTOR,
  SKY_HORIZON, SKY_TOP, WEATHER_CLEAR_MAX, WEATHER_CLEAR_MIN,
  WEATHER_RAIN_MAX, WEATHER_RAIN_MIN,
} from './config.js';

const RAIN_DROPS = 800;
const RAIN_AREA = 70; // the rain box follows the player

export function createWeather(G) {
  const { scene, rng, emit } = G;
  let mode = 'clear';
  let timer = rng.range(WEATHER_CLEAR_MIN, WEATHER_CLEAR_MAX);

  // Rain streaks: one Points cloud, recycled inside a box around the player.
  const positions = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
    positions[i * 3 + 1] = Math.random() * 30;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
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

  function setMode(next) {
    mode = next;
    const raining = next === 'rain';
    rain.visible = raining;
    if (scene.fog) {
      scene.fog.near = raining ? RAIN_FOG_NEAR : FOG_NEAR;
      scene.fog.far = raining ? RAIN_FOG_FAR : FOG_FAR;
    }
    if (G.sun) G.sun.intensity = raining ? 1.4 : 2.2;
    // The sky itself darkens in the rain: dim the gradient and grey the fog.
    if (G.sky) {
      G.sky.material.uniforms.top.value.setHex(raining ? 0x1a2438 : SKY_TOP);
      G.sky.material.uniforms.horizon.value.setHex(raining ? 0x3a4a5a : SKY_HORIZON);
    }
    if (scene.fog) scene.fog.color.setHex(raining ? 0x3a4a5a : FOG_COLOR);
    if (G.audio) G.audio.setRain(raining);
    timer = raining
      ? rng.range(WEATHER_RAIN_MIN, WEATHER_RAIN_MAX)
      : rng.range(WEATHER_CLEAR_MIN, WEATHER_CLEAR_MAX);
    if (raining) emit('toast', { text: 'Rain — the roads are slick!' });
    else emit('toast', { text: 'The rain cleared' });
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0) setMode(mode === 'clear' ? 'rain' : 'clear');
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
        pos[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
        pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  return {
    get raining() { return mode === 'rain'; },
    get gripFactor() { return mode === 'rain' ? RAIN_GRIP_FACTOR : 1; },
    update,
  };
}
