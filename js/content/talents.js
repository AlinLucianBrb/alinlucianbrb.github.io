/* The talent tree, Path of Exile style: one tree for every hero, made of CLUSTERS joined by PATHS, symmetrical all round.
   - A cluster is a diamond pointing away from the origin, with two kinds of stats: its beginning node (facing the origin) and
     its end node (the notable, furthest out) have both; the left side has only the first kind, the right side only the second.
     Inner clusters have 2 nodes per side (6 in all), outer clusters 3 (8 in all).
   - 20 clusters in 20 directions: inner and outer ones alternate. The top half is combat, the bottom half quality of life.
   - Clusters connect only at their beginning node. Around the origin is a circle of path nodes: an anchor in each inner
     direction (the inner cluster hangs from it) and a junction in each outer direction (the outer cluster has a path down to
     it). Every path node gives +1 to all attributes (strength, dexterity and intellect).
   You can allocate a node only if it touches the origin or an allocated node, and remove one only if everything else you
   allocated stays connected. Each node is a list of modifiers, the same kind relics use. Hero nodes target tags (melee,
   projectile, spell, fire...), so they reach every hero with the tag, evolved forms included.
   Node ids start with t4_ (the SQL update refunds points spent in older trees). After changing this file run `npm run sql`.
   To change a cluster: edit it in K; to move one, change RING (keep inner and outer alternating so the tree stays symmetrical). */
import { fmtMod } from './format.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
export const TREE_ID = 't4';
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });
const ALL = ['all'], ELEMENTS = ['fire', 'cold', 'lightning', 'toxic', 'holy', 'shadow'];   /* every damage type but physical and plain spell */
const PATH_MODS = () => [flat('strength', 1, ALL), flat('dexterity', 1, ALL), flat('intellect', 1, ALL)];

/* A cluster: key (part of the node ids), title, colour; a and b are the two kinds of stats: { name, mods } for each side node;
   start: the beginning node's mods (both kinds, smaller); notable: [name, ...mods] (both kinds, bigger). */
const C = (key, title, color, a, b, start, notable) => ({ key, title, color, a, b, start, notable });
const side = (name, ...mods) => ({ name, mods });
/* ---- The clusters ---- */
const element = (type, ailment, notable) => C(type, type[0].toUpperCase() + type.slice(1), { fire: '#ff7a45', cold: '#72c8f0', lightning: '#d6a2ff' }[type],
  side(type[0].toUpperCase() + type.slice(1) + ' Touch', flat(type + 'Damage', 2, ALL)), side('Pierce ' + type[0].toUpperCase() + type.slice(1), flat(type + 'Pen', 0.03, ALL)),
  [flat(type + 'Damage', 1, ALL), flat(type + 'Pen', 0.02, ALL)], [notable, flat(type + 'Damage', 4, ALL), flat(type + 'Pen', 0.06, ALL), flat(ailment + 'Chance', 0.1, ALL)]);
const K = {
  /* Combat (the top half). */
  might: C('might', 'Might', '#e5645a', side('Sharpened', inc('damage', 0.03, ALL)), side('Quick', inc('speed', 0.03, ALL)),
    [inc('damage', 0.02, ALL), inc('speed', 0.02, ALL)], ['Overwhelm', inc('damage', 0.08, ALL), inc('speed', 0.06, ALL)]),
  precision: C('precision', 'Precision', '#ffd84a', side('Keen Eye', flat('critChance', 0.02, ALL)), side('Cruel Edge', flat('critDamage', 0.1, ALL)),
    [flat('critChance', 0.01, ALL), flat('critDamage', 0.05, ALL)], ['Deadly Precision', flat('critChance', 0.04, ALL), flat('critDamage', 0.25, ALL)]),
  sorcery: C('sorcery', 'Sorcery', '#c39bf2', side('Spark', inc('damage', 0.05, ['spell'])), side('Quick Cast', inc('castSpeed', 0.03, ['spell'])),
    [inc('damage', 0.03, ['spell']), inc('castSpeed', 0.02, ['spell'])], ['Arcane Flow', inc('damage', 0.1, ['spell']), inc('castSpeed', 0.08, ['spell'])]),
  marksman: C('marksman', 'Marksmanship', '#f2b84b', side('Fletching', inc('damage', 0.05, ['projectile'])), side('Far Shot', inc('range', 0.03, ['projectile'])),
    [inc('damage', 0.03, ['projectile']), inc('range', 0.02, ['projectile'])], ['Deadeye', inc('damage', 0.1, ['projectile']), inc('range', 0.08, ['projectile'])]),
  martial: C('martial', 'Martial', '#c7ced6', side('Brawler', inc('damage', 0.05, ['melee'])), side('Long Blade', flat('arc', 8, ['melee'])),
    [inc('damage', 0.03, ['melee']), flat('arc', 5, ['melee'])], ['Whirlwind', inc('damage', 0.1, ['melee']), flat('arc', 25, ['melee'])]),
  fire: element('fire', 'burn', 'Pyromancy'),
  cold: element('cold', 'freeze', 'Hoarfrost'),
  lightning: element('lightning', 'shock', 'Thunderstruck'),
  toxins: C('toxins', 'Elements and toxins', '#7ad04b', side('Kindling', inc('damage', 0.05, ELEMENTS)), side('Venom', flat('poisonChance', 0.03, ALL)),
    [inc('damage', 0.03, ELEMENTS), flat('poisonChance', 0.02, ALL)], ['Plaguebearer', inc('damage', 0.12, ELEMENTS), flat('poisonChance', 0.1, ALL)]),
  sunder: C('sunder', 'Sunder', '#b0b8c0', side('Sunder', flat('armorPen', 0.04, ALL)), side('Heavy Blows', inc('damage', 0.04, ['physical'])),
    [flat('armorPen', 0.02, ALL), inc('damage', 0.02, ['physical'])], ['Shatter Armor', flat('armorPen', 0.1, ALL), inc('damage', 0.08, ['physical'])]),
  /* Quality of life (the bottom half). Energy sits here too: it is about getting ultimates sooner. */
  energy: C('energy', 'Energy', '#5aa9ff', side('Focus', inc('energyPerAttack', 0.05, ALL)), side('Trickle', flat('energyPerSecond', 1, ALL)),
    [inc('energyPerAttack', 0.03, ALL), flat('energyPerSecond', 0.5, ALL)], ['Second Wind', inc('energyPerAttack', 0.12, ALL), flat('energyPerSecond', 2, ALL)]),
  relics: C('relics', 'Relics', '#dcc6ff', side('Second Look', gflat('rerolls', 1)), side('Picky', gflat('banishes', 1)),
    [gflat('rerolls', 1), gflat('banishes', 1)], ['Relic Hunter', gflat('rerolls', 1), gflat('banishes', 1), gflat('relicLuck', 0.25)]),
  wealth: C('wealth', 'Wealth', '#f2b84b', side('Pocket Change', gflat('startGold', 10)), side('Tithe', ginc('waveGold', 0.05)),
    [gflat('startGold', 5), ginc('waveGold', 0.03)], ['Plunder', gflat('startGold', 25), ginc('waveGold', 0.1), gflat('bounty', 1)]),
  gate: C('gate', 'Gate', '#c9b37e', side('Stout Gate', gflat('startLives', 1)), side('Bargain', more('evolveCost', -0.02)),
    [gflat('startLives', 1), more('evolveCost', -0.01)], ['Fortified Gate', gflat('startLives', 2), more('evolveCost', -0.05)]),
  tempo: C('tempo', 'Tempo', '#8fd3ff', side('Quick Study', ginc('heroXp', 0.05)), side('Scholar', ginc('rewardXp', 0.05)),
    [ginc('heroXp', 0.03), ginc('rewardXp', 0.03)], ['Overdrive', gflat('speed3x', 1), ginc('heroXp', 0.1), ginc('rewardXp', 0.1)]),
  fortune: C('fortune', 'Fortune', '#f2b84b', side('Bookkeeper', ginc('rewardGold', 0.05)), side('Scavenger', ginc('rewardLoot', 0.08)),
    [ginc('rewardGold', 0.03), ginc('rewardLoot', 0.04)], ['Fortune', ginc('rewardGold', 0.1), ginc('rewardLoot', 0.15)]),
  /* Investor: Compound interest as a talent. */
  investor: C('investor', 'Investor', '#e8c547', side('Dividend', gflat('interest', 0.005)), side('Deep Vault', gflat('interestCap', 8)),
    [gflat('interest', 0.003), gflat('interestCap', 5)], ['Compounding', gflat('interest', 0.01), gflat('interestCap', 20)]),
  /* Merchant: cheaper relics, and a chance of a 4th (or 5th) relic to choose from. */
  merchant: C('merchant', 'Merchant', '#d9a0ff', side('Haggler', more('relicCost', -0.03)), side('Wide Stock', gflat('relicOffers', 0.25)),
    [more('relicCost', -0.02), gflat('relicOffers', 0.1)], ['Grand Bazaar', more('relicCost', -0.08), gflat('relicOffers', 0.5)]),
  /* Treasure Hunter: better items at the end of a match (applied by the server in finish_run). */
  treasure: C('treasure', 'Treasure Hunter', '#5aa9ff', side('Keen Find', gflat('itemRarity', 0.1)), side('Fine Craft', gflat('itemBonusChance', 0.04)),
    [gflat('itemRarity', 0.05), gflat('itemBonusChance', 0.02)], ['Hoard', gflat('itemRarity', 0.25), gflat('itemBonusChance', 0.1)]),
  /* Training: heroes start at a higher level, and evolve sooner. */
  training: C('training', 'Training', '#8be28b', side('Drills', gflat('heroStartLevel', 1)), side('Prodigy', gflat('evolveLevel', -1)),
    [gflat('heroStartLevel', 1), gflat('evolveLevel', -1)], ['Veterans', gflat('heroStartLevel', 1), gflat('evolveLevel', -1)])
};
/* Where each cluster goes, by direction, clockwise from the left (west): inner and outer directions alternate every 18 degrees.
   The top half (west to east) is combat, the bottom half (east back to west) quality of life. The two clusters on the
   horizontal line are Lightning (east, combat) and Energy (west). */
const RING = [
  ['energy', 'outer'],                                                                    /* 180°: west */
  ['martial', 'inner'], ['sunder', 'outer'], ['marksman', 'inner'], ['toxins', 'outer'], ['might', 'inner'],
  ['fire', 'outer'], ['precision', 'inner'], ['cold', 'outer'], ['sorcery', 'inner'],
  ['lightning', 'outer'],                                                                 /* 0°: east */
  ['training', 'inner'], ['fortune', 'outer'], ['tempo', 'inner'], ['treasure', 'outer'], ['relics', 'inner'],
  ['merchant', 'outer'], ['wealth', 'inner'], ['investor', 'outer'], ['gate', 'inner']
];
export const COMBAT_CLUSTERS = ['martial', 'sunder', 'marksman', 'toxins', 'might', 'fire', 'precision', 'cold', 'sorcery', 'lightning'];

/* ---- Layout ---- */
const STEP = 360 / RING.length, R_PATH = 135, R_RING = 260, R_INNER = 410, R_OUTER = 800;
const tree = { id: TREE_ID, name: 'Talents', color: '#f2b84b', nodes: [], links: [], clusters: [] };
let pathN = 0;
const ROMAN = ['I', 'II', 'III'];
const pol = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];
function addNode(n) {
  n.x = Math.round(n.x); n.y = Math.round(n.y);
  n.tree = TREE_ID; n.links = []; n.mods = n.mods || []; n.desc = n.desc || n.mods.map(fmtMod).join(', ');
  tree.nodes.push(n); NODES.set(n.id, n); return n;
}
function link(a, b) { if (a.links.includes(b.id)) return; a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }
const pathNode = (x, y) => addNode({ id: TREE_ID + '_p' + (pathN++), name: 'Path', path: true, x, y, mods: PATH_MODS() });
/* A chain of `count` path nodes from a to b, evenly spaced on the line between them. */
function pathBetween(a, b, count) {
  let prev = a;
  for (let k = 1; k <= count; k++) { const f = k / (count + 1), n = pathNode(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f); link(prev, n); prev = n; }
  link(prev, b);
}
/* A diamond cluster centred r out at `angle`: beginning node toward the origin, notable away from it, `k` nodes down each side
   (left side: stat a, right side: stat b). Mirror-symmetric about its own direction. */
function addCluster(c, r, angle, k) {
  const L = k === 2 ? 58 : 72, W = k === 2 ? 50 : 58;
  const [ux, uy] = pol(1, angle), vx = -uy, vy = ux, [cx, cy] = pol(r, angle);
  const at = (along, across) => [cx + ux * along + vx * across, cy + uy * along + vy * across];
  const [sx, sy] = at(-L, 0), [ex, ey] = at(L, 0);
  const start = addNode({ id: TREE_ID + '_' + c.key + '_s', name: c.title, cluster: c.key, x: sx, y: sy, mods: c.start });
  const [nname, ...nmods] = c.notable;
  const end = addNode({ id: TREE_ID + '_' + c.key + '_n', name: nname, notable: true, cluster: c.key, x: ex, y: ey, mods: nmods });
  const sides = {};
  for (const [s, sign, def] of [['a', -1, c.a], ['b', 1, c.b]]) {
    let prev = start; sides[s] = [];
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1), [x, y] = at(-L + 2 * L * t, sign * W * Math.sin(Math.PI * t));
      const n = addNode({ id: TREE_ID + '_' + c.key + '_' + s + i, name: def.name + ' ' + ROMAN[i - 1], cluster: c.key, side: s, x, y, mods: def.mods.map(m => ({ ...m })) });
      link(prev, n); prev = n; sides[s].push(n);
    }
    link(prev, end);
  }
  /* The name goes just beyond the notable: centred above or below for clusters pointing up or down, and starting (or ending)
     beside it for clusters pointing right (or left), so it never runs over a node. */
  const sideways = Math.abs(ux) > 0.3, [lx, ly] = at(L + (sideways ? 30 : 46), 0);
  const info = { key: c.key, title: c.title, color: c.color, x: Math.round(cx), y: Math.round(cy), angle, start, end, notable: end, a: sides.a, b: sides.b,
    nodes: [start, ...sides.a, ...sides.b, end], size: 2 + 2 * k, combat: COMBAT_CLUSTERS.includes(c.key),
    label: { x: Math.round(lx), y: Math.round(ly), anchor: !sideways ? 'middle' : ux > 0 ? 'start' : 'end' } };
  tree.clusters.push(info);
  return info;
}

/* The inner circle is all path nodes: an ANCHOR in each inner direction (reached from the origin by a path) and a JUNCTION
   in each outer direction, between two anchors. Inner clusters hang from their anchor; outer clusters have a path down to
   their junction. So no cluster sits on the circle itself. */
const root = addNode({ id: TREE_ID + '_root', name: 'Origin', root: true, x: 0, y: 0, desc: 'The starting point. Every path begins here.' });
const circle = RING.map(([key, ring], i) => {
  const angle = 180 + i * STEP;
  if (ring === 'inner') {
    const [ax, ay] = pol(R_RING, angle), anchor = pathNode(ax, ay);
    pathBetween(root, anchor, 1);
    const cl = addCluster(K[key], R_INNER, angle, 2);
    link(anchor, cl.start);
    return anchor;
  }
  /* A junction sits on the straight line between its two neighbouring anchors. */
  const [jx, jy] = pol(R_RING * Math.cos(STEP * Math.PI / 180), angle), junction = pathNode(jx, jy);
  const cl = addCluster(K[key], R_OUTER, angle, 3);
  pathBetween(junction, cl.start, 2);
  return junction;
});
circle.forEach((n, i) => link(n, circle[(i + 1) % circle.length]));

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
