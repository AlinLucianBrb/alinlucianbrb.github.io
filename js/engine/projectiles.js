/* Projectile types. A projectile has update(g, p, dt) -> false when finished, and optional onEnd(g, p). How it looks is decided by the renderer. */
export const PROJECTILES = {
  boomerang: {
    update(g, p, dt) {
      const step = 260 * dt;
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
