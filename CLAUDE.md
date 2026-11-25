# Test TBD: working notes for Claude

HTML/JS tower defense with heroes, evolutions, talents, relics, items, co-op (up to 4) and leaderboards. Hosted on GitHub
Pages, accounts and data on Supabase. No build step: the browser loads `index.html` and the ES modules directly.
The README's "Structure" section maps every folder; read it before changing something you haven't touched yet.

## The owner
- Alin is a programmer (game dev background), not an artist: he says he can't draw and doesn't know art terms. Explain
  art choices in plain words, and show art (images, GIFs) rather than describing it.
- He steers the game with .docx design docs: unhighlighted = new, green = already done, yellow = changed/revise,
  red = skip for now.
- Balancing and the balance bot are set aside. Don't retune numbers or run balance passes unless he asks.
- Never send his personal details (email etc.) to outside services.

## Every change
1. Keep it modular: `js/content` is data only, `js/engine` is the pure simulation (no DOM, no clock, no `Math.random`:
   use `rng.js`), `js/game` is the browser shell. Extend through the existing tables/registries; no god objects.
2. `npm test` must pass (Node's test runner, ~295 tests). Add or update tests with the change.
3. Check it in a browser: `python3 -m http.server 8765` from the project folder, then Playwright. The Supabase client
   comes from a CDN; stub it (see `tools/evo-check.mjs`). Look for page errors and take a screenshot of what changed.
4. Changelog: add a dated section `## <What changed> (<Mon DD>, v<version>)` to the README, directly ABOVE the newest
   one (the changelog starts after "Changes from the design notes"). Say in it whether SQL or rules changed.
5. Version: bump `GAME_VERSION` in `js/core/version.js` (patch for fixes/art, minor for features). Edit that one line
   only; never rewrite the file. `ENGINE_VERSION` (`js/engine/world.js`) changes only when the rules change.
6. Tell him in the summary whether the SQL changed (he then runs `supabase-update.sql`).

## Rules that are easy to break
- The rules live in ONE place, `js/content/rules.js`; the server's copy is generated from it. Database changes go in
  `sql/` (the parts), then `npm run sql` rebuilds `supabase-setup.sql` and `supabase-update.sql`. Never edit the built
  files by hand. The `sql-sync` test checks they match.
- Do NOT add any tool that checks the SQL against a live database. If an update fails, he will say so and ask for
  `supabase-update.sql` to be fixed.
- `js/config.js` holds his Supabase URL and key. Don't change, overwrite or commit over it.
- No scroll bars anywhere in the game. If something doesn't fit, make the panel bigger.
- `assets/` is built by scripts. Don't hand-edit files there; change the script or its sources and rebuild.

## UI style
Pixel art UI built from the game's own art (`art/pixellab/build_ui.py`): wood/leather/iron/slate frames and textures,
zone colours via `body[data-zone]` and `--zc`, gold plate buttons (`ui_button`). Icons: `build_icons.py`; logo and menu
icons: `build_logo_icons.py`; zone pictures and banners: `build_levels.py`; menu scene and fire: `build_scene.py`.
He found plain planks tiring and repetitive styles boring: keep variety between screens, avoid frames inside frames.

## Art direction
- Heroes: detailed anime/heroic pixel art at about 128 px, "lots of detail at a low resolution", coloured outlines,
  epic rather than goofy. Enemies (goblins, orcs, trolls) in the same style. Camera: Arknights-like 2.5D board
  (`TILT` 0.8, `FAR` 0.8).
- Evolutions are the SAME person as the base hero (face, hair, height, build) with gear replaced or added on top, and
  they must look grander so the player sees the progress.
- Attacks: simple, readable at match zoom, 4 frames, and not tiring when sped up x3 or at high attack speed.

## Art pipeline (Pixel Lab)
Art is made with the Pixel Lab MCP tools and built into `assets/` by the Python scripts in `art/pixellab/`.
Pixel Lab downloads may be blocked from a shell; save images from the tool results instead. Max ~8 jobs at once.

**Evolved forms** (`art/pixellab/evolutions/`, built by `build_evolutions.py`):
- `<form>.png` is the still: the base hero's still edited with `edit_image_pro_flash` (same pose and person, new gear).
  `stills.txt` records the Pixel Lab job of each still; `v1/` keeps replaced ones.
- Idle: `animate_image` (4 frames) on the still padded to 160x160 (`pixelart_workbench draw`, offset [32,14] for
  96-wide art, [16,14] for 128-wide). Frames go in `frames/<form>_<idle|attack>_<i>.png`; `frames.txt` lists them,
  with `useNNN` to keep only the on-model frames.
- The build writes `anim_<form>_idle/attack.png`, `portrait_/hero_<form>.png` and `entries.json` (foot, height,
  frame counts). Copy those into the `FORMS` table in `js/game/sprites.js`. `focus` = median x of the opaque pixels in
  rows 12-42% of the figure in `portrait_<form>.png`.

**Hand-timed attacks** (`art/pixellab/attacks/`, built by `build_attacks.py`). This is the method that works; use it
for every hero and form:
1. Pad the still to 256x256 at offset [64,109] (feet at y 235). Save it as `attacks/<name>_0_stance.png`.
2. `estimate_skeleton` on it, then pose 4 skeletons by hand (move the sword arm, lean the torso a few px, keep the hips
   and legs exactly on the stance) and run `animate_with_skeleton_v3` (direction south-west, view low top-down, a short
   description of the look). The figure stays on-model and the feet stay locked. ~3 generations per animation.
   `attacks/warrior_forms_skeletons.json` is the Warrior forms' overhead slash (wind-up, swing, strike, recover).
3. Save the frames as `<name>_1_..` to `<name>_4_..`, removing stray specks (small separate blobs).
4. Add the durations to `DURATIONS` in `build_attacks.py` and run it. Forms with a stance file there are skipped by
   `build_evolutions.py`'s attack output.
5. In `sprites.js`, a form gets `durations: [...]` and `strike: <index>` (the frame the blade lands on; the slash
   effect waits for it). Its attack foot is the idle foot + [48, 95] (the still sits 48 px right and 95 px lower in
   the 256 frame), so idle and attack line up.
   Timing used for the Warrior forms: 250 / 70 / 300 / 180 ms; the game squeezes it to fit faster attacks.
6. Review: `tools/capture-attack.mjs` records a hero attacking in a match at x1 then x3. Turn the screenshots into a
   GIF and show it to him before calling it done.

Base heroes' animations: `art/pixellab/anim_<hero>_*.png`; the base Warrior's attack is the hand-timed one in
`attacks/warrior_*` (two-handed overhead slash, 340 / 60 / 450 ms).

## Where things stand (Nov 22)
- Done: every evolution has animated art; the Warrior and his three forms have the hand-timed attack.
- Next: redo the other heroes' evolution attacks the same way, one hero at a time with his feedback. Write him a short
  spec per form first (look, idle, attack motion), make 2-3 options when it's not obvious, and show GIFs.
- Still on old art: the old minions (imp, wolf, totems).
