/* Progression rules shown in the UI. The database function finish_run applies the same formulas authoritatively. */
export const xpNeed = level => 50 + level * 50;
export const runRewards = (waves, kills) => ({ xp: waves * 10 + kills, gold: waves * 5 });
