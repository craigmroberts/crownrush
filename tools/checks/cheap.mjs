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

// #179: the sabotage each check has to survive going red under. One per check, aimed at exactly the
// thing the registry says that check covers -- not at "make the page throw", which any check would
// notice and which proves nothing. Each runs in the page after `boot`, once the world exists.
//
// A check missing from here is reported as unproved rather than counted as proved. That is the same
// honesty the `judged` rows get: a gap you can see beats a number that flatters.
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
  'opening-resolves': () => {
    // Re-applied on a timer because this check presses Play, and `reset()` builds a new Queen -- a
    // one-shot defineProperty would be thrown away by the very run it is meant to break.
    const pin = () => {
      const q = window.game && window.game.queen;
      if (q && !Object.getOwnPropertyDescriptor(q, 'captive').get) {
        Object.defineProperty(q, 'captive', { get: () => false, set: () => {}, configurable: true });
      }
    };
    pin();
    setInterval(pin, 40);
  },
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
  'rebuild-after-fall': () => { window.game.buildStructure = () => {}; },
};
