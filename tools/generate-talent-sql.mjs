/* Prints SQL that copies the talent trees from js/game/talents.js into the database, so the server can check talent saves.
   Run it after you change any talent tree:   node tools/generate-talent-sql.mjs > talent-seed.sql
   Then paste the result into the Supabase SQL Editor. Safe to run more than once. */
import { TREES, TREE_ORDER, NODES } from '../js/game/talents.js';

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const ids = [...NODES.keys()];
const nodeRows = ids.map(id => { const n = NODES.get(id); return '  (' + q(id) + ', ' + q(n.tree) + ', ' + (n.root ? 'true' : 'false') + ')'; });
const linkRows = [];
for (const t of TREE_ORDER) for (const [a, b] of TREES[t].links) { linkRows.push('  (' + q(a) + ', ' + q(b) + ')'); linkRows.push('  (' + q(b) + ', ' + q(a) + ')'); }

console.log('-- Talent trees (generated from js/game/talents.js by tools/generate-talent-sql.mjs). Links are stored in both directions.');
console.log('delete from public.talent_links;');
console.log('insert into public.talent_nodes (id, tree, is_root) values\n' + nodeRows.join(',\n') + '\non conflict (id) do update set tree = excluded.tree, is_root = excluded.is_root;');
console.log('delete from public.talent_nodes where id <> all (array[' + ids.map(q).join(', ') + ']);');
console.log('insert into public.talent_links (a, b) values\n' + linkRows.join(',\n') + ';');
