/* The match shop, for a player who has it. Ground effects (click one, then its tile on the map), an upgrade for each tile you
   own and the gamble are icons in the hover card at the left edge of the screen (with the relics); the boss to summon is a
   button in the bottom bar. Prices are under the icons; everything else is in the tooltips. The last gamble's result shows
   for a few seconds under the top bar. Drawn again only when something it shows has changed. Rules: js/content/shop.js. */
import { RARITIES } from '../content/data.js';
import { TILE_EFFECTS, TILES, GAMBLE, OUTCOMES, SUMMON_BOSS } from '../content/shop.js';
import { tilesOf, tileCost, upgradeCost, gambleCost, gamblesLeft, bossWait, bossPay } from '../engine/shop.js';
import { tileValue } from '../engine/tiles.js';
import { bindTip } from '../core/tooltip.js';
import { spriteImg } from './sprites.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const RESULT_SECONDS = 5;   /* how long the last gamble's result stays */
export const SHOP_ICON = { greed: 'icon_shop_greed', conduit: 'icon_shop_conduit', gamble: 'icon_shop_gamble', boss: 'icon_shop_boss', up: 'icon_shop_up' };
let cb = {}, key = '', bossKey = '', shown = null, resultT = 0;

export function initShop(callbacks) { cb = callbacks; $('bossBtn').onclick = () => cb.onAct({ type: 'summonBoss' }); }
export function resetShop() { key = bossKey = ''; shown = null; resultT = 0; $('shopPanel').hidden = true; $('bossBtn').hidden = true; $('gambleToast').hidden = true; }

/* What the last gamble did, in words. */
export function gambleText(g) {
  if (!g) return '';
  const names = g.got.map(r => RARITIES[r.r].name + ' ' + r.name).join(' and ');
  return { relic: names ? 'You won ' + names + '.' : 'Nothing: there are no relics left for your heroes.', two: names ? 'Two relics! ' + names + '.' : 'Nothing: there are no relics left for your heroes.', raise: 'Raised to ' + names + '.', lose: 'You lost ' + names + '.', nothing: 'Nothing this time.',
    jackpot: 'Jackpot! ' + g.paid * 4 + ' gold.', curse: 'Cursed! The next wave is tougher, and pays double.' }[g.id];
}
const fmt = v => (v < 1 ? Math.round(v * 100) + '%' : '×' + v);

/* An icon button with a small line under it (a price), its name for screen readers, and why it cannot be used (in the tooltip). */
function iconButton(icon, under, name, why, tip, run) {
  const b = el('button', 'shopico');
  b.append(spriteImg(icon, 'pix'), el('small', '', under));
  b.setAttribute('aria-label', name); b.disabled = !!why; b.onclick = run;
  bindTip(b, () => { const t = tip(); if (why) t.lines.push({ text: why, color: '#e5645a' }); return t; });
  return b;
}

/* Called every frame. w: the local player's view of the world (w.me is the player); dt: seconds of real time. */
export function updateShop(w, dt = 0) {
  const p = w.me, panel = $('shopPanel');
  if (!p || !p.shop) { if (!panel.hidden) { panel.hidden = true; $('bossBtn').hidden = true; } return; }
  const busy = w.phase === 'over' || p.picking || (w.vote && !w.coop), poor = cost => (p.gold < cost ? 'You have ' + p.gold + ' gold' : '');
  updateToast(p, dt);
  updateBoss(w, p, busy);
  const mine = tilesOf(w, p), left = gamblesLeft(w, p);
  const now = [p.gold, w.wave, busy, p.gambles, left, mine.map(t => t.effect + t.level + t.cx + ',' + t.cy).join()].join('|');
  if (now === key) return;
  key = now; panel.hidden = false; panel.textContent = '';

  const row = el('div', 'shopicons'), full = mine.length >= TILES.max;
  for (const [id, e] of Object.entries(TILE_EFFECTS)) {
    const cost = tileCost(w, p), b = iconButton(SHOP_ICON[id] || SHOP_ICON.greed, String(cost), e.name + ', ' + cost + ' gold', busy ? 'Not now' : full ? 'You have ' + TILES.max + ' tiles' : poor(cost),
      () => ({ title: e.name + ' · ' + cost + ' gold', color: e.color, lines: [e.text(e.values[0]), { text: 'Levels: ' + e.values.map(fmt).join(' / '), color: '#ab9f8a' }, { text: 'Then click a tile next to the path (' + mine.length + ' / ' + TILES.max + ')', color: '#f2b84b' }] }),
      () => cb.onTile(id));
    b.style.setProperty?.('--ec', e.color); row.append(b);
  }
  const gc = gambleCost(p);
  row.append(iconButton(SHOP_ICON.gamble, String(gc), 'Gamble, ' + gc + ' gold', busy ? 'Not now' : left <= 0 ? 'At most ' + GAMBLE.perWave + ' times a wave' : poor(gc),
    () => ({ title: 'Gamble · ' + gc + ' gold', color: '#dcc6ff', lines: [...OUTCOMES.map(o => o.chance + '%  ' + o.text), { text: left + ' / ' + GAMBLE.perWave + ' this wave · key G', color: '#ab9f8a' }] }),
    () => cb.onAct({ type: 'gamble' })));
  panel.append(row);
  /* the tiles you own: each one's upgrade */
  if (mine.length) {
    const own = el('div', 'shopicons owned');
    for (const t of mine) {
      const e = TILE_EFFECTS[t.effect], max = t.level >= TILES.levels, cost = max ? 0 : upgradeCost(t), on = w.heroes.find(h => h.cx === t.cx && h.cy === t.cy);
      const b = iconButton(SHOP_ICON[t.effect] || SHOP_ICON.greed, '●'.repeat(t.level) + '○'.repeat(TILES.levels - t.level), e.name + ' level ' + t.level + (max ? '' : ', upgrade for ' + cost + ' gold'), max ? 'Highest level' : busy ? 'Not now' : poor(cost),
        () => ({ title: e.name + ' · level ' + t.level, color: e.color, lines: [fmt(tileValue(t)) + ' · ' + (on ? on.def.name + ' on it' : 'no hero on it'), ...(max ? [] : [{ text: 'Click to upgrade: ' + cost + ' gold', color: '#f2b84b' }])] }),
        () => cb.onAct({ type: 'upgradeTile', cx: t.cx, cy: t.cy }));
      if (!max) b.append(spriteImg(SHOP_ICON.up, 'pix upmark'));
      b.style.setProperty?.('--ec', e.color); own.append(b);
    }
    panel.append(own);
  }
}

/* The boss button in the bottom bar: its icon, then what it pays or how many waves until it can come. */
function updateBoss(w, p, busy) {
  const b = $('bossBtn'), wait = bossWait(w), k = SUMMON_BOSS.kinds[w.bossKind];
  const why = busy ? 'Not now' : w.phase !== 'wave' ? 'Only while a wave is coming' : wait > 0 ? 'Ready in ' + wait + (wait > 1 ? ' waves' : ' wave') : '';
  const now = [w.bossKind, wait, why, bossPay(w)].join('|');
  if (now === bossKey) return;
  bossKey = now; b.hidden = false; b.textContent = ''; b.disabled = !!why;
  b.append(spriteImg(SHOP_ICON.boss, 'pix'), el('small', '', wait > 0 ? wait + 'w' : '+' + bossPay(w)));
  b.setAttribute('aria-label', 'Summon a boss: ' + k.name);
  if (!b._tip) { b._tip = true; bindTip(b, () => b._content()); }
  b._content = () => ({ title: 'Summon a boss: ' + k.name, color: '#ff9d8a', lines: [k.text, 'Pays ' + bossPay(w) + ' gold. Costs 5 lives if it gets through.', { text: 'Then ' + SUMMON_BOSS.cooldown + ' waves until the next', color: '#ab9f8a' }, ...(why ? [{ text: why, color: '#e5645a' }] : [])] });
}
/* The last gamble's result, under the top bar for RESULT_SECONDS. */
function updateToast(p, dt) {
  const t = $('gambleToast');
  if (p.lastGamble !== shown) { shown = p.lastGamble; resultT = shown ? RESULT_SECONDS : 0; t.textContent = gambleText(shown); t.className = 'glass result ' + (shown ? shown.id : ''); }
  if (resultT > 0) resultT = Math.max(0, resultT - dt);
  const show = resultT > 0;
  if (t.hidden === show) t.hidden = !show;
}
