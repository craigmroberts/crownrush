// #254: HOW HARD A NODE IS, HOW LONG IT TAKES, AND (FOR NOW) HOW OFTEN IT KILLS YOU.
//
// Pure: numbers in, numbers out, every constant from `CFG.raids`. The map uses the first two to label
// nodes; the sim uses all three to play runs. R7 replaces the survival model with one fitted to real
// castles -- until then it is a placeholder, and the sim says so every time it prints.
import { CFG } from '../config.js';

// The region's base strength: hand-set for the first three, then a steady growth. Region index is
// 0-based here; the spec's "region 1" is index 0.
export function regionBase(region) {
  const C = CFG.raids.curve;
  const last = C.base.length - 1;
  return region <= last ? C.base[region] : C.base[last] * Math.pow(C.growth, region - last);
}

// D(n) for one node. A sawtooth: it climbs through a region's layers, the boss is the top, and the
// first castle after a boss drops back (`relief`) so a region opens on a breath rather than a wall.
export function difficulty(region, layer, kind, modifiers = []) {
  const C = CFG.raids.curve;
  if (kind === 'muster') return 0;
  let d = regionBase(region) * (1 + C.layerStep * layer);
  if (region > 0 && layer === 0) d *= C.relief;
  if (kind === 'fortress') d *= C.fortress;
  if (kind === 'boss') d *= C.boss;
  return d * Math.pow(C.modifier, modifiers.length);
}

export function multiplier(kind, modifiers = []) {
  const M = CFG.raids.multiplier;
  return (M[kind] || 0) * Math.pow(M.modifier, modifiers.length);
}

// Seconds a node takes to play, drawn from its range. Region 1's castles are short on purpose: see the
// note on `CFG.raids.seconds`.
export function nodeSeconds(node, rng) {
  const S = CFG.raids.seconds;
  if (node.kind === 'muster') return S.muster;
  if (node.kind === 'boss') return rng.range(S.boss);
  if (node.starter) return rng.range(S.starter);
  const base = rng.range(node.region === 0 ? S.region1 : S.later);
  return node.kind === 'fortress' ? base * S.fortress : base;
}

// PLACEHOLDER: the chance the King falls in a castle of strength `d` with roster power `p`.
export function rosterPower(allies) {
  return 1 + CFG.raids.survival.allyValue * allies;
}
export function fallChance(d, p) {
  const S = CFG.raids.survival;
  if (d <= 0) return 0;
  return Math.max(S.floor, Math.min(S.ceil, S.base * Math.exp(S.slope * (d / p - 1))));
}
