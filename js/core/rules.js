/* Progression rules shown in the UI. The database function finish_run applies the same formulas authoritatively. */
export const xpNeed = level => 50 + level * 50;
/* bonus: the reward bonuses from talents, { gold, xp } as fractions (see rewardBonus in js/content/talents.js). */
export const runRewards = (waves, kills, bonus = {}) => ({
  xp: Math.round((waves * 10 + kills) * (1 + (bonus.xp || 0))), gold: Math.round(waves * 5 * (1 + (bonus.gold || 0)))
});
