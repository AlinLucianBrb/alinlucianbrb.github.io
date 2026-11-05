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
/* Click and hold a hero, carry it to another tile and let go (the hold has to last HOLD_MS, so this waits a little). */
async function holdMove(from, to) {
  const [x, y] = toScreen(view().cam, (from[0] + 0.5) * T, (from[1] + 0.5) * T), [x2, y2] = toScreen(view().cam, (to[0] + 0.5) * T, (to[1] + 0.5) * T);
  byId.c.fire('pointerdown', { clientX: x, clientY: y, button: 0, pointerId: 1 });
  await new Promise(r => setTimeout(r, 320));
  byId.c.fire('pointermove', { clientX: x2, clientY: y2, pointerId: 1, pointerType: 'mouse' });
  byId.c.fire('pointerup', { clientX: x2, clientY: y2, button: 0, pointerId: 1 });
}
const nameOf = card => card.children[1].children[0]._v ?? card.children[1].children[0]._text;
const levelOf = card => card.children[1].children[1]._v ?? '';
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
const closeAll = () => { const b = [...dom.made].reverse().find(e => e.tag === 'button' && e._text === 'Close'); if (b) b.onclick(); };
const runUntil = (cond, max = 20000) => { for (let i = 0; i < max && !cond(); i++) dom.frame(); };

test('the screen comes alive: hero cards, gold and HUD values, no drawing errors', () => {
  startGame(hooks); dom.frames(3);
  assert.deepEqual(drawErrors, []);
  const card = dom.heroButton(0);
  assert.equal(nameOf(card), 'Warrior'); assert.equal(card.children[2]._v, 'Free · place it'); assert.equal(card.children[0]._v, '1');
  assert.equal(levelOf(card), '', 'no level before the hero is on the map');
  assert.equal(nameOf(dom.heroButton(2)), 'Mage');
  assert.equal(card.children.some(c => c.className === 'ebar'), false, 'no energy bar on the hero buttons');
  assert.equal(dom.heroButton(3).hidden, true, 'the Rogue has a card, hidden: it is not in this lineup');
  assert.equal(dom.heroButton(4), undefined, 'only the four playable heroes have cards');
  assert.equal(byId.gold._v, '100'); assert.equal(byId.wave._v, '0 / 15'); assert.equal(byId.stage._v, '1'); assert.equal(byId.lives._v, '20');
  assert.equal(byId.heroPanel.hidden, true, 'the hero panel only appears when a hero is selected');
  assert.equal(byId.relics.hidden, true, 'the relic strip is hidden until you own a relic');
});

test('placing is free and once per hero; cards then select the hero; click and hold to move', async () => {
  const t = freeTiles(4);
  dom.heroButton(1).onclick(); click(...t[0]); dom.frames(1);
  assert.equal(gold(), 100, 'placing is free'); assert.equal(world().heroes.length, 1);
  assert.equal(dom.heroButton(1).children[2]._v, '', 'no "On the field" text');
  assert.equal(levelOf(dom.heroButton(1)), 'Lv 1', 'the level sits next to the name');
  click(...t[2]); dom.frames(1);
  assert.equal(world().heroes.length, 2, 'the next click places the next hero waiting in the lineup');
  assert.notEqual(world().heroes[1].def.id, 'ranger', 'never the same hero twice');
  dom.heroButton(1).onclick(); dom.frames(1);
  assert.equal(byId.heroPanel.hidden, false, 'the card of a placed hero selects it on the map');
  assert.equal(dom.button('Move'), undefined, 'no Move button');
  click(...t[0]); dom.frames(1);
  assert.deepEqual([world().heroes[0].cx, world().heroes[0].cy], t[0], 'a quick click only selects');
  await holdMove(t[0], t[1]); dom.frames(1);
  assert.deepEqual([world().heroes[0].cx, world().heroes[0].cy], t[1], 'click and hold carries the hero to the new tile');
  assert.equal(view().moving, null);
  click(...t[1]); dom.frames(20);
  assert.equal(dom.button('Evolve'), undefined, 'no Evolve button in the panel');
  assert.ok(dom.made.some(e => e.tag === 'b' && e._text === 'Ranger · Lv 1'), 'the panel title shows the level');
  assert.ok(dom.made.some(e => e.className === 'lvl' && e._v === 'XP 0/10'), 'XP shown');
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
      assert.equal(byId.auto.classList.contains('on'), false, 'the AUTO part of the button is not lit');
      assert.equal(byId.auto.attrs['aria-pressed'], 'false');
    }
  } finally { Object.assign(stage, saved); }
});

test('hero panel: a hint on moving comes first, bonuses from the same source are stacked, damage type shown', async () => {
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
  /* Title, then XP right under it, then the attributes, then energy as x/max. No move or evolve text. */
  assert.equal(kids[1].children[0].className, 'lvl'); assert.match(kids[1].children[0]._v, /^XP \d+\/10$/);
  assert.equal(kids[2].className, 'attrs');
  assert.deepEqual(kids[2].children.map(a => a.children.map(c => c._text).join(' ')), ['Str 10', 'Dex 4', 'Int 2']);
  assert.equal(kids[2].children[0].className, 'attr main', 'strength is the main one'); assert.equal(kids[2].children[0].style.color, '#e5645a', 'in red');
  assert.equal(kids[2].children[1].className, 'attr');
  assert.match(kids[3].children[0]._v, /^Energy \d+\/100$/, 'energy as x/max before its bar');
  assert.equal(dom.made.some(e => /click and hold|Evolves at level/.test(e._text || '') && byId.inspect.children.includes(e)), false, 'no move or evolve text');
  const lines = dom.made.filter(e => e.className === 'buff').map(e => e._text);
  assert.ok(lines.includes('+15% · Sharpened rounds ×2 (Relic)'), 'stacked across rarities (3.75% + 11.25%): ' + lines.join(' | '));
  const chips = byId.relics.children;
  assert.equal(chips.length, 1, 'one relic chip, whatever the rarities');
  assert.equal(chips[0]._text, 'Sharpened rounds ×2');
  chips[0].fire('pointerenter', { clientX: 10, clientY: 10 });
  const tip = dom.made.filter(e => e.className === 'tip').at(-1);
  assert.deepEqual(tip.children.map(c => c._text), ['Sharpened rounds ×2', 'Common + Rare', 'Together: +15% damage (all heroes)']);
  assert.ok(dom.made.some(e => e._text === 'Damage (Physical)'));
  const more = stackMods([{ stat: 'x', type: 'more', value: 0.5, source: 'E', ri: -3 }, { stat: 'x', type: 'more', value: 0.5, source: 'E', ri: -3 }]);
  assert.equal(more.length, 1); assert.equal(more[0].value, 1.25, '"more" bonuses multiply: 1.5 x 1.5 = 2.25');
});

test('talent bonuses are stacked into one "Talents" line per stat', async () => {
  stopGame();
  /* Two path nodes to the Might cluster (the path from the origin and the anchor on the circle, +1 to all attributes each),
     its beginning (+2% damage), then two Sharpened (+3% each). */
  const { pathTo } = await import('../js/content/talents.js');
  startGame({ ...hooks, talents: pathTo(new Set(), 't4_might_a2') }); dom.frames(2);
  const [t] = freeTiles(1);
  dom.heroButton(0).onclick(); click(...t); click(...t); dom.frames(1);
  const lines = dom.made.filter(e => e.className === 'buff' && / · Talents/.test(e._text)).map(e => e._text);
  assert.ok(lines.includes('+8% · Talents ×3'), 'one line: ' + lines.join(' | '));
  assert.ok(Math.abs(world().heroes[0].s.damage - 28 * 1.20) < 1e-9, 'talents +8% and 12 strength +12%');
  assert.ok(dom.made.some(e => e.className === 'buff' && e._text === '+12% · Strength (attribute)'), 'the attribute bonus is listed');
  /* Level the Warrior up twice: +6 strength, shown on the Strength chip and explained in its tooltip. */
  const { gainXp } = await import('../js/engine/levels.js');
  gainXp(world(), world().heroes[0], 22); dom.frames(20);
  const str = byId.inspect.children[2].children[0];
  assert.equal(str.children[1]._text, '18');
  str.fire('pointerenter', { clientX: 5, clientY: 5 });
  const tip = dom.made.filter(e => e.className === 'tip').at(-1).children.map(c => c._text);
  assert.deepEqual(tip, ['Strength (main attribute)', '+18% damage (+1% per point)', '+2 · Talents ×2', '+6 · Hero level']);
  stopGame(); startGame(hooks); dom.frames(2);
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

test('evolving the Mage: an Evolve button with the cost pops up above its card; it opens a picker that pauses the game', async () => {
  const { levelMods } = await import('../js/engine/levels.js');
  byId.newRun.onclick(); dom.frames(2);
  const [t] = freeTiles(1);
  dom.heroButton(2).onclick(); click(...t); click(...t); dom.frames(1);
  const m = world().heroes[0];
  m.level = 10; m.lvlMods = levelMods(10); world().statsFor(m); world().gold = 100;   /* test only */
  dom.frames(20);
  const rise = dom.heroButton(2)._up;
  assert.equal(dom.heroButton(0)._up.hidden, true, 'only heroes that reached the level show it');
  assert.equal(rise.hidden, false, 'shown once the level is reached'); assert.equal(rise._v, '▲ Evolve · 150', 'with the cost');
  assert.equal(rise.disabled, true, 'not enough gold yet'); assert.ok(rise._cls.has('short'), 'and dimmed');
  world().gold = 500; dom.frames(1);
  assert.equal(rise.disabled, false); assert.equal(rise._cls.has('short'), false);
  assert.ok(dom.heroButton(2)._wrap.children.includes(rise), 'it sits with the card, not on the map');
  byId.go.onclick(); dom.frames(5);
  rise.onclick(); dom.frames(1);
  assert.equal(byId.evoPick.hidden, false, 'the evolution picker opens');
  assert.equal(byId.evoTitle._v, 'Evolve the Mage · 150 gold');
  const tick = world().tick; dom.frames(60);
  assert.equal(world().tick, tick, 'the game is paused while choosing');
  byId.evoCancel.onclick(); dom.frames(5);
  assert.equal(byId.evoPick.hidden, true); assert.ok(world().tick > tick, 'Cancel resumes'); assert.equal(m.tier, 0);
  rise.onclick(); dom.frames(1);
  const choices = byId.evoChoices.children.map(card => card.children[0]);
  assert.deepEqual(choices.map(c => c.children[0]._text), ['Fire Mage', 'Cold Mage', 'Lightning Mage']);
  assert.equal(world().heroes[0].tier, 0, 'opening the choice does not evolve yet');
  choices[2].onclick(); dom.frames(1);
  assert.equal(byId.evoPick.hidden, true, 'choosing closes the picker');
  assert.equal(m.def.name, 'Lightning Mage'); assert.equal(world().gold, 350);
  assert.ok(dom.made.some(e => e.tag === 'b' && e._text === '★ Lightning Mage · Lv 10'), 'the panel title shows the new form');
  assert.equal(rise.hidden, true, 'the Evolve button goes away');
  assert.equal(dom.heroButton(2).hidden, true, 'a fully evolved hero has no button any more');
});

test('the match uses the lineup and items from the Play screen', () => {
  stopGame();
  startGame({ ...hooks, lineup: ['mage', 'warrior'], items: { warrior: 'power_charm' } }); dom.frames(2);
  assert.deepEqual(world().lineup, ['mage', 'warrior']);
  assert.equal(dom.heroButton(1).hidden, true, 'the Ranger stayed home');
  assert.equal(dom.heroButton(2).children[0]._v, '1', 'keys follow the lineup order'); assert.equal(dom.heroButton(0).children[0]._v, '2');
  const [t] = freeTiles(1);
  dom.heroButton(0).onclick(); click(...t); dom.frames(1);
  assert.ok(Math.abs(world().heroes[0].s.damage - 33 * 1.1) < 1e-9, 'the Power Charm is equipped (a plain item id works too)');
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
