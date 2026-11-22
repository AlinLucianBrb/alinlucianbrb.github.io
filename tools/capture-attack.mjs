/* Records a hero's attack in a match, for reviewing animations: node tools/capture-attack.mjs <out-folder> <hero> <choice>.
   Like evo-check.mjs, but forces an attack every second at x1 and then x3 and saves ~30 screenshots a second into the folder
   (file names: index_speed_ms.png), to turn into a GIF. */
import { chromium } from 'playwright';   // needs Playwright in the project: npm i -D playwright && npx playwright install chromium
const out = process.argv[2], lineup = process.argv[3].split(','), choice = +(process.argv[4] || 0);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'text/javascript', body: 'export function createClient(){ return { rpc: async () => ({ data: null, error: { message: "offline" } }), auth: { getSession: async () => ({ data: {} }) }, from: () => ({}) }; }' }));
await page.goto(process.env.GAME_URL || 'http://localhost:8765/index.html'); await page.waitForTimeout(400);
await page.evaluate(async (lineup) => {
  const { state } = await import('./js/core/state.js');
  state.profile = { username: 't', level: 3, talents: [], levels_cleared: 0, lineup, equipment: {} };
  (await import('./js/core/bus.js')).bus.emit('nav', { to: 'play', params: { stage: 1 } });
}, lineup);
await page.waitForTimeout(5000);
await page.evaluate(async ({ lineup, choice }) => {
  const { _debug } = await import('./js/game/game.js'), { apply } = await import('./js/engine/commands.js');
  const w = _debug().world; w.gold = 99999; const mid = w.path[Math.floor(w.path.length * 0.4)];
  lineup.forEach((id, k) => { for (const [a, b] of [[k * 2 - 2, 1], [k * 2 - 2, -1], [k * 2 - 1, 1], [k * 2 - 1, -1], [k * 2 - 2, 2]]) if (apply(w, { type: 'place', hero: id, cx: mid[0] + a, cy: mid[1] + b }).ok) break; });
  for (const h of w.heroes) { h.level = 10; h.xp = 0; const r = apply(w, { type: 'evolve', id: h.id, choice }); if (!r.ok) console.log('evolve', h.base.id, r.error || JSON.stringify(r)); }
}, { lineup, choice });
await page.waitForTimeout(800);
await page.keyboard.press('1'); await page.waitForTimeout(300);
await page.screenshot({ path: out + '.png' });
await page.keyboard.press("Enter"); await page.waitForTimeout(800);
const shots = []; const t0 = Date.now();
for (const sp of [1, 3]) { await page.evaluate(async sp => { const d = (await import("./js/game/game.js"))._debug(); d.view.speed = sp; clearInterval(window.__iv); const h = d.world.heroes[0]; window.__iv = setInterval(() => d.view.swings.set(h.id, { ang: Math.PI, start: -1 }), 1000 / sp); }, sp); const end = Date.now() + 4000; while (Date.now() < end) { shots.push({ sp, t: Date.now() - t0, b: await page.screenshot({ clip: { x: 380, y: 160, width: 640, height: 400 } }) }); } }
const fs = await import("fs"); fs.mkdirSync(out, { recursive: true }); shots.forEach((s, i) => fs.writeFileSync(`${out}/${String(i).padStart(3, "0")}_${s.sp}_${s.t}.png`, s.b));
await page.screenshot({ path: out + '-b.png' });
console.log('errors', errs);
await browser.close();
