/* Turns the balance runs (results.json) into the numbers the report shows, and the red flags.
   progress: how far a run got, 0 to 1 (waves cleared, plus the share of the last wave's enemies killed, over the waves in
   the level), plus up to 0.25 for lives kept on a win, so
   two wins can still be told apart. Power of a form (0 to 100): half how far it gets alone, half how much it carries a
   team (its damage share, where a third is a fair share, times how far the team got). */
import { HEROES, RELICS, STAGES } from '../../js/content/data.js';
import { RELIC_SETUP, FORM_SETUP, GEAR_STAGE } from './suites.mjs';
import { playedDef } from './gear.mjs';
import { affected } from '../../js/engine/stats.js';
const SOLO = FORM_SETUP.solo;

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = a => (a.length ? Math.round(a.filter(Boolean).length / a.length * 100) : null);
const r1 = x => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const maxWave = s => STAGES[s - 1].waves;
export const progress = r => Math.min(1, (r.cleared ?? r.waves) / maxWave(r.stage || 1)) + (r.won ? 0.25 * Math.min(1, r.lives / 20) : 0);
const formName = id => { for (const h of HEROES) { const c = h.evolutions[0].choices.find(x => x.id === id); if (c) return c.name; } return id; };
const heroName = id => (HEROES.find(h => h.id === id) || { name: id }).name;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function analyze(data) {
  const runs = data.runs, by = suite => runs.filter(r => r.suite === suite);
  const out = { at: data.at, engine: data.engine, seeds: data.seeds, games: runs.length, minutes: r1(runs.reduce((a, r) => a + (r.minutes || 0), 0)) };

  /* ---- forms ---- */
  const F = by('forms'), forms = [];
  for (const h of HEROES) for (const c of h.evolutions[0].choices) {
    const solo = F.filter(r => r.form === c.id && r.mode === 'solo'), team = F.filter(r => r.form === c.id && r.mode === 'team');
    if (!solo.length && !team.length) continue;
    const share = team.map(r => { const tot = r.heroes.reduce((a, x) => a + x.damage, 0); const me = r.heroes.find(x => x.id === h.id); return tot > 0 && me ? me.damage / tot : 0; });
    const bossT = solo.flatMap(r => r.perWave.filter(v => v.boss !== null).map(v => (v.boss === 'escaped' ? 999 : v.boss)));
    const soloP = mean(solo.map(progress)), teamP = mean(team.map(progress)), sh = mean(share);
    const power = 100 * (0.5 * (soloP ?? 0) / 1.25 + 0.5 * Math.min(1, (sh ?? 0) * 3) * (teamP ?? 0) / 1.25);
    forms.push({ hero: h.id, heroName: h.name, form: c.id, formName: c.name,
      solo1: pct(solo.filter(r => r.stage === SOLO[0]).map(r => r.won)), solo2: pct(solo.filter(r => r.stage === SOLO[1]).map(r => r.won)),
      soloWave: r1(mean(solo.map(r => r.waves / maxWave(r.stage) * 100))), team: pct(team.map(r => r.won)), share: r1((sh ?? 0) * 100),
      boss: bossT.length ? r1(mean(bossT.filter(x => x < 999))) : null, bossEsc: bossT.length ? Math.round(bossT.filter(x => x >= 999).length / bossT.length * 100) : null,
      ults: r1(mean([...solo, ...team].map(r => (r.heroes.find(x => x.id === h.id) || {}).ults || 0))), power: r1(power), support: !!(c.aura && c.aura.harmless), amp: (c.tags || []).includes('curse') });
  }
  out.forms = forms.sort((a, b) => b.power - a.power);
  out.heroes = HEROES.map(h => { const f = forms.filter(x => x.hero === h.id && !x.support);   /* support-only forms are judged by their team, not by power */ return { hero: h.id, name: h.name, power: r1(mean(f.map(x => x.power))), best: f[0] && f.reduce((a, b) => (b.power > a.power ? b : a)).formName, worst: f[0] && f.reduce((a, b) => (b.power < a.power ? b : a)).formName, spread: f.length ? r1(Math.max(...f.map(x => x.power)) - Math.min(...f.map(x => x.power))) : null }; })
    .filter(x => x.power !== null).sort((a, b) => b.power - a.power);

  /* ---- difficulty ---- */
  const D = by('difficulty'), levels = [...new Set(D.map(r => r.level))].sort((a, b) => a - b), lineups = [...new Set(D.map(r => r.lineup))];
  out.levels = levels;
  out.difficulty = STAGES.map(st => ({ stage: st.n, name: st.name, waves: st.waves, cells: levels.map(L => {
    const rs = D.filter(r => r.stage === st.n && r.level === L);
    return { level: L, win: pct(rs.map(r => r.won)), wave: r1(mean(rs.map(r => r.waves))), lives: r1(mean(rs.map(r => r.lives))), minutes: r1(mean(rs.map(r => r.minutes))), n: rs.length,
      lineups: Object.fromEntries(lineups.map(n => [n, pct(rs.filter(r => r.lineup === n).map(r => r.won))])) };
  }) }));
  /* Survival: the share of runs still going at the start of each wave; leaks: lives lost per wave (average). */
  out.survival = STAGES.map(st => ({ stage: st.n, curves: levels.map(L => {
    const rs = D.filter(r => r.stage === st.n && r.level === L);
    return { level: L, alive: Array.from({ length: st.waves }, (_, i) => (rs.length ? Math.round(rs.filter(r => r.waves >= i + 1).length / rs.length * 100) : null)),   /* still going at the start of wave i + 1 */
      leaks: Array.from({ length: st.waves }, (_, i) => r1(mean(rs.map(r => (r.perWave[i] ? r.perWave[i].leaks : 0))))) };
  }) }));
  out.failWaves = STAGES.map(st => {
    const lost = D.filter(r => r.stage === st.n && !r.won), counts = {};
    for (const r of lost) counts[r.failWave] = (counts[r.failWave] || 0) + 1;
    return { stage: st.n, lost: lost.length, onBoss: lost.filter(r => r.perWave.some(v => v.wave === r.failWave && v.boss === 'escaped')).length, top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => ({ wave: +w, n })) };
  });

  /* ---- relics ---- */
  const R = by('relics'), base = R.filter(r => !r.relic), b0 = mean(base.map(r => progress({ ...r, stage: RELIC_SETUP.stage })));
  out.relicSetup = RELIC_SETUP;
  out.relicBase = { progress: r1((b0 ?? 0) * 100), wave: r1(mean(base.map(r => r.waves))), win: pct(base.map(r => r.won)) };
  const picks = runs.filter(r => r.suite !== 'relics' && r.relics);
  out.relics = RELICS.map(rel => {
    const rs = R.filter(r => r.relic === rel.name), p = mean(rs.map(r => progress({ ...r, stage: RELIC_SETUP.stage })));
    /* does it do anything for the test lineup? (economy and gate relics always do) */
    const team = RELIC_SETUP.lineup.map((id, k) => ({ type: k, def: playedDef(id, RELIC_SETUP.form.split(',').find(f => playedDef(id, f) !== playedDef(id))) }));
    const a = affected(rel, 1, team), applies = (!rel.lineup || rel.lineup.some(id => RELIC_SETUP.lineup.includes(id))) && (a.global || a.types.size > 0);
    const n = picks.reduce((a, r) => a + r.relics.filter(x => x.name === rel.name).length, 0);
    return { name: rel.name, applies, effect: !applies || p === null || b0 === null ? null : r1((p - b0) * 100), wave: r1(mean(rs.map(r => r.waves))), win: pct(rs.map(r => r.won)),
      picks: n, perRun: picks.length ? r1(n / picks.length) : null };
  }).sort((a, b) => (b.effect ?? -1e9) - (a.effect ?? -1e9));

  /* ---- gear x talents ---- */
  const G = by('gear'), gears = ['none', 'common', 'rare', 'epic'].filter(g => G.some(r => r.gear === g)), glevels = [...new Set(G.map(r => r.level))].sort((a, b) => a - b);
  out.gear = { gears, levels: glevels, cells: glevels.map(L => gears.map(g => { const rs = G.filter(r => r.level === L && r.gear === g); return { win: pct(rs.map(r => r.won)), wave: r1(mean(rs.map(r => r.waves))), progress: r1((mean(rs.map(r => progress({ ...r, stage: GEAR_STAGE }))) ?? 0) * 100) }; })) };

  out.flags = flags(out);
  return out;
}

/* Red flags: what stands out enough to look at. */
function flags(o) {
  const f = [], add = (level, area, text) => f.push({ level, area, text });
  const P = o.forms.filter(x => !x.support).map(x => x.power), m = median(P);
  for (const x of o.forms) {
    if (x.support) { add('info', 'Forms', `${x.formName} deals no damage by design: judge it by its team's win rate (${x.team}%), not its power.`); continue; }
    if (x.amp) add('info', 'Forms', `${x.formName} works by making the others hit harder, so its own damage share (${x.share}%) undersells it: its team won ${x.team}% of level ${FORM_SETUP.team}.`);
    if (m && x.power < m * 0.6) add('high', 'Forms', `${x.formName} (${x.heroName}) is weak: power ${x.power} against a median of ${r1(m)}; alone it wins ${x.solo1 ?? '–'}% of level ${SOLO[0]}.`);
    else if (m && x.power > m * 1.45) add('high', 'Forms', `${x.formName} (${x.heroName}) is strong: power ${x.power} against a median of ${r1(m)}.`);
    if (x.bossEsc !== null && x.bossEsc >= 50) add('mid', 'Bosses', `${x.formName} alone lets ${x.bossEsc}% of bosses through.`);
  }
  for (const h of o.heroes) if (h.spread !== null && h.spread > 35) add('mid', 'Heroes', `${h.name}'s forms are far apart: ${h.best} vs ${h.worst} (${h.spread} points of power).`);
  for (let i = 0; i < o.difficulty.length; i++) {
    const d = o.difficulty[i], top = d.cells[d.cells.length - 1], low = d.cells[0];
    if (top && top.win !== null && top.win < 50) add('high', 'Levels', `Level ${d.stage} (${d.name}) is won ${top.win}% of the time even at player level ${top.level} with ${o.levels.length > 1 ? 'the best gear' : 'this setup'}.`);
    if (d.stage >= 3 && low && low.win === 100 && o.levels.length > 1) add('mid', 'Levels', `Level ${d.stage} is won every time at player level ${low.level}: it may be too easy.`);
    const next = o.difficulty[i + 1];
    if (next) for (let k = 0; k < d.cells.length; k++) if (d.cells[k].win !== null && next.cells[k].win !== null && d.cells[k].win - next.cells[k].win >= 60)
      add('mid', 'Levels', `Big step from level ${d.stage} to ${next.stage} at player level ${d.cells[k].level}: ${d.cells[k].win}% → ${next.cells[k].win}% wins.`);
  }
  for (const w of o.failWaves) if (w.lost >= 3 && w.onBoss / w.lost >= 0.6) add('mid', 'Bosses', `On level ${w.stage}, ${Math.round(w.onBoss / w.lost * 100)}% of lost runs end on a boss that got through.`);
  for (const r of o.relics) {
    if (!r.applies) add('info', 'Relics', `${r.name} does nothing for the relic test's lineup, so it has no effect number; picks: ${r.picks}.`);
    else if (r.effect !== null && r.effect <= 0.3) add('low', 'Relics', `${r.name} made no measurable difference (${r.effect >= 0 ? '+' : ''}${r.effect} progress) in the relic test.`);
    if (r.picks === 0) add('low', 'Relics', `The smart bot never picked ${r.name}.`);
  }
  const best = o.relics.filter(r => r.effect !== null);
  if (best.length > 3) { const top = best[0], ef = best.map(r => r.effect), med = median(ef); if (top.effect > med * 3 && top.effect > 5) add('mid', 'Relics', `${top.name} is far ahead of the other relics (+${top.effect} progress, median +${r1(med)}).`); }
  return f.sort((a, b) => ['high', 'mid', 'low', 'info'].indexOf(a.level) - ['high', 'mid', 'low', 'info'].indexOf(b.level));
}
