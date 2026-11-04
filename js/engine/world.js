/* The simulation. A world holds all game state and advances in fixed steps; players change it only through commands (commands.js).
   Nothing in js/engine touches the page, the clock or Math.random, so a world can run in a browser, in Node (tests, the balance bot)
   or on a server, and the same seed plus the same commands always gives the same result. */
import { HEROES, STAGES, COLS, ROWS, LINEUP_SIZE } from '../content/data.js';
import { itemMods } from '../content/items.js';
import { createBus } from '../core/bus.js';
import { talentMods } from '../content/talents.js';
import { resolve, heroStats } from './stats.js';
import { attack, dotDamage } from './combat.js';
import { BEHAVIORS } from './behaviors.js';
import { spawnEnemy, updateEnemies, sweep, waveCount, spawnDelay, waveEnemyType } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { updateZones } from './zones.js';
import { createMeter } from './meter.js';
import { createRng } from './rng.js';
import { attackMult, gainEnergy } from './ultimates.js';
import { gainXp } from './levels.js';

export const STEP = 1 / 60;          /* seconds of game time per step */
export const ENGINE_VERSION = 10;     /* bump when a rule change would make old command logs play out differently */

function genPath(rng) {
  let x = 0, y = 1 + rng.int(ROWS - 2); const p = [[x, y]];
  while (x < COLS - 1) {
    const nx = Math.min(COLS - 1, x + 2 + rng.int(3));
    while (x < nx) { x++; p.push([x, y]); }
    if (x >= COLS - 1) break;
    let ny; do { ny = rng.int(ROWS); } while (Math.abs(ny - y) < 2);
    while (y !== ny) { y += Math.sign(ny - y); p.push([x, y]); }
  }
  return p;
}

/* Checks a lineup: up to LINEUP_SIZE different, playable heroes. Returns a clean copy, or the full roster if it is empty. */
export function cleanLineup(lineup) {
  const out = [];
  for (const id of lineup || []) if (HEROES.some(h => h.id === id) && !out.includes(id) && out.length < LINEUP_SIZE) out.push(id);
  return out.length ? out : HEROES.slice(0, LINEUP_SIZE).map(h => h.id);
}

/* lineup: the hero ids brought into the match. items: { heroId: itemType } equipped before the match. */
export function createWorld({ seed = 1, stage = 1, talents = [], lineup = null, items = {}, record = true } = {}) {
  const def = STAGES[stage - 1];
  if (!def) throw new Error('Unknown stage ' + stage);
  const root = createRng(seed), rng = { path: root.fork('path'), relic: root.fork('relic'), combat: root.fork('combat') };
  const team = cleanLineup(lineup), equipped = {};
  for (const id of team) if (items && items[id]) equipped[id] = items[id];
  const path = genPath(rng.path), mods = [...talentMods(talents), ...itemMods(equipped)];
  const w = {
    seed: seed >>> 0, stageN: stage, stage: def, maxWave: def.waves, rng, path, pathSet: new Set(path.map(c => c.join(','))),
    tick: 0, phase: 'build', won: false, auto: false, autoT: 3, picking: false, pick: null,
    gold: 100 + resolve(0, 'startGold', mods), lives: 20 + resolve(0, 'startLives', mods),
    wave: 0, spawnLeft: 0, spawnT: 0, kills: 0, nextHeroId: 1,
    heroes: [], enemies: [], projs: [], zones: [], mods, relics: [], relicsBought: 0, banned: new Set(),
    ev: createBus(), fx: null, gs: null, talents: [...talents], lineup: team, items: equipped,
    log: record ? { v: 1, ver: ENGINE_VERSION, seed: seed >>> 0, stage, talents: [...talents], lineup: [...team], items: { ...equipped }, commands: [], ticks: 0 } : null
  };
  w.hit = (hero, e, amount, type) => hit(w, hero, e, amount, type);
  w.attack = (hero, e, scale, rate) => attack(w, hero, e, scale, rate);
  w.dot = (src, e, amount, type) => dotDamage(w, src, e, amount, type);
  w.attackMult = (h, target) => attackMult(w, h, target);
  w.gainEnergy = (h, amount) => gainEnergy(h, amount);
  /* Gold for a hero's next evolution, or null when it has none left. */
  w.evolveCost = h => { const e = (h.base || h.def).evolutions[h.tier]; return e ? Math.round(e.cost * w.gs.evolveCost) : null; };
  w.relicCost = () => Math.round(0.6 * (80 + 40 * w.relicsBought));
  w.pickCost = () => Math.max(1, Math.round(0.25 * w.pick.paid * Math.pow(1.05, w.pick.uses)));
  w.previewRange = i => resolve(HEROES[i].stats.range, 'range', w.mods, HEROES[i].tags);
  w.meter = createMeter(w.ev);
  w.ev.on('kill', ({ enemy }) => {
    w.gold += Math.round(w.gs.bounty * enemy.def.bounty); w.kills++;
    for (const h of w.heroes) gainXp(w, h, enemy.def.xp || 0);   /* every hero on the field learns from every kill */
  });
  w.statsFor = h => statsFor(w, h);
  w.addBuff = (h, id, name, mods, seconds) => addBuff(w, h, id, name, mods, seconds);
  w.ev.on('escape', ({ enemy }) => { w.lives = Math.max(0, w.lives - enemy.def.leak); if (w.lives <= 0) endRun(w, false); });
  recalc(w);
  return w;
}

/* Central damage function: all damage ends here (already reduced by armor and resistances, see combat.js), so the meter,
   kills and gold hook in one place. Heroes attack through w.attack(); damage over time comes through w.dot(). */
export function hit(w, hero, e, amount, type = 'physical') {
  if (e.dead || !(amount > 0)) return;
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount; if (hero) e.last = hero;
  if (hero) w.ev.emit('damage', { hero, enemy: e, amount: dealt, type });
  if (e.hp <= 0) { e.dead = true; w.ev.emit('kill', { hero: hero || e.last, enemy: e }); }
}

/* Timed buffs on a hero (Frenzy, Rally): { id, name, mods, t }. Giving a buff the hero already has refreshes it instead
   of stacking. Stats are recomputed when a buff starts or ends. */
export function addBuff(w, h, id, name, mods, seconds) {
  const list = (h.buffs ||= []), cur = list.find(b => b.id === id);
  if (cur) { cur.t = Math.max(cur.t, seconds); return; }
  list.push({ id, name, t: seconds, mods: mods.map(m => ({ ...m, scope: ['all'], source: name, ri: -5 })) });
  statsFor(w, h);
}
function tickBuffs(w, h, dt) {
  if (!h.buffs || !h.buffs.length) return;
  let changed = false, j = 0;
  for (const b of h.buffs) { if ((b.t -= dt) > 0) h.buffs[j++] = b; else changed = true; }
  h.buffs.length = j;
  if (changed) statsFor(w, h);
}

/* Recomputes cached numbers after anything that changes modifiers (relics, talents at start). */
export function recalc(w) {
  w.gs = {
    bounty: resolve(5, 'bounty', w.mods), evolveCost: Math.max(0.25, resolve(1, 'evolveCost', w.mods)),
    waveGold: resolve(1, 'waveGold', w.mods), interest: resolve(0, 'interest', w.mods), interestCap: resolve(0, 'interestCap', w.mods),
    relicLuck: resolve(0, 'relicLuck', w.mods)
  };
  for (const h of w.heroes) statsFor(w, h);
}
/* A hero's stats: the shared modifiers (talents, items, relics) plus its own (evolutions, level, timed buffs). */
export function statsFor(w, h) {
  let own = h.lvlMods && h.lvlMods.length ? h.mods.concat(h.lvlMods) : h.mods;
  if (h.buffs && h.buffs.length) for (const b of h.buffs) own = own.concat(b.mods);
  h.s = heroStats(h.def, own.length ? w.mods.concat(own) : w.mods);
  if (h.energy > h.s.energyMax) h.energy = h.s.energyMax;
  return h.s;
}

export function startWave(w) {
  w.wave++; w.spawnLeft = waveCount(w.wave); w.spawnT = 0; w.phase = 'wave';
  w.ev.emit('waveStart', { wave: w.wave });
}

function waveCleared(w) {
  const interest = Math.min(w.gs.interestCap, Math.floor(w.gold * w.gs.interest));
  w.gold += Math.round((15 + w.wave * 3) * w.gs.waveGold) + interest;
  w.ev.emit('waveClear', { wave: w.wave });
  if (w.wave >= w.maxWave) { endRun(w, true); return; }
  w.phase = 'build'; w.autoT = 3;
}

/* Ends the run. The 'end' event is sent only once the current step has fully finished (see step), so anything that
   saves the run on 'end' sees the final tick count, and replaying that log reaches exactly the same ending. */
export function endRun(w, won) {
  if (w.phase === 'over') return;
  w.phase = 'over'; w.won = won; w.picking = false; w.pick = null;
  w.endPending = { won };
}

/* Advances the game by one step. Returns false (and does nothing) while the game is over or waiting on a relic choice. */
export function step(w) {
  if (w.phase === 'over' || w.picking) return false;
  if (w.phase === 'build' && w.auto && (w.autoT -= STEP) <= 0) startWave(w);
  if (w.phase === 'wave' && w.spawnLeft > 0 && (w.spawnT -= STEP) <= 0) {
    spawnEnemy(w, waveEnemyType(w.wave, w.spawnLeft)); w.spawnLeft--; w.spawnT = spawnDelay(w.wave);
  }
  updateEnemies(w, STEP);
  for (const h of w.heroes) {
    tickBuffs(w, h, STEP);
    if (h.s.energyPerSecond > 0 && w.phase === 'wave') gainEnergy(h, h.s.energyPerSecond * STEP);
    BEHAVIORS[h.def.kind].update(w, h, STEP);
  }
  updateProjectiles(w, STEP);
  updateZones(w, STEP);
  sweep(w.enemies);
  if (w.phase === 'wave' && w.spawnLeft === 0 && !w.enemies.length) waveCleared(w);
  w.tick++;
  if (w.endPending) { const e = w.endPending; w.endPending = null; w.ev.emit('end', e); }
  return true;
}

export const summary = w => ({ waves: w.wave, kills: w.kills, won: w.won, over: w.phase === 'over', lives: w.lives, gold: w.gold, ticks: w.tick });
