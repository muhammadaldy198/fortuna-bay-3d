// Photo mode for Fortuna Bay v2 (NEW) — press O to freeze the action and
// fly a drone camera: WASD to move, Q/E down/up, mouse to orbit, scroll to
// zoom (FOV 25–90), G toggles the rule-of-thirds grid, O or Esc exits.
// The HUD hides while photo mode is active, so the frame is clean. The
// game world keeps simulating underneath — the heli keeps flying, traffic
// keeps moving — so a shot can catch the city mid-chase.
import * as THREE from 'three';
import { ISLAND, PHOTO } from './config.js';

export function createPhoto(G) {
  const { camera, input, state } = G;
  let active = false;
  let grid = false;
  const drone = new THREE.Vector3();
  let yaw = Math.PI;
  let pitch = -0.15;
  let fov = PHOTO.FOV_DEFAULT;
  let savedFov = 70;

  const gridEl = document.getElementById('photo-grid');
  const hintEl = document.getElementById('photo-hint');
  const hudEl = document.getElementById('hud');
  // One reusable direction vector: toggle() and updateCamera() both need
  // a camera direction, and allocating a Vector3 per frame is wasteful.
  const tmpDir = new THREE.Vector3();

  function toggle() {
    active = !active;
    if (active) {
      // Start from the current camera: position, heading and pitch.
      drone.copy(camera.position);
      const dir = tmpDir;
      camera.getWorldDirection(dir);
      yaw = Math.atan2(dir.x, dir.z);
      pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      savedFov = camera.fov;
      fov = PHOTO.FOV_DEFAULT;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      if (hudEl) hudEl.classList.add('hidden');
      if (gridEl) gridEl.classList.toggle('hidden', !grid);
      if (hintEl) hintEl.classList.remove('hidden');
      input.takeMouse();
      input.takeWheel();
    } else {
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
      if (hudEl) hudEl.classList.remove('hidden');
      if (gridEl) gridEl.classList.add('hidden');
      if (hintEl) hintEl.classList.add('hidden');
      // Release pointer lock, otherwise the mouse stays trapped in the
      // canvas after leaving photo mode (input.js implements releasePointer).
      if (typeof input.releasePointer === 'function') input.releasePointer();
    }
    return active;
  }

  function update(dt) {
    if (!active) return;
    // Mouse orbit.
    const mouse = input.takeMouse();
    yaw -= mouse.x * PHOTO.ORBIT_SENS;
    pitch = Math.max(-1.4, Math.min(1.4, pitch - mouse.y * PHOTO.ORBIT_SENS));
    // Scroll zoom: FOV 25 (telephoto) to 90 (wide).
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      fov = Math.max(PHOTO.FOV_MIN, Math.min(PHOTO.FOV_MAX, fov + wheel * 0.05));
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Drone movement, camera-relative.
    const ax = input.axis();
    const fast = input.held('ShiftLeft') || input.held('ShiftRight');
    const speed = (fast ? PHOTO.DRONE_FAST : PHOTO.DRONE_SPEED) * dt;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz; // right vector of the camera heading
    const rz = fx;
    drone.x += (fx * ax.y + rx * ax.x) * speed;
    drone.z += (fz * ax.y + rz * ax.x) * speed;
    if (input.held('KeyE')) drone.y += speed;
    if (input.held('KeyQ')) drone.y -= speed;
    // Stay over the island: the drone must not fly out past the sea where
    // there is nothing to photograph (and no ground to stand the shot on).
    const bound = ISLAND / 2 - 10;
    drone.x = Math.max(-bound, Math.min(bound, drone.x));
    drone.z = Math.max(-bound, Math.min(bound, drone.z));
    drone.y = Math.max(0.5, Math.min(300, drone.y));
    // Grid toggle.
    if (input.pressed('KeyG')) {
      grid = !grid;
      if (gridEl) gridEl.classList.toggle('hidden', !grid);
    }
  }

  function updateCamera(cam) {
    cam.position.copy(drone);
    const dir = tmpDir.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    cam.lookAt(drone.x + dir.x, drone.y + dir.y, drone.z + dir.z);
  }

  return {
    get active() { return active; },
    get grid() { return grid; },
    setGrid(v) { grid = !!v; },
    toggle, update, updateCamera,
  };
}
