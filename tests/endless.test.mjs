/* Endless: one per zone after the last level; its waves, bosses, defenses, map vote, match effects, ending, item brackets, and
   the server's side of it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES, ENDLESS, LEVELS, LATER, stageDef, stageLabel, stageOpen, T } from '../js/content/data.js';
import { ENDLESS_RULES, endlessBracket, specialsOf, SPECIALS, isBossWave, killCap } from '../js/content/rules.js';
import { MAP_EFFECTS } from '../js/content/map-effects.js';
import { MATCH_PICKS } from '../js/content/match-effects.js';
import { maxSpeed } from '../js/content/unlocks.js';
import { rulesSql } from '../tools/rules-sql.mjs';
import { MAPS } from '../js/content/maps.js';
import { createWorld, step, startWave } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { spawnEnemy, waveEnemyType, waveCount, bossWavesUpTo, updateEnemies } from '../js/engine/enemies.js';
import { openVote } from '../js/engine/match-effects.js';
import { exportLog, replay, resume } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { worldOptions } from '../js/net/session.js';
import { tilesNearPath, withTemp } from './helpers.mjs';

const near = (a, b, e) => Math.abs(a - b) < e;
const endless = (o = {}) => createWorld({ seed: 3, stage: 26, matchEffects: true, lineup: ['warrior', 'ranger', 'mage'], ...o });
const chosen = (o = {}) => { const w = endless(o); apply(w, { type: 'vote', index: 0 }); return w; };
const sql = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('one endless per zone, open once 5-5 is beaten; the campaign is still 25 levels', () => {
  assert.equal(STAGES.length, 25); assert.deepEqual(ENDLESS.map(e => [e.n, e.zone]), [[26, 1], [27, 2], [28, 3], [29, 4], [30, 5]]);
  assert.equal(stageDef(25).code, '5-5'); assert.equal(stageDef(31), null); assert.equal(stageLabel(28), 'Endless · Mire'); assert.equal(stageLabel(3), 'Level 1-3');
  assert.ok(!stageOpen(26, 24) && stageOpen(26, 25) && stageOpen(30, 25) && !stageOpen(31, 25)); assert.ok(stageOpen(25, 24) && !stageOpen(25, 23));
  assert.equal(maxSpeed(25, true), 3); assert.equal(maxSpeed(25), 2);
});

test('each run is on one of its zone\'s maps', () => {
  for (const e of ENDLESS) {
    const seen = new Set();
    for (let seed = 1; seed <= 30; seed++) { const key = JSON.stringify(createWorld({ seed, stage: e.n }).path), i = MAPS.findIndex(m => JSON.stringify(m) === key); assert.ok(i >= (e.zone - 1) * 5 && i < e.zone * 5, 'zone ' + e.zone + ' map ' + i); seen.add(i); }
    assert.ok(seen.size >= 3, 'not always the same');
  }
});

test('the next step after 5-5: tougher at the start and at wave 55, and growing on; defenses go on to 99%', () => {
  const hp = (s, w) => 20 * s.hpMult * s.growth ** (w - 1), a = STAGES[24], e = ENDLESS[0];
  assert.ok(near(hp(e, 1) / hp(a, 1), LATER.firstWave, 0.01)); assert.ok(near(hp(e, 55) / hp(a, 55), LATER.lastWave, 0.02)); assert.ok(hp(e, 100) > hp(e, 55) * 50);
  const w = chosen(), def = (type, wave) => { w.wave = wave; const x = spawnEnemy(w, type); w.enemies.length = 0; return x; };
  assert.ok(near(def('grunt', 55).armor, 0.6, 0.03)); assert.equal(def('grunt', 120).armor, 0.99); assert.equal(def('boss', 80).res.fire, 0.99); assert.equal(def('grunt', 900).ccRes, 0.9);
  assert.equal(createWorld({ stage: 25 }).stage.tier, undefined); assert.deepEqual(ENDLESS.map(x => x.growth), Array(5).fill(e.growth), 'the same in every zone');
});

test('a boss every 10 waves, last of its wave; the special enemies again every 55', () => {
  const e = ENDLESS[2];
  for (let w = 1; w <= 130; w++) { assert.equal(isBossWave(w, e), w % 10 === 0); assert.equal(waveEnemyType(w, 1, e) === 'boss', w % 10 === 0); }
  assert.equal(isBossWave(0, e), false); assert.deepEqual([9, 10, 99, 500].map(n => bossWavesUpTo(e, n)), [0, 1, 9, 50]);
  for (const w of [7, 22, 27, 43]) { assert.deepEqual(specialsOf(w + 55, e), specialsOf(w, e)); assert.deepEqual(specialsOf(w, e), specialsOf(w)); assert.equal(specialsOf(w + 55).length, 0, 'not in the campaign'); }
  const types = w => { const l = []; for (let i = waveCount(w); i >= 1; i--) l.push(waveEnemyType(w, i, e)); return l; };
  assert.equal(types(62).filter(t => t === 'stunner').length, SPECIALS.stunner.count); assert.equal(types(62).length, waveCount(62));
});

test('before wave 1 the map effect is chosen: three offers, no none; nothing can be placed or started until then', () => {
  const w = endless(), v = w.vote; assert.equal(v.kind, 'map'); assert.equal(new Set(v.offers).size, 3); assert.ok(v.offers.every(id => MAP_EFFECTS[id]));
  const t = tilesNearPath(w, 1)[0]; assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: t[0], cy: t[1] }).reason, 'vote'); assert.ok(!apply(w, { type: 'wave' }).ok); assert.equal(step(w), false);
  assert.equal(apply(w, { type: 'vote', index: -1 }).reason, 'bad index'); assert.ok(apply(w, { type: 'vote', index: 2 }).ok);
  assert.equal(w.mapEffect, v.offers[2]); assert.equal(w.vote, null); assert.equal(step(w), true);
  assert.equal(createWorld({ stage: 26, mapEffect: 'mud' }).vote, null, 'already given');
  const c = createWorld(worldOptions({ seed: 9, stage: 27, matchEffects: true, players: [{ lineup: ['warrior'] }, { lineup: ['ranger'] }] })), offers = [...c.vote.offers];
  for (const p of c.players) p.auto = true;
  for (let k = 0; k < MATCH_PICKS.seconds * 60 - 10; k++) step(c); assert.equal(c.wave, 0, 'Auto-start waits for the vote'); for (let k = 0; k < 30; k++) step(c);
  assert.ok(offers.includes(c.mapEffect), 'nobody voted: by lot');
});

test('match effects after waves 10, 20 and 30 (the campaign\'s stay at 15, 30 and 45)', () => {
  const w = chosen(), opens = wave => { w.vote = null; w.wave = wave; openVote(w); return !!w.vote; };
  assert.deepEqual([10, 15, 20, 30, 40, 45].map(opens), [true, false, true, true, false, false]);
  const c = createWorld({ stage: 2, matchEffects: true }); c.wave = 10; openVote(c); assert.equal(c.vote, null); c.wave = 15; openVote(c); assert.ok(c.vote);
});

test('endless is never won: it goes on past 55, a boss that gets through costs lives, and it ends with the lives or by retiring', () => {
  const w = chosen(), ends = []; w.ev.on('end', e => ends.push(e));
  w.wave = 59; startWave(w); w.spawnLeft = 1; w.spawnT = 0; step(w); const boss = w.enemies.find(e => e.def.boss); assert.ok(boss);
  boss.d = (w.path.length - 1.01) * T; boss.speed = 60; updateEnemies(w, 0.1); assert.notEqual(w.phase, 'over'); w.spawnLeft = 0; for (let k = 0; k < 3; k++) step(w); assert.equal(w.phase, 'build', 'the next one comes');
  assert.ok(apply(w, { type: 'retire' }).ok); assert.equal(w.phase, 'over'); assert.equal(w.won, false); assert.equal(ends.length, 0); step(w); assert.deepEqual(ends, [{ won: false }], 'sent once the command is in the log');
  step(w); assert.equal(ends.length, 1); assert.equal(apply(w, { type: 'retire' }).reason, 'over');
  assert.equal(apply(createWorld({ stage: 3 }), { type: 'retire' }).reason, 'not in this match');
  const x = chosen(); x.wave = ENDLESS_RULES.maxWaves - 1; startWave(x); x.spawnLeft = 0; step(x); assert.equal(x.phase, 'over'); assert.equal(x.won, false);
});

test('items drop in the bracket reached: 500 waves give 475 to 500, and never below 75', () => {
  for (const [w, b] of [[500, [475, 500]], [501, [500, 501]], [510, [500, 510]], [525, [500, 525]], [100, [75, 100]], [101, [100, 101]], [60, [75, 75]], [1, [75, 75]], [80, [75, 80]]]) assert.deepEqual(endlessBracket(w), b, 'wave ' + w);
});

/* The SQL formula of rule_endless_level, step by step as the database does it (integer division). */
const sqlLevel = (w, roll) => { const low = 25 * (Math.trunc((w + 24) / 25) - 1), lo = Math.max(75, low), hi = Math.max(75, Math.min(w, low + 25)); return lo + Math.floor(roll * (hi - lo + 1)); };
test('the server: the same brackets, bosses and stages; runs are started, checked, recorded and ranked', () => {
  for (let w = 1; w <= 1000; w++) { const [lo, hi] = endlessBracket(w); assert.equal(sqlLevel(w, 0), lo, 'wave ' + w); assert.equal(sqlLevel(w, 0.999999), hi, 'wave ' + w); }
  for (const f of ['supabase-setup.sql', 'supabase-update.sql']) {
    const s = sql(f);
    assert.ok(s.includes('25 * ((p_waves + 24) / 25 - 1)') && s.includes('greatest(75, low), greatest(75, least(p_waves, low + 25))') && s.includes('lo + floor(p_roll * (hi - lo + 1))'), f);
    assert.ok(s.includes('select p_stage between 26 and 30') && rulesSql(false).includes('when public.rule_is_endless(p_stage) then p_cleared >= 25 else p_stage <= p_cleared + 1'), f);
    assert.ok(s.includes('when public.rule_is_endless(p_stage) then p_waves / 10 else') && s.includes('when p_stage > 25 then 1000 else (array['), f);
    assert.equal(s.match(/if not public\.rule_stage_open\(p_stage, me\.levels_cleared\) then raise exception 'stage locked'/g).length, 3, f + ': start_run, create_lobby, set_lobby_stage');
    assert.ok(!/p_stage > me\.levels_cleared \+ 1/.test(s), f + ': no old check left');
    const fin = s.slice(s.indexOf('create function public.finish_run('), s.indexOf('-- ===== Selling items'));
    for (const t of ["if p_won and (endless or p_waves <> cap)", 'endless := public.rule_is_endless(r.stage);', 'frontier := (not endless and', 'if endless then chance := p_bosses * b_loot; end if;', 'if endless then il := public.rule_endless_level(p_waves, random()::numeric); end if;',
      'endless_wave = case when endless then greatest(endless_wave, p_waves)', 'endless_wave = greatest(x.endless_wave, excluded.endless_wave)', 'when not endless and r.stage = x.levels_cleared + 1']) assert.ok(fin.includes(t), f + ': ' + t);
    assert.ok(fin.indexOf('endless := ') < fin.indexOf('if p_won and (endless'), f + ': set before it is used');
    assert.ok(s.includes('grant execute on function public.get_endless_board(int, int) to anon, authenticated;'), f);
    assert.ok(s.includes('alter table public.records add column if not exists endless_wave int not null default 0'), f); assert.ok(/endless_wave int not null default 0/.test(s.slice(0, 4000)), f + ': on profiles');
    for (const fn of ['rule_is_endless(int)', 'rule_stage_open(int, int)', 'rule_endless_level(int, numeric)']) assert.ok(s.includes('revoke all on function public.' + fn + ' from public'), f + ' ' + fn);
    assert.ok(s.indexOf('function public.rule_is_endless(') < s.indexOf('function public.rule_stage_open(') && s.indexOf('function public.rule_stage_waves(') < s.indexOf('function public.rule_boss_cap('), f + ': defined before use');
  }
});

test('an endless match replays, resumes and stays within what the server accepts', () => {
  for (const [n, seed] of [[0, 2], [4, 5]]) withTemp(ENDLESS[n], { hpMult: 0.25, growth: 1.05 }, () => {
    const w = createWorld({ seed, stage: ENDLESS[n].n, matchEffects: true, shop: true, lineup: ['warrior', 'ranger', 'mage'] }); let mid = null;
    for (let k = 0; k < 60 * 1500 && w.phase !== 'over' && w.wave < 32; k++) {
      if (w.vote) apply(w, { type: 'vote', index: 1 });
      for (const id of w.lineup) if (!w.heroes.some(h => h.base.id === id)) search: for (let x = 2; x < 12; x++) for (let y = 0; y < 8; y++) if (apply(w, { type: 'place', hero: id, cx: x, cy: y }).ok) break search;
      if (w.phase === 'build') apply(w, { type: 'wave' });
      if (k % 1200 === 0) { apply(w, { type: 'buyRelic' }); if (w.pick) apply(w, { type: 'choose', index: 0 }); }
      step(w);
      if (w.wave === 12 && !mid) mid = { log: exportLog(w), hash: hashWorld(w) };
    }
    assert.ok(w.wave > 12, 'wave ' + w.wave); assert.ok(w.kills <= killCap(w.wave)); assert.ok(w.bossKills <= Math.floor(w.wave / 10));
    if (w.phase !== 'over') { apply(w, { type: 'retire' }); step(w); }
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w)); assert.equal(hashWorld(resume(mid.log)), mid.hash);
  });
});
