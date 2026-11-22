/* Upgrades at work (the data is js/content/upgrades.js). An upgraded hero's def carries the choice (def.upgrade).
   - upgradeOf(hero, id): the upgrade's data if the hero has it, or null: what behaviors and ultimates ask;
   - BOLT_HOOKS[id](g, p, e, u): after a homing bolt of an upgraded hero hit enemy e (projectiles.js);
   - KILL_HOOKS[id](w, hero, e, u): after an upgraded hero killed enemy e. */
export const upgradeOf = (h, id) => (h && h.def && h.def.upgrade && h.def.upgrade.id === id ? h.def.upgrade : null);

export const BOLT_HOOKS = {};
export const KILL_HOOKS = {};

export function boltHit(g, p, e) {
  const u = p.owner.def && p.owner.def.upgrade, f = u && !p.child && BOLT_HOOKS[u.id];
  if (f) f(g, p, e, u);
}
export function attachUpgrades(w) {
  w.ev.on('kill', ({ hero, enemy }) => {
    const u = hero && hero.def && hero.def.upgrade, f = u && KILL_HOOKS[u.id];
    if (f) f(w, hero, enemy, u);
  });
}

/* The living enemies within r px of a point, except one. */
export const around = (g, x, y, r, except = null) => g.enemies.filter(e => !e.dead && e !== except && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r);
/* The nearest of them, or null. */
export function nearest(g, x, y, r, skip) {
  let best = null, bd = r * r;
  for (const e of g.enemies) {
    if (e.dead || skip.has(e)) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}
