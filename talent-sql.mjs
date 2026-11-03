/* Builds the SQL that copies the talent trees from js/content/talents.js into the database (used by the CLI and by the tests). */
import { TREES, TREE_ORDER, NODES } from '../js/content/talents.js';

const q = s => "'" + String(s).replace(/'/g, "''") + "'";

export function talentSeedSql() {
  const ids = [...NODES.keys()];
  const nodeRows = ids.map(id => { const n = NODES.get(id); return '  (' + q(id) + ', ' + q(n.tree) + ', ' + (n.root ? 'true' : 'false') + ')'; });
  const linkRows = [];
  for (const t of TREE_ORDER) for (const [a, b] of TREES[t].links) { linkRows.push('  (' + q(a) + ', ' + q(b) + ')'); linkRows.push('  (' + q(b) + ', ' + q(a) + ')'); }
  return [
    '-- Talent trees (generated from js/content/talents.js by tools/generate-talent-sql.mjs). Links are stored in both directions.',
    'delete from public.talent_links;',
    'insert into public.talent_nodes (id, tree, is_root) values\n' + nodeRows.join(',\n') + '\non conflict (id) do update set tree = excluded.tree, is_root = excluded.is_root;',
    'delete from public.talent_nodes where id <> all (array[' + ids.map(q).join(', ') + ']);',
    'insert into public.talent_links (a, b) values\n' + linkRows.join(',\n') + ';'
  ].join('\n') + '\n';
}
