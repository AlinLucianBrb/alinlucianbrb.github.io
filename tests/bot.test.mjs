import test from 'node:test';
import assert from 'node:assert/strict';
import { playRun, talentsFor, STRATEGIES } from '../tools/bot.mjs';
import { pointsFor, NODES, canAllocate } from '../js/content/talents.js';
import { STAGES } from '../js/content/data.js';

test('bot talents use exactly the available points and are a legal set', () => {
  for (const level of [1, 3, 8, 20]) {
    const t = talentsFor(level, 'trio'), alloc = new Set();
    assert.equal(t.length, Math.min(pointsFor(level), NODES.size));
    for (const id of t) { assert.ok(canAllocate(alloc, NODES.get(id)), id); alloc.add(id); }
  }
});

test('the bot finishes a run for every strategy and the result is consistent', () => {
  for (const strategy of Object.keys(STRATEGIES)) {
    const { result, log } = playRun({ seed: 1, stage: 1, strategy });
    assert.equal(result.over, true, strategy + ' should finish');
    assert.ok(result.waves >= 1 && result.waves <= STAGES[0].waves);
    if (result.won) assert.ok(result.waves === STAGES[0].waves && result.lives > 0, strategy + ': a win reaches the last wave with lives left');
    else assert.ok(result.lives === 0 || result.waves === STAGES[0].waves, strategy + ': a loss runs out of lives, or the final boss got through');
    assert.equal(log.commands.filter(c => c.type === 'place').length, STRATEGIES[strategy].length, 'each hero placed once');
  }
});

/* A guard rail, not a balance target: if level 1 suddenly becomes unwinnable or trivial, something broke. */
test('level 1 stays winnable for the bot with the full lineup', () => {
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) if (playRun({ seed, stage: 1, strategy: 'trio' }).result.won) wins++;
  assert.ok(wins >= 3, 'trio bot won only ' + wins + ' of 6 level 1 runs');
});
