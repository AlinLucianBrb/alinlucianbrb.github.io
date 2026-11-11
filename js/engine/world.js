/* The simulation. A world holds all game state and advances in fixed steps; players change it only through commands (commands.js).
   Nothing in js/engine touches the page, the clock or Math.random, so a world can run in a browser, in Node (tests, the balance bot)
   or on a server, and the same seed plus the same commands always gives the same result. */
import { HEROES, STAGES, COLS, ROWS, LINEUP_SIZE, RELICS, RARITIES } from '../content/data.js';
import { itemMods, asItem } from '../content/items.js';
import { createBus } from '../core/bus.js';
import { talentMods } from '../content/talents.js';
import { resolve, heroStats, minionStats } from './stats.js';
import { attack, dotDamage } from './combat.js';
import { BEHAVIORS } from './behaviors.js';
import { spawnEnemy, updateEnemies, sweep, waveCount, spawnDelay, waveEnemyType } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { updateZones } from './zones.js';
import { createMeter } from './meter.js';
import { createRng } from './rng.js';
import { attackMult, gainEnergy, erupt } from './ultimates.js';
import { gainXp } from './levels.js';
import { coopHpMult } from '../content/rules.js';
import { damageTaken, EFFECT_HOOKS } from './effects.js';
import './kits/index.js';
import { cleanPaths, pathChoice, pathDef, previewMods, syncPreview, updatePreview, previewHit } from './preview.js';   /* the newer heroes' behaviors, ultimates and zones register themselves */

export const STEP = 1 / 60;          /* seconds of game time per step */
export const ENGINE_VERSION = 18;     /* bump when a rule change would make old command logs play out differently */

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

/* One player's side of a match: its heroes' lineup, talents and items, and its own gold, relics and relic choice.
   In co-op every player has one (the map, the enemies, the lives and the waves are shared; gold and relics are not). */
function makePlayer(i, { talents = [], lineup = null, items = {}, paths = {}, relics = [] } = {}) {
  const team = cleanLineup(lineup), equipped = {}, path = cleanPaths(paths, team);
  for (const id of team) if (items && items[id]) { const list = (Array.isArray(items[id]) ? items[id] : [items[id]]).filter(Boolean).map(asItem); if (list.length) equipped[id] = list; }
  /* Gear that does not fit its wearer (as it will play: its path's tags included) counts as its general version. */
  const wearerOf = id => { const d = HEROES.find(x => x.id === id), c = path[id] && pathChoice(id, path[id]); return d && { tags: c ? pathDef(d, c).tags : d.tags, rate: d.rate || 'speed' }; };
  const mods = [...talentMods(talents), ...itemMods(equipped, wearerOf)];
  return {
    i, talents: [...talents], lineup: team, paths: path, items: equipped, mods, startRelics: cleanRelics(relics), gold: 100 + resolve(0, 'startGold', mods), gs: null,
    relics: [], relicsBought: 0, banned: new Set(), picking: false, pick: null, playOnPick: false, auto: false, ready: false,
    /* Free relic rerolls and banishes for this match: they come only from talents. */
    rerolls: Math.round(resolve(0, 'rerolls', mods)), banishes: Math.round(resolve(0, 'banishes', mods))
  };
}
/* Starting relics (for experiments: the balance bot gives a player relics before the match): [{ name, ri }], known relics only. */
const cleanRelics = list => (list || []).filter(r => r && RELICS.some(x => x.name === r.name) && RARITIES[r.ri]).map(r => ({ name: r.name, ri: r.ri | 0 }));

/* The fields that belong to a player. On the world they mean player 1's (w.gold, w.relics...), so solo code reads as before. */
export const PLAYER_FIELDS = ['talents', 'lineup', 'paths', 'items', 'mods', 'gold', 'gs', 'relics', 'relicsBought', 'banned', 'picking', 'pick', 'playOnPick',
  'auto', 'ready', 'rerolls', 'banishes'];

/* lineup: the hero ids brought into the match. items: { heroId: [{ type, rarity, bonuses }] } equipped before the match
   (see js/content/items.js; a plain item type id also works, as a Common item with no bonuses).
   Co-op: players: [{ talents, lineup, items }, ...] instead, one per player (2 to 4); enemies get that many times the life. */
export function createWorld({ seed = 1, stage = 1, talents = [], lineup = null, items = {}, paths = {}, relics = [], players = null, record = true } = {}) {
  const def = STAGES[stage - 1];
  if (!def) throw new Error('Unknown stage ' + stage);
  const root = createRng(seed), rng = { path: root.fork('path'), relic: root.fork('relic'), combat: root.fork('combat'), gold: root.fork('gold') };
  const ps = (players && players.length ? players : [{ talents, lineup, items, paths, relics }]).map((p, i) => makePlayer(i, p));
  const path = genPath(rng.path), coop = ps.length > 1;
  const w = {
    seed: seed >>> 0, stageN: stage, stage: def, maxWave: def.waves, rng, path, pathSet: new Set(path.map(c => c.join(','))),
    tick: 0, phase: 'build', won: false, autoT: 3, players: ps, coop, hpMult: coopHpMult(ps.length),
    lives: 20 + ps.reduce((a, p) => a + resolve(0, 'startLives', p.mods), 0),
    wave: 0, spawnLeft: 0, spawnT: 0, kills: 0, bossKills: 0, nextHeroId: 1,
    heroes: [], enemies: [], projs: [], zones: [],
    ev: createBus(), fx: null,
    log: record ? { v: 1, ver: ENGINE_VERSION, seed: seed >>> 0, stage, talents: [...ps[0].talents], lineup: [...ps[0].lineup], paths: { ...ps[0].paths }, ...(ps[0].startRelics.length ? { relics: ps[0].startRelics.map(r => ({ ...r })) } : {}), items: JSON.parse(JSON.stringify(ps[0].items)), commands: [], ticks: 0,
      ...(coop ? { players: ps.map(p => ({ talents: [...p.talents], lineup: [...p.lineup], paths: { ...p.paths }, relics: p.startRelics.map(r => ({ ...r })), items: JSON.parse(JSON.stringify(p.items)) })) } : {}) } : null
  };
  for (const k of PLAYER_FIELDS) Object.defineProperty(w, k, { get: () => ps[0][k], set: v => { ps[0][k] = v; }, enumerable: true });
  w.ownerOf = h => ps[h.owner || 0];
  w.hit = (hero, e, amount, type, quiet) => hit(w, hero, e, amount, type, quiet);
  w.livesStart = w.lives;   /* the Heretic's blood price counts the lives lost since */
  w.attack = (hero, e, scale, rate, as, s) => {
    const r = attack(w, hero, e, scale, rate, as, s);
    if (hero.preview && !hero.echoOf) previewHit(w, hero, e);   /* the Sentinel's push, the Inquisitor's Verdict */
    return r;
  };
  w.dot = (src, e, amount, type) => dotDamage(w, src, e, amount, type);
  w.attackMult = (h, target) => attackMult(w, h, target);
  w.gainEnergy = (h, amount) => gainEnergy(h, amount);
  /* Gold for a hero's next evolution, or null when it has none left (its owner's talents can make it cheaper). */
  w.evolveCost = h => { const e = (h.base || h.def).evolutions[h.tier]; return e ? Math.round(e.cost * w.ownerOf(h).gs.evolveCost) : null; };
  /* The level a hero needs for its next evolution: the step's level, lowered by Training talents (never below 1). */
  w.evolveLevel = h => { const e = (h.base || h.def).evolutions[h.tier]; return e ? Math.max(1, (e.level || 1) + w.ownerOf(h).gs.evolveLevel) : null; };
  /* Each relic costs 12 more than the one before (60% of 80 + 20 per relic bought), per player. */
  w.relicCost = (p = ps[0]) => Math.max(1, Math.round(0.6 * (80 + 20 * p.relicsBought) * p.gs.relicCost));   /* Merchant talents make it cheaper */
  w.previewRange = (i, p = ps[0]) => resolve(HEROES[i].stats.range, 'range', p.mods, HEROES[i].tags);
  w.meter = createMeter(w.ev);
  w.ev.on('kill', ({ enemy }) => {
    for (const p of ps) p.gold += Math.round(p.gs.bounty * enemy.def.bounty) + bonusGold(w, p);   /* every player is paid for every kill */
    w.kills++;
    if (enemy.def.boss) w.bossKills++;   /* each boss defeated guarantees an item at the end of the match (finish_run) */
    for (const h of w.heroes) gainXp(w, h, enemy.def.xp || 0);   /* every hero on the field learns from every kill */
  });
  w.statsFor = h => statsFor(w, h);
  w.addBuff = (h, id, name, mods, seconds, by) => addBuff(w, h, id, name, mods, seconds, by);
  w.erupt = h => erupt(w, h);   /* Naturist Druid's spikes */
  /* A boss that gets through on the last wave ends the run: a level is only won by beating its final boss. */
  w.ev.on('escape', ({ enemy }) => {
    w.lives = Math.max(0, w.lives - enemy.def.leak);
    if (w.lives <= 0 || (enemy.def.boss && w.wave >= w.maxWave)) endRun(w, false);
  });
  /* Starting relics count as if picked before the first wave (same effect as the choose command). */
  for (const p of ps) for (const r of p.startRelics) {
    const def = RELICS.find(x => x.name === r.name), m = RARITIES[r.ri].mult;
    if (def.mods) for (const x of def.mods(m)) p.mods.push({ ...x, source: def.name, ri: r.ri });
    if (def.onPick) def.onPick(w, m);
    p.relics.push({ name: def.name, r: r.ri });
  }
  recalc(w);
  return w;
}

/* Prospector: each copy is a 25% (Common) to 100% (Epic) chance of +2 gold per kill. Copies add up; every full 100% is a
   sure +2, and the rest is a chance of 2 more. Uses its own random stream so it never changes combat rolls. */
export const BONUS_GOLD = 2;
function bonusGold(w, p) {
  const c = p.gs.bountyChance;
  if (!(c > 0)) return 0;
  const sure = Math.floor(c);
  return BONUS_GOLD * (sure + (w.rng.gold.next() < c - sure ? 1 : 0));
}

/* Central damage function: all damage ends here (already reduced by armor and resistances, see combat.js), so the meter,
   kills and gold hook in one place. Heroes attack through w.attack(); damage over time comes through w.dot().
   Curses make the enemy take more (damageTaken). quiet: damage passed on by an effect (the Witch Doctor's link), which
   must not set off the effects again. */
export function hit(w, hero, e, amount, type = 'physical', quiet = false) {
  if (e.dead || !(amount > 0)) return;
  amount *= damageTaken(e);
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount; if (hero) e.last = hero;
  if (hero) w.ev.emit('damage', { hero, enemy: e, amount: dealt, type });
  if (!quiet && e.fx) for (const id in e.fx) { const f = EFFECT_HOOKS.damage[id]; if (f) f(w, hero, e, dealt, type, e.fx[id]); }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true; w.ev.emit('kill', { hero: hero || e.last, enemy: e });
    if (e.fx) for (const id in e.fx) { const f = EFFECT_HOOKS.death[id]; if (f) f(w, e, e.fx[id]); }
  }
}

/* Timed buffs on a hero (Frenzy, Rally): { id, name, mods, t }. Giving a buff the hero already has refreshes it instead
   of stacking. Stats are recomputed when a buff starts or ends. */
/* by: the hero that gives it (default: the hero itself); its duration stat (the Duration relic) makes the buff last longer. */
export function addBuff(w, h, id, name, mods, seconds, by = h) {
  if (by && by.s && by.s.duration > 0) seconds *= by.s.duration;
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

/* Recomputes cached numbers after anything that changes modifiers (relics, talents at start), for every player. */
export function recalc(w) {
  for (const p of w.players) {
    const m = p.mods;
    p.gs = {
      bounty: resolve(5, 'bounty', m), evolveCost: Math.max(0.25, resolve(1, 'evolveCost', m)),
      waveGold: resolve(1, 'waveGold', m), interest: resolve(0, 'interest', m), interestCap: resolve(0, 'interestCap', m),
      relicLuck: resolve(0, 'relicLuck', m), bountyChance: resolve(0, 'bountyChance', m),
      heroXp: Math.max(0, resolve(1, 'heroXp', m)), speed3x: resolve(0, 'speed3x', m) > 0,
      relicCost: Math.max(0.25, resolve(1, 'relicCost', m)), relicOffers: Math.max(0, resolve(0, 'relicOffers', m)),
      heroStartLevel: Math.max(0, Math.round(resolve(0, 'heroStartLevel', m))), evolveLevel: Math.min(0, Math.round(resolve(0, 'evolveLevel', m)))
    };
  }
  for (const h of w.heroes) statsFor(w, h);
}
/* A hero's stats: its owner's modifiers (talents, items, relics) plus its own (evolutions, level, timed buffs). */
export function statsFor(w, h) {
  const shared = w.players[h.owner || 0].mods;
  let own = h.lvlMods && h.lvlMods.length ? h.mods.concat(h.lvlMods) : h.mods;
  if (h.buffs && h.buffs.length) for (const b of h.buffs) own = own.concat(b.mods);
  if (h.preview) { h.pvMods = previewMods(h); own = own.concat(h.pvMods); }   /* a path's preview, at the hero's level */
  const all = own.length ? shared.concat(own) : shared;
  h.s = heroStats(h.def, all);
  if (h.preview) syncPreview(h, all);
  h.ms = h.def.tags.includes('minion') ? minionStats(h.s) : null;   /* its minion's stats (the wolf) */
  if (h.energy > h.s.energyMax) h.energy = h.s.energyMax;
  return h.s;
}

export function startWave(w) {
  w.wave++; w.spawnLeft = waveCount(w.wave); w.spawnT = 0; w.phase = 'wave';
  for (const p of w.players) p.ready = false;
  w.ev.emit('waveStart', { wave: w.wave });
}

function waveCleared(w) {
  for (const p of w.players) {   /* each player's own wave gold and interest */
    const interest = Math.min(Math.floor(p.gs.interestCap + 1e-9), Math.floor(p.gold * p.gs.interest + 1e-9));   /* 1e-9: float noise */
    p.gold += Math.round((15 + w.wave * 3) * p.gs.waveGold) + interest;
  }
  w.ev.emit('waveClear', { wave: w.wave });
  if (w.wave >= w.maxWave) { endRun(w, true); return; }
  w.phase = 'build'; w.autoT = 3;
}

/* Ends the run. The 'end' event is sent only once the current step has fully finished (see step), so anything that
   saves the run on 'end' sees the final tick count, and replaying that log reaches exactly the same ending. */
export function endRun(w, won) {
  if (w.phase === 'over') return;
  w.phase = 'over'; w.won = won;
  for (const p of w.players) { p.picking = false; p.pick = null; }
  w.endPending = { won };
}

/* Advances the game by one step. Returns false (and does nothing) while the game is over, or, solo, waiting on a relic
   choice (unless the player chose to keep playing while choosing: playOnPick). A co-op match never waits for one player.
   The next wave starts by itself when every player has Auto-start on (after the countdown). */
export function step(w) {
  if (w.phase === 'over' || (!w.coop && w.picking && !w.playOnPick)) return false;
  if (w.phase === 'build' && w.players.every(p => p.auto) && (w.autoT -= STEP) <= 0) startWave(w);
  if (w.phase === 'wave' && w.spawnLeft > 0 && (w.spawnT -= STEP) <= 0) {
    spawnEnemy(w, waveEnemyType(w.wave, w.spawnLeft, w.stage)); w.spawnLeft--; w.spawnT = spawnDelay(w.wave);
  }
  updateEnemies(w, STEP);
  for (const h of w.heroes) {
    tickBuffs(w, h, STEP);
    if (h.s.energyPerSecond > 0 && w.phase === 'wave') gainEnergy(h, h.s.energyPerSecond * STEP);
    BEHAVIORS[h.def.kind].update(w, h, STEP);
    if (h.preview) updatePreview(w, h, STEP);
  }
  updateProjectiles(w, STEP);
  updateZones(w, STEP);
  sweep(w.enemies);
  if (w.phase === 'wave' && w.spawnLeft === 0 && !w.enemies.length) waveCleared(w);
  w.tick++;
  if (w.endPending) { const e = w.endPending; w.endPending = null; w.ev.emit('end', e); }
  return true;
}

export const summary = w => ({ waves: w.wave, kills: w.kills, bosses: w.bossKills, won: w.won, over: w.phase === 'over', lives: w.lives, gold: w.gold, ticks: w.tick });

/* A player's view of the world, for the screen: the player's own fields (gold, relics, relic choice...) on top of the shared
   world (map, heroes, enemies, waves). Solo, player 1's view reads exactly like the world. */
export function playerView(w, i = 0) {
  const p = w.players[i] || w.players[0], own = new Set(PLAYER_FIELDS);
  return new Proxy(w, {
    get: (t, k) => (own.has(k) ? p[k] : k === 'me' ? p : k === 'relicCost' ? () => w.relicCost(p) : k === 'previewRange' ? hi => w.previewRange(hi, p)
      : k === 'unitOf' ? type => w.heroes.find(h => h.type === type && (h.owner || 0) === p.i) : k === 'mine' ? h => !!h && (h.owner || 0) === p.i : t[k]),
    set: (t, k, v) => { if (own.has(k)) p[k] = v; else t[k] = v; return true; }
  });
}
