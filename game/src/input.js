// Keyboard + mouse input for Fortuna Bay v2. Held keys are read every frame;
// one-shot presses are edge-triggered (a press between frames is never lost
// and never counted twice). Mouse look uses pointer lock when the player
// clicks the canvas, with click-drag as a fallback. The scroll wheel is
// tracked for the photo mode FOV zoom. A scripted override lets the soak
// autopilot drive without a keyboard.
// v2: releasePointer() — photo mode calls it on exit so the pointer lock
// from gameplay mouse-look doesn't stay held while framing a shot (the
// old name releaseLock() still exists for older callers).
export function createInput(canvas) {
  const held = new Set();
  const pressedSet = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let wheelDelta = 0;
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
  // Losing the window must not leave keys stuck down — or a click queued
  // that fires the moment the window regains focus.
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
    buttonDown = false;
    clickQueued = false;
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
  // Wheel: accumulated, consumed by photo mode (FOV zoom). Passive so the
  // page never scrolls while the game owns the pointer.
  canvas.addEventListener('wheel', (e) => {
    wheelDelta += e.deltaY;
    e.preventDefault();
  }, { passive: false });
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
      // Pointer lock can throw or reject in sandboxed iframes — never let
      // that surface as a page error.
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // No pointer lock: click-drag still turns the camera.
      }
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

  function releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

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
    // Scroll wheel delta since the last call, then reset.
    takeWheel() {
      const w = wheelDelta;
      wheelDelta = 0;
      return w;
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
    releaseLock,
    // Photo mode's name for the same action: let go of the pointer so
    // mouse-look doesn't fight the photo camera. Same as releaseLock().
    releasePointer() {
      releaseLock();
    },
    // End-of-frame housekeeping: presses that nobody consumed expire.
    endFrame() {
      pressedSet.clear();
      clickQueued = false;
    },
  };
}
