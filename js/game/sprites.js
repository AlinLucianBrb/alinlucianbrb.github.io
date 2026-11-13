/* Pixel-art sprites, built by `python3 art/build.py` into assets/ (see the Art section of the README).
   Sprites load in the background the first time they are asked for. Until one has loaded (or if it fails, or there is no
   browser to load it, as in the tests), get() returns null and the renderer draws its plain shapes instead, so the game
   never waits for art. Images are drawn with smoothing off so the pixels stay sharp. */
import { HEROES, RELICS } from '../content/data.js';
import { ITEMS } from '../content/items.js';
import { ENEMIES } from '../engine/enemies.js';
import { ULTIMATES } from '../engine/ultimates.js';
import '../engine/kits/index.js';   /* the hero kits register their ultimates (their icons are listed below) */

import { TILT } from './camera.js';

const BASE = new URL('../../assets/', import.meta.url);
export const spriteUrl = name => new URL(name + '.png', BASE).href;

/* Every sprite the game uses (a test checks that each one is in assets/). */
/* Ability icons on the hero buttons: the basic attack icon for each hero and evolution (ultimates use ability_ult_<id>). */
export const ATTACK_ICON = {
  warrior: 'atk_sword', berserker: 'atk_twin', commander: 'atk_launch', sentinel: 'atk_sword',
  ranger: 'atk_arrow', marksman: 'atk_arrow_gold', boomeranger: 'atk_boomerang', hunter: 'atk_arrow_toxic',
  mage: 'atk_arcane', firemage: 'atk_fire', coldmage: 'atk_cold', lightningmage: 'atk_lightning',
  rogue: 'atk_twin', assassin: 'atk_blink', toxicologist: 'atk_daggers', alchemist: 'atk_flask',
  druid: 'atk_seed', animalic: 'atk_wolf', naturist: 'atk_thorns', lunar: 'atk_moonbeam',
  priest: 'atk_smite', incantation: 'atk_aura_holy', archangel: 'atk_lance', gospel: 'atk_psalm',
  warlock: 'atk_shadow', occult: 'atk_aura_shadow', summoner: 'atk_imp', infernalist: 'atk_hellfire',
  paladin: 'atk_hammer', heretic: 'atk_flail', inquisitor: 'atk_chain', crusader: 'atk_charge',
  shaman: 'atk_lightning', witchdoctor: 'atk_dart', totemist: 'atk_totem', earthcaller: 'atk_fissure'
};
export const attackIcon = def => 'ability_' + (ATTACK_ICON[def.form || def.id] || 'atk_sword');
export const ultimateIcon = def => 'ability_ult_' + def.ultimate;
/* A relic's icon (art/relics.py): relic_ and its name in lower case, every run of other characters turned into "_". */
export const relicIcon = name => 'relic_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/* Animated heroes (the 128 px style, made with Pixel Lab; the source files are in art/pixellab/). Each animation is a sheet of
   square frames side by side, the figure facing left. foot: where the feet touch the ground on a frame (the hero stands on
   that point); attack.swings: which way the attack art swings; height: the figure's height in frame pixels; tiles: how tall it is drawn on the map, in tiles. A hero without
   an entry (and every evolved form, for now) uses its old two-frame sprite. portrait: the still image for the menus. */
export const HERO_ANIM = {
  warrior: { frame: 192, foot: [91, 191], height: 114, tiles: 1.6, portrait: 'portrait_warrior',
    idle: { name: 'anim_warrior_idle', frames: 4, fps: 5 }, attack: { name: 'anim_warrior_attack', frames: 4, fps: 12, swings: 'left' } }
};
export const heroAnim = def => (def.form || def.mounted ? null : HERO_ANIM[def.id] || null);
/* The image of a hero for the menus: its portrait when it has one, otherwise its sprite. */
export const heroPortrait = id => (HERO_ANIM[id] ? HERO_ANIM[id].portrait : 'hero_' + id);
const heroIds = HEROES.flatMap(h => [h.id, ...(h.evolutions || []).flatMap(s => s.choices.map(c => c.id))]);
export const SPRITES = [...new Set([
  ...heroIds.flatMap(id => ['hero_' + id, 'hero_' + id + '_2']),            /* _2: the second animation frame */
  ...Object.values(HERO_ANIM).flatMap(a => [a.portrait, a.idle.name, a.attack.name]),
  ...Object.keys(ENEMIES).flatMap(id => ['enemy_' + id, 'enemy_' + id + '_2']),
  ...Object.keys(ITEMS).flatMap(id => [0, 1, 2, 3].map(r => 'item_' + id + '_' + r)),
  ...['arrow', 'arrow_gold', 'arrow_toxic', 'bolt_arcane', 'fireball', 'ice_shard', 'spark', 'dagger_toxic', 'flask_fire', 'flask_toxic',
    'boomerang', 'sword', 'piercing', 'seed', 'holy', 'shadow', 'hellfire', 'dart'].map(n => 'proj_' + n),
  ...['flame', 'frost', 'storm'].map(n => 'minion_totem_' + n),
  ...['imp', 'demon', 'golem', 'horse'].flatMap(n => ['minion_' + n, 'minion_' + n + '_2']),
  'fx_judgement', ...RELICS.map(r => relicIcon(r.name)),
  'fx_hit', 'fx_slash', 'fx_explosion', 'fx_strike', 'fx_spikes', 'fx_moon', 'fx_moonburst', 'minion_wolf', 'minion_wolf_2',
  ...['bleed', 'burn', 'poison', 'slow', 'freeze', 'shock', 'root', 'corruption', 'hex', 'doom', 'verdict', 'purge', 'link', 'stun'].map(n => 'ail_' + n),
  ...['poison', 'oil', 'storm_cloud', 'barrier', 'trap', 'thorns'].map(n => 'zone_' + n),
  ...Object.values(ATTACK_ICON).map(n => 'ability_' + n), ...Object.keys(ULTIMATES).map(n => 'ability_ult_' + n),
  ...['tree', 'tree_2', 'bush', 'rock', 'flowers', 'mushrooms'].map(n => 'deco_' + n),
  'tiles'
])];

const canLoad = () => typeof Image !== 'undefined';
const cache = new Map();

/* The image for a sprite, or null while it is not ready. */
export function get(name) {
  let img = cache.get(name);
  if (img === undefined) {
    if (!canLoad()) return null;
    img = new Image();
    img.onerror = () => cache.set(name, null);
    img.src = spriteUrl(name);
    cache.set(name, img);
  }
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/* The tile sheet's index (tiles.json: tile name -> position on the sheet), or null while it is loading. */
let tileIndex, tileReq = null;
export function tiles() {
  const img = get('tiles');
  if (!img) return null;
  if (tileIndex === undefined && !tileReq && typeof fetch === 'function') {
    tileReq = fetch(new URL('tiles.json', BASE)).then(r => r.json()).then(j => { tileIndex = j; }, () => { tileIndex = null; });
  }
  return tileIndex ? { img, index: tileIndex.tiles, columns: tileIndex.columns, size: tileIndex.size } : null;
}

/* Starts loading everything, so the art is there by the time a match begins. */
export function preload() { if (canLoad()) { for (const n of SPRITES) get(n); tiles(); } }

/* The board is drawn tilted (camera.js TILT: depth squashed), but characters and other sprites stand upright on it.
   upright(ctx, x, y, fn) undoes the squash around the ground point (x, y) while fn draws (a unit with its health bar,
   say); drawSprite does it by itself around the sprite's centre unless it is already inside upright(). */
let standing = 0;
export const unsquash = () => (standing ? 1 : 1 / TILT);
export function upright(ctx, x, y, fn) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / TILT); ctx.translate(-x, -y);
  standing++;
  try { fn(); } finally { standing--; ctx.restore(); }
}

/* Draws a sprite centred on (x, y) at size s (square), upright, turned by angle a; returns false when it is not loaded. */
export function drawSprite(ctx, name, x, y, s, a = 0, frame = -1, frames = 1) {
  const img = get(name);
  if (!img) return false;
  const fw = img.naturalWidth / frames, fh = img.naturalHeight, sx = frame < 0 ? 0 : Math.min(frames - 1, frame) * fw, u = unsquash();
  if (a || u !== 1) {
    ctx.save(); ctx.translate(x, y); if (u !== 1) ctx.scale(1, u); if (a) ctx.rotate(a);
    ctx.drawImage(img, sx, 0, fw, fh, -s / 2, -s / 2, s, s); ctx.restore();
  } else ctx.drawImage(img, sx, 0, fw, fh, x - s / 2, y - s / 2, s, s);
  return true;
}

/* The sprite name for a hero (its evolved form if it has one). */
export const heroSprite = def => 'hero_' + (def.form || def.id);
/* A sprite's animation frame: frame 1 is the plain name, frame 2 adds _2 (falls back to frame 1 until it has loaded). */
export const frameOf = (name, two) => (two && get(name + '_2') ? name + '_2' : name);
/* An <img> of a sprite for the menus, drawn with sharp pixels. It removes itself if the file cannot load. */
export function spriteImg(name, cls = 'pix') {
  const img = document.createElement('img');
  img.className = cls; img.alt = ''; img.draggable = false;
  img.onerror = () => img.remove?.();
  img.src = spriteUrl(name);
  return img;
}
