import { startGame, stopGame } from '../game/game.js';
import { finishRun } from '../services/api.js';
import { runRewards } from '../core/rules.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

async function onRunEnd({ waves, kills, stage, won }) {
  const before = state.profile;
  const { profile, error } = await finishRun(waves, kills, stage, won);
  if (error || !profile) return 'Could not save your run: ' + (error || 'unknown error') + ' (did you run the latest SQL update?)';
  state.profile = profile;
  const r = runRewards(waves, kills);
  return (won ? 'Level ' + stage + ' cleared! ' : '') + '+' + r.xp + ' XP, +' + r.gold + ' gold.' +
    (profile.level > before.level ? ' Level up! You are now level ' + profile.level + '.' : '');
}

export default {
  mount(el, params) {
    const stage = (params && params.stage) || 1;
    if (stage > (state.profile.levels_cleared || 0) + 1) return bus.emit('nav', { to: 'levels' });
    startGame({
      stage, talents: state.profile.talents || [], onRunEnd,
      onExit: () => bus.emit('nav', { to: 'menu' }),
      onNext: () => bus.emit('nav', { to: 'play', params: { stage: stage + 1 } })
    });
  },
  unmount() { stopGame(); }
};
