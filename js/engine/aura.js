/* Auras (Incantation Priest, Occult Warlock): the hero never attacks. A ring around it (radius = its range) pulses every
   `cooldown` seconds at its cast speed and touches everything inside at once:
   - enemies take a hit (pulses are hits: crits, ailments and on-hit relics work; flat added damage counts at AURA.added,
     or many small pulses would get it many times over), and the form's curse if it has one;
   - allied heroes inside (any player's) get the form's blessing, refreshed every pulse, so it ends just after they leave.
   The aura comes from the form's `aura` field: { bless: { id, name, mods }, curse: 'hex', harmless: true (no damage) }. Energy comes only from pulses that
   touch an enemy (energyPerAttack, set low on aura forms). The ultimate fires on such a pulse; while it lasts the hero's
   t.auraBoost = { t, radius, damage } makes the ring wider and the pulses stronger (Crescendo), and t.auraCurse adds a second
   curse (Doom). t.pulse counts down after each pulse, for the ripple the renderer draws. */
import { DAMAGE_TYPES } from '../content/combat.js';
import { registerBehavior, ready, rearm, strike, charge } from './behaviors.js';
import { applyEffect } from './effects.js';

export const AURA = { added: 0.5, bless: 0.6, curse: 1, ripple: 0.35 };

/* The hero's stats for a pulse: its own, with flat added damage at AURA.added. Cached until its stats change. */
export function auraStats(t) {
  if (t._auraFor !== t.s) {
    const s = { ...t.s };
    for (const k of DAMAGE_TYPES) if (s[k + 'Damage']) s[k + 'Damage'] *= AURA.added;
    t._aura = s; t._auraFor = t.s;
  }
  return t._aura;
}
export const auraRadius = t => t.s.range * (t.auraBoost && t.auraBoost.t > 0 ? t.auraBoost.radius : 1);

registerBehavior('aura', {
  update(g, t, dt) {
    const boost = t.auraBoost;
    if (boost && (boost.t -= dt) <= 0) t.auraBoost = null;
    if (t.auraCurse && (t.auraCurse.t -= dt) <= 0) t.auraCurse = null;
    if (t.pulse > 0) t.pulse = Math.max(0, t.pulse - dt);
    if (!ready(t, dt)) return;
    rearm(t);
    const a = t.def.aura || {}, r = auraRadius(t), r2 = r * r;
    if (a.bless) for (const o of g.heroes) if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 <= r2) g.addBuff(o, a.bless.id, a.bless.name, a.bless.mods, AURA.bless, t);
    let first = null;
    for (const e of g.enemies) if (!e.dead && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2) { first = e; break; }
    t.pulse = AURA.ripple;
    if (!first) return;
    const mult = strike(g, t, first), k = (mult || 1) * (t.auraBoost ? t.auraBoost.damage : 1), s = auraStats(t);
    const r3 = auraRadius(t) ** 2;   /* the ultimate may have just widened it */
    for (const e of g.enemies) {
      if (e.dead || (e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r3) continue;
      if (a.curse) applyEffect(e, a.curse, { t: AURA.curse }, t);
      if (t.auraCurse) applyEffect(e, t.auraCurse.id, { t: AURA.curse, src: t }, t);
      if (s.damage > 0 && !a.harmless) g.attack(t, e, k, 1, null, s);   /* the Occult's aura only curses */
    }
    charge(g, t);
  }
});
