import * as P from './physics.js';

const M = 20, CW = P.W + 2 * M, CH = P.H + M + 46;   // frame margin + room for the plunger knob
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
let scale = 1, statik;

function resize() {
  const w = canvas.clientWidth, dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.style.height = (w * CH / CW) + 'px';
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr * CH / CW);
  scale = canvas.width / CW;
  statik = document.createElement('canvas'); statik.width = canvas.width; statik.height = canvas.height;
  const g = statik.getContext('2d'); g.scale(scale, scale); drawStatic(g);
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

function drawStatic(g) {
  // wooden frame
  const wood = g.createLinearGradient(0, 0, CW, CH);
  wood.addColorStop(0, '#8a4f24'); wood.addColorStop(.5, '#6a3a18'); wood.addColorStop(1, '#4a2810');
  g.fillStyle = wood; g.fillRect(0, 0, CW, CH);
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  for (let i = 0; i < 90; i++) { g.beginPath(); g.moveTo(0, i * 11 + (i % 3) * 2); g.bezierCurveTo(CW / 3, i * 11 + 6, CW * 2 / 3, i * 11 - 6, CW, i * 11 + 3); g.stroke(); }
  g.strokeStyle = 'rgba(255,220,160,.18)'; g.lineWidth = 2; g.strokeRect(6, 6, CW - 12, CH - 12);

  g.save(); g.translate(M, M);
  // painted field
  fieldPath(g); g.save(); g.clip();
  const cream = g.createRadialGradient(300, 380, 50, 300, 380, 700);
  cream.addColorStop(0, '#fbf7ee'); cream.addColorStop(1, '#e6dcc6');
  g.fillStyle = cream; g.fillRect(0, 0, P.W, P.H);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;   // seeded speckle texture
  g.fillStyle = 'rgba(120,90,50,.09)';
  for (let i = 0; i < 1400; i++) { const x = rnd() * P.W, y = rnd() * P.H; g.fillRect(x, y, 1 + rnd() * 2, 1); }
  // launch lane
  g.fillStyle = 'rgba(80,50,20,.10)'; g.fillRect(P.RAIL_X, P.RAIL_TOP, P.W - P.RAIL_X, P.H - P.RAIL_TOP);
  // painted lettering
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 46px Fredoka, sans-serif'; g.lineWidth = 6; g.lineJoin = 'round';
  g.strokeStyle = '#fff'; g.strokeText('ΚΑΖΑΝΤΙ', 300, 62); g.fillStyle = '#d7263d'; g.fillText('ΚΑΖΑΝΤΙ', 300, 62);
  g.font = '600 13px Rubik, sans-serif'; g.fillStyle = 'rgba(90,60,30,.55)'; g.fillText('ΚΑΛΗ ΤΥΧΗ  ·  GOOD LUCK  ·  ΚΑΛΗ ΤΥΧΗ', 280, 830);
  // rails: candy canes
  for (const r of P.rails) {
    g.lineCap = 'round';
    if (r.lane) {
      g.lineWidth = r.r * 2 + 2; g.strokeStyle = '#3b3f45'; g.beginPath(); g.moveTo(r.x1 + 1, r.y1 + 1); g.lineTo(r.x2 + 1, r.y2 + 1); g.stroke();
      const ch = g.createLinearGradient(r.x1 - 4, 0, r.x1 + 4, 0); ch.addColorStop(0, '#6d7178'); ch.addColorStop(.4, '#f4f6f8'); ch.addColorStop(1, '#5a5e64');
      g.lineWidth = r.r * 2; g.strokeStyle = ch; g.beginPath(); g.moveTo(r.x1, r.y1); g.lineTo(r.x2, r.y2); g.stroke();
      continue;
    }
    g.lineWidth = r.r * 2 + 2; g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(r.x1 + 1, r.y1 + 2); g.lineTo(r.x2 + 1, r.y2 + 2); g.stroke();
    g.lineWidth = r.r * 2; g.strokeStyle = '#fff5e6'; g.beginPath(); g.moveTo(r.x1, r.y1); g.lineTo(r.x2, r.y2); g.stroke();
    g.lineCap = 'butt'; g.setLineDash([7, 7]); g.strokeStyle = '#d7263d'; g.stroke(); g.setLineDash([]);
  }
  // number strips
  const colors = ['#fff7d6', '#fff7d6', '#dcefff', '#dcefff', '#ffe58a'];
  for (const [i, sp] of P.strips.entries()) {
    const x0 = sp.x0 - 5, x1 = sp.x0 + sp.n * P.SPACING + 5;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0 + 1, sp.y - 8, x1 - x0, 20);
    g.fillStyle = colors[i]; g.fillRect(x0, sp.y - 10, x1 - x0, 20);
    g.strokeStyle = 'rgba(90,60,20,.5)'; g.lineWidth = 1; g.strokeRect(x0 + .5, sp.y - 9.5, x1 - x0 - 1, 19);
    g.fillStyle = '#1a1410'; g.font = '700 8.5px Rubik, sans-serif';
    for (let k = 0; k < sp.n; k++) g.fillText(sp.first + k, sp.x0 + (k + .5) * P.SPACING, sp.y + 4.5);
  }
  for (const p of P.pins) nail(g, p.x, p.y, 3.6);
  for (const d of P.deflectors) nail(g, d.x, d.y, d.r);
  // sticker bumpers
  for (const b of P.bumpers) {
    g.beginPath(); g.arc(b.x + 1, b.y + 2, b.r, 0, 7); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill();
    const gr = g.createRadialGradient(b.x - 4, b.y - 4, 2, b.x, b.y, b.r); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#f2b134');
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fillStyle = gr; g.fill(); g.strokeStyle = '#d7263d'; g.lineWidth = 2; g.stroke();
    g.font = `${b.r * 1.3}px serif`; g.fillText(b.e, b.x, b.y + 1);
  }
  g.restore();
  // inner shadow + edge
  fieldPath(g); g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#3a2412'; g.stroke();
  g.restore();
}

function ball(g, b) {
  g.beginPath(); g.ellipse(b.x + 4, b.y + 6, P.R, P.R * .9, 0, 0, 7); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  const gr = g.createRadialGradient(b.x - 4, b.y - 4, 1, b.x, b.y, P.R);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.3, '#d9dde3'); gr.addColorStop(.75, '#6a6f78'); gr.addColorStop(1, '#23262b');
  g.beginPath(); g.arc(b.x, b.y, P.R, 0, 7); g.fillStyle = gr; g.fill();
  if (b.state === 'settled') {
    g.beginPath(); g.arc(b.x, b.y, P.R + 4, 0, 7); g.strokeStyle = '#2fbf71'; g.lineWidth = 2.5; g.stroke();
    const y = b.y - 30;
    g.fillStyle = '#1a1410'; g.beginPath(); g.roundRect(b.x - 16, y - 10, 32, 20, 6); g.fill();
    g.fillStyle = '#f2b134'; g.font = '700 13px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.number, b.x, y + 1);
  }
}

function drawFrame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(statik, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.translate(M, M);
  // plunger: rod, spring, knob
  const tip = sim.plunger, x = P.LANE_BALL_X;
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 3; ctx.beginPath();
  const coils = 6, span = P.H - tip - 4;
  for (let i = 0; i <= coils; i++) ctx.lineTo(x + (i % 2 ? 9 : -9), tip + 4 + span * i / coils);
  ctx.stroke();
  ctx.fillStyle = '#3b3f45'; ctx.fillRect(x - 7, tip - 3, 14, 5);
  ctx.fillStyle = '#c9ccd1'; ctx.fillRect(x - 2, P.H - 2, 4, 24);
  const kg = ctx.createRadialGradient(x - 3, P.H + 24, 1, x, P.H + 27, 11); kg.addColorStop(0, '#ff8a95'); kg.addColorStop(1, '#a3111f');
  ctx.beginPath(); ctx.arc(x, P.H + 27, 11, 0, 7); ctx.fillStyle = kg; ctx.fill();
  if (st.pull > 0) {
    const p = st.pull / P.PLUNGER_PULL;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(P.RAIL_X + 8, P.RAIL_TOP + 20, 6, 300);
    ctx.fillStyle = p > .8 ? '#d7263d' : '#f2b134'; ctx.fillRect(P.RAIL_X + 8, P.RAIL_TOP + 20 + 300 * (1 - p), 6, 300 * p);
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
  st.credits += total; saveCredits();
  $('#result').innerHTML = rows.join('') + `<div class="total">${total ? `You win ${total} credits! 🎉` : 'No luck this time'}</div>`;
  $('#result').hidden = false; $('#next').hidden = false; shoot.disabled = true;
  $('#hint').textContent = '';
  toast(total ? `+${total} credits! 🎉` : 'No hit — try again');
  const nums = new Set(sim.balls.map(b => b.number));
  document.querySelectorAll('.card span.n').forEach(el => el.classList.toggle('hit', nums.has(+el.textContent)));
}

function nextRound() {
  st.phase = 'bet'; sim.balls.length = 0;
  $('#result').hidden = true; $('#next').hidden = true; shoot.disabled = false; setBetsEnabled(true);
  document.querySelectorAll('.card span.hit').forEach(el => el.classList.remove('hit'));
  $('#hint').innerHTML = '…or drag <b>down</b> on the board to pull the plunger.';
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
  st.pulling = null; sim.plunger = P.PLUNGER_REST;
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
  const charge = () => { st.pull = P.PLUNGER_PULL * (0.5 - 0.5 * Math.cos((performance.now() - chargeT) / 1200 * Math.PI)); sim.plunger = P.PLUNGER_REST + st.pull; chargeRaf = requestAnimationFrame(charge); };
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
seg($('#digits'), [1, 2, 3, 4, 5, 6, 7, 8, 9], () => st.digit, v => st.digit = st.digit === v ? null : v);

const CARD_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#8e7dbe', '#43aa8b', '#f77f00', '#118ab2', '#c77dff', '#ef476f', '#06d6a0'];
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

// ---------- loop ----------
let last = performance.now();
function loop(now) {
  P.step(sim, Math.min(now - last, 100) / 1000); last = now;
  tick(now); drawFrame(); requestAnimationFrame(loop);
}
new ResizeObserver(resize).observe(canvas);
document.fonts.ready.then(resize);
saveCredits(); refresh(); resize(); requestAnimationFrame(loop);
