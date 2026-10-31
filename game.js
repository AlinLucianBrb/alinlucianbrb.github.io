import { TOWERS, RARITIES, RELICS, rollRarity } from './data.js';

const COLS = 16, ROWS = 10, T = 40;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const rnd = n => Math.floor(Math.random() * n);

TOWERS.forEach((d, i) => {
  const b = document.createElement('button');
  b.id = 't' + i; b.title = d.desc; b.onclick = () => { sel = i; ui(); };
  $('tbtns').append(b);
});

let st, sel = 0, hover = null, last = 0, best = 0, auto = false, active = false, raf = 0, hooks = {};

function genPath() {
  let x = 0, y = 1 + rnd(ROWS - 2); const p = [[x, y]];
  while (x < COLS - 1) {
    const nx = Math.min(COLS - 1, x + 2 + rnd(3));
    while (x < nx) { x++; p.push([x, y]); }
    if (x >= COLS - 1) break;
    let ny; do { ny = rnd(ROWS); } while (Math.abs(ny - y) < 2);
    while (y !== ny) { y += Math.sign(ny - y); p.push([x, y]); }
  }
  return p;
}

function newRun() {
  const path = genPath();
  st = { gold: 100, lives: 20, wave: 0, phase: 'build', path, pathSet: new Set(path.map(c => c.join(','))),
    towers: [], enemies: [], beams: [], spawnLeft: 0, spawnT: 0, speed: 1, relics: [], relicsBought: 0, picking: false, autoT: 3, kills: 0, projs: [],
    mods: { dmg: 1, range: 1, rate: 1, bounty: 0, discount: 1, slowBonus: 0, waveBonus: 1, interest: 0, ramp: 1, jumps: 0,
      kd: { shot: 1, beam: 1, boom: 1, chain: 1 } } };
  $('pick').hidden = true; $('over').hidden = true;
  ui();
}

const cost = i => Math.round(TOWERS[i].cost * st.mods.discount);
const relicCost = () => 80 + 40 * st.relicsBought;

function ui() {
  $('gold').textContent = st.gold; $('lives').textContent = st.lives;
  $('wave').textContent = st.wave; $('best').textContent = best;
  $('go').disabled = st.phase !== 'build' || st.picking;
  $('go').textContent = st.phase === 'build' && auto ? 'Start now (' + Math.max(0, Math.ceil(st.autoT)) + 's)' : 'Start wave';
  $('relic').textContent = 'Relic · ' + relicCost();
  $('auto').textContent = 'Auto-start: ' + (auto ? 'on' : 'off');
  $('auto').classList.toggle('on', auto);
  TOWERS.forEach((d, i) => { const b = $('t' + i); b.textContent = d.name + ' · ' + cost(i); b.classList.toggle('on', sel === i); });
  $('tinfo').textContent = TOWERS[sel].desc;
  $('spd').textContent = 'Speed: ' + st.speed + 'x';
  const box = $('relics'); box.textContent = '';
  if (!st.relics.length) box.textContent = 'Relics: none yet. Buy one with gold.';
  else {
    const counts = {}; st.relics.forEach(r => { const k = r.name + '|' + r.r; counts[k] = (counts[k] || 0) + 1; });
    box.append('Relics: ');
    Object.entries(counts).forEach(([k, v], i) => {
      const [name, r] = k.split('|'), sp = document.createElement('span');
      sp.textContent = name + (v > 1 ? ' ×' + v : ''); sp.style.color = RARITIES[+r].color; sp.style.fontWeight = '600';
      if (i) box.append(', ');
      box.append(sp);
    });
  }
}

function startWave() {
  if (st.phase !== 'build') return;
  st.wave++; st.spawnLeft = 5 + st.wave * 2; st.spawnT = 0; st.phase = 'wave'; ui();
}

function posAt(d) {
  const p = st.path, i = Math.min(p.length - 1.001, d / T), a = p[Math.floor(i)], b = p[Math.floor(i) + 1], f = i % 1;
  return [(a[0] + 0.5 + (b[0] - a[0]) * f) * T, (a[1] + 0.5 + (b[1] - a[1]) * f) * T];
}

function waveCleared() {
  const interest = Math.min(60, Math.floor(st.gold * st.mods.interest));
  st.gold += Math.round((15 + st.wave * 3) * st.mods.waveBonus) + interest;
  if (st.wave > best) { best = st.wave; }
  st.phase = 'build'; st.autoT = 3; ui();
}

function buyRelic() {
  if (st.picking || st.phase === 'over') return;
  const c = relicCost();
  if (st.gold < c) return;
  st.gold -= c; st.relicsBought++;
  openPick();
}

function openPick() {
  st.picking = true;
  const pool = RELICS.slice(), box = $('choices');
  box.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const r = pool.splice(rnd(pool.length), 1)[0], ri = rollRarity(), rar = RARITIES[ri];
    const b = document.createElement('button');
    b.innerHTML = '<b></b><small class="rar"></small><small></small>';
    const [nameEl, rarEl, descEl] = b.children;
    nameEl.textContent = r.name; rarEl.textContent = rar.name; rarEl.style.color = rar.color;
    descEl.textContent = r.desc(rar.mult);
    b.style.borderColor = rar.color;
    b.onclick = () => { r.apply(st, rar.mult); st.relics.push({ name: r.name, r: ri }); st.picking = false; $('pick').hidden = true; ui(); };
    box.append(b);
  }
  $('pick').hidden = false; ui();
}

async function gameOver() {
  st.phase = 'over';
  if (st.wave > best) best = st.wave;
  $('overText').textContent = 'You reached wave ' + st.wave + '.';
  $('subMsg').textContent = 'Saving your run…';
  $('over').hidden = false; ui();
  let msg = '';
  try { msg = await hooks.onRunEnd({ waves: st.wave, kills: st.kills }); } catch (e) { msg = 'Could not save your run.'; }
  $('subMsg').textContent = msg || '';
}

function inRange(t, e, range) { const p = posAt(e.d); return Math.hypot(p[0] - t.x, p[1] - t.y) <= range; }
function pickTarget(t, range) {
  let best = null;
  for (const e of st.enemies) if (e.hp > 0 && (!best || e.d > best.d) && inRange(t, e, range)) best = e;
  return best;
}

function update(dt) {
  dt *= st.speed;
  if (st.phase === 'build' && auto && (st.autoT -= dt) <= 0) startWave();
  if (st.phase === 'wave' && st.spawnLeft > 0 && (st.spawnT -= dt) <= 0) {
    const hp = Math.round(20 * Math.pow(1.2, st.wave - 1));
    st.enemies.push({ d: 0, hp, max: hp, spd: Math.min(90, 50 + st.wave * 2), slowT: 0 });
    st.spawnLeft--; st.spawnT = Math.max(0.35, 0.85 - st.wave * 0.02);
  }
  for (const e of st.enemies) {
    e.slowT = Math.max(0, e.slowT - dt);
    e.d += e.spd * (e.slowT > 0 ? 0.5 : 1) * dt;
    if (e.d / T >= st.path.length - 1.001) { e.hp = 0; e.escaped = true; st.lives--; }
  }
  for (const t of st.towers) {
    const def = TOWERS[t.type], range = def.range * st.mods.range, dmg = def.dmg * st.mods.dmg * st.mods.kd[def.kind];
    if (def.kind === 'beam') {
      let tg = t.lock && t.lock.hp > 0 && inRange(t, t.lock, range) ? t.lock : null;
      if (!tg) { tg = pickTarget(t, range); t.lock = tg; t.ramp = 0; }
      if (tg) {
        t.ramp += dt * st.mods.ramp;
        const k = Math.min(3, t.ramp), p = posAt(tg.d);
        tg.hp -= dmg * (1 + k) * dt;
        st.beams.push({ x1: t.x, y1: t.y, x2: p[0], y2: p[1], t: 0.12, c: def.color, w: 2 + k * 1.5 });
      }
      continue;
    }
    if (def.kind === 'boom' && t.proj) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    const tg = pickTarget(t, range);
    if (!tg) continue;
    const tp = posAt(tg.d);
    if (def.kind === 'boom') {
      const a = Math.atan2(tp[1] - t.y, tp[0] - t.x);
      t.proj = { tower: t, x: t.x, y: t.y, dx: Math.cos(a), dy: Math.sin(a), dist: 0, max: range, out: true, hit: new Set(), dmg, rot: 0 };
      st.projs.push(t.proj);
    } else if (def.kind === 'chain') {
      let cur = tg, px = t.x, py = t.y, d = dmg;
      const seen = new Set();
      for (let j = 0; j <= def.jumps + st.mods.jumps && cur; j++) {
        seen.add(cur); cur.hp -= d; d *= 0.85;
        const p = posAt(cur.d);
        st.beams.push({ x1: px, y1: py, x2: p[0], y2: p[1], t: 0.12, c: def.color });
        px = p[0]; py = p[1];
        let next = null, nd = def.jumpRange * st.mods.range;
        for (const e of st.enemies) {
          if (e.hp <= 0 || seen.has(e)) continue;
          const q = posAt(e.d), dd = Math.hypot(q[0] - px, q[1] - py);
          if (dd <= nd) { nd = dd; next = e; }
        }
        cur = next;
      }
      t.cd = def.rate / st.mods.rate;
    } else {
      tg.hp -= dmg;
      if (def.slow) tg.slowT = def.slow + st.mods.slowBonus;
      t.cd = def.rate / st.mods.rate;
      st.beams.push({ x1: t.x, y1: t.y, x2: tp[0], y2: tp[1], t: 0.08, c: def.color });
    }
  }
  for (const p of st.projs) {
    const step = 260 * dt;
    if (p.out) {
      p.x += p.dx * step; p.y += p.dy * step; p.dist += step;
      if (p.dist >= p.max) { p.out = false; p.hit.clear(); }
    } else {
      const vx = p.tower.x - p.x, vy = p.tower.y - p.y, len = Math.hypot(vx, vy);
      if (len <= step) { p.done = true; p.tower.proj = null; p.tower.cd = TOWERS[p.tower.type].rate / st.mods.rate; }
      else { p.x += vx / len * step; p.y += vy / len * step; }
    }
    p.rot += dt * 15;
    if (!p.done) for (const e of st.enemies) {
      if (e.hp <= 0 || p.hit.has(e)) continue;
      const q = posAt(e.d);
      if (Math.hypot(q[0] - p.x, q[1] - p.y) <= 16) { p.hit.add(e); e.hp -= p.dmg; }
    }
  }
  st.projs = st.projs.filter(p => !p.done);
  st.enemies = st.enemies.filter(e => {
    if (e.hp <= 0 && !e.escaped) { st.gold += 5 + st.mods.bounty; st.kills++; }
    return e.hp > 0;
  });
  st.beams = st.beams.filter(b => (b.t -= dt) > 0);
  if (st.lives <= 0) { st.lives = 0; return gameOver(); }
  if (st.phase === 'wave' && st.spawnLeft === 0 && !st.enemies.length) waveCleared();
  ui();
}

function poly(x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * Math.PI / n, px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function draw() {
  ctx.fillStyle = '#2d4636'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, cv.height); ctx.stroke(); }
  for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(cv.width, y * T); ctx.stroke(); }
  ctx.fillStyle = '#9a8a62';
  st.path.forEach(([x, y]) => ctx.fillRect(x * T, y * T, T, T));
  const end = st.path[st.path.length - 1];
  ctx.fillStyle = '#e5645a'; ctx.fillRect(end[0] * T + T - 6, end[1] * T, 6, T);
  if (hover && !st.pathSet.has(hover.join(',')) && !st.towers.some(t => t.cx === hover[0] && t.cy === hover[1])) {
    ctx.beginPath(); ctx.arc((hover[0] + .5) * T, (hover[1] + .5) * T, TOWERS[sel].range * st.mods.range, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
  }
  st.towers.forEach(t => {
    const d = TOWERS[t.type], [n, rot] = d.shape;
    if (n) poly(t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
    ctx.fillStyle = d.color; ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
  });
  st.beams.forEach(b => { ctx.strokeStyle = b.c; ctx.lineWidth = b.w || 3; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); });
  st.projs.forEach(p => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.strokeStyle = '#8be28b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(0, 0); ctx.lineTo(9, -9); ctx.stroke();
    ctx.restore();
  });
  st.enemies.forEach(e => {
    const [x, y] = posAt(e.d);
    ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fillStyle = e.slowT > 0 ? '#8fb4e8' : '#d1564d'; ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(x - 11, y - 17, 22, 4);
    ctx.fillStyle = '#6fdc7a'; ctx.fillRect(x - 11, y - 17, 22 * Math.max(0, e.hp / e.max), 4);
  });
}

function loop(now) {
  if (!active) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (st.phase !== 'over' && !st.picking) update(dt);
  draw();
  raf = requestAnimationFrame(loop);
}

function cellFrom(e) {
  const r = cv.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * ROWS)];
}
cv.addEventListener('pointermove', e => { hover = cellFrom(e); });
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('pointerdown', e => {
  hover = cellFrom(e);
  if (st.phase === 'over' || st.picking) return;
  const [cx, cy] = hover;
  if (st.pathSet.has(cx + ',' + cy) || st.towers.some(t => t.cx === cx && t.cy === cy)) return;
  const c = cost(sel);
  if (st.gold < c) return;
  st.gold -= c;
  st.towers.push({ type: sel, cx, cy, x: (cx + .5) * T, y: (cy + .5) * T, cd: 0, ramp: 0, lock: null, proj: null });
  ui();
});

$('go').onclick = startWave;
$('relic').onclick = buyRelic;
$('auto').onclick = () => { auto = !auto; st.autoT = 3; ui(); };
$('spd').onclick = () => { st.speed = st.speed === 1 ? 2 : 1; ui(); };
$('newRun').onclick = newRun;
$('menuBtn').onclick = () => hooks.onExit();
$('overMenu').onclick = () => hooks.onExit();
addEventListener('keydown', e => {
  if (!active || e.target.tagName === 'INPUT') return;
  if (+e.key >= 1 && +e.key <= TOWERS.length) { sel = +e.key - 1; ui(); }
  else if (e.key.toLowerCase() === 'r') buyRelic();
  else if (e.key === ' ' && st.phase === 'build' && !st.picking) { e.preventDefault(); startWave(); }
});

/* ---- Public API used by the Play screen ---- */
export function startGame(h) {
  hooks = h; best = h.best || 0; active = true;
  newRun();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(t => { last = t; loop(t); });
}
export function stopGame() { active = false; cancelAnimationFrame(raf); }
