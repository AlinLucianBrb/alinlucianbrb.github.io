/* How a hero's attack turns into damage: split the hit by damage type, reduce it by the enemy's armor and resistances,
   apply it, then roll for ailments. Every attack in the game goes through attack(); damage over time goes through dotDamage().
   The rolls use the world's seeded 'combat' random stream, so replays stay exact. */
import { DAMAGE_TYPES, AILMENTS, RES_CAP, HOLY_RES_IGNORED } from '../content/combat.js';
import { DAMAGE_ROLL } from '../content/data.js';
import { applyEffect } from './effects.js';

/* How much of `amount` gets through, for one damage type. Armor (physical) and resistances (every other type) work the same
   way: a share of the damage blocked. Armor only stops hits, not damage over time.
   Shock and the Inquisitor's Purge lower armor and every resistance by the same percentage points, after the cap, so they
   always bite. s: the attacking hero's stats, for penetration (hits only): armorPen ignores a share of the armor,
   firePen... take points off that resistance, also after the cap. */
export function mitigate(e, type, amount, isHit = true, s = null) {
  if (amount <= 0) return 0;
  const shock = e.fx && e.fx.shock, purge = e.fx && e.fx.purge, down = (shock ? shock.resDown : 0) + (purge ? purge.resDown : 0);
  if (type === 'physical') {
    if (!isHit) return amount;
    const armor = Math.max(-1, Math.min(RES_CAP, e.armor || 0) * (s ? Math.max(0, 1 - (s.armorPen || 0)) : 1) - down);
    return amount * (1 - armor);
  }
  const pen = isHit && s ? (s[type + 'Pen'] || 0) + (s.resPen || 0) : 0;   /* resPen: strength's, on every resistance */
  let base = Math.min(RES_CAP, (e.res && e.res[type]) || 0);
  if (type === 'holy' && base > 0) base *= 1 - HOLY_RES_IGNORED;
  let r = Math.max(-1, base - down);
  r -= Math.min(pen, Math.max(0, r));   /* penetration ignores resistance; it never makes an enemy weak */
  return amount * (1 - r);
}

const raw = Object.fromEntries(DAMAGE_TYPES.map(t => [t, 0]));   /* reused for every hit: no garbage */

/* Critical hits: the hero's critChance, plus a Rogue's Mark on the enemy (more chance and more crit damage against it).
   Rolled once per hit on the seeded combat stream, and only when there is a chance, so heroes without crits use no rolls.
   rate < 1 (a beam's sliver per frame) scales the chance, like ailments. Returns the multiplier for this hit (1 or the crit's). */
export function critMult(w, hero, e, rate = 1, stats = null) {
  const s = stats || hero.s, mark = e.fx && e.fx.mark, chance = (s.critChance || 0) + (mark ? mark.chance : 0);
  if (!(chance > 0) || w.rng.combat.next() >= Math.min(1, chance) * rate) return 1;
  w.ev.emit('crit', { hero, enemy: e });
  return (s.critDamage || 1.5) + (mark ? mark.dmg : 0);
}

/* scale: multiplies the whole hit (ultimates, beam ramp, chain falloff). rate: how much of a "full hit" this is for ailment
   chances (a beam deals a sliver of damage every frame, so its rate is the frame time: its chances work per second).
   as: a damage type for this hit instead of the hero's own (the Alchemist's two concoctions: one fire, one toxic).
   stats: the attacker's stats if not the hero's own (a minion's, see minionStats). The hit is still credited to the hero.
   A hero's convert ({ holy: 0.3 }: the Paladin) turns that share of its own damage into another type. The Heretic's blood
   price (bloodPrice per life lost this run) makes every hit stronger. */
export function attack(w, hero, e, scale = 1, rate = 1, as = null, stats = null) {
  if (e.dead) return;
  const s = stats || hero.s, own = as || hero.def.damageType || 'physical', conv = !as && hero.def.convert;
  scale *= critMult(w, hero, e, rate, s);
  if (hero.def.bloodPrice) scale *= 1 + hero.def.bloodPrice * Math.max(0, (w.livesStart || 0) - w.lives);
  for (const t of DAMAGE_TYPES) raw[t] = (s[t + 'Damage'] || 0) * scale;
  /* Damage between a min and a max: each hit rolls within spread of the damage stat (one roll, on the combat stream). */
  let base = s.damage * scale * (DAMAGE_ROLL.on && s.spread > 0 ? 1 + s.spread * (2 * w.rng.combat.next() - 1) : 1);
  if (conv) for (const t in conv) { raw[t] += base * conv[t]; }
  if (conv) { let k = 1; for (const t in conv) k -= conv[t]; base *= Math.max(0, k); }
  raw[own] += base;
  let total = 0;
  for (const t of DAMAGE_TYPES) {
    if (raw[t] <= 0) continue;
    const got = mitigate(e, t, raw[t], true, s);
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
  if (ap) for (const id in ap) applyEffect(e, id, { t: s[ap[id]] }, hero);
  return total;
}

/* Kills an enemy that is not a boss and has less than `share` of its life left (Archangel, Inquisitor). The rest of its
   life is dealt as one last hit, credited to the hero. Returns true if it died. */
export function execute(w, hero, e, share) {
  if (e.dead || e.def.boss || e.hp > e.max * share) return false;
  w.hit(hero, e, e.hp, hero.def.damageType || 'physical');
  w.ev.emit('execute', { hero, enemy: e });
  return true;
}

/* Puts an ailment on an enemy, sized from the hit that caused it. */
export function inflict(w, hero, e, id, hit) {
  const a = AILMENTS[id];
  if (a.kind === 'dot') applyEffect(e, id, { t: a.duration, dps: a.dpsOfHit * hit, src: hero }, hero);
  else if (a.kind === 'shock') applyEffect(e, id, { t: a.duration, mag: a.resDown, resDown: a.resDown }, hero);
  else if (a.kind === 'freeze') applyEffect(e, id, { t: Math.min(a.max, a.base + a.perLifeShare * hit / e.max) }, hero);
  else if (a.kind === 'root') applyEffect(e, id, { t: a.duration }, hero);
  w.ev.emit('ailment', { hero, enemy: e, id });
}

/* Damage over time: resisted (but not stopped by armor), boosted by shock, credited to the hero that caused it. */
export function dotDamage(w, src, e, amount, type) {
  if (e.dead || amount <= 0) return;
  w.hit(src, e, mitigate(e, type, amount, false), type);
}
