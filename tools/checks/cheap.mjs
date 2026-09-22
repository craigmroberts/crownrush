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
// #179: WAIT FOR THE GAME, NOT FOR A CLOCK -- and "the world exists" is not "the world is ready".
//
// This used to wait for `game.king` and then sleep 1200ms, and that sleep is the single line behind
// three wrong checks. Measured in a real browser: `?tour` satisfies the wait at **frame 7** with the
// King still on his opening mark at [0, 2]; he is moved to [0, 8] at **frame 11**, and Wren walks in
// and settles at **frame 15** -- 22 seconds of wall clock after load, because a SwiftShader frame is
// about a second. 1200ms is a fraction of ONE frame. Every check that started there was reading the
// opening mid-placement and reporting what it saw as a bug.
//
// So the wait is on the game's own clock. Settled means the King has not moved for three consecutive
// animation frames -- `polling: 'raf'` samples exactly once per frame, which is the only sampling
// rate that means anything here. The frame floor is there because he is already still before the
// opening moves him, so three quiet frames on their own would hand over too early.
//
// AND THERE IS A CEILING, which matters more than it looks. Some views walk him, and a King who
// never stops moving would never satisfy a settle test -- so after `BOOT_MAX` frames it gives up
// waiting and proceeds. A check that is slightly early is a check with a chance of being wrong; a
// 150-second timeout is a red beside "the walls are solid" saying the walls leak, and this file
// already exists because of what that costs.
const BOOT_MIN = 14, BOOT_MAX = 30;
async function boot(page, url, query = '?tour') {
  await page.goto(url + query, { waitUntil: 'load', timeout: 150000 });
  await page.waitForFunction(() => window.game && window.game.king && window.game.walls, null, { timeout: 150000 });
  await page.waitForFunction(([min, max]) => {
    const g = window.game;
    if (!g || !g.king) return false;
    const p = g.king.mesh.position;
    const s = window.__settle || (window.__settle = { n: 0, x: NaN, z: NaN });
    if (Math.abs(p.x - s.x) < 0.01 && Math.abs(p.z - s.z) < 0.01) s.n++; else s.n = 0;
    s.x = p.x; s.z = p.z;
    const f = g.frames || 0;
    return f >= max || (f >= min && s.n >= 3);
  }, [BOOT_MIN, BOOT_MAX], { timeout: 150000, polling: 'raf' });
}

// #244: THE REAL FIRST TWO MINUTES. `boot` uses `?tour`, which holds the morning for ever so the
// board can look at it; these checks need the morning to end. So: a fresh profile with the intro
// marked seen, the title, Play, and the run as a new player gets it. The render is then stubbed and
// the game's own "world is not drawing" watchdog cleared, because under SwiftShader the render is
// the whole cost of a frame and nothing here reads a pixel -- game time runs at wall speed.
async function playFresh(page, url) {
  await page.addInitScript(() => { try { localStorage.setItem('crownrush-intro-seen', '1'); } catch (e) { /* private mode */ } });
  await page.goto(url, { waitUntil: 'load', timeout: 150000 });
  await page.waitForSelector('#start-btn:not([disabled])', { timeout: 150000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.game && window.game.running && window.game.king, null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.game;
    clearTimeout(g.renderWatch);
    g.renderWatch = null;
    g.renderer.render = () => {};
    if (g.post && g.post.composer) g.post.composer.render = () => {};
  });
}
// the picket, as a bot: `stand` walks up and shoots, `kite` steps away from anyone inside 4.5. Both
// walk to her once the guards are down, which is what frees her (`freeRadius`) and what a player does.
const PICKET_BOT = `(style, seconds) => new Promise((done) => {
  const g = window.game; const k = g.king; const q = g.queen;
  const vec = { x: 0, z: 0, mag: 0 }; const real = g.input.read; g.input.read = () => vec;
  k.mesh.position.set(q.mesh.position.x, 0, q.mesh.position.z + 12);
  const t0 = g.time; let minHp = k.hp; const deaths0 = g.picketDeaths || 0;
  const step = () => {
    const kp = k.mesh.position; let near = null; let nd = 1e9;
    for (const e of g.enemies) { if (e.hp <= 0) continue; const d = e.mesh.position.distanceTo(kp); if (d < nd) { nd = d; near = e; } }
    const guards = g.enemies.filter((e) => e.rescue && e.hp > 0).length;
    if (!guards && kp.distanceTo(q.mesh.position) > 2) { const dx = q.mesh.position.x - kp.x; const dz = q.mesh.position.z - kp.z; const l = Math.hypot(dx, dz) || 1; vec.x = dx / l; vec.z = dz / l; vec.mag = 1; }
    else if (style === 'kite' && near && nd < 4.5) { const dx = kp.x - near.mesh.position.x; const dz = kp.z - near.mesh.position.z; const l = Math.hypot(dx, dz) || 1; vec.x = dx / l; vec.z = dz / l; vec.mag = 1; }
    else if (style === 'kite' && kp.distanceTo(q.mesh.position) > 7) { const dx = q.mesh.position.x - kp.x; const dz = q.mesh.position.z - kp.z; const l = Math.hypot(dx, dz) || 1; vec.x = dx / l; vec.z = dz / l; vec.mag = 1; }
    else { vec.x = 0; vec.z = 0; vec.mag = 0; }
    if (k.hp < minHp) minHp = k.hp;
    if (g.time - t0 < seconds && !g.over && q.captive) return requestAnimationFrame(step);
    g.input.read = real;
    done({ seconds: +(g.time - t0).toFixed(1), freed: !q.captive, over: !!g.over, hp: Math.round(k.hp), minHp: Math.round(minHp), deaths: (g.picketDeaths || 0) - deaths0, guards: g.enemies.filter((e) => e.rescue).length });
  };
  requestAnimationFrame(step);
})`;
async function waitForPicket(page) {
  await page.waitForFunction(() => { const g = window.game; return g.queen.captive && !g.queen.taken && g.enemies.some((e) => e.captor); }, null, { timeout: 150000 });
}

// #179: MAKE A CHECK PROVE IT CAN FAIL.
//
// Every one of the four checks that were wrong about the game passed review because the reasoning
// looked right. None had ever been run against a deliberately broken game to confirm it went red for
// the reason claimed -- and a check that has never failed on purpose has not been tested.
//
// `npm run check -- --prove` breaks the game in the way each check exists to catch, runs the check,
// and expects it to go RED. A check that stays green under its own sabotage is not covering what the
// registry says it covers. A check with no sabotage written is reported as such rather than counted:
// an honest gap, the same way `judged` rows are.

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
      ['?tour', null], ['?view=map', null], ['?view=stable', null], ['?view=road', null], ['?view=mesa', null], ['?view=elements', 'elements-sheet'],
      // #218 and #220. THIS LIST IS HAND-WRITTEN AND THAT IS ITS ONE WEAKNESS: a `?view=` added to
      // the game and to the board is not covered until it is added here too, and nothing says so --
      // `?view=camp` shipped with #218 and went two tickets before anybody noticed the count had not
      // moved. The number in the note is the tell; if it does not go up when a frame is added, the
      // frame is not being checked.
      ['?view=camp', null], ['?view=picks', 'picks-screen'], ['?view=plateau', null], ['?view=trade', null],   // #223, #236
      // #194: the same view at a pinned time of day, and its red twin. The third column is the phase
      // the URL asked for, because "the page loaded" is not the assertion that matters here -- a
      // `?phase=` that quietly did nothing would open the road at the morning and pass everything
      // above, and the board would be showing five copies of one sky under five different labels.
      ['?view=road&phase=0.62', null, 0.62], ['?view=road&phase=0.64&blood=1', null, 0.64],
      ['?view=keep', 'keep-screen'], ['?view=levelup', 'offer-screen'], ['?view=scores', 'scores-screen'],
      ['?view=cast', 'cast-screen'], ['?view=diary', 'diary-screen'], ['?view=settings', 'settings-screen'],
      ['?view=credits', 'credits-screen'], ['?view=pause', 'pause-screen'],
      // #206: both shapes of the release panel. Two rows rather than one because they are two
      // different things to look at -- the list, and the greeting an update opens by itself.
      ['?view=releases', 'release-screen'], ['?view=whatsnew', 'release-screen'],
      ['?view=defeat', 'gameover-screen'], ['?view=victory', 'victory-screen'],
      ['?view=report', 'report-screen'],   // #182
    ];
    const bad = [];
    for (const [q, panel, phase] of VIEWS) {
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
          phase: window.game ? +window.game.dayPhase.toFixed(3) : null,
        };
      }, panel);
      if (r.err) bad.push(`${q}: error screen -- ${r.msg}`);
      else if (!r.running) bad.push(`${q}: no game`);
      else if (r.titleUp) bad.push(`${q}: stuck on the title screen`);
      else if (r.missing) bad.push(`${q}: there is no #${panel} in the page`);
      else if (panel && !r.panelUp) bad.push(`${q}: the game ran but #${panel} never opened`);
      else if (panel && r.words < 20) bad.push(`${q}: #${panel} opened with ${r.words} characters in it`);
      else if (phase !== undefined && Math.abs(r.phase - phase) > 1e-3) bad.push(`${q}: asked for phase ${phase}, the run is at ${r.phase}`);
    }
    return bad.length ? no(bad) : ok(`${VIEWS.length} views, each with its panel up`);
  },

  // #206: the update greeting, and it is here for the same reason the band hook below is -- every
  // way it fails is quiet, and two of the three ways are invisible to the person it fails.
  //
  //   it never opens        -> looks exactly like a build with nothing to announce
  //   it opens every load   -> looks like a bug in something else, and gets dismissed faster each time
  //   it opens for a NEW player -> a window telling somebody what changed about a game they have
  //                                never seen. Nobody who has the game installed will ever see this
  //                                one happen, which is precisely why it needs a check.
  //
  // Driven by moving the marker rather than by waiting for a deploy: `crownrush-release-seen` is the
  // whole of the state, so a browser one release behind is one `setItem` away and a phone that has
  // never opened the game is one `removeItem` away. Three cold loads, because the decision is taken
  // once at boot and there is no other way to take it again.
  async 'release-greeting'(page, url) {
    const bad = [];
    const KEY = 'crownrush-release-seen';
    // Ready, not loaded: `announceRelease` runs where Play goes live, which is after the models are
    // in -- about 20 seconds of SwiftShader past `load`. A check that looked at `load` would find
    // the greeting not yet open and call that quiet. Then a beat, because "Play is live" is the
    // frame the decision is taken on and the panel opens inside it.
    const ready = async (q = '') => {
      await page.goto(url + q, { waitUntil: 'load', timeout: 150000 });
      await page.waitForFunction(() => {
        const b = document.getElementById('start-btn');
        return b && !b.disabled;
      }, null, { timeout: 150000 });
      await page.waitForTimeout(1200);
    };
    const look = () => page.evaluate((k) => {
      const el = document.getElementById('release-screen');
      return {
        up: !!el && !el.classList.contains('hidden'),
        title: (document.getElementById('rel-title') || {}).textContent || '',
        entries: document.querySelectorAll('#rel-body .dy-entry').length,
        fixes: document.querySelectorAll('#rel-body .rel-fix').length,
        mark: localStorage.getItem(k),
      };
    }, KEY);

    // A browser that has never opened the game. Nothing stored, so nothing to be behind.
    await ready();
    let r = await look();
    if (r.up) bad.push('a first-ever visit was greeted with what changed since a release it never saw');
    if (r.mark == null) bad.push('a first-ever visit left no marker, so the NEXT load would greet them');

    // Now a browser that is behind. `0` is behind every release there is, and needs no knowledge of
    // which one is newest -- which is what keeps this check from having to be edited every time a
    // release is written.
    await page.evaluate((k) => localStorage.setItem(k, '0'), KEY);
    await ready();
    r = await look();
    if (!r.up) bad.push('a browser behind every release was not greeted at all');
    else {
      if (!/new/i.test(r.title)) bad.push(`greeted with "${r.title}" rather than what is new`);
      if (!r.entries) bad.push('the greeting opened with no releases in it');
      // The half of the ticket that is a judgement: fixes are listed, never announced.
      if (r.fixes) bad.push(`the greeting announced ${r.fixes} bug fixes, which is what it exists not to do`);
    }

    // And it is over. The marker moved when it was shown, so the next load is quiet.
    await ready();
    r = await look();
    if (r.up) bad.push('the greeting opened again on the next load: it is not being marked read');

    return bad.length ? no(bad) : ok('quiet for a new player, shown once to one behind, quiet after');
  },

  // #208: a man sent to a post gets to it, even when there is a wall between him and it.
  //
  // He is picked for being nearest the KING, and the King is as happily outside the ring as in, so
  // "the post is on the other side of a wall" is an ordinary Tuesday rather than a corner case. The
  // walk was a straight line and `collideWalls` held him against the stone: reported from a phone as
  // "an archer just walking into the wall he seems stuck", and he stayed there for the rest of the
  // run with his walk animation playing.
  //
  // Set up deliberately rather than waited for: stand a fresh archer outside a solid section and
  // assign him to a point inside it, which is the exact geometry of the report and takes one frame
  // to arrange instead of a night of play to stumble into.
  //
  // THE BUDGET IS IN FRAMES, NOT SECONDS, and that is the whole reason this check can fail honestly.
  // A Playwright timeout comes back amber as "could not run"; a frame budget that runs out is the
  // check saying no. The walk measured 41 frames with the detour in it, so 90 is more than twice the
  // room it needs.
  //
  // AND THE TWO CLOCKS HAVE TO BE TOLD APART, which cost a run to learn: a SwiftShader frame is about
  // a second, so a 150-frame budget under a 150s timeout is the timeout every time, and the sabotage
  // came back amber as "could not run" instead of red. The budget has to finish well inside the wall
  // clock or it is not the thing deciding.
  async 'post-walk-unblocked'(page, url) {
    await boot(page, url);
    const setup = await page.evaluate(() => {
      const g = window.game;
      const solid = g.wallSections(0, 'all').filter((s) => !s.gate);
      if (!solid.length) return { err: 'the opening village stood no solid wall to be stuck on' };
      const sec = solid[0];
      // straight in and straight out from the middle of that section, so the line he has to walk
      // crosses it square on
      const ix = -sec.mx, iz = -sec.mz;
      const il = Math.hypot(ix, iz) || 1;
      const post = [sec.mx + (ix / il) * 3, sec.mz + (iz / il) * 3];
      const out = [sec.mx - (ix / il) * 3, sec.mz - (iz / il) * 3];
      const a = g.spawnUnit('archer', out[0], out[1]);
      a.popT = 0;
      a.mesh.scale.setScalar(a.scale);
      a.assign = [post[0], post[1], 0];
      a.assignTower = null;
      g.__postWalk = a;
      g.__postWalkFrom = g.frames;
      return { post: post.map((v) => +v.toFixed(2)), from: out.map((v) => +v.toFixed(2)) };
    });
    if (setup.err) return no(setup.err);
    await page.waitForFunction((budget) => {
      const g = window.game;
      return !g.units.includes(g.__postWalk) || g.frames - g.__postWalkFrom > budget;
    }, 90, { timeout: 200000, polling: 'raf' });
    const r = await page.evaluate(() => {
      const g = window.game;
      const a = g.__postWalk;
      const p = a.mesh.position;
      return {
        arrived: !g.units.includes(a),
        frames: g.frames - g.__postWalkFrom,
        at: [+p.x.toFixed(2), +p.z.toFixed(2)],
        toPost: a.assign ? +Math.hypot(a.assign[0] - p.x, a.assign[1] - p.z).toFixed(2) : null,
        onDeck: g.turrets.length,
      };
    });
    if (!r.arrived) {
      return no(`sent to a post across a wall, he is still ${r.toPost} from it after ${r.frames} frames, stopped at (${r.at[0]}, ${r.at[1]})`);
    }
    return ok(`across a wall and onto his post in ${r.frames} frames`);
  },

  // #185/#186: the band hook, and it is here because EVERY WAY IT FAILS IS QUIET.
  //
  // The patch works by rewriting one line inside three's `lights_physical_pars_fragment`. If three
  // ever renames that line the replace is a no-op, the shader compiles perfectly, and the game
  // renders exactly as it did before with nothing in the console -- so `bandedShader` is set only
  // when all three replaces changed something, and this reads it back off the live materials.
  //
  // The keys are the other half. `customProgramCacheKey` is what stops two materials with matching
  // DEFINES being handed each other's compiled program (#155), so `band` APPENDS to whatever key was
  // there rather than replacing it. A key of plain '+band' would mean the ground had thrown away
  // 'ground-untiled-patched' and is racing the tufts for a program.
  //
  // THE SWEEP IS THE POINT OF THE SECOND HALF. #186 put every environment surface on one ramp, and
  // the way that decays is somebody adding a surface later and nobody noticing it is the one thing
  // still on a smooth ramp. So rather than name the materials, this walks the scene and requires
  // every lit standard material with real geometry on it to be banded -- with an allowlist of the
  // things that are deliberately NOT: the character rigs and the imported props, which #184 puts out
  // of scope. Anything else new has to be argued for here, which is the intent.
  async 'bands-hooked'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      // What lives on the scene rather than under the run's root and is deliberately NOT banded, each
      // for its own reason: the crowd's per-model meshes and the imported rigs and props, which #184
      // puts out of scope; the coin field, which is a gameplay object and not a surface; the chimney
      // smoke, which is a soft volumetric fake that hard steps would read as a fault on; and the
      // river, which is #188's. Every one of them carries a cache key so it can be named here
      // instead of turning up as an anonymous white surface.
      const OUT_OF_SCOPE = /^(crowd-lit-|crownrush-prop-tint|crownrush-rig|coin-alpha|smoke-alpha|river-water)/;
      const g = window.game;
      const named = {};
      const rogues = new Map();
      // THE BOUNDARY IS WHERE THE OBJECT LIVES. `buildWorld` adds to the SCENE; everything a run
      // spawns -- characters, coins, pads, the buildings it stands up -- goes under `game.root`.
      // That line is exactly "environment" against "characters and props", so it is the one this
      // draws, rather than trying to recognise a character by the colour of its leather.
      const inRun = new Set();
      if (g.root) g.root.traverse((o) => inRun.add(o));
      g.scene.traverse((o) => {
        if (!(o.isMesh || o.isInstancedMesh) || !o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          // Lit standard materials only: a Basic or Lambert material never runs the chunk this
          // patches, so "not banded" is meaningless for the contact discs and the ghost.
          if (m.type !== 'MeshStandardMaterial' && m.type !== 'MeshPhysicalMaterial') continue;
          const key = (m.customProgramCacheKey ? m.customProgramCacheKey() : '') || '';
          if (key.startsWith('ground-untiled')) named.ground = { key, shader: !!m.userData.bandedShader };
          if (key.startsWith('sway-tinted-rooted')) named.tufts = { key, shader: !!m.userData.bandedShader };
          if (key.startsWith('baked-sway')) named.canopies = { key, shader: !!m.userData.bandedShader };
          if (m.userData.banded || OUT_OF_SCOPE.test(key) || inRun.has(o)) continue;
          const geo = o.geometry;
          const tri = geo ? (geo.index ? geo.index.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0)) : 0;
          const n = o.isInstancedMesh ? (o.count || 0) : 1;
          if (tri * n < 200) continue;    // a handful of triangles is a fitting, not a surface
          const k = m.uuid;
          const row = rogues.get(k) || { colour: m.color ? '#' + m.color.getHexString() : '-', key: key.slice(0, 40), tris: 0 };
          row.tris += tri * n;
          rogues.set(k, row);
        }
      });
      return { named, rogues: [...rogues.values()] };
    });
    const bad = [];
    // EXACT, not a prefix, and that is the point of it: a cache key changing is the #155 class, so a
    // key that moves has to be acknowledged here rather than quietly accepted. #200 moved the tufts'
    // from `sway-tinted-rooted` to `sway-tinted-rooted-feet` because that material now compiles with
    // the foot-parting loop and the wheat's does not -- two shaders with matching defines and
    // different hooks is exactly what this key exists to keep apart. This check caught that change on
    // the run it landed, which is the system working.
    for (const [what, want] of [['ground', 'ground-untiled-patched+band'], ['tufts', 'sway-tinted-rooted-feet+band'], ['canopies', 'baked-sway+band']]) {
      const got = r.named[what];
      if (!got) bad.push(`${what}: no material with that key is in the scene at all`);
      else if (got.key !== want) bad.push(`${what}: cache key is "${got.key}", wanted "${want}"`);
      else if (!got.shader) bad.push(`${what}: compiled without the patch -- three's dotNL line has moved`);
    }
    for (const x of r.rogues.sort((a, b) => b.tris - a.tris).slice(0, 6)) {
      bad.push(`un-banded lit surface: ${x.colour}, ${Math.round(x.tris / 100) / 10}k triangles, key "${x.key}"`);
    }
    return bad.length ? no(bad) : ok('ground, tufts and canopies banded; every lit world surface over 200 triangles with them');
  },

  // #189: the post pass, and the three ways it fails without anything saying so.
  //
  // DOUBLED OR MISSING TONE MAPPING is the first. With a composer the scene renders into a target,
  // so three gives every material `NoToneMapping` by itself and `OutputPass` applies ACES at the
  // end. Get that wrong in either direction and the game still runs, still looks like a game, and
  // is simply a different picture from the one that was tuned.
  //
  // It cannot be checked by "does the composer match a direct render", which was the first attempt:
  // this frame is 13,000 grass blades, so almost every pixel is an edge, and an HDR target resolved
  // once differs from an 8-bit canvas at every one of them. The answer is a RATIO. The composer is
  // compared against a direct render with ACES and against a direct render with tone mapping off,
  // and it has to be far nearer the first. That is true whatever the edges do.
  // #197: the HUD stays quiet when nothing has changed, and the tally lands on its number.
  //
  // `Hud.set` runs EVERY FRAME and dirty-checks everything it writes, which is a house rule with no
  // enforcement behind it -- and #197 put an animation inside that path, which is the one kind of
  // thing that can break the rule without breaking anything visible. A tally that forgot to stop, or
  // a counter that wrote its own value back every frame, would look completely normal on screen and
  // cost a DOM write sixty times a second on the device that can least afford it.
  //
  // Two halves, and the first is the one that matters: the HUD's own setters are REPLAYED with the
  // arguments the game last gave them, and a MutationObserver over the whole HUD must see zero
  // writes. Replaying rather than watching idle frames is deliberate -- watching would pass trivially
  // on a frozen game and flake on a running one, because the wave clock legitimately ticks. This asks
  // the exact question the house rule answers: given the same values again, does it write again?
  //
  // The second half drives a tally directly with synthetic timestamps rather than waiting for it:
  // under SwiftShader a frame is about a second and a 0.34s animation gets exactly one of them, so
  // waiting would sample the end and prove nothing. See CLAUDE.md on wall clock not being game time.
  async 'hud-quiet'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(async () => {
      const g = window.game;
      const hud = document.getElementById('hud');
      if (!hud || !g.hud || !g.hud.coinTally) return { skip: 'no hud tallies on this build' };
      const spies = ['set', 'setLoad', 'setRaid'].map((name) => {
        const real = g.hud[name].bind(g.hud);
        const rec = { name, real, args: null };
        g.hud[name] = (...a) => { rec.args = a; return real(...a); };
        return rec;
      });
      // Two real frames, so every spied setter has been called with live values at least once.
      for (let i = 0; i < 2; i++) await new Promise((res) => requestAnimationFrame(res));
      await new Promise((res) => setTimeout(res, 900));   // and anything in flight arrives
      const missed = spies.filter((sp) => !sp.args).map((sp) => sp.name);
      const writes = [];
      const ob = new MutationObserver((ms) => { for (const m of ms) writes.push((m.target.parentElement || m.target).id || m.target.nodeName); });
      ob.observe(hud, { childList: true, characterData: true, subtree: true });
      for (let i = 0; i < 10; i++) for (const sp of spies) if (sp.args) sp.real(...sp.args);
      // `takeRecords()` BEFORE `disconnect()`, and that ordering is the whole assertion. A
      // MutationObserver delivers its callback as a MICROTASK, and `disconnect()` empties the queue
      // -- so a callback and a disconnect in the same synchronous block means the callback never
      // runs and `writes` is empty whatever the HUD did. This check shipped that way and passed its
      // own sabotage in `--prove`, which is exactly what --prove is for: it was not covering the
      // thing the registry said it covered, and no amount of reading it would have shown that.
      for (const m of ob.takeRecords()) writes.push((m.target.parentElement || m.target).id || m.target.nodeName);
      ob.disconnect();
      for (const sp of spies) g.hud[sp.name] = sp.real;
      const pumping = g.hud.pumping;
      // The curve, driven. Monotonic, starts where it was, ends exactly on the target.
      const t = g.hud.coinTally;
      t.to(0, true);
      t.to(200);
      const t0 = t.t0, seq = [];
      for (const ms of [0, 85, 170, 255, 340, 420]) { t.tick(t0 + ms); seq.push(t.shown); }
      const stopped = t.t0 < 0;
      // And a step under `min` must not animate at all -- a coin at a time has to feel instant.
      t.to(0, true);
      t.to(1);
      const snapped = t.t0 < 0 && t.shown === 1;
      return { writes, missed, pumping, seq, stopped, snapped, dur: t.dur };
    });
    if (r.skip) return ok(r.skip);
    const bad = [];
    if (r.missed.length) bad.push(`never called with live values, so nothing was replayed: ${r.missed.join(', ')}`);
    if (r.writes.length) bad.push(`the HUD wrote ${r.writes.length} times when replayed with unchanged values (${[...new Set(r.writes)].slice(0, 6).join(', ')})`);
    if (r.pumping) bad.push('the tally rAF is still running with nothing to animate');
    if (r.seq[0] !== 0) bad.push(`the tally jumped to ${r.seq[0]} instead of starting where it was`);
    if (r.seq[r.seq.length - 1] !== 200) bad.push(`the tally ended on ${r.seq[r.seq.length - 1]}, not 200`);
    if (!r.seq.every((v, i, a) => i === 0 || v >= a[i - 1])) bad.push(`the tally is not monotonic: ${r.seq.join(' ')}`);
    if (new Set(r.seq).size < 4) bad.push(`the tally has ${new Set(r.seq).size} distinct steps, which is a snap: ${r.seq.join(' ')}`);
    if (!r.stopped) bad.push('the tally never stopped after reaching its target');
    if (!r.snapped) bad.push('a one-step change started an animation instead of landing');
    return bad.length ? no(bad) : ok(`3 setters replayed 10x with no DOM write; 0 -> 200 runs ${r.seq.join(' ')} in ${r.dur}s`);
  },

  // #202: a build mat sits at the entrance to the thing it builds.
  //
  // Two shapes of the same rule, and they fail in different ways. A STRUCTURE's mat belongs square on
  // its door's axis: every building in models.js puts its door on the +z face, because the camera
  // looks north over the King's shoulder. The Keep's mat used to sit diagonally off a corner touching
  // no face at all. A BRIDGE's mat belongs on the road at the crossing -- and that one cannot be
  // asserted from config, because the bridge is placed where the road actually meets the river while
  // the mat was a typed constant. They were eight units apart.
  //
  // The bridge half is measured as distance OFF THE ROAD'S CENTRE LINE rather than distance from the
  // crossing: how far back from the water the mat sits is a judgement (it clears the bank by half a
  // mat), but being off to one side of the road is just wrong, and it was 5.47 and 3.75.
  async 'mats-at-doors'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game, CFG = window.CFG;
      const bad = [];
      const checked = { structures: 0, bridges: 0 };
      for (const def of window.PADS || []) {
        // A PLACEABLE pad is exempt, and finding that out is what stopped this check being wrong.
        // The first version asserted the rule over every pad with a `structure` and went red on
        // thirteen watchtowers and three villager homes -- all of which carry `place: true`, meaning
        // the PLAYER chooses where they go. For those, the config position is a proposal and the mat
        // is derived from where the building actually landed (#139's `tower.padOffset`), so a config
        // coordinate is not the geometry and asserting against it measures nothing. That is #179's
        // "knowing one shape of a right answer", caught in a brand new check by running it.
        if (def.place) continue;
        if (def.structure && def.buildAt) {
          checked.structures++;
          const [px, pz] = def.pos, [bx, bz] = def.buildAt;
          const fp = CFG.footprint[def.structure];
          if (Math.abs(px - bx) > 0.8) bad.push(`${def.id}: mat is ${(px - bx).toFixed(1)} off its building's centre line, so it is not on the door's axis`);
          const clear = pz - bz - (fp ? fp[1] / 2 : 0);
          if (pz <= bz) bad.push(`${def.id}: mat is behind the building (door is on +z)`);
          else if (fp && clear < 0.2) bad.push(`${def.id}: mat overlaps the footprint by ${(-clear).toFixed(1)}`);
        }
        if (def.bridge) {
          const c = g.world.crossingFor(def.bridge);
          if (!c) { bad.push(`${def.id}: no crossing for road "${def.bridge}"`); continue; }
          checked.bridges++;
          const d = g.bridgeMatPos(def);
          const off = Math.abs((d.pos[0] - c.x) * -c.dz + (d.pos[1] - c.z) * c.dx);
          const back = Math.hypot(d.pos[0] - c.x, d.pos[1] - c.z);
          if (off > 0.4) bad.push(`${def.id}: mat sits ${off.toFixed(2)} off the road's centre line`);
          if (back < g.world.river.halfWidth + 0.6) bad.push(`${def.id}: mat is ${back.toFixed(2)} from the crossing, which is in the water`);
        }
      }
      // A check that iterated nothing would pass. `hud-quiet` shipped exactly that fault and only
      // --prove found it, so this says so out loud rather than reporting a quiet success.
      if (!checked.structures || !checked.bridges) bad.push(`nothing to check: ${checked.structures} structure mats and ${checked.bridges} bridge mats found -- is PADS reachable?`);
      return { bad, checked };
    });
    return r.bad.length ? no(r.bad) : ok(`${r.checked.structures} structure mats on their door's axis, ${r.checked.bridges} bridge mats on the road at the crossing`);
  },

  // #203: reported off a phone -- "the archers in the tower are standing on the roof". THREE ways to
  // get it wrong were live at once, and every one of them passed every count the game keeps, so this
  // asserts the thing itself rather than any of the three: an archer on a deck has the deck under
  // his feet, and no two of them are in the same place.
  //
  // The floor is read off the TOWER'S OWN TRIANGLES rather than from `t.top`, which is the whole
  // point. `t.top` is what the code believes and it was wrong by 0.27 -- the imported model's
  // planking is at 2.99 and the number said 2.72, inherited from the built tower whose deck really
  // is there. A check that compared feet to `t.top` would have agreed with the bug.
  async 'tower-crew-placed'(page, url) {
    await boot(page, url);
    // WAIT FOR THE TOWER, NOT ONLY FOR THE KING -- the #179 lesson arriving a second time, in a
    // place `boot()` cannot cover. A structure GROWS into place: `mesh.scale.y` runs 0.01 -> 1 over
    // about a dozen frames, and the King is settled long before it finishes. Measured in a real
    // browser at `?tour`: scale is 0.722 at frame 14, which is exactly `BOOT_MIN`, and reaches 1 at
    // frame 19.
    //
    // So this audit was measuring a deck still on its way up. The crew spots are a constant 2.99
    // the whole time, the deck under them passes through 0.72 and 0.33 of the gap on its way, and
    // the check reported archers standing above the planking -- which is #203's bug, the one it was
    // written to catch, reported against a game that did not have it. It went green run on its own
    // and red inside a full sweep, and that split is the signature of a timing bug rather than a
    // placement one: the sweep is slower, so `boot()` hands over further from the rise.
    //
    // A settle rather than `scale.y === 1`, and a ceiling of nothing -- a tower that never finishes
    // rising times out, which the runner reports AMBER as "could not run" rather than red. A check
    // that could not run is not a check the game failed.
    await page.waitForFunction(() => {
      const g = window.game;
      if (!g || !g.towers) return false;
      const ys = Object.values(g.towers).map((t) => t.mesh.scale.y);
      if (!ys.length) return false;
      const key = ys.map((y) => y.toFixed(4)).join(',');
      const s = window.__towerSettle || (window.__towerSettle = { n: 0, key: '' });
      if (key === s.key) s.n++; else s.n = 0;
      s.key = key;
      return s.n >= 3 && ys.every((y) => y > 0.99);
    }, null, { timeout: 60000, polling: 'raf' });
    const r = await page.evaluate(() => {
      const g = window.game;
      const D = window.CFG.tower.deck;
      const id = Object.keys(g.towers)[0];
      if (!id) return { bad: ['the opening village stood no towers'] };
      const t = g.towers[id];
      const V3 = g.king.mesh.position.constructor;
      const tris = [];
      const a = new V3(), b = new V3(), c = new V3();
      t.mesh.updateWorldMatrix(true, true);
      t.mesh.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position, idx = o.geometry.index;
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
          b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
          c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
          tris.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
        }
      });
      // the highest surface of the tower at or below a man's feet: what he is standing on
      const floorUnder = (x, z, y) => {
        let best = -Infinity;
        for (const q of tris) {
          const d = (q[5] - q[8]) * (q[0] - q[6]) + (q[6] - q[3]) * (q[2] - q[8]);
          if (Math.abs(d) < 1e-9) continue;
          const l1 = ((q[5] - q[8]) * (x - q[6]) + (q[6] - q[3]) * (z - q[8])) / d;
          const l2 = ((q[8] - q[2]) * (x - q[6]) + (q[0] - q[6]) * (z - q[8])) / d;
          if (l1 < -1e-6 || l2 < -1e-6 || 1 - l1 - l2 < -1e-6) continue;
          const h = l1 * q[1] + l2 * q[4] + (1 - l1 - l2) * q[7];
          if (h <= y + 0.12 && h > best) best = h;
        }
        return best;
      };
      const mine = () => g.turrets.filter((q) => q.tower === id);
      const fill = (n) => { for (const [x, z, y] of g.crewSpots({ tower: id, crew: n })) { g.addTurret(x, z, y, id); t.crew++; } };
      const bad = [];
      const audit = (when) => {
        const on = mine();
        for (let i = 0; i < on.length; i++) {
          const p = on[i].mesh.position;
          for (let j = i + 1; j < on.length; j++) {
            const q = on[j].mesh.position;
            const dd = Math.hypot(p.x - q.x, p.z - q.z);
            if (dd < 0.2) bad.push(`${when}: two archers ${dd.toFixed(2)} apart at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
          }
          const f = floorUnder(p.x, p.z, p.y);
          if (f === -Infinity) bad.push(`${when}: an archer at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) has no tower under his feet at all`);
          else if (p.y - f > 0.12) bad.push(`${when}: an archer stands at ${p.y.toFixed(2)} with the deck ${(p.y - f).toFixed(2)} below him`);
          else if (f - p.y > 0.06) bad.push(`${when}: an archer's feet are at ${p.y.toFixed(2)} and the deck he is on is at ${f.toFixed(2)} -- ${(f - p.y).toFixed(2)} of him is under the floor`);
        }
        return on.length;
      };
      fill(D.slots - t.crew);                  // the most the game can ever put on one deck
      const n = audit(`a full deck of ${mine().length}`);
      if (n < D.slots) bad.push(`only ${n} archers went up for ${D.slots} places`);
      // and the case that needs no upgrades at all: shoot one out of the middle, send a replacement.
      // The slot he left has to be the one that gets reused.
      const on = mine();
      if (on.length > 2) {
        g.damageTurret(on[Math.floor(on.length / 2)], 9999);
        fill(1);
        audit('after a casualty was replaced');
      }
      return { bad, n };
    });
    return r.bad.length ? no(r.bad) : ok(`${r.n} on one deck, each on the planking, and a replacement took the dead man's place`);
  },

  async 'post-once'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      if (!g.post) return { skip: 'no composer on this path' };
      const real = g.renderer.render.bind(g.renderer);
      g.running = false;
      const gl = g.renderer.getContext();
      const W = g.renderer.domElement.width, H = g.renderer.domElement.height;
      const grab = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) s += Math.abs(a[i + c] - b[i + c]); return s / (a.length / 4 * 3); };
      const recompile = () => g.scene.traverse((o) => { if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.needsUpdate = true; });
      g.post.grade.enabled = false;
      g.post.composer.render();
      const composer = grab();
      real(g.scene, g.camera);
      const withAces = grab();
      const wasTM = g.renderer.toneMapping;
      g.renderer.toneMapping = 0;        // THREE.NoToneMapping
      recompile();
      real(g.scene, g.camera);
      const withNone = grab();
      g.renderer.toneMapping = wasTM;
      recompile();
      // and the toggle must not change the program set -- that is the whole shape of post.js
      g.post.grade.enabled = true;
      g.post.composer.render();
      const programs0 = g.renderer.info.programs.length;
      for (let i = 0; i < 4; i++) { g.post.grade.enabled = !g.post.grade.enabled; g.post.composer.render(); }
      g.post.grade.enabled = true;
      g.post.composer.render();
      const programs1 = g.renderer.info.programs.length;
      g.applyQuality(CFG_TIERS());
      const offAtBottom = g.post.grade.enabled === false;
      g.applyQuality(0);
      const backAtTop = g.post.grade.enabled === true;
      function CFG_TIERS() { return 3; }
      return {
        toAces: +dist(composer, withAces).toFixed(2),
        toNone: +dist(composer, withNone).toFixed(2),
        samples: g.post.composer.renderTarget1.samples,
        programs0, programs1, offAtBottom, backAtTop,
      };
    });
    if (r.skip) return ok(r.skip);
    const bad = [];
    if (!(r.toAces * 3 < r.toNone)) bad.push(`tone mapping: the composer is ${r.toAces} from a direct ACES render and ${r.toNone} from one with tone mapping off -- it should be far nearer the first`);
    if (r.samples < 1) bad.push(`the composer target has ${r.samples} samples: the canvas multisampling was not carried over`);
    if (r.programs0 !== r.programs1) bad.push(`toggling the grade moved the program count ${r.programs0} -> ${r.programs1}: the path is switching, not the pass`);
    if (!r.offAtBottom) bad.push('the reduced quality tier did not turn the grade off');
    if (!r.backAtTop) bad.push('the top quality tier did not turn the grade back on');
    return bad.length ? no(bad) : ok(`one tone map (${r.toAces} from ACES, ${r.toNone} from none), ${r.samples}x MSAA kept, toggle costs no programs`);
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
        // #201: THE GATEWAY ITSELF, not "anywhere near a gate". This was a flat 6-unit radius, and a
        // gateway is only `len` long -- 6.2, so 3.1 from its centre. That left roughly three units of
        // ring either side of every gate where a hole could not be reported, and there WAS one: the
        // gate mesh spanned 4.8 in a 6.2 section, leaving 0.7 of nothing at each end, on all four
        // gates, green the whole time. Half the section plus a hair is what "this is the doorway"
        // actually means.
        const nearGate = gates.some((w) => Math.hypot(w.mx - x, w.mz - z) < w.len / 2 + 0.6);
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

  // #221: A RELIC HAS TO CHANGE A RULE, and "the flag is set" is not that claim.
  //
  // The ticket said so outright -- "each one verified in the game rather than asserted, since 'the
  // flag is set' and 'the arrow pierces' are different claims" -- and it was right in a way that
  // cost a bug: the Splitting Shaft set its flag correctly and still stopped working after a few
  // shots, because arrows come off a pool and carried the last flight's `pierced` back with them.
  // A check that read `g.mods.pierce` would have passed the whole time.
  //
  // So every assertion here is a BEHAVIOUR measured twice, once with the relic and once without,
  // and the pierce is fired twice over so a pooled arrow has to do it again.
  async 'relics-bite'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const bad = [];
      g.hud.toast = () => {};

      // 1. a cache is invisible until the fog reaches it, and digging it pays a relic
      if (!g.caches || !g.caches.length) return { bad: ['no caches on the map'] };
      if (g.caches.some((c) => c.mesh.visible)) bad.push('a cache was visible before it was found');
      const c0 = g.caches[0];
      g.king.mesh.position.set(c0.x, 0, c0.z + 30);
      g.fogTimer = 0; g.lastFogPos.set(999, 0, 999); g.updateFog(0.3);
      if (c0.found) bad.push('a cache was found from 30 units away, further than the fog lifts');
      g.king.mesh.position.set(c0.x, 0, c0.z + 12);
      g.fogTimer = 0; g.lastFogPos.set(999, 0, 999); g.updateFog(0.3);
      if (!c0.found) bad.push('the fog came off a cache and it was not found');

      g.king.mesh.position.set(c0.x, 0, c0.z);
      let held = 0;
      for (let i = 0; i < 200 && !c0.dug; i++) { if (g.updateDigging(0.05)) held += 0.05; }
      if (!c0.dug) bad.push('standing on a cache never dug it out');
      if (held < window.CFG.relics.digTime - 0.2) bad.push(`the dig took ${held.toFixed(1)}s, less than the ${window.CFG.relics.digTime}s it costs`);
      if (!g.relics.length) bad.push('digging a cache paid no relic');

      // 2. walking away from a half-dug hole banks nothing
      const c1 = g.caches[1];
      if (c1) {
        c1.found = true; c1.dug = false; c1.dig = 0;
        g.king.mesh.position.set(c1.x, 0, c1.z);
        for (let i = 0; i < 10; i++) g.updateDigging(0.05);
        const part = c1.dig;
        g.king.mesh.position.set(c1.x + 40, 0, c1.z);
        g.updateDigging(0.05);
        if (!(part > 0)) bad.push('digging made no progress at all');
        else if (c1.dig > 0) bad.push('walking away from a half-dug hole kept the progress');
      }

      // 3. the Quartermaster's Ledger -- count the cards the panel actually builds
      const cards = () => { g.offerQueue = 1; g.offerLevel = g.baseLevel; g.showOffer(); return document.querySelectorAll('#offer-cards > *').length; };
      g.mods.offerCards = 0; const three = cards();
      g.mods.offerCards = 1; const four = cards();
      g.hud.hideOffer();
      if (three !== 3 || four !== 4) bad.push(`the Ledger gave ${three} cards without it and ${four} with it`);
      // and a fourth card has to FIT: the panel opens mid-raid, and one the player must scroll to
      // find is one most players never see
      const panel = document.querySelector('#offer-screen .panel');
      if (panel && four === 4 && panel.getBoundingClientRect().height > window.innerHeight) {
        bad.push(`four cards make the panel ${Math.round(panel.getBoundingClientRect().height)} tall against a ${window.innerHeight} viewport`);
      }
      g.mods.offerCards = 0;

      // 4. the Bottomless Sack
      g.mods.noCap = false; const capOff = g.loadCap();
      g.mods.noCap = true; const capOn = g.loadCap();
      g.mods.noCap = false;
      if (!(capOn > capOff * 10)) bad.push(`the Sack moved the carry cap ${capOff} -> ${capOn}`);

      // 5. the Broken Standard -- a cleared camp comes back without it and stays broken with it
      if (g.camps && g.camps.length) {
        const cp = g.camps[0];
        const clear = () => { cp.cleared = true; cp.clearedOn = 1; g.wave = 99; for (const e of g.enemies.filter((e) => e.campId === cp.id)) g.removeEnemy(e); };
        g.mods.campsStay = false; clear(); g.reoccupyCamps();
        if (cp.cleared) bad.push('a cleared camp never came back, with no relic taken');
        g.mods.campsStay = true; clear(); g.reoccupyCamps();
        if (!cp.cleared) bad.push('the Broken Standard did not stop a camp being reoccupied');
        g.mods.campsStay = false;
      }

      // 6. the Splitting Shaft, fired down a column of three -- twice, so a POOLED arrow has to
      //    pierce again. Health is pinned high so nobody dies and shortens the column.
      const column = (pierce) => {
        for (const e of [...g.enemies]) g.removeEnemy(e);
        g.mods.pierce = pierce;
        const col = [];
        for (let i = 0; i < 3; i++) { const e = g.spawnEnemy('knight', 60, 60 + i * 2, 0); e.camp = false; e.hp = e.maxHp = 500; col.push(e); }
        g.fireArrow({ x: 60, y: 1, z: 54 }, col[0], 40);
        for (let i = 0; i < 40 && g.arrows.length; i++) g.updateArrows(0.02);
        return col.map((e) => Math.round(e.maxHp - e.hp));
      };
      const off = column(false);
      const on1 = column(true);
      const on2 = column(true);
      g.mods.pierce = false;
      if (off[1] !== 0) bad.push(`without the relic one arrow hit two raiders: ${off.join('/')}`);
      if (on1[0] !== 40 || on1[1] !== 40) bad.push(`the Shaft did not carry through: ${on1.join('/')}`);
      if (on2[0] !== 40 || on2[1] !== 40) bad.push(`the Shaft stopped working on a reused arrow: ${on2.join('/')}`);
      if (on1[2] !== 0) bad.push(`the Shaft chained past two raiders: ${on1.join('/')}`);

      return { bad, note: `dug in ${held.toFixed(1)}s for ${g.relics[0]}; cards ${three}->${four}; cap ${capOff}->${capOn}; column ${off.join('/')} -> ${on1.join('/')}` };
    });
    return r.bad.length ? no(r.bad) : ok(r.note);
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
  // #190: ONE LIVE WebGL CONTEXT -- the title portraits are drawn on a second one, and it has to be
  // handed back before play.
  //
  // `rig.js` already carries the paragraph on why: a browser allows a handful of live contexts per
  // page, `dispose()` frees three.js's objects and leaves the context alive until the collector gets
  // to it, and when the limit is hit the browser drops the OLDEST -- which is the game's own canvas.
  // The HUD and the minimap are DOM and 2D canvas, so they keep drawing while the world goes blank:
  // a white screen with a working interface. `releasePortraitRenderer` calls `forceContextLoss` for
  // exactly that, and #190 asked for it to be CONFIRMED rather than read.
  //
  // It cannot be confirmed from the game's own objects: `portraitRenderer` is module state nothing
  // exports, and a renderer that has been disposed looks the same either way from outside. So the
  // census is taken one level down, on `HTMLCanvasElement.getContext` -- every WebGL context the page
  // ever asks for, and `isContextLost()` on each at the end. That also means it counts a context
  // NOBODY IN THIS REPO MADE, which is the shape of the thing worth catching: the bone textures three
  // builds by itself (#190) were invisible for the same reason.
  //
  // The portraits are asserted alongside, because the vacuous pass here is a real one: if the render
  // throws, main.js catches it, warns and carries on with one context and no pictures -- green, and
  // the title screen showing two empty frames.
  async 'one-live-context'(page, url) {
    await page.addInitScript(() => {
      window.__ctxs = [];
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = real.call(this, type, ...rest);
        if (c && /webgl/i.test(type)) window.__ctxs.push({ ctx: c, canvas: this, type });
        return c;
      };
    });
    await boot(page, url);
    // Play, then resize. The resize is the half worth having: `setSize` on a lost context throws in
    // some browsers and silently rebuilds in others, and a second renderer standing back up would
    // most plausibly do it here rather than at load.
    await page.evaluate(() => { const g = window.game; for (let t = 0; t < 4; t += 0.05) g.update(0.05); });
    await page.setViewportSize({ width: 900, height: 640 });
    await page.evaluate(() => new Promise((r) => { let i = 0; const t = () => (++i >= 6 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); }));
    const r = await page.evaluate(() => ({
      ctxs: window.__ctxs.map((e) => ({
        type: e.type, lost: e.ctx.isContextLost(), inDom: document.contains(e.canvas),
        id: e.canvas.id || null, size: `${e.canvas.width}x${e.canvas.height}`,
      })),
      king: (document.getElementById('hero-king') || {}).src || '',
      queen: (document.getElementById('hero-queen') || {}).src || '',
    }));
    const bad = [];
    const live = r.ctxs.filter((c) => !c.lost);
    const say = (c) => `${c.type} ${c.size}${c.id ? ` #${c.id}` : ''}${c.inDom ? '' : ' (off-DOM)'}`;
    if (live.length !== 1) bad.push(`${live.length} live WebGL contexts, not 1: ${live.map(say).join(', ')}`);
    else if (!live[0].inDom || live[0].id !== 'game') bad.push(`the one live context is not the game canvas: ${say(live[0])}`);
    for (const c of r.ctxs.filter((c) => c.lost && c.inDom)) bad.push(`a canvas on the page has lost its context: ${say(c)}`);
    if (!r.king.startsWith('data:image')) bad.push('the King portrait was never drawn, so nothing here was measured');
    if (!r.queen.startsWith('data:image')) bad.push('the Queen portrait was never drawn, so nothing here was measured');
    return bad.length ? no(bad) : ok(`${r.ctxs.length} contexts made, ${r.ctxs.length - live.length} handed back, the game canvas left live; both portraits drawn`);
  },
  // #190: THE BLACK BOX SURVIVES THE SESSION IT DESCRIBES.
  //
  // The ticket's first question is whether the crashes are an out-of-memory kill or a lost WebGL
  // context, and its plan -- copy `?perf=1` at ten, twenty and thirty minutes -- cannot answer it,
  // because the log is in the tab that died. A dozen fields go to localStorage every five seconds
  // instead, and the next load reads them before writing its own.
  //
  // So this is two loads. The first loses the context the way a driver reset does and then navigates
  // away, which is the ordinary thing a player does next; the second opens `?view=report` and reads
  // the line off the real report, the same string a person would paste into an issue.
  //
  // The navigation is the half worth having. Driven in a browser, the first version of this recorded
  // the loss correctly and then `pagehide` wrote 'closed' straight over the top of it -- the one fact
  // the ticket is trying to establish, erased by closing the tab. The loss is sticky now and the
  // assertion is on the sticky part, so that regression cannot come back quietly.
  async 'black-box-outlives-the-tab'(page, url) {
    await boot(page, url);
    const before = await page.evaluate(() => {
      const gl = window.game.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return 'no WEBGL_lose_context on this browser';
      ext.loseContext();
      return null;
    });
    if (before) return no(before);
    await page.waitForFunction(() => window.game.contextLost, null, { timeout: 60000, polling: 'raf' });
    // and then away, which is what a player does with a game that has just gone blank
    await boot(page, url, '?view=report');
    const body = await page.textContent('#report-body');
    const line = (body || '').split('\n').find((l) => l.startsWith('last session')) || '';
    const bad = [];
    if (!line) bad.push('the report has no `last session` line at all');
    else {
      if (/no record of a previous session/.test(line)) bad.push('the previous session left no record: `last session   ' + line.replace(/^last session\s+/, '') + '`');
      else if (!/losing the context|lost its WebGL context/.test(line)) bad.push('the context loss is not in the record: `' + line.replace(/^last session\s+/, '') + '`');
      // and the numbers have to have come with it, or the line is a label with nothing behind it
      if (!/\d+ geometries/.test(line)) bad.push('no GPU counts carried over: `' + line.replace(/^last session\s+/, '') + '`');
    }
    // The note is built from the parts rather than sliced off the line: the full sentence runs past
    // what the board shows and a slice cuts it mid-word, which reads as a truncated bug rather than
    // a deliberate summary.
    const how = line.replace(/^last session\s+/, '').split(' · ')[0];
    const geo = (line.match(/(\d+) geometries/) || [])[1];
    return bad.length ? no(bad) : ok(`${how} · ${geo} geometries carried over`);
  },
  // #190: A MAT THAT IS ALREADY DOWN IS NOT PUT DOWN AGAIN.
  //
  // `refreshPads` runs on every purchase, every level and every restore, and it used to add the two
  // bridge mats on each call for ever. `addPad` hands a bridge def to `bridgeMatPos`, which returns
  // `{ ...def, pos }` so the mat lands where the road actually crosses -- so the pad on the field
  // carries a COPY, and the `p.def === def` test compared it against the object `config.js` holds and
  // never matched. Boot alone left twelve duplicates on the field before the player touched anything.
  //
  // It cost a hundred megabytes and showed nothing, because the mats are AT THE RIVER and
  // `renderer.info` counts what has been uploaded: every GPU counter stayed flat until the King
  // walked to the bridge, and then 407 canvas textures went up in one frame.
  //
  // So the assertion is on the FIELD and not on the counters: the same mats, once each, after forty
  // calls. A count on its own would pass a run that had swapped one mat for another, hence the ids.
  async 'mats-do-not-multiply'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const ids = () => g.pads.map((p) => p.def.id);
      const before = ids();
      for (let i = 0; i < 40; i++) g.refreshPads();
      const after = ids();
      return {
        before, after,
        dupes: [...new Set(after.filter((x, i) => after.indexOf(x) !== i))],
        gone: before.filter((x) => !after.includes(x)),
      };
    });
    const bad = [];
    if (r.after.length !== r.before.length) {
      bad.push(`40 calls to refreshPads took the field from ${r.before.length} mats to ${r.after.length}`);
    }
    if (r.dupes.length) bad.push(`the same mat is down more than once: ${r.dupes.join(', ')}`);
    if (r.gone.length) bad.push(`mats vanished: ${r.gone.join(', ')}`);
    // and the two it was actually about have to still be there, or a fix that simply stopped adding
    // them would read as green
    for (const id of ['bridge-south', 'bridge-east']) {
      if (!r.after.includes(id)) bad.push(`${id} is not on the field at all`);
    }
    return bad.length ? no(bad) : ok(`${r.after.length} mats, each down once, unchanged by 40 refreshes`);
  },
  // #223: THE HIGH GROUND IS REAL, AND IT HAS EXACTLY ONE WAY UP.
  //
  // A plateau is the first thing in this game with a Y axis, and the failure CLAUDE.md keeps writing
  // down is a character standing on a roof or inside something. Four things have to hold together or
  // it is one of those:
  //
  //   the top is a floor          `floorAt` says the height inside the rim and 0 outside it
  //   the rock face is a wall     walking at it from every non-ramp bearing stops you below
  //   the ramp is a way up        walking up it raises you, smoothly, to exactly the top
  //   and it is the ONLY way up   a raider whose target is up there is sent to the ramp foot
  //
  // The last one is not decoration. Driven before `rampWaypoint` existed: eight raiders sent at a
  // King on a plateau over ninety seconds of game time, and NONE reached the top -- `steerRoundSolid`
  // bends round one solid at a time and grazes a forty-circle fence for ever. A plateau without a
  // route up is not scenery, it is a square the player cannot be touched on, and nothing else in the
  // suite would have noticed.
  //
  // The fight itself is not driven here. Two fifty-second fights cost ten minutes of wall clock and
  // came back muddy -- raiders are culled in the prologue, and out of it they pick their own targets.
  // What is checked is the thing that decides the fight: that the route exists and points at the way
  // up. The fight is a `judged` row's business.
  async 'high-ground-holds'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const w = g.world;
      const bad = [];
      const out = [];
      for (const [i, p] of (w.plateaus || []).entries()) {
        // the top is a floor, and off it is not
        if (w.floorAt(p.x, p.z) !== p.h) bad.push(`plateau ${i}: the middle of the top reads ${w.floorAt(p.x, p.z)}, not ${p.h}`);
        if (w.floorAt(p.x + 40, p.z + 40) !== 0) bad.push(`plateau ${i}: open ground 40 away is not at 0`);
        // the ramp rises to the top and never overshoots it
        let last = 0;
        for (let t = p.top + p.rampLen; t >= p.top; t -= 0.5) {
          const y = w.floorAt(p.x + p.ux * t, p.z + p.uz * t);
          if (y < last - 1e-6) bad.push(`plateau ${i}: the ramp drops at ${t.toFixed(1)} (${y} after ${last})`);
          if (y > p.h + 1e-6) bad.push(`plateau ${i}: the ramp overshoots the top at ${t.toFixed(1)} (${y})`);
          last = y;
        }
        // nothing the seed scatters may stand on one
        const on = (list, name) => (list || []).filter((c) => Math.hypot((c.x ?? c.pos?.[0]) - p.x, (c.z ?? c.pos?.[1]) - p.z) < p.top + 1).length;
        if (on(w.camps)) bad.push(`plateau ${i}: a camp is standing on it`);
        if (on(w.caches)) bad.push(`plateau ${i}: a cache is buried on it`);
        const nodes = (g.nodes || []).filter((n) => Math.hypot(n.mesh.position.x - p.x, n.mesh.position.z - p.z) < p.top + 1).length;
        if (nodes) bad.push(`plateau ${i}: ${nodes} seam(s) on it, which cannot be mined from below`);
        // the rock face is a wall: walk at it from every bearing that is not the ramp
        const rampAng = Math.atan2(p.uz, p.ux);
        let climbed = 0;
        for (let k = 1; k <= 8; k++) {
          const a = rampAng + (k * Math.PI * 2) / 9;
          const kp = g.king.mesh.position;
          kp.set(p.x + Math.cos(a) * (p.top + 6), 0, p.z + Math.sin(a) * (p.top + 6));
          for (let step = 0; step < 80; step++) {
            const dx = p.x - kp.x;
            const dz = p.z - kp.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.05) { kp.x += (dx / d) * 0.25; kp.z += (dz / d) * 0.25; }
            g.collideScenery(kp, 0.5);
            g.animateWalk(g.king, 1, 0.05);
          }
          if (kp.y > 0.01) climbed++;
        }
        if (climbed) bad.push(`plateau ${i}: the rock face was climbed from ${climbed} of 8 bearings`);
        // and the ramp is a way up
        const kp = g.king.mesh.position;
        kp.set(p.x + p.ux * (p.top + p.rampLen + 1), 0, p.z + p.uz * (p.top + p.rampLen + 1));
        for (let step = 0; step < 70; step++) {
          const dx = p.x - kp.x;
          const dz = p.z - kp.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.05) { kp.x += (dx / d) * 0.25; kp.z += (dz / d) * 0.25; }
          g.collideScenery(kp, 0.5);
          g.animateWalk(g.king, 1, 0.05);
        }
        if (kp.y !== p.h) bad.push(`plateau ${i}: walking up the ramp ended at y ${kp.y.toFixed(2)}, not ${p.h}`);
        // AND A RAIDER GETS UP IT FROM ANYWHERE, which is the assertion that matters and the one
        // that has already been false twice. Driven with the game's own `rampWaypoint` and its own
        // `steerRoundSolid`, from twelve bearings, starting hard against the rock:
        //
        //   no waypoint at all        0/18 -- it grinds along the fence for ever
        //   aimed straight at the ramp  12-13/18 -- and every failure is a contiguous arc on the
        //                             far side, stopped dead at d=9.0, because the straight line
        //                             to the foot goes through a cliff
        //   walking round the drum    18/18
        //
        // The middle row is why this is driven rather than asserted on the waypoint: a route that
        // points at the right place and cannot be walked reads as correct from the outside.
        const failed = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const m = { mesh: { position: { x: p.x + Math.cos(a) * (p.top + 2.2), z: p.z + Math.sin(a) * (p.top + 2.2), y: 0 } }, radius: 0.45 };
          let reached = false;
          for (let step = 0; step < 400 && !reached; step++) {
            const q = m.mesh.position;
            const wp = g.rampWaypoint(m, { x: p.x, z: p.z }) || { x: p.x, z: p.z };
            const dx = wp.x - q.x;
            const dz = wp.z - q.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.01) {
              const v = { x: dx, z: dz, y: 0, set(vx, vy, vz) { this.x = vx; this.z = vz; return this; } };
              g.steerRoundSolid(q, v, d, m.radius);
              const vd = Math.hypot(v.x, v.z) || 1;
              q.x += (v.x / vd) * 0.22;
              q.z += (v.z / vd) * 0.22;
            }
            g.collideScenery(q, m.radius);
            q.y = w.floorAt(q.x, q.z);
            if (q.y >= p.h - 1e-6 && Math.hypot(q.x - p.x, q.z - p.z) < p.top) reached = true;
          }
          if (!reached) failed.push(`${((a * 180) / Math.PI) | 0}deg`);
        }
        if (failed.length) bad.push(`plateau ${i}: a raider at the rock face never found the ramp from ${failed.join(', ')}`);
        out.push(`${i}: top ${p.h} at ${p.top} across`);
      }
      if (!(w.plateaus || []).length) bad.push('there are no plateaus at all');
      return { bad, out, n: (w.plateaus || []).length };
    });
    return r.bad.length ? no(r.bad) : ok(`${r.n} plateaus: a floor on top, a wall on every side but one, and the ramp is the way up`);
  },
  // #239: THE BREACH HAS A SIDE.
  //
  // Every placed cue -- a wall hit, an arrow landing, a raider dying, the alarm, the howl, Wren's
  // voice -- goes through `audio.placed(pan)`, which records the direction before it asks whether
  // the context is ready, so it can be read back on a suspended context. This damages a real wall
  // on the east of the ring and one on the west through `damageWall`, the game's own path, and
  // reads which way each went; then a cue at the King himself, which must be down the middle with
  // no panner node made for it. The far cases are clamped rather than left to the node, because a
  // StereoPannerNode given 3 throws in some browsers and clamps silently in others.
  async 'sounds-have-a-side'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const a = window.audio;
      a.init();
      const kx = g.king.mesh.position.x;
      const built = g.walls.filter((w) => w.state === 'built' && w.mesh);
      const east = built.filter((w) => w.mesh.position.x > kx + 4).sort((p, q) => q.mesh.position.x - p.mesh.position.x)[0];
      const west = built.filter((w) => w.mesh.position.x < kx - 4).sort((p, q) => p.mesh.position.x - q.mesh.position.x)[0];
      if (!east || !west) return { walls: built.length };
      const read = () => ({ pan: a.lastPan, node: a.lastPanner ? a.lastPanner.pan.value : null });
      g.damageWall(east, 1); const e = { x: east.mesh.position.x - kx, ...read() };
      g.damageWall(west, 1); const w = { x: west.mesh.position.x - kx, ...read() };
      a.wallHit(g.panAt(kx)); const c = read();
      a.enemyDie(g.panAt(kx + 400)); const far = read();
      a.alarm(NaN); const nan = read();
      return { ctx: !!a.ctx, walls: built.length, e, w, c, far, nan };
    });
    if (r.walls !== undefined && !r.e) return no(`no built wall four units east and west of the King to hit (${r.walls} built)`);
    if (!r.ctx) return no('audio.init() made no AudioContext, so nothing here was routed');
    const bad = [];
    const f = (n) => (n === null ? 'none' : n.toFixed(2));
    if (!(r.e.pan > 0.5)) bad.push(`a wall ${r.e.x.toFixed(1)} east of the King panned ${f(r.e.pan)}, not to the right`);
    if (!(r.w.pan < -0.5)) bad.push(`a wall ${(-r.w.x).toFixed(1)} west of the King panned ${f(r.w.pan)}, not to the left`);
    if (r.e.node === null || Math.abs(r.e.node - r.e.pan) > 0.01) bad.push(`the east hit's panner node carries ${f(r.e.node)}, not the ${f(r.e.pan)} it was given`);
    if (r.w.node === null || Math.abs(r.w.node - r.w.pan) > 0.01) bad.push(`the west hit's panner node carries ${f(r.w.node)}, not the ${f(r.w.pan)} it was given`);
    if (r.c.pan !== 0 || r.c.node !== null) bad.push(`a cue at the King panned ${f(r.c.pan)} through ${r.c.node === null ? 'no node' : 'a node'}; the middle should be the bus itself`);
    if (r.far.pan !== 1 || r.far.node !== 1) bad.push(`a cue 400 east reads ${f(r.far.pan)} / node ${f(r.far.node)}, not clamped to 1`);
    if (r.nan.pan !== 0 || r.nan.node !== null) bad.push(`a cue with no position reads ${f(r.nan.pan)}, not the middle`);
    return bad.length ? no(bad) : ok(`east wall ${f(r.e.pan)}, west wall ${f(r.w.pan)}, the King's own cue down the middle, the far side clamped`);
  },
  // #248: THE VILLAGE FALLS IN ORDER, FROM THE NORTH, OVER THE SECONDS THE CONFIG SAYS. `fellAt` is what
  // fell when; the first thing down has to be nearer the riders' road than the last, and the span
  // has to be the config's, not one frame.
  async 'village-falls-in-order'(page, url) {
    await boot(page, url);
    await page.evaluate(() => { const g = window.game; window.CFG.opening.holdFlag = false; g.renderer.render = () => {}; if (g.post && g.post.composer) g.post.composer.render = () => {}; clearTimeout(g.renderWatch); g.renderWatch = null; g.hud.toast = () => {}; });
    await page.waitForFunction(() => window.game.snatched && window.game.falling.length === 0 && window.game.fellAt.length > 0, null, { timeout: 150000 });
    const r = await page.evaluate(() => { const g = window.game; const f = g.fellAt; return { n: f.length, span: f[f.length - 1].t - f[0].t, firstZ: f[0].z, lastZ: f[f.length - 1].z, over: window.CFG.opening.fallOver, from: window.CFG.opening.from[1], walls: g.walls.filter((w) => w.state === 'broken').length, standing: g.structures.length, mats: g.dynamicPads.length }; });
    const bad = [];
    if (r.n < 20) bad.push(`only ${r.n} things fell`);
    // held to the ticket's own window, not to the config value: a sabotage that zeroes the config
    // would zero the expectation with it, and the check stayed green under it once
    if (r.span < 1.8 || r.span > 2.4) bad.push(`the fall took ${r.span.toFixed(2)}s, not between 1.8 and 2.4 (config says ${r.over})`);
    if (!(r.firstZ < r.lastZ)) bad.push(`the first thing down (z ${r.firstZ.toFixed(1)}) was not nearer the north road than the last (z ${r.lastZ.toFixed(1)})`);
    if (r.standing) bad.push(`${r.standing} buildings still standing after the fall`);
    if (r.mats) bad.push(`${r.mats} repair mats appeared on the ruined plot during the fall`);
    return bad.length ? no(bad) : ok(`${r.n} things down over ${r.span.toFixed(2)}s, first at z ${r.firstZ.toFixed(0)} and last at z ${r.lastZ.toFixed(0)}; ${r.walls} walls broken`);
  },

  // #252: GETTING HER BACK OFFERS A CARD, NOW. From the opening to the picket, the guards down, and
  // the panel has to be up within a second, headed for the rescue and not for a level, with three
  // cards; taking one resumes the game with the card taken.
  async 'rescue-offers-a-card'(page, url) {
    await boot(page, url);
    await page.evaluate(() => { const g = window.game; window.CFG.opening.holdFlag = false; g.renderer.render = () => {}; if (g.post && g.post.composer) g.post.composer.render = () => {}; clearTimeout(g.renderWatch); g.renderWatch = null; });
    await waitForPicket(page);
    await page.evaluate(() => { const g = window.game; for (const e of [...g.enemies]) if (e.rescue || e.captor) g.removeEnemy(e); g.freeQueen(); });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const g = window.game;
      const screen = document.getElementById('offer-screen');
      const up = !screen.classList.contains('hidden');
      const word = document.querySelector('#offer-screen .ol-word').textContent;
      const level = document.getElementById('offer-level').textContent;
      const cards = [...document.querySelectorAll('#offer-cards .offer-card')].map((b) => b.dataset.id);
      const paused = !!g.offerPaused;
      if (g.offer) g.takeUpgrade(g.offer[0].id);
      return { up, word, level, cards, paused, taken: Object.keys(g.taken), resumed: !g.offerPaused && !g.offer };
    });
    const bad = [];
    if (!r.up) bad.push('no offer panel within a second of the rescue');
    if (r.word !== 'Wren is home') bad.push(`the panel is headed "${r.word} ${r.level}", not "Wren is home"`);
    if (r.level !== '') bad.push(`the rescue's offer carries a level number: "${r.level}"`);
    if (r.cards.length < 3) bad.push(`${r.cards.length} cards on it`);
    if (!r.paused) bad.push('the game did not pause for it');
    if (!r.taken.length) bad.push('taking a card recorded nothing in `taken`');
    if (!r.resumed) bad.push('the game did not resume after the card was taken');
    return bad.length ? no(bad) : ok(`"Wren is home" with ${r.cards.length} cards, up within a second; took ${r.taken[0]} and the game resumed`);
  },

  // #251: THE FUNNEL COUNTS THE FIRST RUN. A fresh profile: Play is one, the stick moving him is
  // one, the rescue is one, and the black box carries when he first moved and when she was freed.
  async 'funnel-counts-the-first-run'(page, url) {
    await playFresh(page, url);
    await page.evaluate(() => { window.CFG.opening.holdFlag = false; window.game.hud.toast = () => {}; });
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crownrush-funnel') || '{}'));
    const afterPlay = await read();
    await page.evaluate(() => { const g = window.game; const v = { x: 0, z: 1, mag: 1 }; const real = g.input.read; g.input.read = () => v; setTimeout(() => { g.input.read = real; }, 400); });
    await page.waitForTimeout(600);
    const afterMove = await read();
    await waitForPicket(page);
    await page.evaluate(() => { const g = window.game; for (const e of [...g.enemies]) if (e.rescue || e.captor) g.removeEnemy(e); g.freeQueen(); if (g.offer) g.takeUpgrade(g.offer[0].id); g.king.mesh.position.set(0, 0, 2); g.queen.mesh.position.set(0, 0, 3.4); });
    await page.waitForTimeout(6500);   // the black box writes every five seconds
    const afterRescue = await read();
    const box = await page.evaluate(() => JSON.parse(localStorage.getItem('crownrush-blackbox') || '{}'));
    const line = await page.evaluate(() => { const g = window.game; return { first: g.firstInputAt, rescued: g.rescuedAt }; });
    const bad = [];
    if ((afterPlay.steps || {}).play !== 1) bad.push(`after Play the funnel reads play=${(afterPlay.steps || {}).play}`);
    if ((afterMove.steps || {}).moved !== 1) bad.push(`after the stick moved him the funnel reads moved=${(afterMove.steps || {}).moved}`);
    if ((afterRescue.steps || {}).rescued !== 1) bad.push(`after the rescue the funnel reads rescued=${(afterRescue.steps || {}).rescued}`);
    if (!afterRescue.days || afterRescue.days.length !== 1) bad.push(`the funnel lists ${(afterRescue.days || []).length} days, not 1`);
    if (box.firstInput == null || box.rescued == null) bad.push(`the black box carries firstInput=${box.firstInput} rescued=${box.rescued}`);
    if (typeof box.picketDeaths !== 'number') bad.push('the black box has no picketDeaths');
    return bad.length ? no(bad) : ok(`play 1, moved 1 at ${(line.first || 0).toFixed(1)}s, rescued 1 at ${(line.rescued || 0).toFixed(0)}s; the box carries all three`);
  },

  // #250: THE STRIP IS UP WHILE SHE IS HELD, SAYS THE RIGHT VERB, COUNTS DOWN, AND GOES. From the
  // opening: "Go after them" while she is carried, "Take her back" once she is set down, the paces
  // falling as the King is moved toward her, and gone within a second of her being freed.
  async 'objective-strip-while-held'(page, url) {
    await boot(page, url);
    await page.evaluate(() => { const g = window.game; window.CFG.opening.holdFlag = false; g.renderer.render = () => {}; if (g.post && g.post.composer) g.post.composer.render = () => {}; clearTimeout(g.renderWatch); g.renderWatch = null; });
    const read = () => page.evaluate(() => { const el = document.getElementById('objective'); return { hidden: el.classList.contains('hidden'), text: el.textContent.trim() }; });
    await page.waitForFunction(() => window.game.queen.taken, null, { timeout: 150000 });
    await page.waitForTimeout(300);
    const carried = await read();
    await waitForPicket(page);
    await page.waitForTimeout(300);
    const held = await read();
    const before = +((held.text.match(/(\d+) paces/) || [])[1] || 0);
    await page.evaluate(() => { const g = window.game; const q = g.queen.mesh.position; g.king.mesh.position.set(q.x, 0, q.z + 12); });
    await page.waitForTimeout(300);
    const nearer = await read();
    const after = +((nearer.text.match(/(\d+) paces/) || [])[1] || 0);
    await page.evaluate(() => { const g = window.game; for (const e of [...g.enemies]) if (e.rescue || e.captor) g.removeEnemy(e); g.freeQueen(); });
    await page.waitForTimeout(1000);
    const freed = await read();
    const bad = [];
    if (carried.hidden || !/Go after them/.test(carried.text)) bad.push(`while she was carried the strip read "${carried.text}"${carried.hidden ? ' (hidden)' : ''}`);
    if (held.hidden || !/Take her back/.test(held.text)) bad.push(`at the picket the strip read "${held.text}"${held.hidden ? ' (hidden)' : ''}`);
    if (!/north/.test(held.text)) bad.push(`the strip did not say north at the picket: "${held.text}"`);
    if (!(after < before)) bad.push(`the paces read ${before} then ${after} after moving the King 12 from her`);
    if (Math.abs(after - 12) > 2) bad.push(`12 units from her the strip read ${after} paces`);
    if (!freed.hidden) bad.push(`a second after she was freed the strip still read "${freed.text}"`);
    return bad.length ? no(bad) : ok(`"${carried.text}" while carried, "${held.text}" at the picket, ${after} paces at 12 units, gone once she was freed`);
  },

  // #249 / #253: THE FIRST MINUTE SAYS ONE THING AT A TIME. A fresh profile: the intro is one card with
  // no key names, the run's first notice is the morning line and nothing before it, and a notice's
  // first word is visible the frame its box is.
  async 'first-minute-is-one-card'(page, url) {
    await page.goto(url, { waitUntil: 'load', timeout: 150000 });
    await page.waitForSelector('#start-btn:not([disabled])', { timeout: 150000 });
    await page.evaluate(() => { const g = window.game; const h = g.hud; window.__first = []; const T = h.toast.bind(h); h.toast = (t, ms, k, u) => { window.__first.push(t); return T(t, ms, k, u); }; });
    await page.click('#start-btn');
    await page.waitForSelector('#intro-screen:not(.hidden)', { timeout: 30000 });
    const intro = await page.evaluate(() => ({
      dots: document.querySelectorAll('#intro-dots i').length,
      text: document.getElementById('intro-text').textContent,
      next: document.getElementById('intro-next').textContent,
      skip: getComputedStyle(document.getElementById('intro-skip')).visibility,
    }));
    await page.click('#intro-next');
    await page.waitForFunction(() => window.game && window.game.running && window.game.king, null, { timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'), null, { timeout: 30000 });
    // the frame the box is up: is its first word visible?
    const firstWord = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('#toast-text .tw-w')];
      if (!spans.length) return { words: 0 };
      const letters = [...spans[0].querySelectorAll('span')];
      return { words: spans.length, visible: letters.every((l) => parseFloat(getComputedStyle(l).opacity) >= 0.99) };
    });
    const first = await page.evaluate(() => window.__first);
    const bad = [];
    if (intro.dots !== 1) bad.push(`the intro is ${intro.dots} cards, not one`);
    if (/\b(Space|WASD|\(B\)|\(H\)|\(Q\)|Esc)\b/.test(intro.text)) bad.push(`the intro names keys: "${intro.text}"`);
    if (intro.next !== 'Play') bad.push(`the one card's button says "${intro.next}", not Play`);
    if (intro.skip !== 'hidden') bad.push('a one-card intro still shows Skip');
    if (!first.length || !/quiet morning/i.test(first[0])) bad.push(`the run's first notice was "${first[0] || '(none)'}", not the morning line`);
    if (first.some((t) => /inside the Keep/.test(t))) bad.push('"Wren is inside the Keep" fired during the tableau');
    if (firstWord.words === 0) bad.push('the notice box was up with no words in it');
    else if (!firstWord.visible) bad.push('the notice box was up with its first word still fading in');
    return bad.length ? no(bad) : ok(`one card, no keys, Play; first notice "${first[0].slice(0, 30)}…"; the first word was visible with the box`);
  },

  // #244: THE RESCUE INSTRUCTION IS ON SCREEN WHEN IT IS TRUE. Measured before the fix, with the lane
  // instrumented to log what it SHOWED: 24 wall notices from 30 s to 106 s, and "Go after them"
  // behind all of them -- a minute after she was gone. Asserted here the same way: a spy on
  // `nextToast` records each page as it comes up, against the moments `captureQueen` and
  // `handOffAtPicket` actually ran.
  async 'rescue-line-on-time'(page, url) {
    await playFresh(page, url);
    await page.evaluate(() => {
      const g = window.game; const h = g.hud;
      window.__shown = []; window.__at = {};
      const N = h.nextToast.bind(h); h.nextToast = () => { const r = N(); window.__shown.push([g.time, h.toastShowing || '']); return r; };
      const C = g.captureQueen.bind(g); g.captureQueen = () => { if (!window.__at.capture) window.__at.capture = g.time; return C(); };
      const H = g.handOffAtPicket.bind(g); g.handOffAtPicket = () => { window.__at.handoff = g.time; return H(); };
      const F = g.fallOfTheVillage.bind(g); g.fallOfTheVillage = () => { window.__at.fall = g.time; return F(); };
    });
    await waitForPicket(page);
    await page.waitForFunction(() => window.game.time > window.__at.handoff + 3, null, { timeout: 60000 });
    const r = await page.evaluate(() => ({ shown: window.__shown, at: window.__at }));
    const bad = [];
    const firstAfter = (t, re) => r.shown.find(([tt, text]) => tt >= t - 0.05 && re.test(text));
    const walls = r.shown.filter(([t, text]) => t >= r.at.fall && t <= r.at.capture && /wall section|gate is down/i.test(text)).length;
    if (walls > 1) bad.push(`${walls} wall or gate notices were shown between the fall and the snatch`);
    const go = firstAfter(r.at.capture, /Go after them/);
    if (!go) bad.push('"Go after them" was never shown after she was taken');
    else if (go[0] - r.at.capture > 1) bad.push(`"Go after them" came up ${(go[0] - r.at.capture).toFixed(1)}s after she was taken (limit 1s)`);
    const take = firstAfter(r.at.handoff, /Take her back/);
    if (!take) bad.push('"Take her back" was never shown after the hand-off');
    else if (take[0] - r.at.handoff > 1) bad.push(`"Take her back" came up ${(take[0] - r.at.handoff).toFixed(1)}s after the hand-off (limit 1s)`);
    return bad.length ? no(bad) : ok(`fall at ${r.at.fall.toFixed(0)}s with ${walls} wall notice${walls === 1 ? '' : 's'}; "Go after them" ${(go[0] - r.at.capture).toFixed(1)}s after the snatch, "Take her back" ${(take[0] - r.at.handoff).toFixed(1)}s after the hand-off`);
  },

  // #245: THE FIRST FIGHT CANNOT KILL A PLAYER WHO STANDS STILL. Before the damage share, the
  // standing bot was dead in 7.7 s; the kiting bot freed her in 40 s untouched. Both are driven, and
  // the standing one has to win without the restart (#246) ever firing.
  async 'picket-is-survivable'(page, url) {
    await playFresh(page, url);
    await waitForPicket(page);
    const stand = await page.evaluate(`(${PICKET_BOT})('stand', 90)`);
    const bad = [];
    if (stand.over) bad.push(`standing still, the run ended after ${stand.seconds}s`);
    if (stand.deaths) bad.push(`standing still, the King fell ${stand.deaths} time${stand.deaths > 1 ? 's' : ''} and had to be stood back up`);
    if (!stand.freed) bad.push(`standing still for ${stand.seconds}s, she was not freed (${stand.guards} guards left, King at ${stand.hp})`);
    if (stand.minHp === stand.hp && stand.minHp >= 140) bad.push('standing still in the middle of seven guards, the King was never hurt: the fight is a formality');
    return bad.length ? no(bad) : ok(`standing still: freed in ${stand.seconds}s, King down to ${stand.minHp} of 140 and never fell`);
  },

  // #246: THE NUDGE, AND THE RESTART AT THE PICKET. Passive after the hand-off she calls out at
  // `nudgeAfter` and again at `nudgeEvery`; with the damage share forced to 1 the standing bot dies,
  // and the run is not over -- he is back on the plot at full health with the guards posted again,
  // and a second, kiting attempt frees her.
  async 'picket-restart-and-nudge'(page, url) {
    await playFresh(page, url);
    await page.evaluate(() => {
      const g = window.game; window.__nudges = [];
      const A = g.raiseAlarm.bind(g); g.raiseAlarm = (t, v) => { if (/their camp/.test(t)) window.__nudges.push(g.time); return A(t, v); };
      const H = g.handOffAtPicket.bind(g); g.handOffAtPicket = () => { window.__handoff = g.time; return H(); };
    });
    await waitForPicket(page);
    const R = await page.evaluate(() => window.CFG.rescue);
    await page.waitForFunction((lim) => window.game.time > window.__handoff + lim, R.nudgeAfter + R.nudgeEvery + 3, { timeout: 120000 });
    const nudges = await page.evaluate(() => window.__nudges.map((t) => +(t - window.__handoff).toFixed(1)));
    const bad = [];
    if (nudges.length < 2) bad.push(`${nudges.length} nudge${nudges.length === 1 ? '' : 's'} in ${R.nudgeAfter + R.nudgeEvery + 3}s of standing off (wanted 2, at ${R.nudgeAfter} and ${R.nudgeAfter + R.nudgeEvery})`);
    else {
      if (Math.abs(nudges[0] - R.nudgeAfter) > 2) bad.push(`the first nudge came at ${nudges[0]}s, not ${R.nudgeAfter}`);
      if (Math.abs(nudges[1] - nudges[0] - R.nudgeEvery) > 2) bad.push(`the second nudge came ${(nudges[1] - nudges[0]).toFixed(1)}s after the first, not ${R.nudgeEvery}`);
    }
    await page.evaluate(() => { window.CFG.rescue.kingDamage = 1; });
    const stand = await page.evaluate(`(${PICKET_BOT})('stand', 40)`);
    const after = await page.evaluate(() => { const g = window.game; const k = g.king.mesh.position; return { over: !!g.over, hp: Math.round(g.king.hp), max: g.king.maxHp, atPlot: Math.hypot(k.x, k.z - 2) < 3, guards: g.enemies.filter((e) => e.rescue).length, captive: g.queen.captive }; });
    if (!stand.deaths) bad.push(`with full damage the standing King did not fall in ${stand.seconds}s, so the restart was not exercised`);
    if (after.over) bad.push('the King fell at the picket and the run ended');
    if (after.hp < after.max) bad.push(`after falling he stood up with ${after.hp} of ${after.max}`);
    if (!after.atPlot) bad.push('after falling he did not stand up on the plot');
    if (after.guards !== R.captors + (R.captain ? 1 : 0)) bad.push(`${after.guards} guards posted after the restart, not ${R.captors + (R.captain ? 1 : 0)}`);
    if (!after.captive) bad.push('she was not still held after the restart');
    await page.evaluate(() => { window.CFG.rescue.kingDamage = 0.1; });
    const kite = await page.evaluate(`(${PICKET_BOT})('kite', 90)`);
    if (!kite.freed) bad.push(`the second attempt, kiting, did not free her in ${kite.seconds}s`);
    return bad.length ? no(bad) : ok(`nudges at ${nudges.join('s and ')}s; fell once at full damage, stood up on the plot at ${after.hp} with ${after.guards} guards posted, and the second attempt freed her in ${kite.seconds}s`);
  },

  // #247: FROM THE RESCUE TO THE FIRST RAID IS A DAY, AND THE HUD SAYS SO. `?tour` holds the opening;
  // clearing the flag lets it run, the hand-off comes at about 47 s, and `freeQueen` is called the
  // way the game calls it. Then the countdown has to be up, and the first `startWave` has to come a
  // full day later with the number of knights the config names.
  async 'first-raid-after-a-day'(page, url) {
    await boot(page, url);
    await page.evaluate(() => { const g = window.game; window.CFG.opening.holdFlag = false; g.renderer.render = () => {}; if (g.post && g.post.composer) g.post.composer.render = () => {}; clearTimeout(g.renderWatch); g.renderWatch = null; g.hud.toast = () => {}; });
    await waitForPicket(page);
    const r = await page.evaluate(() => new Promise((done) => {
      const g = window.game;
      const S = g.startWave.bind(g);
      let firstWave = null;
      g.startWave = () => { const r = S(); if (!firstWave) firstWave = { at: g.time - t0, queue: g.spawnQueue.map((q) => q.type) }; return r; };
      // the guards fall and she is freed, the way the game does it; then a frame, so the clock and
      // the HUD have read the new phase before they are asked
      for (const e of [...g.enemies]) if (e.rescue || e.captor) g.removeEnemy(e);
      g.freeQueen();
      // #252: her thanks is a card, and the panel pauses the game; take one, the way a player does.
      // Then home: left at the picket she is inside the camp's reach and is taken again.
      if (g.offer) g.takeUpgrade(g.offer[0].id);
      g.king.mesh.position.set(0, 0, 2);
      g.queen.mesh.position.set(0, 0, 3.4);
      const t0 = g.time;
      let timer = null; let countdown = null; let frames = 0;
      const hudNext = document.getElementById('next-wave');
      const step = () => {
        if (++frames === 3) { timer = g.waveTimer; countdown = hudNext ? !hudNext.classList.contains('hidden') : null; }
        if (firstWave || g.time - t0 > 120) return done({ timer, countdown, hudFound: !!hudNext, firstWave });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }));
    const day = await page.evaluate(() => window.CFG.cycle.length * window.CFG.cycle.nightStart);
    const want = await page.evaluate(() => window.CFG.waves.firstKnights);
    const bad = [];
    if (r.timer < day - 1) bad.push(`the countdown read ${r.timer.toFixed(0)}s at the rescue, not a day (${day}s)`);
    if (r.countdown === false) bad.push('the countdown to night was hidden at the rescue');
    if (!r.firstWave) bad.push('no raid came within 120s of the rescue');
    else {
      if (r.firstWave.at < day - 1) bad.push(`the first raid came ${r.firstWave.at.toFixed(0)}s after the rescue, not ${day}`);
      const knights = r.firstWave.queue.filter((t) => t === 'knight').length;
      if (knights !== want || knights !== r.firstWave.queue.length) bad.push(`the first raid was ${r.firstWave.queue.join(', ')}; wanted ${want} knights and nothing else`);
    }
    return bad.length ? no(bad) : ok(`countdown ${r.timer.toFixed(0)}s at the rescue${r.hudFound ? ', shown' : ''}; the first raid ${r.firstWave.at.toFixed(0)}s later, ${r.firstWave.queue.length} knights`);
  },

  // #236: THE GLUT COMPOUNDS BY THE TRANCHE AND DAWN RESETS IT. Thirty diamond sold through the
  // real `updateTrade` -- the post itself, at its own rate of a unit every 0.09s -- and the coins
  // that arrived counted against 10 x 20 + 10 x 15 + 10 x 11 (the unit price rounds, so the third
  // tranche is 11 and not 11.25). Then the dawn beat, and the next unit at 20 again. The panel is
  // read at the end: with ten sold today and diamond in the bag, its chip has to carry both prices.
  async 'glut-resets-at-dawn'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const CFG = window.CFG;
      g.hud.toast = () => {};
      g.saveRun = () => {};
      // the post, wherever it is: stand the King on it
      if (!g.tradePost) g.buildStructure(g.pads.map((p) => p.def).concat(window.PADS || []).find((d) => d && d.id === 'exchange') || { id: 'exchange', structure: 'bank', pos: [9.8, -6], buildAt: [9.8, -9.8] });
      g.king.mesh.position.set(g.tradePos[0], 0, g.tradePos[1]);
      const sell = (n) => {
        for (const k of Object.keys(g.res)) g.res[k] = 0;
        g.res.diamond = n;
        const before = g.coinsCarried;
        for (let i = 0; i < 4000 && g.res.diamond > 0; i++) g.updateTrade(0.1);
        return { got: g.coinsCarried - before, left: g.res.diamond };
      };
      const day1 = sell(30);
      g.wave = 3;
      g.dawnBreaks(true);
      const day2 = sell(1);
      // the panel: ten sold today, diamond and stone in the bag, the King just outside selling range
      for (const k of Object.keys(g.res)) g.res[k] = 0;
      g.res.diamond = 6; g.res.stone = 4;
      g.soldToday = { diamond: 10 };
      g.king.mesh.position.set(g.tradePos[0], 0, g.tradePos[1] + CFG.trade.radius + 1.5);
      g.hud.toastShowing = false; g.hud.gain = null;
      const shown = g.tradeTip();
      const chips = [...document.querySelectorAll('#pad-tip .chip, .tip .chip')].map((c) => c.textContent.trim());
      const tipHidden = (document.querySelector('#pad-tip') || document.querySelector('.tip') || { classList: { contains: () => null } }).classList.contains('hidden');
      const coin = CFG.materials.diamond.coin;
      const g1 = CFG.materials.diamond.glut;
      let expect = 0;
      for (let i = 0; i < 30; i++) expect += Math.max(1, Math.round(coin * Math.pow(g1.pay, Math.floor(i / g1.every))));
      return { day1, day2, expect, coin, shown, chips, tipHidden };
    });
    const bad = [];
    if (r.day1.left) bad.push(`${r.day1.left} diamond never sold`);
    if (r.day1.got !== r.expect) bad.push(`thirty diamond in one day paid ${r.day1.got}, not ${r.expect} (10 x 20 + 10 x 15 + 10 x 11)`);
    if (r.day2.got !== r.coin) bad.push(`the first diamond after dawn paid ${r.day2.got}, not ${r.coin}`);
    if (!r.shown) bad.push('the trade post showed no panel with the King beside it');
    if (!r.chips.some((c) => /Diamond 20 . 15 today/.test(c))) bad.push(`no chip reads "Diamond 20 -> 15 today": ${JSON.stringify(r.chips)}`);
    if (!r.chips.some((c) => /^Stone 4$/.test(c))) bad.push(`no chip reads "Stone 4" for a material at full price: ${JSON.stringify(r.chips)}`);
    if (r.tipHidden) bad.push('the panel element is still hidden');
    return bad.length ? no(bad) : ok(`30 diamond paid ${r.day1.got} (20, then 15, then 11 a unit); dawn, and the next paid ${r.day2.got}; the panel reads ${r.chips.join(' | ')}`);
  },

  // #235: AN OFFER ALWAYS HAS A CARD YOU HAVE NOT READ, while one is left. Driven on the real level-up
  // panel rather than on `pickOffer`, because the seen set is the game's to keep: a `showOffer` that
  // forgot to pass it, or to add the offer to it, would leave `pickOffer` correct and the panel wrong.
  //
  // Six offers at level 12, each with every card but one already seen. Under the rule the one card
  // left is on every offer, and on the screen; without it the chance one random offer of three
  // happens to hold it is 3 in 23, and six in a row is one in a hundred thousand -- which is what
  // makes the sabotage (the game's `seen` always empty) a red rather than a coin toss.
  async 'unseen-card-on-offer'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(() => {
      const g = window.game;
      const all = window.UPGRADES.map((u) => u.id);
      const out = [];
      g.baseLevel = 12;
      for (let i = 0; i < 6; i++) {
        const left = all[(i * 7) % all.length];
        g.seen = Object.fromEntries(all.filter((id) => id !== left).map((id) => [id, true]));
        g.taken = {};
        g.offer = null;
        g.offerQueue = 1;
        g.showOffer();
        const ids = (g.offer || []).map((u) => u.id);
        const onScreen = [...document.querySelectorAll('#offer-cards .offer-card')].map((b) => b.dataset.id);
        out.push({ left, ids, onScreen, seenAfter: !!g.seen[left] });
        g.hud.hideOffer();
      }
      return out;
    });
    const bad = [];
    for (const o of r) {
      if (!o.ids.includes(o.left)) bad.push(`with only ${o.left} unseen, the offer was ${o.ids.join(', ')}`);
      else if (!o.onScreen.includes(o.left)) bad.push(`${o.left} was in the offer and not on the panel (${o.onScreen.join(', ')})`);
      if (!o.seenAfter) bad.push(`${o.left} was offered and not recorded as seen`);
    }
    return bad.length ? no(bad) : ok(`six offers at level 12 with one card unseen: the unseen card on every one, on the panel, and marked seen after`);
  },

  // #238: TWO CUES CANNOT QUIETLY BECOME ONE.
  //
  // Three mechanics shipped with a borrowed sound each: Wren's release played the warhorn beside it,
  // digging a cache played the stone chip, and a relic played the raid horn. The synth vocabulary is
  // twenty-six verbs of a dozen lines each, and the way that happens again is a new verb written by
  // copying a neighbour and moving two numbers. So every cue is rendered into an OfflineAudioContext
  // -- the real methods, the real bus chain, no browser gesture needed -- and reduced to a signature:
  // a 20 ms envelope and 22 third-octave bands in decibels under the loudest, floored 50 dB down.
  // The decibel scale is deliberate: a share of the energy weighs the loudest band and nothing else,
  // and on that scale a scrape added to a thud moved it 0.004. The distance is the mean absolute
  // difference of both halves.
  //
  // THE FLOOR IS 0.18. Measured on the day it was set: the closest pair among the new cues and the
  // rest is the last dig swing against `confirm` at 0.205, the next the first swing against `banner`
  // at 0.218; the closest pair in the vocabulary that was already there is `banner` against
  // `enemyDie` at 0.154, which is why only pairs with a new cue in them are held to it. The first
  // dig was a low sine under low-passed noise and measured 0.10 from `enemyDie` -- the same sound,
  // and this check is what said so.
  //
  // The muted and volume-zero renders are the #174 criterion: the new cues go through the same bus
  // chain as everything else, and that chain is rebuilt on the offline context the same way `init`
  // builds it, so a cue that bypassed `sfx` would come out at full volume with the slider at zero.
  async 'cues-do-not-converge'(page, url) {
    await boot(page, url);
    const r = await page.evaluate(async () => {
      const a = window.audio;
      const SR = 22050;
      const LEN = 1.6;
      const render = async (fn, tweak) => {
        const off = new window.OfflineAudioContext(1, Math.round(SR * LEN), SR);
        const saved = { ctx: a.ctx, sfx: a.sfx, master: a.master, sfxVolGain: a.sfxVolGain, muted: a.muted, noiseBuf: a.noiseBuf, lastHit: a.lastHit, sfxVol: a.sfxVol };
        a.ctx = off; a.noiseBuf = null; a.lastHit = -1;
        if (tweak) tweak(a);
        a.master = off.createGain(); a.master.gain.value = a.muted ? 0 : 0.6; a.master.connect(off.destination);
        a.sfxVolGain = off.createGain(); a.sfxVolGain.gain.value = a.sfxVol; a.sfxVolGain.connect(a.master);
        a.sfx = off.createGain(); a.sfx.gain.value = 0.9; a.sfx.connect(a.sfxVolGain);
        a.ready = () => !a.muted;   // an offline context reports `suspended` until it renders
        try { fn(a); const buf = await off.startRendering(); return buf.getChannelData(0); }
        finally { delete a.ready; Object.assign(a, saved); }
      };
      const sig = (d) => {
        const W = Math.round(SR * 0.02); const n = Math.floor(d.length / W); const rms = [];
        for (let w = 0; w < n; w++) { let s = 0; for (let i = w * W; i < (w + 1) * W; i++) s += d[i] * d[i]; rms.push(Math.sqrt(s / W)); }
        const peak = Math.max(...rms); const env = rms.map((x) => (peak ? x / peak : 0));
        const K = 1024; const N = d.length; const mag = new Float64Array(K);
        for (let k = 1; k < K * 0.75; k++) { const w = 2 * Math.PI * k / (2 * K); let re = 0; let im = 0; for (let i = 0; i < N; i++) { re += d[i] * Math.cos(w * i); im -= d[i] * Math.sin(w * i); } mag[k] = re * re + im * im; }
        const bands = [];
        for (let b = 0; b < 22; b++) { const lo = 55 * Math.pow(2, b / 3); const hi = 55 * Math.pow(2, (b + 1) / 3); let e = 0; let c = 0; for (let k = 1; k < K * 0.75; k++) { const f = k * SR / (2 * K); if (f >= lo && f < hi) { e += mag[k]; c++; } } bands.push(c ? e / c : 0); }
        const tot = bands.reduce((s, x) => s + x, 0) || 1; const emax = Math.max(...bands) || 1;
        const spec = bands.map((x) => Math.max(0, 1 + Math.max(-50, 10 * Math.log10((x || 1e-30) / emax)) / 50));
        let cen = 0; bands.forEach((e, b) => { cen += e / tot * 55 * Math.pow(2, (b + 0.5) / 3); });
        return { env, spec, peak, centroid: Math.round(cen) };
      };
      const dist = (p, q) => { let e = 0; let s = 0; for (let i = 0; i < p.env.length; i++) e += Math.abs(p.env[i] - q.env[i]); for (let i = 0; i < 22; i++) s += Math.abs(p.spec[i] - q.spec[i]); return e / p.env.length + s / 22; };
      const cues = {
        wrenRelease: (x) => x.wrenRelease(), 'dig(0)': (x) => x.dig(0), 'dig(1)': (x) => x.dig(1), relic: (x) => x.relic(), fall: (x) => x.fall(0),
        horn: (x) => x.horn(), "mine('stone')": (x) => x.mine('stone'), wave: (x) => x.wave(false), unlock: (x) => x.unlock(),
        confirm: (x) => x.confirm(), banner: (x) => x.banner(), enemyDie: (x) => x.enemyDie(0), coin: (x) => x.coin(0), alarm: (x) => x.alarm(0),
      };
      const fresh = ['wrenRelease', 'dig(0)', 'dig(1)', 'relic', 'fall'];
      const sigs = {};
      for (const [k, f] of Object.entries(cues)) sigs[k] = sig(await render(f));
      const pairs = [];
      const keys = Object.keys(cues);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (fresh.includes(keys[i]) || fresh.includes(keys[j])) pairs.push([keys[i], keys[j], dist(sigs[keys[i]], sigs[keys[j]])]);
      pairs.sort((p, q) => p[2] - q[2]);
      const silent = {};
      for (const k of fresh) {
        silent[k] = {
          muted: sig(await render(cues[k], (x) => { x.muted = true; })).peak,
          vol0: sig(await render(cues[k], (x) => { x.sfxVol = 0; })).peak,
        };
      }
      return {
        pairs, peaks: Object.fromEntries(keys.map((k) => [k, sigs[k].peak])), centroids: Object.fromEntries(keys.map((k) => [k, sigs[k].centroid])), silent,
        restored: a.ctx === (window.audio.ctx) && !Object.prototype.hasOwnProperty.call(a, 'ready') && a.sfxVol > 0 && !a.muted,
      };
    });
    const FLOOR = 0.18;
    const bad = [];
    for (const k of ['wrenRelease', 'dig(0)', 'dig(1)', 'relic', 'fall']) if (!(r.peaks[k] > 0.005)) bad.push(`${k} rendered silent (peak ${r.peaks[k]})`);
    for (const [p, q, d] of r.pairs) if (d < FLOOR) bad.push(`${p} and ${q} are ${d.toFixed(3)} apart, under the ${FLOOR} floor: they are the same sound`);
    if (!(r.centroids['dig(1)'] > r.centroids['dig(0)'] * 1.3)) bad.push(`the last dig swing (${r.centroids['dig(1)']} Hz) does not sit above the first (${r.centroids['dig(0)']} Hz)`);
    for (const [k, v] of Object.entries(r.silent)) {
      if (v.muted > 0) bad.push(`${k} plays with sound off (peak ${v.muted})`);
      if (v.vol0 > 0) bad.push(`${k} plays with the effects slider at zero (peak ${v.vol0})`);
    }
    if (!r.restored) bad.push('the audio object was not put back the way it was found');
    const near = r.pairs[0];
    return bad.length ? no(bad) : ok(`${r.pairs.length} pairs measured, the closest ${near[0]} to ${near[1]} at ${near[2].toFixed(3)} (floor ${FLOOR}); the dig rises ${r.centroids['dig(0)']} to ${r.centroids['dig(1)']} Hz; all four silent when muted and at volume zero`);
  },
};

// #179: the sabotage each check has to survive going red under. One per check, aimed at exactly the
// thing the registry says that check covers -- not at "make the page throw", which any check would
// notice and which proves nothing. Each runs in the page after `boot`, once the world exists.
//
// A check missing from here is reported as unproved rather than counted as proved. That is the same
// honesty the `judged` rows get: a gap you can see beats a number that flatters.
// #179: WHEN a sabotage arms, for the ones that cannot use the default.
//
// The harness arms at frame 5 -- late enough that shaders have compiled and early enough to be
// underneath anything a check wraps (see `checks.mjs`). `opening-resolves` is the exception and the
// reason is in its own shape: it pins `queen.captive` to false so the opening can never resolve, and
// by frame 5 the opening has already started taking her. Pinning the flag mid-capture leaves the
// scene half-built and three throws on its own internals -- which the runner correctly reports as
// "sabotage broke the run rather than the assertion" rather than counting it as proved.
//
// So it arms at 0, before there is an opening to interrupt. Anything added here needs the same kind
// of sentence: a number on its own is the thing this file exists not to have.
// `one-live-context` is the other: its sabotage has to be in place BEFORE the portrait renderer is
// made, and that happens in the load promise, before the game has drawn a single frame. Frame 5 is
// not late in this one's life, it is after the end of it. At 0 the arm fires on the first animation
// frame after `new Game`, which is before the rigs have finished downloading.
// `black-box-outlives-the-tab` arms at 0 for the same kind of reason: the record is written on the
// first frames of the loop, so a sabotage that blocks the write has to be underneath the first one.
export const PROVE_AT = { 'opening-resolves': 0, 'one-live-context': 0, 'black-box-outlives-the-tab': 0 };

export const PROVE = {
  // one view is held shut, which is the failure the check was written after: a board frame showing
  // the wrong thing looks exactly like a board frame showing the right thing
  'views-open': () => {
    setInterval(() => { const e = document.getElementById('keep-screen'); if (e) e.classList.add('hidden'); }, 40);
  },
  // the ground keeps its hook and loses its flag, which is what a silent un-banding looks like
  'bands-hooked': () => {
    window.game.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        const key = (m.customProgramCacheKey ? String(m.customProgramCacheKey()) : '');
        if (key.startsWith('ground-untiled')) { m.userData.banded = false; m.userData.bandedShader = false; }
      }
    });
  },
  // a HUD write on every frame, which is the house rule this check exists to enforce
  'hud-quiet': () => {
    const hud = window.game.hud;
    const real = hud.set.bind(hud);
    hud.set = (...a) => { document.getElementById('army-count').textContent = String(Math.random()); return real(...a); };
  },
  // The canvas multisampling not carried onto the composer's target -- a jaggier picture and no
  // error, which is one of the three things this check exists to notice.
  //
  // POPPING THE OUTPUT PASS WAS THE FIRST ATTEMPT AND IT PROVED NOTHING, which is worth keeping:
  // with the grade already disabled for the comparison, removing OutputPass leaves RenderPass as the
  // last enabled pass, so the composer renders straight to the canvas -- and three tone-maps a
  // material bound for the canvas. The sabotage produced a correctly tone-mapped frame and the check
  // was right to stay green.
  'post-once': () => {
    const c = window.game.post && window.game.post.composer;
    if (c) { c.renderTarget1.samples = 0; c.renderTarget2.samples = 0; }
  },
  // #206: the marker never sticks, which is the greeting that opens on every single load -- the
  // failure that is indistinguishable from a bug in something else and gets dismissed faster each
  // time it happens. Everything else in storage is left alone, so nothing about the run changes.
  'release-greeting': () => {
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => { if (k !== 'crownrush-release-seen') real(k, v); };
  },
  'walls-solid': () => { window.game.collideWalls = () => {}; },
  // the Keep's mat shoved back off its door axis, which is the state this check was written after
  'mats-at-doors': () => {
    const d = (window.PADS || []).find((p) => p.id === 'keep');
    if (d) d.pos = [-5, 5];
  },
  // the gates stay gates and the wall stops honouring them
  'gates-passable': () => {
    const g = window.game, real = g.collideWalls.bind(g);
    g.collideWalls = (p, r, k) => { p.x += 0.5; return real(p, r, k); };
  },
  'wall-ring-unbroken': () => { window.game.collideWalls = () => {}; },
  // she is never taken, so the opening never resolves -- the run that softlocks
  // #179: THE HOLE `CFG.opening.speed` EXISTS TO CLOSE, which is a truer sabotage than the one that
  // was here and the only one that does not corrupt the game on its way past.
  //
  // It used to pin `queen.captive` to false with a defineProperty. That does make the check go red,
  // but not honestly: `captureQueen` still runs its whole body every time `updateSeize` calls it,
  // the flag never latches, so it is called again on the very next frame -- thousands of times, each
  // one rebuilding her escort. The run fell over inside three's ANIMATION mixer
  // (`Cannot set properties of undefined (setting '_cacheIndex')`, which is `PropertyBinding`'s
  // memory manager, not the renderer), and the runner reported "sabotage broke the run rather than
  // the assertion" -- correctly refusing to count it as proved.
  //
  // The collectors run at 6.2 because that must beat a King on foot at 5.6: config.js says so
  // outright -- "a player who simply walks away is never caught: the snatch never lands, the day
  // clock never starts, and the run sits in its first minute for ever". This check runs him flat out
  // at 0.28 a step -- but CLAMPED to +/-18, which is the part that matters here. He reaches the clamp
  // after about 130 of the 2000 steps and stands still for the rest, so a merely SLOW party still
  // walks up to a stationary Queen and takes her: `speed = 2` was tried and the check stayed green,
  // correctly. Zero is the honest version of the same bug -- the party spawns, the snatch is marked
  // as having happened, and nobody ever arrives, so the run sits in its first minute for ever with
  // `snatched` true and `captive` false. That is exactly the shape the check's own failure message
  // reports. One assignment to a config number, and no interval to survive `reset()` either, because
  // CFG is a module constant and a run does not rebuild it.
  'opening-resolves': () => { window.CFG.opening.speed = 0; },
  // #181 put back exactly as it was: the anchor teleports and nothing holds her off him
  'queen-visible': () => { window.CFG.queen.followTurn = 1e6; window.CFG.queen.kingGap = 0; },
  // #203 put back exactly as it was found: a ring of seven, a slot chosen by COUNTING the crew, and
  // the deck height the import claimed rather than the one it has.
  'tower-crew-placed': () => {
    window.game.crewSpots = function (def) {
      const t = this.towers[def.tower];
      if (!t) return [];
      const out = [];
      for (let i = 0; i < def.crew; i++) {
        const a = (t.crew + i) * ((Math.PI * 2) / 7) + 0.5;
        out.push([t.x + Math.cos(a) * 0.75, t.z + Math.sin(a) * 0.75, 2.72]);
      }
      return out;
    };
  },
  // #208 exactly as it was: the walk keeps its straight line and loses BOTH recoveries. Pinning
  // `stuckT` is the whole sabotage -- no detour is ever asked for and the watchdog never trips --
  // and it touches nothing else, so what is left is the code that shipped the bug.
  'post-walk-unblocked': () => {
    const pin = () => {
      const g = window.game;
      if (g && g.units) for (const u of g.units) if (u.assign) { u.stuckT = 0; u.detour = null; }
      requestAnimationFrame(pin);
    };
    requestAnimationFrame(pin);
  },
  'rebuild-after-fall': () => { window.game.buildStructure = () => {}; },
  // #221: the exact bug this check was written after finding. Arrows come off a pool, and an arrow
  // that has already pierced carries its flag back onto the shelf -- so the relic works for the
  // first few shots of a run and then silently stops. Nothing breaks; the player just thinks they
  // misremembered. Marking every arrow as spent-already reproduces it whole.
  'relics-bite': () => {
    const g = window.game;
    const fire = g.fireArrow.bind(g);
    g.fireArrow = (...a) => {
      fire(...a);
      const last = g.arrows[g.arrows.length - 1];
      if (last) last.pierced = true;
    };
  },
  // #190: `forceContextLoss` is `extensions.get('WEBGL_lose_context').loseContext()` and nothing else,
  // so hiding that one extension is not a made-up failure -- it is precisely the bug rig.js's comment
  // warns about, dispose() called and the context still alive. The portrait renderer is then released
  // exactly as it is today and the context stays up, which is what the check has to notice.
  'one-live-context': () => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = real.call(this, type, ...rest);
      if (c && /webgl/i.test(type)) {
        const get = c.getExtension.bind(c);
        c.getExtension = (n) => (n === 'WEBGL_lose_context' ? null : get(n));
      }
      return c;
    };
  },
  // #190: the record never lands -- which is a private window, a full quota, or a writer that stopped
  // writing. Not "make the page throw": everything else about the session still works, and the only
  // thing missing is the one measurement the next load was going to be told by.
  'black-box-outlives-the-tab': () => {
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => { if (k !== 'crownrush-blackbox') real(k, v); };
  },
  // #190: the mat ON THE FIELD stops answering to what `config.js` asks for, which is the bug exactly
  // -- one property along. Historically it was `pos` that differed while the test was object
  // identity; the test is the id now, so the sabotage differs the id. Wrapping `addPad` instead was
  // tried and proved nothing: it arms after boot has already put the mats down with the right ids,
  // so nothing is ever re-added and the check stays green about a game that is fine.
  //
  // The two bridge mats, because those are the two the bug was about. Everything else still works --
  // they are built, drawn and placed as they always were -- and the only thing broken is the question
  // "is this one already down?"
  'mats-do-not-multiply': () => {
    for (const p of window.game.pads) if (p.def.bridge) p.def = { ...p.def, id: `${p.def.id}#moved` };
  },
  // #223: the plateau becomes a picture -- the rock is still drawn and the rim is still fenced, but
  // the ground under a foot is flat everywhere. That is what this would look like if `floorAt` were
  // ever bypassed, which is the one line the whole feature hangs off.
  'high-ground-holds': () => { window.game.world.floorAt = () => 0; },
  // #239: the direction lost at its source -- every cue is told it happened at the King, which is
  // what the game sounded like before the ticket and what a refactor of a call site would quietly
  // bring back. The panner code stays intact, so a check that only asked whether a node existed
  // when given a number would still be green.
  'sounds-have-a-side': () => { window.game.panAt = () => 0; },
  // #238: the release becomes the horn again, which is exactly what it was before the ticket
  'cues-do-not-converge': () => { window.audio.wrenRelease = window.audio.horn; },
  // #235: the game forgets what it has shown -- `seen` reads empty and writes go nowhere
  // #248: one frame, as it was
  'village-falls-in-order': () => { window.CFG.opening.fallOver = 0; },
  // #252: no card at the rescue
  'rescue-offers-a-card': () => { window.CFG.rescue.offersCard = false; },
  // #251: the steps go uncounted
  'funnel-counts-the-first-run': () => { window.game.mark = () => {}; },
  // #250: the strip never written
  'objective-strip-while-held': () => { window.game.hud.setObjective = () => {}; },
  // #249: the stale Keep line back in the tableau
  'first-minute-is-one-card': () => { const g = window.game; const o = g.queenEnterKeep.bind(g); g.queenEnterKeep = () => o(true); },
  // #247: the grace back to 22 s
  'first-raid-after-a-day': () => { window.CFG.rescue.firstRaid = 22; },
  // #244: the bug as it shipped -- every wall announces itself and no line has priority, so the
  // instruction queues behind the masonry. Either half alone is not enough to go red: the quiet fall
  // empties the queue before "Go after them" arrives, and with the priority the walls do not matter.
  'rescue-line-on-time': () => {
    const g = window.game; const h = g.hud;
    const o = h.toast.bind(h); h.toast = (t, ms, k) => o(t, ms, k, false);
    const b = g.breakWall.bind(g); g.breakWall = (w) => b(w, true);
  },
  // #245: the guards hit as hard as they used to
  'picket-is-survivable': () => { window.CFG.rescue.kingDamage = 1; },
  // #246: a death at the picket is the run ending, as it was
  'picket-restart-and-nudge': () => { window.game.picketRestart = () => window.game.gameOver('king'); },
  // #236: the glut priced back to nothing -- every tranche pays full, which is the ladder as it was
  'glut-resets-at-dawn': () => { for (const m of Object.values(window.CFG.materials)) if (m.glut) m.glut.pay = 1; },
  'unseen-card-on-offer': () => { Object.defineProperty(window.game, 'seen', { get: () => ({}), set() {}, configurable: true }); },
};
