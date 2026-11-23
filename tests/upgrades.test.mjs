/* The second evolution (js/content/upgrades.js): every form's basic attack and ultimate upgrade, each compared with the same
   hero without it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, T, STAGES, evolutionStep, nextStep } from '../js/content/data.js';
import { UPGRADES, UPGRADE_LEVEL } from '../js/content/upgrades.js';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { levelMods } from '../js/engine/levels.js';
import { BEHAVIORS, pickStrongest } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { tickEffects } from '../js/engine/effects.js';
import { mitigate } from '../js/engine/combat.js';
import { pathPos } from '../js/engine/enemies.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { shove } from '../js/engine/kits/paladin.js';
import { upgradeOf } from '../js/engine/upgrades.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, enemyAt, dealt, withTemp, nearestPathD } from './helpers.mjs';

const STEP = 1 / 60;
const baseOf = form => HEROES.find(h => h.evolutions[0].choices.some(c => c.id === form));
const FORMS = HEROES.flatMap(h => h.evolutions[0].choices.map(c => c.id));
/* A level-30 hero of a form beside the path, with its attack (0) or ultimate (1) upgrade, or none (null). Every random roll is
   `roll`: 0.5 means no crits, and only sure ailments. */
function hero(form, up = null, roll = 0.5) {
  const base = baseOf(form), ally = base.id === 'warrior' ? 'ranger' : 'warrior', w = richWorld({ seed: 5, stage: 2, lineup: [base.id, ally] });
  w.rng.combat.next = () => roll; w.rng.combat.int = n => Math.floor(roll * n);
  const free = []; for (const [x, y] of w.path.slice(6)) for (const dy of [1, -1]) if (x >= 1 && x < 15 && y + dy >= 0 && y + dy < 9 && !w.pathSet.has(x + ',' + (y + dy))) free.push([x, y + dy]);
  const put = id => { for (const [cx, cy] of free) if (apply(w, { type: 'place', hero: id, cx, cy }).ok) return w.heroes.at(-1); throw new Error('no room for ' + id); };
  const h = put(base.id);
  h.level = UPGRADE_LEVEL; h.lvlMods = levelMods(UPGRADE_LEVEL); w.statsFor(h);
  assert.ok(apply(w, { type: 'evolve', id: h.id, choice: base.evolutions[0].choices.findIndex(c => c.id === form) }).ok);
  if (up !== null) assert.ok(apply(w, { type: 'evolve', id: h.id, choice: up }).ok, form + ' upgrade ' + up);
  const a = put(ally); a.x = h.x + 12; a.y = h.y; a.cd = 1e9;
  w.wave = 5; h.cd = 0;
  return { w, h, a };
}
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { for (const x of w.heroes) for (const b of x.buffs || []) b.t -= STEP; BEHAVIORS[h.def.kind].update(w, h, STEP); updateProjectiles(w, STEP); updateZones(w, STEP); } };
const full = h => { h.energy = h.s.energyMax; h.cd = 0; };
/* Casts the ultimate, then nothing more. */
const ult = (w, h, n = 1) => { full(h); tick(w, h, 1); h.cd = 1e9; tick(w, h, n); };
const once = (w, h, n = 60) => { h.cd = 0; tick(w, h, 1); h.cd = 1e9; tick(w, h, n); };   /* one attack */
function onPath(w, h, along = 0, hp = 1e6, type = 'grunt') {
  const { d } = nearestPathD(w, h.x, h.y), p = { x: 0, y: 0 }, at = Math.max(1, d + along);
  pathPos(w.path, at / T, p);
  return enemyAt(w, p.x, p.y, at, hp, type);
}
const sum = l => l.reduce((a, e) => a + dealt(e), 0);
/* measure(form's up) for the plain and the upgraded hero. */
const both = (form, up, f, roll) => [null, up].map(u => f(hero(form, u, roll)));
const ratio = (form, up, f, want, roll) => { const [a, b] = both(form, up, f, roll); assert.ok(a > 0, form + ' hits without it'); assert.ok(Math.abs(b / a - want) < 0.02, form + ': x' + (b / a).toFixed(3) + ', not x' + want); };

test('every form has two upgrades, attack then ultimate, with a name and a description; their levels and rules', () => {
  assert.deepEqual(Object.keys(UPGRADES).sort(), [...FORMS].sort());
  const ids = new Set();
  for (const f of FORMS) {
    assert.deepEqual(UPGRADES[f].map(u => u.slot), ['attack', 'ultimate'], f);
    for (const u of UPGRADES[f]) { assert.ok(u.name && u.short && !ids.has(u.id), u.id); ids.add(u.id); }
  }
  const base = HEROES[0];
  assert.equal(evolutionStep(base, 0).level, 15); assert.equal(evolutionStep(base, 1, 'sentinel').level, 30);
  assert.equal(evolutionStep(base, 2, 'sentinel'), null);
  const { h } = hero('sentinel', 0);
  assert.equal(nextStep(h), null); assert.equal(h.tier, 2); assert.equal(h.def.form, 'sentinel');
});

/* ---- Warrior ---- */
test('Berserker: a third swing; kills stretch Frenzy', () => {
  ratio('berserker', 0, ({ w, h }) => { const e = onPath(w, h); once(w, h, 40); return dealt(e); }, 3 / 2);
  const [plain, more] = both('berserker', 1, ({ w, h }) => {
    onPath(w, h); ult(w, h, 1); const b = h.buffs.find(x => x.id === 'frenzy'), t0 = b.t;
    for (let k = 0; k < 9; k++) w.hit(h, onPath(w, h, 0, 1), 10);
    return b.t - t0;
  });
  assert.equal(plain, 0); assert.ok(Math.abs(more - 5) < 1e-9, 'one second each, at most 5: ' + more);
});
test('Commander: the sword comes back; Rally gives damage', () => {
  ratio('commander', 0, ({ w, h }) => { const e = onPath(w, h); once(w, h, 120); return dealt(e); }, 2);
  const dmg = ({ w, h, a }) => { onPath(w, h); const d0 = a.s.damage; ult(w, h, 1); return a.s.damage / d0; };
  assert.deepEqual(both('commander', 1, dmg).map(x => +x.toFixed(3)), [1, 1.25]);
});
test('Sentinel: swings push; the Barricade lasts 2 s and bursts', () => {
  const push = ({ w, h }) => { const e = onPath(w, h, 0), d = e.d; once(w, h, 1); return d - e.d; };
  const [a, b] = both('sentinel', 0, push); assert.equal(a, 0); assert.ok(Math.abs(b - 0.3 * T) < 1e-9);
  const wall = ({ w, h }) => { const e = onPath(w, h, 0); ult(w, h, 1); const hit = dealt(e); tick(w, h, 90); const up = w.zones.some(z => z.type === 'barrier'); tick(w, h, 60); return [up, dealt(e) / hit]; };
  const [c, d] = both('sentinel', 1, wall); assert.deepEqual([c[0], +c[1].toFixed(2)], [false, 1]); assert.deepEqual([d[0], +d[1].toFixed(2)], [true, 4]);
});

/* ---- Hunter ---- */
test('Ranger: each enemy an arrow goes through makes it 15% stronger; the ring is twice as big and lasts 4 s', () => {
  const line = ({ w, h }) => { h.s = { ...h.s, critChance: 0, spread: 0 }; const l = [30, 60, 90].map(x => enemyAt(w, h.x + x, h.y, 100 - x)); once(w, h, 60); return l.map(dealt); };
  const [a, b] = both('marksman', 0, line);
  assert.ok(a[0] > 0 && Math.abs(a[2] - a[0]) < 1e-6, 'without it: the same for each');
  assert.ok(Math.abs(b[1] / b[0] - 1.15) < 1e-6 && Math.abs(b[2] / b[0] - 1.15 * 1.15) < 1e-6, 'with it: 15% more for each one before');
  const ring = ({ w, h }) => { onPath(w, h); full(h); tick(w, h, 1); const z = w.zones.find(x => x.type === 'ricochet'); return [z.r, Math.round(z.t * 10) / 10]; };
  assert.deepEqual(both('marksman', 1, ring), [[50, 2.5], [100, 4]].map(([r, t]) => [r, t]));
});
test('Boomerang: a second, weaker boomerang; two blades', () => {
  const thrown = ({ w, h }) => { onPath(w, h); tick(w, h, 1); return w.projs.filter(p => p.type === 'boomerang').map(p => p.scale); };
  assert.deepEqual(both('boomeranger', 0, thrown), [[1], [1, 0.6]]);
  const { w, h } = hero('boomeranger', 0); onPath(w, h); tick(w, h, 1); tick(w, h, 300); assert.ok(h.proj === null || w.projs.includes(h.proj), 'he throws again');
  assert.deepEqual(both('boomeranger', 1, ({ w, h }) => { onPath(w, h); full(h); tick(w, h, 1); return w.projs.filter(p => p.type === 'orbit').length; }), [1, 2]);
});
test('Poacher: arrows splash poison; five traps that leave puddles', () => {
  const near = ({ w, h }) => { onPath(w, h, 10); const o = onPath(w, h, -10); once(w, h, 60); return [dealt(o) > 0, !!(o.fx && o.fx.poison)]; };
  assert.deepEqual(both('hunter', 0, near), [[false, false], [true, true]]);
  const traps = ({ w, h }) => { onPath(w, h, 0); full(h); BEHAVIORS[h.def.kind].update(w, h, STEP); const n = w.zones.filter(z => z.type === 'trap').length; updateZones(w, STEP); return [n, w.zones.some(z => z.type === 'poisonpool')]; };
  assert.deepEqual(both('hunter', 1, traps), [[3, false], [5, true]]);
});

/* ---- Mage ---- */
test('Fire Mage: bolts explode for half; Inferno burns twice as hard and its victims explode', () => {
  const s = ({ w, h }) => { const e = onPath(w, h, 10), o = onPath(w, h, -10); once(w, h, 60); return dealt(o) / dealt(e); };
  assert.deepEqual(both('firemage', 0, s).map(x => +x.toFixed(2)), [0, 0.5]);
  const i = ({ w, h }) => { const e = onPath(w, h, 10), o = onPath(w, h, -10); full(h); h.def = { ...h.def }; BEHAVIORS.bolt.update(w, h, STEP); const dps = e.fx.burn.dps; w.projs.length = 0; w.hit(h, e, 1e9); return [dps, dealt(o)]; };
  const [a, b] = both('firemage', 1, i);
  assert.ok(Math.abs(b[0] / a[0] - 2) < 1e-9); assert.equal(a[1], 0); assert.ok(b[1] > 0, 'the blast');
});
test('Cold Mage: slowed enemies can freeze; Blizzard makes them take 30% more', () => {
  const f = ({ w, h }) => { const e = onPath(w, h, 0); once(w, h, 60); const first = !!e.fx.freeze; once(w, h, 60); return [first, !!e.fx.freeze]; };
  const froze = both('coldmage', 0, f, 0.15);   /* a roll of 0.15: under the 20% */
  assert.equal(froze[1][1], true, 'the second bolt found it slowed'); assert.equal(froze[0][1], froze[0][0]);
  const t = ({ w, h }) => { const e = onPath(w, h, 0); ult(w, h, 60); const before = e.hp; w.hit(h, e, 100); return before - e.hp; };
  assert.deepEqual(both('coldmage', 1, t).map(Math.round), [100, 130]);
});
test('Lightning Mage: bolts jump to 2 more at 60%; the storm lasts longer and follows', () => {
  const j = ({ w, h }) => { const l = [30, 10, -10, -30].map(k => onPath(w, h, k)); once(w, h, 60); return l.map(e => +(dealt(e) / dealt(l[0])).toFixed(2)); };
  assert.deepEqual(both('lightningmage', 0, j), [[1, 0, 0, 0], [1, 0.6, 0.6, 0]]);
  const s = ({ w, h }) => { onPath(w, h, 0); const far = onPath(w, h, 200); full(h); tick(w, h, 1); h.cd = 1e9; const z = w.zones.find(x => x.type === 'storm'), x0 = z.x, y0 = z.y; tick(w, h, 200); return [w.zones.includes(z), Math.hypot(z.x - far.x, z.y - far.y) < Math.hypot(x0 - far.x, y0 - far.y)]; };
  assert.deepEqual(both('lightningmage', 1, s), [[false, false], [true, true]]);
});

/* ---- Rogue ---- */
test('Assassin: a kill strikes on (up to 3 more); clones finish the weak', () => {
  const k = ({ w, h }) => { const l = [0, 4, 8, 12, 16, 20].map(x => onPath(w, h, x, 1)); once(w, h, 1); return l.filter(e => e.dead).length; };
  assert.deepEqual(both('assassin', 0, k), [1, 4]);
  const c = ({ w, h }) => { const e = onPath(w, h), b = onPath(w, h, 5, 1e6, 'boss'); e.hp = e.max * 0.1; b.hp = b.max * 0.1; ult(w, h, 1); return [e.dead, b.dead]; };
  assert.deepEqual(both('assassin', 1, c), [[false, false], [true, false]]);
});
test('Toxicologist: a third dagger at another enemy; deaths in the puddle leave a smaller one', () => {
  const d = ({ w, h }) => { const a = onPath(w, h, 0), o = onPath(w, h, 12, 5e5); tick(w, h, 1); return [w.projs.filter(p => p.target === a).length, w.projs.filter(p => p.target === o).length]; };
  assert.deepEqual(both('toxicologist', 0, d), [[2, 0], [2, 1]]);
  const p = ({ w, h }) => {
    const e = onPath(w, h, 0), o = onPath(w, h, 5); ult(w, h, 60);
    w.hit(h, e, 1e9); tick(w, h, 1); const first = w.zones.filter(z => z.type === 'poisonpool').length;
    const small = w.zones.find(z => z.small); if (small) { w.zones = [small]; w.hit(h, o, 1e9); tick(w, h, 2); }
    return [first, w.zones.filter(z => z.small).length];
  };
  assert.deepEqual(both('toxicologist', 1, p), [[1, 0], [2, 1]], 'and the small ones do not spread further');
});
test('Alchemist: concoctions splash; exploded puddles leave burning ground', () => {
  const s = ({ w, h }) => { onPath(w, h, 0); const o = onPath(w, h, -12, 5e5); once(w, h, 60); return dealt(o) > 0; };
  assert.deepEqual(both('alchemist', 0, s), [false, true]);
  const b = ({ w, h }) => { const e = onPath(w, h, 0); e.fx = { burn: { t: 9, dps: 0, src: h } }; full(h); tick(w, h, 2); return w.zones.some(z => z.type === 'pulse' && z.look === 'hellfire'); };
  assert.deepEqual(both('alchemist', 1, b), [false, true]);
});

/* ---- Druid ---- */
test('Animalic: bites the bleeding 50% harder; two spirit wolves during Enrage', () => {
  const bite = ({ w, h }) => { const e = onPath(w, h); tick(w, h, 1); h.wolf.x = e.x; h.wolf.y = e.y; e.fx = { bleed: { t: 99, dps: 0, src: h } }; e.hp = e.max; h.cd = 0; tick(w, h, 1); return dealt(e); };
  ratio('animalic', 0, bite, 1.5);
  const p = ({ w, h }) => { const l = [20, 0, -20].map(k => onPath(w, h, k)); tick(w, h, 1); h.wolf.x = l[0].x; h.wolf.y = l[0].y; full(h); tick(w, h, 1); h.cd = 1e9; tick(w, h, 90); const n = (h.spirits || []).length, hurt = l.filter(e => dealt(e) > 0).length; tick(w, h, 400); return [n, hurt === 3, h.spirits]; };
  const [a, b] = both('animalic', 1, p);
  assert.equal(a[0], 0); assert.equal(b[0], 2); assert.equal(b[1], true); assert.equal(b[2], null, 'gone when Enrage ends');
});
test('Naturist: thorns slow; spikes root', () => {
  const s = ({ w, h }) => { const e = onPath(w, h); h.cd = 0; tick(w, h, 1); const z = w.zones.find(x => x.type === 'thorns'); z.x = e.x; z.y = e.y; h.cd = 1e9; tick(w, h, 20); return tickEffects(w, e, 0.01); };
  assert.deepEqual(both('naturist', 0, s), [1, 0.7]);
  const r = ({ w, h }) => { const e = onPath(w, h); h.cd = 0; tick(w, h, 1); const z = w.zones.find(x => x.type === 'thorns'); z.x = e.x; z.y = e.y; full(h); tick(w, h, 1); return !!(e.fx && e.fx.root); };
  assert.deepEqual(both('naturist', 1, r), [false, true]);
});
test('Lunar: the beam grows on the same enemy, up to double; two more moons at half', () => {
  const g = ({ w, h }) => { const e = onPath(w, h), list = []; for (let k = 0; k < 40; k++) { const b = e.hp; h.cd = 0; BEHAVIORS.moonbeam.update(w, h, STEP); h.energy = 0; list.push(b - e.hp); } return [list[1] / list[0], list.at(-1) / list[0]]; };
  const [a, b] = both('lunar', 0, g);
  assert.deepEqual(a.map(x => +x.toFixed(2)), [1, 1]); assert.ok(b[0] > 1 && b[0] < 1.2); assert.ok(Math.abs(b[1] - 2) < 1e-6);
  const m = ({ w, h }) => { onPath(w, h); full(h); BEHAVIORS.moonbeam.update(w, h, STEP); return w.zones.filter(z => z.type === 'moonfall').map(z => z.scale); };
  assert.deepEqual(both('lunar', 1, m), [[5], [5, 2.5, 2.5]]);
});

/* ---- Priest ---- */
test('Incantation: crit chance in the aura; Crescendo ends in a burst', () => {
  const c = ({ w, h, a }) => { const c0 = a.s.critChance; tick(w, h, 1); return +(a.s.critChance - c0).toFixed(3); };
  assert.deepEqual(both('incantation', 0, c), [0, 0.1]);
  const b = ({ w, h }) => { const e = onPath(w, h); full(h); tick(w, h, 1); h.cd = 1e9; const before = dealt(e); tick(w, h, 6 * 60); return dealt(e) - before; };
  const [x, y] = both('incantation', 1, b); assert.equal(x, 0); assert.ok(y > 0);
});
test('Archangel: a second lance at another enemy; Judgement falls again after a kill', () => {
  const l = ({ w, h }) => { onPath(w, h, 20); onPath(w, h, -20); h.cd = 0; BEHAVIORS.lance.update(w, h, STEP); return w.projs.filter(p => p.type === 'lance').length; };
  assert.deepEqual(both('archangel', 0, l), [1, 2]);
  const j = ({ w, h }) => { const list = [0, 5, 10, 15, 20, 25].map(k => onPath(w, h, k, 1)); full(h); BEHAVIORS.lance.update(w, h, STEP); return list.filter(e => e.dead).length; };
  assert.deepEqual(both('archangel', 1, j), [1, 4]);
});
test('Gospel: Psalm gives damage too; Conversion turns two', () => {
  const d = ({ w, h, a }) => { onPath(w, h); const d0 = a.s.damage; tick(w, h, 1); return +(a.s.damage / d0).toFixed(3); };
  assert.deepEqual(both('gospel', 0, d), [1, 1.1]);
  const c = ({ w, h }) => { [0, 5, 10].map(k => onPath(w, h, k)); full(h); BEHAVIORS.psalm.update(w, h, STEP); return w.projs.filter(p => p.type === 'spirit').length; };
  assert.deepEqual(both('gospel', 1, c), [1, 2]);
});

/* ---- Warlock ---- */
test('Occult: Hex lowers defenses (also on one already hexed); Doom spreads', () => {
  const m = ({ w, h }) => { const e = onPath(w, h); e.armor = 0.5; e.res = { fire: 0.5 }; e.fx = { hex: { t: 1 } }; tick(w, h, 1); return [mitigate(e, 'physical', 100), mitigate(e, 'fire', 100)]; };
  assert.deepEqual(both('occult', 0, m).map(x => x.map(Math.round)), [[50, 50], [65, 65]]);
  const d = ({ w, h }) => { const e = onPath(w, h, 0, 1000), o = onPath(w, h, 10); full(h); tick(w, h, 1); delete (o.fx ||= {}).doom; w.hit(h, e, 1e9); return !!o.fx.doom; };
  assert.deepEqual(both('occult', 1, d), [false, true]);
});
test('Summoner: five imps; the demon explodes when it leaves', () => {
  const n = ({ w, h }) => { onPath(w, h); for (let k = 0; k < 8; k++) { h.cd = 0; h.energy = 0; BEHAVIORS.imps.update(w, h, STEP); } return h.imps.length; };
  assert.deepEqual(both('summoner', 0, n), [3, 5]);
  const x = ({ w, h }) => { const e = onPath(w, h); ult(w, h, 1); h.imps.length = 0; h.demon.t = STEP / 2; h.demon.cd = 1e9; const b = dealt(e); tick(w, h, 1); return dealt(e) - b; };
  const [a, b] = both('summoner', 1, x); assert.equal(a, 0); assert.ok(b > 0);
});
test('Infernalist: ground lasts twice as long; the meteor leaves a crater', () => {
  const t = ({ w, h }) => { onPath(w, h); h.cd = 0; BEHAVIORS.hellfire.update(w, h, STEP); return w.projs.find(p => p.type === 'lob').zone.t; };
  assert.deepEqual(both('infernalist', 0, t), [2, 4]);
  const c = ({ w, h }) => { onPath(w, h); ult(w, h, 60); return w.zones.some(z => z.type === 'pulse' && z.r === 60); };
  assert.deepEqual(both('infernalist', 1, c), [false, true]);
});

/* ---- Paladin ---- */
test('Heretic: the flail hits all around; during Heresy anyone\'s hits can burn', () => {
  const a = ({ w, h }) => { const e = onPath(w, h, 0), dx = h.x - e.x, dy = h.y - e.y, o = enemyAt(w, h.x + dx, h.y + dy, 0); once(w, h, 1); return [dealt(e) > 0, dealt(o) > 0]; };
  assert.deepEqual(both('heretic', 0, a), [[true, false], [true, true]]);
  const b = ({ w, h, a: ally }) => { const e = onPath(w, h); full(h); tick(w, h, 1); e.fx = null; w.attack(ally, e); return !!(e.fx && e.fx.burn); };
  assert.deepEqual(both('heretic', 1, b, 0.2), [false, true], 'a roll of 0.2: under the 30%');
});
test('Inquisitor: the chain strikes a second enemy; Purge adds 5 Verdict', () => {
  const c = ({ w, h }) => { const l = [0, 8, 16].map(k => onPath(w, h, k)); once(w, h, 1); return l.filter(e => e.fx && e.fx.verdict).length; };
  assert.deepEqual(both('inquisitor', 0, c), [1, 2]);
  const p = ({ w, h }) => { onPath(w, h, 0); const o = onPath(w, h, 8, 5e5); full(h); tick(w, h, 1); return o.fx.verdict ? o.fx.verdict.n : 0; };
  assert.deepEqual(both('inquisitor', 1, p), [0, 5]);
});
test('Crusader: the lunge reaches 50% further; Pinned doubles the damage of a wall slam', () => {
  const reach = ({ w, h }) => { const far = enemyAt(w, h.x + h.s.range * 1.3, h.y, 5), first = enemyAt(w, h.x + 20, h.y, 50); h.cd = 0; tick(w, h, 1); return dealt(far) > 0; };
  assert.deepEqual(both('crusader', 0, reach), [false, true]);
  const slam = ({ w, h }) => { h.s = { ...h.s, critChance: 0, spread: 0 }; w.wave = 2; const e = onPath(w, h, 0); e.d = 0; shove(w, h, e, upgradeOf(h, 'crusader_ult')); return dealt(e); };
  const [a, b] = both('crusader', 1, slam); assert.ok(a > 0 && Math.abs(b / a - 2) < 1e-6, 'at the entrance: a wall at once');
});

/* ---- Shaman ---- */
test('Witch Doctor: links 3 and shares 40%; the swarm flies back', () => {
  const l = ({ w, h }) => { const es = [0, 8, 16, 24, 32].map(k => onPath(w, h, k)); h.cd = 0; BEHAVIORS.darts.update(w, h, STEP); w.projs.length = 0; const linked = es.filter(e => e.fx && e.fx.link); w.hit(h, linked[0], 100); return [linked.length, Math.round(dealt(linked[1]))]; };
  assert.deepEqual(both('witchdoctor', 0, l), [[3, 30], [4, 40]]);
  const s = ({ w, h }) => { onPath(w, h); full(h); BEHAVIORS.darts.update(w, h, STEP); let n = 0; while (w.projs.some(p => p.type === 'swarm') && n < 9999) { updateProjectiles(w, STEP); n++; } return n; };
  ratio('witchdoctor', 1, s, 2);
});
test('Totemist: totems explode when they expire; a Surge makes them faster', () => {
  const x = ({ w, h }) => { const e = onPath(w, h); once(w, h, 1); const z = w.zones.find(q => q.type === 'totem'); z.x = e.x; z.y = e.y; z.cd = 1e9; z.t = STEP / 2; const b = dealt(e); tick(w, h, 1); return dealt(e) - b; };
  const [a, b] = both('totemist', 0, x); assert.equal(a, 0); assert.ok(b > 0);
  const f = ({ w, h }) => { const e = onPath(w, h); once(w, h, 1); const z = w.zones.find(q => q.type === 'totem'); z.x = e.x; z.y = e.y; full(h); tick(w, h, 1); h.cd = 1e9; z.cd = 0; tick(w, h, 1); return z.cd; };
  ratio('totemist', 1, f, 1 / 1.5);
});
test('Earthcaller: an aftershock for half; Tectonic shift slows', () => {
  ratio('earthcaller', 0, ({ w, h }) => { const e = onPath(w, h); once(w, h, 90); return dealt(e); }, 1.5);
  const s = ({ w, h }) => { const e = onPath(w, h); full(h); tick(w, h, 1); delete e.fx.stun; return tickEffects(w, e, 0.01); };
  assert.deepEqual(both('earthcaller', 1, s), [1, 0.5]);
});

test('"the strongest, toughest enemy" ranks the special enemies too', () => {
  const { w, h } = hero('assassin');
  for (const [weak, strong] of [['grunt', 'stunner'], ['grunt', 'tough'], ['minion', 'runner'], ['brute', 'tough'], ['tough', 'boss'], ['grunt', 'summoner']]) {
    w.enemies.length = 0; onPath(w, h, 0, 1e6, weak); const s = onPath(w, h, 2, 10, strong);
    assert.equal(pickStrongest(w, h, h.s.range), s, strong + ' before ' + weak);
  }
});

test('upgrades in a real match: evolving and upgrading replays exactly, for every form and both upgrades', () => {
  withTemp(STAGES[1], { hpMult: 0.3, growth: 1.04, waves: 34 }, () => {
    for (const base of HEROES) for (const [i, form] of base.evolutions[0].choices.entries()) {
      const up = i % 2, w = createWorld({ seed: 7, stage: 2, lineup: [base.id, base.id === 'warrior' ? 'mage' : 'warrior', base.id === 'ranger' ? 'mage' : 'ranger'] });
      const ids = [];
      for (const id of w.lineup) search: for (const [x, y] of w.path.slice(3)) for (const dy of [1, -1]) { const r = apply(w, { type: 'place', hero: id, cx: x, cy: y + dy }); if (r.ok) { ids.push(r.id); break search; } }
      const h = w.heroes.find(x => x.id === ids[0]); let after = 0;
      for (let k = 0; k < 60 * 2500 && w.phase !== 'over' && after < 60 * 30; k++) {
        if (w.picking) apply(w, { type: 'choose', index: 0 });   /* the legendary relic */
        if (w.phase === 'build') apply(w, { type: 'wave' });
        step(w);
        if (h.tier < 2 && w.gold >= 500 && h.level >= w.evolveLevel(h)) apply(w, { type: 'evolve', id: h.id, choice: h.tier ? up : i });
        if (h.tier === 2) after++;
      }
      assert.equal(h.def.upgrade && h.def.upgrade.id, UPGRADES[form.id][up].id, form.id + ': level ' + h.level + ', wave ' + w.wave);
      assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form.id);
    }
  });
});
