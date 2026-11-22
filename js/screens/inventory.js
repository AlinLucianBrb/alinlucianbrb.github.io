/* Inventory screen, in two tabs. Items: every item the player owns, as an icon on a grid. Hovering an item shows what it does
   and who wears it. Clicking one selects it, and the bar under the grid can sell it for account gold or (from act 2) disenchant
   it into materials; with nothing selected the bar can disenchant every unworn item of a rarity. Each asks for a second click;
   worn items have to be taken off first. Crafting: crafting.js. Equipping happens on each hero's page (Heroes screen). */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { sellItem, disenchantItems } from '../services/api.js';
import { itemName, itemColor, sellPrice, asItem } from '../content/items.js';
import { DROPS } from '../content/rules.js';
import { RARITIES } from '../content/data.js';
import { MATERIALS, CRAFT } from '../content/crafting.js';
import { isUnlocked, UNLOCKS } from '../content/unlocks.js';
import { el, items, wornBy, ensureItems, itemIcon, itemTip, sqlHint } from './loadout.js';
import { renderCrafting, resetCrafting } from './crafting.js';

const $ = id => document.getElementById(id);
export const MAX_ITEMS = DROPS.maxItems;   /* the server keeps at most this many (finish_run) */
const COLS = 8, MIN_ROWS = 5;
let bound = false, tab = 'items', picked = null, confirm = '', busy = false;   /* confirm: the button waiting for its second click */

const say = t => { $('invMsg').textContent = t; };
const open = () => isUnlocked('crafting', state.profile.levels_cleared);
const unworn = r => items().filter(i => asItem(i).rarity === r && !wornBy(i.id));

function render() {
  $('invItems').hidden = tab !== 'items'; $('invCraft').hidden = tab !== 'craft';
  for (const b of $('invTabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  $('invCount').textContent = items().length + ' / ' + MAX_ITEMS;
  if (tab === 'craft') { renderCrafting($('invCraft'), { open: open(), max: MAX_ITEMS, say, changed: render }); return; }
  /* Worn items first, then rarer and with more bonuses first. */
  const score = i => (wornBy(i.id) ? 100 : 0) + (i.rarity | 0) * 10 + (i.bonuses || []).length;
  const list = [...items()].sort((a, b) => score(b) - score(a)), grid = $('invGrid');
  grid.textContent = '';
  const cells = Math.max(MIN_ROWS * COLS, Math.ceil(list.length / COLS) * COLS);
  for (let i = 0; i < cells; i++) {
    const it = list[i], cell = el('div', 'invcell' + (it ? ' full' : ''));
    if (it) {
      cell.append(itemIcon(it)); cell.tabIndex = 0;
      if (wornBy(it.id)) { cell.classList.add('worn'); cell.append(el('span', 'wornmark', '●')); }
      if (picked === it.id) cell.classList.add('picked');
      bindTip(cell, () => {
        const t = itemTip(it), r = asItem(it).rarity;
        t.lines.push({ text: 'Sells for ' + sellPrice(it) + ' gold (click to select)', color: '#f2b84b' });
        if (open()) t.lines.push({ text: 'Disenchants into ' + CRAFT.yields + ' ' + MATERIALS[r].name, color: RARITIES[r].color });
        return t;
      });
      cell.onclick = () => { picked = picked === it.id ? null : it.id; confirm = ''; render(); };
    }
    grid.append(cell);
  }
  $('invEmpty').hidden = list.length > 0;
  renderBar();
}

/* A button that asks for a second click: key names it, so only one waits at a time. */
function twice(key, cls, text, again, run, disabled) {
  const b = el('button', 'sellbtn ' + cls, confirm === key ? again : text);
  b.disabled = !!disabled || busy; b.classList.toggle('confirm', confirm === key);
  b.onclick = () => { if (confirm !== key) { confirm = key; renderBar(); } else run(); };
  return b;
}
/* The bar under the grid: what can be done with the selected item, or with every unworn item of a rarity. */
function renderBar() {
  const bar = $('invSell'), it = picked && items().find(i => i.id === picked);
  bar.textContent = '';
  if (!it) {
    picked = null;
    if (!open()) { bar.append(el('span', 'muted', 'Click an item to sell it for gold. Disenchanting unlocks in Act ' + UNLOCKS.crafting.act + '.')); return; }
    bar.append(el('span', 'muted', 'Disenchant all unworn:'));
    RARITIES.forEach((r, i) => {
      const list = unworn(i), b = twice('all' + i, 'disall', r.name + ' (' + list.length + ')', 'Click again: ' + list.length + ' for ' + list.length * CRAFT.yields + ' ' + MATERIALS[i].name, () => disenchant(list, i), !list.length);
      b.style.setProperty?.('--rc', r.color); bar.append(b);
    });
    return;
  }
  const name = el('b', '', itemName(it)), worn = wornBy(it.id), r = asItem(it).rarity;
  name.style.color = itemColor(it);
  bar.append(name);
  if (worn) { bar.append(twice('worn', '', 'Worn: take it off first', '', () => {}, true)); return; }
  bar.append(twice('sell', '', 'Sell for ' + sellPrice(it) + ' gold', 'Click again to sell for ' + sellPrice(it) + ' gold', () => sell(it)));
  if (open()) bar.append(twice('dis', '', 'Disenchant for ' + CRAFT.yields + ' ' + MATERIALS[r].name, 'Click again to disenchant', () => disenchant([it], r)));
}
async function sell(it) {
  busy = true; renderBar();
  const { profile, error } = await sellItem(it.id);
  busy = false; confirm = '';
  if (error || !profile) { say('Could not sell: ' + (error || 'no connection') + sqlHint(error)); renderBar(); return; }
  state.items = items().filter(i => i.id !== it.id);
  state.profile = { ...state.profile, ...profile };
  picked = null;
  say('Sold ' + itemName(it) + ' for ' + sellPrice(it) + ' gold. Gold: ' + profile.gold);
  render();
}
async function disenchant(list, rarity) {
  busy = true; renderBar();
  const ids = list.map(i => i.id), { profile, error } = await disenchantItems(ids);
  busy = false; confirm = '';
  if (error || !profile) { say('Could not disenchant: ' + (error || 'no connection') + sqlHint(error)); renderBar(); return; }
  state.items = items().filter(i => !ids.includes(i.id));
  state.profile = { ...state.profile, ...profile };
  picked = null;
  say('Disenchanted ' + (list.length > 1 ? list.length + ' items' : itemName(list[0])) + ' into ' + list.length * CRAFT.yields + ' ' + MATERIALS[rarity].name + '.');
  render();
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('invBack').onclick = () => bus.emit('nav', { to: 'menu' });
      for (const b of $('invTabs').children) b.onclick = () => { tab = b.dataset.tab; picked = null; confirm = ''; say(''); render(); };
      bound = true;
    }
    tab = (params && params.tab) || 'items'; picked = null; confirm = ''; resetCrafting(); say('');
    render();
    const err = await ensureItems();
    say(err);
    render();
  }
};
