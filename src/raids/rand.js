// #254: a seeded random stream, and a way to derive one seed from two. Raids mode is a pure function
// of its seed -- the map a player is shown, the castles in it, what the sim plays -- so every roll
// comes from here and none from Math.random. The generator is the same LCG `world.js` uses for the
// terrain; it is plenty for choosing map nodes and it keeps one kind of randomness in the repo.
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.range = ([lo, hi]) => lo + next() * (hi - lo);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.weighted = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = next() * total;
    for (const [k, w] of entries) if ((r -= w) < 0) return k;
    return entries[entries.length - 1][0];
  };
  return next;
}

// Two numbers into one seed, well mixed, so region 3 of run 42 is unrelated to region 4 of run 42 and
// to region 3 of run 43. (A murmur-style finaliser: cheap, and neighbouring inputs land far apart.)
export function mix(a, b) {
  let h = (Math.imul(a >>> 0, 0x9e3779b1) ^ Math.imul((b >>> 0) + 0x7f4a7c15, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
