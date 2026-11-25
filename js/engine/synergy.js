/* Synergies at work (the data is js/content/synergies.js): the ring of debuffs that open enemies to a damage type, and the
   level-30 passives that hit harder or inflict more on enemies that already carry a debuff. combat.js asks:
   - ringMult(e, type): how much more that type's part of a hit deals to this enemy;
   - passiveMult(hero, e): how much more this hero's hits deal to it (its passive, and a Gospel's Revelation on it);
   - ailmentMult(hero, e, id) / extraStacks(hero, e, id): a passive that makes an ailment stronger or stack twice. */
import { RING, RING_MORE, DEBUFFS } from '../content/synergies.js';

/* Whether an enemy carries a debuff now (stacking ones need a stack, Verdict a stack). */
export function has(e, id) {
  const f = e.fx && e.fx[id];
  if (!f) return false;
  if (f.stacks) return f.stacks.length > 0;
  if (id === 'verdict') return f.n > 0;
  return f.t > 0;
}
export const hasAny = (e, ids) => { for (const id of ids) if (has(e, id)) return true; return false; };
export const stacksOf = (e, id) => { const f = e.fx && e.fx[id]; return f ? (f.stacks ? f.stacks.length : id === 'verdict' ? f.n : 1) : 0; };
export const distinctDebuffs = e => { let n = 0; if (e.fx) for (const id of DEBUFFS) if (has(e, id)) n++; return n; };

export const ringMult = (e, type) => (e.fx && RING[type] && hasAny(e, RING[type]) ? 1 + RING_MORE : 1);

/* The hero's passive, if its second evolution is one. */
export const passiveOf = h => (h && h.def && h.def.upgrade && h.def.upgrade.slot === 'passive' ? h.def.upgrade : null);

/* Revelation (the Gospel's passive): a buff on heroes around her; their hits deal more to debuffed enemies. */
export const REVELATION = 'revelation';

export function passiveMult(hero, e) {
  let k = 1;
  const p = passiveOf(hero);
  if (p && e.fx) {
    if (p.vs && hasAny(e, p.vs)) k *= 1 + p.more;
    if (p.per) { let n = 0; for (const id of p.per) n += stacksOf(e, id); if (n) k *= 1 + Math.min(p.max || Infinity, p.perStack * n); }
    if (p.distinct) { const n = distinctDebuffs(e); if (n) k *= 1 + p.distinct * n; }
  }
  if (hero.buffs && e.fx) {
    const r = hero.buffs.find(b => b.id === REVELATION && b.t > 0);
    if (r && distinctDebuffs(e) > 0) k *= 1 + r.more;
  }
  return k;
}
export function ailmentMult(hero, e, id) {
  const b = passiveOf(hero)?.boost;
  return b && b.ailment === id && hasAny(e, b.vs) ? b.mult : 1;
}
export function extraStacks(hero, e, id) {
  const x = passiveOf(hero)?.extraStack;
  return x && x.ailment === id && hasAny(e, x.vs) ? 1 : 0;
}
