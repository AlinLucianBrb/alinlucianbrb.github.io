"""The terrain in the Pixel Lab style: builds assets/terrain.png + terrain.json and the new scenery sprites (deco2_*).

Run:  python3 art/pixellab/build_terrain.py

Sources (art/pixellab/terrain/):
- wang_grass_dirt.png: a Pixel Lab top-down Wang tileset (pro, 64 px tiles, grass raised over a dirt road by a low bank),
  4x4 tiles. Each tile is found by its four corners (grass or road), read from the picture itself.
- grass_var*.png, dirt_var*.png: the all-grass and all-road tiles with a different middle (inpainted, the border kept, so
  they still join every other tile).
- tree_oak, tree_pine, bush, rock, flowers, mushrooms: scenery for the forest around the map.

The forest floor outside the map is the same grass, darkened and cooled (so the road can cross from one to the other).

terrain.json: { size, columns, tiles: name -> index }. Names: g<mask> grass, f<mask> forest, where mask is
NW*8 + NE*4 + SW*2 + SE*1 and a set bit means that corner is grass (not road); g15_1.. and g0_1.. are the extra all-grass
and all-road tiles (f.. the same in the forest).
"""
import colorsys, json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'terrain')
ASSETS = os.path.join(HERE, '..', '..', 'assets')
TS = 64


def is_grass(px):
    r, g, b = px[:3]
    return g > r + 8 and g > b


def corners(tile):
    """The tile's corners (NW, NE, SW, SE) as grass (1) or road (0), by the majority of a 5x5 patch at each corner."""
    out = []
    for cx, cy in ((2, 2), (61, 2), (2, 61), (61, 61)):
        n = sum(is_grass(tile.getpixel((min(63, max(0, cx + dx)), min(63, max(0, cy + dy))))) for dx in range(-2, 3) for dy in range(-2, 3))
        out.append(1 if n > 12 else 0)
    return out


def forest(img):
    """The forest floor: green pixels darkened and cooled, flowers dimmed; soil and road left as they are."""
    img = img.convert('RGBA')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.12 <= h <= 0.5 and s > 0.25 and g > r:          # green (and the yellow-green highlights)
                h = min(0.45, h + 0.03); s *= 0.78; v *= 0.5
            elif 0.12 <= h < 0.2 and v > 0.7:                      # yellow flowers
                s *= 0.6; v *= 0.55
            else:
                continue
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return img


def meadow(img):
    """The map's grass, turned a little warmer and softer (toward the old tileset's olive green), so it sits with the heroes."""
    img = img.convert('RGBA')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.2 <= h <= 0.5 and s > 0.25 and g > r:
                h = max(0.25, h - 0.06); s *= 0.85; v *= 0.95
                r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return img


def main():
    sheet = Image.open(os.path.join(SRC, 'wang_grass_dirt.png')).convert('RGBA')
    tiles, names = [], []
    found = {}
    for ty in range(sheet.height // TS):
        for tx in range(sheet.width // TS):
            t = sheet.crop((tx * TS, ty * TS, tx * TS + TS, ty * TS + TS))
            nw, ne, sw, se = corners(t)
            m = nw * 8 + ne * 4 + sw * 2 + se
            assert m not in found, f'two tiles with corners {m}'
            found[m] = t
    assert len(found) == 16, f'only {len(found)} of the 16 corner tiles found'
    extra = []
    for f in sorted(os.listdir(SRC)):
        if f.startswith('grass_var'): extra.append(('15_' + f[9:-4], Image.open(os.path.join(SRC, f)).convert('RGBA')))
        if f.startswith('dirt_var'): extra.append(('0_' + f[8:-4], Image.open(os.path.join(SRC, f)).convert('RGBA')))
    for prefix, conv in (('g', meadow), ('f', forest)):
        for m in range(16):
            names.append(prefix + str(m)); tiles.append(conv(found[m]))
        for key, img in extra:
            names.append(prefix + key); tiles.append(conv(img))
    cols = 8
    out = Image.new('RGBA', (cols * TS, -(-len(tiles) // cols) * TS))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * TS, (i // cols) * TS))
    out.save(os.path.join(ASSETS, 'terrain.png'))
    json.dump({'size': TS, 'columns': cols, 'tiles': {n: i for i, n in enumerate(names)}}, open(os.path.join(ASSETS, 'terrain.json'), 'w'), indent=1)
    # scenery: cropped to the figure, then made square with the figure standing on the bottom edge, centred
    for name in ('tree_oak', 'tree_pine', 'bush', 'rock', 'flowers', 'mushrooms'):
        im = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
        im = im.crop(im.getbbox())
        s = max(im.size)
        sq = Image.new('RGBA', (s, s))
        sq.paste(im, ((s - im.width) // 2, s - im.height))
        sq.save(os.path.join(ASSETS, 'deco2_' + name + '.png'))
    print('terrain:', len(tiles), 'tiles')


if __name__ == '__main__':
    main()
