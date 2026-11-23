/* Inventory screen, in two tabs. Items: every item the player owns, as an icon on a grid. Hovering an item shows what it does
   and who wears it. Clicking one selects it, and the bar under the grid can sell it for account gold or (from act 2) disenchant
   it into materials; with nothing selected the bar can disenchant every unworn item of a rarity. Each asks for a second click;
   worn items have to be taken off first. Crafting: crafting.js. Equipping happens on each hero's page (Heroes screen).
   Above the grid: sort and filter (by slot, rarity), and pages of PAGE items. Items that came since the last visit to this
   screen are marked new (the newest date seen is kept on this browser, per account). */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { sellItem, disenchantItems } from '../services/api.js';
import { ITEMS, SLOTS, SLOT_LABEL, itemName, itemColor, sellPrice, asItem } from '../content/items.js';
import { DROPS } from '../content/rules.js';
import { RARITIES } from '../content/data.js';
import { MATERIALS, CRAFT } from '../content/crafting.js';
import { isUnlocked, UNLOCKS } from '../content/unlocks.js';
import { el, items, wornBy, ensureItems, itemIcon, itemTip, sqlHint } from './loadout.js';
import { renderCrafting, resetCrafting } from './crafting.js';

const $ = id => document.getElementById(id);
export const MAX_ITEMS = DROPS.maxItems;   /* the server keeps at most this many (finish_run) */
const COLS = 8, ROWS = 5;
export const PAGE = COLS * ROWS;
let bound = false, tab = 'items', picked = null, confirm = '', busy = false;   /* confirm: the button waiting for its second click */
let sort = 'best', slot = 'all', rarity = 'all', page = 0, seenBefore = '';   /* the list's settings, kept while the page is open */

/* Ways to sort: a score per item, highest first (ties: newest first). */
const SORTS = {
  best: ['Best first', i => (wornBy(i.id) ? 1e6 : 0) + (asItem(i).rarity | 0) * 1e4 + (i.bonuses || []).length * 100 + (i.ilvl || 0)],
  newest: ['Newest first', () => 0],
  level: ['Item level', i => (i.ilvl || 0) * 10 + (asItem(i).rarity | 0)],
  rarity: ['Rarity', i => (asItem(i).rarity | 0) * 1e4 + (i.ilvl || 0)],
  slot: ['Slot', i => (SLOTS.length - SLOTS.indexOf((ITEMS[i.item_type] || {}).slot)) * 1e4 + (asItem(i).rarity | 0) * 100 + (i.ilvl || 0)]
};
/* The items the grid shows, filtered and sorted. */
export function shownItems(list, how = { sort, slot, rarity }) {
  const keep = list.filter(i => (how.slot === 'all' || (ITEMS[i.item_type] || {}).slot === how.slot) && (how.rarity === 'all' || asItem(i).rarity === +how.rarity));
  const score = SORTS[how.sort][1], date = i => i.created_at || '';
  return keep.sort((a, b) => score(b) - score(a) || (date(b) > date(a) ? 1 : date(b) < date(a) ? -1 : 0));
}
/* New items: newer than the newest one seen on the last visit. */
const seenKey = () => 'tbd.invSeen.' + (state.profile && state.profile.id || '');
const readSeen = () => { try { return globalThis.localStorage && localStorage.getItem(seenKey()) || ''; } catch (e) { return ''; } };
function markSeen() {
  const newest = items().reduce((a, i) => (i.created_at && i.created_at > a ? i.created_at : a), '');
  try { if (newest && globalThis.localStorage) localStorage.setItem(seenKey(), newest); } catch (e) { /* not kept */ }
}
export const isNew = (it, seen = seenBefore) => !!seen && !!it.created_at && it.created_at > seen;

const say = t => { $('invMsg').textContent = t; };
const open = () => isUnlocked('crafting', state.profile.levels_cleared);
const unworn = r => items().filter(i => asItem(i).rarity === r && !wornBy(i.id));

function render() {
  $('invItems').hidden = tab !== 'items'; $('invCraft').hidden = tab !== 'craft';
  for (const b of $('invTabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  $('invCount').textContent = items().length + ' / ' + MAX_ITEMS;
  if (tab === 'craft') { renderCrafting($('invCraft'), { open: open(), max: MAX_ITEMS, say, changed: render }); return; }
  renderTools();
  const list = shownItems(items()), grid = $('invGrid'), pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  grid.textContent = '';
  for (let i = 0; i < PAGE; i++) {   /* always a full page, so the grid keeps its size */
    const it = list[page * PAGE + i], cell = el('div', 'invcell' + (it ? ' full' : ''));
    if (it) {
      cell.append(itemIcon(it)); cell.tabIndex = 0;
      cell.setAttribute('aria-label', itemName(it) + (wornBy(it.id) ? ', worn' : '') + (isNew(it) ? ', new' : ''));
      if (wornBy(it.id)) { cell.classList.add('worn'); cell.append(el('span', 'wornmark', '●')); }
      if (isNew(it)) cell.append(el('span', 'newmark', 'New'));
      if (picked === it.id) cell.classList.add('picked');
      bindTip(cell, () => {
        const t = itemTip(it), r = asItem(it).rarity;
        t.lines.push({ text: 'Sells for ' + sellPrice(it) + ' gold (click to select)', color: '#f2b84b' });
        if (open()) t.lines.push({ text: 'Disenchants into ' + CRAFT.yields + ' ' + MATERIALS[r].name, color: RARITIES[r].color });
        return t;
      });
      cell.onclick = () => { picked = picked === it.id ? null : it.id; confirm = ''; render(); };
      cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); cell.onclick(); } };
    }
    grid.append(cell);
  }
  $('invEmpty').hidden = items().length > 0;
  $('invEmpty').textContent = items().length ? '' : 'No items yet. Every win drops one, every boss you defeat drops one, and losses can too.';
  renderPager(list.length, pages);
  renderBar();
}

/* Sort and filters: three drop-downs over the grid, and how many of the items they show. */
function renderTools() {
  const box = $('invTools'); box.textContent = '';
  const pick = (label, value, options, set) => {
    const l = el('label', 'invpick'), s = el('select');
    s.setAttribute('aria-label', label);
    for (const [v, t] of options) { const o = el('option', '', t); o.value = v; s.append(o); }
    s.value = value; s.onchange = () => { set(s.value); page = 0; picked = null; confirm = ''; render(); };
    l.append(el('span', 'muted', label), s); box.append(l);
  };
  pick('Sort', sort, Object.entries(SORTS).map(([k, [t]]) => [k, t]), v => { sort = v; });
  pick('Slot', slot, [['all', 'All slots'], ...SLOTS.map(s => [s, SLOT_LABEL[s]])], v => { slot = v; });
  pick('Rarity', rarity, [['all', 'All rarities'], ...RARITIES.map((r, i) => [String(i), r.name])], v => { rarity = v; });
}
/* Pages: shown when there is more than one. */
function renderPager(count, pages) {
  const box = $('invPager'); box.textContent = '';
  const filtered = count !== items().length;
  if (filtered) box.append(el('span', 'muted', count + ' of ' + items().length));
  if (pages < 2) return;
  const prev = el('button', '', '‹'), next = el('button', '', '›');
  prev.setAttribute('aria-label', 'Previous page'); next.setAttribute('aria-label', 'Next page');
  prev.disabled = page === 0; next.disabled = page >= pages - 1;
  prev.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); };
  box.append(prev, el('b', '', 'Page ' + (page + 1) + ' / ' + pages), next);
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
    tab = (params && params.tab) || 'items'; picked = null; confirm = ''; page = 0; resetCrafting(); say('');
    seenBefore = readSeen();
    render();
    const err = await ensureItems();
    say(err);
    if (!seenBefore) markSeen();   /* the first visit: nothing is new yet */
    render();
  },
  unmount() { markSeen(); }   /* what was shown is no longer new next time */
};
