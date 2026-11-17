"""The UI kit in the heroes' style: builds assets/ui_*.png (9-slice frames used by the CSS as border images).

Run:  python3 art/pixellab/build_ui.py

The old kit (art/ui.py) was drawn at 2 screen pixels per art pixel, in flat green stone. This one is drawn at 1 screen
pixel per art pixel, like the heroes on the field, in their materials: dark oiled wood, a thin bronze bead, an ink
outline, and gold leaf ornaments on the corners of the big panels (cut from a Pixel Lab frame, ui/panel_stone.png).
Faces are calm (a soft top-lit gradient), with sparse sharp highlights: the bead's lit edge, rivets, the leaves.

Sizes (each frame's slice = the border-image slice in index.html, "UI kit v2"):
  panel / panel_light / tooltip: 72x72 + a 4 px margin for the leaves that overhang; slice 24 (no fill: the middle is
    transparent and the box shows ui_planks*.png, a seamless tile, as its background), outset 4, sides repeated (round)
  buttons: 24x24, slice 7
  slot / input / bar: 16x16, slice 5      tab: 24x24, slice 7      chip: 8x8, slice 3
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


def panel(fill, size=72, margin=4, frame=8, ornament=True, wood=None):
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
    for (sx, sy) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
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


def button(face, pressed=False, size=24, rim=None):
    """A raised plate: ink outline, a 1 px rim (bronze), a top-lit face (soft gradient), a lit top edge, and a 3 px dark lip
    under it that disappears when pressed. Tiny rivets in the face's corners."""
    fc = hexc(face); rc = hexc(rim) if rim else BRONZE
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load()
    n = size - 1
    lip = 1 if pressed else 3
    top = 2 if pressed else 0
    for y in range(top, size):
        for x in range(size):
            corner = (x in (0, n)) and (y in (top, n))
            if corner: continue
            if x in (0, n) or y in (top, n): px[x, y] = INK + (255,); continue
            if y >= n - lip: px[x, y] = mix(fc, (0, 0, 0), 0.62) + (255,); continue             # the lip
            if x in (1, n - 1) or y in (top + 1, n - lip - 1):                                     # the rim
                c = mix(rc, (255, 240, 200), 0.45) if y == top + 1 else mix(rc, (0, 0, 0), 0.35) if (y == n - lip - 1 or x == n - 1) else rc
                px[x, y] = c + (255,); continue
            t = (y - top - 2) / max(1, (n - lip - 2) - (top + 2))
            c = mix(mix(fc, (255, 255, 255), 0.16 if not pressed else 0.02), mix(fc, (0, 0, 0), 0.16), t)
            if y == top + 2: c = mix(fc, (255, 255, 255), 0.38 if not pressed else 0.08)           # the face's lit top line
            px[x, y] = c + (255,)
    for (cx, cy) in ((3, top + 3), (n - 3, top + 3)):                                               # rivets
        px[cx, cy] = mix(rc, (255, 240, 200), 0.6) + (255,)
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
    img = button(face if on else '#2b2620', size=24)
    if on:
        px = img.load(); fc = hexc(face)
        for x in range(2, img.width - 2):
            for y in range(img.height - 4, img.height):
                px[x, y] = mix(fc, (0, 0, 0), 0.16) + (255,)
    return img


def chip(color):
    c = hexc(color); f = (22, 24, 20)
    img = Image.new('RGBA', (8, 8), (0, 0, 0, 0)); px = img.load()
    for y in range(8):
        for x in range(8):
            if x in (0, 7) and y in (0, 7): continue
            px[x, y] = (c if x in (0, 7) or y in (0, 7) else f) + (255,)
    return img


KIT = {
    'ui_panel': lambda: panel('#18201b'),
    'ui_panel_light': lambda: panel('#202b24', ornament=False),
    'ui_tooltip': lambda: panel('#15120d', ornament=False),
    'ui_planks': lambda: planks('#141210'),
    'ui_planks_light': lambda: planks('#1a1714', seed=2),
    'ui_planks_dark': lambda: planks('#100e0b', seed=3),
    'ui_button': lambda: button('#3d4a3c'),
    'ui_button_hover': lambda: button('#4c5c4a'),
    'ui_button_down': lambda: button('#344033', True),
    'ui_button_go': lambda: button('#e0a23c', rim='#b07a2c'),
    'ui_button_go_hover': lambda: button('#f0b752', rim='#c08a34'),
    'ui_button_go_down': lambda: button('#c88d2c', True, rim='#a06a24'),
    'ui_button_bad': lambda: button('#9e3f36', rim='#7a2c26'),
    'ui_button_bad_hover': lambda: button('#b84d43', rim='#8a342c'),
    'ui_button_relic': lambda: button('#5a4290', rim='#8f6a3a'),
    'ui_button_relic_hover': lambda: button('#6c52a8', rim='#a07a44'),
    'ui_button_on': lambda: button('#56703a', rim='#d6a85c'),
    'ui_button_off': lambda: button('#2a2d28'),
    'ui_tab': lambda: tab('#2b2620', False),
    'ui_tab_on': lambda: tab('#3d4a3c', True),
    'ui_slot': lambda: inset('#121713'),
    'ui_input': lambda: inset('#0e120f'),
    'ui_bar': lambda: inset('#0b0e0c', 12),
    'ui_chip': lambda: chip('#b89a6a'),
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
