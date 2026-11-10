/* Effects on enemies: the ailments from js/content/combat.js (bleed, poison, burn, shock, freeze) plus the chill slow kept
   for the archived Frost Mage. Each effect on an enemy is { t: seconds left, dps?, mag?, src? }; poison keeps a list of stacks.
   To add an effect: add it to AILMENTS (for one heroes can cause) or to EXTRA here (for anything else). */
import { AILMENTS } from '../content/combat.js';

const EXTRA = {
  chill: { name: 'Chill', kind: 'slow', speedMult: 0.5, tint: '#8fb4e8' },
  /* Rogue's Mark: hits against the enemy get +chance crit chance and +dmg crit damage (see critMult in combat.js). */
  mark: { name: 'Marked', kind: 'mark', tint: '#c77dff' },
  /* Standing in the Alchemist's flammable puddle: half speed. */
  oiled: { name: 'Oiled', kind: 'slow', speedMult: 0.5, tint: '#8a6d3b' },
  /* Curses (put there by abilities, not by damage types or chance rolls). taken: extra damage the enemy takes from everything
     (they add up; bosses take half, see damageTaken). One of each kind; a stronger one replaces a weaker one. */
  hex:     { name: 'Hex', kind: 'curse', taken: 0.2, speedMult: 0.85, tint: '#6b3fa0' },          /* Occult's aura */
  doom:    { name: 'Doom', kind: 'curse', taken: 0.5, tint: '#3c1460' },                          /* Occult's ultimate: explodes on death */
  verdict: { name: 'Verdict', kind: 'curse', perStack: 0.05, maxStacks: 10, tint: '#ffe08a' },   /* Inquisitor: +5% per stack */
  purge:   { name: 'Purged', kind: 'curse', tint: '#fff6c8' },                                     /* no armor, resistances down */
  link:    { name: 'Voodoo link', kind: 'curse', tint: '#5fbf8a' },                                /* Witch Doctor: shares damage */
  stun:    { name: 'Stunned', kind: 'root', tint: '#b09060' }                                      /* Earthcaller's fissure */
};
export const EFFECTS = { ...AILMENTS, ...EXTRA };
/* Which tint shows when an enemy has several effects. */
const TINT_ORDER = ['freeze', 'stun', 'root', 'doom', 'shock', 'burn', 'poison', 'corruption', 'bleed', 'hex', 'mark', 'oiled', 'chill'];
/* How much more damage an enemy takes from its curses: 1 + their `taken` (Verdict: per stack), halved for bosses. */
export function damageTaken(e) {
  const fx = e.fx; if (!fx) return 1;
  let k = 0;
  if (fx.hex) k += EFFECTS.hex.taken;
  if (fx.doom) k += EFFECTS.doom.taken;
  if (fx.verdict) k += EFFECTS.verdict.perStack * fx.verdict.n;
  return 1 + (e.def && e.def.boss ? k / 2 : k);
}

/* Hooks for effects that do something when their enemy is hurt or dies (kits register them: the Witch Doctor's link shares
   damage, Doom explodes, an Infernalist's burn jumps to the next enemy). damage[id](w, hero, e, amount, type, fx) runs after
   every hit on an enemy with that effect; death[id](w, e, fx) when it dies with it. */
export const EFFECT_HOOKS = { damage: {}, death: {} };

/* by: the hero that applies it, whose duration stat (the Duration relic) makes it last longer. */
export function applyEffect(e, id, eff, by = null) {
  if (typeof eff === 'number') eff = { t: eff };          /* old style: just a duration */
  if (by && by.s && by.s.duration > 0 && by.s.duration !== 1) eff = { ...eff, t: eff.t * by.s.duration };
  if (!(eff.t > 0)) return;
  const def = EFFECTS[id], fx = (e.fx ||= {});
  if (def.stacks) {
    const st = (fx[id] ||= { stacks: [] }).stacks;
    st.push({ ...eff });
    if (st.length > def.maxStacks) st.shift();             /* drop the oldest */
    return;
  }
  const cur = fx[id];
  if (!cur) { fx[id] = { ...eff }; return; }
  /* Only the strongest of a kind counts: bigger damage over time or bigger shock wins; otherwise keep the longer one. */
  if ((eff.dps || 0) > (cur.dps || 0) || (eff.mag || 0) > (cur.mag || 0)) fx[id] = { ...eff };
  else if (eff.dps === cur.dps && eff.mag === cur.mag) cur.t = Math.max(cur.t, eff.t);
}


/* Ticks an enemy's effects (damage over time through g.dot) and returns its speed multiplier. */
export function tickEffects(g, e, dt) {
  if (!e.fx) return 1;
  let mult = 1;
  for (const id in e.fx) {
    const def = EFFECTS[id], f = e.fx[id];
    if (def.stacks) {
      const st = f.stacks, ramp = 1 + (def.ramp || 0) * st.length;   /* Corruption: each stack makes them all stronger */
      let j = 0;
      for (let i = 0; i < st.length; i++) {
        const s = st[i], d = Math.min(dt, s.t);
        if (g.dot) g.dot(s.src, e, s.dps * d * ramp, def.type);
        if ((s.t -= dt) > 0) st[j++] = s;
      }
      st.length = j;
      if (!j) delete e.fx[id];
      continue;
    }
    if (def.kind === 'dot' && g.dot) g.dot(f.src, e, f.dps * Math.min(dt, f.t), def.type);
    if (def.kind === 'freeze' || def.kind === 'root') mult = 0;   /* frozen, rooted or stunned: held in place */
    else if (def.speedMult) mult *= def.speedMult;
    if ((f.t -= dt) <= 0) delete e.fx[id];
    if (e.dead) break;
  }
  return mult;
}

export function tintOf(e) {
  if (!e.fx) return null;
  for (const id of TINT_ORDER) if (e.fx[id]) return EFFECTS[id].tint;
  return null;
}
