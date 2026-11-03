/* Items drop at the end of a match and are equipped on heroes before the next one. Each hero has one slot for now.
   An item is a list of modifiers, like a relic or a talent node; when equipped, they apply to that hero only.
   To add an item: add an entry here, then run `npm run content-sql` so the database knows it can drop. */
export const SLOTS = ['trinket'];

export const ITEMS = {
  power_charm: { name: 'Power Charm', slot: 'trinket', color: '#f2b84b', desc: '+5 damage',
    mods: [{ stat: 'damage', type: 'flat', value: 5 }] }
};

/* Modifiers for a match from the equipped items: { heroId: itemType }. Unknown items are ignored. */
export function itemMods(equipped = {}) {
  const out = [];
  for (const heroId in equipped) {
    const item = ITEMS[equipped[heroId]];
    if (item) for (const m of item.mods) out.push({ ...m, scope: [heroId], source: item.name, ri: -2 });
  }
  return out;
}
