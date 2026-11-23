/* The match shop: ground effects (Greed, Conduit), the gamble, summoned bosses, and playing it all back. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, RARITIES, STAGES, T } from '../js/content/data.js';
import { TILE_EFFECTS, TILES, GAMBLE, OUTCOMES, JACKPOT, CURSE, SUMMON_BOSS, summonReward } from '../js/content/shop.js';
import { UNLOCKS } from '../js/content/unlocks.js';
import { createWorld, step, recalc } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { ENEMIES, spawnEnemy, updateEnemies } from '../js/engine/enemies.js';
import { updateAbilities } from '../js/engine/enemy-abilities.js';
import { tilesOf, tileCost, gambleCost, gamblesLeft, bossWait, bossPay } from '../js/engine/shop.js';
import { exportLog, replay, resume } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { worldOptions } from '../js/net/session.js';
import { killCap } from '../js/content/rules.js';
import { richWorld, place, enemyAt, withTemp } from './helpers.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const shopWorld = (o = {}) => richWorld({ stage: 2, shop: true, lineup: ['warrior', 'ranger', 'mage'], ...o });
/* Three free tiles side by side (a, b, c), b in the middle. */
function trio(w) {
  const free = (x, y) => x >= 0 && y >= 0 && x < 12 && y < 8 && !w.pathSet.has(x + ',' + y);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) if ([0, 1, 2, 3].every(k => free(x + k, y))) return [[x, y], [x + 1, y], [x + 2, y], [x + 3, y]];
  throw new Error('no room');
}
const buy = (w, effect, [cx, cy], p) => apply(w, { type: 'buyTile', effect, cx, cy, ...(p ? { p } : {}) });

test('the shop opens in act 3; without it every command is refused, and nothing changes', () => {
  assert.equal(UNLOCKS.shop.act, 3);
  const w = richWorld({ stage: 2 }), g = w.gold, n = w.log.commands.length;
  for (const c of [{ type: 'buyTile', effect: 'greed', cx: 0, cy: 0 }, { type: 'upgradeTile', cx: 0, cy: 0 }, { type: 'gamble' }, { type: 'summonBoss' }]) assert.equal(apply(w, c).reason, 'locked', c.type);
  assert.equal(w.gold, g); assert.equal(w.log.commands.length, n);
});

test('tiles: the price rises, at most 4, off the path, one effect a tile; two upgrades', () => {
  const w = shopWorld(), p = w.players[0], t = trio(w); let g = w.gold;
  assert.equal(buy(w, 'greed', w.path[3]).reason, 'blocked'); assert.equal(buy(w, 'greed', [-1, 0]).reason, 'blocked'); assert.equal(buy(w, 'nope', t[0]).reason, 'unknown effect');
  for (let k = 0; k < 4; k++) { assert.equal(tileCost(w, p), 300 + 150 * k); assert.ok(buy(w, k % 2 ? 'conduit' : 'greed', t[k]).ok); }
  assert.equal(g - w.gold, 300 + 450 + 600 + 750);
  assert.equal(buy(w, 'greed', t[0]).reason, 'limit'); assert.equal(tilesOf(w, p).length, TILES.max);
  g = w.gold; const up = () => apply(w, { type: 'upgradeTile', cx: t[0][0], cy: t[0][1] });
  assert.ok(up().ok); assert.ok(up().ok); assert.equal(g - w.gold, 1200); assert.equal(up().reason, 'max level');
  const one = shopWorld(); buy(one, 'greed', t[0]); assert.equal(buy(one, 'conduit', t[0]).reason, 'blocked', 'already an effect there');
  one.gold = 10; assert.equal(buy(one, 'greed', t[1]).reason, 'gold'); assert.equal(apply(one, { type: 'upgradeTile', cx: 0, cy: 0 }).reason, 'no such tile');
});

test('Greed: only the kills of the hero on the tile pay more, by its level', () => {
  const w = shopWorld(), t = trio(w), on = place(w, 'warrior', ...t[0]), off = place(w, 'ranger', ...t[1]);
  const paid = h => { const g = w.gold; w.hit(h, enemyAt(w, 0, 0, 0, 1), 10); return w.gold - g; };
  const base = paid(on); buy(w, 'greed', t[0]);
  assert.ok(base > 0); assert.equal(paid(on), base * 2); assert.equal(paid(off), base); assert.equal(paid(null), base);
  for (const v of [2.5, 3]) { apply(w, { type: 'upgradeTile', cx: t[0][0], cy: t[0][1] }); assert.equal(paid(on), Math.round(base * v)); }
  apply(w, { type: 'move', id: on.id, cx: t[2][0], cy: t[2][1] }); assert.equal(paid(on), base, 'the tile stays where it is');
});

test('Conduit: moves a share of damage, attributes, crits and penetration; nothing is made or lost, and range, speed and energy stay', () => {
  const w = shopWorld(), t = trio(w), a = place(w, 'warrior', ...t[0]), b = place(w, 'ranger', ...t[1]), c = place(w, 'mage', ...t[2]);
  const s0 = [a, b, c].map(h => ({ ...h.s }));
  assert.ok(buy(w, 'conduit', t[1]).ok);
  for (const k of ['damage', 'strength', 'dexterity', 'intellect', 'critChance', 'resPen']) {
    assert.ok(near(a.s[k], s0[0][k] * 0.5), 'the Warrior gives half his ' + k); assert.ok(near(c.s[k], s0[2][k] * 0.5), k);
    assert.ok(near(b.s[k], s0[1][k] + (s0[0][k] + s0[2][k]) * 0.5), 'the Hunter takes it: ' + k);
  }
  assert.ok(near(a.s.critDamage - 1, (s0[0].critDamage - 1) * 0.5)); assert.ok(b.s.critDamage > s0[1].critDamage);
  for (const h of [a, b, c]) for (const k of ['range', 'speed', 'castSpeed', 'energyPerAttack', 'energyMax', 'cooldown']) assert.equal(h.s[k], h.raw[k], k);
  for (const k of ['damage', 'critChance']) assert.ok(near(a.s[k] + b.s[k] + c.s[k], s0.reduce((x, s) => x + s[k], 0)), 'the same in all');
  apply(w, { type: 'upgradeTile', cx: t[1][0], cy: t[1][1] }); assert.ok(near(a.s.damage, s0[0].damage * 0.4), '60% at level 2');
  /* stats that change later, and moves, are followed */
  w.mods.push({ stat: 'damage', type: 'more', value: 1, scope: ['all'] }); recalc(w);
  assert.ok(near(a.raw.damage, s0[0].damage * 2) && near(a.s.damage, a.raw.damage * 0.4) && near(b.s.damage, b.raw.damage + (a.raw.damage + c.raw.damage) * 0.6));
  apply(w, { type: 'move', id: c.id, cx: t[3][0], cy: t[3][1] });
  assert.ok(near(c.s.damage, c.raw.damage), 'two tiles away: it gives nothing'); assert.ok(near(b.s.damage, b.raw.damage + a.raw.damage * 0.6));
  apply(w, { type: 'move', id: b.id, cx: t[2][0], cy: t[2][1] });
  assert.ok([a, b, c].every(h => near(h.s.damage, h.raw.damage)), 'nobody on it'); assert.equal(a.conduit, null);
});

test('Conduit: a hero gives to one conduit only, and one standing on a conduit gives to none', () => {
  const w = shopWorld(), t = trio(w), a = place(w, 'warrior', ...t[0]), b = place(w, 'ranger', ...t[1]), c = place(w, 'mage', ...t[2]);
  buy(w, 'conduit', t[0]); buy(w, 'conduit', t[2]);
  assert.ok(near(b.s.damage, b.raw.damage * 0.5), 'b gives once'); assert.ok(near(a.s.damage, a.raw.damage + b.raw.damage * 0.5)); assert.ok(near(c.s.damage, c.raw.damage));
  buy(w, 'conduit', t[1]); assert.ok([a, b, c].every(h => near(h.s.damage, h.raw.damage)), 'all on conduits: none gives');
});

test('co-op: tiles and gambles are each player\'s own; the boss and its gold are shared', () => {
  const w = createWorld(worldOptions({ seed: 3, stage: 2, players: [{ lineup: ['warrior'], shop: true }, { lineup: ['ranger'], shop: true }, { lineup: ['mage'] }] }));
  for (const p of w.players) p.gold = 5000;
  assert.deepEqual(w.players.map(p => p.shop), [true, true, false]);
  const t = trio(w); apply(w, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1], p: 0 }); apply(w, { type: 'place', hero: 'ranger', cx: t[1][0], cy: t[1][1], p: 1 });
  const [a, b] = w.heroes;
  assert.ok(buy(w, 'conduit', t[1], 1).ok); assert.ok(near(a.s.damage, a.raw.damage), 'an ally\'s hero gives nothing');
  assert.equal(buy(w, 'greed', t[2], 2).reason, 'locked'); assert.equal(apply(w, { type: 'upgradeTile', cx: t[1][0], cy: t[1][1], p: 0 }).reason, 'no such tile');
  assert.ok(apply(w, { type: 'gamble', p: 1 }).ok); assert.deepEqual(w.players.map(p => p.gambles), [0, 1, 0]);
  for (const p of w.players) apply(w, { type: 'wave', p: p.i });
  assert.ok(apply(w, { type: 'summonBoss', p: 1 }).ok); assert.equal(apply(w, { type: 'summonBoss', p: 0 }).reason, 'cooldown');
  const before = w.players.map(p => p.gold), e = w.enemies.find(x => x.def.summoned); e.ab = {}; e.type = 'bossCharger'; e.def = ENEMIES.bossCharger;
  w.hit(b, e, 1e9); assert.deepEqual(w.players.map((p, i) => p.gold - before[i]), Array(3).fill(summonReward(1, 0)));
});

/* Forces a gamble's outcome: the shop stream gives `rolls` in turn. */
function force(w, id, ...rolls) {
  let at = 0; for (const o of OUTCOMES) { if (o.id === id) break; at += o.chance; }
  const list = [(at + 0.5) / 100, ...rolls]; w.rng.shop.next = () => (list.length ? list.shift() : 0); w.rng.shop.int = n => Math.floor(w.rng.shop.next() * n);
}
test('the gamble: chances add up to 100, the price rises, 3 a wave', () => {
  assert.equal(OUTCOMES.reduce((a, o) => a + o.chance, 0), 100);
  const w = shopWorld(), p = w.players[0];
  for (let k = 0; k < GAMBLE.perWave; k++) { const g = p.gold; assert.equal(gambleCost(p), 150 + 50 * k); force(w, 'nothing'); assert.ok(apply(w, { type: 'gamble' }).ok); assert.equal(g - p.gold, 150 + 50 * k); }
  assert.equal(apply(w, { type: 'gamble' }).reason, 'limit'); w.wave++; assert.equal(gamblesLeft(w, p), 3);
  p.gold = 1; assert.equal(apply(w, { type: 'gamble' }).reason, 'gold');
});

test('the gamble: relics are won, lost and raised with exactly their modifiers; the jackpot; what cannot happen becomes something else', () => {
  const w = shopWorld(), p = w.players[0], t = trio(w); place(w, 'warrior', ...t[0]);
  const go = (id, ...r) => { p.gambleN = 0; force(w, id, ...r); const g = p.gold, c = gambleCost(p); assert.ok(apply(w, { type: 'gamble' }).ok, id); return p.gold - g + c; };
  go('lose'); assert.equal(p.lastGamble.id, 'nothing', 'no relic to lose');
  go('raise'); assert.equal(p.lastGamble.id, 'relic', 'none to raise: a relic instead'); assert.equal(p.relics.length, 1);
  p.relics.length = 0; p.mods.length = 0; recalc(w);
  go('two'); assert.equal(p.relics.length, 2);
  p.relics.length = 0; p.mods.length = 0; recalc(w); const clean = JSON.stringify(w.heroes[0].s);
  const give = (name, ri) => { const d = RELICS.find(r => r.name === name); for (const x of d.mods ? d.mods(RARITIES[ri].mult) : []) p.mods.push({ ...x, source: name, ri }); p.relics.push({ name, r: ri }); recalc(w); };
  give('Sharpened rounds', 1); give('Sharpened rounds', 1); const dmg2 = w.heroes[0].s.damage;
  go('raise', 0); assert.deepEqual(p.lastGamble.got, [{ name: 'Sharpened rounds', r: 2 }]); assert.deepEqual(p.relics.map(r => r.r).sort(), [1, 2]); assert.ok(w.heroes[0].s.damage > dmg2);
  go('lose', 0); go('lose', 0); assert.equal(p.relics.length, 0); assert.equal(p.mods.length, 0); assert.equal(JSON.stringify(w.heroes[0].s), clean, 'stats are back exactly');
  p.relics.push({ name: 'Reinforced gate', r: 0 }); go('lose'); assert.equal(p.lastGamble.id, 'nothing', 'a one-time relic cannot be lost'); assert.equal(p.relics.length, 1);
  const c = gambleCost(p); assert.equal(go('jackpot'), c * JACKPOT);
});

test('the gamble: a cursed wave has more life and pays double; two curses add up; none on the last wave', () => {
  const w = shopWorld(), p = w.players[0]; w.wave = 3;
  const life = () => { const e = spawnEnemy(w, 'grunt'); w.enemies.length = 0; return e.max; };
  force(w, 'curse'); apply(w, { type: 'gamble' }); assert.deepEqual(w.curse, { wave: 4, n: 1 }); const now = life(); w.wave = 4;
  const cursed = life(); w.curse = { wave: 4, n: 2 }; const twice = life(); w.curse = null; const plain = life();
  assert.ok(Math.abs(cursed / plain - (1 + CURSE.life)) < 0.02 && Math.abs(twice / plain - (1 + 2 * CURSE.life)) < 0.02); assert.ok(now < plain * 1.2, 'not the wave it was bought on');
  const paid = () => { const g = p.gold; w.hit(null, enemyAt(w, 0, 0, 0, 1), 9); return p.gold - g; }, base = paid();
  w.curse = { wave: 4, n: 1 }; assert.equal(paid(), 2 * base); w.wave = 5; assert.equal(paid(), base, 'only that wave');
  w.wave = w.maxWave; force(w, 'curse'); apply(w, { type: 'gamble' }); assert.equal(p.lastGamble.id, 'nothing');
});

/* A world in a wave with a summoned boss of that kind. */
function withBoss(kind, o = {}) {
  const w = shopWorld(o); w.wave = 9; apply(w, { type: 'wave' }); w.spawnLeft = 0; w.bossKind = kind;
  assert.ok(apply(w, { type: 'summonBoss' }).ok);
  return { w, e: w.enemies.find(x => x.def.summoned) };
}
test('summoning: only during a wave, a cooldown of 5 waves, tougher and richer each time', () => {
  const w = shopWorld(); assert.equal(apply(w, { type: 'summonBoss' }).reason, 'not in a wave');
  const { w: x, e } = withBoss('bossCharger');
  assert.equal(x.wave, 10); assert.equal(apply(x, { type: 'summonBoss' }).reason, 'cooldown'); assert.equal(bossWait(x), SUMMON_BOSS.cooldown);
  assert.equal(e.prize.gold, 300 + 30 * 10); const boss = spawnEnemy(x, 'boss'); assert.ok(Math.abs(e.max / boss.max - 3) < 0.01, 'three times a boss (5x the old 60%)');
  x.wave = 15; assert.equal(bossWait(x), 0); assert.equal(bossPay(x), Math.floor((300 + 450) * 1.25)); x.bossKind = 'bossThief'; assert.ok(apply(x, { type: 'summonBoss' }).ok);
  const second = x.enemies.at(-1), plain = spawnEnemy(x, 'bossThief'); assert.ok(Math.abs(second.max / plain.max - 1.15) < 0.01);
  assert.ok(Object.keys(SUMMON_BOSS.kinds).includes(x.bossKind), 'the next one is already known');
});

test('a summoned boss: its gold instead of a kill or an item; 5 lives if it gets through, never the match', () => {
  const { w, e } = withBoss('bossCharger'), p = w.players[0], g = p.gold, k = w.kills;
  w.hit(null, e, 1e9); assert.equal(p.gold - g, 600); assert.deepEqual([w.kills, w.bossKills], [k, 0]);
  const { w: x, e: f } = withBoss('bossCharger'); x.wave = x.maxWave; const lives = x.lives, gold = x.gold;
  f.d = (x.path.length - 1.01) * T; updateEnemies(x, 0.1);
  assert.equal(x.lives, lives - 5); assert.notEqual(x.phase, 'over', 'it is not the final boss'); assert.equal(x.gold, gold);
});

test('Splitter: two halves at half its life; paid once, when both are dead; nothing if one gets through', () => {
  const run = escape => {
    const { w, e } = withBoss('bossSplitter'), g = w.gold; updateAbilities(w, 0.01); assert.equal(w.enemies.length, 1);
    w.hit(null, e, e.max * 0.5 + 1); updateAbilities(w, 0.01);
    const halves = w.enemies.filter(x => x.type === 'bossHalf'); assert.equal(halves.length, 2); assert.ok(Math.abs(halves[0].max / e.def.hp) > 0 && halves[0].max === halves[1].max);
    w.hit(null, halves[0], 1e9); assert.equal(w.gold, g, 'not yet');
    if (escape) { halves[1].d = (w.path.length - 1.01) * T; updateEnemies(w, 0.1); } else w.hit(null, halves[1], 1e9);
    return w.gold - g;
  };
  assert.equal(run(false), 600); assert.equal(run(true), 0);
});
test('Charger, Blinker, Warded and Thief do what they say', () => {
  { const { w, e } = withBoss('bossCharger'); updateAbilities(w, 0.1); const v = e.speed; e.hp = e.max * 0.2; updateAbilities(w, 0.1); assert.ok(near(e.speed, v * (1 + 1.5 * 0.8))); }
  { const { w, e } = withBoss('bossBlinker'); updateAbilities(w, 0.1); const d = e.d; e.hp = e.max * 0.6; updateAbilities(w, 0.1); assert.equal(e.d - d, 2 * T); updateAbilities(w, 0.1); assert.equal(e.d - d, 2 * T, 'once a mark');
    e.hp = 1; updateAbilities(w, 0.1); assert.equal(e.d - d, 6 * T); e.ab.n = 0; e.d = (w.path.length - 2.1) * T; updateAbilities(w, 0.1); assert.ok(e.d <= (w.path.length - 2) * T, 'never onto the gate'); }
  { const { w, e } = withBoss('bossWarded'); const hurt = (type, n) => { const h = e.hp; w.hit(null, e, n, type); return h - e.hp; };
    updateAbilities(w, 0.1); assert.equal(hurt('fire', 10), 10); hurt('cold', 2); updateAbilities(w, 5); assert.ok(near(hurt('fire', 10), 2.5)); assert.equal(hurt('cold', 10), 10);
    updateAbilities(w, 5.1); assert.equal(hurt('fire', 4) , 1, 'fire was still tried hardest'); hurt('cold', 50); updateAbilities(w, 5.1); assert.equal(hurt('fire', 4), 4, 'now it wards cold'); }
  { const { w, e } = withBoss('bossThief'), g = w.gold; updateAbilities(w, 3); updateAbilities(w, 3); assert.equal(g - w.gold, 20); w.hit(null, e, 1e9); assert.equal(w.gold - g, 600 + 20, 'its gold, and the 20 back twice'); }
  { const { w, e } = withBoss('bossThief'), g = w.gold; updateAbilities(w, 3); e.d = (w.path.length - 1.01) * T; updateEnemies(w, 0.1); assert.equal(g - w.gold, 10, 'gone if it gets away'); }
});

test('a match with everything in the shop replays and resumes exactly, and never claims more than the server allows', () => {
  withTemp(STAGES[1], { hpMult: 0.2, growth: 1.06, waves: 24 }, () => {
    for (const seed of [2, 9]) {
      const w = createWorld({ seed, stage: 2, shop: true, lineup: ['warrior', 'ranger', 'mage'] }), t = trio(w); let bosses = 0, half = null;
      w.ev.on('prize', () => bosses++);
      for (let k = 0; k < 60 * 2000 && w.phase !== 'over'; k++) {
        if (w.phase === 'build') apply(w, { type: 'wave' });
        for (const [i, id] of ['warrior', 'ranger', 'mage'].entries()) if (!w.heroes.some(h => h.base.id === id)) apply(w, { type: 'place', hero: id, cx: t[i][0], cy: t[i][1] });
        if (k % 600 === 0) { buy(w, 'conduit', t[1]); buy(w, 'greed', t[0]); apply(w, { type: 'upgradeTile', cx: t[1][0], cy: t[1][1] }); apply(w, { type: 'gamble' }); apply(w, { type: 'summonBoss' }); }
        step(w);
        if (w.wave === 8 && !half) half = { log: exportLog(w), hash: hashWorld(w) };
      }
      assert.ok(w.players[0].gambles > 2 && w.bossesSummoned > 1 && w.tiles.length === 2, 'seed ' + seed + ': ' + [w.players[0].gambles, w.bossesSummoned, w.tiles.length]);
      const log = exportLog(w); assert.equal(log.shop, true); assert.equal(hashWorld(replay(log)), hashWorld(w)); assert.equal(hashWorld(resume(half.log)), half.hash);
      assert.ok(w.kills <= killCap(w.wave)); assert.ok(w.bossKills <= 1);
    }
  });
});

test('a world without the shop plays exactly as it would with an untouched one', () => {
  const run = shop => { const w = createWorld({ seed: 6, stage: 1, shop }), t = trio(w); apply(w, { type: 'place', hero: 'warrior', cx: t[0][0], cy: t[0][1] }); apply(w, { type: 'auto', on: true }); for (let k = 0; k < 4000; k++) step(w); return hashWorld(w); };
  assert.equal(run(false), run(true));
});
