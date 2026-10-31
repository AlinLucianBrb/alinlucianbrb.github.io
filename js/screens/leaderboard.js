import { bus } from '../core/bus.js';
import { getLeaderboard } from '../services/api.js';

const $ = id => document.getElementById(id);
let bound = false;

export default {
  async mount() {
    if (!bound) { $('lbBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    const list = $('lbList');
    list.innerHTML = '<li><span>Loading…</span></li>';
    const { rows, error } = await getLeaderboard();
    list.innerHTML = '';
    if (error) { list.innerHTML = '<li><span>Could not load the leaderboard.</span></li>'; return; }
    if (!rows.length) { list.innerHTML = '<li><span>No runs yet. Be the first.</span></li>'; return; }
    rows.forEach(r => {
      const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b');
      a.textContent = r.username + ' · Lv ' + r.level; b.textContent = 'Wave ' + r.best_wave;
      li.append(a, b); list.append(li);
    });
  }
};
