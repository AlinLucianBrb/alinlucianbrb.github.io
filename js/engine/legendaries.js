/* Legendary relics at work (the data is js/content/legendaries.js). A player has at most one: p.legendary (an id, or null).
   p.souls: Soul harvest's kills; p.taken: the relics taken since (Collector). w.echoes: ultimates about to fire again.
   What the attacks, ultimates and effects ask while they run is in legend-perks.js. */
import { LEGENDARIES, LEGENDARY, GENERAL, classLegendary } from '../content/legendaries.js';
import { EFFECTS, applyEffect } from './effects.js';
import { around } from './upgrades.js';
import { legend } from './legend-perks.js';
import { execute } from './combat.js';
import { gainEnergy } from './ultimates.js';
import { makeEcho } from './preview.js';
import { pickTarget } from './behaviors.js';
import { giveRelic } from './relics.js';
import { extra, isExtra } from './procs.js';

const rootOf = h => (h && h.echoOf) || h;
/* ---- The choice ---- */
/* One for each of the player's heroes on the map (the lineup has at most 3), and the rest, at least one, for everyone. */
function drawLegendaries(w, p) {
  const ids = [...new Set(w.heroes.filter(h => (h.owner || 0) === p.i).map(h => classLegendary(h.base.id)).filter(Boolean))].slice(0, LEGENDARY.offers - 1);
  const pool = [...GENERAL];
  while (ids.length < LEGENDARY.offers && pool.length) ids.push(pool.splice(w.rng.fx.int(pool.length), 1)[0]);
  return ids;
}
/* Called when a wave has been cleared (never on the last one). A player still choosing a relic gets it right after. */
export function openLegendaries(w) {
  if (w.wave !== LEGENDARY.wave) return;
  for (const p of w.players) if (!p.left && !p.legendary) { p.legendDue = true; legendDue(w, p); }
}
export function legendDue(w, p) {
  if (!p.legendDue || p.pick || w.phase === 'over') return;
  p.legendDue = false;
  p.pick = { legendary: true, offers: drawLegendaries(w, p).map(id => ({ id })), uses: 0 };
  p.picking = true;
}
export function takeLegendary(w, p, id) { p.legendary = id; w.ev.emit('legendary', { player: p.i, id }); }

/* ---- Relics: the Collector ---- */
/* A relic newly taken by a player (the shop's choice, the gamble): every third one counts twice. Returns whether it did. */
export function takeRelic(w, p, def, ri) {
  giveRelic(w, p, def, ri);
  if (p.legendary !== 'collector') return false;
  p.taken = (p.taken || 0) + 1;
  if (p.taken % LEGENDARIES.collector.every) return false;
  giveRelic(w, p, def, ri);
  return true;
}

/* ---- Stats ---- */
const mod = (stat, type, value, source) => ({ stat, type, value, scope: ['all'], source, ri: -7 });
/* The modifiers a hero has from its player's legendary (statsFor), or null. */
export function legendMods(w, h) {
  const o = legend(w, h, 'overload');
  if (o) return [mod('critChance', 'flat', o.crit, o.name)];
  const s = legend(w, h, 'souls'), n = s && w.players[h.owner || 0].souls;
  return n ? [mod('damage', 'more', s.per * n, s.name)] : null;
}
/* ---- Hits and attacks ---- */
/* After a hit (combat.js). full: a whole hit, not a beam's sliver. */
function legendHit(w, h, e, crit, full, stats) {
  const p = w.players && w.players[h.owner || 0];
  if (!p || !p.legendary) return;
  const m = crit && !e.dead && legend(w, h, 'mark');
  if (m) { execute(w, h, e, m.share); return; }
  const d = full && !isExtra() && legend(w, h, 'wrath');
  if (!d) return;
  const root = rootOf(h);
  root.wrathN = (root.wrathN || 0) + 1;
  if (root.wrathN < d.every || e.dead) return;   /* a hit that killed keeps the smite for the next one */
  root.wrathN = 0;
  w.fx?.beam(e.x, e.y - 80, e.x, e.y, 0.18, '#fff3b0', 5);
  extra(() => w.attack(h, e, d.scale, 1, 'holy', stats));
}
/* After an attack, whatever it hit (charge, behaviors.js). */
function legendAttack(w, t) {
  const p = w.players && w.players[t.owner || 0], h = rootOf(t);
  if (!p || !p.legendary) return;
  const b = legend(w, h, 'bladestorm');
  if (b) {
    h.attackN = (h.attackN || 0) + 1;
    if (h.attackN % b.every === 0) {
      const r = h.s.range * b.reach;
      w.fx?.slash(h.x, h.y, 0, Math.PI, r, 0.3, 'rgba(255,190,110,.75)');
      for (const e of around(w, h.x, h.y, r)) if (!e.dead) w.attack(h, e, 1);
    }
  }
  const l = legend(w, h, 'light');
  if (l) for (const o of w.heroes) if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= l.radius ** 2) w.addBuff(o, 'lastinglight', l.name, [{ stat: 'damage', type: 'inc', value: l.damage }], l.seconds, h);
}
/* ---- Ultimates ---- */
/* Arcane echo: the ultimate again, from a shadow of the Mage with half the damage (or, for an ultimate that is all time, half
   the time: `time` on it). One that only strengthens the next attack fires a bolt. */
const isDamage = k => k === 'damage' || (k.endsWith('Damage') && k !== 'critDamage' && !k.startsWith('minion'));
function echoUltimate(w, { h, u, target }, l) {
  const o = makeEcho(h, h.def);
  o.s = { ...h.s };
  for (const k in o.s) if (isDamage(k)) o.s[k] *= l.power;
  if (u.time) o.s.duration = (o.s.duration || 1) * l.power;
  const tg = target && !target.dead ? target : pickTarget(w, h, h.s.range);
  if (u.onFire) u.onFire(w, o, tg);
  if ((u.damageMult || 1) > 1 && tg) w.projs.push({ type: 'bolt', owner: o, target: tg, x: h.x, y: h.y, scale: u.damageMult, color: '#fff6c8', size: 8, look: h.def.projLook || 'orb', speed: h.def.projSpeed || 0, dx: 1, dy: 0 });
}
export function updateLegendaries(w, dt) {
  for (let i = 0; i < w.echoes.length; i++) if ((w.echoes[i].t -= dt) <= 0) { const [x] = w.echoes.splice(i--, 1), l = legend(w, x.h, 'echo'); if (l) echoUltimate(w, x, l); }
}

/* ---- Deaths and the gate ---- */
/* Plague: each damage over time the enemy died with (from a hero that has it): the enemies around take twice what was left of
   it at once, and the ones that live through that catch it. */
function plague(w, e) {
  const left = [];
  for (const id in e.fx) {
    const def = EFFECTS[id], f = e.fx[id];
    if (def.kind !== 'dot' && !def.stacks) continue;
    for (const st of new Set(def.stacks ? f.stacks : [f])) if (st.t > 0 && st.dps > 0 && st.src && legend(w, st.src, 'plague')) left.push({ id, st: { ...st }, type: def.type });
  }
  if (!left.length) return;
  const l = LEGENDARIES.plague, near = around(w, e.x, e.y, l.radius, e);
  if (near.length) w.ev.emit('explode', { zone: { x: e.x, y: e.y } });
  for (const o of near) {
    for (const x of left) { if (o.dead) break; w.dot(x.st.src, o, x.st.dps * x.st.t * l.blast, x.type); }
    if (!o.dead) for (const x of left) applyEffect(o, x.id, { ...x.st });
  }
}
/* Iron gate: whether this escape costs no lives. In co-op every player with it has its own per wave. */
export function ironGate(w, e) {
  if (e.def.boss) return false;
  const p = w.players.find(x => x.legendary === 'gate' && x.gateWave !== w.wave);
  if (!p) return false;
  p.gateWave = w.wave;
  w.ev.emit('gate', { player: p.i, enemy: e });
  return true;
}
export function attachLegendaries(w) {
  w.afterAttack = t => legendAttack(w, t);
  w.afterHit = (h, e, crit, full, stats) => legendHit(w, h, e, crit, full, stats);
  w.ev.on('kill', ({ hero, enemy: e }) => {
    if (!w.players.some(p => p.legendary)) return;
    if (e.fx) plague(w, e);
    if (e.def.minion) return;
    const hex = e.fx && e.fx.hex && e.fx.hex.src, h = [rootOf(hero), rootOf(hex)].find(x => x && legend(w, x, 'souls'));
    const p = h && w.players[h.owner || 0], l = LEGENDARIES.souls;
    if (p && (p.souls || 0) < l.max) { p.souls = (p.souls || 0) + 1; w.statsFor(h); }
  });
  w.ev.on('ultimate', ({ hero: h, ultimate: u, target }) => {
    const g = legend(w, h, 'gift'), a = legend(w, h, 'echo');
    if (g) for (const o of w.heroes) if (o !== h && (o.owner || 0) === (h.owner || 0)) gainEnergy(o, g.energy);
    if (a) w.echoes.push({ t: a.delay, h, u, target });
  });
}
/* Its part of a world's fingerprint (hash.js). */
export const legendHash = w => w.players.map(p => [p.legendary || '', p.souls || 0, p.taken || 0, p.gateWave || 0, p.legendDue ? 1 : 0, p.pick && p.pick.legendary ? p.pick.offers.map(o => o.id).join('+') : ''].join('/')).join(';')
  + w.echoes.map(x => x.t.toFixed(6)).join(',');
