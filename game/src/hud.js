// Screen-space HUD and full-screen overlays for Palm Bay Heat. Every function here draws on the
// 1280x720 logical canvas in screen coordinates; it never touches world-space transforms. All the
// colours come from the shared sunset palette, and all text uses system font stacks only.
import { VIEW, WORLD, COLORS } from './config.js';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PANEL_FILL = 'rgba(16, 10, 14, 0.72)';

function setFont(ctx, size, weight) {
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
}

function label(ctx, text, x, y, size, color, align, weight, baseline) {
  setFont(ctx, size, weight || '600');
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillText(String(text), x, y);
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, radius) {
  roundRectPath(ctx, x, y, w, h, radius == null ? 10 : radius);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.uiPanelEdge;
  ctx.stroke();
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dim(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
}

/** Heads-up display: money, wanted stars, health/busted, objective, prompt and toast. */
export function drawHud(ctx, view) {
  const money = view.money == null ? 0 : view.money;
  const health = view.health == null ? 100 : view.health;
  const wanted = clamp(Math.round(view.wanted == null ? 0 : view.wanted), 0, 5);

  // Money, top-left.
  panel(ctx, 16, 16, 168, 44);
  label(ctx, '$ ' + money, 32, 38, 22, COLORS.accent, 'left', '700');

  // Wanted stars, top-right: five slots, spaced 30 px, ending at x = 1256.
  ctx.save();
  if (wanted === 0) ctx.globalAlpha = 0.2;
  setFont(ctx, 26, '700');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? COLORS.accent : '#6d6459';
    ctx.fillText('★', 1256 - i * 30, 40);
  }
  ctx.restore();

  // Objective, top-centre, sized to the text.
  if (view.objectiveText) {
    const objective = String(view.objectiveText);
    const dist = view.objectiveDist == null ? null : String(view.objectiveDist) + ' m';
    const timer = view.timerText == null || view.timerText === '' ? null : String(view.timerText);
    const pad = 18;
    setFont(ctx, 17, '700');
    const objectiveW = ctx.measureText(objective).width;
    setFont(ctx, 14, '600');
    const distW = dist ? ctx.measureText(dist).width : 0;
    const w = Math.max(240, pad * 2 + objectiveW + (dist ? 16 + distW : 0));
    const h = timer ? 80 : 58;
    const x = (VIEW.W - w) / 2;
    const y = 16;
    panel(ctx, x, y, w, h);
    label(ctx, 'OBJECTIVE', x + pad, y + 18, 10, COLORS.accent, 'left', '700');
    label(ctx, objective, x + pad, y + 40, 17, COLORS.uiText, 'left', '700');
    if (dist) label(ctx, dist, x + w - pad, y + 40, 14, COLORS.uiDim, 'right', '600');
    if (timer) {
      const seconds = Number.parseFloat(timer);
      const timerColor = Number.isFinite(seconds) && seconds <= 10 ? COLORS.danger : COLORS.accent;
      label(ctx, timer, x + pad, y + 62, 14, timerColor, 'left', '700');
    }
  }

  // Busted progress, above the health bar.
  const hx = 16;
  const hy = VIEW.H - 16 - 34;
  if (view.busted && view.busted > 0) {
    const by = hy - 40;
    panel(ctx, hx, by, 220, 32);
    label(ctx, 'BUSTED', hx + 12, by + 10, 10, COLORS.lightBlue, 'left', '700', 'alphabetic');
    roundRectPath(ctx, hx + 12, by + 16, 196, 9, 4);
    ctx.fillStyle = '#241a1a';
    ctx.fill();
    roundRectPath(ctx, hx + 12, by + 16, 196 * clamp(view.busted, 0, 1), 9, 4);
    ctx.fillStyle = COLORS.lightBlue;
    ctx.fill();
  }

  // Health bar, bottom-left.
  panel(ctx, hx, hy, 220, 34);
  const trackX = hx + 12;
  const trackY = hy + 11;
  roundRectPath(ctx, trackX, trackY, 196, 12, 6);
  ctx.fillStyle = '#241a1a';
  ctx.fill();
  const hp = clamp(health, 0, 100) / 100;
  if (hp > 0) {
    roundRectPath(ctx, trackX, trackY, 196 * hp, 12, 6);
    ctx.fillStyle = health > 35 ? COLORS.good : COLORS.danger;
    ctx.fill();
  }
  label(ctx, 'HP', trackX + 8, trackY + 6, 10, COLORS.uiText, 'left', '700');

  // Prompt, bottom-centre pill: the key token is accented, the rest is plain.
  if (view.prompt) {
    const prompt = String(view.prompt);
    const dash = prompt.indexOf(' — ');
    const key = dash >= 0 ? prompt.slice(0, dash) : prompt;
    const rest = dash >= 0 ? prompt.slice(dash + 3) : '';
    setFont(ctx, 18, '700');
    const keyW = ctx.measureText(key).width;
    const dashW = rest ? ctx.measureText(' — ').width : 0;
    setFont(ctx, 18, '600');
    const restW = rest ? ctx.measureText(rest).width : 0;
    const w = 36 + keyW + dashW + restW;
    const h = 38;
    const x = (VIEW.W - w) / 2;
    const y = VIEW.H - 16 - h;
    panel(ctx, x, y, w, h, h / 2);
    const cy = y + h / 2;
    label(ctx, key, x + 18, cy, 18, COLORS.accent, 'left', '700');
    if (rest) {
      label(ctx, ' — ', x + 18 + keyW, cy, 18, COLORS.uiDim, 'left', '600');
      label(ctx, rest, x + 18 + keyW + dashW, cy, 18, COLORS.uiText, 'left', '600');
    }
  }

  // Toast, centred high on the screen, fading with the countdown.
  if (view.toast && view.toastT > 0) {
    const toast = String(view.toast);
    setFont(ctx, 20, '700');
    const w = ctx.measureText(toast).width + 40;
    const h = 48;
    const x = (VIEW.W - w) / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, view.toastT);
    panel(ctx, x, 120, w, h);
    label(ctx, toast, VIEW.W / 2, 120 + h / 2, 20, COLORS.uiText, 'center', '700');
    ctx.restore();
  }
}

/** Flat minimap: land, water strip, roads, landmarks, police, objective and the player. */
export function drawMinimap(ctx, world) {
  const city = world.city;
  const mw = 216;
  const mh = 144;
  const mx = VIEW.W - 16 - mw;
  const my = VIEW.H - 16 - mh;
  const scale = mw / WORLD.W;
  const t = world.t || 0;
  const cars = world.cars || [];

  panel(ctx, mx, my, mw, mh);
  ctx.save();
  roundRectPath(ctx, mx, my, mw, mh, 10);
  ctx.clip();

  // Land and the open-water strip along the east edge.
  ctx.fillStyle = COLORS.groundGrass;
  ctx.fillRect(mx, my, mw, mh);
  const waterX = mx + city.beachX * scale;
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(waterX, my, mx + mw - waterX, mh);

  // The road grid, one line per street.
  ctx.strokeStyle = COLORS.asphaltEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < city.vRoads.length; i += 1) {
    const px = mx + city.vRoads[i] * scale;
    ctx.moveTo(px, my);
    ctx.lineTo(px, my + mh);
  }
  for (let j = 0; j < city.hRoads.length; j += 1) {
    const py = my + city.hRoads[j] * scale;
    ctx.moveTo(mx, py);
    ctx.lineTo(mx + mw, py);
  }
  ctx.stroke();

  // Landmarks: cream diner, cyan marina.
  ctx.fillStyle = COLORS.crosswalk;
  ctx.beginPath();
  ctx.arc(mx + city.diner.x * scale, my + city.diner.y * scale, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5fd8e8';
  ctx.beginPath();
  ctx.arc(mx + city.marina.x * scale, my + city.marina.y * scale, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Police cars only, flashing red/blue on a two-tone beat.
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (!car.police) continue;
    const flash = Math.floor(t * 2 + (car.id || 0)) % 2 === 0;
    ctx.fillStyle = flash ? COLORS.lightRed : COLORS.lightBlue;
    ctx.beginPath();
    ctx.arc(mx + car.x * scale, my + car.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Objective ring, pulsing.
  const objective = world.objective;
  if (objective && Number.isFinite(objective.x) && Number.isFinite(objective.y)) {
    const ox = mx + objective.x * scale;
    const oy = my + objective.y * scale;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, 5 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player dot and heading tick; use the driven car's angle when in a car.
  const player = world.player;
  if (player) {
    let angle = player.angle || 0;
    if (player.car) {
      let car = player.car;
      if (typeof car !== 'object' || !Number.isFinite(car.angle)) {
        car = null;
        for (let i = 0; i < cars.length; i += 1) {
          if (cars[i].id === player.car) {
            car = cars[i];
            break;
          }
        }
      }
      if (car && Number.isFinite(car.angle)) angle = car.angle;
    }
    const px = mx + player.x * scale;
    const py = my + player.y * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(angle) * 8, py + Math.sin(angle) * 8);
    ctx.stroke();
  }

  ctx.restore();

  // Crisp border and caption on top of the clipped map.
  roundRectPath(ctx, mx, my, mw, mh, 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.uiPanelEdge;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 6, 9, 0.55)';
  ctx.fillRect(mx + 3, my + 3, 66, 14);
  label(ctx, 'PALM BAY', mx + 7, my + 10, 9, COLORS.uiText, 'left', '700');
}

/** Title screen: warm dim wash, gradient logotype and pulsing start prompt. */
export function drawTitle(ctx, t) {
  const wash = ctx.createLinearGradient(0, 0, 0, VIEW.H);
  wash.addColorStop(0, 'rgba(20, 8, 16, 0.25)');
  wash.addColorStop(1, 'rgba(20, 8, 16, 0.78)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);

  const cx = VIEW.W / 2;
  label(ctx, 'WELCOME TO', cx, 196, 18, COLORS.uiDim, 'center', '700');

  const titleGradient = ctx.createLinearGradient(cx - 380, 0, cx + 380, 0);
  titleGradient.addColorStop(0, '#ef6b5a');
  titleGradient.addColorStop(0.5, COLORS.accent);
  titleGradient.addColorStop(1, '#3fb8af');
  setFont(ctx, 84, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(20, 8, 16, 0.92)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.strokeText('PALM BAY HEAT', cx, 270);
  ctx.fillStyle = titleGradient;
  ctx.fillText('PALM BAY HEAT', cx, 270);
  ctx.shadowBlur = 0;

  label(ctx, 'A top-down crime story in a city that never cools down.', cx, 326, 20, COLORS.uiText, 'center', '500');
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
  label(ctx, 'Click or press Enter to play', cx, 430, 24, COLORS.accent, 'center', '700');
  ctx.restore();
  label(ctx, 'H — Help · M — Mute', cx, 482, 16, COLORS.uiDim, 'center', '600');
  label(ctx, 'An original game · Not affiliated with any publisher', cx, VIEW.H - 28, 13, COLORS.uiDim, 'center', '500');
}

/** Help overlay: controls in two columns, a short explainer and a go-back footer. */
export function drawHelp(ctx) {
  dim(ctx, 'rgba(10, 6, 9, 0.78)');
  const w = 760;
  const h = 520;
  const x = (VIEW.W - w) / 2;
  const y = (VIEW.H - h) / 2;
  panel(ctx, x, y, w, h, 14);
  label(ctx, 'HOW TO PLAY', x + w / 2, y + 40, 30, COLORS.accent, 'center', '800');

  const left = [
    ['WASD / Arrows', 'Walk / drive'],
    ['F', 'Enter or exit car · take jobs'],
    ['Mouse', 'Aim'],
    ['Left click', 'Shoot'],
    ['Shift', 'Sprint / handbrake'],
  ];
  const right = [
    ['P or Esc', 'Pause'],
    ['M', 'Mute'],
    ['R', 'Resume after busted/wasted'],
  ];
  function column(rows, keyX, descX) {
    let rowY = y + 96;
    for (let i = 0; i < rows.length; i += 1) {
      label(ctx, rows[i][0], keyX, rowY, 17, COLORS.accent, 'left', '700');
      label(ctx, rows[i][1], descX, rowY, 15, COLORS.uiText, 'left', '500');
      rowY += 36;
    }
  }
  column(left, x + 40, x + 190);
  column(right, x + 400, x + 520);

  label(ctx, 'How it works', x + 40, y + 280, 18, COLORS.accent, 'left', '700');
  label(ctx, "Take jobs at Marla's diner on the coast road, watch your wanted", x + 40, y + 312, 16, COLORS.uiText, 'left', '500');
  label(ctx, 'stars, lose the heat to cool off. Money and progress save automatically.', x + 40, y + 336, 16, COLORS.uiText, 'left', '500');
  label(ctx, 'Press H or Esc to go back', x + w / 2, y + h - 28, 16, COLORS.uiDim, 'center', '600');
}

/** Pause overlay. */
export function drawPause(ctx) {
  dim(ctx, 'rgba(12, 6, 10, 0.70)');
  const cx = VIEW.W / 2;
  label(ctx, 'PAUSED', cx, 330, 54, COLORS.accent, 'center', '900');
  label(ctx, 'P or Esc — Resume · M — Mute', cx, 392, 20, COLORS.uiDim, 'center', '600');
}

/** End screen: busted, wasted or story complete, with the run's stats. */
export function drawEnd(ctx, kind, view) {
  const tint = kind === 'busted' ? 'rgba(18, 32, 60, 0.80)'
    : kind === 'wasted' ? 'rgba(60, 16, 18, 0.80)'
      : 'rgba(60, 42, 12, 0.80)';
  dim(ctx, tint);
  const word = kind === 'busted' ? 'BUSTED' : kind === 'wasted' ? 'WASTED' : 'STORY COMPLETE';
  const flavor = kind === 'busted' ? 'The cops got their man. Cool off and try again.'
    : kind === 'wasted' ? 'Palm Bay is unforgiving. Get back out there.'
      : 'You beat the city. The bay is yours now.';
  const color = kind === 'busted' ? COLORS.lightBlue : kind === 'wasted' ? COLORS.danger : COLORS.accent;
  const cx = VIEW.W / 2;
  label(ctx, word, cx, 290, kind === 'complete' ? 56 : 72, color, 'center', '900');
  label(ctx, flavor, cx, 352, 20, COLORS.uiText, 'center', '500');
  label(ctx, 'Money $ ' + (view && view.money != null ? view.money : 0), cx, 410, 22, COLORS.accent, 'center', '700');
  label(ctx, 'Best rampage ' + (view && view.rampageBest != null ? view.rampageBest : 0), cx, 442, 18, COLORS.uiDim, 'center', '600');
  label(ctx, 'Press R to keep playing', cx, VIEW.H - 70, 18, COLORS.uiText, 'center', '700');
}
