/* Designs the preset maps (one fixed path per level) and writes js/content/maps.js. Run: npm run maps
   Every path starts on the left edge and ends on the right edge (the road carries on off the map at both ends), moves one
   tile at a time, and never touches itself, not even diagonally, so there is always grass between two stretches. Lower
   levels get more twists and turns (a longer road: more time to fight), higher levels fewer (TURNS).
   The paths are found by a seeded search, so running this again writes the same maps; change SEED or TURNS for new ones. */
import { writeFileSync } from 'node:fs';
import { COLS, ROWS } from '../js/content/data.js';
import { LEVELS } from '../js/content/zones.js';

export const SEED = 20261112;
/* Turns in level n's path (1 = the first level): from 14 on level 1 down to 4 on the last. */
export const TURNS = n => Math.round(14 - (n - 1) * 10 / Math.max(1, LEVELS - 1));

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const DIRS = [[1, 0], [0, 1], [0, -1], [-1, 0]];

/* Can the path step onto (x, y)? Inside the map (the edges only at the two ends), and no path tile within one tile of it
   (diagonals too) except the last two, which it naturally touches. */
function free(path, set, x, y, last) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (!last && (x === 0 || x === COLS - 1)) return false;
  if (set.has(x + ',' + y)) return false;
  const near = path.slice(-2).map(([a, b]) => a + ',' + b);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const k = (x + dx) + ',' + (y + dy);
    if ((dx || dy) && set.has(k) && !near.includes(k)) return false;
  }
  return true;
}
export const turnsOf = p => { let n = 0; for (let i = 2; i < p.length; i++) { const a = [p[i - 1][0] - p[i - 2][0], p[i - 1][1] - p[i - 2][1]], b = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]]; if (a[0] !== b[0] || a[1] !== b[1]) n++; } return n; };

/* One attempt: straight runs, turning at the end of each, until the right edge is reached. */
function attempt(r, want) {
  const y0 = 1 + Math.floor(r() * (ROWS - 2)), path = [[0, y0], [1, y0]], set = new Set(['0,' + y0, '1,' + y0]);
  let dir = [1, 0], turns = 0;
  const across0 = Math.max(2, Math.round((COLS - 3) / (want / 2 + 1)));   /* the last run to the gate is no longer than the others */
  for (let guard = 0; guard < 400; guard++) {
    const [x, y] = path[path.length - 1];
    /* finish: straight to the right edge once enough turns are made and the way is clear */
    if (turns >= want && dir[0] === 1 && COLS - 1 - x <= across0 + 2) {
      let ok = true; for (let k = x + 1; k < COLS; k++) if (!free(path.concat(Array.from({ length: k - x - 1 }, (_, i) => [x + 1 + i, y])), set, k, y, k === COLS - 1)) { ok = false; break; }
      if (ok) { for (let k = x + 1; k < COLS; k++) { path.push([k, y]); set.add(k + ',' + y); } return path; }
    }
    /* pick the next direction: never straight back; going right is likelier, left only for a twist */
    const options = DIRS.filter(d => !(d[0] === -dir[0] && d[1] === -dir[1]) && !(d[0] === dir[0] && d[1] === dir[1]));
    const w = options.map(d => (d[0] === 1 ? 3 : d[0] === -1 ? (turns < want - 2 ? 1 : 0) : 2));
    let pick = r() * w.reduce((a, b) => a + b, 0), nd = options[0];
    for (let i = 0; i < options.length; i++) { pick -= w[i]; if (pick <= 0) { nd = options[i]; break; } }
    /* runs to the right are sized so the turns spread over the whole width; with few turns the runs up and down are
       longer, so the road still crosses much of the map */
    const across = Math.max(2, Math.round((COLS - 3) / (want / 2 + 1)));
    const len = nd[0] === 1 ? Math.max(2, across - 1 + Math.floor(r() * 3)) : nd[0] === -1 ? 2 + Math.floor(r() * 2) : 2 + Math.floor(r() * (want < 8 ? 6 : 3));
    let moved = 0;
    for (let s = 0; s < len; s++) {
      const [px, py] = path[path.length - 1], nx = px + nd[0], ny = py + nd[1];
      if (!free(path, set, nx, ny, false)) break;
      path.push([nx, ny]); set.add(nx + ',' + ny); moved++;
    }
    if (moved < 2) return null;   /* boxed in: give up on this attempt */
    dir = nd; turns++;
    if (turns > want + 2) return null;
  }
  return null;
}

/* The path for level n: many attempts, keep the one with the turn count closest to TURNS(n), then the longest. */
export function designPath(n) {
  const want = TURNS(n), r = rng(SEED + n * 7919);
  let best = null;
  for (let i = 0; i < 20000; i++) {
    const p = attempt(r, want);
    if (!p) continue;
    const score = -Math.abs(turnsOf(p) - want) * 1000 + p.length;
    if (!best || score > best.score) best = { p, score };
    if (best && turnsOf(best.p) === want && i > 2000) break;
  }
  return best.p;
}

if (process.argv[1] && process.argv[1].endsWith('maps.mjs')) {
  const maps = Array.from({ length: LEVELS }, (_, i) => designPath(i + 1));
  const body = maps.map((p, i) => `  /* ${i + 1}: ${turnsOf(p)} turns, ${p.length} tiles */ [${p.map(c => '[' + c + ']').join(',')}]`).join(',\n');
  writeFileSync(new URL('../js/content/maps.js', import.meta.url),
`/* The preset maps: one fixed path per level, as [x, y] tiles from the entrance (left edge) to the gate (right edge).
   Generated by tools/maps.mjs (npm run maps; do not edit by hand): lower levels twist and turn more, higher ones less. */
export const MAPS = [
${body}
];
`);
  console.log(maps.map((p, i) => (i + 1) + ': ' + turnsOf(p) + ' turns, ' + p.length + ' tiles').join('\n'));
}
