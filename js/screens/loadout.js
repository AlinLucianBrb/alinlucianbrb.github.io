/* Shared by the Heroes, Inventory, level and Play screens: the player's items, the gear each hero wears, and saving the loadout
   (lineup + equipment) to the server. The lineup is chosen after picking a level; gear on each hero's page.
   Equipment is { heroId: { slot: itemId } }; an item row is { id, item_type, rarity, bonuses }. */
import { state } from '../core/state.js';
import { getItems, getGems, saveLoadout } from '../services/api.js';
import { SOCKETS } from '../content/gems.js';
import { HEROES, LINEUP_SIZE, RARITIES } from '../content/data.js';
import { bindTip } from '../core/tooltip.js';
import { isUnlocked, inMatch } from '../content/unlocks.js';
import { ITEMS, SLOT_LABEL, AFFINITY_LABEL, asItem, itemName, itemColor, itemLines, itemBonusLines } from '../content/items.js';
import { spriteImg } from '../game/sprites.js';

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const cap = s => s[0].toUpperCase() + s.slice(1);

export const items = () => state.items || [];
export const itemById = id => items().find(i => i.id === id) || null;
/* The player's gems (state.gems: rows { id, gem_type, stat, rarity, ilvl, item, socket }), and the ones in an item's sockets,
   in socket order (null: empty). */
export const gems = () => state.gems || [];
export function gemsIn(itemId) {
  const out = Array(SOCKETS).fill(null);
  if (itemId) for (const g of gems()) if (g.item === itemId && g.socket >= 0 && g.socket < SOCKETS) out[g.socket] = g;
  return out;
}
export const withGems = row => (row && row.id ? { ...row, gems: gemsIn(row.id) } : row);
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
    const list = Object.values(eq[h]).map(itemById).filter(Boolean).map(r => asItem(withGems(r)));
    if (list.length) out[h] = list;
  }
  return out;
}
export const gearCount = heroId => Object.values(gearOf(heroId)).filter(itemById).length;

/* The evolution paths the player brings into a match: none until they are unlocked (js/content/unlocks.js); paths saved
   before that are kept for later. */
/* Paths: chosen on the Heroes screen once Act 2 is reached; used in a match only on a level of Act 2 or later (stage given). */
export const pathsUnlocked = (stage = null) => (stage === null ? isUnlocked('paths', state.profile.levels_cleared) : inMatch('paths', state.profile.levels_cleared, stage));
export const activePaths = (stage = null) => (pathsUnlocked(stage) ? state.profile.paths || {} : {});

/* A clean lineup from the profile: known heroes, no repeats, at most LINEUP_SIZE, never empty. */
export function currentLineup() {
  const l = [...new Set((state.profile.lineup || []).filter(id => HEROES.some(h => h.id === id)))].slice(0, LINEUP_SIZE);
  return l.length ? l : HEROES.slice(0, LINEUP_SIZE).map(h => h.id);
}

/* Loads the player's items once (state.items is reset when a match drops new ones). Returns an error message or ''. */
export async function ensureItems() {
  if (!state.gems) { const g = await getGems().catch(() => ({ gems: [] })); state.gems = g.error ? [] : g.gems; }   /* (no gems before the SQL update) */
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
  const known = ITEMS[row.item_type], t = known || { name: row.item_type, color: '#ab9f8a' };
  const i = el('span', 'itemicon', t.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  i.style.setProperty('--ic', t.color); i.style.setProperty('--rc', itemColor(row));
  i.setAttribute('data-rar', 'CURE'[asItem(row).rarity] || '');   /* the rarity letter (Settings) */
  if (known) {
    const img = spriteImg('item_' + row.item_type + '_' + asItem(row).rarity);
    img.onerror = () => { img.remove(); i.classList.remove('art'); };
    i.classList.add('art'); i.append(img);
  }
  return i;
}
/* Tooltip for an item: name in its rarity colour, slot, bonuses (each in its rank's colour, with its rank), and who wears it. */
export function itemTip(row) {
  const who = wornBy(row.id), hero = who && HEROES.find(h => h.id === who.hero);
  const t = ITEMS[row.item_type], bl = itemBonusLines(withGems(row)), aff = t && t.affinity;
  const lines = [{ text: (SLOT_LABEL[t ? t.slot : ''] || 'Unknown slot') + (aff ? ' · ' + AFFINITY_LABEL[aff] + ' item (leans toward ' + AFFINITY_LABEL[aff].toLowerCase() + ' bonuses)' : ''), color: '#ab9f8a' }, ...bl.map(l => ({ text: l.text, color: l.color }))];
  if (!bl.length) lines.push({ text: 'No bonuses', color: '#ab9f8a' });
  lines.push(who ? { text: 'Equipped on the ' + (hero ? hero.name : who.hero), color: '#8be28b' } : { text: 'Not equipped', color: '#ab9f8a' });
  return { title: itemName(row), color: itemColor(row), lines };
}

/* The items a match dropped (the result screen), as they look in the inventory: hover one for its name and bonuses. The
   best ones (Epic) come first and big, with their name and bonuses written out. */
export function lootRow(drops, stones = 0) {
  const row = el('div', 'loot'), best = RARITIES.length - 1, big = drops.filter(d => (asItem(d).rarity | 0) >= best);
  for (const d of big) {
    const card = el('div', 'bigdrop'), cell = el('div', 'invcell full'), words = el('div', 'bdw'), name = el('b', '', itemName(d));
    cell.append(itemIcon(d)); name.style.color = itemColor(d);
    words.append(el('small', 'bdtag', RARITIES[asItem(d).rarity | 0].name + ' item!'), name);
    for (const l of itemBonusLines(d)) { const t = el('small', '', l.text); t.style.color = l.color; words.append(t); }
    card.append(cell, words); row.append(card);
  }
  for (const d of drops.filter(d => !big.includes(d))) {
    const cell = el('div', 'invcell full'); cell.append(itemIcon(d)); cell.tabIndex = 0; cell.setAttribute('aria-label', itemName(d));
    bindTip(cell, () => itemTip(d)); row.append(cell);
  }
  if (stones > 0) {   /* Rough Stone, for crafting gems (js/content/gems.js) */
    const cell = el('div', 'invcell full stonecell'); cell.append(spriteImg('icon_stone', 'pix maticon'), el('b', 'stonecount', '×' + stones));
    cell.tabIndex = 0; cell.setAttribute('aria-label', stones + ' Rough Stone');
    bindTip(cell, () => ({ title: stones + ' Rough Stone', color: '#c9b9a0', lines: ['For crafting gems (Inventory, Gems tab).'] })); row.append(cell);
  }
  return row;
}
