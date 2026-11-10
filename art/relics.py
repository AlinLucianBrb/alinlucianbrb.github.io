"""Relic icons for Test TBD: one per relic, shown on the relic chips (left of the screen during a match), in the relic picker
and in the relic tooltips, so relics are easy to tell apart at a glance.

Run:  python3 art/relics.py      (writes art/out/relic_<slug>.png and art/out/preview-relics.png)

Same frame and glyph rules as the ability icons (abilities.py): 32x32 (16x16 art pixels), a bevelled frame in the relic's
colour and a glyph up to 12x12. The colour says what kind of relic it is: red for damage, gold for gold, blue for energy and
speed, brown for minions, green for the attributes... The file name is the relic's name in lower case with every run of
other characters turned into "_" (Four-leaf clover -> relic_four_leaf_clover), the same rule as relicIcon() in
js/game/sprites.js. To add a relic: add its glyph and colour to RELICS below (a test checks that every relic has its icon).
"""
import os
from PIL import Image
from abilities import icon, ARROW, ORB, TARGET, CLAWS, FENCE, BOLT, SWORD, DAGGERS, FLASK, WOLF, WOLFPAL, OUT
from kits import BOOK, SKULL, HERESY, STAR

ROUNDS = ['', '..O...O...O.', '.OyO.OyO.OyO', '.yYy.yYy.yYy', '.yYy.yYy.yYy', '.yYy.yYy.yYy', '.yYy.yYy.yYy', '.QQQ.QQQ.QQQ', '.qqq.qqq.qqq']
BARREL = ['', '', '', 'GGGGGGGGGGG.', 'gWWWWWWWWWGK', 'gWggggggggGK', 'GGGGGGGGGGG.', '..Qq........', '.Qq.........', 'Qq..........']
HANDS = ['..w.w.w.....', '.w.w.w.w....', '.bbbbbbb....', 'bbbbbbbb.w..', 'bbbbbbbbbw..', 'bbbbbbbbb...', '.bbbbbbb.ww.', '..bbbbb.....',
         '..bbbbb..ww.', '..rrrrr.....']
CLOVER = ['...tt..tt...', '..tTTttTTt..', '..tTTttTTt..', '...tTttTt...', 'ttt.tTTt.ttt', 'tTTttTTttTTt', 'tTTttTTttTTt', 'ttt.tTTt.ttt',
          '...tT..Tt...', '.....TT.....', '....TT......', '...TT.......']
PICK = ['..ggggggg...', '.gWWWWWWWg..', 'gW...Q...Wg.', 'g....Q....g.', '.....Q......', '.....Q......', '.....Q...yz.', '.....Q..yzzy',
        '.....Q..yYzy', '.....Q...yy.']
CRATE = ['', 'QQQQQQQQQQQ.', 'QrrrrrrrrrQ.', 'QrQrrrrrQrQ.', 'QrrQrrrQrrQ.', 'QrrrQrQrrrQ.', 'QrrrrQrrrrQ.', 'QrrrQrQrrrQ.', 'QrrQrrrQrrQ.',
         'QrQrrrrrQrQ.', 'QQQQQQQQQQQ.']
BAG = ['....QQQQ....', '.....QQ.....', '....rQQr....', '...rrrrrr...', '..rrryzrrr..', '.rrryzzyrrr.', '.rrryzzyrrr.', '.rrrrzyrrrr.',
       '.rrrrrrrrrr.', '..rrrrrrrr..']
COINS = ['........t...', '.......ttt..', '......t.t.t.', '........t...', '.yzzy...t...', 'yYYYYy..t...', '.yzzy..yzzy.', 'yYYYYyyYYYYy',
         '.yzzy..yzzy.', 'yYYYYyyYYYYy', '.yzzy..yzzy.', 'yYYYYyyYYYYy']
CLOCK = ['...cccccc...', '..cWWWWWWc..', '.cWWWkWWWWc.', 'cWWWWkWWWWWc', 'cWWWWkWWWWWc', 'cWWWWkkkkWWc', 'cWWWWWWWWWWc', 'cWWWWWWWWWWc',
         '.cWWWWWWWWc.', '..cWWWWWWc..', '...cccccc...']
FIST = ['...bbbbbb...', '..bbrbrbrb..', '..brbrbrbb..', '..bbbbbbbb..', '.bbbbbbbbb..', '.bbbbbbbbb..', '..bbbbbbb...', '...bbbbb....',
        '...RRRRR....', '...RRRRR....', '...DDDDD....']
FEATHER = ['.........ll.', '........ltl.', '.......lttl.', '......lttl..', '.....lttl...', '....lttl....', '...lttl.....', '..lttl......',
           '..ltl.......', '.TT.........', 'T...........']
EYE = ['', '', '...cccccc...', '..cWWWWWWc..', '.cWWWCCWWWc.', 'cWWWCkkCWWWc', 'cWWWCkkCWWWc', '.cWWWCCWWWc.', '..cWWWWWWc..', '...cccccc...']
PAW = ['.n.n..n.n...', 'nQnQ.nQnQ...', '.n.n..n.n...', '............', '...nnnnn....', '..nQQQQQn...', '.nQQQQQQQn..', '.nQQQQQQQn..',
       '..nQQQQQn...', '...nnnnn.w..', '........w.w.', '.......w.w..']
DROP = ['.....R......', '.....R......', '....RRR.....', '....RDR.....', '...RRDRR....', '..RRRDRRR...', '..RRRRRRR...', '..RRRRRRR...',
        '...RRRRR....', '....RRR.....']

PUR = {'v': '#e0c0ff', 'p': '#9a5cd6', 'P': '#4a1f6a'}
GOLDISH = {'p': '#ffe08a', 'P': '#9c6a26', 'v': '#ffffff'}
HOLY = {'a': '#8a6a24', 'A': '#ffe08a', 'O': '#ffffff', 't': '#ffe08a'}

RED, GOLD, BLUE, BROWN, GREEN, PURPLE, GREY, TEAL = '#7a2a2a', '#6a5418', '#24486e', '#5a3c22', '#2e5a2a', '#3e2458', '#3e464e', '#1f5a5a'
RELICS = {
    'Sharpened rounds':  (ROUNDS, RED, {}),
    'Long barrels':      (BARREL, GREY, {}),
    'Quick hands':       (HANDS, BLUE, {}),
    'Four-leaf clover':  (CLOVER, GREEN, {}),
    'Battle focus':      (BOLT, BLUE, GOLDISH),
    'Prospector':        (PICK, GOLD, {}),
    'Reinforced gate':   (FENCE, GREY, {}),
    'Bulk order':        (CRATE, GOLD, {}),
    'Split bolt':        (ORB, PURPLE, {}),
    'Tax collector':     (BAG, GOLD, {}),
    'Compound interest': (COINS, GOLD, {}),
    'Fine arrows':       (ARROW, RED, {}),
    'Whetstone':         (SWORD, GREY, {}),
    'Arcane focus':      (BOOK, PURPLE, {'y': '#c39bf2', 'Y': '#6b4fa0', 'u': '#f2e2ff', 'z': '#9a5cd6'}),
    'Keen edge':         (TARGET, RED, {'p': '#ffe08a', 'P': '#9c6a26'}),
    'Cruelty':           (DAGGERS, RED, {'t': '#ff8a80', 'l': '#ffffff', 'T': '#d9574e'}),
    'Quick incantation': (BOOK, BLUE, {'y': '#8edcff', 'Y': '#3f8fc4', 'u': '#e8f6ff', 'z': '#ffffff'}),
    'Duration':          (CLOCK, TEAL, {}),
    'Brawn':             (FIST, RED, {}),
    'Finesse':           (FEATHER, GREEN, {}),
    'Insight':           (EYE, BLUE, {}),
    'Prowess':           (STAR, GOLD, {}),
    'Dark pact':         (SKULL, PURPLE, {'b': '#e0c0ff'}),
    'Blasphemy':         (HERESY, PURPLE, {}),
    'Holy water':        (FLASK, TEAL, {'o': '#ffe08a', 'O': '#ffffff'}),
    'Pack leader':       (WOLF, BROWN, WOLFPAL),
    'Feral haste':       (PAW, BROWN, {}),
    'Hunting instinct':  (TARGET, BROWN, {'p': '#ffb347', 'P': '#8a5a20'}),
    'Savage bite':       (CLAWS, BROWN, {}),
}


def slug(name):
    out, prev = '', False
    for ch in name.lower():
        if ch.isalnum():
            out += ch; prev = False
        elif not prev:
            out += '_'; prev = True
    return out.strip('_')


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for name, (glyph, bg, over) in RELICS.items():
        made['relic_' + slug(name)] = icon(glyph, bg, over)
    for k, im in made.items():
        im.save(os.path.join(OUT, k + '.png'))
    cols = 8
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 36 + 4, rows * 36 + 4), (22, 28, 24, 255))
    for i, im in enumerate(made.values()):
        sheet.alpha_composite(im, (4 + (i % cols) * 36, 4 + (i // cols) * 36))
    sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(os.path.join(OUT, 'preview-relics.png'))
    print(len(made), 'relic icons')


if __name__ == '__main__':
    main()
