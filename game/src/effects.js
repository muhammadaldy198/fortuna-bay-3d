// Effects for Fortuna Bay v2 — pooled particles (sparks + smoke + spray),
// muzzle flashes, skid marks. No per-frame allocation: three THREE.Points
// clouds with ring buffers, one InstancedMesh for skid marks. v2 adds rotor
// wash (dust blown outward under the heli) and hydrant geysers.
import * as THREE from 'three';

const SPARKS = 512;
const SMOKE = 256;
const SPRAY = 384;
const SKIDS = 220;

export function createEffects(G) {
  const { scene } = G;

  function makeCloud(count, size, color, opacity, additive) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -1000; // parked below the world until used
      colors[i * 3] = ((color >> 16) & 255) / 255;
      colors[i * 3 + 1] = ((color >> 8) & 255) / 255;
      colors[i * 3 + 2] = (color & 255) / 255;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    return { positions, colors, velocities, life, geo, cursor: 0, count, live: 0 };
  }

  const sparks = makeCloud(SPARKS, 0.35, 0xffcc66, 0.95, true);
  const smoke = makeCloud(SMOKE, 1.4, 0x888888, 0.45, false);
  const spray = makeCloud(SPRAY, 0.5, 0xbfe0ff, 0.7, false);

  function spawn(cloud, x, y, z, vx, vy, vz, ttl, r, g, b) {
    const i = cloud.cursor;
    cloud.cursor = (cloud.cursor + 1) % cloud.count;
    if (cloud.life[i] <= 0) cloud.live++;
    cloud.positions[i * 3] = x;
    cloud.positions[i * 3 + 1] = y;
    cloud.positions[i * 3 + 2] = z;
    cloud.velocities[i * 3] = vx;
    cloud.velocities[i * 3 + 1] = vy;
    cloud.velocities[i * 3 + 2] = vz;
    cloud.life[i] = ttl;
    cloud.colors[i * 3] = r;
    cloud.colors[i * 3 + 1] = g;
    cloud.colors[i * 3 + 2] = b;
  }

  function stepCloud(cloud, dt, gravity, drag) {
    // Nothing alive: skip the scan and the GPU upload entirely.
    if (cloud.live <= 0) return;
    const { positions, velocities, life } = cloud;
    for (let i = 0; i < cloud.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -1000;
        cloud.live--;
        continue;
      }
      velocities[i * 3 + 1] += gravity * dt;
      velocities[i * 3] *= drag;
      velocities[i * 3 + 2] *= drag;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (positions[i * 3 + 1] < 0.05 && gravity < 0) positions[i * 3 + 1] = 0.05;
    }
    cloud.geo.attributes.position.needsUpdate = true;
    cloud.geo.attributes.color.needsUpdate = true;
  }

  // Skid marks: dark quads laid flat on the road, ring buffer.
  const skidGeo = new THREE.PlaneGeometry(1.4, 0.35);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKIDS);
  skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skids.frustumCulled = false;
  const skidDummy = new THREE.Object3D();
  for (let i = 0; i < SKIDS; i++) {
    skidDummy.position.set(0, -100, 0);
    skidDummy.updateMatrix();
    skids.setMatrixAt(i, skidDummy.matrix);
  }
  scene.add(skids);
  let skidCursor = 0;

  // One reusable muzzle-flash quad, billboarded at the camera.
  const muzzle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({
      color: 0xffdd88, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  muzzle.position.set(0, -100, 0);
  scene.add(muzzle);
  let muzzleT = 0;

  // Shockwave rings for explosions: 4 pooled flat rings that expand and fade.
  const rings = [];
  let ringCursor = 0;
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffaa33, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    rings.push({ mesh: ring, t: 0 });
  }

  // Active geysers: { x, z, t } — each jets water for 6 s after a hydrant
  // is smashed, then runs dry.
  const geysers = [];

  return {
    // A burst of sparks. pos is {x, y, z}; color is a hex int.
    burst(pos, color, count, speed) {
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      for (let n = 0; n < count; n++) {
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * 0.9 + 0.3;
        const s = speed * (0.4 + Math.random() * 0.8);
        spawn(sparks, pos.x, pos.y, pos.z,
          Math.cos(a) * s, up * s, Math.sin(a) * s,
          0.3 + Math.random() * 0.4, r, g, b);
      }
    },
    // Grey puffs that rise and drift.
    smoke(pos, count) {
      for (let n = 0; n < count; n++) {
        spawn(smoke, pos.x + (Math.random() - 0.5), pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.8, 1 + Math.random(), (Math.random() - 0.5) * 0.8,
          1 + Math.random() * 1.5, 0.5, 0.5, 0.5);
      }
    },
    // Rotor wash (v2): dust and leaves blown radially outward along the
    // ground under the heli. Call every frame while the heli is low;
    // strength 0..1 scales the particle count. It reuses the smoke cloud
    // (dust-tinted particles) so no new pool is needed for a 0.5 s effect.
    wash(x, z, radius, strength) {
      const count = Math.round(6 * Math.max(0, Math.min(1, strength)));
      for (let n = 0; n < count; n++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = radius * (0.2 + Math.random() * 0.6);
        const speed = 4 + Math.random() * 5;
        const leaf = Math.random() < 0.25;
        spawn(smoke, x + Math.cos(a) * r0, 0.2 + Math.random() * 0.4, z + Math.sin(a) * r0,
          Math.cos(a) * speed, 0.3 + Math.random() * 0.8, Math.sin(a) * speed,
          0.5 + Math.random() * 0.5,
          leaf ? 0.3 : 0.65, leaf ? 0.55 : 0.6, leaf ? 0.2 : 0.5);
      }
    },
    // Start a hydrant geyser at (x, z). Water jets for 6 s.
    geyser(x, z) {
      if (geysers.length >= 6) geysers.shift();
      geysers.push({ x, z, t: 0 });
    },
    // Sparks + smoke + a bright flash of light + a shockwave ring.
    explosion(pos) {
      this.burst(pos, 0xffaa33, 40, 9);
      this.burst(pos, 0xff5533, 24, 6);
      this.smoke(pos, 18);
      const ring = rings[ringCursor];
      ringCursor = (ringCursor + 1) % rings.length;
      ring.mesh.position.set(pos.x, 0.3, pos.z);
      ring.t = 0;
      ring.mesh.visible = true;
    },
    // A flash at the muzzle of a gun, facing the camera.
    muzzle(pos, yaw) {
      muzzle.position.set(pos.x, pos.y, pos.z);
      muzzle.rotation.set(0, yaw, 0);
      muzzle.material.opacity = 0.9;
      muzzleT = 0.05;
    },
    // One skid-mark quad on the road.
    skid(x, z, yaw) {
      skidDummy.position.set(x, 0.05, z);
      skidDummy.rotation.set(-Math.PI / 2, 0, yaw);
      skidDummy.scale.set(1, 1, 1);
      skidDummy.updateMatrix();
      skids.setMatrixAt(skidCursor, skidDummy.matrix);
      skidCursor = (skidCursor + 1) % SKIDS;
      skids.instanceMatrix.needsUpdate = true;
    },
    update(dt) {
      stepCloud(sparks, dt, -9.8, 0.98);
      stepCloud(smoke, dt, 0.4, 0.995);
      stepCloud(spray, dt, -9.8, 0.99);
      // Geysers jet upward, then fall back as spray.
      for (let i = geysers.length - 1; i >= 0; i--) {
        const g = geysers[i];
        g.t += dt;
        if (g.t > 6) { geysers.splice(i, 1); continue; }
        const fade = 1 - g.t / 6;
        for (let n = 0; n < 4; n++) {
          const a = Math.random() * Math.PI * 2;
          const spread = Math.random() * 0.5;
          spawn(spray, g.x + Math.cos(a) * spread, 0.3, g.z + Math.sin(a) * spread,
            Math.cos(a) * 0.8, (5 + Math.random() * 3) * fade, Math.sin(a) * 0.8,
            0.8 + Math.random() * 0.5, 0.75, 0.88, 1.0);
        }
      }
      for (const ring of rings) {
        if (!ring.mesh.visible) continue;
        ring.t += dt;
        if (ring.t > 0.6) { ring.mesh.visible = false; continue; }
        const s = 1 + ring.t * 14;
        ring.mesh.scale.set(s, s, s);
        ring.mesh.material.opacity = 0.8 * (1 - ring.t / 0.6);
      }
      if (muzzleT > 0) {
        muzzleT -= dt;
        if (muzzleT <= 0) {
          muzzle.material.opacity = 0;
          muzzle.position.set(0, -100, 0);
        } else if (G.camera) {
          muzzle.lookAt(G.camera.position);
        }
      }
    },
  };
}
