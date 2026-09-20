#!/usr/bin/env node
// Does anything in the village stand on anything else?
//
//     node tools/layout/check.mjs
//
// Every pad is a 3.6 x 3.6 mat on the floor and every structure has a real footprint, and the two
// used to be laid out by eye. That held while the buildings were small. Once they were replaced with
// generated art they roughly doubled -- the Archery Range went from 3.4 x 2.6 to 5.6 x 4.5 -- and
// several of them ended up standing on their neighbour's mat, which is not visible from any one
// camera angle and was found by a player instead.
//
// So the arithmetic is done here rather than in someone's head. Footprints are measured off the
// models; update SIZE when a model is re-baked at a different height, and run this after moving
// anything in PADS or TIERS.
import { PADS, TIERS, MAP, CFG, NODES } from '../../src/config.js';

// #43: width x depth, measured off the built meshes (see props.js / models.js). These moved into
// `CFG.footprint` when the game itself started needing them -- a building can be placed by the
// player now, so the running game has to answer the same "is this spot free" question this script
// does, and two copies of a table measured off meshes is one copy that goes stale.
const SIZE = CFG.footprint;
const PAD = CFG.spend.padSize;   // #43: the game needs this too now, so it lives in config
const FEED = CFG.keep.padOffset;   // matches addFeedPad in game-build.js

const items = [];
for (const d of PADS) {
  // `far` is out on the last plot or past the river: still checked against the roads, but not against
  // the tier 0/1 village it never shares ground with.
  const far = d.tier > 1 || Math.abs(d.pos[0]) >= 40 || Math.abs(d.pos[1]) >= 40;
  items.push({ id: `${d.id}:pad`, t: d.tier, x: d.pos[0], z: d.pos[1], w: PAD, d: PAD, pad: true, far });
  if (d.structure && d.buildAt) {
    const s = SIZE[d.structure] || [3, 3];
    items.push({ id: `${d.id}:bld`, t: d.tier, x: d.buildAt[0], z: d.buildAt[1], w: s[0], d: s[1], kind: d.structure, far });
  }
}
const keep = PADS.find((p) => p.id === 'keep');
items.push({ id: 'feed:pad', t: 0, x: keep.buildAt[0] + FEED[0], z: keep.buildAt[1] + FEED[1], w: PAD, d: PAD, pad: true });

// Two pads can share ground if they are never on the field together. A pad that is not repeatable
// is removed once it is bought, so anything that `requires` it only appears after it has gone --
// which is how the archer pads come to stand where the pad that built their range used to.
const byId = Object.fromEntries(PADS.map((d) => [d.id, d]));
const needs = (id, want, seen = new Set()) => {
  const d = byId[id];
  if (!d || seen.has(id)) return false;
  seen.add(id);
  return (d.requires || []).some((r) => r === want || needs(r, want, seen));
};
const exclusive = (A, B) => (!byId[A]?.repeatable && needs(B, A)) || (!byId[B]?.repeatable && needs(A, B));
// ...but only between two mats. A building outlives the pad that bought it, so nothing may share
// ground with one, however the requires chain reads.
const bothPads = (a, b) => a.endsWith(':pad') && b.endsWith(':pad');

// a pad is meant to sit in front of its own building, and the feed pad replaces the keep pad
const paired = (a, b) => {
  const [A, B] = [a.split(':')[0], b.split(':')[0]];
  return A === B || (A === 'keep' && B === 'feed') || (A === 'feed' && B === 'keep') || (bothPads(a, b) && exclusive(A, B));
};
const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.02 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.02;

// KNOWN AND REASONED IS NOT THE SAME AS CLEAN, and it is not the same as red either.
//
// A finding in here is one somebody has looked at, understood and decided to live with, with the
// reason written down. It is printed separately and does not fail the run -- which is the only state
// a standing exception is worth having (the budgets make the same argument in the README). Anything
// NOT in here is a genuine problem and still turns the run red, so this goes on saying something the
// day a new overlap appears.
//
// The bar for adding a line: the reason has to be a fact about the layout rather than a shrug.
const KNOWN = {
  'barracks:pad': 'the Barracks stands 18.5 from the origin and the citadel ring is 19, so its mat '
    + 'straddles the palisade. There is no spot on the door axis that both clears the building '
    + '(needs z >= 14.98) and stays inside the ring (needs z <= 14.53). The King reaches it -- the '
    + 'mat CENTRE is inside -- so this is the wall drawn across a corner of the mat rather than a '
    + 'mat nobody can use. Fixing it properly means moving the Barracks in, which moves a building '
    + 'in the opening village; that is a decision, not a tidy-up.',
};
const known = [];
const report = (id, line) => {
  if (KNOWN[id]) { known.push({ id, why: KNOWN[id] }); return 0; }
  console.log(line);
  return 1;
};

let bad = 0;
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const a = items[i];
    const b = items[j];
    if (a.far || b.far || paired(a.id, b.id) || !hits(a, b)) continue;
    const ox = ((a.w + b.w) / 2 - Math.abs(a.x - b.x)).toFixed(2);
    const oz = ((a.d + b.d) / 2 - Math.abs(a.z - b.z)).toFixed(2);
    console.log(`OVERLAP  ${a.id.padEnd(20)} x ${b.id.padEnd(20)} by ${ox} x ${oz}`);
    bad++;
  }
}
// The first wall is the citadel: a ring round the castle, which the town is meant to stand outside
// of. What has to contain everything is the settlement wall, so that is what buildings are judged
// against. Corner towers straddle their own wall on purpose.
const TOWN = TIERS.find((t) => !t.ring)?.bounds || TIERS[TIERS.length - 1].bounds;
for (const t of [0, 1]) {
  const B = TOWN;
  for (const it of items.filter((i) => i.t === t && !i.pad && i.kind !== 'tower')) {
    const out = [];
    if (it.x - it.w / 2 < B.x0) out.push('west');
    if (it.x + it.w / 2 > B.x1) out.push('east');
    if (it.z - it.d / 2 < B.z0) out.push('north');
    if (it.z + it.d / 2 > B.z1) out.push('south');
    if (out.length) {
      console.log(`OUTSIDE  ${it.id} crosses the ${out.join(' and ')} wall`);
      bad++;
    }
  }
}
// Nothing stands on a road. The four tracks cross under the castle and run out through the gates,
// and a building or a mat sitting in the sandy shoulder reads as a blockage rather than a village.
// Inside the settlement every road is a straight run along an axis, so the control-point polyline is
// the road exactly; the wandering only starts well outside the walls.
const CLEAR = MAP.roadClear;
const distToSeg = (x, z, a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};
// closest point of a rect to a segment, by walking the segment; roads here are straight so this is tight
const rectToRoad = (it, pts) => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
    for (let k = 0; k <= steps; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / steps;
      const z = a[1] + ((b[1] - a[1]) * k) / steps;
      const cx = Math.max(it.x - it.w / 2, Math.min(x, it.x + it.w / 2));
      const cz = Math.max(it.z - it.d / 2, Math.min(z, it.z + it.d / 2));
      best = Math.min(best, Math.hypot(x - cx, z - cz));
      if (best === 0) return 0;
    }
  }
  return best;
};
// Farmland is checked the same way. It is placed in MAP rather than PADS, and it is the thing most
// likely to creep onto a road or across a wall, because it is the only thing sized in whole plots.
MAP.fields.forEach((f, i) => items.push({ id: `field-${i}:land`, t: 0, x: f.pos[0], z: f.pos[1], w: f.size[0], d: f.size[1], far: true, land: true }));
// A resource node is a thing the King stands next to and swings at, so it needs the same elbow room
// a building does: off the road, and not inside the citadel, which is the castle's ward and not a
// quarry. NODE is the patch it occupies, not the rock itself.
const NODE = 3.0;
NODES.forEach((n, i) => items.push({ id: `${n.type}-${i}:node`, t: 0, x: n.pos[0], z: n.pos[1], w: NODE, d: NODE, far: true, node: true }));

for (const it of items) {
  // The castle is the one thing that may stand on a road: all four meet underneath it -- AND SO DOES
  // ITS MAT, which is the same fact and was reported as a problem on every run for want of a second
  // line. The Keep's door faces +z (#202) and the south road leaves the crossroads along +z, so the
  // mat is on the road by construction: there is no spot on the door's axis that is not. Exempting
  // the building and not the mat left `keep:pad is 0.00 from the south road` printing for ever, and
  // a tool that reports the same two things every time is a tool people stop reading.
  if (it.id === 'keep:bld' || it.id === 'keep:pad') continue;
  for (const road of MAP.roads) {
    const d = rectToRoad(it, road.points);
    if (d >= CLEAR) continue;
    console.log(`ON ROAD  ${it.id.padEnd(20)} is ${d.toFixed(2)} from the ${road.id} road (needs ${CLEAR})`);
    bad++;
  }
}
// Gates line up with roads: a gateway the road misses is a wall the road runs into.
for (const [i, t] of TIERS.entries()) {
  const axes = t.ring
    ? [[t.ring.x + t.ring.r, t.ring.z], [t.ring.x, t.ring.z + t.ring.r], [t.ring.x - t.ring.r, t.ring.z], [t.ring.x, t.ring.z - t.ring.r]]
    : [[t.bounds.x1, 0], [0, t.bounds.z1], [t.bounds.x0, 0], [0, t.bounds.z0]];
  for (const [gx, gz] of axes) {
    const d = Math.min(...MAP.roads.map((r) => Math.min(...r.points.map((p, k, all) => (k ? distToSeg(gx, gz, all[k - 1], p) : Infinity)))));
    if (d > 0.35) {
      console.log(`GATE     tier ${i} gateway at ${gx.toFixed(1)}, ${gz.toFixed(1)} is ${d.toFixed(2)} off the nearest road`);
      bad++;
    }
  }
}
// A field that crosses a wall is ploughed through it. Towers straddle their wall on purpose; nothing
// else should, so every rectangular wall is checked against the farmland.
for (const [ti, t] of TIERS.entries()) {
  if (t.ring) continue;
  const b = t.bounds;
  for (const it of items.filter((i) => i.land)) {
    const inX = it.x - it.w / 2 > b.x0 + 0.02 && it.x + it.w / 2 < b.x1 - 0.02;
    const inZ = it.z - it.d / 2 > b.z0 + 0.02 && it.z + it.d / 2 < b.z1 - 0.02;
    const outX = it.x + it.w / 2 < b.x0 - 0.02 || it.x - it.w / 2 > b.x1 + 0.02;
    const outZ = it.z + it.d / 2 < b.z0 - 0.02 || it.z - it.d / 2 > b.z1 + 0.02;
    if (!((inX && inZ) || outX || outZ)) {
      console.log(`CROSSES  ${it.id.padEnd(20)} is ploughed through the tier ${ti} wall`);
      bad++;
    }
  }
}
// Nothing sits half in and half out of the citadel. A ring wall cuts across a mat that straddles it,
// which reads as a bug rather than as a wall; the mat belongs on one side or the other.
for (const [ti, t] of TIERS.entries()) {
  if (!t.ring) continue;
  const { x: cx, z: cz, r } = t.ring;
  for (const it of items) {
    if (it.kind === 'tower') continue;                       // towers stand on the wall on purpose
    if (it.node && Math.hypot(it.x - cx, it.z - cz) < r) {
      console.log(`INSIDE   ${it.id.padEnd(20)} is inside the tier ${ti} citadel`);
      bad++;
      continue;
    }
    const dx = Math.abs(it.x - cx);
    const dz = Math.abs(it.z - cz);
    const near = Math.hypot(Math.max(0, dx - it.w / 2), Math.max(0, dz - it.d / 2));
    const far = Math.hypot(dx + it.w / 2, dz + it.d / 2);
    if (near < r - 0.02 && far > r + 0.02) {
      bad += report(it.id, `STRADDLE ${it.id.padEnd(20)} sits across the tier ${ti} citadel wall (r ${r})`);
    }
  }
}
console.log(bad ? `\n${bad} problems` : '\nclean: nothing stands on anything else, and every road runs through a gate');
if (known.length) {
  console.log(`\n${known.length} known, and each one says why:`);
  for (const k of known) console.log(`  ${k.id.padEnd(20)} ${k.why}`);
}
process.exit(bad ? 1 : 0);
