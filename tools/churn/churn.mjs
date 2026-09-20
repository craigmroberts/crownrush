#!/usr/bin/env node
// #190: THE CHURN HARNESS -- what grows with the renderer ON.
//
// #167 drove thirty nights headlessly with the renderer STUBBED OUT and reported a healthy game.
// That instrument cannot see a GPU-side leak: `renderer.info.memory.geometries` and `.textures`
// count what has been UPLOADED, and nothing is uploaded when nothing renders -- so a cloned material
// never disposed, an orphaned geometry or a leaked render target all read as zero.
//
// So this runs the real renderer and churns EVENTS rather than time. SwiftShader makes a thirty-night
// render impossible; it makes a thousand events perfectly possible, and a leak is per-event anyway.
// Each block runs N times, then forces a GC and reads the counters. A number that climbs block over
// block is the leak, named -- and one that plateaus is a cache filling, which is not.
//
//     node tools/churn/churn.mjs               # every block, 3 rounds
//     node tools/churn/churn.mjs --rounds 5
//     node tools/churn/churn.mjs --block rain  # one block
//
// Chromium is launched with --js-flags=--expose-gc so the heap reading means something.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ROUNDS = Number(flag('rounds', 3));
const ONLY = flag('block', null);
const PORT = Number(flag('port', 8211));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(DIST, normalize(p)));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => srv.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));

// `?quality=2` is the cheapest tier, because the point is the churn and not the frame.
await page.goto(`http://localhost:${PORT}/?tour&quality=2`, { waitUntil: 'load', timeout: 200000 });
await page.waitForFunction(() => window.game && window.game.king && window.game.walls, null, { timeout: 200000 });
await page.waitForFunction(() => (window.game.frames || 0) > 12, null, { timeout: 200000, polling: 'raf' });
console.log('world up\n');

// Each block is a string of JS run in the page. They are written to leave the game in the state they
// found it -- a block that leaves 3,000 raiders standing would report its own mess as a leak.
const BLOCKS = {
  // The brief says 520 instances are created and destroyed per shower. In the code the drops mesh is
  // made once in `buildWorld` and only its count changes -- so this exists to STRIKE IT OFF.
  rain: `for (let i = 0; i < 40; i++) { g.world.rain.level = 1; g.world.rain.until = g.time + 1; g.world.rain.level = 0; }`,
  // Levels 4, 8 and 12 swap every building for its next age. The old meshes come off the scene --
  // do their geometries and prop tints go with them?
  rebuild: `for (let i = 0; i < 4; i++) { g.wallLevel = 1 + (i % 3); if (g.rebuildStructures) g.rebuildStructures(); }`,
  // A restore builds a whole world over the top of one that already exists.
  restore: `{ const s = g.runState(); for (let i = 0; i < 3; i++) g.restoreRun(JSON.parse(JSON.stringify(s))); }`,
  // Spawn and kill, which is the commonest event in the game by a wide margin.
  raiders: `for (let i = 0; i < 200; i++) { const e = g.spawnEnemy('knight', 20 + (i % 9), -20 - (i % 7), 0); g.killEnemy ? g.killEnemy(e) : (e.hp = 0); } g.enemies.length = 0;`,
  // Damage numbers: `popupCache` is one canvas texture per distinct number, and #167 found it climbing.
  popups: `for (let i = 0; i < 300; i++) { g.popup(String(1000 + i), g.king.mesh.position, '#fff', 0.1); } g.popups && (g.popups.length = 0);`,
  // Mats: `drawPad` makes a canvas and a texture per mat, and `disposePad` is meant to take them back.
  pads: `for (let i = 0; i < 20; i++) { g.refreshPads(); }`,
  // The crowd re-allocates its instance buffers when it grows, and disposes the old ones.
  crowd: `for (let i = 0; i < 60; i++) { const u = g.spawnUnit('archer', 4 + (i % 5), 4 + (i % 5)); g.units.splice(g.units.indexOf(u), 1); g.root.remove(u.mesh); }`,
};

const read = () => page.evaluate(async () => {
  if (window.gc) window.gc();
  await new Promise((r) => setTimeout(r, 60));
  if (window.gc) window.gc();
  const g = window.game;
  const m = g.renderer.info.memory;
  const c = g.cacheSizes ? g.cacheSizes() : (window.cacheSizes ? window.cacheSizes() : {});
  return {
    geometries: m.geometries, textures: m.textures,
    programs: g.renderer.info.programs ? g.renderer.info.programs.length : 0,
    materials: c.materials ?? null, tags: c.tags ?? null, popups: c.popups ?? null,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    enemies: g.enemies.length, units: g.units.length, coins: g.coins.length,
  };
});

const names = ONLY ? [ONLY] : Object.keys(BLOCKS);
const KEYS = ['geometries', 'textures', 'programs', 'materials', 'tags', 'popups', 'heapMB'];
let anyClimb = false;
for (const name of names) {
  if (!BLOCKS[name]) { console.log(`no such block: ${name}`); continue; }
  const rows = [];
  rows.push(await read());
  for (let r = 0; r < ROUNDS; r++) {
    await page.evaluate((src) => { const g = window.game; new Function('g', src)(g); }, BLOCKS[name]);
    // a few real frames, so anything the block queued is actually uploaded or actually collected
    await page.evaluate(() => new Promise((res) => { let i = 0; const t = () => (++i >= 3 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); }));
    rows.push(await read());
  }
  console.log(`--- ${name} (${ROUNDS} rounds) ---`);
  for (const k of KEYS) {
    const series = rows.map((x) => x[k]);
    if (series.some((v) => v == null)) continue;
    // The FIRST round is allowed to climb: that is a cache filling for the first time, which every
    // one of these does and none of which is a leak. What matters is round 2 against round 3.
    const settled = series.slice(1);
    const climb = settled[settled.length - 1] - settled[0];
    const perRound = settled.length > 1 ? climb / (settled.length - 1) : 0;
    const bad = perRound > 0.5 && k !== 'heapMB';
    if (bad) anyClimb = true;
    console.log(`  ${bad ? 'CLIMB ' : '      '}${k.padEnd(11)} ${series.join(' -> ')}${bad ? `   +${perRound.toFixed(1)}/round after the first` : ''}`);
  }
  console.log('');
}
console.log(anyClimb ? 'Something climbs per block -- see CLIMB above.' : 'Every counter flat after the first round.');
await browser.close();
srv.close();
