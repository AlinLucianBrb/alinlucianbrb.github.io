"""Ability icons for Test TBD: one per basic attack and one per ultimate, shown on the hero buttons (like action-bar icons).

Run:  python3 art/abilities.py      (writes art/out/ability_<id>.png and art/out/preview-abilities.png)

Each icon is 32x32 (16x16 art pixels, 2x2 on screen, like the rest of the art): a dark frame with a bevel lit from the top
left, a background in the ability's colour, and a hand-drawn glyph (up to 12x12, centred) with a dark outline so it reads
on any background. Basic attacks are named atk_<id>, ultimates ult_<ultimate id> (the ids in js/engine/ultimates.js);
js/game/sprites.js says which hero uses which basic attack icon.
"""
import os
from PIL import Image

P = 2
N = 16
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
INK = '#121a14'

BASE = {
    'k': INK, 'w': '#ffffff', 'W': '#dde4ea', 'g': '#8f99a4', 'G': '#56606b', 'K': '#2c323a',
    'Q': '#7a4b26', 'q': '#3e2412', 'r': '#b98447', 'n': '#82552f', 'b': '#ece2c6',
    'y': '#f2b84b', 'Y': '#9c6a26', 'z': '#ffe08a',
    'R': '#d9574e', 'D': '#8f2f2a', 'o': '#ff8a3d', 'O': '#ffe9a0',
    'c': '#8edcff', 'C': '#3f8fc4', 'p': '#c39bf2', 'P': '#6b4fa0', 'v': '#f2e2ff',
    't': '#7ad04b', 'T': '#3f7a2a', 'l': '#c8ff70',
    'a': '#6b4fa0', 'A': '#c39bf2',
}

SWORD = ['..........wW', '.........wWg', '........wWg.', '.......wWg..', '......wWg...', '..y..wWg....', '...yyWg.....', '....yy......',
         '...nyyy.....', '..nn..y.....', '.nn.........', 'nn..........']
TWIN = ['w..........w', 'Ww........wW', '.Ww......wW.', '..Ww....wW..', '...Ww..wW...', '....WwwW....', '....yWWy....', '...yy..yy...',
        '..nyy..yyn..', '.nn......nn.', 'nn........nn']
LAUNCH = ['', '', '.w..........', '....y.......', '.w..yWWWWWWw', 'nnnyywwwwwwW', '.w..yGGGGGGg', '....y.......', '.w..........']
ARROW = ['.........WWW', '..........gW', '.........Q.W', '........Q...', '.......Q....', '......Q.....', '.....Q......', '....Q.......',
         '.R.Q........', '.RRR........', '..RR........', '.R..........']
BOOMERANG = ['', '..zy........', '..zyY.......', '...zyY......', '....zyY.....', '.....zyY....', '.....zyyyyY.', '....zyyyyYY.',
             '...zyyY.....', '..zyyY......', '..yYY.......']
ORB = ['', '.......aaa..', '......aAAAa.', '.....aAOOAa.', '.t..aAAOOAAa', '..t.aAAAAAAa', '.t.taAAAAAa.', '..t..aAAAa..', '.t....aaa...']
BOLT = ['.......vvv..', '......vpv...', '.....vpv....', '....vppvvv..', '...vpppppv..', '...vvvvppv..', '.....vppv...', '....vppv....',
        '...vpv......', '..vpv.......', '..vv........']
BLINK = ['', '.........wW.', '........wWg.', '...P...wWg..', '..PP..wWg...', '.PP..wWg....', '.P..yyg.....', '....yy......', '...nn.......',
         '..nn........']
DAGGERS = ['.....tl.....', '....tlT..tl.', '...tlT..tlT.', '..tlT..tlT..', '.yyT..tlT...', '..y..yyT....', '.n....y.....', 'n....n......',
           '....n.......']
FLASK = ['.....QQ.....', '.....gg.....', '....wggw....', '...woooow...', '..wOoooooow.', '..woooooooow', '..woooooooow', '..wooooooooW',
         '...woooooow.', '....wwwwww..']
EMPOWER = ['.....zz.....', '....zyyz....', '...zyYYyz...', '..zyY..Yyz..', '.zyY.zz.Yyz.', '.yY.zyyz.Yy.', '...zyYYyz...', '..zyY..Yyz..',
           '.zyY....Yyz.', '.yY......Yy.']
FLAME = ['.....o......', '....oo..o...', '...ooO..oo..', '..ooOO.ooo..', '..oOOOooOo..', '.ooOwwOOOoo.', '.oOwwwwOOOo.', '.oOwwwwwOo..',
         '..oOwwwOOo..', '...ooOOoo...', '....oooo....']
SNOW = ['.....c......', '...c.c.c....', '....ccc.....', '.c..cwc..c..', '..c.cwc.c...', 'cccccwwccccc', '..c.cwc.c...', '.c..cwc..c..',
        '....ccc.....', '...c.c.c....', '.....c......']
STORM = ['...GGGG.....', '..GgggggG...', '.GggWWgggG..', 'GgggggggggG.', '.GGGGGGGGG..', '....vpv.....', '...vpv......', '..vppvv.....',
         '....vpv.....', '...vpv......', '..vv........']
PIERCE = ['', '.........z..', '.........zz.', '.yyyyyyyyzOz', 'YyyyyyyyyzOO', '.yyyyyyyyzOz', '.........zz.', '.........z..']
ORBIT = ['....yyyy....', '..yy....yy..', '.y........Y.', '.y...zy...Y.', 'y....zyY...Y', 'y....zyyy..Y', 'y..........Y', '.y........Y.',
         '.y........Y.', '..yy....YY..', '....YYYY....']
TRAP = ['', '..w.w.w.w...', '.GwGwGwGwG..', 'G..........G', 'G...KKKK...G', 'G...KtlK...G', 'G...KKKK...G', 'G..........G',
        '.GwGwGwGwG..', '..w.w.w.w...']
CLAWS = ['...D....D...', '..RD...RD...', '..R...R...D.', '.RD..RD..RD.', '.R...R...R..', 'RD..RD..RD..', 'R...R...R...', 'R..R...R....']
BANNER = ['.Qy.........', '.QCCCCCCCC..', '.QCccccccC..', '.QCcwwwwcC..', '.QCccwwccC..', '.QCccccccC..', '.QCCCCCCCC..', '.Q..........',
          '.Q..........', '.Q..........', '.Q..........', '.QQ.........']
FENCE = ['.b...b...b..', '.Q...Q...Q..', 'QQQQQQQQQQQ.', 'qqqqqqqqqqq.', '.Q...Q...Q..', '.Q...Q...Q..', 'QQQQQQQQQQQ.', 'qqqqqqqqqqq.',
         '.Q...Q...Q..', '.q...q...q..']
TARGET = ['....pPPp....', '..pP....Pp..', '.p...pp...p.', '.P..p..p..P.', 'p..p.RR.p..p', 'P..p.RR.p..P', '.P..p..p..P.', '.p...pp...p.',
          '..pP....Pp..', '....pPPp....']
CLONES = ['...PP...GG..', '..PPPP.GGGG.', '..PvPv.GzGz.', '..PPPP.GGGG.', '.PPPPPPGGGGG', '.PPPPPGGGGGG', '.PPPPPGGGGGG', '.PPPPPGGGGGG',
          '.PP.PPGGG.GG']
OIL = ['.....o......', '....oOo.....', '....oOo.....', '...oOwOo....', '...oOwOo....', '..nnnnnnnn..', '.nqqqqqqqqn.', 'nqqqqqqqqqqn',
       '.nqqqqqqqqn.', '..nnnnnnnn..']

SEED = ['', '.......y....', '......yQy...', '.t...yQrQy..', '..t.yQQQQQy.', '.t.t.yQQQy..', '..t...yQy...', '.......y....']
WOLF = ['.G........G.', '.GG......GG.', '.GgGGGGGGgG.', 'GggggggggggG', 'GgEEggggEEgG', 'GggggggggggG', '.GgggvvgggG.', '..GgwvvwgG..',
        '..GuGGGGuG..', '...GGGGGG...']
BRAMBLE = ['.....q......', '....qQq..w..', '..w.qQ..qQ..', '...qQ..qQq..', '..qQqqQQ....', '.qQ..qQ..w..', '.Q..qQ......', 'qQ.qQq..w...',
           'Q..Q..qQ....', '..qQqQQ.....']
MOONBEAM = ['...ccc......', '..cOc.......', '.cO.........', '.cO..b......', '.cO...b.....', '.cO....b..b.', '..cOc...bb..', '...ccc..b...',
            '....b...b...', '...b....b...', '..b.....b...']
GRASP = ['....llll....', '..ll....ll..', '.l..tttt..l.', 'l..t....t..l', 'l.t..QQ..t.l', 'l.t.QqqQ.t.l', 'l..t.QQ.t..l', '.l..tttt..l.',
         '..ll....ll..', '....llll....']
SPIKE = ['.....O......', '....OQ...O..', '..O.QQ..OQ..', '..QqQQ..QQ..', '.OQqQQ.OQQ..', '.QQqQQ.QQq..', 'qQQqQQqQQqq.', 'qqqqqqqqqqqq']
MOONFALL = ['....mmmm....', '...mlllcm...', '..mlOlllcm..', '..mllcllcm..', '..mlllllcm..', '...mlcllm...', '....mmmm....', '..b......b..',
            '.b..bbbb..b.', 'bbbbbbbbbbbb']
WOLFPAL = {'G': '#56606b', 'g': '#8f99a4', 'E': '#ffb347', 'v': '#16181c', 'w': '#ffffff', 'u': '#ece2c6'}
NATURE = {'Q': '#6a8a3a', 'q': '#3f5a24', 'O': '#f2ead2', 'r': '#a8783e', 'y': '#c8ff70', 't': '#7ad04b', 'l': '#c8ff70'}
MOONPAL = {'c': '#c8d2ee', 'O': '#ffffff', 'b': '#b8c8ff', 'm': '#9aa6c8', 'l': '#e6ecfa'}
GREEN = {'z': '#d4ffcc', 'y': '#8be28b', 'Y': '#4c8a4c'}
TOXIC_FLASK = {'o': '#7ad04b', 'O': '#c8ff70'}
#   id: (glyph, background colour, palette overrides)
ICONS = {
    'atk_sword': (SWORD, '#4a5560', {}),
    'atk_twin': (TWIN, '#5a3030', {}),
    'atk_launch': (LAUNCH, '#2c4a7a', {}),
    'atk_arrow': (ARROW, '#5a4a28', {}),
    'atk_arrow_gold': (ARROW, '#5a4a28', {'R': '#ffd76a'}),
    'atk_arrow_toxic': (ARROW, '#3a4a28', {'R': '#7ad04b'}),
    'atk_boomerang': (BOOMERANG, '#2f4a2f', GREEN),
    'atk_arcane': (ORB, '#3a2c5a', {'t': '#c39bf2'}),
    'atk_fire': (ORB, '#5a2418', {'a': '#c2361f', 'A': '#ff8a3d', 'O': '#ffe9a0', 't': '#ff8a3d'}),
    'atk_cold': (ORB, '#1f3a5a', {'a': '#3f8fc4', 'A': '#8edcff', 'O': '#ffffff', 't': '#8edcff'}),
    'atk_lightning': (BOLT, '#2a2c4a', {}),
    'atk_blink': (BLINK, '#2c2436', {}),
    'atk_daggers': (DAGGERS, '#2f3a24', {}),
    'atk_flask': (FLASK, '#4c3020', {}),
    'atk_seed': (SEED, '#2f3a20', {'Q': '#5a3a1e', 'r': '#a8783e', 'y': '#c8ff70', 't': '#9fe06a'}),
    'atk_wolf': (WOLF, '#4a3424', WOLFPAL),
    'atk_thorns': (BRAMBLE, '#2a3420', {'Q': '#6a8a3a', 'q': '#3f5a24', 'w': '#f2ead2'}),
    'atk_moonbeam': (MOONBEAM, '#1f2848', MOONPAL),
    'ult_grasp': (GRASP, '#26341c', {'Q': '#8a6a3a', 'q': '#5a3a1e', 'l': '#c8ff70', 't': '#7ad04b'}),
    'ult_enrage': (WOLF, '#4a1414', dict(WOLFPAL, E='#ff3a2a')),
    'ult_spikes': (SPIKE, '#2a3420', NATURE),
    'ult_moonfall': (MOONFALL, '#1f2848', MOONPAL),
    'ult_empowered': (EMPOWER, '#4a3a18', {}),
    'ult_inferno': (FLAME, '#5a1c10', {}),
    'ult_blizzard': (SNOW, '#1a3550', {}),
    'ult_storm': (STORM, '#262a48', {}),
    'ult_piercing': (PIERCE, '#4a3a18', {}),
    'ult_orbit': (ORBIT, '#2f4a2f', GREEN),
    'ult_traps': (TRAP, '#2f3a24', {}),
    'ult_frenzy': (CLAWS, '#3a1414', {}),
    'ult_rally': (BANNER, '#1f3050', {}),
    'ult_barricade': (FENCE, '#4a4030', {}),
    'ult_mark': (TARGET, '#2c2436', {}),
    'ult_clones': (CLONES, '#241c30', {}),
    'ult_poisonflask': (FLASK, '#2a3a20', TOXIC_FLASK),
    'ult_oil': (OIL, '#4c3020', {}),
}


def rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def icon(glyph, bg, over):
    pal = dict(BASE); pal.update(over)
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    base = rgb(bg)
    for y in range(N):
        for x in range(N):
            if x in (0, N - 1) or y in (0, N - 1):
                px[x, y] = rgb(INK) + (255,)
            elif x == 1 or y == 1:
                px[x, y] = mix(base, (255, 255, 255), 0.35) + (255,)     # lit bevel, top left
            elif x == N - 2 or y == N - 2:
                px[x, y] = mix(base, (0, 0, 0), 0.45) + (255,)          # shadowed bevel, bottom right
            else:
                t = (x + y) / (2 * N)                                   # a little lighter toward the top left
                px[x, y] = mix(mix(base, (255, 255, 255), 0.12), mix(base, (0, 0, 0), 0.25), t) + (255,)
    w = max(len(r) for r in glyph); h = len(glyph)
    ox, oy = (N - w) // 2, (N - h) // 2
    cells = {(ox + x, oy + y): ch for y, r in enumerate(glyph) for x, ch in enumerate(r) if ch != '.'}
    for (x, y) in list(cells):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in cells and 2 <= q[0] < N - 2 and 2 <= q[1] < N - 2:
                px[q] = rgb(INK) + (255,)
    for (x, y), ch in cells.items():
        px[x, y] = rgb(pal[ch]) + (255,)
    return img.resize((N * P, N * P), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for k, (g, bg, over) in ICONS.items():
        made[k] = icon(g, bg, over)
        made[k].save(os.path.join(OUT, 'ability_' + k + '.png'))
    cols = 7
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 40 + 8, rows * 40 + 8), (22, 28, 24, 255))
    for i, im in enumerate(made.values()):
        sheet.alpha_composite(im, (8 + (i % cols) * 40, 8 + (i // cols) * 40))
    sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(os.path.join(OUT, 'preview-abilities.png'))
    print(len(made), 'ability icons')


if __name__ == '__main__':
    main()
