/* Acts: what reaching each one unlocks, the waves of the first act, and the game speed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES } from '../js/content/data.js';
import { UNLOCKS, actReached, clearedFor, isUnlocked, unlocksOf, actMessage, maxSpeed } from '../js/content/unlocks.js';

test('the first act goes up to wave 55, and every level after it has 55', () => {
  assert.deepEqual(STAGES.slice(0, 5).map(s => s.waves), [15, 25, 35, 45, 55]);
  assert.ok(STAGES.slice(5).every(s => s.waves === 55));
});

test('an act is reached by beating the last level of the one before it', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 20, 25].map(actReached), [1, 1, 2, 2, 3, 5, 5]);
  assert.deepEqual([1, 2, 3].map(clearedFor), [0, 5, 10]);
  assert.ok(!isUnlocked('paths', 4) && isUnlocked('paths', 5)); assert.ok(!isUnlocked('paths', undefined));
  assert.deepEqual(unlocksOf(2), ['Evolution paths', 'Crafting']); assert.deepEqual(unlocksOf(1), []);
});

test('a win that reaches a new act says what it unlocked', () => {
  assert.match(actMessage(4, 5), /^Act 2, Deep Forest, is open\. Unlocked: Evolution paths, Crafting\.$/);
  assert.equal(actMessage(3, 4), ''); assert.equal(actMessage(5, 5), '', 'playing an old level again'); assert.equal(actMessage(24, 25), '');
});

test('game speed: 1x to start with, 2x from act 3', () => {
  assert.deepEqual([0, 5, 9, 10, 25].map(maxSpeed), [1, 1, 1, 2, 2]);
});

test('the server uses the same unlocks', async () => {
  const { rulesSql } = await import('../tools/rules-sql.mjs');
  for (const [id, u] of Object.entries(UNLOCKS)) assert.ok(rulesSql().includes("when '" + id + "' then " + clearedFor(u.act)));
  for (const f of ['supabase-setup.sql', 'supabase-update.sql'])
    assert.ok(readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes("levels_cleared >= public.rule_unlock('paths')"), f);
});
