/* The Paladin and his forms: holy conversion and Consecration; Heretic (blood price, Heresy); Inquisitor (Verdict, Purge);
   Crusader (the spear lunge, Spear throw). */
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
import { CONSECRATION, HERESY, PURGE, LUNGE, SPEAR, wallRoom, shove } from '../js/engine/kits/paladin.js';
const shoveOne = (w, h, e) => shove(w, h, e, null);
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt, nearestPathD } from './helpers.mjs';

const FORMS = ['heretic', 'inquisitor', 'crusader'];
/* A Paladin at level 10 next to the path. */
function setup(lineup = ['paladin', 'warrior'], seed = 5) {
  const w = richWorld({ seed, lineup });
  let h;
  for (const [x, y] of w.path.slice(5)) { for (const dy of [1, -1]) { if (!h && x >= 0 && x < 12 && y + dy >= 0 && y + dy < 8 && apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y + dy }).ok) h = w.heroes.at(-1); } if (h) break; }
  h.level = 15; h.lvlMods = levelMods(15); w.statsFor(h);
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

test('Heretic: burns, grows with lives lost; Heresy empowers every hero, twice as much when it pays a life (never at 5 lives or fewer)', () => {
  const { w, h } = setup(['paladin', 'warrior']);
  evolveTo(w, h, 'heretic');
  const ally = place(w, 'warrior', ...(() => { for (let cx = 1; cx < 11; cx++) for (let cy = 1; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy) && !w.heroes.some(o => o.cx === cx && o.cy === cy)) return [cx, cy]; })());
  const e = onPath(w, h); tick(w, h, 2);
  assert.ok(e.fx && e.fx.burn, 'always burns');
  const lives = w.lives;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.equal(w.lives, lives - 1, 'paid a life');
  const buff = x => x.buffs.find(b => b.id === 'heresy');
  assert.ok(buff(ally) && buff(h), 'every hero'); assert.equal(buff(ally).mods[0].value, 1, '+100% when paid');
  full(h); h.cd = 0; tick(w, h, 1);
  assert.equal(w.lives, lives - 1, 'not cast again while its buff lasts'); assert.equal(h.energy, h.s.energyMax);
  const expire = () => { for (const o of [h, ally]) { o.buffs.length = 0; w.statsFor(o); } };
  for (let i = 0; i < 5; i++) { expire(); full(h); h.cd = 0; tick(w, h, 1); }
  assert.equal(w.lives, lives - HERESY.maxPaid, 'at most 3 lives a match');
  w.lives = HERESY.minLives; h.heresyPaid = 0; expire();
  full(h); h.cd = 0; tick(w, h, 1);
  assert.equal(w.lives, HERESY.minLives, 'never below');
  assert.equal(buff(ally).mods[0].value, 0.5, 'then +50%, for every hero');
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
  const armored = onPath(w, h, 0, 1e6); armored.armor = 0.5; armored.res = { fire: 0.2, holy: 0.2 };
  const dying = onPath(w, h, 4, 1000); dying.hp = 100;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(armored.fx.purge, 'purged'); assert.ok(dying.dead, 'executed under 15%');
  assert.ok(Math.abs(mitigate(armored, 'physical', 100) - 80) < 1e-9, '30 points off the armor');
  assert.ok(Math.abs(mitigate(armored, 'fire', 100) - 110) < 1e-9, '30 resistance off');
  assert.equal(PURGE.seconds, 6);
});

test('Crusader: on foot, lunges his spear through every enemy in a line; the toughest takes 20% more for each other one', () => {
  const { w, h } = setup(['paladin']);
  evolveTo(w, h, 'crusader');
  assert.equal(h.def.kind, 'lunge'); assert.ok(!('mounted' in h.def)); assert.equal(h.def.onPath, true, 'he can still stand on the path');
  h.s = { ...h.s, critChance: 0, spread: 0 };
  assert.equal(h.def.stats.range, T, 'a reach of 1 tile (before range bonuses)');
  const a = enemyAt(w, h.x + 20, h.y, 50), b = enemyAt(w, h.x + 45, h.y, 40, 2e6), c = enemyAt(w, h.x + 70, h.y, 30), out = enemyAt(w, h.x + h.s.range + 30, h.y, 20), off = enemyAt(w, h.x + 40, h.y + 50, 10);
  h.cd = 0; tick(w, h, 1);
  assert.ok(dealt(a) > 0 && dealt(c) > 0, 'every enemy on the line'); assert.equal(dealt(off), 0, 'not beside it'); assert.equal(dealt(out), 0, 'not past his range');
  assert.ok(Math.abs(dealt(c) - dealt(a)) < 1e-6);
  assert.ok(Math.abs(dealt(b) / dealt(a) - (1 + LUNGE.per * 2)) < 1e-6, 'the toughest (most life): +20% for each of the other two');
  assert.equal(h.ride, undefined, 'no riding out');
});

/* Two grunts on the path: one just past a corner (half a tile from the wall), one on a straight stretch with room. */
function corner(w) {
  for (let i = 1; i < w.path.length - 1; i++) {
    const [p, q, r] = [w.path[i - 1], w.path[i], w.path[i + 1]];
    if (q[0] - p[0] !== r[0] - q[0] || q[1] - p[1] !== r[1] - q[1]) return i;
  }
}
const atD = (w, d, hp = 1e6) => { const p = { x: 0, y: 0 }; pathPos(w.path, d / T, p); return enemyAt(w, p.x, p.y, d, hp); };
test('Crusader ultimate (Spear throw): pushes enemies back; one that slams into a corner is stunned for the push it missed and takes less', () => {
  const { w, h } = setup(['paladin']);
  evolveTo(w, h, 'crusader'); w.wave = 2;
  assert.equal(h.def.ultimate, 'spear');
  h.s = { ...h.s, critChance: 0, spread: 0, duration: 1 };
  const i = corner(w), A = atD(w, (i + 0.5) * T);
  let dB = 0; for (let d = T; d < (w.path.length - 2) * T; d += T / 4) { const e = { d }; if (wallRoom(w, e) > SPEAR.push + T) { dB = d; break; } }
  const B = atD(w, dB);
  assert.ok(Math.abs(wallRoom(w, A) - T / 2) < 1e-6, 'half a tile from the corner');
  const dA = A.d, dB0 = B.d;
  for (const e of [A, B]) shoveOne(w, h, e);
  assert.ok(Math.abs(dA - A.d - T / 2) < 1e-6, 'A stops at the wall'); assert.ok(Math.abs(dB0 - B.d - SPEAR.push) < 1e-6, 'B goes the whole way');
  const f = (T / 2) / SPEAR.push;
  assert.ok(A.fx && A.fx.stun && Math.abs(A.fx.stun.t - SPEAR.stun * (1 - f)) < 1e-6, 'stunned for the part of the push it missed');
  assert.ok(!(B.fx && B.fx.stun), 'no wall, no stun');
  assert.ok(Math.abs(dealt(B) / dealt(A) - 1 / f) < 1e-6, 'B takes the full damage, A only the part it travelled');
  /* the ultimate: a spear flies to the toughest enemy in range, then every enemy in range is pushed */
  w.enemies.length = 0; w.wave = 3;
  const e = onPath(w, h, 0), d0 = e.d;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(w.projs.some(p => p.type === 'spear'), 'the spear flies');
  for (let k = 0; k < 60 && w.projs.some(p => p.type === 'spear'); k++) tick(w, h, 1);
  assert.ok(e.d < d0 && dealt(e) > 0, 'pushed back and hurt');
  /* it reaches 4 tiles, four times his range */
  w.enemies.length = 0; w.projs.length = 0; w.wave = 4;
  const far = enemyAt(w, h.x + 3.5 * T, h.y, 30), farther = enemyAt(w, h.x + 4.5 * T, h.y, 20);
  full(h); w.attackMult(h, far); for (let k = 0; k < 90; k++) updateProjectiles(w, 1 / 60);
  assert.ok(dealt(far) > 0 && dealt(farther) === 0, 'within 4 tiles, not beyond');
});

test('a match with each Paladin form replays exactly, and every form uses its ultimate', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['paladin'] });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'paladin', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 15 || w.gold < 500)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
