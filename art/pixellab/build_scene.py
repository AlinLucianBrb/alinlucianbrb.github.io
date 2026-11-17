"""The menu background in the game's own art: a forest clearing at night, made from the match's tileset and scenery, with
the heroes resting around a campfire beside a tent. Writes assets/ui_scene.png (1600x900).

Run:  python3 art/pixellab/build_scene.py

Like the match, the art is drawn smaller than it was made (tiles at 48 px, heroes at about half size, smoothed), so it
keeps its detail but reads as low resolution. The centre is left calm: the menu panel sits there.
Sources: assets/terrain.png + terrain.json, assets/deco2_*.png, art/pixellab/anim_<hero>_idle.png (frame 0),
art/pixellab/ui/campfire.png and tent.png (Pixel Lab, styled on the Paladin).
"""
import json, math, os, random
from PIL import Image, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
A = lambda *p: os.path.join(ROOT, 'assets', *p)
W, H, T = 1600, 900, 48


def scaled(im, s):
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def hero(name, s=0.5, flip=False):
    sheet = Image.open(os.path.join(HERE, 'anim_' + name + '_idle.png')).convert('RGBA')
    f = sheet.crop((0, 0, sheet.height, sheet.height))
    f = f.crop(f.getbbox())
    if flip: f = f.transpose(Image.FLIP_LEFT_RIGHT)
    return scaled(f, s)


def main():
    rnd = random.Random(7)
    meta = json.load(open(A('terrain.json'))); sheet = Image.open(A('terrain.png')).convert('RGBA')
    TS, cols = meta['size'], meta['columns']
    def tile(name):
        i = meta['tiles'][name]; return sheet.crop(((i % cols) * TS, (i // cols) * TS, (i % cols) * TS + TS, (i // cols) * TS + TS))
    cache = {}
    def tl(name):
        if name not in cache: cache[name] = scaled(tile(name), T / TS)
        return cache[name]
    gw, gh = W // T + 2, H // T + 2
    # the road: a vertex grid (dual grid), True = grass. A path comes in at the bottom, bends and leaves at the top right.
    grass = [[True] * (gw + 1) for _ in range(gh + 1)]
    pts = [(17.5, gh + 1), (17, 15), (19, 12), (24, 10), (27, 6), (28, 2), (30, -1)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for k in range(60):
            t = k / 59; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
            for vx in (math.floor(x), math.floor(x) + 1):
                vy = round(y)
                if 0 <= vy <= gh and 0 <= vx <= gw: grass[vy][vx] = False
    # the forest floor (darker tiles) away from the clearing in the middle
    def forest(x, y):
        dx = (x * T - W / 2) / (W * 0.5); dy = (y * T - H * 0.55) / (H * 0.55)
        return dx * dx + dy * dy > 0.95
    img = Image.new('RGBA', (W, H), (20, 30, 20, 255))
    for y in range(gh):
        for x in range(gw):
            m = grass[y][x] * 8 + grass[y][x + 1] * 4 + grass[y + 1][x] * 2 + grass[y + 1][x + 1]
            p = 'g'
            name = p + str(m)
            if m == 15 and rnd.random() < 0.55: name = p + '15_' + str(rnd.randint(1, 6))
            if m == 0 and rnd.random() < 0.4: name = p + '0_' + str(rnd.randint(1, 3))
            img.alpha_composite(tl(name), (x * T - T // 2, y * T - T // 2))
    # scenery, sorted by their feet so nearer things cover farther ones
    oak, pine = Image.open(A('deco2_tree_oak.png')).convert('RGBA'), Image.open(A('deco2_tree_pine.png')).convert('RGBA')
    bush, rock = Image.open(A('deco2_bush.png')).convert('RGBA'), Image.open(A('deco2_rock.png')).convert('RGBA')
    flowers, shrooms = Image.open(A('deco2_flowers.png')).convert('RGBA'), Image.open(A('deco2_mushrooms.png')).convert('RGBA')
    items = []
    def on_road(x, y):
        vx, vy = int(x / T + 0.5), int(y / T + 0.5)
        return 0 <= vy <= gh and 0 <= vx <= gw and not grass[vy][vx]
    # the forest: dense at the edges, none in the clearing or on the road
    for _ in range(6000):
        x, y = rnd.uniform(-40, W + 40), rnd.uniform(-60, H + 80)
        dx = (x - W / 2) / (W * 0.44); dy = (y - H * 0.56) / (H * 0.42); r = dx * dx + dy * dy
        if r < 1.0 or on_road(x, y) or on_road(x, y - 20): continue
        if math.hypot(x - 320, (y - 680) * 1.4) < 210 or math.hypot(x - 1260, (y - 680) * 1.4) < 170: continue   # the camps
        if rnd.random() > min(1, (r - 1.0) * 2.2): continue
        if any(abs(x - ix) < 40 and abs(y - iy) < 22 for (ix, iy, _) in items): continue
        im = oak if rnd.random() < 0.45 else pine
        items.append((x, y, scaled(im, rnd.uniform(0.8, 1.05))))
    # small things in the clearing
    for im, n, s in ((bush, 8, 0.6), (rock, 5, 0.45), (flowers, 9, 0.5), (shrooms, 6, 0.45)):
        k = 0
        while k < n:
            x, y = rnd.uniform(60, W - 60), rnd.uniform(120, H - 40)
            dx = (x - W / 2) / (W * 0.44); dy = (y - H * 0.56) / (H * 0.42)
            if dx * dx + dy * dy > 0.95 or on_road(x, y) or (abs(x - W / 2) < 260 and y < 760) or abs(x - 330) < 190 and abs(y - 600) < 140: continue
            items.append((x, y, scaled(im, s * rnd.uniform(0.85, 1.1)))); k += 1
    # the camp: a tent, the fire, and the heroes around it (left of the menu)
    fx, fy = 330, 640
    items.append((205, 560, scaled(Image.open(os.path.join(HERE, 'ui', 'tent.png')).convert('RGBA'), 1.15)))
    fire = scaled(Image.open(os.path.join(HERE, 'ui', 'campfire.png')).convert('RGBA'), 0.85)
    items.append((fx, fy + 10, fire))
    for name, x, y, flip in (('warrior', 240, 640, False), ('mage', 425, 628, True), ('priest', 280, 730, False), ('ranger', 395, 738, True),
                             ('paladin', 1255, 700, True), ('shaman', 1335, 645, True), ('rogue', 1180, 618, False)):
        items.append((x, y, hero(name, 0.72, flip)))
    for (x, y, im) in sorted(items, key=lambda t: t[1]):
        # a soft shadow under each thing
        sh = Image.new('RGBA', (im.width, max(6, im.height // 6)), (0, 0, 0, 0))
        img.alpha_composite(im, (round(x - im.width / 2), round(y - im.height)))
    # night: cool and dark, then the fire's warm light
    night = Image.new('RGBA', (W, H), (105, 125, 180, 255))
    img = ImageChops.multiply(img, night)
    light = Image.new('L', (W, H), 0); lp = light.load()
    for y in range(H):
        for x in range(0, W):
            for (cx, cy, r, k) in ((fx, fy - 10, 380, 1.0), (1260, 660, 260, 0.3)):
                d = math.hypot(x - cx, (y - cy) * 1.3) / r
                if d < 1: lp[x, y] = min(255, lp[x, y] + int(255 * k * (1 - d) ** 1.6))
    warm = Image.new('RGBA', (W, H), (255, 170, 90, 255))
    base = img.copy()
    lit = ImageChops.multiply(base, Image.new('RGBA', (W, H), (255, 255, 255, 255)))
    lit = ImageChops.screen(ImageChops.multiply(base, Image.new('RGBA', (W, H), (330 // 2, 250 // 2, 170 // 2, 255))), base)
    lit = ImageChops.add(lit, ImageChops.multiply(base, warm), scale=1.0)
    img = Image.composite(lit, img, light)
    # the fire itself stays bright (drawn again on top, unlit)
    img.alpha_composite(fire, (round(fx - fire.width / 2), round(fy + 10 - fire.height)))
    # a soft vignette
    vig = Image.new('L', (W, H), 0); vp = vig.load()
    for y in range(H):
        for x in range(W):
            d = math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
            vp[x, y] = int(min(255, max(0, (d - 0.75) * 300)))
    img = Image.composite(Image.new('RGBA', (W, H), (6, 8, 12, 255)), img, vig.point(lambda v: v * 0.6))
    img.convert('RGB').save(A('ui_scene.png'))
    overlays(fx, fy)
    print('ui_scene.png', img.size)



def overlays(fx, fy):
    """The fire's moving parts, as see-through layers the same size as the scene (the CSS lays them over it with the same
    cover/centre-bottom fit, so they stay on the fire at any window size): ui_scene_glow.png, a warm light that flickers;
    ui_scene_embers_0..3.png, 4 frames of sparks rising from the fire."""
    glow = Image.new('RGBA', (W, H)); gp = glow.load()
    for y in range(max(0, fy - 260), min(H, fy + 200)):
        for x in range(max(0, fx - 300), min(W, fx + 300)):
            d = math.hypot(x - fx, (y - fy + 20) * 1.3) / 280
            if d < 1: gp[x, y] = (255, 160, 70, int(110 * (1 - d) ** 2))
    glow.save(A('ui_scene_glow.png'))
    rnd = random.Random(5)
    sparks = [(rnd.uniform(-14, 14), rnd.uniform(0, 1), rnd.uniform(0.6, 1.4), rnd.uniform(-8, 8)) for _ in range(30)]
    for f in range(4):
        sheet = Image.new('RGBA', (W, H)); sp = sheet.load()
        for (dx, ph, sz, drift) in sparks:
            t = (ph + f / 4) % 1
            x = round(fx + dx + drift * t + math.sin(t * 6 + dx) * 4); y = round(fy - 40 - t * 170)
            a = int(255 * (1 - t))
            c = (255, 220, 120, a) if t < 0.4 else (255, 140, 60, a)
            for (ox, oy) in ((0, 0), (1, 0), (0, 1), (1, 1)) if sz > 1 else ((0, 0), (1, 0)):
                if 0 <= x + ox < W and 0 <= y + oy < H: sp[x + ox, y + oy] = c
        sheet.save(A('ui_scene_embers_%d.png' % f))


if __name__ == '__main__':
    main()
