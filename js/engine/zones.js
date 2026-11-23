/* Zones: areas on the map that act on their own for a while, such as the Lightning Mage's storm.
   A zone is { type, owner, x, y, r, t (seconds left), ... }; each type has update(g, zone, dt) -> false when it is over.
   To add one: add a type here and push a zone from an ultimate (ultimates.js) or a behavior. */
import { inflict } from './combat.js';
import { applyEffect, lasting } from './effects.js';
import { OIL } from './ultimates.js';
import { upgradeOf, around } from './upgrades.js';
export const ZONES = {
  /* Strikes every enemy inside the circle every `every` seconds, for `scale` of the owner's hit (which can shock). */
  storm: {
    update(g, z, dt) {
      z.t -= dt; z.next -= dt;
      if (z.follow) {   /* Chasing storm: drifts to the leading enemy */
        let lead = null;
        for (const e of g.enemies) if (!e.dead && (!lead || e.d > lead.d)) lead = e;
        if (lead) { const dx = lead.x - z.x, dy = lead.y - z.y, d = Math.hypot(dx, dy), s = Math.min(d, z.follow * dt); if (d > 0) { z.x += dx / d * s; z.y += dy / d * s; } }
      }
      if (z.next <= 0) {
        z.next += z.every;
        const r2 = z.r * z.r;
        for (const e of g.enemies) {
          if (e.dead) continue;
          const dx = e.x - z.x, dy = e.y - z.y;
          if (dx * dx + dy * dy > r2) continue;
          g.attack(z.owner, e, z.scale);
          if (g.fx?.strike) g.fx.strike(e.x, e.y); else g.fx?.beam(e.x + 6, e.y - 70, e.x, e.y, 0.12, '#ffe45c', 3);   /* a bolt from the sky */
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
    if (z.pool) g.zones.push({ type: 'poisonpool', owner: z.owner, x: z.x, y: z.y, r: z.pool.radius, t: lasting(z.owner, z.pool.seconds), next: 0, every: 1, small: true });
    g.ev.emit('trap', { zone: z });
    g.fx?.slash(z.x, z.y, 0, Math.PI, z.r, 0.3, '#7ad04b');
    return false;
  }
};

/* Sentinel's barricade: blocks the path at progress d (see updateEnemies in enemies.js) until it runs out. */
ZONES.barrier = { update(g, z, dt) {
  if ((z.t -= dt) > 0) return true;
  if (z.burst) {   /* Shattering wall */
    for (const e of around(g, z.x, z.y, z.burst.radius)) g.attack(z.owner, e, z.burst.scale);
    g.ev.emit('explode', { zone: z });
  }
  return false;
} };

/* Toxicologist's puddle of poison: once a second, poisons every enemy in it, as if hit by the Toxicologist. */
ZONES.poisonpool = {
  update(g, z, dt) {
    z.t -= dt; z.next -= dt;
    const spread = !z.small && upgradeOf(z.owner, 'toxicologist_ult');
    if (spread) {   /* Outbreak: whoever was in it and is dead now leaves a smaller puddle (which does not spread further) */
      for (const e of z.in || []) if (e.dead && !e.escaped) g.zones.push({ type: 'poisonpool', owner: z.owner, x: e.x, y: e.y, r: spread.radius, t: lasting(z.owner, spread.seconds), next: 0, every: z.every, small: true });
      z.in = around(g, z.x, z.y, z.r);
    }
    if (z.next <= 0) {
      z.next += z.every;
      const r2 = z.r * z.r;
      for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) inflict(g, z.owner, e, 'poison', z.owner.s.damage);
    }
    return z.t > 0;
  }
};

/* Alchemist's flammable puddle: slows every enemy in it to half speed; a burning enemy in it makes it explode (3x a fire hit
   to everything within the blast radius), and the puddle is gone. */
ZONES.oil = {
  update(g, z, dt) {
    if ((z.t -= dt) <= 0) return false;
    const r2 = z.r * z.r;
    let boom = false;
    for (const e of g.enemies) {
      if (e.dead || (e.x - z.x) ** 2 + (e.y - z.y) ** 2 > r2) continue;
      applyEffect(e, 'oiled', { t: 0.2 }, z.owner);
      if (e.fx && e.fx.burn) boom = true;
    }
    if (!boom) return true;
    const b2 = OIL.blast * OIL.blast;
    for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= b2) g.attack(z.owner, e, OIL.scale, 1, 'fire');
    const scorch = upgradeOf(z.owner, 'alchemist_ult');   /* burning ground */
    if (scorch) g.zones.push({ type: 'pulse', owner: z.owner, x: z.x, y: z.y, next: 0, r: scorch.radius, t: lasting(z.owner, scorch.seconds), life: lasting(z.owner, scorch.seconds), every: scorch.every, scale: scorch.scale, as: 'fire', look: 'hellfire' });
    g.ev.emit('explode', { zone: z });
    g.fx?.slash(z.x, z.y, 0, Math.PI, OIL.blast, 0.35, '#ff9f43');
    return false;
  }
};

/* Naturist Druid's thorns: every `every` seconds, hits each enemy standing in the patch for `scale` of a hit. spikeT is only
   for drawing the eruption (see SPIKES in ultimates.js). */
ZONES.thorns = {
  update(g, z, dt) {
    z.t -= dt; z.next -= dt;
    if (z.spikeT > 0) z.spikeT = Math.max(0, z.spikeT - dt);
    if (z.next <= 0 && z.t > 0) {
      z.next += z.every;
      const r2 = z.r * z.r;
      const snare = upgradeOf(z.owner, 'naturist_attack');
      for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) { g.attack(z.owner, e, z.scale); if (snare) applyEffect(e, 'snared', { t: snare.seconds }, z.owner); }
    }
    return z.t > 0 || z.spikeT > 0;
  }
};

/* Lunar Druid's moon: falls for `fall` seconds, then smashes everything within r for `scale` hits of the Druid's cold damage. */
ZONES.moonfall = {
  update(g, z, dt) {
    if ((z.t -= dt) > 0) return true;
    const r2 = z.r * z.r;
    for (const e of g.enemies) if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) g.attack(z.owner, e, z.scale);
    g.ev.emit('moonfall', { zone: z });
    return false;
  }
};

export function updateZones(g, dt) {
  const list = g.zones; if (!list || !list.length) return;
  let j = 0;
  for (let i = 0; i < list.length; i++) if (ZONES[list[i].type].update(g, list[i], dt)) list[j++] = list[i];
  list.length = j;
}
