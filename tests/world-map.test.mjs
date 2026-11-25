import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, ZONE_PATH, ENDLESS_SPOT, zoneColor, roadPath } from '../js/content/world-map.js';
import { ZONES, STAGES, ENDLESS } from '../js/content/data.js';

test('the world map: one place per zone, left to right, inside the map box', () => {
  assert.deepEqual(WORLD.map(w => w.zone), ZONES.map(z => z.n));
  for (let i = 1; i < WORLD.length; i++) assert.ok(WORLD[i].x > WORLD[i - 1].x, 'zones go from left to right');
  for (const p of [...WORLD, ...ZONE_PATH, ENDLESS_SPOT]) assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
  assert.equal(zoneColor(3), '#a98bd6'); assert.equal(zoneColor(99), WORLD[0].color, 'an unknown zone falls back to the first');
});

test('a zone path has a place for every level of the biggest zone; Endless stands apart, past the last level', () => {
  const most = Math.max(...ZONES.map(z => STAGES.filter(s => s.zone === z.n).length));
  assert.ok(ENDLESS.length && ENDLESS_SPOT.x > ZONE_PATH.at(-1).x);
  assert.ok(ZONE_PATH.length >= most);
  for (let i = 1; i < ZONE_PATH.length; i++) assert.ok(ZONE_PATH[i].x > ZONE_PATH[i - 1].x, 'levels go from left to right');
});

test('roadPath: a curve through the points', () => {
  assert.equal(roadPath([]), '');
  assert.equal(roadPath([{ x: 0, y: 10 }]), 'M 0 10');
  assert.equal(roadPath([{ x: 0, y: 10 }, { x: 20, y: 30 }]), 'M 0 10 C 10 10, 10 30, 20 30');
});

test('a painted act map: a stop for each of its levels and a place for the portal, inside the picture; the files exist', async () => {
  const { ZONE_ART } = await import('../js/content/world-map.js');
  const { existsSync } = await import('node:fs');
  assert.ok(ZONE_ART[1], 'Act 1 has its painted map');
  for (const [n, a] of Object.entries(ZONE_ART)) {
    assert.equal(a.stops.length, STAGES.filter(s => s.zone === +n).length, 'one stop per level');
    for (const p of [...a.stops, a.endless]) assert.ok(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100);
    assert.ok(a.ratio > 1 && existsSync(new URL('../' + a.src, import.meta.url)), a.src);
  }
  for (const f of ['map_flag.png', 'map_portal.png']) assert.ok(existsSync(new URL('../assets/' + f, import.meta.url)), f);
});
