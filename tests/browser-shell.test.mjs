/* Runs the real browser shell (js/game) against a fake page: clicks become commands, the loop advances the engine,
   the camera maps clicks to the right tiles, and the run log handed to the Play screen replays to the same result. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { replay } = await import('../js/engine/replay.js');
const { toScreen } = await import('../js/game/camera.js');
const { STAGES, T, COLS } = await import('../js/content/data.js');
const { byId } = dom;
const drawErrors = [], realError = console.error;
console.error = (...a) => { drawErrors.push(a.map(String).join(' ')); };

const ends = [];
const hooks = { stage: 1, talents: [], onRunStart() {}, onRunEnd: async r => { ends.push(r); return 'saved'; }, onExit() { hooks.exited = (hooks.exited || 0) + 1; }, onNext() {} };
const world = () => _debug().world, view = () => _debug().view;
/* A click on the centre of tile (cx, cy), wherever the camera has put it. */
function click(cx, cy) {
  const [x, y] = toScreen(view().cam, (cx + 0.5) * T, (cy + 0.5) * T);
  byId.c.fire('pointerdown', { clientX: x, clientY: y, button: 0, pointerId: 1 });
  byId.c.fire('pointerup', { clientX: x, clientY: y, button: 0, pointerId: 1 });
}
const gold = () => Number(byId.gold._v);
const wave = () => Number(String(byId.wave._v).split(' / ')[0]);
const freeTiles = n => {
  const w = world(), out = [];
  for (const [x, y] of w.path.slice(3)) for (const [dx, dy] of [[0, 1], [0, -1]]) {
    const c = [x + dx, y + dy];
    if (c[1] >= 0 && c[1] < 10 && !w.pathSet.has(c.join(',')) && !out.some(o => o.join() === c.join())) out.push(c);
  }
  return out.slice(0, n);
};
const runUntil = (cond, max = 20000) => { for (let i = 0; i < max && !cond(); i++) dom.frame(); };

test('the screen comes alive: hero cards, gold and HUD values, no drawing errors', () => {
  startGame(hooks); dom.frames(3);
  assert.deepEqual(drawErrors, []);
  const card = dom.heroButton(0);
  assert.equal(card.children[1]._text, 'Warrior'); assert.equal(card.children[2]._v, 'Free · place it'); assert.equal(card.children[0]._v, '1');
  assert.equal(dom.heroButton(2).children[1]._text, 'Mage');
  assert.equal(dom.heroButton(3), undefined, 'only the three playable heroes have cards');
  assert.equal(byId.gold._v, '100'); assert.equal(byId.wave._v, '0 / 15'); assert.equal(byId.stage._v, '1'); assert.equal(byId.lives._v, '20');
  assert.equal(byId.heroPanel.hidden, true, 'the hero panel only appears when a hero is selected');
  assert.equal(byId.relics.hidden, true, 'the relic strip is hidden until you own a relic');
});

test('placing is free and once per hero; cards then select the hero; move and evolve from the hero panel', () => {
  const t = freeTiles(4);
  dom.heroButton(1).onclick(); click(...t[0]); dom.frames(1);
  assert.equal(gold(), 100, 'placing is free'); assert.equal(world().heroes.length, 1);
  assert.equal(dom.heroButton(1).children[2]._v, 'On the field');
  click(...t[2]); dom.frames(1);
  assert.equal(world().heroes.length, 2, 'the next click places the next hero waiting in the lineup');
  assert.notEqual(world().heroes[1].def.id, 'ranger', 'never the same hero twice');
  dom.heroButton(1).onclick(); dom.frames(1);
  assert.equal(byId.heroPanel.hidden, false, 'the card of a placed hero selects it on the map');
  dom.button('Move').onclick(); click(...t[1]); dom.frames(1);
  assert.deepEqual([world().heroes[0].cx, world().heroes[0].cy], t[1]);
  click(...t[1]); dom.frames(20);
  const evo = dom.button('Evolve');
  assert.ok(evo, 'Evolve button in the hero panel'); assert.equal(evo.disabled, true, 'not enough gold yet (150)');
  assert.equal(dom.button('Sell'), undefined, 'no selling');
  assert.equal(dom.made.some(e => e.tag === 'div' && /^When full: Empowered strike/.test(e._text)), true, 'the panel explains the ultimate');
});

test('the land outside the map cannot hold heroes, and shows a not-allowed cursor there', () => {
  byId.newRun.onclick(); dom.frames(2);
  const g0 = gold();
  dom.heroButton(1).onclick();
  for (const [cx, cy] of [[-1, 3], [COLS, 0], [4, -1], [7, 10]]) {
    click(cx, cy);
    const [x, y] = toScreen(view().cam, (cx + 0.5) * T, (cy + 0.5) * T);
    byId.c.fire('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' });
    assert.equal(byId.c.classList.contains('blocked'), true, 'not-allowed cursor at ' + cx + ',' + cy);
  }
  dom.frames(2);
  assert.equal(world().heroes.length, 0); assert.equal(gold(), g0);
  const [t] = freeTiles(1), [x, y] = toScreen(view().cam, (t[0] + 0.5) * T, (t[1] + 0.5) * T);
  byId.c.fire('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' });
  assert.equal(byId.c.classList.contains('blocked'), false, 'normal cursor back on the map');
  assert.deepEqual(drawErrors, [], 'drawing the land outside works');
});

test('dragging moves the map without placing anything; zoom keeps clicks on the right tile', () => {
  byId.newRun.onclick(); dom.frames(2);
  const cam = view().cam, x0 = cam.x;
  byId.c.fire('pointerdown', { clientX: 300, clientY: 200, button: 0, pointerId: 1 });
  byId.c.fire('pointermove', { clientX: 340, clientY: 210, pointerId: 1 });
  byId.c.fire('pointerup', { clientX: 340, clientY: 210, button: 0, pointerId: 1 });
  assert.equal(cam.x, x0 + 40, 'map moved with the drag'); assert.equal(world().heroes.length, 0, 'a drag is not a click');
  byId.camIn.onclick(); byId.camIn.onclick();
  assert.ok(cam.z > cam.fitZ * 1.5, 'zoomed in');
  const [t] = freeTiles(1);
  dom.heroButton(1).onclick(); click(...t); dom.frames(1);
  assert.deepEqual([world().heroes[0].cx, world().heroes[0].cy], t, 'the click landed on the intended tile');
  byId.camFit.onclick();
  assert.equal(cam.z, cam.fitZ); assert.equal(cam.touched, false);
  byId.c.fire('wheel', { clientX: 100, clientY: 100, deltaY: -300 });
  assert.ok(cam.z > cam.fitZ, 'mouse wheel zooms');
});

test('Menu pauses the game and asks before quitting; Resume continues', () => {
  byId.newRun.onclick(); dom.frames(2);
  byId.go.onclick(); dom.frames(30);
  const tick = world().tick;
  byId.menuBtn.onclick(); dom.frames(60);
  assert.equal(world().tick, tick, 'paused: no game time passes');
  assert.equal(byId.menuConfirm.hidden, false); assert.equal(byId.pauseBanner.hidden, false); assert.equal(byId.menuBtn.hidden, true);
  assert.equal(hooks.exited || 0, 0, 'opening the menu does not quit');
  byId.resumeBtn.onclick(); dom.frames(10);
  assert.ok(world().tick > tick, 'running again'); assert.equal(byId.menuConfirm.hidden, true);
  byId.menuBtn.onclick(); byId.quitYes.onclick();
  assert.equal(hooks.exited, 1, 'Quit leaves the match');
});

test('Retry always starts with Auto-start off, after a loss and after a win', () => {
  const stage = STAGES[0], saved = { waves: stage.waves, hpMult: stage.hpMult };
  stage.waves = 2; stage.hpMult = 0.2;
  try {
    for (const winning of [true, false]) {
      byId.newRun.onclick(); dom.frames(2);
      if (winning) { const t = freeTiles(2); dom.heroButton(1).onclick(); click(...t[0]); dom.heroButton(2).onclick(); click(...t[1]); }
      else world().lives = 1;   /* test only: make the loss quick (this run is not replayed) */
      byId.auto.onclick(); assert.equal(world().auto, true);
      ends.length = 0; runUntil(() => ends.length > 0, 60000);
      assert.equal(ends[0].won, winning);
      byId.newRun.onclick(); dom.frames(2);
      assert.equal(world().auto, false, 'retry after a ' + (winning ? 'win' : 'loss') + ' starts with Auto-start off');
      assert.equal(byId.auto._v, 'Auto-start: off');
    }
  } finally { Object.assign(stage, saved); }
});

test('hero panel: Move and Evolve come first, bonuses from the same source are stacked, damage type shown', async () => {
  const { recalc } = await import('../js/engine/world.js');
  const { RELICS } = await import('../js/content/data.js');
  const { stackMods } = await import('../js/game/ui.js');
  byId.newRun.onclick(); dom.frames(2);
  const sharp = RELICS.find(r => r.name === 'Sharpened rounds');
  world().mods.push(...sharp.mods(1).map(m => ({ ...m, source: sharp.name, ri: 0 })));   /* a Common... */
  world().mods.push(...sharp.mods(3).map(m => ({ ...m, source: sharp.name, ri: 2 })));   /* ...and a Rare */
  world().relics.push({ name: sharp.name, r: 0 }, { name: sharp.name, r: 2 });
  recalc(world());
  const [t] = freeTiles(1);
  dom.heroButton(0).onclick(); click(...t); click(...t); dom.frames(1);
  const kids = byId.inspect.children;
  assert.equal(kids[1].className, 'acts top', 'the buttons come right after the title');
  assert.deepEqual(kids[1].children.map(b => b._text.split(' ')[0]), ['Move', 'Evolve']);
  const lines = dom.made.filter(e => e.className === 'buff').map(e => e._text);
  assert.ok(lines.includes('+100% · Sharpened rounds ×2 (Relic)'), 'stacked across rarities: ' + lines.join(' | '));
  const chips = byId.relics.children;
  assert.equal(chips.length, 1, 'one relic chip, whatever the rarities');
  assert.equal(chips[0]._text, 'Sharpened rounds ×2');
  chips[0].fire('pointerenter', { clientX: 10, clientY: 10 });
  const tip = dom.made.filter(e => e.className === 'tip').at(-1);
  assert.deepEqual(tip.children.map(c => c._text), ['Sharpened rounds ×2', 'Common + Rare', 'Together: +100% damage (all heroes)']);
  assert.ok(dom.made.some(e => e._text === 'Damage (Physical)'));
  const more = stackMods([{ stat: 'x', type: 'more', value: 0.5, source: 'E', ri: -3 }, { stat: 'x', type: 'more', value: 0.5, source: 'E', ri: -3 }]);
  assert.equal(more.length, 1); assert.equal(more[0].value, 1.25, '"more" bonuses multiply: 1.5 x 1.5 = 2.25');
});

test('the gold box shows Compound interest: what the next wave pays and the gold for the full amount', async () => {
  const { recalc } = await import('../js/engine/world.js');
  const { RELICS } = await import('../js/content/data.js');
  byId.newRun.onclick(); dom.frames(2);
  assert.equal(byId.interest.hidden, true, 'hidden without the relic');
  const ci = RELICS.find(r => r.name === 'Compound interest');
  world().mods.push(...ci.mods(1).map(m => ({ ...m, source: ci.name, ri: 0 }))); recalc(world());
  dom.frames(1);
  assert.equal(byId.interest.hidden, false);
  assert.equal(byId.interest._v, 'Interest +5 · full at 1,200', '5% of 100 gold, full at 60 / 5% = 1,200');
  world().gold = 1500; dom.frames(1);
  assert.equal(byId.interest._v, 'Interest +60 (full)');
});

test('the match uses the lineup and items from the Play screen', () => {
  stopGame();
  startGame({ ...hooks, lineup: ['mage', 'warrior'], items: { warrior: 'power_charm' } }); dom.frames(2);
  assert.deepEqual(world().lineup, ['mage', 'warrior']);
  assert.equal(dom.heroButton(1).hidden, true, 'the Ranger stayed home');
  assert.equal(dom.heroButton(2).children[0]._v, '1', 'keys follow the lineup order'); assert.equal(dom.heroButton(0).children[0]._v, '2');
  const [t] = freeTiles(1);
  dom.heroButton(0).onclick(); click(...t); dom.frames(1);
  assert.equal(world().heroes[0].s.damage, 28 + 5, 'the Power Charm is equipped');
  stopGame(); startGame(hooks); dom.frames(2);
});

test('the run log handed to the Play screen replays to the same result', async () => {
  const stage = STAGES[0], saved = { waves: stage.waves, hpMult: stage.hpMult };
  stage.waves = 3; stage.hpMult = 0.3;
  try {
    ends.length = 0; byId.newRun.onclick(); dom.frames(2);
    const t = freeTiles(2);
    dom.heroButton(1).onclick(); click(...t[0]); dom.heroButton(2).onclick(); click(...t[1]);
    byId.auto.onclick();
    runUntil(() => ends.length > 0);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(ends.length, 1); assert.equal(ends[0].won, true);
    assert.equal(byId.overNext.hidden, false, 'next level button');
    const w = replay(ends[0].log);
    assert.equal(w.won, true); assert.equal(w.kills, ends[0].kills); assert.equal(w.wave, 3);
    assert.equal(w.tick, ends[0].log.ticks, 'the log ends on the final tick');
  } finally { Object.assign(stage, saved); }
});

test('catches up after the browser pauses, and keeps running in a hidden tab', async () => {
  byId.newRun.onclick(); dom.frames(2);
  const t = freeTiles(3);
  dom.heroButton(1).onclick(); click(...t[0]); dom.heroButton(2).onclick(); click(...t[2]);
  byId.auto.onclick();
  const w0 = wave();
  dom.frame(60000);
  dom.frames(200);
  assert.ok(wave() > w0 + 2, 'caught up several waves');
  const w1 = wave();
  document.hidden = true; dom.docHandlers.visibilitychange();
  dom.advanceClock(60000);
  await new Promise(r => setTimeout(r, 700));
  document.hidden = false; dom.docHandlers.visibilitychange(); dom.frames(3);
  assert.ok(wave() > w1 || byId.over.hidden === false, 'the hidden-tab timer kept the game going');
  stopGame();
  assert.deepEqual(drawErrors, [], 'no drawing errors during any run');
  console.error = realError;
});
