/* Co-op lobbies, in four views: Create (public or private, and the level), Join (by name or from the list), the password
   prompt of a private lobby, and the Room (the 4 slots, who is here and with which heroes; the host picks the level and
   starts). The server keeps the lobby (js/services/api.js); the live channel (js/net/channel.js) shows who is connected,
   carries each player's heroes, talents and gear, and the host's "start". Starting opens the Play screen in co-op. */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { STAGES, HEROES, LINEUP_SIZE, STAT_LABELS } from '../content/data.js';
import { createLobby, joinLobby, listLobbies, lobbyPing, setLobbyStage, leaveLobby, startLobby, lobbyChannel } from '../services/api.js';
import { coop, enterLobby, closeLobby } from '../net/session.js';
import { PLAYER_COLORS } from '../game/render.js';
import { pathChoice } from '../engine/preview.js';
import { el, cap, currentLineup, wornItems, ensureItems, saveNow, sqlHint } from './loadout.js';

const $ = id => document.getElementById(id);
const PING_MS = 4000, LIST_MS = 6000;
let bound = false, view = 'create', isPrivate = false, asking = null, pinger = 0, lister = 0, started = false, picking = false, lineup = [];

const say = (t, bad = true) => { $('lbyMsg').textContent = t || ''; $('lbyMsg').classList.toggle('warn', !!bad); };
const uid = () => state.profile.id;
const unlocked = () => STAGES.filter(s => s.n <= (state.profile.levels_cleared || 0) + 1);
const friendly = e => (e || '').replace(/^.*?:\s*/, '') + sqlHint(e);

function show(v) {
  view = v;
  for (const [k, id] of [['create', 'lbyCreate'], ['join', 'lbyJoin'], ['ask', 'lbyAsk'], ['room', 'lbyRoom']]) $(id).hidden = k !== v;
  clearInterval(lister); lister = 0;
  if (v === 'join') { refreshList(); lister = setInterval(refreshList, LIST_MS); }
}
function fillStages(sel, value) {
  sel.textContent = '';
  for (const s of unlocked()) { const o = el('option', '', 'Level ' + s.n + ' · ' + s.waves + ' waves'); o.value = s.n; sel.append(o); }
  sel.value = String(Math.min(value || unlocked().length, unlocked().length));
}

/* ---- Create ---- */
function setPrivate(on) {
  isPrivate = on; $('lbyPublic').classList.toggle('on', !on); $('lbyPrivate').classList.toggle('on', on);
  $('lbyPass').hidden = !on; if (on) $('lbyPass').focus?.();
}
async function create() {
  const pw = $('lbyPass').value.trim();
  if (isPrivate && !pw) return say('A private lobby needs a password.');
  $('lbyCreateGo').disabled = true; say('Creating your lobby…', false);
  const { lobby, error } = await createLobby({ isPrivate, password: pw, stage: +$('lbyStage').value });
  $('lbyCreateGo').disabled = false;
  if (error || !lobby) return say('Could not create the lobby: ' + friendly(error || 'unknown error'));
  say(''); enterRoom(lobby);
}

/* ---- Join ---- */
async function refreshList() {
  const list = $('lbyList');
  const { rows, error } = await listLobbies();
  if (view !== 'join') return;
  list.textContent = '';
  if (error) { list.append(el('li', '', 'Could not load the lobbies.')); return; }
  if (!rows.length) { list.append(el('li', 'muted', 'No open lobbies right now. Create one, or enter a name.')); return; }
  for (const r of rows) {
    const li = el('li'), info = el('span'), b = el('button', 'go', 'Join');
    info.append(el('b', 'lobbycode', r.name), ' ' + (r.is_private ? '🔒 ' : '') + r.host_name + ' · Level ' + r.stage + ' · ' + r.players + '/' + r.max_players);
    b.onclick = () => (r.is_private ? ask(r.name) : join(r.name));
    li.append(info, b); list.append(li);
  }
}
function ask(name, msg = '') { asking = name; $('lbyAskTitle').textContent = 'Lobby ' + name + ' is private'; $('lbyAskPass').value = ''; say(msg); show('ask'); $('lbyAskPass').focus?.(); }
async function join(name, password) {
  name = (name || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(name)) return say('A lobby name is 5 letters and numbers.');
  say('Joining ' + name + '…', false);
  const { lobby, error } = await joinLobby(name, password);
  if (error && /password needed/i.test(error)) return ask(name);
  if (error && /wrong password/i.test(error)) return ask(name, 'Wrong password.');
  if (error || !lobby) return say('Could not join: ' + friendly(error || 'unknown error'));
  say(''); enterRoom(lobby);
}

/* ---- Room ---- */
async function enterRoom(lobby) {
  started = false; picking = false;
  const ch = lobbyChannel(lobby.id, uid());
  enterLobby(lobby, ch);
  show('room');
  await ensureItems();
  lineup = currentLineup();
  if (ch) {
    ch.onMembers(renderRoom);
    ch.on('start', cfg => begin(cfg));
    announce();
  }
  renderRoom();
  clearInterval(pinger); pinger = setInterval(ping, PING_MS);
}
/* Tell the others what I bring (they need it to build the same match). */
function announce() {
  if (!coop.channel) return;
  coop.channel.track({ uid: uid(), name: state.profile.username, level: state.profile.level, talents: state.profile.talents || [], lineup: [...lineup], paths: { ...(state.profile.paths || {}) }, items: wornItems() });
}
async function ping() {
  if (!coop.lobby) return;
  const { lobby, error } = await lobbyPing(coop.lobby.id);
  if (!coop.lobby) return;
  if (error && /not in this lobby/i.test(error)) { closeLobby(); clearInterval(pinger); say('You are no longer in that lobby.'); return show('join'); }
  if (!lobby) return;
  coop.lobby = lobby;
  if (lobby.status === 'playing' && lobby.config) return begin(lobby.config);
  renderRoom();
}
const heroName = id => (HEROES.find(h => h.id === id) || { name: id }).name;
/* A hero in a lineup, with its evolution path if it has one: "Druid → Animalic Druid". */
const withPath = paths => id => { const c = paths && paths[id] && pathChoice(id, paths[id]); return heroName(id) + (c ? ' → ' + c.name : ''); };
function renderRoom() {
  const l = coop.lobby; if (!l || view !== 'room') return;
  const here = coop.channel ? coop.channel.members() : {}, mine = l.host === uid();
  $('lbyCode').textContent = l.name;
  $('lbyInfo').textContent = (l.is_private ? 'Private' : 'Public') + ' · Level ' + l.stage + ' · ' + l.members.length + '/' + l.max_players + ' players · enemies have ×' + Math.max(1, l.members.length) + ' life';
  const box = $('lbySlots'); box.textContent = '';
  for (let s = 0; s < l.max_players; s++) {
    const m = l.members.find(x => x.slot === s), li = el('li', m ? '' : 'empty');
    if (m) {
      const meta = here[m.user_id], idx = l.members.indexOf(m);
      li.style.setProperty('--pc', PLAYER_COLORS[idx % PLAYER_COLORS.length]);
      li.append(el('b', '', (m.user_id === l.host ? '♛ ' : '') + m.username + (m.user_id === uid() ? ' (you)' : '')),
        el('small', '', 'Level ' + m.level + (meta ? '' : ' · connecting…')),
        el('small', '', meta ? meta.lineup.map(withPath(meta.paths)).join(', ') : ''));
    } else li.append(el('small', '', 'Open slot'));
    box.append(li);
  }
  $('lbyHostCtl').hidden = !mine;
  if (mine && $('lbyRoomStage')._for !== l.stage) { $('lbyRoomStage')._for = l.stage; fillStages($('lbyRoomStage'), l.stage); }
  const missing = l.members.filter(m => !here[m.user_id]);
  $('lbyStart').disabled = l.members.length < 2 || (!!coop.channel && missing.length > 0);
  $('lbyWait').textContent = mine
    ? (l.members.length < 2 ? 'Share the name ' + l.name + ' with your friends. A match needs at least 2 players.' : missing.length ? 'Waiting for ' + missing.map(m => m.username).join(', ') + ' to connect…' : 'Everyone is here.')
    : 'Waiting for the host to start the match…';
  $('lbyMine').textContent = lineup.map(withPath(state.profile.paths)).join(', ');
  $('lbyChange').textContent = picking ? 'Done' : 'Change';
  $('lbyHeroes').hidden = !picking;
  if (picking) renderHeroes();
}
function renderHeroes() {
  const grid = $('lbyHeroes'); grid.textContent = '';
  for (const h of HEROES) {
    const on = lineup.includes(h.id), card = el('button', 'hcard pick' + (on ? ' picked' : '')), head = el('div', 'hhead');
    card.style.setProperty('--hc', h.color);
    head.append(el('b', '', h.name), el('small', 'muted', cap(h.archetype) + ' · ' + STAT_LABELS[h.attribute]));
    card.append(head, el('span', 'pickmark', on ? '✓ ' + (lineup.indexOf(h.id) + 1) : 'Add'));
    card.onclick = () => {
      if (on) { if (lineup.length === 1) return say('Bring at least one hero.'); lineup = lineup.filter(x => x !== h.id); }
      else { if (lineup.length >= LINEUP_SIZE) return say('You can bring up to ' + LINEUP_SIZE + ' heroes. Remove one first.'); lineup = [...lineup, h.id]; }
      say(''); announce(); renderRoom();
    };
    grid.append(card);
  }
}
async function toggleHeroes() {
  if (picking) {              /* Done: save the lineup to the account, like a solo match does */
    state.profile.lineup = [...lineup];
    const { error } = await saveNow(lineup);
    if (error && !/not connected/i.test(error)) say('Could not save your heroes: ' + friendly(error));
  }
  picking = !picking; renderRoom();
}
async function changeStage() {
  const { lobby, error } = await setLobbyStage(coop.lobby.id, +$('lbyRoomStage').value);
  if (error) say('Could not change the level: ' + friendly(error)); else { coop.lobby = lobby; renderRoom(); }
}
/* The host starts: the match everyone will build, from what each player announced. */
async function startMatch() {
  const l = coop.lobby, here = coop.channel ? coop.channel.members() : {};
  if (picking) await toggleHeroes();
  const missing = l.members.filter(m => !here[m.user_id]);
  if (missing.length) return say('Waiting for ' + missing.map(m => m.username).join(', ') + ' to connect.');
  const seed = globalThis.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
  const config = { seed, stage: l.stage, host: uid(), players: l.members.map(m => {
    const meta = m.user_id === uid() ? { talents: state.profile.talents || [], lineup, paths: state.profile.paths || {}, items: wornItems() } : here[m.user_id];
    return { uid: m.user_id, name: m.username, talents: meta.talents || [], lineup: meta.lineup, paths: meta.paths || {}, items: meta.items || {} };
  }) };
  $('lbyStart').disabled = true; say('Starting…', false);
  const { error } = await startLobby(l.id, config);
  if (error) { $('lbyStart').disabled = false; return say('Could not start: ' + friendly(error)); }
  coop.channel && coop.channel.send('start', config);
  begin(config);
}
function begin(config) {
  if (started || !coop.lobby) return;
  if (!config.players.some(p => p.uid === uid())) { say('The match started without you.'); return; }
  started = true; clearInterval(pinger); pinger = 0;
  coop.config = config;
  bus.emit('nav', { to: 'play', params: { coop: true } });
}
async function leave() {
  const l = coop.lobby;
  clearInterval(pinger); pinger = 0;
  closeLobby();
  if (l) await leaveLobby(l.id);
}

export default {
  async mount(_el, params = {}) {
    if (!bound) {
      $('lbyPublic').onclick = () => setPrivate(false); $('lbyPrivate').onclick = () => setPrivate(true);
      $('lbyCreateGo').onclick = create;
      $('lbyJoinGo').onclick = () => join($('lbyName').value);
      $('lbyName').onkeydown = e => { if (e.key === 'Enter') join($('lbyName').value); };
      $('lbyName').oninput = () => { $('lbyName').value = $('lbyName').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
      $('lbyAskGo').onclick = () => join(asking, $('lbyAskPass').value);
      $('lbyAskPass').onkeydown = e => { if (e.key === 'Enter') join(asking, $('lbyAskPass').value); };
      $('lbyRefresh').onclick = refreshList;
      $('lbyCopy').onclick = () => { try { navigator.clipboard.writeText(coop.lobby.name); say('Copied ' + coop.lobby.name + '.', false); } catch (e) { /* no clipboard: the name is on screen */ } };
      $('lbyRoomStage').onchange = changeStage;
      $('lbyStart').onclick = startMatch;
      $('lbyChange').onclick = toggleHeroes;
      $('lbyBack').onclick = async () => {
        if (view === 'ask') return show('join');
        if (view === 'room') await leave();
        bus.emit('nav', { to: 'menu' });
      };
      bound = true;
    }
    say(''); setPrivate(false); $('lbyPass').value = '';
    fillStages($('lbyStage'));
    if (coop.lobby && !coop.config) return enterRoom(coop.lobby);   /* came back to a lobby we are still in */
    closeLobby();
    show(params.mode === 'join' ? 'join' : 'create');
    if (params.mode === 'join') $('lbyName').value = '';
  },
  unmount() { clearInterval(pinger); clearInterval(lister); pinger = lister = 0; }
};
