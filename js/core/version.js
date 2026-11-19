/* The game's version, shown in a corner of the main menu. Bump GAME_VERSION with every update you publish
   (major.minor.patch). The engine version (ENGINE_VERSION in js/engine/world.js) changes only when the rules change;
   it is shown beside it so a player can tell which rules a build plays by. */
import { ENGINE_VERSION } from '../engine/world.js';
export const GAME_VERSION = '0.55.1';
export const versionText = () => 'v' + GAME_VERSION + ' · engine ' + ENGINE_VERSION;
