/* Map effects at work (the data is js/content/map-effects.js). w.mapEffect: the map's effect id, or null. w.noBuild: tiles that
   cannot be used ("x,y"). w.ley: the glowing tiles. */
import { MAP_EFFECTS } from '../content/map-effects.js';
import { COLS, ROWS } from '../content/data.js';
import { addFlags, addHeroMods } from './match-effects.js';

const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const beside = (w, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.pathSet.has((x + dx) + ',' + (y + dy)));

export function setupMap(w, id) {
  w.mapEffect = id || null; w.noBuild = new Set(); w.ley = [];
  const e = MAP_EFFECTS[id];
  if (!e) return;
  addFlags(w, e.flags);
  addHeroMods(w, e.mods, e.name);
  if (id === 'overgrown') for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!w.pathSet.has(x + ',' + y) && beside(w, x, y)) w.noBuild.add(x + ',' + y);
  if (id === 'ley') {        /* one or two tiles from the road, so every hero can make use of one */
    const pool = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!w.pathSet.has(x + ',' + y) && (beside(w, x, y) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && beside(w, x + dx, y + dy)))) pool.push([x, y]);
    while (w.ley.length < e.tiles && pool.length) w.ley.push(pool.splice(w.rng.map.int(pool.length), 1)[0]);
  }
  if (id === 'storm') w.stormT = e.every;
}
/* Ley lines: a hero's own modifier, by the tile it stands on (statsFor adds it). */
export function leyMods(w, h) {
  if (w.mapEffect !== 'ley') return null;
  const e = MAP_EFFECTS.ley, on = w.ley.some(t => t[0] === h.cx && t[1] === h.cy);
  return [{ stat: 'damage', type: 'more', value: on ? e.on : e.off, scope: ['all'], source: e.name, ri: -6 }];
}
/* Storm: strikes while a wave is coming. */
export function updateMap(w, dt) {
  if (w.mapEffect !== 'storm' || w.phase !== 'wave' || (w.stormT -= dt) > 0) return;
  const e = MAP_EFFECTS.storm, pool = w.enemies.filter(x => !x.dead);
  w.stormT = e.every;
  if (!pool.length) return;
  for (let n = 0; n < e.targets && pool.length; n++) {
    const t = pool.splice(w.rng.map.int(pool.length), 1)[0];
    w.fx?.strike?.(t.x, t.y);
    w.hit(null, t, t.max * e.share, 'lightning');
  }
  if (w.heroes.length) { const h = w.heroes[w.rng.map.int(w.heroes.length)]; h.stun = Math.max(h.stun || 0, e.stun); w.fx?.strike?.(h.x, h.y); w.ev.emit('heroStun', { hero: h, enemy: null }); }
}
