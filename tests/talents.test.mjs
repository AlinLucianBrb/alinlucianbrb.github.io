/* The talent tree: clusters of 5 to 8 nodes joined by attribute paths, the allocation rules, and what talents do. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TREES, TREE_ORDER, TREE_ID, NODES, canAllocate, canRemove, pointsFor, pathTo, talentMods, rewardBonus } from '../js/content/talents.js';
import { HEROES, evolvedDef } from '../js/content/data.js';
import { fmtMod } from '../js/content/format.js';
import { touches, heroStats } from '../js/engine/stats.js';
import { mitigate } from '../js/engine/combat.js';
import { createRng } from '../js/engine/rng.js';

const tree = TREES[TREE_ID];
const cluster = key => tree.clusters.find(c => c.key === key);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('one tree for every hero, with unique database-safe ids that start with t2_', () => {
  assert.deepEqual(TREE_ORDER, ['t2']);
  const ids = [...NODES.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^t2_[a-z0-9_]{1,37}$/.test(id)), 'ids must match the server rule and the refund rule');
});

test('clusters of 5 to 8 nodes, with a notable each, and the ones the doc asks for', () => {
  for (const c of tree.clusters) {
    assert.ok(c.size >= 5 && c.size <= 8, c.key + ' has ' + c.size + ' nodes');
    assert.equal(tree.nodes.filter(n => n.cluster === c.key).length, c.size);
    assert.equal(tree.nodes.filter(n => n.cluster === c.key && n.notable).length, 1);
  }
  const keys = tree.clusters.map(c => c.key);
  for (const k of ['damage', 'speed', 'melee', 'projectile', 'spell', 'elements', 'energy', 'gold', 'rewards', 'relics', 'gate', 'tempo',   /* the old branches */
    'crit', 'cast', 'fire', 'cold', 'lightning', 'armorpen', 'respen']) assert.ok(keys.includes(k), 'cluster ' + k);
  const stats = key => new Set(tree.nodes.filter(n => n.cluster === key).flatMap(n => n.mods.map(m => m.stat)));
  assert.ok(stats('crit').has('critChance') && stats('crit').has('critDamage'));
  assert.ok(stats('cast').has('castSpeed'));
  for (const t of ['fire', 'cold', 'lightning']) assert.ok(stats(t).has(t + 'Damage'), t + ' damage');
  assert.ok(stats('armorpen').has('armorPen'));
  for (const t of ['fire', 'cold', 'lightning']) assert.ok(stats('respen').has(t + 'Pen'), t + ' penetration');
});

test('path nodes join the clusters, and each gives +1 to all attributes', () => {
  const paths = tree.nodes.filter(n => n.path);
  assert.ok(paths.length >= 20);
  for (const p of paths) assert.deepEqual(p.mods.map(fmtMod), ['+1 strength', '+1 dexterity', '+1 intellect']);
  /* Every cluster is reached through path nodes: no cluster node links straight to the origin. */
  assert.ok(NODES.get('t2_root').links.every(id => NODES.get(id).path));
  for (const c of tree.clusters) assert.ok(NODES.get(c.ring[0].id).links.some(id => NODES.get(id).path), c.key + ' has a path in');
  /* +1 to all attributes is +1% damage for any hero (its own attribute). */
  const one = talentMods([paths[0].id]);
  for (const h of HEROES) assert.ok(near(heroStats(h, one).damage, h.stats.damage * 1.11), h.id);
});

test('every node is reachable from the origin, and every hero node reaches at least one hero or evolved form', () => {
  const seen = new Set(['t2_root']), stack = ['t2_root'];
  while (stack.length) for (const l of NODES.get(stack.pop()).links) if (!seen.has(l)) { seen.add(l); stack.push(l); }
  assert.equal(seen.size, tree.nodes.length, 'fully connected');
  const forms = HEROES.flatMap(h => [h, ...h.evolutions.flatMap(s => s.choices.map(c => evolvedDef(h, c)))]);
  for (const n of tree.nodes) for (const m of n.mods) {
    if (m.scope === 'global') continue;
    assert.ok(forms.some(f => touches(f, m)), n.id + ' (' + n.name + ') targets ' + m.stat + ' on ' + m.scope + ', which no hero has');
  }
});

test('nodes do not overlap', () => {
  const ns = tree.nodes;
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const d = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y);
    assert.ok(d >= 30, ns[i].id + ' and ' + ns[j].id + ' are ' + d.toFixed(0) + ' apart');
  }
});

test('penetration: armor penetration ignores a share of armor, resistance penetration takes points off (hits only)', () => {
  const e = { armor: 100, res: { fire: 0.4, cold: 0.99 }, fx: null };
  const s = { armorPen: 0.5, firePen: 0.1, coldPen: 0.2 };
  assert.ok(near(mitigate(e, 'physical', 20, true, s), 20 * (1 - 50 / (50 + 100))), 'half the armor ignored');
  assert.ok(near(mitigate(e, 'fire', 100, true, s), 70), '40% resistance counts as 30%');
  assert.ok(near(mitigate(e, 'cold', 100, true, s), 21), 'after the 99% cap: 79%');
  assert.equal(mitigate(e, 'fire', 100, false, s), 60, 'damage over time is not penetrated');
  for (const h of HEROES) for (const k of ['armorPen', 'firePen', 'coldPen', 'lightningPen']) assert.equal(h.stats[k], 0, h.id + ' ' + k);
});

test('allocation, removal and paths follow the connection rules', () => {
  const a = new Set(), p = NODES.get('t2_root').links[0], entry = NODES.get(p).links.find(id => !NODES.get(id).root);
  assert.ok(canAllocate(a, NODES.get(p)), 'path nodes next to the origin');
  assert.ok(!canAllocate(a, NODES.get(entry)), 'a cluster needs its path first');
  a.add(p); a.add(entry);
  assert.ok(!canRemove(a, p), 'cannot remove a node that holds up another');
  assert.ok(canRemove(a, entry));
  assert.ok(!canAllocate(a, NODES.get('t2_root')) && !canRemove(a, 't2_root'));
  /* pathTo: the cheapest way to a node from what is taken, in an order that can be allocated one by one. */
  const way = pathTo(new Set(), 't2_tempo_n'), b = new Set();
  for (const id of way) { assert.ok(canAllocate(b, NODES.get(id)), id); b.add(id); }
  assert.equal(way.at(-1), 't2_tempo_n');
  assert.ok(pathTo(b, 't2_tempo_0').length === 0, 'already taken');
  assert.ok(pathTo(new Set(), 't2_crit_n').length < way.length, 'inner clusters are closer than outer ones');
});

test('talent points: one per level above 1', () => { assert.equal(pointsFor(1), 0); assert.equal(pointsFor(5), 4); });

test('talents become modifiers that only hit the intended heroes', () => {
  const melee = cluster('melee').ring.slice(0, 2).map(n => n.id), mods = talentMods([...melee, 'nope', 't2_root']);
  const warrior = HEROES.find(h => h.id === 'warrior'), ranger = HEROES.find(h => h.id === 'ranger');
  assert.ok(near(heroStats(warrior, mods).damage, 28 * 1.20), 'two Brawlers (+5% each, melee) and 10 strength');
  assert.ok(near(heroStats(ranger, mods).damage, 16 * 1.10), 'nothing for the Ranger');
  const hunter = evolvedDef(ranger, ranger.evolutions[0].choices.find(c => c.id === 'hunter')), elem = talentMods([cluster('elements').ring[0].id]);
  assert.ok(heroStats(hunter, elem).damage > heroStats(ranger, elem).damage, 'Elements and toxins reach the Hunter');
  const fire = talentMods([cluster('fire').ring[0].id]);
  assert.equal(heroStats(ranger, fire).fireDamage, 2, 'added fire damage for every hero');
});

test('non-damage talents: rewards, relic rerolls and banishes, hero XP and 3x speed', async () => {
  const { createWorld } = await import('../js/engine/world.js');
  const rewards = tree.nodes.filter(n => n.cluster === 'rewards').map(n => n.id);
  const rb = rewardBonus(rewards);
  assert.ok(near(rb.gold, 0.2) && near(rb.xp, 0.2) && near(rb.loot, 0.23), JSON.stringify(rb));
  assert.deepEqual(rewardBonus([]), { gold: 0, xp: 0, loot: 0 });
  const plain = createWorld({ seed: 1 });
  assert.equal(plain.rerolls, 0); assert.equal(plain.banishes, 0); assert.equal(plain.gs.speed3x, false); assert.equal(plain.gs.heroXp, 1);
  const relics = createWorld({ seed: 1, talents: tree.nodes.filter(n => n.cluster === 'relics').map(n => n.id) });
  assert.equal(relics.rerolls, 2); assert.equal(relics.banishes, 2);
  const tempo = createWorld({ seed: 1, talents: pathTo(new Set(), 't2_tempo_n') });
  assert.equal(tempo.gs.speed3x, true, 'Overdrive unlocks 3x speed');
  assert.equal(fmtMod(NODES.get('t2_tempo_n').mods[0]), 'Unlocks 3x game speed');
  assert.equal(fmtMod(NODES.get('t2_crit_1').mods[0]), '+10% crit damage');
  assert.equal(fmtMod(NODES.get('t2_respen_0').mods[0]), '+3% fire penetration');
});

/* The server (save_talents in the SQL) accepts a set if every node exists and connects to the origin through allocated nodes.
   This mirrors that rule and checks it agrees with what a player can build click by click. */
test('the server rule accepts exactly the sets a player can build', () => {
  const links = new Map();
  for (const [a, b] of tree.links) { (links.get(a) || links.set(a, []).get(a)).push(b); (links.get(b) || links.set(b, []).get(b)).push(a); }
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
    const k = 1 + rng.int(10), sub = [];
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
  assert.ok(!serverOk(['t2_root']) && !serverOk(['nope_1']) && !serverOk(['t2_p0', 't2_p0']));
});

test('the SQL refunds points allocated in any older tree', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /where exists \(select 1 from unnest\(p\.talents\) as x where x !~ '\^t2_'\)/);
  assert.doesNotMatch(sql, /x !~ '\^main_'/, 'the old rule would refund the new tree');
});
