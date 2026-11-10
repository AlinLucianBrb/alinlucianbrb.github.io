/* The design notes of this round: toughest-first targeting, slower enemies, armor and resistances alike, energy and buff
   ultimates, the attribute effects, damage between a min and a max, the Duration relic, kit changes and the relic icons. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS, pickStrongest, TOUGHNESS } from '../js/engine/behaviors.js';
import { updateZones } from '../js/engine/zones.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { ENEMIES, ENEMY_SPEED, spawnEnemy, defensesFor, pathPos } from '../js/engine/enemies.js';
import { ULTIMATES, ultDesc, attackMult } from '../js/engine/ultimates.js';
import { heroStats } from '../js/engine/stats.js';
import { levelMods } from '../js/engine/levels.js';
import { nearestPathD } from '../js/engine/kits/paladin.js';
import { TOTEM, SURGE } from '../js/engine/kits/shaman.js';
import { HEROES, RELICS, DAMAGE_ROLL, ATTRIBUTE_EFFECTS, EVOLVE_BONUS, T } from '../js/content/data.js';
import { relicIcon } from '../js/game/sprites.js';
import { richWorld, place, enemyAt, dealt, tilesNearPath } from './helpers.mjs';

const H = id => HEROES.find(h => h.id === id);
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
function onPath(w, h, along = 0, hp = 1e6, type = 'grunt') {
  const { d } = nearestPathD(w, h.x, h.y), p = { x: 0, y: 0 }, at = Math.max(1, d + along);
  pathPos(w.path, at / T, p);
  return enemyAt(w, p.x, p.y, at, hp, type);
}
function evolved(heroId, form, lineup = [heroId]) {
  const w = richWorld({ lineup });
  let h;
  for (const [x, y] of w.path.slice(5)) { for (const dy of [1, -1]) if (!h && apply(w, { type: 'place', hero: heroId, cx: x, cy: y + dy }).ok) h = w.heroes.at(-1); if (h) break; }
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  if (form) assert.ok(apply(w, { type: 'evolve', id: h.id, choice: H(heroId).evolutions[0].choices.findIndex(c => c.id === form) }).ok);
  return { w, h };
}

test('"the toughest enemy" is the toughest kind first (boss, brute, grunt, runner), even at 1 life; then the most life', () => {
  assert.ok(TOUGHNESS.boss > TOUGHNESS.brute && TOUGHNESS.brute > TOUGHNESS.grunt && TOUGHNESS.grunt > TOUGHNESS.runner);
  const w = richWorld({ lineup: ['rogue'] }), h = place(w, 'rogue', ...tilesNearPath(w, 1)[0]);
  const runner = enemyAt(w, h.x + 10, h.y, 5, 1e6, 'runner'), grunt = enemyAt(w, h.x + 12, h.y, 6, 500, 'grunt');
  assert.equal(pickStrongest(w, h, 100), grunt, 'a grunt over a runner with far more life');
  const boss = enemyAt(w, h.x + 14, h.y, 7, 1, 'boss');
  assert.equal(pickStrongest(w, h, 100), boss, 'a boss at 1 life first');
});

test('enemies are 35% slower, and their armor and resistances are the same share and grow together', () => {
  assert.equal(ENEMY_SPEED, 0.65);
  const w = createWorld({ seed: 1 }); w.wave = 1; spawnEnemy(w, 'grunt');
  assert.ok(near(w.enemies[0].speed, 52 * ENEMIES.grunt.speed * 0.65));
  for (const k of Object.keys(ENEMIES)) { const d = defensesFor(ENEMIES[k], 12, 2); for (const r of Object.values(d.res)) assert.equal(r, d.armor, k); }
});

test('energy is a tenth of what it was (2 per attack), and a buff ultimate waits until its buff on the caster runs out', () => {
  assert.equal(H('warrior').stats.energyPerAttack, 2);
  const { w, h } = evolved('warrior', 'berserker');
  const e = enemyAt(w, h.x + 20, h.y, 10);
  h.energy = h.s.energyMax;
  assert.equal(attackMult(w, h, e), 1); assert.ok(h.buffs.some(b => b.id === 'frenzy'), 'Frenzy on');
  h.energy = h.s.energyMax;
  assert.equal(attackMult(w, h, e), 1); assert.equal(h.ults, 1, 'not again while Frenzy lasts'); assert.equal(h.energy, h.s.energyMax, 'the bar stays full');
  h.buffs.length = 0; w.statsFor(h);
  attackMult(w, h, e); assert.equal(h.ults, 2, 'once it has run out');
  for (const id of ['frenzy', 'rally', 'grasp', 'heresy', 'blessing', 'ancestral']) assert.equal(ULTIMATES[id].buff, id);
  for (const id of ['enrage', 'crescendo', 'doom', 'demongate']) assert.equal(typeof ULTIMATES[id].active, 'function');
});

test('attributes: strength gives range and penetration, dexterity crit chance and crit damage, intellect cast speed and energy', () => {
  const s = heroStats(H('mage'), []), b = H('mage').stats;
  assert.ok(near(s.range, b.range * (1 + b.strength * 0.0025)) && near(s.armorPen, b.strength * 0.001) && near(s.resPen, b.strength * 0.001));
  assert.ok(near(s.critChance, b.dexterity * 0.001) && near(s.critDamage, 1.5 + b.dexterity * 0.005));
  assert.ok(near(s.castSpeed, 1 + b.intellect * 0.003) && near(s.energyPerAttack, 2 * (1 + b.intellect * 0.005)));
  assert.deepEqual(Object.keys(ATTRIBUTE_EFFECTS), ['strength', 'dexterity', 'intellect']);
  assert.equal('arc' in s, false, 'no swing arc stat'); assert.equal(RELICS.some(r => r.name === 'Wide swing'), false);
});

test('an evolution adds 25% to all the base stats, attributes included', () => {
  assert.equal(EVOLVE_BONUS, 0.25);
  const { w, h } = evolved('mage');
  const before = { ...h.s };
  apply(w, { type: 'evolve', id: h.id, choice: 0 });
  for (const k of ['intellect', 'strength', 'dexterity']) assert.ok(near(h.s[k], before[k] * 1.25), k);
});

test('damage is between a min and a max: each hit rolls within 25% of the damage stat', () => {
  DAMAGE_ROLL.on = true;
  try {
    const w = richWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]), hits = [];
    h.mods.push({ stat: 'dexterity', type: 'more', value: -1, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);   /* no crits */
    for (let i = 0; i < 400; i++) { const e = enemyAt(w, h.x + 20, h.y, 10); w.attack(h, e); hits.push(dealt(e)); }
    const lo = Math.min(...hits), hi = Math.max(...hits), d = h.s.damage;
    assert.ok(lo >= d * 0.75 - 1e-9 && hi <= d * 1.25 + 1e-9, lo + '..' + hi);
    assert.ok(lo < d * 0.8 && hi > d * 1.2, 'the whole range shows up');
    const w2 = createWorld({ seed: 4, lineup: ['warrior'] });
    for (const [x, y] of w2.path.slice(4)) if (apply(w2, { type: 'place', hero: 'warrior', cx: x, cy: y + 1 }).ok) break;
    apply(w2, { type: 'wave' }); for (let i = 0; i < 1200; i++) step(w2);
  } finally { DAMAGE_ROLL.on = false; }
});

test('the Duration relic makes buffs, debuffs and damage over time last longer', () => {
  const r = RELICS.find(x => x.name === 'Duration'), m = r.mods(4)[0];
  assert.equal(m.stat, 'duration'); assert.ok(near(m.value, 0.3));
  const { w, h } = evolved('mage', 'firemage');
  h.mods.push({ ...m, source: 'test', ri: -2 }); w.statsFor(h);
  const e = enemyAt(w, h.x + 20, h.y, 10);
  w.attack(h, e);
  assert.ok(near(e.fx.burn.t, 4 * 1.3), 'burn: 4 s, +30%');
  const b = evolved('warrior', 'berserker');
  b.h.mods.push({ ...m, source: 'test', ri: -2 }); b.w.statsFor(b.h);
  b.h.energy = b.h.s.energyMax; attackMult(b.w, b.h, enemyAt(b.w, b.h.x + 20, b.h.y, 10));
  assert.ok(near(b.h.buffs.find(x => x.id === 'frenzy').t, 5 * 1.3), 'Frenzy: 5 s, +30%');
});

test('the Occult only curses; totems are only planted when one is missing; Totem surge pulses 3 times', () => {
  { const { w, h } = evolved('warlock', 'occult'); const e = onPath(w, h, 0); tick(w, h, 120); assert.equal(dealt(e), 0); assert.ok(e.fx.hex); }
  const { w, h } = evolved('shaman', 'totemist');
  onPath(w, h, 0);
  for (let i = 0; i < 3; i++) { h.cd = 0; tick(w, h, 1); }
  const mine = () => w.zones.filter(z => z.type === 'totem' && z.owner === h && z.t > 0);
  const first = mine().map(z => z.kind + z.cx + ',' + z.cy).join();
  h.cd = 0; tick(w, h, 1);
  assert.equal(mine().map(z => z.kind + z.cx + ',' + z.cy).join(), first, 'all three stand: none replaced');
  mine()[0].t = 0; tick(w, h, 1); h.cd = 0; tick(w, h, 1);
  assert.equal(mine().length, TOTEM.max, 'a missing one comes back');
  const e = enemyAt(w, mine()[0].x + 10, mine()[0].y, 50, 1e9), hits = [];
  w.ev.on('damage', ({ enemy, type }) => { if (enemy === e && type === 'fire' || enemy === e && type === 'cold' || enemy === e && type === 'lightning') hits.push(w.tick); });
  h.energy = h.s.energyMax; h.cd = 0; tick(w, h, 1);
  const pulsesOn = z => z.surge;
  assert.ok(mine().every(z => pulsesOn(z) === SURGE.pulses - 1), 'the first pulse right away, two to come');
  tick(w, h, Math.ceil(60 * SURGE.gap * 2) + 2);
  assert.ok(mine().every(z => z.surge === 0), 'all three pulses');
});

test('Hellfire spreads its burning ground; the Witch Doctor darts an enemy that is not linked yet', () => {
  const { w, h } = evolved('warlock', 'infernalist');
  const a = onPath(w, h, 0), b = onPath(w, h, -3 * T);
  h.cd = 0; tick(w, h, 1);
  const first = w.projs.find(p => p.type === 'lob');
  h.cd = 0; tick(w, h, 1);
  const second = w.projs.filter(p => p.type === 'lob')[1];
  assert.ok(first && second && Math.hypot(first.tx - second.tx, first.ty - second.ty) > 40, 'the second lands somewhere else');
  const wd = evolved('shaman', 'witchdoctor');
  const x = onPath(wd.w, wd.h, 0), y = onPath(wd.w, wd.h, -4 * T);
  (x.fx ||= {}).link = { t: 3, grp: { members: [x] } };
  wd.h.cd = 0; tick(wd.w, wd.h, 1);
  assert.equal(wd.w.projs.find(p => p.type === 'bolt').target, y, 'the unlinked one, though the other is further along');
  assert.ok(a && b);
});

test('the Crusader can stand on the path, and then rides only along it', () => {
  const { w, h } = evolved('paladin', 'crusader');
  const [cx, cy] = w.path[6];
  assert.ok(apply(w, { type: 'move', id: h.id, cx, cy }).ok, 'onto the path');
  for (let i = 0; i < 60; i++) step(w);   /* settle after the move */
  w.wave = 2; w.phase = 'wave'; w.spawnLeft = 0;
  const e = onPath(w, h, -T);
  h.cd = 0; tick(w, h, 1);
  assert.equal(h.ride.phase, 'ride', 'straight into the charge');
  const off = [];
  for (let i = 0; i < 300 && h.ride; i++) { tick(w, h, 1); if (h.ride) { const { dist } = nearestPathD(w, h.ride.x, h.ride.y); off.push(dist); } }
  assert.equal(h.ride, null); assert.ok(Math.max(...off) < 3, 'never off the path'); assert.ok(dealt(e) > 0);
  assert.equal(apply(w, { type: 'place', hero: 'paladin', cx, cy }).reason !== undefined, true);
});

test('ultimate texts: damage of its own shows as a number; "x2 damage" only for boosts to an existing attack', () => {
  const u = ULTIMATES.judgement;
  assert.match(u.desc, /\{8\}/);
  assert.match(ultDesc(u, { damage: 20 }), /for about 160 damage/);
  assert.match(ultDesc(u), /8 times his damage/);
  for (const id in ULTIMATES) assert.doesNotMatch(ULTIMATES[id].desc, /\d+x damage/, id);
  for (const h of HEROES) assert.doesNotMatch(h.short, /At level 10/, h.id);
  assert.equal(ULTIMATES.empowered.desc, 'The next attack deals double damage.');
});

test('every relic has an icon', () => {
  for (const r of RELICS) assert.ok(existsSync(new URL('../assets/' + relicIcon(r.name) + '.png', import.meta.url)), r.name);
  assert.equal(relicIcon('Four-leaf clover'), 'relic_four_leaf_clover');
});
