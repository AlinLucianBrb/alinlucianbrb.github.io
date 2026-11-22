/* Special enemies (stunner, regenerator, unstoppable, summoner, ironhide) and the limit on how long an enemy can be held. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, T } from '../js/content/data.js';
import { SPECIALS, specialsOf, killCap } from '../js/content/rules.js';
import { ENEMIES, CC, ccResFor, spawnEnemy, waveEnemyType, waveCount, updateEnemies, isBossWave } from '../js/engine/enemies.js';
import { ABILITIES, isShielded, updateAbilities } from '../js/engine/enemy-abilities.js';
import { applyEffect } from '../js/engine/effects.js';
import { execute } from '../js/engine/combat.js';
import { createWorld, step } from '../js/engine/world.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { apply } from '../js/engine/commands.js';
import { richWorld, tilesNearPath, place, enemyAt, withTemp } from './helpers.mjs';

const STEP = 1 / 60;
const typesOf = (wave, stage) => { const out = []; for (let i = waveCount(wave); i >= 1; i--) out.push(waveEnemyType(wave, i, stage)); return out; };
/* A special enemy of wave `wave`, `along` px down the path. */
function special(w, type, wave = 10, along = 4 * T) { w.wave = wave; return spawnEnemy(w, type, along); }

test('the special enemies come on their waves, replacing some of the wave (its size and its boss stay)', () => {
  const want = { stunner: [7, 27, 47], tough: [13, 43], immune: [18, 28, 38], regener: [22, 52], summoner: [27] };
  const stage = STAGES[4], seen = {};
  for (let wv = 1; wv <= 55; wv++) {
    const types = typesOf(wv, stage);
    assert.equal(types.length, waveCount(wv));
    assert.equal(types.at(-1) === 'boss', isBossWave(wv, stage), 'wave ' + wv);
    for (const id of Object.keys(SPECIALS)) {
      const n = types.filter(t => t === id).length;
      if (n) { (seen[id] ||= []).push(wv); assert.equal(n, SPECIALS[id].count, id + ' on wave ' + wv); }
    }
    assert.ok(!types.includes('minion'), 'minions are only ever summoned');
  }
  assert.deepEqual(Object.fromEntries(Object.entries(seen).sort()), Object.fromEntries(Object.entries(want).sort()));
  assert.equal(specialsOf(27).length, SPECIALS.stunner.count + SPECIALS.summoner.count, 'two kinds share wave 27');
  for (const [id, d] of Object.entries(ENEMIES)) if (d.ability) assert.ok(ABILITIES[d.ability.id], id + "'s ability exists");
});

test('Stunner: stuns the nearest hero in range, who does nothing until it wears off, then waits for its cooldown', () => {
  const w = richWorld(), t = tilesNearPath(w, 12), near = place(w, 'warrior', ...t[2]), far = place(w, 'ranger', ...t[9]);
  const e = special(w, 'stunner'), a = e.def.ability;
  e.speed = 0; e.x = near.x + 20; e.y = near.y; far.x = near.x + 60; far.y = near.y;
  updateAbilities(w, a.first - 0.1); assert.ok(!near.stun, 'not at once');
  updateAbilities(w, 0.2);
  assert.equal(near.stun, a.seconds); assert.ok(!far.stun, 'only the nearest one');
  const hp = e.hp; far.x = far.y = 9999;
  for (let k = 0; k < (a.seconds - 0.1) * 60; k++) step(w);
  assert.equal(e.hp, hp, 'a stunned hero does not attack');
  for (let k = 0; k < 60; k++) step(w);
  assert.ok(e.hp < hp, 'it attacks again afterwards'); assert.ok(!(near.stun > 0), 'and the Stunner is still recovering');
  e.x = e.y = -9999; e.ab.cd = 0; updateAbilities(w, 0.1); assert.ok(!(near.stun > 0), 'out of range');
});

test('Regenerator: heals all the time, faster the more life it is missing, never above its maximum', () => {
  const w = richWorld(), e = special(w, 'regener'), gain = share => { e.hp = e.max * share; updateAbilities(w, 0.1); return e.hp - e.max * share; };
  const a = gain(0.9), b = gain(0.5), c = gain(0.1);
  assert.ok(a > 0 && b > a && c > b);
  e.hp = e.max - 0.001; updateAbilities(w, 1); assert.equal(e.hp, e.max);
  e.hp = 0; e.dead = true; updateAbilities(w, 1); assert.equal(e.hp, 0, 'not once dead');
});

test('Unstoppable: cannot be frozen, rooted or stunned, but still slows and burns', () => {
  const w = richWorld(), e = special(w, 'immune');
  for (const id of ['freeze', 'root', 'stun']) { applyEffect(e, id, 1); assert.ok(!e.fx || !e.fx[id], id); }
  applyEffect(e, 'chill', 1); applyEffect(e, 'burn', { t: 1, dps: 1 });
  assert.ok(e.fx.chill && e.fx.burn);
});

test('Summoner: calls minions ahead of it and cannot be hurt while one lives; minions give nothing', () => {
  const w = richWorld(), e = special(w, 'summoner', 27), a = e.def.ability;
  assert.ok(!isShielded(e), 'it can be hurt before its first minions'); w.hit(null, e, 1); assert.equal(e.hp, e.max - 1);
  updateAbilities(w, a.first);
  const minions = w.enemies.filter(x => x.type === 'minion');
  assert.equal(minions.length, a.count); assert.ok(minions.every(m => m.d > e.d), 'ahead of it');
  assert.ok(isShielded(e)); w.hit(null, e, 1e9); assert.ok(!e.dead && e.hp === e.max - 1, 'no damage');
  e.hp = 1; assert.equal(execute(w, { def: {} }, e, 0.5), false, 'nor executed'); e.hp = e.max;
  const { gold, kills } = w;
  for (const m of minions) w.hit(null, m, 1e9);
  assert.deepEqual([w.gold, w.kills], [gold, kills], 'no gold, not a kill: the server only counts the wave itself');
  assert.ok(!isShielded(e));
  for (let k = 1; k < a.casts; k++) { updateAbilities(w, a.cooldown); for (const m of e.brood) w.hit(null, m, 1e9); }
  w.enemies.length = 1; updateAbilities(w, a.cooldown * 3); assert.equal(w.enemies.length, 1, 'it stops after ' + a.casts + ' times');
  w.hit(null, e, 1e9); assert.ok(e.dead); assert.equal(w.kills, kills + 1);
});

test('a summoner near the gate does not put its minions past it', () => {
  const w = richWorld(), e = special(w, 'summoner', 27, 0);
  e.d = (w.path.length - 1.2) * T; updateAbilities(w, 5);
  assert.ok(e.brood.length && e.brood.every(m => m.d <= (w.path.length - 2) * T));
});

test('Ironhide: far more life and defenses than a grunt, at normal speed', () => {
  const w = richWorld(), g = special(w, 'grunt', 13), t = special(w, 'tough', 13);
  assert.ok(t.max >= g.max * 3 && t.armor > g.armor * 2); assert.equal(t.speed, g.speed);
});

test('no enemy can be held forever: freeze, root and stun together last at most the limit in each interval', () => {
  const w = richWorld(), e = enemyAt(w, 0, 0); e.ccRes = 0; e.speed = 10;
  let held = 0;
  for (let k = 0; k < CC.interval * 60 * 2; k++) {
    for (const id of ['freeze', 'root', 'stun']) applyEffect(e, id, 1);
    const d = e.d; updateEnemies(w, STEP); if (e.d === d) held += STEP;
  }
  assert.ok(Math.abs(held - CC.hold * 2) < 0.1, 'held ' + held.toFixed(2) + ' s of ' + CC.interval * 2);
  e.hold = null; e.fx = null; applyEffect(e, 'freeze', 1); assert.ok(e.fx.freeze, 'a fresh interval: it can be held again');
});

test('crowd control resistance shortens the limit; it grows with the wave and the level, and bosses start with some', () => {
  const heldFor = res => { const w = richWorld(), e = enemyAt(w, 0, 0); e.ccRes = res; e.speed = 10; let n = 0;
    for (let k = 0; k < CC.interval * 60 - 2; k++) { applyEffect(e, 'freeze', 1); const d = e.d; updateEnemies(w, STEP); if (e.d === d) n += STEP; } return n; };
  assert.ok(Math.abs(heldFor(0.5) - CC.hold * 0.5) < 0.1);
  assert.equal(ccResFor(ENEMIES.grunt, 1, 1), 0);
  assert.ok(ccResFor(ENEMIES.grunt, 55, 5) > ccResFor(ENEMIES.grunt, 55, 1) && ccResFor(ENEMIES.grunt, 55, 1) > ccResFor(ENEMIES.grunt, 10, 1));
  assert.ok(ccResFor(ENEMIES.boss, 1, 1) > 0); assert.equal(ccResFor(ENEMIES.boss, 1e6, 25), CC.max, 'capped');
  const w = richWorld({ stage: 5 }); w.wave = 30; assert.equal(spawnEnemy(w, 'grunt').ccRes, ccResFor(ENEMIES.grunt, 30, 5));
});

test('a match that meets every special enemy replays exactly', () => {
  withTemp(STAGES[1], { hpMult: 0.15, growth: 1.16, waves: 28 }, () => {
    const w = createWorld({ seed: 11, stage: 2 }), t = tilesNearPath(w, 12), seen = new Set(); let stunned = 0;
    w.ev.on('heroStun', () => stunned++);
    for (const [k, id] of ['warrior', 'ranger', 'mage'].entries()) place(w, id, ...t[k * 4]);
    for (let k = 0; k < 60 * 2400 && w.phase !== 'over'; k++) {
      if (w.phase === 'build') apply(w, { type: 'wave' });
      step(w);
      for (const e of w.enemies) seen.add(e.type);
    }
    assert.ok(w.wave >= 27, 'got to wave ' + w.wave);
    for (const id of Object.keys(ENEMIES)) assert.ok(seen.has(id) || ENEMIES[id].boss, id + ' came');
    assert.ok(stunned > 0, 'heroes were stunned');
    assert.ok(w.kills <= killCap(w.wave), 'never more kills than the server accepts');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w));
  });
});
