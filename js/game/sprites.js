/* Pixel-art sprites, built by `python3 art/build.py` into assets/ (see the Art section of the README).
   Sprites load in the background the first time they are asked for. Until one has loaded (or if it fails, or there is no
   browser to load it, as in the tests), get() returns null and the renderer draws its plain shapes instead, so the game
   never waits for art. Images are drawn with smoothing off so the pixels stay sharp. */
import { HEROES } from '../content/data.js';
import { ITEMS } from '../content/items.js';
import { ENEMIES } from '../engine/enemies.js';
import { ULTIMATES } from '../engine/ultimates.js';

const BASE = new URL('../../assets/', import.meta.url);
export const spriteUrl = name => new URL(name + '.png', BASE).href;

/* Every sprite the game uses (a test checks that each one is in assets/). */
/* Ability icons on the hero buttons: the basic attack icon for each hero and evolution (ultimates use ability_ult_<id>). */
export const ATTACK_ICON = {
  warrior: 'atk_sword', berserker: 'atk_twin', commander: 'atk_launch', sentinel: 'atk_sword',
  ranger: 'atk_arrow', marksman: 'atk_arrow_gold', boomeranger: 'atk_boomerang', hunter: 'atk_arrow_toxic',
  mage: 'atk_arcane', firemage: 'atk_fire', coldmage: 'atk_cold', lightningmage: 'atk_lightning',
  rogue: 'atk_twin', assassin: 'atk_blink', toxicologist: 'atk_daggers', alchemist: 'atk_flask',
  druid: 'atk_seed', animalic: 'atk_wolf', naturist: 'atk_thorns', lunar: 'atk_moonbeam'
};
export const attackIcon = def => 'ability_' + (ATTACK_ICON[def.form || def.id] || 'atk_sword');
export const ultimateIcon = def => 'ability_ult_' + def.ultimate;
const heroIds = HEROES.flatMap(h => [h.id, ...(h.evolutions || []).flatMap(s => s.choices.map(c => c.id))]);
export const SPRITES = [...new Set([
  ...heroIds.map(id => 'hero_' + id),
  ...Object.keys(ENEMIES).map(id => 'enemy_' + id),
  ...Object.keys(ITEMS).flatMap(id => [0, 1, 2, 3].map(r => 'item_' + id + '_' + r)),
  ...['arrow', 'arrow_gold', 'arrow_toxic', 'bolt_arcane', 'fireball', 'ice_shard', 'spark', 'dagger_toxic', 'flask_fire', 'flask_toxic',
    'boomerang', 'sword', 'piercing', 'seed'].map(n => 'proj_' + n),
  'fx_hit', 'fx_slash', 'fx_explosion', 'fx_strike', 'fx_spikes', 'fx_moon', 'fx_moonburst', 'minion_wolf',
  ...['bleed', 'burn', 'poison', 'slow', 'freeze', 'shock', 'root'].map(n => 'ail_' + n),
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

/* Draws a sprite centred on (x, y) at size s (square), turned by angle a; returns false when it is not loaded. */
export function drawSprite(ctx, name, x, y, s, a = 0, frame = -1, frames = 1) {
  const img = get(name);
  if (!img) return false;
  const fw = img.naturalWidth / frames, fh = img.naturalHeight, sx = frame < 0 ? 0 : Math.min(frames - 1, frame) * fw;
  if (a) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(img, sx, 0, fw, fh, -s / 2, -s / 2, s, s); ctx.restore(); }
  else ctx.drawImage(img, sx, 0, fw, fh, x - s / 2, y - s / 2, s, s);
  return true;
}

/* The sprite name for a hero (its evolved form if it has one). */
export const heroSprite = def => 'hero_' + (def.form || def.id);
/* An <img> of a sprite for the menus, drawn with sharp pixels. It removes itself if the file cannot load. */
export function spriteImg(name, cls = 'pix') {
  const img = document.createElement('img');
  img.className = cls; img.alt = ''; img.draggable = false;
  img.onerror = () => img.remove?.();
  img.src = spriteUrl(name);
  return img;
}
