/* The talents: 20 tracks of 5 taken in order, one point per account level up to 100, the allocation rules, and what talents do. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TREES, TREE_ORDER, TREE_ID, NODES, COMBAT_CLUSTERS, QOL_CLUSTERS, TRACK_LENGTH, canAllocate, canRemove, pointsFor, pathTo, talentMods, rewardBonus } from '../js/content/talents.js';
import { ACCOUNT } from '../js/content/rules.js';
import { HEROES, evolvedDef } from '../js/content/data.js';
import { fmtMod } from '../js/content/format.js';
import { touches, heroStats } from '../js/engine/stats.js';
import { mitigate } from '../js/engine/combat.js';
import { createRng } from '../js/engine/rng.js';

const tree = TREES[TREE_ID];
const cluster = key => tree.clusters.find(c => c.key === key);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('one tree for every hero, with unique database-safe ids that start with t6_', () => {
  assert.deepEqual(TREE_ORDER, ['t6']);
  const ids = [...NODES.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^t6_[a-z0-9_]{1,37}$/.test(id)), 'ids must match the server rule and the refund rule');
});

test('20 tracks of 5 (100 talents): three the same, a bigger fourth, the unique notable; 12 combat tracks by type, 8 quality of life', () => {
  assert.equal(tree.clusters.length, 20);
  assert.equal(tree.nodes.filter(n => !n.root).length, 100);
  assert.deepEqual(tree.clusters.filter(c => c.combat).map(c => c.key), COMBAT_CLUSTERS);
  assert.deepEqual(tree.clusters.filter(c => !c.combat).map(c => c.key), QOL_CLUSTERS);
  assert.deepEqual(COMBAT_CLUSTERS, ['melee', 'projectile', 'spell', 'minion', 'physical', 'fire', 'cold', 'lightning', 'toxic', 'shadow', 'holy', 'energy']);
  assert.deepEqual(QOL_CLUSTERS, ['economy', 'merchant', 'relics', 'training', 'rewards', 'loot', 'headstart', 'bounty']);
  const kind = m => m.stat + '|' + JSON.stringify(m.scope);
  for (const c of tree.clusters) {
    assert.equal(c.size, TRACK_LENGTH); assert.deepEqual(c.nodes.map(n => n.step), [0, 1, 2, 3, 4]);
    const [s, A, B, M, N] = c.nodes;
    assert.ok(N.notable && M.mastery && !s.notable, c.key);
    assert.ok(s.mods.length >= 2, c.key + ': two stats');
    assert.deepEqual(A.mods, s.mods); assert.deepEqual(B.mods, s.mods, c.key + ': the first three are the same');
    for (const m of s.mods) { const x = M.mods.find(y => kind(y) === kind(m) && y.type === m.type); assert.ok(x && Math.abs(x.value) > Math.abs(m.value), c.key + ': the fourth gives more ' + m.stat); }
    assert.equal(N.mods.length, 1, c.key + ': the notable is only its effect');
    assert.ok(!M.mods.some(m => m.stat === N.mods[0].stat), c.key);
  }
  const stats = new Set(tree.nodes.flatMap(n => n.mods.map(m => m.stat)));
  for (const st of ['damage', 'speed', 'castSpeed', 'range', 'minionDamage', 'minionSpeed', 'holyDamage', 'armorPen', 'firePen', 'coldPen',
    'lightningPen', 'poisonChance', 'corruptionChance', 'energyPerSecond', 'duration', 'rerolls', 'banishes', 'startGold', 'waveGold', 'startLives', 'evolveCost', 'heroXp',
    'bounty', 'rewardXp', 'rewardGold', 'rewardLoot', 'interest', 'interestCap', 'relicCost', 'relicOffers', 'itemRarity', 'heroStartLevel', 'evolveLevel'])
    assert.ok(stats.has(st), 'some talent gives ' + st);
  assert.ok(!stats.has('strength') && !stats.has('intellect'), 'no attribute paths any more');
});

test('a full track: three steps and the bigger fourth', () => {
  const sum = (ns, stat) => ns.flatMap(n => n.mods).filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0);
  assert.ok(near(sum(cluster('fire').nodes, 'damage'), 0.04 * 3 + 0.12), 'Fire: +4% fire damage three times, then +12%');
  assert.ok(cluster('fire').nodes.slice(0, 4).every(n => n.mods.every(m => m.scope[0] === 'fire')), 'only for fire heroes');
  assert.ok(near(sum(cluster('fire').nodes, 'firePen'), 0.025 * 3 + 0.065));
  assert.ok(near(sum(cluster('physical').nodes, 'damage'), 0.03 * 3 + 0.09));
  assert.ok(near(sum(cluster('melee').nodes, 'damage'), 0.03 * 3 + 0.09) && near(sum(cluster('melee').nodes, 'speed'), 0.02 * 3 + 0.06), 'Melee: 18% damage, 12% attack speed');
  assert.equal(sum(cluster('headstart').nodes, 'startLives'), 1 * 3 + 2);
  assert.equal(sum(cluster('headstart').nodes, 'startGold'), 5 * 3 + 35);
});

test('every talent reaches at least one hero or evolved form', () => {
  const forms = HEROES.flatMap(h => [h, ...h.evolutions.flatMap(s => s.choices.map(c => evolvedDef(h, c)))]);
  for (const n of tree.nodes) for (const m of n.mods) {
    if (m.scope === 'global') continue;
    assert.ok(forms.some(f => touches(f, m)), n.id + ' (' + n.name + ') targets ' + m.stat + ' on ' + m.scope + ', which no hero has');
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

test('a track is taken in order and given back from its end; pathTo takes the ones before', () => {
  const a = new Set(), [s0, s1, s2] = cluster('physical').nodes;
  assert.ok(canAllocate(a, s0), 'the start of any track');
  assert.ok(!canAllocate(a, s1), 'the second needs the first');
  a.add(s0.id); a.add(s1.id);
  assert.ok(!canRemove(a, s0.id), 'not from the middle');
  assert.ok(canRemove(a, s1.id));
  assert.ok(!canAllocate(a, NODES.get('t6_root')) && !canRemove(a, 't6_root'));
  assert.deepEqual(pathTo(new Set(), 't6_physical_n'), cluster('physical').nodes.map(n => n.id));
  assert.deepEqual(pathTo(a, s2.id), [s2.id]);
  assert.deepEqual(pathTo(a, s1.id), [], 'already taken');
});

test('talent points: one per account level, up to the top level, where every talent is owned', () => {
  assert.equal(ACCOUNT.maxLevel, 100);
  assert.equal(pointsFor(1), 1); assert.equal(pointsFor(37), 37); assert.equal(pointsFor(100), 100); assert.equal(pointsFor(140), 100);
  assert.equal(pointsFor(ACCOUNT.maxLevel), tree.nodes.filter(n => !n.root).length);
});

test('talents become modifiers that only hit the intended heroes', () => {
  const melee = [cluster('melee').a[0].id, cluster('melee').nodes[3].id], mods = talentMods([...melee, 'nope', 't5_root']);
  const warrior = HEROES.find(h => h.id === 'warrior'), ranger = HEROES.find(h => h.id === 'ranger');
  assert.ok(near(heroStats(warrior, mods).damage, 28 * 1.22), 'the second talent (+3%) and the mastery (+9%), melee, and 10 strength');
  assert.ok(near(heroStats(ranger, mods).damage, 16 * 1.10), 'nothing for the Ranger');
  const hunter = evolvedDef(ranger, ranger.evolutions[0].choices.find(c => c.id === 'hunter')), elem = talentMods([cluster('toxic').a[0].id]);
  assert.ok(heroStats(hunter, elem).damage > heroStats(ranger, elem).damage, 'Toxic reaches the Hunter');
  const fire = talentMods([cluster('fire').a[0].id]), mage = HEROES.find(h => h.id === 'mage'), firemage = evolvedDef(mage, mage.evolutions[0].choices.find(c => c.id === 'firemage'));
  assert.ok(heroStats(firemage, fire).damage > heroStats(firemage, []).damage, 'fire damage for a fire hero (Fire Mage)');
  assert.equal(heroStats(mage, fire).damage, heroStats(mage, []).damage, 'not for the arcane Mage');
  assert.equal(heroStats(ranger, fire).damage, heroStats(ranger, []).damage, 'nothing for the others');
  assert.equal(fmtMod(cluster('physical').start.mods[0]), '+3% physical damage');
  assert.equal(fmtMod(cluster('melee').start.mods[0]), '+3% melee damage');
});

test('non-damage talents: rewards, relic rerolls and banishes, hero XP', async () => {
  const { createWorld } = await import('../js/engine/world.js');
  const rw = cluster('rewards').nodes.map(n => n.id), rb = rewardBonus(rw);
  assert.ok(near(rb.gold, 0.05 * 3 + 0.13) && near(rb.xp, rb.gold) && rb.loot === 0, JSON.stringify(rb));
  const fresh = rewardBonus(rw, true);
  assert.ok(near(fresh.gold, rb.gold + 0.5) && near(fresh.xp, rb.xp + 0.5), 'Pioneer: +50% on a level not cleared yet');
  assert.ok(near(rewardBonus(cluster('loot').nodes.map(n => n.id)).loot, 0.07 * 3 + 0.22));
  assert.deepEqual(rewardBonus([]), { gold: 0, xp: 0, loot: 0 });
  const plain = createWorld({ seed: 1 });
  assert.equal(plain.rerolls, 0); assert.equal(plain.banishes, 0); assert.equal(plain.gs.heroXp, 1);
  const relics = createWorld({ seed: 1, talents: cluster('relics').nodes.map(n => n.id) });
  assert.equal(relics.rerolls, 5); assert.equal(relics.banishes, 5);
  const bounty = createWorld({ seed: 1, talents: pathTo(new Set(), 't6_bounty_n') });
  assert.ok(bounty.gs.heroXp > 1.1, 'Bounty: hero XP');
  assert.equal(fmtMod(NODES.get('t6_projectile_b').mods[1]), '+2% range for projectile heroes');
  assert.equal(fmtMod(NODES.get('t6_fire_m').mods[1]), '+6.5% fire penetration');
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
  assert.ok(!serverOk(['t6_root']) && !serverOk(['nope_1']) && !serverOk(['t6_melee_s', 't6_melee_s']) && !serverOk(['t6_melee_a']));
});

test('the SQL refunds points allocated in any older tree', () => {
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.match(sql, /where exists \(select 1 from unnest\(p\.talents\) as x where x !~ '\^t6_'\)/);
  assert.doesNotMatch(sql, /x !~ '\^(main|t2|t3|t4|t5)_'/, 'an old rule would refund the new tree');
  assert.match(sql, /if n > least\(me\.level, public\.rule_max_level\(\)\) then raise exception 'too many talent points'/);
  assert.match(sql, /while me\.level < public\.rule_max_level\(\) and me\.xp >= public\.rule_xp_need/, 'no levels past the top');
});

test('quality of life: Training, Merchant and Economy change the match; Rewards and Loot go to the server', async () => {
  const { createWorld, recalc } = await import('../js/engine/world.js');
  const { apply } = await import('../js/engine/commands.js');
  const all = key => cluster(key).nodes.map(n => n.id);
  /* Training: +1 three times and +2 = heroes start at level 6; -1 three times and -2 = evolve at level 10. */
  const tr = createWorld({ seed: 1, talents: all('training') }); tr.gold = 1e6;
  assert.equal(tr.gs.heroStartLevel, 5); assert.equal(tr.gs.evolveLevel, -5);
  let t; for (let x = 4; !t && x < 12; x++) for (let y = 2; y < 8; y++) if (!tr.pathSet.has(x + ',' + y)) { t = [x, y]; break; }
  const placed = apply(tr, { type: 'place', hero: 'warrior', cx: t[0], cy: t[1] }), h = tr.heroes.find(x => x.id === placed.id);
  assert.equal(h.level, 6); assert.ok(near(h.s.strength, 10 + 15), 'its level bonus too (+3 strength a level)');
  assert.equal(tr.evolveLevel(h), 10);
  assert.equal(apply(tr, { type: 'evolve', id: h.id, choice: 0 }).reason, 'level');
  h.level = 10; assert.equal(tr.evolveCost(h), 0, 'Veterans: the first evolution is free');
  const gold = tr.gold; assert.ok(apply(tr, { type: 'evolve', id: h.id, choice: 0 }).ok, 'evolves at level 10 instead of 15');
  assert.equal(tr.gold, gold); assert.ok(tr.evolveCost(h) > 0, 'only the first');
  assert.equal(tr.evolveLevel(h), 25, 'the upgrade too: 25 instead of 30');
  /* Merchant: relics cheaper (-3% x3, -10%, multiplied), and 0.2 x 3 + 0.75 = 1.35 more offers: always 4, sometimes 5. */
  const m = createWorld({ seed: 3, talents: all('merchant') }); m.gold = 1e6;
  assert.equal(m.relicCost(), Math.round(48 * 0.97 ** 3 * 0.9));
  const counts = new Set(); for (let i = 0; i < 40; i++) { apply(m, { type: 'buyRelic' }); counts.add(m.pick.offers.length); apply(m, { type: 'choose', index: 0 }); }
  assert.deepEqual([...counts].sort(), [4, 5]);
  /* Economy: interest from talents works like the relic. */
  const inv = createWorld({ seed: 2, talents: all('economy') });
  assert.ok(near(inv.gs.interest, 0.005 * 3 + 0.013), 'three steps and the fourth'); assert.equal(inv.gs.interestCap, 8 * 3 + 25);
  /* Rewards and Loot: no effect in the match; their numbers go into the talent table for finish_run. */
  const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("('t6_rewards_n', 't6', false, 0, 0, 0, 0, 0, 0.5, 0)"), 'Pioneer: +50% on a fresh level (reward_new)');
  assert.ok(sql.includes("('t6_loot_n', 't6', false, 0, 0, 0, 0, 0, 0, 1)"), 'Hoard: one reroll (reward_reroll)');
});
