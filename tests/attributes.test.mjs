/* Attributes: strength, dexterity and intellect. Each hero has one of its own, and each point of it is +1% increased damage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, ATTRIBUTES, ATTRIBUTE_DAMAGE, evolvedDef } from '../js/content/data.js';
import { heroStats, attributeDamage, touches } from '../js/engine/stats.js';
import { levelMods } from '../js/engine/levels.js';

const H = id => HEROES.find(h => h.id === id);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('every hero has all three attributes and one of its own: Warrior strength, Ranger dexterity, Mage intellect', () => {
  assert.deepEqual(ATTRIBUTES, ['strength', 'dexterity', 'intellect']);
  assert.deepEqual(HEROES.map(h => h.attribute), ['strength', 'dexterity', 'intellect']);
  for (const h of HEROES) { for (const a of ATTRIBUTES) assert.ok(a in h.stats, h.id + ' ' + a); assert.equal(h.stats[h.attribute], 10); }
  const hunter = evolvedDef(H('ranger'), H('ranger').evolutions[0].choices[2]);
  assert.equal(hunter.attribute, 'dexterity', 'evolved forms keep the attribute');
});

test("only the hero's own attribute raises its damage: +1% increased per point, adding up with other increases", () => {
  assert.equal(ATTRIBUTE_DAMAGE, 0.01);
  const w = heroStats(H('warrior'), []);
  assert.ok(near(attributeDamage(H('warrior'), w), 0.10)); assert.ok(near(w.damage, 28 * 1.10));
  const str = m => ({ stat: 'strength', type: 'flat', value: m, scope: ['all'] }), dex = { stat: 'dexterity', type: 'flat', value: 50, scope: ['all'] };
  assert.ok(near(heroStats(H('warrior'), [str(20)]).damage, 28 * 1.30), '+20 strength: +30% in all');
  assert.ok(near(heroStats(H('warrior'), [dex]).damage, 28 * 1.10), 'dexterity does nothing for the Warrior');
  assert.ok(near(heroStats(H('ranger'), [dex]).damage, 16 * 1.60), '...but it does for the Ranger');
  const inc = { stat: 'damage', type: 'inc', value: 0.5, scope: ['all'] }, more = { stat: 'damage', type: 'more', value: 0.5, scope: ['all'] };
  assert.ok(near(heroStats(H('mage'), [inc, more]).damage, 26 * (1 + 0.5 + 0.1) * 1.5), 'increased adds, more multiplies');
});

test('hero levels raise the main attribute (+3 a level), whichever it is', () => {
  const lv = levelMods(10);
  assert.ok(touches(H('mage'), lv[0]));
  assert.equal(heroStats(H('mage'), lv).intellect, 37); assert.equal(heroStats(H('mage'), lv).strength, 2);
  assert.equal(heroStats(H('warrior'), lv).strength, 37);
  assert.ok(near(heroStats(H('ranger'), lv).damage, 16 * 1.37));
});
