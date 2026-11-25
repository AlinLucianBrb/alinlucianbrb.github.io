"""The UI kit in the heroes' style: builds assets/ui_*.png (9-slice frames used by the CSS as border images).

Run:  python3 art/pixellab/build_ui.py

The old kit (art/ui.py) was drawn at 2 screen pixels per art pixel, in flat green stone. This one is drawn at 1 screen
pixel per art pixel, like the heroes on the field, in their materials: dark oiled wood, a thin bronze bead, an ink
outline, and gold leaf ornaments on the corners of the big panels (cut from a Pixel Lab frame, ui/panel_stone.png).
Faces are calm (a soft top-lit gradient), with sparse sharp highlights: the bead's lit edge, rivets, the leaves.

Sizes (each frame's slice = the border-image slice in index.html, "UI kit v2"):
  panel / panel_light / tooltip: 72x72 + a 4 px margin for the leaves that overhang; slice 24 (no fill: the middle is
    transparent and the box shows ui_planks*.png, a seamless tile, as its background), outset 4, sides repeated (round)
  buttons and tabs: 32x32, slice 10 (all enamel plates like the Relic button: amber gold for plain buttons and tabs (a touch softer than go), bright gold / red / violet / green for go / bad / relic / on)
  slot / input / bar: 16x16, slice 5      chip: 8x8, slice 3
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', '..', 'assets')
INK = (12, 14, 12)


def hexc(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


WOOD = hexc('#3a2a1f'); WOOD_D = hexc('#271b13'); WOOD_L = hexc('#54402f')
BRONZE = hexc('#8f6a3a'); BRONZE_L = hexc('#d6a85c'); BRONZE_D = hexc('#4f3920')


def grain(x, y):
    """A sparse wood grain along the frame: mostly the flat wood colour, a few long darker streaks and lighter flecks."""
    h = (x * 73856093 ^ y * 19349663) & 0xffff
    if y % 3 == 1 and (h % 11) < 3: return WOOD_D
    if (h % 37) == 0: return WOOD_L
    return WOOD


def leaves():
    """The gold leaf corner ornament (top-left), from the Pixel Lab frame: its warm pixels, recoloured to the UI's gold."""
    src = Image.open(os.path.join(HERE, 'ui', 'panel_stone.png')).convert('RGBA').crop((5, 4, 25, 24))
    out = Image.new('RGBA', src.size); sp, op = src.load(), out.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = sp[x, y]
            if a and r > b + 40:                                   # gold (not the grey stone)
                v = (r + g) / 510
                c = mix(hexc('#7a4a1c'), hexc('#ffd97a'), min(1, max(0, (v - 0.35) / 0.55)))
                op[x, y] = c + (255,)
            elif a and r < 60 and g < 60 and b < 60 and x > 2 and y > 2:   # its dark outline, kept next to the gold
                op[x, y] = INK + (255,)
    # keep only the dark pixels that touch gold, so no stone is left
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if px[x, y][:3] == INK:
                near = any(0 <= x + dx < out.width and 0 <= y + dy < out.height and px[x + dx, y + dy][3] and px[x + dx, y + dy][:3] != INK
                           for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                if not near: px[x, y] = (0, 0, 0, 0)
    return out


def panel(fill, size=72, margin=4, frame=8, ornament=True, wood=None, brackets=True):
    """A carved wooden frame (the box's planks show through its middle, see planks()): ink outline, a lit outer edge, 4 px
    of grained wood, a bronze strip with a rivet in the middle of each side (the CSS repeats the sides, so the rivets
    repeat along long frames), an ink line and a soft inner shadow. Bronze corner brackets with rivets, and gold leaves
    on the corners that overhang the frame by the margin. `fill` is unused (the middle is transparent)."""
    W = size + margin * 2
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0)); px = img.load()
    n = size - 1
    def put(x, y, c, a=255): px[x + margin, y + margin] = tuple(c) + (a,)
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            lit = (x == d or y == d) and not (x == n - d or y == n - d)
            if d == 0: put(x, y, INK)
            elif d == 1: put(x, y, mix(WOOD, (255, 228, 180), 0.22) if lit else WOOD_D)
            elif d <= 4:
                c = grain(x, y) if wood is None else wood
                if d == 4: c = mix(c, (0, 0, 0), 0.35)                                     # a carved groove
                put(x, y, c)
            elif d == 5: put(x, y, BRONZE_L if lit else BRONZE)                              # the bronze strip
            elif d == 6: put(x, y, BRONZE if lit else BRONZE_D)
            elif d == 7: put(x, y, INK)
            elif d == 8: put(x, y, (0, 0, 0), 120)                                          # inner shadow on the planks
            elif d == 9: put(x, y, (0, 0, 0), 60)
    for (cx, cy) in ((0, 0), (n, 0), (0, n), (n, n)): px[cx + margin, cy + margin] = (0, 0, 0, 0)
    # rivets in the middle of each side, on the bronze strip
    mid = size // 2
    for (x, y) in ((mid, 5), (mid, n - 5), (5, mid), (n - 5, mid)):
        put(x, y, hexc('#ffe2a0')); put(x + 1, y, BRONZE_D); put(x, y + 1, BRONZE_D); put(x + 1, y + 1, INK)
    # corner brackets: an L of bronze plate over the wood, 12 px along each arm, with two rivets
    for (sx, sy) in (((1, 1), (-1, 1), (1, -1), (-1, -1)) if brackets else ()):
        ox = 0 if sx > 0 else n; oy = 0 if sy > 0 else n
        for a in range(1, 13):
            for b in range(1, 8):
                for (x, y) in ((ox + sx * a, oy + sy * b), (ox + sx * b, oy + sy * a)):
                    edge = a == 12 or b in (1, 7)
                    put(x, y, INK if a == 12 else BRONZE_D if b == 7 else BRONZE_L if b == 2 else BRONZE)
        for (a, b) in ((9, 4), (4, 9)):
            x, y = ox + sx * a, oy + sy * b
            put(x, y, hexc('#ffe2a0')); put(x + sx, y + sy, INK)
    if ornament:
        lv = leaves()
        for flip in range(4):
            o = lv
            if flip & 1: o = o.transpose(Image.FLIP_LEFT_RIGHT)
            if flip & 2: o = o.transpose(Image.FLIP_TOP_BOTTOM)
            x0 = 0 if not flip & 1 else W - o.width
            y0 = 0 if not flip & 2 else W - o.height
            img.alpha_composite(o, (x0, y0))
    return img


def planks(base, w=256, h=96, board=24, seed=1):
    """A tile of wide wooden boards for the inside of panels (repeats seamlessly). Kept very quiet so a big panel does not
    tire the eye: boards differ only slightly in tone, the seams are soft, the grain is a few faint long streaks, and
    there is one butt joint per board with two dim nail heads."""
    import random
    rnd = random.Random(seed)
    b = hexc(base)
    img = Image.new('RGBA', (w, h)); px = img.load()
    for r in range(h // board):
        tone = mix(b, (255, 235, 200) if r % 2 else (0, 0, 0), rnd.uniform(0.0, 0.035))
        y0 = r * board
        for y in range(y0, y0 + board):
            for x in range(w):
                px[x, y] = tone + (255,)
        for _ in range(4):
            yy = y0 + rnd.randint(3, board - 4); xx = rnd.randrange(w); ln = rnd.randint(30, 90)
            for i in range(ln):
                px[(xx + i) % w, yy] = mix(tone, (0, 0, 0), 0.07) + (255,)
        for x in range(w):
            px[x, y0] = mix(tone, (255, 235, 200), 0.045) + (255,)
            px[x, y0 + board - 1] = mix(tone, (0, 0, 0), 0.3) + (255,)
        jx = (r * 97 + 40) % w
        for y in range(y0 + 1, y0 + board - 1):
            px[jx, y] = mix(tone, (0, 0, 0), 0.25) + (255,)
        for dx in (-4, 4):
            for yy in (y0 + 5, y0 + board - 6):
                px[(jx + dx) % w, yy] = mix(tone, (0, 0, 0), 0.25) + (255,)
    return img


def button(face, pressed=False, size=32, rim=None, wood=False):
    """A raised plate in the frames' materials: ink outline, a 2 px bronze rim (lit top-left, shaded bottom-right), an ink
    line, a top-lit face, and a 3 px dark lip under it that disappears when pressed (the face drops 2 px). Bronze corner
    caps with a rivet sit on the face's corners. `wood`: the face is dark wood with two faint grain lines (they stay lines
    when the button stretches sideways). Slice 10."""
    fc = hexc(face); rc = hexc(rim) if rim else BRONZE
    rl, rd = mix(rc, (255, 236, 190), 0.45), mix(rc, (0, 0, 0), 0.4)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load()
    n = size - 1
    lip = 0 if pressed else 3
    top = 2 if pressed else 0
    bot = n - lip                       # the face's last row (above the lip)
    for y in range(top, size):
        for x in range(size):
            if (x in (0, n)) and (y in (top, n)): continue                                    # rounded corners
            if x in (0, n) or y in (top, n): px[x, y] = INK + (255,); continue
            if y > bot: px[x, y] = mix(fc, (0, 0, 0), 0.65) + (255,); continue                   # the lip
            d = min(x - 0, y - top, n - x, bot + 1 - y)
            if d <= 2:                                                                          # the rim
                c = rl if (y - top == d or x == d) and not (n - x == d or bot + 1 - y == d) else rd if (n - x == d or bot + 1 - y == d) else rc
                if d == 2: c = mix(c, (0, 0, 0), 0.15)
                px[x, y] = c + (255,); continue
            if d == 3: px[x, y] = INK + (255,); continue
            t = (y - top - 4) / max(1, bot - 4 - (top + 4))
            c = mix(mix(fc, (255, 255, 255), 0.14 if not pressed else 0.0), mix(fc, (0, 0, 0), 0.22), t)
            if y == top + 4: c = mix(fc, (255, 255, 255), 0.32 if not pressed else 0.06)        # lit top line
            if wood and (y - top) in (10, 17) and x % 23 not in (3, 4): c = mix(c, (0, 0, 0), 0.16)
            px[x, y] = c + (255,)
    # bronze corner caps on the face (an L of 4 px each way) with a rivet
    for (sx, ox) in ((1, 4), (-1, n - 4)):
        for (sy, oy) in ((1, top + 4), (-1, bot - 3)):
            for k in range(4):
                for (x, y) in ((ox + sx * k, oy), (ox, oy + sy * k)):
                    px[x, y] = (rl if sy > 0 else rc) + (255,)
            px[ox + sx, oy + sy] = mix(rc, (255, 240, 200), 0.7) + (255,)
            px[ox + sx * 2, oy + sy * 2] = rd + (255,)
    return img


def inset(fill, size=16):
    """A sunken well (slots, inputs, bars): ink, a bronze rim lit at the bottom-right, a dark top-left shadow, flat fill."""
    f = hexc(fill)
    img = Image.new('RGBA', (size, size), f + (255,)); px = img.load()
    n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d == 0: c = INK
            elif d == 1: c = BRONZE_D if (x == 1 or y == 1) else mix(BRONZE, (255, 240, 200), 0.15)
            elif d == 2: c = mix(f, (0, 0, 0), 0.55) if (x == 2 or y == 2) else f
            else: c = f
            px[x, y] = c + (255,)
    for (cx, cy) in ((0, 0), (n, 0), (0, n), (n, n)): px[cx, cy] = (0, 0, 0, 0)
    return img


def tab(face, on):
    img = button(face if on else '#a87c3a', rim='#7a5426')
    if on:
        px = img.load(); fc = hexc(face)
        for x in range(2, img.width - 2):
            for y in range(img.height - 4, img.height):
                px[x, y] = mix(fc, (0, 0, 0), 0.16) + (255,)
    return img


# ---- materials: each kind of box has its own frame and its own surface -------------------------------------------------
LEATHER = hexc('#3a2219'); LEATHER_D = hexc('#24140f'); LEATHER_L = hexc('#5a3726'); THREAD = hexc('#c9a876')
STEEL = hexc('#3b4148'); STEEL_D = hexc('#23272c'); STEEL_L = hexc('#6b737c')
GOLD = hexc('#d9a94e'); GOLD_D = hexc('#7a5a26')


def leather_frame(size=40):
    """Hero things (the hero window, the hero page, gear): a rolled leather edge with a stitched seam, and small brass
    corner caps. The middle is transparent (the box shows ui_leather.png). Slice 12."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load(); n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            lit = (x == d or y == d) and not (x == n - d or y == n - d)
            if d == 0: c = INK
            elif d == 1: c = mix(LEATHER_L, (255, 230, 200), 0.15) if lit else LEATHER
            elif d <= 3: c = LEATHER_L if (d == 2 and lit) else LEATHER
            elif d == 4: c = LEATHER_D
            elif d == 5:                                               # the stitches: 3 on, 2 off, along the seam
                k = (x if y in (5, n - 5) else y) % 5
                c = THREAD if k < 3 else LEATHER_D
                if not lit and k < 3: c = mix(THREAD, (0, 0, 0), 0.3)
            elif d == 6: c = LEATHER_D
            elif d == 7: px[x, y] = (0, 0, 0, 90); continue
            else: continue
            px[x, y] = c + (255,)
    for (cx, cy, sx, sy) in ((0, 0, 1, 1), (n, 0, -1, 1), (0, n, 1, -1), (n, n, -1, -1)):   # brass corner caps
        for a in range(7):
            for b in range(7 - a):
                x, y = cx + sx * a, cy + sy * b
                edge = a == 0 or b == 0 or a + b == 6
                px[x, y] = (INK if a + b == 6 else GOLD if (a == 1 or b == 1) else mix(GOLD, (0, 0, 0), 0.25)) + (255,)
        px[cx, cy] = (0, 0, 0, 0)
        px[cx + sx * 2, cy + sy * 2] = hexc('#fff0c0') + (255,)
    return img


def iron_frame(size=40):
    """Warnings and confirmations (Quit, defeat, the network banner): a bevelled dark steel band with round bolts at the
    corners and the middle of each side. Middle transparent (ui_iron.png). Slice 12."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load(); n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            lit = (x == d or y == d) and not (x == n - d or y == n - d)
            if d == 0: c = INK
            elif d == 1: c = STEEL_L if lit else STEEL_D
            elif d <= 4: c = mix(STEEL, (255, 255, 255), 0.06) if lit else STEEL
            elif d == 5: c = STEEL_D if lit else STEEL_L
            elif d == 6: c = INK
            elif d == 7: px[x, y] = (0, 0, 0, 100); continue
            else: continue
            px[x, y] = c + (255,)
    for (cx, cy) in ((0, 0), (n, 0), (0, n), (n, n)): px[cx, cy] = (0, 0, 0, 0)
    mid = size // 2
    for (bx, by) in ((3, 3), (n - 3, 3), (3, n - 3), (n - 3, n - 3), (mid, 3), (mid, n - 3), (3, mid), (n - 3, mid)):
        for (dx, dy, c) in ((-1, 0, STEEL_L), (0, -1, STEEL_L), (0, 0, hexc('#9aa3ad')), (1, 0, STEEL_D), (0, 1, STEEL_D), (1, 1, INK)):
            px[bx + dx, by + dy] = c + (255,)
    return img


def slate_frame(size=28):
    """Tooltips: black slate edged with a fine double gold line and a small gold diamond on each corner. Slice 8."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load(); n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d == 0: c = INK
            elif d == 1: c = GOLD_D
            elif d == 2: c = (16, 17, 20)
            elif d == 3: c = mix(GOLD, (0, 0, 0), 0.35)
            elif d == 4: px[x, y] = (0, 0, 0, 80); continue
            else: continue
            px[x, y] = c + (255,)
    for (cx, cy) in ((0, 0), (n, 0), (0, n), (n, n)): px[cx, cy] = (0, 0, 0, 0)
    for (cx, cy) in ((2, 2), (n - 2, 2), (2, n - 2), (n - 2, n - 2)):
        for (dx, dy) in ((0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
            if 0 <= cx + dx <= n and 0 <= cy + dy <= n:
                px[cx + dx, cy + dy] = (hexc('#ffe7a8') if (dx, dy) == (0, 0) else GOLD if abs(dx) + abs(dy) < 2 else GOLD_D) + (255,)
    return img


def card_frame(size=24):
    """Cards in a grid (heroes, evolutions, levels, relic choices): one thin bronze line between ink lines, a soft inner
    shadow and a bronze dot on each corner. No ornaments: the grid repeats them. Slice 6."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load(); n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            lit = (x == d or y == d) and not (x == n - d or y == n - d)
            if d == 0: c = INK
            elif d == 1: c = BRONZE_L if lit else BRONZE_D
            elif d == 2: c = INK
            elif d == 3: px[x, y] = (0, 0, 0, 90); continue
            else: continue
            px[x, y] = c + (255,)
    for (cx, cy) in ((0, 0), (n, 0), (0, n), (n, n)): px[cx, cy] = (0, 0, 0, 0)
    for (cx, cy) in ((1, 1), (n - 1, 1), (1, n - 1), (n - 1, n - 1)): px[cx, cy] = hexc('#ffe2a0') + (255,)
    return img


def texture(base, kind, w=128, h=128, seed=5):
    """Seamless surfaces. leather: a fine pebble grain and a few soft creases. iron: faint horizontal brushing and specks.
    slate: almost flat, with a sparse fleck."""
    import random
    rnd = random.Random(seed); b = hexc(base)
    img = Image.new('RGBA', (w, h), b + (255,)); px = img.load()
    if kind == 'leather':
        for y in range(h):
            for x in range(w):
                r = rnd.random()
                if r < 0.10: px[x, y] = mix(b, (0, 0, 0), 0.18) + (255,)
                elif r < 0.16: px[x, y] = mix(b, (255, 220, 190), 0.06) + (255,)
        for _ in range(7):                                                    # creases
            x0, y0 = rnd.randrange(w), rnd.randrange(h); dx = rnd.choice((-1, 1))
            for i in range(rnd.randint(8, 20)):
                x, y = (x0 + i * dx) % w, (y0 + i // 3) % h
                px[x, y] = mix(b, (0, 0, 0), 0.3) + (255,); px[x, (y + 1) % h] = mix(b, (255, 220, 190), 0.07) + (255,)
    elif kind == 'iron':
        for y in range(h):
            t = rnd.uniform(-0.04, 0.04)
            for x in range(w):
                c = mix(b, (255, 255, 255), t) if t > 0 else mix(b, (0, 0, 0), -t)
                if rnd.random() < 0.012: c = mix(b, (0, 0, 0), 0.35)
                px[x, y] = c + (255,)
    else:
        for y in range(h):
            for x in range(w):
                if rnd.random() < 0.02: px[x, y] = mix(b, (255, 255, 255), 0.05) + (255,)
    return img


KIT = {
    'ui_panel': lambda: panel('#18201b'),
    'ui_frame_wood': lambda: panel('#18201b', size=56, margin=0, ornament=False, brackets=False),
    'ui_frame_leather': leather_frame,
    'ui_frame_iron': iron_frame,
    'ui_frame_slate': slate_frame,
    'ui_frame_card': card_frame,
    'ui_leather': lambda: texture('#2a1812', 'leather'),
    'ui_iron': lambda: texture('#1c2025', 'iron', seed=6),
    'ui_slate': lambda: texture('#121317', 'slate', seed=7),
    'ui_panel_light': lambda: panel('#202b24', ornament=False),
    'ui_tooltip': lambda: panel('#15120d', ornament=False),
    'ui_planks': lambda: planks('#141210'),
    'ui_planks_dark': lambda: planks('#100e0b', seed=3),
    'ui_button': lambda: button('#d29a3e', rim='#9a6a2a'),
    'ui_button_hover': lambda: button('#e6b052', rim='#a8762e'),
    'ui_button_down': lambda: button('#b8822a', True, rim='#8a5e24'),
    'ui_button_go': lambda: button('#e3a23a', rim='#9a6a2a'),
    'ui_button_go_hover': lambda: button('#f2b850', rim='#a8762e'),
    'ui_button_go_down': lambda: button('#c88c2a', True, rim='#8a5e24'),
    'ui_button_bad': lambda: button('#9a3a31'),
    'ui_button_bad_hover': lambda: button('#b2483e'),
    'ui_button_relic': lambda: button('#563c8c'),
    'ui_button_relic_hover': lambda: button('#6a4ea6'),
    'ui_button_on': lambda: button('#4f6a34', rim='#c99a52'),
    'ui_tab': lambda: tab('#2b2620', False),
    'ui_tab_on': lambda: tab('#e6b052', True),
    'ui_slot': lambda: inset('#121713'),
    'ui_input': lambda: inset('#0e120f'),
    'ui_bar': lambda: inset('#0b0e0c', 12),
}


def main():
    made = {}
    for k, fn in KIT.items():
        made[k] = fn(); made[k].save(os.path.join(ASSETS, k + '.png'))
    sheet = Image.new('RGBA', (sum(m.width + 4 for m in made.values()) + 4, 48), (40, 52, 44, 255))
    x = 4
    for m in made.values():
        sheet.alpha_composite(m, (x, 4)); x += m.width + 4
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(os.path.join(HERE, 'ui', 'preview-ui.png'))
    print(len(made), 'ui frames')


if __name__ == '__main__':
    main()
