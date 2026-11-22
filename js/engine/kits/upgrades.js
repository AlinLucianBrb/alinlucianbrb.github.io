/* The level-30 upgrades that happen when a bolt hits or an enemy dies. The others live with the attack or ultimate they change
   (look for upgradeOf). The numbers are in js/content/upgrades.js. */
import { BOLT_HOOKS, KILL_HOOKS, around, nearest, upgradeOf } from '../upgrades.js';
import { inflict } from '../combat.js';
import { EFFECT_HOOKS } from '../effects.js';

/* Hits everything near the enemy a bolt struck (not that enemy again) for `scale` of the bolt's hit. */
const splash = (g, p, e, u) => {
  for (const o of around(g, e.x, e.y, u.radius, e)) g.attack(p.owner, o, p.scale * u.scale, 1, p.as || null);
};

/* Ranger: the arrow flies on to the nearest enemy ahead of it. */
BOLT_HOOKS.marksman_attack = (g, p, e, u) => {
  let best = null, bd = u.reach * u.reach;
  for (const o of g.enemies) {
    if (o.dead || o === e) continue;
    const dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy;
    if (d <= bd && dx * p.dx + dy * p.dy >= 0) { bd = d; best = o; }
  }
  if (best) g.projs.push({ ...p, target: best, x: e.x, y: e.y, child: true });
};
/* Poacher: a splash that also poisons. */
BOLT_HOOKS.hunter_attack = (g, p, e, u) => {
  for (const o of around(g, e.x, e.y, u.radius, e)) {
    g.attack(p.owner, o, p.scale * u.scale);
    if (!o.dead) inflict(g, p.owner, o, 'poison', p.owner.s.damage * p.scale * u.poison);
  }
};
/* Fire Mage, Alchemist: explosions around the target. */
BOLT_HOOKS.firemage_attack = (g, p, e, u) => { splash(g, p, e, u); g.ev?.emit('explode', { zone: { x: e.x, y: e.y } }); };
BOLT_HOOKS.alchemist_attack = (g, p, e, u) => { splash(g, p, e, u); g.fx?.slash(e.x, e.y, 0, Math.PI, u.radius, 0.2, p.as === 'toxic' ? 'rgba(122,208,75,.5)' : 'rgba(255,138,61,.5)'); };
/* Cold Mage: p.slowed is whether the enemy was slowed before this bolt (which slows it too). */
BOLT_HOOKS.coldmage_attack = (g, p, e, u) => {
  if (!e.dead && p.slowed && g.rng.combat.next() < u.chance) inflict(g, p.owner, e, 'freeze', p.owner.s.damage * p.scale);
};
/* Lightning Mage: from enemy to enemy. */
BOLT_HOOKS.lightningmage_attack = (g, p, e, u) => {
  const seen = new Set([e]);
  let from = e;
  for (let k = 0; k < u.jumps; k++) {
    const o = nearest(g, from.x, from.y, u.reach, seen);
    if (!o) return;
    seen.add(o);
    g.fx?.beam(from.x, from.y, o.x, o.y, 0.12, '#ffe45c', 3, from, o);
    g.attack(p.owner, o, p.scale * u.scale);
    from = o;
  }
};

/* Berserker: kills stretch Frenzy (h.frenzyMore: how much this one was stretched, reset when it is cast). */
KILL_HOOKS.berserker_ult = (w, h, e, u) => {
  const b = (h.buffs || []).find(x => x.id === 'frenzy' && x.t > 0);
  if (!b || (h.frenzyMore || 0) >= u.max) return;
  const more = Math.min(u.per, u.max - (h.frenzyMore || 0));
  b.t += more; h.frenzyMore = (h.frenzyMore || 0) + more;
};

/* Fire Mage's Wildfire: an enemy that dies with it explodes, hurting the enemies around it. */
EFFECT_HOOKS.death.wildfire = (w, e, f) => {
  const u = upgradeOf(f.src, 'firemage_ult');
  if (!u) return;
  for (const o of around(w, e.x, e.y, u.radius, e)) w.dot(f.src, o, f.src.s.damage * u.scale, 'fire');
  w.ev.emit('explode', { zone: { x: e.x, y: e.y } });
};
