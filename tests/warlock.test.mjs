/* The Warlock and his forms: Corruption and Soul drain; Occult (Hex aura, Doom); Summoner (imps, Greater Demon);
   Infernalist (Hellfire, burning ground, contagion, Infernal). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { levelMods } from '../js/engine/levels.js';
import { ULTIMATES } from '../js/engine/ultimates.js';
import { damageTaken, tickEffects } from '../js/engine/effects.js';
import { inflict } from '../js/engine/combat.js';
import { DRAIN, DOOM, IMP, DEMON, HELLFIRE, INFERNAL } from '../js/engine/kits/warlock.js';
import { HEROES, RELICS, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';
import { pathPos } from '../js/engine/enemies.js';

const FORMS = ['occult', 'summoner', 'infernalist'];
function setup(lineup = ['warlock', 'warrior'], seed = 5) {
  const w = richWorld({ seed, lineup });
  const free = []; for (let cx = 3; cx < 13; cx++) for (let cy = 1; cy < 9; cy++) if (!w.pathSet.has(cx + ',' + cy)) free.push([cx, cy]);
  const h = place(w, 'warlock', ...free[0]);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  return { w, h, free };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const full = h => { h.energy = h.s.energyMax; };

test('the Warlock: a shadow caster with intellect whose bolts Corrupt (50%); three forms; his relics', () => {
  const d = HEROES.find(h => h.id === 'warlock');
  assert.equal(d.damageType, 'shadow'); assert.equal(d.attribute, 'intellect'); assert.equal(d.stats.corruptionChance, 0.5);
  assert.deepEqual(d.evolutions[0].choices.map(c => c.id), FORMS);
  for (const c of [d, ...d.evolutions[0].choices]) assert.ok(ULTIMATES[c.ultimate], c.ultimate);
  for (const n of ['Dark pact', 'Blasphemy']) assert.deepEqual(RELICS.find(r => r.name === n).lineup, ['warlock', 'paladin']);
});

test('his bolts Corrupt; Soul drain drains the toughest enemy for 5x over 2 seconds, and its death gives nearby heroes energy', () => {
  const { w, h, free } = setup(['warlock', 'warrior']);
  const e = enemyAt(w, h.x + 40, h.y, 10);
  h.mods.push({ stat: 'corruptionChance', type: 'flat', value: 0.5, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);
  tick(w, h, 120);
  assert.ok(e.fx && e.fx.corruption && e.fx.corruption.stacks.length > 0, 'corrupted');
  /* Soul drain */
  w.enemies.length = 0; w.projs.length = 0;
  const ally = place(w, 'warrior', ...free.find(([x, y]) => Math.hypot((x + 0.5) * T - h.x, (y + 0.5) * T - h.y) < DRAIN.radius && (x + 0.5) * T !== h.x));
  const big = enemyAt(w, h.x + 30, h.y, 10, 1e6), small = enemyAt(w, h.x + 30, h.y, 20, 50);
  full(h); h.cd = 0; tick(w, h, 1);
  const z = w.zones.find(q => q.type === 'drain');
  assert.ok(z && z.target === big, 'the toughest');
  /* a drained enemy that dies gives energy */
  z.target = small; const before = ally.energy;
  for (let i = 0; i < 200 && !small.dead; i++) { updateZones(w, 1 / 60); }
  assert.ok(small.dead); assert.equal(ally.energy, Math.min(ally.s.energyMax, before + DRAIN.energy));
});

test('Occult: no attack; the aura Hexes everything inside (+20% damage taken, slower); Doom adds +50% and explosions on death', () => {
  const { w, h } = setup(['warlock']);
  evolveTo(w, h, 'occult');
  const a = enemyAt(w, h.x + 20, h.y, 10), out = enemyAt(w, h.x + h.s.range + 40, h.y, 5);
  tick(w, h, 40);
  assert.ok(a.fx && a.fx.hex, 'hexed'); assert.ok(!out.fx || !out.fx.hex);
  assert.ok(Math.abs(damageTaken(a) - 1.2) < 1e-9);
  assert.equal(w.projs.length, 0);
  /* Doom */
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(h.auraCurse && h.auraCurse.id === 'doom');
  assert.ok(a.fx.doom, 'doomed'); assert.ok(Math.abs(damageTaken(a) - 1.7) < 1e-9);
  const neighbour = enemyAt(w, a.x + 10, a.y, 9), nb = dealt(neighbour);
  w.hit(h, a, a.hp + 10);
  assert.ok(a.dead);
  assert.ok(dealt(neighbour) - nb >= a.max * DOOM.share * 0.5, 'the explosion hit its neighbour');
});

test('Summoner: each cast summons an imp (up to 3, 10 s); imps throw bolts with the minion stats; Demon gate brings a demon for 8 s', () => {
  const { w, h } = setup(['warlock']);
  evolveTo(w, h, 'summoner');
  const e = enemyAt(w, h.x + 60, h.y, 10);
  for (let i = 0; i < 4; i++) { h.cd = 0; tick(w, h, 1); }
  assert.equal(h.imps.length, IMP.max, 'never more than 3');
  tick(w, h, 120);
  assert.ok(dealt(e) > 0, 'the imps hit it'); assert.ok(h.dealt > 0, 'credited to the Warlock');
  tick(w, h, 60 * (IMP.life + 1));
  assert.ok(h.imps.length <= IMP.max);
  /* minion damage makes imps hit harder */
  const one = (minion) => {
    const r = setup(['warlock'], 3); evolveTo(r.w, r.h, 'summoner');
    if (minion) r.h.mods.push({ stat: 'minionDamage', type: 'inc', value: 1, scope: ['all'], source: 'test', ri: -2 });
    r.w.statsFor(r.h); r.h.mods.push({ stat: 'corruptionChance', type: 'flat', value: -1, scope: ['all'], source: 't', ri: -2 }); r.w.statsFor(r.h);
    const x = enemyAt(r.w, r.h.x + 60, r.h.y, 10); r.h.cd = 0; tick(r.w, r.h, 90); return dealt(x);
  };
  assert.ok(one(true) > one(false) * 1.5, 'minion damage applies to imps');
  /* Demon gate */
  w.enemies.length = 0;
  const f = enemyAt(w, h.x + 50, h.y, 10);
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(h.demon && h.demon.t > DEMON.seconds - 0.1);
  h.mods.push({ stat: 'energyPerAttack', type: 'more', value: -1, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);   /* no second ultimate */
  tick(w, h, 120); assert.ok(dealt(f) > 0);
  tick(w, h, 60 * DEMON.seconds); assert.equal(h.demon, null, 'gone after 8 s');
});

test('Infernalist: Hellfire bursts and leaves burning ground; burns jump on death; Infernal drops a meteor and a golem', () => {
  const { w, h } = setup(['warlock']);
  evolveTo(w, h, 'infernalist');
  /* next to the path, with an enemy standing on it within range (Hellfire aims along the path) */
  for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'move', id: h.id, cx: x, cy: y + 1 }).ok || apply(w, { type: 'move', id: h.id, cx: x, cy: y - 1 }).ok) break; }
  const p = { x: 0, y: 0 }; let pd = 0;
  for (; pd < (w.path.length - 1) * T; pd += 4) { pathPos(w.path, pd / T, p); if (Math.hypot(p.x - h.x, p.y - h.y) < h.s.range * 0.8) break; }
  const e = enemyAt(w, p.x, p.y, pd);
  h.cd = 0; tick(w, h, 1);
  assert.ok(w.projs.some(p => p.type === 'lob'));
  tick(w, h, 60);
  const ground = w.zones.find(z => z.type === 'pulse' && z.look === 'hellfire');
  assert.ok(ground, 'burning ground'); assert.ok(dealt(e) > 0); assert.ok(e.fx && e.fx.burn, 'always burns');
  /* contagion */
  const a = enemyAt(w, 300, 300, 5, 10), b = enemyAt(w, 320, 300, 6);
  inflict(w, h, a, 'burn', 50);
  w.hit(h, a, 100);
  assert.ok(a.dead); assert.ok(b.fx && b.fx.burn, 'the burn jumped');
  /* a Fire Mage's burn does not jump */
  const m = { def: { damageType: 'fire' }, s: {} }, c = enemyAt(w, 500, 500, 5, 10), d = enemyAt(w, 510, 500, 6);
  inflict(w, m, c, 'burn', 50); w.hit(m, c, 100); assert.ok(!d.fx || !d.fx.burn);
  /* Infernal */
  w.enemies.length = 0; w.zones.length = 0; w.projs.length = 0;
  const g1 = enemyAt(w, h.x + 50, h.y, 10), g2 = enemyAt(w, h.x + 60, h.y, 11), lone = enemyAt(w, h.x - 80, h.y, 30);
  full(h); h.cd = 0; tick(w, h, 1);
  const met = w.zones.find(z => z.type === 'meteor');
  assert.ok(met && Math.abs(met.x - g1.x) < 1e-9 || Math.abs(met.x - g2.x) < 1e-9, 'on the group');
  for (let i = 0; i < 60; i++) updateZones(w, 1 / 60);
  assert.ok(w.zones.some(z => z.type === 'pulse' && z.look === 'golem'), 'the golem');
  assert.ok(dealt(g1) > 0 && dealt(g2) > 0);
});

test('a match with each Warlock form replays exactly, and every form uses its ultimate', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['warlock'] });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'warlock', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'warlock', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
