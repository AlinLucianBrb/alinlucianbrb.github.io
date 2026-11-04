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

export function updateZones(g, dt) {
  const list = g.zones; if (!list || !list.length) return;
  let j = 0;
  for (let i = 0; i < list.length; i++) if (ZONES[list[i].type].update(g, list[i], dt)) list[j++] = list[i];
  list.length = j;
}
