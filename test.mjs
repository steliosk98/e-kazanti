// Monte Carlo: every ball must settle on a numbered gap; prints the number distribution.
import { createSim, spawnBall, launch, step, atPlunger, POWER_MIN, POWER_MAX, cards, strips } from './physics.js';
import assert from 'node:assert';

let seed = +process.env.SEED || 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const hist = new Array(91).fill(0);
let returns = 0, nudges = 0, maxT = 0;
const ROUNDS = +process.argv[2] || 200;
for (let r = 0; r < ROUNDS; r++) {
  const sim = createSim(rand);
  let queue = 4, next = 0, power = POWER_MIN + rand() * (POWER_MAX - POWER_MIN);
  while (sim.t < 90) {
    if (sim.t >= next && (queue > 0 || sim.balls.some(b => b.state === 'lane'))) {
      const lane = sim.balls.find(b => b.state === 'lane');
      if (lane) { launch(lane, power * (1 + (rand() - 0.5) * 0.04)); returns++; }
      else if (!sim.balls.some(b => atPlunger(sim, b))) { launch(spawnBall(sim, sim.balls.length), power * (1 + (rand() - 0.5) * 0.04)); queue--; }
      next = sim.t + 0.45;
      power = POWER_MIN + rand() * (POWER_MAX - POWER_MIN);
    }
    step(sim, 1 / 60);
    if (queue === 0 && sim.balls.every(b => b.state === 'settled')) break;
  }
  maxT = Math.max(maxT, sim.t);
  for (const b of sim.balls) {
    assert.strictEqual(b.state, 'settled', `round ${r} ball ${b.id} state=${b.state} at ${b.x.toFixed(0)},${b.y.toFixed(0)} v=${Math.hypot(b.vx, b.vy).toFixed(1)}`);
    assert.ok(b.number >= 1 && b.number <= 90);
    hist[b.number]++; nudges += b.nudges;
  }
}
returns -= 0; // spawns counted separately
console.log(`OK ${ROUNDS} rounds × 4 balls. max round time ${maxT.toFixed(1)}s, relaunches ${returns}, nudges ${nudges}`);
const rows = strips.map(s => [s.first, s.first + s.n - 1]);
for (const [a, b] of rows) console.log(`${a}-${b}:`.padEnd(7), hist.slice(a, b + 1).reduce((x, y) => x + y), hist.slice(a, b + 1).join(' '));

// cards partition 1..90
assert.deepStrictEqual(cards.flat().sort((a, b) => a - b), Array.from({ length: 90 }, (_, i) => i + 1));
const total = ROUNDS * 4, exp = total / 10;
const cardHits = cards.map(c => c.reduce((s, n) => s + hist[n], 0));
const digitHits = Array.from({ length: 9 }, (_, d) => hist.filter((_, n) => n % 10 === d + 1).reduce((a, b) => a + b));
console.log('card hits  ', cardHits.join(' '), `(expected ${exp})`);
console.log('digit hits ', digitHits.join(' '));
for (const h of [...cardHits, ...digitHits]) assert.ok(h > exp * 0.6 && h < exp * 1.5, `unfair bet: ${h} vs ${exp}`);
console.log('fairness OK');
if (process.argv[3] === '--weights') console.log('WEIGHTS', JSON.stringify(hist.slice(1)));
