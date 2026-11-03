import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { STAGES } from '../content/data.js';

const $ = id => document.getElementById(id);
let bound = false;

export default {
  mount() {
    if (!bound) { $('lvBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    const p = state.profile, cleared = p.levels_cleared || 0, list = $('lvList');
    list.textContent = '';
    STAGES.forEach(s => {
      const b = document.createElement('button'), t = document.createElement('b'), a = document.createElement('span'), c = document.createElement('small');
      b.className = 'lvl' + (s.n <= cleared ? ' done' : ''); t.textContent = 'Level ' + s.n; a.textContent = s.waves + ' waves';
      c.textContent = s.n <= cleared ? 'Cleared ✓' : s.n === cleared + 1 ? (p.frontier_wave ? 'Furthest: wave ' + p.frontier_wave : 'Ready') : 'Locked';
      b.disabled = s.n > cleared + 1; b.append(t, a, c);
      b.onclick = () => bus.emit('nav', { to: 'play', params: { stage: s.n } });
      list.append(b);
    });
  }
};
