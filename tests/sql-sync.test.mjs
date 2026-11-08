/* The database repeats some game rules (wave counts, rewards, talent trees, timings). These tests fail when the two drift apart. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES } from '../js/content/data.js';
import { runRewards, xpNeed } from '../js/core/rules.js';
import { waveCount, spawnDelay } from '../js/engine/enemies.js';
import { buildSetup, buildUpdate } from '../tools/build-sql.mjs';

const sqlFiles = ['supabase-setup.sql', 'supabase-update.sql'].map(f => [f, readFileSync(new URL('../' + f, import.meta.url), 'utf8')]);

test('the database rules are written from js/content/rules.js (one place): finish_run, start_run and save_loadout use them', async () => {
  const { rulesSql } = await import('../tools/rules-sql.mjs');
  for (const [f, sql] of sqlFiles) {
    assert.ok(sql.includes(rulesSql()), f + ': the generated rules');
    for (const use of ['cap := public.rule_stage_waves(r.stage);', 'p_kills > public.rule_kill_cap(p_waves)', 'boss_cap := public.rule_boss_cap(r.stage, p_waves);',
      'elapsed < public.rule_min_run(done_waves)', 'me.xp := me.xp + public.rule_run_xp(p_waves, p_kills, b_xp);', 'me.gold := me.gold + public.rule_run_gold(p_waves, b_gold);',
      'while me.xp >= public.rule_xp_need(me.level) loop', 'chance := public.rule_drop_chance(p_won, p_waves, r.stage) * (1 + b_loot);',
      'rar := public.rule_rarity(random()::numeric, b_rar);', 'nb := public.rule_bonus_guaranteed(rar);', 'random() < public.rule_extra_bonus_chance() + b_extra',
      'random() < public.rule_affinity_chance()', 'public.rule_rank(rar, random()::numeric)', '>= public.rule_max_items()',
      'p_stage > public.rule_stage_count()', 'n > public.rule_lineup_max()'])
      assert.ok(sql.includes(use), f + ' uses: ' + use);
    for (const old of ['10 + 5 * r.stage', 'p_waves * (p_waves + 6)', '50 + me.level * 50', 'round((p_waves * 10 + p_kills) * (1 + b_xp))', '28 * (1 + b_rar)'])
      assert.ok(!sql.includes(old), f + ' no longer repeats: ' + old);
  }
});

test('the rules themselves: XP, rewards, waves, kills, bosses and the minimum run time', async () => {
  const { killCap, minRunSeconds, MIN_RUN, isBossWave } = await import('../js/content/rules.js');
  assert.deepEqual(runRewards(7, 33), { xp: 7 * 10 + 33, gold: 35 });
  assert.deepEqual(runRewards(7, 33, { gold: 0.2, xp: 0.1 }), { xp: Math.round(103 * 1.1), gold: 42 });
  assert.equal(xpNeed(4), 50 + 4 * 50);
  for (const w of [1, 15, 35]) { let n = 0; for (let i = 1; i <= w; i++) n += waveCount(i); assert.equal(killCap(w), n, 'every enemy of every wave'); }
  const fastest = waves => { let t = 0; for (let w = 1; w <= waves; w++) t += (waveCount(w) - 1) * spawnDelay(w) / 3; return t; };
  for (const w of [1, 15, 35]) assert.ok(minRunSeconds(w) <= fastest(w) * 0.8 + 1e-9, 'the check must never reject a real run at 3x speed');
  assert.equal(MIN_RUN.floor, 15);
  assert.ok(isBossWave(15, STAGES[0]) && !isBossWave(8, STAGES[0]) && isBossWave(13, STAGES[2]), 'the last wave, and the middle one from level 3');
});

test('finish_run takes the boss count: one guaranteed item each, never more than the boss waves reached, and a win needs the final boss', () => {
  for (const [f, sql] of sqlFiles) {
    assert.match(sql, /create function public\.finish_run\(p_run uuid, p_waves int, p_kills int, p_won boolean, p_bosses int default 0/, f);
    assert.match(sql, /if p_won and p_bosses < 1 then raise exception/, f);
    assert.match(sql, /n := p_bosses \+ floor\(chance\)::int/, f);
  }
});

/* A grant or revoke on a function signature that no longer exists stops the whole SQL script in Supabase (error 42883),
   so every signature in the permissions must match a function the script creates. */
test('permissions name only functions the script creates, with the same argument types', () => {
  const norm = t => t.trim().replace(/\s+default\s+.*$/i, '').replace(/^p_\w+\s+/, '').replace(/\binteger\b/g, 'int').replace(/\s+/g, ' ');
  for (const [f, sql] of sqlFiles) {
    const created = new Set();
    for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)/g))
      created.add(m[1] + '(' + (m[2].trim() ? m[2].split(',').map(norm).join(', ') : '') + ')');
    const named = [...sql.matchAll(/(?:grant execute|revoke all) on function public\.(\w+)\(([^)]*)\)/g)].map(m => m[1] + '(' + (m[2].trim() ? m[2].split(',').map(norm).join(', ') : '') + ')');
    assert.ok(named.length >= 10, f + ': found the permissions');
    for (const sig of named) assert.ok(created.has(sig), f + ': permissions name ' + sig + ', but the script creates ' + [...created].filter(c => c.startsWith(sig.split('(')[0] + '(')).join(' / '));
  }
});

test('the SQL files are up to date with sql/ and js/content (run: npm run sql)', () => {
  assert.equal(sqlFiles[0][1], buildSetup(), 'supabase-setup.sql is out of date');
  assert.equal(sqlFiles[1][1], buildUpdate(), 'supabase-update.sql is out of date');
});

test('the database knows every playable hero and item, and the lineup default matches', async () => {
  const { HEROES, LINEUP_SIZE } = await import('../js/content/data.js'), { ITEMS } = await import('../js/content/items.js');
  for (const [f, sql] of sqlFiles) {
    for (const h of HEROES) assert.ok(sql.includes("('" + h.id + "')"), f + ' is missing hero ' + h.id);
    for (const id in ITEMS) assert.ok(sql.includes("('" + id + "', '" + ITEMS[id].slot + "', true, " + (ITEMS[id].affinity ? "'" + ITEMS[id].affinity + "'" : 'null') + ')'), f + ' is missing item ' + id);
    assert.ok(sql.includes("'{" + HEROES.slice(0, LINEUP_SIZE).map(h => h.id).join(',') + "}'"), f + ': default lineup');
  }
  assert.equal(LINEUP_SIZE, 3);
});

test('co-op in the database: lobbies (5-character names, 4 slots, hashed passwords), co-op runs and a record per mode', () => {
  for (const [f, sql] of sqlFiles) {
    for (const want of ["check (name ~ '^[A-Z0-9]{5}$')", "substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 1 + floor(random() * 36)::int, 1)", 'from generate_series(1, 5)',
      '>= public.rule_max_players() then raise exception', "raise exception 'password needed'", "raise exception 'wrong password'",
      'public.lobby_hash(salt, pw)', 'create function public.start_run(p_stage int, p_lobby uuid default null)',
      'insert into public.records as x (user_id, players,', 'create function public.get_leaderboard(p_limit int default 20, p_players int default 1)',
      "if n < 2 then raise exception 'a co-op match needs at least 2 players'",
      'grant execute on function public.join_lobby(text, text) to authenticated;', 'public.lobbies, public.lobby_members, public.records from anon, authenticated;'])
      assert.ok(sql.includes(want), f + ': ' + want);
    assert.ok(!/pass_hash\W[^\n]*jsonb_build_object/.test(sql.slice(sql.indexOf('function public.lobby_state'), sql.indexOf('function public.lobby_drop_member'))), 'lobby_state never returns the password');
  }
});
