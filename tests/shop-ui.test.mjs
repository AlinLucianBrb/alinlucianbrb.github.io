/* The shop window in the game shell, against a fake page: opening it pauses, buying a ground effect asks for a tile, the
   gamble and the boss button work, and a player without the shop has no button. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { toScreen } = await import('../js/game/camera.js');
const { T } = await import('../js/content/data.js');
const { OUTCOMES } = await import('../js/content/shop.js');
const { gambleText } = await import('../js/game/shop-ui.js');
const { byId } = dom;
const world = () => _debug().world, view = () => _debug().view;
const hooks = { stage: 2, talents: [], lineup: ['warrior'], onRunStart() {}, onRunEnd: async () => 'saved', onExit() {}, onNext() {} };
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const btn = re => findAll(byId.shopCols, e => e.tag === 'button' && re.test(e._text));
const texts = () => findAll(byId.shopCols, e => !!e._text).map(e => e._text).join(' | ');
function click(cx, cy) {
  const [x, y] = toScreen(view().cam, (cx + 0.5) * T, (cy + 0.5) * T);
  byId.c.fire('pointerdown', { clientX: x, clientY: y, button: 0, pointerId: 1 }); byId.c.fire('pointerup', { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

test('no shop, no button', () => {
  startGame({ ...hooks }); dom.frames(2);
  assert.equal(byId.shopBtn.hidden, true); byId.shopBtn.onclick(); assert.ok(!view().shop);
  stopGame();
});

test('the window: opens and pauses, buys a tile, upgrades it, gambles, and says when a boss can come', () => {
  const errors = [], real = console.error; console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    startGame({ ...hooks, shop: true }); dom.frames(2); const w = world(); w.gold = 5000;
    assert.equal(byId.shopBtn.hidden, false);
    byId.shopBtn.onclick(); dom.frames(1); assert.equal(byId.shopBox.hidden, false);
    const tick = w.tick; dom.frames(20); assert.equal(w.tick, tick, 'paused');
    assert.match(texts(), /Greed/); assert.match(texts(), /Conduit/); assert.match(texts(), /Only while a wave is coming/); assert.equal(btn(/^Summon/)[0].disabled, true);
    btn(/^Buy · 300/)[0].onclick(); dom.frames(1);
    assert.equal(byId.shopBox.hidden, true); assert.equal(view().tile, 'greed'); assert.match(byId.tileHint._text ?? byId.tileHint._v, /Greed · 300 gold/);
    dom.frames(5); assert.equal(w.tick, tick, 'still paused while choosing the tile');
    click(...w.path[4]); assert.equal(w.tiles.length, 0); assert.match(byId.tileHint._text ?? byId.tileHint._v, /Not there/);
    let t; for (const [x, y] of w.path.slice(3)) for (const d of [1, -1]) if (!t && y + d >= 0 && y + d < 8 && x < 12 && !w.pathSet.has(x + ',' + (y + d))) t = [x, y + d];
    click(...t); dom.frames(2); assert.deepEqual(w.tiles.map(x => [x.effect, x.cx, x.cy]), [['greed', ...t]]); assert.equal(view().tile, null); assert.equal(byId.tileHint.hidden, true);
    byId.shopBtn.onclick(); dom.frames(1); btn(/^Upgrade · 400/)[0].onclick(); assert.equal(w.tiles[0].level, 2);
    for (let k = 0; k < 3; k++) btn(/^Gamble ·/)[0].onclick();
    assert.equal(w.gambles, 3); assert.equal(btn(/^Gamble ·/)[0].disabled, true); assert.ok(texts().includes(gambleText(w.lastGamble)));
    byId.shopClose.onclick(); dom.frames(3); assert.equal(byId.shopBox.hidden, true);
    byId.go.onclick(); dom.frames(3); byId.shopBtn.onclick(); dom.frames(1);
    assert.equal(btn(/^Summon/)[0].disabled, false); btn(/^Summon/)[0].onclick(); dom.frames(2);
    assert.equal(w.enemies.filter(e => e.def.summoned).length, 1); assert.match(texts(), /Ready in 5 waves/);
    byId.shopClose.onclick(); dom.frames(30);
    assert.deepEqual(errors, []);
  } finally { console.error = real; stopGame(); }
});

test('every gamble outcome has its words', () => {
  for (const o of OUTCOMES) assert.ok(gambleText({ id: o.id, got: [{ name: 'Brawn', r: 1 }, { name: 'Finesse', r: 0 }], paid: 150 }).length > 5, o.id);
  assert.match(gambleText({ id: 'jackpot', got: [], paid: 150 }), /600 gold/); assert.match(gambleText({ id: 'two', got: [{ name: 'Brawn', r: 1 }, { name: 'Finesse', r: 0 }], paid: 1 }), /Uncommon Brawn and Common Finesse/);
});
