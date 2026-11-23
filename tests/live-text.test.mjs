/* Numbers in ability texts follow the hero's real stats (js/content/live-text.js), and the changed ones are marked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveParts, liveText, tipParts, CHANGED_COLOR } from '../js/content/live-text.js';
import { ULTIMATES, ultDesc } from '../js/engine/ultimates.js';
import { HEROES, evolvedDef } from '../js/content/data.js';
import { heroStats } from '../js/engine/stats.js';
import { createWorld, recalc } from '../js/engine/world.js';
import { inflict } from '../js/engine/combat.js';
import { enemyAt, place as put, tilesNearPath } from './helpers.mjs';

const hero = id => HEROES.find(h => h.id === id), base = id => heroStats(hero(id), []);
const more = (id, stat, value, type = 'flat') => heroStats(hero(id), [{ stat, type, value, scope: ['all'] }]);

test('damage, seconds, stats and percentages: the real numbers, and which changed', () => {
  const b = { damage: 20, duration: 1, jumps: 2, rootChance: 0.15 }, s = { damage: 37.1, duration: 1.2, jumps: 2, rootChance: 0.2 };
  assert.equal(liveText('Hits for {10} for {t:5}, {s:jumps} jumps, roots ({p:rootChance}).', s, b), 'Hits for about 371 damage for 6 seconds, 2 jumps, roots (20%).');
  assert.deepEqual(liveParts('{10} {t:5} {s:jumps} {p:rootChance}', s, b).filter(p => p.text.trim()).map(p => p.changed), [true, true, false, true]);
  assert.equal(liveText('{10} for {t:1}'), '10 times his damage for 1 second', 'no stats: the plain words');
  assert.ok(liveParts('{10} {t:5}', b, b).every(p => !p.changed), 'the same as the base: nothing changed');
  assert.deepEqual(tipParts('for {t:5}', s, b).parts, [{ text: 'for ' }, { text: '6 seconds', color: CHANGED_COLOR }]);
});

test('no ability text shows a raw mark, with stats or without', () => {
  const texts = [...Object.values(ULTIMATES).map(u => u.desc), ...HEROES.flatMap(h => [h.short, ...h.evolutions.flatMap(e => e.choices.map(c => c.short || ''))])];
  for (const t of texts) for (const s of [null, base('shaman'), { ...base('warlock'), duration: 1.3 }]) assert.ok(!/[{}]/.test(liveText(t, s, base('druid'))), t);
  assert.equal(liveText(hero('druid').short, null, base('druid')), 'Shoots thorny bolts that can root enemies in place (15%).');
  assert.equal(liveText(hero('shaman').short, more('shaman', 'jumps', 1), base('shaman')), 'Chain lightning that jumps to 3 more enemies.');
});

test('the seconds a text names are the seconds the game uses: the duration stat makes Frenzy, Mark and the Blizzard last longer', () => {
  const w = createWorld({ seed: 1, stage: 2, lineup: ['warrior', 'rogue', 'mage'] }); w.gold = 1e6;
  w.mods.push({ stat: 'duration', type: 'flat', value: 0.5, scope: ['all'] }); recalc(w);
  const free = tilesNearPath(w, 12), place = (id, k) => put(w, id, ...free[k]);
  const war = place('warrior', 0), rogue = place('rogue', 5), mage = place('mage', 10);
  const secs = (u, h) => +liveText(u.desc, h.s).match(/([\d.]+) seconds?/)[1];
  ULTIMATES.frenzy.onFire(w, war); assert.equal(war.buffs.find(b => b.id === 'frenzy').t, secs(ULTIMATES.frenzy, war));
  const e = enemyAt(w, 100, 100); ULTIMATES.mark.onFire(w, rogue); assert.equal(e.fx.mark.t, secs(ULTIMATES.mark, rogue));
  delete e.fx.mark; ULTIMATES.blizzard.onFire(w, mage); assert.equal(e.fx.freeze.t, secs(ULTIMATES.blizzard, mage));
  assert.equal(ultDesc(ULTIMATES.frenzy, war.s), '+50% damage and attack speed for 7.5 seconds.');
});

test('the Duration stat also makes what ultimates leave behind last longer: storms, holy ground, Enrage, the demon, Doom, Crescendo...', () => {
  const w = createWorld({ seed: 1, stage: 2, lineup: ['mage', 'druid', 'warlock', 'paladin', 'priest', 'ranger'].slice(0, 3) }); w.gold = 1e6;
  w.mods.push({ stat: 'duration', type: 'flat', value: 0.5, scope: ['all'] }); recalc(w);
  const free = tilesNearPath(w, 12), form = (id, f, k) => { const h = put(w, id, ...free[k]); h.def = evolvedDef(h.def, h.def.evolutions[0].choices.find(c => c.id === f)); w.statsFor(h); return h; };
  const mage = form('mage', 'lightningmage', 0), druid = form('druid', 'animalic', 4), lock = form('warlock', 'summoner', 8);
  const secs = (id, h) => +liveText(ULTIMATES[id].desc, h.s).match(/([\d.]+) seconds?/)[1];
  ULTIMATES.storm.onFire(w, mage); assert.equal(w.zones.find(z => z.type === 'storm').t, 4.5); assert.equal(secs('storm', mage), 4.5);
  ULTIMATES.enrage.onFire(w, druid); assert.equal(druid.rage, 9); assert.equal(secs('enrage', druid), 9);
  ULTIMATES.demongate.onFire(w, lock); assert.equal(lock.demon.t, 12); assert.equal(secs('demongate', lock), 12);
  ULTIMATES.doom.onFire(w, lock); assert.equal(lock.auraCurse.t, 6);
  ULTIMATES.orbit.onFire(w, mage); assert.equal(w.projs.find(p => p.type === 'orbit').t, 9);
});

test('everything with a duration: thorn patches, imps, totems, Momentum and the burn stagger last longer with the duration stat too', async () => {
  const { BEHAVIORS } = await import('../js/engine/behaviors.js'), { STEP } = await import('../js/engine/world.js');
  const w = createWorld({ seed: 1, stage: 2, lineup: ['druid', 'warlock', 'shaman'] }); w.gold = 1e6;
  w.mods.push({ stat: 'duration', type: 'flat', value: 0.5, scope: ['all'] }, { stat: 'momentum', type: 'flat', value: 0.01, scope: ['all'] }, { stat: 'stagger', type: 'flat', value: 0.2, scope: ['all'] }); recalc(w);
  const free = tilesNearPath(w, 12), form = (id, f, k) => { const h = put(w, id, ...free[k]); h.def = evolvedDef(h.def, h.def.evolutions[0].choices.find(c => c.id === f)); w.statsFor(h); h.cd = 0; return h; };
  const druid = form('druid', 'naturist', 0), lock = form('warlock', 'summoner', 4), sham = form('shaman', 'totemist', 8);
  for (const h of [druid, lock, sham]) enemyAt(w, h.x + 20, h.y, w.path.length * 40);
  for (const h of [druid, lock, sham]) BEHAVIORS[h.def.kind].update(w, h, STEP);
  assert.equal(w.zones.find(z => z.type === 'thorns').t, 2.25, 'thorns 1.5 s × 1.5');
  assert.equal(lock.imps[0].t, 15, 'an imp 10 s × 1.5'); assert.equal(w.zones.find(z => z.type === 'totem').t, 18, 'a totem 12 s × 1.5');
  assert.equal(liveText(hero('warlock').evolutions[0].choices.find(c => c.id === 'summoner').short, lock.s), 'Each cast summons an imp (up to 3, 15 seconds each) that throws small bolts at the enemies near it.');
  const e = enemyAt(w, druid.x + 20, druid.y); w.hit(druid, enemyAt(w, 0, 0, 0, 1), 10);
  assert.equal(druid.buffs.find(b => b.id === 'momentum').t, 6, 'Momentum 4 s × 1.5');
  inflict(w, druid, e, 'burn', 10); assert.ok(Math.abs(e.fx.stun.t - 0.3) < 1e-9, 'the stagger 0.2 s × 1.5');
});
