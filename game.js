import * as P from './physics.js';

const M = 28, CW = P.W + 2 * M, CH = P.H + M + 50;   // frame margin + room for the plunger knob
const PAY = 10, STAKE = 1, START = 100;
const $ = (s) => document.querySelector(s);

// ---------- state ----------
const sim = P.createSim();
const st = {
  credits: +localStorage.getItem('ekazanti.credits') || START,
  balls: 1, digit: null, cards: new Set(), phase: 'bet',   // bet | play | result
  queue: 0, power: 0, nextLaunch: 0, pull: 0, pulling: null,
};
const saveCredits = () => { localStorage.setItem('ekazanti.credits', st.credits); $('#credits').textContent = st.credits; };
const cost = () => (st.cards.size + (st.digit ? 1 : 0)) * STAKE * st.balls;

// ---------- canvas ----------
const canvas = $('#board'), ctx = canvas.getContext('2d');
let scale = 1, statik, bulbOn, bulbOff;
const GOLD = '#d4af37', GOLD_LIGHT = '#f6e27a', GOLD_DARK = '#8a6a1e';

// marquee bulbs run around the arch and down both sides of the frame
const BULB_R = 4.2, bulbs = [];
{
  const rr = P.ARCH.r + 12, n = 30;
  for (let i = 0; i <= n; i++) { const a = Math.PI + Math.PI * i / n; bulbs.push({ x: P.ARCH.x + rr * Math.cos(a), y: P.ARCH.y + rr * Math.sin(a) }); }
  for (let y = P.ARCH.y + 30; y < P.H + 4; y += 30) { bulbs.unshift({ x: -12, y }); bulbs.push({ x: P.W + 12, y }); }
}

function resize() {
  const w = canvas.clientWidth, dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.style.height = (w * CH / CW) + 'px';
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr * CH / CW);
  scale = canvas.width / CW;
  statik = document.createElement('canvas'); statik.width = canvas.width; statik.height = canvas.height;
  const g = statik.getContext('2d'); g.scale(scale, scale); drawStatic(g);
  bulbOn = bulbSprite(true); bulbOff = bulbSprite(false);
}

function bulbSprite(on) {
  const s = Math.ceil(BULB_R * 6 * scale), c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), m = s / 2, r = BULB_R * scale;
  if (on) {
    const glow = g.createRadialGradient(m, m, r * .3, m, m, r * 3);
    glow.addColorStop(0, 'rgba(255,225,140,.9)'); glow.addColorStop(.35, 'rgba(255,190,60,.35)'); glow.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
  }
  const b = g.createRadialGradient(m - r * .35, m - r * .35, r * .1, m, m, r);
  if (on) { b.addColorStop(0, '#fffbe8'); b.addColorStop(.5, '#ffd76a'); b.addColorStop(1, '#e09a1a'); }
  else { b.addColorStop(0, '#7a6a4a'); b.addColorStop(.6, '#4a3c28'); b.addColorStop(1, '#2a2118'); }
  g.beginPath(); g.arc(m, m, r, 0, 7); g.fillStyle = b; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(1, scale * .8); g.stroke();
  return c;
}

function fieldPath(g) {
  g.beginPath(); g.moveTo(0, P.ARCH.y); g.arc(P.ARCH.x, P.ARCH.y, P.ARCH.r, Math.PI, 0); g.lineTo(P.W, P.H); g.lineTo(0, P.H); g.closePath();
}

function nail(g, x, y, r) {
  g.beginPath(); g.ellipse(x + 1.2, y + 1.8, r, r * .8, 0, 0, 7); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  const gr = g.createRadialGradient(x - r * .4, y - r * .4, r * .1, x, y, r);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.5, '#c9ccd1'); gr.addColorStop(1, '#5c6066');
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(30,32,36,.8)'; g.lineWidth = .8; g.stroke();
}

// card-suit shapes, drawn centred on 0,0 with size s
function suit(g, kind, s) {
  g.beginPath();
  if (kind === 'heart' || kind === 'spade') {
    const f = kind === 'spade' ? -1 : 1;
    g.moveTo(0, .45 * s * f);
    g.bezierCurveTo(-.55 * s, -.05 * s * f, -.45 * s, -.55 * s * f, 0, -.2 * s * f);
    g.bezierCurveTo(.45 * s, -.55 * s * f, .55 * s, -.05 * s * f, 0, .45 * s * f);
    if (kind === 'spade') { g.moveTo(-.16 * s, .5 * s); g.quadraticCurveTo(0, .3 * s, 0, .05 * s); g.quadraticCurveTo(0, .3 * s, .16 * s, .5 * s); }
  } else if (kind === 'diamond') {
    g.moveTo(0, -.5 * s); g.lineTo(.36 * s, 0); g.lineTo(0, .5 * s); g.lineTo(-.36 * s, 0); g.closePath();
  } else if (kind === 'club') {
    for (const [cx, cy] of [[0, -.26], [-.24, .08], [.24, .08]]) { g.moveTo(cx * s + .2 * s, cy * s); g.arc(cx * s, cy * s, .2 * s, 0, 7); }
    g.moveTo(-.14 * s, .5 * s); g.quadraticCurveTo(0, .3 * s, 0, 0); g.quadraticCurveTo(0, .3 * s, .14 * s, .5 * s);
  } else {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .22 * s : .5 * s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
  }
  g.fill();
}

function medallion(g, b) {
  g.beginPath(); g.arc(b.x + 1.5, b.y + 2.5, b.r, 0, 7); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
  const ring = g.createLinearGradient(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r);
  ring.addColorStop(0, GOLD_LIGHT); ring.addColorStop(.5, GOLD); ring.addColorStop(1, GOLD_DARK);
  g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fillStyle = ring; g.fill();
  const face = g.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, 1, b.x, b.y, b.r * .8);
  face.addColorStop(0, '#fffaf0'); face.addColorStop(1, '#e8dcc0');
  g.beginPath(); g.arc(b.x, b.y, b.r * .74, 0, 7); g.fillStyle = face; g.fill();
  g.save(); g.translate(b.x, b.y); g.fillStyle = b.s === 'heart' || b.s === 'diamond' ? '#c1121f' : b.s === 'star' ? GOLD_DARK : '#1c1c1e';
  suit(g, b.s, b.r * 1.15); g.restore();
}

function brassPlate(g, x, y) {
  const gr = g.createLinearGradient(x, y, x + 34, y + 34);
  gr.addColorStop(0, GOLD_LIGHT); gr.addColorStop(.5, GOLD); gr.addColorStop(1, GOLD_DARK);
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.roundRect(x + 1, y + 2, 34, 34, 6); g.fill();
  g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, 34, 34, 6); g.fill();
  g.fillStyle = 'rgba(0,0,0,.55)';
  for (const [dx, dy] of [[8, 8], [26, 8], [8, 26], [26, 26]]) { g.beginPath(); g.arc(x + dx, y + dy, 2.2, 0, 7); g.fill(); }
}

function drawStatic(g) {
  // mahogany frame with grain and varnish
  const wood = g.createLinearGradient(0, 0, CW, CH);
  wood.addColorStop(0, '#6b3117'); wood.addColorStop(.45, '#4a200d'); wood.addColorStop(1, '#2e1206');
  g.fillStyle = wood; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 110; i++) {
    g.strokeStyle = i % 2 ? 'rgba(0,0,0,.18)' : 'rgba(255,190,120,.07)'; g.lineWidth = i % 5 ? 1 : 2;
    g.beginPath(); g.moveTo(0, i * 9 + (i % 3) * 2); g.bezierCurveTo(CW / 3, i * 9 + 7, CW * 2 / 3, i * 9 - 7, CW, i * 9 + 3); g.stroke();
  }
  const varnish = g.createLinearGradient(0, 0, CW * .6, CH);
  varnish.addColorStop(0, 'rgba(255,230,200,.16)'); varnish.addColorStop(.5, 'rgba(255,230,200,0)'); varnish.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = varnish; g.fillRect(0, 0, CW, CH);
  // gold pinstripe + brass corners
  g.strokeStyle = 'rgba(212,175,55,.55)'; g.lineWidth = 1.5; g.strokeRect(8, 8, CW - 16, CH - 16);
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, CW - 3, CH - 3);
  for (const [x, y] of [[4, 4], [CW - 38, 4], [4, CH - 38], [CW - 38, CH - 38]]) brassPlate(g, x, y);

  g.save(); g.translate(M, M);
  // bulb sockets
  for (const b of bulbs) { g.beginPath(); g.arc(b.x, b.y, BULB_R + 2, 0, 7); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); }
  // painted field
  fieldPath(g); g.save(); g.clip();
  const cream = g.createRadialGradient(300, 380, 50, 300, 380, 700);
  cream.addColorStop(0, '#fbf7ee'); cream.addColorStop(.7, '#ecdfc6'); cream.addColorStop(1, '#cbb995');
  g.fillStyle = cream; g.fillRect(0, 0, P.W, P.H);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;   // seeded speckle texture
  g.fillStyle = 'rgba(120,90,50,.09)';
  for (let i = 0; i < 1600; i++) { const x = rnd() * P.W, y = rnd() * P.H; g.fillRect(x, y, 1 + rnd() * 2, 1); }
  // launch lane
  g.fillStyle = 'rgba(80,50,20,.12)'; g.fillRect(P.RAIL_X, P.RAIL_TOP, P.W - P.RAIL_X, P.H - P.RAIL_TOP);
  // painted lettering
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = '700 46px Cinzel, Georgia, serif'; g.lineWidth = 7; g.strokeStyle = '#8a1a24'; g.strokeText('ΚΑΖΑΝΤΙ', 300, 64);
  const gt = g.createLinearGradient(0, 40, 0, 88); gt.addColorStop(0, GOLD_LIGHT); gt.addColorStop(.55, GOLD); gt.addColorStop(1, GOLD_DARK);
  g.fillStyle = gt; g.fillText('ΚΑΖΑΝΤΙ', 300, 64);
  g.font = '600 12px Cinzel, Georgia, serif'; g.fillStyle = 'rgba(90,60,30,.6)';
  g.fillText('ΚΑΛΗ ΤΥΧΗ   ·   GOOD LUCK   ·   ΚΑΛΗ ΤΥΧΗ', 280, 832);
  // rails: candy canes + chrome lane rail
  for (const r of P.rails) {
    g.lineCap = 'round';
    if (r.lane) {
      g.lineWidth = r.r * 2 + 2; g.strokeStyle = '#3b3f45'; g.beginPath(); g.moveTo(r.x1 + 1, r.y1 + 1); g.lineTo(r.x2 + 1, r.y2 + 1); g.stroke();
      const ch = g.createLinearGradient(r.x1 - 4, 0, r.x1 + 4, 0); ch.addColorStop(0, '#6d7178'); ch.addColorStop(.4, '#f4f6f8'); ch.addColorStop(1, '#5a5e64');
      g.lineWidth = r.r * 2; g.strokeStyle = ch; g.beginPath(); g.moveTo(r.x1, r.y1); g.lineTo(r.x2, r.y2); g.stroke();
      continue;
    }
    g.lineWidth = r.r * 2 + 2; g.strokeStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.moveTo(r.x1 + 1, r.y1 + 2); g.lineTo(r.x2 + 1, r.y2 + 2); g.stroke();
    g.lineWidth = r.r * 2; g.strokeStyle = '#fff5e6'; g.beginPath(); g.moveTo(r.x1, r.y1); g.lineTo(r.x2, r.y2); g.stroke();
    g.lineCap = 'butt'; g.setLineDash([7, 7]); g.strokeStyle = '#c1121f'; g.stroke(); g.setLineDash([]);
  }
  // number strips: cream, pale blue, brass
  const colors = ['#fff7d6', '#fff7d6', '#dcefff', '#dcefff', null];
  for (const [i, sp] of P.strips.entries()) {
    const x0 = sp.x0 - 5, x1 = sp.x0 + sp.n * P.SPACING + 5;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x0 + 1, sp.y - 8, x1 - x0, 20);
    if (colors[i]) g.fillStyle = colors[i];
    else { const br = g.createLinearGradient(0, sp.y - 10, 0, sp.y + 10); br.addColorStop(0, '#f8e7a0'); br.addColorStop(.5, '#e2c05a'); br.addColorStop(1, '#c39a34'); g.fillStyle = br; }
    g.fillRect(x0, sp.y - 10, x1 - x0, 20);
    g.strokeStyle = 'rgba(90,60,20,.55)'; g.lineWidth = 1; g.strokeRect(x0 + .5, sp.y - 9.5, x1 - x0 - 1, 19);
    g.fillStyle = '#1a1410'; g.font = '700 8.5px Poppins, sans-serif';
    for (let k = 0; k < sp.n; k++) g.fillText(sp.first + k, sp.x0 + (k + .5) * P.SPACING, sp.y + 4.5);
  }
  for (const p of P.pins) nail(g, p.x, p.y, 3.6);
  for (const d of P.deflectors) nail(g, d.x, d.y, d.r);
  for (const b of P.bumpers) medallion(g, b);
  // vignette
  const vg = g.createRadialGradient(300, 420, 250, 300, 420, 620);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,30,0,.28)');
  g.fillStyle = vg; g.fillRect(0, 0, P.W, P.H);
  g.restore();
  // inner shadow + edge
  fieldPath(g); g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.4)'; g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#2a1206'; g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(212,175,55,.5)'; g.stroke();
  g.restore();
}

function ball(g, b) {
  g.beginPath(); g.ellipse(b.x + 4, b.y + 6, P.R, P.R * .9, 0, 0, 7); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  const gr = g.createRadialGradient(b.x - 4, b.y - 4, 1, b.x, b.y, P.R);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.3, '#d9dde3'); gr.addColorStop(.75, '#6a6f78'); gr.addColorStop(1, '#23262b');
  g.beginPath(); g.arc(b.x, b.y, P.R, 0, 7); g.fillStyle = gr; g.fill();
  if (b.state === 'settled') {
    g.beginPath(); g.arc(b.x, b.y, P.R + 4, 0, 7); g.strokeStyle = GOLD; g.lineWidth = 2.5; g.stroke();
    const y = b.y - 30;
    g.fillStyle = '#14100c'; g.beginPath(); g.roundRect(b.x - 17, y - 11, 34, 22, 7); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 1; g.stroke();
    g.fillStyle = GOLD_LIGHT; g.font = '700 13px Poppins, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.number, b.x, y + 1);
  }
}

// marquee: twinkle while betting, chase while shooting, flash on a win, dim on a loss
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function bulbLit(i, t) {
  if (reduceMotion) return st.phase !== 'result' || st.won;
  if (st.phase === 'play') return (i + Math.floor(t / 90)) % 3 === 0;
  if (st.phase === 'result') return st.won ? (t - st.wonAt < 2500 ? Math.floor(t / 120) % 2 === 0 : true) : false;
  return Math.sin(t / 700 + i * 1.7) > -0.6;
}

function drawFrame(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(statik, 0, 0);
  const half = bulbOn.width / 2;
  bulbs.forEach((b, i) => ctx.drawImage(bulbLit(i, now) ? bulbOn : bulbOff, (b.x + M) * scale - half, (b.y + M) * scale - half));
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.translate(M, M);
  // plunger: spring, rod, knob
  const tip = sim.plunger, x = P.LANE_BALL_X;
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 3; ctx.beginPath();
  const coils = 6, span = P.H - tip - 4;
  for (let i = 0; i <= coils; i++) ctx.lineTo(x + (i % 2 ? 9 : -9), tip + 4 + span * i / coils);
  ctx.stroke();
  ctx.fillStyle = '#3b3f45'; ctx.fillRect(x - 7, tip - 3, 14, 5);
  ctx.fillStyle = '#c9ccd1'; ctx.fillRect(x - 2, P.H - 2, 4, 24);
  const kg = ctx.createRadialGradient(x - 3, P.H + 24, 1, x, P.H + 27, 11); kg.addColorStop(0, '#ff8a95'); kg.addColorStop(.6, '#c1121f'); kg.addColorStop(1, '#6e0a12');
  ctx.beginPath(); ctx.arc(x, P.H + 27, 11, 0, 7); ctx.fillStyle = kg; ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
  if (st.pull > 0) {
    const p = st.pull / P.PLUNGER_PULL;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(P.RAIL_X + 8, P.RAIL_TOP + 20, 6, 300);
    ctx.fillStyle = p > .8 ? '#e5383b' : GOLD; ctx.fillRect(P.RAIL_X + 8, P.RAIL_TOP + 20 + 300 * (1 - p), 6, 300 * p);
  }
  for (const b of sim.balls) ball(ctx, b);
}

// ---------- round flow ----------
function fire(power) {
  if (st.phase === 'bet') {
    if (!cost()) return toast('Pick a card or a digit first');
    if (st.credits < cost()) { st.credits = START; saveCredits(); toast(`Topped up to ${START} credits 🎁`); }
    st.credits -= cost(); saveCredits();
    st.phase = 'play'; st.queue = st.balls; sim.balls.length = 0;
    $('#result').hidden = true; setBetsEnabled(false);
  }
  st.power = power; st.nextLaunch = 0;
  canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#hint').textContent = 'Shooting…';
}

function tick(now) {
  if (st.phase === 'play' && st.power && now >= st.nextLaunch) {
    const lane = sim.balls.find(b => b.state === 'lane');
    const jitter = () => st.power * (1 + (Math.random() - .5) * .04);
    if (lane) P.launch(lane, jitter());
    else if (st.queue > 0 && !sim.balls.some(b => P.atPlunger(sim, b))) { P.launch(P.spawnBall(sim, sim.balls.length), jitter()); st.queue--; }
    else if (st.queue === 0) st.power = 0;
    st.nextLaunch = now + 450;
  }
  if (st.phase === 'play' && !st.power && st.queue === 0) {
    if (sim.balls.every(b => b.state === 'settled')) finish();
    else if (sim.balls.some(b => b.state === 'lane') && sim.balls.every(b => b.state !== 'flying'))
      $('#hint').innerHTML = 'A ball rolled back into the lane — <b>pull again</b>.';
  }
}

function finish() {
  st.phase = 'result';
  let total = 0; const rows = [];
  for (const b of sim.balls) {
    const n = b.number, hits = [];
    for (const c of st.cards) if (P.cards[c].includes(n)) hits.push(`card ${c + 1}`);
    if (st.digit && n % 10 === st.digit) hits.push(`digit ${st.digit}`);
    total += hits.length * PAY;
    rows.push(`<div class="r"><span class="num">${n}</span>${hits.length ? `<span class="win">+${hits.length * PAY} · ${hits.join(', ')}</span>` : '<span class="lose">no hit</span>'}</div>`);
  }
  st.credits += total; saveCredits(); st.won = total > 0; st.wonAt = performance.now();
  document.querySelector('.panel').classList.toggle('win', st.won);
  $('#result').innerHTML = rows.join('') + `<div class="total ${total ? 'yes' : 'no'}">${total ? `You win ${total} credits` : 'No luck this time'}</div>`;
  $('#result').hidden = false; $('#next').hidden = false; shoot.disabled = true;
  $('#hint').textContent = '';
  toast(total ? `+${total} credits!` : 'No hit — try again');
  const nums = new Set(sim.balls.map(b => b.number));
  document.querySelectorAll('.card span.n').forEach(el => el.classList.toggle('hit', nums.has(+el.textContent)));
}

function nextRound() {
  st.phase = 'bet'; sim.balls.length = 0; seenHits.clear(); document.querySelector('.panel').classList.remove('win');
  $('#result').hidden = true; $('#next').hidden = true; shoot.disabled = false; setBetsEnabled(true);
  document.querySelectorAll('.card span.hit').forEach(el => el.classList.remove('hit'));
  $('#hint').innerHTML = 'Hold <b>Shoot</b> to pull, release to fire — or drag <b>down</b> on the board.';
}

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200);
}

// ---------- plunger input ----------
canvas.addEventListener('pointerdown', (e) => {
  if (st.phase === 'result' || st.power) return;
  st.pulling = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (st.pulling === null) return;
  st.pull = Math.max(0, Math.min(P.PLUNGER_PULL, (e.clientY - st.pulling) / (canvas.clientWidth / CW)));
  sim.plunger = P.PLUNGER_REST + st.pull;
});
const release = () => {
  if (st.pulling === null) return;
  st.pulling = null; sim.plunger = P.PLUNGER_REST; shoot.style.setProperty('--p', 0);
  if (st.pull > 3) fire(P.POWER_MIN + (P.POWER_MAX - P.POWER_MIN) * st.pull / P.PLUNGER_PULL);
  st.pull = 0;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// hold-to-charge button (phones: the bets live below the board)
const shoot = $('#shoot');
let chargeT = 0, chargeRaf = 0;
shoot.addEventListener('pointerdown', (e) => {
  if (st.phase === 'result' || st.power) return;
  shoot.setPointerCapture(e.pointerId); chargeT = performance.now();
  const charge = () => { st.pull = P.PLUNGER_PULL * (0.5 - 0.5 * Math.cos((performance.now() - chargeT) / 1200 * Math.PI)); sim.plunger = P.PLUNGER_REST + st.pull; shoot.style.setProperty('--p', st.pull / P.PLUNGER_PULL); chargeRaf = requestAnimationFrame(charge); };
  charge();
});
const releaseBtn = () => { if (!chargeRaf) return; cancelAnimationFrame(chargeRaf); chargeRaf = 0; st.pulling = 0; release(); };
shoot.addEventListener('pointerup', releaseBtn);
shoot.addEventListener('pointercancel', releaseBtn);

// ---------- bets UI ----------
function seg(el, items, get, set) {
  el.innerHTML = '';
  for (const v of items) {
    const b = document.createElement('button'); b.textContent = v; b.type = 'button';
    b.onclick = () => { set(v); refresh(); };
    el.appendChild(b);
  }
  el._sync = () => [...el.children].forEach(b => b.classList.toggle('on', get() === +b.textContent));
}
seg($('#balls'), [1, 2, 3, 4], () => st.balls, v => st.balls = v);
[...$('#balls').children].forEach((b, i) => { for (let k = 0; k <= i; k++) b.insertAdjacentHTML('beforeend', '<span class="b"></span>'); });
seg($('#digits'), [1, 2, 3, 4, 5, 6, 7, 8, 9], () => st.digit, v => st.digit = st.digit === v ? null : v);

const CARD_COLORS = ['#8c1d2b', '#155e46', '#1f3a68', '#5b2a6e', '#9a5b13', '#0f5f6b', '#6b2f2f', '#2f5d2a', '#4a3b8f', '#7a4a10'];
P.cards.forEach((nums, k) => {
  const c = document.createElement('div'); c.className = 'card'; c.style.setProperty('--c', CARD_COLORS[k]);
  let i = 0;
  for (let r = 0; r < 3; r++) for (let col = 0; col < 6; col++) {
    const s = document.createElement('span');
    if ((r + col) % 2 === 0) { s.className = 'n'; s.textContent = nums[i++]; }
    c.appendChild(s);
  }
  const tag = document.createElement('i'); tag.textContent = k + 1; c.appendChild(tag);
  c.onclick = () => { if (st.phase !== 'bet') return; st.cards.has(k) ? st.cards.delete(k) : st.cards.add(k); refresh(); };
  $('#cards').appendChild(c);
});

function setBetsEnabled(on) {
  document.querySelectorAll('.seg button').forEach(b => b.disabled = !on);
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('locked', !on));
}
function refresh() {
  $('#balls')._sync(); $('#digits')._sync();
  document.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('on', st.cards.has(k)));
  $('#cost').innerHTML = `Stake <b>${cost()}</b> · ${st.balls} ball${st.balls > 1 ? 's' : ''} × ${st.cards.size + (st.digit ? 1 : 0)} bet${st.cards.size + (st.digit ? 1 : 0) === 1 ? '' : 's'}`;
}
$('#next').onclick = nextRound;

// ---------- sound: a short metallic tick per bounce ----------
let audio;
const seenHits = new Map();
function clicks() {
  if (!audio) return;
  for (const b of sim.balls) {
    const n = b.hits - (seenHits.get(b) || 0); seenHits.set(b, b.hits);
    if (!n) continue;
    const o = audio.createOscillator(), gnode = audio.createGain(), t = audio.currentTime;
    o.type = 'square'; o.frequency.setValueAtTime(1800 + Math.random() * 600, t);
    gnode.gain.setValueAtTime(Math.min(.25, b.hitV / 1500), t); gnode.gain.exponentialRampToValueAtTime(.001, t + .04);
    o.connect(gnode).connect(audio.destination); o.start(t); o.stop(t + .05);
  }
}
addEventListener('pointerdown', () => { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }, { once: true });

// ---------- loop ----------
let last = performance.now();
function loop(now) {
  P.step(sim, Math.min(now - last, 100) / 1000); last = now;
  tick(now); clicks(); drawFrame(now); requestAnimationFrame(loop);
}
new ResizeObserver(resize).observe(canvas);
document.fonts.ready.then(resize);
saveCredits(); refresh(); resize(); requestAnimationFrame(loop);
