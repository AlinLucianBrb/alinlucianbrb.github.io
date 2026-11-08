/* The database repeats some game rules (wave counts, rewards, talent trees, timings). These tests fail when the two drift apart. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES } from '../js/content/data.js';
import { runRewards, xpNeed } from '../js/core/rules.js';
import { waveCount, spawnDelay } from '../js/engine/enemies.js';
import { buildSetup, buildUpdate } from '../tools/build-sql.mjs';

const sqlFiles = ['supabase-setup.sql', 'supabase-update.sql'].map(f => [f, readFileSync(new URL('../' + f, import.meta.url), 'utf8')]);

test('level count and wave counts match finish_run (cap = 10 + 5 x level)', () => {
  assert.equal(STAGES.length, 5);
  STAGES.forEach((s, i) => assert.equal(s.waves, 10 + 5 * (i + 1)));
  for (const [f, sql] of sqlFiles) {
    assert.match(sql, /cap := 10 \+ 5 \* r\.stage;/, f);
    assert.match(sql, /p_stage < 1 or p_stage > 5/, f);
  }
});

test('XP, gold and level-up formulas match finish_run, with the reward talents', () => {
  assert.deepEqual(runRewards(7, 33), { xp: 7 * 10 + 33, gold: 35 });
  assert.deepEqual(runRewards(7, 33, { gold: 0.2, xp: 0.1 }), { xp: Math.round(103 * 1.1), gold: 42 });
  assert.equal(xpNeed(4), 50 + 4 * 50);
  for (const [f, sql] of sqlFiles) {
    assert.match(sql, /me\.xp := me\.xp \+ round\(\(p_waves \* 10 \+ p_kills\) \* \(1 \+ b_xp\)\);/, f);
    assert.match(sql, /me\.gold := me\.gold \+ round\(p_waves \* 5 \* \(1 \+ b_gold\)\);/, f);
    assert.match(sql, /chance := \(case when p_won then 1 else 0\.5 \* p_waves::numeric \/ cap end\) \* \(1 \+ b_loot\);/, f);
    assert.match(sql, /while me\.xp >= 50 \+ me\.level \* 50 loop/, f);
  }
});

test('the minimum-time check matches the real spawn timings', () => {
  const minRun = waves => { let t = 0; for (let w = 1; w <= waves; w++) t += 0.25 * (waveCount(w) - 1) * spawnDelay(w); return t; };
  const fastest = waves => { let t = 0; for (let w = 1; w <= waves; w++) t += (waveCount(w) - 1) * spawnDelay(w) / 3; return t; };
  for (const w of [1, 15, 35]) assert.ok(minRun(w) <= fastest(w) * 0.8 + 1e-9, 'the check must never reject a real run at 3x speed');
  for (const [f, sql] of sqlFiles) assert.match(sql, /0\.25 \* \(4 \+ 2 \* w\) \* greatest\(0\.35, 0\.85 - 0\.02 \* w\)/, f + ': same formula as waveCount and spawnDelay');
});

test('finish_run takes the boss count: one guaranteed item each, never more than the boss waves reached, and a win needs the final boss', () => {
  for (const [f, sql] of sqlFiles) {
    assert.match(sql, /create function public\.finish_run\(p_run uuid, p_waves int, p_kills int, p_won boolean, p_bosses int default 0\)/, f);
    assert.match(sql, /boss_cap := \(case when p_waves >= cap then 1 else 0 end\) \+ \(case when r\.stage >= 3 and p_waves >= round\(cap \/ 2\.0\) then 1 else 0 end\);/, f);
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
    assert.match(sql, /if n < 1 or n > 3 then raise exception 'bring 1 to 3 heroes'/, f + ': lineup size matches LINEUP_SIZE');
  }
  assert.equal(LINEUP_SIZE, 3);
});
