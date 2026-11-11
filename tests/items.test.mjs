/* Items: five gear slots, four rarities, and 1 to 4 bonuses that are relics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOTS, ITEMS, ROLL, RANKS, ITEM_BONUSES, itemMods, itemName, itemLines, asItem, rankColor } from '../js/content/items.js';
import { HEROES, RELICS, RARITIES } from '../js/content/data.js';
import { heroStats } from '../js/engine/stats.js';
import { createWorld } from '../js/engine/world.js';

const H = id => HEROES.find(h => h.id === id);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('five slots: helm, body armour, legs, boots and a trinket, with an item type for each', () => {
  assert.deepEqual(SLOTS, ['helm', 'body', 'legs', 'boots', 'trinket']);
  for (const slot of SLOTS) assert.ok(Object.values(ITEMS).some(t => t.slot === slot), 'an item for ' + slot);
});

test('rarities and bonuses: Common has at least 1 bonus, Uncommon 2, Rare 3, Epic 4; never more than 4', () => {
  assert.deepEqual(RARITIES.map((r, i) => ROLL.guaranteed(i)), [1, 2, 3, 4]);
  assert.equal(ROLL.maxBonuses, 4); assert.equal(ROLL.extraChance, 0.3);
  assert.equal(itemName({ type: 'helm', rarity: 2, bonuses: [] }), 'Rare Helm');
  assert.deepEqual(asItem({ item_type: 'boots', rarity: 9, bonuses: ['Keen edge', 'Keen edge', 'Quick hands', 'Fine arrows', 'Whetstone', 'Arcane focus'], bonus_ranks: [2, 2, 1, 4, 3, 1] }),
    { type: 'boots', rarity: 3, bonuses: ['Keen edge', 'Quick hands', 'Fine arrows', 'Whetstone'], ranks: [2, 1, 4, 3] }, 'no repeats (with their ranks), at most 4, rarity clamped');
  assert.deepEqual(asItem('power_charm'), { type: 'power_charm', rarity: 0, bonuses: [], ranks: [] }, 'old items: Common, no bonuses');
  assert.deepEqual(asItem({ item_type: 'helm', rarity: 2, bonuses: ['Keen edge'] }).ranks, [3], 'items from before ranks: each bonus at the item\'s rarity');
});

test('each bonus has its own rank, 1 to 4; rarer items roll higher ranks more often', () => {
  assert.equal(RANKS, 4);
  const w = ROLL.rankWeights;
  assert.equal(w.length, 4);
  for (const row of w) assert.equal(row.reduce((a, b) => a + b, 0), 100);
  const avg = row => row.reduce((a, x, i) => a + x * (i + 1), 0) / 100;
  for (let i = 1; i < 4; i++) assert.ok(avg(w[i]) > avg(w[i - 1]), 'rarer items: higher ranks on average');
  assert.ok(w[0][3] > 0 && w[3][0] > 0, 'a rank is never guaranteed by the rarity: a Common item can roll rank 4, an Epic one rank 1');
  assert.deepEqual([1, 2, 3, 4].map(rankColor), RARITIES.map(r => r.color), 'ranks use the rarity colours');
});

test('gear keeps the hero bonuses (damage, speed, crits, energy, minions) and drops gold, XP and lives', () => {
  for (const name of ['Prospector', 'Tax collector', 'Compound interest', 'Four-leaf clover', 'Reinforced gate']) assert.ok(!ITEM_BONUSES.includes(name), name);
  for (const name of ['Sharpened rounds', 'Quick hands', 'Battle focus', 'Keen edge', 'Pack leader', 'Feral haste', 'Hunting instinct', 'Savage bite']) assert.ok(ITEM_BONUSES.includes(name), name);
  const old = { type: 'helm', rarity: 1, bonuses: ['Prospector', 'Keen edge'], ranks: [4, 1] };
  assert.deepEqual(itemLines(old), [RELICS.find(r => r.name === 'Keen edge').desc(1)], 'an old gold bonus no longer shows as working');
  assert.equal(itemMods({ ranger: [old] }).length, 1, 'and gives nothing');
  const w = createWorld({ seed: 1, items: { ranger: [{ type: 'helm', rarity: 3, bonuses: ['Tax collector'] }] } });
  assert.ok(near(w.gs.waveGold, 1), 'no wave gold from gear');
});

test('bonuses are the relics, at their rank', () => {
  assert.deepEqual(itemLines({ type: 'helm', rarity: 0, bonuses: ['Sharpened rounds', 'Whetstone'], ranks: [4, 2] }),
    [RELICS.find(r => r.name === 'Sharpened rounds').desc(4), RELICS.find(r => r.name === 'Whetstone').desc(2)], 'a Common item can carry a rank 4 bonus');
  assert.deepEqual(itemLines({ type: 'power_charm', rarity: 0, bonuses: [] }), ['+5 damage'], "the charm's own bonus");
});

test('hero bonuses help only the wearer, and only if it has the tags; each counts at its rank', () => {
  const helm = { type: 'helm', rarity: 3, bonuses: ['Sharpened rounds', 'Whetstone'], ranks: [2, 2] };   /* rank 2: x2 */
  const mods = itemMods({ ranger: [helm] });
  assert.ok(near(heroStats(H('ranger'), mods).damage, 16 * (1 + 0.1 + 0.075)), 'Sharpened rounds rank 2 on the Ranger');
  assert.ok(near(heroStats(H('warrior'), mods).damage, 28 * 1.1), 'nothing for the Warrior: the Ranger wears it');
  const onWarrior = itemMods({ warrior: [helm] });
  assert.ok(near(heroStats(H('warrior'), onWarrior).damage, 28 * (1 + 0.1 + 0.075 + 0.09)), 'Whetstone works on a melee hero');
});

test('items add up across slots', () => {
  const gear = [{ type: 'helm', rarity: 0, bonuses: ['Quick hands'] }, { type: 'boots', rarity: 0, bonuses: ['Quick hands'] },
    { type: 'power_charm', rarity: 0, bonuses: [] }];
  const s = heroStats(H('ranger'), itemMods({ ranger: gear }));
  assert.ok(near(s.speed, 1.06), 'two Quick hands: +3% each');
  assert.ok(near(s.damage, (16 + 5) * 1.1), 'the charm still adds 5');
});

test('the server knows every bonus and item type, and rolls with the shared rules (rule_rarity, rule_rank...)', async () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.deepEqual(RARITIES.map(r => r.weight), [55, 28, 13, 4]);
  assert.ok(sql.includes("values (0, 55 * power(1 + greatest(p_luck, 0), 0)), (1, 28 * power(1 + greatest(p_luck, 0), 1))"), 'rarity weights from RARITIES');
  assert.ok(sql.includes('when p_roll * 100 < (array[70, 45, 25, 10])[p_rarity + 1] then 1'), 'rank weights from ROLL.rankWeights');
  assert.ok(sql.includes('public.rule_extra_bonus_chance() returns numeric\nlanguage sql immutable set search_path = public as $$ select ' + ROLL.extraChance + ' $$'));
  assert.ok(sql.includes('public.rule_affinity_chance() returns numeric\nlanguage sql immutable set search_path = public as $$ select ' + ROLL.affinityChance + ' $$'));
  assert.match(sql, /select id into pick from public\.item_bonuses where id <> all \(bon\) order by random\(\) limit 1/, 'different bonuses');
  assert.match(sql, /where aff = any \(tags\) and id <> all \(bon\)/);
  const { AFFINITY } = await import('../js/content/items.js');
  for (const b of ITEM_BONUSES) {
    const tags = Object.keys(AFFINITY).filter(k => AFFINITY[k].includes(b));
    assert.ok(sql.includes("('" + b.replace(/'/g, "''") + "', array[" + tags.map(t => "'" + t + "'").join(', ') + ']::text[])'), 'item bonus ' + b + ' with its archetypes');
  }
  assert.match(sql, /where t\.slot <> s\.key\) then\s+raise exception 'that item does not go in that slot'/, 'save_loadout checks slots');
  assert.match(sql, /jsonb_build_object\('trinket', e\.value\)/, 'old equipment becomes a trinket');
  assert.match(sql, /add column if not exists bonus_ranks int\[\]/);
  assert.match(sql, /insert into public\.player_items \(user_id, item_type, rarity, bonuses, bonus_ranks\)/);
});

test('archetype items: every slot has a melee, projectile, spell and minion item that leans toward its bonuses', async () => {
  const { AFFINITY, sellPrice, SELL } = await import('../js/content/items.js');
  for (const slot of SLOTS) for (const a of ['melee', 'projectile', 'spell', 'minion'])
    assert.ok(Object.values(ITEMS).some(t => t.slot === slot && t.affinity === a), slot + ' ' + a);
  assert.equal(ROLL.affinityChance, 0.6);
  for (const a in AFFINITY) { assert.ok(AFFINITY[a].length >= 4, a); for (const b of AFFINITY[a]) assert.ok(ITEM_BONUSES.includes(b), b + ' can roll on items'); }
  /* selling: the same price on both sides */
  assert.deepEqual(SELL, { base: [5, 15, 40, 100], perRank: 5 });
  assert.equal(sellPrice({ item_type: 'helm', rarity: 3, bonuses: ['Keen edge', 'Cruelty'], bonus_ranks: [4, 1] }), 100 + 25);
  assert.equal(sellPrice({ item_type: 'helm', rarity: 2, bonuses: ['Keen edge', 'Cruelty'] }), 40 + 30, 'old items: ranks at the rarity');
  assert.equal(sellPrice('power_charm'), 5);
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes('select (array[' + SELL.base.join(', ') + '])[least(greatest(p_rarity, 0), 3) + 1] + ' + SELL.perRank + ' * coalesce('), 'the server price is written from SELL');
  assert.match(sql, /raise exception 'take the item off before selling it'/);
  assert.match(sql, /grant execute on function public\.sell_item\(uuid\) to authenticated;/);
});

test('gear that does not fit its wearer counts as its general version at 80%; a path\'s tags count from the start', async () => {
  const { fitMod, FALLBACK } = await import('../js/content/items.js');
  const { createWorld } = await import('../js/engine/world.js');
  const fine = { stat: 'damage', type: 'inc', value: 0.1, scope: ['projectile'], source: 'X', need: 'rogue' };
  assert.equal(fitMod(fine, { tags: ['melee', 'projectile', 'rogue'] }), fine, 'fits: as it is');
  const g = fitMod(fine, { tags: ['melee', 'rogue'], rate: 'speed' });
  assert.deepEqual([g.stat, g.scope], ['damage', ['all']]); assert.ok(Math.abs(g.value - 0.1 * FALLBACK) < 1e-12);
  assert.equal(fitMod({ stat: 'minionSpeed', type: 'inc', value: 0.1, scope: ['minion'] }, { tags: ['spell'], rate: 'castSpeed' }).stat, 'castSpeed');
  /* a Pack leader item on a Druid: general damage without a path, minion damage on the Animalic path */
  const item = { type: 'fang_necklace', rarity: 0, bonuses: ['Pack leader'], ranks: [1] };
  const plain = createWorld({ lineup: ['druid'], items: { druid: [item] } }).mods.filter(m => /Pack leader/.test(m.source));
  const path = createWorld({ lineup: ['druid'], items: { druid: [item] }, paths: { druid: 'animalic' } }).mods.filter(m => /Pack leader/.test(m.source));
  assert.equal(plain[0].stat, 'damage'); assert.equal(path[0].stat, 'minionDamage');
});

test('attribute bonuses: named attributes and the main attribute can be item bonuses', async () => {
  const { ITEM_BONUSES } = await import('../js/content/items.js');
  for (const n of ['Brawn', 'Finesse', 'Insight', 'Prowess']) assert.ok(ITEM_BONUSES.includes(n), n);
});
