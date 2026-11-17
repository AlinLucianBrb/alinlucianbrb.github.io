"""The logo and the main menu's icons in the heroes' style.

Run:  python3 art/pixellab/build_logo_icons.py

Writes assets/ui_logo.png: the emblem (a Pixel Lab shield with an oak leaf and crossed swords, ui/emblem.png) beside the
name set in the game's pixel font (art/font.py GLYPHS), each letter pixel a small bevelled gold block over a bronze
extrusion and an ink outline. And assets/icon_<play|lobby|join|heroes|inventory|talents|leaderboard|settings|logout>.png:
cut from a Pixel Lab sheet of 32 px icons (ui/menu_icons.png, plus ui/icon_logout.png), trimmed to a tight square.
"""
import os, sys
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from font import GLYPHS
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)
INK = (14, 12, 10, 255)


def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def word(text, S=6):
    cols = []
    for ch in text:
        rows = GLYPHS.get(ch.upper() if ch.upper() in GLYPHS else ch, ['.....'] * 7)
        w = max(len(r) for r in rows) if ch != ' ' else 3
        cols.append((rows, w))
    W = sum(w + 1 for _, w in cols) * S + 12; H = 7 * S + 14
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = img.load()
    x0 = 6
    mask = Image.new('L', (W, H), 0); mp = mask.load()
    for rows, w in cols:
        for r, row in enumerate(rows[:7]):
            for c, ch in enumerate(row):
                if ch != '#': continue
                for dy in range(S):
                    for dx in range(S):
                        X, Y = x0 + c * S + dx, 4 + r * S + dy
                        t = (r * S + dy) / (7 * S)
                        col = mix((255, 236, 160), (196, 120, 40), t)                  # top-lit gold
                        up = r == 0 or c >= len(rows[r - 1]) or rows[r - 1][c] != '#'
                        down = r == 6 or c >= len(rows[r + 1]) or rows[r + 1][c] != '#'
                        if up and dy < 2: col = mix(col, (255, 255, 235), 0.55)              # a lit top edge on each stroke
                        if down and dy >= S - 2: col = mix(col, (110, 60, 20), 0.4)          # a shaded bottom edge
                        px[X, Y] = col + (255,); mp[X, Y] = 255
        x0 += (w + 1) * S
    # bronze extrusion under the letters, then the ink outline around both
    ext = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k in range(1, 5):
        ext.paste(Image.new('RGBA', (W, H), (110 - k * 12, 66 - k * 8, 24, 255)), (0, k), mask)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    full = mask.copy(); full.paste(255, (0, 4), mask)
    full = Image.fromarray if False else full
    m2 = mask.copy()
    for k in range(1, 5): m2.paste(255, (0, k), mask)
    outline = m2.filter(ImageFilter.MaxFilter(5))
    out.paste(Image.new('RGBA', (W, H), INK), (0, 0), outline)
    out.alpha_composite(ext); out.alpha_composite(img)
    return out


def main():
    em = Image.open(os.path.join(HERE, 'ui', 'emblem.png')).convert('RGBA'); em = em.crop(em.getbbox())
    em = em.resize((round(em.width * 0.95), round(em.height * 0.95)), Image.LANCZOS)
    w = word('TEST TBD')
    W = em.width + 10 + w.width; H = max(em.height, w.height) + 4
    logo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    logo.alpha_composite(em, (0, (H - em.height) // 2)); logo.alpha_composite(w, (em.width + 10, (H - w.height) // 2 + 2))
    logo.save(A('ui_logo.png')); print('logo', logo.size)
    sheet = Image.open(os.path.join(HERE, 'ui', 'menu_icons.png')).convert('RGBA')
    names = ['play', 'lobby', 'join', 'heroes', 'inventory', 'talents', 'leaderboard', 'settings']
    # the icons are not exactly on the 32 px grid: find each one as a connected blob (8-neighbour), keep the 8 biggest
    a = sheet.split()[3].load(); seen = set(); blobs = []
    for y in range(sheet.height):
        for x in range(sheet.width):
            if a[x, y] and (x, y) not in seen:
                st = [(x, y)]; seen.add((x, y)); pts = []
                while st:
                    p = st.pop(); pts.append(p)
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            q = (p[0] + dx, p[1] + dy)
                            if 0 <= q[0] < sheet.width and 0 <= q[1] < sheet.height and q not in seen and a[q]:
                                seen.add(q); st.append(q)
                blobs.append(pts)
    big = sorted(blobs, key=len, reverse=True)
    main_ = big[:8]
    for b in big[8:]:                      # small specks join the nearest big blob (e.g. sparkles of the sapling)
        cx = sum(p[0] for p in b) / len(b); cy = sum(p[1] for p in b) / len(b)
        near = min(main_, key=lambda m: min(abs(p[0] - cx) + abs(p[1] - cy) for p in m))
        if min(abs(p[0] - cx) + abs(p[1] - cy) for p in near) < 5: near.extend(b)
    main_.sort(key=lambda m: (min(p[1] for p in m) // 24, min(p[0] for p in m)))
    cells = []
    for m in main_:
        x0, y0 = min(p[0] for p in m), min(p[1] for p in m); x1, y1 = max(p[0] for p in m), max(p[1] for p in m)
        c = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1)); sp = sheet.load(); cp = c.load()
        for (x, y) in m: cp[x - x0, y - y0] = sp[x, y]
        cells.append(c)
    cells.append(Image.open(os.path.join(HERE, 'ui', 'icon_logout.png')).convert('RGBA')); names.append('logout')
    for n, c in zip(names, cells):
        c = c.crop(c.getbbox()); m = max(c.size) + 2; sq = Image.new('RGBA', (m, m)); sq.alpha_composite(c, ((m - c.width) // 2, (m - c.height) // 2))   # tight square
        sq.save(A('icon_' + n + '.png'))
    print('icons', len(names))


if __name__ == '__main__':
    main()
