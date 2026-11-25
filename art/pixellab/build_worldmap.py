"""The level-select map's art: each act's painted map, the Endless portal and the level flag.

Run:  python3 art/pixellab/build_worldmap.py

Sources (art/pixellab/worldmap/, Pixel Lab jobs in jobs.txt):
  act<N>.png   an act's painted map (458x256): the road and its five round stone stops are painted in
  portal.png   the Endless portal (64x64), shown only once the campaign is finished
  flag.png     the level flag (48x48), standing on each stop
  world.png    the world map (688x384): the five acts from left to right, the road, the citadel at the far right
  world_zones.json  the borders between the acts on world.png
Writes:
  assets/zonemap_<N>.png   the act's map, as painted
  assets/map_portal.png    the portal, cropped to its pixels
  assets/map_flag.png      the flag, cropped to its pixels
  assets/worldmap.png      the world map
  assets/worldfog_<N>.png  pixel-art fog over act N and the acts after it (shown while act N is the first locked one)
The stops' places (in % of the picture) are in ZONE_ART in js/content/world-map.js: after painting a new map, measure
the middle of each stone pad and write it there.
"""
import json, os, random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = lambda *p: os.path.join(HERE, 'worldmap', *p)
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)


def fill_edges(im):
    """Pixel Lab sometimes leaves an edge row or column see-through (a light line in the game): copy the next one in."""
    im = im.convert('RGBA')
    px = im.load()
    W, H = im.size
    for x in list(range(3)) + list(range(W - 3, W)):
        inner = x + 1 if x < W // 2 else x - 1
        for y in range(H):
            if px[x, y][3] < 255: px[x, y] = px[inner, y]
    for y in list(range(3)) + list(range(H - 3, H)):
        inner = y + 1 if y < H // 2 else y - 1
        for x in range(W):
            if px[x, y][3] < 255: px[x, y] = px[x, inner]
    return im


def crop(name, out):
    im = Image.open(SRC(name)).convert('RGBA')
    im = im.crop(im.getbbox())
    im.save(A(out))
    print(out, im.size)


def value_noise(w, h, cell, rng):
    """Smooth noise 0..1 on a w x h grid: random values on a coarse grid, blended."""
    gw, gh = w // cell + 2, h // cell + 2
    g = [[rng.random() for _ in range(gw)] for _ in range(gh)]
    out = [[0.0] * w for _ in range(h)]
    for y in range(h):
        fy, iy = (y / cell) % 1, y // cell
        sy = fy * fy * (3 - 2 * fy)
        for x in range(w):
            fx, ix = (x / cell) % 1, x // cell
            sx = fx * fx * (3 - 2 * fx)
            a = g[iy][ix] + (g[iy][ix + 1] - g[iy][ix]) * sx
            b = g[iy + 1][ix] + (g[iy + 1][ix + 1] - g[iy + 1][ix]) * sx
            out[y][x] = a + (b - a) * sy
    return out


def world_fog(size, borders):
    """The fog over the locked acts. Acts open in order, so the locked ones are always the last few: worldfog_<N>.png
    covers act N and every act after it, with a ragged cloudy edge on the left (over the last open act). Soft pixel
    clouds in a few tones, drawn at half size and scaled up; thin enough that big shapes (the citadel) still show."""
    W, H = size
    S = 2
    w, h = W // S, H // S
    rng = random.Random(7)
    octaves = [(value_noise(w, h, c, rng), k) for c, k in ((48, .5), (20, .3), (8, .2))]
    noise = [[sum(o[y][x] * k for o, k in octaves) for x in range(w)] for y in range(h)]
    tones = [(222, 224, 234), (196, 200, 216), (170, 176, 196), (146, 152, 176), (124, 130, 156)]
    reach = 28   # how far (in half-size pixels) the clouds spill over the left edge, and thin out inside it
    out = []
    for i in range(len(borders) + 1):
        left = [(0, 0), (0, 100)] if i == 0 else borders[i - 1]
        poly = [(x / 100 * w, y / 100 * h) for x, y in left] + [(w, h), (w, 0)]
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).polygon(poly, fill=255)
        mp = m.load()
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        px = im.load()
        for y in range(h):
            edge = next((x for x in range(w) if mp[x, y]), w)
            for x in range(max(0, edge - reach), w):
                n = noise[y][x]
                d = (x - edge) / reach   # -1 (furthest out) .. 0 (the border) .. 1 (well inside)
                if d < 1:   # around the border only the thick parts of the clouds show, fewer further out
                    if n < .5 - .3 * d: continue
                    a = 150 if d < 0 else 168 + int(70 * n * d)
                else:
                    a = 168 + int(70 * n)
                k = max(0, min(4, int((1 - n) * 5.5) - 1))
                px[x, y] = tones[k] + (a,)
        out.append(im.resize((W, H), Image.NEAREST))
    return out


if __name__ == '__main__':
    for n in range(1, 6):
        if not os.path.exists(SRC('act%d.png' % n)): continue
        im = fill_edges(Image.open(SRC('act%d.png' % n))).convert('RGB')
        im.save(A('zonemap_%d.png' % n))
        print('zonemap_%d.png' % n, im.size)
    crop('portal.png', 'map_portal.png')
    crop('flag.png', 'map_flag.png')
    world = fill_edges(Image.open(SRC('world.png'))).convert('RGB')
    world.save(A('worldmap.png'))
    print('worldmap.png', world.size)
    borders = json.load(open(SRC('world_zones.json'), encoding='utf-8'))['borders']
    for n, fog in enumerate(world_fog(world.size, borders), 1):
        fog.save(A('worldfog_%d.png' % n))
    print('worldfog_1..%d.png' % (len(borders) + 1))
