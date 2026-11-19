// Missions and side activities for Palm Bay Heat. Marla Quinn's four story jobs, random
// errands, and the timed beach rampage all live here; every stage change is reported back as an
// event so main.js can drive the HUD, toasts, audio and police heat without knowing the rules.
import { WORLD } from './config.js';
import { nearestRoadPoint } from './city.js';

/** The four story jobs, in order, with original flavour text from Marla Quinn. */
export const STORY = [
  {
    id: 'first-delivery',
    title: 'First Delivery',
    pay: 250,
    brief: "Marla Quinn: 'First run's the easy one. Grab the package at my diner and roll it down to the marina. No questions, no scratches.'",
  },
  {
    id: 'beach-sprint',
    title: 'Beach Sprint',
    pay: 600,
    brief: "Marla Quinn: 'Three markers up the coast road, seventy-five seconds on the clock. My cousin's waiting at the last one, and she hates being kept.'",
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    pay: 900,
    brief: "Marla Quinn: 'That cream coupe parked by the garage has a fresh engine and my name on the title. Bring it back in one piece and the whole score is yours.'",
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    pay: 1500,
    brief: "Marla Quinn: 'This one's loud. Collect the case at the garage and get it to the beach house. Expect company the moment you touch it.'",
  },
];

/** Fixed checkpoint line for Beach Sprint, north to south along the coast road. */
const CHECKPOINTS = [
  { x: 4240, y: 500 },
  { x: 4240, y: 1500 },
  { x: 4240, y: 2500 },
];

/** Rampage point values, shared by noteScore and the stager/main through missions state. */
const SCORE_VALUES = { shot: 5, hitCar: 30, hitPed: 50, killPed: 120, killCop: 200 };

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function copyPoint(p) {
  return { x: p.x, y: p.y };
}

/** Update a stage together with its objective text so currentObjective stays in sync. */
function setStage(active, stage, target, text) {
  active.stage = stage;
  active.target = target ? copyPoint(target) : null;
  active.text = text;
}

function newJob(def, city) {
  const active = {
    kind: 'story',
    id: def.id,
    title: def.title,
    stage: 'pickup',
    target: copyPoint(city.diner),
    pay: def.pay,
    timer: null,
    totalTime: null,
    checkpointIndex: 0,
    checkpoints: null,
    carId: null,
    score: 0,
    text: "Pick up at Marla's diner",
  };

  if (def.id === 'beach-sprint') {
    active.stage = 'checkpoints';
    active.checkpoints = CHECKPOINTS.map(copyPoint);
    active.target = copyPoint(active.checkpoints[0]);
    active.timer = 75;
    active.totalTime = 75;
    active.text = 'Checkpoint 1 of 3';
  } else if (def.id === 'hot-wheels') {
    // The specific car is chosen lazily in stepMissions, once world.cars is available.
    active.stage = 'steal';
    active.target = null;
    active.carId = null;
    active.text = 'Steal the marked car';
  } else if (def.id === 'the-big-score') {
    active.stage = 'pickup';
    active.target = copyPoint(city.garage);
    active.text = 'Pick up at the garage';
  }

  return active;
}

/** Choose a road destination well away from the diner, using only the seeded RNG. */
function pickErrandDrop(city, rng) {
  let drop = null;
  for (let tries = 0; tries < 60; tries += 1) {
    const x = rng.range(0, WORLD.W);
    const y = rng.range(0, WORLD.H);
    drop = nearestRoadPoint(city, x, y);
    if (dist(drop, city.diner) >= 700) break;
  }
  return copyPoint(drop);
}

export function createMissions() {
  return { storyIndex: 0, active: null, money: 0, rampageBest: 0, errands: 0 };
}

/** Context action shown at the diner / beach house when nothing is currently active. */
export function promptAt(missions, eff, city) {
  if (missions.active) return null;
  if (dist(eff, city.diner) < 90) {
    if (missions.storyIndex < STORY.length) {
      return `F — Take the job: ${STORY[missions.storyIndex].title}`;
    }
    return 'F — Take a delivery errand';
  }
  if (dist(eff, city.beachLot) < 110) return 'F — Start rampage (90 s)';
  return null;
}

/** Begin the next story job, or an errand once all four story jobs are complete. */
export function startJob(missions, city, rng) {
  if (missions.storyIndex < STORY.length) {
    missions.active = newJob(STORY[missions.storyIndex], city);
    return missions.active;
  }
  const drop = pickErrandDrop(city, rng);
  const pay = 120 + Math.round(dist(city.diner, drop) / 12);
  missions.active = {
    kind: 'errand',
    id: 'errand',
    title: 'Delivery Errand',
    stage: 'pickup',
    target: copyPoint(city.diner),
    drop,
    pay,
    timer: null,
    totalTime: null,
    checkpointIndex: 0,
    carId: null,
    score: 0,
    text: "Pick up at Marla's diner",
  };
  return missions.active;
}

export function startRampage(missions, city) {
  missions.active = {
    kind: 'rampage',
    title: 'Rampage',
    stage: 'rampage',
    target: null,
    pay: 0,
    timer: 90,
    totalTime: 90,
    checkpointIndex: 0,
    carId: null,
    score: 0,
    text: 'Rampage',
  };
  return missions.active;
}

/** Display-only objective used by the screenshot stager; stepMissions ignores it. */
export function forceObjective(missions, title, x, y) {
  missions.active = {
    kind: 'show',
    title,
    stage: 'show',
    target: { x, y },
    pay: 0,
    timer: null,
    text: title,
  };
  return missions.active;
}

export function currentObjective(missions) {
  const active = missions.active;
  if (!active || !active.target) return null;
  return { x: active.target.x, y: active.target.y, text: active.text || active.title };
}

/** Add to the live rampage score; all other states ignore the call. */
export function noteScore(missions, kind) {
  const active = missions.active;
  if (!active || active.kind !== 'rampage') return;
  active.score = (active.score || 0) + (SCORE_VALUES[kind] || 0);
}

/** Pay out and clear a completed job, emitting the shared 'paid' event. */
function completeJob(missions, active, events) {
  const pay = active.pay || 0;
  missions.money += pay;
  if (active.kind === 'errand') missions.errands += 1;
  if (active.kind === 'story') missions.storyIndex += 1;
  events.push({ type: 'paid', amount: pay, text: `${active.title} complete — $${pay}` });
  if (active.id === 'the-big-score') events.push({ type: 'story-complete' });
  missions.active = null;
}

/** Nearest parked car to the garage, from the cars the world hands us this frame. */
function nearestParkedCar(cars, garage) {
  const parked = cars.filter((c) => c.driver === 'parked');
  const pool = parked.length ? parked : cars;
  let best = null;
  let bestDist = Infinity;
  for (const car of pool) {
    const d = dist(car, garage);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function stepMissions(missions, world, dt) {
  const events = [];
  const active = missions.active;
  if (!active) return events;
  if (active.kind === 'show') return events;

  const { eff, playerCar, city } = world;
  const cars = world.cars || [];

  // Timed activities tick down first; expiry ends them before any completion check.
  if (active.timer != null) {
    active.timer -= dt;
    if (active.timer <= 0) {
      if (active.kind === 'rampage') {
        const score = active.score || 0;
        missions.rampageBest = Math.max(missions.rampageBest, score);
        events.push({ type: 'rampage-end', amount: score, text: `Rampage over — ${score} points` });
      } else {
        events.push({ type: 'failed', text: `${active.title} — time's up` });
      }
      missions.active = null;
      return events;
    }
  }

  if (active.kind === 'rampage') return events; // score only; main reads active.score

  if (active.stage === 'pickup') {
    if (dist(eff, active.target) <= 60) {
      const isBigScore = active.id === 'the-big-score';
      const target = active.kind === 'errand' ? active.drop
        : isBigScore ? city.beachLot : city.marina;
      setStage(active, 'deliver', target, isBigScore ? 'Reach the beach house' : 'Deliver to the marina');
      if (isBigScore) {
        events.push({ type: 'heat', amount: 60 });
        events.push({ type: 'toast', text: 'Case secured — expect heat' });
      } else if (active.kind === 'errand') {
        events.push({ type: 'toast', text: 'Package collected — head to the drop-off' });
      } else {
        events.push({ type: 'toast', text: 'Package collected — get it to the marina' });
      }
    }
    return events;
  }

  if (active.stage === 'deliver') {
    if (dist(eff, active.target) <= 70) completeJob(missions, active, events);
    return events;
  }

  if (active.stage === 'checkpoints') {
    const checkpoints = active.checkpoints || CHECKPOINTS;
    if (dist(eff, active.target) <= 80) {
      active.checkpointIndex += 1;
      if (active.checkpointIndex >= checkpoints.length) {
        completeJob(missions, active, events);
      } else {
        setStage(active, 'checkpoints', checkpoints[active.checkpointIndex],
          `Checkpoint ${active.checkpointIndex + 1} of 3`);
        events.push({ type: 'toast', text: 'Checkpoint!' });
      }
    }
    return events;
  }

  if (active.stage === 'steal') {
    // Car identity is resolved on the first frame that supplies us with the car list.
    if (active.carId == null) {
      const car = nearestParkedCar(cars, city.garage);
      if (car) active.carId = car.id;
    }
    const car = active.carId != null ? cars.find((c) => c.id === active.carId) : null;
    if (car) active.target = copyPoint(car);
    if (playerCar && active.carId != null && playerCar.id === active.carId) {
      setStage(active, 'go-deliver', city.garage, 'Deliver the car to the garage');
      events.push({ type: 'toast', text: 'Car secured — take it to the garage' });
    }
    return events;
  }

  if (active.stage === 'go-deliver') {
    // Leaving the marked car rewinds the job; the delivery only counts while driving it.
    if (!playerCar || playerCar.id !== active.carId) {
      let target = active.target;
      const car = cars.find((c) => c.id === active.carId);
      if (car) target = copyPoint(car);
      setStage(active, 'steal', target, 'Steal the marked car');
      events.push({ type: 'toast', text: 'Get back in the marked car' });
      return events;
    }
    if (dist(eff, active.target) <= 70) completeJob(missions, active, events);
    return events;
  }

  return events;
}
