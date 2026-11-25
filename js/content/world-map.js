/* The world map on the level screen (prototype, no art yet): where the zones sit on the world, and where the levels sit
   inside a zone. Positions are in % of the map box ({ x, y } from the top left). The road joins the points in order:
   the zones from left to right across the world, then inside a zone its levels from left to right. Endless stands on
   its own, off the road.
   color: the zone's colour on the map (the same as body[data-zone] --zc in index.html). */
export const WORLD = [
  { zone: 1, x: 9,  y: 68, color: '#b8d25a' },
  { zone: 2, x: 29, y: 36, color: '#4fc08e' },
  { zone: 3, x: 50, y: 64, color: '#a98bd6' },
  { zone: 4, x: 71, y: 33, color: '#e2864a' },
  { zone: 5, x: 91, y: 60, color: '#ff6a3a' }
];
/* The levels of any zone, in order, along the road. */
export const ZONE_PATH = [
  { x: 6, y: 68 }, { x: 24, y: 34 }, { x: 42, y: 66 }, { x: 60, y: 32 }, { x: 77, y: 62 }
];
/* Endless: alone, apart from the road. */
export const ENDLESS_SPOT = { x: 94, y: 22 };
export const zoneColor = n => (WORLD.find(z => z.zone === n) || WORLD[0]).color;
/* A smooth road through the points, as an SVG path in a 100 x 100 box (curves bend halfway between two points). */
export function roadPath(points) {
  if (!points.length) return '';
  let d = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], mx = (a.x + b.x) / 2;
    d += ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y;
  }
  return d;
}
/* The acts that have their painted map (built by art/pixellab/build_worldmap.py). The picture covers the whole window
   (cropped at the edges when the window is not 16:9); the road is painted in, so the game draws none. stops: the middle
   of each painted stone stop, in % of the picture, where a level's flag stands; endless: where the portal stands. */
export const ZONE_ART = {
  1: {
    src: 'assets/zonemap_1.png', ratio: 458 / 256,
    stops: [{ x: 17.6, y: 47.7 }, { x: 42.8, y: 56.4 }, { x: 53.8, y: 63.0 }, { x: 70.7, y: 43.0 }, { x: 87.0, y: 73.0 }],
    endless: { x: 10, y: 68 }
  },
  2: {   /* the road comes in on the left, dips past the fairy garden, crosses the stream and ends at the deer spirit's shrine */
    src: 'assets/zonemap_2.png', ratio: 458 / 256,
    stops: [{ x: 17.0, y: 43.2 }, { x: 31.3, y: 67.8 }, { x: 51.1, y: 83.8 }, { x: 67.2, y: 73.2 }, { x: 82.8, y: 39.1 }],
    endless: { x: 90, y: 62 }
  },
  3: {   /* down past the lizardfolk stilt village, over boardwalks by the drowned sailors' wreck, to the witches' coven.
            The picture has 7 painted stops for now (to be retouched); the levels use the 1st, 2nd, 5th, 6th and 7th. */
    src: 'assets/zonemap_3.png', ratio: 458 / 256,
    stops: [{ x: 13.3, y: 19.1 }, { x: 32.1, y: 44.5 }, { x: 43.9, y: 77.9 }, { x: 60.9, y: 61.3 }, { x: 82.0, y: 89.3 }],
    endless: { x: 8, y: 62 }
  },
  4: {   /* along the dry canyon floor past the wagons and harpy pillars, then up the stairs around the mesa to the wyvern */
    src: 'assets/zonemap_4.png', ratio: 458 / 256,
    stops: [{ x: 7.1, y: 90.2 }, { x: 42.4, y: 83.2 }, { x: 69.7, y: 59.0 }, { x: 56.6, y: 48.2 }, { x: 70.2, y: 18.4 }],
    endless: { x: 18, y: 45 }
  },
  5: {   /* down past the summoners' circle and the dragon bones, over the lava by the obsidian knights, to the demon
            lord's citadel under the volcano: the end of the world */
    src: 'assets/zonemap_5.png', ratio: 458 / 256,
    stops: [{ x: 18.6, y: 18.2 }, { x: 28.7, y: 32.8 }, { x: 30.0, y: 61.7 }, { x: 35.9, y: 85.2 }, { x: 80.5, y: 72.3 }],
    endless: { x: 40, y: 45 }
  }
};
/* The painted world map (built by art/pixellab/build_worldmap.py): the five acts from left to right, the road through
   them and the demon citadel at the far right. borders: the lines between the acts, in % of the picture, top to bottom
   (the same numbers as art/pixellab/worldmap/world_zones.json, which draws the fog). at: where each act's button stands
   on the road. fog: worldfog_<N>.png covers act N and every act after it (acts open in order). */
export const WORLD_ART = {
  src: 'assets/worldmap.png', ratio: 688 / 384, fog: n => 'assets/worldfog_' + n + '.png',
  borders: [
    [[22.5, 0], [21.1, 26], [21.8, 54.7], [16, 61.2], [14.5, 100]],
    [[45, 0], [43.6, 32.6], [39.2, 62.5], [37.8, 100]],
    [[58.1, 0], [57.4, 32.6], [61.8, 54.7], [59.6, 100]],
    [[77, 0], [79.2, 39], [78.5, 100]]
  ],
  at: { 1: { x: 12.7, y: 43 }, 2: { x: 31.3, y: 58.6 }, 3: { x: 49.4, y: 56 }, 4: { x: 69.8, y: 51.4 }, 5: { x: 90.8, y: 56 } }
};
/* Act n's part of the world picture, as a CSS polygon (for its hover area and highlight). */
export function bandPolygon(n) {
  const b = WORLD_ART.borders, left = n === 1 ? [[0, 0], [0, 100]] : b[n - 2], right = n > b.length ? [[100, 0], [100, 100]] : b[n - 1];
  return 'polygon(' + [...left, ...[...right].reverse()].map(([x, y]) => x + '% ' + y + '%').join(', ') + ')';
}
