// Police response for Palm Bay Heat. Heat from reported crimes drives a wanted tier, which
// sets a cap on pursuing cars. `police.cars` holds references to car objects that ALSO live
// in the shared world car list owned by main, so spawning and despawning keeps both arrays
// in sync. All randomness flows through the seeded RNG supplied by the caller (with a
// deterministic per-police-state fallback) — never Math.random.
import { WORLD, COLORS } from './config.js';
import { nearestRoadPoint, moveCircle } from './city.js';
import { createCar } from './vehicles.js';
import { makeRng, hashSeed } from './random.js';
import { shoot } from './combat.js';

/** Heat thresholds for one through five wanted stars; index 0 is an unset tier. */
const HEAT_FOR_STAR = [0, 10, 35, 75, 140, 230];
/** Number of pursuing cars fielded at each wanted tier. */
const CAP_FOR_STAR = [0, 2, 3, 4, 6, 8];
/** Heat added by each reportable crime. */
const CRIME_HEAT = {
  shot: 8,
  hitPed: 18,
  hitCar: 10,
  steal: 14,
  killPed: 45,
  killCop: 70,
  damage: 4,
};

const CAR_R = 16;
const SIGHT_RANGE = 420;
const SHOOT_RANGE = 340;
const BUST_RANGE = 64;
const SPAWN_MIN = 620;
const SPAWN_MAX = 820;
const DESPAWN_DIST = 1100;
const TURN_RATE = 2.4;
const SHOOT_COOLDOWN = 0.9;

/**
 * Fallback RNGs live off the public police state so createPolice keeps the exact contracted
 * shape. A missing world.rng (e.g. a staged screenshot) therefore stays deterministic.
 */
const fallbackRngs = new WeakMap();

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shortest signed delta from a to b, in radians. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Highest tier whose heat threshold has been met (0..5). */
function wantedFromHeat(heat) {
  let wanted = 0;
  for (let i = HEAT_FOR_STAR.length - 1; i >= 0; i -= 1) {
    if (heat >= HEAT_FOR_STAR[i]) {
      wanted = i;
      break;
    }
  }
  return wanted;
}

/** The caller's seeded RNG when present, otherwise a stable per-police-state generator. */
function rngFor(world, police) {
  if (world.rng && typeof world.rng.range === 'function') return world.rng;
  let rng = fallbackRngs.get(police);
  if (!rng) {
    rng = makeRng(hashSeed('palm-bay-heat:police'));
    fallbackRngs.set(police, rng);
  }
  return rng;
}

/** True when a single point is inside a solid (expanded by 2), over water, or out of bounds. */
function blockedPoint(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD.W || y > WORLD.H) return true;
  if (x >= city.waterX) return true;
  const obstacles = city.colliders || city.buildings || [];
  for (let i = 0; i < obstacles.length; i += 1) {
    const b = obstacles[i];
    if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2) return true;
  }
  return false;
}

/** Sample the segment between two points every 24 px; the endpoints themselves are ignored. */
function hasLineOfSight(city, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 24);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blockedPoint(city, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

/**
 * Find a road point 620-820 px from the player: sample random offset points and snap each
 * onto the street grid with nearestRoadPoint. A deterministic road-line fallback covers the
 * rare case where every sample lands too close or on top of another cruiser.
 */
function findSpawn(city, rng, px, py, cars) {
  const east = (city.waterX || WORLD.W) - 40;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(SPAWN_MIN, SPAWN_MAX);
    const p = nearestRoadPoint(city, px + Math.cos(a) * d, py + Math.sin(a) * d);
    if (!p) continue;
    const dd = Math.hypot(p.x - px, p.y - py);
    if (dd < 480 || dd > 1200) continue;
    if (p.x < 20 || p.x > east || p.y < 20 || p.y > WORLD.H - 20) continue;
    let clear = true;
    for (let i = 0; i < cars.length; i += 1) {
      if (Math.hypot(p.x - cars[i].x, p.y - cars[i].y) < 70) {
        clear = false;
        break;
      }
    }
    if (clear) return { x: p.x, y: p.y };
  }

  let x;
  let y;
  if (rng.chance(0.5)) {
    x = rng.pick(city.vRoads);
    const sign = rng.chance(0.5) ? -1 : 1;
    y = clamp(py + sign * rng.range(SPAWN_MIN, SPAWN_MAX), 20, WORLD.H - 20);
    if (Math.abs(y - py) < 400) y = clamp(py - sign * 700, 20, WORLD.H - 20);
  } else {
    y = rng.pick(city.hRoads);
    const sign = rng.chance(0.5) ? -1 : 1;
    x = clamp(px + sign * rng.range(SPAWN_MIN, SPAWN_MAX), 20, east);
    if (Math.abs(x - px) < 400) x = clamp(px - sign * 700, 20, east);
  }
  return { x, y };
}

/** Fresh police state for a new game. */
export function createPolice() {
  return { heat: 0, wanted: 0, cars: [], busted: 0, seenT: 0 };
}

/** Add heat for a crime and immediately recompute the wanted tier. */
export function reportCrime(police, kind) {
  if (!police) return;
  police.heat += CRIME_HEAT[kind] || 0;
  if (!Number.isFinite(police.heat) || police.heat < 0) police.heat = 0;
  police.wanted = wantedFromHeat(police.heat);
}

/**
 * Advance the police force one step.
 * world = { city, player, eff, rng, combat, cars } where `eff` is the player's effective
 * position (their car's centre while driving) and `cars` is the shared world car list.
 */
export function stepPolice(police, world, dt) {
  if (!police || !world || !world.city) return;
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  if (step <= 0) return;

  const city = world.city;
  const rng = rngFor(world, police);
  const shared = Array.isArray(world.cars) ? world.cars : (world.cars = []);
  const eff = world.eff || (world.player ? { x: world.player.x, y: world.player.y } : { x: 0, y: 0 });
  const px = eff.x;
  const py = eff.y;
  const cars = police.cars;
  const combat = world.combat;

  // Tick every cruiser's weapon cooldown.
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (c.cool > 0) c.cool = Math.max(0, c.cool - step);
  }

  // Line of sight within 420 px resets the "last seen" timer; heat decays faster once stale.
  let seen = false;
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (Math.hypot(c.x - px, c.y - py) <= SIGHT_RANGE
      && hasLineOfSight(city, c.x, c.y, px, py)) {
      seen = true;
      break;
    }
  }
  police.seenT = seen ? 0 : police.seenT + step;

  police.heat = Math.max(0, police.heat - (police.seenT > 2.5 ? 2.2 : 0.6) * step);
  police.wanted = wantedFromHeat(police.heat);

  // Heat gone: hand the cruisers back to ambient traffic and drop them from the pursuit list.
  // They stay in the shared car list — main continues to step and draw them.
  if (police.wanted === 0) {
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const c = cars[i];
      c.driver = 'traffic';
      c.police = false;
      c.unstick = 0;
      c.blockedT = 0;
      cars.splice(i, 1);
    }
    police.busted = Math.max(0, police.busted - step / 2);
    return;
  }

  // Retire cruisers that are too far away and have no sight line to the player.
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const c = cars[i];
    const d = Math.hypot(c.x - px, c.y - py);
    const inSight = d <= 1400 && hasLineOfSight(city, c.x, c.y, px, py);
    if (d > DESPAWN_DIST && !inSight) {
      const s = shared.indexOf(c);
      if (s >= 0) shared.splice(s, 1);
      cars.splice(i, 1);
    }
  }

  // Field the wanted-tier cap of cruisers, spawning on roads around the player.
  const cap = CAP_FOR_STAR[police.wanted] || 0;
  let spawnGuard = 0;
  while (cars.length < cap && spawnGuard < 24) {
    spawnGuard += 1;
    const spot = findSpawn(city, rng, px, py, cars);
    const angle = Math.atan2(py - spot.y, px - spot.x);
    const car = createCar(spot.x, spot.y, angle, COLORS.policeBody, {
      driver: 'police',
      police: true,
      axis: Math.abs(px - spot.x) > Math.abs(py - spot.y) ? 'h' : 'v',
      dir: Math.cos(angle) >= 0 ? 1 : -1,
    });
    car.speed = 130;
    car.cool = 0;
    car.unstick = 0;
    car.blockedT = 0;
    cars.push(car);
    shared.push(car);
  }

  // Velocity of the chased car gives a short pursuit lead; on foot it is zero.
  let pvx = 0;
  let pvy = 0;
  let effSpeed = 0;
  const playerCar = world.player && world.player.car;
  if (playerCar) {
    effSpeed = Math.abs(playerCar.speed || 0);
    if (playerCar.health > 0) {
      pvx = Math.cos(playerCar.angle) * (playerCar.speed || 0);
      pvy = Math.sin(playerCar.angle) * (playerCar.speed || 0);
    }
  }

  // Pursuit: steer toward the lead point, accelerate below the player's top speed, and
  // resolve against buildings. A car wedged on a wall briefly reverses to free itself.
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (c.health <= 0) {
      c.speed = 0;
      continue;
    }
    const dx = c.x - px;
    const dy = c.y - py;
    const d = Math.hypot(dx, dy);
    const lead = Math.min(0.55, d / 620);
    const desired = Math.atan2(py + pvy * lead - c.y, px + pvx * lead - c.x);
    c.angle += clamp(angleDelta(c.angle, desired), -TURN_RATE * step, TURN_RATE * step);

    let targetSpeed = police.wanted >= 4 ? 305 : 300;
    if (c.unstick > 0) {
      c.unstick = Math.max(0, c.unstick - step);
      targetSpeed = -110;
    } else if (d < 26) {
      // Ram range: match the player's speed rather than ploughing through them.
      targetSpeed = Math.min(targetSpeed, effSpeed);
    }
    if (c.speed < targetSpeed) c.speed = Math.min(targetSpeed, c.speed + 240 * step);
    else c.speed = Math.max(targetSpeed, c.speed - 420 * step);

    const intended = Math.abs(c.speed) * step;
    const next = moveCircle(city, c.x, c.y, CAR_R,
      Math.cos(c.angle) * c.speed * step,
      Math.sin(c.angle) * c.speed * step);
    const moved = Math.hypot(next.x - c.x, next.y - c.y);
    c.x = next.x;
    c.y = next.y;

    if (intended > 4 && moved < intended * 0.35) c.blockedT = (c.blockedT || 0) + step;
    else c.blockedT = 0;
    if (c.blockedT > 0.4) {
      c.blockedT = 0;
      c.unstick = 0.65;
      c.angle += (c.id % 2 ? 1 : -1) * 0.65;
      c.speed = -60;
    }
  }

  // Mild separation so a pack of cruisers does not collapse onto one point.
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= 30) continue;
      if (d < 0.001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const push = 30 - d;
      const nx = dx / d;
      const ny = dy / d;
      const pa = moveCircle(city, a.x, a.y, CAR_R, -nx * push * 0.25, -ny * push * 0.25);
      a.x = pa.x;
      a.y = pa.y;
      const pb = moveCircle(city, b.x, b.y, CAR_R, nx * push * 0.75, ny * push * 0.75);
      b.x = pb.x;
      b.y = pb.y;
    }
  }

  // At three stars a cruiser with a clear shot fires a slightly spread police bullet.
  if (police.wanted >= 3 && combat && combat.bullets) {
    for (let i = 0; i < cars.length; i += 1) {
      const c = cars[i];
      if (c.health <= 0 || c.cool > 0) continue;
      const dx = px - c.x;
      const dy = py - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= SHOOT_RANGE || d < 1) continue;
      if (!hasLineOfSight(city, c.x, c.y, px, py)) continue;
      const aim = Math.atan2(dy, dx) + rng.range(-0.05, 0.05);
      shoot(combat, c.x, c.y, aim, 'police');
      c.cool = SHOOT_COOLDOWN;
    }
  }

  // Being cornered by a cruiser fills the bust meter while vulnerable (on foot or slow).
  const vulnerable = !world.player || !world.player.car || effSpeed < 40;
  let close = false;
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (c.health <= 0) continue;
    if (Math.hypot(c.x - px, c.y - py) <= BUST_RANGE) {
      close = true;
      break;
    }
  }
  if (close && vulnerable) police.busted = clamp(police.busted + step / 1.6, 0, 1);
  else police.busted = Math.max(0, police.busted - step / 2);
}
