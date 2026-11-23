/* The Paladin: a heavy hammer swing, 30% of it Holy (convert on the hero), and Consecration. At level 15:
   - Heretic: a burning shadow flail that grows stronger with every life lost this run (bloodPrice); Heresy pays a life to
     empower every hero on the map;
   - Inquisitor: a long chain flail at the toughest enemy in range, stacking Verdict (+5% damage taken per stack, up to 10);
     Purge strips armor and resistances in range and executes the weak;
   - Crusader: a spear lunge through every enemy in a line, the toughest hit harder for each one; Spear throw pushes every
     enemy in range back along the path, and the ones that slam into a corner are stunned. */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget, pickStrongest, tough } from '../behaviors.js';
import { registerUltimate } from '../ultimates.js';
import { PROJECTILES } from '../projectiles.js';
import { execute } from '../combat.js';
import { applyEffect, EFFECTS, lasting } from '../effects.js';
import { knockback, KNOCKBACK } from '../enemies.js';
import { T } from '../../content/data.js';
import { pulseZone } from './common.js';
import { upgradeOf } from '../upgrades.js';

/* ---- Paladin ---- */
export const CONSECRATION = { seconds: 5, radius: 70, every: 0.5, scale: 0.6 };
registerUltimate('consecration', { name: 'Consecration', desc: 'The ground around the Paladin turns holy for {t:5}, burning the enemies on it.', damageMult: 1,
  onFire(w, h) { w.zones.push(pulseZone(h, h.x, h.y, { r: CONSECRATION.radius, t: lasting(h, CONSECRATION.seconds), every: CONSECRATION.every, scale: CONSECRATION.scale, as: 'holy', look: 'consecrate' })); } });

/* ---- Heretic ---- */
/* Heresy: every hero on the map deals +50% damage for 8 seconds; if the Heretic can pay a life for it, twice that (+100%).
   Ultimates fire by themselves, so the price is limited: each Heretic pays at most HERESY.maxPaid lives a match, and never
   at HERESY.minLives or fewer. In co-op the lives are everyone's. */
export const HERESY = { seconds: 8, minLives: 5, maxPaid: 3, mods: [{ stat: 'damage', type: 'more', value: 0.5 }], paid: [{ stat: 'damage', type: 'more', value: 1 }] };
registerUltimate('heresy', { buff: 'heresy', name: 'Heresy', desc: 'Every hero on the map deals +50% damage for {t:8}, or +100% if he can pay 1 life for it (at most 3 lives a match, never at 5 or fewer).', damageMult: 1,
  onFire(w, h) {
    const pay = w.lives > HERESY.minLives && (h.heresyPaid || 0) < HERESY.maxPaid;
    if (pay) { w.lives -= 1; h.heresyPaid = (h.heresyPaid || 0) + 1; }
    const creed = upgradeOf(h, 'heretic_ult');
    for (const o of w.heroes) {
      w.addBuff(o, 'heresy', pay ? 'Heresy (paid)' : 'Heresy', pay ? HERESY.paid : HERESY.mods, HERESY.seconds, h);
      if (creed) o.buffs.find(b => b.id === 'heresy').scorch = creed.chance;   /* Burning creed: any hit can burn (combat.js) */
    }
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
      const fork = upgradeOf(t, 'inquisitor_attack') && pickStrongest(g, t, t.s.range, tg);   /* Forked chain */
      for (const e of fork ? [tg, fork] : [tg]) {
        g.attack(t, e, mult);
        if (!e.dead) addVerdict(e, t);
        g.fx?.beam(t.x, t.y - 6, e.x, e.y, 0.12, mult > 1 ? '#fff6c8' : 'rgba(200,200,190,.85)', mult > 1 ? 4 : 2);   /* the chain */
        g.fx?.slash(e.x, e.y, Math.atan2(e.y - t.y, e.x - t.x), Math.PI / 4, 18, 0.15, look(t, mult));
      }
    }
    charge(g, t);
  }
});
/* Purge: every enemy in range loses 30 points of armor and of every resistance for 6 seconds; a non-boss under 15% life dies. */
export const PURGE = { seconds: 6, resDown: 0.3, execute: 0.15 };
registerUltimate('purge', { name: 'Purge', desc: 'Every enemy in range loses 30% armor and 30% resistances for {t:6}; a non-boss under 15% life dies.', damageMult: 1,
  onFire(w, h) {
    const r2 = h.s.range * h.s.range, guilty = upgradeOf(h, 'inquisitor_ult');
    for (const e of [...w.enemies]) {
      if (e.dead || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > r2) continue;
      applyEffect(e, 'purge', { t: PURGE.seconds, resDown: PURGE.resDown }, h);
      if (guilty) for (let k = 0; k < guilty.stacks; k++) addVerdict(e, h);
      execute(w, h, e, PURGE.execute);
    }
    w.fx?.slash(h.x, h.y, 0, Math.PI, h.s.range, 0.45, 'rgba(255,246,200,.35)');
  } });

/* ---- Crusader ---- */
/* The lunge: he thrusts his spear in a straight line at the target, as far as his range (Long spear: further), hitting every
   enemy along it. The toughest of them takes LUNGE.per more damage for each other enemy the spear went through. */
export const LUNGE = { width: 14, per: 0.2 };
/* The enemies on the line from (x, y), direction (dx, dy), length len, nearest first. */
export function onLine(g, x, y, dx, dy, len, width) {
  const out = [];
  for (const e of g.enemies) {
    if (e.dead) continue;
    const ex = e.x - x, ey = e.y - y, along = ex * dx + ey * dy;
    if (along < -e.def.radius || along > len + e.def.radius) continue;
    if (Math.abs(ex * dy - ey * dx) <= width + e.def.radius) out.push(e);
  }
  return out;
}
registerBehavior('lunge', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    if (mult === 0) { rearm(t); charge(g, t); return; }
    const long = upgradeOf(t, 'crusader_attack'), len = t.s.range * (long ? long.reach : 1);
    const d = Math.hypot(tg.x - t.x, tg.y - t.y) || 1, dx = (tg.x - t.x) / d, dy = (tg.y - t.y) / d;
    const hit = onLine(g, t.x, t.y, dx, dy, len, LUNGE.width);
    let top = null;
    for (const e of hit) if (!top || tough(e) > tough(top) || (tough(e) === tough(top) && e.hp > top.hp)) top = e;
    for (const e of hit) g.attack(t, e, e === top ? mult * (1 + LUNGE.per * (hit.length - 1)) : mult);
    g.fx?.beam(t.x, t.y - 4, t.x + dx * len, t.y + dy * len - 4, 0.14, mult > 1 ? '#fff6c8' : 'rgba(255,233,160,.8)', mult > 1 ? 6 : 3);   /* the thrust */
    g.fx?.shot?.(t, Math.atan2(dy, dx));
    rearm(t); charge(g, t);
  }
});
/* Spear throw: a spear flies into the toughest enemy within SPEAR.reach (4 tiles, twice his range); when it lands every enemy
   that close to him is pushed back along
   the path SPEAR.push (a boss less, see knockback). The path's corners and the entrance are walls: an enemy that slams into
   one before the push is over is stunned for the part of the push it missed (hits at once: SPEAR.stun, the longest) and
   takes damage only for the part it travelled (at least SPEAR.floor of it); one that hits no wall takes the full damage.
   Pinned (upgrade): those that hit a wall take double damage. */
export const SPEAR = { reach: 4 * T, push: 2.5 * T, stun: 1.5, scale: 4, floor: 0.2, speed: 700 };
/* How far an enemy can be pushed back before a wall: back along the path to the last corner behind it, or the entrance. */
export function wallRoom(g, e) {
  const p = g.path;
  for (let i = Math.min(p.length - 2, Math.floor(e.d / T + 1e-9)); i >= 1; i--) {
    const ax = p[i][0] - p[i - 1][0], ay = p[i][1] - p[i - 1][1], bx = p[i + 1][0] - p[i][0], by = p[i + 1][1] - p[i][1];
    if (ax !== bx || ay !== by) return Math.max(0, e.d - i * T);
  }
  return Math.max(0, e.d);
}
export function shove(g, h, e, pinned) {
  const boss = e.def.boss ? KNOCKBACK.boss : 1, want = SPEAR.push * boss, room = wallRoom(g, e);
  const wall = room < want, f = wall ? room / want : 1;
  g.attack(h, e, SPEAR.scale * Math.max(SPEAR.floor, f) * (wall && pinned ? pinned.times : 1));
  if (e.dead) return;
  knockback(g, e, (wall ? room : want) / boss);
  if (wall && f < 1) applyEffect(e, 'stun', { t: SPEAR.stun * (1 - f) }, h);
  if (wall) g.ev.emit('slam', { hero: h, enemy: e });
}
registerUltimate('spear', { name: 'Spear throw', desc: 'Throws a spear into the enemies, pushing every one within 4 tiles back 2.5 tiles for up to {4}. One that slams into a corner of the path is stunned instead: the sooner it hits, the longer the stun (up to {t:1.5}) and the less damage.', damageMult: 1,
  onFire(w, h, target) {
    const tg = pickStrongest(w, h, SPEAR.reach) || target;
    if (!tg) return;
    const d = Math.hypot(tg.x - h.x, tg.y - h.y) || 1;
    w.projs.push({ type: 'spear', owner: h, x: h.x, y: h.y, tx: tg.x, ty: tg.y, dx: (tg.x - h.x) / d, dy: (tg.y - h.y) / d, left: d });
  } });
PROJECTILES.spear = {
  update(g, p, dt) {
    const step = SPEAR.speed * dt;
    if (p.left > step) { p.left -= step; p.x += p.dx * step; p.y += p.dy * step; return true; }
    const h = p.owner, r2 = SPEAR.reach * SPEAR.reach, pinned = upgradeOf(h, 'crusader_ult');
    for (const e of [...g.enemies]) if (!e.dead && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= r2) shove(g, h, e, pinned);
    g.fx?.slash(p.tx, p.ty, 0, Math.PI, 40, 0.3, 'rgba(255,233,160,.6)');
    return false;
  }
};
