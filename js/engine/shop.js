/* The match shop's commands (the data and prices are js/content/shop.js): buyTile, upgradeTile, gamble, summonBoss. They join
   COMMANDS in commands.js, which hands over the helpers they share with the relic shop. A player has the shop if its account
   had unlocked it when the match began (player.shop). Rolls use the world's own 'shop' random stream. */
import { RELICS, RARITIES, rollRarity } from '../content/data.js';
import { TILE_EFFECTS, TILES, GAMBLE, OUTCOMES, JACKPOT, SUMMON_BOSS, summonReward } from '../content/shop.js';
import { tileAt, applyConduits } from './tiles.js';
import { spawnEnemy } from './enemies.js';

export const tilesOf = (w, p) => w.tiles.filter(t => t.owner === p.i);
export const tileCost = (w, p) => TILES.first + TILES.more * tilesOf(w, p).length;
export const upgradeCost = t => TILES.upgrade[t.level - 1];
export const gambleCost = p => GAMBLE.first + GAMBLE.more * p.gambles;
export const gamblesLeft = (w, p) => GAMBLE.perWave - (p.gambleWave === w.wave ? p.gambleN : 0);
/* Waves until a boss can be summoned again (0: now). */
export const bossWait = w => Math.max(0, w.bossNext - w.wave);
export const bossPay = w => summonReward(w.wave, w.bossesSummoned);
export const rollBossKind = w => Object.keys(SUMMON_BOSS.kinds)[w.rng.shop.int(Object.keys(SUMMON_BOSS.kinds).length)];

/* A relic the gamble can take or raise: not one with a one-time effect. */
const loose = p => p.relics.filter(r => { const d = RELICS.find(x => x.name === r.name); return d && d.mods && !d.onPick; });
/* Takes one copy of a relic back: its entry and exactly its modifiers. */
function removeRelic(p, r) {
  const def = RELICS.find(x => x.name === r.name);
  p.relics.splice(p.relics.indexOf(r), 1);
  for (const x of def.mods(RARITIES[r.r].mult)) {
    const i = p.mods.findIndex(m => m.source === def.name && m.ri === r.r && m.stat === x.stat && m.type === x.type && m.value === x.value);
    if (i >= 0) p.mods.splice(i, 1);
  }
}

export function shopCommands({ fail, OK, playerOf, blocked, inBounds, drawRelics, giveRelic, recalc }) {
  const customer = (w, c) => { const p = playerOf(w, c); return !p ? fail('no such player') : !p.shop ? fail('locked') : blocked(w, p) || { p }; };
  return {
    buyTile(w, c) {
      const { p, ...no } = customer(w, c); if (!p) return no;
      if (!TILE_EFFECTS[c.effect]) return fail('unknown effect');
      if (tilesOf(w, p).length >= TILES.max) return fail('limit');
      if (!inBounds(c.cx, c.cy) || w.pathSet.has(c.cx + ',' + c.cy) || tileAt(w, c.cx, c.cy)) return fail('blocked');
      const cost = tileCost(w, p);
      if (p.gold < cost) return fail('gold');
      p.gold -= cost;
      w.tiles.push({ effect: c.effect, level: 1, cx: c.cx, cy: c.cy, owner: p.i });
      applyConduits(w);
      return OK;
    },
    upgradeTile(w, c) {
      const { p, ...no } = customer(w, c); if (!p) return no;
      const t = tileAt(w, c.cx, c.cy);
      if (!t || t.owner !== p.i) return fail('no such tile');
      if (t.level >= TILES.levels) return fail('max level');
      const cost = upgradeCost(t);
      if (p.gold < cost) return fail('gold');
      p.gold -= cost; t.level++;
      applyConduits(w);
      return OK;
    },
    gamble(w, c) {
      const { p, ...no } = customer(w, c); if (!p) return no;
      if (gamblesLeft(w, p) <= 0) return fail('limit');
      const cost = gambleCost(p);
      if (p.gold < cost) return fail('gold');
      p.gold -= cost; p.gambles++;
      p.gambleN = p.gambleWave === w.wave ? p.gambleN + 1 : 1; p.gambleWave = w.wave;
      let x = w.rng.shop.next() * 100, o = OUTCOMES[0];
      for (const k of OUTCOMES) { if ((x -= k.chance) < 0) { o = k; break; } }
      const can = { raise: loose(p).some(r => r.r < RARITIES.length - 1), lose: loose(p).length > 0, curse: w.wave < w.maxWave };
      const id = o.id in can && !can[o.id] ? o.otherwise : o.id, got = [];
      const give = () => { const d = drawRelics(w, p, 1, [])[0]; if (d) { const ri = rollRarity(w.rng.shop.next(), p.gs.relicLuck); giveRelic(w, p, d.relic, ri); got.push({ name: d.relic.name, r: ri }); } };
      if (id === 'relic') give();
      else if (id === 'two') { give(); give(); }
      else if (id === 'jackpot') p.gold += cost * JACKPOT;
      else if (id === 'curse') w.curse = { wave: w.wave + 1, n: w.curse && w.curse.wave === w.wave + 1 ? w.curse.n + 1 : 1 };
      else if (id === 'lose') { const l = loose(p), r = l[w.rng.shop.int(l.length)]; removeRelic(p, r); got.push({ ...r }); }
      else if (id === 'raise') {
        const l = loose(p).filter(r => r.r < RARITIES.length - 1), r = l[w.rng.shop.int(l.length)];
        removeRelic(p, r); giveRelic(w, p, RELICS.find(d => d.name === r.name), r.r + 1); got.push({ name: r.name, r: r.r + 1 });
      }
      recalc(w);
      p.lastGamble = { id, got, paid: cost, n: p.gambles };
      w.ev.emit('gamble', { player: p.i, result: p.lastGamble });
      return OK;
    },
    /* Joins the wave that is going on, at the entrance. Shared in co-op: anyone with the shop can call it. */
    summonBoss(w, c) {
      const { p, ...no } = customer(w, c); if (!p) return no;
      if (w.phase !== 'wave') return fail('not in a wave');
      if (bossWait(w) > 0) return fail('cooldown');
      const gold = bossPay(w), e = spawnEnemy(w, w.bossKind);
      e.hp = e.max = Math.round(e.max * Math.pow(1 + SUMMON_BOSS.life, w.bossesSummoned));
      e.prize = { gold, left: 1, lost: false, stolen: w.players.map(() => 0) };
      w.bossesSummoned++; w.bossNext = w.wave + SUMMON_BOSS.cooldown; w.bossKind = rollBossKind(w);
      w.ev.emit('summonBoss', { enemy: e, player: p.i });
      return OK;
    }
  };
}

/* A summoned boss died (a split one: its last half): everyone is paid, unless a part of it got through. */
export function payPrize(w, e) {
  const z = e.prize;
  if (!z || --z.left > 0) return;
  if (!z.lost) for (const p of w.players) p.gold += z.gold + 2 * z.stolen[p.i];   /* what a Thief stole is gone if it gets away */
  w.ev.emit('prize', { enemy: e, gold: z.lost ? 0 : z.gold });
}
