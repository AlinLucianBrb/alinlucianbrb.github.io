# Test TBD

HTML/JS tower defense with accounts, a main menu, co-op for up to 4 players and leaderboards. No build step.

## Structure
```
CLAUDE.md                  working notes for Claude Code: conventions, every-change checklist, the art pipeline
index.html                 page shell: one <section> per screen
js/main.js                 boot: registers screens, picks the first one
js/config.js               your Supabase URL and key (and optional CAPTCHA site key)
js/core/                   bus.js (events), screens.js, tooltip.js, state.js, rules.js, version.js (the version in the menu corner)
js/services/api.js         the only file that talks to Supabase
js/screens/                login, menu, levels (level, then heroes), lobby (co-op), heroes, inventory, talents, leaderboard, settings, play;
                           loadout.js holds what they share (items, equipment, saving the lineup)

js/content/                WHAT the game contains (plain data, no logic)
  rules.js                 the rules the server also uses (XP, rewards, waves, spawn timing, bosses, drops, co-op): ONE place
  effect-stats.js          stats that do something in a fight (relics, item bonuses, talent notables); the engine side is procs.js
  (core) prefs.js          the player's settings, kept on this browser; keys.js (game): the list of keys
  live-text.js             the numbers in ability texts, from a hero's real stats
  legendaries.js           legendary relics; the engine side is legendaries.js and legend-perks.js (what attacks and ultimates ask)
  match-effects.js, map-effects.js   the double-edged match effects (from act 4) and the act 5 maps' effects
  shop.js                  the match shop: ground effects, the gamble, summoned bosses
  crafting.js              materials, disenchanting and crafting (the server's copy is generated from it)
  upgrades.js              the level-30 upgrades: two per form, basic attack or ultimate
  unlocks.js               what each act unlocks (the server's copy is generated from it)
  data.js                  heroes (and archived ones for later), energy defaults, attributes, relics, rarities, levels
  previews.js              what each evolution path shows before level 15 (the form previews)
  items.js                 items that drop after matches (one slot per hero)
  talents.js               the talent tree (clusters and paths) and allocation rules
  format.js                display text for modifiers
js/engine/                 HOW the game works (no page, no clock, no Math.random)
  world.js                 the simulation: createWorld(), step()
  commands.js              every player action: place, move, evolve, wave, auto, buyRelic, reroll, banish, choose
  rng.js                   seeded random numbers
  replay.js                command logs: exportLog(), replay(), verify()
  hash.js                  fingerprint of a world (tests)
  ultimates.js             what a hero does when its energy bar is full
  stats.js, behaviors.js, enemies.js, enemy-abilities.js (special enemies), projectiles.js, effects.js, meter.js
  aura.js                  auras: heroes whose ring pulses on everything inside (Incantation, Occult)
  preview.js               evolution paths at work: the path's tags, the preview's echo of the form, its growth
  kits/                    the newer heroes, one file each (priest, warlock, paladin, shaman) plus common.js; each registers
                           its attacks, ultimates and zones into the shared tables
js/game/                   the browser shell around the engine
  game.js                  input -> commands, the loop, background play
  render.js                canvas drawing: the painted board, sprites, effects (shapes while the art loads)
  sprites.js               loads the pixel art from assets/; the list of every sprite the game uses
  ui.js                    HUD, damage meter, hero panel, relic picker
  kit-art.js               how the newer heroes' things look: auras, minions, totems, their projectiles and zones
  saved-run.js             keeps the run on this browser, so a refresh does not lose it
js/net/                    co-op
  lockstep.js              keeps every player's game in step (host and guests)
  channel.js               a lobby's live channel (Supabase Realtime: messages and who is here)
  session.js               the lobby this browser is in, shared by the Lobby and Play screens

assets/                    the pixel art the game loads (built by python3 art/build.py; do not edit by hand)
art/                       the scripts that draw the art (Python + Pillow); art/out/ is their working folder (not kept in git)
tests/                     run with: npm test
tools/bot.mjs              a bot that plays through the same commands as a player
tools/balance-report.mjs   quick win-rate table: npm run balance
tools/balance/             the full balance report (experiments, analysis, HTML report): npm run balance:report
                           and the difficulty check per level: npm run balance:tune
tools/build-sql.mjs        builds the two SQL files from sql/ and js/content: npm run sql
tools/maps.mjs             designs the preset maps (js/content/maps.js): npm run maps
tools/evo-check.mjs        browser check of evolved forms in a match (Playwright); capture-attack.mjs records an attack
tools/rules-sql.mjs        writes the database's rule_* functions from js/content/rules.js (used by build-sql)
sql/                       the database, in parts (tables, functions, permissions); edit these, not the built files
.github/workflows/test.yml runs the tests on GitHub on every push
supabase-setup.sql         database setup for a new project (built by npm run sql)
supabase-update.sql        updates an existing project (built by npm run sql; safe to run again)
```

## How the engine works
- **Engine vs. shell.** `js/engine` holds every game rule and never touches the page, the clock or `Math.random`. `js/game` turns clicks into commands, runs the loop and draws. The same engine runs in the browser, in the tests and in the bot, and could run on a server.
- **Commands.** The only way to change a game is `apply(world, { type, ..., p })`: place, move, evolve, wave, leave (co-op), auto, playOnPick, buyRelic, reroll, banish, choose. A command is checked, applied and recorded with the tick it happened on; a refused command changes nothing. To add a player action, add an entry to `COMMANDS` in `commands.js`.
- **Seeded randomness.** Each run gets a seed. Separate random streams for the map and for relics mean, for example, that rerolling relics never changes the map.
- **Command logs.** A seed plus the list of commands replays a run exactly: `replay(log)` gives the same final state, and `verify(log)` checks the result a log claims. The Play screen receives the log when a run ends (`onRunEnd`), ready for a future step where the server re-plays runs to stop cheating.
- **Engine version.** `ENGINE_VERSION` in `world.js` must go up whenever a rule change would make old logs play out differently; `replay` refuses logs from another version, and a run saved on the browser before such an update is dropped instead of resumed. (Now 18.)
- **Game version.** `GAME_VERSION` in `js/core/version.js` is shown in the bottom-right corner of the main menu, next to the engine version. Bump it with every update you publish.
- **Players.** A world has one player (solo) or 2 to 4 (co-op). Each player has their own heroes, talents, gear, gold, relics and relic choices; the map, the enemies, the lives and the waves are shared. Commands carry `p`, the player (0 in solo). `playerView(world, i)` is the world as player i sees it (their gold, relics...), which is what the HUD draws.
- **Golden rule:** game state changes only through commands and `step()`. Setting values directly (like `world.gold = 500`) breaks replays.

## One place for the rules
The numbers the server has to agree with the game on (account XP per level, match rewards, waves and spawn timing, the kill cap, boss waves, the minimum run time, item drops, co-op sizes) live only in `js/content/rules.js`; item rolls and prices in `js/content/items.js`, levels and rarities in `data.js`. The game imports them, and `npm run sql` writes the database's copy as small `rule_*` functions (`rule_xp_need`, `rule_run_xp`, `rule_kill_cap`, `rule_min_run`, `rule_rarity`, `rule_rank`, `item_price`...) that `start_run`, `finish_run`, `save_loadout` and the lobby functions call. To change a rule: edit `rules.js`, run `npm run sql`, run `supabase-update.sql`. A test fails if the SQL files were not rebuilt.

## Saved runs
A solo run is kept on this browser every few seconds and when the page is hidden (its seed and commands, a few KB). After a refresh or a closed tab, the menu shows **Resume run · Level N, wave W**: the run is played back to where it was and waits, paused. **Give it up** throws it away. A saved run lasts 24 hours and is per account. Co-op matches are not saved (they cannot go on without the others).

## Co-op
- **Play solo**, **Create lobby** or **Join lobby** on the menu.
- **Create lobby:** public, or private with a password; pick a level (one you have unlocked). The lobby gets a 5-character name (letters and numbers) to share.
- **Join lobby:** type the name, or pick from the list of open lobbies (🔒 = private: it asks for the password).
- **In the lobby:** 4 slots, each player in their colour, with the heroes they bring (Change picks them, like before a solo match). The host (♛) picks the level and starts once at least 2 players are connected. If the host leaves before the start, the next player becomes host.
- **The match:** everyone shares the map, the enemies, the lives and the waves; heroes, relics and gold are each player's own. Enemies have ×2 life with 2 players, ×3 with 3, ×4 with 4. Every kill pays every player its bounty. A wave starts when everyone has pressed Ready (or has Auto-start on). Nothing pauses: the relic and evolve pickers stay open while the match goes on. Each player's heroes stand on a ring of their colour; the bar under the wave counter shows everyone's gold and who is ready; the damage meter has a row per player's hero. You can look at anyone's heroes, but only move and evolve your own. The host sets the game speed.
- **Leaving:** a player who leaves (or whose tab closes) is out after 5 seconds; their heroes stay and keep fighting, and waves stop waiting for them. If the host leaves, the match ends for everyone and each player's run is saved as it stands.
- **Rewards:** each player saves their own run, with their own talents' bonuses and drops. The level only has to be unlocked for the host, so friends can bring someone along; a level you clear in co-op unlocks the next one for you only if it was your next level.
- **Leaderboards:** one tab per mode (Solo, 2, 3 and 4 players), each with its own records.
- **How it stays in step:** every game runs the same deterministic engine, and only commands travel (Supabase Realtime, on the lobby's channel). The host's game is the clock: it applies everyone's commands and sends them, with the tick each happened on, to the others, who never run ahead of the host. To balance Realtime traffic (Supabase limits messages per second for the whole project) against delay, it sends 3 times a second, plus an early turn as soon as someone acts, so a guest's command comes straight back. The other players' games play smoothly about half a second behind the host, so a guest's own clicks take effect about 0.5 s later; until then they show as pending (a faded hero where you placed or moved it, Ready already pressed, the relic button busy). The numbers are `TURN_MS` and `IDLE_MS` in `js/net/lockstep.js`. Every few seconds a fingerprint of the world goes along, so a guest notices if it ever falls out of step. A lost message is asked for again. Realtime is on by default in Supabase; nothing to set up.

## Tests and the balance bot
- `npm test` runs everything (needs Node 22). Tests cover the random numbers, stat math, talents, every command, each hero's behavior, enemies and waves, winning and losing, replays, the browser shell on a fake page, and checks that the SQL files still match the game rules (wave counts, rewards, timings, talent trees). GitHub runs them on every push.
- `npm run balance` plays every level with four bot strategies and prints win rates. Options: `--runs 8 --stages 1,2,3 --strategies trio,ranger --level 10 --form lightningmage,hunter` (`--level` is the player level, so talents are included; `--form` picks each hero's evolution, for example `berserker,lightningmage,hunter`). The bot is not clever, so treat results as a yardstick for comparing changes, not as how hard a level feels to a person.
- `npm run balance:report` runs the full balance experiments (about 3,000 games: some 25 minutes on two cores, a few minutes on eight; it uses every core) and writes `tools/balance/out/balance-report.html`: open it in a browser. Options: `--quick` (one seed, fewer settings, a sample of the teams: a few minutes), `--seeds 5` (steadier, slower), `--comp-seeds 2` (every team twice), `--only comps,relics` (rerun some experiments, keep the rest), `--workers N`. Each run keeps the previous results, and the report shows what changed since then in colour, so run it before and after a balance change. Its last experiment is the **difficulty curve** (below).
- `npm run balance:tune` is the quick difficulty check (a few minutes): every level at its point on the progression curve, played by the weakest and strongest tenth of teams (ranked by the last report's team runs) and by the single worst and best team, against the targets. `--levels 4,5`, `--every 1` (every team of each tenth, steadier), `--try changes.json` tries changes in memory without editing the game, e.g. `{ "stages": { "5": { "hpMult": 6, "growth": 1.1 } }, "forms": { "marksman": 1.8 }, "hex": 0.3 }`.
  - **The progression curve** (`PROGRESSION` in `tools/balance/suites.mjs`): level 1 at player level 1 with no gear, level 2 at 5 with no gear, level 3 at 10 with common gear, level 4 at 20 with rare, level 5 at 30 with epic. **The targets** (`TARGET`): the weakest tenth of teams clears a level about 40% of the time. Teams with Lunar Druid or Earthcaller are left out of the ranking: their crowd control (slowing or stunning whole crowds) helps the whole team far more than any other form, so they clear far more often. A 60% target for the strongest tenth would need every team within about 20% of the others in strength; they are several times apart, so the strongest teams clear most of the time.
  - **What it measures.** *Heroes and forms*: every evolution form alone on levels 1 and 2 (player level 30, epic gear, taken as the evolution path): win rates, how fast it kills bosses and how many get through, ultimates. *Teams*: every team of three different heroes (84) with every combination of their forms (2,268 games) on level 5 (where even the best teams rarely win, so nothing a support adds to a strong team is cut off by the win): each form's **team value** (how much further its teams get than the average team, so it counts everything a hero adds: curses, slows, buffs, energy, not only its own damage), the best and worst teams, and the pairs that work well or badly together (synergy: how much better the teams with both do than their two team values add up to). Team value is also split by how strong the two teammates are: **as a partner** (the strongest third of its teams) and **as a carry** (the weakest third), each against the other forms in that spot. Multipliers such as Verdict, Hex, Heresy and Rally show their worth as partners. A form's **power** (0 to 100) depends on its role, set in `tools/balance/roles.mjs`: damage forms are half how far they get alone and half team value; semi-supports (Inquisitor, Commander, Heretic, Gospel, Incantation, Witch Doctor) a quarter alone and three quarters value as a partner; supports (Occult) value as a partner only. *Difficulty*: every level at player levels 1, 10, 20 and 30 (gear none, common, rare, epic) with three lineups: win rate, how far runs get, lives lost per wave, and where lost runs end. *Relics*: every relic given twice before wave 1 to six teams it does something for (relics for certain heroes go to teams with one of them), on level 5, against the same team and seed without it, plus how often the bot buys each one. *Gear and talents*: player level against gear tier on level 4. At the top, **What stands out** lists the weak and strong forms, levels that are too hard or too easy, big steps between levels, bosses that get through and relics that do nothing.
  - **Progress** is how far a run got: waves cleared plus how much of the last wave was done (the share of its enemies killed; on a boss wave, half that and half the share of the boss's health taken off), over the level's waves, plus up to 0.25 for lives kept on a win, so close runs and two wins can still be told apart.
  - **The smart bot** (the default; `skill: 'simple'` is the old one) plays like a good player: it places each hero where its real range covers the most path not already covered by the others; values a relic offer by how much it adds to the team's damage (or gold); picks an evolution by playing each choice ahead through the next boss wave and keeping the one that kills it with the fewest lives lost; moves a hero after it evolves if a much better spot is free; puts supports where they help the others (a curse aura or the Inquisitor, whose Verdict stacks pay off only when the others hit the same enemies, where the others' ranges overlap the path, a blessing aura or Gospel among as many heroes as possible) and moves them again after every evolution; and buys relics freely while keeping gold for the next evolution. Gear is generated per tier to suit each hero (`tools/balance/gear.mjs`), and runs can start with relics (`relics` in `createWorld`, saved in the log so replays match).
  - Files: `suites.mjs` (the experiments and their settings), `run.mjs` (worker threads), `smart.mjs` (the smart bot), `collect.mjs` (the measurements), `analyze.mjs` (numbers and flags), `report.mjs` (the page).

## Levels and zones
- **25 levels in 5 zones** of 5 (`js/content/zones.js`): Green Meadow (levels 1-1 to 1-5, the five levels from before), Deep Forest, Mire, Red Canyon and Ashlands. Each zone has its picture (`assets/level_<zone>.png`), shown on its levels. A level is called by its code, "zone-level" (1-3 is Green Meadow's third), in the level list, the HUD, the leaderboard, lobbies and saved runs. A level unlocks when the previous one is cleared; the level screen shows the five zones (each with its levels cleared, or Locked) and the chosen zone's levels, opening on the zone you are working on.
- **Waves:** 15 on the first level, 10 more each level, up to 55 at the end of act 1 (every level after 1-5 has 55) (`LEVEL_WAVES` in `data.js`).
- **Enemy health** (`STAGES` in `data.js`): Green Meadow's five levels are tuned (see the balance pass); the others follow a formula, not balanced yet: each level's last wave is 12% tougher than the one before and its first wave 4% tougher (`LATER`).
- **Preset maps** (`js/content/maps.js`): every level has its own fixed map, the same in every match, not a random one. The paths twist and turn: about 14 turns on level 1-1 down to 4 on level 5-5 (the lower the level, the longer and twistier the road). They run from the left edge to the right edge and never touch themselves, not even diagonally. `npm run maps` (`tools/maps.mjs`) designed them with a seeded search; change its `SEED` or `TURNS` and run it again for new ones.
- The leaderboard shows levels cleared, then the furthest wave on the level a player is working on, with a tab for solo and one for each co-op size.

## Game screen and controls
The map fills the window and the HUD floats on top: level, wave and lives in the top middle; your relics down the left; Menu top right, with the selected hero's details under it; the damage meter bottom right (click its title to fold it); gold, the hero cards, Relic, Start wave (its right-hand AUTO part toggles Auto-start) and speed at the bottom. Hover any hero card or button for a tooltip.

- **Hero cards are indicators.** Each shows the hero's portrait, name and level, and its two abilities as icons, like an action bar: the basic attack darkens and clears clockwise as its cooldown runs (with the seconds left on longer cooldowns), and the ultimate clears as the energy bar fills and glows gold when it is ready. Cards stay after a hero is fully evolved and show the evolved form's icons. The icons are dim until the hero is on the map. Hover a card for the hero's description, its tags (the ones relics, talents and items refer to, like Melee, Projectile, Spell, Physical, Fire), its damage type and the ailments its hits can inflict, and its ultimate; hover an icon for that ability. The map no longer shows a level badge or energy bar on heroes.
- **Keep playing while choosing:** a box in the relic picker. Off by default, the match waits while you choose; on, it carries on behind the picker (which turns see-through) while other actions still wait for your choice. The setting is remembered on this browser for later matches (it is a command in the run log, so replays play the same way).

| Action | Mouse / touch | Keys |
|---|---|---|
| Choose a hero to place, or select a placed one | click its card | 1-3 |
| Place it / select a hero | click a tile | |
| Move a hero | click and hold it on the map, then let go on a free tile (or on another of your heroes: the two swap places) | M, then click a tile |
| Evolve a hero | the ▲ Evolve button above its card (it shows the cost), then a form in the picker | E (selected hero) |
| Move the map | drag (any mouse button), or drag with one finger | arrows or WASD |
| Zoom | mouse wheel, pinch, or the + / − buttons | + / − |
| Fit the map to the screen | Fit button | F |
| Buy a relic | Relic | Space (or R) |
| Pick a relic in the relic picker | click it | 1 / 2 / 3 |
| Start the wave | Start wave (AUTO is red while Auto-start is off, green when on) | Enter |
| Pause | Menu (asks before quitting; in co-op it only asks, the match goes on) | P (Esc resumes; not in co-op) |
| Game speed | speed button: 1x, 2x from act 3, 3x in endless | |

- The camera fits the map into the space the HUD leaves free (a little closer than an exact fit) whenever a run starts or the window changes size (until you move or zoom it yourself; Fit returns to that view).
- **2.5D view:** the board is seen through a tilted perspective camera, Arknights style (see True perspective): the ground is squashed in depth (`TILT` in `js/game/camera.js`) and narrows toward the far side (`FAR`) while heroes, enemies and their health bars stand upright on it (`upright()` in `js/game/sprites.js`), each with a shadow and smaller further back, with a haze over the far side, a sunken road and upright scenery around the board. Heroes and enemies are drawn front to back, so whoever is nearer covers the ones behind. Range rings and ground effects lie flat on the board, so they look like ellipses.
- Every run, including Retry after a win or a loss, starts with Auto-start off and unpaused.

## Background play
- The game runs on a fixed time step, so it plays the same at any frame rate. When the tab is hidden or the window is minimized, a timer keeps it running, and it catches up on any time the browser paused (up to 30 minutes).
- Heroes cannot be controlled while the tab is hidden, so turn on Auto-start before switching away. A paused game stays paused in the background.

## Heroes, energy, evolution and items
- **Nine classes:** Warrior (melee swing), Hunter (fast arrows that fly to their target), Mage (a magic bolt that flies to its target, dealing arcane damage), Rogue (two quick strikes, with a knack for critical hits), Druid (thorny bolts that can root enemies in place), Priest (holy bolts and a Blessing for the heroes around her), Warlock (shadow bolts that Corrupt), Paladin (a heavy hammer, part of it holy) and Shaman (chain lightning). The four newer ones are described in "The newer heroes" below. In a match, the hero cards follow your lineup order (key 1 first). The Thief, Frost Mage (with its slow), Fire Mage and Lightning Mage are kept in `HERO_ARCHIVE`, with their behaviors and relics, for the advanced variants later.
- **Lineup:** after clicking a level (Play), players choose up to 3 different heroes to bring, then press Start. "Next level" after a win goes to the same choice. In a match each hero is placed once, for free; gold goes to evolutions and relics.
- **Heroes screen:** one card per hero; click one to open its page. **Information**: the five gear slots on the left, one line each (the item worn, or how many free items fit). Click a slot to see every free item that fits it, best first; hover an item for its stats, click it to equip; Remove takes the worn one off. Hover a worn item for its stats. The page fits the game window with no scrolling, the hero's picture in the middle (a placeholder until there is art), stats on the right (attributes, damage with where the bonuses come from, range, speed, energy, ultimate). **Evolutions**: the evolution tree, from the base hero to each form with its attack and ultimate.
- **Inventory screen** (main menu, under Heroes): every item you own as an icon on a grid, framed in the rarity colour. Worn items come first. Hover one for its rarity, slot, archetype, bonuses, who wears it and its price; click one to sell it.
- **Attributes:** strength, dexterity and intellect. Every hero has all three and one of its own (Warrior, Paladin and Shaman strength; Hunter and Rogue dexterity; Mage, Druid, Priest and Warlock intellect; evolved forms keep it, except a form with its own `attribute`: the Animalic Druid is dexterity, and the two values swap so nothing is lost). Each point of a hero's own attribute is +1% increased damage (`ATTRIBUTE_DAMAGE`). Every point of every attribute also has side effects (`ATTRIBUTE_EFFECTS`): **strength** +0.25% range and 0.1% penetration (a share of armor ignored, and points off every resistance, never below 0), **dexterity** +0.1% crit chance and +0.005 crit damage, **intellect** +0.3% cast speed and +0.5% energy from attacks. Item and relic bonuses Brawn, Finesse and Insight give a named attribute, Prowess the main one (it follows a form that changes attribute). Heroes start with 10 in their own attribute. **Each hero level** gives +3 to its own attribute, +1 to the other two, and +1% range and attack and cast speed (`HERO_LEVELS.perLevel`), so a level 10 hero has 37 in its own attribute (+37% damage).
- **Energy and ultimates:** every hero has an energy bar (blue under the hero; gold and glowing when full). It fills by `energyPerAttack` per attack and `energyPerSecond` during waves; the defaults are in `ENERGY` in `data.js` (2 per attack, so about 50 attacks to an ultimate; 0 per second), and both are ordinary stats that talents, relics and items can change. When the bar is full, the next attack is the ultimate. An ultimate that puts a buff or a lasting state on the caster (Frenzy, Rally, Heresy, Blessing, Ancestral call, Nature's grasp, Enrage, Crescendo, Doom, Demon gate: `buff` or `active` on the ultimate) is not cast again while that lasts; the bar waits full.
- **Hero levels:** during a match, every hero on the field gains XP from each kill (Grunt and Runner 1, Brute 3), whoever landed it. Level 2 takes 10 XP and each level after takes 2 more, so level 15 comes near the end of level 1-1 and level 30 (the most) around wave 26. Each level adds +3% damage. The rules are `HERO_LEVELS` in `data.js` (set `perLevel` to `[]` for no bonus). Levels show as a badge on the hero, on its card and in the hero panel.
- **Hero cards** (bottom bar) are small: the name with the level next to it, and "150 gold · place it" until the hero is on the map (the price turns red while you cannot afford it). A hero with no evolution left has no card any more (select it on the map).
- **Hero panel** (select a hero on the map): the name and level; under it damage dealt, kills and ultimates this match (with icons); XP, and energy right under it; strength, dexterity and intellect (the hero's own attribute in its colour: strength red, dexterity green, intellect blue; hover one for where it comes from); then **Stats**, one line each with its icon (hover a line for its base value and every bonus: the attribute, Talents and Items each as one line, each relic, the hero level, buffs); then **Items**, the hero's gear as icons (hover one for its item level and bonuses). What the ultimate does is on its icon in the hero's card. The panel fits without scrolling.
- **Evolution:** once a hero reaches the evolution's level (10 for now), an **▲ Evolve · 500** button pops up above its card, dimmed until you have the gold. Clicking it (or E with the hero selected) opens the evolution picker: like the relic picker, it pauses the game and shows the three forms side by side; Cancel or Esc closes it. Every evolution gives +25% to all the base hero's stats: damage, range, attack and cast speed and the three attributes (`EVOLVE_BONUS`). Every hero chooses one of three forms:
  - **Berserker** (Warrior): swings twice in quick succession (0.15 s apart, counting as one attack for energy), and every hit makes the enemy bleed. Ultimate *Frenzy*: +50% damage and attack speed for 5 seconds.
  - **Commander** (Warrior): throws the sword in a straight line out to its range (base 110), hitting every enemy in the way once. Ultimate *Rally*: for 5 seconds, every hero within 220 px (the Commander too) gets double energy per attack (shown as a soft blue flash and ring).
  - **Sentinel** (Warrior): the normal swing. Ultimate *Barricade*: puts a wall on the path just ahead of the enemy it attacked; for 1 second, enemies pile up against it (a zone of type `barrier`).
  - The **Hunter**'s own ultimate is *Piercing shot*: charges for a moment, then an arrow flies straight through every enemy in line for 3x a hit; it replaces the normal arrow (an ultimate with `replaces: true`).
  - **Ranger** (Hunter): arrows fly straight at the target and on, through every enemy in their way, to a little past his range (`js/engine/kits/hunter.js`). Ultimate *Ricochet ring*: a ring on the toughest enemy in range for 2.5 seconds; he shoots into it, and an arrow that flies in cannot leave: it bounces off the edge, 20% faster each time, hitting the enemies inside again and again (each at most every 0.2 s) until the ring ends.
  - **Boomerang** (Hunter): throws the old Thief's boomerang (it flies faster with attack speed). Ultimate *Spinning blade*: a boomerang circles him for 6 seconds, hitting everything it touches for 3x a hit (`ORBIT_SCALE`); several at once are spaced evenly around the circle.
  - **Poacher** (Hunter): arrows deal toxic damage. Ultimate *Toxic traps*: lays 3 traps on path tiles in range: under the enemies in range first, then toward the entrance (`groundSpots` in `ultimates.js`); an enemy stepping on one makes it burst for 4x a hit of toxic damage to everything close by (at most 6 traps at once, see `TRAP` in `ultimates.js`).
  - **Fire Mage:** fire bolts that always burn. Ultimate *Inferno*: sets every enemy on the map on fire.
  - **Cold Mage:** cold bolts that slow enemies to half speed (the old Frost Mage chill). Ultimate *Blizzard*: freezes every enemy on the map for 1 second (`BLIZZARD_FREEZE` in `js/engine/ultimates.js`).
  - **Lightning Mage:** lightning bolts that always shock. Ultimate *Storm*: for 3 seconds, strikes every enemy around the Mage (1.3× its range) every half second for half a hit, shocking them.
  - **Rogue** (base): strikes twice in quick succession (like the Berserker's double swing), dexterity, 10% crit chance. Ultimate *Mark*: every enemy on the map is marked for 6 seconds; hits against a marked enemy, from any hero, get +25% crit chance and +50% crit damage (`MARK`).
  - **Assassin** (Rogue): teleports behind the strongest, toughest enemy in range (the one with the most life left) and strikes it once, for double damage (range 130). Ultimate *Shadow clones*: clones appear behind every enemy on the map and strike each one twice.
  - **Toxicologist** (Rogue): throws two toxic daggers at the strongest, toughest enemy in range; each one poisons. Ultimate *Poison flask*: a bottle lands where that enemy is and leaves a puddle for 6 seconds that poisons every enemy in it once a second (`POISON_POOL`).
  - **Alchemist** (Rogue): throws two concoctions at the strongest, toughest enemy in range: a fire one that burns, then a toxic one that poisons. Ultimate *Flammable puddles*: 3 puddles on the path (under enemies in range first, then toward the entrance) for 8 seconds; enemies in them move at half speed, and a burning enemy in one makes it explode for 3x a fire hit to everything within 64 px (`OIL`).
  - **Druid** (base): a spell caster (intellect, cast speed) that shoots thorny bolts of physical damage; each hit has a 15% chance (`rootChance`) to **root** the enemy, holding it in place for 1 second. Ultimate *Nature's grasp*: for 6 seconds every hero within 180 px (the Druid too) gets +10% chance to root the enemies it hits (`GRASP`; a green ring shows on them).
  - **Animalic Druid** (Druid): the bolt is replaced by a **wolf** that runs after the enemy furthest along the path within the Druid's range and bites everything in a cone in front of it; its bites bleed, and they are the Druid's hits (damage, crits, ailments, energy, the damage meter), at the Druid's cast speed. Without a target it trots back to the Druid. Ultimate *Enrage*: for 6 seconds the wolf is bigger, with twice the reach and twice the damage (`WOLF`, `ENRAGE`).
  - **Naturist Druid** (Druid): grows a patch of **thorns** on the path just ahead of the enemy furthest along within range, one per cast (so cast speed grows them faster). Each patch lasts 1.5 seconds and hits every enemy standing in it for 45% of a hit four times a second; up to 8 patches at once (`THORNS`). Ultimate *Bramble spikes*: every patch erupts, hitting each enemy standing in one (or right next to it) once for 4x a hit, however many patches it stands in (`SPIKES`).
  - **Lunar Druid** (Druid): **moonlight** beams every enemy in range at once for 70% of a hit of cold damage each, slowing them for 1 second (`MOONBEAM`). Ultimate *Moonfall*: a moon falls where the targeted enemy will be in 0.6 seconds and smashes everything within 70 px for 5x a cold hit (`MOON`).
  Evolutions are data: a hero's `evolutions` is a list of steps `{ level, cost, choices }`, and each choice can change the name, colour, damage type, ultimate, on-hit effects and stats (see `evolvedDef` in `data.js`). Ultimates are registered in `ultimates.js`; areas like the storm are zones in `js/engine/zones.js`.
- **Items:** every boss you defeat drops an item, a win drops one more, and a loss has a chance (up to 50%, more for surviving longer). Item find from talents adds to the chance. The server rolls the drops, so they cannot be faked. Equip items on the hero's page (Heroes screen).
- **Item level:** 3 × the level you beat (on a loss, the level below; levels count 1 to 25): item level 3 from level 1-1, 6 from 1-2, up to 75 from 5-5. Every stat on an item counts 0.5 + 0.05 × its item level times: item level 3 gives 65%, 10 gives 100%, 30 gives 200%, 75 gives 425% (`ILVL` in `js/content/items.js`). Items from before item levels count as 10, so they keep their values. Tooltips start with the item level and the multiplier; the bonuses and the item's own stat show at their scaled values.
- **Gear:** five slots per hero: helm, body armour, legs, boots and a trinket (`SLOTS` in `js/content/items.js`). Item types: Helm, Body Armour, Leggings, Boots, and the Power Charm (a trinket with +5 damage of its own).
- **Item rarity and bonuses:** items have the relic rarities (Common 55%, Uncommon 28%, Rare 13%, Epic 4%). A Common item has at least 1 bonus, an Uncommon 2, a Rare 3, an Epic 4; each further bonus has a 30% chance, up to 4 (`ROLL`). An item never has the same bonus twice.
- **Bonuses are hero relics only:** damage, range, speed, crits, energy and the minion relics (`ITEM_BONUSES`: relics whose modifiers all work on heroes). Gold, XP, lives and relic luck (Prospector, Tax collector, Compound interest, Four-leaf clover, Reinforced gate) no longer roll on gear; old items that have one show it greyed out as "no longer works on gear", and it does nothing. Bonuses help only the hero wearing the item, and only if it has the tags (Whetstone needs a melee hero).
- **Bonus ranks:** each bonus has its own rank, 1 to 4, rolled separately; a rank 3 Whetstone gives what a Rare Whetstone relic gives. The item's rarity does not decide the ranks but makes higher ones likelier (`ROLL.rankWeights`, in %, ranks 1/2/3/4): Common 70/22/7/1, Uncommon 45/35/15/5, Rare 25/35/28/12, Epic 10/25/35/30. So a Common item can roll a rank 4 bonus and an Epic one a rank 1. Tooltips and the hero page show each bonus in its rank's colour (white, green, blue, purple) with its rank. The server rolls the ranks in `finish_run` and stores them in `player_items.bonus_ranks`; items from before ranks count each bonus at the item's rarity. Items from before rarities are Common with no bonuses, and an old single item becomes the hero's trinket.
- **Item types:** every slot has a plain item (Helm, Body Armour, Leggings, Boots, Power Charm) and one per archetype: **melee** (Great Helm, Plate Armour, Plate Greaves, Sabatons, Bloodstone Ring), **projectile** (Leather Hood, Leather Jerkin, Leather Trousers, Ranger Boots, Feather Charm), **spell** (Circlet, Silk Robe, Silk Wraps, Silk Slippers, Arcane Amulet) and **minion** (Beast Mask, Hide Armour, Fur Leggings, Fur Boots, Fang Necklace). On an archetype item each bonus has a 60% chance (`ROLL.affinityChance`) to come from that archetype's bonuses (`AFFINITY`: melee Whetstone, Wide swing, Quick hands, Cruelty; projectile Fine arrows, Long barrels, Quick hands, Keen edge; spell Arcane focus, Split bolt, Quick incantation, Battle focus; minion Pack leader, Feral haste, Hunting instinct, Savage bite), else from all of them; bonuses never repeat. Tooltips name the archetype. The server keeps each type's archetype (`item_types.affinity`) and each bonus's archetypes (`item_bonuses.tags`), generated from `js/content/items.js`.
- **Selling items** (Inventory): click an item, then Sell, then again to confirm; it is gone and its price goes to your account gold. Worn items have to be taken off first. The price is a base by rarity (5, 15, 40, 100) plus 5 gold per bonus rank (`SELL`, `sellPrice`); the server's `sell_item` works out the same price itself (`item_price`) and checks the item is yours and not worn. Tooltips show the price.
- **Talents:** you get 1 talent point per level above 1, spent in **one tree** shared by every hero. It is **symmetrical**: 20 clusters in 20 directions, inner and outer ones alternating. **The top half is combat, the bottom half quality of life.** Respec is free.
  - **The circle:** around the origin is a circle of path nodes only: an anchor in each inner direction (reached from the origin by a path) and a junction in each outer direction. Inner clusters hang from their anchor; outer clusters have a path down to their junction. Every path node gives **+1 to all attributes** (so +1% damage for any hero, through its own attribute).
  - **Clusters** are diamonds pointing away from the origin, connected only at their beginning node, with **two kinds of stats**: the beginning and the end (the notable) have both; the left side has only the first kind, the right side only the second. Inner clusters have 6 nodes, outer ones 8.
  - **Combat (top), west to east:** Martial (melee damage | melee attack speed), Sunder (armor penetration | physical damage), Marksmanship (projectile damage | range), Elements and toxins (elemental and toxic hero damage | poison chance), Might (damage | attack speed), Fire (added fire damage | fire penetration), Precision (crit chance | crit damage), Cold, Sorcery (spell damage | cast speed), and Lightning on the east end. The Fire, Cold and Lightning notables add the ailment's chance.
  - **Quality of life (bottom), east to west:** Training (heroes start at a higher level | lower level needed to evolve), Fortune (gold | item find at the end of a match), Tempo (hero XP | end-of-match XP; the Overdrive notable unlocks 3x speed), Treasure Hunter (item rarity luck | chance of an extra item bonus), Relics (rerolls | banishes), Merchant (cheaper relics | chance of a 4th or 5th relic offer), Wealth (starting gold | wave gold), Investor (interest | interest limit, like the Compound interest relic), Gate (lives | cheaper evolutions), and Energy (energy per attack | energy per second) on the west end.
  - With the whole Training cluster, heroes start at level 5 and evolve at level 6. Merchant: each full 100% is one more relic offer, the rest a chance of one more (at most 5). Treasure Hunter is applied by the server when it rolls the items (`finish_run`): rarity luck works like relic luck, and the extra chance adds to the 30% chance of each further bonus.
  - Hero nodes target **tags** (melee, projectile, spell, fire...), so they reach every hero with the tag, evolved forms included.
  - **The screen:** scroll (or + / −) to zoom, drag to move, Fit to see it all. Click a node next to your allocated ones to take it; click a node further away to take the whole shortest path to it, if you have the points (the tooltip says how many). Click an allocated node to give it back, if nothing else hangs on it.
  - Node ids start with `t4_`; `supabase-update.sql` refunds points spent in any older tree.
- **Timed buffs:** Frenzy and Rally are buffs on the hero (`h.buffs`, added with `w.addBuff`). They are modifiers that last a few seconds; getting the same buff again refreshes it instead of stacking. The hero panel lists them as "Buff", and a coloured ring shows around the hero while one is active.
- Talents, items, evolutions and relics are all modifiers, so they stack, and the hero panel shows where each bonus comes from. Bonuses from the same source are shown as one line whatever their rarity (a Common and a Rare Sharpened rounds: "+15% · Sharpened rounds ×2"), and the relic strip shows one chip per relic with the copies added together. All talent nodes count as one source, so each stat has a single "Talents" line (for example "+16% · Talents ×3").
- **Relic rarities** are whole multiples of the Common version: Uncommon 2×, Rare 3×, Epic 4×. Relics are written at Common strength in `data.js`.
- **Relic strength:** relics are 15% of their earlier values (`RELIC_POWER` in `data.js`, one number to tune them all), for example Sharpened rounds +3.75% damage per Common. Exceptions: **Prospector** is a 25% chance (per Common) of +2 gold per kill; chances add up, and past 100% it rolls again (200% is a sure +4, 250% is +4 and a 50% chance of +2 more). **Compound interest** keeps its full strength (5% up to 60 gold per Common), **Tax collector** is half its old value (+25% wave gold), **Reinforced gate** gives whole lives (1, 2, 2, 3), and **Split bolt** is a 15% chance per Common of hitting one more target.
- **Relic prices** go up by 12 gold per relic bought (half the old step): 48, 60, 72...
- **Rerolls and banishes** are free, but you only get them from the Relics talents (a number per match, shown on the buttons); without any, the buttons are not shown. The relic picker shows each offer as a card in its rarity's colour, with the relic's icon big above its name.

## Changes from the design notes (Nov 10)
- **Hunter tree renamed:** the Ranger is now the **Hunter**, and its forms the **Ranger**, **Boomerang** and **Poacher** (the ids stay ranger, marksman, boomeranger and hunter, so saves, art and talents keep working).
- **Energy** is a tenth of what it was; **buff ultimates** wait while their buff lasts (see Energy and ultimates).
- **Scaling:** attributes have new side effects, levels raise every stat, evolutions give +25% to all stats, and the swing arc stat is gone (Wide swing is no longer a relic or an item bonus; the Martial cluster gives melee attack speed instead). See Attributes.
- **Damage** rolls between a min and a max; **armor and resistances** work alike; enemies are slower; "toughest" means the toughest kind first. See Damage types and Defenses.
- **Duration** relic (and item bonus): +7.5% (Common) to the duration of buffs, debuffs and damage over time, stat `duration`. Effects take it from the hero that applies them (`applyEffect(e, id, eff, by)`, `addBuff(..., by)`).
- **Relic icons** (`python3 art/relics.py`, `relicIcon()` in sprites.js): one per relic, on the relic chips and in the picker.
- **Pixel UI:** a pixel font, framed panels and buttons, a logo, a menu background, level pictures and icons everywhere (see Art).
- **Kits:** Heresy (+100% when paid), Purge (armor and resistances alike), Occult (no damage), locusts (whole path), Witch Doctor darts (unlinked first), totems (never replaced; surge pulses 3 times), Infernal (knockback, no golem), Hellfire (spreads), Incantation (smaller aura, range 70), Crusader (can stand on the path, and then rides only along it).
- **Texts:** attack descriptions describe only the attack, ultimate tooltips only the ultimate, and the hero tooltip the hero (its attribute, delivery and source, tags, damage type). Ultimates that deal damage of their own write it as `{N}` in their description; `ultDesc()` shows it as the number it deals with the hero's stats ("about 156 damage"); "x2 damage" is kept for boosts to an attack the hero already makes. "At level 10, choose a path" is gone from the descriptions.
- **Choosing heroes for a level** starts with none picked; you can clear them all, but Start waits for at least one.
- **Balance (bot):** lineups of three at a level-10 player win levels 1 and 2 every time and level 3 about two times in three; levels 4 and 5 are out of reach for the bot now (they reach waves 21 to 27). Solo heroes have a harder time on level 2 than before, since ultimates are now rare. The bot no longer evolves into the Occult when it plays alone, since that form deals no damage.

## Synergies: debuffs open enemies to other damage, and a third level-30 choice (Nov 25, v0.76.0)
- **The ring:** every damage type has one debuff that opens enemies to it. An enemy with that debuff takes +25% from that
  type's part of every hit (not from damage over time): Bleeding → Toxic, Poisoned → Fire, Burning → Cold, Frozen or
  Slowed → Physical, Shocked → Arcane, Rooted → Lightning, Corrupted → Holy, Hexed / Doomed / Marked / under Verdict →
  Shadow. No hero is opened by its own debuff, so lineups chain them (Druid roots → Shaman hits harder and shocks →
  arcane hits harder).
- **Level 30 now offers three upgrades:** the basic attack, a new **passive**, or the ultimate (keys 1, 2, 3). Each of
  the 27 passives feeds on debuffs, mostly ones other heroes put on enemies: e.g. Berserker +30% to poisoned enemies,
  Hunter +4% per Poison stack, Marksman +15% per different debuff, Fire Mage's burns twice as hard on poisoned enemies,
  Cold Mage's freezes twice as long on burning ones, Toxicologist's poison stacks twice on bleeding ones, Gospel's Psalm
  gives Revelation (+20% to debuffed enemies), Occult's Hexed dead pass their burn/bleed/poison/Corruption on.
- **Soul drain** deals +10% for every Corruption or Poison stack on the drained enemy (10 stacks: double).
- Hero pages have a **Combos** part (what makes its damage hit harder and who sets it up; what it and its forms set up),
  and the Evolutions tab and the in-match picker say who sets each passive up.
- First numbers; not balanced yet. Rules change: `ENGINE_VERSION` 40. No SQL change.

## Gems: Rough Stone, crafting, combining and sockets (Nov 25, v0.75.0)
- New material, **Rough Stone**: 2 for every boss killed, and on a win 2 × the act number more (Act 5 win: +10).
  Endless and lost matches give the boss stones only. The result screen and loot row show what you got.
- Inventory has a third tab, **Gems**: craft an Elemental gem (Amethyst, Ruby, Sapphire, Topaz) or a Primal gem
  (Hematite, Emerald, Pearl, Obsidian) for 10 Rough Stone + 100 gold. You get a Common gem of a random type of that
  family, with one random stat from that type's pool (e.g. Ruby: added fire damage, burn chance or fire penetration).
- Pick 3 gems of the same type and rarity to combine them into one of the next rarity (up to Epic); it keeps one of
  the three stats at random and the highest item level. A gem gives its value × (rarity + 1) × its item-level bonus.
- Every item has 2 sockets. On a hero's page, open a gear slot to put gems in or take them out (free). Selling or
  disenchanting an item gives its gems back. The gem bag holds 200.
- Gems unlock with crafting (Act 2).
- Art: gem and stone icons made with Pixel Lab (`art/pixellab/icons/g01.png`, `g02.png`, built by `build_icons.py`).
- **SQL changed**: run `supabase-update.sql` (Rough Stone on the profile, the `player_gems` and `gem_kinds` tables,
  `craft_gem`, `combine_gems`, `socket_gem`, and `finish_run` now gives stones). No engine rules change.

## The world map is one painted land (Nov 25, v0.74.0)
- The world map is a painted picture of the whole land: the meadow, the deep forest, the mire, the red canyon and the
  ashlands, with the road running through all five and the demon citadel at the far right as the destination.
- Each act's button stands on its stretch of the road. Moving the pointer over an open act lights up its part of the
  picture; clicking anywhere on it zooms into that act.
- Acts not reached yet are hidden under pixel fog with a ragged edge; the citadel's shape still shows through.
  (With every level unlocked for testing, no fog shows.)
- Art: `art/pixellab/build_worldmap.py` builds `assets/worldmap.png` and the fog (`worldfog_<N>.png`); the act borders
  are in `art/pixellab/worldmap/world_zones.json` and `WORLD_ART` in `js/content/world-map.js`.
- No SQL or rules change.

## Act 5 has its painted map: every act has one (Nov 25, v0.73.4)
- Act 5, the Ashlands, has its painted map: the road comes in at the top left past a summoners' circle raising
  skeletons and a fallen dragon's bones, crosses the lava past a fire-breathing dragon and a gate of obsidian knights,
  and ends at the demon lord's citadel under the erupting volcano, the end of the world. The Endless portal stands
  in the ash by the lava.
- All five acts now have their painted maps (first versions, to be retouched). The drawn road stays as the fallback
  for an act without a picture.
- No SQL or rules change.

## Act 4 has its painted map (Nov 25, v0.73.3)
- Act 4, the Red Canyon, has its painted map: the road comes in low on the left along a dry riverbed, past broken
  wagons, harpy nests on stone pillars and a mossy rock golem, then climbs the stairs around a great mesa to the
  wyvern on its hoard at the top. The Endless portal stands in the dry riverbed.
- The title banner on the map is narrower, so it no longer hides a flag near the top of a map.
- No SQL or rules change.

## Act 3 has its painted map (Nov 25, v0.73.2)
- Act 3, the Mire, has its painted map: the road comes in at the top left past a lizardfolk village on stilts, turns
  into boardwalks over the swamp by a wreck with drowned sailors, and ends at the witches' coven around a bubbling
  cauldron. The Endless portal stands in the water on the left.
- A first version, to be retouched later: the picture has 7 painted stone stops, the levels use five of them.
- The level card now goes to the bottom corner with no flags under it (when both are clear, the one away from the
  flag you clicked).
- No SQL or rules change.

## Act 2 has its painted map (Nov 25, v0.73.1)
- Act 2, the Deep Forest, now has its own painted map with its own layout: the road comes in on the left between
  dark trees with faces, dips past a fairy garden and a ring of white birches, crosses a glowing stream on stepping
  stones and climbs through a runed arch to the shrine of the deer forest spirit (the boss). The Endless portal stands
  by the stream.
- The level card is narrower and goes to the side away from the flag you clicked, so it never covers it.
- `build_worldmap.py` fills see-through edge rows and columns that Pixel Lab sometimes leaves (they showed as a light
  line at the edge); Act 1's map was rebuilt with the fix.
- No SQL or rules change.

## Act 1 has its painted map (Nov 25, v0.73.0)
- Inside Act 1 the level screen shows a painted map of the Green Meadow over the whole window: a hamlet, a stone bridge
  over a river, a great oak with a shrine, a ruined watchtower and a goblin camp, with the road painted between them.
- Each level is a flag standing on its painted stone stop: red with a check when cleared, glowing with "Next" on the
  next one, grey when locked. Once the campaign is finished, the Endless portal (runed stones around a violet swirl)
  stands on its own below the village.
- The other acts keep the drawn road until their maps are painted. Art: `art/pixellab/worldmap/` (Pixel Lab jobs in
  `jobs.txt`), built by `build_worldmap.py` into `assets/zonemap_1.png`, `map_flag.png` and `map_portal.png`; the stops'
  places are in `ZONE_ART` in `js/content/world-map.js`.
- No SQL or rules change.

## World map: Endless apart, one Back button (Nov 25, v0.72.1)
- Endless is not shown on the map until the whole campaign is finished. Then it stands on its own in the top right of
  each act, with a ring around it, off the dotted road. The road joins only the five levels (`ENDLESS_SPOT` in
  `js/content/world-map.js`).
- One Back button, in the top left: it reads "◀ World map" inside an act and "Back" on the world map. The level card
  now sits at the bottom.
- No SQL or rules change.

## World map for choosing levels (Nov 25, v0.72.0)
- Play solo now opens a world map that fills the whole window (the title, the level card and Back float over it):
  the five acts sit one after another along a road, each with its name, how many
  levels are cleared and the item levels it drops. "You are here" marks the act you are in; locked acts are greyed out.
- Clicking an act zooms into it: its levels go from left to right along the road, Endless at the end. "Next" marks
  the next level. Hovering a level (or an act) shows its details; clicking a level shows a card with them and
  "Choose heroes" (clicking the level again does the same). "◀ World map" and Back zoom out again.
- A prototype without art: the positions live in `js/content/world-map.js` (`WORLD`, `ZONE_PATH`). With fewer
  effects on, the zoom is skipped.
- No SQL or rules change.

## Unused files removed (Nov 25, v0.71.1)
- **Pictures the game no longer loads** are gone from `assets/`, and the scripts no longer draw them: the Crusader's old
  horse and its charge and cavalry icons, the removed Bulk order relic, three unused UI pieces, the old back and resume
  icons, and an unused chill picture.
- **Working folders are no longer kept in git:** `art/out/` (the art scripts refill it) and `tools/balance/out/` (the
  balance report writes it). Both are in `.gitignore` now.
- **Old art sources removed:** replaced UI pictures (`art/pixellab/ui/old`), drafts (`art/pixellab/drafts`) and old attack
  attempts (`art/pixellab/attacks/old`). Everything is still in the git history.
- **`supabase-cleanup-old-prototypes.sql` removed** (the one-time script for the earlier prototypes' tables).
- The game itself is unchanged. No rules change; the built SQL only lost a comment that pointed to the removed file, so
  there is nothing to run.

## Where to farm, 2x speed in Act 2, milestone screens (Nov 24, v0.71.0)
- **What each place drops, on the level screen.** Each zone shows the item levels its levels drop (Green Meadow 3–15, Deep
  Forest 18–30 ... Ashlands 63–75); each level shows its item level and how many items a win gives (one, plus one per boss:
  "Items: level 24 · 3 on a win"); the Endless button says its items start at item level 75; and the hero choice before a
  level repeats the line for that level. Nothing about the drops changed, only what the game tells you.
- **2x speed unlocks in Act 2** (was Act 3), so the 55-wave levels of Act 2 can be played faster. It works on levels of
  Act 2 or later; 3x is still for Endless.
- **A new act gets its own screen** after the win that opens it, over the result screen: the zone's picture, "Act 2 · Deep
  Forest", the item levels its levels drop, and each thing the act unlocks with its icon and one line on what it does.
  Continue shows the result screen. **Finishing the campaign** (beating 5-5) gets one too: Endless is open in every zone.
- **Epic items** on the result screen come first and big: the icon with a glow, "Epic item!", the name in its colour, and
  every bonus written out. The other items stay small icons as before.
- **A hero's first evolution into a form** shows the form big over the board for a few seconds: its picture over a glow in
  its colour, "Your Hunter evolved", and the form's name. Once per form, remembered on this browser; it does not pause the
  game, and a click hides it.
- No rules or SQL change for now: while UNLOCK_ALL is on, the server opens everything anyway. When it is switched off, the
  rebuilt SQL (`npm run sql`) carries the new act for 2x speed.

## Hero and evolution cards like in a match, whole-number range, Crusader's reach 1 tile (Nov 23, v0.70.1)
- **The hero cards on the Heroes screen and the hero choice before a level** now look exactly like the hero cards in a
  match, only bigger: no gold frame and no picture window. The whole hero stands on the left of the card over a glow in
  their colour, the name in the outlined pixel font with a fading line under it, the attack and ultimate icons underneath.
  A picked hero gets the gold glow of the selected hero in a match.
- **Evolutions look the same way.** On the Evolutions tab, the top of each card (the hero and each form) is such a hero
  card: the form standing on the left over its colour, the name, its damage type, and its attack and ultimate icons; the
  description and the level 30 upgrades are under it. The card is tinted by the form's colour, and the chosen path glows
  gold. The evolution choice during a match shows each form as one of these cards too, with its key in the corner.
- **Range is a whole number** in the hero window, its tooltip and the Heroes screen.
- **The Crusader's spear reaches 1 tile** (was 2) before range bonuses; the thrown spear still reaches 4 tiles.
- Rules changed (engine 39: a match saved before the update cannot be resumed). No SQL change.

## The shop always on screen, a readable hero window, loot as items (Nov 23, v0.70.0)
- **The shop is always on screen**, as a card at the left edge (no more hover tab): "Shop", your gold (with interest), the
  shop's icons, the Relic button, and the relics you own. The map is fitted beside it.
- **Relics** show as small icons, 4 a row; a number on the icon is how many copies you have, and the name, rarities and what
  they do are in the tooltip.
- **Start, Auto and Speed** are a small block beside the hero cards: Start on top, Auto and Speed under it. Gold and the
  Relic button moved to the shop card.
- **Summoned bosses** have 5 times the life (three times a wave boss's) and pay twice the gold (300 + 30 a wave, was 150 + 15).
- **The hero window** (click a hero) has a fixed width, so it no longer jumps as numbers change, and every value has its word:
  Dealt / Kills / Ults, XP and Energy bars, Str / Dex / Int, and one stat per line with its name (the full name and where it
  comes from stay in the tooltip).
- **Attributes and damage are whole numbers**, rounded up (damage 35 (27–44) instead of 34.6 (26.5–43.3)).
- **The items a match drops** show on the result screen as icons, like in the inventory (rarity colour and letter); hover one
  for its name and bonuses.
- **The Heroes screen and the hero choice before a level** use the same cards as the heroes in a match: the gold button frame,
  the hero's colour along the top, the hero in a framed window, and the attack and ultimate icons.
- Rules changed (engine 38: a match saved before the update cannot be resumed). No SQL change.

## Ranger's ring bigger and at an angle, Crusader's reach (Nov 23, v0.69.1)
- **Ricochet ring** is 1.5x bigger: 75 px across from the centre, about 1.9 tiles (Wide ring doubles that).
- Arrows in the ring bounce off at an angle, so each one goes round the ring in a turning star instead of back and forth
  on one line; every pass still runs 12 px from the centre, so the enemy the ring is on keeps getting hit (`RING.miss`).
  Every other arrow turns the other way.
- **Crusader:** his range is 2 tiles (80, was 140), before range bonuses from levels and evolution. *Spear throw* now reaches 4
  tiles, a fixed distance: the spear flies to the toughest enemy within 4 tiles of him, and every enemy within 4 tiles is
  pushed (`SPEAR.reach`).
- Rules changed (engine 37: a match saved before the update cannot be resumed). No SQL change.

## Hunter, Ranger and Crusader reworks (Nov 23, v0.69.0)
- **Hunter:** his ultimate is now *Piercing shot* (the Ranger's old one): a charged arrow through every enemy in a line for 3x.
- **Ranger:** arrows fly straight through every enemy in their way, one hit each, to a little past his range. Ultimate
  *Ricochet ring*: a golden ring on the toughest enemy in range for 2.5 seconds (longer with Duration). While it is up he shoots
  into it; his arrows cannot leave the ring, they bounce off its edge 20% faster each time and keep hitting the enemies inside
  until the ring ends. Second evolution: *Gathering force* (each enemy an arrow goes through makes it 15% stronger for the
  next) or *Wide ring* (twice as big, 4 seconds). They replace Broadheads and Triple shot.
- **Crusader:** on foot, no more horse; he keeps his art (spear and shield) and can still stand on the path. His attack is a
  spear lunge through every enemy in a line as far as his range; the toughest of them takes 20% more for each other enemy hit.
  Ultimate *Spear throw* (instead of Cavalry): a spear flies into the toughest enemy in range, then every enemy in range is
  pushed back 2.5 tiles along the path. The path's corners and the entrance are walls: an enemy that slams into one is stunned
  for the part of the push it missed (up to 1.5 s if it hits at once) and takes damage only for the part it travelled (at
  least 20%); one that hits no wall takes the full 4x. Second evolution: *Long spear* (the lunge reaches 50% further) or
  *Pinned* (a wall slam deals double damage). They replace Return charge and Second wave.
- Path previews: the Ranger's every 5th arrow and the Crusader's every 6th attack are the new attacks.
- New icons for Ricochet ring, Spear throw, the lunge and the Ranger's arrows (`a10` sheet, `build_icons.py`).
- Rules changed (engine 36: a match saved before the update cannot be resumed). No SQL change.

## Energy over time (Nov 23, v0.68.0)
- **The energy bar fills over time while a wave is on**: 2 a second for every hero (50 seconds to an ultimate), whatever its
  attack or cast speed. Attacks give no energy; when the bar is full the ultimate fires on the hero's next attack, as before.
  So an ultimate build stacks energy gain, duration and damage, and attack speed stays a basic-attack stat.
- What gave "energy from attacks" now gives energy gain (% faster): intellect, the Battle focus relic and item bonus, Rally
  ("doubles energy gain"), Overcharge. Gifts of energy stay as they were (Psalm, Soul drain, Overflow, Ancestors' gift).
- The Incantation and the Occult fill at the normal rate (they had a lower one for their fast pulses); "every Nth" path previews
  no longer hand out the energy of the attack they replace.
- The Energy talents: Focus (energy gain) and, instead of Trickle, Linger (+duration); the start node and Second Wind give both.
- Rules changed (engine 35: a match saved before the update cannot be resumed). No SQL change.

## Duration for every ultimate; tooltips with the real numbers (Nov 23, v0.67.0)
- **The Duration stat now lengthens everything an ultimate leaves behind**, with no cap: the Lightning Mage's storm, the spinning
  blade, traps, the barricade, puddles, the poison pool, Enrage, Consecration, Crescendo, Conversion's spirit, Soul drain (the
  same damage a second, for longer), Doom, the demon and the Infernal's burning ground; and what attacks and relics make: thorn
  patches, imps, totems, Hellfire's burning ground, the Poacher's pools, Momentum, the burn stagger and the Frenzy extension
  (`lasting` in `js/engine/effects.js`). Before, it only lengthened buffs, effects on enemies and damage over time. Only
  animations and travel times (a falling blade or meteor) are not durations.
- Ability texts use the hero's actual stats (gear, relics, levels, talents, evolution): an ultimate's damage and seconds, the Shaman's jumps, the Druid's root and the Warlock's Corruption chances. A number that differs from the
  hero's own (level 1, nothing equipped) is yellow. In the match's hero tooltips, the evolve window and a hero's page.
- The marks are in the texts (`{5}`, `{t:6}`, `{s:jumps}`, `{p:rootChance}`); `js/content/live-text.js` fills them in.
- Rules changed (engine 34: a match saved before the update cannot be resumed). No SQL change.

## Act unlocks only from their act on; the keep-playing box is back (Nov 23, v0.66.1)
- What an act unlocks for matches works on that act's levels and later ones (and Endless), never back on an earlier act's:
  evolution paths from Act 2 levels, the shop and 2x speed from Act 3, match effects from Act 4 (also in co-op, by the level
  being played). Crafting is outside matches and stays open once Act 2 is reached (`inMatch` in `js/content/unlocks.js`).
- "Keep playing while choosing" is back in the relic choice (solo), as well as on the Settings screen.
- No rules or SQL changed (engine 33).

## The shop and relics in a card at the left edge; a boss button (Nov 23, v0.66.0)
- No Shop button or window. Hovering the left edge of the match (or tapping its tab) shows a card with the shop and the relics
  you own; it hides again when the mouse leaves.
- The shop is a small "Shop" title and icons with their price: the two ground effects (click one, then its tile; a solo match
  waits until it is placed), the gamble, and a button for each tile you own (its level; click to upgrade). The details are in
  the tooltips; the last gamble's result shows for 5 seconds under the top bar.
- Summoning a boss is its own button at the end of the bottom bar, with what it pays or how many waves until it can come.
- 7 new icons (Pixel Lab, sheet u01). Key G gambles; B is gone. The shop no longer pauses the match.
- No rules or SQL changed (engine 33).

## Less text (Nov 23, v0.65.1)
- Explanations the screens repeated are gone or moved into tooltips: the hero descriptions on the hero cards (on hover now), the
  hints under the Heroes list, the inventory, the talent tree and the evolve window, "No path" lines, the stat breakdowns on a
  hero's page (hover a stat), the notes on Settings (hover a row), "+25% to all its stats" and the ultimate's text on evolve
  cards (hover a card), the relic odds (on the Reroll button) and "Affects" when a relic helps every hero on the map.
- Shorter: gear slots say "9 free", locked acts just "Locked" (what they unlock on hover), the shop's and the vote's notes.
- "Keep playing while choosing" is only on the Settings screen now.
- No rules or SQL changed (engine 33).

## Inventory sorting and pages, a match summary (Nov 23, v0.65.0)
- **Inventory:** sort (best first, newest, item level, rarity, slot) and filter by slot and rarity; 40 items a page with page
  buttons, so all 200 fit; items that came since the last visit say New (remembered on this browser, per account).
- **End of a match:** a summary under the result: each of your heroes with its level, damage, share and kills, then kills,
  bosses, lives left, relics, the legendary, gold left and the match time.
- Tab to move through the heroes was left out: 1, 2 and 3 already select them, and Tab moves between buttons.
- No rules or SQL changed (engine 33).

## Easier to read and to use by keyboard; Settings (Nov 23, v0.64.0)
- **Fixes:** the Heroes screen and a hero's page fit the window (no scrolling); item pictures in the gear slots were pushed down
  and showed only their top edge; a highlighted gear slot turned gold and its text could not be read; "Empty" is readable.
- **Keyboard:** a window over the match (relic, evolution, effect vote, shop, keys, the end) takes the focus, and the controls
  behind it cannot be reached; tooltips close when one opens. The evolution window answers 1, 2, 3 and shows each form.
- **Text:** never below 12 px (at 1280x720 some was 9 px); the talent tree's names are bigger and its nodes brighter; the hero
  panel's close button and the damage meter's button are bigger.
- **Keys window:** H, ? or the ? button in a match lists every key (`js/game/keys.js`).
- **Settings** (kept on this browser, `js/core/prefs.js`): text size (Normal, Large, Larger), fewer effects (no hit and kill
  flashes, nothing pulses; the default when the computer asks for reduced motion), rarity letters on items and relics (C, U, R,
  E; on by default), the game speed and Auto-start a solo match begins with, and "keep playing while choosing".
- No rules or SQL changed (engine 33).

## Everything open for testing (Nov 22, v0.63.1)
- **All levels, Endless and everything the acts unlock are open**, for every player: `UNLOCK_ALL` in `js/content/rules.js` (false, `npm run
  sql` and `supabase-update.sql` put the locks back). Levels opened early say "Open (testing)"; the levels really cleared are kept as
  before, and a level won out of order does not move the player's progress or the leaderboard.
- **SQL changed: run `supabase-update.sql`** (the server checks the locks too). Match rules unchanged (engine 33).

## Legendary relics (Nov 22, v0.63.0)
- **After wave 25 each player chooses one of 4 legendary relics**, for free, once per match: one for each of their heroes on the map and
  the rest (at least one) for everyone. Not on a level's last wave, so 1-1 and 1-2 have none; endless has it. In co-op the match goes on.
- For everyone: Plague, Overload, Perpetual motion, Iron gate, Collector. For one class, in every form: Bladestorm (Warrior), Ricochet
  (Hunter), Arcane echo (Mage), Death mark (Rogue), Overgrowth (Druid), Lasting light (Priest), Soul harvest (Warlock), Day of wrath
  (Paladin), Ancestors' gift (Shaman).
- Added to the proposal where it would have done nothing: Overload also gives +25% crit chance; Lasting light also gives a short damage
  buff on each of the Priest's attacks (the Archangel has no other buffs); Soul harvest strengthens the Occult's Hex.
- 14 icons with an orange rim (Pixel Lab, sheets l01 and l02).
- Rules changed (engine 33: a match saved before the update cannot be resumed). No SQL change.

## Relics and talents that do something (Nov 22, v0.62.0)
- **14 new relics** (Executioner, First blood, Giant slayer, Shatter, Chain reaction, Thunderhead, Momentum, Overflow, Lone wolf,
  Brotherhood, Last stand, Trophy hunter, Fever, Tempo): every offer has at least one; the plain ones stay. They are **item bonuses**
  too, for the wearer. Each is a hero stat (`js/content/effect-stats.js`; `js/engine/procs.js` does them), so anything can give it.
- **Combat talents:** the ten notables got an effect and keep half their numbers: Might splashes, Fire staggers, Sunder turns Corruption
  into lost defenses, Toxins stops healing, Precision rolls crits twice, Cold hits the frozen harder, Lightning's shock jumps, Sorcery casts
  again, Marksmanship gains by distance, Martial lands every 5th hit twice. The tree keeps its shape: no points are refunded.
- Extra hits never cause more extra hits. Momentum, Overflow, Trophy hunter and Fever have ceilings (PROC).
- 14 relic icons (Pixel Lab, sheets r04 and r05).
- Rules changed (engine 32: a match saved before the update cannot be resumed). **SQL changed: run `supabase-update.sql`** (the item
  bonuses the server can roll).

## Endless (Nov 22, v0.61.0)
- **One per zone**, opened by beating 5-5 (`ENDLESS` in `data.js`, `ENDLESS_RULES` in `rules.js`): a button under the zone's levels, and
  in the co-op level list. Each run is on one of the zone's five maps; the same difficulty everywhere.
- **The next step after 5-5:** 4% tougher on wave 1 and 12.5% on wave 55, growing on at that pace; defenses go on past 60% to 99%. A boss
  every 10 waves, the special enemies again every 55.
- **Before wave 1** one of three map effects is chosen; match effects come after waves 10, 20 and 30. In co-op both are votes.
- **3x speed.** A run ends when the lives are gone or the player quits: quitting saves it (in co-op, for the player who leaves).
- **Items:** one per boss defeated (item find from talents adds its share), each at an item level in the bracket of 25 waves
  reached (500 waves: 475 to 500), never below 75. The inventory still holds 200.
- **Leaderboard:** an Endless board, the best wave, for solo and each number of players.
- Where the bot's runs end (21 games each): level 80 with item level 75 gear, wave 58 in the middle; level 100: 61; with item level 150,
  72; with 300, 84. One run reached 416: a Gospel's Conversion kills any enemy that is not a boss, whatever its life.
- Rules changed (engine 31: a match saved before the update cannot be resumed). **SQL changed: run `supabase-update.sql`** (endless
  runs, drops, records and the board).

## Match and map effects, campaign resistances (Nov 22, v0.60.0)
- **Match effects** (from act 4; `js/content/match-effects.js`, engine `js/engine/match-effects.js`): after clearing waves 15, 30 and
  45 (not a level's last wave) choose one of three double-edged effects, or none, for the rest of the match; never the same twice. Ten
  of them. Solo the match waits; in co-op everyone votes for 20 seconds, the most votes win and a tie is drawn by lot.
- **Map effects** (act 5; `js/content/map-effects.js`, engine `js/engine/map-effects.js`): 5-1 Mud, 5-2 Fog, 5-3 Ley lines, 5-4 Storm,
  5-5 Overgrown (the tiles beside the road cannot be used; melee heroes get 50% more range). Shown on the level screen.
- **Campaign resistances:** at most 60%, which a grunt reaches on the last wave of 5-5 (`CAMPAIGN_CAP`, `THREAT_PER_LEVEL`); 99% is kept
  for endless. Crowd control resistance per threat went up so it stays about as strong at 5-5 (CC.perThreat).
- **Enemy health after 1-5** rises 12.5% a level (was 8%), so the game still gets harder: without the 99% walls the bot won every level.
  42 bot games a level: 100% up to 4-3, 88% at 4-5, then with the map effects 100 / 69 / 86 / 86 / 86% on 5-1 to 5-5. Act 1 health is unchanged.
- **Fixed:** the relic list did not refresh when a gamble raised a relic's rarity.
- Rules changed (engine 30: a match saved before the update cannot be resumed). Running `supabase-update.sql` is not needed for this
  version (one line of the unlock list changed).

## The match shop (Nov 22, v0.59.0)
- Unlocked in **act 3**: a Shop button beside Relic (key B). It pauses a solo match, like the relic picker. The data is
  `js/content/shop.js`; the engine side is `js/engine/shop.js`, `tiles.js` and `boss-gimmicks.js`; the window `js/game/shop-ui.js`.
- **Ground effects** (also the tile upgrades): bought for a tile, there for the match, at most 4 per player, 3 levels.
  **Greed:** the kills of the hero on it pay ×2 / 2.5 / 3. **Conduit:** the hero on it takes 50 / 60 / 70% of the damage, attributes,
  crits and penetration of its owner's heroes on the 8 tiles around; they lose it. Range, speed and energy do not move.
- **Gamble:** 150 gold, 50 more each time, 3 times a wave: relics won, lost or raised, a jackpot, or a cursed wave (+30% life,
  double gold).
- **Summon a boss:** during a wave, then 5 waves of waiting; it pays 150 + 15 per wave, and each one is 15% tougher and pays 25%
  more. Five gimmicks (Splitter, Charger, Warded, Thief, Blinker), the next one always shown. 5 lives if it gets through; no
  items and not a kill. Recoloured warlord walks.
- Rules changed (engine 29: a match saved before the update cannot be resumed). The SQL files changed by one line that the server
  does not use yet (the unlock list), so running `supabase-update.sql` is not needed for this version.

## Disenchanting and crafting (Nov 22, v0.58.0)
- Unlocked in **act 2** (`js/content/unlocks.js`); the numbers are `js/content/crafting.js`, the server side `sql/52-crafting.sql`.
- **Disenchant** (Inventory, Items tab): an item becomes 3 of its rarity's material (Scrap, Dust, Essence, Core); one at a time, or
  every unworn item of a rarity. It asks for a second click, and worn items have to come off first.
- **Crafting** (Inventory, Crafting tab): 5 of a material make 1 of the next. 9 of a material plus gold (25 / 75 / 200 / 500) make an
  item: the player picks the rarity, slot and kind (general, melee, projectile, spell, minion); the server rolls its bonuses and
  ranks like a drop's, at the item level of the highest level beaten.
- Drops and crafting use one roll on the server (`roll_item`); the item level rule is generated too (`rule_item_level`).
- **Fixed:** evolution paths were not loaded at login, so they seemed to be lost after a refresh.
- Four material icons (Pixel Lab, `art/pixellab/icons/m01.png`).
- **SQL changed: run `supabase-update.sql`** (a materials column, the crafting functions). Match rules did not change.

## Evolutions at levels 15 and 30 (Nov 22, v0.57.0)
- **Level 15:** the first evolution (a form) is at level 15 (was 10). Form previews grow until level 14 (was 9).
- **Level 30:** a second evolution: an upgrade of either the basic attack or the ultimate, two per form, 54 in all
  (`js/content/upgrades.js`; 500 gold, no stats, the form keeps its art and shows two stars). Each is a new effect. The numbers
  are data; the effect lives with the attack or ultimate it changes (look for `upgradeOf`), or, for bolts and kills, in
  `js/engine/kits/upgrades.js`. Training talents lower both levels.
- The evolution picker, hero cards, tooltips and the hero page show the upgrades. The hero page's Evolutions tab has a new layout
  that fits the window (it used to run off the bottom).
- "The strongest, toughest enemy" (Assassin, Archangel, Inquisitor...) now ranks the special enemies: an Ironhide comes before a
  brute. They used to count as the weakest kind.
- **Enemy health lowered (the game starts gently and gets harder with progress):** a grunt has 28 life on the first wave of 1-1 (was
  68) and 230 on its last (was 426), up to 50 and 4500 on 1-5 (was 124 and 27,226); each level after 1-5 ends 8% tougher than the
  one before (was 12%). Checked with the balance bot at each level's usual player level and gear (42 games a level): the smart
  bot wins every act 1 level, then 100% at 2-1 down to 76% at 5-5; the simple bot 90 / 100 / 86 / 62 / 52% in act 1 and 19% at 2-1.
- Rules changed (engine 28: a match saved before the update cannot be resumed). No SQL changes.

## Line endings (Nov 22, v0.56.1)
- **.gitattributes** keeps every text file on LF line endings on every computer: Git on Windows turned them into CRLF when
  switching branches, which made three SQL tests fail there. No game, rule or SQL changes.

## Acts, special enemies and stun limits (Nov 22, v0.56.0)
- **Acts:** the five zones are the acts. Act 1 goes 15, 25, 35, 45, 55 waves and every level after it has 55. Enemy health per
  level was not retuned: with more waves, 1-5 ends about 7x tougher than before, and so do the levels after it.
- **Unlocks** (`js/content/unlocks.js`): reaching act 2 (beating 1-5) unlocks picking evolution paths before a match; heroes
  still evolve in a match before that. Paths saved earlier are kept, just not used until then. Winning 1-5 (and so on) says
  what it unlocked; the level screen's act tabs show it too.
- **Game speed:** 1x to start with, 2x from act 3. 3x is no longer a talent (Overdrive keeps its hero XP and end-of-match XP) and
  will come with endless mode.
- **Special enemies** (`SPECIALS` in `rules.js`, `ENEMIES` in `enemies.js`, `enemy-abilities.js`): they replace some of their wave.
  **Stunner** (waves 7, 27, 47) stuns the nearest hero for 1.5 s every 6 s; **Ironhide** (13, 43) has high life and defenses at
  normal speed; **Unstoppable** (18, 28, 38) cannot be frozen, rooted or stunned; **Regenerator** (22, 52) heals, faster the more
  life it is missing; **Summoner** (27) calls 3 minions up to 3 times and cannot be hurt while one lives. Minions give no gold or
  XP and are not kills. They use recoloured walks (`art/pixellab/build_enemy_variants.py`).
- **Crowd control limit** (`CC` in `enemies.js`): an enemy can be held (freeze, root, stun) at most 2.5 s in every 5 s, less its
  crowd control resistance, which grows with the wave and the level; bosses start with 30%.
- Rules changed (engine 27: a match saved before the update cannot be resumed). **SQL changed: run `supabase-update.sql`** (waves
  per level, and paths only once unlocked).

## Tests on Node 26 (Nov 22, v0.55.4)
- `npm test` passes on Node 26 as well as Node 22: Node 26's own localStorage printed a warning that two tests counted as a
  drawing error, so tests/setup.mjs removes it. Tests that need a localStorage still set a fake one.
- **.gitignore** keeps node_modules out of the repository. No game, rule or SQL changes.

## Notes for Claude Code (Nov 22, v0.55.3)
- **CLAUDE.md** at the top of the project: what to do on every change (tests, browser check, changelog, version, SQL),
  the rules that are easy to break, the UI and art direction, and the Pixel Lab art pipeline step by step.
- **tools/evo-check.mjs** and **tools/capture-attack.mjs**: the browser checks used for the art (they need Playwright:
  `npm i -D playwright`). The Warrior forms' attack skeletons are kept in art/pixellab/attacks/. No game, rule or SQL changes.

## Warrior evolutions: new attack animation (Nov 22, v0.55.2)
- The Berserker, Commander and Sentinel share one new 4-frame attack: wind-up (sword raised over the head), swing, strike (held), recover. It is kept light on purpose, so it reads at match zoom and doesn't get tiring at x3 or with high attack speed.
- Made like the Warrior's, with Pixel Lab's skeleton animation from each form's still, posed by hand, so the face, armour and cape stay the same in every frame and the feet never move. Drawn on a 256 px frame (the idle stays 160) so the swing has room; the feet line up with the idle's.
- Hand timing: wind-up 0.25 s, swing 0.07 s, strike 0.30 s, recover 0.18 s, squeezed to fit when the hero attacks faster. Since the strike is no longer the last frame, an attack entry can now say which frame is the strike (`strike`), and the slash effect lands on it.
- Sources in art/pixellab/attacks/ (form_0_stance … form_4_recover), built by build_attacks.py; build_evolutions.py now leaves these forms' attack sheets alone. No rule or SQL changes.

## The Warrior's swing, redone from a reference (Nov 19, v0.55.1)
- **Two-handed overhead slash:** both hands raise the sword overhead (blade cocked back over his shoulder) and hold, a steel smear arc sweeps down, and he ends leaning into the cut with the blade down to the ground. Timing: raise 0.34 s, smear 0.06 s, strike 0.45 s.
- **Made with Pixel Lab's skeleton animation:** a skeleton with sword and cape joints, posed frame by frame. The upper body follows a 3-frame sword-slash reference; the legs stay exactly on his idle stance, so he does not drift or shift his feet. The smear is drawn by hand on the middle frame.
- Same 256 px attack frame and hand timing as 0.55.0; the slash effect still lands with the strike. No rule or SQL changes. The previous attempts are kept in art/pixellab/attacks/old/.

## A real swing for the Warrior (Nov 19, v0.55.0)
- **New attack animation:** he raises the sword, holds a coiled wind-up, then cuts down and follows through until the blade nearly touches the ground. Three hand-picked frames on a bigger 256 px canvas so the swing has room (art/pixellab/build_attacks.py, sources in art/pixellab/attacks/; the old sheet is kept in attacks/old/).
- **Hand timing:** an attack can now give each frame its own time on screen (raise 0.08 s, wind-up 0.32 s, strike 0.45 s) instead of one fps. When the hero attacks faster than that, the timing is squeezed to fit, so the strike is never cut off.
- **The slash lands with the blade:** for hand-timed attacks the slash effect waits for the strike frame instead of showing during the wind-up. The hit itself (damage) still happens when the attack starts, as before: no rule or SQL changes.
- The evolutions keep their current attacks for now; they get the same treatment once the Warrior's is settled.

## Longer maces (Nov 19, v0.54.2)
- The Heretic's and Inquisitor's mace handles are longer, so the mace head rests on the ground and they lean on it like a cane. Both forms re-animated (their attacks are 3 frames). No rule or SQL changes.

## Eight evolutions redrawn (Nov 19, v0.54.1)
- **Commander:** one cape, red with white fur only (no second cape, no blue).
- **Sentinel:** the shield is strapped to his arm.
- **Marksman (Ranger):** a new look, a white and gold hooded cloak, gilded armour, a gold bow and a full quiver, so she reads clearly as the upgrade.
- **Naturist (Druid):** grander: antler crown, a cloak of leaves, bark armour and a glowing crystal staff.
- **Infernalist (Warlock):** the staff now burns red like the rest of him.
- **Heretic and Inquisitor (Paladin):** the flails are gone; both carry a round spiked mace on a solid handle.
- **Witch Doctor (Shaman):** a new look: skull-topped staff with green spirit fire, a bone mask and a ragged moss cloak.
- Each was re-animated (idle and attack). Frames that drifted off-model were left out, so the Infernalist, Heretic and Inquisitor have 3-frame attacks. No rule or SQL changes.

## Every evolution has its own animated art (Nov 19)
- All 27 evolved forms are drawn in the heroes' style (art/pixellab/build_evolutions.py, sources in art/pixellab/evolutions). Each is its base hero edited in Pixel Lab: the same face, hair, height and build, with new or upgraded gear, so the evolution reads as the same person, grander.
- Each form has an idle loop and an attack like the base heroes (anim_<form>_idle/attack.png), and a portrait (portrait_<form>.png) used on its hero card in the match. A few attack frames that drifted off-model were left out (frames.txt says which).
- Evolved heroes are drawn taller on the map than base heroes (1.78 tiles instead of 1.6), so the progress is visible. The evolution cards on the hero page show the new art, bigger.
- The Crusader still rides the old horse sprite when mounted (only the rider is new).

## Plain buttons in the Relic button's style (Nov 18)
- Then gold (v0.53.2): plain buttons are amber-gold plates like Play solo and Start, with dark text (a touch softer than Start, which keeps its shine). Unselected tabs are a duller gold, the selected one bright.
- Plain buttons and tabs are no longer wooden: they are smooth enamel plates like the Relic button, in slate blue (lighter on hover, darker when pressed or off). Start, Quit, Relic and "on" keep their colours.

## Every icon in the heroes' style; last web shapes gone (Nov 18)
- All 183 small icons are new (art/pixellab/build_icons.py, from Pixel Lab sheets in art/pixellab/icons): stats, damage types, ailments, HUD and talent icons (icon_*), every attack and ultimate (ability_*, on a dark slot with a bronze rim, gold for ultimates), every relic (relic_*, violet rim) and every item (item_<type>_<rarity>: Common a little duller, Epic with a faint violet glow). Same names as before, so nothing in the code changed for them. The old icons are kept in art/pixellab/ui/old/icons.
- Items fill their inventory slot, with the rarity as a soft glow and a thin line under the item instead of a thick coloured box. Empty gear slots are sunken slots instead of dashed boxes.
- The last rounded corners are gone (inventory cells, item squares, gear slots, relic chips, damage meter bars), and the hero page headings are warm parchment instead of green.

## New logo, menu icons, zone pictures, page banners and motion (Nov 17)
- Logo (art/pixellab/build_logo_icons.py): a Pixel Lab emblem (a shield with an oak leaf and crossed swords) beside the name in the game's pixel font, set in shaded gold over a bronze extrusion.
- Main menu icons: new 32 px Pixel Lab icons (play, lobby, key, helmet, chest, sapling, trophy, gear, door), drawn small and smooth.
- Zone pictures (art/pixellab/build_levels.py, level_1..5.png): a road through each zone with its enemies marching on it, built from the match art and graded per zone (bright meadow, dark forest, violet misty mire, red canyon, ash with an ember glow).
- Page banners: Heroes, Inventory, Leaderboard, Settings and Choose a level open with their title on a strip of game art (the heroes lined up, the camp, or the chosen zone's picture).
- Motion: the menu's campfire flickers and throws sparks (ui_scene_glow.png, ui_scene_embers_0..3.png, laid over the scene with the same fit), a slow shine runs across Start and Play solo, and a ready ultimate's icon breathes. All of it stops under "reduce motion".
- The old pictures are kept in art/pixellab/ui/old.

## UI materials, zone colours, lighter HUD (Nov 17)
- Each kind of box has its own material (art/pixellab/build_ui.py, "UI materials" in index.html), so the screens are no longer all the same wood:
  - ornate wood (gold leaves, brackets): only the main menu panel;
  - plain wood over planks: structure (HUD pieces, lists, talents, the menu's name and gold boxes);
  - stitched leather with brass corners: hero things (the hero window, the hero page, gear pop-ups, inventory);
  - bolted iron: warnings and confirmations (Quit, Paused, the network banner);
  - black slate with a gold hairline: tooltips;
  - a thin bronze card frame: cards that repeat in a grid (heroes, evolutions, levels, relics).
- The palette is warm now (bronze lines, warm greys) instead of the old teal-green. Web-style pieces are gone: attribute pills are sunken slots, the coloured stripe on hero and evolution cards is a soft wash of the hero's colour, the dividers are bronze. XP and energy bars have a shiny fill.
- Zone colours: the five zones (meadow green, forest teal, mire violet, canyon orange, ash red) tint the match HUD's glow and numbers, the overlay titles, the chosen zone tab and the level cards.
- The hero window is tinted at the top in the hero's colour.
- Lighter match HUD: translucent dark wood with no planks, and the hero cards lost their bronze frame (the gold glow shows the selected one).
- Font rule: the pixel font for short labels and numbers (the hero window, the Quit question, HUD labels), the smooth font only for sentences.

## Buttons in the frames' style (Nov 17)
- Every button is a 32 px plate (slice 10): a 2 px bronze rim lit from the top-left, an ink line, a top-lit face, bronze corner caps with rivets, and a dark lip that disappears when pressed.
- Plain buttons and tabs have a dark wooden face with faint grain. Start, Quit, Relic and the "on" state keep their colours as enamel faces (Start with a deeper gold rim, "on" with a bright one).

## Quieter planks (Nov 17)
- Darker still (v0.49.2): the planks and the card shading are near-black wood.
- The plank texture behind panels is much calmer: wide boards (24 px), barely different tones, soft seams, faint grain, one joint per board, no knots. Big panels like the hero window and the evolutions page no longer tire the eye.
- Cards that sit on a plank panel (hero cards, evolution cards, level cards) have a smooth dark-wood gradient instead, so wood is not stacked on wood.

## Plank panels, detailed frames and a new menu scene (Nov 17)
- Panels: a carved wooden frame (lit outer edge, grained wood, a groove, a bronze strip with rivets repeating along the sides, bronze corner brackets, gold leaves) over dark wooden planks (ui_planks*.png, a seamless tile with boards, seams, joints, nails and knots). Light planks for cards, darker ones for tooltips.
- The menu background is rebuilt from the game's own art (art/pixellab/build_scene.py): a forest clearing at night made from the match tileset and trees, a dirt road, and the heroes resting around a campfire by a tent (fire and tent made in Pixel Lab). The old scene is kept in art/pixellab/ui/old.

## UI kit in the heroes' style, first pass (Nov 17)
- New frames for every panel, button, tab, slot, input and bar (art/pixellab/build_ui.py, which writes assets/ui_*.png; the old kit is kept in art/pixellab/ui/old).
- Drawn at 1 screen pixel per art pixel, like the heroes: dark oiled wood with a bronze bead and an ink outline, gold leaf ornaments on the corners of the big panels (cut from a Pixel Lab frame), and bronze-rimmed buttons with a soft top-lit face and a lip.
- The CSS keeps the old layout borders; only the slices changed ("UI kit v2" block at the end of the style sheet).

## No scroll bars; hero window below the Quit question (Nov 17)
- No scroll bars anywhere in the game. Long lists still scroll with the mouse wheel or a swipe.
- The hero window is a little wider (250 px) and grows to fit everything, items included, without scrolling.
- The hero window now starts below the Menu / "Quit this match?" row, so they never overlap.

## Full portraits on the hero cards (Nov 17)
- The portrait is no longer cut or faded on its right side. The whole picture shows, running behind the name and skill icons (staffs and weapons included).

## Portraits blend into the hero cards (Nov 17)
- No frame around the portrait anymore. It fills the card's left side, head to waist, over a soft glow in the hero's colour, and fades into the card on its right and bottom edges.

## Styled hero cards (Nov 17)
- Each card is tinted by its hero's colour (stronger when selected, with a gold outline).
- The portrait sits in a framed window lit from behind in the hero's colour.
- The name is in the pixel font with an outline, the level is a small badge, the price is a coin and the number, and the hotkey is a small keycap. The skill icons sit in bevelled slots.

## Hero cards and action buttons, second pass (Nov 17)
- Hero cards are as tall as the bottom bar. The portrait fills the card's left edge from top to bottom, mirrored where needed so every hero looks right, into the card. Name, level and price sit on top, and the two skill icons (42 px) fill the rest.
- Start wave is now just "Start" ("Start 5s" while Auto counts down). Relic, Start, Auto and Speed are narrower and shorter.
- Fixed: js/core/version.js was emptied by the v0.46.1 build, so the main menu failed to load. It is restored.

## More top-down camera (Nov 17)
- The camera looks down more steeply: TILT 0.8 (was 0.62) and FAR 0.8 (was 0.72) in js/game/camera.js. The field is deeper on screen and the far rows shrink less. Rules are unchanged.

## In-match UI rework (Nov 17)
- A hero is selected by clicking anywhere on its sprite, not only its tile (the front-most hero wins when two overlap). Right-click on the sprite starts moving it.
- The hero panel is compact: icons and short values only (attributes, XP and energy bars, a 3-column stats grid, items). Hover any icon for its name and exact value. New stat icons for every damage type and ailment. A close button sits in its header.
- The Quit popup now sits above the hero panel.
- Relic, Start wave, Auto and Speed buttons are smaller.
- Hero cards are redone: a zoomed portrait (head to waist) on the left, then name, level and price ("150 gold"), with bigger skill icons.

## Auto-start glow (Nov 17)
- The Auto-start button no longer has the spinning wheel: while it is on, a bright green border glows and pulses around it. With the system's reduced-motion setting on (for example Windows with animations turned off) the glow stays, it just does not pulse; before, the wheel simply did not show then. Game version 0.45.1.

## Accessibility and QoL from playtest feedback (Nov 17)
- **Auto-start button:** while it is on, it is green with a small spinning pixel wheel before AUTO and a slow glow; off, it stays red and still (no motion with the system's reduced-motion setting). The tooltip says so.
- **Moving heroes:** no more click-and-hold dragging. Select a hero (click it on the map, click its card, or its number key), then press **M** or **right-click**: the grid and the hero's range show at the pointer; click the new tile to move it there (onto one of your heroes swaps them, as before). Right-click again or **Esc** cancels. Right-clicking one of your heroes selects it and starts moving it in one go. Dragging with any button still pans the map.
- **Nothing picked by default:** a match starts with no hero picked, and placing a hero no longer picks the next one by itself. Pick one with its card at the bottom or its number key (Esc un-picks it).
- **Relic rerolls for gold again:** free rerolls from the Relics talents are used first; after that a reroll costs a quarter of what the relic cost, one quarter more for each gold reroll of the same choice (a 48 gold relic: 12, 24, 36...). The button always shows in the picker with its price, and your gold is shown next to it (`w.rerollCost`, `REROLL_GOLD` in world.js).
- **Corruption only from shadow damage:** that was already the rule in combat; the leaks were relics. Blasphemy now gives corruption chance only to shadow heroes, and it and Dark pact are only offered with the Warlock (they were offered to the Paladin, who deals no shadow damage).
- **Choosing heroes:** the screen's title is just "Pick your 3 heroes" (the long explanation is gone).
- Engine version 26 (the reroll rule and the relic pool changed). Game version 0.45.0.

## Each caster has its own shot (Nov 17)
- The four casters no longer fire the same orb in different colours. New Pixel Lab art in the heroes' style (flat colour areas, a few sharp accents, made large and drawn small), each animated: the **Mage** fires a violet crystal shard with trailing sparkles (`proj_shard`), the **Priest** a golden diamond of light with a halo ring and a beam tail (`proj_lightbolt`), the **Warlock** a ragged shadow flame with a tiny skull at its head (`proj_skullflame`), the **Druid** a whirling leaf with little leaves trailing (`proj_leaf`). The Ranger's arrow and the Shaman's chain lightning are unchanged.
- Matching hits: the shard shatters into crystals, the light bursts into a golden star of rays, the flame puffs into shadow smoke with tendrils, the leaf scatters into leaves (`fx_impact_*`, replaced). Every impact now fades out over its last 40%.
- FX entries can carry `k` (a shot's size) and `m` (a size multiplier for impacts). The orbs stay as a fallback while the new sheets load. Only the drawing changed. Game version 0.44.0.

## No hard border around the field (Nov 17)
- The map's grass no longer stops at a straight line: it fades into the darker forest floor over about two and a half tiles past the map's edge, along a wobbly line, broken up block by block (4 px blocks, kept or dropped at random by how far along the fade they are), so it reads as grass thinning out rather than a rectangle (`grassFade` in render.js).
- The outline of the buildable area (dark shadow and light line) is drawn only while a hero is being placed or moved, together with the grid. Hovering outside the map still shows the red cross. Game version 0.43.0.

## Forest that thickens away from the map (Nov 17)
- The scenery around the map now follows the distance from it (`placeForest` in render.js): thick forest far out (up to two trees a tile), thinning toward the map, where bushes, rocks, flowers and mushrooms take over and the first rows are open. Trees vary a little in size.
- A handful of small things now sit on the field itself (flowers, mushrooms, the odd stone or little bush, about one tile in twenty, never on or beside the road), so the map doesn't look cut out of the land. They are only pictures: heroes can still stand on those tiles, and they are drawn under the units. Seeded, so each map always looks the same. Game version 0.42.0.

## Grid only while placing (Nov 17)
- The map's tile grid is drawn only while a hero is being placed (a hero card picked) or moved; the rest of the time the ground is clean. A little stronger when it shows. Game version 0.41.1.

## New, calmer tileset with more variety (Nov 17)
- The grass-and-road tileset is remade in Pixel Lab with a fixed calm palette (the muted greens and browns from the retune, plus a few accent colours): flatter grass with fewer tufts, smooth packed dirt with a few pebbles, the same soil bank along the road.
- More variety: six all-grass variants (white and yellow wildflowers, grey stones, a darker clover patch, plain grass, red and purple flowers, fallen leaves and a twig) and three road variants (a damp patch, faint cart ruts, a flat stone with sprouts), inpainted into the plain tiles with their edges kept so they join everything. On the map they are picked freely (plain tiles most of the time); in the forest they repeat every 4 tiles, as the board view needs.
- `calm()` is gentler now, since the new tiles are already muted. The previous tiles are kept in art/pixellab/terrain/v1. Only the drawing changed. Game version 0.41.0.

## Calmer ground (Nov 17)
- The grass and road are toned down so the units stand out on them: less saturation, and most of the contrast of the grass tufts and the road's speckles and streaks taken out (`calm()` in art/pixellab/build_terrain.py, before the meadow/forest colouring). The dark bank soil along the road is left as it was. Only the drawing changed. Game version 0.40.1.

## Enemies and scenery redrawn closer to the heroes' look (Nov 17)
- The style rule from now on: like the heroes, art is dense but drawn small, with most areas flat (one or two shades) and the detail carried by a few sharp marks, so the eye fills in the rest. No all-over rendered texture or soft gradients.
- New enemy art in that style, with new 8-frame walks: a **female goblin** (dagger, buckler, tied-back hair), a **female orc** (axe, round shield, long braid), a leaner **troll** (spiked club, plank shield) and a less cluttered **orc warlord** (cleaver, skull tower shield, horned helm, red cape). Made with the Paladin as the style reference and a 28-colour cap. ENEMY_ANIM foot points and heights updated.
- New scenery in the same style (oak, pine, bush, rock, wildflowers, mushrooms): big flat clumps with sparse sharp highlights instead of fine leaf texture.
- The first versions are kept in art/pixellab/drafts/v1 and art/pixellab/terrain/v1. Only the drawing changed. Game version 0.40.0.

## New terrain in the Pixel Lab style (Nov 16)
- The ground is redrawn in the heroes' style, keeping the old layout: green grass on the map, a dirt road sunk a little below it, and a dark forest floor around it with trees, bushes, rocks, flowers and mushrooms.
- The grass and road are a Pixel Lab Wang tileset (64 px tiles, the grass raised over the road by a low bank of soil and roots, drawn into the tiles). Tiles are placed on a grid shifted by half a tile: each tile's corners are the centres of four cells, grass unless the cell is road, so the road runs through the middle of its cells with smooth, rounded bends. The all-grass and all-road tiles have extra variants (inpainted middles, edges kept) so the ground repeats less.
- The forest floor is the same set, darkened and cooled; the map's grass is drawn over it, clipped to the map, so the road crosses from forest to map without a seam. The grass is warmed a little toward the old olive green.
- New scenery: an oak, a pine, a bush, a mossy rock, wildflowers and red mushrooms (deco2_*), taller trees than before.
- Built by `python3 art/pixellab/build_terrain.py` from art/pixellab/terrain/ into assets/terrain.png + terrain.json (`terrain()` in sprites.js, `paintTerrain` in render.js). The old tile sheet (art/tiles.py) is still the fallback if the new one can't load. Only the drawing changed. Game version 0.39.0.

## Enemies in the new style: goblins, orcs, trolls (Nov 16)
- Every enemy has new Pixel Lab art in the heroes' style, with an 8-frame walk: the runner is a **goblin** (dagger and buckler), the grunt an **orc** (axe and round shield), the brute a **troll** (spiked club and plank shield) and the boss an **orc warlord** (cleaver, skull tower shield, horned helm, red cape).
- They face the way they walk: the art faces left and is mirrored while an enemy walks right. The walk steps with the distance walked, so fast goblins patter and the boss stomps.
- Sizes (`ENEMY_ANIM` in js/game/sprites.js, drawn with `drawEnemyArt`): goblin 1.05 tiles tall, orc 1.4, troll 1.65, warlord 1.85 (heroes are 1.6). Health bars, ground shadows, impact heights and the Gospel Priest's converted spirit follow the new art. The old 64 px sprites stay as a fallback while the sheets load.
- Sources in art/pixellab/ (anim_goblin_walk, anim_orc_walk, anim_troll_walk, anim_warlord_walk; the base designs are in drafts/). Only the drawing changed. Game version 0.38.0.

## Melee slash back to the old arc (Nov 16)
- The sword/hammer/dagger swing is the old crescent again: thrown out from the hero toward the target, lying on the ground, with the thin arc in the hero's colour. Its art is new, made with Pixel Lab's VFX tool (`fx_slash2`, 13 frames: a clean steel-white crescent with a few sparks trailing it), sized so it stops at the swing's reach. The old `fx_slash` stays as a fallback. Only the drawing changed. Game version 0.37.1.

## Attack effects in the new style (Nov 16)
- **New effect art** made with Pixel Lab's effect workbench (saved in `art/pixellab/`, copied to `assets/` by `art/build.py`): animated orbs for the Mage (arcane violet), Priest (holy gold), Warlock (shadow purple) and Druid (nature green), a new arrow for the Hunter, a sword swing crescent for melee heroes, and impacts: an arcane, holy, shadow and nature burst, a physical hit star, a lightning crackle and a critical-hit burst.
- **Where they play:** each bolt plays its impact on the enemy's body when it lands; melee swings show the new crescent (a little longer than the hit itself, so it reads); critical hits burst with hot streaks; kills flash a hit star; the Shaman's chain lightning is drawn as a flickering jagged bolt with a crackle on every enemy it strikes. Sheets, frame sizes and anchors are in `FX` (`js/game/render.js`).
- Evolved forms' projectiles (fire, ice, sparks, toxic, flasks, daggers...) and zone effects keep their old art for now. Only the drawing changed. Game version 0.37.0.

## Shots leave the staff, bow or hand (Nov 16)
- **Bolts, arrows and seeds now leave the hero where its attack art holds them** (the Hunter's bow, the tip of the Mage's, Druid's and Priest's staff, the Warlock's reaching hand), and arrive at the middle of the enemy's body, no longer flying from the hero's feet to the enemy's feet. Each animated hero has a `muzzle` point in `HERO_ANIM` (`js/game/sprites.js`), measured on its first attack frame and mirrored with the art; heroes without the new art shoot from their chest.
- **The Shaman's chain lightning** starts at the head of his totem staff and jumps between the enemies' bodies.
- Only the drawing changed (`shotFrom`, `projView` in `js/game/render.js`): the engine still flies shots between the same ground points, so hits and timing are unchanged. Game version 0.36.1.

## Paladin and Shaman attacks remade (Nov 16)
- **Paladin:** a new 4-frame attack made from her standing pose: she winds the hammer back, swings it over her head and smashes it down to her left (a few sparks fly on impact), then steadies it. The hammer stays rigid, its handle at 90 degrees to the head, in every frame.
- **Shaman:** a new 4-frame cast made from his standing pose (facing left): he levels the whole totem staff toward the target with both hands in front of his body, the bird head flashing blue, and holds it. Game version 0.36.0.

## Paladin and Shaman attack fixes, take two (Nov 16)
- **Paladin:** her smash pose is redrawn so the hammer is built right: the handle meets the hammer head at 90 degrees, with the head standing on its striking face.
- **Shaman:** his cast pose is redrawn so the arm holding the staff comes from his near shoulder in front of his body (it used to pass behind his head), with the open hand reaching forward. The cast holds that pose. Game version 0.35.3.

## Paladin and Shaman attack fixes (Nov 16)
- **Paladin:** the hammer no longer bends while she smashes. The in-between frames that stretched its handle are replaced by her smash pose, so the hammer keeps its shape (raised, then smashed down and held).
- **Shaman:** his free hand no longer slips behind his body at the end of his cast; the frame that did it is gone and the cast ends on the frame where both hands are clear. Game version 0.35.2.

## The Shaman looks left (Nov 15)
- The Shaman's art is mirrored so he looks to the left like the other heroes (same design; his staff is now in the other hand), and his cast was redrawn from the mirrored pose. Game version 0.35.1.

## The Shaman in the new style: every hero done (Nov 15)
- **The Shaman is now a storm shaman in the 128 px style** (made with Pixel Lab, see Art): a black topknot with beaded braids, blue lightning-stripe markings, a grey wolf-pelt mantle, a leather and teal kilt, fur-trimmed boots and a carved totem staff topped with a winged bird head holding a blue storm stone. On the map he plays a 4-frame idle loop and, on every chain lightning, a 4-frame cast (totem staff thrust toward the target with the other hand raised as the lightning leaves, then lowered, 0.4 s), facing his target. His portrait shows in the menus.
- The `chain` behavior now tells the screen when it fires (`g.fx.shot`, like the `bolt` behavior), so the Shaman's attack animation plays with every chain. The rules are unchanged.
- **All nine base heroes now use the 128 px style.** Evolved forms keep their old sprites for now. Game version 0.35.0.

## The Paladin in the new style (Nov 15)
- **The Paladin is now a short-haired paladin in the 128 px style** (made with Pixel Lab, see Art): polished silver plate with gold trim, a white tabard with a gold sun, a royal-blue half-cape, armoured high-heeled boots and a heavy war hammer. On the map she plays a 4-frame idle loop and, on every swing, a quick 4-frame overhead smash toward her target (hammer raised above her head, brought down to the ground in front of her, then lifted, 0.33 s). Her portrait shows in the menus; her evolved forms keep their old sprites for now. Game version 0.34.0.

## The Warlock in the new style (Nov 15)
- **The Warlock is now a hooded warlock in the 128 px style** (made with Pixel Lab, see Art): pale skin, long black hair, a horned hood, a charcoal coat with crimson lining and silver trim, a spiked shoulder mantle, a chained grimoire at his hip and a twisted black staff with a crescent holding a violet crystal. On the map he plays a 4-frame idle loop and, on every shot, a 4-frame cast (crescent staff raised and the clawed hand reaching toward the target as the shadow bolt leaves, then lowered, 0.4 s), facing his target. His portrait shows in the menus; his evolved forms keep their old sprites for now. Game version 0.33.0.

## The Priest in the new style (Nov 15)
- **The Priest is now a petite blonde priestess in the 128 px style** (made with Pixel Lab, see Art): a white and cream dress with gold trim, a short capelet, long gloves, white high heels that bring her to almost the others' height (a few pixels shorter), and a gold staff topped with a sun disc. She is drawn at the same pixel scale as the other heroes, so she stays a little shorter in the game too. On the map she plays a 4-frame idle loop and, on every shot, a 4-frame cast (staff raised toward the target with the other hand open as the holy bolt leaves, 0.4 s), facing her target. Her portrait shows in the menus; her evolved forms keep their old sprites for now. Game version 0.32.0.

## The Druid in the new style (Nov 15)
- **The Druid is now a forest druid in the 128 px style** (made with Pixel Lab, see Art): auburn hair with braids, a headband with small branch antlers, a mantle of leaves over a moss-green tunic, and a gnarled staff wrapped around an amber stone. On the map he plays a 4-frame idle loop and, on every shot, a 4-frame cast (staff raised toward the target and the other hand thrown forward as the seed leaves, then lowered, 0.4 s), facing his target. His portrait shows in the menus; his evolved forms keep their old sprites for now. Game version 0.31.0.

## The Rogue in the new style (Nov 15)
- **The Rogue is now a pale assassin with long black hair and blunt bangs in the 128 px style** (made with Pixel Lab, see Art): dark leather, a teal sash and a curved dagger in each hand. On the map she plays a 4-frame idle loop and, on every strike, a quick 4-frame slash toward her target (slash, blade raised, slash again, 0.33 s); her two strikes 0.15 s apart restart it, so they read as two quick slashes. Her portrait shows in the menus; her evolved forms keep their old sprites for now. Game version 0.30.0.

## The Mage in the new style (Nov 15)
- **The Mage is now a silver-haired battle mage in the 128 px style** (made with Pixel Lab, see Art): a long navy and violet coat with gold trim and a tall staff topped with a cyan crystal. On the map he plays a 4-frame idle loop and, on every cast, a 4-frame attack (staff thrust toward the target as the bolt leaves, then brought back, 0.4 s), facing his target. His portrait shows in the menus. His evolved forms (Fire, Cold and Lightning Mage) keep their old sprites for now. Game version 0.29.0.

## The Hunter in the new style (Nov 15)
- **The Hunter is now a red-haired archer in the 128 px style** (made with Pixel Lab, see Art): leather armor, a green cloak and a longbow. On the map she plays a 4-frame idle loop and, on every shot, a 4-frame bow attack (held at full draw as the arrow leaves, then lowered, 0.4 s), facing her target. Her portrait shows in the menus. Her evolved forms keep their old sprites for now.
- Ranged heroes now tell the screen when they shoot (`g.fx.shot` in the `bolt` behavior, like `fx.slash` for melee swings), so their attack animation plays with every shot. The rules are unchanged. Game version 0.28.0.

## Zoom keeps the camera angle (Nov 15)
- Zooming used to slide the whole picture around the pointer, which moved the horizon and changed the angle the board was seen from depending on where you zoomed. Now the picture is pinned to the screen (at the middle of the map's near edge, where Fit puts it) and zooming moves the camera over the board instead, so the same spot stays under the pointer and the view always has the same angle. Resizing the window keeps your zoom and place. Game version 0.27.0.

## Camera and quality of life (Nov 15)
- **The camera travels over the board:** dragging the map (or the arrow keys) moves the camera across and into the board at the same height, as a real camera would: going forward brings the far side closer and bigger. It used to slide the picture up and down. Fit returns to the start. (`cam.ox`, `cam.oy` in `js/game/camera.js`, limited so the board stays in view.)
- **The land goes on:** more land is painted around the map (12 tiles to the sides, 16 behind, 8 in front), and past it the forest carries on to the horizon, so the world never ends on screen. The board is drawn for the camera's view and redrawn only when the camera moves.
- **Hovering a hero** lights it up with a gold glow around its figure (as in WoW); while you carry a hero, the one it would swap with glows blue.
- **After a move** a hero rests for a second before attacking again; it now pulses, see-through, until it is ready.
- **Moving a hero onto another of your heroes swaps the two** (both rest for a second). While you carry it, the hero under the pointer glows blue and is shown faded where it would go. In co-op you cannot swap with an ally's hero.
- Engine version 25 (moving onto your own hero now swaps), game version 0.26.0.

## True perspective (Nov 15)
- **The board is seen through a perspective camera:** its far side is smaller and narrower than its near side, and grid lines run toward the far side like on a real table (`project()` in `js/game/camera.js`: a pinhole camera, so straight lines stay straight; `FAR` sets how much smaller the far side is). The painted board is warped into that view once per map; every hero, enemy, ring and effect is drawn with the perspective of the point it stands on (`at()` in `js/game/sprites.js`), and clicks are mapped back through the same camera, so they still land on the right tile.
- **Standing scenery:** the trees, bushes, rocks and flowers around the board stand upright with shadows instead of being painted flat into the ground; no tall tree stands right in front of the board.
- **The Warrior's feet are no longer cut off:** the animation frames from Pixel Lab had lost the bottom rows of the figure; they are restored from the original art (`art/pixellab/`).
- The camera starts a bit closer (`FIT_CLOSER` 1.12). The soil edge under the board's near side is gone. Game version 0.25.0.

## More depth on the board (Nov 14)
- Every hero and enemy casts a soft shadow; units further back are drawn a little smaller (perspective); the back of the board fades into a cool haze; the road lies lower than the grass, with a bank of dark soil along its far edge (worked out from the painted road); the camera is tilted a bit more (`TILT` 0.62). Heroes and enemies stand with their feet on their spot. Game version 0.24.0.

## 2.5D board, bigger tiles (Nov 13)
- **Maps are 12 × 8 tiles** (were 16 × 10); each level has a new preset path from `npm run maps` (10 turns on the first levels down to 4 on the last, every level's map different). The tiles are the same size in the game's world, so ranges, speeds and stats are unchanged, but the map is smaller, so the camera shows every tile, hero and enemy bigger. Paths are shorter (about 25–34 tiles, were 34–45), so enemies reach the gate sooner: the levels are harder until they are rebalanced.
- **Tilted 2.5D view** with upright characters, drawn front to back (see Controls). The camera starts a little closer than an exact fit. The Warrior is drawn 1.6 tiles tall.
- Engine version 24 (the maps changed: replays and saved runs from before do not carry over), game version 0.23.0.

## New art style (Nov 13)
- **The Warrior in the 128 px style** (made with Pixel Lab, see Art): a knight in steel and gold with a red cape. On the map he plays a 4-frame idle loop and a quick 4-frame overhead chop (sword raised above his head, then brought down in front of him, 0.33 s) every time he attacks, faces his target and stands a little taller than the old sprites. His portrait shows on the Heroes page and when choosing heroes for a level. His evolved forms and the other heroes keep their old sprites for now. Game version 0.22.0.

## Polish (Nov 13)
- **Relic offers follow the heroes on the map** (with none placed yet: the lineup). A form takes priority: an evolved hero, or one with a path, counts only as its form; a basic hero with no path as itself and every form it could become. So with only a Warrior placed you never see spell relics, even with a Mage in the lineup (`relicFits` in `js/engine/commands.js`).
- **Relic picker:** no Reroll button without rerolls, no gold line, a big icon above each name, cards in their rarity's colour.
- **Hero panel** reworked (see Heroes): tally under the name, energy under XP, no ultimate text, stats one line each with icons and their bonuses on hover, items as icons with their stats on hover; item bonuses add up as one "Items" line, like talents.
- **Choosing heroes for a level** looks like the Heroes page (picture, gear, path) in compact cards that fit the screen; "Gear & path" on a card opens that hero's page, and Back returns to the choice with your picks kept. The level cards no longer repeat the zone's name.
- **Hero page gear (0.21.0):** the gear slots are compact lines; click one to choose from the items that fit, hover for stats. The whole page fits the window without scrolling.
- Wording: "+x% damage (all heroes)" is now "+x% damage"; item bonuses show their rank as "(rank x)".
- New icons for kills and ultimates (`python3 art/icons.py`). Engine version 23 (the relic pool changed), game version 0.20.0.

## Changes from the design notes (Nov 12)
- **Crusader:** rides along the path to the **last enemy in range** (the one furthest from the gate), trampling everyone on the way, then back to his post; either way along the path, at most 6 tiles (`CHARGE`).
- **Earthcaller nerfed:** Fissure's mini stun 0.15 s (was 0.25), and it casts slower (cooldown 1.15 s, was the Shaman's 0.9).
- **Knockbacks 50% stronger:** Crusader trample 0.75 tiles (was 0.5), Cavalry and the Infernal meteor 1.5 (was 1), Tectonic shift 2.25 (was 1.5), the Sentinel path's push 0.12-0.3 (was 0.08-0.2); an enemy can be pushed back up to 3 tiles a wave (was 2), a boss 35% of a push (was 25%) (`KNOCKBACK` in `js/engine/enemies.js`).
- **Zones, preset maps and item levels** (see Levels and zones, and Items). Run **supabase-update.sql**: the database now allows 25 levels and keeps each item's level.
- The balance tools still cover Green Meadow (the tuned zone) only. Engine version 22, game version 0.19.0.

## Gold in a match (Nov 11, evening)
- A match starts with **150 gold** (Wealth talents add to it), **placing a hero costs 150**, and **every evolution costs 500** (Gate talents still make it cheaper). So you place one hero at the start and buy the others as gold comes in. `START_GOLD`, `HERO_COST` and `EVOLVE_COST` in `data.js`.
- The bot buys its heroes the same way: the first at the start, the next ones as soon as it has the gold, before relics and evolutions.
- Tests place heroes for free so they can set up a board in one go (`PAY_FOR_HEROES.on = false` in `tests/setup.mjs`); the tests about paying turn it back on.
- **Levels retuned for it:** paying for heroes and evolutions left the weakest teams clearing levels 1 and 2 almost never (0–3%) and levels 3–5 about 40%. Enemy health is now 3.4 / 4 / 4.95 / 5.65 / 6.2 (was 5.2 / 5.2 / 5.35 / 6.1 / 6.55), so the weakest tenth of teams clears each level about 55–60% of the time again.
- Engine version 21 (old saved runs cannot be resumed), game version 0.18.0.

## Changes from the design notes (Nov 11)
- **Relic offers fit the match:** a relic is offered only if it does something for one of the heroes brought into the match, as they can play in it: the basic hero, and its chosen path's form (with no path chosen, any of its forms). A Berserker-path Warrior never sees spell, projectile or minion relics; with no path, the Commander's thrown sword still makes projectile relics count. Economy and gate relics (gold, interest, lives, relic luck) help every team and are always in the pool. `relicFits` in `js/engine/commands.js`.
- **Bulk order removed** (the relic that made evolutions cheaper). The Gate talents still lower evolution costs.
- **Totemist path:** a Shaman on the Totemist path keeps one totem at a time and now cycles Flame, Frost, Storm as each expires (it used to plant Flame every time). The Totemist himself also takes the missing kinds in turn after the last one he planted.
- Already in the game: an ultimate that buffs its caster is not cast again until that buff runs out.
- **Easier as a result:** every relic a team buys now helps, so the weakest tenth of teams clears a level about 50–65% of the time instead of about 40%. Kept on purpose; the level health stays as tuned in the balance pass below.
- Engine version 20 (the relic pool changed), game version 0.17.0.

## Balance pass (Nov 11)
- **Weak forms buffed** toward the middle of the pack, by damage output split evenly between damage per hit and attack (or cast) speed (`FORM_TUNING` in `data.js`; 1.44 = 20% more damage and 20% faster): Ranger, Hunter and Crusader 1.6 (the cap), Sentinel 1.5, Boomerang 1.4, Toxicologist 1.35; the supports Witch Doctor 1.25, Inquisitor 1.2, Gospel 1.1, Commander and Archangel 1.05; the Occult's Hex makes enemies take 25% more damage (was 20%). No form was made weaker. Found by playing every team many times with the balance tools.
- **Levels retuned** to the progression curve (see Levels): levels 1 and 2 were cleared by every team, and levels 4 and 5 were much harder at their stage than level 3. Enemy health is now 5.2 / 5.2 / 5.35 / 6.1 / 6.55 (was 1 / 1.2 / 1.5 / 2 / 2.5), growing 14% / 11.8% / 10.5% / 10.3% / 10.5% a wave (was 14% to 18%). Level 1 is now a real fight for a new account.
- **Engine version 19**: replays saved before this pass do not play back the same.
- **Bug fixed**: the Earthcaller's crack could reach past the end of the path when the leading enemy was at the gate, and the game crashed.

## Hero taxonomy, evolution paths and previews
Design: the "Hero taxonomy and evolution paths" section of the design doc.
- **Axes (tags).** Every hero is sorted by **delivery** (melee, projectile, trap, aura, area), **damage type** (physical, arcane, fire, cold, lightning, toxic, holy, shadow) and **source** (attack, spell, minion; totems are minions), plus its attribute. A hero is classified by its main attack, never its ultimate. A form adds tags and never loses its base hero's delivery or source, but a new damage type replaces the old one's tag (a Fire Mage is not arcane). The bolt casters (Mage, Priest, Warlock, Shaman, Druid) are projectile heroes, so projectile bonuses help them; the Commander is melee + projectile. The Mage's damage type, once called "spell", is now **arcane**; "spell" is only a source.
- **Gear that does not fit.** An item bonus whose tags the wearer lacks (as it will play, its path's tags included) counts as its general version at 80% (`FALLBACK` in items.js): damage for one kind of hero becomes damage, a speed becomes the speed the hero uses, minion crits become crits, Wide swing and Split bolt a little range. Without a path the hero's base tags decide, so plan with a path to specialise.
- **Evolution paths.** On a hero's Evolutions tab the player can choose its path (or none); it is saved on the account (`profiles.paths`, `save_paths`) and free to change between matches. A hero with a path evolves only into that form (the Evolve picker shows just that one; the `evolve` command refuses another). A hero without one chooses in the match, as before. Paths travel in the match setup, the command log and co-op (the lobby shows them).
- **Previews** (`js/content/previews.js`, `js/engine/preview.js`): a hero with a path shows a piece of its form from level 1, growing until level 9, and carries the form's tags from the start. It never changes the ultimate. Four shared patterns: *every Nth attack* is the form's own attack (an "echo" of the hero runs the form's behavior at 75% of the form's damage; the base attack slows by N/(N-1) so the hero is not simply stronger, and the echo's attack still fills the energy bar); *conversion* of part of the damage to the form's element with its ailment chance; a weaker permanent *companion* (pup, one imp, one totem) or a smaller *aura*, paid for with 20% of the hero's own damage; and small *effects* (the Sentinel's push, the Inquisitor's Verdict stacks, the Gospel's energy, the Crusader's horse). The echo's hits are credited to the hero; it never has energy of its own. On the map a path shows as a ring in the form's colour under the hero, brighter as it grows; echoes draw like the form (a smaller wolf, a ghost rider, the aura ring).
- **Balance (bot, level-10 player, solo, level 2):** a path makes most heroes a little steadier before level 10, most of all the casters with a companion or aura (Druid, Priest, Warlock); attack heroes barely change. Lineups of three still win levels 1 and 2 every time. Tune a preview in previews.js; `npm run balance -- --paths on --form animalic,...` plays with paths.

## The newer heroes
Each has a kit in `js/engine/kits/` and evolves at level 10 for 500 gold, like the others. Every form gives +25% to all the base hero's stats.
- **Priest** (spell, intellect, Holy): *Smite*, bolts of light. Ultimate *Blessing*: heroes within her range (her too) deal +30% damage for 5 s.
  - **Incantation:** no attack. A holy **aura** (radius = her range) pulses on every enemy inside, and heroes inside get *Hymn* (+15% attack and cast speed). Ultimate *Crescendo*: for 5 s the aura is twice as wide and deals triple damage.
  - **Archangel:** a lance of light that pierces every enemy in a line. *Wings:* she can be **moved onto a path tile** (enemies walk under her). Ultimate *Judgement*: a giant blade falls on the toughest enemy in range for 8x; a non-boss left under 25% life dies.
  - **Gospel:** each Psalm gives +3 energy to every hero within 100 px. *Sanctuary:* once a wave, the first enemy (not a boss) to reach the gate is turned back to the entrance. Ultimate *Conversion*: the toughest non-boss in range leaves the fight (it counts as defeated) and its spirit walks back down the path for 6 s, striking every enemy it meets.
- **Warlock** (spell, intellect, Shadow): shadow bolts with a 50% chance to **Corrupt**. Ultimate *Soul drain*: drains the toughest enemy in range for 5x over 2 s; if it dies, heroes within 150 px gain 20 energy.
  - **Occult:** no attack and **no damage**. A shadow aura **Hexes** every enemy inside (+20% damage taken from everything, 15% slower). Ultimate *Doom*: for 4 s Hexed enemies take +50% more, and any that die explode for 10% of their life as shadow damage to the enemies around them.
  - **Summoner:** each cast summons an **imp** (up to 3, 10 s each) that hovers by the enemies and throws small bolts; imps use the minion stats. Ultimate *Demon gate*: a Greater Demon fights for 8 s, cleaving everything around it. Summons are spectral blue so they never look like the (red and purple) enemy demons.
  - **Infernalist:** *Hellfire*, a fireball lobbed where the target will be: it bursts and leaves burning ground for 2 s. It aims at enemies that are not in its burning ground yet, so the ground spreads instead of piling up. Always burns, and a burn **jumps** to the nearest enemy when the burning one dies. Ultimate *Infernal*: a meteor crashes into the biggest group (6x a hit) and knocks every enemy it hits back a tile.
- **Paladin** (melee, strength): a heavy hammer, 30% of its damage **converted** to Holy. Ultimate *Consecration*: the ground around him burns holy for 5 s.
  - **Heretic:** a burning shadow flail (half fire, always burns), 3% stronger for every life lost this run (**blood price**). Ultimate *Heresy*: every hero on the map deals +50% damage for 8 s, or **+100%** if he can pay 1 life for it. Ultimates fire by themselves, so the price is capped: at most 3 lives a match per Heretic, and never at 5 lives or fewer. In co-op the lives are everyone's.
  - **Inquisitor:** a long chain flail at the toughest enemy in range; each hit adds a stack of **Verdict** (+5% damage taken from everything, up to 10, for 5 s). Ultimate *Purge*: every enemy in range loses 30 points of armor and of every resistance alike for 6 s; a non-boss under 15% life dies.
  - **Crusader:** **mounted**. His attack is a charge: he rides from his post onto the nearest stretch of path within his range, gallops 3 tiles down it toward the oncoming enemies, trampling each one he passes once and **knocking it back** half a tile, then rides back. Ultimate *Cavalry*: three phantom riders gallop the whole path from the gate to the entrance, hitting every enemy once (2x) and pushing it back a tile.
- **Shaman** (spell, strength, Lightning): chain lightning that jumps to 2 more enemies (10% shock). Ultimate *Ancestral call*: heroes within his range attack and cast 25% faster for 6 s.
  - **Witch Doctor:** fast poison darts (always poison) at the enemy furthest along that is not linked yet (if every enemy in range is linked, the first); each **Voodoo-links** its target with up to 2 enemies near it for 4 s: 30% of the damage any of them takes goes to the others. Ultimate *Plague of locusts*: a swarm flies the whole path, from the gate back to the entrance, poisoning everything it passes.
  - **Totemist:** each cast plants a missing **totem** on a free grass tile near him (next to the path first; up to 3, one of each kind, 12 s each; a standing totem is never replaced): Flame (fire bolts that burn), Frost (slows and chills everything near it) and Storm (lightning at 3 enemies). Totems take up their tile (no hero can be placed there while one stands) and fight with his minion stats. Ultimate *Totem surge*: every totem stands its full time again and pulses 3 times, 0.35 s apart, for 4x a hit around itself.
  - **Earthcaller:** *Fissure*, the path cracks for 2 tiles behind the leading enemy in range, hitting everyone on that stretch and **stunning** them for 0.25 s. Ultimate *Tectonic shift*: every enemy on the map takes 2x and is pushed back 1.5 tiles.
- **Shared mechanics:** auras (`aura.js`: pulses are hits, with flat added damage at 50% per pulse; energy only from pulses that touch an enemy), curses (`EFFECTS` in `effects.js`: Hex, Doom, Verdict, Purged, Voodoo link, Stunned; one of each kind, bosses take half the extra damage), **knockback** (`knockback` in `enemies.js`: never past the entrance, bosses a quarter, at most 2 tiles per enemy per wave), **execute** (`combat.js`), effects that act when their enemy is hurt or dies (`EFFECT_HOOKS`), and things that can stop a leak (`LEAK_GUARDS`). Ground zones that pulse (Consecration, burning ground, the golem) and lobbed projectiles are in `kits/common.js`.
- **Relics** for them: **Holy water** (+4.5% damage to holy heroes per Common, offered with a Priest or Paladin), **Dark pact** (+4.5% to shadow heroes) and **Blasphemy** (+3% corruption chance), offered with a Warlock or Paladin. The minion relics now come with a Druid, Warlock or Shaman. All three can roll on gear.
- **Balance (bot, level-10 player, 4 runs per row, solo):** on level 1 most new forms win like the old heroes; on level 2 the Warlock forms and the Shaman's Earthcaller and Totemist hold up best. The Priest is weak alone (a support hero: her worth is in what she adds to others), and the Crusader and Inquisitor lose to bosses alone but win every run in a lineup of three. Tune with `npm run balance -- --strategies priest,priest3,warlock,paladin,shaman --form incantation,occult,heretic,witchdoctor`.

## Damage types, defenses and ailments
Used by the heroes' evolutions and by enemy defenses:
- **Critical hits:** every hero has `critChance` (0 for most, 10% for the Rogue) and `critDamage` (1.5: a crit deals 150%). A hit is rolled once for a crit, only when there is a chance (so heroes without crits use no random rolls); a Rogue's Mark adds to both against the marked enemy. Critical hits flash gold on the enemy. Relics (and item bonuses): **Keen edge** (+3% crit chance per Common), **Cruelty** (+7.5% crit damage).
- **Minion stats** (the Animalic Druid's wolf): the wolf fights with the Druid's stats, then its own counterparts on top (`MINION` in `data.js`, `minionStats` in `stats.js`): `minionDamage` multiplies its damage (and added damage of every type), `minionSpeed` its attack speed, and `minionCritChance` / `minionCritDamage` add to the Druid's crits. Relics (and item bonuses), offered only when a Druid is in the match: **Pack leader** (+4.5% minion damage per Common), **Feral haste** (+3% minion attack speed), **Hunting instinct** (+3% minion crit chance), **Savage bite** (+7.5% minion crit damage). The hero panel shows the minion stats for heroes with a minion.
- **Cast speed:** spell casters (the Mage and its forms, `rate: 'castSpeed'`) attack at their cast speed instead of attack speed, so attack-speed bonuses (Quick hands, the Speed talents, Frenzy) do not help them; **Quick incantation** (+3% cast speed per Common, spell heroes) does. The hero panel shows "Casts per second" for them.
- **Penetration** (hits only, not damage over time): `armorPen` ignores that share of the enemy's armor; `firePen`, `coldPen` and `lightningPen` take that many points off the enemy's resistance, after the 99% cap (like shock). They come from the Sunder, Fire, Cold and Lightning talent clusters.
- **Damage types:** physical, arcane (the Mage's; once called spell), fire, cold, lightning, toxic, **holy** and **shadow**. Holy causes no ailment but ignores half of the enemy's resistance (`HOLY_RES_IGNORED`); shadow's ailment is **Corruption**, damage over time that stacks like poison (up to 10) and grows with every stack (10 stacks: each one does twice as much). Each hero deals its own type (`damageType`: Warrior and Hunter physical, Mage arcane, and its evolutions fire, cold or lightning) and can gain added damage of any type (`fireDamage`, `arcaneDamage`, ...). Arcane damage causes no ailment. **Damage is between a min and a max:** every hit rolls within ±25% of the damage stat (`DAMAGE_SPREAD`, stat `spread`; the tests turn the roll off with `DAMAGE_ROLL`, see tests/setup.mjs).
- **Defenses:** enemies have `armor` (a share of physical hits blocked; it does not stop damage over time) and a resistance for every other damage type, and they work and grow the same way: one value per type of enemy (`def`) per point of **threat**, for armor and every resistance alike. Both cap at 99% (negative means extra damage). Threat is 0 on wave 1, +1 per wave, and each level after the first adds 25% to that growth (`threat` in `js/engine/enemies.js`). Brutes and Bosses have more, Runners less. Shock and Purge take points off armor and resistances alike. Enemies move 35% slower than the first versions (`ENEMY_SPEED`). **"The toughest enemy"** (the Rogue's forms, the Inquisitor, Judgement, Soul drain...) is the toughest kind in range first, boss > brute > grunt > runner even at 1 life (`TOUGHNESS`), then the one with the most life.
- **Bosses:** the last wave of every level ends with a boss, and from level 3 on the middle wave has one too (`isBossWave`). It replaces the wave's last enemy, has 12× a Grunt's life, moves slowly, costs 10 lives if it gets through, and pays 20× gold and 25 XP. **The final boss must die:** if the last wave's boss gets through, the level is lost, whatever lives are left. Every boss defeated guarantees an item at the end of the match. The HUD shows "Boss" on boss waves ("Boss next" before one), and bosses wear a crown.
- **Ailments** (`js/content/combat.js`), each with a chance stat on heroes (`bleedChance`, ...):
  bleed (physical hits; damage over time, strongest counts), poison (physical or toxic hits; toxic damage over time, stacks up to 20), burn (fire hits; damage over time, strongest counts), shock (lightning hits; for 2 s the enemy's armor is halved and every resistance drops by 20 points, so with no resistance it takes 20% extra non-physical damage), freeze (cold hits; enemy stops, longer for bigger hits, up to 1.5 s), root (any hit; the enemy is held in place for 1 s; the Druid has 15% to start, and talents, relics or items with `rootChance` add more).
- Every attack goes through `attack()` in `js/engine/combat.js` and damage over time through `dotDamage()`; ailment rolls use the match's seeded random numbers, so replays stay exact. The damage meter credits damage over time to the hero that caused it.
- To try it, give a relic, talent node or item a modifier such as `{ stat: 'burnChance', type: 'flat', value: 0.25, scope: ['all'] }` together with `fireDamage`.

## Relic luck and interest
- **Relic luck** (`relicLuck`, from the Four-leaf clover relic) makes rarer relics more likely: each rarity's weight is multiplied by 1 + luck once per step above Common. The relic picker and the Relic button's tooltip show the current odds.
- With Compound interest, the gold box shows what the next wave clear pays in interest and how much gold earns the full amount.

## Art
Pixel art, drawn by scripts in `art/`. Run `python3 art/build.py` (needs Python 3 with Pillow and NumPy, and fontTools for the font) to redraw everything and copy what the game uses into `assets/`; each script also writes a preview image to `art/out/`.
- **In the game:** `js/game/sprites.js` loads the sprites in the background and lists every file the game uses (a test checks they are all in `assets/`). Until a sprite has loaded, or if it is missing, the game draws its old plain shapes, so it never waits for art. Everything is drawn with smoothing off, so pixels stay sharp at any zoom.
- **The board** is painted once per map into an offscreen canvas at 64 pixels a tile (grass on the map, forest floor with trees, bushes, rocks and flowers in a margin of 8 tiles around it, and the road autotiled from its neighbours), then scaled to the map (`T` = 40 pixels a tile) and squashed by the tilt. A faint grid stays on the map for placing heroes.
- **On the map:** heroes show their sprite (the evolved form after evolving), with a soft gold glow when the ultimate is ready; enemies show theirs with the health bar and an icon per ailment above it (bleed, burn, poison, slow, freeze, shock; slow and freeze have their own icons). Zones lie on the ground and are drawn under heroes and enemies. Projectiles turn toward where they fly; melee swings use the slash frames; critical hits and kills flash a hit spark; the Alchemist's oil explodes with the explosion frames; zones (poison pool, oil, barricade, trap) use their sprites, the barricade a little see-through. The Lightning Mage's storm is a faint dark area ringed by small thunderclouds at their own size (a big storm never stretches the art), and each strike is a bolt of lightning coming down from the sky (`fx_strike`). The Assassin's clone is clearly visible.
- **In the menus:** hero cards, the hero page and the evolution tree show the heroes' sprites; the HUD hero buttons show a small one and the ability icons (`art/abilities.py`: one per basic attack, `ability_atk_*`, and per ultimate, `ability_ult_<id>`; `ATTACK_ICON` in `js/game/sprites.js` says which hero uses which); item icons show the item's picture for its type and rarity, framed in the rarity colour (the initials while it loads).
- **Sizes:** tiles, items and heroes are 64x64 images; small things are 32x32 or 16x16. Everything is drawn at half resolution (32x32 art pixels in a 64x64 tile) and scaled up 2x with hard edges, so every asset has the same chunky pixel size. Draw new art the same way so the pixel sizes never mix.
- **Style:** one fixed palette (`PALETTE` in `art/tiles.py`), light from the top left, solid clusters of pixels with no anti-aliasing, a 1-pixel dark outline on sprites and none on ground tiles.
- **Terrain** (`python3 art/tiles.py`): grass, dirt and forest floor are each a seamless 4x4-tile texture (16 tiles; pick one by the cell's position, x % 4 and y % 4). The path has 47 autotile variants (`pathmask_<sides>`, plus `pathedge_<sides>` drawn on top), named by the path neighbours in N, E, S, W, NE, SE, SW, NW order, with a diagonal counting only when both sides next to it are path. `tiles.json` maps names to sheet positions. Decorations: two trees (64x64), and a bush, a rock, flowers and mushrooms (32x32).
- **Menus and HUD** (the pixel UI): everything is generated, nothing is downloaded.
  - `python3 art/font.py`: **TBD Pixel**, the game's own pixel font (`assets/tbd-pixel.woff`, built with fontTools from glyphs drawn on a 7+2-row grid). Titles, buttons, labels and numbers use it; body text stays in the system font. It is crisp at multiples of 9 px (18 px for buttons and numbers, 27 px for titles).
  - `python3 art/ui.py`: the **UI kit**: `ui_panel`, `ui_panel_light`, `ui_tooltip` (stone frames with gold rivets), `ui_button` and its hover, pressed, gold (`go`), red (`bad`), purple (`relic`) and on/off versions, `ui_tab`/`ui_tab_on`, and sunken `ui_slot`, `ui_input`, `ui_bar`. The page uses them as 9-slice border images (the "Pixel UI kit" block at the end of the styles in `index.html`): panels and tooltips slice at 10 px, buttons and tabs at 8, slots, inputs and bars at 6.
  - `python3 art/scenes.py`: the **logo** (`ui_logo`), the **dusk valley** behind every menu screen (`ui_scene`: brighter behind the login and main menu, darker behind the others) and a **picture per level** (`level_1` to `level_5`: Green Meadow, Deep Forest, Mire, Red Canyon, Ashlands; the names are `name` in `STAGES`).
  - `python3 art/icons.py`: small **icons** (`icon_*`): gold, XP, lives, wave and level in the HUD and the menu; the three attributes (on the hero panel's attribute chips and the hero page); the stats on the hero page; one per main-menu button; and one per **talent cluster** (`icon_talent_<cluster>`, drawn on each cluster's notable in the talent tree).
  - A test (`tests/ui-art.test.mjs`) checks that every asset the page names exists, and every level picture and cluster icon.
- **Relic icons** (`python3 art/relics.py`): one 32x32 icon per relic, coloured by kind (red damage, gold gold, blue energy and speed, brown minions, green attributes...), named `relic_<name>` (see `relicIcon()` in sprites.js). Add a glyph there for every new relic; a test checks they all exist.
- **The newer heroes' art** (`python3 art/kits.py`): their ability icons, the holy, shadow, Hellfire and dart projectiles, the Judgement blade, the imp, Greater Demon, lava golem, warhorse and the three totems (`minion_*`, two frames where they move), and the icons for Corruption and the curses (`ail_corruption`, `hex`, `doom`, `verdict`, `purge`, `link`, `stun`). Their hero sprites come from `heroes.py` like everyone's (new parts: priest's cowl, halo, winged helm and wings, horned hood, Inquisitor's hat, crusader's helm, feathered and bone masks; holy staff, spear of light, tome, eye staff, hammer, flails, lance, maul, carved totem staff).
- **Heroes** (`python3 art/heroes.py`): a 64x64 sprite for every hero and evolution (`hero_<id>.png`). They share one hand-drawn figure (one character per art pixel) and are put together from parts: colours (cloak, torso as leather, plate or robe, the accent in the hero's colour, the eye glow), a head (hood, helm, horned or plumed helm, great helm, mage hood, pelt hood, goggles, antlered hood), a weapon (bow, sword, axe, staff, daggers, boomerang, flask, nature staff, moon staff, totem), a back item (quiver) and a left-hand item (shield, dagger). The outline and ground shadow are added automatically. Heroes are tall and heroic, in dark, muted clothing so they stand out on the grass. To add a hero, add an entry to `HEROES`.
- **Enemies** (`python3 art/enemies.py`): `enemy_<id>.png`, 64x64 each, all armoured demons in one style: skin in the enemy's colour, black spiked armour with ember accents, horns, burning eyes under angry brows. The figure's size follows the enemy's size in the game: the Runner (a winged imp) is smallest, then the Grunt (a footsoldier with a cleaver), the Brute (a hulking demon with two spiked maces) and the Boss (a demon lord with great horns, wings, a cape and a cleaver).
- **Projectiles and effects** (`python3 art/effects.py`): projectiles point right and are rotated by the game to where they fly (`proj_*`: arrows with red, gold or green fletching, arcane bolt, fireball, ice shard, lightning spark, toxic dagger, fire and toxic flasks, boomerang at 32x32; the Commander's sword and the Marksman's piercing shot at 64x64). Animated effects are horizontal strips of frames (`fx_hit` 4 x 32x32, `fx_slash` 3 x 64x64 pointing right, `fx_explosion` 5 x 64x64). Ailment icons over enemies are 16x16 (`ail_bleed`, `burn`, `poison`, `chill`, `shock`). Zones are one 64x64 tile (`zone_poison`, `oil`, `storm`, `barrier`; `zone_trap` is 32x32). Solid objects get the dark outline; light and magic don't, and use see-through shades. The Druid adds a thorny seed (`proj_seed`), the wolf (`minion_wolf`, drawn facing where it runs), bramble patches (`zone_thorns`) and their spikes (`fx_spikes`), the falling moon (`fx_moon`) and its impact (`fx_moonburst`), and a root icon (`ail_root`).
- **Animation:** heroes, enemies and the wolf have a second frame (`hero_<id>_2`, `enemy_<id>_2`, `minion_wolf_2`, made by the same scripts): heroes breathe (head, cloak and weapon one art pixel lower), on their own beat; enemies bob as they walk, stepping every 9 px along the path (so faster ones step faster and rooted or frozen ones stand still); the wolf's legs alternate as it runs. The animation follows the game clock, so it pauses with the game.
- **Items** (`python3 art/items.py`): `item_<type>_<rarity>.png`, 64x64, for all 25 item types in `js/content/items.js` and rarity 0 (Common) to 3 (Epic). Melee items are heavy plate with crimson cloth, projectile items leather with green cloth, spell items blue silk with gold trim, minion items fur and bone. Each type is drawn once; the rarity picks the materials: worn iron and leather (Common), steel with bronze trim and a green gem (Uncommon), polished steel with gold trim and a blue gem (Rare), dark steel with gold trim, a purple gem and a glow (Epic). A new item type needs one more drawing in `ITEMS`.

## Extending the game
Everything in combat flows through `hit()` in `js/engine/world.js`, which emits `damage` and `kill` events. Pieces react to events instead of calling each other.
- **New relic:** add an entry to `RELICS` in `data.js`: a list of modifiers like `{ stat: 'damage', type: 'inc', value: 0.3, scope: ['cold'] }`. `inc` values add together, `more` values multiply, `flat` values add to the base. Scope is a list of hero tags, `['all']`, or `'global'` for economy stats.
- **New hero with its own mechanics:** add it to `HEROES` in `data.js`, write its kit in `js/engine/kits/<hero>.js` (register behaviors with `registerBehavior`, ultimates with `registerUltimate`, zones into `ZONES`, projectiles into `PROJECTILES`) and import it in `kits/index.js`; its look goes in `js/game/kit-art.js`, its art in `art/kits.py` and `art/heroes.py`. Then run `npm run sql`.
- **New hero using an existing behavior:** add an entry to `HEROES` with its tags, base stats, ultimate and evolutions, and a tree with `addTree` in `talents.js`. Then run `npm run sql`.
- **New item:** add it to `ITEMS` in `js/content/items.js`, then run `npm run sql` and run the update SQL. It starts dropping right away.
- **New ultimate:** `registerUltimate('id', { name, desc, damageMult, onFire(world, hero) })` in `js/engine/ultimates.js`, then set `ultimate: 'id'` on a hero.
- **New evolution step:** add another entry to a hero's `evolutions` list.
- **New hero behavior:** add `registerBehavior('kind', { update(g, hero, dt) {} })` in `js/engine/behaviors.js`.
- **New status effect:** add it to `EFFECTS` in `js/engine/effects.js`, then list it in a hero's `applies` field.
- **New projectile:** add it to `PROJECTILES` in `js/engine/projectiles.js` (and its look to `PROJ_DRAW` in `js/game/render.js`: a sprite from `art/effects.py`, added to `SPRITES` in `js/game/sprites.js`, with a shape as fallback) and spawn it from a behavior.
- **New hero or evolution art:** add an entry to `HEROES` in `art/heroes.py` with the same id, run `python3 art/build.py`; the game picks it up by id.
- **Animated hero (the new 128 px style):** made with Pixel Lab. Put `portrait_<id>.png` (the still image for the menus) and the sheets `anim_<id>_idle.png` and `anim_<id>_attack.png` (square frames side by side, the figure facing left) in `art/pixellab/` (`art/build.py` copies them into `assets/`), then add the hero to `HERO_ANIM` (every base hero is there) in `js/game/sprites.js`: frame size, where the feet are on a frame, the figure's height, frames and speed of each animation, and which way the attack swings. The hero then plays its idle loop on the map, plays its attack on every swing, faces its target, and shows its portrait in the menus. Evolved forms keep their old sprites for now.
- **New enemy:** add it to `ENEMIES` in `js/engine/enemies.js` (with its armor and resistance per point of threat) and return it from `waveEnemyType`.
- **New talent:** change a cluster in `K` in `talents.js`, or where it goes in `RING` (keep inner and outer alternating so the tree stays symmetrical), then run `npm run sql` and run `supabase-update.sql` in Supabase (a test fails until the SQL files are rebuilt).

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
- **Minimum time:** a run must take at least as long as the enemies need to spawn at 3x speed (the Overdrive talent; 75% of it for tolerance), and at least 15 seconds. Clearing level 1 takes at least about 49 seconds, level 5 about 2.5 minutes.
- **Rate limit:** at most 30 saved runs per hour per player.
- **Talents:** the server has a copy of the talent tree and rejects unknown nodes and nodes that do not connect to its start. It also keeps each node's reward bonuses (`reward_gold`, `reward_xp`, `reward_loot`), so `finish_run` applies the Rewards talents itself: more gold and XP, and item find (every full 100% drop chance is an item, the rest a chance of one more). After changing `js/content/talents.js`, run `npm run sql`, then run `supabase-update.sql` in the SQL Editor.
- **Usernames:** 3-16 letters, numbers or underscores. Reserved names (admin, moderator...), a starter list of offensive words and look-alikes of existing names (0/o, 1/l/i) are rejected, even if someone skips the sign-up form. Add rows to `blocked_names` to block more.
- **Boss items:** `finish_run` takes the number of bosses defeated and rejects more than the boss waves the run reached (the same rule as `bossWavesUpTo` in `enemies.js`), and a win without the final boss.
- **Items and lineups:** only the server creates items (in `finish_run`, which also rolls their rarity, bonuses from the `item_bonuses` table and each bonus's rank) and only `sell_item` removes them; players can read their own items but not change them. `save_loadout` only accepts known heroes, at most 3 different ones, and items the player owns, each in the slot its type goes in and worn once. Each run records the lineup and equipment it started with.
- **Co-op:** lobbies, their members and passwords live in private tables, reached only through the lobby functions (`create_lobby`, `list_lobbies`, `join_lobby`, `lobby_ping`, `set_lobby_stage`, `leave_lobby`, `start_lobby`). Passwords are stored salted and hashed and never sent back. Lobbies hold 4 players; members who stop pinging for 45 seconds are dropped. A co-op run can only be started for a lobby the player is in, whose host started it within the last 10 minutes, on the lobby's level; it records how many played, and goes to that mode's leaderboard.
- **Permissions:** players can only call the functions the game needs, and cannot read or write the private tables directly.

What it cannot stop: someone who writes a script that plays slowly and sends believable numbers. They would still gain XP at roughly real-time speed, up to the hourly limit. Stopping that means re-playing each run on the server, which is a bigger project.

### Optional: CAPTCHA on login and sign-up (Cloudflare Turnstile)
1. In Cloudflare, create a Turnstile widget for your site's domain (for GitHub Pages, `yourname.github.io`). Copy the site key and the secret key.
2. In Supabase: Authentication > Bot and Abuse Protection > turn on CAPTCHA protection, choose Cloudflare Turnstile and paste the **secret** key.
3. Add the **site** key to `js/config.js`: `export const CAPTCHA_SITE_KEY = 'your-site-key';`
Do steps 2 and 3 together: with CAPTCHA on in Supabase but no site key in the game, nobody can log in.

## Known limits
- **The real email is not verified**, because sign-up uses the internal address. Someone could register with an email that isn't theirs, and password reset by email does not work yet. Real email login, verification and recovery are the next step if you want them.
- If sign-up says the email is invalid, Supabase rejected the internal domain. Change `AUTH_DOMAIN` in `config.js` to a domain you own.
- **Co-op trusts the players' games:** the host's game decides the order of everyone's commands, and the server checks each player's run like a solo one. A cheating host could only spoil their own match.
- **No host migration yet:** if the host leaves, the co-op match ends.
- **Cheating is limited, not impossible.** See "Security" below: runs are checked by the server for plausibility, but the game itself runs in the browser.
