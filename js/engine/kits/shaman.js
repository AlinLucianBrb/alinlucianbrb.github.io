/* The Shaman: chain lightning (the chain behavior in behaviors.js) and Ancestral call (heroes nearby attack and cast faster).
   At level 10:
   - Witch Doctor: fast poison darts; each one Voodoo-links its target with up to 2 enemies near it for 4 seconds, and 30% of
     the damage any linked enemy takes is dealt to the others; Plague of locusts sends a swarm down the path;
   - Totemist: each cast plants a totem on a free grass tile near him (up to 3, 12 s each), in turn Flame, Frost and Storm;
     totems block that tile while they stand, and fight with his minion stats; Totem surge makes them all pulse;
   - Earthcaller: Fissure, a crack along the path behind the leading enemy that hits everyone on it and stuns them for a
     moment; Tectonic shift heaves the ground and pushes every enemy back (knockback, js/engine/enemies.js). */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget } from '../behaviors.js';
import { registerUltimate } from '../ultimates.js';
import { PROJECTILES } from '../projectiles.js';
import { ZONES } from '../zones.js';
import { inflict } from '../combat.js';
import { applyEffect, EFFECT_HOOKS } from '../effects.js';
import { knockback, pathPos } from '../enemies.js';
import { T, COLS, ROWS } from '../../content/data.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;

/* ---- Shaman ---- */
export const ANCESTRAL = { seconds: 6, mods: [{ stat: 'speed', type: 'inc', value: 0.25 }, { stat: 'castSpeed', type: 'inc', value: 0.25 }] };
registerUltimate('ancestral', { buff: 'ancestral', name: 'Ancestral call', desc: 'For 6 seconds, heroes within the Shaman\'s range (the Shaman too) attack and cast 25% faster.', damageMult: 1,
  onFire(w, h) {
    for (const o of w.heroes) if (near(o, h, h.s.range)) w.addBuff(o, 'ancestral', 'Ancestral call', ANCESTRAL.mods, ANCESTRAL.seconds, h);
    w.fx?.slash(h.x, h.y, 0, Math.PI, h.s.range, 0.5, 'rgba(122,208,224,.3)');
  } });

/* ---- Witch Doctor ---- */
/* Voodoo link: a group of enemies; damage to one passes 30% to each other linked enemy still in the group. */
export const LINK = { seconds: 4, others: 2, reach: 80, share: 0.3 };
export function voodoo(g, tg, by = null) {
  const grp = { members: [tg] };
  const others = g.enemies.filter(e => !e.dead && e !== tg && near(e, tg, LINK.reach)).sort((a, b) => ((a.x - tg.x) ** 2 + (a.y - tg.y) ** 2) - ((b.x - tg.x) ** 2 + (b.y - tg.y) ** 2) || b.d - a.d);
  grp.members.push(...others.slice(0, LINK.others));
  for (const m of grp.members) (m.fx ||= {}).link = { t: LINK.seconds * (by && by.s && by.s.duration || 1), grp };
  return grp;
}
EFFECT_HOOKS.damage.link = (w, hero, e, amount, type, f) => {
  for (const o of f.grp.members) if (o !== e && !o.dead && o.fx && o.fx.link && o.fx.link.grp === f.grp) w.hit(hero, o, amount * LINK.share, type, true);
};
/* The darts go to the enemy furthest along the path that is not linked yet, so the links spread; if every enemy in range is
   linked, to the first. */
function unlinked(g, t) {
  const r2 = t.s.range * t.s.range; let best = null;
  for (const e of g.enemies) {
    if (e.dead || (e.fx && e.fx.link && e.fx.link.t > 0) || (e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue;
    if (!best || e.d > best.d) best = e;
  }
  return best || pickTarget(g, t, t.s.range);
}
registerBehavior('darts', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = unlinked(g, t);
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      voodoo(g, tg, t);
      g.projs.push({ type: 'bolt', owner: t, target: tg, x: t.x, y: t.y, scale: mult, color: look(t, mult), size: mult > 1 ? 7 : 4, look: 'dart', speed: 640, dx: 1, dy: 0 });
    }
    charge(g, t);
  }
});
/* Plague of locusts: a swarm flies the whole path, from the gate back to the entrance, poisoning everything it passes (every
   enemy within 34 px, five times a second, as if hit for 0.75x by the Witch Doctor). */
export const LOCUSTS = { speed: 160, reach: 34, every: 0.2, scale: 0.75 };   /* a tick every 32 px: no enemy is skipped */
registerUltimate('locusts', { name: 'Plague of locusts', desc: 'A swarm flies the whole path, from the gate to the entrance, poisoning every enemy it passes.', damageMult: 1,
  onFire(w, h) { w.projs.push({ type: 'swarm', owner: h, d: (w.path.length - 1.001) * T, x: 0, y: 0, next: 0 }); } });
PROJECTILES.swarm = {
  update(g, p, dt) {
    if (p.d <= 0) return false;   /* reached the entrance */
    p.t = (p.t || 0) + dt;          /* time flying (the drawing's flutter) */
    p.d = Math.max(0, p.d - LOCUSTS.speed * dt);
    pathPos(g.path, p.d / T, p);
    if ((p.next -= dt) <= 0) {
      p.next = LOCUSTS.every;
      for (const e of g.enemies) if (!e.dead && near(e, p, LOCUSTS.reach)) inflict(g, p.owner, e, 'poison', p.owner.s.damage * LOCUSTS.scale);
    }
    return true;
  }
};

/* ---- Totemist ---- */
/* Totems: a zone on a grass tile that blocks it while it stands (zone.blocks). Kinds, in turn: Flame (a fire bolt at the
   nearest enemy every second, which burns), Frost (twice a second, slows everything within 70 px and chills it with a little
   cold damage), Storm (every 1.2 s, lightning to up to 3 enemies). They use the Totemist's minion stats. */
export const TOTEM = { max: 3, life: 12, reach: 110, kinds: ['flame', 'frost', 'storm'],
  flame: { every: 1, scale: 0.6 }, frost: { every: 0.5, scale: 0.15, radius: 70 }, storm: { every: 1.2, scale: 0.5, targets: 3 } };
/* Free grass tiles within 2 tiles of the hero, best first: next to the path, then nearest the hero. */
export function totemSpots(g, t) {
  const out = [];
  for (let cy = t.cy - 2; cy <= t.cy + 2; cy++) for (let cx = t.cx - 2; cx <= t.cx + 2; cx++) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || g.pathSet.has(cx + ',' + cy)) continue;
    if (g.heroes.some(h => h.cx === cx && h.cy === cy) || g.zones.some(z => z.blocks && z.cx === cx && z.cy === cy)) continue;
    const byPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.pathSet.has((cx + dx) + ',' + (cy + dy)));
    out.push({ cx, cy, rank: (byPath ? 0 : 100) + (cx - t.cx) ** 2 + (cy - t.cy) ** 2 });
  }
  return out.sort((a, b) => a.rank - b.rank || a.cy - b.cy || a.cx - b.cx);
}
registerBehavior('totems', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      /* A new totem only when one is missing (up to 3; a path preview keeps one): a kind that is not standing yet, taking
         them in turn after the last one placed (Flame, Frost, Storm, Flame...), so a Shaman on the Totemist path, who keeps
         one totem at a time, cycles through all three as each expires. */
      const mine = g.zones.filter(z => z.type === 'totem' && z.owner === t && z.t > 0);
      const spot = mine.length < (t.totemMax || TOTEM.max) && totemSpots(g, t)[0];
      if (spot) {
        const n = TOTEM.kinds.length, from = (t.lastTotem ?? -1) + 1;
        const turn = Array.from({ length: n }, (_, i) => TOTEM.kinds[(from + i) % n]);
        const kind = turn.find(k => !mine.some(z => z.kind === k)) || turn[0];
        t.lastTotem = TOTEM.kinds.indexOf(kind);
        g.zones.push({ type: 'totem', owner: t, kind, cx: spot.cx, cy: spot.cy, x: (spot.cx + 0.5) * T, y: (spot.cy + 0.5) * T, t: TOTEM.life, cd: 0.2, blocks: true, flash: 0 });
      }
    }
    charge(g, t);
  }
});
ZONES.totem = {
  update(g, z, dt) {
    if ((z.t -= dt) <= 0) return false;
    if (z.flash > 0) z.flash = Math.max(0, z.flash - dt);
    if (z.surge > 0 && (z.surgeT -= dt) <= 0) surgePulse(g, z);
    if ((z.cd -= dt) > 0) return true;
    const h = z.owner, ms = h.ms || h.s, rate = ms.castSpeed || 1, k = TOTEM[z.kind];
    z.cd = k.every / rate;
    if (z.kind === 'frost') {
      for (const e of g.enemies) if (!e.dead && near(e, z, k.radius)) { applyEffect(e, 'chill', { t: 0.6 }, h); g.attack(h, e, k.scale, 1, 'cold', ms); }
      return true;
    }
    const list = g.enemies.filter(e => !e.dead && near(e, z, TOTEM.reach)).sort((a, b) => ((a.x - z.x) ** 2 + (a.y - z.y) ** 2) - ((b.x - z.x) ** 2 + (b.y - z.y) ** 2) || b.d - a.d);
    if (!list.length) { z.cd = 0.1; return true; }
    if (z.kind === 'flame') {
      const e = list[0];
      g.attack(h, e, k.scale, 1, 'fire', ms); if (!e.dead) inflict(g, h, e, 'burn', ms.damage * k.scale);
      g.fx?.beam(z.x, z.y - 14, e.x, e.y, 0.1, '#ff8a3d', 3);
    } else {
      for (const e of list.slice(0, k.targets)) { g.attack(h, e, k.scale, 1, 'lightning', ms); g.fx?.beam(z.x, z.y - 16, e.x, e.y, 0.1, '#ffe45c', 2); }
    }
    z.flash = 0.15;
    return true;
  }
};
/* Totem surge: every totem of the Totemist stands its full time again and pulses 3 times, 0.35 s apart, each for 4x a hit
   (its element) on everything within 80 px. */
export const SURGE = { scale: 4, radius: 80, pulses: 3, gap: 0.35 };
const ELEMENT = { flame: 'fire', frost: 'cold', storm: 'lightning' };
function surgePulse(g, z) {
  const h = z.owner;
  for (const e of g.enemies) if (!e.dead && near(e, z, SURGE.radius)) g.attack(h, e, SURGE.scale, 1, ELEMENT[z.kind], h.ms || h.s);
  z.surge--; z.surgeT = SURGE.gap; z.flash = 0.3;
  g.fx?.slash(z.x, z.y, 0, Math.PI, SURGE.radius, 0.3, 'rgba(122,208,224,.35)');
}
registerUltimate('surge', { name: 'Totem surge', desc: 'Every totem stands its full time again and pulses 3 times around itself, {4} each.', damageMult: 1,
  onFire(w, h) {
    for (const z of w.zones) {
      if (z.type !== 'totem' || z.owner !== h || z.t <= 0) continue;
      z.t = TOTEM.life; z.surge = SURGE.pulses;
      surgePulse(w, z);
    }
  } });

/* ---- Earthcaller ---- */
/* Fissure: the ground cracks along the path from the leading enemy in range back FISSURE.length toward the entrance; every
   enemy on that stretch takes a hit and is stunned for 0.25 s. */
export const FISSURE = { length: 2 * T, stun: 0.15, show: 0.45 };   /* stun 0.25 s before Nov 12 */
registerBehavior('fissure', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const lead = pickTarget(g, t, t.s.range);
    if (!lead) return;
    const mult = strike(g, t, lead);
    rearm(t);
    if (mult !== 0) {
      const d1 = lead.d + 4, d0 = Math.max(0, lead.d - FISSURE.length);
      /* the crack's points along the path, a little jagged (drawing only) */
      const pts = [], q = { x: 0, y: 0 };
      for (let d = d0, i = 0; d <= d1; d += 6, i++) { pathPos(g.path, d / T, q); pts.push([q.x + Math.sin(i * 2.1) * 3, q.y + Math.cos(i * 1.7) * 3]); }
      g.zones.push({ type: 'fissure', owner: t, d0, d1, x: lead.x, y: lead.y, t: FISSURE.show, life: FISSURE.show, pts });
      for (const e of g.enemies) {
        if (e.dead || e.d < d0 || e.d > d1) continue;
        g.attack(t, e, mult);
        if (!e.dead) applyEffect(e, 'stun', { t: FISSURE.stun }, t);
      }
    }
    charge(g, t);
  }
});
ZONES.fissure = { update: (g, z, dt) => (z.t -= dt) > 0 };   /* only drawn */
/* Tectonic shift: every enemy on the map takes 2x a hit and is pushed back 2.25 tiles (bosses 35% of it; no enemy more
   than 3 tiles a wave, see KNOCKBACK). */
export const TECTONIC = { scale: 2, knock: 2.25 * T };   /* knockbacks 50% stronger (Nov 12): was 1.5 tiles */
registerUltimate('tectonic', { name: 'Tectonic shift', desc: 'The ground heaves: every enemy on the map takes {2} and is pushed back 2.25 tiles.', damageMult: 1,
  onFire(w, h) {
    for (const e of [...w.enemies]) { if (e.dead) continue; w.attack(h, e, TECTONIC.scale); knockback(w, e, TECTONIC.knock); }
    w.ev.emit('tectonic', { hero: h });
  } });
