/* Seeded random numbers (mulberry32). The engine never calls Math.random: the same seed and the same commands always give the same game.
   fork(label) makes an independent stream from the same seed, so e.g. map generation never changes relic offers. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function createRng(seed) {
  const seed0 = seed >>> 0;
  let a = seed0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: n => Math.floor(next() * n),
    fork: label => createRng(hashSeed(seed0 + ':' + label)),
    get state() { return a; }
  };
}
