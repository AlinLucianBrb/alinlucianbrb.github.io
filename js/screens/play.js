import { startGame, stopGame } from '../game/game.js';
import { startRun, finishRun, getItems } from '../services/api.js';
import { itemName } from '../content/items.js';
import { wornItems } from './loadout.js';
import { runRewards } from '../core/rules.js';
import { rewardBonus } from '../content/talents.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
/* Only suggest the SQL update when the error looks like a missing function or column, not when the server refused the run. */
const hint = e => /function|does not exist|schema cache|could not find|column/i.test(e || '') ? ' (did you run the latest SQL update?)' : '';

export default {
  async mount(el, params) {
    const stage = (params && params.stage) || 1;
    if (stage > (state.profile.levels_cleared || 0) + 1) return bus.emit('nav', { to: 'levels' });
    /* Equipped items: { heroId: { slot: itemId } } in the profile, turned into { heroId: [{ type, rarity, bonuses }] } for the game. */
    if (!state.items && Object.keys(state.profile.equipment || {}).length) {
      const { items, error } = await getItems().catch(() => ({ error: 'offline' }));
      state.items = error ? null : items;
    }
    const equipped = wornItems();
    let runId = null, starting = Promise.resolve({});

    /* Every run is registered with the server when it starts; the server only accepts a result for a run it saw begin. */
    async function register() {
      try {
        let r = await startRun(stage);
        if (r.error && /slow down/i.test(r.error)) { await wait(2100); r = await startRun(stage); }
        runId = r.id; return r;
      } catch (e) { runId = null; return { error: 'no connection to the server' }; }   /* the game still plays; only saving is affected */
    }
    async function onRunEnd({ waves, kills, won, bosses = 0 }) {
      const s = await starting;
      if (!runId) return 'Could not save your run: ' + (s.error || 'it was not started') + hint(s.error);
      const id = runId; runId = null;
      const before = state.profile;
      const { profile, drop, drops = drop ? [drop] : [], error } = await finishRun(id, waves, kills, won, bosses);
      if (error || !profile) return 'Could not save your run: ' + (error || 'unknown error') + hint(error);
      state.profile = profile;
      if (drops.length) state.items = null;   /* reload the inventory next time it is needed */
      const r = runRewards(waves, kills, rewardBonus(before.talents));
      const names = drops.map(d => itemName(d));
      return (won ? 'Level ' + stage + ' cleared! ' : '') + '+' + r.xp + ' XP, +' + r.gold + ' gold.' +
        (names.length ? ' You found ' + (names.length > 1 ? names.length + ' items: ' : 'an item: ') + names.join(', ') + '! Equip ' + (names.length > 1 ? 'them' : 'it') + ' on the Heroes screen.' : '') +
        (profile.level > before.level ? ' Level up! You are now level ' + profile.level + '.' : '');
    }
    startGame({
      stage, talents: state.profile.talents || [], lineup: state.profile.lineup, items: equipped, onRunEnd,
      onRunStart: () => { runId = null; starting = register(); },
      onExit: () => bus.emit('nav', { to: 'menu' }),
      onNext: () => bus.emit('nav', { to: 'levels', params: { stage: stage + 1 } })   /* choose heroes for the next level */
    });
  },
  unmount() { stopGame(); }
};
