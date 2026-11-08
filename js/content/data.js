/* Game content as data. Heroes have TAGS (what they are) and base STATS (what they do).
   Relics and talents are lists of MODIFIERS that target a stat on heroes carrying certain tags, like Path of Exile.
   To add a hero: add an entry here. A new "kind" also needs a behavior in behaviors.js. */
import { COMBAT_STATS, COMBAT_LABELS } from './combat.js';

export const COLS = 16, ROWS = 10, T = 40;

/* Energy: every hero has a bar that fills as it attacks (and/or over time). When it is full, the next attack is the hero's
   ultimate (see js/engine/ultimates.js). These are the defaults; a hero can override them, and talents, relics and items
   can change them like any other stat. */
export const ENERGY = { energyMax: 100, energyPerAttack: 20, energyPerSecond: 0 };
/* Attributes: strength, dexterity and intellect. Every hero has all three, and one of them is its own (attribute on the hero:
   Warrior strength, Ranger dexterity, Mage intellect). For now each point of a hero's own attribute gives +1% increased damage
   (ATTRIBUTE_DAMAGE); the other two do nothing yet. Hero levels raise the hero's own attribute (stat mainAttribute, see
   HERO_LEVELS). Talents, relics and items can raise any of them like any other stat. */
export const ATTRIBUTES = ['strength', 'dexterity', 'intellect'];
export const ATTRIBUTE_DAMAGE = 0.01;
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
const withEnergy = (stats, own = {}) => ({ ...stats, ...ENERGY, ...ATTRS, ...CRIT, ...COMBAT_STATS, ...MINION, ...own });

/* Hero levels during a match: every hero on the field gains XP from each enemy killed (the enemy's xp value, see enemies.js),
   whoever landed the blow. Each level adds perLevel (scaled by levels gained); xpToNext(L) is the XP from level L to L + 1. */
export const HERO_LEVELS = {
  max: 30,
  xpToNext: L => 10 + 2 * (L - 1),
  perLevel: [{ stat: 'mainAttribute', type: 'flat', value: 3 }]   /* +3 to the hero's own attribute, so +3% damage, per level */
};

/* Evolution: heroes can evolve during a match by spending gold, once they reach the step's level.
   evolutions is a list of steps: { level, cost, choices: [...] }. With one choice the hero simply evolves; with several the
   player picks one. A choice is a new form of the hero: it can change the name, colour, damage type, ultimate, on-hit effects
   (applies), add base stats and tags, and gives its modifiers. For now every form also gets +50% to the main stats. */
const plus50 = ['damage', 'range', 'speed'].map(stat => ({ stat, type: 'more', value: 0.5, scope: ['all'] }));
/* Spell casters attack at their cast speed (castSpeed), not attack speed, so their evolutions raise that instead. */
const plus50cast = ['damage', 'range', 'castSpeed'].map(stat => ({ stat, type: 'more', value: 0.5, scope: ['all'] }));
const always = stat => ({ stat, type: 'flat', value: 1, scope: ['all'] });   /* a 100% chance */

/* The playable heroes. A player brings up to LINEUP_SIZE of them into a match, one of each, free to place.
   archetype: melee | range | spell. Every hero's tags include its archetype and its own id.
   To add a hero: add an entry here and a talent tree in talents.js. A new "kind" also needs a behavior in behaviors.js. */
export const LINEUP_SIZE = 3;
export const HEROES = [
  { id: 'warrior', name: 'Warrior', archetype: 'melee', attribute: 'strength', kind: 'swing', damageType: 'physical', color: '#c7ced6', shape: [5, -Math.PI / 2], tags: ['melee', 'physical'],
    stats: withEnergy({ damage: 28, range: 60, cooldown: 0.8, speed: 1, arc: 120 }, { strength: 10, dexterity: 4, intellect: 2 }), ultimate: 'empowered',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'berserker', name: 'Berserker', color: '#e5645a', kind: 'doubleswing', ultimate: 'frenzy', mods: [...plus50, always('bleedChance')],
        short: 'Swings twice in quick succession, and every hit makes enemies bleed.', ultShort: 'Frenzy: +50% damage and attack speed for 5 seconds.' },
      { id: 'commander', name: 'Commander', color: '#7fb3ff', kind: 'launch', ultimate: 'rally', stats: { range: 110 }, mods: plus50,
        short: 'Launches the sword forward, hitting every enemy in its way.', ultShort: 'Rally: doubles energy from attacks for nearby heroes (and himself) for 5 seconds.' },
      { id: 'sentinel', name: 'Sentinel', color: '#c9b37e', ultimate: 'barricade', mods: plus50,
        short: 'The same swing, and a barricade to hold the line.', ultShort: 'Barricade: blocks the path, stopping enemies for 1 second.' }
    ] }],
    desc: 'Warrior (melee): swings at close range, hitting every enemy in the arc. Evolves into a Berserker, Commander or Sentinel.',
    short: 'Swings a blade at close range, hitting every enemy in front of him. At level 10, choose a path.' },
  { id: 'ranger', name: 'Ranger', archetype: 'range', attribute: 'dexterity', kind: 'bolt', projLook: 'arrow', projSpeed: 620, damageType: 'physical', color: '#f2b84b', shape: [0, 0],
    tags: ['range', 'projectile', 'physical'],
    stats: withEnergy({ damage: 16, range: 120, cooldown: 0.5, speed: 1 }, { strength: 4, dexterity: 10, intellect: 3 }), ultimate: 'empowered',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'marksman', name: 'Marksman', color: '#ffd76a', ultimate: 'piercing', mods: plus50,
        short: 'Same arrows, more of them.', ultShort: 'Charges a powerful arrow that pierces every enemy in its path.' },
      { id: 'boomeranger', name: 'Boomerang Ranger', color: '#8be28b', kind: 'boom', ultimate: 'orbit', tags: ['thrown'], mods: plus50,
        short: 'Throws a boomerang that hits every enemy on the way out and back.', ultShort: 'A boomerang spins around the Ranger, hitting everything it touches.' },
      { id: 'hunter', name: 'Hunter', color: '#7ad04b', damageType: 'toxic', ultimate: 'traps', tags: ['toxic'], mods: plus50,
        short: 'Arrows deal toxic damage.', ultShort: 'Lays traps on the path that burst with heavy toxic damage when stepped on.' }
    ] }],
    desc: 'Ranger (range): fast arrows at the enemy closest to your gate. Evolves into a Marksman, Boomerang Ranger or Hunter.',
    short: 'Long range and fast. Shoots arrows at the enemy closest to your gate. At level 10, choose a path.' },
  { id: 'mage', name: 'Mage', archetype: 'spell', attribute: 'intellect', kind: 'bolt', damageType: 'spell', color: '#c39bf2', shape: [4, -Math.PI / 2], tags: ['spell', 'arcane'],
    rate: 'castSpeed', stats: withEnergy({ damage: 26, range: 110, cooldown: 1, castSpeed: 1, targets: 1 }, { strength: 2, dexterity: 4, intellect: 10 }), ultimate: 'empowered',
    /* At level 10 the Mage picks an element. The slow is the Frost Mage's old chill effect, kept for exactly this. */
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'firemage', name: 'Fire Mage', color: '#ff7a45', damageType: 'fire', ultimate: 'inferno', tags: ['fire'],
        mods: [...plus50cast, always('burnChance')],
        short: 'Bolts deal fire damage and set enemies on fire.', ultShort: 'Sets every enemy on the map on fire.' },
      { id: 'coldmage', name: 'Cold Mage', color: '#72c8f0', damageType: 'cold', ultimate: 'blizzard', tags: ['cold'],
        applies: { chill: 'chillTime' }, stats: { chillTime: 1.5 }, mods: plus50cast,
        short: 'Bolts deal cold damage and slow enemies to half speed.', ultShort: 'Freezes every enemy in place.' },
      { id: 'lightningmage', name: 'Lightning Mage', color: '#d6a2ff', damageType: 'lightning', ultimate: 'storm', tags: ['lightning'],
        mods: [...plus50cast, always('shockChance')],
        short: 'Bolts deal lightning damage and shock enemies, lowering their defenses.', ultShort: 'Calls a storm that strikes and shocks enemies around the Mage.' }
    ] }],
    desc: 'Mage (spell): fires a magic bolt at the enemy closest to your gate. Evolves into a Fire, Cold or Lightning Mage.',
    short: 'Fires a magic bolt at the enemy closest to your gate. At level 10, choose an element.' },
  /* The Rogue: two quick strikes and a higher crit chance; its ultimate marks every enemy, making them easier to crit.
     Its evolutions go for "the strongest, toughest enemy": the one in range with the most life left. */
  { id: 'rogue', name: 'Rogue', archetype: 'melee', attribute: 'dexterity', kind: 'doubleswing', damageType: 'physical', color: '#4fb3a9', shape: [3, -Math.PI / 2],
    tags: ['melee', 'physical'],
    stats: withEnergy({ damage: 17, range: 60, cooldown: 0.75, speed: 1, arc: 100 }, { strength: 4, dexterity: 10, intellect: 3, critChance: 0.1 }), ultimate: 'mark',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'assassin', name: 'Assassin', color: '#9b6bd6', kind: 'assassin', ultimate: 'clones', stats: { range: 130 },
        mods: [...plus50, { stat: 'damage', type: 'more', value: 1, scope: ['all'] }],
        short: 'Teleports behind the strongest, toughest enemy in range and strikes once, for double damage.', ultShort: 'Clones appear behind every enemy on the map and strike each one twice.' },
      { id: 'toxicologist', name: 'Toxicologist', color: '#a6d94a', kind: 'daggers', damageType: 'toxic', ultimate: 'poisonflask', tags: ['projectile', 'toxic'],
        stats: { range: 120 }, mods: [...plus50, always('poisonChance')],
        short: 'Throws two toxic daggers at the strongest, toughest enemy in range; each one poisons.', ultShort: 'A bottle of poison leaves a puddle that poisons every enemy walking through it.' },
      { id: 'alchemist', name: 'Alchemist', color: '#ff9f43', kind: 'concoctions', damageType: 'fire', ultimate: 'oil', tags: ['projectile', 'fire', 'toxic'],
        stats: { range: 120 }, mods: [...plus50, always('burnChance'), always('poisonChance')],
        short: 'Throws two concoctions at the strongest, toughest enemy in range: fire that burns, then toxic that poisons.', ultShort: 'Flammable puddles slow enemies; a burning enemy on one makes it explode.' }
    ] }],
    desc: 'Rogue (melee): two quick strikes, with a higher chance of critical hits. Evolves into an Assassin, Toxicologist or Alchemist.',
    short: 'Strikes twice in quick succession, with a knack for critical hits. At level 10, choose a path.' },
  /* The Druid: a spell caster whose thorny bolts can root enemies in place (rootChance); its ultimate lends that power to
     the heroes around it. Each evolution replaces the bolt with something of its own: a wolf, thorns on the path, or
     moonlight that hits every enemy in range. */
  { id: 'druid', name: 'Druid', archetype: 'spell', attribute: 'intellect', kind: 'bolt', projLook: 'seed', projSpeed: 460, damageType: 'physical', color: '#8fbf5a',
    shape: [6, 0], tags: ['spell', 'projectile', 'physical', 'nature'], rate: 'castSpeed',
    stats: withEnergy({ damage: 24, range: 115, cooldown: 0.85, castSpeed: 1, targets: 1 }, { strength: 3, dexterity: 4, intellect: 10, rootChance: 0.15 }), ultimate: 'grasp',
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'animalic', name: 'Animalic Druid', color: '#c98a4b', kind: 'wolf', ultimate: 'enrage', tags: ['melee', 'minion'], stats: { range: 130 },
        mods: [...plus50cast, always('bleedChance'), { stat: 'damage', type: 'more', value: 0.25, scope: ['all'] }],
        short: 'A wolf runs after the enemy furthest along the path and bites everything in front of it; its bites bleed.',
        ultShort: 'Enrages the wolf: bigger and stronger, with twice the reach and twice the damage, for 6 seconds.' },
      { id: 'naturist', name: 'Naturist Druid', color: '#5fcf6a', kind: 'thorns', ultimate: 'spikes', tags: ['area'],
        mods: plus50cast,
        short: 'Grows thorns on the path ahead of the enemies; they hurt everything standing in them for 1.5 seconds. Cast speed grows them faster.',
        ultShort: 'Every thorn patch erupts in spikes, dealing heavy damage to each enemy standing in one.' },
      { id: 'lunar', name: 'Lunar Druid', color: '#b8c8ff', kind: 'moonbeam', damageType: 'cold', ultimate: 'moonfall', tags: ['cold'],
        applies: { chill: 'chillTime' }, stats: { chillTime: 1 }, mods: plus50cast,
        short: 'Moonlight beams every enemy in range at once with cold damage, slowing them.',
        ultShort: 'Brings down a moon that smashes the enemies around where it lands.' }
    ] }],
    desc: 'Druid (spell): thorny bolts that can root enemies in place. Evolves into an Animalic, Naturist or Lunar Druid.',
    short: 'Shoots thorny bolts that can root enemies in place (15%). At level 10, choose a path.' }
];
HEROES.forEach(h => h.tags.push(h.id));

/* A hero's evolved form: the base hero with the choice's changes on top. The id stays the base hero's, so talents, items
   and the lineup keep working; form holds the choice's id. */
export function evolvedDef(base, choice) {
  return {
    ...base, form: choice.id, name: choice.name, color: choice.color || base.color, kind: choice.kind || base.kind,
    damageType: choice.damageType || base.damageType, ultimate: choice.ultimate || base.ultimate,
    applies: choice.applies || base.applies, short: choice.short || base.short,
    stats: { ...base.stats, ...(choice.stats || {}) }, tags: [...base.tags, ...(choice.tags || [])]
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

/* The five levels. Each has a wave count (15, then 5 more each), an enemy health multiplier and a per-wave growth rate. */
export const STAGES = [
  { n: 1, waves: 15, hpMult: 1,   growth: 1.14 },
  { n: 2, waves: 20, hpMult: 1.2, growth: 1.15 },
  { n: 3, waves: 25, hpMult: 1.5, growth: 1.16 },
  { n: 4, waves: 30, hpMult: 2,   growth: 1.17 },
  { n: 5, waves: 35, hpMult: 2.5, growth: 1.18 }
];

export const STAT_LABELS = {
  damage: 'Damage', range: 'Range', speed: 'Attacks per second', chillTime: 'Chill duration (s)', jumps: 'Chain jumps',
  rampRate: 'Beam ramp speed', arc: 'Swing arc (°)', targets: 'Targets per attack',
  strength: 'Strength', dexterity: 'Dexterity', intellect: 'Intellect', mainAttribute: 'Main attribute',
  castSpeed: 'Casts per second', critChance: 'Crit chance', critDamage: 'Crit damage (multiplier)',
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
  { name: 'Bulk order',        desc: m => 'Evolutions cost ' + f(P(15) * m) + '% less', label: 'Economy', mods: m => [glob('evolveCost', 'more', -P(0.15) * m)] },
  { name: 'Split bolt',        desc: m => 'Spell attacks: ' + f(P(100) * m) + '% chance to hit 1 more target', mods: m => [hero('targets', 'flat', P(1) * m, ['spell'])] },
  { name: 'Tax collector',     desc: m => '+' + f(25 * m) + '% gold for clearing a wave', label: 'Economy', mods: m => [glob('waveGold', 'inc', 0.25 * m)] },
  { name: 'Compound interest', desc: m => 'After each wave, get ' + f(5 * m) + '% of your gold (max ' + 60 * m + '). Copies add up.',
    label: 'Economy', mods: m => [glob('interest', 'flat', 0.05 * m), glob('interestCap', 'flat', 60 * m)] },
  { name: 'Fine arrows',       desc: m => '+' + f(P(30) * m) + '% damage to projectile heroes', mods: m => [hero('damage', 'inc', P(0.3) * m, ['projectile'])] },
  { name: 'Whetstone',         desc: m => '+' + f(P(30) * m) + '% damage to melee heroes',      mods: m => [hero('damage', 'inc', P(0.3) * m, ['melee'])] },
  { name: 'Arcane focus',      desc: m => '+' + f(P(30) * m) + '% damage to spell heroes',      mods: m => [hero('damage', 'inc', P(0.3) * m, ['spell'])] },
  { name: 'Wide swing',        desc: m => '+' + f(P(20) * m) + '° swing arc',                    mods: m => [hero('arc', 'flat', P(20) * m, ['melee'])] },
  { name: 'Keen edge',         desc: m => '+' + f(P(20) * m) + '% crit chance',                  mods: m => [hero('critChance', 'flat', P(0.2) * m, ['all'])] },
  { name: 'Cruelty',           desc: m => '+' + f(P(50) * m) + '% crit damage',                  mods: m => [hero('critDamage', 'flat', P(0.5) * m, ['all'])] },
  { name: 'Quick incantation', desc: m => '+' + f(P(20) * m) + '% cast speed (spell heroes)',    mods: m => [hero('castSpeed', 'inc', P(0.2) * m, ['spell'])] },
  /* Minion counterparts of the damage relics (for the Animalic Druid's wolf). lineup: only offered when one of these heroes
     is in the match. */
  { name: 'Pack leader',       desc: m => '+' + f(P(30) * m) + '% minion damage',      lineup: ['druid'], mods: m => [hero('minionDamage', 'inc', P(0.3) * m, ['minion'])] },
  { name: 'Feral haste',       desc: m => '+' + f(P(20) * m) + '% minion attack speed', lineup: ['druid'], mods: m => [hero('minionSpeed', 'inc', P(0.2) * m, ['minion'])] },
  { name: 'Hunting instinct',  desc: m => '+' + f(P(20) * m) + '% minion crit chance',  lineup: ['druid'], mods: m => [hero('minionCritChance', 'flat', P(0.2) * m, ['minion'])] },
  { name: 'Savage bite',       desc: m => '+' + f(P(50) * m) + '% minion crit damage',  lineup: ['druid'], mods: m => [hero('minionCritDamage', 'flat', P(0.5) * m, ['minion'])] }
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
