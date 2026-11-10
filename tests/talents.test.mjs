/* The talent tree: symmetrical, two-stat clusters of 6 or 8 nodes joined at their beginnings by attribute paths, the allocation
   rules, and what talents do. */
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

test('one tree for every hero, with unique database-safe ids that start with t4_', () => {
  assert.deepEqual(TREE_ORDER, ['t4']);
  const ids = [...NODES.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^t4_[a-z0-9_]{1,37}$/.test(id)), 'ids must match the server rule and the refund rule');
});

test('clusters: 6 or 8 nodes, two kinds of stats: the beginning and the end (notable) have both, each side has one', () => {
  assert.equal(tree.clusters.length, 20);
  for (const c of tree.clusters) {
    assert.ok(c.size >= 5 && c.size <= 8, c.key + ' has ' + c.size + ' nodes');
    assert.equal(tree.nodes.filter(n => n.cluster === c.key).length, c.size);
    const kinds = ns => new Set(ns.flatMap(n => n.mods.map(m => m.stat + '|' + JSON.stringify(m.scope))));
    const A = kinds(c.a), B = kinds(c.b);
    assert.equal(A.size, 1, c.key + ': the left side has one kind'); assert.equal(B.size, 1, c.key + ': the right side has one kind');
    assert.notDeepEqual([...A], [...B]);
    for (const n of [c.start, c.end]) { const k = kinds([n]); assert.ok([...A, ...B].every(x => k.has(x)), c.key + ' ' + n.id + ' has both kinds'); }
    assert.ok(c.end.notable && !c.start.notable);
  }
  const stats = new Set(tree.nodes.flatMap(n => n.mods.map(m => m.stat)));
  for (const s of ['damage', 'speed', 'critChance', 'critDamage', 'castSpeed', 'fireDamage', 'coldDamage', 'lightningDamage', 'armorPen', 'firePen', 'coldPen', 'lightningPen',
    'energyPerAttack', 'rerolls', 'banishes', 'startGold', 'waveGold', 'startLives', 'evolveCost', 'heroXp', 'rewardXp', 'rewardGold', 'rewardLoot', 'speed3x', 'range',
    'interest', 'interestCap', 'relicCost', 'relicOffers', 'itemRarity', 'itemBonusChance', 'heroStartLevel', 'evolveLevel'])
    assert.ok(stats.has(s), 'some talent gives ' + s);
});

test('clusters connect only at their beginning node, to exactly one path node; the inner circle is made only of path nodes', () => {
  for (const c of tree.clusters) for (const n of c.nodes) {
    const outside = n.links.filter(id => NODES.get(id).cluster !== c.key);
    if (n === c.start) { assert.equal(outside.length, 1, c.key + ': one way in'); assert.ok(NODES.get(outside[0]).path); }
    else assert.deepEqual(outside, [], n.id + ' links outside its cluster');
  }
  /* The circle: path nodes linked to two other path nodes at the same distance from the origin, one per direction. */
  const r = n => Math.hypot(n.x, n.y);
  const circle = tree.nodes.filter(n => n.path && n.links.filter(id => NODES.get(id).path && Math.abs(r(NODES.get(id)) - r(n)) < 20).length === 2);
  assert.equal(circle.length, 20);
  for (const n of circle) assert.ok(!n.links.some(id => NODES.get(id).cluster && r(NODES.get(id)) < r(n)), 'no cluster sits inside the circle');
});

test('the top half is combat, the bottom half quality of life', () => {
  const top = tree.clusters.filter(c => c.y < -1), bottom = tree.clusters.filter(c => c.y > 1), level = tree.clusters.filter(c => Math.abs(c.y) <= 1);
  assert.equal(top.length, 9); assert.equal(bottom.length, 9); assert.equal(level.length, 2);
  assert.ok(top.every(c => c.combat), 'top: ' + top.filter(c => !c.combat).map(c => c.key));
  assert.ok(bottom.every(c => !c.combat), 'bottom: ' + bottom.filter(c => c.combat).map(c => c.key));
  assert.deepEqual(level.map(c => c.key + ':' + c.combat).sort(), ['energy:false', 'lightning:true']);
  for (const k of ['investor', 'merchant', 'treasure', 'training']) assert.ok(cluster(k), k);
});

test('the tree is symmetrical: turning it by 36 degrees, or mirroring it, puts every node on another node', () => {
  const key = (x, y) => Math.round(x / 3) + ',' + Math.round(y / 3), spots = new Set();
  for (const n of tree.nodes) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) spots.add(key(n.x + dx * 2, n.y + dy * 2));
  const rot = a => n => [n.x * Math.cos(a) - n.y * Math.sin(a), n.x * Math.sin(a) + n.y * Math.cos(a)];
  for (const f of [rot(Math.PI / 5), rot(2 * Math.PI / 5), n => [-n.x, n.y], n => [n.x, -n.y]]) for (const n of tree.nodes) { const [x, y] = f(n); assert.ok(spots.has(key(x, y)), n.id + ' has no partner'); }
});

test('path nodes join the clusters, and each gives +1 to all attributes', () => {
  const paths = tree.nodes.filter(n => n.path);
  assert.ok(paths.length >= 20);
  for (const p of paths) assert.deepEqual(p.mods.map(fmtMod), ['+1 strength', '+1 dexterity', '+1 intellect']);
  assert.ok(NODES.get('t4_root').links.every(id => NODES.get(id).path), 'the origin leads to paths');
  const one = talentMods([paths[0].id]);
  for (const h of HEROES) assert.ok(near(heroStats(h, one).damage, h.stats.damage * 1.11), h.id);
});

test('every node is reachable from the origin, and every hero node reaches at least one hero or evolved form', () => {
  const seen = new Set(['t4_root']), stack = ['t4_root'];
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
  const e = { armor: 0.4, res: { fire: 0.4, cold: 0.99 }, fx: null };
  const s = { armorPen: 0.5, firePen: 0.1, coldPen: 0.2 };
  assert.ok(near(mitigate(e, 'physical', 100, true, s), 80), 'half the armor ignored: 40% counts as 20%');
  assert.ok(near(mitigate(e, 'fire', 100, true, s), 70), '40% resistance counts as 30%');
  assert.ok(near(mitigate(e, 'cold', 100, true, s), 21), 'after the 99% cap: 79%');
  assert.equal(mitigate(e, 'fire', 100, false, s), 60, 'damage over time is not penetrated');
  for (const h of HEROES) for (const k of ['armorPen', 'firePen', 'coldPen', 'lightningPen']) assert.equal(h.stats[k], 0, h.id + ' ' + k);
});

test('allocation, removal and paths follow the connection rules', () => {
  const a = new Set(), p = NODES.get('t4_root').links[0], entry = NODES.get(p).links.find(id => !NODES.get(id).root);
  assert.ok(canAllocate(a, NODES.get(p)), 'path nodes next to the origin');
  assert.ok(!canAllocate(a, NODES.get(entry)), 'a cluster needs its path first');
  a.add(p); a.add(entry);
  assert.ok(!canRemove(a, p), 'cannot remove a node that holds up another');
  assert.ok(canRemove(a, entry));
  assert.ok(!canAllocate(a, NODES.get('t4_root')) && !canRemove(a, 't4_root'));
  /* pathTo: the cheapest way to a node from what is taken, in an order that can be allocated one by one. */
  const way = pathTo(new Set(), 't4_sunder_n'), b = new Set();
  for (const id of way) { assert.ok(canAllocate(b, NODES.get(id)), id); b.add(id); }
  assert.equal(way.at(-1), 't4_sunder_n');
  assert.ok(pathTo(b, 't4_sunder_s').length === 0, 'already taken');
  assert.ok(pathTo(new Set(), 't4_precision_n').length < way.length, 'inner clusters are closer than outer ones');
});

test('talent points: one per level above 1', () => { assert.equal(pointsFor(1), 0); assert.equal(pointsFor(5), 4); });

test('talents become modifiers that only hit the intended heroes', () => {
  const melee = cluster('martial').a.slice(0, 2).map(n => n.id), mods = talentMods([...melee, 'nope', 't4_root']);
  const warrior = HEROES.find(h => h.id === 'warrior'), ranger = HEROES.find(h => h.id === 'ranger');
  assert.ok(near(heroStats(warrior, mods).damage, 28 * 1.20), 'two Brawlers (+5% each, melee) and 10 strength');
  assert.ok(near(heroStats(ranger, mods).damage, 16 * 1.10), 'nothing for the Ranger');
  const hunter = evolvedDef(ranger, ranger.evolutions[0].choices.find(c => c.id === 'hunter')), elem = talentMods([cluster('toxins').a[0].id]);
  assert.ok(heroStats(hunter, elem).damage > heroStats(ranger, elem).damage, 'Elements and toxins reach the Hunter');
  const fire = talentMods([cluster('fire').a[0].id]);
  assert.equal(heroStats(ranger, fire).fireDamage, 2, 'added fire damage for every hero');
});

test('non-damage talents: rewards, relic rerolls and banishes, hero XP and 3x speed', async () => {
  const { createWorld } = await import('../js/engine/world.js');
  const rb = rewardBonus(cluster('fortune').nodes.map(n => n.id));
  assert.ok(near(rb.gold, 0.03 + 0.1 + 0.15) && near(rb.loot, 0.04 + 0.15 + 0.24) && rb.xp === 0, JSON.stringify(rb));
  assert.deepEqual(rewardBonus([]), { gold: 0, xp: 0, loot: 0 });
  const plain = createWorld({ seed: 1 });
  assert.equal(plain.rerolls, 0); assert.equal(plain.banishes, 0); assert.equal(plain.gs.speed3x, false); assert.equal(plain.gs.heroXp, 1);
  const relics = createWorld({ seed: 1, talents: cluster('relics').nodes.map(n => n.id) });
  assert.equal(relics.rerolls, 4); assert.equal(relics.banishes, 4);
  const tempo = createWorld({ seed: 1, talents: pathTo(new Set(), 't4_tempo_n') });
  assert.equal(tempo.gs.speed3x, true, 'Overdrive unlocks 3x speed');
  assert.equal(fmtMod(NODES.get('t4_tempo_n').mods[0]), 'Unlocks 3x game speed');
  assert.equal(fmtMod(NODES.get('t4_precision_b1').mods[0]), '+10% crit damage');
  assert.equal(fmtMod(NODES.get('t4_fire_b1').mods[0]), '+3% fire penetration');
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
  assert.ok(!serverOk(['t4_root']) && !serverOk(['nope_1']) && !serverOk(['t4_p0', 't4_p0']));
});

test('the SQL refunds points allocated in any older tree', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /where exists \(select 1 from unnest\(p\.talents\) as x where x !~ '\^t4_'\)/);
  assert.doesNotMatch(sql, /x !~ '\^(main|t2|t3)_'/, 'an old rule would refund the new tree');
});

test('the new quality-of-life clusters: Training, Merchant and Investor change the match; Treasure Hunter goes to the server', async () => {
  const { createWorld, recalc } = await import('../js/engine/world.js');
  const { apply } = await import('../js/engine/commands.js');
  const all = key => cluster(key).nodes.map(n => n.id);
  /* Training: +1 start, +2 sides, +1 notable = heroes start at level 5; -1 start, -2 sides, -1 notable = evolve at level 6. */
  const tr = createWorld({ seed: 1, talents: all('training') }); tr.gold = 1e6;
  assert.equal(tr.gs.heroStartLevel, 4); assert.equal(tr.gs.evolveLevel, -4);
  let t; for (let x = 4; !t && x < 12; x++) for (let y = 2; y < 8; y++) if (!tr.pathSet.has(x + ',' + y)) { t = [x, y]; break; }
  const placed = apply(tr, { type: 'place', hero: 'warrior', cx: t[0], cy: t[1] }), h = tr.heroes.find(x => x.id === placed.id);
  assert.equal(h.level, 5); assert.ok(near(h.s.strength, 10 + 12), 'its level bonus too (+3 strength a level)');
  assert.equal(tr.evolveLevel(h), 6);
  assert.equal(apply(tr, { type: 'evolve', id: h.id, choice: 0 }).reason, 'level');
  h.level = 6; assert.ok(apply(tr, { type: 'evolve', id: h.id, choice: 0 }).ok, 'evolves at level 6 instead of 10');
  /* Merchant: relics 15% cheaper (-2%, -3% x3, -8%, multiplied), and 0.1 + 0.25 x 3 + 0.5 = 1.35 more offers: always 4, sometimes 5. */
  const m = createWorld({ seed: 3, talents: all('merchant') }); m.gold = 1e6;
  assert.equal(m.relicCost(), Math.round(48 * 0.98 * 0.97 ** 3 * 0.92));
  const counts = new Set(); for (let i = 0; i < 40; i++) { apply(m, { type: 'buyRelic' }); counts.add(m.pick.offers.length); apply(m, { type: 'choose', index: 0 }); }
  assert.deepEqual([...counts].sort(), [4, 5]);
  /* Investor: interest from talents works like the relic. */
  const inv = createWorld({ seed: 2, talents: all('investor') });
  assert.ok(near(inv.gs.interest, 0.003 + 0.015 + 0.01), 'start, three Dividends, notable'); assert.equal(inv.gs.interestCap, 5 + 24 + 20);
  /* Treasure Hunter: no effect in the match; its numbers go into the talent table for finish_run. */
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8'), n = cluster('treasure').end;
  assert.ok(sql.includes("('" + n.id + "', 't4', false, 0, 0, 0, 0.25, 0.1)"), 'the notable: +25% rarity luck, +10% extra bonus chance');
});
