/* Co-op lockstep. Every player runs the same deterministic world; only commands travel over the network.
   The host's game is the clock: it applies everyone's commands (its own at once, the others' when they arrive) and every
   TURN_MS sends a "turn": the commands applied since the last one, each with the tick it happened on, and upTo, the tick the
   host has reached. A guest never steps past upTo, and applies each command at its tick, so every world plays out the
   same. Now and then the host adds the world's hash at upTo, so a guest can tell when it has fallen out of step.

   transport: { send(event, payload), on(event, fn) }. In the game that is a Supabase Realtime channel (js/net/channel.js);
   in tests, a fake one. Events: 'cmd' (guest -> host), 'turn' (host -> all), 'resend' (guest -> host, after a gap). */
import { apply } from '../engine/commands.js';
import { hashWorld } from '../engine/hash.js';

export const TURN_MS = 200;          /* 5 turns a second, at any game speed */
export const HASH_EVERY = 25;        /* a hash with every 25th turn (about every 5 seconds) */

const strip = ({ t, ...cmd }) => cmd;

/* The host. submit() is how the host's own player acts. flush() is called by the game loop (after its steps); it sends a turn
   when one is due. guestLeft(p) tells the world that player p is gone. */
export function createHost({ world, transport, me = 0, now = () => Date.now() }) {
  const w = world;
  let sent = 0, lastSend = -Infinity, turns = 0, speed = 1;
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
    const t = now();
    if (!force && t - lastSend < TURN_MS) return false;
    lastSend = t; turns++;
    const cmds = w.log.commands.slice(sent), msg = { from: sent, cmds, upTo: w.tick, speed };
    sent = w.log.commands.length;
    if (turns % HASH_EVERY === 0 || w.phase === 'over') msg.hash = hashWorld(w);
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
export function createGuest({ world, transport, me, onDesync = () => {} }) {
  const w = world, queue = [], hashes = new Map();
  let got = 0, upTo = 0, speed = 1, asked = -1, desynced = false;
  transport.on('turn', m => {
    if (!m || !Array.isArray(m.cmds)) return;
    if (m.from > got) {                       /* a turn went missing: ask for everything since */
      if (asked !== got) { asked = got; transport.send('resend', { from: got, p: me }); }
      return;
    }
    const fresh = m.cmds.slice(got - m.from);
    queue.push(...fresh); got += fresh.length; asked = -1;
    if (m.upTo > upTo) upTo = m.upTo;
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
    afterStep: () => {
      const h = hashes.get(w.tick);
      if (h !== undefined) { hashes.delete(w.tick); if (h !== hashWorld(w)) desync({ at: w.tick, hash: true }); }
      for (const k of hashes.keys()) if (k < w.tick) hashes.delete(k);
      applyDue();
    },
    get speed() { return speed; },
    get lag() { return upTo - w.tick; },
    get desynced() { return desynced; }
  };
}

/* Steps a guest's world for one frame: at the host's speed, a little faster when it has fallen behind, and never past
   what the host has sent. Returns the number of steps taken. */
export function guestSteps(guest, frameTicks) {
  const lag = guest.allowed();
  if (lag <= 0) return 0;
  const boost = lag > 40 ? lag : lag > 15 ? frameTicks * 1.5 : frameTicks;   /* far behind (a hidden tab): catch up at once */
  return Math.min(lag, Math.max(0, Math.floor(boost)));
}
