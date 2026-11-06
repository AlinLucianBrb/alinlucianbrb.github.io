"""Builds all the art and copies what the game uses into assets/ (the game loads sprites from there).

Run:  python3 art/build.py

Runs tiles.py, heroes.py, enemies.py, effects.py and items.py (each writes to art/out/, with preview images), then copies
the sprites, the tile sheet and its index (tiles.json) to assets/, leaving the previews behind. The game lists the files it
loads in js/game/sprites.js; a test checks that every one of them is in assets/.
"""
import os, shutil, subprocess, sys

ART = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ART, 'out')
ASSETS = os.path.join(os.path.dirname(ART), 'assets')
PREFIXES = ('tiles.', 'deco_', 'hero_', 'enemy_', 'proj_', 'fx_', 'ail_', 'zone_', 'item_')

for script in ('tiles.py', 'heroes.py', 'enemies.py', 'effects.py', 'items.py'):
    subprocess.run([sys.executable, os.path.join(ART, script)], cwd=ART, check=True)
os.makedirs(ASSETS, exist_ok=True)
for f in os.listdir(ASSETS):
    if f.endswith('.png') or f.endswith('.json'):
        os.remove(os.path.join(ASSETS, f))
n = 0
for f in sorted(os.listdir(OUT)):
    if f.startswith(PREFIXES):
        shutil.copy(os.path.join(OUT, f), os.path.join(ASSETS, f)); n += 1
print(n, 'files copied to assets/')
