"""The small icons in the heroes' style: stats, damage types, ailments, HUD and talent icons (icon_*.png), ability icons
(ability_*.png), relic icons (relic_*.png) and item icons (item_<type>_<rarity>.png).

Run:  python3 art/pixellab/build_icons.py

Sources: art/pixellab/icons/*.png, sheets of icons made in Pixel Lab (8 per sheet, 32 px cells; items 64 px cells). Each
icon is found as a blob of pixels (the sheets do not keep to an exact grid) and named by its place in the sheet, reading
rows top to bottom and left to right (SHEETS below).
  icon_*:    the icon alone, trimmed to a tight square (the CSS sizes it; drawn small and smooth).
  ability_*, relic_*: 32x32, the icon on a dark slot with a bronze rim (gold for ultimates, violet for relics, orange for legendary ones).
  item_*_r:  64x64; rarity 0 (Common) is a little duller, 3 (Epic) gets a faint violet glow. The inventory cell's border
             shows the rarity colour as before.
"""
import os
from PIL import Image, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'icons')
A = lambda *p: os.path.join(HERE, '..', '..', 'assets', *p)

S = {
    's01': ['icon_ail_bleed_s', 'icon_ail_burn_s', 'icon_ail_corruption_s', 'icon_ail_freeze_s', 'icon_ail_poison_s', 'icon_ail_root_s', 'icon_ail_shock_s', 'icon_chill'],
    's02': ['icon_dmg_arcane', 'icon_dmg_cold', 'icon_dmg_fire', 'icon_dmg_holy', 'icon_dmg_lightning', 'icon_dmg_physical', 'icon_dmg_shadow', 'icon_dmg_toxic'],
    's03': ['icon_damage', 'icon_crit', 'icon_critdmg', 'icon_castspeed', 'icon_range', 'icon_speed', 'icon_duration', 'icon_energy'],
    's04': ['icon_respen', 'icon_pen', 'icon_targets', 'icon_jumps'],
    's04b': ['icon_strength', 'icon_dexterity', 'icon_intellect', 'icon_armorpen'],
    's05': ['icon_gold', 'icon_kills', 'icon_level', 'icon_lives', 'icon_minion', 'icon_ultimate', 'icon_wave', 'icon_xp'],
    's06': ['icon_back', 'icon_resume', 'icon_talent_cold', 'icon_talent_energy', 'icon_talent_fire', 'icon_talent_fortune', 'icon_talent_gate', 'icon_talent_investor'],
    's07': ['icon_talent_lightning', 'icon_talent_marksman', 'icon_talent_martial', 'icon_talent_merchant', 'icon_talent_might', 'icon_talent_precision', 'icon_talent_relics', 'icon_talent_sorcery'],
    's08': ['icon_talent_sunder', 'icon_talent_tempo', 'icon_talent_toxins', 'icon_talent_training', 'icon_talent_treasure', 'icon_talent_wealth', None, None],
    'a01': ['atk_arcane', 'atk_arrow', 'atk_arrow_gold', 'atk_arrow_toxic', 'atk_aura_holy', 'atk_aura_shadow', 'atk_blink', 'atk_boomerang'],
    'a02': ['atk_chain', 'atk_charge', 'atk_cold', 'atk_daggers', 'atk_dart', 'atk_fire', 'atk_fissure', 'atk_flail'],
    'a03': ['atk_flask', 'atk_hammer', 'atk_hellfire', 'atk_imp', 'atk_lance', 'atk_launch', 'atk_lightning', 'atk_moonbeam'],
    'a04': ['atk_psalm', 'atk_seed', 'atk_shadow', 'atk_smite', 'atk_sword', 'atk_thorns', 'atk_totem', 'atk_twin'],
    'a05': ['atk_wolf', 'ult_ancestral', 'ult_barricade', 'ult_blessing', 'ult_blizzard', 'ult_cavalry', 'ult_clones', 'ult_consecration'],
    'a06': ['ult_conversion', 'ult_crescendo', 'ult_demongate', 'ult_doom', 'ult_empowered', 'ult_enrage', 'ult_frenzy', 'ult_grasp'],
    'a07': ['ult_heresy', 'ult_infernal', 'ult_inferno', 'ult_judgement', 'ult_locusts', 'ult_mark', 'ult_moonfall', 'ult_oil'],
    'a08': ['ult_orbit', 'ult_piercing', 'ult_poisonflask', 'ult_purge', 'ult_rally', 'ult_souldrain', 'ult_spikes', 'ult_storm'],
    'a09': ['ult_surge', 'ult_tectonic', 'ult_traps', 'r_arcane_focus', 'r_battle_focus', 'r_blasphemy', 'r_brawn', 'r_bulk_order'],
    'r01': ['r_compound_interest', 'r_cruelty', 'r_dark_pact', 'r_duration', 'r_feral_haste', 'r_fine_arrows', 'r_finesse', 'r_four_leaf_clover'],
    'r02': ['r_holy_water', 'r_hunting_instinct', 'r_insight', 'r_keen_edge', 'r_long_barrels', 'r_pack_leader', 'r_prospector', 'r_prowess'],
    'r03': ['r_quick_hands', 'r_quick_incantation', 'r_reinforced_gate', 'r_savage_bite', 'r_sharpened_rounds', 'r_split_bolt', 'r_tax_collector', 'r_whetstone'],
    'r04': ['r_executioner', 'r_first_blood', 'r_giant_slayer', 'r_shatter', 'r_chain_reaction', 'r_thunderhead', 'r_momentum', 'r_overflow'],
    'r05': ['r_lone_wolf', 'r_brotherhood', 'r_last_stand', 'r_trophy_hunter', 'r_fever', 'r_tempo'],
    'l01': ['L_plague', 'L_overload', 'L_perpetual_motion', 'L_iron_gate', 'L_collector', 'L_bladestorm', 'L_ricochet', 'L_arcane_echo'],
    'l02': ['L_death_mark', 'L_overgrowth', 'L_lasting_light', 'L_soul_harvest', 'L_day_of_wrath', 'L_ancestors_gift'],
    'a10': ['ult_ricochet', 'ult_spear', 'atk_spear', 'atk_line', None, None, None, None],
    'u01': ['icon_shop_greed', 'icon_shop_conduit', 'icon_shop_gamble', 'icon_shop_boss', 'icon_shop_up', 'icon_shop_bag', 'icon_relics', None],
    'm01': ['icon_mat_scrap', 'icon_mat_dust', 'icon_mat_essence', 'icon_mat_core'],
    'i01': ['i_arcane_amulet', 'i_beast_mask', 'i_bloodstone_ring', 'i_body_armour', 'i_boots', 'i_circlet', 'i_fang_necklace', 'i_feather_charm'],
    'i02': ['i_hide_armour', 'i_leather_hood', 'i_leather_jerkin', 'i_leather_trousers'],
    'i03': ['i_leggings', 'i_plate_armour', 'i_plate_greaves', 'i_power_charm', 'i_ranger_boots', 'i_sabatons', 'i_silk_robe', 'i_silk_slippers'],
    'i04': ['i_silk_wraps'],
    'i05': ['i_fur_boots', 'i_fur_leggings', 'i_great_helm', 'i_helm'],
}


def blobs(img, n, row_h):
    """The n biggest connected blobs of opaque pixels (8-neighbour), small specks merged into the nearest one, in reading
    order (rows of height row_h)."""
    a = img.split()[3].load(); W, H = img.size; seen = set(); out = []
    for y in range(H):
        for x in range(W):
            if a[x, y] > 20 and (x, y) not in seen:
                st = [(x, y)]; seen.add((x, y)); pts = []
                while st:
                    p = st.pop(); pts.append(p)
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            q = (p[0] + dx, p[1] + dy)
                            if 0 <= q[0] < W and 0 <= q[1] < H and q not in seen and a[q] > 20: seen.add(q); st.append(q)
                out.append(pts)
    out.sort(key=len, reverse=True)
    main = out[:n]
    for b in out[n:]:
        cx = sum(p[0] for p in b) / len(b); cy = sum(p[1] for p in b) / len(b)
        near = min(main, key=lambda m: min(abs(p[0] - cx) + abs(p[1] - cy) for p in m))
        if min(abs(p[0] - cx) + abs(p[1] - cy) for p in near) < row_h * 0.3: near.extend(b)
    main.sort(key=lambda m: (round((sum(p[1] for p in m) / len(m)) // row_h), sum(p[0] for p in m) / len(m)))
    res = []
    sp = img.load()
    for m in main:
        x0, y0 = min(p[0] for p in m), min(p[1] for p in m); x1, y1 = max(p[0] for p in m), max(p[1] for p in m)
        c = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1)); cp = c.load()
        for (x, y) in m: cp[x - x0, y - y0] = sp[x, y]
        res.append(c)
    return res


def square(c, pad=1):
    m = max(c.size) + pad * 2; sq = Image.new('RGBA', (m, m)); sq.alpha_composite(c, ((m - c.width) // 2, (m - c.height) // 2)); return sq


def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def slot(rim, size=32):
    """A dark rounded slot with a 1 px rim (lit at the top) and a soft inner glow of the rim's colour."""
    img = Image.new('RGBA', (size, size)); px = img.load(); n = size - 1
    for y in range(size):
        for x in range(size):
            if (x in (0, n)) and (y in (0, n)): continue
            d = min(x, y, n - x, n - y)
            if d == 0: c = (12, 12, 10)
            elif d == 1: c = mix(rim, (255, 245, 210), 0.35) if y == 1 else mix(rim, (0, 0, 0), 0.35) if y == n - 1 else rim
            else:
                t = y / n; base = mix((34, 30, 26), (16, 14, 12), t)
                g = max(0, 1 - ((x - n / 2) ** 2 + (y - n / 2.6) ** 2) ** 0.5 / (n * 0.55))
                c = mix(base, mix(rim, (0, 0, 0), 0.4), g * 0.45)
            px[x, y] = c + (255,)
    return img


def badge(icon, rim, size=32):
    b = slot(rim, size)
    s = (size - 6) / max(icon.size)
    ic = icon.resize((max(1, round(icon.width * s)), max(1, round(icon.height * s))), Image.LANCZOS) if s < 1 else icon
    b.alpha_composite(ic, ((size - ic.width) // 2, (size - ic.height) // 2))
    return b


def main():
    made = 0
    for sheet, names in S.items():
        img = Image.open(os.path.join(SRC, sheet + '.png')).convert('RGBA')
        row_h = img.height // (2 if len(names) == 8 else 1)
        for name, c in zip(names, blobs(img, len(names), row_h)):
            if not name: continue
            if name.startswith('icon_'):
                square(c).save(A(name + '.png'))
            elif name.startswith(('atk_', 'ult_')):
                badge(c, (214, 168, 92) if name.startswith('ult_') else (143, 106, 58)).save(A('ability_' + name + '.png'))
            elif name.startswith('r_'):
                badge(c, (150, 110, 200)).save(A('relic_' + name[2:] + '.png'))
            elif name.startswith('L_'):   # legendary relics: an orange rim
                badge(c, (255, 150, 50)).save(A('relic_' + name[2:] + '.png'))
            else:
                base = Image.new('RGBA', (64, 64)); s = min(1, 58 / max(c.size))
                ic = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS) if s < 1 else c
                base.alpha_composite(ic, ((64 - ic.width) // 2, (64 - ic.height) // 2))
                for r in range(4):
                    im = base.copy()
                    if r == 0: im = ImageEnhance.Color(im).enhance(0.6); im = ImageEnhance.Brightness(im).enhance(0.92)
                    if r == 3:
                        glow = im.split()[3].filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2)).point(lambda v: v * 0.55)
                        g = Image.new('RGBA', im.size, (192, 132, 252, 0)); g.putalpha(glow)
                        g.alpha_composite(im); im = g
                    im.save(A('item_' + name[2:] + '_%d.png' % r))
            made += 1
    print(made, 'icons')


if __name__ == '__main__':
    main()
