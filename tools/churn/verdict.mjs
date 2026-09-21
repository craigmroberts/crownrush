// #190: is a counter LEAKING, or did it pay for something once?
//
// This is two lines of arithmetic in its own file because it is the sentence the churn harness exists
// to say, and it was wrong. `raiders` read 227 for six rounds and then 232, which is a camp waking and
// the first damage number being drawn -- paid once, flat either side -- and the average made it
// "+0.7/round" and put CLIMB beside it. That is the same failure the checks were written after (#179):
// an instrument that is confidently wrong is worse than one that says nothing, because the next real
// finding arrives beside it and gets the same shrug.
//
// A leak climbs in most rounds. A step climbs in one. So the verdict asks BOTH -- the total has to be
// worth something, and it has to have arrived a bit at a time. The leak this harness was built to find
// (nine geometries a spawn flourish, +543 a round) is positive in every interval and still flags.
//
// The first round is excluded by the caller before it gets here: every block fills a cache once, and a
// cache filling once is not a leak either.
export function verdict(settled, rate = 0.5) {
  const n = settled.length;
  if (n < 2) return { climb: 0, perRound: 0, steady: false, kind: 'flat' };
  const climb = settled[n - 1] - settled[0];
  const perRound = climb / (n - 1);
  const deltas = settled.slice(1).map((v, i) => v - settled[i]);
  const steady = deltas.filter((d) => d > 0).length / deltas.length >= 0.5;
  const kind = perRound <= rate ? 'flat' : steady ? 'climb' : 'step';
  return { climb, perRound, steady, kind, rounds: deltas.length };
}
