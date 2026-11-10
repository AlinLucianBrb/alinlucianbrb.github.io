"""The UI kit for Test TBD: pixel frames for panels, buttons, tabs, bars, slots, inputs, chips and tooltips, used by the CSS as
9-slice border images (border-image), so one small picture frames a box of any size.

Run:  python3 art/ui.py      (writes art/out/ui_*.png and art/out/preview-ui.png)

Each frame is drawn at 1 art pixel per pixel, then saved at 2x (like the rest of the art: 2 screen pixels per art pixel).
B is the border thickness in art pixels; the CSS slices each image at 2*B pixels and draws the border 2*B pixels wide
(see the UI kit block at the top of index.html). Centres are one flat colour, so they stretch cleanly (border-image "fill").
Style: carved stone frames with a lit top-left bevel and a dark bottom-right, gold rivets on panels, and chunky raised
buttons with a 2-pixel lip that disappears when pressed.
"""
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
S = 2
INK = (14, 20, 16)


def hexc(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def save(name, img):
    img.resize((img.width * S, img.height * S), Image.NEAREST).save(os.path.join(OUT, name + '.png'))
    return img


def panel(base, fill, trim, size=16):
    """A stone panel: ink outline, 3-pixel frame (lit top-left, shaded bottom-right, with a chiselled groove), gold
    rivets in the corners, then the flat fill. Border 5."""
    b = hexc(base); f = hexc(fill); t = hexc(trim)
    img = Image.new('RGBA', (size, size), f + (255,)); px = img.load()
    n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d == 0: c = INK
            elif d <= 3:
                lit = (x < size / 2 and x == d) or (y < size / 2 and y == d)
                c = mix(b, (255, 255, 255), 0.28) if d == 1 and (x == 1 or y == 1) else mix(b, (0, 0, 0), 0.35) if d == 1 else b
                if d == 2: c = mix(b, (0, 0, 0), 0.18)                                   # the groove
                if d == 3: c = mix(b, (255, 255, 255), 0.12) if (x == 3 or y == 3) else mix(b, (0, 0, 0), 0.25)
            elif d == 4: c = mix(f, (0, 0, 0), 0.45)                                        # inner shadow line
            else: c = f
            px[x, y] = c + (255,)
    for (cx, cy) in ((2, 2), (n - 2, 2), (2, n - 2), (n - 2, n - 2)):                       # rivets
        px[cx, cy] = t + (255,)
        if cx + 1 <= n: px[min(n, cx + 1), cy] = mix(t, (0, 0, 0), 0.4) + (255,)
        px[cx, min(n, cy + 1)] = mix(t, (0, 0, 0), 0.4) + (255,)
    return img


def button(face, pressed=False, size=12):
    """A raised button: ink outline, a 1-pixel highlight top-left, shade bottom-right, and a 2-pixel dark lip under it
    (gone when pressed, the face drops by 1). Border 4 (top 3, the CSS uses 4 all round)."""
    fc = hexc(face)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = img.load()
    n = size - 1
    lip = 0 if pressed else 2
    top = 1 if pressed else 0
    for y in range(size):
        for x in range(size):
            if y < top: continue
            if x in (0, n) or y in (top, n):
                if (x in (0, n) and y in (top, n)): continue                               # rounded corner
                px[x, y] = INK + (255,); continue
            if y >= n - lip: px[x, y] = mix(fc, (0, 0, 0), 0.55) + (255,); continue        # the lip
            if y == top + 1 or x == 1: px[x, y] = mix(fc, (255, 255, 255), 0.4 if not pressed else 0.05) + (255,); continue
            if x == n - 1 or y == n - lip - 1: px[x, y] = mix(fc, (0, 0, 0), 0.28) + (255,); continue
            px[x, y] = fc + (255,)
    return img


def inset(fill, rim, size=10):
    """A sunken box (slots, inputs, bars): dark top-left, light bottom-right. Border 3."""
    f = hexc(fill); r = hexc(rim)
    img = Image.new('RGBA', (size, size), f + (255,)); px = img.load()
    n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d == 0: c = INK
            elif d == 1: c = mix(r, (0, 0, 0), 0.5) if (x == 1 or y == 1) and x < n - 1 and y < n - 1 else mix(r, (255, 255, 255), 0.25)
            elif d == 2: c = mix(f, (0, 0, 0), 0.5) if (x == 2 or y == 2) else f
            else: c = f
            px[x, y] = c + (255,)
    return img


def tab(face, on):
    """A tab: like a button but open at the bottom when on (it joins the panel under it). Border 4."""
    img = button(face if on else '#2a3a30')
    if on:
        px = img.load(); fc = hexc(face)
        for x in range(1, img.width - 1):
            for y in (img.height - 3, img.height - 2, img.height - 1):
                px[x, y] = fc + (255,)
    return img


def chip(color):
    """A small rounded frame for chips and tags: 1-pixel outline in the colour, dark fill. Border 2."""
    c = hexc(color); f = (20, 28, 23)
    img = Image.new('RGBA', (6, 6), (0, 0, 0, 0)); px = img.load()
    for y in range(6):
        for x in range(6):
            if (x in (0, 5)) and (y in (0, 5)): continue
            edge = x in (0, 5) or y in (0, 5)
            px[x, y] = (c if edge else f) + (255,)
    return img


KIT = {
    'ui_panel': lambda: panel('#4c5e52', '#1b2620', '#f2b84b'),
    'ui_panel_light': lambda: panel('#5d7264', '#22302a', '#f2b84b'),
    'ui_tooltip': lambda: panel('#3a2f22', '#14110c', '#f2b84b', 14),
    'ui_button': lambda: button('#3c5446'),
    'ui_button_hover': lambda: button('#4e6c5a'),
    'ui_button_down': lambda: button('#344a3d', True),
    'ui_button_go': lambda: button('#e9a63a'),
    'ui_button_go_hover': lambda: button('#f7c158'),
    'ui_button_go_down': lambda: button('#d0912a', True),
    'ui_button_bad': lambda: button('#a8433b'),
    'ui_button_bad_hover': lambda: button('#c2564c'),
    'ui_button_relic': lambda: button('#5a3f8a'),
    'ui_button_relic_hover': lambda: button('#6e50a6'),
    'ui_button_on': lambda: button('#5a6e3a'),
    'ui_button_off': lambda: button('#2a3330'),
    'ui_tab': lambda: tab('#2a3a30', False),
    'ui_tab_on': lambda: tab('#3c5446', True),
    'ui_slot': lambda: inset('#141c17', '#4c5e52'),
    'ui_input': lambda: inset('#0f1512', '#4c5e52'),
    'ui_bar': lambda: inset('#0c110e', '#4c5e52', 8),
    'ui_chip': lambda: chip('#9db3a3'),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    made = {k: save(k, fn()) for k, fn in KIT.items()}
    sheet = Image.new('RGBA', (len(made) * 20 + 4, 24), (24, 33, 28, 255))
    for i, im in enumerate(made.values()):
        sheet.alpha_composite(im, (4 + i * 20, 4))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(os.path.join(OUT, 'preview-ui.png'))
    print(len(made), 'ui frames')


if __name__ == '__main__':
    main()
