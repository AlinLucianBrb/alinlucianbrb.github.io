/* Effects on enemies: the ailments from js/content/combat.js (bleed, poison, burn, shock, freeze) plus the chill slow kept
   for the archived Frost Mage. Each effect on an enemy is { t: seconds left, dps?, mag?, src? }; poison keeps a list of stacks.
   To add an effect: add it to AILMENTS (for one heroes can cause) or to EXTRA here (for anything else). */
import { AILMENTS } from '../content/combat.js';

const EXTRA = { chill: { name: 'Chill', kind: 'slow', speedMult: 0.5, tint: '#8fb4e8' } };
export const EFFECTS = { ...AILMENTS, ...EXTRA };
/* Which tint shows when an enemy has several effects. */
const TINT_ORDER = ['freeze', 'shock', 'burn', 'poison', 'bleed', 'chill'];

export function applyEffect(e, id, eff) {
  if (typeof eff === 'number') eff = { t: eff };          /* old style: just a duration */
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

/* Shock makes an enemy take more damage from everything. */
export const damageTakenMult = e => (e.fx && e.fx.shock ? 1 + e.fx.shock.mag : 1);

/* Ticks an enemy's effects (damage over time through g.dot) and returns its speed multiplier. */
export function tickEffects(g, e, dt) {
  if (!e.fx) return 1;
  let mult = 1;
  for (const id in e.fx) {
    const def = EFFECTS[id], f = e.fx[id];
    if (def.stacks) {
      const st = f.stacks;
      let j = 0;
      for (let i = 0; i < st.length; i++) {
        const s = st[i], d = Math.min(dt, s.t);
        if (g.dot) g.dot(s.src, e, s.dps * d, def.type);
        if ((s.t -= dt) > 0) st[j++] = s;
      }
      st.length = j;
      if (!j) delete e.fx[id];
      continue;
    }
    if (def.kind === 'dot' && g.dot) g.dot(f.src, e, f.dps * Math.min(dt, f.t), def.type);
    if (def.kind === 'freeze') mult = 0;
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
