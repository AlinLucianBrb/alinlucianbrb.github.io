import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { xpNeed } from '../core/rules.js';
import { pointsFor } from '../content/talents.js';
import { signOut } from '../services/api.js';

const $ = id => document.getElementById(id);
let bound = false;

function render() {
  const p = state.profile, need = xpNeed(p.level);
  $('mName').textContent = p.username; $('mLv').textContent = p.level;
  $('mXp').textContent = 'XP ' + p.xp + '/' + need; $('mXpFill').style.width = Math.min(100, p.xp / need * 100) + '%';
  $('mGold').textContent = p.gold.toLocaleString();
  const free = pointsFor(p.level) - (p.talents || []).length;
  $('talentsBtn').textContent = free > 0 ? 'Talents (' + free + ')' : 'Talents';
}

export default {
  mount(el) {
    if (!bound) {
      el.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => bus.emit('nav', { to: b.dataset.nav }); });
      $('logoutBtn').onclick = async () => { await signOut(); state.profile = null; bus.emit('nav', { to: 'login' }); };
      bound = true;
    }
    render();
  }
};
