/* Zones: the levels come in ZONES of LEVELS_PER_ZONE. Each zone has its own art (assets/level_<zone>.png, shown on its
   levels) and name; a level is known by its code, "zone-level" ("1-3" is the third level of Green Meadow). The level data
   itself (waves, enemy health) is STAGES in data.js, and each level's fixed map is MAPS in maps.js. */
export const ZONES = [
  { n: 1, name: 'Green Meadow' },
  { n: 2, name: 'Deep Forest' },
  { n: 3, name: 'Mire' },
  { n: 4, name: 'Red Canyon' },
  { n: 5, name: 'Ashlands' }
];
export const LEVELS_PER_ZONE = 5;
export const LEVELS = ZONES.length * LEVELS_PER_ZONE;
/* For level n (1 to LEVELS): its zone, its place in the zone (1 to LEVELS_PER_ZONE) and its code. */
export const zoneOf = n => ZONES[Math.floor((n - 1) / LEVELS_PER_ZONE)];
export const placeInZone = n => (n - 1) % LEVELS_PER_ZONE + 1;
export const levelCode = n => zoneOf(n).n + '-' + placeInZone(n);
