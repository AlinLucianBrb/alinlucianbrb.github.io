/* What summoned bosses do (SUMMON_BOSS in js/content/shop.js; their life and looks are in ENEMIES, enemies.js). Each is an
   enemy ability (enemy-abilities.js): update(w, e, a, dt) every step. */
import { T } from '../content/data.js';
import { registerAbility } from './enemy-abilities.js';
import { ENEMIES, spawnEnemy } from './enemies.js';

/* Splits at `at` of its life: two halves share what is left, one just behind the other. */
registerAbility('split', (w, e, a) => {
  if (e.hp > e.max * a.at) return;
  const part = Math.max(1, Math.round(e.hp / 2));
  e.type = a.into; e.def = ENEMIES[a.into]; e.hp = e.max = part; e.ab = null;
  const twin = spawnEnemy(w, a.into, Math.max(0, e.d - 24));
  twin.hp = twin.max = part; twin.prize = e.prize;
  if (e.prize) e.prize.left++;
});
/* Up to 1 + `more` times as fast with no life left. */
registerAbility('enrage', (w, e, a) => {
  const s = (e.ab ||= { speed: e.speed });
  e.speed = s.speed * (1 + a.more * (1 - Math.max(0, e.hp) / e.max));
});
/* Every `every` seconds, resists the damage type that hurt it most since the last time (e.ward, read by hit in world.js). */
registerAbility('ward', (w, e, a, dt) => {
  const s = (e.ab ||= { t: a.every, taken: {} });
  e.taken = s.taken;
  if ((s.t -= dt) > 0) return;
  s.t = a.every;
  let top = null;
  for (const k in s.taken) if (top === null || s.taken[k] > s.taken[top]) top = k;
  if (top) e.ward = { type: top, mult: 1 - a.resist };
  s.taken = {}; e.taken = s.taken;
});
/* Takes gold from everyone; payPrize gives it back twice when it dies. */
registerAbility('steal', (w, e, a, dt) => {
  const s = (e.ab ||= { t: a.every });
  if ((s.t -= dt) > 0) return;
  s.t = a.every;
  for (const p of w.players) { const g = Math.min(p.gold, a.gold); p.gold -= g; if (e.prize) e.prize.stolen[p.i] += g; }
});
/* Jumps forward as its life passes each mark (never onto the gate). */
registerAbility('blink', (w, e, a) => {
  const s = (e.ab ||= { n: 0 });
  while (s.n < a.at.length && e.hp <= e.max * a.at[s.n]) { s.n++; e.d = Math.min((w.path.length - 2) * T, e.d + a.tiles * T); }
});
