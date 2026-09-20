#!/usr/bin/env node
// Boots the built game in a headless browser, plays it for a while, and prints what the renderer did.
//
// The numbers that matter here are the ones that do not depend on the graphics card: draw calls,
// triangles, character count, and the bytes fetched before the game is playable. Headless Chromium
// renders through SwiftShader on the CPU, so frames per second means nothing in this environment and
// is reported only as a relative figure between two runs of the same machine.
//
//     node tools/probe/probe.mjs                 # build, serve, play 20 s, print a report
//     node tools/probe/probe.mjs --seconds 40    # play longer, so later waves are in the sample
//     node tools/probe/probe.mjs --crowd 120     # force a fixed crowd, which is the only fair way
//                                                # to compare one rendering path against another
//     node tools/probe/probe.mjs --json out.json # also write the report where another run can diff it
//     node tools/probe/probe.mjs --compare a.json
//     node tools/probe/probe.mjs --assert --crowd 120   # #53: fail if a README budget is exceeded
//
// Everything is resolved from this file's own location, so the directory you run it from is free.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const SECONDS = Number(flag('seconds', 20));
const PORT = Number(flag('port', 4319));
const CROWD = Number(flag('crowd', 0));
const DEVICES = flag('device', 'both') === 'both' ? ['desktop', 'phone'] : [flag('device')];
// e.g. --query 'safe=1' or 'hq=1', to measure one of the game's own rendering paths on purpose.
const QUERY = flag('query', '');

// ---------------------------------------------------------------- build and serve

function run(cmd, cmdArgs) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))));
  });
}

// Ask the operating system for a port nobody is on, rather than trusting a fixed one: a probe that
// died without cleaning up leaves its preview server behind, and the next run should not fail on it.
function freePort(preferred) {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(preferred, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
    s.on('error', () => {
      const s2 = createServer();
      s2.listen(0, () => {
        const { port } = s2.address();
        s2.close(() => ok(port));
      });
    });
  });
}

async function serve(port) {
  // `detached` makes the child a process-GROUP leader, which is the whole point: `npx vite preview`
  // is three processes -- npx, a shell, and the node running vite -- and a signal to the first
  // leaves the other two alive. They inherit the stdout pipe this process is still reading from, so
  // the handle never closes and `node tools/probe/probe.mjs` does not return to the shell after
  // printing its report. Measured: the run finished, the report printed, and the process sat there
  // at 0% CPU until it was killed, leaving a preview server behind every time.
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  // A run that is interrupted — Ctrl-C, a timeout, a thrown error — must not leave its server behind.
  // Twenty-three of them accumulated once before this was here, and they came back the moment the
  // kill stopped reaching the whole group.
  const stop = () => {
    try { process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone, or never grouped */ }
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
  process.on('uncaughtException', (e) => { stop(); console.error(e); process.exit(1); });
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('preview server did not start')), 30000);
    p.stdout.on('data', (d) => {
      if (/localhost:/.test(String(d))) {
        clearTimeout(timer);
        ok();
      }
    });
    p.on('exit', (code) => fail(new Error(`preview exited ${code}`)));
  });
  p.stop = stop;
  return p;
}

// The server handle carries its own killer, because only `serve` knows the child is a whole group.
function stopServer(p) {
  if (p && p.stop) p.stop();
}

// ---------------------------------------------------------------- measure

// Use whatever Chromium is already on the machine before asking Playwright to download one: CI images
// and sandboxes usually ship a build under PLAYWRIGHT_BROWSERS_PATH with a revision of its own.
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse();
  for (const d of dirs) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

async function measure(url, { mobile }) {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  // #53: the load number a player actually feels, which nothing captured before. 4 Mbps down and
  // 100ms RTT is what the load work was measured against (12.0s before, 9.2s after), so it is the
  // figure those numbers can be compared to. It is emulated in the browser rather than being a real
  // slow link, so treat it as one build against another, not as a promise about anyone's train.
  const THROTTLE = { downloadThroughput: (4 * 1000 * 1000) / 8, uploadThroughput: (1000 * 1000) / 8, latency: 100 };
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1280, height: 720 } },
  );
  const page = await context.newPage();

  const errors = [];
  // Decoded bytes, not bytes on the wire: `res.body()` hands back the response after any transfer
  // encoding is undone. That is the honest number to compare between two builds here, because the
  // preview server's compression settings are the same for both.
  const transfer = { bytes: 0, requests: 0, thirdParty: [] };
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', async (res) => {
    transfer.requests++;
    let u;
    try { u = new URL(res.url()); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') transfer.thirdParty.push(u.hostname);
    try {
      const body = await res.body();
      transfer.bytes += body.length;
    } catch { /* redirects and aborted requests have no body */ }
  });

  if (has('throttle')) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...THROTTLE });
  }
  // #53: the moment Play becomes clickable, recorded INSIDE the page. Snapshotting the byte counter
  // from here instead was wrong and looked right: waitForFunction polls, main.js starts fetching the
  // heavy models the instant the button enables, and whatever lands in the gap gets counted as load.
  // It is not a small error and it is not a constant one -- the same build measured 3666 kB on desktop
  // and 4511 kB on phone in one run, the difference being nothing but how busy the machine was.
  await page.addInitScript(() => {
    window.__playAt = new Promise((res) => {
      // Observed, not polled. main.js enables the button and starts fetching the deferred models on
      // the very next line, and over localhost those 1.2 MB can land inside a poll's own interval:
      // at 8ms this counted king_mounted, barracks and house as load and reported 4850 kB against a
      // true 3648. A MutationObserver runs at the microtask checkpoint after the attribute changes,
      // which is before any of that can come back.
      const done = () => res(performance.now());
      const watch = () => {
        const b = document.getElementById('start-btn');
        if (!b) return setTimeout(watch, 4);      // only until the parser reaches it
        if (!b.disabled) return done();
        new MutationObserver((_, o) => { if (!b.disabled) { o.disconnect(); done(); } })
          .observe(b, { attributes: true, attributeFilter: ['disabled'] });
      };
      watch();
    });
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });

  // Play is disabled until the rigs, the icons and the fonts are all in.
  const readyAt = Date.now();
  await page.waitForFunction(() => {
    const b = document.getElementById('start-btn');
    return b && !b.disabled;
  }, null, { timeout: 120000 });
  const loadMs = Date.now() - readyAt;
  // #53: the bytes budget in the README is "to the Play button", and this is the moment it means.
  // `transfer.bytes` keeps climbing all session -- main.js deliberately fetches the three heaviest
  // models behind the title screen, which is the whole point of LATER_RIGS -- so the running total is
  // nearly double this and asserting the README's 3 MB against it would fail a build that is well
  // inside budget. Both numbers are worth having; only one of them is the budget.
  // Resource Timing, filtered to what had finished by then, so the answer does not depend on when a
  // poll happened to fire. Same-origin, so decodedBodySize is populated.
  // Both, because they answer different questions and the budget only means one of them. The README
  // asks for under 3 MB "to the Play button" for "first play on mobile data" -- that is what comes
  // down the wire, and the 961 kB bundle is 272 kB of it once gzip has had it. Decoded is the honest
  // number for memory and the one the rest of this report uses; wire is the one the budget is about.
  const played = await page.evaluate(async () => {
    const at = await window.__playAt;
    let decoded = 0;
    let wire = 0;
    let n = 0;
    const take = (e) => {
      decoded += e.decodedBodySize || e.transferSize || 0;
      // encodedBodySize is the compressed body; transferSize adds headers and is 0 for a cache hit
      wire += e.encodedBodySize || e.transferSize || 0;
      n++;
    };
    for (const e of performance.getEntriesByType('resource')) {
      if (!e.responseEnd || e.responseEnd > at) continue;
      take(e);
    }
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) take(nav);
    return { decoded, wire, n };
  });
  const bytesToPlay = played.decoded;
  const wireToPlay = played.wire;
  const requestsToPlay = played.n;

  const errorScreen = await page.evaluate(() => {
    const el = document.getElementById('error-screen');
    return el && !el.classList.contains('hidden') ? document.getElementById('error-msg').textContent : null;
  });

  // Skip the stepped intro the way a returning player would, then start.
  await page.evaluate(() => {
    try { localStorage.setItem('crownrush-intro-seen', '1'); } catch { /* private mode */ }
  });
  await page.evaluate(() => window.game.start());

  // Night one holds eighteen characters and the Queen is still captive, so a plain run never sees the
  // crowd that the renderer is actually judged on. `--crowd N` frees her and puts N raiders and N/2
  // archers on the field at once: the same scene every run, which is what makes two builds comparable.
  if (CROWD) {
    await page.evaluate((n) => {
      const g = window.game;
      window.__seed = 20260914;
      g.freeQueen();
      const k = g.king.mesh.position;
      const ring = (i, total, r) => {
        const a = (i / total) * Math.PI * 2;
        return [k.x + Math.cos(a) * r, k.z + Math.sin(a) * r];
      };
      for (let i = 0; i < n; i++) {
        const [x, z] = ring(i, n, 9 + (i % 5) * 1.6);
        g.spawnEnemy(i % 7 === 0 ? 'brute' : i % 5 === 0 ? 'elite' : 'knight', x, z, i % 4);
      }
      for (let i = 0; i < Math.floor(n / 2); i++) {
        const [x, z] = ring(i, Math.floor(n / 2), 4 + (i % 3));
        g.spawnUnit(i % 3 === 0 ? 'swordsman' : 'archer', x, z);
      }
    }, CROWD);
  }

  // Sample while it plays. renderer.info is reset by three on every render, so it is read per sample
  // rather than accumulated.
  await page.evaluate(() => {
    window.__probe = { samples: [], lastT: performance.now() };
    const tick = () => {
      const g = window.game;
      const now = performance.now();
      window.__probe.samples.push({
        ms: now - window.__probe.lastT,
        calls: g.renderer.info.render.calls,
        tris: g.renderer.info.render.triangles,
        programs: g.renderer.info.programs ? g.renderer.info.programs.length : 0,
        geometries: g.renderer.info.memory.geometries,
        textures: g.renderer.info.memory.textures,
        chars: g.units.length + g.enemies.length,
        wave: g.wave,
      });
      window.__probe.lastT = now;
      window.__probe.raf = requestAnimationFrame(tick);
    };
    window.__probe.raf = requestAnimationFrame(tick);
  });

  // The sample runs for SECONDS of GAME time, not of wall-clock time.
  //
  // This matters more than it sounds. A frame here takes about a second under SwiftShader, and the
  // game caps dt at 0.05s, so ten seconds of waiting advances the simulation by about half a second.
  // Anything short-lived — spawn effects, hit sparks, arrows in flight, coins before they are picked
  // up — then sits on the field for the whole sample and is counted as though it were always there.
  // Pacing by wall-clock once had this report showing 660 draw calls of spawn effect where a real
  // device would have had four, and a ticket was written against that number before the error was
  // found. Both clocks are reported so the gap between them stays visible.
  const startGameTime = await page.evaluate(() => window.game.time);
  const wallDeadline = Date.now() + SECONDS * 1000 * 60;   // a backstop, not the measure
  let gameElapsed = 0;
  while (gameElapsed < SECONDS && Date.now() < wallDeadline) {
    await page.waitForTimeout(1000);
    gameElapsed = await page.evaluate((t0) => window.game.time - t0, startGameTime);
    await page.evaluate((n) => {
      const g = window.game;
      if (!g || !g.running || g.over) return;
      if (n) {
        const k = g.king.mesh.position;
        for (let i = g.enemies.length; i < n; i++) {
          // A seeded angle, not Math.random: the top-up has to place the same raiders in the same
          // places in every run, or two builds are being compared on two different scenes.
          window.__seed = (window.__seed * 1664525 + 1013904223) >>> 0;
          const a = (window.__seed / 4294967296) * Math.PI * 2;
          const r = 9 + ((window.__seed >>> 8) % 700) / 100;
          g.spawnEnemy(i % 7 === 0 ? 'brute' : i % 5 === 0 ? 'elite' : 'knight', k.x + Math.cos(a) * r, k.z + Math.sin(a) * r, i % 4);
        }
        g.king.hp = g.king.maxHp; // the King must survive the sample or the run ends early
        return;
      }
      if (typeof g.callWave === 'function') {
        try { g.callWave(); } catch { /* not offered right now */ }
      }
    }, CROWD);
  }
  const wallElapsed = (Date.now() - (wallDeadline - SECONDS * 1000 * 60)) / 1000;

  const shot = resolve(ROOT, '.shots', `probe-${mobile ? 'phone' : 'desktop'}.png`);
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });

  const raw = await page.evaluate(() => {
    cancelAnimationFrame(window.__probe.raf);
    return window.__probe.samples;
  });

  // What is actually in the scene at the end, so a draw-call total can be attributed rather than
  // guessed at. Counts every visible drawable, which is more than the renderer submits once frustum
  // culling has had its say, but it is the list the total is drawn from.
  const scene = await page.evaluate(() => {
    const g = window.game;
    const by = {};
    let drawables = 0;
    g.scene.traverse((o) => {
      if (!o.visible || !(o.isMesh || o.isSprite || o.isLine || o.isPoints)) return;
      drawables++;
      const name = o.material && o.material.name ? o.material.name : o.geometry && o.geometry.type ? o.geometry.type : '?';
      const key = o.isSprite ? 'Sprite' : `${o.isInstancedMesh ? 'Instanced' : o.isSkinnedMesh ? 'Skinned' : 'Mesh'}:${name}`;
      by[key] = (by[key] || 0) + 1;
    });
    return {
      drawables,
      top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8),
      crowd: typeof g.crowdStats === 'function' ? g.crowdStats() : null,
    };
  });

  await browser.close();

  // The first handful of frames include scene construction; drop them.
  const s = raw.slice(10);
  const pick = (k) => s.map((x) => x[k]).sort((a, b) => a - b);
  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
  const p95 = (arr) => (arr.length ? arr[Math.floor(arr.length * 0.95)] : 0);
  const peakAt = s.reduce((best, x) => (x.chars > (best ? best.chars : -1) ? x : best), null);

  return {
    device: mobile ? 'phone' : 'desktop',
    frames: s.length,
    loadMs,
    errorScreen,
    errors: [...new Set(errors)].slice(0, 10),
    throttled: has('throttle'),
    decodedKbToPlay: Math.round(bytesToPlay / 1024),
    wireKbToPlay: Math.round(wireToPlay / 1024),
    requestsToPlay,
    decodedKb: Math.round(transfer.bytes / 1024),
    requests: transfer.requests,
    thirdParty: [...new Set(transfer.thirdParty)],
    frameMsMedian: +median(pick('ms')).toFixed(2),
    frameMsP95: +p95(pick('ms')).toFixed(2),
    drawCallsMedian: median(pick('calls')),
    drawCallsPeak: Math.max(...pick('calls')),
    trianglesMedian: median(pick('tris')),
    charsMedian: median(pick('chars')),
    charsPeak: peakAt ? peakAt.chars : 0,
    callsAtPeakChars: peakAt ? peakAt.calls : 0,
    waveReached: Math.max(...s.map((x) => x.wave)),
    programs: s.length ? s[s.length - 1].programs : 0,
    geometries: s.length ? s[s.length - 1].geometries : 0,
    textures: s.length ? s[s.length - 1].textures : 0,
    gameSeconds: +gameElapsed.toFixed(1),
    wallSeconds: +wallElapsed.toFixed(1),
    drawables: scene.drawables,
    sceneTop: scene.top,
    crowd: scene.crowd,
  };
}

// ---------------------------------------------------------------- report

const fmt = (r) => [
  `  ${r.device}`,
  `    load to playable   ${r.loadMs} ms${r.throttled ? ' (4 Mbps / 100ms)' : ''} · ${r.wireKbToPlay} kB on the wire (${r.decodedKbToPlay} kB decoded) over ${r.requestsToPlay} requests`,
  `    whole session      ${r.decodedKb} kB over ${r.requests} requests   (the rest arrives behind the title screen)`,
  `    third-party        ${r.thirdParty.length ? r.thirdParty.join(', ') : 'none'}`,
  `    frame time         ${r.frameMsMedian} ms median · ${r.frameMsP95} ms p95   (SwiftShader: compare runs, not budgets)`,
  `    draw calls         ${r.drawCallsMedian} median · ${r.drawCallsPeak} peak`,
  `    at peak crowd      ${r.callsAtPeakChars} calls for ${r.charsPeak} characters`,
  `    triangles          ${(r.trianglesMedian / 1000).toFixed(0)}k median`,
  `    gpu objects        ${r.programs} programs · ${r.geometries} geometries · ${r.textures} textures`,
  r.crowd && r.crowd.characters ? `    instanced crowd    ${r.crowd.drawn}/${r.crowd.characters} characters in ${r.crowd.models} draws` : '',
  r.sceneTop ? `    scene              ${r.drawables} visible drawables · ${r.sceneTop.map(([k, n]) => `${k} x${n}`).join(', ')}` : '',
  `    sampled            ${r.gameSeconds}s of game time over ${r.wallSeconds}s of wall clock`,
  `    reached            night ${r.waveReached}`,
  r.errorScreen ? `    ERROR SCREEN       ${r.errorScreen}` : '',
  r.errors.length ? `    console errors     ${r.errors.join(' | ')}` : '',
].filter(Boolean).join('\n');

const delta = (a, b, key, unit = '', lowerIsBetter = true) => {
  const from = a[key];
  const to = b[key];
  if (from === to) return `    ${key.padEnd(18)} ${from}${unit} (unchanged)`;
  const pct = from ? (((to - from) / from) * 100).toFixed(1) : '—';
  const better = lowerIsBetter ? to < from : to > from;
  return `    ${key.padEnd(18)} ${from}${unit} -> ${to}${unit}  ${pct > 0 ? '+' : ''}${pct}%  ${better ? 'better' : 'worse'}`;
};

if (has('compare')) {
  const before = JSON.parse(readFileSync(resolve(ROOT, flag('compare')), 'utf8'));
  const after = JSON.parse(readFileSync(resolve(ROOT, flag('json', 'probe.json')), 'utf8'));
  console.log('\nChange\n');
  for (const device of ['desktop', 'phone']) {
    const a = before.find((x) => x.device === device);
    const b = after.find((x) => x.device === device);
    if (!a || !b) continue;
    console.log(`  ${device}`);
    for (const k of ['loadMs', 'decodedKb', 'frameMsMedian', 'drawCallsMedian', 'callsAtPeakChars', 'trianglesMedian']) console.log(delta(a, b, k));
    console.log('');
  }
  process.exit(0);
}

// #53: the README's budget table, in code, so a change that breaks one fails the build instead of
// being noticed months later. Two budgets had already drifted out of compliance unnoticed, and both
// were measurable at any point by this tool.
//
// Frame time is deliberately absent. This renders through SwiftShader, on the CPU, and frame time
// means nothing here -- tools/probe/README.md says so at length. Every number below is counted by
// three.js or by the network rather than by a driver, which is what makes it worth asserting at all.
//
// `crowd` says whether a budget only means anything with a late-game crowd on the field. The README
// says "late game" for draw calls and triangles, and a plain run never leaves night one.
const BUDGETS = [
  // wire, not decoded: the budget's reason is "first play on mobile data", which is what is actually
  // sent. Decoded is in the report beside it and is the number to watch for memory.
  { key: 'wireKbToPlay', limit: 3072, unit: ' kB', label: 'bytes to a clickable Play button' },
  { key: 'drawCallsPeak', limit: 400, unit: '', label: 'draw calls', crowd: true },
  { key: 'trianglesMedian', limit: 1000000, unit: '', label: 'triangles', crowd: true },
];

// A budget the game does not meet yet, and the ticket that will. It is reported loudly and does NOT
// fail the build, because a CI that is red for a reason everyone already knows teaches everyone to
// stop reading CI. Deleting the line here is how a budget comes back under guard.
const WAIVED = {
  // Measured 2026-09-16 with --crowd 120, 198 characters on the field:
  //   desktop  draw calls 1049 peak   triangles 2465k median
  //   phone    draw calls  904 peak   triangles 1056k median
  // Both are over, on both devices, and have been for a while. #52 is the cause and the fix: the
  // crowd models came back from Meshy at ~8.7k triangles against a stated ~5k budget, and they are
  // the ones drawn seventy times. Waived rather than asserted because turning CI red for something
  // already known and already ticketed just teaches everyone to stop reading CI.
  drawCallsPeak: '#52 -- crowd models are ~8.7k triangles against a ~5k budget',
  trianglesMedian: '#52 -- same cause',
  // PARKED BY THE OWNER, 2026-09-18, and this one is a decision rather than a defect. The load budget
  // is not being held while the game is still growing features, and it comes back off this list when
  // he says so -- not when a number happens to look better. Until then it is measured and printed,
  // because knowing the figure costs nothing, and it does not fail a build or gate a change.
  wireKbToPlay: 'parked until the game is feature-complete -- the owner will call when to look again',
};

function assertBudgets(results) {
  const rows = [];
  let failed = 0;
  let waived = 0;
  for (const r of results) {
    rows.push(`  ${r.device}`);
    for (const b of BUDGETS) {
      if (b.crowd && !CROWD) {
        rows.push(`    ${b.label.padEnd(34)} skipped -- needs --crowd N to mean anything`);
        continue;
      }
      const v = r[b.key];
      const ok = v <= b.limit;
      const note = WAIVED[b.key];
      if (!ok && note) waived++;
      else if (!ok) failed++;
      rows.push(`    ${b.label.padEnd(34)} ${String(v) + b.unit} against ${b.limit}${b.unit}   ${ok ? 'ok' : note ? `OVER, waived: ${note}` : 'OVER BUDGET'}`);
    }
    rows.push('');
  }
  console.log('\nBudgets\n');
  console.log(rows.join('\n'));
  if (waived) console.log(`  ${waived} budget${waived > 1 ? 's are' : ' is'} over and waived. That is a promise, not a pass.\n`);
  if (failed) {
    console.error(`  ${failed} budget${failed > 1 ? 's' : ''} over. The table in README.md is the contract; either the change comes back under it or the table changes with the reason why.\n`);
    return false;
  }
  return true;
}

if (!has('no-build')) await run('npx', ['vite', 'build']);
const port = await freePort(PORT);
const server = await serve(port);
try {
  // #219: SEED 0 ALWAYS, unless `--query` asks for something else. The hinterland is rolled per map
  // now, so an unqualified load gets a random one -- and a budget check that measures a different map
  // every run is measuring the seed rather than the change. Seed 0 is the hand-placed layout, which
  // is what every previous number in the README was taken against.
  const q = QUERY ? (/(^|&)seed=/.test(QUERY) ? QUERY : `seed=0&${QUERY}`) : 'seed=0';
  const url = `http://localhost:${port}/?${q}`;
  const results = [];
  for (const d of DEVICES) results.push(await measure(url, { mobile: d === 'phone' }));
  console.log('\nProbe\n');
  for (const r of results) console.log(fmt(r) + '\n');
  const out = flag('json', null);
  if (out) {
    writeFileSync(resolve(ROOT, out), JSON.stringify(results, null, 2));
    console.log(`  written to ${out}\n`);
  }
  const broke = results.filter((r) => r.errorScreen || r.errors.length);
  if (broke.length) {
    console.error('The game reported errors. See above.');
    process.exitCode = 1;
  }
  if (has('assert') && !assertBudgets(results)) process.exitCode = 1;
} finally {
  stopServer(server);
}
