/* Leaderboard: one tab per mode (solo, and co-op with 2, 3 or 4 players), each with its own records. */
import { bus } from '../core/bus.js';
import { getLeaderboard } from '../services/api.js';
import { STAGES } from '../content/data.js';

const $ = id => document.getElementById(id);
let bound = false, players = 1, asked = 0;

async function load() {
  const list = $('lbList'), mine = ++asked;
  for (const b of $('lbTabs').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.players === players);
  list.innerHTML = '<li><span>Loading…</span></li>';
  const { rows, error } = await getLeaderboard(players);
  if (mine !== asked) return;   /* another tab was picked meanwhile */
  list.innerHTML = '';
  if (error) { list.innerHTML = '<li><span>Could not load the leaderboard.</span></li>'; return; }
  if (!rows.length) { list.innerHTML = '<li><span>' + (players === 1 ? 'No runs yet. Be the first.' : 'No ' + players + '-player matches yet. Create a lobby!') + '</span></li>'; return; }
  rows.forEach(r => {
    const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b');
    a.textContent = r.username + ' · Lv ' + r.level;
    b.textContent = r.levels_cleared >= STAGES.length ? 'All levels cleared' : 'Level ' + STAGES[r.levels_cleared].code + ' · wave ' + r.frontier_wave;
    li.append(a, b); list.append(li);
  });
}

export default {
  async mount() {
    if (!bound) {
      $('lbBack').onclick = () => bus.emit('nav', { to: 'menu' });
      for (const b of $('lbTabs').querySelectorAll('button')) b.onclick = () => { players = +b.dataset.players; load(); };
      bound = true;
    }
    await load();
  }
};
