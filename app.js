'use strict';
/* Chiaroscuro — interactive light & shadow guide. Vanilla JS, no dependencies. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, p) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  if (p) p.appendChild(e);
  return e;
};
const set = (e, a) => { for (const k in a) e.setAttribute(k, a[k]); };

/* ---------- progress ---------- */
const goals = {};
try { Object.assign(goals, JSON.parse(localStorage.getItem('chiaroscuro') || '{}')); } catch (_) {}
const toastEl = $('#toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function paintProgress() {
  let n = 0;
  for (let i = 1; i <= 5; i++) {
    const d = !!goals[i];
    if (d) n++;
    $(`.dots button[data-go=c${i}]`).classList.toggle('done', d);
    $(`.goal[data-goal="${i}"]`).classList.toggle('done', d);
  }
  $('.bar i').style.width = (n / 5 * 100) + '%';
  $('#score').textContent = `${n} of 5 challenges complete`;
}
function complete(n) {
  if (goals[n]) return;
  goals[n] = true;
  try { localStorage.setItem('chiaroscuro', JSON.stringify(goals)); } catch (_) {}
  paintProgress();
  toast('✓ Challenge complete');
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) try { navigator.vibrate(30); } catch (_) {}
}
$('#resetAll').onclick = () => {
  for (const k in goals) delete goals[k];
  try { localStorage.removeItem('chiaroscuro'); } catch (_) {}
  paintProgress();
};
$$('[data-go]').forEach(b => b.addEventListener('click', () => {
  $('#' + b.dataset.go).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
}));

/* ---------- drag helper (blocks page scroll only when grabbing a handle) ---------- */
function drag(target, toLocal, hit, onMove, onStart) {
  let tok = null;
  target.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (hit(toLocal(t.clientX, t.clientY))) e.preventDefault();
  }, { passive: false });
  target.addEventListener('pointerdown', e => {
    const p = toLocal(e.clientX, e.clientY);
    const h = hit(p);
    if (!h) return;
    tok = h;
    try { target.setPointerCapture(e.pointerId); } catch (_) {}
    if (onStart) onStart(p, h);
    onMove(p, h);
    e.preventDefault();
  });
  target.addEventListener('pointermove', e => { if (tok) onMove(toLocal(e.clientX, e.clientY), tok); });
  const end = () => { tok = null; };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

/* ======================================================================
   Room section (chapters 1, 2, 4)
   Room coordinates: x → right from inner wall face, y ↑ from floor. 50 units = 1 m.
   ====================================================================== */
const W = 290, H = 150, T = 12, OX = 92, FY = 205;
const X = x => OX + x, Y = y => FY - y;
const poly = a => a.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');

function trace(x, y, dx, dy) {
  const c = [];
  if (dy < 0) c.push({ t: -y / dy, face: 'floor' });
  if (dy > 0) c.push({ t: (H - y) / dy, face: 'ceil' });
  if (dx > 0) c.push({ t: (W - x) / dx, face: 'wall' });
  const b = c.reduce((a, d) => (a.t < d.t ? a : d));
  return { x: x + dx * b.t, y: y + dy * b.t, face: b.face };
}
/* Sun beam through the window, accounting for wall thickness + overhang. */
function beamInfo(theta, s, h, o) {
  const r = theta * Math.PI / 180, tn = Math.tan(r);
  const dx = Math.cos(r), dy = -Math.sin(r);
  const yTop = h - (T + o) * tn;
  if (yTop <= s + 0.5) return { lit: false, yTop };
  return { lit: true, yTop, dx, dy, hu: trace(0, yTop, dx, dy), hl: trace(0, s, dx, dy) };
}
const cornerOf = (a, b) => {
  const f = a.face + '>' + b.face;
  if (f === 'wall>floor') return [W, 0];
  if (f === 'wall>ceil') return [W, H];
  return null;
};

class Room {
  constructor(svg, id) {
    this.svg = svg;
    const defs = el('defs', {}, svg);
    this.sky = el('linearGradient', { id: id + 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    this.s0 = el('stop', { offset: 0 }, this.sky);
    this.s1 = el('stop', { offset: 1 }, this.sky);
    const g = el('radialGradient', { id: id + 'glow' }, defs);
    this.gs0 = el('stop', { offset: 0 }, g);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }, g);
    const cp = el('clipPath', { id: id + 'clip' }, defs);
    el('rect', { x: X(0), y: Y(H), width: W, height: H }, cp);
    this.gid = id;

    el('rect', { x: 0, y: 0, width: 400, height: 250, fill: `url(#${id}sky)` }, svg);
    // ground outside
    this.ground = el('rect', { x: 0, y: FY, width: 400, height: 45, fill: '#1b1a1d' }, svg);
    this.room = el('rect', { x: X(0), y: Y(H), width: W, height: H }, svg);
    const inner = el('g', { 'clip-path': `url(#${id}clip)` }, svg);
    this.glow = el('ellipse', { fill: `url(#${id}glow)`, opacity: 0 }, inner);
    this.ceilGlow = el('rect', { x: X(0), y: Y(H), width: W, height: 26, opacity: 0 }, inner);
    this.beam = el('polygon', {}, svg); // exterior + interior beam (clipped by svg bounds)
    this.refl = el('polygon', { 'clip-path': `url(#${id}clip)` }, svg);
    this.line = el('polyline', { fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'clip-path': `url(#${id}clip)` }, svg);
    this.rline = el('polyline', { fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round', 'clip-path': `url(#${id}clip)` }, svg);
    // person for scale (1.7 m)
    const p = el('g', { fill: '#08080a', opacity: .85 }, svg);
    el('circle', { cx: X(215), cy: Y(78), r: 7 }, p);
    el('rect', { x: X(215) - 8, y: Y(68), width: 16, height: 68, rx: 7 }, p);
    // walls
    this.wBelow = el('rect', { fill: '#2a2927' }, svg);
    this.wAbove = el('rect', { fill: '#2a2927' }, svg);
    el('rect', { x: X(W), y: Y(H), width: T, height: H, fill: '#2a2927' }, svg);
    el('rect', { x: X(-T), y: Y(H) - 10, width: W + 2 * T, height: 10, fill: '#2a2927' }, svg);
    this.floorSlab = el('rect', { x: X(-T), y: FY, width: W + 2 * T, height: 12, fill: '#444' }, svg);
    this.floorTop = el('rect', { x: X(0), y: FY - 3, width: W, height: 3, fill: '#444' }, svg);
    this.over = el('rect', { height: 4, fill: '#3a3835' }, svg);
    // sun
    this.sunGlow = el('circle', { r: 26, opacity: .35 }, svg);
    this.sunDot = el('circle', { r: 10 }, svg);
    this.sunRays = el('circle', { r: 0 }, svg);
    // thin dimension
    el('text', { x: X(W / 2), y: FY + 28, 'text-anchor': 'middle', fill: '#6b665c', 'font-size': 10, 'font-family': 'system-ui' }, svg).textContent = '5.8 m';
  }
  /* st: {theta, s, h, o, floor:{color,albedo,tint,spec}} */
  update(st) {
    const { theta, s, h, o } = st;
    const fl = st.floor || { color: [88, 84, 78], albedo: .35, tint: [255, 230, 190], spec: false };
    const t = clamp((theta - 4) / 68, 0, 1);
    const tt = Math.pow(t, .6);
    set(this.s0, { 'stop-color': rgb(mix([30, 34, 70], [86, 156, 232], t)) });
    set(this.s1, { 'stop-color': rgb(mix([255, 150, 92], [205, 230, 252], t)) });
    const sun = mix([255, 138, 66], [255, 246, 222], tt);
    const r = theta * Math.PI / 180;
    const sx = 80 - 56 * Math.cos(r), sy = 140 - 56 * Math.sin(r);
    set(this.sunDot, { cx: sx, cy: sy, fill: rgb(sun) });
    set(this.sunGlow, { cx: sx, cy: sy, fill: rgb(sun) });

    // walls
    set(this.wBelow, { x: X(-T), y: Y(s), width: T, height: s });
    set(this.wAbove, { x: X(-T), y: Y(H), width: T, height: H - h });
    set(this.over, { x: X(-T - o), y: Y(h) - 4, width: o, height: 4, opacity: o > 0 ? 1 : 0 });
    set(this.floorSlab, { fill: rgb(mix(fl.color, [0, 0, 0], .25)) });
    set(this.floorTop, { fill: rgb(fl.color) });

    const b = beamInfo(theta, s, h, o);
    let reachFloor = 0, backWall = false, floorLen = 0, power = 0;
    let fx = null;
    if (b.lit) {
      const L = 110;
      const pts = [[-b.dx * L, b.yTop - b.dy * L], [b.hu.x, b.hu.y]];
      const c = cornerOf(b.hu, b.hl);
      if (c) pts.push(c);
      pts.push([b.hl.x, b.hl.y], [-b.dx * L, s - b.dy * L]);
      set(this.beam, { points: poly(pts), fill: rgb(sun, .34 + .16 * t) });
      // landing strips
      const lp = [];
      if (b.hl.face === 'floor') {
        const xb = b.hu.face === 'floor' ? b.hu.x : W - 1.5;
        fx = [b.hl.x, b.hu.face === 'floor' ? b.hu.x : W];
        lp.push([b.hl.x, 1.5], [xb, 1.5]);
        floorLen = fx[1] - fx[0];
        if (b.hu.face === 'wall') lp.push([W - 1.5, b.hu.y]);
      } else {
        lp.push([W - 1.5, b.hl.y], [W - 1.5, b.hu.y]);
      }
      backWall = b.hu.face === 'wall';
      reachFloor = Math.min(W, b.hu.face === 'floor' ? b.hu.x : W);
      set(this.line, { points: poly(lp.length ? lp : [[0, 0]]), stroke: rgb(mix(sun, [255, 255, 255], .35)), opacity: .95 });
      power = clamp(Math.max(floorLen, backWall ? 60 : 0) / 90, 0, 1) * (.4 + .6 * Math.sqrt(t));
    } else {
      set(this.beam, { points: '' });
      set(this.line, { points: '' });
    }

    // specular reflection from a polished floor
    if (b.lit && fl.spec && fx) {
      const A = trace(fx[0], 0, b.dx, -b.dy), B = trace(fx[1], 0, b.dx, -b.dy);
      const pts = [[fx[0], 0], [fx[1], 0], [B.x, B.y]];
      const c = cornerOf(B, A);
      if (c) pts.push(c);
      pts.push([A.x, A.y]);
      set(this.refl, { points: poly(pts), fill: rgb(sun, .26) });
      const rl = [];
      if (A.face === 'ceil') { rl.push([A.x, H - 1.5], [B.face === 'ceil' ? B.x : W, H - 1.5]); }
      set(this.rline, { points: poly(rl.length ? rl : [[0, 0]]), stroke: rgb(mix(sun, [255, 255, 255], .5)), opacity: rl.length ? .95 : 0 });
      this.specHit = rl.length > 0;
    } else {
      set(this.refl, { points: '' });
      set(this.rline, { points: '', opacity: 0 });
      this.specHit = false;
    }

    // bounce glow (diffuse) tinted by the floor
    const diffuse = fl.spec ? .16 : fl.albedo;
    const glowStrength = clamp(diffuse * power * 1.15, 0, 1);
    const cx = fx ? (fx[0] + fx[1]) / 2 : W * .75;
    set(this.glow, { cx: X(cx), cy: Y(30), rx: 190, ry: 150, opacity: glowStrength });
    set(this.gs0, { 'stop-color': rgb(fl.tint), 'stop-opacity': .85 });
    set(this.ceilGlow, { fill: rgb(fl.tint), opacity: clamp(glowStrength * .55 + (this.specHit ? .22 : 0), 0, .8) });

    // interior ambient
    const amb = clamp(.12 + .2 * t + power * (.12 + .5 * diffuse), 0, 1);
    set(this.room, { fill: rgb(mix([17, 17, 24], [112, 106, 98], amb)) });

    this.metrics = {
      reachM: reachFloor / 50, backWall, floorLenM: floorLen / 50, lit: b.lit,
      bounce: clamp(diffuse * power, 0, 1), spec: this.specHit, power, amb, theta,
    };
    return this.metrics;
  }
}

/* ---------- Chapter 1: time ---------- */
(function () {
  const room = new Room($('#svg1'), 'a');
  const r = $('#r1'), out = $('#o1'), read = $('#read1'), hud = $('#hud1');
  const thetaOf = hr => 4 + 68 * Math.sin(Math.PI * (hr - 6) / 12);
  const fmt = hr => {
    const m = Math.round(hr * 60), hh = Math.floor(m / 60) % 24, mm = m % 60;
    return `${hh}:${String(mm).padStart(2, '0')}`;
  };
  function upd() {
    const hr = +r.value, th = Math.max(4, thetaOf(hr));
    const m = room.update({ theta: th, s: 35, h: 120, o: 0 });
    out.textContent = fmt(hr);
    hud.textContent = `Sun ${Math.round(th)}° high`;
    let msg;
    if (m.backWall) msg = '<b>Low, warm sun skims the whole room</b> and climbs the back wall. Long light feels dramatic and intimate.';
    else if (th > 55) msg = `<b>Overhead sun</b> only reaches ${m.reachM.toFixed(1)} m in. Bright, crisp and short, with a cool, white colour.`;
    else msg = `<b>Mid-height sun</b> pushes light ${m.reachM.toFixed(1)} m across the floor. Lower sun means deeper reach.`;
    read.innerHTML = msg;
    if (m.backWall) complete(1);
  }
  r.addEventListener('input', upd);
  upd();
})();

/* ---------- Chapter 2: shade ---------- */
(function () {
  const room = new Room($('#svg2'), 'b');
  const ro = $('#r2'), rh = $('#r2b'), oo = $('#o2'), oh = $('#o2b'), read = $('#read2'), hud = $('#hud2');
  let theta = 72;
  const S = 35;
  function upd() {
    const o = +ro.value, h = +rh.value;
    oo.textContent = (o / 50).toFixed(1) + ' m';
    oh.textContent = (h / 50).toFixed(1) + ' m';
    const m = room.update({ theta, s: S, h, o });
    hud.textContent = `Sun ${theta}°`;
    const sum = beamInfo(72, S, h, o), win = beamInfo(25, S, h, o);
    const winReach = win.lit ? Math.min(W, win.hu.face === 'floor' ? win.hu.x : W) / 50 : 0;
    const sumTxt = sum.lit ? '<span style="color:#ff9d7a">sun gets in</span>' : '<span style="color:#8fe0a6">blocked</span>';
    const winTxt = win.lit ? `<span style="color:#8fe0a6">reaches ${winReach.toFixed(1)} m</span>` : '<span style="color:#ff9d7a">blocked</span>';
    read.innerHTML = `Summer noon: ${sumTxt}<br>Winter noon: ${winTxt}`;
    if (!sum.lit && win.lit && winReach >= 2) complete(2);
  }
  $$('#seasons button').forEach(b => b.addEventListener('click', () => {
    $$('#seasons button').forEach(x => x.classList.toggle('on', x === b));
    theta = +b.dataset.th; upd();
  }));
  ro.addEventListener('input', upd); rh.addEventListener('input', upd);
  upd();
})();

/* ---------- Chapter 4: bounce ---------- */
(function () {
  const room = new Room($('#svg4'), 'c');
  const mats = [
    { name: 'Charcoal', color: [42, 42, 48], albedo: .06, tint: [150, 150, 175], spec: false },
    { name: 'Timber', color: [155, 106, 60], albedo: .32, tint: [255, 178, 105], spec: false },
    { name: 'Plaster', color: [232, 226, 214], albedo: .82, tint: [255, 240, 214], spec: false },
    { name: 'Polished stone', color: [111, 147, 179], albedo: .5, tint: [190, 215, 240], spec: true },
  ];
  let mi = 2;
  const read = $('#read4'), hud = $('#hud4');
  const notes = [
    'Dark floors <b>absorb</b> about 94% of the sun. The patch is vivid but the room stays gloomy.',
    'Timber returns the sun <b>warm and amber</b>: colour of the surface becomes colour of the light.',
    'Pale plaster bounces most of it. The <b>whole ceiling glows</b>, so the room feels bigger and calmer.',
    'Polished stone behaves like a mirror: the beam <b>re-aims at the ceiling</b> as a sharp second patch.',
  ];
  let touched = false;
  function upd() {
    const f = mats[mi];
    const m = room.update({ theta: 38, s: 35, h: 120, o: 0, floor: f });
    $('#m4').style.width = Math.round(m.bounce * 100) + '%';
    $('#mo4').textContent = Math.round((f.spec ? .85 : f.albedo) * 100) + '%';
    hud.textContent = f.name;
    read.innerHTML = notes[mi];
    if (mi === 2 && touched) complete(4);
  }
  $$('#mats button').forEach(b => b.addEventListener('click', () => {
    $$('#mats button').forEach(x => x.classList.toggle('on', x === b));
    mi = +b.dataset.m; touched = true; upd();
  }));
  upd();
})();

/* ---------- Chapter 3: soft vs hard shadows ---------- */
(function () {
  const svg = $('#svg3');
  const GY = 185, GB = 235, CX1 = 170, CX2 = 190, CT = 110;
  const defs = el('defs', {}, svg);
  const bg = el('linearGradient', { id: 'd-bg', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#17161c' }, bg);
  el('stop', { offset: 1, 'stop-color': '#26221d' }, bg);
  const lit = el('radialGradient', { id: 'd-lit', gradientUnits: 'userSpaceOnUse', r: 260 }, defs);
  const ls0 = el('stop', { offset: 0, 'stop-color': '#ffe3b4', 'stop-opacity': .95 }, lit);
  el('stop', { offset: 1, 'stop-color': '#ffe3b4', 'stop-opacity': .05 }, lit);
  const fil = el('filter', { id: 'd-blur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  const gb = el('feGaussianBlur', { stdDeviation: '4 0.5' }, fil);

  el('rect', { x: 0, y: 0, width: 360, height: 250, fill: 'url(#d-bg)' }, svg);
  el('rect', { x: 0, y: GY, width: 360, height: GB - GY, fill: '#3a342c' }, svg);
  el('rect', { x: 0, y: GY, width: 360, height: GB - GY, fill: 'url(#d-lit)' }, svg);
  const shadow = el('polygon', { fill: '#000', opacity: .86, filter: 'url(#d-blur)' }, svg);
  const contact = el('rect', { y: GY, height: GB - GY, width: 14, fill: '#000', opacity: .55 }, svg);
  const rayA = el('line', { stroke: '#ffd9a0', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: .6 }, svg);
  const rayB = el('line', { stroke: '#ffd9a0', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: .6 }, svg);
  el('rect', { x: CX1, y: CT, width: CX2 - CX1, height: GY - CT, fill: '#8d867a' }, svg);
  el('rect', { x: CX1 + 10, y: CT, width: CX2 - CX1 - 10, height: GY - CT, fill: '#6d675d' }, svg);
  const glow = el('circle', { fill: '#ffd9a0', opacity: .35 }, svg);
  const core = el('circle', { fill: '#fff6e0' }, svg);
  const ring = el('circle', { r: 20, fill: 'none', stroke: '#fff', 'stroke-width': 1.5, 'stroke-dasharray': '2 5', opacity: .7 }, svg);

  const L = { x: 70, y: 48 };
  let D = 24, moved = false;
  const range = $('#r3'), out = $('#o3'), read = $('#read3'), hud = $('#hud3');
  const proj = (px, py) => {
    const t = (GY - L.y) / (py - L.y);
    return L.x + (px - L.x) * t;
  };
  function upd() {
    L.x = clamp(L.x, 18, 342); L.y = clamp(L.y, 20, 92);
    const pl = proj(CX1, CT), pr = proj(CX2, CT);
    const xs = [CX1, CX2, pl, pr], x1 = Math.min(...xs), x2 = Math.max(...xs);
    set(shadow, { points: `${x1},${GY} ${x2},${GY} ${x2},${GB} ${x1},${GB}` });
    // penumbra width at the far tip: D * (tip→ground along ray) / (lamp→tip)
    const farTop = L.x < 180 ? [CX2, CT] : [CX1, CT];
    const farG = proj(farTop[0], farTop[1]);
    const a = Math.hypot(farTop[0] - L.x, farTop[1] - L.y), bb = Math.hypot(farG - farTop[0], GY - farTop[1]);
    const pen = D * (bb / a);
    set(gb, { stdDeviation: `${clamp(pen / 2.3, .2, 30).toFixed(2)} 0.5` });
    set(contact, { x: L.x < 180 ? CX2 - 2 : CX1 - 12, opacity: clamp(.7 - D / 120, .2, .7) });
    set(rayA, { x1: L.x, y1: L.y, x2: pl, y2: GY });
    set(rayB, { x1: L.x, y1: L.y, x2: pr, y2: GY });
    set(glow, { cx: L.x, cy: L.y, r: 10 + D * .55 });
    set(core, { cx: L.x, cy: L.y, r: 4 + D * .26 });
    set(ring, { cx: L.x, cy: L.y });
    set(lit, { cx: L.x, cy: L.y });
    out.textContent = D;
    range.value = D;
    $$('#sizes button').forEach(b => b.classList.toggle('on', +b.dataset.d === D));
    const cm = Math.round(pen * 2);
    hud.textContent = `Edge blur ≈ ${cm} cm`;
    read.innerHTML = D <= 6 ? '<b>Point-like source:</b> the shadow is a crisp graphic shape. Maximum drama, maximum contrast.'
      : D < 40 ? '<b>Medium source:</b> a clear core with a blurred edge. Notice the edge is sharpest where the object touches the ground.'
      : '<b>Huge source:</b> light wraps around the column and the shadow almost dissolves. Calm, even, shadowless.';
    if (D <= 5 && moved) complete(3);
  }
  const toLocal = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * 360, y: (cy - r.top) / r.height * 250 };
  };
  drag(svg, toLocal, p => Math.hypot(p.x - L.x, p.y - L.y) < 34, p => { L.x = p.x; L.y = p.y; upd(); });
  range.addEventListener('input', () => { D = +range.value; moved = true; upd(); });
  $$('#sizes button').forEach(b => b.addEventListener('click', () => { D = +b.dataset.d; moved = true; upd(); }));
  upd();
})();

/* ---------- Chapter 5: light a plan (canvas, real traced shadows) ---------- */
(function () {
  const cv = $('#cv5'), ctx = cv.getContext('2d');
  const WW = 340, WH = 390;
  const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
  const acc = document.createElement('canvas'), actx = acc.getContext('2d');
  const lt = document.createElement('canvas'), lctx = lt.getContext('2d');
  const sum = document.createElement('canvas'), sctx = sum.getContext('2d');
  const COLORS = [[255, 170, 90], [255, 242, 220], [140, 186, 255]];
  const NAMES = ['candle', 'daylight', 'cool'];
  const obs0 = () => [
    { x: 120, y: 150, w: 30, h: 30 }, { x: 230, y: 150, w: 30, h: 30 },
    { x: 175, y: 255, w: 30, h: 30 }, { x: 95, y: 320, w: 130, h: 10 },
  ];
  let obs = obs0();
  let lights = [{ x: 70, y: 70, k: 0 }];
  let sel = 0, soft = 8, k = 1, dpr = 1, dragging = false, queued = false;
  const read = $('#read5'), range = $('#r5'), out = $('#o5');

  function size() {
    const w = cv.parentElement.clientWidth || 360;
    k = w / WW;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.height = (WH * k) + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(WH * k * dpr);
    const ld = Math.min(dpr, 1.5);
    for (const c of [tmp, acc, lt, sum]) { c.width = Math.round(w * ld); c.height = Math.round(WH * k * ld); }
    draw();
  }
  function quad(c, a, b, p) {
    const f = 60;
    c.beginPath();
    c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    c.lineTo(b[0] + (b[0] - p.x) * f, b[1] + (b[1] - p.y) * f);
    c.lineTo(a[0] + (a[0] - p.x) * f, a[1] + (a[1] - p.y) * f);
    c.closePath(); c.fill();
  }
  function draw() {
    queued = false;
    const ld = tmp.width / WW;
    const N = soft === 0 ? 1 : (dragging ? 8 : 18);
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.globalCompositeOperation = 'source-over';
    actx.clearRect(0, 0, acc.width, acc.height);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, sum.width, sum.height);
    for (const Lt of lights) {
      const col = COLORS[Lt.k];
      // 1) average several jittered shadow masks across the light's area = soft penumbra
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.globalCompositeOperation = 'source-over';
      actx.clearRect(0, 0, acc.width, acc.height);
      for (let i = 0; i < N; i++) {
        const rr = N === 1 ? 0 : Math.sqrt((i + .5) / N) * soft, an = i * 2.39996;
        const p = { x: Lt.x + Math.cos(an) * rr, y: Lt.y + Math.sin(an) * rr };
        tctx.setTransform(ld, 0, 0, ld, 0, 0);
        tctx.globalCompositeOperation = 'source-over';
        tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, WW, WH);
        tctx.globalCompositeOperation = 'destination-out';
        tctx.fillStyle = '#000';
        for (const o of obs) {
          const c = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
          for (let e = 0; e < 4; e++) quad(tctx, c[e], c[(e + 1) % 4], p);
          tctx.fillRect(o.x, o.y, o.w, o.h);
        }
        actx.globalCompositeOperation = 'lighter';
        actx.globalAlpha = 1 / N;
        actx.drawImage(tmp, 0, 0);
        actx.globalAlpha = 1;
      }
      // 2) light falloff gradient × visibility mask, added to the sum
      lctx.setTransform(ld, 0, 0, ld, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(0, 0, WW, WH);
      const g = lctx.createRadialGradient(Lt.x, Lt.y, 0, Lt.x, Lt.y, 380);
      g.addColorStop(0, rgb(col, 1)); g.addColorStop(.12, rgb(col, .78));
      g.addColorStop(.45, rgb(col, .32)); g.addColorStop(1, rgb(col, 0));
      lctx.fillStyle = g; lctx.fillRect(0, 0, WW, WH);
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(acc, 0, 0);
      sctx.globalCompositeOperation = 'lighter';
      sctx.drawImage(lt, 0, 0);
    }
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0e0e12'; ctx.fillRect(0, 0, WW, WH);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WW; x += 34) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
    for (let y = 0; y <= WH; y += 34) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sum, 0, 0, cv.width, cv.height);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    for (const o of obs) {
      ctx.fillStyle = '#1b1b21'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(o.x, o.y, o.w, o.h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, WW, WH);
    lights.forEach((Lt, i) => {
      const col = COLORS[Lt.k];
      const g = ctx.createRadialGradient(Lt.x, Lt.y, 0, Lt.x, Lt.y, 30);
      g.addColorStop(0, rgb(col, .9)); g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Lt.x, Lt.y, 30, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Lt.x, Lt.y, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = i === sel ? '#fff' : 'rgba(255,255,255,.4)';
      ctx.lineWidth = i === sel ? 2 : 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(Lt.x, Lt.y, 17, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    });
  }
  const sched = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  function status() {
    const names = [...new Set(lights.map(l => NAMES[l.k]))];
    read.innerHTML = `<b>${lights.length} light${lights.length > 1 ? 's' : ''}</b> · ${names.join(' + ')}. ` +
      (lights.length > 1 ? 'Each light throws its own shadow; where two overlap you get colour mixing.' : 'Drag the light behind a column: the shadow always points away from the source. Tap <b>+ Add light</b> to layer a second one.');
    const ks = new Set(lights.map(l => l.k));
    if (ks.has(0) && ks.has(2)) complete(5);
    $$('#temps button').forEach(b => b.classList.toggle('on', +b.dataset.k === lights[sel].k));
    $('#add5').disabled = lights.length >= 3;
  }
  const toLocal = (cx, cy) => {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left) / k, y: (cy - r.top) / k };
  };
  drag(cv, toLocal, p => {
    for (let i = lights.length - 1; i >= 0; i--) if (Math.hypot(p.x - lights[i].x, p.y - lights[i].y) < 30) return { l: lights[i], i };
    for (let i = obs.length - 1; i >= 0; i--) {
      const o = obs[i];
      if (p.x > o.x - 14 && p.x < o.x + o.w + 14 && p.y > o.y - 14 && p.y < o.y + o.h + 14) return { o, i };
    }
    return null;
  }, (p, t) => {
    dragging = true;
    t.dx = p.x - (t.l ? t.l.x : t.o.x); t.dy = p.y - (t.l ? t.l.y : t.o.y);
    if (t.l) { sel = t.i; status(); }
  }, (p, t) => {
    const it = t.l || t.o, w = t.o ? t.o.w : 0, h = t.o ? t.o.h : 0;
    it.x = clamp(p.x - t.dx, t.o ? 6 : 10, WW - w - (t.o ? 6 : 10));
    it.y = clamp(p.y - t.dy, t.o ? 6 : 10, WH - h - (t.o ? 6 : 10));
    sched();
  });
  const endDrag = () => { if (dragging) { dragging = false; sched(); } };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  $$('#temps button').forEach(b => b.addEventListener('click', () => { lights[sel].k = +b.dataset.k; status(); sched(); }));
  range.addEventListener('input', () => { soft = +range.value; out.textContent = soft; sched(); });
  $('#add5').onclick = () => {
    if (lights.length >= 3) return;
    lights.push({ x: 270, y: 70 + lights.length * 40, k: 2 });
    sel = lights.length - 1; status(); sched();
  };
  $('#reset5').onclick = () => {
    obs = obs0(); lights = [{ x: 70, y: 70, k: 0 }]; sel = 0; soft = 8;
    range.value = 8; out.textContent = 8; status(); sched();
  };
  new ResizeObserver(size).observe(cv.parentElement);
  status(); size();
})();

/* ---------- hero: light moves with scroll & touch ---------- */
(function () {
  const hero = $('.hero'), cast = $('.cast');
  let px = 0;
  function paint() {
    const y = clamp(scrollY / Math.max(1, hero.offsetHeight), 0, 1.2);
    cast.style.setProperty('--sk', (-14 + y * 34 + px * 8) + 'deg');
    cast.style.setProperty('--tx', (px * 26) + 'px');
    cast.style.setProperty('--ty', (y * 30) + 'px');
    cast.style.setProperty('--sy', (1 + y * .35).toFixed(3));
  }
  addEventListener('scroll', paint, { passive: true });
  hero.addEventListener('pointermove', e => { px = (e.clientX / innerWidth - .5) * 2; paint(); });
  paint();
})();

/* ---------- reveal on scroll ---------- */
(function () {
  const items = $$('.chapter > *, .finale > *');
  items.forEach(i => i.classList.add('rv'));
  if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .08 });
  items.forEach(i => io.observe(i));
})();

paintProgress();
