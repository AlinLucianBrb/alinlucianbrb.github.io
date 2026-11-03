/* Game content as data. Heroes have TAGS (what they are) and base STATS (what they do).
   Relics and talents are lists of MODIFIERS that target a stat on heroes carrying certain tags, like Path of Exile.
   To add a hero: add an entry here. A new "kind" also needs a behavior in behaviors.js. */
export const COLS = 16, ROWS = 10, T = 40;

/* archetype: melee | range | spell. Every hero's tags include its archetype and its own id. */
export const HEROES = [
  { id: 'warrior', name: 'Warrior', archetype: 'melee', kind: 'swing', cost: 60, color: '#c7ced6', shape: [5, -Math.PI / 2], tags: ['melee', 'physical'],
    stats: { damage: 16, range: 55, cooldown: 0.8, speed: 1, arc: 120 },
    desc: 'Warrior (melee): swings at close range, hitting every enemy in the arc.',
    short: 'Swings a blade at close range, hitting every enemy in front of him.' },
  { id: 'archer', name: 'Archer', archetype: 'range', kind: 'shot', cost: 50, color: '#f2b84b', shape: [0, 0], tags: ['range', 'projectile', 'physical'],
    stats: { damage: 10, range: 110, cooldown: 0.5, speed: 1 },
    desc: 'Archer (range): fast arrows at the enemy closest to your gate.',
    short: 'Cheap and fast. Shoots the enemy closest to your gate.' },
  { id: 'thief', name: 'Thief', archetype: 'range', kind: 'boom', cost: 100, color: '#8be28b', shape: [4, Math.PI / 4], tags: ['range', 'projectile', 'thrown', 'physical'],
    stats: { damage: 12, range: 130, cooldown: 0.7, speed: 1 },
    desc: 'Thief (range): throws a boomerang that hits everything on the way out and back.',
    short: 'Throws a boomerang that hits every enemy on the way out and back.' },
  { id: 'frostmage', name: 'Frost Mage', archetype: 'spell', kind: 'shot', cost: 70, color: '#72c8f0', shape: [4, -Math.PI / 2], tags: ['spell', 'cold'],
    stats: { damage: 3, range: 90, cooldown: 0.8, speed: 1, chillTime: 1.5, targets: 1 }, applies: { chill: 'chillTime' },
    desc: 'Frost Mage (spell): weak bolts that chill enemies, slowing them by half.',
    short: 'Weak bolts that slow enemies to half speed. Best next to damage dealers.' },
  { id: 'firemage', name: 'Fire Mage', archetype: 'spell', kind: 'beam', cost: 120, color: '#ff7a45', shape: [3, -Math.PI / 2], tags: ['spell', 'fire', 'beam'], dps: true,
    stats: { damage: 10, range: 100, rampRate: 1 },
    desc: 'Fire Mage (spell): continuous beam. Damage ramps up to 4× the longer it stays on one target.',
    short: 'A beam that burns hotter the longer it stays on one enemy (up to 4×).' },
  { id: 'lightningmage', name: 'Lightning Mage', archetype: 'spell', kind: 'chain', cost: 110, color: '#d6a2ff', shape: [6, 0], tags: ['spell', 'lightning', 'chain'],
    stats: { damage: 9, range: 100, cooldown: 1.1, speed: 1, jumps: 3 },
    desc: 'Lightning Mage (spell): lightning that jumps to several nearby enemies, weaker with each jump.',
    short: 'Lightning that jumps between nearby enemies, a little weaker each jump.' }
];
HEROES.forEach(h => h.tags.push(h.id));

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
  bounty: 'Gold per kill', startGold: 'Starting gold', startLives: 'Starting lives', waveGold: 'Wave clear gold', heroCost: 'Hero cost', interest: 'Interest', interestCap: 'Interest limit'
};

export const RARITIES = [
  { name: 'Common',   mult: 1,   weight: 55, color: '#ecf1e8' },
  { name: 'Uncommon', mult: 1.5, weight: 28, color: '#5fd46f' },
  { name: 'Rare',     mult: 2,   weight: 13, color: '#5aa9ff' },
  { name: 'Epic',     mult: 3,   weight: 4,  color: '#c084fc' }
];
/* r is a random number in [0, 1) supplied by the caller, so the engine can use its seeded generator. */
export function rollRarity(r01) {
  let r = r01 * RARITIES.reduce((a, x) => a + x.weight, 0);
  for (let i = 0; i < RARITIES.length; i++) { if ((r -= RARITIES[i].weight) < 0) return i; }
  return 0;
}

/* Modifier: { stat, type: 'inc' | 'more' | 'flat', value, scope }.
   scope is a list of hero tags (or ['all']) for hero stats, or 'global' for economy stats.
   Relics are defined at Common strength; m is the rarity multiplier (1, 1.5, 2, 3). */
const f = x => +x.toFixed(1);
const hero = (stat, type, value, scope) => ({ stat, type, value, scope });
const glob = (stat, type, value) => ({ stat, type, value, scope: 'global' });
export const RELICS = [
  { name: 'Sharpened rounds',  desc: m => '+' + f(25 * m) + '% damage (all heroes)',  mods: m => [hero('damage', 'inc', 0.25 * m, ['all'])] },
  { name: 'Long barrels',      desc: m => '+' + f(15 * m) + '% range',               mods: m => [hero('range', 'inc', 0.15 * m, ['all'])] },
  { name: 'Quick hands',       desc: m => '+' + f(20 * m) + '% attack speed',        mods: m => [hero('speed', 'inc', 0.2 * m, ['all'])] },
  { name: 'Prospector',        desc: m => '+' + f(2 * m) + ' gold per kill',         label: 'Economy', mods: m => [glob('bounty', 'flat', 2 * m)] },
  { name: 'Reinforced gate',   desc: m => '+' + Math.round(5 * m) + ' lives',        label: 'Your gate', onPick: (g, m) => { g.lives += Math.round(5 * m); } },
  { name: 'Bulk order',        desc: m => 'Heroes cost ' + f(15 * m) + '% less',     label: 'Economy', mods: m => [glob('heroCost', 'more', -0.15 * m)] },
  { name: 'Deep freeze',       desc: m => 'Frost attacks hit +' + Math.floor(m) + ' more target' + (Math.floor(m) > 1 ? 's' : ''), mods: m => [hero('targets', 'flat', Math.floor(m), ['cold'])] },
  { name: 'Tax collector',     desc: m => '+' + f(50 * m) + '% gold for clearing a wave', label: 'Economy', mods: m => [glob('waveGold', 'inc', 0.5 * m)] },
  { name: 'Compound interest', desc: m => 'After each wave, earn ' + f(5 * m) + '% of your unspent gold as interest, up to ' + Math.round(60 * m) + ' gold. More copies stack: their % and limits add up.',
    label: 'Economy', mods: m => [glob('interest', 'flat', 0.05 * m), glob('interestCap', 'flat', Math.round(60 * m))] },
  { name: 'Fine arrows',       desc: m => '+' + f(30 * m) + '% damage to projectile heroes', mods: m => [hero('damage', 'inc', 0.3 * m, ['projectile'])] },
  { name: 'Whetstone',         desc: m => '+' + f(30 * m) + '% damage to melee heroes',      mods: m => [hero('damage', 'inc', 0.3 * m, ['melee'])] },
  { name: 'Arcane focus',      desc: m => '+' + f(30 * m) + '% damage to spell heroes',      mods: m => [hero('damage', 'inc', 0.3 * m, ['spell'])] },
  { name: 'Wide swing',        desc: m => '+' + f(20 * m) + '° swing arc',                    mods: m => [hero('arc', 'flat', 20 * m, ['melee'])] },
  { name: 'Prism',             desc: m => '+' + f(30 * m) + '% Fire Mage damage',    mods: m => [hero('damage', 'inc', 0.3 * m, ['beam'])] },
  { name: 'Focusing lens',     desc: m => 'Beam ramps up ' + f(40 * m) + '% faster', mods: m => [hero('rampRate', 'inc', 0.4 * m, ['beam'])] },
  { name: 'Razor edge',        desc: m => '+' + f(30 * m) + '% Thief damage',        mods: m => [hero('damage', 'inc', 0.3 * m, ['thrown'])] },
  { name: 'Storm core',        desc: m => '+' + f(30 * m) + '% Lightning Mage damage', mods: m => [hero('damage', 'inc', 0.3 * m, ['chain'])] },
  { name: 'Extra link',        desc: m => '+' + Math.round(m) + ' Chain jump' + (Math.round(m) > 1 ? 's' : ''), mods: m => [hero('jumps', 'flat', Math.round(m), ['chain'])] }
];
