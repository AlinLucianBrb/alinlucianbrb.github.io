import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, AUTH_DOMAIN } from '../config.js';

export const isConfigured = !SUPABASE_URL.startsWith('YOUR_');
const sb = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const alias = username => username.toLowerCase() + '@' + AUTH_DOMAIN;

/* Defaults for columns an older database might not have yet. */
const fill = p => { p.talents = p.talents || []; p.levels_cleared = p.levels_cleared || 0; p.frontier_wave = p.frontier_wave || 0; };

export async function signUp({ username, email, password }) {
  const { data: chk, error: e1 } = await sb.rpc('signup_check', { p_username: username, p_email: email });
  if (e1) return { error: 'Could not check availability. Did you run supabase-setup.sql?' };
  if (chk.username_taken) return { error: 'That username is already taken.' };
  if (chk.email_taken) return { error: 'That email is already registered.' };
  const { data, error } = await sb.auth.signUp({ email: alias(username), password, options: { data: { username, contact_email: email } } });
  if (error) return { error: error.message };
  if (!data.session) return { error: 'Account created, but Supabase is waiting for email confirmation. Turn off "Confirm email" (see README).' };
  return { userId: data.user.id };
}
export async function signIn(username, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: alias(username), password });
  return error ? { error: 'Wrong username or password.' } : { userId: data.user.id };
}
export const signOut = () => sb.auth.signOut();
export async function currentSession() { const { data } = await sb.auth.getSession(); return data.session; }
export async function getProfile(userId) {
  let { data, error } = await sb.from('profiles').select('username,level,xp,gold,best_wave,talents,levels_cleared,frontier_wave').eq('id', userId).maybeSingle();
  if (error) { /* database not updated yet: fall back so login still works */
    ({ data, error } = await sb.from('profiles').select('username,level,xp,gold,best_wave').eq('id', userId).maybeSingle());
  }
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function saveTalents(nodes) {
  const { data, error } = await sb.rpc('save_talents', { p_nodes: nodes });
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function finishRun(waves, kills, stage, won) {
  const { data, error } = await sb.rpc('finish_run', { p_waves: waves, p_kills: kills, p_stage: stage, p_won: won });
  if (data) fill(data);
  return { profile: data, error: error && error.message };
}
export async function getLeaderboard() {
  const { data, error } = await sb.rpc('get_leaderboard', { p_limit: 20 });
  return { rows: data || [], error: error && error.message };
}
