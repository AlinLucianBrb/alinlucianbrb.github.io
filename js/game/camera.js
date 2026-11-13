/* The camera decides where the map sits on screen: an offset (x, y) in screen pixels and a zoom z.
   The board is seen from a tilted camera (2.5D): depth (world y) is squashed by TILT, so the ground looks laid out in
   front of you while characters stand upright on it (render.js draws them unsquashed, see sprites.js upright()).
   screen x = world x * z + x, screen y = world y * z * TILT + y. It knows nothing about the page; game.js feeds it sizes
   and input. FIT_CLOSER: the camera starts a little closer than "the whole map fits", so heroes read bigger. */
export const TILT = 0.72, FIT_CLOSER = 1.08;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const createCamera = () => ({ x: 0, y: 0, z: 1, fitZ: 1, touched: false });

/* Fits the map inside a rectangle of the screen (the part not covered by the HUD). */
export function fitCamera(cam, rect, mapW, mapH) {
  const z = Math.max(0.05, Math.min(rect.w / mapW, rect.h / (mapH * TILT)) * FIT_CLOSER);
  cam.z = cam.fitZ = z;
  cam.x = rect.x + (rect.w - mapW * z) / 2;
  cam.y = rect.y + (rect.h - mapH * z * TILT) / 2;
  cam.touched = false;
}

/* Keeps at least a quarter of the map on screen, so it can never be lost. */
export function clampCamera(cam, viewW, viewH, mapW, mapH) {
  const w = mapW * cam.z, h = mapH * cam.z * TILT;
  cam.x = clamp(cam.x, -0.75 * w, viewW - 0.25 * w);
  cam.y = clamp(cam.y, -0.75 * h, viewH - 0.25 * h);
}

export const zoomLimits = cam => [cam.fitZ * 0.5, Math.max(cam.fitZ * 3, 2)];

/* Zooms by a factor while keeping the point under (px, py) in place. */
export function zoomAt(cam, px, py, factor) {
  const [lo, hi] = zoomLimits(cam), z2 = clamp(cam.z * factor, lo, hi), k = z2 / cam.z;
  cam.x = px - (px - cam.x) * k; cam.y = py - (py - cam.y) * k; cam.z = z2; cam.touched = true;   /* works for the tilted y too */
}
export function panBy(cam, dx, dy) { cam.x += dx; cam.y += dy; cam.touched = true; }

export const toWorld = (cam, px, py) => [(px - cam.x) / cam.z, (py - cam.y) / (cam.z * TILT)];
export const toScreen = (cam, wx, wy) => [cam.x + wx * cam.z, cam.y + wy * cam.z * TILT];
