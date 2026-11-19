// Palm Bay Heat — boot, main loop and glue.
//
// One world is built from a seeded RNG, input is read once per animation frame, and the
// simulation advances in fixed 1/60 s steps (several in a slow frame, none in a fast one).
// Screens: title, help, play, pause and end. ?seed=N fixes the world; ?shot=<scene> stages a
// single frame for the screenshot harness instead of starting the loop.

import { WORLD, VIEW, COLORS, TUNE } from './config.js';
import { makeRng, hashSeed } from './random.js';
import { generateCity, moveCircle, drawCity } from './city.js';
import { createInput, endFrame } from './input.js';
import { createPlayer, stepPlayerOnFoot, tryEnterExit, drawPlayer } from './player.js';
import { spawnTraffic, spawnParked, stepTraffic, stepCarPhysics, drawCar } from './vehicles.js';
import { spawnPeds, stepPeds, drawPed } from './pedestrians.js';
import { createCombat, shoot, stepCombat, drawBullets } from './combat.js';
import { createPolice, reportCrime, stepPolice } from './police.js';
import {
  createMissions, promptAt, startJob, startRampage, currentObjective, stepMissions, noteScore,
} from './missions.js';
import { drawHud, drawMinimap, drawTitle, drawHelp, drawPause, drawEnd } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const CAR_R = 17;
const SAVE_INTERVAL = 10;

// ---------------------------------------------------------------------------
// DOM, URL parameters and persistent input
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : TUNE.worldSeed;
const shot = params.get('shot');

const input = createInput(canvas);

function setStatus(text) {
  statusEl.textContent = text;
}

// ---------------------------------------------------------------------------
// Mutable game state (populated by buildWorld)
// ---------------------------------------------------------------------------

let rng;
let city;
let traffic;
let parked;
let cars;
let peds;
let player;
let police;
let combat;
let missions;
let audio;

let screen = 'title';
let endKind = null;
let helpFrom = 'title';
let toast = null;
let toastT = 0;
let saveTimer = 0;
let t = 0;
let crimeCool = 0;
let accumulator = 0;
let last = performance.now();
let mouseWorld = { x: 0, y: 0 };
let frameScares = [];
const cam = { x: 0, y: 0 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** The player's effective position: their car's centre while driving. */
function effPos() {
  return player.car ? { x: player.car.x, y: player.car.y } : { x: player.x, y: player.y };
}

function buildWorld() {
  rng = makeRng(seed);
  city = generateCity(rng);
  traffic = spawnTraffic(city, rng, 16);
  parked = spawnParked(city, rng);
  cars = [...parked, ...traffic];
  peds = spawnPeds(city, rng, 26);
  player = createPlayer(city.spawn.x, city.spawn.y);
  police = createPolice();
  combat = createCombat();
  missions = createMissions();

  const sv = loadSave();
  missions.money = sv.money;
  missions.storyIndex = sv.storyIndex;
  missions.rampageBest = sv.rampageBest;

  audio = createAudio();

  screen = 'title';
  endKind = null;
  helpFrom = 'title';
  toast = null;
  toastT = 0;
  saveTimer = 0;
  t = 0;
  crimeCool = 0;
  accumulator = 0;
  last = performance.now();
  frameScares = [];
}

// ---------------------------------------------------------------------------
// Small helpers: toasts, persistence, witnesses, camera, minimap/audio inputs
// ---------------------------------------------------------------------------

function showToast(text, duration) {
  toast = text;
  toastT = duration == null ? 3.4 : duration;
}

function persist() {
  storeSave({
    money: missions.money,
    storyIndex: missions.storyIndex,
    rampageBest: missions.rampageBest,
  });
}

function pedNear(x, y, radius) {
  for (const p of peds) {
    if (p.health > 0 && dist(p.x, p.y, x, y) < radius) return true;
  }
  return false;
}

function policeNear(x, y, radius) {
  for (const c of cars) {
    if (c.police && dist(c.x, c.y, x, y) < radius) return true;
  }
  return false;
}

/** A crime is witnessed by a live pedestrian or a nearby cruiser. */
function witnessed(x, y, pedRadius, copRadius) {
  return pedNear(x, y, pedRadius) || policeNear(x, y, copRadius);
}

/** Distance from the on-foot player to the closest car they could enter. */
function nearestCarDistance() {
  let best = Infinity;
  for (const c of cars) {
    if (c === player.car || c.health <= 0) continue;
    const d = dist(c.x, c.y, player.x, player.y);
    if (d < best) best = d;
  }
  return best;
}

function syncCameraPlay() {
  const e = effPos();
  cam.x = clamp(e.x - VIEW.W / 2, 0, WORLD.W - VIEW.W);
  cam.y = clamp(e.y - VIEW.H / 2, 0, WORLD.H - VIEW.H);
}

/** The title backdrop sits on the diner/coast area and drifts gently. */
function syncCameraAmbient() {
  cam.x = clamp(4150 - VIEW.W / 2 + Math.sin(t * 0.05) * 80, 0, WORLD.W - VIEW.W);
  cam.y = clamp(1180 - VIEW.H / 2 + Math.cos(t * 0.04) * 40, 0, WORLD.H - VIEW.H);
}

function syncMouseWorld() {
  mouseWorld = { x: cam.x + input.mouse.x, y: cam.y + input.mouse.y };
}

function timerText() {
  const active = missions.active;
  if (!active || active.timer == null) return '';
  const seconds = Math.max(0, Math.ceil(active.timer));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return active.kind === 'rampage' ? `RAMPAGE ${active.score || 0} · ${clock}` : clock;
}

/** The one-shot bottom prompt, with the same priorities interact() uses. */
function promptText() {
  if (!player.car) {
    const e = effPos();
    const missionPrompt = promptAt(missions, e, city);
    if (missionPrompt) return missionPrompt;
    if (nearestCarDistance() <= 46) return 'F — Enter car';
  } else if (Math.abs(player.car.speed) < 30) {
    return 'F — Exit car';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Screen transitions
// ---------------------------------------------------------------------------

function endGame(kind) {
  if (screen === 'end') return;
  screen = 'end';
  endKind = kind;
  setStatus(kind === 'busted' ? 'Busted.' : kind === 'wasted' ? 'Wasted.' : 'Story complete.');
  if (kind === 'busted' || kind === 'wasted') missions.active = null;
  audio.update(0, { engine: 0, siren: 0 });
}

function respawn() {
  if (player.car) {
    player.car.driver = 'parked'; // leave the car where it stands
    player.car = null;
  }
  player.health = 100;
  player.x = city.spawn.x;
  player.y = city.spawn.y;
  player.angle = 0;
  player.cool = 0;

  police.heat = 0;
  police.wanted = 0;
  police.busted = 0;
  police.seenT = 0;
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    if (cars[i].police) cars.splice(i, 1);
  }
  police.cars.length = 0;

  missions.active = null;
  crimeCool = 0;
  accumulator = 0;
  screen = 'play';
  setStatus('Playing.');
}

// ---------------------------------------------------------------------------
// Input: one-shot presses per screen, plus continuous shooting while playing
// ---------------------------------------------------------------------------

function interact() {
  const e = effPos();

  if (!player.car) {
    const missionPrompt = promptAt(missions, e, city);
    // A car within entry range takes priority over a job prompt at the same spot.
    if (missionPrompt && nearestCarDistance() > 46) {
      const dDiner = dist(e.x, e.y, city.diner.x, city.diner.y);
      const dBeach = dist(e.x, e.y, city.beachLot.x, city.beachLot.y);
      if (dDiner < 90) {
        const active = startJob(missions, city, rng);
        const objective = currentObjective(missions);
        showToast(`Job: ${active.title} — ${objective ? objective.text : ''}`);
        audio.pickup();
      } else if (dBeach < 110) {
        startRampage(missions, city);
        showToast('Rampage — 90 seconds of chaos!');
        audio.pickup();
      }
      return;
    }
  }

  // Remember which car tryEnterExit will claim so we know whether it was stolen.
  let previousDriver = null;
  if (!player.car) {
    let bestD2 = 46 * 46;
    for (const c of cars) {
      if (c.driver === 'player' || c.health <= 0) continue;
      const d2 = (c.x - player.x) ** 2 + (c.y - player.y) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        previousDriver = c.driver;
      }
    }
  }

  const result = tryEnterExit(player, cars);
  if (result === 'entered' && (previousDriver === 'parked' || previousDriver === 'traffic')) {
    const o = effPos();
    if (witnessed(o.x, o.y, 240, 300)) reportCrime(police, 'steal');
  }
}

function handleStateInput() {
  const pressed = input.pressed;

  if (pressed.has('KeyM')) audio.toggleMute();

  if (screen === 'title') {
    if (pressed.has('Enter') || pressed.has('MouseLeft')) {
      screen = 'play';
      setStatus('Playing.');
    } else if (pressed.has('KeyH')) {
      helpFrom = 'title';
      screen = 'help';
    }
  } else if (screen === 'help') {
    if (pressed.has('KeyH') || pressed.has('Escape') || pressed.has('Enter')) {
      screen = helpFrom;
      setStatus(screen === 'play' ? 'Playing.' : 'Palm Bay Heat title.');
    }
  } else if (screen === 'play') {
    if (pressed.has('KeyP') || pressed.has('Escape')) {
      screen = 'pause';
      setStatus('Paused.');
    } else if (pressed.has('KeyF')) {
      interact();
    }
  } else if (screen === 'pause') {
    if (pressed.has('KeyP') || pressed.has('Escape')) {
      screen = 'play';
      setStatus('Playing.');
    } else if (pressed.has('KeyH')) {
      helpFrom = 'pause';
      screen = 'help';
    }
  } else if (screen === 'end' && pressed.has('KeyR')) {
    respawn();
  }
}

function handleShooting() {
  if (!input.mouse.down || player.cool > 0) return;
  const o = effPos();
  const angle = Math.atan2(mouseWorld.y - o.y, mouseWorld.x - o.x);
  shoot(combat, o.x, o.y, angle, 'player');
  player.cool = TUNE.shootCooldown;
  audio.shot();
  if (witnessed(o.x, o.y, 260, 320)) reportCrime(police, 'shot');
  noteScore(missions, 'shot');
  frameScares.push({ x: o.x, y: o.y, r: 230 });
}

// ---------------------------------------------------------------------------
// Simulation: collisions, bullets and mission events
// ---------------------------------------------------------------------------

function resolveCarCollisions() {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= 34) continue;
      if (d < 0.001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const overlap = 34 - d;

      // Push both cars apart equally, then let the city correct each move.
      const pa = moveCircle(city, a.x, a.y, CAR_R, -nx * overlap * 0.5, -ny * overlap * 0.5);
      a.x = pa.x;
      a.y = pa.y;
      const pb = moveCircle(city, b.x, b.y, CAR_R, nx * overlap * 0.5, ny * overlap * 0.5);
      b.x = pb.x;
      b.y = pb.y;

      const lineAngle = Math.atan2(ny, nx);
      const va = (a.speed || 0) * Math.cos(a.angle - lineAngle);
      const vb = (b.speed || 0) * Math.cos(b.angle - lineAngle);
      const relative = Math.abs(va - vb);
      a.speed *= 0.82;
      b.speed *= 0.82;
      if (relative > 90) {
        const damage = (relative - 90) * 0.12;
        a.health -= damage;
        b.health -= damage;
      }

      const involves = a === player.car || b === player.car || a.police || b.police;
      if (involves && relative > 40 && crimeCool <= 0) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (witnessed(mx, my, 220, 300)) {
          reportCrime(police, 'hitCar');
          noteScore(missions, 'hitCar');
          crimeCool = 0.8;
        }
      }
    }
  }
}

function resolvePedCollisions() {
  for (const car of cars) {
    if (Math.abs(car.speed || 0) < 40) continue;
    for (const ped of peds) {
      if (ped.health <= 0) continue;
      if (dist(car.x, car.y, ped.x, ped.y) >= 20) continue;
      ped.health -= 45;
      car.speed *= 0.8;
      const killed = ped.health <= 0;
      if (killed) ped.deadT = 0;
      if (crimeCool <= 0 && witnessed(ped.x, ped.y, 220, 300)) {
        reportCrime(police, killed ? 'killPed' : 'hitPed');
        noteScore(missions, killed ? 'killPed' : 'hitPed');
        crimeCool = 0.8;
      }
    }
  }
}

function onBulletHit(ev) {
  audio.hit();
  const target = ev.target;

  if (ev.side === 'player') {
    if (target.kind === 'ped') {
      const ped = target.ref;
      ped.health -= 30;
      if (ped.health <= 0) {
        ped.deadT = 0;
        reportCrime(police, 'killPed');
        noteScore(missions, 'killPed');
      } else {
        reportCrime(police, 'hitPed');
        noteScore(missions, 'hitPed');
      }
    } else if (target.kind === 'car' || target.kind === 'police') {
      const car = target.ref;
      car.health -= 12;
      noteScore(missions, 'hitCar');
      if (target.kind === 'police') {
        if (car.health <= 0) {
          reportCrime(police, 'killCop');
          noteScore(missions, 'killCop');
        } else {
          reportCrime(police, 'damage');
        }
      } else {
        reportCrime(police, 'hitCar');
      }
    }
  } else if (ev.side === 'police' && target.kind === 'player') {
    if (player.car) {
      player.car.health -= 6;
      player.health -= 2;
    } else {
      player.health -= 8;
    }
  }
}

function stepBullets(dt) {
  const targets = [];
  for (const ped of peds) {
    if (ped.health > 0) {
      targets.push({ kind: 'ped', ref: ped, x: ped.x, y: ped.y, r: 11, side: 'world' });
    }
  }
  for (const car of cars) {
    if (car === player.car) continue; // never shoot the car you are sitting in
    targets.push({
      kind: car.police ? 'police' : 'car',
      ref: car,
      x: car.x,
      y: car.y,
      r: 24,
      side: 'world',
    });
  }
  const e = effPos();
  targets.push({
    kind: 'player',
    ref: player,
    x: e.x,
    y: e.y,
    r: player.car ? 24 : 11,
    side: 'player',
  });
  stepCombat(combat, city, targets, dt, onBulletHit);
}

function handleMissionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'paid') {
      showToast(`+$${ev.amount} — ${ev.text}`);
      audio.chime();
      persist();
    } else if (ev.type === 'toast') {
      showToast(ev.text);
    } else if (ev.type === 'failed') {
      showToast(ev.text);
      audio.hit();
    } else if (ev.type === 'heat') {
      // Wanted is recomputed from heat inside stepPolice on the next step.
      police.heat += ev.amount;
      if (!Number.isFinite(police.heat) || police.heat < 0) police.heat = 0;
    } else if (ev.type === 'story-complete') {
      endGame('complete');
    } else if (ev.type === 'rampage-end') {
      showToast(`Rampage over — scored $${ev.amount}`);
      audio.chime();
      persist();
    }
  }
}

function stepPlay(dt) {
  player.cool = Math.max(0, player.cool - dt);
  if (crimeCool > 0) crimeCool = Math.max(0, crimeCool - dt);
  if (toastT > 0) toastT = Math.max(0, toastT - dt);

  // --- player -------------------------------------------------------------
  if (player.car) {
    const car = player.car;
    const keys = input.keys;
    const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
      + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0);
    const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0)
      + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    const brake = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const beforeX = car.x;
    const beforeY = car.y;
    const speedBefore = car.speed;

    stepCarPhysics(car, dt, { throttle, steer, brake });

    // Re-apply the step's displacement through the city's circle collision.
    const dx = car.x - beforeX;
    const dy = car.y - beforeY;
    const resolved = moveCircle(city, beforeX, beforeY, CAR_R, dx, dy);
    car.x = resolved.x;
    car.y = resolved.y;

    const intended = Math.hypot(dx, dy);
    const moved = Math.hypot(car.x - beforeX, car.y - beforeY);
    if (Math.abs(speedBefore) > 120 && intended > 0.5 && moved < intended * 0.45) {
      const damage = Math.min(30, Math.abs(speedBefore) * 0.06);
      car.health -= damage;
      if (Math.abs(speedBefore) > 200) player.health -= damage * 0.25;
      audio.hit();
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  } else {
    stepPlayerOnFoot(player, input, city, mouseWorld.x, mouseWorld.y, dt);
  }

  // --- other cars (police are driven by stepPolice) -----------------------
  for (const car of cars) {
    if (car.driver === 'traffic') stepTraffic(car, city, cars, dt);
  }

  resolveCarCollisions();
  resolvePedCollisions();

  // --- peds, bullets, police and missions ---------------------------------
  stepPeds(peds, city, dt, frameScares);
  stepBullets(dt);

  stepPolice(police, { city, player, eff: effPos(), rng, combat, cars }, dt);
  if (police.busted >= 1 && screen === 'play') {
    endGame('busted');
    return;
  }
  if (player.health <= 0 && screen === 'play') {
    endGame('wasted');
    return;
  }

  const events = stepMissions(
    missions,
    { eff: effPos(), playerCar: player.car, cars, city },
    dt,
  );
  handleMissionEvents(events);

  // Bodies linger for twenty seconds; wrecked cars stay for good.
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    const ped = peds[i];
    if (ped.health <= 0) {
      ped.deadT = (ped.deadT || 0) + dt;
      if (ped.deadT > 20) peds.splice(i, 1);
    }
  }

  saveTimer += dt;
  if (saveTimer >= SAVE_INTERVAL) {
    saveTimer = 0;
    persist();
  }
}

/** Keep the title/help backdrop alive without advancing the player or police. */
function stepAmbient(dt) {
  for (const car of cars) {
    if (car.driver === 'traffic') stepTraffic(car, city, cars, dt);
  }
  stepPeds(peds, city, dt, []);
}

function updateAudio(dt) {
  if (screen !== 'play') {
    audio.update(dt, { engine: 0, siren: 0 });
    return;
  }
  let siren = 0;
  if (police.wanted > 0) {
    const e = effPos();
    for (const car of cars) {
      if (car.police && dist(car.x, car.y, e.x, e.y) < 700) {
        siren = 1;
        break;
      }
    }
  }
  const engine = player.car ? Math.min(1, Math.abs(player.car.speed) / TUNE.carMaxSpeed) : 0;
  audio.update(dt, { engine, siren });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function drawCars() {
  const parkedGroup = [];
  const trafficGroup = [];
  const policeGroup = [];
  const playerGroup = [];
  for (const car of cars) {
    if (car === player.car) playerGroup.push(car);
    else if (car.police || car.driver === 'police') policeGroup.push(car);
    else if (car.driver === 'traffic') trafficGroup.push(car);
    else parkedGroup.push(car);
  }
  for (const group of [parkedGroup, trafficGroup, policeGroup, playerGroup]) {
    for (const car of group) drawCar(ctx, car, cam);
  }
}

function render() {
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);

  drawCity(ctx, city, cam);
  drawCars();
  for (const ped of peds) drawPed(ctx, ped, cam);
  drawPlayer(ctx, player, cam);
  drawBullets(ctx, combat, cam);

  if (screen === 'play' || screen === 'pause' || screen === 'end') {
    const objective = currentObjective(missions);
    const e = effPos();
    drawHud(ctx, {
      money: missions.money,
      health: player.health,
      wanted: police.wanted,
      objectiveText: objective ? objective.text : null,
      objectiveDist: objective ? Math.round(Math.hypot(objective.x - e.x, objective.y - e.y) / 10) : null,
      timerText: timerText(),
      prompt: promptText(),
      toast,
      toastT,
      busted: police.busted,
    });
    drawMinimap(ctx, { city, player, cars, objective, t });
    if (screen === 'pause') drawPause(ctx);
    if (screen === 'end') {
      drawEnd(ctx, endKind, { money: missions.money, rampageBest: missions.rampageBest });
    }
  } else if (screen === 'title') {
    drawTitle(ctx, t);
  } else if (screen === 'help') {
    drawHelp(ctx);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  t += dt;

  handleStateInput();

  if (screen === 'play' || screen === 'pause' || screen === 'end') syncCameraPlay();
  else syncCameraAmbient();
  syncMouseWorld();

  if (screen === 'play') handleShooting();

  if (screen === 'play' || screen === 'title' || screen === 'help') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 4) {
      if (screen === 'play') stepPlay(STEP);
      else stepAmbient(STEP);
      accumulator -= STEP;
      steps += 1;
      if (screen !== 'play' && screen !== 'title' && screen !== 'help') break;
    }
    if (accumulator > STEP) accumulator = 0; // drop long stalls rather than replaying them
  } else {
    accumulator = 0;
  }
  frameScares.length = 0;

  updateAudio(dt);

  if (screen === 'play' || screen === 'pause' || screen === 'end') syncCameraPlay();
  else syncCameraAmbient();
  syncMouseWorld();

  render();
  endFrame(input);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildWorld();

// WebAudio must be unlocked by a gesture. ensure() is idempotent, so one is enough.
let gestureDone = false;
function onGesture() {
  if (gestureDone) return;
  gestureDone = true;
  audio.ensure();
}
window.addEventListener('keydown', onGesture);
window.addEventListener('pointerdown', onGesture);

if (shot) {
  // Screenshot mode: stage once, paint exactly two frames, then signal readiness.
  input.mouse.x = 0;
  input.mouse.y = 0;

  const scene = stageShot(shot, { city, player, traffic, parked, peds, police, missions, combat, rng });
  screen = scene && scene.screen === 'title' ? 'title' : 'play';
  endKind = null;
  if (scene && scene.endKind) {
    screen = 'end';
    endKind = scene.endKind;
  }

  // A stager may create cruisers without access to the shared car list; merge them in.
  for (const car of police.cars) {
    if (!cars.includes(car)) cars.push(car);
  }

  syncCameraPlay();
  syncMouseWorld();
  setStatus(screen === 'title' ? 'Palm Bay Heat title.' : 'Playing.');

  let painted = 0;
  function paint() {
    render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  screen = 'title';
  syncCameraAmbient();
  syncMouseWorld();
  setStatus('Palm Bay Heat title.');
  requestAnimationFrame(frame);
}
