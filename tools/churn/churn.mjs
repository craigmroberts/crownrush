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
//     node tools/churn/churn.mjs --query '&crowd=0'  # the un-instanced path, which safe mode uses
//
// Chromium is launched with --js-flags=--expose-gc so the heap reading means something.
import { chromium } from 'playwright';
import { verdict } from './verdict.mjs';
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
// #190: WHICH PATH IS BEING CHURNED, because there is more than one and they leak differently.
// By default a character is a row in the crowd's instanced mesh. `?crowd=0` -- which safe mode turns
// on by itself, on exactly the phones this ticket is about -- makes every one of them a real
// SkinnedMesh with its own geometry and its own skeleton. A harness that only ever loads the default
// has an opinion about half the game.
//
//     node tools/churn/churn.mjs --block raiders --query '&crowd=0'
const QUERY = flag('query', '') || '';

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
await page.goto(`http://localhost:${PORT}/?tour&quality=2${QUERY}`, { waitUntil: 'load', timeout: 200000 });
await page.waitForFunction(() => window.game && window.game.king && window.game.walls, null, { timeout: 200000 });
await page.waitForFunction(() => (window.game.frames || 0) > 12, null, { timeout: 200000, polling: 'raf' });
console.log(`world up${QUERY ? `  (${QUERY.replace(/^&/, '')})` : ''}\n`);

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
  // Spawn and kill, which is the commonest event in the game by a wide margin. `killEnemy` is the
  // real path and moves them to the dying list, so the block drains that list rather than truncating
  // `enemies` -- see the note below on why that matters.
  raiders: `for (let i = 0; i < 200; i++) { const e = g.spawnEnemy('knight', 20 + (i % 9), -20 - (i % 7), 0); g.killEnemy(e); } for (let t = 0; t < 4; t += 0.05) g.updateEnemies(0.05);`,
  // Damage numbers: `popupCache` is one canvas texture per distinct number, and #167 found it
  // climbing. They are driven to their own expiry -- `updateEffects` is what removes the sprite and
  // disposes the CLONED material each one carries.
  popups: `for (let i = 0; i < 300; i++) { g.popup(String(1000 + i), g.king.mesh.position, '#fff', 0.1); } for (let t = 0; t < 2.5; t += 0.05) g.updateEffects(0.05);`,
  // #190: THE CONTROL, and it is not padding. Every block gets a second of game time and three real
  // frames after it, so a sweep walks the run forward -- and a block's numbers are only its own if
  // the run standing still would have produced none of them. The `pads` block climbed the heap 3 MB
  // a round over eight rounds, flat GPU-side, off a call that does nothing at all once every mat it
  // can add is already down; it ran sixth, roughly 45 seconds of game time in. This block does
  // nothing and is measured identically, so it sits immediately before `pads` in the sweep: whatever
  // it climbs is the cost of the run being where it is, and only the difference belongs to the block.
  nothing: ``,
  // Mats: `drawPad` makes a canvas and a texture per mat, and `disposePad` is meant to take them back.
  pads: `for (let i = 0; i < 20; i++) { g.refreshPads(); }`,
  // The crowd re-allocates its instance buffers when it grows, and disposes the old ones.
  crowd: `for (let i = 0; i < 60; i++) { const u = g.spawnUnit('archer', 4 + (i % 5), 4 + (i % 5)); g.units.splice(g.units.indexOf(u), 1); g.root.remove(u.mesh); g.disposeEntity(u.mesh); }`,
};

// #190: A BLOCK THAT DOES NOT TEAR DOWN THE WAY THE GAME DOES REPORTS ITS OWN MESS AS A LEAK, and
// the first run of this harness did exactly that, twice. It is worth writing down because it is the
// same trap #179 is about, arriving through the instrument instead of the check.
//
//   crowd  reported +540 geometries a round. The block removed each unit's mesh from the root and
//          never called `disposeEntity`, which is the second half of what the game itself does
//          (`game-units.js`: splice, remove, dispose). The geometries were the harness's.
//   crowd  reported +540 geometries a round a SECOND time, after the dispose was added. `updateCrowd`
//          is what reaps a character whose mesh has left the scene and gives back its tint row, and
//          the block never ran it -- so the row pool drained, `grow()` reallocated the instance
//          buffers every round, and the harness measured its own growth again.
//   popups reported +228 textures a round. The block emptied `game.popups` instead of letting them
//          expire, so the sprites stayed in the scene with their cloned materials alive, keeping
//          every canvas texture uploaded. `updateEffects` removes and disposes on expiry; the cache
//          eviction already disposes correctly (`gone.map.dispose()`), and neither was at fault.
//
// So the rule for anything added here: end the block through the SAME path the game uses, and if
// that path is a timer or an animation, drive the frames rather than truncating the array.

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
    // #190: AND WHERE THE RUN HAS GOT TO, which is not decoration -- it is the column that corrected
    // me. A sweep drives a second of game time per round, so it walks the run into states it has not
    // been in, and the first time it reaches one there is a program to compile and a texture to
    // upload that were always going to be paid for once.
    //
    // I had written that down as "a wave arrives with a raider type nobody has seen". It cannot be:
    // the harness loads `?tour`, which holds the opening morning open for ever and means NOBODY
    // COMES. The columns said so the moment they existed -- wave 0 for every round of every block --
    // and named the real thing instead:
    //
    //     raiders  geometries  221 -> 227 -> 227 -> 227 -> 227 -> 227 -> 227 -> 232 -> 232
    //              popups        0 ->   0 ->   0 ->   0 ->   0 ->   0 ->   0 ->   2 ->   3
    //              run      0/5/24/2 ->  ... -> 0/5/24/2 -> 0/5/31/2 -> ...
    //
    // Seven enemies arrive at round five. The block spawns its knights at (20..28, -20..-27) and a
    // camp's `wakeRadius` is 14, so it wakes one; two rounds later the first blow lands, the popup
    // cache fills for the first time, and a texture and two programs go with it. Once, then flat.
    // The verdict line averaged that step into "+0.7/round" and called it a climb.
    wave: g.wave, night: !!g.night, level: g.baseLevel,
  };
});

const names = ONLY ? [ONLY] : Object.keys(BLOCKS);
const KEYS = ['geometries', 'textures', 'programs', 'materials', 'tags', 'popups', 'heapMB'];
const STATE = ['wave', 'level', 'enemies', 'units'];
let anyClimb = false;
const heapClimbs = [];
const steps = [];
for (const name of names) {
  if (!BLOCKS[name]) { console.log(`no such block: ${name}`); continue; }
  const rows = [];
  rows.push(await read());
  for (let r = 0; r < ROUNDS; r++) {
    await page.evaluate((src) => { const g = window.game; new Function('g', src)(g); }, BLOCKS[name]);
    // #190: AND THEN LET THE GAME TIDY UP, which is not optional and is where this harness lied to
    // itself three times. Half of what the game frees, it frees on a later frame rather than at the
    // call that removed something: `updateEffects` disposes a popup's material when its timer runs
    // out, and `updateCrowd` reaps a character whose mesh has left the scene and GIVES BACK its tint
    // row -- without which the crowd's row pool never refills and `grow()` reallocates the instance
    // buffers again and again. A block measured the instant it finishes is a block measured before
    // any of that has happened, and every counter it reads is the harness's own mess.
    //
    // So every block gets a second of game time through the real `update` before anything is read.
    // Uniform rather than per block, because the three times this caught me out were three
    // different blocks and the next one will be a fourth.
    await page.evaluate(() => { const g = window.game; for (let t = 0; t < 1; t += 0.05) g.update(0.05); });
    // and a few real frames, so anything still queued is actually uploaded or actually collected
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
    // #190: a leak climbs in most rounds, a step climbs in one -- see `verdict.mjs`, which is where
    // that lives and is pinned by `churn-verdict-tells-a-step-from-a-leak`. A step is not silent
    // either: "it happened once, here" is an answer and a blank line is not.
    const v = verdict(settled);
    const bad = v.kind === 'climb' && k !== 'heapMB';
    const step = v.kind === 'step' && k !== 'heapMB';
    if (bad) anyClimb = true;
    if (step) steps.push(`${name}/${k}`);
    // #190: THE HEAP GETS A MARK OF ITS OWN, because leaving it out of the verdict nearly buried the
    // one thing this sweep found. `heapMB` is excluded from CLIMB on purpose -- it moves a megabyte
    // either way between reads and a red on that would cry wolf every run, which this repo has paid
    // for once already. But `pads` went 79 -> 104 in eight rounds, three a round, every round, and
    // the line printing it said nothing at all while "Every counter flat" was one block away from
    // being the verdict. So a heap climb is MARKED and not counted: a different word, no bearing on
    // the pass, and the control block below it to say whether it belongs to the block or the run.
    const heapy = k === 'heapMB' && v.perRound > 1 && v.climb > 0;
    if (heapy) heapClimbs.push(name);
    const mark = bad ? 'CLIMB ' : step ? 'STEP  ' : heapy ? 'HEAP  ' : '      ';
    const tail = bad || heapy ? `   +${v.perRound.toFixed(1)}/round after the first`
      : step ? `   +${v.climb} in one round of ${v.rounds}, flat either side` : '';
    console.log(`  ${mark}${k.padEnd(11)} ${series.join(' -> ')}${tail}`);
  }
  console.log(`  ${'run'.padEnd(11)} ${rows.map((x) => STATE.map((k) => x[k]).join('/')).join(' -> ')}   (${STATE.join('/')})`);
  console.log('');
}
console.log(anyClimb ? 'Something climbs per block -- see CLIMB above.' : 'Every counter flat after the first round.');
if (steps.length) console.log(`Paid once, not per round: ${steps.join(', ')} -- see STEP above, and the run columns for what the game had just reached.`);
if (heapClimbs.length) console.log(`The JS heap climbs in: ${heapClimbs.join(', ')} -- read each against \`nothing\`, which is the same measurement with no block in it.`);
await browser.close();
srv.close();
