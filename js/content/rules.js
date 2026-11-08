/* The rules the server also has to know, in ONE place. The game reads them from here, and tools/rules-sql.mjs writes the
   database's copy from them (the rule_* functions in supabase-*.sql), so the two can never drift apart. Change a number
   here, run `npm run sql`, then run supabase-update.sql. Content the server needs (heroes, item types, item bonuses, the
   talent tree) is copied the same way by tools/content-sql.mjs; item rolls use ROLL and SELL in items.js, rarities and
   levels (STAGES) data.js. */

/* Account levels: XP needed to go from level L to L + 1. */
export const ACCOUNT = { xpBase: 50, xpPerLevel: 50 };
export const xpNeed = level => ACCOUNT.xpBase + level * ACCOUNT.xpPerLevel;

/* What a match pays into the account: XP per wave reached and per kill, gold per wave (talents add their bonus on top). */
export const REWARDS = { xpPerWave: 10, xpPerKill: 1, goldPerWave: 5 };
/* bonus: the reward bonuses from talents, { gold, xp } as fractions (see rewardBonus in js/content/talents.js). */
export const runRewards = (waves, kills, bonus = {}) => ({
  xp: Math.round((waves * REWARDS.xpPerWave + kills * REWARDS.xpPerKill) * (1 + (bonus.xp || 0))),
  gold: Math.round(waves * REWARDS.goldPerWave * (1 + (bonus.gold || 0)))
});

/* Waves: how many enemies wave w has, and the seconds between two of them. */
export const WAVES = { base: 5, perWave: 2 };
export const waveCount = w => WAVES.base + w * WAVES.perWave;
export const SPAWN = { start: 0.85, perWave: 0.02, min: 0.35 };
export const spawnDelay = w => Math.max(SPAWN.min, SPAWN.start - w * SPAWN.perWave);
/* The most kills a run that reached `waves` can have: every enemy of every wave (the waves add up to base x W + per x W(W+1)/2). */
export const killCap = waves => WAVES.base * waves + WAVES.perWave * waves * (waves + 1) / 2;

/* Bosses: the last wave of every level, and the middle wave too from level middleFromStage on. */
export const BOSSES = { middleFromStage: 3 };
export const isBossWave = (wave, stage) => wave === stage.waves || (stage.n >= BOSSES.middleFromStage && wave === Math.round(stage.waves / 2));

/* Anti-cheat timing: a finished run must have lasted at least `floor` seconds, and at least `share` of the time its waves
   take to spawn (at 1x; the game runs up to 3x). */
export const MIN_RUN = { floor: 15, share: 0.25 };
export const minRunSeconds = waves => {
  let t = 0;
  for (let w = 1; w <= waves; w++) t += MIN_RUN.share * (waveCount(w) - 1) * spawnDelay(w);   /* the first enemy comes at once */
  return t;
};

/* Item drops at the end of a match: a win always drops one; a loss has lossChance x (waves reached / waves in the level).
   Every boss defeated adds one. A player can hold at most maxItems. */
export const DROPS = { lossChance: 0.5, maxItems: 200 };

/* Co-op: up to maxPlayers in a lobby; enemy life is multiplied by the number of players (2 players x2, 3 x3, 4 x4). */
export const COOP = { maxPlayers: 4, hpPerPlayer: 1 };
export const coopHpMult = players => 1 + COOP.hpPerPlayer * (Math.max(1, players) - 1);
