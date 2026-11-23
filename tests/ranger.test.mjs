/* The Ranger's evolution: at level 10 it becomes a Marksman, Boomerang Ranger or Hunter, each with its own ultimate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { levelMods } from '../js/engine/levels.js';
import { TRAP } from '../js/engine/ultimates.js';
import { LINE, RING } from '../js/engine/kits/hunter.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, tilesNearPath, place, enemyAt, dealt, gentleLevel1 } from './helpers.mjs';

const FORMS = ['marksman', 'boomeranger', 'hunter'];
function ranger(seed = 31) {
  const w = richWorld({ seed });
  let tile; for (let cx = 4; !tile && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) { tile = [cx, cy]; break; }
  const h = place(w, 'ranger', ...tile);
  h.level = 15; h.lvlMods = levelMods(15); w.statsFor(h);   /* test only: skip the XP */
  return { w, h };
}
const evolveTo = (w, h, form) => apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) });
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const flush = (w, n = 120) => { for (let i = 0; i < n; i++) { updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };

test('the Ranger offers three evolutions and needs a choice', () => {
  assert.deepEqual(HEROES.find(x => x.id === 'ranger').evolutions[0].choices.map(c => c.id), FORMS);
  const { w, h } = ranger();
  assert.equal(apply(w, { type: 'evolve', id: h.id }).reason, 'choose an evolution');
  assert.ok(evolveTo(w, h, 'hunter').ok);
  assert.equal(h.def.name, 'Poacher'); assert.equal(h.def.id, 'ranger');
});

test('the Hunter: his ultimate replaces the arrow with a charged shot that pierces everything in a line for 3x', () => {
  const { w, h } = ranger();
  assert.equal(h.def.kind, 'bolt'); assert.equal(h.def.ultimate, 'piercing');
  h.s = { ...h.s, critChance: 0, spread: 0 };
  const lead = enemyAt(w, h.x + 60, h.y, 50), behind = enemyAt(w, h.x + 300, h.y, 1), off = enemyAt(w, h.x + 60, h.y + 120, 2);
  h.energy = h.s.energyMax; h.cd = 0;
  tick(w, h);
  assert.equal(w.projs.length, 1); assert.equal(w.projs[0].type, 'pierce', 'no normal arrow: the shot replaces it');
  assert.equal(h.energy, 0);
  tick(w, h, 10);
  assert.equal(dealt(lead), 0, 'still charging');
  h.cd = 1e9; flush(w);
  assert.ok(Math.abs(dealt(lead) - 3 * h.s.damage) < 1e-6, 'the target');
  assert.ok(Math.abs(dealt(behind) - 3 * h.s.damage) < 1e-6, 'and the enemy behind it, out of range');
  assert.equal(dealt(off), 0, 'not enemies off the line');
});

test('Ranger: arrows fly straight through every enemy in their way, once each, to a little past his range', () => {
  const { w, h } = ranger(); evolveTo(w, h, 'marksman');
  assert.equal(h.def.kind, 'line'); assert.equal(h.def.ultimate, 'ricochet');
  h.s = { ...h.s, critChance: 0, spread: 0 };
  const a = enemyAt(w, h.x + 40, h.y, 50), b = enemyAt(w, h.x + 90, h.y, 40), past = enemyAt(w, h.x + h.s.range + 40, h.y, 1), far = enemyAt(w, h.x + h.s.range + LINE.past + 60, h.y, 0), off = enemyAt(w, h.x + 60, h.y + 60, 2);
  h.cd = 0; tick(w, h); h.cd = 1e9; flush(w);
  assert.ok(dealt(a) > 0 && Math.abs(dealt(b) - dealt(a)) < 1e-6 && Math.abs(dealt(past) - dealt(a)) < 1e-6, 'each one once');
  assert.equal(dealt(far), 0, 'not beyond'); assert.equal(dealt(off), 0, 'not beside the line');
  assert.equal(w.projs.length, 0);
});

test('Ranger ultimate (Ricochet ring): a ring on the toughest enemy; his arrows fly into it and bounce inside, faster each time, until it ends', () => {
  const { w, h } = ranger(); evolveTo(w, h, 'marksman');
  h.s = { ...h.s, critChance: 0, spread: 0 };
  const lead = enemyAt(w, h.x + 50, h.y, 50), big = enemyAt(w, h.x, h.y + 80, 10, 1e6, 'brute');
  h.energy = h.s.energyMax; h.cd = 0;
  let hits = 0, shots = 0; const hit = w.attack; w.attack = (o, e, ...x) => { if (e === big) hits++; return hit(o, e, ...x); };
  tick(w, h);
  const z = w.zones.find(x => x.type === 'ricochet');
  assert.ok(z && z.x === big.x && z.y === big.y, 'on the toughest enemy in range, not the leading one');
  assert.ok(Math.abs(z.life - RING.seconds * (h.s.duration || 1)) < 1e-6, 'its length, with the duration stat');
  let fastest = 0; const spots = new Set(), first = { dx: null };
  for (let k = 0; k < 60 * RING.seconds; k++) {
    const before = w.projs.length; tick(w, h);
    if (w.projs.length > before) shots++;
    for (const p of w.projs) if (p.type === 'line' && p.ring) { if (p === w.projs.find(q => q.ring)) { const was = first.dx; first.dx = p.dx; if (Math.abs(was - p.dx) > 1e-9) spots.add(Math.round(Math.atan2(p.y - z.y, p.x - z.x) * 4)); } fastest = Math.max(fastest, p.speed); assert.ok((p.x - z.x) ** 2 + (p.y - z.y) ** 2 <= z.r * z.r + 1e-6, 'it never leaves the ring'); }
  }
  assert.ok(fastest > LINE.speed, 'faster after a bounce');
  assert.ok(spots.size >= 3, 'it bounces off the edge at different places, not back and forth on one line: ' + spots.size);
  assert.ok(hits > shots + 1, 'the enemy inside is hit again and again: ' + hits + ' hits from ' + (shots + 1) + ' arrows');
  h.cd = 1e9; tick(w, h, 30);
  assert.equal(w.zones.filter(x => x.type === 'ricochet').length, 0, 'the ring ends');
  assert.equal(w.projs.filter(p => p.ring).length, 0, 'and its arrows with it');
});

test('Boomerang Ranger: throws the boomerang; the ultimate spins one around it, and several are spaced evenly', () => {
  const { w, h } = ranger(); evolveTo(w, h, 'boomeranger');
  assert.equal(h.def.kind, 'boom');
  const e = enemyAt(w, h.x + 80, h.y, 10);
  h.cd = 0; tick(w, h);
  assert.equal(w.projs[0].type, 'boomerang');
  w.projs.length = 0; h.proj = null;
  for (let k = 0; k < 3; k++) { h.energy = h.s.energyMax; h.cd = 0; tick(w, h); w.projs = w.projs.filter(p => p.type === 'orbit'); h.proj = null; }
  const orbs = w.projs.filter(p => p.type === 'orbit');
  assert.equal(orbs.length, 3);
  flush(w, 5);
  const angles = orbs.map(p => Math.atan2(p.y - h.y, p.x - h.x)).map(a => (a + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  const gaps = [angles[1] - angles[0], angles[2] - angles[1], 2 * Math.PI - angles[2] + angles[0]];
  assert.ok(gaps.every(g => Math.abs(g - 2 * Math.PI / 3) < 1e-6), 'a third of a turn apart: ' + gaps.map(g => g.toFixed(3)).join(', '));
  const ring = enemyAt(w, h.x + Math.min(90, h.s.range * 0.45), h.y, 5);
  flush(w, 120);
  assert.ok(dealt(ring) > 0, 'the spinning boomerangs hit what they touch');
  flush(w, 400);
  assert.equal(w.projs.filter(p => p.type === 'orbit').length, 0, 'gone after 6 s');
});

test('Hunter: toxic arrows; the ultimate lays 3 traps on the path in range, which burst for 4x toxic when stepped on', () => {
  const { w, h } = ranger(); evolveTo(w, h, 'hunter');
  assert.equal(h.def.damageType, 'toxic');
  const e = enemyAt(w, h.x + 60, h.y, 50);
  const types = []; w.ev.on('damage', d => types.push(d.type));
  h.cd = 0; tick(w, h); flush(w);
  assert.equal(types[0], 'toxic');
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h);
  const traps = w.zones.filter(z => z.type === 'trap');
  assert.equal(traps.length, 3);
  for (const z of traps) {
    assert.ok(w.path.some(([cx, cy]) => (cx + 0.5) * T === z.x && (cy + 0.5) * T === z.y), 'on a path tile');
    assert.ok((z.x - h.x) ** 2 + (z.y - h.y) ** 2 <= h.s.range ** 2, 'within range');
  }
  assert.equal(new Set(traps.map(z => z.cell)).size, 3, 'on different tiles');
  const z = traps[0], victim = enemyAt(w, z.x, z.y, 1, 1e6), close = enemyAt(w, z.x + 25, z.y, 1, 1e6), far = enemyAt(w, z.x + 80, z.y, 1, 1e6);
  updateZones(w, 1 / 60);
  assert.ok(Math.abs(dealt(victim) - TRAP.scale * h.s.damage) < 1e-6); assert.ok(dealt(close) > 0); assert.equal(dealt(far), 0);
  assert.equal(w.zones.filter(x => x.type === 'trap').length, 2, 'a trap bursts once');
  for (let k = 0; k < 5; k++) { h.energy = h.s.energyMax; h.cd = 0; tick(w, h); }
  assert.ok(w.zones.filter(x => x.type === 'trap').length <= TRAP.max, 'at most 6 traps at once');
});

test('a match where the Ranger evolves (each form) replays exactly', tc => {
  gentleLevel1(tc, { hpMult: 0.5, waves: 25 });   /* long enough to reach level 15 and to play on as the form */
  for (const form of FORMS) {
    const w = createWorld({ seed: 4 }), t = tilesNearPath(w, 6);
    place(w, 'warrior', ...t[1]); const r = place(w, 'ranger', ...t[3]); place(w, 'mage', ...t[5]);
    apply(w, { type: 'auto', on: true });
    while ((r.level < 15 || w.gold < 500) && w.phase !== 'over') step(w);
    assert.ok(evolveTo(w, r, form).ok, form);
    for (let i = 0; i < 5000 && step(w); i++);
    assert.ok(r.ults > 0, form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
