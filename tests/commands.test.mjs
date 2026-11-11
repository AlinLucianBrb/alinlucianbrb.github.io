import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, recalc } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { RELICS, FORM_TUNING, START_GOLD, HERO_COST, EVOLVE_COST, PAY_FOR_HEROES } from '../js/content/data.js';
import { levelMods } from '../js/engine/levels.js';
import { pathTo } from '../js/content/talents.js';
import { richWorld, tilesNearPath, place, heroIndex } from './helpers.mjs';

test('a match starts with 150 gold; placing a hero costs 150, once each, only from the lineup, on a free tile; placing is recorded', t0 => {
  PAY_FOR_HEROES.on = true; t0.after(() => { PAY_FOR_HEROES.on = false; });
  const w = createWorld({ seed: 1, lineup: ['warrior', 'ranger'] }), t = tilesNearPath(w, 3);
  assert.equal(w.gold, START_GOLD);
  const r = apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1] });
  assert.ok(r.ok); assert.equal(w.gold, START_GOLD - HERO_COST, 'paid for');
  assert.equal(apply(w, { type: 'place', hero: 'ranger', cx: t[1][0], cy: t[1][1] }).reason, 'already placed');
  assert.equal(apply(w, { type: 'place', hero: 'mage', cx: t[1][0], cy: t[1][1] }).reason, 'not in lineup');
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1] }).reason, 'blocked');
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: w.path[3][0], cy: w.path[3][1] }).reason, 'blocked', 'not on the path');
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: 16, cy: 0 }).reason, 'blocked', 'not off the map');
  assert.equal(apply(w, { type: 'place', hero: 'thief', cx: 0, cy: 0 }).reason, 'unknown hero', 'archived heroes cannot be placed');
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: t[2][0], cy: t[2][1] }).reason, 'gold', 'the second hero waits for gold');
  assert.equal(w.log.commands.length, 1, 'failed commands are not recorded');
  assert.deepEqual(w.log.commands[0], { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1], t: 0 });
});

test('the lineup is cleaned: unknown, duplicate and extra heroes are dropped, an empty one brings everyone', () => {
  assert.deepEqual(createWorld({ seed: 1, lineup: ['mage', 'thief', 'mage', 'nope'] }).lineup, ['mage']);
  assert.deepEqual(createWorld({ seed: 1, lineup: [] }).lineup, ['warrior', 'ranger', 'mage']);
  assert.deepEqual(createWorld({ seed: 1 }).lineup, ['warrior', 'ranger', 'mage']);
});

test('items apply to the hero wearing them, only if that hero is in the lineup', () => {
  const w = createWorld({ seed: 1, items: { warrior: 'power_charm', mage: 'nope' } }), t = tilesNearPath(w, 2);
  const war = place(w, 'warrior', ...t[0]), ran = place(w, 'ranger', ...t[1]);
  assert.ok(Math.abs(war.s.damage - (28 + 5) * 1.1) < 1e-9, 'flat damage first, then +10% from strength'); assert.ok(Math.abs(ran.s.damage - 16 * 1.1) < 1e-9);
  assert.deepEqual(w.items, { warrior: [{ type: 'power_charm', rarity: 0, bonuses: [], ranks: [] }], mage: [{ type: 'nope', rarity: 0, bonuses: [], ranks: [] }] },
    'a plain type id is a Common item with no bonuses; unknown items are kept in the log but do nothing');
  assert.deepEqual(createWorld({ seed: 1, lineup: ['ranger'], items: { warrior: 'power_charm' } }).items, {}, 'items on heroes left at home are ignored');
});

test('evolving needs level 10 and costs gold, gives +25% to all the base stats, and only once for now (Warrior to Sentinel)', () => {
  const w = richWorld(), [t] = tilesNearPath(w, 1), h = place(w, 'warrior', ...t);
  assert.equal(apply(w, { type: 'evolve', id: h.id, choice: 2 }).reason, 'level', 'a fresh hero is level 1');
  h.level = 10;   /* test only: skip the XP (levels are tested in levels.test.mjs) */
  const before = { ...h.s }, g = w.gold;
  assert.equal(w.evolveCost(h), EVOLVE_COST);
  assert.ok(apply(w, { type: 'evolve', id: h.id, choice: 2 }).ok);
  assert.equal(g - w.gold, EVOLVE_COST); assert.equal(h.tier, 1);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const tune = Math.sqrt(FORM_TUNING.sentinel || 1);   /* the balance pass's extra damage and speed for the Sentinel */
  for (const k of ['strength', 'dexterity', 'intellect']) assert.ok(near(h.s[k], before[k] * 1.25), k);
  assert.ok(near(h.s.speed, before.speed * 1.25 * tune), 'speed');
  assert.ok(near(h.s.damage, 28 * (1 + h.s.strength * 0.01) * 1.25 * tune), 'damage: +25%, with the higher strength');
  assert.ok(near(h.s.range, 60 * (1 + h.s.strength * 0.0025) * 1.25), 'range: +25%, with the higher strength');
  assert.equal(apply(w, { type: 'evolve', id: h.id, choice: 2 }).reason, 'fully evolved');
  assert.equal(w.evolveCost(h), null);
  const w2 = createWorld({ seed: 1 }), h2 = place(w2, 'warrior', ...tilesNearPath(w2, 1)[0]); h2.level = 10;
  assert.equal(apply(w2, { type: 'evolve', id: h2.id, choice: 2 }).reason, 'gold');
  assert.equal(apply(w2, { type: 'evolve', id: 99 }).reason, 'no such hero');
});

test('evolution stacks with relics', () => {
  const w = richWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]);
  h.level = 10; h.lvlMods = levelMods(10);   /* test only: a level-10 hero with its level bonus */
  w.mods.push(...RELICS.find(r => r.name === 'Sharpened rounds').mods(1).map(m => ({ ...m, source: 'x', ri: 0 })));
  recalc(w);
  assert.equal(w.evolveCost(h), EVOLVE_COST);
  apply(w, { type: 'evolve', id: h.id, choice: 2 });
  assert.ok(Math.abs(h.s.damage - 28 * (1 + 0.0375 + (10 + 3 * 9) * 1.25 * 0.01) * 1.25 * Math.sqrt(FORM_TUNING.sentinel || 1)) < 1e-9, 'relic, strength and level bonuses add up, then evolution multiplies');
});

test('moving needs a free tile and briefly delays the next attack', () => {
  const w = richWorld(), t = tilesNearPath(w, 3);
  const a = place(w, 'ranger', ...t[0]); place(w, 'warrior', ...t[1]);
  assert.equal(apply(w, { type: 'move', id: a.id, cx: t[1][0], cy: t[1][1] }).reason, 'blocked');
  assert.ok(apply(w, { type: 'move', id: a.id, cx: t[2][0], cy: t[2][1] }).ok);
  assert.deepEqual([a.cx, a.cy], t[2]); assert.equal(a.cd, 1);
  assert.ok(apply(w, { type: 'move', id: a.id, cx: t[2][0], cy: t[2][1] }).ok, 'moving onto its own tile is allowed');
});

test('there is no selling: heroes are free', () => {
  const w = richWorld(), h = place(w, 'ranger', ...tilesNearPath(w, 1)[0]);
  assert.equal(apply(w, { type: 'sell', id: h.id }).reason, 'unknown command');
});

test('wave and auto-start', () => {
  const w = createWorld({ seed: 1 });
  assert.ok(apply(w, { type: 'wave' }).ok); assert.equal(w.phase, 'wave');
  assert.equal(apply(w, { type: 'wave' }).ok, false, 'cannot start a wave during a wave');
  const w2 = createWorld({ seed: 1 }); apply(w2, { type: 'auto', on: true });
  for (let i = 0; i < 179; i++) step(w2);
  assert.equal(w2.phase, 'build');
  step(w2); step(w2);
  assert.equal(w2.phase, 'wave', 'auto-start begins the wave after 3 seconds');
});

test('relic shop: price is 60% and rises; three different offers; choosing applies the relic', () => {
  const w = richWorld();
  assert.equal(w.relicCost(), 48);
  assert.ok(apply(w, { type: 'buyRelic' }).ok);
  assert.equal(w.relicCost(), 60, 'each relic costs 12 more (half the old step)'); assert.equal(w.picking, true);
  assert.equal(new Set(w.pick.offers.map(o => o.relic.name)).size, 3);
  assert.equal(step(w), false, 'the game waits while a relic is being chosen');
  for (const c of ['place', 'move', 'evolve', 'buyRelic']) assert.equal(apply(w, { type: c, hero: 'ranger', id: 1, cx: 0, cy: 0 }).reason, 'busy');
  const name = w.pick.offers[1].relic.name;
  assert.ok(apply(w, { type: 'choose', index: 1 }).ok);
  assert.equal(w.picking, false); assert.equal(w.relics[0].name, name);
  assert.equal(apply(w, { type: 'choose', index: 0 }).reason, 'no relic choice open');
});

test('rerolls and banishes come only from talents, are free, and run out; banished relics never come back', () => {
  const plain = richWorld(); apply(plain, { type: 'buyRelic' });
  assert.equal(apply(plain, { type: 'reroll' }).reason, 'no rerolls', 'none without talents');
  assert.equal(apply(plain, { type: 'banish', index: 0 }).reason, 'no banishes');
  /* The path into the Relics cluster, its beginning (+1 reroll, +1 banish), then one Second Look on the left side (+1 reroll). */
  const w = createWorld({ seed: 1, talents: pathTo(new Set(), 't4_relics_a1') }); w.gold = 100000;
  assert.equal(w.rerolls, 2); assert.equal(w.banishes, 1);
  apply(w, { type: 'buyRelic' });
  let g = w.gold; assert.ok(apply(w, { type: 'reroll' }).ok); assert.equal(g - w.gold, 0, 'free'); assert.equal(w.rerolls, 1);
  const gone = w.pick.offers[0].relic.name;
  g = w.gold; assert.ok(apply(w, { type: 'banish', index: 0 }).ok); assert.equal(g - w.gold, 0); assert.equal(w.banishes, 0);
  assert.equal(apply(w, { type: 'banish', index: 0 }).reason, 'no banishes', 'used up');
  assert.ok(w.banned.has(gone)); assert.equal(w.pick.offers.length, 3);
  assert.equal(new Set(w.pick.offers.map(o => o.relic.name)).size, 3, 'no duplicate offers after a banish');
  apply(w, { type: 'choose', index: 0 });
  w.rerolls = 40;   /* test only */
  for (let i = 0; i < 40; i++) { apply(w, { type: 'buyRelic' }); assert.ok(!w.pick.offers.some(o => o.relic.name === gone)); apply(w, { type: 'reroll' }); assert.ok(!w.pick.offers.some(o => o.relic.name === gone)); apply(w, { type: 'choose', index: 0 }); }
});

test('banishing can empty the pool without breaking anything', () => {
  const w = richWorld(); w.banishes = 99; apply(w, { type: 'buyRelic' });
  for (let i = 0; i < RELICS.length + 5; i++) apply(w, { type: 'banish', index: 0 });
  assert.ok(w.pick.offers.length <= 3);
  assert.ok(w.banned.size <= RELICS.length);
});

test('not enough gold is refused without side effects', () => {
  const w = createWorld({ seed: 1 }); w.gold = 10;
  assert.equal(apply(w, { type: 'buyRelic' }).reason, 'gold');
  assert.equal(w.relicsBought, 0); assert.equal(w.gold, 10);
});

test('unknown commands are refused', () => { assert.equal(apply(createWorld({ seed: 1 }), { type: 'teleport' }).reason, 'unknown command'); });

test('keep playing while choosing a relic: off by default the match waits; turned on it runs on, and the replay agrees', async () => {
  const { replay } = await import('../js/engine/replay.js');
  const { exportLog } = await import('../js/engine/replay.js');
  const run = on => {
    const w = createWorld({ seed: 7, lineup: ['ranger'] }), t = tilesNearPath(w, 1);
    apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1] });
    if (on) assert.ok(apply(w, { type: 'playOnPick', on: true }).ok);
    apply(w, { type: 'wave' });
    for (let i = 0; i < 60; i++) step(w);
    assert.ok(apply(w, { type: 'buyRelic' }).ok, 'the starting gold buys one'); assert.equal(w.picking, true);
    const before = w.tick;
    for (let i = 0; i < 120; i++) step(w);
    return { w, moved: w.tick - before };
  };
  assert.equal(run(false).moved, 0, 'off: the game waits for the choice');
  const { w, moved } = run(true);
  assert.equal(moved, 120, 'on: the match carries on behind the choice');
  assert.equal(apply(w, { type: 'buyRelic' }).reason, 'busy', 'other actions still wait for the choice');
  assert.ok(apply(w, { type: 'choose', index: 0 }).ok);
  for (let i = 0; i < 30; i++) step(w);
  const r = replay(exportLog(w), { maxTicks: w.tick });
  assert.equal(r.tick, w.tick); assert.equal(r.gold, w.gold); assert.equal(r.relics.length, 1, 'the replay plays it the same way');
});
