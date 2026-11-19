// The on-foot player: creation, movement/aiming, car enter/exit and the top-down figure.
// World coordinates are pixels (x right, y down); angles are radians, 0 = +x, clockwise.

import { COLORS, TUNE, VIEW } from './config.js';
import { moveCircle } from './city.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: 0,
    r: 11,
    health: 100,
    car: null,
    cool: 0,
  };
}

/** True when an exit spot overlaps another car (the only obstacles visible to tryEnterExit). */
function spotBlocked(cars, ownCar, x, y, r) {
  for (const other of cars) {
    if (other === ownCar || other.health <= 0) continue;
    const dx = other.x - x;
    const dy = other.y - y;
    const reach = r + 20; // a car is ~46x22; 20px covers most of its half-extent
    if (dx * dx + dy * dy < reach * reach) return true;
  }
  return false;
}

export function stepPlayerOnFoot(player, input, city, aimX, aimY, dt) {
  const keys = input.keys;

  let mx = 0;
  let my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

  // Diagonals must not be faster than cardinals.
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }

  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprinting ? TUNE.playerSprint : TUNE.playerSpeed;
  const pos = moveCircle(city, player.x, player.y, player.r, mx * speed * dt, my * speed * dt);
  player.x = pos.x;
  player.y = pos.y;

  // Aim with the pointer every frame, even while running.
  player.angle = Math.atan2(aimY - player.y, aimX - player.x);
  player.cool = Math.max(0, player.cool - dt);
}

export function tryEnterExit(player, cars) {
  if (player.car) {
    const car = player.car;
    // Perpendicular to the car's heading: its left side as the driver faces forward.
    const px = Math.sin(car.angle);
    const py = -Math.cos(car.angle);
    let ex = car.x + px * 14;
    let ey = car.y + py * 14;
    if (spotBlocked(cars, car, ex, ey, player.r)) {
      // Blocked — step out the other side instead.
      ex = car.x - px * 14;
      ey = car.y - py * 14;
    }
    player.x = ex;
    player.y = ey;
    if (car.driver === 'player') car.driver = 'parked';
    player.car = null;
    return 'exited';
  }

  let nearest = null;
  let bestDist = 46 * 46;
  for (const car of cars) {
    if (car.driver === 'player' || car.health <= 0) continue;
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestDist) {
      bestDist = d2;
      nearest = car;
    }
  }

  if (nearest) {
    nearest.driver = 'player';
    nearest.speed = 0;
    player.car = nearest;
    return 'entered';
  }
  return null;
}

export function drawPlayer(ctx, player, cam) {
  if (player.car) return; // the figure is hidden inside the car

  const sx = player.x - cam.x;
  const sy = player.y - cam.y;
  if (sx < -40 || sy < -40 || sx > VIEW.W + 40 || sy > VIEW.H + 40) return;

  ctx.save();
  ctx.translate(sx, sy);

  // soft ground shadow
  ctx.fillStyle = 'rgba(20, 12, 14, 0.30)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 12, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw the body in the aim frame so the head and gun point at the cursor.
  ctx.rotate(player.angle);

  const outline = 'rgba(40, 22, 24, 0.85)';

  // legs: two small dark rects offset perpendicular to the facing direction
  ctx.fillStyle = 'rgba(52, 40, 52, 0.95)';
  ctx.fillRect(-2, -7, 9, 4);
  ctx.fillRect(-2, 3, 9, 4);

  // shoulders
  ctx.fillStyle = COLORS.playerShirt;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(1, -6.5, 4.2, 0, Math.PI * 2);
  ctx.arc(1, 6.5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // torso
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.playerShirt;
  ctx.fill();
  ctx.stroke();

  // head, toward the aim direction
  ctx.beginPath();
  ctx.arc(6, 0, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.playerSkin;
  ctx.fill();
  ctx.stroke();

  // gun: short dark line from the centre toward the aim, plus a small hand dot
  ctx.strokeStyle = 'rgba(30, 26, 30, 0.95)';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(15, 0);
  ctx.stroke();
  ctx.fillStyle = COLORS.playerSkin;
  ctx.beginPath();
  ctx.arc(10, 0, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
