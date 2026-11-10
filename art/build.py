"""Builds all the art and copies what the game uses into assets/ (the game loads sprites from there).

Run:  python3 art/build.py

Runs tiles.py, heroes.py, enemies.py, effects.py, items.py, abilities.py, kits.py, relics.py, font.py, ui.py, scenes.py and icons.py (each writes to art/out/, with preview images), then copies
the sprites, the tile sheet and its index (tiles.json) to assets/, leaving the previews behind. The game lists the files it
loads in js/game/sprites.js; a test checks that every one of them is in assets/.
"""
import os, subprocess, sys

ART = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ART, 'out')
ASSETS = os.path.join(os.path.dirname(ART), 'assets')
PREFIXES = ('tiles.', 'deco_', 'hero_', 'enemy_', 'proj_', 'fx_', 'ail_', 'zone_', 'item_', 'ability_', 'minion_', 'relic_', 'ui_', 'icon_', 'level_', 'tbd-pixel')

# Start from an empty art/out/, so a sprite that was renamed or removed does not linger.
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.png') or f.endswith('.json') or f.endswith('.woff'):
        os.remove(os.path.join(OUT, f))
for script in ('tiles.py', 'heroes.py', 'enemies.py', 'effects.py', 'items.py', 'abilities.py', 'kits.py', 'relics.py', 'font.py', 'ui.py', 'scenes.py', 'icons.py'):
    subprocess.run([sys.executable, os.path.join(ART, script)], cwd=ART, check=True)
os.makedirs(ASSETS, exist_ok=True)
for f in os.listdir(ASSETS):
    if f.endswith('.png') or f.endswith('.json') or f.endswith('.woff'):
        os.remove(os.path.join(ASSETS, f))
n = 0
for f in sorted(os.listdir(OUT)):
    if f.startswith(PREFIXES):
        with open(os.path.join(OUT, f), 'rb') as a, open(os.path.join(ASSETS, f), 'wb') as b:   # plain copy (sendfile fails on some mounts)
            b.write(a.read())
        n += 1
print(n, 'files copied to assets/')
