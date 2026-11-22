/* Canvas drawing. The world is drawn through the camera; the board is cheap enough to draw every frame, which keeps it sharp at any zoom. */
import { COLS, ROWS, T, HEROES } from '../content/data.js';
import { tintOf } from '../engine/effects.js';
import { get as sprite, tiles as tileSheet, drawSprite, heroSprite, frameOf, heroAnim, attackFrame, attackPeriod, terrain, drawEnemyArt, enemyHeight, ENEMY_ANIM, upright, unsquash, at, setPicture } from './sprites.js';
import { project, unproject, scaleAt, setView } from './camera.js';
import { isShielded } from '../engine/enemy-abilities.js';
import { TILE_EFFECTS, TILES } from '../content/shop.js';
import { MAP_EFFECTS } from '../content/map-effects.js';
import { drawAuras, drawMinions, drawMounted, KIT_PROJ, KIT_ZONE, KIT_AIL_ICON, BUFF_COLOR } from './kit-art.js';

const MAP_W = COLS * T, MAP_H = ROWS * T;
/* Sprite sizes on the map (the art is 64 pixels a tile; the map uses T). Heroes stand on their tile, feet near its bottom. */
const HERO_S = T * 1.2, HERO_DY = -T * 0.12;
/* Enemies: drawn size, and where the figure's head starts in its image (for the health bar). */
const ENEMY_ART = { runner: { s: 44, top: 0.25 }, grunt: { s: 48, top: 0.22 }, brute: { s: 56, top: 0.12 }, boss: { s: 68, top: 0.03 } };

/* How each projectile type looks (the engine only simulates them). */
/* Which sprite a projectile uses (null: draw the shape). Arrows and bolts point where they fly. */
function boltSprite(p) {
  const d = p.owner && p.owner.def, form = d && (d.form || d.id);
  if (p.look === 'arrow') return form === 'marksman' ? 'proj_arrow_gold' : form === 'hunter' ? 'proj_arrow_toxic' : 'proj_arrow';
  if (p.look === 'dagger') return 'proj_dagger_toxic';
  if (p.look === 'flask') return p.as === 'toxic' ? 'proj_flask_toxic' : 'proj_flask_fire';
  if (p.look === 'seed') return 'proj_seed';
  if (p.look === 'dart') return 'proj_dart';
  const type = p.as || (d && d.damageType);
  if (type === 'holy') return 'proj_holy';
  if (type === 'shadow') return 'proj_shadow';
  return type === 'fire' ? 'proj_fireball' : type === 'cold' ? 'proj_ice_shard' : type === 'lightning' ? 'proj_spark' : 'proj_bolt_arcane';
}
/* Effect art in the new style (Pixel Lab, art/pixellab/): frames side by side, each w x h, drawn around its anchor (ax, ay)
   (a projectile's head, a swing's centre, an impact's middle), n frames. */
export const FX = {
  proj_orb_arcane: { w: 54, h: 25, n: 8, ax: 41, ay: 12 }, proj_orb_holy: { w: 54, h: 25, n: 8, ax: 41, ay: 12 },
  proj_orb_shadow: { w: 54, h: 25, n: 8, ax: 41, ay: 12 }, proj_orb_nature: { w: 54, h: 25, n: 8, ax: 41, ay: 12 },
  /* each caster's own shot (k: its size, world px per art px; drawn small, like the heroes) */
  proj_shard: { w: 101, h: 28, n: 4, ax: 90, ay: 13, k: 0.4 }, proj_lightbolt: { w: 95, h: 43, n: 4, ax: 85, ay: 21, k: 0.4 },
  proj_skullflame: { w: 109, h: 49, n: 5, ax: 100, ay: 24, k: 0.38 }, proj_leaf: { w: 94, h: 64, n: 8, ax: 69, ay: 32, k: 0.4 },
  proj_arrow: { w: 48, h: 16, n: 1, ax: 44, ay: 8 },
  fx_swing: { w: 61, h: 57, n: 9, ax: 27, ay: 34 },
  fx_slash2: { w: 109, h: 55, n: 13, ax: 7, ay: 27 },
  /* the casters' hits (m: scales the size the caller asks for) */
  fx_impact_arcane: { w: 88, h: 95, n: 5, ax: 45, ay: 47, m: 0.7 }, fx_impact_holy: { w: 102, h: 102, n: 5, ax: 52, ay: 50, m: 0.65 },
  fx_impact_nature: { w: 96, h: 84, n: 5, ax: 51, ay: 40, m: 0.7 }, fx_impact_shadow: { w: 90, h: 92, n: 5, ax: 47, ay: 47, m: 0.7 },
  fx_impact_physical: { w: 45, h: 43, n: 6, ax: 21, ay: 22 }, fx_impact_lightning: { w: 70, h: 52, n: 10, ax: 28, ay: 22 },
  fx_crit: { w: 66, h: 69, n: 8, ax: 35, ay: 30 }
};
/* Draws frame f of an FX sheet with its anchor at (x, y), k world px per art px, turned by angle a, upright on the board. */
function drawFx(ctx, name, f, x, y, k, a = 0) {
  const img = sprite(name), F = FX[name];
  if (!img || !F) return false;
  if (F.m) k *= F.m;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, unsquash()); if (a) ctx.rotate(a);
  ctx.drawImage(img, Math.min(F.n - 1, Math.max(0, f)) * F.w, 0, F.w, F.h, -F.ax * k, -F.ay * k, F.w * k, F.h * k);
  ctx.restore();
  return true;
}
/* The new orbs for the base heroes' magic, by the old sprite's name. */
/* The base casters' shots, by the old sprite's name: the Mage's crystal shard, the Priest's bolt of light, the Warlock's
   skull flame, the Druid's whirling leaf (the orbs are kept as a fallback while these load). */
const SHOT = { proj_bolt_arcane: 'proj_shard', proj_holy: 'proj_lightbolt', proj_shadow: 'proj_skullflame', proj_seed: 'proj_leaf' };
const ORB = { proj_bolt_arcane: 'proj_orb_arcane', proj_holy: 'proj_orb_holy', proj_shadow: 'proj_orb_shadow', proj_seed: 'proj_orb_nature' };
/* Which impact plays where a bolt lands. */
const IMPACT = { proj_bolt_arcane: 'fx_impact_arcane', proj_holy: 'fx_impact_holy', proj_shadow: 'fx_impact_shadow', proj_seed: 'fx_impact_nature', proj_spark: 'fx_impact_lightning' };
export const impactOf = p => IMPACT[boltSprite(p)] || 'fx_impact_physical';
/* Bolts that landed since the last frame (gone from the world while their target was still there to be hit): their impact
   plays on the target. v.bolts: the bolts in flight last frame. */
export function boltImpacts(g, v) {
  const now = new Set();
  for (const p of g.projs) if (p.type === 'bolt' && p.target) now.add(p);
  if (v.bolts) for (const p of v.bolts) if (!now.has(p) && p.owner && p.owner.def && p.owner.def.archetype) {
    const tg = p.target, k = (p.size > 5 ? 0.85 : 0.65);
    if (Math.hypot(tg.x - p.x, tg.y - p.y) < 30) addImpact(v.vfx, impactOf(p), tg, k);
  }
  v.bolts = now;
}
const PROJ_DRAW = {
  bolt(ctx, p) {
    const sp = boltSprite(p), big = p.size > 5 ? 1.35 : 1, ang = Math.atan2(p.dy, p.dx);
    const shot = SHOT[sp], S = shot && FX[shot];
    if (S && drawFx(ctx, shot, ((performance.now() / 83) | 0) % S.n, p.x, p.y, S.k * big, ang)) return;   /* animated, 12 fps */
    if (ORB[sp] && drawFx(ctx, ORB[sp], ((performance.now() / 83) | 0) % 8, p.x, p.y, 0.7 * big, ang)) return;
    if (sp === 'proj_arrow' && drawFx(ctx, sp, 0, p.x, p.y, 0.62 * big, ang)) return;
    if (p.look === 'flask' ? drawSprite(ctx, sp, p.x, p.y, 22) : drawSprite(ctx, sp, p.x - p.dx * 6, p.y - p.dy * 6, 26 * big, Math.atan2(p.dy, p.dx))) return;
    if (p.look === 'arrow') {                 /* a shaft with a head, pointing where it flies */
      const L = p.size > 5 ? 20 : 14, hx = p.x, hy = p.y, tx = hx - p.dx * L, ty = hy - p.dy * L;
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size > 5 ? 3.5 : 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - p.dx * 6 - p.dy * 4, hy - p.dy * 6 + p.dx * 4);
      ctx.lineTo(hx - p.dx * 6 + p.dy * 4, hy - p.dy * 6 - p.dx * 4); ctx.closePath(); ctx.fillStyle = p.color; ctx.fill();
      return;
    }
    if (p.look === 'dagger') {                /* a short blade, pointing where it flies (Toxicologist) */
      const L = 12, hx = p.x, hy = p.y, tx = hx - p.dx * L, ty = hy - p.dy * L;
      ctx.strokeStyle = '#d9f2b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx - p.dy * 4, ty + p.dx * 4); ctx.lineTo(tx + p.dy * 4, ty - p.dx * 4); ctx.stroke();
      return;
    }
    if (p.look === 'flask') {                 /* a round bottle, orange for fire and green for toxic (Alchemist) */
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, 7); ctx.fillStyle = p.as === 'toxic' ? '#7ad04b' : '#ff8a3d'; ctx.fill();
      ctx.strokeStyle = '#f4ead2'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#c9b37e'; ctx.fillRect(p.x - 1.5, p.y - 9, 3, 4);
      return;
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size + 4, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fillStyle = p.color; ctx.fill();
  },
  /* Toxicologist's poison bottle, arcing through the air to where it lands. */
  flask(ctx, p) {
    const k = Math.min(1, p.t / p.dur), y = p.y - Math.sin(k * Math.PI) * 36;
    ctx.beginPath(); ctx.ellipse?.(p.x, p.y, 6, 3, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    if (drawSprite(ctx, 'proj_flask_toxic', p.x, y, 26)) return;
    ctx.beginPath(); ctx.arc(p.x, y, 7, 0, 7); ctx.fillStyle = '#7ad04b'; ctx.fill(); ctx.strokeStyle = '#e8ffd0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#c9b37e'; ctx.fillRect(p.x - 2, y - 11, 4, 5);
  },
  /* Charging: a growing glow on the Marksman; flying: a long bright streak. */
  pierce(ctx, p) {
    if (p.charge > 0) {
      const k = 1 - p.charge / 0.35;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8 + 14 * k, 0, 7); ctx.fillStyle = 'rgba(255,246,200,' + (0.25 + 0.4 * k) + ')'; ctx.fill();
      return;
    }
    if (drawSprite(ctx, 'proj_piercing', p.x - p.dx * 22, p.y - p.dy * 22, 56, Math.atan2(p.dy, p.dx))) return;
    ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x - p.dx * 46, p.y - p.dy * 46); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,215,106,.45)'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(p.x - p.dx * 30, p.y - p.dy * 30); ctx.lineTo(p.x, p.y); ctx.stroke();
  },
  orbit(ctx, p) { PROJ_DRAW.boomerang(ctx, p); },
  /* Commander's sword: a blade with a crossguard, pointing where it flies. */
  sword(ctx, p) {
    if (drawSprite(ctx, 'proj_sword', p.x - p.dx * 12, p.y - p.dy * 12, 48, Math.atan2(p.dy, p.dx))) return;
    const hx = p.x, hy = p.y, bx = hx - p.dx * 22, by = hy - p.dy * 22;
    ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = '#8a6b3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - p.dy * 7, by + p.dx * 7); ctx.lineTo(bx + p.dy * 7, by - p.dx * 7); ctx.stroke();
  },
  boomerang(ctx, p) {
    if (drawSprite(ctx, 'proj_boomerang', p.x, p.y, 28, p.rot || 0.001)) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.strokeStyle = '#8be28b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(0, 0); ctx.lineTo(9, -9); ctx.stroke();
    ctx.restore();
  }
};

Object.assign(PROJ_DRAW, KIT_PROJ);

/* Short-lived visuals, pooled so busy fights don't create garbage. vfx = { beams: [], slashes: [] } belongs to the screen. */
const pool = [];
/* A beam drawn as a bolt of lightning: a jagged line that re-forks every couple of frames (a glow, a bright core and a
   white heart), fading as it ends. a, c: its ends in the picture; sc: the perspective scale there. */
function drawBolt(ctx, a, c, b, sc) {
  const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const segs = Math.max(2, Math.round(len / (10 * sc))), life = b.ttl ? b.t / b.ttl : 1;
  let r = (b.seed + ((performance.now() / 50) | 0) * 7919) >>> 0;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  const pts = [a];
  for (let i = 1; i < segs; i++) { const t = i / segs, o = rnd() * 9 * sc; pts.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]); }
  pts.push(c);
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
  ctx.globalAlpha = 0.35 * life; ctx.strokeStyle = b.c; ctx.lineWidth = b.w * 2.6 * sc; path(); ctx.stroke();
  ctx.globalAlpha = 0.9 * life; ctx.lineWidth = b.w * sc; path(); ctx.stroke();
  ctx.globalAlpha = life; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, b.w * 0.4 * sc); path(); ctx.stroke();
  ctx.restore();
}
/* from, to (optional): the hero or enemy at each end. A beam then starts at the hero's staff or hand (shotFrom) and runs
   between the figures' bodies, not their feet; lifts are in upright units above the ground point. */
export function addBeam(vfx, x1, y1, x2, y2, ttl, color, w = 3, from = null, to = null) {
  const b = pool.pop() || {};
  b.l1 = b.l2 = 0;
  if (from) { const m = shotFrom(from, x2); x1 = m.x; y1 = m.y; b.l1 = m.lift; }
  if (to) b.l2 = bodyLift(to);
  b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.t = b.ttl = ttl; b.c = color; b.w = w; b.seed = (Math.random() * 1e9) | 0;
  vfx.beams.push(b);
  if (to) addImpact(vfx, 'fx_impact_lightning', to, 0.6, 0.45);   /* a crackle where the bolt strikes */
}
/* Where a hero's shots leave it, aimed at world x toX: the tip of its staff, its bow or its hand (HERO_ANIM muzzle, a
   point on its first attack frame), mirrored like the attack art; heroes without that art shoot from their chest. Returns
   the ground point under it and its height above that point (upright units). Enemies: the middle of their body. */
function shotFrom(u, toX) {
  if (!u.def || !u.def.archetype) return { x: u.x, y: u.y, lift: bodyLift(u) };
  const A = heroAnim(u.def);
  if (!A || !A.muzzle) return { x: u.x, y: u.y + HERO_FOOT, lift: HERO_S * 0.44 };
  const k = T * A.tiles / A.height, right = toX > u.x, sign = right === (A.attack.swings === 'right') ? 1 : -1;
  return { x: u.x + sign * (A.muzzle[0] - A.foot[0]) * k, y: u.y + HERO_FOOT, lift: (A.foot[1] - A.muzzle[1]) * k };
}
function bodyLift(e) { const h = enemyHeight(e.type, T); if (h) return h * 0.5; const look = ENEMY_ART[e.type]; return look ? look.s * 0.44 : (e.def && e.def.radius) || 12; }
/* A hero's bolt or arrow is drawn leaving its staff, bow or hand and arriving at the middle of its target's body: the
   engine flies it from the hero's tile to the target's feet, and the drawing eases from one to the other along the way. */
function projView(p) {
  const o = p.owner;
  if (p.type !== 'bolt' || !o || !o.def || !o.def.archetype) return null;
  const tg = p.target, m = shotFrom(o, tg ? tg.x : p.x + p.dx);
  const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = tg ? Math.hypot(tg.x - p.x, tg.y - p.y) : 0, f = d0 + d1 > 0 ? d0 / (d0 + d1) : 1;
  return { x: p.x + (m.x - o.x) * (1 - f), y: p.y + (m.y - o.y) * (1 - f), lift: m.lift * (1 - f) + (tg ? bodyLift(tg) : m.lift) * f };
}
export function tickBeams(vfx, dt) {
  const list = vfx.beams; let j = 0;
  for (let i = 0; i < list.length; i++) { const b = list[i]; if ((b.t -= dt) > 0) list[j++] = b; else pool.push(b); }
  list.length = j;
}
const spool = [];
export function addSlash(vfx, x, y, ang, half, r, ttl, color, delay = 0) {
  const s = spool.pop() || {};
  s.delay = delay; s.x = x; s.y = y; s.a = ang; s.h = half; s.r = r; s.t = s.ttl = ttl * 1.8; s.c = color;   /* shown a little longer than the hit lasts, so the swing reads */
  vfx.slashes.push(s);
}
export function tickSlashes(vfx, dt) {
  const list = vfx.slashes; let j = 0;
  for (let i = 0; i < list.length; i++) { const s = list[i]; if (s.delay > 0) { s.delay -= dt; list[j++] = s; continue; } if ((s.t -= dt) > 0) list[j++] = s; else spool.push(s); }
  list.length = j;
}

/* Sprite animations (hit sparks, explosions): { name, x, y, t, dur, frames, s }. */
const apool = [];
export function addAnim(vfx, name, x, y, s, dur, frames) {
  const a = apool.pop() || {};
  a.name = name; a.x = x; a.y = y; a.s = s; a.t = 0; a.dur = dur; a.frames = frames; a.k = 0; a.lift = 0;
  vfx.anims.push(a);
}
/* An FX sheet played once at (x, y), lift (upright px) above it, k world px per art px, over dur seconds. */
export function addFx(vfx, name, x, y, k, dur, lift = 0) {
  addAnim(vfx, name, x, y, 0, dur, FX[name] ? FX[name].n : 1);
  const a = vfx.anims[vfx.anims.length - 1]; a.k = k; a.lift = lift;
}
/* An impact on an enemy's body (its middle, not its feet). */
export function addImpact(vfx, name, e, k = 0.7, dur = 0.4) { addFx(vfx, name, e.x, e.y, k, dur, bodyLift(e)); }
export function tickAnims(vfx, dt) {
  const list = vfx.anims; let j = 0;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if ((a.t += dt) < a.dur) list[j++] = a; else apool.push(a); }
  list.length = j;
}

/* How each zone type looks: a sprite when the art has loaded, otherwise a shape. */
const ZONE_SPRITE = {
  storm: (ctx, z) => {   /* a faint dark area ringed by small thunderclouds at their own size (a big storm never stretches the art) */
    const cloud = sprite('zone_storm_cloud');
    if (!cloud) return false;
    const a = Math.max(0, Math.min(1, z.t));
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fillStyle = 'rgba(40,36,70,.22)'; ctx.fill();
    ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(196,139,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    const n = Math.max(6, Math.round(2 * Math.PI * z.r / 46)), spin = z.t * 0.25;
    for (let i = 0; i < n; i++) {
      const ang = spin + i * 2 * Math.PI / n, bob = Math.sin(z.t * 3 + i) * 1.5;
      ctx.drawImage(cloud, z.x + Math.cos(ang) * z.r - 12, z.y + Math.sin(ang) * z.r - 12 + bob, 24, 24);
    }
    ctx.globalAlpha = 1;
    return true;
  },
  barrier: (ctx, z) => fade(ctx, Math.min(1, z.t * 4), () => drawSprite(ctx, 'zone_barrier', z.x, z.y, T * 1.15)),
  poisonpool: (ctx, z) => fade(ctx, Math.min(1, z.t), () => drawSprite(ctx, 'zone_poison', z.x, z.y, z.r * 2.4)),
  oil: (ctx, z) => fade(ctx, Math.min(1, z.t * 2), () => drawSprite(ctx, 'zone_oil', z.x, z.y, z.r * 2.4)),
  trap: (ctx, z) => drawSprite(ctx, 'zone_trap', z.x, z.y, 30),
  /* Naturist Druid: a bramble patch that fades in and out over its 1.5 seconds; when it erupts, spikes burst out of it. */
  thorns: (ctx, z) => {
    if (!sprite('zone_thorns')) return false;
    if (z.t > 0) fade(ctx, Math.min(1, (z.life - z.t) * 8, z.t * 4), () => drawSprite(ctx, 'zone_thorns', z.x, z.y, z.r * 2.4));
    if (z.spikeT > 0) drawSprite(ctx, 'fx_spikes', z.x, z.y - 10, 52, 0, Math.min(2, Math.floor((1 - z.spikeT / 0.45) * 3)), 3);
    return true;
  },
  /* Lunar Druid: the moon falls from the sky onto where it will land; its shadow grows underneath. */
  moonfall: (ctx, z) => {
    if (!sprite('fx_moon')) return false;
    const k = Math.max(0, z.t / z.fall);   /* 1 at the top, 0 when it lands */
    ctx.globalAlpha = 0.35 * (1 - k) + 0.1;
    ctx.beginPath(); ctx.ellipse?.(z.x, z.y, z.r * (1 - 0.5 * k), z.r * 0.4 * (1 - 0.5 * k), 0, 0, 7); ctx.fillStyle = '#0a1020'; ctx.fill();
    ctx.globalAlpha = 1;
    drawSprite(ctx, 'fx_moon', z.x, z.y - 20 - 220 * k * k, 56 + 30 * (1 - k));
    return true;
  }
};
function fade(ctx, a, fn) { ctx.globalAlpha = Math.max(0, Math.min(1, a)); const ok = fn(); ctx.globalAlpha = 1; return ok; }
const ZONE_DRAW = {
  /* The Lightning Mage's storm: a flickering circle that fades as it ends. */
  storm(ctx, z) {
    const a = Math.min(1, z.t) * (0.75 + 0.25 * Math.sin(z.t * 40));
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7);
    ctx.fillStyle = 'rgba(255,228,92,' + (0.1 * a) + ')'; ctx.fill();
    ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,228,92,' + (0.7 * a) + ')'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  },
  /* The Sentinel's barricade: a wooden wall across the path tile. */
  barrier(ctx, z) {
    ctx.globalAlpha = Math.min(1, z.t * 4);
    ctx.fillStyle = '#6b4f2a'; ctx.fillRect(z.x - 16, z.y - 18, 32, 36);
    ctx.strokeStyle = '#c9b37e'; ctx.lineWidth = 2; ctx.strokeRect(z.x - 16, z.y - 18, 32, 36);
    ctx.beginPath(); for (const k of [-6, 6]) { ctx.moveTo(z.x - 16, z.y + k); ctx.lineTo(z.x + 16, z.y + k); } ctx.stroke();
    ctx.globalAlpha = 1;
  },
  /* The Toxicologist's puddle of poison: bubbling green, fading out at the end. */
  poisonpool(ctx, z) {
    ctx.globalAlpha = Math.min(1, z.t);
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fillStyle = 'rgba(122,208,75,.28)'; ctx.fill();
    ctx.strokeStyle = 'rgba(122,208,75,.7)'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = z.t * 2 + i * 1.7; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a * 1.3) * z.r * 0.4, 3, 0, 7); ctx.fillStyle = 'rgba(200,255,150,.6)'; ctx.fill(); }
    ctx.globalAlpha = 1;
  },
  /* The Alchemist's flammable puddle: a dark, glossy slick. */
  oil(ctx, z) {
    ctx.globalAlpha = Math.min(1, z.t * 2);
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fillStyle = 'rgba(60,40,15,.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,159,67,.75)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(z.x - z.r * 0.3, z.y - z.r * 0.3, z.r * 0.25, 0, 7); ctx.fillStyle = 'rgba(255,220,160,.25)'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  /* The Hunter's trap: a green spiked ring on the path. */
  trap(ctx, z) {
    ctx.beginPath(); ctx.arc(z.x, z.y, 9, 0, 7); ctx.fillStyle = 'rgba(30,50,20,.85)'; ctx.fill();
    ctx.strokeStyle = '#7ad04b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.moveTo(z.x + Math.cos(a) * 9, z.y + Math.sin(a) * 9); ctx.lineTo(z.x + Math.cos(a) * 14, z.y + Math.sin(a) * 14); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(z.x, z.y, 3.5, 0, 7); ctx.fillStyle = '#b6f07c'; ctx.fill();
  }
};

Object.assign(ZONE_DRAW, KIT_ZONE);

function poly(ctx, x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * Math.PI / n, px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/* A cheap, stable hash per tile: the same map always gets the same trees and rocks. */
function tileHash(seed, x, y) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Scenery for one tile outside the map: a tree, a rock, a grass tuft or nothing. Drawn in tile-local coordinates. */
function scenery(ctx, x, y, r) {
  const px = x * T, py = y * T, ox = (tileHash(r * 1e9, x, y) - 0.5) * 12, oy = (tileHash(r * 7e8, y, x) - 0.5) * 12;
  if (r < 0.10) {                         /* tree */
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(px + 22 + ox, py + 25 + oy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#1e3a26'; ctx.beginPath(); ctx.arc(px + 20 + ox, py + 20 + oy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#285034'; ctx.beginPath(); ctx.arc(px + 17 + ox, py + 17 + oy, 8, 0, 7); ctx.fill();
  } else if (r < 0.15) {                  /* rock */
    ctx.fillStyle = '#4a5450'; ctx.beginPath(); ctx.arc(px + 20 + ox, py + 22 + oy, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#5f6a65'; ctx.beginPath(); ctx.arc(px + 18 + ox, py + 20 + oy, 4, 0, 7); ctx.fill();
  } else if (r < 0.32) {                  /* grass tuft */
    ctx.strokeStyle = '#3b5c45'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(px + 20 + ox + i * 4, py + 26 + oy); ctx.lineTo(px + 20 + ox + i * 6, py + 18 + oy); }
    ctx.stroke();
  }
}

/* ---- The painted board: the map and a margin of forest around it, drawn once per map from the tile sheet ----------------
   Grass on the map, forest floor outside, the dirt road (autotiled: each road tile picks its mask and edge from which of its
   8 neighbours are road too) and trees, bushes and rocks in the forest. Drawn at the art's 64 pixels per tile into an
   offscreen canvas, then scaled to the map with smoothing off. */
/* The land painted around the map, in tiles: wide to the sides and far behind, less in front (the camera looks over it).
   Multiples of 4, the forest texture's repeat, so the board view can carry the forest on past them without a seam. */
const MARGIN = { side: 12, back: 16, front: 8 }, TS = 64;
const DECO = [[0.08, 'deco_tree', 1.1], [0.12, 'deco_tree_2', 1.1], [0.17, 'deco_bush', 0.55], [0.2, 'deco_rock', 0.55], [0.24, 'deco_flowers', 0.5], [0.26, 'deco_mushrooms', 0.5]];
let board = null;
const mod4 = n => ((n % 4) + 4) % 4;
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function roadCells(g, x0, x1) {
  const set = new Set(g.path.map(([x, y]) => x + ',' + y)), start = g.path[0], end = g.path[g.path.length - 1];
  for (let x = x0; x < 0; x++) set.add(x + ',' + start[1]);
  for (let x = COLS; x < x1; x++) set.add(x + ',' + end[1]);
  return set;
}
function paintBoard(g) {
  const tr = terrain();
  if (tr === 'wait') return null;
  return tr ? paintTerrain(g, tr) : paintOldBoard(g, tileSheet());
}
/* Scenery in the forest around the map (never on the map or the road): standing sprites, kept with their world position
   (of the foot) and world size, see drawScenery. table: [chance up to, sprite, size in tiles]. */
function placeScenery(g, table, imgs, x0, y0, w, h, on, inMap, seed) {
  const scenery = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (inMap(x, y) || on(x, y) || on(x, y - 1) || on(x, y + 1)) continue;
    const r = tileHash(seed, x, y), d = table.findIndex(e => r < e[0]);
    if (d < 0) continue;
    if (table[d][2] > 1 && y >= ROWS && y <= ROWS + 1 && x >= -1 && x <= COLS) continue;   /* no tall tree right in front of the board: it would hide the near row */
    const img = imgs[d], s = TS * table[d][2], ox = (tileHash(r * 1e9, x, y) - 0.5) * 16, oy = (tileHash(r * 7e8, y, x) - 0.5) * 12;
    scenery.push({ img, x: x * T + T / 2 + ox * T / TS, y: (y + 1) * T + oy * T / TS, s: s * T / TS, big: table[d][2] > 1 });
  }
  scenery.sort((a, b) => a.y - b.y);
  return scenery;
}
/* The forest around the map, for the Pixel Lab terrain: thick far out, thinning toward the map (trees get rarer, bushes,
   rocks, flowers and mushrooms take over near its edge), plus a few small things on the map itself (flowers, mushrooms,
   a stone, a little bush) so the field is not cut off from the land around it; few enough not to get in the way. Never
   on the road or right beside it, no tall tree right in front of the board. Same layout every time for a map (seeded).
   DECO2 order: oak, pine, bush, rock, flowers, mushrooms. */
const SMALL = [[0.35, 2], [0.55, 3], [0.8, 4], [1, 5]];   /* [chance up to, DECO2 index]: bush, rock, flowers, mushrooms */
const FIELD = [[0.4, 4], [0.65, 5], [0.85, 3], [1, 2]];   /* on the map: mostly flowers and mushrooms */
function placeForest(imgs, x0, y0, w, h, on, inMap, seed) {
  const out = [], put = (d, x, y, k, ox, oy) => {
    const s = TS * DECO2[d][2] * k;
    out.push({ img: imgs[d], x: x * T + T / 2 + ox * T / TS, y: (y + 1) * T + oy * T / TS, s: s * T / TS, big: DECO2[d][2] > 1 });
  };
  const pick = (table, r) => table.find(e => r < e[0])[1];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (on(x, y) || on(x, y - 1) || on(x, y + 1)) continue;
    const r = tileHash(seed, x, y), r2 = tileHash(r * 1e9, x, y), r3 = tileHash(r * 7e8, y, x), ox = (r2 - 0.5) * 18, oy = (r3 - 0.5) * 14;
    if (inMap(x, y)) {                                     /* the field: a handful of small things */
      if (r < 0.045) put(pick(FIELD, r2), x, y, 0.75, ox, oy * 0.5 - 18);
      continue;
    }
    const dx = x < 0 ? -x : x >= COLS ? x - COLS + 1 : 0, dy = y < 0 ? -y : y >= ROWS ? y - ROWS + 1 : 0, d = Math.max(dx, dy);
    const front = y >= ROWS && y <= ROWS + 1 && x >= -1 && x <= COLS;   /* right in front of the board: nothing tall */
    const tree = front ? 0 : Math.min(0.85, Math.max(0, (d - 1) * 0.15)), small = d <= 3 ? 0.14 : 0.06;
    if (r < tree) {
      put(r2 < 0.55 ? 0 : 1, x, y, 0.9 + r3 * 0.25, ox, oy);
      if (d >= 5 && tileHash(r * 3e9, x, y) < tree * 0.7) put(r3 < 0.5 ? 0 : 1, x, y, 0.85 + r2 * 0.25, -ox - 14, oy - 22);   /* thick: a second tree behind */
    } else if (r < tree + small) put(pick(SMALL, r2), x, y, 0.9 + r3 * 0.2, ox, oy);
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}
/* How the map's grass fades into the forest floor: fully grass on the map, then over FADE_T tiles past its edge less and
   less, along a wobbly line (smooth noise) so it does not read as a rectangle. Worked out in blocks of 4 px, each kept or
   dropped at random by how far along the fade it is, so the fade is made of pixels like the art (no blur). Cuts the grass canvas (gx) down to the fade, in
   place. */
const FADE_T = 2.5, FB = 4;
function grassFade(gx, x0, y0, w, h, seed) {
  const bw = w * TS / FB, bh = h * TS / FB, per = TS / FB;   /* blocks across, blocks per tile */
  const m = makeCanvas(bw, bh), mx = m && m.getContext('2d');
  if (!mx || !mx.createImageData) return false;
  const img = mx.createImageData(bw, bh), d = img && img.data;
  if (!d) return false;
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {   /* value noise, about one bump per 1.3 tiles, in [-1, 1] */
    const fx = x / 1.3, fy = y / 1.3, ix = Math.floor(fx), iy = Math.floor(fy), ax = smooth(fx - ix), ay = smooth(fy - iy);
    const n = (i, j) => tileHash(seed + 31, i, j);
    const top = n(ix, iy) + (n(ix + 1, iy) - n(ix, iy)) * ax, bot = n(ix, iy + 1) + (n(ix + 1, iy + 1) - n(ix, iy + 1)) * ax;
    return (top + (bot - top) * ay) * 2 - 1;
  };
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const wx = x0 + (bx + 0.5) / per, wy = y0 + (by + 0.5) / per;   /* in tiles */
    const ox = wx < 0 ? -wx : wx > COLS ? wx - COLS : 0, oy = wy < 0 ? -wy : wy > ROWS ? wy - ROWS : 0, dist = Math.hypot(ox, oy);
    if (dist > FADE_T + 1) continue;
    const a = dist <= 0 ? 1 : Math.max(0, Math.min(1, 1 - (dist + noise(wx, wy) * 0.8) / FADE_T));
    if (a > tileHash(seed + 57, bx, by)) d[(by * bw + bx) * 4 + 3] = 255;   /* a random threshold per block: an uneven, grassy edge rather than a pattern */
  }
  mx.putImageData(img, 0, 0);
  gx.globalCompositeOperation = 'destination-in';
  gx.imageSmoothingEnabled = false;
  gx.drawImage(m, 0, 0, bw * FB, bh * FB);
  gx.globalCompositeOperation = 'source-over';
  return true;
}
/* The Pixel Lab terrain (sprites.js terrain()): Wang tiles picked by their corners. The tiles sit on a grid shifted by half
   a tile, so each one's corners are the centres of four map cells, and a corner is grass unless its cell is road: the road
   runs through the middle of its cells, with the grass bank (part of the art) along its edges. The forest floor outside
   the map is the same set, darkened; the map's grass is drawn over it, clipped to the map. The all-grass and all-road
   tiles have variants, picked so the pattern repeats every 4 tiles (the board view repeats its outer 4-tile bands). */
const DECO2 = [[0.07, 'deco2_tree_oak', 1.55], [0.12, 'deco2_tree_pine', 1.7], [0.16, 'deco2_bush', 0.8], [0.19, 'deco2_rock', 0.75], [0.23, 'deco2_flowers', 0.55], [0.25, 'deco2_mushrooms', 0.5]];
function paintTerrain(g, tr) {
  const deco = DECO2.map(d => sprite(d[1]));
  if (deco.some(d => !d)) return null;
  const x0 = -MARGIN.side, y0 = -MARGIN.back, w = COLS + 2 * MARGIN.side, h = ROWS + MARGIN.back + MARGIN.front;
  const c = makeCanvas(w * TS, h * TS);
  if (!c) return null;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  let tx = cx;   /* the canvas tiles are drawn into */
  const tile = (name, dx, dy) => {
    const i = tr.index[name];
    if (i === undefined) return false;
    tx.drawImage(tr.img, (i % tr.columns) * tr.size, Math.floor(i / tr.columns) * tr.size, tr.size, tr.size, dx, dy, TS, TS);
    return true;
  };
  const road = roadCells(g, x0 - 1, x0 + w + 1), on = (x, y) => road.has(x + ',' + y), seed = g.seed || 1;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  /* plain tiles most of the time, a variant (flowers, stones, clover, leaves; on the road a damp patch, ruts, a stone) now and then */
  const VAR = { 15: ['15', '15', '15', '15', '15_1', '15_2', '15_3', '15_4', '15_5', '15_6'], 0: ['0', '0', '0', '0_1', '0_2', '0_3'] };
  /* The forest floor everywhere, then the map's grass on its own canvas, faded out over a few tiles past the map's edge
     (a ragged, dithered edge, see grassFade) and laid over it: no hard border between the field and the land around. */
  const gc = makeCanvas(w * TS, h * TS), gx = gc && gc.getContext('2d');
  for (const pre of gc ? ['f', 'g'] : ['f']) {
    tx = pre === 'g' ? gx : cx;
    if (pre === 'g') gx.imageSmoothingEnabled = false;
    for (let vy = y0; vy <= y0 + h; vy++) for (let vx = x0; vx <= x0 + w; vx++) {
      if (pre === 'g' && (vx < -FADE_T - 1 || vy < -FADE_T - 1 || vx > COLS + FADE_T + 1 || vy > ROWS + FADE_T + 1)) continue;
      const m = (on(vx - 1, vy - 1) ? 0 : 8) + (on(vx, vy - 1) ? 0 : 4) + (on(vx - 1, vy) ? 0 : 2) + (on(vx, vy) ? 0 : 1);
      /* the forest is repeated past the painted land in 4-tile bands, so its picks repeat every 4 tiles; the map's are free */
      const r = pre === 'g' ? tileHash(seed + 7, vx, vy) : tileHash(seed, mod4(vx), mod4(vy));
      const vars = VAR[m], key = vars ? vars[Math.floor(r * vars.length)] : String(m);
      const dx = (vx - x0) * TS - TS / 2, dy = (vy - y0) * TS - TS / 2;
      if (!tile(pre + key, dx, dy)) tile(pre + m, dx, dy);
    }
  }
  if (gc && grassFade(gx, x0, y0, w, h, seed)) cx.drawImage(gc, 0, 0);
  const scenery = placeForest(deco, x0, y0, w, h, on, inMap, seed);
  return { c, g, path: g.path, x0, y0, w, h, scenery };
}
function paintOldBoard(g, sh) {
  if (!sh) return null;
  const deco = DECO.map(d => sprite(d[1]));
  if (deco.some(d => !d)) return null;
  const x0 = -MARGIN.side, y0 = -MARGIN.back, w = COLS + 2 * MARGIN.side, h = ROWS + MARGIN.back + MARGIN.front;
  const c = makeCanvas(w * TS, h * TS), tmp = makeCanvas(TS, TS), mask = makeCanvas(w * TS, h * TS);
  if (!c || !tmp) return null;
  const cx = c.getContext('2d'), tx = tmp.getContext('2d'), mx = mask && mask.getContext('2d');
  cx.imageSmoothingEnabled = false; tx.imageSmoothingEnabled = false;
  const tile = (ctx, name, dx, dy) => {
    const i = sh.index[name];
    if (i === undefined) return;
    ctx.drawImage(sh.img, (i % sh.columns) * sh.size, Math.floor(i / sh.columns) * sh.size, sh.size, sh.size, dx, dy, TS, TS);
  };
  const road = roadCells(g, x0, x0 + w), on = (x, y) => road.has(x + ',' + y), seed = g.seed || 1;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const px = (x - x0) * TS, py = (y - y0) * TS, slice = mod4(y) * 4 + mod4(x), ground = (inMap(x, y) ? 'grass_' : 'forest_') + slice;
    tile(cx, ground, px, py);
    if (!on(x, y)) continue;
    const n = { N: on(x, y - 1), E: on(x + 1, y), S: on(x, y + 1), W: on(x - 1, y) };
    const key = ['N', 'E', 'S', 'W'].filter(k => n[k]).concat(
      [['NE', 'N', 'E', 1, -1], ['SE', 'S', 'E', 1, 1], ['SW', 'S', 'W', -1, 1], ['NW', 'N', 'W', -1, -1]]
        .filter(([, a, b, dx, dy]) => n[a] && n[b] && on(x + dx, y + dy)).map(d => d[0])).join('') || 'none';
    tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, TS, TS);
    tile(tx, 'dirt_' + slice, 0, 0);
    tx.globalCompositeOperation = 'destination-in'; tile(tx, 'pathmask_' + key, 0, 0);
    tx.globalCompositeOperation = 'source-over';
    cx.drawImage(tmp, px, py);
    tile(cx, 'pathedge_' + key, px, py);
    if (mx) tile(mx, 'pathmask_' + key, px, py);
  }
  if (mx) roadBanks(cx, mx, w * TS, h * TS);
  const scenery = placeScenery(g, DECO, deco, x0, y0, w, h, on, inMap, seed);
  return { c, g, path: g.path, x0, y0, w, h, scenery };
}
/* The board for this map: painted once (when the tiles have loaded) and kept until the map changes. */
function boardFor(g) {
  if (board && board.g === g && board.path === g.path) return board;
  const b = paintBoard(g);
  if (b) board = b;
  return b;
}

/* The road lies a little lower than the grass (2.5D): along the road's far edge (where grass is just above the road, in
   the painted board) the grass bank shows as a strip of dark soil, with a soft shadow falling onto the road below it.
   Worked out per pixel from the road's mask, so it follows the painted, ragged edge. */
const BANK = 7, BANK_SHADE = 6;
function roadBanks(cx, mx, W, H) {
  let img, m;
  try { img = cx.getImageData(0, 0, W, H); m = mx.getImageData(0, 0, W, H).data; } catch (e) { return; }
  const d = img.data, road = i => m[i * 4 + 3] > 127;
  for (let x = 0; x < W; x++) {
    let run = 0;   /* road pixels since the last grass pixel above, going down this column */
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (!road(i)) { run = 0; continue; }
      run++;
      if (run === 0 || run > BANK + BANK_SHADE) continue;
      const k = i * 4;
      if (run <= BANK) {               /* the bank: dark soil, a little lighter at its top lip */
        const a = run === 1 ? 0.55 : 0.78;
        d[k] = d[k] * (1 - a) + 58 * a; d[k + 1] = d[k + 1] * (1 - a) + 36 * a; d[k + 2] = d[k + 2] * (1 - a) + 24 * a;
      } else {                           /* its shadow on the road, fading out */
        const a = 0.28 * (1 - (run - BANK) / (BANK_SHADE + 1));
        d[k] *= 1 - a; d[k + 1] *= 1 - a; d[k + 2] *= 1 - a;
      }
    }
  }
  cx.putImageData(img, 0, 0);
}

/* HERO_FOOT: where a hero's feet stand, below its tile's centre (world px). */
const HERO_FOOT = T * 0.3;
/* A soft oval shadow on the ground (drawn inside at(): the tilt makes it flat). */
function groundShadow(ctx, x, y, r) { at(ctx, x, y, () => { ctx.beginPath(); ctx.ellipse?.(x, y, r, r * 0.55, 0, 0, 7); ctx.fill(); }); }
/* A point of the picture (camera.js project) as an array, for lines and outlines drawn straight in the picture. */
const P = (x, y) => project(x, y);
function quad(ctx, x0, y0, x1, y1) {   /* a world rectangle as it looks through the camera (a trapezoid) */
  const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
}

/* The trees, bushes, rocks and flowers around the map stand upright on the ground (with a shadow), each with the
   perspective of where it stands. behind: the ones behind the map's near edge (drawn before the units), else the ones in
   front of it (drawn after them, so a tree in front covers the board edge). Only what is on screen is drawn. */
function drawScenery(ctx, v, b, behind) {
  if (!b || !b.scenery) return;
  const { cam } = v, X0 = -cam.x / cam.z - 60, X1 = (v.cw - cam.x) / cam.z + 60, Y0 = -cam.y / cam.z - 20, Y1 = (v.ch - cam.y) / cam.z + 80;
  for (const d of b.scenery) {
    if ((d.y <= MAP_H) !== behind) continue;
    const [X, Y] = project(d.x, d.y);
    if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue;
    at(ctx, d.x, d.y, () => {
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse?.(d.x + 2, d.y - 1, d.s * (d.big ? 0.32 : 0.36), d.s * 0.16, 0, 0, 7); ctx.fill();
      upright(ctx, d.x, d.y, () => ctx.drawImage(d.img, d.x - d.s / 2, d.y - d.s, d.s, d.s));
    });
  }
}

/* Air between the camera and the far side of the board: the back rows (and the land behind them) fade into a cool haze, so
   the board reads as going away from you. Drawn in the picture, over the ground, under the units. */
function haze(ctx, v) {
  const { cam } = v, X0 = -cam.x / cam.z, X1 = (v.cw - cam.x) / cam.z, top = Math.min(-cam.y / cam.z, P(0, -2 * T)[1]), end = P(0, MAP_H * 0.75)[1];
  const gr = ctx.createLinearGradient?.(0, top, 0, end);
  if (!gr) return;
  gr.addColorStop(0, 'rgba(22,36,62,.62)'); gr.addColorStop(0.45, 'rgba(22,36,62,.2)'); gr.addColorStop(1, 'rgba(22,36,62,0)');
  ctx.fillStyle = gr; ctx.fillRect(X0, top, X1 - X0, end - top);
}

/* The painted board (64 px a tile, flat from above) as seen through the camera, drawn into a screen-sized canvas one row
   of the screen at a time: each row shows one row of the board, narrowed by the perspective. Past the painted land the
   forest carries on (its outermost 4-tile bands repeat sideways, its back and front rows repeat in depth), so the world
   never ends on screen. Redrawn only when the camera or the screen changes. */
const PERIOD = 4 * T;
function boardView(b, v) {
  const { cam, cw, ch } = v, key = [cam.x, cam.y, cam.z, cam.ox, cam.oy, cw, ch].join();
  if (b.view && b.view.key === key) return b.view;
  const W = Math.ceil(cw), H = Math.ceil(ch);
  let c = b.view && b.view.c;
  if (!c || c.width !== W || c.height !== H) c = makeCanvas(W, H);
  if (!c) return null;
  const cx = c.getContext('2d'), src = b.c, k = TS / T, band = PERIOD * k;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, H); cx.imageSmoothingEnabled = false;
  const x0w = b.x0 * T, x1w = (b.x0 + b.w) * T, y0w = b.y0 * T, y1w = (b.y0 + b.h) * T, sx = X => X * cam.z + cam.x;
  for (let j = 0; j < H; j++) {
    const [, y] = unproject(0, (j + 0.5 - cam.y) / cam.z);
    if (y < -1e8) continue;                                   /* above the horizon */
    let yy = y;
    if (yy < y0w) yy = y0w + ((yy - y0w) % PERIOD + PERIOD) % PERIOD;
    else if (yy >= y1w) yy = y1w - PERIOD + ((yy - y1w) % PERIOD + PERIOD) % PERIOD;
    const sy = Math.min(src.height - 1, Math.floor((yy - y0w) * k));
    const L = Math.round(sx(P(x0w, y)[0])), R = Math.round(sx(P(x1w, y)[0])), bw = (R - L) * PERIOD / (x1w - x0w);
    if (bw < 0.5) continue;
    cx.drawImage(src, 0, sy, src.width, 1, L, j, R - L, 1);
    for (let x = L; x > 0; x -= bw) cx.drawImage(src, 0, sy, band, 1, Math.round(x - bw), j, Math.round(x) - Math.round(x - bw), 1);
    for (let x = R; x < W; x += bw) cx.drawImage(src, src.width - band, sy, band, 1, Math.round(x), j, Math.round(x + bw) - Math.round(x), 1);
  }
  b.view = { key, c };
  return b.view;
}

/* The playable map, plus land that carries on past its edges so the world does not stop at a hard line.
   Only the map itself can hold heroes; the land outside is darker, has no grid, and has scenery on it. */
function drawBoard(ctx, g, v) {
  const { cam } = v, end = g.path[g.path.length - 1], b = boardFor(g);
  const X0 = -cam.x / cam.z, Y0 = -cam.y / cam.z, X1 = (v.cw - cam.x) / cam.z, Y1 = (v.ch - cam.y) / cam.z;
  ctx.fillStyle = b ? '#1c3823' : '#243a2b'; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);   /* past the painted margin */
  const view = b && boardView(b, v);
  if (view) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(view.c, X0, Y0, view.c.width / cam.z, view.c.height / cam.z);   /* the screen-sized view, back in the picture */
  } else {
    /* no art yet: the map and the road as plain shapes */
    ctx.fillStyle = '#2d4636'; quad(ctx, 0, 0, MAP_W, MAP_H); ctx.fill();
    ctx.fillStyle = '#9a8a62';
    for (const [cx, cy] of g.path) { quad(ctx, cx * T, cy * T, cx * T + T, cy * T + T); ctx.fill(); }
  }
  /* A grid on the map only while a hero is being placed or moved, so the tiles are easy to aim at: lines toward the far
     side converge, like the board. */
  if (v.placing || v.moving || v.tile) {
    ctx.strokeStyle = b ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) { const a = P(i * T, 0), c = P(i * T, MAP_H); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
    for (let i = 1; i < ROWS; i++) { const a = P(0, i * T), c = P(MAP_W, i * T); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
    ctx.stroke();
  }
  ctx.fillStyle = '#e5645a'; quad(ctx, end[0] * T + T - 6, end[1] * T, end[0] * T + T, end[1] * T + T); ctx.fill();   /* the gate */
  /* The edge of the buildable area, while a hero is being placed or moved (with the grid): a soft shadow outside and a
     light line on it. The rest of the time the field blends into the land around it. */
  if (v.placing || v.moving || v.tile || !b) {
    quad(ctx, 0, 0, MAP_W, MAP_H);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/* Health bars go from green (full) through yellow to red (almost dead). */
const hpColor = f => 'hsl(' + Math.round(Math.max(0, Math.min(1, f)) * 120) + ',72%,50%)';

/* Co-op: each player's colour (their heroes stand on a ring of it; the HUD and lobby use the same colours). */
export const PLAYER_COLORS = ['#4aa3ff', '#ff9a3c', '#7ad85b', '#e06bff'];

/* Everything is drawn into the picture (camera.js): the board and lines straight in it, and each unit, ring and effect in
   world coordinates around its own point with at() (sprites.js), so it gets the perspective of where it stands. */
export function draw(ctx, g, v) {
  const { dpr, cam } = v, m = [dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y];
  setView(cam.ox, cam.oy);                     /* where the camera is over the board (camera.js) */
  ctx.setTransform(...m); setPicture(m);
  ctx.imageSmoothingEnabled = false;           /* sharp pixel art at any zoom */
  drawBoard(ctx, g, v);
  drawScenery(ctx, v, board && board.g === g ? board : null, true);
  haze(ctx, v);
  const h = v.hover, inside = h && h[0] >= 0 && h[1] >= 0 && h[0] < COLS && h[1] < ROWS;
  if (h && !inside) {                    /* outside the map: show that heroes cannot go here */
    const x = h[0] * T, y = h[1] * T;
    ctx.strokeStyle = 'rgba(229,100,90,.7)'; ctx.lineWidth = 2;
    quad(ctx, x + 3, y + 3, x + T - 3, y + T - 3); ctx.stroke();
    const a = P(x + 12, y + 12), b = P(x + T - 12, y + T - 12), c = P(x + T - 12, y + 12), d = P(x + 12, y + T - 12);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }
  const there = inside && g.heroes.find(t => t.cx === h[0] && t.cy === h[1]);
  const swapWith = there && v.moving && there !== v.moving && (there.owner || 0) === (v.moving.owner || 0) ? there : null;
  if (swapWith) {                        /* dropping here swaps the two: the other one shown, faded, where the carried one was */
    ctx.globalAlpha = 0.45; drawHeroStill(ctx, swapWith.def, v.moving.x, v.moving.y); ctx.globalAlpha = 1;
  }
  if (inside && (v.moving || v.placing) && (!g.pathSet.has(h[0] + ',' + h[1]) || swapWith) && !(g.noBuild && g.noBuild.has(h[0] + ',' + h[1])) && (!there || swapWith)) {
    const mv = v.moving, range = mv ? mv.s.range : g.previewRange(v.sel), x = (h[0] + 0.5) * T, y = (h[1] + 0.5) * T;
    at(ctx, x, y, () => { ctx.beginPath(); ctx.arc(x, y, range, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); });
    if (mv) {
      ctx.globalAlpha = 0.5;
      if (!drawHeroStill(ctx, mv.def, x, y)) at(ctx, x, y, () => { ctx.fillStyle = mv.def.color; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
    }
  }
  drawMapEffect(ctx, g);
  for (const t of g.tiles || []) drawTile(ctx, t.cx, t.cy, TILE_EFFECTS[t.effect].color, t.level, 1, t.effect);
  if (v.tile && inside && !g.pathSet.has(h[0] + ',' + h[1]) && !(g.noBuild && g.noBuild.has(h[0] + ',' + h[1]))) drawTile(ctx, h[0], h[1], TILE_EFFECTS[v.tile].color, 1, 0.6, v.tile);   /* where the one being bought would go */
  /* Zones lie on the ground: drawn before heroes and enemies, so puddles never cover them. */
  for (const z of g.zones || []) at(ctx, z.x, z.y, () => { if (!(ZONE_SPRITE[z.type] && ZONE_SPRITE[z.type](ctx, z))) (ZONE_DRAW[z.type] || ZONE_DRAW.storm)(ctx, z); });
  /* Path previews: an echo of the hero runs the form's attack (js/engine/preview.js); its aura, pup, imp, ride and blink are
     drawn like the form's own. */
  const echoes = g.heroes.filter(t => t.echo).map(t => t.echo), withEchoes = echoes.length ? { heroes: g.heroes.concat(echoes), tick: g.tick } : g;
  drawAuras(ctx, withEchoes);
  /* Heroes and enemies stand on the board front to back: whoever is lower on the map (nearer) is drawn over the ones behind. */
  const units = [];
  for (const t of g.heroes) if (!t.def.flying) units.push({ y: t.y, hero: t });
  for (const e of g.enemies) units.push({ y: e.y, enemy: e });
  units.sort((a, b) => a.y - b.y);
  /* every unit's soft shadow on the ground first, so no shadow ever lies over another unit's body */
  ctx.fillStyle = 'rgba(6,14,10,.42)';
  for (const u of units) {
    if (u.hero) groundShadow(ctx, u.hero.x + 3, u.hero.y + HERO_FOOT + 2, 19);
    else { const e = u.enemy, look = ENEMY_ART[e.type], h = enemyHeight(e.type, T); groundShadow(ctx, e.x + 2, e.y + 3, h ? h * (e.type === 'runner' ? 0.36 : 0.3) : look ? look.s * 0.36 : e.def.radius); }
  }
  for (const u of units) {
    if (u.hero) drawHero(ctx, g, v, u.hero);
    else { const e = u.enemy; at(ctx, e.x, e.y, () => upright(ctx, e.x, e.y, () => drawEnemy(ctx, e))); }
  }
  drawScenery(ctx, v, board && board.g === g ? board : null, false);
  for (const t of g.heroes) if (t.wolf && t.def.kind === 'wolf') at(ctx, t.wolf.x, t.wolf.y, () => drawWolf(ctx, t));
  for (const t of g.heroes) if (t.spirits) for (const s of t.spirits) at(ctx, s.x, s.y, () => { ctx.globalAlpha = 0.55; drawWolf(ctx, { wolf: s, rage: 0 }, 0.9); ctx.globalAlpha = 1; });   /* The pack */
  for (const e of echoes) drawEcho(ctx, g, e);
  drawMinions(ctx, withEchoes);
  /* Co-op guests: heroes placed or moved, still on their way to the host, faded where they will stand. */
  for (const p of v.pending || []) {
    const c = p.cmd, d = c.type === 'place' ? HEROES.find(h => h.id === c.hero) : c.type === 'move' ? (g.heroes.find(h => h.id === c.id) || {}).def : null;
    if (!d) continue;
    const x = (c.cx + 0.5) * T, y = (c.cy + 0.5) * T;
    ctx.globalAlpha = 0.5;
    if (!drawHeroStill(ctx, d, x, y)) at(ctx, x, y, () => { ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  const slashArt = sprite('fx_slash'), slash2 = sprite('fx_slash2');
  for (const s of v.vfx.slashes) if (!(s.delay > 0)) at(ctx, s.x, s.y, () => {
    const a = Math.max(0, s.t / s.ttl);
    if (s.h < Math.PI - 0.01 && (slash2 || slashArt)) {   /* a sword arc thrown out toward the target, with the hero's colour along it */
      if (slash2) {   /* fx_slash2 (Pixel Lab VFX): a crescent flung outward, its far end ~75 art px out, so it stops at the reach */
        const k = s.r / 75, F = FX.fx_slash2, f = Math.min(F.n - 1, Math.floor((1 - a) * F.n));
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);   /* lying on the ground like the old arc, so it lines up with the coloured one */
        ctx.drawImage(slash2, f * F.w, 0, F.w, F.h, -F.ax * k, -F.ay * k, F.w * k, F.h * k);
        ctx.restore();
      } else {
        const k = s.r / 50, f = Math.min(2, Math.floor((1 - a) * 3));
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
        ctx.drawImage(slashArt, f * 64, 0, 64, 64, -12 * k, -32 * k, 64 * k, 64 * k);
        ctx.restore();
      }
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = s.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.95, s.a - s.h * 0.8, s.a + s.h * 0.8); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = a * 0.35;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.r, s.a - s.h, s.a + s.h); ctx.closePath();
    ctx.fillStyle = s.c; ctx.fill();
    ctx.globalAlpha = a; ctx.strokeStyle = s.c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.9, s.a - s.h, s.a + s.h); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  /* beams join two points that can be far apart: drawn straight in the picture, as thick as the perspective at their middle */
  for (const b of v.vfx.beams) {
    const a = P(b.x1, b.y1), c = P(b.x2, b.y2);
    a[1] -= (b.l1 || 0) * scaleAt(b.y1); c[1] -= (b.l2 || 0) * scaleAt(b.y2);
    drawBolt(ctx, a, c, b, scaleAt((b.y1 + b.y2) / 2));
  }
  for (const p of g.projs) {
    const pv = projView(p);
    if (!pv) { at(ctx, p.x, p.y, () => PROJ_DRAW[p.type](ctx, p)); continue; }
    at(ctx, pv.x, pv.y, () => { ctx.translate(pv.x - p.x, pv.y - p.y - pv.lift * unsquash()); PROJ_DRAW[p.type](ctx, p); });   /* lifted off the ground */
  }
  for (const t of g.heroes) if (t.def.flying) drawHero(ctx, g, v, t);   /* the Archangel flies over the enemies on the path */
  for (const a of v.vfx.anims || []) at(ctx, a.x, a.y, () => {
    const f = Math.floor(a.t / a.dur * a.frames);
    if (a.k) {   /* fading out over its last 40% */
      ctx.globalAlpha = Math.max(0, Math.min(1, (1 - a.t / a.dur) / 0.4));
      drawFx(ctx, a.name, f, a.x, a.y - a.lift * unsquash(), a.k);
      ctx.globalAlpha = 1;
    }
    else drawSprite(ctx, a.name, a.x, a.y, a.s, 0, f, a.frames);
  });
}

/* The map's effect on the ground: brambles on the tiles that cannot be used, the Ley tiles' glow, the mud on the road, fog. */
function drawMapEffect(ctx, g) {
  const e = MAP_EFFECTS[g.mapEffect];
  if (!e) return;
  ctx.save();
  if (g.mapEffect === 'overgrown') for (const k of g.noBuild) {
    const [cx, cy] = k.split(',').map(Number), x = cx * T, y = cy * T;
    ctx.fillStyle = 'rgba(24,52,24,.5)'; quad(ctx, x + 1, y + 1, x + T - 1, y + T - 1); ctx.fill();
    at(ctx, x + T / 2, y + T / 2, () => { drawSprite(ctx, 'deco2_bush', x + T * 0.5, y + T * 0.36, T * 0.8); });
  }
  if (g.mapEffect === 'ley') for (const [cx, cy] of g.ley) {
    const x = cx * T, y = cy * T, a = 0.3 + 0.15 * Math.sin(g.tick / 25 + cx);
    ctx.fillStyle = e.color; ctx.globalAlpha = a; quad(ctx, x + 2, y + 2, x + T - 2, y + T - 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = e.color; ctx.lineWidth = 2; quad(ctx, x + 5, y + 5, x + T - 5, y + T - 5); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (g.mapEffect === 'mud') { ctx.fillStyle = 'rgba(58,38,18,.38)'; for (const [cx, cy] of g.path) { quad(ctx, cx * T, cy * T, cx * T + T, cy * T + T); ctx.fill(); } }
  if (g.mapEffect === 'fog') { ctx.fillStyle = 'rgba(196,208,216,.2)'; quad(ctx, -MAP_W, -MAP_H, 2 * MAP_W, 2 * MAP_H); ctx.fill(); }
  if (g.mapEffect === 'storm') { ctx.fillStyle = 'rgba(16,24,46,.26)'; quad(ctx, -MAP_W, -MAP_H, 2 * MAP_W, 2 * MAP_H); ctx.fill(); }
  ctx.restore();
}

/* A ground effect: its tile in its colour, with a mark and a dot per level. A Conduit shows the 8 tiles it draws from. */
function drawTile(ctx, cx, cy, color, level, alpha, effect) {
  const x = cx * T, y = cy * T;
  ctx.save(); ctx.globalAlpha = 0.28 * alpha; ctx.fillStyle = color;
  quad(ctx, x + 2, y + 2, x + T - 2, y + T - 2); ctx.fill();
  ctx.globalAlpha = 0.95 * alpha; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  quad(ctx, x + 3, y + 3, x + T - 3, y + T - 3); ctx.stroke();
  if (effect === 'conduit') { ctx.globalAlpha = 0.35 * alpha; ctx.lineWidth = 1.5; quad(ctx, x - T + 3, y - T + 3, x + 2 * T - 3, y + 2 * T - 3); ctx.stroke(); }
  ctx.globalAlpha = alpha;
  at(ctx, x + T / 2, y + T - 7, () => { for (let k = 0; k < TILES.levels; k++) { ctx.beginPath(); ctx.arc(x + T / 2 + (k - 1) * 8, y + T - 7, 2.6, 0, 7); ctx.fillStyle = k < level ? color : 'rgba(0,0,0,.45)'; ctx.fill(); } });
  ctx.restore();
}

/* Which way an enemy faces: the walk art faces left, so it turns right while it walks right (kept while it walks straight
   up or down, or stands still). */
const FACING = new WeakMap();
function enemyFace(e) {
  const m = FACING.get(e) || { x: e.x, f: -1 };
  const dx = e.x - m.x;
  if (dx > 0.05) m.f = 1; else if (dx < -0.05) m.f = -1;
  m.x = e.x; FACING.set(e, m);
  return m.f;
}
/* A summoner its minions keep from harm: a pulsing violet bubble. */
function shieldRing(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = 'rgba(164,91,214,.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(214,160,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
}
/* One enemy, upright around its feet: its sprite (walk animation), health bar and ailment icons, or a plain shape. */
function drawEnemy(ctx, e) {
  /* Walk animation: the frame changes every 9 px along the path, so faster enemies step faster and held ones stand still. */
  /* standing on its point of the path: the sprite's feet (a few px above its bottom edge) at the enemy's position */
  const look = ENEMY_ART[e.type], face = enemyFace(e), anim = drawEnemyArt(ctx, e.type, e.d, e.x, e.y, face, T);
  const art = anim || (look && drawSprite(ctx, frameOf('enemy_' + e.type, (e.d / 9 | 0) % 2 === 1), e.x, e.y - look.s * 0.44, look.s));
  if (art) {
    if (isShielded(e)) shieldRing(ctx, e.x, e.y - enemyHeight(e.type, T) * unsquash() / 2, enemyHeight(e.type, T) * 0.62);   /* its minions protect it */
    const top = anim ? e.y - enemyHeight(e.type, T) * unsquash() + 2 : e.y - look.s * 0.94 + look.s * look.top, f = e.hp / e.max, bw = Math.max(22, e.def.radius * 2.2);
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(e.x - bw / 2 - 1, top - 7, bw + 2, 6);
    ctx.fillStyle = hpColor(f); ctx.fillRect(e.x - bw / 2, top - 6, bw * Math.max(0, f), 4);
    ailmentIcons(ctx, e, e.x - bw / 2, top - 18);
    return;
  }
  ctx.beginPath(); ctx.arc(e.x, e.y, e.def.radius, 0, 7); ctx.fillStyle = tintOf(e) || e.def.color; ctx.fill();
  if (e.def.boss) {                      /* bosses: a gold rim and a crown */
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.stroke();
    const r = e.def.radius, cy = e.y - r * 0.15;
    ctx.beginPath(); ctx.moveTo(e.x - r * 0.55, cy); ctx.lineTo(e.x - r * 0.55, cy - r * 0.5); ctx.lineTo(e.x - r * 0.27, cy - r * 0.25);
    ctx.lineTo(e.x, cy - r * 0.6); ctx.lineTo(e.x + r * 0.27, cy - r * 0.25); ctx.lineTo(e.x + r * 0.55, cy - r * 0.5); ctx.lineTo(e.x + r * 0.55, cy); ctx.closePath();
    ctx.fillStyle = '#ffd84a'; ctx.fill();
  }
  const f = e.hp / e.max, bw = e.def.radius * 2.2, by = e.y - e.def.radius - 7;
  ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
  ctx.fillStyle = hpColor(f); ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, f), 4);
}

/* One hero: range ring when selected, buff rings, its co-op ring, ultimate glow, the Assassin's blink copy, the sprite. */
function drawHero(ctx, g, v, t) { at(ctx, t.x, t.y, () => drawHeroHere(ctx, g, v, t)); }
function drawHeroHere(ctx, g, v, t) {
  const d = t.def, [n, rot] = d.shape, under = v.hoverHero ? v.hoverHero === t : v.hover && v.hover[0] === t.cx && v.hover[1] === t.cy;
  /* just moved: it rests for a second before attacking again, so it pulses, see-through, until it is ready */
  const base = t === v.moving ? 0.4 : t.settle > 0 || t.stun > 0 ? 0.5 + 0.25 * (1 + Math.sin(g.tick / 4)) : 1;
  ctx.globalAlpha = base;
  /* under the pointer: a glow around the figure, like a highlighted unit in WoW (gold; blue when dropping the carried hero
     here would swap the two) */
  const glow = under && t !== v.moving ? (v.moving && (v.moving.owner || 0) === (t.owner || 0) ? 'rgba(120,200,255,' : 'rgba(255,214,90,') : null;
  if (t === v.selected) {
    ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }
  const full = t.energy >= t.s.energyMax;
  /* Timed buffs: a red ring for Frenzy, a soft blue one for Rally, a green one for Nature's grasp. */
  if (t.buffs) t.buffs.forEach((b, i) => {
    ctx.beginPath(); ctx.arc(t.x, t.y, 24 + i * 4, 0, 7);
    ctx.strokeStyle = b.id === 'frenzy' ? 'rgba(229,100,90,.85)' : b.id === 'grasp' ? 'rgba(143,191,90,.8)' : BUFF_COLOR[b.id] || 'rgba(127,179,255,.5)'; ctx.lineWidth = 2.5; ctx.stroke();
  });
  if (g.coop) {                          /* whose hero: a ring in the owner's colour, under its feet */
    ctx.beginPath(); ctx.ellipse?.(t.x, t.y + 15, 17, 6, 0, 0, 7);
    ctx.strokeStyle = PLAYER_COLORS[t.owner || 0]; ctx.lineWidth = 3; ctx.stroke();
  }
  if (t.preview) {                       /* a path: the form's colour as trim under its feet, brighter as the preview grows */
    ctx.beginPath(); ctx.ellipse?.(t.x, t.y + 15, 15, 5, 0, 0, 7);
    ctx.globalAlpha = 0.45 + 0.4 * Math.min(1, (t.level - 1) / 8); ctx.strokeStyle = t.preview.color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.globalAlpha = base;
  }
  if (full) {                            /* ultimate ready: a soft gold glow */
    ctx.beginPath(); ctx.arc(t.x, t.y, 21, 0, 7); ctx.fillStyle = 'rgba(255,216,74,.28)'; ctx.fill();
  }
  if (t.blink) at(ctx, t.blink.x, t.blink.y, () => {   /* Assassin: a faded copy behind the enemy it just struck */
    ctx.globalAlpha = 0.85 * Math.min(1, t.blink.t * 5);
    if (!drawSprite(ctx, heroSprite(d), t.blink.x, t.blink.y + HERO_DY, HERO_S)) {
      if (n) poly(ctx, t.blink.x, t.blink.y, 13, n, rot); else { ctx.beginPath(); ctx.arc(t.blink.x, t.blink.y, 11, 0, 7); }
      ctx.fillStyle = d.color; ctx.fill();
    }
    ctx.globalAlpha = base;
  });
  /* Idle animation: two frames, each hero on its own beat (the game clock, so it pauses with the game). Animated heroes
     (HERO_ANIM) play their idle loop and their attack instead. */
  const anim = heroAnim(d);
  let art = false;
  const figure = () => {
    if (d.mounted) { const r = t.ride; at(ctx, r ? r.x : t.x, r ? r.y : t.y, () => { art = drawMounted(ctx, g, t, HERO_S, HERO_DY); }); }   /* the Crusader: on his horse, wherever he rides */
    else upright(ctx, t.x, t.y + HERO_FOOT, () => {                /* standing on its tile, smaller further back */
      art = anim ? drawAnimated(ctx, g, v, t, anim)
        : drawSprite(ctx, frameOf(heroSprite(d), ((g.tick + t.id * 17) / 30 | 0) % 2 === 1), t.x, t.y + HERO_FOOT - HERO_S * 0.44, HERO_S);
    });
  };
  if (glow) {
    /* the glow: the figure drawn twice with a soft coloured shadow around its outline (a wide faint one, then a tight
       bright one), then once more on top, a little brighter, so only the halo shows around it */
    const k = (v.dpr || 1) * (v.cam ? v.cam.z : 1);
    ctx.save();
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    ctx.shadowColor = glow + '.7)'; ctx.shadowBlur = 18 * k; figure();
    ctx.shadowColor = glow + '1)'; ctx.shadowBlur = 5 * k; figure(); figure();
    ctx.restore();
    if ('filter' in ctx) ctx.filter = 'brightness(1.2)';
  }
  figure();
  if ('filter' in ctx) ctx.filter = 'none';
  if (!art) {
    if (n) poly(ctx, t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
    ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (t.tier && !art) {                  /* evolved: a gold ring (the art shows the evolved form instead) */
    ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, 7); ctx.strokeStyle = '#f2b84b'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (t.stun > 0) upright(ctx, t.x, t.y + HERO_FOOT, () => drawSprite(ctx, 'ail_stun', t.x, t.y + HERO_FOOT - T * (anim ? anim.tiles : 1.2) * unsquash() - 10, 18));   /* stunned by an enemy: the icon over its head */
}

/* An animated hero (sprites.js HERO_ANIM): the attack plays from its last swing (v.swings, set by the swing's effect),
   otherwise the idle loop, each hero on its own beat. It faces its last target: the art faces left, so it is mirrored when
   the target was to the right; the attack is mirrored so its swing goes toward the target. Drawn standing on the tile's lower part, scaled smoothly (the art is finer than the map). */
const FOOT_DY = T * 0.42;
function drawAnimated(ctx, g, v, t, A) {
  const sw = v.swings && v.swings.get(t.id);
  const right = !!sw && Math.cos(sw.ang) > 0;
  let part = A.idle, f = Math.floor((g.tick + t.id * 17) / 60 * A.idle.fps) % A.idle.frames, face = right ? 1 : -1;
  if (sw) {
    if (sw.start < 0 || sw.start > g.tick) sw.start = g.tick;
    const af = attackFrame(A.attack, (g.tick - sw.start) / 60, attackPeriod(t));
    /* the attack art swings toward A.attack.swings ('right' or 'left'): mirrored when the target is on the other side */
    if (af >= 0) { part = A.attack; f = af; face = right === (A.attack.swings === 'right') ? -1 : 1; }
  }
  return drawAnimFrame(ctx, A, part, f, t.x, t.y + HERO_FOOT - FOOT_DY, face);
}
function drawAnimFrame(ctx, A, part, f, x, y, face) {
  const img = sprite(part.name);
  if (!img) return false;
  const k = (T * A.tiles) / A.height;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(x, y + FOOT_DY); ctx.scale(face > 0 ? -k : k, k * unsquash());   /* upright on the tilted board */
  const fr = part.frame || A.frame, ft = part.foot || A.foot;   /* an attack can have a bigger frame (room for the swing) */
  ctx.drawImage(img, f * fr, 0, fr, fr, -ft[0], -ft[1], fr, fr);
  ctx.restore();
  return true;
}
/* A hero standing still on a tile (placing or moving it): the first idle frame of an animated hero, else its sprite. */
function drawHeroStill(ctx, def, x, y) {
  const A = heroAnim(def);
  let ok = false;
  at(ctx, x, y, () => upright(ctx, x, y + HERO_FOOT, () => {
    ok = A ? drawAnimFrame(ctx, A, A.idle, 0, x, y + HERO_FOOT - FOOT_DY, -1) : drawSprite(ctx, heroSprite(def), x, y + HERO_FOOT - HERO_S * 0.44, HERO_S);
  }));
  return ok;
}

/* What a path preview's echo shows of the form: the wolf pup, a ghost rider charging down the path, the Assassin's blink. */
function drawEcho(ctx, g, e) {
  if (e.wolf && e.def.kind === 'wolf') at(ctx, e.wolf.x, e.wolf.y, () => drawWolf(ctx, e, 0.7));
  if (e.ride) at(ctx, e.ride.x, e.ride.y, () => { ctx.globalAlpha = 0.7; drawMounted(ctx, g, e, HERO_S, HERO_DY); ctx.globalAlpha = 1; });
  if (e.blink && e.blink.t > 0) at(ctx, e.blink.x, e.blink.y, () => {
    ctx.globalAlpha = 0.7 * Math.min(1, e.blink.t * 5);
    if (!drawSprite(ctx, heroSprite(e.def), e.blink.x, e.blink.y + HERO_DY, HERO_S)) { ctx.beginPath(); ctx.arc(e.blink.x, e.blink.y, 11, 0, 7); ctx.fillStyle = e.def.color; ctx.fill(); }
    ctx.globalAlpha = 1;
  });
}

/* The Animalic Druid's wolf: facing where it runs, bigger with a red glow while enraged, a little hop when it bites.
   size: 0.7 for a path preview's pup. */
function drawWolf(ctx, t, size = 1) {
  const w = t.wolf, big = t.rage > 0, s = (big ? 1.45 : 1) * 46 * size;
  /* running: legs alternate with the distance covered */
  w.steps = (w.steps || 0) + Math.hypot(w.x - (w.px ?? w.x), w.y - (w.py ?? w.y)); w.px = w.x; w.py = w.y;
  const img = sprite(frameOf('minion_wolf', (w.steps / 8 | 0) % 2 === 1));
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse?.(w.x, w.y + 7, s * 0.3, s * 0.08, 0, 0, 7); ctx.fill();
  if (big) { ctx.beginPath(); ctx.arc(w.x, w.y, s * 0.36, 0, 7); ctx.fillStyle = 'rgba(229,70,60,.22)'; ctx.fill(); }
  const cy = w.y + 7 - 0.16 * s - (w.bite > 0 ? 2 : 0);
  if (!img) { ctx.beginPath(); ctx.arc(w.x, w.y, big ? 9 : 6, 0, 7); ctx.fillStyle = '#8f99a4'; ctx.fill(); return; }
  ctx.save(); ctx.translate(w.x, cy); ctx.scale(w.face || 1, 1); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
}

/* Small icons over an enemy for each ailment it has (bleeding, burning, poisoned, slowed, frozen, shocked, rooted); two slows show one icon. */
const AIL_ICON = { bleed: 'ail_bleed', burn: 'ail_burn', poison: 'ail_poison', chill: 'ail_slow', oiled: 'ail_slow', snared: 'ail_slow', frostbite: 'ail_freeze', wildfire: 'ail_burn', freeze: 'ail_freeze', shock: 'ail_shock', root: 'ail_root', ...KIT_AIL_ICON };
function ailmentIcons(ctx, e, x, y) {
  if (!e.fx) return;
  let i = 0, shown = '';
  for (const id in e.fx) {
    const name = AIL_ICON[id], st = e.fx[id];
    if (!name || !st || shown.includes(name) || (st.stacks ? !st.stacks.length : !(st.t > 0))) continue;
    if (drawSprite(ctx, name, x + 5 + i * 11, y + 5, 10)) { i++; shown += name; }
    if (i >= 4) break;
  }
}
