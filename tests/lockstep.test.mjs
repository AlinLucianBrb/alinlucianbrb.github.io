/* Co-op lockstep over a fake network: the host and two guests end up with the very same world, even with messages held up,
   a lost turn (the guest asks again) and players acting at different times. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { createHost, createGuest, guestSteps } from '../js/net/lockstep.js';
import { hashWorld } from '../js/engine/hash.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { tilesNearPath } from './helpers.mjs';

/* A network of peers: send() reaches every other peer after `delay` pumps; drop(fn) loses the messages fn picks. */
function network() {
  const peers = [], inflight = [];
  let drop = () => false;
  const net = {
    peer(id) {
      const handlers = {};
      const t = { id, on: (ev, fn) => { handlers[ev] = fn; }, send: (ev, payload) => { for (const p of peers) if (p !== t) inflight.push({ to: p, ev, payload: JSON.parse(JSON.stringify(payload)), wait: net.delay }); }, handlers };
      peers.push(t); return t;
    },
    delay: 2,
    drop: fn => { drop = fn; },
    pump() {
      for (let i = 0; i < inflight.length; i++) {
        const m = inflight[i];
        if (m.wait-- > 0) continue;
        inflight.splice(i--, 1);
        if (drop(m)) continue;
        m.to.handlers[m.ev] && m.to.handlers[m.ev](m.payload);
      }
    }
  };
  return net;
}

const players = [{ lineup: ['warrior', 'mage'] }, { lineup: ['ranger'] }, { lineup: ['rogue', 'druid'] }];
const make = () => createWorld({ seed: 11, stage: 1, players });

function run({ dropTurn = -1, ticks = 60 * 150 } = {}) {
  const net = network();
  const hw = make(), g1w = make(), g2w = make();
  let clock = 0, turnsSeen = 0, desyncs = 0;
  const host = createHost({ world: hw, transport: net.peer('h'), me: 0, now: () => clock });
  const g1 = createGuest({ world: g1w, transport: net.peer('g1'), me: 1, onDesync: () => desyncs++ });
  const g2 = createGuest({ world: g2w, transport: net.peer('g2'), me: 2, onDesync: () => desyncs++ });
  net.drop(m => m.ev === 'turn' && m.to.id === 'g2' && turnsSeen++ === dropTurn);
  const t = tilesNearPath(hw, 8);
  /* What each player does, at their own (local) tick. */
  const plan = [
    [5, host, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1] }],
    [9, g1, { type: 'place', hero: 'ranger', cx: t[1][0], cy: t[1][1] }],
    [9, g2, { type: 'place', hero: 'rogue', cx: t[2][0], cy: t[2][1] }],
    [14, g2, { type: 'place', hero: 'druid', cx: t[3][0], cy: t[3][1] }],
    [20, g1, { type: 'place', hero: 'ranger', cx: t[4][0], cy: t[4][1] }],        /* refused (already placed): never played */
    [30, host, { type: 'auto', on: true }], [31, g1, { type: 'auto', on: true }], [44, g2, { type: 'wave' }],
    [400, g2, { type: 'auto', on: true }], [700, host, { type: 'place', hero: 'mage', cx: t[5][0], cy: t[5][1] }],
    [900, g1, { type: 'buyRelic' }], [1300, g1, { type: 'choose', index: 0 }]
  ];
  const done = new Set();
  for (let i = 0; i < ticks && !(hw.phase === 'over' && g1w.phase === 'over' && g2w.phase === 'over'); i++) {
    clock += 1000 / 60;
    if (hw.phase !== 'over') step(hw);
    host.flush();
    for (const [g, gw] of [[g1, g1w], [g2, g2w]]) {
      let n = guestSteps(g, 1);
      while (n-- > 0 && gw.phase !== 'over') { step(gw); g.afterStep(); }
    }
    plan.forEach((p, k) => {
      const wOf = p[1] === host ? hw : p[1] === g1 ? g1w : g2w;
      if (!done.has(k) && wOf.tick >= p[0]) { done.add(k); p[1].submit(p[2]); }
    });
    net.pump();
  }
  for (let i = 0; i < 200; i++) { host.flush(true); net.pump(); for (const [g, gw] of [[g1, g1w], [g2, g2w]]) { let n = guestSteps(g, 50); while (n-- > 0 && gw.phase !== 'over') { step(gw); g.afterStep(); } } }
  return { hw, g1w, g2w, desyncs };
}

test('the host and two guests play the very same match', () => {
  const { hw, g1w, g2w, desyncs } = run();
  assert.equal(desyncs, 0);
  assert.ok(hw.heroes.length === 5, 'everyone placed their heroes (and the repeat was refused)');
  assert.equal(hw.players[1].relics.length, 1, 'the guest bought and chose a relic');
  assert.ok(hw.wave >= 3);
  assert.equal(g1w.tick, hw.tick); assert.equal(g2w.tick, hw.tick);
  assert.equal(hashWorld(g1w), hashWorld(hw)); assert.equal(hashWorld(g2w), hashWorld(hw));
  assert.equal(JSON.stringify(g1w.log.commands), JSON.stringify(hw.log.commands), 'every player has the same log');
  assert.equal(hashWorld(replay(exportLog(g2w))), hashWorld(hw), 'and it replays');
});

test('a lost turn is asked for again, and the guest catches up in step', () => {
  const { hw, g2w, desyncs } = run({ dropTurn: 3 });
  assert.equal(desyncs, 0);
  assert.equal(g2w.tick, hw.tick);
  assert.equal(hashWorld(g2w), hashWorld(hw));
});

test('a guest notices when its world is not the host\'s', () => {
  const net = network(), hw = make(), gw = make();
  let clock = 0, seen = null;
  const host = createHost({ world: hw, transport: net.peer('h'), now: () => clock });
  const g = createGuest({ world: gw, transport: net.peer('g'), me: 1, onDesync: i => { seen = i; } });
  gw.players[1].gold += 1;                    /* something only the guest's world has */
  for (let i = 0; i < 60 * 8; i++) {
    clock += 1000 / 60; step(hw); host.flush(); net.pump();
    let n = guestSteps(g, 1); while (n-- > 0) { step(gw); g.afterStep(); }
  }
  assert.ok(seen && seen.hash, 'the hash check caught it');
  assert.equal(g.desynced, true);
});

test('the host plays a guest\'s leaving into the match', () => {
  const net = network(), hw = make();
  const host = createHost({ world: hw, transport: net.peer('h') });
  assert.ok(host.guestLeft(2).ok);
  assert.equal(hw.players[2].left, true);
  assert.equal(hw.log.commands.at(-1).type, 'leave');
});
