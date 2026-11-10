/* Damage types, defenses and ailments, Path of Exile style. This is the data; the rules are in js/engine/combat.js.
   Every hero deals its own damage type (damageType on the hero, physical by default) and can gain added damage of any type.
   Enemies can have armor (less physical damage from small hits, less from big ones relatively) and resistances (a flat % per type). */
/* arcane is plain magic (the Mage's; it used to be called spell): no ailment comes from it, and enemies can resist it like any other type.
   holy (Priest, Paladin): no ailment, but it ignores half of the enemy's resistance (HOLY_RES_IGNORED): the enemies are demons.
   shadow (Warlock, Heretic): its ailment is Corruption, damage over time that grows with every stack. */
export const DAMAGE_TYPES = ['physical', 'arcane', 'fire', 'cold', 'lightning', 'toxic', 'holy', 'shadow'];
export const DAMAGE_LABEL = { physical: 'Physical', arcane: 'Arcane', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', toxic: 'Toxic', holy: 'Holy', shadow: 'Shadow' };
export const DAMAGE_COLOR = { physical: '#c7ced6', arcane: '#c39bf2', fire: '#ff8a3d', cold: '#8fd3ff', lightning: '#ffe45c', toxic: '#7ad04b', holy: '#fff0a8', shadow: '#9a5cd6' };
export const HOLY_RES_IGNORED = 0.5;

export const RES_CAP = 0.99;          /* resistances never block more than 99% (endless mode will need the room) */
export const ARMOR_FACTOR = 5;        /* armor blocks armor / (armor + 5 x hit) of a physical hit... */
export const ARMOR_CAP = 0.99;        /* ...up to 99% */

/* Ailments a hit can inflict. The chance comes from the hero stat <id>Chance (0 to 1); only hits that carry one of the `from`
   damage types can inflict it, and its strength is based on that part of the hit.
   - dot: damage over time, dpsOfHit x the hit per second for `duration` seconds, of damage type `type`.
     stacks: false keeps only the strongest one; true keeps up to maxStacks at once (poison).
   - shock: lowers the enemy's defenses for `duration` seconds: armor by armorDown (a share) and every resistance by resDown
     (percentage points, so an enemy with no resistance takes extra damage from non-physical hits).
   - freeze: the enemy stops; a bigger hit (relative to its max life) freezes it for longer.
   - root: the enemy is held in place for `duration` seconds; any damage type can root (the Druid's thorny bolts).
   - corruption (shadow): stacks like poison, and every stack makes each stack's damage `ramp` stronger (10 stacks: x2). */
export const AILMENTS = {
  bleed:  { name: 'Bleed',  kind: 'dot', from: ['physical'], type: 'physical', dpsOfHit: 0.7, duration: 4, stacks: false, tint: '#9c2a2a' },
  poison: { name: 'Poison', kind: 'dot', from: ['physical', 'toxic'], type: 'toxic', dpsOfHit: 0.3, duration: 2, stacks: true, maxStacks: 20, tint: '#7ad04b' },
  burn:   { name: 'Burn',   kind: 'dot', from: ['fire'], type: 'fire', dpsOfHit: 0.9, duration: 4, stacks: false, tint: '#ff8a3d' },
  shock:  { name: 'Shock',  kind: 'shock', from: ['lightning'], armorDown: 0.5, resDown: 0.2, duration: 2, tint: '#ffe45c' },
  freeze: { name: 'Freeze', kind: 'freeze', from: ['cold'], base: 0.3, perLifeShare: 2, max: 1.5, tint: '#d8f2ff' },
  root:   { name: 'Root',   kind: 'root', from: DAMAGE_TYPES, duration: 1, tint: '#8a9a4b' },
  corruption: { name: 'Corruption', kind: 'dot', from: ['shadow'], type: 'shadow', dpsOfHit: 0.25, duration: 3, stacks: true, maxStacks: 10, ramp: 0.1, tint: '#7a3fb0' }
};

/* Combat stats every hero has, all 0 to start, so talents, relics and items can raise them:
   added damage per hit of each type, and the chance to inflict each ailment. */
/* Penetration (hits only, not damage over time): armorPen ignores that share of the enemy's armor; firePen, coldPen and
   lightningPen take that many points off the enemy's resistance (after the cap, like shock). */
export const PEN_TYPES = ['fire', 'cold', 'lightning'];
export const COMBAT_STATS = {
  armorPen: 0, ...Object.fromEntries(PEN_TYPES.map(t => [t + 'Pen', 0])),
  ...Object.fromEntries(DAMAGE_TYPES.map(t => [t + 'Damage', 0])),
  ...Object.fromEntries(Object.keys(AILMENTS).map(a => [a + 'Chance', 0]))
};
export const COMBAT_LABELS = {
  armorPen: 'Armor penetration', ...Object.fromEntries(PEN_TYPES.map(t => [t + 'Pen', DAMAGE_LABEL[t] + ' penetration'])),
  ...Object.fromEntries(DAMAGE_TYPES.map(t => [t + 'Damage', 'Added ' + DAMAGE_LABEL[t].toLowerCase() + ' damage'])),
  ...Object.fromEntries(Object.entries(AILMENTS).map(([id, a]) => [id + 'Chance', a.name + ' chance']))
};
