// Keyboard and mouse input. Keys are tracked as a live set (held state for
// movement) plus an edge-triggered action queue (one-shot presses for menus,
// entering cars, punching). The mouse steers the camera when the pointer is
// locked; a click confirms on menus and fires the pistol in play.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_CAMERA = 32;
export const ACTION_PHOTO = 64;
export const ACTION_MUTE = 128;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  KeyC: ACTION_CAMERA,
  KeyP: ACTION_PHOTO,
  KeyM: ACTION_MUTE,
};

/**
 * Create the input device for world G. Returns:
 * - held(code) — is the key down right now
 * - move() — { x, z }: strafe and forward in [-1, 1] from WASD/arrows
 * - drive() — { throttle, steer }: throttle in [-1, 1], steer in [-1, 1]
 * - takeActions() — the queued one-shot actions since the last call
 * - mouseDX/mouseDY — accumulated pointer movement since last read
 * - requestLock() — ask the browser for pointer lock on the canvas
 */
export function createInput(G) {
  const heldKeys = new Set();
  let queued = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    heldKeys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) queued |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    heldKeys.delete(event.code);
  }

  function onMouseMove(event) {
    if (document.pointerLockElement === G.renderer.domElement) {
      mouseDX += event.movementX || 0;
      mouseDY += event.movementY || 0;
    }
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    queued |= ACTION_CONFIRM;
    if (G.screen === 'play') queued |= ACTION_SHOOT;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function axis(neg, pos) {
    return (heldKeys.has(pos) ? 1 : 0) - (heldKeys.has(neg) ? 1 : 0);
  }

  return {
    held(code) {
      return heldKeys.has(code);
    },
    move() {
      return {
        x: axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight'),
        z: axis('KeyS', 'KeyW') + axis('ArrowDown', 'ArrowUp'),
      };
    },
    drive() {
      return {
        throttle: axis('KeyS', 'KeyW') + axis('ArrowDown', 'ArrowUp'),
        steer: axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight'),
      };
    },
    sprint() {
      return heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight');
    },
    jump() {
      return heldKeys.has('Space');
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    isMouseDown() {
      return mouseDown;
    },
    requestLock() {
      const canvas = G.renderer.domElement;
      if (canvas && canvas.requestPointerLock) canvas.requestPointerLock();
    },
  };
}
