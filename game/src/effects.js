// Juice: particles, tracers, muzzle flashes and screen shake. Particles live
// in one preallocated THREE.Points buffer (spawn writes a slot, the update
// integrates and fades); tracers are a small pool of stretched boxes; the
// muzzle flash is a single additive sprite. Nothing allocates per frame.

import * as THREE from 'three';

const MAX_PARTICLES = 600;
const MAX_TRACERS = 10;

/**
 * Create the effects system for world G. Returns:
 * - burst(x, y, z, color, n) — an explosion of n particles
 * - smoke(x, y, z) — one grey puff (damaged cars call it every frame)
 * - tracer(from, to) — a bright line that fades in 80 ms
 * - muzzle(x, y, z, dir) — a flash at the gun
 * - shake(amount) — camera shake for the next frames
 * - update(dt)
 */
export function createEffects(G) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 1 });
    positions[i * 3 + 1] = -100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  points.frustumCulled = false;
  G.scene.add(points);

  // Tracer pool: thin emissive boxes, stretched between two points.
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    G.scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  // Muzzle flash: one additive plane, shown for a blink.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  G.scene.add(flash);
  let flashLife = 0;

  let shakeAmount = 0;
  const tmpColor = new THREE.Color();

  function spawn(x, y, z, colorHex, speed, life, up) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (parts[i].life > 0) continue;
      const p = parts[i];
      const angle = G.rng.range(0, Math.PI * 2);
      const tilt = G.rng.range(-0.6, 1);
      p.life = life;
      p.maxLife = life;
      p.vx = Math.sin(angle) * speed * G.rng.range(0.3, 1);
      p.vy = tilt * speed + (up || 0);
      p.vz = Math.cos(angle) * speed * G.rng.range(0.3, 1);
      tmpColor.setHex(colorHex);
      p.r = tmpColor.r;
      p.g = tmpColor.g;
      p.b = tmpColor.b;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      return;
    }
  }

  function burst(x, y, z, colorHex, n) {
    for (let i = 0; i < n; i += 1) spawn(x, y, z, colorHex, G.rng.range(3, 9), G.rng.range(0.4, 0.9), 2);
  }

  function smoke(x, y, z) {
    if (G.frame % 3 === 0) spawn(x, y, z, 0x555555, 0.6, 1.4, 1.5);
  }

  function tracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % MAX_TRACERS;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.mesh.scale.set(1, 1, Math.max(len, 0.1));
    t.mesh.lookAt(to.x, to.y, to.z);
    t.mesh.material.opacity = 0.95;
    t.mesh.visible = true;
    t.life = 0.08;
  }

  function muzzle(x, y, z, dir) {
    flash.position.set(x + dir.x * 0.8, y + 1.3, z + dir.z * 0.8);
    flash.lookAt(G.camera.position);
    flash.material.opacity = 1;
    flash.visible = true;
    flashLife = 0.05;
  }

  function shake(amount) {
    shakeAmount = Math.max(shakeAmount, amount);
  }

  function update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        positions[i * 3 + 1] = -100;
        continue;
      }
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
      p.vy -= 6 * dt;
      const fade = p.life / p.maxLife;
      colors[i * 3] = p.r * fade;
      colors[i * 3 + 1] = p.g * fade;
      colors[i * 3 + 2] = p.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = t.life / 0.08;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flash.visible = false;
    }
    shakeAmount = Math.max(0, shakeAmount - dt * 2.5);
    if (shakeAmount > 0.01) {
      G.camera.position.x += (G.rng.range(-1, 1)) * shakeAmount * 0.25;
      G.camera.position.y += (G.rng.range(-1, 1)) * shakeAmount * 0.25;
    }
  }

  return { burst, smoke, tracer, muzzle, shake, update };
}
