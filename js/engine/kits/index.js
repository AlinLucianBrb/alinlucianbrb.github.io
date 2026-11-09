/* Hero kits: each newer hero keeps its behaviors (attacks), ultimates and zones in one file here, registering them into the
   shared tables (BEHAVIORS in behaviors.js, ULTIMATES in ultimates.js, ZONES in zones.js, PROJECTILES in projectiles.js).
   The engine imports this file once; to add a hero, add its kit and import it below. Shared mechanics live in their own
   modules: auras (aura.js), curses and death effects (effects.js), knockback (enemies.js), execute (combat.js). */
import './common.js';
import './priest.js';
import './warlock.js';
import './paladin.js';
import './shaman.js';
