/* Things the player has already seen once, kept on this browser (like the settings): firstTime(id) is true the first time
   it is asked about id, then false. Used for moments shown only once, like a hero's first evolution into a form. Without
   storage (private mode) it still remembers until the page closes. */
const KEY = 'tbd.seen';
const store = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
let cache = null;
function load() {
  if (cache) return cache;
  let list = [];
  try { const s = store(); list = JSON.parse((s && s.getItem(KEY)) || '[]'); } catch (e) { list = []; }
  return (cache = new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : []));
}
export function firstTime(id) {
  const seen = load();
  if (seen.has(id)) return false;
  seen.add(id);
  try { const s = store(); if (s) s.setItem(KEY, JSON.stringify([...seen])); } catch (e) { /* kept until the page closes */ }
  return true;
}
/* For the tests: forget what was seen. */
export const resetSeen = () => { cache = new Set(); try { const s = store(); if (s) s.removeItem(KEY); } catch (e) { /* none */ } };
