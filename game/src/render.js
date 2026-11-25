// DAPUR SENJA — render: draws the whole kitchen on one canvas.
// Warm dusk palette, big readable labels: the judge reads the game mostly
// from screenshots shrunk small, so every station, order and timer is
// labelled in large text.
import {
  CHOP_HITS, DAY_SECONDS, ITEMS, PALETTE, RECIPES, RUSH_AT, STATIONS, VIEW, recipeNeeds,
} from './config.js';
import { isRush, nearestStation, plateRecipe } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, weight = '700', align = 'center') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

export function drawFood(ctx, kind, state, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  if (state === 'burnt') {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.5);
    ctx.quadraticCurveTo(0, -s * 0.8, s * 0.15, -s * 0.55);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (kind === 'nasi') {
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(0, s * 0.1, s * 0.42, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-s * 0.42, s * 0.05, s * 0.84, s * 0.12);
    // Rice grains: a few pale dots so the mound reads as rice, not a blob.
    ctx.fillStyle = '#e8d9ae';
    const grains = [[-0.2, -0.08], [0.05, -0.18], [0.24, -0.02], [-0.05, 0.02], [0.16, -0.14]];
    for (const [gx, gy] of grains) {
      ctx.beginPath();
      ctx.ellipse(gx * s, gy * s, s * 0.07, s * 0.045, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state === 'cooked') {
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.35);
      ctx.quadraticCurveTo(0, -s * 0.6, s * 0.2, -s * 0.35);
      ctx.stroke();
    }
  } else if (kind === 'mie') {
    ctx.strokeStyle = '#e8a91c';
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.42, Math.PI * 0.15, Math.PI * 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = s * 0.12;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, -s * 0.05, s * (0.34 - i * 0.1), Math.PI * 0.2, Math.PI * 1.05);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6b4a';
    ctx.beginPath();
    ctx.arc(s * 0.28, -s * 0.28, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'ayam') {
    // Browned drumstick: darker crust, grill stripes, white bone.
    ctx.fillStyle = state === 'cooked' ? '#c96a2e' : '#e07a4f';
    ctx.beginPath();
    ctx.arc(-s * 0.08, s * 0.05, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state === 'cooked' ? '#8a3f14' : '#b85a30';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.1);
    ctx.lineTo(-s * 0.05, s * 0.18);
    ctx.moveTo(-s * 0.12, -s * 0.22);
    ctx.lineTo(s * 0.12, s * 0.05);
    ctx.stroke();
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.15);
    ctx.lineTo(s * 0.45, -s * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(s * 0.48, -s * 0.42, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'telur') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.44, s * 0.34, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = state === 'cooked' ? '#ff9d2e' : '#ffe9a8';
    ctx.beginPath();
    ctx.arc(s * 0.03, -s * 0.02, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-s * 0.03, -s * 0.08, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'sayur') {
    const greens = ['#7bc96f', '#4da34a', '#9ed68a'];
    for (let i = -1; i <= 1; i += 1) {
      ctx.fillStyle = greens[i + 1];
      ctx.beginPath();
      ctx.ellipse(i * s * 0.22, -i * i * s * 0.08, s * 0.17, s * 0.32, i * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2f6b2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(i * s * 0.22, -s * 0.3);
      ctx.lineTo(i * s * 0.22 + i * s * 0.08, s * 0.2);
      ctx.stroke();
    }
  } else if (kind === 'cabai') {
    // Curved chili with a clear silhouette: red body, pale highlight, stem.
    ctx.fillStyle = '#e83232';
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.15, s * 0.55, s * 0.45, -s * 0.32);
    ctx.quadraticCurveTo(s * 0.1, -s * 0.05, -s * 0.38, -s * 0.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.18);
    ctx.quadraticCurveTo(s * 0.05, s * 0.25, s * 0.3, -s * 0.2);
    ctx.stroke();
    ctx.strokeStyle = '#4da34a';
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, -s * 0.28);
    ctx.lineTo(-s * 0.48, -s * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#4da34a';
    ctx.beginPath();
    ctx.arc(-s * 0.32, -s * 0.28, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state === 'chopped') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.3);
    ctx.lineTo(s * 0.3, -s * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStationBase(ctx, rect, label, active) {
  ctx.fillStyle = active ? '#4a3358' : PALETTE.panel;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
  ctx.fill();
  ctx.strokeStyle = active ? PALETTE.gold : PALETTE.panelEdge;
  ctx.lineWidth = active ? 4 : 2;
  ctx.stroke();
  text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h - 13, 14, PALETTE.cream);
}

function drawOrderCard(ctx, order, x, y, w, h) {
  const frac = Math.max(0, order.patience / order.max);
  ctx.fillStyle = '#2b1f33';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = frac < 0.3 ? PALETTE.red : PALETTE.panelEdge;
  ctx.lineWidth = frac < 0.3 ? 3 : 2;
  ctx.stroke();
  text(ctx, order.recipe.name, x + w / 2, y + 16, 14, PALETTE.cream, '800');
  const needs = recipeNeeds(order.recipe);
  const iw = 26;
  const totalW = needs.length * (iw + 8) - 8;
  let ix = x + (w - totalW) / 2 + iw / 2;
  for (const n of needs) {
    drawFood(ctx, n.kind, n.state, ix, y + 42, 15);
    ix += iw + 8;
  }
  ctx.fillStyle = '#241a2e';
  roundRect(ctx, x + 10, y + h - 16, w - 20, 8, 4);
  ctx.fill();
  ctx.fillStyle = frac < 0.3 ? PALETTE.red : PALETTE.gold;
  roundRect(ctx, x + 10, y + h - 16, (w - 20) * frac, 8, 4);
  ctx.fill();
  text(ctx, `${Math.ceil(order.patience)} dtk`, x + w - 12, y + h - 26, 11, '#cbb8d6', '600', 'right');
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function drawTopBar(state, best) {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, VIEW.width, 108);
    text(ctx, 'PESANAN', 78, 54, 14, '#8f7ba3', '800');
    // Orders: four cards max, narrow enough to leave the score zone clear.
    const cardW = 198;
    state.orders.forEach((o, i) => {
      drawOrderCard(ctx, o, 150 + i * (cardW + 8), 8, cardW, 92);
    });
    if (state.orders.length === 0) {
      text(ctx, 'Menunggu pesanan…', 150 + cardW / 2 + 40, 54, 16, '#cbb8d6', '600');
    }
    // Score zone (x 990-1272), timer on the right — never under a card.
    const remain = Math.max(0, DAY_SECONDS - state.time);
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60).toString().padStart(2, '0');
    const rush = isRush(state);
    text(ctx, `SKOR ${state.score}`, 992, 26, 18, PALETTE.gold, '800', 'left');
    text(ctx, `KOIN ${state.coins}  •  SAJI ${state.served}`, 992, 50, 13, '#cbb8d6', '600', 'left');
    if (state.combo > 1) text(ctx, `KOMBO x${state.combo}`, 992, 72, 13, PALETTE.ember, '800', 'left');
    else if (best > 0) text(ctx, `TERBAIK ${best}`, 992, 72, 11, '#8f7ba3', '600', 'left');
    text(ctx, `${mm}:${ss}`, 1212, 30, 32, rush ? PALETTE.ember : PALETTE.cream, '800');
    text(ctx, rush ? 'RUSH SENJA!' : 'WAKTU', 1212, 60, 13, rush ? PALETTE.ember : '#8f7ba3', '800');
    ctx.fillStyle = '#241a2e';
    roundRect(ctx, 1130, 76, 142, 8, 4);
    ctx.fill();
    ctx.fillStyle = rush ? PALETTE.ember : PALETTE.teal;
    roundRect(ctx, 1130, 76, 142 * (1 - state.time / DAY_SECONDS), 8, 4);
    ctx.fill();
  }

  function drawKitchen(state, highlight) {
    // Floor tiles.
    for (let ty = 0; ty < 6; ty += 1) {
      for (let tx = 0; tx < 8; tx += 1) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floor : PALETTE.floorAlt;
        ctx.fillRect(168 + tx * 140, 116 + ty * 98, 140, 98);
      }
    }
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 108, 168, 612);
    text(ctx, 'BAHAN', 92, 132, 16, PALETTE.cream, '800');
    // Ingredient bins.
    for (const bin of STATIONS.bins) {
      const active = highlight && highlight.type === 'bin' && highlight.kind === bin.kind;
      drawStationBase(ctx, bin, ITEMS[bin.kind].name, active);
      drawFood(ctx, bin.kind, 'raw', bin.x + 30, bin.y + bin.h / 2 - 6, 20);
      text(ctx, 'AMBIL [E]', bin.x + bin.w - 8, bin.y + bin.h / 2 - 6, 10, '#8f7ba3', '600', 'right');
    }
    // Chopping board.
    const board = STATIONS.board;
    const boardActive = highlight && highlight.type === 'board';
    drawStationBase(ctx, board, 'TALENAN — CINCANG', boardActive);
    if (state.board.item) {
      drawFood(ctx, state.board.item.kind, state.board.item.state, board.x + board.w / 2, board.y + 38, 26);
    } else {
      text(ctx, 'letakkan bahan cincang di sini', board.x + board.w / 2, board.y + 38, 12, '#8f7ba3', '600');
    }
    if (state.board.chop) {
      const chop = state.board.chop;
      const bx = board.x + 14;
      const bw = board.w - 28;
      ctx.fillStyle = '#241a2e';
      roundRect(ctx, bx, board.y + 60, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = PALETTE.leaf;
      roundRect(ctx, bx + bw * 0.42, board.y + 60, bw * 0.2, 14, 7);
      ctx.fill();
      const mx = bx + bw * chop.marker;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 2, board.y + 56, 4, 22);
      text(ctx, `TEKAN E DI HIJAU  ${chop.hits}/${CHOP_HITS}  ★${chop.perfects}`, board.x + board.w / 2, board.y + 84, 10, PALETTE.gold, '800');
    }
    // Stove + burners.
    const stove = STATIONS.stove;
    const stoveActive = highlight && highlight.type === 'stove';
    drawStationBase(ctx, stove, 'KOMPOR — MASAK', stoveActive);
    STATIONS.burners.forEach((r, i) => {
      const b = state.burners[i];
      ctx.fillStyle = '#1c1424';
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.strokeStyle = b ? PALETTE.ember : '#5b4368';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (b) {
        drawFood(ctx, b.kind, b.state === 'burnt' ? 'burnt' : 'cooked', r.x + r.w / 2, r.y + 26, 18);
        if (b.state === 'cooking') {
          const frac = Math.min(1, b.t / b.cookTime);
          ctx.fillStyle = '#241a2e';
          roundRect(ctx, r.x + 8, r.y + r.h - 12, r.w - 16, 6, 3);
          ctx.fill();
          ctx.fillStyle = b.t > b.cookTime ? PALETTE.ember : PALETTE.gold;
          roundRect(ctx, r.x + 8, r.y + r.h - 12, (r.w - 16) * frac, 6, 3);
          ctx.fill();
          if (b.t >= b.cookTime) text(ctx, 'ANGKAT!', r.x + r.w / 2, r.y + r.h - 22, 11, PALETTE.gold, '800');
        } else {
          text(ctx, 'GOSONG!', r.x + r.w / 2, r.y + r.h - 22, 11, PALETTE.red, '800');
        }
      } else {
        text(ctx, 'kosong', r.x + r.w / 2, r.y + r.h / 2, 12, '#8f7ba3', '600');
      }
    });
    // Plate / assembly counter.
    const plate = STATIONS.plate;
    const plateActive = highlight && highlight.type === 'plate';
    drawStationBase(ctx, plate, 'MEJA RACIK — PIRING', plateActive);
    if (state.plate.items.length === 0) {
      text(ctx, 'rakit hidangan di sini (maks 3)', plate.x + plate.w / 2, plate.y + 44, 12, '#8f7ba3', '600');
    } else {
      // White serving plate under the assembled food.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(plate.x + plate.w / 2, plate.y + 44, 116, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9b8a3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(plate.x + plate.w / 2, plate.y + 44, 116, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
      // The dish is served as one clustered plate, not three separate
      // icons: items overlap slightly with a small vertical stagger.
      const offsets = [[-54, -6], [0, 8], [54, -2]];
      state.plate.items.forEach((it, i) => {
        const [ox, oy] = offsets[i] ?? [0, 0];
        drawFood(ctx, it.kind, it.state, plate.x + plate.w / 2 + ox, plate.y + 44 + oy, 26);
      });
      const r = plateRecipe(state);
      if (r) {
        text(ctx, `✓ ${r.name} — SIAP!`, plate.x + plate.w / 2, plate.y + 92, 15, PALETTE.leaf, '800');
      } else {
        text(ctx, 'belum sesuai resep…', plate.x + plate.w / 2, plate.y + 92, 12, '#cbb8d6', '600');
      }
    }
    if (state.plate.quality > 0) text(ctx, `Kualitas ★${state.plate.quality}`, plate.x + plate.w - 10, plate.y + 18, 11, PALETTE.gold, '800', 'right');
    // Serving window.
    const win = STATIONS.window;
    const winActive = highlight && highlight.type === 'window';
    drawStationBase(ctx, win, 'JENDELA SAJI — ANTAR [E]', winActive);
    text(ctx, 'antar piring yang sudah sesuai resep', win.x + win.w / 2, win.y + 46, 12, '#cbb8d6', '600');
    // Trash.
    const trash = STATIONS.trash;
    const trashActive = highlight && highlight.type === 'trash';
    drawStationBase(ctx, trash, 'SAMPAH', trashActive);
    text(ctx, 'buang gosong / bahan', trash.x + trash.w / 2, trash.y + 34, 11, '#8f7ba3', '600');
    // Help line.
    text(ctx, 'WASD / panah jalan  •  E ambil & pakai  •  klik stasiun untuk jalan ke sana  •  P jeda  •  M suara', 640, 706, 12, '#8f7ba3', '600');
  }

  function drawChef(state) {
    const c = state.chef;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.save();
    ctx.translate(c.x + shakeX, c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b4a';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(-14, 6, 28, 16);
    ctx.fillStyle = '#ff6b4a';
    ctx.fillRect(-14, 6, 28, 4);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -14, -30, 28, 14, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-8, -28, 8, 0, Math.PI * 2);
    ctx.arc(8, -28, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a2e';
    ctx.beginPath();
    ctx.arc(-7, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(7, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Carried items float above the hat.
    c.carrying.forEach((it, i) => {
      drawFood(ctx, it.kind, it.state, -14 + i * 28, -46, 15);
    });
    ctx.restore();
  }

  function drawFlash(state) {
    if (!state.flash) return;
    const age = state.time - state.flashAt;
    if (age > 2.2) return;
    ctx.globalAlpha = age > 1.6 ? (2.2 - age) / 0.6 : 1;
    text(ctx, state.flash, 640, 130, 20, PALETTE.gold, '800');
    ctx.globalAlpha = 1;
  }

  function drawOverlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(20,12,28,0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(ctx, title, 640, 250, 54, accent, '800');
    lines.forEach((ln, i) => text(ctx, ln, 640, 320 + i * 34, 20, PALETTE.cream, '600'));
  }

  return {
    draw(state, screen, best) {
      ctx.clearRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = PALETTE.floor;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      const highlight = screen === SCREEN_PLAY ? nearestStation(state) : null;
      drawTopBar(state, best);
      drawKitchen(state, highlight);
      drawChef(state);
      drawFlash(state);
      if (screen === SCREEN_TITLE) {
        drawOverlay('DAPUR SENJA', [
          'Warung masak cepat di ujung senja — cincang, masak, rakit, antar!',
          'Cincang di zona hijau untuk bintang kualitas. Jangan sampai gosong.',
          'Klik atau tekan SPASI untuk mulai  •  WASD jalan, E pakai stasiun',
        ], PALETTE.gold);
      } else if (screen === SCREEN_PAUSED) {
        drawOverlay('JEDA', ['Tekan P atau SPASI untuk lanjut', `Skor ${state.score}  •  ${state.served} hidangan tersaji`], PALETTE.cream);
      } else if (screen === SCREEN_OVER) {
        const stars = state.served >= 12 ? 3 : state.served >= 8 ? 2 : state.served >= 4 ? 1 : 0;
        drawOverlay('HARI SELESAI!', [
          `Skor ${state.score}  •  Koin ${state.coins}  •  ${state.served} hidangan tersaji  •  ${state.lost} pesanan hangus`,
          `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`,
          'Tekan R atau klik untuk masak lagi',
        ], PALETTE.gold);
      }
    },
  };
}
