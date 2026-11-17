"""Zone pictures and page banners in the game's own art (the match tileset, trees, heroes and enemies), graded per zone.

Run:  python3 art/pixellab/build_levels.py

Writes:
  assets/level_1.png .. level_5.png   (640x320) each zone's picture, on its level cards: a road through the zone with
                                       its enemies marching along it
  assets/banner_heroes.png  (1200x200) the nine heroes lined up at dusk, for the Heroes page
  assets/banner_camp.png    (1200x200) the heroes' camp at night, for the other pages (inventory, talents, leaderboard...)
Zone grading: 1 Green Meadow (bright day), 2 Deep Forest (dense, dark green), 3 Mire (violet fog, mushrooms),
4 Red Canyon (red earth, rocks, few trees), 5 Ashlands (grey ash, ember glow).
"""
import colorsys, json, math, os, random
from PIL import Image, ImageChops, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)


def scaled(im, s):
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def frame0(name, size=160):
    sh = Image.open(A(name + '.png')).convert('RGBA')
    f = sh.crop((0, 0, size, size)); return f.crop(f.getbbox())


def hero(name):
    sh = Image.open(os.path.join(HERE, 'anim_' + name + '_idle.png')).convert('RGBA')
    f = sh.crop((0, 0, sh.height, sh.height)); return f.crop(f.getbbox())


class Ground:
    def __init__(self, W, H, T, road, seed):
        meta = json.load(open(A('terrain.json'))); sheet = Image.open(A('terrain.png')).convert('RGBA')
        TS, cols = meta['size'], meta['columns']; self.cache = {}
        def tile(n):
            if n not in self.cache:
                i = meta['tiles'][n]
                self.cache[n] = scaled(sheet.crop(((i % cols) * TS, (i // cols) * TS, (i % cols) * TS + TS, (i // cols) * TS + TS)), T / TS)
            return self.cache[n]
        rnd = random.Random(seed)
        gw, gh = W // T + 2, H // T + 2
        self.grass = g = [[True] * (gw + 1) for _ in range(gh + 1)]
        for (x0, y0), (x1, y1) in zip(road, road[1:]):
            for k in range(80):
                t = k / 79; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
                for vx in (math.floor(x), math.floor(x) + 1):
                    vy = round(y)
                    if 0 <= vy <= gh and 0 <= vx <= gw: g[vy][vx] = False
        self.img = Image.new('RGBA', (W, H), (20, 30, 20, 255)); self.T = T
        for y in range(gh):
            for x in range(gw):
                m = g[y][x] * 8 + g[y][x + 1] * 4 + g[y + 1][x] * 2 + g[y + 1][x + 1]
                n = 'g' + str(m)
                if m == 15 and rnd.random() < 0.55: n = 'g15_' + str(rnd.randint(1, 6))
                if m == 0 and rnd.random() < 0.4: n = 'g0_' + str(rnd.randint(1, 3))
                self.img.alpha_composite(tile(n), (x * T - T // 2, y * T - T // 2))

    def on_road(self, x, y):
        vx, vy = int(x / self.T + 0.5), int(y / self.T + 0.5)
        g = self.grass
        return 0 <= vy < len(g) and 0 <= vx < len(g[0]) and not g[vy][vx]


def grade(img, zone):
    """The zone's light and colour: a per-pixel hue/saturation/value change, then a tint."""
    if zone == 1: return img
    px = img.load(); W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if zone == 2: s *= 1.05; v *= 0.62; h = h + 0.02 if 0.15 < h < 0.5 else h
            elif zone == 3:
                if 0.12 < h < 0.5: h = 0.2 + (h - 0.2) * 0.4; s *= 0.55
                v *= 0.6
            elif zone == 4:
                if 0.12 < h < 0.5: h = 0.07 + (h - 0.25) * 0.15; s *= 0.8
                v *= 0.9
            elif zone == 5:
                s *= 0.25; v *= 0.8
            r, g, b = colorsys.hsv_to_rgb(h % 1, min(1, s), min(1, v))
            px[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    tint = {2: (20, 40, 34), 3: (50, 30, 66), 4: (40, 16, 6), 5: (34, 12, 6)}[zone]
    return ImageChops.add(img, Image.new('RGBA', img.size, tint + (0,)), scale=2.2)


def fog(img, color, amount, seed):
    rnd = random.Random(seed); W, H = img.size
    f = Image.new('L', (W // 8, H // 8))
    fp = f.load()
    for y in range(f.height):
        for x in range(f.width): fp[x, y] = int(255 * amount * (0.5 + 0.5 * math.sin(x * 0.35 + rnd.random()) * math.sin(y * 0.6)))
    f = f.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
    return Image.composite(Image.new('RGBA', (W, H), color + (255,)), img, f)


def level_picture(zone, W=640, H=320):
    rnd = random.Random(zone * 13)
    T = 44
    road = [(-1, 4.6), (4, 4.2), (7, 5.6), (10, 5.0), (12, 3.2), (15.5, 3.6)]
    gd = Ground(W, H, T, road, zone)
    img = gd.img
    oak, pine = Image.open(A('deco2_tree_oak.png')).convert('RGBA'), Image.open(A('deco2_tree_pine.png')).convert('RGBA')
    rock, bush = Image.open(A('deco2_rock.png')).convert('RGBA'), Image.open(A('deco2_bush.png')).convert('RGBA')
    shrooms, flowers = Image.open(A('deco2_mushrooms.png')).convert('RGBA'), Image.open(A('deco2_flowers.png')).convert('RGBA')
    density = {1: 0.22, 2: 0.8, 3: 0.45, 4: 0.12, 5: 0.12}[zone]
    items = []
    for _ in range(1600):
        x, y = rnd.uniform(-30, W + 30), rnd.uniform(-20, H + 60)
        if any(gd.on_road(x + dx, y - k) for k in range(-10, 110, 12) for dx in (-22, 0, 22)): continue   # nothing covers the road
        edge = min(y, H - y, x, W - x) / 90
        if rnd.random() > density * (1.3 - min(1, edge)): continue
        if any(abs(x - ix) < 34 and abs(y - iy) < 18 for (ix, iy, _) in items): continue
        r = rnd.random()
        if zone in (4, 5): im = rock if r < 0.85 else pine
        elif zone == 3: im = oak if r < 0.5 else (shrooms if r < 0.8 else bush)
        else: im = oak if r < 0.45 else pine
        s = 0.42 if im is rock else 0.5 if im in (shrooms, bush) else rnd.uniform(0.72, 0.9)
        items.append((x, y, scaled(im, s)))
    for _ in range({1: 10, 2: 3, 3: 4, 4: 2, 5: 0}[zone]):
        x, y = rnd.uniform(20, W - 20), rnd.uniform(40, H - 20)
        if not gd.on_road(x, y): items.append((x, y, scaled(flowers, 0.4)))
    # the zone's enemies on the road, marching to the left
    kinds = {1: ['goblin', 'goblin', 'orc'], 2: ['goblin', 'orc', 'orc', 'goblin'], 3: ['orc', 'troll', 'goblin'],
             4: ['orc', 'troll', 'troll'], 5: ['troll', 'warlord', 'orc']}[zone]
    for i, k in enumerate(kinds):
        x = 150 + i * 120 + rnd.uniform(-12, 12)
        # the road's middle at x: walk the polyline
        px_ = x / T
        for (x0, y0), (x1, y1) in zip(road, road[1:]):
            if x0 <= px_ <= x1: y = (y0 + (y1 - y0) * (px_ - x0) / (x1 - x0)) * T + 22; break
        s = {'goblin': 0.5, 'orc': 0.56, 'troll': 0.62, 'warlord': 0.66}[k]
        items.append((x, y, scaled(frame0('anim_' + k + '_walk').transpose(Image.FLIP_LEFT_RIGHT), s)))
    for (x, y, im) in sorted(items, key=lambda t: t[1]):
        img.alpha_composite(im, (round(x - im.width / 2), round(y - im.height)))
    img = grade(img, zone)
    if zone == 3: img = fog(img, (120, 100, 150), 0.35, 3)
    if zone == 5:
        glow = Image.new('L', (W, H)); gp = glow.load()
        for y in range(H):
            for x in range(W): gp[x, y] = int(110 * max(0, 1 - y / H * 1.6) * (0.6 + 0.4 * math.sin(x * 0.02)))
        img = Image.composite(Image.new('RGBA', (W, H), (255, 90, 40, 255)), img, glow.point(lambda v: v // 2))
        img = fog(img, (90, 80, 80), 0.25, 5)
    if zone == 2: img = fog(img, (40, 70, 60), 0.18, 2)
    return img.convert('RGB')


def banner_heroes(W=1200, H=200):
    T = 48
    gd = Ground(W, H, T, [(-1, 3.4), (26, 3.4)], 9)
    img = gd.img
    pine, oak = Image.open(A('deco2_tree_pine.png')).convert('RGBA'), Image.open(A('deco2_tree_oak.png')).convert('RGBA')
    rnd = random.Random(4); items = []
    for i in range(34):
        x = rnd.uniform(0, W); items.append((x, rnd.uniform(20, 60), scaled(pine if rnd.random() < 0.5 else oak, rnd.uniform(0.6, 0.8))))
    names = ['warrior', 'ranger', 'mage', 'rogue', 'druid', 'priest', 'warlock', 'paladin', 'shaman']
    for i, n in enumerate(names):
        h = scaled(hero(n), 0.62)
        if i >= 5: h = h.transpose(Image.FLIP_LEFT_RIGHT)
        x = W / 2 - 170 - (3 - i) * 100 if i < 4 else W / 2 + 150 + (i - 4) * 92   # four on the left, five on the right: a gap for the title
        items.append((x, 182, h))
    for (x, y, im) in sorted(items, key=lambda t: t[1]):
        img.alpha_composite(im, (round(x - im.width / 2), round(y - im.height)))
    # dusk: warm from the left, cooler and darker at the top
    grad = Image.new('RGBA', (W, H)); gp = grad.load()
    for y in range(H):
        for x in range(W):
            t = x / W
            gp[x, y] = (round(255 - 70 * t), round(205 - 60 * t), round(160 + 10 * t), 255)
    img = ImageChops.multiply(img, grad)
    return img.convert('RGB')


def banner_camp(W=1200, H=200):
    sc = Image.open(A('ui_scene.png')).convert('RGB')
    # the camp side of the menu scene, cropped to a strip
    return sc.crop((60, 470, 60 + W, 470 + H)) if sc.width >= W + 60 else sc.resize((W, round(sc.height * W / sc.width))).crop((0, 300, W, 300 + H))


def main():
    for z in range(1, 6):
        level_picture(z).save(A('level_%d.png' % z)); print('level', z)
    banner_heroes().save(A('banner_heroes.png'))
    banner_camp().save(A('banner_camp.png'))
    print('banners')


if __name__ == '__main__':
    main()
