/* Match effects (from act 4, js/content/unlocks.js): after clearing the waves in MATCH_PICKS (endless has its own) the players choose one of three, or
   none, for the rest of the match; each is good and bad at once, and none comes twice. In co-op everyone votes. The engine side
   is js/engine/match-effects.js.
   mods: modifiers for every hero. flags: what the engine reads from w.fxm (FX_BASE); numbers multiply, true switches on.
   once: something done at the moment it is chosen. */
export const MATCH_PICKS = { waves: [15, 30, 45], endless: [10, 20, 30], offers: 3, seconds: 20 };   /* seconds: how long a co-op vote stays open */
const all = (stat, type, value) => ({ stat, type, value, scope: ['all'] });
export const MATCH_EFFECTS = {
  finetaste:  { name: 'Fine taste',   good: 'Only Epic relics are offered', bad: 'Relics from now on are 35% weaker', flags: { epicRelics: true, relicPower: 0.65 } },
  meltingpot: { name: 'Melting pot',  good: '+6% damage for every rarity your relics lose', bad: 'All your relics become Common', once: 'melt', perRarity: 0.06 },
  glass:      { name: 'Glass cannon', good: 'Heroes deal +40% damage', bad: 'Enemies that get through cost double lives', mods: [all('damage', 'more', 0.4)], flags: { leak: 2 } },
  adrenaline: { name: 'Adrenaline',   good: 'Heroes attack and cast 25% faster', bad: 'Enemies are 20% faster', mods: [all('speed', 'more', 0.25), all('castSpeed', 'more', 0.25)], flags: { enemySpeed: 1.2 } },
  giants:     { name: 'Giants',       good: 'Double gold and XP per kill', bad: 'Half as many enemies, each with 2.3 times the life', flags: { half: true, life: 2.3, killGold: 2, xp: 2 } },
  bloodmoney: { name: 'Blood money',  good: '+60% gold from kills', bad: 'No gold for clearing waves and no interest', flags: { killGold: 1.6, noWaveGold: true } },
  overcharge: { name: 'Overcharge',   good: 'Ultimates fill 50% faster', bad: 'Basic attacks deal 20% less', mods: [all('energyPerSecond', 'more', 0.5)], flags: { basic: 0.8 } },
  longshot:   { name: 'Long shot',    good: '+30% range', bad: 'Attack and cast speed are 15% lower', mods: [all('range', 'more', 0.3), all('speed', 'more', -0.15), all('castSpeed', 'more', -0.15)] },
  precision:  { name: 'Precision',    good: '+25% crit chance', bad: 'Hits that do not crit deal 20% less', mods: [all('critChance', 'flat', 0.25)], flags: { noCrit: 0.8 } },
  slowburn:   { name: 'Slow burn',    good: 'Damage over time +60%', bad: 'Direct hits deal 15% less', flags: { dot: 1.6, hit: 0.85 } }
};
/* A match with no effects. */
export const FX_BASE = { epicRelics: false, relicPower: 1, leak: 1, enemySpeed: 1, half: false, life: 1, killGold: 1, xp: 1, noWaveGold: false, basic: 1, noCrit: 1, dot: 1, hit: 1 };
