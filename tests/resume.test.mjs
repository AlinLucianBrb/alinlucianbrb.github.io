/* A run survives a page refresh: its log is saved on the browser, and resume() plays it back to exactly where it was. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog, resume, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { tilesNearPath } from './helpers.mjs';

function playSome(seed) {
  const w = createWorld({ seed, stage: 1, lineup: ['ranger', 'mage'] }), t = tilesNearPath(w, 4);
  apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1] });
  apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
  for (let i = 0; i < 60 * 40; i++) step(w);
  apply(w, { type: 'place', hero: 'mage', cx: t[2][0], cy: t[2][1] });
  if (w.gold >= w.relicCost()) apply(w, { type: 'buyRelic' });
  for (let i = 0; i < 60 * 5; i++) step(w);
  return w;
}

test('resume() rebuilds the run exactly where it was, and it carries on the same way', () => {
  const w = playSome(77), log = JSON.parse(JSON.stringify(exportLog(w)));   /* as it comes back from storage */
  const r = resume(log);
  assert.equal(r.tick, w.tick); assert.equal(hashWorld(r), hashWorld(w), 'same state');
  assert.equal(r.log.commands.length, w.log.commands.length, 'the log carries on from the old one');
  if (r.picking) { apply(r, { type: 'choose', index: 0 }); apply(w, { type: 'choose', index: 0 }); }
  for (let i = 0; i < 60 * 20; i++) { step(r); step(w); }
  assert.equal(hashWorld(r), hashWorld(w), 'and plays on identically');
  assert.equal(hashWorld(replay(exportLog(r))), hashWorld(r), 'the resumed run\'s own log replays');
});

test('the saved run is kept per account, cleared on demand, and forgotten after 24 hours', async () => {
  const mem = {};
  globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  const { saveRun, loadRun, clearRun, describeRun } = await import('../js/game/saved-run.js');
  const log = exportLog(playSome(5));
  saveRun('u1', { log, runId: 'r1' });
  assert.equal(loadRun('u2'), null, 'another account has none');
  const got = loadRun('u1');
  assert.equal(got.runId, 'r1'); assert.equal(got.log.ticks, log.ticks);
  assert.match(describeRun(got), /^Level 1-1, wave \d+$/);
  const old = JSON.parse(mem['tbd.run.u1']); old.savedAt -= 25 * 3600 * 1000; mem['tbd.run.u1'] = JSON.stringify(old);
  assert.equal(loadRun('u1'), null, 'too old: the server would not accept it any more');
  saveRun('u1', { log: { ...log, ver: log.ver - 1 }, runId: 'r1' });
  assert.equal(loadRun('u1'), null, 'saved before an update that changed the rules: it cannot be played back');
  saveRun('u1', { log, runId: 'r1' }); clearRun('u1');
  assert.equal(loadRun('u1'), null);
  delete globalThis.localStorage;
});
