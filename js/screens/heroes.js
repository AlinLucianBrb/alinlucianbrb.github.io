/* Heroes screen: choose which heroes to bring into matches (the lineup) and which item each one wears. Saved automatically. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { getItems, saveLoadout } from '../services/api.js';
import { bindTip } from '../core/tooltip.js';
import { HEROES, LINEUP_SIZE } from '../content/data.js';
import { ITEMS } from '../content/items.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const cap = s => s[0].toUpperCase() + s.slice(1);
let bound = false, lineup = [], equipment = {}, saved = null, timer = 0;

const say = (t, bad) => { $('hrMsg').textContent = t || ''; $('hrMsg').classList.toggle('warn', !!bad); };
const items = () => state.items || [];
const typeOf = id => (items().find(i => i.id === id) || {}).item_type;
const isWorn = id => Object.values(equipment).includes(id);
/* Unworn items of a type, so equipping always picks one that is free. */
const freeOfType = type => items().filter(i => i.item_type === type && !isWorn(i.id));

function statLine(h) {
  const s = h.stats, parts = ['Damage ' + s.damage, 'Range ' + s.range];
  if (s.cooldown) parts.push(+(s.speed / s.cooldown).toFixed(2) + ' attacks/s');
  if (s.targets > 1) parts.push(s.targets + ' targets');
  if (s.arc) parts.push(s.arc + '° swing');
  return parts.join(' · ');
}

function changed() {
  state.profile.lineup = [...lineup]; state.profile.equipment = { ...equipment };
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 600);
  render();
}
async function flush() {
  clearTimeout(timer); timer = 0;
  const { profile, error } = await saveLoadout([...lineup], { ...equipment });
  if (error || !profile) {
    lineup = [...saved.lineup]; equipment = { ...saved.equipment };
    state.profile.lineup = [...lineup]; state.profile.equipment = { ...equipment };
    say('Could not save: ' + (error || 'unknown error') + (/function|schema|column/i.test(error || '') ? ' (did you run the latest SQL update?)' : ''), true);
    render(); return;
  }
  saved = { lineup: [...lineup], equipment: { ...equipment } };
  say('Saved');
}

function toggleLineup(id) {
  if (lineup.includes(id)) {
    if (lineup.length === 1) return say('Bring at least one hero.', true);
    lineup = lineup.filter(x => x !== id);
  } else {
    if (lineup.length >= LINEUP_SIZE) return say('You can bring up to ' + LINEUP_SIZE + ' heroes. Remove one first.', true);
    lineup = [...lineup, id];
  }
  changed();
}

function render() {
  $('hrCount').textContent = lineup.length + ' / ' + LINEUP_SIZE;
  const grid = $('hrGrid'); grid.textContent = '';
  for (const h of HEROES) {
    const inLineup = lineup.includes(h.id), card = el('div', 'hcard' + (inLineup ? ' picked' : ''));
    card.style.setProperty('--hc', h.color);
    const head = el('div', 'hhead'), title = el('b', '', h.name), arch = el('small', 'muted', cap(h.archetype));
    head.append(title, arch);
    const pick = el('button', inLineup ? 'go' : '', inLineup ? '✓ In lineup' : 'Add to lineup');
    pick.onclick = () => toggleLineup(h.id);
    const evo = h.evolutions[0];
    card.append(head, el('p', 'hdesc', h.short), el('p', 'muted hstats', statLine(h)));
    if (evo) card.append(el('p', 'muted hstats', 'Evolves at level ' + evo.level + ' into ' + evo.choices.map(c => c.name).join(', ').replace(/, ([^,]*)$/, ' or $1') + '.'));
    /* The item slot. */
    const slot = el('div', 'hslot'), worn = equipment[h.id], type = worn && typeOf(worn);
    slot.append(el('small', 'muted', 'Item slot'));
    if (type && ITEMS[type]) {
      const it = ITEMS[type], name = el('span', 'itemname', it.name), off = el('button', 'linkbtn', 'Remove');
      name.style.color = it.color; bindTip(name, () => ({ title: it.name, color: it.color, lines: [it.desc] }));
      off.onclick = () => { delete equipment[h.id]; changed(); };
      slot.append(name, off);
    } else {
      const types = Object.keys(ITEMS).filter(t => freeOfType(t).length);
      if (!types.length) slot.append(el('span', 'muted', items().length ? 'All your items are in use' : 'Empty: items drop at the end of matches'));
      else for (const t of types) {
        const b = el('button', '', 'Equip ' + ITEMS[t].name + ' (' + freeOfType(t).length + ')');
        bindTip(b, () => ({ title: ITEMS[t].name, color: ITEMS[t].color, lines: [ITEMS[t].desc] }));
        b.onclick = () => { equipment[h.id] = freeOfType(t)[0].id; changed(); };
        slot.append(b);
      }
    }
    card.append(slot, pick);
    grid.append(card);
  }
  /* Inventory summary. */
  const inv = $('hrInv'); inv.textContent = '';
  if (!items().length) { inv.append(el('span', 'muted', 'No items yet. Every win drops one, and losses can too.')); return; }
  for (const t of Object.keys(ITEMS)) {
    const all = items().filter(i => i.item_type === t);
    if (!all.length) continue;
    const used = all.filter(i => isWorn(i.id)).length, chip = el('span', 'relicchip', ITEMS[t].name + ' ×' + all.length + (used ? ' (' + used + ' equipped)' : ''));
    chip.style.color = chip.style.borderColor = ITEMS[t].color;
    bindTip(chip, () => ({ title: ITEMS[t].name, color: ITEMS[t].color, lines: [ITEMS[t].desc] }));
    inv.append(chip);
  }
}

export default {
  async mount() {
    if (!bound) { $('hrBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    lineup = [...(state.profile.lineup || [])].filter(id => HEROES.some(h => h.id === id)).slice(0, LINEUP_SIZE);
    if (!lineup.length) lineup = HEROES.slice(0, LINEUP_SIZE).map(h => h.id);
    equipment = { ...(state.profile.equipment || {}) };
    saved = { lineup: [...lineup], equipment: { ...equipment } };
    say('');
    render();
    if (!state.items) {
      say('Loading your items…');
      const { items: list, error } = await getItems();
      state.items = error ? null : list;
      say(error ? 'Could not load your items.' : '', !!error);
    }
    /* Drop equipment that points at items the player no longer has. */
    for (const h in equipment) if (state.items && !typeOf(equipment[h])) delete equipment[h];
    render();
  },
  unmount() { if (timer) flush(); }
};
