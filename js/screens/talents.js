/* Talents screen: the 20 tracks of 5 (js/content/talents.js) in two columns, combat on the left and quality of life on the
   right, all on one screen. Click a talent to take it and any before it in its track (if you have the points); click a taken
   talent to give it back with the ones after it. Saved automatically. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { saveTalents } from '../services/api.js';
import { bindTip } from '../core/tooltip.js';
import { fmtMod } from '../content/format.js';
import { TREES, TREE_ID, NODES, COMBAT_CLUSTERS, QOL_CLUSTERS, pointsFor } from '../content/talents.js';

const $ = id => document.getElementById(id);
let bound = false, alloc = new Set(), saved = [], timer = 0, view = [];

const tree = () => TREES[TREE_ID];
const free = () => pointsFor(state.profile.level) - alloc.size;
const say = t => { $('tlSave').textContent = t || ''; };
const plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
const track = n => tree().clusters.find(c => c.key === n.cluster);
/* The talents to take to reach n (n and the untaken ones before it), and to give back from n (n and the taken ones after it). */
const toTake = n => track(n).nodes.slice(0, n.step + 1).filter(x => !alloc.has(x.id));
const toGive = n => track(n).nodes.slice(n.step).filter(x => alloc.has(x.id));

function tipFor(n) {
  const cl = track(n), on = alloc.has(n.id);
  let status;
  if (on) { const k = toGive(n).length; status = k === 1 ? 'Taken. Click to give it back.' : 'Taken. Click to give it back with the ' + plural(k - 1, 'talent') + ' after it.'; }
  else {
    const k = toTake(n).length;
    status = k > free() ? plural(k, 'point') + ' needed; you have ' + free() + '.' : k === 1 ? 'Click to take it (1 point).' : 'Click to take it and the ' + plural(k - 1, 'talent') + ' before it (' + k + ' points).';
  }
  const kind = n.notable ? ' (notable)' : '';
  return { title: n.name + kind, color: cl.color, lines: [{ text: cl.title + ' · ' + (n.step + 1) + ' of ' + cl.size, color: '#ab9f8a' }, ...n.mods.map(fmtMod), { text: status, color: '#ab9f8a' }] };
}

function changed() {
  state.profile.talents = [...alloc];
  say('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 700);
  paint();
}
function toggle(n) {
  if (alloc.has(n.id)) { for (const x of toGive(n)) alloc.delete(x.id); changed(); return; }
  const way = toTake(n);
  if (way.length > free()) { say(free() > 0 ? 'That needs ' + plural(way.length, 'point') + '; you have ' + free() + '.' : 'No talent points left.'); return; }
  for (const x of way) alloc.add(x.id);
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

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/* One track: its icon and name, how many are taken, then its five talents joined by a line. */
function row(cl) {
  const r = el('div', 'tltrack'); r.style.setProperty('--tc', cl.color);
  const name = el('div', 'tlname'), icon = el('img', 'pix'); icon.src = 'assets/' + cl.icon + '.png'; icon.alt = '';
  const count = el('small', 'tlcount');
  name.append(icon, el('b', '', cl.title), count);
  const steps = el('div', 'tlsteps'), nodes = [];
  for (const n of cl.nodes) {
    const b = el('button', 'tlnode' + (n.notable ? ' notable' : n.mastery ? ' mastery' : ''));
    b.setAttribute('aria-label', n.name + ': ' + n.desc);
    if (n.notable) { const im = el('img', 'pix'); im.src = icon.src; im.alt = ''; b.append(im); } else b.textContent = String(n.step + 1);
    b.onclick = () => toggle(n);
    bindTip(b, () => tipFor(n));
    steps.append(b); nodes.push({ n, b });
  }
  r.append(name, steps);
  view.push({ cl, count, nodes, r });
  return r;
}
function build() {
  view = [];
  for (const [id, title, keys] of [['tlCombat', 'Combat', COMBAT_CLUSTERS], ['tlQol', 'Quality of life', QOL_CLUSTERS]]) {
    const col = $(id); col.textContent = '';
    col.append(el('h2', 'tlhead', title), ...keys.map(k => row(tree().clusters.find(c => c.key === k))));
  }
}
function paint() {
  $('tlPoints').textContent = free();
  $('tlOwned').textContent = alloc.size + ' / ' + (tree().nodes.length - 1);
  for (const { cl, count, nodes, r } of view) {
    const have = cl.nodes.filter(n => alloc.has(n.id)).length;
    count.textContent = have + '/' + cl.size;
    r.classList.toggle('full', have === cl.size);
    for (const { n, b } of nodes) {
      const on = alloc.has(n.id), next = !on && n.step === have && free() > 0;
      b.classList.toggle('on', on); b.classList.toggle('next', next);
    }
  }
}

export default {
  mount() {
    alloc = new Set((state.profile.talents || []).filter(id => NODES.has(id) && !NODES.get(id).root));
    saved = [...alloc]; say('');
    if (!bound) {
      $('tlBack').onclick = () => bus.emit('nav', { to: 'menu' });
      $('tlReset').onclick = () => {
        if (!alloc.size || !confirm('Refund all talent points?')) return;
        alloc = new Set(); changed();
      };
      bound = true;
    }
    build(); paint();
  },
  unmount() { if (timer) flush(); }
};
