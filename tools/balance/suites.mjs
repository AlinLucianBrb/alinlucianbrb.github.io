/* The balance experiments: each suite is a list of jobs (playRun options plus what the job is about). The runner
   (run.mjs) plays them all, analyze.mjs turns the results into the numbers the report shows.
   - forms:      every evolution form alone (levels 2 and 3), taken as an evolution path, at player level 10 with rare gear:
                 who holds up alone, who kills bosses;
   - comps:      every team of three different heroes with every combination of their forms (84 hero teams, 2268 form
                 teams) on level 5: how well each form's teams do against the average team, overall, next to strong
                 partners and next to weak ones (so supports, whose worth is in what they add to the others, are judged
                 fairly), the best and worst teams and pairs;
   - difficulty: every level at player levels 1, 10, 20 and 30 (gear growing with them: none, common, rare, epic) with three
                 different lineups: win rate, how far runs get, where they fail, leaks per wave;
   - relics:     every relic, one at a time, given at the start (two Rare copies) to several teams it does something for,
                 the bot shopping as usual, against the same teams and seeds with no relic given, on level 5 (where runs
                 fail, so every relic shows in how far they get); the smart bot's picks in the other suites give pick rates;
   - gear:       player level x gear tier on level 4: how much talents and items each add.
   seeds: how many runs per setting (more is steadier, slower); compSeeds: the same for the comps (one is already 2268
   games). quick: one seed and fewer settings (a sample of the teams). */
import { HEROES, RELICS, STAGES } from '../../js/content/data.js';
import { playedDef } from './gear.mjs';
import { affected } from '../../js/engine/stats.js';

export const LINEUPS = {
  classic: ['warrior', 'ranger', 'mage'],
  holy:    ['paladin', 'druid', 'warlock'],
  cunning: ['rogue', 'priest', 'shaman']
};
export const GEAR_BY_LEVEL = { 1: 'none', 10: 'common', 20: 'rare', 30: 'epic' };
/* Relics: each one in `comps` teams it does something for, `seeds` runs each, with and without it. */
export const RELIC_SETUP = { stage: 5, level: 10, gear: 'common', copies: [2, 2], comps: 6, seeds: 2 };
/* Forms alone on two levels; every team on a harder one (hard enough that they do not all win). */
export const FORM_SETUP = { solo: [2, 3], level: 10, gear: 'rare' };
/* Teams on the last level, where even the best teams rarely win: a clean win is the top score, so on an easier level
   what a support adds to a strong team would be cut off. */
export const COMP_SETUP = { stage: 5, level: 10, gear: 'rare' };

/* Every team of three different heroes, with every combination of their forms: [{ heroes: [ids], forms: [ids] }]. */
export function formTeams() {
  const out = [];
  for (let i = 0; i < HEROES.length; i++) for (let j = i + 1; j < HEROES.length; j++) for (let k = j + 1; k < HEROES.length; k++) {
    const hs = [HEROES[i], HEROES[j], HEROES[k]], cs = hs.map(h => h.evolutions[0].choices.map(c => c.id));
    for (const a of cs[0]) for (const b of cs[1]) for (const c of cs[2]) out.push({ heroes: hs.map(h => h.id), forms: [a, b, c] });
  }
  return out;
}
/* Does a relic do anything for this team? Relics limited to some heroes need one of them; the rest need a hero of the
   types they boost (economy and gate relics always count). */
export function relicApplies(rel, team) {
  if (rel.lineup && !rel.lineup.some(id => team.heroes.includes(id))) return false;
  const a = affected(rel, 1, team.heroes.map((id, k) => ({ type: k, def: playedDef(id, team.forms[k]) })));
  return a.global || a.types.size > 0;
}
/* A fixed shuffle, so the same teams are picked every run. */
function shuffled(list, seed = 7) {
  const a = [...list]; let x = seed;
  for (let i = a.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) % 2147483648; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* The teams each relic is tested with: the first `n` of a fixed shuffle that it does something for. */
export function relicTeams(rel, n = RELIC_SETUP.comps) { return shuffled(formTeams()).filter(t => relicApplies(rel, t)).slice(0, n); }
export const GEAR_STAGE = 4;

export function suites({ seeds = 3, quick = false, compSeeds = 1 } = {}) {
  const S = Array.from({ length: quick ? 1 : seeds }, (_, i) => i + 1), jobs = [];
  /* forms */
  for (const h of HEROES) for (const c of h.evolutions[0].choices) {
    for (const stage of quick ? [FORM_SETUP.solo[0]] : FORM_SETUP.solo) for (const seed of S)
      jobs.push({ suite: 'forms', mode: 'solo', hero: h.id, form: c.id, stage, seed, opts: { seed, stage, lineup: [h.id], level: FORM_SETUP.level, gear: FORM_SETUP.gear, form: c.id, paths: true } });
  }
  /* comps: every form team (quick: every 12th) */
  const C = COMP_SETUP, all = formTeams();
  for (const [n, t] of all.entries()) if (!quick || n % 12 === 0) for (let seed = 1; seed <= (quick ? 1 : compSeeds); seed++)
    jobs.push({ suite: 'comps', ids: t.heroes, forms: t.forms, seed, opts: { seed, stage: C.stage, lineup: t.heroes, level: C.level, gear: C.gear, form: t.forms.join(','), paths: true } });
  /* difficulty */
  for (const st of STAGES) for (const level of quick ? [10] : [1, 10, 20, 30]) for (const name of quick ? ['classic'] : Object.keys(LINEUPS)) for (const seed of S)
    jobs.push({ suite: 'difficulty', stage: st.n, level, lineup: name, seed, opts: { seed, stage: st.n, lineup: LINEUPS[name], level, gear: GEAR_BY_LEVEL[level] } });
  /* relics */
  const R = RELIC_SETUP;
  const RS = Array.from({ length: quick ? 1 : R.seeds }, (_, i) => i + 1), bases = new Map();
  const job = (relic, t, seed) => ({ suite: 'relics', relic, team: t.forms.join(','), ids: t.heroes, forms: t.forms, seed,
    opts: { seed, stage: R.stage, lineup: t.heroes, level: R.level, gear: R.gear, form: t.forms.join(','), paths: true, relics: true,
      startRelics: relic ? R.copies.map(ri => ({ name: relic, ri })) : [] } });
  for (const rel of RELICS) for (const t of relicTeams(rel, quick ? 2 : R.comps)) for (const seed of RS) {
    jobs.push(job(rel.name, t, seed));
    const key = t.forms.join(',') + '#' + seed;
    if (!bases.has(key)) { bases.set(key, true); jobs.push(job(null, t, seed)); }   /* the same team and seed with no relic */
  }
  /* gear x talents */
  for (const level of quick ? [1, 30] : [1, 10, 20, 30]) for (const gear of quick ? ['none', 'epic'] : ['none', 'common', 'rare', 'epic']) for (const seed of S)
    jobs.push({ suite: 'gear', level, gear, seed, opts: { seed, stage: GEAR_STAGE, lineup: LINEUPS.classic, level, gear } });
  return jobs;
}
