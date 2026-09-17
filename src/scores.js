// #94: finished runs, kept so there is a scoreboard to show.
//
// Before this the game kept two numbers and both were only ever the maximum -- a run that ended was
// compared against the best and then thrown away, at the moment it became interesting.
//
// Its own key, deliberately. `game-save.js` discards a run save outright when its VERSION moves, and
// a bumped save format is no reason to lose somebody's best night. The two must never share a key.
const KEY = 'crownrush-scores';
const VERSION = 1;

// Ten is a scoreboard; a hundred is a log nobody scrolls. Per length since #58, so the ceiling on
// the stored list is twenty rows rather than ten.
// Kept by SCORE rather than by recency, because a board that forgets your best run because you played
// ten bad ones afterwards is not a board.
const MAX = 10;

// #58: which run length a row belongs to. Rows written before #58 have no `len` at all, and every
// one of them is a long run -- thirty nights was the only length there was -- so a missing field
// reads as 'long' rather than as unknown.
//
// And the same trick as #119: VERSION is NOT bumped to add the field. `readScores` returns [] when
// the stored version does not match, so bumping it would empty every player's board to make room for
// a label. A row without the field is not broken, it is a long run.
const lengthOf = (r) => r.len || 'long';

// Every read and write is wrapped. localStorage throws in private mode and on a full quota, and a
// scoreboard that cannot be written has to still let the game be played -- which is the rule every
// other store in this codebase already follows.
// `len` filters to one length's board. Omit it for every row, which is what the settings row's count
// and anything asking "has anyone finished a run" wants.
export function readScores(len = null) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const s = JSON.parse(raw);
    if (!s || s.v !== VERSION || !Array.isArray(s.runs)) return [];
    return len ? s.runs.filter((r) => lengthOf(r) === len) : s.runs;
  } catch (e) {
    return [];
  }
}

// `run` is { score, wave, end, coins, army, level, len }. `at` is stamped here so no caller can
// forget it.
//
// #119 added `level` WITHOUT touching VERSION, and that is the whole trick: `readScores` returns []
// when the stored version does not match, so bumping it to add a field would have deleted every
// player's board for a change of label. A row written before #119 simply has no `level`, and the
// board renders it with the night it already had.
// Returns the board as it now stands, which is what the caller would have had to re-read anyway.
export function recordRun(run) {
  const runs = readScores();
  runs.push({ ...run, at: Date.now() });
  runs.sort((a, b) => b.score - a.score);
  // #58: ten rows PER LENGTH, not ten in all. One sorted list still, trimmed per length as it is
  // walked -- a fifteen-night run scores far less than a thirty-night one for the same play, so a
  // single top-ten would fill with long runs and quietly delete a short-run board that is the only
  // record of half the players' games. Which is the same reason the two are not ranked together.
  const kept = [];
  const seen = {};
  for (const r of runs) {
    const L = lengthOf(r);
    seen[L] = (seen[L] || 0) + 1;
    if (seen[L] <= MAX) kept.push(r);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, runs: kept }));
  } catch (e) { /* private mode, or the quota is full: the run still happened, it is just not kept */ }
  return kept;
}

// #56: cumulative lifetime score -- what a lost run buys. Its own key, for the same reason the board
// has its own: `game-save.js` throws a run away when its VERSION moves, and a save format change is
// no reason to take somebody's unlocks back. Nothing here is ever reduced; a run only ever adds.
//
// Stored as a bare number rather than a versioned object, because there is no shape to get wrong.
const LEGACY_KEY = 'crownrush-legacy';

export function readLegacy() {
  return Math.max(0, readNumber(LEGACY_KEY, 0));
}

// Returns the new total, so the caller can say what a run just bought without re-reading.
export function addLegacy(score) {
  const total = readLegacy() + Math.max(0, Math.round(score || 0));
  writeNumber(LEGACY_KEY, total);
  return total;
}

// #94: the two loose bests. They are not part of the board, but they are written in the same breath at
// the end of a run and they were bare -- so a browser refusing the write threw out of `gameOver`
// before it could show the game over screen, and a run in private mode ended with nothing on screen
// at all. Measured by making setItem throw: `QuotaExceededError` came straight back out of gameOver.
export function readNumber(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : Number(v) || fallback;
  } catch (e) {
    return fallback;
  }
}
export function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) { /* private mode or a full quota: this run is still played, it is just not remembered */ }
}

// How a run ended, in the words the game over screen already uses. A victory is the fourth outcome and
// is not a `gameOver` reason, which is why it is spelled out here rather than derived.
export function endName(end) {
  return end === 'won' ? 'The Warlord fell'
    : end === 'taken' ? 'They carried Wren away'
      : end === 'queen' ? 'Wren was lost'
        : 'The King fell';
}
