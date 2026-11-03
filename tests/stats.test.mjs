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
  assert.ok(Math.abs(heroStats(H('archer'), mods).damage - 10 * (1 + 0.375 + 0.3)) < 1e-9);
  assert.ok(Math.abs(heroStats(H('warrior'), mods).damage - 16 * 1.375) < 1e-9, 'Fine arrows (projectile) skips the warrior');
  assert.equal('speed' in heroStats(H('firemage'), mods), false, 'the beam has no attack speed');
  assert.equal(touches(H('firemage'), R('Quick hands').mods(1)[0]), false);
  assert.equal(touches(H('archer'), R('Quick hands').mods(1)[0]), true);
});

test('explain lists the modifiers behind a stat', () => {
  const mods = asMods([...R('Sharpened rounds').mods(1), ...R('Prism').mods(1)]);
  assert.equal(explain(H('archer'), 'damage', mods).length, 1);
  assert.equal(explain(H('firemage'), 'damage', mods).length, 2);
});

test('Deep freeze: more Frost Mage targets by rarity (1, 1, 2, 3), nobody else changes', () => {
  const targets = RARITIES.map(r => heroStats(H('frostmage'), asMods(R('Deep freeze').mods(r.mult))).targets);
  assert.deepEqual(targets, [2, 2, 3, 4]);
  assert.equal(heroStats(H('archer'), asMods(R('Deep freeze').mods(3))).targets, undefined);
});

test('relic indicator lists only the hero types that would be affected', () => {
  const heroes = [{ type: 1, def: H('archer') }, { type: 1, def: H('archer') }, { type: 5, def: H('lightningmage') }];
  const a = affected(R('Fine arrows'), 1, heroes);
  assert.equal(a.global, false); assert.deepEqual([...a.types], [[1, 2]]);
  assert.equal(affected(R('Prospector'), 1, heroes).global, true);
  assert.equal(affected(R('Prism'), 1, heroes).types.size, 0);
});

test('relic descriptions scale with rarity', () => {
  assert.equal(R('Sharpened rounds').desc(1), '+25% damage (all heroes)');
  assert.equal(R('Sharpened rounds').desc(3), '+75% damage (all heroes)');
  assert.equal(fmtMod({ stat: 'damage', type: 'inc', value: 0.04, scope: ['all'] }), '+4% damage');
  assert.equal(fmtMod({ stat: 'heroCost', type: 'more', value: -0.05, scope: 'global' }), '×0.95 hero cost');
});
