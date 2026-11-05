# Test TBD

HTML/JS tower defense with accounts, a main menu and a leaderboard. No build step.

## Structure
```
index.html                 page shell: one <section> per screen
js/main.js                 boot: registers screens, picks the first one
js/config.js               your Supabase URL and key (and optional CAPTCHA site key)
js/core/                   bus.js (events), screens.js, tooltip.js, state.js, rules.js
js/services/api.js         the only file that talks to Supabase
js/screens/                login, menu, levels (level, then heroes), heroes, inventory, talents, leaderboard, settings, play;
                           loadout.js holds what they share (items, equipment, saving the lineup)

js/content/                WHAT the game contains (plain data, no logic)
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
| Move a hero | click and hold it on the map, then let go on a free tile | M, then click a tile |
| Evolve a hero | the ▲ Evolve button above its card (it shows the cost), then a form in the picker | E (selected hero) |
| Move the map | drag (any mouse button), or drag with one finger | arrows or WASD |
| Zoom | mouse wheel, pinch, or the + / − buttons | + / − |
| Fit the map to the screen | Fit button | F |
| Buy a relic | Relic | Space (or R) |
| Pick a relic in the relic picker | click it | 1 / 2 / 3 |
| Start the wave | Start wave (AUTO is red while Auto-start is off, green when on) | Enter |
| Pause | Menu (asks before quitting) | P (Esc resumes) |
| Game speed | speed button: 1x, 2x, and 3x with the Overdrive talent | |

- The camera fits the map into the space the HUD leaves free whenever a run starts or the window changes size (until you move or zoom it yourself; Fit returns to that view).
- Every run, including Retry after a win or a loss, starts with Auto-start off and unpaused.

## Background play
- The game runs on a fixed time step, so it plays the same at any frame rate. When the tab is hidden or the window is minimized, a timer keeps it running, and it catches up on any time the browser paused (up to 30 minutes).
- Heroes cannot be controlled while the tab is hidden, so turn on Auto-start before switching away. A paused game stays paused in the background.

## Heroes, energy, evolution and items
- **Four classes:** Warrior (melee swing), Ranger (fast arrows that fly to their target), Mage (a magic bolt that flies to its target, dealing spell damage) and Rogue (two quick strikes, with a knack for critical hits). In a match, the hero cards follow your lineup order (key 1 first). The Thief, Frost Mage (with its slow), Fire Mage and Lightning Mage are kept in `HERO_ARCHIVE`, with their behaviors and relics, for the advanced variants later.
- **Lineup:** after clicking a level (Play), players choose up to 3 different heroes to bring, then press Start. "Next level" after a win goes to the same choice. In a match each hero is placed once, for free; gold goes to evolutions and relics.
- **Heroes screen:** one card per hero; click one to open its page. **Information**: the five gear slots on the left (an empty slot shows the free items that fit, best first: click one to equip it; Remove takes it off), the hero's picture in the middle (a placeholder until there is art), stats on the right (attributes, damage with where the bonuses come from, range, speed, energy, ultimate). **Evolutions**: the evolution tree, from the base hero to each form with its attack and ultimate.
- **Inventory screen** (main menu, under Heroes): every item you own as an icon on a grid (the type's initials on its colour, framed in the rarity colour, until there are icons). Worn items come first. Hover one for its rarity, slot, bonuses and who wears it.
- **Attributes:** strength, dexterity and intellect. Every hero has all three and one of its own (Warrior strength, Ranger and Rogue dexterity, Mage intellect; evolved forms keep it). For now each point of a hero's own attribute is +1% increased damage (`ATTRIBUTE_DAMAGE`); the other two do nothing yet. Heroes start with 10 in their own attribute, and each hero level adds 3 (`HERO_LEVELS.perLevel`, stat `mainAttribute`), so a level 10 hero has 37: +37% damage. Talents, relics and items can raise any attribute like any other stat.
- **Energy and ultimates:** every hero has an energy bar (blue under the hero; gold and glowing when full). It fills by `energyPerAttack` per attack and `energyPerSecond` during waves; the defaults are in `ENERGY` in `data.js` (20 per attack, 0 per second), and both are ordinary stats that talents, relics and items can change. When the bar is full, the next attack is the ultimate: for now, double damage.
- **Hero levels:** during a match, every hero on the field gains XP from each kill (Grunt and Runner 1, Brute 3), whoever landed it. Level 2 takes 10 XP and each level after takes 2 more, so level 10 (162 XP) comes around the middle of level 1. Each level adds +3% damage. The rules are `HERO_LEVELS` in `data.js` (set `perLevel` to `[]` for no bonus). Levels show as a badge on the hero, on its card and in the hero panel.
- **Hero cards** (bottom bar) are small: the name with the level next to it, and "Free · place it" until the hero is on the map. A hero with no evolution left has no card any more (select it on the map).
- **Hero panel** (select a hero on the map): the name and level, XP right under it, then strength, dexterity and intellect (the hero's own attribute in its colour: strength red, dexterity green, intellect blue; hover one for where it comes from), then energy as x/max, the ultimate, and the stats with every bonus.
- **Evolution:** once a hero reaches the evolution's level (10 for now), an **▲ Evolve · 150** button pops up above its card, dimmed until you have the gold. Clicking it (or E with the hero selected) opens the evolution picker: like the relic picker, it pauses the game and shows the three forms side by side; Cancel or Esc closes it. Every evolution gives +50% damage, range and attack speed. Every hero chooses one of three forms:
  - **Berserker** (Warrior): swings twice in quick succession (0.15 s apart, counting as one attack for energy), and every hit makes the enemy bleed. Ultimate *Frenzy*: +50% damage and attack speed for 5 seconds.
  - **Commander** (Warrior): throws the sword in a straight line out to its range (base 110), hitting every enemy in the way once. Ultimate *Rally*: for 5 seconds, every hero within 220 px (the Commander too) gets double energy per attack.
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
  Evolutions are data: a hero's `evolutions` is a list of steps `{ level, cost, choices }`, and each choice can change the name, colour, damage type, ultimate, on-hit effects and stats (see `evolvedDef` in `data.js`). Ultimates are registered in `ultimates.js`; areas like the storm are zones in `js/engine/zones.js`.
- **Items:** every boss you defeat drops an item, a win drops one more, and a loss has a chance (up to 50%, more for surviving longer). Item find from talents adds to the chance. The server rolls the drops, so they cannot be faked. Equip items on the hero's page (Heroes screen).
- **Gear:** five slots per hero: helm, body armour, legs, boots and a trinket (`SLOTS` in `js/content/items.js`). Item types: Helm, Body Armour, Leggings, Boots, and the Power Charm (a trinket with +5 damage of its own).
- **Item rarity and bonuses:** items have the relic rarities (Common 55%, Uncommon 28%, Rare 13%, Epic 4%). A Common item has at least 1 bonus, an Uncommon 2, a Rare 3, an Epic 4; each further bonus has a 30% chance, up to 4 (`ROLL`). Bonuses are relics at the item's rarity (a Rare helm with Whetstone gives what a Rare Whetstone relic gives), and an item never has the same bonus twice. Hero bonuses help only the hero wearing the item, and only if it has the tags (Whetstone needs a melee hero); economy bonuses (gold per kill, wave gold, interest...) help the whole match; Reinforced gate gives starting lives. Items from before this update are Common with no bonuses, and an old single item becomes the hero's trinket.
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
- **Cast speed:** spell casters (the Mage and its forms, `rate: 'castSpeed'`) attack at their cast speed instead of attack speed, so attack-speed bonuses (Quick hands, the Speed talents, Frenzy) do not help them; **Quick incantation** (+3% cast speed per Common, spell heroes) does. The hero panel shows "Casts per second" for them.
- **Penetration** (hits only, not damage over time): `armorPen` ignores that share of the enemy's armor; `firePen`, `coldPen` and `lightningPen` take that many points off the enemy's resistance, after the 99% cap (like shock). They come from the Sunder, Fire, Cold and Lightning talent clusters.
- **Damage types:** physical, spell, fire, cold, lightning and toxic. Each hero deals its own type (`damageType`: Warrior and Ranger physical, Mage spell, and its evolutions fire, cold or lightning) and can gain added damage of any type (`fireDamage`, `spellDamage`, ...). Spell damage causes no ailment.
- **Defenses:** enemies have `armor` (blocks part of physical hits, more of small hits) and a resistance for every other damage type (negative means extra damage). Both cap at 99%. They start at 0 on wave 1 and grow with **threat**: +1 per wave, and each level after the first adds 25% to that growth (`threat` in `js/engine/enemies.js`). Each type has its own profile per point of threat: Grunts a little of both, Brutes heavy armor, Runners high resistances, Bosses both. At the end of level 1 a Brute has about 21 armor; at the end of level 5 about 100 (roughly a third off a 30-damage hit).
- **Bosses:** the last wave of every level ends with a boss, and from level 3 on the middle wave has one too (`isBossWave`). It replaces the wave's last enemy, has 12× a Grunt's life, moves slowly, costs 10 lives if it gets through, and pays 20× gold and 25 XP. **The final boss must die:** if the last wave's boss gets through, the level is lost, whatever lives are left. Every boss defeated guarantees an item at the end of the match. The HUD shows "Boss" on boss waves ("Boss next" before one), and bosses wear a crown.
- **Ailments** (`js/content/combat.js`), each with a chance stat on heroes (`bleedChance`, ...):
  bleed (physical hits; damage over time, strongest counts), poison (physical or toxic hits; toxic damage over time, stacks up to 20), burn (fire hits; damage over time, strongest counts), shock (lightning hits; for 2 s the enemy's armor is halved and every resistance drops by 20 points, so with no resistance it takes 20% extra non-physical damage), freeze (cold hits; enemy stops, longer for bigger hits, up to 1.5 s).
- Every attack goes through `attack()` in `js/engine/combat.js` and damage over time through `dotDamage()`; ailment rolls use the match's seeded random numbers, so replays stay exact. The damage meter credits damage over time to the hero that caused it.
- To try it, give a relic, talent node or item a modifier such as `{ stat: 'burnChance', type: 'flat', value: 0.25, scope: ['all'] }` together with `fireDamage`.

## Relic luck and interest
- **Relic luck** (`relicLuck`, from the Four-leaf clover relic) makes rarer relics more likely: each rarity's weight is multiplied by 1 + luck once per step above Common. The relic picker and the Relic button's tooltip show the current odds.
- With Compound interest, the gold box shows what the next wave clear pays in interest and how much gold earns the full amount.

## Art
Pixel art, made by scripts in `art/` (output in `art/out/`, not used by the game yet).
- **Sizes:** tiles, items and heroes are 64x64 images; small things are 32x32 or 16x16. Everything is drawn at half resolution (32x32 art pixels in a 64x64 tile) and scaled up 2x with hard edges, so every asset has the same chunky pixel size. Draw new art the same way so the pixel sizes never mix.
- **Style:** one fixed palette (`PALETTE` in `art/tiles.py`), light from the top left, solid clusters of pixels with no anti-aliasing, a 1-pixel dark outline on sprites and none on ground tiles.
- **Terrain** (`python3 art/tiles.py`): grass, dirt and forest floor are each a seamless 4x4-tile texture (16 tiles; pick one by the cell's position, x % 4 and y % 4). The path has 47 autotile variants (`pathmask_<sides>`, plus `pathedge_<sides>` drawn on top), named by the path neighbours in N, E, S, W, NE, SE, SW, NW order, with a diagonal counting only when both sides next to it are path. `tiles.json` maps names to sheet positions. Decorations: two trees (64x64), and a bush, a rock, flowers and mushrooms (32x32).

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
- **Items and lineups:** only the server creates items (in `finish_run`, which also rolls their rarity and bonuses from the `item_bonuses` table); players can read their own items but not change them. `save_loadout` only accepts known heroes, at most 3 different ones, and items the player owns, each in the slot its type goes in and worn once. Each run records the lineup and equipment it started with.
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
