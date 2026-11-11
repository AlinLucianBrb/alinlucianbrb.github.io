/* Co-op in the engine: 2 to 4 players share one map, the enemies, the lives and the waves; each has its own heroes, talents,
   items, gold and relics. Enemies have as many times the life as there are players. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, playerView } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { spawnEnemy } from '../js/engine/enemies.js';
import { tilesNearPath } from './helpers.mjs';
import { pathTo } from '../js/content/talents.js';

const coop = (n, seed = 3) => createWorld({ seed, stage: 1, players: Array.from({ length: n }, (_, i) => ({ lineup: [['warrior', 'ranger', 'mage', 'rogue'][i]] })) });

test('co-op worlds: one player per lobby member, enemy life x players, shared lives and waves', () => {
  const solo = createWorld({ seed: 3 }), duo = coop(2), four = coop(4);
  assert.equal(solo.coop, false); assert.equal(solo.players.length, 1); assert.equal(solo.hpMult, 1);
  assert.equal(duo.coop, true); assert.equal(duo.hpMult, 2); assert.equal(four.hpMult, 4);
  for (const w of [solo, duo, four]) { w.wave = 3; spawnEnemy(w, 'grunt'); }
  assert.ok(Math.abs(duo.enemies[0].max - 2 * solo.enemies[0].max) <= 1, '2 players: x2 life (rounded)');
  assert.ok(Math.abs(four.enemies[0].max - 4 * solo.enemies[0].max) <= 2, '4 players: x4 life (rounded)');
  assert.deepEqual(duo.players.map(p => p.gold), [100, 100], 'everyone starts with their own gold');
  assert.deepEqual(duo.log.players.map(p => p.lineup), [['warrior'], ['ranger']], 'the log keeps every player');
});

test('each player places, moves and evolves only their own heroes, and pays with their own gold', () => {
  const w = coop(2), t = tilesNearPath(w, 6);
  assert.ok(apply(w, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1], p: 0 }).ok);
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: t[1][0], cy: t[1][1], p: 1 }).reason, 'not in lineup', 'player 2 brought the Ranger');
  assert.ok(apply(w, { type: 'place', hero: 'ranger', cx: t[1][0], cy: t[1][1], p: 1 }).ok);
  assert.equal(apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1], p: 1 }).reason, 'already placed');
  const [war, ran] = w.heroes;
  assert.deepEqual([war.owner, ran.owner], [0, 1]);
  assert.equal(apply(w, { type: 'move', id: war.id, cx: t[2][0], cy: t[2][1], p: 1 }).reason, 'no such hero', "not someone else's hero");
  assert.equal(apply(w, { type: 'move', id: ran.id, cx: t[0][0], cy: t[0][1], p: 1 }).reason, 'blocked', 'tiles are shared');
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: 0, cy: 0, p: 7 }).reason, 'no such player');
  /* relics: each player's own gold, choice and relics */
  assert.ok(apply(w, { type: 'buyRelic', p: 1 }).ok);
  assert.equal(w.players[1].picking, true); assert.equal(w.players[0].picking, false);
  assert.ok(w.players[1].gold < 100 && w.players[0].gold === 100);
  const before = w.tick; step(w); assert.equal(w.tick, before + 1, 'a co-op match never waits for one player\'s relic choice');
  assert.equal(apply(w, { type: 'move', id: ran.id, cx: t[3][0], cy: t[3][1], p: 1 }).reason, 'busy', 'that player finishes choosing first');
  assert.ok(apply(w, { type: 'move', id: war.id, cx: t[3][0], cy: t[3][1], p: 0 }).ok, 'the other player is not held up');
  assert.ok(apply(w, { type: 'choose', index: 0, p: 1 }).ok);
  assert.equal(w.players[1].relics.length, 1); assert.equal(w.players[0].relics.length, 0);
});

test('relics and talents help only their own player\'s heroes; every player is paid for every kill', () => {
  const w = createWorld({ seed: 4, players: [{ lineup: ['ranger'], talents: pathTo(new Set(), 't4_might_s') }, { lineup: ['ranger'] }] }), t = tilesNearPath(w, 4);
  apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1], p: 0 });
  apply(w, { type: 'place', hero: 'ranger', cx: t[1][0], cy: t[1][1], p: 1 });
  const [a, b] = w.heroes;
  assert.ok(a.s.damage !== b.s.damage || a.s.strength !== b.s.strength, 'player 1\'s talents change only player 1\'s Ranger');
  w.wave = 1; spawnEnemy(w, 'grunt'); const e = w.enemies[0];
  const g0 = w.players.map(p => p.gold);
  w.hit(b, e, e.hp + 1);
  assert.ok(w.players[0].gold > g0[0] && w.players[1].gold > g0[1], 'both get the bounty');
});

test('the wave starts when every player is ready (or has Auto-start on)', () => {
  const w = coop(3);
  assert.ok(apply(w, { type: 'wave', p: 0 }).ok); assert.equal(w.phase, 'build', 'one of three is ready');
  assert.ok(apply(w, { type: 'auto', on: true, p: 2 }).ok);
  assert.ok(apply(w, { type: 'wave', p: 1 }).ok); assert.equal(w.phase, 'wave', 'two ready and one on auto: go');
  assert.ok(w.players.every(p => !p.ready), 'ready again for the next one');
  const s = createWorld({ seed: 1 }); apply(s, { type: 'wave' }); assert.equal(s.phase, 'wave', 'solo: at once');
});

test('a player\'s view shows that player\'s gold and relics on the shared world; co-op matches replay exactly', () => {
  const w = coop(2), t = tilesNearPath(w, 4);
  apply(w, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1], p: 0 });
  apply(w, { type: 'place', hero: 'ranger', cx: t[2][0], cy: t[2][1], p: 1 });
  apply(w, { type: 'buyRelic', p: 1 });
  const v1 = playerView(w, 1), v0 = playerView(w, 0);
  assert.equal(v1.gold, w.players[1].gold); assert.equal(v0.gold, 100); assert.equal(v1.picking, true); assert.equal(v0.picking, false);
  assert.equal(v1.heroes, w.heroes, 'the map is shared'); assert.equal(v1.relicCost(), w.relicCost(w.players[1]));
  apply(w, { type: 'choose', index: 1, p: 1 });
  apply(w, { type: 'auto', on: true, p: 0 }); apply(w, { type: 'auto', on: true, p: 1 });
  for (let i = 0; i < 60 * 120 && w.phase !== 'over'; i++) step(w);
  assert.ok(w.wave >= 3);
  assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w));
});

test('a player who leaves: their heroes stay, and the wave no longer waits for them', () => {
  const w = coop(2), t = tilesNearPath(w, 4);
  apply(w, { type: 'place', hero: 'ranger', cx: t[0][0], cy: t[0][1], p: 1 });
  apply(w, { type: 'buyRelic', p: 1 });
  assert.ok(apply(w, { type: 'wave', p: 0 }).ok); assert.equal(w.phase, 'build');
  assert.ok(apply(w, { type: 'leave', p: 1 }).ok);
  assert.equal(w.phase, 'wave', 'the one still here was ready');
  assert.equal(w.heroes.length, 1); assert.equal(w.players[1].picking, false);
  assert.equal(apply(w, { type: 'leave', p: 1 }).reason, 'already left');
  assert.equal(apply(createWorld({ seed: 1 }), { type: 'leave', p: 0 }).reason, 'no such player', 'not in solo');
  const v = playerView(w, 1);
  assert.ok(v.mine(w.heroes[0]) && !playerView(w, 0).mine(w.heroes[0]));
  assert.equal(v.unitOf(w.heroes[0].type), w.heroes[0]); assert.equal(playerView(w, 0).unitOf(w.heroes[0].type), undefined);
});
