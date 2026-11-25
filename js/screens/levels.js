/* Levels screen, in two steps: choose a level on the world map, then choose the heroes to bring (up to LINEUP_SIZE; none are picked to begin
   with, and Start waits until at least one is). The hero cards are the Heroes page's (picture, gear, path); "Gear & path"
   opens that hero's page there, and its Back comes straight back here with the picks kept. Start saves the lineup
   (the server records it with the run) and opens the match. "Next level" after a win comes straight to the second step. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { STAGES, ENDLESS, stageDef, stageOpen, HEROES, LINEUP_SIZE, STAT_LABELS, ZONES, zoneOf } from '../content/data.js';
import { SLOTS } from '../content/items.js';
import { UNLOCKS, unlocksOf } from '../content/unlocks.js';
import { MAP_EFFECTS, MAP_EFFECT_OF } from '../content/map-effects.js';
import { el, cap, gearCount, ensureItems, saveNow, sqlHint, activePaths, pathsUnlocked } from './loadout.js';
import { heroFrame, heroAbilities } from '../game/sprites.js';
import { pathChoice } from '../engine/preview.js';
import { heroStats } from '../engine/stats.js';
import { liveText } from '../content/live-text.js';
import { zoneItemLevels, levelDropText, endlessDropText, ENDLESS_ITEMS } from '../content/level-drops.js';
import { WORLD, ZONE_PATH, zoneColor, roadPath } from '../content/world-map.js';
import { isBossWave } from '../content/rules.js';
import { bindTip } from '../core/tooltip.js';
import { calm } from '../core/prefs.js';

const $ = id => document.getElementById(id);
let bound = false, stage = null, lineup = [], zone = null;

const say = (t, bad) => { $('lvMsg').textContent = t || ''; $('lvMsg').classList.toggle('warn', !!bad); };

/* The world map (prototype: shapes, no art yet). First the world: the five zones one after another along a road, the one
   you are working on marked "You are here". Clicking an open zone zooms into it: its levels from left to right along the
   zone's road, then Endless. Hovering a level shows what it is; clicking it shows the same in the card under the map with
   "Choose heroes". The positions are in js/content/world-map.js. */
const NS = 'http://www.w3.org/2000/svg';
let picked = null;   /* the level shown in the card under the map */
/* A point in % of the map's open area: the map fills the window, minus room for the title (top), the card and Back
   (bottom) and the sides (--mt, --mb, --ml, --mr in index.html). */
const mapX = x => 'calc(var(--ml,0px) + ' + x + ' * (100% - var(--ml,0px) - var(--mr,0px)) / 100)';
const mapY = y => 'calc(var(--mt,0px) + ' + y + ' * (100% - var(--mt,0px) - var(--mb,0px)) / 100)';
const place = (node, pt) => { node.style.left = mapX(pt.x); node.style.top = mapY(pt.y); };
function road(box, points) {
  const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'maproad');
  path.setAttribute('d', roadPath(points)); svg.append(path); box.append(svg);
}
/* A level's status, for its node and its card. */
function status(n) {
  const p = state.profile, cleared = p.levels_cleared || 0, e = stageDef(n);
  if (e && e.endless) return stageOpen(n, cleared) ? (p.endless_wave ? 'Best wave: ' + p.endless_wave : 'Open') : 'Locked';
  return n <= cleared ? 'Cleared ✓' : n === cleared + 1 ? (p.frontier_wave ? 'Furthest: wave ' + p.frontier_wave : 'Ready') : stageOpen(n, cleared) ? 'Open (testing)' : 'Locked';
}
/* What a level is: its lines for the hover tip and the card. */
function levelLines(n) {
  const s = stageDef(n);
  if (s.endless) return [{ text: 'Waves never stop; bosses every ' + ENDLESS_ITEMS.bossEvery + ' waves.', color: '#e8dcc0' }, { text: endlessDropText(), color: '#d9b25a' },
    { text: 'You choose the map\'s effect when the match begins. Quitting saves the run.', color: '#ab9f8a' },
    { text: stageOpen(n, state.profile.levels_cleared || 0) ? status(n) : 'Opens when every level of the zone is beaten', color: '#cfe0d2' }];
  const fx = MAP_EFFECTS[MAP_EFFECT_OF[n]], bosses = [...new Set([Math.round(s.waves / 2), s.waves])].filter(w => isBossWave(w, s));
  return [{ text: s.waves + ' waves · ' + (bosses.length > 1 ? 'bosses on waves ' + bosses.join(' and ') : 'a boss on wave ' + bosses[0]), color: '#e8dcc0' },
    { text: levelDropText(n), color: '#d9b25a' }, ...(fx ? [{ text: fx.name + ': ' + fx.text, color: fx.color }] : []), { text: status(n), color: '#cfe0d2' }];
}
const levelTitle = n => { const s = stageDef(n); return s.endless ? 'Endless · ' + zoneOf(s.zone || 1).name : 'Level ' + s.code; };

function renderLevels() {
  const p = state.profile, cleared = p.levels_cleared || 0, next = Math.min(STAGES.length, cleared + 1), map = $('lvMap');
  map.textContent = ''; picked = null; renderCard();
  if (zone === null) {
    if (document.body?.dataset) document.body.dataset.zone = String(zoneOf(next).n);
    $('lvMapTitle').textContent = 'World map';
    map.className = 'worldmap world';
    map.style.setProperty?.('--zc', zoneColor(zoneOf(next).n));
    road(map, WORLD);
    for (const w of WORLD) {
      const z = ZONES[w.zone - 1], lv = STAGES.filter(s => s.zone === z.n), done = lv.filter(s => s.n <= cleared).length, open = stageOpen(lv[0].n, cleared);
      const here = zoneOf(next).n === z.n && done < lv.length, [lo, hi] = zoneItemLevels(lv.map(s => s.n));
      const b = el('button', 'mapnode zonenode' + (open ? '' : ' locked') + (done === lv.length ? ' done' : '') + (here ? ' here' : ''));
      b.style.setProperty?.('--nc', w.color); place(b, w);
      const label = el('span', 'maplabel');
      label.append(el('b', '', z.name), el('small', '', open ? done + ' / ' + lv.length + ' cleared' : 'Locked'), el('small', 'zdrop', 'Items ' + lo + '–' + hi));
      b.append(el('span', 'mapdot', String(z.n)), label, ...(here ? [el('span', 'heretag', 'You are here')] : []));
      b.disabled = !open; b.setAttribute?.('aria-label', 'Act ' + z.n + ', ' + z.name);
      const gives = unlocksOf(z.n);
      bindTip(b, () => ({ title: 'Act ' + z.n + ' · ' + z.name, color: w.color, lines: [{ text: open ? done + ' of ' + lv.length + ' levels cleared' : 'Beat the act before it to open it', color: '#e8dcc0' },
        { text: 'Items of level ' + lo + ' to ' + hi, color: '#d9b25a' }, ...(gives.length ? [{ text: 'Opens: ' + gives.join(', '), color: '#ab9f8a' }] : [])] }));
      b.onclick = () => enterZone(z.n, w);
      map.append(b);
    }
    return;
  }
  /* inside a zone */
  const z = ZONES[zone - 1], lv = STAGES.filter(s => s.zone === zone), e = ENDLESS.find(x => x.zone === zone);
  if (document.body?.dataset) document.body.dataset.zone = String(zone);
  $('lvMapTitle').textContent = 'Act ' + z.n + ' · ' + z.name;
  map.className = 'worldmap zoneview';
  map.style.setProperty?.('--zc', zoneColor(zone)); map.style.setProperty?.('--zart', 'url(assets/level_' + zone + '.png)');
  road(map, ZONE_PATH.slice(0, lv.length + (e ? 1 : 0)));
  const back = el('button', 'mapback', '◀ World map'); back.onclick = leaveZone; map.append(back);
  [...lv.map(s => s.n), ...(e ? [e.n] : [])].forEach((n, i) => {
    const s = stageDef(n), open = stageOpen(n, cleared), here = !s.endless && n === next && n > cleared;
    const b = el('button', 'mapnode lvnode' + (s.endless ? ' endless' : '') + (open ? '' : ' locked') + (!s.endless && n <= cleared ? ' done' : '') + (here ? ' here' : ''));
    b.style.setProperty?.('--nc', zoneColor(zone)); place(b, ZONE_PATH[i]);
    const label = el('span', 'maplabel');
    label.append(el('b', '', s.endless ? 'Endless' : 'Level ' + s.code), el('small', '', status(n)));
    b.append(el('span', 'mapdot', s.endless ? '∞' : String(i + 1)), label, ...(here ? [el('span', 'heretag', 'Next')] : []));
    b.disabled = !open; b.dataset && (b.dataset.n = String(n));
    bindTip(b, () => ({ title: levelTitle(n), color: zoneColor(zone), lines: levelLines(n) }));
    b.onclick = () => { if (picked === n) { choose(n); return; } picked = n; renderCard(); for (const c of map.children) c.classList?.toggle('sel', c === b); };
    map.append(b);
  });
}
/* The card under the map: the clicked level, what it is, and "Choose heroes" (clicking the level again does the same). */
function renderCard() {
  const card = $('lvInfo'); if (!card) return;
  card.textContent = '';
  if (picked === null) { card.hidden = true; return; }
  const words = el('div', 'lvinfotext'), go = el('button', 'go', 'Choose heroes');
  words.append(el('b', '', levelTitle(picked)));
  for (const l of levelLines(picked)) { const t = el('small', '', l.text); t.style.color = l.color; words.append(t); }
  go.onclick = () => choose(picked);
  card.append(words, go); card.hidden = false;
}
const choose = n => { stage = n; lineup = []; say(''); render(); };
/* Zooming: into a zone from its place on the world, and back out to it. Without animations (or with fewer effects) it
   simply switches. */
function zoom(origin, out, then) {
  const map = $('lvMap');
  if (!map.animate || calm()) { then(); return; }
  map.style.transformOrigin = mapX(origin.x) + ' ' + mapY(origin.y);
  const a = map.animate(out ? [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.45)', opacity: 0 }] : [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.8)', opacity: 0 }], { duration: 360, easing: 'ease-in' });
  a.onfinish = () => {
    then();
    map.animate(out ? [{ transform: 'scale(2.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }] : [{ transform: 'scale(.45)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'ease-out' });
  };
}
function enterZone(n, at) { zoom(at, false, () => { zone = n; renderLevels(); }); }
function leaveZone() { const at = WORLD.find(w => w.zone === zone) || WORLD[0]; zoom(at, true, () => { zone = null; renderLevels(); }); }

function toggle(id) {
  if (lineup.includes(id)) lineup = lineup.filter(x => x !== id);
  else { if (lineup.length >= LINEUP_SIZE) return say('You can bring up to ' + LINEUP_SIZE + ' heroes. Remove one first.', true); lineup = [...lineup, id]; }
  say(''); render();
}

function renderPick() {
  const fx = MAP_EFFECTS[MAP_EFFECT_OF[stage]], end = stageDef(stage) && stageDef(stage).endless;
  $('lvPickTitle').textContent = 'Pick your 3 heroes';
  if ($('lvDrops')) $('lvDrops').textContent = end ? endlessDropText() : levelDropText(stage);   /* what this level is worth farming for */
  if ($('lvMapFx')) { $('lvMapFx').textContent = end ? 'Endless: you choose the map\'s effect when the match begins. Quitting saves the run.' : fx ? fx.name + ': ' + fx.text : ''; $('lvMapFx').hidden = !fx && !end; }
  $('lvCount').textContent = lineup.length + ' / ' + LINEUP_SIZE;
  $('lvStart').disabled = !lineup.length; $('lvStart').title = lineup.length ? '' : 'Choose at least one hero';
  const grid = $('lvHeroes'); grid.textContent = '';
  const paths = activePaths(stage);   /* a path counts only on levels of Act 2 or later */
  for (const h of HEROES) {
    const on = lineup.includes(h.id), card = el('div', 'hcard herolike pick' + (on ? ' picked' : '')), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color); card.tabIndex = 0; card.setAttribute?.('role', 'button');
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    const c = paths[h.id] && pathChoice(h.id, paths[h.id]);
    const gear = el('button', 'linkbtn gearpath', pathsUnlocked(stage) ? 'Gear & path' : 'Gear');   /* the hero's page (Heroes), then back here */
    gear.title = pathsUnlocked(stage) ? 'Change this hero\'s gear and evolution path' : 'Change this hero\'s gear';
    gear.onclick = e => { e.stopPropagation?.(); bus.emit('nav', { to: 'heroes', params: { hero: h.id, back: { to: 'levels', params: { stage, lineup: [...lineup] } } } }); };
    const foot = el('div', 'pickfoot'); foot.append(gear, el('span', 'pickmark', on ? '✓ ' + (lineup.indexOf(h.id) + 1) : 'Add'));
    const info = el('small', 'muted', 'Gear ' + gearCount(h.id) + ' / ' + SLOTS.length + (c ? ' · ' : ''));
    if (c) info.append(el('span', 'pathline', 'Path: ' + c.name));
    card.append(heroFrame(h), head, info, foot, heroAbilities(h));   /* like the hero cards in a match */
    card.title = liveText(h.short, null, heroStats(h, []));
    card.onclick = () => toggle(h.id);
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); toggle(h.id); } };
    grid.append(card);
  }
}

async function start() {
  if (!lineup.length) { say('Choose at least one hero.', true); return; }
  $('lvStart').disabled = true; say('Saving your lineup…');
  state.profile.lineup = [...lineup];
  const { error } = await saveNow(lineup);
  $('lvStart').disabled = false;
  /* Without a server (not configured yet) the match still starts with the chosen lineup; a real refusal stops here. */
  if (error && !/not connected/i.test(error)) { say('Could not save your lineup: ' + error + sqlHint(error), true); return; }
  bus.emit('nav', { to: 'play', params: { stage } });
}

function render() {
  $('lvChoose').hidden = stage !== null; $('lvPick').hidden = stage === null;
  $('screen-levels')?.classList?.toggle('onmap', stage === null);   /* the map fills the whole window */
  if (stage === null) renderLevels(); else renderPick();
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('lvBack').onclick = () => { if (stage !== null) { stage = null; say(''); render(); } else if (zone !== null) leaveZone(); else bus.emit('nav', { to: 'menu' }); };
      $('lvStart').onclick = start;
      bound = true;
    }
    stage = params.stage || null; lineup = Array.isArray(params.lineup) ? params.lineup.filter(id => HEROES.some(h => h.id === id)).slice(0, LINEUP_SIZE) : []; zone = stage ? (stageDef(stage).zone || zoneOf(Math.min(stage, STAGES.length)).n) : null; say('');   /* back from a hero's page: the picks are kept; Back then shows that level's zone */
    render();
    if (!state.items) { await ensureItems(); if (stage !== null) render(); }
  }
};
