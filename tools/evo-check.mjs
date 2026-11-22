/* Browser check for evolved forms: node tools/evo-check.mjs <out> <hero,hero,...> <choice>. Serves nothing itself: run
   python3 -m http.server 8765 from the project folder first. Stubs the Supabase CDN, places the heroes at level 10, evolves
   them (choice 0, 1 or 2), starts a wave and writes <out>.png and <out>-b.png. Prints page errors. */
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
await page.keyboard.press('Enter'); await page.waitForTimeout(4500);
await page.screenshot({ path: out + '-b.png' });
console.log('errors', errs);
await browser.close();
