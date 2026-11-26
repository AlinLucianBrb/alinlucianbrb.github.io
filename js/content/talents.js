/* The talents: 20 tracks of 5 (100 talents), one tree for every hero. Each track is a theme (Fire, Wealth...) taken in order:
   1. its start (both of its stats, small), 2. its first stat, 3. its second stat, 4. its mastery (both again), 5. its notable
   (both, bigger, and a special effect). A full track gives the same as the old 6- or 8-node cluster it replaced.
   The top level is 100 and every level gives a point (pointsFor), so a player at the top level owns every talent.
   You can take the next talent of any track, and give back the last one taken in a track. Each talent is a list of modifiers,
   the same kind relics use. Hero talents target tags (melee, projectile, spell, fire...), so they reach every hero with the tag,
   evolved forms included. Ids start with t5_ (the SQL update refunds points spent in older trees). After changing this file
   run `npm run sql`. To change a track: edit it in K; to move one, change COMBAT_ORDER or QOL_ORDER. */
import { fmtMod } from './format.js';
import { ACCOUNT } from './rules.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
export const TREE_ID = 't5';
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });
const ALL = ['all'], ELEMENTS = ['fire', 'cold', 'lightning', 'toxic', 'holy', 'shadow'];   /* every damage type but physical and plain arcane */

/* A track: key (part of the ids), title, colour; a and b are its two stats: { name, mods } (one step's worth);
   start: the first talent's mods (both, smaller); notable: [name, ...mods] (both, bigger). */
const C = (key, title, color, a, b, start, notable) => ({ key, title, color, a, b, start, notable });
const side = (name, ...mods) => ({ name, mods });
/* ---- The clusters ---- */
const element = (type, ailment, notable, effect) => C(type, type[0].toUpperCase() + type.slice(1), { fire: '#ff7a45', cold: '#72c8f0', lightning: '#d6a2ff' }[type],
  side(type[0].toUpperCase() + type.slice(1) + ' Touch', flat(type + 'Damage', 2, ALL)), side('Pierce ' + type[0].toUpperCase() + type.slice(1), flat(type + 'Pen', 0.03, ALL)),
  [flat(type + 'Damage', 1, ALL), flat(type + 'Pen', 0.02, ALL)], [notable, effect, flat(type + 'Damage', 2, ALL), flat(type + 'Pen', 0.03, ALL), flat(ailment + 'Chance', 0.05, ALL)]);
const K = {
  /* Combat (the top half). */
  might: C('might', 'Might', '#e5645a', side('Sharpened', inc('damage', 0.03, ALL)), side('Quick', inc('speed', 0.03, ALL)),
    [inc('damage', 0.02, ALL), inc('speed', 0.02, ALL)], ['Overwhelm', flat('splash', 0.15, ALL), inc('damage', 0.04, ALL), inc('speed', 0.03, ALL)]),
  precision: C('precision', 'Precision', '#ffd84a', side('Keen Eye', flat('critChance', 0.02, ALL)), side('Cruel Edge', flat('critDamage', 0.1, ALL)),
    [flat('critChance', 0.01, ALL), flat('critDamage', 0.05, ALL)], ['Deadly Precision', flat('lucky', 1, ALL), flat('critChance', 0.02, ALL), flat('critDamage', 0.12, ALL)]),
  sorcery: C('sorcery', 'Sorcery', '#c39bf2', side('Spark', inc('damage', 0.05, ['spell'])), side('Quick Cast', inc('castSpeed', 0.03, ['spell'])),
    [inc('damage', 0.03, ['spell']), inc('castSpeed', 0.02, ['spell'])], ['Arcane Flow', flat('recast', 0.08, ['spell']), inc('damage', 0.05, ['spell']), inc('castSpeed', 0.04, ['spell'])]),
  marksman: C('marksman', 'Marksmanship', '#f2b84b', side('Fletching', inc('damage', 0.05, ['projectile'])), side('Far Shot', inc('range', 0.03, ['projectile'])),
    [inc('damage', 0.03, ['projectile']), inc('range', 0.02, ['projectile'])], ['Deadeye', flat('perTile', 0.04, ['projectile']), inc('damage', 0.05, ['projectile']), inc('range', 0.04, ['projectile'])]),
  martial: C('martial', 'Martial', '#c7ced6', side('Brawler', inc('damage', 0.05, ['melee'])), side('Quick Blade', inc('speed', 0.03, ['melee'])),
    [inc('damage', 0.03, ['melee']), inc('speed', 0.02, ['melee'])], ['Whirlwind', flat('fifth', 1, ['melee']), inc('damage', 0.05, ['melee']), inc('speed', 0.04, ['melee'])]),
  fire: element('fire', 'burn', 'Pyromancy', flat('stagger', 0.2, ALL)),
  cold: element('cold', 'freeze', 'Hoarfrost', flat('vsFrozen', 0.25, ALL)),
  lightning: element('lightning', 'shock', 'Thunderstruck', flat('arcing', 1, ALL)),
  toxins: C('toxins', 'Elements and toxins', '#7ad04b', side('Kindling', inc('damage', 0.05, ELEMENTS)), side('Venom', flat('poisonChance', 0.03, ALL)),
    [inc('damage', 0.03, ELEMENTS), flat('poisonChance', 0.02, ALL)], ['Plaguebearer', flat('venom', 0.15, ALL), inc('damage', 0.06, ELEMENTS), flat('poisonChance', 0.05, ALL)]),
  sunder: C('sunder', 'Sunder', '#b0b8c0', side('Sunder', flat('armorPen', 0.04, ALL)), side('Heavy Blows', inc('damage', 0.04, ['physical'])),
    [flat('armorPen', 0.02, ALL), inc('damage', 0.02, ['physical'])], ['Shatter Armor', flat('wither', 0.01, ALL), flat('armorPen', 0.05, ALL), inc('damage', 0.04, ['physical'])]),
  /* Quality of life (the bottom half). Energy sits here too: it is about ultimates, sooner (energy) and longer (duration). */
  energy: C('energy', 'Energy', '#5aa9ff', side('Focus', inc('energyPerSecond', 0.05, ALL)), side('Linger', inc('duration', 0.05, ALL)),
    [inc('energyPerSecond', 0.03, ALL), inc('duration', 0.03, ALL)], ['Second Wind', inc('energyPerSecond', 0.12, ALL), inc('duration', 0.1, ALL)]),
  relics: C('relics', 'Relics', '#dcc6ff', side('Second Look', gflat('rerolls', 1)), side('Picky', gflat('banishes', 1)),
    [gflat('rerolls', 1), gflat('banishes', 1)], ['Relic Hunter', gflat('rerolls', 1), gflat('banishes', 1), gflat('relicLuck', 0.25)]),
  wealth: C('wealth', 'Wealth', '#f2b84b', side('Pocket Change', gflat('startGold', 10)), side('Tithe', ginc('waveGold', 0.05)),
    [gflat('startGold', 5), ginc('waveGold', 0.03)], ['Plunder', gflat('startGold', 25), ginc('waveGold', 0.1), gflat('bounty', 1)]),
  gate: C('gate', 'Gate', '#c9b37e', side('Stout Gate', gflat('startLives', 1)), side('Bargain', more('evolveCost', -0.02)),
    [gflat('startLives', 1), more('evolveCost', -0.01)], ['Fortified Gate', gflat('startLives', 2), more('evolveCost', -0.05)]),
  tempo: C('tempo', 'Tempo', '#8fd3ff', side('Quick Study', ginc('heroXp', 0.05)), side('Scholar', ginc('rewardXp', 0.05)),
    [ginc('heroXp', 0.03), ginc('rewardXp', 0.03)], ['Overdrive', ginc('heroXp', 0.1), ginc('rewardXp', 0.1)]),
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
/* How many steps of each stat the old cluster had (3 for the big ones, 2 for the small): the track's second, third and fourth
   talents give that many steps in all, so a full track is worth what the full cluster was. */
const BIG = ['energy', 'sunder', 'toxins', 'fire', 'cold', 'lightning', 'fortune', 'treasure', 'merchant', 'investor'];
const MASTERY = { toxins: 'Plague Mastery' };
/* The screen lists the tracks in two columns, in these orders. */
export const COMBAT_CLUSTERS = ['might', 'precision', 'martial', 'marksman', 'sorcery', 'sunder', 'fire', 'cold', 'lightning', 'toxins'];
export const QOL_CLUSTERS = ['energy', 'gate', 'wealth', 'investor', 'merchant', 'relics', 'training', 'tempo', 'fortune', 'treasure'];
export const TRACK_LENGTH = 5;

const tree = { id: TREE_ID, name: 'Talents', color: '#f2b84b', nodes: [], links: [], clusters: [] };
const round = v => Math.round(v * 1e4) / 1e4;
const scaled = (mods, k) => mods.map(m => ({ ...m, value: round(m.value * k) }));
function addNode(n) {
  n.tree = TREE_ID; n.links = []; n.mods = n.mods || []; n.desc = n.desc || n.mods.map(fmtMod).join(', ');
  tree.nodes.push(n); NODES.set(n.id, n); return n;
}
function link(a, b) { a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }
const root = addNode({ id: TREE_ID + '_root', name: 'Origin', root: true, desc: 'The start of every track.' });
for (const key of [...COMBAT_CLUSTERS, ...QOL_CLUSTERS]) {
  const c = K[key], k = BIG.includes(key) ? 1.5 : 1, [nname, ...nmods] = c.notable, id = s => TREE_ID + '_' + key + '_' + s;
  const steps = [
    { id: id('s'), name: c.title, mods: c.start },
    { id: id('a'), name: c.a.name, side: 'a', mods: scaled(c.a.mods, k) },
    { id: id('b'), name: c.b.name, side: 'b', mods: scaled(c.b.mods, k) },
    { id: id('m'), name: MASTERY[key] || c.title + ' Mastery', mastery: true, mods: [...scaled(c.a.mods, k), ...scaled(c.b.mods, k)] },
    { id: id('n'), name: nname, notable: true, mods: nmods }
  ].map((n, i) => addNode({ ...n, cluster: key, step: i }));
  steps.reduce((prev, n) => (link(prev, n), n), root);
  tree.clusters.push({ key, title: c.title, color: c.color, combat: COMBAT_CLUSTERS.includes(key), nodes: steps, start: steps[0], end: steps[4], notable: steps[4],
    a: [steps[1]], b: [steps[2]], size: steps.length });
}
TREES[TREE_ID] = tree; TREE_ORDER.push(TREE_ID);

/* ---- Rules ---- */
/* One talent point per account level, up to the top level: at the top level a player owns every talent. */
export const pointsFor = level => Math.max(0, Math.min(level, ACCOUNT.maxLevel));
export const canAllocate = (alloc, node) => !node.root && !alloc.has(node.id) && node.links.some(l => alloc.has(l) || NODES.get(l).root);
/* A talent can be given back only if every other one taken still connects to the start (in a track: the last one taken). */
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
