/* The browser shell around the engine: it turns input into commands, runs the loop, moves the camera, draws and updates the HUD.
   All game rules live in js/engine; nothing in here decides what happens in a game. */
import { HEROES, COLS, ROWS, T, STAGES, heroIndex } from '../content/data.js';
import { createWorld, step, STEP } from '../engine/world.js';
import { apply } from '../engine/commands.js';
import { exportLog } from '../engine/replay.js';
import { heroStats } from '../engine/stats.js';
import { draw, addBeam, tickBeams, addSlash, tickSlashes, addAnim, tickAnims } from './render.js';
import { preload as preloadArt, get as sprite } from './sprites.js';
import { createCamera, fitCamera, clampCamera, zoomAt, panBy, toWorld } from './camera.js';
import * as ui from './ui.js';

const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const MAP_W = COLS * T, MAP_H = ROWS * T;
const MAX_CATCHUP = 1800;       /* never simulate more than 30 minutes of missed time */
const HOLD_MS = 280;            /* click and hold a hero this long to pick it up and move it */

let w;                          /* the current world */
let last = -1, acc = 0, active = false, raf = 0, hooks = {}, uiT = 0, stageN = 1, bgWorker = null, bgTimer = 0, drawErr = false;
/* Screen-only state: chosen hero button, hover, selection, speed, pause, camera, canvas size and visual effects. */
const v = { sel: 0, hover: null, selected: null, moving: null, speed: 1, paused: false, needFit: true,
  cam: createCamera(), dpr: 1, cw: MAP_W, ch: MAP_H, vfx: { beams: [], slashes: [], anims: [] }, fx: null };
v.fx = { beam: (...a) => addBeam(v.vfx, ...a), slash: (...a) => addSlash(v.vfx, ...a),
  /* The Lightning Mage's storm: a bolt from the sky onto the enemy (a plain beam while the art is not loaded). */
  strike: (x, y) => { if (sprite('fx_strike')) addAnim(v.vfx, 'fx_strike', x, y - 34, 72, 0.28, 3); else addBeam(v.vfx, x + 6, y - 70, x, y, 0.12, '#ffe45c', 3); } };

/* Player setting: keep the game running while the relic choice is open (off by default, remembered on this browser). */
const PLAY_ON_PICK = 'tbd.playOnPick';
const playOnPickSaved = () => { try { return localStorage.getItem(PLAY_ON_PICK) === '1'; } catch (e) { return false; } };
function setPlayOnPick(on) {
  try { localStorage.setItem(PLAY_ON_PICK, on ? '1' : '0'); } catch (e) { /* private mode: it just is not remembered */ }
  act({ type: 'playOnPick', on: !!on });
}

const newSeed = () => (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);

/* Every run starts fresh: Auto-start off, not paused, camera fitted to the free part of the screen. */
function newRun() {
  const seed = newSeed();
  w = createWorld({ seed, stage: stageN, talents: hooks.talents || [], lineup: hooks.lineup, items: hooks.items || {} });
  const world = w;
  w.ev.on('end', ({ won }) => finish(world, won));
  w.ev.on('crit', ({ enemy }) => { if (w.fx) { addSlash(v.vfx, enemy.x, enemy.y, 0, Math.PI, enemy.def.radius + 7, 0.16, '#ffd84a'); addAnim(v.vfx, 'fx_hit', enemy.x, enemy.y - 4, 30, 0.2, 4); } });   /* a gold flash on critical hits */
  w.ev.on('kill', ({ enemy }) => { if (w.fx && !enemy.escaped) addAnim(v.vfx, 'fx_hit', enemy.x, enemy.y - 6, 26 + enemy.def.radius, 0.24, 4); });
  w.ev.on('explode', ({ zone }) => { if (w.fx) addAnim(v.vfx, 'fx_explosion', zone.x, zone.y, 96, 0.45, 5); });
  w.ev.on('moonfall', ({ zone }) => { if (w.fx) addAnim(v.vfx, 'fx_moonburst', zone.x, zone.y, zone.r * 2.3, 0.45, 5); });
  v.selected = v.moving = v.evo = null; ui.hideEvoPick(); if (v.speed > 2) v.speed = 1; v.vfx.beams.length = 0; v.vfx.slashes.length = 0; v.vfx.anims.length = 0; v.needFit = true;
  if (playOnPickSaved()) apply(w, { type: 'playOnPick', on: true });   /* logged, so the replay plays the same way */
  v.sel = heroIndex(w.lineup[0]);
  ui.setLineup(w);
  setPaused(false);
  ui.hidePick(); ui.hideOver(); ui.renderMeter(w); ui.renderInspector(w, v);
  if (hooks.onRunStart) hooks.onRunStart({ seed, stage: stageN });
}

async function finish(world, won) {
  v.moving = null; setPaused(false);
  ui.showOver(won ? 'Level cleared!' : 'The gate has fallen',
    won ? 'You beat all ' + world.maxWave + ' waves.' : world.lives > 0 && world.wave >= world.maxWave ? 'The final boss got through.' : 'You reached wave ' + world.wave + ' of ' + world.maxWave + '.', 'Saving your run…', won && stageN < STAGES.length);
  let msg = '';
  try { msg = await hooks.onRunEnd({ waves: world.wave, kills: world.kills, bosses: world.bossKills, stage: stageN, won, log: exportLog(world) }); } catch (e) { msg = 'Could not save your run.'; }
  if (world === w) ui.setOverMsg(msg || '');
}

/* Sends a command to the world and refreshes whatever it could have changed. */
function act(cmd) {
  const r = apply(w, cmd);
  if (!r.ok) return r;
  if (w.picking) ui.showPick(w); else ui.hidePick();
  ui.renderInspector(w, v);
  return r;
}

/* ---- Pause: the Menu button pauses and asks before quitting; P pauses, Esc resumes ---- */
function setPaused(on) {
  v.paused = on;
  $('pauseBanner').hidden = !on; $('menuConfirm').hidden = !on; $('menuBtn').hidden = on;
}
function onMenu() {
  if (!w || w.phase === 'over') return hooks.onExit();
  setPaused(true);
}

/* ---- Loop: fixed steps, driven by requestAnimationFrame while visible and by a timer while the tab is hidden ---- */
function frame(now) {
  if (!active) return;
  if (last < 0) last = now;
  const real = Math.min(MAX_CATCHUP, Math.max(0, (now - last) / 1000)); last = now;
  const hidden = !!document.hidden, running = !v.paused && !v.evo && w.phase !== 'over' && (!w.picking || w.playOnPick);   /* the evolve picker pauses too */
  w.fx = hidden ? null : v.fx;
  acc = running ? acc + real * v.speed : 0;
  const deadline = performance.now() + (hidden ? 150 : 8);
  while (acc >= STEP) {
    if (!step(w)) { acc = 0; break; }
    acc -= STEP;
    if (performance.now() > deadline) break;
  }
  if (hidden) return;
  try { render(running ? real * v.speed : 0); } catch (err) { if (!drawErr) { drawErr = true; console.error('Drawing failed (the game keeps running):', err); } }
}
function render(dt) {
  if (v.selected && !w.heroes.includes(v.selected)) { v.selected = v.moving = null; ui.renderInspector(w, v); }
  v.placing = canPlace(v.sel);
  tickBeams(v.vfx, dt); tickSlashes(v.vfx, dt); tickAnims(v.vfx, dt);
  draw(ctx, w, v);
  ui.renderHUD(w, v);
  if (v.needFit) { v.needFit = false; fitToScreen(); }
  if (w.picking) ui.updatePick(w);
  if ((uiT += 1 / 60) >= 0.25) { uiT = 0; ui.renderMeter(w); if (v.selected) ui.renderInspector(w, v); }
}
function loopRaf(t) { raf = requestAnimationFrame(loopRaf); frame(t); }   /* the next frame is booked first, so an error can never stop the loop */
function startBg() {
  if (bgWorker || bgTimer) return;
  try {
    bgWorker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},200)'], { type: 'text/javascript' })));
    bgWorker.onmessage = () => frame(performance.now());
  } catch (e) { bgTimer = setInterval(() => frame(performance.now()), 500); }
}
function stopBg() {
  if (bgWorker) { bgWorker.terminate(); bgWorker = null; }
  if (bgTimer) { clearInterval(bgTimer); bgTimer = 0; }
}
function onVisibility() {
  if (!active) return;
  cancelAnimationFrame(raf);
  if (document.hidden) startBg(); else { stopBg(); raf = requestAnimationFrame(loopRaf); }
}
if (document.addEventListener) document.addEventListener('visibilitychange', onVisibility);

/* ---- Canvas size and camera ---- */
/* The part of the screen not covered by the HUD, so the fitted map does not sit under buttons or panels. */
function freeRect() {
  const c = cv.getBoundingClientRect(), W = c.width, H = c.height, pad = 10;
  const box = id => {
    const e = $(id); if (!e || e.hidden) return null;
    const b = e.getBoundingClientRect(); return b.width ? { l: b.left - c.left, t: b.top - c.top, r: b.right - c.left, b: b.bottom - c.top } : null;
  };
  let top = pad, bottom = H - pad, left = pad, right = W - pad;
  for (const id of ['hud', 'hudTopRight']) { const b = box(id); if (b && b.b < H / 3) top = Math.max(top, b.b + pad); }
  const bar = box('hudBottom'); if (bar && bar.t > H / 2) bottom = Math.min(bottom, bar.t - pad);
  const meter = box('meterPanel'); if (meter && meter.l > W * 0.55) right = Math.min(right, meter.l - pad);
  const relics = box('relics'); if (relics && relics.r < W * 0.3) left = Math.max(left, relics.r + pad);
  const cam = box('hudCam'); if (cam && cam.r < W * 0.2 && cam.t < bottom) left = Math.max(left, cam.r + pad);
  if (right - left < W * 0.4) { left = pad; right = W - pad; }
  if (bottom - top < H * 0.35) { top = pad; bottom = H - pad; }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
/* Centres the map on the screen, as large as it can be while staying clear of the HUD on every side
   (the margins are mirrored, so the centre stays in the middle). On screens too small for that, it uses the free space as it is. */
function fitToScreen() {
  const r = freeRect(), W = v.cw, H = v.ch;
  const mx = Math.max(r.x, W - (r.x + r.w)), my = Math.max(r.y, H - (r.y + r.h));
  const centred = { x: mx, y: my, w: W - 2 * mx, h: H - 2 * my };
  const ok = centred.w >= W * 0.4 && centred.h >= H * 0.35;
  fitCamera(v.cam, ok ? centred : r, MAP_W, MAP_H);
}
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1), pw = Math.round(r.width * dpr), ph = Math.round(r.height * dpr);
  v.cw = r.width; v.ch = r.height; v.dpr = dpr;
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  if (!v.cam.touched) fitToScreen(); else clampCamera(v.cam, v.cw, v.ch, MAP_W, MAP_H);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(cv);
const zoomBy = f => { zoomAt(v.cam, v.cw / 2, v.ch / 2, f); clampCamera(v.cam, v.cw, v.ch, MAP_W, MAP_H); };
const pan = (dx, dy) => { panBy(v.cam, dx, dy); clampCamera(v.cam, v.cw, v.ch, MAP_W, MAP_H); };

/* ---- Map input: click to place or select; drag to move the map; wheel or pinch to zoom ---- */
const pointers = new Map();
let dragged = false, pinch = null;
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const cellAt = (px, py) => { const [x, y] = toWorld(v.cam, px, py); return [Math.floor(x / T), Math.floor(y / T)]; };

cv.addEventListener('pointerdown', e => {
  const [x, y] = local(e), id = e.pointerId ?? 1;
  pointers.set(id, { x, y, sx: x, sy: y, button: e.button ?? 0 });
  try { cv.setPointerCapture(id); } catch (err) { /* not supported: fine */ }
  if (pointers.size === 1) dragged = (e.button === 1 || e.button === 2);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; dragged = true; cancelHold(); }
  /* Click and hold a hero to pick it up; it follows the pointer and is moved where it is released. */
  if (pointers.size === 1 && (e.button ?? 0) === 0 && w.phase !== 'over' && !w.picking) {
    const [cx, cy] = cellAt(x, y), h = w.heroes.find(t => t.cx === cx && t.cy === cy);
    if (h) holdT = setTimeout(() => {
      holdT = 0;
      const p = pointers.get(id);
      if (!p || dragged) return;
      p.holding = true; v.moving = v.selected = h; v.hover = [cx, cy]; cv.classList.add('holding'); ui.renderInspector(w, v);
    }, HOLD_MS);
  }
});
let holdT = 0;
const cancelHold = () => { if (holdT) { clearTimeout(holdT); holdT = 0; } };
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e), p = pointers.get(e.pointerId ?? 1);
  if (!p) { if (e.pointerType !== 'touch') setHover(cellAt(x, y)); return; }
  if (p.holding) { p.x = x; p.y = y; setHover(cellAt(x, y)); return; }   /* carrying a hero: no panning */
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    p.x = x; p.y = y;
    const [a2, b2] = [...pointers.values()], d = Math.hypot(a2.x - b2.x, a2.y - b2.y) || 1, mx2 = (a2.x + b2.x) / 2, my2 = (a2.y + b2.y) / 2;
    zoomAt(v.cam, mx2, my2, d / pinch.d); pinch.d = d; pan(mx2 - mx, my2 - my);
    return;
  }
  if (!dragged && Math.hypot(x - p.sx, y - p.sy) > 6) { dragged = true; cancelHold(); }
  if (dragged) { pan(x - p.x, y - p.y); cv.classList.add('dragging'); }
  p.x = x; p.y = y;
  if (e.pointerType !== 'touch') setHover(cellAt(x, y));
});
/* Hovering the land outside the map shows a "not allowed" cursor. */
function setHover(c) {
  v.hover = c;
  const outside = !!c && !(c[0] >= 0 && c[1] >= 0 && c[0] < COLS && c[1] < ROWS);
  cv.classList.toggle('blocked', outside);
}
function endPointer(e, cancelled) {
  const id = e.pointerId ?? 1, p = pointers.get(id);
  if (!p) return;
  pointers.delete(id); cancelHold();
  if (pointers.size < 2) pinch = null;
  if (p.holding) {                       /* drop the carried hero */
    cv.classList.remove('holding');
    const h = v.moving, [x, y] = local(e), [cx, cy] = cellAt(x, y);
    v.moving = null;
    if (!cancelled && h && w.heroes.includes(h) && (cx !== h.cx || cy !== h.cy)) act({ type: 'move', id: h.id, cx, cy });
    ui.renderInspector(w, v); dragged = false; return;
  }
  if (pointers.size === 0) {
    cv.classList.remove('dragging');
    if (!cancelled && !dragged && p.button === 0) { const [x, y] = local(e); v.hover = cellAt(x, y); clickCell(...v.hover); }
    dragged = false;
  }
}
cv.addEventListener('pointerup', e => endPointer(e, false));
cv.addEventListener('pointercancel', e => endPointer(e, true));
cv.addEventListener('pointerleave', e => { if (!pointers.size) v.hover = null; });
cv.addEventListener('contextmenu', e => e.preventDefault && e.preventDefault());
cv.addEventListener('wheel', e => {
  if (e.preventDefault) e.preventDefault();
  const [x, y] = local(e);
  zoomAt(v.cam, x, y, Math.exp(-(e.deltaY || 0) * 0.0015)); clampCamera(v.cam, v.cw, v.ch, MAP_W, MAP_H);
}, { passive: false });

function clickCell(cx, cy) {
  if (w.phase === 'over' || w.picking) return;
  const inside = cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
  const existing = inside && w.heroes.find(t => t.cx === cx && t.cy === cy);
  if (v.moving) {
    if (existing === v.moving || !inside) { v.moving = null; ui.renderInspector(w, v); return; }
    if (act({ type: 'move', id: v.moving.id, cx, cy }).ok) v.moving = null;
    ui.renderInspector(w, v); return;
  }
  if (existing) { v.selected = existing; ui.renderInspector(w, v); return; }
  if (!inside || !canPlace(v.sel)) { closeInspector(); return; }
  if (act({ type: 'place', hero: HEROES[v.sel].id, cx, cy }).ok) {
    v.selected = null;
    const next = w.lineup.map(heroIndex).find(canPlace);   /* move on to the next hero still waiting to be placed */
    if (next !== undefined) v.sel = next;
    ui.renderInspector(w, v);
  }
}
/* A hero can be placed if it is in the lineup and not on the map yet (one of each, free). */
const unitOf = i => w.heroes.find(h => h.type === i);
const canPlace = i => i >= 0 && w.lineup.includes(HEROES[i].id) && !unitOf(i);

/* Clicking a hero card: choose it for placing, or, once it is on the map, select it there. */
const selectType = i => {
  if (i < 0 || !w.lineup.includes(HEROES[i].id)) return;
  v.moving = null;
  const unit = unitOf(i);
  if (unit) { v.selected = unit; v.sel = i; } else { v.sel = i; v.selected = null; }
  ui.renderInspector(w, v);
};
/* Selecting a hero on the map (also what the Evolve button above its card does: the hero panel then shows the choices). */
const selectHero = h => { v.moving = null; v.selected = h; v.sel = h.type; ui.renderInspector(w, v); };
const closeInspector = () => { v.selected = v.moving = null; ui.renderInspector(w, v); };
/* Evolving: the Evolve button above a hero's card (or key E on the selected hero) opens the evolution picker, which pauses
   the game like the relic picker. Choosing a form spends the gold and evolves the hero; Cancel or Esc closes it. */
function openEvolve(h) {
  const step = h && h.base.evolutions[h.tier];
  if (!step || h.level < w.evolveLevel(h) || w.phase === 'over' || w.picking) return;
  v.evo = h; v.selected = h; v.sel = h.type; ui.renderInspector(w, v); ui.showEvoPick(w, h);
}
const closeEvolve = () => { v.evo = null; ui.hideEvoPick(); };
const evolveSelected = () => openEvolve(v.selected);
const chooseEvolution = i => { const h = v.evo; if (h && act({ type: 'evolve', id: h.id, choice: i }).ok) { closeEvolve(); ui.renderInspector(w, v); } };
const toggleMove = () => { if (v.selected && w.phase !== 'over') { v.moving = v.moving === v.selected ? null : v.selected; ui.renderInspector(w, v); } };
ui.initUI({
  onSelectType: selectType, onEvolveHero: i => openEvolve(unitOf(i)), onCloseInspector: closeInspector, onEvolveChoice: chooseEvolution, speed3x: () => !!(w && w.gs.speed3x),
  onChoose: i => act({ type: 'choose', index: i }), onPlayOnPick: setPlayOnPick, onReroll: () => act({ type: 'reroll' }), onBanish: i => act({ type: 'banish', index: i }),
  heroInfo: i => {
    const def = HEROES[i], unit = w && unitOf(i), tier = unit ? unit.tier : 0, evo = def.evolutions[tier];   /* a step: { level, cost, choices } */
    const evoCost = evo && w ? Math.round(evo.cost * w.gs.evolveCost) : evo ? evo.cost : null;
    const evoLevel = evo && w ? Math.max(1, evo.level + w.gs.evolveLevel) : evo ? evo.level : null;
    return { stats: unit ? unit.s : heroStats(def, w ? w.mods : []), unit, evo, evoCost, evoLevel, gold: w ? w.gold : 0 };
  },
  onLayoutChange: () => { if (!v.cam.touched) v.needFit = true; },
  luck: () => (w ? w.gs.relicLuck : 0)
});
$('go').onclick = () => act({ type: 'wave' });
$('relic').onclick = () => act({ type: 'buyRelic' });
$('auto').onclick = () => act({ type: 'auto', on: !w.auto });
/* 1x, 2x, and 3x once the Overdrive talent unlocks it. */
$('spd').onclick = () => { v.speed = v.speed === 1 ? 2 : v.speed === 2 && w.gs.speed3x ? 3 : 1; };
$('menuBtn').onclick = onMenu;
$('evoCancel').onclick = closeEvolve;
$('quitYes').onclick = () => hooks.onExit();
$('resumeBtn').onclick = () => setPaused(false);
$('camIn').onclick = () => zoomBy(1.25);
$('camOut').onclick = () => zoomBy(0.8);
$('camFit').onclick = fitToScreen;
$('newRun').onclick = () => { newRun(); acc = 0; };
$('overNext').onclick = () => hooks.onNext && hooks.onNext();
$('overMenu').onclick = () => hooks.onExit();
const PAN_KEYS = { arrowleft: [1, 0], a: [1, 0], arrowright: [-1, 0], d: [-1, 0], arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1] };
addEventListener('keydown', e => {
  if (!active || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  /* While choosing a relic, 1, 2 and 3 pick one; otherwise the number keys choose heroes. */
  if (w.picking && w.pick && +e.key >= 1 && +e.key <= w.pick.offers.length) act({ type: 'choose', index: +e.key - 1 });
  else if (+e.key >= 1 && +e.key <= w.lineup.length) selectType(heroIndex(w.lineup[+e.key - 1]));
  else if (k === ' ' || k === 'r') { e.preventDefault && e.preventDefault(); if (!w.picking && !v.evo) act({ type: 'buyRelic' }); }   /* Space (or R): buy a relic */
  else if (k === 'm') toggleMove();
  else if (k === 'e') evolveSelected();
  else if (k === 'p') { if (w.phase !== 'over') setPaused(!v.paused); }
  else if (k === 'escape') { if (v.evo) closeEvolve(); else if (v.paused) setPaused(false); else closeInspector(); }
  else if (k === 'f') fitToScreen();
  else if (k === '+' || k === '=') zoomBy(1.25);
  else if (k === '-') zoomBy(0.8);
  else if (PAN_KEYS[k]) { e.preventDefault && e.preventDefault(); pan(PAN_KEYS[k][0] * 60, PAN_KEYS[k][1] * 60); }
  else if (k === 'enter' && w.phase === 'build' && !w.picking && !v.evo) { e.preventDefault && e.preventDefault(); act({ type: 'wave' }); }   /* Enter: start the wave */
});

/* ---- Public API used by the Play screen ---- */
export function startGame(h) {
  hooks = h; stageN = h.stage || 1; active = true; acc = 0; last = -1;
  preloadArt();
  newRun(); resize();
  cancelAnimationFrame(raf); stopBg();
  if (document.hidden) startBg(); else raf = requestAnimationFrame(loopRaf);
}
export function stopGame() { active = false; setPaused(false); cancelAnimationFrame(raf); stopBg(); }
/* For tests and debugging in the browser console: the live world and screen state. */
export const _debug = () => ({ world: w, view: v });
