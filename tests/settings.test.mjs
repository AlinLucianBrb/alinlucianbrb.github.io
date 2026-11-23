/* Settings (js/core/prefs.js and the Settings screen), the Keys window, keyboard focus in the match's windows, and the
   evolution picker's number keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
document.documentElement = { style: { setProperty(k, v) { this[k] = v; } } };
const prefs = await import('../js/core/prefs.js');
const { KEYS } = await import('../js/game/keys.js');
const { startGame, stopGame, _debug } = await import('../js/game/game.js');
const { byId } = dom;
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('settings: defaults, saved on this browser, bad values refused, and put on the page', () => {
  prefs._resetPrefs(); for (const k in store) delete store[k];
  assert.deepEqual(prefs.getPrefs(), { textSize: 1, effects: 'full', rarityMarks: true, speed: 1, auto: false, playOnPick: false });
  assert.equal(prefs.setPref('textSize', 1.3), true); assert.equal(prefs.setPref('textSize', 5), false); assert.equal(prefs.setPref('nope', 1), false); assert.equal(prefs.setPref('speed', '2'), false);
  prefs.setPref('effects', 'fewer'); prefs.setPref('rarityMarks', false);
  assert.equal(document.documentElement.style['--ts'], '1.3'); assert.ok(document.body._cls.has('calm')); assert.ok(!document.body._cls.has('rarmarks')); assert.equal(prefs.calm(), true);
  prefs._resetPrefs(); assert.equal(prefs.getPrefs().textSize, 1.3, 'read back');
  store['tbd.prefs'] = '{"textSize":9,"auto":"yes","speed":2'; prefs._resetPrefs(); assert.deepEqual([prefs.getPrefs().textSize, prefs.getPrefs().speed], [1, 1], 'broken: the defaults');
  store['tbd.prefs'] = '{}'; store['tbd.playOnPick'] = '1'; prefs._resetPrefs(); assert.equal(prefs.getPrefs().playOnPick, true, 'the old key still counts');
  prefs.setPref('effects', 'full'); prefs.setPref('rarityMarks', true); prefs.setPref('textSize', 1); prefs.setPref('playOnPick', false);
});

test('the Settings screen: a row of buttons for each setting, the one in use lit; the keys listed', async () => {
  const { default: screen } = await import('../js/screens/settings.js');
  screen.mount(); const rows = byId.setRows.children;
  assert.equal(rows.length, 6);
  const sizes = rows[0].children[1].children; assert.deepEqual(sizes.map(b => b._text), ['Normal', 'Large', 'Larger']); assert.equal(sizes[0].attrs['aria-pressed'], 'true');
  sizes[2].onclick(); assert.equal(prefs.getPrefs().textSize, 1.3); assert.equal(byId.setRows.children[0].children[1].children[2].attrs['aria-pressed'], 'true');
  byId.setRows.children[0].children[1].children[0].onclick();
  assert.equal(byId.setKeys.children.length, KEYS.length);
});

test('the Keys window: the ? button opens it, it lists every key, Close closes it', () => {
  for (const k of ['Space or R', 'E', 'M', 'G', 'Enter', 'P', 'Esc', 'F', 'H or ?']) assert.ok(KEYS.some(([key]) => key === k), k);
  assert.ok(html.includes('id="keysBox"') && html.includes('id="keysBtn"'));
  startGame({ stage: 1, talents: [], lineup: ['warrior'], onRunStart() {}, onRunEnd: async () => '', onExit() {}, onNext() {} }); dom.frames(2);
  byId.keysBtn.onclick(); dom.frames(1); assert.equal(byId.keysBox.hidden, false); assert.equal(byId.keysList.children.length, KEYS.length);
  byId.keysClose.onclick(); assert.equal(byId.keysBox.hidden, true);
  stopGame();
});

test('settings at the start of a solo match: speed (never above what is unlocked) and Auto-start', () => {
  prefs.setPref('speed', 3); prefs.setPref('auto', true);
  startGame({ stage: 1, talents: [], lineup: ['warrior'], maxSpeed: 2, onRunStart() {}, onRunEnd: async () => '', onExit() {}, onNext() {} }); dom.frames(2);
  assert.equal(_debug().view.speed, 2); assert.equal(_debug().world.auto, true); assert.ok(_debug().world.log.commands.some(c => c.type === 'auto' && c.on));
  stopGame(); prefs.setPref('speed', 1); prefs.setPref('auto', false);
});

test('every window over the match is a dialog, and the page has the readability rules', () => {
  for (const id of ['pick', 'evoPick', 'voteBox', 'over', 'keysBox']) assert.match(html, new RegExp('id="' + id + '" hidden role="dialog"'), id);
  assert.ok(html.includes('font-size:calc(clamp(13px,1.7vh,16px) * var(--ts))'));
  assert.ok(html.includes('body.rarmarks .itemicon[data-rar]::after') && html.includes('#screen-heroes{overflow:hidden}'));
  assert.ok(html.includes('.itemicon.art{display:inline-block;line-height:0;vertical-align:middle}'), 'item pictures are not pushed down by their hidden letters');
});

test('the end of a match: each of your heroes with its damage, share and kills, then the match in numbers', async () => {
  const { renderSummary } = await import('../js/game/ui.js');
  const hero = (name, dealt, kills, mine = true) => ({ def: { name, color: '#fff', id: 'warrior' }, level: 7, dealt, kills, mine });
  const g = { heroes: [hero('Warrior', 300, 4), hero('Mage', 700, 9), hero('Ally', 999, 50, false)], mine: h => h.mine, kills: 13, bossKills: 1, lives: 18, relics: [{}, {}], legendary: 'plague', gold: 420, tick: 60 * 125 };
  renderSummary(g);
  const [table, facts] = byId.overSummary.children, rows = table.children.slice(1);
  assert.deepEqual(rows.map(r => r.children.slice(1).map(c => c._text)), [['7', '700', '70%', '9'], ['7', '300', '30%', '4']], 'only your heroes, most damage first');
  assert.deepEqual(rows.map(r => r.children[0].children[1]._text), ['Mage', 'Warrior']);
  assert.deepEqual(facts.children.map(s => s._text + s.children[0]._text), ['Kills 13', 'Bosses 1', 'Lives left 18', 'Relics 2', 'Legendary Plague', 'Gold left 420', 'Time 2:05']);
});
