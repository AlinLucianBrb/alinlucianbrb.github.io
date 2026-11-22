"""The evolved forms' art, in the base heroes' style: assets/anim_<form>_idle.png and anim_<form>_attack.png (160 px frames
side by side, facing left, like the base heroes), portrait_<form>.png (128x128, the still) and hero_<form>.png /
hero_<form>_2.png (the still, for the few places that draw a form as one picture: evolution cards, the Crusader on his
horse). Also prints the HERO_ANIM entries (foot, height) for js/game/sprites.js.

Run:  python3 art/pixellab/build_evolutions.py

Sources (art/pixellab/evolutions/):
  <form>.png       each form, made in Pixel Lab by editing its base hero's still (same face, hair, build and pose; new or
                   upgraded gear), so the evolution reads as the same person, grander.
  frames/<form>_<idle|attack>_<i>.png   the animation frames (Pixel Lab animate_image on the still padded to 160x160;
                   frame 0 is the still itself).
  frames.txt       which frames to use: idle loops frames 0-3; the attack uses 1-4 unless a line names its own
                   (use0123, use012 ...: frames that drifted off-model are left out).
"""
import json, os, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
EVO = os.path.join(HERE, 'evolutions')
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)
F = 160


def frames_of(form, kind):
    d = os.path.join(EVO, 'frames'); out = []
    i = 0
    while os.path.exists(os.path.join(d, '%s_%s_%d.png' % (form, kind, i))):
        out.append(Image.open(os.path.join(d, '%s_%s_%d.png' % (form, kind, i))).convert('RGBA')); i += 1
    return out


def main():
    use = {}
    for line in open(os.path.join(EVO, 'frames.txt')):
        p = line.split()
        if not p: continue
        u = [x for x in p if x.startswith('use')]
        if u: use[(p[0], p[1])] = [int(c) for c in u[0][3:]]
    forms = sorted({k[0] for k in use} | {l.split()[0] for l in open(os.path.join(EVO, 'frames.txt')) if l.strip()})
    entries = {}
    for form in forms:
        idle, atk = frames_of(form, 'idle'), frames_of(form, 'attack')
        if not idle or (not atk and not os.path.exists(os.path.join(HERE, 'attacks', form + '_0_stance.png'))): print('missing', form); continue
        pick_i = use.get((form, 'idle'), [0, 1, 2, 3])
        pick_a = use.get((form, 'attack'), [1, 2, 3, 4])
        hand_timed = os.path.exists(os.path.join(HERE, 'attacks', form + '_0_stance.png'))   # build_attacks.py makes its attack
        for kind, fr, pick in (('idle', idle, pick_i),) + ((('attack', atk, pick_a),) if not hand_timed else ()):
            sheet = Image.new('RGBA', (F * len(pick), F))
            for j, k in enumerate(pick): sheet.alpha_composite(fr[k], (j * F, 0))
            sheet.save(A('anim_%s_%s.png' % (form, kind)))
        f0 = idle[0]; bb = f0.getbbox(); a = f0.split()[3].load()
        bottom = bb[3] - 1
        xs = [x for y in range(bottom - 5, bottom + 1) for x in range(F) if a[x, y] > 100]
        foot = [round(sorted(xs)[len(xs) // 2]) if xs else F // 2, bottom]
        entries[form] = {'foot': foot, 'height': bb[3] - bb[1], 'idle': len(pick_i), 'attack': len(pick_a)}
        # the still: portrait (128 square, figure standing on the bottom, centred) and the one-picture sprite
        st = Image.open(os.path.join(EVO, form + '.png')).convert('RGBA'); st = st.crop(st.getbbox())
        s = min(1, 126 / st.height, 126 / st.width)
        if s < 1: st = st.resize((round(st.width * s), round(st.height * s)), Image.LANCZOS)
        sq = Image.new('RGBA', (128, 128)); sq.alpha_composite(st, ((128 - st.width) // 2, 128 - st.height - 1))
        sq.save(A('portrait_%s.png' % form)); sq.save(A('hero_%s.png' % form)); sq.save(A('hero_%s_2.png' % form))
    json.dump(entries, open(os.path.join(EVO, 'entries.json'), 'w'), indent=1)
    print(len(entries), 'forms')


if __name__ == '__main__':
    main()
