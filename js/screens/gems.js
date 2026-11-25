/* The Inventory's Gems tab (js/content/gems.js): Rough Stone and the two gem families to craft (each a card with the four
   types it can make, its price and a Craft button), the last gem made, then the gem bag: every gem the player owns, on
   pages. Clicking a gem selects it; selecting three of the same type and rarity lets them combine into one of the next
   rarity. Gems go into items' sockets on the hero pages (Heroes screen); a socketed gem is marked here. */
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { craftGem, combineGems } from '../services/api.js';
import { RARITIES, HEROES } from '../content/data.js';
import { GEM_FAMILIES, FAMILY_IDS, GEM_TYPES, GEM_TYPE_IDS, GEM_CRAFT, SOCKETS, asGem, gemName, gemLine, gemColor, gemIcon, gemRarityColor, gemCraftProblem } from '../content/gems.js';
import { DAMAGE_LABEL } from '../content/combat.js';
import { itemName } from '../content/items.js';
import { UNLOCKS } from '../content/unlocks.js';
import { spriteImg } from '../game/sprites.js';
import { el, gems, itemById, wornBy, sqlHint } from './loadout.js';

const COLS = 12, ROWS = 3, PAGE = COLS * ROWS;
let picked = [], made = null, busy = false, page = 0;
export function resetGems() { picked = []; made = null; busy = false; page = 0; }

/* A gem's icon: its picture (assets/icon_gem_<type>.png) in a frame of its rarity colour, or a diamond in its type's colour. */
export function gemBadge(g, cls = '') {
  const i = asGem(g), b = el('span', 'gemicon' + (cls ? ' ' + cls : ''));
  b.style.setProperty('--gc', gemColor(i.type)); b.style.setProperty('--rc', gemRarityColor(g));
  b.setAttribute('data-rar', 'CURE'[i.rarity] || '');
  const img = spriteImg(gemIcon(i.type), 'pix'); img.onerror = () => { img.remove(); b.classList.remove('art'); };
  b.classList.add('art'); b.append(img);
  return b;
}
/* Where a socketed gem sits: "in the Rare Helm (Warrior)". */
export function gemPlace(g) {
  const it = g.item && itemById(g.item);
  if (!it) return '';
  const who = wornBy(it.id), h = who && HEROES.find(x => x.id === who.hero);
  return 'In the ' + itemName(it) + (h ? ' (' + h.name + ')' : '');
}
export function gemTip(g) {
  const i = asGem(g), lines = [
    { text: DAMAGE_LABEL[i.type] + ' gem · item level ' + i.ilvl, color: '#ab9f8a' },
    { text: gemLine(g), color: gemRarityColor(g) }];
  const at = gemPlace(g);
  lines.push(at ? { text: at, color: '#8be28b' } : { text: 'In the bag: put it in an item’s socket on a hero’s page', color: '#ab9f8a' });
  return { title: gemName(g), color: gemRarityColor(g), lines };
}
const sortKey = g => { const i = asGem(g); return GEM_TYPE_IDS.indexOf(i.type) * 100 + (3 - i.rarity) * 10; };

/* ctx: { open (unlocked), say(text), changed() } */
export function renderGems(box, ctx) {
  box.textContent = '';
  if (!ctx.open) { box.append(el('p', 'muted craftlock', 'Gems unlock in Act ' + UNLOCKS.crafting.act + '. Craft them from Rough Stone and put them in your items’ sockets.')); return; }
  const p = state.profile, bag = gems(), stones = p.stones | 0;

  const top = el('div', 'gemtop');
  const stone = el('div', 'craftcard gemstone'), sh = el('div', 'mathead');
  sh.append(spriteImg('icon_stone', 'pix maticon big'), el('b', '', String(stones)));
  stone.append(sh, el('span', '', 'Rough Stone'), el('small', 'muted', 'From bosses and won levels; more in later acts.'), el('small', 'muted', 'Gold: ' + (p.gold || 0).toLocaleString()));
  bindTip(stone, () => ({ title: 'Rough Stone', color: '#c9b9a0', lines: ['Every boss you kill drops some, and winning a level more (more on later acts).', GEM_CRAFT.stones + ' make one gem.'] }));
  top.append(stone);

  for (const f of FAMILY_IDS) {
    const fam = GEM_FAMILIES[f], card = el('div', 'craftcard gemfam'), kinds = el('div', 'gemkinds');
    for (const t of fam.types) {
      const k = el('span', 'gemkind'); k.append(gemBadge({ type: t, stat: GEM_TYPES[t].stats[0].stat, rarity: 0 }, 'small'), el('small', '', GEM_TYPES[t].name));
      bindTip(k, () => ({ title: GEM_TYPES[t].name + ' (' + DAMAGE_LABEL[t] + ')', color: gemColor(t), lines: ['Rolls one of:', ...GEM_TYPES[t].stats.map(s => '· ' + s.label)] }));
      kinds.append(k);
    }
    const cost = el('div', 'craftcost'), problem = gemCraftProblem(p, bag.length), go = el('button', 'craftgo', 'Craft');
    cost.append(spriteImg('icon_stone', 'pix maticon'), el('span', '', String(GEM_CRAFT.stones)), spriteImg('icon_gold', 'pix maticon'), el('span', '', String(GEM_CRAFT.gold)));
    go.disabled = busy || !!problem; go.onclick = () => craft(f, ctx);
    card.append(el('b', 'gemfamname', fam.name), el('small', 'muted', 'One of these, at random:'), kinds, cost, go, el('small', 'muted craftwhy', problem));
    top.append(card);
  }

  const last = el('div', 'craftcard craftlast');
  if (made) {
    const nm = el('b', '', gemName(made)); nm.style.color = gemRarityColor(made);
    const line = el('small', '', gemLine(made)); line.style.color = gemRarityColor(made);
    last.append(el('small', 'muted', 'You made'), gemBadge(made, 'big'), nm, line);
  } else last.append(el('small', 'muted', 'Three gems of the same type and rarity combine into one of the next rarity.'));
  top.append(last);
  box.append(top);

  /* The bag */
  const list = [...bag].sort((a, b) => sortKey(a) - sortKey(b) || (asGem(b).ilvl - asGem(a).ilvl));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages - 1);
  const head = el('div', 'invhead gemhead'), pager = el('div', 'invpager');
  head.append(el('b', 'gembagname', 'Gem bag ' + bag.length + ' / ' + GEM_CRAFT.max));
  if (pages > 1) {
    const prev = el('button', '', '‹'), next = el('button', '', '›');
    prev.disabled = page === 0; next.disabled = page >= pages - 1;
    prev.onclick = () => { page--; ctx.changed(); }; next.onclick = () => { page++; ctx.changed(); };
    pager.append(prev, el('b', '', 'Page ' + (page + 1) + ' / ' + pages), next);
  }
  head.append(pager); box.append(head);
  const grid = el('div', 'invgrid gemgrid');
  picked = picked.filter(id => bag.some(g => g.id === id));
  const first = picked.length ? asGem(bag.find(g => g.id === picked[0])) : null;
  for (let i = 0; i < PAGE; i++) {
    const g = list[page * PAGE + i], cell = el('div', 'invcell' + (g ? ' full' : ''));
    if (g) {
      const gi = asGem(g), fits = !first || (gi.type === first.type && gi.rarity === first.rarity);
      cell.append(gemBadge(g)); cell.tabIndex = 0; cell.setAttribute('aria-label', gemName(g));
      if (g.item) { cell.classList.add('worn'); cell.append(el('span', 'wornmark', '◆')); }
      if (picked.includes(g.id)) cell.classList.add('picked');
      else if (!fits) cell.classList.add('dim');
      bindTip(cell, () => gemTip(g));
      cell.onclick = () => {
        if (picked.includes(g.id)) picked = picked.filter(x => x !== g.id);
        else if (!fits) picked = [g.id];   /* another kind: start a new pick */
        else if (picked.length < GEM_CRAFT.combine) picked.push(g.id);
        ctx.changed();
      };
      cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); cell.onclick(); } };
    }
    grid.append(cell);
  }
  box.append(grid);

  const bar = el('div', 'invsell gembar');
  if (!bag.length) bar.append(el('span', 'muted', 'No gems yet. Craft one above.'));
  else if (!picked.length) bar.append(el('span', 'muted', 'Pick ' + GEM_CRAFT.combine + ' gems of the same type and rarity to combine them.'));
  else {
    const n = picked.length, epic = first.rarity >= RARITIES.length - 1;
    const next = { type: first.type, rarity: Math.min(RARITIES.length - 1, first.rarity + 1) };
    bar.append(el('span', '', n + ' / ' + GEM_CRAFT.combine + ' ' + RARITIES[first.rarity].name + ' ' + GEM_TYPES[first.type].name + (n > 1 ? 's' : '')));
    const go = el('button', 'go', epic ? 'Epic is the highest' : 'Combine into 1 ' + gemName(next));
    go.disabled = busy || epic || n < GEM_CRAFT.combine; go.onclick = () => combine(ctx);
    const clear = el('button', 'linkbtn', 'Clear'); clear.onclick = () => { picked = []; ctx.changed(); };
    const inSockets = picked.filter(id => (bag.find(g => g.id === id) || {}).item).length;
    bar.append(go, clear);
    if (inSockets) bar.append(el('small', 'muted', inSockets + ' of them ' + (inSockets > 1 ? 'are' : 'is') + ' in an item: combining takes ' + (inSockets > 1 ? 'them' : 'it') + ' out'));
  }
  box.append(bar);
}

async function craft(family, ctx) {
  busy = true; ctx.changed();
  const { profile, gem, error } = await craftGem(family);
  busy = false;
  if (error || !profile || !gem) ctx.say('Could not craft: ' + (error || 'no connection') + sqlHint(error));
  else { state.profile = { ...state.profile, ...profile }; state.gems = [gem, ...gems()]; made = gem; ctx.say('Made: ' + gemName(gem) + ' (' + gemLine(gem) + ').'); }
  ctx.changed();
}
async function combine(ctx) {
  const ids = [...picked];
  busy = true; ctx.changed();
  const { gem, error } = await combineGems(ids);
  busy = false;
  if (error || !gem) ctx.say('Could not combine: ' + (error || 'no connection') + sqlHint(error));
  else { state.gems = [gem, ...gems().filter(g => !ids.includes(g.id))]; picked = []; made = gem; ctx.say('Combined into ' + gemName(gem) + ' (' + gemLine(gem) + ').'); }
  ctx.changed();
}
export { SOCKETS };
