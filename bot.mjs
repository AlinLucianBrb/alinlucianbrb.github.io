/* A simple bot that plays the game through the same commands a player uses. It is not clever: it is a repeatable yardstick
   for balance ("how often does a sensible, unskilled player win level 3?") and a source of long, realistic test runs. */
import { HEROES, RARITIES, STAGES } from '../js/content/data.js';
import { TREES, TREE_ORDER, NODES, canAllocate, pointsFor } from '../js/content/talents.js';
import { createWorld, step, summary } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog } from '../js/engine/replay.js';
import { affected } from '../js/engine/stats.js';
import { T } from '../js/content/data.js';

/* Which heroes a strategy buys, in rotation. */
export const STRATEGIES = {
  balanced: ['warrior', 'archer', 'frostmage', 'thief', 'lightningmage', 'firemage'],
  melee: ['warrior'],
  ranged: ['archer', 'thief'],
  spell: ['frostmage', 'firemage', 'lightningmage']
};

/* Talents for a player of the given level: general damage/speed first, then the trees of the heroes the strategy uses. */
export function talentsFor(level, strategy = 'balanced') {
  const points = pointsFor(level), picked = new Set();
  const trees = ['general', ...STRATEGIES[strategy]];
  const order = [];
  for (const id of trees) for (let b = 0; b < 5; b++) for (let i = 0; i < 4; i++) { const nid = id + '_' + b + '_' + i; if (NODES.has(nid)) order.push(nid); }
  let progress = true;
  while (picked.size < points && progress) {
    progress = false;
    for (const nid of order) {
      if (picked.size >= points) break;
      if (!picked.has(nid) && canAllocate(picked, NODES.get(nid))) { picked.add(nid); progress = true; }
    }
  }
  return [...picked];
}

/* Free tiles ranked by how many path tiles are within a hero's range. */
function spotsFor(w, range) {
  const out = [];
  const cells = w.path.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]);
  for (let cx = 0; cx < 16; cx++) for (let cy = 0; cy < 10; cy++) {
    if (w.pathSet.has(cx + ',' + cy)) continue;
    const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
    let score = 0;
    for (const [x, y] of cells) if ((x - px) ** 2 + (y - py) ** 2 <= range * range) score++;
    if (score) out.push({ cx, cy, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function scoreOffer(w, o) {
  const m = RARITIES[o.ri].mult, a = affected(o.relic, m, w.heroes);
  if (a.global) return (o.relic.name === 'Reinforced gate' ? 2 : 1.5) * m;
  let n = 0; for (const c of a.types.values()) n += c;
  return n * 3 * m;
}

export function playRun({ seed = 1, stage = 1, strategy = 'balanced', level = 1, relics = true, maxTicks = 4000000 } = {}) {
  const talents = talentsFor(level, strategy);
  const w = createWorld({ seed, stage, talents });
  const names = STRATEGIES[strategy], order = names.map(n => HEROES.findIndex(h => h.id === n)), spotCache = new Map();
  let idx = 0;

  function buyHero() {
    for (let k = 0; k < order.length; k++) {
      const type = order[(idx + k) % order.length];
      if (w.gold < w.cost(type)) continue;
      const range = w.previewRange(type);
      if (!spotCache.has(range)) spotCache.set(range, spotsFor(w, range));
      for (const s of spotCache.get(range)) {
        if (apply(w, { type: 'place', hero: type, cx: s.cx, cy: s.cy }).ok) { idx = (idx + k + 1) % order.length; return true; }
      }
    }
    return false;
  }
  function spend() {
    while (buyHero()) { /* keep buying while affordable */ }
    if (relics && w.heroes.length >= 3 && w.relicsBought < 10 && w.gold >= w.relicCost() + 20 && apply(w, { type: 'buyRelic' }).ok) {
      let best = 0, bs = -1;
      w.pick.offers.forEach((o, i) => { const s = scoreOffer(w, o); if (s > bs) { bs = s; best = i; } });
      apply(w, { type: 'choose', index: best });
    }
  }

  while (w.phase !== 'over' && w.tick < maxTicks) {
    if (w.phase === 'build') { spend(); apply(w, { type: 'wave' }); }
    else if (w.tick % 60 === 0) spend();
    if (!step(w)) break;
  }
  return { world: w, result: summary(w), log: exportLog(w), stage, strategy, level, maxWave: STAGES[stage - 1].waves };
}
