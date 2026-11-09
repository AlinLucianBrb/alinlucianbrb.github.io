/* The Paladin and his forms: holy conversion and Consecration; Heretic (blood price, Heresy); Inquisitor (Verdict, Purge);
   Crusader (the mounted charge with knockback, Cavalry). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { levelMods } from '../js/engine/levels.js';
import { ULTIMATES } from '../js/engine/ultimates.js';
import { damageTaken } from '../js/engine/effects.js';
import { mitigate } from '../js/engine/combat.js';
import { pathPos, KNOCKBACK } from '../js/engine/enemies.js';
import { CONSECRATION, HERESY, PURGE, CHARGE, CAVALRY, nearestPathD } from '../js/engine/kits/paladin.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['heretic', 'inquisitor', 'crusader'];
/* A Paladin at level 10 next to the path. */
function setup(lineup = ['paladin', 'warrior'], seed = 5) {
  const w = richWorld({ seed, lineup });
  let h;
  for (const [x, y] of w.path.slice(5)) { for (const dy of [1, -1]) { if (!h && x >= 0 && x < 16 && y + dy >= 0 && y + dy < 10 && apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y + dy }).ok) h = w.heroes.at(-1); } if (h) break; }
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  return { w, h };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const full = h => { h.energy = h.s.energyMax; };
/* An enemy standing on the path, the given distance (px) from the hero along the path's nearest point. */
function onPath(w, h, along = 0, hp = 1e6, type = 'grunt') {
  const { d } = nearestPathD(w, h.x, h.y), p = { x: 0, y: 0 }, at = Math.max(1, d + along);
  pathPos(w.path, at / T, p);
  return enemyAt(w, p.x, p.y, at, hp, type);
}

test('the Paladin: melee, strength, 30% of his damage holy; Consecration; three forms', () => {
  const d = HEROES.find(h => h.id === 'paladin');
  assert.equal(d.archetype, 'melee'); assert.equal(d.attribute, 'strength'); assert.deepEqual(d.convert, { holy: 0.3 });
  assert.deepEqual(d.evolutions[0].choices.map(c => c.id), FORMS);
  for (const c of [d, ...d.evolutions[0].choices]) assert.ok(ULTIMATES[c.ultimate], c.ultimate);
  const { w, h } = setup();
  const types = {}; w.ev.on('damage', ({ type, amount }) => { types[type] = (types[type] || 0) + amount; });
  onPath(w, h); tick(w, h, 2);
  assert.ok(types.holy > 0 && Math.abs(types.holy / (types.holy + types.physical) - 0.3) < 0.02, JSON.stringify(types));
  full(h); h.cd = 0; tick(w, h, 1);
  const z = w.zones.find(q => q.type === 'pulse' && q.look === 'consecrate');
  assert.ok(z && z.r === CONSECRATION.radius && z.as === 'holy');
});

test('Heretic: burns, grows with lives lost, and Heresy pays a life to empower every hero (never at 5 lives or fewer)', () => {
  const { w, h } = setup(['paladin', 'warrior']);
  evolveTo(w, h, 'heretic');
  const ally = place(w, 'warrior', ...(() => { for (let cx = 1; cx < 15; cx++) for (let cy = 1; cy < 9; cy++) if (!w.pathSet.has(cx + ',' + cy) && !w.heroes.some(o => o.cx === cx && o.cy === cy)) return [cx, cy]; })());
  const e = onPath(w, h); tick(w, h, 2);
  assert.ok(e.fx && e.fx.burn, 'always burns');
  const lives = w.lives;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.equal(w.lives, lives - 1, 'paid a life');
  assert.ok(ally.buffs.some(b => b.id === 'heresy') && h.buffs.some(b => b.id === 'heresy'), 'every hero');
  for (let i = 0; i < 5; i++) { full(h); h.cd = 0; tick(w, h, 1); }
  assert.equal(w.lives, lives - HERESY.maxPaid, 'at most 3 lives a match');
  w.lives = HERESY.minLives; h.heresyPaid = 0; ally.buffs.length = 0; w.statsFor(ally);
  full(h); h.cd = 0; tick(w, h, 1);
  assert.equal(w.lives, HERESY.minLives, 'never below');
  assert.ok(!ally.buffs.some(b => b.id === 'heresy'), 'then only the Heretic');
});

test('Inquisitor: hits the toughest enemy in range, stacking Verdict up to 10; Purge strips defenses and executes', () => {
  const { w, h } = setup(['paladin']);
  evolveTo(w, h, 'inquisitor');
  const weak = onPath(w, h, 0, 100), tough = onPath(w, h, 6, 1e6);
  for (let i = 0; i < 12; i++) { h.cd = 0; tick(w, h, 1); }
  assert.equal(dealt(weak), 0, 'the toughest only');
  assert.equal(tough.fx.verdict.n, 10, 'at most 10 stacks');
  assert.ok(Math.abs(damageTaken(tough) - 1.5) < 1e-9);
  /* Purge */
  w.enemies.length = 0;
  const armored = onPath(w, h, 0, 1e6); armored.armor = 50; armored.res = { fire: 0.2, holy: 0.2 };
  const dying = onPath(w, h, 4, 1000); dying.hp = 100;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(armored.fx.purge, 'purged'); assert.ok(dying.dead, 'executed under 15%');
  assert.equal(mitigate(armored, 'physical', 100), 100, 'no armor');
  assert.ok(Math.abs(mitigate(armored, 'fire', 100) - 110) < 1e-9, '30 resistance off');
  assert.equal(PURGE.seconds, 6);
});

test('Crusader: rides onto the path and down it toward the enemies, hitting and knocking back each one once, then rides back', () => {
  const { w, h } = setup(['paladin']);
  evolveTo(w, h, 'crusader');
  w.wave = 2;
  const near = onPath(w, h, -T), far = onPath(w, h, -2.5 * T), behind = onPath(w, h, 2 * T);
  const d0 = [near.d, far.d, behind.d];
  h.cd = 0; tick(w, h, 1);
  assert.ok(h.ride && h.ride.phase === 'out', 'off he goes');
  for (let i = 0; i < 240 && h.ride; i++) tick(w, h, 1);
  assert.equal(h.ride, null, 'back at his post');
  assert.ok(dealt(near) > 0 && dealt(far) > 0, 'trampled on the way down');
  assert.ok(near.d < d0[0] && far.d < d0[1], 'knocked back');
  assert.ok(d0[0] - near.d <= CHARGE.knock + 1e-9, 'half a tile each');
  assert.equal(dealt(behind), 0, 'enemies already past his stretch are not hit');
  /* Cavalry: the whole path, every enemy once */
  w.enemies.length = 0; w.wave = 3;
  const a = onPath(w, h, -4 * T), b = onPath(w, h, 3 * T);
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(w.projs.some(p => p.type === 'cavalry'));
  for (let i = 0; i < 60 * 8; i++) updateProjectiles(w, 1 / 60);
  assert.ok(dealt(a) > 0 && dealt(b) > 0, 'everyone on the path');
  assert.ok(KNOCKBACK.perWave >= CAVALRY.knock);
});

test('a match with each Paladin form replays exactly, and every form uses its ultimate', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['paladin'] });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
