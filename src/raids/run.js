// #254: THE RUN. Everything raids mode knows about the run in progress, and nothing it can work out.
//
// The map is not in here: it is `generateRegion(seed, index)`, so the run keeps the seed and the path
// and regenerates regions on demand. What is in here is small, plain and JSON -- the only thing R8
// will save, at the map, between castles, when nothing is in flight.
//
// The functions return a new run rather than changing the one they are given. The director (R3) holds
// one reference and replaces it; a test can keep the old one and compare. Nothing here draws or
// touches `Game`.
import { generateRegion } from './map.js';

export const RUN_VERSION = 1;

export function createRun(seed, start = {}) {
  return {
    v: RUN_VERSION,
    seed: seed >>> 0,
    at: null,                 // the node the King is on, or null before the first ride
    path: [],                 // every node ridden to, in order
    cleared: 0,               // castles cleared (musters are not castles)
    score: 0,
    chest: start.chest || 0,  // the war chest (decision 1: coin is score and this, nothing else)
    // #257 (R4): the allies, `{ id, type, veteran }` (src/raids/allies.js). They last this run only
    // (decision 2): a new run is always built here, so it always starts with nobody.
    roster: start.roster ? [...start.roster] : [],
    nextAlly: 1,
    ability: null,            // #258: the one ability in the third button's slot (src/raids/abilities.js)
    cards: {},                // reward cards taken, by id -- re-applied to every castle after `reset()`
    seen: {},                 // cards shown, taken or not, for `pickOffer`'s rotation (#235)
    wren: false,              // recruited this run (decision 4: an ally, at most once a run)
    wrenOffered: false,       // shown at a muster or a boss reward; she is not offered twice
    wrenLost: false,
  };
}

// Regions are regenerated, not stored, so a cache keeps the map screen and the sim from regenerating
// the same one every call. Keyed by seed and index; it holds what a session has looked at.
const cache = new Map();
export function region(run, index) {
  const key = `${run.seed}:${index}`;
  if (!cache.has(key)) {
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    cache.set(key, generateRegion(run.seed, index));
  }
  return cache.get(key);
}

export function nodeById(run, id) {
  const index = +id.split('.')[0];
  return region(run, index).layers.flat().find((n) => n.id === id) || null;
}

// The nodes the King may ride to next: region 0's starter on a new run, the current node's links, and
// after a boss the whole first layer of the next region.
export function choices(run) {
  if (run.at == null) return region(run, 0).layers[0];
  const here = nodeById(run, run.at);
  if (here.kind === 'boss') return region(run, here.region + 1).layers[0];
  return here.next.map((id) => nodeById(run, id));
}

export function ride(run, id) {
  if (!choices(run).some((n) => n.id === id)) throw new Error(`${id} is not a choice from ${run.at || 'the start'}`);
  return { ...run, at: id, path: [...run.path, id] };
}

// A node played out. `result` is what the castle reported (R3); for R1 it carries score and chest.
export function complete(run, result = {}) {
  const here = nodeById(run, run.at);
  return {
    ...run,
    cleared: run.cleared + (here.kind === 'muster' ? 0 : 1),
    score: run.score + (result.score || 0),
    chest: run.chest + (result.chest || 0),
  };
}

export function serialize(run) {
  return JSON.stringify(run);
}

// A saved run back. Anything that is not a run this build understands is refused rather than half
// loaded: a run whose `at` is not on its own map would put the King on a node that does not exist.
export function parse(text) {
  const r = JSON.parse(text);
  if (!r || r.v !== RUN_VERSION) throw new Error(`not a v${RUN_VERSION} run`);
  if (typeof r.seed !== 'number' || !Array.isArray(r.path)) throw new Error('not a run');
  if (r.at != null && !nodeById(r, r.at)) throw new Error(`${r.at} is not on this run's map`);
  if (r.at != null && r.path[r.path.length - 1] !== r.at) throw new Error('the path does not end where the King is');
  return r;
}
