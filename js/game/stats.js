/* Stat resolution, Path of Exile style:  (base + flat) x (1 + sum of "inc") x every "more". */
export const matches = (scope, tags) => scope.includes('all') || scope.some(s => tags.includes(s));
const applies = (m, stat, tags) => m.stat === stat && (tags ? Array.isArray(m.scope) && matches(m.scope, tags) : m.scope === 'global');

export function resolve(base, stat, mods, tags) {
  let flat = 0, inc = 0, more = 1;
  for (const m of mods) {
    if (!applies(m, stat, tags)) continue;
    if (m.type === 'flat') flat += m.value; else if (m.type === 'inc') inc += m.value; else more *= 1 + m.value;
  }
  return (base + flat) * (1 + inc) * more;
}
/* All final stats of a tower. Cached on the tower and recomputed only when modifiers change. */
export function towerStats(def, mods) {
  const s = {};
  for (const k in def.stats) s[k] = resolve(def.stats[k], k, mods, def.tags);
  return s;
}
/* The modifiers currently affecting one stat of a tower (for the inspector). */
export const explain = (def, stat, mods) => mods.filter(m => applies(m, stat, def.tags));
/* Would this modifier change anything on this tower type? Needs a matching tag AND the tower must have that stat. */
export const touches = (def, m) => m.scope !== 'global' && m.stat in def.stats && matches(m.scope, def.tags);

/* Which tower types on the map would a relic offer affect? (for the relic picker) */
export function affected(relic, m, towers) {
  const tm = (relic.mods ? relic.mods(m) : []).filter(x => x.scope !== 'global');
  if (!tm.length) return { global: true, label: relic.label || 'Global effect' };
  const types = new Map();
  for (const t of towers) if (tm.some(x => touches(t.def, x))) types.set(t.type, (types.get(t.type) || 0) + 1);
  return { global: false, types };
}
