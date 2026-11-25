import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, ZONE_PATH, zoneColor, roadPath } from '../js/content/world-map.js';
import { ZONES, STAGES, ENDLESS } from '../js/content/data.js';

test('the world map: one place per zone, left to right, inside the map box', () => {
  assert.deepEqual(WORLD.map(w => w.zone), ZONES.map(z => z.n));
  for (let i = 1; i < WORLD.length; i++) assert.ok(WORLD[i].x > WORLD[i - 1].x, 'zones go from left to right');
  for (const p of [...WORLD, ...ZONE_PATH]) assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
  assert.equal(zoneColor(3), '#a98bd6'); assert.equal(zoneColor(99), WORLD[0].color, 'an unknown zone falls back to the first');
});

test('a zone path has a place for every level of the biggest zone plus Endless', () => {
  const most = Math.max(...ZONES.map(z => STAGES.filter(s => s.zone === z.n).length + (ENDLESS.some(e => e.zone === z.n) ? 1 : 0)));
  assert.ok(ZONE_PATH.length >= most);
  for (let i = 1; i < ZONE_PATH.length; i++) assert.ok(ZONE_PATH[i].x > ZONE_PATH[i - 1].x, 'levels go from left to right');
});

test('roadPath: a curve through the points', () => {
  assert.equal(roadPath([]), '');
  assert.equal(roadPath([{ x: 0, y: 10 }]), 'M 0 10');
  assert.equal(roadPath([{ x: 0, y: 10 }, { x: 20, y: 30 }]), 'M 0 10 C 10 10, 10 30, 20 30');
});
