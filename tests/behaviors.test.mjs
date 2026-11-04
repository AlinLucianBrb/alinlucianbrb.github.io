import test from 'node:test';
import assert from 'node:assert/strict';
import { step, recalc } from '../js/engine/world.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { sweep } from '../js/engine/enemies.js';
import { RELICS } from '../js/content/data.js';
import { richWorld, place, archivedUnit, enemyAt, dealt } from './helpers.mjs';

/* A hero on a free tile; enemies are put at exact spots around it, standing still. */
function freeTile(w) {
  for (let cx = 4; cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) return [cx, cy];
}
function setup(heroId) {
  const w = richWorld({ seed: 31 });
  return { w, h: place(w, heroId, ...freeTile(w)) };
}
function setupArchived(heroId) {
  const w = richWorld({ seed: 31 });
  return { w, h: archivedUnit(w, heroId, ...freeTile(w)) };
}
const tickHero = (w, h, n = 1) => { for (let i = 0; i < n; i++) BEHAVIORS[h.def.kind].update(w, h, 1 / 60); };
/* Lets every projectile in the air land (arrows and bolts fly). */
const land = w => { for (let i = 0; i < 120 && w.projs.length; i++) updateProjectiles(w, 1 / 60); };
const addRelic = (w, name, m, ri = 0) => { w.mods.push(...RELICS.find(r => r.name === name).mods(m).map(x => ({ ...x, source: name, ri }))); recalc(w); };

test('ranger shoots an arrow at the enemy furthest along the path, within range only; it hits when it lands', () => {
  const { w, h } = setup('ranger');
  const near = enemyAt(w, h.x + 30, h.y, 5), ahead = enemyAt(w, h.x - 60, h.y, 50), far = enemyAt(w, h.x + 500, h.y, 999);
  tickHero(w, h);
  assert.equal(w.projs.length, 1); assert.equal(w.projs[0].look, 'arrow'); assert.equal(w.projs[0].target, ahead);
  assert.equal(dealt(ahead), 0, 'still in the air');
  land(w);
  assert.equal(dealt(ahead), 16); assert.equal(dealt(near), 0); assert.equal(dealt(far), 0);
  tickHero(w, h, 10); land(w); assert.equal(dealt(ahead), 16, 'cooldown');
  tickHero(w, h, 25); land(w); assert.equal(dealt(ahead), 32, 'fires again after 0.5 s');
});

test('warrior swing hits everything inside the arc and range, nothing behind it', () => {
  const { w, h } = setup('warrior');
  const target = enemyAt(w, h.x + 40, h.y, 100), side = enemyAt(w, h.x + 30, h.y + 25, 1), behind = enemyAt(w, h.x - 40, h.y, 2), out = enemyAt(w, h.x + 90, h.y, 3);
  tickHero(w, h);
  assert.equal(dealt(target), 28); assert.equal(dealt(side), 28, 'within 60 degrees of the swing');
  assert.equal(dealt(behind), 0); assert.equal(dealt(out), 0);
});

test('mage fires a bolt that flies to the lead enemy and hits on arrival; Split bolt fires more bolts', () => {
  const { w, h } = setup('mage');
  const a = enemyAt(w, h.x + 90, h.y, 30), b = enemyAt(w, h.x - 60, h.y, 20), c = enemyAt(w, h.x, h.y + 60, 10);
  tickHero(w, h);
  assert.equal(w.projs.length, 1); assert.equal(w.projs[0].target, a, 'aimed at the enemy furthest along the path');
  assert.equal(dealt(a), 0, 'nothing yet: the bolt is in the air');
  for (let i = 0; i < 20; i++) updateProjectiles(w, 1 / 60);
  assert.equal(dealt(a), 26); assert.equal(w.projs.length, 0);
  assert.equal(a.fx, null, 'the plain Mage has no on-hit effect');
  addRelic(w, 'Split bolt', 2, 1);
  h.cd = 0; tickHero(w, h);
  assert.equal(w.projs.length, 3, 'Uncommon Split bolt: +2 targets, one bolt each');
  for (let i = 0; i < 30; i++) updateProjectiles(w, 1 / 60);
  assert.deepEqual([dealt(a), dealt(b), dealt(c)], [52, 26, 26]);
});

test('a bolt fizzles if its target dies before it arrives', () => {
  const { w, h } = setup('mage');
  const e = enemyAt(w, h.x + 100, h.y, 30);
  tickHero(w, h); e.dead = true;
  updateProjectiles(w, 1 / 60);
  assert.equal(w.projs.length, 0);
});

test('energy fills by 20 per attack; the 6th attack is the ultimate (2x damage) and empties the bar', () => {
  const { w, h } = setup('ranger');
  const e = enemyAt(w, h.x + 30, h.y, 10);
  const hits = [];
  for (let i = 0; i < 7; i++) { const before = dealt(e); h.cd = 0; tickHero(w, h); land(w); hits.push(dealt(e) - before); if (i < 5) assert.equal(h.energy, 20 * (i + 1)); }
  assert.deepEqual(hits, [16, 16, 16, 16, 16, 32, 16]);
  assert.equal(h.ults, 1);
  assert.equal(h.energy, 20, 'the ultimate empties the bar, and the attack after it starts filling again');
});

test('energy over time: heroes can also fill their bar per second during a wave', () => {
  const { w, h } = setup('warrior');
  w.mods.push({ stat: 'energyPerSecond', type: 'flat', value: 10, scope: ['warrior'], source: 't', ri: 0 }); recalc(w);
  w.phase = 'wave'; w.spawnLeft = 0; enemyAt(w, 5000, 5000, 0);
  for (let i = 0; i < 120; i++) step(w);
  assert.ok(Math.abs(h.energy - 20) < 1e-6, 'about 10 per second for 2 seconds');
});

test('ultimates hit every enemy in the swing for double damage', () => {
  const { w, h } = setup('warrior');
  const a = enemyAt(w, h.x + 40, h.y, 10), b = enemyAt(w, h.x + 30, h.y + 20, 9);
  h.energy = h.s.energyMax; tickHero(w, h);
  assert.deepEqual([dealt(a), dealt(b)], [56, 56]); assert.equal(h.energy, 0);
});

test('the archived Frost Mage still chills enemies (kept for later)', () => {
  const { w, h } = setupArchived('frostmage');
  const a = enemyAt(w, h.x + 20, h.y, 30);
  tickHero(w, h);
  assert.equal(dealt(a), 3); assert.ok(a.fx.chill.t > 1.4);
});

test('chilled enemies move at half speed', () => {
  const w = richWorld({ seed: 3 }); w.phase = 'wave'; w.spawnLeft = 0;
  const e = enemyAt(w, 0, 0, 0); e.speed = 60;
  const e2 = enemyAt(w, 0, 0, 0); e2.speed = 60; e2.fx = { chill: { t: 100 } };
  for (let i = 0; i < 60; i++) step(w);
  assert.ok(Math.abs(e.d - 60) < 1e-6); assert.ok(Math.abs(e2.d - 30) < 1e-6);
});

test('archived Fire Mage beam ramps up, stays locked on its target, and starts over on a new one', () => {
  const { w, h } = setupArchived('firemage');
  const e = enemyAt(w, h.x + 30, h.y, 10);
  tickHero(w, h, 60); const first = dealt(e);
  tickHero(w, h, 60); const second = dealt(e) - first;
  assert.ok(first > 10 && first < 20, 'about 10-20 damage in the first second');
  assert.ok(second > first * 1.5, 'more damage in the second second');
  const e2 = enemyAt(w, h.x - 30, h.y, 50);
  tickHero(w, h, 1); assert.equal(h.lock, e, 'keeps burning the same target while it lives');
  e.hp = 0; e.dead = true; sweep(w.enemies);
  tickHero(w, h, 1); assert.ok(h.lock === e2 && h.ramp < 0.05, 'then switches and starts the ramp over');
});

test('archived Lightning Mage chains to nearby enemies, 15% weaker per jump, never twice', () => {
  const { w, h } = setupArchived('lightningmage');
  const es = [0, 1, 2, 3, 4].map(i => enemyAt(w, h.x + 20 + i * 30, h.y, 100 - i));
  const lonely = enemyAt(w, h.x - 90, h.y + 30, 1);
  tickHero(w, h);
  const got = es.map(dealt);
  assert.ok(Math.abs(got[0] - 9) < 1e-9 && Math.abs(got[1] - 9 * 0.85) < 1e-9 && Math.abs(got[3] - 9 * 0.85 ** 3) < 1e-9);
  assert.equal(got[4], 0, '3 jumps = 4 enemies'); assert.equal(dealt(lonely), 0);
});

test('archived Thief boomerang hits on the way out and again on the way back, then rearms', () => {
  const { w, h } = setupArchived('thief');
  const e = enemyAt(w, h.x + 60, h.y, 10);
  const tick = () => { tickHero(w, h); updateProjectiles(w, 1 / 60); };   /* no step(): it would move the enemy onto the path */
  tick();
  assert.ok(h.proj, 'thrown');
  for (let i = 0; i < 120 && h.proj; i++) tick();
  assert.equal(h.proj, null, 'returned');
  assert.equal(dealt(e), 24, 'hit twice');
  assert.ok(h.cd > 0, 'cooldown starts when it returns');
});

test('each kill pays gold by enemy type and counts for the hero', () => {
  const { w, h } = setup('ranger');
  const e = enemyAt(w, h.x + 30, h.y, 10, 5, 'brute');
  const g = w.gold; tickHero(w, h); land(w);
  assert.ok(e.dead); assert.equal(w.gold - g, Math.round(5 * 2.5)); assert.equal(h.kills, 1); assert.equal(w.kills, 1);
  assert.equal(h.dealt, 5, 'overkill is not counted as damage');
});

test('engine runs without visuals, and with them it reports slashes, beams and ultimates', () => {
  const { w, h } = setup('warrior');
  enemyAt(w, h.x + 30, h.y, 10);
  assert.doesNotThrow(() => tickHero(w, h));
  const seen = [];
  w.fx = { beam: () => seen.push('beam'), slash: (x, y, a, half, r, ttl, color) => seen.push('slash ' + color) };
  h.cd = 0; tickHero(w, h);
  h.cd = 0; h.energy = h.s.energyMax; tickHero(w, h);
  assert.deepEqual(seen, ['slash #c7ced6', 'slash #fff6c8'], 'the ultimate looks different');
});
