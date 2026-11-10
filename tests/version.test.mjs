/* The version shown in the main menu's corner: the game version and the engine version. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_VERSION, versionText } from '../js/core/version.js';
import { ENGINE_VERSION } from '../js/engine/world.js';

test('the menu version text names the game version and the engine version', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versionText(), 'v' + GAME_VERSION + ' · engine ' + ENGINE_VERSION);
});
