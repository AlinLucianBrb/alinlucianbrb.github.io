/* The Heroes, Inventory and level screens against a fake page and a fake server: hero pages with Information and
   Evolutions tabs, equipping items, the inventory grid, and choosing heroes after picking a level. */
import { HEROES } from '../js/content/data.js';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const saves = [], navs = [], sold = [], pathSaves = [];
let failNext = false;
mock.module(new URL('../js/services/api.js', import.meta.url).href, { namedExports: {
  getItems: async () => ({ items: [
    { id: 'i1', item_type: 'power_charm', rarity: 0, bonuses: [] },
    { id: 'i2', item_type: 'helm', rarity: 2, bonuses: ['Sharpened rounds', 'Whetstone', 'Prospector'] },
    { id: 'i3', item_type: 'helm', rarity: 0, bonuses: ['Long barrels'] }] }),
  savePaths: async paths => { pathSaves.push(paths); return { profile: { paths } }; },
  sellItem: async id => { sold.push(id); return { profile: { gold: 500 + sold.length } }; },
  saveLoadout: async (lineup, equipment) => { saves.push({ lineup, equipment }); if (failNext) { failNext = false; return { error: 'boom' }; } return { profile: { lineup, equipment } }; }
} });
const { state } = await import('../js/core/state.js');
const { bus } = await import('../js/core/bus.js');
bus.on('nav', n => navs.push(n));
const heroes = (await import('../js/screens/heroes.js')).default;
const inventory = (await import('../js/screens/inventory.js')).default;
const levels = (await import('../js/screens/levels.js')).default;
const { byId } = dom;
/* The fake page has no markup, so give the two tab buttons the screen expects. */
const tabBtn = id => Object.assign(document.createElement('button'), { dataset: { tab: id } });
document.getElementById('hrTabs').children.push(tabBtn('info'), tabBtn('evo'));
const find = (root, pred) => (pred(root) ? root : root.children.map(c => find(c, pred)).find(Boolean));
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const btn = (root, re) => find(root, e => e.tag === 'button' && re.test(e._text));
const texts = root => findAll(root, e => !!e._text).map(e => e._text);
const wait = ms => new Promise(r => setTimeout(r, ms));

test('Heroes: one card per playable hero; clicking opens its page on the Information tab', async () => {
  state.profile = { level: 2, lineup: ['warrior', 'ranger', 'mage'], equipment: {} };
  state.items = null;
  await heroes.mount(null, {});
  assert.equal(byId.hrGrid.children.length, HEROES.length, 'one card per playable hero');
  assert.equal(byId.hrPage.hidden, true);
  assert.ok(texts(byId.hrGrid.children[0]).includes('Melee · Strength'));
  byId.hrGrid.children[0].onclick();
  assert.equal(byId.hrPage.hidden, false); assert.equal(byId.hrList.hidden, true); assert.equal(byId.hrTitle._text, 'Warrior');
  assert.equal(byId.hrTabs.children[0]._cls.has('on'), true);
  const [gear, pic, stats] = byId.hrBody.children;
  assert.equal(gear.children[0]._text, 'Gear'); assert.ok(pic.children[0].children.some(c => c.tag === 'img' && /assets\/hero_\w+\.png$/.test(c.src)), 'the hero\'s sprite'); assert.equal(stats.children[0]._text, 'Stats');
  const st = texts(stats);
  assert.ok(st.includes('Strength (main)') && st.includes('Dexterity') && st.includes('Intellect'), 'the three attributes');
  assert.ok(st.includes('23.1–38.5'), 'damage 28 +10% from 10 strength, as min–max (±25%)');
  assert.ok(st.includes('+10% from Strength'));
});

/* The gear column: one box per slot, in SLOTS order. */
const slotBox = slot => byId.hrBody.children[0].children[1 + ['helm', 'body', 'legs', 'boots', 'trinket'].indexOf(slot)];
const iconBtns = box => findAll(box, e => e.className === 'iconbtn');

test('Information: five gear slots; an empty slot offers the free items that fit, best first; equipping shows its bonuses and stats', async () => {
  assert.deepEqual(byId.hrBody.children[0].children.slice(1).map(b => b.children[0]._text), ['Helm', 'Body armour', 'Legs', 'Boots', 'Trinket']);
  assert.equal(iconBtns(slotBox('helm')).length, 2, 'two helms to choose from');
  assert.equal(iconBtns(slotBox('body')).length, 0); assert.ok(texts(slotBox('body')).includes('Empty: no free item for this slot'));
  iconBtns(slotBox('helm'))[0].onclick();                /* the Rare helm comes first */
  assert.deepEqual(state.profile.equipment, { warrior: { helm: 'i2' } });
  const helm = slotBox('helm');
  assert.ok(texts(helm).includes('Rare Helm')); assert.ok(btn(helm, /^Remove$/));
  assert.ok(texts(helm).includes('+11.25% damage (all heroes)  · rank 3') && texts(helm).includes('+13.5% damage to melee heroes  · rank 3'), 'its bonuses: an item from before ranks counts them at its rarity (Rare: rank 3)');
  assert.ok(texts(byId.hrBody).includes('Stats (with gear)'));
  const avg = 28 * (1 + 0.1 + 0.1125 + 0.135), mm = +(avg * 0.75).toFixed(2) + '–' + +(avg * 1.25).toFixed(2);
  assert.ok(texts(byId.hrBody).includes(mm), 'strength, Sharpened rounds and Whetstone add up');
  iconBtns(slotBox('trinket'))[0].onclick();
  assert.deepEqual(state.profile.equipment, { warrior: { helm: 'i2', trinket: 'i1' } });
  await wait(700);
  assert.deepEqual(saves.at(-1), { lineup: ['warrior', 'ranger', 'mage'], equipment: { warrior: { helm: 'i2', trinket: 'i1' } } });
  byId.hrBack.onclick();                                 /* back to the list */
  assert.equal(byId.hrPage.hidden, true);
  assert.ok(texts(byId.hrGrid.children[0]).includes('Gear 2 / 5'));
  byId.hrGrid.children[1].onclick();
  assert.equal(iconBtns(slotBox('helm')).length, 1, 'one helm left for the Ranger'); assert.equal(iconBtns(slotBox('trinket')).length, 0);
});

test('Evolutions tab: the base hero, then its three forms', () => {
  byId.hrTabs.children[1].onclick();
  const tree = byId.hrBody.children[0];
  assert.equal(tree.className, 'evotree');
  assert.equal(tree.children[0].children[0]._text, 'Hunter');
  assert.equal(tree.children[1]._text, 'Level 10 · 500 gold · choose one now (a path) or in the match');
  assert.deepEqual(tree.children[2].children.map(n => n.children[0]._text), ['Ranger', 'Boomerang', 'Poacher']);
  assert.ok(texts(tree).some(t => /^Ultimate: /.test(t)));
  assert.ok(texts(tree).some(t => /^Before level 10: Every 5th arrow pierces/.test(t)), 'each form says what its preview does');
});

test('choosing a path on the Evolutions tab saves it; clicking it again clears it', async () => {
  const tree = () => byId.hrBody.children[0], btn = i => find(tree().children[2].children[i], n => n.className === 'pathbtn');
  btn(2).onclick(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(pathSaves.at(-1), { ranger: 'hunter' }); assert.deepEqual(state.profile.paths, { ranger: 'hunter' });
  assert.match(btn(2)._text, /Chosen path/); assert.ok(tree().children[2].children[2]._cls.has('chosen'));
  btn(2).onclick(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(pathSaves.at(-1), {}); assert.deepEqual(state.profile.paths, {});
});

test('a failed save puts back the last saved equipment and says why', async () => {
  byId.hrTabs.children[0].onclick();
  failNext = true;
  iconBtns(slotBox('helm'))[0].onclick();
  await wait(700);
  assert.deepEqual(state.profile.equipment, { warrior: { helm: 'i2', trinket: 'i1' } });
  assert.match(byId.hrMsg._text, /^Could not save: boom/);
  heroes.unmount();
});

test('Inventory: every item as an icon on a grid, with a tooltip saying what it does and who wears it', async () => {
  await inventory.mount();
  assert.equal(byId.invCount._text, '3 / 200');
  assert.equal(byId.invGrid.children.length, 40, 'an 8 x 5 grid, empty cells included');
  const full = byId.invGrid.children.filter(c => c.className.includes('full'));
  assert.equal(full.length, 3);
  assert.equal(full[0].children[0].className, 'itemicon'); assert.equal(full[0].children[0]._text, 'H', 'placeholder icon: initials');
  assert.equal(full[0].children[0].style['--rc'], '#5aa9ff', 'framed in the rarity colour (Rare)');
  assert.ok(full[0]._cls.has('worn') && full[1]._cls.has('worn') && !full[2]._cls.has('worn'), 'worn items first, marked');
  full[0].fire('pointerenter', { clientX: 5, clientY: 5 });
  let tip = dom.made.filter(e => e.className === 'tip').at(-1);
  assert.deepEqual(tip.children.map(c => c._text), ['Rare Helm', 'Helm', '+11.25% damage (all heroes)  · rank 3', '+13.5% damage to melee heroes  · rank 3',
    'Prospector: no longer works on gear', 'Equipped on the Warrior', 'Sells for 85 gold (click to select)'], 'each bonus with its rank; gold bonuses no longer work on gear; the sell price');
  assert.equal(tip.children[2].style.color, '#5aa9ff', 'a rank 3 bonus in the rank colour (blue)');
  full[2].fire('pointerenter', { clientX: 5, clientY: 5 });
  tip = dom.made.filter(e => e.className === 'tip').at(-1);
  assert.equal(tip.children.at(-2)._text, 'Not equipped');
  /* selling: click to select, then Sell, then again to confirm; worn items cannot be sold */
  full[0].onclick();
  let sellBtn = byId.invSell.children.find(c => c.tag === 'button');
  assert.equal(sellBtn._text, 'Worn: take it off first'); assert.equal(sellBtn.disabled, true);
  full[2].onclick();
  sellBtn = byId.invSell.children.find(c => c.tag === 'button');
  assert.match(sellBtn._text, /^Sell for \d+ gold$/);
  const count = state.items.length;
  sellBtn.onclick();
  sellBtn = byId.invSell.children.find(c => c.tag === 'button');
  assert.match(sellBtn._text, /^Click again to sell/, 'asks to confirm');
  sellBtn.onclick(); await new Promise(r => setTimeout(r, 0));
  assert.equal(sold.length, 1); assert.equal(state.items.length, count - 1, 'the item is gone');
  assert.equal(state.profile.gold, 501, 'gold from the server');
  assert.match(byId.invMsg._text, /^Sold .* for \d+ gold\. Gold: 501$/);
  assert.equal(byId.invEmpty.hidden, true);
});

test('Levels: picking a level asks for the heroes (none picked to start, 1 to 3 to play), then Start saves the lineup and opens the match', async () => {
  state.profile = { ...state.profile, levels_cleared: 1, frontier_wave: 0, lineup: ['warrior', 'ranger', 'mage'] };
  await levels.mount(null, {});
  assert.equal(byId.lvChoose.hidden, false); assert.equal(byId.lvPick.hidden, true);
  assert.equal(byId.lvList.children[2].disabled, true, 'level 3 is locked');
  byId.lvList.children[1].onclick();
  assert.equal(byId.lvPick.hidden, false); assert.equal(byId.lvPickTitle._text, 'Level 2: choose your heroes');
  assert.equal(byId.lvCount._text, '0 / 3', 'none picked to start with'); assert.equal(byId.lvStart.disabled, true, 'Start waits for a hero');
  const cards = () => byId.lvHeroes.children;
  cards()[0].onclick(); cards()[2].onclick();
  assert.equal(byId.lvCount._text, '2 / 3'); assert.equal(byId.lvStart.disabled, false);
  cards()[0].onclick(); cards()[2].onclick();             /* deselect both: allowed */
  assert.equal(byId.lvCount._text, '0 / 3'); assert.equal(byId.lvStart.disabled, true);
  cards()[0].onclick(); cards()[2].onclick();
  assert.equal(find(cards()[2], e => e.className === 'pickmark')._text, '✓ 2', 'shows the order they were picked in');
  navs.length = 0;
  await byId.lvStart.onclick();
  assert.deepEqual(saves.at(-1).lineup, ['warrior', 'mage']);
  assert.deepEqual(navs, [{ to: 'play', params: { stage: 2 } }]);
  assert.deepEqual(state.profile.lineup, ['warrior', 'mage']);
});

test('Levels: "Next level" after a win comes straight to choosing heroes; Back returns to the level list', async () => {
  await levels.mount(null, { stage: 2 });
  assert.equal(byId.lvPick.hidden, false); assert.equal(byId.lvPickTitle._text, 'Level 2: choose your heroes');
  byId.lvBack.onclick();
  assert.equal(byId.lvChoose.hidden, false);
  failNext = true; navs.length = 0;
  byId.lvList.children[0].onclick(); byId.lvHeroes.children[0].onclick(); await byId.lvStart.onclick();
  assert.match(byId.lvMsg._text, /^Could not save your lineup: boom/, 'a refused save does not start the match');
  assert.deepEqual(navs, []);
});

test('an older profile ({ hero: itemId }) still works: the item becomes that hero\'s trinket', async () => {
  const { equipment, wornItems } = await import('../js/screens/loadout.js');
  state.profile.equipment = { mage: 'i1' };
  assert.deepEqual(equipment(), { mage: { trinket: 'i1' } });
  assert.deepEqual(wornItems(), { mage: [{ type: 'power_charm', rarity: 0, bonuses: [], ranks: [] }] });
});
