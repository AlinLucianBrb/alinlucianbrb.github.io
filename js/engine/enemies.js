import { T } from '../content/data.js';
import { tickEffects, tickHold } from './effects.js';

/* Enemy types. hp and speed are multipliers on the wave's base values; bounty multiplies kill gold; leak is the lives lost if it reaches the gate;
   xp is what every hero on the field gains when it dies.
   Defenses: armor (against physical) and res (one resistance for every other damage type) work the same way, as a share of
   the damage blocked, and grow together: def is both, per point of THREAT, which is 0 on wave 1 and grows each wave, faster
   on harder levels (see threat). So every enemy starts with no defenses and ends a level with some; tougher kinds have more.
   (Enemy variants with more of one than the other can come later.)
   Special enemies (the waves they come on are SPECIALS in js/content/rules.js): ability is what they do (its rules are in
   enemy-abilities.js), ccImmune cannot be frozen, rooted or stunned. cc: crowd control resistance to begin with (see CC).
   A minion is summoned: it gives no gold or XP and does not count as a kill.
   ENEMY_SPEED scales every enemy's speed (0.65: 35% slower than the first versions).
   Add a type here, then return it from waveEnemyType. */
const SUMMONED = { radius: 20, hp: 7.2, speed: 0.45, bounty: 0, leak: 5, xp: 25, def: 0.006, cc: 0.3, boss: true, summoned: true };
export const ENEMIES = {
  grunt:  { name: 'Grunt',  color: '#d1564d', radius: 10, hp: 1,   speed: 1,    bounty: 1,   leak: 1,  xp: 1,  def: 0.004 },
  brute:  { name: 'Brute',  color: '#8c3b8f', radius: 14, hp: 3,   speed: 0.6,  bounty: 2.5, leak: 2,  xp: 3,  def: 0.006 },
  runner: { name: 'Runner', color: '#e8c547', radius: 8,  hp: 0.5, speed: 1.5,  bounty: 0.8, leak: 1,  xp: 1,  def: 0.003 },
  boss:   { name: 'Boss',   color: '#5b1f24', radius: 20, hp: 12,  speed: 0.45, bounty: 20,  leak: 10, xp: 25, def: 0.006, cc: 0.3, boss: true },
  stunner:  { name: 'Stunner',  color: '#e8d24a', radius: 11, hp: 1.6, speed: 0.9,  bounty: 2,   leak: 1, xp: 2, def: 0.005,
    ability: { id: 'stun', range: 100, seconds: 1.5, cooldown: 6, first: 2 } },
  regener:  { name: 'Regenerator', color: '#57c46a', radius: 13, hp: 2, speed: 0.8, bounty: 2,   leak: 1, xp: 2, def: 0.004,
    ability: { id: 'regen', base: 0.01, missing: 0.04 } },
  immune:   { name: 'Unstoppable', color: '#dfe6ee', radius: 11, hp: 1.5, speed: 1, bounty: 1.5, leak: 1, xp: 2, def: 0.005, ccImmune: true },
  summoner: { name: 'Summoner', color: '#a45bd6', radius: 13, hp: 3,   speed: 0.6,  bounty: 4,   leak: 2, xp: 4, def: 0.004,
    ability: { id: 'summon', minion: 'minion', count: 3, casts: 3, cooldown: 8, first: 1 } },
  tough:    { name: 'Ironhide', color: '#7c8794', radius: 14, hp: 4,   speed: 1,    bounty: 3,   leak: 2, xp: 4, def: 0.009 },
  /* Bosses summoned from the match shop (js/content/shop.js; boss-gimmicks.js): 60% of a boss's life, paid by their prize. */
  bossSplitter: { ...SUMMONED, name: 'Splitter', color: '#5f8f4a', ability: { id: 'split', at: 0.5, into: 'bossHalf' } },
  bossHalf:     { ...SUMMONED, name: 'Half',     color: '#5f8f4a', radius: 16, leak: 3, xp: 10 },
  bossCharger:  { ...SUMMONED, name: 'Charger',  color: '#c9622e', ability: { id: 'enrage', more: 1.5 } },
  bossWarded:   { ...SUMMONED, name: 'Warded',   color: '#4a7fb8', ability: { id: 'ward', every: 5, resist: 0.75 } },
  bossThief:    { ...SUMMONED, name: 'Thief',    color: '#c9a227', ability: { id: 'steal', every: 3, gold: 10 } },
  bossBlinker:  { ...SUMMONED, name: 'Blinker',  color: '#8a5fd0', ability: { id: 'blink', at: [0.75, 0.5, 0.25], tiles: 2 } },
  minion:   { name: 'Minion',   color: '#8a5fb0', radius: 8,  hp: 0.4, speed: 0.9,  bounty: 0,   leak: 1, xp: 0, def: 0.003, minion: true }
};
export const ENEMY_SPEED = 0.65;
/* Threat: 0 on the first wave, +1 per wave, and each level after the first adds THREAT_PER_LEVEL to the growth: so that a grunt on
   the last wave of 5-5 has CAMPAIGN_CAP (60%) defenses. In the campaign no enemy has more than that; endless goes up to RES_CAP. */
export const CAMPAIGN_CAP = 0.6, THREAT_PER_LEVEL = 0.0741;
export const threat = (wave, stage = 1) => Math.max(0, wave - 1) * (1 + THREAT_PER_LEVEL * (stage - 1));
/* Crowd control (freeze, root, stun; effects.js): nobody can be held forever. In every `interval` seconds an enemy can be
   held for at most `hold` seconds, less its resistance: the type's own (cc) plus perThreat per point of threat, up to max. */
export const CC = { interval: 5, hold: 2.5, perThreat: 0.004, max: 0.9 };
export const ccResFor = (def, wave, stage) => Math.min(CC.max, (def.cc || 0) + CC.perThreat * threat(wave, stage));
const DEF_TYPES = ['arcane', 'fire', 'cold', 'lightning', 'toxic', 'holy', 'shadow'];
/* An enemy's defenses on a wave: { armor, res: { type: value } }, all the same share. Capped by RES_CAP (99%) when used. */
export function defensesFor(def, wave, stage, cap = CAMPAIGN_CAP) {
  const t = threat(wave, stage), r = Math.min(cap, (def.def || 0) * t), res = {};
  for (const k of DEF_TYPES) res[k] = r;
  return { armor: r, res };
}

/* Wave size, spawn timing and boss waves are rules the server shares: they live in js/content/rules.js. The boss is the
   wave's last enemy. */
export { waveCount, spawnDelay, isBossWave } from '../content/rules.js';
import { isBossWave, specialsOf, waveCount } from '../content/rules.js';
import { CURSE } from '../content/shop.js';
/* A wave cursed by a gamble (w.curse): how many curses are on the current wave. */
export const cursesOn = g => (g.curse && g.curse.wave === g.wave ? g.curse.n : 0);
/* How many boss waves a run that reached `waves` has seen (the server uses the same rule to check boss kills). */
export const bossWavesUpTo = (stage, waves) => { let n = 0; for (let i = 1; i <= Math.min(waves, stage.waves); i++) if (isBossWave(i, stage)) n++; return n; };
/* i counts down from the wave size to 1, so the mix is the same every time. */
function specialAt(w, i) {
  const list = specialsOf(w), n = waveCount(w);
  return list.find((_, k) => i === n - Math.floor((k + 0.5) * (n - 1) / list.length)) || null;   /* never i = 1: the boss's place */
}
export function waveEnemyType(w, i, stage) {
  if (i === 1 && stage && isBossWave(w, stage)) return 'boss';
  const special = specialAt(w, i);
  if (special) return special;
  if (w >= 4 && i % 6 === 1) return 'brute';
  if (w >= 2 && i % 4 === 0) return 'runner';
  return 'grunt';
}

/* Writes the pixel position for path progress i (in cells) into out.x / out.y without allocating. Progress past either end
   of the path is held at that end (the Earthcaller's crack can reach a little past an enemy at the gate). */
export function pathPos(path, i, out) {
  const last = path.length - 1, c = Math.max(0, Math.min(last, i));
  const k = Math.min(Math.floor(c), Math.max(0, last - 1)), a = path[k], b = path[Math.min(last, k + 1)], f = c - k;
  out.x = (a[0] + 0.5 + (b[0] - a[0]) * f) * T;
  out.y = (a[1] + 0.5 + (b[1] - a[1]) * f) * T;
}
/* at: how far along the path it starts, px (summoned minions). Returns the enemy. */
export function spawnEnemy(g, type, at = 0) {
  const def = ENEMIES[type], st = g.stage;
  const hp = Math.max(1, Math.round(20 * st.hpMult * (g.hpMult || 1) * Math.pow(st.growth, g.wave - 1) * def.hp * (1 + CURSE.life * cursesOn(g)) * (g.fxm && !def.boss ? g.fxm.life : 1)));   /* co-op: x players */
  const e = { type, def, d: at, hp, max: hp, speed: Math.min(90, 50 + g.wave * 2) * def.speed * ENEMY_SPEED * (g.fxm ? g.fxm.enemySpeed : 1), x: 0, y: 0, fx: null, dead: false, escaped: false, last: null,
    ccRes: ccResFor(def, g.wave, st.n), ...defensesFor(def, g.wave, st.n) };
  pathPos(g.path, at / T, e);
  g.enemies.push(e);
  return e;
}
/* Things that can stop an enemy that reaches the gate (the Gospel Priest's Sanctuary): f(g, e) -> true if it moved the
   enemy back (it sets e.d). Kits push into this list. */
export const LEAK_GUARDS = [];
export function updateEnemies(g, dt) {
  const end = g.path.length - 1.001;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const before = e.d;
    tickHold(e, dt, CC);
    e.d += e.speed * tickEffects(g, e, dt) * dt;
    /* A barricade (zones.js) stops enemies that reach it; enemies already past it keep going. */
    if (g.zones) for (const z of g.zones) if (z.type === 'barrier' && before <= z.d && e.d > z.d) e.d = z.d;
    const i = e.d / T;
    if (i >= end && LEAK_GUARDS.some(f => f(g, e))) { pathPos(g.path, e.d / T, e); continue; }   /* turned back (Sanctuary) */
    if (i >= end) { e.dead = true; e.escaped = true; g.ev.emit('escape', { enemy: e }); continue; }
    pathPos(g.path, i, e);
  }
}
/* Knockback (Crusader, Earthcaller): pushes an enemy back along the path by px pixels, never past the entrance. Bosses move
   KNOCKBACK.boss of it, and each enemy can be pushed back at most KNOCKBACK.perWave pixels per wave, so knockback can never hold
   a wave forever. Returns how far it moved. */
export const KNOCKBACK = { perWave: 3 * T, boss: 0.35 };   /* Nov 12: knockbacks 50% stronger, up to 3 tiles a wave (was 2), bosses 35% (was 25%) */
export function knockback(g, e, px) {
  if (e.dead || !(px > 0)) return 0;
  if (e.def.boss) px *= KNOCKBACK.boss;
  if (e.kbWave !== g.wave) { e.kbWave = g.wave; e.kb = 0; }
  const d = Math.min(px, KNOCKBACK.perWave - e.kb, e.d);
  if (d <= 0) return 0;
  e.d -= d; e.kb += d;
  pathPos(g.path, e.d / T, e);
  return d;
}

/* Removes finished items in place (no new arrays every frame). */
export function sweep(list) {
  let j = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
  list.length = j;
}
