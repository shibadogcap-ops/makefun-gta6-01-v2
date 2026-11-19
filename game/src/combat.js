// Bullet combat for Palm Bay Heat. Bullets are small, fast projectiles that travel in a
// straight line, die silently on buildings/water/world edges, and deliver one onHit callback
// to the first opposing target they touch. Targets are rebuilt by the caller every frame,
// so nothing is retained between calls. No randomness is involved.

import { WORLD, VIEW, COLORS, TUNE } from './config.js';

const SPEED = TUNE.bulletSpeed;
const LIFE = TUNE.bulletLife;

export function createCombat() {
  return { bullets: [] };
}

/** Fire one exactly-aimed shot for the given side ('player' or 'police'). */
export function shoot(combat, x, y, angle, side) {
  if (!combat || !combat.bullets) return;
  combat.bullets.push({
    x,
    y,
    angle,
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
    life: LIFE,
    side,
  });
}

/** True when a point is outside the world, over water, or inside a solid building. */
function pointBlocked(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD.W || y > WORLD.H) return true;
  if (x >= city.waterX) return true;
  const obstacles = city.colliders || city.buildings || [];
  for (let i = 0; i < obstacles.length; i += 1) {
    const b = obstacles[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** A target is hittable while it has no ref, or while that ref is still alive. */
function targetAlive(target) {
  const ref = target.ref;
  return !ref || !(ref.health <= 0);
}

/** One collision test at a point. Returns true when the bullet must stop. */
function testPoint(city, x, y, targets, bullet, onHit) {
  if (pointBlocked(city, x, y)) return true;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (!target || target.side === bullet.side || !targetAlive(target)) continue;
    const dx = x - target.x;
    const dy = y - target.y;
    if (dx * dx + dy * dy < target.r * target.r) {
      if (typeof onHit === 'function') {
        onHit({ target, side: bullet.side, x, y });
      }
      return true;
    }
  }
  return false;
}

/** Move bullets in two sub-steps so 950 px/s shots cannot tunnel through thin targets. */
export function stepCombat(combat, city, targets, dt, onHit) {
  if (!combat || !combat.bullets) return;
  const bullets = combat.bullets;
  const list = targets || [];
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    let dead = false;
    const halfX = bullet.vx * dt * 0.5;
    const halfY = bullet.vy * dt * 0.5;
    for (let sub = 0; sub < 2 && !dead; sub += 1) {
      bullet.x += halfX;
      bullet.y += halfY;
      if (testPoint(city, bullet.x, bullet.y, list, bullet, onHit)) dead = true;
    }
    bullet.life -= dt;
    if (dead || bullet.life <= 0) bullets.splice(i, 1);
  }
}

/** Draw the live tracers as short glowing 5 px dashes along their velocity. */
export function drawBullets(ctx, combat, cam) {
  if (!combat || !combat.bullets || !combat.bullets.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.bullet;
  for (let i = 0; i < combat.bullets.length; i += 1) {
    const b = combat.bullets[i];
    const sx = b.x - cam.x;
    const sy = b.y - cam.y;
    if (sx < -8 || sy < -8 || sx > VIEW.W + 8 || sy > VIEW.H + 8) continue;
    const speed = Math.hypot(b.vx, b.vy) || 1;
    const ux = (b.vx / speed) * 2.5;
    const uy = (b.vy / speed) * 2.5;
    const x1 = sx - ux;
    const y1 = sy - uy;
    const x2 = sx + ux;
    const y2 = sy + uy;

    // soft halo, then the crisp core
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}
