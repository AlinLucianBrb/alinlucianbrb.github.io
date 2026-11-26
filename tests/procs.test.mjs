/* Effect stats: the 14 relics that do something in a fight (also item bonuses) and the 10 reworked talent notables. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEROES, RELICS, RARITIES, T } from '../js/content/data.js';
import { EFFECT_STATS, EFFECT_KEYS, PROC } from '../js/content/effect-stats.js';
import { ITEM_BONUSES, itemMods } from '../js/content/items.js';
import { TREES, TREE_ORDER, NODES, COMBAT_CLUSTERS, talentMods } from '../js/content/talents.js';
import { fmtMod } from '../js/content/format.js';
import { heroStats } from '../js/engine/stats.js';
import { createWorld, step, recalc } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { mitigate, inflict } from '../js/engine/combat.js';
import { applyEffect, tickEffects } from '../js/engine/effects.js';
import { updateAbilities } from '../js/engine/enemy-abilities.js';
import { spawnEnemy } from '../js/engine/enemies.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, withTemp } from './helpers.mjs';
import { STAGES } from '../js/content/data.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e, dealt = e => e.max - e.hp;
const FRESH = RELICS.filter(r => r.fresh);
/* A world with a Warrior (and a Hunter beside it or far away), a relic or stat on, and fixed rolls. */
function setup(stat = null, v = 0, roll = 0.5, hero = 'warrior') {
  const w = richWorld({ stage: 2, lineup: ['warrior', 'ranger', 'mage'] }), free = []; w.gold = 0; w.lives = 20;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) if (!w.pathSet.has(x + ',' + y)) free.push([x, y]);
  const a = free.find(([x, y]) => free.some(t => t[0] === x + 1 && t[1] === y)), far = free.filter(t => Math.max(Math.abs(t[0] - a[0]), Math.abs(t[1] - a[1])) > 2);
  const h = place(w, hero, ...a);
  if (stat) w.mods.push({ stat, type: 'flat', value: v, scope: ['all'], source: 'test', ri: 0 });
  recalc(w); w.rng.combat.next = () => roll;
  return { w, h, beside: [a[0] + 1, a[1]], far: far[0], at: (dx = 20, dy = 0, hp = 1e6, type = 'grunt') => enemyAt(w, h.x + dx, h.y + dy, 0, hp, type) };
}
const hit = (w, h, e) => { const b = e.hp; w.attack(h, e); return b - e.hp; };
/* The damage of one hit with the stat against without it. */
const ratio = (stat, v, prep = () => {}, hero) => [0, v].map(x => { const s = setup(stat, x, 0.5, hero), e = prep(s) || s.at(); return hit(s.w, s.h, e); }).reduce((a, b) => b / a);

test('14 relics and every one is also an item bonus the server knows; each effect stat says what it does', () => {
  assert.equal(FRESH.length, 14);
  for (const f of ['supabase-setup.sql', 'supabase-update.sql']) { const sql = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); for (const r of FRESH) assert.ok(sql.includes("('" + r.name + "', array["), f + ' ' + r.name); }
  for (const r of FRESH) { assert.ok(ITEM_BONUSES.includes(r.name), r.name); assert.ok(r.desc(1).length > 10 && r.desc(1) !== r.desc(2), r.name); for (const m of r.mods(1)) assert.ok(EFFECT_STATS[m.stat], m.stat); }
  for (const k of EFFECT_KEYS) { assert.ok(EFFECT_STATS[k].label && EFFECT_STATS[k].text(0.1), k); assert.ok(HEROES.every(h => h.stats[k] === 0), k); }
});

test('a hero without any of them is untouched: no flag, no extra random rolls', () => {
  const { w, h, at } = setup(); assert.equal(h.s.fxOn, false); let rolls = 0; w.rng.combat.next = () => { rolls++; return 0.5; };
  const n = () => { rolls = 0; w.attack(h, at()); return rolls; }, plain = n(); w.mods.push({ stat: 'vsBoss', type: 'flat', value: 1, scope: ['all'] }); recalc(w); assert.equal(h.s.fxOn, true); assert.equal(n(), plain, 'a situational one rolls nothing either');
});

test('every offer of relics has at least one of the new ones; plain ones are still there', () => {
  const w = richWorld({ stage: 2 }); let plain = 0;
  for (let k = 0; k < 60; k++) { apply(w, { type: 'buyRelic' }); assert.ok(w.pick.offers.some(o => o.relic.fresh), 'offer ' + k); plain += w.pick.offers.filter(o => !o.relic.fresh).length; assert.equal(new Set(w.pick.offers.map(o => o.relic.name)).size, w.pick.offers.length); apply(w, { type: 'choose', index: 0 }); }
  assert.ok(plain > 40, 'plain offers: ' + plain);
});

test('on an item it works for the wearer only', () => {
  const mods = itemMods({ warrior: [{ type: 'helm', rarity: 3, bonuses: ['Executioner'], ranks: [4], ilvl: 10 }] }), of = id => heroStats(HEROES.find(h => h.id === id), mods);
  assert.ok(near(of('warrior').vsLow, 0.32)); assert.equal(of('ranger').vsLow, 0); assert.equal(of('ranger').fxOn, false);
});

test('damage by the target: Executioner, First blood, Giant slayer, Shatter, frozen enemies', () => {
  const low = s => { const e = s.at(); e.hp = e.max * 0.2; return e; }, half = s => { const e = s.at(); e.hp = e.max * 0.5; return e; };
  assert.ok(near(ratio('vsLow', 0.5, low), 1.5)); assert.ok(near(ratio('vsLow', 0.5, half), 1));
  assert.ok(near(ratio('vsFull', 0.5), 1.5)); assert.ok(near(ratio('vsFull', 0.5, half), 1));
  assert.ok(near(ratio('vsBoss', 0.5, s => s.at(20, 0, 1e6, 'boss')), 1.5)); assert.ok(near(ratio('vsBoss', 0.5), 1));
  for (const id of ['chill', 'freeze', 'oiled']) assert.ok(near(ratio('vsHeld', 0.5, s => { const e = s.at(); applyEffect(e, id, 1); return e; }), 1.5), id);
  assert.ok(near(ratio('vsHeld', 0.5), 1)); assert.ok(near(ratio('vsFrozen', 0.25, s => { const e = s.at(); applyEffect(e, 'freeze', 1); return e; }), 1.25)); assert.ok(near(ratio('vsFrozen', 0.25, s => { const e = s.at(); applyEffect(e, 'chill', 1); return e; }), 1));
});

test('damage by the situation: alone, beside others, few lives, kills, gold, distance', () => {
  assert.ok(near(ratio('lone', 0.4), 1.4)); assert.ok(near(ratio('lone', 0.4, s => { place(s.w, 'ranger', ...s.beside); }), 1)); assert.ok(near(ratio('lone', 0.4, s => { place(s.w, 'ranger', ...s.far); }), 1.4));
  assert.ok(near(ratio('brother', 0.2, s => { place(s.w, 'ranger', ...s.beside); }), 1.2)); assert.ok(near(ratio('brother', 0.2), 1));
  assert.ok(near(ratio('lastStand', 0.03, s => { s.w.lives = 4; }), 1.18)); assert.ok(near(ratio('lastStand', 0.03), 1));
  assert.ok(near(ratio('trophy', 0.01, s => { s.w.kills = 149; }), 1.02)); assert.ok(near(ratio('trophy', 0.01, s => { s.w.kills = 99999; }), 1.15));
  assert.ok(near(ratio('fever', 0.01, s => { s.w.gold = 650; }), 1.03)); assert.ok(near(ratio('fever', 0.01, s => { s.w.gold = 1e6; }), 1.1));
  assert.ok(near(ratio('perTile', 0.04, s => s.at(3 * T, 0)), 1.12));
});

test('Tempo: every 10th hit; Whirlwind: every 5th melee hit lands twice (and the extra one does not count)', () => {
  { const { w, h, at } = setup('tempo', 0.6), e = at(), l = []; for (let k = 0; k < 20; k++) l.push(hit(w, h, e)); assert.deepEqual(l.map((x, k) => near(x / l[0], 1.6) ? k + 1 : 0).filter(Boolean), [10, 20]); }
  { const { w, h, at } = setup('fifth', 1), e = at(), l = []; for (let k = 0; k < 15; k++) l.push(hit(w, h, e)); assert.deepEqual(l.map((x, k) => near(x / l[0], 2) ? k + 1 : 0).filter(Boolean), [5, 10, 15]); assert.equal(h.hitN, 15); }
});

test('what follows a hit: splash, Chain reaction, Thunderhead, recast; and an extra hit never causes another', () => {
  { const { w, h, at } = setup('splash', 0.15), e = at(), o = at(40), far = at(200); const d = hit(w, h, e); assert.ok(near(dealt(o), d * 0.15)); assert.equal(dealt(far), 0); }
  { const s = setup('chainCrit', 1, 0); s.w.mods.push({ stat: 'critChance', type: 'flat', value: 1, scope: ['all'] }, { stat: 'critDamage', type: 'flat', value: -0.5, scope: ['all'] }, { stat: 'critDamage', type: 'flat', value: 0.5, scope: ['all'] }); recalc(s.w); const e = s.at(), o = s.at(60), p = s.at(100); const d = hit(s.w, s.h, e); assert.ok(near(dealt(o), d / 2, 1e-6)); assert.equal(dealt(p), 0, 'one more, not a chain without end'); }
  { const s = setup('chainCrit', 1, 0.99), e = s.at(), o = s.at(60); hit(s.w, s.h, e); assert.equal(dealt(o), 0, 'not a crit'); }
  { const s = setup('thunder', 1, 0.5), e = s.at(); const plain = hit(s.w, s.h, e); applyEffect(e, 'shock', { t: 5, mag: 0, resDown: 0 }); assert.ok(near(hit(s.w, s.h, e), 2 * plain)); }
  { const s = setup('recast', 1, 0.5, 'mage'), e = s.at(), p = setup(null, 0, 0.5, 'mage'); assert.ok(near(hit(s.w, s.h, e), 2 * hit(p.w, p.h, p.at()))); }
  { const s = setup('splash', 1), e = s.at(20, 0, 5), o = s.at(30); s.w.attack(s.h, e); assert.ok(e.dead && dealt(o) > 0, 'also when the hit kills'); }
});

test('Momentum: kills stack attack speed up to 10 times for 4 s; Overflow: ultimates feed the others', () => {
  { const { w, h, at } = setup('momentum', 0.02), v = h.s.speed; for (let k = 1; k <= 13; k++) { w.hit(h, at(20, 0, 1, 'minion'), 9); assert.ok(near(h.s.speed, v * (1 + 0.02 * Math.min(10, k))), 'kill ' + k); } assert.equal(h.buffs.filter(b => b.id === 'momentum').length, 1);
    w.phase = 'wave'; w.spawnLeft = 1; w.spawnT = 99; for (let k = 0; k < 245; k++) step(w); assert.ok(near(h.s.speed, v)); w.hit(h, at(20, 0, 1, 'minion'), 9); assert.ok(near(h.s.speed, v * 1.02), 'from one again'); }
  { const { w, h, at } = setup('momentum', 9), v = h.s.speed; w.hit(h, at(20, 0, 1, 'minion'), 9); assert.ok(near(h.s.speed, v * (1 + PROC.momentum.most))); }
  { const { w, h, far } = setup('overflow', 2), o = place(w, 'ranger', ...far); h.energy = h.s.energyMax; w.attackMult(h, null); assert.equal(o.energy, 2); assert.equal(h.energy, 0); }
  { const { w, h, far } = setup('overflow', 500), o = place(w, 'ranger', ...far); h.energy = h.s.energyMax; w.attackMult(h, null); assert.equal(o.energy, PROC.overflowMost); }
});

test('Precision: two rolls, the better one; Pyromancy staggers once; Thunderstruck jumps once', () => {
  { const s = setup('lucky', 1), seq = [0.9, 0.1]; s.w.mods.push({ stat: 'critChance', type: 'flat', value: 0.3, scope: ['all'] }); recalc(s.w); const crit = s.h.s.critChance > 0.1; assert.ok(crit); let n = 0; s.w.rng.combat.next = () => seq[n++ % 2]; let c = 0; s.w.ev.on('crit', () => c++); s.w.attack(s.h, s.at()); assert.equal(c, 1); assert.ok(n >= 2); }
  { const s = setup('stagger', 0.2), e = s.at(); inflict(s.w, s.h, e, 'burn', 10); assert.ok(near(e.fx.stun.t, 0.2)); delete e.fx.stun; inflict(s.w, s.h, e, 'burn', 10); assert.ok(!e.fx.stun, 'it was already burning'); }
  { const s = setup('arcing', 1), e = s.at(), o = s.at(60), p = s.at(100); inflict(s.w, s.h, e, 'shock', 10); assert.ok(o.fx && o.fx.shock); assert.ok(!(p.fx && p.fx.shock)); }
});

test('Sunder: Corruption takes defenses; Toxins: poison is stronger and stops healing', () => {
  { const s = setup('wither', 0.01), e = s.at(); e.armor = 0.5; e.res = { fire: 0.5 }; for (let k = 0; k < 4; k++) inflict(s.w, s.h, e, 'corruption', 10); assert.ok(near(mitigate(e, 'physical', 100), 54)); assert.ok(near(mitigate(e, 'fire', 100), 54));
    const p = setup(), q = p.at(); q.armor = 0.5; inflict(p.w, p.h, q, 'corruption', 10); assert.ok(near(mitigate(q, 'physical', 100), 50)); }
  { const s = setup('venom', 0.15), p = setup(), e = s.at(), q = p.at(); inflict(s.w, s.h, e, 'poison', 10); inflict(p.w, p.h, q, 'poison', 10); assert.ok(near(e.fx.poison.stacks[0].dps / q.fx.poison.stacks[0].dps, 1.15)); }
  for (const [v, heals] of [[0.15, false], [0, true]]) { const s = setup('venom', v); s.w.wave = 22; const e = spawnEnemy(s.w, 'regener'); e.hp = e.max / 2; inflict(s.w, s.h, e, 'poison', 1); const b = e.hp; updateAbilities(s.w, 1); assert.equal(e.hp > b, heals); }
});

test('the twelve combat notables are their effect alone and say it; the tree keeps its nodes', () => {
  const want = { melee: 'lucky', projectile: 'perTile', spell: 'recast', minion: 'feed', physical: 'focus', fire: 'stagger', cold: 'deepFreeze', lightning: 'arcing',
    toxic: 'venom', shadow: 'wither', holy: 'overkill', energy: 'thrift' };
  assert.deepEqual(Object.keys(want).sort(), [...COMBAT_CLUSTERS].sort()); assert.equal(TREES[TREE_ORDER[0]].nodes.length, 101);
  for (const [k, stat] of Object.entries(want)) { const n = NODES.get('t6_' + k + '_n'); assert.equal(n.mods[0].stat, stat, k); assert.equal(n.mods.length, 1); assert.equal(fmtMod(n.mods[0]), EFFECT_STATS[stat].text(n.mods[0].value)); assert.ok(n.desc.includes(fmtMod(n.mods[0]))); }
  assert.equal(NODES.get('t6_physical_m').mods[0].value, 0.09);
  const s = id => heroStats(HEROES.find(h => h.id === id), talentMods(['t6_melee_n', 't6_spell_n', 't6_projectile_n'])); assert.deepEqual([s('warrior').lucky, s('mage').lucky, s('mage').recast, s('warrior').recast], [1, 0, 0.08, 0]); assert.ok(s('ranger').perTile > 0 && s('warrior').perTile === 0);
});

test('matches with every effect on replay exactly, for every hero', () => {
  withTemp(STAGES[1], { hpMult: 0.3, growth: 1.05, waves: 12 }, () => {
    for (const base of HEROES) {
      const items = { [base.id]: [['helm', FRESH.slice(0, 4)], ['body_armour', FRESH.slice(4, 8)], ['leggings', FRESH.slice(8, 12)], ['boots', FRESH.slice(12)]].map(([type, l]) => ({ type, rarity: 3, bonuses: l.map(r => r.name), ranks: l.map(() => 4), ilvl: 60 })) };
      const w = createWorld({ seed: 9, stage: 2, lineup: [base.id, base.id === 'mage' ? 'warrior' : 'mage'], items, talents: [...NODES.values()].filter(n => n.notable && COMBAT_CLUSTERS.includes(n.cluster)).map(n => n.id) });
      for (const id of w.lineup) search: for (const [x, y] of w.path.slice(3)) for (const d of [1, -1]) if (apply(w, { type: 'place', hero: id, cx: x, cy: y + d }).ok) break search;
      for (let k = 0; k < 60 * 400 && w.phase !== 'over'; k++) { if (w.phase === 'build') apply(w, { type: 'wave' }); step(w); }
      assert.ok(w.heroes[0].s.fxOn); assert.ok(w.kills > 20, base.id + ' ' + w.kills); assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), base.id);
    }
  });
});
