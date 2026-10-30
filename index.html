<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Target Rush</title>
<style>
:root{--bg:#14213d;--panel:#1d2f55;--line:#2e4474;--text:#eef2fb;--muted:#9fb0d3;--accent:#ffb830;--red:#e4493d;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px}
header{width:100%;max-width:920px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
h1{margin:0;font-size:1.7rem;letter-spacing:-.02em}
#stats{color:var(--muted);font-size:.95rem}
#stats b{color:var(--text)}
.wrap{display:grid;grid-template-columns:minmax(0,520px) minmax(240px,1fr);gap:16px;width:100%;max-width:920px}
@media(max-width:760px){.wrap{grid-template-columns:1fr}}
.stage{position:relative;border:2px solid var(--line);border-radius:6px;background:#0f1a31;touch-action:none;user-select:none}
canvas{display:block;width:100%;height:auto;cursor:crosshair}
.hud{position:absolute;top:8px;left:12px;right:12px;display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;pointer-events:none}
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(15,26,49,.88);text-align:center;padding:16px}
.overlay[hidden]{display:none}
.overlay h2{margin:0;font-size:1.5rem}
.overlay p{margin:0;color:var(--muted);max-width:32ch}
button,input{font:inherit;border-radius:4px;border:2px solid var(--line);padding:9px 14px}
input{background:#0f1a31;color:var(--text);width:min(220px,100%);text-align:center}
button{background:var(--accent);border-color:var(--accent);color:#1b1500;font-weight:700;cursor:pointer}
button:disabled{opacity:.55;cursor:default}
button:focus-visible,input:focus-visible{outline:3px solid #fff;outline-offset:2px}
#msg{min-height:1.3em;font-size:.9rem;color:var(--muted)}
aside{background:var(--panel);border:2px solid var(--line);border-radius:6px;padding:14px}
aside h2{margin:0 0 8px;font-size:1.15rem}
ol{margin:0;padding-left:1.6em}
li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--line)}
li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
li b{color:var(--accent)}
.note{color:var(--muted);font-size:.9rem;margin:8px 0 0}
</style>
</head>
<body>
<header>
  <h1>Target Rush</h1>
  <div id="stats">Online now: <b id="online">–</b> · Total plays: <b id="plays">–</b></div>
</header>

<div class="wrap">
  <div class="stage">
    <canvas id="c" width="520" height="520" aria-label="Game area"></canvas>
    <div class="hud"><span>Score: <span id="score">0</span></span><span>Time: <span id="time">30</span></span></div>
    <div class="overlay" id="startBox">
      <h2>Hit the targets</h2>
      <p>Click or tap as many targets as you can in 30 seconds. They shrink and vanish quickly.</p>
      <button id="startBtn">Start game</button>
    </div>
    <div class="overlay" id="endBox" hidden>
      <h2>Time’s up: <span id="final">0</span></h2>
      <input id="name" maxlength="16" placeholder="Your name" autocomplete="nickname" aria-label="Your name">
      <button id="submitBtn">Submit score</button>
      <div id="msg"></div>
      <button id="againBtn">Play again</button>
    </div>
  </div>
  <aside>
    <h2>Top 10</h2>
    <ol id="board"><li><span>Loading…</span></li></ol>
    <p class="note" id="note"></p>
  </aside>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js"></script>
<script>
/* ---- 1. Paste your Supabase values here (the publishable/anon key is safe to expose) ---- */
const SUPABASE_URL = https://xgqdetdqzsqglkdyzlfe.supabase.co;
const SUPABASE_KEY = sb_publishable_e2SarhgIDMzYaixzoR_2yA_VKjb7Uvv;

const GAME_SECONDS = 30;
const $ = id => document.getElementById(id);
const configured = !SUPABASE_URL.startsWith('YOUR_') && window.supabase;
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* ---------------- Supabase: leaderboard, plays, online count ---------------- */
async function loadBoard() {
  const list = $('board');
  if (!sb) { list.innerHTML = '<li><span>Not connected yet</span></li>'; $('note').textContent = 'Add your Supabase details in index.html to turn on the leaderboard.'; return; }
  const { data, error } = await sb.from('scores').select('name,score').order('score', { ascending: false }).limit(10);
  if (error) { list.innerHTML = '<li><span>Could not load scores</span></li>'; return; }
  list.innerHTML = '';
  if (!data.length) { list.innerHTML = '<li><span>No scores yet. Be the first.</span></li>'; return; }
  data.forEach(r => {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.textContent = r.name;
    const s = document.createElement('b'); s.textContent = r.score;
    li.append(n, s); list.append(li);
  });
}

async function loadPlays() {
  if (!sb) return;
  const { data } = await sb.from('stats').select('plays').eq('id', 1).single();
  if (data) $('plays').textContent = data.plays.toLocaleString();
}

function trackOnline() {
  if (!sb) return;
  const ch = sb.channel('online-players', { config: { presence: { key: crypto.randomUUID() } } });
  ch.on('presence', { event: 'sync' }, () => { $('online').textContent = Object.keys(ch.presenceState()).length; })
    .subscribe(async status => { if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() }); });
}

async function countPlay() {
  if (!sb) return;
  const { data } = await sb.rpc('increment_plays');
  if (typeof data === 'number') $('plays').textContent = data.toLocaleString();
}

async function submitScore() {
  const name = $('name').value.trim();
  if (!name) { $('msg').textContent = 'Enter a name first.'; return; }
  if (!sb) { $('msg').textContent = 'Leaderboard is not connected yet.'; return; }
  $('submitBtn').disabled = true;
  try { localStorage.setItem('tr_name', name); } catch (e) {}
  const { error } = await sb.from('scores').insert({ name, score });
  $('msg').textContent = error ? 'Could not save. Try again.' : 'Score saved!';
  $('submitBtn').disabled = !error ? true : false;
  if (!error) loadBoard();
}

/* ---------------- Game ---------------- */
const cv = $('c'), ctx = cv.getContext('2d');
let state = 'idle', score = 0, targets = [], startAt = 0, nextSpawn = 0, hitFx = [];

function resetGame() {
  score = 0; targets = []; hitFx = []; startAt = performance.now(); nextSpawn = 0; state = 'playing';
  $('score').textContent = 0; $('time').textContent = GAME_SECONDS;
  $('startBox').hidden = true; $('endBox').hidden = true;
  countPlay();
  requestAnimationFrame(loop);
}

function spawn(now) {
  const r = 26 + Math.random() * 18;
  targets.push({ x: r + Math.random() * (cv.width - 2 * r), y: 40 + r + Math.random() * (cv.height - 60 - 2 * r), r, born: now, life: 1300 });
}

function endGame() {
  state = 'over';
  $('final').textContent = score;
  $('msg').textContent = ''; $('submitBtn').disabled = false;
  try { $('name').value = localStorage.getItem('tr_name') || $('name').value; } catch (e) {}
  $('endBox').hidden = false;
  draw(performance.now());
}

function loop(now) {
  if (state !== 'playing') return;
  const elapsed = (now - startAt) / 1000;
  const left = Math.max(0, GAME_SECONDS - elapsed);
  $('time').textContent = Math.ceil(left);
  if (left <= 0) return endGame();
  if (now >= nextSpawn) { spawn(now); nextSpawn = now + Math.max(350, 750 - elapsed * 10); }
  targets = targets.filter(t => now - t.born < t.life);
  draw(now);
  requestAnimationFrame(loop);
}

function radiusOf(t, now) { return t.r * (1 - 0.55 * ((now - t.born) / t.life)); }

function draw(now) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  targets.forEach(t => {
    const r = radiusOf(t, now);
    [[1, '#e4493d'], [.66, '#fff'], [.33, '#e4493d']].forEach(([k, c]) => {
      ctx.beginPath(); ctx.arc(t.x, t.y, r * k, 0, 7); ctx.fillStyle = c; ctx.fill();
    });
  });
  hitFx = hitFx.filter(f => now - f.t < 250);
  hitFx.forEach(f => {
    ctx.beginPath(); ctx.arc(f.x, f.y, 10 + (now - f.t) / 6, 0, 7);
    ctx.strokeStyle = 'rgba(255,184,48,' + (1 - (now - f.t) / 250) + ')'; ctx.lineWidth = 3; ctx.stroke();
  });
}

cv.addEventListener('pointerdown', e => {
  if (state !== 'playing') return;
  const rect = cv.getBoundingClientRect();
  const x = (e.clientX - rect.left) * cv.width / rect.width;
  const y = (e.clientY - rect.top) * cv.height / rect.height;
  const now = performance.now();
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (Math.hypot(x - t.x, y - t.y) <= radiusOf(t, now)) {
      targets.splice(i, 1); score++; $('score').textContent = score; hitFx.push({ x: t.x, y: t.y, t: now });
      break;
    }
  }
});

$('startBtn').onclick = resetGame;
$('againBtn').onclick = resetGame;
$('submitBtn').onclick = submitScore;
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') submitScore(); });

loadBoard(); loadPlays(); trackOnline();
</script>
</body>
</html>
