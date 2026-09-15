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
import { PADS, TIERS } from '../../src/config.js';

// width x depth, measured off the built meshes (see props.js / models.js)
const SIZE = { bank: [3.46, 3.46], barracks: [7.68, 7.96], hut: [5.58, 4.49], keep: [6.02, 5.38], tower: [2.50, 3.32] };
const PAD = 3.6;
const FEED_OFFSET = 5.0;   // matches addFeedPad in game-build.js

const items = [];
for (const d of PADS) {
  if (d.tier > 1) continue;                                  // tier 2 is out on the far plots
  if (Math.abs(d.pos[0]) < 40 && Math.abs(d.pos[1]) < 40) {
    items.push({ id: `${d.id}:pad`, t: d.tier, x: d.pos[0], z: d.pos[1], w: PAD, d: PAD, pad: true });
  }
  if (d.structure && d.buildAt) {
    const s = SIZE[d.structure] || [3, 3];
    items.push({ id: `${d.id}:bld`, t: d.tier, x: d.buildAt[0], z: d.buildAt[1], w: s[0], d: s[1], kind: d.structure });
  }
}
const keep = PADS.find((p) => p.id === 'keep');
items.push({ id: 'feed:pad', t: 0, x: keep.buildAt[0], z: keep.buildAt[1] + FEED_OFFSET, w: PAD, d: PAD, pad: true });

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

// a pad is meant to sit in front of its own building, and the feed pad replaces the keep pad
const paired = (a, b) => {
  const [A, B] = [a.split(':')[0], b.split(':')[0]];
  return A === B || (A === 'keep' && B === 'feed') || (A === 'feed' && B === 'keep') || exclusive(A, B);
};
const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.02 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.02;

let bad = 0;
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const a = items[i];
    const b = items[j];
    if (paired(a.id, b.id) || !hits(a, b)) continue;
    const ox = ((a.w + b.w) / 2 - Math.abs(a.x - b.x)).toFixed(2);
    const oz = ((a.d + b.d) / 2 - Math.abs(a.z - b.z)).toFixed(2);
    console.log(`OVERLAP  ${a.id.padEnd(20)} x ${b.id.padEnd(20)} by ${ox} x ${oz}`);
    bad++;
  }
}
// corner towers straddle the wall on purpose; nothing else may cross it
for (const t of [0, 1]) {
  const B = TIERS[t].bounds;
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
console.log(bad ? `\n${bad} problems` : '\nclean: nothing stands on anything else');
process.exit(bad ? 1 : 0);
