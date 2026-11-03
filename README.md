# Test TBD

HTML/JS tower defense with accounts, a main menu and a leaderboard. No build step.

## Structure
```
index.html                 page shell: one <section> per screen
js/main.js                 boot: registers screens, picks the first one
js/config.js               your Supabase URL and key (and optional CAPTCHA site key)
js/core/                   bus.js (events), screens.js, tooltip.js, state.js, rules.js
js/services/api.js         the only file that talks to Supabase
js/screens/                login, menu, levels, talents, leaderboard, settings, play (one file each)

js/content/                WHAT the game contains (plain data, no logic)
  data.js                  heroes, relics, rarities, levels
  talents.js               talent trees and allocation rules
  format.js                display text for modifiers
js/engine/                 HOW the game works (no page, no clock, no Math.random)
  world.js                 the simulation: createWorld(), step()
  commands.js              every player action: place, sell, move, wave, auto, buyRelic, reroll, banish, choose
  rng.js                   seeded random numbers
  replay.js                command logs: exportLog(), replay(), verify()
  hash.js                  fingerprint of a world (tests)
  stats.js, behaviors.js, enemies.js, projectiles.js, effects.js, meter.js
js/game/                   the browser shell around the engine
  game.js                  input -> commands, the loop, background play
  render.js                canvas drawing (beams, slashes, projectile looks)
  ui.js                    HUD, damage meter, hero panel, relic picker

tests/                     run with: npm test
tools/bot.mjs              a bot that plays through the same commands as a player
tools/balance-report.mjs   run with: npm run balance
tools/generate-talent-sql.mjs  run with: npm run talent-sql
.github/workflows/test.yml runs the tests on GitHub on every push
supabase-setup.sql         database setup (fresh install)
supabase-update.sql        updates an existing database (safe to run again)
supabase-cleanup-old-prototypes.sql  optional: deletes tables from the earlier prototypes
```

## How the engine works
- **Engine vs. shell.** `js/engine` holds every game rule and never touches the page, the clock or `Math.random`. `js/game` turns clicks into commands, runs the loop and draws. The same engine runs in the browser, in the tests and in the bot, and could run on a server.
- **Commands.** The only way to change a game is `apply(world, { type, ... })`. A command is checked, applied and recorded with the tick it happened on; a refused command changes nothing. To add a player action, add an entry to `COMMANDS` in `commands.js`.
- **Seeded randomness.** Each run gets a seed. Separate random streams for the map and for relics mean, for example, that rerolling relics never changes the map.
- **Command logs.** A seed plus the list of commands replays a run exactly: `replay(log)` gives the same final state, and `verify(log)` checks the result a log claims. The Play screen receives the log when a run ends (`onRunEnd`), ready for a future step where the server re-plays runs to stop cheating.
- **Engine version.** `ENGINE_VERSION` in `world.js` must go up whenever a rule change would make old logs play out differently; `replay` refuses logs from another version.
- **Golden rule:** game state changes only through commands and `step()`. Setting values directly (like `world.gold = 500`) breaks replays.

## Tests and the balance bot
- `npm test` runs everything (needs Node 22). Tests cover the random numbers, stat math, talents, every command, each hero's behavior, enemies and waves, winning and losing, replays, the browser shell on a fake page, and checks that the SQL files still match the game rules (wave counts, rewards, timings, talent trees). GitHub runs them on every push.
- `npm run balance` plays every level with four bot strategies and prints win rates. Options: `--runs 8 --stages 1,2,3 --strategies balanced,melee --level 10` (`--level` is the player level, so talents are included). The bot is not clever, so treat results as a yardstick for comparing changes, not as how hard a level feels to a person.

## Levels
Five levels: 15 waves, then 5 more each (20, 25, 30, 35). A level unlocks when the previous one is cleared. Levels differ in enemy health and how fast it grows (`STAGES` in `data.js`, easy to tune). The leaderboard shows levels cleared, then the furthest wave on the level a player is working on.

## Window and background play
- Every screen fits the browser window and never scrolls. The game board scales to the space available; the panels sit beside it (below it on a tall, narrow screen).
- The game runs on a fixed time step, so it plays the same at any frame rate. When the tab is hidden or the window is minimized, a timer keeps it running, and it catches up on any time the browser paused (up to 30 minutes).
- Heroes cannot be controlled while the tab is hidden, so turn on Auto-start before switching away.

## Heroes and talents
- Heroes have an **archetype** (melee, range or spell) and **tags**; relics and talents are modifiers aimed at tags. Every hero's tags include its archetype and its own id, so a modifier can target "all spell heroes" or just one hero.
- You get **1 talent point per level above 1**. The Talents button in the main menu opens the trees: one General tree for every hero, plus one tree per hero. Allocate nodes that connect to the origin or to an allocated node. Remove a node only if the rest stay connected. Respec is free for now.
- Talent effects are modifiers, so they stack with relics and show up in the hero inspector as "Talent". Hover a node to see what it does.
- In a run, click a hero to see its stats and buffs, and to **Move** or **Sell** it (sells for 70% of what you paid). Relic choices can be **rerolled or banished** for 25% of the relic's price, rising 5% with each use.

## Extending the game
Everything in combat flows through `hit()` in `js/engine/world.js`, which emits `damage` and `kill` events. Pieces react to events instead of calling each other.
- **New relic:** add an entry to `RELICS` in `data.js`: a list of modifiers like `{ stat: 'damage', type: 'inc', value: 0.3, scope: ['cold'] }`. `inc` values add together, `more` values multiply, `flat` values add to the base. Scope is a list of hero tags, `['all']`, or `'global'` for economy stats.
- **New hero using an existing behavior:** add an entry to `HEROES` with its tags and base stats, and a tree with `addTree` in `talents.js`.
- **New hero behavior:** add `registerBehavior('kind', { update(g, hero, dt) {} })` in `js/engine/behaviors.js`.
- **New status effect:** add it to `EFFECTS` in `js/engine/effects.js`, then list it in a hero's `applies` field.
- **New projectile:** add it to `PROJECTILES` in `js/engine/projectiles.js` (and its look to `PROJ_DRAW` in `js/game/render.js`) and spawn it from a behavior.
- **New enemy:** add it to `ENEMIES` in `js/engine/enemies.js` and return it from `waveEnemyType`.
- **New talent:** add a node to a branch in `talents.js`, then run `npm run talent-sql` and paste the output in the Supabase SQL Editor (a test fails until the SQL files are updated).

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
- **Talents:** the server has a copy of every talent tree and rejects unknown nodes and nodes that do not connect to their tree's start. After changing `js/content/talents.js`, run `npm run talent-sql` and paste the output in the SQL Editor.
- **Usernames:** 3-16 letters, numbers or underscores. Reserved names (admin, moderator...), a starter list of offensive words and look-alikes of existing names (0/o, 1/l/i) are rejected, even if someone skips the sign-up form. Add rows to `blocked_names` to block more.
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
