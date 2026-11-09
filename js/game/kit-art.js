/* How the newer heroes' things look (their kits are in js/engine/kits): auras, projectiles, zones and minions. render.js
   merges these into its tables, so each new hero adds its visuals here instead of growing render.js. Every drawer uses a
   sprite when the art has loaded and a plain shape otherwise. */
import { drawSprite, frameOf } from './sprites.js';
import { T } from '../content/data.js';

const ENEMY_SIZE = { runner: 44, grunt: 48, brute: 56, boss: 68 };

/* Auras lie on the ground under everything: a soft disc in the hero's colour, a ring at the edge, and a ripple running out
   from the hero on each pulse (t.pulse counts down from AURA.ripple). A boosted aura (Crescendo) is brighter. */
export function drawAuras(ctx, g) {
  for (const t of g.heroes) {
    if (t.def.kind !== 'aura') continue;
    const boosted = t.auraBoost && t.auraBoost.t > 0, r = t.s.range * (boosted ? t.auraBoost.radius : 1), c = t.def.color;
    ctx.globalAlpha = boosted ? 0.22 : 0.12;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, 7); ctx.fillStyle = c; ctx.fill();
    ctx.globalAlpha = boosted ? 0.85 : 0.5; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.arc(t.x, t.y, r - 1, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (t.pulse > 0) {
      const k = 1 - t.pulse / 0.35;
      ctx.globalAlpha = 0.45 * (1 - k); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, Math.max(4, r * k), 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export const KIT_PROJ = {
  /* Lobbed things (Hellfire): an arc toward the spot, with a shadow below. */
  lob(ctx, p) {
    const k = Math.min(1, p.t / p.dur), y = p.y - Math.sin(k * Math.PI) * 40;
    ctx.beginPath(); ctx.ellipse?.(p.x, p.y, 6, 3, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    if (drawSprite(ctx, 'proj_hellfire', p.x, y, 28, Math.atan2(p.ty - p.sy, p.tx - p.sx))) return;
    ctx.beginPath(); ctx.arc(p.x, y, 7, 0, 7); ctx.fillStyle = '#ff6a3a'; ctx.fill();
  },
  /* Archangel's lance of light: a long white-gold streak with a glow. */
  lance(ctx, p) {
    const L = 34, tx = p.x - p.dx * L, ty = p.y - p.dy * L, big = p.scale > 1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,215,106,.45)'; ctx.lineWidth = big ? 12 : 8;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = big ? 5 : 3;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x + p.dx * 6, p.y + p.dy * 6); ctx.stroke();
  },
  /* Plague of locusts: a buzzing cloud of specks over the path. */
  swarm(ctx, p) {
    ctx.fillStyle = 'rgba(40,60,20,.85)';
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4 + p.t * (4 + (i % 3)), r = 6 + (i * 7) % 20;
      ctx.fillRect(p.x + Math.cos(a) * r - 1, p.y - 8 + Math.sin(a * 1.3) * r * 0.6 - 1, 2.5, 2.5);
    }
    ctx.beginPath(); ctx.arc(p.x, p.y - 6, 26, 0, 7); ctx.fillStyle = 'rgba(138,208,75,.12)'; ctx.fill();
  },
  /* Cavalry: three phantom riders in a row, pale gold and see-through, galloping toward the entrance. */
  cavalry(ctx, p) {
    for (let k = 0; k < 3; k++) {
      const back = k * 26, a = 0.6 - k * 0.15;
      ctx.globalAlpha = a;
      const x = p.x + (p.dx || 0) * back, y = p.y + (p.dy || 0) * back;
      if (!flip(ctx, frameOf('minion_horse', ((p.d / 14) | 0) % 2 === 1), x, y, 52, p.face || -1)) { ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = '#fff0a8'; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  },
  /* Gospel's converted enemy: its own sprite, faded and golden, walking back. */
  spirit(ctx, p) {
    const s = ENEMY_SIZE[p.enemy] || 48;
    ctx.beginPath(); ctx.ellipse?.(p.x, p.y + 6, s * 0.32, s * 0.12, 0, 0, 7); ctx.fillStyle = 'rgba(255,233,160,.35)'; ctx.fill();
    ctx.globalAlpha = 0.6;
    const ok = drawSprite(ctx, frameOf('enemy_' + p.enemy, ((p.d / 9) | 0) % 2 === 1), p.x, p.y - s * 0.2, s);
    ctx.globalAlpha = 1;
    if (!ok) { ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.fillStyle = 'rgba(255,233,160,.7)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(p.x, p.y - s * 0.55, 6, 0, 7); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2; ctx.stroke();   /* a halo */
  }
};

/* Minions that are not the wolf: the Summoner's imps and Greater Demon (2-frame flap and stomp, facing where they go). */
export function drawMinions(ctx, g) {
  for (const t of g.heroes) {
    if (t.imps) for (const imp of t.imps) {
      const fade = Math.min(1, imp.t * 2);
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.ellipse?.(imp.x, imp.y + 22, 7, 2.5, 0, 0, 7); ctx.fillStyle = 'rgba(122,224,255,.3)'; ctx.fill();   /* an ally's soft glow */
      if (!flip(ctx, frameOf('minion_imp', ((g.tick + imp.ox * 7) / 8 | 0) % 2 === 1), imp.x, imp.y, 30, imp.face)) {
        ctx.beginPath(); ctx.arc(imp.x, imp.y, 7, 0, 7); ctx.fillStyle = '#4a62b8'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const d = t.demon;
    if (d) {
      ctx.globalAlpha = Math.min(1, d.t * 2);
      ctx.beginPath(); ctx.ellipse?.(d.x, d.y + 12, 20, 6, 0, 0, 7); ctx.fillStyle = 'rgba(122,224,255,.25)'; ctx.fill();
      ctx.strokeStyle = 'rgba(122,224,255,.8)'; ctx.lineWidth = 2; ctx.stroke();   /* an ally's ring: summoned demons are spectral blue, never like the enemies */
      if (!flip(ctx, frameOf('minion_demon', d.cleave > 0 || ((g.tick / 14) | 0) % 2 === 1), d.x, d.y - 14, 64, d.face)) {
        ctx.beginPath(); ctx.arc(d.x, d.y - 8, 18, 0, 7); ctx.fillStyle = '#3a4a8a'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}
/* The Crusader on his horse: at his post, or wherever he is riding (t.ride), facing where he goes; the horse gallops while he
   rides. Returns false while the art is loading (render.js then draws the plain shape). */
export function drawMounted(ctx, g, t, size, dy) {
  const r = t.ride, x = r ? r.x : t.x, y = r ? r.y : t.y, face = r ? r.face : 1, gallop = r ? ((g.tick / 5) | 0) % 2 === 1 : false;
  ctx.beginPath(); ctx.ellipse?.(x, y + 16, 20, 5, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
  if (!flip(ctx, frameOf('minion_horse', gallop), x, y + 4, 56, face)) return false;
  flip(ctx, frameOf('hero_' + (t.def.form || t.def.id), false), x + 2 * face, y + dy - 14, size * 0.82, face);
  return true;
}
/* A sprite facing left (face -1) or right. */
function flip(ctx, name, x, y, s, face) {
  if (face >= 0) return drawSprite(ctx, name, x, y, s);
  ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
  const ok = drawSprite(ctx, name, 0, 0, s);
  ctx.restore(); return ok;
}

export const KIT_ZONE = {
  /* Pulse zones, by look: Hellfire's burning ground, the Infernal golem, the Paladin's Consecration. */
  pulse(ctx, z) {
    const fade = Math.min(1, z.t * 2), flick = 0.85 + 0.15 * Math.sin(z.t * 30);
    if (z.look === 'golem') {
      ctx.globalAlpha = 0.25 * fade; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fillStyle = '#ff6a3a'; ctx.fill();
      ctx.globalAlpha = fade;
      if (!drawSprite(ctx, frameOf('minion_golem', ((z.t * 4) | 0) % 2 === 1), z.x, z.y - 14, 56)) { ctx.beginPath(); ctx.arc(z.x, z.y - 8, 16, 0, 7); ctx.fillStyle = '#5a3a2a'; ctx.fill(); }
      ctx.globalAlpha = 1; return;
    }
    const col = z.look === 'consecrate' ? '255,233,160' : '255,106,58';
    ctx.globalAlpha = fade;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fillStyle = 'rgba(' + col + ',' + (0.22 * flick) + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(' + col + ',.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 5; i++) {   /* little flames (or motes of light) dancing over it */
      const a = i * 1.26 + z.t * 3, rr = z.r * (0.3 + 0.12 * i);
      ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6, 2.5, 0, 7);
      ctx.fillStyle = z.look === 'consecrate' ? 'rgba(255,251,230,.8)' : 'rgba(255,200,90,.85)'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  /* Infernal's meteor: a fireball growing as it falls toward its shadow. */
  meteor(ctx, z) {
    const k = 1 - z.t / z.life;
    ctx.beginPath(); ctx.ellipse?.(z.x, z.y, z.r * k, z.r * 0.4 * k, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    const y = z.y - 140 * (1 - k), s = 24 + 30 * k;
    if (!drawSprite(ctx, 'proj_fireball', z.x + 30 * (1 - k), y, s, Math.PI / 2 + 0.4)) { ctx.beginPath(); ctx.arc(z.x, y, s / 3, 0, 7); ctx.fillStyle = '#ff6a3a'; ctx.fill(); }
  },
  /* Totems (Totemist): the carved pole for its kind, a flash when it fires, fading in its last half second. */
  totem(ctx, z) {
    ctx.globalAlpha = Math.min(1, z.t * 2);
    ctx.beginPath(); ctx.ellipse?.(z.x, z.y + 14, 13, 4, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    if (z.flash > 0) { ctx.beginPath(); ctx.arc(z.x, z.y - 6, 18 + 20 * z.flash, 0, 7); ctx.fillStyle = TOTEM_GLOW[z.kind]; ctx.fill(); }
    if (!drawSprite(ctx, 'minion_totem_' + z.kind, z.x, z.y - 8, 48)) { ctx.fillStyle = '#7a4b26'; ctx.fillRect(z.x - 5, z.y - 22, 10, 34); }
    ctx.globalAlpha = 1;
  },
  /* Fissure (Earthcaller): a jagged crack along the path (z.pts, from the engine), closing as it fades. */
  fissure(ctx, z) {
    const k = z.t / z.life, pts = z.pts || [];
    if (pts.length < 2) return;
    ctx.globalAlpha = Math.min(1, k * 2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[7 * k + 2, 'rgba(110,75,40,.9)'], [3 * k + 1, '#1a120a']]) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  /* Soul drain: drawn as beams by the engine's fx; nothing on the ground. */
  drain() {},
  /* Judgement: a giant blade drops from above and flashes where it lands. */
  judgement(ctx, z) {
    const k = 1 - z.t / z.life, drop = Math.min(1, k * 3), y = z.y - 70 * (1 - drop);
    if (!drawSprite(ctx, 'fx_judgement', z.x, y - 18, 56)) {
      ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(z.x, y - 46); ctx.lineTo(z.x, y + 4); ctx.stroke();
      ctx.strokeStyle = '#d9b25a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(z.x - 10, y - 34); ctx.lineTo(z.x + 10, y - 34); ctx.stroke();
    }
    if (drop >= 1) {
      ctx.globalAlpha = Math.max(0, 1 - (k - 0.33) * 1.5);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1 + k), 0, 7); ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
};

/* Timed buff rings around heroes, by buff id (render.js draws the ring; others are soft blue). */
export const BUFF_COLOR = { blessing: 'rgba(255,233,160,.85)', hymn: 'rgba(255,215,106,.55)', heresy: 'rgba(255,106,58,.8)', ancestral: 'rgba(122,208,224,.8)' };
const TOTEM_GLOW = { flame: 'rgba(255,138,61,.3)', frost: 'rgba(143,211,255,.3)', storm: 'rgba(255,228,92,.3)' };
/* Effect icons over enemies for the newer heroes' ailment and curses (render.js merges them into its list). */
export const KIT_AIL_ICON = { corruption: 'ail_corruption', hex: 'ail_hex', doom: 'ail_doom', verdict: 'ail_verdict', purge: 'ail_purge', link: 'ail_link', stun: 'ail_stun' };
export { T };
