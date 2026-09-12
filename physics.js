// Board geometry + ball physics. Units are board units (W×H), y grows downward.
// Pure JS, no DOM: test.mjs runs the same code in Node.

export const W = 600, H = 750;          // full board incl. launch lane
export const FIELD_W = 560;             // playfield right edge; lane is to the right
export const RAIL_X = 563, RAIL_TOP = 175;
export const RC = 150;                  // radius of the rounded top corners
export const R = 11;                    // ball radius
export const NAIL_R = 2.5;
export const SPACING = 16;              // nail spacing on number strips (< 2R so a ball can't pass)
export const G = 1000;
export const DT = 1 / 240;
export const PLUNGER_REST = 700, PLUNGER_PULL = 40;
export const LANE_BALL_X = 588;         // hugs the right wall so it meets the corner arc tangentially
export const POWER_MIN = 1200, POWER_MAX = 1500;

// numbers 1–90 across five strips: two short on top, two mid, one full-width bottom
export const strips = [
  { y: 250, x0: 40,  n: 14, first: 1 },
  { y: 250, x0: 296, n: 13, first: 15 },
  { y: 450, x0: 30,  n: 14, first: 28 },
  { y: 450, x0: 306, n: 14, first: 42 },
  { y: 680, x0: 0,   n: 35, first: 56 },
];
export const pins = [];
strips.forEach((s, si) => {
  s.id = si;
  for (let i = 0; i <= s.n; i++) pins.push({ x: s.x0 + i * SPACING, y: s.y, r: NAIL_R, strip: s, i });
});
export const deflectors = [[150, 95], [450, 95], [215, 160], [385, 160], [300, 130], [300, 195]]
  .map(([x, y]) => ({ x, y, r: 4 }));
export const bumpers = [
  { x: 110, y: 350, r: 16, s: 'heart' }, { x: 450, y: 350, r: 16, s: 'diamond' }, { x: 300, y: 360, r: 18, s: 'star' },
  { x: 200, y: 565, r: 16, s: 'club' }, { x: 400, y: 565, r: 16, s: 'spade' },
];
// candy-cane guide rails + the lane rail (capsules)
export const rails = [
  { x1: 0, y1: 290, x2: 28, y2: 400, r: 4 }, { x1: 560, y1: 290, x2: 532, y2: 400, r: 4 },
  { x1: 0, y1: 495, x2: 80, y2: 635, r: 4 }, { x1: 560, y1: 495, x2: 480, y2: 635, r: 4 },
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

  // rounded top: quarter-circle corners, flat ceiling between them, straight walls below
  if (b.y < RC && (b.x < RC || b.x > W - RC)) {
    const cx = b.x < RC ? RC : W - RC, dx = b.x - cx, dy = b.y - RC, d = Math.hypot(dx, dy), m = RC - R;
    if (d > m) resolve(b, -dx / d, -dy / d, d - m, 0.3);
  } else if (b.y < R) resolve(b, 0, 1, R - b.y, 0.3);
  if (b.x < R) resolve(b, 1, 0, R - b.x, 0.5);
  if (b.x > W - R) resolve(b, -1, 0, b.x - (W - R), 0.5);
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
  // random direction and strength, so a kick that bounces straight back doesn't repeat forever
  b.vx = (sim.rand() - 0.5) * 400; b.vy = -(350 + sim.rand() * 200); b.restT = 0; b.nudges++;
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

// The 10 tombola cards: 9 numbers each, disjoint, covering 1–90, the same set for every player.
// The board is physically biased (upper strips catch soft balls far more often than the bottom
// one), so cards are balanced by measured landing frequency: numbers are dealt greedily to the
// card with the lowest total weight. WEIGHTS = hits per number from `node test.mjs 800 --weights`;
// regenerate after changing the board geometry.
const WEIGHTS = [25,19,21,31,26,23,22,37,31,51,39,28,34,30,71,84,96,88,124,101,99,104,95,96,83,82,63,20,14,21,19,15,16,21,19,18,14,14,20,16,13,36,43,46,48,40,41,55,52,41,28,43,56,89,77,5,16,16,10,10,22,17,25,22,19,26,32,27,25,24,28,30,26,19,36,24,27,22,29,16,21,12,17,13,11,8,4,12,8,3];
export const cards = (() => {
  const out = Array.from({ length: 10 }, () => ({ n: [], w: 0 }));
  const order = Array.from({ length: 90 }, (_, i) => i + 1).sort((a, b) => WEIGHTS[b - 1] - WEIGHTS[a - 1]);
  for (const n of order) {
    const c = out.filter(c => c.n.length < 9).reduce((a, b) => (b.w < a.w ? b : a));
    c.n.push(n); c.w += WEIGHTS[n - 1];
  }
  return out.map(c => c.n.sort((x, y) => x - y));
})();
