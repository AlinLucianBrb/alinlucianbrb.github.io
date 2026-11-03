import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog, replay, verify } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { playRun } from '../tools/bot.mjs';
import { tilesNearPath, heroIndex } from './helpers.mjs';

test('a whole bot run replays to the identical final state', () => {
  const { world, log } = playRun({ seed: 3, stage: 1, strategy: 'trio' });
  assert.ok(log.commands.length > 10, 'the bot issued commands');
  assert.equal(hashWorld(replay(log)), hashWorld(world));
  assert.equal(verify(log).ok, true);
});

test('replay covers every command type: place, move, evolve, reroll, banish, choose, auto, wave', () => {
  /* Everything goes through commands: gold is earned by playing, never set directly, or the replay could not reproduce it. */
  const w = createWorld({ seed: 21, stage: 1, items: { ranger: 'power_charm' } });
  const t = tilesNearPath(w, 6);
  const a = apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1] }).id;
  apply(w, { type: 'place', hero: 'warrior', cx: t[2][0], cy: t[2][1] });
  apply(w, { type: 'wave' });
  apply(w, { type: 'auto', on: true });
  while (w.gold < 260 && w.phase !== 'over') step(w);
  assert.ok(apply(w, { type: 'evolve', id: a }).ok);
  assert.ok(apply(w, { type: 'buyRelic' }).ok);
  assert.ok(apply(w, { type: 'reroll' }).ok);
  assert.ok(apply(w, { type: 'banish', index: 2 }).ok);
  assert.ok(apply(w, { type: 'choose', index: 0 }).ok);
  for (let i = 0; i < 300; i++) step(w);
  assert.ok(apply(w, { type: 'move', id: a, cx: t[3][0], cy: t[3][1] }).ok);
  assert.ok(apply(w, { type: 'place', hero: 'mage', cx: t[1][0], cy: t[1][1] }).ok);
  assert.ok(apply(w, { type: 'auto', on: false }).ok);
  for (let i = 0; i < 2000; i++) step(w);
  const log = exportLog(w);
  assert.deepEqual([...new Set(log.commands.map(c => c.type))].sort(), ['auto', 'banish', 'buyRelic', 'choose', 'evolve', 'move', 'place', 'reroll', 'wave']);
  assert.deepEqual(log.items, { ranger: 'power_charm' }); assert.deepEqual(log.lineup, ['warrior', 'ranger', 'mage']);
  assert.equal(hashWorld(replay(log)), hashWorld(w));
});

test('a log survives being saved as JSON', () => {
  const { world, log } = playRun({ seed: 8, stage: 1, strategy: 'mage' });
  const back = JSON.parse(JSON.stringify(log));
  assert.equal(hashWorld(replay(back)), hashWorld(world));
});

test('verify catches a log whose claimed result was edited', () => {
  const { log } = playRun({ seed: 2, stage: 1, strategy: 'warrior' });
  const forged = { ...log, result: { ...log.result, kills: log.result.kills + 50 } };
  const v = verify(forged);
  assert.equal(v.ok, false); assert.deepEqual(v.mismatches, ['kills']);
});

test('replay rejects impossible or tampered commands', () => {
  const { log } = playRun({ seed: 2, stage: 1, strategy: 'trio' });
  const tampered = JSON.parse(JSON.stringify(log));
  const places = tampered.commands.filter(c => c.type === 'place');
  places[1].cx = places[0].cx; places[1].cy = places[0].cy;               /* two heroes on one tile */
  assert.throws(() => replay(tampered), /failed on replay/);
  const extra = JSON.parse(JSON.stringify(log));
  extra.commands.splice(1, 0, { ...places[0], t: places[0].t });          /* the same hero placed twice */
  assert.throws(() => replay(extra), /failed on replay/);
  assert.throws(() => replay({ ...log, ver: 999 }), /engine version/);
});

test('a log saved at the moment the run ends replays to the same ending (win and loss)', () => {
  for (const [seed, stage] of [[1, 1], [1, 3]]) {
    let saved = null;
    const w = createWorld({ seed, stage });
    w.ev.on('end', () => { saved = exportLog(w); });
    apply(w, { type: 'place', hero: 'ranger', cx: tilesNearPath(w, 1)[0][0], cy: tilesNearPath(w, 1)[0][1] });
    apply(w, { type: 'auto', on: true });
    while (step(w));
    assert.ok(saved, 'end event fired');
    const r = replay(saved);
    assert.equal(r.phase, 'over'); assert.equal(r.won, w.won); assert.equal(hashWorld(r), hashWorld(w));
  }
});
