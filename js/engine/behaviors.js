/* Hero behaviors, one per hero "kind". Each has update(g, hero, dt) and reads only the hero's cached stats (hero.s).
   Behaviors never touch the DOM or the economy: they deal damage through g.hit() and draw through g.fx?.beam(). */
export const BEHAVIORS = {};
export const registerBehavior = (kind, impl) => { BEHAVIORS[kind] = impl; };

export function pickTarget(g, t, range) {
  const r2 = range * range; let best = null;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx * dx + dy * dy <= r2 && (!best || e.d > best.d)) best = e;
  }
  return best;
}
/* Up to n targets in range, furthest along the path first. Fills and returns the shared scratch array. */
const scratch = [];
export function pickTargets(g, t, range, n) {
  scratch.length = 0;
  const r2 = range * range;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx * dx + dy * dy > r2) continue;
    let i = scratch.length;
    while (i > 0 && scratch[i - 1].d < e.d) i--;
    if (i < n) { scratch.splice(i, 0, e); if (scratch.length > n) scratch.pop(); }
  }
  return scratch;
}
const ready = (t, dt) => (t.cd -= dt) <= 0;
const rearm = t => { t.cd = t.s.cooldown / t.s.speed; };

registerBehavior('swing', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const ang = Math.atan2(tg.y - t.y, tg.x - t.x), half = Math.min(Math.PI, t.s.arc * Math.PI / 360), r2 = t.s.range * t.s.range;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ang);
      if (da > Math.PI) da = 2 * Math.PI - da;
      if (da <= half) g.hit(t, e, t.s.damage);
    }
    rearm(t);
    g.fx?.slash(t.x, t.y, ang, half, t.s.range, 0.2, t.def.color);
  }
});

registerBehavior('shot', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const n = Math.round(t.s.targets || 1);
    if (n > 1) {
      const list = pickTargets(g, t, t.s.range, n);
      if (!list.length) return;
      for (const tg of list) { g.hit(t, tg, t.s.damage); g.fx?.beam(t.x, t.y, tg.x, tg.y, 0.08, t.def.color); }
      rearm(t); return;
    }
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    g.hit(t, tg, t.s.damage); rearm(t);
    g.fx?.beam(t.x, t.y, tg.x, tg.y, 0.08, t.def.color);
  }
});

registerBehavior('beam', {
  update(g, t, dt) {
    const r = t.s.range;
    let tg = t.lock;
    if (!(tg && !tg.dead && (tg.x - t.x) ** 2 + (tg.y - t.y) ** 2 <= r * r)) { tg = pickTarget(g, t, r); t.lock = tg; t.ramp = 0; }
    if (!tg) return;
    t.ramp += dt * t.s.rampRate;
    const k = Math.min(3, t.ramp);
    g.hit(t, tg, t.s.damage * (1 + k) * dt);
    g.fx?.beam(t.x, t.y, tg.x, tg.y, 0.12, t.def.color, 2 + k * 1.5);
  }
});

registerBehavior('boom', {
  update(g, t, dt) {
    if (t.proj || !ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const a = Math.atan2(tg.y - t.y, tg.x - t.x);
    t.proj = { type: 'boomerang', owner: t, x: t.x, y: t.y, dx: Math.cos(a), dy: Math.sin(a), dist: 0, max: t.s.range, out: true, hit: new Set(), damage: t.s.damage, rot: 0 };
    g.projs.push(t.proj);
  }
});

registerBehavior('chain', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    let cur = pickTarget(g, t, t.s.range);
    if (!cur) return;
    const seen = new Set(), jr2 = (t.s.range * 0.8) ** 2, jumps = Math.round(t.s.jumps);
    let px = t.x, py = t.y, d = t.s.damage;
    for (let j = 0; j <= jumps && cur; j++) {
      seen.add(cur); g.hit(t, cur, d); d *= 0.85;
      g.fx?.beam(px, py, cur.x, cur.y, 0.12, t.def.color);
      px = cur.x; py = cur.y;
      let next = null, nd = jr2;
      for (const e of g.enemies) {
        if (e.dead || seen.has(e)) continue;
        const dx = e.x - px, dy = e.y - py, dd = dx * dx + dy * dy;
        if (dd <= nd) { nd = dd; next = e; }
      }
      cur = next;
    }
    rearm(t);
  }
});
