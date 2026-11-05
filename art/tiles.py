"""Terrain tileset for Test TBD: 64x64 tiles of chunky pixel art (32x32 art pixels, each 2x2 on screen), from a fixed palette.

Run:  python3 art/tiles.py      (writes art/out/tiles.png, art/out/tiles.json and art/out/preview-*.png)

Rules this follows (the style guide for everything else too):
- one fixed palette (PALETTE), 3 to 5 shades per material;
- light comes from the top left: lit edges face up/left, shadows fall down/right;
- shapes are clusters, never single noisy pixels (a clean-up pass removes stray pixels);
- every ground tile tiles seamlessly with itself and with its neighbours.
"""
import json, math, os, random
import numpy as np
from PIL import Image

# Every tile is a 64x64 image, but the art is drawn at a lower resolution and scaled up with hard edges, so one art pixel
# is a P x P block on screen (the chunky, Minecraft-like look). P = 4: 16x16 art pixels per tile; P = 2: 32x32.
# Run with an argument to try another: python3 art/tiles.py 2
import sys
TILE = 64
P = int(sys.argv[1]) if len(sys.argv) > 1 else 2
T = TILE // P                       # art pixels per tile
SC = T / 64                         # sizes below are written for 64 art pixels per tile and scaled by this
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# ---- Palette -------------------------------------------------------------------------------------------------------
PALETTE = {
    'ink': '#121a14',
    # grass
    'g0': '#25522f', 'g1': '#356b3a', 'g2': '#4a8a40', 'g3': '#5fa346', 'g4': '#8fc653', 'g5': '#c2e271',
    # forest floor (outside the map)
    'f0': '#14271a', 'f1': '#1c3823', 'f2': '#264a2d', 'f3': '#325d36',
    # dirt path
    'd0': '#4d3220', 'd1': '#6f4c2e', 'd2': '#916741', 'd3': '#ad8253', 'd4': '#c8a16a', 'd5': '#e3c58d',
    # stone
    's0': '#262a31', 's1': '#3e434d', 's2': '#5d6370', 's3': '#858c99', 's4': '#b4bac4',
    # wood
    'w0': '#2e1d12', 'w1': '#4a301d', 'w2': '#6b4528',
    # tree leaves
    'l0': '#173420', 'l1': '#22502c', 'l2': '#326d36', 'l3': '#4c9040', 'l4': '#7bb853',
    # accents
    'red': '#d9574e', 'yel': '#f0cf5f', 'pur': '#b48be6', 'wht': '#efeadb', 'pink': '#e89bb0', 'cap': '#c2463e',
}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in PALETTE.items()}


def to_image(grid):
    """grid: 2D list/array of palette keys (or None for transparent) -> RGBA image."""
    h, w = len(grid), len(grid[0])
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            k = grid[y][x]
            if k:
                px[x, y] = RGB[k] + (255,)
    return img.resize((w * P, h * P), Image.NEAREST)


# ---- Seamless noise ------------------------------------------------------------------------------------------------
def periodic_noise(seed, cells, size=T):
    """Smooth value noise that wraps around (so tiles are seamless), values 0..1."""
    rng = np.random.default_rng(seed)
    lat = rng.random((cells, cells))
    out = np.zeros((size, size))
    for y in range(size):
        for x in range(size):
            fx, fy = x * cells / size, y * cells / size
            x0, y0 = int(fx) % cells, int(fy) % cells
            x1, y1 = (x0 + 1) % cells, (y0 + 1) % cells
            tx, ty = fx - int(fx), fy - int(fy)
            sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            a = lat[y0, x0] + (lat[y0, x1] - lat[y0, x0]) * sx
            b = lat[y1, x0] + (lat[y1, x1] - lat[y1, x0]) * sx
            out[y, x] = a + (b - a) * sy
    return out


def fbm(seed, size=T):
    return 0.65 * periodic_noise(seed, 4, size) + 0.35 * periodic_noise(seed + 1, 8, size)


def clean(grid, passes=2):
    """Removes stray pixels: a pixel that matches none of its 4 neighbours takes the most common neighbour (wrapping)."""
    h, w = len(grid), len(grid[0])
    for _ in range(passes):
        new = [row[:] for row in grid]
        for y in range(h):
            for x in range(w):
                n = [grid[(y - 1) % h][x], grid[(y + 1) % h][x], grid[y][(x - 1) % w], grid[y][(x + 1) % w]]
                if grid[y][x] not in n:
                    new[y][x] = max(set(n), key=n.count)
        grid = new
    return grid


def shade(field, keys, cuts):
    """Maps a 0..1 field to palette keys: keys[i] where field < cuts[i] (last key for the rest)."""
    out = []
    for row in field:
        r = []
        for v in row:
            k = keys[-1]
            for i, c in enumerate(cuts):
                if v < c:
                    k = keys[i]
                    break
            r.append(k)
        out.append(r)
    return out


def stamp(grid, x, y, pattern, wrap=True):
    """pattern: list of strings; each char maps through the legend below ('.' = leave)."""
    h, w = len(grid), len(grid[0])
    for dy, line in enumerate(pattern):
        for dx, ch in enumerate(line):
            if ch == '.':
                continue
            px, py = x + dx, y + dy
            if wrap:
                px, py = px % w, py % h
            elif not (0 <= px < w and 0 <= py < h):
                continue
            grid[py][px] = LEGEND.get(ch, ch)


LEGEND = {'5': 'g5', '4': 'g4', '3': 'g3', '2': 'g2', '1': 'g1', '0': 'g0', 'a': 'f0', 'b': 'f2', 'c': 'f3'}

# ---- Ground textures ----------------------------------------------------------------------------------------------------
# Grass, dirt and forest floor are each ONE seamless texture of 4x4 tiles (256x256), cut into 16 tiles. Neighbouring slices
# join perfectly and the pattern only repeats every 4 tiles; the game picks the slice by the tile's position (x % 4, y % 4).
M = 4 * T
CHUNKY = P >= 4
TUFTS = [['4', '1'], ['5', '3'], ['4.4', '1.1']] if CHUNKY else [['5.5', '434', '.1.'], ['.5.', '434', '313', '.1.']]
FLOWER = ['c', '1'] if CHUNKY else ['.c.', 'cxc', '.1.']


def macro(seed, keys, cuts, tufts=0, tuft_keys=None, flowers=0, specks=None, sprinkle=0.05):
    """One seamless 4x4-tile texture: soft patches of three shades, a light sprinkle of single lighter and darker pixels
    (the grainy block texture), then tufts, flowers and pebbles."""
    field = 0.7 * periodic_noise(seed, 7, M) + 0.3 * periodic_noise(seed + 1, 18, M)
    g = clean(shade(field, list(keys), list(cuts)), passes=1)
    rng = random.Random(seed)
    order = list(keys)
    for y in range(M):
        for x in range(M):
            r = rng.random()
            i = order.index(g[y][x])
            if r < sprinkle and i + 1 < len(order): g[y][x] = order[i + 1]
            elif r < sprinkle * 2 and i > 0: g[y][x] = order[i - 1]
    gap = max(3, round(10 * SC))
    spots = []
    for _ in range(tufts):
        for _try in range(40):
            x, y = rng.randrange(M), rng.randrange(M)
            if all(min(abs(x - sx), M - abs(x - sx)) + min(abs(y - sy), M - abs(y - sy)) > gap for sx, sy in spots):
                spots.append((x, y)); break
    for x, y in spots:
        pat = rng.choice(TUFTS)
        if tuft_keys:
            pat = [''.join(tuft_keys.get(c, c) for c in line) for line in pat]
        stamp(g, x, y, pat)
    for _ in range(flowers):                       # small clumps of 2 or 3 flowers of one colour
        x, y, col = rng.randrange(M), rng.randrange(M), rng.choice(['wht', 'yel', 'pink'])
        step = 2 if CHUNKY else 3
        for dx, dy in [(0, 0), (step, 1), (-step + 1, step)][:rng.randrange(2, 4)]:
            for yy, line in enumerate(FLOWER):
                for xx, ch in enumerate(line):
                    px, py = (x + dx + xx) % M, (y + dy + yy) % M
                    if ch == 'c': g[py][px] = col
                    elif ch == 'x': g[py][px] = 'yel' if col != 'yel' else 'wht'
                    elif ch == '1': g[py][px] = 'g1'
    if specks:                                     # pebbles or the like: (count, patterns as palette-key rows)
        count, pats = specks
        for _ in range(count):
            x, y, pat = rng.randrange(M), rng.randrange(M), rng.choice(pats)
            for yy, row in enumerate(pat):
                for xx, k in enumerate(row):
                    if k: g[(y + yy) % M][(x + xx) % M] = k
    return g


def slices(g):
    return [[[g[sy * T + y][sx * T + x] for x in range(T)] for y in range(T)] for sy in range(4) for sx in range(4)]


PEBBLES = ([[['d4'], ['d0']], [['d5', 'd3']], [['s3'], ['s0']]] if CHUNKY else
           [[['d4', 'd3'], ['d3', 'd0']], [[None, 'd5', 'd4', None], ['d5', 'd4', 'd4', 'd3'], ['d4', 'd3', 'd3', 'd0'], [None, 'd0', 'd0', None]],
            [['s3', 's2'], ['s2', 's0']]])


def grass_macro():
    return macro(1, ['g1', 'g2', 'g3'], [0.15, 0.87], tufts=40, flowers=6)


def dirt_macro():
    return macro(7, ['d1', 'd2', 'd3'], [0.2, 0.8], specks=(22, PEBBLES))


def forest_macro():
    return macro(5, ['f1', 'f2', 'f3'], [0.15, 0.87], tufts=30, tuft_keys={'5': '2', '4': 'c', '3': 'b', '1': 'a'})


# ---- Path: masks and edges, autotiled ----------------------------------------------------------------------------------
def edge_noise(seed, n=T):
    """Periodic 1D noise along an edge (so a border lines up with the same border on the next tile), in pixels: a slow
    wander of about +-4 so the path isn't straight, plus a pixel or two of jitter so the lip looks rough."""
    def octave(rng, k):
        pts = [rng.uniform(-1, 1) for _ in range(k)]
        out = []
        for i in range(n):
            f = i * k / n
            a, b = pts[int(f) % k], pts[(int(f) + 1) % k]
            t = f - int(f)
            t = t * t * (3 - 2 * t)
            out.append(a + (b - a) * t)
        return out
    rng = random.Random(seed)
    slow, mid, fine = octave(rng, 3), octave(rng, min(9, n // 2)), octave(rng, min(32, n // 2))
    amp = max(SC * 1.4, 0.35)
    return [round((4 * a + 1.5 * b + 0.9 * c) * amp) for a, b, c in zip(slow, mid, fine)]


BORDER = max(3, math.ceil(9 * SC))      # grass lip depth on a side with no path neighbour
CORNER_R = max(2, round(9 * SC))       # rounding of outer corners
INNER_R = max(2, round(8 * SC))        # grass bit in an inner corner


def path_parts(mask):
    """mask: dict of N,E,S,W (path neighbour on that side) and NE,SE,SW,NW (diagonal path neighbour; only matters when both
    sides next to it are path). Returns (dirt mask, edge overlay): where the dirt shows, and the lip and shadow pixels drawn
    on top (a lit lip where grass faces the light, a shadowed underside, and the shadow the lip casts on the dirt)."""
    nN, nE, nS, nW = edge_noise(11), edge_noise(12), edge_noise(13), edge_noise(14)
    dN = [max(1, BORDER + v) for v in nN]
    dS = [max(1, BORDER + v) for v in nS]
    dW = [max(1, BORDER + v) for v in nW]
    dE = [max(1, BORDER + v) for v in nE]
    is_grass = [[False] * T for _ in range(T)]
    for y in range(T):
        for x in range(T):
            g = False
            if not mask['N'] and y < dN[x]: g = True
            if not mask['S'] and T - 1 - y < dS[x]: g = True
            if not mask['W'] and x < dW[y]: g = True
            if not mask['E'] and T - 1 - x < dE[y]: g = True
            for cx, cy, a, b in ((0, 0, 'N', 'W'), (T - 1, 0, 'N', 'E'), (0, T - 1, 'S', 'W'), (T - 1, T - 1, 'S', 'E')):
                if not mask[a] and not mask[b]:
                    ox = BORDER + CORNER_R if cx == 0 else T - 1 - BORDER - CORNER_R
                    oy = BORDER + CORNER_R if cy == 0 else T - 1 - BORDER - CORNER_R
                    if (x < ox if cx == 0 else x > ox) and (y < oy if cy == 0 else y > oy) and (x - ox) ** 2 + (y - oy) ** 2 > CORNER_R ** 2:
                        g = True
            for cx, cy, a, b, d in ((0, 0, 'N', 'W', 'NW'), (T, 0, 'N', 'E', 'NE'), (0, T, 'S', 'W', 'SW'), (T, T, 'S', 'E', 'SE')):
                if mask[a] and mask[b] and not mask[d] and (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < INNER_R ** 2:
                    g = True
            is_grass[y][x] = g
    dirt_mask = [[not is_grass[y][x] for x in range(T)] for y in range(T)]
    edge = [[None] * T for _ in range(T)]
    for y in range(T):
        for x in range(T):
            if is_grass[y][x]:
                if (y + 1 < T and not is_grass[y + 1][x]) or (x + 1 < T and not is_grass[y][x + 1]): edge[y][x] = 'g1'
                if (y > 0 and not is_grass[y - 1][x]) or (x > 0 and not is_grass[y][x - 1]): edge[y][x] = 'g4'
            else:
                if (y > 0 and is_grass[y - 1][x]) or (x > 0 and is_grass[y][x - 1]): edge[y][x] = 'd0'
                elif not CHUNKY and ((y > 1 and is_grass[y - 2][x]) or (x > 1 and is_grass[y][x - 2])): edge[y][x] = 'd1'
    return dirt_mask, edge


def compose(grass_tile, dirt_tile, dirt_mask, edge):
    """One path tile as the game will draw it: grass, the dirt where the mask says, then the edge pixels."""
    return [[edge[y][x] or (dirt_tile[y][x] if dirt_mask[y][x] else grass_tile[y][x]) for x in range(T)] for y in range(T)]


def canonical(mask):
    """Diagonals only matter when both sides next to them are path; drop the rest. 47 canonical masks in all."""
    m = dict(mask)
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not (m[a] and m[b]):
            m[d] = False
    return m


def mask_key(m):
    return ''.join(k for k in ('N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW') if m[k]) or 'none'


# ---- Decorations -----------------------------------------------------------------------------------------------------
def blob_sprite(size, circles, palette_keys, seed, outline='ink', light=(-0.6, -0.8), texture=0.22):
    """A rounded shape made of circles, shaded by a light from the top left, with a clustered texture and a 1px outline."""
    rng = np.random.default_rng(seed)
    noise = periodic_noise(seed, max(2, size // 8), size)
    inside = np.zeros((size, size), bool)
    nx = np.zeros((size, size)); ny = np.zeros((size, size))
    for (cx, cy, r) in circles:
        for y in range(size):
            for x in range(size):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                if dx * dx + dy * dy <= r * r:
                    inside[y, x] = True
                    d = math.hypot(dx, dy) / r
                    if d > math.hypot(nx[y, x], ny[y, x]) - 1e-9 or not inside[y, x]:
                        nx[y, x], ny[y, x] = dx / r, dy / r
    lx, ly = light
    grid = [[None] * size for _ in range(size)]
    n = len(palette_keys)
    for y in range(size):
        for x in range(size):
            if not inside[y, x]:
                continue
            lit = -(nx[y, x] * lx + ny[y, x] * ly)                  # -1 (away) .. 1 (towards the light)
            v = 0.5 + 0.42 * lit + texture * (noise[y, x] - 0.5)
            i = max(0, min(n - 1, int(v * n)))
            grid[y][x] = palette_keys[i]
    grid = clean_sprite(grid)
    if outline:
        out = [row[:] for row in grid]
        for y in range(size):
            for x in range(size):
                if grid[y][x] is None and any(0 <= x + dx < size and 0 <= y + dy < size and grid[y + dy][x + dx] is not None
                                              for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = outline
        grid = out
    return grid


def clean_sprite(grid):
    h, w = len(grid), len(grid[0])
    new = [row[:] for row in grid]
    for y in range(h):
        for x in range(w):
            if grid[y][x] is None:
                continue
            n = [grid[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w and 0 <= y + dy < h and grid[y + dy][x + dx]]
            if n and grid[y][x] not in n:
                new[y][x] = max(set(n), key=n.count)
    return new


def ellipse_shadow(grid, cx, cy, rx, ry, key='g0'):
    for y in range(len(grid)):
        for x in range(len(grid[0])):
            if grid[y][x] is None and ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                grid[y][x] = key


def sc(v):
    return v * SC


def tree(seed):
    rng = random.Random(seed)
    S = T
    circles = [(32, 24, 17), (21, 30, 12), (43, 30, 12), (32, 36, 13), (25, 18, 10), (40, 17, 10)]
    circles = [(sc(x + rng.uniform(-1.5, 1.5)), sc(y + rng.uniform(-1.5, 1.5)), sc(r + rng.uniform(-1, 1))) for x, y, r in circles]
    canopy = blob_sprite(S, circles, ['l0', 'l1', 'l2', 'l3', 'l4'], seed, texture=0.35)
    grid = [[None] * S for _ in range(S)]
    ellipse_shadow(grid, sc(33), sc(57), sc(15), max(1.2, sc(4.5)), 'g0')
    x0, x1, y0, y1 = round(sc(28)), round(sc(37)), round(sc(40)), round(sc(57))
    for y in range(y0, y1):                        # trunk: lit left, dark right
        for x in range(x0, x1):
            f = (x - x0) / max(1, x1 - x0)
            grid[y][x] = 'w2' if f < 0.34 else ('w1' if f < 0.67 else 'w0')
    for y in range(S):
        for x in range(S):
            if canopy[y][x] is not None and y < round(sc(50)):
                grid[y][x] = canopy[y][x]
    for y in range(y0, y1):
        for x in (x0 - 1, x1):
            if grid[y][x] in (None, 'g0'):
                grid[y][x] = 'ink'
    return grid


def bush(seed):
    S = round(sc(32))
    circles = [(sc(16), sc(17), sc(9)), (sc(10), sc(20), sc(6.5)), (sc(22), sc(20), sc(6.5)), (sc(16), sc(12), sc(6))]
    g = blob_sprite(S, circles, ['l1', 'l2', 'l3', 'l4'], seed, texture=0.3)
    ellipse_shadow(g, sc(16.5), sc(27.5), sc(11), max(1, sc(3)), 'g0')
    rng = random.Random(seed)
    for _ in range(3 if not CHUNKY else 2):        # berries
        x, y = rng.randrange(round(sc(9)), round(sc(23))), rng.randrange(round(sc(10)), round(sc(22)))
        if g[y][x] not in (None, 'ink', 'g0'):
            g[y][x] = 'red'
            if not CHUNKY and g[y + 1][x] not in (None, 'ink'): g[y + 1][x] = 'cap'
    return g


def rock(seed):
    S = round(sc(32))
    circles = [(sc(15), sc(18), sc(9)), (sc(21), sc(20), sc(7)), (sc(11), sc(21), sc(6))]
    g = blob_sprite(S, circles, ['s0', 's1', 's2', 's3', 's4'], seed, texture=0.18)
    ellipse_shadow(g, sc(16.5), sc(27), sc(12), max(1, sc(3)), 'g0')
    for x, y in ((14, 15), (15, 16), (15, 17), (16, 18), (17, 18)):     # a crack
        x, y = round(sc(x)), round(sc(y))
        if g[y][x] not in (None, 'ink'):
            g[y][x] = 's0'
    return g


def sprite(rows, key):
    return [[key.get(c) for c in r] for r in rows]


def flowers(seed):
    if CHUNKY:                                     # 8x8 art pixels
        return sprite(['........', '.w....y.', '.2...p3.', '..1..1..', '....y...', '.p..3...', '.3..1...', '.1......'],
                      {'w': 'wht', 'y': 'yel', 'p': 'pink', '1': 'g1', '2': 'g2', '3': 'g3'})
    S = 16
    g = [[None] * S for _ in range(S)]
    for (x, y, col) in ((3, 4, 'wht'), (9, 2, 'yel'), (11, 9, 'pink'), (4, 10, 'pur')):
        for dx, dy, k in ((0, 2, 'g2'), (0, 3, 'g1'), (1, 3, 'g3'), (-1, 3, 'g3')):
            if 0 <= x + dx < S and 0 <= y + dy < S:
                g[y + dy][x + dx] = k
        for dx, dy in ((0, -1), (1, 0), (-1, 0), (0, 1)):
            g[y + dy][x + dx] = col
        g[y][x] = 'yel' if col != 'yel' else 'd3'
    return g


def mushrooms(seed):
    if CHUNKY:
        return sprite(['........', '.rrr....', 'rwrrr...', 'ccccc.r.', '..w..rwr', '..w..ccc', '..1...w.', '......1.'],
                      {'r': 'red', 'c': 'cap', 'w': 'wht', '1': 'g1'})
    S = 16
    g = [[None] * S for _ in range(S)]
    for (x, y, w) in ((4, 6, 5), (10, 9, 4)):
        for dx in range(w):
            g[y][x + dx] = 'cap'
            g[y - 1][x + dx] = 'red' if 0 < dx < w - 1 else 'cap'
        g[y - 2][x + 1:x + w - 1] = ['red'] * (w - 2)
        g[y - 1][x + 1] = 'wht'
        for dy in (1, 2, 3):
            g[y + dy][x + w // 2] = 'wht'
            g[y + dy][x + w // 2 - 1] = 'd4' if dy < 3 else 'wht'
        g[y + 4][x + w // 2 - 1] = 'g1'; g[y + 4][x + w // 2] = 'g1'
    return g


# ---- Build -----------------------------------------------------------------------------------------------------------
def main():
    os.makedirs(OUT, exist_ok=True)
    grass_t, dirt_t, forest_t = slices(grass_macro()), slices(dirt_macro()), slices(forest_macro())
    masks = {}
    for bits in range(256):
        keys = ('N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW')
        m = canonical({k: bool(bits >> i & 1) for i, k in enumerate(keys)})
        masks.setdefault(mask_key(m), m)
    parts = {k: path_parts(m) for k, m in masks.items()}
    # Sheet: row 0-1 grass (16), rows 2-3 dirt (16), rows 4-5 forest (16), then the 47 path masks (white = dirt) and the
    # 47 path edges (the lip and shadow pixels drawn on top).
    names, imgs = [], []
    for i, t in enumerate(grass_t): names.append('grass_%d' % i); imgs.append(to_image(t))
    for i, t in enumerate(dirt_t): names.append('dirt_%d' % i); imgs.append(to_image(t))
    for i, t in enumerate(forest_t): names.append('forest_%d' % i); imgs.append(to_image(t))
    for k, (dm, edge) in parts.items():
        im = Image.new('RGBA', (T, T), (0, 0, 0, 0)); px = im.load()
        for y in range(T):
            for x in range(T):
                if dm[y][x]: px[x, y] = (255, 255, 255, 255)
        im = im.resize((TILE, TILE), Image.NEAREST)
        names.append('pathmask_' + k); imgs.append(im)
    for k, (dm, edge) in parts.items():
        names.append('pathedge_' + k); imgs.append(to_image(edge))
    cols = 8
    rows = math.ceil(len(imgs) / cols)
    sheet = Image.new('RGBA', (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for i, t in enumerate(imgs):
        sheet.paste(t, ((i % cols) * TILE, (i // cols) * TILE))
    sheet.save(os.path.join(OUT, 'tiles.png'))
    deco = {'tree': tree(21), 'tree_2': tree(22), 'bush': bush(23), 'rock': rock(24), 'flowers': flowers(25), 'mushrooms': mushrooms(26)}
    deco_imgs = {k: to_image(v) for k, v in deco.items()}
    for k, im in deco_imgs.items():
        im.save(os.path.join(OUT, 'deco_' + k + '.png'))
    json.dump({'size': TILE, 'artPixel': P, 'columns': cols, 'tiles': {n: i for i, n in enumerate(names)}, 'palette': PALETTE},
              open(os.path.join(OUT, 'tiles.json'), 'w'), indent=1)
    print(len(imgs), 'tiles,', len(parts), 'path variants')
    preview(grass_t, dirt_t, forest_t, parts, deco_imgs)


def preview(grass_t, dirt_t, forest_t, parts, deco):
    """A small map built from the tiles, the way the game will build a level, at 2x."""
    W, H = 12, 8
    path = [(0, 2), (1, 2), (2, 2), (3, 2), (3, 3), (3, 4), (3, 5), (4, 5), (5, 5), (6, 5), (7, 5), (7, 4), (7, 3), (7, 2), (8, 2), (9, 2), (10, 2), (10, 3),
            (10, 4), (10, 5), (11, 5)]
    on = set(path)
    img = Image.new('RGBA', (W * TILE, (H + 1) * TILE))
    for y in range(-1, H):
        for x in range(W):
            sl = (y % 4) * 4 + (x % 4)
            if y < 0:
                grid = forest_t[sl]
            elif (x, y) in on:
                m = {'N': (x, y - 1) in on, 'S': (x, y + 1) in on, 'E': (x + 1, y) in on or (x, y) == path[-1],
                     'W': (x - 1, y) in on or (x, y) == path[0],
                     'NE': (x + 1, y - 1) in on, 'SE': (x + 1, y + 1) in on, 'SW': (x - 1, y + 1) in on, 'NW': (x - 1, y - 1) in on}
                dm, edge = parts[mask_key(canonical(m))]
                grid = compose(grass_t[sl], dirt_t[sl], dm, edge)
            else:
                grid = grass_t[sl]
            img.paste(to_image(grid), (x * TILE, (y + 1) * TILE))
    for name, (x, y) in (('tree', (40, 0)), ('tree_2', (300, 4)), ('tree', (600, -8)), ('bush', (150, 410)), ('rock', (560, 190)),
                         ('flowers', (90, 300)), ('mushrooms', (470, 430)), ('bush', (690, 300)), ('tree_2', (520, 440))):
        img.alpha_composite(deco[name], (x, y + 4))
    img.resize((img.width * 2, img.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-map.png'))
    sheet = Image.open(os.path.join(OUT, 'tiles.png'))
    bg = Image.new('RGBA', sheet.size, (24, 34, 27, 255)); bg.alpha_composite(sheet)
    bg.resize((bg.width * 2, bg.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-sheet.png'))


if __name__ == '__main__':
    main()
