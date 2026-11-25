// DAPUR SENJA — screenshot scenes: each one plays the real rules forward
// from a fresh world with a scripted pilot (walk to a station, use it,
// build a dish), so every frame is what a real game really looks like, and
// the same seed always gives the same frame.
import { ITEMS, RECIPES, STATIONS } from './config.js';
import { plateRecipe } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY } from './render.js';

const SAMPLE = 1 / 60;

function freeBurner(state) {
  return state.burners.findIndex((b) => b === null);
}

function burnerWith(state, kind) {
  return state.burners.findIndex((b) => b && b.kind === kind);
}

function stationPoint(state, station) {
  if (station.type === 'bin') {
    const bin = STATIONS.bins.find((b) => b.kind === station.kind);
    // Stand just right of the bin: any further and the trash bin below
    // becomes the nearest station and the press hits it instead.
    return { x: bin.x + bin.w + 20, y: bin.y + bin.h / 2 };
  }
  if (station.type === 'board') return { x: STATIONS.board.x + STATIONS.board.w / 2, y: STATIONS.board.y + STATIONS.board.h + 34 };
  if (station.type === 'stove') {
    let bi = station.burner;
    if (bi === -1) bi = station.want ? burnerWith(state, station.want) : freeBurner(state);
    if (bi === -1) bi = 0;
    const r = STATIONS.burners[bi];
    return { x: r.x + r.w / 2, y: STATIONS.stove.y + STATIONS.stove.h + 34 };
  }
  if (station.type === 'plate') return { x: STATIONS.plate.x + STATIONS.plate.w / 2, y: STATIONS.plate.y + STATIONS.plate.h + 34 };
  if (station.type === 'window') return { x: STATIONS.window.x + STATIONS.window.w / 2, y: STATIONS.window.y - 34 };
  if (station.type === 'trash') return { x: STATIONS.trash.x + STATIONS.trash.w / 2, y: STATIONS.trash.y + STATIONS.trash.h + 34 };
  return { x: 620, y: 480 };
}

function hasCarrying(state, kind, wantedState) {
  return state.chef.carrying.some((i) => i.kind === kind && i.state === wantedState);
}

function makeServeStep() {
  // The done check compares against the served count stamped when this
  // step starts: `served > 0` would pass at once after any earlier serve.
  const step = {
    station: { type: 'window' },
    act: 'serve',
    servedAt: 0,
    stamped: false,
    done: null,
  };
  step.done = (s) => s.served > step.servedAt || plateRecipe(s) === null;
  return step;
}

// Steps that build one recipe: chopped needs first (fast, no burn clock),
// then cooked needs, then the plate, then the window. Needs already on the
// plate are skipped, so a resumed cycle never duplicates an ingredient.
// (Tried cooks-first so burners run during chopping: measured WORSE —
// 5 dishes/368 vs 6/398 on seed 7 — the second burner waits through the
// first item's take-and-add walk and orders expire, so keep this order.)
function planForRecipe(recipe, already = []) {
  const steps = [];
  const remaining = [...recipe.needs];
  for (const item of already) {
    const idx = remaining.indexOf(`${item.kind}:${item.state}`);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  const chopped = remaining.filter((n) => n.endsWith(':chopped'));
  const cooked = remaining.filter((n) => n.endsWith(':cooked'));
  for (const need of [...chopped, ...cooked]) {
    const [kind, wanted] = need.split(':');
    steps.push({ station: { type: 'bin', kind }, act: 'take', done: (s) => hasCarrying(s, kind, 'raw') });
    if (ITEMS[kind].chop && wanted === 'cooked') {
      steps.push({ station: { type: 'board' }, act: 'chop', done: (s) => hasCarrying(s, kind, 'chopped') });
    } else if (wanted === 'chopped') {
      steps.push({ station: { type: 'board' }, act: 'chop', done: (s) => hasCarrying(s, kind, 'chopped') });
    }
    if (wanted === 'cooked') {
      steps.push({ station: { type: 'stove', burner: -1, want: kind }, act: 'cook', done: (s) => burnerWith(s, kind) !== -1 });
      steps.push({ station: { type: 'stove', burner: -1, want: kind }, act: 'takeCooked', done: (s) => hasCarrying(s, kind, 'cooked') });
    }
    steps.push({ station: { type: 'plate' }, act: 'add', need: { kind, state: wanted }, done: (s) => s.plate.items.some((i) => i.kind === kind && i.state === wanted) });
  }
  steps.push(makeServeStep());
  return steps;
}

function plateFitsRecipe(items, recipe) {
  const needs = [...recipe.needs];
  for (const it of items) {
    const idx = needs.indexOf(`${it.kind}:${it.state}`);
    if (idx === -1) return false;
    needs.splice(idx, 1);
  }
  return true;
}

function planForOrder(state) {
  const plate = state.plate.items;
  if (plate.length > 0) {
    // A finished dish goes straight to the window, never to the bin.
    if (plateRecipe(state)) return [makeServeStep()];
    // Finish the dish already on the plate when it still fits a recipe;
    // otherwise clear the plate (and trash anything carried) and start over.
    const match = RECIPES.find((r) => plateFitsRecipe(plate, r) && plate.length < r.needs.length);
    if (!match) {
      const steps = [];
      if (state.chef.carrying.length > 0) {
        steps.push({ station: { type: 'trash' }, act: 'trash', done: (s) => s.chef.carrying.length === 0 });
      }
      steps.push({ station: { type: 'plate' }, act: 'clear', done: (s) => s.plate.items.length === 0 });
      return steps;
    }
    return planForRecipe(match, plate);
  }
  // Skilled play: serve the most urgent order first, not the oldest.
  const order = state.orders.reduce((a, b) => (a.patience <= b.patience ? a : b), state.orders[0]);
  if (!order) return [];
  return planForRecipe(order.recipe);
}

// The kitchen's open hub: walking straight between the left bins and the
// right counters runs into the chopping board's corner and stalls. The
// pilot crosses the room via this clear spot whenever the target is far
// across in x.
const HUB = { x: 620, y: 480 };

function pilotInput(state, plan, cursor, cooldown) {
  const step = plan[cursor.index];
  if (!step) return { dx: 0, dy: 0, interact: false };
  const target = stationPoint(state, step.station);
  const chef = state.chef;
  if (!cursor.viaHub && !cursor.hubDone && Math.abs(chef.x - target.x) > 220) cursor.viaHub = true;
  if (cursor.viaHub) {
    const hx = HUB.x - chef.x;
    const hy = HUB.y - chef.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 40) return { dx: hx / hd, dy: hy / hd, interact: false };
    cursor.viaHub = false;
    cursor.hubDone = true;
  }
  const dx = target.x - chef.x;
  const dy = target.y - chef.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 30) {
    return { dx: dx / dist, dy: dy / dist, interact: false };
  }
  if (step.act === 'chop' && state.board.chop) {
    const m = state.board.chop.marker;
    // The whole green zone counts as perfect, so take the first hit
    // inside it instead of waiting for the middle of the zone.
    if (cooldown.t > 0.12 && m >= 0.42 && m <= 0.62) {
      cooldown.t = 0;
      return { dx: 0, dy: 0, interact: true };
    }
    return { dx: 0, dy: 0, interact: false };
  }
  if (step.act === 'takeCooked') {
    const bi = burnerWith(state, step.station.want);
    const b = bi === -1 ? null : state.burners[bi];
    if (b && b.t >= b.cookTime) {
      return { dx: 0, dy: 0, interact: true };
    }
    return { dx: 0, dy: 0, interact: false };
  }
  if (step.act === 'cook' && freeBurner(state) === -1) {
    return { dx: 0, dy: 0, interact: false };
  }
  if (step.act === 'add' && step.need && !hasCarrying(state, step.need.kind, step.need.state)) {
    // Never press E at the plate empty-handed: that pops an item off.
    return { dx: 0, dy: 0, interact: false };
  }
  if (cooldown.t > 0.25) {
    cooldown.t = 0;
    return { dx: 0, dy: 0, interact: true };
  }
  return { dx: 0, dy: 0, interact: false };
}

function runPilot(world, stopWhen, maxSeconds, planFn = planForOrder) {
  const state = world.state;
  let plan = [];
  let cursor = { index: 0, viaHub: false, hubDone: false };
  let lastAdvance = 0;
  const cooldown = { t: 1 };
  let guard = 0;
  const maxSteps = Math.floor(maxSeconds / SAMPLE);
  while (guard < maxSteps) {
    guard += 1;
    if (state.dayOver) break;
    if (stopWhen(state)) break;
    if (plan.length === 0 || cursor.index >= plan.length) {
      plan = planFn(state);
      cursor.index = 0;
      cursor.viaHub = false;
      cursor.hubDone = false;
      lastAdvance = guard;
      if (plan.length === 0) {
        world.step(SAMPLE, { dx: 0, dy: 0, interact: false });
        cooldown.t += SAMPLE;
        continue;
      }
    }
    const input = pilotInput(state, plan, cursor, cooldown);
    cooldown.t += SAMPLE;
    const before = plan[cursor.index];
    if (before && before.act === 'serve' && !before.stamped) {
      before.servedAt = state.served;
      before.stamped = true;
    }
    world.step(SAMPLE, input);
    if (before && before.done(state)) {
      cursor.index += 1;
      cursor.viaHub = false;
      cursor.hubDone = false;
      lastAdvance = guard;
    }
    // A step that makes no progress for 8 s is skipped, never stuck.
    if (guard - lastAdvance > 480) {
      cursor.index += 1;
      cursor.viaHub = false;
      cursor.hubDone = false;
      lastAdvance = guard;
    }
  }
}

const NASI_GORENG = RECIPES.find((r) => r.id === 'nasi-goreng');

export function stageShot(name, world) {
  world.reset();
  if (name === 'chop') {
    // Fixed plan: take cabai, chop it, stop after the first timed hit, so
    // the meter, the green zone and the 1/3 pips are all on screen.
    const chopPlan = () => [
      { station: { type: 'bin', kind: 'cabai' }, act: 'take', done: (s) => hasCarrying(s, 'cabai', 'raw') },
      { station: { type: 'board' }, act: 'chop', done: () => false },
    ];
    runPilot(world, (s) => s.board.chop !== null && s.board.chop.hits >= 1, 40, chopPlan);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'rush') {
    runPilot(world, (s) => s.time >= 142 && s.orders.length >= 2, 175);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    runPilot(world, (s) => s.dayOver, 185);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  // play (cover): a full Nasi Goreng Senja assembled on the plate AND the
  // next dish already mid-assembly — mie cooking on a burner and sayur on
  // the board with the chop meter at 1/3 hits — so one frame shows the
  // order board, ingredients on the counter, a dish mid-assembly, a plate
  // ready to serve, and the timer, all at once.
  const coverPlan = () => planForRecipe(NASI_GORENG).slice(0, -1);
  runPilot(world, (s) => plateRecipe(s) !== null && s.plate.items.length > 0, 120, coverPlan);
  const secondDish = () => [
    { station: { type: 'bin', kind: 'mie' }, act: 'take', done: (s) => hasCarrying(s, 'mie', 'raw') },
    { station: { type: 'stove', burner: -1, want: 'mie' }, act: 'cook', done: (s) => burnerWith(s, 'mie') !== -1 },
    { station: { type: 'bin', kind: 'sayur' }, act: 'take', done: (s) => hasCarrying(s, 'sayur', 'raw') },
    { station: { type: 'board' }, act: 'chop', done: () => false },
  ];
  runPilot(world, (s) => s.board.chop !== null && s.board.chop.hits >= 1 && burnerWith(s, 'mie') !== -1, 60, secondDish);
  return { screen: SCREEN_PLAY, best: 0 };
}

export { plateRecipe };
