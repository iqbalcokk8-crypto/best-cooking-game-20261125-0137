// DAPUR SENJA — world: pure game logic, no DOM, no canvas.
// The chef walks a warung kitchen, chops on the board (timed hits in the
// green zone), cooks on two stove burners, assembles plates and serves
// orders before their patience runs out.
import {
  CHEF, CHOP_HITS, DAY_SECONDS, INTERACT_RANGE, ITEMS, MAX_HANDS,
  ORDER_EVERY, ORDER_EVERY_RUSH, ORDER_FIRST_AT, ORDER_PATIENCE,
  ORDER_PATIENCE_RUSH, RECIPES, RUSH_AT, STATIONS, recipeNeeds,
} from './config.js';

export const EVENT_SERVED = 1;
export const EVENT_ORDER_LOST = 2;
export const EVENT_BURNT = 4;
export const EVENT_DAY_OVER = 8;
export const EVENT_TAKE = 16;
export const EVENT_CHOP = 32;
export const EVENT_PLACE = 64;
export const EVENT_ORDER = 128;

let nextOrderId = 1;

export function createWorld(random) {
  const state = freshState();
  return {
    state,
    random,
    reset() {
      const s = freshState();
      Object.keys(s).forEach((k) => { state[k] = s[k]; });
      nextOrderId = 1;
    },
    step(dt, input) {
      return stepWorld(state, dt, input, random);
    },
  };
}

function freshState() {
  return {
    time: 0,
    dayOver: false,
    score: 0,
    coins: 0,
    served: 0,
    lost: 0,
    combo: 0,
    comboTimer: 0,
    lastServeAt: -999,
    chef: { x: CHEF.startX, y: CHEF.startY, carrying: [] },
    board: { item: null, chop: null },
    burners: [null, null],
    plate: { items: [], quality: 0 },
    orders: [],
    orderTimer: ORDER_FIRST_AT,
    flash: '',
    flashAt: 0,
    shake: 0,
    lastChopPerfect: false,
    servedLog: [],
  };
}

export function isRush(state) {
  return state.time >= RUSH_AT;
}

export function stationAt(state, x, y) {
  for (const bin of STATIONS.bins) {
    if (x >= bin.x - 14 && x <= bin.x + bin.w + 14 && y >= bin.y - 14 && y <= bin.y + bin.h + 14) {
      return { type: 'bin', kind: bin.kind, rect: bin };
    }
  }
  const b = STATIONS.board;
  if (x >= b.x - 14 && x <= b.x + b.w + 14 && y >= b.y - 14 && y <= b.y + b.h + 14) return { type: 'board', rect: b };
  const s = STATIONS.stove;
  if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.y - 14 && y <= s.y + s.h + 14) {
    const bi = STATIONS.burners.findIndex((r) => x >= r.x - 10 && x <= r.x + r.w + 10 && y >= r.y - 10 && y <= r.y + r.h + 10);
    return { type: 'stove', burner: bi === -1 ? 0 : bi, rect: s };
  }
  const p = STATIONS.plate;
  if (x >= p.x - 14 && x <= p.x + p.w + 14 && y >= p.y - 14 && y <= p.y + p.h + 14) return { type: 'plate', rect: p };
  const w = STATIONS.window;
  if (x >= w.x - 14 && x <= w.x + w.w + 14 && y >= w.y - 14 && y <= w.y + w.h + 14) return { type: 'window', rect: w };
  const t = STATIONS.trash;
  if (x >= t.x - 14 && x <= t.x + t.w + 14 && y >= t.y - 14 && y <= t.y + t.h + 14) return { type: 'trash', rect: t };
  return null;
}

export function nearestStation(state) {
  const c = state.chef;
  const candidates = [];
  for (const bin of STATIONS.bins) candidates.push({ type: 'bin', kind: bin.kind, rect: bin });
  candidates.push({ type: 'board', rect: STATIONS.board });
  candidates.push({ type: 'stove', burner: 0, rect: STATIONS.stove });
  candidates.push({ type: 'plate', rect: STATIONS.plate });
  candidates.push({ type: 'window', rect: STATIONS.window });
  candidates.push({ type: 'trash', rect: STATIONS.trash });
  let best = null;
  let bestD = Infinity;
  for (const cand of candidates) {
    const cx = Math.max(cand.rect.x, Math.min(c.x, cand.rect.x + cand.rect.w));
    const cy = Math.max(cand.rect.y, Math.min(c.y, cand.rect.y + cand.rect.h));
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d < bestD) { bestD = d; best = cand; }
  }
  if (bestD > INTERACT_RANGE) return null;
  if (best.type === 'stove') {
    let bi = 0;
    let bd = Infinity;
    STATIONS.burners.forEach((r, i) => {
      const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bd) { bd = d; bi = i; }
    });
    best.burner = bi;
  }
  return best;
}

function flash(state, text) {
  state.flash = text;
  state.flashAt = state.time;
}

function chopZone() {
  return { lo: 0.42, hi: 0.62 };
}

function startChop(state, item) {
  state.board.item = item;
  state.board.chop = { marker: 0, dir: 1, hits: 0, perfects: 0 };
}

function finishChop(state) {
  const chop = state.board.chop;
  const item = state.board.item;
  const chopped = { kind: item.kind, state: 'chopped' };
  state.plate.quality = Math.max(state.plate.quality, chop.perfects);
  state.board.item = null;
  state.board.chop = null;
  if (state.chef.carrying.length < MAX_HANDS) {
    state.chef.carrying.push(chopped);
    flash(state, chop.perfects >= 2 ? 'Cincangan SEMPURNA!' : 'Sudah dicincang');
  } else {
    state.board.item = chopped;
    flash(state, 'Cincangan siap — tangan penuh');
  }
  return chop.perfects;
}

function plateMatchesRecipe(items) {
  const have = items.map((i) => `${i.kind}:${i.state}`).sort().join('|');
  for (const r of RECIPES) {
    const want = recipeNeeds(r).map((n) => `${n.kind}:${n.state}`).sort().join('|');
    if (have === want) return r;
  }
  return null;
}

export function plateRecipe(state) {
  return plateMatchesRecipe(state.plate.items);
}

function spawnOrder(state, random) {
  const recipe = RECIPES[Math.floor(random() * RECIPES.length)];
  const rush = isRush(state);
  const patience = rush ? ORDER_PATIENCE_RUSH : ORDER_PATIENCE;
  state.orders.push({ id: nextOrderId, recipe, patience, max: patience });
  nextOrderId += 1;
}

function serveOrder(state) {
  const recipe = plateRecipe(state);
  if (!recipe) {
    state.shake = 0.25;
    flash(state, 'Piring belum sesuai resep!');
    return false;
  }
  const order = state.orders.find((o) => o.recipe.id === recipe.id);
  if (!order) {
    state.shake = 0.25;
    flash(state, 'Tidak ada pesanan itu sekarang');
    return false;
  }
  const patienceFrac = Math.max(0, order.patience / order.max);
  const tip = Math.round(20 * patienceFrac) + state.plate.quality * 5;
  const withinCombo = state.time - state.lastServeAt <= 12;
  state.combo = withinCombo ? Math.min(3, state.combo + 1) : 1;
  const mult = 1 + 0.25 * (state.combo - 1);
  const earned = Math.round((recipe.base + tip) * mult);
  state.score += earned;
  state.coins += earned;
  state.served += 1;
  state.lastServeAt = state.time;
  state.comboTimer = 12;
  state.orders = state.orders.filter((o) => o.id !== order.id);
  state.plate.items = [];
  state.plate.quality = 0;
  state.servedLog.push({ recipe: recipe.name, earned, at: state.time });
  flash(state, state.combo > 1 ? `Disajikan! +${earned} (KOMBO x${state.combo})` : `Disajikan! +${earned}`);
  return true;
}

function doInteract(state) {
  const st = nearestStation(state);
  if (!st) return 0;
  const chef = state.chef;
  if (st.type === 'bin') {
    if (chef.carrying.length >= MAX_HANDS) { flash(state, 'Tangan penuh (maks 2)'); return 0; }
    chef.carrying.push({ kind: st.kind, state: 'raw' });
    flash(state, `${ITEMS[st.kind].name} diambil`);
    return EVENT_TAKE;
  }
  if (st.type === 'board') {
    if (state.board.chop) {
      const chop = state.board.chop;
      const zone = chopZone();
      const perfect = chop.marker >= zone.lo && chop.marker <= zone.hi;
      state.lastChopPerfect = perfect;
      chop.hits += 1;
      if (perfect) chop.perfects += 1;
      if (chop.hits >= CHOP_HITS) finishChop(state);
      return EVENT_CHOP;
    }
    if (state.board.item) {
      if (state.board.item.state === 'chopped') {
        if (chef.carrying.length >= MAX_HANDS) { flash(state, 'Tangan penuh (maks 2)'); return 0; }
        chef.carrying.push(state.board.item);
        state.board.item = null;
        return EVENT_TAKE;
      }
      return 0;
    }
    const idx = chef.carrying.findIndex((i) => ITEMS[i.kind].chop && i.state === 'raw');
    if (idx === -1) { flash(state, 'Bawa bahan yang bisa dicincang dulu'); return 0; }
    startChop(state, chef.carrying.splice(idx, 1)[0]);
    return EVENT_PLACE;
  }
  if (st.type === 'stove') {
    const burner = state.burners[st.burner];
    if (!burner) {
      const idx = chef.carrying.findIndex((i) => ITEMS[i.kind].cook && (i.state === 'raw' || i.state === 'chopped'));
      if (idx === -1) { flash(state, 'Bawa bahan yang bisa dimasak dulu'); return 0; }
      const item = chef.carrying.splice(idx, 1)[0];
      state.burners[st.burner] = { kind: item.kind, state: 'cooking', t: 0, cookTime: ITEMS[item.kind].cookTime };
      return EVENT_PLACE;
    }
    if (burner.state === 'burnt') {
      if (chef.carrying.length >= MAX_HANDS) { flash(state, 'Tangan penuh (maks 2)'); return 0; }
      chef.carrying.push({ kind: burner.kind, state: 'burnt' });
      state.burners[st.burner] = null;
      flash(state, 'Gosong! Buang ke tempat sampah');
      return EVENT_TAKE;
    }
    if (burner.t >= burner.cookTime) {
      if (chef.carrying.length >= MAX_HANDS) { flash(state, 'Tangan penuh (maks 2)'); return 0; }
      const perfect = burner.t <= burner.cookTime + 2;
      chef.carrying.push({ kind: burner.kind, state: 'cooked' });
      if (perfect) state.plate.quality = Math.max(state.plate.quality, 1);
      state.burners[st.burner] = null;
      flash(state, perfect ? 'Matang SEMPURNA!' : 'Sudah matang');
      return EVENT_TAKE;
    }
    flash(state, 'Masih dimasak…');
    return 0;
  }
  if (st.type === 'plate') {
    if (chef.carrying.length > 0) {
      const idx = chef.carrying.findIndex((i) => i.state === 'cooked' || i.state === 'chopped');
      if (idx === -1) { flash(state, 'Bahan mentah tidak bisa disajikan'); return 0; }
      if (state.plate.items.length >= 3) { flash(state, 'Piring penuh (maks 3)'); return 0; }
      state.plate.items.push(chef.carrying.splice(idx, 1)[0]);
      const r = plateRecipe(state);
      if (r) flash(state, `${r.name} siap disajikan!`);
      return EVENT_PLACE;
    }
    if (state.plate.items.length > 0) {
      state.plate.items.pop();
      state.plate.quality = 0;
      flash(state, 'Satu bahan diambil dari piring');
    }
    return 0;
  }
  if (st.type === 'window') {
    return serveOrder(state) ? EVENT_SERVED : 0;
  }
  if (st.type === 'trash') {
    if (chef.carrying.length === 0) { flash(state, 'Tidak ada yang dibuang'); return 0; }
    chef.carrying = [];
    flash(state, 'Dibuang ke sampah');
    return 0;
  }
  return 0;
}

function collide(state, nx, ny) {
  const r = CHEF.radius;
  const solids = [
    ...STATIONS.bins.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    STATIONS.board, STATIONS.stove, STATIONS.plate, STATIONS.window, STATIONS.trash,
  ];
  let x = nx;
  let y = ny;
  for (const s of solids) {
    const cx = Math.max(s.x, Math.min(x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    } else if (d2 <= 0.0001 && x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r) {
      x = nx;
      y = ny;
    }
  }
  return { x: Math.max(180 + r, Math.min(1260 - r, x)), y: Math.max(120 + r, Math.min(700 - r, y)) };
}

function stepWorld(state, dt, input, random) {
  let events = 0;
  if (state.dayOver) return events;
  state.time += dt;
  if (state.time >= DAY_SECONDS) {
    state.time = DAY_SECONDS;
    state.dayOver = true;
    return EVENT_DAY_OVER;
  }
  // Chop marker sweeps while a chop is active.
  if (state.board.chop) {
    const chop = state.board.chop;
    chop.marker += chop.dir * dt * 1.6;
    if (chop.marker >= 1) { chop.marker = 1; chop.dir = -1; }
    if (chop.marker <= 0) { chop.marker = 0; chop.dir = 1; }
  }
  // Burners cook; overcook burns.
  state.burners.forEach((b, i) => {
    if (!b || b.state !== 'cooking') return;
    b.t += dt;
    if (b.t > b.cookTime + 8) {
      b.state = 'burnt';
      events |= EVENT_BURNT;
      flash(state, 'Ada yang gosong di kompor!');
    }
  });
  // Orders spawn and age.
  state.orderTimer -= dt;
  if (state.orderTimer <= 0 && state.orders.length < 4) {
    spawnOrder(state, random);
    events |= EVENT_ORDER;
    state.orderTimer = isRush(state) ? ORDER_EVERY_RUSH : ORDER_EVERY;
  }
  for (const o of state.orders) o.patience -= dt;
  const before = state.orders.length;
  state.orders = state.orders.filter((o) => o.patience > 0);
  if (state.orders.length < before) {
    state.lost += before - state.orders.length;
    state.combo = 0;
    events |= EVENT_ORDER_LOST;
    flash(state, 'Pesanan hangus — pelanggan pergi!');
  }
  if (state.comboTimer > 0) state.comboTimer -= dt;
  if (state.shake > 0) state.shake -= dt;
  // Chef movement.
  const chef = state.chef;
  const mag = Math.hypot(input.dx, input.dy);
  if (mag > 0.01) {
    const nx = chef.x + (input.dx / mag) * CHEF.speed * dt;
    const ny = chef.y + (input.dy / mag) * CHEF.speed * dt;
    const pos = collide(state, nx, ny);
    chef.x = pos.x;
    chef.y = pos.y;
  }
  if (input.interact) events |= doInteract(state);
  return events;
}

export { plateMatchesRecipe, recipeNeeds };
