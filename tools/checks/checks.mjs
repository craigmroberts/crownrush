// #179: the runner.
//
//     npm run check                 every free check, and every cheap one
//     npm run check -- --free       only the ones that need nothing but the source (milliseconds)
//     npm run check -- --area Walls run one area
//     npm run check -- --list       what exists, what it costs, when it last ran
//     npm run check -- --id walls-solid
//
// Results are written to `public/board/checks.json`, which is what the board's Tests page fetches. A
// run only ever UPDATES the checks it ran, so running one area does not blank the timestamps of
// everything else -- the point of the file is to say when each thing was last looked at, and a
// partial run is the normal case.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from './registry.mjs';
import { FREE } from './free.mjs';
import { CHEAP, PROVE } from './cheap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
// ONE file, and it is the one the board reads. This used to keep its own `state/last-run.json` and
// write the board a copy of it, which is two files holding the same results and a board built on the
// rule that nothing on it is a copy of anything. The published file IS the record; a run reads what
// the last run left there and writes back the merge.
const STATE = join(ROOT, 'public', 'board', 'checks.json');
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const prior = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { checks: {} };

// #179: --prove breaks the game the way each check exists to catch and expects RED. Written as its
// own verdict rather than by inverting `pass` at the end, so the three outcomes stay distinct: the
// check noticed, the check slept through it, or nobody has written a sabotage for it yet.
const proving = !!flag('prove');
function proved(id, res) {
  const at = new Date().toISOString();
  if (!PROVE[id]) return { pass: true, unproved: true, note: 'no sabotage written -- not proved', at };
  if (res.pass) return { pass: false, detail: ['stayed green under its own sabotage'], at };
  return { pass: true, note: `went red: ${(res.detail || [res.error || '']).join('; ').slice(0, 90)}`, at };
}

function selected() {
  let list = CHECKS.filter((c) => c.cost !== 'judged');
  if (flag('free')) list = list.filter((c) => c.cost === 'free');
  if (flag('cheap')) list = list.filter((c) => c.cost === 'cheap');
  const area = flag('area');
  if (typeof area === 'string') list = list.filter((c) => c.area.toLowerCase() === area.toLowerCase());
  const id = flag('id');
  if (typeof id === 'string') list = list.filter((c) => c.id === id);
  return list;
}

function show(list) {
  const when = (id) => {
    const r = prior.checks[id];
    if (!r) return 'never run';
    const age = Math.round((Date.now() - new Date(r.at)) / 36e5);
    return `${r.pass ? (r.blocked ? 'blocked' : 'passed') : 'FAILED'}, ${age < 1 ? 'under an hour' : `${age}h`} ago`;
  };
  const w = Math.max(...CHECKS.map((c) => c.id.length));
  let area = '';
  for (const c of CHECKS) {
    if (c.area !== area) { area = c.area; console.log(`\n  ${area}`); }
    console.log(`    ${c.id.padEnd(w)}  ${c.cost.padEnd(6)}  ${c.cost === 'judged' ? 'needs a person' : when(c.id)}`);
  }
  const auto = CHECKS.filter((c) => c.cost !== 'judged');
  const run = auto.filter((c) => prior.checks[c.id]);
  console.log(`\n  ${run.length} of ${auto.length} automated checks have been run; ${CHECKS.length - auto.length} are judged and cannot be.\n`);
}

function freePort() {
  return new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}
function build() {
  return new Promise((ok, fail) => {
    const p = spawn('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? ok() : fail(new Error('build failed'))));
  });
}
async function serve(port) {
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const stop = () => { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } };
  process.on('exit', stop);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(130); });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('preview did not start')), 40000);
    p.stdout.on('data', (d) => { if (/localhost:/.test(String(d))) { clearTimeout(t); ok(); } });
  });
  p.stop = stop;
  return p;
}

// The installed full Chromium, if there is one: `PLAYWRIGHT_BROWSERS_PATH/chromium-*/chrome-linux/chrome`.
// Null when there is nothing there, which leaves Playwright to its own default.
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return null;
  for (const d of readdirSync(root).sort().reverse()) {
    if (!d.startsWith('chromium-')) continue;
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const p = join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function main() {
  const list = selected();
  if (flag('list') || !list.length) return show(list);

  const results = {};
  const free = list.filter((c) => c.cost === 'free');
  const cheap = list.filter((c) => c.cost === 'cheap');

  for (const c of free) {
    try { results[c.id] = { ...FREE[c.id](), at: new Date().toISOString() }; }
    catch (e) { results[c.id] = { pass: false, detail: [e.message], at: new Date().toISOString() }; }
  }

  let server = null;
  let browser = null;
  if (cheap.length) {
    await build();
    const port = await freePort();
    server = await serve(port);
    const url = `http://localhost:${port}/`;
    // WHICH CHROMIUM. Playwright's default is the headless shell it downloads, and a machine can have
    // the full browser without it -- which is the container these sessions run in, where every cheap
    // check came back as one launch error and the board would have shown six ambers for a game that
    // was fine. `CHROME_PATH` first (what CI would set), then whatever `PLAYWRIGHT_BROWSERS_PATH`
    // actually holds, then Playwright's own guess.
    const exe = process.env.CHROME_PATH || findChromium();
    browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
    for (const c of cheap) {
      // A FRESH CONTEXT PER CHECK. Sharing one page across all six meant the first check that
      // navigated a lot left the next one's `page.goto` timing out, and five checks reported failures
      // that were the harness rather than the game -- which is the one thing a coverage board must
      // never do. A context costs a second; a false red costs trust in the whole page.
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 720 } });
      const page = await ctx.newPage();
      // #179: in --prove mode the game is broken first and the check is expected to go RED. A check
      // that stays green under its own sabotage is not covering what the registry says it covers.
      if (proving && PROVE[c.id]) {
        await page.addInitScript((src) => {
          const fn = new Function(`return (${src})`)();
          const arm = () => {
            if (window.game && window.game.king) { try { fn(); } catch (e) { console.error('sabotage threw', e); } }
            else requestAnimationFrame(arm);
          };
          requestAnimationFrame(arm);
        }, PROVE[c.id].toString());
      }
      try {
        const res = await CHEAP[c.id](page, url);
        results[c.id] = proving ? proved(c.id, res) : { ...res, at: new Date().toISOString() };
      }
      catch (e) {
        // A CHECK THAT COULD NOT RUN IS NOT A CHECK THE GAME FAILED, and the board has to be able to
        // tell those apart. A Playwright timeout means the browser never got far enough to have an
        // opinion -- reporting it as `pass: false` puts a red beside "walls are solid" that says the
        // walls leak, which is a lie about the game told by a slow laptop. `error` renders amber and
        // says what broke; only an assertion the check actually made comes back false.
        const m = String(e.message).split('\n')[0];
        // Sabotage is allowed to make a check throw -- a browser that could not finish is still not
        // the check noticing, so it counts as unproved rather than as a pass.
        results[c.id] = proving
          ? { pass: false, error: `sabotage broke the run rather than the assertion: ${m}`, at: new Date().toISOString() }
          : { pass: false, error: m, at: new Date().toISOString() };
      }
      await ctx.close();
    }
    await browser.close();
    server.stop();
  }

  // #179: --prove answers a question about the CHECKS, not about the game, so it prints and writes
  // nothing. Letting it merge would put "went red under sabotage" on the board beside real results.
  if (proving) return report(results, list, true);

  // merge, never blank: a partial run must not erase what the last full one learned
  const merged = { at: new Date().toISOString(), checks: { ...prior.checks, ...results } };
  // Same origin, no API, no key -- the board fetches this file rather than being told what the
  // coverage is, so it cannot claim a check ran when it did not. The registry rides along so the
  // board can show the gaps too: the judged rows have no result and are supposed to have none.
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify({ at: merged.at, registry: CHECKS, checks: merged.checks }, null, 2));

  report(results, list, false);
}

function report(results, list, proveMode) {
  console.log('');
  let failed = 0, unproved = 0;
  for (const c of list) {
    const r = results[c.id];
    if (!r) continue;
    const tag = r.blocked ? 'BLOCK' : r.unproved ? 'GAP  ' : r.pass ? 'pass ' : 'FAIL ';
    if (!r.pass) failed++;
    if (r.unproved) unproved++;
    console.log(`  ${tag}  ${c.id}${r.note ? `  (${r.note})` : ''}${r.blocked ? `  — ${r.blocked}` : ''}`);
    if (!r.pass) for (const d of r.detail || []) console.log(`           ${d}`);
    if (!r.pass && r.error) console.log(`           ${r.error}`);
  }
  const n = list.filter((c) => results[c.id]).length;
  console.log(proveMode
    ? `\n  ${n - failed - unproved} of ${n} proved they can fail; ${unproved} have no sabotage written.  Nothing written to the board.\n`
    : `\n  ${n - failed} of ${n} passed.  Written to public/board/checks.json\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
