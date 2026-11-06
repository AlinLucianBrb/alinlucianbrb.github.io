/* The pixel art: every sprite the game asks for is in assets/, the tile sheet has every tile the board needs, and the game
   draws with the art loaded (sprites, the painted board, effects) without drawing errors, as it does without it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const assets = new URL('../assets/', import.meta.url);
const tilesJson = JSON.parse(readFileSync(new URL('tiles.json', assets), 'utf8'));
/* A browser-like Image that "loads" at once (the fake canvas only checks that drawImage gets an image with a size),
   and fetch for tiles.json. */
const drawn = [];
globalThis.Image = class { set src(v) { this._src = v; this.complete = true; this.naturalWidth = this.width = /fx_slash/.test(v) ? 192 : 64; this.naturalHeight = this.height = 64; } get src() { return this._src; } };
globalThis.fetch = async () => ({ json: async () => tilesJson });

const { SPRITES, heroSprite, get } = await import('../js/game/sprites.js');
const { HEROES, evolvedDef, T } = await import('../js/content/data.js');
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { apply } = await import('../js/engine/commands.js');
const { spawnEnemy } = await import('../js/engine/enemies.js');

test('every sprite the game uses is in assets/', () => {
  const missing = SPRITES.filter(n => !existsSync(new URL(n + '.png', assets)));
  assert.deepEqual(missing, []);
  for (const h of HEROES) for (const step of h.evolutions) for (const c of step.choices)
    assert.ok(SPRITES.includes(heroSprite(evolvedDef(h, c))), 'a sprite for the ' + c.name);
});

test('the tile sheet has the ground textures and all 47 road pieces', () => {
  const names = Object.keys(tilesJson.tiles);
  for (const k of ['grass', 'dirt', 'forest']) for (let i = 0; i < 16; i++) assert.ok(names.includes(k + '_' + i), k + '_' + i);
  assert.equal(names.filter(n => n.startsWith('pathmask_')).length, 47);
  assert.equal(names.filter(n => n.startsWith('pathedge_')).length, 47);
  assert.equal(tilesJson.size, 64);
});

test('with the art loaded the game draws sprites, the painted board and effects without errors', async () => {
  const errors = [], realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    for (const n of SPRITES) get(n);
    await new Promise(r => setTimeout(r, 0));     /* tiles.json arrives */
    startGame({ stage: 1, talents: [], lineup: ['warrior', 'ranger', 'mage'], items: {}, onRunStart() {}, onRunEnd: async () => '', onExit() {}, onNext() {} });
    dom.frames(2); await new Promise(r => setTimeout(r, 0)); dom.frames(2);
    const { world: w, view: v } = _debug();
    const free = [];
    for (const [x, y] of w.path.slice(2)) for (const dy of [-1, 1]) if (y + dy >= 0 && y + dy < 10 && !w.pathSet.has(x + ',' + (y + dy))) free.push([x, y + dy]);
    ['warrior', 'ranger', 'mage'].forEach((hero, i) => apply(w, { type: 'place', hero, cx: free[i * 4][0], cy: free[i * 4][1] }));
    for (const t of ['runner', 'grunt', 'brute', 'boss']) spawnEnemy(w, t);
    w.enemies[0].fx = { bleed: { t: 2 }, poison: { stacks: [{ t: 1 }] } };
    w.zones = [{ type: 'storm', x: 80, y: 80, r: 40, t: 2 }, { type: 'barrier', x: 120, y: 80, t: 2, d: 0 }];
    v.vfx.anims.push({ name: 'fx_explosion', x: 100, y: 100, s: 96, t: 0.1, dur: 0.45, frames: 5 });
    v.vfx.slashes.push({ x: 100, y: 100, a: 0.5, h: 0.6, r: 40, t: 0.1, ttl: 0.2, c: '#fff' });
    w.projs.push({ type: 'bolt', owner: w.heroes[2], target: w.enemies[0], x: 50, y: 50, dx: 1, dy: 0, size: 5, look: 'orb', color: '#fff', scale: 1 });
    w.projs.push({ type: 'sword', owner: w.heroes[0], x: 60, y: 60, dx: 0, dy: 1, dist: 0, max: 100, hit: new Set() });
    dom.frames(30);
    assert.deepEqual(errors, [], 'no drawing errors');
    assert.ok(w.heroes.length === 3, 'the match runs'); assert.ok(get('hero_warrior') && get('tiles'), 'the art is loaded');
  } finally { console.error = realError; stopGame(); }
});
