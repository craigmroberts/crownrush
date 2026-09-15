// Birds-eye plan of the village with every pad bought, for eyeballing what check.mjs can only count.
//
//     node tools/layout/plan.mjs settlement --tier 2 --span 42
//
// It boots the built game headless, buys every pad it can reach, reveals all four roads, then swaps
// the camera for an overhead orthographic one and writes .shots/<name>.jpg. The scene's fog and the
// fog-of-war veil are both switched off: from 220 units up they would otherwise be all you saw.
// Needs the Playwright browser (`npx playwright install`), same as tools/probe/probe.mjs.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

const ROOT = '/Users/craigmroberts/Projects/crownrush';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : Number(process.argv[i + 1]); };
const name = process.argv[2] || 'plan';
const wantTier = arg('tier', 2);
const span = arg('span', 86);

const port = await new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('  page error:', m.text()); });
await page.goto(`http://localhost:${port}/crownrush/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.pads, null, { timeout: 60000 });

const report = await page.evaluate(({ wantTier }) => {
  const g = window.game;
  g.paused = false; g.running = true;
  g.input.read = () => ({ x: 0, y: 0 });
  g.spawnWave = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  const skip = new Set();
  const built = [];
  const failed = [];
  for (let round = 0; round < 40; round++) {
    g.coins = 999999;
    g.refreshPads();
    let did = 0;
    for (const pad of [...g.pads]) {
      const d = pad.def;
      if (!g.pads.includes(pad) || skip.has(d.id) || d.feed) continue;
      if (d.repeatable && built.includes(d.id)) { skip.add(d.id); continue; }
      if (d.tier > wantTier) continue;
      try { g.completePad(pad); built.push(d.id); did++; }
      catch (e) { skip.add(d.id); failed.push(d.id + ': ' + e.message); }
    }
    if (!did) break;
    step(4);
  }
  for (const id of ['south', 'east', 'west', 'north']) g.world.revealRoad(id);
  for (const r of g.world.roads) { r.progress = 1; for (const m of r.meshes) if (!m.userData.noDrawRange) m.geometry.setDrawRange(0, Infinity); }
  step(200);
  return { built: built.length, tier: g.tier, failed, pads: g.pads.map((p) => p.def.id) };
}, { wantTier });
console.log('built', report.built, 'pads; village tier', report.tier);
if (report.failed.length) console.log('failed:', report.failed);
console.log('pads still standing:', report.pads.join(', '));

const buf = await page.evaluate(({ span }) => {
  const g = window.game;
  const C = g.camera;
  g.scene.fog = null;
  C.position.set(0, 220, 0.001);
  C.up.set(0, 0, -1);
  C.lookAt(0, 0, 0);
  C.updateMatrixWorld(true);
  const el = g.renderer.domElement;
  const a = el.width / el.height;
  C.projectionMatrix.makeOrthographic(-span * a, span * a, span, -span, 1, 600);
  C.projectionMatrixInverse.copy(C.projectionMatrix).invert();
  g.renderer.render(g.scene, C);
  return el.toDataURL('image/jpeg', 0.92);
}, { span });
mkdirSync(`${ROOT}/.shots`, { recursive: true });
writeFileSync(`${ROOT}/.shots/${name}.jpg`, Buffer.from(buf.split(',')[1], 'base64'));
console.log('wrote .shots/' + name + '.jpg');
await browser.close();
srv.kill();
