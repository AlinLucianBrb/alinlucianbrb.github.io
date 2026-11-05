/* Inventory screen: every item the player owns, as an icon on a grid (placeholder icons until there is art).
   Hovering an item shows what it does and who wears it. Equipping happens on each hero's page (Heroes screen). */
import { bus } from '../core/bus.js';
import { bindTip } from '../core/tooltip.js';
import { HEROES } from '../content/data.js';
import { ITEMS } from '../content/items.js';
import { el, cap, items, wornBy, ensureItems, itemIcon } from './loadout.js';

const $ = id => document.getElementById(id);
export const MAX_ITEMS = 200;             /* the server keeps at most this many (finish_run) */
const COLS = 8, MIN_ROWS = 5;
let bound = false;

function render() {
  const list = [...items()].sort((a, b) => (wornBy(b.id) ? 1 : 0) - (wornBy(a.id) ? 1 : 0)), grid = $('invGrid');
  grid.textContent = '';
  $('invCount').textContent = list.length + ' / ' + MAX_ITEMS;
  const cells = Math.max(MIN_ROWS * COLS, Math.ceil(list.length / COLS) * COLS);
  for (let i = 0; i < cells; i++) {
    const it = list[i], cell = el('div', 'invcell' + (it ? ' full' : ''));
    if (it) {
      const def = ITEMS[it.item_type] || { name: it.item_type, color: '#9db3a3', desc: 'Unknown item', slot: 'trinket' }, who = wornBy(it.id);
      cell.append(itemIcon(it.item_type)); cell.tabIndex = 0;
      if (who) { cell.classList.add('worn'); cell.append(el('span', 'wornmark', '●')); }
      bindTip(cell, () => ({ title: def.name, color: def.color, lines: [def.desc, { text: cap(def.slot) + ' slot', color: '#9db3a3' },
        who ? { text: 'Equipped on the ' + (HEROES.find(h => h.id === who) || { name: who }).name, color: '#8be28b' } : { text: 'Not equipped. Equip it on a hero\'s page (Heroes).', color: '#9db3a3' }] }));
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
