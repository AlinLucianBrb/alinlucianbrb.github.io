/* The Priest: a support caster. Smite (a bolt of light) and Blessing (nearby heroes +30% damage); at level 10 she becomes
   - Incantation: an aura (js/engine/aura.js) that burns enemies and speeds up the heroes inside; Crescendo widens and
     strengthens it;
   - Archangel: a lance of light that pierces a line; she can stand on the path; Judgement executes the toughest enemy;
   - Gospel: each Psalm gives energy to the heroes around her; Sanctuary turns back the first enemy to reach the gate each
     wave; Conversion turns the toughest enemy into a spirit that walks back down the path striking its old allies. */
import { registerBehavior, ready, rearm, strike, charge, look, pickTarget, pickStrongest, targetCount, pickTargets } from '../behaviors.js';
import { registerUltimate, gainEnergy } from '../ultimates.js';
import { PROJECTILES } from '../projectiles.js';
import { ZONES } from '../zones.js';
import { execute } from '../combat.js';
import { LEAK_GUARDS, pathPos } from '../enemies.js';
import { T } from '../../content/data.js';
import '../aura.js';

/* ---- Priest ---- */
export const BLESSING = { seconds: 5, mods: [{ stat: 'damage', type: 'more', value: 0.3 }] };
registerUltimate('blessing', { buff: 'blessing', name: 'Blessing', desc: 'Heroes within the Priest\'s range, the Priest too, deal +30% damage for 5 seconds.', damageMult: 1,
  onFire(w, h) {
    const r2 = h.s.range * h.s.range;
    for (const o of w.heroes) if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= r2) w.addBuff(o, 'blessing', 'Blessing', BLESSING.mods, BLESSING.seconds, h);
    w.fx?.slash(h.x, h.y, 0, Math.PI, h.s.range, 0.5, 'rgba(255,240,168,.3)');
  } });

/* ---- Incantation ---- */
/* The aura's blessing (Hymn, +15% attack and cast speed) is set on the form in data.js; Crescendo is the ultimate. */
export const CRESCENDO = { seconds: 5, radius: 2, damage: 3 };
registerUltimate('crescendo', { active: h => !!(h.auraBoost && h.auraBoost.t > 0), name: 'Crescendo', desc: 'For 5 seconds the aura is twice as wide and deals triple damage.', damageMult: 1,
  onFire(w, h) { h.auraBoost = { t: CRESCENDO.seconds, radius: CRESCENDO.radius, damage: CRESCENDO.damage }; } });

/* ---- Archangel ---- */
/* A lance of light: flies straight out to the Archangel's range and a little beyond, hitting every enemy it passes once. */
PROJECTILES.lance = { update: (g, p, dt) => PROJECTILES.sword.update(g, p, dt) };
registerBehavior('lance', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const tg = pickTarget(g, t, t.s.range);
    if (!tg) return;
    const mult = strike(g, t, tg);
    rearm(t);
    if (mult !== 0) {
      const len = Math.hypot(tg.x - t.x, tg.y - t.y) || 1;
      g.projs.push({ type: 'lance', owner: t, x: t.x, y: t.y - 8, dx: (tg.x - t.x) / len, dy: (tg.y - t.y + 8) / len, dist: 0, max: t.s.range + 30,
        hit: new Set(), scale: mult, color: look(t, mult) });
    }
    charge(g, t);
  }
});
/* Judgement: a giant blade falls on the toughest enemy in range for 8x a hit; a non-boss left under 25% of its life dies. */
export const JUDGEMENT = { scale: 8, execute: 0.25, show: 0.5 };
registerUltimate('judgement', { name: 'Judgement', desc: 'A giant blade falls on the toughest enemy in range for {8}. A non-boss left under 25% life dies.', damageMult: 1,
  onFire(w, h) {
    const tg = pickStrongest(w, h, h.s.range);
    if (!tg) return;
    w.zones.push({ type: 'judgement', owner: h, x: tg.x, y: tg.y, r: 26, t: JUDGEMENT.show, life: JUDGEMENT.show });
    w.attack(h, tg, JUDGEMENT.scale);
    execute(w, h, tg, JUDGEMENT.execute);
  } });
ZONES.judgement = { update: (g, z, dt) => (z.t -= dt) > 0 };   /* only drawn */

/* ---- Gospel ---- */
/* Psalm: bolts of light like Smite; every attack gives PSALM.energy to each other hero within PSALM.radius of the Priest. */
export const PSALM = { energy: 3, radius: 100 };
registerBehavior('psalm', {
  update(g, t, dt) {
    if (!ready(t, dt)) return;
    const first = pickTarget(g, t, t.s.range);
    if (!first) return;
    const n = targetCount(g, t), list = n > 1 ? pickTargets(g, t, t.s.range, n) : [first];
    const mult = strike(g, t, list[0]);
    rearm(t);
    if (mult !== 0) for (const tg of list) g.projs.push({ type: 'bolt', owner: t, target: tg, x: t.x, y: t.y, scale: mult, color: look(t, mult),
      size: mult > 1 ? 8 : 5, look: t.def.projLook || 'orb', speed: t.def.projSpeed || 0, dx: 1, dy: 0 });
    const r2 = PSALM.radius * PSALM.radius;
    for (const o of g.heroes) if (o !== t && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 <= r2) gainEnergy(o, PSALM.energy);
    charge(g, t);
  }
});
/* Sanctuary: once per wave, the first enemy (not a boss) that would reach the gate is turned back to the entrance. */
LEAK_GUARDS.push((g, e) => {
  if (e.def.boss) return false;
  const h = g.heroes.find(x => x.def.sanctuary && x.sanctuaryWave !== g.wave);
  if (!h) return false;
  h.sanctuaryWave = g.wave; e.d = 0;
  g.ev.emit('sanctuary', { hero: h, enemy: e });
  return true;
});
/* Conversion: the toughest enemy in range that is not a boss is converted: it leaves the fight (it counts as defeated, with
   its gold) and its spirit walks back down the path toward the entrance for 6 seconds, striking every enemy it meets. */
export const CONVERSION = { seconds: 6, speed: 45, every: 0.4, reach: 24, scale: 1.2 };
registerUltimate('conversion', { name: 'Conversion', desc: 'The toughest enemy in range (not a boss) turns and walks back down the path for 6 seconds, striking every enemy it meets.', damageMult: 1,
  onFire(w, h) {
    let tg = null;
    const r2 = h.s.range * h.s.range;
    for (const e of w.enemies) if (!e.dead && !e.def.boss && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= r2 && (!tg || e.hp > tg.hp)) tg = e;
    if (!tg) return;
    w.projs.push({ type: 'spirit', owner: h, enemy: tg.type, d: tg.d, x: tg.x, y: tg.y, t: CONVERSION.seconds, next: 0 });
    w.hit(h, tg, tg.hp, 'holy');
  } });
PROJECTILES.spirit = {
  update(g, p, dt) {
    if ((p.t -= dt) <= 0) return false;
    p.d = Math.max(0, p.d - CONVERSION.speed * dt);
    pathPos(g.path, p.d / T, p);
    if ((p.next -= dt) <= 0) {
      p.next = CONVERSION.every;
      const r2 = CONVERSION.reach * CONVERSION.reach;
      for (const e of g.enemies) if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r2) g.attack(p.owner, e, CONVERSION.scale, 1, 'holy');
    }
    return p.d > 0;
  }
};
