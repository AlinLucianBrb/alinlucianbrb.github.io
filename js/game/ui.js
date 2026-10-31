/* All DOM work for the game screen. Values are only written when they change, to avoid needless page updates. */
import { HEROES, RARITIES, STAT_LABELS } from './data.js';
import { explain, affected } from './stats.js';

const $ = id => document.getElementById(id);
const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const f = x => +x.toFixed(2);
const num = x => Math.round(x).toLocaleString();
const btns = [], rows = [];
let meterEmpty;
const cap = s => s[0].toUpperCase() + s.slice(1);
let onClose = () => {};

export function initUI({ onSelectType, onCloseInspector }) {
  onClose = onCloseInspector;
  HEROES.forEach((d, i) => {
    const b = el('button'); b.id = 't' + i; b.title = d.desc; b.onclick = () => onSelectType(i);
    $('tbtns').append(b); btns.push(b);
  });
  const m = $('meter'); m.textContent = '';
  meterEmpty = el('p', 'muted', 'No damage dealt yet.'); m.append(meterEmpty);
  HEROES.forEach(() => {
    const root = el('div', 'mrow'), name = el('span'), bar = el('span', 'mbar'), fill = el('i'), val = el('span', '', '0');
    root.hidden = true; bar.append(fill); root.append(name, bar, val); m.append(root); rows.push({ root, name, fill, val, type: -1 });
  });
}

export function renderHUD(g, sel, auto) {
  setText($('gold'), g.gold); setText($('lives'), g.lives); setText($('wave'), g.wave); setText($('best'), g.best);
  $('go').disabled = g.phase !== 'build' || g.picking;
  setText($('go'), g.phase === 'build' && auto ? 'Start now (' + Math.max(0, Math.ceil(g.autoT)) + 's)' : 'Start wave');
  setText($('relic'), 'Relic · ' + g.relicCost());
  setText($('auto'), 'Auto-start: ' + (auto ? 'on' : 'off')); $('auto').classList.toggle('on', auto);
  setText($('spd'), 'Speed: ' + g.speed + 'x');
  HEROES.forEach((d, i) => { setText(btns[i], d.name + ' · ' + g.cost(i)); btns[i].classList.toggle('on', sel === i); });
  setText($('tinfo'), HEROES[sel].desc);
  const box = $('relics');
  if (box._g !== g || box._n !== g.relics.length) {
    box._g = g; box._n = g.relics.length; box.textContent = '';
    if (!g.relics.length) box.textContent = 'Relics: none yet. Buy one with gold.';
    else {
      const counts = new Map();
      g.relics.forEach(r => { const k = r.name + '|' + r.r; counts.set(k, (counts.get(k) || 0) + 1); });
      box.append('Relics: '); let i = 0;
      for (const [k, v] of counts) {
        const [name, r] = k.split('|'), sp = el('span', '', name + (v > 1 ? ' ×' + v : ''));
        sp.style.color = RARITIES[+r].color; sp.style.fontWeight = '600';
        if (i++) box.append(', ');
        box.append(sp);
      }
    }
  }
}

export function renderMeter(g) {
  /* Only heroes that have dealt damage appear, sorted by damage. */
  const totals = g.meter.totals, sum = g.meter.sum(), order = [];
  for (let i = 0; i < totals.length; i++) if (totals[i] > 0) order.push(i);
  order.sort((a, b) => totals[b] - totals[a]);
  meterEmpty.hidden = order.length > 0;
  rows.forEach((r, idx) => {
    const type = order[idx];
    if (type === undefined) { if (!r.root.hidden) r.root.hidden = true; return; }
    if (r.root.hidden) r.root.hidden = false;
    if (r.type !== type) { r.type = type; r.name.textContent = HEROES[type].name; r.name.style.color = HEROES[type].color; r.fill.style.background = HEROES[type].color; }
    r.fill.style.width = (totals[type] / sum * 100) + '%';
    setText(r.val, num(totals[type]) + ' · ' + Math.round(totals[type] / sum * 100) + '%');
  });
}

function describe(m) {
  const v = m.type === 'inc' ? '+' + f(m.value * 100) + '%' : m.type === 'flat' ? '+' + f(m.value) : '×' + f(1 + m.value);
  return v + ' · ' + m.source + ' (' + (m.ri >= 0 ? RARITIES[m.ri].name : 'Talent') + ')';
}
export function renderInspector(g) {
  const box = $('inspect'), t = g.selected;
  if (!t) {
    if (box._k !== 'none') { box._k = 'none'; box.textContent = ''; box.append(el('p', 'muted', 'Click a hero on the map to see its stats and buffs.')); }
    return;
  }
  box._k = 't'; box.textContent = '';
  const d = t.def, head = el('div', 'srow'), title = el('b', '', d.name + ' · ' + cap(d.archetype)), close = el('button', 'linkbtn', 'Close');
  title.style.color = d.color; close.onclick = onClose; head.append(title, close); box.append(head);
  for (const key in d.stats) {
    if (key === 'cooldown') continue;
    const isRate = key === 'speed';
    const label = key === 'damage' && d.dps ? 'Damage per second' : STAT_LABELS[key];
    const value = isRate ? t.s.speed / t.s.cooldown : t.s[key];
    const base = isRate ? d.stats.speed / d.stats.cooldown : d.stats[key];
    const row = el('div', 'srow'); row.append(el('span', '', label), el('span', '', f(value) + (f(value) !== f(base) ? '  (base ' + f(base) + ')' : '')));
    box.append(row);
    for (const m of explain(d, key, g.mods)) { const line = el('div', 'buff', describe(m)); line.style.color = m.ri >= 0 ? RARITIES[m.ri].color : '#f2b84b'; box.append(line); }
  }
  box.append(el('p', 'muted', 'Damage dealt: ' + num(t.dealt) + ' · Kills: ' + t.kills));
}

function indicator(g, r, m) {
  const a = affected(r, m, g.heroes), d = el('small', 'aff');
  if (a.global) { d.textContent = 'Affects: ' + a.label; return d; }
  if (!a.types.size) { d.textContent = 'No matching heroes on the map yet'; d.classList.add('warn'); return d; }
  d.append('Affects: ');
  for (const [type, n] of a.types) { const chip = el('span', 'chip'); chip.style.background = HEROES[type].color; d.append(chip, HEROES[type].name + ' ×' + n + ' '); }
  return d;
}
export function showPick(g, offers, onPick) {
  const box = $('choices'); box.textContent = '';
  offers.forEach(o => {
    const rar = RARITIES[o.ri], b = el('button'), tag = el('small', 'rar', rar.name);
    tag.style.color = rar.color; b.style.borderColor = rar.color;
    b.append(el('b', '', o.relic.name), tag, el('small', '', o.relic.desc(rar.mult)), indicator(g, o.relic, rar.mult));
    b.onclick = () => onPick(o); box.append(b);
  });
  $('pick').hidden = false;
}
export const hidePick = () => { $('pick').hidden = true; };
export function showOver(text, msg) { $('overText').textContent = text; $('subMsg').textContent = msg || ''; $('over').hidden = false; }
export const setOverMsg = msg => { $('subMsg').textContent = msg; };
export const hideOver = () => { $('over').hidden = true; };
