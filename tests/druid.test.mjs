/* The Druid and its evolutions (Animalic, Naturist, Lunar), and the root ailment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS, WOLF, THORNS, MOONBEAM } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { tickEffects } from '../js/engine/effects.js';
import { inflict } from '../js/engine/combat.js';
import { levelMods } from '../js/engine/levels.js';
import { GRASP, ENRAGE, SPIKES, MOON } from '../js/engine/ultimates.js';
import { HEROES, T } from '../js/content/data.js';
import { AILMENTS } from '../js/content/combat.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['animalic', 'naturist', 'lunar'];
function hero(id = 'druid', seed = 41, lineup = [id]) {
  const w = richWorld({ seed, lineup });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, id, ...tile);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);   /* test only: skip the XP */
  return { w, h };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const noRoot = h => { h.mods.push({ stat: 'rootChance', type: 'flat', value: -1, scope: ['all'], source: 'test', ri: -2 }); };

test('the Druid: a fifth playable hero, a spell caster with intellect whose bolts can root; it evolves into an Animalic, Naturist or Lunar Druid', () => {
  const d = HEROES.find(h => h.id === 'druid');
  assert.equal(d.archetype, 'spell'); assert.equal(d.attribute, 'intellect'); assert.equal(d.kind, 'bolt'); assert.equal(d.rate, 'castSpeed');
  assert.equal(d.stats.rootChance, 0.15); assert.equal(d.ultimate, 'grasp');
  assert.deepEqual(d.evolutions[0].choices.map(c => c.id), FORMS);
  assert.deepEqual(d.evolutions[0].choices.map(c => c.kind), ['wolf', 'thorns', 'moonbeam'], 'each evolution replaces the bolt');
});

test('root holds an enemy in place for a second; any damage type can root', () => {
  const { w, h } = hero();
  const e = enemyAt(w, 0, 0);
  inflict(w, h, e, 'root', 10);
  assert.equal(tickEffects(w, e, 0.5), 0, 'held in place');
  assert.equal(tickEffects(w, e, 0.6), 0);
  assert.equal(tickEffects(w, e, 0.1), 1, 'free again after a second');
  assert.equal(AILMENTS.root.duration, 1);
  assert.deepEqual(AILMENTS.root.from, ['physical', 'spell', 'fire', 'cold', 'lightning', 'toxic']);
});

test('the Druid\'s bolts root with their chance (15%), on the seeded combat stream', () => {
  const { w, h } = hero();
  h.mods.push({ stat: 'rootChance', type: 'flat', value: 0.85, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);
  const e = enemyAt(w, h.x + 40, h.y, 5 * T);
  tick(w, h, 60);
  assert.ok(dealt(e) > 0); assert.ok(e.fx && e.fx.root, 'a 100% chance roots');
  const { w: w2, h: h2 } = hero(); noRoot(h2); w2.statsFor(h2);
  const e2 = enemyAt(w2, h2.x + 40, h2.y, 5 * T);
  tick(w2, h2, 60);
  assert.ok(dealt(e2) > 0); assert.ok(!(e2.fx && e2.fx.root), 'no chance, no root');
});

test("Nature's grasp: heroes near the Druid (and the Druid) gain +10% root chance for 6 seconds", () => {
  const w = richWorld({ seed: 3, lineup: ['druid', 'warrior', 'ranger'] });
  const spots = []; for (let cx = 2; cx < 14; cx++) for (let cy = 1; cy < 9; cy++) if (!w.pathSet.has(cx + ',' + cy)) spots.push([cx, cy]);
  const d = place(w, 'druid', ...spots[20]);
  const near = spots.find(([x, y]) => Math.hypot(x - d.cx, y - d.cy) * T < 120 && (x !== d.cx || y !== d.cy));
  const far = spots.find(([x, y]) => Math.hypot(x - d.cx, y - d.cy) * T > 260);
  const a = place(w, 'warrior', ...near), b = place(w, 'ranger', ...far);
  d.energy = d.s.energyMax;
  assert.equal(w.attackMult(d, null), 1, 'the ultimate does not replace the bolt');
  assert.ok(Math.abs(d.s.rootChance - 0.25) < 1e-9, 'the Druid: 15% + 10%');
  assert.ok(Math.abs(a.s.rootChance - GRASP.mods[0].value) < 1e-9, 'a hero nearby');
  assert.equal(b.s.rootChance, 0, 'not a hero far away');
  for (let i = 0; i < GRASP.seconds * 60 + 2; i++) step(w);
  assert.equal(a.s.rootChance, 0, 'gone after 6 seconds');
});

test('Animalic Druid: the wolf runs to the enemy furthest along, bites in a cone and makes it bleed; enraged it has twice the reach and damage', () => {
  const { w, h } = hero(); evolveTo(w, h, 'animalic'); noRoot(h); w.statsFor(h);
  assert.equal(h.def.kind, 'wolf'); assert.ok(h.def.tags.includes('minion'));
  const front = enemyAt(w, h.x + 90, h.y, 9 * T), back = enemyAt(w, h.x - 60, h.y, 2 * T);
  tick(w, h, 1);
  const w0 = { ...h.wolf };
  tick(w, h, 60);
  assert.ok(Math.hypot(h.wolf.x - front.x, h.wolf.y - front.y) < Math.hypot(w0.x - front.x, w0.y - front.y), 'it runs toward the enemy furthest along');
  assert.ok(dealt(front) > 0 && dealt(back) === 0, 'it bites the one it chased');
  assert.ok(front.fx && front.fx.bleed, 'its bites bleed');
  /* one bite: compare normal and enraged damage on a fresh enemy at the wolf's mouth */
  const once = rage => {
    const r = hero(); evolveTo(r.w, r.h, 'animalic'); noRoot(r.h); r.h.mods.push({ stat: 'bleedChance', type: 'flat', value: -1, scope: ['all'], source: 'test', ri: -2 }); r.w.statsFor(r.h);
    r.h.wolf = { x: r.h.x, y: r.h.y, face: 1, bite: 0 }; r.h.rage = rage ? ENRAGE.seconds : 0; r.h.cd = 0;
    const e = enemyAt(r.w, r.h.x + (rage ? 45 : 20), r.h.y, 5 * T);
    BEHAVIORS.wolf.update(r.w, r.h, 1 / 60);
    return dealt(e);
  };
  const plain = once(false), mad = once(true);
  assert.ok(plain > 0, 'a normal bite'); assert.ok(Math.abs(mad - 2 * plain) < 1e-6, 'enraged: twice the damage, and it reaches 45 px (normal reach is ' + WOLF.reach + ')');
  const { w: w3, h: h3 } = hero(); evolveTo(w3, h3, 'animalic'); h3.energy = h3.s.energyMax; w3.attackMult(h3, null);
  assert.equal(h3.rage, ENRAGE.seconds, 'the ultimate enrages the wolf for 6 seconds');
});

test('Naturist Druid: thorns grow on the path ahead of the enemy and hurt whatever stands in them for 1.5 seconds; spikes erupt from every patch', () => {
  const { w, h } = hero(); evolveTo(w, h, 'naturist'); noRoot(h); w.statsFor(h);
  const e = enemyAt(w, h.x + 40, h.y, 4 * T);
  tick(w, h, 1);
  const z = w.zones.find(x => x.type === 'thorns');
  assert.ok(z, 'a thorn patch'); assert.equal(z.t, THORNS.life - 1 / 60, 'it lasts 1.5 seconds');
  const ahead = w.enemies[0]; ahead.x = z.x; ahead.y = z.y;   /* the enemy walks into it */
  const before = dealt(e);
  tick(w, h, 30);
  assert.ok(dealt(e) > before, 'thorns hurt it');
  for (let i = 0; i < 200; i++) tick(w, h);
  assert.ok(w.zones.filter(x => x.type === 'thorns').length <= THORNS.max, 'at most 8 patches');
  /* spikes */
  const { w: w2, h: h2 } = hero(); evolveTo(w2, h2, 'naturist'); noRoot(h2); w2.statsFor(h2);
  const e2 = enemyAt(w2, h2.x + 40, h2.y, 4 * T);
  tick(w2, h2, 1);
  const p = w2.zones.find(x => x.type === 'thorns'); e2.x = p.x; e2.y = p.y;
  const hp0 = dealt(e2);
  h2.energy = h2.s.energyMax; h2.cd = 0;
  BEHAVIORS.thorns.update(w2, h2, 1 / 60);
  const spikeHit = dealt(e2) - hp0;
  assert.ok(spikeHit > 0, 'the eruption hits the enemy standing in a patch');
  assert.ok(w2.zones.filter(x => x.type === 'thorns').every(x => x.spikeT > 0), 'every patch shows spikes');
  const ref = enemyAt(w2, 0, 0); w2.attack(h2, ref, 1);
  assert.ok(Math.abs(spikeHit - SPIKES.scale * dealt(ref)) < 1e-6, '4x a hit, once, even where patches overlap');
});

test('Lunar Druid: moonlight hits every enemy in range at once with cold damage and slows them; Moonfall smashes an area', () => {
  const { w, h } = hero(); evolveTo(w, h, 'lunar'); noRoot(h); w.statsFor(h);
  assert.equal(h.def.damageType, 'cold');
  const a = enemyAt(w, h.x + 50, h.y, 4 * T), b = enemyAt(w, h.x - 50, h.y, 3 * T), far = enemyAt(w, h.x + 600, h.y, 2 * T);
  tick(w, h, 1);
  assert.ok(dealt(a) > 0 && dealt(b) > 0 && dealt(far) === 0, 'all in range, nothing outside');
  assert.ok(a.fx && a.fx.chill && b.fx && b.fx.chill, 'slowed');
  assert.ok(Math.abs(dealt(a) - dealt(b)) < 1e-6, 'the same beam for each');
  const { w: w2, h: h2 } = hero(); evolveTo(w2, h2, 'lunar'); noRoot(h2); w2.statsFor(h2);
  const t = enemyAt(w2, h2.x + 50, h2.y, 4 * T), side = enemyAt(w2, h2.x + 300, h2.y, 1 * T);
  h2.energy = h2.s.energyMax; h2.cd = 0;
  tick(w2, h2, 1);
  const moon = w2.zones.find(z => z.type === 'moonfall');
  assert.ok(moon, 'a moon is falling'); assert.equal(moon.r, MOON.radius);
  const near = enemyAt(w2, moon.x + 10, moon.y, 4 * T), hp = dealt(near);
  for (let i = 0; i < MOON.fall * 60 + 2; i++) updateZones(w2, 1 / 60);
  assert.ok(!w2.zones.some(z => z.type === 'moonfall'), 'it landed');
  assert.ok(dealt(near) - hp > 0, 'and smashed the enemies where it fell');
  assert.ok(MOONBEAM.scale < 1 && side);
});

test('a match with the Druid in each form replays exactly, and every form uses its ultimate', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['druid'] });   /* no test shortcuts: the log must reproduce it */
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'druid', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'druid', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});

test('minion stats: the wolf fights with the Druid\'s stats plus minion damage, attack speed and crits; minion relics come only with a Druid', async () => {
  const { minionStats } = await import('../js/engine/stats.js');
  const { RELICS } = await import('../js/content/data.js');
  const s = minionStats({ damage: 10, fireDamage: 2, speed: 1, castSpeed: 1, critChance: 0.1, critDamage: 1.5, minionDamage: 1.5, minionSpeed: 1.2, minionCritChance: 0.2, minionCritDamage: 0.5 });
  assert.equal(s.damage, 15); assert.equal(s.fireDamage, 3); assert.ok(Math.abs(s.castSpeed - 1.2) < 1e-9);
  assert.ok(Math.abs(s.critChance - 0.3) < 1e-9); assert.equal(s.critDamage, 2);
  /* one bite with and without Pack leader (Epic: x4) */
  const bite = withLeader => {
    const r = hero(); evolveTo(r.w, r.h, 'animalic'); noRoot(r.h);
    r.h.mods.push({ stat: 'bleedChance', type: 'flat', value: -1, scope: ['all'], source: 'test', ri: -2 });
    if (withLeader) for (const m of RELICS.find(x => x.name === 'Pack leader').mods(4)) r.h.mods.push({ ...m, source: 'test', ri: -2 });
    r.w.statsFor(r.h);
    r.h.wolf = { x: r.h.x, y: r.h.y, face: 1, bite: 0 }; r.h.cd = 0;
    const e = enemyAt(r.w, r.h.x + 20, r.h.y, 5 * T);
    BEHAVIORS.wolf.update(r.w, r.h, 1 / 60);
    return { dealt: dealt(e), h: r.h };
  };
  const plain = bite(false), led = bite(true);
  assert.ok(led.h.s.minionDamage > 1 && Math.abs(led.dealt / plain.dealt - led.h.s.minionDamage) < 1e-6, 'Pack leader multiplies the wolf\'s damage');
  assert.equal(plain.h.ms.damage, plain.h.s.damage, 'with no minion modifiers the wolf hits like the Druid');
  const mage = hero('mage');
  assert.equal(mage.h.ms, null, 'heroes without a minion have no minion stats');
  /* relic offers */
  const minion = new Set(['Pack leader', 'Feral haste', 'Hunting instinct', 'Savage bite']);
  const offered = lineup => {
    const w = richWorld({ seed: 9, lineup }), seen = new Set();
    let t; for (let cx = 4; !t && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) t = [cx, cy];
    place(w, lineup[0], ...t);
    for (let i = 0; i < 60; i++) { apply(w, { type: 'buyRelic' }); for (const o of w.pick.offers) seen.add(o.relic.name); apply(w, { type: 'choose', index: 0 }); }
    return [...seen].filter(n => minion.has(n)).length;
  };
  assert.equal(offered(['mage']), 0, 'no minion relics without a Druid');
  assert.ok(offered(['druid']) > 0, 'with a Druid they can turn up');
});
