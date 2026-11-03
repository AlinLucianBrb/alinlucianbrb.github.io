/* A short fingerprint of a world's state, used by tests to check that two runs ended up in exactly the same place. */
const fnv = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const r = x => Math.round(x * 1e6) / 1e6;

export function hashWorld(w) {
  return fnv([
    w.tick, w.phase, w.wave, r(w.gold), w.lives, w.kills, w.path.map(c => c.join(',')).join('>'), w.rng.relic.state, w.rng.combat.state,
    w.relics.map(x => x.name + x.r).join(','),
    w.heroes.map(h => [h.id, h.type, h.cx, h.cy, r(h.dealt), h.kills, h.tier, r(h.energy), h.ults].join(':')).join(';'),
    w.enemies.map(e => [e.type, r(e.d), r(e.hp)].join(':')).join(';')
  ].join('|'));
}
