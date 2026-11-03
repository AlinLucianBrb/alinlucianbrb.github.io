/* Hero levels during a match (rules in HERO_LEVELS, js/content/data.js). Every hero on the field gains XP from each kill. */
import { HERO_LEVELS } from '../content/data.js';

/* The modifiers a hero gets from its level: perLevel times the levels gained above 1. */
export function levelMods(level) {
  if (level <= 1) return [];
  return HERO_LEVELS.perLevel.map(m => ({ ...m, value: m.value * (level - 1), scope: ['all'], source: 'Hero level', ri: -4 }));
}

/* Adds XP and handles any level-ups. Returns how many levels were gained. */
export function gainXp(w, h, amount) {
  if (!(amount > 0) || h.level >= HERO_LEVELS.max) return 0;
  h.xp += amount;
  let gained = 0;
  while (h.level < HERO_LEVELS.max && h.xp >= HERO_LEVELS.xpToNext(h.level)) {
    h.xp -= HERO_LEVELS.xpToNext(h.level); h.level++; gained++;
  }
  if (h.level >= HERO_LEVELS.max) h.xp = 0;
  if (gained) { h.lvlMods = levelMods(h.level); w.statsFor(h); w.ev.emit('levelUp', { hero: h, level: h.level }); }
  return gained;
}
