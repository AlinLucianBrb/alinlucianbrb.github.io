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

function drawBoard(ctx, g) {
  ctx.fillStyle = '#2d4636'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= COLS; i++) { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, MAP_H); }
  for (let i = 0; i <= ROWS; i++) { ctx.moveTo(0, i * T); ctx.lineTo(MAP_W, i * T); }
  ctx.stroke();
  ctx.fillStyle = '#9a8a62';
  for (const [cx, cy] of g.path) ctx.fillRect(cx * T, cy * T, T, T);
  const end = g.path[g.path.length - 1];
  ctx.fillStyle = '#e5645a'; ctx.fillRect(end[0] * T + T - 6, end[1] * T, 6, T);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, MAP_W, MAP_H);
}

/* Health bars go from green (full) through yellow to red (almost dead). */
const hpColor = f => 'hsl(' + Math.round(Math.max(0, Math.min(1, f)) * 120) + ',72%,50%)';

export function draw(ctx, g, v) {
  const { dpr, cam } = v;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#121a16'; ctx.fillRect(0, 0, v.cw, v.ch);
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
  drawBoard(ctx, g);
  const h = v.hover;
  if (h && h[0] >= 0 && h[1] >= 0 && h[0] < COLS && h[1] < ROWS && !g.pathSet.has(h[0] + ',' + h[1]) && !g.heroes.some(t => t.cx === h[0] && t.cy === h[1])) {
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
    if (n) poly(ctx, t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
    ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
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
