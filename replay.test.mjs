import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog, replay, verify } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { playRun } from '../tools/bot.mjs';
import { tilesNearPath, heroIndex } from './helpers.mjs';

test('a whole bot run replays to the identical final state', () => {
  const { world, log } = playRun({ seed: 3, stage: 1, strategy: 'balanced' });
  assert.ok(log.commands.length > 10, 'the bot issued commands');
  assert.equal(hashWorld(replay(log)), hashWorld(world));
  assert.equal(verify(log).ok, true);
});

test('replay covers every command type: sell, move, reroll, banish, auto', () => {
  /* Everything goes through commands: gold is earned by playing, never set directly, or the replay could not reproduce it. */
  const w = createWorld({ seed: 21, stage: 1 });
  const t = tilesNearPath(w, 6);
  const a = apply(w, { type: 'place', hero: heroIndex('archer'), cx: t[0][0], cy: t[0][1] }).id;
  apply(w, { type: 'auto', on: true });
  while (w.gold < 160 && w.phase !== 'over') step(w);
  assert.ok(apply(w, { type: 'buyRelic' }).ok);
  assert.ok(apply(w, { type: 'reroll' }).ok);
  assert.ok(apply(w, { type: 'banish', index: 2 }).ok);
  assert.ok(apply(w, { type: 'choose', index: 0 }).ok);
  for (let i = 0; i < 300; i++) step(w);
  assert.ok(apply(w, { type: 'move', id: a, cx: t[3][0], cy: t[3][1] }).ok);
  for (let i = 0; i < 300; i++) step(w);
  assert.ok(apply(w, { type: 'place', hero: heroIndex('archer'), cx: t[1][0], cy: t[1][1] }).ok);
  assert.ok(apply(w, { type: 'sell', id: a }).ok);
  assert.ok(apply(w, { type: 'auto', on: false }).ok);
  for (let i = 0; i < 2000; i++) step(w);
  const log = exportLog(w);
  assert.deepEqual([...new Set(log.commands.map(c => c.type))].sort(), ['auto', 'banish', 'buyRelic', 'choose', 'move', 'place', 'reroll', 'sell']);
  assert.equal(hashWorld(replay(log)), hashWorld(w));
});

test('a log survives being saved as JSON', () => {
  const { world, log } = playRun({ seed: 8, stage: 1, strategy: 'spell' });
  const back = JSON.parse(JSON.stringify(log));
  assert.equal(hashWorld(replay(back)), hashWorld(world));
});

test('verify catches a log whose claimed result was edited', () => {
  const { log } = playRun({ seed: 2, stage: 1, strategy: 'melee' });
  const forged = { ...log, result: { ...log.result, kills: log.result.kills + 50 } };
  const v = verify(forged);
  assert.equal(v.ok, false); assert.deepEqual(v.mismatches, ['kills']);
});

test('replay rejects impossible or tampered commands', () => {
  const { log } = playRun({ seed: 2, stage: 1, strategy: 'balanced' });
  const tampered = JSON.parse(JSON.stringify(log));
  const p = tampered.commands.find(c => c.type === 'place');
  p.cx = tampered.commands.find(c => c.type === 'place' && c !== p).cx; p.cy = tampered.commands.find(c => c.type === 'place' && c !== p).cy;
  assert.throws(() => replay(tampered), /failed on replay/);
  assert.throws(() => replay({ ...log, ver: 999 }), /engine version/);
});

test('a log saved at the moment the run ends replays to the same ending (win and loss)', () => {
  for (const [seed, strategy, stage] of [[1, 'balanced', 1], [1, 'melee', 3]]) {
    let saved = null;
    const w = createWorld({ seed, stage });
    w.ev.on('end', () => { saved = exportLog(w); });
    apply(w, { type: 'place', hero: heroIndex('archer'), cx: tilesNearPath(w, 1)[0][0], cy: tilesNearPath(w, 1)[0][1] });
    apply(w, { type: 'auto', on: true });
    while (step(w));
    assert.ok(saved, 'end event fired');
    const r = replay(saved);
    assert.equal(r.phase, 'over'); assert.equal(r.won, w.won); assert.equal(hashWorld(r), hashWorld(w));
  }
});
