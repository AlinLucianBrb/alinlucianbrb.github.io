/* Turns the balance runs (results.json) into the numbers the report shows, and the red flags.
   progress: how far a run got, 0 to 1 (waves cleared, plus the share of the last wave's enemies killed, over the waves in
   the level), plus up to 0.25 for lives kept on a win, so
   two wins can still be told apart.
   Team value of a form: how much further the teams with it get than the average team (in points of progress), over
   every team of three it can be in (the comps suite). It counts everything a hero adds, not just its own damage:
   curses, slows, buffs, energy, a turned-back enemy. Split by how strong the other two are (their own team values
   added up): as a partner (the strongest third of its teams) and as a carry (the weakest third), each measured
   against the other forms in the same spot, so 0 is an ordinary form there. A multiplier (Verdict, Hex, Heresy) shows
   up as a partner: it has little to multiply next to weak heroes.
   Power (0 to 100) depends on the form's role (roles.mjs): damage forms, half alone and half team value over every
   team; semi-supports, a quarter alone and three quarters value as a partner; supports, value as a partner only.
   Team values map to the 0-100 scale with 0 points at 50 and TEAM_SCALE points at 0 or 100.
   Synergy of a pair: how much better (or worse) the teams with both do than their two team values add up to. */
import { HEROES, RELICS, STAGES } from '../../js/content/data.js';
import { RELIC_SETUP, FORM_SETUP, COMP_SETUP, GEAR_STAGE, PROGRESSION, TARGET } from './suites.mjs';
import { roleOf, SOLO_WEIGHT } from './roles.mjs';
const SOLO = FORM_SETUP.solo;
/* team value points that map to the 0 and 100 ends of the team half of power */
export const TEAM_SCALE = 20;

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

  /* ---- teams (comps) ---- */
  const CP = by('comps').map(r => ({ ...r, p: progress({ ...r, stage: COMP_SETUP.stage }) }));
  const avg = mean(CP.map(r => r.p));
  const withForm = id => CP.filter(r => r.forms.includes(id));
  const value = {};   /* form id -> team value in points */
  for (const h of HEROES) for (const c of h.evolutions[0].choices) { const rs = withForm(c.id); value[c.id] = rs.length ? (mean(rs.map(r => r.p)) - avg) * 100 : null; }
  /* as a partner / as a carry: the strongest and the weakest third of each form's teams, by its partners' team values */
  const partner = {}, carry = {};
  for (const id of Object.keys(value)) {
    const rs = withForm(id).map(r => ({ p: r.p, s: r.forms.filter(x => x !== id).reduce((a, x) => a + (value[x] ?? 0), 0) })).sort((a, b) => b.s - a.s);
    const k = Math.floor(rs.length / 3);
    partner[id] = k ? (mean(rs.slice(0, k).map(x => x.p)) - avg) * 100 : null;
    carry[id] = k ? (mean(rs.slice(-k).map(x => x.p)) - avg) * 100 : null;
  }
  const centre = o => { const m = mean(Object.values(o).filter(v => v !== null)); for (const k in o) if (o[k] !== null) o[k] -= m; };
  centre(partner); centre(carry);
  out.compSetup = COMP_SETUP;
  out.compAvg = { progress: r1((avg ?? 0) * 100), win: pct(CP.map(r => r.won)), n: CP.length };

  /* ---- forms ---- */
  const F = by('forms'), forms = [];
  for (const h of HEROES) for (const c of h.evolutions[0].choices) {
    const solo = F.filter(r => r.form === c.id && r.mode === 'solo'), team = withForm(c.id);
    if (!solo.length && !team.length) continue;
    const share = team.map(r => { const tot = r.heroes.reduce((a, x) => a + x.damage, 0); const me = r.heroes.find(x => x.id === h.id); return tot > 0 && me ? me.damage / tot : 0; });
    const bossT = solo.flatMap(r => r.perWave.filter(v => v.boss !== null).map(v => (v.boss === 'escaped' ? 999 : v.boss)));
    const soloP = mean(solo.map(progress)), sh = mean(share), tv = value[c.id], role = roleOf(c.id), support = role === 'support';
    const judged = role === 'damage' ? tv : partner[c.id];   /* the team value a form of this role is judged by */
    const teamScore = judged === null || judged === undefined ? null : Math.max(0, Math.min(100, 50 + judged / TEAM_SCALE * 50));
    const sw = SOLO_WEIGHT[role];
    const power = teamScore === null ? 100 * (soloP ?? 0) / 1.25 : sw * 100 * Math.min(1, (soloP ?? 0) / 1.25) + (1 - sw) * teamScore;
    forms.push({ hero: h.id, heroName: h.name, form: c.id, formName: c.name,
      solo1: pct(solo.filter(r => r.stage === SOLO[0]).map(r => r.won)), solo2: pct(solo.filter(r => r.stage === SOLO[1]).map(r => r.won)),
      soloWave: r1(mean(solo.map(r => r.waves / maxWave(r.stage) * 100))), team: pct(team.map(r => r.won)), teams: team.length, value: r1(tv), partner: r1(partner[c.id]), carry: r1(carry[c.id]), role, share: r1((sh ?? 0) * 100),
      boss: bossT.length ? r1(mean(bossT.filter(x => x < 999))) : null, bossEsc: bossT.length ? Math.round(bossT.filter(x => x >= 999).length / bossT.length * 100) : null,
      ults: r1(mean([...solo, ...team].map(r => (r.heroes.find(x => x.id === h.id) || {}).ults || 0))), power: r1(power), support, amp: (c.tags || []).includes('curse') });
  }
  out.forms = forms.sort((a, b) => b.power - a.power);
  out.heroes = HEROES.map(h => { const f = forms.filter(x => x.hero === h.id); return { hero: h.id, name: h.name, power: r1(mean(f.map(x => x.power))), best: f[0] && f.reduce((a, b) => (b.power > a.power ? b : a)).formName, worst: f[0] && f.reduce((a, b) => (b.power < a.power ? b : a)).formName, spread: f.length ? r1(Math.max(...f.map(x => x.power)) - Math.min(...f.map(x => x.power))) : null }; })
    .filter(x => x.power !== null).sort((a, b) => b.power - a.power);

  /* hero teams: the 84 teams of three heroes, each over every combination of their forms */
  const heroTeams = new Map();
  for (const r of CP) { const k = r.ids.join(','); if (!heroTeams.has(k)) heroTeams.set(k, []); heroTeams.get(k).push(r); }
  const formOf = id => formName(id);
  out.heroTeams = [...heroTeams.entries()].map(([k, rs]) => {
    const byForms = new Map(); for (const r of rs) { const f = r.forms.join(','); if (!byForms.has(f)) byForms.set(f, []); byForms.get(f).push(r); }
    const fs = [...byForms.entries()].map(([f, x]) => ({ f, p: mean(x.map(r => r.p)) })).sort((a, b) => b.p - a.p);
    return { heroes: k.split(','), names: k.split(',').map(heroName).join(', '), progress: r1(mean(rs.map(r => r.p)) * 100), win: pct(rs.map(r => r.won)),
      best: fs[0] && fs[0].f.split(',').map(formOf).join(', '), bestP: fs[0] && r1(fs[0].p * 100), worst: fs.length && fs[fs.length - 1].f.split(',').map(formOf).join(', '), worstP: fs.length && r1(fs[fs.length - 1].p * 100) };
  }).sort((a, b) => b.progress - a.progress);
  /* form teams: the best and the worst */
  const formTeams = new Map();
  for (const r of CP) { const k = r.forms.join(','); if (!formTeams.has(k)) formTeams.set(k, []); formTeams.get(k).push(r); }
  const ft = [...formTeams.entries()].map(([k, rs]) => ({ forms: k.split(','), names: k.split(',').map(formOf).join(', '), progress: r1(mean(rs.map(r => r.p)) * 100), win: pct(rs.map(r => r.won)),
    lives: r1(mean(rs.map(r => r.lives))), wave: r1(mean(rs.map(r => r.waves))) })).sort((a, b) => b.progress - a.progress || b.lives - a.lives);
  out.bestTeams = ft.slice(0, 12); out.worstTeams = ft.slice(-12).reverse();
  out.teamWins = { won: ft.filter(t => t.win > 0).length, all: ft.length };
  /* pairs of forms: synergy = (with both) - avg - value(a) - value(b), in points */
  const pairs = new Map();
  for (const r of CP) for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const k = [r.forms[i], r.forms[j]].sort().join(','); if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(r.p); }
  /* A pair whose two team values already add up to a near-certain win cannot show more: the score stops at a clean win
     (125), so its "synergy" would only measure that ceiling. Those pairs are left out (capped). */
  const CAP = 118;
  const syn = [...pairs.entries()].filter(([, v]) => v.length >= 3).map(([k, v]) => { const [a, b] = k.split(','), expect = (avg * 100) + value[a] + value[b];
      return { a, b, names: formOf(a) + ' + ' + formOf(b), n: v.length, synergy: r1((mean(v) - avg) * 100 - value[a] - value[b]), capped: expect >= CAP }; })
    .filter(x => !x.capped).sort((x, y) => y.synergy - x.synergy);
  out.bestPairs = syn.slice(0, 10); out.worstPairs = syn.slice(-10).reverse();
  /* each form's best and worst partner (by synergy) */
  for (const f of forms) {
    const mine = syn.filter(x => x.a === f.form || x.b === f.form);
    if (!mine.length) continue;
    const other = x => formName(x.a === f.form ? x.b : x.a);
    f.bestWith = other(mine[0]) + ' (+' + mine[0].synergy + ')'; f.worstWith = other(mine[mine.length - 1]) + ' (' + mine[mine.length - 1].synergy + ')';
  }

  /* ---- difficulty ---- */
  const D = by('difficulty'), levels = [...new Set(D.map(r => r.level))].sort((a, b) => a - b), lineups = [...new Set(D.map(r => r.lineup))];
  out.levels = levels;
  const LV = STAGES.filter(st => D.some(r => r.stage === st.n));   /* the levels the difficulty runs covered */
  out.difficulty = LV.map(st => ({ stage: st.n, name: st.name, waves: st.waves, cells: levels.map(L => {
    const rs = D.filter(r => r.stage === st.n && r.level === L);
    return { level: L, win: pct(rs.map(r => r.won)), wave: r1(mean(rs.map(r => r.waves))), lives: r1(mean(rs.map(r => r.lives))), minutes: r1(mean(rs.map(r => r.minutes))), n: rs.length,
      lineups: Object.fromEntries(lineups.map(n => [n, pct(rs.filter(r => r.lineup === n).map(r => r.won))])) };
  }) }));
  /* Survival: the share of runs still going at the start of each wave; leaks: lives lost per wave (average). */
  out.survival = LV.map(st => ({ stage: st.n, curves: levels.map(L => {
    const rs = D.filter(r => r.stage === st.n && r.level === L);
    return { level: L, alive: Array.from({ length: st.waves }, (_, i) => (rs.length ? Math.round(rs.filter(r => r.waves >= i + 1).length / rs.length * 100) : null)),   /* still going at the start of wave i + 1 */
      leaks: Array.from({ length: st.waves }, (_, i) => r1(mean(rs.map(r => (r.perWave[i] ? r.perWave[i].leaks : 0))))) };
  }) }));
  out.failWaves = LV.map(st => {
    const lost = D.filter(r => r.stage === st.n && !r.won), counts = {};
    for (const r of lost) counts[r.failWave] = (counts[r.failWave] || 0) + 1;
    return { stage: st.n, lost: lost.length, onBoss: lost.filter(r => r.perWave.some(v => v.wave === r.failWave && v.boss === 'escaped')).length, top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => ({ wave: +w, n })) };
  });

  /* ---- relics: each one against the same team and seed without it ---- */
  const R = by('relics').map(r => ({ ...r, p: progress({ ...r, stage: RELIC_SETUP.stage }) })), base = new Map();
  for (const r of R) if (!r.relic) base.set(r.team + '#' + r.seed, r);
  const B = [...base.values()];
  out.relicSetup = RELIC_SETUP;
  out.relicBase = { progress: r1((mean(B.map(r => r.p)) ?? 0) * 100), wave: r1(mean(B.map(r => r.waves))), win: pct(B.map(r => r.won)), teams: new Set(B.map(r => r.team)).size };
  const picks = runs.filter(r => r.suite !== 'relics' && r.relics);
  out.relics = RELICS.map(rel => {
    const rs = R.filter(r => r.relic === rel.name && base.has(r.team + '#' + r.seed)), d = rs.map(r => r.p - base.get(r.team + '#' + r.seed).p);
    const n = picks.reduce((a, r) => a + r.relics.filter(x => x.name === rel.name).length, 0);
    return { name: rel.name, applies: rs.length > 0, teams: [...new Set(rs.map(r => (r.forms || []).map(formName).join(', ')))], effect: d.length ? r1(mean(d) * 100) : null,
      better: d.length ? Math.round(d.filter(x => x > 0.001).length / d.length * 100) : null,
      wave: r1(mean(rs.map(r => r.waves))), win: pct(rs.map(r => r.won)), picks: n, perRun: picks.length ? r1(n / picks.length) : null };
  }).sort((a, b) => (b.effect ?? -1e9) - (a.effect ?? -1e9));

  /* ---- gear x talents ---- */
  const G = by('gear'), gears = ['none', 'common', 'rare', 'epic'].filter(g => G.some(r => r.gear === g)), glevels = [...new Set(G.map(r => r.level))].sort((a, b) => a - b);
  out.gear = { gears, levels: glevels, cells: glevels.map(L => gears.map(g => { const rs = G.filter(r => r.level === L && r.gear === g); return { win: pct(rs.map(r => r.won)), wave: r1(mean(rs.map(r => r.waves))), progress: r1((mean(rs.map(r => progress({ ...r, stage: GEAR_STAGE }))) ?? 0) * 100) }; })) };

  /* ---- the difficulty curve: each level at its progression setup, weakest and strongest tenth of teams ---- */
  const CV = by('curve');
  out.target = TARGET;
  out.curve = STAGES.filter(st => PROGRESSION[st.n]).map(st => { const rs = CV.filter(r => r.stage === st.n), g = k => rs.filter(r => r.group === k);
    return { stage: st.n, name: st.name, ...PROGRESSION[st.n], weak: pct(g('weak').map(r => r.won)), strong: pct(g('strong').map(r => r.won)),
      worst: pct(g('worst').map(r => r.won)), best: pct(g('best').map(r => r.won)), n: g('weak').length + g('strong').length,
      wave: r1(mean(g('weak').map(r => r.cleared ?? r.waves))) }; }).filter(c => c.weak !== null);

  out.flags = flags(out);
  return out;
}

/* Red flags: what stands out enough to look at. */
function flags(o) {
  const f = [], add = (level, area, text) => f.push({ level, area, text });
  const P = o.forms.map(x => x.power), m = median(P), sg = v => (v >= 0 ? '+' : '') + v;
  for (const x of o.forms) {
    if (x.role !== 'damage' && x.partner !== null) add('info', 'Forms', `${x.formName} (${x.role === 'support' ? 'support' : 'semi-support'}) is judged as a partner: ${sg(x.partner)} points next to strong heroes, ${sg(x.carry)} next to weak ones (0 is an ordinary form there).`);
    if (m && x.power < m * 0.6) add('high', 'Forms', `${x.formName} (${x.heroName}) is weak: power ${x.power} against a median of ${r1(m)}` + (x.role === 'damage' ? `; alone it wins ${x.solo1 ?? '–'}% of level ${SOLO[0]}.` : `; even next to strong heroes it adds ${sg(x.partner)} points.`));
    else if (m && x.power > m * 1.45) add('high', 'Forms', `${x.formName} (${x.heroName}) is strong: power ${x.power} against a median of ${r1(m)}.`);
    if (x.role === 'damage' && x.bossEsc !== null && x.bossEsc >= 50) add('mid', 'Bosses', `${x.formName} alone lets ${x.bossEsc}% of bosses through.`);
  }
  for (const h of o.heroes) if (h.spread !== null && h.spread > 35) add('mid', 'Heroes', `${h.name}'s forms are far apart: ${h.best} vs ${h.worst} (${h.spread} points of power).`);
  for (const c of o.curve || []) if (Math.abs(c.weak - o.target.weak) > 10)
    add('high', 'Levels', `Level ${c.stage} (${c.name}) at player level ${c.level} with ${c.gear === 'none' ? 'no' : c.gear} gear: the weakest tenth of teams clears it ${c.weak}% of the time (target ${o.target.weak}%).`);
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
    if (!r.applies) continue;
    if (r.effect !== null && r.effect <= 0.3) add('low', 'Relics', `${r.name} made no measurable difference (${r.effect >= 0 ? '+' : ''}${r.effect} progress) in the relic test.`);
    if (r.picks === 0) add('low', 'Relics', `The smart bot never picked ${r.name}.`);
  }
  for (const x of o.forms) if (x.role === 'damage' && x.value !== null && x.value <= -8) add('mid', 'Teams', `Teams with ${x.formName} (${x.heroName}) do ${x.value} points worse than the average team.`);
  for (const pr of o.bestPairs.slice(0, 3)) if (pr.synergy >= 4) add('info', 'Teams', `${pr.names} work well together: +${pr.synergy} points beyond what each adds alone.`);
  for (const pr of o.worstPairs.slice(0, 3)) if (pr.synergy <= -4) add('low', 'Teams', `${pr.names} work badly together: ${pr.synergy} points below what each adds alone.`);
  const best = o.relics.filter(r => r.effect !== null);
  if (best.length > 3) { const top = best[0], ef = best.map(r => r.effect), med = median(ef); if (top.effect > med * 3 && top.effect > 5) add('mid', 'Relics', `${top.name} is far ahead of the other relics (+${top.effect} progress, median +${r1(med)}).`); }
  return f.sort((a, b) => ['high', 'mid', 'low', 'info'].indexOf(a.level) - ['high', 'mid', 'low', 'info'].indexOf(b.level));
}
