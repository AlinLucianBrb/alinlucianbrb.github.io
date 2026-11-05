/* A simple bot that plays the game through the same commands a player uses. It is not clever: it is a repeatable yardstick
   for balance ("how often does a sensible, unskilled player win level 3?") and a source of long, realistic test runs.
   It places each hero in its lineup once on the best tile it can find, then spends gold on evolutions and relics. */
import { HEROES, RARITIES, STAGES, T } from '../js/content/data.js';
import { NODES, canAllocate, pointsFor } from '../js/content/talents.js';
import { createWorld, step, summary } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog } from '../js/engine/replay.js';
import { affected, heroStats } from '../js/engine/stats.js';

/* Lineups the bot can play with. */
export const STRATEGIES = {
  trio: ['warrior', 'ranger', 'mage'],
  warrior: ['warrior'],
  ranger: ['ranger'],
  mage: ['mage']
};

/* Talents for a player of the given level, branch by branch in the single tree: damage and speed first, then the branches
   for the lineup's heroes (melee, projectiles, spells), then energy, elements, gold, the gate and the rest. */
const HERO_BRANCH = { warrior: 2, ranger: 3, mage: 4 };
export function talentsFor(level, strategy = 'trio') {
  const points = pointsFor(level), picked = new Set(), order = [];
  const branches = [0, 1, ...STRATEGIES[strategy].map(h => HERO_BRANCH[h]), 6, 5, 7, 10, 2, 3, 4, 8, 9, 11];
  for (const b of new Set(branches)) for (let i = 0; i < 4; i++) { const nid = 'main_' + b + '_' + i; if (NODES.has(nid)) order.push(nid); }
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

/* Free tiles ranked by how many path tiles are within a hero's range (later path tiles count a little more). */
function spotsFor(w, range) {
  const out = [], cells = w.path.map(([x, y], i) => [(x + 0.5) * T, (y + 0.5) * T, 1 + i / w.path.length]);
  for (let cx = 0; cx < 16; cx++) for (let cy = 0; cy < 10; cy++) {
    if (w.pathSet.has(cx + ',' + cy)) continue;
    const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
    let score = 0;
    for (const [x, y, wt] of cells) if ((x - px) ** 2 + (y - py) ** 2 <= range * range) score += wt;
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

/* form: which evolutions to take when a hero offers a choice, by choice id, comma-separated (e.g. 'firemage,hunter');
   heroes with none of them listed take their first choice. */
export function playRun({ seed = 1, stage = 1, strategy = 'trio', level = 1, relics = true, items = {}, form = 'firemage,marksman', maxTicks = 4000000 } = {}) {
  const wanted = String(form).split(',');
  const lineup = STRATEGIES[strategy];
  const w = createWorld({ seed, stage, talents: talentsFor(level, strategy), lineup, items });
  /* Place every hero once, longest range first so the short-range heroes get the tiles right next to the path. */
  const order = [...lineup].sort((a, b) => heroStats(HEROES.find(h => h.id === b), w.mods).range - heroStats(HEROES.find(h => h.id === a), w.mods).range);
  for (const id of [...order].reverse()) {
    for (const s of spotsFor(w, heroStats(HEROES.find(h => h.id === id), w.mods).range)) if (apply(w, { type: 'place', hero: id, cx: s.cx, cy: s.cy }).ok) break;
  }
  function spend() {
    for (const h of w.heroes) {
      const step = h.base.evolutions[h.tier];
      if (!step || h.level < step.level || w.gold < w.evolveCost(h)) continue;
      const i = step.choices.findIndex(c => wanted.includes(c.id));
      apply(w, { type: 'evolve', id: h.id, choice: i >= 0 ? i : 0 });
    }
    const evolving = w.heroes.some(h => w.evolveCost(h) !== null && h.level >= h.base.evolutions[h.tier].level);
    if (relics && !evolving && w.relicsBought < 12 && w.gold >= w.relicCost() && apply(w, { type: 'buyRelic' }).ok) {
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
