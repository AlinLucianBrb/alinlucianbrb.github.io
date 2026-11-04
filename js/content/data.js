/* Game content as data. Heroes have TAGS (what they are) and base STATS (what they do).
   Relics and talents are lists of MODIFIERS that target a stat on heroes carrying certain tags, like Path of Exile.
   To add a hero: add an entry here. A new "kind" also needs a behavior in behaviors.js. */
import { COMBAT_STATS, COMBAT_LABELS } from './combat.js';

export const COLS = 16, ROWS = 10, T = 40;

/* Energy: every hero has a bar that fills as it attacks (and/or over time). When it is full, the next attack is the hero's
   ultimate (see js/engine/ultimates.js). These are the defaults; a hero can override them, and talents, relics and items
   can change them like any other stat. */
export const ENERGY = { energyMax: 100, energyPerAttack: 20, energyPerSecond: 0 };
/* Every hero gets the energy stats and the combat stats (added damage by type, ailment chances), so anything can raise them. */
const withEnergy = (stats, own = {}) => ({ ...stats, ...ENERGY, ...COMBAT_STATS, ...own });

/* Hero levels during a match: every hero on the field gains XP from each enemy killed (the enemy's xp value, see enemies.js),
   whoever landed the blow. Each level adds perLevel (scaled by levels gained); xpToNext(L) is the XP from level L to L + 1. */
export const HERO_LEVELS = {
  max: 30,
  xpToNext: L => 10 + 2 * (L - 1),
  perLevel: [{ stat: 'damage', type: 'inc', value: 0.03 }]
};

/* Evolution: heroes can evolve during a match by spending gold, once they reach the step's level.
   evolutions is a list of steps: { level, cost, choices: [...] }. With one choice the hero simply evolves; with several the
   player picks one. A choice is a new form of the hero: it can change the name, colour, damage type, ultimate, on-hit effects
   (applies), add base stats and tags, and gives its modifiers. For now every form also gets +50% to the main stats. */
const plus50 = ['damage', 'range', 'speed'].map(stat => ({ stat, type: 'more', value: 0.5, scope: ['all'] }));
const always = stat => ({ stat, type: 'flat', value: 1, scope: ['all'] });   /* a 100% chance */

/* The playable heroes. A player brings up to LINEUP_SIZE of them into a match, one of each, free to place.
   archetype: melee | range | spell. Every hero's tags include its archetype and its own id.
   To add a hero: add an entry here and a talent tree in talents.js. A new "kind" also needs a behavior in behaviors.js. */
export const LINEUP_SIZE = 3;
export const HEROES = [
  { id: 'warrior', name: 'Warrior', archetype: 'melee', kind: 'swing', damageType: 'physical', color: '#c7ced6', shape: [5, -Math.PI / 2], tags: ['melee', 'physical'],
    stats: withEnergy({ damage: 28, range: 60, cooldown: 0.8, speed: 1, arc: 120 }), ultimate: 'empowered',
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
  { id: 'ranger', name: 'Ranger', archetype: 'range', kind: 'bolt', projLook: 'arrow', projSpeed: 620, damageType: 'physical', color: '#f2b84b', shape: [0, 0],
    tags: ['range', 'projectile', 'physical'],
    stats: withEnergy({ damage: 16, range: 120, cooldown: 0.5, speed: 1 }), ultimate: 'empowered',
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
  { id: 'mage', name: 'Mage', archetype: 'spell', kind: 'bolt', damageType: 'spell', color: '#c39bf2', shape: [4, -Math.PI / 2], tags: ['spell', 'arcane'],
    stats: withEnergy({ damage: 26, range: 110, cooldown: 1, speed: 1, targets: 1 }), ultimate: 'empowered',
    /* At level 10 the Mage picks an element. The slow is the Frost Mage's old chill effect, kept for exactly this. */
    evolutions: [{ level: 10, cost: 150, choices: [
      { id: 'firemage', name: 'Fire Mage', color: '#ff7a45', damageType: 'fire', ultimate: 'inferno', tags: ['fire'],
        mods: [...plus50, always('burnChance')],
        short: 'Bolts deal fire damage and set enemies on fire.', ultShort: 'Sets every enemy on the map on fire.' },
      { id: 'coldmage', name: 'Cold Mage', color: '#72c8f0', damageType: 'cold', ultimate: 'blizzard', tags: ['cold'],
        applies: { chill: 'chillTime' }, stats: { chillTime: 1.5 }, mods: plus50,
        short: 'Bolts deal cold damage and slow enemies to half speed.', ultShort: 'Freezes every enemy in place.' },
      { id: 'lightningmage', name: 'Lightning Mage', color: '#d6a2ff', damageType: 'lightning', ultimate: 'storm', tags: ['lightning'],
        mods: [...plus50, always('shockChance')],
        short: 'Bolts deal lightning damage and shock enemies, lowering their defenses.', ultShort: 'Calls a storm that strikes and shocks enemies around the Mage.' }
    ] }],
    desc: 'Mage (spell): fires a magic bolt at the enemy closest to your gate. Evolves into a Fire, Cold or Lightning Mage.',
    short: 'Fires a magic bolt at the enemy closest to your gate. At level 10, choose an element.' }
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
  energyMax: 'Energy needed', energyPerAttack: 'Energy per attack', energyPerSecond: 'Energy per second',
  ...COMBAT_LABELS, relicLuck: 'Relic luck',
  bounty: 'Gold per kill', startGold: 'Starting gold', startLives: 'Starting lives', waveGold: 'Wave clear gold', evolveCost: 'Evolution cost', interest: 'Interest', interestCap: 'Interest limit'
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
   Relics are defined at Common strength; m is the rarity multiplier: Common 1, Uncommon 2, Rare 3, Epic 4 (always a whole number). */
const f = x => +x.toFixed(1);
const hero = (stat, type, value, scope) => ({ stat, type, value, scope });
const glob = (stat, type, value) => ({ stat, type, value, scope: 'global' });
export const RELICS = [
  { name: 'Sharpened rounds',  desc: m => '+' + f(25 * m) + '% damage (all heroes)',  mods: m => [hero('damage', 'inc', 0.25 * m, ['all'])] },
  { name: 'Long barrels',      desc: m => '+' + f(15 * m) + '% range',               mods: m => [hero('range', 'inc', 0.15 * m, ['all'])] },
  { name: 'Quick hands',       desc: m => '+' + f(20 * m) + '% attack speed',        mods: m => [hero('speed', 'inc', 0.2 * m, ['all'])] },
  { name: 'Four-leaf clover',  desc: m => '+' + f(50 * m) + '% relic luck: rarer relics turn up more often', label: 'Relic luck', mods: m => [glob('relicLuck', 'flat', 0.5 * m)] },
  { name: 'Battle focus',      desc: m => '+' + f(25 * m) + '% energy from attacks, so ultimates come sooner', mods: m => [hero('energyPerAttack', 'inc', 0.25 * m, ['all'])] },
  { name: 'Prospector',        desc: m => '+' + f(2 * m) + ' gold per kill',         label: 'Economy', mods: m => [glob('bounty', 'flat', 2 * m)] },
  { name: 'Reinforced gate',   desc: m => '+' + 5 * m + ' lives',                    label: 'Your gate', onPick: (g, m) => { g.lives += 5 * m; } },
  { name: 'Bulk order',        desc: m => 'Evolutions cost ' + f(15 * m) + '% less', label: 'Economy', mods: m => [glob('evolveCost', 'more', -0.15 * m)] },
  { name: 'Split bolt',        desc: m => 'Spell attacks hit +' + m + ' more target' + (m > 1 ? 's' : ''), mods: m => [hero('targets', 'flat', m, ['spell'])] },
  { name: 'Tax collector',     desc: m => '+' + f(50 * m) + '% gold for clearing a wave', label: 'Economy', mods: m => [glob('waveGold', 'inc', 0.5 * m)] },
  { name: 'Compound interest', desc: m => 'After each wave, earn ' + f(5 * m) + '% of your unspent gold as interest, up to ' + 60 * m + ' gold. More copies stack: their % and limits add up.',
    label: 'Economy', mods: m => [glob('interest', 'flat', 0.05 * m), glob('interestCap', 'flat', 60 * m)] },
  { name: 'Fine arrows',       desc: m => '+' + f(30 * m) + '% damage to projectile heroes', mods: m => [hero('damage', 'inc', 0.3 * m, ['projectile'])] },
  { name: 'Whetstone',         desc: m => '+' + f(30 * m) + '% damage to melee heroes',      mods: m => [hero('damage', 'inc', 0.3 * m, ['melee'])] },
  { name: 'Arcane focus',      desc: m => '+' + f(30 * m) + '% damage to spell heroes',      mods: m => [hero('damage', 'inc', 0.3 * m, ['spell'])] },
  { name: 'Wide swing',        desc: m => '+' + f(20 * m) + '° swing arc',                    mods: m => [hero('arc', 'flat', 20 * m, ['melee'])] }
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
