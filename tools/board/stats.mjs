// #178: what the build weighs, written where the board can read it.
//
// Measured from `dist/` after a build rather than typed anywhere, so it cannot disagree with the
// thing that shipped. `npm run board` after `npm run build`.
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'public', 'board', 'stats.json');

if (!existsSync(DIST)) {
  console.error('No dist/ — run `npm run build` first.');
  process.exit(1);
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [{ path: p.slice(DIST.length + 1), bytes: statSync(p).size }];
});

const files = walk(DIST);
const sum = (f) => f.reduce((a, b) => a + b.bytes, 0);
const by = (re) => files.filter((f) => re.test(f.path));

// The README is where the budgets are written down; read them rather than restating them.
//
// The WHOLE table, not three rows looked up by name. Naming them here is how the board starts lying
// the day someone adds a sixth budget to the README -- the row would exist in the place that counts
// and be invisible in the place that is supposed to show it. Anchored on the header line instead, so
// the board shows whatever the table says, in the order it says it.
let budgets = null;
try {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const lines = md.split('\n');
  const head = lines.findIndex((l) => /^\|\s*Metric\s*\|\s*Aim for\s*\|/.test(l));
  if (head >= 0) {
    budgets = [];
    for (let i = head + 2; i < lines.length && lines[i].startsWith('|'); i++) {
      const cell = lines[i].split('|').slice(1, -1).map((c) => c.trim());
      if (cell.length >= 2) budgets.push({ metric: cell[0], aim: cell[1], why: cell[2] || '' });
    }
  }
} catch (e) { /* the board says the table could not be read */ }

// What CI actually enforces, read out of the probe rather than assumed from the README.
//
// The board used to caption the budget table "asserted by the probe", which was not true of a single
// row: all three of the probe's budgets are on its `WAIVED` list right now -- two behind #52, and the
// load budget parked by the owner. A page whose rule is that nothing on it is a copy cannot hold an
// opinion about CI that CI does not share, so it reads the list. Regex rather than import because
// probe.mjs is a CLI and importing it runs one.
let enforced = null;
try {
  const src = readFileSync(join(ROOT, 'tools', 'probe', 'probe.mjs'), 'utf8');
  const budgets = [...src.matchAll(/\{\s*key:\s*'(\w+)',[^}]*?label:\s*'([^']+)'/g)].map((m) => ({ key: m[1], label: m[2] }));
  const block = /const WAIVED = \{([\s\S]*?)\n\};/.exec(src);
  const waived = {};
  if (block) for (const m of block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) waived[m[1]] = m[2];
  if (budgets.length) enforced = budgets.map((b) => ({ ...b, waived: waived[b.key] || null }));
} catch (e) { /* the board simply says nothing about CI */ }

const stats = {
  at: new Date().toISOString(),
  enforced,
  total: sum(files),
  files: files.length,
  groups: [
    { name: 'JavaScript', bytes: sum(by(/\.js$/)), files: by(/\.js$/).length },
    { name: 'Models (.glb)', bytes: sum(by(/\.glb$/)), files: by(/\.glb$/).length },
    { name: 'WASM', bytes: sum(by(/\.wasm$/)), files: by(/\.wasm$/).length },
    { name: 'Fonts', bytes: sum(by(/\.woff2?$/)), files: by(/\.woff2?$/).length },
    { name: 'CSS', bytes: sum(by(/\.css$/)), files: by(/\.css$/).length },
    { name: 'Images', bytes: sum(by(/\.(png|jpe?g|svg|webp)$/)), files: by(/\.(png|jpe?g|svg|webp)$/).length },
  ].filter((g) => g.files),
  biggest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 8),
  budgets,
};

const json = JSON.stringify(stats, null, 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json);

// And into dist/ as well, because dist/ is already built by the time this can run. `public/` is the
// copy the next build will pick up; this is the copy the build that was just measured will serve.
// Without it a deploy publishes whatever number happened to be committed -- a stale figure sitting
// on a page whose whole claim is that it holds no stale figures -- or costs a second full build to
// avoid it.
const inDist = join(DIST, 'board', 'stats.json');
if (existsSync(join(DIST, 'board'))) writeFileSync(inDist, json);

console.log(`board stats: ${(stats.total / 1e6).toFixed(2)} MB across ${stats.files} files -> public/board/stats.json${existsSync(inDist) ? ' + dist/board/' : ''}`);
