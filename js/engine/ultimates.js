/* Ultimates: what a hero does when its energy bar is full. The next attack becomes the ultimate.
   For now there is one: an empowered strike that deals double damage. To add one, register it here and set `ultimate`
   on a hero in js/content/data.js. A future ultimate can also use onFire(world, hero) to do something of its own. */
export const ULTIMATES = {};
export const registerUltimate = (id, def) => { ULTIMATES[id] = def; };

registerUltimate('empowered', { name: 'Empowered strike', desc: 'The next attack deals double damage.', damageMult: 2 });

/* Called by every behavior just before an attack: returns the damage multiplier for this attack (1, or the ultimate's)
   and empties the bar when the ultimate fires. */
export function attackMult(w, h) {
  if (h.energy < h.s.energyMax) return 1;
  const u = ULTIMATES[h.def.ultimate];
  if (!u) return 1;
  h.energy = 0; h.ults++;
  if (u.onFire) u.onFire(w, h);
  w.ev.emit('ultimate', { hero: h, ultimate: u });
  return u.damageMult || 1;
}

/* Called by every behavior after an attack that hit something (not after the ultimate itself). */
export function gainEnergy(h, amount = h.s.energyPerAttack) {
  h.energy = Math.min(h.s.energyMax, h.energy + amount);
}
