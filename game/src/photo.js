// Photo mode: freeze the simulation, hide the HUD, and fly a free camera
// with WASD plus the mouse. C cycles the filter, R rises, F sinks. P or Esc
// leaves photo mode and the game resumes exactly where it stopped.

import { ACTION_CAMERA } from './input.js';

const FILTERS = ['', 'sepia(0.35) saturate(1.3)', 'saturate(0.4) brightness(1.1)', 'contrast(1.25) saturate(1.4)'];

/**
 * Create photo mode for world G. Returns:
 * - active — is photo mode on
 * - pos, yaw, pitch — the free camera state
 * - toggle() — enter/leave photo mode
 * - update(dt) — move the free camera from input
 */
export function createPhoto(G) {
  let active = false;
  let filterIndex = 0;
  const pos = { x: 0, y: 10, z: 0 };
  let yaw = 0;
  let pitch = -0.25;

  function toggle() {
    active = !active;
    if (active) {
      pos.x = G.camera.position.x;
      pos.y = G.camera.position.y;
      pos.z = G.camera.position.z;
      yaw = G.cameraYaw || 0;
      if (G.hud) G.hud.setVisible(false);
      const hint = document.getElementById('photo-hint');
      if (hint) hint.style.display = 'block';
    } else {
      if (G.hud) G.hud.setVisible(true);
      const hint = document.getElementById('photo-hint');
      if (hint) hint.style.display = 'none';
      G.renderer.domElement.style.filter = '';
      filterIndex = 0;
    }
    return active;
  }

  function update(dt) {
    if (!active) return;
    const move = G.input.move();
    const mouse = G.input.takeMouse();
    yaw -= mouse.dx * 0.003;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - mouse.dy * 0.003));
    const speed = G.input.sprint() ? 40 : 14;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    pos.x += (rx * move.x + fx * move.z) * speed * dt;
    pos.z += (rz * move.x + fz * move.z) * speed * dt;
    if (G.input.held('KeyR')) pos.y += speed * dt;
    if (G.input.held('KeyF')) pos.y -= speed * dt;
    const actions = G.input.takeActions();
    if (actions & ACTION_CAMERA) {
      filterIndex = (filterIndex + 1) % FILTERS.length;
      G.renderer.domElement.style.filter = FILTERS[filterIndex];
    }
    G.camera.position.set(pos.x, pos.y, pos.z);
    G.camera.lookAt(
      pos.x + Math.sin(yaw) * Math.cos(pitch),
      pos.y + Math.sin(pitch),
      pos.z + Math.cos(yaw) * Math.cos(pitch),
    );
  }

  return {
    get active() {
      return active;
    },
    pos,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    toggle,
    update,
  };
}
