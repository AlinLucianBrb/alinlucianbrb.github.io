"""Small UI icons for Test TBD: gold, XP, lives, wave and level for the HUD and the menus; the three attributes; stats in the
hero pages; one per main-menu button; and one per talent cluster (drawn on the cluster's notable in the talent tree).

Run:  python3 art/icons.py      (writes art/out/icon_*.png and art/out/preview-icons.png)

Each icon is a glyph up to 12x12 art pixels with a dark outline and no frame, centred on 14x14, saved at 2x (28x28), so it
sits next to text. Glyphs use the shared palette of the ability icons (abilities.BASE) plus their own colours. Many reuse
glyphs from abilities.py, kits.py and relics.py, so a stat and the relic that raises it look alike.
"""
import os
from PIL import Image
from abilities import BASE, SWORD, ARROW, ORB, TARGET, FLAME, SNOW, BOLT, CLAWS, FENCE, BANNER, WOLF, WOLFPAL
from kits import BOOK, STAR, SKULL
from relics import CLOVER, COINS, BAG, CLOCK, FIST, FEATHER, EYE, HANDS, CRATE, DROP

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
INK = '#121a14'

COIN = ['...yyyyy....', '..yzzzzzy...', '.yzzyyyzzy..', '.yzyzzzyzy..', 'yzzyzzzzzzy.', 'yzzzyyyzzzy.', 'yzzzzzzyzzy.', 'yzzyzzzyzzy.',
        '.yzzyyyzzy..', '.yYzzzzzYy..', '..yYYYYYy...', '...yyyyy....']
XPSTAR = ['.....c......', '....cvc.....', '....cvc.....', 'cccccvccccc.', '.cvvvvvvvc..', '..cvvvvvc...', '..cvvcvvc...', '.cvvc.cvvc..',
          '.cvc...cvc..', 'cc.......cc.']
HEART = ['.RRR...RRR..', 'RwwRR.RRRRR.', 'RwRRRRRRRRR.', 'RRRRRRRRRRR.', 'RRRRRRRRRRR.', '.RRRRRRRRR..', '..RRRRRRR...', '...RRRRR....',
         '....RRR.....', '.....R......']
FLAG = ['.Q..........', '.QRRRRRR....', '.QRRwRRRRR..', '.QRwwwRRRRR.', '.QRRwRRRRR..', '.QRRRRRR....', '.Q..........', '.Q..........',
        '.Q..........', '.Q..........', 'QQQ.........']
CROWN = ['', 'y....y....y.', 'yy..yzy..yy.', 'yzy.yzy.yzy.', 'yzzyzzzyzzy.', 'yzzzzRzzzzy.', 'yzzzRwRzzzy.', 'yzzzzRzzzzy.', 'yYYYYYYYYYy.',
         'yyyyyyyyyyy.']
BOW = ['....QQ......', '...Q..w.....', '..Q....w....', '.Q......w...', '.Q.......w..', 'Q..yyyyyyyW.', '.Q.......w..', '.Q......w...',
       '..Q....w....', '...Q..w.....', '....QQ......']
BOOT = ['', '..nnnn......', '..nrrn......', '..nrrn......', '..nrrn..ww..', '..nrrn.w....', '..nrrrnn.ww.', '.nrrrrrrn...', '.nrrrrrrrn..',
        '.QQQQQQQQQ..']
HOURGLASS = ['QQQQQQQQQQ..', '.QbbbbbbQ...', '..QyyyyQ....', '...QyyQ.....', '....QQ......', '....QQ......', '...QbbQ.....', '..QbyybQ....',
             '.QbyyyybQ...', 'QQQQQQQQQQ..']
CRIT = ['.....y......', '..y..y..y...', '...y.y.y....', '....yzy.....', 'yyyyzwzyyyy.', '....yzy.....', '...y.y.y....', '..y..y..y...',
        '.....y......']
ENERGY = ['......cc....', '.....cC.....', '....cC......', '...cCC......', '..cCCCCCc...', '.....CCc....', '....CC......', '...Cc.......',
          '..Cc........', '..c.........']
PEN = ['', 'w...........', '.wW.........', '..wW...gg...', '...wW.gGGg..', '....wWGGGg..', '.....GwWGg..', '....gGGwWg..', '....gGGGgW..',
       '.....gggg...']
PLAY = ['', '..ww........', '..wWw.......', '..wWWw......', '..wWWWw.....', '..wWWWWw....', '..wWWWw.....', '..wWWw......', '..wWw.......',
        '..ww........']
PEOPLE = ['', '..bb....bb..', '.bbbb..bbbb.', '.bbbb..bbbb.', '..bb....bb..', '.CCCC..RRRR.', 'CCCCCCRRRRRR', 'CCCCCCRRRRRR', 'CCCCCCRRRRRR']
KEY = ['', '.yyy........', 'yzzzy.......', 'yz.zy.......', 'yzzzyyyyyyy.', '.yyy....y.y.', '........y.y.']
HELMET = ['....RRR.....', '...RRDR.....', '...gggggg...', '..gWWWWWWg..', '.gWWWWWWWWg.', '.gWkkkkkkWg.', '.gWWWWkWWWg.', '.gWWWWkWWWg.',
          '.gWWWWkWWWg.', '..gWWWWWWg..', '...gggggg...']
CHEST = ['..QQQQQQQQ..', '.QrrrrrrrrQ.', 'QrrrrrrrrrrQ', 'QQQQQyyQQQQQ', 'QrrrrzyrrrrQ', 'QrrrryyrrrrQ', 'QrrrrrrrrrrQ', 'QrrrrrrrrrrQ',
         'QQQQQQQQQQQQ']
TREE = ['.....p......', '....pvp.....', '...p.p.p....', '..v..p..v...', '.pvp.p.pvp..', '..p..p..p...', '...p.p.p....', '....ppp.....',
        '.....p......', '....vpv.....']
TROPHY = ['yyyyyyyyyy..', 'yzzzzzzzzy..', 'yzwzzzzzzy..', '.yzzzzzzy...', '.yzzzzzzy...', '..yzzzzy....', '...yzzy.....', '....yy......',
          '...yyyy.....', '..YYYYYY....']
GEAR = ['....gg.gg...', '..g.gWWg.g..', '.gWgWWWWgWg.', '..WWWggWWW..', 'gWWg....gWWg', 'gWWg....gWWg', '..WWWggWWW..', '.gWgWWWWgWg.',
        '..g.gWWg.g..', '....gg.gg...']
DOOR = ['.QQQQQQ.....', '.QrrrrQ.....', '.QrrrrQ.....', '.QrrrrQ..R..', '.QryrrQ.RRR.', '.QrrrrQRRRRR', '.QrrrrQ.RRR.', '.QrrrrQ..R..',
        '.QrrrrQ.....', 'QQQQQQQQ....']
BACK = ['', '...w........', '..ww........', '.wwwwwwwww..', 'wwwwwwwwww..', '.wwwwwwwww..', '..ww........', '...w........']
GEM = ['..cccccc....', '.cvvcvvcc...', 'cvvcvvcvcc..', 'cccccccccc..', '.cvcvvcvc...', '..cvcvcvc...', '...cvvc.....', '....cc......']
DUMBBELL = ['', '', 'GG......GG..', 'GGG....GGG..', 'GGGWWWWGGG..', 'GGG....GGG..', 'GG......GG..']
SCALES = ['.....y......', '..yyyyyyy...', '..y..y..y...', '.y.y.y.y.y..', 'y...yyy...y.', 'yyyyy.yyyyy.', '.....y......', '...yyyyy....']
BROKEN = ['.gggggggg...', 'gWWWWg.WWg..', 'gWgggg.ggWg.', 'gWg...g..Wg.', '.gWg.g..Wg..', '.gWgg..gWg..', '..gWg.gWg...', '...gW.Wg....',
          '....ggg.....']
TOXDROP = [r.replace('R', 't').replace('D', 'T') for r in DROP]

GLYPHS = {
    # resources (HUD and menus)
    'gold': COIN, 'xp': XPSTAR, 'lives': HEART, 'wave': FLAG, 'level': CROWN,
    # attributes
    'strength': FIST, 'dexterity': FEATHER, 'intellect': EYE,
    # stats
    'damage': SWORD, 'range': BOW, 'speed': BOOT, 'castspeed': HOURGLASS, 'crit': CRIT, 'energy': ENERGY, 'pen': PEN,
    # a hero's tally in the match (hero window): kills and ultimates
    'kills': SKULL, 'ultimate': STAR,
    # main menu
    'play': PLAY, 'lobby': PEOPLE, 'join': KEY, 'heroes': HELMET, 'inventory': CHEST, 'talents': TREE, 'leaderboard': TROPHY,
    'settings': GEAR, 'logout': DOOR, 'back': BACK, 'resume': HOURGLASS,
    # talent clusters (talent_<key>)
    'talent_might': CLAWS, 'talent_precision': CRIT, 'talent_sorcery': BOOK, 'talent_marksman': ARROW, 'talent_martial': SWORD,
    'talent_fire': FLAME, 'talent_cold': SNOW, 'talent_lightning': BOLT, 'talent_toxins': TOXDROP, 'talent_sunder': BROKEN,
    'talent_energy': ENERGY, 'talent_relics': GEM, 'talent_wealth': COIN, 'talent_gate': FENCE, 'talent_tempo': CLOCK,
    'talent_fortune': CLOVER, 'talent_investor': COINS, 'talent_merchant': SCALES, 'talent_treasure': CHEST, 'talent_training': DUMBBELL,
}
EXTRA = {'v': '#f2e2ff', 'c': '#8edcff', 'C': '#3f8fc4'}
PALETTES = {'xp': {'c': '#8fd3ff', 'v': '#e8f6ff'}, 'talent_lightning': {'v': '#fff6a0', 'p': '#ffe45c'}, 'talent_sorcery': {'y': '#c39bf2', 'Y': '#6b4fa0', 'u': '#f2e2ff', 'z': '#9a5cd6'},
            'talents': {'p': '#8be28b', 'v': '#e0ffd8'}, 'talent_cold': {}, 'talent_wealth': {}, 'talent_investor': {}}


def rgb(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def small(rows, pal, n=14):
    """The glyph centred on n x n with a 1-pixel dark outline, at 2x."""
    w = max([len(r) for r in rows] + [1]); h = len(rows)
    ox, oy = (n - w) // 2, (n - h) // 2
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0)); px = img.load(); cells = set()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.' and ch in pal:
                px[ox + x, oy + y] = rgb(pal[ch]); cells.add((ox + x, oy + y))
    for y in range(n):
        for x in range(n):
            if (x, y) not in cells and any((x + dx, y + dy) in cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): px[x, y] = rgb(INK)
    return img.resize((n * 2, n * 2), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for k, rows in GLYPHS.items():
        pal = dict(BASE); pal.update(EXTRA); pal.update(WOLFPAL); pal.update(PALETTES.get(k, {}))
        made['icon_' + k] = small(rows, pal)
    for k, im in made.items(): im.save(os.path.join(OUT, k + '.png'))
    cols = 12; rows = (len(made) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 32 + 4, rows * 32 + 4), (24, 33, 28, 255))
    for i, im in enumerate(made.values()): sheet.alpha_composite(im, (4 + (i % cols) * 32, 4 + (i // cols) * 32))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-icons.png'))
    print(len(made), 'icons')


if __name__ == '__main__':
    main()
