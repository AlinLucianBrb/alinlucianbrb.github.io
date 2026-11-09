"""Art for the newer heroes (Priest, Warlock, Paladin, Shaman): their ability icons, projectiles, effects, minions and the curse
icons over enemies. Their hero sprites are put together in heroes.py like everyone else's.

Run:  python3 art/kits.py      (writes art/out/ability_*.png, proj_*.png, fx_*.png, ail_*.png, minion_*.png and
                                art/out/preview-kits.png)

Icons use the same frame and glyph rules as abilities.py (16x16 art pixels, glyph up to 12x12); effects use effects.py's
render() and Grid. To add a hero's art: add its glyphs to ICONS and its sprites to SPRITES below.
"""
import os
from PIL import Image
from abilities import icon, BASE, ORB, FLAME
from effects import render, Grid, magic_bolt, OUT

# ---- Ability icons ---------------------------------------------------------------------------------------------------
GOLD = {'a': '#8a6a24', 'A': '#ffe08a', 'O': '#ffffff', 't': '#ffe08a', 'u': '#f4ead2'}
AURA = ['....zzzz....', '..zz....zz..', '.z..yyyy..z.', '.z.y....y.z.', 'z.y..OO..y.z', 'z.y.OwwO.y.z', 'z.y.OwwO.y.z', 'z.y..OO..y.z',
        '.z.y....y.z.', '.z..yyyy..z.', '..zz....zz..', '....zzzz....']
LANCE = ['..........ww', '.........wzw', '........wz..', '.......yz...', '......yy....', '.....yy.....', '....yy......', '...yy.......',
         '..yy........', '.yy.........', 'yY..........']
BOOK = ['..yy....yy..', '.yuuy..yuuy.', 'yuzuuyyuuzuy', 'yuuzuyyuzuuy', 'yuzuuyyuuzuy', 'yuuuuyyuuuuy', 'yuzuuyyuuzuy', 'yuuuuyyuuuuy',
        'yYYYYyyYYYYy', '.....YY.....']
CROSS = ['.....zz.....', '.....yy.....', '..z..yy..z..', '.....yy.....', 'zyyyyOOyyyyz', 'zyyyyOOyyyyz', '.....yy.....', '..z..yy..z..',
         '.....yy.....', '.....yy.....', '.....YY.....']
RIPPLE = ['zz........zz', 'z..yy..yy..z', '..y..yy..y..', '.y..y..y..y.', '.y.y.OO.y.y.', '.y.y.OO.y.y.', '.y..y..y..y.', '..y..yy..y..',
          'z..yy..yy..z', 'zz........zz']
JUDGE = ['....yzzy....', '.....zz.....', '..yyyyyyyy..', '.....wg.....', '.....wg.....', '.....wg.....', '.....wg.....', '.....wg.....',
         '.....wg.....', '.....wg.....', '......g.....', 'z..z....z..z']
GHOST = ['...zzzzz....', '..z.....z...', '....uuuu....', '...uuuuuu...', '..uuvuuvuu..', '..uuuuuuuu..', '..uuuuuuuu..', '..uuuuuuuu..',
         '..uuuuuuuu..', '..u.uu.uu.u.']

PURPLE = {'a': '#4a1f6a', 'A': '#9a5cd6', 'O': '#e0c0ff', 't': '#9a5cd6', 'z': '#9a5cd6', 'y': '#6b3fa0', 'w': '#ffffff'}
IMPG = ['.u......u...', '.uu....uu...', '..RRRRRR....', '.RRyRRyRR...', 'w.RRkkRR.w..', 'ww.RRRR.ww..', 'wWw.RR.wWw..', '.wWRRRRWw...',
        '...R..R.....', '..RR..RR....']
IMPPAL = {'R': '#4a62b8', 'w': '#141a3a', 'W': '#3a4a8a', 'u': '#e6dcc0', 'y': '#7ae0ff', 'k': '#0a0e20'}
SKULL = ['...bbbbbb...', '..bbbbbbbb..', '.bbbbbbbbbb.', '.bbkkbbkkbb.', '.bbkkbbkkbb.', '.bbbbkkbbbb.', '..bbbbbbbb..', '...b.b.b.b..',
         '...bbbbbbb..']
PORTAL = ['...pppppp...', '..pPPPPPPp..', '.pPkkkkkkPp.', '.pPkRRRRkPp.', '.pPkRyyRkPp.', '.pPkRRRRkPp.', '.pPkkkkkkPp.', '.pPkkkkkkPp.',
          '.pPPPPPPPPp.', 'pppppppppppp']
METEOR = ['........oo..', '.......oOo..', '......oOO...', '.....oOo....', '..yyoOo.....', '.yyyyo......', 'yyWWyy......', 'yWWWWy......',
          'yyWWyy......', '.yyyy.......']

HAMMER = ['..KKKKKKK...', '..KggggwG...', '..KgwwwgG...', '..KggggwG...', '..KKKKKKK...', '.....QQ.....', '.....QQ.....', '.....QQ.....',
          '.....QQ.....', '.....QQ.....', '.....qq.....']
FLAIL = ['......o.o...', '.....oKKo...', '....oKggKo..', '.....oKKo...', '......o.o...', '.....g......', '....g.......', '...g........',
         '..Q.........', '.Q..........', 'Q...........']
CHAIN = ['.........KK.', '........KgK.', '.......gKK..', '......g.....', '.....g......', '....g.......', '...g........', '..g.........',
         '.Q..........', 'Q...........']
HORSE = ['.....bb.....', '....bbbm....', '...bbbbmm...', '..bkbbbbmm..', '.bbbbbbbbmm.', 'bbbbb.bbbbm.', 'kb.....bbbm.', '.......bbbb.',
         '.......bbbb.', '.......bbbb.']
GROUND = ['.....zz.....', '.....yy.....', '.z...yy...z.', '.....yy.....', '..z..yy..z..', '.....yy.....', 'yyyyyyyyyyyy', 'zOzOzOzOzOzO',
          'yyyyyyyyyyyy']
HERESY = ['.....yy.....', '.....yy.....', '.....yy.....', '.....yy.....', '..yyyyyyyy..', '..yyyyyyyy..', '.....yy.....', 'o..o.yy.o..o',
          '.oo.oyyo.oo.', 'ooOooOOooOoo']
STAR = ['.....w......', '..w..w..w...', '...w.w.w....', '....WWW.....', 'wwwWWWWWwww.', '....WWW.....', '...w.w.w....', '..w..w..w...',
        '.....w......']

DART = ['', '..........ww', '.........wQ.', '........QQ..', '.......QQ...', '......QQ....', '.....QQ.....', '....QQ......', '..ttQ.......',
        '.tt.........', 'tt..........']
TOTEMG = ['....yyyy....', '...yooooy...', '....QQQQ....', '...QkQQkQ...', '...QQQQQQ...', '...QqkkqQ...', '....QQQQ....', '...QkQQkQ...',
          '...QQQQQQ...', '....QQQQ....', '....qqqq....']
CRACK = ['', 'QQQQq.QQQQQQ', 'QQQQqqQQQQQQ', 'QQQQQqqQQQQQ', 'QQQQqQqQQQQQ', 'QQQqQQQqQQQQ', 'QQqQQQQqqQQQ', 'QqQQQQQQqQQQ', 'qQQQQQQQQqQQ']
MASK = ['..f.f.f.f...', '..fyfyfyf...', '...QQQQQQ...', '..QQQQQQQQ..', '..QEQQQQEQ..', '..QQQQQQQQ..', '..QQrrrrQQ..', '...QQQQQQ...', '....QQQQ....']
LOCUST = ['.t....t...t.', '...t..t.t...', '.t..tt...t..', 't.tt..t.t..t', '..t.tt.t.t..', '.t..t..tt...', '...tt.t...t.', '.t...t..t...']
QUAKE = ['..b.....b...', '.bb.b..bbb..', '............', 'QQQQq.QQQQQQ', 'QQQQqqQQQQQQ', 'QQQQQqqQQQQQ', 'QQQqQQQqQQQQ', 'QQqQQQQqqQQQ', 'QqQQQQQQqQQQ']
WOOD = {'Q': '#8a6a3a', 'q': '#4a3418', 'r': '#c09a5a', 'k': '#1a120a', 'E': '#ffd27a', 'f': '#7ad0e0', 'y': '#7ad0e0', 'o': '#ff8a3d', 'b': '#9a8a7a'}

#   id: (glyph, background colour, palette overrides)
ICONS = {
    # Priest
    'atk_smite': (ORB, '#4a3c18', GOLD),
    'atk_aura_holy': (AURA, '#4a3c18', GOLD),
    'atk_lance': (LANCE, '#3c4250', GOLD),
    'atk_psalm': (BOOK, '#3a2a18', GOLD),
    'ult_blessing': (CROSS, '#4a3c18', GOLD),
    'ult_crescendo': (RIPPLE, '#5a4818', GOLD),
    'ult_judgement': (JUDGE, '#2c3040', GOLD),
    'ult_conversion': (GHOST, '#3a3418', dict(GOLD, v='#5a4818')),
    # Warlock
    'atk_shadow': (ORB, '#2a1a3a', PURPLE),
    'atk_aura_shadow': (AURA, '#241430', PURPLE),
    'atk_imp': (IMPG, '#3a1a24', IMPPAL),
    'atk_hellfire': (FLAME, '#3a1010', {'o': '#ff6a3a', 'O': '#ffb347', 'w': '#ffe9a0'}),
    'ult_souldrain': (SKULL, '#3a1a4a', {'b': '#d8c8e8', 'k': '#2a0a3a'}),
    'ult_doom': (SKULL, '#140a20', {'b': '#9a5cd6', 'k': '#0a0410'}),
    'ult_demongate': (PORTAL, '#1a0e22', {'p': '#4a1f6a', 'P': '#9a5cd6', 'k': '#120818', 'R': '#c4462a', 'y': '#ffd84a'}),
    'ult_infernal': (METEOR, '#2a1010', {'o': '#ff6a3a', 'O': '#ffb347', 'y': '#c4462a', 'W': '#ffe9a0'}),
    # Paladin
    'atk_hammer': (HAMMER, '#4a4428', {}),
    'atk_flail': (FLAIL, '#3a1414', {'o': '#ff6a3a'}),
    'atk_chain': (CHAIN, '#3a2a20', {'K': '#f2e2a0', 'g': '#c8d0dc'}),
    'atk_charge': (HORSE, '#4a3c28', {'b': '#ece6da', 'm': '#8a7a6a', 'k': '#121a14'}),
    'ult_consecration': (GROUND, '#4a3c18', GOLD),
    'ult_heresy': (HERESY, '#2a0e0e', {'y': '#b04a3a', 'o': '#ff6a3a', 'O': '#ffb347'}),
    'ult_purge': (STAR, '#4a4428', {'w': '#fff6c8', 'W': '#ffffff'}),
    'ult_cavalry': (HORSE, '#2c3040', {'b': '#fff0a8', 'm': '#d9b25a', 'k': '#2c3040'}),
    # Shaman (his base attack uses the Lightning icon, atk_lightning)
    'atk_dart': (DART, '#2a3420', {'Q': '#8a6a3a', 't': '#8ad04b', 'w': '#e8ffd0'}),
    'atk_totem': (TOTEMG, '#3a2a18', WOOD),
    'atk_fissure': (CRACK, '#3a2c1e', WOOD),
    'ult_ancestral': (MASK, '#1e3438', WOOD),
    'ult_locusts': (LOCUST, '#2a3420', {'t': '#c8ff70'}),
    'ult_surge': (TOTEMG, '#2a4048', dict(WOOD, y='#ffffff', o='#7ad0e0')),
    'ult_tectonic': (QUAKE, '#2a2016', WOOD),
}

# ---- Effect icons over enemies (8x8 art pixels, like the ailments in effects.py) ---------------------------------------------
AILS = {
    'corruption': (['...p', '..pp', '.pPPp', '.pPWp', 'pPPPPp', 'pPPPPp', '.pPPp', '..pp'], {'p': '#4a1f6a', 'P': '#9a5cd6', 'W': '#e0c0ff'}),
    'hex':        (['', '..pppp', '.pPPPPp', 'pPWkkWPp', 'pPWkkWPp', '.pPPPPp', '..pppp', ''], {'p': '#4a1f6a', 'P': '#9a5cd6', 'W': '#e0c0ff', 'k': '#120818'}),
    'doom':       (['.wwwww', 'wwwwwww', 'wkwwwkw', 'wkwwwkw', 'wwwkwww', '.wwwww', '.w.w.w', ''], {'w': '#c8b0e0', 'k': '#1a0a2a'}),
    'verdict':    (['...y', '.yyyyy', 'y..y..y', 'yy.y.yy', 'yy.y.yy', '...y', '..yyy', '.yyyyy'], {'y': '#ffe08a'}),
    'purge':      (['...w', 'w..w..w', '.w.w.w', '..WWW', 'wwWWWww', '..WWW', '.w.w.w', 'w..w..w'], {'w': '#fff6c8', 'W': '#ffffff'}),
    'link':       (['.gg', 'g..g', 'g.ggg', '.g.g.g', '..ggg.g', '....g..g', '.....gg', ''], {'g': '#5fbf8a'}),
    'stun':       (['.y....y', 'yYy..yYy', '.y....y', '...y', '..yYy', '...y', '', ''], {'y': '#ffd84a', 'Y': '#fff6c8'}),
}


# ---- Projectiles, effects, minions -------------------------------------------------------------------------------------
def judgement():
    """A giant blade pointing down: a white blade, a gold crossguard and hilt, a soft glow."""
    g = Grid(24)
    for y in range(9, 23):
        g.set(11, y, 'w'); g.set(12, y, 'g')
    g.set(11, 23, 'w')
    for x in range(6, 18):
        g.set(x, 7, 'y'); g.set(x, 8, 'Y')
    for y in range(1, 7):
        g.set(11, y, 'Q'); g.set(12, y, 'q')
    g.disc(12, 1.5, 1.6, 'z')
    return render(g.rows(), {'w': '#ffffff', 'g': '#c8d0dc', 'y': '#ffd76a', 'Y': '#b8913e', 'Q': '#8a6a24', 'q': '#5a4818', 'z': '#fff0a8'}, 24, outline=True)


def imp(frame=1):
    up = frame == 1
    rows = ['................',
            '..u........u....',
            '..uu......uu....',
            '...rRRRRRRr.....',
            '..rRRRRRRRRr....',
            '..rRyRRRyRRr....',
            ('w.rRRRRRRRRr.w..' if up else '..rRRRRRRRRr....'),
            ('ww.rRRkkRRr.ww..' if up else '...rRRkkRRr.....'),
            ('wWw.rRRRRr.wWw..' if up else 'w...rRRRRr...w..'),
            ('.wWwrRRRRrwWw...' if up else 'ww.wrRRRRrw.ww..'),
            ('..wWrRRRRrWw....' if up else 'wWwWrRRRRrWwWw..'),
            '....rRRRRr......',
            '....rr..rr......',
            '...rr....rr.....']
    return render(rows, {'r': '#1e2a5a', 'R': '#4a62b8', 'y': '#7ae0ff', 'k': '#0a0e20', 'u': '#e6dcc0', 'w': '#141a3a', 'W': '#3a4a8a'}, 16, outline=True)


def demon(frame=1):
    """The Greater Demon: horns, a lava core, claws; frame 2 raises the arms to cleave."""
    g = Grid(24)
    g.disc(12, 15, 7, 'R', 6); g.disc(10.5, 15, 4, 'r', 5)
    g.disc(12, 7, 4, 'R'); g.disc(11, 7, 2.5, 'r', 3)
    g.line(9, 4, 7, 0, 'u'); g.line(15, 4, 17, 0, 'u')
    g.set(10, 7, 'y'); g.set(14, 7, 'y')
    for x in range(11, 14): g.set(x, 9, 'k')
    g.disc(12, 15, 2.6, 'O'); g.disc(12, 15, 1.4, 'W')
    if frame == 1:
        g.line(5, 12, 3, 18, 'R'); g.line(19, 12, 21, 18, 'R'); g.set(3, 19, 'u'); g.set(21, 19, 'u')
    else:
        g.line(5, 12, 3, 6, 'R'); g.line(19, 12, 21, 6, 'R'); g.set(3, 5, 'u'); g.set(21, 5, 'u')
    for x0 in (8, 14):
        for y in range(20, 24):
            for x in range(x0, x0 + 3): g.set(x, y, 'r')
    return render(g.rows(), {'R': '#3a4a8a', 'r': '#1e2650', 'u': '#e6dcc0', 'y': '#7ae0ff', 'k': '#060a18', 'O': '#7ae0ff', 'W': '#e0f8ff'}, 24, outline=True)


def golem(frame=1):
    """The Infernal golem: a body of rock with glowing lava cracks (frame 2: the cracks flare)."""
    g = Grid(24)
    g.disc(12, 14, 8, 'G', 7); g.disc(10, 14, 5, 'g', 5)
    g.disc(12, 6, 4, 'G'); g.disc(4.5, 13, 3, 'G'); g.disc(19.5, 13, 3, 'G')
    for x0 in (8, 14):
        for y in range(19, 24):
            for x in range(x0, x0 + 3): g.set(x, y, 'g')
    c = 'O' if frame == 2 else 'o'
    for (x0, y0, x1, y1) in ((9, 10, 12, 15), (12, 15, 15, 12), (12, 15, 11, 19), (15, 12, 17, 16)):
        g.line(x0, y0, x1, y1, c)
    g.set(10, 6, 'y'); g.set(14, 6, 'y')
    return render(g.rows(), {'G': '#6a5a52', 'g': '#4a3e38', 'o': '#ff6a3a', 'O': '#ffd27a', 'y': '#ffb347'}, 24, outline=True)


def horse(frame=1):
    """The Crusader's white warhorse, side view facing right, with a red blanket and a gold saddle (frame 2: galloping)."""
    top = ['', '',
           '................mmBB',
           '...............mmBBBB',
           '..............mmBBkBBB',
           '.............mmBBBBBBBB',
           '............mmBBB..bBBb',
           '...........mmBBB....bb',
           '...........mBBBB',
           '.mm......rrrrrBB',
           'mmmBBBBByyyyrrBBb',
           'mmBBBBBBBBBBBBBBb',
           'm.BBBBBBBBBBBBBBb',
           'm.bBBBBBBBBBBBBb',
           '..bbBBBBBBBBBBbb',
           '...bbbbbbbbbbbb']
    legs = (['...bB.bB....bB.bB', '...bB.bB....bB.bB', '...bB.bB....bB.bB', '...bB..bB..bB..bB', '...kk..kk..kk..kk'] if frame == 1 else
            ['...bB..bB...bB.bB', '..bB...bB....bB.bB', '.bB....bB.....bB.bB', 'bB.....bB......bB.bB', 'kk.....kk.......kk.kk'])
    return render(top + legs, {'B': '#ece6da', 'b': '#b8b0a4', 'm': '#8a7a6a', 'k': '#2a2420', 'r': '#b0302a', 'y': '#d9b25a'}, 24, outline=True)


def totem(kind):
    """A carved totem pole with two faces, and its element on top: a flame, an ice crystal or a storm orb."""
    g = Grid(24)
    for y in range(8, 23):
        for x in range(9, 15): g.set(x, y, 'Q' if x < 13 else 'q')
    for y0 in (10, 16):
        g.set(10, y0, 'k'); g.set(13, y0, 'k'); g.set(11, y0 + 2, 'k'); g.set(12, y0 + 2, 'k')
        for x in range(8, 16): g.set(x, y0 + 4, 'r')
    if kind == 'flame':
        g.disc(12, 4.5, 3.5, 'o', 4); g.disc(12, 5.5, 2, 'O'); g.set(12, 0, 'o'); g.set(10, 1, 'o')
        pal = {'o': '#ff6a3a', 'O': '#ffe9a0'}
    elif kind == 'frost':
        g.line(12, 0, 12, 7, 'c'); g.line(9, 2, 15, 6, 'c'); g.line(15, 2, 9, 6, 'c'); g.set(12, 4, 'W')
        pal = {'c': '#8edcff', 'W': '#ffffff'}
    else:
        g.disc(12, 4, 3.2, 'p'); g.disc(12, 4, 1.6, 'W'); g.set(8, 1, 'y'); g.set(16, 7, 'y'); g.set(16, 1, 'y')
        pal = {'p': '#5a62b8', 'W': '#ffe45c', 'y': '#ffe45c'}
    pal.update({'Q': '#8a6a3a', 'q': '#5a3e20', 'k': '#1a120a', 'r': '#c09a5a'})
    return render(g.rows(), pal, 24, outline=True)


def dart():
    rows = ['', '', '', '', '', '', '.tt', '..tQQQQQQQww', '.tt']
    return render(rows, {'t': '#8ad04b', 'Q': '#8a6a3a', 'w': '#e8ffd0'}, 16, outline=True)


SPRITES = {
    'proj_holy': lambda: magic_bolt('#ffffff', '#ffe08a', '#d9b25a', '#fff0a8'),
    'fx_judgement': judgement,
    'proj_shadow': lambda: magic_bolt('#e0c0ff', '#9a5cd6', '#4a1f6a', '#7a3fb0'),
    'proj_hellfire': lambda: magic_bolt('#ffe9a0', '#ff6a3a', '#7a1f2a', '#4a1a1a'),
    'minion_imp': imp, 'minion_imp_2': lambda: imp(2),
    'minion_demon': demon, 'minion_demon_2': lambda: demon(2),
    'minion_golem': golem, 'minion_golem_2': lambda: golem(2),
    'minion_horse': horse, 'minion_horse_2': lambda: horse(2),
    'minion_totem_flame': lambda: totem('flame'), 'minion_totem_frost': lambda: totem('frost'), 'minion_totem_storm': lambda: totem('storm'),
    'proj_dart': dart,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for k, (glyph, bg, over) in ICONS.items():
        made['ability_' + k] = icon(glyph, bg, over)
    for k, fn in SPRITES.items():
        made[k] = fn()
    for k, (rows, pal) in AILS.items():
        made['ail_' + k] = render(rows, pal, 8, outline=True)
    for k, im in made.items():
        im.save(os.path.join(OUT, k + '.png'))
    cols = 8
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 52 + 4, rows * 52 + 4), (22, 28, 24, 255))
    for i, (k, im) in enumerate(made.items()):
        sheet.alpha_composite(im.resize((min(48, im.width), min(48, im.height)), Image.NEAREST), (4 + (i % cols) * 52, 4 + (i // cols) * 52))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-kits.png'))
    print(len(made), 'kit images')


if __name__ == '__main__':
    main()
