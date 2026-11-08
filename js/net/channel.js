/* A lobby's live channel on Supabase Realtime: broadcast messages between the players' games, and presence (who is here,
   with what heroes). It is the transport js/net/lockstep.js expects ({ send, on }), plus presence:
     track(meta)     tell the others about me (they see it in members())
     members()       { key: meta } for everyone here now
     onMembers(fn)   called whenever someone arrives, leaves or changes their meta
     onLeave(fn)     called with the key of someone who left
     close()
   key is the player's user id. Messages are not sent back to their sender. */
export function openChannel(sb, name, key) {
  const ch = sb.channel(name, { config: { broadcast: { self: false }, presence: { key } } });
  const handlers = {}, memberFns = [], leaveFns = [];
  let meta = null, joined = false, closed = false;
  const ready = new Promise(resolve => {
    ch.on('presence', { event: 'sync' }, () => memberFns.forEach(fn => fn(members())));
    ch.on('presence', { event: 'leave' }, ({ key: k }) => { if (k !== key) leaveFns.forEach(fn => fn(k)); });
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') { joined = true; if (meta) ch.track(meta); resolve(true); }
    });
  });
  function members() {
    const st = ch.presenceState(), out = {};
    for (const k in st) if (st[k] && st[k][0]) out[k] = st[k][0];
    return out;
  }
  return {
    ready,
    on(event, fn) {
      if (!handlers[event]) { handlers[event] = []; ch.on('broadcast', { event }, ({ payload }) => handlers[event].forEach(f => f(payload))); }
      handlers[event].push(fn);
    },
    send(event, payload) { if (!closed) ch.send({ type: 'broadcast', event, payload }); },
    track(m) { meta = m; if (joined) ch.track(m); },
    members,
    onMembers(fn) { memberFns.push(fn); },
    onLeave(fn) { leaveFns.push(fn); },
    close() { if (closed) return; closed = true; try { sb.removeChannel(ch); } catch (e) { /* already gone */ } }
  };
}
