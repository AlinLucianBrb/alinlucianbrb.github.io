/* Giving a relic to a player and taking one back (the relic shop, the gamble, Melting pot). A relic a player has is
   { name, r: rarity, k?: its strength if not full (Fine taste) }. recalc(w) follows. */
import { RELICS, RARITIES } from '../content/data.js';

const relic = name => RELICS.find(x => x.name === name);
/* How strong a relic is: its rarity's multiplier times its own strength. */
export const relicMult = r => RARITIES[r.r].mult * (r.k || 1);
export function giveRelic(w, p, def, ri, k = w.fxm ? w.fxm.relicPower : 1) {
  const r = { name: def.name, r: ri, ...(k !== 1 ? { k } : {}) }, m = relicMult(r);
  if (def.mods) for (const x of def.mods(m)) p.mods.push({ ...x, source: def.name, ri });
  if (def.onPick) def.onPick(w, m);
  p.relics.push(r);
}
/* One copy: its entry and exactly its modifiers. */
export function removeRelic(p, r) {
  const def = relic(r.name);
  p.relics.splice(p.relics.indexOf(r), 1);
  for (const x of def.mods(relicMult(r))) {
    const i = p.mods.findIndex(m => m.source === def.name && m.ri === r.r && m.stat === x.stat && m.type === x.type && m.value === x.value);
    if (i >= 0) p.mods.splice(i, 1);
  }
}
/* The ones that can be taken or changed: not those with a one-time effect. */
export const looseRelics = p => p.relics.filter(r => { const d = relic(r.name); return d && d.mods && !d.onPick; });
