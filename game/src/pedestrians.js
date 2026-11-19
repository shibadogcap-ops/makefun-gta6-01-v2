// Sidewalk pedestrians for Palm Bay Heat: seeded strolls around block rings, short panic
// flights away from danger, and bodies that stay exactly where they fell.
//
// World coordinates are pixels (x right, y down) and angles are canvas-style radians
// (0 = +x, positive clockwise). All simulation randomness flows through the seeded
// RNG passed to spawnPeds; each ped keeps a private RNG derived from it for its turns.

import { WORLD, VIEW, COLORS } from './config.js';
import { moveCircle } from './city.js';
import { makeRng, hashSeed } from './random.js';

const RING_INSET = 58; // from a road centreline: just past the road edge, on the sidewalk
const PED_R = 10; // collision radius handed to city.moveCircle
const FLEE_TIME = 2.5;
const FLEE_MULT = 2.1;
const CROSS_CHANCE = 0.25; // chance, on arrival, of crossing to a neighbouring block
const REVERSE_CHANCE = 0.18; // chance of reversing direction around the current block
const SKINS = ['#e0ad82', '#f1c27d', '#c68642', '#8d5524', '#ffdbac'];

// Rings are derived from the road grid once per city, and cached without touching the city.
const ringCache = new WeakMap();

function buildRings(city) {
  const grid = [];
  const all = [];
  const cols = city.vRoads.length - 1;
  const rows = city.hRoads.length - 1;
  for (let col = 0; col < cols; col += 1) {
    const column = [];
    for (let row = 0; row < rows; row += 1) {
      const x0 = city.vRoads[col] + RING_INSET;
      const x1 = city.vRoads[col + 1] - RING_INSET;
      const y0 = city.hRoads[row] + RING_INSET;
      const y1 = city.hRoads[row + 1] - RING_INSET;
      const ring = {
        col, row, x0, y0, x1, y1,
        // Clockwise: top-left, top-right, bottom-right, bottom-left.
        corners: [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      };
      column.push(ring);
      all.push(ring);
    }
    grid.push(column);
  }
  return { grid, all };
}

function getRings(city) {
  let rings = ringCache.get(city);
  if (!rings) {
    rings = buildRings(city);
    ringCache.set(city, rings);
  }
  return rings;
}

/** Spawn-only guard so a ped never starts inside a solid landmark. */
function pointClear(city, x, y) {
  if (x < PED_R || y < PED_R || x > WORLD.W - PED_R || y > WORLD.H - PED_R) return false;
  if (x >= city.waterX - PED_R) return false;
  const obstacles = city.colliders || city.buildings || [];
  for (let i = 0; i < obstacles.length; i += 1) {
    const b = obstacles[i];
    if (x + PED_R > b.x && x - PED_R < b.x + b.w &&
        y + PED_R > b.y && y - PED_R < b.y + b.h) return false;
  }
  return true;
}

function nearestCorner(ring, x, y) {
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < ring.corners.length; i += 1) {
    const dx = ring.corners[i].x - x;
    const dy = ring.corners[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/** Pick the next walking waypoint: usually the next corner of this ring. */
function retarget(ped, city) {
  const rng = ped.rng;
  const { grid } = getRings(city);
  const ring = ped.ring;

  if (rng.chance(CROSS_CHANCE) && ring) {
    const neighbours = [];
    if (ring.col > 0) neighbours.push(grid[ring.col - 1][ring.row]);
    if (ring.col + 1 < grid.length) neighbours.push(grid[ring.col + 1][ring.row]);
    if (ring.row > 0) neighbours.push(grid[ring.col][ring.row - 1]);
    if (ring.row + 1 < grid[ring.col].length) neighbours.push(grid[ring.col][ring.row + 1]);
    if (neighbours.length) {
      const next = rng.pick(neighbours);
      const ci = nearestCorner(next, ped.x, ped.y);
      const corner = next.corners[ci];
      ped.ring = next;
      ped.ci = ci;
      ped.dir = rng.chance(0.5) ? 1 : -1;
      ped.tx = corner.x;
      ped.ty = corner.y;
      return;
    }
  }

  if (rng.chance(REVERSE_CHANCE)) ped.dir *= -1;
  if (ring) {
    ped.ci = (ped.ci + ped.dir + ring.corners.length) % ring.corners.length;
    const corner = ring.corners[ped.ci];
    ped.tx = corner.x;
    ped.ty = corner.y;
  }
}

/** Create n peds on the sidewalk rings of randomly chosen blocks. */
export function spawnPeds(city, rng, n) {
  const peds = [];
  const { all } = getRings(city);
  for (let i = 0; i < n; i += 1) {
    if (!all.length) break;
    const ring = rng.pick(all);

    let x = ring.x0;
    let y = ring.y0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const edge = rng.int(0, 4);
      const t = rng.range(0.12, 0.88);
      const a = ring.corners[edge];
      const b = ring.corners[(edge + 1) % 4];
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
      if (pointClear(city, x, y)) break;
      const corner = ring.corners[rng.int(0, 4)];
      if (pointClear(city, corner.x, corner.y)) {
        x = corner.x;
        y = corner.y;
        break;
      }
    }

    let ci = rng.int(0, 4);
    if (ci === nearestCorner(ring, x, y)) ci = (ci + 1) % 4;
    const target = ring.corners[ci];
    const prng = makeRng(hashSeed(`ped-${i}-${ring.col}-${ring.row}-${Math.round(x)}-${Math.round(y)}`));

    peds.push({
      x, y,
      angle: Math.atan2(target.y - y, target.x - x),
      speed: rng.range(40, 70),
      color: rng.pick(COLORS.PED_COLORS),
      skin: rng.pick(SKINS),
      r: PED_R,
      state: 'walk',
      tx: target.x,
      ty: target.y,
      health: 60,
      fleeT: 0,
      // Internal waypoint state: the ring this ped walks, its target corner and direction.
      ring, ci,
      dir: prng.chance(0.5) ? 1 : -1,
      rng: prng,
      fearX: 0,
      fearY: 0,
    });
  }
  return peds;
}

/** Advance every live ped. Dead peds are left untouched as bodies. */
export function stepPeds(peds, city, dt, scares) {
  if (!peds) return;
  for (let i = 0; i < peds.length; i += 1) {
    const ped = peds[i];
    if (ped.health <= 0) continue;

    // Find the nearest scare centre actually covering this ped.
    let danger = null;
    let bestD2 = Infinity;
    if (scares && scares.length) {
      for (let s = 0; s < scares.length; s += 1) {
        const scare = scares[s];
        if (!scare) continue;
        const dx = ped.x - scare.x;
        const dy = ped.y - scare.y;
        const d2 = dx * dx + dy * dy;
        const rr = scare.r * scare.r;
        if (d2 <= rr && d2 < bestD2) {
          bestD2 = d2;
          danger = scare;
        }
      }
    }
    if (danger) {
      const dx = ped.x - danger.x;
      const dy = ped.y - danger.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.fearX = dx / d;
      ped.fearY = dy / d;
      ped.state = 'flee';
      ped.fleeT = FLEE_TIME;
    }

    if (ped.state === 'flee') {
      const step = ped.speed * FLEE_MULT * dt;
      const pos = moveCircle(city, ped.x, ped.y, PED_R, ped.fearX * step, ped.fearY * step);
      const mx = pos.x - ped.x;
      const my = pos.y - ped.y;
      if (mx * mx + my * my > 1e-6) ped.angle = Math.atan2(my, mx);
      else ped.angle = Math.atan2(ped.fearY, ped.fearX);
      ped.x = pos.x;
      ped.y = pos.y;
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        ped.fleeT = 0;
        retarget(ped, city);
      }
      continue;
    }

    // Ordinary stroll: head for the current corner, picking a new one on arrival.
    let dx = ped.tx - ped.x;
    let dy = ped.ty - ped.y;
    let dist = Math.hypot(dx, dy);
    if (dist <= 6) {
      retarget(ped, city);
      dx = ped.tx - ped.x;
      dy = ped.ty - ped.y;
      dist = Math.hypot(dx, dy);
    }
    if (dist > 1e-4) {
      const step = Math.min(ped.speed * dt, dist);
      const pos = moveCircle(city, ped.x, ped.y, PED_R, (dx / dist) * step, (dy / dist) * step);
      const mx = pos.x - ped.x;
      const my = pos.y - ped.y;
      if (mx * mx + my * my > (step * 0.25) * (step * 0.25)) {
        ped.angle = Math.atan2(my, mx);
      } else {
        retarget(ped, city); // wedged against a wall: aim at the next corner instead
      }
      ped.x = pos.x;
      ped.y = pos.y;
    }
  }
}

/** Draw one ped in world space, culled against the viewport. */
export function drawPed(ctx, ped, cam) {
  const sx = ped.x - cam.x;
  const sy = ped.y - cam.y;
  if (sx < -30 || sy < -30 || sx > VIEW.W + 30 || sy > VIEW.H + 30) return;

  ctx.save();
  ctx.translate(sx, sy);

  // soft ground shadow
  ctx.fillStyle = 'rgba(20, 12, 14, 0.30)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(ped.angle);
  const outline = 'rgba(40, 22, 24, 0.85)';
  const skin = ped.skin || COLORS.playerSkin;

  if (ped.health <= 0) {
    // Fallen body: a darkened ellipse with the head centred, no forward offset.
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30, 16, 20, 0.55)';
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // legs
    ctx.fillStyle = 'rgba(52, 44, 56, 0.95)';
    ctx.fillRect(-2, -6, 8, 3);
    ctx.fillRect(-2, 3, 8, 3);

    // torso
    ctx.fillStyle = ped.color;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // head, slightly ahead of the torso
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(5.5, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
