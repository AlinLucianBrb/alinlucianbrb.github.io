/* Simulated gear for the balance bot: five items for a hero at a quality tier, as a player who has farmed a while would wear.
   none: no items. common, rare, epic: every slot holds an item of that rarity, of the hero's archetype where there is one
   (melee, projectile, spell or minion items, see AFFINITY), with the number of bonuses that rarity guarantees, each at the
   rarity's rank. The bonuses are the ones that help this hero most (as it will play: its path's tags count): its damage
   bonuses first, then speed, crits and its attribute, never two the same on an item, spread across the five slots. */
import { HEROES, RELICS } from '../../js/content/data.js';
import { ITEMS, SLOTS, ITEM_BONUSES, ROLL } from '../../js/content/items.js';
import { pathChoice, pathDef } from '../../js/engine/preview.js';
import { matches } from '../../js/engine/stats.js';

export const GEAR_TIERS = ['none', 'common', 'rare', 'epic'];

/* What a bonus is worth to a hero, roughly: the stats it touches, weighted (0 = does nothing for it). */
const WORTH = { damage: 10, minionDamage: 9, speed: 7, castSpeed: 7, minionSpeed: 6, critChance: 6, critDamage: 4, minionCritChance: 4, minionCritDamage: 3,
  mainAttribute: 6, strength: 3, dexterity: 3, intellect: 3, range: 4, targets: 5, energyPerAttack: 3, duration: 2, corruptionChance: 2 };
function worth(def, relic) {
  let v = 0;
  for (const m of relic.mods ? relic.mods(1) : []) {
    if (m.scope === 'global' || !Array.isArray(m.scope) || !matches(m.scope, def.tags)) continue;
    if (!(m.stat in def.stats) && m.stat !== 'mainAttribute') continue;
    let w = WORTH[m.stat] || 1;
    if (m.stat === def.attribute) w = 7;                                         /* its own attribute is damage too */
    if (m.stat.startsWith('minion') && !def.tags.includes('minion')) w = 0;
    if ((m.stat === 'speed' && def.rate === 'castSpeed') || (m.stat === 'castSpeed' && def.rate !== 'castSpeed')) w = 0;
    v += w;
  }
  return v;
}

/* The hero as it will play (with its path's tags). */
export function playedDef(heroId, form) {
  const base = HEROES.find(h => h.id === heroId), c = form && pathChoice(heroId, form);
  return c ? pathDef(base, c) : base;
}

/* { heroId: [{ type, rarity, bonuses, ranks }] } for a lineup. paths: { heroId: formId } (their tags decide what fits). */
export function gearFor(lineup, tier = 'none', paths = {}) {
  const r = GEAR_TIERS.indexOf(tier) - 1;
  if (r < 0) return {};
  const out = {};
  for (const id of lineup) {
    const def = playedDef(id, paths[id]);
    const ranked = ITEM_BONUSES.map(name => ({ name, v: worth(def, RELICS.find(x => x.name === name)) })).filter(b => b.v > 0).sort((a, b) => b.v - a.v);
    const aff = def.tags.includes('minion') ? 'minion' : def.archetype === 'melee' ? 'melee' : def.rate === 'castSpeed' ? 'spell' : 'projectile';
    const n = ROLL.guaranteed(r);
    out[id] = SLOTS.map((slot, k) => {
      const type = Object.keys(ITEMS).find(t => ITEMS[t].slot === slot && ITEMS[t].affinity === aff) || Object.keys(ITEMS).find(t => ITEMS[t].slot === slot);
      /* each slot takes the best bonuses, shifted a little so the five items are not all the same */
      const pick = [];
      for (let j = 0; pick.length < n && j < ranked.length * 2; j++) { const b = ranked[(j + k) % ranked.length]; if (b && !pick.includes(b.name)) pick.push(b.name); }
      return { type, rarity: r, bonuses: pick, ranks: pick.map(() => r + 1) };
    });
  }
  return out;
}
