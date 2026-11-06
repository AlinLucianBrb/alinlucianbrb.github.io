/* Shared by the Heroes, Inventory, level and Play screens: the player's items, the gear each hero wears, and saving the loadout
   (lineup + equipment) to the server. The lineup is chosen after picking a level; gear on each hero's page.
   Equipment is { heroId: { slot: itemId } }; an item row is { id, item_type, rarity, bonuses }. */
import { state } from '../core/state.js';
import { getItems, saveLoadout } from '../services/api.js';
import { HEROES, LINEUP_SIZE } from '../content/data.js';
import { ITEMS, SLOT_LABEL, asItem, itemName, itemColor, itemLines } from '../content/items.js';
import { spriteImg } from '../game/sprites.js';

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const cap = s => s[0].toUpperCase() + s.slice(1);

export const items = () => state.items || [];
export const itemById = id => items().find(i => i.id === id) || null;
export const typeOf = id => (itemById(id) || {}).item_type;
export const slotOf = row => (ITEMS[row.item_type] || {}).slot;

/* The equipment, always in the { heroId: { slot: itemId } } shape (an older { heroId: itemId } profile becomes a trinket). */
export function equipment() {
  const eq = state.profile.equipment || (state.profile.equipment = {});
  for (const h in eq) if (typeof eq[h] === 'string') eq[h] = { trinket: eq[h] };
  return eq;
}
export const gearOf = heroId => equipment()[heroId] || {};
export function setGear(heroId, slot, itemId) {
  const eq = equipment(), g = { ...(eq[heroId] || {}) };
  if (itemId) g[slot] = itemId; else delete g[slot];
  if (Object.keys(g).length) eq[heroId] = g; else delete eq[heroId];
}
/* Who wears an item: { hero, slot }, or null. */
export function wornBy(id) {
  const eq = equipment();
  for (const h in eq) for (const s in eq[h]) if (eq[h][s] === id) return { hero: h, slot: s };
  return null;
}
/* Unworn items that fit a slot, best first (rarer, then more bonuses). */
export const freeFor = slot => items().filter(i => slotOf(i) === slot && !wornBy(i.id))
  .sort((a, b) => (b.rarity | 0) - (a.rarity | 0) || (b.bonuses || []).length - (a.bonuses || []).length);
/* What each hero wears, as the game wants it: { heroId: [{ type, rarity, bonuses }] }. */
export function wornItems() {
  const out = {}, eq = equipment();
  for (const h in eq) {
    const list = Object.values(eq[h]).map(itemById).filter(Boolean).map(asItem);
    if (list.length) out[h] = list;
  }
  return out;
}
export const gearCount = heroId => Object.values(gearOf(heroId)).filter(itemById).length;

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
  if (state.items) { const eq = equipment(); for (const h in eq) for (const s in eq[h]) if (!itemById(eq[h][s])) setGear(h, s, null); }
  return error ? 'Could not load your items.' : '';
}

/* Saves the lineup and equipment. Returns { error } (error is '' on success). */
export async function saveNow(lineup = currentLineup(), equip = equipment()) {
  const { profile, error } = await saveLoadout([...lineup], JSON.parse(JSON.stringify(equip)));
  if (error || !profile) return { error: error || 'unknown error' };
  state.profile.lineup = profile.lineup || [...lineup]; state.profile.equipment = profile.equipment || JSON.parse(JSON.stringify(equip));
  return { error: '' };
}
export const sqlHint = e => (/function|schema|column/i.test(e || '') ? ' (did you run the latest SQL update?)' : '');

/* An item's icon, framed in its rarity colour: the pixel-art picture for its type and rarity (assets/item_<type>_<rarity>.png),
   or, for an unknown type or while the picture cannot load, the type's initials on its colour. */
export function itemIcon(row) {
  const known = ITEMS[row.item_type], t = known || { name: row.item_type, color: '#9db3a3' };
  const i = el('span', 'itemicon', t.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  i.style.setProperty('--ic', t.color); i.style.setProperty('--rc', itemColor(row));
  if (known) {
    const img = spriteImg('item_' + row.item_type + '_' + asItem(row).rarity);
    img.onerror = () => { img.remove(); i.classList.remove('art'); };
    i.classList.add('art'); i.append(img);
  }
  return i;
}
/* Tooltip for an item: name in its rarity colour, slot, bonuses, and who wears it. */
export function itemTip(row) {
  const who = wornBy(row.id), hero = who && HEROES.find(h => h.id === who.hero);
  const t = ITEMS[row.item_type], lines = [{ text: SLOT_LABEL[t ? t.slot : ''] || 'Unknown slot', color: '#9db3a3' }, ...itemLines(row)];
  if (!itemLines(row).length) lines.push({ text: 'No bonuses', color: '#9db3a3' });
  lines.push(who ? { text: 'Equipped on the ' + (hero ? hero.name : who.hero), color: '#8be28b' } : { text: 'Not equipped', color: '#9db3a3' });
  return { title: itemName(row), color: itemColor(row), lines };
}
