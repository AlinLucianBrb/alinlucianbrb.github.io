/* The player's settings (Settings screen), kept on this browser. applyPrefs() puts the ones about the look on the page:
   --ts (text size) on the root, and the classes calm (fewer effects), rarmarks (rarity letters) and bigtext (a text size
   above Normal: low windows make room for it) on the body.
   Unknown or broken saved values fall back to the defaults. */
const KEY = 'tbd.prefs';
const OLD_PLAY_ON_PICK = 'tbd.playOnPick';   /* before v0.64 this one setting had its own key */

export const TEXT_SIZES = [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger']];
export const SPEEDS = [1, 2, 3];
const store = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
const reduceMotion = () => { try { return !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
export const defaults = () => ({ textSize: 1, effects: reduceMotion() ? 'fewer' : 'full', rarityMarks: true, speed: 1, auto: false, playOnPick: false });
const VALID = {
  textSize: v => TEXT_SIZES.some(([x]) => x === v), effects: v => v === 'full' || v === 'fewer', rarityMarks: v => typeof v === 'boolean',
  speed: v => SPEEDS.includes(v), auto: v => typeof v === 'boolean', playOnPick: v => typeof v === 'boolean'
};

let cache = null;
export function getPrefs() {
  if (cache) return cache;
  const s = store(), out = defaults();
  let saved = {};
  try { saved = JSON.parse((s && s.getItem(KEY)) || '{}') || {}; } catch (e) { saved = {}; }
  try { if (!('playOnPick' in saved) && s && s.getItem(OLD_PLAY_ON_PICK) === '1') saved.playOnPick = true; } catch (e) { /* no storage */ }
  for (const k in VALID) if (k in saved && VALID[k](saved[k])) out[k] = saved[k];
  return (cache = out);
}
export function setPref(k, v) {
  if (!VALID[k] || !VALID[k](v)) return false;
  getPrefs()[k] = v;
  try { const s = store(); if (s) s.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* private mode: kept until the page closes */ }
  applyPrefs();
  return true;
}
export function applyPrefs() {
  const p = getPrefs(), doc = globalThis.document;
  if (!doc) return;
  if (doc.documentElement && doc.documentElement.style) doc.documentElement.style.setProperty('--ts', String(p.textSize));
  if (doc.body && doc.body.classList) { doc.body.classList.toggle('calm', p.effects === 'fewer'); doc.body.classList.toggle('rarmarks', p.rarityMarks); doc.body.classList.toggle('bigtext', p.textSize > 1); }
}
export const calm = () => getPrefs().effects === 'fewer';
/* For tests: forget what was read. */
export const _resetPrefs = () => { cache = null; };
