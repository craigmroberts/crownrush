// #257 (R4): THE ROSTER. Who the King has brought this far, as data: earned by clearing castles,
// bought at musters, taken into a castle eight at a time, and lost for good when one of them falls
// there (decision 2). A new run starts with nobody; only the legacy tree carries between runs.
//
// Pure, like the rest of src/raids/: every function takes a run and returns a new one, and nothing
// here draws or touches `Game`. The castle reports who fell and the director calls `lose`; the free
// check `raids-roster-rules` plays whole runs through these functions without a browser.
//
// Wren is a unit of type 'wren' in the same list (decision 4). She counts against the cap and against
// the eight like anybody else, and falls the same way -- which is one rule instead of a second one
// that could drift from it. What is special about her is only when she is on offer: once a run, at the
// first muster or boss reward that reaches her, and not again whatever the answer was.
import { CFG } from '../config.js';
import { makeRng, mix } from './rand.js';

export const ALLY_TYPES = ['swordsman', 'archer'];

// The men a clear earns before the reward screen's choice: 2-4, more for a clean, quick castle.
export function recruitsFor(result, spec) {
  const A = CFG.raids.allies;
  const last = spec.raids.length ? spec.raids[spec.raids.length - 1].at : 0;
  let n = A.earn[0];
  if (result.wallsIntact >= A.intactAt) n++;
  if (result.seconds <= last + A.fastAfter) n++;
  n = Math.min(A.earn[1], n);
  if (spec.kind === 'fortress') n += A.fortress;
  return n;
}

// Room left under the cap.
export function room(run) {
  return Math.max(0, CFG.raids.allies.cap - run.roster.length);
}

function add(run, types) {
  const roster = [...run.roster];
  let next = run.nextAlly || 1;
  const added = [];
  for (const type of types) {
    if (roster.length >= CFG.raids.allies.cap) break;
    const u = { id: next++, type, veteran: false };
    roster.push(u);
    added.push(u);
  }
  return { run: { ...run, roster, nextAlly: next }, added };
}

// `n` recruits of the usual mix. The types come off the run's seed and the size of the roster so far,
// so the same run earns the same men, and a check can say what it expects.
export function recruit(run, n) {
  const rng = makeRng(mix(run.seed, 7000 + (run.nextAlly || 1)));
  const types = [];
  for (let i = 0; i < n; i++) types.push(rng.weighted(CFG.raids.allies.mix));
  return add(run, types);
}

export function price(type) {
  return CFG.raids.allies.price[type];
}

// What the muster sells, and whether this run can have it now. `why` is the line the button shows
// when the answer is no, so the rule and its explanation are one place.
export function canBuy(run, type) {
  const cost = price(type);
  if (cost == null) return { ok: false, why: 'Not for sale' };
  if (type === 'wren' && !wrenOnOffer(run)) return { ok: false, why: run.wren ? 'She rides with you' : 'She has gone her own way' };
  if (type !== 'card' && !room(run)) return { ok: false, why: `The roster is full at ${CFG.raids.allies.cap}` };
  if (run.chest < cost) return { ok: false, why: `${cost - run.chest} more coin` };
  return { ok: true, why: '' };
}

// A purchase: a man, or Wren. A card is bought through `takeCard` after the chest is paid, because
// which card is the player's choice and not this function's.
export function buy(run, type) {
  const c = canBuy(run, type);
  if (!c.ok) throw new Error(`cannot buy ${type}: ${c.why}`);
  const paid = { ...run, chest: run.chest - price(type) };
  if (type === 'wren') return recruitWren(paid);
  return add(paid, [type]).run;
}

export function pay(run, amount) {
  if (run.chest < amount) throw new Error(`the chest holds ${run.chest}, not ${amount}`);
  return { ...run, chest: run.chest - amount };
}

// ---- Wren ----

// On offer until she has been offered once. Asked by the muster and the boss reward; `offerWren` is
// called when either actually shows her, so walking past a muster without opening it costs nothing.
export function wrenOnOffer(run) {
  return !run.wren && !run.wrenOffered;
}

export function offerWren(run) {
  return run.wrenOffered ? run : { ...run, wrenOffered: true };
}

export function recruitWren(run) {
  if (run.wren) return run;
  const out = add({ ...run, wrenOffered: true }, ['wren']);
  return out.added.length ? { ...out.run, wren: true } : run;
}

// ---- deploying, and losing ----

// How many of each kind can go, and the default a player who taps Ride without touching anything
// takes: Wren if she is here, then as even a split as the roster allows, up to eight.
export function counts(run) {
  const have = { swordsman: 0, archer: 0, wren: 0 };
  for (const u of run.roster) have[u.type] = (have[u.type] || 0) + 1;
  return have;
}

export function defaultPlan(run) {
  const have = counts(run);
  const cap = CFG.raids.allies.deploy;
  const plan = { swordsman: 0, archer: 0, wren: have.wren ? 1 : 0 };
  let left = cap - plan.wren;
  while (left > 0 && (plan.swordsman < have.swordsman || plan.archer < have.archer)) {
    const t = plan.archer <= plan.swordsman && plan.archer < have.archer ? 'archer' : plan.swordsman < have.swordsman ? 'swordsman' : 'archer';
    plan[t]++;
    left--;
  }
  return plan;
}

// A plan clamped to what the roster holds and to the eight, so a stale plan from the last castle,
// with men in it who have since fallen, still deploys something sensible.
export function clampPlan(run, plan) {
  const have = counts(run);
  const out = {};
  let left = CFG.raids.allies.deploy;
  for (const t of ['wren', 'swordsman', 'archer']) {
    out[t] = Math.max(0, Math.min(plan[t] || 0, have[t] || 0, left));
    left -= out[t];
  }
  return out;
}

// The actual men a plan sends: the first of each kind in roster order, which is the order they
// joined, so the oldest hands go first.
export function deploy(run, plan) {
  const p = clampPlan(run, plan);
  const out = [];
  for (const t of ['wren', 'swordsman', 'archer']) out.push(...run.roster.filter((u) => u.type === t).slice(0, p[t]));
  return out;
}

// Gone for the run (decision 2). Ids that are not on the roster are ignored rather than refused: the
// castle reports who fell, and reporting a man twice must not take a second one.
export function lose(run, ids) {
  const gone = new Set(ids);
  if (!gone.size) return run;
  const roster = run.roster.filter((u) => !gone.has(u.id));
  const wrenFell = run.roster.some((u) => u.type === 'wren' && gone.has(u.id));
  return { ...run, roster, wrenLost: run.wrenLost || wrenFell };
}

// ---- cards ----

// The run's reward cards. Kept on the run, not the game, because every castle is stood fresh through
// `reset()`, which puts `mods` back to the legacy seed -- the castle re-applies these after it.
export function takeCard(run, id) {
  return { ...run, cards: { ...run.cards, [id]: (run.cards[id] || 0) + 1 } };
}

export function seeCards(run, ids) {
  const seen = { ...run.seen };
  for (const id of ids) seen[id] = true;
  return { ...run, seen };
}

// The coin reward's size, for the region a castle was in.
export function coinReward(region) {
  const C = CFG.raids.allies.coin;
  return C.base + C.perRegion * region;
}
