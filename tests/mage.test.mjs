/* The Mage's evolution: at level 10 it becomes a Fire, Cold or Lightning Mage, each with its own on-hit effect and ultimate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { levelMods } from '../js/engine/levels.js';
import { HEROES } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, tilesNearPath, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['firemage', 'coldmage', 'lightningmage'];
/* A level-10 Mage ready to evolve, on a free tile in the middle of the map. */
function mage(seed = 31) {
  const w = richWorld({ seed });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, 'mage', ...tile);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);   /* test only: skip the XP */
  return { w, h };
}
const evolveTo = (w, h, form) => apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) });
/* Fires one bolt and lets it land. */
function shoot(w, h) { h.cd = 0; BEHAVIORS[h.def.kind].update(w, h, 1 / 60); for (let i = 0; i < 40 && w.projs.length; i++) updateProjectiles(w, 1 / 60); }

test('the Mage offers three evolutions; a choice is required and is recorded', () => {
  const choices = HEROES.find(x => x.id === 'mage').evolutions[0].choices;
  assert.deepEqual(choices.map(c => c.id), FORMS);
  const { w, h } = mage();
  assert.equal(apply(w, { type: 'evolve', id: h.id }).reason, 'choose an evolution');
  assert.equal(apply(w, { type: 'evolve', id: h.id, choice: 7 }).reason, 'choose an evolution');
  assert.ok(evolveTo(w, h, 'coldmage').ok);
  assert.equal(h.def.name, 'Cold Mage'); assert.equal(h.def.form, 'coldmage'); assert.equal(h.def.id, 'mage', 'still the Mage for talents and the lineup');
  assert.deepEqual(h.path, ['coldmage']);
  assert.deepEqual(w.log.commands.at(-1), { type: 'evolve', id: h.id, choice: 1, t: 0 });
  assert.equal(apply(w, { type: 'evolve', id: h.id, choice: 0 }).reason, 'fully evolved');
});

test('every hero now offers three evolutions, so a choice is always needed', () => {
  for (const h of HEROES) assert.equal(h.evolutions[0].choices.length, 3, h.id);
  const w = richWorld(), war = place(w, 'warrior', ...tilesNearPath(w, 1)[0]); war.level = 10;
  assert.equal(apply(w, { type: 'evolve', id: war.id }).reason, 'choose an evolution');
});

test('each element changes the damage type, keeps +50% stats, and adds its on-hit effect', () => {
  for (const [form, type] of [['firemage', 'fire'], ['coldmage', 'cold'], ['lightningmage', 'lightning']]) {
    const { w, h } = mage(), dmg = h.s.damage;
    evolveTo(w, h, form);
    assert.equal(h.def.damageType, type, form);
    assert.ok(Math.abs(h.s.damage - dmg * 1.5) < 1e-9, form + ' +50% damage');
    const e = enemyAt(w, h.x + 60, h.y, 10);
    const types = []; w.ev.on('damage', d => types.push(d.type));
    shoot(w, h);
    assert.equal(types[0], type, form + ' hits with ' + type);
    if (form === 'firemage') assert.ok(e.fx.burn && Math.abs(e.fx.burn.dps - 0.9 * h.s.damage) < 1e-9, 'Fire Mage: every hit burns');
    if (form === 'coldmage') assert.ok(e.fx.chill && Math.abs(e.fx.chill.t - 1.5) < 1e-9, 'Cold Mage: every hit slows (the old chill)');
    if (form === 'lightningmage') assert.ok(e.fx.shock, 'Lightning Mage: every hit shocks');
  }
});

test('Fire Mage ultimate (Inferno): sets every enemy on the map on fire', () => {
  const { w, h } = mage(); evolveTo(w, h, 'firemage');
  const near = enemyAt(w, h.x + 60, h.y, 50), far = enemyAt(w, h.x + 2000, h.y + 2000, 1);
  h.energy = h.s.energyMax; shoot(w, h);
  assert.equal(h.ults, 1); assert.ok(far.fx && far.fx.burn, 'even out of range'); assert.ok(near.fx.burn);
  assert.equal(dealt(far), 0, 'the burn hurts over time, not at once');
});

test('Cold Mage ultimate (Blizzard): freezes every enemy on the map for 1 s', () => {
  const { w, h } = mage(); evolveTo(w, h, 'coldmage');
  const es = [enemyAt(w, h.x + 60, h.y, 50), enemyAt(w, h.x + 2000, h.y, 1)];
  h.energy = h.s.energyMax; shoot(w, h);
  assert.ok(es.every(e => e.fx.freeze && Math.abs(e.fx.freeze.t - 1) < 1e-9));
});

test('Lightning Mage ultimate (Storm): strikes and shocks everything around the Mage for 3 s', () => {
  const { w, h } = mage(); evolveTo(w, h, 'lightningmage');
  const inside = enemyAt(w, h.x + 100, h.y, 50), outside = enemyAt(w, h.x + 1000, h.y, 1);
  const lead = enemyAt(w, h.x + 60, h.y, 60);
  h.energy = h.s.energyMax; shoot(w, h);
  assert.equal(w.zones.length, 1); assert.equal(w.zones[0].type, 'storm');
  const before = dealt(inside);
  for (let i = 0; i < 200; i++) updateZones(w, 1 / 60);
  assert.equal(w.zones.length, 0, 'over after 3 s');
  assert.ok(dealt(inside) - before > h.s.damage * 2.5, '6 strikes of half a hit, some boosted by shock');
  assert.ok(inside.fx.shock); assert.equal(dealt(outside), 0);
  assert.ok(dealt(lead) > 0);
});

test('a match where the Mage evolves replays exactly', () => {
  const w = createWorld({ seed: 2 }), t = tilesNearPath(w, 6);
  place(w, 'warrior', ...t[1]); place(w, 'ranger', ...t[3]); const m = place(w, 'mage', ...t[5]);
  apply(w, { type: 'auto', on: true });
  while ((m.level < 10 || w.gold < 150) && w.phase !== 'over') step(w);
  assert.ok(evolveTo(w, m, 'lightningmage').ok);
  for (let i = 0; i < 4000 && step(w); i++);
  assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w));
  assert.equal(replay(exportLog(w)).heroes.find(x => x.type === m.type).def.form, 'lightningmage');
});
