/* The talents: 20 tracks of 5 (100 talents), one tree for every hero. Each track is a theme (Fire, Wealth...) taken in order:
   1. its start (both of its stats, small), 2. its first stat, 3. its second stat, 4. its mastery (both again), 5. its notable
   (both, bigger, and its unique effect). Combat (12): the main types (melee, projectile, spell, minion), the damage types
   (physical, fire, cold, lightning, toxic, shadow, holy) and Energy; quality of life (8).
   The top level is 100 and every level gives a point (pointsFor), so a player at the top level owns every talent.
   You can take the next talent of any track, and give back the last one taken in a track. Each talent is a list of modifiers,
   the same kind relics use. Hero talents target tags (melee, projectile, spell, fire...), so they reach every hero with the tag,
   evolved forms included. Ids start with t6_ (the SQL update refunds points spent in older trees). After changing this file
   run `npm run sql`. To change a track: edit it in K; to move one, change COMBAT_CLUSTERS or QOL_CLUSTERS (20 tracks: 100 talents). */
import { fmtMod } from './format.js';
import { ACCOUNT } from './rules.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
export const TREE_ID = 't6';
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });
const ALL = ['all'];

/* A track: key (part of the ids), title, colour, icon (assets/<icon>.png); a and b are its two stats: { name, mods } (one step's
   worth); start: the first talent's mods (both, smaller); notable: [name, ...mods] (both, bigger, and its unique effect).
   k: how many steps of each stat the second, third and fourth talents give in all (1 each, or 1.5 for the bigger tracks). */
const C = (key, title, color, icon, a, b, start, notable, k = 1) => ({ key, title, color, icon, a, b, start, notable, k });
const side = (name, ...mods) => ({ name, mods });
const cap = t => t[0].toUpperCase() + t.slice(1);
/* ---- The tracks ---- */
/* A main type (melee, projectile, spell): its damage | its second stat; the notable adds the effect. */
const kind = (key, title, color, icon, tag, [an, bn, bstat], [nname, effect]) => C(key, title, color, icon,
  side(an, inc('damage', 0.05, [tag])), side(bn, inc(bstat, 0.03, [tag])),
  [inc('damage', 0.03, [tag]), inc(bstat, 0.02, [tag])], [nname, effect, inc('damage', 0.05, [tag]), inc(bstat, 0.04, [tag])]);
/* Fire, cold, lightning: added damage | penetration; the notable adds the effect and the ailment's chance. */
const element = (type, ailment, color, nname, effect) => C(type, cap(type), color, 'icon_talent_' + type,
  side(cap(type) + ' Touch', flat(type + 'Damage', 2, ALL)), side('Pierce ' + cap(type), flat(type + 'Pen', 0.03, ALL)),
  [flat(type + 'Damage', 1, ALL), flat(type + 'Pen', 0.02, ALL)], [nname, effect, flat(type + 'Damage', 2, ALL), flat(type + 'Pen', 0.03, ALL), flat(ailment + 'Chance', 0.05, ALL)], 1.5);
const K = {
  /* Combat: the main types first (how a hero hits), then the damage types, then Energy (ultimates). */
  melee: kind('melee', 'Melee', '#c7ced6', 'icon_talent_martial', 'melee', ['Brawler', 'Quick Blade', 'speed'], ['Deadly Strikes', flat('lucky', 1, ['melee'])]),
  projectile: kind('projectile', 'Projectile', '#f2b84b', 'icon_talent_marksman', 'projectile', ['Fletching', 'Far Shot', 'range'], ['Deadeye', flat('perTile', 0.04, ['projectile'])]),
  spell: kind('spell', 'Spell', '#c39bf2', 'icon_talent_sorcery', 'spell', ['Spark', 'Quick Cast', 'castSpeed'], ['Arcane Flow', flat('recast', 0.08, ['spell'])]),
  minion: C('minion', 'Minion', '#b58c5a', 'icon_minion', side('Pack Leader', inc('minionDamage', 0.05, ['minion'])), side('Feral Haste', inc('minionSpeed', 0.03, ['minion'])),
    [inc('minionDamage', 0.03, ['minion']), inc('minionSpeed', 0.02, ['minion'])],
    ['Bloodbond', flat('feed', 3, ['minion']), inc('minionDamage', 0.05, ['minion']), inc('minionSpeed', 0.04, ['minion'])]),
  physical: C('physical', 'Physical', '#b0b8c0', 'icon_talent_sunder', side('Heavy Blows', inc('damage', 0.04, ['physical'])), side('Sunder', flat('armorPen', 0.04, ['physical'])),
    [inc('damage', 0.02, ['physical']), flat('armorPen', 0.02, ['physical'])],
    ['Relentless', flat('focus', 0.1, ['physical']), inc('damage', 0.04, ['physical']), flat('armorPen', 0.05, ['physical'])], 1.5),
  fire: element('fire', 'burn', '#ff7a45', 'Pyromancy', flat('stagger', 0.2, ALL)),
  cold: element('cold', 'freeze', '#72c8f0', 'Hoarfrost', flat('deepFreeze', 1, ALL)),
  lightning: element('lightning', 'shock', '#d6a2ff', 'Thunderstruck', flat('arcing', 1, ALL)),
  toxic: C('toxic', 'Toxic', '#7ad04b', 'icon_talent_toxins', side('Venom', inc('damage', 0.05, ['toxic'])), side('Virulence', flat('poisonChance', 0.03, ALL)),
    [inc('damage', 0.03, ['toxic']), flat('poisonChance', 0.02, ALL)], ['Plaguebearer', flat('venom', 0.15, ALL), inc('damage', 0.06, ['toxic']), flat('poisonChance', 0.05, ALL)], 1.5),
  shadow: C('shadow', 'Shadow', '#9a5cd6', 'icon_dmg_shadow', side('Umbra', inc('damage', 0.05, ['shadow'])), side('Corrupt', flat('corruptionChance', 0.03, ['shadow'])),
    [inc('damage', 0.03, ['shadow']), flat('corruptionChance', 0.02, ['shadow'])],
    ['Shatter Will', flat('wither', 0.01, ['shadow']), inc('damage', 0.06, ['shadow']), flat('corruptionChance', 0.05, ['shadow'])], 1.5),
  holy: C('holy', 'Holy', '#fff0a8', 'icon_dmg_holy', side('Radiance', inc('damage', 0.05, ['holy'])), side('Holy Touch', flat('holyDamage', 2, ALL)),
    [inc('damage', 0.03, ['holy']), flat('holyDamage', 1, ALL)], ['Judgement', flat('overkill', 1, ALL), inc('damage', 0.06, ['holy']), flat('holyDamage', 2, ALL)], 1.5),
  energy: C('energy', 'Energy', '#5aa9ff', 'icon_talent_energy', side('Focus', inc('energyPerSecond', 0.05, ALL)), side('Linger', inc('duration', 0.05, ALL)),
    [inc('energyPerSecond', 0.03, ALL), inc('duration', 0.03, ALL)], ['Second Wind', flat('thrift', 0.2, ALL), inc('energyPerSecond', 0.12, ALL), inc('duration', 0.1, ALL)], 1.5),
  /* Quality of life. */
  economy: C('economy', 'Economy', '#e8c547', 'icon_talent_investor', side('Dividend', gflat('interest', 0.005), gflat('interestCap', 8)), side('Tithe', ginc('waveGold', 0.05)),
    [gflat('interest', 0.003), gflat('interestCap', 5), ginc('waveGold', 0.03)], ['Compounding', gflat('bossInterest', 1), gflat('interest', 0.01), gflat('interestCap', 20), ginc('waveGold', 0.1)], 1.5),
  merchant: C('merchant', 'Merchant', '#d9a0ff', 'icon_talent_merchant', side('Haggler', more('relicCost', -0.03)), side('Wide Stock', gflat('relicOffers', 0.25)),
    [more('relicCost', -0.02), gflat('relicOffers', 0.1)], ['Grand Bazaar', gflat('betterOffer', 1), more('relicCost', -0.08), gflat('relicOffers', 0.5)], 1.5),
  relics: C('relics', 'Relics', '#dcc6ff', 'icon_talent_relics', side('Second Look', gflat('rerolls', 1)), side('Picky', gflat('banishes', 1)),
    [gflat('rerolls', 1), gflat('banishes', 1)], ['Relic Hunter', gflat('waveReroll', 1), gflat('rerolls', 1), gflat('banishes', 1)]),
  training: C('training', 'Training', '#8be28b', 'icon_talent_training', side('Drills', gflat('heroStartLevel', 1)), side('Prodigy', gflat('evolveLevel', -1), more('evolveCost', -0.03)),
    [gflat('heroStartLevel', 1), gflat('evolveLevel', -1)], ['Veterans', gflat('freeEvolve', 1), gflat('heroStartLevel', 1), gflat('evolveLevel', -1)]),
  rewards: C('rewards', 'Rewards', '#f2b84b', 'icon_talent_fortune', side('Bookkeeper', ginc('rewardGold', 0.05)), side('Scholar', ginc('rewardXp', 0.05)),
    [ginc('rewardGold', 0.03), ginc('rewardXp', 0.03)], ['Pioneer', gflat('firstClear', 0.5), ginc('rewardGold', 0.1), ginc('rewardXp', 0.1)], 1.5),
  loot: C('loot', 'Loot', '#5aa9ff', 'icon_talent_treasure', side('Keen Find', gflat('itemRarity', 0.1)), side('Scavenger', ginc('rewardLoot', 0.08)),
    [gflat('itemRarity', 0.05), ginc('rewardLoot', 0.04)], ['Hoard', gflat('lootReroll', 1), gflat('itemRarity', 0.25), ginc('rewardLoot', 0.15)], 1.5),
  headstart: C('headstart', 'Head Start', '#c9b37e', 'icon_talent_gate', side('Pocket Change', gflat('startGold', 10)), side('Stout Gate', gflat('startLives', 1)),
    [gflat('startGold', 5), gflat('startLives', 1)], ['Fortified Start', gflat('startGold', 25), gflat('startLives', 2)]),
  bounty: C('bounty', 'Bounty', '#e5645a', 'icon_talent_tempo', side('Quick Study', ginc('heroXp', 0.05)), side('Prize Money', ginc('bounty', 0.05)),
    [ginc('heroXp', 0.03), ginc('bounty', 0.03)], ['Trophy Hunter', gflat('bossXp', 1), ginc('heroXp', 0.1), ginc('bounty', 0.1)])
};
const MASTERY = {};
/* The screen lists the tracks in two columns, in these orders. */
export const COMBAT_CLUSTERS = ['melee', 'projectile', 'spell', 'minion', 'physical', 'fire', 'cold', 'lightning', 'toxic', 'shadow', 'holy', 'energy'];
export const QOL_CLUSTERS = ['economy', 'merchant', 'relics', 'training', 'rewards', 'loot', 'headstart', 'bounty'];
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
  const c = K[key], k = c.k, [nname, ...nmods] = c.notable, id = s => TREE_ID + '_' + key + '_' + s;
  const steps = [
    { id: id('s'), name: c.title, mods: c.start },
    { id: id('a'), name: c.a.name, side: 'a', mods: scaled(c.a.mods, k) },
    { id: id('b'), name: c.b.name, side: 'b', mods: scaled(c.b.mods, k) },
    { id: id('m'), name: MASTERY[key] || c.title + ' Mastery', mastery: true, mods: [...scaled(c.a.mods, k), ...scaled(c.b.mods, k)] },
    { id: id('n'), name: nname, notable: true, mods: nmods }
  ].map((n, i) => addNode({ ...n, cluster: key, step: i }));
  steps.reduce((prev, n) => (link(prev, n), n), root);
  tree.clusters.push({ key, title: c.title, color: c.color, icon: c.icon, combat: COMBAT_CLUSTERS.includes(key), nodes: steps, start: steps[0], end: steps[4], notable: steps[4],
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
export function rewardBonus(ids, fresh = false) {
  const out = { gold: 0, xp: 0, loot: 0 };
  for (const m of talentMods(ids || [])) {
    if (m.stat === 'rewardGold') out.gold += m.value; else if (m.stat === 'rewardXp') out.xp += m.value; else if (m.stat === 'rewardLoot') out.loot += m.value;
    else if (m.stat === 'firstClear' && fresh) { out.gold += m.value; out.xp += m.value; }   /* Pioneer: a level not cleared yet */
  }
  return out;
}
