/* The balance tools: starting relics, the measurements, the experiments, the analysis and the report. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../js/engine/world.js';
import { replay, resume, exportLog } from '../js/engine/replay.js';
import { playRun } from '../tools/bot.mjs';
import { suites, RELIC_SETUP } from '../tools/balance/suites.mjs';
import { analyze, progress } from '../tools/balance/analyze.mjs';
import { buildReport } from '../tools/balance/report.mjs';
import { gearFor } from '../tools/balance/gear.mjs';

test('starting relics are applied, logged and survive a replay', () => {
  const w = createWorld({ seed: 3, stage: 1, heroes: ['warrior'], relics: [{ name: 'Keen edge', ri: 2 }] });
  assert.equal(w.players[0].relics.length, 1);
  const log = exportLog(w);
  assert.deepEqual(log.relics.map(r => r.name), ['Keen edge']);
  assert.equal(resume(log).players[0].relics.length, 1);
  assert.equal(replay(log, { maxTicks: 200 }).players[0].relics.length, 1);
});

test('a measured run reports waves, heroes and spending', () => {
  const r = playRun({ seed: 1, stage: 1, lineup: ['warrior', 'mage'], level: 10, gear: 'common', collect: true, maxTicks: 20 * 60 * 3 });
  const m = r.metrics;
  assert.ok(m.perWave.length >= 1 && m.heroes.length === 2);
  assert.ok(typeof m.cleared === 'number' && m.cleared >= 0);
  assert.ok(m.heroes.every(h => typeof h.damage === 'number'));
});

test('gear tiers grow and suit the hero', () => {
  const none = gearFor(['rogue'], 'none'), epic = gearFor(['rogue'], 'epic');
  assert.equal(Object.values(none).flat().length, 0);
  assert.ok(Object.values(epic).flat().length > 0);
});

test('the experiments cover every suite, and the quick set is smaller', () => {
  const full = suites({ seeds: 2 }), quick = suites({ quick: true });
  for (const s of ['forms', 'difficulty', 'relics', 'gear']) assert.ok(quick.some(j => j.suite === s), s);
  assert.ok(quick.length < full.length);
  assert.ok(full.filter(j => j.suite === 'relics').every(j => j.opts.stage === RELIC_SETUP.stage));
});

test('analysis and report work on synthetic results', () => {
  const run = (o) => ({ won: false, waves: 10, cleared: 9.5, lives: 0, minutes: 5, perWave: [{ wave: 1, leaks: 0, boss: null }], heroes: [{ id: 'warrior', damage: 100, ults: 1 }], relics: [], failWave: 10, ...o });
  const data = { at: new Date().toISOString(), engine: 0, seeds: 1, runs: [
    run({ suite: 'forms', mode: 'solo', hero: 'warrior', form: 'berserker', stage: 2 }),
    run({ suite: 'difficulty', stage: 1, level: 1, lineup: 'classic', won: true, waves: 15, lives: 20 }),
    run({ suite: 'relics', relic: null }), run({ suite: 'relics', relic: 'Keen edge', cleared: 12 }),
    run({ suite: 'gear', level: 1, gear: 'none' })] };
  const o = analyze(data);
  assert.ok(o.forms.length === 1 && o.relics.find(r => r.name === 'Keen edge').effect > 0);
  assert.ok(progress({ stage: 1, won: true, waves: 15, lives: 20 }) > 1);
  const html = buildReport(data, null);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Berserker/);
});
