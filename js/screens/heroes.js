/* Heroes screen: every playable hero as a card; click one to open its page, with two tabs.
   - Information: gear slots on the left, the hero's picture in the middle (a placeholder until there is art), stats on the right.
   - Evolutions: the hero's evolution tree, from the base hero to each form it can become.
   Equipment changes are saved automatically. (The lineup is chosen after picking a level.) */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { HEROES, STAT_LABELS, ATTRIBUTES, evolvedDef } from '../content/data.js';
import { SLOTS, SLOT_LABEL, itemMods, itemName, itemColor, itemLines } from '../content/items.js';
import { DAMAGE_LABEL } from '../content/combat.js';
import { ULTIMATES } from '../engine/ultimates.js';
import { heroStats, attributeDamage } from '../engine/stats.js';
import { el, cap, items, itemById, equipment, gearOf, setGear, freeFor, wornItems, gearCount, ensureItems, saveNow, sqlHint, itemIcon, itemTip } from './loadout.js';

const $ = id => document.getElementById(id);
const f = x => +x.toFixed(2);
let bound = false, hero = null, tab = 'info', saved = {}, timer = 0;

const say = (t, bad) => { $('hrMsg').textContent = t || ''; $('hrMsg').classList.toggle('warn', !!bad); };
const copy = x => JSON.parse(JSON.stringify(x));
const SHOW_FREE = 8;   /* free items shown per empty slot; the rest are counted */

function changed() {
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 600);
  render();
}
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
    const n = gearCount(h.id);
    card.append(head, el('p', 'hdesc', h.short), el('small', 'muted', 'Gear ' + n + ' / ' + SLOTS.length));
    card.onclick = () => { hero = h; tab = 'info'; render(); };
    grid.append(card);
  }
}

/* Information tab: gear | picture | stats. */
function renderInfo(box, h) {
  const gear = el('div', 'hgear'), pic = el('div', 'hpic'), stats = el('div', 'hstatbox');
  gear.append(el('h3', '', 'Gear'));
  for (const slot of SLOTS) {
    const box = el('div', 'hslot'), row = itemById(gearOf(h.id)[slot]);
    box.append(el('small', 'muted', SLOT_LABEL[slot]));
    if (row) {
      const line = el('div', 'slotitem'), off = el('button', 'linkbtn', 'Remove'), icon = itemIcon(row), name = el('span', 'itemname', itemName(row));
      name.style.color = itemColor(row); bindTip(icon, () => itemTip(row)); bindTip(name, () => itemTip(row));
      off.onclick = () => { setGear(h.id, slot, null); changed(); };
      line.append(icon, name, off); box.append(line);
      for (const t of itemLines(row)) box.append(el('div', 'buff', t));
    } else {
      const free = freeFor(slot);
      if (!free.length) box.append(el('span', 'muted', items().length ? 'Empty: no free item for this slot' : 'Empty: items drop at the end of matches'));
      else {
        const pick = el('div', 'slotpick');
        for (const it of free.slice(0, SHOW_FREE)) {
          const b = el('button', 'iconbtn'); b.append(itemIcon(it)); b.setAttribute('aria-label', 'Equip ' + itemName(it));
          bindTip(b, () => { const t = itemTip(it); t.lines.push({ text: 'Click to equip', color: '#f2b84b' }); return t; });
          b.onclick = () => { setGear(h.id, slot, it.id); changed(); };
          pick.append(b);
        }
        if (free.length > SHOW_FREE) pick.append(el('small', 'muted', '+' + (free.length - SHOW_FREE) + ' more'));
        box.append(el('span', 'muted', 'Empty: click an item to equip it'), pick);
      }
    }
    gear.append(box);
  }
  /* The picture: a placeholder in the hero's colour until there is art. */
  const art = el('div', 'hart'); art.style.setProperty('--hc', h.color); art.append(el('span', '', h.name[0]));
  pic.append(art, el('small', 'muted', 'Hero art coming soon'), el('p', 'hdesc', h.short));
  /* Stats, with the equipped item included. */
  const worn = wornItems()[h.id], s = heroStats(h, itemMods(worn ? { [h.id]: worn } : {}));
  stats.append(el('h3', '', 'Stats' + (worn ? ' (with gear)' : '')));
  const row = (label, value, note, cls) => { const r = el('div', 'srow' + (cls ? ' ' + cls : '')); r.append(el('span', '', label), el('b', '', value)); stats.append(r); if (note) stats.append(el('div', 'buff', note)); };
  for (const a of ATTRIBUTES) row(STAT_LABELS[a] + (a === h.attribute ? ' (main)' : ''), f(s[a]), null, a === h.attribute ? 'main' : '');
  row('Damage (' + DAMAGE_LABEL[h.damageType] + ')', f(s.damage), '+' + f(attributeDamage(h, s) * 100) + '% from ' + STAT_LABELS[h.attribute] + (worn ? ' · gear included' : ''));
  row('Range', f(s.range));
  if (s.cooldown) row('Attacks per second', f(s.speed / s.cooldown));
  if (s.arc) row('Swing arc (°)', f(s.arc));
  row('Energy per attack', f(s.energyPerAttack) + ' / ' + f(s.energyMax));
  const u = ULTIMATES[h.ultimate];
  if (u) { stats.append(el('h3', '', 'Ultimate')); stats.append(el('p', 'hdesc', u.name + ': ' + u.desc)); }
  box.append(gear, pic, stats);
}

/* Evolutions tab: the base hero on top, then each evolution step with its forms side by side. */
function renderEvolutions(box, h) {
  const tree = el('div', 'evotree'), root = el('div', 'evonode root'), u = ULTIMATES[h.ultimate];
  root.style.setProperty('--hc', h.color);
  root.append(el('b', '', h.name), el('small', 'muted', 'Level 1 · ' + DAMAGE_LABEL[h.damageType] + ' damage'), el('p', '', h.short));
  if (u) root.append(el('small', '', 'Ultimate: ' + u.name));
  tree.append(root);
  for (const step of h.evolutions) {
    tree.append(el('div', 'evolink', 'Level ' + step.level + ' · ' + step.cost + ' gold · choose one'));
    const row = el('div', 'evorow');
    for (const c of step.choices) {
      const d = evolvedDef(h, c), cu = ULTIMATES[d.ultimate], n = el('div', 'evonode');
      n.style.setProperty('--hc', d.color);
      const nm = el('b', '', c.name); nm.style.color = d.color;
      n.append(nm, el('small', 'muted', DAMAGE_LABEL[d.damageType] + ' damage · +50% damage, range and attack speed'), el('p', '', c.short));
      if (cu) n.append(el('small', '', 'Ultimate: ' + (c.ultShort || cu.name + ': ' + cu.desc)));
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
      $('hrBack').onclick = () => { if (hero) { hero = null; render(); } else bus.emit('nav', { to: 'menu' }); };
      for (const b of $('hrTabs').children) b.onclick = () => { tab = b.dataset.tab; render(); };
      bound = true;
    }
    hero = params.hero ? HEROES.find(h => h.id === params.hero) || null : null; tab = 'info';
    saved = copy(equipment()); say('');
    render();
    if (!state.items) { say('Loading your items…'); const err = await ensureItems(); say(err, !!err); saved = copy(equipment()); render(); }
  },
  unmount() { if (timer) flush(); }
};
