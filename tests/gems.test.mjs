/* Gems (js/content/gems.js): the two families and their types, what a gem gives, gems in item sockets reaching the hero,
   Rough Stone from a match, and the server's copy (sql/56-gems.sql, the generated rules and gem kinds). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GEM_FAMILIES, FAMILY_IDS, GEM_TYPES, GEM_TYPE_IDS, GEM_CRAFT, STONES, SOCKETS, familyOf, asGem, gemValue, gemName, gemLine, gemMods, stonesFor, gemCraftProblem } from '../js/content/gems.js';
import { asItem, itemMods, itemBonusLines, ilvlMult } from '../js/content/items.js';
import { DAMAGE_TYPES, COMBAT_STATS } from '../js/content/combat.js';
import { STAGES, ENDLESS } from '../js/content/data.js';

const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');

test('two families of four: every damage type is one gem type, in exactly one family', () => {
  assert.deepEqual(FAMILY_IDS, ['elemental', 'primal']);
  assert.deepEqual(GEM_FAMILIES.elemental.types, ['arcane', 'fire', 'cold', 'lightning']);
  assert.deepEqual(GEM_FAMILIES.primal.types, ['physical', 'toxic', 'holy', 'shadow']);
  assert.deepEqual([...GEM_TYPE_IDS].sort(), [...DAMAGE_TYPES].sort());
  for (const t of GEM_TYPE_IDS) {
    assert.equal(FAMILY_IDS.filter(f => GEM_FAMILIES[f].types.includes(t)).length, 1, t);
    assert.equal(familyOf(t), FAMILY_IDS.find(f => GEM_FAMILIES[f].types.includes(t)));
    assert.ok(GEM_TYPES[t].stats.length >= 2, t + ' has a pool to roll from');
    assert.equal(GEM_TYPES[t].stats[0].stat, t + 'Damage', t + ' always can roll its added damage');
  }
});

test('every gem stat is a real hero stat', () => {
  const known = new Set([...Object.keys(COMBAT_STATS), 'critChance', 'critDamage', 'energyPerSecond']);
  for (const t of GEM_TYPE_IDS) for (const s of GEM_TYPES[t].stats) assert.ok(known.has(s.stat), t + ': ' + s.stat);
});

test('a gem gives its value x (rarity + 1) x its item level multiplier', () => {
  const g = { gem_type: 'fire', stat: 'burnChance', rarity: 0, ilvl: 10 };
  assert.equal(gemValue(g), 0.03);
  assert.ok(Math.abs(gemValue({ ...g, rarity: 3, ilvl: 30 }) - 0.03 * 4 * ilvlMult(30)) < 1e-12);
  assert.equal(gemName({ ...g, rarity: 2 }), 'Rare Ruby');
  assert.equal(gemLine(g), '+3% burn chance');
  assert.equal(gemLine({ gem_type: 'fire', stat: 'fireDamage', rarity: 1, ilvl: 10 }), '+4 added fire damage');
  assert.equal(gemValue({ gem_type: 'fire', stat: 'coldPen', rarity: 0 }), 0, 'a stat the type cannot have does nothing');
  assert.equal(asGem({ gem_type: 'cold', stat: 'coldPen', rarity: 9 }).rarity, 3, 'rarity is kept in range');
});

test('gems in an item’s sockets count on the hero wearing it, in socket order', () => {
  const gem = { gem_type: 'fire', stat: 'fireDamage', rarity: 1, ilvl: 20 };
  const it = asItem({ item_type: 'helm', rarity: 0, bonuses: [], ilvl: 20, gems: [null, gem] });
  assert.equal(it.gems.length, SOCKETS); assert.equal(it.gems[0], null); assert.equal(it.gems[1].type, 'fire');
  const mods = itemMods({ warrior: [it] });
  assert.equal(mods.length, 1);
  assert.equal(mods[0].stat, 'fireDamage'); assert.deepEqual(mods[0].scope, ['warrior']);
  assert.ok(Math.abs(mods[0].value - 2 * 2 * ilvlMult(20)) < 1e-12);
  assert.match(mods[0].source, /Helm: Uncommon Ruby/);
  const lines = itemBonusLines(it).map(l => l.text);
  assert.ok(lines.includes('◇ Empty socket') && lines.some(l => /Uncommon Ruby: \+\d/.test(l)));
  assert.equal(asItem({ item_type: 'helm', gems: [null, null] }).gems, undefined, 'no gems: nothing kept');
  assert.equal(gemMods({ mage: [null, gem] }).length, 1);
});

test('Rough Stone: for every boss, and more for a win on a later act; the server uses the same numbers', () => {
  assert.equal(stonesFor(1, false, 0), 0);
  assert.equal(stonesFor(1, true, 1), STONES.perBoss + STONES.winPerAct);
  assert.equal(stonesFor(5, true, 2), 2 * STONES.perBoss + 5 * STONES.winPerAct);
  assert.equal(stonesFor(3, false, 4), 4 * STONES.perBoss, 'endless and losses: bosses only');
  const zones = sql.match(/function public\.rule_stage_zone\(p_stage int\)[^$]*\$\$ select \(array\[([\d, ]+)\]\)/);
  assert.ok(zones, 'rule_stage_zone');
  assert.deepEqual(zones[1].split(', ').map(Number), [...STAGES, ...ENDLESS].map(s => s.zone));
  assert.match(sql, new RegExp('rule_stones\\(p_stage int, p_won boolean, p_bosses int\\)[^$]*\\$\\$ select ' + STONES.perBoss + ' \\* greatest'));
  assert.match(sql, /got_stones := public\.rule_stones\(r\.stage, p_won, p_bosses\)/);
  assert.match(sql, /'stones', got_stones\)/);
});

test('the server: gem kinds copied from the content, the rules, the functions and who may call them', () => {
  const rows = [...sql.matchAll(/^\s+\('(\w+)', '(\w+)', '(\w+)'\)[,;]$/gm)].map(m => m.slice(1, 4).join(' '));
  const want = GEM_TYPE_IDS.flatMap(t => GEM_TYPES[t].stats.map(s => t + ' ' + s.stat + ' ' + familyOf(t)));
  assert.deepEqual(rows.filter(r => want.includes(r)).sort(), [...want].sort());
  assert.match(sql, new RegExp('rule_gem_stones\\(\\)[^$]*\\$\\$ select ' + GEM_CRAFT.stones + ' \\$\\$'));
  assert.match(sql, new RegExp('rule_gem_gold\\(\\)[^$]*\\$\\$ select ' + GEM_CRAFT.gold + ' \\$\\$'));
  assert.match(sql, new RegExp('rule_gem_combine\\(\\)[^$]*\\$\\$ select ' + GEM_CRAFT.combine + ' \\$\\$'));
  assert.match(sql, new RegExp('rule_sockets\\(\\)[^$]*\\$\\$ select ' + SOCKETS + ' \\$\\$'));
  for (const f of ['craft_gem(text)', 'combine_gems(uuid[])', 'socket_gem(uuid, uuid, int)']) {
    assert.ok(sql.includes('create or replace function public.' + f.replace(/\(.*/, '(')), f);
    assert.ok(sql.includes('grant execute on function public.' + f + ' to authenticated;'), f);
  }
  assert.match(sql, /item uuid references public\.player_items \(id\) on delete set null/, 'a gone item frees its gems');
  assert.match(sql, /revoke insert, update, delete on public\.player_gems from anon, authenticated;/);
  assert.match(sql, /add column if not exists stones int/);
});

test('crafting a gem needs Rough Stone, gold and room in the bag', () => {
  assert.match(gemCraftProblem({ stones: 0, gold: 999 }, 0), /Rough Stone/);
  assert.match(gemCraftProblem({ stones: GEM_CRAFT.stones, gold: 0 }, 0), /gold/);
  assert.match(gemCraftProblem({ stones: GEM_CRAFT.stones, gold: GEM_CRAFT.gold }, GEM_CRAFT.max), /full/);
  assert.equal(gemCraftProblem({ stones: GEM_CRAFT.stones, gold: GEM_CRAFT.gold }, 0), '');
});

test('in a match: a gem in a worn item raises the wearer’s stat, and no one else’s', async () => {
  const { createWorld } = await import('../js/engine/world.js');
  const { apply } = await import('../js/engine/commands.js');
  const gem = { type: 'fire', stat: 'fireDamage', rarity: 3, ilvl: 10 };
  const make = items => { const w = createWorld({ seed: 1, stage: 1, lineup: ['warrior', 'ranger', 'mage'], items }); w.players[0].gold = 9999; return w; };
  const place = (w, hero, cx) => { for (let cy = 0; cy < 12; cy++) { const r = apply(w, { type: 'place', hero, cx, cy }); if (r.ok) return w.heroes.find(h => h.id === r.id); } };
  const w = make({ warrior: [{ type: 'helm', rarity: 0, bonuses: [], gems: [gem, null] }] }), plain = make({});
  const a = place(w, 'warrior', 4), b = place(plain, 'warrior', 4), r = place(w, 'ranger', 6);
  assert.equal(a.s.fireDamage - b.s.fireDamage, 8, 'Epic, item level 10: 2 x 4');
  assert.equal(r.s.fireDamage || 0, 0);
});
