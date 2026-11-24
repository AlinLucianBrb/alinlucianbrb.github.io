/* Acts: what reaching each one unlocks, the waves of the first act, and the game speed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES, ENDLESS, stageOpen } from '../js/content/data.js';
import { TESTING, UNLOCK_ALL } from '../js/content/rules.js';
import { UNLOCKS, actReached, clearedFor, isUnlocked, unlocksOf, actMessage, actMilestone, maxSpeed, inMatch, actOfStage } from '../js/content/unlocks.js';
import { levelItemLevel, winItems, zoneItemLevels, levelDropText, endlessDropText } from '../js/content/level-drops.js';

test('the first act goes up to wave 55, and every level after it has 55', () => {
  assert.deepEqual(STAGES.slice(0, 5).map(s => s.waves), [15, 25, 35, 45, 55]);
  assert.ok(STAGES.slice(5).every(s => s.waves === 55));
});

test('an act is reached by beating the last level of the one before it', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 20, 25].map(actReached), [1, 1, 2, 2, 3, 5, 5]);
  assert.deepEqual([1, 2, 3].map(clearedFor), [0, 5, 10]);
  assert.ok(!isUnlocked('paths', 4) && isUnlocked('paths', 5)); assert.ok(!isUnlocked('paths', undefined));
  assert.deepEqual(unlocksOf(2), ['Evolution paths', 'Crafting', '2x game speed']); assert.deepEqual(unlocksOf(1), []);
});

test('a win that reaches a new act says what it unlocked', () => {
  assert.match(actMessage(4, 5), /^Act 2, Deep Forest, is open\. Unlocked: Evolution paths, Crafting, 2x game speed\.$/);
  assert.equal(actMessage(3, 4), ''); assert.equal(actMessage(5, 5), '', 'playing an old level again'); assert.match(actMessage(24, 25), /Endless/);
});

test('game speed: 1x to start with, 2x from act 2', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 25].map(c => maxSpeed(c)), [1, 1, 2, 2, 2, 2]); assert.equal(maxSpeed(25, true), 3, 'endless');
});

test('UNLOCK_ALL opens every level, Endless and feature, in the game and on the server; without it they are locked', async () => {
  const { rulesSql } = await import('../tools/rules-sql.mjs'), all = [...STAGES, ...ENDLESS], count = () => all.filter(s => stageOpen(s.n, 0)).length, features = () => Object.keys(UNLOCKS).filter(id => isUnlocked(id, 0)).length;
  assert.deepEqual([count(), features(), maxSpeed(0)], [1, 0, 1]);
  TESTING.unlockAll = true;
  try { assert.deepEqual([count(), features(), maxSpeed(0)], [30, Object.keys(UNLOCKS).length, 2]); assert.ok(!stageOpen(31, 0) && !stageOpen(0, 25), 'only levels there are'); } finally { TESTING.unlockAll = false; }
  assert.ok(rulesSql(true).includes("when 'shop' then 0") && /rule_stage_open[^;]*select true/.test(rulesSql(true)) && !/rule_stage_open[^;]*select true/.test(rulesSql(false)));
  for (const f of ['supabase-setup.sql', 'supabase-update.sql']) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(s.includes(rulesSql(UNLOCK_ALL)), f + ' is built with the switch as it is');
    assert.equal(s.match(/p_won and \(r\.players > 1 or r\.stage <= me\.levels_cleared\)/g).length + (s.match(/x\.levels_cleared and \(r\.players > 1 or r\.stage <= me\.levels_cleared\)/g) || []).length, 3, f + ': a level won out of order is not on the leaderboard');
  }
});
test('the server uses the same unlocks', async () => {
  const { rulesSql } = await import('../tools/rules-sql.mjs');
  for (const [id, u] of Object.entries(UNLOCKS)) assert.ok(rulesSql(false).includes("when '" + id + "' then " + clearedFor(u.act)));
  for (const f of ['supabase-setup.sql', 'supabase-update.sql'])
    assert.ok(readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes("levels_cleared >= public.rule_unlock('paths')"), f);
});

test('a feature unlocked in an act works on that act\'s levels and later ones, never back on an earlier act\'s', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 25, 26, 30].map(actOfStage), [1, 1, 2, 2, 3, 5, Infinity, Infinity], 'the act of a level; Endless comes after all');
  /* a player who reached Act 5 (20 levels cleared) */
  assert.deepEqual(['paths', 'shop', 'effects', 'speed2'].map(id => inMatch(id, 20, 3)), [false, false, false, false], 'all of them unlocked, but 1-3 is Act 1');
  assert.deepEqual(['paths', 'shop', 'effects', 'speed2'].map(id => inMatch(id, 20, 7)), [true, false, false, true], 'Act 2: paths and 2x');
  assert.deepEqual(['paths', 'shop', 'effects', 'speed2'].map(id => inMatch(id, 20, 12)), [true, true, false, true], 'Act 3');
  assert.deepEqual(['paths', 'shop', 'effects', 'speed2'].map(id => inMatch(id, 20, 18)), [true, true, true, true], 'Act 4');
  assert.ok(['paths', 'shop', 'effects'].every(id => inMatch(id, 25, 27)), 'Endless has them all');
  assert.equal(inMatch('shop', 5, 12), false, 'not reached yet: not even on a later level');
  assert.deepEqual([maxSpeed(20, false, 3), maxSpeed(20, false, 7), maxSpeed(20, true, 27), maxSpeed(20)], [1, 2, 3, 2]);
});

test('the screen for a new act: the zone, what it unlocks (icon and what it does) and its item levels; then the campaign end', () => {
  const m = actMilestone(4, 5);
  assert.equal(m.kind, 'act'); assert.equal(m.title, 'Act 2 · Deep Forest'); assert.equal(m.art, 'assets/level_2.png');
  assert.deepEqual(m.unlocks.map(u => u.id), ['paths', 'crafting', 'speed2']);
  assert.ok(m.unlocks.every(u => /^icon_/.test(u.icon) && u.desc.length > 10), 'each with its icon and what it does');
  assert.equal(m.text, 'Its levels drop items of level 18 to 30.');
  assert.equal(actMilestone(3, 4), null); assert.equal(actMilestone(5, 5), null, 'playing an old level again');
  assert.equal(actMilestone(14, 15).unlocks.length, 1, 'Act 4: match effects');
  const end = actMilestone(24, 25);
  assert.equal(end.kind, 'campaign'); assert.match(end.text, /Endless is open in every zone/); assert.deepEqual(end.unlocks, []);
});

test('what each level drops: item level 3 x the level, one item plus one per boss on a win; Endless from item level 75', () => {
  assert.deepEqual([1, 2, 3, 25].map(levelItemLevel), [3, 6, 9, 75]);
  assert.deepEqual([1, 2, 3, 25].map(winItems), [2, 2, 3, 3], 'the middle boss from level 3 on');
  assert.deepEqual(zoneItemLevels([6, 7, 8, 9, 10]), [18, 30]);
  assert.equal(levelDropText(8), 'Items: level 24 · 3 on a win');
  assert.match(endlessDropText(), /^Items: level 75\+, one per boss \(every 10 waves\)$/);
});
