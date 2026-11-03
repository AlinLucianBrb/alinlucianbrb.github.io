/* Everything a player can do is a command: { type, ...fields }. apply() checks it, changes the world and, if it worked, records it
   in world.log with the tick it happened on. A failed command changes nothing and is not recorded.
   To add an action, add an entry to COMMANDS. */
import { HEROES, RARITIES, RELICS, rollRarity, COLS, ROWS, T } from '../content/data.js';
import { heroStats } from './stats.js';
import { recalc, startWave } from './world.js';

const OK = { ok: true };
const fail = reason => ({ ok: false, reason });
const inBounds = (cx, cy) => Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
const isFree = (w, cx, cy, except) => inBounds(cx, cy) && !w.pathSet.has(cx + ',' + cy) && !w.heroes.some(h => h !== except && h.cx === cx && h.cy === cy);
const blocked = w => w.phase === 'over' ? fail('over') : w.picking ? fail('busy') : null;

function drawRelics(w, n, taken) {
  const pool = RELICS.filter(r => !w.banned.has(r.name) && !taken.includes(r.name)), out = [];
  while (out.length < n && pool.length) out.push({ relic: pool.splice(w.rng.relic.int(pool.length), 1)[0], ri: rollRarity(w.rng.relic.next()) });
  return out;
}

export const COMMANDS = {
  place(w, c) {
    const b = blocked(w); if (b) return b;
    const def = HEROES[c.hero];
    if (!def) return fail('unknown hero');
    if (!isFree(w, c.cx, c.cy)) return fail('blocked');
    const cost = w.cost(c.hero);
    if (w.gold < cost) return fail('gold');
    w.gold -= cost;
    const h = { id: w.nextHeroId++, type: c.hero, def, cx: c.cx, cy: c.cy, x: (c.cx + 0.5) * T, y: (c.cy + 0.5) * T,
      cd: 0, ramp: 0, lock: null, proj: null, dealt: 0, kills: 0, paid: cost, s: heroStats(def, w.mods) };
    w.heroes.push(h);
    return { ok: true, id: h.id };
  },
  sell(w, c) {
    const b = blocked(w); if (b) return b;
    const h = w.heroes.find(x => x.id === c.id);
    if (!h) return fail('no such hero');
    w.gold += Math.round(h.paid * 0.7);
    w.heroes.splice(w.heroes.indexOf(h), 1);
    let j = 0;
    for (let i = 0; i < w.projs.length; i++) if (w.projs[i].owner !== h) w.projs[j++] = w.projs[i];
    w.projs.length = j;
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

  /* Relic shop: buy, then choose one of three. Reroll or banish costs 25% of the relic's price, +5% each use. */
  buyRelic(w) {
    const b = blocked(w); if (b) return b;
    const cost = w.relicCost();
    if (w.gold < cost) return fail('gold');
    w.gold -= cost; w.relicsBought++;
    w.pick = { offers: drawRelics(w, 3, []), paid: cost, uses: 0 };
    w.picking = true;
    return OK;
  },
  reroll(w) {
    if (!w.pick) return fail('no relic choice open');
    const cost = w.pickCost();
    if (w.gold < cost) return fail('gold');
    w.gold -= cost; w.pick.uses++; w.pick.offers = drawRelics(w, 3, []);
    return OK;
  },
  banish(w, c) {
    if (!w.pick) return fail('no relic choice open');
    if (!w.pick.offers[c.index]) return fail('bad index');
    const cost = w.pickCost();
    if (w.gold < cost) return fail('gold');
    w.gold -= cost; w.pick.uses++;
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
