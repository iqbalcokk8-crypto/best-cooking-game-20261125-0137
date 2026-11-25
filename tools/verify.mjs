// DAPUR SENJA — logic verification (node only, no browser).
// Imports the real world.js and drives it: recipes, chop meter, stove
// cook/burn, serving, wrong plates, order expiry, day end.
// Usage: node tools/verify.mjs
import { createRandom } from '../game/src/random.js';
import { createWorld, plateRecipe, EVENT_CHOP, EVENT_ORDER, EVENT_PLACE, EVENT_SERVED, EVENT_TAKE } from '../game/src/world.js';
import { RECIPES, STATIONS } from '../game/src/config.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
}
const STEP = 1 / 60;
function run(world, seconds, input = { dx: 0, dy: 0, interact: false }) {
  const n = Math.round(seconds / STEP);
  let events = 0;
  for (let i = 0; i < n; i += 1) events |= world.step(STEP, input);
  return events;
}
function nearBurner(world, i) {
  const r = STATIONS.burners[i];
  world.state.chef.x = r.x + r.w / 2;
  world.state.chef.y = STATIONS.stove.y + STATIONS.stove.h + 30;
}
function near(world, rect, pad = 30) {
  world.state.chef.x = rect.x + rect.w / 2;
  world.state.chef.y = rect.y + rect.h + pad;
}
function press(world) {
  world.step(STEP, { dx: 0, dy: 0, interact: true });
}
function takeFromBin(world, kind) {
  const bin = STATIONS.bins.find((b) => b.kind === kind);
  // Stand to the right of the bin (below it, the next bin is nearer).
  world.state.chef.x = bin.x + bin.w + 34;
  world.state.chef.y = bin.y + bin.h / 2;
  press(world);
  return world.state.chef.carrying.some((i) => i.kind === kind);
}

const world = createWorld(createRandom(7));
const s = world.state;

// 1. Taking ingredients fills hands, max 2.
check('take nasi', takeFromBin(world, 'nasi'));
check('take telur', takeFromBin(world, 'telur'));
near(world, STATIONS.bins.find((b) => b.kind === 'mie'));
press(world);
check('hands capped at 2', s.chef.carrying.length === 2, `got ${s.chef.carrying.length}`);

// 2. Chop: cabai needs a free hand first — trash the two, take cabai.
near(world, STATIONS.trash);
press(world);
check('trash empties hands', s.chef.carrying.length === 0);
check('take cabai', takeFromBin(world, 'cabai'));
near(world, STATIONS.board);
press(world);
check('chop started', s.board.chop !== null);
for (let i = 0; i < 3; i += 1) {
  s.board.chop.marker = 0.5;
  press(world);
}
check('chop finished: cabai chopped in hand', s.chef.carrying.some((i) => i.kind === 'cabai' && i.state === 'chopped'), JSON.stringify(s.chef.carrying));

// 3. Stove: cook nasi, take when done; overcook burns.
near(world, STATIONS.trash);
press(world);
check('take nasi again', takeFromBin(world, 'nasi'));
nearBurner(world, 0);
press(world);
check('nasi on burner 0', s.burners[0] && s.burners[0].kind === 'nasi');
run(world, 7);
check('nasi cooked after 7s', s.burners[0].t >= 6 && s.burners[0].state === 'cooking');
nearBurner(world, 0);
press(world);
check('cooked nasi in hand', s.chef.carrying.some((i) => i.kind === 'nasi' && i.state === 'cooked'));
check('take mie', takeFromBin(world, 'mie'));
nearBurner(world, 1);
press(world);
check('mie on burner 1', s.burners[1] && s.burners[1].kind === 'mie');
run(world, 15);
check('mie burnt after 15s', s.burners[1] && s.burners[1].state === 'burnt', JSON.stringify(s.burners[1]));
nearBurner(world, 1);
press(world);
check('burnt mie in hand', s.chef.carrying.some((i) => i.state === 'burnt'));
near(world, STATIONS.trash);
press(world);
check('burnt trashed', s.chef.carrying.length === 0);

// 4. Plate + recipe match + serve.
s.plate.items = [
  { kind: 'nasi', state: 'cooked' },
  { kind: 'telur', state: 'cooked' },
  { kind: 'cabai', state: 'chopped' },
];
check('plate matches nasi goreng', plateRecipe(s) && plateRecipe(s).id === 'nasi-goreng');
s.orders.push({ id: 99, recipe: plateRecipe(s), patience: 60, max: 60 });
const scoreBefore = s.score;
near(world, STATIONS.window);
press(world);
check('served once', s.served === 1 && s.score > scoreBefore, `served=${s.served} score=${s.score}`);
check('plate cleared after serve', s.plate.items.length === 0);

// 5. Wrong plate does not serve.
s.plate.items = [{ kind: 'nasi', state: 'cooked' }];
s.orders.push({ id: 100, recipe: { id: 'ayam-geprek', name: 'Ayam Geprek Senja', needs: ['ayam:cooked', 'cabai:chopped'], base: 40, color: '#ff6b4a' }, patience: 60, max: 60 });
near(world, STATIONS.window);
press(world);
check('wrong plate not served', s.served === 1, `served=${s.served}`);

// 6. Order patience expires.
run(world, 70);
check('old order id 100 expired', !s.orders.some((o) => o.id === 100), `orders=${s.orders.map((o) => o.id)}`);

// 7. Day ends at 180 s.
run(world, 120);
check('day over', s.dayOver === true, `time=${s.time}`);

// 8. Fresh world: orders spawn within the first seconds.
const w2 = createWorld(createRandom(3));
run(w2, 5);
check('first order spawned', w2.state.orders.length >= 1, `orders=${w2.state.orders.length}`);

// 9. Audio events: every audible action emits its event (round-2 fix:
// EVENT_SERVED was never emitted, chop/pickup/place had no event at all).
const w3 = createWorld(createRandom(11));
const binCabai = STATIONS.bins.find((b) => b.kind === 'cabai');
w3.state.chef.x = binCabai.x + binCabai.w + 34;
w3.state.chef.y = binCabai.y + binCabai.h / 2;
let ev = w3.step(STEP, { dx: 0, dy: 0, interact: true });
check('take emits EVENT_TAKE', (ev & EVENT_TAKE) !== 0, `ev=${ev}`);
near(w3, STATIONS.board);
ev = w3.step(STEP, { dx: 0, dy: 0, interact: true });
check('start chop emits EVENT_PLACE', (ev & EVENT_PLACE) !== 0, `ev=${ev}`);
w3.state.board.chop.marker = 0.5;
ev = w3.step(STEP, { dx: 0, dy: 0, interact: true });
check('chop hit emits EVENT_CHOP + perfect', (ev & EVENT_CHOP) !== 0 && w3.state.lastChopPerfect === true, `ev=${ev} perfect=${w3.state.lastChopPerfect}`);
w3.state.plate.items = [
  { kind: 'nasi', state: 'cooked' },
  { kind: 'telur', state: 'cooked' },
  { kind: 'cabai', state: 'chopped' },
];
w3.state.orders.push({ id: 77, recipe: plateRecipe(w3.state), patience: 60, max: 60 });
near(w3, STATIONS.window);
ev = w3.step(STEP, { dx: 0, dy: 0, interact: true });
check('serve emits EVENT_SERVED', (ev & EVENT_SERVED) !== 0 && w3.state.served === 1, `ev=${ev} served=${w3.state.served}`);
const w4 = createWorld(createRandom(3));
const ev4 = run(w4, 5);
check('order spawn emits EVENT_ORDER', (ev4 & EVENT_ORDER) !== 0, `ev=${ev4}`);

// 10. Simultaneous expiry counts every lost order (round-3 fix: lost
// used to rise by 1 no matter how many orders expired in one step).
const w5 = createWorld(createRandom(5));
w5.state.orders.push(
  { id: 201, recipe: RECIPES[0], patience: 0.05, max: 60 },
  { id: 202, recipe: RECIPES[1], patience: 0.05, max: 60 },
);
run(w5, 1);
check('two orders expiring together count as lost=2', w5.state.lost === 2 && w5.state.orders.length === 0, `lost=${w5.state.lost} orders=${w5.state.orders.length}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
