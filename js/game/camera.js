/* The camera decides where the map sits on screen. The board is seen through a perspective camera (2.5D, Arknights
   style): the map's far side (world y = 0) is further away, so it is drawn smaller and narrower than the near side, and
   depth is squashed (the ground is seen at an angle) while characters stand upright on it.

   Two steps: project(x, y) turns a world point into the "picture" (the view through the camera, before zoom), then the
   camera places the picture on screen with an offset (x, y) in screen pixels and a zoom z:
     picture:  s = 1 / (1 + PERSP_B * (MAP_H - y))       how big things are at depth y (1 on the near edge, FAR at the back)
               X = CX + (x - CX) * s                      lines toward the far side converge on the centre
               Y = C + (TILT / PERSP_B) * s               a true pinhole camera: straight lines stay straight
     screen:   X * z + cam.x, Y * z + cam.y
   On the near edge one world pixel across is one picture pixel and one world pixel deep is TILT picture pixels.
   Moving the camera (dragging the map, the arrow keys) does not slide the picture: the camera travels over the board at
   the same height, by (OX, OY) world px from where it starts (cam.ox, cam.oy; see setView). Going forward brings the far
   side closer and bigger, going sideways shifts what is straight ahead, as with a real camera. It knows
   nothing about the page; game.js feeds it sizes and input. FIT_CLOSER: the camera starts a little closer than "the whole
   map fits", so heroes read bigger. */
import { COLS, ROWS, T } from '../content/data.js';

export const TILT = 0.62, FAR = 0.72, FIT_CLOSER = 1.12;
const MAP_W = COLS * T, MAP_H = ROWS * T, CX = MAP_W / 2;
const PERSP_B = (1 / FAR - 1) / MAP_H, C = TILT * MAP_H - TILT / PERSP_B;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Where the camera is over the board: OX across, OY in depth (negative: further in), in world px. The camera in use sets
   it (setView) before anything is projected; toWorld and toScreen set it from the camera they are given. */
let OX = 0, OY = 0;
export const setView = (ox = 0, oy = 0) => { OX = ox; OY = oy; };
export const viewOf = () => [OX, OY];
/* How big things are drawn at world depth y (1 on the map's near edge, FAR on its far edge, with the camera at the start). */
export const scaleAt = y => 1 / Math.max(0.05, 1 + PERSP_B * (MAP_H + OY - y));
export const project = (x, y) => { const s = scaleAt(y); return [CX + (x - CX - OX) * s, C + (TILT / PERSP_B) * s]; };
export function unproject(X, Y) {
  const s = (Y - C) * PERSP_B / TILT;
  if (s <= 0) return [CX + OX, -1e9];   /* above the horizon: infinitely far */
  return [CX + OX + (X - CX) / s, MAP_H + OY - (1 / s - 1) / PERSP_B];
}
/* The map's outline in the picture, with the camera at its start: its far side is narrower than its near side. */
export function mapBounds() {
  const [ox, oy] = viewOf(); setView(0, 0);
  const [, top] = project(0, 0), [, bottom] = project(0, MAP_H);
  setView(ox, oy);
  return { x0: 0, x1: MAP_W, y0: top, y1: bottom };
}
/* How far the camera may travel from its start (world px): enough to look at every corner up close, never off the board. */
const TRAVEL = { x: MAP_W * 0.5, back: MAP_H * 0.35, forward: MAP_H * 0.7 };

export const createCamera = () => ({ x: 0, y: 0, z: 1, fitZ: 1, ox: 0, oy: 0, ax: 0, ay: 0, touched: false });

/* The picture is pinned to the screen at one point, the anchor (ax, ay): where the middle of the map's near edge appears
   when the map is fitted. Zooming and moving never shift it, so the horizon and the angle the camera looks at the board
   from never change; only the camera's travel over the board (ox, oy) and the zoom do. */
const NEAR_Y = TILT * MAP_H;   /* the picture's y of the map's near edge with the camera at its start */
function pin(cam) { cam.x = cam.ax - CX * cam.z; cam.y = cam.ay - NEAR_Y * cam.z; }

/* Fits the map inside a rectangle of the screen (the part not covered by the HUD) and pins the picture there. keep: only
   re-pin (the window changed size), keeping the zoom and where the camera is. */
export function fitCamera(cam, rect, keep = false) {
  const b = mapBounds(), w = b.x1 - b.x0, h = b.y1 - b.y0;
  const z = Math.max(0.05, Math.min(rect.w / w, rect.h / h) * FIT_CLOSER);
  cam.fitZ = z;
  cam.ax = rect.x + (rect.w - w * z) / 2 + (CX - b.x0) * z;
  cam.ay = rect.y + (rect.h - h * z) / 2 + (NEAR_Y - b.y0) * z;
  if (!keep) { cam.z = z; cam.ox = cam.oy = 0; cam.touched = false; }
  pin(cam);
}

/* Keeps the camera over the board (it can look at every corner up close, never wander off it). */
export function clampCamera(cam) {
  cam.ox = clamp(cam.ox || 0, -TRAVEL.x, TRAVEL.x); cam.oy = clamp(cam.oy || 0, -TRAVEL.forward, TRAVEL.back);
  pin(cam);
}

export const zoomLimits = cam => [cam.fitZ * 0.5, Math.max(cam.fitZ * 3, 2)];

/* Zooms by a factor around the point under (px, py): the picture stays pinned, and the camera travels so the same spot of
   the ground stays under the pointer (as far as the camera may travel). */
export function zoomAt(cam, px, py, factor) {
  const [lo, hi] = zoomLimits(cam), z2 = clamp(cam.z * factor, lo, hi);
  const [wx, wy] = toWorld(cam, px, py);
  cam.z = z2; pin(cam); cam.touched = true;
  if (wy < -1e8) return;                                     /* the sky: nothing to keep under the pointer */
  const X = (px - cam.x) / z2, Y = (py - cam.y) / z2, s = (Y - C) * PERSP_B / TILT;
  if (s <= 0) return;
  cam.ox = wx - CX - (X - CX) / s;
  cam.oy = wy - MAP_H + (1 / s - 1) / PERSP_B;
  clampCamera(cam);
}
/* Moves the camera over the board by a drag of (dx, dy) screen px: the ground under the pointer follows it (exactly on the
   near edge, close to it elsewhere); the picture stays at the same height on screen. */
export function panBy(cam, dx, dy) {
  cam.ox = (cam.ox || 0) - dx / cam.z; cam.oy = (cam.oy || 0) - dy / (cam.z * TILT); cam.touched = true;
}

export const toWorld = (cam, px, py) => { setView(cam.ox, cam.oy); return unproject((px - cam.x) / cam.z, (py - cam.y) / cam.z); };
export const toScreen = (cam, wx, wy) => { setView(cam.ox, cam.oy); const [X, Y] = project(wx, wy); return [cam.x + X * cam.z, cam.y + Y * cam.z]; };
