/* The game orchestrator: owns the run state and the loop, and wires the separate pieces together.
   Heros, enemies, projectiles, effects, stats, meter, rendering and UI each live in their own module. */
import { HEROES, RARITIES, RELICS, rollRarity, COLS, ROWS, T } from './data.js';
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

let g, sel = 0, hover = null, last = 0, bestSeen = 0, auto = false, active = false, raf = 0, hooks = {}, uiT = 0;

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
  const path = genPath(), mods = talentMods(hooks.talents || []);
  g = { path, pathSet: new Set(path.map(c => c.join(','))), gold: 100 + resolve(0, 'startGold', mods), lives: 20 + resolve(0, 'startLives', mods), wave: 0, phase: 'build', speed: 1, autoT: 3, picking: false,
    heroes: [], enemies: [], projs: [], beams: [], slashes: [], mods, relics: [], relicsBought: 0, kills: 0, spawnLeft: 0, spawnT: 0,
    selected: null, best: bestSeen, ev: createBus(), gs: null };
  g.hit = hit; g.beam = (...a) => addBeam(g, ...a); g.slash = (...a) => addSlash(g, ...a);
  g.cost = i => Math.round(HEROES[i].cost * g.gs.heroCost);
  g.relicCost = () => 80 + 40 * g.relicsBought;
  g.previewRange = i => resolve(HEROES[i].stats.range, 'range', g.mods, HEROES[i].tags);
  g.meter = createMeter(g.ev);
  g.ev.on('kill', () => { g.gold += g.gs.bounty; g.kills++; });
  g.ev.on('escape', () => { if (--g.lives <= 0 && g.phase !== 'over') gameOver(); });
  g.bg = buildBackground(g);
  recalc();
  ui.hidePick(); ui.hideOver();
  ui.renderMeter(g); ui.renderInspector(g);
}

function startWave() {
  if (g.phase !== 'build' || g.picking) return;
  g.wave++; g.spawnLeft = waveCount(g.wave); g.spawnT = 0; g.phase = 'wave';
}

function waveCleared() {
  const interest = Math.min(60, Math.floor(g.gold * g.gs.interest));
  g.gold += Math.round((15 + g.wave * 3) * g.gs.waveGold) + interest;
  if (g.wave > g.best) g.best = bestSeen = g.wave;
  g.phase = 'build'; g.autoT = 3;
}

function buyRelic() {
  if (g.picking || g.phase === 'over') return;
  const c = g.relicCost();
  if (g.gold < c) return;
  g.gold -= c; g.relicsBought++;
  const pool = RELICS.slice(), offers = [];
  for (let i = 0; i < 3; i++) offers.push({ relic: pool.splice(rnd(pool.length), 1)[0], ri: rollRarity() });
  g.picking = true;
  ui.showPick(g, offers, o => {
    const m = RARITIES[o.ri].mult, r = o.relic;
    if (r.mods) for (const x of r.mods(m)) g.mods.push({ ...x, source: r.name, ri: o.ri });
    if (r.onPick) r.onPick(g, m);
    g.relics.push({ name: r.name, r: o.ri });
    g.picking = false; ui.hidePick(); recalc(); ui.renderInspector(g);
  });
}

async function gameOver() {
  g.phase = 'over';
  if (g.wave > g.best) g.best = bestSeen = g.wave;
  ui.showOver('You reached wave ' + g.wave + '.', 'Saving your run…');
  let msg = '';
  try { msg = await hooks.onRunEnd({ waves: g.wave, kills: g.kills }); } catch (e) { msg = 'Could not save your run.'; }
  ui.setOverMsg(msg || '');
}

function update(rawDt) {
  const dt = rawDt * g.speed;
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

function loop(now) {
  if (!active) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (g.phase !== 'over' && !g.picking) update(dt);
  draw(ctx, g, { hover, sel });
  ui.renderHUD(g, sel, auto);
  if ((uiT += dt) >= 0.25) { uiT = 0; ui.renderMeter(g); if (g.selected) ui.renderInspector(g); }
  raf = requestAnimationFrame(loop);
}

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
  const [cx, cy] = hover;
  const existing = g.heroes.find(t => t.cx === cx && t.cy === cy);
  if (existing) { g.selected = existing; ui.renderInspector(g); return; }
  if (g.pathSet.has(cx + ',' + cy)) return;
  const c = g.cost(sel);
  if (g.gold < c) return;
  g.gold -= c; g.selected = null;
  g.heroes.push({ type: sel, def: HEROES[sel], cx, cy, x: (cx + 0.5) * T, y: (cy + 0.5) * T, cd: 0, ramp: 0, lock: null, proj: null, dealt: 0, kills: 0, s: heroStats(HEROES[sel], g.mods) });
  ui.renderInspector(g);
});

const selectType = i => { sel = i; if (g.selected) { g.selected = null; ui.renderInspector(g); } };
const closeInspector = () => { g.selected = null; ui.renderInspector(g); };
ui.initUI({ onSelectType: selectType, onCloseInspector: closeInspector });
$('go').onclick = startWave;
$('relic').onclick = buyRelic;
$('auto').onclick = () => { auto = !auto; g.autoT = 3; };
$('spd').onclick = () => { g.speed = g.speed === 1 ? 2 : 1; };
$('newRun').onclick = () => newRun();
$('menuBtn').onclick = () => hooks.onExit();
$('overMenu').onclick = () => hooks.onExit();
addEventListener('keydown', e => {
  if (!active || e.target.tagName === 'INPUT') return;
  if (+e.key >= 1 && +e.key <= HEROES.length) selectType(+e.key - 1);
  else if (e.key.toLowerCase() === 'r') buyRelic();
  else if (e.key === 'Escape') closeInspector();
  else if (e.key === ' ' && g.phase === 'build' && !g.picking) { e.preventDefault(); startWave(); }
});

/* ---- Public API used by the Play screen ---- */
export function startGame(h) {
  hooks = h; bestSeen = h.best || 0; active = true;
  newRun();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(t => { last = t; loop(t); });
}
export function stopGame() { active = false; cancelAnimationFrame(raf); }
