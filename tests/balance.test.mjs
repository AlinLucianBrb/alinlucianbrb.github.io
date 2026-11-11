/* The balance tools: starting relics, the measurements, the experiments, the analysis and the report. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../js/engine/world.js';
import { replay, resume, exportLog } from '../js/engine/replay.js';
import { playRun } from '../tools/bot.mjs';
import { suites, RELIC_SETUP, formTeams, relicTeams, relicApplies } from '../tools/balance/suites.mjs';
import { RELICS } from '../js/content/data.js';
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
  for (const s of ['forms', 'comps', 'difficulty', 'relics', 'gear']) assert.ok(quick.some(j => j.suite === s), s);
  assert.ok(quick.length < full.length);
  assert.ok(full.filter(j => j.suite === 'relics').every(j => j.opts.stage === RELIC_SETUP.stage));
});

test('every team of three heroes with every form combination is tested', () => {
  const t = formTeams();
  assert.equal(t.length, 2268);   /* 84 hero teams x 27 form combinations */
  assert.equal(new Set(t.map(x => x.heroes.join())).size, 84);
  assert.equal(suites({ seeds: 1 }).filter(j => j.suite === 'comps').length, 2268);
});

test('every relic is tested on teams it does something for, each with a no-relic twin', () => {
  const jobs = suites({ seeds: 1 }).filter(j => j.suite === 'relics');
  for (const rel of RELICS) {
    const mine = jobs.filter(j => j.relic === rel.name);
    assert.ok(mine.length > 0, rel.name);
    for (const j of mine) assert.ok(jobs.some(b => !b.relic && b.team === j.team && b.seed === j.seed), rel.name + ' twin');
  }
  const pact = RELICS.find(r => r.name === 'Dark pact');
  assert.ok(relicTeams(pact).every(t => relicApplies(pact, t)));
});

test('analysis and report work on synthetic results', () => {
  const run = (o) => ({ won: false, waves: 10, cleared: 9.5, lives: 0, minutes: 5, perWave: [{ wave: 1, leaks: 0, boss: null }], heroes: [{ id: 'warrior', damage: 100, ults: 1 }], relics: [], failWave: 10, ...o });
  const data = { at: new Date().toISOString(), engine: 0, seeds: 1, runs: [
    run({ suite: 'forms', mode: 'solo', hero: 'warrior', form: 'berserker', stage: 2 }),
    run({ suite: 'difficulty', stage: 1, level: 1, lineup: 'classic', won: true, waves: 15, lives: 20 }),
    run({ suite: 'comps', ids: ['warrior', 'mage', 'warlock'], forms: ['berserker', 'firemage', 'occult'], stage: 4, cleared: 29.5 }),
    run({ suite: 'comps', ids: ['warrior', 'mage', 'warlock'], forms: ['berserker', 'firemage', 'summoner'], stage: 4, cleared: 28 }),
    run({ suite: 'relics', relic: null, team: 'a,b,c', forms: ['berserker', 'firemage', 'occult'] }),
    run({ suite: 'relics', relic: 'Keen edge', cleared: 12, team: 'a,b,c', forms: ['berserker', 'firemage', 'occult'] }),
    run({ suite: 'gear', level: 1, gear: 'none' })] };
  const o = analyze(data);
  assert.ok(o.forms.some(f => f.form === 'berserker') && o.relics.find(r => r.name === 'Keen edge').effect > 0);
  assert.ok(progress({ stage: 1, won: true, waves: 15, lives: 20 }) > 1);
  const html = buildReport(data, null);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Berserker/);
  assert.ok(o.forms.find(f => f.form === 'occult').value > 0);   /* a support is credited for what its team does */
  assert.match(html, /Teams of heroes/);
});

test('supports are judged as partners: their power does not depend on playing alone', async () => {
  const { roleOf, SOLO_WEIGHT } = await import('../tools/balance/roles.mjs');
  assert.equal(roleOf('occult'), 'support');
  assert.equal(roleOf('inquisitor'), 'semi');
  assert.equal(roleOf('berserker'), 'damage');
  assert.equal(SOLO_WEIGHT.support, 0);
  /* six teams: the Occult next to strong and weak partners; it never plays alone */
  const run = (forms, ids, cleared) => ({ suite: 'comps', ids, forms, stage: 5, seed: 1, won: false, waves: 30, cleared, lives: 0, minutes: 5, perWave: [], heroes: ids.map(id => ({ id, damage: 10, ults: 0 })), relics: [] });
  const data = { at: new Date().toISOString(), engine: 0, seeds: 1, runs: [
    run(['occult', 'lunar', 'earthcaller'], ['warlock', 'druid', 'shaman'], 34), run(['infernalist', 'lunar', 'earthcaller'], ['warlock', 'druid', 'shaman'], 32),
    run(['occult', 'animalic', 'witchdoctor'], ['warlock', 'druid', 'shaman'], 20), run(['infernalist', 'animalic', 'witchdoctor'], ['warlock', 'druid', 'shaman'], 24),
    run(['occult', 'naturist', 'totemist'], ['warlock', 'druid', 'shaman'], 26), run(['infernalist', 'naturist', 'totemist'], ['warlock', 'druid', 'shaman'], 27)] };
  const o = analyze(data), occ = o.forms.find(f => f.form === 'occult');
  assert.equal(occ.role, 'support');
  assert.ok(occ.partner > 0 && occ.carry < 0, `partner ${occ.partner}, carry ${occ.carry}`);
});
