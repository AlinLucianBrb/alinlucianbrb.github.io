/* Synergies (js/content/synergies.js, js/engine/synergy.js): the ring of debuffs that open enemies to a damage type, and the
   level-30 passives that feed on debuffs other heroes put on enemies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RING, RING_MORE, DEBUFFS, DEBUFF_FROM, DEBUFF_LABEL } from '../js/content/synergies.js';
import { UPGRADES, PASSIVES } from '../js/content/upgrades.js';
import { DAMAGE_TYPES, AILMENTS } from '../js/content/combat.js';
import { HEROES } from '../js/content/data.js';
import { EFFECTS, EFFECT_HOOKS } from '../js/engine/effects.js';
import { attack, inflict } from '../js/engine/combat.js';
import { ringMult, passiveMult, distinctDebuffs, REVELATION } from '../js/engine/synergy.js';
import { DRAIN, drainMult } from '../js/engine/kits/warlock.js';
import { richWorld, tilesNearPath, place, enemyAt, dealt } from './helpers.mjs';
import '../js/engine/kits/index.js';

const FORMS = HEROES.flatMap(h => h.evolutions[0].choices.map(c => c.id));
const IDS = new Set([...HEROES.map(h => h.id), ...FORMS]);

test('the ring: every damage type is opened by debuffs of another kind, and they all exist', () => {
  assert.deepEqual(Object.keys(RING).sort(), [...DAMAGE_TYPES].sort());
  for (const [type, ids] of Object.entries(RING)) for (const id of ids) {
    assert.ok(EFFECTS[id], id); assert.ok(DEBUFF_LABEL[id], id);
    assert.notEqual(AILMENTS[id] && AILMENTS[id].type, type, type + ' is not opened by its own ailment');
  }
  for (const id of DEBUFFS) { assert.ok(EFFECTS[id], id); for (const f of DEBUFF_FROM[id] || []) assert.ok(IDS.has(f), id + ': ' + f); }
});

test('every form has a passive in the middle, built only from debuffs that exist', () => {
  for (const f of FORMS) {
    const p = UPGRADES[f][1];
    assert.equal(p.slot, 'passive', f); assert.equal(p.id, f + '_passive'); assert.ok(p.name && p.short, f);
    assert.equal(PASSIVES[f].name, p.name);
    for (const id of [...(p.vs || []), ...(p.per || []), ...(p.boost ? p.boost.vs : []), ...(p.extraStack ? p.extraStack.vs : [])]) assert.ok(EFFECTS[id], f + ': ' + id);
    assert.ok(p.vs || p.per || p.distinct || p.boost || p.extraStack || p.revelation || p.spread, f + ' does something');
  }
});

/* One hero hitting one enemy, with or without debuffs on it. */
function setup(id = 'ranger') {
  const w = richWorld({ lineup: [id] }), h = place(w, id, ...tilesNearPath(w, 1)[0]);
  w.rng.combat.next = () => 0.5;   /* no crits, no spread */
  return { w, h, e: enemyAt(w, h.x + 20, h.y) };
}
const hitWith = (id, fx, passive = null) => {
  const { w, h, e } = setup(id);
  if (passive) h.def = { ...h.def, upgrade: UPGRADES[passive][1] };
  if (fx) e.fx = fx;
  attack(w, h, e);
  return dealt(e);
};

test('the ring: a hit deals 25% more of a damage type to an enemy with its debuff, and only that type', () => {
  const plain = hitWith('ranger', null), frozen = hitWith('ranger', { freeze: { t: 5 } }), bleeding = hitWith('ranger', { bleed: { t: 5, dps: 0 } });
  assert.ok(Math.abs(frozen / plain - (1 + RING_MORE)) < 1e-9, 'physical on a frozen enemy');
  assert.equal(bleeding, plain, 'bleed opens enemies to toxic, not physical');
  const e = { fx: { verdict: { t: 1, n: 0 } } };
  assert.equal(ringMult(e, 'shadow'), 1, 'Verdict with no stacks is not there');
  e.fx.verdict.n = 2; assert.equal(ringMult(e, 'shadow'), 1 + RING_MORE);
});

test('passives: more against a debuff, per stack, per different debuff', () => {
  const plain = hitWith('ranger', null, 'boomeranger');
  assert.ok(Math.abs(hitWith('ranger', { bleed: { t: 5, dps: 0 } }, 'boomeranger') / plain - 1.4) < 1e-9, 'Open wounds: +40% to bleeding');
  const poison = n => ({ poison: { stacks: Array.from({ length: n }, () => ({ t: 5, dps: 0 })) } });
  const h = { def: { upgrade: UPGRADES.hunter[1] } };
  assert.ok(Math.abs(passiveMult(h, { fx: poison(5) }) - 1.2) < 1e-9, 'Blood in the water: 5 stacks');
  assert.ok(Math.abs(passiveMult(h, { fx: poison(20) }) - 1.6) < 1e-9, 'capped at +60%');
  const fx = { burn: { t: 1, dps: 1 }, shock: { t: 1 }, hex: { t: 1 } };
  assert.equal(distinctDebuffs({ fx }), 3);
  assert.ok(Math.abs(passiveMult({ def: { upgrade: UPGRADES.marksman[1] } }, { fx }) - 1.45) < 1e-9, 'Read the wounds: 3 debuffs');
  assert.equal(passiveMult({ def: { upgrade: UPGRADES.marksman[0] } }, { fx }), 1, 'the attack upgrade is no passive');
});

test('passives that change ailments: Flashpoint burns twice as hard, Thermal shock freezes twice as long, Septic stacks twice', () => {
  const { w, h, e } = setup('mage');
  const burnOn = (passive, fx) => { e.fx = fx; h.def = { ...h.def, upgrade: UPGRADES[passive][1] }; inflict(w, h, e, 'burn', 100); return e.fx.burn.dps; };
  const plainBurn = burnOn('coldmage', { poison: { stacks: [{ t: 5, dps: 0 }] } });
  assert.equal(burnOn('firemage', { poison: { stacks: [{ t: 5, dps: 0 }] } }), plainBurn * 2);
  assert.equal(burnOn('firemage', {}), plainBurn, 'not on an enemy without poison');
  e.fx = { burn: { t: 5, dps: 1 } }; h.def = { ...h.def, upgrade: UPGRADES.coldmage[1] }; inflict(w, h, e, 'freeze', 1);
  const long = e.fx.freeze.t;
  e.fx = { shock: { t: 5 } }; inflict(w, h, e, 'freeze', 1);
  assert.ok(Math.abs(long / e.fx.freeze.t - 2) < 1e-9);
  e.fx = { bleed: { t: 5, dps: 1 } }; h.def = { ...h.def, upgrade: UPGRADES.toxicologist[1] }; inflict(w, h, e, 'poison', 10);
  assert.equal(e.fx.poison.stacks.length, 2);
});

test('Festering hex: a Hexed enemy that dies passes its damage over time to the nearest enemy', () => {
  const { w, h, e } = setup('warlock');
  h.def = { ...h.def, upgrade: UPGRADES.occult[1] };
  const near = enemyAt(w, e.x + 20, e.y), far = enemyAt(w, e.x + 200, e.y);
  e.fx = { hex: { t: 2, src: h }, burn: { t: 3, dps: 7, src: h }, poison: { stacks: [{ t: 2, dps: 1, src: h }, { t: 2, dps: 1, src: h }] } };
  EFFECT_HOOKS.death.hex(w, e, e.fx.hex);
  assert.equal(near.fx.burn.dps, 7); assert.equal(near.fx.poison.stacks.length, 2); assert.ok(!far.fx);
  const other = { ...h, def: { ...h.def, upgrade: UPGRADES.occult[0] } }, n2 = enemyAt(w, e.x + 10, e.y);
  EFFECT_HOOKS.death.hex(w, e, { t: 1, src: other }); assert.ok(!n2.fx, 'only with the passive');
});

test('Revelation: a buffed hero deals 20% more to an enemy with any debuff', () => {
  const h = { def: {}, buffs: [{ id: REVELATION, t: 2, more: 0.2 }] };
  assert.equal(passiveMult(h, { fx: { chill: { t: 1 } } }), 1.2);
  assert.equal(passiveMult(h, { fx: {} }), 1);
});

test('Soul drain counts Poison stacks too', () => {
  const st = n => Array.from({ length: n }, () => ({ t: 2, dps: 0 }));
  assert.ok(Math.abs(drainMult({ fx: { corruption: { stacks: st(3) }, poison: { stacks: st(2) } } }) - (1 + 5 * DRAIN.perStack)) < 1e-12);
});
