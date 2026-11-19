// Vehicles for Palm Bay Heat: car creation, deterministic traffic on the road graph,
// parallel-parked cars, arcade player physics and the sunset-palette car renderer.
// All randomness is derived from the seeded RNG (or stable hashes of car state) — never Math.random.
import { WORLD, VIEW, COLORS, TUNE } from './config.js';
import { nearestRoadPoint } from './city.js';
import { hashSeed } from './random.js';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

let nextCarId = 1;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function nearest(arr, v) {
  let best = arr[0];
  let bd = Infinity;
  for (const a of arr) {
    const d = Math.abs(a - v);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Stable 0..1 value from a list of integer-ish parts. */
function hashUnit(...parts) {
  return hashSeed(parts.join(':')) / 4294967296;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function shade(hex, f) {
  let s = String(hex || '#8a8a8a').replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0;
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// creation
// ---------------------------------------------------------------------------

/**
 * Build a car. `opts` may override `driver` / `police` and seed the traffic
 * bookkeeping fields used by stepTraffic.
 */
export function createCar(x, y, angle, color, opts = {}) {
  const police = !!opts.police;
  const car = {
    x, y, angle,
    speed: 0,
    w: 46,
    h: 22,
    health: 100,
    driver: opts.driver || (police ? 'police' : 'parked'),
    police,
    color: color || COLORS.CAR_COLORS[0],
    id: nextCarId++,
    cool: 0,

    // traffic-only state (harmless on other cars)
    cruise: typeof opts.cruise === 'number' ? opts.cruise : 100,
    axis: opts.axis === 'v' || opts.axis === 'h' ? opts.axis : null,
    dir: typeof opts.dir === 'number' ? opts.dir : 1,
    roadX: typeof opts.roadX === 'number' ? opts.roadX : 0,
    roadY: typeof opts.roadY === 'number' ? opts.roadY : 0,
    turnSeed: typeof opts.turnSeed === 'number' ? opts.turnSeed : 0,
    turnCool: 0,
    intKey: null,
    intTurn: null,
  };
  return car;
}

/** Fill in any traffic fields missing on a hand-built car. */
function ensureLane(car, city) {
  if (typeof car.cruise !== 'number') car.cruise = 100;
  if (typeof car.turnSeed !== 'number' || car.turnSeed === 0) {
    car.turnSeed = hashSeed(`car:${car.id}`) >>> 0;
  }
  if (car.axis !== 'v' && car.axis !== 'h') {
    const p = nearestRoadPoint(city, car.x, car.y);
    const dx = Math.abs(p.x - car.x);
    const dy = Math.abs(p.y - car.y);
    car.axis = dx > dy ? 'v' : 'h';
  }
  if (car.axis === 'v') {
    car.roadX = nearest(city.vRoads, car.x);
    if (car.dir !== 1 && car.dir !== -1) car.dir = Math.sin(car.angle) >= 0 ? 1 : -1;
  } else {
    car.roadY = nearest(city.hRoads, car.y);
    if (car.dir !== 1 && car.dir !== -1) car.dir = Math.cos(car.angle) >= 0 ? 1 : -1;
  }
}

/** n live traffic cars, snapped to a lane and kept away from the player spawn. */
export function spawnTraffic(city, rng, n) {
  const cars = [];
  const spawn = city.spawn || { x: 4240, y: 1290 };
  const east = (city.waterX || WORLD.W) - 60;

  for (let i = 0; i < n; i += 1) {
    let x = 0;
    let y = 0;
    let axis = 'h';
    let dir = 1;
    let roadX = 0;
    let roadY = 0;
    let angle = 0;

    for (let attempt = 0; attempt < 32; attempt += 1) {
      axis = rng.chance(0.5) ? 'v' : 'h';
      dir = rng.chance(0.5) ? 1 : -1;
      if (axis === 'v') {
        roadX = rng.pick(city.vRoads);
        x = roadX + (dir > 0 ? -13 : 13);
        y = rng.range(70, WORLD.H - 70);
        angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        roadY = rng.pick(city.hRoads);
        y = roadY + (dir > 0 ? 13 : -13);
        x = rng.range(60, east);
        angle = dir > 0 ? 0 : Math.PI;
      }
      if (Math.hypot(x - spawn.x, y - spawn.y) > 200) break;
    }

    const car = createCar(x, y, angle, rng.pick(COLORS.CAR_COLORS), {
      driver: 'traffic',
      axis, dir, roadX, roadY,
      cruise: rng.range(85, 140),
      turnSeed: rng.int(0, 0x7fffffff),
    });
    car.speed = car.cruise * rng.range(0.35, 1);
    cars.push(car);
  }
  return cars;
}

/** ~26 parked cars: 3 on the diner pad, 2 at the beach lot, the rest along curbs. */
export function spawnParked(city, rng) {
  const cars = [];
  const occupied = [];

  function free(x, y) {
    for (const p of occupied) {
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < 70 * 70) return false;
    }
    return true;
  }

  function add(x, y, angle, color) {
    const c = createCar(x, y, angle, color || rng.pick(COLORS.CAR_COLORS), { driver: 'parked' });
    cars.push(c);
    occupied.push({ x, y });
    return c;
  }

  // Diner pad: a tidy row facing east along the pad's west side.
  const pad = city.dinerPad || { x: 4186, y: 1080, w: 84, h: 200 };
  for (let i = 0; i < 3; i += 1) {
    add(pad.x + 28, pad.y + 24 + i * 34, 0,
      i === 0 ? COLORS.CAR_COLORS[2] : rng.pick(COLORS.CAR_COLORS));
  }

  // Beach lot: two parked cars.
  const lot = city.beachLotRect || { x: 4300, y: 2840, w: 130, h: 120 };
  for (let i = 0; i < 2; i += 1) {
    add(lot.x + 34, lot.y + 30 + i * 44, 0, rng.pick(COLORS.CAR_COLORS));
  }

  // Curbs: parallel parked at the lane edge, clear of intersections and each other.
  const rh = city.ROAD_HALF || 46;
  const edge = rh - 14;
  const east = (city.waterX || WORLD.W) - 80;
  let guard = 0;

  while (cars.length < 26 && guard < 600) {
    guard += 1;
    const vertical = rng.chance(0.5);
    const side = rng.chance(0.5) ? 1 : -1;
    let x;
    let y;
    let angle;

    if (vertical) {
      const rx = rng.pick(city.vRoads);
      x = rx + side * edge;
      y = rng.range(80, WORLD.H - 80);
      angle = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      let blocked = false;
      for (const hy of city.hRoads) {
        if (Math.abs(y - hy) < 72) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
    } else {
      const ry = rng.pick(city.hRoads);
      y = ry + side * edge;
      x = rng.range(80, east);
      angle = side > 0 ? 0 : Math.PI;
      let blocked = false;
      for (const vx of city.vRoads) {
        if (Math.abs(x - vx) < 90) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
    }

    if (!free(x, y)) continue;
    add(x, y, angle);
  }

  return cars;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------

/**
 * Drive one traffic car along the road graph. Police / player / parked cars are
 * controlled elsewhere; here they only get their cooldown ticked.
 */
export function stepTraffic(car, city, cars, dt) {
  if (car.cool > 0) car.cool = Math.max(0, car.cool - dt);
  if (car.driver !== 'traffic') return;

  ensureLane(car, city);

  // Wrecked traffic never moves again.
  if (car.health <= 0) {
    car.speed = 0;
    return;
  }

  if (car.turnCool > 0) car.turnCool = Math.max(0, car.turnCool - dt);

  // --- intersection approach: one latched 35% turn decision per approach ---
  const crossing = car.axis === 'v' ? city.hRoads : city.vRoads;
  const along = car.axis === 'v' ? car.y : car.x;
  let crossIdx = 0;
  let crossDist = Infinity;
  for (let i = 0; i < crossing.length; i += 1) {
    const d = Math.abs(along - crossing[i]);
    if (d < crossDist) {
      crossDist = d;
      crossIdx = i;
    }
  }

  if (crossDist < 30) {
    const key = `${car.axis}:${car.dir}:${crossIdx}`;
    if (car.intKey !== key) {
      car.intKey = key;
      car.intTurn = false;
      if (car.turnCool <= 0) {
        const roll = hashUnit(car.id, car.turnSeed, crossIdx, car.axis, car.dir, 'turn');
        if (roll < 0.35) {
          const newDir = hashUnit(car.turnSeed, car.id, crossIdx, car.axis, 'dir') < 0.5 ? 1 : -1;
          if (car.axis === 'v') {
            car.axis = 'h';
            car.dir = newDir;
            car.roadY = crossing[crossIdx];
          } else {
            car.axis = 'v';
            car.dir = newDir;
            car.roadX = crossing[crossIdx];
          }
          car.turnCool = 0.9;
          car.intKey = null;
          car.intTurn = null;
        }
      }
    }
  } else {
    car.intKey = null;
    car.intTurn = null;
  }

  // --- lane target and heading ---
  let laneCoord;
  let targetAngle;
  if (car.axis === 'v') {
    laneCoord = car.roadX + (car.dir > 0 ? -13 : 13);
    const corr = clamp((laneCoord - car.x) * 0.02, -0.4, 0.4);
    targetAngle = (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (car.dir > 0 ? -corr : corr);
  } else {
    laneCoord = car.roadY + (car.dir > 0 ? 13 : -13);
    const corr = clamp((laneCoord - car.y) * 0.02, -0.4, 0.4);
    targetAngle = (car.dir > 0 ? 0 : Math.PI) + (car.dir > 0 ? corr : -corr);
  }
  car.angle += clamp(angleDelta(car.angle, targetAngle), -3.4 * dt, 3.4 * dt);

  // --- car ahead: match speed / stop smoothly ---
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let target = car.cruise;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    const isPlayer = other.driver === 'player';
    const follow = isPlayer ? 78 : 58;
    if (forward <= 0 || forward > follow) continue;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (lateral >= (isPlayer ? 22 : 16)) continue;
    const otherSpeed = Math.max(0, other.speed || 0);
    const cap = forward < 22
      ? 0
      : Math.max(0, otherSpeed - (isPlayer ? 4 : 8)) * Math.min(1, forward / 34);
    if (cap < target) target = cap;
  }

  if (car.speed < target) car.speed = Math.min(target, car.speed + 150 * dt);
  else car.speed = Math.max(target, car.speed - 300 * dt);
  if (car.speed < 0) car.speed = 0;

  // --- integrate, then a gentle pull back onto the lane line ---
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;
  const nudge = 90 * dt;
  if (car.axis === 'v') car.x += clamp(laneCoord - car.x, -nudge, nudge);
  else car.y += clamp(laneCoord - car.y, -nudge, nudge);

  if (car.axis === 'v') car.roadX = nearest(city.vRoads, car.x);
  else car.roadY = nearest(city.hRoads, car.y);

  // --- wrap at the world edge (and before the water on eastbound roads) ---
  const east = (city.waterX || WORLD.W) - 26;
  if (car.axis === 'h') {
    if (car.x > east) {
      car.x = 26;
      car.intKey = null;
    } else if (car.x < -26) {
      car.x = east;
      car.intKey = null;
    }
  } else if (car.y > WORLD.H + 26) {
    car.y = -26;
    car.intKey = null;
  } else if (car.y < -26) {
    car.y = WORLD.H + 26;
    car.intKey = null;
  }
}

/**
 * Arcade physics for the player's car. Collision with the city is the caller's
 * job (via city.moveCircle); this only changes speed, heading and position.
 */
export function stepCarPhysics(car, dt, input) {
  if (car.cool > 0) car.cool = Math.max(0, car.cool - dt);
  if (car.health <= 0) {
    car.speed = 0;
    return;
  }

  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const braking = !!input.brake;
  const handbrake = braking && Math.abs(car.speed) > 120;

  // throttle / reverse
  if (throttle > 0) {
    car.speed = Math.min(TUNE.carMaxSpeed, car.speed + TUNE.carAccel * throttle * dt);
  } else if (throttle < 0) {
    car.speed = Math.max(-TUNE.carMaxReverse, car.speed + TUNE.carAccel * throttle * dt);
  }

  // rolling drag when coasting
  if (throttle === 0) car.speed *= Math.pow(0.6, dt);

  // brake / handbrake
  if (braking) {
    const decel = handbrake ? 620 : 420;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - decel * dt);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + decel * dt);
  }

  if (throttle === 0 && Math.abs(car.speed) < 0.5) car.speed = 0;

  // steering: slow cars barely turn, reverse keeps the same steer sense
  const speedFactor = clamp(car.speed / 120, -1, 1);
  let turn = steer * TUNE.carTurn * dt * speedFactor * (car.speed < 0 ? -1 : 1);
  if (handbrake) turn *= 1.5;
  car.angle += turn;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

export function drawCar(ctx, car, cam) {
  const sx = car.x - cam.x;
  const sy = car.y - cam.y;
  if (sx < -80 || sy < -80 || sx > VIEW.W + 80 || sy > VIEW.H + 80) return;

  const wrecked = car.health <= 0;
  const body = car.police ? COLORS.policeBody : car.color;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);

  // soft ground shadow
  ctx.fillStyle = 'rgba(20, 12, 14, 0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 4, 27, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  roundRect(ctx, -23, -11, 46, 22, 5);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = shade(body, 0.7);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (car.police) {
    ctx.fillStyle = COLORS.policeTrim;
    ctx.fillRect(14, -10, 9, 20);
    ctx.fillRect(-23, -10, 9, 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fillRect(-12, -10, 24, 20);
    ctx.strokeStyle = 'rgba(30, 40, 60, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -10, 24, 20);
  }

  // cabin set toward the rear third
  roundRect(ctx, -14, -8, 20, 16, 4);
  ctx.fillStyle = car.police ? shade(COLORS.policeTrim, 1.4) : shade(car.color, 0.68);
  ctx.fill();

  // windshield band + rear window
  ctx.fillStyle = 'rgba(206, 226, 234, 0.78)';
  roundRect(ctx, 1.5, -7.5, 4.5, 15, 1.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 140, 150, 0.7)';
  roundRect(ctx, -13, -7.5, 3.5, 15, 1.2);
  ctx.fill();

  if (!wrecked) {
    // headlights
    ctx.fillStyle = '#fff6d2';
    ctx.beginPath();
    ctx.arc(20, -6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, 6, 3, 0, Math.PI * 2);
    ctx.fill();
    // taillights
    ctx.fillStyle = '#e25046';
    ctx.fillRect(-23, -8, 3, 4);
    ctx.fillRect(-23, 4, 3, 4);

    if (car.police) {
      // light bar: both colours lit with a white centre (stable for screenshots)
      ctx.fillStyle = COLORS.lightRed;
      ctx.fillRect(-3, -9, 7, 7);
      ctx.fillStyle = COLORS.lightBlue;
      ctx.fillRect(-3, 2, 7, 7);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillRect(-1, -2, 3, 4);
    }
  }

  // damage scratches
  if (car.health < 60) {
    ctx.strokeStyle = 'rgba(45, 45, 50, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.lineTo(2, -6);
    ctx.moveTo(-4, 8);
    ctx.lineTo(7, 10);
    ctx.moveTo(10, -3);
    ctx.lineTo(15, -5);
    ctx.stroke();
  }

  // smoke puffs (hash of id + position so they flicker as the car moves)
  if (car.health < 35) {
    const seed = Math.floor(car.x + car.y);
    for (let i = 0; i < 3; i += 1) {
      const h = hashUnit(car.id, seed, i, 'smoke');
      const px = -6 - h * 14 - i * 4;
      const py = -14 - ((h * 37) % 1) * 10 - i * 5;
      ctx.globalAlpha = 0.3 - i * 0.06;
      ctx.fillStyle = '#7d7f84';
      ctx.beginPath();
      ctx.ellipse(px, py, 5 + i * 2, 4 + i, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // burnt wreck overlay: dark, no lights (lights were skipped above)
  if (wrecked) {
    ctx.fillStyle = 'rgba(15, 12, 14, 0.62)';
    roundRect(ctx, -23, -11, 46, 22, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 8, 8, 0.5)';
    ctx.beginPath();
    ctx.ellipse(-4, 0, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
