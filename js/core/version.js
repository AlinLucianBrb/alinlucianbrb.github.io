/* The game's version, shown in a corner of the main menu. Bump GAME_VERSION with every update you publish
   (major.minor.patch); the engine version next to it comes from the engine and only changes with the rules. */
import { ENGINE_VERSION } from '../engine/world.js';

export const GAME_VERSION = '0.22.0';
export const versionText = () => 'v' + GAME_VERSION + ' · engine ' + ENGINE_VERSION;
