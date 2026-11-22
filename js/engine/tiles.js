/* Ground effects at work (the data is js/content/shop.js). w.tiles: [{ effect, level (1 to 3), cx, cy, owner }]. */
import { TILE_EFFECTS } from '../content/shop.js';
import { DAMAGE_TYPES } from '../content/combat.js';
import { minionStats } from './stats.js';

export const tileAt = (w, cx, cy) => (w.tiles || []).find(t => t.cx === cx && t.cy === cy) || null;
export const tileValue = t => TILE_EFFECTS[t.effect].values[t.level - 1];
/* The effect under a hero: only its owner's own tiles work for it. */
export function tileOf(w, h, effect) {
  const t = w.tiles && w.tiles.length && h ? tileAt(w, h.cx, h.cy) : null;
  return t && t.effect === effect && t.owner === (h.owner || 0) ? t : null;
}
/* Greed: what a hero's kills multiply its owner's gold by. */
export const greedMult = (w, h) => { const t = tileOf(w, h, 'greed'); return t ? tileValue(t) : 1; };

/* Conduit: the stats that move. Crit damage moves by its part above 1. */
const MOVED = ['damage', 'strength', 'dexterity', 'intellect', 'critChance', 'resPen', 'armorPen', ...DAMAGE_TYPES.map(t => t + 'Damage')];
const over = (s, k) => (k === 'critDamage' ? Math.max(0, (s[k] || 0) - 1) : s[k] || 0);
/* Who gives to whom: each hero gives to one conduit at most (the first bought), and a hero on a conduit gives to none. */
export function conduitLinks(w) {
  const links = new Map(), onOne = h => !!tileOf(w, h, 'conduit');
  for (const t of w.tiles || []) {
    if (t.effect !== 'conduit') continue;
    const to = w.heroes.find(h => h.cx === t.cx && h.cy === t.cy && (h.owner || 0) === t.owner);
    if (!to) continue;
    for (const h of w.heroes) if (h !== to && (h.owner || 0) === t.owner && !links.has(h) && !onOne(h) && Math.max(Math.abs(h.cx - t.cx), Math.abs(h.cy - t.cy)) === 1) links.set(h, { to, share: tileValue(t) });
  }
  return links;
}
/* Recomputes h.s from h.raw (the hero's own stats, see statsFor) for every hero a conduit touches or touched. Called after
   stats change, and after a hero or a tile is placed or moved. */
export function applyConduits(w) {
  const links = conduitLinks(w), touched = new Set();
  for (const [from, l] of links) { touched.add(from); touched.add(l.to); }
  for (const h of w.heroes) {
    if (!h.raw || (!touched.has(h) && !h.conduit)) continue;
    if (!touched.has(h)) { h.s = h.raw; h.conduit = null; } else {
      const s = { ...h.raw }, mine = links.get(h);
      for (const k of [...MOVED, 'critDamage']) {
        if (!(k in s)) continue;
        if (mine) s[k] -= over(h.raw, k) * mine.share;
        for (const [from, l] of links) if (l.to === h) s[k] += over(from.raw, k) * l.share;
      }
      h.s = s; h.conduit = mine ? { gives: mine.share } : { takes: [...links.values()].filter(l => l.to === h).length };
    }
    h.ms = h.def.tags.includes('minion') ? minionStats(h.s) : null;
  }
}
export const hasConduit = w => !!w.tiles && w.tiles.some(t => t.effect === 'conduit');
