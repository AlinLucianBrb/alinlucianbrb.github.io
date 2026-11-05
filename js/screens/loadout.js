/* Shared by the Heroes, Inventory and level screens: the player's items, what each hero wears, and saving the loadout
   (lineup + equipment) to the server. The lineup is chosen after picking a level; equipment on the hero pages. */
import { state } from '../core/state.js';
import { getItems, saveLoadout } from '../services/api.js';
import { HEROES, LINEUP_SIZE } from '../content/data.js';
import { ITEMS } from '../content/items.js';

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const cap = s => s[0].toUpperCase() + s.slice(1);

export const items = () => state.items || [];
export const typeOf = id => (items().find(i => i.id === id) || {}).item_type;
export const equipment = () => state.profile.equipment || (state.profile.equipment = {});
export const wornBy = id => Object.keys(equipment()).find(h => equipment()[h] === id) || null;
/* Unworn items of a type, so equipping always picks one that is free. */
export const freeOfType = type => items().filter(i => i.item_type === type && !wornBy(i.id));
/* Item type ids worn by each hero: { heroId: itemType }, the shape createWorld and itemMods take. */
export const wornTypes = () => { const out = {}; for (const h in equipment()) { const t = typeOf(equipment()[h]); if (t) out[h] = t; } return out; };

/* A clean lineup from the profile: known heroes, no repeats, at most LINEUP_SIZE, never empty. */
export function currentLineup() {
  const l = [...new Set((state.profile.lineup || []).filter(id => HEROES.some(h => h.id === id)))].slice(0, LINEUP_SIZE);
  return l.length ? l : HEROES.slice(0, LINEUP_SIZE).map(h => h.id);
}

/* Loads the player's items once (state.items is reset when a match drops new ones). Returns an error message or ''. */
export async function ensureItems() {
  if (state.items) return '';
  const { items: list, error } = await getItems();
  state.items = error ? null : list;
  /* Drop equipment that points at items the player no longer has. */
  if (state.items) for (const h in equipment()) if (!typeOf(equipment()[h])) delete equipment()[h];
  return error ? 'Could not load your items.' : '';
}

/* Saves the lineup and equipment. Returns { error } (error is '' on success). */
export async function saveNow(lineup = currentLineup(), equip = equipment()) {
  const { profile, error } = await saveLoadout([...lineup], { ...equip });
  if (error || !profile) return { error: error || 'unknown error' };
  state.profile.lineup = profile.lineup || [...lineup]; state.profile.equipment = profile.equipment || { ...equip };
  return { error: '' };
}
export const sqlHint = e => (/function|schema|column/i.test(e || '') ? ' (did you run the latest SQL update?)' : '');

/* A placeholder item icon until there is art: the item's initials on its colour. */
export function itemIcon(type) {
  const it = ITEMS[type] || { name: type, color: '#9db3a3' }, i = el('span', 'itemicon', it.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  i.style.setProperty('--ic', it.color);
  return i;
}
