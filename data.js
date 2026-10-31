/* Game content as data. To add a tower or relic, add an entry here (towers also need a handler for their "kind" in game.js). */
export const TOWERS = [
  { name: 'Gun',       kind: 'shot',  cost: 50,  range: 110, dmg: 10, rate: 0.5, color: '#f2b84b', shape: [0, 0],
    desc: 'Gun: fast single shots at the enemy closest to your gate.' },
  { name: 'Frost',     kind: 'shot',  cost: 70,  range: 90,  dmg: 3,  rate: 0.8, color: '#72c8f0', shape: [4, -Math.PI / 2], slow: 1.5,
    desc: 'Frost: weak hits that slow enemies by half.' },
  { name: 'Beam',      kind: 'beam',  cost: 120, range: 100, dmg: 10, rate: 0,   color: '#ff6f91', shape: [3, -Math.PI / 2],
    desc: 'Beam: continuous beam. Damage ramps up to 4× the longer it stays on one target.' },
  { name: 'Boomerang', kind: 'boom',  cost: 100, range: 130, dmg: 12, rate: 0.7, color: '#8be28b', shape: [4, Math.PI / 4],
    desc: 'Boomerang: thrown out and back, hitting every enemy it passes on both trips.' },
  { name: 'Chain',     kind: 'chain', cost: 110, range: 100, dmg: 9,  rate: 1.1, color: '#d6a2ff', shape: [6, 0], jumps: 3, jumpRange: 80,
    desc: 'Chain: lightning that jumps to several nearby enemies, weaker with each jump.' }
];


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
/* Every relic is defined at Common strength; m is the rarity multiplier (1, 1.5, 2, 3). */
const f = x => +x.toFixed(1);
export const RELICS = [
  { name: 'Sharpened rounds',  desc: m => '+' + f(25 * m) + '% damage (all towers)',        apply: (s, m) => s.mods.dmg *= 1 + 0.25 * m },
  { name: 'Long barrels',      desc: m => '+' + f(15 * m) + '% range',                      apply: (s, m) => s.mods.range *= 1 + 0.15 * m },
  { name: 'Quick hands',       desc: m => '+' + f(20 * m) + '% fire rate',                  apply: (s, m) => s.mods.rate *= 1 + 0.2 * m },
  { name: 'Prospector',        desc: m => '+' + f(2 * m) + ' gold per kill',                apply: (s, m) => s.mods.bounty += 2 * m },
  { name: 'Reinforced gate',   desc: m => '+' + Math.round(5 * m) + ' lives',               apply: (s, m) => s.lives += Math.round(5 * m) },
  { name: 'Bulk order',        desc: m => 'Towers cost ' + f(15 * m) + '% less',            apply: (s, m) => s.mods.discount = Math.max(0.25, s.mods.discount * (1 - 0.15 * m)) },
  { name: 'Deep freeze',       desc: m => 'Frost slows ' + f(m) + 's longer',               apply: (s, m) => s.mods.slowBonus += m },
  { name: 'Tax collector',     desc: m => '+' + f(50 * m) + '% gold for clearing a wave',   apply: (s, m) => s.mods.waveBonus += 0.5 * m },
  { name: 'Compound interest', desc: m => 'Wave clear pays ' + f(5 * m) + '% of your gold (max 60)', apply: (s, m) => s.mods.interest += 0.05 * m },
  { name: 'Hardened ammo',     desc: m => '+' + f(30 * m) + '% Gun and Frost damage',       apply: (s, m) => s.mods.kd.shot *= 1 + 0.3 * m },
  { name: 'Prism',             desc: m => '+' + f(30 * m) + '% Beam damage',                apply: (s, m) => s.mods.kd.beam *= 1 + 0.3 * m },
  { name: 'Focusing lens',     desc: m => 'Beam ramps up ' + f(40 * m) + '% faster',        apply: (s, m) => s.mods.ramp += 0.4 * m },
  { name: 'Razor edge',        desc: m => '+' + f(30 * m) + '% Boomerang damage',           apply: (s, m) => s.mods.kd.boom *= 1 + 0.3 * m },
  { name: 'Storm core',        desc: m => '+' + f(30 * m) + '% Chain damage',               apply: (s, m) => s.mods.kd.chain *= 1 + 0.3 * m },
  { name: 'Extra link',        desc: m => '+' + Math.round(m) + ' Chain jump' + (Math.round(m) > 1 ? 's' : ''), apply: (s, m) => s.mods.jumps += Math.round(m) }
];
