/* Talent trees, Path of Exile style: a root in the centre and branches growing outward.
   You can allocate a node only if it touches the root or an allocated node, and remove one only if everything
   else you allocated stays connected. Each node is a list of modifiers, the same kind relics use.
   To add a tree: call addTree. To add a node: add an entry to a branch. */
import { HEROES } from './data.js';
import { fmtMod } from './stats.js';

export const TREES = {}, TREE_ORDER = [], NODES = new Map();
const inc = (stat, value, scope) => ({ stat, type: 'inc', value, scope });
const flat = (stat, value, scope) => ({ stat, type: 'flat', value, scope });
const more = (stat, value) => ({ stat, type: 'more', value, scope: 'global' });
const gflat = (stat, value) => ({ stat, type: 'flat', value, scope: 'global' });
const ginc = (stat, value) => ({ stat, type: 'inc', value, scope: 'global' });

/* branch = { angle, title, nodes: [[name, ...mods] x 3 small, [name, ...mods] notable] } */
function addTree(id, name, color, branches) {
  const tree = { id, name, color, nodes: [], links: [] };
  const root = { id: id + '_root', tree: id, name: name + ' origin', root: true, x: 0, y: 0, mods: [], links: [], desc: 'The starting point. Every path begins here.' };
  tree.nodes.push(root); NODES.set(root.id, root);
  const second = [];
  branches.forEach((b, bi) => {
    const rad = b.angle * Math.PI / 180; let prev = root;
    b.nodes.forEach(([nname, ...mods], i) => {
      const r = 78 * (i + 1);
      const n = { id: id + '_' + bi + '_' + i, tree: id, name: nname, notable: i === 3, x: Math.round(r * Math.cos(rad)), y: Math.round(r * Math.sin(rad)), mods, links: [], desc: mods.map(fmtMod).join(', ') };
      tree.nodes.push(n); NODES.set(n.id, n); link(prev, n, tree); prev = n;
      if (i === 1) second.push(n);
    });
  });
  if (second.length > 2) second.forEach((n, i) => link(n, second[(i + 1) % second.length], tree)); /* ring between branches */
  TREES[id] = tree; TREE_ORDER.push(id);
}
function link(a, b, tree) { a.links.push(b.id); b.links.push(a.id); tree.links.push([a.id, b.id]); }

const small = (names, mk) => names.map(n => [n, ...mk()]);
addTree('general', 'General', '#f2b84b', [
  { angle: -90, nodes: [...small(['Sharpened', 'Honed', 'Keen'], () => [inc('damage', 0.04, ['all'])]), ['Overwhelm', inc('damage', 0.10, ['all']), inc('speed', 0.05, ['all'])]] },
  { angle: -18, nodes: [...small(['Quick', 'Nimble', 'Swift'], () => [inc('speed', 0.04, ['all'])]), ['Frenzy', inc('speed', 0.10, ['all']), inc('damage', 0.04, ['all'])]] },
  { angle: 54,  nodes: [...small(['Far', 'Farther', 'Distant'], () => [inc('range', 0.04, ['all'])]), ['Far Sight', inc('range', 0.10, ['all']), inc('damage', 0.04, ['all'])]] },
  { angle: 126, nodes: [...small(['Pocket Change', 'Savings', 'Nest Egg'], () => [gflat('startGold', 10)]), ['Plunder', gflat('bounty', 1), ginc('waveGold', 0.10)]] },
  { angle: 198, nodes: [...small(['Stout Gate', 'Sturdy Gate', 'Iron Gate'], () => [gflat('startLives', 1)]), ['Fortified Gate', gflat('startLives', 2), more('heroCost', -0.05)]] }
]);
const sc = id => [id];
const dmg = (id, v = 0.06) => () => [inc('damage', v, sc(id))];
const spd = (id, v = 0.05) => () => [inc('speed', v, sc(id))];
const rng = (id, v = 0.05) => () => [inc('range', v, sc(id))];
const A = [-90, 30, 150];
addTree('warrior', 'Warrior', '#c7ced6', [
  { angle: A[0], nodes: [...small(['Brawler', 'Bruiser', 'Slugger'], dmg('warrior')), ['Reaper', inc('damage', 0.15, sc('warrior')), inc('speed', 0.05, sc('warrior'))]] },
  { angle: A[1], nodes: [...small(['Wide Grip', 'Broad Stance', 'Long Blade'], () => [flat('arc', 10, sc('warrior'))]), ['Whirlwind', flat('arc', 30, sc('warrior')), inc('damage', 0.08, sc('warrior'))]] },
  { angle: A[2], nodes: [...small(['Footwork', 'Momentum', 'Rhythm'], spd('warrior')), ['Berserker', inc('speed', 0.12, sc('warrior')), flat('range', 10, sc('warrior'))]] }
]);
addTree('archer', 'Archer', '#f2b84b', [
  { angle: A[0], nodes: [...small(['Marksman', 'Sharpshooter', 'Hawk Eye'], dmg('archer')), ['Deadeye', inc('damage', 0.15, sc('archer')), inc('range', 0.05, sc('archer'))]] },
  { angle: A[1], nodes: [...small(['Quick Draw', 'Rapid Fire', 'Steady Hands'], spd('archer')), ['Barrage', inc('speed', 0.15, sc('archer'))]] },
  { angle: A[2], nodes: [...small(['Long Bow', 'Eagle Eye', 'Far Shot'], rng('archer')), ['Longshot', inc('range', 0.12, sc('archer')), inc('damage', 0.06, sc('archer'))]] }
]);
addTree('thief', 'Thief', '#8be28b', [
  { angle: A[0], nodes: [...small(['Shiv', 'Backstab', 'Cutthroat'], dmg('thief')), ['Assassin', inc('damage', 0.15, sc('thief')), inc('speed', 0.05, sc('thief'))]] },
  { angle: A[1], nodes: [...small(['Light Fingers', 'Fast Hands', 'Sleight'], spd('thief')), ['Blur', inc('speed', 0.15, sc('thief'))]] },
  { angle: A[2], nodes: [...small(['Long Throw', 'Wide Arc', 'Far Flight'], rng('thief', 0.06)), ['Boomerang Master', inc('range', 0.15, sc('thief')), inc('damage', 0.10, sc('thief'))]] }
]);
addTree('frostmage', 'Frost Mage', '#72c8f0', [
  { angle: A[0], nodes: [...small(['Frostbite', 'Rime', 'Icicle'], dmg('frostmage')), ['Glacial', inc('damage', 0.15, sc('frostmage')), inc('range', 0.05, sc('frostmage'))]] },
  { angle: A[1], nodes: [...small(['Cold Snap', 'Deep Chill', 'Numbing Cold'], () => [flat('chillTime', 0.25, sc('frostmage'))]), ['Permafrost', flat('chillTime', 0.75, sc('frostmage')), inc('damage', 0.08, sc('frostmage'))]] },
  { angle: A[2], nodes: [...small(['Winter Winds', 'Blizzard', 'Whiteout'], spd('frostmage')), ['Absolute Zero', inc('speed', 0.12, sc('frostmage')), inc('range', 0.08, sc('frostmage'))]] }
]);
addTree('firemage', 'Fire Mage', '#ff7a45', [
  { angle: A[0], nodes: [...small(['Ember', 'Flame', 'Blaze'], dmg('firemage')), ['Inferno', inc('damage', 0.15, sc('firemage')), inc('rampRate', 0.10, sc('firemage'))]] },
  { angle: A[1], nodes: [...small(['Focus', 'Concentration', 'Fixation'], () => [inc('rampRate', 0.08, sc('firemage'))]), ['Searing Focus', inc('rampRate', 0.20, sc('firemage')), inc('damage', 0.10, sc('firemage'))]] },
  { angle: A[2], nodes: [...small(['Reach', 'Wide Flame', 'Long Fire'], rng('firemage')), ['Pyre', inc('range', 0.12, sc('firemage')), inc('damage', 0.06, sc('firemage'))]] }
]);
addTree('lightningmage', 'Lightning Mage', '#d6a2ff', [
  { angle: A[0], nodes: [...small(['Static', 'Spark', 'Shock'], dmg('lightningmage')), ['Thunder', inc('damage', 0.15, sc('lightningmage')), inc('speed', 0.05, sc('lightningmage'))]] },
  { angle: A[1], nodes: [...small(['Charge', 'Surge', 'Overload'], spd('lightningmage')), ['Conduction', flat('jumps', 1, sc('lightningmage')), inc('speed', 0.08, sc('lightningmage'))]] },
  { angle: A[2], nodes: [...small(['Reach', 'Spread', 'Arc'], rng('lightningmage')), ['Arc Lord', flat('jumps', 2, sc('lightningmage')), inc('damage', 0.06, sc('lightningmage'))]] }
]);
/* Safety net: every hero should have a tree. */
HEROES.forEach(h => { if (!TREES[h.id]) throw new Error('Missing talent tree for ' + h.id); });

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
