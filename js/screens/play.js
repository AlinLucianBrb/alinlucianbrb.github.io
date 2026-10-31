import { startGame, stopGame } from '../game/game.js';
import { finishRun } from '../services/api.js';
import { runRewards } from '../core/rules.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

async function onRunEnd({ waves, kills }) {
  const before = state.profile;
  const { profile, error } = await finishRun(waves, kills);
  if (error || !profile) return 'Could not save your run: ' + (error || 'unknown error');
  state.profile = profile;
  const r = runRewards(waves, kills);
  return '+' + r.xp + ' XP, +' + r.gold + ' gold. Your best: wave ' + profile.best_wave + '.' +
    (profile.level > before.level ? ' Level up! You are now level ' + profile.level + '.' : '');
}

export default {
  mount() { startGame({ best: state.profile.best_wave, talents: state.profile.talents || [], onRunEnd, onExit: () => bus.emit('nav', { to: 'menu' }) }); },
  unmount() { stopGame(); }
};
