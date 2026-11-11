/* The role of each evolution form, for the balance report: how it is judged.
   - damage:  it kills things itself. Power = half how far it gets alone, half its team value over every team.
   - semi:    it deals damage, but much of its worth is in what it does for the others (Verdict stacks, Heresy, Rally,
              Psalm energy, Hymn, Voodoo link). Power = a quarter alone, three quarters its value as a partner.
   - support: no damage of its own (the Occult). Power = its value as a partner, nothing else.
   "Value as a partner" is its team value in the teams where the other two are strong (the top third), measured against
   the other forms in that same spot, so a multiplier is judged where a player would use it. Forms not listed are damage.
   Change a form's role here; nothing else needs to change. */
export const ROLES = {
  occult: 'support',
  inquisitor: 'semi', commander: 'semi', heretic: 'semi', gospel: 'semi', incantation: 'semi', witchdoctor: 'semi'
};
export const roleOf = form => ROLES[form] || 'damage';
/* How much of power comes from playing alone, per role; the rest is team value (damage: over every team; semi and
   support: as a partner). */
export const SOLO_WEIGHT = { damage: 0.5, semi: 0.25, support: 0 };
