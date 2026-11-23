/* Match effects (the vote after waves 15, 30 and 45, and what each one does) and the act 5 maps' effects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, RELICS, RARITIES, T } from '../js/content/data.js';
import { MATCH_EFFECTS, MATCH_PICKS, FX_BASE } from '../js/content/match-effects.js';
import { MAP_EFFECTS, MAP_EFFECT_OF } from '../js/content/map-effects.js';
import { UNLOCKS } from '../js/content/unlocks.js';
import { createWorld, step, recalc, startWave } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { openVote, startEffect } from '../js/engine/match-effects.js';
import { updateMap } from '../js/engine/map-effects.js';
import { spawnEnemy, updateEnemies, waveCount, spawnDelay } from '../js/engine/enemies.js';
import { minRunSeconds } from '../js/content/rules.js';
import { relicMult } from '../js/engine/relics.js';
import { exportLog, replay, resume } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { worldOptions } from '../js/net/session.js';
import { richWorld, place, enemyAt, tilesNearPath, withTemp } from './helpers.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const fxWorld = (o = {}) => richWorld({ stage: 2, matchEffects: true, lineup: ['warrior', 'ranger', 'mage'], ...o });
const start = (w, id) => startEffect(w, id, recalc);
/* Opens the vote as if wave `wave` had just been cleared. */
const vote = (w, wave = 15) => { w.wave = wave; w.phase = 'build'; openVote(w); return w.vote; };

test('the vote: after waves 15, 30 and 45, from act 4, three different effects not had yet; solo it waits; none is a choice', () => {
  assert.equal(UNLOCKS.effects.act, 4); assert.deepEqual(MATCH_PICKS.waves, [15, 30, 45]); assert.equal(Object.keys(MATCH_EFFECTS).length, 10);
  const off = richWorld({ stage: 2 }); vote(off); assert.equal(off.vote, null, 'not unlocked');
  const w = fxWorld(); for (const x of [14, 16, 60]) assert.equal(vote(w, x), null);
  const v = vote(w); assert.equal(new Set(v.offers).size, 3);
  const t = w.tick; assert.equal(step(w), false); assert.equal(w.tick, t, 'paused');
  assert.equal(apply(w, { type: 'vote', index: 3 }).reason, 'bad index');
  const id = v.offers[1]; assert.ok(apply(w, { type: 'vote', index: 1 }).ok); assert.equal(w.vote, null); assert.deepEqual(w.effects, [id]); assert.equal(step(w), true);
  assert.ok(!vote(w, 30).offers.includes(id), 'not the same again'); apply(w, { type: 'vote', index: -1 }); assert.deepEqual(w.effects, [id], 'none');
  assert.equal(apply(w, { type: 'vote', index: 0 }).reason, 'no vote');
});

test('no vote when the last wave is cleared: level 1-1 ends at 15', () => {
  withTemp(STAGES[0], { waves: 15 }, () => { const w = createWorld({ seed: 1, stage: 1, matchEffects: true }); w.wave = 14; startWave(w); w.spawnLeft = 0; step(w); assert.equal(w.phase, 'over'); assert.equal(w.vote, null); });
  withTemp(STAGES[0], { waves: 16 }, () => { const w = createWorld({ seed: 1, stage: 1, matchEffects: true }); w.wave = 14; startWave(w); w.spawnLeft = 0; step(w); assert.ok(w.vote); });
});

test('co-op: everyone votes, the most win, the match goes on; a tie is drawn by lot; the time runs out; someone who left does not count', () => {
  const coop = n => { const w = createWorld(worldOptions({ seed: 4, stage: 2, matchEffects: true, players: Array.from({ length: n }, (_, i) => ({ lineup: [['warrior', 'ranger', 'mage'][i]] })) })); return w; };
  { const w = coop(3), v = vote(w), o = [...v.offers]; assert.equal(step(w), true, 'not paused');
    apply(w, { type: 'vote', index: 2, p: 0 }); apply(w, { type: 'vote', index: 0, p: 1 }); apply(w, { type: 'vote', index: 0, p: 0 }); assert.ok(w.vote, 'a vote can be changed, and the third is missing');
    apply(w, { type: 'vote', index: 1, p: 2 }); assert.deepEqual(w.effects, [o[0]]); }
  { const w = coop(2), o = [...vote(w).offers]; apply(w, { type: 'vote', index: 0, p: 0 }); apply(w, { type: 'vote', index: 2, p: 1 }); assert.ok([o[0], o[2]].includes(w.effects[0])); }
  { const w = coop(2); vote(w); for (let k = 0; k < MATCH_PICKS.seconds * 60 + 2; k++) step(w); assert.equal(w.vote, null); assert.deepEqual(w.effects, [], 'nobody voted'); }
  { const w = coop(2), o = [...vote(w).offers]; apply(w, { type: 'vote', index: 1, p: 0 }); for (let k = 0; k < MATCH_PICKS.seconds * 60 + 2; k++) step(w); assert.deepEqual(w.effects, [o[1]], 'the votes there are'); }
  { const w = coop(2), o = [...vote(w).offers]; apply(w, { type: 'vote', index: 1, p: 0 }); apply(w, { type: 'leave', p: 1 }); step(w); assert.deepEqual(w.effects, [o[1]]); }
});

test('hero modifiers: Glass cannon, Adrenaline, Overcharge, Long shot, Precision', () => {
  const ratio = (id, k) => { const w = fxWorld(), h = place(w, k === 'castSpeed' ? 'mage' : 'ranger', ...tilesNearPath(w, 1)[0]), b = h.s[k]; start(w, id); return k === 'critChance' ? h.s[k] - b : h.s[k] / b; };
  for (const [id, k, want] of [['glass', 'damage', 1.4], ['adrenaline', 'speed', 1.25], ['adrenaline', 'castSpeed', 1.25], ['overcharge', 'energyPerSecond', 1.5], ['longshot', 'range', 1.3], ['longshot', 'speed', 0.85], ['precision', 'critChance', 0.25]])
    assert.ok(near(ratio(id, k), want), id + ' ' + k);
});

test('the bad sides: lives, enemy speed, wave gold, plain hits, direct hits, basic attacks', () => {
  { const w = fxWorld(), leak = () => { const l = w.lives, e = enemyAt(w, 0, 0, (w.path.length - 1.01) * T, 10); e.speed = 50; updateEnemies(w, 0.1); w.enemies.length = 0; return l - w.lives; }; assert.equal(leak(), 1); start(w, 'glass'); assert.equal(leak(), 2); }
  { const w = fxWorld(); w.wave = 5; const a = spawnEnemy(w, 'grunt').speed; start(w, 'adrenaline'); assert.ok(near(spawnEnemy(w, 'grunt').speed / a, 1.2)); }
  { const w = fxWorld(); const kill = () => { const g = w.gold; w.hit(null, enemyAt(w, 0, 0, 0, 1, 'boss'), 9); return w.gold - g; }, a = kill(); start(w, 'bloodmoney'); assert.ok(near(kill() / a, 1.6, 0.02));
    w.mods.push({ stat: 'interest', type: 'flat', value: 1, scope: 'global' }, { stat: 'interestCap', type: 'flat', value: 50, scope: 'global' }); recalc(w); w.wave = 3; startWave(w); w.spawnLeft = 0; const g = w.gold; step(w); assert.equal(w.gold, g, 'no wave gold, no interest'); }
  const hit = (w, h, roll = 0.99) => { w.rng.combat.next = () => roll; const e = enemyAt(w, h.x + 10, h.y); w.attack(h, e); w.enemies.length = 0; return e.max - e.hp; };
  { const w = fxWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]), a = hit(w, h); start(w, 'precision'); assert.ok(near(hit(w, h) / a, 0.8)); assert.ok(hit(w, h, 0) > a, 'a crit is whole'); }
  { const w = fxWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]), a = hit(w, h), dot = () => { const e = enemyAt(w, 0, 0); w.dot(h, e, 10, 'fire'); return e.max - e.hp; }, b = dot(); start(w, 'slowburn'); assert.ok(near(hit(w, h) / a, 0.85)); assert.ok(near(dot() / b, 1.6)); }
  { const w = fxWorld(), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]); assert.equal(w.attackMult(h), 1); start(w, 'overcharge'); assert.equal(w.attackMult(h), 0.8); h.energy = h.s.energyMax; assert.ok(w.attackMult(h) >= 1, 'not the ultimate'); }
});

test('Giants: half as many with 2.3x life, twice the gold and XP, and the wave takes as long (the server\'s minimum run time still holds)', () => {
  const w = fxWorld(); w.wave = 9; const a = spawnEnemy(w, 'grunt').max, boss = spawnEnemy(w, 'boss').max; w.enemies.length = 0;
  start(w, 'giants'); assert.ok(near(spawnEnemy(w, 'grunt').max / a, 2.3, 0.01)); assert.equal(spawnEnemy(w, 'boss').max, boss, 'not bosses'); w.enemies.length = 0;
  startWave(w); assert.equal(w.spawnLeft, Math.ceil(waveCount(10) / 2)); let spawned = 0, ticks = 0; while (w.spawnLeft > 0) { const n = w.spawnLeft; step(w); ticks++; if (w.spawnLeft < n) spawned++; w.lives = 99; }
  assert.equal(spawned, Math.ceil(waveCount(10) / 2)); assert.ok(ticks / 60 > (waveCount(10) - 3) * spawnDelay(10) * 0.9, 'as long as ever');
  assert.ok(ticks / 60 / 3 > minRunSeconds(10) - minRunSeconds(9), 'even at 3x speed');
  const h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]), x0 = h.xp, lv = h.level; w.hit(null, enemyAt(w, 0, 0, 0, 1), 9); assert.ok(h.xp - x0 === 2 || h.level > lv);
});

test('Fine taste: only Epic relics, 35% weaker from now on; what was there stays, and a weak one is taken back exactly', () => {
  const w = fxWorld(), p = w.players[0], h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]);
  apply(w, { type: 'buyRelic' }); apply(w, { type: 'choose', index: 0 }); const old = { ...p.relics[0] }, before = JSON.stringify(h.s);
  start(w, 'finetaste'); assert.deepEqual(p.relics[0], old); assert.equal(JSON.stringify(h.s), before);
  apply(w, { type: 'buyRelic' }); assert.ok(w.pick.offers.every(o => o.ri === 3)); apply(w, { type: 'reroll' }); assert.ok(w.pick.offers.every(o => o.ri === 3));
  apply(w, { type: 'choose', index: 0 }); const r = p.relics[1]; assert.equal(r.k, 0.65); assert.ok(near(relicMult(r), RARITIES[3].mult * 0.65));
});

test('Melting pot: every relic becomes Common and each rarity lost is +6% damage; one-time relics and later ones are left alone', () => {
  const w = fxWorld(), p = w.players[0], h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]), base = h.s.damage;
  const give = (name, ri) => { const d = RELICS.find(r => r.name === name); for (const x of d.mods ? d.mods(RARITIES[ri].mult) : []) p.mods.push({ ...x, source: name, ri }); p.relics.push({ name, r: ri }); recalc(w); };
  give('Long barrels', 3); give('Keen edge', 1); give('Fine arrows', 0); give('Reinforced gate', 2);
  start(w, 'meltingpot');
  assert.deepEqual(p.relics.map(r => [r.name, r.r]).sort(), [['Fine arrows', 0], ['Keen edge', 0], ['Long barrels', 0], ['Reinforced gate', 2]]);
  assert.ok(near(h.s.damage / base, 1 + 0.06 * 4)); assert.equal(p.mods.filter(m => m.source === 'Long barrels').length, 1);
  give('Keen edge', 2); assert.equal(p.relics.at(-1).r, 2);
});

test('every effect says both sides, and its flags are ones the engine reads', () => {
  for (const [id, e] of Object.entries(MATCH_EFFECTS)) { assert.ok(e.name && e.good && e.bad, id); for (const k in e.flags || {}) assert.ok(k in FX_BASE, id + ' ' + k); }
  for (const e of Object.values(MAP_EFFECTS)) for (const k in e.flags || {}) assert.ok(k in FX_BASE, k);
});

/* ---- Maps ---- */
test('act 5: each level has its own map effect; the others have none', () => {
  assert.deepEqual(STAGES.filter(s => MAP_EFFECT_OF[s.n]).map(s => s.code), ['5-1', '5-2', '5-3', '5-4', '5-5']); assert.equal(new Set(Object.values(MAP_EFFECT_OF)).size, 5);
  assert.equal(createWorld({ stage: 20 }).mapEffect, null); assert.equal(createWorld({ stage: 25 }).mapEffect, 'overgrown');
});
test('Mud and Fog change speeds and range', () => {
  const at = id => { const w = richWorld({ stage: 2, mapEffect: id, lineup: ['ranger', 'mage'] }); w.wave = 5; const t = tilesNearPath(w, 2), h = place(w, 'ranger', ...t[0]), c = place(w, 'mage', ...t[1]); return { v: spawnEnemy(w, 'grunt').speed, s: { ...h.s, castSpeed: c.s.castSpeed } }; };
  const n = at(null), m = at('mud'), f = at('fog');
  assert.ok(near(m.v / n.v, 0.85) && near(m.s.speed / n.s.speed, 0.9) && near(m.s.castSpeed / n.s.castSpeed, 0.9)); assert.ok(near(f.v / n.v, 0.9) && near(f.s.range / n.s.range, 0.8));
});
test('Ley lines: 4 tiles; a hero on one hits harder, the others a little less, also after moving and swapping', () => {
  const w = richWorld({ stage: 2, mapEffect: 'ley', lineup: ['warrior', 'ranger'] }); assert.equal(w.ley.length, 4);
  assert.ok(w.ley.every(([x, y]) => !w.pathSet.has(x + ',' + y))); assert.deepEqual(w.ley, createWorld({ seed: 1, stage: 2, mapEffect: 'ley' }).ley, 'the same for the same seed');
  const off = tilesNearPath(w, 12).find(([x, y]) => !w.ley.some(t => t[0] === x && t[1] === y)), a = place(w, 'warrior', ...w.ley[0]), b = place(w, 'ranger', ...off), plain = a.s.damage / 1.3;
  assert.ok(near(b.s.damage, b.s.damage)); apply(w, { type: 'move', id: a.id, cx: off[0], cy: off[1] });   /* swaps */
  assert.ok(near(a.s.damage, plain * 0.95)); const one = b.s.damage; apply(w, { type: 'move', id: b.id, cx: off[0], cy: off[1] }); assert.ok(near(b.s.damage / one, 0.95 / 1.3)); assert.ok(near(a.s.damage, plain * 1.3));
});
test('Storm: every 8 s of a wave it hurts 3 enemies and stuns a hero', () => {
  const w = richWorld({ stage: 2, mapEffect: 'storm', lineup: ['warrior'] }), h = place(w, 'warrior', ...tilesNearPath(w, 1)[0]); for (let k = 0; k < 5; k++) enemyAt(w, 0, 0, 5, 1000);
  updateMap(w, 20); assert.ok(w.enemies.every(e => e.hp === 1000), 'not between waves'); w.phase = 'wave'; updateMap(w, 7.9); assert.ok(!h.stun); updateMap(w, 0.2);
  assert.equal(w.enemies.filter(e => e.hp < 1000).length, 3); assert.ok(w.enemies.some(e => near(e.hp, 950))); assert.equal(h.stun, 1);
});
test('Overgrown: the tiles beside the road cannot be used (heroes, ground effects, totems); melee heroes reach further', () => {
  const w = richWorld({ stage: 2, mapEffect: 'overgrown', shop: true, lineup: ['warrior', 'ranger', 'shaman'] }), plain = richWorld({ stage: 2, lineup: ['warrior', 'ranger'] });
  const beside = tilesNearPath(w, 6); for (const [cx, cy] of beside) { assert.equal(apply(w, { type: 'place', hero: 'warrior', cx, cy }).reason, 'blocked'); assert.equal(apply(w, { type: 'buyTile', effect: 'greed', cx, cy }).reason, 'blocked'); }
  let t; for (let y = 0; y < 8 && !t; y++) for (let x = 0; x < 12 && !t; x++) if (!w.pathSet.has(x + ',' + y) && !w.noBuild.has(x + ',' + y)) t = [x, y];
  const h = place(w, 'warrior', ...t), o = place(plain, 'warrior', ...tilesNearPath(plain, 1)[0]); assert.ok(near(h.s.range / o.s.range, 1.5));
  assert.equal(apply(w, { type: 'move', id: h.id, cx: beside[0][0], cy: beside[0][1] }).reason, 'blocked');
  for (const s of [21, 22, 23, 24, 25]) { const x = createWorld({ stage: s, mapEffect: 'overgrown' }); let free = 0; for (let k = 0; k < 96; k++) { const c = (k % 12) + ',' + (k / 12 | 0); if (!x.pathSet.has(c) && !x.noBuild.has(c)) free++; } assert.ok(free >= 10, 'level ' + s + ' has room: ' + free); }
});

test('matches with effects and maps replay and resume exactly', () => {
  for (const [map, seed] of [['storm', 3], ['ley', 5], ['overgrown', 8], [null, 2]]) withTemp(STAGES[1], { hpMult: 0.15, growth: 1.05, waves: 48 }, () => {
    const w = createWorld({ seed, stage: 2, matchEffects: true, mapEffect: map, shop: true, lineup: ['warrior', 'ranger', 'mage'] }); let mid = null;
    for (let k = 0; k < 60 * 4000 && w.phase !== 'over'; k++) {
      if (w.vote && !w.coop) { if (w.effects.length === 1 && !mid) mid = { log: exportLog(w), hash: hashWorld(w) }; apply(w, { type: 'vote', index: w.effects.length % 3 }); }
      for (const id of w.lineup) if (!w.heroes.some(h => h.base.id === id)) search: for (let x = 2; x < 12; x++) for (let y = 0; y < 8; y++) if (apply(w, { type: 'place', hero: id, cx: x, cy: y }).ok) break search;
      if (w.phase === 'build' && !w.vote) apply(w, { type: 'wave' });
      if (k % 900 === 0) { apply(w, { type: 'buyRelic' }); if (w.pick) apply(w, { type: 'choose', index: 0 }); apply(w, { type: 'gamble' }); }
      step(w);
    }
    assert.ok(w.effects.length >= 1, map + ': wave ' + w.wave); assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), String(map));
    if (mid) assert.equal(hashWorld(resume(mid.log)), mid.hash, 'a run saved in the middle of a vote');
  });
});
