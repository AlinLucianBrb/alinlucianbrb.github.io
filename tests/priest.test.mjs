/* The Priest and her forms: Incantation (the aura), Archangel (lance, path, Judgement), Gospel (Psalm, Sanctuary, Conversion). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { updateEnemies } from '../js/engine/enemies.js';
import { levelMods } from '../js/engine/levels.js';
import { ULTIMATES } from '../js/engine/ultimates.js';
import { AURA } from '../js/engine/aura.js';
import { BLESSING, CRESCENDO, JUDGEMENT, PSALM, CONVERSION } from '../js/engine/kits/priest.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['incantation', 'archangel', 'gospel'];
function setup(lineup = ['priest', 'warrior'], seed = 5) {
  const w = richWorld({ seed, lineup });
  const free = []; for (let cx = 3; cx < 11; cx++) for (let cy = 1; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) free.push([cx, cy]);
  const h = place(w, 'priest', ...free[0]);
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  return { w, h, free };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const full = h => { h.energy = h.s.energyMax; };

test('the Priest: a holy spell caster with intellect; Smite and Blessing; three forms', () => {
  const p = HEROES.find(h => h.id === 'priest');
  assert.equal(p.archetype, 'spell'); assert.equal(p.attribute, 'intellect'); assert.equal(p.damageType, 'holy'); assert.equal(p.ultimate, 'blessing');
  assert.deepEqual(p.evolutions[0].choices.map(c => c.id), FORMS);
  assert.deepEqual(p.evolutions[0].choices.map(c => c.kind), ['aura', 'lance', 'psalm']);
  for (const c of p.evolutions[0].choices) assert.ok(ULTIMATES[c.ultimate], c.ultimate);
});

test('Blessing: heroes in her range (and herself) deal +30% damage for 5 seconds; heroes further away do not', () => {
  const { w, h, free } = setup(['priest', 'warrior', 'ranger']);
  const near = place(w, 'warrior', ...free.find(([x, y]) => Math.hypot((x + 0.5) * T - h.x, (y + 0.5) * T - h.y) < h.s.range && (x + 0.5) * T !== h.x));
  const far = place(w, 'ranger', ...free.find(([x, y]) => Math.hypot((x + 0.5) * T - h.x, (y + 0.5) * T - h.y) > h.s.range + 40));
  const before = near.s.damage;
  enemyAt(w, h.x + 30, h.y, 10); full(h); tick(w, h);
  assert.ok(near.buffs.some(b => b.id === 'blessing') && h.buffs.some(b => b.id === 'blessing'));
  assert.ok(!far.buffs || !far.buffs.length);
  assert.ok(Math.abs(near.s.damage / before - 1.3) < 1e-9);
  assert.equal(BLESSING.seconds, 5);
});

test('Incantation: no attack; the aura pulses on every enemy inside at once, blesses heroes inside, and gains energy only with enemies', () => {
  const { w, h, free } = setup(['priest', 'warrior']);
  evolveTo(w, h, 'incantation');
  const ally = place(w, 'warrior', ...free.find(([x, y]) => Math.hypot((x + 0.5) * T - h.x, (y + 0.5) * T - h.y) < h.s.range && (x + 0.5) * T !== h.x));
  tick(w, h, 40);
  assert.equal(h.energy, 0, 'no enemies: no energy');
  assert.ok(ally.buffs.some(b => b.id === 'hymn'), 'the blessing works without enemies too');
  const a = enemyAt(w, h.x + 20, h.y, 10), b = enemyAt(w, h.x, h.y + h.s.range - 5, 20), out = enemyAt(w, h.x + h.s.range + 30, h.y, 30);
  tick(w, h, 60);
  assert.ok(dealt(a) > 0 && dealt(b) > 0, 'everything inside'); assert.equal(dealt(out), 0, 'nothing outside');
  assert.ok(h.energy > 0); assert.equal(w.projs.length, 0, 'no projectiles: it never attacks');
  /* flat added damage counts at half per pulse */
  h.mods.push({ stat: 'fireDamage', type: 'flat', value: 10, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);
  BEHAVIORS.aura.update(w, h, 10);
  assert.equal(h._aura.fireDamage, h.s.fireDamage * AURA.added);
});

test('Crescendo: for 5 seconds the aura is twice as wide and deals triple damage', () => {
  const { w, h } = setup(['priest']);
  evolveTo(w, h, 'incantation');
  const r = h.s.range, far = enemyAt(w, h.x + r * 1.6, h.y, 10), near = enemyAt(w, h.x + 10, h.y, 20);
  tick(w, h, 1); const one = dealt(near);
  assert.equal(dealt(far), 0);
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(h.auraBoost && h.auraBoost.t > CRESCENDO.seconds - 0.1);
  assert.ok(dealt(far) > 0, 'reaches twice as far');
  assert.ok(Math.abs((dealt(near) - one) / one - CRESCENDO.damage) < 0.01, 'triple damage');
});

test('Archangel: a lance pierces every enemy in a line; she can be moved onto the path, other heroes cannot; Judgement executes', () => {
  const { w, h, free } = setup(['priest', 'warrior']);
  evolveTo(w, h, 'archangel');
  const a = enemyAt(w, h.x + 40, h.y, 10), b = enemyAt(w, h.x + 80, h.y, 5);
  tick(w, h, 30);
  assert.ok(dealt(a) > 0 && dealt(b) > 0, 'both enemies in the line');
  const path = w.path.find(([x, y]) => x >= 0 && y >= 0 && x < 12 && y < 8 && !w.heroes.some(o => o.cx === x && o.cy === y));
  assert.ok(apply(w, { type: 'move', id: h.id, cx: path[0], cy: path[1] }).ok, 'onto the path');
  const war = place(w, 'warrior', ...free[5]);
  const path2 = w.path.find(([x, y]) => x >= 0 && y >= 0 && x < 12 && y < 8 && !(x === path[0] && y === path[1]));
  assert.equal(apply(w, { type: 'move', id: war.id, cx: path2[0], cy: path2[1] }).reason, 'blocked');
  /* Judgement */
  w.enemies.length = 0; w.projs.length = 0;
  const tough = enemyAt(w, h.x + 30, h.y, 10, 1000); tough.hp = 300;
  const boss = enemyAt(w, h.x + 30, h.y + 10, 5, 1e6, 'boss');
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(boss.hp < boss.max, 'the toughest (most life) is the boss: hit, never executed'); assert.ok(!boss.dead);
  w.enemies.length = 0;
  const e = enemyAt(w, h.x + 30, h.y, 10, 1000); e.hp = 100 + JUDGEMENT.scale * h.s.damage * 0.5;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(e.dead, 'left under 25% after the blade: executed');
});

test('Gospel: each Psalm gives 3 energy to the heroes around her; Sanctuary turns back one leak a wave; Conversion', () => {
  const { w, h, free } = setup(['priest', 'warrior']);
  evolveTo(w, h, 'gospel');
  const ally = place(w, 'warrior', ...free.find(([x, y]) => Math.hypot((x + 0.5) * T - h.x, (y + 0.5) * T - h.y) < PSALM.radius && (x + 0.5) * T !== h.x));
  enemyAt(w, h.x + 30, h.y, 10); h.cd = 0; tick(w, h, 1);
  assert.equal(ally.energy, PSALM.energy);
  /* Sanctuary */
  w.enemies.length = 0; w.wave = 2;
  const end = (w.path.length - 1) * T, leak = enemyAt(w, 0, 0, end - 1), leak2 = enemyAt(w, 0, 0, end - 1);
  leak.speed = leak2.speed = 100;
  const lives = w.lives;
  updateEnemies(w, 0.1);
  assert.equal(leak.d < T, true, 'the first is turned back to the entrance'); assert.ok(!leak.dead);
  assert.ok(leak2.dead && leak2.escaped, 'only one a wave'); assert.equal(w.lives, lives - 1);
  /* Conversion: the toughest non-boss in range leaves the fight; its spirit walks back hitting enemies */
  w.enemies.length = 0;
  const strong = enemyAt(w, h.x + 30, h.y, 6 * T, 500), weak = enemyAt(w, h.x + 40, h.y, 5 * T, 100);
  const boss = enemyAt(w, h.x + 20, h.y, 6 * T, 1e6, 'boss');
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(strong.dead, 'converted'); assert.ok(!boss.dead);
  const spirit = w.projs.find(p => p.type === 'spirit');
  assert.ok(spirit && spirit.d <= 6 * T && spirit.d > 6 * T - 2, 'starts where the enemy was');
  for (let i = 0; i < 60; i++) updateProjectiles(w, 1 / 60);
  assert.ok(spirit.d < 6 * T, 'walks back toward the entrance');
  assert.equal(CONVERSION.seconds, 6);
});

test('a match with each Priest form replays exactly, and every form uses its ultimate (no test shortcuts: the log must reproduce it)', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['priest'] });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'priest', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'priest', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
