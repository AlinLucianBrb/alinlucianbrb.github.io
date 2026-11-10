import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, heroStats, explain, touches, affected, matches } from '../js/engine/stats.js';
import { fmtMod } from '../js/content/format.js';
import { HEROES, RELICS, RARITIES, evolvedDef } from '../js/content/data.js';

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
  assert.ok(Math.abs(heroStats(H('ranger'), mods).damage - 16 * (1 + 0.05625 + 0.045 + 0.1)) < 1e-9, 'relics add to the +10% from dexterity');
  assert.ok(Math.abs(heroStats(H('warrior'), mods).damage - 28 * 1.15625) < 1e-9, 'Fine arrows (projectile) skips the warrior');
  assert.equal('arc' in heroStats(H('warrior'), mods), false, 'no swing arc stat any more (the swing is part of the hero)');
  assert.equal(R('Wide swing'), undefined);
  assert.equal(touches(H('ranger'), R('Whetstone').mods(1)[0]), false);
  assert.equal(touches(H('ranger'), R('Quick hands').mods(1)[0]), true);
});

test('every hero has an energy bar and an ultimate; every relic can affect at least one playable hero or the economy', async () => {
  const { ULTIMATES } = await import('../js/engine/ultimates.js');
  await import('../js/engine/kits/index.js');
  for (const h of HEROES) { assert.ok(h.stats.energyMax > 0 && h.stats.energyPerAttack > 0, h.id); assert.ok(ULTIMATES[h.ultimate], h.id); assert.ok(h.evolutions.length >= 1, h.id); }
  for (const r of RELICS) {
    const ms = r.mods ? r.mods(1) : [];
    const forms = HEROES.flatMap(h => [h, ...h.evolutions.flatMap(st => st.choices.map(c => evolvedDef(h, c)))]);   /* minion relics need the Animalic Druid */
    assert.ok(r.onPick || ms.some(m => m.scope === 'global' || forms.some(h => touches(h, m))), r.name + ' does nothing for any playable hero');
  }
});

test('explain lists the modifiers behind a stat', () => {
  const mods = asMods([...R('Sharpened rounds').mods(1), ...R('Arcane focus').mods(1)]);
  assert.equal(explain(H('ranger'), 'damage', mods).length, 1);
  assert.equal(explain(H('mage'), 'damage', mods).length, 2);
});

test('rarities are whole multiples of Common: 1x, 2x, 3x, 4x, and relics are 15% of their old strength', () => {
  assert.deepEqual(RARITIES.map(r => r.mult), [1, 2, 3, 4]);
  assert.deepEqual(RARITIES.map(r => R('Sharpened rounds').desc(r.mult)), ['+3.75% damage (all heroes)', '+7.5% damage (all heroes)', '+11.25% damage (all heroes)', '+15% damage (all heroes)']);
  assert.deepEqual(RARITIES.map(r => R('Reinforced gate').desc(r.mult)), ['+1 life', '+2 lives', '+2 lives', '+3 lives'], 'whole lives, at least 1');
  assert.deepEqual(RARITIES.map(r => R('Compound interest').mods(r.mult)[1].value), [60, 120, 180, 240], 'Compound interest keeps its full strength');
  assert.deepEqual(RARITIES.map(r => R('Prospector').desc(r.mult)), ['25% chance of +2 gold per kill', '50% chance of +2 gold per kill', '75% chance of +2 gold per kill', '+2 gold per kill (100%)']);
  assert.equal(R('Prospector').desc(10), '+4 gold per kill, and a 50% chance of +2 more (250%)', 'past 100% it rolls again');
  assert.deepEqual(RARITIES.map(r => R('Tax collector').mods(r.mult)[0].value), [0.25, 0.5, 0.75, 1], 'half the old wave gold');
});

test('Prospector: chances add up; each full 100% is a sure +2 gold per kill', async () => {
  const { createWorld, recalc } = await import('../js/engine/world.js');
  const killGold = (copies, kills = 400) => {
    const w = createWorld({ seed: 4 });
    for (const m of copies) w.mods.push(...R('Prospector').mods(m).map(x => ({ ...x, source: 'Prospector', ri: m - 1 })));
    recalc(w);
    const g0 = w.gold;
    for (let i = 0; i < kills; i++) w.ev.emit('kill', { enemy: { def: { bounty: 1, xp: 0 } } });
    return (w.gold - g0) / kills - 5;   /* minus the normal 5 gold per kill */
  };
  assert.equal(killGold([]), 0);
  assert.equal(killGold([4]), 2, 'Epic: always +2');
  assert.equal(killGold([4, 4]), 4, 'two Epics: always +4');
  const c = killGold([1]);
  assert.ok(c > 0.35 && c < 0.65, 'Common: about 25% x 2 = 0.5 gold per kill on average, got ' + c);
});

test('Split bolt: a 15% chance of one more target per Common, by rarity; nobody else changes', () => {
  const targets = RARITIES.map(r => +heroStats(H('mage'), asMods(R('Split bolt').mods(r.mult))).targets.toFixed(6));
  assert.deepEqual(targets, [1.15, 1.3, 1.45, 1.6]);
  assert.equal(heroStats(H('ranger'), asMods(R('Split bolt').mods(3))).targets, undefined);
});

test('relic indicator lists only the hero types that would be affected', () => {
  const heroes = [{ type: 1, def: H('ranger') }, { type: 2, def: H('mage') }];
  const a = affected(R('Fine arrows'), 1, heroes);   /* projectile delivery: the Ranger's arrows and the Mage's bolts */
  assert.equal(a.global, false); assert.deepEqual([...a.types], [[1, 1], [2, 1]]);
  assert.deepEqual([...affected(R('Whetstone'), 1, heroes).types], [], 'no melee hero');
  assert.equal(affected(R('Prospector'), 1, heroes).global, true);
});

test('relic descriptions scale with rarity', () => {
  assert.equal(R('Sharpened rounds').desc(1), '+3.75% damage (all heroes)');
  assert.equal(R('Split bolt').desc(2), 'Spell attacks: 30% chance to hit 1 more target');
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
    const w = createWorld({ seed: 3 }); w.gold = 1e9; w.rerolls = 300;   /* test only: plenty of free rerolls */
    if (luckM) { w.mods.push(...R('Four-leaf clover').mods(luckM).map(m => ({ ...m, source: 'x', ri: 0 }))); recalc(w); }
    let n = 0;
    apply(w, { type: 'buyRelic' });   /* then count offers over many rerolls, without picking (picks could add more luck) */
    for (let i = 0; i < 300; i++) { n += w.pick.offers.filter(o => o.ri === 3).length; apply(w, { type: 'reroll' }); }
    return { n, luck: w.gs.relicLuck };
  };
  const base = epics(0), lucky = epics(4);
  assert.ok(Math.abs(lucky.luck - 0.3) < 1e-9, 'Epic clover: +30% luck');
  assert.ok(lucky.n > base.n * 1.4, 'more epic offers: ' + base.n + ' -> ' + lucky.n);
});
