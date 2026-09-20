#!/usr/bin/env node
// #219: THE SEED SWEEP -- is every map this game can roll actually playable?
//
// The hinterland is generated per map now: where the wood, straw, stone, iron and diamond sit is the
// seed's business, and the village, the walls, the roads, the river and the bridges are not. The
// ticket's own words for what that has to guarantee: "A seed that produces an unplayable map must be
// impossible, not unlikely."
//
// Impossible is a claim about every seed, so it is checked on a lot of them rather than argued about.
// Each map is built in a real browser -- the generator runs inside `buildWorld` and reads the roads,
// the river samples and the pads it has actually laid, so there is nothing to re-derive out here and
// nothing that can drift from the real thing -- and then every node it made is held to the list:
//
//   * outside the cliff box, the ground the King is pushed out of and cannot mine in
//   * out of the river
//   * out of the citadel, and clear of the mats, for the ones this seed GENERATED (the hand-placed
//     wood overlaps the `crown` mat and always has, so holding a fallback to that rule is a false red)
//   * six wood inside 28 and a stone inside 32, which is what an opening needs to be an opening
//   * every diamond on the far bank
//
//     node tools/seeds/seeds.mjs                 # the ten fixed seeds
//     SEEDN=40 node tools/seeds/seeds.mjs        # forty spread across the range
//
// FELLBACK on a line names a material that could not satisfy its band and kept its hand-placed nodes.
// That is the generator's designed floor rather than a failure -- the worst a seed can do is give you
// the map the game has always had -- but it is printed because a fallback nobody can see is a
// fallback that quietly becomes the normal case. It was seven seeds in ten once (see NODE_BANDS).
//
// Run it after anything that moves a band, a pad, a road or the river.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8111);
// Ten by default: enough to catch a band that cannot be satisfied, fast enough to run after a tweak.
// A cold load under SwiftShader is about twenty seconds, so forty is a fifteen-minute sweep.
const SEEDS = process.env.SEEDN
  ? Array.from({ length: +process.env.SEEDN }, (_, i) => (i * 7919) % 100000)
  : [0, 1, 2, 3, 7, 42, 99, 1337, 60001, 123456];

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
};
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(DIST, normalize(p)));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch (e) {
    res.writeHead(404);
    res.end('no');
  }
});
await new Promise((r) => srv.listen(PORT, r));

const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

let bad = 0;
for (const seed of SEEDS) {
  const page = await br.newPage({ viewport: { width: 600, height: 480 } });
  page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));
  // `?tour` holds the opening morning open, so the world is built and nothing is coming for it. The
  // timeouts are 200s because a cold load here really does take twenty seconds and a false red on a
  // sweep this size is worse than a slow one (see CLAUDE.md).
  await page.goto(`http://localhost:${PORT}/?tour&seed=${seed}`, { waitUntil: 'load', timeout: 200000 });
  await page.waitForFunction(() => window.game && window.game.world && window.game.nodes, null, { timeout: 200000 });
  const r = await page.evaluate((sd) => {
    const g = window.game;
    const W = g.world;
    const C = window.CFG;
    const byType = {};
    for (const n of g.nodes) (byType[n.type] = byType[n.type] || []).push(n);
    const home = W.riverInfo(0, 8).side;
    const fails = [];
    for (const [t, list] of Object.entries(byType)) {
      for (const n of list) {
        // `n.pos` is a Vector3, not the [x, z] pair in `NODES`. Reading it as an array gave undefined
        // on both axes, every distance came out NaN, and ten seeds in ten reported a constraint broken
        // that none of them had broken. Named here because the next person will reach for `n.pos[0]`.
        const x = n.pos.x;
        const z = n.pos.z;
        if (x < C.cliffs.x && z < C.cliffs.z) fails.push(`${t} inside the cliff box at ${x.toFixed(1)},${z.toFixed(1)}`);
        if (W.riverInfo(x, z).dist < 4) fails.push(`${t} in the river at ${x.toFixed(1)},${z.toFixed(1)}`);
        // NOT the village box -- wood is meant to be a few steps from the gate and the shipped nodes
        // sit inside it. What a node must dodge is the citadel (the ring of radius 19 at the origin
        // that the Keep and the service buildings stand in) and the mats the player has to tap. 3.7 is
        // the mat's half of 1.8 plus the widest node's own half-extent of 1.93, measured off the real
        // meshes -- the first distance at which no part of a seam is over the lettering.
        if (Math.hypot(x, z) < 21) fails.push(`${t} in the citadel at ${x.toFixed(1)},${z.toFixed(1)}`);
        if (W.seededNodes && W.seededNodes[t]
          && window.PADS.some((p) => Math.abs(p.pos[0] - x) < 3.7 && Math.abs(p.pos[1] - z) < 3.7)) {
          fails.push(`${t} on a pad at ${x.toFixed(1)},${z.toFixed(1)}`);
        }
      }
    }
    // the two that keep an opening an opening: an axe-trip and a first quarry inside the walk the
    // hand-placed map asks for. Measured off it -- seven wood within 28, one stone within 32.
    const d = (n) => Math.hypot(n.pos.x, n.pos.z);
    const woodNear = (byType.wood || []).filter((n) => d(n) <= 28).length;
    const stoneNear = (byType.stone || []).filter((n) => d(n) <= 32).length;
    if (woodNear < 6) fails.push(`only ${woodNear} wood within 28`);
    if (stoneNear < 1) fails.push('no stone within 32');
    // and the one that is a rule about the STORY: the deep rock is across the water, so reaching it
    // costs a bridge. A diamond on the home bank is a level-up the player was not meant to have yet.
    const wrongSide = (byType.diamond || []).filter((n) => W.riverInfo(n.pos.x, n.pos.z).side === home).length;
    if (wrongSide) fails.push(`${wrongSide} diamond on the home bank`);
    const stock = {};
    for (const [t, l] of Object.entries(byType)) stock[t] = l.reduce((a, n) => a + n.stock, 0);
    const fell = Object.entries(W.seededNodes || {}).filter(([, v]) => !v).map(([k]) => k);
    return {
      counts: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
      stock, woodNear, fell, fails, seed: sd,
    };
  }, seed);
  if (r.fails.length) bad++;
  console.log(`seed ${String(seed).padEnd(7)} ${JSON.stringify(r.counts)} stock ${JSON.stringify(r.stock)}`
    + ` woodNear=${r.woodNear}${r.fell.length ? ` FELLBACK=${r.fell.join(',')}` : ''}`
    + (r.fails.length ? `\n   FAIL ${r.fails.join('; ')}` : '  ok'));
  await page.close();
}
console.log(bad ? `${bad} of ${SEEDS.length} seeds broke a constraint` : `all ${SEEDS.length} seeds legal`);
await br.close();
srv.close();
process.exit(bad ? 1 : 0);
