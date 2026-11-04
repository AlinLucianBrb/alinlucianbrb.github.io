/* Hero levels during a match: XP from kills, level-ups, the per-level bonus and the level needed to evolve. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { HERO_LEVELS, HEROES } from '../js/content/data.js';
import { ENEMIES } from '../js/engine/enemies.js';
import { levelMods } from '../js/engine/levels.js';
import { richWorld, tilesNearPath, place, enemyAt } from './helpers.mjs';

test('the XP curve: 10 to reach level 2, 2 more for each level after; level 10 takes 162 XP', () => {
  assert.deepEqual([1, 2, 3, 9].map(HERO_LEVELS.xpToNext), [10, 12, 14, 26]);
  let sum = 0; for (let L = 1; L < 10; L++) sum += HERO_LEVELS.xpToNext(L);
  assert.equal(sum, 162);
  assert.deepEqual([ENEMIES.grunt.xp, ENEMIES.runner.xp, ENEMIES.brute.xp], [1, 1, 3]);
  assert.ok(HEROES.every(h => h.evolutions[0].level === 10));
});

test('every hero on the field gains the XP of each kill, whoever landed it', () => {
  const w = richWorld(), t = tilesNearPath(w, 6);
  const r = place(w, 'ranger', ...t[0]), m = place(w, 'mage', ...t[5]);
  const e = enemyAt(w, r.x + 30, r.y, 10, 1, 'brute');
  w.attack(r, e);
  assert.ok(e.dead); assert.equal(r.xp, 3); assert.equal(m.xp, 3, 'the Mage learns from the Ranger\'s kill');
});

test('level-ups: XP carries over, each level adds +3% damage, and an event is sent', () => {
  const w = richWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]);
  const ups = []; w.ev.on('levelUp', e => ups.push(e.level));
  for (let i = 0; i < 25; i++) { const e = enemyAt(w, h.x + 30, h.y, 10, 1); w.attack(h, e); }
  assert.equal(h.level, 3); assert.equal(h.xp, 25 - 10 - 12); assert.deepEqual(ups, [2, 3]);
  assert.ok(Math.abs(h.s.damage - 28 * 1.06) < 1e-9, 'level 3 = +6% damage');
  assert.deepEqual(levelMods(1), []); assert.equal(levelMods(5)[0].value, 0.12);
});

test('levels stop at the maximum', () => {
  const w = richWorld(), h = place(w, 'ranger', ...tilesNearPath(w, 1)[0]);
  for (let i = 0; i < 200; i++) { const e = enemyAt(w, h.x + 30, h.y, 10, 1, 'brute'); w.attack(h, e); }
  for (let i = 0; i < 200; i++) { const e = enemyAt(w, h.x + 30, h.y, 10, 1, 'brute'); w.attack(h, e); }
  assert.ok(h.level <= HERO_LEVELS.max);
  if (h.level === HERO_LEVELS.max) assert.equal(h.xp, 0);
});

test('heroes reach level 10 during a normal level 1, and can then evolve with enough gold', () => {
  const w = createWorld({ seed: 2 }), t = tilesNearPath(w, 6);
  const war = place(w, 'warrior', ...t[1]); place(w, 'ranger', ...t[3]); place(w, 'mage', ...t[5]);
  apply(w, { type: 'auto', on: true });
  while (war.level < 10 && w.phase !== 'over') step(w);
  assert.equal(war.level, 10, 'level 10 reached before the level ends');
  assert.ok(w.wave >= 6 && w.wave <= 13, 'around the middle of the level (wave ' + w.wave + ')');
  assert.ok(w.heroes.every(h => h.level === 10), 'all three level together');
  while (w.gold < 150 && w.phase !== 'over') step(w);
  assert.ok(apply(w, { type: 'evolve', id: war.id, choice: 0 }).ok);
});
