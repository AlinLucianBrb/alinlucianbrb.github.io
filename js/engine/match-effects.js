/* Match effects at work (the data is js/content/match-effects.js). w.effects: the ids chosen so far. w.fxm: every flag of the
   match's effects and of its map (map-effects.js) put together. w.vote: the choice that is open, or null:
   { wave, offers: [ids], votes: { player index: offer index or -1 for none }, t: seconds left (co-op) }. Solo, the match waits for
   it; in co-op it goes on, and the vote closes when everyone has voted or the time is up. */
import { MATCH_EFFECTS, MATCH_PICKS, FX_BASE } from '../content/match-effects.js';
import { RELICS } from '../content/data.js';
import { giveRelic, removeRelic, looseRelics } from './relics.js';

/* Adds an effect's flags to w.fxm: numbers multiply, switches turn on. */
export function addFlags(w, flags) {
  for (const k in flags || {}) w.fxm[k] = typeof flags[k] === 'number' ? w.fxm[k] * flags[k] : flags[k];
}
export function addHeroMods(w, mods, source) { for (const p of w.players) for (const m of mods || []) p.mods.push({ ...m, source, ri: -6 }); }
export const freshFx = () => ({ ...FX_BASE });

/* Called when a wave has been cleared (never on the last one). */
export function openVote(w) {
  if (!w.matchEffects || !MATCH_PICKS.waves.includes(w.wave)) return;
  const pool = Object.keys(MATCH_EFFECTS).filter(id => !w.effects.includes(id)), offers = [];
  while (offers.length < MATCH_PICKS.offers && pool.length) offers.push(pool.splice(w.rng.fx.int(pool.length), 1)[0]);
  w.vote = { wave: w.wave, offers, votes: {}, t: MATCH_PICKS.seconds };
}
/* A player's vote; changing it is allowed while the vote is open. Returns a reason, or '' if it counted. */
export function castVote(w, p, index, recalc) {
  if (!w.vote) return 'no vote';
  if (index !== -1 && !w.vote.offers[index]) return 'bad index';
  w.vote.votes[p.i] = index;
  if (w.players.every(x => x.left || x.i in w.vote.votes)) closeVote(w, recalc);
  return '';
}
export function tickVote(w, dt, recalc) {
  if (!w.vote || !w.coop) return;
  if ((w.vote.t -= dt) <= 0 || w.players.every(x => x.left || x.i in w.vote.votes)) closeVote(w, recalc);
}
/* The most votes win (none of them counts as a choice too); a tie is drawn by lot. Nobody voted: none. */
function closeVote(w, recalc) {
  const count = new Map();
  for (const p of w.players) if (p.i in w.vote.votes && !p.left) { const v = w.vote.votes[p.i]; count.set(v, (count.get(v) || 0) + 1); }
  const top = Math.max(0, ...count.values()), tied = [...count.keys()].filter(k => count.get(k) === top).sort((a, b) => a - b);
  const won = !tied.length ? -1 : tied.length === 1 ? tied[0] : tied[w.rng.fx.int(tied.length)], id = won >= 0 ? w.vote.offers[won] : null;
  w.vote = null;
  if (id) startEffect(w, id, recalc);
  w.ev.emit('effect', { id });
}
export function startEffect(w, id, recalc) {
  const e = MATCH_EFFECTS[id];
  w.effects.push(id);
  addFlags(w, e.flags);
  addHeroMods(w, e.mods, e.name);
  if (e.once === 'melt') for (const p of w.players) {
    let lost = 0;
    for (const r of looseRelics(p)) if (r.r > 0) { lost += r.r; const d = RELICS.find(x => x.name === r.name); removeRelic(p, r); giveRelic(w, p, d, 0, r.k || 1); }
    if (lost) p.mods.push({ stat: 'damage', type: 'more', value: e.perRarity * lost, scope: ['all'], source: e.name, ri: -6 });
  }
  recalc(w);
}
