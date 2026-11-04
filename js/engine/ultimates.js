/* Ultimates: what a hero does when its energy bar is full. The next attack becomes the ultimate.
   Each has damageMult (for the attack that triggers it) and can do something of its own in onFire(world, hero).
   To add one, register it here and set `ultimate` on a hero or an evolution choice in js/content/data.js. */
import { inflict } from './combat.js';
import { applyEffect } from './effects.js';
import { T, COLS, ROWS } from '../content/data.js';
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

/* Called by every behavior just before an attack, with the attack's target: returns the damage multiplier for this attack
   (1, or the ultimate's) and empties the bar when the ultimate fires. An ultimate with replaces: true returns 0: the hero
   does not make its normal attack (the ultimate is the attack, like the Marksman's arrow). */
export function attackMult(w, h, target) {
  if (h.energy < h.s.energyMax) return 1;
  const u = ULTIMATES[h.def.ultimate];
  if (!u) return 1;
  h.energy = 0; h.ults++; h.ultNow = true;
  if (u.onFire) u.onFire(w, h, target);
  w.ev.emit('ultimate', { hero: h, ultimate: u });
  return u.replaces ? 0 : (u.damageMult || 1);
}

/* Called by every behavior after an attack. The attack that fired the ultimate does not refill the bar. */
export function gainEnergy(h, amount = h.s.energyPerAttack) {
  h.energy = Math.min(h.s.energyMax, h.energy + amount);
}

/* Marksman: charges for a moment, then looses an arrow that flies through every enemy in a straight line (aimed at the
   attack's target) for 3x a hit each. It replaces the normal arrow. */
registerUltimate('piercing', { name: 'Piercing shot', desc: 'Charges a powerful arrow that pierces every enemy in its path for triple damage.', replaces: true,
  onFire(w, h, target) {
    const tx = target ? target.x : h.x + 1, ty = target ? target.y : h.y, len = Math.hypot(tx - h.x, ty - h.y) || 1;
    w.projs.push({ type: 'pierce', owner: h, x: h.x, y: h.y, dx: (tx - h.x) / len, dy: (ty - h.y) / len, charge: 0.35, dist: 0, max: 1000, hit: new Set(), scale: 3 });
  } });

/* Boomerang Ranger: a boomerang spins around the Ranger for 6 seconds, hitting every enemy it touches (each one at most
   every 0.4 s). Several at once are spread evenly around the circle (see the orbit projectile). */
registerUltimate('orbit', { name: 'Spinning blade', desc: 'A boomerang spins around the Ranger for 6 seconds, hitting everything it touches.', damageMult: 1,
  onFire(w, h) { w.projs.push({ type: 'orbit', owner: h, x: h.x, y: h.y, t: 6, rot: 0, hitT: new Map(), scale: 1 }); } });

/* Hunter: lays up to 3 traps on path tiles within range, spread out along the path. A trap bursts when an enemy steps on it,
   dealing 4x a hit of toxic damage to everything close by. At most 6 of a Hunter's traps are out at once (the oldest goes). */
export const TRAP = { count: 3, max: 6, scale: 4, radius: 34, trigger: 14, life: 20 };
registerUltimate('traps', { name: 'Toxic traps', desc: 'Lays 3 traps on the path that burst with heavy toxic damage when an enemy steps on one.', damageMult: 1,
  onFire(w, h) {
    const r2 = h.s.range * h.s.range, taken = new Set(w.zones.filter(z => z.type === 'trap').map(z => z.cell));
    const cells = [];
    w.path.forEach(([cx, cy], i) => {
      const x = (cx + 0.5) * T, y = (cy + 0.5) * T;
      if ((x - h.x) ** 2 + (y - h.y) ** 2 <= r2 && !taken.has(i) && cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) cells.push({ i, x, y });
    });
    if (!cells.length) return;
    const n = Math.min(TRAP.count, cells.length), picks = [];
    for (let k = 0; k < n; k++) picks.push(cells[Math.round(k * (cells.length - 1) / Math.max(1, n - 1))]);
    for (const c of picks) w.zones.push({ type: 'trap', owner: h, cell: c.i, x: c.x, y: c.y, r: TRAP.radius, t: TRAP.life, scale: TRAP.scale });
    const mine = w.zones.filter(z => z.type === 'trap' && z.owner === h);
    for (let k = 0; k < mine.length - TRAP.max; k++) mine[k].t = 0;
  } });
