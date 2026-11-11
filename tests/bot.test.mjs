import test from 'node:test';
import assert from 'node:assert/strict';
import { playRun, talentsFor, STRATEGIES } from '../tools/bot.mjs';
import { pointsFor, NODES, canAllocate } from '../js/content/talents.js';
import { STAGES, PAY_FOR_HEROES } from '../js/content/data.js';

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
test('level 1 at player level 1 is a real challenge: the bot neither always wins nor always loses', tc => {
  PAY_FOR_HEROES.on = true; tc.after(() => { PAY_FOR_HEROES.on = false; });   /* as in a real match: heroes cost gold */
  /* Tuned (Nov 11) so the weakest tenth of teams clears it a bit more than half the time (npm run balance:tune). */
  const wins = (lineup, form = '') => { let n = 0; for (let seed = 1; seed <= 6; seed++) if (playRun({ seed, stage: 1, lineup, form, paths: !!form }).result.won) n++; return n; };
  const strong = wins(['warrior', 'ranger', 'mage']);
  const weak = wins(['ranger', 'paladin', 'shaman'], 'boomeranger,crusader,witchdoctor');   /* one of the weakest teams */
  assert.ok(strong >= 1, 'the classic trio can win (' + strong + ' of 6)');
  assert.ok(weak >= 1 && weak <= 5, 'a weak team wins some and loses some (' + weak + ' of 6)');
});
