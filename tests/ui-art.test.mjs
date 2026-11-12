/* The menu and HUD art: every picture and the font the page asks for are in assets/, plus each level's picture and each
   talent cluster's icon (built by art/ui.py, font.py, scenes.py and icons.py; see the Art section of the README). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { STAGES } from '../js/content/data.js';
import { TREES } from '../js/content/talents.js';

const root = new URL('../', import.meta.url);
const has = f => existsSync(new URL('assets/' + f, root));

test('every asset the page names (frames, logo, scene, icons, font) exists', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const refs = [...new Set([...html.matchAll(/assets\/([\w.-]+\.(?:png|woff))/g)].map(m => m[1]))];
  assert.ok(refs.length > 30, refs.length + ' references');
  for (const f of refs) assert.ok(has(f), f);
  assert.ok(html.includes("font-family:'TBD Pixel'"));
});

test('each zone has its picture and name (its levels show them); each talent cluster has its icon', () => {
  for (const s of STAGES) { assert.ok(has('level_' + s.zone + '.png'), 'level ' + s.code); assert.ok(s.name, 'level ' + s.code + ' name'); }
  for (const t of Object.values(TREES)) for (const c of t.clusters || []) assert.ok(has('icon_talent_' + c.key + '.png'), c.key);
  for (const n of ['strength', 'dexterity', 'intellect', 'damage', 'range', 'speed', 'castspeed', 'crit', 'energy']) assert.ok(has('icon_' + n + '.png'), n);
});
