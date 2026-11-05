/* Everything a player can do is a command: { type, ...fields }. Commands: place, move, evolve, wave, auto, buyRelic, reroll, banish, choose. apply() checks it, changes the world and, if it worked, records it
   in world.log with the tick it happened on. A failed command changes nothing and is not recorded.
   To add an action, add an entry to COMMANDS. */
import { HEROES, RARITIES, RELICS, rollRarity, COLS, ROWS, T, evolvedDef, HERO_LEVELS } from '../content/data.js';
import { levelMods } from './levels.js';
import { recalc, startWave, statsFor } from './world.js';

const OK = { ok: true };
const fail = reason => ({ ok: false, reason });
const inBounds = (cx, cy) => Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
const isFree = (w, cx, cy, except) => inBounds(cx, cy) && !w.pathSet.has(cx + ',' + cy) && !w.heroes.some(h => h !== except && h.cx === cx && h.cy === cy);
const blocked = w => w.phase === 'over' ? fail('over') : w.picking ? fail('busy') : null;

function drawRelics(w, n, taken) {
  const pool = RELICS.filter(r => !w.banned.has(r.name) && !taken.includes(r.name)), out = [];
  while (out.length < n && pool.length) out.push({ relic: pool.splice(w.rng.relic.int(pool.length), 1)[0], ri: rollRarity(w.rng.relic.next(), w.gs.relicLuck) });
  return out;
}

/* How many relics to offer: 3, plus Merchant talents (each full 1 is one more; the rest is a chance of one more), at most 5.
   Rolls only when there is a fraction, so matches without Merchant talents use no extra random numbers. */
export const MAX_OFFERS = 5;
function offerCount(w) {
  const x = w.gs.relicOffers || 0, whole = Math.floor(x + 1e-9), rest = x - whole;
  return Math.min(MAX_OFFERS, 3 + whole + (rest > 1e-9 && w.rng.relic.next() < rest ? 1 : 0));
}

export const COMMANDS = {
  /* Heroes are free to place, one of each, and only those in the match lineup. */
  place(w, c) {
    const b = blocked(w); if (b) return b;
    const type = HEROES.findIndex(h => h.id === c.hero), def = HEROES[type];
    if (!def) return fail('unknown hero');
    if (!w.lineup.includes(def.id)) return fail('not in lineup');
    if (w.heroes.some(h => h.type === type)) return fail('already placed');
    if (!isFree(w, c.cx, c.cy)) return fail('blocked');
    const level = Math.min(HERO_LEVELS.max, 1 + w.gs.heroStartLevel);   /* Training talents: heroes start at a higher level */
    const h = { id: w.nextHeroId++, type, def, base: def, path: [], cx: c.cx, cy: c.cy, x: (c.cx + 0.5) * T, y: (c.cy + 0.5) * T,
      cd: 0, ramp: 0, lock: null, proj: null, dealt: 0, kills: 0, energy: 0, ults: 0, tier: 0, mods: [], level, xp: 0, lvlMods: levelMods(level), s: null };
    statsFor(w, h);
    w.heroes.push(h);
    return { ok: true, id: h.id };
  },
  /* Spends gold to take a hero to its next evolution, once it has reached that step's level.
     choice picks one of the step's forms (the Mage's element); it can be left out when there is only one. */
  evolve(w, c) {
    const b = blocked(w); if (b) return b;
    const h = w.heroes.find(x => x.id === c.id);
    if (!h) return fail('no such hero');
    const step = h.base.evolutions[h.tier], cost = w.evolveCost(h);
    if (!step) return fail('fully evolved');
    const i = c.choice ?? (step.choices.length === 1 ? 0 : -1), choice = step.choices[i];
    if (!choice) return fail('choose an evolution');
    if (h.level < w.evolveLevel(h)) return fail('level');
    if (w.gold < cost) return fail('gold');
    w.gold -= cost;
    h.mods.push(...choice.mods.map(m => ({ ...m, source: choice.name, ri: -3 })));
    h.def = evolvedDef(h.def, choice);
    h.path.push(choice.id); h.tier++; h.lock = null;
    statsFor(w, h);
    w.ev.emit('evolve', { hero: h, evolution: choice });
    return OK;
  },
  move(w, c) {
    const b = blocked(w); if (b) return b;
    const h = w.heroes.find(x => x.id === c.id);
    if (!h) return fail('no such hero');
    if (!isFree(w, c.cx, c.cy, h)) return fail('blocked');
    h.cx = c.cx; h.cy = c.cy; h.x = (c.cx + 0.5) * T; h.y = (c.cy + 0.5) * T; h.cd = 1; h.lock = null;
    return OK;
  },
  wave(w) {
    if (w.phase !== 'build' || w.picking) return fail('not in build phase');
    startWave(w); return OK;
  },
  auto(w, c) { w.auto = !!c.on; w.autoT = 3; return OK; },

  /* Relic shop: buy, then choose one of three. Rerolls and banishes are free, but only talents give them (w.rerolls, w.banishes per match). */
  buyRelic(w) {
    const b = blocked(w); if (b) return b;
    const cost = w.relicCost();
    if (w.gold < cost) return fail('gold');
    w.gold -= cost; w.relicsBought++;
    w.pick = { offers: drawRelics(w, offerCount(w), []), paid: cost, uses: 0 };
    w.picking = true;
    return OK;
  },
  reroll(w) {
    if (!w.pick) return fail('no relic choice open');
    if (!(w.rerolls > 0)) return fail('no rerolls');
    w.rerolls--; w.pick.uses++; w.pick.offers = drawRelics(w, w.pick.offers.length, []);
    return OK;
  },
  banish(w, c) {
    if (!w.pick) return fail('no relic choice open');
    if (!w.pick.offers[c.index]) return fail('bad index');
    if (!(w.banishes > 0)) return fail('no banishes');
    w.banishes--; w.pick.uses++;
    w.banned.add(w.pick.offers[c.index].relic.name);
    w.pick.offers.splice(c.index, 1, ...drawRelics(w, 1, w.pick.offers.map(o => o.relic.name)));
    return OK;
  },
  choose(w, c) {
    if (!w.pick) return fail('no relic choice open');
    const o = w.pick.offers[c.index];
    if (!o) return fail('bad index');
    const m = RARITIES[o.ri].mult, r = o.relic;
    if (r.mods) for (const x of r.mods(m)) w.mods.push({ ...x, source: r.name, ri: o.ri });
    if (r.onPick) r.onPick(w, m);
    w.relics.push({ name: r.name, r: o.ri });
    w.pick = null; w.picking = false; recalc(w);
    return OK;
  }
};

export function apply(w, cmd) {
  const fn = COMMANDS[cmd.type];
  if (!fn) return fail('unknown command');
  const res = fn(w, cmd);
  if (res.ok && w.log) w.log.commands.push({ ...cmd, t: w.tick });
  return res;
}
