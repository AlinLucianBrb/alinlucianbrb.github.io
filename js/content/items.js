/* Items drop at the end of a match and are equipped on heroes before the next one.
   Every hero has five gear slots (SLOTS). An item has a type (ITEMS: which slot it goes in, and any fixed bonus of its own),
   a rarity (the same four as relics) and 1 to 4 bonuses. Bonuses are relics: a Rare item with "Sharpened rounds" gives what a
   Rare Sharpened rounds relic gives. An item never has the same bonus twice.
   Items are rolled by the server (finish_run), which stores { item_type, rarity, bonuses: [relic names] }; this file only
   turns them into modifiers, names and descriptions. ROLL describes the same rules for the client (and the tests).
   To add an item type: add an entry here, then run `npm run sql` so the database knows it can drop. */
import { RELICS, RARITIES } from './data.js';

export const SLOTS = ['helm', 'body', 'legs', 'boots', 'trinket'];
export const SLOT_LABEL = { helm: 'Helm', body: 'Body armour', legs: 'Legs', boots: 'Boots', trinket: 'Trinket' };

/* Item types. mods are the type's own fixed bonus (most have none); color is the placeholder icon's colour. */
export const ITEMS = {
  helm:        { name: 'Helm',        slot: 'helm',    color: '#9fb4c7', desc: '', mods: [] },
  body_armour: { name: 'Body Armour', slot: 'body',    color: '#b9a27a', desc: '', mods: [] },
  leggings:    { name: 'Leggings',    slot: 'legs',    color: '#8fa889', desc: '', mods: [] },
  boots:       { name: 'Boots',       slot: 'boots',   color: '#a48b74', desc: '', mods: [] },
  power_charm: { name: 'Power Charm', slot: 'trinket', color: '#f2b84b', desc: '+5 damage', mods: [{ stat: 'damage', type: 'flat', value: 5 }] }
};

/* How items are rolled (the server's finish_run does the same; a test keeps them in step):
   rarity by the relic weights (Common 55, Uncommon 28, Rare 13, Epic 4; Treasure Hunter's item rarity luck multiplies each rarer
   step's weight by 1 + luck, like relic luck); a Common item has at least 1 bonus, an Uncommon 2, a Rare 3 and an Epic 4; then
   each further bonus has a 30% chance (plus Treasure Hunter's extra bonus chance), up to 4. */
export const ROLL = { maxBonuses: 4, extraChance: 0.3, guaranteed: r => r + 1 };

/* Relics that can be item bonuses: every relic with modifiers. Reinforced gate (lives when you pick it) gives starting lives instead. */
const bonusMods = (relic, m) => (relic.itemMods ? relic.itemMods(m) : relic.mods ? relic.mods(m) : null);
export const ITEM_BONUSES = RELICS.filter(r => bonusMods(r, 1)).map(r => r.name);
const relicByName = name => RELICS.find(r => r.name === name);

/* Older items (from before rarities) come as a plain type id: they count as Common with no bonuses. */
export const asItem = it => (typeof it === 'string' ? { type: it, rarity: 0, bonuses: [] }
  : { type: it.type || it.item_type, rarity: Math.max(0, Math.min(3, it.rarity | 0)), bonuses: [...new Set(it.bonuses || [])].slice(0, ROLL.maxBonuses) });

export const itemName = it => { const i = asItem(it), t = ITEMS[i.type]; return RARITIES[i.rarity].name + ' ' + (t ? t.name : i.type); };
export const itemColor = it => RARITIES[asItem(it).rarity].color;
/* Lines describing an item: its own bonus, then each rolled bonus at the item's rarity. */
export function itemLines(it) {
  const i = asItem(it), t = ITEMS[i.type], m = RARITIES[i.rarity].mult, out = [];
  if (t && t.desc) out.push(t.desc);
  for (const name of i.bonuses) { const r = relicByName(name); if (r) out.push(r.desc(m)); }
  return out;
}

/* Modifiers for a match from the equipped items: { heroId: [item, ...] } (an item is { type, rarity, bonuses } or a type id).
   Hero bonuses apply to the wearer only, and only if it has the bonus's tags (Whetstone needs a melee hero); "need" holds the
   wearer's id. Economy bonuses (gold per kill, wave gold...) help the whole match. Unknown types and bonuses are ignored. */
export function itemMods(equipped = {}) {
  const out = [];
  for (const heroId in equipped) {
    const list = Array.isArray(equipped[heroId]) ? equipped[heroId] : [equipped[heroId]];
    for (const raw of list) {
      if (!raw) continue;
      const it = asItem(raw), type = ITEMS[it.type];
      if (!type) continue;
      const source = itemName(it);
      for (const m of type.mods) out.push({ ...m, scope: [heroId], source, ri: -2 });
      for (const name of it.bonuses) {
        const r = relicByName(name), mods = r && bonusMods(r, RARITIES[it.rarity].mult);
        const from = source + ': ' + name;   /* each bonus is its own line in the hero panel, e.g. "Epic Helm: Whetstone" */
        if (mods) for (const m of mods) out.push(m.scope === 'global' ? { ...m, source: from, ri: -2 } : { ...m, need: heroId, source: from, ri: -2 });
      }
    }
  }
  return out;
}
