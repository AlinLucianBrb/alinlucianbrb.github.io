/* The perspective camera (js/game/camera.js): zooming and moving never change the angle the board is seen from. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, fitCamera, zoomAt, panBy, clampCamera, toWorld, toScreen, project } from '../js/game/camera.js';
import { T, COLS, ROWS } from '../js/content/data.js';

const fitted = () => { const cam = createCamera(); fitCamera(cam, { x: 0, y: 0, w: 1200, h: 700 }); return cam; };
/* Where the horizon sits on screen, and the far edge's width relative to the near edge's: the camera's angle. */
const angle = cam => {
  const [, nearY] = toScreen(cam, COLS * T / 2, ROWS * T), [, farY] = toScreen(cam, COLS * T / 2, 0);
  const near = toScreen(cam, COLS * T, ROWS * T)[0] - toScreen(cam, 0, ROWS * T)[0], far = toScreen(cam, COLS * T, 0)[0] - toScreen(cam, 0, 0)[0];
  return { horizon: toScreen(cam, COLS * T / 2, -1e13)[1], ratio: far / near, depth: (nearY - farY) / near };
};

test('where on the screen you zoom never changes the angle: the horizon ends up in the same place wherever the pointer is', () => {
  const ref = fitted(); zoomAt(ref, 600, 350, 1.6);
  const h = angle(ref).horizon, a0 = angle(fitted());
  for (const [px, py] of [[100, 100], [1100, 650], [600, 50], [300, 600]]) {
    const cam = fitted();
    zoomAt(cam, px, py, 1.6);
    assert.ok(Math.abs(angle(cam).horizon - h) < 1e-6, 'the same horizon (zoom at ' + px + ',' + py + ')');
    assert.ok(Math.abs(angle(cam).ratio - a0.ratio) < 0.15, 'the far side keeps about the same size against the near side');
    zoomAt(cam, px, py, 1 / 1.6);
    assert.ok(Math.abs(angle(cam).horizon - a0.horizon) < 1e-6, 'zooming back out returns to the same view');
  }
});

test('the ground under the pointer stays under it while zooming (inside the camera\'s travel)', () => {
  const cam = fitted(), [px, py] = toScreen(cam, 5.5 * T, 4.5 * T), before = toWorld(cam, px, py);
  zoomAt(cam, px, py, 1.4);
  const after = toWorld(cam, px, py);
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 1e-6);
});

test('moving the camera keeps the horizon put too; Fit-style refits re-pin without changing zoom or place', () => {
  const cam = fitted(), h0 = angle(cam).horizon;
  panBy(cam, 120, 80); clampCamera(cam);
  assert.ok(Math.abs(angle(cam).horizon - h0) < 1e-6);
  const z = cam.z, ox = cam.ox, oy = cam.oy;
  fitCamera(cam, { x: 50, y: 0, w: 1300, h: 700 }, true);
  assert.equal(cam.z, z); assert.equal(cam.ox, ox); assert.equal(cam.oy, oy);
  fitCamera(cam, { x: 0, y: 0, w: 1200, h: 700 });
  assert.equal(cam.ox, 0); assert.equal(cam.oy, 0); assert.equal(cam.z, cam.fitZ);
  assert.ok(project(0, 0)[1] < project(0, ROWS * T)[1], 'the far side is higher on screen than the near side');
});
