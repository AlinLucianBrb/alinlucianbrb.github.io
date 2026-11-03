import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { HEROES, RELICS } from '../js/content/data.js';
import { richWorld, tilesNearPath, place, heroIndex } from './helpers.mjs';

test('placing a hero costs gold, needs a free tile, and is recorded', () => {
  const w = createWorld({ seed: 1 }), [t1] = tilesNearPath(w, 1);
  const r = apply(w, { type: 'place', hero: heroIndex('archer'), cx: t1[0], cy: t1[1] });
  assert.ok(r.ok); assert.equal(w.gold, 100 - HEROES[heroIndex('archer')].cost);
  assert.equal(apply(w, { type: 'place', hero: heroIndex('archer'), cx: t1[0], cy: t1[1] }).reason, 'blocked');
  assert.equal(apply(w, { type: 'place', hero: heroIndex('archer'), cx: w.path[3][0], cy: w.path[3][1] }).reason, 'blocked', 'not on the path');
  assert.equal(apply(w, { type: 'place', hero: heroIndex('archer'), cx: 16, cy: 0 }).reason, 'blocked', 'not off the map');
  assert.equal(apply(w, { type: 'place', hero: heroIndex('firemage'), cx: 0, cy: 0 }).ok === false, true);
  assert.equal(apply(w, { type: 'place', hero: 99, cx: 0, cy: 0 }).reason, 'unknown hero');
  assert.equal(w.log.commands.length, 1, 'failed commands are not recorded');
  assert.deepEqual(w.log.commands[0], { type: 'place', hero: heroIndex('archer'), cx: t1[0], cy: t1[1], t: 0 });
});

test('selling refunds 70% and removes the hero and its boomerang', () => {
  const w = richWorld(), t = tilesNearPath(w, 2);
  const h = place(w, 'thief', ...t[0]);
  w.projs.push({ type: 'boomerang', owner: h });
  const before = w.gold;
  assert.ok(apply(w, { type: 'sell', id: h.id }).ok);
  assert.equal(w.gold, before + Math.round(h.paid * 0.7));
  assert.equal(w.heroes.length, 0); assert.equal(w.projs.length, 0);
  assert.equal(apply(w, { type: 'sell', id: h.id }).reason, 'no such hero');
});

test('moving needs a free tile and briefly delays the next attack', () => {
  const w = richWorld(), t = tilesNearPath(w, 3);
  const a = place(w, 'archer', ...t[0]); place(w, 'archer', ...t[1]);
  assert.equal(apply(w, { type: 'move', id: a.id, cx: t[1][0], cy: t[1][1] }).reason, 'blocked');
  assert.ok(apply(w, { type: 'move', id: a.id, cx: t[2][0], cy: t[2][1] }).ok);
  assert.deepEqual([a.cx, a.cy], t[2]); assert.equal(a.cd, 1);
  assert.ok(apply(w, { type: 'move', id: a.id, cx: t[2][0], cy: t[2][1] }).ok, 'moving onto its own tile is allowed');
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
  assert.equal(w.relicCost(), 72); assert.equal(w.picking, true);
  assert.equal(new Set(w.pick.offers.map(o => o.relic.name)).size, 3);
  assert.equal(step(w), false, 'the game waits while a relic is being chosen');
  for (const c of ['place', 'sell', 'move', 'buyRelic']) assert.equal(apply(w, { type: c, hero: 0, id: 1, cx: 0, cy: 0 }).reason, 'busy');
  const name = w.pick.offers[1].relic.name;
  assert.ok(apply(w, { type: 'choose', index: 1 }).ok);
  assert.equal(w.picking, false); assert.equal(w.relics[0].name, name);
  assert.equal(apply(w, { type: 'choose', index: 0 }).reason, 'no relic choice open');
});

test('reroll and banish cost 25% of the price, +5% per use; banished relics never come back', () => {
  const w = richWorld();
  apply(w, { type: 'buyRelic' });
  assert.equal(w.pickCost(), 12);
  let g = w.gold; apply(w, { type: 'reroll' }); assert.equal(g - w.gold, 12);
  assert.equal(w.pickCost(), Math.round(0.25 * 48 * 1.05));
  const gone = w.pick.offers[0].relic.name;
  g = w.gold; apply(w, { type: 'banish', index: 0 }); assert.equal(g - w.gold, 13);
  assert.ok(w.banned.has(gone)); assert.equal(w.pick.offers.length, 3);
  assert.equal(new Set(w.pick.offers.map(o => o.relic.name)).size, 3, 'no duplicate offers after a banish');
  apply(w, { type: 'choose', index: 0 });
  for (let i = 0; i < 40; i++) { apply(w, { type: 'buyRelic' }); assert.ok(!w.pick.offers.some(o => o.relic.name === gone)); apply(w, { type: 'reroll' }); assert.ok(!w.pick.offers.some(o => o.relic.name === gone)); apply(w, { type: 'choose', index: 0 }); }
});

test('banishing can empty the pool without breaking anything', () => {
  const w = richWorld(); apply(w, { type: 'buyRelic' });
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
