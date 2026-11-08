/* Inventory screen: every item the player owns, as an icon on a grid. Hovering an item shows what it does and who wears it.
   Clicking one selects it, and the bar under the grid can sell it for account gold (click Sell, then again to confirm; worn
   items have to be taken off first). Equipping happens on each hero's page (Heroes screen). */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { sellItem } from '../services/api.js';
import { itemName, itemColor, sellPrice } from '../content/items.js';
import { el, items, wornBy, ensureItems, itemIcon, itemTip, sqlHint } from './loadout.js';

const $ = id => document.getElementById(id);
export const MAX_ITEMS = 200;             /* the server keeps at most this many (finish_run) */
const COLS = 8, MIN_ROWS = 5;
let bound = false, picked = null, confirm = false, busy = false;

function render() {
  /* Worn items first, then rarer and with more bonuses first. */
  const score = i => (wornBy(i.id) ? 100 : 0) + (i.rarity | 0) * 10 + (i.bonuses || []).length;
  const list = [...items()].sort((a, b) => score(b) - score(a)), grid = $('invGrid');
  grid.textContent = '';
  $('invCount').textContent = list.length + ' / ' + MAX_ITEMS;
  const cells = Math.max(MIN_ROWS * COLS, Math.ceil(list.length / COLS) * COLS);
  for (let i = 0; i < cells; i++) {
    const it = list[i], cell = el('div', 'invcell' + (it ? ' full' : ''));
    if (it) {
      cell.append(itemIcon(it)); cell.tabIndex = 0;
      if (wornBy(it.id)) { cell.classList.add('worn'); cell.append(el('span', 'wornmark', '●')); }
      if (picked === it.id) cell.classList.add('picked');
      bindTip(cell, () => { const t = itemTip(it); t.lines.push({ text: 'Sells for ' + sellPrice(it) + ' gold (click to select)', color: '#f2b84b' }); return t; });
      cell.onclick = () => { picked = picked === it.id ? null : it.id; confirm = false; render(); };
    }
    grid.append(cell);
  }
  $('invEmpty').hidden = list.length > 0;
  renderSell();
}

/* The bar under the grid: the selected item and its Sell button. */
function renderSell() {
  const bar = $('invSell'), it = picked && items().find(i => i.id === picked);
  bar.textContent = '';
  if (!it) { picked = null; bar.append(el('span', 'muted', 'Click an item to sell it for gold.')); return; }
  const name = el('b', '', itemName(it)), worn = wornBy(it.id), btn = el('button', 'sellbtn');
  name.style.color = itemColor(it);
  btn.textContent = worn ? 'Worn: take it off first' : confirm ? 'Click again to sell for ' + sellPrice(it) + ' gold' : 'Sell for ' + sellPrice(it) + ' gold';
  btn.disabled = !!worn || busy; btn.classList.toggle('confirm', confirm);
  btn.onclick = () => { if (!confirm) { confirm = true; renderSell(); } else sell(it); };
  bar.append(name, btn);
}
async function sell(it) {
  busy = true; renderSell();
  const { profile, error } = await sellItem(it.id);
  busy = false; confirm = false;
  if (error || !profile) { $('invMsg').textContent = 'Could not sell: ' + (error || 'no connection') + sqlHint(error); renderSell(); return; }
  state.items = items().filter(i => i.id !== it.id);
  state.profile = { ...state.profile, ...profile };
  picked = null;
  $('invMsg').textContent = 'Sold ' + itemName(it) + ' for ' + sellPrice(it) + ' gold. Gold: ' + profile.gold;
  render();
}

export default {
  async mount() {
    if (!bound) { $('invBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    picked = null; confirm = false; $('invMsg').textContent = '';
    render();
    const err = await ensureItems();
    $('invMsg').textContent = err;
    render();
  }
};
