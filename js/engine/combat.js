/* How a hero's attack turns into damage: split the hit by damage type, reduce it by the enemy's armor and resistances,
   apply it, then roll for ailments. Every attack in the game goes through attack(); damage over time goes through dotDamage().
   The rolls use the world's seeded 'combat' random stream, so replays stay exact. */
import { DAMAGE_TYPES, AILMENTS, RES_CAP, ARMOR_FACTOR, ARMOR_CAP } from '../content/combat.js';
import { applyEffect, damageTakenMult } from './effects.js';

/* How much of `amount` gets through, for one damage type. Armor only stops hits, not damage over time. */
export function mitigate(e, type, amount, isHit = true) {
  if (amount <= 0) return 0;
  let out = amount;
  if (type === 'physical') {
    if (isHit && e.armor > 0) out *= 1 - Math.min(ARMOR_CAP, e.armor / (e.armor + ARMOR_FACTOR * amount));
  } else {
    const r = Math.max(-1, Math.min(RES_CAP, (e.res && e.res[type]) || 0));
    out *= 1 - r;
  }
  return out * damageTakenMult(e);
}

const raw = Object.fromEntries(DAMAGE_TYPES.map(t => [t, 0]));   /* reused for every hit: no garbage */

/* scale: multiplies the whole hit (ultimates, beam ramp, chain falloff). rate: how much of a "full hit" this is for ailment
   chances (a beam deals a sliver of damage every frame, so its rate is the frame time: its chances work per second). */
export function attack(w, hero, e, scale = 1, rate = 1) {
  if (e.dead) return;
  const s = hero.s, own = hero.def.damageType || 'physical';
  for (const t of DAMAGE_TYPES) raw[t] = (s[t + 'Damage'] || 0) * scale;
  raw[own] += s.damage * scale;
  let total = 0;
  for (const t of DAMAGE_TYPES) {
    if (raw[t] <= 0) continue;
    const got = mitigate(e, t, raw[t]);
    raw[t] = got; total += got;
    w.hit(hero, e, got, t);
    if (e.dead) return;
  }
  /* Ailments: only if the hero has a chance and the hit carried a damage type that can cause it. */
  for (const id in AILMENTS) {
    const chance = s[id + 'Chance'];
    if (!(chance > 0)) continue;
    const a = AILMENTS[id];
    let part = 0;
    for (const t of a.from) part += raw[t];
    if (part <= 0) continue;
    if (w.rng.combat.next() >= Math.min(1, chance) * rate) continue;
    inflict(w, hero, e, id, part / rate);
  }
  /* Older on-hit effects from hero data (the archived Frost Mage's slow). */
  const ap = hero.def.applies;
  if (ap) for (const id in ap) applyEffect(e, id, { t: s[ap[id]] });
  return total;
}

/* Puts an ailment on an enemy, sized from the hit that caused it. */
export function inflict(w, hero, e, id, hit) {
  const a = AILMENTS[id];
  if (a.kind === 'dot') applyEffect(e, id, { t: a.duration, dps: a.dpsOfHit * hit, src: hero });
  else if (a.kind === 'shock') applyEffect(e, id, { t: a.duration, mag: a.damageTaken });
  else if (a.kind === 'freeze') applyEffect(e, id, { t: Math.min(a.max, a.base + a.perLifeShare * hit / e.max) });
  w.ev.emit('ailment', { hero, enemy: e, id });
}

/* Damage over time: resisted (but not stopped by armor), boosted by shock, credited to the hero that caused it. */
export function dotDamage(w, src, e, amount, type) {
  if (e.dead || amount <= 0) return;
  w.hit(src, e, mitigate(e, type, amount, false), type);
}
