// #182: the report that makes a bug decidable.
//
// The report that prompted this said: "the gameplay has crashed but I am still able to use the menu,
// just the game doesn't move when I move my finger". The menus working is the useful half -- if the
// frame loop had stopped, the pause button would not have opened anything -- so the page was alive
// and something between the finger and the King was not. At least four things do that and they want
// completely different fixes:
//
//   the frame rate collapsed        -- `updateQuality` should have compensated; did it, and to what?
//   `input.suspended` stuck on      -- the stick is ignored and the keyboard and menus still work
//   a pointer capture lost          -- a drag that never delivered its `pointerup`
//   `game.running` false            -- `watchStuck` recovers it in 1.5s unless something was open
//
// ONE FIELD TELLS YOU WHICH. Guessing costs a day and lands on the wrong one. Nearly all of this was
// already being measured by #54, #74, #166 and #168 -- what was missing was somewhere for it to go.
//
// THE RING IS THE POINT, and it is why this is a module rather than a function. By the time anybody
// opens the pause sheet to report a bug, `game.paused` is true and `input.stick` has been let go --
// the state worth having is gone, and a report built at that moment describes the reporting, not the
// bug. So every frame writes into a ring of the last `N`, and what the report carries is the last
// stretch of PLAY: the frame times, and whether the stick and the suspend flag were where they
// should have been while the finger was still on the glass.
//
// Two flat typed arrays rather than an array of objects, because this runs sixty times a second and
// the one thing a performance report must not do is make the performance worse. 3 KB, no allocation,
// no GC.
const N = 600;                    // ten seconds at 60fps, and two minutes at the 5fps this is for
const frameMs = new Float32Array(N);
const frameFlags = new Uint8Array(N);
let head = 0, filled = 0;

const RUNNING = 1, PAUSED = 2, SUSPENDED = 4, STICK = 8, OVER = 16;

export function sampleFrame(ms, game, input) {
  frameMs[head] = ms;
  frameFlags[head] = (game.running ? RUNNING : 0) | (game.paused ? PAUSED : 0)
    | (input && input.suspended ? SUSPENDED : 0) | (input && input.stick ? STICK : 0)
    | (game.hud && game.hud.overScreen && !game.hud.overScreen.classList.contains('hidden') ? OVER : 0);
  head = (head + 1) % N;
  if (filled < N) filled++;
}

// Oldest first, so "the last ten frames" reads left to right the way time does.
function ordered() {
  const out = [];
  for (let i = 0; i < filled; i++) out.push((head - filled + i + N * 2) % N);
  return out;
}

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

// The last stretch of PLAY -- frames where the game was running and not paused. This is the window
// the answer is in, and it is deliberately not "the last N frames": those are the pause sheet.
function playWindow(want) {
  const idx = ordered().filter((i) => (frameFlags[i] & RUNNING) && !(frameFlags[i] & PAUSED));
  return idx.slice(-want);
}

export function frameStats(want = 120) {
  const idx = playWindow(want);
  if (!idx.length) return null;
  const ms = idx.map((i) => frameMs[i]).sort((a, b) => a - b);
  const any = (bit) => idx.filter((i) => frameFlags[i] & bit).length;
  return {
    n: idx.length,
    median: pct(ms, 0.5), p95: pct(ms, 0.95), worst: ms[ms.length - 1],
    fps: 1000 / Math.max(1e-3, pct(ms, 0.5)),
    suspended: any(SUSPENDED), stick: any(STICK),
    recent: playWindow(10).map((i) => Math.round(frameMs[i])),
  };
}

// 14, because the longest label is `while playing` at 13 and a label that does not pad runs into its
// own value -- `while playing17 frames`, which is exactly the kind of thing that makes a box nobody
// can read in the screenshot it exists to be read in.
const pad = (s, n = 14) => String(s).padEnd(n);
const clock = (t) => `${Math.floor(t / 60)}m${String(Math.round(t % 60)).padStart(2, '0')}s`;

// `extra` is everything that lives in main.js rather than on the game -- the device report, the
// build the service worker is answering with, and the errors the update loop swallowed. Passed in
// rather than imported, so this module has no opinion about how the page is wired.
export function bugReport(game, input, extra = {}) {
  const f = frameStats();
  const s = game.perfSample ? game.perfSample() : {};
  const L = [];
  L.push('Crown Rush bug report');
  L.push(pad('when') + `${new Date().toISOString()} · ${clock(game.time || 0)} into the run`);
  L.push(pad('build') + `${extra.build || 'unknown (no service worker answering)'}${extra.save != null ? ` · save v${extra.save}` : ''}`);
  L.push('');
  // The four suspects, in the order the ticket ruled them out. `suspended` is the one that matches
  // the symptom exactly: while it is on, `read()` ignores the stick and the keyboard and every menu
  // still work.
  L.push(pad('now') + `running=${!!game.running} paused=${!!game.paused} suspended=${!!(input && input.suspended)} `
    + `stick=${input && input.stick ? 'held' : 'none'} stuckFor=${(game.stuckFor || 0).toFixed(2)}`);
  if (f) {
    L.push(pad('while playing') + `${f.n} frames · ${f.median.toFixed(1)}ms median (${f.fps.toFixed(0)}fps) · ${f.p95.toFixed(1)}ms p95 · ${f.worst.toFixed(1)}ms worst`);
    L.push(pad('') + `suspended on ${f.suspended} of them, stick held on ${f.stick}`);
    L.push(pad('last 10') + f.recent.join(' ') + ' ms');
  } else {
    L.push(pad('while playing') + 'no frames of play recorded yet');
  }
  L.push(pad('quality') + (game.qualityLabel ? game.qualityLabel().replace(/^quality\s+/, '') : 'n/a'));
  L.push(pad('errors') + `${extra.caught || 0} swallowed by the update loop${extra.lastError ? ` · last: ${extra.lastError}` : ''}`);
  L.push('');
  L.push(pad('run') + `night ${game.wave} · keep lv ${game.baseLevel} · score ${game.score} · ${game.units.length} army · ${game.enemies.length} raiders · ${game.coinsCarried} coins`);
  L.push(pad('live') + `arrows ${s.arrows} · coins ${s.coins} · fx ${s.fx} · queue ${s.queue} · heap ${s.heap == null ? 'n/a' : s.heap + ' MB'}`);
  L.push(pad('gpu') + `${s.geometries} geometries · ${s.textures} textures · ${s.programs} programs`);
  L.push(pad('shadows') + `${game.shadowProfile} · post ${game.post ? (game.post.grade.enabled ? 'on' : 'off at this tier') : 'none (safe mode)'}`);
  L.push('');
  L.push(pad('device') + (extra.size || 'n/a'));
  L.push(pad('gl') + (extra.gl || 'n/a'));
  L.push(pad('agent') + navigator.userAgent);
  return L.join('\n');
}

// The full sample log, appended to the clipboard copy and left off the issue link. #166 already keeps
// one sample per two seconds of game time for an hour and #74 already proved the copy works on iOS;
// this only decides where it goes.
export function reportWithLog(text, csv) {
  return csv && csv !== 'no samples yet' ? `${text}\n\n--- perf log (one sample per 2s of game time) ---\n${csv}` : text;
}
