import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { xpNeed } from '../core/rules.js';
import { pointsFor } from '../content/talents.js';
import { signOut, getAchievements } from '../services/api.js';
import { claimable } from './achievements.js';
import { loadRun, clearRun, describeRun } from '../game/saved-run.js';
import { versionText } from '../core/version.js';

const $ = id => document.getElementById(id);
let bound = false;

function render() {
  const p = state.profile, need = xpNeed(p.level);
  $('mName').textContent = p.username; $('mLv').textContent = p.level;
  $('mTitle').textContent = p.title || ''; $('mTitle').hidden = !p.title;   /* the achievement title worn */
  $('mXp').textContent = 'XP ' + p.xp + '/' + need; $('mXpFill').style.width = Math.min(100, p.xp / need * 100) + '%';
  $('mGold').textContent = p.gold.toLocaleString();
  $('mVersion').textContent = versionText();
  const free = pointsFor(p.level) - (p.talents || []).length;
  $('talentsLbl').textContent = free > 0 ? 'Talents (' + free + ')' : 'Talents';   /* the label only: the button keeps its icon */
  /* A run that was going on when the page was refreshed or closed: carry on, or give it up. */
  const run = loadRun(p.id), box = $('resumeBox');
  box.hidden = !run;
  if (run) $('resumeRunBtn').textContent = 'Resume run · ' + describeRun(run);
  countClaims(p);
}
/* The Achievements button says how many finished goals wait to be claimed (it stays plain if the server can't say). */
async function countClaims(p) {
  const { counters, claimed, error } = await getAchievements();
  if (state.profile !== p) return;
  const n = error ? 0 : claimable(counters || {}, claimed || [], p);
  $('achLbl').textContent = n ? String(n) : ''; $('achLbl').hidden = !n;
}

export default {
  mount(el) {
    if (!bound) {
      el.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => bus.emit('nav', { to: b.dataset.nav }); });
      $('resumeRunBtn').onclick = () => bus.emit('nav', { to: 'play', params: { resume: true } });
      $('lobbyCreateBtn').onclick = () => bus.emit('nav', { to: 'lobby', params: { mode: 'create' } });
      $('lobbyJoinBtn').onclick = () => bus.emit('nav', { to: 'lobby', params: { mode: 'join' } });
      $('resumeDrop').onclick = () => { clearRun(state.profile.id); render(); };
      $('logoutBtn').onclick = async () => { await signOut(); state.profile = null; bus.emit('nav', { to: 'login' }); };
      bound = true;
    }
    render();
  }
};
