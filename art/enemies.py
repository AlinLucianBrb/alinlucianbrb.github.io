"""Enemy sprites for Test TBD: armoured demons in the heroes' style (art pixels 2x2 on screen, outline and shadow added
automatically).

Run:  python3 art/enemies.py      (writes art/out/enemy_<id>.png and art/out/preview-enemies.png)

Every enemy is a 64x64 image (32x32 art pixels); the figure's size inside it follows the enemy's size in the game (radius in
js/engine/enemies.js): Runner smallest, then Grunt, Brute and Boss. They share the Boss's look: skin in the enemy's colour
(ramp L, r, R, X from light to dark), black spiked armour (K, G, g) with ember accents (y), horns (u, U), burning eyes
under angry brows (E), dark capes (h, H) and wings (F, f). Rows shorter than 32 are padded with '.'.
"""
import json, os
from PIL import Image
from heroes import FIXED, scale, sprite, OUT


def skin(c):
    return {'L': scale(c, 1.35), 'r': c, 'R': scale(c, 0.68), 'X': scale(c, 0.42), 'S': scale(c, 0.85)}


# Runner: a winged imp, lean and fast: long swept horns, bat wings, a black leather harness, claws.
RUNNER = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '.........U..........U',
    '..........uU......Uu',
    '...........uXrrrRXu',
    '...........XLvrrvRX',
    '...........XrEvvERX',
    '...F.......XrwvvwRX.......F',
    '..FfF.......XRRRRX.......FfF',
    '.FUffF....LrKKyKKrR.....FffUF',
    '.FfUffFF.LrrKGgGKKrR..FFffUfF',
    '..FffUffFLrKKyEyKKKrRFffUffF',
    '...FffF..Lr.KKyKK.rR..FffF',
    '....FF...SS.KGgGK..SS..FF',
    '.........w..KKKKK..w',
    '............RrKRr',
    '...........RrR.rRR',
    '..........RrR...rRR',
    '..........KK.....KK',
]

# Grunt: a demon footsoldier: short horns, black plate with an ember core, a ragged cape and a short cleaver.
GRUNT = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '..........U.......U',
    '...........u.....u',
    '...........uXrrrRXu',
    '...........XLvrrvRX',
    '...........XrEvvERX',
    '...........XrwvvwRX',
    '............XRRRRX',
    '.........KKGgKKKKgGKK',
    '........KGgwgKKyKKgGKK',
    '.......hLrKKGggGKKrRh',
    '.......hLrKGgggGKKrRhH',
    '......hhLrKKyEyKKKrRhH',
    '......hhSSKKKyKKKKSSSH',
    '......hh..KGgKKgGK.wgG',
    '......h...KKKK.KKK.wgG',
    '......h...RrrR.rRR.wgG',
    '..........RrrR.rRR.wgG',
    '.........KKKKK.KKKK.G',
]

# Brute: a hulking demon: forward horns, tusks, huge spiked pauldrons, black plate over purple skin, a spiked iron club.
BRUTE = [
    '',
    '',
    '',
    '',
    '...........U.........U',
    '...........uU.......Uu',
    '............uU.....Uu',
    '............uXXrrRXXu',
    '............XLvrrrvRX',
    '............XrEvrvERX',
    '............XwrrRrrwX',
    '....w.......XwvvvvvwX.......w',
    '....wKKK.....XRRRRRX....KKKw',
    '...KKGgGK.KKKKKKKKKKKK.KGgGKK',
    '..KGgwggGKKGgKKyKKgGKKKGgwgGK',
    '..KGggGKKLrKKGgggGKKrRKKGgGKK',
    '..LLrKKKLLrKGggggGKKrRRKKKRRR',
    '..Lrrr..LrrKKyyyyKKKrRR..rRRR',
    '..Lrrr..LrrKKyEEyKKKrRR..rRRR',
    '..LrrR..rrKKKKyyKKKKKRR..RRRR',
    '..SSSS..KKGgKKKKKKgGKKK..SSSS',
    '..SSSS..KGggK....KggGK...SSSS',
    '..wKKw..KKKK......KKKK...Kgg',
    '...KGK..RrrR......rRRR..wKggKw',
    '..wGgGw.RrrR......rRRR..KGggGK',
    '..KGggK.RrrR......rRRR.wKGggGKw',
    '..wKGKw.KKKKK....KKKKK..KGggGK',
    '...KKK..................wKKKKw',
]

BOSS = [
    '................................',
    '..U.........................U...',
    '..uU.......................uU...',
    '...uU.....................uU....',
    '...uuU.......XXXXX.......uUU....',
    '....uuUU...XrrrrRRX....UUuU.....',
    '.....uuuU.XrLrrrrRRX..UuuU......',
    '.......uuULrXrrrrrXRUuuU........',
    '.........XLrEXrrrXERRX..........',
    '.........XrrEErrrEERRX..........',
    '..FF.....XrrwvvvvvwRRX.....FF...',
    '.FfF..KKKKXRrrrrrRRRXKKKKK.FfF..',
    'FfF..KGgGKKXXRRRRRXXKKgGGK..FfF.',
    'Ff..KGgwgGKKKyKKyKKKKGggGGK..Ff.',
    'F..KKGggGKKGgKyyKgGKKKGgGKKK..F.',
    '...hhKKGKKLrKGgKKgGKrRKKGKKhh...',
    '...hhhLLLLrrKKGggGKKrrRRRRhhhH..',
    '...hhLLrrrrrKGgggGKKrrrRRRhhhH..',
    '..hhhLrr..rrKKyyyKKKrr..RRhhhHH.',
    '..hhhLrr..KKKyEEEyKKKK..RKhhhHH.',
    '..hhhSSS..KGgKKKKKgGKK..SSShhHH.',
    '..hhSSSS..KGgGKKKgGGKK..SSSShHH.',
    '..hh......KgGKK.KKgGKKKwggGhhHH.',
    '..h.......KKKK...KKKK.KwggG.hH..',
    '..h.h.....RrrR...rRRR.KwggG.H.H.',
    '..........RrrR...rRRR.KwggG.....',
    '.........KKKKKK.KKKKKKKwggG.....',
    '.......................KwgG.....',
    '........................KK......',
    '................................',
    '................................',
    '................................',
]


ENEMIES = {
    #  id: (rows, body colour (from js/engine/enemies.js, a little darker where it was too bright), extra colours, shadow)
    'runner': (RUNNER, '#d9b43a', {'E': '#ff5a3a', 'F': '#3a1418', 'f': '#5e2228'}, (15, 25.5, 6, 1.5)),
    'grunt':  (GRUNT,  '#c24a40', {'E': '#ffd84a', 'h': '#3a1418', 'H': '#22090c'}, (15, 25.5, 7, 1.6)),
    'brute':  (BRUTE,  '#8c3b8f', {'E': '#ffe14a'}, (15.5, 27.5, 12, 2)),
    'boss':   (BOSS,   '#8a2a30', {'E': '#ffb02e', 'h': '#3a1418', 'H': '#22090c', 'F': '#3a1418', 'f': '#5e2228'}, (15.5, 27.5, 13, 2)),
}


def palette(body, extra):
    pal = dict(FIXED)
    pal.update(skin(body))
    pal.update({'v': '#1a0c0c', 'w': '#ece2c6', 'K': '#1c1a1e', 'G': '#3a3740', 'g': '#5e5a66', 'y': '#e0602e',
                'h': '#2a1a24', 'H': '#180e14'})
    pal.update(extra)
    return pal


def pad(rows, n=32):
    rows = [r.ljust(n, '.') for r in rows]
    return rows + ['.' * n] * (n - len(rows))


def stride(rows):
    """The walk animation's second frame: the body one art pixel higher, the feet where they were (the game alternates the
    two as the enemy moves, so it bobs along the path)."""
    last = max(y for y, r in enumerate(rows) if r.strip('.'))
    body, feet = rows[:last - 1], rows[last - 1:]
    return body[1:] + [body[-1]] + feet


def main():
    os.makedirs(OUT, exist_ok=True)
    imgs = {}
    for k, (rows, body, extra, shadow) in ENEMIES.items():
        imgs[k] = sprite(pad(rows), palette(body, extra), shadow)
        imgs[k].save(os.path.join(OUT, 'enemy_' + k + '.png'))
        sprite(stride(pad(rows)), palette(body, extra), shadow).save(os.path.join(OUT, 'enemy_' + k + '_2.png'))
    # Preview: the four enemies on the path, at 3x.
    tiles = Image.open(os.path.join(OUT, 'tiles.png'))
    meta = json.load(open(os.path.join(OUT, 'tiles.json')))
    def tile(name):
        i, c = meta['tiles'][name], meta['columns']
        return tiles.crop(((i % c) * 64, (i // c) * 64, (i % c) * 64 + 64, (i // c) * 64 + 64))
    bg = Image.new('RGBA', (64 * 4, 64))
    for x in range(4):
        bg.paste(tile('dirt_%d' % x), (x * 64, 0))
    for i, k in enumerate(['runner', 'grunt', 'brute', 'boss']):
        bg.alpha_composite(imgs[k], (i * 64, 0))
    bg.resize((bg.width * 3, bg.height * 3), Image.NEAREST).save(os.path.join(OUT, 'preview-enemies.png'))
    print(len(imgs), 'enemies')


if __name__ == '__main__':
    main()
