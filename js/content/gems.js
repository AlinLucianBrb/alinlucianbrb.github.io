/* Gems (unlocked with crafting, in act 2). Rough Stone drops at the end of a match: some for every boss killed, more for
   winning, more on later acts (STONES). In the Inventory's Gems tab a player spends stones and account gold on a gem of a
   FAMILY: the server picks one of the family's four TYPES at random, then one stat from that type's pool. A crafted gem is
   Common; three gems of the same type and rarity combine into one of the next rarity (up to Epic), which keeps the stat of
   one of the three, picked at random (combine three with the same stat to be sure of it).
   Every item has SOCKETS sockets; a gem in an item's socket works on the hero wearing that item. Taking a gem out is free
   and gives it back; breaking down or selling an item gives back its gems.
   A gem's stat is its value x (rarity + 1) (Uncommon 2x, Rare 3x, Epic 4x) x its item level's multiplier (like an item's:
   ilvlMult). The item level is the highest level beaten when it was made; a combined gem takes the highest of the three.
   The server rolls and checks everything (craft_gem, combine_gems, socket_gem in sql/56-gems.sql); the numbers here are
   copied into the database by tools/content-sql.mjs and tools/rules-sql.mjs. */
import { RARITIES } from './data.js';
import { ilvlMult, ILVL } from './items.js';
import { DAMAGE_LABEL, DAMAGE_COLOR } from './combat.js';

export const SOCKETS = 2;
/* stones: Rough Stone for one gem; gold: account gold for one gem; combine: gems that make one of the next rarity;
   max: gems a player can hold. */
export const GEM_CRAFT = { stones: 10, gold: 100, combine: 3, max: 200 };
/* Rough Stone from a match: perBoss for every boss killed, plus winPerAct x the level's act on a win (endless: its zone). */
export const STONES = { perBoss: 2, winPerAct: 2 };

export const GEM_FAMILIES = {
  elemental: { name: 'Elemental gem', types: ['arcane', 'fire', 'cold', 'lightning'], icon: 'icon_gem_elemental' },
  primal:    { name: 'Primal gem',    types: ['physical', 'toxic', 'holy', 'shadow'], icon: 'icon_gem_primal' }
};
export const FAMILY_IDS = Object.keys(GEM_FAMILIES);

/* One stat of a gem's pool, at Common and item level 10: flat values on the hero, like a talent node. */
const S = (stat, value, label, type = 'flat') => ({ stat, value, label, type });
const added = t => S(t + 'Damage', 2, 'added ' + DAMAGE_LABEL[t].toLowerCase() + ' damage');
const pct = (stat, value, label, type) => ({ ...S(stat, value, label, type), pct: true });
/* Each type's stats. An ailment chance only works on hits that carry its damage type (burn needs fire damage), so a gem's
   added damage and its ailment go well together. */
export const GEM_TYPES = {
  arcane:    { name: 'Amethyst', stats: [added('arcane'), pct('critChance', 0.02, 'crit chance'), pct('critDamage', 0.1, 'crit damage')] },
  fire:      { name: 'Ruby',     stats: [added('fire'), pct('burnChance', 0.03, 'burn chance'), pct('firePen', 0.03, 'fire penetration')] },
  cold:      { name: 'Sapphire', stats: [added('cold'), pct('freezeChance', 0.03, 'freeze chance'), pct('coldPen', 0.03, 'cold penetration')] },
  lightning: { name: 'Topaz',    stats: [added('lightning'), pct('shockChance', 0.03, 'shock chance'), pct('lightningPen', 0.03, 'lightning penetration')] },
  physical:  { name: 'Hematite',   stats: [added('physical'), pct('bleedChance', 0.03, 'bleed chance'), pct('armorPen', 0.03, 'armor penetration')] },
  toxic:     { name: 'Emerald',  stats: [added('toxic'), pct('poisonChance', 0.03, 'poison chance')] },
  holy:      { name: 'Pearl',    stats: [added('holy'), pct('energyPerSecond', 0.05, 'energy gain', 'inc')] },
  shadow:    { name: 'Obsidian', stats: [added('shadow'), pct('corruptionChance', 0.03, 'corruption chance')] }
};
export const GEM_TYPE_IDS = Object.keys(GEM_TYPES);
export const familyOf = type => FAMILY_IDS.find(f => GEM_FAMILIES[f].types.includes(type)) || null;
export const gemColor = type => DAMAGE_COLOR[type] || '#ab9f8a';
export const gemIcon = type => 'icon_gem_' + type;

/* A gem row from the server ({ id, gem_type, stat, rarity, ilvl, item, socket }) or a plain { type, stat, rarity, ilvl }. */
export function asGem(g) {
  const type = g.type || g.gem_type, def = GEM_TYPES[type];
  const stat = def && def.stats.find(s => s.stat === g.stat) ? g.stat : null;
  return { type, stat, rarity: Math.max(0, Math.min(RARITIES.length - 1, g.rarity | 0)), ilvl: Math.max(1, (g.ilvl | 0) || ILVL.old) };
}
const statDef = g => { const i = asGem(g), d = GEM_TYPES[i.type]; return d && i.stat ? d.stats.find(s => s.stat === i.stat) : null; };
/* What a gem gives, as a number: value x (rarity + 1) x the item level's multiplier. */
export const gemValue = g => { const i = asGem(g), s = statDef(g); return s ? s.value * (i.rarity + 1) * ilvlMult(i.ilvl) : 0; };
export const gemName = g => { const i = asGem(g), d = GEM_TYPES[i.type]; return RARITIES[i.rarity].name + ' ' + (d ? d.name : 'gem'); };
export const gemRarityColor = g => RARITIES[asGem(g).rarity].color;
/* "+3.4 added fire damage", "+6% burn chance" */
export function gemLine(g) {
  const s = statDef(g); if (!s) return 'Does nothing';
  const v = gemValue(g);
  return '+' + (s.pct ? +(v * 100).toFixed(1) + '%' : +v.toFixed(1)) + ' ' + s.label;
}
/* The modifiers a hero gets from the gems in its items: { heroId: [gem, ...] }. */
export function gemMods(gemsOf = {}) {
  const out = [];
  for (const heroId in gemsOf) for (const g of gemsOf[heroId] || []) {
    const s = g && statDef(g); if (!s) continue;
    out.push({ stat: s.stat, type: s.type, value: gemValue(g), scope: [heroId], need: heroId, source: gemName(g), ri: -2 });
  }
  return out;
}
/* Rough Stone a match gives (the server's rule_stones does the same; a test keeps them in step). act: the level's act. */
export const stonesFor = (act, won, bosses) => STONES.perBoss * Math.max(0, bosses | 0) + (won ? STONES.winPerAct * Math.max(1, act | 0) : 0);
/* Why a gem cannot be crafted now ('' when it can): p is the profile, count the gems the player holds. */
export function gemCraftProblem(p, count) {
  const have = (p && p.stones) | 0;
  if (have < GEM_CRAFT.stones) return 'Needs ' + GEM_CRAFT.stones + ' Rough Stone (you have ' + have + ')';
  if (((p && p.gold) || 0) < GEM_CRAFT.gold) return 'Needs ' + GEM_CRAFT.gold + ' gold (you have ' + ((p && p.gold) || 0) + ')';
  return count >= GEM_CRAFT.max ? 'Your gem bag is full' : '';
}
