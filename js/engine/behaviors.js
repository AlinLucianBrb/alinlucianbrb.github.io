/* Hero behaviors, one per hero "kind". Each has update(g, hero, dt) and reads only the hero's cached stats (hero.s).
   Behaviors never touch the DOM or the economy: they attack through g.attack(hero, enemy, scale, rate), which handles damage
   types, armor, resistances and ailments (combat.js), and draw through g.fx?.beam().
   Every attack follows the same pattern: strike(g, t) right before it (the ultimate when the energy bar is full, see
   ultimates.js), then charge(g, t) once it has hit something. */
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
/* How many targets this attack hits: the whole part of the targets stat, plus a chance of one more from the rest
   (Split bolt gives a 15% chance per Common copy). Rolls only when there is a fraction, on the seeded combat stream. */
export function targetCount(g, t) {
  const n = t.s.targets || 1, whole = Math.floor(n + 1e-9), rest = n - whole;
  return Math.max(1, whole + (rest > 1e-9 && g.rng && g.rng.combat.next() < rest ? 1 : 0));
}
const ready = (t, dt) => (t.cd -= dt) <= 0;
const rearm = t => { t.cd = t.s.cooldown / t.s.speed; };
/* Damage multiplier for this attack: 1, or the ultimate's when the bar is full (0 when the ultimate replaces the attack).
   Worlds without energy (old tests) give 1. */
const strike = (g, t, target) => (g.attackMult ? g.attackMult(t, target) : 1);
/* Fills the energy bar after an attack, unless that attack fired the ultimate. */
const charge = (g, t) => { if (t.ultNow) { t.ultNow = false; return; } if (g.gainEnergy) g.gainEnergy(t); };
/* Ultimates look different: brighter and thicker. */
const look = (t, mult) => (mult > 1 ? '#fff6c8' : t.def.color);

/* One swing: hits every enemy inside the arc and range, facing the target. */
function swingAt(g, t, tg, mult, ttl) {
  const ang = Math.atan2(tg.y - t.y, tg.x - t.x), half = Math.min(Math.PI, t.s.arc * Math.PI / 360), r2 = t.s.range * t.s.range;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx * dx + dy * dy > r2) continue;
    let da = Math.abs(Math.atan2(dy, dx) - ang);
    if (da > Math.PI) da = 2 * Math.PI - da;
    if (da <= half) g.attack(t, e, mult);
  }
  g.fx?.slash(t.x, t.y, ang, half, t.s.range, ttl, look(t, mult));
}

registerBehavior('swing', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    swingAt(g, t, tg, mult, mult > 1 ? 0.35 : 0.2);
    rearm(t); charge(g, t);
  }
});

/* Berserker: two swings in quick succession (the second 0.15 s after the first). Together they count as one attack for energy. */
export const DOUBLE_SWING_GAP = 0.15;
registerBehavior('doubleswing', {
  update(g, t, dt) {
    if (t.second > 0 && (t.second -= dt) <= 0) {
      const tg = pickTarget(g, t, t.s.range);
      if (tg) swingAt(g, t, tg, t.secondMult || 1, 0.16);
    }
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    swingAt(g, t, tg, mult, 0.16);
    t.second = DOUBLE_SWING_GAP; t.secondMult = mult;
    rearm(t); charge(g, t);
  }
});

/* Commander: launches the sword in a straight line toward the target, out to its range, hitting every enemy in the way once. */
registerBehavior('launch', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    const len = Math.hypot(tg.x - t.x, tg.y - t.y) || 1;
    g.projs.push({ type: 'sword', owner: t, x: t.x, y: t.y, dx: (tg.x - t.x) / len, dy: (tg.y - t.y) / len, dist: 0, max: t.s.range + 20,
      hit: new Set(), scale: mult, color: look(t, mult) });
    rearm(t); charge(g, t);
  }
});

/* A real projectile: a bolt flies to its target and hits on arrival (see projectiles.js). With more than one target
   (Split bolt) it fires one bolt at each. */
registerBehavior('bolt', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const first = pickTarget(g, t, t.s.range);
    if (!first) return;
    const n = targetCount(g, t), list = n > 1 ? pickTargets(g, t, t.s.range, n) : [first];
    const mult = strike(g, t, list[0]), color = look(t, mult);
    if (mult === 0) { rearm(t); charge(g, t); return; }   /* the ultimate replaced this attack */
    for (const tg of list) g.projs.push({ type: 'bolt', owner: t, target: tg, x: t.x, y: t.y, scale: mult, color, size: mult > 1 ? 8 : 5,
      look: t.def.projLook || 'orb', speed: t.def.projSpeed || 0, dx: 1, dy: 0 });
    rearm(t); charge(g, t);
  }
});

registerBehavior('shot', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    if (!pickTarget(g, t, t.s.range)) return;
    const n = targetCount(g, t);
    if (n > 1) {
      const list = pickTargets(g, t, t.s.range, n);
      if (!list.length) return;
      const mult = strike(g, t);
      for (const tg of list) { g.attack(t, tg, mult); g.fx?.beam(t.x, t.y, tg.x, tg.y, mult > 1 ? 0.16 : 0.08, look(t, mult), mult > 1 ? 6 : 3); }
      rearm(t); charge(g, t); return;
    }
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t);
    g.attack(t, tg, mult); rearm(t); charge(g, t);
    g.fx?.beam(t.x, t.y, tg.x, tg.y, mult > 1 ? 0.16 : 0.08, look(t, mult), mult > 1 ? 6 : 3);
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
    /* A beam has no separate attacks: it gains energy over time while burning, and the ultimate doubles one second of it. */
    if (!t.ultT && g.attackMult && t.energy >= t.s.energyMax) { strike(g, t); t.ultT = 1; }
    const mult = t.ultT > 0 ? 2 : 1;
    if (t.ultT > 0) t.ultT = Math.max(0, t.ultT - dt); else if (g.gainEnergy) g.gainEnergy(t, t.s.energyPerAttack * dt);
    g.attack(t, tg, (1 + k) * dt * mult, dt);
    g.fx?.beam(t.x, t.y, tg.x, tg.y, 0.12, t.def.color, 2 + k * 1.5);
  }
});

registerBehavior('boom', {
  update(g, t, dt) {
    if (t.proj || !ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const a = Math.atan2(tg.y - t.y, tg.x - t.x), mult = strike(g, t, tg);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    t.proj = { type: 'boomerang', owner: t, x: t.x, y: t.y, dx: Math.cos(a), dy: Math.sin(a), dist: 0, max: t.s.range, out: true, hit: new Set(), scale: mult, rot: 0 };
    g.projs.push(t.proj); charge(g, t);
  }
});

registerBehavior('chain', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    let cur = pickTarget(g, t, t.s.range);
    if (!cur) return;
    const seen = new Set(), jr2 = (t.s.range * 0.8) ** 2, jumps = Math.round(t.s.jumps), mult = strike(g, t);
    let px = t.x, py = t.y, d = mult;   /* d scales the hit: 15% weaker each jump */
    for (let j = 0; j <= jumps && cur; j++) {
      seen.add(cur); g.attack(t, cur, d); d *= 0.85;
      g.fx?.beam(px, py, cur.x, cur.y, 0.12, look(t, mult));
      px = cur.x; py = cur.y;
      let next = null, nd = jr2;
      for (const e of g.enemies) {
        if (e.dead || seen.has(e)) continue;
        const dx = e.x - px, dy = e.y - py, dd = dx * dx + dy * dy;
        if (dd <= nd) { nd = dd; next = e; }
      }
      cur = next;
    }
    rearm(t); charge(g, t);
  }
});
