import { T } from './data.js';
import { tickEffects } from './effects.js';

/* Enemy types and wave rules. Add a type here, then return it from waveEnemyType. */
export const ENEMIES = {
  grunt: { color: '#d1564d', radius: 10, hp: w => Math.round(20 * Math.pow(1.2, w - 1)), speed: w => Math.min(90, 50 + w * 2) }
};
export const waveCount = w => 5 + w * 2;
export const spawnDelay = w => Math.max(0.35, 0.85 - w * 0.02);
export const waveEnemyType = (w, i) => 'grunt';

/* Writes the pixel position for path progress i (in cells) into out.x / out.y without allocating. */
export function pathPos(path, i, out) {
  const k = Math.floor(i), a = path[k], b = path[k + 1], f = i - k;
  out.x = (a[0] + 0.5 + (b[0] - a[0]) * f) * T;
  out.y = (a[1] + 0.5 + (b[1] - a[1]) * f) * T;
}
export function spawnEnemy(g, type) {
  const def = ENEMIES[type], hp = def.hp(g.wave);
  const e = { type, def, d: 0, hp, max: hp, speed: def.speed(g.wave), x: 0, y: 0, fx: null, dead: false, escaped: false, last: null };
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
