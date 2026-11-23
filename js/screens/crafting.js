/* The Inventory's Crafting tab: the materials (and turning 5 of one into 1 of the next), then the item to make: rarity, slot and
   kind, with its price and a Craft button, and the last item made. The rules are js/content/crafting.js. */
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { convertMaterial, craftItem } from '../services/api.js';
import { RARITIES } from '../content/data.js';
import { SLOT_LABEL, itemName, itemColor, ROLL } from '../content/items.js';
import { MATERIALS, CRAFT, KINDS, SLOTS, kindName, craftType, craftLevel, cleanMaterials, craftProblem } from '../content/crafting.js';
import { UNLOCKS } from '../content/unlocks.js';
import { spriteImg } from '../game/sprites.js';
import { el, items, itemIcon, itemTip, sqlHint } from './loadout.js';

let want = { rarity: 0, slot: SLOTS[0], kind: null }, made = null, busy = false;
export function resetCrafting() { made = null; busy = false; }

/* ctx: { open (unlocked), max (items a player can hold), say(text), changed() (draw again) } */
export function renderCrafting(box, ctx) {
  box.textContent = '';
  if (!ctx.open) { box.append(el('p', 'muted craftlock', 'Crafting unlocks in Act ' + UNLOCKS.crafting.act + '. Break items down into materials, and make new ones from them.')); return; }
  const p = state.profile, have = cleanMaterials(p.materials);

  const mats = el('div', 'mats');
  MATERIALS.forEach((m, i) => {
    const tile = el('div', 'mat'), head = el('div', 'mathead');
    tile.style.setProperty?.('--rc', RARITIES[i].color);
    head.append(spriteImg(m.icon, 'pix maticon'), el('b', '', String(have[i])), el('span', '', m.name));
    tile.append(head);
    if (i < MATERIALS.length - 1) {
      const next = MATERIALS[i + 1].name, times = Math.floor(have[i] / CRAFT.convert), row = el('div', 'matrow');
      const one = el('button', 'convert', CRAFT.convert + ' → 1 ' + next), all = el('button', 'convert', 'All');
      one.disabled = busy || times < 1; one.onclick = () => convert(i, 1, ctx);
      all.disabled = busy || times < 2; all.onclick = () => convert(i, times, ctx);
      row.append(one, all); tile.append(row);
    }
    bindTip(tile, () => ({ title: m.name, color: RARITIES[i].color, lines: ['From disenchanting ' + RARITIES[i].name + ' items: ' + CRAFT.yields + ' each.', CRAFT.cost + ' of them make one ' + RARITIES[i].name + ' item.'] }));
    mats.append(tile);
  });
  box.append(mats);

  const form = el('div', 'craftform'), pick = el('div', 'craftpick');
  const row = (label, list, key, text) => {
    const r = el('div', 'craftrow'); r.append(el('span', 'muted', label));
    for (const v of list) {
      const b = el('button', 'craftopt' + (want[key] === v ? ' on' : ''), text(v));
      if (key === 'rarity') b.style.setProperty?.('--rc', RARITIES[v].color);
      b.onclick = () => { want = { ...want, [key]: v }; ctx.changed(); };
      r.append(b);
    }
    pick.append(r);
  };
  row('Rarity', RARITIES.map((_, i) => i), 'rarity', i => RARITIES[i].name);
  row('Slot', SLOTS, 'slot', s => SLOT_LABEL[s]);
  row('Kind', KINDS, 'kind', kindName);
  const g = ROLL.guaranteed(want.rarity);
  pick.append(el('p', 'muted craftnote', 'Item level ' + craftLevel(p.levels_cleared) + ' · ' + (g >= ROLL.maxBonuses ? g : g + '+') + ' bonuses'));
  form.append(pick);

  const card = el('div', 'craftcard'), preview = { item_type: craftType(want.slot, want.kind), rarity: want.rarity, bonuses: [], bonus_ranks: [] };
  const name = el('b', '', itemName(preview)), cost = el('div', 'craftcost'), problem = craftProblem(p, want.rarity, items().length, ctx.max);
  name.style.color = itemColor(preview);
  cost.append(spriteImg(MATERIALS[want.rarity].icon, 'pix maticon'), el('span', '', CRAFT.cost + ' ' + MATERIALS[want.rarity].name), spriteImg('icon_gold', 'pix maticon'), el('span', '', String(CRAFT.gold[want.rarity])));
  const go = el('button', 'craftgo', 'Craft');
  go.disabled = busy || !!problem; go.onclick = () => craft(ctx);
  card.append(itemIcon(preview), name, cost, go, el('small', 'muted craftwhy', problem));
  form.append(card);

  const last = el('div', 'craftcard craftlast');
  if (made) {
    const t = itemTip(made), nm = el('b', '', itemName(made)); nm.style.color = itemColor(made);
    last.append(el('small', 'muted', 'You made'), itemIcon(made), nm);
    for (const l of t.lines.slice(1, -1)) { const s = el('small', '', typeof l === 'string' ? l : l.text); if (l.color) s.style.color = l.color; last.append(s); }
  } else last.append(el('small', 'muted', 'Gold: ' + (p.gold || 0).toLocaleString()));
  form.append(last);
  box.append(form);
}

async function convert(i, times, ctx) {
  busy = true; ctx.changed();
  const { profile, error } = await convertMaterial(i, times);
  busy = false;
  if (error || !profile) ctx.say('Could not convert: ' + (error || 'no connection') + sqlHint(error));
  else { state.profile = { ...state.profile, ...profile }; ctx.say('Turned ' + times * CRAFT.convert + ' ' + MATERIALS[i].name + ' into ' + times + ' ' + MATERIALS[i + 1].name + '.'); }
  ctx.changed();
}
async function craft(ctx) {
  busy = true; ctx.changed();
  const { profile, item, error } = await craftItem(want.rarity, want.slot, want.kind);
  busy = false;
  if (error || !profile || !item) ctx.say('Could not craft: ' + (error || 'no connection') + sqlHint(error));
  else { state.profile = { ...state.profile, ...profile }; state.items = [item, ...items()]; made = item; ctx.say('Made: ' + itemName(item) + '. Gold: ' + profile.gold); }
  ctx.changed();
}
