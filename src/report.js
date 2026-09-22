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

// #190: THE BLACK BOX -- the one measurement a crash cannot take with it.
//
// The ring above is the last stretch of play and it lives in memory, so a tab the OS kills takes it
// along. That is exactly the case this is for. #190's two candidates are an out-of-memory kill (iOS
// reloads the tab, which looks like a crash) and a lost WebGL context (the game's own `watchContext`
// path), and they want completely different fixes -- but from the next page load they look identical,
// because nothing survives to say which one happened. The ticket's plan is to copy `?perf=1` at ten,
// twenty and thirty minutes, and that plan cannot catch the crash: the log is in the tab that died.
//
// So a dozen fields go to localStorage every five seconds, and the next load reads them BEFORE it
// writes its own. `ended` is the field the question turns on:
//
//   'context-lost'  `webglcontextlost` fired. The page was alive and the GPU went away.
//   'closed'        `pagehide` without bfcache. Navigated away, or the tab was closed.
//   'frozen'        `pagehide` WITH bfcache -- backgrounded, not closed. A kill after this is still
//                   a kill, so it is not the same answer as 'closed' and is not recorded as one.
//   null            the page came back (`pageshow` clears it), or it is still running.
//   absent          none of the above ever fired. The tab stopped between one five-second write and
//                   the next, which is what an OS kill looks like from the inside.
//
// Five seconds because the cost is a ~200-byte synchronous write and the resolution only has to be
// finer than the thing being measured: #203's phone report was 410 geometries at 4m14s, and a crash
// that arrives at twelve minutes does not need a one-second stamp. Everything is wrapped, because
// localStorage throws outright in a private window rather than returning null.
const clock = (t) => `${Math.floor(t / 60)}m${String(Math.round(t % 60)).padStart(2, '0')}s`;

const BOX = 'crownrush-blackbox';
// #251: THE FUNNEL. Five steps a first session either reaches or does not, counted across the
// profile's runs, and the days that had a session. On the device, in the player's hands, sent
// nowhere: the retention diagnostic had to drive bots because nothing in the build could say where
// players stop, and this is the number that page needed. `?view=report` shows it.
const FUNNEL = 'crownrush-funnel';
export const FUNNEL_STEPS = ['play', 'moved', 'rescued', 'keep', 'night'];
export function readFunnel() {
  try { return JSON.parse(localStorage.getItem(FUNNEL)) || { steps: {}, days: [] }; } catch { return { steps: {}, days: [] }; }
}
export function markFunnel(step) {
  const f = readFunnel();
  f.steps[step] = (f.steps[step] || 0) + 1;
  const day = new Date().toISOString().slice(0, 10);
  if (!f.days.includes(day)) f.days = [...f.days, day].slice(-60);
  try { localStorage.setItem(FUNNEL, JSON.stringify(f)); } catch { /* private window */ }
}
export function funnelLine() {
  const f = readFunnel();
  const names = { play: 'Play', moved: 'moved', rescued: 'rescued Wren', keep: 'stood the Keep', night: 'held a night' };
  return `${FUNNEL_STEPS.map((s) => `${names[s]} ${f.steps[s] || 0}`).join(' \u2192 ')} \u00b7 ${f.days.length} day${f.days.length === 1 ? '' : 's'} with a session`;
}
const BOX_EVERY = 5000;
let boxAt = 0;
// #190: STICKY, because `ended` is how the session STOPPED and that is not the same question as
// whether the context ever went away. Driven in a browser: lose the context, then close the tab the
// way a player would, and `pagehide` writes 'closed' straight over the top of 'context-lost' -- the
// one fact the ticket is trying to establish, erased by the most ordinary thing that can follow it.
// The game recovers from a loss and says so, so "it happened at 4m10s and play carried on" is a real
// and different answer from either ending. It survives every later write, including `pageshow`.
let lostAt = null;

// Read ONCE, here, before this session's first write lands on top of it. A getter would read whatever
// the current session had just written and report the crash as a clean run.
export const previousSession = (() => {
  try {
    const raw = localStorage.getItem(BOX);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
})();

function writeBox(game, ended) {
  const s = game.perfSample ? game.perfSample() : {};
  try {
    localStorage.setItem(BOX, JSON.stringify({
      v: 1, at: Date.now(), up: Math.round(performance.now() / 1000),
      t: Math.round(game.time || 0), wave: game.wave, level: game.baseLevel,
      geo: s.geometries, tex: s.textures, prog: s.programs, heap: s.heap,
      chars: game.crowdStats ? game.crowdStats().characters : null,
      lost: lostAt,
      // the tier, not the whole sentence: `qualityLabel` reads out every setting it implies, and
      // seventy characters of grass percentages in a one-line record is the line nobody finishes
      q: game.qualityLabel ? game.qualityLabel().replace(/^quality\s+/, '').split(':')[0].trim() : null,
      safe: !!game.safe, ended: ended || null,
      // #251: this run's first session, the steps a retention page needs
      firstInput: game.firstInputAt == null ? null : Math.round(game.firstInputAt),
      rescued: game.rescuedAt == null ? null : Math.round(game.rescuedAt),
      picketDeaths: game.picketDeaths || 0,
    }));
  } catch { /* private window, or the quota is full: neither is worth a frame's error */ }
}

// Every frame, and it writes on five-second wall clock rather than on game time -- a crash is a
// wall-clock event and the frame this is called from may be the last one there is.
export function noteSession(game) {
  const now = Date.now();
  if (now - boxAt < BOX_EVERY) return;
  boxAt = now;
  writeBox(game, null);
}

// The events that get to say how it ended, written immediately rather than on the next tick: by the
// time a tick comes round there may be no page left to run it.
export function endSession(game, how) {
  if (how === 'context-lost' && lostAt == null) lostAt = Math.round(performance.now() / 1000);
  boxAt = Date.now();
  writeBox(game, how);
}

// What the last session looked like when it stopped, for the report. `null` from a first-ever load is
// not the same as a session with no `ended` -- the first is "nothing to say", the second is a finding.
export function lastSessionLine(prev = previousSession) {
  if (!prev) return 'no record of a previous session';
  const how = prev.ended === 'context-lost' ? 'lost its WebGL context'
    : prev.ended === 'closed' ? 'closed normally'
      : prev.ended === 'frozen' ? 'was backgrounded and never came back'
        : 'STOPPED WITHOUT WARNING -- no pagehide, no context loss, which is what an OS kill looks like';
  const ago = Math.max(0, Math.round((Date.now() - (prev.at || 0)) / 1000));
  // and whether the context went away at all, which outlives however it ended
  const lost = prev.lost != null && prev.ended !== 'context-lost' ? ` (after losing the context at ${clock(prev.lost)} and carrying on)` : '';
  return `${how}${lost} · ${clock(prev.t || 0)} into the run, ${clock(prev.up || 0)} on the page, ${ago}s ago`
    + ` · night ${prev.wave} · ${prev.geo} geometries · ${prev.tex} textures · heap ${prev.heap == null ? 'n/a' : `${prev.heap} MB`}`
    + `${prev.safe ? ' · safe mode' : ''}${prev.q ? ` · ${prev.q}` : ''}`;
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
  // #64: HOW MANY CHARACTERS ARE ACTUALLY ON SCREEN, which is the number that ticket turns on and
  // which no report could answer until now. It says to add a distance LOD "if character counts ever
  // climb past roughly 150 on screen" -- and `drawn` is exactly that, the count the instance writer
  // keeps after its own frustum test, as against `characters`, which is everybody alive. A night-30
  // wave is 143 raiders and the army can reach ~120, so the total goes well past the trigger while
  // the drawn count may never approach it. Reporting the total alone would have argued for work that
  // is not needed; reporting both is what settles it from a real phone rather than from a guess.
  if (game.crowdStats) {
    const cr = game.crowdStats();
    L.push(pad('crowd') + `${cr.drawn} drawn of ${cr.characters} alive`);
  }
  L.push(pad('shadows') + `${game.shadowProfile} · post ${game.post ? (game.post.grade.enabled ? 'on' : 'off at this tier') : 'none (safe mode)'}`);
  L.push('');
  L.push(pad('device') + (extra.size || 'n/a'));
  L.push(pad('gl') + (extra.gl || 'n/a'));
  // #190: AND HOW THE LAST ONE ENDED, which is the whole of the crash question and cannot be asked
  // of this session -- a report is written by a page that is still alive.
  L.push(pad('last session') + lastSessionLine());
  L.push(pad('funnel') + funnelLine());   // #251
  L.push(pad('this run') + `moved at ${game.firstInputAt == null ? 'never' : clock(game.firstInputAt)} \u00b7 rescued at ${game.rescuedAt == null ? 'never' : clock(game.rescuedAt)} \u00b7 fell at the picket ${game.picketDeaths || 0}`);
  L.push(pad('agent') + navigator.userAgent);
  return L.join('\n');
}

// The full sample log, appended to the clipboard copy and left off the issue link. #166 already keeps
// one sample per two seconds of game time for an hour and #74 already proved the copy works on iOS;
// this only decides where it goes.
export function reportWithLog(text, csv) {
  return csv && csv !== 'no samples yet' ? `${text}\n\n--- perf log (one sample per 2s of game time) ---\n${csv}` : text;
}
