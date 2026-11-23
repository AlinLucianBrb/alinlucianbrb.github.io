/* The match shop on the screen (top left), against a fake page: it shows only for a player who has it; a ground effect asks
   for a tile (and pauses solo until placed); tiles you own can be upgraded; the gamble (also key G) shows its result for a few
   seconds; the boss waits for a wave. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { toScreen } = await import('../js/game/camera.js');
const { T } = await import('../js/content/data.js');
const { OUTCOMES } = await import('../js/content/shop.js');
const { gambleText, RESULT_SECONDS } = await import('../js/game/shop-ui.js');
const { byId } = dom;
const world = () => _debug().world, view = () => _debug().view;
const hooks = { stage: 2, talents: [], lineup: ['warrior'], onRunStart() {}, onRunEnd: async () => 'saved', onExit() {}, onNext() {} };
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const btn = re => findAll(byId.shopPanel, e => e.tag === 'button' && re.test(e.attrs['aria-label'] || ''));
const texts = () => findAll(byId.shopPanel, e => !!e._text).map(e => e._text).join(' | ');
function click(cx, cy) {
  const [x, y] = toScreen(view().cam, (cx + 0.5) * T, (cy + 0.5) * T);
  byId.c.fire('pointerdown', { clientX: x, clientY: y, button: 0, pointerId: 1 }); byId.c.fire('pointerup', { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

test('no shop: no shop icons and no boss button', () => {
  startGame({ ...hooks }); dom.frames(2);
  assert.equal(byId.shopPanel.hidden, true); assert.equal(byId.shopPanel.children.length, 0); assert.equal(byId.bossBtn.hidden, true);
  stopGame();
});

test('the shop: always on screen at the left, icons with their price, the boss in the bottom bar; tiles, upgrades, gambles (result for a few seconds)', () => {
  const errors = [], real = console.error; console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    startGame({ ...hooks, shop: true }); dom.frames(2); const w = world(); w.gold = 5000; dom.frames(1);
    assert.equal(byId.shopPanel.hidden, false); assert.ok(!byId.shopCard.hidden, 'the card is always there'); assert.equal(byId.shopPanel.children[0].className, 'shopicons', 'icons (the title belongs to the card)');
    const greed = btn(/^Greed, 300 gold$/)[0]; assert.ok(greed && btn(/^Conduit, 300 gold$/).length === 1);
    assert.ok(greed.children.some(c => c.tag === 'img') && greed.children.some(c => c._text === '300'), 'an icon, the price under it');
    assert.equal(byId.bossBtn.hidden, false); assert.equal(byId.bossBtn.disabled, true, 'only while a wave is coming');
    const tick = w.tick; dom.frames(5); assert.ok(w.tick > tick, 'the shop does not pause the match');
    greed.onclick(); dom.frames(1);
    assert.equal(view().tile, 'greed'); assert.match(byId.tileHint._text ?? byId.tileHint._v, /Greed · 300 gold/);
    const t0 = w.tick; dom.frames(5); assert.equal(w.tick, t0, 'paused while choosing the tile');
    click(...w.path[4]); assert.equal(w.tiles.length, 0); assert.match(byId.tileHint._text ?? byId.tileHint._v, /Not there/);
    let t; for (const [x, y] of w.path.slice(3)) for (const d of [1, -1]) if (!t && y + d >= 0 && y + d < 8 && x < 12 && !w.pathSet.has(x + ',' + (y + d))) t = [x, y + d];
    click(...t); dom.frames(2); assert.deepEqual(w.tiles.map(x => [x.effect, x.cx, x.cy]), [['greed', ...t]]); assert.equal(view().tile, null);
    btn(/^Greed level 1, upgrade for 400 gold$/)[0].onclick(); dom.frames(1); assert.equal(w.tiles[0].level, 2); assert.equal(btn(/^Greed level 2/).length, 1);
    for (let k = 0; k < 3; k++) btn(/^Gamble/)[0].onclick();
    dom.frames(1); assert.equal(w.gambles, 3); assert.equal(btn(/^Gamble/)[0].disabled, true);
    assert.equal(byId.gambleToast.hidden, false); assert.equal(byId.gambleToast._text, gambleText(w.lastGamble));
    dom.frames(Math.ceil(RESULT_SECONDS * 60) + 5); assert.equal(byId.gambleToast.hidden, true, 'the result goes away');
    byId.go.onclick(); dom.frames(3);
    assert.equal(byId.bossBtn.disabled, false); byId.bossBtn.onclick(); dom.frames(2);
    assert.equal(w.enemies.filter(e => e.def.summoned).length, 1); assert.ok(byId.bossBtn.children.some(c => c._text === '5w'), 'then it waits 5 waves');
    assert.deepEqual(errors, []);
  } finally { console.error = real; stopGame(); }
});

test('every gamble outcome has its words', () => {
  for (const o of OUTCOMES) assert.ok(gambleText({ id: o.id, got: [{ name: 'Brawn', r: 1 }, { name: 'Finesse', r: 0 }], paid: 150 }).length > 5, o.id);
  assert.match(gambleText({ id: 'jackpot', got: [], paid: 150 }), /600 gold/); assert.match(gambleText({ id: 'two', got: [{ name: 'Brawn', r: 1 }, { name: 'Finesse', r: 0 }], paid: 1 }), /Uncommon Brawn and Common Finesse/);
});
