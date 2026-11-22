/* Levels screen, in two steps: choose a level, then choose the heroes to bring (up to LINEUP_SIZE; none are picked to begin
   with, and Start waits until at least one is). The hero cards are the Heroes page's (picture, gear, path); "Gear & path"
   opens that hero's page there, and its Back comes straight back here with the picks kept. Start saves the lineup
   (the server records it with the run) and opens the match. "Next level" after a win comes straight to the second step. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { STAGES, HEROES, LINEUP_SIZE, STAT_LABELS, ZONES, zoneOf } from '../content/data.js';
import { SLOTS } from '../content/items.js';
import { UNLOCKS, unlocksOf } from '../content/unlocks.js';
import { MAP_EFFECTS, MAP_EFFECT_OF } from '../content/map-effects.js';
import { el, cap, gearCount, ensureItems, saveNow, sqlHint, activePaths, pathsUnlocked } from './loadout.js';
import { spriteImg, heroPortrait } from '../game/sprites.js';
import { pathChoice } from '../engine/preview.js';

const $ = id => document.getElementById(id);
let bound = false, stage = null, lineup = [], zone = null;

const say = (t, bad) => { $('lvMsg').textContent = t || ''; $('lvMsg').classList.toggle('warn', !!bad); };

/* Zones first (a row of five, the one you are working on chosen), then the chosen zone's levels. A zone opens when you reach
   its first level. Every level of a zone shows the zone's picture. */
function renderLevels() {
  const p = state.profile, cleared = p.levels_cleared || 0, list = $('lvList'), next = Math.min(STAGES.length, cleared + 1);
  if (zone === null) zone = zoneOf(next).n;
  if (document.body?.dataset) document.body.dataset.zone = String(zone);   /* the chosen zone's colour */
  const zones = $('lvZones');
  if (zones) {
    zones.textContent = '';
    for (const z of ZONES) {
      const lv = STAGES.filter(s => s.zone === z.n), done = lv.filter(s => s.n <= cleared).length, open = lv[0].n <= cleared + 1;
      const b = el('button', 'zone' + (z.n === zone ? ' on' : ''));
      const art = el('img', 'pix'); art.src = 'assets/level_' + z.n + '.png'; art.alt = ''; art.onerror = () => art.remove?.();
      const gives = unlocksOf(z.n);   /* what reaching this act unlocks */
      b.append(art, el('b', '', 'Act ' + z.n + ' · ' + z.name), el('small', '', open ? done + ' / ' + lv.length + ' cleared' : 'Locked' + (gives.length ? ' · unlocks ' + gives.join(', ').toLowerCase() : '')));
      b.disabled = !open; b.onclick = () => { zone = z.n; renderLevels(); };
      zones.append(b);
    }
  }
  list.textContent = '';
  STAGES.filter(s => s.zone === zone).forEach(s => {
    const b = el('button', 'lvl' + (s.n <= cleared ? ' done' : ''));
    const c = s.n <= cleared ? 'Cleared ✓' : s.n === cleared + 1 ? (p.frontier_wave ? 'Furthest: wave ' + p.frontier_wave : 'Ready') : 'Locked';
    const art = el('img', 'lvart pix'); art.src = 'assets/level_' + s.zone + '.png'; art.alt = ''; art.onerror = () => art.remove?.();
    const txt = el('span', 'lvtxt'); txt.append(el('b', '', 'Level ' + s.code), el('span', '', s.waves + ' waves'), el('small', '', c));
    const fx = MAP_EFFECTS[MAP_EFFECT_OF[s.n]];
    if (fx) { txt.append(el('small', 'mapfx', fx.name)); b.title = fx.name + ': ' + fx.text; }   /* the zone's name is on its tab above */
    b.disabled = s.n > cleared + 1; b.append(art, txt);
    b.onclick = () => { stage = s.n; lineup = []; say(''); render(); };
    list.append(b);
  });
}

function toggle(id) {
  if (lineup.includes(id)) lineup = lineup.filter(x => x !== id);
  else { if (lineup.length >= LINEUP_SIZE) return say('You can bring up to ' + LINEUP_SIZE + ' heroes. Remove one first.', true); lineup = [...lineup, id]; }
  say(''); render();
}

function renderPick() {
  const fx = MAP_EFFECTS[MAP_EFFECT_OF[stage]];
  $('lvPickTitle').textContent = 'Pick your 3 heroes';
  if ($('lvMapFx')) { $('lvMapFx').textContent = fx ? fx.name + ': ' + fx.text : ''; $('lvMapFx').hidden = !fx; }
  $('lvCount').textContent = lineup.length + ' / ' + LINEUP_SIZE;
  $('lvStart').disabled = !lineup.length; $('lvStart').title = lineup.length ? '' : 'Choose at least one hero';
  const grid = $('lvHeroes'); grid.textContent = '';
  const paths = activePaths();
  for (const h of HEROES) {
    const on = lineup.includes(h.id), card = el('div', 'hcard pick' + (on ? ' picked' : '')), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color); card.tabIndex = 0; card.setAttribute?.('role', 'button');
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    const c = paths[h.id] && pathChoice(h.id, paths[h.id]);
    const gear = el('button', 'linkbtn gearpath', pathsUnlocked() ? 'Gear & path' : 'Gear');   /* the hero's page (Heroes), then back here */
    gear.title = pathsUnlocked() ? 'Change this hero\'s gear and evolution path' : 'Change this hero\'s gear';
    gear.onclick = e => { e.stopPropagation?.(); bus.emit('nav', { to: 'heroes', params: { hero: h.id, back: { to: 'levels', params: { stage, lineup: [...lineup] } } } }); };
    const foot = el('div', 'pickfoot'); foot.append(gear, el('span', 'pickmark', on ? '✓ ' + (lineup.indexOf(h.id) + 1) : 'Add'));
    const info = el('small', 'muted', 'Gear ' + gearCount(h.id) + ' / ' + SLOTS.length + ' · ');
    info.append(el('span', c ? 'pathline' : '', c ? 'Path: ' + c.name : pathsUnlocked() ? 'No path' : 'Paths: Act ' + UNLOCKS.paths.act));
    card.append(spriteImg(heroPortrait(h.id), 'pix hcardart'), head, el('p', 'hdesc', h.short), info, foot);
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
  if (stage === null) renderLevels(); else renderPick();
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('lvBack').onclick = () => { if (stage !== null) { stage = null; say(''); render(); } else bus.emit('nav', { to: 'menu' }); };
      $('lvStart').onclick = start;
      bound = true;
    }
    stage = params.stage || null; lineup = Array.isArray(params.lineup) ? params.lineup.filter(id => HEROES.some(h => h.id === id)).slice(0, LINEUP_SIZE) : []; zone = null; say('');   /* back from a hero's page: the picks are kept */
    render();
    if (!state.items) { await ensureItems(); if (stage !== null) render(); }
  }
};
