/* The match shop (unlocked in act 3, js/content/unlocks.js): ground effects for tiles, a gamble, and a boss to summon for gold.
   The engine side is js/engine/shop.js (buying), tiles.js (ground effects) and boss-gimmicks.js. Prices are match gold. */

/* Ground effects: bought for a tile, upgraded twice, there for the rest of the match. They work for their owner's hero
   standing on the tile. values: one per level.
   - greed: gold from that hero's kills is multiplied;
   - conduit: that share of the stats of the owner's heroes on the 8 tiles around it moves to the hero inside (they lose it):
     damage, the three attributes, crits and penetration; not range, speed or energy. */
export const TILE_EFFECTS = {
  greed:   { name: 'Greed',   color: '#f2b84b', values: [2, 2.5, 3], text: x => '×' + x + ' gold from the kills of the hero on it' },
  conduit: { name: 'Conduit', color: '#b58cf0', values: [0.5, 0.6, 0.7], text: x => 'The hero on it takes ' + Math.round(x * 100) + '% of the damage, attributes, crits and penetration of your heroes on the 8 tiles around' }
};
export const TILES = { max: 4, first: 300, more: 150, upgrade: [400, 800], levels: 3 };

/* Gambling: `first` gold, `more` for each one before it this match, at most perWave times a wave. Chances are in %.
   Relics with a one-time effect (onPick) are never lost or raised. An outcome that cannot happen becomes `otherwise`. */
export const GAMBLE = { first: 150, more: 50, perWave: 3 };
export const OUTCOMES = [
  { id: 'relic',   chance: 28, text: 'A random relic' },
  { id: 'nothing', chance: 20, text: 'Nothing' },
  { id: 'raise',   chance: 15, text: 'One of your relics goes up a rarity', otherwise: 'relic' },
  { id: 'lose',    chance: 15, text: 'You lose a random relic', otherwise: 'nothing' },
  { id: 'jackpot', chance: 10, text: 'Jackpot: 4 times what you paid' },
  { id: 'two',     chance: 7,  text: 'Two random relics' },
  { id: 'curse',   chance: 5,  text: 'Cursed: the next wave has +30% life but pays double gold', otherwise: 'nothing' }
];
export const JACKPOT = 4;
export const CURSE = { life: 0.3, gold: 1 };          /* per curse on the same wave: they add up */

/* Summoned bosses: one at a time joins the wave, then `cooldown` waves must pass. Each one after the first has `life` more
   life and pays `pay` more. No items, not a kill. kinds: enemy types (enemies.js), what each does is in boss-gimmicks.js. */
export const SUMMON_BOSS = { cooldown: 5, gold: 150, perWave: 15, life: 0.15, pay: 0.25,
  kinds: {
    bossSplitter: { name: 'Splitter', text: 'Splits into two halves at half its life.' },
    bossCharger:  { name: 'Charger',  text: 'Speeds up as it loses life.' },
    bossWarded:   { name: 'Warded',   text: 'Every 5 seconds it resists the damage type that hurt it most by 75%.' },
    bossThief:    { name: 'Thief',    text: 'Steals 10 gold every 3 seconds until it dies, then pays it back twice.' },
    bossBlinker:  { name: 'Blinker',  text: 'Jumps 2 tiles forward at 75%, 50% and 25% life.' }
  } };
export const summonReward = (wave, before) => Math.floor((SUMMON_BOSS.gold + SUMMON_BOSS.perWave * wave) * Math.pow(1 + SUMMON_BOSS.pay, before));
