// The city: a deterministic, seeded street grid with buildings, parking lots, palms and the
// fixed landmarks (diner, garage, marina, beach lot). All simulation randomness flows through
// the seeded RNG passed to generateCity. Drawing is world-space, translated once by the camera.
import { WORLD, VIEW, COLORS } from './config.js';
import { makeRng } from './random.js';

const ROAD_HALF = 46;
const SIDEWALK = 14;

/** District used for ground tint and building height. */
function districtFor(col, row, colCount, rowCount) {
  if (col === colCount - 1) return 'beach';
  if (col >= colCount - 2 && row >= rowCount - 2) return 'marina';
  if (col >= 2 && col <= 4 && row >= 2 && row <= 5) return 'downtown';
  return 'suburb';
}

/** Precompute a deterministic window grid in building-local coordinates. */
function makeWindows(w, h, winSeed) {
  const wrng = makeRng(winSeed);
  const windows = [];
  const ww = 7;
  const wh = 9;
  const gx = 9;
  const gy = 11;
  const start = 9;
  for (let y = start; y + wh <= h - 6; y += wh + gy) {
    for (let x = start; x + ww <= w - 6; x += ww + gx) {
      windows.push({ x, y, w: ww, h: wh, lit: wrng.chance(0.42) });
    }
  }
  return windows;
}

/** Fill one block with 1-4 buildings laid out on a small 2x2 grid with gaps. */
function addBuildings(city, block, rng) {
  const margin = 30;
  const bx = block.x + margin;
  const by = block.y + margin;
  const innerW = block.w - margin * 2;
  const innerH = block.h - margin * 2;
  if (innerW < 40 || innerH < 40) return;

  const gap = 18;
  const nx = innerW >= 300 ? 2 : 1;
  const ny = innerH >= 160 ? 2 : 1;
  const cells = [];
  for (let cy = 0; cy < ny; cy += 1) {
    for (let cx = 0; cx < nx; cx += 1) cells.push({ cx, cy });
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i + 1);
    const tmp = cells[i];
    cells[i] = cells[j];
    cells[j] = tmp;
  }
  const count = Math.min(cells.length, rng.int(1, 5));
  const cw = (innerW - gap * (nx - 1)) / nx;
  const ch = (innerH - gap * (ny - 1)) / ny;

  for (let k = 0; k < count; k += 1) {
    const { cx, cy } = cells[k];
    const insetX = rng.range(2, Math.min(16, cw * 0.18));
    const insetY = rng.range(2, Math.min(16, ch * 0.18));
    const w = Math.max(26, cw - insetX * 2);
    const h = Math.max(24, ch - insetY * 2);
    const x = bx + cx * (cw + gap) + insetX;
    const y = by + cy * (ch + gap) + insetY;

    let hgt;
    if (block.district === 'downtown') hgt = rng.range(46, 120);
    else if (block.district === 'suburb') hgt = rng.range(14, 30);
    else hgt = rng.range(20, 48);

    const winSeed = rng.int(0, 0x7fffffff);
    city.buildings.push({
      x, y, w, h, hgt,
      color: rng.pick(COLORS.BUILDING_COLORS),
      district: block.district,
      winSeed,
      windows: makeWindows(w, h, winSeed),
    });
  }
}

/** Scatter decorative palms along the beach, the coast road and the grove blocks. */
function addPalms(city, rng) {
  const beachMinX = city.beachX - 55;
  const beachMaxX = city.waterX - 35;

  for (let i = 0; i < 56; i += 1) {
    city.palms.push({
      x: rng.range(beachMinX, beachMaxX),
      y: rng.range(30, WORLD.H - 30),
      s: rng.range(0.8, 1.3),
    });
  }
  for (let i = 0; i < 34; i += 1) {
    const side = rng.chance(0.5) ? -1 : 1;
    city.palms.push({
      x: city.vRoads[city.vRoads.length - 1] + side * rng.range(54, 78),
      y: rng.range(30, WORLD.H - 30),
      s: rng.range(0.85, 1.25),
    });
  }
  for (const lot of city.lots) {
    if (!lot.grove) continue;
    const count = rng.int(3, 7);
    for (let i = 0; i < count; i += 1) {
      city.palms.push({
        x: rng.range(lot.x + 14, Math.max(lot.x + 15, lot.x + lot.w - 14)),
        y: rng.range(lot.y + 14, Math.max(lot.y + 15, lot.y + lot.h - 14)),
        s: rng.range(0.8, 1.3),
      });
    }
  }
  while (city.palms.length < 140) {
    city.palms.push({
      x: rng.range(beachMinX, beachMaxX),
      y: rng.range(30, WORLD.H - 30),
      s: rng.range(0.8, 1.3),
    });
  }
}

/** Build the whole city from the seeded RNG. */
export function generateCity(rng) {
  const vRoads = [];
  for (let i = 0; i <= 6; i += 1) vRoads.push(340 + i * 600);
  vRoads.push(4240); // coast road

  const hRoads = [];
  for (let j = 0; j <= 7; j += 1) hRoads.push(260 + j * 368);

  const beachX = 4300;
  const waterX = 4580;

  const city = {
    vRoads,
    hRoads,
    buildings: [],
    palms: [],
    lots: [],
    diner: { x: 4150, y: 1180 },
    marina: { x: 4460, y: 2560 },
    garage: { x: 1540, y: 990 },
    beachLot: { x: 4330, y: 2900 },
    spawn: { x: 4240, y: 1290 },
    beachX,
    waterX,
    ROAD_HALF,
    sidewalk: SIDEWALK,
  };

  const dinerRect = { x: 4118, y: 1158, w: 64, h: 44 };
  const garageRect = { x: 1480, y: 960, w: 120, h: 60 };
  city.dinerRect = dinerRect;
  city.garageRect = garageRect;
  city.dinerPad = { x: 4186, y: 1080, w: 84, h: 200 };
  city.beachLotRect = { x: 4300, y: 2840, w: 130, h: 120 };

  const colCount = vRoads.length - 1;
  const rowCount = hRoads.length - 1;
  for (let col = 0; col < colCount; col += 1) {
    for (let row = 0; row < rowCount; row += 1) {
      const bx = vRoads[col] + ROAD_HALF + SIDEWALK;
      const by = hRoads[row] + ROAD_HALF + SIDEWALK;
      const bw = vRoads[col + 1] - ROAD_HALF - SIDEWALK - bx;
      const bh = hRoads[row + 1] - ROAD_HALF - SIDEWALK - by;
      const block = {
        x: bx, y: by, w: bw, h: bh, col, row,
        district: districtFor(col, row, colCount, rowCount),
      };

      // The diner block stays clear of random buildings; its pad is drawn separately.
      if (col === colCount - 1 && row === 2) continue;
      // A small plaza around the garage stays clear and reads as a parking lot.
      if (col === 2 && (row === 1 || row === 2)) {
        city.lots.push({ x: bx, y: by, w: bw, h: bh, district: block.district });
        continue;
      }

      const skipChance = block.district === 'beach' ? 0.32
        : block.district === 'marina' ? 0.22 : 0.14;
      if (rng.chance(skipChance)) {
        city.lots.push({
          x: bx, y: by, w: bw, h: bh,
          district: block.district,
          grove: rng.chance(0.5),
        });
        continue;
      }
      addBuildings(city, block, rng);
    }
  }

  addPalms(city, rng);

  // Solid obstacles include the two drawn landmarks so they cannot be walked through.
  city.colliders = city.buildings.concat([
    { x: dinerRect.x, y: dinerRect.y, w: dinerRect.w, h: dinerRect.h },
    { x: garageRect.x, y: garageRect.y, w: garageRect.w, h: garageRect.h },
  ]);

  return city;
}

/** True on any road lane, the diner pad, or the beach parking area. Sand and water are not road. */
export function isRoad(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD.W || y > WORLD.H) return false;
  const rh = city.ROAD_HALF;
  for (const vx of city.vRoads) if (Math.abs(x - vx) <= rh) return true;
  for (const hy of city.hRoads) if (Math.abs(y - hy) <= rh) return true;
  const pad = city.dinerPad;
  if (x >= pad.x && x <= pad.x + pad.w && y >= pad.y && y <= pad.y + pad.h) return true;
  const lot = city.beachLotRect;
  if (x >= lot.x && x <= lot.x + lot.w && y >= lot.y && y <= lot.y + lot.h) return true;
  return false;
}

/** Nearest point on a vertical or horizontal road centre line. */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const vx of city.vRoads) {
    const d = Math.abs(x - vx);
    if (d < bestDist) {
      bestDist = d;
      best = { x: vx, y: Math.max(0, Math.min(WORLD.H, y)) };
    }
  }
  for (const hy of city.hRoads) {
    const d = Math.abs(y - hy);
    if (d < bestDist) {
      bestDist = d;
      best = { x: Math.max(0, Math.min(WORLD.W, x)), y: hy };
    }
  }
  return best || { x, y };
}

/** Axis-separated circle-vs-AABB resolution plus world/water clamps. */
export function moveCircle(city, x, y, r, dx, dy) {
  const obstacles = city.colliders || city.buildings;

  let nx = x + dx;
  for (const b of obstacles) {
    if (nx + r > b.x && nx - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) {
      if (dx > 0) nx = b.x - r;
      else if (dx < 0) nx = b.x + b.w + r;
    }
  }
  if (nx > city.waterX - r) nx = city.waterX - r;
  nx = Math.max(r, Math.min(WORLD.W - r, nx));

  let ny = y + dy;
  for (const b of obstacles) {
    if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
      if (dy > 0) ny = b.y - r;
      else if (dy < 0) ny = b.y + b.h + r;
    }
  }
  ny = Math.max(r, Math.min(WORLD.H - r, ny));

  return { x: nx, y: ny };
}

/** Zebra stripes on the four approaches of an intersection. */
function drawCrosswalk(ctx, vx, vy, rh) {
  ctx.fillStyle = COLORS.crosswalk;
  ctx.globalAlpha = 0.82;
  for (const yy of [vy - rh - 20, vy + rh + 4]) {
    for (let x = vx - rh + 6; x <= vx + rh - 12; x += 14) ctx.fillRect(x, yy, 7, 16);
  }
  for (const xx of [vx - rh - 20, vx + rh + 4]) {
    for (let y = vy - rh + 6; y <= vy + rh - 12; y += 14) ctx.fillRect(xx, y, 16, 7);
  }
  ctx.globalAlpha = 1;
}

/** One decorative palm: curved trunk, six drooping fronds and a coconut. */
function drawPalm(ctx, p) {
  const { x, y, s } = p;
  const topX = x + 6 * s;
  const topY = y - 34 * s;

  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.palmTrunk;
  ctx.lineWidth = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 2 * s, y - 18 * s, topX, topY);
  ctx.stroke();

  ctx.lineWidth = 2.4 * s;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const len = 18 * s + (i % 2) * 5 * s;
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.7 + 8 * s;
    ctx.strokeStyle = i % 2 ? COLORS.palmLeaf : COLORS.palmLeafDark;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * len * 0.6,
      topY + Math.sin(a) * len * 0.5 - 4 * s,
      ex, ey,
    );
    ctx.stroke();
  }

  ctx.fillStyle = '#6b4a2c';
  ctx.beginPath();
  ctx.arc(topX, topY + 3 * s, 2.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'butt';
}

/** Draw the visible slice of the city. */
export function drawCity(ctx, city, cam) {
  const W = WORLD.W;
  const H = WORLD.H;
  const vx0 = cam.x;
  const vy0 = cam.y;
  const vx1 = cam.x + VIEW.W;
  const vy1 = cam.y + VIEW.H;
  const rh = city.ROAD_HALF;
  const visible = (x, y, w, h) => !(x + w < vx0 || x > vx1 || y + h < vy0 || y > vy1);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // 1. ground base per district
  ctx.fillStyle = COLORS.groundSuburb;
  ctx.fillRect(0, 0, W, H);
  const dtx = city.vRoads[2] - rh;
  const dty = city.hRoads[2] - rh;
  ctx.fillStyle = COLORS.groundDowntown;
  ctx.fillRect(dtx, dty, city.vRoads[4] + rh - dtx, city.hRoads[5] + rh - dty);
  const bdx = city.vRoads[city.vRoads.length - 1] - rh;
  if (visible(bdx, 0, city.beachX - bdx, H)) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(bdx, 0, city.beachX - bdx, H);
    ctx.globalAlpha = 1;
  }

  // 2. sand strip
  if (visible(city.beachX, 0, city.waterX - city.beachX, H)) {
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(city.beachX, 0, city.waterX - city.beachX, H);
  }

  // 3. water with deep band and static wave strokes
  if (visible(city.waterX, 0, W - city.waterX, H)) {
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(city.waterX, 0, W - city.waterX, H);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(W - 70, 0, 70, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    for (let y = 60; y < H; y += 150) {
      ctx.beginPath();
      for (let x = city.waterX + 12; x < W - 12; x += 12) {
        const yy = y + Math.sin((x + y) * 0.03) * 3;
        if (x === city.waterX + 12) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // 4. roads: sidewalks, asphalt, edges and dashed centre lines
  for (const rx of city.vRoads) {
    if (rx + rh + 12 < vx0 || rx - rh - 12 > vx1) continue;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(rx - rh - 8, 0, 8, H);
    ctx.fillRect(rx + rh, 0, 8, H);
    ctx.fillStyle = COLORS.asphaltEdge;
    ctx.fillRect(rx - rh - 2, 0, 2, H);
    ctx.fillRect(rx + rh, 0, 2, H);
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(rx - rh, 0, rh * 2, H);
    ctx.fillStyle = COLORS.roadLine;
    const y0 = Math.floor(vy0 / 48) * 48;
    for (let y = y0; y < vy1; y += 48) ctx.fillRect(rx - 1.5, y + 8, 3, 22);
  }
  for (const ry of city.hRoads) {
    if (ry + rh + 12 < vy0 || ry - rh - 12 > vy1) continue;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(0, ry - rh - 8, W, 8);
    ctx.fillRect(0, ry + rh, W, 8);
    ctx.fillStyle = COLORS.asphaltEdge;
    ctx.fillRect(0, ry - rh - 2, W, 2);
    ctx.fillRect(0, ry + rh, W, 2);
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(0, ry - rh, W, rh * 2);
    ctx.fillStyle = COLORS.roadLine;
    const x0 = Math.floor(vx0 / 48) * 48;
    for (let x = x0; x < vx1; x += 48) ctx.fillRect(x + 8, ry - 1.5, 22, 3);
  }

  // 5. crosswalks at every second intersection
  for (let i = 0; i < city.vRoads.length; i += 2) {
    for (let j = 0; j < city.hRoads.length; j += 2) {
      const cx = city.vRoads[i];
      const cy = city.hRoads[j];
      if (visible(cx - rh - 24, cy - rh - 24, rh * 2 + 48, rh * 2 + 48)) {
        drawCrosswalk(ctx, cx, cy, rh);
      }
    }
  }

  // 6. diner pad
  const pad = city.dinerPad;
  if (visible(pad.x, pad.y, pad.w, pad.h)) {
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
    ctx.strokeStyle = 'rgba(241,220,172,0.5)';
    ctx.lineWidth = 1;
    for (let y = pad.y + 12; y < pad.y + pad.h - 8; y += 26) {
      ctx.beginPath();
      ctx.moveTo(pad.x + 6, y);
      ctx.lineTo(pad.x + pad.w - 6, y);
      ctx.stroke();
    }
  }

  // 7. parking-lot blocks with stall lines
  for (const lot of city.lots) {
    if (!visible(lot.x, lot.y, lot.w, lot.h)) continue;
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(241,220,172,0.32)';
    ctx.lineWidth = 1;
    for (let y = lot.y + 16; y < lot.y + lot.h - 10; y += 30) {
      ctx.beginPath();
      ctx.moveTo(lot.x + 10, y);
      ctx.lineTo(lot.x + lot.w - 10, y);
      ctx.stroke();
    }
    for (let x = lot.x + 20; x < lot.x + lot.w - 10; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, lot.y + 8);
      ctx.lineTo(x, lot.y + lot.h - 8);
      ctx.stroke();
    }
  }

  // 8. buildings
  for (const b of city.buildings) {
    if (!visible(b.x - 20, b.y - 20, b.w + 40, b.h + 40)) continue;
    const off = b.hgt * 0.18;
    ctx.fillStyle = COLORS.buildingShadow;
    ctx.fillRect(b.x + off, b.y + off, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const band = b.hgt * 0.35;
    ctx.fillStyle = 'rgba(30,16,20,0.26)';
    ctx.fillRect(b.x, b.y + b.h - band, b.w, band);
    for (const win of b.windows) {
      ctx.fillStyle = win.lit ? COLORS.windowLit : COLORS.windowDark;
      ctx.fillRect(b.x + win.x, b.y + win.y, win.w, win.h);
    }
    ctx.strokeStyle = 'rgba(40,24,28,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }

  // 9. the diner: cream body, coral awning, sign
  const d = city.dinerRect;
  if (visible(d.x - 10, d.y - 40, d.w + 20, d.h + 50)) {
    ctx.fillStyle = COLORS.buildingShadow;
    ctx.fillRect(d.x + 8, d.y + 8, d.w, d.h);
    ctx.fillStyle = '#f2e4c4';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = COLORS.dinerRoof;
    ctx.fillRect(d.x, d.y, d.w, 8);
    const ay = d.y + d.h - 2;
    for (let x = d.x; x < d.x + d.w; x += 18) {
      ctx.fillStyle = COLORS.dinerRoof;
      ctx.fillRect(x, ay, 9, 10);
      ctx.fillStyle = '#f2e4c4';
      ctx.fillRect(x + 9, ay, 9, 10);
    }
    ctx.fillStyle = '#5a2b28';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("MARLA'S", d.x + d.w / 2, d.y - 12);
  }

  // 10. the garage: low building, teal door band, AUTO sign
  const g = city.garageRect;
  if (visible(g.x - 10, g.y - 20, g.w + 20, g.h + 30)) {
    ctx.fillStyle = COLORS.buildingShadow;
    ctx.fillRect(g.x + 8, g.y + 8, g.w, g.h);
    ctx.fillStyle = '#bdb7a8';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = '#2f9e97';
    ctx.fillRect(g.x + 4, g.y + g.h - 20, g.w - 8, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = g.x + 12; x < g.x + g.w - 8; x += 18) ctx.fillRect(x, g.y + g.h - 20, 2, 16);
    ctx.fillStyle = '#33424a';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AUTO', g.x + g.w / 2, g.y + g.h / 2 - 4);
  }

  // 11. marina piers, posts and moored boats
  const pierStart = city.waterX - 40;
  const pierEnd = city.waterX + 120;
  if (visible(pierStart, 2420, pierEnd - pierStart + 40, 280)) {
    for (const py of [2440, 2560, 2680]) {
      ctx.fillStyle = COLORS.pier;
      ctx.fillRect(pierStart, py - 8, pierEnd - pierStart, 16);
      ctx.fillStyle = 'rgba(60,40,24,0.35)';
      for (let x = pierStart + 8; x < pierEnd; x += 14) ctx.fillRect(x, py - 8, 2, 16);
      ctx.fillStyle = '#5b4430';
      for (let x = pierStart + 10; x < pierEnd; x += 30) {
        ctx.fillRect(x, py + 8, 4, 12);
        ctx.fillRect(x, py - 20, 4, 12);
      }
    }
    const boats = [
      { x: 4720, y: 2440, c: COLORS.CAR_COLORS[0] },
      { x: 4740, y: 2560, c: COLORS.CAR_COLORS[1] },
      { x: 4705, y: 2680, c: COLORS.CAR_COLORS[2] },
    ];
    for (const boat of boats) {
      ctx.fillStyle = boat.c;
      ctx.beginPath();
      ctx.ellipse(boat.x, boat.y, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4efe2';
      ctx.fillRect(boat.x - 5, boat.y - 6, 10, 7);
    }
  }

  // 12. lighthouse on the sand
  if (visible(4480, 285, 50, 80)) {
    const lx = 4505;
    const ly = 330;
    ctx.fillStyle = 'rgba(48,26,30,0.25)';
    ctx.fillRect(lx - 6, ly - 22, 20, 56);
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(lx - 10, ly - 26, 20, 56);
    ctx.fillStyle = '#d94f45';
    ctx.fillRect(lx - 10, ly - 12, 20, 8);
    ctx.fillRect(lx - 10, ly + 12, 20, 8);
    ctx.beginPath();
    ctx.moveTo(lx - 12, ly - 26);
    ctx.lineTo(lx, ly - 38);
    ctx.lineTo(lx + 12, ly - 26);
    ctx.closePath();
    ctx.fillStyle = '#b23b34';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,232,150,0.30)';
    ctx.beginPath();
    ctx.arc(lx, ly - 30, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath();
    ctx.arc(lx, ly - 30, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 13. palms
  for (const p of city.palms) {
    if (!visible(p.x - 30 * p.s, p.y - 48 * p.s, 60 * p.s, 72 * p.s)) continue;
    drawPalm(ctx, p);
  }

  ctx.restore();
}
