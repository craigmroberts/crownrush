#!/usr/bin/env node
// Photographs every structure in the game, one at a time, on a clean stage.
//
//     node tools/shots/buildings.mjs                  # 1280px shots
//     node tools/shots/buildings.mjs --size 640 --scale 1
//
// The shots land in .shots/buildings/ as PNGs, next to an index.json with each one's mesh and
// triangle count. Everything is rendered from the real builders in src/models.js under the real
// lighting from src/world.js — see tools/shots/gallery.js, which is the stage this drives.
//
// Why a dev server rather than the built site: the build minifies the module away, and this needs to
// call makeKeep and makeTower by name with arguments the game never passes.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const SIZE = flag('size', 640);
const SCALE = flag('scale', 2);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, '.shots/buildings');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

// The four ages the Keep passes through, which is what CFG.wallLevels calls them.
const AGES = ['wood', 'stone', 'iron', 'diamond'];

// One entry per shot. The buildings a player puts up come in every age; the rest are shot once.
const SHOTS = [
  ...AGES.map((m, i) => ({ kind: 'keep', material: m, label: `Keep — ${m}`, file: `keep-${m}`, group: 'The Keep' })),
  ...AGES.map((m) => ({ kind: 'hut', material: m, label: `Hut — ${m}`, file: `hut-${m}`, group: 'Huts' })),
  ...AGES.map((m) => ({ kind: 'barracks', material: m, label: `Barracks — ${m}`, file: `barracks-${m}`, group: 'Barracks' })),
  ...[1, 2, 3].map((level) => ({ kind: 'tower', material: 'wood', level, label: `Tower — level ${level}`, file: `tower-${level}`, group: 'Towers' })),
  { kind: 'tower', material: 'stone', level: 3, label: 'Tower — level 3, stone', file: 'tower-3-stone', group: 'Towers' },
  { kind: 'bank', label: 'Bank', file: 'bank', group: 'Other buildings' },
  { kind: 'gatepost', label: 'Gate post', file: 'gatepost', group: 'Other buildings' },
  ...AGES.map((m, level) => ({ kind: 'wall', level, label: `Wall — ${m}`, file: `wall-${m}`, group: 'Walls and gates' })),
  ...AGES.map((m, level) => ({ kind: 'gate', level, label: `Gate — ${m}`, file: `gate-${m}`, group: 'Walls and gates' })),
  { kind: 'rubble', level: 1, label: 'Rubble — a broken wall', file: 'rubble', group: 'Walls and gates' },
  { kind: 'fence', label: 'Fence', file: 'fence', group: 'Walls and gates' },
  { kind: 'spikes', label: 'Spikes', file: 'spikes', group: 'Walls and gates' },
  { kind: 'bridge', label: 'Bridge', file: 'bridge', group: 'Ground works' },
  { kind: 'camp', label: 'Raider camp', file: 'camp', zoom: 1.05, group: 'Ground works' },
  { kind: 'lumber', label: 'Lumber tree', file: 'node-lumber', group: 'Resource nodes' },
  { kind: 'ore', label: 'Ore rock', file: 'node-ore', group: 'Resource nodes' },
  { kind: 'iron', label: 'Iron seam', file: 'node-iron', group: 'Resource nodes' },
  { kind: 'gem', label: 'Gem node', file: 'node-gem', group: 'Resource nodes' },
  { kind: 'hay', label: 'Hay bale', file: 'hay', group: 'Farm' },
  { kind: 'wheat', label: 'Wheat field', file: 'wheat', group: 'Farm' },
];

const port = await new Promise((ok) => {
  const s = createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { server.kill('SIGKILL'); } catch { /* already gone */ } };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
server.on('exit', (c) => { console.error('vite exited', c); process.exit(1); });
await new Promise((ok) => server.stdout.on('data', (d) => /localhost:/.test(String(d)) && ok()));

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

await page.goto(`http://localhost:${port}/tools/shots/gallery.html?size=${SIZE}&scale=${SCALE}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.galleryReady === true, null, { timeout: 60000 });

mkdirSync(OUT, { recursive: true });
const index = [];
for (const spec of SHOTS) {
  const shot = await page.evaluate((s) => window.shoot(s), spec);
  if (shot.error) {
    console.error(`  ${spec.file}: ${shot.error}`);
    continue;
  }
  const data = Buffer.from(shot.png.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${spec.file}.png`), data);
  index.push({ ...spec, meshes: shot.meshes, triangles: shot.triangles, size: shot.size, bytes: data.length });
  console.log(`  ${spec.file.padEnd(18)} ${String(shot.meshes).padStart(3)} meshes  ${String(shot.triangles).padStart(6)} tris  ${(data.length / 1024).toFixed(0)} kB`);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`\n  ${index.length} shots in ${OUT}\n`);
await browser.close();
stop();
process.exit(0);
