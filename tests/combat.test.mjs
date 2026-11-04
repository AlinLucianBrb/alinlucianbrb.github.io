/* Damage types, armor, resistances and ailments (js/engine/combat.js, js/engine/effects.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, recalc } from '../js/engine/world.js';
import { mitigate } from '../js/engine/combat.js';
import { tickEffects } from '../js/engine/effects.js';
import { AILMENTS, COMBAT_STATS } from '../js/content/combat.js';
import { HEROES } from '../js/content/data.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const near = 1e-6;
const mod = (stat, value, type = 'flat', scope = ['all']) => ({ stat, type, value, scope, source: 'test', ri: 0 });
function setup(heroId, mods = [], seed = 31) {
  const w = richWorld({ seed });
  for (const m of mods) w.mods.push(m);
  recalc(w);
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  return { w, h: place(w, heroId, ...tile) };
}
const tick = (w, e, seconds) => { for (let i = 0; i < seconds * 60; i++) tickEffects(w, e, 1 / 60); };

test('every hero has a damage type and all the combat stats, starting at 0', () => {
  assert.deepEqual(HEROES.map(h => h.damageType), ['physical', 'physical', 'spell']);
  for (const h of HEROES) for (const k in COMBAT_STATS) assert.equal(h.stats[k], 0, h.id + ' ' + k);
});

test('with no armor or resistances nothing changes: enemies take the full hit', () => {
  const { w, h } = setup('ranger');
  const e = enemyAt(w, h.x + 30, h.y, 10);
  w.attack(h, e); assert.equal(dealt(e), 16);
});

test('armor stops more of small hits than of big ones, up to 90%', () => {
  const e = { armor: 100, res: {}, fx: null };
  assert.ok(Math.abs(mitigate(e, 'physical', 20) - 20 * (1 - 100 / (100 + 100))) < near, '20 dmg vs 100 armor: half gets through');
  assert.ok(mitigate(e, 'physical', 200) / 200 > mitigate(e, 'physical', 20) / 20, 'bigger hits are reduced less');
  assert.ok(Math.abs(mitigate({ armor: 1e9, res: {} }, 'physical', 10) - 1) < near, 'never more than 90%');
  assert.equal(mitigate(e, 'fire', 20), 20, 'armor does nothing against fire');
  assert.equal(mitigate(e, 'physical', 20, false), 20, 'armor does not stop damage over time');
});

test('resistances reduce their damage type, capped at 75%; negative resistance increases it', () => {
  const e = { armor: 0, res: { fire: 0.5, cold: 0.95, lightning: -0.5 }, fx: null };
  assert.equal(mitigate(e, 'fire', 100), 50);
  assert.equal(mitigate(e, 'cold', 100), 25, 'capped at 75%');
  assert.equal(mitigate(e, 'lightning', 100), 150);
  assert.equal(mitigate(e, 'toxic', 100), 100);
});

test("added damage of other types is dealt alongside the hero's own, each reduced by its own defense", () => {
  const { w, h } = setup('warrior', [mod('fireDamage', 10), mod('toxicDamage', 4)]);
  const e = enemyAt(w, h.x + 30, h.y, 10); e.res = { fire: 0.5 };
  const types = []; w.ev.on('damage', d => types.push(d.type + ':' + d.amount));
  w.attack(h, e);
  assert.deepEqual(types, ['physical:28', 'fire:5', 'toxic:4']);
  assert.equal(dealt(e), 37);
});

test('the Mage deals spell damage, so spell resistance applies to it (and nothing else does)', () => {
  const { w, h } = setup('mage');
  const e = enemyAt(w, h.x + 20, h.y, 10); e.res = { spell: 0.5, cold: 0.75 };
  w.attack(h, e); assert.equal(dealt(e), 13);
});

test('bleed: 70% of the physical hit per second for 4 s; only the strongest bleed counts; credited to the hero', () => {
  const { w, h } = setup('warrior', [mod('bleedChance', 1)]);
  const e = enemyAt(w, h.x + 30, h.y, 10);
  w.attack(h, e);
  assert.ok(Math.abs(e.fx.bleed.dps - 0.7 * 28) < near); assert.equal(e.fx.bleed.src, h);
  const hpAfterHit = e.hp; tick(w, e, 2);
  assert.ok(Math.abs(hpAfterHit - e.hp - 2 * 0.7 * 28) < 1e-3);
  assert.ok(Math.abs(h.dealt - (28 + 2 * 0.7 * 28)) < 1e-3, 'the damage meter counts the bleed');
  w.attack(h, e, 0.5);
  assert.ok(Math.abs(e.fx.bleed.dps - 0.7 * 28) < near, 'a weaker bleed does not replace the stronger one');
  tick(w, e, 3); assert.ok(!e.fx.bleed, 'gone after its time');
});

test('poison stacks (up to 20), from physical or toxic hits, as toxic damage resisted by toxic resistance', () => {
  const { w, h } = setup('ranger', [mod('poisonChance', 1)]);
  const e = enemyAt(w, h.x + 30, h.y, 10); e.res = { toxic: 0.5 };
  for (let i = 0; i < 3; i++) w.attack(h, e);
  assert.equal(e.fx.poison.stacks.length, 3);
  const before = e.hp; tick(w, e, 1);
  assert.ok(Math.abs(before - e.hp - 3 * 0.3 * 16 * 0.5) < 1e-3, 'three stacks, halved by toxic resistance');
  for (let i = 0; i < 30; i++) w.attack(h, e);
  assert.equal(e.fx.poison.stacks.length, 20);
});

test('burn comes only from fire; a warrior with fire damage burns, one without does not', () => {
  const plain = setup('warrior', [mod('burnChance', 1)]);
  const e1 = enemyAt(plain.w, plain.h.x + 30, plain.h.y, 10); plain.w.attack(plain.h, e1);
  assert.equal(e1.fx, null, 'no fire in the hit, no burn');
  const fiery = setup('warrior', [mod('burnChance', 1), mod('fireDamage', 10)]);
  const e2 = enemyAt(fiery.w, fiery.h.x + 30, fiery.h.y, 10); fiery.w.attack(fiery.h, e2);
  assert.ok(Math.abs(e2.fx.burn.dps - 0.9 * 10) < near);
});

test('shock lowers defenses for 2 s: half the armor, and 20 points off every resistance', () => {
  const e = { armor: 100, res: { fire: 0.5, cold: 0.9 }, fx: { shock: { t: 2, armorDown: 0.5, resDown: 0.2 } } };
  assert.ok(Math.abs(mitigate(e, 'physical', 20) - 20 * (1 - 50 / (50 + 100))) < near, 'armor 100 counts as 50');
  assert.ok(Math.abs(mitigate(e, 'fire', 100) - 70) < near, '50% fire resistance counts as 30%');
  assert.ok(Math.abs(mitigate(e, 'cold', 100) - 45) < near, 'capped 75% first, then shocked down to 55%');
  assert.ok(Math.abs(mitigate(e, 'toxic', 100) - 120) < near, 'no resistance: shocked to -20%, so 20% extra');
  const { w, h } = setup('warrior', [mod('shockChance', 1), mod('lightningDamage', 5)]);
  const t = enemyAt(w, h.x + 30, h.y, 10);
  w.attack(h, t); const first = dealt(t);
  assert.equal(first, 33, 'the hit that shocks is not boosted');
  w.attack(h, t); assert.ok(Math.abs(dealt(t) - first - (28 + 6)) < near, 'next hit: physical unchanged (no armor), lightning +20%');
  tick(w, t, 2.1); assert.ok(!t.fx.shock);
});

test('freeze stops an enemy; bigger hits (relative to its life) freeze longer, up to 1.5 s', () => {
  const { w, h } = setup('warrior', [mod('freezeChance', 1), mod('coldDamage', 16)]);   /* only the cold part can freeze */
  w.phase = 'wave'; w.spawnLeft = 0;
  const e = enemyAt(w, h.x + 20, h.y, 0, 64); e.speed = 60;
  w.attack(h, e);
  assert.ok(Math.abs(e.fx.freeze.t - (0.3 + 2 * 16 / 64)) < near);
  const tough = enemyAt(w, h.x - 20, h.y, 0, 1e6); w.attack(h, tough);
  assert.ok(Math.abs(tough.fx.freeze.t - 0.3) < 1e-3, 'barely frozen: the hit is tiny next to its life');
  const big = enemyAt(w, h.x, h.y + 20, 0, 1); big.max = 1; big.hp = 1e6;
  w.attack(h, big); assert.equal(big.fx.freeze.t, 1.5, 'capped');
  assert.equal(tickEffects(w, e, 1 / 60), 0, 'a frozen enemy does not move');
});

test('chances are rolled with the seeded combat stream: same seed, same ailments; and chance works per second for beams', () => {
  const run = seed => {
    const { w, h } = setup('ranger', [mod('bleedChance', 0.3)], seed);
    const es = Array.from({ length: 40 }, (_, i) => enemyAt(w, h.x + 30, h.y, i));
    for (const e of es) w.attack(h, e);
    return { got: es.map(e => (e.fx && e.fx.bleed ? 1 : 0)).join(''), hash: hashWorld(w) };
  };
  const a = run(7), b = run(7), c = run(8);
  assert.equal(a.got, b.got); assert.equal(a.hash, b.hash); assert.notEqual(a.got, c.got);
  const n = [...a.got].filter(x => x === '1').length;
  assert.ok(n > 4 && n < 22, 'about 30% of 40 hits bleed: ' + n);
  const { w, h } = setup('ranger', [mod('bleedChance', 0.5)]);
  const e = enemyAt(w, h.x + 30, h.y, 10);
  let hits = 0; for (let i = 0; i < 6000; i++) { delete (e.fx || {}).bleed; w.attack(h, e, 1 / 60, 1 / 60); if (e.fx && e.fx.bleed) hits++; }
  assert.ok(hits > 30 && hits < 70, 'rate 1/60: about 0.5 per second over 100 s, got ' + hits);
});

test('a whole match with every ailment switched on runs, and every ailment happens', () => {
  const w = createWorld({ seed: 9, stage: 1 });
  for (const id in AILMENTS) w.mods.push(mod(id + 'Chance', 0.25));
  w.mods.push(mod('fireDamage', 3), mod('coldDamage', 3), mod('lightningDamage', 3), mod('toxicDamage', 2));
  recalc(w);
  const free = []; for (const [x, y] of w.path.slice(3)) for (const dy of [-1, 1]) { const c = [x, y + dy]; if (c[1] >= 0 && c[1] < 10 && !w.pathSet.has(c.join())) free.push(c); }
  place(w, 'warrior', ...free[0]); place(w, 'ranger', ...free[6]); place(w, 'mage', ...free[12]);
  let seen = new Set(); w.ev.on('ailment', a => seen.add(a.id));
  w.auto = true;
  for (let i = 0; i < 30000 && step(w); i++);
  assert.deepEqual([...seen].sort(), ['bleed', 'burn', 'freeze', 'poison', 'shock']);
});
