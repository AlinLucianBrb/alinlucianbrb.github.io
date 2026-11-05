/* Inventory screen: every item the player owns, as an icon on a grid (placeholder icons until there is art).
   Hovering an item shows what it does and who wears it. Equipping happens on each hero's page (Heroes screen). */
import { bus } from '../core/bus.js';
import { bindTip } from '../core/tooltip.js';
import { el, items, wornBy, ensureItems, itemIcon, itemTip } from './loadout.js';

const $ = id => document.getElementById(id);
export const MAX_ITEMS = 200;             /* the server keeps at most this many (finish_run) */
const COLS = 8, MIN_ROWS = 5;
let bound = false;

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
      bindTip(cell, () => itemTip(it));
    }
    grid.append(cell);
  }
  $('invEmpty').hidden = list.length > 0;
}

export default {
  async mount() {
    if (!bound) { $('invBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    render();
    const err = await ensureItems();
    $('invMsg').textContent = err;
    render();
  }
};
