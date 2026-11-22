/* What special enemies do (the numbers are on each type, ENEMIES in enemies.js). An ability is update(w, e, a, dt), run every
   step for every living enemy that has it; e.ab is its own state. To add one, register it here and give a type
   ability: { id, ... }. */
import { T } from '../content/data.js';
import { spawnEnemy } from './enemies.js';
import { cannotHeal } from './procs.js';

export const ABILITIES = {};
export const registerAbility = (id, update) => { ABILITIES[id] = update; };

/* A summoner cannot be hurt while any of its minions lives. */
export const isShielded = e => !!e.brood && e.brood.some(m => !m.dead);

/* Stunner: stuns the nearest hero in range, then recovers. */
registerAbility('stun', (w, e, a, dt) => {
  const s = (e.ab ||= { cd: a.first });
  if ((s.cd -= dt) > 0) return;
  let best = null, bestD = a.range * a.range;
  for (const h of w.heroes) {
    const d = (h.x - e.x) ** 2 + (h.y - e.y) ** 2;
    if (d <= bestD && !(h.stun > 0)) { best = h; bestD = d; }
  }
  if (!best) return;
  s.cd = a.cooldown;
  best.stun = a.seconds;
  w.fx?.beam(e.x, e.y, best.x, best.y, 0.25, e.def.color, 3);
  w.ev.emit('heroStun', { hero: best, enemy: e });
});

/* Regenerator: heals all the time, faster the more life it is missing. */
registerAbility('regen', (w, e, a, dt) => {
  if (e.hp < e.max && !cannotHeal(e)) e.hp = Math.min(e.max, e.hp + e.max * (a.base + a.missing * (1 - e.hp / e.max)) * dt);
});

/* Summoner: calls minions onto the path just ahead of it, up to `casts` times; a new group only once the last one is dead. */
registerAbility('summon', (w, e, a, dt) => {
  const s = (e.ab ||= { cd: a.first, casts: 0 });
  if (s.casts >= a.casts || isShielded(e) || (s.cd -= dt) > 0) return;
  s.cd = a.cooldown; s.casts++;
  const end = (w.path.length - 2) * T;
  e.brood = [];
  for (let k = 0; k < a.count; k++) e.brood.push(spawnEnemy(w, a.minion, Math.min(end, e.d + 18 * (k + 1))));
  w.ev.emit('summon', { enemy: e });
});

export function updateAbilities(w, dt) {
  for (let i = 0, n = w.enemies.length; i < n; i++) {   /* the minions summoned this step start with the next one */
    const e = w.enemies[i], a = e.def.ability;
    if (a && !e.dead) ABILITIES[a.id](w, e, a, dt);
  }
}
