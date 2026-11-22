/* All DOM work for the game screen. Values are only written when they change, to avoid needless page updates. */
import { HEROES, RARITIES, RELICS, STAT_LABELS, rarityOdds, HERO_LEVELS, ATTRIBUTES, ATTRIBUTE_EFFECTS, HERO_COST, nextStep } from '../content/data.js';
/* Attribute short names and colours: strength red, dexterity green, intellect blue. */
export const ATTR_SHORT = { strength: 'Str', dexterity: 'Dex', intellect: 'Int' };
export const ATTR_COLOR = { strength: '#e5645a', dexterity: '#5fd46f', intellect: '#5aa9ff' };
import { ULTIMATES, ultDesc } from '../engine/ultimates.js';
import '../engine/kits/index.js';
import { DAMAGE_LABEL, AILMENTS } from '../content/combat.js';
import { rateOf } from '../engine/behaviors.js';
import { explain, affected, attributeDamage } from '../engine/stats.js';
import { bindTip } from '../core/tooltip.js';
import { spriteImg, spriteUrl, heroSprite, attackIcon, ultimateIcon, relicIcon, cardPicture } from './sprites.js';
import { isBossWave } from '../engine/enemies.js';
import { ITEMS, itemName, itemColor, itemBonusLines } from '../content/items.js';
import { COOP } from '../content/rules.js';
import { UNLOCKS } from '../content/unlocks.js';
import { SLOT_NAME } from '../content/upgrades.js';
import { relicMult } from '../engine/relics.js';
import { EFFECT_STATS } from '../content/effect-stats.js';
import { PREVIEWS } from '../content/previews.js';
import { PLAYER_COLORS } from './render.js';

const $ = id => document.getElementById(id);
const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const f = x => +x.toFixed(2);
const num = x => Math.round(x).toLocaleString();
const odd = x => (Math.round(x * 1000) / 10) + '%';   /* odds with one decimal */
const cap = s => s[0].toUpperCase() + s.slice(1);
const btns = [], rows = [];
export const heroButton = i => btns[i];
/* Sizes the hero card's picture so the figure from the head to the waist (about 62 of a portrait's 128 px) fills the frame,
   centred on the figure (--s: the scale, --f: the figure's middle in picture px, --z: the picture's size). */
function setPicture(frame, cp) {
  /* mirrored pictures: the figure's middle is measured from the other side */
  frame.className = 'pframe' + (cp.flip ? ' flip' : '');
  frame.style.setProperty?.('--z', String(cp.size)); frame.style.setProperty?.('--f', String(cp.flip ? cp.size - cp.focus : cp.focus));
  frame.style.setProperty?.('--s', String(cp.size === 128 ? 1.3 : 1.9));
}
let meterEmpty, cb = {}, banishBtns = [];

/* Tags in words, for tooltips: relics, talents and items that name a tag work on heroes that have it. */
const TAG_LABEL = { attack: 'Attack', trap: 'Trap', melee: 'Melee', range: 'Ranged', projectile: 'Projectile', spell: 'Spell', arcane: 'Arcane', thrown: 'Thrown',
  physical: 'Physical', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', toxic: 'Toxic', nature: 'Nature', minion: 'Minion', area: 'Area',
  holy: 'Holy', shadow: 'Shadow', aura: 'Aura', curse: 'Curse', chain: 'Chain', totem: 'Totem', mounted: 'Mounted' };
export const tagLine = d => d.tags.filter(t => TAG_LABEL[t]).map(t => TAG_LABEL[t]).join(' · ');
/* What a hero is, in one line (its attack and ultimate are described on their own icons): its attribute, delivery and
   source, and for a form, the hero it came from. */
const ROLE_DELIVERY = ['melee', 'projectile', 'trap', 'aura', 'area'], ROLE_SOURCE = ['attack', 'spell', 'minion'];
export function roleLine(d) {
  const pick = list => list.filter(t => d.tags.includes(t)).map(t => TAG_LABEL[t] || t).join(' + ');
  const base = d.form ? HEROES.find(h => h.id === d.id) : null;
  return (STAT_LABELS[d.attribute] || '') + ' hero · ' + [pick(ROLE_DELIVERY), pick(ROLE_SOURCE)].filter(Boolean).join(' · ') + (base ? ' · a form of the ' + base.name : '');
}
/* The ailments a hero's hits can inflict right now: an ailment needs a chance above 0 (from the evolution, talents, relics
   or items) and a hit of a damage type it comes from (bleed from physical hits, burn from fire...). Slows are listed too. */
export function ailmentLine(d, s) {
  const types = new Set([d.damageType, ...d.tags]), out = [];
  for (const [id, a] of Object.entries(AILMENTS)) {
    const c = s[id + 'Chance'] || 0;
    if (c > 0 && a.from.some(t => types.has(t))) out.push(a.name + ' ' + Math.round(Math.min(1, c) * 100) + '%');
  }
  if (d.applies && d.applies.chill) out.push('Slow');
  return out.join(', ');
}

/* Short stat line for a hero tooltip, using its current stats (relics and talents included). */
function statLine(d, s) {
  const dmg = s.spread > 0 ? f(s.damage * (1 - s.spread)) + '–' + f(s.damage * (1 + s.spread)) : f(s.damage), range = Math.round(s.range);   /* min–max per hit */
  if (d.dps) return 'Damage ' + dmg + '/s, up to ' + f(s.damage * 4) + '/s · Range ' + range;
  return 'Damage ' + dmg + ' · Range ' + range + ' · ' + f((s[d.rate || 'speed'] || 1) / s.cooldown) + (d.rate === 'castSpeed' ? ' casts/s' : ' attacks/s');
}

/* One star per evolution before a hero's name; and what its upgrade does, as a tooltip line for the ability it changes. */
const stars = h => (h.tier ? '★'.repeat(h.tier) + ' ' : '');
const upgradeLine = (def, slot) => (def.upgrade && def.upgrade.slot === slot ? [{ text: '★★ ' + def.upgrade.name + ': ' + def.upgrade.short, color: '#8be28b' }] : []);

export function initUI(callbacks) {
  cb = callbacks;
  HEROES.forEach((d, i) => {
    /* Each card sits in a wrapper with its Evolve button, which pops up above the card when the hero can evolve. */
    const wrap = el('div', 'hwrap'), up = el('button', 'evoup', '▲ Evolve');
    const b = el('button', 'herocard'); b.id = 't' + i; b.onclick = () => cb.onSelectType(i);
    up.hidden = true; up.onclick = () => cb.onEvolveHero(i); b._wrap = wrap; b._up = up;
    b.style.setProperty?.('--hc', d.color);
    const key = el('span', 'key'), name = el('span', 'nm'), nmText = el('span', '', d.name), lv = el('small'), status = el('span', 'cost');
    /* the hero from the head to the waist, in a frame on the card's left (cardPicture: which picture, where the figure is) */
    const frame = el('span', 'pframe'), cp = cardPicture(d), pic = spriteImg(cp.name, 'pix');
    frame.append(pic); setPicture(frame, cp);
    /* The hero's two abilities, like action-bar icons: the basic attack darkens and clears clockwise as its cooldown runs;
       the ultimate clears as the energy bar fills and glows gold when it is ready. */
    const abil = el('span', 'abil idle'), atk = abilityIcon(attackIcon(d)), ult = abilityIcon(ultimateIcon(d));
    abil.append(atk, ult);
    bindTip(atk, () => { const info = cb.heroInfo(i), cur = info.unit ? info.unit.def : d;
      return { title: 'Basic attack', color: cur.color, lines: [cur.short, ...upgradeLine(cur, 'attack'), { text: statLine(cur, info.stats), color: '#ab9f8a' }] }; });
    bindTip(ult, () => { const info = cb.heroInfo(i), cur = info.unit ? info.unit.def : d, u = ULTIMATES[cur.ultimate], s = info.stats;
      return { title: 'Ultimate: ' + (u ? u.name : '?'), color: '#ffd84a', lines: [ultDesc(u, s), ...upgradeLine(cur, 'ultimate'),
        { text: info.unit ? 'Energy ' + Math.floor(info.unit.energy) + ' / ' + s.energyMax : 'Energy ' + s.energyPerAttack + ' per attack, ' + s.energyMax + ' to fire', color: '#ab9f8a' }] }; });
    name.append(nmText, lv, status); b.append(key, frame, name, abil); b._status = status; b._key = key; b._nm = nmText; b._lv = lv; b._pic = pic; b._frame = frame; b._picName = cp.name;
    b._abil = abil; b._atk = atk; b._ult = ult; b._form = d.id;
    bindTip(b, () => {
      const info = cb.heroInfo(i), cur = info.unit ? info.unit.def : d, u = ULTIMATES[cur.ultimate], ail = ailmentLine(cur, info.stats);
      /* The hero as a whole (its attack and ultimate have their own tooltips on the two icons) */
      const lines = [roleLine(cur), { text: statLine(cur, info.stats), color: '#ab9f8a' }];
      lines.push({ text: 'Tags: ' + tagLine(cur) + ' (relics, talents and items for these tags work on it)', color: '#ab9f8a' });
      lines.push({ text: 'Damage: ' + DAMAGE_LABEL[cur.damageType || 'physical'] + (ail ? ' · inflicts ' + ail : ''), color: '#ab9f8a' });
      lines.push({ text: 'Attack and ultimate: hover the two icons under its name.', color: '#ab9f8a' });
      lines.push(info.unit ? { text: 'Click to select it. To move it: select it, press M or right-click, then click the new spot.', color: '#ab9f8a' } : { text: 'Costs ' + HERO_COST + ' gold to place: one per match · key ' + b._key.textContent, color: '#ab9f8a' });
      if (info.unit) lines.push({ text: 'Level ' + info.unit.level + ': heroes gain XP from every kill while on the field.', color: '#8fd3ff' });
      if (info.path) lines.push({ text: 'Path: ' + info.path.name + '. Before it evolves: ' + PREVIEWS[info.path.id].desc, color: info.path.color || '#dcc6ff' });
      if (info.evo) {
        const names = (info.path ? [info.path] : info.evo.choices).map(c => c.name), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names.at(-1) : names[0];
        const need = info.evoLevel || info.evo.level;
        lines.push({ text: 'At level ' + need + ' it can ' + (info.evo.upgrade ? 'upgrade its basic attack or its ultimate' : 'evolve into ' + list) + ' for ' + info.evoCost + ' gold.', color: info.unit && info.unit.level >= need && info.gold >= info.evoCost ? '#f2b84b' : '#ab9f8a' });
      }
      return { title: cur.name + ' · ' + cap(cur.archetype), color: cur.color, lines };
    });
    wrap.append(up, b); $('tbtns').append(wrap); btns.push(b);
  });
  bindTip($('relic'), () => ({ title: 'Relic', color: '#dcc6ff', lines: [
    'Spend gold to choose 1 of 3 random relics: permanent bonuses for the rest of this run.',
    'Rarer relics are stronger. You can reroll the offers for gold; Relic talents give free rerolls and banishes.',
    ...oddsLines(cb.luck ? cb.luck() : 0),
    { text: 'The price goes up with each relic you buy. Key: Space (then 1, 2 or 3 to pick)', color: '#ab9f8a' }] }));
  bindTip($('auto'), () => ({ title: 'Auto-start', lines: ['Starts the next wave by itself 3 seconds after a wave is cleared. When it is on, the button is green with a glowing, pulsing border; when it is off, it is red.', { text: 'Turned off again when you retry a level.', color: '#ab9f8a' }] }));
  bindTip($('shopBtn'), () => ({ title: 'Shop', color: '#dcc6ff', lines: ['Ground effects for tiles, a gamble, and a boss to summon for gold.', { text: 'Key: B', color: '#ab9f8a' }] }));
  bindTip($('spd'), () => ({ title: 'Game speed', lines: (cb.maxSpeed ? cb.maxSpeed() : 1) > 1 ? ['Switch between ' + (cb.maxSpeed() > 2 ? '1x, 2x and 3x' : 'normal (1x) and double (2x)') + ' speed.']
    : ['Normal speed (1x).', { text: '2x unlocks in Act ' + UNLOCKS.speed2.act + '.', color: '#ab9f8a' }] }));
  bindTip($('menuBtn'), () => ({ title: 'Menu', lines: ['Pauses the game and asks before quitting the match. Key: P to pause, Esc to resume.'] }));
  $('meterToggle').onclick = () => {
    const open = $('meterToggle').getAttribute?.('aria-expanded') !== 'false';
    $('meterToggle').setAttribute('aria-expanded', String(!open)); $('meter').hidden = open;
    cb.onLayoutChange && cb.onLayoutChange();
  };
  const m = $('meter'); m.textContent = '';
  meterEmpty = el('p', 'muted', 'No damage dealt yet.'); m.append(meterEmpty);
  for (let k = 0; k < HEROES.length * COOP.maxPlayers; k++) {
    const root = el('div', 'mrow'), name = el('span'), bar = el('span', 'mbar'), fill = el('i'), val = el('span', '', '0');
    root.hidden = true; bar.append(fill); root.append(name, bar, val); m.append(root); rows.push({ root, name, fill, val, type: -1 });
  }
  $('reroll').onclick = () => cb.onReroll();
}

/* Rarity odds as tooltip lines, e.g. "Odds: Common 55% · Uncommon 28% ...", plus the luck that shaped them. */
function oddsLines(luck) {
  const odds = rarityOdds(luck);
  return [{ text: 'Odds: ' + RARITIES.map((r, i) => r.name + ' ' + odd(odds[i])).join(' · '), color: '#ab9f8a' },
    ...(luck > 0 ? [{ text: 'Relic luck +' + f(luck * 100) + '%', color: '#8be28b' }] : [])];
}

export function renderHUD(g, v) {
  const sel = v.sel, auto = g.auto;
  setText($('gold'), g.gold); setText($('lives'), g.lives);
  /* Compound interest: what the next wave clear pays, and how much gold earns the full amount. */
  const ir = g.gs.interest, icap = g.gs.interestCap, line = $('interest');
  if (ir > 0 && icap > 0) {
    const need = Math.ceil(icap / ir - 1e-9), now = Math.min(Math.floor(icap + 1e-9), Math.floor(g.gold * ir + 1e-9));
    line.hidden = false;
    setText(line, g.gold >= need ? 'Interest +' + now + ' (full)' : 'Interest +' + now + ' · full at ' + need.toLocaleString());
    line.classList.toggle('full', g.gold >= need);
  } else line.hidden = true;
  $('relic').classList.toggle('poor', g.gold < g.relicCost());
  /* Boss waves: shown during the wave, and in the build phase before one. */
  const boss = g.phase === 'wave' ? isBossWave(g.wave, g.stage) : g.phase === 'build' && isBossWave(g.wave + 1, g.stage);
  setText($('wave'), g.wave + (g.stage.endless ? '' : ' / ' + g.maxWave) + (boss ? (g.phase === 'wave' ? ' · Boss' : ' · Boss next') : '')); setText($('stage'), g.stage.code || g.stage.n);
  $('wave').classList.toggle('boss', !!boss);
  if (coop) {
    /* Co-op: the wave starts when everyone is ready (or on Auto-start). */
    const waiting = g.players.filter(p => !p.ready && !p.auto && !p.left).length;
    const ready = g.me.ready || !!v.pendWave;   /* a guest's Ready shows at once, before the host has it */
    $('go').disabled = g.phase !== 'build' || g.picking || ready;
    setText($('go'), g.phase !== 'build' ? 'Wave ' + g.wave : ready ? 'Ready · waiting for ' + Math.max(1, waiting - (g.me.ready ? 0 : 1)) : 'Ready');
    renderCoopBar(g);
  } else {
    $('go').disabled = g.phase !== 'build' || g.picking;
    setText($('go'), g.phase === 'build' && auto ? 'Start ' + Math.max(0, Math.ceil(g.autoT)) + 's' : 'Start');
  }
  setText($('relic'), v.pendRelic ? 'Relic · …' : 'Relic · ' + g.relicCost());
  $('relic').disabled = !!v.pendRelic;
  $('auto').classList.toggle('on', auto); $('auto').setAttribute('aria-pressed', String(auto));
  $('shopBtn').hidden = !(g.me && g.me.shop); $('shopBtn').disabled = g.phase === 'over' || g.picking;
  setText($('spd'), v.speed + 'x'); $('spd').classList.toggle('on', v.speed > 1);
  let layout = false;
  HEROES.forEach((d, i) => {
    const b = btns[i];
    if (!b._inLineup) return;
    const unit = g.unitOf ? g.unitOf(i) : g.heroes.find(h => h.type === i);   /* your own hero of this class */
    /* Evolve button above the card: shown once the hero has the level, with the cost; dimmed until you have the gold. */
    const step = unit && nextStep(unit), due = !!step && unit.level >= g.evolveLevel(unit) && g.phase !== 'over';
    if (b._up.hidden === due) b._up.hidden = !due;
    if (due) {
      const cost = g.evolveCost(unit), short = g.gold < cost;
      const verb = step.upgrade ? 'Upgrade' : 'Evolve';
      setText(b._up, '▲ ' + verb + ' · ' + cost); b._up.disabled = short; b._up.classList.toggle('short', short);
      b._up.title = short ? (step.upgrade ? 'Upgrading' : 'Evolving') + ' costs ' + cost + ' gold (you have ' + g.gold + ')' : verb + ' the ' + unit.def.name + ' for ' + cost + ' gold';
    }
    setText(b._nm, unit ? stars(unit) + unit.def.name : d.name);
    setText(b._lv, unit ? 'Lv ' + unit.level : '');
    setText(b._status, unit ? '' : String(HERO_COST));   /* shown with a coin icon */
    b.classList.toggle('poor', !unit && g.gold < HERO_COST);   /* not enough gold yet: the price shows red */
    const hc = unit ? unit.def.color : d.color, pn = cardPicture(unit ? unit.def : d).name;
    if (b._picName !== pn) { b._picName = pn; b._pic.src = spriteUrl(pn); setPicture(b._frame, cardPicture(unit ? unit.def : d)); }   /* evolved: its new form */
    if (b._hc !== hc) { b._hc = hc; b.style.setProperty?.('--hc', hc); }
    updateAbilities(b, unit, unit ? unit.def : d);
    b.classList.toggle('on', sel === i && (!unit || v.selected === unit)); b.classList.toggle('placed', !!unit);
  });
  if (layout && cb.onLayoutChange) cb.onLayoutChange();
  const box = $('relics');
  const relicKey = g.relics.map(r => r.name + r.r).join();
  if (box._g !== g || box._n !== relicKey) {
    box._g = g; box._n = relicKey; box.textContent = '';
    box.hidden = !g.relics.length;
    if (g.relics.length) {
      /* One chip per relic, whatever the rarities of its copies; the colour is the rarest copy's. */
      const byName = new Map();
      g.relics.forEach(r => { const list = byName.get(r.name) || []; list.push(r); byName.set(r.name, list); });
      for (const [name, rs] of byName) {
        const top = RARITIES[Math.max(...rs.map(r => r.r))], def = RELICS.find(x => x.name === name), n = rs.length;
        const total = rs.reduce((a, r) => a + relicMult(r), 0);   /* relic effects scale with the multiplier, so copies add up */
        const sp = el('span', 'relicchip'); sp.append(spriteImg(relicIcon(name), 'pix relicico'), el('span', '', name + (n > 1 ? ' ×' + n : '')));
        sp.style.color = top.color; sp.style.borderColor = top.color; sp.tabIndex = 0;
        bindTip(sp, () => {
          const parts = RARITIES.map((r, i) => [r, rs.filter(x => x.r === i).length]).filter(([, c]) => c).map(([r, c]) => (c > 1 ? c + '× ' : '') + r.name);
          return { title: name + (n > 1 ? ' ×' + n : ''), color: top.color, lines: [{ text: parts.join(' + '), color: '#ab9f8a' }, (n > 1 ? 'Together: ' : '') + def.desc(total)] };
        });
        box.append(sp);
      }
    }
  }
}

/* Shows only the heroes in this match's lineup, keyed 1..n in lineup order. */
/* Co-op: the players' names and which one is here (null in solo). The bar at the top lists everyone. */
let coop = null;
export function setCoop(info) {
  coop = info; const bar = $('coopBar');
  bar.hidden = !info; bar.textContent = ''; bar._k = '';
  $('playOnPickRow').hidden = !!info;   /* co-op matches never wait for a relic choice */
  $('spd').title = info && info.me !== undefined ? 'Game speed (the host sets it)' : 'Game speed';
}
function renderCoopBar(g) {
  const bar = $('coopBar'), k = g.players.map(p => [p.gold, p.ready || p.auto, p.left, p.picking].join(':')).join('|') + g.phase;
  if (bar._k === k) return;
  bar._k = k; bar.textContent = '';
  g.players.forEach((p, i) => {
    const sp = el('span', p.left ? 'left' : ''), dot = el('i');
    sp.style.setProperty('--pc', PLAYER_COLORS[i]);
    sp.append(dot, el('b', '', coop.names[i] + (i === coop.me ? ' (you)' : '')), el('small', '', p.gold + 'g'));
    if (p.left) sp.append(el('small', '', 'left'));
    else if (g.phase === 'build' && (p.ready || p.auto)) sp.append(el('small', 'rdy', p.auto ? 'auto' : 'ready'));
    else if (p.picking) sp.append(el('small', '', 'choosing'));
    bar.append(sp);
  });
}
export function setLineup(g) {
  /* Cards follow the lineup order, so the card for key 1 comes first. */
  HEROES.forEach((d, i) => { const pos = g.lineup.indexOf(d.id), b = btns[i]; b._inLineup = pos >= 0; b.hidden = b._wrap.hidden = pos < 0; b._up.hidden = true; b._wrap.style.order = String(Math.max(0, pos)); if (pos >= 0) setText(b._key, pos + 1); });
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
    if (r.type !== type) {
      const d = HEROES[type % HEROES.length], who = (type / HEROES.length) | 0;   /* co-op: whose hero it is, in their colour */
      r.type = type; r.name.textContent = d.name + (coop ? ' · ' + coop.names[who] : ''); r.name.style.color = d.color;
      r.fill.style.background = coop ? PLAYER_COLORS[who] : d.color;
    }
    r.fill.style.width = (totals[type] / sum * 100) + '%';
    setText(r.val, num(totals[type]) + ' · ' + Math.round(totals[type] / sum * 100) + '%');
  });
}

/* Where a non-relic modifier comes from: ri -1 talent, -2 item, -3 evolution. */
const SOURCE = { '-1': 'Talent', '-2': 'Item', '-3': 'Evolution', '-4': 'Level', '-5': 'Buff', '-6': 'Effect' };
const SOURCE_COLOR = { '-1': '#f2b84b', '-2': '#8be28b', '-3': '#dcc6ff', '-4': '#8fd3ff', '-5': '#ff9d8a', '-6': '#ffe08a' };
const pct = x => f(x * 100) + '%';
/* Stats shown as percentages (chances). */
const isChance = key => /Chance$/.test(key) || !!(EFFECT_STATS[key] && EFFECT_STATS[key].pct);

/* Bonuses from the same source are shown as one line, whatever their rarity: a Common and a Rare Sharpened rounds become
   "+100% · Sharpened rounds ×2 (Relic)". All talent nodes count as one source, "Talents". inc and flat values add up;
   more values multiply. The line takes the colour of the rarest copy. */
const kindOf = ri => (ri >= 0 ? 'relic' : String(ri));
const sourceOf = m => (m.ri === -1 ? 'Talents' : m.ri === -2 ? 'Items' : m.source);   /* talents and items each count as one source */
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
  if (m.ri === -2) return v + ' · Items' + (m.n > 1 ? ' ×' + m.n : '');
  if (m.ri === -4) return v + ' · Hero level';
  return v + ' · ' + m.source + (m.n > 1 ? ' ×' + m.n : '') + ' (' + (m.ri >= 0 ? 'Relic' : SOURCE[m.ri] || 'Talent') + ')';
}
/* Whether a hero can evolve right now: it has a next step, has reached its level and you have the gold. */
export const canEvolve = (g, h) => { const s = nextStep(h); return !!s && h.level >= g.evolveLevel(h) && g.gold >= g.evolveCost(h) && g.phase !== 'over'; };

/* The inspector is rebuilt only when the selection, the modifiers or the move state change, so buttons never vanish under a click.
   There are no Move or Evolve buttons: select a hero and press M or right-click to move it (then click the new spot), and the evolution choices appear here
   (with an Evolve button popping up above the hero's card) once the hero has reached the evolution's level. */
export function renderInspector(g, v) {
  const box = $('inspect'), t = v.selected;
  $('heroPanel').hidden = !t;
  if (!t) { box._k = 'none'; box._t = null; return; }
  const bk = (t.buffs || []).map(b => b.id).join(',');   /* rebuild when a buff starts or ends */
  const owner = g.players ? g.players[t.owner || 0] : null, ownerMods = owner ? owner.mods : g.mods;   /* the modifiers of the hero's owner */
  if (box._t !== t || box._m !== ownerMods.length || box._tier !== t.tier || box._lv !== t.level || box._bk !== bk) {
    box._k = 't'; box._t = t; box._m = ownerMods.length; box._tier = t.tier; box._lv = t.level; box._bk = bk; box.textContent = '';
    const d = t.def, head = el('div', 'phead'), title = el('b', '', stars(t) + d.name + ' · Lv ' + t.level + (coop && (t.owner || 0) !== coop.me ? ' · ' + coop.names[t.owner || 0] + "'s" : '')), close = el('button', 'linkbtn pclose', '✕');
    title.style.color = d.color; $('heroPanel').style.setProperty?.('--hc', d.color);   /* the window takes the hero's colour */
    close.onclick = cb.onCloseInspector; close.title = 'Close (Esc)'; head.append(title, close); box.append(head);
    /* Right under the name: what the hero has done this match (icons; hover for the words). */
    const tally = el('div', 'tally'), tv = k => { const sp = el('span', 'tv'), b = el('b'); sp.append(spriteImg('icon_' + k, 'pix ico'), b); tally.append(sp); return b; };
    box._tDealt = tv('damage'); box._tKills = tv('kills'); box._tUlts = tv('ultimate');
    bindTip(tally, () => ({ title: 'This match', lines: ['Damage dealt: ' + num(t.dealt), 'Kills: ' + t.kills, 'Ultimates: ' + t.ults] }));
    box.append(tally);
    /* XP, then energy: thin bars with the numbers on them (what the ultimate does is on its icon in the hero's card). */
    const bar = (icon, k) => {
      const r = el('div', 'pbar'), b = el('span', 'ebar wide' + (k === 'xp' ? ' xpbar' : '')), fill = el('i'), lbl = el('span', 'pbtxt');
      b.append(fill); r.append(spriteImg('icon_' + icon, 'pix ico'), b, lbl); box.append(r);
      bindTip(r, () => (k === 'xp' ? { title: 'Experience', lines: ['Level ' + t.level + '. Heroes gain XP from every kill while on the field.'] }
        : { title: 'Energy', lines: ['Fills with each attack' + (t.s.energyPerSecond ? ' and over time' : '') + '; when full, the ultimate fires.', { text: 'What it does: hover the ultimate icon on the hero\'s card.', color: '#ab9f8a' }] }));
      return { lbl, b, fill };
    };
    const xp = bar('xp', 'xp'), en = bar('energy', 'energy');
    box._lvl = xp.lbl; box._xfill = xp.fill; box._xbar = xp.b; box._elbl = en.lbl; box._efill = en.fill; box._ebar = en.b;
    /* Attributes: icon and value (the main one in its colour); hover for what they give. */
    const all = ownerMods.concat(t.mods, t.lvlMods || [], ...(t.buffs || []).map(b => b.mods));
    const ar = el('div', 'attrs');
    for (const a of ATTRIBUTES) {
      const own = a === d.attribute, sp = el('span', 'attr' + (own ? ' main' : ''));
      sp.append(spriteImg('icon_' + a, 'pix ico'), el('b', '', f(t.s[a])));
      if (own) sp.style.color = ATTR_COLOR[a];
      bindTip(sp, () => ({ title: STAT_LABELS[a] + (own ? ' (main attribute)' : ''), color: own ? ATTR_COLOR[a] : undefined,
        lines: [...(own ? ['+' + pct(attributeDamage(d, t.s)) + ' damage (+1% per point)'] : []),
          ...ATTRIBUTE_EFFECTS[a].map(fx => '+' + f(t.s[a] * fx.per * 100) + '% ' + fx.label),
          ...stackMods(explain(d, a, all).concat(own ? explain(d, 'mainAttribute', all) : [])).map(m => ({ text: describe(m, a), color: '#ab9f8a' }))] }));
      ar.append(sp);
    }
    box.append(ar);
    /* Stats: a grid of icon + value; the name and where the value comes from (attribute, talents, items, relics, level,
       buffs) show on hover, so the window stays small. */
    const grid = el('div', 'pstats');
    for (const key in d.stats) {
      if (key === 'cooldown' || key === 'energyMax' || ATTRIBUTES.includes(key)) continue;
      if (!t.s[key] && !d.stats[key]) continue;          /* unused stats (most combat stats for now) stay hidden */
      if (key === 'critDamage' && !(t.s.critChance > 0)) continue;   /* crit damage only matters with some crit chance */
      if (key === 'spread') continue;                                    /* shown with the damage as min-max */
      if (key.startsWith('minion') && !d.tags.includes('minion')) continue;   /* minion stats only for heroes with a minion */
      const isRate = key === 'speed' || key === 'castSpeed';
      const label = key === 'damage' ? (d.dps ? 'Damage per second' : 'Damage') + ' (' + DAMAGE_LABEL[d.damageType || 'physical'] + ')' : STAT_LABELS[key] || key;
      const value = isRate ? t.s[key] / t.s.cooldown : t.s[key];
      const base = isRate ? d.stats[key] / d.stats.cooldown : d.stats[key];
      const show = x => fmtStat(key, x);
      const cell = el('span', 'pst' + (key === 'damage' ? ' wide' : '')), icon = statIcon(key);
      if (EFFECT_STATS[key]) cell.append(spriteImg(effectIcon(key), 'pix ico')); else if (icon) cell.append(spriteImg('icon_' + icon, 'pix ico')); else cell.append(el('small', 'pabbr', abbr(label)));
      const val = el('b', '', show(value) + (key === 'damage' && t.s.spread > 0 ? ' (' + f(value * (1 - t.s.spread)) + '–' + f(value * (1 + t.s.spread)) + ')' : ''));
      if (f(value) !== f(base)) val.classList.add('up');
      cell.append(val); grid.append(cell);
      const mods = stackMods(explain(d, key, all));
      bindTip(cell, () => ({ title: label + ': ' + exact(key, value), lines: [...(EFFECT_STATS[key] ? [EFFECT_STATS[key].text(value)] : [{ text: 'Base ' + exact(key, base), color: '#ab9f8a' }]),
        ...(key === 'damage' && attributeDamage(d, t.s) > 0 ? [{ text: '+' + pct(attributeDamage(d, t.s)) + ' · ' + STAT_LABELS[d.attribute] + ' (attribute)', color: ATTR_COLOR[d.attribute] }] : []),
        ...mods.map(m => ({ text: describe(m, key), color: m.ri >= 0 ? RARITIES[m.ri].color : SOURCE_COLOR[m.ri] || '#f2b84b' })),
        ...(mods.length || f(value) !== f(base) ? [] : [{ text: 'Nothing changes it yet', color: '#6f7d74' }])] }));
    }
    box.append(grid);
    /* Items: the hero's gear as icons; hover one for its stats (all of them together show as "Items" in each stat's tip). */
    const gear = owner && owner.items ? owner.items[t.base.id] || [] : [];
    if (gear.length) {
      const row = el('div', 'gearrow');
      for (const it of gear) {
        const known = ITEMS[it.type], cell = el('span', 'gearicon'); cell.style.setProperty('--rc', itemColor(it));
        if (known) cell.append(spriteImg('item_' + it.type + '_' + it.rarity, 'pix')); else cell.textContent = String(it.type).slice(0, 2).toUpperCase();
        bindTip(cell, () => ({ title: itemName(it), color: itemColor(it), lines: itemBonusLines(it).map(l => ({ text: l.text, color: l.color })) }));
        row.append(cell);
      }
      box.append(row);
    }
  }
  setText(box._tDealt, num(t.dealt)); setText(box._tKills, String(t.kills)); setText(box._tUlts, String(t.ults));
  setText(box._elbl, Math.floor(t.energy) + ' / ' + f(t.s.energyMax));
  const pctE = Math.round(t.energy / t.s.energyMax * 100) + '%';
  if (box._efill.style.width !== pctE) box._efill.style.width = pctE;
  box._ebar.classList.toggle('full', t.energy >= t.s.energyMax);
  const need = HERO_LEVELS.xpToNext(t.level), maxed = t.level >= HERO_LEVELS.max;
  setText(box._lvl, maxed ? 'max level' : Math.floor(t.xp) + ' / ' + need);
  const xp = maxed ? '100%' : Math.round(t.xp / need * 100) + '%';
  if (box._xfill.style.width !== xp) box._xfill.style.width = xp;
}
/* Each stat's icon in the hero window (assets/icon_<name>.png, art/icons.py); added damage of a type and ailment chances
   by their type. A stat without one shows a short abbreviation. */
const STAT_ICON = { damage: 'damage', range: 'range', speed: 'speed', castSpeed: 'castspeed', critChance: 'crit', critDamage: 'critdmg',
  energyPerAttack: 'energy', energyPerSecond: 'energy', armorPen: 'armorpen', resPen: 'respen', targets: 'targets', duration: 'duration',
  chillTime: 'chill', jumps: 'jumps', firePen: 'respen', coldPen: 'respen', lightningPen: 'respen' };
/* An effect stat shows its relic's icon, or its talent cluster's. */
const EFFECT_TALENT = { splash: 'might', stagger: 'fire', wither: 'sunder', venom: 'toxins', lucky: 'precision', vsFrozen: 'cold', arcing: 'lightning', recast: 'sorcery', perTile: 'marksman', fifth: 'martial' };
const effectIcon = key => EFFECT_TALENT[key] ? 'icon_talent_' + EFFECT_TALENT[key] : relicIcon(RELICS.find(r => r.fresh && r.mods(1)[0].stat === key).name);
function statIcon(key) {
  if (STAT_ICON[key]) return STAT_ICON[key];
  if (key.startsWith('minion')) return 'minion';
  let m = /^(\w+)Damage$/.exec(key); if (m && DAMAGE_LABEL[m[1]]) return 'dmg_' + m[1];
  m = /^(\w+)Chance$/.exec(key); if (m && AILMENTS[m[1]]) return 'ail_' + m[1] + '_s';
  return null;
}
const abbr = label => label.split(/[\s(]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
/* A stat's exact value, for its tooltip. */
const exact = (key, x) => (isChance(key) || /Pen$/.test(key) ? pct(x) : (key === 'speed' || key === 'castSpeed' || key === 'energyPerSecond') ? f(x) + ' per second' : String(f(x)));
/* How a stat's value reads in the compact window: chances in %, added damage as +N, rates per second, multipliers as ×N. */
function fmtStat(key, x) {
  if (isChance(key) || /Pen$/.test(key)) return pct(x);
  if (/^\w+Damage$/.test(key) && key !== 'minionDamage' && key !== 'critDamage') return '+' + f(x);
  const short = v => (Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) >= 10 ? String(+v.toFixed(1)) : String(f(v)));   /* fits the small cells; the exact value is in the tooltip */
  if (key === 'critDamage' || key === 'duration' || key === 'minionDamage' || key === 'minionSpeed') return '×' + short(x);
  return short(x);
}

/* The evolution picker: like the relic picker, it covers the game (which pauses) and offers the hero's forms side by side. */
export function showEvoPick(g, h) {
  const step = nextStep(h); if (!step) return;
  const cost = g.evolveCost(h), box = $('evoChoices'); box.textContent = '';
  setText($('evoTitle'), (step.upgrade ? 'Upgrade the ' : 'Evolve the ') + h.def.name + ' · ' + cost + ' gold');
  step.choices.forEach((c, i) => {
    if (h.preview && c.id !== h.preview.form) return;   /* a hero with a path evolves only into its form */
    if (step.upgrade) { box.append(upgradeCard(h, c, i, g.gold < cost)); return; }
    const d = h.def, u = ULTIMATES[c.ultimate || d.ultimate], color = c.color || d.color, card = el('div', 'card'), b = el('button', 'choose');
    const nm = el('b', '', c.name); nm.style.color = color; b.style.borderColor = color;
    b.append(nm, el('small', 'rar', DAMAGE_LABEL[c.damageType || d.damageType] + ' damage'), el('small', '', c.short),
      ...(u ? [el('small', 'aff', 'Ultimate: ' + u.name + ': ' + ultDesc(u, h.s))] : []), el('small', 'aff', '+25% to all its stats'));
    b.disabled = g.gold < cost;
    b.onclick = () => cb.onEvolveChoice(i);
    card.append(b); box.append(card);
  });
  setText($('evoGold'), g.gold < cost ? 'You need ' + cost + ' gold (you have ' + g.gold + ').' : 'Gold: ' + g.gold);
  $('evoPick').hidden = false;
}
/* The second evolution: what it upgrades, with the icon of that ability. */
function upgradeCard(h, c, i, poor) {
  const d = h.def, card = el('div', 'card'), b = el('button', 'choose'), nm = el('b', '', c.name), u = ULTIMATES[d.ultimate];
  nm.style.color = d.color; b.classList.add('relicard'); b.style.setProperty?.('--rc', d.color);
  b.append(spriteImg(c.slot === 'attack' ? attackIcon(d) : ultimateIcon(d), 'pix relicico top'), nm,
    el('small', 'rar', SLOT_NAME[c.slot] + (c.slot === 'ultimate' && u ? ': ' + u.name : '')), el('small', '', c.short));
  b.disabled = poor; b.onclick = () => cb.onEvolveChoice(i);
  card.append(b); return card;
}
export const hideEvoPick = () => { $('evoPick').hidden = true; };



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
    tag.style.color = rar.color; b.classList.add('relicard'); b.style.setProperty('--rc', rar.color);   /* the card in its rarity's colour */
    const nm = el('b', 'relicname', o.relic.name);
    b.append(el('small', 'pickkey', 'Key ' + (i + 1)), spriteImg(relicIcon(o.relic.name), 'pix relicico top'), nm, tag, el('small', '', o.relic.desc(rar.mult * g.fxm.relicPower)), indicator(g, o.relic, rar.mult * g.fxm.relicPower));
    b.onclick = () => cb.onChoose(i); ban.onclick = () => cb.onBanish(i);
    ban.title = 'Remove this relic from your pool for the rest of the run, and draw another';
    card.append(b, ban); box.append(card); banishBtns.push(ban);
  });
  const keep = $('playOnPick');
  keep.checked = !!g.playOnPick; keep.onchange = () => cb.onPlayOnPick(!!keep.checked);
  if (!keep._tip) (keep._tip = true, bindTip(keep.parentElement || keep, () => ({ title: 'Keep playing while choosing', lines: ['The match carries on behind this window while you pick a relic.',
    { text: 'Off by default. Remembered for your next matches.', color: '#ab9f8a' }] })));
  $('pick').hidden = false; updatePick(g);
}
/* Cheap per-frame refresh of prices and disabled states while the picker is open. */
export function updatePick(g) {
  const odds = rarityOdds(g.gs.relicLuck), box = $('pickOdds');
  if (box._luck !== g.gs.relicLuck) {
    box._luck = g.gs.relicLuck; box.textContent = '';
    box.append('Odds: ');
    RARITIES.forEach((r, i) => { const sp = el('span', '', r.name + ' ' + odd(odds[i])); sp.style.color = r.color; if (i) box.append(' · '); box.append(sp); });
    if (g.gs.relicLuck > 0) box.append(' (luck +' + f(g.gs.relicLuck * 100) + '%)');
  }
  /* Rerolls: free while talents give you some, then for gold (more for each gold reroll of the same choice). */
  const rc = g.rerolls > 0 ? 0 : g.rerollCost(), poorR = rc > g.gold;
  setText($('reroll'), g.rerolls > 0 ? 'Reroll all · ' + g.rerolls + ' free' : 'Reroll all · ' + rc + ' gold');
  $('reroll').hidden = false; $('reroll').disabled = poorR; $('reroll').classList.toggle('poor', poorR);
  $('reroll').title = g.rerolls > 0 ? 'Draw three new offers (free)' : 'Draw three new offers for ' + rc + ' gold';
  setText($('pickGold'), 'Gold ' + g.gold);
  $('pick').classList.toggle('live', !!g.playOnPick || !!coop);   /* lighter backdrop, so the match shows through */
  banishBtns.forEach(b => { setText(b, 'Banish · ' + g.banishes + ' left'); b.disabled = !(g.banishes > 0); b.hidden = !(g.banishes > 0); });
}
/* An ability icon: the picture, a dark sweep over it (--p: the part still to go, 0 to 1) and a countdown. */
function abilityIcon(name) {
  const box = el('span', 'ab'), sweep = el('span', 'sw'), t = el('span', 'cdt');
  box.append(spriteImg(name, 'pix'), sweep, t); box._img = box.children[0]; box._sw = sweep; box._t = t; box._p = -1;
  return box;
}
function setSweep(box, p, text, ready) {
  p = Math.round(Math.max(0, Math.min(1, p)) * 100) / 100;
  if (box._p !== p) { box._p = p; box._sw.style.setProperty?.('--p', String(p)); }
  setText(box._t, text);
  if (box._ready !== ready) { box._ready = ready; box.classList.toggle('ready', ready); }
}
function updateAbilities(b, unit, def) {
  const form = def.form || def.id;
  if (b._form !== form) {             /* evolved: the new form's icons */
    b._form = form;
    b._atk._img.src = spriteUrl(attackIcon(def)); b._ult._img.src = spriteUrl(ultimateIcon(def));
  }
  const idle = !unit;
  if (b._idle !== idle) { b._idle = idle; b._abil.classList.toggle('idle', idle); }
  if (!unit) { setSweep(b._atk, 0, '', false); setSweep(b._ult, 1, '', false); return; }
  const full = unit.s.cooldown ? unit.s.cooldown / (rateOf(unit) * (def.kind === 'wolf' ? unit.s.minionSpeed || 1 : 1)) : 0, left = Math.max(0, unit.cd || 0);
  setSweep(b._atk, full > 0 ? left / full : 0, left >= 1 ? String(Math.ceil(left)) : '', false);
  const e = unit.s.energyMax ? unit.energy / unit.s.energyMax : 0;
  setSweep(b._ult, 1 - e, '', e >= 1);
}

export const hidePick = () => { $('pick').hidden = true; };
export function showOver(title, text, msg, canNext) {
  setText($('overTitle'), title); setText($('overText'), text); setText($('subMsg'), msg || '');
  $('overNext').hidden = !canNext; $('over').hidden = false;
}
export const setOverMsg = msg => { setText($('subMsg'), msg); };
export const hideOver = () => { $('over').hidden = true; };
