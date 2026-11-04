# Test TBD

HTML/JS tower defense with accounts, a main menu and a leaderboard. No build step.

## Structure
```
index.html                 page shell: one <section> per screen
js/main.js                 boot: registers screens, picks the first one
js/config.js               your Supabase URL and key (and optional CAPTCHA site key)
js/core/                   bus.js (events), screens.js, tooltip.js, state.js, rules.js
js/services/api.js         the only file that talks to Supabase
js/screens/                login, menu, levels, heroes, talents, leaderboard, settings, play (one file each)

js/content/                WHAT the game contains (plain data, no logic)
  data.js                  heroes (and archived ones for later), energy defaults, relics, rarities, levels
  items.js                 items that drop after matches (one slot per hero)
  talents.js               talent trees and allocation rules
  format.js                display text for modifiers
js/engine/                 HOW the game works (no page, no clock, no Math.random)
  world.js                 the simulation: createWorld(), step()
  commands.js              every player action: place, move, evolve, wave, auto, buyRelic, reroll, banish, choose
  rng.js                   seeded random numbers
  replay.js                command logs: exportLog(), replay(), verify()
  hash.js                  fingerprint of a world (tests)
  ultimates.js             what a hero does when its energy bar is full
  stats.js, behaviors.js, enemies.js, projectiles.js, effects.js, meter.js
js/game/                   the browser shell around the engine
  game.js                  input -> commands, the loop, background play
  render.js                canvas drawing (beams, slashes, projectile looks)
  ui.js                    HUD, damage meter, hero panel, relic picker

tests/                     run with: npm test
tools/bot.mjs              a bot that plays through the same commands as a player
tools/balance-report.mjs   run with: npm run balance
tools/build-sql.mjs        builds the two SQL files from sql/ and js/content: npm run sql
sql/                       the database, in parts (tables, functions, permissions); edit these, not the built files
.github/workflows/test.yml runs the tests on GitHub on every push
supabase-setup.sql         database setup for a new project (built by npm run sql)
supabase-update.sql        updates an existing project (built by npm run sql; safe to run again)
supabase-cleanup-old-prototypes.sql  optional: deletes tables from the earlier prototypes
```

## How the engine works
- **Engine vs. shell.** `js/engine` holds every game rule and never touches the page, the clock or `Math.random`. `js/game` turns clicks into commands, runs the loop and draws. The same engine runs in the browser, in the tests and in the bot, and could run on a server.
- **Commands.** The only way to change a game is `apply(world, { type, ... })`: place, move, evolve, wave, auto, buyRelic, reroll, banish, choose. A command is checked, applied and recorded with the tick it happened on; a refused command changes nothing. To add a player action, add an entry to `COMMANDS` in `commands.js`.
- **Seeded randomness.** Each run gets a seed. Separate random streams for the map and for relics mean, for example, that rerolling relics never changes the map.
- **Command logs.** A seed plus the list of commands replays a run exactly: `replay(log)` gives the same final state, and `verify(log)` checks the result a log claims. The Play screen receives the log when a run ends (`onRunEnd`), ready for a future step where the server re-plays runs to stop cheating.
- **Engine version.** `ENGINE_VERSION` in `world.js` must go up whenever a rule change would make old logs play out differently; `replay` refuses logs from another version. (Now 2: Compound interest changed.)
- **Golden rule:** game state changes only through commands and `step()`. Setting values directly (like `world.gold = 500`) breaks replays.

## Tests and the balance bot
- `npm test` runs everything (needs Node 22). Tests cover the random numbers, stat math, talents, every command, each hero's behavior, enemies and waves, winning and losing, replays, the browser shell on a fake page, and checks that the SQL files still match the game rules (wave counts, rewards, timings, talent trees). GitHub runs them on every push.
- `npm run balance` plays every level with four bot strategies and prints win rates. Options: `--runs 8 --stages 1,2,3 --strategies trio,ranger --level 10 --form lightningmage,hunter` (`--level` is the player level, so talents are included; `--form` picks each hero's evolution, for example `berserker,lightningmage,hunter`). The bot is not clever, so treat results as a yardstick for comparing changes, not as how hard a level feels to a person.

## Levels
Five levels: 15 waves, then 5 more each (20, 25, 30, 35). A level unlocks when the previous one is cleared. Levels differ in enemy health and how fast it grows (`STAGES` in `data.js`, easy to tune). The leaderboard shows levels cleared, then the furthest wave on the level a player is working on.

## Game screen and controls
The map fills the window and the HUD floats on top: level, wave and lives in the top middle; your relics down the left; Menu top right, with the selected hero's details under it; the damage meter bottom right (click its title to fold it); gold, the hero cards, Relic, Start wave (its right-hand AUTO part toggles Auto-start) and speed at the bottom. Hover any hero card or button for a tooltip.

| Action | Mouse / touch | Keys |
|---|---|---|
| Choose a hero to place, or select a placed one | click its card | 1-3 |
| Place it / select a hero | click a tile | |
| Move / evolve the selected hero | buttons in the hero panel | M / E |
| Move the map | drag (any mouse button), or drag with one finger | arrows or WASD |
| Zoom | mouse wheel, pinch, or the + / − buttons | + / − |
| Fit the map to the screen | Fit button | F |
| Buy a relic | Relic | R |
| Start the wave | Start wave | Space |
| Pause | Menu (asks before quitting) | P (Esc resumes) |

- The camera fits the map into the space the HUD leaves free whenever a run starts or the window changes size (until you move or zoom it yourself; Fit returns to that view).
- Every run, including Retry after a win or a loss, starts with Auto-start off and unpaused.

## Background play
- The game runs on a fixed time step, so it plays the same at any frame rate. When the tab is hidden or the window is minimized, a timer keeps it running, and it catches up on any time the browser paused (up to 30 minutes).
- Heroes cannot be controlled while the tab is hidden, so turn on Auto-start before switching away. A paused game stays paused in the background.

## Heroes, energy, evolution and items
- **Three classes:** Warrior (melee swing), Ranger (fast arrows that fly to their target) and Mage (a magic bolt that flies to its target, dealing spell damage). The Thief, Frost Mage (with its slow), Fire Mage and Lightning Mage are kept in `HERO_ARCHIVE`, with their behaviors and relics, for the advanced variants later.
- **Lineup:** on the Heroes screen, players choose up to 3 different heroes to bring. In a match each one is placed once, for free; gold goes to evolutions and relics.
- **Energy and ultimates:** every hero has an energy bar (blue under the hero; gold and glowing when full). It fills by `energyPerAttack` per attack and `energyPerSecond` during waves; the defaults are in `ENERGY` in `data.js` (20 per attack, 0 per second), and both are ordinary stats that talents, relics and items can change. When the bar is full, the next attack is the ultimate: for now, double damage.
- **Hero levels:** during a match, every hero on the field gains XP from each kill (Grunt and Runner 1, Brute 3), whoever landed it. Level 2 takes 10 XP and each level after takes 2 more, so level 10 (162 XP) comes around the middle of level 1. Each level adds +3% damage. The rules are `HERO_LEVELS` in `data.js` (set `perLevel` to `[]` for no bonus). Levels show as a badge on the hero, on its card and in the hero panel.
- **Evolution:** once a hero reaches the evolution's level (10 for now), select it and press Evolve (or E) to spend 150 gold. Every evolution gives +50% damage, range and attack speed. Every hero chooses one of three forms in the hero panel:
  - **Berserker** (Warrior): swings twice in quick succession (0.15 s apart, counting as one attack for energy), and every hit makes the enemy bleed. Ultimate *Frenzy*: +50% damage and attack speed for 5 seconds.
  - **Commander** (Warrior): throws the sword in a straight line out to its range (base 110), hitting every enemy in the way once. Ultimate *Rally*: for 5 seconds, every hero within 220 px (the Commander too) gets double energy per attack.
  - **Sentinel** (Warrior): the normal swing. Ultimate *Barricade*: puts a wall on the path just ahead of the enemy it attacked; for 1 second, enemies pile up against it (a zone of type `barrier`).
  - **Marksman** (Ranger): same arrows. Ultimate *Piercing shot*: charges for a moment, then an arrow flies straight through every enemy in line for 3x a hit; it replaces the normal arrow (an ultimate with `replaces: true`).
  - **Boomerang Ranger:** throws the old Thief's boomerang (it flies faster with attack speed). Ultimate *Spinning blade*: a boomerang circles the Ranger for 6 seconds, hitting everything it touches; several at once are spaced evenly around the circle.
  - **Hunter** (Ranger): arrows deal toxic damage. Ultimate *Toxic traps*: lays 3 traps on path tiles in range, spread along the path; an enemy stepping on one makes it burst for 4x a hit of toxic damage to everything close by (at most 6 traps at once, see `TRAP` in `ultimates.js`).
  - **Fire Mage:** fire bolts that always burn. Ultimate *Inferno*: sets every enemy on the map on fire.
  - **Cold Mage:** cold bolts that slow enemies to half speed (the old Frost Mage chill). Ultimate *Blizzard*: freezes every enemy on the map for 1 second (`BLIZZARD_FREEZE` in `js/engine/ultimates.js`).
  - **Lightning Mage:** lightning bolts that always shock. Ultimate *Storm*: for 3 seconds, strikes every enemy around the Mage (1.3× its range) every half second for half a hit, shocking them.
  Evolutions are data: a hero's `evolutions` is a list of steps `{ level, cost, choices }`, and each choice can change the name, colour, damage type, ultimate, on-hit effects and stats (see `evolvedDef` in `data.js`). Ultimates are registered in `ultimates.js`; areas like the storm are zones in `js/engine/zones.js`.
- **Items:** a win always drops an item and a loss has a chance (up to 50%, more for surviving longer). The server rolls the drop, so it cannot be faked. Each hero has one item slot; equip items on the Heroes screen. For now there is one item, the Power Charm (+5 damage).
- **Talents:** you get 1 talent point per level above 1. One General tree for every hero, plus one tree per hero. Allocate nodes that connect to the origin or to an allocated node; remove one only if the rest stay connected. Respec is free. The old Archer and Frost Mage points carried over to the Ranger and Mage trees; points in the trees of archived heroes were refunded.
- **Timed buffs:** Frenzy and Rally are buffs on the hero (`h.buffs`, added with `w.addBuff`). They are modifiers that last a few seconds; getting the same buff again refreshes it instead of stacking. The hero panel lists them as "Buff", and a coloured ring shows around the hero while one is active.
- Talents, items, evolutions and relics are all modifiers, so they stack, and the hero panel shows where each bonus comes from. Bonuses from the same source are shown as one line whatever their rarity (a Common and a Rare Sharpened rounds: "+100% · Sharpened rounds ×2"), and the relic strip shows one chip per relic with the copies added together. All talent nodes count as one source, so each stat has a single "Talents" line (for example "+16% · Talents ×3").
- **Relic rarities** are whole multiples of the Common version: Uncommon 2×, Rare 3×, Epic 4×. Relics are written at Common strength in `data.js`.

## Damage types, defenses and ailments
Used by the Mage's evolutions; enemies have no armor or resistances yet:
- **Damage types:** physical, spell, fire, cold, lightning and toxic. Each hero deals its own type (`damageType`: Warrior and Ranger physical, Mage spell, and its evolutions fire, cold or lightning) and can gain added damage of any type (`fireDamage`, `spellDamage`, ...). Spell damage causes no ailment.
- **Defenses:** enemies have `armor` (blocks part of physical hits, more of small hits, up to 90%) and `res` per type (up to 75%; negative means extra damage). Both are 0 for now, set per enemy type in `js/engine/enemies.js`.
- **Ailments** (`js/content/combat.js`), each with a chance stat on heroes (`bleedChance`, ...):
  bleed (physical hits; damage over time, strongest counts), poison (physical or toxic hits; toxic damage over time, stacks up to 20), burn (fire hits; damage over time, strongest counts), shock (lightning hits; for 2 s the enemy's armor is halved and every resistance drops by 20 points, so with no resistance it takes 20% extra non-physical damage), freeze (cold hits; enemy stops, longer for bigger hits, up to 1.5 s).
- Every attack goes through `attack()` in `js/engine/combat.js` and damage over time through `dotDamage()`; ailment rolls use the match's seeded random numbers, so replays stay exact. The damage meter credits damage over time to the hero that caused it.
- To try it, give a relic, talent node or item a modifier such as `{ stat: 'burnChance', type: 'flat', value: 0.25, scope: ['all'] }` together with `fireDamage`.

## Relic luck and interest
- **Relic luck** (`relicLuck`, from the Four-leaf clover relic) makes rarer relics more likely: each rarity's weight is multiplied by 1 + luck once per step above Common. The relic picker and the Relic button's tooltip show the current odds.
- With Compound interest, the gold box shows what the next wave clear pays in interest and how much gold earns the full amount.

## Extending the game
Everything in combat flows through `hit()` in `js/engine/world.js`, which emits `damage` and `kill` events. Pieces react to events instead of calling each other.
- **New relic:** add an entry to `RELICS` in `data.js`: a list of modifiers like `{ stat: 'damage', type: 'inc', value: 0.3, scope: ['cold'] }`. `inc` values add together, `more` values multiply, `flat` values add to the base. Scope is a list of hero tags, `['all']`, or `'global'` for economy stats.
- **New hero using an existing behavior:** add an entry to `HEROES` with its tags, base stats, ultimate and evolutions, and a tree with `addTree` in `talents.js`. Then run `npm run sql`.
- **New item:** add it to `ITEMS` in `js/content/items.js`, then run `npm run sql` and run the update SQL. It starts dropping right away.
- **New ultimate:** `registerUltimate('id', { name, desc, damageMult, onFire(world, hero) })` in `js/engine/ultimates.js`, then set `ultimate: 'id'` on a hero.
- **New evolution step:** add another entry to a hero's `evolutions` list.
- **New hero behavior:** add `registerBehavior('kind', { update(g, hero, dt) {} })` in `js/engine/behaviors.js`.
- **New status effect:** add it to `EFFECTS` in `js/engine/effects.js`, then list it in a hero's `applies` field.
- **New projectile:** add it to `PROJECTILES` in `js/engine/projectiles.js` (and its look to `PROJ_DRAW` in `js/game/render.js`) and spawn it from a behavior.
- **New enemy:** add it to `ENEMIES` in `js/engine/enemies.js` and return it from `waveEnemyType`.
- **New talent:** add a node to a branch in `talents.js`, then run `npm run sql` and run `supabase-update.sql` in Supabase (a test fails until the SQL files are rebuilt).

## Setup
1. **Database:** in Supabase, open SQL Editor, paste `supabase-setup.sql` and run it. (Already set up earlier? Run `supabase-update.sql` instead; it is safe to run more than once.)
2. **Auth setting:** Authentication > Providers > Email: turn **Confirm email** off (the exact menu wording may differ).
3. **Config:** put your Project URL and publishable key in `js/config.js`.
4. **Run it:** the game uses ES modules, so opening `index.html` by double-click will not work. Test locally with `python3 -m http.server` in this folder and open http://localhost:8000, or push to GitHub Pages.

## How accounts work
- Passwords are hashed and stored by Supabase Auth. The game never stores or sees a stored password.
- Players log in with a **username**. Supabase signs in with an email-style address, so the username is mapped to a private internal address (`username@players.testtbd.app`, set in `config.js`). The **real email** the player types is saved in their profile, must be unique, and is never shown to other players.
- Level, XP, gold and best wave live in the database. The browser cannot write them directly; only the `finish_run` function can, and it validates each run.

## Security
What the server enforces (all in `supabase-setup.sql` / `supabase-update.sql`):
- **Run records:** a result is accepted only for a run the server saw start (`start_run`), once, within 24 hours. Starting a new run cancels the unfinished one, so runs cannot be started in parallel.
- **Minimum time:** a run must take at least as long as the enemies need to spawn at 2x speed (80% of it for tolerance), and at least 15 seconds. Clearing level 1 takes at least about 78 seconds, level 5 about 4 minutes.
- **Rate limit:** at most 30 saved runs per hour per player.
- **Talents:** the server has a copy of every talent tree and rejects unknown nodes and nodes that do not connect to their tree's start. After changing `js/content/talents.js`, run `npm run sql`, then run `supabase-update.sql` in the SQL Editor.
- **Usernames:** 3-16 letters, numbers or underscores. Reserved names (admin, moderator...), a starter list of offensive words and look-alikes of existing names (0/o, 1/l/i) are rejected, even if someone skips the sign-up form. Add rows to `blocked_names` to block more.
- **Items and lineups:** only the server creates items (in `finish_run`); players can read their own items but not change them. `save_loadout` only accepts known heroes, at most 3 different ones, and items the player owns, each worn once. Each run records the lineup and equipment it started with.
- **Permissions:** players can only call the functions the game needs, and cannot read or write the private tables directly.

What it cannot stop: someone who writes a script that plays slowly and sends believable numbers. They would still gain XP at roughly real-time speed, up to the hourly limit. Stopping that means re-playing each run on the server, which is a bigger project.

### Optional: CAPTCHA on login and sign-up (Cloudflare Turnstile)
1. In Cloudflare, create a Turnstile widget for your site's domain (for GitHub Pages, `yourname.github.io`). Copy the site key and the secret key.
2. In Supabase: Authentication > Bot and Abuse Protection > turn on CAPTCHA protection, choose Cloudflare Turnstile and paste the **secret** key.
3. Add the **site** key to `js/config.js`: `export const CAPTCHA_SITE_KEY = 'your-site-key';`
Do steps 2 and 3 together: with CAPTCHA on in Supabase but no site key in the game, nobody can log in.

### Optional: remove the old prototype tables
The earlier prototypes (Target Rush and the first tower defense) left tables that anyone with the public key can add rows to. If you no longer use those games, run `supabase-cleanup-old-prototypes.sql`. It permanently deletes their leaderboards.

## Known limits
- **The real email is not verified**, because sign-up uses the internal address. Someone could register with an email that isn't theirs, and password reset by email does not work yet. Real email login, verification and recovery are the next step if you want them.
- If sign-up says the email is invalid, Supabase rejected the internal domain. Change `AUTH_DOMAIN` in `config.js` to a domain you own.
- **Cheating is limited, not impossible.** See "Security" below: runs are checked by the server for plausibility, but the game itself runs in the browser.
