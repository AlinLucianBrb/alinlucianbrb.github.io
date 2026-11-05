/* Enemy defenses (armor and resistances that grow with the wave and the level) and bosses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../js/content/data.js';
import { ENEMIES, threat, defensesFor, isBossWave, waveEnemyType, waveCount } from '../js/engine/enemies.js';
import { mitigate } from '../js/engine/combat.js';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';

test('defenses start at 0 on wave 1 and grow each wave, faster on harder levels', () => {
  assert.equal(threat(1, 1), 0); assert.equal(threat(1, 5), 0);
  assert.equal(threat(15, 1), 14); assert.equal(threat(15, 5), 28, 'level 5 grows twice as fast');
  const g1 = defensesFor(ENEMIES.grunt, 1, 1);
  assert.equal(g1.armor, 0); assert.ok(Object.values(g1.res).every(r => r === 0));
  const late = defensesFor(ENEMIES.grunt, 35, 5), early = defensesFor(ENEMIES.grunt, 15, 1);
  assert.ok(late.armor > early.armor && late.res.fire > early.res.fire);
  assert.equal(defensesFor(ENEMIES.grunt, 15, 1).res.physical, undefined, 'physical is handled by armor, not a resistance');
});

test('each enemy type has its own defenses: Brutes are armored, Runners resist, Bosses have both', () => {
  const at = type => defensesFor(ENEMIES[type], 15, 1);
  assert.ok(at('brute').armor > at('grunt').armor && at('brute').armor > at('runner').armor);
  assert.ok(at('runner').res.fire > at('grunt').res.fire && at('runner').res.fire > at('brute').res.fire);
  assert.ok(at('boss').armor >= at('brute').armor && at('boss').res.cold > at('grunt').res.cold);
});

test('defenses cap at 99%, whatever the threat (ready for endless)', () => {
  const huge = defensesFor(ENEMIES.boss, 100000, 5);
  const e = { ...huge, fx: null };
  assert.ok(Math.abs(mitigate(e, 'fire', 100) - 1) < 1e-9, 'resistance capped at 99%');
  assert.ok(mitigate(e, 'physical', 100) >= 1 - 1e-9, 'armor capped at 99%');
});

test('spawned enemies carry the defenses of their wave', () => {
  const w = createWorld({ seed: 5, stage: 2 });
  for (let i = 0; i < 6; i++) { apply(w, { type: 'wave' }); w.enemies.length = 0; w.spawnLeft = 0; step(w); }
  apply(w, { type: 'wave' }); step(w);
  const e = w.enemies[0], want = defensesFor(e.def, w.wave, 2);
  assert.equal(e.armor, want.armor); assert.deepEqual(e.res, want.res);
  assert.ok(e.armor > 0, 'wave 7 of level 2 is armored');
});

test('bosses: the last wave of every level, and the middle wave from level 3 on', () => {
  const bossWaves = s => Array.from({ length: s.waves }, (_, i) => i + 1).filter(n => isBossWave(n, s));
  assert.deepEqual(bossWaves(STAGES[0]), [15]); assert.deepEqual(bossWaves(STAGES[1]), [20]);
  assert.deepEqual(bossWaves(STAGES[2]), [13, 25]); assert.deepEqual(bossWaves(STAGES[4]), [18, 35]);
  /* The boss is the last enemy of its wave and takes the place of one enemy, so wave sizes (and the server's kill limit) stay the same. */
  const s = STAGES[0], types = [];
  for (let i = waveCount(15); i >= 1; i--) types.push(waveEnemyType(15, i, s));
  assert.equal(types.at(-1), 'boss'); assert.equal(types.filter(t => t === 'boss').length, 1); assert.equal(types.length, waveCount(15));
  assert.equal(waveEnemyType(14, 1, s) === 'boss', false, 'no boss on other waves');
});

test('a boss is big, tough, slow and costly to let through', () => {
  const b = ENEMIES.boss;
  assert.ok(b.boss && b.hp >= 10 && b.speed < 1 && b.leak >= 10 && b.bounty > ENEMIES.brute.bounty && b.xp > ENEMIES.brute.xp);
  const w = createWorld({ seed: 2 });
  w.wave = 14; apply(w, { type: 'wave' });   /* wave 15: the boss wave of level 1 */
  w.spawnLeft = 1; w.spawnT = 0; step(w);
  const e = w.enemies.at(-1);
  assert.equal(e.type, 'boss'); assert.ok(e.max > 1000, 'thousands of life on the last wave of level 1: ' + e.max);
  const lives = w.lives; e.d = (w.path.length - 1.01) * 40; step(w);
  assert.equal(w.lives, lives - b.leak);
});
