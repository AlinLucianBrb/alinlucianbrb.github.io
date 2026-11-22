/* What each act unlocks. The acts are the zones (zones.js): reaching an act means having beaten the last level of the one
   before it. Add a feature here with the act it needs; the server's copy (rule_unlock) is generated from this table. */
import { TESTING } from './rules.js';
import { ZONES, LEVELS, LEVELS_PER_ZONE, zoneOf } from './zones.js';

export const UNLOCKS = {
  paths:  { act: 2, name: 'Evolution paths' },   /* picking a path before a match; heroes still evolve in a match without one */
  crafting: { act: 2, name: 'Crafting' },
  shop: { act: 3, name: 'The match shop' },
  effects: { act: 4, name: 'Match effects' },
  speed2: { act: 3, name: '2x game speed' }
};
/* The act a player has reached, from the number of levels cleared. */
export const actReached = cleared => zoneOf(Math.min(LEVELS, (cleared || 0) + 1)).n;
/* How many levels must be cleared to reach an act. */
export const clearedFor = act => (act - 1) * LEVELS_PER_ZONE;
export const isUnlocked = (id, cleared) => TESTING.unlockAll || (cleared || 0) >= clearedFor(UNLOCKS[id].act);
/* What reaching an act unlocks, as names. */
export const unlocksOf = act => Object.values(UNLOCKS).filter(u => u.act === act).map(u => u.name);
/* The message after a win that reaches a new act ('' when nothing new): before and after are the levels cleared. */
export function actMessage(before, after) {
  if ((before || 0) < LEVELS && after >= LEVELS) return 'You finished the campaign! Every zone now has Endless.';
  const a = actReached(before), b = actReached(after);
  if (b <= a) return '';
  const names = unlocksOf(b);
  return 'Act ' + b + ', ' + ZONES[b - 1].name + ', is open' + (names.length ? '. Unlocked: ' + names.join(', ') + '.' : '.');
}
/* The fastest game speed a player can choose: 3x in endless. */
export const maxSpeed = (cleared, endless = false) => (endless ? 3 : isUnlocked('speed2', cleared) ? 2 : 1);
