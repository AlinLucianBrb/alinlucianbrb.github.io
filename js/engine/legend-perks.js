/* Legendary relics: what the attacks, ultimates and effects ask about them (the rest is legendaries.js). Imports nothing that
   attacks, so any of them can import it. */
import { LEGENDARIES } from '../content/legendaries.js';
import { applyEffect } from './effects.js';
import { nearest } from './upgrades.js';

/* The legendary `id`, if this hero plays with it (its player has it, and it is this hero's class); null otherwise. */
export function legend(w, h, id) {
  const p = h && w.players && w.players[h.owner || 0];
  if (!p || p.legendary !== id) return null;
  const l = LEGENDARIES[id];
  return !l.hero || (h.base && h.base.id === l.hero) ? l : null;
}
/* Overload: the crit damage added by a crit chance above 100%. */
export function overload(w, h, chance) {
  const l = chance > 1 && legend(w, h, 'overload');
  return l ? (chance - 1) * l.per : 0;
}
/* Soul harvest: how much more damage an enemy Hexed by this Occult takes. */
export function hexMore(w, h) { const l = legend(w, h, 'souls'); return l ? l.hex * (w.players[h.owner || 0].souls || 0) : 0; }
/* Lasting light: how many times as long a buff given by this hero lasts. */
export function buffTime(w, by) { const l = legend(w, by, 'light'); return l ? l.times : 1; }
/* Perpetual motion: whether the ultimate about to fire keeps its energy. */
export function keepsEnergy(w, h) { const l = legend(w, h, 'motion'); return !!l && w.rng.combat.next() < l.chance; }
/* After a projectile hit an enemy (projectiles.js): it flies on to the nearest other one, once. */
export function ricochet(g, p, e) {
  const l = !p.bounced && legend(g, p.owner, 'ricochet');
  if (!l) return;
  const t = nearest(g, e.x, e.y, l.reach, new Set([e]));
  if (t) g.projs.push({ type: 'bolt', owner: p.owner, target: t, x: e.x, y: e.y, scale: (p.scale ?? 1) * l.scale, color: p.color || p.owner.def.color, size: p.size || 5,
    look: p.look || 'arrow', speed: p.speed || l.speed, dx: 1, dy: 0, as: p.as || null, child: true, bounced: true });
}
/* A hero rooted an enemy for `seconds`: Overgrowth roots the nearest ones not rooted yet. */
export function spreadRoots(w, h, e, seconds) {
  const l = legend(w, h, 'overgrowth'), skip = new Set([e]);
  for (let k = 0; l && k < l.count; k++) {
    let t;
    do { t = nearest(w, e.x, e.y, l.radius, skip); if (t) skip.add(t); } while (t && t.fx && t.fx.root);
    if (!t) return;
    applyEffect(t, 'root', { t: seconds }, h);
  }
}
