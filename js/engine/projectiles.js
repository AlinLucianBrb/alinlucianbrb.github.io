/* Projectile types. A projectile has update(g, p, dt) -> false when finished, and optional onEnd(g, p). How it looks is decided by the renderer. */
export const BOLT_SPEED = 380;   /* pixels per second */
export const PROJECTILES = {
  /* Homing bolt: flies to its target and hits on arrival. If the target dies first, the bolt fizzles. */
  bolt: {
    update(g, p, dt) {
      const e = p.target;
      if (!e || e.dead) return false;
      const dx = e.x - p.x, dy = e.y - p.y, len = Math.hypot(dx, dy), step = (p.speed || BOLT_SPEED) * dt;
      if (len) { p.dx = dx / len; p.dy = dy / len; }
      if (len <= step + 6) { g.attack(p.owner, e, p.scale); return false; }
      p.x += p.dx * step; p.y += p.dy * step;
      return true;
    }
  },
  /* Commander's thrown sword: flies straight out to the Commander's range, hitting every enemy it passes once. */
  sword: {
    update(g, p, dt) {
      const step = 520 * dt;
      p.x += p.dx * step; p.y += p.dy * step; p.dist += step;
      for (const e of g.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        const ex = e.x - p.x, ey = e.y - p.y;
        if (ex * ex + ey * ey <= (e.def.radius + 10) ** 2) { p.hit.add(e); g.attack(p.owner, e, p.scale); }
      }
      return p.dist < p.max;
    }
  },
  /* Marksman's piercing shot: charges at the Ranger, then flies straight on, hitting every enemy it passes once. */
  pierce: {
    update(g, p, dt) {
      if (p.charge > 0) { p.charge -= dt; p.x = p.owner.x; p.y = p.owner.y; return true; }
      const step = 900 * dt;
      p.x += p.dx * step; p.y += p.dy * step; p.dist += step;
      for (const e of g.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        const ex = e.x - p.x, ey = e.y - p.y;
        if (ex * ex + ey * ey <= (e.def.radius + 8) ** 2) { p.hit.add(e); g.attack(p.owner, e, p.scale); }
      }
      return p.dist < p.max;
    }
  },
  /* Boomerang Ranger's spinning boomerang: circles the Ranger. All of one Ranger's spinning boomerangs share the circle,
     spaced evenly (two are opposite each other, three are a third of a turn apart). Each enemy is hit at most every 0.4 s. */
  orbit: {
    update(g, p, dt) {
      if ((p.t -= dt) <= 0) return false;
      const o = p.owner, mine = [];
      for (const q of g.projs) if (q.type === 'orbit' && q.owner === o && q.t > 0) mine.push(q);
      const idx = mine.indexOf(p);
      if (idx === 0) o.orbitA = (o.orbitA || 0) + 4 * dt;
      const a = (o.orbitA || 0) + idx * 2 * Math.PI / mine.length, r = Math.min(90, o.s.range * 0.45);
      p.x = o.x + Math.cos(a) * r; p.y = o.y + Math.sin(a) * r; p.rot += dt * 15;
      for (const [e, left] of p.hitT) { if (left - dt <= 0) p.hitT.delete(e); else p.hitT.set(e, left - dt); }
      for (const e of g.enemies) {
        if (e.dead || p.hitT.has(e)) continue;
        const ex = e.x - p.x, ey = e.y - p.y;
        if (ex * ex + ey * ey <= 256) { p.hitT.set(e, 0.4); g.attack(o, e, p.scale); }
      }
      return true;
    }
  },
  boomerang: {
    update(g, p, dt) {
      const step = 380 * (p.owner.s.speed || 1) * dt;   /* flies faster with attack speed, so attack-speed bonuses help it */
      if (p.out) {
        p.x += p.dx * step; p.y += p.dy * step; p.dist += step;
        if (p.dist >= p.max) { p.out = false; p.hit.clear(); }
      } else {
        const vx = p.owner.x - p.x, vy = p.owner.y - p.y, len = Math.hypot(vx, vy);
        if (len <= step) return false;
        p.x += vx / len * step; p.y += vy / len * step;
      }
      p.rot += dt * 15;
      for (const e of g.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy <= 256) { p.hit.add(e); g.attack(p.owner, e, p.scale); }
      }
      return true;
    },
    onEnd(g, p) { p.owner.proj = null; p.owner.cd = p.owner.s.cooldown / p.owner.s.speed; }
  }
};
export function updateProjectiles(g, dt) {
  const list = g.projs; let j = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], type = PROJECTILES[p.type];
    if (type.update(g, p, dt)) list[j++] = p; else if (type.onEnd) type.onEnd(g, p);
  }
  list.length = j;
}
