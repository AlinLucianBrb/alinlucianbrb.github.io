/* Form previews: a hero brought into a match with an evolution path (chosen before the match, see README "Evolution paths")
   shows a small, real piece of that form from level 1, growing with every level until it evolves at level 10.
   A preview never touches the ultimate (it stays the base hero's until the evolution), and it carries the form's tags from
   level 1, so gear for the form works from the first wave. The engine side is js/engine/preview.js.

   Every preview uses one or more of these patterns (all optional, all growing from level 1 to level 9 as [at 1, at 9]):
   - every: [N1, N9]  every Nth attack is the form's own attack instead of the base one (the form's behavior runs on an
                      "echo" of the hero; the base attack slows down to match, so the hero is not simply stronger).
                      act: a custom attack instead of the form's behavior (the Marksman's piercing arrow).
   - companion: { power: [a, b], max, cut } the form's minion, weaker (power scales the minion damage) and permanent; the
                      base hero deals `cut` less damage to pay for it.
   - aura: { radius: [a, b], power: [a, b], cut } the form's aura, smaller (radius scales the range) and weaker.
   - convert: { type: [a, b] } that share of the hero's damage becomes the form's element; chance: { stat: [a, b] } its
                      ailment chance (flat). bloodPrice: [a, b] (the Heretic).
   - mods: { stat: [a, b] } flat modifiers (the Berserker's bleed chance).
   - knock: [a, b]    hits push enemies back that many tiles (the Sentinel).
   - verdict: [a, b]  hits add Verdict stacks, up to that many (the Inquisitor).
   - energy: [a, b]   each attack gives the heroes nearby that much energy (the Gospel).
   - mounted: true    the hero rides the form's horse from the start (the Crusader).
   desc: what the player reads on the setup screen and in the hero panel. */
export const PREVIEW_LEVELS = [1, 9];   /* the levels the [at 1, at 9] values belong to; past 9 they stay at the second */

export const PREVIEWS = {
  berserker:     { mods: { bleedChance: [0.1, 0.35] }, desc: 'Swings can make enemies bleed (10% to 35%).' },
  commander:     { every: [5, 3], desc: 'Every 5th swing throws the sword in a line (every 3rd by level 9).' },
  sentinel:      { knock: [0.08, 0.2], desc: 'Swings push enemies back a little (further with each level).' },
  marksman:      { every: [5, 3], act: 'pierce', desc: 'Every 5th arrow pierces through a line of enemies (every 3rd by level 9).' },
  boomeranger:   { every: [5, 3], desc: 'Every 5th shot is a boomerang (every 3rd by level 9).' },
  hunter:        { convert: { toxic: [0.2, 0.5] }, chance: { poisonChance: [0.15, 0.4] }, desc: 'Part of the damage is toxic (20% to 50%), with a chance to poison.' },
  firemage:      { convert: { fire: [0.2, 0.5] }, chance: { burnChance: [0.15, 0.4] }, desc: 'Part of the damage is fire (20% to 50%), with a chance to burn.' },
  coldmage:      { convert: { cold: [0.2, 0.5] }, chance: { freezeChance: [0.1, 0.25] }, desc: 'Part of the damage is cold (20% to 50%), with a chance to freeze.' },
  lightningmage: { convert: { lightning: [0.2, 0.5] }, chance: { shockChance: [0.15, 0.4] }, desc: 'Part of the damage is lightning (20% to 50%), with a chance to shock.' },
  assassin:      { every: [6, 4], desc: 'Every 6th strike blinks to the toughest enemy in range (every 4th by level 9).' },
  toxicologist:  { every: [4, 2], desc: 'Every 4th attack throws toxic daggers (every 2nd by level 9).' },
  alchemist:     { every: [6, 4], desc: 'Every 6th attack throws the concoctions (every 4th by level 9).' },
  animalic:      { companion: { power: [0.3, 0.6], cut: 0.2 }, desc: 'A wolf pup fights beside him, stronger with each level; his own bolts deal 20% less.' },
  naturist:      { every: [5, 3], desc: 'Every 5th cast grows thorns on the path (every 3rd by level 9).' },
  lunar:         { every: [6, 4], desc: 'Every 6th cast is moonlight on every enemy in range (every 4th by level 9).' },
  incantation:   { aura: { radius: [0.45, 0.75], power: [0.2, 0.4], cut: 0.2 }, desc: 'A faint holy aura around her, wider and stronger with each level; her bolts deal 20% less.' },
  archangel:     { every: [5, 3], desc: 'Every 5th cast is a lance of light (every 3rd by level 9).' },
  gospel:        { energy: [1, 2.5], desc: 'Each cast gives the heroes near her a little energy (1 to 2.5).' },
  occult:        { aura: { radius: [0.45, 0.75], power: [0.2, 0.4], cut: 0.2 }, desc: 'A small aura that hexes the enemies near him, wider with each level; his bolts deal 20% less.' },
  summoner:      { companion: { power: [0.3, 0.6], max: 1, cut: 0.2 }, desc: 'One imp at his side, stronger with each level; his own bolts deal 20% less.' },
  infernalist:   { every: [6, 4], desc: 'Every 6th cast is a Hellfire lob (every 4th by level 9).' },
  heretic:       { convert: { shadow: [0.15, 0.4] }, bloodPrice: [0.01, 0.02], desc: 'Part of the damage is shadow (15% to 40%), and he grows a little stronger with every life lost.' },
  inquisitor:    { verdict: [1, 3], desc: 'Hits add a Verdict stack: up to 1 at first, up to 3 by level 9.' },
  crusader:      { every: [6, 4], mounted: true, desc: 'On horseback; every 6th attack is a charge down the path (every 4th by level 9).' },
  witchdoctor:   { convert: { toxic: [0.15, 0.35] }, chance: { poisonChance: [0.15, 0.35] }, desc: 'Part of the chain lightning is toxic, and it can poison.' },
  totemist:      { companion: { power: [0.3, 0.6], max: 1, cut: 0.2 }, desc: 'One totem at a time, stronger with each level; his own lightning deals 20% less.' },
  earthcaller:   { every: [6, 4], desc: 'Every 6th cast opens a fissure (every 4th by level 9).' }
};

/* How far a hero at this level is from the first value to the second (0 to 1). */
export const growth = level => Math.max(0, Math.min(1, (level - PREVIEW_LEVELS[0]) / (PREVIEW_LEVELS[1] - PREVIEW_LEVELS[0])));
/* A [at 1, at 9] value at a level. */
export const at = (pair, level) => pair[0] + (pair[1] - pair[0]) * growth(level);
/* A whole "every Nth" at a level. */
export const everyAt = (pair, level) => Math.max(2, Math.round(at(pair, level)));
