/* The balance report: one self-contained HTML page (no outside files) built from the analysis of a balance run, with what
   changed since the previous run next to every number. Charts are inline SVG drawn here; tables sort when you click a
   column. buildReport(data, prev) returns the HTML. */
import { analyze } from './analyze.mjs';
import { FORM_SETUP as FS, GEAR_STAGE } from './suites.mjs';
import { TEAM_SCALE } from './analyze.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, unit = '') => (x === null || x === undefined ? '–' : x + unit);
/* A change since last time, coloured: up is good (or bad, with invert). */
function delta(now, before, { unit = '', invert = false, min = 0.5 } = {}) {
  if (now === null || now === undefined || before === null || before === undefined) return '';
  const d = Math.round((now - before) * 10) / 10;
  if (Math.abs(d) < min) return '';
  const good = invert ? d < 0 : d > 0;
  return ` <span class="d ${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}${unit}</span>`;
}
/* Background for a 0-100 cell: red to amber to green. */
const heat = v => (v === null || v === undefined ? 'transparent' : `hsl(${Math.round(v * 1.2)} 55% 42% / .55)`);

function table(id, cols, rows) {
  return `<div class="tw"><table class="sortable" id="${id}"><thead><tr>${cols.map((c, i) => `<th data-i="${i}" ${c.num ? 'data-num' : ''} title="${esc(c.tip || '')}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${cols.map(c => { const v = c.get(r); return `<td${c.num ? ' class="n"' : ''} data-v="${esc(c.sort ? c.sort(r) : (typeof v === 'object' ? '' : v))}"${c.bg ? ` style="background:${c.bg(r)}"` : ''}>${c.html ? c.html(r) : esc(fmt(v))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* Horizontal bars, sorted, with an optional zero line for values that can be negative. */
function bars(items, { max = null, unit = '', width = 640, lw = 150, label = x => x.label, value = x => x.value, color = () => 'var(--c1)' } = {}) {
  const vals = items.map(value).filter(v => v !== null), hi = max ?? Math.max(1, ...vals.map(Math.abs)), lo = Math.min(0, ...vals);
  const row = 20, W = width, plot = W - lw - 50, zero = lw + (lo < 0 ? plot * (-lo / (hi - lo)) : 0), scale = plot / (hi - lo);
  const g = items.map((x, i) => {
    const v = value(x); if (v === null) return '';
    const y = i * row, x0 = v >= 0 ? zero : zero + v * scale, w = Math.max(1, Math.abs(v) * scale);
    return `<g><text x="${lw - 6}" y="${y + 14}" class="bl">${esc(label(x))}</text><rect x="${x0}" y="${y + 4}" width="${w}" height="${row - 7}" rx="2" fill="${color(x)}"><title>${esc(label(x))}: ${v}${unit}</title></rect><text x="${v >= 0 ? x0 + w + 4 : zero + 4}" y="${y + 14}" class="bv" text-anchor="start">${v}${unit}</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${items.length * row + 4}" role="img">${lo < 0 ? `<line x1="${zero}" x2="${zero}" y1="0" y2="${items.length * row}" class="axis"/>` : ''}${g}</svg>`;
}

/* Lines over waves (0-100), one per series. */
function lines(series, { waves, width = 300, height = 150, title = '', yMax = 100, unit = '%' } = {}) {
  const pad = { l: 30, r: 8, t: 18, b: 22 }, W = width, H = height, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = i => pad.l + (waves <= 1 ? 0 : i / (waves - 1) * pw), Y = v => pad.t + ph - (v / yMax) * ph;
  const grid = [0, 0.5, 1].map(k => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(yMax * k)}" y2="${Y(yMax * k)}" class="grid"/><text x="${pad.l - 4}" y="${Y(yMax * k) + 4}" class="tick" text-anchor="end">${Math.round(yMax * k)}</text>`).join('');
  const ls = series.map((s, k) => `<polyline points="${s.values.map((v, i) => `${X(i)},${Y(Math.min(yMax, v ?? 0))}`).join(' ')}" fill="none" stroke="var(--s${k})" stroke-width="2"><title>${esc(s.name)}</title></polyline>`).join('');
  const xt = [1, Math.ceil(waves / 2), waves].map(w => `<text x="${X(w - 1)}" y="${H - 6}" class="tick" text-anchor="middle">${w}</text>`).join('');
  return `<svg class="chart small" viewBox="0 0 ${W} ${H}" role="img"><text x="${pad.l}" y="12" class="ct">${esc(title)}</text>${grid}${ls}${xt}</svg>`;
}
const legend = names => `<div class="legend">${names.map((n, k) => `<span><i style="background:var(--s${k})"></i>${esc(n)}</span>`).join('')}</div>`;

export function buildReport(data, prevData = null) {
  const a = analyze(data), p = prevData && prevData.runs && prevData.runs.length ? analyze(prevData) : null;
  const pf = id => p && p.forms.find(x => x.form === id), pr = n => p && p.relics.find(x => x.name === n);
  const pd = (s, L) => p && (p.difficulty.find(x => x.stage === s) || { cells: [] }).cells.find(c => c.level === L);
  const when = new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const flagsHtml = a.flags.length ? `<ul class="flags">${a.flags.map(f => `<li class="${f.level}"><b>${esc(f.area)}</b> ${esc(f.text)}</li>`).join('')}</ul>` : '<p>Nothing stands out.</p>';

  const formsTable = table('forms', [
    { label: 'Form', get: r => r.formName, html: r => `<b>${esc(r.formName)}</b>${r.role !== 'damage' ? ` <span class="tag">${r.role === 'support' ? 'support' : 'semi-support'}</span>` : ''}` },
    { label: 'Hero', get: r => r.heroName },
    { label: 'Power', num: true, tip: 'Damage forms: half alone, half team value. Semi-supports: a quarter alone, three quarters value as a partner. Supports: value as a partner (0-100)', get: r => r.power, html: r => fmt(r.power) + delta(r.power, (pf(r.form) || {}).power) },
    { label: 'Alone L' + FS.solo[0] + ' win', num: true, get: r => r.solo1, html: r => fmt(r.solo1, '%') + delta(r.solo1, (pf(r.form) || {}).solo1, { unit: '%' }), bg: r => heat(r.solo1) },
    { label: 'Alone L' + FS.solo[1] + ' win', num: true, get: r => r.solo2, html: r => fmt(r.solo2, '%') + delta(r.solo2, (pf(r.form) || {}).solo2, { unit: '%' }), bg: r => heat(r.solo2) },
    { label: 'Team value', num: true, tip: 'How much further the teams with it get than the average team, over every team it can be in (points of progress)', get: r => r.value, html: r => (r.value > 0 ? '+' : '') + fmt(r.value) + delta(r.value, (pf(r.form) || {}).value), bg: r => (r.value === null ? 'transparent' : heat(50 + r.value / TEAM_SCALE * 50)) },
    { label: 'As partner', num: true, tip: 'Next to strong heroes (the strongest third of its teams), against other forms in that spot: 0 is ordinary', get: r => r.partner, html: r => (r.partner > 0 ? '+' : '') + fmt(r.partner) + delta(r.partner, (pf(r.form) || {}).partner), bg: r => (r.partner === null || r.partner === undefined ? 'transparent' : heat(50 + r.partner / TEAM_SCALE * 50)) },
    { label: 'As carry', num: true, tip: 'Next to weak heroes (the weakest third of its teams), against other forms in that spot: 0 is ordinary', get: r => r.carry, html: r => (r.carry > 0 ? '+' : '') + fmt(r.carry) + delta(r.carry, (pf(r.form) || {}).carry), bg: r => (r.carry === null || r.carry === undefined ? 'transparent' : heat(50 + r.carry / TEAM_SCALE * 50)) },
    { label: 'Best with', tip: 'The partner it works best with (synergy points)', get: r => r.bestWith, html: r => `<small>${esc(r.bestWith || '–')}</small>` },
    { label: 'Worst with', tip: 'The partner it works worst with (synergy points)', get: r => r.worstWith, html: r => `<small>${esc(r.worstWith || '–')}</small>` },
    { label: 'Teams won', num: true, tip: 'Share of its teams that won', get: r => r.team, html: r => fmt(r.team, '%') + delta(r.team, (pf(r.form) || {}).team, { unit: '%' }) },
    { label: 'Team damage', num: true, tip: 'Its share of its team\'s damage (a third is a fair share; supports deal less by design)', get: r => r.share, html: r => fmt(r.share, '%') + delta(r.share, (pf(r.form) || {}).share, { unit: '%' }) },
    { label: 'Boss kill (s)', num: true, tip: 'Seconds to kill a boss alone (lower is better)', get: r => r.boss, html: r => fmt(r.boss) + delta(r.boss, (pf(r.form) || {}).boss, { invert: true }) },
    { label: 'Bosses through', num: true, get: r => r.bossEsc, html: r => fmt(r.bossEsc, '%') },
    { label: 'Ultimates', num: true, tip: 'Ultimates a run', get: r => r.ults }
  ], a.forms);
  const roleColor = { damage: 'var(--c1)', semi: 'var(--s2)', support: 'var(--s3)' };
  const powerChart = bars(a.forms.map(f => ({ label: f.formName + ' (' + f.heroName + ')', value: f.power, role: f.role })), { max: 100, color: x => roleColor[x.role] || 'var(--c1)' })
    + `<div class="legend"><span><i style="background:var(--c1)"></i>damage</span><span><i style="background:var(--s2)"></i>semi-support</span><span><i style="background:var(--s3)"></i>support</span></div>`;
  const heroesTable = table('heroes', [
    { label: 'Hero', get: r => r.name, html: r => `<b>${esc(r.name)}</b>` }, { label: 'Average power', num: true, get: r => r.power },
    { label: 'Best form', get: r => r.best }, { label: 'Weakest form', get: r => r.worst }, { label: 'Gap', num: true, tip: 'Power between its best and weakest form', get: r => r.spread }
  ], a.heroes);

  const diffTable = `<div class="tw"><table class="grid"><thead><tr><th>Level</th>${a.levels.map(L => `<th>Player level ${L}</th>`).join('')}</tr></thead><tbody>${a.difficulty.map(d => `<tr><th>${d.stage} · ${esc(d.name)} <small>${d.waves} waves</small></th>${d.cells.map(c => `<td style="background:${heat(c.win)}" title="${esc(Object.entries(c.lineups).map(([k, v]) => k + ': ' + v + '%').join(', '))}"><b>${fmt(c.win, '%')}</b>${delta(c.win, (pd(d.stage, c.level) || {}).win, { unit: '%' })}<small>wave ${fmt(c.wave)} · ${fmt(c.lives)} lives · ${fmt(c.minutes)} min</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const levelNames = a.levels.map(L => 'Player level ' + L);
  const survival = `<div class="multiples">${a.survival.map(s => lines(s.curves.map(c => ({ name: 'Player level ' + c.level, values: c.alive })), { waves: s.curves[0] ? s.curves[0].alive.length : 1, title: 'Level ' + s.stage + ': runs still going' })).join('')}</div>${legend(levelNames)}`;
  const leakMax = Math.max(1, ...a.survival.flatMap(s => s.curves.flatMap(c => c.leaks.map(v => v || 0))));
  const leaks = `<div class="multiples">${a.survival.map(s => lines(s.curves.map(c => ({ name: 'Player level ' + c.level, values: c.leaks })), { waves: s.curves[0] ? s.curves[0].leaks.length : 1, title: 'Level ' + s.stage + ': lives lost per wave', yMax: Math.ceil(leakMax), unit: '' })).join('')}</div>${legend(levelNames)}`;
  const fails = `<ul class="plain">${a.failWaves.filter(f => f.lost).map(f => `<li>Level ${f.stage}: ${f.lost} runs lost, ${f.onBoss} of them to a boss; most often on wave ${f.top.map(t => t.wave + ' (' + t.n + ')').join(', ')}.</li>`).join('') || '<li>No run was lost.</li>'}</ul>`;

  /* teams */
  const ph = k => p && (p.heroTeams || []).find(x => x.heroes.join() === k);
  const heroTeamsTable = table('heroteams', [
    { label: 'Team', get: r => r.names, html: r => `<b>${esc(r.names)}</b>` },
    { label: 'Progress', num: true, tip: 'Average over every combination of their forms', get: r => r.progress, html: r => fmt(r.progress) + delta(r.progress, (ph(r.heroes.join()) || {}).progress), bg: r => heat((r.progress - 60) * 2) },
    { label: 'Won', num: true, get: r => r.win, html: r => fmt(r.win, '%') },
    { label: 'Best forms', get: r => r.best, html: r => esc(r.best) + ` <small class="note">${fmt(r.bestP)}</small>` },
    { label: 'Worst forms', get: r => r.worst, html: r => esc(r.worst) + ` <small class="note">${fmt(r.worstP)}</small>` }
  ], a.heroTeams || []);
  const teamList = (list) => table('t' + Math.random().toString(36).slice(2, 7), [
    { label: 'Forms', get: r => r.names }, { label: 'Progress', num: true, get: r => r.progress }, { label: 'Won', num: true, get: r => r.win, html: r => fmt(r.win, '%') },
    { label: 'Wave', num: true, get: r => r.wave }, { label: 'Lives', num: true, get: r => r.lives }], list || []);
  const pairChart = (list) => bars((list || []).map(x => ({ label: x.names, value: x.synergy })), { width: 760, lw: 250, color: x => (x.value >= 0 ? 'var(--c1)' : 'var(--bad)') }).replace('<svg class="chart"', '<svg class="chart pairs"');
  const valueChart = bars([...a.forms].sort((x, y) => (y.value ?? -99) - (x.value ?? -99)).map(f => ({ label: f.formName + ' (' + f.heroName + ')', value: f.value })), { color: x => (x.value >= 0 ? 'var(--c1)' : 'var(--bad)') });
  const partnerChart = bars([...a.forms].filter(f => f.partner !== null && f.partner !== undefined).sort((x, y) => y.partner - x.partner).map(f => ({ label: f.formName + ' (' + f.heroName + ')', value: f.partner, role: f.role })), { color: x => (x.value >= 0 ? roleColor[x.role] || 'var(--c1)' : 'var(--bad)') });
  const C = a.compSetup || {};

  const relicChart = bars(a.relics.filter(r => r.effect !== null).map(r => ({ label: r.name, value: r.effect })), { unit: '', color: x => (x.value > 0 ? 'var(--c1)' : 'var(--bad)') });
  const relicsTable = table('relics', [
    { label: 'Relic', get: r => r.name, html: r => `<b>${esc(r.name)}</b>` },
    { label: 'Effect', num: true, tip: 'Progress gained over the same runs with no relic (percentage points of the level)', get: r => r.effect, html: r => fmt(r.effect) + delta(r.effect, (pr(r.name) || {}).effect) },
    { label: 'Helped', num: true, tip: 'Share of the test runs that got further with it than without', get: r => r.better, html: r => fmt(r.better, '%') },
    { label: 'Wave reached', num: true, get: r => r.wave }, { label: 'Win', num: true, get: r => r.win, html: r => fmt(r.win, '%') },
    { label: 'Picked', num: true, tip: 'How often the smart bot took it in the other experiments', get: r => r.picks }, { label: 'Per run', num: true, get: r => r.perRun },
    { label: 'Tested with', get: r => r.teams.join(' · '), html: r => `<small class="note">${esc(r.teams.join(' · '))}</small>` }
  ], a.relics);

  const gearTable = `<div class="tw"><table class="grid"><thead><tr><th>Player level</th>${a.gear.gears.map(g => `<th>${esc(g[0].toUpperCase() + g.slice(1))} gear</th>`).join('')}</tr></thead><tbody>${a.gear.levels.map((L, i) => `<tr><th>${L}</th>${a.gear.cells[i].map(c => `<td style="background:${heat(c.progress)}"><b>${fmt(c.win, '%')}</b><small>wave ${fmt(c.wave)} · progress ${fmt(c.progress)}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  const R = a.relicSetup;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balance report</title>
<style>
:root{--bg:#f6f7f4;--panel:#fff;--text:#1d2420;--muted:#6b766f;--line:#dde3dd;--c1:#3b7d4f;--bad:#c2564c;--high:#c2564c;--mid:#d9952b;--low:#7a8a80;--up:#2e7d46;--down:#b4453b;
  --s0:#3b7d4f;--s1:#d9952b;--s2:#4a74c9;--s3:#a04aa8;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#121815;--panel:#1a221d;--text:#e6ece7;--muted:#93a39a;--line:#2c3a32;--c1:#5fbf7d;--bad:#e5645a;--up:#6fd08a;--down:#ef7d73;--s0:#5fbf7d;--s1:#f2b84b;--s2:#7aa2f0;--s3:#d58ae0;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 60px}h1{font-size:1.6em;margin:0 0 4px}h2{margin:34px 0 8px;font-size:1.25em}h3{margin:18px 0 6px;font-size:1em}
.meta{color:var(--muted)}section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-top:16px}
.flags{list-style:none;padding:0;margin:0}.flags li{padding:6px 10px;border-left:4px solid var(--low);margin:4px 0;background:color-mix(in srgb,var(--bg) 60%,transparent)}
.flags li.high{border-color:var(--high)}.flags li.mid{border-color:var(--mid)}.flags li.info{border-color:var(--line);color:var(--muted)}.flags b{display:inline-block;min-width:64px;color:var(--muted);font-weight:600}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.92em}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600;color:var(--muted);white-space:nowrap}table.sortable th{cursor:pointer}table.sortable th:hover{color:var(--text)}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.grid td{text-align:center;min-width:120px}table.grid td small,table.grid th small{display:block;color:var(--muted);font-weight:400}
.d{font-size:.8em;font-weight:600;margin-left:3px}.d.up{color:var(--up)}.d.down{color:var(--down)}.tag{font-size:.75em;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 4px}
.chart{width:100%;height:auto;display:block}.chart .bl{font-size:11px;fill:var(--text);text-anchor:end}.chart .bv,.chart .tick{font-size:10px;fill:var(--muted)}.chart .ct{font-size:11px;fill:var(--text);font-weight:600}
.chart .grid,.chart .axis{stroke:var(--line)}.chart.small{max-width:360px}.chart.pairs .bl{font-size:10px}
.multiples{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:.85em;margin-top:6px}
.legend i{display:inline-block;width:12px;height:3px;vertical-align:middle;margin-right:5px}.plain{margin:6px 0;padding-left:18px}.note{color:var(--muted);font-size:.9em}
@media (max-width:600px){main{padding:16px 12px}section{padding:12px}}
</style></head><body><main>
<h1>Balance report</h1>
<div class="meta">${esc(when)} · engine ${a.engine} · ${a.games} games (${a.seeds} seed${a.seeds > 1 ? 's' : ''} per setting, ${Math.round(a.minutes / 60)} hours of play) · ${p ? 'changes since the run of ' + esc(new Date(p.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) + (p.engine !== a.engine ? ' (engine ' + p.engine + ')' : '') + ' shown in colour' : 'first run: no comparison yet'}</div>

<section><h2 style="margin-top:0">What stands out</h2>${flagsHtml}</section>

<section><h2 style="margin-top:0">Heroes and forms</h2>
<p class="note">Each form is taken as an evolution path, at player level ${FS.level} with ${FS.gear} gear: alone on levels ${FS.solo.join(' and ')}, and in every team of three it can be in on level ${C.stage} (see Teams). <b>Team value</b> is how much further its teams get than the average team, so it counts everything the form adds (curses, slows, buffs, energy), not only its own damage. <b>As partner</b> and <b>as carry</b> split that by how strong its two teammates are (the strongest and the weakest third of its teams), each against the other forms in the same spot: a multiplier (Verdict, Hex, Heresy, Rally) shines as a partner and has little to multiply as a carry. <b>Power</b> (0 to 100) depends on the role (set in tools/balance/roles.mjs): damage forms, half alone and half team value; semi-supports, a quarter alone and three quarters as a partner; supports, as a partner only (0 points is 50, ±${TEAM_SCALE} points is 0 or 100).</p>
${powerChart}<h3>Every form</h3>${formsTable}<h3>By hero</h3>${heroesTable}</section>

<section><h2 style="margin-top:0">Teams</h2>
<p class="note">Every team of three different heroes (${(a.heroTeams || []).length}) with every combination of their forms (${fmt(a.compAvg && a.compAvg.n)} games), on level ${C.stage} at player level ${C.level} with ${esc(C.gear)} gear. The average team reaches ${fmt(a.compAvg && a.compAvg.progress)} progress and ${fmt(a.compAvg && a.compAvg.win, '%')} of the games are won; ${a.teamWins ? a.teamWins.won + ' of ' + a.teamWins.all : '–'} form teams won at least once.</p>
<h3>Team value of each form</h3>${valueChart}
<h3>Value as a partner (next to strong heroes)</h3><p class="note">Coloured by role: damage, <span style="color:var(--s2)">semi-support</span>, <span style="color:var(--s3)">support</span>.</p>${partnerChart}
<h3>Teams of heroes</h3>${heroTeamsTable}
<h3>Best form teams</h3>${teamList(a.bestTeams)}<h3>Worst form teams</h3>${teamList(a.worstTeams)}
<h3>Pairs that work well together</h3><p class="note">Synergy: how much better the teams with both do than their two team values add up to (points). Pairs of two forms so strong that their teams win almost every time are left out: the score stops at a clean win, so they cannot show synergy.</p>${pairChart(a.bestPairs)}
<h3>Pairs that work badly together</h3>${pairChart(a.worstPairs)}</section>

<section><h2 style="margin-top:0">Difficulty</h2>
<p class="note">Every level with three lineups (Warrior, Hunter, Mage · Paladin, Druid, Warlock · Rogue, Priest, Shaman); gear grows with the player level (none, common, rare, epic). Hover a cell for each lineup.</p>
${diffTable}<h3>How far runs get</h3>${survival}<h3>Where lives are lost</h3>${leaks}<h3>Lost runs</h3>${fails}</section>

<section><h2 style="margin-top:0">Relics</h2>
<p class="note">Every relic given twice (Rare) before wave 1 to ${R.comps} teams it does something for (relics for some heroes only go to teams with one of them), ${R.seeds} runs each, the bot shopping as usual, on level ${R.stage}, player level ${R.level}, ${R.gear} gear. <b>Effect</b> is how much further those runs got than the same team and seed with no relic given (points of progress; without relics the test teams average ${fmt(a.relicBase.progress)} progress, wave ${fmt(a.relicBase.wave)}). <b>Helped</b>: the share of runs it improved. Picks come from the smart bot in the other experiments.</p>
${relicChart}${relicsTable}</section>

<section><h2 style="margin-top:0">Gear and talents</h2>
<p class="note">Level ${GEAR_STAGE} with Warrior, Hunter and Mage: player level (its talent points) against gear quality.</p>${gearTable}</section>

<p class="note">Built by tools/balance (npm run balance:report). The bot plays like a good player: it places heroes where they cover the most path, values relics by the damage they add, picks forms by playing each one ahead through the next boss, and moves heroes after they evolve.</p>
</main><script>
for (const t of document.querySelectorAll('table.sortable')) t.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
  const i = +th.dataset.i, num = th.hasAttribute('data-num'), body = t.tBodies[0], dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
  t.querySelectorAll('th').forEach(x => delete x.dataset.dir); th.dataset.dir = dir;
  const rows = [...body.rows], val = r => r.cells[i].dataset.v;
  rows.sort((a, b) => { let x = val(a), y = val(b); if (num) { x = x === '' ? -Infinity : +x; y = y === '' ? -Infinity : +y; return dir === 'desc' ? y - x : x - y; } return dir === 'desc' ? String(y).localeCompare(x) : String(x).localeCompare(y); });
  rows.forEach(r => body.append(r));
}));
</script></body></html>`;
}
