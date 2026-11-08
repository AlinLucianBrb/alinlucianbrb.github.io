/* Canvas drawing. The world is drawn through the camera; the board is cheap enough to draw every frame, which keeps it sharp at any zoom. */
import { COLS, ROWS, T } from '../content/data.js';
import { tintOf } from '../engine/effects.js';
import { get as sprite, tiles as tileSheet, drawSprite, heroSprite } from './sprites.js';

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
  const type = p.as || (d && d.damageType);
  return type === 'fire' ? 'proj_fireball' : type === 'cold' ? 'proj_ice_shard' : type === 'lightning' ? 'proj_spark' : 'proj_bolt_arcane';
}
const PROJ_DRAW = {
  bolt(ctx, p) {
    const sp = boltSprite(p), big = p.size > 5 ? 1.35 : 1;
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

/* Short-lived visuals, pooled so busy fights don't create garbage. vfx = { beams: [], slashes: [] } belongs to the screen. */
const pool = [];
export function addBeam(vfx, x1, y1, x2, y2, ttl, color, w = 3) {
  const b = pool.pop() || {};
  b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.t = ttl; b.c = color; b.w = w;
  vfx.beams.push(b);
}
export function tickBeams(vfx, dt) {
  const list = vfx.beams; let j = 0;
  for (let i = 0; i < list.length; i++) { const b = list[i]; if ((b.t -= dt) > 0) list[j++] = b; else pool.push(b); }
  list.length = j;
}
const spool = [];
export function addSlash(vfx, x, y, ang, half, r, ttl, color) {
  const s = spool.pop() || {};
  s.x = x; s.y = y; s.a = ang; s.h = half; s.r = r; s.t = s.ttl = ttl; s.c = color;
  vfx.slashes.push(s);
}
export function tickSlashes(vfx, dt) {
  const list = vfx.slashes; let j = 0;
  for (let i = 0; i < list.length; i++) { const s = list[i]; if ((s.t -= dt) > 0) list[j++] = s; else spool.push(s); }
  list.length = j;
}

/* Sprite animations (hit sparks, explosions): { name, x, y, t, dur, frames, s }. */
const apool = [];
export function addAnim(vfx, name, x, y, s, dur, frames) {
  const a = apool.pop() || {};
  a.name = name; a.x = x; a.y = y; a.s = s; a.t = 0; a.dur = dur; a.frames = frames;
  vfx.anims.push(a);
}
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
const MARGIN = 8, TS = 64;
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
  const sh = tileSheet();
  if (!sh) return null;
  const deco = DECO.map(d => sprite(d[1]));
  if (deco.some(d => !d)) return null;
  const x0 = -MARGIN, y0 = -MARGIN, w = COLS + 2 * MARGIN, h = ROWS + 2 * MARGIN;
  const c = makeCanvas(w * TS, h * TS), tmp = makeCanvas(TS, TS);
  if (!c || !tmp) return null;
  const cx = c.getContext('2d'), tx = tmp.getContext('2d');
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
  }
  /* Scenery in the forest around the map (never on the map or the road). */
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (inMap(x, y) || on(x, y) || on(x, y - 1) || on(x, y + 1)) continue;
    const r = tileHash(seed, x, y), d = DECO.findIndex(e => r < e[0]);
    if (d < 0) continue;
    const img = deco[d], s = TS * DECO[d][2], ox = (tileHash(r * 1e9, x, y) - 0.5) * 16, oy = (tileHash(r * 7e8, y, x) - 0.5) * 12;
    cx.drawImage(img, (x - x0) * TS + (TS - s) / 2 + ox, (y - y0) * TS + TS - s + oy, s, s);
  }
  return { c, g, path: g.path, x0, y0, w, h };
}
/* The board for this map: painted once (when the tiles have loaded) and kept until the map changes. */
function boardFor(g) {
  if (board && board.g === g && board.path === g.path) return board;
  const b = paintBoard(g);
  if (b) board = b;
  return b;
}

/* The playable map, plus land that carries on past its edges so the world does not stop at a hard line.
   Only the map itself can hold heroes; the land outside is darker, has no grid, and has scenery on it. */
function drawBoard(ctx, g, v) {
  const b = boardFor(g);
  if (b) {
    const { cam } = v, end = g.path[g.path.length - 1];
    const x0 = Math.floor(-cam.x / cam.z / T) - 1, y0 = Math.floor(-cam.y / cam.z / T) - 1;
    const x1 = Math.ceil((v.cw - cam.x) / cam.z / T) + 1, y1 = Math.ceil((v.ch - cam.y) / cam.z / T) + 1;
    ctx.fillStyle = '#1c3823'; ctx.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);   /* past the painted margin */
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(b.c, b.x0 * T, b.y0 * T, b.w * T, b.h * T);
    /* A faint grid on the map, so heroes are easy to place. */
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, MAP_H); }
    for (let i = 1; i < ROWS; i++) { ctx.moveTo(0, i * T); ctx.lineTo(MAP_W, i * T); }
    ctx.stroke();
    ctx.fillStyle = '#e5645a'; ctx.fillRect(end[0] * T + T - 6, end[1] * T, 6, T);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.strokeRect(-3, -3, MAP_W + 6, MAP_H + 6);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, MAP_W, MAP_H);
    return;
  }
  const { cam } = v, seed = g.seed || 1;
  const x0 = Math.floor(-cam.x / cam.z / T) - 1, y0 = Math.floor(-cam.y / cam.z / T) - 1;
  const x1 = Math.ceil((v.cw - cam.x) / cam.z / T) + 1, y1 = Math.ceil((v.ch - cam.y) / cam.z / T) + 1;
  const start = g.path[0], end = g.path[g.path.length - 1];
  ctx.fillStyle = '#243a2b'; ctx.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
  /* The road comes in from the far left and carries on past the gate. */
  ctx.fillStyle = '#7d7051';
  if (x0 < 0) ctx.fillRect(x0 * T, start[1] * T, -x0 * T, T);
  if (x1 > COLS) ctx.fillRect(COLS * T, end[1] * T, (x1 - COLS) * T, T);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) { x = COLS - 1; continue; }   /* skip the map itself */
    if ((y === start[1] && x < 0) || (y === end[1] && x >= COLS)) continue;   /* keep the road clear */
    scenery(ctx, x, y, tileHash(seed, x, y));
  }
  /* The map. */
  ctx.fillStyle = '#2d4636'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= COLS; i++) { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, MAP_H); }
  for (let i = 0; i <= ROWS; i++) { ctx.moveTo(0, i * T); ctx.lineTo(MAP_W, i * T); }
  ctx.stroke();
  ctx.fillStyle = '#9a8a62';
  for (const [cx, cy] of g.path) ctx.fillRect(cx * T, cy * T, T, T);
  ctx.fillStyle = '#e5645a'; ctx.fillRect(end[0] * T + T - 6, end[1] * T, 6, T);
  /* The edge of the buildable area: a soft shadow outside and a light line on it. */
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.strokeRect(-3, -3, MAP_W + 6, MAP_H + 6);
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, MAP_W, MAP_H);
}

/* Health bars go from green (full) through yellow to red (almost dead). */
const hpColor = f => 'hsl(' + Math.round(Math.max(0, Math.min(1, f)) * 120) + ',72%,50%)';

export function draw(ctx, g, v) {
  const { dpr, cam } = v;
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  ctx.imageSmoothingEnabled = false;           /* sharp pixel art at any zoom */
  drawBoard(ctx, g, v);
  const h = v.hover, inside = h && h[0] >= 0 && h[1] >= 0 && h[0] < COLS && h[1] < ROWS;
  if (h && !inside) {                    /* outside the map: show that heroes cannot go here */
    ctx.strokeStyle = 'rgba(229,100,90,.7)'; ctx.lineWidth = 2;
    ctx.strokeRect(h[0] * T + 3, h[1] * T + 3, T - 6, T - 6);
    ctx.beginPath(); ctx.moveTo(h[0] * T + 12, h[1] * T + 12); ctx.lineTo(h[0] * T + T - 12, h[1] * T + T - 12);
    ctx.moveTo(h[0] * T + T - 12, h[1] * T + 12); ctx.lineTo(h[0] * T + 12, h[1] * T + T - 12); ctx.stroke();
  }
  if (inside && (v.moving || v.placing) && !g.pathSet.has(h[0] + ',' + h[1]) && !g.heroes.some(t => t.cx === h[0] && t.cy === h[1])) {
    const mv = v.moving, range = mv ? mv.s.range : g.previewRange(v.sel);
    ctx.beginPath(); ctx.arc((h[0] + 0.5) * T, (h[1] + 0.5) * T, range, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    if (mv) {
      ctx.globalAlpha = 0.5;
      if (!drawSprite(ctx, heroSprite(mv.def), (h[0] + 0.5) * T, (h[1] + 0.5) * T + HERO_DY, HERO_S)) {
        ctx.fillStyle = mv.def.color; ctx.beginPath(); ctx.arc((h[0] + 0.5) * T, (h[1] + 0.5) * T, 13, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  /* Zones lie on the ground: drawn before heroes and enemies, so puddles never cover them. */
  for (const z of g.zones || []) if (!(ZONE_SPRITE[z.type] && ZONE_SPRITE[z.type](ctx, z))) (ZONE_DRAW[z.type] || ZONE_DRAW.storm)(ctx, z);
  for (const t of g.heroes) {
    const d = t.def, [n, rot] = d.shape;
    if (t === v.moving) ctx.globalAlpha = 0.4;
    if (t === v.selected) {
      ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, 7);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    const full = t.energy >= t.s.energyMax;
    /* Timed buffs: a red ring for Frenzy, a soft blue one for Rally, a green one for Nature's grasp. */
    if (t.buffs) t.buffs.forEach((b, i) => {
      ctx.beginPath(); ctx.arc(t.x, t.y, 24 + i * 4, 0, 7);
      ctx.strokeStyle = b.id === 'frenzy' ? 'rgba(229,100,90,.85)' : b.id === 'grasp' ? 'rgba(143,191,90,.8)' : 'rgba(127,179,255,.5)'; ctx.lineWidth = 2.5; ctx.stroke();
    });
    if (full) {                            /* ultimate ready: a soft gold glow */
      ctx.beginPath(); ctx.arc(t.x, t.y, 21, 0, 7); ctx.fillStyle = 'rgba(255,216,74,.28)'; ctx.fill();
    }
    if (t.blink) {                         /* Assassin: a faded copy behind the enemy it just struck */
      ctx.globalAlpha = 0.85 * Math.min(1, t.blink.t * 5);
      if (!drawSprite(ctx, heroSprite(d), t.blink.x, t.blink.y + HERO_DY, HERO_S)) {
        if (n) poly(ctx, t.blink.x, t.blink.y, 13, n, rot); else { ctx.beginPath(); ctx.arc(t.blink.x, t.blink.y, 11, 0, 7); }
        ctx.fillStyle = d.color; ctx.fill();
      }
      ctx.globalAlpha = t === v.moving ? 0.4 : 1;
    }
    const art = drawSprite(ctx, heroSprite(d), t.x, t.y + HERO_DY, HERO_S);
    if (!art) {
      if (n) poly(ctx, t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
      ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (t.tier && !art) {                  /* evolved: a gold ring (the art shows the evolved form instead) */
      ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, 7); ctx.strokeStyle = '#f2b84b'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (const t of g.heroes) if (t.wolf && t.def.kind === 'wolf') drawWolf(ctx, t);
  const slashArt = sprite('fx_slash');
  for (const s of v.vfx.slashes) {
    const a = Math.max(0, s.t / s.ttl);
    if (slashArt && s.h < Math.PI - 0.01) {    /* a sword arc, from the sheet: 3 frames, the arc 50 px from its centre */
      const k = s.r / 50, f = Math.min(2, Math.floor((1 - a) * 3));
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
      ctx.drawImage(slashArt, f * 64, 0, 64, 64, -12 * k, -32 * k, 64 * k, 64 * k);
      ctx.restore();
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = s.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.95, s.a - s.h * 0.8, s.a + s.h * 0.8); ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a * 0.35;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.r, s.a - s.h, s.a + s.h); ctx.closePath();
    ctx.fillStyle = s.c; ctx.fill();
    ctx.globalAlpha = a; ctx.strokeStyle = s.c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.9, s.a - s.h, s.a + s.h); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const b of v.vfx.beams) { ctx.strokeStyle = b.c; ctx.lineWidth = b.w; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }
  for (const p of g.projs) PROJ_DRAW[p.type](ctx, p);
  for (const e of g.enemies) {
    const look = ENEMY_ART[e.type], art = look && drawSprite(ctx, 'enemy_' + e.type, e.x, e.y - look.s * 0.2, look.s);
    if (art) {
      const top = e.y - look.s * 0.7 + look.s * look.top, f = e.hp / e.max, bw = Math.max(22, e.def.radius * 2.2);
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(e.x - bw / 2 - 1, top - 7, bw + 2, 6);
      ctx.fillStyle = hpColor(f); ctx.fillRect(e.x - bw / 2, top - 6, bw * Math.max(0, f), 4);
      ailmentIcons(ctx, e, e.x - bw / 2, top - 18);
      continue;
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
  for (const a of v.vfx.anims || []) drawSprite(ctx, a.name, a.x, a.y, a.s, 0, Math.floor(a.t / a.dur * a.frames), a.frames);
}

/* The Animalic Druid's wolf: facing where it runs, bigger with a red glow while enraged, a little hop when it bites. */
function drawWolf(ctx, t) {
  const w = t.wolf, big = t.rage > 0, s = (big ? 1.45 : 1) * 46, img = sprite('minion_wolf');
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse?.(w.x, w.y + 7, s * 0.3, s * 0.08, 0, 0, 7); ctx.fill();
  if (big) { ctx.beginPath(); ctx.arc(w.x, w.y, s * 0.36, 0, 7); ctx.fillStyle = 'rgba(229,70,60,.22)'; ctx.fill(); }
  const cy = w.y + 7 - 0.16 * s - (w.bite > 0 ? 2 : 0);
  if (!img) { ctx.beginPath(); ctx.arc(w.x, w.y, big ? 9 : 6, 0, 7); ctx.fillStyle = '#8f99a4'; ctx.fill(); return; }
  ctx.save(); ctx.translate(w.x, cy); ctx.scale(w.face || 1, 1); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
}

/* Small icons over an enemy for each ailment it has (bleeding, burning, poisoned, slowed, frozen, shocked, rooted); two slows show one icon. */
const AIL_ICON = { bleed: 'ail_bleed', burn: 'ail_burn', poison: 'ail_poison', chill: 'ail_slow', oiled: 'ail_slow', freeze: 'ail_freeze', shock: 'ail_shock', root: 'ail_root' };
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
