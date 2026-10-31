/* Game content as data. Towers have TAGS (what they are) and base STATS (what they do).
   Relics are lists of MODIFIERS that target a stat on towers carrying certain tags, like Path of Exile.
   To add a tower: add an entry here. A new "kind" also needs a behavior in behaviors.js. */
export const COLS = 16, ROWS = 10, T = 40;

export const TOWERS = [
  { name: 'Gun', kind: 'shot', cost: 50, color: '#f2b84b', shape: [0, 0], tags: ['bullet', 'physical'],
    stats: { damage: 10, range: 110, cooldown: 0.5, speed: 1 },
    desc: 'Gun: fast single shots at the enemy closest to your gate.' },
  { name: 'Frost', kind: 'shot', cost: 70, color: '#72c8f0', shape: [4, -Math.PI / 2], tags: ['bullet', 'cold'],
    stats: { damage: 3, range: 90, cooldown: 0.8, speed: 1, chillTime: 1.5 }, applies: { chill: 'chillTime' },
    desc: 'Frost: weak hits that chill enemies, slowing them by half.' },
  { name: 'Beam', kind: 'beam', cost: 120, color: '#ff6f91', shape: [3, -Math.PI / 2], tags: ['beam', 'fire'], dps: true,
    stats: { damage: 10, range: 100, rampRate: 1 },
    desc: 'Beam: continuous beam. Damage ramps up to 4× the longer it stays on one target.' },
  { name: 'Boomerang', kind: 'boom', cost: 100, color: '#8be28b', shape: [4, Math.PI / 4], tags: ['thrown', 'physical'],
    stats: { damage: 12, range: 130, cooldown: 0.7, speed: 1 },
    desc: 'Boomerang: thrown out and back, hitting every enemy it passes on both trips.' },
  { name: 'Chain', kind: 'chain', cost: 110, color: '#d6a2ff', shape: [6, 0], tags: ['chain', 'lightning'],
    stats: { damage: 9, range: 100, cooldown: 1.1, speed: 1, jumps: 3 },
    desc: 'Chain: lightning that jumps to several nearby enemies, weaker with each jump.' }
];

export const STAT_LABELS = { damage: 'Damage', range: 'Range', speed: 'Attacks per second', chillTime: 'Chill duration (s)', jumps: 'Chain jumps', rampRate: 'Beam ramp speed' };

export const RARITIES = [
  { name: 'Common',   mult: 1,   weight: 55, color: '#ecf1e8' },
  { name: 'Uncommon', mult: 1.5, weight: 28, color: '#5fd46f' },
  { name: 'Rare',     mult: 2,   weight: 13, color: '#5aa9ff' },
  { name: 'Epic',     mult: 3,   weight: 4,  color: '#c084fc' }
];
export function rollRarity() {
  let r = Math.random() * RARITIES.reduce((a, x) => a + x.weight, 0);
  for (let i = 0; i < RARITIES.length; i++) { if ((r -= RARITIES[i].weight) < 0) return i; }
  return 0;
}

/* Modifier: { stat, type: 'inc' | 'more' | 'flat', value, scope }.
   scope is a list of tower tags (or ['all']) for tower stats, or 'global' for economy stats.
   Defined at Common strength; m is the rarity multiplier (1, 1.5, 2, 3). */
const f = x => +x.toFixed(1);
const tower = (stat, type, value, scope) => ({ stat, type, value, scope });
const glob = (stat, type, value) => ({ stat, type, value, scope: 'global' });
export const RELICS = [
  { name: 'Sharpened rounds',  desc: m => '+' + f(25 * m) + '% damage (all towers)', mods: m => [tower('damage', 'inc', 0.25 * m, ['all'])] },
  { name: 'Long barrels',      desc: m => '+' + f(15 * m) + '% range',              mods: m => [tower('range', 'inc', 0.15 * m, ['all'])] },
  { name: 'Quick hands',       desc: m => '+' + f(20 * m) + '% attack speed',       mods: m => [tower('speed', 'inc', 0.2 * m, ['all'])] },
  { name: 'Prospector',        desc: m => '+' + f(2 * m) + ' gold per kill',        label: 'Economy', mods: m => [glob('bounty', 'flat', 2 * m)] },
  { name: 'Reinforced gate',   desc: m => '+' + Math.round(5 * m) + ' lives',       label: 'Your gate', onPick: (g, m) => { g.lives += Math.round(5 * m); } },
  { name: 'Bulk order',        desc: m => 'Towers cost ' + f(15 * m) + '% less',    label: 'Economy', mods: m => [glob('towerCost', 'more', -0.15 * m)] },
  { name: 'Deep freeze',       desc: m => 'Chill lasts ' + f(m) + 's longer',        mods: m => [tower('chillTime', 'flat', m, ['cold'])] },
  { name: 'Tax collector',     desc: m => '+' + f(50 * m) + '% gold for clearing a wave', label: 'Economy', mods: m => [glob('waveGold', 'inc', 0.5 * m)] },
  { name: 'Compound interest', desc: m => 'Wave clear pays ' + f(5 * m) + '% of your gold (max 60)', label: 'Economy', mods: m => [glob('interest', 'flat', 0.05 * m)] },
  { name: 'Hardened ammo',     desc: m => '+' + f(30 * m) + '% damage to bullet towers', mods: m => [tower('damage', 'inc', 0.3 * m, ['bullet'])] },
  { name: 'Prism',             desc: m => '+' + f(30 * m) + '% Beam damage',        mods: m => [tower('damage', 'inc', 0.3 * m, ['beam'])] },
  { name: 'Focusing lens',     desc: m => 'Beam ramps up ' + f(40 * m) + '% faster', mods: m => [tower('rampRate', 'inc', 0.4 * m, ['beam'])] },
  { name: 'Razor edge',        desc: m => '+' + f(30 * m) + '% damage to thrown towers', mods: m => [tower('damage', 'inc', 0.3 * m, ['thrown'])] },
  { name: 'Storm core',        desc: m => '+' + f(30 * m) + '% damage to chain towers', mods: m => [tower('damage', 'inc', 0.3 * m, ['chain'])] },
  { name: 'Extra link',        desc: m => '+' + Math.round(m) + ' Chain jump' + (Math.round(m) > 1 ? 's' : ''), mods: m => [tower('jumps', 'flat', Math.round(m), ['chain'])] }
];
