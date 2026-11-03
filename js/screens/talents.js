import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { saveTalents } from '../services/api.js';
import { bindTip } from '../core/tooltip.js';
import { fmtMod } from '../content/format.js';
import { TREES, TREE_ORDER, NODES, canAllocate, canRemove, pointsFor } from '../content/talents.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
let bound = false, alloc = new Set(), saved = [], tab = TREE_ORDER[0], timer = 0, view = null;

const free = () => pointsFor(state.profile.level) - alloc.size;
const say = t => { $('tlSave').textContent = t || ''; };

function tipFor(n) {
  const on = n.root || alloc.has(n.id);
  const status = n.root ? 'Start of the tree' : on ? 'Allocated. Click to remove.' : canAllocate(alloc, n) ? (free() > 0 ? 'Click to allocate (1 point).' : 'No points available.') : 'Connect it to an allocated node first.';
  return { title: n.name + (n.notable ? ' (notable)' : ''), color: TREES[n.tree].color, lines: n.root ? [n.desc] : [...n.mods.map(fmtMod), { text: status, color: '#9db3a3' }] };
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
  paint();
}

async function flush() {
  clearTimeout(timer); timer = 0;
  const nodes = [...alloc];
  const { profile, error } = await saveTalents(nodes);
  if (error || !profile) {
    alloc = new Set(saved); state.profile.talents = [...saved];
    say('Could not save: ' + (error || 'unknown error') + ' (did you run the SQL update?)'); paint(); return;
  }
  saved = nodes; state.profile.talents = profile.talents; say('Saved');
}

/* Builds the SVG for the current tree once; paint() then only changes classes, so tooltips and clicks are never interrupted. */
function build() {
  const tree = TREES[tab], root = $('tlSvg'); root.textContent = '';
  view = { links: [], nodes: [] };
  tree.links.forEach(([a, b]) => {
    const na = NODES.get(a), nb = NODES.get(b), line = svg('line', { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, class: 'tlink' });
    root.append(line); view.links.push({ a, b, line });
  });
  tree.nodes.forEach(n => {
    const g = svg('g', { class: 'tnode', tabindex: 0, role: 'button', 'aria-label': n.name + ': ' + n.desc });
    const c = svg('circle', { cx: n.x, cy: n.y, r: n.root ? 16 : n.notable ? 20 : 13 });
    g.append(c);
    g.addEventListener('click', () => toggle(n));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n); } });
    bindTip(g, () => tipFor(n));
    root.append(g); view.nodes.push({ n, g, c });
  });
}
function paint() {
  $('tlPoints').textContent = free();
  const tree = TREES[tab];
  [...$('tlTabs').children].forEach((b, i) => {
    const id = TREE_ORDER[i], used = TREES[id].nodes.filter(n => alloc.has(n.id)).length;
    b.textContent = TREES[id].name + (used ? ' · ' + used : ''); b.classList.toggle('on', id === tab); b.style.borderColor = id === tab ? TREES[id].color : '';
  });
  view.links.forEach(({ a, b, line }) => {
    const on = (NODES.get(a).root || alloc.has(a)) && (NODES.get(b).root || alloc.has(b));
    line.setAttribute('class', 'tlink' + (on ? ' on' : ''));
  });
  view.nodes.forEach(({ n, g, c }) => {
    const on = n.root || alloc.has(n.id), avail = !on && free() > 0 && canAllocate(alloc, n);
    g.setAttribute('class', 'tnode' + (on ? ' on' : '') + (avail ? ' avail' : '') + (n.notable ? ' notable' : ''));
    c.style.fill = on ? tree.color : '';
  });
}

export default {
  mount() {
    alloc = new Set((state.profile.talents || []).filter(id => NODES.has(id) && !NODES.get(id).root));
    saved = [...alloc]; say('');
    const tabs = $('tlTabs'); tabs.textContent = '';
    TREE_ORDER.forEach(id => {
      const b = document.createElement('button');
      b.onclick = () => { tab = id; build(); paint(); };
      tabs.append(b);
    });
    if (!bound) {
      $('tlBack').onclick = () => bus.emit('nav', { to: 'menu' });
      $('tlReset').onclick = () => {
        if (!alloc.size || !confirm('Refund all talent points?')) return;
        alloc = new Set(); state.profile.talents = []; say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 300); paint();
      };
      bound = true;
    }
    build(); paint();
  },
  unmount() { if (timer) flush(); }
};
