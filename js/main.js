import { register, show } from './core/screens.js';
import { bus } from './core/bus.js';
import { state } from './core/state.js';
import { isConfigured, currentSession, getProfile } from './services/api.js';
import login from './screens/login.js';
import menu from './screens/menu.js';
import leaderboard from './screens/leaderboard.js';
import settings from './screens/settings.js';
import play from './screens/play.js';
import talents from './screens/talents.js';
import levels from './screens/levels.js';
import heroes from './screens/heroes.js';
import inventory from './screens/inventory.js';
import lobby from './screens/lobby.js';

register('login', login); register('menu', menu); register('leaderboard', leaderboard);
register('settings', settings); register('play', play); register('talents', talents); register('levels', levels); register('heroes', heroes); register('inventory', inventory); register('lobby', lobby);
bus.on('nav', ({ to, params }) => show(to, params));

(async () => {
  if (isConfigured) {
    const session = await currentSession();
    if (session) {
      const { profile } = await getProfile(session.user.id);
      if (profile) { state.profile = profile; return show('menu'); }
    }
  }
  show('login');
})();
