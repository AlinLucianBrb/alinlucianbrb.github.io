/* Items: five gear slots, four rarities, and 1 to 4 bonuses that are relics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOTS, ITEMS, ROLL, ITEM_BONUSES, itemMods, itemName, itemLines, asItem } from '../js/content/items.js';
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
  assert.deepEqual(asItem({ item_type: 'boots', rarity: 9, bonuses: ['Prospector', 'Prospector', 'Quick hands', 'Fine arrows', 'Whetstone', 'Arcane focus'] }),
    { type: 'boots', rarity: 3, bonuses: ['Prospector', 'Quick hands', 'Fine arrows', 'Whetstone'] }, 'no repeats, at most 4, rarity clamped');
  assert.deepEqual(asItem('power_charm'), { type: 'power_charm', rarity: 0, bonuses: [] }, 'old items: Common, no bonuses');
});

test('bonuses are the relics, at the item\'s rarity', () => {
  assert.ok(ITEM_BONUSES.length === RELICS.length, 'every relic can be a bonus');
  assert.deepEqual(itemLines({ type: 'helm', rarity: 3, bonuses: ['Sharpened rounds', 'Prospector'] }),
    [RELICS.find(r => r.name === 'Sharpened rounds').desc(4), RELICS.find(r => r.name === 'Prospector').desc(4)]);
  assert.deepEqual(itemLines({ type: 'power_charm', rarity: 0, bonuses: [] }), ['+5 damage'], "the charm's own bonus");
});

test('hero bonuses help only the wearer, and only if it has the tags; economy bonuses help the whole match', () => {
  const helm = { type: 'helm', rarity: 1, bonuses: ['Sharpened rounds', 'Whetstone', 'Tax collector'] };   /* Uncommon: x2 */
  const mods = itemMods({ ranger: [helm] });
  assert.ok(near(heroStats(H('ranger'), mods).damage, 16 * (1 + 0.1 + 0.075)), 'Sharpened rounds x2 on the Ranger');
  assert.ok(near(heroStats(H('warrior'), mods).damage, 28 * 1.1), 'nothing for the Warrior: the Ranger wears it');
  const onWarrior = itemMods({ warrior: [helm] });
  assert.ok(near(heroStats(H('warrior'), onWarrior).damage, 28 * (1 + 0.1 + 0.075 + 0.09)), 'Whetstone works on a melee hero');
  const w = createWorld({ seed: 1, items: { ranger: [helm] } });
  assert.ok(near(w.gs.waveGold, 1.5), 'Tax collector x2 helps the whole match: +50% wave gold');
});

test('items add up across slots, and Reinforced gate gives starting lives', () => {
  const gear = [{ type: 'helm', rarity: 0, bonuses: ['Quick hands'] }, { type: 'boots', rarity: 0, bonuses: ['Quick hands'] },
    { type: 'leggings', rarity: 3, bonuses: ['Reinforced gate'] }, { type: 'power_charm', rarity: 0, bonuses: [] }];
  const w = createWorld({ seed: 1, items: { mage: gear } });
  assert.equal(w.lives, 20 + 3, 'Epic Reinforced gate: +3 starting lives');
  const s = heroStats(H('mage'), itemMods({ mage: gear }));
  assert.ok(near(s.speed, 1.06), 'two Quick hands: +3% each');
  assert.ok(near(s.damage, (26 + 5) * 1.1), 'the charm still adds 5');
});

test('the server rolls items with the same rules (finish_run), and knows every bonus', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /rar := case when roll < 55 then 0 when roll < 83 then 1 when roll < 96 then 2 else 3 end;/, 'rarity weights 55/28/13/4');
  assert.deepEqual(RARITIES.map(r => r.weight), [55, 28, 13, 4]);
  assert.match(sql, /nb := rar \+ 1;\n\s+while nb < 4 and random\(\) < 0\.3 loop nb := nb \+ 1; end loop;/, 'rarity + 1 bonuses, then 30% each, up to 4');
  assert.match(sql, /from public\.item_bonuses order by random\(\) limit nb/, 'different bonuses');
  for (const b of ITEM_BONUSES) assert.ok(sql.includes("('" + b.replace(/'/g, "''") + "')"), 'item bonus ' + b);
  for (const id in ITEMS) assert.ok(sql.includes("('" + id + "', '" + ITEMS[id].slot + "', true)"), 'item type ' + id);
  assert.match(sql, /where t\.slot <> s\.key\) then\s+raise exception 'that item does not go in that slot'/, 'save_loadout checks slots');
  assert.match(sql, /jsonb_build_object\('trinket', e\.value\)/, 'old equipment becomes a trinket');
});
