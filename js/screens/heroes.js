/* Heroes screen: every playable hero as a card; click one to open its page, with two tabs.
   - Information: gear slots on the left, the hero's picture in the middle (a placeholder until there is art), stats on the right.
   - Evolutions: the hero's evolution tree, from the base hero to each form it can become. Here the player picks the hero's
     evolution PATH (or none): the form it will become, chosen before the match, so its gear can specialise and the hero
     shows a preview of the form from level 1 (js/content/previews.js). Free to change between matches.
   Equipment and path changes are saved automatically. (The lineup is chosen after picking a level.) */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { HEROES, STAT_LABELS, ATTRIBUTES, ATTRIBUTE_EFFECTS, evolvedDef } from '../content/data.js';
import { SLOTS, SLOT_LABEL, itemMods, itemName, itemColor, itemBonusLines } from '../content/items.js';
import { DAMAGE_LABEL } from '../content/combat.js';
import { ULTIMATES, ultDesc } from '../engine/ultimates.js';
import { heroStats, attributeDamage } from '../engine/stats.js';
import { spriteImg, heroPortrait } from '../game/sprites.js';
import { PREVIEWS } from '../content/previews.js';
import { pathChoice, pathDef } from '../engine/preview.js';
import { savePaths } from '../services/api.js';
import { el, cap, items, itemById, equipment, gearOf, setGear, freeFor, wornItems, gearCount, ensureItems, saveNow, sqlHint, itemIcon, itemTip } from './loadout.js';

const $ = id => document.getElementById(id);
const f = x => +x.toFixed(2);
let bound = false, hero = null, tab = 'info', saved = {}, timer = 0, back = null, openSlot = null;   /* openSlot: the gear slot whose item chooser is open */   /* back: where Back goes when opened from elsewhere (choosing heroes for a level) */

const say = (t, bad) => { $('hrMsg').textContent = t || ''; $('hrMsg').classList.toggle('warn', !!bad); };
const copy = x => JSON.parse(JSON.stringify(x));

function changed() {
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 600);
  render();
}
/* Evolution paths: { heroId: formId } on the profile. */
const pathOf = id => { const p = state.profile.paths || {}; return p[id] ? pathChoice(id, p[id]) : null; };
async function setPath(id, form) {
  const before = { ...(state.profile.paths || {}) }, next = { ...before };
  if (form) next[id] = form; else delete next[id];
  state.profile.paths = next; say('Saving…'); render();
  const { profile, error } = await savePaths(next);
  if (error || !profile) { state.profile.paths = before; say('Could not save the path: ' + (error || 'unknown error') + sqlHint(error), true); render(); return; }
  state.profile.paths = profile.paths || next; say('Saved'); render();
}
/* The hero as it will play: with its path's tags (so gear for the form counts). */
const asPlayed = h => { const c = pathOf(h.id); return c ? pathDef(h, c) : h; };
const wearer = h => () => ({ tags: asPlayed(h).tags, rate: h.rate || 'speed' });

async function flush() {
  clearTimeout(timer); timer = 0;
  const { error } = await saveNow();
  if (error) {
    state.profile.equipment = copy(saved);
    say('Could not save: ' + error + sqlHint(error), true); render(); return;
  }
  saved = copy(equipment()); say('Saved');
}

/* The list of heroes. */
function renderList() {
  const grid = $('hrGrid'); grid.textContent = '';
  for (const h of HEROES) {
    const card = el('button', 'hcard'), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color);
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    const n = gearCount(h.id), c = pathOf(h.id);
    card.append(head, el('p', 'hdesc', h.short), el('small', 'muted', 'Gear ' + n + ' / ' + SLOTS.length),
      el('small', c ? 'pathline' : 'muted', c ? 'Path: ' + c.name : 'No path: choose in the match'), spriteImg(heroPortrait(h.id), 'pix hcardart'));
    card.onclick = () => { hero = h; tab = 'info'; render(); };
    grid.append(card);
  }
}

/* The item chooser for one gear slot, over the page: every free item that fits the slot (best first) as icons; hover one
   for its stats, click it to equip. Remove takes off what the slot holds. */
function slotChooser(h, slot) {
  const pop = el('div', 'slotpop'), head = el('div', 'slotpophead'), close = el('button', 'linkbtn', 'Close'), cur = itemById(gearOf(h.id)[slot]), free = freeFor(slot);
  head.append(el('b', '', SLOT_LABEL[slot] + (cur ? ': ' + itemName(cur) : ': empty')), close);
  close.onclick = () => { openSlot = null; render(); };
  pop.append(head);
  if (!free.length) pop.append(el('p', 'muted', items().length ? 'No free item for this slot.' : 'Items drop at the end of matches.'));
  else {
    const grid = el('div', 'slotgrid');
    for (const it of free) {
      const b = el('button', 'iconbtn'); b.append(itemIcon(it)); b.setAttribute('aria-label', 'Equip ' + itemName(it));
      bindTip(b, () => { const t = itemTip(it); t.lines.push({ text: 'Click to equip', color: '#f2b84b' }); return t; });
      b.onclick = () => { setGear(h.id, slot, it.id); openSlot = null; changed(); };
      grid.append(b);
    }
    pop.append(grid);
  }
  if (cur) { const off = el('button', 'linkbtn', 'Remove ' + itemName(cur)); off.onclick = () => { setGear(h.id, slot, null); openSlot = null; changed(); }; pop.append(off); }
  return pop;
}

/* Information tab: gear | picture | stats. */
function renderInfo(box, h) {
  const gear = el('div', 'hgear'), pic = el('div', 'hpic'), stats = el('div', 'hstatbox');
  gear.append(el('h3', '', 'Gear'));
  /* Each slot is one line: its item (icon and name; hover for its stats) or Empty. Click a slot to choose its item. */
  for (const slot of SLOTS) {
    const row = itemById(gearOf(h.id)[slot]), free = freeFor(slot), b = el('button', 'hslot compact' + (openSlot === slot ? ' open' : ''));
    if (row) b.append(itemIcon(row)); else b.append(el('span', 'itemicon emptyslot'));
    const txt = el('span', 'slottxt'), name = el('span', 'itemname', row ? itemName(row) : 'Empty');
    if (row) name.style.color = itemColor(row);
    txt.append(el('small', 'muted', SLOT_LABEL[slot]), name, el('small', 'muted', free.length ? free.length + ' to choose from' : row ? '' : items().length ? 'None free' : 'Drops after matches'));
    b.append(txt);
    if (row) bindTip(b, () => { const t = itemTip(row); t.lines.push({ text: 'Click to change or remove', color: '#f2b84b' }); return t; });
    b.onclick = () => { openSlot = openSlot === slot ? null : slot; render(); };
    gear.append(b);
  }
  if (openSlot) box.append(slotChooser(h, openSlot));
  /* The picture: the hero's sprite on a glow in its colour (its initial if the picture cannot load). */
  const art = el('div', 'hart art'), img = spriteImg(heroPortrait(h.id), 'pix');
  art.style.setProperty('--hc', h.color); art.append(el('span', '', h.name[0]), img);
  img.onerror = () => { img.remove(); art.classList.remove('art'); };
  pic.append(art, el('p', 'hdesc', h.short));
  const c = pathOf(h.id);
  pic.append(el('p', 'hdesc pathline', c ? 'Path: ' + c.name + '. Before level 10: ' + PREVIEWS[c.id].desc : 'No path yet: pick one on the Evolutions tab, or choose in the match.'));
  /* Stats, with the equipped items included (gear that does not fit the hero counts as its general version). */
  const worn = wornItems()[h.id], s = heroStats(asPlayed(h), itemMods(worn ? { [h.id]: worn } : {}, wearer(h)));
  stats.append(el('h3', '', 'Stats' + (worn ? ' (with gear)' : '')));
  /* Each row with its icon (art/icons.py), by the label's first word. */
  const ROW_ICON = { Strength: 'strength', Dexterity: 'dexterity', Intellect: 'intellect', Damage: 'damage', Range: 'range', Attacks: 'speed', Casts: 'castspeed', Crit: 'crit', Energy: 'energy' };
  const row = (label, value, note, cls) => {
    const r = el('div', 'srow' + (cls ? ' ' + cls : '')), name = el('span', ''), ic = ROW_ICON[label.split(' ')[0]];
    if (ic) name.append(spriteImg('icon_' + ic, 'ico pix'));
    name.append(el('span', '', label)); r.append(name, el('b', '', value)); stats.append(r); if (note) stats.append(el('div', 'buff', note));
  };
  /* every attribute's side effect, from every point (ATTRIBUTE_EFFECTS) */
  for (const a of ATTRIBUTES) row(STAT_LABELS[a] + (a === h.attribute ? ' (main)' : ''), f(s[a]), ATTRIBUTE_EFFECTS[a].map(fx => '+' + f(s[a] * fx.per * (fx.stat === 'critDamage' ? 100 : 100)) + '% ' + fx.label).join(', '), a === h.attribute ? 'main' : '');
  row('Damage (' + DAMAGE_LABEL[h.damageType] + ')', f(s.damage * (1 - s.spread)) + '–' + f(s.damage * (1 + s.spread)), '+' + f(attributeDamage(h, s) * 100) + '% from ' + STAT_LABELS[h.attribute] + (worn ? ' · gear included' : ''));
  row('Range', f(s.range));
  if (s.cooldown) row(h.rate === 'castSpeed' ? 'Casts per second' : 'Attacks per second', f((s[h.rate || 'speed'] || 1) / s.cooldown));
  if (s.critChance > 0) row('Crit chance', f(s.critChance * 100) + '% (×' + f(s.critDamage) + ' damage)');
  row('Energy per attack', f(s.energyPerAttack) + ' / ' + f(s.energyMax));
  const u = ULTIMATES[h.ultimate];
  if (u) { stats.append(el('h3', '', 'Ultimate')); stats.append(el('p', 'hdesc', u.name + ': ' + ultDesc(u, s))); }
  box.append(gear, pic, stats);
}

/* Evolutions tab: the base hero on top, then each evolution step with its forms side by side. */
function renderEvolutions(box, h) {
  const tree = el('div', 'evotree'), root = el('div', 'evonode root'), u = ULTIMATES[h.ultimate];
  root.style.setProperty('--hc', h.color);
  root.append(el('b', '', h.name), el('small', 'muted', 'Level 1 · ' + DAMAGE_LABEL[h.damageType] + ' damage'), el('p', '', h.short));
  if (u) root.append(el('small', '', 'Ultimate: ' + u.name));
  root.append(spriteImg(heroPortrait(h.id), 'pix evoart'));   /* last in the DOM; CSS shows it first */
  tree.append(root);
  for (const step of h.evolutions) {
    tree.append(el('div', 'evolink', 'Level ' + step.level + ' · ' + step.cost + ' gold · choose one now (a path) or in the match'));
    const row = el('div', 'evorow');
    for (const c of step.choices) {
      const d = evolvedDef(h, c), cu = ULTIMATES[d.ultimate], n = el('div', 'evonode');
      n.style.setProperty('--hc', d.color);
      const nm = el('b', '', c.name); nm.style.color = d.color;
      n.append(nm, el('small', 'muted', DAMAGE_LABEL[d.damageType] + ' damage · +25% to all its stats' + (d.attribute !== h.attribute ? ' · becomes a ' + STAT_LABELS[d.attribute].toLowerCase() + ' hero' : '')), el('p', '', c.short));
      if (cu) n.append(el('small', '', 'Ultimate: ' + cu.name + ': ' + ultDesc(cu, heroStats(d, []))));
      if (PREVIEWS[c.id]) n.append(el('small', 'preview', 'Before level 10: ' + PREVIEWS[c.id].desc));
      const chosen = (state.profile.paths || {})[h.id] === c.id, pb = el('button', 'pathbtn', chosen ? 'Chosen path ✓ (click to clear)' : 'Choose this path');
      n.classList.toggle('chosen', chosen);
      pb.onclick = () => setPath(h.id, chosen ? null : c.id);
      n.append(pb, spriteImg('hero_' + c.id, 'pix evoart'));
      row.append(n);
    }
    tree.append(row);
  }
  box.append(tree);
}

function render() {
  $('hrList').hidden = !!hero; $('hrPage').hidden = !hero;
  $('hrTitle').textContent = hero ? hero.name : 'Heroes';
  if (!hero) { renderList(); return; }
  for (const b of $('hrTabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  const box = $('hrBody'); box.textContent = ''; box.className = 'hbody ' + tab;
  box.style.setProperty('--hc', hero.color);
  if (tab === 'info') renderInfo(box, hero); else renderEvolutions(box, hero);
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('hrBack').onclick = () => { openSlot = null; if (back) bus.emit('nav', back); else if (hero) { hero = null; render(); } else bus.emit('nav', { to: 'menu' }); };
      for (const b of $('hrTabs').children) b.onclick = () => { tab = b.dataset.tab; openSlot = null; render(); };
      bound = true;
    }
    hero = params.hero ? HEROES.find(h => h.id === params.hero) || null : null; tab = 'info'; back = params.back || null; openSlot = null;
    saved = copy(equipment()); say('');
    render();
    if (!state.items) { say('Loading your items…'); const err = await ensureItems(); say(err, !!err); saved = copy(equipment()); render(); }
  },
  unmount() { if (timer) flush(); }
};
