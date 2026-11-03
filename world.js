/* The simulation. A world holds all game state and advances in fixed steps; players change it only through commands (commands.js).
   Nothing in js/engine touches the page, the clock or Math.random, so a world can run in a browser, in Node (tests, the balance bot)
   or on a server, and the same seed plus the same commands always gives the same result. */
import { HEROES, STAGES, COLS, ROWS } from '../content/data.js';
import { createBus } from '../core/bus.js';
import { talentMods } from '../content/talents.js';
import { resolve, heroStats } from './stats.js';
import { applyEffect } from './effects.js';
import { BEHAVIORS } from './behaviors.js';
import { spawnEnemy, updateEnemies, sweep, waveCount, spawnDelay, waveEnemyType } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { createMeter } from './meter.js';
import { createRng } from './rng.js';

export const STEP = 1 / 60;          /* seconds of game time per step */
export const ENGINE_VERSION = 1;     /* bump when a rule change would make old command logs play out differently */

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

export function createWorld({ seed = 1, stage = 1, talents = [], record = true } = {}) {
  const def = STAGES[stage - 1];
  if (!def) throw new Error('Unknown stage ' + stage);
  const root = createRng(seed), rng = { path: root.fork('path'), relic: root.fork('relic') };
  const path = genPath(rng.path), mods = talentMods(talents);
  const w = {
    seed: seed >>> 0, stageN: stage, stage: def, maxWave: def.waves, rng, path, pathSet: new Set(path.map(c => c.join(','))),
    tick: 0, phase: 'build', won: false, auto: false, autoT: 3, picking: false, pick: null,
    gold: 100 + resolve(0, 'startGold', mods), lives: 20 + resolve(0, 'startLives', mods),
    wave: 0, spawnLeft: 0, spawnT: 0, kills: 0, nextHeroId: 1,
    heroes: [], enemies: [], projs: [], mods, relics: [], relicsBought: 0, banned: new Set(),
    ev: createBus(), fx: null, gs: null, talents: [...talents],
    log: record ? { v: 1, ver: ENGINE_VERSION, seed: seed >>> 0, stage, talents: [...talents], commands: [], ticks: 0 } : null
  };
  w.hit = (hero, e, amount) => hit(w, hero, e, amount);
  w.cost = i => Math.round(HEROES[i].cost * w.gs.heroCost);
  w.relicCost = () => Math.round(0.6 * (80 + 40 * w.relicsBought));
  w.pickCost = () => Math.max(1, Math.round(0.25 * w.pick.paid * Math.pow(1.05, w.pick.uses)));
  w.previewRange = i => resolve(HEROES[i].stats.range, 'range', w.mods, HEROES[i].tags);
  w.meter = createMeter(w.ev);
  w.ev.on('kill', ({ enemy }) => { w.gold += Math.round(w.gs.bounty * enemy.def.bounty); w.kills++; });
  w.ev.on('escape', ({ enemy }) => { w.lives = Math.max(0, w.lives - enemy.def.leak); if (w.lives <= 0) endRun(w, false); });
  recalc(w);
  return w;
}

/* Central damage function: every hit goes through here, so effects, the meter and kills all hook in one place. */
export function hit(w, hero, e, amount) {
  if (e.dead) return;
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount; e.last = hero;
  if (hero) {
    w.ev.emit('damage', { hero, enemy: e, amount: dealt });
    const ap = hero.def.applies;
    if (ap) for (const id in ap) applyEffect(e, id, hero.s[ap[id]]);
  }
  if (e.hp <= 0) { e.dead = true; w.ev.emit('kill', { hero, enemy: e }); }
}

/* Recomputes cached numbers after anything that changes modifiers (relics, talents at start). */
export function recalc(w) {
  w.gs = {
    bounty: resolve(5, 'bounty', w.mods), heroCost: Math.max(0.25, resolve(1, 'heroCost', w.mods)),
    waveGold: resolve(1, 'waveGold', w.mods), interest: resolve(0, 'interest', w.mods)
  };
  for (const h of w.heroes) h.s = heroStats(h.def, w.mods);
}

export function startWave(w) {
  w.wave++; w.spawnLeft = waveCount(w.wave); w.spawnT = 0; w.phase = 'wave';
  w.ev.emit('waveStart', { wave: w.wave });
}

function waveCleared(w) {
  const interest = Math.min(60, Math.floor(w.gold * w.gs.interest));
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
  for (const h of w.heroes) BEHAVIORS[h.def.kind].update(w, h, STEP);
  updateProjectiles(w, STEP);
  sweep(w.enemies);
  if (w.phase === 'wave' && w.spawnLeft === 0 && !w.enemies.length) waveCleared(w);
  w.tick++;
  if (w.endPending) { const e = w.endPending; w.endPending = null; w.ev.emit('end', e); }
  return true;
}

export const summary = w => ({ waves: w.wave, kills: w.kills, won: w.won, over: w.phase === 'over', lives: w.lives, gold: w.gold, ticks: w.tick });
