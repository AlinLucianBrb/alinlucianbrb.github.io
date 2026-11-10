"""Big pictures for Test TBD's menus: the game logo, the background scene behind the menus, and a small scene for each level
on the level screen.

Run:  python3 art/scenes.py      (writes art/out/ui_logo.png, ui_scene.png, level_1.png ... level_5.png and previews)

Everything is drawn at 1 art pixel per pixel with a seeded random generator (so a rebuild gives the same pictures), then
saved scaled up with nearest-neighbour: the logo 3x, the scene and level cards 4x. The scene is a dusk valley: a starry sky
and moon, two ranges of mountains, a keep with lit windows on a hill at the end of a winding dirt road (the gate the heroes
defend), pine woods and grass in front. Level cards use the same painter with their own palette and features:
1 Green Meadow, 2 Deep Forest, 3 Mire, 4 Red Canyon, 5 Ashlands.
"""
import os, random, math
from PIL import Image
from font import GLYPHS, rects

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
INK = (14, 20, 16)


def hexc(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 255)); self.px = self.img.load()

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.px[x, y] = tuple(c[:3]) + (255,)

    def get(self, x, y):
        return self.px[x, y][:3]

    def sky(self, stops, horizon):
        """Vertical gradient through the colour stops down to the horizon, banded with an ordered dither (pixel-art style)."""
        for y in range(self.h):
            t = min(1, y / max(1, horizon)) * (len(stops) - 1)
            i = min(len(stops) - 2, int(t)); f = t - i
            for x in range(self.w):
                band = 1 if f * 16 > BAYER[y % 4][x % 4] else 0
                k = i + band
                self.put(x, y, hexc(stops[min(k, len(stops) - 1)]))

    def ridge(self, base_y, amp, rough, color, rng, cap=None, cap_h=0):
        """A silhouette of hills or mountains from base_y up by amp, filled down to the bottom; optional snow caps."""
        c = hexc(color); peaks = []
        y = base_y - rng.random() * amp; heights = []
        for x in range(self.w):
            y += (rng.random() - 0.5) * rough
            y += (base_y - amp * 0.5 - y) * 0.02
            heights.append(max(base_y - amp, min(base_y, y)))
        for x, hy in enumerate(heights):
            top = int(hy)
            for yy in range(top, self.h): self.put(x, yy, c if yy > top else mix(c, (255, 255, 255), 0.12))
            if cap and top < base_y - amp * (1 - cap_h):
                for yy in range(top, min(self.h, top + 2 + int((base_y - amp * (1 - cap_h) - top) * 0.6))): self.put(x, yy, hexc(cap))
        return heights

    def mountains(self, base_y, amp, n, color, rng, snow=None):
        """A range of peaks: n summits joined by straight slopes with a little noise, a lit left face, snow on the tops."""
        c = hexc(color); xs = sorted(rng.uniform(0, self.w) for _ in range(n))
        pk = [(x, base_y - amp * (0.45 + 0.55 * rng.random())) for x in xs]
        pts = [(-20, base_y - amp * 0.3)] + pk + [(self.w + 20, base_y - amp * 0.3)]
        val = [(pts[i][1] + pts[i + 1][1]) / 2 + amp * 0.25 for i in range(len(pts) - 1)]
        prof = []
        for x in range(self.w):
            best = base_y
            for (px_, py_) in pk:
                best = min(best, py_ + abs(x - px_) * (0.9 + 0.2 * ((int(px_) % 3) / 2)))
            prof.append(best)
        rough = [hy + (rng.random() - 0.5) * 1.2 for hy in prof]
        for x, hy in enumerate(rough):
            top = int(hy)
            left = x > 0 and prof[x - 1] > prof[x]          # the slope faces the light (from the smooth profile)
            for yy in range(top, self.h):
                col = mix(c, (255, 255, 255), 0.1) if left else mix(c, (0, 0, 0), 0.12)
                if snow and yy - top < max(0, (base_y - amp * 0.62) - top) * 0.7: col = hexc(snow) if left else mix(hexc(snow), (0, 0, 0), 0.25)
                self.put(x, yy, col)
        return prof

    def disc(self, cx, cy, r, color, shade=None):
        for y in range(-r, r + 1):
            for x in range(-r, r + 1):
                if x * x + y * y <= r * r:
                    c = hexc(color)
                    if shade and x + y > r * 0.6: c = mix(c, hexc(shade), 0.6)
                    self.put(cx + x, cy + y, c)

    def pine(self, x, base, h, color, dark):
        c, d = hexc(color), hexc(dark)
        for i in range(h):
            half = max(0, int((i / h) * h * 0.38) - (1 if i % 3 == 0 else 0))
            for dx in range(-half, half + 1):
                self.put(x + dx, base - h + i, d if dx > half // 2 else c)
        for yy in range(base - 1, base + 2): self.put(x, yy, (60, 40, 24))

    def blob_tree(self, x, base, r, color, dark):
        self.put(x, base, (70, 46, 26)); self.put(x, base - 1, (70, 46, 26))
        for y in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + y * y <= r * r: self.put(x + dx, base - r - 1 + y, hexc(dark) if dx + y > r * 0.3 else hexc(color))

    def vignette(self, k=0.35):
        for y in range(self.h):
            for x in range(self.w):
                dx, dy = (x - self.w / 2) / (self.w / 2), (y - self.h / 2) / (self.h / 2)
                t = max(0, (dx * dx + dy * dy) - 0.55) * k
                if t > 0: self.put(x, y, mix(self.get(x, y), (6, 8, 10), min(0.7, t)))


def road(cv, pts, color, edge, width=3):
    """A winding road through the points (x, y), widening toward the bottom of the picture."""
    c, e = hexc(color), hexc(edge)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
            w = width + int((y / cv.h) * width * 1.6)
            for dx in range(-w, w + 1):
                cv.put(int(x + dx), int(y), e if abs(dx) == w else c)
                cv.put(int(x + dx), int(y) + 1, e if abs(dx) == w else c)


def keep(cv, x, base, rng):
    """A small castle: two towers, a wall with crenellations and a gate, lit windows, a banner."""
    stone, dark, lit = (88, 92, 104), (52, 54, 66), (255, 214, 120)
    def block(x0, y0, w, h):
        for yy in range(y0, y0 + h):
            for xx in range(x0, x0 + w):
                c = stone if (xx + (yy // 3)) % 7 else dark
                if xx == x0 + w - 1: c = dark
                cv.put(xx, yy, c)
        for xx in range(x0, x0 + w, 2): cv.put(xx, y0 - 1, stone)
    block(x - 14, base - 16, 28, 16)              # the wall
    block(x - 20, base - 28, 9, 28)               # towers
    block(x + 11, base - 28, 9, 28)
    block(x - 5, base - 34, 10, 22)               # the keep
    for yy in range(base - 8, base):              # the gate
        for xx in range(x - 3, x + 3): cv.put(xx, yy, (30, 22, 18) if yy > base - 7 or abs(xx - x + 0.5) < 2 else stone)
    for (wx, wy) in ((x - 16, base - 22), (x + 15, base - 22), (x - 1, base - 28), (x - 16, base - 14), (x + 15, base - 14)):
        cv.put(wx, wy, lit); cv.put(wx, wy + 1, lit)
    for yy in range(base - 44, base - 33): cv.put(x, yy, (60, 40, 24))       # the banner
    for yy in range(base - 44, base - 39):
        for xx in range(x + 1, x + 7 - (yy - (base - 44)) % 2): cv.put(xx, yy, (217, 87, 78))


def grass(cv, top, color, light, rng, flowers=None):
    c, l = hexc(color), hexc(light)
    for y in range(top, cv.h):
        for x in range(cv.w):
            if cv.get(x, y) == (0, 0, 0) or y >= top: pass
    for x in range(cv.w):
        for y in range(top, cv.h):
            v = rng.random()
            cv.put(x, y, l if v < 0.08 else mix(c, (0, 0, 0), 0.15) if v > 0.9 else c)
    for _ in range(cv.w // 3):
        x, y = rng.randrange(cv.w), rng.randrange(top + 1, cv.h)
        cv.put(x, y, l); cv.put(x, y - 1, l)
    if flowers:
        for _ in range(cv.w // 6):
            cv.put(rng.randrange(cv.w), rng.randrange(top + 2, cv.h), hexc(rng.choice(flowers)))


def stars(cv, n, top, rng):
    for _ in range(n):
        x, y = rng.randrange(cv.w), rng.randrange(top)
        c = (255, 255, 230) if rng.random() < 0.3 else (190, 200, 230)
        cv.put(x, y, c)
        if rng.random() < 0.08: cv.put(x + 1, y, c); cv.put(x - 1, y, c); cv.put(x, y + 1, c); cv.put(x, y - 1, c)


# ---- The menu scene ------------------------------------------------------------------------------------------------------
def menu_scene():
    rng = random.Random(7)
    cv = Canvas(320, 180)
    cv.sky(['#0b1028', '#1d1a44', '#3b2457', '#7a3a5a', '#d0664a', '#f2a65a'], 112)
    stars(cv, 140, 70, rng)
    cv.disc(62, 34, 11, '#f4ead2', '#c8bca0')
    for (x, y) in ((58, 30), (66, 38), (60, 40)): cv.put(x, y, (190, 180, 150))
    cv.mountains(116, 60, 7, '#3a2c55', rng, snow='#c8b8e0')
    cv.ridge(122, 26, 2.2, '#2a2a48', rng)
    hills = cv.ridge(136, 20, 1.6, '#1f3a34', rng)
    keep(cv, 236, int(hills[236]) + 2, rng)
    grass(cv, 150, '#2c5a2e', '#4f8a3a', rng, ['#ffd76a', '#f2a6d0', '#ffffff'])
    road(cv, [(236, int(hills[236]) + 3), (226, 140), (190, 148), (150, 152), (128, 160), (150, 172), (170, 182)], '#8a6038', '#5a3c22', 2)
    for x in (8, 22, 34, 288, 300, 312, 276):
        cv.pine(x, 152 + rng.randrange(6), 26 + rng.randrange(14), '#1d4a2c', '#12321e')
    for x in (52, 98, 262):
        cv.blob_tree(x, 150 + rng.randrange(4), 6 + rng.randrange(3), '#2f6a34', '#1d4a26')
    for (x, y) in ((214, 141), (232, 136)):                    # torches by the road
        cv.put(x, y, (255, 200, 90)); cv.put(x, y - 1, (255, 120, 60)); cv.put(x, y + 1, (60, 40, 24)); cv.put(x, y + 2, (60, 40, 24))
    cv.vignette(0.5)
    return cv.img


# ---- Level cards ---------------------------------------------------------------------------------------------------------
LEVELS = {
    1: dict(name='Green Meadow', sky=['#5aa0e0', '#8cc4f0', '#cfe8f8'], far='#7aa0c8', mid='#4f8a5a', ground='#4f9a3a', light='#8be25a',
            flowers=['#ffd76a', '#ffffff', '#f2a6d0'], trees='blob', tree=('#3f8a3a', '#2a6a2c'), sun=('#fff0a8', 18, 14), road=('#b98447', '#7a5a30')),
    2: dict(name='Deep Forest', sky=['#2a4a5a', '#4a7a7a', '#8ab09a'], far='#2e4e48', mid='#1f3e30', ground='#2c5a2e', light='#4f8a3a',
            flowers=['#c8ff70'], trees='pine', tree=('#1d4a2c', '#12321e'), dense=True, road=('#7a5a38', '#4a3420')),
    3: dict(name='Mire', sky=['#3a4a3a', '#5a6a4a', '#9aa07a'], far='#4a5a48', mid='#3a4a32', ground='#3e5232', light='#6a7a3a',
            flowers=['#c8ff70', '#7ad04b'], trees='dead', water='#2a4a40', road=('#6a5a3a', '#3e3220')),
    4: dict(name='Red Canyon', sky=['#e08a4a', '#f2b06a', '#f8d8a0'], far='#b0583a', mid='#8a3a2a', ground='#c07a44', light='#e0a060',
            flowers=['#7a5a30'], trees='cactus', sun=('#fff0c0', 96, 12), road=('#e8c088', '#9a6a3a'), mesa=True),
    5: dict(name='Ashlands', sky=['#1a0a10', '#4a1418', '#a03a1a'], far='#2a1a1e', mid='#1a1214', ground='#2a2224', light='#4a3a3a',
            flowers=['#ff8a3d', '#ffd84a'], trees='spire', lava='#ff6a2a', road=('#4a3a36', '#1a1214'), embers=True),
}


def level_card(n):
    p = LEVELS[n]; rng = random.Random(100 + n)
    cv = Canvas(120, 60)
    cv.sky(p['sky'], 34)
    if n == 5: stars(cv, 10, 20, rng)
    if p.get('sun'): cv.disc(p['sun'][1], p['sun'][2], 6, p['sun'][0])
    if p.get('mesa'):
        for x0, w, h in ((8, 26, 18), (70, 34, 22)):          # flat-topped mesas with stepped, banded sides
            for y in range(34 - h, 42):
                k = (y - (34 - h)) // 3
                for x in range(x0 - k, x0 + w + k):
                    c = hexc(p['far']) if (y - 34 + h) % 5 else mix(hexc(p['far']), (0, 0, 0), 0.2)
                    cv.put(x, y, mix(c, (0, 0, 0), 0.25) if x > x0 + w - 3 + k else c)
    else:
        cv.ridge(34, 16, 2.6, p['far'], rng)
    cv.ridge(40, 8, 1.6, p['mid'], rng)
    grass(cv, 42, p['ground'], p['light'], rng, p['flowers'])
    if p.get('water'):
        for (cx, cy, rx) in ((22, 50, 12), (92, 54, 10)):
            for y in range(-3, 4):
                for x in range(-rx, rx + 1):
                    if (x / rx) ** 2 + (y / 3) ** 2 <= 1: cv.put(cx + x, cy + y, mix(hexc(p['water']), (255, 255, 255), 0.25) if y == -2 else hexc(p['water']))
    if p.get('lava'):
        for x in range(0, 120):
            y = 52 + int(2 * math.sin(x / 6))
            for d in range(2): cv.put(x, y + d, hexc(p['lava']) if (x + d) % 5 else (255, 200, 90))
    road(cv, [(60 + 7 * math.sin(i / 2.2), 41 + i * 1.6) for i in range(14)], p['road'][0], p['road'][1], 1)
    trees = p['trees']; xs = [6, 16, 28, 96, 106, 114] + ([38, 84, 46, 76] if p.get('dense') else [])
    for x in xs:
        b = 44 + rng.randrange(4)
        if trees == 'blob': cv.blob_tree(x, b, 4 + rng.randrange(2), *p['tree'])
        elif trees == 'pine': cv.pine(x, b + 2, 14 + rng.randrange(8), *p['tree'])
        elif trees == 'dead':
            for yy in range(b - 9, b + 1): cv.put(x, yy, (60, 50, 36))
            cv.put(x - 1, b - 6, (60, 50, 36)); cv.put(x - 2, b - 7, (60, 50, 36)); cv.put(x + 1, b - 4, (60, 50, 36)); cv.put(x + 2, b - 5, (60, 50, 36))
        elif trees == 'cactus':
            for yy in range(b - 8, b + 1): cv.put(x, yy, (60, 120, 60))
            cv.put(x - 2, b - 5, (60, 120, 60)); cv.put(x - 2, b - 4, (60, 120, 60)); cv.put(x - 1, b - 4, (60, 120, 60))
            cv.put(x + 2, b - 6, (60, 120, 60)); cv.put(x + 1, b - 5, (60, 120, 60)); cv.put(x + 2, b - 5, (60, 120, 60))
        elif trees == 'spire':
            for yy in range(b - 10, b + 1):
                for dx in range(-(yy - (b - 10)) // 4, (yy - (b - 10)) // 4 + 1): cv.put(x + dx, yy, (42, 30, 32) if dx <= 0 else (26, 18, 20))
    if p.get('embers'):
        for _ in range(18): cv.put(rng.randrange(120), rng.randrange(44), (255, 160 + rng.randrange(80), 60))
    cv.vignette(0.25)
    return cv.img


# ---- The logo -----------------------------------------------------------------------------------------------------------
def logo():
    text = 'TEST TBD'; k = 2                              # each font pixel is 2x2 art pixels
    cells = set(); cx = 0
    for ch in text:
        if ch == ' ': cx += 4 * k; continue
        rows = GLYPHS[ch]
        for x, y, w in rects(rows):
            for dx in range(w * k):
                for dy in range(k): cells.add((cx + x * k + dx, y * k + dy))
        cx += (max(len(r) for r in rows) + 1) * k
    tw, th = cx - k, 7 * k
    ox, oy = 30, 8
    W, H = ox + tw + 6, max(oy + th + 8, 28)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = img.load()
    top, bot, hi = hexc('#ffe08a'), hexc('#e0702a'), hexc('#fff6d8')
    def at(x, y, c):
        if 0 <= x < W and 0 <= y < H: px[x, y] = c + (255,)
    for (x, y) in cells: at(ox + x + 2, oy + y + 3, (40, 18, 10))                               # drop shadow
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            if (x + dx, y + dy) not in cells: at(ox + x + dx, oy + y + dy, INK)
    for (x, y) in cells:
        c = mix(top, bot, y / th)
        if (x, y - 1) not in cells: c = hi
        elif (x, y + 1) not in cells: c = mix(c, (120, 40, 16), 0.4)
        at(ox + x, oy + y, c)
    # The emblem: a sword standing behind a shield.
    for y in range(0, H - 1):                                                                     # the blade, then the hilt
        x = 13
        if y < 21: at(x - 1, y, INK); at(x, y, (230, 236, 240)); at(x + 1, y, (150, 160, 170)); at(x + 2, y, INK)
    at(13, 0, INK); at(14, 0, INK)
    SH = ['kkkkkkkkkkkkkkk', 'kYYYYYYYYYYYYYk', 'kYGGGGGGGGGGGYk', 'kYGgggggggggGYk', 'kYGgggYYYgggGYk', 'kYGggYYYYYggGYk', 'kYGgggYYYgggGYk',
          'kYGggggYgggggYk', 'kYGggggYggggGYk', '.kYGgggYgggGYk.', '.kYGggggggGYk..', '..kYGgggggGYk..', '...kYGgggGYk...', '....kYGGGYk....',
          '.....kYYYk.....', '......kkk......']
    pal = {'k': INK, 'G': hexc('#2a6a34'), 'g': hexc('#4f9a4a'), 'Y': hexc('#f2b84b')}
    for y, r in enumerate(SH):
        for x, ch in enumerate(r):
            if ch != '.': at(6 + x, 7 + y, pal[ch])
    for d in range(-5, 6): at(13 + d, 6, hexc('#c8902a')); at(13 + d, 5, INK); at(13 + d, 7, INK) if abs(d) > 7 else None   # the guard
    for y in range(23, 26): at(13, y, (110, 70, 34)); at(12, y, INK); at(14, y, INK)
    at(13, 26, hexc('#f2b84b'))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    lg = logo(); lg.resize((lg.width * 3, lg.height * 3), Image.NEAREST).save(os.path.join(OUT, 'ui_logo.png'))
    sc = menu_scene(); sc.resize((sc.width * 4, sc.height * 4), Image.NEAREST).save(os.path.join(OUT, 'ui_scene.png'))
    cards = []
    for n in LEVELS:
        im = level_card(n); cards.append(im)
        im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(os.path.join(OUT, 'level_%d.png' % n))
    sheet = Image.new('RGBA', (5 * 124 + 4, 64), (24, 33, 28, 255))
    for i, im in enumerate(cards): sheet.alpha_composite(im, (4 + i * 124, 2))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-levels.png'))
    print('logo, scene and', len(cards), 'level cards')


if __name__ == '__main__':
    main()
