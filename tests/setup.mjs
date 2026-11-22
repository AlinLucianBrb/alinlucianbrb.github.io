/* Loaded before every test file (see package.json): hits deal exactly the damage stat, so tests can check exact numbers.
   The damage roll itself is tested in round.test.mjs, which turns it back on. */
import { DAMAGE_ROLL, PAY_FOR_HEROES } from '../js/content/data.js';
DAMAGE_ROLL.on = false;
/* Heroes are placed for free in tests, so a test can set up its board in one go; paying for them is tested in
   commands.test.mjs and bot.test.mjs, which turn it back on. */
PAY_FOR_HEROES.on = false;
/* Newer Node versions (26) have a built-in localStorage that only prints a warning when it is read without a file. Tests run
   without one, as on Node 22 (GitHub's test run); a test that needs one sets a fake. */
delete globalThis.localStorage;
