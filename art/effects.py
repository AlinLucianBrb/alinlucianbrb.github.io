"""Projectiles, hit effects, ailment icons and zones for Test TBD, in the same pixel style (art pixels 2x2 on screen).

Run:  python3 art/effects.py      (writes art/out/proj_*.png, fx_*.png, ail_*.png, zone_*.png and art/out/preview-effects.png)

- Projectiles point RIGHT; the game rotates them to their direction of flight. Small ones are 32x32 images (16x16 art
  pixels), the Commander's sword and the Marksman's piercing shot 64x64.
- Animated effects are horizontal strips of frames (fx_hit: 4 frames of 32x32; fx_slash: 3 of 64x64, pointing right;
  fx_explosion: 5 of 64x64; fx_strike: 3 of 64x64, a bolt from the sky whose strike point is the bottom centre). Ailment
  icons are 16x16 (8x8 art pixels), drawn over enemies (slow and freeze have their own). Zones are 64x64, one tile;
  the storm is drawn from small clouds (zone_storm_cloud, 32x32) placed around its edge at their own size, so a big
  storm never stretches the pixels.
- Solid objects (arrows, daggers, bottles, the barricade, the trap) get the dark outline; light and magic (bolts, sparks,
  slashes, explosions, puddles) do not, and use a few see-through shades instead.
Colours are hex strings; 8-digit ones carry alpha. Grids are rows of characters, '.' transparent, padded to the size.
"""
import json, math, os
from PIL import Image

P = 2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
INK = '#121a14'


def rgba(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in range(0, len(c), 2)) + (() if len(c) == 8 else (255,))


def render(rows, pal, n, outline=False):
    rows = [r.ljust(n, '.')[:n] for r in rows] + ['.' * n] * (n - len(rows))
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = img.load()
    filled = set()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                px[x, y] = rgba(pal[ch]); filled.add((x, y))
    if outline:
        for y in range(n):
            for x in range(n):
                if (x, y) not in filled and any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    px[x, y] = rgba(INK)
    return img.resize((n * P, n * P), Image.NEAREST)


class Grid:
    """A blank n x n grid to draw shapes into (for round and generated effects)."""
    def __init__(self, n):
        self.n = n; self.g = [['.'] * n for _ in range(n)]
    def set(self, x, y, k):
        if 0 <= x < self.n and 0 <= y < self.n: self.g[y][x] = k
    def disc(self, cx, cy, r, k, ry=None):
        ry = ry or r
        for y in range(self.n):
            for x in range(self.n):
                if ((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1: self.g[y][x] = k
    def ring(self, cx, cy, r, w, k, gaps=None):
        for y in range(self.n):
            for x in range(self.n):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if r - w <= d <= r:
                    if gaps and gaps(math.atan2(y + 0.5 - cy, x + 0.5 - cx)): continue
                    self.g[y][x] = k
    def line(self, x0, y0, x1, y1, k):
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(steps + 1):
            self.set(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps), k)
    def rows(self):
        return [''.join(r) for r in self.g]


# ---- Projectiles (pointing right) --------------------------------------------------------------------------------------
WOOD = {'q': '#3e2412', 'Q': '#7a4b26', 'r': '#b98447', 'm': '#d4dae2', 'M': '#858c99'}


def arrow(fletch):
    rows = ['', '', '', '', '', '',
            '.ff.........m',
            '..fQQQQQQQQQmmm',
            '.ff.........m']
    pal = dict(WOOD, f=fletch)
    return render(rows, pal, 16, outline=True)


def magic_bolt(core, mid, glow, trail):
    g = Grid(16)
    for i, (x, r) in enumerate([(3, 1.2), (5, 1.6), (7, 2.1)]):
        g.disc(x, 8, r, 't')
    g.disc(10.5, 8, 4.2, 'g')
    g.disc(11, 8, 3.1, 'o')
    g.disc(11.5, 7.5, 1.6, 'W')
    pal = {'t': trail, 'g': glow, 'o': mid, 'W': core}
    return render(g.rows(), pal, 16)


def fireball():
    rows = ['', '', '',
            '.......yyy',
            '....y.yyooyy',
            '..y..yyooWooy',
            '.y.yyyooWWWooy',
            '..yyyooWWWWWoy',
            '.y.yyyooWWWooy',
            '..y..yyooWooy',
            '....y.yyooyy',
            '.......yyy']
    pal = {'y': '#c2361fcc', 'o': '#ff8a3d', 'W': '#ffe9a0'}
    return render(rows, pal, 16)


def ice_shard():
    rows = ['', '', '', '', '',
            '.t.t......cC',
            '..t...cccCCCC',
            '.t..ccWWccccCCw',
            '..t...cccCCCC',
            '.t.t......cC']
    pal = {'t': '#8edcff88', 'c': '#8edcff', 'C': '#3f8fc4', 'W': '#ffffff', 'w': '#e8faff'}
    return render(rows, pal, 16, outline=True)


def spark():
    """A jagged bolt of lightning with a violet glow around it."""
    g = Grid(16)
    pts = [(1, 9), (5, 6), (7, 10), (11, 6), (14, 8)]
    core = set()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(steps + 1):
            core.add((round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps)))
    for x, y in core:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                g.set(x + dx, y + dy, 'p')
    for x, y in core:
        g.set(x, y, 'W')
    g.set(15, 8, 'W')
    return render(g.rows(), {'W': '#fbf2ff', 'p': '#c48bffaa'}, 16)


def dagger(blade):
    rows = ['', '', '', '', '', '',
            '....y',
            '.QQQyWWWWWWw',
            '....yBBBBBb',
            '....y']
    pal = {'Q': '#4a2e18', 'y': '#c9a24a', 'W': '#e8f0f4', 'w': '#ffffff', 'B': blade, 'b': blade}
    return render(rows, pal, 16, outline=True)


def flask(liquid, deep):
    rows = ['', '', '',
            '......QQ',
            '......gg',
            '.....wggw',
            '....wwLLgw',
            '...wLLLLLLw',
            '...wLlLLLDw',
            '...wLLLLLDw',
            '...wDLLLDDw',
            '....wDDDDw',
            '.....wwww']
    pal = {'Q': '#8a5a32', 'g': '#c9ccd2', 'w': '#e6eef2', 'L': liquid, 'l': '#ffffff', 'D': deep}
    return render(rows, pal, 16, outline=True)


def boomerang():
    rows = ['', '', '',
            '..zY',
            '..zyY',
            '...zyY',
            '....zyY',
            '.....zyY',
            '....zyyy',
            '...zyyY',
            '..zyyY',
            '..yYY']
    pal = {'z': '#d4ffcc', 'y': '#8be28b', 'Y': '#4c8a4c'}
    return render(rows, pal, 16, outline=True)


def sword():
    rows = [''] * 13 + [
        '.....yy',
        '..QQQyyWWWWWWWWWWWWWWWWWWWWWWw',
        '.bQQQyywwwwwwwwwwwwwwwwwwwwwwG',
        '..QQQyyGGGGGGGGGGGGGGGGGGGGGG',
        '.....yy']
    pal = {'Q': '#4a2e18', 'b': '#7fb3ff', 'y': '#c9a24a', 'W': '#ffffff', 'w': '#c9d6e6', 'G': '#7d8a9c'}
    return render(rows, pal, 32, outline=True)


def piercing():
    g = Grid(32)
    for x in range(2, 30):
        w = 0.6 + 2.6 * (x / 30)
        for y in range(32):
            d = abs(y + 0.5 - 16)
            if d <= w + 1.4: g.set(x, y, 'a')
    for x in range(8, 30):
        w = 0.4 + 1.4 * (x / 30)
        for y in range(32):
            if abs(y + 0.5 - 16) <= w: g.set(x, y, 'y')
    g.line(12, 16, 28, 16, 'W'); g.line(12, 15, 28, 15, 'W')
    for i, k in enumerate('WWW'):
        g.line(28 + i, 14 + i, 28 + i, 17 - i, 'W')
    return render(g.rows(), {'a': '#ffd76a55', 'y': '#ffe08a', 'W': '#ffffff'}, 32)


PROJECTILES = {
    'arrow': lambda: arrow('#d9574e'),
    'arrow_gold': lambda: arrow('#ffd76a'),
    'arrow_toxic': lambda: arrow('#7ad04b'),
    'bolt_arcane': lambda: magic_bolt('#ffffff', '#c39bf2', '#8a5ad0aa', '#8a5ad066'),
    'fireball': fireball,
    'ice_shard': ice_shard,
    'spark': spark,
    'dagger_toxic': lambda: dagger('#7ad04b'),
    'flask_fire': lambda: flask('#ff8a3d', '#c2461f'),
    'flask_toxic': lambda: flask('#7ad04b', '#3f7a2a'),
    'boomerang': boomerang,
    'sword': sword,
    'piercing': piercing,
}

# ---- Animated effects ---------------------------------------------------------------------------------------------------
def hit_frames():
    frames = []
    for f in range(4):
        g = Grid(16)
        r = [2.2, 4, 5.5, 6.5][f]
        rays = [(1, 0), (-1, 0), (0, 1), (0, -1), (0.7, 0.7), (-0.7, 0.7), (0.7, -0.7), (-0.7, -0.7)]
        for i, (dx, dy) in enumerate(rays):
            L = r * (1 if i < 4 else 0.7)
            inner = [0, 1, 2.5, 4][f]
            g.line(round(8 + dx * inner), round(8 + dy * inner), round(8 + dx * L), round(8 + dy * L), 'y' if f < 3 else 'a')
        if f < 2:
            g.disc(8, 8, [2, 2.6][f], 'W')
        frames.append(render(g.rows(), {'W': '#ffffff', 'y': '#ffe9a0', 'a': '#ffe9a088'}, 16))
    return strip(frames)


def slash_frames():
    frames = []
    for f in range(3):
        g = Grid(32)
        span = [0.5, 0.95, 1.1][f]
        for y in range(32):
            for x in range(32):
                dx, dy = x + 0.5 - 6, y + 0.5 - 16
                d, a = math.hypot(dx, dy), math.atan2(dy, dx)
                if abs(a) <= span and 18 <= d <= 25:
                    edge = 25 - d
                    k = 'W' if edge < 1.5 and f < 2 else 'w' if edge < 3.5 else 'a'
                    if f == 2: k = 'a' if edge < 3.5 else '.'
                    g.g[y][x] = k
        frames.append(render(g.rows(), {'W': '#ffffff', 'w': '#e6eef2cc', 'a': '#e6eef266'}, 32))
    return strip(frames)


def explosion_frames():
    frames = []
    for f in range(5):
        g = Grid(32)
        r = [5, 9, 12, 13.5, 14.5][f]
        if f < 4:
            g.disc(16, 16, r, 'r')
            g.disc(15.5, 15.5, r * 0.75, 'o')
            g.disc(15, 15, r * 0.45, 'y' if f < 3 else 'o')
            if f < 2: g.disc(15, 15, r * 0.25, 'W')
        if f >= 2:
            for i in range(7):
                a = i * 0.9 + f
                g.disc(16 + math.cos(a) * r * 0.8, 16 + math.sin(a) * r * 0.8, 2.6 if f < 4 else 3.4, 's')
            if f == 4: g.disc(16, 16, 5, 's')
        frames.append(render(g.rows(), {'W': '#ffffff', 'y': '#ffe08a', 'o': '#ff8a3d', 'r': '#c2361f', 's': '#3a2a2a99'}, 32))
    return strip(frames)


def strip(frames):
    w, h = frames[0].size
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


# ---- Ailment icons (8x8 art pixels), shown over enemies --------------------------------------------------------------------
AILMENTS = {
    'bleed':  (['...r', '..rr', '.rRRr', '.rRWr', 'rRRRRr', 'rRRRRr', '.rRRr', '..rr'], {'r': '#8f1f1f', 'R': '#d9574e', 'W': '#ffb0a0'}),
    'burn':   (['...o', '..oo.o', '.ooyo', '.oyyo', 'ooyWyo', 'oyWWyo', '.oyyo', '..oo'], {'o': '#e0602e', 'y': '#ffb347', 'W': '#ffe9a0'}),
    'poison': (['..gggg', '.gGGGGg', 'gGkGGkG', 'gGGGGGg', '.gGkkG', '..gGGg', '..g.g', ''], {'g': '#3f7a2a', 'G': '#a6d94a', 'k': '#16240f'}),
    'slow':   (['.c....c', '.cC..cC', '..cccC', '...cC', '.c....c', '.cC..cC', '..cccC', '...cC'], {'c': '#a8c8f0', 'C': '#5a7ab0'}),
    'freeze': (['wwwwwww', 'wcWcccC', 'wWcWccC', 'wcWcWcC', 'wccWcWC', 'wcccWcC', 'wccccCC', 'CCCCCCC'],
               {'w': '#e8faff', 'c': '#8edcff', 'W': '#ffffff', 'C': '#3f8fc4'}),
    'shock':  (['....yy', '...yy', '..yyW', '.yyyyy', '...yy', '..yy', '.yy', '.y'], {'y': '#d6a2ff', 'W': '#ffffff'}),
}

# ---- Zones (one tile, 32x32 art pixels) ------------------------------------------------------------------------------------
def zone_poison():
    g = Grid(32)
    g.disc(16, 17, 13, 'a', 10); g.disc(15, 16, 10, 'g', 7.5); g.disc(13, 14, 4, 'l', 2.5)
    for x, y in ((20, 19), (10, 20), (22, 13)):
        g.disc(x, y, 1.6, 'b'); g.set(x - 1, y - 1, 'W')
    return render(g.rows(), {'a': '#3f7a2a99', 'g': '#7ad04bbb', 'l': '#b6f07cbb', 'b': '#c8ff70', 'W': '#ffffff'}, 32)


def zone_oil():
    g = Grid(32)
    g.disc(16, 17, 13, 'a', 10); g.disc(16, 17, 11, 'o', 8.5); g.disc(12, 14, 3.5, 's', 2)
    g.ring(16, 17, 13.2, 1, 'e')
    return render(g.rows(), {'a': '#2a1c0ecc', 'o': '#3c2a14dd', 's': '#ffdcaa66', 'e': '#ff9f43aa'}, 32)


def storm_cloud():
    """One small thundercloud; the game places several around the storm's edge at their own size (no stretching)."""
    g = Grid(16)
    for cx, cy, r in ((3.5, 9.5, 2.6), (6, 7.5, 3.2), (9.5, 6.5, 3.4), (12.5, 8.5, 2.8), (8, 10, 3)):
        g.disc(cx, cy, r, 'G')
    for cx, cy, r in ((5.5, 6.8, 1.8), (9, 5.5, 2.2), (12, 7.6, 1.4)):
        g.disc(cx, cy, r, 'g')
    for x in range(3, 14):
        if g.g[11][x] == 'G': g.g[11][x] = 'K'
    g.set(7, 10, 'p'); g.set(8, 11, 'v'); g.set(9, 10, 'p')
    return render(g.rows(), {'K': '#2a2c3a', 'G': '#4a4c60', 'g': '#7a7e96', 'p': '#c48bff', 'v': '#fbf2ff'}, 16, outline=True)


def strike_frames():
    """A bolt of lightning from the sky to the ground: 3 frames of 32x32 art pixels (the strike point is the bottom centre)."""
    pts = [(14, 0), (18, 6), (13, 11), (19, 17), (14, 23), (17, 27), (16, 31)]
    frames = []
    for f in range(3):
        g = Grid(32)
        core = set()
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            steps = max(abs(x1 - x0), abs(y1 - y0))
            for i in range(steps + 1):
                core.add((round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps)))
        if f < 2:
            for x, y in core:
                for dx in (-2, -1, 0, 1, 2):
                    g.set(x + dx, y, 'p' if f == 0 else 'a')
            for x, y in core:
                for dx in ((0, 1) if f == 0 else (0,)):
                    g.set(x + dx, y, 'W' if f == 0 else 'v')
            g.disc(16, 30.5, [4, 3][f], 'p', 1.6)
            g.disc(16, 30.5, [2.4, 1.6][f], 'W', 1)
        else:
            g.disc(16, 30.5, 4.5, 'a', 1.6)
        frames.append(render(g.rows(), {'W': '#ffffff', 'v': '#f2e2ff', 'p': '#c48bffcc', 'a': '#c48bff55'}, 32))
    return strip(frames)


def zone_barrier():
    rows = ['', '', '', '', '', '',
            '...u......u......u......u',
            '..uU.....uU.....uU.....uU',
            '..rQ.....rQ.....rQ.....rQ',
            '.QrrQQQQQrrQQQQQrrQQQQQrrQQ',
            '.QQQQQQQQQQQQQQQQQQQQQQQQQQ',
            '.qqqqqqqqqqqqqqqqqqqqqqqqqq',
            '..rQ.....rQ.....rQ.....rQ',
            '..rQ.....rQ.....rQ.....rQ',
            '..rQ.....rQ.....rQ.....rQ',
            '.QrrQQQQQrrQQQQQrrQQQQQrrQQ',
            '.QQQQQQQQQQQQQQQQQQQQQQQQQQ',
            '.qqqqqqqqqqqqqqqqqqqqqqqqqq',
            '..rQ.....rQ.....rQ.....rQ',
            '..rQ.....rQ.....rQ.....rQ',
            '..qq.....qq.....qq.....qq']
    return render(rows, {'q': '#3e2412', 'Q': '#6b4f2a', 'r': '#a07a44', 'u': '#ece2c6', 'U': '#c9b37e'}, 32, outline=True)


def zone_trap():
    rows = ['', '', '',
            '...w.w.w.w',
            '..GwGwGwGwG',
            '.G.........G',
            '.G..KKKKK..G',
            '.G..KyEyK..G',
            '.G..KKKKK..G',
            '.G.........G',
            '..GwGwGwGwG',
            '...w.w.w.w']
    return render(rows, {'G': '#5e5a66', 'w': '#dde4ea', 'K': '#2c323a', 'y': '#7ad04b', 'E': '#c8ff70'}, 16, outline=True)


ZONES = {'poison': zone_poison, 'oil': zone_oil, 'storm_cloud': storm_cloud, 'barrier': zone_barrier, 'trap': zone_trap}


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for k, fn in PROJECTILES.items():
        made['proj_' + k] = fn()
    made['fx_hit'] = hit_frames()
    made['fx_slash'] = slash_frames()
    made['fx_explosion'] = explosion_frames()
    made['fx_strike'] = strike_frames()
    for k, (rows, pal) in AILMENTS.items():
        made['ail_' + k] = render(rows, pal, 8, outline=True)
    for k, fn in ZONES.items():
        made['zone_' + k] = fn()
    for k, im in made.items():
        im.save(os.path.join(OUT, k + '.png'))
    preview(made)
    print(len(made), 'images')


def preview(made):
    """Everything on grass/dirt tiles at 2x: projectiles, then the effect strips, ailments and zones."""
    tiles = Image.open(os.path.join(OUT, 'tiles.png'))
    meta = json.load(open(os.path.join(OUT, 'tiles.json')))
    def tile(name):
        i, c = meta['tiles'][name], meta['columns']
        return tiles.crop(((i % c) * 64, (i // c) * 64, (i % c) * 64 + 64, (i // c) * 64 + 64))
    W, H = 8, 5
    bg = Image.new('RGBA', (W * 64, H * 64))
    for y in range(H):
        for x in range(W):
            bg.paste(tile(('dirt_%d' if y in (2, 3) else 'grass_%d') % ((y % 4) * 4 + x % 4)), (x * 64, y * 64))
    def at(im, x, y):
        bg.alpha_composite(im, (x + (64 - min(im.width, 64)) // 2 if im.width <= 64 else x, y + (64 - im.height) // 2))
    projs = [k for k in made if k.startswith('proj_')]
    for i, k in enumerate(projs):
        at(made[k], (i % 8) * 64, (i // 8) * 64)
    at(made['fx_hit'], 0, 128); at(made['fx_slash'], 192 - 64, 128)
    at(made['fx_explosion'], 192, 192)
    bg.alpha_composite(made['fx_strike'], (0, 128))
    for i, k in enumerate(['ail_bleed', 'ail_burn', 'ail_poison', 'ail_slow', 'ail_freeze', 'ail_shock']):
        bg.alpha_composite(made[k], (8 + i * 22, 220))
    for i, k in enumerate(['zone_poison', 'zone_oil', 'zone_storm_cloud', 'zone_barrier', 'zone_trap']):
        at(made[k], 64 * (i + 1) if i < 4 else 0, 256 if i < 4 else 256)
    bg.resize((bg.width * 2, bg.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-effects.png'))


if __name__ == '__main__':
    main()
