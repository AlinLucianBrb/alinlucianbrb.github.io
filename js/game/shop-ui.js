/* The match shop's window: ground effects (buy one, then click its tile on the map; upgrade the ones you have), the gamble and
   the boss to summon. Drawn again only when something it shows has changed. The rules are js/content/shop.js. */
import { RARITIES } from '../content/data.js';
import { TILE_EFFECTS, TILES, GAMBLE, OUTCOMES, SUMMON_BOSS } from '../content/shop.js';
import { tilesOf, tileCost, upgradeCost, gambleCost, gamblesLeft, bossWait, bossPay } from '../engine/shop.js';
import { tileValue } from '../engine/tiles.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let cb = {}, key = '';

export function initShop(callbacks) { cb = callbacks; $('shopClose').onclick = () => cb.onClose(); }
export function showShop(w) { key = ''; $('shopBox').hidden = false; updateShop(w); }
export const hideShop = () => { $('shopBox').hidden = true; };

/* What the last gamble did, in words. */
export function gambleText(g) {
  if (!g) return '';
  const names = g.got.map(r => RARITIES[r.r].name + ' ' + r.name).join(' and ');
  return { relic: names ? 'You won ' + names + '.' : 'Nothing: there are no relics left for your heroes.', two: names ? 'Two relics! ' + names + '.' : 'Nothing: there are no relics left for your heroes.', raise: 'Raised to ' + names + '.', lose: 'You lost ' + names + '.', nothing: 'Nothing this time.',
    jackpot: 'Jackpot! ' + g.paid * 4 + ' gold.', curse: 'Cursed! The next wave is tougher, and pays double.' }[g.id];
}

function buy(text, cost, gold, run, why) {
  const b = el('button', 'shopbuy', text + (cost ? ' · ' + cost : ''));
  b.disabled = !!why || gold < cost; b.title = why || (gold < cost ? 'You have ' + gold + ' gold' : '');
  b.onclick = run;
  return b;
}

/* w: the local player's view of the world (w.me is the player). */
export function updateShop(w) {
  const p = w.me, mine = tilesOf(w, p), wait = bossWait(w), left = gamblesLeft(w, p);
  const now = [p.gold, w.wave, w.phase, w.bossNext, w.bossKind, w.bossesSummoned, p.gambles, left, mine.map(t => t.effect + t.level + t.cx + ',' + t.cy).join()].join('|');
  if (now === key) return;
  key = now;
  $('shopGold').textContent = 'Gold ' + p.gold;
  const box = $('shopCols'); box.textContent = '';

  const tiles = el('div', 'shopcol'); tiles.append(el('h3', '', 'Ground effects'), el('p', 'muted', 'For one tile, until the match ends. ' + mine.length + ' / ' + TILES.max + ' tiles.'));
  for (const [id, e] of Object.entries(TILE_EFFECTS)) {
    const row = el('div', 'shoprow'), name = el('b', '', e.name); row.style.setProperty?.('--ec', e.color); name.style.color = e.color;
    row.append(name, el('small', '', e.text(e.values[0])), el('small', 'muted', 'Levels: ' + e.values.map(v => (v < 1 ? Math.round(v * 100) + '%' : '×' + v)).join(' / ')),
      buy('Buy', tileCost(w, p), p.gold, () => cb.onTile(id), mine.length >= TILES.max ? 'You have ' + TILES.max + ' tiles' : ''));
    tiles.append(row);
  }
  for (const t of mine) {
    const e = TILE_EFFECTS[t.effect], row = el('div', 'shoprow own'), name = el('b', '', e.name + ' ' + '●'.repeat(t.level) + '○'.repeat(TILES.levels - t.level)), v = tileValue(t);
    row.style.setProperty?.('--ec', e.color); name.style.color = e.color;
    const on = w.heroes.find(h => h.cx === t.cx && h.cy === t.cy);
    row.append(name, el('small', 'muted', (v < 1 ? Math.round(v * 100) + '%' : '×' + v) + ' · ' + (on ? on.def.name : 'no hero on it')));
    if (t.level < TILES.levels) row.append(buy('Upgrade', upgradeCost(t), p.gold, () => cb.onAct({ type: 'upgradeTile', cx: t.cx, cy: t.cy })));
    else row.append(el('small', 'muted', 'Highest level'));
    tiles.append(row);
  }

  const g = el('div', 'shopcol'); g.append(el('h3', '', 'Gamble'));
  for (const o of OUTCOMES) { const r = el('div', 'odds'); r.append(el('span', '', o.text), el('b', '', o.chance + '%')); g.append(r); }
  g.append(buy('Gamble', gambleCost(p), p.gold, () => cb.onAct({ type: 'gamble' }), left <= 0 ? 'At most ' + GAMBLE.perWave + ' times a wave' : ''), el('small', 'muted', left + ' of ' + GAMBLE.perWave + ' left this wave'));
  if (p.lastGamble) g.append(el('p', 'result ' + p.lastGamble.id, gambleText(p.lastGamble)));

  const b = el('div', 'shopcol'), k = SUMMON_BOSS.kinds[w.bossKind];
  b.append(el('h3', '', 'Summon a boss'), el('b', 'bossname', k.name), el('small', '', k.text), el('p', '', 'Pays ' + bossPay(w) + ' gold. Costs 5 lives if it gets through.'));
  const why = w.phase !== 'wave' ? 'Only while a wave is coming' : wait > 0 ? 'Ready in ' + wait + (wait > 1 ? ' waves' : ' wave') : '';
  b.append(buy('Summon', 0, p.gold, () => cb.onAct({ type: 'summonBoss' }), why), el('small', 'muted', why || 'Then ' + SUMMON_BOSS.cooldown + ' waves until the next'));
  box.append(tiles, g, b);
}
