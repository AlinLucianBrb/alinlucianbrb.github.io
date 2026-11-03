import test from 'node:test';
import assert from 'node:assert/strict';
import { TREES, TREE_ORDER, NODES, canAllocate, canRemove, pointsFor, talentMods } from '../js/content/talents.js';
import { HEROES } from '../js/content/data.js';
import { touches, heroStats } from '../js/engine/stats.js';
import { createRng } from '../js/engine/rng.js';

test('there is a general tree plus one per hero, with unique database-safe ids', () => {
  assert.deepEqual(TREE_ORDER, ['general', ...HEROES.map(h => h.id)]);
  const ids = [...NODES.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[a-z0-9_]{1,40}$/.test(id)), 'ids must match the server rule');
});

test('every node is reachable from its tree root, and hero nodes only target stats that hero has', () => {
  for (const id of TREE_ORDER) {
    const t = TREES[id], seen = new Set([id + '_root']), stack = [id + '_root'];
    while (stack.length) for (const l of NODES.get(stack.pop()).links) if (!seen.has(l)) { seen.add(l); stack.push(l); }
    assert.equal(seen.size, t.nodes.length, id + ' must be fully connected');
    const hero = HEROES.find(h => h.id === id);
    if (hero) for (const n of t.nodes) for (const m of n.mods) assert.ok(touches(hero, m), id + ' ' + n.id + ' targets ' + m.stat);
  }
});

test('allocation and removal follow the connection rules', () => {
  const a = new Set();
  assert.ok(canAllocate(a, NODES.get('warrior_0_0')));
  assert.ok(!canAllocate(a, NODES.get('warrior_0_1')));
  a.add('warrior_0_0'); a.add('warrior_0_1');
  assert.ok(canAllocate(a, NODES.get('warrior_0_2')));
  assert.ok(!canRemove(a, 'warrior_0_0'), 'cannot remove a node that holds up another');
  assert.ok(canRemove(a, 'warrior_0_1'));
  assert.ok(!canAllocate(a, NODES.get('warrior_root')) && !canRemove(a, 'warrior_root'));
  a.add('warrior_1_0'); a.add('warrior_1_1');           /* the ring link between branches lets a loop keep nodes alive */
  assert.ok(canRemove(a, 'warrior_0_0'));
});

test('talent points: one per level above 1', () => { assert.equal(pointsFor(1), 0); assert.equal(pointsFor(5), 4); });

test('talents become modifiers that only hit the intended heroes', () => {
  const mods = talentMods(['warrior_1_0', 'general_0_0', 'general_3_0', 'nope', 'general_root']);
  assert.deepEqual(mods.map(m => m.stat).sort(), ['arc', 'damage', 'startGold']);
  const warrior = HEROES.find(h => h.id === 'warrior'), archer = HEROES.find(h => h.id === 'archer');
  assert.equal(heroStats(warrior, mods).arc, 130);
  assert.equal(heroStats(archer, mods).arc, undefined);
  assert.ok(Math.abs(heroStats(archer, mods).damage - 10.4) < 1e-9, 'general damage reaches the archer');
});

/* The server (save_talents in the SQL) accepts a set if every node exists and connects to a root through allocated nodes.
   This mirrors that rule and checks it agrees with what a player can build click by click. */
test('the server rule accepts exactly the sets a player can build', () => {
  const links = new Map();
  for (const t of TREE_ORDER) for (const [a, b] of TREES[t].links) {
    (links.get(a) || links.set(a, []).get(a)).push(b); (links.get(b) || links.set(b, []).get(b)).push(a);
  }
  const roots = [...NODES.values()].filter(n => n.root).map(n => n.id);
  const serverOk = nodes => {
    const set = new Set(nodes);
    if (set.size !== nodes.length || nodes.some(id => !NODES.has(id) || NODES.get(id).root)) return false;
    const seen = new Set(roots), stack = [...roots];
    while (stack.length) for (const l of links.get(stack.pop()) || []) if (set.has(l) && !seen.has(l)) { seen.add(l); stack.push(l); }
    return nodes.every(id => seen.has(id));
  };
  const clientOk = ids => {
    const todo = new Set(ids), alloc = new Set(); let progress = true;
    while (todo.size && progress) { progress = false; for (const id of [...todo]) if (canAllocate(alloc, NODES.get(id))) { alloc.add(id); todo.delete(id); progress = true; } }
    return todo.size === 0;
  };
  const rng = createRng(2024), pool = [...NODES.values()].filter(n => !n.root);
  let valid = 0;
  for (let i = 0; i < 1500; i++) {
    const tree = TREE_ORDER[rng.int(TREE_ORDER.length)], cands = pool.filter(n => n.tree === tree).map(n => n.id), k = 1 + rng.int(8), sub = [];
    while (sub.length < Math.min(k, cands.length)) { const c = cands[rng.int(cands.length)]; if (!sub.includes(c)) sub.push(c); }
    assert.equal(serverOk(sub), clientOk(sub), 'disagreement on ' + sub.join(','));
    if (serverOk(sub)) valid++;
  }
  assert.ok(valid > 100, 'the sample should include plenty of valid sets');
  assert.ok(!serverOk(['general_root']) && !serverOk(['nope_1']) && !serverOk(['general_0_0', 'general_0_0']));
});
