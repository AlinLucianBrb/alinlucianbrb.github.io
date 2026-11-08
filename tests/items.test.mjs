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
  for (const name of ['Prospector', 'Tax collector', 'Compound interest', 'Bulk order', 'Four-leaf clover', 'Reinforced gate']) assert.ok(!ITEM_BONUSES.includes(name), name);
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

test('the server rolls items with the same rules (finish_run), and knows every bonus', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /w1 := 28 \* \(1 \+ b_rar\); w2 := 13 \* power\(1 \+ b_rar, 2\); w3 := 4 \* power\(1 \+ b_rar, 3\);/, 'rarity weights 55/28/13/4, with talent luck');
  assert.match(sql, /rar := case when roll < 55 then 0 when roll < 55 \+ w1 then 1 when roll < 55 \+ w1 \+ w2 then 2 else 3 end;/);
  assert.deepEqual(RARITIES.map(r => r.weight), [55, 28, 13, 4]);
  assert.match(sql, /nb := rar \+ 1;\n\s+while nb < 4 and random\(\) < 0\.3 \+ b_extra loop nb := nb \+ 1; end loop;/, 'rarity + 1 bonuses, then 30% (plus talents) each, up to 4');
  assert.match(sql, /from public\.item_bonuses order by random\(\) limit nb/, 'different bonuses');
  for (const b of ITEM_BONUSES) assert.ok(sql.includes("('" + b.replace(/'/g, "''") + "')"), 'item bonus ' + b);
  for (const id in ITEMS) assert.ok(sql.includes("('" + id + "', '" + ITEMS[id].slot + "', true)"), 'item type ' + id);
  assert.match(sql, /where t\.slot <> s\.key\) then\s+raise exception 'that item does not go in that slot'/, 'save_loadout checks slots');
  assert.match(sql, /jsonb_build_object\('trinket', e\.value\)/, 'old equipment becomes a trinket');
});

test('the server rolls each bonus\'s rank with the same weights (finish_run) and stores it', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  const cum = k => ROLL.rankWeights.map(row => row.slice(0, k).reduce((a, b) => a + b, 0));
  assert.ok(sql.includes('when roll < (array[' + cum(1).join(', ') + '])[rar + 1] then 1'), 'rank 1 thresholds');
  assert.ok(sql.includes('when roll < (array[' + cum(2).join(', ') + '])[rar + 1] then 2'), 'rank 2 thresholds');
  assert.ok(sql.includes('when roll < (array[' + cum(3).join(', ') + '])[rar + 1] then 3 else 4 end'), 'rank 3 thresholds');
  assert.match(sql, /add column if not exists bonus_ranks int\[\]/);
  assert.match(sql, /insert into public\.player_items \(user_id, item_type, rarity, bonuses, bonus_ranks\)/);
});
