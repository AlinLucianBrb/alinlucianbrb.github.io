"""Hand-timed attack animations for the base heroes, drawn on a bigger canvas than the idle (256 px) so the swing has room.
Writes assets/anim_<hero>_attack.png (the frames side by side) and prints the HERO_ANIM attack entry (frame, foot,
durations) for js/game/sprites.js.

Run:  python3 art/pixellab/build_attacks.py

Sources (art/pixellab/attacks/): <hero>_<n>_<name>.png, 256x256 frames. Frame 0 is the stance, used only to find where
the feet are; the rest are the attack in order. The Warrior's were made with Pixel Lab's animate_with_skeleton_v3 from his
still: a skeleton with sword and cape joints, posed per frame (upper body from a 3-frame sword-slash reference, legs kept on
the idle stance), then the middle frame's blade replaced by a hand-drawn smear arc and the raised sword flipped to point back
over his shoulder. Earlier versions are in the git history. DURATIONS below are each frame's time on screen (ms): the raise held,
a quick smear, the strike held. The game squeezes them to fit when the hero attacks faster than that.
"""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'attacks')
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)
F = 256
DURATIONS = {'warrior': [340, 60, 450],
             # the Warrior's evolutions: wind-up, swing, strike (held), recover. Made with animate_with_skeleton_v3 from each
             # form's still (padded to 256 at [64,109]): one posed 4-frame overhead slash shared by all three, legs kept planted.
             'berserker': [250, 70, 300, 180], 'commander': [250, 70, 300, 180], 'sentinel': [250, 70, 300, 180]}


def main():
    for hero, durs in DURATIONS.items():
        files = sorted(glob.glob(os.path.join(SRC, hero + '_*.png')))
        stance, frames = Image.open(files[0]).convert('RGBA'), [Image.open(f).convert('RGBA') for f in files[1:]]
        assert len(frames) == len(durs), hero
        sheet = Image.new('RGBA', (F * len(frames), F))
        for i, f in enumerate(frames): sheet.alpha_composite(f, (i * F, 0))
        sheet.save(A('anim_%s_attack.png' % hero))
        bb = stance.getbbox(); a = stance.split()[3].load(); bottom = bb[3] - 1
        xs = sorted(x for y in range(bottom - 5, bottom + 1) for x in range(F) if a[x, y] > 100)
        print(hero, {'frame': F, 'foot': [xs[len(xs) // 2], bottom], 'height': bb[3] - bb[1], 'durations': durs})


if __name__ == '__main__':
    main()
