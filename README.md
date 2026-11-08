# Test TBD

HTML/JS tower defense with accounts, a main menu, co-op for up to 4 players and leaderboards. No build step.

## Structure
```
index.html                 page shell: one <section> per screen
js/main.js                 boot: registers screens, picks the first one
js/config.js               your Supabase URL and key (and optional CAPTCHA site key)
js/core/                   bus.js (events), screens.js, tooltip.js, state.js, rules.js
js/services/api.js         the only file that talks to Supabase
js/screens/                login, menu, levels (level, then heroes), lobby (co-op), heroes, inventory, talents, leaderboard, settings, play;
                           loadout.js holds what they share (items, equipment, saving the lineup)

js/content/                WHAT the game contains (plain data, no logic)
  rules.js                 the rules the server also uses (XP, rewards, waves, spawn timing, bosses, drops, co-op): ONE place
  data.js                  heroes (and archived ones for later), energy defaults, relics, rarities, levels
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
  stats.js, behaviors.js, enemies.js, projectiles.js, effects.js, meter.js
js/game/                   the browser shell around the engine
  game.js                  input -> commands, the loop, background play
  render.js                canvas drawing: the painted board, sprites, effects (shapes while the art loads)
  sprites.js               loads the pixel art from assets/; the list of every sprite the game uses
  ui.js                    HUD, damage meter, hero panel, relic picker
  saved-run.js             keeps the run on this browser, so a refresh does not lose it
js/net/                    co-op
  lockstep.js              keeps every player's game in step (host and guests)
  channel.js               a lobby's live channel (Supabase Realtime: messages and who is here)
  session.js               the lobby this browser is in, shared by the Lobby and Play screens

assets/                    the pixel art the game loads (built by python3 art/build.py; do not edit by hand)
art/                       the scripts that draw the art (Python + Pillow); art/out/ also has preview images
tests/                     run with: npm test
tools/bot.mjs              a bot that plays through the same commands as a player
tools/balance-report.mjs   run with: npm run balance
tools/build-sql.mjs        builds the two SQL files from sql/ and js/content: npm run sql
tools/rules-sql.mjs        writes the database's rule_* functions from js/content/rules.js (used by build-sql)
sql/                       the database, in parts (tables, functions, permissions); edit these, not the built files
.github/workflows/test.yml runs the tests on GitHub on every push
supabase-setup.sql         database setup for a new project (built by npm run sql)
supabase-update.sql        updates an existing project (built by npm run sql; safe to run again)
supabase-cleanup-old-prototypes.sql  optional: deletes tables from the earlier prototypes
```

## How the engine works
- **Engine vs. shell.** `js/engine` holds every game rule and never touches the page, the clock or `Math.random`. `js/game` turns clicks into commands, runs the loop and draws. The same engine runs in the browser, in the tests and in the bot, and could run on a server.
- **Commands.** The only way to change a game is `apply(world, { type, ..., p })`: place, move, evolve, wave, leave (co-op), auto, playOnPick, buyRelic, reroll, banish, choose. A command is checked, applied and recorded with the tick it happened on; a refused command changes nothing. To add a player action, add an entry to `COMMANDS` in `commands.js`.
- **Seeded randomness.** Each run gets a seed. Separate random streams for the map and for relics mean, for example, that rerolling relics never changes the map.
- **Command logs.** A seed plus the list of commands replays a run exactly: `replay(log)` gives the same final state, and `verify(log)` checks the result a log claims. The Play screen receives the log when a run ends (`onRunEnd`), ready for a future step where the server re-plays runs to stop cheating.
- **Engine version.** `ENGINE_VERSION` in `world.js` must go up whenever a rule change would make old logs play out differently; `replay` refuses logs from another version. (Now 15.)
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
- **How it stays in step:** every game runs the same deterministic engine, and only commands travel (Supabase Realtime, on the lobby's channel). The host's game is the clock: it applies everyone's commands and sends them, with the tick each happened on, to the others, who never run ahead of the host. To keep Realtime traffic low (Supabase limits messages per second for the whole project), it sends 2.5 times a second while someone is acting and once a second when nobody is. The other players' games play smoothly about one turn behind the host (around 0.5 s while people are acting, up to about 1.2 s when it is quiet), so a guest's own clicks show up after that delay. The numbers are `TURN_MS` and `IDLE_MS` in `js/net/lockstep.js`. Every few seconds a fingerprint of the world goes along, so a guest notices if it ever falls out of step. A lost message is asked for again. Realtime is on by default in Supabase; nothing to set up.

## Tests and the balance bot
- `npm test` runs everything (needs Node 22). Tests cover the random numbers, stat math, talents, every command, each hero's behavior, enemies and waves, winning and losing, replays, the browser shell on a fake page, and checks that the SQL files still match the game rules (wave counts, rewards, timings, talent trees). GitHub runs them on every push.
- `npm run balance` plays every level with four bot strategies and prints win rates. Options: `--runs 8 --stages 1,2,3 --strategies trio,ranger --level 10 --form lightningmage,hunter` (`--level` is the player level, so talents are included; `--form` picks each hero's evolution, for example `berserker,lightningmage,hunter`). The bot is not clever, so treat results as a yardstick for comparing changes, not as how hard a level feels to a person.

## Levels
Five levels: 15 waves, then 5 more each (20, 25, 30, 35). A level unlocks when the previous one is cleared. Levels differ in enemy health and how fast it grows (`STAGES` in `data.js`, easy to tune). The leaderboard shows levels cleared, then the furthest wave on the level a player is working on, with a tab for solo and one for each co-op size.

## Game screen and controls
The map fills the window and the HUD floats on top: level, wave and lives in the top middle; your relics down the left; Menu top right, with the selected hero's details under it; the damage meter bottom right (click its title to fold it); gold, the hero cards, Relic, Start wave (its right-hand AUTO part toggles Auto-start) and speed at the bottom. Hover any hero card or button for a tooltip.

- **Hero cards are indicators.** Each shows the hero's portrait, name and level, and its two abilities as icons, like an action bar: the basic attack darkens and clears clockwise as its cooldown runs (with the seconds left on longer cooldowns), and the ultimate clears as the energy bar fills and glows gold when it is ready. Cards stay after a hero is fully evolved and show the evolved form's icons. The icons are dim until the hero is on the map. Hover a card for the hero's description, its tags (the ones relics, talents and items refer to, like Melee, Projectile, Spell, Physical, Fire), its damage type and the ailments its hits can inflict, and its ultimate; hover an icon for that ability. The map no longer shows a level badge or energy bar on heroes.
- **Keep playing while choosing:** a box in the relic picker. Off by default, the match waits while you choose; on, it carries on behind the picker (which turns see-through) while other actions still wait for your choice. The setting is remembered on this browser for later matches (it is a command in the run log, so replays play the same way).

| Action | Mouse / touch | Keys |
|---|---|---|
| Choose a hero to place, or select a placed one | click its card | 1-3 |
| Place it / select a hero | click a tile | |
| Move a hero | click and hold it on the map, then let go on a free tile | M, then click a tile |
| Evolve a hero | the ▲ Evolve button above its card (it shows the cost), then a form in the picker | E (selected hero) |
| Move the map | drag (any mouse button), or drag with one finger | arrows or WASD |
| Zoom | mouse wheel, pinch, or the + / − buttons | + / − |
| Fit the map to the screen | Fit button | F |
| Buy a relic | Relic | Space (or R) |
| Pick a relic in the relic picker | click it | 1 / 2 / 3 |
| Start the wave | Start wave (AUTO is red while Auto-start is off, green when on) | Enter |
| Pause | Menu (asks before quitting; in co-op it only asks, the match goes on) | P (Esc resumes; not in co-op) |
| Game speed | speed button: 1x, 2x, and 3x with the Overdrive talent | |

- The camera fits the map into the space the HUD leaves free whenever a run starts or the window changes size (until you move or zoom it yourself; Fit returns to that view).
- Every run, including Retry after a win or a loss, starts with Auto-start off and unpaused.

## Background play
- The game runs on a fixed time step, so it plays the same at any frame rate. When the tab is hidden or the window is minimized, a timer keeps it running, and it catches up on any time the browser paused (up to 30 minutes).
- Heroes cannot be controlled while the tab is hidden, so turn on Auto-start before switching away. A paused game stays paused in the background.

## Heroes, energy, evolution and items
- **Five classes:** Warrior (melee swing), Ranger (fast arrows that fly to their target), Mage (a magic bolt that flies to its target, dealing spell damage), Rogue (two quick strikes, with a knack for critical hits) and Druid (thorny bolts that can root enemies in place). In a match, the hero cards follow your lineup order (key 1 first). The Thief, Frost Mage (with its slow), Fire Mage and Lightning Mage are kept in `HERO_ARCHIVE`, with their behaviors and relics, for the advanced variants later.
- **Lineup:** after clicking a level (Play), players choose up to 3 different heroes to bring, then press Start. "Next level" after a win goes to the same choice. In a match each hero is placed once, for free; gold goes to evolutions and relics.
- **Heroes screen:** one card per hero; click one to open its page. **Information**: the five gear slots on the left (an empty slot shows the free items that fit, best first: click one to equip it; Remove takes it off), the hero's picture in the middle (a placeholder until there is art), stats on the right (attributes, damage with where the bonuses come from, range, speed, energy, ultimate). **Evolutions**: the evolution tree, from the base hero to each form with its attack and ultimate.
- **Inventory screen** (main menu, under Heroes): every item you own as an icon on a grid, framed in the rarity colour. Worn items come first. Hover one for its rarity, slot, archetype, bonuses, who wears it and its price; click one to sell it.
- **Attributes:** strength, dexterity and intellect. Every hero has all three and one of its own (Warrior strength, Ranger and Rogue dexterity, Mage intellect; evolved forms keep it). For now each point of a hero's own attribute is +1% increased damage (`ATTRIBUTE_DAMAGE`); the other two do nothing yet. Heroes start with 10 in their own attribute, and each hero level adds 3 (`HERO_LEVELS.perLevel`, stat `mainAttribute`), so a level 10 hero has 37: +37% damage. Talents, relics and items can raise any attribute like any other stat.
- **Energy and ultimates:** every hero has an energy bar (blue under the hero; gold and glowing when full). It fills by `energyPerAttack` per attack and `energyPerSecond` during waves; the defaults are in `ENERGY` in `data.js` (20 per attack, 0 per second), and both are ordinary stats that talents, relics and items can change. When the bar is full, the next attack is the ultimate: for now, double damage.
- **Hero levels:** during a match, every hero on the field gains XP from each kill (Grunt and Runner 1, Brute 3), whoever landed it. Level 2 takes 10 XP and each level after takes 2 more, so level 10 (162 XP) comes around the middle of level 1. Each level adds +3% damage. The rules are `HERO_LEVELS` in `data.js` (set `perLevel` to `[]` for no bonus). Levels show as a badge on the hero, on its card and in the hero panel.
- **Hero cards** (bottom bar) are small: the name with the level next to it, and "Free · place it" until the hero is on the map. A hero with no evolution left has no card any more (select it on the map).
- **Hero panel** (select a hero on the map): the name and level, XP right under it, then strength, dexterity and intellect (the hero's own attribute in its colour: strength red, dexterity green, intellect blue; hover one for where it comes from), then energy as x/max, the ultimate, and the stats with every bonus.
- **Evolution:** once a hero reaches the evolution's level (10 for now), an **▲ Evolve · 150** button pops up above its card, dimmed until you have the gold. Clicking it (or E with the hero selected) opens the evolution picker: like the relic picker, it pauses the game and shows the three forms side by side; Cancel or Esc closes it. Every evolution gives +50% damage, range and attack speed. Every hero chooses one of three forms:
  - **Berserker** (Warrior): swings twice in quick succession (0.15 s apart, counting as one attack for energy), and every hit makes the enemy bleed. Ultimate *Frenzy*: +50% damage and attack speed for 5 seconds.
  - **Commander** (Warrior): throws the sword in a straight line out to its range (base 110), hitting every enemy in the way once. Ultimate *Rally*: for 5 seconds, every hero within 220 px (the Commander too) gets double energy per attack (shown as a soft blue flash and ring).
  - **Sentinel** (Warrior): the normal swing. Ultimate *Barricade*: puts a wall on the path just ahead of the enemy it attacked; for 1 second, enemies pile up against it (a zone of type `barrier`).
  - **Marksman** (Ranger): same arrows. Ultimate *Piercing shot*: charges for a moment, then an arrow flies straight through every enemy in line for 3x a hit; it replaces the normal arrow (an ultimate with `replaces: true`).
  - **Boomerang Ranger:** throws the old Thief's boomerang (it flies faster with attack speed). Ultimate *Spinning blade*: a boomerang circles the Ranger for 6 seconds, hitting everything it touches for 3x a hit (`ORBIT_SCALE`); several at once are spaced evenly around the circle.
  - **Hunter** (Ranger): arrows deal toxic damage. Ultimate *Toxic traps*: lays 3 traps on path tiles in range: under the enemies in range first, then toward the entrance (`groundSpots` in `ultimates.js`); an enemy stepping on one makes it burst for 4x a hit of toxic damage to everything close by (at most 6 traps at once, see `TRAP` in `ultimates.js`).
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
- **Gear:** five slots per hero: helm, body armour, legs, boots and a trinket (`SLOTS` in `js/content/items.js`). Item types: Helm, Body Armour, Leggings, Boots, and the Power Charm (a trinket with +5 damage of its own).
- **Item rarity and bonuses:** items have the relic rarities (Common 55%, Uncommon 28%, Rare 13%, Epic 4%). A Common item has at least 1 bonus, an Uncommon 2, a Rare 3, an Epic 4; each further bonus has a 30% chance, up to 4 (`ROLL`). An item never has the same bonus twice.
- **Bonuses are hero relics only:** damage, range, speed, crits, energy and the minion relics (`ITEM_BONUSES`: relics whose modifiers all work on heroes). Gold, XP, lives and relic luck (Prospector, Tax collector, Compound interest, Bulk order, Four-leaf clover, Reinforced gate) no longer roll on gear; old items that have one show it greyed out as "no longer works on gear", and it does nothing. Bonuses help only the hero wearing the item, and only if it has the tags (Whetstone needs a melee hero).
- **Bonus ranks:** each bonus has its own rank, 1 to 4, rolled separately; a rank 3 Whetstone gives what a Rare Whetstone relic gives. The item's rarity does not decide the ranks but makes higher ones likelier (`ROLL.rankWeights`, in %, ranks 1/2/3/4): Common 70/22/7/1, Uncommon 45/35/15/5, Rare 25/35/28/12, Epic 10/25/35/30. So a Common item can roll a rank 4 bonus and an Epic one a rank 1. Tooltips and the hero page show each bonus in its rank's colour (white, green, blue, purple) with its rank. The server rolls the ranks in `finish_run` and stores them in `player_items.bonus_ranks`; items from before ranks count each bonus at the item's rarity. Items from before rarities are Common with no bonuses, and an old single item becomes the hero's trinket.
- **Item types:** every slot has a plain item (Helm, Body Armour, Leggings, Boots, Power Charm) and one per archetype: **melee** (Great Helm, Plate Armour, Plate Greaves, Sabatons, Bloodstone Ring), **projectile** (Leather Hood, Leather Jerkin, Leather Trousers, Ranger Boots, Feather Charm), **spell** (Circlet, Silk Robe, Silk Wraps, Silk Slippers, Arcane Amulet) and **minion** (Beast Mask, Hide Armour, Fur Leggings, Fur Boots, Fang Necklace). On an archetype item each bonus has a 60% chance (`ROLL.affinityChance`) to come from that archetype's bonuses (`AFFINITY`: melee Whetstone, Wide swing, Quick hands, Cruelty; projectile Fine arrows, Long barrels, Quick hands, Keen edge; spell Arcane focus, Split bolt, Quick incantation, Battle focus; minion Pack leader, Feral haste, Hunting instinct, Savage bite), else from all of them; bonuses never repeat. Tooltips name the archetype. The server keeps each type's archetype (`item_types.affinity`) and each bonus's archetypes (`item_bonuses.tags`), generated from `js/content/items.js`.
- **Selling items** (Inventory): click an item, then Sell, then again to confirm; it is gone and its price goes to your account gold. Worn items have to be taken off first. The price is a base by rarity (5, 15, 40, 100) plus 5 gold per bonus rank (`SELL`, `sellPrice`); the server's `sell_item` works out the same price itself (`item_price`) and checks the item is yours and not worn. Tooltips show the price.
- **Talents:** you get 1 talent point per level above 1, spent in **one tree** shared by every hero. It is **symmetrical**: 20 clusters in 20 directions, inner and outer ones alternating. **The top half is combat, the bottom half quality of life.** Respec is free.
  - **The circle:** around the origin is a circle of path nodes only: an anchor in each inner direction (reached from the origin by a path) and a junction in each outer direction. Inner clusters hang from their anchor; outer clusters have a path down to their junction. Every path node gives **+1 to all attributes** (so +1% damage for any hero, through its own attribute).
  - **Clusters** are diamonds pointing away from the origin, connected only at their beginning node, with **two kinds of stats**: the beginning and the end (the notable) have both; the left side has only the first kind, the right side only the second. Inner clusters have 6 nodes, outer ones 8.
  - **Combat (top), west to east:** Martial (melee damage | swing arc), Sunder (armor penetration | physical damage), Marksmanship (projectile damage | range), Elements and toxins (elemental and toxic hero damage | poison chance), Might (damage | attack speed), Fire (added fire damage | fire penetration), Precision (crit chance | crit damage), Cold, Sorcery (spell damage | cast speed), and Lightning on the east end. The Fire, Cold and Lightning notables add the ailment's chance.
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
- **Rerolls and banishes** are free, but you only get them from the Relics talents (a number per match, shown on the buttons).

## Damage types, defenses and ailments
Used by the heroes' evolutions and by enemy defenses:
- **Critical hits:** every hero has `critChance` (0 for most, 10% for the Rogue) and `critDamage` (1.5: a crit deals 150%). A hit is rolled once for a crit, only when there is a chance (so heroes without crits use no random rolls); a Rogue's Mark adds to both against the marked enemy. Critical hits flash gold on the enemy. Relics (and item bonuses): **Keen edge** (+3% crit chance per Common), **Cruelty** (+7.5% crit damage).
- **Minion stats** (the Animalic Druid's wolf): the wolf fights with the Druid's stats, then its own counterparts on top (`MINION` in `data.js`, `minionStats` in `stats.js`): `minionDamage` multiplies its damage (and added damage of every type), `minionSpeed` its attack speed, and `minionCritChance` / `minionCritDamage` add to the Druid's crits. Relics (and item bonuses), offered only when a Druid is in the match: **Pack leader** (+4.5% minion damage per Common), **Feral haste** (+3% minion attack speed), **Hunting instinct** (+3% minion crit chance), **Savage bite** (+7.5% minion crit damage). The hero panel shows the minion stats for heroes with a minion.
- **Cast speed:** spell casters (the Mage and its forms, `rate: 'castSpeed'`) attack at their cast speed instead of attack speed, so attack-speed bonuses (Quick hands, the Speed talents, Frenzy) do not help them; **Quick incantation** (+3% cast speed per Common, spell heroes) does. The hero panel shows "Casts per second" for them.
- **Penetration** (hits only, not damage over time): `armorPen` ignores that share of the enemy's armor; `firePen`, `coldPen` and `lightningPen` take that many points off the enemy's resistance, after the 99% cap (like shock). They come from the Sunder, Fire, Cold and Lightning talent clusters.
- **Damage types:** physical, spell, fire, cold, lightning and toxic. Each hero deals its own type (`damageType`: Warrior and Ranger physical, Mage spell, and its evolutions fire, cold or lightning) and can gain added damage of any type (`fireDamage`, `spellDamage`, ...). Spell damage causes no ailment.
- **Defenses:** enemies have `armor` (blocks part of physical hits, more of small hits) and a resistance for every other damage type (negative means extra damage). Both cap at 99%. They start at 0 on wave 1 and grow with **threat**: +1 per wave, and each level after the first adds 25% to that growth (`threat` in `js/engine/enemies.js`). Each type has its own profile per point of threat: Grunts a little of both, Brutes heavy armor, Runners high resistances, Bosses both. At the end of level 1 a Brute has about 21 armor; at the end of level 5 about 100 (roughly a third off a 30-damage hit).
- **Bosses:** the last wave of every level ends with a boss, and from level 3 on the middle wave has one too (`isBossWave`). It replaces the wave's last enemy, has 12× a Grunt's life, moves slowly, costs 10 lives if it gets through, and pays 20× gold and 25 XP. **The final boss must die:** if the last wave's boss gets through, the level is lost, whatever lives are left. Every boss defeated guarantees an item at the end of the match. The HUD shows "Boss" on boss waves ("Boss next" before one), and bosses wear a crown.
- **Ailments** (`js/content/combat.js`), each with a chance stat on heroes (`bleedChance`, ...):
  bleed (physical hits; damage over time, strongest counts), poison (physical or toxic hits; toxic damage over time, stacks up to 20), burn (fire hits; damage over time, strongest counts), shock (lightning hits; for 2 s the enemy's armor is halved and every resistance drops by 20 points, so with no resistance it takes 20% extra non-physical damage), freeze (cold hits; enemy stops, longer for bigger hits, up to 1.5 s), root (any hit; the enemy is held in place for 1 s; the Druid has 15% to start, and talents, relics or items with `rootChance` add more).
- Every attack goes through `attack()` in `js/engine/combat.js` and damage over time through `dotDamage()`; ailment rolls use the match's seeded random numbers, so replays stay exact. The damage meter credits damage over time to the hero that caused it.
- To try it, give a relic, talent node or item a modifier such as `{ stat: 'burnChance', type: 'flat', value: 0.25, scope: ['all'] }` together with `fireDamage`.

## Relic luck and interest
- **Relic luck** (`relicLuck`, from the Four-leaf clover relic) makes rarer relics more likely: each rarity's weight is multiplied by 1 + luck once per step above Common. The relic picker and the Relic button's tooltip show the current odds.
- With Compound interest, the gold box shows what the next wave clear pays in interest and how much gold earns the full amount.

## Art
Pixel art, drawn by scripts in `art/`. Run `python3 art/build.py` (needs Python 3 with Pillow and NumPy) to redraw everything and copy what the game uses into `assets/`; each script also writes a preview image to `art/out/`.
- **In the game:** `js/game/sprites.js` loads the sprites in the background and lists every file the game uses (a test checks they are all in `assets/`). Until a sprite has loaded, or if it is missing, the game draws its old plain shapes, so it never waits for art. Everything is drawn with smoothing off, so pixels stay sharp at any zoom.
- **The board** is painted once per map into an offscreen canvas at 64 pixels a tile (grass on the map, forest floor with trees, bushes, rocks and flowers in a margin of 8 tiles around it, and the road autotiled from its neighbours), then scaled to the map (`T` = 40 pixels a tile). A faint grid stays on the map for placing heroes.
- **On the map:** heroes show their sprite (the evolved form after evolving), with a soft gold glow when the ultimate is ready; enemies show theirs with the health bar and an icon per ailment above it (bleed, burn, poison, slow, freeze, shock; slow and freeze have their own icons). Zones lie on the ground and are drawn under heroes and enemies. Projectiles turn toward where they fly; melee swings use the slash frames; critical hits and kills flash a hit spark; the Alchemist's oil explodes with the explosion frames; zones (poison pool, oil, barricade, trap) use their sprites, the barricade a little see-through. The Lightning Mage's storm is a faint dark area ringed by small thunderclouds at their own size (a big storm never stretches the art), and each strike is a bolt of lightning coming down from the sky (`fx_strike`). The Assassin's clone is clearly visible.
- **In the menus:** hero cards, the hero page and the evolution tree show the heroes' sprites; the HUD hero buttons show a small one and the ability icons (`art/abilities.py`: one per basic attack, `ability_atk_*`, and per ultimate, `ability_ult_<id>`; `ATTACK_ICON` in `js/game/sprites.js` says which hero uses which); item icons show the item's picture for its type and rarity, framed in the rarity colour (the initials while it loads).
- **Sizes:** tiles, items and heroes are 64x64 images; small things are 32x32 or 16x16. Everything is drawn at half resolution (32x32 art pixels in a 64x64 tile) and scaled up 2x with hard edges, so every asset has the same chunky pixel size. Draw new art the same way so the pixel sizes never mix.
- **Style:** one fixed palette (`PALETTE` in `art/tiles.py`), light from the top left, solid clusters of pixels with no anti-aliasing, a 1-pixel dark outline on sprites and none on ground tiles.
- **Terrain** (`python3 art/tiles.py`): grass, dirt and forest floor are each a seamless 4x4-tile texture (16 tiles; pick one by the cell's position, x % 4 and y % 4). The path has 47 autotile variants (`pathmask_<sides>`, plus `pathedge_<sides>` drawn on top), named by the path neighbours in N, E, S, W, NE, SE, SW, NW order, with a diagonal counting only when both sides next to it are path. `tiles.json` maps names to sheet positions. Decorations: two trees (64x64), and a bush, a rock, flowers and mushrooms (32x32).
- **Heroes** (`python3 art/heroes.py`): a 64x64 sprite for every hero and evolution (`hero_<id>.png`). They share one hand-drawn figure (one character per art pixel) and are put together from parts: colours (cloak, torso as leather, plate or robe, the accent in the hero's colour, the eye glow), a head (hood, helm, horned or plumed helm, great helm, mage hood, pelt hood, goggles, antlered hood), a weapon (bow, sword, axe, staff, daggers, boomerang, flask, nature staff, moon staff, totem), a back item (quiver) and a left-hand item (shield, dagger). The outline and ground shadow are added automatically. Heroes are tall and heroic, in dark, muted clothing so they stand out on the grass. To add a hero, add an entry to `HEROES`.
- **Enemies** (`python3 art/enemies.py`): `enemy_<id>.png`, 64x64 each, all armoured demons in one style: skin in the enemy's colour, black spiked armour with ember accents, horns, burning eyes under angry brows. The figure's size follows the enemy's size in the game: the Runner (a winged imp) is smallest, then the Grunt (a footsoldier with a cleaver), the Brute (a hulking demon with two spiked maces) and the Boss (a demon lord with great horns, wings, a cape and a cleaver).
- **Projectiles and effects** (`python3 art/effects.py`): projectiles point right and are rotated by the game to where they fly (`proj_*`: arrows with red, gold or green fletching, arcane bolt, fireball, ice shard, lightning spark, toxic dagger, fire and toxic flasks, boomerang at 32x32; the Commander's sword and the Marksman's piercing shot at 64x64). Animated effects are horizontal strips of frames (`fx_hit` 4 x 32x32, `fx_slash` 3 x 64x64 pointing right, `fx_explosion` 5 x 64x64). Ailment icons over enemies are 16x16 (`ail_bleed`, `burn`, `poison`, `chill`, `shock`). Zones are one 64x64 tile (`zone_poison`, `oil`, `storm`, `barrier`; `zone_trap` is 32x32). Solid objects get the dark outline; light and magic don't, and use see-through shades. The Druid adds a thorny seed (`proj_seed`), the wolf (`minion_wolf`, drawn facing where it runs), bramble patches (`zone_thorns`) and their spikes (`fx_spikes`), the falling moon (`fx_moon`) and its impact (`fx_moonburst`), and a root icon (`ail_root`).
- **Animation:** heroes, enemies and the wolf have a second frame (`hero_<id>_2`, `enemy_<id>_2`, `minion_wolf_2`, made by the same scripts): heroes breathe (head, cloak and weapon one art pixel lower), on their own beat; enemies bob as they walk, stepping every 9 px along the path (so faster ones step faster and rooted or frozen ones stand still); the wolf's legs alternate as it runs. The animation follows the game clock, so it pauses with the game.
- **Items** (`python3 art/items.py`): `item_<type>_<rarity>.png`, 64x64, for all 25 item types in `js/content/items.js` and rarity 0 (Common) to 3 (Epic). Melee items are heavy plate with crimson cloth, projectile items leather with green cloth, spell items blue silk with gold trim, minion items fur and bone. Each type is drawn once; the rarity picks the materials: worn iron and leather (Common), steel with bronze trim and a green gem (Uncommon), polished steel with gold trim and a blue gem (Rare), dark steel with gold trim, a purple gem and a glow (Epic). A new item type needs one more drawing in `ITEMS`.

## Extending the game
Everything in combat flows through `hit()` in `js/engine/world.js`, which emits `damage` and `kill` events. Pieces react to events instead of calling each other.
- **New relic:** add an entry to `RELICS` in `data.js`: a list of modifiers like `{ stat: 'damage', type: 'inc', value: 0.3, scope: ['cold'] }`. `inc` values add together, `more` values multiply, `flat` values add to the base. Scope is a list of hero tags, `['all']`, or `'global'` for economy stats.
- **New hero using an existing behavior:** add an entry to `HEROES` with its tags, base stats, ultimate and evolutions, and a tree with `addTree` in `talents.js`. Then run `npm run sql`.
- **New item:** add it to `ITEMS` in `js/content/items.js`, then run `npm run sql` and run the update SQL. It starts dropping right away.
- **New ultimate:** `registerUltimate('id', { name, desc, damageMult, onFire(world, hero) })` in `js/engine/ultimates.js`, then set `ultimate: 'id'` on a hero.
- **New evolution step:** add another entry to a hero's `evolutions` list.
- **New hero behavior:** add `registerBehavior('kind', { update(g, hero, dt) {} })` in `js/engine/behaviors.js`.
- **New status effect:** add it to `EFFECTS` in `js/engine/effects.js`, then list it in a hero's `applies` field.
- **New projectile:** add it to `PROJECTILES` in `js/engine/projectiles.js` (and its look to `PROJ_DRAW` in `js/game/render.js`: a sprite from `art/effects.py`, added to `SPRITES` in `js/game/sprites.js`, with a shape as fallback) and spawn it from a behavior.
- **New hero or evolution art:** add an entry to `HEROES` in `art/heroes.py` with the same id, run `python3 art/build.py`; the game picks it up by id.
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

### Optional: remove the old prototype tables
The earlier prototypes (Target Rush and the first tower defense) left tables that anyone with the public key can add rows to. If you no longer use those games, run `supabase-cleanup-old-prototypes.sql`. It permanently deletes their leaderboards.

## Known limits
- **The real email is not verified**, because sign-up uses the internal address. Someone could register with an email that isn't theirs, and password reset by email does not work yet. Real email login, verification and recovery are the next step if you want them.
- If sign-up says the email is invalid, Supabase rejected the internal domain. Change `AUTH_DOMAIN` in `config.js` to a domain you own.
- **Co-op trusts the players' games:** the host's game decides the order of everyone's commands, and the server checks each player's run like a solo one. A cheating host could only spoil their own match.
- **No host migration yet:** if the host leaves, the co-op match ends.
- **Cheating is limited, not impossible.** See "Security" below: runs are checked by the server for plausibility, but the game itself runs in the browser.
