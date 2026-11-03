import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, heroStats, explain, touches, affected, matches } from '../js/engine/stats.js';
import { fmtMod } from '../js/content/format.js';
import { HEROES, RELICS, RARITIES } from '../js/content/data.js';

const H = id => HEROES.find(h => h.id === id);
const R = n => RELICS.find(r => r.name === n);
const asMods = (list, ri = 0) => list.map(m => ({ ...m, source: 't', ri }));

test('modifier math: (base + flat) x (1 + sum of inc) x every more', () => {
  const mods = [
    { stat: 'damage', type: 'flat', value: 2, scope: ['all'] }, { stat: 'damage', type: 'inc', value: 0.25, scope: ['all'] },
    { stat: 'damage', type: 'inc', value: 0.3, scope: ['all'] }, { stat: 'damage', type: 'more', value: -0.15, scope: ['all'] },
    { stat: 'damage', type: 'more', value: 0.1, scope: ['all'] }
  ];
  assert.ok(Math.abs(resolve(10, 'damage', mods, ['melee']) - 12 * 1.55 * 0.85 * 1.1) < 1e-9);
});

test('scope: tags, "all" and global are kept apart', () => {
  const m = [{ stat: 'damage', type: 'inc', value: 1, scope: ['cold'] }, { stat: 'bounty', type: 'flat', value: 3, scope: 'global' }];
  assert.equal(resolve(10, 'damage', m, ['cold', 'spell']), 20);
  assert.equal(resolve(10, 'damage', m, ['fire']), 10);
  assert.equal(resolve(5, 'bounty', m, null), 8);
  assert.equal(resolve(5, 'bounty', m, ['cold']), 5, 'a global modifier never applies to a hero');
  assert.ok(matches(['all'], ['x']) && !matches(['y'], ['x']));
});

test('hero stats apply only matching modifiers and only to stats the hero has', () => {
  const mods = asMods([...R('Sharpened rounds').mods(1.5), ...R('Fine arrows').mods(1), ...R('Quick hands').mods(1)]);
  assert.ok(Math.abs(heroStats(H('ranger'), mods).damage - 16 * (1 + 0.375 + 0.3)) < 1e-9);
  assert.ok(Math.abs(heroStats(H('warrior'), mods).damage - 28 * 1.375) < 1e-9, 'Fine arrows (projectile) skips the warrior');
  assert.equal('arc' in heroStats(H('ranger'), mods), false, 'only the warrior has a swing arc');
  assert.equal(touches(H('ranger'), R('Wide swing').mods(1)[0]), false);
  assert.equal(touches(H('ranger'), R('Quick hands').mods(1)[0]), true);
});

test('every hero has an energy bar and an ultimate; every relic can affect at least one playable hero or the economy', async () => {
  const { ULTIMATES } = await import('../js/engine/ultimates.js');
  for (const h of HEROES) { assert.ok(h.stats.energyMax > 0 && h.stats.energyPerAttack > 0, h.id); assert.ok(ULTIMATES[h.ultimate], h.id); assert.ok(h.evolutions.length >= 1, h.id); }
  for (const r of RELICS) {
    const ms = r.mods ? r.mods(1) : [];
    assert.ok(r.onPick || ms.some(m => m.scope === 'global' || HEROES.some(h => touches(h, m))), r.name + ' does nothing for any playable hero');
  }
});

test('explain lists the modifiers behind a stat', () => {
  const mods = asMods([...R('Sharpened rounds').mods(1), ...R('Arcane focus').mods(1)]);
  assert.equal(explain(H('ranger'), 'damage', mods).length, 1);
  assert.equal(explain(H('mage'), 'damage', mods).length, 2);
});

test('Split bolt: more spell targets by rarity (+1, +1, +2, +3), nobody else changes', () => {
  const targets = RARITIES.map(r => heroStats(H('mage'), asMods(R('Split bolt').mods(r.mult))).targets);
  assert.deepEqual(targets, [3, 3, 4, 5]);
  assert.equal(heroStats(H('ranger'), asMods(R('Split bolt').mods(3))).targets, undefined);
});

test('relic indicator lists only the hero types that would be affected', () => {
  const heroes = [{ type: 1, def: H('ranger') }, { type: 2, def: H('mage') }];
  const a = affected(R('Fine arrows'), 1, heroes);
  assert.equal(a.global, false); assert.deepEqual([...a.types], [[1, 1]]);
  assert.equal(affected(R('Prospector'), 1, heroes).global, true);
  assert.equal(affected(R('Wide swing'), 1, heroes).types.size, 0, 'no warrior on the map');
});

test('relic descriptions scale with rarity', () => {
  assert.equal(R('Sharpened rounds').desc(1), '+25% damage (all heroes)');
  assert.equal(R('Sharpened rounds').desc(3), '+75% damage (all heroes)');
  assert.equal(fmtMod({ stat: 'damage', type: 'inc', value: 0.04, scope: ['all'] }), '+4% damage');
  assert.equal(fmtMod({ stat: 'evolveCost', type: 'more', value: -0.05, scope: 'global' }), '×0.95 evolution cost');
});
