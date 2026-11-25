"""The level-select map's art: each act's painted map, the Endless portal and the level flag.

Run:  python3 art/pixellab/build_worldmap.py

Sources (art/pixellab/worldmap/, Pixel Lab jobs in jobs.txt):
  act<N>.png   an act's painted map (458x256): the road and its five round stone stops are painted in
  portal.png   the Endless portal (64x64), shown only once the campaign is finished
  flag.png     the level flag (48x48), standing on each stop
Writes:
  assets/zonemap_<N>.png   the act's map, as painted
  assets/map_portal.png    the portal, cropped to its pixels
  assets/map_flag.png      the flag, cropped to its pixels
The stops' places (in % of the picture) are in ZONE_ART in js/content/world-map.js: after painting a new map, measure
the middle of each stone pad and write it there.
"""
import os
from PIL import Image

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


if __name__ == '__main__':
    for n in range(1, 6):
        if not os.path.exists(SRC('act%d.png' % n)): continue
        im = fill_edges(Image.open(SRC('act%d.png' % n))).convert('RGB')
        im.save(A('zonemap_%d.png' % n))
        print('zonemap_%d.png' % n, im.size)
    crop('portal.png', 'map_portal.png')
    crop('flag.png', 'map_flag.png')
