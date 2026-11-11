/* How the smart bot decides, the way a good player would:
   - where to stand: free tiles ranked by how much path the hero covers from there with its real range; path the heroes
     already placed cover counts less (each extra hero on a stretch adds less), so the team spreads along the path and
     no hero is left where the others have already killed everything (heroes that may stand on the path, the Archangel
     and the Crusader, can take path tiles too);
   - which relic: each offer is valued by how much it raises the team's damage per second (power()) or, for the economy and
     the gate, by what it is worth for the rest of the run;
   - which form: a look ahead. The run so far is replayed into copies of the world (resume), each copy evolves the hero
     into one form and plays on through the next boss wave (if one comes within LOOKAHEAD.bossWithin waves) or for
     LOOKAHEAD.seconds; the copy that lost the fewest lives, killed its boss and dealt the most damage (damage to bosses
     counting LOOKAHEAD.bossWeight times) wins, so a form that clears crowds but cannot kill bosses is not picked;
   - after an evolution changes a hero's range, it moves to a better tile if one is clearly better;
   - supports stand where they help the others, not where they cover the most path: a curse aura (Occult) where the
     other heroes' ranges overlap the path inside it, a blessing aura (Incantation) and the forms that help the heroes
     around them (Gospel's energy) among as many heroes as possible; they are checked again after every evolution, since
     the others move too. */
import { T, COLS, ROWS, RARITIES } from '../../js/content/data.js';
import { resume, exportLog } from '../../js/engine/replay.js';
import { step } from '../../js/engine/world.js';
import { apply } from '../../js/engine/commands.js';
import { affected } from '../../js/engine/stats.js';
import { isBossWave } from '../../js/engine/enemies.js';

export const LOOKAHEAD = { seconds: 60, bossWithin: 5, bossWeight: 3, maxSeconds: 420 };

/* Free tiles for a hero, best first: { cx, cy, score }. def decides whether path tiles are allowed. */
export function spotsFor(w, range, def = null) {
  const out = [], n = w.path.length, onPath = !!(def && (def.flying || def.onPath));
  const cells = w.path.map(([x, y], i) => { const px = (x + 0.5) * T, py = (y + 0.5) * T;
    const covered = w.heroes.filter(h => (h.x - px) ** 2 + (h.y - py) ** 2 <= h.s.range * h.s.range).length;
    return [px, py, (1 + 0.3 * i / n) / (1 + covered)]; });
  const taken = new Set(w.heroes.map(h => h.cx + ',' + h.cy).concat(w.zones.filter(z => z.blocks).map(z => z.cx + ',' + z.cy)));
  for (let cx = 0; cx < COLS; cx++) for (let cy = 0; cy < ROWS; cy++) {
    const key = cx + ',' + cy;
    if (taken.has(key) || (w.pathSet.has(key) && !onPath)) continue;
    const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
    let score = 0;
    for (const [x, y, wt] of cells) if ((x - px) ** 2 + (y - py) ** 2 <= range * range) score += wt;
    if (score) out.push({ cx, cy, score });
  }
  return out.sort((a, b) => b.score - a.score || a.cy - b.cy || a.cx - b.cx);
}
export function coverage(w, x, y, range) {
  let s = 0; const n = w.path.length;
  w.path.forEach(([cx, cy], i) => { if (((cx + 0.5) * T - x) ** 2 + ((cy + 0.5) * T - y) ** 2 <= range * range) s += 1 + 0.6 * i / n; });
  return s;
}

/* A hero's damage per second, roughly: a hit (with added damage, crits and some of its extra targets) times hits per second, times how
   much path it covers. Minion forms use their minion multiplier. Enough to compare one relic with another. */
export function dps(w, h) {
  const s = h.s, d = h.def;
  let hit = s.damage;
  for (const k in s) if (k.endsWith('Damage') && k !== 'critDamage' && !k.startsWith('minion')) hit += s[k] || 0;
  if (d.tags.includes('minion')) hit *= s.minionDamage || 1;
  const rate = (d.rate === 'castSpeed' ? s.castSpeed : s.speed) / Math.max(0.05, s.cooldown || 1);
  const crit = 1 + Math.min(1, s.critChance || 0) * ((s.critDamage || 1.5) - 1);
  return hit * rate * crit * (1 + 0.35 * (Math.max(1, s.targets || 1) - 1)) * Math.sqrt(1 + coverage(w, h.x, h.y, s.range));   /* extra targets: often there is no second enemy in range */
}
export const power = (w, p = w.players[0]) => w.heroes.filter(h => (h.owner || 0) === p.i).reduce((a, h) => a + dps(w, h), 0);

/* An offer's worth to the bot right now. */
export function offerValue(w, o, p = w.players[0]) {
  const m = RARITIES[o.ri].mult, r = o.relic, left = Math.max(0, 1 - w.wave / w.maxWave);
  const a = affected(r, m, w.heroes);
  if (a.global) {
    const evolving = w.heroes.some(h => h.tier === 0 && (h.owner || 0) === p.i);
    switch (r.name) {
      case 'Reinforced gate': return (w.lives < 10 ? 6 : 1.5) * m;
      case 'Bulk order': return evolving ? 3 * m : 0;
      case 'Prospector': return 3 * m * left;
      case 'Tax collector': case 'Compound interest': return 2.5 * m * left;
      case 'Four-leaf clover': return 1.2 * m * left;
      default: return m;
    }
  }
  /* hero relics: the team's damage with it, compared to without (the relic's modifiers added for a moment) */
  const before = power(w, p), mods = r.mods ? r.mods(m).map(x => ({ ...x, source: '(bot test)', ri: o.ri })) : [];
  p.mods.push(...mods); for (const h of w.heroes) w.statsFor(h);
  const after = power(w, p);
  p.mods.splice(p.mods.length - mods.length, mods.length); for (const h of w.heroes) w.statsFor(h);
  let v = before > 0 ? (after - before) / before * 100 : 0;
  if (/energy/.test(r.desc(m))) v += 1.5 * m;          /* ultimates come sooner: not in the damage estimate */
  if (r.name === 'Duration') v += 1 * m;
  return v;
}

/* The form to evolve into, by look ahead. Returns the choice index. */
export function bestForm(w, h, spend) {
  const step0 = h.base.evolutions[h.tier], scores = [];
  if (!step0 || step0.choices.length < 2) return 0;
  const log = exportLog(w);
  for (let i = 0; i < step0.choices.length; i++) {
    const c = resume(log), hc = c.heroes.find(x => x.id === h.id);
    if (!apply(c, { type: 'evolve', id: hc.id, choice: i }).ok) { scores.push(-Infinity); continue; }
    if (c.phase === 'build') apply(c, { type: 'wave' });
    let boss = 0, bossKilled = 0, bossLost = 0;
    c.ev.on('damage', ({ enemy, amount }) => { if (enemy.def.boss) boss += amount; });
    c.ev.on('kill', ({ enemy }) => { if (enemy.def.boss && !enemy.escaped) bossKilled++; });
    c.ev.on('escape', ({ enemy }) => { if (enemy.def.boss) bossLost++; });
    let target = null;
    for (let k = c.wave; k <= Math.min(c.maxWave, c.wave + LOOKAHEAD.bossWithin); k++) if (isBossWave(k, c.stage)) { target = k; break; }
    const lives = c.lives, dealt = c.heroes.reduce((a, x) => a + x.dealt, 0), limit = (target ? LOOKAHEAD.maxSeconds : LOOKAHEAD.seconds) * 60;
    for (let t = 0; t < limit && c.phase !== 'over'; t++) {
      if (c.phase === 'build') { if (target && c.wave >= target) break; if (spend) spend(c); apply(c, { type: 'wave' }); }
      step(c);
    }
    scores.push(c.heroes.reduce((a, x) => a + x.dealt, 0) - dealt + boss * (LOOKAHEAD.bossWeight - 1) - (lives - c.lives) * 2000
      + bossKilled * 1e5 - bossLost * 1e6 - (c.phase === 'over' && !c.won ? 1e9 : 0));
  }
  return scores.indexOf(Math.max(...scores));
}

/* After an evolution: a better tile for the new range, if it beats the current one by a fifth. */
export function betterSpot(w, h) {
  if (supportKind(h.def)) return betterSupportSpot(w, h);
  const here = coverage(w, h.x, h.y, h.s.range), best = spotsFor(w, h.s.range, h.def)[0];
  return best && best.score > here * 1.2 + 0.5 ? best : null;
}

/* What kind of help a form gives: 'curse' (enemies in its aura take more from everyone), 'allies' (heroes near it get
   faster or get energy), or null. */
export function supportKind(def) {
  if (def.aura && def.aura.curse) return 'curse';
  if ((def.aura && def.aura.bless) || def.kind === 'psalm') return 'allies';
  return null;
}
/* How much a support helps from (x, y): curse, path inside its range weighted by how many other heroes reach it; allies,
   other heroes inside its range (plus a little path, for the auras that also hurt enemies). */
export function supportScore(w, h, x, y) {
  const R2 = h.s.range * h.s.range, others = w.heroes.filter(o => o !== h);
  if (supportKind(h.def) === 'curse') {
    let s = 0;
    for (const [cx, cy] of w.path) { const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
      if ((px - x) ** 2 + (py - y) ** 2 > R2) continue;
      s += others.filter(o => (o.x - px) ** 2 + (o.y - py) ** 2 <= o.s.range * o.s.range).length; }
    return s;
  }
  const near = others.filter(o => (o.x - x) ** 2 + (o.y - y) ** 2 <= R2).length;
  return near * 10 + (h.def.aura ? coverage(w, x, y, h.s.range) * 0.5 : 0);
}
function betterSupportSpot(w, h) {
  const onPath = !!(h.def.flying || h.def.onPath), taken = new Set(w.heroes.map(o => o.cx + ',' + o.cy).concat(w.zones.filter(z => z.blocks).map(z => z.cx + ',' + z.cy)));
  const here = supportScore(w, h, h.x, h.y);
  let best = null;
  for (let cx = 0; cx < COLS; cx++) for (let cy = 0; cy < ROWS; cy++) {
    const key = cx + ',' + cy;
    if (taken.has(key) || (w.pathSet.has(key) && !onPath)) continue;
    const sc = supportScore(w, h, (cx + 0.5) * T, (cy + 0.5) * T);
    if (!best || sc > best.score) best = { cx, cy, score: sc };
  }
  return best && best.score > here * 1.15 + 0.5 ? best : null;
}
