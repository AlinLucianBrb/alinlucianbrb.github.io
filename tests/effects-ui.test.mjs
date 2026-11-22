/* The match-effect vote and the effects bar in the game shell, against a fake page. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { openVote, startEffect } = await import('../js/engine/match-effects.js');
const { recalc } = await import('../js/engine/world.js');
const { MATCH_EFFECTS } = await import('../js/content/match-effects.js');
const { byId } = dom;
const raw = () => _debug().raw;
const hooks = { stage: 2, talents: [], lineup: ['warrior'], matchEffects: true, onRunStart() {}, onRunEnd: async () => 'saved', onExit() {}, onNext() {} };
const bar = () => byId.fxBar.children.map(c => c._text);
const open = wave => { const w = raw(); w.wave = wave; w.phase = 'build'; openVote(w); dom.frames(2); return w.vote; };

test('the vote: three cards and None, the match waits, a click or a key decides, and the bar shows what is on', () => {
  const errors = [], real = console.error; console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    startGame({ ...hooks }); dom.frames(2); assert.notEqual(byId.voteBox.hidden, false); assert.equal(byId.fxBar.hidden, true);
    const v = open(15), id = v.offers[0]; assert.equal(byId.voteBox.hidden, false); assert.equal(byId.voteCards.children.length, 4);
    const t = raw().tick; dom.frames(20); assert.equal(raw().tick, t);
    byId.voteCards.children[0].onclick(); dom.frames(2); assert.equal(byId.voteBox.hidden, true); assert.deepEqual(raw().effects, [id]); assert.deepEqual(bar(), [MATCH_EFFECTS[id].name]);
    dom.frames(5); assert.ok(raw().tick > t);
    open(30); byId.voteCards.children[3].onclick(); dom.frames(2); assert.deepEqual(raw().effects, [id], 'None'); assert.equal(byId.voteBox.hidden, true);
    raw().players[0].relics.push({ name: 'Keen edge', r: 2 }); dom.frames(2); startEffect(raw(), 'finetaste', recalc); dom.frames(3); assert.deepEqual(errors, []);
  } finally { console.error = real; stopGame(); }
});
test('a map effect is in the bar from the start, and gone in the next match', () => {
  startGame({ ...hooks, stage: 25 }); dom.frames(3); assert.deepEqual(bar(), ['Overgrown']); stopGame();
  startGame({ ...hooks, stage: 1 }); dom.frames(3); assert.equal(byId.fxBar.hidden, true); stopGame();
});
