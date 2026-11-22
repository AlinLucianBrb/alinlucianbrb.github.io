/* Disenchanting and crafting (unlocked in act 2, js/content/unlocks.js). An item can be broken down into the material of its
   rarity; materials turn into the next one up, and make new items: the player picks the rarity, the slot and the kind
   (general or an archetype), and the server rolls the bonuses and ranks like a drop of that rarity. The item level is that
   of the highest level beaten. The server does all of it (disenchant_items, convert_material, craft_item in
   sql/52-crafting.sql) with the same numbers: the rule_* functions are generated from here. */
import { ITEMS, SLOTS, AFFINITY, AFFINITY_LABEL, ILVL } from './items.js';

/* One per rarity, Common to Epic, in the order of profile.materials. */
export const MATERIALS = [
  { id: 'scrap',   name: 'Scrap',   icon: 'icon_mat_scrap' },
  { id: 'dust',    name: 'Dust',    icon: 'icon_mat_dust' },
  { id: 'essence', name: 'Essence', icon: 'icon_mat_essence' },
  { id: 'core',    name: 'Core',    icon: 'icon_mat_core' }
];
/* yields: materials from one item; cost: materials for one item; gold: account gold by rarity; convert: how many make one of
   the next. Crafting an item and breaking it down again always loses. */
export const CRAFT = { yields: 3, cost: 9, gold: [25, 75, 200, 500], convert: 5 };
export const KINDS = [null, ...Object.keys(AFFINITY)];                    /* null: a general item */
export const kindName = k => (k ? AFFINITY_LABEL[k] : 'General');
/* The item type of a slot and kind (there is exactly one of each). */
export const craftType = (slot, kind) => Object.keys(ITEMS).find(id => ITEMS[id].slot === slot && (ITEMS[id].affinity || null) === kind);
export const craftLevel = cleared => Math.max(1, ILVL.perLevel * (cleared || 0));
export const cleanMaterials = m => MATERIALS.map((_, i) => Math.max(0, (Array.isArray(m) && m[i]) | 0));
export { SLOTS };
/* Why an item cannot be crafted now ('' when it can): p is the profile, count the items the player holds. */
export function craftProblem(p, rarity, count, max) {
  const have = cleanMaterials(p.materials)[rarity];
  if (have < CRAFT.cost) return 'Needs ' + CRAFT.cost + ' ' + MATERIALS[rarity].name + ' (you have ' + have + ')';
  if ((p.gold || 0) < CRAFT.gold[rarity]) return 'Needs ' + CRAFT.gold[rarity] + ' gold (you have ' + (p.gold || 0) + ')';
  return count >= max ? 'Your inventory is full' : '';
}
