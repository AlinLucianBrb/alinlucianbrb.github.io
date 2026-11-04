/* Ultimates: what a hero does when its energy bar is full. The next attack becomes the ultimate.
   Each has damageMult (for the attack that triggers it) and can do something of its own in onFire(world, hero).
   To add one, register it here and set `ultimate` on a hero or an evolution choice in js/content/data.js. */
import { inflict } from './combat.js';
import { applyEffect } from './effects.js';
export const ULTIMATES = {};
export const registerUltimate = (id, def) => { ULTIMATES[id] = def; };

registerUltimate('empowered', { name: 'Empowered strike', desc: 'The next attack deals double damage.', damageMult: 2 });

/* Fire Mage: sets every enemy on the map on fire, as if each had been hit by the Mage. */
registerUltimate('inferno', { name: 'Inferno', desc: 'Sets every enemy on the map on fire.', damageMult: 1,
  onFire(w, h) { for (const e of w.enemies) if (!e.dead) inflict(w, h, e, 'burn', h.s.damage); } });

/* Cold Mage: freezes every enemy on the map for 1 second. (At 2 seconds it fired about every 4 seconds and kept enemies
   frozen half the time: level 5 took the balance bot over two hours.) */
export const BLIZZARD_FREEZE = 1;
registerUltimate('blizzard', { name: 'Blizzard', desc: 'Freezes every enemy on the map for ' + BLIZZARD_FREEZE + ' second.', damageMult: 1,
  onFire(w, h) { for (const e of w.enemies) if (!e.dead) applyEffect(e, 'freeze', { t: BLIZZARD_FREEZE }); } });

/* Lightning Mage: a storm over the Mage for 3 seconds, striking everything inside every half second for half a hit
   (each strike shocks, since the Lightning Mage always shocks). */
registerUltimate('storm', { name: 'Storm', desc: 'A storm around the Mage strikes and shocks every enemy inside for 3 seconds.', damageMult: 1,
  onFire(w, h) { w.zones.push({ type: 'storm', owner: h, x: h.x, y: h.y, r: h.s.range * 1.3, t: 3, next: 0, every: 0.5, scale: 0.5 }); } });

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
