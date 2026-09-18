// #179: the checks that need the real game. Headless Chromium against a real build -- seconds to a
// minute each, and no tokens. Everything here drives the same code a player does; nothing is mocked.
//
// Each check is `async (page, url) => result`. `page` is already on the game with a run started.

const ok = (note) => ({ pass: true, note });
const no = (...why) => ({ pass: false, detail: why.flat() });

// The timeouts here are 150s, which looks absurd for a page load and is not. Under SwiftShader a
// cold load of the real build measures 18 seconds to `load` and 22 to a world with a King in it, on
// an idle machine -- and the machine is not idle when anyone runs this, because a dev server is
// usually up. At 60s the whole sweep came back red once for exactly that reason. Wall clock is free
// here (no tokens, no service), and a false red is not.
//
// Start a run and wait until the world exists.
async function boot(page, url, query = '?tour') {
  await page.goto(url + query, { waitUntil: 'load', timeout: 150000 });
  await page.waitForFunction(() => window.game && window.game.king && window.game.walls, null, { timeout: 150000 });
  await page.waitForTimeout(1200);
}

export const CHEAP = {
  async 'views-open'(page, url) {
    // Every `?view=` the board frames, and what each one must actually have put on the screen.
    //
    // ASSERTING THE PANEL, not just that the game is running. The first version checked "no error
    // screen, a King exists, not on the title" and would have passed a `?view=settings` that showed
    // no settings at all -- which is the failure this whole file exists to catch, since a board frame
    // showing the wrong thing looks exactly like a board frame showing the right thing. The text
    // length is the second half of it: an overlay can be visible and empty.
    const VIEWS = [
      ['?tour', null], ['?view=map', null], ['?view=stable', null], ['?view=road', null], ['?view=elements', 'elements-sheet'],
      ['?view=keep', 'keep-screen'], ['?view=levelup', 'offer-screen'], ['?view=scores', 'scores-screen'],
      ['?view=cast', 'cast-screen'], ['?view=diary', 'diary-screen'], ['?view=settings', 'settings-screen'],
      ['?view=credits', 'credits-screen'], ['?view=pause', 'pause-screen'],
      ['?view=defeat', 'gameover-screen'], ['?view=victory', 'victory-screen'],
    ];
    const bad = [];
    for (const [q, panel] of VIEWS) {
      await page.goto(url + q, { waitUntil: 'load', timeout: 150000 });
      // WAIT FOR THE GAME, not for the clock. `load` fires long before the models are in and the run
      // has started, and a flat sleep after it reported `?view=cast` and `?view=levelup` as broken
      // when both open perfectly in a real browser -- they just had not got there yet at four
      // seconds of SwiftShader. CLAUDE.md says wall-clock is not game time here; this is what that
      // costs when you forget. Wait for the world, then wait for the panel, and only then look.
      try {
        await page.waitForFunction(() => window.game && window.game.king, null, { timeout: 150000 });
        if (panel) {
          await page.waitForFunction((id) => {
            const e = document.getElementById(id);
            return e && !e.classList.contains('hidden');
          }, panel, { timeout: 60000 });
        }
      } catch (e) { /* fall through and let the assertions below say what was actually on screen */ }
      await page.waitForTimeout(600);
      const r = await page.evaluate((id) => {
        const up = (el) => el && !el.classList.contains('hidden');
        const el = id && document.getElementById(id);
        return {
          err: up(document.getElementById('error-screen')),
          msg: document.getElementById('error-msg').textContent,
          running: !!(window.game && window.game.king),
          titleUp: up(document.getElementById('start-screen')),
          missing: id ? !el : false,
          panelUp: id ? up(el) : false,
          words: id && el ? el.innerText.trim().length : 0,
        };
      }, panel);
      if (r.err) bad.push(`${q}: error screen -- ${r.msg}`);
      else if (!r.running) bad.push(`${q}: no game`);
      else if (r.titleUp) bad.push(`${q}: stuck on the title screen`);
      else if (r.missing) bad.push(`${q}: there is no #${panel} in the page`);
      else if (panel && !r.panelUp) bad.push(`${q}: the game ran but #${panel} never opened`);
      else if (panel && r.words < 20) bad.push(`${q}: #${panel} opened with ${r.words} characters in it`);
    }
    return bad.length ? no(bad) : ok(`${VIEWS.length} views, each with its panel up`);
  },

  async 'walls-solid'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(async () => {
      const g = window.game;
      // DRIVE HIM AT IT, rather than reasoning about a wall section's geometry. The first version of
      // this check built a normal from `w.ang` and asked whether a probe point crossed the line; it
      // reported every section as permeable while `wall-ring-unbroken` found 360 of 360 samples
      // solid. Two checks disagreeing means one of them is wrong, and it was this one -- it was
      // measuring my arithmetic, not the game. Walking him into it exercises the same path a player
      // does and needs no theory at all.
      const bounds = { r: 19.5 };
      const bad = [];
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        // start well inside, push outward for long enough to cross if anything would let him
        g.king.mesh.position.set(Math.cos(a) * 12, 0, Math.sin(a) * 12);
        const gate = g.walls.some((w) => w.gate && Math.hypot(w.mx - Math.cos(a) * 19.2, w.mz - Math.sin(a) * 19.2) < 7);
        if (gate) continue;                       // a gate is supposed to let him out
        for (let i = 0; i < 260; i++) {
          const p = g.king.mesh.position;
          p.x += Math.cos(a) * 0.22;
          p.z += Math.sin(a) * 0.22;
          g.collideWalls(p, 0.5, true);
        }
        const p = g.king.mesh.position;
        const out = Math.hypot(p.x, p.z);
        if (out > bounds.r + 1.5) bad.push(`at ${Math.round((a * 180) / Math.PI)}° he reached ${out.toFixed(1)} from the middle`);
      }
      return bad;
    });
    return r.length ? no(r.slice(0, 8)) : ok('24 directions, held every time');
  },

  async 'gates-passable'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const gates = g.walls.filter((w) => w.gate);
      const bad = [];
      for (const w of gates) {
        const v = new (g.king.mesh.position.constructor)(w.mx, 0, w.mz);
        const was = { x: v.x, z: v.z };
        g.collideWalls(v, 0.5, true);
        if (Math.hypot(v.x - was.x, v.z - was.z) > 0.01) bad.push(`gate at [${w.mx.toFixed(1)}, ${w.mz.toFixed(1)}] is shut`);
      }
      return { bad, gates: gates.length };
    });
    if (!r.gates) return no('no gates found at all');
    return r.bad.length ? no(r.bad) : ok(`${r.gates} gates`);
  },

  async 'wall-ring-unbroken'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      // walk a ring just inside the wall and check every sample is either pushed (solid) or within
      // a gate's own width of a gate centre
      const gates = g.walls.filter((w) => w.gate);
      const holes = [];
      const R = 19.2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 180) {
        const x = Math.cos(a) * R;
        const z = Math.sin(a) * R;
        const v = new (g.king.mesh.position.constructor)(x, 0, z);
        const was = { x, z };
        g.collideWalls(v, 0.5, true);
        const solid = Math.hypot(v.x - was.x, v.z - was.z) > 0.01;
        if (solid) continue;
        const nearGate = gates.some((w) => Math.hypot(w.mx - x, w.mz - z) < 6);
        if (!nearGate) holes.push(`[${x.toFixed(1)}, ${z.toFixed(1)}]`);
      }
      return { holes, gates: gates.length };
    });
    return r.holes.length ? no(`${r.holes.length} points on the ring are neither wall nor gate`, r.holes.slice(0, 6)) : ok('360 samples');
  },

  async 'opening-resolves'(page, url) {
    await page.goto(url, { waitUntil: 'load', timeout: 150000 });
    await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, null, { timeout: 150000 });
    const r = await page.evaluate(async () => {
      document.getElementById('start-btn').click();
      const sk = document.getElementById('intro-skip'); if (sk) sk.click();
      await new Promise((res) => setTimeout(res, 600));
      const g = window.game;
      for (let i = 0; i < 2000; i++) {
        g.running = true; g.paused = false;
        const kp = g.king.mesh.position;
        kp.x = Math.max(-18, Math.min(18, kp.x + 0.28));   // run flat out the whole time
        g.update(0.05);
        if (g.queen.captive) return { took: true, frames: i };
      }
      return { took: false, openT: g.openT, snatched: g.snatched };
    });
    return r.took ? ok(`taken after ${r.frames} frames of running`) : no(`she was never taken (openT ${r.openT}, snatched ${r.snatched})`);
  },

  async 'queen-visible'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(async () => {
      const g = window.game;
      const bad = [];
      // #180: this check is RIGHT, and was disbelieved twice before it was reproduced. It reported
      // Wren inside the King and the first two readings of it were "the harness is starting mid-
      // settle" -- a settle wait was added, the number got worse, and the settle wait came out again.
      // Driving it in a real browser is what settled it: turn the King 180 degrees and her follow
      // point flips to the far side, and she walks THROUGH him to reach it. Closest approach 0.04.
      // Nothing to do with SwiftShader. The lesson is in #179 and it is not the one #179 first said.
      for (let i = 0; i < 400; i++) {
        g.running = true; g.paused = false;
        if (i === 120) g.king.mesh.position.set(-6, 0, 9);
        if (i === 240) g.king.mesh.position.set(0, 0, 2);   // the Keep's own doorstep
        g.update(0.05);
        const q = g.queen;
        const d = Math.hypot(q.mesh.position.x - g.king.mesh.position.x, q.mesh.position.z - g.king.mesh.position.z);
        if (q.inKeep) { bad.push(`inKeep at frame ${i}`); break; }
        if (q.mesh.position.y > 0.5) { bad.push(`off the ground (y ${q.mesh.position.y.toFixed(1)}) at frame ${i}`); break; }
        if (d < 0.8) { bad.push(`inside the King (${d.toFixed(2)} apart) at frame ${i}`); break; }
      }
      return bad;
    });
    return r.length ? no(r) : ok('400 frames, including on the Keep doorstep');
  },

  async 'rebuild-after-fall'(page, url) {
    await page.goto(url, { waitUntil: 'load', timeout: 150000 });
    await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, null, { timeout: 150000 });
    const r = await page.evaluate(async () => {
      document.getElementById('start-btn').click();
      const sk = document.getElementById('intro-skip'); if (sk) sk.click();
      await new Promise((res) => setTimeout(res, 600));
      const g = window.game;
      const tick = (n) => { for (let i = 0; i < n; i++) { g.running = true; g.paused = false; g.update(0.05); } };
      tick(700);                                     // past the calm and the fall
      if (!g.snatched) return { bad: ['the fall never happened'] };
      const bad = [];
      if (g.structures.length) bad.push(`${g.structures.length} buildings still standing`);
      if (g.baseLevel !== 0) bad.push(`level is ${g.baseLevel}, not 0`);
      if (Object.keys(g.built).length) bad.push(`ledger still has ${Object.keys(g.built).length} entries`);
      if (g.keep) bad.push('the Keep record survived');
      // free her, then check the first mat can actually be bought
      for (const e of [...g.enemies]) if (e.escort) g.removeEnemy(e);
      g.king.mesh.position.copy(g.queen.mesh.position);
      tick(40);
      if (g.queen.captive) bad.push('she could not be freed');
      // BUYING IT HAS TO PUT SOMETHING ON THE FIELD -- and where that something is recorded depends
      // on the kind. `buildStructure` deliberately keeps the trade post OUT of `structures` and hangs
      // it on `tradePost` instead, because it is not a thing raiders attack. The first version of
      // this took the first pad with a `structure` and asserted `structures.length`, which picked the
      // trade post and reported "buying a mat built nothing" against a game that had built it
      // correctly. The fourth check in this file to be wrong about the game rather than the other way
      // round; the tell is the same every time, an assertion that knows one shape of a right answer.
      const pads = g.pads.filter((p) => p.def.structure);
      if (!pads.length) bad.push('no buildable mat after the fall');
      for (const pad of pads) {
        const kind = pad.def.structure;
        const before = kind === 'bank' ? !!g.tradePost : g.structures.length;
        g.coinsCarried = 999;
        g.completePad(pad);
        const after = kind === 'bank' ? !!g.tradePost : g.structures.length;
        if (kind === 'bank' ? !after : after <= before) bad.push(`buying "${pad.def.id}" (${kind}) built nothing`);
      }
      return { bad };
    });
    return r.bad.length ? no(r.bad) : ok('empty plot, clear ledger, every mat on it buys');
  },
};
