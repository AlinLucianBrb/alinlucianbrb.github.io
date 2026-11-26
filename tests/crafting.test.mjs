/* Disenchanting and crafting: the rules (js/content/crafting.js), the server's functions, and the Inventory's two tabs against
   a fake page and a fake server. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom(), calls = [];
let fail = '';
mock.module(new URL('../js/services/api.js', import.meta.url).href, { namedExports: {
  getGems: async () => ({ gems: [] }), craftGem: async () => ({}), combineGems: async () => ({}), socketGem: async () => ({ gems: [] }),
  getItems: async () => ({ items: [] }), sellItem: async () => ({}), saveLoadout: async () => ({}), rerollDrop: async () => ({}),
  disenchantItems: async ids => { calls.push(['disenchant', ids]); return fail ? { error: fail } : { profile: { materials: [3 * ids.length, 0, 0, 0] } }; },
  convertMaterial: async (r, n) => { calls.push(['convert', r, n]); return { profile: { materials: [1, n, 0, 0] } }; },
  craftItem: async (r, slot, kind) => { calls.push(['craft', r, slot, kind]); return fail ? { error: fail } : { profile: { materials: [0, 0, 0, 0], gold: 75 }, item: { id: 'new', item_type: 'great_helm', rarity: r, bonuses: ['Whetstone'], bonus_ranks: [2], ilvl: 15 } }; }
} });
const { MATERIALS, CRAFT, KINDS, SLOTS, craftType, craftLevel, craftProblem, cleanMaterials, kindName } = await import('../js/content/crafting.js');
const { ITEMS, SELL } = await import('../js/content/items.js');
const { RARITIES } = await import('../js/content/data.js');
const { UNLOCKS, isUnlocked } = await import('../js/content/unlocks.js');
const { state } = await import('../js/core/state.js');
const { byId } = dom;
const inventory = (await import('../js/screens/inventory.js')).default;
const tabBtn = id => Object.assign(document.createElement('button'), { dataset: { tab: id } });
document.getElementById('invTabs').children.push(tabBtn('items'), tabBtn('craft'));
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const btns = (root, re) => findAll(root, e => e.tag === 'button' && re.test(e._text));
const texts = root => findAll(root, e => !!e._text).map(e => e._text).join(' | ');
const tick = () => new Promise(r => setTimeout(r, 0));
const item = (id, rarity, type = 'helm') => ({ id, item_type: type, rarity, bonuses: ['Keen edge'], bonus_ranks: [1], ilvl: 10 });

test('one material per rarity; crafting and breaking down again always loses, as does converting up', () => {
  assert.equal(MATERIALS.length, RARITIES.length); assert.equal(CRAFT.gold.length, RARITIES.length);
  assert.ok(CRAFT.yields < CRAFT.cost); assert.ok(CRAFT.convert > 1);
  assert.deepEqual([...CRAFT.gold].sort((a, b) => a - b), CRAFT.gold, 'rarer costs more');
  assert.deepEqual(cleanMaterials(undefined), [0, 0, 0, 0]); assert.deepEqual(cleanMaterials([1, '2', -3]), [1, 2, 0, 0]);
  /* crafting to sell: an item with its fewest bonuses at rank 1 sells for less than its gold alone */
  for (let r = 0; r < 4; r++) assert.ok(SELL.base[r] + SELL.perRank * (r + 1) < CRAFT.gold[r], RARITIES[r].name);
});

test('every slot and kind has exactly one item type; the item level follows the highest level beaten', () => {
  for (const s of SLOTS) for (const k of KINDS) {
    assert.equal(Object.keys(ITEMS).filter(id => ITEMS[id].slot === s && (ITEMS[id].affinity || null) === k).length, 1, s + ' ' + kindName(k));
    assert.equal(ITEMS[craftType(s, k)].slot, s);
  }
  assert.deepEqual([0, 5, 25].map(craftLevel), [1, 15, 75]);
});

test('why an item cannot be crafted', () => {
  const p = { materials: [9, 8, 0, 0], gold: 80 };
  assert.equal(craftProblem(p, 0, 0, 200), ''); assert.match(craftProblem(p, 1, 0, 200), /Needs 9 Dust \(you have 8\)/);
  assert.match(craftProblem({ ...p, gold: 24 }, 0, 0, 200), /Needs 25 gold/); assert.match(craftProblem(p, 0, 200, 200), /full/);
});

test('the server does the same: rules from crafting.js, unlocked in act 2, one roll for drops and crafting, players cannot call the helpers', () => {
  assert.equal(UNLOCKS.crafting.act, 2); assert.ok(isUnlocked('crafting', 5) && !isUnlocked('crafting', 4));
  for (const f of ['supabase-setup.sql', 'supabase-update.sql']) {
    const sql = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const [fn, v] of [['rule_disenchant_yield()', CRAFT.yields], ['rule_convert_cost()', CRAFT.convert], ['rule_craft_cost()', CRAFT.cost]])
      assert.ok(sql.includes('function public.' + fn + ' returns int\nlanguage sql immutable set search_path = public as $$ select ' + v + ' $$'), f + ' ' + fn);
    assert.ok(sql.includes('(array[' + CRAFT.gold.join(', ') + '])[p_rarity + 1]'), f + ' gold');
    assert.ok(sql.includes("materials int[] not null default '{0,0,0,0}'"), f + ' column');
    assert.equal(sql.match(/insert into public\.player_items \(/g).length, 1, f + ': items are made in one place');
    assert.equal(sql.match(/public\.roll_item\(auth\.uid\(\)/g).length, 3, f + ': drops, crafting and the Hoard reroll');
    for (const fn of ['disenchant_items(uuid[])', 'convert_material(int, int)', 'craft_item(int, text, text)']) {
      assert.ok(sql.includes('revoke all on function public.' + fn + ' from public, anon, authenticated;'), f); assert.ok(sql.includes('grant execute on function public.' + fn + ' to authenticated;'), f);
    }
    for (const fn of ['roll_item(uuid, text, text, int, int, numeric)', 'require_unlock(text, int)', 'rule_craft_cost()', 'rule_item_level(int)']) {
      assert.ok(sql.includes('revoke all on function public.' + fn + ' from public, anon, authenticated;'), f + ' ' + fn);
      assert.ok(!sql.includes('grant execute on function public.' + fn), f + ' ' + fn);
    }
    for (const fn of ['disenchant_items', 'convert_material', 'craft_item']) {
      const body = sql.slice(sql.indexOf('function public.' + fn + '('), sql.indexOf('$$;', sql.indexOf('function public.' + fn + '(')));
      assert.match(body, /if auth\.uid\(\) is null/, fn); assert.match(body, /require_unlock\('crafting', me\.levels_cleared\)/, fn); assert.match(body, /for update/, fn);
    }
  }
  /* the profile is loaded with its materials and paths, and still loads from a database without the column */
  const api = readFileSync(new URL('../js/services/api.js', import.meta.url), 'utf8');
  assert.match(api, /equipment,paths,materials'\)/); assert.match(api, /equipment,paths'\)/);
});

test('Items tab before act 2: selling only', async () => {
  state.profile = { levels_cleared: 4, gold: 0, equipment: {}, materials: [0, 0, 0, 0] }; state.items = [item('a', 0)];
  await inventory.mount(null, {});
  assert.match(texts(byId.invSell), /Disenchanting unlocks in Act 2/);
  byId.invGrid.children[0].onclick();
  assert.equal(btns(byId.invSell, /Sell/).length, 1); assert.equal(btns(byId.invSell, /Disenchant/).length, 0);
  byId.invTabs.children[1].onclick();
  assert.equal(byId.invCraft.hidden, false); assert.equal(byId.invItems.hidden, true); assert.match(texts(byId.invCraft), /Crafting unlocks in Act 2/);
});

test('disenchanting: one item, or every unworn one of a rarity, each after a second click; a refusal keeps the items', async () => {
  state.profile = { levels_cleared: 5, gold: 0, equipment: { warrior: { helm: 'worn' } }, materials: [0, 0, 0, 0] };
  state.items = [item('worn', 0), item('a', 0), item('b', 0), item('r', 2)];
  await inventory.mount(null, {});
  const all = () => btns(byId.invSell, /^(Common|Uncommon|Rare|Epic) \(|^Click again/);
  assert.deepEqual(all().map(b => b._text), ['Common (2)', 'Uncommon (0)', 'Rare (1)', 'Epic (0)'], 'the worn one is not counted');
  assert.equal(all()[1].disabled, true);
  all()[0].onclick(); assert.match(all()[0]._text, /Click again: 2 for 6 Scrap/); assert.equal(calls.length, 0);
  fail = 'boom'; all()[0].onclick(); await tick();
  assert.match(byId.invMsg._text, /Could not disenchant: boom/); assert.equal(state.items.length, 4);
  fail = ''; all()[0].onclick(); all()[0].onclick(); await tick();
  assert.deepEqual(calls.at(-1), ['disenchant', ['a', 'b']]); assert.deepEqual(state.items.map(i => i.id), ['worn', 'r']);
  assert.deepEqual(state.profile.materials, [6, 0, 0, 0]); assert.match(byId.invMsg._text, /Disenchanted 2 items into 6 Scrap/);
  byId.invGrid.children[0].onclick();   /* the worn one */
  assert.equal(btns(byId.invSell, /Disenchant for/).length, 0); assert.equal(btns(byId.invSell, /Worn/)[0].disabled, true);
  byId.invGrid.children[1].onclick();
  btns(byId.invSell, /Disenchant for 3 Essence/)[0].onclick(); btns(byId.invSell, /Click again to disenchant/)[0].onclick(); await tick();
  assert.deepEqual(calls.at(-1), ['disenchant', ['r']]);
});

test('Crafting tab: convert, choose, craft, and see what came out', async () => {
  state.profile = { levels_cleared: 5, gold: 100, equipment: {}, materials: [12, 0, 0, 0] }; state.items = [];
  await inventory.mount(null, { tab: 'craft' });
  const box = byId.invCraft, conv = () => findAll(box, e => e.className === 'convert');
  assert.deepEqual(conv().map(b => [b._text, b.disabled]), [['5 → 1 Dust', false], ['All', false], ['5 → 1 Essence', true], ['All', true], ['5 → 1 Core', true], ['All', true]]);
  conv()[1].onclick(); await tick();
  assert.deepEqual(calls.at(-1), ['convert', 0, 2]); assert.deepEqual(state.profile.materials, [1, 2, 0, 0]);
  state.profile.materials = [9, 0, 0, 0]; await inventory.mount(null, { tab: 'craft' });
  btns(box, /^Melee$/)[0].onclick(); assert.match(texts(box), /Common Great Helm/); assert.match(texts(box), /Item level 15 · 1\+ bonuses/);
  btns(box, /^Rare$/)[0].onclick(); assert.equal(btns(box, /^Craft$/)[0].disabled, true); assert.match(texts(box), /Needs 9 Essence \(you have 0\)/);
  btns(box, /^Common$/)[0].onclick(); fail = 'not enough gold'; btns(box, /^Craft$/)[0].onclick(); await tick();
  assert.match(byId.invMsg._text, /Could not craft: not enough gold/); assert.equal(state.items.length, 0);
  fail = ''; btns(box, /^Craft$/)[0].onclick(); await tick();
  assert.deepEqual(calls.at(-1), ['craft', 0, 'helm', 'melee']);
  assert.deepEqual(state.items.map(i => i.id), ['new']); assert.equal(state.profile.gold, 75); assert.match(texts(box), /You made/); assert.match(byId.invMsg._text, /Made: Common Great Helm/);
  assert.equal(btns(box, /^Craft$/)[0].disabled, true, 'nothing left to craft with');
});

test('Inventory: sort and filter, a page of 40 at a time, and New on items that came since the last visit', async () => {
  const { shownItems, PAGE, isNew } = await import('../js/screens/inventory.js');
  const at = d => '2026-11-' + String(d).padStart(2, '0') + 'T00:00:00Z';
  const list = [{ id: 'a', item_type: 'boots', rarity: 0, ilvl: 50, created_at: at(1) }, { id: 'b', item_type: 'great_helm', rarity: 3, ilvl: 5, created_at: at(2) }, { id: 'c', item_type: 'boots', rarity: 2, ilvl: 20, created_at: at(3) }];
  const ids = how => shownItems([...list], { sort: 'best', slot: 'all', rarity: 'all', ...how }).map(i => i.id).join('');
  assert.equal(ids({}), 'bca'); assert.equal(ids({ sort: 'newest' }), 'cba'); assert.equal(ids({ sort: 'level' }), 'acb'); assert.equal(ids({ sort: 'slot' }), 'bca');
  assert.equal(ids({ slot: 'boots' }), 'ca'); assert.equal(ids({ rarity: '2' }), 'c'); assert.equal(ids({ slot: 'legs' }), '');
  assert.equal(isNew(list[2], at(2)), true); assert.equal(isNew(list[1], at(2)), false); assert.equal(isNew(list[2], ''), false, 'a first visit: nothing new');
  const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  state.profile = { id: 'u9', levels_cleared: 0, gold: 0, materials: [0, 0, 0, 0], equipment: {} };
  state.items = Array.from({ length: 95 }, (_, k) => ({ id: 'i' + k, item_type: k % 2 ? 'boots' : 'helm', rarity: k % 4, bonuses: [], bonus_ranks: [], ilvl: k, created_at: at(1 + (k % 20)) }));
  byId.invTabs.children = [tabBtn('items'), tabBtn('craft')];
  await inventory.mount(null, {}); await tick();
  const grid = () => byId.invGrid.children, full = () => grid().filter(c => c.className.includes('full')).length;
  assert.equal(grid().length, PAGE); assert.equal(full(), 40);
  const pager = () => byId.invPager.children; assert.equal(pager()[1]._text, 'Page 1 / 3');
  pager()[2].onclick(); assert.equal(pager()[1]._text, 'Page 2 / 3'); pager()[2].onclick(); assert.equal(full(), 15, 'the last page'); assert.equal(pager()[2].disabled, true);
  const slotPick = byId.invTools.children[1].children[1]; slotPick.value = 'boots'; slotPick.onchange();
  assert.equal(pager()[2]._text, 'Page 1 / 2', 'a filter goes back to page 1'); assert.equal(pager()[0]._text, '47 of 95', 'filtered: how many'); 
  assert.ok(grid().every(c => !c.children.some(x => x.className === 'newmark')), 'first visit: nothing new');
  inventory.unmount(); assert.equal(store['tbd.invSeen.u9'], at(20));
  state.items.push({ id: 'fresh', item_type: 'boots', rarity: 3, bonuses: [], bonus_ranks: [], ilvl: 99, created_at: at(25) });
  await inventory.mount(null, {}); await tick();
  const marked = grid().filter(c => c.children.some(x => x.className === 'newmark'));
  assert.equal(marked.length, 1); assert.match(marked[0].attrs['aria-label'], /, new$/);
  inventory.unmount(); delete globalThis.localStorage;
});
