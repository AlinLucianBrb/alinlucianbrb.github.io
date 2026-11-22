"""The special enemies' walks: recoloured copies of the orc, troll, goblin and warlord walks, written to assets/ as
anim_<id>_walk.png. Run from anywhere:  python3 art/pixellab/build_enemy_variants.py

Each variant keeps the drawing (outlines, light and shade) and changes its colours: every pixel's hue is moved toward `hue`
(0 to 1 round the colour wheel) by `mix`, its saturation is multiplied by `sat` and its brightness by `val`. Very dark
pixels (the outlines) keep more of their own colour. To add one: add a line here, and its entry in VARIANTS in
js/game/sprites.js."""
from pathlib import Path
import colorsys
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent.parent / 'assets'
VARIANTS = {
    'stunner':  dict(of='orc',     hue=0.14, mix=0.9, sat=1.25, val=1.12),   # lightning yellow
    'regener':  dict(of='troll',   hue=0.36, mix=0.95, sat=0.85, val=1.0),  # fresh green
    'immune':   dict(of='orc',     hue=0.58, mix=1.0, sat=0.22, val=1.35),   # pale steel
    'summoner': dict(of='warlord', hue=0.78, mix=0.95, sat=1.2, val=1.05),   # violet
    'tough':    dict(of='troll',   hue=0.60, mix=1.0, sat=0.35, val=0.8),    # dark iron
    'bossSplitter': dict(of='warlord', hue=0.30, mix=0.95, sat=1.0, val=1.05),  # the summoned bosses: moss green
    'bossCharger':  dict(of='warlord', hue=0.05, mix=0.95, sat=1.3, val=1.1),   # ember orange
    'bossWarded':   dict(of='warlord', hue=0.57, mix=0.95, sat=1.1, val=1.1),   # ward blue
    'bossThief':    dict(of='warlord', hue=0.13, mix=0.95, sat=1.2, val=1.15),  # stolen gold
    'bossBlinker':  dict(of='warlord', hue=0.88, mix=0.95, sat=1.1, val=1.1),   # rose
    'minion':   dict(of='goblin',  hue=0.78, mix=0.95, sat=1.0, val=0.95),   # violet, like its summoner
}


def recolour(img, hue, mix, sat, val):
    a = np.array(img.convert('RGBA'))
    flat = a.reshape(-1, 4)
    colours, index = np.unique(flat[:, :3], axis=0, return_inverse=True)
    out = np.zeros_like(colours)
    for i, (r, g, b) in enumerate(colours):
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        d = (hue - h + 0.5) % 1 - 0.5                       # the short way round the wheel
        h2 = (h + d * mix) % 1
        s2 = min(1, max(s, 0.12) * sat)
        v2 = min(1, v * (1 + (val - 1) * min(1, v * 2)))    # outlines stay dark
        out[i] = [round(c * 255) for c in colorsys.hsv_to_rgb(h2, s2, v2)]
    flat[:, :3] = out[index.reshape(-1)]
    return Image.fromarray(flat.reshape(a.shape), 'RGBA')


for name, v in VARIANTS.items():
    src = Image.open(ASSETS / f"anim_{v['of']}_walk.png")
    out = recolour(src, v['hue'], v['mix'], v['sat'], v['val'])
    out.save(ASSETS / f'anim_{name}_walk.png', optimize=True)
    print(name, out.size)
