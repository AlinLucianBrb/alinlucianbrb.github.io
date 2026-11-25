/* Achievements (js/content/achievements.js, sql/57-achievements.sql, js/screens/achievements.js): the goals, how progress is
   counted from the server's counters, the database copy, and the screen against a fake page and server. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';
import { ZONES, STAGES, HEROES } from '../js/content/data.js';
import { ACHIEVEMENTS, ACHIEVEMENT, TITLES, COUNTER_KEYS, progressOf, isDone } from '../js/content/achievements.js';

const sql = readFileSync(new URL('../supabase-update.sql', import.meta.url), 'utf8');
const levelsOf = act => STAGES.map((s, i) => ({ n: i + 1, zone: s.zone })).filter(s => s.zone === act).map(s => s.n);

test('achievements: three per act, three for Endless, three per hero; unique ids and titles, rewards for every one', () => {
  assert.equal(ACHIEVEMENTS.length, ZONES.length * 3 + 3 + HEROES.length * 3);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
  assert.equal(new Set(TITLES).size, TITLES.length, 'no title twice');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.desc && a.target > 0 && a.gold > 0, a.id);
    assert.equal(a.materials.length, 4, a.id);
    assert.ok(/^[a-z0-9_]+$/.test(a.id), 'database-safe id ' + a.id);
  }
  for (const h of HEROES) assert.equal(ACHIEVEMENTS.filter(a => a.hero === h.id).length, 3, h.id);
  assert.equal(ACHIEVEMENT.act1_clear.target, levelsOf(1).length);
});

test('progress: levels won, wins and bosses count in their act only; hero wins add up over the acts; Endless is the best wave', () => {
  const [a, b] = levelsOf(1), other = levelsOf(2)[0];
  const c = { [COUNTER_KEYS.win(a)]: 3, [COUNTER_KEYS.win(b)]: 1, [COUNTER_KEYS.win(other)]: 9, [COUNTER_KEYS.boss(a)]: 4,
    [COUNTER_KEYS.hero('warrior', 1)]: 2, [COUNTER_KEYS.hero('warrior', 5)]: 1 };
  assert.equal(progressOf(ACHIEVEMENT.act1_clear, c), 2, 'two different levels won');
  assert.equal(progressOf(ACHIEVEMENT.act1_wins, c), 4);
  assert.equal(progressOf(ACHIEVEMENT.act1_bosses, c), 4);
  assert.equal(progressOf(ACHIEVEMENT.act2_wins, c), 9);
  assert.equal(progressOf(ACHIEVEMENT.warrior_wins1, c), 3);
  assert.equal(isDone(ACHIEVEMENT.warrior_act5, c), true);
  assert.equal(isDone(ACHIEVEMENT.ranger_act5, c), false);
  assert.equal(progressOf(ACHIEVEMENT.endless_25, c, { endless_wave: 30 }), 30);
  assert.equal(isDone(ACHIEVEMENT.endless_50, c, { endless_wave: 30 }), false);
});

test('the server: every goal is in achievement_defs, finish_run counts the match, claiming and titles are checked there', () => {
  for (const a of ACHIEVEMENTS) assert.ok(sql.includes("('" + a.id + "', '" + a.group + "'"), 'defs row for ' + a.id);
  assert.match(sql, /create table if not exists public\.player_progress/);
  assert.match(sql, /create table if not exists public\.player_achievements/);
  assert.match(sql, /alter table public\.profiles add column if not exists title text/);
  assert.match(sql, /perform public\.track_run\(auth\.uid\(\), r\.stage, p_won, p_bosses/);
  assert.match(sql, /'not done yet'/); assert.match(sql, /'already claimed'/); assert.match(sql, /'that title is not unlocked'/);
  assert.match(sql, /grant execute on function public\.claim_achievement\(text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.set_title\(text\) to authenticated/);
  assert.match(sql, /revoke all on function public\.track_run\(uuid, int, boolean, int, text\[\]\) from public, anon, authenticated/);
  assert.match(sql, /revoke insert, update, delete on public\.player_progress, public\.player_achievements from anon, authenticated/);
  for (const k of ['clear', 'wins', 'bosses', 'heroWins', 'heroAct', 'endless'])
    assert.ok(sql.includes("when '" + k + "' then"), 'the server counts ' + k);
});

/* ---- The screen ---- */
const dom = installFakeDom();
const claims = [], titles = [];
const counters = { [COUNTER_KEYS.win(levelsOf(1)[0])]: 20, [COUNTER_KEYS.hero('mage', 1)]: 5 };
mock.module(new URL('../js/services/api.js', import.meta.url).href, { namedExports: {
  getItems: async () => ({ items: [] }), getGems: async () => ({ gems: [] }), saveLoadout: async () => ({}),
  getAchievements: async () => ({ counters, claimed: ['endless_25'] }),
  claimAchievement: async id => { claims.push(id); return { profile: { gold: 999 } }; },
  setTitle: async t => { titles.push(t); return { profile: { title: t } }; }
} });
const { state } = await import('../js/core/state.js');
const screen = (await import('../js/screens/achievements.js')).default;
const { claimable, unlockedTitles } = await import('../js/screens/achievements.js');
const { byId } = dom;
const find = (root, pred) => (pred(root) ? root : root.children.map(c => find(c, pred)).find(Boolean));
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const tabBtn = id => Object.assign(document.createElement('button'), { dataset: { tab: id } });
byId.acTabs = byId.acTabs || document.getElementById('acTabs');
byId.acTabs.querySelectorAll = () => byId.acTabs.children;
byId.acTabs.children.push(tabBtn('act'), tabBtn('hero'));

test('screen: a column per act and Endless; Claim only on finished goals not claimed yet; the menu count agrees', async () => {
  state.profile = { username: 'Tester', gold: 0, title: null, endless_wave: 0 };
  await screen.mount();
  assert.equal(byId.acBody.children.length, ZONES.length + 1);
  const claimBtns = findAll(byId.acBody, e => e.tag === 'button' && e._text === 'Claim');
  assert.equal(claimBtns.length, 1, 'only Act 1 wins is done (20 wins on one level: not every level, no bosses)');
  assert.equal(claimable(counters, ['endless_25'], state.profile), 2, 'and the Mage’s 5 wins (Heroes tab)');
  claimBtns[0].onclick();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(claims, ['act1_wins'], 'claimed through the server');
  assert.equal(findAll(byId.acBody, e => e.tag === 'button' && e._text === 'Claim').length, 0, 'no second claim');
  assert.equal(state.profile.gold, 999);
});

test('screen: Heroes tab shows a block per hero; titles come from claimed achievements only', async () => {
  byId.acTabs.children[1].onclick();
  assert.equal(byId.acBody.children.length, HEROES.length);
  assert.deepEqual(unlockedTitles(['act1_wins', 'act1_clear', 'mage_act5']), [ACHIEVEMENT.act1_clear.title, ACHIEVEMENT.mage_act5.title]);
});
