// #94: finished runs, kept so there is a scoreboard to show.
//
// Before this the game kept two numbers and both were only ever the maximum -- a run that ended was
// compared against the best and then thrown away, at the moment it became interesting.
//
// Its own key, deliberately. `game-save.js` discards a run save outright when its VERSION moves, and
// a bumped save format is no reason to lose somebody's best night. The two must never share a key.
const KEY = 'crownrush-scores';
const VERSION = 1;

// Ten is a scoreboard; a hundred is a log nobody scrolls.
// Kept by SCORE rather than by recency, because a board that forgets your best run because you played
// ten bad ones afterwards is not a board.
const MAX = 10;

// Every read and write is wrapped. localStorage throws in private mode and on a full quota, and a
// scoreboard that cannot be written has to still let the game be played -- which is the rule every
// other store in this codebase already follows.
export function readScores() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const s = JSON.parse(raw);
    if (!s || s.v !== VERSION || !Array.isArray(s.runs)) return [];
    return s.runs;
  } catch (e) {
    return [];
  }
}

// `run` is { score, wave, end, coins, army }. `at` is stamped here so no caller can forget it.
// Returns the board as it now stands, which is what the caller would have had to re-read anyway.
export function recordRun(run) {
  const runs = readScores();
  runs.push({ ...run, at: Date.now() });
  runs.sort((a, b) => b.score - a.score);
  runs.length = Math.min(runs.length, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, runs }));
  } catch (e) { /* private mode, or the quota is full: the run still happened, it is just not kept */ }
  return runs;
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
