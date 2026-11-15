/* The camera decides where the map sits on screen. The board is seen through a perspective camera (2.5D, Arknights
   style): the map's far side (world y = 0) is further away, so it is drawn smaller and narrower than the near side, and
   depth is squashed (the ground is seen at an angle) while characters stand upright on it.

   Two steps: project(x, y) turns a world point into the "picture" (the view through the camera, before zoom), then the
   camera places the picture on screen with an offset (x, y) in screen pixels and a zoom z:
     picture:  s = 1 / (1 + PERSP_B * (MAP_H - y))       how big things are at depth y (1 on the near edge, FAR at the back)
               X = CX + (x - CX) * s                      lines toward the far side converge on the centre
               Y = C + (TILT / PERSP_B) * s               a true pinhole camera: straight lines stay straight
     screen:   X * z + cam.x, Y * z + cam.y
   On the near edge one world pixel across is one picture pixel and one world pixel deep is TILT picture pixels. It knows
   nothing about the page; game.js feeds it sizes and input. FIT_CLOSER: the camera starts a little closer than "the whole
   map fits", so heroes read bigger. */
import { COLS, ROWS, T } from '../content/data.js';

export const TILT = 0.62, FAR = 0.72, FIT_CLOSER = 1.12;
const MAP_W = COLS * T, MAP_H = ROWS * T, CX = MAP_W / 2;
const PERSP_B = (1 / FAR - 1) / MAP_H, C = TILT * MAP_H - TILT / PERSP_B;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* How big things are drawn at world depth y (1 on the map's near edge, FAR on its far edge). */
export const scaleAt = y => 1 / (1 + PERSP_B * (MAP_H - y));
export const project = (x, y) => { const s = scaleAt(y); return [CX + (x - CX) * s, C + (TILT / PERSP_B) * s]; };
export function unproject(X, Y) {
  const s = (Y - C) * PERSP_B / TILT;
  if (s <= 0) return [CX, -1e9];   /* above the horizon: infinitely far */
  return [CX + (X - CX) / s, MAP_H - (1 / s - 1) / PERSP_B];
}
/* The map's outline in the picture: its far side is narrower than its near side. */
export function mapBounds() {
  const [, top] = project(0, 0), [, bottom] = project(0, MAP_H);
  return { x0: 0, x1: MAP_W, y0: top, y1: bottom };
}

export const createCamera = () => ({ x: 0, y: 0, z: 1, fitZ: 1, touched: false });

/* Fits the map inside a rectangle of the screen (the part not covered by the HUD). */
export function fitCamera(cam, rect) {
  const b = mapBounds(), w = b.x1 - b.x0, h = b.y1 - b.y0;
  const z = Math.max(0.05, Math.min(rect.w / w, rect.h / h) * FIT_CLOSER);
  cam.z = cam.fitZ = z;
  cam.x = rect.x + (rect.w - w * z) / 2 - b.x0 * z;
  cam.y = rect.y + (rect.h - h * z) / 2 - b.y0 * z;
  cam.touched = false;
}

/* Keeps at least a quarter of the map on screen, so it can never be lost. */
export function clampCamera(cam, viewW, viewH) {
  const b = mapBounds(), w = (b.x1 - b.x0) * cam.z, h = (b.y1 - b.y0) * cam.z;
  cam.x = clamp(cam.x + b.x0 * cam.z, -0.75 * w, viewW - 0.25 * w) - b.x0 * cam.z;
  cam.y = clamp(cam.y + b.y0 * cam.z, -0.75 * h, viewH - 0.25 * h) - b.y0 * cam.z;
}

export const zoomLimits = cam => [cam.fitZ * 0.5, Math.max(cam.fitZ * 3, 2)];

/* Zooms by a factor while keeping the point under (px, py) in place. */
export function zoomAt(cam, px, py, factor) {
  const [lo, hi] = zoomLimits(cam), z2 = clamp(cam.z * factor, lo, hi), k = z2 / cam.z;
  cam.x = px - (px - cam.x) * k; cam.y = py - (py - cam.y) * k; cam.z = z2; cam.touched = true;
}
export function panBy(cam, dx, dy) { cam.x += dx; cam.y += dy; cam.touched = true; }

export const toWorld = (cam, px, py) => unproject((px - cam.x) / cam.z, (py - cam.y) / cam.z);
export const toScreen = (cam, wx, wy) => { const [X, Y] = project(wx, wy); return [cam.x + X * cam.z, cam.y + Y * cam.z]; };
