/* The run in progress, saved on this browser so a page refresh (or a closed tab) does not lose it. It holds the run's
   command log (enough to play the run back to where it was, see resume in js/engine/replay.js) and the server's run id, so
   the result still counts when the run ends. One saved run per account; it is cleared when the run ends or is quit, and
   ignored after 24 hours (the server no longer accepts the result then) or after an update that changed the rules
   (ENGINE_VERSION). Solo runs only. */
import { ENGINE_VERSION } from '../engine/world.js';

const KEY = id => 'tbd.run.' + (id || 'guest');
const MAX_AGE = 24 * 3600 * 1000;
const store = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };

export function saveRun(userId, data) {
  const s = store(); if (!s || !data || !data.log) return;
  try { s.setItem(KEY(userId), JSON.stringify({ ...data, savedAt: Date.now() })); } catch (e) { /* full or blocked: the run just is not saved */ }
}
export function loadRun(userId) {
  const s = store(); if (!s) return null;
  try {
    const d = JSON.parse(s.getItem(KEY(userId)) || 'null');
    if (!d || !d.log || !(Date.now() - d.savedAt < MAX_AGE)) return null;
    if (d.log.ver !== ENGINE_VERSION) return null;   /* saved before a game update changed the rules: it cannot be played back */
    return d;
  } catch (e) { return null; }
}
export function clearRun(userId) { const s = store(); if (s) try { s.removeItem(KEY(userId)); } catch (e) { /* ignore */ } }
/* What the menu shows: "Level 2, wave 7". */
export const describeRun = d => 'Level ' + d.log.stage + ', wave ' + ((d.log.result && d.log.result.waves) || 0);
