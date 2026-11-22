/* Everything a player can do is a command: { type, ...fields, p }. p is the player (0 solo; 0 to 3 in co-op): a player
   can only move or evolve its own heroes, and spends its own gold. Commands: place, move, evolve, wave, leave, auto, buyRelic, reroll, banish, choose. apply() checks it, changes the world and, if it worked, records it
   in world.log with the tick it happened on. A failed command changes nothing and is not recorded.
   To add an action, add an entry to COMMANDS. */
import { HEROES, RARITIES, RELICS, rollRarity, COLS, ROWS, T, evolvedDef, nextStep, HERO_LEVELS, HERO_COST, PAY_FOR_HEROES } from '../content/data.js';
import { pathChoice, pathDef, startPreview, endPreview } from './preview.js';
import { affected } from './stats.js';
import { levelMods } from './levels.js';
import { recalc, startWave, statsFor, endRun } from './world.js';
import { shopCommands } from './shop.js';
import { applyConduits, hasConduit } from './tiles.js';
import { giveRelic } from './relics.js';
import { castVote, mapVoteOpen } from './match-effects.js';

const OK = { ok: true };
const fail = reason => ({ ok: false, reason });
const inBounds = (cx, cy) => Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
/* A free tile: on the map, not taken by a hero or a totem, and off the path (unless the hero flies: the Archangel). */
const isFree = (w, cx, cy, except) => inBounds(cx, cy) && !w.noBuild.has(cx + ',' + cy) && (!w.pathSet.has(cx + ',' + cy) || !!(except && (except.def.flying || except.def.onPath)))
  && !w.heroes.some(h => h !== except && h.cx === cx && h.cy === cy) && !w.zones.some(z => z.blocks && z.cx === cx && z.cy === cy);
/* Can this hero stand on that tile (ignoring other heroes)? On the map, off the path unless it flies or fights on it, not on a
   blocking zone. */
const canStand = (w, h, cx, cy) => inBounds(cx, cy) && !w.noBuild.has(cx + ',' + cy) && (!w.pathSet.has(cx + ',' + cy) || !!(h.def.flying || h.def.onPath))
  && !w.zones.some(z => z.blocks && z.cx === cx && z.cy === cy);
/* A hero moved to a tile: it waits 1 second before attacking again (settle: the screen shows it resting meanwhile). */
const regroup = w => { if (w.mapEffect === 'ley') for (const h of w.heroes) statsFor(w, h); if (hasConduit(w)) applyConduits(w); };   /* heroes stand elsewhere: Ley lines, and the Conduits' neighbours */
const settle = (h, cx, cy) => { h.cx = cx; h.cy = cy; h.x = (cx + 0.5) * T; h.y = (cy + 0.5) * T; h.cd = 1; h.lock = null; h.settle = 1; };
const blocked = (w, p) => w.phase === 'over' ? fail('over') : p.picking ? fail('busy') : mapVoteOpen(w) ? fail('vote') : null;
const playerOf = (w, c) => w.players[c.p | 0];

/* Does a relic do anything for this player's heroes? Economy and gate relics always do. A hero relic must touch one of the
   heroes ON THE MAP (with none placed yet: the lineup), as it plays: a form takes priority, so an evolved hero, or one with
   a path chosen, counts only as that form; a basic hero with no path counts as itself and every form it could become.
   Relics limited to some heroes (r.lineup) also need one of them there. */
export function relicFits(r, p, w = null) {
  const mine = w ? w.heroes.filter(h => (h.owner || 0) === p.i) : [];
  const heroes = mine.length ? mine.map(h => ({ id: h.base.id, h })) : p.lineup.map(id => ({ id, h: null }));
  if (r.lineup && !r.lineup.some(id => heroes.some(x => x.id === id))) return false;
  const defs = [];
  for (const { id, h } of heroes) {
    const base = HEROES.find(x => x.id === id);
    if (!base) continue;
    if (h && h.tier > 0) { defs.push(h.def); continue; }   /* evolved: its form only */
    const path = (h && h.preview && h.preview.form) || p.paths[id];
    const forms = base.evolutions.flatMap(st => st.choices).filter(c => !path || c.id === path);
    if (!path) defs.push(base);
    for (const c of forms) defs.push(evolvedDef(base, c));
  }
  const a = affected(r, 1, defs.map((def, k) => ({ type: k, def })));
  return !!(a.global || a.types.size);
}

function drawRelics(w, p, n, taken) {
  const pool = RELICS.filter(r => !p.banned.has(r.name) && !taken.includes(r.name) && relicFits(r, p, w)), out = [];   /* only relics for the heroes on the map */
  const draw = () => out.push({ relic: pool.splice(w.rng.relic.int(pool.length), 1)[0], ri: w.fxm.epicRelics ? RARITIES.length - 1 : rollRarity(w.rng.relic.next(), p.gs.relicLuck) });
  while (out.length < n && pool.length) draw();
  /* at least one relic of every offer does something in a fight (fresh), when there is one for these heroes */
  if (n > 1 && out.length && !out.some(o => o.relic.fresh) && pool.some(r => r.fresh)) {
    const fresh = pool.filter(r => r.fresh), o = out[out.length - 1];
    o.relic = fresh[w.rng.relic.int(fresh.length)];
  }
  return out;
}

/* How many relics to offer: 3, plus Merchant talents (each full 1 is one more; the rest is a chance of one more), at most 5.
   Rolls only when there is a fraction, so matches without Merchant talents use no extra random numbers. */
export const MAX_OFFERS = 5;
function offerCount(w, p) {
  const x = p.gs.relicOffers || 0, whole = Math.floor(x + 1e-9), rest = x - whole;
  return Math.min(MAX_OFFERS, 3 + whole + (rest > 1e-9 && w.rng.relic.next() < rest ? 1 : 0));
}

export const COMMANDS = {
  /* Placing a hero costs HERO_COST gold, one of each, and only those in the match lineup. */
  place(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    const b = blocked(w, p); if (b) return b;
    const type = HEROES.findIndex(h => h.id === c.hero), def = HEROES[type];
    if (!def) return fail('unknown hero');
    if (!p.lineup.includes(def.id)) return fail('not in lineup');
    if (w.heroes.some(h => h.type === type && (h.owner || 0) === p.i)) return fail('already placed');
    if (!isFree(w, c.cx, c.cy)) return fail('blocked');
    const price = PAY_FOR_HEROES.on ? HERO_COST : 0;
    if (p.gold < price) return fail('gold');
    p.gold -= price;
    const level = Math.min(HERO_LEVELS.max, 1 + p.gs.heroStartLevel);   /* Training talents: heroes start at a higher level */
    const h = { id: w.nextHeroId++, owner: p.i, type, def, base: def, path: [], cx: c.cx, cy: c.cy, x: (c.cx + 0.5) * T, y: (c.cy + 0.5) * T,
      cd: 0, ramp: 0, lock: null, proj: null, dealt: 0, kills: 0, energy: 0, ults: 0, tier: 0, mods: [], level, xp: 0, lvlMods: levelMods(level), s: null };
    const way = p.paths && p.paths[def.id] && pathChoice(def.id, p.paths[def.id]);
    if (way) startPreview(h, way);   /* an evolution path chosen before the match: the form's preview from level 1 */
    statsFor(w, h);
    w.heroes.push(h);
    regroup(w);
    return { ok: true, id: h.id };
  },
  /* Spends gold to take a hero to its next evolution, once it has reached that step's level.
     choice picks one of the step's forms (the Mage's element); it can be left out when there is only one. */
  evolve(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    const b = blocked(w, p); if (b) return b;
    const h = w.heroes.find(x => x.id === c.id);
    if (!h || (h.owner || 0) !== p.i) return fail('no such hero');
    const step = nextStep(h), cost = w.evolveCost(h);
    if (!step) return fail('fully evolved');
    /* A hero with a path evolves into that form, and only that one. */
    const planned = h.tier === 0 && h.preview ? step.choices.findIndex(x => x.id === h.preview.form) : -1;
    if (planned >= 0 && c.choice != null && c.choice !== planned) return fail('path');
    const i = planned >= 0 ? planned : c.choice ?? (step.choices.length === 1 ? 0 : -1), choice = step.choices[i];
    if (!choice) return fail('choose an evolution');
    if (h.level < w.evolveLevel(h)) return fail('level');
    if (p.gold < cost) return fail('gold');
    p.gold -= cost;
    if (step.upgrade) h.def = { ...h.def, upgrade: choice };   /* the second evolution: no new form, no stats */
    else {
      h.mods.push(...choice.mods.map(m => ({ ...m, source: choice.name, ri: -3 })));
      endPreview(h);
      h.def = evolvedDef(h.def, choice);
    }
    h.path.push(choice.id); h.tier++; h.lock = null;
    statsFor(w, h);
    w.ev.emit('evolve', { hero: h, evolution: choice });
    return OK;
  },
  move(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    const b = blocked(w, p); if (b) return b;
    const h = w.heroes.find(x => x.id === c.id);
    if (!h || (h.owner || 0) !== p.i) return fail('no such hero');
    /* onto another of your own heroes: they swap places (only your own: in co-op an ally's hero stays where it is) */
    const o = w.heroes.find(x => x !== h && x.cx === c.cx && x.cy === c.cy);
    if (o) {
      if ((o.owner || 0) !== p.i) return fail('blocked');
      if (!canStand(w, h, c.cx, c.cy) || !canStand(w, o, h.cx, h.cy)) return fail('blocked');
      const [ox, oy] = [h.cx, h.cy];
      settle(h, c.cx, c.cy); settle(o, ox, oy);
      regroup(w);
      return OK;
    }
    if (!isFree(w, c.cx, c.cy, h)) return fail('blocked');
    settle(h, c.cx, c.cy);
    regroup(w);
    return OK;
  },
  /* Ready for the next wave. It starts once every player is ready (or has Auto-start on): solo, at once. */
  wave(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    if (w.phase !== 'build' || p.picking || mapVoteOpen(w)) return fail('not in build phase');
    p.ready = true;
    if (w.players.every(x => x.ready || x.auto)) startWave(w);
    return OK;
  },
  /* Co-op: a player left the match (sent by the host). Their heroes stay and keep fighting; they no longer hold up a wave. */
  leave(w, c) {
    const p = playerOf(w, c); if (!p || !w.coop) return fail('no such player');
    if (p.left) return fail('already left');
    p.left = true; p.auto = true; p.pick = null; p.picking = false;
    if (w.phase === 'build' && w.players.every(x => x.ready || x.auto)) startWave(w);
    return OK;
  },
  auto(w, c) { const p = playerOf(w, c); if (!p) return fail('no such player'); p.auto = !!c.on; w.autoT = 3; return OK; },
  /* Endless, solo: ends the run here, to be saved (the next step sends 'end'). */
  retire(w) {
    if (!w.stage.endless || w.coop) return fail('not in this match');
    if (w.phase === 'over') return fail('over');
    endRun(w, false);
    return OK;
  },
  /* Match effects: a vote for one of the offers, or -1 for none (solo, it decides). */
  vote(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    const why = w.phase === 'over' ? 'over' : castVote(w, p, c.index, recalc);
    return why ? fail(why) : OK;
  },
  /* Keep the game running while the relic choice is open (a player setting; off by default). Allowed at any time. */
  playOnPick(w, c) { const p = playerOf(w, c); if (!p) return fail('no such player'); p.playOnPick = !!c.on; return OK; },

  /* Relic shop: buy, then choose one of three. Banishes come only from talents; rerolls are free while talents give you some
     (w.rerolls per match), then cost gold (w.rerollCost). */
  buyRelic(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    const b = blocked(w, p); if (b) return b;
    const cost = w.relicCost(p);
    if (p.gold < cost) return fail('gold');
    p.gold -= cost; p.relicsBought++;
    p.pick = { offers: drawRelics(w, p, offerCount(w, p), []), paid: cost, uses: 0 };
    p.picking = true;
    return OK;
  },
  reroll(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    if (!p.pick) return fail('no relic choice open');
    if (p.rerolls > 0) p.rerolls--;
    else {
      const cost = w.rerollCost(p);
      if (p.gold < cost) return fail('gold');
      p.gold -= cost; p.pick.goldRerolls = (p.pick.goldRerolls || 0) + 1;
    }
    p.pick.uses++; p.pick.offers = drawRelics(w, p, p.pick.offers.length, []);
    return OK;
  },
  banish(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    if (!p.pick) return fail('no relic choice open');
    if (!p.pick.offers[c.index]) return fail('bad index');
    if (!(p.banishes > 0)) return fail('no banishes');
    p.banishes--; p.pick.uses++;
    p.banned.add(p.pick.offers[c.index].relic.name);
    p.pick.offers.splice(c.index, 1, ...drawRelics(w, p, 1, p.pick.offers.map(o => o.relic.name)));
    return OK;
  },
  choose(w, c) {
    const p = playerOf(w, c); if (!p) return fail('no such player');
    if (!p.pick) return fail('no relic choice open');
    const o = p.pick.offers[c.index];
    if (!o) return fail('bad index');
    giveRelic(w, p, o.relic, o.ri);
    p.pick = null; p.picking = false; recalc(w);
    return OK;
  }
};

/* The match shop: tiles, gambling, summoning a boss (shop.js). */
Object.assign(COMMANDS, shopCommands({ fail, OK, playerOf, blocked, inBounds, drawRelics, giveRelic, recalc }));

export function apply(w, cmd) {
  const fn = COMMANDS[cmd.type];
  if (!fn) return fail('unknown command');
  const res = fn(w, cmd);
  if (res.ok && w.log) w.log.commands.push({ ...cmd, t: w.tick });
  return res;
}
