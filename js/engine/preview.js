/* Form previews at work (the data is js/content/previews.js). A hero placed with an evolution path gets:
   - h.def = pathDef(...): the base hero with the form's tags (and the preview's damage conversion, blood price or horse);
   - h.preview = { form, spec }: the form and its preview;
   - h.pvMods: the preview's modifiers at the hero's level (ailment chances, the slower base attack, a companion's price);
   - h.echo: for "every Nth", companion and aura previews, an echo of the hero that runs the FORM's behavior with the form's
     stats. The echo stands where the hero stands, its hits are credited to the hero, and it never fills an energy bar or
     fires an ultimate. An "every Nth" echo attacks once for every N base attacks (the base attack slows to match), and
     gives the hero the energy of the attack it replaced.
   Everything is recomputed with the hero's stats (statsFor), so it grows as the hero levels. The evolution removes it. */
import { HEROES, evolvedDef } from '../content/data.js';
import { PREVIEWS, at, everyAt } from '../content/previews.js';
import { BEHAVIORS, ready, rearm, rateOf, pickTarget } from './behaviors.js';
import { heroStats, minionStats } from './stats.js';
import { knockback } from './enemies.js';
import { addVerdict, VERDICT } from './kits/paladin.js';
import { T } from '../content/data.js';

/* The first evolution's choice for a path, or null. */
export function pathChoice(heroId, formId) {
  const h = HEROES.find(x => x.id === heroId), step = h && h.evolutions && h.evolutions[0];
  return (step && step.choices.find(c => c.id === formId)) || null;
}
/* A clean { heroId: formId } for a lineup: only first-evolution forms of heroes in it. */
export function cleanPaths(paths, lineup) {
  const out = {};
  for (const id of lineup || []) if (paths && typeof paths[id] === 'string' && pathChoice(id, paths[id])) out[id] = paths[id];
  return out;
}

/* The base hero as it plays with a path: its own kind, attack and ultimate, plus the form's tags. */
export function pathDef(base, choice) {
  const spec = PREVIEWS[choice.id] || {};
  return { ...base, core: base, preview: choice.id, tags: [...new Set([...base.tags, ...(choice.tags || [])])], ...(spec.mounted ? { mounted: true } : {}) };
}

/* Sets up a freshly placed hero for its path. */
export function startPreview(h, choice) {
  const spec = PREVIEWS[choice.id];
  h.def = pathDef(h.def, choice);
  h.preview = { form: choice.id, spec: spec || {}, color: choice.color || h.def.color, name: choice.name };
  h.pvMods = []; h._pvCd = h.cd;
  if (spec && (spec.every || spec.companion || spec.aura)) h.echo = makeEcho(h, evolvedDef(h.def.core, choice));
}
/* Called by the evolution: back to a plain hero (the form takes over). */
export function endPreview(h) {
  if (!h.preview) return;
  if (h.def.core) h.def = h.def.core;
  h.preview = null; h.pvMods = null; h.echo = null;
}

function makeEcho(h, def) {
  const e = Object.create(h);
  Object.defineProperties(e, {
    energy: { get: () => 0, set() {}, enumerable: true },       /* no energy bar of its own: never an ultimate */
    ultNow: { get: () => false, set() {}, enumerable: true },
    dealt: { get: () => h.dealt, set: v => { h.dealt = v; }, enumerable: true },
    kills: { get: () => h.kills, set: v => { h.kills = v; }, enumerable: true }
  });
  Object.assign(e, { def, echoOf: h, cd: 0.5, lock: null, proj: null, ramp: 0, s: null, ms: null });
  return e;
}

/* An "every Nth" echo hits at this share of the form's damage (the form's +50% comes with the evolution). */
export const EVERY_POWER = 0.75;
const mod = (stat, type, value) => ({ stat, type, value, scope: ['all'], source: 'Path preview', ri: -4 });
/* The preview's modifiers at the hero's level (added to its own in statsFor). */
export function previewMods(h) {
  const sp = h.preview.spec, L = h.level, out = [];
  for (const k in sp.mods || {}) out.push(mod(k, 'flat', at(sp.mods[k], L)));
  for (const k in sp.chance || {}) out.push(mod(k, 'flat', at(sp.chance[k], L)));
  const cut = (sp.companion && sp.companion.cut) || (sp.aura && sp.aura.cut);
  if (cut) out.push(mod('damage', 'more', -cut));
  return out;
}

/* After the hero's stats are computed: the def's growing parts, the slower base attack, and the echo's stats. */
export function syncPreview(h, mods) {
  const sp = h.preview.spec, L = h.level;
  if (sp.convert) { const c = {}; for (const t in sp.convert) c[t] = at(sp.convert[t], L); h.def = { ...h.def, convert: c }; }
  if (sp.bloodPrice) h.def = { ...h.def, bloodPrice: at(sp.bloodPrice, L) };
  const e = h.echo;
  if (!e) return;
  e.s = heroStats(e.def, mods);
  if (sp.every) {
    const n = everyAt(sp.every, L), period = h.s.cooldown / rateOf(h);   /* one base attack */
    h.s = { ...h.s, cooldown: h.s.cooldown * n / (n - 1) };                /* n - 1 of every n attacks stay the base one */
    e.s.cooldown = period * n * rateOf(e);                                   /* and the echo makes the nth */
    e.s.damage *= EVERY_POWER;                                               /* a taste of the form, not all of it */
    e.n = n;
  }
  if (sp.companion) {
    e.ms = minionStats(e.s);
    const k = at(sp.companion.power, L);
    for (const key in e.ms) if (key === 'damage' || (key.endsWith('Damage') && key !== 'critDamage' && !key.startsWith('minion'))) e.ms[key] *= k;
    e.impMax = e.totemMax = sp.companion.max || 1;
  }
  if (sp.aura) {
    const k = at(sp.aura.power, L);
    e.s.range *= at(sp.aura.radius, L);
    e.s.damage *= k;
    e.s.area = h.s.area;
  }
}

/* Every step, after the hero's own behavior. */
export function updatePreview(w, h, dt) {
  const sp = h.preview.spec;
  const cd0 = h._pvCd ?? h.cd;
  if (sp.energy && h.cd > cd0 + 1e-9) {          /* the hero just attacked: the Gospel's energy for the heroes nearby */
    const r2 = 100 * 100, amount = at(sp.energy, h.level);
    for (const o of w.heroes) if (o !== h && (o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= r2) o.energy = Math.min(o.s.energyMax, o.energy + amount);
  }
  h._pvCd = h.cd;
  const e = h.echo;
  if (!e) return;
  if (sp.act) { act(w, e, dt, sp.act); return; }
  const before = e.cd;
  BEHAVIORS[e.def.kind].update(w, e, dt);
  if (sp.every && e.cd > before + 1e-9 && w.gainEnergy) w.gainEnergy(h);   /* the attack it replaced would have filled the bar */
}

/* Custom echo attacks. pierce: the Marksman's arrow that flies through a line of enemies (one hit each). */
function act(w, e, dt, kind) {
  if (kind !== 'pierce' || !ready(e, dt)) return;
  const tg = pickTarget(w, e, e.s.range);
  if (!tg) return;
  const dx = tg.x - e.x, dy = tg.y - e.y, len = Math.hypot(dx, dy) || 1;
  w.projs.push({ type: 'pierce', owner: e, x: e.x, y: e.y, dx: dx / len, dy: dy / len, charge: 0, dist: 0, max: e.s.range * 1.6, hit: new Set(), scale: 1 });
  rearm(e);
  if (w.gainEnergy) w.gainEnergy(e.echoOf);
}

/* On every hit of a hero (combat.attack): the Sentinel's push and the Inquisitor's Verdict. */
export function previewHit(w, h, enemy) {
  const sp = h.preview && h.preview.spec;
  if (!sp || enemy.dead) return;
  if (sp.knock) knockback(w, enemy, at(sp.knock, h.level) * T);
  if (sp.verdict) {                                  /* a stack, up to the preview's cap; at the cap it is only refreshed */
    const v = enemy.fx && enemy.fx.verdict, cap = Math.round(at(sp.verdict, h.level));
    if (v && v.n >= cap) v.t = VERDICT.seconds; else addVerdict(enemy);
  }
}
