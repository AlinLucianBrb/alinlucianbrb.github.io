/* What the effect stats do (js/content/effect-stats.js): the situational damage of a hit, what follows a hit, and what follows a
   kill or an ultimate. A hero whose effect stats are all 0 (s.fxOn false) never comes here, and uses no random rolls. Extra hits
   (a chain, a splash...) never cause more of them. */
import { PROC, EFFECT_KEYS } from '../content/effect-stats.js';
import { T } from '../content/data.js';
import { EFFECTS, applyEffect } from './effects.js';
import { gainEnergy } from './ultimates.js';
import { nearest } from './upgrades.js';

export const hasEffects = s => EFFECT_KEYS.some(k => s[k] > 0);
let busy = false;        /* inside an extra hit */
export const isExtra = () => busy;
export function extra(f) { busy = true; try { f(); } finally { busy = false; } }

const beside = (w, h) => { let n = 0; for (const o of w.heroes) if (o !== h && o.id !== h.id && (o.owner || 0) === (h.owner || 0) && Math.max(Math.abs(o.cx - h.cx), Math.abs(o.cy - h.cy)) === 1) n++; return n; };
const held = e => { if (!e.fx) return false; for (const id in e.fx) { const d = EFFECTS[id]; if (d.kind === 'slow' || d.kind === 'freeze' || d.speedMult) return true; } return false; };

/* The multiplier of one hit (its own count of hits goes up with it: Tempo). full: a whole hit, not a beam's sliver. */
export function damageBonus(w, h, e, s, full) {
  let k = 0;
  const life = e.hp / e.max;
  if (s.vsLow > 0 && life < PROC.low) k += s.vsLow;
  if (s.vsFull > 0 && life > PROC.full) k += s.vsFull;
  if (s.vsBoss > 0 && e.def && e.def.boss) k += s.vsBoss;
  if (s.vsHeld > 0 && held(e)) k += s.vsHeld;
  if (s.vsFrozen > 0 && e.fx && e.fx.freeze) k += s.vsFrozen;
  if (s.lone > 0 || s.brother > 0) { const n = beside(w, h); k += n ? n * s.brother : s.lone; }
  if (s.lastStand > 0) k += s.lastStand * Math.max(0, 10 - w.lives);
  if (s.trophy > 0) k += s.trophy * Math.min(PROC.trophyMost, Math.floor(w.kills / 50));
  if (s.fever > 0) { const p = w.players && w.players[h.owner || 0]; if (p) k += s.fever * Math.min(PROC.feverMost, Math.floor(p.gold / 200)); }
  if (s.perTile > 0) k += s.perTile * Math.hypot(e.x - h.x, e.y - h.y) / T;
  if (full && !busy) {
    const root = h.echoOf || h;
    root.hitN = (root.hitN || 0) + 1;
    if (s.tempo > 0 && root.hitN % PROC.tempo === 0) k += s.tempo;
  }
  return 1 + k;
}
/* After a whole hit that dealt `total`. o: { scale, as, stats, own, crit, shocked (before the hit) }. */
export function afterHit(w, h, e, total, s, o) {
  if (busy || !(total > 0)) return;
  const roll = c => c > 0 && w.rng.combat.next() < Math.min(1, c), root = h.echoOf || h;
  if (s.splash > 0) extra(() => { for (const t of [...w.enemies]) if (!t.dead && t !== e && (t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= PROC.splash ** 2) w.hit(h, t, total * s.splash, o.own, true); });
  if (o.crit && roll(s.chainCrit)) { const t = nearest(w, e.x, e.y, PROC.chain, new Set([e])); if (t) { w.fx?.beam(e.x, e.y, t.x, t.y, 0.12, '#ffd84a', 2); extra(() => w.attack(h, t, o.scale * 0.5, 1, o.as, o.stats)); } }
  if (o.shocked && !e.dead && roll(s.thunder)) extra(() => { w.fx?.strike?.(e.x, e.y); w.attack(h, e, o.scale, 1, 'lightning', o.stats); });
  if (!e.dead && roll(s.recast)) extra(() => w.attack(h, e, o.scale, 1, o.as, o.stats));
  if (s.fifth > 0 && !e.dead && (root.hitN || 0) % PROC.fifth === 0) extra(() => w.attack(h, e, o.scale, 1, o.as, o.stats));
}
/* Momentum: each kill adds a step and starts the time again; the buff is made anew, since a running buff keeps its numbers. */
function momentum(w, h) {
  const v = Math.min(PROC.momentum.most, h.s.momentum), list = (h.buffs ||= []), i = list.findIndex(b => b.id === 'momentum');
  const n = Math.min(PROC.momentum.stacks, (i >= 0 && list[i].t > 0 ? h.momentumN || 0 : 0) + 1);
  if (i >= 0) list.splice(i, 1);
  h.momentumN = n;
  w.addBuff(h, 'momentum', 'Momentum ×' + n, ['speed', 'castSpeed'].map(stat => ({ stat, type: 'inc', value: v * n })), PROC.momentum.seconds, { s: { duration: 1 } });
}
export function attachProcs(w) {
  w.ev.on('kill', ({ hero }) => { const h = hero && (hero.echoOf || hero); if (h && h.s && h.s.momentum > 0) momentum(w, h); });
  w.ev.on('ultimate', ({ hero: h }) => {
    if (!(h.s.overflow > 0)) return;
    for (const o of w.heroes) if (o !== h && (o.owner || 0) === (h.owner || 0)) gainEnergy(o, Math.min(PROC.overflowMost, h.s.overflow));
  });
}
/* Ailments just put on an enemy (inflict, combat.js): Pyromancy's stagger and Thunderstruck's jump. fresh: it was not there before. */
export function afterAilment(w, h, e, id, hit, fresh, inflict) {
  const s = h && h.s;
  if (!s || !s.fxOn) return;
  if (id === 'burn' && fresh && s.stagger > 0) applyEffect(e, 'stun', { t: s.stagger });
  if (id === 'shock' && s.arcing > 0 && !busy) { const t = nearest(w, e.x, e.y, PROC.jump, new Set([e])); if (t && !(t.fx && t.fx.shock)) extra(() => inflict(w, h, t, 'shock', hit)); }
}
/* Sunder: how many points of defenses an enemy's Corruption takes (mitigate, combat.js). */
export function withered(e) {
  const c = e.fx && e.fx.corruption;
  if (!c || !c.stacks || !c.stacks.length) return 0;
  let k = 0;
  for (const st of c.stacks) k += (st.src && st.src.s && st.src.s.wither) || 0;
  return k;
}
/* Toxins: whether an enemy's poison stops it from healing. */
export const cannotHeal = e => !!(e.fx && e.fx.poison && e.fx.poison.stacks && e.fx.poison.stacks.some(st => st.src && st.src.s && st.src.s.venom > 0));
