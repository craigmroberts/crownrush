#!/usr/bin/env node
// #235: HOW OFTEN AN OFFER HAS NOTHING NEW IN IT.
//
// Plays the reward deck without playing the game: a run is fifteen Keep levels, each one an offer
// from `pickOffer` and a random pick from it, and an offer is "reheated" when every card on it has
// already been on screen this run. Two thousand runs, with the rotation (`seen` passed) and without
// it (the deck as it was before the ticket), so the table says what the change bought rather than
// what it is.
//
//     node tools/deck/reheat.mjs
//
// The free check `deck-rotates` runs the same simulation. Three things come out of it:
//
//   reheated   offers with nothing new on them, per level
//   identical  offers that are the same three cards as an earlier offer this run
//   broken     offers that were all seen while an unseen card was still available -- the rule
//              itself, which must be zero
//
// The reheated number at 15 is the deck running out -- twenty-three cards, fifteen offers of
// three -- which no draw can fix and a bigger deck can. See `pickOffer` for what a x3 weighting
// did to it and why it is not there.
import { pickOffer, UPGRADES } from '../../src/upgrades.js';

export function simulate(runs = 2000, levels = 15, rotate = true) {
  const reheated = new Array(levels + 1).fill(0);
  const identical = new Array(levels + 1).fill(0);
  let broken = 0;
  const allSeenAt = [];
  for (let r = 0; r < runs; r++) {
    const taken = {};
    const seen = {};
    const shown = {};   // the run's own record, kept apart from what pickOffer is told
    const keys = new Set();
    let done = 0;
    for (let L = 1; L <= levels; L++) {
      const offer = pickOffer(taken, 3, rotate ? seen : {});
      if (!offer.length) { reheated[L]++; continue; }
      const stale = offer.every((u) => shown[u.id]);
      if (stale) reheated[L]++;
      if (stale && rotate && UPGRADES.some((u) => !shown[u.id] && (taken[u.id] || 0) < (u.max || 1))) broken++;
      const key = offer.map((u) => u.id).sort().join(',');
      if (keys.has(key)) identical[L]++;
      keys.add(key);
      for (const u of offer) { shown[u.id] = true; seen[u.id] = true; }
      if (!done && Object.keys(shown).length >= UPGRADES.length) done = L;
      const pick = offer[Math.floor(Math.random() * offer.length)];
      taken[pick.id] = (taken[pick.id] || 0) + 1;
    }
    allSeenAt.push(done || levels + 1);
  }
  allSeenAt.sort((a, b) => a - b);
  return {
    reheated: reheated.map((n) => n / runs),
    identical: identical.map((n) => n / runs),
    broken,
    allSeenBy: allSeenAt[Math.floor(runs / 2)],   // the median level at which every card has been shown
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = simulate(2000, 15, false);
  const after = simulate(2000, 15, true);
  const pc = (x) => `${(x * 100).toFixed(0)} %`.padStart(7);
  console.log(`${UPGRADES.length} cards, 2000 runs, a random pick a level\n`);
  console.log('level   reheated: before  after     identical: before  after');
  for (const L of [3, 5, 7, 10, 12, 15]) console.log(`${String(L).padEnd(8)}${pc(before.reheated[L]).padStart(16)}${pc(after.reheated[L])}${pc(before.identical[L]).padStart(21)}${pc(after.identical[L])}`);
  console.log(`\nevery card shown by level (median): before ${before.allSeenBy > 15 ? 'never' : before.allSeenBy}, after ${after.allSeenBy}`);
  console.log(`offers all seen while an unseen card was available: ${after.broken} (the rule; must be 0)`);
}
