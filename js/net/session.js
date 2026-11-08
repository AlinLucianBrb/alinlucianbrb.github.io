/* The co-op lobby this browser is in, shared by the Lobby and Play screens: the lobby (as the server last returned it), its
   live channel, and once the host starts, the match config every player builds the same world from:
     { seed, stage, host: userId, players: [{ uid, name, talents, lineup, items }] }   (in slot order) */
export const coop = { lobby: null, channel: null, config: null };

export function enterLobby(lobby, channel) { closeLobby(); coop.lobby = lobby; coop.channel = channel; coop.config = null; }
export function closeLobby() {
  if (coop.channel) coop.channel.close();
  coop.lobby = coop.channel = coop.config = null;
}
/* My place in a match config: the player index, and whether I am the host. */
export function seatOf(config, uid) {
  const me = config.players.findIndex(p => p.uid === uid);
  return { me, isHost: config.host === uid, host: config.players.findIndex(p => p.uid === config.host) };
}
/* The world options for a match config (what createWorld takes). */
export const worldOptions = config => ({ seed: config.seed >>> 0, stage: config.stage,
  players: config.players.map(p => ({ talents: p.talents || [], lineup: p.lineup, items: p.items || {} })) });
