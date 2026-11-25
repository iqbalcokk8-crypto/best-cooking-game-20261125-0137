// DAPUR SENJA — input: keyboard (WASD/arrows + E/Space) and mouse click.
// Clicking a station walks the chef toward it; clicking the chef's own
// spot or pressing E interacts with the nearest station.
//
// Mouse walks use A* over a coarse grid of the walkable floor (station
// rects inflated by the chef's radius), smoothed by line of sight, so a
// click always reaches its station: straight walks stall on the
// chopping board's corner and on flat station edges, and a single hub
// waypoint cannot route around the trash on the way to the lower bins.
//
// A click in the middle of a station would land inside its solid rect,
// where the chef can never arrive (collision keeps them outside), so
// the target is nudged to the station's approach point just outside
// the rect — below it, or above it for the window at the floor's edge —
// and clamped to the walkable floor (the left bins' approach sits at
// the floor's left edge, x = 200).
import { STATIONS } from './config.js';

const FLOOR = { x0: 200, y0: 140, x1: 1240, y1: 680 };
const CELL = 32;
const COLS = Math.ceil((FLOOR.x1 - FLOOR.x0) / CELL);
const ROWS = Math.ceil((FLOOR.y1 - FLOOR.y0) / CELL);

const SOLIDS = [
  ...STATIONS.bins,
  STATIONS.board, STATIONS.stove, STATIONS.plate, STATIONS.window, STATIONS.trash,
];
// Chef radius 20 + 4 margin: a cell centre inside one of these is blocked.
const BLOCKERS = SOLIDS.map((r) => ({ x: r.x - 24, y: r.y - 24, w: r.w + 48, h: r.h + 48 }));

function pointBlocked(x, y) {
  return BLOCKERS.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function cellOf(x, y) {
  return {
    cx: Math.max(0, Math.min(COLS - 1, Math.floor((x - FLOOR.x0) / CELL))),
    cy: Math.max(0, Math.min(ROWS - 1, Math.floor((y - FLOOR.y0) / CELL))),
  };
}

function cellCentre(cx, cy) {
  return { x: FLOOR.x0 + cx * CELL + CELL / 2, y: FLOOR.y0 + cy * CELL + CELL / 2 };
}

function cellBlocked(cx, cy) {
  const p = cellCentre(cx, cy);
  return pointBlocked(p.x, p.y);
}

// Straight line clear of every (inflated) station rect?
function losClear(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / 8));
  for (let i = 0; i <= n; i += 1) {
    if (pointBlocked(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
  }
  return true;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

function findPath(from, to) {
  const start = cellOf(from.x, from.y);
  const goal = cellOf(to.x, to.y);
  const key = (cx, cy) => cy * COLS + cx;
  const g = new Float64Array(COLS * ROWS).fill(Infinity);
  const fromKey = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  const open = [start];
  g[key(start.cx, start.cy)] = 0;
  const heuristic = (cx, cy) => {
    const dx = Math.abs(cx - goal.cx);
    const dy = Math.abs(cy - goal.cy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i];
      const b = open[best];
      if (g[key(a.cx, a.cy)] + heuristic(a.cx, a.cy) < g[key(b.cx, b.cy)] + heuristic(b.cx, b.cy)) best = i;
    }
    const cur = open.splice(best, 1)[0];
    const curKey = key(cur.cx, cur.cy);
    if (closed[curKey]) continue;
    closed[curKey] = 1;
    if (cur.cx === goal.cx && cur.cy === goal.cy) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.cx + dx;
      const ny = cur.cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      // The start and goal cells are passable even if their centres sit
      // inside an inflated rect (the chef stands 20 px clear, not 24).
      const isGoal = nx === goal.cx && ny === goal.cy;
      const isStart = nx === start.cx && ny === start.cy;
      if (!isGoal && !isStart && cellBlocked(nx, ny)) continue;
      // No cutting corners: a diagonal step needs both sides clear.
      if (dx !== 0 && dy !== 0) {
        if (cellBlocked(cur.cx + dx, cur.cy) || cellBlocked(cur.cx, cur.cy + dy)) continue;
      }
      const ng = g[curKey] + cost;
      if (ng < g[nk]) {
        g[nk] = ng;
        fromKey[nk] = curKey;
        open.push({ cx: nx, cy: ny });
      }
    }
  }
  // Reconstruct cell centres from goal back to start.
  const cells = [];
  let k = key(goal.cx, goal.cy);
  if (fromKey[k] === -1 && !(goal.cx === start.cx && goal.cy === start.cy)) return [to];
  while (k !== -1) {
    cells.push({ cx: k % COLS, cy: Math.floor(k / COLS) });
    k = fromKey[k];
  }
  cells.reverse();
  const points = cells.map((c) => cellCentre(c.cx, c.cy));
  points[points.length - 1] = { x: to.x, y: to.y };
  // Smooth: from each point, jump to the farthest later point with a
  // clear line of sight.
  const smooth = [];
  let i = 0;
  let px = from.x;
  let py = from.y;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !losClear(px, py, points[j].x, points[j].y)) j -= 1;
    smooth.push(points[j]);
    px = points[j].x;
    py = points[j].y;
    i = j + 1;
  }
  return smooth.length > 0 ? smooth : [to];
}

function approachPoint(x, y) {
  let target = { x, y };
  for (const r of SOLIDS) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      const below = r.y + r.h + 34;
      target = { x: r.x + r.w / 2, y: below <= FLOOR.y1 ? below : r.y - 34 };
      break;
    }
  }
  // The approach point must be somewhere the chef can actually stand.
  target.x = Math.max(FLOOR.x0, Math.min(FLOOR.x1, target.x));
  target.y = Math.max(FLOOR.y0, Math.min(FLOOR.y1, target.y));
  return target;
}

export function createInput(canvas, onInteract) {
  const keys = new Set();
  let clickTarget = null;
  let waypoints = null;
  let interactQueued = false;

  function key(e) {
    return e.key.toLowerCase();
  }
  window.addEventListener('keydown', (e) => {
    const k = key(e);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === 'e' || k === ' ') interactQueued = true;
    if (k === 'enter') interactQueued = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(key(e)));
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    clickTarget = approachPoint(px, py);
    waypoints = null;
  });

  return {
    direction(chef) {
      let dx = 0;
      let dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (dx === 0 && dy === 0 && clickTarget) {
        if (!waypoints) waypoints = findPath(chef, clickTarget);
        const wp = waypoints[0];
        if (!wp) {
          clickTarget = null;
          waypoints = null;
          interactQueued = true;
        } else {
          const ddx = wp.x - chef.x;
          const ddy = wp.y - chef.y;
          const d = Math.hypot(ddx, ddy);
          if (d > 26) {
            dx = ddx / d;
            dy = ddy / d;
          } else {
            waypoints.shift();
          }
        }
      }
      return { dx, dy, interact: interactQueued };
    },
    takeInteract() {
      const v = interactQueued;
      interactQueued = false;
      return v;
    },
    clearClick() {
      clickTarget = null;
      waypoints = null;
    },
    onInteract,
  };
}
