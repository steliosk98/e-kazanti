// Board geometry + ball physics. Units are board units (W×H), y grows downward.
// Pure JS, no DOM: test.mjs runs the same code in Node.

export const W = 600, H = 860;          // full board incl. launch lane
export const FIELD_W = 560;             // playfield right edge; lane is to the right
export const RAIL_X = 563, RAIL_TOP = 240;
export const ARCH = { x: 300, y: 300, r: 300 };
export const R = 11;                    // ball radius
export const NAIL_R = 2.5;
export const SPACING = 14;              // nail spacing on number strips (< 2R so a ball can't pass)
export const G = 1000;
export const DT = 1 / 240;
export const PLUNGER_REST = 810, PLUNGER_PULL = 40;
export const LANE_BALL_X = 583;
export const POWER_MIN = 1150, POWER_MAX = 1550;

// numbers 1–90 across five strips: two short on top, two mid, one full-width bottom
export const strips = [
  { y: 320, x0: 70,  n: 12, first: 1 },
  { y: 320, x0: 322, n: 12, first: 13 },
  { y: 520, x0: 40,  n: 13, first: 25 },
  { y: 520, x0: 338, n: 13, first: 38 },
  { y: 780, x0: 0,   n: 40, first: 51 },
];
export const pins = [];
strips.forEach((s, si) => {
  s.id = si;
  for (let i = 0; i <= s.n; i++) pins.push({ x: s.x0 + i * SPACING, y: s.y, r: NAIL_R, strip: s, i });
});
export const deflectors = [[150, 150], [300, 110], [450, 150], [215, 225], [385, 225], [300, 255]]
  .map(([x, y]) => ({ x, y, r: 4 }));
export const bumpers = [
  { x: 110, y: 420, r: 16, s: 'heart' }, { x: 450, y: 420, r: 16, s: 'diamond' }, { x: 300, y: 430, r: 18, s: 'star' },
  { x: 200, y: 655, r: 16, s: 'club' }, { x: 400, y: 655, r: 16, s: 'spade' },
];
// candy-cane guide rails + the lane rail (capsules)
export const rails = [
  { x1: 0, y1: 360, x2: 28, y2: 470, r: 4 }, { x1: 560, y1: 360, x2: 532, y2: 470, r: 4 },
  { x1: 0, y1: 570, x2: 80, y2: 720, r: 4 }, { x1: 560, y1: 570, x2: 480, y2: 720, r: 4 },
  { x1: RAIL_X, y1: RAIL_TOP, x2: RAIL_X, y2: H, r: 3, lane: true },
];

export function createSim(rand = Math.random) {
  return { balls: [], plunger: PLUNGER_REST, t: 0, rand };
}

export function spawnBall(sim, id) {
  const b = { id, x: LANE_BALL_X, y: sim.plunger - R, vx: 0, vy: 0, ax: 0, ay: 0, restT: 0, hits: 0, hitV: 0, state: 'lane', number: null, nudges: 0 };
  sim.balls.push(b);
  return b;
}

export function launch(ball, power) {
  ball.vy = -power; ball.vx = 0; ball.state = 'flying'; ball.restT = 0;
}

export const inLane = (b) => b.x > RAIL_X;
export const atPlunger = (sim, b) => inLane(b) && b.y > sim.plunger - R - 3;

// push ball out along normal n by pen, kill/reflect normal velocity, rub off tangential speed
function resolve(b, nx, ny, pen, e, mu = 0.02) {
  b.x += nx * pen; b.y += ny * pen;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const k = -vn < 40 ? 1 : 1 + e;          // slow hits don't bounce → balls settle
    b.vx -= k * vn * nx; b.vy -= k * vn * ny;
    if (k > 1) { b.hits++; b.hitV = -vn; }   // for sound
  }
  b.vx *= 1 - mu; b.vy *= 1 - mu;
}

function circle(b, c, e) {
  const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy), m = R + c.r;
  if (d < m && d > 0) resolve(b, dx / d, dy / d, m - d, e);
}

function capsule(b, s, e) {
  const ax = s.x2 - s.x1, ay = s.y2 - s.y1, L2 = ax * ax + ay * ay;
  let t = ((b.x - s.x1) * ax + (b.y - s.y1) * ay) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = s.x1 + ax * t, py = s.y1 + ay * t;
  const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), m = R + s.r;
  if (d < m && d > 0) resolve(b, dx / d, dy / d, m - d, e);
}

function stepBall(sim, b, dt) {
  if (b.state === 'settled') return;
  b.vy += G * dt;
  b.vx *= 1 - 0.15 * dt; b.vy *= 1 - 0.15 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;

  if (b.y < ARCH.y) {
    const dx = b.x - ARCH.x, dy = b.y - ARCH.y, d = Math.hypot(dx, dy), m = ARCH.r - R;
    if (d > m) resolve(b, -dx / d, -dy / d, d - m, 0.3);
  } else {
    if (b.x < R) resolve(b, 1, 0, R - b.x, 0.5);
    if (b.x > W - R) resolve(b, -1, 0, b.x - (W - R), 0.5);
  }
  if (b.y > H - R) resolve(b, 0, -1, b.y - (H - R), 0.3);
  if (inLane(b) && b.y > sim.plunger - R) resolve(b, 0, -1, b.y - (sim.plunger - R), 0.2);

  for (const p of pins) circle(b, p, 0.45);
  for (const d of deflectors) circle(b, d, 0.5);
  for (const u of bumpers) circle(b, u, 0.8);
  for (const s of rails) capsule(b, s, 0.4);
}

function collideBalls(p, q) {
  // a settled ball is a fixed obstacle: its number must not change
  if (p.state === 'settled') { if (q.state === 'settled') return; [p, q] = [q, p]; }
  const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
  if (d >= 2 * R || d === 0) return;
  const nx = dx / d, ny = dy / d, fixed = q.state === 'settled', pen = (2 * R - d) / (fixed ? 1 : 2);
  p.x += nx * pen; p.y += ny * pen;
  if (!fixed) { q.x -= nx * pen; q.y -= ny * pen; }
  const rv = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
  if (rv < 0) {
    const j = -(-rv < 40 ? 1 : 1.5) * rv / (fixed ? 1 : 2);   // slow contacts don't bounce
    p.vx += j * nx; p.vy += j * ny;
    if (!fixed) { q.vx -= j * nx; q.vy -= j * ny; }
  }
}

// a ball at rest is only "done" if it sits on two adjacent nails of one strip
function settledNumber(b) {
  const tol = R + NAIL_R + 0.8, hits = [];
  for (const p of pins) if (Math.hypot(b.x - p.x, b.y - p.y) <= tol) hits.push(p);
  // bottom strip ends in the walls: a ball wedged between wall and nail 1 (or nail n-1) is in the end gap
  if (hits.length === 1 && hits[0].y > b.y) {
    const { strip: s, i } = hits[0];
    if (i === 1 && s.x0 === 0 && b.x < R + 1) return s.first;
    if (i === s.n - 1 && s.x0 + s.n * SPACING === FIELD_W && b.x > FIELD_W - R - 1) return s.first + s.n - 1;
  }
  if (hits.length !== 2 || hits[0].strip !== hits[1].strip) return null;
  if (Math.abs(hits[0].i - hits[1].i) !== 1 || b.y > hits[0].y) return null;
  return hits[0].strip.first + Math.min(hits[0].i, hits[1].i);
}

function checkRest(sim, b, dt) {
  if (b.state === 'settled') return;
  // "at rest" = hasn't moved more than 1.5 units from its anchor (velocity jitters on contacts)
  if (Math.hypot(b.x - b.ax, b.y - b.ay) > 1.5) { b.ax = b.x; b.ay = b.y; b.restT = 0; } else b.restT += dt;
  if (b.restT < 0.4) return;
  if (atPlunger(sim, b)) { b.state = 'lane'; return; }
  const n = settledNumber(b);
  if (n) { b.state = 'settled'; b.number = n; b.vx = b.vy = 0; return; }
  // stuck somewhere unnumbered (leaning on another ball, a nail tip, ...) → kick it, away from any ball it touches
  const o = sim.balls.find(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 2 * R + 1);
  b.vx = o ? Math.sign(b.x - o.x || sim.rand() - 0.5) * 150 : (sim.rand() - 0.5) * 300;
  b.vy = -450; b.restT = 0; b.nudges++;   // mostly up: clear the neighbours first, then drift sideways
}

export function step(sim, elapsed) {
  let n = Math.min(Math.round(elapsed / DT), 60);
  while (n-- > 0) {
    sim.t += DT;
    for (const b of sim.balls) stepBall(sim, b, DT);
    for (let i = 0; i < sim.balls.length; i++)
      for (let j = i + 1; j < sim.balls.length; j++) collideBalls(sim.balls[i], sim.balls[j]);
    for (const b of sim.balls) checkRest(sim, b, DT);
  }
}

// The 10 tombola cards: 9 numbers each, disjoint, covering 1–90. Deterministic (seeded) so
// every player sees the same set. Stratified 5 upper-strip + 4 bottom-strip numbers per card,
// so the board's physical bias (bottom strip catches ~half the balls) doesn't favour a card.
export const cards = (() => {
  let seed = 20260101;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const upper = shuffle(Array.from({ length: 50 }, (_, i) => i + 1));
  const lower = shuffle(Array.from({ length: 40 }, (_, i) => i + 51));
  return Array.from({ length: 10 }, (_, k) =>
    [...upper.slice(k * 5, k * 5 + 5), ...lower.slice(k * 4, k * 4 + 4)].sort((a, b) => a - b));
})();
