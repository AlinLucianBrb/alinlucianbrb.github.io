/* The difficulty check: for each level, at its point on the progression curve (PROGRESSION in suites.mjs), how often the
   weakest and the strongest teams clear it. Teams are ranked by the comps suite (every form team on level 5, from the
   last balance run, or --rank FILE); the weakest tenth and the strongest tenth are played (a sample of them with --every
   N), and the single worst and best team several times.
   The targets (TARGET in suites.mjs): the weakest tenth clears about 40%, the strongest tenth about 60%, and the worst
   and best single team within 5 points of their tenth. Teams with a form in TARGET.exclude are left out (see there).

   npm run balance:tune                      every level, every 3rd team of each tenth (a few minutes)
   npm run balance:tune -- --levels 1,2      some levels
   npm run balance:tune -- --every 1         every team of each tenth (slower, steadier)
   --seeds N    runs per team (default 1); --extreme N  runs of the worst and best team (default 8); --workers N
   --try FILE   try changes without editing the game: a JSON file of overrides, e.g.
                { "stages": { "5": { "hpMult": 6, "growth": 1.1 } }, "forms": { "marksman": 1.8 }, "hex": 0.3 } */
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { STAGES } from '../../js/content/data.js';
import { PROGRESSION, TARGET, COMP_SETUP } from './suites.mjs';
import { progress } from './analyze.mjs';
import { runJobs } from './run.mjs';

const OUT = new URL('./out/', import.meta.url);

/* Form teams ranked weakest first, from the comps runs of a results file. */
export function rankTeams(data) {
  const by = new Map();
  for (const r of data.runs.filter(x => x.suite === 'comps' && !x.forms.some(f => TARGET.exclude.includes(f)))) {
    const k = r.forms.join(',');
    if (!by.has(k)) by.set(k, { ids: r.ids, forms: r.forms, ps: [] });
    by.get(k).ps.push(progress({ ...r, stage: COMP_SETUP.stage }));
  }
  return [...by.values()].map(t => ({ ids: t.ids, forms: t.forms, p: t.ps.reduce((a, b) => a + b, 0) / t.ps.length })).sort((a, b) => a.p - b.p);
}

/* The jobs for one level: the sampled tenths and the two extremes. */
export function tuneJobs(ranked, stage, { every = 3, seeds = 1, extreme = 8 } = {}) {
  const P = PROGRESSION[stage], n = Math.max(1, Math.round(ranked.length / 10)), jobs = [];
  const job = (group, t, seed) => ({ group, stage, team: t.forms.join(','), seed,
    opts: { seed, stage, lineup: t.ids, level: P.level, gear: P.gear, form: t.forms.join(','), paths: true } });
  ranked.slice(0, n).forEach((t, i) => { if (i % every === 0) for (let s = 1; s <= seeds; s++) jobs.push(job('weak', t, s)); });
  ranked.slice(-n).forEach((t, i) => { if (i % every === 0) for (let s = 1; s <= seeds; s++) jobs.push(job('strong', t, s)); });
  for (let s = 1; s <= extreme; s++) { jobs.push(job('worst', ranked[0], 100 + s)); jobs.push(job('best', ranked[ranked.length - 1], 100 + s)); }
  return jobs;
}

export function summarize(results) {
  const out = {};
  for (const r of results) {
    const o = out[r.stage] ||= { weak: [], strong: [], worst: [], best: [] };
    o[r.group].push(r);
  }
  const rate = a => (a.length ? Math.round(a.filter(r => r.won).length / a.length * 100) : null);
  const wave = a => (a.length ? Math.round(a.reduce((x, r) => x + (r.cleared ?? r.waves), 0) / a.length * 10) / 10 : null);
  return Object.entries(out).map(([stage, o]) => ({ stage: +stage, ...Object.fromEntries(['weak', 'strong', 'worst', 'best'].map(g => [g, rate(o[g])])),
    waves: Object.fromEntries(['weak', 'strong', 'worst', 'best'].map(g => [g, wave(o[g])])), n: { weak: o.weak.length, strong: o.strong.length } }));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
  const rankFile = args.rank ? new URL(args.rank, 'file://' + process.cwd() + '/') : new URL('results.json', OUT);
  if (!existsSync(rankFile)) { console.error('No team ranking: run npm run balance:report first (or --rank FILE).'); process.exit(1); }
  const ranked = rankTeams(JSON.parse(readFileSync(rankFile, 'utf8')));
  if (!ranked.length) { console.error('The results have no comps runs to rank teams by.'); process.exit(1); }
  const levels = args.levels ? String(args.levels).split(',').map(Number) : STAGES.filter(s => PROGRESSION[s.n]).map(s => s.n);
  const overrides = args.try ? JSON.parse(readFileSync(String(args.try), 'utf8')) : undefined;
  const jobs = levels.flatMap(st => tuneJobs(ranked, st, { every: +(args.every || 3), seeds: +(args.seeds || 1), extreme: +(args.extreme || 8) })).map(j => ({ ...j, overrides }));
  const t0 = Date.now();
  console.log(`Difficulty check: ${jobs.length} games (worst team ${ranked[0].forms.join('+')}, best ${ranked[ranked.length - 1].forms.join('+')})`);
  const res = await runJobs(jobs, +(args.workers || cpus().length));
  const bad = res.filter(r => r.error); if (bad.length) console.log(bad.length + ' games failed: ' + bad[0].error.split('\n')[0]);
  const rows = summarize(res.filter(r => !r.error));
  const pad = (s, n) => String(s ?? '–').padStart(n);
  console.log(`\nLevel  setup          weak 10%  strong 10%  worst  best   (target ${TARGET.weak}% / ${TARGET.strong}%, extremes within ${TARGET.spread})`);
  for (const r of rows) {
    const P = PROGRESSION[r.stage];
    console.log(`${pad(r.stage, 3)}    lvl ${pad(P.level, 2)} ${P.gear.padEnd(6)}  ${pad(r.weak + '%', 6)}    ${pad(r.strong + '%', 6)}    ${pad(r.worst + '%', 5)}  ${pad(r.best + '%', 5)}   waves ${r.waves.weak}/${r.waves.strong} of ${STAGES[r.stage - 1].waves}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('tune.json', OUT), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith('tune.mjs')) main().catch(e => { console.error(e); process.exit(1); });
