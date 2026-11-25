/* Achievements: goals in two groups, by act (and Endless) and by hero, each with a reward claimed on the Achievements
   screen: gold, crafting materials (Scrap, Dust, Essence, Core: js/content/crafting.js) and sometimes a title to wear by
   the player's name. The server counts the progress and pays the rewards (sql/57-achievements.sql); the definitions are
   copied into its achievement_defs table by tools/content-sql.mjs, so this file is the one place to change them.

   An achievement: { id, group: 'act'|'hero', act?, hero?, kind, target, name, desc, gold, materials: [4], title? }.
   kinds (what is counted, from finished matches; the counters are COUNTER_KEYS below):
   - clear: different levels of the act won;  wins: matches won in the act;  bosses: bosses killed in the act's levels;
   - heroWins: matches won with the hero in the lineup;  heroAct: matches won in the act with the hero in the lineup;
   - endless: the best wave reached in Endless (the profile's endless_wave). */
import { ZONES, STAGES, HEROES } from './data.js';

export const ACT_TITLES = ['Meadowwalker', 'Forest Warden', 'Mirewalker', 'Canyon Breaker', 'Ashborn'];
export const HERO_TITLES = { warrior: 'Warlord', ranger: 'Hawkeye', mage: 'Arcanist', rogue: 'Shadowstep', druid: 'Wildheart',
  priest: 'Lightbringer', warlock: 'Soulbinder', paladin: 'Oathkeeper', shaman: 'Stormcaller' };
export const ACT_WINS = 15, ACT_BOSSES = 30, HERO_WINS = [5, 25], ENDLESS_WAVES = [25, 50, 100];

const levelsIn = act => STAGES.filter(s => s.zone === act).length;
/* Materials by act: early acts pay Scrap and Dust, later ones Essence and Cores. */
const mats = (act, k) => [[12, 4, 0, 0], [10, 6, 2, 0], [6, 8, 3, 1], [4, 8, 5, 2], [2, 6, 6, 4]][act - 1].map(n => n * k);

const ACTS = ZONES.flatMap((z, i) => {
  const act = i + 1, the = z.name;
  return [
    { id: 'act' + act + '_clear', group: 'act', act, kind: 'clear', target: levelsIn(act), name: 'Conqueror of the ' + the,
      desc: 'Win every level of Act ' + act + '.', gold: 300 * act, materials: mats(act, 1), title: ACT_TITLES[i] },
    { id: 'act' + act + '_wins', group: 'act', act, kind: 'wins', target: ACT_WINS, name: 'Veteran of the ' + the,
      desc: 'Win ' + ACT_WINS + ' matches in Act ' + act + '.', gold: 200 * act, materials: mats(act, 2) },
    { id: 'act' + act + '_bosses', group: 'act', act, kind: 'bosses', target: ACT_BOSSES, name: 'Bane of the ' + the,
      desc: 'Kill ' + ACT_BOSSES + ' bosses in Act ' + act + '.', gold: 400 * act, materials: mats(act, 2), title: 'Bane of the ' + the }
  ];
});
const ENDLESS_ACH = ENDLESS_WAVES.map((n, i) => ({ id: 'endless_' + n, group: 'act', act: 0, kind: 'endless', target: n, name: ['Into the dark', 'No end in sight', 'Endless'][i],
  desc: 'Reach wave ' + n + ' in Endless.', gold: 1000 * (i + 1), materials: [0, 4, 4, 2].map(m => m * (i + 1)), ...(i === 2 ? { title: 'the Endless' } : {}) }));
const HEROES_ACH = HEROES.flatMap(h => [
  { id: h.id + '_wins1', group: 'hero', hero: h.id, kind: 'heroWins', target: HERO_WINS[0], name: h.name + ': first steps',
    desc: 'Win ' + HERO_WINS[0] + ' matches with the ' + h.name + ' in your lineup.', gold: 200, materials: [6, 2, 0, 0] },
  { id: h.id + '_wins2', group: 'hero', hero: h.id, kind: 'heroWins', target: HERO_WINS[1], name: h.name + ': veteran',
    desc: 'Win ' + HERO_WINS[1] + ' matches with the ' + h.name + ' in your lineup.', gold: 600, materials: [8, 6, 2, 1] },
  { id: h.id + '_act5', group: 'hero', hero: h.id, act: ZONES.length, kind: 'heroAct', target: 1, name: h.name + ': ' + HERO_TITLES[h.id],
    desc: 'Win a level of Act ' + ZONES.length + ' with the ' + h.name + ' in your lineup.', gold: 1000, materials: [0, 4, 4, 2], title: HERO_TITLES[h.id] }
]);
export const ACHIEVEMENTS = [...ACTS, ...ENDLESS_ACH, ...HEROES_ACH];
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
export const TITLES = ACHIEVEMENTS.filter(a => a.title).map(a => a.title);

/* The server's counters (player_progress rows): 'win:<level>', 'boss:<level>' and 'hero:<hero>:<act>' (wins). */
export const COUNTER_KEYS = { win: s => 'win:' + s, boss: s => 'boss:' + s, hero: (h, act) => 'hero:' + h + ':' + act };

/* How far a player is with one achievement, from the counters ({ key: value }) and the profile. Mirrors
   achievement_progress() in sql/57-achievements.sql. */
export function progressOf(a, counters = {}, profile = {}) {
  const c = k => counters[k] | 0, levels = STAGES.map((s, i) => ({ n: i + 1, zone: s.zone })).filter(s => s.zone === a.act);
  switch (a.kind) {
    case 'clear': return levels.filter(s => c(COUNTER_KEYS.win(s.n)) > 0).length;
    case 'wins': return levels.reduce((n, s) => n + c(COUNTER_KEYS.win(s.n)), 0);
    case 'bosses': return levels.reduce((n, s) => n + c(COUNTER_KEYS.boss(s.n)), 0);
    case 'heroWins': return ZONES.reduce((n, _, i) => n + c(COUNTER_KEYS.hero(a.hero, i + 1)), 0);
    case 'heroAct': return c(COUNTER_KEYS.hero(a.hero, a.act));
    case 'endless': return profile.endless_wave | 0;
    default: return 0;
  }
}
export const isDone = (a, counters, profile) => progressOf(a, counters, profile) >= a.target;
