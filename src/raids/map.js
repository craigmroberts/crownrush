// #254: THE OVERWORLD MAP, AS DATA. A run is a chain of regions; a region is five castle layers and a
// boss (the owner's decision 3). Each fork layer holds 2-3 nodes and each node leads on to 1-2 in the
// next (the starter castle, a layer of one, leads to all of them), so every step of the map is a choice. Region 1 opens on a single fixed starter castle
// (decision 5); every later layer is a fork.
//
// Pure and seeded: `generateRegion(runSeed, index)` always returns the same region, so the run never
// stores the map -- it stores the seed and the path, and regenerates. That is what keeps an endless
// map at constant memory, and it is what lets `tools/raids/sim.mjs` walk two thousand of them.
//
// THE FIVE RULES a region is held to (spec section 4), checked here so a bad draw is re-rolled, and
// checked again independently by the free check `raids-map-rules`:
//   1. every fork layer is a real fork: at least one node safer and one riskier than another
//   2. a muster is reachable somewhere in the region, and no layer is musters only, so none is forced
//   3. no path through the castle layers is all fortresses, and none is all musters
//   4. every node is reachable, and the boss is reachable from every node
//   5. region index 0 opens on exactly one node, the starter castle
import { CFG } from '../config.js';
import { makeRng, mix } from './rand.js';
import { difficulty, multiplier } from './curve.js';

// How risky a node reads on the map. Kind first, then modifiers: a muster is always the safe choice,
// a fortress the risky one, and a modifier nudges a node up within its kind.
export function riskOf(node) {
  const base = { muster: 0, castle: 1, fortress: 2, boss: 3 }[node.kind];
  return base + 0.5 * node.modifiers.length;
}

const REWARDS = {
  castle: { allies: 0.45, card: 0.3, chest: 0.25 },
  fortress: { allies: 0.5, card: 0.5 },
};

function makeNode(rng, region, layer, lane, kind, starter = false) {
  const R = CFG.raids;
  const mods = [];
  if (kind === 'fortress') mods.push(rng.pick(R.modifiers));
  else if (kind === 'castle' && region > 0 && rng() < R.modifierChance) mods.push(rng.pick(R.modifiers));
  if (kind === 'fortress' && region > 1 && rng() < R.modifierChance) {
    const second = rng.pick(R.modifiers.filter((m) => m !== mods[0]));
    mods.push(second);
  }
  const reward = starter ? 'allies' : kind === 'muster' ? 'shop' : kind === 'boss' ? 'ability' : rng.weighted(REWARDS[kind]);
  return {
    id: `${region}.${layer}.${lane}`,
    region, layer, lane, kind, starter,
    modifiers: mods,
    difficulty: +difficulty(region, layer, kind, mods).toFixed(3),
    multiplier: +multiplier(kind, mods).toFixed(3),
    reward,
    next: [],
  };
}

export function draw(rng, index) {
  const R = CFG.raids;
  const layers = [];
  for (let L = 0; L < R.castleLayers; L++) {
    if (index === 0 && L === 0) { layers.push([makeNode(rng, index, 0, 0, 'castle', true)]); continue; }
    const n = rng.int(R.width[0], R.width[1]);
    const kinds = [];
    for (let i = 0; i < n; i++) kinds.push(rng.weighted(R.kinds));
    // Repaired here rather than re-rolled: measured on 4,800 raw draws, 63% put two nodes of the same
    // kind side by side and 6% drew a layer of musters only, so re-rolling threw away most regions.
    // A layer of one kind gets its last node changed; a layer of musters gets a castle.
    if (kinds.every((k) => k === 'muster')) kinds[n - 1] = 'castle';
    if (kinds.every((k) => k === kinds[0])) kinds[n - 1] = kinds[0] === 'fortress' ? 'castle' : rng() < 0.7 ? 'fortress' : 'muster';
    layers.push(kinds.map((k, i) => makeNode(rng, index, L, i, k)));
  }
  // A muster somewhere on the map: 16% of raw draws had none. The castle turned into one is in a fork
  // layer that keeps another node that is not a muster, so the layer stays a fork and is not forced.
  if (!layers.flat().some((node) => node.kind === 'muster')) {
    const spots = layers.slice(1, R.castleLayers).flat().filter((node) => node.kind === 'castle');
    if (spots.length) {
      const pick = rng.pick(spots);
      layers[pick.layer][pick.lane] = makeNode(rng, index, pick.layer, pick.lane, 'muster');
    }
  }
  layers.push([makeNode(rng, index, R.castleLayers, 0, 'boss')]);
  // Links. Nodes sit at evenly spaced positions across their layer, and each links to the node in the
  // next layer nearest below it, and sometimes to a neighbour of that one: paths fan out and cross
  // over without spaghetti, which is what the drawn map (R2) needs to stay legible on a phone.
  for (let L = 0; L < layers.length - 1; L++) {
    const a = layers[L];
    const b = layers[L + 1];
    const pos = (i, n) => (i + 0.5) / n;
    // A layer of one -- the starter castle -- opens onto every node after it. The fork after the
    // starter is the first choice a new player makes, and with the usual two links a three-node layer
    // always stranded one node: 12.8% of draws, every one of them in region 0.
    if (a.length === 1) { a[0].next = b.map((t) => t.id); continue; }
    for (const node of a) {
      const p = pos(node.lane, a.length);
      let best = 0;
      for (let j = 1; j < b.length; j++) if (Math.abs(pos(j, b.length) - p) < Math.abs(pos(best, b.length) - p)) best = j;
      node.next.push(b[best].id);
      if (b.length > 1 && rng() < 0.5) {
        const side = best === 0 ? 1 : best === b.length - 1 ? best - 1 : (rng() < 0.5 ? best - 1 : best + 1);
        if (!node.next.includes(b[side].id)) node.next.push(b[side].id);
      }
    }
    // No orphans: a node nothing leads to gets a link from above. The nearest node with room takes it;
    // if every node above already has two links, the nearest gives up a link whose target has another
    // way in. The first version simply overwrote the nearest node's second link, which orphaned
    // whatever that link had led to -- 13% of raw draws had an unreachable node, all from here.
    const incoming = (id) => a.filter((n) => n.next.includes(id)).length;
    for (const t of b) {
      if (incoming(t.id)) continue;
      const p = pos(t.lane, b.length);
      const near = [...a].sort((x, y) => Math.abs(pos(x.lane, a.length) - p) - Math.abs(pos(y.lane, a.length) - p));
      const roomy = near.find((n) => n.next.length < 2);
      if (roomy) { roomy.next.push(t.id); continue; }
      for (const n of near) {
        const k = n.next.findIndex((id) => incoming(id) > 1);
        if (k >= 0) { n.next[k] = t.id; break; }
      }
    }
  }
  return layers;
}

// Every path through the castle layers, as lists of nodes. At most 3^5 = 243, so enumerating is fine.
export function castlePaths(region) {
  const byId = new Map(region.layers.flat().map((n) => [n.id, n]));
  const out = [];
  const walk = (node, acc) => {
    const path = [...acc, node];
    if (node.layer === CFG.raids.castleLayers - 1) { out.push(path); return; }
    for (const id of node.next) walk(byId.get(id), path);
  };
  for (const start of region.layers[0]) walk(start, []);
  return out;
}

// What is wrong with a region, as sentences; an empty list is a region that keeps all five rules.
export function regionProblems(region) {
  const R = CFG.raids;
  const bad = [];
  const layers = region.layers;
  const all = layers.flat();
  const byId = new Map(all.map((n) => [n.id, n]));
  // 5: the starter
  if (region.index === 0 && (layers[0].length !== 1 || !layers[0][0].starter)) bad.push('region 0 does not open on one starter castle');
  // 1: forks
  for (const row of layers.slice(0, R.castleLayers)) {
    if (row.length < 2) continue;
    const risks = new Set(row.map(riskOf));
    if (risks.size < 2) bad.push(`layer ${row[0].layer} offers ${row.length} nodes of the same risk`);
    if (row.every((n) => n.kind === 'muster')) bad.push(`layer ${row[0].layer} is musters only`);
  }
  // 4: reachability, both ways
  const reach = new Set(layers[0].map((n) => n.id));
  for (const row of layers) for (const n of row) if (reach.has(n.id)) for (const id of n.next) reach.add(id);
  for (const n of all) if (!reach.has(n.id)) bad.push(`${n.id} cannot be reached`);
  const boss = layers[layers.length - 1][0];
  const toBoss = new Set([boss.id]);
  for (let L = layers.length - 2; L >= 0; L--) for (const n of layers[L]) if (n.next.some((id) => toBoss.has(id))) toBoss.add(n.id);
  for (const n of all) if (!toBoss.has(n.id)) bad.push(`the boss cannot be reached from ${n.id}`);
  for (const n of all) for (const id of n.next) if (!byId.has(id)) bad.push(`${n.id} links to ${id}, which is not in the region`);
  // 2 and 3: over the paths
  const paths = castlePaths(region);
  if (!paths.some((p) => p.some((n) => n.kind === 'muster'))) bad.push('no path reaches a muster');
  if (paths.some((p) => p.every((n) => n.kind === 'fortress'))) bad.push('a path is fortresses only');
  if (paths.some((p) => p.every((n) => n.kind === 'muster'))) bad.push('a path is musters only');
  return bad;
}

// Draw until the region keeps every rule. Each attempt is its own seed, so the result is still a pure
// function of (runSeed, index); `attempts` is kept on the region so the sim can report how often a
// draw is thrown away, which is what says whether the kind weights are fighting the rules.
export function generateRegion(runSeed, index) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = mix(mix(runSeed, index), attempt);
    const region = { index, seed, attempts: attempt + 1, layers: draw(makeRng(seed), index) };
    if (!regionProblems(region).length) return region;
  }
  throw new Error(`no legal region ${index} for run seed ${runSeed} in 200 draws`);
}

// What the map card says about a node (R2 draws it). Words, not numbers, where a word will do.
export function nodePreview(node) {
  const title = node.starter ? 'Starter castle' : { castle: 'Castle', fortress: 'Fortress', muster: 'Muster', boss: 'Boss' }[node.kind];
  const reward = { allies: 'Recruits', card: 'A reward card', chest: 'Coin for the war chest', shop: 'Spend the war chest', ability: 'A new ability' }[node.reward];
  return { title, modifiers: node.modifiers, multiplier: node.multiplier, reward };
}
