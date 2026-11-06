"""Item icons for Test TBD: 64x64 images (32x32 art pixels), one per item type and rarity, in the same pixel style.

Run:  python3 art/items.py      (writes art/out/item_<type>_<rarity>.png, rarity 0-3, and art/out/preview-items.png)

Each item type is drawn once by hand (rows of characters, roughly centred; the script centres it) with material letters,
and the rarity picks the materials, so a rarer item looks finer:
  Common: worn iron and plain leather, no gem.  Uncommon: steel, bronze trim, a green gem.
  Rare: polished steel, gold trim, a blue gem.    Epic: dark steel, gold trim, a glowing purple gem.
Gem colours follow the rarity colours in js/content/data.js (RARITIES). Letters: metal K G g w (dark to light), trim Y y z,
gem a A o W (dark, mid, light, glint), leather D d i I, cloth c C, chain n. The dark outline is added automatically.
Item type ids are the ones in js/content/items.js (ITEMS).
"""
import json, os
from PIL import Image

P = 2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
INK = '#121a14'

HELM = [
    '.......wwgggG',
    '.....wwwggggGGK',
    '....wwgggggggGGK',
    '...wwggggaAgggGGK',
    '...wgggggoAggggGK',
    '..wwggggggggggGGGK',
    '..wggggggggggggGGK',
    '..wgKKKKKKKKKKKKGK',
    '..wgKEKKKKKKKEKKGK',
    '..wgKKKKKKKKKKKKGK',
    '..wggggggKgggggGGK',
    '..wgggggKKKggggGGK',
    '..yYggggKgKgggGGYY',
    '..zyYgggKgKgggGYyY',
    '...zyYgggggggGYyY',
    '....zyyyyyyyyyyY',
    '.....YYYYYYYYYY',
]

BODY = [
    '...wwgG..........wgGG',
    '..wwgggGK......KwggGGK',
    '.wwggggGKyyyyyyKggggGGK',
    '.wgggggGKdiiiidKgggggGK',
    '.wggggGGKddiidd.KgggGGK',
    '..wggGKwwggggggGGKgGGK',
    '...KK.wwggggggggGGK.KK',
    '......wggggaAggggGK',
    '......wgggaoAAgggGK',
    '......wggggaAggggGK',
    '......wgggggggggGGK',
    '......wGgggggggGGGK',
    '......yyyyyyzyyyyyY',
    '......DddddiIdddddD',
    '......wgggggggggGGK',
    '.......wgggggggGGK',
    '........wGGGGGGGK',
]

LEGS = [
    '....yyyyyyyyzyyyyyyY',
    '....DddddddiIddddddD',
    '....wggggggggggggGGK',
    '....wgggggGKKwggggGK',
    '....wggggGK..wgggGGK',
    '....wggggGK..wgggGGK',
    '...yYwgaAGK..wgaAGKY',
    '...zyYgoAK....woAGYy',
    '....wwggGK....wggGGK',
    '....wgggGK....wgggGK',
    '....wgggGK....wgggGK',
    '....wgggGK....wgggGK',
    '....wGGGGK....wGGGGK',
    '.....KKKK......KKKK',
]

BOOTS = [
    '...wwgG........wwgG',
    '...wggGK.......wggGK',
    '..yyyyyY......yyyyyY',
    '...wggGK.......wggGK',
    '...wgaGK.......wgaGK',
    '...wgoGK.......wgoGK',
    '...wggGK.......wggGK',
    '...wgggGK......wgggGK',
    '...wggggGGK....wggggGGK',
    '...wgggggGGK...wgggggGGK',
    '...DDDDDDDDD...DDDDDDDDD',
]

CHARM = [
    '........nn.....nn',
    '.......n.........n',
    '......n...........n',
    '......n...........n',
    '.......n.........n',
    '........n.......n',
    '.........n.....n',
    '..........nyyyn',
    '.........yzYYYy',
    '........yzyaAAyY',
    '.......yzyaoWAAyY',
    '.......yyaooAAAaY',
    '.......yyaoAAAaaY',
    '........yyaAAaaY',
    '.........yyaaaY',
    '..........yYYY',
    '...........yY',
    '............Y',
]

ITEMS = {'helm': HELM, 'body_armour': BODY, 'leggings': LEGS, 'boots': BOOTS, 'power_charm': CHARM}

# Materials by rarity (0 Common .. 3 Epic). The charm keeps a gem at every rarity (a red one when Common).
RARITY_MATS = [
    {'K': '#2a2c30', 'G': '#4a4d54', 'g': '#6c7078', 'w': '#9a9ea6', 'Y': '#3e2412', 'y': '#5e3b23', 'z': '#82552f',
     'gem': None, 'E': '#3a3d44'},
    {'K': '#2c323a', 'G': '#56606b', 'g': '#8f99a4', 'w': '#dde4ea', 'Y': '#6e4a22', 'y': '#a8742a', 'z': '#d9a45a',
     'gem': ('#1f6e2e', '#3fae52', '#5fd46f'), 'E': '#5fd46f'},
    {'K': '#2c323a', 'G': '#5d6674', 'g': '#98a3b2', 'w': '#eef3f8', 'Y': '#9c6a26', 'y': '#e8a940', 'z': '#ffe08a',
     'gem': ('#1d4f8f', '#3a82d6', '#5aa9ff'), 'E': '#5aa9ff'},
    {'K': '#16131c', 'G': '#2e2838', 'g': '#4a4258', 'w': '#7d7290', 'Y': '#9c6a26', 'y': '#e8a940', 'z': '#ffe08a',
     'gem': ('#5a2a96', '#9a5ce0', '#c084fc'), 'E': '#e2b8ff'},
]
LEATHER = {'D': '#34200f', 'd': '#57361f', 'i': '#82552f', 'I': '#ad7e4a', 'n': '#c9ccd2', 'W': '#ffffff'}


def palette(rarity, item):
    m = RARITY_MATS[rarity]
    pal = dict(LEATHER)
    pal.update({k: v for k, v in m.items() if len(k) == 1})
    gem = m['gem'] or (('#7a1f1f', '#c23a3a', '#ff6a5a') if item == 'power_charm' else (m['K'], m['G'], m['g']))
    pal.update(dict(zip('aAo', gem)))
    if not m['gem'] and item != 'power_charm':
        pal['W'] = m['g']
    return pal


def rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def icon(rows, pal, n=32, glow=None):
    w = max(len(r) for r in rows)
    h = len(rows)
    ox, oy = (n - w) // 2, (n - h) // 2
    grid = [['.'] * n for _ in range(n)]
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            grid[oy + y][ox + x] = ch
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = img.load()
    filled = {(x, y) for y in range(n) for x in range(n) if grid[y][x] != '.'}
    if glow:                                   # Epic: a soft glow two pixels around the item
        for y in range(n):
            for x in range(n):
                if (x, y) not in filled and any((x + dx, y + dy) in filled for dx in range(-2, 3) for dy in range(-2, 3)):
                    px[x, y] = rgb(glow) + (120,)
    for (x, y) in filled:
        px[x, y] = rgb(pal[grid[y][x]]) + (255,)
    for y in range(n):
        for x in range(n):
            if (x, y) not in filled and any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = rgb(INK) + (255,)
    return img.resize((n * P, n * P), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    rarity_colors = ['#ecf1e8', '#5fd46f', '#5aa9ff', '#c084fc']
    made = {}
    for item, rows in ITEMS.items():
        for r in range(4):
            im = icon(rows, palette(r, item), glow=rarity_colors[3] if r == 3 else None)
            im.save(os.path.join(OUT, 'item_%s_%d.png' % (item, r)))
            made[(item, r)] = im
    # Preview: one row per item type, Common to Epic, on dark slots framed in the rarity colour (as the UI might show them).
    cell = 72
    sheet = Image.new('RGBA', (cell * 4 + 8, cell * len(ITEMS) + 8), (22, 28, 24, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for j, item in enumerate(ITEMS):
        for r in range(4):
            x, y = 8 + r * cell, 8 + j * cell
            d.rectangle((x, y, x + 63, y + 63), fill=(34, 42, 37, 255), outline=rgb(rarity_colors[r]) + (255,), width=2)
            sheet.alpha_composite(made[(item, r)], (x, y))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-items.png'))
    print(len(made), 'item icons')


if __name__ == '__main__':
    main()
