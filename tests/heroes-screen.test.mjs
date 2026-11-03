/* The Heroes screen against a fake page and a fake server: lineup rules, equipping items, saving and undoing a failed save. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const saves = [];
let failNext = false;
mock.module(new URL('../js/services/api.js', import.meta.url).href, { namedExports: {
  getItems: async () => ({ items: [{ id: 'i1', item_type: 'power_charm' }, { id: 'i2', item_type: 'power_charm' }] }),
  saveLoadout: async (lineup, equipment) => { saves.push({ lineup, equipment }); if (failNext) { failNext = false; return { error: 'boom' }; } return { profile: { lineup, equipment } }; }
} });
const { state } = await import('../js/core/state.js');
const screen = (await import('../js/screens/heroes.js')).default;
const { byId } = dom;
const cards = () => byId.hrGrid.children;
const btn = (card, re) => { const find = e => (e.tag === 'button' && re.test(e._text)) ? e : e.children.map(find).find(Boolean); return find(card); };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('shows every playable hero with its lineup state and an item slot', async () => {
  state.profile = { level: 2, lineup: ['warrior', 'ranger', 'mage'], equipment: {} };
  state.items = null;
  await screen.mount();
  assert.equal(cards().length, 3);
  assert.equal(byId.hrCount._text, '3 / 3');
  assert.ok(btn(cards()[0], /^✓ In lineup$/));
  assert.ok(btn(cards()[0], /^Equip Power Charm \(2\)$/), 'two unworn charms to choose from');
});

test('lineup: at most three, at least one, saved after a short pause', async () => {
  btn(cards()[2], /In lineup/).onclick();              /* take the Mage out */
  assert.equal(byId.hrCount._text, '2 / 3');
  btn(cards()[1], /In lineup/).onclick();
  btn(cards()[0], /In lineup/).onclick();              /* would leave nobody */
  assert.equal(byId.hrMsg._text, 'Bring at least one hero.');
  assert.deepEqual(state.profile.lineup, ['warrior']);
  await wait(700);
  assert.deepEqual(saves.at(-1).lineup, ['warrior']);
  btn(cards()[1], /Add to lineup/).onclick(); btn(cards()[2], /Add to lineup/).onclick();
  assert.deepEqual(state.profile.lineup, ['warrior', 'ranger', 'mage']);
});

test('equipping uses a free item each time, and the same item is never worn twice', async () => {
  btn(cards()[0], /^Equip Power Charm/).onclick();
  assert.equal(state.profile.equipment.warrior, 'i1');
  btn(cards()[1], /^Equip Power Charm \(1\)$/).onclick();
  assert.equal(state.profile.equipment.ranger, 'i2');
  assert.equal(btn(cards()[2], /^Equip/), undefined, 'no charms left for the Mage');
  btn(cards()[0], /^Remove$/).onclick();
  assert.equal(state.profile.equipment.warrior, undefined);
  await wait(700);
  assert.deepEqual(saves.at(-1).equipment, { ranger: 'i2' });
});

test('a failed save puts back the last saved loadout and says why', async () => {
  failNext = true;
  btn(cards()[0], /^Equip Power Charm/).onclick();
  await wait(700);
  assert.deepEqual(state.profile.equipment, { ranger: 'i2' });
  assert.match(byId.hrMsg._text, /^Could not save: boom/);
  screen.unmount();
});
