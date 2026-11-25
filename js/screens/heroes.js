/* Heroes screen: every playable hero as a card; click one to open its page, with two tabs.
   - Information: gear slots on the left, the hero's picture in the middle (a placeholder until there is art), stats on the right.
   - Evolutions: the hero's evolution tree, from the base hero to each form it can become. Here the player picks the hero's
     evolution PATH (or none): the form it will become, chosen before the match, so its gear can specialise and the hero
     shows a preview of the form from level 1 (js/content/previews.js). Free to change between matches.
   Equipment and path changes are saved automatically. (The lineup is chosen after picking a level.) */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { HEROES, STAT_LABELS, ATTRIBUTES, ATTRIBUTE_EFFECTS, EVOLVE_LEVEL, evolvedDef } from '../content/data.js';
import { SLOTS, SLOT_LABEL, itemMods, itemName, itemColor, itemBonusLines } from '../content/items.js';
import { DAMAGE_LABEL } from '../content/combat.js';
import { ULTIMATES, ultDesc } from '../engine/ultimates.js';
import { liveText, liveParts, CHANGED_COLOR } from '../content/live-text.js';
import { heroStats, attributeDamage } from '../engine/stats.js';
import { spriteImg, heroPortrait, heroFrame, heroAbilities, heroBand } from '../game/sprites.js';
import { PREVIEWS } from '../content/previews.js';
import { pathChoice, pathDef } from '../engine/preview.js';
import { savePaths } from '../services/api.js';
import { UNLOCKS } from '../content/unlocks.js';
import { UPGRADES, UPGRADE_LEVEL, SLOT_NAME } from '../content/upgrades.js';
import { ringLine, setsUpText, passiveSetup } from '../content/synergies.js';
import { el, cap, items, itemById, equipment, gearOf, setGear, freeFor, wornItems, gearCount, ensureItems, saveNow, sqlHint, itemIcon, itemTip, activePaths, pathsUnlocked, gems, gemsIn } from './loadout.js';
import { gemBadge, gemTip } from './gems.js';
import { socketGem } from '../services/api.js';
import { SOCKETS, gemName, gemLine, gemRarityColor, asGem } from '../content/gems.js';

const $ = id => document.getElementById(id);
const f = x => +x.toFixed(2);
let bound = false, hero = null, tab = 'info', saved = {}, timer = 0, back = null, openSlot = null, openSocket = null, socketBusy = false;   /* openSocket: the socket whose gem chooser is open */   /* openSlot: the gear slot whose item chooser is open */   /* back: where Back goes when opened from elsewhere (choosing heroes for a level) */

const say = (t, bad) => { $('hrMsg').textContent = t || ''; $('hrMsg').classList.toggle('warn', !!bad); };
const copy = x => JSON.parse(JSON.stringify(x));

function changed() {
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 600);
  render();
}
/* Evolution paths: { heroId: formId } on the profile. */
const pathOf = id => { const p = activePaths(); return p[id] ? pathChoice(id, p[id]) : null; };
async function setPath(id, form) {
  const before = { ...(state.profile.paths || {}) }, next = { ...before };
  if (form) next[id] = form; else delete next[id];
  state.profile.paths = next; say('Saving…'); render();
  const { profile, error } = await savePaths(next);
  if (error || !profile) { state.profile.paths = before; say('Could not save the path: ' + (error || 'unknown error') + sqlHint(error), true); render(); return; }
  state.profile.paths = profile.paths || next; say('Saved'); render();
}
/* The hero as it will play: with its path's tags (so gear for the form counts). */
const asPlayed = h => { const c = pathOf(h.id); return c ? pathDef(h, c) : h; };
const wearer = h => () => ({ tags: asPlayed(h).tags, rate: h.rate || 'speed' });

async function flush() {
  clearTimeout(timer); timer = 0;
  const { error } = await saveNow();
  if (error) {
    state.profile.equipment = copy(saved);
    say('Could not save: ' + error + sqlHint(error), true); render(); return;
  }
  saved = copy(equipment()); say('Saved');
}

/* The list of heroes. */
function renderList() {
  const grid = $('hrGrid'); grid.textContent = '';
  for (const h of HEROES) {
    /* like the hero cards in a match: the hero in a frame, the name, and the attack and ultimate icons */
    const card = el('button', 'hcard herolike'), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color);
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    const n = gearCount(h.id), c = pathOf(h.id);
    card.append(heroFrame(h), head, el('small', 'muted', 'Gear ' + n + ' / ' + SLOTS.length), ...(c ? [el('small', 'pathline', 'Path: ' + c.name)] : []), heroAbilities(h));
    card.title = liveText(h.short, null, heroStats(h, []));
    card.onclick = () => { hero = h; tab = 'info'; render(); };
    grid.append(card);
  }
}

/* The item chooser for one gear slot, over the page: every free item that fits the slot (best first) as icons; hover one
   for its stats, click it to equip. Remove takes off what the slot holds. */
function slotChooser(h, slot) {
  const pop = el('div', 'slotpop'), head = el('div', 'slotpophead'), close = el('button', 'linkbtn', 'Close'), cur = itemById(gearOf(h.id)[slot]), free = freeFor(slot);
  head.append(el('b', '', SLOT_LABEL[slot] + (cur ? ': ' + itemName(cur) : ': empty')), close);
  close.onclick = () => { openSlot = null; render(); };
  pop.append(head);
  if (!free.length) pop.append(el('p', 'muted', items().length ? 'No free item for this slot.' : 'Items drop at the end of matches.'));
  else {
    const grid = el('div', 'slotgrid');
    for (const it of free) {
      const b = el('button', 'iconbtn'); b.append(itemIcon(it)); b.setAttribute('aria-label', 'Equip ' + itemName(it));
      bindTip(b, () => { const t = itemTip(it); t.lines.push({ text: 'Click to equip', color: '#f2b84b' }); return t; });
      b.onclick = () => { setGear(h.id, slot, it.id); openSlot = null; changed(); };
      grid.append(b);
    }
    pop.append(grid);
  }
  if (cur) { const off = el('button', 'linkbtn', 'Remove ' + itemName(cur)); off.onclick = () => { setGear(h.id, slot, null); openSlot = null; openSocket = null; changed(); }; pop.append(off); }
  if (cur) pop.append(socketPanel(cur));
  return pop;
}
/* The item's sockets (js/content/gems.js): each holds a gem or is empty. Click one to choose the gem for it from the bag;
   a gem in it can be taken out. Socketing is saved on the server at once. */
function socketPanel(it) {
  const box = el('div', 'sockets'), row = el('div', 'socketrow'), held = gemsIn(it.id);
  box.append(el('b', '', 'Sockets'));
  for (let k = 0; k < SOCKETS; k++) {
    const g = held[k], b = el('button', 'socket' + (openSocket === k ? ' open' : '') + (g ? ' full' : ''));
    if (g) { const nm = el('span', 'sockettxt'), nb = el('b', '', gemName(g)); nb.style.color = gemRarityColor(g); nm.append(nb, el('small', '', gemLine(g))); b.append(gemBadge(g, 'small'), nm); bindTip(b, () => gemTip(g)); }
    else b.append(el('span', 'gemicon small empty'), el('span', 'muted', 'Empty socket'));
    b.onclick = () => { openSocket = openSocket === k ? null : k; render(); };
    row.append(b);
  }
  box.append(row);
  if (openSocket !== null) {
    const g = held[openSocket], free = gems().filter(x => !x.item).sort((a, b) => asGem(b).rarity - asGem(a).rarity || asGem(b).ilvl - asGem(a).ilvl);
    if (g) { const out = el('button', 'linkbtn', 'Take out ' + gemName(g)); out.disabled = socketBusy; out.onclick = () => place(g.id, null, 0); box.append(out); }
    if (!free.length) box.append(el('p', 'muted', gems().length ? 'No free gem in your bag.' : 'Craft gems in the Inventory (Gems tab).'));
    else {
      const grid = el('div', 'slotgrid');
      for (const x of free.slice(0, 24)) {
        const b = el('button', 'iconbtn'); b.append(gemBadge(x)); b.disabled = socketBusy; b.setAttribute('aria-label', 'Socket ' + gemName(x));
        bindTip(b, () => { const t = gemTip(x); t.lines.push({ text: 'Click to put it in this socket', color: '#f2b84b' }); return t; });
        b.onclick = () => place(x.id, it.id, openSocket);
        grid.append(b);
      }
      box.append(grid);
    }
  }
  return box;
}
async function place(gemId, itemId, socket) {
  socketBusy = true; render();
  const { gems: moved, error } = await socketGem(gemId, itemId, socket);
  socketBusy = false;
  if (error) say('Could not move the gem: ' + error + sqlHint(error), true);
  else { const by = new Map(moved.map(g => [g.id, g])); state.gems = gems().map(g => by.get(g.id) || g); openSocket = null; say(''); }
  render();
}

/* A text whose numbers follow the hero's stats (live-text.js), the changed ones in yellow. */
function liveLine(tag, cls, lead, text, s, base) {
  const e = el(tag, cls, ''); if (lead) e.append(el('span', '', lead));
  for (const p of liveParts(text, s, base)) { const sp = el('span', '', p.text); if (p.changed) { sp.style.color = CHANGED_COLOR; sp.classList.add('changed'); } e.append(sp); }
  return e;
}
/* Information tab: gear | picture | stats. */
function renderInfo(box, h) {
  const gear = el('div', 'hgear'), pic = el('div', 'hpic'), stats = el('div', 'hstatbox');
  gear.append(el('h3', '', 'Gear'));
  /* Each slot is one line: its item (icon and name; hover for its stats) or Empty. Click a slot to choose its item. */
  for (const slot of SLOTS) {
    const row = itemById(gearOf(h.id)[slot]), free = freeFor(slot), b = el('button', 'hslot compact' + (openSlot === slot ? ' open' : ''));
    if (row) b.append(itemIcon(row)); else b.append(el('span', 'itemicon emptyslot'));
    const txt = el('span', 'slottxt'), name = el('span', 'itemname' + (row ? '' : ' empty'), row ? itemName(row) : 'Empty');
    if (row) name.style.color = itemColor(row);
    txt.append(el('small', 'muted', SLOT_LABEL[slot]), name, el('small', 'muted', free.length ? free.length + ' free' : row ? '' : 'none'));
    b.append(txt);
    if (row) { const sk = el('span', 'slotgems'); for (const g of gemsIn(row.id)) sk.append(g ? gemBadge(g, 'tiny') : el('span', 'gemicon tiny empty')); b.append(sk); }
    if (row) bindTip(b, () => { const t = itemTip(row); t.lines.push({ text: 'Click to change or remove', color: '#f2b84b' }); return t; });
    b.onclick = () => { openSlot = openSlot === slot ? null : slot; openSocket = null; render(); };
    gear.append(b);
  }
  if (openSlot) box.append(slotChooser(h, openSlot));
  /* The picture: the hero's sprite on a glow in its colour (its initial if the picture cannot load). */
  const art = el('div', 'hart art'), img = spriteImg(heroPortrait(h.id), 'pix');
  art.style.setProperty('--hc', h.color); art.append(el('span', '', h.name[0]), img);
  img.onerror = () => { img.remove(); art.classList.remove('art'); };
  pic.append(art);
  const c = pathOf(h.id);
  if (c) { const pl = el('p', 'hdesc pathline', 'Path: ' + c.name); bindTip(pl, () => ({ title: c.name, lines: ['Before level ' + EVOLVE_LEVEL + ': ' + PREVIEWS[c.id].desc] })); pic.append(pl); }
  art.title = liveText(h.short, null, heroStats(h, []));
  /* Stats, with the equipped items included (gear that does not fit the hero counts as its general version). */
  const worn = wornItems()[h.id], s = heroStats(asPlayed(h), itemMods(worn ? { [h.id]: worn } : {}, wearer(h)));
  stats.append(el('h3', '', 'Stats' + (worn ? ' (with gear)' : '')));
  /* Each row with its icon (art/icons.py), by the label's first word. */
  const ROW_ICON = { Strength: 'strength', Dexterity: 'dexterity', Intellect: 'intellect', Damage: 'damage', Range: 'range', Attacks: 'speed', Casts: 'castspeed', Crit: 'crit', Energy: 'energy' };
  const row = (label, value, note, cls) => {
    const r = el('div', 'srow' + (cls ? ' ' + cls : '')), name = el('span', ''), ic = ROW_ICON[label.split(' ')[0]];
    if (ic) name.append(spriteImg('icon_' + ic, 'ico pix'));
    name.append(el('span', '', label)); r.append(name, el('b', '', value)); stats.append(r);
    if (note) { r.tabIndex = 0; bindTip(r, () => ({ title: label, lines: [note] })); }   /* what the number is made of: on hover */
  };
  /* every attribute's side effect, from every point (ATTRIBUTE_EFFECTS) */
  for (const a of ATTRIBUTES) row(STAT_LABELS[a] + (a === h.attribute ? ' (main)' : ''), f(s[a]), ATTRIBUTE_EFFECTS[a].map(fx => '+' + f(s[a] * fx.per * (fx.stat === 'critDamage' ? 100 : 100)) + '% ' + fx.label).join(', '), a === h.attribute ? 'main' : '');
  row('Damage (' + DAMAGE_LABEL[h.damageType] + ')', f(s.damage * (1 - s.spread)) + '–' + f(s.damage * (1 + s.spread)), '+' + f(attributeDamage(h, s) * 100) + '% from ' + STAT_LABELS[h.attribute] + (worn ? ' · gear included' : ''));
  row('Range', String(Math.round(s.range)));
  if (s.cooldown) row(h.rate === 'castSpeed' ? 'Casts per second' : 'Attacks per second', f((s[h.rate || 'speed'] || 1) / s.cooldown));
  if (s.critChance > 0) row('Crit chance', f(s.critChance * 100) + '% (×' + f(s.critDamage) + ' damage)');
  row('Energy per second', f(s.energyPerSecond) + ' / ' + f(s.energyMax));
  const u = ULTIMATES[h.ultimate];
  if (u) { stats.append(el('h3', '', 'Ultimate')); stats.append(liveLine('p', 'hdesc', u.name + ': ', u.desc, s, heroStats(asPlayed(h), []))); }
  /* Combos (js/content/synergies.js): which debuffs make its damage hit harder, and what its own debuffs set up for others. */
  stats.append(el('h3', '', 'Combos'));
  const hits = el('p', 'hdesc combo'); hits.append(el('b', '', 'Hits harder: '), ringLine(h.damageType, h.id)); stats.append(hits);
  const ups = setsUpText(h), sets = el('p', 'hdesc combo');
  sets.append(el('b', '', 'Sets up: '), ups || 'nothing yet');
  stats.append(sets);
  box.append(gear, pic, stats);
}

/* Evolutions tab: the base hero, then its forms side by side, each with its three level-30 upgrades (attack, passive, ultimate). */
function renderEvolutions(box, h) {
  const tree = el('div', 'evotree'), root = el('div', 'evonode root'), u = ULTIMATES[h.ultimate];
  root.style.setProperty('--hc', h.color);
  /* each card's top is a hero card like in a match: the hero, the name, the attack and ultimate icons */
  root.append(heroBand(h, h.name, DAMAGE_LABEL[h.damageType] + ' damage'), el('p', '', liveText(h.short, null, heroStats(h, []))));
  if (u) root.append(el('small', '', 'Ultimate: ' + u.name));
  tree.append(root);
  for (const step of h.evolutions) {
    tree.append(el('div', 'evolink', 'Level ' + step.level + ' · ' + step.cost + ' gold'));
    const row = el('div', 'evorow');
    for (const c of step.choices) {
      const d = evolvedDef(h, c), cu = ULTIMATES[d.ultimate], n = el('div', 'evonode');
      n.style.setProperty('--hc', d.color);
      n.append(heroBand(d, c.name, DAMAGE_LABEL[d.damageType] + ' damage' + (d.attribute !== h.attribute ? ' · ' + STAT_LABELS[d.attribute] : '')), el('p', '', liveText(d.short, null, heroStats(d, []))));
      if (cu) n.append(el('small', '', 'Ultimate: ' + cu.name + ': ' + ultDesc(cu, heroStats(d, []))));
      if (PREVIEWS[c.id]) n.append(el('small', 'preview', 'Before level ' + EVOLVE_LEVEL + ': ' + PREVIEWS[c.id].desc));
      /* The second evolution: one of three upgrades. */
      const ups = el('div', 'evoups');
      ups.append(el('small', 'muted', 'Level ' + UPGRADE_LEVEL + ' · ' + step.cost + ' gold'));
      for (const up of UPGRADES[c.id]) {
        const line = el('small', 'evoup2' + (up.slot === 'passive' ? ' passive' : '')), who = up.slot === 'passive' ? passiveSetup(up, c.id) : '';
        line.append(el('b', '', up.name + ' '), el('span', 'muted', '(' + SLOT_NAME[up.slot].toLowerCase() + ') '), el('span', '', up.short));
        if (who) bindTip(line, () => ({ title: up.name + ' (passive)', color: '#8be28b', lines: [up.short, { text: who + '.', color: '#ab9f8a' }] }));
        ups.append(line);
      }
      n.append(ups);
      const open = pathsUnlocked(), chosen = activePaths()[h.id] === c.id;
      const pb = el('button', 'pathbtn', !open ? 'Paths unlock in Act ' + UNLOCKS.paths.act : chosen ? 'Chosen path ✓ (click to clear)' : 'Choose this path');
      pb.disabled = !open;
      n.classList.toggle('chosen', chosen);
      pb.onclick = () => setPath(h.id, chosen ? null : c.id);
      n.append(pb);
      row.append(n);
    }
    tree.append(row);
  }
  box.append(tree);
}

function render() {
  $('hrList').hidden = !!hero; $('hrPage').hidden = !hero;
  $('hrTitle').textContent = hero ? hero.name : 'Heroes';
  if (!hero) { renderList(); return; }
  for (const b of $('hrTabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  const box = $('hrBody'); box.textContent = ''; box.className = 'hbody ' + tab;
  box.style.setProperty('--hc', hero.color);
  if (tab === 'info') renderInfo(box, hero); else renderEvolutions(box, hero);
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('hrBack').onclick = () => { openSlot = null; if (back) bus.emit('nav', back); else if (hero) { hero = null; render(); } else bus.emit('nav', { to: 'menu' }); };
      for (const b of $('hrTabs').children) b.onclick = () => { tab = b.dataset.tab; openSlot = null; render(); };
      bound = true;
    }
    hero = params.hero ? HEROES.find(h => h.id === params.hero) || null : null; tab = 'info'; back = params.back || null; openSlot = null; openSocket = null;
    saved = copy(equipment()); say('');
    render();
    if (!state.items) { say('Loading your items…'); const err = await ensureItems(); say(err, !!err); saved = copy(equipment()); render(); }
  },
  unmount() { if (timer) flush(); }
};
