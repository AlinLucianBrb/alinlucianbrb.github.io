/* Listens to combat events and keeps the damage meter numbers (per tower type and per tower). Knows nothing about the DOM. */
import { TOWERS } from './data.js';

export function createMeter(ev) {
  const totals = TOWERS.map(() => 0);
  let sum = 0;
  ev.on('damage', ({ tower, amount }) => { totals[tower.type] += amount; sum += amount; tower.dealt += amount; });
  ev.on('kill', ({ tower }) => { if (tower) tower.kills++; });
  return { totals, sum: () => sum };
}
