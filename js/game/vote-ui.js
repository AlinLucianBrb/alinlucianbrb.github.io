/* The match effects on screen: the vote (three cards and "None"; in co-op with everyone's votes and the time left) and the bar
   of what is active on this match (the map's effect first). The rules are js/content/match-effects.js and map-effects.js. */
import { MATCH_EFFECTS } from '../content/match-effects.js';
import { MAP_EFFECTS } from '../content/map-effects.js';
import { bindTip } from '../core/tooltip.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let onVote = () => {}, key = '', barKey = null;
export const initVote = cb => { onVote = cb; };
export function resetVote() { key = ''; barKey = null; $('voteBox').hidden = true; }

/* Called every frame. w: the local player's view; names: the players' names in co-op. */
export function updateVote(w, names = null) {
  const bar = [w.mapEffect || '', ...w.effects].join();
  if (bar !== barKey) { barKey = bar; drawBar(w); }
  const v = w.vote, now = v && w.phase !== 'over' ? 'w' + v.wave + JSON.stringify(v.votes) + (w.coop ? Math.ceil(v.t) : '') : '';
  if (now === key) return;
  key = now;
  $('voteBox').hidden = !now;
  if (!now) return;
  const mine = v.votes[w.me.i], box = $('voteCards'); box.textContent = '';
  const map = v.kind === 'map';
  $('voteTitle').textContent = map ? 'Choose this map\'s effect' : 'Wave ' + v.wave + ' cleared: choose an effect';
  const voters = i => (w.coop ? w.players.filter(p => v.votes[p.i] === i).map(p => (names && names[p.i]) || 'Player ' + (p.i + 1)) : []);
  const card = (i, id) => {
    const e = id && (map ? MAP_EFFECTS : MATCH_EFFECTS)[id], b = el('button', 'choose votecard' + (mine === i ? ' mine' : ''));
    b.append(el('small', 'pickkey', e ? 'Key ' + (i + 1) : 'Key 0'), el('b', '', e ? e.name : 'None'));
    if (map) b.append(el('small', '', e.text)); else if (e) b.append(el('small', 'good', '+ ' + e.good), el('small', 'bad', '− ' + e.bad)); else b.append(el('small', 'muted', 'Play on without one'));
    const who = voters(i); if (who.length) b.append(el('small', 'who2', '✓ ' + who.join(', ')));
    b.onclick = () => onVote(i);
    box.append(b);
  };
  v.offers.forEach((id, i) => card(i, id)); if (!map) card(-1, null);
  $('voteHint').textContent = w.coop ? 'The most votes win; a tie is drawn by lot. ' + Math.ceil(v.t) + ' s left.' : 'It lasts for the rest of the match. The game is paused while you choose.';
}

function drawBar(w) {
  const box = $('fxBar'); box.textContent = '';
  const chip = (name, lines, color, map) => { const c = el('span', 'fxchip' + (map ? ' map' : ''), name); c.style.setProperty?.('--ec', color); bindTip(c, () => ({ title: name, color, lines })); box.append(c); };
  const m = MAP_EFFECTS[w.mapEffect];
  if (m) chip(m.name, [m.text, { text: 'This map\'s effect', color: '#ab9f8a' }], m.color, true);
  for (const id of w.effects) { const e = MATCH_EFFECTS[id]; chip(e.name, [{ text: '+ ' + e.good, color: '#8be28b' }, { text: '− ' + e.bad, color: '#e5645a' }], '#dcc6ff'); }
  box.hidden = !box.children.length;
}
