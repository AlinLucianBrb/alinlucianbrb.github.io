import { T } from '../content/data.js';
import { tickEffects } from './effects.js';

/* Enemy types. hp and speed are multipliers on the wave's base values; bounty multiplies kill gold; leak is the lives lost if it reaches the gate.
   armor and res (resistances by damage type, 0 to 0.75) are their defenses; all 0 for now, ready for tougher enemies and bosses.
   Add a type here, then return it from waveEnemyType. */
export const ENEMIES = {
  grunt:  { name: 'Grunt',  color: '#d1564d', radius: 10, hp: 1,   speed: 1,   bounty: 1,   leak: 1 },
  brute:  { name: 'Brute',  color: '#8c3b8f', radius: 14, hp: 3,   speed: 0.6, bounty: 2.5, leak: 2 },
  runner: { name: 'Runner', color: '#e8c547', radius: 8,  hp: 0.5, speed: 1.5, bounty: 0.8, leak: 1 }
};
export const waveCount = w => 5 + w * 2;
export const spawnDelay = w => Math.max(0.35, 0.85 - w * 0.02);
/* i counts down from the wave size to 1, so the mix is the same every time. */
export function waveEnemyType(w, i) {
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
  const hp = Math.max(1, Math.round(20 * st.hpMult * Math.pow(st.growth, g.wave - 1) * def.hp));
  const e = { type, def, d: 0, hp, max: hp, speed: Math.min(90, 50 + g.wave * 2) * def.speed, x: 0, y: 0, fx: null, dead: false, escaped: false, last: null,
    armor: def.armor || 0, res: { ...(def.res || {}) } };
  pathPos(g.path, 0, e);
  g.enemies.push(e);
}
export function updateEnemies(g, dt) {
  const end = g.path.length - 1.001;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.d += e.speed * tickEffects(g, e, dt) * dt;
    const i = e.d / T;
    if (i >= end) { e.dead = true; e.escaped = true; g.ev.emit('escape', { enemy: e }); continue; }
    pathPos(g.path, i, e);
  }
}
/* Removes finished items in place (no new arrays every frame). */
export function sweep(list) {
  let j = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
  list.length = j;
}
