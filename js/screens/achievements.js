/* Achievements (js/content/achievements.js): the whole window, in two tabs. Acts: one column per act (its zone picture on
   top, then its three goals) and one for Endless. Heroes: a block per hero (portrait, then its three goals). Every goal shows
   how far the player is, its reward (gold, materials, maybe a title) and a Claim button once it is done. The server counts
   and pays (sql/57-achievements.sql); the title picker (top right) wears an unlocked title by the player's name. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { bindTip } from '../core/tooltip.js';
import { getAchievements, claimAchievement, setTitle } from '../services/api.js';
import { ZONES, HEROES } from '../content/data.js';
import { MATERIALS } from '../content/crafting.js';
import { ACHIEVEMENTS, progressOf } from '../content/achievements.js';
import { zoneColor } from '../content/world-map.js';
import { spriteImg, heroPortrait } from '../game/sprites.js';
import { el, sqlHint } from './loadout.js';

const $ = id => document.getElementById(id);
let bound = false, tab = 'act', data = { counters: {}, claimed: [] }, busy = false, picking = false;

const claimed = a => data.claimed.includes(a.id);
const done = a => progressOf(a, data.counters, state.profile) >= a.target;
/* How many finished goals are waiting to be claimed (the menu button shows it). */
export const claimable = (counters, claimedIds, profile) => ACHIEVEMENTS.filter(a => !claimedIds.includes(a.id) && progressOf(a, counters, profile) >= a.target).length;
/* The titles the player can wear: those of claimed achievements. */
export const unlockedTitles = claimedIds => ACHIEVEMENTS.filter(a => a.title && claimedIds.includes(a.id)).map(a => a.title);

function say(text) { $('acMsg').textContent = text || ''; }

/* The reward line: gold, each material it gives, and its title. */
function rewards(a) {
  const r = el('div', 'acrew');
  const gold = el('span', 'acgold'); gold.append(spriteImg('icon_gold', 'ico pix'), el('b', '', a.gold.toLocaleString())); r.append(gold);
  a.materials.forEach((n, i) => {
    if (!n) return;
    const m = el('span', 'acmat'); m.append(spriteImg(MATERIALS[i].icon, 'ico pix'), el('b', '', String(n)));
    bindTip(m, () => ({ title: MATERIALS[i].name, lines: [n + ' ' + MATERIALS[i].name] }));
    r.append(m);
  });
  if (a.title) r.append(el('span', 'actitle', '“' + a.title + '”'));
  return r;
}

/* One goal: its name and what to do, a progress bar, the reward, and Claim (or Claimed). */
function card(a) {
  const have = Math.min(a.target, progressOf(a, data.counters, state.profile)), got = claimed(a), ready = !got && have >= a.target;
  const c = el('div', 'accard' + (got ? ' got' : ready ? ' ready' : ''));
  const head = el('div', 'achead'); head.append(el('b', '', a.name));
  if (got) head.append(el('span', 'acdone', '✓ Claimed'));
  const btn = ready && el('button', 'go acclaim', 'Claim');
  if (btn) { btn.disabled = busy; btn.onclick = () => claim(a); }
  if (btn) head.append(btn);
  c.append(head, el('small', 'acdesc', a.desc));
  const bar = el('div', 'acbar'), fill = el('i'); fill.style.width = (have / a.target * 100) + '%';
  bar.append(fill, el('span', '', have + ' / ' + a.target)); c.append(bar);
  const foot = el('div', 'acfoot'); foot.append(rewards(a)); c.append(foot);
  return c;
}

function actsTab(box) {
  box.className = 'acbody acts';
  ZONES.forEach((z, i) => {
    const act = i + 1, col = el('div', 'accol');
    col.style.setProperty('--zc', zoneColor(act));
    const top = el('div', 'acact'); top.style.setProperty('--zart', 'url(assets/level_' + act + '.png)');
    top.append(el('small', '', 'Act ' + act), el('b', '', z.name));
    col.append(top, ...ACHIEVEMENTS.filter(a => a.group === 'act' && a.act === act).map(card));
    box.append(col);
  });
  const col = el('div', 'accol endless'), top = el('div', 'acact');
  col.style.setProperty('--zc', '#b58cf0');
  top.append(spriteImg('map_portal', 'pix acportal'), el('small', '', 'Endless'), el('b', '', 'The portal'));
  col.append(top, ...ACHIEVEMENTS.filter(a => a.kind === 'endless').map(card));
  box.append(col);
}

function heroesTab(box) {
  box.className = 'acbody heroes';
  for (const h of HEROES) {
    const blk = el('div', 'achero'), side = el('div', 'acface');
    const list = ACHIEVEMENTS.filter(a => a.hero === h.id), title = list.find(a => a.title);
    side.append(spriteImg(heroPortrait(h.id), 'pix'), el('b', '', h.name));
    if (title) side.append(el('small', 'actitle', '“' + title.title + '”'));
    const cards = el('div', 'accards'); cards.append(...list.map(card));
    blk.append(side, cards); box.append(blk);
  }
}

/* Top right: the title worn now; clicking lists the unlocked ones to pick from. */
function titleBox() {
  const box = $('acTitles'); box.textContent = '';
  const now = state.profile.title, open = el('button', 'actitlebtn');
  open.append(el('small', '', 'Title'), el('b', '', now || 'None'));
  open.onclick = () => { picking = !picking; titleBox(); };
  box.append(open);
  if (!picking) return;
  const list = el('div', 'actitlelist'), have = unlockedTitles(data.claimed);
  const pick = (t, label) => { const b = el('button', t === now ? 'on' : '', label); b.disabled = busy; b.onclick = () => wear(t); list.append(b); };
  pick(null, 'None');
  for (const t of have) pick(t, t);
  if (!have.length) list.append(el('small', 'muted', 'Claim an achievement with a title to wear it.'));
  box.append(list);
}

function render() {
  for (const b of $('acTabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
  const box = $('acBody'); box.textContent = '';
  (tab === 'act' ? actsTab : heroesTab)(box);
  const n = claimable(data.counters, data.claimed, state.profile);
  $('acCount').textContent = n ? n + ' to claim' : '';
  titleBox();
}

async function claim(a) {
  if (busy) return;
  busy = true; render();
  const { profile, error } = await claimAchievement(a.id);
  busy = false;
  if (error || !profile) { say('Could not claim it: ' + (error || 'no answer') + sqlHint(error)); render(); return; }
  Object.assign(state.profile, profile); data.claimed = [...data.claimed, a.id];
  say('Claimed ' + a.name + ': +' + a.gold.toLocaleString() + ' gold' + (a.title ? ', and the title “' + a.title + '”' : '') + '.');
  render();
}
async function wear(t) {
  if (busy) return;
  busy = true; render();
  const { profile, error } = await setTitle(t);
  busy = false; picking = false;
  if (error || !profile) say('Could not change the title: ' + (error || 'no answer') + sqlHint(error));
  else { state.profile.title = profile.title || null; say(t ? 'You are now ' + state.profile.username + ', ' + t + '.' : 'No title.'); }
  render();
}

export default {
  async mount() {
    if (!bound) {
      $('acBack').onclick = () => bus.emit('nav', { to: 'menu' });
      for (const b of $('acTabs').querySelectorAll('button')) b.onclick = () => { tab = b.dataset.tab; render(); };
      bound = true;
    }
    picking = false; say('Loading…');
    const res = await getAchievements();
    data = { counters: res.counters || {}, claimed: res.claimed || [] };
    say(res.error ? 'Could not load the achievements' + sqlHint(res.error) + '.' : '');
    render();
  }
};
