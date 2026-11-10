import { T } from '../content/data.js';
import { tickEffects } from './effects.js';

/* Enemy types. hp and speed are multipliers on the wave's base values; bounty multiplies kill gold; leak is the lives lost if it reaches the gate;
   xp is what every hero on the field gains when it dies.
   Defenses: armor (against physical) and res (one resistance for every other damage type) work the same way, as a share of
   the damage blocked, and grow together: def is both, per point of THREAT, which is 0 on wave 1 and grows each wave, faster
   on harder levels (see threat). So every enemy starts with no defenses and ends a level with some; tougher kinds have more.
   (Enemy variants with more of one than the other can come later.)
   ENEMY_SPEED scales every enemy's speed (0.65: 35% slower than the first versions).
   Add a type here, then return it from waveEnemyType. */
export const ENEMIES = {
  grunt:  { name: 'Grunt',  color: '#d1564d', radius: 10, hp: 1,   speed: 1,    bounty: 1,   leak: 1,  xp: 1,  def: 0.004 },
  brute:  { name: 'Brute',  color: '#8c3b8f', radius: 14, hp: 3,   speed: 0.6,  bounty: 2.5, leak: 2,  xp: 3,  def: 0.006 },
  runner: { name: 'Runner', color: '#e8c547', radius: 8,  hp: 0.5, speed: 1.5,  bounty: 0.8, leak: 1,  xp: 1,  def: 0.003 },
  boss:   { name: 'Boss',   color: '#5b1f24', radius: 20, hp: 12,  speed: 0.45, bounty: 20,  leak: 10, xp: 25, def: 0.006, boss: true }
};
export const ENEMY_SPEED = 0.65;
/* Threat: 0 on the first wave, +1 per wave, and each level after the first adds 25% to the growth. */
export const threat = (wave, stage = 1) => Math.max(0, wave - 1) * (1 + 0.25 * (stage - 1));
const DEF_TYPES = ['arcane', 'fire', 'cold', 'lightning', 'toxic', 'holy', 'shadow'];
/* An enemy's defenses on a wave: { armor, res: { type: value } }, all the same share. Capped by RES_CAP (99%) when used. */
export function defensesFor(def, wave, stage) {
  const t = threat(wave, stage), r = (def.def || 0) * t, res = {};
  for (const k of DEF_TYPES) res[k] = r;
  return { armor: r, res };
}

/* Wave size, spawn timing and boss waves are rules the server shares: they live in js/content/rules.js. The boss is the
   wave's last enemy. */
export { waveCount, spawnDelay, isBossWave } from '../content/rules.js';
import { isBossWave } from '../content/rules.js';
/* How many boss waves a run that reached `waves` has seen (the server uses the same rule to check boss kills). */
export const bossWavesUpTo = (stage, waves) => { let n = 0; for (let i = 1; i <= Math.min(waves, stage.waves); i++) if (isBossWave(i, stage)) n++; return n; };
/* i counts down from the wave size to 1, so the mix is the same every time. */
export function waveEnemyType(w, i, stage) {
  if (i === 1 && stage && isBossWave(w, stage)) return 'boss';
  if (w >= 4 && i % 6 === 1) return 'brute';
  if (w >= 2 && i % 4 === 0) return 'runner';
  return 'grunt';
}

/* Writes the pixel position for path progress i (in cells) into out.x / out.y without allocating. */
export function pathPos(path, i, out) {
  const k = Math.floor(i), a = path[k], b = path[k + 1], f = i - k;
  out.x = (a[0] + 0.5 + (b[0] - a[0]) * f) * T;
  out.y = (a[1] + 0.5 + (b[1] - a[1]) * f) * T;
}
export function spawnEnemy(g, type) {
  const def = ENEMIES[type], st = g.stage;
  const hp = Math.max(1, Math.round(20 * st.hpMult * (g.hpMult || 1) * Math.pow(st.growth, g.wave - 1) * def.hp));   /* co-op: x players */
  const e = { type, def, d: 0, hp, max: hp, speed: Math.min(90, 50 + g.wave * 2) * def.speed * ENEMY_SPEED, x: 0, y: 0, fx: null, dead: false, escaped: false, last: null,
    ...defensesFor(def, g.wave, st.n) };
  pathPos(g.path, 0, e);
  g.enemies.push(e);
}
/* Things that can stop an enemy that reaches the gate (the Gospel Priest's Sanctuary): f(g, e) -> true if it moved the
   enemy back (it sets e.d). Kits push into this list. */
export const LEAK_GUARDS = [];
export function updateEnemies(g, dt) {
  const end = g.path.length - 1.001;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const before = e.d;
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
   a quarter of it, and each enemy can be pushed back at most KNOCKBACK.perWave pixels per wave, so knockback can never hold
   a wave forever. Returns how far it moved. */
export const KNOCKBACK = { perWave: 2 * T, boss: 0.25 };
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
