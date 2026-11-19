// Keyboard and pointer input for Palm Bay Heat.
//
// `keys` holds every code currently held down. `pressed` holds codes that went down since the
// last endFrame() call — one-shot presses for things like entering a car, pausing or shooting.
// The mouse position is reported in canvas pixels (1280 x 720), regardless of CSS scaling.

/** Codes whose default browser action (page scrolling) must be suppressed. */
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 360, down: false };
  const input = { keys, mouse, pressed };

  // --- keyboard -------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    // Auto-repeat keeps `keys` populated, so only the first transition is one-shot.
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // A key released while the tab is unfocused never sends keyup: forget everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  // --- pointer --------------------------------------------------------------
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Map the CSS size of the canvas onto its internal (logical) resolution.
    const iw = canvas.width || 1280;
    const ih = canvas.height || 720;
    mouse.x = ((e.clientX - rect.left) / rect.width) * iw;
    mouse.y = ((e.clientY - rect.top) / rect.height) * ih;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      pressed.add('MouseLeft');
    }
  });

  // Listen on the window so releasing outside the canvas still clears the held button.
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.down = false;
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  return input;
}

/** Consume the one-shot presses. Held keys and the mouse button are untouched. */
export function endFrame(input) {
  input.pressed.clear();
}

/** True when any of the supplied KeyboardEvent codes is currently held. */
export function down(input, ...codes) {
  for (const code of codes) {
    if (input.keys.has(code)) return true;
  }
  return false;
}
