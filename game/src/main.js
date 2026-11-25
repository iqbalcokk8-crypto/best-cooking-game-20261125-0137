// DAPUR SENJA — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and
// the renderer paints what is there. Screens: title, play, paused, day over.
//
// ?seed=N fixes the order pattern. ?shot=play|chop|rush|win (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { createRandom } from './random.js';
import { createWorld, EVENT_BURNT, EVENT_CHOP, EVENT_DAY_OVER, EVENT_ORDER, EVENT_ORDER_LOST, EVENT_PLACE, EVENT_SERVED, EVENT_TAKE } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const BEST_KEY = 'dapur-senja-best';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audioCtl = audio;
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let orderCountAtServe = 0;

  window.__senja = {
    get screen() { return screen; },
    state: () => world.state,
    clearClick: () => input.clearClick(),
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    orderCountAtServe = 0;
    screen = SCREEN_PLAY;
    audioCtl.unlock();
    announce('Memasak! Ambil bahan, cincang, masak, rakit, antar.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audioCtl.win();
    announce(`Hari selesai. Skor ${world.state.score}. Terbaik ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_SERVED) {
      audioCtl.serve();
      orderCountAtServe = world.state.orders.length;
    }
    if (events & EVENT_ORDER_LOST) audioCtl.lose();
    if (events & EVENT_BURNT) audioCtl.burn();
    if (events & EVENT_TAKE) audioCtl.pickup();
    if (events & EVENT_CHOP) audioCtl.chop(world.state.lastChopPerfect);
    if (events & EVENT_PLACE) audioCtl.place();
    if (events & EVENT_ORDER) audioCtl.bell();
    if (events & EVENT_DAY_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const dir = input.direction(world.state.chef);
    // Consume the queued press exactly once: direction() only reads the
    // flag, takeInteract() returns it and clears it, so one key press is
    // one interaction (a stuck flag would auto-chop through the meter).
    const interact = input.takeInteract();
    if (screen !== SCREEN_PLAY) accumulator = 0;
    if (screen === SCREEN_TITLE && interact) {
      startGame();
    } else if (screen === SCREEN_OVER && interact) {
      startGame();
    } else if (screen === SCREEN_PLAY) {
      if (interact) audioCtl.unlock();
      let press = interact;
      while (accumulator >= STEP) {
        const events = world.step(STEP, { dx: dir.dx, dy: dir.dy, interact: press });
        press = false;
        handleEvents(events);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else if (screen === SCREEN_PAUSED && interact) {
      screen = SCREEN_PLAY;
      announce('Lanjut memasak.');
    }
    renderer.draw(world.state, screen, best);
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'p' && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (k === 'p' && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Lanjut memasak.');
    } else if (k === 'm') {
      const muted = audioCtl.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    } else if (k === 'r' && screen === SCREEN_OVER) {
      startGame();
    }
  });
  canvas.addEventListener('mousedown', () => {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
    audioCtl.unlock();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Dapur Senja. Tekan Spasi atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
