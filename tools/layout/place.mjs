#!/usr/bin/env node
// Suggests positions for everything in the village.
//
//     node tools/layout/place.mjs
//
// check.mjs says whether a layout is legal. This says where to put things so it will be, which is
// the part that was being done by hand and taking a dozen rounds. It is a solver, not the source of
// truth: it prints coordinates to paste into config.js, and check.mjs still has the last word.
//
// The rules it places against are the ones the village has to obey anyway: nothing inside a road's
// shoulder, nothing overlapping anything else, nothing straddling the citadel wall, everything
// inside the wall it belongs to, and every pad within reach of the building it belongs to.
import { MAP, TIERS, PADS } from '../../src/config.js';

const SIZE = { bank: [3.46, 3.46], barracks: [7.68, 7.96], hut: [5.58, 4.49], keep: [6.02, 5.38], tower: [2.50, 3.32], house: [4.03, 3.71] };
const PAD = 3.6;
const CLEAR = MAP.roadClear;
const RING = TIERS.find((t) => t.ring).ring;
const T1 = TIERS[1].bounds;

const placed = [];
const rect = (x, z, w, d) => ({ x, z, w, d });
const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 0.25 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 0.25;
const onRoad = (r, extra = 0) => MAP.roads.some((road) => road.points.some((p, i, all) => {
  if (!i) return false;
  const [a, b] = [all[i - 1], p];
  const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3));
  for (let k = 0; k <= steps; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / steps;
    const z = a[1] + ((b[1] - a[1]) * k) / steps;
    const cx = Math.max(r.x - r.w / 2, Math.min(x, r.x + r.w / 2));
    const cz = Math.max(r.z - r.d / 2, Math.min(z, r.z + r.d / 2));
    if (Math.hypot(x - cx, z - cz) < CLEAR + extra) return true;
  }
  return false;
}));
const corners = (r) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => Math.hypot(r.x + (sx * r.w) / 2, r.z + (sz * r.d) / 2));
const inCitadel = (r) => Math.max(...corners(r)) <= RING.r - 0.4;
const outCitadel = (r) => Math.min(...corners(r)) >= RING.r + 0.4;
const inBox = (r, b) => r.x - r.w / 2 > b.x0 + 0.4 && r.x + r.w / 2 < b.x1 - 0.4 && r.z - r.d / 2 > b.z0 + 0.4 && r.z + r.d / 2 < b.z1 - 0.4;

// Quadrant preference as a unit direction; the solver walks outward from the middle of that quarter.
const QUAD = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

function solve(id, w, d, opts) {
  const [qx, qz] = QUAD[opts.quad];
  let best = null;
  for (let x = 2; x <= 44; x += 0.2) {
    for (let z = 2; z <= 44; z += 0.2) {
      const r = rect(+(x * qx).toFixed(1), +(z * qz).toFixed(1), w, d);
      if (onRoad(r, opts.margin || 0)) continue;
      if (opts.inside && !inCitadel(r)) continue;
      if (opts.outside && !outCitadel(r)) continue;
      if (opts.box && !inBox(r, opts.box)) continue;
      if (placed.some((p) => p.id !== opts.pairWith && hits(r, p))) continue;
      // A pad wants to be at its building's door. A building wants the middle of its quarter, so it
      // sits in open ground rather than shoved up against the castle with its back to the road.
      const a = opts.anchor || (opts.mid ? { x: (RING.r * 0.52 * qx), z: (RING.r * 0.52 * qz) } : null);
      const cost = a ? Math.hypot(r.x - a.x, r.z - a.z) : Math.hypot(r.x, r.z);
      if (opts.maxDist && cost > opts.maxDist) continue;
      if (!best || cost < best.cost) best = { ...r, id, cost };
    }
  }
  if (!best) { console.log(`  !! no room for ${id}`); return null; }
  placed.push(best);
  return best;
}

const say = (b) => b && console.log(`  ${b.id.padEnd(22)} [${b.x}, ${b.z}]`);

// A citadel tower stands on the ring, but where on it is the solver's business: the buildings want
// the diagonals as much as the towers do, so the tower takes the first angle in its quarter that
// leaves room for the mat that builds it.
function tower(name, quad) {
  const [qx, qz] = QUAD[quad];
  const mid = Math.atan2(qz, qx);
  for (const spread of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.5, -0.5, 0.62, -0.62]) {
    const a = mid + spread;
    const b = rect(+(Math.cos(a) * RING.r).toFixed(2), +(Math.sin(a) * RING.r).toFixed(2), ...SIZE.tower);
    if (onRoad(b, 0.6) || placed.some((p) => hits(b, p))) continue;
    placed.push({ ...b, id: `tower-0-${name}:bld` });
    // the mat that builds a tower belongs beside it, not across the quarter
    const pad = solve(`tower-0-${name}:pad`, PAD, PAD, { quad, inside: true, margin: 0.4, anchor: b, maxDist: 7 });
    if (pad) return [{ ...b, id: `tower-0-${name}:bld` }, pad];
    placed.pop();
  }
  return [null, null];
}

// Ids this run works out for itself. Everything else in PADS is seeded where config already puts it,
// so the solver has to fit around the wall mats, the outer towers and anything else it is not moving
// -- which is how a home ended up under the north wall's mat the first time this ran.
const SOLVING = new Set(['range', 'barracks', 'exchange', 'keep', 'feed', 'train', 'recruit', 'recruit-sword', 'palisade', 'crew-gates1', 'expand1', 'stable', 'crown', 'expand2', 'crew-gates2', 'tower-0-ne', 'tower-0-nw', 'tower-0-se', 'tower-0-sw', 'home-1', 'home-2', 'home-3', 'home-4', 'home-5', 'home-6']);

function run(quiet) {
  placed.length = 0;
  const out = [];
  const log = (b) => { out.push(b); if (!quiet) say(b); };
  for (const d of PADS) {
    if (SOLVING.has(d.id)) continue;
    placed.push({ id: `${d.id}:pad`, x: d.pos[0], z: d.pos[1], w: PAD, d: PAD });
    if (d.structure && d.buildAt) placed.push({ id: `${d.id}:bld`, x: d.buildAt[0], z: d.buildAt[1], ...({ w: (SIZE[d.structure] || [3, 3])[0], d: (SIZE[d.structure] || [3, 3])[1] }) });
  }
  placed.push({ id: 'keep:bld', x: 0, z: 0, w: SIZE.keep[0], d: SIZE.keep[1] });
  const B = { inside: true, mid: true, margin: 1.0 };
  const range = solve('range:bld', ...SIZE.hut, { quad: 'nw', ...B });
  const barracks = solve('barracks:bld', ...SIZE.barracks, { quad: 'se', ...B });
  const bank = solve('exchange:bld', ...SIZE.bank, { quad: 'ne', ...B });
  [range, barracks, bank].forEach(log);
  // towers next: they are pinned to the ring, so they have the least room to give
  for (const [n, q] of [['se', 'se'], ['nw', 'nw'], ['ne', 'ne'], ['sw', 'sw']]) tower(n, q).forEach(log);
  log(solve('keep:pad', PAD, PAD, { quad: 'sw', inside: true, margin: 0.4, anchor: { x: 0, z: 0 } }));
  log(solve('range:pad', PAD, PAD, { quad: 'nw', inside: true, margin: 0.4, anchor: range }));
  log(solve('train:pad', PAD, PAD, { quad: 'nw', inside: true, margin: 0.4, anchor: range }));
  log(solve('barracks:pad', PAD, PAD, { quad: 'se', inside: true, margin: 0.4, anchor: barracks }));
  log(solve('exchange:pad', PAD, PAD, { quad: 'ne', inside: true, margin: 0.4, anchor: bank }));
  log(solve('palisade:pad', PAD, PAD, { quad: 'sw', inside: true, margin: 0.4 }));
  log(solve('crew-gates1:pad', PAD, PAD, { quad: 'ne', inside: true, margin: 0.4 }));
  const townPads = [['expand1:pad', 'sw'], ['stable:pad', 'sw'], ['crown:pad', 'nw'], ['expand2:pad', 'se'], ['crew-gates2:pad', 'se']];
  if (!quiet) console.log('\nbetween the citadel and the town wall:');
  for (const [id, q] of townPads) log(solve(id, PAD, PAD, { quad: q, outside: true, box: T1, margin: 0.4 }));
  // Villager homes: a quarter of their own down the east side, each with its own mat in front. The
  // farmland has the west strip, so the houses take the other one and the roads keep them apart.
  if (!quiet) console.log('\nvillager homes:');
  let prev = null;
  for (let i = 1; i <= 6; i++) {
    const q = i <= 3 ? 'se' : 'ne';
    // each house settles beside the last, so the quarter grows outward from one street corner
    const h = solve(`home-${i}:bld`, ...SIZE.house, { quad: q, outside: true, box: T1, margin: 0.8, anchor: prev });
    log(h);
    log(solve(`home-${i}:pad`, PAD, PAD, { quad: q, outside: true, box: T1, margin: 0.4, anchor: h, maxDist: 6.5 }));
    prev = h && i !== 3 ? h : null;
  }
  return out;
}

if (process.argv.includes('--sweep')) {
  for (let r = 17; r <= 26; r++) {
    RING.r = r;
    const out = run(true);
    console.log(`r=${String(r).padStart(2)}  placed ${out.filter(Boolean).length}/${out.length}` + (out.some((b) => !b) ? '  <- incomplete' : '  ok'));
  }
} else {
  console.log(`citadel r=${RING.r}, town ${T1.x0}..${T1.x1} x ${T1.z0}..${T1.z1}\n`);
  console.log('inside the citadel:');
  run(false);
}
