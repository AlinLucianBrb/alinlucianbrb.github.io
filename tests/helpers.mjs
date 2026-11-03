/* Shared helpers for the tests. Not a test file itself. */
import { createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { ENEMIES } from '../js/engine/enemies.js';
import { HEROES } from '../js/content/data.js';

export const heroIndex = id => HEROES.findIndex(h => h.id === id);

/* A world with plenty of gold so tests are not about money. */
export function richWorld(opts = {}) { const w = createWorld({ seed: 1, ...opts }); w.gold = 1e6; return w; }

/* Free tiles next to the path, in path order. */
export function tilesNearPath(w, count = 10) {
  const out = [];
  for (const [x, y] of w.path.slice(2)) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const c = [x + dx, y + dy];
    if (c[0] >= 0 && c[1] >= 0 && c[0] < 16 && c[1] < 10 && !w.pathSet.has(c.join(',')) && !out.some(o => o.join() === c.join())) out.push(c);
  }
  return out.slice(0, count);
}

export function place(w, heroId, cx, cy) {
  const r = apply(w, { type: 'place', hero: heroIndex(heroId), cx, cy });
  if (!r.ok) throw new Error('place failed: ' + r.reason);
  return w.heroes.find(h => h.id === r.id);
}

/* An enemy standing still at (x, y), with progress d along the path. */
export function enemyAt(w, x, y, d = 0, hp = 1e6, type = 'grunt') {
  const def = ENEMIES[type];
  const e = { type, def, d, hp, max: hp, speed: 0, x, y, fx: null, dead: false, escaped: false, last: null };
  w.enemies.push(e);
  return e;
}
export const dealt = e => e.max - e.hp;

/* Runs fn with a temporary change to an object, then puts it back. */
export function withTemp(obj, changes, fn) {
  const old = {}; for (const k in changes) { old[k] = obj[k]; obj[k] = changes[k]; }
  try { return fn(); } finally { for (const k in old) obj[k] = old[k]; }
}
