/* The balance bot: plays the game through the same commands a player uses, as a repeatable yardstick for balance ("how often
   does a good player win level 3 with these heroes?") and a source of long, realistic test runs. It places each hero on the
   best tile it can find, then spends gold on evolutions and relics. With skill 'smart' (the default) it plays like a good
   player (tools/balance/smart.mjs); 'simple' is the first, plainer bot. The experiments and the HTML report built on it are
   in tools/balance/ (npm run balance:report). */
import { HEROES, RARITIES, STAGES, T } from '../js/content/data.js';
import { TREES, TREE_ID, pathTo, pointsFor } from '../js/content/talents.js';
import { createWorld, step, summary } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { exportLog } from '../js/engine/replay.js';
import { affected, heroStats } from '../js/engine/stats.js';
import { spotsFor, offerValue, bestForm, betterSpot } from './balance/smart.mjs';
import { gearFor, playedDef } from './balance/gear.mjs';
import { attach } from './balance/collect.mjs';

/* Lineups the bot can play with. */
export const STRATEGIES = {
  trio: ['warrior', 'ranger', 'mage'],
  warrior: ['warrior'],
  ranger: ['ranger'],
  mage: ['mage'],
  rogue: ['rogue'],
  rogue3: ['rogue', 'ranger', 'mage'],
  druid: ['druid'],
  druid3: ['druid', 'ranger', 'mage'],
  priest: ['priest'], priest3: ['priest', 'ranger', 'warrior'],
  warlock: ['warlock'], warlock3: ['warlock', 'ranger', 'warrior'],
  paladin: ['paladin'], paladin3: ['paladin', 'ranger', 'mage'],
  shaman: ['shaman'], shaman3: ['shaman', 'ranger', 'warrior']
};

/* Talents for a player of the given level: whole clusters in order of usefulness for the lineup (damage and crits first,
   then the lineup's own clusters, then the rest), each reached by the shortest path from what is already taken. */
const HERO_CLUSTERS = { warrior: ['martial', 'sunder'], ranger: ['marksman'], mage: ['sorcery'], rogue: ['martial', 'precision'], druid: ['sorcery'],
  priest: ['sorcery', 'toxins'], warlock: ['sorcery', 'toxins'], paladin: ['martial', 'sunder'], shaman: ['sorcery', 'lightning'] };
export function talentsFor(level, strategy = 'trio') {
  const points = pointsFor(level), picked = new Set(), team = Array.isArray(strategy) ? strategy : STRATEGIES[strategy];
  const order = [...new Set(['might', ...team.flatMap(h => HERO_CLUSTERS[h] || []), 'precision', 'energy', 'gate', 'toxins', 'wealth', 'lightning', 'fire', 'cold', 'relics', 'tempo', 'fortune'])];
  const clusters = TREES[TREE_ID].clusters;
  for (const key of order) {
    const cl = clusters.find(c => c.key === key); if (!cl) continue;
    for (const node of cl.nodes) {
      const way = pathTo(picked, node.id);
      if (!way || picked.size + way.length > points) continue;
      for (const id of way) picked.add(id);
    }
  }
  /* Spend anything left over on whatever is next to what is taken. */
  for (const n of TREES[TREE_ID].nodes) if (picked.size < points && !n.root && !picked.has(n.id) && pathTo(picked, n.id).length === 1) picked.add(n.id);
  return [...picked];
}

function scoreOffer(w, o) {
  const m = RARITIES[o.ri].mult, a = affected(o.relic, m, w.heroes);
  if (a.global) return (o.relic.name === 'Reinforced gate' ? 2 : 1.5) * m;
  let n = 0; for (const c of a.types.values()) n += c;
  return n * 3 * m;
}

/* Plays one run and returns { world, result, log, stage, strategy, level, maxWave, metrics }.
   lineup (or strategy, a name in STRATEGIES): the heroes. level: the player level (its talents, see talentsFor).
   skill: 'smart' (default: see tools/balance/smart.mjs) or 'simple' (the first bot: best tile once, first form, relics by
   how many heroes they touch). form: forms to take, by id, comma-separated ('firemage,hunter'); others are chosen by the
   skill. paths: true takes those forms as evolution paths before the match. gear: 'none', 'common', 'rare' or 'epic'
   (tools/balance/gear.mjs; items overrides it). relics: false buys none. startRelics: [{ name, ri }] given before wave 1.
   collect: true also returns the measurements of tools/balance/collect.mjs. */
export function playRun({ seed = 1, stage = 1, strategy = 'trio', lineup = null, level = 1, relics = true, startRelics = [], items = null, gear = 'none',
  form = '', paths = false, skill = 'smart', collect = false, maxTicks = 4000000 } = {}) {
  const wanted = String(form || '').split(',').filter(Boolean), smart = skill !== 'simple';
  const team = lineup || STRATEGIES[strategy];
  const way = {};
  if (paths) for (const id of team) { const c = HEROES.find(h => h.id === id).evolutions[0].choices.find(x => wanted.includes(x.id)); if (c) way[id] = c.id; }
  const w = createWorld({ seed, stage, talents: talentsFor(level, team), lineup: team, items: items || gearFor(team, gear, way), paths: way, relics: startRelics });
  const rec = collect ? attach(w) : null;
  const rangeOf = id => heroStats(playedDef(id, way[id]), w.mods).range;
  /* Place every hero once, the shortest range first, so it gets the tiles right next to the path. */
  const order = [...team].sort((a, b) => rangeOf(a) - rangeOf(b));
  for (const id of order) {
    const def = playedDef(id, way[id]);
    for (const s of (smart ? spotsFor(w, rangeOf(id), def) : simpleSpots(w, rangeOf(id)))) if (apply(w, { type: 'place', hero: id, cx: s.cx, cy: s.cy }).ok) break;
  }
  const evolveCost = h => w.evolveCost(h);
  function spend(g = w) {
    for (const h of g.heroes) {
      const st = h.base.evolutions[h.tier];
      if (!st || h.level < g.evolveLevel(h) || g.gold < g.evolveCost(h)) continue;
      let i = st.choices.findIndex(c => wanted.includes(c.id));
      if (i < 0 && h.preview) i = st.choices.findIndex(c => c.id === h.preview.form);
      if (i < 0) i = smart && g === w ? bestForm(w, h, spendSimple) : Math.max(0, st.choices.findIndex(c => !(c.aura && c.aura.harmless)));
      const gold = g.gold;
      if (apply(g, { type: 'evolve', id: h.id, choice: i }).ok && g === w) {
        if (rec) rec.spend('evolve', gold - g.gold);
        const to = smart && betterSpot(g, h);
        if (to) apply(g, { type: 'move', id: h.id, cx: to.cx, cy: to.cy });
      }
    }
    /* Relics: keep the gold an evolution coming up soon will need. */
    const soon = g.heroes.find(h => h.base.evolutions[h.tier] && h.level >= g.evolveLevel(h) - (smart ? 2 : 0));
    const reserve = soon ? evolveCost(soon) : 0;
    /* the smart bot buys as long as it can afford one (one a second at most); the simple one stops at 12 */
    if (relics && (smart || g.relicsBought < 12) && g.gold >= g.relicCost() + (smart ? reserve : 0) && !(!smart && soon)) {
      const gold = g.gold;
      if (apply(g, { type: 'buyRelic' }).ok) {
        let best = 0, bs = -Infinity;
        g.pick.offers.forEach((o, i) => { const v = smart ? offerValue(g, o) : scoreOffer(g, o); if (v > bs) { bs = v; best = i; } });
        apply(g, { type: 'choose', index: best });
        if (rec && g === w) rec.spend('relic', gold - g.gold);
      }
    }
  }
  /* What the copies in a look ahead do between waves: the simple rules, so the look ahead stays quick. */
  function spendSimple(g) {
    for (const h of g.heroes) { const st = h.base.evolutions[h.tier]; if (st && h.level >= g.evolveLevel(h) && g.gold >= g.evolveCost(h)) apply(g, { type: 'evolve', id: h.id, choice: h.preview ? undefined : 0 }); }
  }
  while (w.phase !== 'over' && w.tick < maxTicks) {
    if (w.phase === 'build') { spend(); apply(w, { type: 'wave' }); }
    else if (w.tick % 60 === 0) spend();
    if (!step(w)) break;
    if (rec) rec.tick();
  }
  return { world: w, result: summary(w), log: exportLog(w), stage, strategy, lineup: team, level, maxWave: STAGES[stage - 1].waves, metrics: rec ? rec.finish() : null };
}

/* The first bot's tiles: free tiles ranked by path covered (kept for skill: 'simple'). */
function simpleSpots(w, range) {
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
