import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, summary, recalc, STEP } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { hashWorld } from '../js/engine/hash.js';
import { waveEnemyType, ENEMIES } from '../js/engine/enemies.js';
import { STAGES, RELICS } from '../js/content/data.js';
import { richWorld, tilesNearPath, place, heroIndex } from './helpers.mjs';

const runFor = (w, ticks) => { for (let i = 0; i < ticks && step(w); i++); return w; };

test('the same seed gives the same map; different seeds give different maps', () => {
  const a = createWorld({ seed: 11 }), b = createWorld({ seed: 11 }), c = createWorld({ seed: 12 });
  assert.deepEqual(a.path, b.path);
  assert.notDeepEqual(a.path, c.path);
});

test('every generated path runs from the left edge to the right edge in single steps', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const p = createWorld({ seed }).path;
    assert.equal(p[0][0], 0); assert.equal(p.at(-1)[0], 15);
    for (let i = 1; i < p.length; i++) assert.equal(Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]), 1, 'seed ' + seed);
    assert.ok(p.every(([x, y]) => x >= 0 && x < 16 && y >= 0 && y < 10));
  }
});

test('same seed and same commands give exactly the same game', () => {
  const play = () => {
    const w = createWorld({ seed: 77, stage: 2 }); w.gold = 2000;
    const t = tilesNearPath(w, 6);
    place(w, 'archer', ...t[0]); place(w, 'frostmage', ...t[2]); place(w, 'lightningmage', ...t[4]);
    apply(w, { type: 'buyRelic' }); apply(w, { type: 'reroll' }); apply(w, { type: 'choose', index: 1 });
    apply(w, { type: 'auto', on: true });
    return runFor(w, 6000);
  };
  assert.equal(hashWorld(play()), hashWorld(play()));
});

test('the map does not depend on relic activity, and relic offers do not depend on the map', () => {
  const a = createWorld({ seed: 5 }), b = createWorld({ seed: 5 });
  a.gold = b.gold = 1000;
  apply(a, { type: 'buyRelic' });
  assert.deepEqual(a.path, b.path);
  apply(b, { type: 'buyRelic' });
  assert.deepEqual(a.pick.offers.map(o => o.relic.name + o.ri), b.pick.offers.map(o => o.relic.name + o.ri));
});

test('fixed steps: game time advances exactly one STEP per tick', () => {
  const w = createWorld({ seed: 3 }); apply(w, { type: 'wave' });
  runFor(w, 600);
  assert.equal(w.tick, 600);
  assert.ok(Math.abs(w.tick * STEP - 10) < 1e-9);
});

test('waves spawn the expected count and mix of enemies', () => {
  const w = richWorld(); const spawned = {};
  const orig = w.enemies.push.bind(w.enemies);
  w.enemies.push = e => { spawned[e.type] = (spawned[e.type] || 0) + 1; return orig(e); };
  for (let i = 0; i < 4; i++) w.wave = i, apply(w, { type: 'wave' }), runFor(w, 6000), w.phase = 'build', w.enemies.length = 0;
  const expected = {}; for (let wv = 1; wv <= 4; wv++) for (let i = 5 + 2 * wv; i >= 1; i--) { const t = waveEnemyType(wv, i); expected[t] = (expected[t] || 0) + 1; }
  assert.deepEqual(spawned, expected);
  assert.ok(expected.brute && expected.runner, 'waves 1-4 include brutes and runners');
});

test('brutes are slower and tougher, runners are faster and weaker', () => {
  assert.ok(ENEMIES.brute.hp > ENEMIES.grunt.hp && ENEMIES.brute.speed < ENEMIES.grunt.speed && ENEMIES.brute.leak > 1);
  assert.ok(ENEMIES.runner.hp < ENEMIES.grunt.hp && ENEMIES.runner.speed > ENEMIES.grunt.speed);
});

test('leaking enemies costs lives and ends the run at zero', () => {
  const w = createWorld({ seed: 9 }); w.lives = 3;
  let ended = null; w.ev.on('end', e => { ended = e; });
  apply(w, { type: 'auto', on: true });
  runFor(w, 200000);
  assert.equal(w.phase, 'over'); assert.equal(w.lives, 0); assert.deepEqual(ended, { won: false }); assert.equal(summary(w).won, false);
  assert.equal(step(w), false, 'a finished world does not advance');
});

test('clearing the last wave wins the level', () => {
  const stage = STAGES[0], saved = { waves: stage.waves, hpMult: stage.hpMult };
  stage.waves = 2; stage.hpMult = 0.2;
  try {
    const w = createWorld({ seed: 4 }); w.gold = 1000;
    for (const c of tilesNearPath(w, 4)) place(w, 'archer', ...c);
    apply(w, { type: 'auto', on: true });
    runFor(w, 50000);
    assert.equal(w.phase, 'over'); assert.equal(w.won, true); assert.equal(w.wave, 2);
  } finally { Object.assign(stage, saved); }
});

test('wave clear pays gold, plus Compound interest: % and limit both stack with more copies', () => {
  const ci = RELICS.find(r => r.name === 'Compound interest');
  const clearWaveOne = (copies, gold) => {
    const w = createWorld({ seed: 2 });
    for (const m of copies) w.mods.push(...ci.mods(m).map(x => ({ ...x, source: ci.name, ri: 0 })));
    recalc(w);
    apply(w, { type: 'wave' }); w.spawnLeft = 0; w.gold = gold;
    step(w);
    return w.gold - gold;
  };
  assert.equal(clearWaveOne([], 1000), 15 + 3, 'no relic: just the wave reward');
  assert.equal(clearWaveOne([1], 400), 18 + 20, 'common: 5% of 400');
  assert.equal(clearWaveOne([1], 5000), 18 + 60, 'common: limited to 60');
  assert.equal(clearWaveOne([1, 1], 5000), 18 + 120, 'two copies: the limits add up');
  assert.equal(clearWaveOne([1, 1], 400), 18 + 40, 'two copies: the percentages add up');
  assert.equal(clearWaveOne([3], 5000), 18 + 180, 'epic: 15% up to 180');
});
