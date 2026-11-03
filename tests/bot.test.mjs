import test from 'node:test';
import assert from 'node:assert/strict';
import { playRun, talentsFor, STRATEGIES } from '../tools/bot.mjs';
import { pointsFor, NODES, canAllocate } from '../js/content/talents.js';
import { STAGES } from '../js/content/data.js';

test('bot talents use exactly the available points and are a legal set', () => {
  for (const level of [1, 3, 8, 20]) {
    const t = talentsFor(level, 'balanced'), alloc = new Set();
    assert.equal(t.length, Math.min(pointsFor(level), NODES.size));
    for (const id of t) { assert.ok(canAllocate(alloc, NODES.get(id)), id); alloc.add(id); }
  }
});

test('the bot finishes a run for every strategy and the result is consistent', () => {
  for (const strategy of Object.keys(STRATEGIES)) {
    const { result, log } = playRun({ seed: 1, stage: 1, strategy });
    assert.equal(result.over, true, strategy + ' should finish');
    assert.ok(result.waves >= 1 && result.waves <= STAGES[0].waves);
    assert.equal(result.won, result.waves === STAGES[0].waves && result.lives > 0);
    assert.ok(log.commands.some(c => c.type === 'place'));
  }
});

/* A guard rail, not a balance target: if level 1 suddenly becomes unwinnable or trivial, something broke. */
test('level 1 stays winnable for a balanced bot', () => {
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) if (playRun({ seed, stage: 1, strategy: 'balanced' }).result.won) wins++;
  assert.ok(wins >= 3, 'balanced bot won only ' + wins + ' of 6 level 1 runs');
});
