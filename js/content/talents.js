/* The talent tree, Path of Exile style: a root in the centre and branches growing outward.
   You can allocate a node only if it touches the root or an allocated node, and remove one only if everything
   else you allocated stays connected. Each node is a list of modifiers, the same kind relics use.
   To add a node: add an entry to a branch; to add a branch: add one to the addTree call (and space the angles). */
import { fmtMod } from './format.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });

/* branch = { angle, nodes: [[name, ...mods] x 3 small, [name, ...mods] notable] }. Nodes sit on rings 85, 150, 215 and 280 px out. */
function addTree(id, name, color, branches) {
  const tree = { id, name, color, nodes: [], links: [] };
  const root = { id: id + '_root', tree: id, name: name + ' origin', root: true, x: 0, y: 0, mods: [], links: [], desc: 'The starting point. Every path begins here.' };
  tree.nodes.push(root); NODES.set(root.id, root);
  const second = [];
  branches.forEach((b, bi) => {
    const rad = b.angle * Math.PI / 180; let prev = root;
    b.nodes.forEach(([nname, ...mods], i) => {
      const r = 85 + 65 * i;
      const n = { id: id + '_' + bi + '_' + i, tree: id, name: nname, notable: i === 3, branch: b.title, x: Math.round(r * Math.cos(rad)), y: Math.round(r * Math.sin(rad)), mods, links: [], desc: mods.map(fmtMod).join(', ') };
      tree.nodes.push(n); NODES.set(n.id, n); link(prev, n, tree); prev = n;
      if (i === 1) second.push(n);
    });
  });
  if (second.length > 2) second.forEach((n, i) => link(n, second[(i + 1) % second.length], tree)); /* ring between branches */
  TREES[id] = tree; TREE_ORDER.push(id);
}
function link(a, b, tree) { a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }

/* One tree for every hero. Hero nodes target tags (melee, projectile, spell, fire...), so they reach every hero that has
   the tag, including evolved forms that gain one (the Hunter is toxic, the Fire Mage is fire). The other branches are not
   about damage: gold in the match, rewards at the end of it, relic rerolls and banishes, and 3x game speed.
   Reward stats (rewardGold, rewardXp, rewardLoot) are applied by the server in finish_run, from the talent_nodes table. */
const small = (names, mk) => names.map(n => [n, ...mk()]);
const ALL = ['all'], ELEMENTS = ['fire', 'cold', 'lightning', 'toxic'];
addTree('main', 'Talents', '#f2b84b', [
  { angle: -90, title: 'Damage', nodes: [...small(['Sharpened', 'Honed', 'Keen'], () => [inc('damage', 0.04, ALL)]), ['Overwhelm', inc('damage', 0.10, ALL), inc('speed', 0.05, ALL)]] },
  { angle: -60, title: 'Speed', nodes: [...small(['Quick', 'Nimble', 'Swift'], () => [inc('speed', 0.04, ALL)]), ['Flurry', inc('speed', 0.10, ALL), inc('damage', 0.04, ALL)]] },
  { angle: -30, title: 'Melee', nodes: [...small(['Brawler', 'Bruiser', 'Slugger'], () => [inc('damage', 0.06, ['melee'])]), ['Whirlwind', flat('arc', 30, ['melee']), inc('damage', 0.08, ['melee'])]] },
  { angle: 0, title: 'Projectiles', nodes: [...small(['Fletching', 'Steady Aim', 'Hawk Eye'], () => [inc('damage', 0.06, ['projectile'])]), ['Deadeye', inc('range', 0.10, ['projectile']), inc('damage', 0.08, ['projectile'])]] },
  { angle: 30, title: 'Spells', nodes: [...small(['Spark', 'Channel', 'Surge'], () => [inc('damage', 0.06, ['spell'])]), ['Arcane Flow', inc('energyPerAttack', 0.2, ['spell']), inc('damage', 0.08, ['spell'])]] },
  { angle: 60, title: 'Elements', nodes: [...small(['Kindling', 'Frostbite', 'Venom'], () => [inc('damage', 0.08, ELEMENTS)]), ['Elementalist', inc('damage', 0.12, ELEMENTS), inc('range', 0.06, ELEMENTS)]] },
  { angle: 90, title: 'Energy', nodes: [...small(['Focus', 'Attune', 'Resolve'], () => [inc('energyPerAttack', 0.06, ALL)]), ['Second Wind', inc('energyPerAttack', 0.15, ALL), inc('damage', 0.04, ALL)]] },
  { angle: 120, title: 'Gold', nodes: [...small(['Pocket Change', 'Savings', 'Nest Egg'], () => [gflat('startGold', 10)]), ['Plunder', gflat('bounty', 1), ginc('waveGold', 0.10)]] },
  { angle: 150, title: 'Rewards', nodes: [['Bookkeeper', ginc('rewardGold', 0.10)], ['Scholar', ginc('rewardXp', 0.10)], ['Scavenger', ginc('rewardLoot', 0.15)],
    ['Fortune', ginc('rewardGold', 0.10), ginc('rewardXp', 0.10), ginc('rewardLoot', 0.15)]] },
  { angle: 180, title: 'Relics', nodes: [['Second Look', gflat('rerolls', 1)], ['Picky', gflat('banishes', 1)], ['Third Look', gflat('rerolls', 1)],
    ['Relic Hunter', gflat('banishes', 1), gflat('relicLuck', 0.25)]] },
  { angle: 210, title: 'Gate', nodes: [...small(['Stout Gate', 'Sturdy Gate', 'Iron Gate'], () => [gflat('startLives', 1)]), ['Fortified Gate', gflat('startLives', 2), more('evolveCost', -0.05)]] },
  { angle: 240, title: 'Tempo', nodes: [...small(['Quick Study', 'Apprentice', 'Veteran'], () => [ginc('heroXp', 0.10)]), ['Overdrive', gflat('speed3x', 1), ginc('heroXp', 0.10)]] }
]);

/* The reward bonuses a set of talents gives: { gold, xp, loot } as fractions (0.2 = +20%). The server sums the same columns. */
export function rewardBonus(ids) {
  const out = { gold: 0, xp: 0, loot: 0 };
  for (const m of talentMods(ids || [])) {
    if (m.stat === 'rewardGold') out.gold += m.value; else if (m.stat === 'rewardXp') out.xp += m.value; else if (m.stat === 'rewardLoot') out.loot += m.value;
  }
  return out;
}

export const pointsFor = level => Math.max(0, level - 1);
export const canAllocate = (alloc, node) => !node.root && !alloc.has(node.id) && node.links.some(l => alloc.has(l) || NODES.get(l).root);
/* A node can be removed only if every other allocated node of its tree still connects to the root. */
export function canRemove(alloc, id) {
  const n = NODES.get(id);
  if (!n || n.root || !alloc.has(id)) return false;
  const mine = TREES[n.tree].nodes.filter(x => x.id !== id && (alloc.has(x.id) || x.root));
  const keep = new Set(mine.map(x => x.id)), seen = new Set([n.tree + '_root']), stack = [n.tree + '_root'];
  while (stack.length) for (const l of NODES.get(stack.pop()).links) if (keep.has(l) && !seen.has(l)) { seen.add(l); stack.push(l); }
  return mine.every(x => seen.has(x.id));
}
/* Modifiers for a run, from the allocated node ids. Unknown ids are ignored. */
export function talentMods(ids) {
  const out = [];
  for (const id of ids) {
    const n = NODES.get(id);
    if (n && !n.root) for (const m of n.mods) out.push({ ...m, source: n.name, ri: -1 });
  }
  return out;
}
