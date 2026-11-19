// Deterministic screenshot staging for Palm Bay Heat. Each scene mutates the freshly built
// world handed over by main.js into a fixed, repeatable frame and reports which screen to draw
// over it. All randomness already happened in the seeded spawners; staging itself never rolls
// a die, so a given seed always produces the same picture.
import { COLORS } from './config.js';
import { createCar } from './vehicles.js';

/** Heat thresholds for one through five wanted stars (mirrors police.js). */
const HEAT_STARS = [10, 35, 75, 140, 230];

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Set heat and the derived wanted tier together so the HUD stars match the scene. */
function setHeat(police, heat) {
  if (!police) return;
  police.heat = Math.max(0, heat);
  let wanted = 0;
  for (let i = 0; i < HEAT_STARS.length; i += 1) {
    if (police.heat >= HEAT_STARS[i]) wanted = i + 1;
  }
  police.wanted = wanted;
  police.busted = 0;
  police.seenT = 0;
}

/** Drop any pursuit cars left from an earlier stage, then zero the police state. */
function clearPolice(world) {
  const police = world.police;
  if (police && Array.isArray(police.cars)) {
    police.cars.length = 0;
  }
  const traffic = world.traffic;
  if (Array.isArray(traffic)) {
    for (let i = traffic.length - 1; i >= 0; i -= 1) {
      const car = traffic[i];
      if (car && (car.police || car.driver === 'police')) traffic.splice(i, 1);
    }
  }
  setHeat(police, 0);
}

/** A new cruiser, registered with both the pursuit list and the traffic list main renders from. */
function addPolice(world, x, y, angle, speed) {
  const car = createCar(x, y, angle, COLORS.policeBody, {
    driver: 'police',
    police: true,
    axis: 'v',
    dir: Math.sin(angle) >= 0 ? 1 : -1,
  });
  car.speed = speed;
  car.health = 100;
  car.cool = 0;
  car.turnCool = 0;
  if (world.police && Array.isArray(world.police.cars)) world.police.cars.push(car);
  if (Array.isArray(world.traffic)) world.traffic.push(car);
  return car;
}

/** Put a car at an exact world pose with an exact speed. */
function placeCar(car, x, y, angle, speed) {
  if (!car) return;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.health = 100;
  car.cool = 0;
}

/** Seat the player inside a car (the on-foot figure is hidden while driving). */
function putPlayerInCar(player, car) {
  if (!player || !car) return;
  car.driver = 'player';
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

/** Return the player to their own two feet beside the diner. */
function putPlayerOnFoot(player, x, y, angle, health) {
  if (!player) return;
  if (player.car) {
    const car = player.car;
    car.driver = car.police ? 'police' : 'parked';
    car.speed = 0;
    player.car = null;
  }
  player.x = x;
  player.y = y;
  player.angle = angle;
  player.health = health;
  player.cool = 0;
}

/** First parked car matching a predicate, falling back to any parked car. */
function pickParked(world, color) {
  const pool = (world.parked && world.parked.length) ? world.parked : (world.traffic || []);
  if (color != null) {
    for (const car of pool) {
      if (car && car.color === color && car.driver !== 'player') return car;
    }
  }
  for (const car of pool) {
    if (car && car.driver !== 'player' && !car.police) return car;
  }
  return pool[0] || null;
}

/** Headline car for the cover: recolour a parked car to the hero coral if none already is. */
function heroCar(world) {
  let car = pickParked(world, COLORS.CAR_COLORS[0]);
  if (!car) return null;
  if (car.color !== COLORS.CAR_COLORS[0]) car.color = COLORS.CAR_COLORS[0];
  return car;
}

/** Reuse spawned traffic cars for the vehicles driving ahead of the chase. */
function pickTraffic(world, count) {
  const pool = Array.isArray(world.traffic)
    ? world.traffic.filter((car) => car && !car.police && car.driver !== 'player')
    : [];
  return pool.slice(0, count);
}

/**
 * The diner pad normally already holds three parked cars. If the nearest one ended up far away,
 * slide the closest car onto the pad so the on-foot frame always has company in view.
 */
function ensureDinerCars(world, x, y) {
  const parked = Array.isArray(world.parked) ? world.parked : [];
  let nearest = Infinity;
  let closest = null;
  for (const car of parked) {
    if (!car) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < nearest) {
      nearest = d;
      closest = car;
    }
  }
  if (nearest > 200 && closest) {
    placeCar(closest, 4246, 1180, 0, 0);
  }
}

/** Reposition a few of the already-spawned pedestrians near a set of fixed points. */
function placePeds(world, points) {
  const peds = Array.isArray(world.peds) ? world.peds : [];
  for (let i = 0; i < points.length; i += 1) {
    const ped = peds[i];
    const p = points[i];
    if (!ped || !p) continue;
    ped.x = p.x;
    ped.y = p.y;
    ped.angle = p.angle || 0;
    ped.state = 'walk';
    ped.fleeT = 0;
    ped.health = 60;
    ped.tx = p.x + Math.cos(ped.angle) * 70;
    ped.ty = p.y + Math.sin(ped.angle) * 70;
  }
}

/** Put a display-only mission marker on the map. */
function objective(world, title, x, y) {
  if (world.missions && typeof world.missions.active === 'object') {
    // forceObjective replaces the active job wholesale; mirror it here without importing it.
    world.missions.active = {
      kind: 'show',
      title,
      stage: 'show',
      target: { x, y },
      pay: 0,
      timer: null,
      text: title,
    };
  }
}

/** Cover frame: a coral getaway car with three cruisers in pursuit up the coast road. */
function stageChase(world) {
  clearPolice(world);

  const player = world.player;
  const car = heroCar(world);
  placeCar(car, 4227, 1750, -Math.PI / 2, 235);
  putPlayerInCar(player, car);
  player.health = 82;

  addPolice(world, 4227, 1905, -Math.PI / 2, 220);
  addPolice(world, 4253, 1990, -Math.PI / 2, 220);
  addPolice(world, 4227, 2075, -Math.PI / 2, 220);
  setHeat(world.police, 100); // wanted 3

  const ahead = pickTraffic(world, 2);
  const spots = [
    { x: 4227, y: 1300 },
    { x: 4253, y: 1050 },
  ];
  for (let i = 0; i < ahead.length; i += 1) {
    const t = ahead[i];
    placeCar(t, spots[i].x, spots[i].y, -Math.PI / 2, 120 + i * 15);
    t.driver = 'traffic';
    t.axis = 'v';
    t.dir = -1;
    t.roadX = 4240;
    t.turnCool = 0;
  }

  objective(world, 'First Delivery', world.city.marina.x, world.city.marina.y);
  return { screen: 'game', endKind: null };
}

/** Quiet frame: the player on the diner pad beside the parked cars, no heat, a few locals. */
function stageOnFoot(world) {
  clearPolice(world);

  putPlayerOnFoot(world.player, 4196, 1212, 0, 100);
  ensureDinerCars(world, 4196, 1212);
  placePeds(world, [
    { x: 4040, y: 1120, angle: 0.2 },
    { x: 4080, y: 1260, angle: -1.1 },
    { x: 4160, y: 1090, angle: 0.9 },
  ]);
  setHeat(world.police, 0);
  return { screen: 'game', endKind: null };
}

/** Mission frame: a teal car running south toward the marina with a single cruiser behind. */
function stageMission(world) {
  clearPolice(world);

  const player = world.player;
  const car = pickParked(world);
  if (car) car.color = COLORS.CAR_COLORS[1]; // teal
  placeCar(car, 4253, 2050, Math.PI / 2, 190);
  putPlayerInCar(player, car);
  player.health = 100;

  addPolice(world, 4253, 2240, Math.PI / 2, 170);
  setHeat(world.police, 20); // wanted 1

  placePeds(world, [
    { x: 4340, y: 2000, angle: Math.PI / 2 },
    { x: 4380, y: 2100, angle: -Math.PI / 2 },
  ]);

  objective(world, 'First Delivery', world.city.marina.x, world.city.marina.y);
  return { screen: 'game', endKind: null };
}

/** Title frame: the same quiet diner corner, but a fully ambient world and no objective. */
function stageTitle(world) {
  clearPolice(world);
  putPlayerOnFoot(world.player, 4196, 1212, 0, 100);
  ensureDinerCars(world, 4196, 1212);
  return { screen: 'title', endKind: null };
}

/**
 * Mutate `world` into the named scene and report the screen to paint (unknown names default to
 * the ambient title backdrop).
 */
export function stageShot(name, world) {
  if (!world) return { screen: 'title', endKind: null };
  if (name === 'chase') return stageChase(world);
  if (name === 'onfoot') return stageOnFoot(world);
  if (name === 'mission') return stageMission(world);
  return stageTitle(world);
}
