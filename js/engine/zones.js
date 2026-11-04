/* Zones: areas on the map that act on their own for a while, such as the Lightning Mage's storm.
   A zone is { type, owner, x, y, r, t (seconds left), ... }; each type has update(g, zone, dt) -> false when it is over.
   To add one: add a type here and push a zone from an ultimate (ultimates.js) or a behavior. */
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
          g.fx?.beam(e.x + 6, e.y - 70, e.x, e.y, 0.12, '#ffe45c', 3);
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

export function updateZones(g, dt) {
  const list = g.zones; if (!list || !list.length) return;
  let j = 0;
  for (let i = 0; i < list.length; i++) if (ZONES[list[i].type].update(g, list[i], dt)) list[j++] = list[i];
  list.length = j;
}
