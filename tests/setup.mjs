/* Loaded before every test file (see package.json): hits deal exactly the damage stat, so tests can check exact numbers.
   The damage roll itself is tested in round.test.mjs, which turns it back on. */
import { DAMAGE_ROLL } from '../js/content/data.js';
DAMAGE_ROLL.on = false;
