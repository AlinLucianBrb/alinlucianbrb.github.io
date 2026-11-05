import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TREES, TREE_ORDER, NODES, canAllocate, canRemove, pointsFor, talentMods, rewardBonus } from '../js/content/talents.js';
import { HEROES, evolvedDef } from '../js/content/data.js';
import { fmtMod } from '../js/content/format.js';
import { touches, heroStats } from '../js/engine/stats.js';
import { createRng } from '../js/engine/rng.js';

test('there is one tree for every hero, with unique database-safe ids', () => {
  assert.deepEqual(TREE_ORDER, ['main']);
  const ids = [...NODES.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[a-z0-9_]{1,40}$/.test(id)), 'ids must match the server rule');
  assert.equal(TREES.main.nodes.length, 1 + 12 * 4, 'a root and twelve branches of four');
});

test('every node is reachable from the root, and every hero node reaches at least one hero or evolved form', () => {
  const t = TREES.main, seen = new Set(['main_root']), stack = ['main_root'];
  while (stack.length) for (const l of NODES.get(stack.pop()).links) if (!seen.has(l)) { seen.add(l); stack.push(l); }
  assert.equal(seen.size, t.nodes.length, 'fully connected');
  const forms = HEROES.flatMap(h => [h, ...h.evolutions.flatMap(s => s.choices.map(c => evolvedDef(h, c)))]);
  for (const n of t.nodes) for (const m of n.mods) {
    if (m.scope === 'global') continue;
    assert.ok(forms.some(f => touches(f, m)), n.id + ' (' + n.name + ') targets ' + m.stat + ' on ' + m.scope + ', which no hero has');
  }
});

test('talents target tags, not heroes: the Elements branch reaches the Hunter and the Fire Mage but not the plain Ranger', () => {
  const mods = talentMods(['main_5_0']), ranger = HEROES.find(h => h.id === 'ranger');
  const hunter = evolvedDef(ranger, ranger.evolutions[0].choices.find(c => c.id === 'hunter'));
  assert.ok(heroStats(hunter, mods).damage > heroStats(ranger, mods).damage);
  assert.ok(Math.abs(heroStats(ranger, mods).damage - 16 * 1.1) < 1e-9, 'only its dexterity bonus');
});

test('allocation and removal follow the connection rules', () => {
  const a = new Set();
  assert.ok(canAllocate(a, NODES.get('main_0_0')));
  assert.ok(!canAllocate(a, NODES.get('main_0_1')));
  a.add('main_0_0'); a.add('main_0_1');
  assert.ok(canAllocate(a, NODES.get('main_0_2')));
  assert.ok(canAllocate(a, NODES.get('main_1_1')), 'the ring links neighbouring branches');
  assert.ok(!canRemove(a, 'main_0_0'), 'cannot remove a node that holds up another');
  assert.ok(canRemove(a, 'main_0_1'));
  assert.ok(!canAllocate(a, NODES.get('main_root')) && !canRemove(a, 'main_root'));
  a.add('main_1_0'); a.add('main_1_1');           /* the ring link between branches lets a loop keep nodes alive */
  assert.ok(canRemove(a, 'main_0_0'));
});

test('talent points: one per level above 1', () => { assert.equal(pointsFor(1), 0); assert.equal(pointsFor(5), 4); });

test('talents become modifiers that only hit the intended heroes', () => {
  const mods = talentMods(['main_2_0', 'main_0_0', 'main_7_0', 'nope', 'main_root']);
  assert.deepEqual(mods.map(m => m.stat).sort(), ['damage', 'damage', 'startGold']);
  const warrior = HEROES.find(h => h.id === 'warrior'), ranger = HEROES.find(h => h.id === 'ranger');
  assert.ok(Math.abs(heroStats(warrior, mods).damage - 28 * 1.20) < 1e-9, 'melee +6%, all +4% and strength +10%');
  assert.ok(Math.abs(heroStats(ranger, mods).damage - 16 * 1.14) < 1e-9, 'only the general damage reaches the ranger');
});

test('non-damage talents: rewards, relic rerolls and banishes, hero XP and 3x speed', async () => {
  const { createWorld } = await import('../js/engine/world.js');
  assert.deepEqual(rewardBonus(['main_8_0', 'main_8_1', 'main_8_2', 'main_8_3']), { gold: 0.2, xp: 0.2, loot: 0.3 });
  assert.deepEqual(rewardBonus([]), { gold: 0, xp: 0, loot: 0 });
  const plain = createWorld({ seed: 1 });
  assert.equal(plain.rerolls, 0); assert.equal(plain.banishes, 0); assert.equal(plain.gs.speed3x, false); assert.equal(plain.gs.heroXp, 1);
  const tempo = createWorld({ seed: 1, talents: ['main_11_0', 'main_11_1', 'main_11_2', 'main_11_3'] });
  assert.equal(tempo.gs.speed3x, true, 'Overdrive unlocks 3x speed');
  assert.ok(Math.abs(tempo.gs.heroXp - 1.4) < 1e-9, '+40% hero XP');
  assert.equal(fmtMod(NODES.get('main_11_3').mods[0]), 'Unlocks 3x game speed');
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
    /* Half the samples grow a set the way a player would (valid), then maybe swap one node for a random one (often invalid). */
    const k = 1 + rng.int(8), sub = [];
    while (sub.length < k) {
      const opts = pool.filter(n => !sub.includes(n.id) && canAllocate(new Set(sub), n));
      if (!opts.length) break;
      sub.push(opts[rng.int(opts.length)].id);
    }
    if (rng.next() < 0.5) { const c = pool[rng.int(pool.length)].id; if (!sub.includes(c)) sub[rng.int(sub.length)] = c; }
    assert.equal(serverOk(sub), clientOk(sub), 'disagreement on ' + sub.join(','));
    if (serverOk(sub)) valid++;
  }
  assert.ok(valid > 100, 'the sample should include plenty of valid sets');
  assert.ok(valid < 1450, 'and plenty of invalid ones');
  assert.ok(!serverOk(['main_root']) && !serverOk(['nope_1']) && !serverOk(['main_0_0', 'main_0_0']));
});

test('the SQL refunds points allocated in the old trees', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /where exists \(select 1 from unnest\(p\.talents\) as x where x !~ '\^main_'\)/);
  assert.ok([...NODES.keys()].every(id => id.startsWith('main_')), 'every node id starts with main_, so the refund keeps them');
});
