/* The balance runner: plays every experiment (suites.mjs) on worker threads, saves the results and builds the HTML report.

   npm run balance:report                    the full set (3 seeds, every team once; about 3000 games)
   npm run balance:report -- --quick         one seed, fewer settings, a sample of the teams (a few minutes)
   npm run balance:report -- --comp-seeds 2  every team twice
   npm run balance:report -- --seeds 5       steadier numbers, slower
   npm run balance:report -- --only forms    one suite (forms, comps, difficulty, relics, gear, curve); the others keep last time's results
   The curve suite runs last: every level at its point on the progression curve, with the weakest and strongest tenth of
   teams as ranked by this run's comps (or the kept ones), against the targets (TARGET in suites.mjs).
   --workers N                               threads (default: one per CPU core)

   Writes tools/balance/out/results.json (the previous one becomes results.prev.json, so the report can show what changed)
   and tools/balance/out/balance-report.html. Open the report in a browser. */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { buildReport } from './report.mjs';
import { ENGINE_VERSION } from '../../js/engine/world.js';
import { rankTeams, tuneJobs } from './tune.mjs';
import { suites, PROGRESSION } from './suites.mjs';
import { STAGES } from '../../js/content/data.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });

export async function runJobs(jobs, workers = cpus().length, onProgress = () => {}) {
  const results = new Array(jobs.length); let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, jobs.length)) }, () => new Promise((resolve, reject) => {
    const wk = new Worker(new URL('./worker.mjs', import.meta.url));
    const feed = () => { if (next >= jobs.length) { wk.terminate(); resolve(); return; } const id = next++; wk.postMessage({ id, opts: jobs[id].opts, overrides: jobs[id].overrides }); };
    wk.on('message', m => {
      const { opts, overrides, ...about } = jobs[m.id];
      results[m.id] = m.ok ? { ...about, ...m.metrics } : { ...about, error: m.error };
      onProgress(++done, jobs.length); feed();
    });
    wk.on('error', reject);
    feed();
  })));
  return results;
}

async function main() {
  const quick = !!args.quick, seeds = +(args.seeds || 3), only = args.only && String(args.only).split(',');
  let jobs = suites({ seeds, quick, compSeeds: +(args['comp-seeds'] || 1) });
  if (only) jobs = jobs.filter(j => only.includes(j.suite));
  const wantCurve = !only || only.includes('curve');
  const t0 = Date.now(), workers = +(args.workers || cpus().length);
  console.log(`Balance run: ${jobs.length} games on ${workers} threads${quick ? ' (quick)' : ''}…`);
  let last = 0;
  const runs = await runJobs(jobs, workers, (d, n) => { const pct = Math.floor(d / n * 20); if (pct > last) { last = pct; process.stdout.write(`\r  ${d} / ${n}`); } });
  console.log(`\r  ${runs.length} games in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  /* the difficulty curve: needs a team ranking, from this run's comps or the kept ones */
  if (wantCurve) {
    const file0 = new URL('results.json', OUT);
    const comps = runs.some(r => r.suite === 'comps') ? runs : existsSync(file0) ? JSON.parse(readFileSync(file0, 'utf8')).runs : [];
    const ranked = rankTeams({ runs: comps.filter(r => !r.error) });
    if (ranked.length) {
      const cj = STAGES.filter(st => PROGRESSION[st.n]).flatMap(st => tuneJobs(ranked, st.n, { every: quick ? 6 : 2, extreme: quick ? 2 : 6 })).map(j => ({ ...j, suite: 'curve' }));
      console.log(`  Difficulty curve: ${cj.length} games…`);
      runs.push(...await runJobs(cj, workers));
    }
  }
  const bad = runs.filter(r => r.error);
  if (bad.length) console.log('  ' + bad.length + ' games failed, e.g.: ' + bad[0].error.split('\n')[0]);
  /* Keep last time's results for the suites not run now, and for the comparison. */
  const file = new URL('results.json', OUT), prevFile = new URL('results.prev.json', OUT);
  let keep = [];
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    copyFileSync(file, prevFile);
    if (only) keep = old.runs.filter(r => !only.includes(r.suite) && !(wantCurve && r.suite === 'curve'));
  }
  const data = { at: new Date().toISOString(), engine: ENGINE_VERSION, seeds: quick ? 1 : seeds, quick, runs: [...keep, ...runs.filter(r => !r.error)] };
  writeFileSync(file, JSON.stringify(data));
  const prev = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, 'utf8')) : null;
  const html = buildReport(data, prev);
  writeFileSync(new URL('balance-report.html', OUT), html);
  console.log('  Report: tools/balance/out/balance-report.html');
}

if (process.argv[1] && process.argv[1].endsWith('run.mjs')) main().catch(e => { console.error(e); process.exit(1); });
