/* Co-op lockstep. Every player runs the same deterministic world; only commands travel over the network.
   The host's game is the clock: it applies everyone's commands (its own at once, the others' when they arrive) and sends
   "turns": the commands applied since the last turn, each with the tick it happened on, and upTo, the tick the host has
   reached. A guest never steps past upTo, and applies each command at its tick, so every world plays out the same. Every
   few seconds the host adds the world's hash at upTo, so a guest can tell when it has fallen out of step.

   Turns balance traffic (Supabase limits Realtime messages per second per project) against delay: a regular turn every
   IDLE_MS (3 a second), and as soon as someone acts, an early one (at most every TURN_MS), so a guest's command comes back
   at once. To stay smooth, a guest does not rush to upTo: it plays at the host's speed a little behind the host (about the
   longest recent gap between turns, so ~0.45 s), speeding up or slowing down slightly to hold that distance, so it never has
   to stop and wait for the next turn. A guest's own clicks therefore take effect about half a second later.
   (Cheaper AND instant would need rolling the world back and forth, which the engine cannot do yet.)

   transport: { send(event, payload), on(event, fn) }. In the game that is a Supabase Realtime channel (js/net/channel.js);
   in tests, a fake one. Events: 'cmd' (guest -> host), 'turn' (host -> all), 'resend' (guest -> host, after a gap). */
import { apply } from '../engine/commands.js';
import { hashWorld } from '../engine/hash.js';

export const TURN_MS = 80;           /* an early turn as soon as there is a command to pass on (at most this often) */
export const IDLE_MS = 333;          /* otherwise 3 a second (guests need upTo to move on, and wait about this long) */
export const HASH_MS = 5000;         /* a hash about every 5 seconds */
const TICKS_PER_S = 60;

const strip = ({ t, ...cmd }) => cmd;

/* The host. submit() is how the host's own player acts. flush() is called by the game loop (after its steps); it sends a turn
   when one is due. guestLeft(p) tells the world that player p is gone. */
export function createHost({ world, transport, me = 0, now = () => Date.now() }) {
  const w = world;
  let sent = 0, lastSend = -Infinity, lastHash = -Infinity, speed = 1;
  const own = c => ({ ...c, p: me });
  transport.on('cmd', m => {
    if (!m || !m.cmd || m.p === me || !w.players[m.p] || w.players[m.p].left) return;
    apply(w, { ...m.cmd, p: m.p });            /* a refused command is simply not recorded, so no one plays it */
  });
  transport.on('resend', m => {
    const from = Math.max(0, m && m.from | 0);
    transport.send('turn', { from, cmds: w.log.commands.slice(from), upTo: w.tick, speed });
  });
  function flush(force = false) {
    const t = now(), pending = w.log.commands.length > sent, since = t - lastSend;
    const due = force || since >= IDLE_MS || (pending && since >= TURN_MS) || (w.phase === 'over' && since >= TURN_MS);
    if (!due) return false;
    lastSend = t;
    const cmds = w.log.commands.slice(sent), msg = { from: sent, cmds, upTo: w.tick, speed };
    sent = w.log.commands.length;
    if (t - lastHash >= HASH_MS || w.phase === 'over') { lastHash = t; msg.hash = hashWorld(w); }
    transport.send('turn', msg);
    return true;
  }
  return {
    isHost: true, me,
    submit: cmd => apply(w, own(cmd)),
    flush,
    setSpeed: s => { speed = s; },
    guestLeft: p => apply(w, { type: 'leave', p }),
    /* The host is never held back. */
    allowed: () => Infinity
  };
}

/* A guest. submit() sends the command to the host (it happens when it comes back in a turn). The game loop asks allowed()
   for how many ticks it may step, and calls afterStep() after each one. onDesync(info) is called if the hashes differ. */
export function createGuest({ world, transport, me, onDesync = () => {}, now = () => Date.now() }) {
  const w = world, queue = [], hashes = new Map(), gaps = [IDLE_MS];   /* until it has seen some, assume idle turns */
  let got = 0, upTo = 0, speed = 1, asked = -1, desynced = false, lastAt = -1, acc = 0;
  transport.on('turn', m => {
    if (!m || !Array.isArray(m.cmds)) return;
    if (m.from > got) {                       /* a turn went missing: ask for everything since */
      if (asked !== got) { asked = got; transport.send('resend', { from: got, p: me }); }
      return;
    }
    const fresh = m.cmds.slice(got - m.from);
    queue.push(...fresh); got += fresh.length; asked = -1;
    if (m.upTo > upTo) {
      const t = now();
      if (lastAt >= 0) { gaps.push(t - lastAt); if (gaps.length > 6) gaps.shift(); }
      lastAt = t; upTo = m.upTo;
    }
    if (typeof m.speed === 'number') speed = m.speed;
    if (m.hash !== undefined && m.upTo >= w.tick) hashes.set(m.upTo, m.hash);
    applyDue();
  });
  /* Commands for the tick the world is on (they come before that tick's step, as on the host). */
  function applyDue() {
    while (queue.length && queue[0].t <= w.tick) {
      const c = queue.shift();
      if (c.t < w.tick || !apply(w, strip(c)).ok) desync({ at: w.tick, cmd: c });
    }
  }
  function desync(info) { if (!desynced) { desynced = true; onDesync(info); } }
  return {
    isHost: false, me,
    submit: cmd => { transport.send('cmd', { p: me, cmd }); return { ok: true, sent: true }; },
    flush: () => false,
    /* Ticks the guest may still step (the host's lead). */
    allowed: () => { applyDue(); return Math.max(0, upTo - w.tick); },
    /* How many ticks to step this frame (dt: real seconds since the last frame). The guest aims to be `buffer` behind
       where the host is now (its last upTo, plus the time since at the host's speed), so turns arrive before they are
       needed. It runs up to 60% faster (3x when well behind) or 50% slower to get there; far behind (a hidden tab), it jumps to upTo. */
    stepsFor(dt) {
      applyDue();
      const room = upTo - w.tick;
      if (room <= 0 || lastAt < 0) { acc = 0; return 0; }
      const rate = TICKS_PER_S * speed, hostNow = upTo + (now() - lastAt) / 1000 * rate;
      const buffer = (Math.max(IDLE_MS, ...gaps) * 1.15 + 80) / 1000 * rate;
      const behind = hostNow - buffer - w.tick;                /* > 0: further back than it needs to be */
      if (behind > rate * 3) { acc = 0; return room; }
      /* well behind (it joined late, e.g. while the match was loading): up to 3x to catch up quickly; otherwise gently */
      acc += dt * rate * Math.min(behind > rate * 0.4 ? 3 : 1.6, Math.max(0.5, 1 + behind / rate));
      let n = Math.floor(acc); acc -= n;
      if (n >= room) { n = room; acc = 0; }
      return n;
    },
    afterStep: () => {
      const h = hashes.get(w.tick);
      if (h !== undefined) { hashes.delete(w.tick); if (h !== hashWorld(w)) desync({ at: w.tick, hash: true }); }
      for (const k of hashes.keys()) if (k < w.tick) hashes.delete(k);
      applyDue();
    },
    get speed() { return speed; },
    get lag() { return upTo - w.tick; },
    get buffered() { return Math.max(IDLE_MS, ...gaps); },
    get desynced() { return desynced; }
  };
}
