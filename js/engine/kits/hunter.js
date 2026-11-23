/* The Hunter's Ranger form (data: the 'ranger' hero, form 'marksman'). The Hunter himself fires homing arrows ('bolt') and his
   ultimate is Piercing shot (ultimates.js).
   - The Ranger's arrows fly straight at the target and on, through every enemy in their way (one hit each), to a little
     past his range. Gathering force (upgrade): each enemy an arrow goes through makes it stronger for the next.
   - Ricochet ring (his ultimate): a ring on the toughest enemy in range for 2.5 seconds. While it is up he shoots into it;
     an arrow that flies into the ring cannot leave: it bounces off the edge, faster each time, hitting the enemies inside
     again and again (each one at most every RING.rehit s), until the ring ends. Wide ring (upgrade): twice as big, 4 s. */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget, pickTargets, targetCount, pickStrongest } from '../behaviors.js';
import { registerUltimate } from '../ultimates.js';
import { PROJECTILES } from '../projectiles.js';
import { ZONES } from '../zones.js';
import { lasting } from '../effects.js';
import { upgradeOf } from '../upgrades.js';
import { ricochet } from '../legend-perks.js';

export const LINE = { speed: 620, past: 60, reach: 8 };   /* px/s; how far past the range it flies; hit width beside the enemy */
export const RING = { seconds: 2.5, radius: 50, faster: 1.2, maxSpeed: 1800, rehit: 0.2 };
const SUB = 10;   /* px per movement sub-step, so a fast arrow neither skips an enemy nor jumps out of the ring */

/* His live ring, if any (the newest). */
export const ringOf = (g, h) => { let r = null; for (const z of g.zones) if (z.type === 'ricochet' && z.owner === h && z.t > 0) r = z; return r; };

function loose(g, t, x, y, mult) {
  const dx = x - t.x, dy = y - t.y, len = Math.hypot(dx, dy) || 1;
  g.projs.push({ type: 'line', owner: t, x: t.x, y: t.y, dx: dx / len, dy: dy / len, speed: LINE.speed, dist: 0, max: t.s.range + LINE.past,
    hit: new Set(), scale: mult, color: look(t, mult), size: mult > 1 ? 8 : 5, look: t.def.projLook || 'arrow', as: null, age: 0 });
}

registerBehavior('line', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const first = pickTarget(g, t, t.s.range);
    if (!first) return;
    const mult = strike(g, t, first);   /* may fire the ring, which the arrows then aim at */
    if (mult === 0) { rearm(t); charge(g, t); return; }
    const ring = ringOf(g, t);
    if (ring) loose(g, t, ring.x, ring.y, mult);
    else {
      const n = targetCount(g, t), list = n > 1 ? [...pickTargets(g, t, t.s.range, n)] : [first];
      for (const tg of list) loose(g, t, tg.x, tg.y, mult);
    }
    const aim = ring || first;
    g.fx?.shot?.(t, Math.atan2(aim.y - t.y, aim.x - t.x));
    rearm(t); charge(g, t);
  }
});

PROJECTILES.line = {
  update(g, p, dt) {
    p.age += dt;
    let rest = p.speed * dt;
    while (rest > 0) {
      const step = Math.min(rest, SUB); rest -= step;
      p.x += p.dx * step; p.y += p.dy * step;
      const z = p.ring;
      if (z) {
        if (z.t <= 0) return false;                     /* the ring is gone, and its arrows with it */
        const ox = p.x - z.x, oy = p.y - z.y, d = Math.hypot(ox, oy);
        if (d > z.r) {                                   /* off the edge: back in, faster */
          const nx = ox / d, ny = oy / d, dot = p.dx * nx + p.dy * ny;
          p.dx -= 2 * dot * nx; p.dy -= 2 * dot * ny;
          p.x = z.x + nx * (z.r - 0.5); p.y = z.y + ny * (z.r - 0.5);
          p.speed = Math.min(RING.maxSpeed, p.speed * RING.faster);
        }
      } else {
        p.dist += step;
        if (p.dist > p.max) return false;
        for (const r of g.zones) if (r.type === 'ricochet' && r.owner === p.owner && r.t > 0 && (p.x - r.x) ** 2 + (p.y - r.y) ** 2 <= r.r * r.r) { p.ring = r; p.hitT = new Map(); break; }
      }
      for (const e of g.enemies) {
        if (e.dead) continue;
        const ex = e.x - p.x, ey = e.y - p.y, rr = e.def.radius + LINE.reach;
        if (ex * ex + ey * ey > rr * rr) continue;
        if (p.ring) {
          const last = p.hitT.get(e);
          if (last !== undefined && p.age - last < RING.rehit) continue;
          p.hitT.set(e, p.age);
          g.attack(p.owner, e, p.scale);
        } else {
          if (p.hit.has(e)) continue;
          p.hit.add(e);
          g.attack(p.owner, e, p.scale);
          ricochet(g, p, e);
          const u = upgradeOf(p.owner, 'marksman_attack');
          if (u) p.scale *= 1 + u.more;                  /* Gathering force */
        }
      }
    }
    return true;
  }
};

/* The ring itself does nothing but last; the arrows bounce inside it. */
ZONES.ricochet = { update(g, z, dt) { z.t -= dt; return z.t > 0; } };

registerUltimate('ricochet', { name: 'Ricochet ring', desc: 'A ring on the toughest enemy in range for {t:2.5}. He shoots into it, and his arrows cannot leave: they bounce off its edge, faster each time, hitting the enemies inside again and again.', damageMult: 1,
  onFire(w, h, target) {
    const tg = pickStrongest(w, h, h.s.range) || target;
    if (!tg) return;
    const u = upgradeOf(h, 'marksman_ult');
    w.zones.push({ type: 'ricochet', owner: h, x: tg.x, y: tg.y, r: RING.radius * (u ? u.radius : 1), t: lasting(h, u ? u.seconds : RING.seconds), life: lasting(h, u ? u.seconds : RING.seconds) });
  } });
