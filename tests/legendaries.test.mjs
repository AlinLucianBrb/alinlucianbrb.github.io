/* Legendary relics: the choice after wave 25 (who gets which cards, solo and co-op) and what each of the 14 does. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { HEROES, RELICS, STAGES, T, evolvedDef } from '../js/content/data.js';
import { LEGENDARIES, LEGENDARY, GENERAL, classLegendary } from '../js/content/legendaries.js';
import { relicIcon } from '../js/game/sprites.js';
import { createWorld, step, recalc, startWave, STEP } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { inflict, critMult } from '../js/engine/combat.js';
import { applyEffect, damageTaken } from '../js/engine/effects.js';
import { hexMore } from '../js/engine/legend-perks.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { sweep } from '../js/engine/enemies.js';
import { openLegendaries, takeRelic, updateLegendaries } from '../js/engine/legendaries.js';
import { openVote } from '../js/engine/match-effects.js';
import { exportLog, replay, resume } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, withTemp } from './helpers.mjs';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e, dealt = e => e.max - e.hp;
const freeTiles = w => { const out = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) if (!w.pathSet.has(x + ',' + y)) out.push([x, y]); return out; };
/* A world with one hero (and more from `others`), a legendary on, and fixed rolls. */
function setup(id, hero = 'warrior', { roll = 0.99, others = [], form = null } = {}) {
  const w = richWorld({ stage: 2, lineup: [hero, ...others] }), free = freeTiles(w), a = free.find(([x, y]) => x > 2 && x < 9 && y > 1 && y < 6);
  const h = place(w, hero, ...a); others.forEach(o => place(w, o, ...free.filter(t => Math.max(Math.abs(t[0] - a[0]), Math.abs(t[1] - a[1])) === 1 && !w.heroes.some(x => x.cx === t[0] && x.cy === t[1]))[0]));
  if (form) { h.def = evolvedDef(h.def, h.base.evolutions[0].choices.find(c => c.id === form)); h.tier = 1; }
  w.players[0].legendary = id; recalc(w); w.rng.combat.next = () => roll;
  return { w, h, at: (dx = 20, dy = 0, hp = 1e6, type = 'grunt') => enemyAt(w, h.x + dx, h.y + dy, 0, hp, type) };
}
/* The heroes, projectiles and zones for a while; the enemies stay where they are. */
function run(w, seconds) {
  w.phase = 'wave';
  for (let k = 0; k < seconds * 60; k++) { for (const h of w.heroes) BEHAVIORS[h.def.kind].update(w, h, STEP); updateLegendaries(w, STEP); updateProjectiles(w, STEP); updateZones(w, STEP); sweep(w.enemies); }
}

test('14 legendary relics: 5 for everyone and one per class, each with a text and an icon', () => {
  assert.equal(Object.keys(LEGENDARIES).length, 14); assert.equal(GENERAL.length, 5);
  for (const h of HEROES) assert.ok(classLegendary(h.id), h.id);
  for (const l of Object.values(LEGENDARIES)) { assert.ok(l.desc.length > 20 && !/undefined|NaN/.test(l.desc), l.name); assert.ok(existsSync(new URL('../assets/' + relicIcon(l.name) + '.png', import.meta.url)), l.name); assert.ok(!RELICS.some(r => r.name === l.name)); }
});

test('after wave 25: 4 cards, one per hero on the map and the rest for everyone; solo, the match waits', () => {
  for (const n of [0, 1, 2, 3]) {
    const w = createWorld({ seed: 5, stage: 4, lineup: ['warrior', 'mage', 'priest'] }); w.gold = 1e6;
    const free = freeTiles(w); for (let k = 0; k < n; k++) place(w, w.lineup[k], ...free[k]);
    w.wave = 24; startWave(w); w.spawnLeft = 0; step(w);
    assert.equal(w.phase, 'build'); assert.ok(w.pick.legendary); const ids = w.pick.offers.map(o => o.id); assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4);
    assert.deepEqual(ids.filter(i => LEGENDARIES[i].hero), w.lineup.slice(0, n).map(classLegendary)); assert.equal(ids.filter(i => GENERAL.includes(i)).length, 4 - n);
    assert.equal(step(w), false); assert.equal(apply(w, { type: 'wave' }).ok, false); assert.equal(apply(w, { type: 'buyRelic' }).ok, false);
    for (const type of ['reroll', 'banish']) assert.equal(apply(w, { type, index: 0 }).reason, 'legendary'); assert.equal(w.rerollCost(), 0);
    const gold = w.gold; assert.ok(apply(w, { type: 'choose', index: 3 }).ok); assert.equal(w.gold, gold, 'free'); assert.equal(w.legendary, ids[3]); assert.equal(w.picking, false); assert.equal(step(w), true); assert.equal(w.relics.length, 0);
    openLegendaries(w); assert.equal(w.pick, null, 'once per match');
  }
});

test('only after wave 25, and not on a level\'s last wave', () => {
  const at = (wave, waves) => withTemp(STAGES[1], { waves }, () => { const w = createWorld({ seed: 1, stage: 2 }); w.wave = wave - 1; startWave(w); w.spawnLeft = 0; step(w); return w; });
  assert.equal(at(24, 40).pick, null); assert.equal(at(26, 40).pick, null); assert.ok(at(25, 40).pick); assert.equal(at(25, 25).pick, null);
  assert.ok(STAGES[0].waves <= LEGENDARY.wave && STAGES[1].waves <= LEGENDARY.wave && STAGES[2].waves > LEGENDARY.wave, 'the levels that have it');
});

test('a player still choosing a relic gets the legendary right after; one that opens with a vote waits its turn too', () => {
  const w = richWorld({ stage: 4, matchEffects: true }); place(w, 'warrior', ...freeTiles(w)[0]); apply(w, { type: 'buyRelic' }); const first = w.pick;
  w.wave = 25; openLegendaries(w); assert.equal(w.pick, first); apply(w, { type: 'choose', index: 0 }); assert.ok(w.pick.legendary); assert.equal(w.picking, true);
  openVote(w); assert.ok(apply(w, { type: 'choose', index: 0 }).ok); assert.equal(w.pick, null);
});

test('co-op: each player gets its own, from its own heroes, and the match goes on', () => {
  const w = createWorld({ seed: 3, stage: 4, players: [{ lineup: ['warrior'] }, { lineup: ['mage', 'priest'] }, { lineup: ['rogue'] }] }), free = freeTiles(w); for (const p of w.players) p.gold = 1e4;
  for (const [k, [p, hero]] of [[0, 'warrior'], [1, 'mage'], [1, 'priest'], [2, 'rogue']].entries()) assert.ok(apply(w, { type: 'place', hero, cx: free[k][0], cy: free[k][1], p }).ok);
  w.players[2].left = true; w.wave = 25; openLegendaries(w); assert.equal(step(w), true);
  const cls = p => p.pick.offers.map(o => o.id).filter(i => LEGENDARIES[i].hero); assert.deepEqual(cls(w.players[0]), ['bladestorm']); assert.deepEqual(cls(w.players[1]), ['echo', 'light']); assert.equal(w.players[2].pick, null);
  apply(w, { type: 'choose', index: 0, p: 0 }); assert.deepEqual(w.players.map(p => p.legendary), ['bladestorm', null, null]);
  apply(w, { type: 'leave', p: 1 }); assert.equal(w.players[1].pick, null); assert.equal(w.players[1].picking, false);
});

test('a hero of another player, or of another class, plays without it', () => {
  const w = createWorld({ seed: 3, stage: 4, players: [{ lineup: ['warrior'] }, { lineup: ['warrior'] }] }), free = freeTiles(w); for (const p of w.players) p.gold = 1e4;
  for (const p of [0, 1]) apply(w, { type: 'place', hero: 'warrior', cx: free[p][0], cy: free[p][1], p });
  w.players[0].legendary = 'overload'; recalc(w); assert.ok(near(w.heroes[0].s.critChance - w.heroes[1].s.critChance, 0.25));
  const s = setup('bladestorm', 'mage'); for (let k = 0; k < 10; k++) s.w.afterAttack(s.h); assert.ok(!s.h.attackN);
});

test('Plague: what was left of the damage over time explodes, twice, and the ones that live catch it', () => {
  const s = setup('plague'), e = s.at(20, 0, 100), o = s.at(50), far = s.at(200), weak = s.at(40, 10, 5);
  applyEffect(e, 'burn', { t: 4, dps: 10, src: s.h }); applyEffect(e, 'poison', { t: 2, dps: 5, src: s.h }); s.w.hit(s.h, e, 1e9);
  assert.ok(near(dealt(o), 2 * (40 + 10)), dealt(o)); assert.ok(near(o.fx.burn.t, 4) && o.fx.burn.dps === 10 && o.fx.poison.stacks.length === 1); assert.equal(dealt(far), 0); assert.ok(weak.dead);
  const p = setup(null), f = p.at(20, 0, 100), q = p.at(50); applyEffect(f, 'burn', { t: 4, dps: 10, src: p.h }); p.w.hit(p.h, f, 1e9); assert.equal(dealt(q), 0);
  /* a crowd burning together ends (every death may cause more) */
  const c = setup('plague'); for (let k = 0; k < 60; k++) applyEffect(c.at(10 + k, 0, 30), 'burn', { t: 4, dps: 10, src: c.h }); c.w.hit(c.h, c.w.enemies[0], 1e9); assert.ok(c.w.enemies.every(x => x.dead));
});

test('Overload: crit chance, and what is above 100% becomes crit damage', () => {
  const s = setup('overload'), p = setup(null), e = s.at(); assert.ok(near(s.h.s.critChance - p.h.s.critChance, 0.25));
  const m = c => critMult(s.w, s.h, e, 1, { ...s.h.s, critChance: c, critDamage: 2 }); assert.equal(m(1), 2); assert.ok(near(m(1.3), 2.6)); assert.equal(critMult(p.w, p.h, e, 1, { ...p.h.s, critChance: 1.3, critDamage: 2 }), 2);
});

test('Perpetual motion: a quarter of the ultimates keep their energy', () => {
  for (const [id, roll, left] of [['motion', 0.2, true], ['motion', 0.3, false], [null, 0.2, false]]) { const s = setup(id, 'warrior', { roll }), e = s.at(); s.h.energy = s.h.s.energyMax; s.w.attackMult(s.h, e); assert.equal(s.h.energy > 0, left); assert.equal(s.h.ults, 1); }
});

test('Iron gate: the first enemy through each wave is free, bosses are not', () => {
  const s = setup('gate'), w = s.w, out = type => { const b = w.lives; w.ev.emit('escape', { enemy: enemyAt(w, 0, 0, 0, 10, type) }); return b - w.lives; }; w.wave = 5; w.lives = 50;
  assert.ok(out('boss') > 0); assert.equal(out('brute'), 0); assert.ok(out('grunt') > 0); w.wave = 6; assert.equal(out('grunt'), 0); assert.ok(out('grunt') > 0);
});

test('Collector: every third relic taken from then on counts twice', () => {
  const s = setup('collector'), p = s.w.players[0], d = RELICS.find(r => r.name === 'Brawn'), mods = p.mods.length;
  assert.deepEqual([0, 1, 2, 3].map(() => takeRelic(s.w, p, d, 0)), [false, false, true, false]); assert.equal(p.relics.length, 5); assert.equal(p.mods.length - mods, 5 * d.mods(1).length);
});

test('Bladestorm: every fifth attack hits all around at double range, for every form', () => {
  for (const form of [null, 'berserker', 'commander', 'sentinel']) {
    const s = setup('bladestorm', 'warrior', { form }), o = s.at(-s.h.s.range * 1.8, 0), far = s.at(0, -s.h.s.range * 2.2); s.at(s.h.s.range * 0.7);
    for (let k = 0; k < 4; k++) s.w.afterAttack(s.h); assert.equal(dealt(o), 0); s.w.afterAttack(s.h); assert.ok(dealt(o) > 0, form); assert.equal(dealt(far), 0);
    s.h.attackN = 0; s.w.enemies.length = 2; s.at(s.h.s.range * 0.7); const before = s.h.attackN; run(s.w, 8); assert.ok(s.h.attackN >= 4, form + ' attacks are counted: ' + (s.h.attackN - before));
  }
});

test('Ricochet: every projectile of every form flies on to one more enemy for 70%, once', () => {
  for (const form of [null, 'marksman', 'boomeranger', 'hunter']) {
    const s = setup('ricochet', 'ranger', { form }), e = s.at(60), o = s.at(60, 80), third = s.at(60, 175); o.d = third.d = -1; e.d = 10;
    s.w.players[0].legendary = null; const one = () => { const h = new Map([e, o, third].map(x => [x, x.hp])); return () => [e, o, third].map(x => h.get(x) - x.hp); };
    const hit = one(); s.w.attack(s.h, e); const full = hit()[0]; s.w.players[0].legendary = 'ricochet';
    s.w.projs.push(form === 'boomeranger' ? { type: 'boomerang', owner: s.h, x: s.h.x, y: s.h.y, dx: 1, dy: 0, dist: 0, max: 80, out: true, hit: new Set(), scale: 1, rot: 0, extra: true } : { type: 'bolt', owner: s.h, target: e, x: s.h.x, y: s.h.y, scale: 1, look: 'arrow', speed: 620, dx: 1, dy: 0 });
    s.h.s = { ...s.h.s, range: 0, spread: 0 }; const m = one(); run(s.w, 1); const [, b, c] = m(); assert.ok(b > full * 0.4 && b < full, form + ' ' + b + ' of ' + full); assert.equal(c, 0, 'once');
  }
});

test('Arcane echo: the ultimate again a second later, at half strength', () => {
  const cast = (form, id) => { const s = setup(id, 'mage', { form }), e = s.at(30); s.h.s = { ...s.h.s, spread: 0 }; s.w.statsFor = () => s.h.s; s.h.energy = s.h.s.energyMax; s.w.attackMult(s.h, e); s.h.ultNow = false; s.h.cd = 1e9; return { ...s, e }; };
  { const s = cast('coldmage', 'echo'); assert.ok(near(s.e.fx.freeze.t, 1)); delete s.e.fx.freeze; assert.equal(s.w.echoes.length, 1); run(s.w, 1.01); assert.ok(s.e.fx.freeze && s.e.fx.freeze.t <= 0.5 && s.e.fx.freeze.t > 0.4); assert.equal(s.w.echoes.length, 0); }
  { const s = cast('firemage', 'echo'), dps = s.e.fx.burn.dps; delete s.e.fx.burn; run(s.w, 1.01); assert.ok(near(s.e.fx.burn.dps, dps / 2, dps * 0.01)); }
  { const s = cast('lightningmage', 'echo'); run(s.w, 1.1); const z = s.w.zones.filter(x => x.type === 'storm'); assert.equal(z.length, 2); assert.ok(near(z[1].owner.s.damage, s.h.s.damage / 2)); const b = s.h.dealt; s.w.attack(z[1].owner, s.e); assert.ok(s.h.dealt > b, 'credited to the Mage'); }
  { const s = cast(null, 'echo'); run(s.w, 1.02); const p = s.w.projs.find(x => x.owner.echoOf === s.h); assert.ok(p && near(p.scale * p.owner.s.damage, s.h.s.damage)); run(s.w, 0.5); assert.ok(dealt(s.e) > 0); assert.equal(s.w.echoes.length, 0, 'an echo does not echo'); }
  { const s = cast('coldmage', null); assert.equal(s.w.echoes.length, 0); }
});

test('Death mark: a crit kills a non-boss under 8% life', () => {
  for (const [life, type, roll, dies] of [[0.07, 'grunt', 0, true], [0.2, 'grunt', 0, false], [0.07, 'boss', 0, false], [0.07, 'grunt', 0.99, false]]) { const s = setup('mark', 'rogue', { roll }), e = s.at(20, 0, 1e6, type); e.hp = e.max * life; s.w.attack(s.h, e); assert.equal(e.dead, dies, life + ' ' + type + ' ' + roll); }
});

test('Overgrowth: a root spreads to the two nearest enemies', () => {
  const s = setup('overgrowth', 'druid'), e = s.at(20), a = s.at(40), b = s.at(60), c = s.at(80); inflict(s.w, s.h, e, 'root', 10); assert.deepEqual([e, a, b, c].map(x => !!(x.fx && x.fx.root)), [true, true, true, false]);
  inflict(s.w, s.h, e, 'root', 10); assert.ok(c.fx && c.fx.root, 'past the ones rooted already');
});

test('Lasting light: buffs last twice as long, and every attack of the Priest blesses the heroes close by', () => {
  const s = setup('light', 'priest', { others: ['warrior'] }), o = s.w.heroes[1]; s.w.addBuff(o, 'x', 'X', [], 5, s.h); assert.ok(near(o.buffs[0].t, 10)); s.w.addBuff(o, 'y', 'Y', [], 5); assert.ok(near(o.buffs[1].t, 5), 'not the others\' buffs');
  const d = o.s.damage; s.w.afterAttack(s.h); assert.ok(o.s.damage > d); assert.ok(near(o.buffs[2].t, 6));
  for (const form of ['incantation', 'archangel', 'gospel']) { const f = setup('light', 'priest', { others: ['warrior'], form }); f.at(30); run(f.w, 4); assert.ok(f.w.heroes[1].buffs.some(b => b.id === 'lastinglight'), form); }
});

test('Soul harvest: +0.5% per kill, up to 50%; an Occult\'s Hex counts and grows', () => {
  const s = setup('souls', 'warlock', { others: ['warrior'] }), d = s.h.s.damage, p = s.w.players[0]; s.w.fxm.xp = 0;   /* no levels */
  s.w.hit(s.w.heroes[1], s.at(20, 0, 1), 10); assert.ok(!p.souls, 'the Warrior\'s kill'); s.w.hit(s.h, s.at(20, 0, 1, 'minion'), 10); assert.ok(!p.souls, 'a summoned one');
  for (let k = 0; k < 10; k++) s.w.hit(s.h, s.at(20, 0, 1), 10); assert.ok(near(s.h.s.damage / d, 1.05)); for (let k = 0; k < 200; k++) s.w.hit(s.h, s.at(20, 0, 1), 10); assert.equal(p.souls, 100); assert.ok(near(s.h.s.damage / d, 1.5));
  const o = setup('souls', 'warlock', { others: ['warrior'], form: 'occult' }), e = o.at(20, 0, 1); applyEffect(e, 'hex', { t: 1, src: o.h }); o.w.hit(o.w.heroes[1], e, 10); assert.equal(o.w.players[0].souls, 1);
  o.w.players[0].souls = 100; assert.ok(near(hexMore(o.w, o.h), 0.25)); const t = o.at(20); run(o.w, 2); assert.ok(near(damageTaken(t), 1.5));
});

test('Day of wrath: every tenth hit smites for 3 times as much holy damage', () => {
  const s = setup('wrath', 'paladin'); s.h.s = { ...s.h.s, spread: 0 }; const e = s.at(), hits = []; for (let k = 0; k < 20; k++) { const b = e.hp; s.w.attack(s.h, e); hits.push(b - e.hp); }
  assert.ok(hits.every((x, k) => near(x, hits[0] * (k % 10 === 9 ? 4 : 1), 0.01)), hits.map(x => Math.round(x)).join());
  for (let k = 0; k < 9; k++) s.w.attack(s.h, e); const dying = s.at(20, 0, 1); s.w.attack(s.h, dying); const b = e.hp; s.w.attack(s.h, e); assert.ok(near(b - e.hp, hits[9], 0.01), 'a kill keeps it for the next hit');
});

test('Ancestors\' gift: the ultimate gives the other heroes 20 energy', () => {
  const s = setup('gift', 'shaman', { others: ['warrior', 'mage'] }), [h, a, b] = s.w.heroes; for (const x of [a, b]) x.energy = 5; h.energy = h.s.energyMax; s.w.attackMult(h, s.at()); assert.deepEqual([h.energy, a.energy, b.energy], [0, 25, 25]);
  a.energy = a.s.energyMax; s.w.attackMult(a, s.at()); assert.equal(b.energy, 25, 'only the Shaman\'s');
});

test('matches with each legendary replay exactly, and a match can be resumed while choosing', () => {
  withTemp(STAGES[3], { hpMult: 0.15, growth: 1.04, waves: 30 }, () => {
    for (const l of Object.values(LEGENDARIES)) {
      const hero = l.hero || 'warlock', w = createWorld({ seed: 4, stage: 4, lineup: [hero, hero === 'mage' ? 'ranger' : 'mage', hero === 'warrior' ? 'rogue' : 'warrior'] });
      let resumed = false;
      for (const id of w.lineup) search: for (const [x, y] of w.path.slice(3)) for (const d of [1, -1]) if (apply(w, { type: 'place', hero: id, cx: x, cy: y + d }).ok) break search;
      for (let k = 0; k < 60 * 2000 && w.phase !== 'over'; k++) {
        if (w.pick && w.pick.legendary) {
          if (!resumed) { resumed = true; assert.equal(hashWorld(resume(exportLog(w))), hashWorld(w), l.id + ' while choosing'); }
          w.pick.offers[3].id = l.id; apply(w, { type: 'choose', index: 3 });
        }
        if (w.phase === 'build') apply(w, { type: 'wave' });
        step(w);
      }
      assert.equal(w.legendary, l.id, l.id + ' wave ' + w.wave); assert.ok(w.wave > 25, l.id + ' wave ' + w.wave);
      /* the same forced card in the replay: the draw itself is the same */
      const log = exportLog(w), k = log.commands.findIndex(c => c.type === 'choose'), c = resume({ ...log, commands: log.commands.slice(0, k), ticks: log.commands[k].t });
      c.pick.offers[3].id = l.id;
      for (const cmd of log.commands.slice(k)) { while (c.tick < cmd.t && step(c)); const { t, ...x } = cmd; apply(c, x); }
      while (c.tick < w.tick && step(c));
      assert.equal(hashWorld(c), hashWorld(w), l.id);
    }
  });
});
