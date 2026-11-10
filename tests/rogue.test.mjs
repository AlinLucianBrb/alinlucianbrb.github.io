/* The Rogue and its evolutions (Assassin, Toxicologist, Alchemist), critical hits and cast speed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS, DOUBLE_SWING_GAP, pickStrongest, rateOf } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { tickEffects } from '../js/engine/effects.js';
import { critMult } from '../js/engine/combat.js';
import { levelMods } from '../js/engine/levels.js';
import { MARK, POISON_POOL, OIL, TRAP, ORBIT_SCALE, groundSpots } from '../js/engine/ultimates.js';
import { HEROES, RELICS, T } from '../js/content/data.js';
import { heroStats } from '../js/engine/stats.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['assassin', 'toxicologist', 'alchemist'];
function hero(id = 'rogue', seed = 31) {
  const w = richWorld({ seed, lineup: [id] });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, id, ...tile);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);   /* test only: skip the XP */
  return { w, h };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const noCrit = h => { h.mods.push({ stat: 'critChance', type: 'flat', value: -1, scope: ['all'], source: 'test', ri: -2 }); };

test('the Rogue: a fourth playable hero, melee and dexterity, with 10% crit chance; it evolves into an Assassin, Toxicologist or Alchemist', () => {
  const r = HEROES.find(h => h.id === 'rogue');
  assert.ok(r); assert.equal(r.archetype, 'melee'); assert.equal(r.attribute, 'dexterity'); assert.equal(r.kind, 'doubleswing');
  assert.equal(r.stats.critChance, 0.1); assert.equal(r.ultimate, 'mark');
  assert.deepEqual(r.evolutions[0].choices.map(c => c.id), FORMS);
  for (const h of HEROES.filter(x => x.id !== 'rogue')) assert.equal(h.stats.critChance, 0, h.id + ' starts with no crits');
});

test('the Rogue swings twice in quick succession', () => {
  const { w, h } = hero(); noCrit(h); w.statsFor(h);
  const e = enemyAt(w, h.x + 30, h.y, 10, 1e6);
  h.cd = 0; tick(w, h);
  const one = dealt(e);
  assert.ok(Math.abs(one - h.s.damage) < 1e-6);
  tick(w, h, Math.round(DOUBLE_SWING_GAP * 60) + 1);
  assert.ok(Math.abs(dealt(e) - 2 * one) < 1e-6, 'the second swing');
});

test('critical hits: chance from critChance, x critDamage; heroes with no chance use no random rolls', () => {
  const { w, h } = hero();
  const e = enemyAt(w, h.x + 30, h.y, 10, 1e9);
  h.mods.push({ stat: 'critChance', type: 'flat', value: 0.9, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);
  assert.ok(h.s.critChance >= 1); assert.equal(h.s.critDamage, 1.5);
  assert.equal(critMult(w, h, e), 1.5, 'always crits at 100%');
  let crits = 0; w.ev.on('crit', () => crits++);
  w.attack(h, e); assert.equal(crits, 1);
  assert.ok(Math.abs(dealt(e) - h.s.damage * 1.5) < 1e-6);
  /* every point of dexterity gives a little crit chance, so a hero only has none if it has no dexterity */
  const { w: w2, h: war } = hero('warrior'); war.mods.push({ stat: 'dexterity', type: 'more', value: -1, scope: ['all'], source: 'test', ri: -2 }); w2.statsFor(war);
  const e2 = enemyAt(w2, war.x + 30, war.y, 10, 1e9), before = w2.rng.combat.state;
  assert.equal(war.s.critChance, 0);
  w2.attack(war, e2); assert.equal(w2.rng.combat.state, before, 'no crit chance: no roll');
});

test("the Rogue's Mark: every enemy on the map, 6 seconds, +25% crit chance and +50% crit damage against them, for every hero", () => {
  const { w, h } = hero();
  const a = enemyAt(w, h.x + 30, h.y, 10, 1e6), far = enemyAt(w, 9999, 9999, 0, 1e6);
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  for (const e of [a, far]) { assert.ok(e.fx.mark); assert.equal(e.fx.mark.chance, MARK.chance); assert.equal(e.fx.mark.dmg, MARK.dmg); }
  const { h: war } = hero('warrior');
  /* A Warrior has no crit chance of its own: against a marked enemy it crits about 25% of the time, for 2x. */
  let crits = 0, n = 2000, mults = new Set();
  for (let i = 0; i < n; i++) { const m = critMult(w, war, far); if (m > 1) { crits++; mults.add(m); } }
  assert.ok(crits > n * 0.21 && crits < n * 0.29, 'about 25%: ' + crits);
  assert.deepEqual([...mults], [2], '1.5 + 0.5');
  for (let i = 0; i < 6 * 60 + 2; i++) tickEffects(w, far, 1 / 60);
  assert.equal(far.fx.mark, undefined, 'gone after 6 seconds');
});

test('Assassin: teleports behind the strongest, toughest enemy in range (the most life left) and strikes it once, for double damage', () => {
  const { w, h } = hero(); evolveTo(w, h, 'assassin'); noCrit(h); w.statsFor(h);
  const weak = enemyAt(w, h.x + 40, h.y, 50, 100), tough = enemyAt(w, h.x - 90, h.y, 10, 5000), out = enemyAt(w, h.x + 400, h.y, 90, 99999);
  assert.equal(pickStrongest(w, h, h.s.range), tough);
  h.cd = 0; tick(w, h);
  assert.ok(Math.abs(dealt(tough) - h.s.damage) < 1e-6); assert.equal(dealt(weak), 0); assert.equal(dealt(out), 0);
  assert.ok(h.blink, 'drawn behind its target for a moment');
  assert.ok(Math.abs(h.s.damage - 17 * 1.37 * 1.5 * 2) < 1e-6, '+50% and x2 damage, after +37% dexterity');
  assert.equal(h.s.range, 130 * 1.5);
});

test('Assassin ultimate: clones strike every enemy on the map twice, instead of the normal strike', () => {
  const { w, h } = hero(); evolveTo(w, h, 'assassin'); noCrit(h); w.statsFor(h);
  const list = [enemyAt(w, h.x + 40, h.y, 10, 1e6), enemyAt(w, 9999, 9999, 5, 1e6), enemyAt(w, -500, 30, 3, 1e6)];
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  for (const e of list) assert.ok(Math.abs(dealt(e) - 2 * h.s.damage) < 1e-6, 'two strikes each');
  assert.equal(h.energy, 0);
});

test('Toxicologist: two toxic daggers at the strongest enemy in range; each one poisons', () => {
  const { w, h } = hero(); evolveTo(w, h, 'toxicologist'); noCrit(h); w.statsFor(h);
  const tough = enemyAt(w, h.x + 80, h.y, 10, 1e6); enemyAt(w, h.x + 30, h.y, 50, 10);
  h.cd = 0; tick(w, h);
  assert.equal(w.projs.length, 2); assert.ok(w.projs.every(p => p.look === 'dagger' && p.target === tough));
  const types = []; w.ev.on('damage', d => types.push(d.type));
  tick(w, h, 20);
  assert.deepEqual(types.slice(0, 2), ['toxic', 'toxic']);
  assert.equal(tough.fx.poison.stacks.length, 2, 'two poison stacks');
});

test('Toxicologist ultimate: a bottle lands where the enemy was and leaves a puddle that poisons whoever walks in, once a second', () => {
  const { w, h } = hero(); evolveTo(w, h, 'toxicologist');
  const e = enemyAt(w, h.x + 80, h.y, 10, 1e9);
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  assert.ok(w.projs.some(p => p.type === 'flask'));
  for (let i = 0; i < 60 && !w.zones.some(z => z.type === 'poisonpool'); i++) tick(w, h);
  const pool = w.zones.find(z => z.type === 'poisonpool');
  assert.ok(pool); assert.ok(Math.abs(pool.x - e.x) < 1e-6 && Math.abs(pool.y - e.y) < 1e-6); assert.equal(pool.r, POISON_POOL.radius);
  const walker = enemyAt(w, pool.x + 10, pool.y, 0, 1e9);
  for (let i = 0; i < 61; i++) updateZones(w, 1 / 60);   /* the next pulse comes within a second */
  assert.ok(walker.fx && walker.fx.poison, 'poisoned by the puddle');
  for (let i = 0; i < POISON_POOL.seconds * 60; i++) updateZones(w, 1 / 60);
  assert.equal(w.zones.some(z => z.type === 'poisonpool'), false, 'dries up after 6 seconds');
});

test('Alchemist: two concoctions at the strongest enemy: fire that burns, then toxic that poisons', () => {
  const { w, h } = hero(); evolveTo(w, h, 'alchemist'); noCrit(h); w.statsFor(h);
  const e = enemyAt(w, h.x + 80, h.y, 10, 1e6);
  h.cd = 0; tick(w, h);
  assert.deepEqual(w.projs.map(p => p.as), ['fire', 'toxic']);
  const types = []; w.ev.on('damage', d => types.push(d.type));
  tick(w, h, 25);
  assert.deepEqual(types.slice(0, 2).sort(), ['fire', 'toxic']);
  assert.ok(e.fx.burn, 'the fire one burns'); assert.ok(e.fx.poison, 'the toxic one poisons');
});

test('Alchemist ultimate: flammable puddles under enemies in range (then toward the entrance) slow enemies; a burning enemy makes one explode', () => {
  const { w, h } = hero(); evolveTo(w, h, 'alchemist');
  /* An enemy standing on a path tile in range. */
  const r2 = h.s.range ** 2, i = w.path.findIndex(([cx, cy]) => ((cx + 0.5) * T - h.x) ** 2 + ((cy + 0.5) * T - h.y) ** 2 <= r2);
  const [cx, cy] = w.path[i], e = enemyAt(w, (cx + 0.5) * T, (cy + 0.5) * T, i * T, 1e9), bystander = enemyAt(w, e.x + 20, e.y, i * T, 1e9);
  h.energy = h.s.energyMax; h.cd = 0;
  BEHAVIORS[h.def.kind].update(w, h, 1 / 60);
  const pools = w.zones.filter(z => z.type === 'oil');
  assert.equal(pools.length, OIL.count);
  assert.equal(pools[0].cell, i, 'the first one under the enemy');
  w.projs.length = 0; e.fx = null; bystander.fx = null;
  updateZones(w, 1 / 60);
  assert.ok(e.fx.oiled); assert.equal(tickEffects(w, e, 0), 0.5, 'half speed in the puddle');
  e.fx.burn = { t: 2, dps: 0, src: h };   /* it catches fire */
  const before = dealt(bystander);
  updateZones(w, 1 / 60);
  assert.ok(dealt(bystander) > before, 'the explosion hits everything close by');
  assert.ok(w.zones.filter(z => z.type === 'oil').length <= OIL.count - 1, 'that puddle is used up (a neighbour can go up too)');
});

test('ground spots: under enemies in range first (furthest along first), then the path tiles closest to the entrance', () => {
  const { w, h } = hero(); evolveTo(w, h, 'alchemist');   /* a long range, so several path tiles are in it */
  const r2 = h.s.range ** 2, inRange = w.path.map((c, i) => i).filter(i => ((w.path[i][0] + 0.5) * T - h.x) ** 2 + ((w.path[i][1] + 0.5) * T - h.y) ** 2 <= r2);
  assert.ok(inRange.length >= 3);
  assert.deepEqual(groundSpots(w, h, 2).map(s => s.i), inRange.slice(0, 2), 'no enemies: toward the entrance');
  const j = inRange.at(-1);
  enemyAt(w, 0, 0, 9999, 1e6);   /* out of range: ignored */
  const e = enemyAt(w, (w.path[j][0] + 0.5) * T, (w.path[j][1] + 0.5) * T, j * T, 1e6);
  assert.deepEqual(groundSpots(w, h, 2).map(s => s.i), [j, inRange[0]], 'under the enemy first');
  assert.deepEqual(groundSpots(w, h, 2, new Set([j])).map(s => s.i), inRange.slice(0, 2), 'a taken spot is skipped');
  assert.ok(e);
});

test('Hunter traps use the same spots: under enemies in range, or toward the entrance', () => {
  const w = richWorld({ seed: 31 });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, 'ranger', ...tile); h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  assert.ok(apply(w, { type: 'evolve', id: h.id, choice: 2 }).ok);
  const r2 = h.s.range ** 2, inRange = w.path.map((c, i) => i).filter(i => ((w.path[i][0] + 0.5) * T - h.x) ** 2 + ((w.path[i][1] + 0.5) * T - h.y) ** 2 <= r2);
  const j = inRange.at(-1), e = enemyAt(w, (w.path[j][0] + 0.5) * T, (w.path[j][1] + 0.5) * T, j * T, 1e9);
  h.energy = h.s.energyMax; h.cd = 0; BEHAVIORS[h.def.kind].update(w, h, 1 / 60);
  assert.deepEqual(w.zones.filter(z => z.type === 'trap').map(z => z.cell), [j, inRange[0], inRange[1]].slice(0, TRAP.count));
  assert.ok(e);
});

test('Boomerang Ranger: the spinning blade hits for 3x', () => {
  assert.equal(ORBIT_SCALE, 3);
  const w = richWorld({ seed: 31 });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, 'ranger', ...tile); h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  apply(w, { type: 'evolve', id: h.id, choice: 1 });
  enemyAt(w, h.x + 50, h.y, 10, 1e9);
  h.energy = h.s.energyMax; h.cd = 0; BEHAVIORS[h.def.kind].update(w, h, 1 / 60);
  assert.equal(w.projs.find(p => p.type === 'orbit').scale, 3);
});

test('cast speed: the Mage attacks at its cast speed; attack speed does not help it, cast speed does not help the others', () => {
  const mage = HEROES.find(h => h.id === 'mage'), ranger = HEROES.find(h => h.id === 'ranger');
  assert.equal(mage.rate, 'castSpeed'); assert.equal('speed' in mage.stats, false);
  const R = n => RELICS.find(r => r.name === n), as = m => m.map(x => ({ ...x }));
  const quick = as(R('Quick hands').mods(4)), cast = as(R('Quick incantation').mods(4));
  assert.equal(heroStats(mage, quick).castSpeed, 1, 'attack speed: nothing for the Mage');
  assert.ok(Math.abs(heroStats(mage, cast).castSpeed - 1.12) < 1e-9, 'cast speed: +12% (Epic)');
  assert.equal(heroStats(ranger, cast).speed, 1, 'and nothing for the Ranger');
  const w = richWorld({ seed: 31 }), [cx, cy] = [5, 0];
  let t; for (let x = 4; !t && x < 12; x++) for (let y = 2; y < 8; y++) if (!w.pathSet.has(x + ',' + y)) { t = [x, y]; break; }
  const m = place(w, 'mage', ...t);
  m.mods.push(...cast.map(x => ({ ...x, source: 'test', ri: -2 }))); w.statsFor(m);
  assert.ok(Math.abs(rateOf(m) - 1.12) < 1e-9);
  enemyAt(w, m.x + 40, m.y, 10, 1e9); m.cd = 0; BEHAVIORS.bolt.update(w, m, 1 / 60);
  assert.ok(Math.abs(m.cd - 1 / 1.12) < 1e-9, 'its next cast comes 1 / cast speed seconds later');
  assert.ok(cx >= 0 && cy >= 0);
});

test('the new relics: crit chance, crit damage and cast speed (and they can be item bonuses)', async () => {
  const { ITEM_BONUSES } = await import('../js/content/items.js');
  for (const n of ['Keen edge', 'Cruelty', 'Quick incantation']) { assert.ok(RELICS.some(r => r.name === n), n); assert.ok(ITEM_BONUSES.includes(n)); }
  assert.equal(RELICS.find(r => r.name === 'Keen edge').desc(1), '+3% crit chance');
});

test('a match with each Rogue form replays exactly', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['rogue'] });
    let t; for (let x = 4; !t && x < 12; x++) for (let y = 2; y < 8; y++) if (!w.pathSet.has(x + ',' + y)) { t = [x, y]; break; }
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'rogue', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'rogue', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(w.heroes[0].ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
