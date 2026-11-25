// DAPUR SENJA — screenshot + playtest runner.
// Serves game/ on localhost, captures every scene in shots.json through
// the real ?shot= staging (the pilot plays the real rules forward), then
// playtests the live game: start, take an ingredient, chop it.
// Usage: node tools/shots.mjs [repo-dir]
// Needs playwright-core (tools/node_modules is a symlink to shot-tools').
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const PORT = 8093;
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('server did not come up');
}

let code = 0;
try {
  await waitServer();
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  // Spy on real sound output: count every oscillator the game creates.
  await page.addInitScript(() => {
    window.__audioCalls = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...args) {
        window.__audioCalls += 1;
        return orig.apply(this, args);
      };
    }
  });

  for (const shot of shots) {
    await page.goto(`http://localhost:${PORT}/index.html${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
    await page.waitForTimeout(150);
    const out = join(repo, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    console.log(`${shot.name}: ${size} bytes${size > 262144 ? '  *** OVER 256 KiB CAP ***' : ''}`);
  }

  // --- live playtest: start, walk to a bin, take cabai, chop it ---
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const titleBefore = await page.evaluate(() => window.__senja.screen);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const started = await page.evaluate(() => window.__senja.screen);
  // Teleport the chef next to the cabai bin and take it (keyboard path).
  await page.evaluate(() => {
    const s = window.__senja.state();
    s.chef.x = 190;
    s.chef.y = 551;
  });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const carrying = await page.evaluate(() => window.__senja.state().chef.carrying.map((i) => `${i.kind}:${i.state}`).join(','));
  // Walk to the board (click-to-walk) and chop: wait until the chop has
  // actually started (arrival + interact can lag a slow frame), then
  // press E in the green zone.
  await page.mouse.click(395, 445);
  await page.waitForFunction(() => {
    const s = window.__senja.state();
    return s.board.chop !== null;
  }, null, { timeout: 10000 });
  await page.waitForTimeout(100);
  const nearBoard = await page.evaluate(() => {
    const s = window.__senja.state();
    return { x: Math.round(s.chef.x), y: Math.round(s.chef.y), boardItem: s.board.item ? s.board.item.kind : null };
  });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const chop = await page.evaluate(() => {
    const s = window.__senja.state();
    return s.board.chop ? { hits: s.board.chop.hits, marker: Math.round(s.board.chop.marker * 100) / 100 } : null;
  });
  // --- mouse navigation across the room (round-2 fix): click a stove
  // burner from the board. The straight line crosses the chopping
  // board's bottom-right corner, where a straight walk stalls — the
  // click path must route via the open hub and arrive.
  await page.mouse.click(635, 304);
  let arrived = null;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(200);
    arrived = await page.evaluate(() => {
      const s = window.__senja.state();
      return { x: Math.round(s.chef.x), y: Math.round(s.chef.y) };
    });
    if (Math.hypot(arrived.x - 635, arrived.y - 304) < 45) break;
  }
  console.log(`playtest: title=${titleBefore} started=${started} carrying=[${carrying}] nearBoard=${JSON.stringify(nearBoard)} chop=${JSON.stringify(chop)} mouseWalk=${JSON.stringify(arrived)}`);
  console.log(`page errors: ${errors.length === 0 ? 'NONE' : errors.join(' | ')}`);
  if (titleBefore !== 'title' || started !== 'play' || carrying !== 'cabai:raw' || !nearBoard.boardItem || !chop) code = 1;
  if (!arrived || Math.hypot(arrived.x - 635, arrived.y - 304) >= 45) code = 1;
  if (errors.length > 0) code = 1;

  // --- click-route matrix: click the CENTER of each station from far
  // across the room (the nudge moves the target to its approach point).
  const routes = [
    { from: [200, 181], click: [690, 210], expect: [690, 304], name: 'nasi bin -> stove' },
    { from: [690, 304], click: [1030, 365], expect: [1030, 464], name: 'stove -> plate' },
    { from: [1030, 464], click: [90, 551], expect: [200, 616], name: 'plate -> cabai bin' },
    { from: [200, 616], click: [1030, 620], expect: [1030, 526], name: 'cabai bin -> window' },
    { from: [1030, 526], click: [375, 600], expect: [375, 674], name: 'window -> trash' },
    { from: [375, 674], click: [395, 355], expect: [395, 444], name: 'trash -> board' },
  ];
  const routeResults = [];
  for (const r of routes) {
    await page.evaluate(([fx, fy]) => {
      const s = window.__senja.state();
      s.chef.x = fx; s.chef.y = fy;
      s.chef.carrying = [];
      s.board.item = null; s.board.chop = null;
      s.plate.items = [];
    }, r.from);
    await page.mouse.click(r.click[0], r.click[1]);
    let pos = null;
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(200);
      pos = await page.evaluate(() => { const s = window.__senja.state(); return { x: Math.round(s.chef.x), y: Math.round(s.chef.y) }; });
      if (Math.hypot(pos.x - r.expect[0], pos.y - r.expect[1]) < 60) break;
    }
    const d = Math.round(Math.hypot(pos.x - r.expect[0], pos.y - r.expect[1]));
    routeResults.push(`${r.name}: ${d}px`);
    if (d >= 60) code = 1;
  }
  console.log(`routes: ${routeResults.join(' | ')}`);

  // --- audio end-to-end: serve plays tones, mute silences everything ---
  const audioCount = () => page.evaluate(() => window.__audioCalls || 0);
  const beforeAudio = await audioCount();
  await page.evaluate(() => {
    const s = window.__senja.state();
    window.__senja.clearClick();
    s.plate.items = [
      { kind: 'nasi', state: 'cooked' },
      { kind: 'telur', state: 'cooked' },
      { kind: 'cabai', state: 'chopped' },
    ];
    s.orders.push({ id: 999, recipe: { id: 'nasi-goreng', name: 'Nasi Goreng Senja', needs: ['nasi:cooked', 'telur:cooked', 'cabai:chopped'], base: 40 }, patience: 60, max: 60 });
    s.chef.x = 1030; s.chef.y = 526;
    s.chef.carrying = [];
  });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const afterServe = await audioCount();
  const served = await page.evaluate(() => window.__senja.state().served);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const s = window.__senja.state(); window.__senja.clearClick(); s.chef.x = 190; s.chef.y = 551; s.chef.carrying = []; });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const mutedCount = await audioCount();
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const s = window.__senja.state(); window.__senja.clearClick(); s.chef.carrying = []; });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const unmutedCount = await audioCount();
  console.log(`audio: before=${beforeAudio} afterServe=${afterServe} served=${served} muted=${mutedCount} unmuted=${unmutedCount}`);
  if (served < 1 || afterServe < beforeAudio + 3) code = 1;
  if (mutedCount !== afterServe) code = 1;
  if (unmutedCount <= mutedCount) code = 1;

  await browser.close();
} catch (e) {
  console.error('SHOTS FAILED:', e.message);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
