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


def crop(name, out):
    im = Image.open(SRC(name)).convert('RGBA')
    im = im.crop(im.getbbox())
    im.save(A(out))
    print(out, im.size)


if __name__ == '__main__':
    for n in range(1, 6):
        if not os.path.exists(SRC('act%d.png' % n)): continue
        im = Image.open(SRC('act%d.png' % n)).convert('RGB')
        im.save(A('zonemap_%d.png' % n))
        print('zonemap_%d.png' % n, im.size)
    crop('portal.png', 'map_portal.png')
    crop('flag.png', 'map_flag.png')
