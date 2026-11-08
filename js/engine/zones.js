/* Zones: areas on the map that act on their own for a while, such as the Lightning Mage's storm.
   A zone is { type, owner, x, y, r, t (seconds left), ... }; each type has update(g, zone, dt) -> false when it is over.
   To add one: add a type here and push a zone from an ultimate (ultimates.js) or a behavior. */
import { inflict } from './combat.js';
import { applyEffect } from './effects.js';
import { OIL } from './ultimates.js';
export const ZONES = {
  /* Strikes every enemy inside the circle every `every` seconds, for `scale` of the owner's hit (which can shock). */
  storm: {
    update(g, z, dt) {
      z.t -= dt; z.next -= dt;
      if (z.next <= 0) {
        z.next += z.every;
        const r2 = z.r * z.r;
        for (const e of g.enemies) {
          if (e.dead) continue;
          const dx = e.x - z.x, dy = e.y - z.y;
          if (dx * dx + dy * dy > r2) continue;
          g.attack(z.owner, e, z.scale);
          if (g.fx?.strike) g.fx.strike(e.x, e.y); else g.fx?.beam(e.x + 6, e.y - 70, e.x, e.y, 0.12, '#ffe45c', 3);   /* a bolt from the sky */
        }
      }
      return z.t > 0;
    }
  }
};

/* Hunter's trap: waits on the path; when an enemy steps on it, it bursts, hitting every enemy within r for `scale` hits. */
ZONES.trap = {
  update(g, z, dt) {
    if ((z.t -= dt) <= 0) return false;
    let stepped = false;
    for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= 14 * 14) { stepped = true; break; }
    if (!stepped) return true;
    const r2 = z.r * z.r;
    for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) g.attack(z.owner, e, z.scale);
    g.ev.emit('trap', { zone: z });
    g.fx?.slash(z.x, z.y, 0, Math.PI, z.r, 0.3, '#7ad04b');
    return false;
  }
};

/* Sentinel's barricade: blocks the path at progress d (see updateEnemies in enemies.js) until it runs out. */
ZONES.barrier = { update(g, z, dt) { return (z.t -= dt) > 0; } };

/* Toxicologist's puddle of poison: once a second, poisons every enemy in it, as if hit by the Toxicologist. */
ZONES.poisonpool = {
  update(g, z, dt) {
    z.t -= dt; z.next -= dt;
    if (z.next <= 0) {
      z.next += z.every;
      const r2 = z.r * z.r;
      for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) inflict(g, z.owner, e, 'poison', z.owner.s.damage);
    }
    return z.t > 0;
  }
};

/* Alchemist's flammable puddle: slows every enemy in it to half speed; a burning enemy in it makes it explode (3x a fire hit
   to everything within the blast radius), and the puddle is gone. */
ZONES.oil = {
  update(g, z, dt) {
    if ((z.t -= dt) <= 0) return false;
    const r2 = z.r * z.r;
    let boom = false;
    for (const e of g.enemies) {
      if (e.dead || (e.x - z.x) ** 2 + (e.y - z.y) ** 2 > r2) continue;
      applyEffect(e, 'oiled', { t: 0.2 });
      if (e.fx && e.fx.burn) boom = true;
    }
    if (!boom) return true;
    const b2 = OIL.blast * OIL.blast;
    for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= b2) g.attack(z.owner, e, OIL.scale, 1, 'fire');
    g.ev.emit('explode', { zone: z });
    g.fx?.slash(z.x, z.y, 0, Math.PI, OIL.blast, 0.35, '#ff9f43');
    return false;
  }
};

export function updateZones(g, dt) {
  const list = g.zones; if (!list || !list.length) return;
  let j = 0;
  for (let i = 0; i < list.length; i++) if (ZONES[list[i].type].update(g, list[i], dt)) list[j++] = list[i];
  list.length = j;
}
