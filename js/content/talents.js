/* The talents: 20 tracks of 5 (100 talents), one tree for every hero. Each track is a theme (Fire, Economy...) taken in order:
   the first three talents are the same (the track's two stats), the fourth gives more of them, and the fifth, the notable,
   is the track's unique effect alone. Combat (12): the main types (melee, projectile, spell, minion), the damage types
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

/* A track: key (part of the ids), title, colour, icon (assets/<icon>.png), names of the first three talents, step: the mods
   the first three talents each give (the track's two stats), more: what the fourth adds on top of a step (it is the step plus
   this), notable: [name, effect] (the fifth talent: only its unique effect). */
const C = (key, title, color, icon, names, step, more, notable) => ({ key, title, color, icon, names, step, more, notable });
const cap = t => t[0].toUpperCase() + t.slice(1);
/* ---- The tracks ---- */
/* A main type (melee, projectile, spell): its damage and its second stat. */
const kind = (key, title, color, icon, tag, names, bstat, notable) => C(key, title, color, icon, names,
  [inc('damage', 0.03, [tag]), inc(bstat, 0.02, [tag])], [inc('damage', 0.06, [tag]), inc(bstat, 0.04, [tag])], notable);
/* Fire, cold, lightning: more damage of that type and its penetration; the fourth also adds the ailment's chance. */
const element = (type, ailment, color, names, notable) => C(type, cap(type), color, 'icon_talent_' + type, names,
  [inc('damage', 0.04, [type]), flat(type + 'Pen', 0.025, [type])], [inc('damage', 0.08, [type]), flat(type + 'Pen', 0.04, [type]), flat(ailment + 'Chance', 0.05, [type])], notable);
const K = {
  /* Combat: the main types first (how a hero hits), then the damage types, then Energy (ultimates). */
  melee: kind('melee', 'Melee', '#c7ced6', 'icon_talent_martial', 'melee', ['Brawler', 'Quick Blade', 'Weapon Master'], 'speed', ['Deadly Strikes', flat('lucky', 1, ['melee'])]),
  projectile: kind('projectile', 'Projectile', '#f2b84b', 'icon_talent_marksman', 'projectile', ['Fletching', 'Far Shot', 'Sharpshooter'], 'range', ['Deadeye', flat('perTile', 0.04, ['projectile'])]),
  spell: kind('spell', 'Spell', '#c39bf2', 'icon_talent_sorcery', 'spell', ['Spark', 'Quick Cast', 'Arcanist'], 'castSpeed', ['Arcane Flow', flat('recast', 0.08, ['spell'])]),
  minion: C('minion', 'Minion', '#b58c5a', 'icon_minion', ['Pack Leader', 'Feral Haste', 'Beastmaster'],
    [inc('minionDamage', 0.03, ['minion']), inc('minionSpeed', 0.02, ['minion'])], [inc('minionDamage', 0.06, ['minion']), inc('minionSpeed', 0.04, ['minion'])],
    ['Bloodbond', flat('feed', 3, ['minion'])]),
  physical: C('physical', 'Physical', '#b0b8c0', 'icon_talent_sunder', ['Heavy Blows', 'Sunder', 'Crushing Force'],
    [inc('damage', 0.03, ['physical']), flat('armorPen', 0.03, ['physical'])], [inc('damage', 0.06, ['physical']), flat('armorPen', 0.07, ['physical'])],
    ['Relentless', flat('focus', 0.1, ['physical'])]),
  fire: element('fire', 'burn', '#ff7a45', ['Fire Touch', 'Pierce Fire', 'Inferno'], ['Pyromancy', flat('stagger', 0.2, ALL)]),
  cold: element('cold', 'freeze', '#72c8f0', ['Cold Touch', 'Pierce Cold', 'Winter'], ['Hoarfrost', flat('deepFreeze', 1, ALL)]),
  lightning: element('lightning', 'shock', '#d6a2ff', ['Lightning Touch', 'Pierce Lightning', 'Tempest'], ['Thunderstruck', flat('arcing', 1, ALL)]),
  toxic: C('toxic', 'Toxic', '#7ad04b', 'icon_talent_toxins', ['Venom', 'Virulence', 'Blight'],
    [inc('damage', 0.04, ['toxic']), flat('poisonChance', 0.03, ['toxic'])], [inc('damage', 0.08, ['toxic']), flat('poisonChance', 0.04, ['toxic'])],
    ['Plaguebearer', flat('venom', 0.15, ALL)]),
  shadow: C('shadow', 'Shadow', '#9a5cd6', 'icon_dmg_shadow', ['Umbra', 'Corrupt', 'Void'],
    [inc('damage', 0.04, ['shadow']), flat('corruptionChance', 0.03, ['shadow'])], [inc('damage', 0.08, ['shadow']), flat('corruptionChance', 0.04, ['shadow'])],
    ['Shatter Will', flat('wither', 0.01, ['shadow'])]),
  holy: C('holy', 'Holy', '#fff0a8', 'icon_dmg_holy', ['Radiance', 'Holy Touch', 'Sanctity'],
    [inc('damage', 0.04, ['holy']), flat('holyDamage', 1.5, ['holy'])], [inc('damage', 0.08, ['holy']), flat('holyDamage', 3, ['holy'])],
    ['Judgement', flat('overkill', 1, ALL)]),
  energy: C('energy', 'Energy', '#5aa9ff', 'icon_talent_energy', ['Focus', 'Linger', 'Overflow'],
    [inc('energyPerSecond', 0.05, ALL), inc('duration', 0.05, ALL)], [inc('energyPerSecond', 0.1, ALL), inc('duration', 0.08, ALL)],
    ['Second Wind', flat('thrift', 0.2, ALL)]),
  /* Quality of life. */
  economy: C('economy', 'Economy', '#e8c547', 'icon_talent_investor', ['Dividend', 'Tithe', 'Investor'],
    [gflat('interest', 0.005), gflat('interestCap', 8), ginc('waveGold', 0.05)], [gflat('interest', 0.008), gflat('interestCap', 17), ginc('waveGold', 0.08)],
    ['Compounding', gflat('bossInterest', 1)]),
  merchant: C('merchant', 'Merchant', '#d9a0ff', 'icon_talent_merchant', ['Haggler', 'Wide Stock', 'Trader'],
    [more('relicCost', -0.03), gflat('relicOffers', 0.2)], [more('relicCost', -0.07), gflat('relicOffers', 0.55)],
    ['Grand Bazaar', gflat('betterOffer', 1)]),
  relics: C('relics', 'Relics', '#dcc6ff', 'icon_talent_relics', ['Second Look', 'Picky', 'Collector'],
    [gflat('rerolls', 1), gflat('banishes', 1)], [gflat('rerolls', 1), gflat('banishes', 1)],
    ['Relic Hunter', gflat('waveReroll', 1)]),
  training: C('training', 'Training', '#8be28b', 'icon_talent_training', ['Drills', 'Prodigy', 'Mentor'],
    [gflat('heroStartLevel', 1), gflat('evolveLevel', -1), more('evolveCost', -0.02)], [gflat('heroStartLevel', 1), gflat('evolveLevel', -1), more('evolveCost', -0.03)],
    ['Veterans', gflat('freeEvolve', 1)]),
  rewards: C('rewards', 'Rewards', '#f2b84b', 'icon_talent_fortune', ['Bookkeeper', 'Scholar', 'Patron'],
    [ginc('rewardGold', 0.05), ginc('rewardXp', 0.05)], [ginc('rewardGold', 0.08), ginc('rewardXp', 0.08)],
    ['Pioneer', gflat('firstClear', 0.5)]),
  loot: C('loot', 'Loot', '#5aa9ff', 'icon_talent_treasure', ['Keen Find', 'Scavenger', 'Treasure Hunter'],
    [gflat('itemRarity', 0.1), ginc('rewardLoot', 0.07)], [gflat('itemRarity', 0.2), ginc('rewardLoot', 0.15)],
    ['Hoard', gflat('lootReroll', 1)]),
  headstart: C('headstart', 'Head Start', '#c9b37e', 'icon_talent_gate', ['Pocket Change', 'Stout Gate', 'Quartermaster'],
    [gflat('startGold', 5), gflat('startLives', 1)], [gflat('startGold', 30), gflat('startLives', 1)],
    ['Second Chance', gflat('lifeRefund', 1)]),
  bounty: C('bounty', 'Bounty', '#e5645a', 'icon_talent_tempo', ['Quick Study', 'Prize Money', 'Headhunter'],
    [ginc('heroXp', 0.03), ginc('bounty', 0.03)], [ginc('heroXp', 0.11), ginc('bounty', 0.11)],
    ['Trophy Hunter', gflat('bossXp', 1)])
};
const MASTERY = {};
/* The screen lists the tracks in two columns, in these orders. */
export const COMBAT_CLUSTERS = ['melee', 'projectile', 'spell', 'minion', 'physical', 'fire', 'cold', 'lightning', 'toxic', 'shadow', 'holy', 'energy'];
export const QOL_CLUSTERS = ['economy', 'merchant', 'relics', 'training', 'rewards', 'loot', 'headstart', 'bounty'];
export const TRACK_LENGTH = 5;

const tree = { id: TREE_ID, name: 'Talents', color: '#f2b84b', nodes: [], links: [], clusters: [] };
const round = v => Math.round(v * 1e4) / 1e4;
function addNode(n) {
  n.tree = TREE_ID; n.links = []; n.mods = n.mods || []; n.desc = n.desc || n.mods.map(fmtMod).join(', ');
  tree.nodes.push(n); NODES.set(n.id, n); return n;
}
function link(a, b) { a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }
const root = addNode({ id: TREE_ID + '_root', name: 'Origin', root: true, desc: 'The start of every track.' });
for (const key of [...COMBAT_CLUSTERS, ...QOL_CLUSTERS]) {
  const c = K[key], [nname, ...nmods] = c.notable, id = s => TREE_ID + '_' + key + '_' + s;
  /* The fourth: the step's mods plus `more` (the same stats added together, new ones after). */
  const fourth = c.step.map(m => { const x = c.more.find(y => y.stat === m.stat && y.type === m.type); return x ? { ...m, value: round(m.value + x.value) } : m; })
    .concat(c.more.filter(y => !c.step.some(m => m.stat === y.stat && m.type === y.type)));
  const steps = [
    { id: id('s'), name: c.names[0], mods: c.step },
    { id: id('a'), name: c.names[1], mods: c.step },
    { id: id('b'), name: c.names[2], mods: c.step },
    { id: id('m'), name: MASTERY[key] || c.title + ' Mastery', mastery: true, mods: fourth },
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
