/* What a level gives as items, for the level screen and the act screens (the server decides the real drops in finish_run:
   rule_item_level, rule_drop_chance, one more item per boss). A win drops one item plus one for every boss beaten: the
   last wave's boss, and from level BOSSES.middleFromStage on the middle wave's too (bosses summoned from the shop add
   more). The item level is ILVL.perLevel x the level (on a loss, the level below). Endless drops one item per boss, at
   item level ENDLESS_RULES.minItemLevel and up, by the waves reached. */
import { ILVL } from './items.js';
import { BOSSES, ENDLESS_RULES } from './rules.js';

export const levelItemLevel = n => ILVL.perLevel * n;
export const levelBosses = n => (n >= BOSSES.middleFromStage ? 2 : 1);
export const winItems = n => 1 + levelBosses(n);
/* The item levels a zone's levels drop: [lowest, highest]. */
export const zoneItemLevels = levels => [levelItemLevel(Math.min(...levels)), levelItemLevel(Math.max(...levels))];
export const ENDLESS_ITEMS = { from: ENDLESS_RULES.minItemLevel, bossEvery: ENDLESS_RULES.bossEvery };
/* One line for a level's card and the hero choice. */
export const levelDropText = n => 'Items: level ' + levelItemLevel(n) + ' · ' + winItems(n) + ' on a win';
export const endlessDropText = () => 'Items: level ' + ENDLESS_ITEMS.from + '+, one per boss (every ' + ENDLESS_ITEMS.bossEvery + ' waves)';
