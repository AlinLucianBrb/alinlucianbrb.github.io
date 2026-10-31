import { signIn, signUp, getProfile, isConfigured } from '../services/api.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

const $ = id => document.getElementById(id);
const USER_RE = /^[A-Za-z0-9_]{3,16}$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let bound = false;

const say = t => { $('loginMsg').textContent = t || ''; };
const busy = on => document.querySelectorAll('#screen-login button').forEach(b => { b.disabled = on; });
function mode(signup) { $('loginForm').hidden = signup; $('signupForm').hidden = !signup; say(''); }

async function enter(userId) {
  const { profile, error } = await getProfile(userId);
  if (!profile) return say(error || 'Could not load your profile.');
  state.profile = profile;
  ['liPass', 'suPass'].forEach(id => { $(id).value = ''; });
  bus.emit('nav', { to: 'menu' });
}

function bind() {
  $('toSignup').onclick = () => mode(true);
  $('toLogin').onclick = () => mode(false);
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    if (!isConfigured) return say('Not connected yet: add your Supabase details in js/config.js.');
    busy(true);
    const r = await signIn($('liUser').value.trim(), $('liPass').value);
    if (r.error) say(r.error); else await enter(r.userId);
    busy(false);
  };
  $('signupForm').onsubmit = async e => {
    e.preventDefault();
    if (!isConfigured) return say('Not connected yet: add your Supabase details in js/config.js.');
    const username = $('suUser').value.trim(), email = $('suEmail').value.trim(), password = $('suPass').value;
    if (!USER_RE.test(username)) return say('Username: 3–16 letters, numbers or underscores.');
    if (!EMAIL_RE.test(email)) return say('Enter a valid email address.');
    if (password.length < 8) return say('Password must be at least 8 characters.');
    busy(true);
    const r = await signUp({ username, email, password });
    if (r.error) say(r.error); else await enter(r.userId);
    busy(false);
  };
}

export default {
  mount() {
    if (!bound) { bind(); bound = true; }
    mode(false);
    if (!isConfigured) say('Not connected yet: add your Supabase details in js/config.js.');
  }
};
