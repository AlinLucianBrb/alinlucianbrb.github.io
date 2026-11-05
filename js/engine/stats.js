/* Stat resolution, Path of Exile style:  (base + flat) x (1 + sum of "inc") x every "more". */
import { ATTRIBUTE_DAMAGE } from '../content/data.js';
export const matches = (scope, tags) => scope.includes('all') || scope.some(s => tags.includes(s));
const applies = (m, stat, tags) => m.stat === stat && (tags ? Array.isArray(m.scope) && matches(m.scope, tags) : m.scope === 'global');

export function resolve(base, stat, mods, tags, extraInc = 0) {
  let flat = 0, inc = extraInc, more = 1;
  for (const m of mods) {
    if (!applies(m, stat, tags)) continue;
    if (m.type === 'flat') flat += m.value; else if (m.type === 'inc') inc += m.value; else more *= 1 + m.value;
  }
  return (base + flat) * (1 + inc) * more;
}
/* All final stats of a hero. Cached on the hero and recomputed only when modifiers change.
   Attributes come first: the hero's own attribute also takes mainAttribute (hero levels), and gives increased damage. */
export function heroStats(def, mods) {
  const s = {}, own = def.attribute;
  if (own && own in def.stats) s[own] = resolve(def.stats[own], own, mods, def.tags) + resolve(0, 'mainAttribute', mods, def.tags);
  for (const k in def.stats) if (k !== own) s[k] = resolve(def.stats[k], k, mods, def.tags, k === 'damage' && own ? attributeDamage(def, s) : 0);
  return s;
}
/* The increased damage a hero gets from its own attribute (0.37 = +37%). */
export const attributeDamage = (def, s) => (def.attribute && s[def.attribute] ? s[def.attribute] * ATTRIBUTE_DAMAGE : 0);
/* The modifiers currently affecting one stat of a hero (for the inspector). */
export const explain = (def, stat, mods) => mods.filter(m => applies(m, stat, def.tags));
/* Would this modifier change anything on this hero type? Needs a matching tag AND the hero must have that stat. */
export const touches = (def, m) => m.scope !== 'global' && (m.stat in def.stats || (m.stat === 'mainAttribute' && !!def.attribute)) && matches(m.scope, def.tags);

/* Which hero types on the map would a relic offer affect? (for the relic picker) */
export function affected(relic, m, heroes) {
  const tm = (relic.mods ? relic.mods(m) : []).filter(x => x.scope !== 'global');
  if (!tm.length) return { global: true, label: relic.label || 'Global effect' };
  const types = new Map();
  for (const t of heroes) if (tm.some(x => touches(t.def, x))) types.set(t.type, (types.get(t.type) || 0) + 1);
  return { global: false, types };
}
