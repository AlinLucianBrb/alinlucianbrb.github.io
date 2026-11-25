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
  }
};
