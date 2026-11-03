/* The browser shell around the engine: it turns clicks and keys into commands, runs the loop, draws the world and updates the page.
   All game rules live in js/engine; nothing in here decides what happens in a game. */
import { HEROES, COLS, ROWS, T, STAGES } from '../content/data.js';
import { createWorld, step, STEP } from '../engine/world.js';
import { apply } from '../engine/commands.js';
import { exportLog } from '../engine/replay.js';
import { buildBackground, draw, addBeam, tickBeams, addSlash, tickSlashes } from './render.js';
import * as ui from './ui.js';

const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const MAX_CATCHUP = 1800;       /* never simulate more than 30 minutes of missed time */

let w;                          /* the current world */
let last = -1, acc = 0, active = false, raf = 0, hooks = {}, uiT = 0, stageN = 1, bgWorker = null, bgTimer = 0;
/* Screen-only state: which hero button is chosen, hover, the selected hero, speed, canvas scale and visual effects. */
const v = { sel: 0, autoPref: false, hover: null, selected: null, moving: null, speed: 1, scale: 1, vfx: { beams: [], slashes: [] }, fx: null };
v.fx = { beam: (...a) => addBeam(v.vfx, ...a), slash: (...a) => addSlash(v.vfx, ...a) };

const newSeed = () => (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);

function newRun() {
  const seed = newSeed();
  w = createWorld({ seed, stage: stageN, talents: hooks.talents || [] });
  const world = w;
  w.ev.on('end', ({ won }) => finish(world, won));
  if (v.autoPref) apply(w, { type: 'auto', on: true });   /* Auto-start is a player preference: it carries over to the next run */
  v.selected = v.moving = null; v.vfx.beams.length = 0; v.vfx.slashes.length = 0;
  v.bg = buildBackground(w, v.scale);
  ui.hidePick(); ui.hideOver(); ui.renderMeter(w); ui.renderInspector(w, v);
  if (hooks.onRunStart) hooks.onRunStart({ seed, stage: stageN });
}

async function finish(world, won) {
  v.moving = null;
  ui.showOver(won ? 'Level cleared!' : 'The gate has fallen',
    won ? 'You beat all ' + world.maxWave + ' waves.' : 'You reached wave ' + world.wave + ' of ' + world.maxWave + '.', 'Saving your run…', won && stageN < STAGES.length);
  let msg = '';
  try { msg = await hooks.onRunEnd({ waves: world.wave, kills: world.kills, stage: stageN, won, log: exportLog(world) }); } catch (e) { msg = 'Could not save your run.'; }
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

/* ---- Loop: fixed steps, driven by requestAnimationFrame while visible and by a timer while the tab is hidden ---- */
function frame(now) {
  if (!active) return;
  if (last < 0) last = now;
  const real = Math.min(MAX_CATCHUP, Math.max(0, (now - last) / 1000)); last = now;
  const hidden = !!document.hidden, running = w.phase !== 'over' && !w.picking;
  w.fx = hidden ? null : v.fx;
  acc = running ? acc + real * v.speed : 0;
  const deadline = performance.now() + (hidden ? 150 : 8);
  while (acc >= STEP) {
    if (!step(w)) { acc = 0; break; }
    acc -= STEP;
    if (performance.now() > deadline) break;
  }
  if (hidden) return;
  if (v.selected && !w.heroes.includes(v.selected)) { v.selected = v.moving = null; ui.renderInspector(w, v); }
  tickBeams(v.vfx, real * v.speed); tickSlashes(v.vfx, real * v.speed);
  draw(ctx, w, v);
  ui.renderHUD(w, v);
  if (w.picking) ui.updatePick(w);
  if ((uiT += real) >= 0.25) { uiT = 0; ui.renderMeter(w); if (v.selected) ui.renderInspector(w, v); }
}
function loopRaf(t) { frame(t); raf = requestAnimationFrame(loopRaf); }
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

/* Keeps the canvas sharp at any window size. The game is drawn in a fixed 640x400 space and scaled. */
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const px = Math.round(r.width * Math.min(2, globalThis.devicePixelRatio || 1));
  if (cv.width === px) return;
  cv.width = px; cv.height = Math.round(px * ROWS / COLS); v.scale = px / (COLS * T);
  if (w) v.bg = buildBackground(w, v.scale);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe($('stagebox'));

/* ---- Input ---- */
function cellFrom(e) {
  const r = cv.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * ROWS)];
}
cv.addEventListener('pointermove', e => { v.hover = cellFrom(e); });
cv.addEventListener('pointerleave', () => { v.hover = null; });
cv.addEventListener('pointerdown', e => {
  v.hover = cellFrom(e);
  if (w.phase === 'over' || w.picking) return;
  const [cx, cy] = v.hover, existing = w.heroes.find(t => t.cx === cx && t.cy === cy);
  if (v.moving) {
    if (existing === v.moving) { v.moving = null; ui.renderInspector(w, v); return; }
    if (act({ type: 'move', id: v.moving.id, cx, cy }).ok) v.moving = null;
    ui.renderInspector(w, v); return;
  }
  if (existing) { v.selected = existing; ui.renderInspector(w, v); return; }
  if (act({ type: 'place', hero: v.sel, cx, cy }).ok) { v.selected = null; ui.renderInspector(w, v); }
});

const selectType = i => { v.sel = i; v.moving = null; if (v.selected) { v.selected = null; ui.renderInspector(w, v); } };
const closeInspector = () => { v.selected = v.moving = null; ui.renderInspector(w, v); };
const sellSelected = () => { if (v.selected && act({ type: 'sell', id: v.selected.id }).ok) { v.selected = v.moving = null; ui.renderInspector(w, v); } };
const toggleMove = () => { if (v.selected && w.phase !== 'over') { v.moving = v.moving === v.selected ? null : v.selected; ui.renderInspector(w, v); } };
ui.initUI({
  onSelectType: selectType, onCloseInspector: closeInspector, onSell: sellSelected, onMove: toggleMove,
  onChoose: i => act({ type: 'choose', index: i }), onReroll: () => act({ type: 'reroll' }), onBanish: i => act({ type: 'banish', index: i })
});
$('go').onclick = () => act({ type: 'wave' });
$('relic').onclick = () => act({ type: 'buyRelic' });
$('auto').onclick = () => { v.autoPref = !w.auto; act({ type: 'auto', on: v.autoPref }); };
$('spd').onclick = () => { v.speed = v.speed === 1 ? 2 : 1; };
$('newRun').onclick = () => { newRun(); acc = 0; };
$('overNext').onclick = () => hooks.onNext && hooks.onNext();
$('menuBtn').onclick = () => hooks.onExit();
$('overMenu').onclick = () => hooks.onExit();
addEventListener('keydown', e => {
  if (!active || e.target.tagName === 'INPUT') return;
  if (+e.key >= 1 && +e.key <= HEROES.length) selectType(+e.key - 1);
  else if (e.key.toLowerCase() === 'r') act({ type: 'buyRelic' });
  else if (e.key.toLowerCase() === 'm') toggleMove();
  else if (e.key.toLowerCase() === 'x') sellSelected();
  else if (e.key === 'Escape') closeInspector();
  else if (e.key === ' ' && w.phase === 'build' && !w.picking) { e.preventDefault(); act({ type: 'wave' }); }
});

/* ---- Public API used by the Play screen ---- */
export function startGame(h) {
  hooks = h; stageN = h.stage || 1; active = true; acc = 0; last = -1;
  resize(); newRun();
  cancelAnimationFrame(raf); stopBg();
  if (document.hidden) startBg(); else raf = requestAnimationFrame(loopRaf);
}
export function stopGame() { active = false; cancelAnimationFrame(raf); stopBg(); }
