/* Pieces several hero kits share.
   - pulse zone: hits every enemy inside every `every` seconds for `scale` of its owner's hit (of damage type `as` if set),
     after an optional one-off `burst` when it appears. Consecration, Hellfire's burning ground and the Infernal golem are
     pulse zones; `look` tells the renderer which.
   - lob projectile: arcs from (sx, sy) to (tx, ty) in `dur` seconds and puts the zone it carries (`zone`) where it lands
     (Hellfire). The renderer draws it by `look`. */
import { ZONES } from '../zones.js';
import { PROJECTILES } from '../projectiles.js';

ZONES.pulse = {
  update(g, z, dt) {
    const r2 = z.r * z.r;
    if (z.burst) {
      for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) g.attack(z.owner, e, z.burst, 1, z.as || null);
      z.burst = 0;
      if (z.boom) g.ev.emit('explode', { zone: z });
    }
    z.t -= dt; z.next -= dt;
    if (z.next <= 0 && z.t > 0) {
      z.next += z.every;
      for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) g.attack(z.owner, e, z.scale, 1, z.as || null);
    }
    return z.t > 0;
  }
};
export const pulseZone = (owner, x, y, o) => ({ type: 'pulse', owner, x, y, next: 0, life: o.t, ...o });

PROJECTILES.lob = {
  update(g, p, dt) {
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
    if (k < 1) return true;
    g.zones.push({ ...p.zone, x: p.tx, y: p.ty });
    return false;
  }
};
export const lob = (owner, tx, ty, speed, zone, look) =>
  ({ type: 'lob', owner, x: owner.x, y: owner.y, sx: owner.x, sy: owner.y, tx, ty, t: 0, dur: Math.max(0.2, Math.hypot(tx - owner.x, ty - owner.y) / speed), zone, look });
