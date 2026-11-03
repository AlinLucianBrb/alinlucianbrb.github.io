/* Canvas drawing. The world is drawn through the camera; the board is cheap enough to draw every frame, which keeps it sharp at any zoom. */
import { COLS, ROWS, T } from '../content/data.js';
import { tintOf } from '../engine/effects.js';

const MAP_W = COLS * T, MAP_H = ROWS * T;

/* How each projectile type looks (the engine only simulates them). */
const PROJ_DRAW = {
  boomerang(ctx, p) {
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

/* The playable map, plus land that carries on past its edges so the world does not stop at a hard line.
   Only the map itself can hold heroes; the land outside is darker, has no grid, and has scenery on it. */
function drawBoard(ctx, g, v) {
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
    if (mv) { ctx.globalAlpha = 0.5; ctx.fillStyle = mv.def.color; ctx.beginPath(); ctx.arc((h[0] + 0.5) * T, (h[1] + 0.5) * T, 13, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  for (const t of g.heroes) {
    const d = t.def, [n, rot] = d.shape;
    if (t === v.moving) ctx.globalAlpha = 0.4;
    if (t === v.selected) {
      ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, 7);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    const full = t.energy >= t.s.energyMax;
    if (full) {                            /* ultimate ready: a soft gold glow */
      ctx.beginPath(); ctx.arc(t.x, t.y, 21, 0, 7); ctx.fillStyle = 'rgba(255,216,74,.28)'; ctx.fill();
    }
    if (n) poly(ctx, t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
    ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
    if (t.tier) {                          /* evolved: a gold ring */
      ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, 7); ctx.strokeStyle = '#f2b84b'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    /* Level badge, top right of the hero. */
    ctx.beginPath(); ctx.arc(t.x + 13, t.y - 13, 7, 0, 7); ctx.fillStyle = '#10200f'; ctx.fill();
    ctx.strokeStyle = t.level >= 10 ? '#f2b84b' : '#8fd3ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.level), t.x + 13, t.y - 12.5);
    /* Energy bar under the hero: blue while filling, gold when the ultimate is ready. */
    const f = Math.max(0, Math.min(1, t.energy / t.s.energyMax));
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(t.x - 15, t.y + 19, 30, 5);
    ctx.fillStyle = full ? '#ffd84a' : '#5aa9ff'; ctx.fillRect(t.x - 14, t.y + 20, 28 * f, 3);
    ctx.globalAlpha = 1;
  }
  for (const s of v.vfx.slashes) {
    const a = Math.max(0, s.t / s.ttl);
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
    ctx.beginPath(); ctx.arc(e.x, e.y, e.def.radius, 0, 7); ctx.fillStyle = tintOf(e) || e.def.color; ctx.fill();
    const f = e.hp / e.max, bw = e.def.radius * 2.2, by = e.y - e.def.radius - 7;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = hpColor(f); ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, f), 4);
  }
}
