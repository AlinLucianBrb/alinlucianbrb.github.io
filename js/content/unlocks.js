/* What each act unlocks. The acts are the zones (zones.js): reaching an act means having beaten the last level of the one
   before it. A feature used in a match (paths, the shop, match effects, 2x speed) works only on levels of its act or later
   (and in Endless), never back on an earlier act's levels: inMatch(). Crafting is outside matches: isUnlocked() alone.
   Add a feature here with the act it needs; the server's copy (rule_unlock) is generated from this table (only the act).
   icon and desc are for the screen that opens a new act (actMilestone). */
import { TESTING } from './rules.js';
import { ZONES, LEVELS, LEVELS_PER_ZONE, zoneOf } from './zones.js';
import { zoneItemLevels, ENDLESS_ITEMS } from './level-drops.js';

export const UNLOCKS = {
  paths:  { act: 2, name: 'Evolution paths', icon: 'icon_heroes',   /* picking a path before a match; heroes still evolve in a match without one */
    desc: 'Before a match, pick the form each hero will evolve into (Heroes, Evolutions tab). The hero gets a taste of it before level 15.' },
  crafting: { act: 2, name: 'Crafting', icon: 'icon_mat_essence', desc: 'Break items you do not need into materials, and craft new ones (Inventory).' },
  shop: { act: 3, name: 'The match shop', icon: 'icon_shop_bag', desc: 'Spend gold during a match: relics, gambles, and a boss you can summon for more gold and items.' },
  effects: { act: 4, name: 'Match effects', icon: 'icon_level', desc: 'Every few waves, choose an effect that changes the rest of the match.' },
  speed2: { act: 2, name: '2x game speed', icon: 'icon_speed', desc: 'Play at twice the speed.' }
};
/* The act a player has reached, from the number of levels cleared. */
export const actReached = cleared => zoneOf(Math.min(LEVELS, (cleared || 0) + 1)).n;
/* How many levels must be cleared to reach an act. */
export const clearedFor = act => (act - 1) * LEVELS_PER_ZONE;
export const isUnlocked = (id, cleared) => TESTING.unlockAll || (cleared || 0) >= clearedFor(UNLOCKS[id].act);
/* The act a level belongs to: its zone. Endless comes after every act. */
export const actOfStage = n => (n > LEVELS ? Infinity : zoneOf(Math.max(1, n)).n);
/* Whether a feature works in a match on this level: the player has reached its act, and the level is in that act or later. */
export const inMatch = (id, cleared, stage) => isUnlocked(id, cleared) && actOfStage(stage) >= UNLOCKS[id].act;
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
/* The fastest game speed a player can choose: 3x in endless; 2x from Act 2 (on that level, when one is given). */
export const maxSpeed = (cleared, endless = false, stage = null) => (endless ? 3 : (stage === null ? isUnlocked('speed2', cleared) : inMatch('speed2', cleared, stage)) ? 2 : 1);

/* The screen after a win that opens a new act, or finishes the campaign (null when nothing new): before and after are the
   levels cleared. The zone's picture, what the act unlocks (icon, name, what it does) and what its levels drop. */
export function actMilestone(before, after) {
  if ((before || 0) < LEVELS && after >= LEVELS)
    return { kind: 'campaign', title: 'Campaign complete', sub: 'You beat all ' + ZONES.length + ' zones.', art: 'assets/level_' + ZONES.length + '.png', unlocks: [],
      text: 'Endless is open in every zone: the enemies never stop, and the further you get, the better the items (item level ' + ENDLESS_ITEMS.from + ' and up).' };
  const a = actReached(before), b = actReached(after);
  if (b <= a) return null;
  const z = ZONES[b - 1], [lo, hi] = zoneItemLevels(Array.from({ length: LEVELS_PER_ZONE }, (_, k) => clearedFor(b) + k + 1));
  return { kind: 'act', act: b, title: 'Act ' + b + ' · ' + z.name, sub: 'A new zone is open.', art: 'assets/level_' + b + '.png',
    text: 'Its levels drop items of level ' + lo + ' to ' + hi + '.', unlocks: Object.entries(UNLOCKS).filter(([, u]) => u.act === b).map(([id, u]) => ({ id, name: u.name, icon: u.icon, desc: u.desc })) };
}
