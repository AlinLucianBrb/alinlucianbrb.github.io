import { COLS, ROWS, T } from '../content/data.js';
/* How each projectile type is drawn (the engine only simulates them). */
const PROJ_DRAW = {
  boomerang(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.strokeStyle = '#8be28b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(0, 0); ctx.lineTo(9, -9); ctx.stroke();
    ctx.restore();
  }
};
import { tintOf } from '../engine/effects.js';

/* The grid, path and gate never change during a run, so they are drawn once into an offscreen canvas. */
export function buildBackground(g, scale = 1) {
  const c = document.createElement('canvas'); c.width = Math.round(COLS * T * scale); c.height = Math.round(ROWS * T * scale);
  const x = c.getContext('2d'); x.scale(scale, scale);
  x.fillStyle = '#2d4636'; x.fillRect(0, 0, COLS * T, ROWS * T);
  x.strokeStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i <= COLS; i++) { x.beginPath(); x.moveTo(i * T, 0); x.lineTo(i * T, ROWS * T); x.stroke(); }
  for (let i = 0; i <= ROWS; i++) { x.beginPath(); x.moveTo(0, i * T); x.lineTo(COLS * T, i * T); x.stroke(); }
  x.fillStyle = '#9a8a62';
  g.path.forEach(([cx, cy]) => x.fillRect(cx * T, cy * T, T, T));
  const end = g.path[g.path.length - 1];
  x.fillStyle = '#e5645a'; x.fillRect(end[0] * T + T - 6, end[1] * T, 6, T);
  return c;
}

/* Short-lived beam visuals, pooled so busy fights don't create garbage. */
const pool = [];
/* vfx = { beams: [], slashes: [] } belongs to the screen, not to the simulation. */
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

export function draw(ctx, g, view) {
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.drawImage(view.bg, 0, 0, COLS * T, ROWS * T);
  const h = view.hover;
  if (h && !g.pathSet.has(h[0] + ',' + h[1]) && !g.heroes.some(t => t.cx === h[0] && t.cy === h[1])) {
    const mv = view.moving, range = mv ? mv.s.range : g.previewRange(view.sel);
    ctx.beginPath(); ctx.arc((h[0] + 0.5) * T, (h[1] + 0.5) * T, range, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    if (mv) { ctx.globalAlpha = 0.5; ctx.fillStyle = mv.def.color; ctx.beginPath(); ctx.arc((h[0] + 0.5) * T, (h[1] + 0.5) * T, 13, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  for (const t of g.heroes) {
    const d = t.def, [n, rot] = d.shape;
    if (t === view.moving) { ctx.globalAlpha = 0.4; }
    if (t === view.selected) {
      ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, 7);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (n) poly(ctx, t.x, t.y, 15, n, rot); else { ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, 7); }
    ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const s of view.vfx.slashes) {
    ctx.globalAlpha = Math.max(0, s.t / s.ttl);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.r, s.a - s.h, s.a + s.h); ctx.closePath();
    ctx.fillStyle = s.c; ctx.globalAlpha *= 0.35; ctx.fill();
    ctx.globalAlpha = Math.max(0, s.t / s.ttl); ctx.strokeStyle = s.c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.9, s.a - s.h, s.a + s.h); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const b of view.vfx.beams) { ctx.strokeStyle = b.c; ctx.lineWidth = b.w; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }
  for (const p of g.projs) PROJ_DRAW[p.type](ctx, p);
  for (const e of g.enemies) {
    ctx.beginPath(); ctx.arc(e.x, e.y, e.def.radius, 0, 7); ctx.fillStyle = tintOf(e) || e.def.color; ctx.fill();
    const bw = e.def.radius * 2.2, by = e.y - e.def.radius - 7;
    ctx.fillStyle = '#000'; ctx.fillRect(e.x - bw / 2, by, bw, 4);
    ctx.fillStyle = '#6fdc7a'; ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.max), 4);
  }
}
