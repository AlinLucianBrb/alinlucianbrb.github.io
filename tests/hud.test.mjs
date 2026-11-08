/* The hero buttons as indicators (ability icons with a cooldown sweep and an energy fill), the hero tooltip's tags and
   ailments, and the "keep playing while choosing" setting, remembered between matches. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const store = { 'tbd.playOnPick': '1' };
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { tagLine, ailmentLine } = await import('../js/game/ui.js');
const { HEROES, evolvedDef } = await import('../js/content/data.js');
const { heroStats } = await import('../js/engine/stats.js');
const { apply } = await import('../js/engine/commands.js');
const { byId } = dom;
const hooks = { stage: 1, talents: [], lineup: ['warrior', 'ranger', 'mage'], onRunStart() {}, onRunEnd: async () => '', onExit() {}, onNext() {} };

test('the remembered setting turns on "keep playing while choosing" at the start of a match (recorded in the log)', () => {
  startGame(hooks); dom.frames(2);
  const w = _debug().world;
  assert.equal(w.playOnPick, true);
  assert.deepEqual(w.log.commands[0], { type: 'playOnPick', on: true, t: 0 });
  byId.relic.onclick();   /* buys a relic and opens the picker */
  assert.equal(w.picking, true);
  dom.frames(2);
  const box = byId.playOnPick;
  assert.equal(box.checked, true, 'the box in the relic picker is ticked');
  box.checked = false; box.onchange();
  assert.equal(store['tbd.playOnPick'], '0', 'remembered'); assert.equal(w.playOnPick, false);
  apply(w, { type: 'choose', index: 0 });
  stopGame();
});

test('hero buttons stay as indicators: the basic attack sweeps through its cooldown, the ultimate fills with energy', () => {
  startGame(hooks); dom.frames(2);
  const w = _debug().world, t = [];
  for (const [x, y] of w.path.slice(2)) if (y + 1 < 10 && !w.pathSet.has(x + ',' + (y + 1))) t.push([x, y + 1]);
  const card = dom.heroButton(1);
  assert.ok(card._abil._cls.has('idle'), 'dim until the hero is on the map');
  assert.ok(apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1] }).ok);
  const h = w.heroes[0], full = h.s.cooldown / h.s.speed;
  h.cd = full / 2; h.energy = h.s.energyMax / 4;
  dom.frame();
  assert.ok(!card._abil._cls.has('idle'));
  const p = +card._atk._sw.style['--p'];
  assert.ok(p > 0.4 && p <= 0.5, 'about half the cooldown still to go: ' + p);
  const q = +card._ult._sw.style['--p'];
  assert.ok(q > 0.6 && q <= 0.75, 'about a quarter of the energy: ' + q);
  assert.ok(!card._ult._cls.has('ready'));
  h.energy = h.s.energyMax; h.cd = 0; dom.frame();
  assert.ok(card._ult._cls.has('ready'), 'gold when the ultimate is ready'); assert.equal(card._atk._sw.style['--p'], '0');
  assert.ok(/ability_atk_arrow\.png$/.test(card._atk._img.src) && /ability_ult_empowered\.png$/.test(card._ult._img.src));
  stopGame();
});

test('the hero tooltip names the current form\'s tags and the ailments its hits can inflict', () => {
  const mage = HEROES.find(h => h.id === 'mage'), fire = evolvedDef(mage, mage.evolutions[0].choices.find(c => c.id === 'firemage'));
  assert.equal(tagLine(mage), 'Spell · Arcane');
  assert.equal(tagLine(fire), 'Spell · Arcane · Fire');
  assert.equal(ailmentLine(mage, heroStats(mage, [])), '', 'no ailment chance, no ailments');
  assert.match(ailmentLine(fire, { ...heroStats(fire, []), burnChance: 1 }), /^Burn 100%$/);
  assert.equal(ailmentLine(fire, { ...heroStats(fire, []), bleedChance: 1 }), '', 'bleed needs physical hits');
});
