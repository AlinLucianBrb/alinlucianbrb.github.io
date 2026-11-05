/* Talents screen: the talent tree as an SVG you can zoom (mouse wheel, pinch, + / −) and drag around.
   Click a node next to your allocated ones to take it; click a node further away to take the whole shortest path to it
   (if you have the points); click an allocated node to give it back (if nothing else hangs on it). Saved automatically. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { saveTalents } from '../services/api.js';
import { bindTip } from '../core/tooltip.js';
import { fmtMod } from '../content/format.js';
import { TREES, TREE_ORDER, NODES, canAllocate, canRemove, pointsFor, pathTo } from '../content/talents.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
let bound = false, alloc = new Set(), saved = [], tab = TREE_ORDER[0], timer = 0, view = null, cam = null, drag = null;

const free = () => pointsFor(state.profile.level) - alloc.size;
const say = t => { $('tlSave').textContent = t || ''; };
const clusterOf = n => (n.cluster && TREES[n.tree].clusters ? TREES[n.tree].clusters.find(c => c.key === n.cluster) : null);
const plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');

function tipFor(n) {
  const on = n.root || alloc.has(n.id), cl = clusterOf(n);
  let status;
  if (n.root) status = 'Start of the tree';
  else if (on) status = canRemove(alloc, n.id) ? 'Allocated. Click to remove.' : 'Allocated. Remove the nodes that depend on it first.';
  else {
    const way = pathTo(alloc, n.id) || [];
    status = way.length <= free() ? (way.length === 1 ? 'Click to allocate (1 point).' : 'Click to allocate it and the ' + plural(way.length - 1, 'node') + ' on the way (' + way.length + ' points).')
      : plural(way.length, 'point') + ' away; you have ' + free() + '.';
  }
  return { title: n.name + (n.notable ? ' (notable)' : ''), color: n.path ? '#cfd8cf' : cl ? cl.color : TREES[n.tree].color,
    lines: n.root ? [n.desc] : [...(cl ? [{ text: cl.title, color: '#9db3a3' }] : n.path ? [{ text: 'Path', color: '#9db3a3' }] : []), ...n.mods.map(fmtMod), { text: status, color: '#9db3a3' }] };
}

function changed() {
  state.profile.talents = [...alloc];
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 700);
  paint();
}
function toggle(n) {
  if (n.root) return;
  if (alloc.has(n.id)) {
    if (!canRemove(alloc, n.id)) { say('Remove the nodes that depend on this one first.'); return; }
    alloc.delete(n.id); changed(); return;
  }
  const way = pathTo(alloc, n.id);
  if (!way || !way.length) return;
  if (way.length > free()) { say(free() > 0 ? 'That needs ' + plural(way.length, 'point') + '; you have ' + free() + '.' : 'No talent points left.'); return; }
  for (const id of way) alloc.add(id);
  changed();
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

/* ---- Camera: the SVG viewBox. Starts showing the whole tree. ---- */
function fitView() {
  const ns = TREES[tab].nodes, pad = 130;
  const x0 = Math.min(...ns.map(n => n.x)) - pad, x1 = Math.max(...ns.map(n => n.x)) + pad, y0 = Math.min(...ns.map(n => n.y)) - pad, y1 = Math.max(...ns.map(n => n.y)) + pad;
  cam = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, full: Math.max(x1 - x0, y1 - y0) };
  applyCam();
}
const applyCam = () => $('tlSvg').setAttribute('viewBox', [cam.x, cam.y, cam.w, cam.h].map(Math.round).join(' '));
/* Zoom by factor k around the point (fx, fy) given as fractions of the view (0.5, 0.5 = the middle). */
function zoom(k, fx = 0.5, fy = 0.5) {
  const w = Math.max(cam.full * 0.15, Math.min(cam.full * 1.2, cam.w / k)), s = w / cam.w, h = cam.h * s;
  cam.x += (cam.w - w) * fx; cam.y += (cam.h - h) * fy; cam.w = w; cam.h = h; applyCam();
}
function bindCamera(el) {
  el.addEventListener('wheel', e => {
    e.preventDefault && e.preventDefault();
    const r = el.getBoundingClientRect(); zoom(Math.exp(-(e.deltaY || 0) * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved < 6) return;
    /* The SVG keeps its aspect ratio, so one screen pixel is the larger of the two scales. */
    const k = Math.max(cam.w / r.width, cam.h / r.height);
    cam.x -= dx * k; cam.y -= dy * k; applyCam(); el.classList.add('dragging');
  });
  const end = () => { setTimeout(() => { drag = null; }, 0); el.classList.remove('dragging'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointerleave', end);
}

/* Builds the SVG for the current tree once; paint() then only changes classes, so tooltips and clicks are never interrupted. */
function build() {
  const tree = TREES[tab], root = $('tlSvg'); root.textContent = '';
  view = { links: [], nodes: [] };
  tree.links.forEach(([a, b]) => {
    const na = NODES.get(a), nb = NODES.get(b), line = svg('line', { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, class: 'tlink' });
    root.append(line); view.links.push({ a, b, line });
  });
  /* Cluster names, just beyond each cluster's notable (cl.label, from the layout). */
  for (const cl of tree.clusters || []) {
    const t = svg('text', { x: cl.label.x, y: cl.label.y + 9, class: 'tbranch', 'text-anchor': cl.label.anchor || 'middle', style: 'fill:' + cl.color });
    t.textContent = cl.title; root.append(t);
  }
  tree.nodes.forEach(n => {
    const g = svg('g', { class: 'tnode', tabindex: 0, role: 'button', 'aria-label': n.name + ': ' + n.desc });
    const c = svg('circle', { cx: n.x, cy: n.y, r: n.root ? 20 : n.notable ? 22 : n.path ? 8 : 13 });
    g.append(c);
    g.addEventListener('click', () => { if (!drag || drag.moved < 6) toggle(n); });
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n); } });
    bindTip(g, () => tipFor(n));
    root.append(g); view.nodes.push({ n, g, c, color: n.path ? '#cfd8cf' : (clusterOf(n) || tree).color });
  });
}
function paint() {
  $('tlPoints').textContent = free();
  [...$('tlTabs').children].forEach((b, i) => {
    const id = TREE_ORDER[i], used = TREES[id].nodes.filter(n => alloc.has(n.id)).length;
    b.textContent = TREES[id].name + (used ? ' · ' + used : ''); b.classList.toggle('on', id === tab); b.style.borderColor = id === tab ? TREES[id].color : '';
  });
  view.links.forEach(({ a, b, line }) => {
    const on = (NODES.get(a).root || alloc.has(a)) && (NODES.get(b).root || alloc.has(b));
    line.setAttribute('class', 'tlink' + (on ? ' on' : ''));
  });
  view.nodes.forEach(({ n, g, c, color }) => {
    const on = n.root || alloc.has(n.id), avail = !on && free() > 0 && canAllocate(alloc, n);
    g.setAttribute('class', 'tnode' + (on ? ' on' : '') + (avail ? ' avail' : '') + (n.notable ? ' notable' : '') + (n.path ? ' path' : ''));
    c.style.fill = on ? color : '';
  });
}

export default {
  mount() {
    alloc = new Set((state.profile.talents || []).filter(id => NODES.has(id) && !NODES.get(id).root));
    saved = [...alloc]; say('');
    const tabs = $('tlTabs'); tabs.textContent = ''; tabs.hidden = TREE_ORDER.length < 2;   /* one tree: no tabs needed */
    TREE_ORDER.forEach(id => {
      const b = document.createElement('button');
      b.onclick = () => { tab = id; build(); fitView(); paint(); };
      tabs.append(b);
    });
    if (!bound) {
      $('tlBack').onclick = () => bus.emit('nav', { to: 'menu' });
      $('tlReset').onclick = () => {
        if (!alloc.size || !confirm('Refund all talent points?')) return;
        alloc = new Set(); changed();
      };
      if ($('tlZoomIn')) { $('tlZoomIn').onclick = () => zoom(1.4); $('tlZoomOut').onclick = () => zoom(1 / 1.4); $('tlFit').onclick = fitView; }
      bindCamera($('tlSvg'));
      bound = true;
    }
    build(); fitView(); paint();
  },
  unmount() { if (timer) flush(); }
};
