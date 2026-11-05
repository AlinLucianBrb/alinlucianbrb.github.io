"""Hero sprites for Test TBD: 64x64 images drawn as 32x32 art pixels (each 2x2 on screen), the same pixel size as the tiles.

Run:  python3 art/heroes.py      (writes art/out/hero_<id>.png and art/out/preview-heroes.png)

Each sprite is drawn by hand as rows of characters; KEY maps a character to a colour ('.' is transparent). Same rules as the
tiles: light from the top left, a 1px dark outline, 3/4 front view (you see the face and the top of the head).
"""
import os
from PIL import Image

P = 2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

KEY = {
    'k': '#121a14',                                   # outline
    's': '#eab48c', 'S': '#c4835f', 'e': '#1b1b24',   # skin, skin shade, eyes
    'H': '#284f33', 'h': '#3a7343', 'j': '#58a05a',   # hood / cloak green: shade, mid, light
    'Y': '#b97b26', 'y': '#f2b84b', 'z': '#ffe09a',   # Ranger gold tunic
    'B': '#3e2716', 'b': '#6b4528', 'n': '#9a6a3e',   # leather: shade, mid, light
    'P': '#3a3428', 'p': '#5a5040',                   # trousers
    'w': '#7a4a24', 'W': '#b57d45', 'l': '#ece6d0',   # bow wood, lit wood, string
    'r': '#d9574e', 'g': '#c9ccd2',                   # fletching, arrow tip
    'q': '#1e3a28',                                   # shadow on the ground
}

RANGER = [
    '................................',
    '................................',
    '.............kkkk...............',
    '...........kkhhhhk..............',
    '..........khhjjhhhk.........k...',
    '.........khjjjjhhhhk.......kWk..',
    '.........khjjhhhhhhhk......kwk..',
    '........khjhhhhhhhhhk.....kWkl..',
    '........khhhSSSSSSHhhk....kwk.l.',
    '........khhSssssssSHhk...kWk..l.',
    '........khhsseesseeSHk...kwk..l.',
    '........khHsseesseeSHk...kwk..l.',
    '........khHsssssssSSHk...kwk..l.',
    '........kHHSssssssSHHk...kwk..l.',
    '.......kkhHHSSSSSSHHhkk..kwk..l.',
    '......khjhhkkzyyyykhhhHk.kwk..l.',
    '.....khjjhkzyyyyyYYkhhHHksSk..l.',
    '.....khjhkyzyyyyyyYYkhHkssSk..l.',
    '.....khhkyyyyyyyyyYYYkHkSSkk..l.',
    '.....khhksSkbnbbbbbBBkHkkwk...l.',
    '.....kHhkSSkBBBBBBBBBkHk.kwk..l.',
    '......kHkkkyyYYyyyYYYkHk.kWk..l.',
    '......kHHkkyyYYYyyYYYkk...kwk.l.',
    '.......kkk.kpppkkpppPk.....kWkl.',
    '...........kppPk.kpPPk......kwk.',
    '...........kppPk.kpPPk.......k..',
    '...........kBBBk.kBBBk..........',
    '..........kbnbBk.kbnbBk.........',
    '..........kkkkkk.kkkkkk.........',
    '.........qqqqqqqqqqqqqqq........',
    '................................',
    '................................',
]


def sprite(rows):
    assert len(rows) == 32, len(rows)
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        assert len(row) == 32, (y, len(row), row)
        for x, ch in enumerate(row):
            if ch != '.':
                c = KEY[ch]
                px[x, y] = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + ((90,) if ch == 'q' else (255,))
    return img.resize((32 * P, 32 * P), Image.NEAREST)


HEROES = {'ranger': RANGER}


def main():
    os.makedirs(OUT, exist_ok=True)
    imgs = {k: sprite(v) for k, v in HEROES.items()}
    for k, im in imgs.items():
        im.save(os.path.join(OUT, 'hero_' + k + '.png'))
    # Preview: each hero on a few grass tiles and next to the path, at 1x and 3x.
    tiles = Image.open(os.path.join(OUT, 'tiles.png'))
    import json
    meta = json.load(open(os.path.join(OUT, 'tiles.json')))
    def tile(name):
        i = meta['tiles'][name]
        return tiles.crop(((i % meta['columns']) * 64, (i // meta['columns']) * 64, (i % meta['columns']) * 64 + 64, (i // meta['columns']) * 64 + 64))
    bg = Image.new('RGBA', (64 * 4, 64 * 2))
    for y in range(2):
        for x in range(4):
            bg.paste(tile('grass_%d' % (y * 4 + x)), (x * 64, y * 64))
    for i, im in enumerate(imgs.values()):
        bg.alpha_composite(im, (64 + i * 64, 32))
    big = bg.resize((bg.width * 3, bg.height * 3), Image.NEAREST)
    big.save(os.path.join(OUT, 'preview-heroes.png'))


if __name__ == '__main__':
    main()
