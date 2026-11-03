import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, AUTH_DOMAIN } from '../config.js';

export const isConfigured = !SUPABASE_URL.startsWith('YOUR_');
const sb = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
/* Every call answers with an error, instead of crashing, when js/config.js has no Supabase details. */
const OFFLINE = { error: 'Not connected to the server (add your Supabase details in js/config.js).' };
const alias = username => username.toLowerCase() + '@' + AUTH_DOMAIN;

/* Defaults for columns an older database might not have yet. */
const fill = p => {
  p.talents = p.talents || []; p.levels_cleared = p.levels_cleared || 0; p.frontier_wave = p.frontier_wave || 0;
  p.lineup = p.lineup && p.lineup.length ? p.lineup : ['warrior', 'ranger', 'mage']; p.equipment = p.equipment || {};
};

const USERNAME_PROBLEMS = {
  format: 'Username: 3–16 letters, numbers or underscores.',
  blocked: 'That username is not allowed. Please pick another.',
  lookalike: 'That username is too similar to an existing one.'
};

export async function signUp({ username, email, password, captchaToken }) {
  const { data: chk, error: e1 } = await sb.rpc('signup_check', { p_username: username, p_email: email });
  if (e1) return { error: 'Could not check availability. Did you run the latest SQL update?' };
  if (chk.username_problem) return { error: USERNAME_PROBLEMS[chk.username_problem] || 'That username is not allowed.' };
  if (chk.username_taken) return { error: 'That username is already taken.' };
  if (chk.email_taken) return { error: 'That email is already registered.' };
  const { data, error } = await sb.auth.signUp({ email: alias(username), password, options: { data: { username, contact_email: email }, captchaToken } });
  if (error) return { error: /database error/i.test(error.message) ? 'Could not create the account. Try a different username or email.' : error.message };
  if (!data.session) return { error: 'Account created, but Supabase is waiting for email confirmation. Turn off "Confirm email" (see README).' };
  return { userId: data.user.id };
}
export async function signIn(username, password, captchaToken) {
  const { data, error } = await sb.auth.signInWithPassword({ email: alias(username), password, options: { captchaToken } });
  if (error && /captcha/i.test(error.message)) return { error: 'CAPTCHA check failed. Please try again.' };
  return error ? { error: 'Wrong username or password.' } : { userId: data.user.id };
}
export const signOut = () => sb.auth.signOut();
export async function currentSession() { const { data } = await sb.auth.getSession(); return data.session; }
export async function getProfile(userId) {
  let { data, error } = await sb.from('profiles').select('username,level,xp,gold,best_wave,talents,levels_cleared,frontier_wave,lineup,equipment').eq('id', userId).maybeSingle();
  if (error) { /* database not updated yet: fall back so login still works */
    ({ data, error } = await sb.from('profiles').select('username,level,xp,gold,best_wave').eq('id', userId).maybeSingle());
  }
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function saveTalents(nodes) {
  if (!sb) return { profile: null, ...OFFLINE };
  const { data, error } = await sb.rpc('save_talents', { p_nodes: nodes });
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function startRun(stage) {
  if (!sb) return { id: null, ...OFFLINE };
  const { data, error } = await sb.rpc('start_run', { p_stage: stage });
  return { id: data || null, error: error && error.message };
}
/* Returns { profile, drop, error }: drop is the item type found at the end of the match, or null. */
export async function finishRun(runId, waves, kills, won) {
  if (!sb) return { profile: null, ...OFFLINE };
  const { data: res, error } = await sb.rpc('finish_run', { p_run: runId, p_waves: waves, p_kills: kills, p_won: won });
  const data = res && res.profile ? res.profile : res;   /* older databases return the profile itself */
  if (data) fill(data);
  if (res && 'drop' in res) return { profile: data, drop: res.drop || null, error: error && error.message };
  return { profile: data, error: error && error.message };
}
/* The player's items: [{ id, item_type, created_at }], newest first. */
export async function getItems() {
  if (!sb) return { items: [], ...OFFLINE };
  const { data, error } = await sb.from('player_items').select('id,item_type,created_at').order('created_at', { ascending: false });
  return { items: data || [], error: error && error.message };
}
export async function saveLoadout(lineup, equipment) {
  if (!sb) return { profile: null, ...OFFLINE };
  const { data, error } = await sb.rpc('save_loadout', { p_lineup: lineup, p_equipment: equipment });
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function getLeaderboard() {
  if (!sb) return { rows: [], ...OFFLINE };
  const { data, error } = await sb.rpc('get_leaderboard', { p_limit: 20 });
  return { rows: data || [], error: error && error.message };
}
