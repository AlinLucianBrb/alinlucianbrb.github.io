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

test('rarities are whole multiples of Common: 1x, 2x, 3x, 4x', () => {
  assert.deepEqual(RARITIES.map(r => r.mult), [1, 2, 3, 4]);
  assert.deepEqual(RARITIES.map(r => R('Sharpened rounds').desc(r.mult)), ['+25% damage (all heroes)', '+50% damage (all heroes)', '+75% damage (all heroes)', '+100% damage (all heroes)']);
  assert.deepEqual(RARITIES.map(r => R('Reinforced gate').desc(r.mult)), ['+5 lives', '+10 lives', '+15 lives', '+20 lives']);
  assert.deepEqual(RARITIES.map(r => R('Compound interest').mods(r.mult)[1].value), [60, 120, 180, 240]);
});

test('Split bolt: +1, +2, +3, +4 spell targets by rarity, nobody else changes', () => {
  const targets = RARITIES.map(r => heroStats(H('mage'), asMods(R('Split bolt').mods(r.mult))).targets);
  assert.deepEqual(targets, [3, 4, 5, 6]);
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

test('relic luck shifts the odds toward rarer relics', async () => {
  const { rarityOdds, rollRarity } = await import('../js/content/data.js');
  const r = x => Math.round(x * 1000) / 10;
  assert.deepEqual(rarityOdds(0).map(r), [55, 28, 13, 4]);
  const lucky = rarityOdds(0.5);
  assert.ok(lucky[3] > 0.08 && lucky[0] < 0.4, 'Epic about doubles, Common drops: ' + lucky.map(r).join(' / '));
  assert.ok(Math.abs(lucky.reduce((a, b) => a + b) - 1) < 1e-9);
  const count = luck => { let epic = 0; for (let i = 0; i < 10000; i++) if (rollRarity((i + 0.5) / 10000, luck) === 3) epic++; return epic; };
  assert.equal(count(0), 400); assert.ok(count(1) > 1500);
});

test('Four-leaf clover gives relic luck, and luck changes the offers the shop rolls', async () => {
  const { createWorld, recalc } = await import('../js/engine/world.js');
  const { apply } = await import('../js/engine/commands.js');
  const epics = luckM => {
    const w = createWorld({ seed: 3 }); w.gold = 1e9;
    if (luckM) { w.mods.push(...R('Four-leaf clover').mods(luckM).map(m => ({ ...m, source: 'x', ri: 0 }))); recalc(w); }
    let n = 0;
    apply(w, { type: 'buyRelic' });   /* then count offers over many rerolls, without picking (picks could add more luck) */
    for (let i = 0; i < 300; i++) { n += w.pick.offers.filter(o => o.ri === 3).length; apply(w, { type: 'reroll' }); }
    return { n, luck: w.gs.relicLuck };
  };
  const base = epics(0), lucky = epics(4);
  assert.equal(lucky.luck, 2, 'Epic clover: +200% luck');
  assert.ok(lucky.n > base.n * 3, 'far more epic offers: ' + base.n + ' -> ' + lucky.n);
});
