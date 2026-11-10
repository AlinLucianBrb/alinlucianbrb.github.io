/* Stat resolution, Path of Exile style:  (base + flat) x (1 + sum of "inc") x every "more". */
import { ATTRIBUTE_DAMAGE, ATTRIBUTE_EFFECTS } from '../content/data.js';
export const matches = (scope, tags) => scope.includes('all') || scope.some(s => tags.includes(s));
/* need: a hero id the modifier is limited to (item bonuses only help the hero wearing the item). Hero tags include its id. */
const applies = (m, stat, tags) => m.stat === stat && (tags ? Array.isArray(m.scope) && matches(m.scope, tags) && (!m.need || tags.includes(m.need)) : m.scope === 'global');

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
  attributeEffects(s);
  return s;
}
/* Every attribute's side effect (ATTRIBUTE_EFFECTS): crit chance is added, area and energy from attacks are multiplied.
   A strength hero's swing arc grows with its area. */
function attributeEffects(s) {
  for (const a in ATTRIBUTE_EFFECTS) {
    const fx = ATTRIBUTE_EFFECTS[a], v = (s[a] || 0) * fx.per;
    if (!(v > 0) || !(fx.stat in s)) continue;
    if (fx.stat === 'critChance') s.critChance += v; else s[fx.stat] *= 1 + v;
  }
  if ('arc' in s && s.area) s.arc *= s.area;
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

/* A minion's stats (the Animalic Druid's wolf): the hero's, with the minion counterparts on top. Its damage (and added damage
   of every type) is multiplied by minionDamage, its attack speed by minionSpeed; minion crit chance and crit damage add to
   the hero's. */
export function minionStats(s) {
  const m = { ...s }, k = s.minionDamage ?? 1;
  m.damage = s.damage * k;
  for (const key in s) if (key.endsWith('Damage') && key !== 'critDamage' && !key.startsWith('minion')) m[key] = s[key] * k;
  m.speed = (s.speed || 1) * (s.minionSpeed ?? 1); m.castSpeed = (s.castSpeed || 1) * (s.minionSpeed ?? 1);
  m.critChance = (s.critChance || 0) + (s.minionCritChance || 0);
  m.critDamage = (s.critDamage || 1.5) + (s.minionCritDamage || 0);
  return m;
}
