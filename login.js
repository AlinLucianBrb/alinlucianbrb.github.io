import { signIn, signUp, getProfile, isConfigured } from '../services/api.js';
import { bus } from '../core/bus.js';
import * as config from '../config.js';
import { state } from '../core/state.js';

const $ = id => document.getElementById(id);
const USER_RE = /^[A-Za-z0-9_]{3,16}$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let bound = false;
const SITE_KEY = config.CAPTCHA_SITE_KEY || '';   /* namespace import: an older config.js without this line keeps working */
const tokens = { login: '', signup: '' }, widgets = {};

const say = t => { $('loginMsg').textContent = t || ''; };
const busy = on => document.querySelectorAll('#screen-login button').forEach(b => { b.disabled = on; });
function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve();
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = resolve; s.onerror = resolve; document.head.append(s);
  });
}
/* Shows the CAPTCHA for the visible form (only when a site key is configured). */
async function showCaptcha(kind) {
  if (!SITE_KEY) return;
  await loadTurnstile();
  if (!globalThis.turnstile) return say('Could not load the CAPTCHA. Check your connection or ad blocker.');
  if (widgets[kind] === undefined) {
    widgets[kind] = globalThis.turnstile.render('#' + (kind === 'login' ? 'liCaptcha' : 'suCaptcha'), {
      sitekey: SITE_KEY, callback: t => { tokens[kind] = t; }, 'expired-callback': () => { tokens[kind] = ''; }
    });
  }
}
function resetCaptcha(kind) { tokens[kind] = ''; if (SITE_KEY && globalThis.turnstile && widgets[kind] !== undefined) globalThis.turnstile.reset(widgets[kind]); }
function needCaptcha(kind) { if (SITE_KEY && !tokens[kind]) { say('Please complete the CAPTCHA first.'); return true; } return false; }

function mode(signup) { $('loginForm').hidden = signup; $('signupForm').hidden = !signup; say(''); showCaptcha(signup ? 'signup' : 'login'); }

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
    if (needCaptcha('login')) return;
    busy(true);
    const r = await signIn($('liUser').value.trim(), $('liPass').value, tokens.login || undefined);
    resetCaptcha('login');
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
    if (needCaptcha('signup')) return;
    busy(true);
    const r = await signUp({ username, email, password, captchaToken: tokens.signup || undefined });
    resetCaptcha('signup');
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
