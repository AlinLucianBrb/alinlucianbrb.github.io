/* All DOM work for the game screen. Values are only written when they change, to avoid needless page updates. */
import { HEROES, RARITIES, RELICS, STAT_LABELS, rarityOdds, HERO_LEVELS } from '../content/data.js';
import { ULTIMATES } from '../engine/ultimates.js';
import { DAMAGE_LABEL } from '../content/combat.js';
import { explain, affected } from '../engine/stats.js';
import { bindTip } from '../core/tooltip.js';

const $ = id => document.getElementById(id);
const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const f = x => +x.toFixed(2);
const num = x => Math.round(x).toLocaleString();
const odd = x => (Math.round(x * 1000) / 10) + '%';   /* odds with one decimal */
const cap = s => s[0].toUpperCase() + s.slice(1);
const btns = [], rows = [];
export const heroButton = i => btns[i];
let meterEmpty, cb = {}, banishBtns = [];

/* Short stat line for a hero tooltip, using its current stats (relics and talents included). */
function statLine(d, s) {
  const dmg = f(s.damage), range = Math.round(s.range);
  if (d.dps) return 'Damage ' + dmg + '/s, up to ' + f(s.damage * 4) + '/s · Range ' + range;
  return 'Damage ' + dmg + ' · Range ' + range + ' · ' + f(s.speed / s.cooldown) + ' attacks/s';
}

export function initUI(callbacks) {
  cb = callbacks;
  HEROES.forEach((d, i) => {
    const b = el('button', 'herocard'); b.id = 't' + i; b.onclick = () => cb.onSelectType(i);
    b.style.setProperty?.('--hc', d.color);
    const key = el('span', 'key'), name = el('span', 'nm', d.name), status = el('span', 'cost'), ebar = el('span', 'ebar'), efill = el('i');
    ebar.append(efill); b.append(key, name, status, ebar); b._status = status; b._key = key; b._efill = efill; b._ebar = ebar;
    bindTip(b, () => {
      const info = cb.heroInfo(i), u = ULTIMATES[d.ultimate];
      const lines = [d.short, { text: statLine(d, info.stats), color: '#9db3a3' }];
      if (u) lines.push({ text: 'Ultimate: ' + u.name + ' (' + u.desc + ')', color: '#9db3a3' });
      lines.push(info.unit ? { text: 'On the field: click to select it.', color: '#9db3a3' } : { text: 'Free to place: one per match · key ' + b._key.textContent, color: '#9db3a3' });
      if (info.unit) lines.push({ text: 'Level ' + info.unit.level + ': heroes gain XP from every kill while on the field.', color: '#8fd3ff' });
      if (info.evo) {
        const names = info.evo.choices.map(c => c.name), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names.at(-1) : names[0];
        lines.push({ text: 'At level ' + info.evo.level + ' it can evolve into ' + list + ' for ' + info.evoCost + ' gold.', color: info.unit && info.unit.level >= info.evo.level && info.gold >= info.evoCost ? '#f2b84b' : '#9db3a3' });
      }
      return { title: d.name + ' · ' + cap(d.archetype), color: d.color, lines };
    });
    $('tbtns').append(b); btns.push(b);
  });
  bindTip($('relic'), () => ({ title: 'Relic', color: '#dcc6ff', lines: [
    'Spend gold to choose 1 of 3 random relics: permanent bonuses for the rest of this run.',
    'Rarer relics are stronger. You can reroll or banish the offers for a little gold.',
    ...oddsLines(cb.luck ? cb.luck() : 0),
    { text: 'The price goes up with each relic you buy. Key: R', color: '#9db3a3' }] }));
  bindTip($('auto'), () => ({ title: 'Auto-start', lines: ['Starts the next wave by itself 3 seconds after a wave is cleared. Lit up when on.', { text: 'Turned off again when you retry a level.', color: '#9db3a3' }] }));
  bindTip($('spd'), () => ({ title: 'Game speed', lines: ['Switch between normal (1x) and double (2x) speed.'] }));
  bindTip($('menuBtn'), () => ({ title: 'Menu', lines: ['Pauses the game and asks before quitting the match. Key: P to pause, Esc to resume.'] }));
  $('meterToggle').onclick = () => {
    const open = $('meterToggle').getAttribute?.('aria-expanded') !== 'false';
    $('meterToggle').setAttribute('aria-expanded', String(!open)); $('meter').hidden = open;
    cb.onLayoutChange && cb.onLayoutChange();
  };
  const m = $('meter'); m.textContent = '';
  meterEmpty = el('p', 'muted', 'No damage dealt yet.'); m.append(meterEmpty);
  HEROES.forEach(() => {
    const root = el('div', 'mrow'), name = el('span'), bar = el('span', 'mbar'), fill = el('i'), val = el('span', '', '0');
    root.hidden = true; bar.append(fill); root.append(name, bar, val); m.append(root); rows.push({ root, name, fill, val, type: -1 });
  });
  $('reroll').onclick = () => cb.onReroll();
}

/* Rarity odds as tooltip lines, e.g. "Odds: Common 55% · Uncommon 28% ...", plus the luck that shaped them. */
function oddsLines(luck) {
  const odds = rarityOdds(luck);
  return [{ text: 'Odds: ' + RARITIES.map((r, i) => r.name + ' ' + odd(odds[i])).join(' · '), color: '#9db3a3' },
    ...(luck > 0 ? [{ text: 'Relic luck +' + f(luck * 100) + '%', color: '#8be28b' }] : [])];
}

export function renderHUD(g, v) {
  const sel = v.sel, auto = g.auto;
  setText($('gold'), g.gold); setText($('lives'), g.lives);
  /* Compound interest: what the next wave clear pays, and how much gold earns the full amount. */
  const ir = g.gs.interest, icap = g.gs.interestCap, line = $('interest');
  if (ir > 0 && icap > 0) {
    const need = Math.ceil(icap / ir), now = Math.min(icap, Math.floor(g.gold * ir));
    line.hidden = false;
    setText(line, g.gold >= need ? 'Interest +' + now + ' (full)' : 'Interest +' + now + ' · full at ' + need.toLocaleString());
    line.classList.toggle('full', g.gold >= need);
  } else line.hidden = true;
  $('relic').classList.toggle('poor', g.gold < g.relicCost());
  setText($('wave'), g.wave + ' / ' + g.maxWave); setText($('stage'), g.stage.n);
  $('go').disabled = g.phase !== 'build' || g.picking;
  setText($('go'), g.phase === 'build' && auto ? 'Start now (' + Math.max(0, Math.ceil(g.autoT)) + 's)' : 'Start wave');
  setText($('relic'), 'Relic · ' + g.relicCost());
  $('auto').classList.toggle('on', auto); $('auto').setAttribute('aria-pressed', String(auto));
  setText($('spd'), v.speed + 'x'); $('spd').classList.toggle('on', v.speed > 1);
  HEROES.forEach((d, i) => {
    const b = btns[i];
    if (b.hidden) return;
    const unit = g.heroes.find(h => h.type === i);
    setText(b._status, !unit ? 'Free · place it' : (unit.tier ? '★ ' + unit.def.name : 'On the field') + ' · Lv ' + unit.level);
    const hc = unit ? unit.def.color : d.color;
    if (b._hc !== hc) { b._hc = hc; b.style.setProperty?.('--hc', hc); }
    b.classList.toggle('on', sel === i && (!unit || v.selected === unit)); b.classList.toggle('placed', !!unit);
    b._ebar.hidden = !unit;
    if (unit) {
      const pct = Math.round(unit.energy / unit.s.energyMax * 100) + '%';
      if (b._efill.style.width !== pct) b._efill.style.width = pct;
      b._ebar.classList.toggle('full', unit.energy >= unit.s.energyMax);
    }
  });
  const box = $('relics');
  if (box._g !== g || box._n !== g.relics.length) {
    box._g = g; box._n = g.relics.length; box.textContent = '';
    box.hidden = !g.relics.length;
    if (g.relics.length) {
      /* One chip per relic, whatever the rarities of its copies; the colour is the rarest copy's. */
      const byName = new Map();
      g.relics.forEach(r => { const list = byName.get(r.name) || []; list.push(r.r); byName.set(r.name, list); });
      for (const [name, rs] of byName) {
        const top = RARITIES[Math.max(...rs)], def = RELICS.find(x => x.name === name), n = rs.length;
        const total = rs.reduce((a, r) => a + RARITIES[r].mult, 0);   /* relic effects scale with the multiplier, so copies add up */
        const sp = el('span', 'relicchip', name + (n > 1 ? ' ×' + n : ''));
        sp.style.color = top.color; sp.style.borderColor = top.color; sp.tabIndex = 0;
        bindTip(sp, () => {
          const parts = RARITIES.map((r, i) => [r, rs.filter(x => x === i).length]).filter(([, c]) => c).map(([r, c]) => (c > 1 ? c + '× ' : '') + r.name);
          return { title: name + (n > 1 ? ' ×' + n : ''), color: top.color, lines: [{ text: parts.join(' + '), color: '#9db3a3' }, (n > 1 ? 'Together: ' : '') + def.desc(total)] };
        });
        box.append(sp);
      }
    }
  }
}

/* Shows only the heroes in this match's lineup, keyed 1..n in lineup order. */
export function setLineup(g) {
  HEROES.forEach((d, i) => { const pos = g.lineup.indexOf(d.id); btns[i].hidden = pos < 0; if (pos >= 0) setText(btns[i]._key, pos + 1); });
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

/* Where a non-relic modifier comes from: ri -1 talent, -2 item, -3 evolution. */
const SOURCE = { '-1': 'Talent', '-2': 'Item', '-3': 'Evolution', '-4': 'Level' };
const SOURCE_COLOR = { '-1': '#f2b84b', '-2': '#8be28b', '-3': '#dcc6ff', '-4': '#8fd3ff' };
const pct = x => f(x * 100) + '%';
/* Stats shown as percentages (chances). */
const isChance = key => /Chance$/.test(key);

/* Bonuses from the same source are shown as one line, whatever their rarity: a Common and a Rare Sharpened rounds become
   "+100% · Sharpened rounds ×2 (Relic)". All talent nodes count as one source, "Talents". inc and flat values add up;
   more values multiply. The line takes the colour of the rarest copy. */
const kindOf = ri => (ri >= 0 ? 'relic' : String(ri));
const sourceOf = m => (m.ri === -1 ? 'Talents' : m.source);
export function stackMods(mods) {
  const groups = new Map();
  for (const m of mods) {
    const k = sourceOf(m) + '|' + kindOf(m.ri) + '|' + m.type;
    const g = groups.get(k);
    if (!g) groups.set(k, { ...m, source: sourceOf(m), n: 1 });
    else {
      g.n++; g.value = m.type === 'more' ? (1 + g.value) * (1 + m.value) - 1 : g.value + m.value;
      if (m.ri > g.ri) g.ri = m.ri;
    }
  }
  return [...groups.values()];
}
function describe(m, key) {
  const v = m.type === 'inc' ? '+' + pct(m.value) : m.type === 'flat' ? '+' + (isChance(key) ? pct(m.value) : f(m.value)) : '×' + f(1 + m.value);
  if (m.ri === -1) return v + ' · Talents' + (m.n > 1 ? ' ×' + m.n : '');   /* the name already says where it comes from */
  if (m.ri === -4) return v + ' · Hero level';
  return v + ' · ' + m.source + (m.n > 1 ? ' ×' + m.n : '') + ' (' + (m.ri >= 0 ? 'Relic' : SOURCE[m.ri] || 'Talent') + ')';
}
/* The inspector is rebuilt only when the selection, the modifiers or the move state change, so buttons never vanish under a click. */
export function renderInspector(g, v) {
  const box = $('inspect'), t = v.selected;
  $('heroPanel').hidden = !t;
  if (!t) { box._k = 'none'; box._t = null; return; }
  const moving = v.moving === t;
  const picking = !!v.evoPick;
  if (box._t !== t || box._m !== g.mods.length || box._mv !== moving || box._tier !== t.tier || box._lv !== t.level || box._pk !== picking) {
    box._k = 't'; box._t = t; box._m = g.mods.length; box._mv = moving; box._tier = t.tier; box._lv = t.level; box._pk = picking; box.textContent = '';
    const d = t.def, head = el('div', 'srow'), title = el('b', '', (t.tier ? '★ ' : '') + d.name + ' · ' + cap(d.archetype)), close = el('button', 'linkbtn', 'Close');
    title.style.color = d.color; close.onclick = cb.onCloseInspector; head.append(title, close); box.append(head);
    /* The actions come first, so they never move as the stats below change. */
    const acts = el('div', 'acts top'), mv = el('button', '', moving ? 'Cancel move' : 'Move'), evo = el('button', 'go');
    mv.onclick = cb.onMove; evo.onclick = cb.onEvolve; acts.append(mv, evo); box.append(acts); box._evo = evo;
    if (moving) box.append(el('p', 'muted', 'Click a free tile to move it there.'));
    /* The Mage's element choice: one button per form, with what it does. */
    box._choices = [];
    const step = t.base.evolutions[t.tier];
    if (picking && step) {
      box.append(el('p', 'muted', 'Choose an evolution:'));
      const row = el('div', 'evochoices');
      step.choices.forEach((c, i) => {
        const b = el('button', 'evochoice'), u = ULTIMATES[c.ultimate || d.ultimate];
        const nm = el('b', '', c.name);
        b.append(nm, el('small', '', c.short));
        b.style.borderColor = c.color || d.color; nm.style.color = c.color || d.color;
        bindTip(b, () => ({ title: c.name, color: c.color || d.color, lines: [c.short,
          { text: 'Damage: ' + DAMAGE_LABEL[c.damageType || d.damageType], color: '#9db3a3' },
          ...(u ? [{ text: 'Ultimate: ' + u.name + ' (' + (c.ultShort || u.desc) + ')', color: '#9db3a3' }] : []),
          { text: '+50% damage, range and attack speed', color: '#9db3a3' }] }));
        b.onclick = () => cb.onEvolveChoice(i);
        row.append(b); box._choices.push(b);
      });
      box.append(row);
    }
    /* Level and XP. */
    const lr = el('div', 'srow'), lv = el('span', 'lvl'), xbar = el('span', 'ebar wide xpbar'), xfill = el('i');
    xbar.append(xfill); lr.append(lv, xbar); box.append(lr); box._lvl = lv; box._xfill = xfill; box._xbar = xbar;
    /* Energy and the ultimate. */
    const u = ULTIMATES[d.ultimate], er = el('div', 'srow'), ebar = el('span', 'ebar wide'), efill = el('i');
    ebar.append(efill); er.append(el('span', '', 'Energy'), ebar); box.append(er);
    if (u) box.append(el('div', 'buff', 'When full: ' + u.name + ' (' + u.desc + ')'));
    box._efill = efill; box._ebar = ebar;
    const all = g.mods.concat(t.mods, t.lvlMods || []);
    for (const key in d.stats) {
      if (key === 'cooldown' || key === 'energyMax') continue;
      if (!t.s[key] && !d.stats[key]) continue;          /* unused stats (most combat stats for now) stay hidden */
      const isRate = key === 'speed';
      const label = key === 'damage' ? (d.dps ? 'Damage per second' : 'Damage') + ' (' + DAMAGE_LABEL[d.damageType || 'physical'] + ')' : STAT_LABELS[key] || key;
      const value = isRate ? t.s.speed / t.s.cooldown : t.s[key];
      const base = isRate ? d.stats.speed / d.stats.cooldown : d.stats[key];
      const show = x => (isChance(key) ? pct(x) : f(x));
      const row = el('div', 'srow'); row.append(el('span', '', label), el('span', '', show(value) + (f(value) !== f(base) ? '  (base ' + show(base) + ')' : '')));
      box.append(row);
      for (const m of stackMods(explain(d, key, all))) { const line = el('div', 'buff', describe(m, key)); line.style.color = m.ri >= 0 ? RARITIES[m.ri].color : SOURCE_COLOR[m.ri] || '#f2b84b'; box.append(line); }
    }
    box._dealt = el('p', 'muted'); box.append(box._dealt);
  }
  setText(box._dealt, 'Damage dealt: ' + num(t.dealt) + ' · Kills: ' + t.kills + ' · Ultimates: ' + t.ults);
  const pctE = Math.round(t.energy / t.s.energyMax * 100) + '%';
  if (box._efill.style.width !== pctE) box._efill.style.width = pctE;
  box._ebar.classList.toggle('full', t.energy >= t.s.energyMax);
  const need = HERO_LEVELS.xpToNext(t.level), maxed = t.level >= HERO_LEVELS.max;
  setText(box._lvl, 'Level ' + t.level + (maxed ? ' (max)' : ' · ' + Math.floor(t.xp) + '/' + need + ' XP'));
  const xp = maxed ? '100%' : Math.round(t.xp / need * 100) + '%';
  if (box._xfill.style.width !== xp) box._xfill.style.width = xp;
  const cost = g.evolveCost(t), evo = t.base.evolutions[t.tier], early = evo && t.level < evo.level;
  setText(box._evo, !evo ? 'Fully evolved' : early ? 'Evolve at Lv ' + evo.level : picking ? 'Cancel' : 'Evolve · ' + cost);
  box._evo.disabled = !evo || early || (!picking && g.gold < cost);
  box._evo.title = evo ? 'Level ' + evo.level + ', ' + cost + ' gold: ' + evo.choices.map(c => c.name).join(' / ') + ' (key E)' : '';
  for (const b of box._choices || []) b.disabled = g.gold < cost;
}

function indicator(g, r, m) {
  const a = affected(r, m, g.heroes), d = el('small', 'aff');
  if (a.global) { d.textContent = 'Affects: ' + a.label; return d; }
  if (!a.types.size) { d.textContent = 'No matching heroes on the map yet'; d.classList.add('warn'); return d; }
  d.append('Affects: ');
  for (const [type, n] of a.types) { const chip = el('span', 'chip'); chip.style.background = HEROES[type].color; d.append(chip, HEROES[type].name + ' ×' + n + ' '); }
  return d;
}
/* Builds the relic choices from g.pick. Called again after a reroll or banish. */
export function showPick(g) {
  const box = $('choices'); box.textContent = ''; banishBtns = [];
  g.pick.offers.forEach((o, i) => {
    const rar = RARITIES[o.ri], card = el('div', 'card'), b = el('button', 'choose'), tag = el('small', 'rar', rar.name), ban = el('button', 'linkbtn');
    tag.style.color = rar.color; b.style.borderColor = rar.color;
    b.append(el('b', '', o.relic.name), tag, el('small', '', o.relic.desc(rar.mult)), indicator(g, o.relic, rar.mult));
    b.onclick = () => cb.onChoose(i); ban.onclick = () => cb.onBanish(i);
    ban.title = 'Remove this relic from your pool for the rest of the run, and draw another';
    card.append(b, ban); box.append(card); banishBtns.push(ban);
  });
  $('pick').hidden = false; updatePick(g);
}
/* Cheap per-frame refresh of prices and disabled states while the picker is open. */
export function updatePick(g) {
  const c = g.pickCost();
  const odds = rarityOdds(g.gs.relicLuck), box = $('pickOdds');
  if (box._luck !== g.gs.relicLuck) {
    box._luck = g.gs.relicLuck; box.textContent = '';
    box.append('Odds: ');
    RARITIES.forEach((r, i) => { const sp = el('span', '', r.name + ' ' + odd(odds[i])); sp.style.color = r.color; if (i) box.append(' · '); box.append(sp); });
    if (g.gs.relicLuck > 0) box.append(' (luck +' + f(g.gs.relicLuck * 100) + '%)');
  }
  setText($('reroll'), 'Reroll all · ' + c); $('reroll').disabled = g.gold < c;
  setText($('pickGold'), 'Gold: ' + g.gold);
  banishBtns.forEach(b => { setText(b, 'Banish · ' + c); b.disabled = g.gold < c; });
}
export const hidePick = () => { $('pick').hidden = true; };
export function showOver(title, text, msg, canNext) {
  setText($('overTitle'), title); setText($('overText'), text); setText($('subMsg'), msg || '');
  $('overNext').hidden = !canNext; $('over').hidden = false;
}
export const setOverMsg = msg => { setText($('subMsg'), msg); };
export const hideOver = () => { $('over').hidden = true; };
