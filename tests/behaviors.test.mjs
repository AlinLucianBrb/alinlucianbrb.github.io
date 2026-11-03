import test from 'node:test';
import assert from 'node:assert/strict';
import { step, recalc } from '../js/engine/world.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { sweep } from '../js/engine/enemies.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { RELICS } from '../js/content/data.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

/* Heroes are placed on a free tile; enemies are put at exact spots around them, standing still. */
function setup(heroId, freeTile = null) {
  const w = richWorld({ seed: 31 });
  let tile = freeTile;
  for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, heroId, ...tile);
  return { w, h };
}
const tickHero = (w, h, n = 1) => { for (let i = 0; i < n; i++) BEHAVIORS[h.def.kind].update(w, h, 1 / 60); };

test('archer hits the enemy furthest along the path, within range only', () => {
  const { w, h } = setup('archer');
  const near = enemyAt(w, h.x + 30, h.y, 5), ahead = enemyAt(w, h.x - 30, h.y, 50), far = enemyAt(w, h.x + 500, h.y, 999);
  tickHero(w, h);
  assert.equal(dealt(ahead), 10); assert.equal(dealt(near), 0); assert.equal(dealt(far), 0);
  tickHero(w, h, 10); assert.equal(dealt(ahead), 10, 'cooldown');
  tickHero(w, h, 25); assert.equal(dealt(ahead), 20, 'fires again after 0.5 s');
});

test('warrior swing hits everything inside the arc and range, nothing behind it', () => {
  const { w, h } = setup('warrior');
  const target = enemyAt(w, h.x + 40, h.y, 100), side = enemyAt(w, h.x + 30, h.y + 25, 1), behind = enemyAt(w, h.x - 40, h.y, 2), out = enemyAt(w, h.x + 80, h.y, 3);
  tickHero(w, h);
  assert.equal(dealt(target), 16); assert.equal(dealt(side), 16, 'within 60 degrees of the swing');
  assert.equal(dealt(behind), 0); assert.equal(dealt(out), 0);
});

test('frost mage chills, and Deep freeze adds targets', () => {
  const { w, h } = setup('frostmage');
  const a = enemyAt(w, h.x + 20, h.y, 30), b = enemyAt(w, h.x - 20, h.y, 20), c = enemyAt(w, h.x, h.y + 20, 10);
  tickHero(w, h);
  assert.deepEqual([dealt(a), dealt(b), dealt(c)], [3, 0, 0]);
  assert.ok(a.fx.chill > 1.4);
  w.mods.push(...RELICS.find(r => r.name === 'Deep freeze').mods(2).map(m => ({ ...m, source: 't', ri: 2 }))); recalc(w);
  h.cd = 0; tickHero(w, h);
  assert.deepEqual([dealt(a), dealt(b), dealt(c)], [6, 3, 3], 'Rare Deep freeze: 3 targets');
});

test('chilled enemies move at half speed', () => {
  const w = richWorld({ seed: 3 }); w.phase = 'wave'; w.spawnLeft = 0;
  const e = enemyAt(w, 0, 0, 0); e.speed = 60;
  const e2 = enemyAt(w, 0, 0, 0); e2.speed = 60; e2.fx = { chill: 100 };
  for (let i = 0; i < 60; i++) step(w);
  assert.ok(Math.abs(e.d - 60) < 1e-6); assert.ok(Math.abs(e2.d - 30) < 1e-6);
});

test('fire mage beam ramps up, stays locked on its target, and starts over on a new one', () => {
  const { w, h } = setup('firemage');
  const e = enemyAt(w, h.x + 30, h.y, 10);
  tickHero(w, h, 60); const first = dealt(e);
  tickHero(w, h, 60); const second = dealt(e) - first;
  assert.ok(first > 10 && first < 20, 'about 10-20 damage in the first second');
  assert.ok(second > first * 1.5, 'more damage in the second second');
  tickHero(w, h, 600); const capped = dealt(e); tickHero(w, h, 60);
  assert.ok(Math.abs(dealt(e) - capped - 40) < 0.5, 'capped at 4x (40 per second)');
  const e2 = enemyAt(w, h.x - 30, h.y, 50);
  tickHero(w, h, 1); assert.equal(h.lock, e, 'keeps burning the same target while it lives');
  e.hp = 0; e.dead = true; sweep(w.enemies);
  tickHero(w, h, 1); assert.ok(h.lock === e2 && h.ramp < 0.05, 'then switches and starts the ramp over');
});

test('lightning mage chains to nearby enemies, 15% weaker per jump, never twice', () => {
  const { w, h } = setup('lightningmage');
  const es = [0, 1, 2, 3, 4].map(i => enemyAt(w, h.x + 20 + i * 30, h.y, 100 - i));
  const lonely = enemyAt(w, h.x - 90, h.y + 30, 1);
  tickHero(w, h);
  const got = es.map(dealt);
  assert.ok(Math.abs(got[0] - 9) < 1e-9 && Math.abs(got[1] - 9 * 0.85) < 1e-9 && Math.abs(got[3] - 9 * 0.85 ** 3) < 1e-9);
  assert.equal(got[4], 0, '3 jumps = 4 enemies'); assert.equal(dealt(lonely), 0);
});

test('thief boomerang hits on the way out and again on the way back, then rearms', () => {
  const { w, h } = setup('thief');
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
  const { w, h } = setup('archer');
  const e = enemyAt(w, h.x + 30, h.y, 10, 5, 'brute');
  const g = w.gold; tickHero(w, h);
  assert.ok(e.dead); assert.equal(w.gold - g, Math.round(5 * 2.5)); assert.equal(h.kills, 1); assert.equal(w.kills, 1);
  assert.equal(h.dealt, 5, 'overkill is not counted as damage');
});

test('engine runs without visuals, and with them it reports beams and slashes', () => {
  const { w, h } = setup('warrior');
  enemyAt(w, h.x + 30, h.y, 10);
  assert.doesNotThrow(() => tickHero(w, h));
  const seen = [];
  w.fx = { beam: () => seen.push('beam'), slash: () => seen.push('slash') };
  h.cd = 0; tickHero(w, h);
  assert.deepEqual(seen, ['slash']);
});
