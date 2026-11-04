/* The Warrior's evolution: at level 10 it becomes a Berserker, Commander or Sentinel, each with its own ultimate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS, DOUBLE_SWING_GAP } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { updateEnemies } from '../js/engine/enemies.js';
import { levelMods } from '../js/engine/levels.js';
import { FRENZY, RALLY } from '../js/engine/ultimates.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, tilesNearPath, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['berserker', 'commander', 'sentinel'];
function warrior(seed = 31) {
  const w = richWorld({ seed });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, 'warrior', ...tile);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);   /* test only: skip the XP */
  return { w, h };
}
const evolveTo = (w, h, form) => apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) });
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };

test('the Warrior offers Berserker, Commander and Sentinel', () => {
  assert.deepEqual(HEROES.find(x => x.id === 'warrior').evolutions[0].choices.map(c => c.id), FORMS);
});

test('Berserker: two swings in quick succession, each hit bleeds; the pair counts as one attack for energy', () => {
  const { w, h } = warrior(); evolveTo(w, h, 'berserker');
  const e = enemyAt(w, h.x + 30, h.y, 10, 1e6);
  const hit = h.s.damage;
  h.cd = 0; tick(w, h);
  assert.ok(Math.abs(dealt(e) - hit) < 1e-6, 'first swing'); assert.ok(e.fx.bleed, 'bleeding');
  assert.equal(h.energy, 20);
  tick(w, h, Math.round(DOUBLE_SWING_GAP * 60) + 1);
  assert.ok(dealt(e) >= 2 * hit - 1e-6, 'second swing 0.15 s later');
  assert.equal(h.energy, 20, 'no extra energy for the second swing');
});

test('Berserker ultimate (Frenzy): +50% damage and attack speed for 5 s, then back to normal', () => {
  const { w, h } = warrior(); evolveTo(w, h, 'berserker');
  enemyAt(w, h.x + 30, h.y, 10, 1e6);
  const dmg = h.s.damage, spd = h.s.speed;
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  assert.equal(h.buffs[0].id, 'frenzy');
  assert.ok(Math.abs(h.s.damage - dmg * 1.5) < 1e-9 && Math.abs(h.s.speed - spd * 1.5) < 1e-9);
  w.phase = 'wave'; w.spawnLeft = 1; w.spawnT = 1e9;
  for (let i = 0; i < FRENZY.seconds * 60 + 2; i++) step(w);
  assert.equal(h.buffs.length, 0); assert.ok(Math.abs(h.s.damage - dmg) < 1e-9, 'buff gone');
});

test('Commander: launches the sword in a straight line to its range, hitting everything in the way once', () => {
  const { w, h } = warrior(); evolveTo(w, h, 'commander');
  assert.equal(h.s.range, 110 * 1.5, 'the thrown sword reaches further than a swing');
  const lead = enemyAt(w, h.x + 50, h.y, 50), behind = enemyAt(w, h.x + 120, h.y, 1), past = enemyAt(w, h.x + 300, h.y, 0), off = enemyAt(w, h.x + 50, h.y + 80, 2);
  h.cd = 0; tick(w, h);
  assert.equal(w.projs[0].type, 'sword');
  for (let i = 0; i < 60; i++) updateProjectiles(w, 1 / 60);   /* only this sword flies: no second throw */
  assert.ok(Math.abs(dealt(lead) - h.s.damage) < 1e-9); assert.ok(Math.abs(dealt(behind) - h.s.damage) < 1e-9, 'pierces');
  assert.equal(dealt(past), 0, 'stops at its range'); assert.equal(dealt(off), 0, 'only what is in its way');
});

test('Commander ultimate (Rally): doubles energy per attack for heroes nearby, himself included, for 5 s', () => {
  const { w, h } = warrior(); evolveTo(w, h, 'commander');
  const tiles = tilesNearPath(w, 30);
  const near = tiles.find(c => Math.hypot((c[0] + 0.5) * T - h.x, (c[1] + 0.5) * T - h.y) < RALLY.radius - 10 && !(c[0] === h.cx && c[1] === h.cy));
  const far = tiles.find(c => Math.hypot((c[0] + 0.5) * T - h.x, (c[1] + 0.5) * T - h.y) > RALLY.radius + 10);
  const a = place(w, 'ranger', ...near), b = place(w, 'mage', ...far);
  enemyAt(w, h.x + 30, h.y, 10, 1e6);
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  assert.equal(h.s.energyPerAttack, 40); assert.equal(a.s.energyPerAttack, 40); assert.equal(b.s.energyPerAttack, 20, 'too far away');
});

test('Sentinel ultimate (Barricade): blocks the path just ahead of its target for 1 s; enemies pile up in front, then move on', () => {
  const { w, h } = warrior(); evolveTo(w, h, 'sentinel');
  const target = enemyAt(w, h.x + 30, h.y, 200, 1e6);
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  const z = w.zones.find(x => x.type === 'barrier');
  assert.ok(z, 'barricade placed');
  assert.equal(z.d, 204, 'just in front of the attacked enemy');
  w.enemies.length = 0;
  const walker = enemyAt(w, 0, 0, z.d - 30, 1e6); walker.speed = 120;
  const ahead = enemyAt(w, 0, 0, z.d + 5, 1e6); ahead.speed = 120;
  for (let i = 0; i < 30; i++) { updateEnemies(w, 1 / 60); updateZones(w, 1 / 60); }
  assert.equal(walker.d, z.d, 'stopped at the barricade'); assert.ok(ahead.d > z.d + 50, 'an enemy already past it keeps going');
  for (let i = 0; i < 60; i++) { updateEnemies(w, 1 / 60); updateZones(w, 1 / 60); }
  assert.ok(walker.d > z.d, 'moving again after 1 s');
});

test('a match where the Warrior evolves (each form) replays exactly', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 6 }), t = tilesNearPath(w, 6);
    const war = place(w, 'warrior', ...t[1]); place(w, 'ranger', ...t[3]); place(w, 'mage', ...t[5]);
    apply(w, { type: 'auto', on: true });
    while ((war.level < 10 || w.gold < 150) && w.phase !== 'over') step(w);
    assert.ok(evolveTo(w, war, form).ok, form);
    for (let i = 0; i < 5000 && step(w); i++);
    assert.ok(war.ults > 0, form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
