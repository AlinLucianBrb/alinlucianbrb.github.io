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

test('XP, gold and level-up formulas match finish_run', () => {
  assert.deepEqual(runRewards(7, 33), { xp: 7 * 10 + 33, gold: 35 });
  assert.equal(xpNeed(4), 50 + 4 * 50);
  for (const [f, sql] of sqlFiles) {
    assert.match(sql, /me\.xp := me\.xp \+ p_waves \* 10 \+ p_kills;/, f);
    assert.match(sql, /me\.gold := me\.gold \+ p_waves \* 5;/, f);
    assert.match(sql, /while me\.xp >= 50 \+ me\.level \* 50 loop/, f);
  }
});

test('the minimum-time check matches the real spawn timings', () => {
  const minRun = waves => { let t = 0; for (let w = 1; w <= waves; w++) t += 0.4 * (waveCount(w) - 1) * spawnDelay(w); return t; };
  const fastest = waves => { let t = 0; for (let w = 1; w <= waves; w++) t += (waveCount(w) - 1) * spawnDelay(w) / 2; return t; };
  for (const w of [1, 15, 35]) assert.ok(minRun(w) <= fastest(w) * 0.8 + 1e-9, 'the check must never reject a real run at 2x speed');
  for (const [f, sql] of sqlFiles) assert.match(sql, /0\.4 \* \(4 \+ 2 \* w\) \* greatest\(0\.35, 0\.85 - 0\.02 \* w\)/, f + ': same formula as waveCount and spawnDelay');
});

test('the SQL files are up to date with sql/ and js/content (run: npm run sql)', () => {
  assert.equal(sqlFiles[0][1], buildSetup(), 'supabase-setup.sql is out of date');
  assert.equal(sqlFiles[1][1], buildUpdate(), 'supabase-update.sql is out of date');
});

test('the database knows every playable hero and item, and the lineup default matches', async () => {
  const { HEROES, LINEUP_SIZE } = await import('../js/content/data.js'), { ITEMS } = await import('../js/content/items.js');
  for (const [f, sql] of sqlFiles) {
    for (const h of HEROES) assert.ok(sql.includes("('" + h.id + "')"), f + ' is missing hero ' + h.id);
    for (const id in ITEMS) assert.ok(sql.includes("('" + id + "', '" + ITEMS[id].slot + "', true)"), f + ' is missing item ' + id);
    assert.ok(sql.includes("'{" + HEROES.slice(0, LINEUP_SIZE).map(h => h.id).join(',') + "}'"), f + ': default lineup');
    assert.match(sql, /if n < 1 or n > 3 then raise exception 'bring 1 to 3 heroes'/, f + ': lineup size matches LINEUP_SIZE');
  }
  assert.equal(LINEUP_SIZE, 3);
});
