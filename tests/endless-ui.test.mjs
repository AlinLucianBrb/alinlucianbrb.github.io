/* Endless in the game shell, against a fake page: the map vote, 3x speed, the wave without an end, and quitting saves the run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { byId } = dom;
const raw = () => _debug().raw;

test('endless: choose the map, play at 3x, quit and the run is saved, not given up', async () => {
  const ends = [], errors = [], real = console.error; let exits = 0; console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    startGame({ stage: 27, talents: [], lineup: ['warrior'], matchEffects: true, maxSpeed: 3, onRunStart() {}, onRunEnd: async r => { ends.push(r); return 'saved'; }, onExit() { exits++; }, onNext() {} }); dom.frames(3);
    assert.equal(byId.voteBox.hidden, false); assert.equal(byId.voteCards.children.length, 3, 'no None'); assert.match(byId.voteTitle._text, /map/);
    byId.voteCards.children[1].onclick(); dom.frames(3); assert.equal(byId.voteBox.hidden, true); assert.ok(raw().mapEffect);
    byId.spd.onclick(); byId.spd.onclick(); assert.equal(_debug().view.speed, 3); byId.spd.onclick(); assert.equal(_debug().view.speed, 1);
    byId.quitYes.onclick(); assert.equal(exits, 1, 'before the first wave there is nothing to save'); assert.equal(ends.length, 0);
    byId.go.onclick(); dom.frames(60); assert.equal(byId.wave._v, '1'); assert.equal(byId.quitQ._text, 'End and save this run?');
    byId.menuBtn.onclick(); byId.quitYes.onclick(); dom.frames(3); await new Promise(r => setTimeout(r, 0));
    assert.equal(ends.length, 1); assert.deepEqual([ends[0].waves, ends[0].won, ends[0].stage], [1, false, 27]); assert.equal(ends[0].log.commands.at(-1).type, 'retire');
    assert.equal(byId.over.hidden, false); assert.equal(byId.overTitle._text ?? byId.overTitle._v, 'Run ended'); assert.equal(exits, 1, 'stays on the result');
    dom.frames(20); assert.equal(ends.length, 1, 'saved once'); assert.deepEqual(errors, []);
  } finally { console.error = real; stopGame(); }
});
