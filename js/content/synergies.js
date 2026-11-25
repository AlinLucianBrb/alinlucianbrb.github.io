/* Synergies between heroes, through damage types and debuffs (no named hero pairs): what one hero puts on an enemy makes
   another kind of damage hit it harder. The engine side is js/engine/synergy.js.

   The ring: each damage type has one debuff that opens enemies to it. An enemy with any of RING[type] takes RING_MORE more
   from that type's part of every hit (not from damage over time). Every type is opened by a debuff of another type, so a
   lineup can chain them: the Druid's roots open enemies to lightning, the Shaman's lightning shocks, shock opens them to
   arcane.

   The level-30 passives (js/content/upgrades.js, slot 'passive') use the same debuffs: a hero hits harder, or inflicts
   more, on an enemy that already carries something. A passive can be { vs, more } (+more against an enemy with any of vs),
   { per, perStack, max } (+perStack for every stack of the ailments in per), { distinct } (+distinct for every different
   debuff on it), { boost: { ailment, vs, mult } } (that ailment is mult times as strong on an enemy with any of vs) or
   { extraStack: { ailment, vs } } (that stacking ailment adds two stacks on such an enemy). */
import { HEROES } from './data.js';
import { DAMAGE_LABEL } from './combat.js';

export const RING_MORE = 0.25;
export const RING = {
  toxic: ['bleed'],
  fire: ['poison'],
  cold: ['burn'],
  physical: ['freeze', 'chill'],
  arcane: ['shock'],
  lightning: ['root'],
  holy: ['corruption'],
  shadow: ['hex', 'doom', 'mark', 'verdict']
};
/* Why each link works, in a few words, for the hero pages. */
export const RING_WHY = {
  toxic: 'poison gets into open wounds',
  fire: 'toxins catch fire',
  cold: 'heat then cold cracks them',
  physical: 'frozen and chilled enemies shatter',
  arcane: 'magic arcs into the charge',
  lightning: 'held to the ground, lightning grounds into them',
  holy: 'light burns out the darkness',
  shadow: 'darkness feeds on a cursed soul'
};
/* The debuffs as players read them. */
export const DEBUFF_LABEL = {
  bleed: 'Bleeding', poison: 'Poisoned', burn: 'Burning', freeze: 'Frozen', chill: 'Slowed', shock: 'Shocked', root: 'Rooted',
  stun: 'Stunned', corruption: 'Corrupted', hex: 'Hexed', doom: 'Doomed', mark: 'Marked', verdict: 'under Verdict'
};
/* Which heroes and forms put each debuff on enemies, for the hero pages ("who sets this up"). */
export const DEBUFF_FROM = {
  bleed: ['berserker', 'animalic'],
  poison: ['toxicologist', 'alchemist', 'witchdoctor'],
  burn: ['firemage', 'alchemist', 'infernalist', 'heretic', 'totemist'],
  freeze: ['coldmage', 'totemist'],
  chill: ['coldmage', 'lunar', 'totemist'],
  shock: ['shaman', 'lightningmage', 'totemist'],
  root: ['druid'],
  stun: ['earthcaller', 'crusader'],
  corruption: ['warlock'],
  hex: ['occult'], doom: ['occult'], mark: ['rogue'], verdict: ['inquisitor']
};
/* The debuffs a hero counts for a "different debuffs" passive. */
export const DEBUFFS = Object.keys(DEBUFF_LABEL);

/* ---- Text for the hero pages and tooltips ---- */
const NAMES = Object.fromEntries(HEROES.flatMap(h => [[h.id, h.name], ...(h.evolutions[0] ? h.evolutions[0].choices.map(c => [c.id, c.name]) : [])]));
const or = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' or ' + l.at(-1) : l[0] || '');
const and = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l.at(-1) : l[0] || '');
/* Who puts any of these debuffs on enemies, by name, without `self`. */
export const whoSetsUp = (ids, self = null) => and([...new Set(ids.flatMap(id => DEBUFF_FROM[id] || []))].filter(f => f !== self).map(f => NAMES[f]));
/* "+25% Physical damage to Frozen or Slowed enemies (Cold Mage, Lunar and Totemist set it up)" */
export function ringLine(type, self = null) {
  const ids = RING[type]; if (!ids) return '';
  const who = whoSetsUp(ids, self);
  return '+' + Math.round(RING_MORE * 100) + '% ' + DAMAGE_LABEL[type] + ' damage to ' + or(ids.map(id => DEBUFF_LABEL[id])) + ' enemies' + (who ? ' (' + who + ' set' + (who.includes(' and ') ? '' : 's') + ' it up)' : '');
}
/* What a hero or form's own debuffs open enemies to, short: ["Burning → +25% Cold", ...]. */
export function setsUpLines(id) {
  const by = new Map();   /* damage type (or '' for none) → its debuffs */
  for (const [deb, from] of Object.entries(DEBUFF_FROM)) {
    if (!from.includes(id)) continue;
    const type = Object.keys(RING).find(t => RING[t].includes(deb)) || '';
    by.set(type, [...(by.get(type) || []), DEBUFF_LABEL[deb]]);
  }
  return [...by].map(([type, l]) => or(l) + (type ? ' → +' + Math.round(RING_MORE * 100) + '% ' + DAMAGE_LABEL[type] : ' (some passives feed on it)'));
}
/* The same for a base hero and its forms: "Marked → +25% Shadow · Toxicologist: Poisoned → +25% Fire". */
export function setsUpText(hero) {
  const own = setsUpLines(hero.id), forms = (hero.evolutions[0] ? hero.evolutions[0].choices : []).map(c => [c.name, setsUpLines(c.id)]).filter(([, l]) => l.length);
  return [...own, ...forms.map(([n, l]) => n + ': ' + l.join(', '))].join(' · ');
}
/* The debuffs a passive feeds on, and who sets them up: "Set up by Berserker and Animalic". */
export function passiveSetup(p, self = null) {
  const ids = [...(p.vs || []), ...(p.per || []), ...(p.boost ? p.boost.vs : []), ...(p.extraStack ? p.extraStack.vs : [])];
  if (p.distinct) return 'Any mix of debuffs counts';
  if (p.revelation) return 'Any debuff counts';
  if (p.spread) return 'Works with burn, bleed, poison and Corruption heroes';
  const who = whoSetsUp(ids, self);
  return who ? 'Set up by ' + who : '';
}
