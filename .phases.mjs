import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const OUT = '/tmp/claude-0/-home-user-crownrush/b2413a67-a991-5d67-b165-74f2ebb7f859/scratchpad';
const port = 4202;
const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '/home/user/crownrush', stdio: ['ignore','pipe','pipe'], detached: true });
await new Promise((r) => { p.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 8000); });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
for (const [name, phase] of [['p-day', '0.30'], ['p-dusk', '0.62'], ['p-night', '0.82']]) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/?tour&phase=${phase}`, { waitUntil: 'load', timeout: 150000 });
  await page.waitForFunction(() => window.game && window.game.king, null, { timeout: 150000 });
  await page.waitForFunction(() => window.game.frames > 22, null, { timeout: 300000, polling: 'raf' });
  await page.evaluate((ph) => {
    const g = window.game;
    g.king.mesh.position.set(-30, 0, -24);
    g.king.vel.set(0, 0, 0);
    g.camLock = 30; g.camDist = 30;
    g.setDayPhase(Number(ph), null);
  }, phase);
  await page.waitForFunction(() => window.game.frames > 38, null, { timeout: 400000, polling: 'raf' });
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000, animations: 'disabled' });
  console.log(name, 'done');
  await ctx.close();
}
await browser.close();
try { process.kill(-p.pid); } catch {}
process.exit(0);
