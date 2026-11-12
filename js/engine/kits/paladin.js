/* The Paladin: a heavy hammer swing, 30% of it Holy (convert on the hero), and Consecration. At level 10:
   - Heretic: a burning shadow flail that grows stronger with every life lost this run (bloodPrice); Heresy pays a life to
     empower every hero on the map;
   - Inquisitor: a long chain flail at the toughest enemy in range, stacking Verdict (+5% damage taken per stack, up to 10);
     Purge strips armor and resistances in range and executes the weak;
   - Crusader: mounted. His attack is a charge: he rides from his post onto the nearest stretch of path and down it toward
     the oncoming enemies, trampling and knocking back each one he passes, then rides back. Cavalry sends phantom riders
     down the whole path. */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget, pickStrongest } from '../behaviors.js';
import { registerUltimate } from '../ultimates.js';
import { PROJECTILES } from '../projectiles.js';
import { execute } from '../combat.js';
import { applyEffect, EFFECTS } from '../effects.js';
import { knockback, pathPos } from '../enemies.js';
import { T } from '../../content/data.js';
import { pulseZone } from './common.js';

/* ---- Paladin ---- */
export const CONSECRATION = { seconds: 5, radius: 70, every: 0.5, scale: 0.6 };
registerUltimate('consecration', { name: 'Consecration', desc: 'The ground around the Paladin turns holy for 5 seconds, burning the enemies on it.', damageMult: 1,
  onFire(w, h) { w.zones.push(pulseZone(h, h.x, h.y, { r: CONSECRATION.radius, t: CONSECRATION.seconds, every: CONSECRATION.every, scale: CONSECRATION.scale, as: 'holy', look: 'consecrate' })); } });

/* ---- Heretic ---- */
/* Heresy: every hero on the map deals +50% damage for 8 seconds; if the Heretic can pay a life for it, twice that (+100%).
   Ultimates fire by themselves, so the price is limited: each Heretic pays at most HERESY.maxPaid lives a match, and never
   at HERESY.minLives or fewer. In co-op the lives are everyone's. */
export const HERESY = { seconds: 8, minLives: 5, maxPaid: 3, mods: [{ stat: 'damage', type: 'more', value: 0.5 }], paid: [{ stat: 'damage', type: 'more', value: 1 }] };
registerUltimate('heresy', { buff: 'heresy', name: 'Heresy', desc: 'Every hero on the map deals +50% damage for 8 seconds, or +100% if he can pay 1 life for it (at most 3 lives a match, never at 5 or fewer).', damageMult: 1,
  onFire(w, h) {
    const pay = w.lives > HERESY.minLives && (h.heresyPaid || 0) < HERESY.maxPaid;
    if (pay) { w.lives -= 1; h.heresyPaid = (h.heresyPaid || 0) + 1; }
    for (const o of w.heroes) w.addBuff(o, 'heresy', pay ? 'Heresy (paid)' : 'Heresy', pay ? HERESY.paid : HERESY.mods, HERESY.seconds, h);
    w.ev.emit('heresy', { hero: h, paid: pay });
  } });

/* ---- Inquisitor ---- */
/* Verdict: each hit adds a stack on the enemy (up to 10, for 5 seconds after the last): +5% damage taken from everything. */
export const VERDICT = { seconds: 5 };
export function addVerdict(e, by = null) {
  const fx = (e.fx ||= {}), v = fx.verdict || (fx.verdict = { t: 0, n: 0 });
  v.n = Math.min(EFFECTS.verdict.maxStacks, v.n + 1); v.t = VERDICT.seconds * (by && by.s && by.s.duration || 1);
}
registerBehavior('verdict', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickStrongest(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      g.attack(t, tg, mult);
      if (!tg.dead) addVerdict(tg, t);
      g.fx?.beam(t.x, t.y - 6, tg.x, tg.y, 0.12, mult > 1 ? '#fff6c8' : 'rgba(200,200,190,.85)', mult > 1 ? 4 : 2);   /* the chain */
      g.fx?.slash(tg.x, tg.y, Math.atan2(tg.y - t.y, tg.x - t.x), Math.PI / 4, 18, 0.15, look(t, mult));
    }
    charge(g, t);
  }
});
/* Purge: every enemy in range loses 30 points of armor and of every resistance for 6 seconds; a non-boss under 15% life dies. */
export const PURGE = { seconds: 6, resDown: 0.3, execute: 0.15 };
registerUltimate('purge', { name: 'Purge', desc: 'Every enemy in range loses 30% armor and 30% resistances for 6 seconds; a non-boss under 15% life dies.', damageMult: 1,
  onFire(w, h) {
    const r2 = h.s.range * h.s.range;
    for (const e of [...w.enemies]) {
      if (e.dead || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > r2) continue;
      applyEffect(e, 'purge', { t: PURGE.seconds, resDown: PURGE.resDown }, h);
      execute(w, h, e, PURGE.execute);
    }
    w.fx?.slash(h.x, h.y, 0, Math.PI, h.s.range, 0.45, 'rgba(255,246,200,.35)');
  } });

/* ---- Crusader ---- */
/* The charge: ride from the post to the nearest point of the path within range, then along the path to the LAST enemy in
   range (the one furthest from the gate, so he tramples the whole group on the way; at most CHARGE.length), then back to
   his post. Every enemy within CHARGE.reach of the rider during the ride is hit once and knocked back.
   t.ride = { phase: 'out' | 'ride' | 'back', x, y, d, to, hit } while away. */
export const CHARGE = { speed: 260, length: 6 * T, reach: 24, knock: 0.75 * T };
/* The path point nearest a spot, as progress d in pixels (cached per hero tile). */
export function nearestPathD(g, x, y) {
  let best = 0, bd = Infinity;
  const p = { x: 0, y: 0 }, end = (g.path.length - 1.001) * T;
  for (let d = 0; d <= end; d += 4) { pathPos(g.path, d / T, p); const q = (p.x - x) ** 2 + (p.y - y) ** 2; if (q < bd) { bd = q; best = d; } }
  return { d: best, dist: Math.sqrt(bd) };
}
const rp = { x: 0, y: 0 };
registerBehavior('charge', {
  update(g, t, dt) {
    const r = t.ride;
    if (r) { ride(g, t, r, dt); return; }
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    if (t._pdAt !== t.cx + ',' + t.cy) { t._pdAt = t.cx + ',' + t.cy; t._pd = nearestPathD(g, t.x, t.y); }
    if (t._pd.dist > t.s.range) return;
    /* the last enemy in range: the furthest from the gate (smallest progress d) */
    let last = tg; const R2 = t.s.range * t.s.range;
    for (const e of g.enemies) if (!e.dead && !e.escaped && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= R2 && e.d < last.d) last = e;
    const mult = strike(g, t, last);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    pathPos(g.path, t._pd.d / T, rp);
    const end = (g.path.length - 1.001) * T, home = t._pd.d;
    const to = Math.max(0, Math.min(end, Math.max(home - CHARGE.length, Math.min(home + CHARGE.length, last.d))));   /* at most CHARGE.length either way */
    /* Standing on the path, he only ever rides along it: straight into the charge, and back the same way. */
    const onPath = !!g.pathSet && g.pathSet.has(t.cx + ',' + t.cy);
    t.ride = { phase: onPath ? 'ride' : 'out', onPath, home, x: onPath ? rp.x : t.x, y: onPath ? rp.y : t.y, d: home, to, tx: rp.x, ty: rp.y, hit: new Set(), mult, face: rp.x < t.x ? -1 : 1 };
    charge(g, t);
  }
});
function moveTo(r, x, y, step) {
  const dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy);
  if (Math.abs(dx) > 1) r.face = dx < 0 ? -1 : 1;
  if (d <= step) { r.x = x; r.y = y; return true; }
  r.x += dx / d * step; r.y += dy / d * step; return false;
}
function ride(g, t, r, dt) {
  const step = CHARGE.speed * dt;
  if (r.phase === 'out') { if (moveTo(r, r.tx, r.ty, step)) r.phase = 'ride'; return; }
  if (r.phase === 'back') {
    if (r.onPath) {                       /* back along the path to his tile */
      const before = r.x; r.d = r.d < r.home ? Math.min(r.home, r.d + step) : Math.max(r.home, r.d - step); pathPos(g.path, r.d / T, r);
      if (Math.abs(r.x - before) > 0.5) r.face = r.x < before ? -1 : 1;
      if (r.d === r.home) { t.ride = null; rearm(t); }
      return;
    }
    if (moveTo(r, t.x, t.y, step)) { t.ride = null; rearm(t); }
    return;
  }
  const before = r.x;
  r.d = r.to < r.d ? Math.max(r.to, r.d - step) : Math.min(r.to, r.d + step);   /* toward the last enemy, either way along the path */
  pathPos(g.path, r.d / T, r);
  if (Math.abs(r.x - before) > 0.5) r.face = r.x < before ? -1 : 1;
  const r2 = CHARGE.reach * CHARGE.reach;
  for (const e of g.enemies) {
    if (e.dead || r.hit.has(e) || (e.x - r.x) ** 2 + (e.y - r.y) ** 2 > r2) continue;
    r.hit.add(e);
    g.attack(t, e, r.mult);
    knockback(g, e, CHARGE.knock);
  }
  if (r.d === r.to) r.phase = 'back';
}
/* Cavalry: three phantom riders gallop the whole path from the gate back to the entrance, hitting every enemy once for 2x a
   hit and pushing it back 1.5 tiles. */
export const CAVALRY = { speed: 320, reach: 26, scale: 2, knock: 1.5 * T, riders: 3 };
registerUltimate('cavalry', { name: 'Cavalry', desc: 'Three phantom riders gallop the whole path from the gate to the entrance, hitting every enemy once and pushing it back.', damageMult: 1,
  onFire(w, h) { w.projs.push({ type: 'cavalry', owner: h, d: (w.path.length - 1.001) * T, x: 0, y: 0, hit: new Set() }); } });
PROJECTILES.cavalry = {
  update(g, p, dt) {
    p.d -= CAVALRY.speed * dt;
    if (p.d <= 0) return false;
    const px = p.x, py = p.y;
    pathPos(g.path, p.d / T, p);
    const len = Math.hypot(p.x - px, p.y - py);   /* the way it is going, for the riders behind (drawing only) */
    if (len > 0.01) { p.dx = (px - p.x) / len; p.dy = (py - p.y) / len; p.face = p.x < px ? -1 : 1; }
    const r2 = CAVALRY.reach * CAVALRY.reach;
    for (const e of g.enemies) {
      if (e.dead || p.hit.has(e) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
      p.hit.add(e); g.attack(p.owner, e, CAVALRY.scale, 1, 'holy'); knockback(g, e, CAVALRY.knock);
    }
    return true;
  }
};
