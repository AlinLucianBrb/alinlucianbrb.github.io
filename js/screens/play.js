import { startGame, stopGame, snapshot } from '../game/game.js';
import { saveRun, loadRun, clearRun } from '../game/saved-run.js';
import { startRun, finishRun, getItems } from '../services/api.js';
import { itemName } from '../content/items.js';
import { STAGES } from '../content/data.js';
import { wornItems } from './loadout.js';
import { runRewards } from '../core/rules.js';
import { rewardBonus } from '../content/talents.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { coop, closeLobby, seatOf } from '../net/session.js';
import { leaveLobby } from '../services/api.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
let saver = 0, onHide = null;
/* Only suggest the SQL update when the error looks like a missing function or column, not when the server refused the run. */
const hint = e => /function|does not exist|schema cache|could not find|column/i.test(e || '') ? ' (did you run the latest SQL update?)' : '';

/* Without a server there is no channel: a co-op match then plays alone (the others never arrive). */
const offlineChannel = () => ({ send() {}, on() {}, onLeave() {} });

export default {
  async mount(el, params) {
    const uid = state.profile.id, saved = params && params.resume ? loadRun(uid) : null;
    /* Co-op: the match the lobby's host started (js/screens/lobby.js); its level only has to be unlocked for the host. */
    const config = params && params.coop ? coop.config : null, lobby = config && coop.lobby;
    if (params && params.coop && !config) return bus.emit('nav', { to: 'menu' });
    const stage = config ? config.stage : saved ? saved.log.stage : (params && params.stage) || 1;
    if (!config && stage > (state.profile.levels_cleared || 0) + 1) return bus.emit('nav', { to: 'levels' });
    /* Equipped items: { heroId: { slot: itemId } } in the profile, turned into { heroId: [{ type, rarity, bonuses }] } for the game. */
    if (!state.items && Object.keys(state.profile.equipment || {}).length) {
      const { items, error } = await getItems().catch(() => ({ error: 'offline' }));
      state.items = error ? null : items;
    }
    const equipped = wornItems();
    let runId = saved ? saved.runId : null, starting = Promise.resolve({});
    /* Keep the run saved on this browser, so a refresh does not lose it: every few seconds and when the page is hidden. */
    const save = () => { const log = snapshot(); if (log) saveRun(uid, { log, runId }); };   /* (co-op matches are never saved) */
    clearInterval(saver); saver = setInterval(save, 3000);
    if (onHide) removeEventListener('pagehide', onHide);
    onHide = save; globalThis.addEventListener?.('pagehide', onHide);

    /* Every run is registered with the server when it starts; the server only accepts a result for a run it saw begin. */
    async function register() {
      try {
        let r = await startRun(stage, lobby ? lobby.id : null);
        if (r.error && /slow down/i.test(r.error)) { await wait(2100); r = await startRun(stage, lobby ? lobby.id : null); }
        runId = r.id; return r;
      } catch (e) { runId = null; return { error: 'no connection to the server' }; }   /* the game still plays; only saving is affected */
    }
    async function onRunEnd({ waves, kills, won, bosses = 0 }) {
      clearRun(uid);
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
      return (won ? 'Level ' + (STAGES[stage - 1] ? STAGES[stage - 1].code : stage) + ' cleared! ' : '') + '+' + r.xp + ' XP, +' + r.gold + ' gold.' +
        (names.length ? ' You found ' + (names.length > 1 ? names.length + ' items: ' : 'an item: ') + names.join(', ') + '! Equip ' + (names.length > 1 ? 'them' : 'it') + ' on the Heroes screen.' : '') +
        (profile.level > before.level ? ' Level up! You are now level ' + profile.level + '.' : '');
    }
    const seat = config && seatOf(config, uid);
    startGame({
      stage, talents: state.profile.talents || [], lineup: state.profile.lineup, items: equipped, paths: state.profile.paths || {}, onRunEnd, resume: saved ? saved.log : null,
      coop: config ? { config, ...seat, transport: coop.channel || offlineChannel() } : null,
      onRunStart: () => { runId = null; if (!config) clearRun(uid); starting = register(); },
      onExit: () => { if (!config) clearRun(uid); bus.emit('nav', { to: 'menu' }); },   /* quitting gives the run up (co-op: leaves the match) */
      onNext: () => bus.emit('nav', { to: 'levels', params: { stage: stage + 1 } })   /* choose heroes for the next level */
    });
  },
  unmount() {
    clearInterval(saver); if (onHide) globalThis.removeEventListener?.('pagehide', onHide); onHide = null; stopGame();
    /* Leaving a co-op match leaves its lobby too (the others see you go; your heroes stay in their match). */
    if (coop.lobby) { const id = coop.lobby.id; closeLobby(); leaveLobby(id).catch(() => {}); }
  }
};
