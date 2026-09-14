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
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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
  return p;
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

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // Play is disabled until the rigs, the icons and the fonts are all in.
  const readyAt = Date.now();
  await page.waitForFunction(() => {
    const b = document.getElementById('start-btn');
    return b && !b.disabled;
  }, null, { timeout: 120000 });
  const loadMs = Date.now() - readyAt;

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

  // In crowd mode the field is topped back up every second, because the two sides kill each other and
  // a thinning crowd would quietly flatter whichever build was measured last. Otherwise, push the game
  // forward by calling each night as it is offered, so the sample is not twenty seconds of night one.
  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
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
    drawables: scene.drawables,
    sceneTop: scene.top,
    crowd: scene.crowd,
  };
}

// ---------------------------------------------------------------- report

const fmt = (r) => [
  `  ${r.device}`,
  `    load to playable   ${r.loadMs} ms · ${r.decodedKb} kB decoded over ${r.requests} requests`,
  `    third-party        ${r.thirdParty.length ? r.thirdParty.join(', ') : 'none'}`,
  `    frame time         ${r.frameMsMedian} ms median · ${r.frameMsP95} ms p95   (SwiftShader: compare runs, not budgets)`,
  `    draw calls         ${r.drawCallsMedian} median · ${r.drawCallsPeak} peak`,
  `    at peak crowd      ${r.callsAtPeakChars} calls for ${r.charsPeak} characters`,
  `    triangles          ${(r.trianglesMedian / 1000).toFixed(0)}k median`,
  `    gpu objects        ${r.programs} programs · ${r.geometries} geometries · ${r.textures} textures`,
  r.crowd && r.crowd.characters ? `    instanced crowd    ${r.crowd.drawn}/${r.crowd.characters} characters in ${r.crowd.models} draws` : '',
  r.sceneTop ? `    scene              ${r.drawables} visible drawables · ${r.sceneTop.map(([k, n]) => `${k} x${n}`).join(', ')}` : '',
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

if (!has('no-build')) await run('npx', ['vite', 'build']);
const port = await freePort(PORT);
const server = await serve(port);
try {
  const url = `http://localhost:${port}/${QUERY ? `?${QUERY}` : ''}`;
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
} finally {
  server.kill();
}
