/* The balance experiments: each suite is a list of jobs (playRun options plus what the job is about). The runner
   (run.mjs) plays them all, analyze.mjs turns the results into the numbers the report shows.
   - forms:      every evolution form, alone (levels 2 and 3) and in a team of three (level 4), taken as an evolution path, at
                 player level 10 with rare gear: who is weak, who is strong, who carries a team, who kills bosses;
   - difficulty: every level at player levels 1, 10, 20 and 30 (gear growing with them: none, common, rare, epic) with three
                 different lineups: win rate, how far runs get, where they fail, leaks per wave;
   - relics:     one relic at a time given at the start (two Rare copies), the bot shopping as usual, against the same runs
                 with no relic given, on level 5 (where runs fail, so every relic shows in how far they get); the smart
                 bot's picks in the other suites give pick rates;
   - gear:       player level x gear tier on level 4: how much talents and items each add.
   seeds: how many runs per setting (more is steadier, slower). quick: one seed and fewer settings. */
import { HEROES, RELICS, STAGES } from '../../js/content/data.js';

export const LINEUPS = {
  classic: ['warrior', 'ranger', 'mage'],
  holy:    ['paladin', 'druid', 'warlock'],
  cunning: ['rogue', 'priest', 'shaman']
};
export const GEAR_BY_LEVEL = { 1: 'none', 10: 'common', 20: 'rare', 30: 'epic' };
/* Partners for a form tested in a team: two heroes that are neither it nor support-only. */
const PARTNERS = ['warrior', 'mage', 'ranger', 'rogue'];
export const RELIC_SETUP = { stage: 5, level: 10, gear: 'common', lineup: ['warrior', 'mage', 'druid'], form: 'berserker,firemage,animalic', copies: [2, 2], seeds: 4 };
/* Forms: alone on two levels, in a team on a harder one (hard enough that they do not all win). */
export const FORM_SETUP = { solo: [2, 3], team: 4, level: 10, gear: 'rare' };
export const GEAR_STAGE = 4;

export function suites({ seeds = 3, quick = false } = {}) {
  const S = Array.from({ length: quick ? 1 : seeds }, (_, i) => i + 1), jobs = [];
  /* forms */
  for (const h of HEROES) for (const c of h.evolutions[0].choices) {
    for (const stage of quick ? [FORM_SETUP.solo[0]] : FORM_SETUP.solo) for (const seed of S)
      jobs.push({ suite: 'forms', mode: 'solo', hero: h.id, form: c.id, stage, seed, opts: { seed, stage, lineup: [h.id], level: FORM_SETUP.level, gear: FORM_SETUP.gear, form: c.id, paths: true } });
    const partners = PARTNERS.filter(p => p !== h.id).slice(0, 2);
    for (const seed of S)
      jobs.push({ suite: 'forms', mode: 'team', hero: h.id, form: c.id, stage: FORM_SETUP.team, seed, opts: { seed, stage: FORM_SETUP.team, lineup: [h.id, ...partners], level: FORM_SETUP.level, gear: FORM_SETUP.gear, form: c.id, paths: true } });
  }
  /* difficulty */
  for (const st of STAGES) for (const level of quick ? [10] : [1, 10, 20, 30]) for (const name of quick ? ['classic'] : Object.keys(LINEUPS)) for (const seed of S)
    jobs.push({ suite: 'difficulty', stage: st.n, level, lineup: name, seed, opts: { seed, stage: st.n, lineup: LINEUPS[name], level, gear: GEAR_BY_LEVEL[level] } });
  /* relics */
  const R = RELIC_SETUP;
  const RS = Array.from({ length: quick ? 1 : Math.max(seeds, R.seeds) }, (_, i) => i + 1);
  for (const relic of [null, ...RELICS.map(r => r.name)]) for (const seed of RS)
    jobs.push({ suite: 'relics', relic, seed, opts: { seed, stage: R.stage, lineup: R.lineup, level: R.level, gear: R.gear, form: R.form, paths: true, relics: true,
      startRelics: relic ? R.copies.map(ri => ({ name: relic, ri })) : [] } });
  /* gear x talents */
  for (const level of quick ? [1, 30] : [1, 10, 20, 30]) for (const gear of quick ? ['none', 'epic'] : ['none', 'common', 'rare', 'epic']) for (const seed of S)
    jobs.push({ suite: 'gear', level, gear, seed, opts: { seed, stage: GEAR_STAGE, lineup: LINEUPS.classic, level, gear } });
  return jobs;
}
