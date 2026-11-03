/* Runs the real browser shell (js/game) against a fake page: clicks become commands, the loop advances the engine,
   and the run log handed to the Play screen replays to the same result. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame } = await import('../js/game/game.js');
const { replay } = await import('../js/engine/replay.js');
const { hashWorld } = await import('../js/engine/hash.js');
const { STAGES } = await import('../js/content/data.js');
const { byId } = dom;

const ends = [], starts = [];
const hooks = { stage: 1, talents: [], onRunStart: s => starts.push(s), onRunEnd: async r => { ends.push(r); return 'saved'; }, onExit() {}, onNext() {} };
const click = (cx, cy) => byId.c.fire('pointerdown', { clientX: cx * 40 + 20, clientY: cy * 40 + 20 });
const gold = () => Number(byId.gold._v);
const wave = () => Number(String(byId.wave._v).split(' / ')[0]);
/* Free tiles beside the path, read from the engine's own map through the run log's seed. */
async function freeTiles(n) {
  const { createWorld } = await import('../js/engine/world.js');
  const w = createWorld({ seed: starts.at(-1).seed, stage: starts.at(-1).stage });
  const out = [];
  for (const [x, y] of w.path.slice(3)) for (const [dx, dy] of [[0, 1], [0, -1]]) {
    const c = [x + dx, y + dy];
    if (c[1] >= 0 && c[1] < 10 && !w.pathSet.has(c.join(',')) && !out.some(o => o.join() === c.join())) out.push(c);
  }
  return out.slice(0, n);
}

test('placing, selling and moving heroes by clicking', async () => {
  startGame(hooks); dom.frames(2);
  assert.equal(starts.length, 1); assert.equal(gold(), 100);
  const t = await freeTiles(3);
  dom.heroButton(1).onclick(); click(...t[0]); dom.frames(1);
  assert.equal(gold(), 50, 'archer placed');
  click(...t[0]); dom.frames(1);
  dom.button('Move').onclick(); click(...t[1]); dom.frames(1);
  click(...t[1]); dom.frames(1);
  assert.ok(dom.button('Sell'), 'the moved hero is selectable on its new tile');
  dom.button('Sell').onclick(); dom.frames(1);
  assert.equal(gold(), 85, 'sold for 70%');
});

test('relic shop through the buttons: buy, reroll, banish, choose', async () => {
  byId.newRun.onclick(); dom.frames(2);
  const t = await freeTiles(2);
  dom.heroButton(1).onclick(); click(...t[0]);
  byId.auto.onclick(); byId.spd.onclick();
  for (let i = 0; i < 4000 && gold() < 110; i++) dom.frame();
  byId.relic.onclick(); dom.frames(1);
  assert.equal(byId.pick.hidden, false);
  const g0 = gold(); byId.reroll.onclick(); dom.frames(1);
  assert.equal(g0 - gold(), 12);
  byId.choices.children[0].children[1].onclick(); dom.frames(1);
  assert.equal(byId.choices.children.length, 3);
  byId.choices.children[1].children[0].onclick(); dom.frames(1);
  assert.equal(byId.pick.hidden, true);
  assert.equal(byId.relics.children.length, 1, 'the relic shows in the relics panel');
});

test('the run log handed to the Play screen replays to the same result', async () => {
  const stage = STAGES[0], saved = { waves: stage.waves, hpMult: stage.hpMult };
  stage.waves = 3; stage.hpMult = 0.3;
  try {
    ends.length = 0; byId.newRun.onclick(); dom.frames(2);
    const t = await freeTiles(2);
    dom.heroButton(1).onclick(); click(...t[0]); dom.heroButton(1).onclick(); click(...t[1]);
    for (let i = 0; i < 20000 && !ends.length; i++) dom.frame();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(ends.length, 1);
    assert.equal(ends[0].won, true);
    assert.equal(byId.overNext.hidden, false, 'next level button');
    const w = replay(ends[0].log);
    assert.equal(w.won, true); assert.equal(w.kills, ends[0].kills); assert.equal(w.wave, 3);
    assert.equal(w.tick, ends[0].log.ticks, 'the log ends on the final tick');
  } finally { Object.assign(stage, saved); }
});

test('catches up after the browser pauses, and keeps running in a hidden tab', async () => {
  byId.newRun.onclick(); dom.frames(2);
  const t = await freeTiles(3);
  dom.heroButton(1).onclick(); click(...t[0]); dom.heroButton(1).onclick(); click(...t[2]);
  const w0 = wave();
  dom.frame(60000);              /* one frame after a 60 s pause */
  dom.frames(200);
  assert.ok(wave() > w0 + 2, 'caught up several waves');
  const w1 = wave();
  document.hidden = true; dom.docHandlers.visibilitychange();
  dom.advanceClock(60000);
  await new Promise(r => setTimeout(r, 700));
  document.hidden = false; dom.docHandlers.visibilitychange(); dom.frames(3);
  assert.ok(wave() > w1 || byId.over.hidden === false, 'the hidden-tab timer kept the game going');
  stopGame();
});
