#!/usr/bin/env node
// #254: PLAYS RAIDS MODE WITHOUT A BROWSER, THOUSANDS OF TIMES, THROUGH THE REAL MODULES.
//
// Raids mode's map, curve and run state are pure functions of a seed (src/raids/), so the questions
// that decide whether the mode works can be answered before any of it is drawn: how soon does a player
// meet the first boss, how often do they get there, how many map draws does a rule throw away, how
// long does a run last. The same approach `tools/deck/reheat.mjs` took for the reward deck.
//
//     npm run raids:sim
//
// TWO KINDS OF NUMBER COME OUT, AND THEY ARE NOT EQUALLY TRUSTWORTHY.
//   Timing -- when the first boss is reached -- is arithmetic over the map's structure and the castle
//   lengths in `CFG.raids.seconds`. It is as good as those lengths, which R3 has to hit in real castles.
//   Survival -- who reaches the boss, how long a run lasts -- runs on a PLACEHOLDER model in
//   `CFG.raids.survival`. It exists so a run can end in the sim at all; R7 replaces it with one fitted
//   to real castles. The report labels which is which every time it prints.
//
// Three players, because a map is only a choice if choosing differently changes something:
//   random  takes any lit node
//   safe    takes the least risky lit node (a muster if one is lit)
//   bold    takes the highest score multiplier
import { CFG } from '../../src/config.js';
import { makeRng, mix } from '../../src/raids/rand.js';
import { nodeSeconds, fallChance, rosterPower } from '../../src/raids/curve.js';
import { riskOf } from '../../src/raids/map.js';
import { createRun, choices, ride, complete, region } from '../../src/raids/run.js';

// #258: what a player commits to the Call to Arms at a boss, from the men not deployed.
const COMMITS = {
  none: () => 0,
  half: (reserve) => Math.floor(reserve / 2),
  all: (reserve) => reserve,
};

const POLICIES = {
  random: (lit, rng) => rng.pick(lit),
  safe: (lit) => lit.reduce((a, b) => (riskOf(b) < riskOf(a) ? b : a)),
  bold: (lit) => lit.reduce((a, b) => (b.multiplier > a.multiplier ? b : a)),
};

export function simulate({ runs = 2000, policy = 'random', commit = 'half', seed = 1, maxNodes = 90 } = {}) {
  const S = CFG.raids.seconds;
  const V = CFG.raids.survival;
  const A = CFG.raids.allies;
  const pick = POLICIES[policy];
  const commitOf = COMMITS[commit];
  const bossReached = [];        // per run: bosses ridden into
  const bossBeaten = [];         // per run: bosses held
  const scores = [];
  const firstBoss = [];          // seconds from Play to riding into the first boss, for runs that got there
  const firstBossBeaten = [];
  const lengths = [];            // { seconds, castles } for every run
  const attempts = [];
  for (let r = 0; r < runs; r++) {
    const rng = makeRng(mix(seed, r));
    let run = createRun(mix(seed * 7919, r));
    let t = S.firstMap;
    let allies = 0;
    let alive = true;
    let bossesIn = 0;
    let bossesHeld = 0;
    for (let step = 0; step < maxNodes && alive; step++) {
      const lit = choices(run);
      const node = pick(lit, rng);
      t += S.map;
      run = ride(run, node.id);
      if (node.kind === 'boss' && node.region === 0) firstBoss.push(t);
      if (node.kind === 'muster') {
        t += S.muster;
        allies = Math.min(A.cap, allies + 2);   // the war chest turned into men
        run = complete(run);
        continue;
      }
      t += nodeSeconds(node, rng);
      const deployed = Math.min(A.deploy, allies);
      // #258: at a boss, some of the men left over are committed; they add to the fight and are spent
      const committed = node.kind === 'boss' ? commitOf(allies - deployed) : 0;
      const power = rosterPower(deployed) + V.chargeValue * committed;
      if (node.kind === 'boss') bossesIn++;
      if (rng() < fallChance(node.difficulty, power)) { alive = false; break; }
      allies -= committed;
      if (node.kind === 'boss') bossesHeld++;
      // survivors pay for the fight, and a clear pays in recruits (decision 2: gone for the run)
      allies -= Math.min(deployed, Math.round(deployed * V.loss * Math.min(2, node.difficulty / power)));
      allies = Math.min(A.cap, allies + rng.int(A.earn[0], A.earn[1]) + (node.kind === 'fortress' ? A.fortress : 0));
      t += S.reward;
      const banked = node.kind === 'boss' && !committed ? CFG.raids.boss.bank : 1;
      run = complete(run, { score: Math.round(100 * node.multiplier * banked) });
      if (node.kind === 'boss' && node.region === 0) firstBossBeaten.push(t);
    }
    lengths.push({ seconds: t, castles: run.cleared });
    bossReached.push(bossesIn);
    bossBeaten.push(bossesHeld);
    scores.push(run.score);
    for (const i of new Set(run.path.map((id) => +id.split('.')[0]))) attempts.push(region(run, i).attempts);
  }
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  return {
    runs, policy, commit,
    // #258: of the bosses ridden into, the share held; and the median score a run ends on
    bossClear: bossReached.reduce((a, b) => a + b, 0) ? bossBeaten.reduce((a, b) => a + b, 0) / bossReached.reduce((a, b) => a + b, 0) : 0,
    medianScore: q(scores, 0.5),
    meanScore: Math.round(scores.reduce((a, b) => a + b, 0) / runs),
    firstBoss: { reached: firstBoss.length / runs, p25: q(firstBoss, 0.25), median: q(firstBoss, 0.5), p75: q(firstBoss, 0.75), p90: q(firstBoss, 0.9) },
    firstBossBeaten: firstBossBeaten.length / runs,
    runLength: { medianSeconds: q(lengths.map((l) => l.seconds), 0.5), medianCastles: q(lengths.map((l) => l.castles), 0.5), p90Castles: q(lengths.map((l) => l.castles), 0.9) },
    drawsPerRegion: attempts.reduce((a, b) => a + b, 0) / attempts.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const pc = (x) => `${Math.round(x * 100)}%`;
  console.log('Raids mode, 2000 runs per player, through src/raids/\n');
  console.log('TIMING (arithmetic over the map and CFG.raids.seconds)');
  console.log('player    reach 1st boss at:  p25     median   p75     p90');
  const results = Object.keys(POLICIES).map((p) => simulate({ policy: p }));
  for (const r of results) {
    const f = r.firstBoss;
    console.log(`${r.policy.padEnd(10)}${' '.repeat(18)}${mmss(f.p25).padEnd(8)}${mmss(f.median).padEnd(9)}${mmss(f.p75).padEnd(8)}${mmss(f.p90)}`);
  }
  console.log('\nSURVIVAL (PLACEHOLDER model in CFG.raids.survival -- R7 fits the real one; do not read these as predictions)');
  console.log('player    reach 1st boss   beat it   median run   median castles   p90 castles');
  for (const r of results) {
    console.log(`${r.policy.padEnd(10)}${pc(r.firstBoss.reached).padEnd(17)}${pc(r.firstBossBeaten).padEnd(10)}${mmss(r.runLength.medianSeconds).padEnd(13)}${String(r.runLength.medianCastles).padEnd(17)}${r.runLength.p90Castles}`);
  }
  console.log(`\nmap draws per region that keeps all five rules: ${results[0].drawsPerRegion.toFixed(2)} on average`);
  console.log('\nTHE CALL TO ARMS (#258; on the same PLACEHOLDER survival model), a player who takes any lit node');
  console.log('commits      bosses held   median score');
  for (const c of Object.keys(COMMITS)) {
    const r = simulate({ policy: 'random', commit: c });
    console.log(`${c.padEnd(13)}${pc(r.bossClear).padEnd(14)}${r.medianScore}`);
  }
}
