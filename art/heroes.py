"""Hero sprites for Test TBD: 64x64 images drawn as 32x32 art pixels (each 2x2 on screen), the same pixel size as the tiles.

Run:  python3 art/heroes.py      (writes art/out/hero_<id>.png for every hero and evolution, and art/out/preview-heroes.png)

Every hero shares one hand-drawn figure (FIGURE: the Ranger, one character per art pixel) and is put together from parts:
  - colours: cloak (5 shades), torso (4 shades: leather, plate or robe), accent (the hero's colour) and the eye glow;
  - a head (hood, helm...), drawn over the hood in FIGURE;
  - a weapon in the right hand (bow, sword, axe, staff, dagger...), an item on the back (quiver) and one in the left (shield,
    dagger); mages wear a robe over the legs.
The outline and the ground shadow are added automatically. Style: light from the top left, 3/4 front view, tall and heroic,
dark, muted clothing so heroes stand out on the grass, the hero colour as the accent, eyes glowing in the shadow.
To add a hero: add an entry to HEROES (and a part below if it needs a new one).
"""
import colorsys, json, os
from PIL import Image

P = 2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

FIGURE = [
#0         1         2         3
#01234567890123456789012345678901
'................................',#0
'.....l.l........................',#1
'.....lfl.....hhH.........Q......',#2
'....YyzY....hjhhH........rQ.....',#3
'....BnNB...hjJjhhH.......l.Q....',#4
'....BnNB..hjJjjhhHH......l..Q...',#5
'....BnNB..hjhXvvvXHH.....l..Qr..',#6
'....BbnB..hjXvEvEvXH.....l...Qr.',#7
'.....BbB..hhXmMmmmXH.....l...Qr.',#8
'......B...jhhXYzYXhhH....l...Qr.',#9
'......gwgGhhhhbnnbhhhhHH.l...Qr.',#10
'.....gwggGhhhnNnBbhhhHHb.l...Qr.',#11
'....jGgGhhnNnnnnnbBhhHHbbl...Qr.',#12
'....jJhhhnNnnnnnBBbhhHHHbbn..Qr.',#13
'...jJjhhhnNnnnnBBnbbhhHH.nnsssr.',#14
'...jjhhhnNnnYyBnnbbBhhHH...sSSr.',#15
'...jjhhhnNnBBnnnnbbBhhHH.....Qr.',#16
'...jjhhHHBBBBByzYBBBhhHHH....Qr.',#17
'..jjhhhHHbnnnBnnnbBBhhHHH....Qr.',#18
'..jjhhHH.pPpppPpppPPhhHHHl...Qr.',#19
'..jjhhHH.pPpp.PpppPP.hHHHl...Qr.',#20
'..jjhHH..pPpp.PpppPP.hHHHl...Qr.',#21
'..jhhHH..pPpp.PpppPP..hHHl..Qr..',#22
'..jhhH...pPpp.PpppPP..hHHl.Qr...',#23
'.jhhHH...nNbB.nNbbBB..hHHlQr....',#24
'.jhH.H...nNbB.nNbbBB...hHQr.....',#25
'.jH..H..nnNbB.nNbbbB...hHQ......',#26
'.h...H..BBBBB.BBBBBB....H.......',#27
'................................',#28
'................................',#29
'................................',#30
'................................',#31
]


# ---- Colours -----------------------------------------------------------------------------------------------------------
FIXED = {
    'k': '#121a14',                                                    # outline
    'v': '#0b120e', 'm': '#26262c', 'M': '#3c3c46',                    # face shadow, mask
    's': '#d39a72', 'S': '#a06a4a',                                    # skin
    'D': '#34200f', 'd': '#57361f', 'i': '#82552f', 'I': '#ad7e4a',    # leather: boots, quiver, straps
    'P': '#26251f', 'p': '#3d3a31',                                    # trousers
    'K': '#2c323a', 'G': '#56606b', 'g': '#8f99a4', 'w': '#dde4ea',    # steel
    'q': '#3e2412', 'Q': '#7a4b26', 'r': '#b98447', 'l': '#e9e1c9',    # wood, bowstring
    'u': '#e6dcc0', 'U': '#a89a78', 'W': '#ffffff',                    # bone / horn, white
}
STEEL = ['#23282f', '#3f4852', '#626d79', '#8e99a5']        # plate armour: darker than the helm so the head stands out
LEATHER = ['#34200f', '#57361f', '#82552f', '#ad7e4a']


def hx(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def tohex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in rgb)


def scale(c, f):
    """Darker (f < 1) or lighter (f > 1) along the colour's own value, lights drifting a little toward warm white."""
    r, g, b = hx(c)
    if f <= 1:
        return tohex((r * f, g * f, b * f))
    t = f - 1
    return tohex((r + (255 - r) * t * 0.5 + r * t * 0.3, g + (255 - g) * t * 0.5 + g * t * 0.3, b + (255 - b) * t * 0.45 + b * t * 0.2))


def shades(c, factors):
    return [scale(c, f) for f in factors]


def palette(h):
    pal = dict(FIXED)
    cloak = h.get('cloakShades') or shades(h['cloak'], [0.3, 0.48, 0.7, 1, 1.38])
    pal.update(zip('XHhjJ', cloak))
    torso = h.get('torsoShades') or (STEEL if h['torso'] == 'steel' else LEATHER if h['torso'] == 'leather'
                                     else shades(h['torso'], [0.4, 0.67, 1, 1.33]))
    pal.update(zip('BbnN', torso))
    acc = h['accent']
    pal.update({'Y': scale(acc, 0.62), 'y': acc, 'z': scale(acc, 1.6)})
    pal['E'] = h['glow']
    pal['f'] = h.get('fletch', '#d9574e')
    orb = h.get('orb', h['glow'])
    pal.update({'a': scale(orb, 0.45), 'A': scale(orb, 0.75), 'o': orb})
    return pal


# ---- The shared figure, without the Ranger's bow and quiver ---------------------------------------------------------------
def base():
    g = [list(r) for r in FIGURE]
    for y in range(32):
        for x in range(25, 32):
            g[y][x] = '.'
    g[13][25], g[13][26] = 'b', 'n'                                   # the right forearm and hand stay
    g[14][25:30] = list('nnsss')
    g[15][27:30] = list('sSS')
    for y in range(0, 10):                                             # the quiver goes
        for x in range(0, 9):
            g[y][x] = '.'
    for y in range(24, 28):                                            # boots are always leather
        for x in range(7, 21):
            g[y][x] = {'B': 'D', 'b': 'd', 'n': 'i', 'N': 'I'}.get(g[y][x], g[y][x])
    return g


def from_figure(x0, x1, y0, y1, keep):
    """Cells of FIGURE in a box, as overlay segments (only the characters in keep)."""
    out = []
    for y in range(y0, y1):
        out.append((y, x0, ''.join(c if c in keep else '.' for c in FIGURE[y][x0:x1])))
    return out


def put(g, segs):
    for y, x, s in segs:
        for i, c in enumerate(s):
            if c != '.' and 0 <= x + i < 32 and 0 <= y < 32:
                g[y][x + i] = c


# ---- Heads: replace the box cols 9-21, rows 0-9 ----------------------------------------------------------------------------
HEAD_X = 9
HEADS = {
    'hood': [''.join(FIGURE[y][9:22]) for y in range(10)],
    'hood_trim': [  # the hood with the accent along its opening
        '.............', '.............', '....hhH......', '...hjhhH.....', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjyXvvvXyH..', '.hjyvEvEvyH..', '.hhyMMmmmyH..', '.jhhYyzyYhhH.'],
    'hood_ears': [  # hunter: a wolf-pelt hood with ears
        '.............', '...Jh...hH...', '...jhh.hhH...', '...hjhhhhH...', '..hjJjhhhH...', '.hjJjjhhHH...',
        '.hjuXvvvXuH..', '.hjXvEvEvXH..', '.hhXmMmmmXH..', '.jhhXYzYXhhH.'],
    'hood_mage': [  # a tall pointed hood with a circlet and a glowing gem
        '........H....', '.......hH....', '......hhH....', '....hjhhH....', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjYyEyYXHH..', '.hjXvEvEvXH..', '.hhXvvvvvXH..', '.jhhXYzYXhhH.'],
    'hood_antlers': [  # druid: a hood with antlers
        'u..u...u..u..', '.u.u...u.u...', '..u.hhH.u....', '..uhjhhHu....', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjhXvvvXHH..', '.hjXvEvEvXH..', '.hhXmMmmmXH..', '.jhhXYzYXhhH.'],
    'hood_goggles': [  # alchemist: goggles pushed up on the hood
        '.............', '.............', '....hhH......', '...hjhhH.....', '..hjJjhhH....', '.hKzKKzKHH...',
        '.hKyKKyKXH...', '.hjXvEvEvXH..', '.hhXmMmmmXH..', '.jhhXYzYXhhH.'],
    'hood_priest': [  # a light cowl with a gold circlet across the brow
        '.............', '.............', '....hhH......', '...hjhhH.....', '..hjJjhhH....', '.hjyyzyyHH...',
        '.hjyXvvvXyH..', '.hjyvEvEvyH..', '.hhyMMmmmyH..', '.jhhYyzyYhhH.'],
    'hood_halo': [  # Incantation: the cowl under a floating halo
        '...zyyyyz....', '..z......z...', '....hhH......', '...hjhhH.....', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjyXvvvXyH..', '.hjyvEvEvyH..', '.hhyMMmmmyH..', '.jhhYyzyYhhH.'],
    'helm_wings': [  # Archangel: a bright helm with small wings
        'W...........W', 'wW.........Ww', '.wW.wggG..Ww.', '..wwwgggGKw..', '..wwggggGGK..', '..wgKKKKKGK..',
        '..wKvEvEvKK..', '..wgGgvgGGK..', '..KgGgvgGKK..', '.jhhKYzYKhhH.'],
    'hood_horns': [  # Warlock: a hood with two small horns
        '.............', '..u......U...', '..uu.hhHUU...', '...uhjhhU....', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjhXvvvXHH..', '.hjXvEvEvXH..', '.hhXmMmmmXH..', '.jhhXYzYXhhH.'],
    'hat_inquisitor': [  # a wide-brimmed hat with a gold band
        '.............', '.............', '....KKKK.....', '....KKKK.....', '...KYyYK.....', 'KKKKKKKKKKK..',
        '.hjXvvvvXHH..', '.hjXvEvEvXH..', '.hhXmMmmmXH..', '.jhhXYzYXhhH.'],
    'helm_cross': [  # Crusader: a great helm with a cross on the brow
        '.............', '.............', '...KwwggGK...', '..KwwyggGGK..', '..wyyyyyyGK..', '..wgKyKKKGK..',
        '..wKvEvEvKK..', '..wgGvyvGGK..', '..KgGgggGKK..', '.jhhKYzYKhhH.'],
    'mask_feathers': [  # Shaman: a carved wooden mask under a crest of feathers
        '..f.f.f......', '..fyfyf......', '...fyf.......', '....hhH......', '..hjJjhhH....', '.hjJjjhhHH...',
        '.hjQQQQQXHH..', '.hjQEQQEQXH..', '.hhQQrrQQXH..', '.jhhXYzYXhhH.'],
    'mask_skull': [  # Witch Doctor: a bone mask in the hood
        '.............', '.............', '....hhH......', '...hjhhH.....', '..hjuuuuH....', '.hjuuuuuuH...',
        '.hjuEuuEuHH..', '.hjuuuuuuXH..', '.hhXuvuvuXH..', '.jhhXYzYXhhH.'],
    'helm': [
        '.............', '.............', '....wggG.....', '...wwgggGK...', '..wwggggGGK..', '..wgKKKKKGK..',
        '..wKvEvEvKK..', '..wgGgvgGGK..', '..KgGgvgGKK..', '.jhhKYzYKhhH.'],
    'helm_horns': [
        'u...........U', 'uu..........U', '.uu.wggG...UU', '..uwwgggGKUU.', '..wwggggGGK..', '..wgKKKKKGK..',
        '..wKvEvEvKK..', '..wgGgvgGGK..', '..KgGgvgGKK..', '.jhhKYzYKhhH.'],
    'helm_plume': [
        '....zyy......', '...zyyyYY....', '....wggGYY...', '...wwgggGKY..', '..wwggggGGKY.', '..wgKKKKKGKY.',
        '..wKvEvEvKK..', '..wgGgvgGGK..', '..KgGgvgGKK..', '.jhhKYzYKhhH.'],
    'helm_great': [
        '.............', '.............', '...KwwggGK...', '..KwwgggGGK..', '..wwYyzyYGK..', '..wgKKKKKGK..',
        '..wKvEvEvKK..', '..wgGvgvGGK..', '..KgGgggGKK..', '.jhhKYzYKhhH.'],
}

# ---- Right hand weapons (the hand is drawn again on top), back items and left hand items ------------------------------------
BOW = from_figure(25, 32, 2, 27, 'Qrlq')
WEAPONS = {
    'bow': BOW,
    'sword': [(1, 28, 'w')] + [(y, 28, 'wg') for y in range(2, 13)] + [(13, 27, 'Yyzy'), (16, 28, 'y')],
    'axe': [(2, 28, 'K'), (3, 28, 'Qwg'), (4, 28, 'QwgG'), (5, 27, 'gQwgG'), (6, 27, 'gQwgG'), (7, 28, 'QwgG'), (8, 28, 'Qwg')]
           + [(y, 28, 'Q') for y in range(9, 26)],
    'staff': [(0, 28, 'AA'), (1, 27, 'AoWA'), (2, 27, 'aAoA'), (3, 28, 'aa'), (4, 27, 'Q.Q')] + [(y, 28, 'Q') for y in range(5, 28)],
    'dagger': [(13, 28, 'y'), (16, 27, 'YyY')] + [(y, 28, 'wg') for y in range(17, 21)] + [(21, 28, 'w')],
    'dagger_toxic': [(13, 28, 'y'), (16, 27, 'YyY')] + [(y, 28, 'oA') for y in range(17, 21)] + [(21, 28, 'o'), (23, 28, 'o')],
    'boomerang': [(4, 29, 'zY'), (5, 28, 'zyY'), (6, 28, 'zy'), (7, 28, 'zy'), (8, 28, 'zy'), (9, 28, 'zy'), (10, 28, 'zyzz'),
                  (11, 28, 'zyyy'), (12, 28, 'YYYY')],
    'flask': [(9, 28, 'Q'), (10, 28, 'g'), (11, 27, 'woA'), (12, 26, 'wooAa'), (13, 26, 'woAAa')],
    # Druid: a gnarled branch with leaves around a glowing seed
    'staff_nature': [(y, 28, 'Q') for y in range(4, 28)] + [(0, 26, 'y..z'), (1, 26, 'Yy.zy'), (2, 27, 'QoQ'), (3, 27, 'qAQ'),
                     (9, 29, 'y'), (10, 29, 'Yy'), (16, 27, 'y'), (17, 26, 'yY')],
    # Lunar Druid: a silver crescent moon on a staff
    'staff_moon': [(y, 28, 'Q') for y in range(4, 28)] + [(0, 28, 'ooW'), (1, 27, 'oo'), (2, 27, 'o'), (3, 27, 'oo'), (4, 28, 'ooW')],
    # Priest: a staff crowned with a golden sun
    'staff_holy': [(0, 28, 'z'), (1, 27, 'zyz'), (2, 26, 'zyWyz'), (3, 27, 'zyz'), (4, 28, 'y')] + [(y, 28, 'Q') for y in range(5, 28)],
    # Archangel: a spear of light, gold shaft and a white blade
    'spear_light': [(0, 28, 'W'), (1, 28, 'W'), (2, 27, 'zWz'), (3, 28, 'z')] + [(y, 28, 'y') for y in range(4, 28)],
    # Occult: a staff topped with a glowing eye
    'staff_eye': [(0, 27, 'aaa'), (1, 26, 'aAoAa'), (2, 26, 'aoEoa'), (3, 26, 'aAoAa'), (4, 27, 'aaa')] + [(y, 28, 'Q') for y in range(5, 28)],
    # Paladin: a war hammer
    'hammer': [(1, 26, 'KggG'), (2, 26, 'gwgG'), (3, 26, 'gwgG'), (4, 26, 'KggG')] + [(y, 28, 'Q') for y in range(5, 28)],
    # Heretic: a spiked flail ball wreathed in fire (the orb colour), on a short chain
    'flail': [(1, 28, 'o'), (2, 27, 'oKo'), (3, 26, 'oKgKo'), (4, 27, 'oKo'), (5, 28, 'o'), (6, 28, 'g'), (7, 29, 'g'), (8, 28, 'g'),
              (9, 29, 'g'), (10, 28, 'g')] + [(y, 28, 'Q') for y in range(11, 28)],
    # Inquisitor: a long chain flail
    'flail_chain': [(0, 30, 'K'), (1, 29, 'KgK'), (2, 30, 'K'), (3, 29, 'g'), (4, 30, 'g'), (5, 29, 'g'), (6, 30, 'g'), (7, 29, 'g'),
                    (8, 28, 'g'), (9, 28, 'g')] + [(y, 28, 'Q') for y in range(10, 28)],
    # Crusader: a lance with a pennant in his colour
    'lance': [(0, 28, 'w'), (1, 28, 'w'), (2, 28, 'w'), (3, 27, 'gwg'), (4, 28, 'g'), (5, 29, 'yy'), (6, 29, 'yyy'), (7, 29, 'yy')]
             + [(y, 28, 'Q') for y in range(8, 28)],
    # Earthcaller: a stone maul
    'maul': [(1, 26, 'GGgG'), (2, 25, 'GgggGG'), (3, 25, 'GggGGG'), (4, 26, 'GGGG')] + [(y, 28, 'Q') for y in range(5, 28)],
    # Totemist: a little carved totem pole on a staff, a glowing ember in it
    'staff_carved': [(0, 27, 'yyy'), (1, 27, 'QEQ'), (2, 27, 'QQQ'), (3, 27, 'oEo'), (4, 27, 'ooo'), (5, 27, 'QEQ'), (6, 27, 'QQQ')]
                    + [(y, 28, 'Q') for y in range(7, 28)],
    # Animalic Druid: a totem with a beast skull and feathers
    'staff_totem': [(y, 28, 'Q') for y in range(3, 28)] + [(0, 27, 'uuU'), (1, 27, 'vUv'), (2, 27, 'uuU'), (3, 27, 'u.u'),
                    (5, 29, 'f'), (6, 29, 'f'), (7, 29, 'f')],
}
HAND = [(14, 25, 'nnsss'), (15, 27, 'sSS')]
BACK = {
    'quiver': [(1, 5, 'l.l'), (2, 5, 'lfl'), (3, 4, 'YyzY'), (4, 4, 'DiID'), (5, 4, 'DiID'), (6, 4, 'DiID'), (7, 4, 'DdiD'),
               (8, 5, 'DdD'), (9, 6, 'D')],
}
LEFT = {
    'shield': [(11, 2, 'KwwwwgGK'), (12, 2, 'wyyzyyYG'), (13, 2, 'wyyzyyYG'), (14, 2, 'wzzzzzYG'), (15, 2, 'wyyzyyYG'),
               (16, 2, 'wyyzyyYG'), (17, 2, 'GyyzyyYK'), (18, 3, 'GyzyYK'), (19, 3, 'GyzyYK'), (20, 4, 'GzYK'), (21, 4, 'GK'),
               (22, 5, 'K')],
    'dagger': [(16, 4, 'y'), (17, 3, 'sS'), (18, 2, 'YyY')] + [(y, 3, 'wg') for y in range(19, 22)] + [(22, 3, 'w')],
    # Gospel: a holy book held in the left hand
    'tome': [(14, 2, 'YyyyyY'), (15, 2, 'YuuuuY'), (16, 2, 'YuzzuY'), (17, 2, 'YuuuuY'), (18, 2, 'YyyyyY')],
    'dagger_toxic': [(16, 4, 'y'), (17, 3, 'sS'), (18, 2, 'YyY')] + [(y, 3, 'oA') for y in range(19, 22)] + [(22, 3, 'o'),
                     (24, 3, 'o')],
}
# Archangel's wings: drawn BEHIND the figure (only on empty cells), a big one on the left and the tip of the right one.
WINGS = [(3, 6, 'Ww'), (4, 4, 'WWwg'), (5, 2, 'WWWwwg'), (6, 1, 'WWWWwwg'), (7, 0, 'WWWWwwgg'), (8, 0, 'WWWwwwgg'), (9, 0, 'WWwwwggG'),
         (10, 0, 'Wwwwgg'), (11, 0, 'wwwggG'), (12, 0, 'wwgg'), (13, 0, 'wggG'), (14, 1, 'gG'), (15, 1, 'gG'), (16, 2, 'G'),
         (2, 21, 'wW'), (3, 21, 'gwW'), (4, 22, 'gwW'), (5, 23, 'gw'), (6, 23, 'gw'), (7, 24, 'g')]
ROBE = [(19, 9, 'nNnnnnnnbbB'), (20, 9, 'nNnnnnnnbbB'), (21, 8, 'nNnnnnnnnbbB'), (22, 8, 'nNnnnnnnnbbB'),
        (23, 8, 'nNnnnnnnbbbB'), (24, 8, 'NnnnnnnnbbbB'), (25, 8, 'nNnnnnnnbbbB'), (26, 8, 'YyyyyyyyyyyY'),
        (27, 8, '.DDDD..DDDD.')]


def compose(h):
    g = base()
    if h.get('robe'):
        for y in range(19, 28):
            for x in range(8, 20):
                g[y][x] = '.'
        put(g, ROBE)
    head = HEADS[h['head']]
    for y in range(10):
        for i in range(13):
            g[y][HEAD_X + i] = head[y][i]
    if h.get('wings'):
        for y, x, seg in WINGS:
            for i, c in enumerate(seg):
                if c != '.' and g[y][x + i] == '.':
                    g[y][x + i] = c
    if h.get('back'):
        put(g, BACK[h['back']])
    if h.get('left'):
        put(g, LEFT[h['left']])
    put(g, WEAPONS[h['weapon']])
    if h['weapon'] != 'bow':
        put(g, HAND)
    else:
        put(g, [(14, 25, 'nn'), (14, 27, 'sss'), (15, 27, 'sSS')])
    return [''.join(r) for r in g]


# ---- Heroes: base heroes and their evolutions (ids as in js/content/data.js) ---------------------------------------------
RANGER_CLOAK = ['#0f1a1c', '#18302f', '#244842', '#356457', '#4f8673']
HEROES = {
    'warrior':       {'cloak': '#7a2a2e', 'torso': 'steel', 'accent': '#d9b25a', 'glow': '#7fd8ff', 'head': 'helm', 'weapon': 'sword'},
    'berserker':     {'cloak': '#5e2a22', 'torso': 'leather', 'accent': '#e5645a', 'glow': '#ff5a4a', 'head': 'helm_horns', 'weapon': 'axe'},
    'commander':     {'cloak': '#2c4a7a', 'torso': 'steel', 'accent': '#7fb3ff', 'glow': '#6ab8ff', 'head': 'helm_plume', 'weapon': 'sword'},
    'sentinel':      {'cloak': '#5b4a2e', 'torso': 'steel', 'accent': '#c9b37e', 'glow': '#ffd36a', 'head': 'helm_great', 'weapon': 'sword', 'left': 'shield'},
    'ranger':        {'cloak': '#356457', 'cloakShades': RANGER_CLOAK, 'torso': 'leather', 'accent': '#e8a940', 'glow': '#ffd36a', 'head': 'hood', 'weapon': 'bow', 'back': 'quiver'},
    'marksman':      {'cloak': '#3e4858', 'torso': 'leather', 'accent': '#ffd76a', 'glow': '#ffd76a', 'head': 'hood_trim', 'weapon': 'bow', 'back': 'quiver', 'fletch': '#ffd76a'},
    'boomeranger':   {'cloak': '#3d6a3a', 'torso': 'leather', 'accent': '#8be28b', 'glow': '#b8ffb0', 'head': 'hood', 'weapon': 'boomerang'},
    'hunter':        {'cloak': '#5a5634', 'torso': 'leather', 'accent': '#7ad04b', 'glow': '#a8ff6a', 'head': 'hood_ears', 'weapon': 'bow', 'back': 'quiver', 'fletch': '#7ad04b'},
    'mage':          {'cloak': '#43356a', 'torso': '#4e3e70', 'accent': '#c39bf2', 'glow': '#e8d2ff', 'orb': '#c39bf2', 'head': 'hood_mage', 'weapon': 'staff', 'robe': True},
    'firemage':      {'cloak': '#5c2a1e', 'torso': '#5e2c1e', 'accent': '#ff7a45', 'glow': '#ffb347', 'orb': '#ff8a3d', 'head': 'hood_mage', 'weapon': 'staff', 'robe': True},
    'coldmage':      {'cloak': '#24395c', 'torso': '#28405f', 'accent': '#72c8f0', 'glow': '#c8f2ff', 'orb': '#8edcff', 'head': 'hood_mage', 'weapon': 'staff', 'robe': True},
    'lightningmage': {'cloak': '#2a3050', 'torso': '#30385e', 'accent': '#d6a2ff', 'glow': '#f2e2ff', 'orb': '#e0b8ff', 'head': 'hood_mage', 'weapon': 'staff', 'robe': True},
    'rogue':         {'cloak': '#2e4040', 'torso': '#4a3a30', 'accent': '#4fb3a9', 'glow': '#7ff0e4', 'head': 'hood', 'weapon': 'dagger', 'left': 'dagger'},
    'assassin':      {'cloak': '#2c2436', 'torso': '#3c3244', 'accent': '#9b6bd6', 'glow': '#d2a8ff', 'head': 'hood', 'weapon': 'dagger', 'left': 'dagger'},
    'toxicologist':  {'cloak': '#35422a', 'torso': '#4a4632', 'accent': '#a6d94a', 'glow': '#c8ff70', 'orb': '#a6d94a', 'head': 'hood', 'weapon': 'dagger_toxic', 'left': 'dagger_toxic'},
    'alchemist':     {'cloak': '#4c3626', 'torso': 'leather', 'accent': '#ff9f43', 'glow': '#ffc070', 'orb': '#ff9f43', 'head': 'hood_goggles', 'weapon': 'flask'},
    'druid':         {'cloak': '#54482c', 'torso': 'leather', 'accent': '#8fbf5a', 'glow': '#c8ff70', 'orb': '#a8f070', 'head': 'hood_antlers', 'weapon': 'staff_nature'},
    'animalic':      {'cloak': '#5a4430', 'torso': 'leather', 'accent': '#c98a4b', 'glow': '#ffb347', 'head': 'hood_ears', 'weapon': 'staff_totem', 'fletch': '#c98a4b'},
    'naturist':      {'cloak': '#23452a', 'torso': '#3e4e28', 'accent': '#5fcf6a', 'glow': '#b6ff8a', 'orb': '#7ad04b', 'head': 'hood_antlers', 'weapon': 'staff_nature', 'robe': True},
    'priest':        {'cloak': '#cfc4a6', 'torso': '#e2d8bf', 'accent': '#e8c25a', 'glow': '#fff0a8', 'orb': '#fff0a8', 'head': 'hood_priest', 'weapon': 'staff_holy', 'robe': True},
    'incantation':   {'cloak': '#b8913e', 'torso': '#efe2b8', 'accent': '#ffd76a', 'glow': '#fff6c8', 'orb': '#ffe9a0', 'head': 'hood_halo', 'weapon': 'staff_holy', 'robe': True},
    'archangel':     {'cloak': '#c9d4e2', 'torso': 'steel', 'accent': '#fff6c8', 'glow': '#fffbe6', 'head': 'helm_wings', 'weapon': 'spear_light', 'wings': True},
    'gospel':        {'cloak': '#6e5230', 'torso': '#d9cba6', 'accent': '#ffe9a0', 'glow': '#fff0a8', 'head': 'hood_trim', 'weapon': 'staff_holy', 'left': 'tome', 'robe': True},
    'warlock':       {'cloak': '#3a2850', 'torso': '#4a3466', 'accent': '#9a5cd6', 'glow': '#e0c0ff', 'orb': '#b47aff', 'head': 'hood_horns', 'weapon': 'staff', 'robe': True},
    'occult':        {'cloak': '#241a36', 'torso': '#2e2244', 'accent': '#7a4fc0', 'glow': '#c8a0ff', 'orb': '#a070ff', 'head': 'hood_mage', 'weapon': 'staff_eye', 'robe': True},
    'summoner':      {'cloak': '#4a1e2a', 'torso': '#3a2440', 'accent': '#c46aff', 'glow': '#ff7a5a', 'head': 'hood_horns', 'weapon': 'staff_totem', 'fletch': '#c46aff'},
    'infernalist':   {'cloak': '#3a1410', 'torso': '#4a2016', 'accent': '#ff6a3a', 'glow': '#ffb347', 'orb': '#ff6a3a', 'head': 'helm_horns', 'weapon': 'staff', 'robe': True},
    'paladin':       {'cloak': '#c9b98a', 'torso': 'steel', 'accent': '#e8c25a', 'glow': '#fff0a8', 'head': 'helm_great', 'weapon': 'hammer', 'left': 'shield'},
    'heretic':       {'cloak': '#3a1414', 'torso': '#2e2a32', 'accent': '#ff6a3a', 'glow': '#ff5a2a', 'orb': '#ff6a3a', 'head': 'helm_horns', 'weapon': 'flail'},
    'inquisitor':    {'cloak': '#6a1a1a', 'torso': '#2e2428', 'accent': '#f2e2a0', 'glow': '#fff6c8', 'head': 'hat_inquisitor', 'weapon': 'flail_chain'},
    'crusader':      {'cloak': '#e2dccb', 'torso': 'steel', 'accent': '#c8302a', 'glow': '#ffd76a', 'head': 'helm_cross', 'weapon': 'lance', 'left': 'shield'},
    'shaman':        {'cloak': '#2f5054', 'torso': 'leather', 'accent': '#7ad0e0', 'glow': '#c8f8ff', 'orb': '#7ad0e0', 'head': 'mask_feathers', 'weapon': 'staff', 'fletch': '#7ad0e0'},
    'witchdoctor':   {'cloak': '#2e3a22', 'torso': '#4a3a26', 'accent': '#8ad04b', 'glow': '#c8ff70', 'head': 'mask_skull', 'weapon': 'staff_totem', 'fletch': '#8ad04b'},
    'totemist':      {'cloak': '#5a3a22', 'torso': 'leather', 'accent': '#d9a35a', 'glow': '#ffd27a', 'orb': '#ff8a3d', 'head': 'mask_feathers', 'weapon': 'staff_carved', 'fletch': '#d9a35a'},
    'earthcaller':   {'cloak': '#4a3a2a', 'torso': '#5a4a3a', 'accent': '#b08a5a', 'glow': '#ffb347', 'head': 'hood_ears', 'weapon': 'maul'},
    'lunar':         {'cloak': '#2c3456', 'torso': '#323c66', 'accent': '#b8c8ff', 'glow': '#e0e8ff', 'orb': '#dfe8ff', 'head': 'hood_mage', 'weapon': 'staff_moon', 'robe': True},
}


def sprite(rows, pal, shadow=(15, 28.5, 10, 2)):
    """rows: a square grid of characters (any size) -> an image at P x, with the outline and the ground shadow added.
    shadow: (centre x, centre y, radius x, radius y) in art pixels, or None."""
    n = len(rows)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = img.load()
    filled = set()
    for y, row in enumerate(rows):
        assert len(row) == n, (y, len(row), row)
        for x, ch in enumerate(row):
            if ch != '.':
                px[x, y] = hx(pal[ch]) + (255,)
                filled.add((x, y))
    for y in range(n):
        for x in range(n):
            if (x, y) in filled:
                continue
            if any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = hx(pal['k']) + (255,)                        # outline
            elif shadow and ((x + 0.5 - shadow[0]) / shadow[2]) ** 2 + ((y + 0.5 - shadow[1]) / shadow[3]) ** 2 <= 1:
                px[x, y] = (10, 20, 12, 90)                             # shadow on the ground
    return img.resize((n * P, n * P), Image.NEAREST)


def breathe(rows, split=19):
    """The idle animation's second frame: everything above the hips (head, cloak, weapon) one art pixel lower."""
    return ['.' * 32 if y == 0 else rows[y - 1] if y <= split else rows[y] for y in range(32)]


def main():
    os.makedirs(OUT, exist_ok=True)
    imgs = {k: sprite(compose(h), palette(h)) for k, h in HEROES.items()}
    for k, im in imgs.items():
        im.save(os.path.join(OUT, 'hero_' + k + '.png'))
    for k, h in HEROES.items():                    # the second frame: breathing in (the game alternates the two)
        sprite(breathe(compose(h)), palette(h)).save(os.path.join(OUT, 'hero_' + k + '_2.png'))
    # Preview: one row per base hero (the hero, then its three evolutions) on grass, at 2x.
    tiles = Image.open(os.path.join(OUT, 'tiles.png'))
    meta = json.load(open(os.path.join(OUT, 'tiles.json')))
    def tile(name):
        i, c = meta['tiles'][name], meta['columns']
        return tiles.crop(((i % c) * 64, (i // c) * 64, (i % c) * 64 + 64, (i // c) * 64 + 64))
    ids = list(HEROES)
    cols, rows = 4, (len(ids) + 3) // 4
    bg = Image.new('RGBA', (64 * cols, 64 * rows))
    for y in range(rows):
        for x in range(cols):
            bg.paste(tile('grass_%d' % ((y % 4) * 4 + x)), (x * 64, y * 64))
    for i, k in enumerate(ids):
        bg.alpha_composite(imgs[k], ((i % cols) * 64, (i // cols) * 64))
    bg.resize((bg.width * 2, bg.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview-heroes.png'))
    print(len(imgs), 'heroes')


if __name__ == '__main__':
    main()
