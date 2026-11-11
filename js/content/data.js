/* Game content as data. Heroes have TAGS (what they are) and base STATS (what they do).
   Relics and talents are lists of MODIFIERS that target a stat on heroes carrying certain tags, like Path of Exile.
   To add a hero: add an entry here. A new "kind" also needs a behavior in behaviors.js. */
import { COMBAT_STATS, COMBAT_LABELS } from './combat.js';

export const COLS = 16, ROWS = 10, T = 40;

/* Energy: every hero has a bar that fills as it attacks (and/or over time). When it is full, the next attack is the hero's
   ultimate (see js/engine/ultimates.js). These are the defaults; a hero can override them, and talents, relics and items
   can change them like any other stat. */
export const ENERGY = { energyMax: 100, energyPerAttack: 2, energyPerSecond: 0 };   /* 50 attacks to an ultimate */
/* Attributes: strength, dexterity and intellect. Every hero has all three, and one of them is its own (attribute on the hero:
   Warrior strength, Hunter dexterity, Mage intellect). For now each point of a hero's own attribute gives +1% increased damage
   (ATTRIBUTE_DAMAGE). Hero levels raise all of a hero's stats (HERO_LEVELS). Talents, relics and items can raise any
   attribute like any other stat.
   On top of that, every point of each attribute, the hero's own or not, gives small bonuses (ATTRIBUTE_EFFECTS):
   strength range and penetration (armor and every resistance), dexterity crit chance and crit damage, intellect cast speed
   and energy from attacks. A form can have its own attribute (the Animalic Druid is a dexterity hero, see evolvedDef). */
export const ATTRIBUTES = ['strength', 'dexterity', 'intellect'];
export const ATTRIBUTE_DAMAGE = 0.01;
/* Per point. type 'inc' multiplies the stat by 1 + points x per; 'flat' adds points x per. */
export const ATTRIBUTE_EFFECTS = {
  strength:  [{ stat: 'range', type: 'inc', per: 0.0025, label: 'range' }, { stat: 'armorPen', type: 'flat', per: 0.001, label: 'armor penetration' },
              { stat: 'resPen', type: 'flat', per: 0.001, label: 'resistance penetration' }],
  dexterity: [{ stat: 'critChance', type: 'flat', per: 0.001, label: 'crit chance' }, { stat: 'critDamage', type: 'flat', per: 0.005, label: 'crit damage' }],
  intellect: [{ stat: 'castSpeed', type: 'inc', per: 0.003, label: 'cast speed' }, { stat: 'energyPerAttack', type: 'inc', per: 0.005, label: 'energy from attacks' }]
};
const ATTRS = { strength: 0, dexterity: 0, intellect: 0 };
/* Critical hits: critChance (0 to 1) is the chance a hit is critical, critDamage what a critical hit is multiplied by.
   Most heroes start with no crit chance (the Rogue has some); relics, items and the Rogue's Mark add more. */
const CRIT = { critChance: 0, critDamage: 1.5 };
/* Minions (the Animalic Druid's wolf) fight with their hero's stats, then their own counterparts on top: minionDamage and
   minionSpeed multiply the hero's damage and attack speed for the minion (1 = no change; "inc" modifiers raise them),
   minionCritChance and minionCritDamage add to the hero's crit chance and crit damage. Only heroes with minions use them. */
export const MINION = { minionDamage: 1, minionSpeed: 1, minionCritChance: 0, minionCritDamage: 0 };
/* Every hero gets the energy stats, the attributes, crits, the combat stats (added damage by type, ailment chances) and the
   minion stats, so anything can raise them. */
/* Damage: every hit rolls between (1 - spread) and (1 + spread) of the damage stat (DAMAGE_ROLL.on turns it off for tests). */
export const DAMAGE_SPREAD = 0.25;
export const DAMAGE_ROLL = { on: true };
const withEnergy = (stats, own = {}) => ({ ...stats, ...ENERGY, ...ATTRS, ...CRIT, ...COMBAT_STATS, ...MINION, resPen: 0, spread: DAMAGE_SPREAD, duration: 1, ...own });

/* Hero levels during a match: every hero on the field gains XP from each enemy killed (the enemy's xp value, see enemies.js),
   whoever landed the blow. Each level adds perLevel (scaled by levels gained); xpToNext(L) is the XP from level L to L + 1. */
export const HERO_LEVELS = {
  max: 30,
  xpToNext: L => 10 + 2 * (L - 1),
  /* Every level: +3 to the hero's own attribute (+3% damage, and its side effects), +1 to the other two, and +1% range and
     attack and cast speed. */
  perLevel: [{ stat: 'mainAttribute', type: 'flat', value: 2 }, ...['strength', 'dexterity', 'intellect'].map(stat => ({ stat, type: 'flat', value: 1 })),
    ...['range', 'speed', 'castSpeed'].map(stat => ({ stat, type: 'inc', value: 0.01 }))]
};

/* Evolution: heroes can evolve during a match by spending gold, once they reach the step's level.
   evolutions is a list of steps: { level, cost, choices: [...] }. With one choice the hero simply evolves; with several the
   player picks one. A choice is a new form of the hero: it can change the name, colour, damage type, ultimate, on-hit effects
   (applies), add base stats and tags, and gives its modifiers. Every form also gets +25% to all the base hero's stats
   (EVOLVE_BONUS: damage, range, attack and cast speed, and the three attributes). */
export const EVOLVE_BONUS = 0.25;
const evolved = ['damage', 'range', 'speed', 'castSpeed', 'strength', 'dexterity', 'intellect'].map(stat => ({ stat, type: 'more', value: EVOLVE_BONUS, scope: ['all'] }));
const always = stat => ({ stat, type: 'flat', value: 1, scope: ['all'] });   /* a 100% chance */

/* The playable heroes. A player brings up to LINEUP_SIZE of them into a match, one of each, free to place.
   archetype: melee | range | spell. Every hero's tags include its archetype and its own id.
   To add a hero: add an entry here and a talent tree in talents.js. A new "kind" also needs a behavior in behaviors.js. */
export const LINEUP_SIZE = 3;
export const HEROES = [
  { id: 'warrior', name: 'Warrior', archetype: 'melee', attribute: 'strength', kind: 'swing', damageType: 'physical', color: '#c7ced6', shape: [5, -Math.PI / 2], tags: ['melee', 'attack', 'physical'],
    arc: 120, stats: withEnergy({ damage: 28, range: 60, cooldown: 0.8, speed: 1 }, { strength: 10, dexterity: 4, intellect: 2 }), ultimate: 'empowered',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'berserker', name: 'Berserker', color: '#e5645a', kind: 'doubleswing', ultimate: 'frenzy', mods: [...evolved, always('bleedChance')],
        short: 'Swings twice in quick succession, and every hit makes enemies bleed.' },
      { id: 'commander', name: 'Commander', color: '#7fb3ff', kind: 'launch', ultimate: 'rally', tags: ['projectile'], stats: { range: 110 }, mods: evolved,
        short: 'Launches the sword forward, hitting every enemy in its way.' },
      { id: 'sentinel', name: 'Sentinel', color: '#c9b37e', ultimate: 'barricade', mods: evolved,
        short: 'The same swing, stronger.' }
    ] }],
    desc: 'Warrior (melee): swings at close range, hitting every enemy in the arc. Evolves into a Berserker, Commander or Sentinel.',
    short: 'Swings a blade at close range, hitting every enemy in front of him.' },
  { id: 'ranger', name: 'Hunter', archetype: 'range', attribute: 'dexterity', kind: 'bolt', projLook: 'arrow', projSpeed: 620, damageType: 'physical', color: '#f2b84b', shape: [0, 0],
    tags: ['range', 'projectile', 'attack', 'physical'],
    stats: withEnergy({ damage: 16, range: 120, cooldown: 0.5, speed: 1 }, { strength: 4, dexterity: 10, intellect: 3 }), ultimate: 'empowered',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'marksman', name: 'Ranger', color: '#ffd76a', ultimate: 'piercing', mods: evolved,
        short: 'The same arrows, stronger.' },
      { id: 'boomeranger', name: 'Boomerang', color: '#8be28b', kind: 'boom', ultimate: 'orbit', tags: ['thrown'], mods: evolved,
        short: 'Throws a boomerang that hits every enemy on the way out and back.' },
      { id: 'hunter', name: 'Poacher', color: '#7ad04b', damageType: 'toxic', ultimate: 'traps', tags: ['toxic'], mods: evolved,
        short: 'Arrows deal toxic damage.' }
    ] }],
    desc: 'Hunter (projectile): fast arrows at the enemy closest to your gate. Evolves into a Ranger, Boomerang or Poacher.',
    short: 'Long range and fast. Shoots arrows at the enemy closest to your gate.' },
  { id: 'mage', name: 'Mage', archetype: 'spell', attribute: 'intellect', kind: 'bolt', damageType: 'arcane', color: '#c39bf2', shape: [4, -Math.PI / 2], tags: ['spell', 'projectile', 'arcane'],
    rate: 'castSpeed', stats: withEnergy({ damage: 26, range: 110, cooldown: 1, castSpeed: 1, targets: 1 }, { strength: 2, dexterity: 4, intellect: 10 }), ultimate: 'empowered',
    /* At level 10 the Mage picks an element. The slow is the Frost Mage's old chill effect, kept for exactly this. */
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'firemage', name: 'Fire Mage', color: '#ff7a45', damageType: 'fire', ultimate: 'inferno', tags: ['fire'],
        mods: [...evolved, always('burnChance')],
        short: 'Bolts deal fire damage and set enemies on fire.' },
      { id: 'coldmage', name: 'Cold Mage', color: '#72c8f0', damageType: 'cold', ultimate: 'blizzard', tags: ['cold'],
        applies: { chill: 'chillTime' }, stats: { chillTime: 1.5 }, mods: evolved,
        short: 'Bolts deal cold damage and slow enemies to half speed.' },
      { id: 'lightningmage', name: 'Lightning Mage', color: '#d6a2ff', damageType: 'lightning', ultimate: 'storm', tags: ['lightning'],
        mods: [...evolved, always('shockChance')],
        short: 'Bolts deal lightning damage and shock enemies, lowering their defenses.' }
    ] }],
    desc: 'Mage (spell): fires a magic bolt at the enemy closest to your gate. Evolves into a Fire, Cold or Lightning Mage.',
    short: 'Fires a magic bolt at the enemy closest to your gate.' },
  /* The Rogue: two quick strikes and a higher crit chance; its ultimate marks every enemy, making them easier to crit.
     Its evolutions go for "the strongest, toughest enemy": the one in range with the most life left. */
  { id: 'rogue', name: 'Rogue', archetype: 'melee', attribute: 'dexterity', kind: 'doubleswing', damageType: 'physical', color: '#4fb3a9', shape: [3, -Math.PI / 2],
    tags: ['melee', 'attack', 'physical'],
    arc: 100, stats: withEnergy({ damage: 17, range: 60, cooldown: 0.75, speed: 1 }, { strength: 4, dexterity: 10, intellect: 3, critChance: 0.1 }), ultimate: 'mark',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'assassin', name: 'Assassin', color: '#9b6bd6', kind: 'assassin', ultimate: 'clones', stats: { range: 130 },
        mods: [...evolved, { stat: 'damage', type: 'more', value: 1, scope: ['all'] }],
        short: 'Teleports behind the strongest, toughest enemy in range and strikes once, for double damage.' },
      { id: 'toxicologist', name: 'Toxicologist', color: '#a6d94a', kind: 'daggers', damageType: 'toxic', ultimate: 'poisonflask', tags: ['projectile', 'toxic'],
        stats: { range: 120 }, mods: [...evolved, always('poisonChance')],
        short: 'Throws two toxic daggers at the strongest, toughest enemy in range; each one poisons.' },
      { id: 'alchemist', name: 'Alchemist', color: '#ff9f43', kind: 'concoctions', damageType: 'fire', ultimate: 'oil', tags: ['projectile', 'fire', 'toxic'],
        stats: { range: 120 }, mods: [...evolved, always('burnChance'), always('poisonChance')],
        short: 'Throws two concoctions at the strongest, toughest enemy in range: fire that burns, then toxic that poisons.' }
    ] }],
    desc: 'Rogue (melee): two quick strikes, with a higher chance of critical hits. Evolves into an Assassin, Toxicologist or Alchemist.',
    short: 'Strikes twice in quick succession, with a knack for critical hits.' },
  /* The Druid: a spell caster whose thorny bolts can root enemies in place (rootChance); its ultimate lends that power to
     the heroes around it. Each evolution replaces the bolt with something of its own: a wolf, thorns on the path, or
     moonlight that hits every enemy in range. */
  { id: 'druid', name: 'Druid', archetype: 'spell', attribute: 'intellect', kind: 'bolt', projLook: 'seed', projSpeed: 460, damageType: 'physical', color: '#8fbf5a',
    shape: [6, 0], tags: ['spell', 'projectile', 'physical', 'nature'], rate: 'castSpeed',
    stats: withEnergy({ damage: 24, range: 115, cooldown: 0.85, castSpeed: 1, targets: 1 }, { strength: 3, dexterity: 4, intellect: 10, rootChance: 0.15 }), ultimate: 'grasp',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'animalic', name: 'Animalic Druid', color: '#c98a4b', kind: 'wolf', ultimate: 'enrage', attribute: 'dexterity', tags: ['melee', 'minion'], stats: { range: 130 },
        mods: [...evolved, always('bleedChance'), { stat: 'damage', type: 'more', value: 0.25, scope: ['all'] }],
        short: 'A wolf runs after the enemy furthest along the path and bites everything in front of it; its bites bleed.' },
      { id: 'naturist', name: 'Naturist Druid', color: '#5fcf6a', kind: 'thorns', ultimate: 'spikes', tags: ['area'],
        mods: evolved,
        short: 'Grows thorns on the path ahead of the enemies; they hurt everything standing in them for 1.5 seconds. Cast speed grows them faster.' },
      { id: 'lunar', name: 'Lunar Druid', color: '#b8c8ff', kind: 'moonbeam', damageType: 'cold', ultimate: 'moonfall', tags: ['cold', 'area'],
        applies: { chill: 'chillTime' }, stats: { chillTime: 1 }, mods: evolved,
        short: 'Moonlight beams every enemy in range at once with cold damage, slowing them.' }
    ] }],
    desc: 'Druid (spell): thorny bolts that can root enemies in place. Evolves into an Animalic, Naturist or Lunar Druid.',
    short: 'Shoots thorny bolts that can root enemies in place (15%).' },
  /* The Priest: a support caster (holy). Smite, and a Blessing for the heroes around her. Her forms: an aura that burns enemies
     and speeds up allies (Incantation, the first aura hero), a piercing lance from a hero who may stand on the path
     (Archangel), and energy for the heroes around her plus a saved life each wave (Gospel). Kit: js/engine/kits/priest.js. */
  { id: 'priest', name: 'Priest', archetype: 'spell', attribute: 'intellect', kind: 'bolt', projLook: 'holy', projSpeed: 440, damageType: 'holy', color: '#f4e7b0',
    shape: [8, 0], tags: ['spell', 'projectile', 'holy'], rate: 'castSpeed',
    stats: withEnergy({ damage: 22, range: 115, cooldown: 0.9, castSpeed: 1, targets: 1 }, { strength: 2, dexterity: 3, intellect: 10 }), ultimate: 'blessing',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'incantation', name: 'Incantation', color: '#ffd76a', kind: 'aura', ultimate: 'crescendo', tags: ['aura'],
        stats: { damage: 7, range: 70, cooldown: 0.5, energyPerAttack: 0.5 }, mods: evolved,
        aura: { bless: { id: 'hymn', name: 'Hymn', mods: [{ stat: 'speed', type: 'inc', value: 0.15 }, { stat: 'castSpeed', type: 'inc', value: 0.15 }] } },
        short: 'No attack: a holy aura burns every enemy inside it, and heroes inside attack and cast 15% faster.' },
      { id: 'archangel', name: 'Archangel', color: '#fff6c8', kind: 'lance', ultimate: 'judgement', tags: ['projectile'], stats: { range: 130 }, mods: evolved,
        flying: true,
        short: 'Throws a lance of light that pierces every enemy in a line. Wings: she can be moved onto the path.' },
      { id: 'gospel', name: 'Gospel', color: '#ffe9a0', kind: 'psalm', ultimate: 'conversion', tags: ['area'], mods: evolved, sanctuary: true,
        short: 'Each Psalm gives 3 energy to every hero around her. Sanctuary: once a wave, the first enemy to reach the gate is turned back.' }
    ] }],
    desc: 'Priest (spell): bolts of holy light, and a Blessing that strengthens the heroes around her. Evolves into an Incantation, Archangel or Gospel.',
    short: 'Smites the enemy closest to your gate with bolts of holy light.' },
  /* The Warlock: shadow bolts that Corrupt (damage over time that grows with each stack). His forms: an aura that curses
     enemies so everyone hits them harder (Occult), imps and a Greater Demon (Summoner), burning ground and spreading fire
     (Infernalist). Kit: js/engine/kits/warlock.js. */
  { id: 'warlock', name: 'Warlock', archetype: 'spell', attribute: 'intellect', kind: 'bolt', projSpeed: 420, damageType: 'shadow', color: '#9a5cd6',
    shape: [5, Math.PI / 2], tags: ['spell', 'projectile', 'shadow'], rate: 'castSpeed',
    stats: withEnergy({ damage: 18, range: 115, cooldown: 0.9, castSpeed: 1, targets: 1 }, { strength: 2, dexterity: 3, intellect: 10, corruptionChance: 0.5 }), ultimate: 'souldrain',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'occult', name: 'Occult', color: '#7a4fc0', kind: 'aura', ultimate: 'doom', tags: ['aura', 'curse'],
        stats: { damage: 4, range: 110, cooldown: 0.5, energyPerAttack: 0.5 }, mods: evolved, aura: { curse: 'hex', harmless: true },
        short: 'No attack and no damage: a shadow aura Hexes every enemy inside, so they take 25% more damage from everyone and move 15% slower.' },
      { id: 'summoner', name: 'Summoner', color: '#c46aff', kind: 'imps', ultimate: 'demongate', tags: ['minion'], stats: { cooldown: 1.6 }, mods: evolved,
        short: 'Each cast summons an imp (up to 3, 10 seconds each) that throws small bolts at the enemies near it.' },
      { id: 'infernalist', name: 'Infernalist', color: '#ff6a3a', kind: 'hellfire', damageType: 'fire', ultimate: 'infernal', tags: ['fire', 'area'],
        convert: { shadow: 0.3 }, contagion: true, mods: [...evolved, always('burnChance')],
        short: 'Hellfire: a fireball that bursts and leaves burning ground, aimed where there is none yet. Always burns; burns jump to the next enemy when one dies.' }
    ] }],
    desc: 'Warlock (spell): shadow bolts that Corrupt enemies, damage over time that grows with each stack. Evolves into an Occult, Summoner or Infernalist.',
    short: 'Shadow bolts that Corrupt enemies (50%): damage over time that grows with each stack.' },
  /* The Paladin: a slower, heavier Warrior; 30% of his damage is Holy. His forms: a fallen knight who grows stronger as lives
     are lost and can pay one to empower everyone (Heretic), a hunter of the toughest enemies (Inquisitor), and a mounted
     knight who charges down the path (Crusader). Kit: js/engine/kits/paladin.js. */
  { id: 'paladin', name: 'Paladin', archetype: 'melee', attribute: 'strength', kind: 'swing', damageType: 'physical', convert: { holy: 0.3 }, color: '#e8d27a',
    shape: [6, Math.PI / 6], tags: ['melee', 'attack', 'physical', 'holy'],
    arc: 120, stats: withEnergy({ damage: 36, range: 60, cooldown: 0.95, speed: 1 }, { strength: 10, dexterity: 3, intellect: 4 }), ultimate: 'consecration',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'heretic', name: 'Heretic', color: '#b04a3a', damageType: 'shadow', convert: { fire: 0.5 }, bloodPrice: 0.03, ultimate: 'heresy', tags: ['shadow', 'fire'],
        mods: [...evolved, always('burnChance')],
        short: 'A burning shadow flail (always burns), 3% stronger for every life lost this run.' },
      { id: 'inquisitor', name: 'Inquisitor', color: '#f2e2a0', kind: 'verdict', damageType: 'holy', ultimate: 'purge', stats: { range: 100, cooldown: 0.8 }, mods: evolved,
        short: 'A long chain flail at the toughest enemy in range; each hit adds a stack of Verdict (+5% damage taken from everything, up to 10).' },
      { id: 'crusader', name: 'Crusader', color: '#d9b25a', kind: 'charge', mounted: true, onPath: true, ultimate: 'cavalry', tags: ['mounted'], stats: { range: 140, cooldown: 1.8, damage: 44 }, mods: evolved,
        short: 'Charges on his horse down the nearest stretch of path toward the enemies, trampling and knocking back each one, then rides back. He can stand on the path, and then rides only along it.' }
    ] }],
    desc: 'Paladin (melee): a heavy hammer, part of it holy, and Consecration. Evolves into a Heretic, Inquisitor or Crusader.',
    short: 'A heavy hammer swing at close range, 30% of it holy.' },
  /* The Shaman: chain lightning that hits several enemies, and Ancestral call (heroes nearby attack faster). The second
     strength hero. His forms: poison darts that link enemies so they share damage (Witch Doctor), totems that fight on their
     own (Totemist), and cracks in the path plus a quake that pushes every enemy back (Earthcaller). Kit: js/engine/kits/shaman.js. */
  { id: 'shaman', name: 'Shaman', archetype: 'spell', attribute: 'strength', kind: 'chain', damageType: 'lightning', color: '#7ad0e0',
    shape: [3, Math.PI / 2], tags: ['spell', 'projectile', 'lightning', 'chain'], rate: 'castSpeed',
    stats: withEnergy({ damage: 15, range: 110, cooldown: 0.9, castSpeed: 1, jumps: 2 }, { strength: 10, dexterity: 3, intellect: 6, shockChance: 0.1 }), ultimate: 'ancestral',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'witchdoctor', name: 'Witch Doctor', color: '#8ad04b', kind: 'darts', damageType: 'toxic', ultimate: 'locusts', tags: ['projectile', 'toxic', 'curse'],
        stats: { damage: 11, cooldown: 0.55 }, mods: [...evolved, always('poisonChance')],
        short: 'Fast poison darts (always poison) at an enemy not linked yet; each Voodoo-links its target with 2 enemies near it: 30% of the damage one takes goes to the others.' },
      { id: 'totemist', name: 'Totemist', color: '#d9a35a', kind: 'totems', ultimate: 'surge', tags: ['minion', 'totem'], stats: { cooldown: 2 }, mods: evolved,
        short: 'Each cast plants a missing totem near him (up to 3, one of each: Flame, Frost, Storm; 12 seconds each). Totems take up their tile.' },
      { id: 'earthcaller', name: 'Earthcaller', color: '#b08a5a', kind: 'fissure', damageType: 'physical', ultimate: 'tectonic', tags: ['physical', 'area'],
        stats: { range: 120, damage: 20 }, mods: evolved,
        short: 'Fissure: the path cracks behind the leading enemy, hitting everyone on that stretch and stunning them for a moment.' }
    ] }],
    desc: 'Shaman (spell): chain lightning that jumps to 2 more enemies, and Ancestral call. Evolves into a Witch Doctor, Totemist or Earthcaller.',
    short: 'Chain lightning that jumps to 2 more enemies.' }
];
HEROES.forEach(h => h.tags.push(h.id));

/* A hero's evolved form: the base hero with the choice's changes on top. The id stays the base hero's, so talents, items
   and the lineup keep working; form holds the choice's id. */
/* Traits a form can add or change (read by the engine on hero.def): flying (may stand on the path), onPath (the Crusader: may
   stand on the path too, and then rides only along it), sanctuary, aura,
   convert (a share of the damage as another type), bloodPrice, contagion, projLook, projSpeed. */
const TRAITS = ['flying', 'onPath', 'mounted', 'sanctuary', 'aura', 'convert', 'bloodPrice', 'contagion', 'projLook', 'projSpeed'];
/* The taxonomy (see README): delivery tags (melee, projectile, trap, aura, area), source tags (attack, spell, minion) and the
   damage type's tag. A form with its own attribute (attribute on the choice) swaps the two values, so the hero keeps what it had: the Druid's
   10 intellect and 4 dexterity become the Animalic Druid's 10 dexterity and 4 intellect. Hero levels raise the main attribute,
   whichever it is, so they carry over by themselves. */
export function evolvedDef(base, choice) {
  const traits = {};
  for (const k of TRAITS) if (choice[k] !== undefined) traits[k] = choice[k];
  const stats = { ...base.stats, ...(choice.stats || {}) }, from = base.attribute, to = choice.attribute || from;
  if (to !== from && from in stats && to in stats) { const a = stats[from]; stats[from] = stats[to]; stats[to] = a; }
  /* A form keeps its base hero's delivery and source tags, but a new damage type replaces the old one's tag (Fire Mage: no arcane). */
  const dropped = choice.damageType && choice.damageType !== base.damageType && !(choice.tags || []).includes(base.damageType) ? base.damageType : null;
  return {
    ...base, ...traits, form: choice.id, name: choice.name, color: choice.color || base.color, kind: choice.kind || base.kind,
    damageType: choice.damageType || base.damageType, ultimate: choice.ultimate || base.ultimate, attribute: to,
    applies: choice.applies || base.applies, short: choice.short || base.short,
    stats, tags: [...new Set([...base.tags.filter(t => t !== dropped), ...(choice.tags || [])])]
  };
}

/* Kept for later, not playable right now: these become advanced variants (evolutions) once that system grows.
   Their behaviors (boomerang, beam, chain) and the Frost Mage's slow (the "chill" effect) still live in the engine. */
export const HERO_ARCHIVE = [
  { id: 'thief', name: 'Thief', archetype: 'range', kind: 'boom', damageType: 'physical', color: '#8be28b', shape: [4, Math.PI / 4], tags: ['range', 'projectile', 'thrown', 'physical'],
    stats: withEnergy({ damage: 12, range: 130, cooldown: 0.7, speed: 1 }), ultimate: 'empowered', evolutions: [],
    desc: 'Thief (range): throws a boomerang that hits everything on the way out and back.', short: 'Throws a boomerang that hits every enemy on the way out and back.' },
  { id: 'frostmage', name: 'Frost Mage', archetype: 'spell', kind: 'shot', damageType: 'cold', color: '#72c8f0', shape: [4, -Math.PI / 2], tags: ['spell', 'cold'],
    stats: withEnergy({ damage: 3, range: 90, cooldown: 0.8, speed: 1, chillTime: 1.5, targets: 1 }), applies: { chill: 'chillTime' }, ultimate: 'empowered', evolutions: [],
    desc: 'Frost Mage (spell): weak bolts that chill enemies, slowing them by half.', short: 'Weak bolts that slow enemies to half speed.' },
  { id: 'firemage', name: 'Fire Mage', archetype: 'spell', kind: 'beam', damageType: 'fire', color: '#ff7a45', shape: [3, -Math.PI / 2], tags: ['spell', 'fire', 'beam'], dps: true,
    stats: withEnergy({ damage: 10, range: 100, rampRate: 1 }), ultimate: 'empowered', evolutions: [],
    desc: 'Fire Mage (spell): continuous beam. Damage ramps up to 4× the longer it stays on one target.', short: 'A beam that burns hotter the longer it stays on one enemy.' },
  { id: 'lightningmage', name: 'Lightning Mage', archetype: 'spell', kind: 'chain', damageType: 'lightning', color: '#d6a2ff', shape: [6, 0], tags: ['spell', 'lightning', 'chain'],
    stats: withEnergy({ damage: 9, range: 100, cooldown: 1.1, speed: 1, jumps: 3 }), ultimate: 'empowered', evolutions: [],
    desc: 'Lightning Mage (spell): lightning that jumps to several nearby enemies, weaker with each jump.', short: 'Lightning that jumps between nearby enemies.' }
];
HERO_ARCHIVE.forEach(h => h.tags.push(h.id));
export const heroIndex = id => HEROES.findIndex(h => h.id === id);

/* Balance pass (Nov 11): forms that fell behind get more damage output, on top of the evolution bonus. The number is how
   much more damage per second, split evenly between damage per hit and attack (or cast) speed: 1.44 = 20% more damage
   and 20% faster attacks (a hero that already kills in one hit needs speed, not damage). Found with the balance tools
   (npm run balance:report, balance:tune). The Occult deals no damage: its knob is how much more damage Hexed enemies
   take (EFFECTS.hex in js/engine/effects.js). */
export const FORM_TUNING = {
  marksman: 1.6, hunter: 1.6, crusader: 1.6, sentinel: 1.5, boomeranger: 1.4, toxicologist: 1.35,
  witchdoctor: 1.25, inquisitor: 1.2, gospel: 1.1, commander: 1.05, archangel: 1.05
};
/* Applies a tuning table to the forms (the balance tools use it to try one in memory; the game applies FORM_TUNING). */
export function applyFormTuning(table = FORM_TUNING) {
  for (const h of HEROES) for (const st of h.evolutions) for (const c of st.choices) {
    if (!c.baseMods) Object.defineProperty(c, 'baseMods', { value: c.mods || [], enumerable: false });
    const m = table[c.id];
    const k = m && m !== 1 ? Math.sqrt(m) - 1 : 0;
    c.mods = k ? [...c.baseMods, ...['damage', 'speed', 'castSpeed'].map(stat => ({ stat, type: 'more', value: k, scope: ['all'] }))] : c.baseMods;
  }
}
applyFormTuning();

/* The five levels. Each has a wave count (15, then 5 more each), an enemy health multiplier and a per-wave growth rate.
   Tuned (Nov 11) so that at its point on the progression curve (PROGRESSION in tools/balance/suites.mjs: level 1 at player
   level 1 with no gear, up to level 5 at player level 30 with epic gear) the weakest tenth of teams cleared a level about
   40% of the time; since relic offers fit the match (Nov 11), teams are stronger and it clears about 50-65%. Each level starts a little tougher than the one before and grows more gently, so its last waves
   are the hardest of all; before: hpMult 1 / 1.2 / 1.5 / 2 / 2.5, growth 1.14 / 1.15 / 1.16 / 1.17 / 1.18. */
export const STAGES = [
  { n: 1, name: 'Green Meadow', waves: 15, hpMult: 5.2,  growth: 1.14 },    /* name: shown with the level's picture (assets/level_<n>.png) */
  { n: 2, name: 'Deep Forest',  waves: 20, hpMult: 5.2,  growth: 1.118 },
  { n: 3, name: 'Mire',         waves: 25, hpMult: 5.35, growth: 1.105 },
  { n: 4, name: 'Red Canyon',   waves: 30, hpMult: 6.1,  growth: 1.103 },
  { n: 5, name: 'Ashlands',     waves: 35, hpMult: 6.55, growth: 1.105 }
];

export const STAT_LABELS = {
  damage: 'Damage', range: 'Range', speed: 'Attacks per second', chillTime: 'Chill duration (s)', jumps: 'Chain jumps',
  rampRate: 'Beam ramp speed', targets: 'Targets per attack',
  strength: 'Strength', dexterity: 'Dexterity', intellect: 'Intellect', mainAttribute: 'Main attribute',
  castSpeed: 'Casts per second', resPen: 'Resistance penetration', duration: 'Duration (multiplier)', spread: 'Damage spread', critChance: 'Crit chance', critDamage: 'Crit damage (multiplier)',
  energyMax: 'Energy needed', energyPerAttack: 'Energy per attack', energyPerSecond: 'Energy per second',
  ...COMBAT_LABELS, relicLuck: 'Relic luck',
  minionDamage: 'Minion damage (multiplier)', minionSpeed: 'Minion attack speed (multiplier)', minionCritChance: 'Minion crit chance', minionCritDamage: 'Minion crit damage (added)',
  bounty: 'Gold per kill', bountyChance: 'Chance for +2 gold per kill', rerolls: 'Free relic rerolls per match', banishes: 'Free relic banishes per match',
  speed3x: '3x game speed', heroXp: 'Hero XP', relicCost: 'Relic price', relicOffers: 'Chance of one more relic offer',
  itemRarity: 'Item rarity luck', itemBonusChance: 'Chance of an extra item bonus', heroStartLevel: 'Starting hero level', evolveLevel: 'Level needed to evolve', rewardGold: 'Gold at the end of a match', rewardXp: 'XP at the end of a match', rewardLoot: 'Item find', startGold: 'Starting gold', startLives: 'Starting lives', waveGold: 'Wave clear gold', evolveCost: 'Evolution cost', interest: 'Interest', interestCap: 'Interest limit'
};

export const RARITIES = [
  { name: 'Common',   mult: 1, weight: 55, color: '#ecf1e8' },
  { name: 'Uncommon', mult: 2, weight: 28, color: '#5fd46f' },
  { name: 'Rare',     mult: 3, weight: 13, color: '#5aa9ff' },
  { name: 'Epic',     mult: 4, weight: 4,  color: '#c084fc' }
];
/* Relic luck makes rarer relics more likely: each rarity's weight is multiplied by (1 + luck) once per step above Common.
   With 50% luck: Common 55, Uncommon 28 x 1.5, Rare 13 x 2.25, Epic 4 x 3.375. */
export const rarityWeights = (luck = 0) => RARITIES.map((r, i) => r.weight * Math.pow(1 + Math.max(0, luck), i));
/* The chance of each rarity, 0 to 1, for showing the odds. */
export function rarityOdds(luck = 0) {
  const w = rarityWeights(luck), sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}
/* r01 is a random number in [0, 1) supplied by the caller, so the engine can use its seeded generator. */
export function rollRarity(r01, luck = 0) {
  const w = rarityWeights(luck);
  let r = r01 * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) return i; }
  return 0;
}

/* Modifier: { stat, type: 'inc' | 'more' | 'flat', value, scope }.
   scope is a list of hero tags (or ['all']) for hero stats, or 'global' for economy stats.
   Relics are defined at Common strength; m is the rarity multiplier: Common 1, Uncommon 2, Rare 3, Epic 4 (always a whole number).
   Relics are cheap and you buy many in a run, so each one is small: these are 15% of the earlier values (RELIC_POWER), except
   Prospector (a 25% chance of +2 gold per kill per Common; past 100% it rolls again), Tax collector (half its earlier value)
   and Compound interest (full strength). */
export const RELIC_POWER = 0.15;
/* Heroes with a form that fights through minions. */
const MINION_HEROES = ['druid', 'warlock', 'shaman'];
const f = x => +x.toFixed(2);
const P = x => x * RELIC_POWER;
const hero = (stat, type, value, scope) => ({ stat, type, value, scope });
const glob = (stat, type, value) => ({ stat, type, value, scope: 'global' });
/* Prospector: every full 100% is a sure +2 gold per kill, and the rest is a chance of 2 more (200% = +4, 250% = +4 and a 50% chance of +2). */
const prospect = pct => {
  const sure = Math.floor(pct / 100 + 1e-9), rest = f(pct - sure * 100);
  if (!sure) return f(pct) + '% chance of +2 gold per kill';
  return '+' + 2 * sure + ' gold per kill' + (rest > 0 ? ', and a ' + rest + '% chance of +2 more' : '') + ' (' + f(pct) + '%)';
};
const lives = m => Math.max(1, Math.round(P(5) * m));
export const RELICS = [
  { name: 'Sharpened rounds',  desc: m => '+' + f(P(25) * m) + '% damage (all heroes)',  mods: m => [hero('damage', 'inc', P(0.25) * m, ['all'])] },
  { name: 'Long barrels',      desc: m => '+' + f(P(15) * m) + '% range',               mods: m => [hero('range', 'inc', P(0.15) * m, ['all'])] },
  { name: 'Quick hands',       desc: m => '+' + f(P(20) * m) + '% attack speed',        mods: m => [hero('speed', 'inc', P(0.2) * m, ['all'])] },
  { name: 'Four-leaf clover',  desc: m => '+' + f(P(50) * m) + '% relic luck: rarer relics turn up more often', label: 'Relic luck', mods: m => [glob('relicLuck', 'flat', P(0.5) * m)] },
  { name: 'Battle focus',      desc: m => '+' + f(P(25) * m) + '% energy from attacks, so ultimates come sooner', mods: m => [hero('energyPerAttack', 'inc', P(0.25) * m, ['all'])] },
  { name: 'Prospector',        desc: m => prospect(25 * m), label: 'Economy', mods: m => [glob('bountyChance', 'flat', 0.25 * m)] },
  { name: 'Reinforced gate',   desc: m => '+' + lives(m) + ' li' + (lives(m) > 1 ? 'ves' : 'fe'), label: 'Your gate', onPick: (g, m) => { g.lives += lives(m); },
    itemMods: m => [glob('startLives', 'flat', lives(m))] },   /* as an item bonus: starting lives */
  { name: 'Split bolt',        desc: m => 'Spell attacks: ' + f(P(100) * m) + '% chance to hit 1 more target', mods: m => [hero('targets', 'flat', P(1) * m, ['spell'])] },
  { name: 'Tax collector',     desc: m => '+' + f(25 * m) + '% gold for clearing a wave', label: 'Economy', mods: m => [glob('waveGold', 'inc', 0.25 * m)] },
  { name: 'Compound interest', desc: m => 'After each wave, get ' + f(5 * m) + '% of your gold (max ' + 60 * m + '). Copies add up.',
    label: 'Economy', mods: m => [glob('interest', 'flat', 0.05 * m), glob('interestCap', 'flat', 60 * m)] },
  { name: 'Fine arrows',       desc: m => '+' + f(P(30) * m) + '% damage to projectile heroes', mods: m => [hero('damage', 'inc', P(0.3) * m, ['projectile'])] },
  { name: 'Whetstone',         desc: m => '+' + f(P(30) * m) + '% damage to melee heroes',      mods: m => [hero('damage', 'inc', P(0.3) * m, ['melee'])] },
  { name: 'Arcane focus',      desc: m => '+' + f(P(30) * m) + '% damage to spell heroes',      mods: m => [hero('damage', 'inc', P(0.3) * m, ['spell'])] },
  { name: 'Keen edge',         desc: m => '+' + f(P(20) * m) + '% crit chance',                  mods: m => [hero('critChance', 'flat', P(0.2) * m, ['all'])] },
  { name: 'Cruelty',           desc: m => '+' + f(P(50) * m) + '% crit damage',                  mods: m => [hero('critDamage', 'flat', P(0.5) * m, ['all'])] },
  { name: 'Quick incantation', desc: m => '+' + f(P(20) * m) + '% cast speed (spell heroes)',    mods: m => [hero('castSpeed', 'inc', P(0.2) * m, ['spell'])] },
  /* Attributes: a named one helps any hero (its side effect, see ATTRIBUTE_EFFECTS, and damage if it is the hero's own);
     Prowess raises whichever is the hero's own, and follows a form that changes attribute. */
  { name: 'Duration',          desc: m => '+' + f(P(50) * m) + '% duration of buffs, debuffs and damage over time',   mods: m => [hero('duration', 'inc', P(0.5) * m, ['all'])] },
  { name: 'Brawn',             desc: m => '+' + 3 * m + ' strength',                             mods: m => [hero('strength', 'flat', 3 * m, ['all'])] },
  { name: 'Finesse',           desc: m => '+' + 3 * m + ' dexterity',                            mods: m => [hero('dexterity', 'flat', 3 * m, ['all'])] },
  { name: 'Insight',           desc: m => '+' + 3 * m + ' intellect',                            mods: m => [hero('intellect', 'flat', 3 * m, ['all'])] },
  { name: 'Prowess',           desc: m => '+' + 2 * m + ' to the main attribute',                mods: m => [hero('mainAttribute', 'flat', 2 * m, ['all'])] },
  /* Holy and Shadow heroes (Priest, Paladin; Warlock, Heretic). */
  { name: 'Dark pact',         desc: m => '+' + f(P(30) * m) + '% damage to shadow heroes',     lineup: ['warlock', 'paladin'], mods: m => [hero('damage', 'inc', P(0.3) * m, ['shadow'])] },
  { name: 'Blasphemy',         desc: m => '+' + f(P(20) * m) + '% corruption chance',           lineup: ['warlock', 'paladin'], mods: m => [hero('corruptionChance', 'flat', P(0.2) * m, ['all'])] },
  { name: 'Holy water',        desc: m => '+' + f(P(30) * m) + '% damage to holy heroes',       lineup: ['priest', 'paladin'], mods: m => [hero('damage', 'inc', P(0.3) * m, ['holy'])] },
  /* Minion counterparts of the damage relics (the Druid's wolf, the Warlock's imps and demon, the Shaman's totems).
     lineup: only offered when one of these heroes is in the match. */
  { name: 'Pack leader',       desc: m => '+' + f(P(30) * m) + '% minion damage',      lineup: MINION_HEROES, mods: m => [hero('minionDamage', 'inc', P(0.3) * m, ['minion'])] },
  { name: 'Feral haste',       desc: m => '+' + f(P(20) * m) + '% minion attack speed', lineup: MINION_HEROES, mods: m => [hero('minionSpeed', 'inc', P(0.2) * m, ['minion'])] },
  { name: 'Hunting instinct',  desc: m => '+' + f(P(20) * m) + '% minion crit chance',  lineup: MINION_HEROES, mods: m => [hero('minionCritChance', 'flat', P(0.2) * m, ['minion'])] },
  { name: 'Savage bite',       desc: m => '+' + f(P(50) * m) + '% minion crit damage',  lineup: MINION_HEROES, mods: m => [hero('minionCritDamage', 'flat', P(0.5) * m, ['minion'])] }
];
/* Kept for later: relics for the archived heroes and the Frost Mage's slow. Not offered while those heroes are not playable. */
export const RELIC_ARCHIVE = [
  { name: 'Deep freeze',       desc: m => 'Chill lasts ' + f(m) + 's longer',        mods: m => [hero('chillTime', 'flat', m, ['cold'])] },
  { name: 'Prism',             desc: m => '+' + f(30 * m) + '% Fire Mage damage',    mods: m => [hero('damage', 'inc', 0.3 * m, ['beam'])] },
  { name: 'Focusing lens',     desc: m => 'Beam ramps up ' + f(40 * m) + '% faster', mods: m => [hero('rampRate', 'inc', 0.4 * m, ['beam'])] },
  { name: 'Razor edge',        desc: m => '+' + f(30 * m) + '% Thief damage',        mods: m => [hero('damage', 'inc', 0.3 * m, ['thrown'])] },
  { name: 'Storm core',        desc: m => '+' + f(30 * m) + '% Lightning Mage damage', mods: m => [hero('damage', 'inc', 0.3 * m, ['chain'])] },
  { name: 'Extra link',        desc: m => '+' + m + ' Chain jump' + (m > 1 ? 's' : ''), mods: m => [hero('jumps', 'flat', m, ['chain'])] }
];
