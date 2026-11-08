/* Listens to combat events and keeps the damage meter numbers (per hero and per player's hero class). Knows nothing about the DOM.
   totals[owner * HEROES.length + type]: solo, just the hero type; in co-op each player's heroes have their own rows. */
import { HEROES } from '../content/data.js';
import { COOP } from '../content/rules.js';

export function createMeter(ev) {
  const totals = new Array(HEROES.length * COOP.maxPlayers).fill(0);
  let sum = 0;
  ev.on('damage', ({ hero, amount }) => { totals[(hero.owner || 0) * HEROES.length + hero.type] += amount; sum += amount; hero.dealt += amount; });
  ev.on('kill', ({ hero }) => { if (hero) hero.kills++; });
  return { totals, sum: () => sum };
}
