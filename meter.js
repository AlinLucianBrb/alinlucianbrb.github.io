/* Listens to combat events and keeps the damage meter numbers (per hero type and per hero). Knows nothing about the DOM. */
import { HEROES } from '../content/data.js';

export function createMeter(ev) {
  const totals = HEROES.map(() => 0);
  let sum = 0;
  ev.on('damage', ({ hero, amount }) => { totals[hero.type] += amount; sum += amount; hero.dealt += amount; });
  ev.on('kill', ({ hero }) => { if (hero) hero.kills++; });
  return { totals, sum: () => sum };
}
