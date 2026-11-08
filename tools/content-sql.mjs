/* SQL that copies game content the server must know about from js/content into the database:
   the talent tree (to check talent saves, and the reward bonuses its nodes give), the playable heroes (to check lineups) and the item types (to drop and check items). */
import { TREES, TREE_ORDER, NODES } from '../js/content/talents.js';
import { HEROES } from '../js/content/data.js';
import { ITEMS, ITEM_BONUSES, AFFINITY } from '../js/content/items.js';

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const list = ids => 'array[' + ids.map(q).join(', ') + ']::text[]';

export function contentSeedSql() {
  const ids = [...NODES.keys()];
  const reward = (n, stat) => n.mods.filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0);
  const nodeRows = ids.map(id => {
    const n = NODES.get(id);
    return '  (' + [q(id), q(n.tree), n.root ? 'true' : 'false', reward(n, 'rewardGold'), reward(n, 'rewardXp'), reward(n, 'rewardLoot'), reward(n, 'itemRarity'), reward(n, 'itemBonusChance')].join(', ') + ')';
  });
  const linkRows = [];
  for (const t of TREE_ORDER) for (const [a, b] of TREES[t].links) { linkRows.push('  (' + q(a) + ', ' + q(b) + ')'); linkRows.push('  (' + q(b) + ', ' + q(a) + ')'); }
  const heroes = HEROES.map(h => h.id), items = Object.keys(ITEMS);
  return [
    '-- ===== Game content (generated from js/content by tools/build-sql.mjs; do not edit by hand) =====',
    '-- Talent trees. Links are stored in both directions.',
    'delete from public.talent_links;',
    'insert into public.talent_nodes (id, tree, is_root, reward_gold, reward_xp, reward_loot, reward_rarity, reward_extra) values\n' + nodeRows.join(',\n') +
      '\non conflict (id) do update set tree = excluded.tree, is_root = excluded.is_root, reward_gold = excluded.reward_gold, reward_xp = excluded.reward_xp,' +
      ' reward_loot = excluded.reward_loot, reward_rarity = excluded.reward_rarity, reward_extra = excluded.reward_extra;',
    'delete from public.talent_nodes where id <> all (' + list(ids) + ');',
    'insert into public.talent_links (a, b) values\n' + linkRows.join(',\n') + ';',
    '-- Playable heroes.',
    'insert into public.hero_classes (id) values ' + heroes.map(h => '(' + q(h) + ')').join(', ') + ' on conflict (id) do nothing;',
    'delete from public.hero_classes where id <> all (' + list(heroes) + ');',
    '-- Item types. Removed items stay in the table (players may own them) but stop dropping.',
    'insert into public.item_types (id, slot, droppable, affinity) values\n' + items.map(id => '  (' + q(id) + ', ' + q(ITEMS[id].slot) + ', true, ' + (ITEMS[id].affinity ? q(ITEMS[id].affinity) : 'null') + ')').join(',\n') +
      '\non conflict (id) do update set slot = excluded.slot, droppable = true, affinity = excluded.affinity;',
    'update public.item_types set droppable = false where id <> all (' + list(items) + ');',
    '-- Item bonuses: the relics an item can roll.',
    'insert into public.item_bonuses (id, tags) values ' + ITEM_BONUSES.map(b => '(' + q(b) + ', ' + list(Object.keys(AFFINITY).filter(a => AFFINITY[a].includes(b))) + ')').join(', ') +
      ' on conflict (id) do update set tags = excluded.tags;',
    'delete from public.item_bonuses where id <> all (' + list(ITEM_BONUSES) + ');'
  ].join('\n') + '\n';
}
