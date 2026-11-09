/* The shared mechanics the newer heroes are built on: Holy and Shadow damage, Corruption, curses (damage taken), damage
   conversion, the Heretic's blood price, execute, knockback with its per-wave limit, and effects that act on death or on damage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../js/engine/world.js';
import { attack, mitigate, inflict, execute } from '../js/engine/combat.js';
import { tickEffects, applyEffect, damageTaken, EFFECT_HOOKS, EFFECTS } from '../js/engine/effects.js';
import { knockback, KNOCKBACK, pathPos } from '../js/engine/enemies.js';
import { DAMAGE_TYPES, AILMENTS, HOLY_RES_IGNORED } from '../js/content/combat.js';
import { T } from '../js/content/data.js';
import { enemyAt, dealt } from './helpers.mjs';

const fake = (stats, def = {}) => ({ s: { damage: 10, critChance: 0, ...stats }, def: { damageType: 'physical', ...def } });

test('Holy and Shadow are damage types; Holy ignores half of a resistance, Shadow does not', () => {
  assert.ok(DAMAGE_TYPES.includes('holy') && DAMAGE_TYPES.includes('shadow'));
  const w = createWorld({ seed: 1 }), e = enemyAt(w, 0, 0);
  e.res = { holy: 0.4, shadow: 0.4, fire: 0.4 };
  assert.equal(mitigate(e, 'fire', 100), 60);
  assert.equal(mitigate(e, 'holy', 100), 100 * (1 - 0.4 * (1 - HOLY_RES_IGNORED)));
  assert.equal(mitigate(e, 'shadow', 100), 60);
  e.res.holy = -0.2;   /* below zero (shocked) it is not halved */
  assert.equal(mitigate(e, 'holy', 100), 120);
});

test('Corruption: shadow damage over time; each stack makes every stack stronger (10 stacks: twice the damage each)', () => {
  const w = createWorld({ seed: 1 }), h = fake({}, { damageType: 'shadow' });
  const one = enemyAt(w, 0, 0), ten = enemyAt(w, 0, 0);
  inflict(w, h, one, 'corruption', 100);
  for (let i = 0; i < 10; i++) inflict(w, h, ten, 'corruption', 100);
  tickEffects(w, one, 1); tickEffects(w, ten, 1);
  const per = AILMENTS.corruption.dpsOfHit * 100;
  assert.ok(Math.abs(dealt(one) - per * 1.1) < 1e-6, 'one stack: x1.1');
  assert.ok(Math.abs(dealt(ten) - per * 10 * 2) < 1e-6, 'ten stacks: each x2');
  assert.equal(AILMENTS.corruption.from[0], 'shadow');
});

test('curses: Hex, Doom and Verdict make an enemy take more damage (bosses half as much); Hex slows', () => {
  const w = createWorld({ seed: 1 }), e = enemyAt(w, 0, 0), b = enemyAt(w, 0, 0, 0, 1e6, 'boss');
  assert.equal(damageTaken(e), 1);
  applyEffect(e, 'hex', { t: 1 }); applyEffect(b, 'hex', { t: 1 });
  assert.ok(Math.abs(damageTaken(e) - 1.2) < 1e-9); assert.ok(Math.abs(damageTaken(b) - 1.1) < 1e-9);
  e.fx.verdict = { t: 5, n: 4 };
  assert.ok(Math.abs(damageTaken(e) - 1.4) < 1e-9, 'Verdict: +5% a stack');
  w.hit(null, e, 100); assert.ok(Math.abs(dealt(e) - 140) < 1e-9, 'the damage function applies it');
  assert.equal(tickEffects(w, e, 0.1), EFFECTS.hex.speedMult, 'Hex slows by 15%');
});

test('conversion: the Paladin turns 30% of his damage into Holy; blood price adds 3% per life lost', () => {
  const w = createWorld({ seed: 1 }), e = enemyAt(w, 0, 0), types = {};
  w.ev.on('damage', ({ type, amount }) => { types[type] = (types[type] || 0) + amount; });
  attack(w, fake({ damage: 100 }, { convert: { holy: 0.3 } }), e);
  assert.ok(Math.abs(types.physical - 70) < 1e-9 && Math.abs(types.holy - 30) < 1e-9, JSON.stringify(types));
  const e2 = enemyAt(w, 0, 0); w.lives = w.livesStart - 5;
  attack(w, fake({ damage: 100 }, { bloodPrice: 0.03 }), e2);
  assert.ok(Math.abs(dealt(e2) - 115) < 1e-9, '5 lives lost: +15%');
});

test('execute: kills a non-boss under its threshold, never a boss', () => {
  const w = createWorld({ seed: 1 }), h = fake({});
  const low = enemyAt(w, 0, 0, 0, 100), high = enemyAt(w, 0, 0, 0, 100), boss = enemyAt(w, 0, 0, 0, 100, 'boss');
  low.hp = 20; high.hp = 30; boss.hp = 5;
  assert.equal(execute(w, h, low, 0.25), true); assert.ok(low.dead);
  assert.equal(execute(w, h, high, 0.25), false); assert.equal(execute(w, h, boss, 0.25), false);
});

test('knockback: back along the path, never past the entrance, bosses a quarter, at most 2 tiles per enemy per wave', () => {
  const w = createWorld({ seed: 1 }); w.wave = 3;
  const e = enemyAt(w, 0, 0, 5 * T); pathPos(w.path, 5, e);
  assert.equal(knockback(w, e, T), T); assert.equal(e.d, 4 * T);
  const p = { x: 0, y: 0 }; pathPos(w.path, 4, p); assert.ok(Math.abs(e.x - p.x) < 1e-9 && Math.abs(e.y - p.y) < 1e-9, 'moved on the path');
  assert.equal(knockback(w, e, 5 * T), KNOCKBACK.perWave - T, 'the rest of this wave\'s 2 tiles');
  assert.equal(knockback(w, e, T), 0);
  w.wave = 4; assert.equal(knockback(w, e, T), T, 'a new wave, a new allowance');
  const b = enemyAt(w, 0, 0, 5 * T, 1e6, 'boss');
  assert.equal(knockback(w, b, T), T * KNOCKBACK.boss);
  const start = enemyAt(w, 0, 0, 10);
  assert.equal(knockback(w, start, T), 10, 'never past the entrance');
});

test('effects can act when their enemy is hurt or dies (hooks), and passed-on damage is quiet', () => {
  const w = createWorld({ seed: 1 }), a = enemyAt(w, 0, 0, 0, 50), b = enemyAt(w, 0, 0, 0, 1000);
  let deaths = 0, hurts = 0;
  EFFECT_HOOKS.death.testfx = () => { deaths++; };
  EFFECT_HOOKS.damage.testfx = (g, hero, e, amount) => { hurts++; g.hit(hero, b, amount, 'physical', true); };
  EFFECTS.testfx = { name: 'test', kind: 'curse' };
  try {
    a.fx = { testfx: { t: 5 } }; b.fx = { testfx: { t: 5 } };
    w.hit(null, a, 30); assert.equal(hurts, 1); assert.equal(dealt(b), 30, 'passed on, without setting b\'s hook off');
    w.hit(null, a, 30); assert.ok(a.dead); assert.equal(deaths, 1);
  } finally { delete EFFECT_HOOKS.death.testfx; delete EFFECT_HOOKS.damage.testfx; delete EFFECTS.testfx; }
});
