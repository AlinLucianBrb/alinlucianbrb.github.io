/* Ultimates: what a hero does when its energy bar is full. The next attack becomes the ultimate.
   Each has damageMult (for the attack that triggers it) and can do something of its own in onFire(world, hero).
   To add one, register it here and set `ultimate` on a hero or an evolution choice in js/content/data.js. */
import { inflict } from './combat.js';
import { applyEffect } from './effects.js';
import { T, COLS, ROWS } from '../content/data.js';
import { pathPos } from './enemies.js';
export const ULTIMATES = {};
export const registerUltimate = (id, def) => { ULTIMATES[id] = def; };

registerUltimate('empowered', { name: 'Empowered strike', desc: 'The next attack deals double damage.', damageMult: 2 });

/* Fire Mage: sets every enemy on the map on fire, as if each had been hit by the Mage. */
registerUltimate('inferno', { name: 'Inferno', desc: 'Sets every enemy on the map on fire.', damageMult: 1,
  onFire(w, h) { for (const e of w.enemies) if (!e.dead) inflict(w, h, e, 'burn', h.s.damage); } });

/* Cold Mage: freezes every enemy on the map for 1 second. (At 2 seconds it fired about every 4 seconds and kept enemies
   frozen half the time: level 5 took the balance bot over two hours.) */
export const BLIZZARD_FREEZE = 1;
registerUltimate('blizzard', { name: 'Blizzard', desc: 'Freezes every enemy on the map for ' + BLIZZARD_FREEZE + ' second.', damageMult: 1,
  onFire(w, h) { for (const e of w.enemies) if (!e.dead) applyEffect(e, 'freeze', { t: BLIZZARD_FREEZE }); } });

/* Lightning Mage: a storm over the Mage for 3 seconds, striking everything inside every half second for half a hit
   (each strike shocks, since the Lightning Mage always shocks). */
registerUltimate('storm', { name: 'Storm', desc: 'A storm around the Mage strikes and shocks every enemy inside for 3 seconds.', damageMult: 1,
  onFire(w, h) { w.zones.push({ type: 'storm', owner: h, x: h.x, y: h.y, r: h.s.range * 1.3, t: 3, next: 0, every: 0.5, scale: 0.5 }); } });

/* Called by every behavior just before an attack, with the attack's target: returns the damage multiplier for this attack
   (1, or the ultimate's) and empties the bar when the ultimate fires. An ultimate with replaces: true returns 0: the hero
   does not make its normal attack (the ultimate is the attack, like the Marksman's arrow). */
export function attackMult(w, h, target) {
  if (h.energy < h.s.energyMax) return 1;
  const u = ULTIMATES[h.def.ultimate];
  if (!u) return 1;
  h.energy = 0; h.ults++; h.ultNow = true;
  if (u.onFire) u.onFire(w, h, target);
  w.ev.emit('ultimate', { hero: h, ultimate: u });
  return u.replaces ? 0 : (u.damageMult || 1);
}

/* Called by every behavior after an attack. The attack that fired the ultimate does not refill the bar. */
export function gainEnergy(h, amount = h.s.energyPerAttack) {
  h.energy = Math.min(h.s.energyMax, h.energy + amount);
}

/* Marksman: charges for a moment, then looses an arrow that flies through every enemy in a straight line (aimed at the
   attack's target) for 3x a hit each. It replaces the normal arrow. */
registerUltimate('piercing', { name: 'Piercing shot', desc: 'Charges a powerful arrow that pierces every enemy in its path for triple damage.', replaces: true,
  onFire(w, h, target) {
    const tx = target ? target.x : h.x + 1, ty = target ? target.y : h.y, len = Math.hypot(tx - h.x, ty - h.y) || 1;
    w.projs.push({ type: 'pierce', owner: h, x: h.x, y: h.y, dx: (tx - h.x) / len, dy: (ty - h.y) / len, charge: 0.35, dist: 0, max: 1000, hit: new Set(), scale: 3 });
  } });

/* Boomerang Ranger: a boomerang spins around the Ranger for 6 seconds, hitting every enemy it touches for 3x (each one at
   most every 0.4 s). Several at once are spread evenly around the circle (see the orbit projectile). */
export const ORBIT_SCALE = 3;   /* each touch hits for 3x */
registerUltimate('orbit', { name: 'Spinning blade', desc: 'A boomerang spins around the Ranger for 6 seconds, hitting everything it touches for triple damage.', damageMult: 1,
  onFire(w, h) { w.projs.push({ type: 'orbit', owner: h, x: h.x, y: h.y, t: 6, rot: 0, hitT: new Map(), scale: ORBIT_SCALE }); } });

/* Where ground effects go (Hunter's traps, Alchemist's puddles): path tiles within the hero's range, first under the
   enemies in range (the ones furthest along first), then the tiles closest to the entrance. Returns up to n of
   { i (path index), x, y }, skipping the path indices in `taken`. */
export function groundSpots(w, h, n, taken = new Set()) {
  const r2 = h.s.range * h.s.range, out = [], used = new Set(taken);
  const spot = i => { const [cx, cy] = w.path[i]; return { i, x: (cx + 0.5) * T, y: (cy + 0.5) * T, ok: cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS }; };
  const add = i => { if (out.length >= n || used.has(i)) return; const c = spot(i); if (!c.ok || (c.x - h.x) ** 2 + (c.y - h.y) ** 2 > r2) return; used.add(i); out.push(c); };
  const near = w.enemies.filter(e => !e.dead && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= r2).sort((a, b) => b.d - a.d);
  for (const e of near) add(Math.max(0, Math.min(w.path.length - 1, Math.round(e.d / T))));
  for (let i = 0; i < w.path.length && out.length < n; i++) add(i);
  return out;
}

/* Hunter: lays up to 3 traps on path tiles within range: under the enemies in range first, then toward the entrance
   (groundSpots). A trap bursts when an enemy steps on it, dealing 4x a hit of toxic damage to everything close by.
   At most 6 of a Hunter's traps are out at once (the oldest goes). */
export const TRAP = { count: 3, max: 6, scale: 4, radius: 34, trigger: 14, life: 20 };
registerUltimate('traps', { name: 'Toxic traps', desc: 'Lays 3 traps under enemies or toward the entrance that burst with heavy toxic damage when stepped on.', damageMult: 1,
  onFire(w, h) {
    const taken = new Set(w.zones.filter(z => z.type === 'trap').map(z => z.cell));
    for (const c of groundSpots(w, h, TRAP.count, taken)) w.zones.push({ type: 'trap', owner: h, cell: c.i, x: c.x, y: c.y, r: TRAP.radius, t: TRAP.life, scale: TRAP.scale });
    const mine = w.zones.filter(z => z.type === 'trap' && z.owner === h);
    for (let k = 0; k < mine.length - TRAP.max; k++) mine[k].t = 0;
  } });

/* Berserker: Frenzy, +50% damage and attack speed for 5 seconds (more, so it multiplies everything else). */
export const FRENZY = { seconds: 5, mods: [{ stat: 'damage', type: 'more', value: 0.5 }, { stat: 'speed', type: 'more', value: 0.5 }] };
registerUltimate('frenzy', { name: 'Frenzy', desc: '+50% damage and attack speed for 5 seconds.', damageMult: 1,
  onFire(w, h) { w.addBuff(h, 'frenzy', 'Frenzy', FRENZY.mods, FRENZY.seconds); } });

/* Commander: Rally, doubles the energy every hero within 220 px (the Commander too) gets from attacks, for 5 seconds. */
export const RALLY = { seconds: 5, radius: 220, mods: [{ stat: 'energyPerAttack', type: 'inc', value: 1 }] };
registerUltimate('rally', { name: 'Rally', desc: 'Doubles energy from attacks for nearby heroes, the Commander included, for 5 seconds.', damageMult: 1,
  onFire(w, h) {
    for (const o of w.heroes) if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= RALLY.radius ** 2) w.addBuff(o, 'rally', 'Rally', RALLY.mods, RALLY.seconds);
    w.fx?.slash(h.x, h.y, 0, Math.PI, RALLY.radius, 0.5, 'rgba(127,179,255,.3)');   /* a soft flash: it covers a big area */
  } });

/* Sentinel: Barricade, blocks the path for 1 second right in front of the enemy the Sentinel is attacking, so that enemy
   and everything behind it stop at once. (Placed further ahead it would block nothing: enemies cover about 50 px a second.) */
export const BARRICADE = { seconds: 1, ahead: 4 };
registerUltimate('barricade', { name: 'Barricade', desc: 'Blocks the path in front of the enemies, stopping them for 1 second.', damageMult: 1,
  onFire(w, h, target) {
    if (!target) return;
    const d = Math.min(target.d + BARRICADE.ahead, (w.path.length - 1.01) * T), i = d / T, k = Math.floor(i), f = i - k;
    const a = w.path[k], b = w.path[k + 1] || a;
    w.zones.push({ type: 'barrier', owner: h, d, x: (a[0] + 0.5 + (b[0] - a[0]) * f) * T, y: (a[1] + 0.5 + (b[1] - a[1]) * f) * T,
      r: T / 2, t: BARRICADE.seconds });
  } });

/* ---- Rogue ---- */
/* Rogue: marks every enemy on the map for 6 seconds. Hits against a marked enemy have +25% crit chance and +50% crit damage. */
export const MARK = { seconds: 6, chance: 0.25, dmg: 0.5 };
registerUltimate('mark', { name: 'Mark', desc: 'Marks every enemy on the map for 6 seconds: +25% crit chance and +50% crit damage against them.', damageMult: 1,
  onFire(w) { for (const e of w.enemies) if (!e.dead) applyEffect(e, 'mark', { t: MARK.seconds, chance: MARK.chance, dmg: MARK.dmg }); } });

/* Assassin: clones appear behind every enemy on the map and strike each one twice. It replaces the normal strike. */
registerUltimate('clones', { name: 'Shadow clones', desc: 'Clones appear behind every enemy on the map and strike each one twice.', replaces: true,
  onFire(w, h) {
    for (const e of [...w.enemies]) {
      if (e.dead) continue;
      w.fx?.slash(e.x, e.y, Math.atan2(e.y - h.y, e.x - h.x) + Math.PI, Math.PI / 3, 24, 0.3, '#c9a6ff');
      w.attack(h, e, 1); if (!e.dead) w.attack(h, e, 1);
    }
  } });

/* Toxicologist: throws a bottle at the strongest, toughest enemy in range; it leaves a puddle of poison for 6 seconds that
   poisons every enemy in it once a second (each time as if hit by the Toxicologist). The daggers are thrown as usual. */
export const POISON_POOL = { seconds: 6, radius: 44, every: 1 };
registerUltimate('poisonflask', { name: 'Poison flask', desc: 'A bottle of poison leaves a puddle that poisons every enemy walking through it.', damageMult: 1,
  onFire(w, h, target) {
    if (!target) return;
    w.projs.push({ type: 'flask', owner: h, x: h.x, y: h.y, sx: h.x, sy: h.y, tx: target.x, ty: target.y, t: 0,
      dur: Math.max(0.2, Math.hypot(target.x - h.x, target.y - h.y) / 320), land: 'poisonpool' });
  } });

/* Alchemist: 3 flammable puddles on the path (under enemies in range first, then toward the entrance) for 8 seconds. Enemies
   in a puddle move at half speed; a burning enemy in one makes it explode: 3x a fire hit to everything within 64 px. */
export const OIL = { count: 3, seconds: 8, radius: 28, blast: 64, scale: 3 };
registerUltimate('oil', { name: 'Flammable puddles', desc: 'Flammable puddles slow enemies; a burning enemy in one makes it explode.', damageMult: 1,
  onFire(w, h) {
    const taken = new Set(w.zones.filter(z => z.type === 'oil').map(z => z.cell));
    for (const c of groundSpots(w, h, OIL.count, taken)) w.zones.push({ type: 'oil', owner: h, cell: c.i, x: c.x, y: c.y, r: OIL.radius, t: OIL.seconds });
  } });

/* ---- Druid ---- */
/* Druid: Nature's grasp, for 6 seconds every hero within 180 px (the Druid too) has +10% chance to root the enemies it hits. */
export const GRASP = { seconds: 6, radius: 180, mods: [{ stat: 'rootChance', type: 'flat', value: 0.1 }] };
registerUltimate('grasp', { name: "Nature's grasp", desc: 'For 6 seconds, heroes near the Druid (the Druid too) have +10% chance to root the enemies they hit.', damageMult: 1,
  onFire(w, h) {
    for (const o of w.heroes) if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= GRASP.radius ** 2) w.addBuff(o, 'grasp', "Nature's grasp", GRASP.mods, GRASP.seconds);
    w.fx?.slash(h.x, h.y, 0, Math.PI, GRASP.radius, 0.5, 'rgba(143,191,90,.35)');
  } });

/* Animalic Druid: Enrage, the wolf grows bigger and stronger for 6 seconds: twice the reach and twice the damage. */
export const ENRAGE = { seconds: 6 };
registerUltimate('enrage', { name: 'Enrage', desc: 'The wolf grows bigger and stronger for 6 seconds: twice the reach and twice the damage.', damageMult: 1,
  onFire(w, h) { h.rage = ENRAGE.seconds; } });

/* Naturist Druid: Bramble spikes, every thorn patch of the Druid erupts: each enemy standing in one (or close to it) takes
   4x a hit, once, however many patches it stands in. */
export const SPIKES = { scale: 4, reach: 1.3, show: 0.45 };
registerUltimate('spikes', { name: 'Bramble spikes', desc: 'Every thorn patch erupts in spikes: 4x damage to each enemy standing in one.', damageMult: 1,
  onFire(w, h) { h.erupt = true; } });
export function erupt(w, h) {
  const hit = new Set();
  for (const z of w.zones) {
    if (z.type !== 'thorns' || z.owner !== h) continue;
    z.spikeT = SPIKES.show;
    const r2 = (z.r * SPIKES.reach) ** 2;
    for (const e of w.enemies) if (!e.dead && !hit.has(e) && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= r2) { hit.add(e); w.attack(h, e, SPIKES.scale); }
  }
}

/* Lunar Druid: Moonfall, a moon falls where the targeted enemy will be in 0.6 seconds and smashes everything within 70 px
   for 5x a hit of the Druid's cold damage (which also slows). */
export const MOON = { fall: 0.6, radius: 70, scale: 5 };
const landing = { x: 0, y: 0 };
registerUltimate('moonfall', { name: 'Moonfall', desc: 'A moon falls on the enemies and smashes everything around it for 5x damage.', damageMult: 1,
  onFire(w, h, target) {
    if (!target) return;
    pathPos(w.path, Math.min(w.path.length - 1.001, (target.d + target.speed * MOON.fall) / T), landing);
    w.zones.push({ type: 'moonfall', owner: h, x: landing.x, y: landing.y, r: MOON.radius, t: MOON.fall, fall: MOON.fall, scale: MOON.scale });
  } });
