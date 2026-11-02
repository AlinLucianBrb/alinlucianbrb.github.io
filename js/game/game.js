/* The game orchestrator: owns the run state and the loop, and wires the separate pieces together.
   Heroes, enemies, projectiles, effects, stats, meter, rendering and UI each live in their own module. */
import { HEROES, RARITIES, RELICS, rollRarity, COLS, ROWS, T, STAGES } from './data.js';
import { createBus } from '../core/bus.js';
import { resolve, heroStats } from './stats.js';
import { applyEffect } from './effects.js';
import { BEHAVIORS } from './behaviors.js';
import { spawnEnemy, updateEnemies, sweep, waveCount, spawnDelay, waveEnemyType } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { createMeter } from './meter.js';
import { buildBackground, draw, addBeam, tickBeams, addSlash, tickSlashes } from './render.js';
import { talentMods } from './talents.js';
import * as ui from './ui.js';

const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const rnd = n => Math.floor(Math.random() * n);
const STEP = 1 / 60;            /* fixed simulation step: the game plays the same at any frame rate, and can catch up after a pause */
const MAX_CATCHUP = 1800;       /* never simulate more than 30 minutes of missed time */

let g, sel = 0, hover = null, last = -1, acc = 0, auto = false, active = false, raf = 0, hooks = {}, uiT = 0, scale = 1, stageN = 1;
let bgWorker = null, bgTimer = 0;

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

/* Central damage function: every hit in the game goes through here, so effects, the meter and kills all hook in one place. */
function hit(hero, e, amount) {
  if (e.dead) return;
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount; e.last = hero;
  if (hero) {
    g.ev.emit('damage', { hero, enemy: e, amount: dealt });
    const ap = hero.def.applies;
    if (ap) for (const id in ap) applyEffect(e, id, hero.s[ap[id]]);
  }
  if (e.hp <= 0) { e.dead = true; g.ev.emit('kill', { hero, enemy: e }); }
}

function recalc() {
  g.gs = {
    bounty: resolve(5, 'bounty', g.mods), heroCost: Math.max(0.25, resolve(1, 'heroCost', g.mods)),
    waveGold: resolve(1, 'waveGold', g.mods), interest: resolve(0, 'interest', g.mods)
  };
  for (const t of g.heroes) t.s = heroStats(t.def, g.mods);
}

function newRun() {
  const path = genPath(), mods = talentMods(hooks.talents || []), stage = STAGES[stageN - 1];
  g = { path, pathSet: new Set(path.map(c => c.join(','))), stage, maxWave: stage.waves,
    gold: 100 + resolve(0, 'startGold', mods), lives: 20 + resolve(0, 'startLives', mods), wave: 0, phase: 'build', speed: 1, autoT: 3, picking: false,
    heroes: [], enemies: [], projs: [], beams: [], slashes: [], mods, relics: [], relicsBought: 0, banned: new Set(), pick: null, moving: null,
    kills: 0, spawnLeft: 0, spawnT: 0, selected: null, ev: createBus(), gs: null };
  g.hit = hit; g.beam = (...a) => addBeam(g, ...a); g.slash = (...a) => addSlash(g, ...a);
  g.cost = i => Math.round(HEROES[i].cost * g.gs.heroCost);
  g.relicCost = () => Math.round(0.6 * (80 + 40 * g.relicsBought));
  g.pickCost = () => Math.max(1, Math.round(0.25 * g.pick.paid * Math.pow(1.05, g.pick.uses)));
  g.previewRange = i => resolve(HEROES[i].stats.range, 'range', g.mods, HEROES[i].tags);
  g.meter = createMeter(g.ev);
  g.ev.on('kill', ({ enemy }) => { g.gold += Math.round(g.gs.bounty * enemy.def.bounty); g.kills++; });
  g.ev.on('escape', ({ enemy }) => { g.lives = Math.max(0, g.lives - enemy.def.leak); if (g.lives <= 0 && g.phase !== 'over') endRun(false); });
  g.bg = buildBackground(g, scale);
  recalc();
  ui.hidePick(); ui.hideOver();
  ui.renderMeter(g); ui.renderInspector(g);
  if (hooks.onRunStart) hooks.onRunStart();
}

function startWave() {
  if (g.phase !== 'build' || g.picking) return;
  g.wave++; g.spawnLeft = waveCount(g.wave); g.spawnT = 0; g.phase = 'wave';
}

function waveCleared() {
  const interest = Math.min(60, Math.floor(g.gold * g.gs.interest));
  g.gold += Math.round((15 + g.wave * 3) * g.gs.waveGold) + interest;
  if (g.wave >= g.maxWave) { endRun(true); return; }
  g.phase = 'build'; g.autoT = 3;
}

/* ---- Relic shop: buy, then choose one of three. Reroll or banish costs 25% of the relic's price, +5% each use. ---- */
function drawRelics(n, taken) {
  const pool = RELICS.filter(r => !g.banned.has(r.name) && !taken.includes(r.name)), out = [];
  while (out.length < n && pool.length) out.push({ relic: pool.splice(rnd(pool.length), 1)[0], ri: rollRarity() });
  return out;
}
function buyRelic() {
  if (g.picking || g.phase === 'over') return;
  const c = g.relicCost();
  if (g.gold < c) return;
  g.gold -= c; g.relicsBought++;
  g.pick = { offers: drawRelics(3, []), paid: c, uses: 0 };
  g.picking = true; ui.showPick(g);
}
function reroll() {
  if (!g.pick) return;
  const c = g.pickCost();
  if (g.gold < c) return;
  g.gold -= c; g.pick.uses++; g.pick.offers = drawRelics(3, []); ui.showPick(g);
}
function banish(i) {
  if (!g.pick) return;
  const c = g.pickCost();
  if (g.gold < c) return;
  g.gold -= c; g.pick.uses++;
  g.banned.add(g.pick.offers[i].relic.name);
  g.pick.offers.splice(i, 1, ...drawRelics(1, g.pick.offers.map(o => o.relic.name)));
  ui.showPick(g);
}
function choose(i) {
  const o = g.pick.offers[i], m = RARITIES[o.ri].mult, r = o.relic;
  if (r.mods) for (const x of r.mods(m)) g.mods.push({ ...x, source: r.name, ri: o.ri });
  if (r.onPick) r.onPick(g, m);
  g.relics.push({ name: r.name, r: o.ri });
  g.pick = null; g.picking = false; ui.hidePick(); recalc(); ui.renderInspector(g);
}

/* ---- Selling and moving heroes ---- */
function sellSelected() {
  const t = g.selected;
  if (!t || g.phase === 'over') return;
  g.gold += Math.round(t.paid * 0.7);
  g.heroes.splice(g.heroes.indexOf(t), 1);
  let j = 0;
  for (let i = 0; i < g.projs.length; i++) if (g.projs[i].owner !== t) g.projs[j++] = g.projs[i];
  g.projs.length = j;
  g.selected = null; g.moving = null; ui.renderInspector(g);
}
function toggleMove() { if (g.selected && g.phase !== 'over') { g.moving = g.moving === g.selected ? null : g.selected; ui.renderInspector(g); } }
function closeInspector() { g.selected = null; g.moving = null; ui.renderInspector(g); }

async function endRun(won) {
  g.phase = 'over'; g.moving = null;
  ui.showOver(won ? 'Level cleared!' : 'The gate has fallen',
    won ? 'You beat all ' + g.maxWave + ' waves.' : 'You reached wave ' + g.wave + ' of ' + g.maxWave + '.', 'Saving your run…', won && stageN < STAGES.length);
  let msg = '';
  try { msg = await hooks.onRunEnd({ waves: g.wave, kills: g.kills, stage: stageN, won }); } catch (e) { msg = 'Could not save your run.'; }
  ui.setOverMsg(msg || '');
}

function update(dt) {
  if (g.phase === 'build' && auto && (g.autoT -= dt) <= 0) startWave();
  if (g.phase === 'wave' && g.spawnLeft > 0 && (g.spawnT -= dt) <= 0) {
    spawnEnemy(g, waveEnemyType(g.wave, g.spawnLeft)); g.spawnLeft--; g.spawnT = spawnDelay(g.wave);
  }
  updateEnemies(g, dt);
  for (const t of g.heroes) BEHAVIORS[t.def.kind].update(g, t, dt);
  updateProjectiles(g, dt);
  sweep(g.enemies); tickBeams(g, dt); tickSlashes(g, dt);
  if (g.phase === 'wave' && g.spawnLeft === 0 && !g.enemies.length) waveCleared();
}

/* ---- Loop: fixed steps, driven by requestAnimationFrame while visible and by a timer while the tab is hidden ---- */
function frame(now) {
  if (!active) return;
  if (last < 0) last = now;
  const real = Math.min(MAX_CATCHUP, Math.max(0, (now - last) / 1000)); last = now;
  const hidden = !!document.hidden, running = g.phase !== 'over' && !g.picking;
  acc = running ? acc + real * g.speed : 0;
  const deadline = performance.now() + (hidden ? 150 : 8);
  while (acc >= STEP && g.phase !== 'over' && !g.picking) {
    update(STEP); acc -= STEP;
    if (performance.now() > deadline) break;
  }
  if (hidden) return;
  draw(ctx, g, { hover, sel, scale });
  ui.renderHUD(g, sel, auto);
  if (g.picking) ui.updatePick(g);
  if ((uiT += real) >= 0.25) { uiT = 0; ui.renderMeter(g); if (g.selected) ui.renderInspector(g); }
}
function loopRaf(t) { frame(t); raf = requestAnimationFrame(loopRaf); }
function startBg() {
  if (bgWorker || bgTimer) return;
  try {
    bgWorker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},200)'], { type: 'text/javascript' })));
    bgWorker.onmessage = () => frame(performance.now());
  } catch (e) { bgTimer = setInterval(() => frame(performance.now()), 500); }
}
function stopBg() {
  if (bgWorker) { bgWorker.terminate(); bgWorker = null; }
  if (bgTimer) { clearInterval(bgTimer); bgTimer = 0; }
}
function onVisibility() {
  if (!active) return;
  cancelAnimationFrame(raf);
  if (document.hidden) startBg(); else { stopBg(); raf = requestAnimationFrame(loopRaf); }
}
if (document.addEventListener) document.addEventListener('visibilitychange', onVisibility);

/* Keeps the canvas sharp at any window size. The game is drawn in a fixed 640x400 space and scaled. */
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const w = Math.round(r.width * Math.min(2, globalThis.devicePixelRatio || 1));
  if (cv.width === w) return;
  cv.width = w; cv.height = Math.round(w * ROWS / COLS); scale = w / (COLS * T);
  if (g) g.bg = buildBackground(g, scale);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe($('stagebox'));

/* ---- Input ---- */
function cellFrom(e) {
  const r = cv.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * ROWS)];
}
cv.addEventListener('pointermove', e => { hover = cellFrom(e); });
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('pointerdown', e => {
  hover = cellFrom(e);
  if (g.phase === 'over' || g.picking) return;
  const [cx, cy] = hover, existing = g.heroes.find(t => t.cx === cx && t.cy === cy);
  if (g.moving) {
    const m = g.moving;
    if (existing === m) { g.moving = null; ui.renderInspector(g); return; }
    if (existing || g.pathSet.has(cx + ',' + cy)) return;
    m.cx = cx; m.cy = cy; m.x = (cx + 0.5) * T; m.y = (cy + 0.5) * T; m.cd = 1; m.lock = null;
    g.moving = null; ui.renderInspector(g); return;
  }
  if (existing) { g.selected = existing; ui.renderInspector(g); return; }
  if (g.pathSet.has(cx + ',' + cy)) return;
  const c = g.cost(sel);
  if (g.gold < c) return;
  g.gold -= c; g.selected = null;
  g.heroes.push({ type: sel, def: HEROES[sel], cx, cy, x: (cx + 0.5) * T, y: (cy + 0.5) * T, cd: 0, ramp: 0, lock: null, proj: null, dealt: 0, kills: 0, paid: c, s: heroStats(HEROES[sel], g.mods) });
  ui.renderInspector(g);
});

const selectType = i => { sel = i; g.moving = null; if (g.selected) { g.selected = null; ui.renderInspector(g); } };
ui.initUI({ onSelectType: selectType, onCloseInspector: closeInspector, onSell: sellSelected, onMove: toggleMove, onChoose: choose, onReroll: reroll, onBanish: banish });
$('go').onclick = startWave;
$('relic').onclick = buyRelic;
$('auto').onclick = () => { auto = !auto; g.autoT = 3; };
$('spd').onclick = () => { g.speed = g.speed === 1 ? 2 : 1; };
$('newRun').onclick = () => { newRun(); acc = 0; };
$('overNext').onclick = () => hooks.onNext && hooks.onNext();
$('menuBtn').onclick = () => hooks.onExit();
$('overMenu').onclick = () => hooks.onExit();
addEventListener('keydown', e => {
  if (!active || e.target.tagName === 'INPUT') return;
  if (+e.key >= 1 && +e.key <= HEROES.length) selectType(+e.key - 1);
  else if (e.key.toLowerCase() === 'r') buyRelic();
  else if (e.key.toLowerCase() === 'm') toggleMove();
  else if (e.key.toLowerCase() === 'x') sellSelected();
  else if (e.key === 'Escape') closeInspector();
  else if (e.key === ' ' && g.phase === 'build' && !g.picking) { e.preventDefault(); startWave(); }
});

/* ---- Public API used by the Play screen ---- */
export function startGame(h) {
  hooks = h; stageN = h.stage || 1; active = true; acc = 0; last = -1;
  resize(); newRun();
  cancelAnimationFrame(raf); stopBg();
  if (document.hidden) startBg(); else raf = requestAnimationFrame(loopRaf);
}
export function stopGame() { active = false; cancelAnimationFrame(raf); stopBg(); }
