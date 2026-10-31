import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { saveTalents } from '../services/api.js';
import { TREES, TREE_ORDER, NODES, canAllocate, canRemove, pointsFor } from '../game/talents.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
let bound = false, alloc = new Set(), saved = [], tab = TREE_ORDER[0], timer = 0;

const free = () => pointsFor(state.profile.level) - alloc.size;
const say = t => { $('tlSave').textContent = t || ''; };

function info(n) {
  const on = n.root || alloc.has(n.id);
  const status = n.root ? 'Start' : on ? 'Allocated. Click to remove.' : canAllocate(alloc, n) ? (free() > 0 ? 'Click to allocate (1 point).' : 'No points available.') : 'Connect it to an allocated node first.';
  $('tlInfo').textContent = '';
  const b = document.createElement('b'); b.textContent = n.name + (n.notable ? ' (notable)' : '');
  const d = document.createElement('div'); d.textContent = n.desc;
  const s = document.createElement('div'); s.className = 'muted'; s.textContent = status;
  $('tlInfo').append(b, d, s);
}

function toggle(n) {
  if (n.root) return;
  if (alloc.has(n.id)) {
    if (!canRemove(alloc, n.id)) { say('Remove the nodes that depend on this one first.'); return; }
    alloc.delete(n.id);
  } else if (canAllocate(alloc, n) && free() > 0) alloc.add(n.id);
  else { say(free() > 0 ? 'Connect it to an allocated node first.' : 'No talent points left.'); return; }
  state.profile.talents = [...alloc];
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 700);
  render(); info(n);
}

async function flush() {
  clearTimeout(timer); timer = 0;
  const nodes = [...alloc];
  const { profile, error } = await saveTalents(nodes);
  if (error || !profile) {
    alloc = new Set(saved); state.profile.talents = [...saved];
    say('Could not save: ' + (error || 'unknown error') + ' (did you run the talents SQL?)'); render(); return;
  }
  saved = nodes; state.profile.talents = profile.talents; say('Saved');
}

function render() {
  $('tlPoints').textContent = free();
  const tabs = $('tlTabs'); tabs.textContent = '';
  TREE_ORDER.forEach(id => {
    const t = TREES[id], used = t.nodes.filter(n => alloc.has(n.id)).length, b = document.createElement('button');
    b.textContent = t.name + (used ? ' · ' + used : ''); b.classList.toggle('on', id === tab); b.style.borderColor = id === tab ? t.color : '';
    b.onclick = () => { tab = id; render(); $('tlInfo').textContent = 'Hover or tap a node to see what it does.'; };
    tabs.append(b);
  });
  const tree = TREES[tab], root = $('tlSvg'); root.textContent = '';
  tree.links.forEach(([a, b]) => {
    const na = NODES.get(a), nb = NODES.get(b), on = (na.root || alloc.has(a)) && (nb.root || alloc.has(b));
    root.append(svg('line', { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, class: 'tlink' + (on ? ' on' : '') }));
  });
  tree.nodes.forEach(n => {
    const on = n.root || alloc.has(n.id), avail = !on && free() > 0 && canAllocate(alloc, n);
    const g = svg('g', { class: 'tnode' + (on ? ' on' : '') + (avail ? ' avail' : '') + (n.notable ? ' notable' : ''), tabindex: 0, role: 'button', 'aria-label': n.name + ': ' + n.desc });
    const c = svg('circle', { cx: n.x, cy: n.y, r: n.root ? 16 : n.notable ? 20 : 13 });
    if (on) c.style.fill = tree.color;
    g.append(c);
    g.addEventListener('mouseenter', () => info(n)); g.addEventListener('focus', () => info(n));
    g.addEventListener('click', () => toggle(n));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n); } });
    root.append(g);
  });
}

export default {
  mount() {
    alloc = new Set((state.profile.talents || []).filter(id => NODES.has(id) && !NODES.get(id).root));
    saved = [...alloc]; say('');
    if (!bound) {
      $('tlBack').onclick = () => bus.emit('nav', { to: 'menu' });
      $('tlReset').onclick = () => {
        if (!alloc.size || !confirm('Refund all talent points?')) return;
        alloc = new Set(); state.profile.talents = []; say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 300); render();
      };
      bound = true;
    }
    $('tlInfo').textContent = 'Hover or tap a node to see what it does.';
    render();
  },
  unmount() { if (timer) flush(); }
};
