/* Levels screen, in two steps: choose a level, then choose the heroes to bring (up to LINEUP_SIZE). Start saves the lineup
   (the server records it with the run) and opens the match. "Next level" after a win comes straight to the second step. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { STAGES, HEROES, LINEUP_SIZE, STAT_LABELS } from '../content/data.js';
import { ITEMS } from '../content/items.js';
import { el, cap, currentLineup, typeOf, equipment, ensureItems, saveNow, sqlHint } from './loadout.js';

const $ = id => document.getElementById(id);
let bound = false, stage = null, lineup = [];

const say = (t, bad) => { $('lvMsg').textContent = t || ''; $('lvMsg').classList.toggle('warn', !!bad); };

function renderLevels() {
  const p = state.profile, cleared = p.levels_cleared || 0, list = $('lvList');
  list.textContent = '';
  STAGES.forEach(s => {
    const b = el('button', 'lvl' + (s.n <= cleared ? ' done' : ''));
    const c = s.n <= cleared ? 'Cleared ✓' : s.n === cleared + 1 ? (p.frontier_wave ? 'Furthest: wave ' + p.frontier_wave : 'Ready') : 'Locked';
    b.disabled = s.n > cleared + 1; b.append(el('b', '', 'Level ' + s.n), el('span', '', s.waves + ' waves'), el('small', '', c));
    b.onclick = () => { stage = s.n; lineup = currentLineup(); say(''); render(); };
    list.append(b);
  });
}

function toggle(id) {
  if (lineup.includes(id)) { if (lineup.length === 1) return say('Bring at least one hero.', true); lineup = lineup.filter(x => x !== id); }
  else { if (lineup.length >= LINEUP_SIZE) return say('You can bring up to ' + LINEUP_SIZE + ' heroes. Remove one first.', true); lineup = [...lineup, id]; }
  say(''); render();
}

function renderPick() {
  $('lvPickTitle').textContent = 'Level ' + stage + ': choose your heroes';
  $('lvCount').textContent = lineup.length + ' / ' + LINEUP_SIZE;
  const grid = $('lvHeroes'); grid.textContent = '';
  for (const h of HEROES) {
    const on = lineup.includes(h.id), card = el('button', 'hcard pick' + (on ? ' picked' : '')), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color);
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    const worn = typeOf(equipment()[h.id]);
    card.append(head, el('p', 'hdesc', h.short), el('small', 'muted', worn && ITEMS[worn] ? 'Wearing ' + ITEMS[worn].name : 'No item'),
      el('span', 'pickmark', on ? '✓ ' + (lineup.indexOf(h.id) + 1) : 'Add'));
    card.onclick = () => toggle(h.id);
    grid.append(card);
  }
}

async function start() {
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
    stage = params.stage || null; lineup = currentLineup(); say('');
    render();
    if (!state.items) { await ensureItems(); if (stage !== null) render(); }
  }
};
