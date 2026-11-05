/* The talent tree, Path of Exile style: one tree for every hero, made of CLUSTERS joined by PATHS.
   - A cluster is a themed group of 5 to 8 nodes: small nodes in a ring (the first one, facing the origin, is the way in) and a
     notable (bigger) in the middle.
   - Path nodes join the origin to the inner clusters, the inner clusters to each other and to the outer clusters. Every path
     node gives +1 to all attributes (strength, dexterity and intellect), so the walk between clusters is never wasted.
   You can allocate a node only if it touches the origin or an allocated node, and remove one only if everything else you
   allocated stays connected. Each node is a list of modifiers, the same kind relics use. Hero nodes target tags (melee,
   projectile, spell, fire...), so they reach every hero with the tag, evolved forms included.
   Node ids start with t2_ (the SQL update refunds points spent in older trees). After changing this file run `npm run sql`.
   To add a cluster: add an entry to INNER or OUTER (with its angle) and, for an outer one, the inner cluster it hangs from. */
import { fmtMod } from './format.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
export const TREE_ID = 't2';
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });
const ALL = ['all'], ELEMENTS = ['fire', 'cold', 'lightning', 'toxic'];
const PATH_MODS = () => [flat('strength', 1, ALL), flat('dexterity', 1, ALL), flat('intellect', 1, ALL)];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const rep = (n, name, mk) => Array.from({ length: n }, (_, i) => [name + (n > 1 ? ' ' + ROMAN[i] : ''), ...mk(i)]);
const cap = s => s[0].toUpperCase() + s.slice(1);

/* Clusters: key (part of the node ids), title, angle (degrees), small nodes [[name, ...mods]] and a notable.
   INNER clusters sit around the origin; OUTER ones further out, each hanging from an inner cluster (from). */
const INNER = [
  { key: 'damage', title: 'Damage', angle: -90, color: '#e5645a',
    small: rep(6, 'Sharpened', () => [inc('damage', 0.03, ALL)]), notable: ['Overwhelm', inc('damage', 0.08, ALL), inc('speed', 0.04, ALL)] },
  { key: 'crit', title: 'Critical hits', angle: -45, color: '#ffd84a',
    small: rep(6, 'Precision', i => (i % 2 ? [flat('critDamage', 0.1, ALL)] : [flat('critChance', 0.02, ALL)])),
    notable: ['Deadly Precision', flat('critChance', 0.04, ALL), flat('critDamage', 0.25, ALL)] },
  { key: 'cast', title: 'Cast speed', angle: 0, color: '#c39bf2',
    small: rep(5, 'Quick Cast', () => [inc('castSpeed', 0.03, ['spell'])]), notable: ['Quickened Mind', inc('castSpeed', 0.08, ['spell']), inc('energyPerAttack', 0.1, ['spell'])] },
  { key: 'energy', title: 'Energy', angle: 45, color: '#5aa9ff',
    small: rep(5, 'Focus', () => [inc('energyPerAttack', 0.05, ALL)]), notable: ['Second Wind', inc('energyPerAttack', 0.12, ALL), inc('damage', 0.03, ALL)] },
  { key: 'relics', title: 'Relics', angle: 90, color: '#dcc6ff',
    small: [['Second Look', gflat('rerolls', 1)], ['Picky', gflat('banishes', 1)], ['Third Look', gflat('rerolls', 1)], ['Lucky Find', gflat('relicLuck', 0.1)], ['Charmed', gflat('relicLuck', 0.1)]],
    notable: ['Relic Hunter', gflat('banishes', 1), gflat('relicLuck', 0.25)] },
  { key: 'gold', title: 'Gold', angle: 135, color: '#f2b84b',
    small: [...rep(3, 'Pocket Change', () => [gflat('startGold', 10)]), ...rep(2, 'Tithe', () => [ginc('waveGold', 0.05)])],
    notable: ['Plunder', gflat('bounty', 1), ginc('waveGold', 0.1)] },
  { key: 'gate', title: 'Gate', angle: 180, color: '#c9b37e',
    small: [...rep(4, 'Stout Gate', () => [gflat('startLives', 1)]), ['Bargain', more('evolveCost', -0.02)]],
    notable: ['Fortified Gate', gflat('startLives', 2), more('evolveCost', -0.05)] },
  { key: 'speed', title: 'Attack speed', angle: -135, color: '#8be28b',
    small: rep(5, 'Quick', () => [inc('speed', 0.03, ALL)]), notable: ['Flurry', inc('speed', 0.08, ALL), inc('damage', 0.03, ALL)] }
];
/* Fire, cold and lightning clusters: added damage of that type for every hero, and more damage for heroes of that element. */
const element = type => [...rep(3, cap(type) + ' Touch', () => [flat(type + 'Damage', 2, ALL)]), ...rep(2, cap(type) + ' Mastery', () => [inc('damage', 0.06, [type])])];
const OUTER = [
  { key: 'melee', title: 'Melee', angle: -122, from: 'speed', color: '#c7ced6',
    small: [...rep(5, 'Brawler', () => [inc('damage', 0.05, ['melee'])]), ['Long Blade', flat('arc', 10, ['melee'])]],
    notable: ['Whirlwind', flat('arc', 30, ['melee']), inc('damage', 0.08, ['melee'])] },
  { key: 'armorpen', title: 'Armor penetration', angle: -94, from: 'damage', color: '#b0b8c0',
    small: rep(5, 'Sunder', () => [flat('armorPen', 0.04, ALL)]), notable: ['Shatter Armor', flat('armorPen', 0.1, ALL), inc('damage', 0.05, ['physical'])] },
  { key: 'projectile', title: 'Projectiles', angle: -66, from: 'damage', color: '#f2b84b',
    small: [...rep(4, 'Fletching', () => [inc('damage', 0.05, ['projectile'])]), ['Far Shot', inc('range', 0.04, ['projectile'])]],
    notable: ['Deadeye', inc('range', 0.1, ['projectile']), inc('damage', 0.08, ['projectile'])] },
  { key: 'respen', title: 'Resistance penetration', angle: -36, from: 'crit', color: '#ff9d8a',
    small: [['Scorch', flat('firePen', 0.03, ALL)], ['Chill Through', flat('coldPen', 0.03, ALL)], ['Arc Through', flat('lightningPen', 0.03, ALL)],
      ['Unravel', flat('firePen', 0.02, ALL), flat('coldPen', 0.02, ALL), flat('lightningPen', 0.02, ALL)],
      ['Unmake', flat('firePen', 0.02, ALL), flat('coldPen', 0.02, ALL), flat('lightningPen', 0.02, ALL)]],
    notable: ['Elemental Ruin', flat('firePen', 0.05, ALL), flat('coldPen', 0.05, ALL), flat('lightningPen', 0.05, ALL)] },
  { key: 'spell', title: 'Spells', angle: -5, from: 'cast', color: '#c39bf2',
    small: rep(6, 'Spark', () => [inc('damage', 0.05, ['spell'])]), notable: ['Arcane Flow', inc('energyPerAttack', 0.2, ['spell']), inc('damage', 0.08, ['spell'])] },
  { key: 'fire', title: 'Fire', angle: 26, from: 'cast', color: '#ff7a45',
    small: element('fire'), notable: ['Pyromancy', flat('fireDamage', 4, ALL), flat('burnChance', 0.1, ALL)] },
  { key: 'cold', title: 'Cold', angle: 58, from: 'energy', color: '#72c8f0',
    small: element('cold'), notable: ['Hoarfrost', flat('coldDamage', 4, ALL), flat('freezeChance', 0.1, ALL)] },
  { key: 'lightning', title: 'Lightning', angle: 90, from: 'relics', color: '#d6a2ff',
    small: element('lightning'), notable: ['Thunderstruck', flat('lightningDamage', 4, ALL), flat('shockChance', 0.1, ALL)] },
  { key: 'elements', title: 'Elements and toxins', angle: 122, from: 'gold', color: '#7ad04b',
    small: rep(7, 'Kindling', () => [inc('damage', 0.05, ELEMENTS)]), notable: ['Elementalist', inc('damage', 0.12, ELEMENTS), inc('range', 0.06, ELEMENTS)] },
  { key: 'rewards', title: 'Rewards', angle: 158, from: 'gate', color: '#f2b84b',
    small: [['Bookkeeper', ginc('rewardGold', 0.05)], ['Ledger', ginc('rewardGold', 0.05)], ['Scholar', ginc('rewardXp', 0.05)], ['Studious', ginc('rewardXp', 0.05)], ['Scavenger', ginc('rewardLoot', 0.08)]],
    notable: ['Fortune', ginc('rewardGold', 0.1), ginc('rewardXp', 0.1), ginc('rewardLoot', 0.15)] },
  { key: 'tempo', title: 'Tempo', angle: 196, from: 'gate', color: '#8fd3ff',
    small: rep(5, 'Quick Study', () => [ginc('heroXp', 0.05)]), notable: ['Overdrive', gflat('speed3x', 1), ginc('heroXp', 0.1)] }
];

/* ---- Layout ---- */
const R_INNER = 330, R_OUTER = 720, R_CLUSTER = 62;
const tree = { id: TREE_ID, name: 'Talents', color: '#f2b84b', nodes: [], links: [], clusters: [] };
let pathN = 0;
const pt = (r, deg) => [Math.round(r * Math.cos(deg * Math.PI / 180)), Math.round(r * Math.sin(deg * Math.PI / 180))];
function addNode(n) { n.tree = TREE_ID; n.links = []; n.mods = n.mods || []; n.desc = n.desc || n.mods.map(fmtMod).join(', '); tree.nodes.push(n); NODES.set(n.id, n); return n; }
function link(a, b) { if (a.links.includes(b.id)) return; a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }
/* A chain of `count` path nodes from a to b, evenly spaced along the line between them. */
function pathBetween(a, b, count) {
  let prev = a;
  for (let k = 1; k <= count; k++) {
    const f = k / (count + 1), n = addNode({ id: TREE_ID + '_p' + (pathN++), name: 'Path', path: true, x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f), mods: PATH_MODS() });
    link(prev, n); prev = n;
  }
  link(prev, b);
}
/* A cluster around (cx, cy): the small nodes on a ring, starting with the entry (the one facing the origin), each linked to the
   next all the way round; the notable in the middle, linked to the two ring nodes furthest from the entry. */
function addCluster(c, r) {
  const [cx, cy] = pt(r, c.angle), n = c.small.length, ring = [];
  c.small.forEach(([name, ...mods], k) => {
    const [dx, dy] = pt(R_CLUSTER, c.angle + 180 + k * 360 / n);
    ring.push(addNode({ id: TREE_ID + '_' + c.key + '_' + k, name, cluster: c.key, x: cx + dx, y: cy + dy, mods }));
  });
  ring.forEach((node, k) => link(node, ring[(k + 1) % n]));
  const [nname, ...nmods] = c.notable, notable = addNode({ id: TREE_ID + '_' + c.key + '_n', name: nname, notable: true, cluster: c.key, x: cx, y: cy, mods: nmods });
  link(notable, ring[Math.floor(n / 2)]); link(notable, ring[n % 2 ? Math.ceil(n / 2) : n / 2 - 1]);
  const info = { key: c.key, title: c.title, color: c.color, x: cx, y: cy, angle: c.angle, entry: ring[0], far: ring[Math.floor(n / 2)], ring, notable, size: n + 1 };
  tree.clusters.push(info);
  return info;
}

const root = addNode({ id: TREE_ID + '_root', name: 'Origin', root: true, x: 0, y: 0, desc: 'The starting point. Every path begins here.' });
const inner = new Map();
for (const c of INNER) { const k = addCluster(c, R_INNER); inner.set(c.key, k); pathBetween(root, k.entry, 1); }
/* Neighbouring inner clusters are joined side to side by a path node, so there is more than one way round. */
INNER.forEach((c, i) => {
  const a = inner.get(c.key), b = inner.get(INNER[(i + 1) % INNER.length].key), n = a.ring.length, m = b.ring.length;
  pathBetween(a.ring[Math.round(n * 3 / 4) % n], b.ring[Math.round(m / 4)], 1);
});
for (const c of OUTER) { const k = addCluster(c, R_OUTER); pathBetween(inner.get(c.from).far, k.entry, 2); }

TREES[TREE_ID] = tree; TREE_ORDER.push(TREE_ID);

/* ---- Rules ---- */
export const pointsFor = level => Math.max(0, level - 1);
export const canAllocate = (alloc, node) => !node.root && !alloc.has(node.id) && node.links.some(l => alloc.has(l) || NODES.get(l).root);
/* A node can be removed only if every other allocated node still connects to the origin. */
export function canRemove(alloc, id) {
  const n = NODES.get(id);
  if (!n || n.root || !alloc.has(id)) return false;
  const keep = new Set([...alloc].filter(x => x !== id && NODES.has(x))), rootId = TREE_ID + '_root', seen = new Set([rootId]), stack = [rootId];
  while (stack.length) for (const l of NODES.get(stack.pop()).links) if (keep.has(l) && !seen.has(l)) { seen.add(l); stack.push(l); }
  return [...keep].every(x => seen.has(x));
}
/* The cheapest way to reach a node: the unallocated nodes to add, in order (each one touches what came before), or null.
   Breadth-first from everything already allocated and the origin. */
export function pathTo(alloc, id) {
  if (!NODES.has(id) || alloc.has(id)) return [];
  const start = [TREE_ID + '_root', ...[...alloc].filter(x => NODES.has(x))], prev = new Map(start.map(x => [x, null])), queue = [...start];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    if (cur === id) break;
    for (const l of NODES.get(cur).links) if (!prev.has(l)) { prev.set(l, cur); queue.push(l); }
  }
  if (!prev.has(id)) return null;
  const out = [];
  for (let x = id; x !== null && !start.includes(x); x = prev.get(x)) out.unshift(x);
  return out;
}
/* Modifiers for a run, from the allocated node ids. Unknown ids are ignored. */
export function talentMods(ids) {
  const out = [];
  for (const id of ids) {
    const n = NODES.get(id);
    if (n && !n.root) for (const m of n.mods) out.push({ ...m, source: n.path ? 'Paths' : n.name, ri: -1 });
  }
  return out;
}
/* The reward bonuses a set of talents gives: { gold, xp, loot } as fractions (0.2 = +20%). The server sums the same columns. */
export function rewardBonus(ids) {
  const out = { gold: 0, xp: 0, loot: 0 };
  for (const m of talentMods(ids || [])) {
    if (m.stat === 'rewardGold') out.gold += m.value; else if (m.stat === 'rewardXp') out.xp += m.value; else if (m.stat === 'rewardLoot') out.loot += m.value;
  }
  return out;
}
