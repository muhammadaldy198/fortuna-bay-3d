// Keyboard + mouse input for Fortuna Bay. Held keys are read every frame;
// one-shot presses are edge-triggered (a press between frames is never lost
// and never counted twice). Mouse look uses pointer lock when the player
// clicks the canvas, with click-drag as a fallback. A scripted override lets
// the soak autopilot drive without a keyboard.
export function createInput(canvas) {
  const held = new Set();
  const pressedSet = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let buttonDown = false;
  let rightDown = false;
  let clickQueued = false;
  let overrideAxis = null;
  let overrideKeys = new Set();

  document.addEventListener('keydown', (e) => {
    // Tab and Space scroll / shift focus in the browser; the game owns them.
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressedSet.add(e.code);
    held.add(e.code);
  });
  document.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });
  // Losing the window must not leave keys stuck down.
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
    buttonDown = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    } else if (dragging) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      // Right button: aim. It never fires and never drags.
      rightDown = true;
      e.preventDefault();
      return;
    }
    buttonDown = true;
    clickQueued = true;
    dragging = true;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
    e.preventDefault();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      rightDown = false;
      return;
    }
    buttonDown = false;
    dragging = false;
  });
  // No context menu on right-click: the right button aims.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // True while the key is physically held (or scripted by the override).
    held(code) {
      return held.has(code) || overrideKeys.has(code);
    },
    // True once for each press; consumes the press.
    pressed(code) {
      if (overrideKeys.has(code)) {
        overrideKeys.delete(code);
        return true;
      }
      if (pressedSet.has(code)) {
        pressedSet.delete(code);
        return true;
      }
      return false;
    },
    // Movement vector: x = strafe right, y = forward. WASD + arrows.
    axis() {
      if (overrideAxis) return overrideAxis;
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
        - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    // Scripted control for the soak autopilot. Pass null to release it.
    setOverride(axis, keys) {
      overrideAxis = axis;
      overrideKeys = new Set(keys || []);
    },
    // Mouse movement since the last call, then reset.
    takeMouse() {
      const m = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return m;
    },
    // True while the primary mouse button is held.
    mouseDown() {
      return buttonDown;
    },
    // True while the right mouse button is held (aim).
    rightDown() {
      return rightDown;
    },
    // True once per click; consumes the click.
    takeClick() {
      if (!clickQueued) return false;
      clickQueued = false;
      return true;
    },
    locked() {
      return document.pointerLockElement === canvas;
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // End-of-frame housekeeping: presses that nobody consumed expire.
    endFrame() {
      pressedSet.clear();
      clickQueued = false;
    },
  };
}
