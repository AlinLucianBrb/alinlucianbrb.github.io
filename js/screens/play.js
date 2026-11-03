import { startGame, stopGame } from '../game/game.js';
import { startRun, finishRun } from '../services/api.js';
import { runRewards } from '../core/rules.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
/* Only suggest the SQL update when the error looks like a missing function or column, not when the server refused the run. */
const hint = e => /function|does not exist|schema cache|could not find|column/i.test(e || '') ? ' (did you run the latest SQL update?)' : '';

export default {
  mount(el, params) {
    const stage = (params && params.stage) || 1;
    if (stage > (state.profile.levels_cleared || 0) + 1) return bus.emit('nav', { to: 'levels' });
    let runId = null, starting = Promise.resolve({});

    /* Every run is registered with the server when it starts; the server only accepts a result for a run it saw begin. */
    async function register() {
      try {
        let r = await startRun(stage);
        if (r.error && /slow down/i.test(r.error)) { await wait(2100); r = await startRun(stage); }
        runId = r.id; return r;
      } catch (e) { runId = null; return { error: 'no connection to the server' }; }   /* the game still plays; only saving is affected */
    }
    async function onRunEnd({ waves, kills, won }) {
      const s = await starting;
      if (!runId) return 'Could not save your run: ' + (s.error || 'it was not started') + hint(s.error);
      const id = runId; runId = null;
      const before = state.profile;
      const { profile, error } = await finishRun(id, waves, kills, won);
      if (error || !profile) return 'Could not save your run: ' + (error || 'unknown error') + hint(error);
      state.profile = profile;
      const r = runRewards(waves, kills);
      return (won ? 'Level ' + stage + ' cleared! ' : '') + '+' + r.xp + ' XP, +' + r.gold + ' gold.' +
        (profile.level > before.level ? ' Level up! You are now level ' + profile.level + '.' : '');
    }
    startGame({
      stage, talents: state.profile.talents || [], onRunEnd,
      onRunStart: () => { runId = null; starting = register(); },
      onExit: () => bus.emit('nav', { to: 'menu' }),
      onNext: () => bus.emit('nav', { to: 'play', params: { stage: stage + 1 } })
    });
  },
  unmount() { stopGame(); }
};
