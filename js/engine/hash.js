/* A short fingerprint of a world's state, used by tests to check that two runs ended up in exactly the same place. */
const fnv = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const r = x => Math.round(x * 1e6) / 1e6;

export function hashWorld(w) {
  return fnv([
    w.tick, w.phase, w.wave, w.bossKills, r(w.gold), w.rerolls, w.banishes, w.rng.gold.state, w.lives, w.kills, w.path.map(c => c.join(',')).join('>'), w.rng.relic.state, w.rng.combat.state,
    w.relics.map(x => x.name + x.r).join(','),
    w.heroes.map(h => [h.id, h.type, h.cx, h.cy, r(h.dealt), h.kills, h.tier, r(h.energy), h.ults, h.level, h.xp, h.def.form || '', (h.buffs || []).map(b => b.id + r(b.t)).join('+')].join(':')).join(';'),
    w.enemies.map(e => [e.type, r(e.d), r(e.hp)].join(':')).join(';'),
    (w.zones || []).map(z => [z.type, r(z.t), r(z.x), r(z.y)].join(':')).join(';'),
    w.projs.map(p => [p.type, r(p.x), r(p.y)].join(':')).join(';'),
    /* co-op: every other player's gold and relics, and who owns each hero */
    (w.players || []).slice(1).map(p => [r(p.gold), p.rerolls, p.banishes, p.relics.map(x => x.name + x.r).join(',')].join(':')).join(';'),
    w.coop ? w.heroes.map(h => h.owner).join(',') : ''
  ].join('|'));
}
