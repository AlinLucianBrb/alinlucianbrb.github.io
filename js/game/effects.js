/* Status effects on enemies. Add an entry to create a new one (slow, damage over time, ...).
   Heros apply effects through their "applies" field in data.js. */
export const EFFECTS = {
  chill: { name: 'Chill', speedMult: 0.5, tint: '#8fb4e8' }
  /* example for later: burn: { name: 'Burn', tint: '#ff8a4c', onTick(g, e, dt) { g.hit(null, e, 3 * dt); } } */
};
export function applyEffect(e, id, duration) {
  if (!(duration > 0)) return;
  (e.fx ||= {})[id] = Math.max(e.fx[id] || 0, duration);
}
/* Ticks an enemy's effects and returns its speed multiplier. */
export function tickEffects(g, e, dt) {
  let mult = 1;
  if (e.fx) for (const id in e.fx) {
    const d = EFFECTS[id];
    mult *= d.speedMult || 1;
    if (d.onTick) d.onTick(g, e, dt);
    if ((e.fx[id] -= dt) <= 0) delete e.fx[id];
  }
  return mult;
}
export function tintOf(e) { if (e.fx) for (const id in e.fx) if (EFFECTS[id].tint) return EFFECTS[id].tint; return null; }
