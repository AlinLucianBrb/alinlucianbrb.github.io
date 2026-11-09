/* The Warlock: shadow bolts that Corrupt (shadow damage over time that grows with every stack), and Soul drain. At level 10:
   - Occult: an aura (js/engine/aura.js) that Hexes every enemy inside (+20% damage taken from everything, 15% slower); Doom
     makes Hexed enemies take +50% more and explode in shadow when they die;
   - Summoner: each cast summons an imp (up to 3, 10 s each) that throws small bolts; Demon gate brings a Greater Demon;
   - Infernalist: Hellfire, a fireball that bursts and leaves burning ground; burns jump to the next enemy when the burning
     one dies; Infernal crashes a meteor into the biggest group and leaves a burning golem there.
   Imps and the demon are minions: they fight with the Warlock's minion stats (t.ms) and their hits are credited to him. */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget, pickStrongest } from '../behaviors.js';
import { registerUltimate, gainEnergy } from '../ultimates.js';
import { ZONES } from '../zones.js';
import { EFFECT_HOOKS, applyEffect } from '../effects.js';
import { AILMENTS } from '../../content/combat.js';
import { pathPos } from '../enemies.js';
import { T } from '../../content/data.js';
import { pulseZone, lob } from './common.js';
import '../aura.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;

/* ---- Warlock ---- */
/* Soul drain: a beam on the toughest enemy in range for 2 seconds, 5x a hit in all; if it dies while drained, every hero
   within 150 px gains 20 energy. */
export const DRAIN = { seconds: 2, scale: 5, radius: 150, energy: 20 };
registerUltimate('souldrain', { name: 'Soul drain', desc: 'Drains the toughest enemy in range for 2 seconds (5x damage); if it dies, heroes nearby gain 20 energy.', damageMult: 1,
  onFire(w, h) {
    const tg = pickStrongest(w, h, h.s.range);
    if (tg) w.zones.push({ type: 'drain', owner: h, target: tg, x: tg.x, y: tg.y, t: DRAIN.seconds });
  } });
ZONES.drain = {
  update(g, z, dt) {
    const e = z.target, h = z.owner;
    if (e.dead) {
      for (const o of g.heroes) if (near(o, h, DRAIN.radius)) gainEnergy(o, DRAIN.energy);
      return false;
    }
    z.x = e.x; z.y = e.y;
    g.attack(h, e, DRAIN.scale / DRAIN.seconds * dt, dt);
    if (e.dead) for (const o of g.heroes) if (near(o, h, DRAIN.radius)) gainEnergy(o, DRAIN.energy);
    g.fx?.beam(h.x, h.y - 8, e.x, e.y, 0.05, 'rgba(154,92,214,.8)', 3);
    return (z.t -= dt) > 0 && !e.dead;
  }
};

/* ---- Occult ---- */
/* Doom: for 4 seconds the aura also Dooms the enemies inside (+50% damage taken; an enemy that dies Doomed explodes, dealing
   10% of its max life as shadow damage to the enemies within 50 px). */
export const DOOM = { seconds: 4, blast: 50, share: 0.1 };
registerUltimate('doom', { name: 'Doom', desc: 'For 4 seconds Hexed enemies take +50% more damage; any that die explode in shadow, hitting enemies around them.', damageMult: 1,
  onFire(w, h) { h.auraCurse = { id: 'doom', t: DOOM.seconds }; } });
EFFECT_HOOKS.death.doom = (w, e, f) => {
  const src = f.src || e.last;
  for (const o of w.enemies) if (o !== e && !o.dead && near(o, e, DOOM.blast)) w.dot(src, o, e.max * DOOM.share, 'shadow');
  w.ev.emit('explode', { zone: { x: e.x, y: e.y } });
};

/* ---- Summoner ---- */
/* Imps: each cast with an enemy in range summons one (the 4th replaces the oldest). An imp hovers by the Warlock's target
   and throws a bolt at the nearest enemy every IMP.every seconds (faster with cast speed and minion speed) for IMP.scale of a
   hit with the minion stats. */
export const IMP = { max: 3, life: 10, every: 1, scale: 0.55, reach: 110, speed: 140 };
/* The Greater Demon: walks to the enemies and cleaves everything within 40 px every 0.9 s for 2x a hit (minion stats). */
export const DEMON = { seconds: 8, every: 0.9, reach: 40, scale: 2, speed: 90 };
registerBehavior('imps', {
  update(g, t, dt) {
    const imps = (t.imps ||= []), tg = pickTarget(g, t, t.s.range), ms = t.ms || t.s, rate = (ms.castSpeed || 1);
    for (const imp of imps) {
      imp.t -= dt;
      const gx = tg ? tg.x + imp.ox : t.x + imp.ox, gy = tg ? tg.y - 30 + imp.oy : t.y - 26 + imp.oy, dx = gx - imp.x, dy = gy - imp.y, d = Math.hypot(dx, dy);
      if (d > 2) { const s = Math.min(d, IMP.speed * dt); imp.x += dx / d * s; imp.y += dy / d * s; if (Math.abs(dx) > 2) imp.face = dx < 0 ? -1 : 1; }
      if ((imp.cd -= dt) > 0) continue;
      let best = null, bd = IMP.reach * IMP.reach;
      for (const e of g.enemies) { if (e.dead) continue; const q = (e.x - imp.x) ** 2 + (e.y - imp.y) ** 2; if (q <= bd) { bd = q; best = e; } }
      if (!best) continue;
      imp.cd = IMP.every / rate;
      g.attack(t, best, IMP.scale, 1, null, ms);
      g.fx?.beam(imp.x, imp.y, best.x, best.y, 0.1, '#c46aff', 2);
    }
    for (let i = imps.length - 1; i >= 0; i--) if (imps[i].t <= 0) imps.splice(i, 1);
    updateDemon(g, t, dt, ms);
    if (!ready(t, dt)) return;
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      if (imps.length >= IMP.max) imps.shift();
      const k = g.rng.combat.int(6);   /* where it hovers around the target, on the seeded stream */
      imps.push({ x: t.x, y: t.y - 20, ox: (k - 2.5) * 12, oy: (k % 3) * 8, t: IMP.life, cd: 0.3, face: 1 });
    }
    charge(g, t);
  }
});
function updateDemon(g, t, dt, ms) {
  const d = t.demon;
  if (!d) return;
  if ((d.t -= dt) <= 0) { t.demon = null; return; }
  if (d.cleave > 0) d.cleave = Math.max(0, d.cleave - dt);
  const tg = pickTarget(g, t, t.s.range * 1.3);
  const gx = tg ? tg.x : t.x + 20, gy = tg ? tg.y : t.y + 14, dx = gx - d.x, dy = gy - d.y, dist = Math.hypot(dx, dy);
  if (dist > DEMON.reach * 0.6) { const s = Math.min(dist - DEMON.reach * 0.6, DEMON.speed * dt); d.x += dx / dist * s; d.y += dy / dist * s; }
  if (Math.abs(dx) > 2) d.face = dx < 0 ? -1 : 1;
  if ((d.cd -= dt) > 0 || !tg || dist > DEMON.reach) return;
  d.cd = DEMON.every / (ms.castSpeed || 1); d.cleave = 0.2;
  for (const e of g.enemies) if (!e.dead && near(e, d, DEMON.reach)) g.attack(t, e, DEMON.scale, 1, null, ms);
  g.fx?.slash(d.x, d.y, Math.atan2(dy, dx), Math.PI / 2, DEMON.reach, 0.2, '#ff5a3a');
}
registerUltimate('demongate', { name: 'Demon gate', desc: 'A Greater Demon steps out for 8 seconds and cleaves the enemies around it.', damageMult: 1,
  onFire(w, h, target) { h.demon = { x: target ? target.x : h.x, y: target ? target.y : h.y, t: DEMON.seconds, cd: 0.4, face: 1, cleave: 0 }; } });

/* ---- Infernalist ---- */
/* Hellfire: a fireball lobbed where the target will be; it bursts (a hit to everything within 40 px) and leaves burning ground
   for 2 seconds (a quarter of a hit every half second). The Infernalist always burns. */
export const HELLFIRE = { speed: 380, radius: 40, burst: 1, seconds: 2, every: 0.5, scale: 0.25 };
const aim = { x: 0, y: 0 };
registerBehavior('hellfire', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      const dur = Math.max(0.2, Math.hypot(tg.x - t.x, tg.y - t.y) / HELLFIRE.speed);
      pathPos(g.path, Math.min(g.path.length - 1.001, (tg.d + tg.speed * dur) / T), aim);
      g.projs.push(lob(t, aim.x, aim.y, HELLFIRE.speed, pulseZone(t, 0, 0, { r: HELLFIRE.radius, t: HELLFIRE.seconds, every: HELLFIRE.every,
        scale: HELLFIRE.scale * mult, burst: HELLFIRE.burst * mult, look: 'hellfire', boom: mult > 1 }), 'hellfire'));
    }
    charge(g, t);
  }
});
/* Contagion: when an enemy dies burning from an Infernalist's fire, the burn jumps to the nearest enemy within 70 px. */
export const CONTAGION = { reach: 70 };
EFFECT_HOOKS.death.burn = (w, e, f) => {
  if (!f.src || !f.src.def || !f.src.def.contagion) return;
  let best = null, bd = CONTAGION.reach * CONTAGION.reach;
  for (const o of w.enemies) { if (o.dead || o === e) continue; const q = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (q <= bd) { bd = q; best = o; } }
  if (best) { applyEffect(best, 'burn', { t: AILMENTS.burn.duration, dps: f.dps, src: f.src }); w.fx?.beam(e.x, e.y, best.x, best.y, 0.15, '#ff8a3d', 2); }
};
/* Infernal: a meteor falls on the biggest group in range (the enemy with the most others within 60 px) for 6x a hit, and a
   burning golem stands there for 6 seconds, scorching everything within 55 px for half a hit every half second. */
export const INFERNAL = { fall: 0.6, radius: 60, scale: 6, golem: 6, golemR: 55, every: 0.5, golemScale: 0.5 };
registerUltimate('infernal', { name: 'Infernal', desc: 'A meteor crashes into the biggest group of enemies (6x damage), then a burning golem stands there for 6 seconds.', damageMult: 1,
  onFire(w, h) {
    let best = null, most = -1;
    for (const e of w.enemies) {
      if (e.dead || !near(e, h, h.s.range)) continue;
      let n = 0; for (const o of w.enemies) if (!o.dead && near(o, e, INFERNAL.radius)) n++;
      if (n > most) { most = n; best = e; }
    }
    if (best) w.zones.push({ type: 'meteor', owner: h, x: best.x, y: best.y, r: INFERNAL.radius, t: INFERNAL.fall, life: INFERNAL.fall });
  } });
ZONES.meteor = {
  update(g, z, dt) {
    if ((z.t -= dt) > 0) return true;
    for (const e of g.enemies) if (!e.dead && near(e, z, z.r)) g.attack(z.owner, e, INFERNAL.scale);
    g.ev.emit('explode', { zone: z });
    g.zones.push(pulseZone(z.owner, z.x, z.y, { r: INFERNAL.golemR, t: INFERNAL.golem, every: INFERNAL.every, scale: INFERNAL.golemScale, look: 'golem' }));
    return false;
  }
};
