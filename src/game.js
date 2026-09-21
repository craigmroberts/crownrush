import * as THREE from 'three';
import { CFG, TIERS, NODES, PADS } from './config.js';
import { makePost } from './post.js';
import { audio } from './audio.js';
import { setRigShadows, enableCrowd, updateCrowd, clearCrowd, crowdStats } from './rig.js';
import { MODS } from './upgrades.js';
import { recordRun, readNumber, writeNumber, readLegacy, addLegacy, unlockDiary, readPicks } from './scores.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import { setHealthBar, HealthBars, CoinField, clearHealthBars, makeRing, makeCoinStack, makeCamp, makeCache, makeTorchField, cacheSizes } from './models.js';
import { V3, tmp, tmp2, rand } from './game-shared.js';
import { BuildMethods } from './game-build.js';
import { EnemiesMethods } from './game-enemies.js';
import { UnitsMethods } from './game-units.js';
import { ViewMethods } from './game-view.js';
import { VillagerMethods } from './game-villagers.js';
import { HorseMethods } from './game-horses.js';
import { SaveMethods, readLength, RUN_KEY } from './game-save.js';
import { QualityMethods } from './game-quality.js';
import { endSession } from './report.js';

// #174: a stored on/off, defaulting on when nothing is stored
// #222: the system's own motion preference. Wrapped because `matchMedia` is absent in some embeds
// and a throw here would take the constructor with it; absent means "no preference stated", which
// is the same answer as not having set one.
// #219: `?seed=N` pins the map, `?view=` and `?tour` get the fixed one, a run waiting to be picked
// up gets its own, and anything else is rolled.
function mapSeed() {
  const asked = (/[?&]seed=(\d+)/.exec(location.search) || [])[1];
  if (asked !== undefined) return Number(asked) >>> 0;
  if (/[?&](view|tour)=?/.test(location.search)) return 0;
  // A RUN THAT CAN BE PICKED UP DECIDES THE MAP, and it has to decide it here.
  //
  // `buildWorld` runs once, in the constructor, long before the title screen offers Continue -- so
  // by the time `restoreRun` knows which map the save is on, the world it would be restored into has
  // already been built. Reading the save here is what closes that: the map is laid out for the run
  // the player is most likely about to resume, and `restoreRun` checks the two agree before it
  // applies anything (see the refusal there).
  //
  // The cost is that New Run, chosen from the title screen with a save still sitting there, gets the
  // saved run's map rather than a fresh one. It is the same map for one run and then the save is
  // gone; the alternative is reloading the page to re-roll the world, which is seconds of black
  // screen between every run to avoid a repeat somebody asked for by pressing New Run.
  //
  // Read raw and defensively -- this runs before the save module has been asked anything, it must
  // never throw (a corrupt save cannot be allowed to stop the game starting), and a save from before
  // #219 has no seed at all, which is 0: the hand-placed map those runs were played on.
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.wave === 'number') return (s.seed || 0) >>> 0;
    }
  } catch (e) { /* private mode, or a save we cannot read: roll one */ }
  return (Math.floor(Math.random() * 0xffffff) + 1) >>> 0;
}

// #233: `?escort=off` for a run, matching how `?shadows=` and `?seed=` already work. `CFG.escort` is
// the default and the URL is the override, so a phone can be handed the comparison without a build.
function escortOn() {
  const asked = (/[?&]escort=(on|off)/.exec(location.search) || [])[1];
  return asked ? asked === 'on' : CFG.escort;
}

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch (e) {
    return fallback;
  }
}

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    // ?safe=1 strips the game back to the plainest renderer it can use: no shadows, no antialiasing,
    // one device pixel per CSS pixel, and no preference for a particular GPU. It exists for devices
    // where the normal path shows nothing, and safeMode() turns it on by itself if that happens.
    this.safe = /[?&]safe=1/.test(location.search);
    // #26: a Pixel Fold rendered a white world until ?safe=1, which left shadows, the GPU preference
    // hint and the pixel ratio as the only suspects. Phones take the first two of those now: the
    // shadow map is off and the preference hint is dropped. Characters already cast instanced blob
    // shadows on a phone, so what goes is building and tree shadows, and that is a speed-up as well.
    // ?hq=1 puts the full path back on a phone, for testing.
    this.hq = /[?&]hq=1/.test(location.search);
    const plain = this.safe || (this.mobile && !this.hq);
    // #193: which shadow map this run has, and it is the one thing here a person can argue with.
    // `?shadows=off|cheap|full` overrides; otherwise a desktop gets `full`, `?hq=1` on a phone gets
    // `full` as it always has, and an ordinary phone gets `off` -- which is what it has had since #26
    // and stays the default until somebody has measured `cheap` on a real one. See `CFG.shadowMap`
    // for the two profiles and why the cheap one is shaped the way it is.
    const asked = (/[?&]shadows=(off|cheap|full)/.exec(location.search) || [])[1];
    this.shadowProfile = this.safe ? 'off' : asked || (plain ? 'off' : 'full');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile && !this.safe,
      powerPreference: plain ? 'default' : 'high-performance',
    });
    this.setPixelRatio();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200);
    this.input = new Input(canvas);
    const { sun, hemi, rim } = setupLights(this.scene);
    this.sun = sun;
    this.hemi = hemi;
    this.rim = rim;   // #187: the cool edge light, keyed with the day in `updateDaylight`
    // #81: what the sky is worth when it is dry. updateDaylight writes the sun, the hemisphere and
    // the exposure every frame, so rain can just scale those on its way past -- but these three it
    // never touches, so something has to remember them to put them back. Read off the lights rather
    // than repeated in CFG, because two places holding the same number is how one of them goes stale.
    // #194 took `hemi` out of here: the day cycle writes the hemisphere's INTENSITY now as well as
    // its two colours, so rain scales what the day just set instead of restoring a fixed 1.45 over
    // the top of it -- which would have flattened every dusk the moment a shower started.
    this.dry = { fogNear: this.scene.fog.near, fogFar: this.scene.fog.far, shadow: sun.shadow.intensity };
    this.dayPhase = 0.05; // the run opens in early morning
    this.night = false;
    // #194: an override for which sky table `updateDaylight` reads, and null every way but one --
    // `?blood=1` on a board frame. Deliberately outside `reset()`, like `camLock`: a view that was
    // asked for a time of day keeps it across a restart.
    this.bloodSky = null;
    this.sunHeight = 34;
    // #193: the profile, onto the renderer and the light. Before the first frame, so nothing has been
    // compiled against the other setting and there is no recompile to pay for.
    this.applyShadowProfile(this.shadowProfile);
    // #189: the post pass. Not in safe mode, which is the plainest renderer there is and stays that
    // way -- and that is decided here, once, rather than switched later: the composer changes the
    // tone-mapping define on every material, so choosing it is a load-time decision and only the
    // GRADE moves with the quality tier. `aa` matches the canvas's own antialias exactly, so the
    // multisampling the target takes over is the multisampling the canvas would have had.
    this.post = this.safe ? null : makePost(this.renderer, this.scene, this.camera, { aa: !this.mobile && !this.safe });
    // The world needs to know whether anything else casts, because then its contact discs are the
    // only shadow there is and they go heavier. `world.setSoleShadows` moves it afterwards.
    // #219: THE SEED FOR THIS MAP, and where it comes from matters more than what it is.
    //
    // `?seed=N` pins it, which is what makes a map a thing you can send somebody. `?view=` and the
    // board frames get 0 -- the hand-placed layout, unchanged -- because a board that re-rolled its
    // own map would make two screenshots of one page two different pictures (#222). Everything else
    // gets a fresh one, and `game-save.js` writes it down so a Continue picks up the same country
    // rather than the same village in a different one.
    //
    // `buildWorld` runs ONCE per page load, so this is a seed per LOAD rather than per run: Try Again
    // in the same tab keeps the map. That is short of what #219's title asks for and is recorded as
    // such rather than papered over -- a new map per restart means tearing the world down and
    // building it again, and everything `buildWorld` allocates (merged geometries, the ground
    // shaders, the instanced fields, the textures) would have to be handed back with it. #190 is the
    // whole argument for not doing that casually: dropping a root unparents everything and frees
    // nothing. It is its own piece of work.
    //
    // What a player actually gets today: a different map every time the game is opened, the same one
    // for as long as that tab lives, and the number on the ending screen to ask for either again.
    // #233: read once. It cannot change mid-session, and `game-enemies.js` needs the same answer.
    this.escort = escortOn();
    this.seed = mapSeed();
    this.world = buildWorld(this.scene, this.shadowProfile === 'off', this.seed);
    // #165 / #166: how big the for-ever caches in models.js are, for the perf overlay and for tests.
    this.cacheSizes = cacheSizes;
    // #166: a sample every two seconds of GAME time, kept for an hour, whether or not anyone is
    // looking. The overlay reads the trend off it and a tap copies it out; `game.perfLog` in the
    // console is the same array. It lives on the game and not in `reset`, so a restart does not
    // throw away the run that was being watched.
    this.perfLog = [];
    this.perfT = 0;
    // #168: the adaptive-quality state. `forced` is `?quality=N`, which pins a tier (0 = full) and
    // switches the controller off, for probes and screenshots that need the same picture every time.
    const qm = /[?&]quality=(\d)/.exec(location.search);
    // #174: the settings sheet's Quality choice outranks nothing and outlives the page: Auto, or a
    // pinned tier stored the way the sound is. The URL still wins, for the probe.
    let storedQ = null;
    try { const q = localStorage.getItem('crownrush-quality'); if (q && q !== 'auto') storedQ = +q; } catch (e) { /* private mode */ }
    this.quality = { tier: 0, slow: 0, fast: 0, dpr: 1, applied: false, forced: qm ? +qm[1] : storedQ };
    // #174: two more preferences, each a flag the thing it governs reads
    this.shakeOn = readFlag('crownrush-shake', true);
    this.numbersOn = readFlag('crownrush-numbers', true);
    // #216: the circle under the King. A DISPLAY flag and nothing else -- see `setRing`.
    this.ringOn = readFlag('crownrush-ring', true);
    // #216 part 2: the coins carried on his head. Off sends them to the counter instead.
    this.stackOn = readFlag('crownrush-stack', true);
    // #222: the camera turning itself. DEFAULTS OFF WHERE THE SYSTEM ASKS FOR LESS MOTION -- a
    // yawing camera is the single easiest way to make somebody queasy, and somebody who has set
    // that preference has already told us. `readFlag` still wins if they have chosen by hand, so
    // the preference is the default and not an override.
    this.driftOn = readFlag('crownrush-drift', !prefersReducedMotion());
    // #222: true for any `?view=`, set by `startForView`. A framed still does not move itself --
    // neither the yaw nor the breathing. Declared here so it is never undefined on a real run.
    this.framed = false;
    // Where the yaw actually is, in radians off the home angle. Rest is square (#222).
    this.camYaw = 0;
    if (this.quality.forced != null) this.applyQuality(this.quality.forced);
    this.buildFog();
    // every health bar in the game is drawn by this one instanced mesh
    this.bars = new HealthBars(600);
    this.scene.add(this.bars.mesh);
    // every coin on the ground is drawn by these two instanced meshes; see CoinField
    this.coinField = new CoinField(400);
    this.coinField.add(this.scene);
    // Phones: characters get one instanced "blob" shadow each instead of rendering into the shadow map
    // (that pass cost a second draw call per character). This used to say buildings and trees keep
    // real shadows, and they do not -- `plain` above turns the shadow map off entirely on any phone
    // without `?hq=1`, so on a phone NOTHING casts. The static world gets the instanced contact discs
    // `buildWorld` lays down instead, which is why it is told `plain`.
    // The crowd — raiders, archers, swordsmen, elites, brutes, the boss — is drawn as one instanced
    // mesh per model and animated on the GPU (src/crowd.js). ?crowd=0 puts every character back on
    // the skinned path this used to take, for comparing the two or for a device the instanced one
    // upsets. Safe mode takes the old path too: it exists to be the plainest thing that can work.
    this.noCrowd = this.safe || /[?&]crowd=0/.test(location.search);
    // kept on the game so it can be poked at from the console, and so a test can pin its clock
    this.crowd = this.noCrowd ? null : enableCrowd(this.scene);
    setRigShadows(!this.mobile);
    if (this.mobile) {
      const geo = new THREE.CircleGeometry(1, 18);
      geo.rotateX(-Math.PI / 2);
      this.blobs = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x24401c, transparent: true, opacity: 0.34, depthWrite: false }), 400);
      this.blobs.frustumCulled = false;
      this.blobs.position.y = 0.04;
      this.blobs.count = 0;
      this.scene.add(this.blobs);
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // iOS changes the visible area -- the home indicator band, the status bar -- without reliably
    // firing a window resize alongside it.
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.settleSize());
    // #74: and the box is not final on the first frame of a standalone launch. There is no event for
    // "iOS has finished deciding how big the screen is", so the only reliable answer is to ask again
    // a few times over the first second and a half. resize() is cheap and idempotent -- it sets a
    // buffer size and a camera aspect -- so asking four more times costs nothing and is the
    // difference between a correct first frame and green bands until something else triggers one.
    this.settleSize();
    this.watchContext(canvas);

    this.running = false;
    this.time = 0;
    // #119: the best NIGHT. Nothing shows it any more -- the title screen leads with the best run's
    // level and score instead -- but it is still kept: it is the only all-time record of the night
    // reached, the board holds only ten runs, and throwing a player's record away to change a label
    // is not a trade worth making if the decision is ever revisited.
    this.best = readNumber('crownrush-best', 1);
    // #58: the length this run is played at. A preference, not run state, so it is read here and
    // again in `start()` rather than in `reset()` -- restoring a thirty-night save sets it to that
    // save's length, and the next NEW run has to go back to what the player actually chose.
    this.runLength = readLength();
    this.reset();
  }

  // A WebGL context can be taken away: the GPU process restarts, the device is folded onto another
  // display, or too many contexts are live at once. The page keeps running, so the HUD and the
  // minimap carry on drawing over a blank world, which reads as a white screen with a working
  // interface. Stop drawing while it is gone, come back when it returns, and say so if it does not.
  watchContext(canvas) {
    this.contextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();   // without this the browser will not restore the context, ever
      this.contextLost = true;
      // #190: WRITE IT DOWN BEFORE ANYTHING ELSE. This is one of the ticket's two candidates and the
      // only one that leaves the page alive to say so; if the tab dies later the record is already on
      // disk, and if it does not, the next load still learns the context went away at all.
      endSession(this, 'context-lost');
      this.pause(true);
      this.hud.toast('Lost the graphics card for a moment. Restoring…', 4000);
      this.waitForContext();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      clearTimeout(this.contextTimer);
      if (window.__hideError) window.__hideError();   // in case we already gave up on it
      this.resize();
      if (!this.over && !this.won && !this.offer && !this.infoOpen && !this.settingsOpen) this.unpause();
      this.hud.toast('Graphics restored.', 2000);
    });
    // A phone takes the graphics card back when the browser goes to the background, and gives it back
    // when it returns. Both of those are normal, so neither should be judged while the page is hidden:
    // the context cannot come back until the page is visible, and a countdown that expires in the
    // meantime declares the game dead for a player who is only reading a message. Start the clock when
    // they come back, not while they are away.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(this.contextTimer);
      else if (this.contextLost) this.waitForContext();
    });
  }

  // Give the context a few seconds to come back, and only say it is gone if the page was watching the
  // whole time.
  waitForContext() {
    clearTimeout(this.contextTimer);
    if (document.hidden) return;
    this.contextTimer = setTimeout(() => {
      if (this.contextLost && window.__showError) window.__showError('The graphics context was lost and did not come back. A reload fixes it.');
    }, 6000);
  }

  // The drawing buffer is capped by area as well as by ratio. A big foldable at 1.5x asks for a
  // buffer several times a phone's, and a driver that will not give us one leaves a blank canvas.
  // #74: the size of the thing actually on screen, which is not what the window reports.
  //
  // `#game` is `position: fixed; inset: 0`, so with `viewport-fit=cover` it covers the whole display
  // -- under the status bar and under the home indicator. `window.innerWidth/innerHeight` do not:
  // in an iOS home-screen app they exclude area the element covers. Sizing the drawing buffer from
  // the window therefore left the canvas short at top and bottom, and what showed through was the
  // body background -- which is the same green as `theme-color`, so it read as two flat bands rather
  // than as a canvas that had not been stretched far enough.
  // #74: how big the drawing buffer has to be for the canvas to cover the screen.
  //
  // Three sources disagree on iOS, and which one is right depends on when you ask. `window.inner*`
  // excludes the safe areas under `viewport-fit=cover`, which is what caused this in the first place.
  // `clientWidth/Height` of a `position: fixed; inset: 0` element should include them -- but on a cold
  // standalone launch iOS has been seen to answer before the box is final, and a short answer there
  // is the bug: a band of flat page green at top and bottom with the HUD sitting on it.
  //
  // So take the LARGEST. The canvas is meant to cover the screen, so a source that comes back short
  // is the one that is wrong, and one that comes back long cannot exist -- nothing here reports more
  // than the screen. The one case that reports less on purpose is a pinch-zoom, where visualViewport
  // shrinks to the zoomed region; the max keeps the layout size, which is what should still be drawn.
  viewSize() {
    const c = this.canvas;
    const vv = window.visualViewport;
    return {
      w: Math.max(c.clientWidth || 0, vv ? vv.width : 0, window.innerWidth || 0, 1),
      h: Math.max(c.clientHeight || 0, vv ? vv.height : 0, window.innerHeight || 0, 1),
    };
  }

  // #193: the shadow map, set from `CFG.shadowMap`. Called before the first frame from the
  // constructor, and safe to call again -- the map itself is thrown away so three rebuilds it at the
  // new size, and every material is marked for recompile because `shadowMap.enabled` is a shader
  // define rather than a uniform. That recompile is exactly why the adaptive controller does not
  // touch this: it is the whole program cache, at the moment the device is already behind.
  applyShadowProfile(name) {
    const on = name !== 'off';
    const P = CFG.shadowMap[name] || CFG.shadowMap.full;
    const was = this.renderer.shadowMap.enabled;
    this.shadowProfile = name;
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // the only one r186 still implements
    const sh = this.sun.shadow;
    if (sh.map && (sh.mapSize.x !== P.size || was !== on)) {
      sh.map.dispose();
      sh.map = null;
    }
    sh.mapSize.set(P.size, P.size);
    sh.camera.left = -P.extent;
    sh.camera.right = P.extent;
    sh.camera.top = P.extent;
    sh.camera.bottom = -P.extent;
    sh.camera.updateProjectionMatrix();
    sh.bias = P.bias;
    sh.normalBias = P.normalBias;
    sh.radius = P.radius;
    // `sun.shadow.intensity` is deliberately NOT touched here. Rain owns it -- `this.dry.shadow` is
    // its dry-weather baseline and the storm scales it down from there -- and a profile that wrote
    // the baseline back would freeze the shadows dim if safe mode tripped mid-storm.
    if (this.world && this.world.setSoleShadows) this.world.setSoleShadows(!on);
    if (was !== on) {
      this.renderer.shadowMap.needsUpdate = true;
      this.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
  }

  setPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    let r = this.safe ? 1 : Math.min(dpr, this.mobile ? 1.5 : 2);
    const { w, h } = this.viewSize();
    const maxPixels = this.safe ? 1.6e6 : this.mobile ? 2.6e6 : 5e6;
    if (w * h * r * r > maxPixels) r = Math.max(1, Math.sqrt(maxPixels / (w * h)));
    // #168: a quality tier can ease this; never under 0.75, which is where text on pads goes soft
    if (this.quality && this.quality.dpr < 1) r = Math.max(0.75, r * this.quality.dpr);
    this.renderer.setPixelRatio(r);
  }

  // Ask again over the next second and a half, because iOS does not say when it has settled.
  settleSize() {
    for (const ms of [80, 250, 600, 1500]) setTimeout(() => this.resize(), ms);
  }

  resize() {
    const { w, h } = this.viewSize();
    this.setPixelRatio();
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize();   // #189: after setSize, because it reads the drawing buffer
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // portrait phones need a higher camera to see the same play area
    // #178: unless a view has pinned it. `resize` fires whenever the canvas settles -- which an
    // iframe does after it loads -- so a one-shot `camDist` written by `?view=map` was being
    // overwritten a frame later and the map view looked exactly like the game.
    this.camDist = this.camLock || (this.camera.aspect < 0.8 ? 23 : this.camera.aspect < 1.3 ? 19 : 16.5);
  }

  // #190: hand back the GPU side of a finished run.
  //
  // WHAT IT SKIPS IS THE WHOLE CARE OF IT. A geometry under the old root may be shared with
  // something that is staying -- the world, the lights' helpers, a cached mesh -- so the keep-set is
  // built by walking the scene AFTER the root has been removed from it. Whatever is left in the
  // scene is by definition not this run's to free.
  //
  // Disposing a geometry that turns out to be shared with something OUTSIDE the scene (a rig's GLB
  // template, held in rig.js's cache) is not fatal and that is deliberate: `dispose()` frees the GPU
  // buffers and leaves the JS object intact, so the next use re-uploads it. The cost of being wrong
  // here is one upload on the next run, which that run is paying for a whole village anyway. The
  // cost of being timid is the count climbing for ever, which is what it was doing.
  //
  // MATERIALS AND TEXTURES ARE NOT SWEPT. `mat()` hands the same material to everyone who asks for a
  // colour and `bake()` puts half the world on three singletons, so a sweep here would dispose the
  // program every remaining object is drawn with and recompile the scene. The per-run ones are freed
  // by name, above -- the pads, the banner, the trade mat -- which is why those three lines exist.
  disposeRun(root) {
    const keep = new Set();
    const keepBones = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) keep.add(o.geometry.uuid);
      if (o.isSkinnedMesh && o.skeleton) keepBones.add(o.skeleton.uuid);
    });
    let freed = 0;
    root.traverse((o) => {
      // THE BONE TEXTURE, which is the one nothing in this file made and nothing was freeing. Three
      // builds a DataTexture of the bone matrices per SKELETON, lazily, the first time a skinned mesh
      // is drawn (`Skeleton.computeBoneTexture`) -- and `cloneSkeleton` gives every rig its own. So
      // each character on the field held an 8x8 float texture that the renderer knew about and this
      // game did not, and dropping the root freed the mesh and left the texture uploaded for ever.
      // Named by catching every texture at construction and reading the stack: it was 0.8 a restart
      // on the instanced path and 3.5 in safe mode, where the crowd is off and every character is a
      // real SkinnedMesh. `Skeleton.dispose()` frees it and nulls it; a skeleton that is somehow used
      // again simply recomputes one.
      if (o.isSkinnedMesh && o.skeleton && !keepBones.has(o.skeleton.uuid)) {
        keepBones.add(o.skeleton.uuid);
        if (o.skeleton.boneTexture) { o.skeleton.dispose(); freed++; }
      }
      if (!o.geometry || keep.has(o.geometry.uuid)) return;
      keep.add(o.geometry.uuid);   // a geometry shared by two objects under root is one dispose
      o.geometry.dispose();
      freed++;
    });
    return freed;
  }

  // #200: which feet the grass is told about. Four slots, and the choice of which four is the only
  // decision here -- the shader cost is the same whether they are useful or not.
  //
  // The King always takes the first, because he is the one the player is watching and the grass
  // window is centred on him anyway (#191). Wren takes the second when she is out, because she is
  // always beside him and always looked at. The last two go to whoever else is NEAREST HIM rather
  // than nearest the camera: a raider closing on the King is the thing in frame, and at the distance
  // the rest of the field sits at, a parted clump is a pixel.
  //
  // Written into the existing vectors rather than replacing them, because the shader holds these
  // objects. Unused slots are parked far away instead of counted -- see the note in models.js on why
  // the loop has no count.
  updateGrassFeet() {
    const f = this.world && this.world.feet && this.world.feet.value;
    if (!f) return;
    const k = this.king.mesh.position;
    f[0].set(k.x, 0, k.z);
    let n = 1;
    if (n < f.length && this.queen && !this.queen.captive && !this.queen.inKeep) {
      const q = this.queen.mesh.position;
      f[n++].set(q.x, 0, q.z);
    }
    // One pass for the nearest, rather than sorting every character on the field every frame.
    let bestA = null, bestB = null, dA = Infinity, dB = Infinity;
    for (const list of [this.units, this.enemies]) {
      for (const u of list) {
        if (u === this.king || !u.mesh) continue;
        const p = u.mesh.position;
        const d = (p.x - k.x) * (p.x - k.x) + (p.z - k.z) * (p.z - k.z);
        if (d > 400) continue;                      // 20 units out: nothing the eye can see part
        if (d < dA) { dB = dA; bestB = bestA; dA = d; bestA = p; }
        else if (d < dB) { dB = d; bestB = p; }
      }
    }
    for (const p of [bestA, bestB]) {
      if (n >= f.length) break;
      if (p) f[n++].set(p.x, 0, p.z);
    }
    for (; n < f.length; n++) f[n].set(9999, 0, 9999);
  }

  // ---------- lifecycle ----------
  reset() {
    this.camLock = this.camLock || 0;   // #178: a `?view=` camera survives a restart and a resize
    // #190: and everything else the run owned, which until now was only the three things below.
    // Measured with the renderer ON -- which is the whole point, because #167's soak ran with it
    // stubbed out and `renderer.info.memory` counts what has been UPLOADED, so nothing rendering
    // reads as nothing leaking. A restart cost 23 geometries and half a texture, for ever.
    if (this.root) {
      this.scene.remove(this.root);
      this.disposeRun(this.root);
    }
    // Dropping the old root unparents everything but frees nothing: the pads standing on the field
    // still hold a canvas texture each, and a player who restarts five times would be carrying five
    // runs' worth of them. Hand back what this run allocated before the next one starts.
    if (this.pads) for (const pad of this.pads) this.disposePad(pad);
    // #57: and a banner still standing when a run restarts. Dropping the root unparents it but frees
    // nothing, and it is a baked geometry and a material like everything else here.
    if (this.banner) this.clearBanner();
    if (this.tradeMat) {
      this.tradeMat.geometry.dispose();
      if (this.tradeMat.material.map) this.tradeMat.material.map.dispose();
      this.tradeMat.material.dispose();
    }
    clearHealthBars();
    // The crowd's proxies go with the old root. They are still parented to it, so the renderer cannot
    // tell they are gone by itself and has to be told.
    clearCrowd();
    if (this.coinField) this.coinField.clear();
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.units = [];
    this.enemies = [];
    this.arrows = [];
    // #164: the pool outlives a run on purpose. Nothing in it is attached to the old root, and a
    // second run that starts with a warm pool is the whole point of having one.
    this.arrowPool = this.arrowPool || [];
    this.coins = [];
    this.flyCoins = [];
    this.pads = [];
    this.turrets = [];
    this.popups = [];
    this.dying = [];
    this.popping = [];
    this.spawnQueue = [];
    this.walls = [];
    this.towers = {};
    this.structures = []; // standing buildings, so they can be rebuilt in a new material (#3)
    // #43: where the player actually put each building, by pad id, when it was not the suggested
    // spot. Read by `rebuildVillage` on a restore, which would otherwise replay every structural pad
    // onto the coordinates in config and undo the whole feature.
    this.placedAt = {};
    // #137: through `cancelPlacing`, not by nulling the field. A restart during an edit would otherwise
    // leave the ghost and the grid in the scene and `body.placing` on, so the new run would start
    // faded out with the joystick suspended and nothing on screen to explain it.
    this.cancelPlacing();
    this.placing = null;  // { def, mesh, ok, at, moving? } while one is being put down
    this.placeGrid = null;
    this.movable = null;  // #43: the building he is standing beside, if it can be picked up
    this.dynamicPads = [];
    this.built = {};
    this.buyCount = {};
    this.tier = 0;
    this.wallLevel = 0;
    this.baseLevel = 0; // Keep level: 0 until the Keep is built, then 1..CFG.base.maxLevel
    // #154: the highest Keep level Wren still owes an entry for, and whether one landed this night.
    // `diaryDue` is not the same as `baseLevel`: a level raised while she is captive is owed until
    // she is back, which is the whole of "she cannot write while they have her".
    this.diaryDue = 0;
    this.diaryNew = 0;
    this.diaryOpen = false;
    this.castOpen = false;   // #159
    this.creditsOpen = false;   // #175
    this.releasesOpen = false;   // #206
    this.feedDef = null;
    this.mounted = false;
    this.res = { wood: 0, stone: 0, straw: 0, iron: 0, diamond: 0 };
    this.soldToday = {};   // #236: per material, what the trade post has bought since dawn
    this.flyRes = [];
    this.score = 0;
    this.bestScore = readNumber('crownrush-best-score', 0);
    this.mineTimer = 0;
    this.nodes = [];
    this.ruins = [];        // #152: heaps where the opening's buildings stood, until they fade
    this.gleaner = null;    // #169: made the first frame the Keep stands
    this.villagers = [];    // #48: one gatherer per villager home, working on their own
    this.stable = null;     // #82: { x, z, mesh, yard, gate } once the Stable stands
    this.horses = [];       // #117: the yard's horses, and any out on the field or trotting home
    this.horseLevel = 0;    // #82: "Train the Horse" buys, like archerPower
    this.tradePost = null;  // the bank, once its pad is paid for
    this.tradePos = null;   // and where you stand to sell at it: its own mat, not a constant
    this.tradeMat = null;
    this.piles = [];        // what has been mined and is lying on the ground waiting to be carried
    this.pileFlies = [];    // chunks in the air between the rock and the heap
    this.chips = [];
    this.fx = [];
    this.alarmT = 0;
    this.raidWarning = 0;
    this.rescueSpotted = false;
    this.finaleOpen = false;
    this.recaptures = 0;
    this.hornT = 0; // cooldown remaining
    // #57: the rally banner. `banner` is { x, z, until, mesh } while one stands, null otherwise; the
    // mesh itself was disposed at the top of this function, before the old root was dropped.
    this.banner = null;
    this.bannerT = 0;
    this.rallyUntil = 0;
    this.alertT = 0;
    this.queenHop = 0;
    this.heartTimer = 0;
    this._pen = new V3(CFG.opening.picket[0], 0, CFG.opening.picket[1]);
    this._penDir = new V3();
    this.lastAlarm = -99;
    this.lastCry = -99;         // #104: when Wren last said anything out loud
    this.swing = 0;
    this.activePad = null;
    this.nodeRing = null;
    this.minimapTimer = 0;
    this.fogTimer = 0;
    this.lastFogPos = new V3(999, 0, 999);
    this.damageMul = 1;
    // #220: `startBuilt` is an array, so a shallow spread would share ONE list across every run in
    // the session and the second run would open with the first run's head starts still in it.
    this.mods = { ...MODS, startBuilt: [] };
    // #56: and then whatever previous runs have earned, through the same door an in-run upgrade uses.
    // Read fresh every reset rather than cached, so a run that ends and unlocks something hands the
    // next one the benefit without a reload.
    this.legacy = readLegacy();
    this.applyLegacy();
    this.taken = {};
    this.seen = {};   // #235: every card this run has shown, so the deck rotates
    this.offerQueue = 0;
    this.offerLevels = [];      // #99: which level each waiting offer belongs to
    this.offerLevel = 0;
    this.offer = null;
    this.offerPaused = false;
    this.gain = null;           // #132: the capability notice a purchase put up, until it closes
    this.settingsOpen = false;
    this.settingsPaused = false;
    this.coinsCarried = 0; // the starting coins lie on the ground (#20): picking them up is the first thing you do
    this.coinsEarned = 0;
    this.kills = 0;        // #172: raiders defeated this run, for the ending's stat box
    this.archerPower = 0;
    this.rankSeen = {};
    this.typeSeen = {};
    this.coinCombo = 0;
    this.comboTimer = 0;
    this.wave = 0;
    this.raidPeak = 0;  // the most HP tonight's raid has held, for the raid meter
    this.waveTimer = 0; // seconds until nightfall, recomputed from the cycle each frame
    this.duskWarned = false;
    this.rainTold = false;  // #81: whether this run has had its one line about what rain is for
    this.dawnHeld = 0;      // #73: seconds the sun has been held at the horizon this night
    this.dawnHolding = false;
    this.spendTimer = 0;
    this.indicatorTimer = 0;
    this.time = 0;
    this.over = false;
    this.won = false;
    this.paused = false;
    this.shake = 0;

    // king (on foot until he earns a horse) and the Queen he must protect
    this.king = this.spawnUnit('king', 0, 2);
    this.keep = null;
    // #152: she starts BESIDE him, free, in the daylight. The run used to open with her already
    // gone and a toast explaining it -- arriving in the middle of somebody else's emergency. Now the
    // player has her for a minute before anyone takes her, which is the only way the loss lands.
    this.queen = this.spawnUnit('queen', 1.6, 3.4);
    this.queen.inKeep = false;
    this.queen.captive = false;
    // #83: how much of her the raiders have. Hers alone -- nothing else in the game is taken this
    // way -- so it lives here rather than on every unit spawnUnit makes.
    this.queen.seize = 0;
    this.queen.held = false;
    // #234: how much of her power is charged, 0 to 1. Beside `seize` because they are the two halves
    // of the same bet -- one fills by being near raiders and the other by being reached by them.
    this.queen.charge = 0;
    this.queen.charging = false;
    // #152: the opening clock. `openT` counts the calm out; `snatched` is what the rest of the game
    // reads to know the premise has happened -- the day does not start until it has.
    this.openT = 0;
    this.snatched = false;
    this.openWarned = false;
    this.openingDone = false;
    // #232: WHICH PHASE THE RUN IS IN, as a thing with a name.
    //
    // `queen.captive` was standing in for this at two dozen sites, and most of them were not asking
    // about Wren at all -- they were asking whether the run proper had started. The cost was
    // flexibility: every change to the opening had to be routed through the King's wife, because the
    // state machine had no word for "the prologue is over".
    //
    // READING THE SITES RATHER THAN SWEEPING THEM turned up a three-way split, not the two-way one
    // the ticket expected, and the third kind is why `captive` survives:
    //
    //   the PHASE        -- pads, the diary, the King's verbs, the alarm's call. These asked
    //                       `captive` and meant `inPrologue()`. Converted.
    //   HELD HOSTAGE     -- the day clock, the rain, the waves, the thieves. These stop while
    //                       raiders have her AT ANY POINT IN THE RUN, not only in the prologue: #12
    //                       says "the raids ARE the enemy coming for her", so a recapture on night
    //                       12 stands the clock still too. A phase flag would have broken that
    //                       silently, which is the expensive kind of wrong.
    //   HER OWN STATE    -- the indicator arrow, the grass she parts, `updateQueen`, the save gate.
    //                       These always meant her and still do.
    //
    // So `phase` is not a rename of `captive`. It is the name the third of those never had.
    this.phase = 'prologue';
    // #224: which collecting party is on the road, and how long the road has been empty. A run that
    // goes the way the story expects never touches either -- they matter only when the player wins a
    // fight he was not meant to be able to win.
    this.openWave = 0;
    this.openRetryT = 0;
    this.campsTaught = false;   // #218: the one-time explanation, per run
    this.wrenOutOnce = false;   // #234: her one line, per run
    const hc = TIERS[0].bounds;
    this.homeSide = this.world.riverInfo((hc.x0 + hc.x1) / 2, (hc.z0 + hc.z1) / 2).side;

    // resource nodes: hidden until the Keep can actually use the material they hold
    for (const def of NODES) {
      const mesh = this.makeNodeMesh(def.type);
      mesh.position.set(def.pos[0], 0, def.pos[1]);
      const from = CFG.base.materialAt[def.type] || 0;
      const open = this.baseLevel >= from;
      if (def.type !== 'straw' && open) this.root.add(mesh);
      // #81: `living` is asked once here rather than by type in updateMining, which walks every node
      // every frame. It is what the rain waters: the trees and the wheat, never the rock.
      this.nodes.push({ type: def.type, mesh, stock: def.stock, max: def.stock, regrow: 0, from, open, living: CFG.rain.feeds.includes(def.type), pos: new V3(def.pos[0], 0, def.pos[1]) });
    }
    // world roads/bridges/chimneys are scene-level: reset them
    if (this.world.clearSmokers) this.world.clearSmokers();
    if (this.world.clearRain) this.world.clearRain();
    if (this.world.clearPaths) this.world.clearPaths();   // #180
    for (const r of this.world.roads) {
      r.revealed = false;
      r.progress = 0;
      for (const m of r.meshes) {
        m.visible = false;
        m.geometry.setDrawRange(0, 0);
      }
    }
    for (const b of this.world.bridges) this.scene.remove(b.mesh);
    this.world.bridges.length = 0;
    for (const sm of this.world.smokers || []) for (const p of sm.puffs) p.mesh.visible = false;
    if (this.world.smokers) this.world.smokers.length = 0;
    // #103: built at the reach, which is what it draws. updateKing rebuilds it if an upgrade moves it.
    this.ring = makeRing(CFG.king.pickupRadius);
    this.ring.visible = this.ringOn;          // #216: the setting survives a restart, so apply it here too
    this.ringRadius = CFG.king.pickupRadius;
    this.root.add(this.ring);

    // coin stack carried above the king
    this.stack = [];
    this.stackMesh = makeCoinStack(70);
    this.root.add(this.stackMesh.outer, this.stackMesh.inner);
    for (let i = 0; i < 70; i++) this.stack.push({ position: new V3(0, 2.4 + i * 0.11, 0) });

    // #212: the raiders' torches, one instanced mesh for all of them. Built here with the rest of the
    // run's persistent meshes, and re-placed every frame by `updateTorches` from whoever carries one.
    this.torches = makeTorchField(CFG.torches.capacity);
    this.root.add(this.torches);

    this.nodeRing = makeRing(3.2);
    this.nodeRing.visible = false;
    this.root.add(this.nodeRing);
    // #221: the same ring for a cache, kept separate so a King standing between a seam and a hole
    // does not have one ring flickering between the two
    this.digRing = makeRing(1);
    this.digRing.visible = false;
    this.root.add(this.digRing);
    // #19: the raider camp the raids come from. Its garrison sleeps until the King comes close.
    {
      const F = CFG.finale;
      const camp = makeCamp(F.radius);
      camp.position.set(F.pos[0], 0, F.pos[1]);
      this.root.add(camp);
      const top = this.topRank();
      for (let i = 0; i < F.garrison; i++) {
        const a = (i / F.garrison) * Math.PI * 2;
        const e = this.spawnEnemy(i % 3 === 0 ? 'brute' : 'knight', F.pos[0] + Math.cos(a) * F.radius * 0.75, F.pos[1] + Math.sin(a) * F.radius * 0.75, top);
        e.camp = true;
        e.mesh.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      }
      const chief = this.spawnEnemy('boss', F.pos[0], F.pos[1] - 3.2, CFG.ranks.length - 1);
      chief.camp = true;
      chief.chief = true;
      chief.maxHp = chief.hp = chief.maxHp * F.chiefHp;
      chief.mesh.scale.setScalar(chief.scale * 1.1);
      chief.bar.scale.multiplyScalar(1 / 1.1);
      chief.lastCall = -99;
    }
    // #218: and the small camps the nightly raid comes from. Positions are the MAP's (`world.camps`,
    // seeded with everything else in #219); what happens to them is the RUN's, which is why the
    // state lives here and is rebuilt on every reset. Same split as the resource nodes: where a seam
    // is belongs to the map, how much is left in it belongs to the run.
    this.camps = (this.world.camps || []).map((c, i) => ({
      id: c.id, x: c.x, z: c.z, index: i, cleared: false, clearedOn: -99, mesh: null,
    }));
    for (const c of this.camps) this.standCamp(c, true);
    // #221: the caches. Hidden until the fog comes off them -- `found` is the run's, like everything
    // else about a map feature that the run changes.
    this.caches = (this.world.caches || []).map((c) => {
      const mesh = makeCache();
      mesh.position.set(c.x, 0, c.z);
      mesh.visible = false;
      this.root.add(mesh);
      return { id: c.id, x: c.x, z: c.z, mesh, found: false, dug: false, dig: 0 };
    });
    this.relicsFound = {};
    this.relics = [];
    this.resetFog();
    // #20: the starting purse is scattered along the road west, the way the pink arrow points, so the
    // first three seconds teach the pickup rule and the stack builds because of what you did.
    const purse = this.startCoins();
    for (let i = 0; i < purse; i++) {
      const t = i / Math.max(1, purse - 1);
      tmp.set(-5 - t * 12 + rand(-1.2, 1.2), 0.6, 2 + t * 4 + rand(-1.6, 1.6));
      this.dropCoin(tmp);
    }
    this.refreshPads();
    this.hud.showNextWave(false);
    this.hud.hidePadTip();
    this.hud.clearFlights();     // #88: nothing from the last run still in the air
    this.hud.set(this.coinsCarried, 1, 0, null, `0/${CFG.finale.level}`, this.res, 0, this.loadCap());
    this.hud.setRaid(0, 0, this.wave, false);
    this.hud.setHearts(1);
    this.hud.setCoinTier(this.coinTier());
    this.hud.setStall(false);    // #119: night 0 at Keep 0 -- a new run is never behind itself
    this.hud.setIndicators([]);
  }

  // A blank canvas with a working HUD is the hardest kind of bug to report, so the game checks its
  // own output. A page cannot see what the compositor finally puts on screen, but it can see the
  // three failures it would be: a lost context, a drawing buffer with no size, and a frame that
  // submits no draw calls at all. Any of those drops the game to safe mode, and if that changes
  // nothing it says what the graphics stack is doing instead of leaving a blank screen.
  watchRender() {
    clearTimeout(this.renderWatch);
    const broken = () => {
      const c = this.canvas;
      return this.contextLost || !c.width || !c.height || this.renderer.info.render.calls === 0;
    };
    this.renderWatch = setTimeout(() => {
      // a backgrounded tab stops painting too, and that is not a fault
      if (!this.running || document.hidden || !broken()) return;
      if (!this.safe) {
        this.safe = true;
        // #193: through the profile rather than the flag on the renderer, so the discs go back to
        // carrying the shadow alone and `?perf=1` does not go on naming a map that is not there. This
        // is the one place the recompile is worth paying for: the alternative is a blank screen.
        this.applyShadowProfile('off');
        this.setPixelRatio();
        this.resize();
        this.hud.toast('Graphics trouble: switching to safe mode.', 3000);
        this.watchRender();
        return;
      }
      if (window.__showError) window.__showError(this.glReport());
    }, 2500);
  }

  // How much of the crowd is on the instanced path, for ?perf=1.
  crowdStats() {
    return crowdStats();
  }

  // #166: everything that comes and goes, and everything that should not. The frame-cost numbers
  // (`renderer.info.render`) are a snapshot of this frame's work and cannot show a leak; these are
  // the arrays that fill and drain, the GPU objects that are uploaded and (should be) disposed, the
  // for-ever caches, and the heap -- Chrome only, which is the phone this is played on. A count that
  // only ever climbs across a run is the leak, named.
  perfSample() {
    const m = performance.memory;
    const im = this.renderer.info.memory;
    const c = cacheSizes();
    return {
      t: Math.round(this.time), night: this.wave,
      heap: m ? Math.round(m.usedJSHeapSize / 104857.6) / 10 : null,
      arrows: this.arrows.length, pool: this.arrowPool.length, coins: this.coins.length, flyCoins: this.flyCoins.length,
      popups: this.popups.length, pileFlies: this.pileFlies.length, chips: this.chips.length, fx: this.fx.length,
      dying: this.dying.length, popping: this.popping.length, queue: this.spawnQueue.length,
      enemies: this.enemies.length, units: this.units.length, villagers: this.villagers.length, piles: this.piles.length,
      geometries: im.geometries, textures: im.textures, programs: this.renderer.info.programs.length,
      materials: c.materials, tags: c.tags, popupMats: c.popups,
    };
  }

  // What the graphics stack actually is, in one line, for a screenshot from a device I cannot hold.
  glReport() {
    const r = this.renderer;
    const c = this.canvas;
    let vendor = 'unknown';
    try {
      const gl = r.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) vendor = `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}`;
      return `The world is not drawing. ${vendor}; buffer ${c.width}x${c.height} @${r.getPixelRatio().toFixed(2)}; css ${c.clientWidth}x${c.clientHeight}; dpr ${window.devicePixelRatio}; `
        + `context ${gl.isContextLost() ? 'LOST' : 'ok'}; gl error ${gl.getError()}; frames ${this.frames || 0}; safe ${this.safe}`;
    } catch (e) {
      return `The world is not drawing, and the graphics context could not be read: ${e && e.message}`;
    }
  }

  // ---------- #58: how long this run is ----------
  //
  // A length is two numbers and a label (CFG.lengths). Everything reads them through the three
  // methods below rather than through CFG directly, so exactly one place knows what "this run is
  // short" means and nothing else has to remember to ask.

  lengthDef() {
    return CFG.lengths[this.runLength] || CFG.lengths.long;
  }

  // The night the march on the camp opens by the clock alone, whatever the Keep is doing.
  finaleNight() {
    return this.lengthDef().nights;
  }

  // This run's nights against a long run's. Every number in CFG spelled in NIGHTS was pinned against
  // thirty of them, so a short run divides by this or the raid falls behind its own clock: the floor
  // under the raid's difficulty and the brute/elite fallbacks are all "by night N of thirty", and at
  // fifteen nights none of the three would ever fire. See `raidLevel` in game-enemies.js.
  nightScale() {
    return this.lengthDef().nights / CFG.lengths.long.nights;
  }

  // The night the RAID is fought at, which on a short run runs ahead of the night on the calendar:
  // night 8 of fifteen is fought as night 16 of thirty.
  //
  // Every ramp in `startWave` is keyed to the night number -- how many knights, when brutes and
  // elites start, how many bosses, the growth in health and damage -- and every one of them was
  // pinned against thirty nights. Read on the calendar, a short run would END on what a long run
  // calls night 15: half the raid, against an army the compressed Keep costs let the player build in
  // FULL. The last night has to be the last night at either length, so the raid is fought on the long
  // run's clock while `wave` stays the player's -- it is what the HUD counts, what the toasts say and
  // what the scoreboard stores.
  //
  // Rounded, so the ramps keep getting whole nights. At the two lengths that ship it is exact
  // (fifteen halves thirty); a length that did not divide cleanly would land on the nearer night
  // rather than three-fifths of one.
  raidNight() {
    return Math.round(this.wave / this.nightScale());
  }

  // ---------- #56: what previous runs have earned ----------
  //
  // One place, and it is the only gameplay code the meta-progression touches -- everything else goes
  // on reading `mods` exactly as it did. `unlocked` is what the title screen lists; `applyLegacy` is
  // what a run actually starts with.

  unlocked() {
    return CFG.legacy.filter((u) => this.legacy >= u.at);
  }

  // #232: THE ONE PLACE THE RUN PROPER BEGINS.
  //
  // Three things reach this: the rescue that ends the opening, a restored save, and #233's escort
  // flag. Before this they all set `snatched` and `openingDone` by hand -- the restore path did it
  // in `applyRun` with a paragraph explaining why -- and a second hand-derivation is how two of
  // them drift apart. One method, called from all three.
  //
  // IT DOES NOT GO BACK. A recapture mid-run stands the clock still (see `phase` in reset) but it is
  // not a return to the prologue: the pads stay bought, the diary stays open and the King keeps his
  // verbs. "The prologue happened" is a fact about the run, not about where Wren is standing.
  beginRun() {
    this.phase = 'run';
    this.snatched = true;
    this.openingDone = true;
  }

  inPrologue() {
    return this.phase === 'prologue';
  }

  // #220: the three the player is taking into this run -- whatever they chose, filtered by what they
  // have actually earned.
  //
  // FILTERED EVERY TIME rather than validated on write, because the stored list outlives the table:
  // an unlock renamed or retired between builds leaves an id in somebody's localStorage that means
  // nothing, and a run that threw on it would be a run that will not start. An unknown id is simply
  // not in `CFG.legacy`, so it drops out here and the player is three-minus-one rather than stuck.
  picks() {
    const want = readPicks();
    return CFG.legacy.filter((u) => want.includes(u.id) && this.legacy >= u.at).slice(0, CFG.legacyPicks);
  }

  // The next one to come, or null once they are all in hand.
  nextUnlock() {
    return CFG.legacy.find((u) => this.legacy < u.at) || null;
  }

  has(id) {
    const u = CFG.legacy.find((x) => x.id === id);
    return !!u && this.legacy >= u.at;
  }

  // #220: still the only gameplay code the meta-progression touches, and now a loop. Every unlock
  // carries its own `apply` (config.js) and every one of them writes to `mods`, which is the door
  // `upgrades.js` already uses -- so the twenty-fourth unlock costs the same as the fourth did.
  //
  // The head starts that need a FIELD -- a mounted King, archers to recruit, a Trade Post to stand
  // up -- set a flag here and are read in `start()`, because this runs from `reset()` before any of
  // it exists. Same split `purse` and `stables` always had; there are just more of them.
  applyLegacy() {
    for (const u of this.picks()) u.apply(this);
  }

  // #220: the half of a head start that needs a field to put it on.
  //
  // `applyLegacy` runs from `reset()`, before there is a King to mount, an army to join or a plot to
  // build on -- so the unlocks that hand the player a THING set a flag there and are cashed here,
  // after `standOpeningVillage`. The split is #56's and has not changed; there are just more of them
  // than `purse` and `stables` now.
  //
  // AFTER the opening village on purpose: `standOpeningVillage` replays the morning's buildings from
  // `CFG.opening`, and a Trade Post stood up before it would be a second Trade Post once it ran.
  applyHeadStarts() {
    for (const id of this.mods.startBuilt) {
      const def = PADS.find((p) => p.id === id);
      // Already standing because the opening morning includes it -- fine, and not worth a word to
      // the player. The unlock is "begin with it built"; the opening already having built it is the
      // same promise kept by somebody else.
      if (!def || this.built[id]) continue;
      this.built[id] = true;
      if (def.structure && def.buildAt) this.buildStructure(def);
      if (def.wall) this.buildWall(def.wall.tier, def.wall.side);
    }
    for (let i = 0; i < this.mods.startArchers; i++) {
      const a = (i / Math.max(1, this.mods.startArchers)) * Math.PI * 2;
      this.spawnUnit('archer', Math.cos(a) * 3.4, Math.sin(a) * 3.4 + 4, false);
    }
    // #218: a camp already broken. The nearest one, because "a standard taken" is a thing that
    // happened before the run rather than a die roll inside it -- and the nearest camp is the one
    // the player would most plausibly have reached.
    if (this.mods.startCampsBroken && this.camps && this.camps.length) {
      const near = [...this.camps].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      for (const c of near.slice(0, this.mods.startCampsBroken)) {
        c.cleared = true;
        c.clearedOn = 0;
        if (c.mesh) c.mesh.visible = false;
        for (const e of this.enemies.filter((x) => x.campId === c.id)) this.removeEnemy(e);
      }
    }
    if (this.mods.kingHp && this.king) {
      this.king.maxHp += this.mods.kingHp;
      this.king.hp = this.king.maxHp;
    }
    this.refreshPads();
  }

  // #56: what to say at the end of a run. `gained` is this run's contribution, `next` what is coming
  // and how far off, `just` anything this run actually bought. Everything the two ending screens and
  // the title screen need, worked out in one place.
  legacyProgress() {
    const next = this.nextUnlock();
    return {
      total: this.legacy,
      gained: this.score,
      just: this.justUnlocked || [],
      next,
      toGo: next ? Math.max(0, next.at - this.legacy) : 0,
      unlocked: this.unlocked(),
      picked: this.picks(),   // #220: the three being carried, not everything owned
      of: CFG.legacy.length,
    };
  }

  // How many coins lie on the road at the start. #220: read off `mods` like everything else now,
  // rather than asking `has('purse')` -- an unlock that is owned but not CHOSEN must not pay out.
  startCoins() {
    return CFG.coins.start + this.mods.startCoins;
  }

  start() {
    this.runLength = readLength();   // #58: whatever the title screen is showing, at the moment Play is pressed
    this.clearRun();
    this.reset();
    this.running = true;
    this.watchRender();
    this.hud.hideStart();
    this.hud.hideGameOver();
    this.hud.hideVictory();
    this.hud.hidePause();
    // #25: Restart is reachable from the pause screen, and the pause screen sits on top of both of
    // these (a tab switch pauses whatever is open). `reset` clears the state behind them, so without
    // this the new run starts underneath a panel whose buttons now refer to nothing.
    this.hud.hideOffer();
    this.hud.hideGain();
    // #56: the last unlock is a horse in the stable before the run begins. After `reset()`, because
    // `mountKing` swaps a mesh that has to exist first.
    if (this.mods.startMounted) this.mountKing();   // #220: chosen, not merely owned
    // #152: the kingdom he has this morning. In `start` and not in `reset`, because `resumeRun` calls
    // `reset` too and a restored run is a village that already exists -- standing this one up under it
    // would put a second Keep on the field.
    this.standOpeningVillage();
    this.applyHeadStarts();
    // #233: the escort, parked. She is home, the prologue never runs, and `beginRun` is the same
    // call the rescue and a restore make -- which is the whole reason this is five lines and not a
    // second path through `updateQueen`. The ticket's own stopping rule: if turning it off needed a
    // fork, it had grown into a rewrite and should stop.
    if (!this.escort) {
      this.beginRun();
      this.queenEnterKeep();
      this.hud.toast('*Wren is home.* The escort is off for this run.', 3200, 'Wren');
    }
    this.hud.toast('A quiet morning. *Wren walks with you.*', 3600, 'Wren');
    audio.init();
    audio.setActive(true);
  }

  resume() {
    this.hud.hideVictory();
    this.running = true;
  }

  // #50: pick up a stored run. Falls back to a fresh one if the save cannot be applied, so the
  // button always leads somewhere playable.
  resumeRun(saved) {
    const ok = this.restoreRun(saved);
    if (!ok) return this.start();
    this.running = true;
    this.watchRender();
    this.hud.hideGameOver();
    this.hud.hideVictory();
    this.hud.hidePause();
    // #150: two homecomings now, because there are two things a restore can be. A save used to be
    // taken only with the field empty, so "your kingdom stands" was the only one there was -- now the
    // ordinary case is walking back into a fight that never stopped, and being told the kingdom
    // stands while four of them are on the wall reads as the game not having noticed.
    this.hud.toast(this.anyActiveEnemy()
      ? `Night ${this.wave}, where you left it. *They are still on the field.*`
      : `Night ${this.wave} again. Your kingdom stands.`, 3000, 'Raid');
    audio.init();
    audio.setActive(true);
  }

  // Stopping the world and putting the pause screen up are two different things, and conflating them
  // is what broke Pause in the settings sheet: the sheet already pauses silently while it is open, so
  // by the time the Pause row ran this the world was stopped, `!this.running` sent it straight back,
  // and the screen never appeared. The player got a game frozen with nothing to press — until
  // watchStuck noticed a second and a half later and handed the pause back, which read as Pause doing
  // nothing at all.
  pause(silent = false) {
    if (this.over || this.won) return;
    // Nothing to pause before the first Play: `reset` leaves both of these false, so this is what
    // keeps a backgrounded title screen from coming back with a pause panel over it. Once a run is
    // under way one of the two is always true, including while a sheet holds a silent pause.
    if (!this.running && !this.paused) return;
    // #114: the world is already stopped and somebody else is holding it. Backgrounding the page calls
    // this without `silent` (main.js), so leaving the level-up panel open and coming back put a pause
    // screen over the choice the player was reading -- a second pause that says nothing, hiding the
    // first one that said something. A silent pause may still be escalated into a visible one; what
    // may not happen is a visible pause landing on a stop that already has a screen of its own.
    //
    // Safe because nothing else asks for a visible pause while paused: `togglePause` routes an
    // already-paused game to `unpause` before it gets here, and every sheet pauses with `silent`.
    if (this.paused && !silent) return;
    this.running = false;
    this.paused = true;
    if (!silent) this.hud.showPause();
  }

  unpause() {
    if (!this.paused) return;
    // #25: an upgrade choice is still owed. Resuming without it would skip the reward, so put the
    // panel back instead. Before this, the pause and info screens could hide a pending offer and
    // nothing could resume the game again: the King stopped dead while the buttons still answered.
    if (this.offer) {
      this.hud.hidePause();
      this.hud.hideInfo();
      this.infoOpen = false;
      // #99: the level this offer was opened for. `baseLevel` would be right only until a second
      // level lands while the first offer is still on screen.
      const lv = this.offerLevel || this.baseLevel;
      this.hud.showOffer(this.offerForHud(this.offer), lv, this.offerQueue, this.levelGains(lv));
      return;
    }
    this.paused = false;
    this.running = true;
    audio.setActive(true);
    this.hud.hidePause();
    this.hud.hideInfo();
    this.infoOpen = false;
  }

  // #174: the settings sheet's three preferences, written down beside the sound setting
  setQualityChoice(choice) {
    try { localStorage.setItem('crownrush-quality', String(choice)); } catch (e) { /* private mode */ }
    if (choice === 'auto') {
      this.quality.forced = null;
      this.applyQuality(0);
    } else {
      this.quality.forced = +choice;
      this.applyQuality(+choice);
    }
  }
  setShake(on) {
    this.shakeOn = !!on;
    if (!on) this.shake = 0;
    try { localStorage.setItem('crownrush-shake', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  setNumbers(on) {
    this.numbersOn = !!on;
    try { localStorage.setItem('crownrush-numbers', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  // #216: OFF MEANS INVISIBLE, NOT SMALLER. #103's whole point was that the drawn circle and the
  // collection reach became ONE number -- `ringRadius` is what a coin is tested against in
  // `game-view.js` as well as what the ring is drawn at -- so a setting that touched the radius
  // would quietly change how far the King picks up from, which is a balance change wearing a
  // display setting's clothes. This sets `visible` and nothing else, and `updateKing` still moves
  // and rebuilds the ring while it is hidden so turning it back on needs no catch-up.
  //
  // Worth knowing while playing with it off: the ring grows with the Lodestone upgrades and is the
  // only thing on screen that shows that happening, so a reach upgrade arrives silently.
  setRing(on) {
    this.ringOn = !!on;
    if (this.ring) this.ring.visible = this.ringOn;
    try { localStorage.setItem('crownrush-ring', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  // #216 part 2: THE STACK IS LOAD-BEARING, so this turns it off in one place rather than three.
  // `stackCount()` returns 0 while it is off, and the three things that read it all do the right
  // thing for free: `updateStack` draws nothing, and the coin a mat is paid with launches from
  // `stackBase()` -- just clear of his crown -- instead of from the top of a stack that is not
  // there. That was the part the ticket expected to need a second animation designed for it, and it
  // does not: the coins still pour into the mat, they just leave from his head rather than from a
  // tower above it. Standing on a mat watching them go is one of the better moments in the game and
  // it survives intact.
  //
  // What IS lost is `COIN_TIER_COLORS`: the stack is the only place the coin tier is drawn as
  // colour. That costs nothing today because `coinTier()` returns 'gold' and only 'gold', but it is
  // the thing to remember if tiers ever become real.
  // #222: the camera's own angle, as a switch. The ticket's own test is "playing it for ten
  // minutes, not looking at it for ten seconds", and the failure it is testing for happens in a
  // person rather than in a number -- so the honest answer to a feature that cannot be asserted is
  // that the player who feels it can turn it off.
  setDrift(on) {
    this.driftOn = !!on;
    try { localStorage.setItem('crownrush-drift', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  setStack(on) {
    this.stackOn = !!on;
    try { localStorage.setItem('crownrush-stack', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  // #171: Quit to Menu. The run is written down if it can be -- `quietEnoughToSave` is the rule the
  // dawn save follows and the save carries a live raid (#150), so Continue on the title picks up from
  // here and not from the last dawn -- then the world stops with nothing over it and the title screen
  // comes back (main.js redraws it, because that is where its readers live). Both `running` and
  // `paused` false is the title's own state: `pause` knows it as "nothing to pause".
  quitToMenu() {
    if (this.quietEnoughToSave()) this.saveRun();
    this.fromPause = false;
    this.paused = false;
    this.running = false;
    audio.setActive(false);
    this.hud.hidePanels();
  }

  togglePause() {
    if (this.paused) this.unpause();
    else this.pause();
  }

  gameOver(reason = 'king') {
    if (this.over) return;
    this.lost = reason;
    this.over = true;
    this.running = false;
    // #110: stand the King down. `flashHurt` is only called from inside `if (this.running)`, so this
    // is the last moment anything can put the hurt flash back -- after it the King keeps whichever
    // half of the blink he was on, for as long as the player looks at him.
    this.clearHurt(this.king);
    // #110: the verdict is armed BEFORE the bookkeeping below rather than after it. Three of those
    // calls reach localStorage, which throws in private mode and on a full quota (#94), and a throw
    // between here and the old `setTimeout` at the bottom took the game-over screen with it -- leaving
    // a stopped world, a dead King and no Play Again, which is how "it didn't restart" gets reported.
    // Arming first costs a line and nothing below can undo it. The 900ms beat is unchanged, so all of
    // this has long since run by the time it fires.
    setTimeout(() => this.showVerdict(reason), 900);
    this.clearRun();
    if (this.wave > this.best) {
      this.best = this.wave;
      writeNumber('crownrush-best', this.best);
    }
    this.saveScore();
    this.recordRun(reason);
    audio.gameOver();
  }

  // #110: the end of the run, with every panel that could paint over it taken down first -- `start()`
  // has done this since #25 and this had never caught up (see `hud.hidePanels`).
  //
  // The flags are cleared here rather than by calling `hideKeep`/`hideSettings`/`hideInfo`, because
  // all three of those hand the pause back on the way out, and handing the pause back after the King
  // is dead starts the sim again underneath the verdict.
  showVerdict(reason) {
    this.offer = null;
    this.offerQueue = 0;
    this.offerLevels = [];
    this.offerPaused = false;
    this.gain = null;
    this.keepOpen = false;
    this.scoresOpen = false;
    this.diaryOpen = false;
    this.castOpen = false;   // #159
    this.creditsOpen = false;   // #175
    this.releasesOpen = false;   // #206
    this.settingsOpen = false;
    this.settingsPaused = false;
    this.infoOpen = false;
    this.hud.hidePanels();
      // #58: the pills on the end screen say what Play Again will start, which is the stored preference
    // rather than this run's length -- they differ after a Continue, where the run being finished is
    // whatever was saved and the next one is whatever the player last chose.
    this.hud.showGameOver(this.baseLevel, this.coinsEarned, this.score, this.bestScore, reason, readLength(), this.legacyProgress(), this.wave, this.kills, this.seed);
  }

  victory() {
    this.won = true;
    this.running = false;
    this.clearHurt(this.king);   // #110: the same last moment as `gameOver`. A King who won is not red.
    this.clearRun();
    if (this.wave > this.best) {
      this.best = this.wave;
      writeNumber('crownrush-best', this.best);
    }
    this.saveScore();
    this.recordRun('won');
    const legacy = this.legacyProgress();
    setTimeout(() => this.hud.showVictory(this.coinsEarned, this.units.length - 1 + this.turrets.length, this.score, readLength(), legacy, this.wave, this.kills), 600);
  }

  addScore(n) {
    if (this.restoring) return;   // a rebuilt village is not earned a second time
    this.score += Math.round(n);
  }

  saveScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      writeNumber('crownrush-best-score', this.bestScore);
    }
  }

  // #94: the run itself, not just whether it beat the maximum. Called from both endings, which is
  // every way a run can finish -- `gameOver` covers three of the four and `victory` is the fourth.
  recordRun(end) {
    // #56: the run pays into the lifetime total FIRST, so the verdict screen can say what it bought.
    // `justUnlocked` is the difference either side of the payment -- the honest way to answer "did
    // this loss advance anything", which is the whole point of the ticket.
    const before = this.unlocked().map((u) => u.id);
    this.legacy = addLegacy(this.score);
    this.justUnlocked = this.unlocked().filter((u) => !before.includes(u.id));
    recordRun({
      score: this.score, wave: this.wave, end, coins: this.coinsEarned,
      // #119: what the board and the title screen now lead with. `wave` stays beside it -- the night
      // is still counted, rows written before this have nothing else to show, and the scores format
      // must NOT have its VERSION bumped to add a field (that empties everyone's board).
      level: this.baseLevel,
      // #58: which board this belongs on. Fifteen nights scores far less than thirty for the same
      // play, so the two are ranked separately -- see `recordRun` in scores.js.
      len: this.runLength,
      army: Math.max(0, this.units.length - 1 + this.turrets.length),
    });
  }

  // Reported twice: once mid-run, once on night 14. A stopped game with nothing on screen to explain
  // it is the worst bug to report and the easiest
  // to recover from: every legitimate pause has something visible attached to it (the pause screen,
  // a reward to choose, the info or settings sheets, the end of the run, a lost graphics context).
  // If the world has stopped and none of those hold, something failed to hand the pause back, so
  // take it back here rather than leaving the player looking at a still picture.
  // Every screen that stops the world has to be named here, and the ones that are easiest to forget
  // are the ones that pause SILENTLY: `pauseHidden()` speaks for the pause screen, so it can vouch for
  // a pause the player asked for and for nothing else. The Keep plaque and the scoreboard both stopped
  // the world without putting that screen up, so neither was excused and neither could be -- and this
  // took the pause back a second and a half after either was opened. Driven: open the Keep sheet,
  // step three seconds of game time, and the raid is running again behind a sheet still on screen.
  //
  // #118: the two screens that are up before a run exists were missing from the list, and they are the
  // two a new player sees first. Measured: 1.5s after the page loaded this declared the title screen a
  // stopped game and started the raid behind it, and it kept running behind the tutorial after that --
  // sixteen raiders on the field while the player read card one, and `recovered a stopped game` in the
  // console on every single load, which is how the one line that would report a real stuck game got
  // taught to everybody as noise.
  //
  // Named rather than tested for. `pause()` recognises the same state with `!running && !paused`, and
  // borrowing that here would be shorter -- but it would also quietly excuse any FUTURE path that
  // stops the world without setting `paused`, which is exactly the kind of stop this exists to catch.
  // #154: Wren writes up a Keep level once she is in a position to. Cheap enough to call every
  // frame -- it is one compare until something is actually owed.
  //
  // SHE CANNOT WRITE WHILE THEY HAVE HER. `levelUp` can fire while she is captive (the Keep is fed
  // by the King, and #16's recapture chase does not stop him), and a diary that kept updating with
  // raiders carrying her north would be wrong in a way the player would notice. So the level is
  // OWED, not lost: it lands the moment she is back, which costs one condition and pays for itself
  // as storytelling.
  tickDiary() {
    if (!this.diaryDue || this.inPrologue()) return;   // #232
    const lv = this.diaryDue;
    this.diaryDue = 0;
    // `unlockDiary` answers whether it was new: a second run past the same level says nothing,
    // because the player has already read that page.
    if (unlockDiary(lv)) this.diaryNew = lv;
  }

  watchStuck(dt) {
    const excused = this.running || this.over || this.won || this.contextLost
      // #132: `this.gain` is NOT here any more. It used to name a panel holding the pause; it names a
      // notice over a running game now, so excusing it would excuse a genuinely stuck one.
      || this.offer || this.infoOpen || this.settingsOpen
      || this.keepOpen || this.scoresOpen || this.diaryOpen || this.castOpen || this.creditsOpen
      || this.releasesOpen   // #206
      || !this.hud.startHidden() || this.hud.introOpen()   // #118: no run has started yet
      || !this.hud.pauseHidden();       // the player's own pause, with its screen up
    if (excused) {
      this.stuckFor = 0;
      return;
    }
    this.stuckFor = (this.stuckFor || 0) + dt;
    if (this.stuckFor < 1.5) return;    // a beat of grace, so a normal hand-off is never fought over
    this.stuckFor = 0;
    console.warn('recovered a stopped game: paused with nothing on screen');
    this.offerQueue = 0;
    this.offerLevels = [];
    this.offer = null;
    this.offerPaused = false;
    this.gain = null;
    this.hud.hideOffer();
    this.hud.hideGain();
    this.hud.hidePause();
    this.paused = false;
    this.running = true;
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    this.watchStuck(dt);
    audio.setActive(this.running);
    if (this.running) {
      this.updatePlayer(dt);
      this.updateArmy(dt);
      this.updateTurrets(dt);
      this.mendWalls(dt);   // #235
      this.updateEnemies(dt);
      this.updateTorches();   // #212: after they have moved, so a flame is in the hand and not behind it
      this.updateArrows(dt);
      this.updateCoins(dt);
      this.updatePileFlies(dt);
      this.updatePiles(dt);
      this.updateTrade(dt);
      this.updateVillagers(dt);
      this.updateGleaner(dt);
      this.updateHorses(dt);
      this.tickDiary();
      // #132: the capability notice's own clock, before `updatePads` decides whether the mat chip
      // gets the lane -- so a notice that closed on this frame hands the lane straight back.
      if (this.gain && this.hud.tickGain(dt)) this.dismissGain();
      this.updatePads(dt);
      this.updateOpening(dt);   // #152: the calm, and the men who end it
      this.updateRuins(dt);
      this.updateWaves(dt);
      this.updateFog(dt);
      this.updateChips(dt);
      const army = this.countFollowers();
      // One pass answers both questions: how much raid is left, and whether there is any at all.
      const raid = this.raidRemaining(this._raid || (this._raid = { hp: 0, count: 0 }));
      const between = raid.count === 0 && !this.inPrologue() && !this.queen.captive;   // #232
      // The meter is read against the most the night ever held, so it only ever falls -- except when
      // the Warlord calls more men in, which is the one time it SHOULD climb, because that is exactly
      // what is happening. It resets when the field goes quiet, so each night is measured against its
      // own size rather than against the biggest night so far.
      if (raid.hp > this.raidPeak) this.raidPeak = raid.hp;
      if (raid.count === 0) this.raidPeak = 0;
      this.hud.setRaid(this.raidPeak > 0 ? raid.hp / this.raidPeak : 0, raid.count, this.wave, raid.boss, this.inPrologue());   // #232
      // #19: the march on the camp opens at a Keep level or a night, whichever comes first
      if (!this.finaleOpen && (this.baseLevel >= CFG.finale.level || this.wave >= this.finaleNight())) {
        this.finaleOpen = true;
        this.hud.toast('The raiders\' camp lies to the north. *March on it and end the war!*', 4200, 'Raid');
        audio.wave(true);
      }
      this.hud.showNextWave(between && this.wave > 0 && this.waveTimer > 3 && !this.won);
      if (this.raidWarning && this.time >= this.raidWarning) {
        this.raidWarning = 0;
        this.hud.toast('They want her back. Raiders are coming!', 3000, 'Raid');
      }
      this.alarmT -= dt;
      this.hud.showAlarm(this.alarmT > 0 ? this.alarmText : null);
      this.hornT = Math.max(0, this.hornT - dt);
      // #43: and both stand down while a building is being put down -- the place button takes the
      // horn's own corner, and choosing between a warhorn and a tick is not a choice anyone should be
      // offered mid-placement. #137: the cross takes the slot beside it for the same reason, which is
      // why both of these have to stand down and not only the horn.
      const verbs = (!this.inPrologue() || this.queen.taken) && !this.placing;   // #232
      this.hud.setHorn(verbs, this.hornT / CFG.horn.cooldown, this.hornT);
      // #57: and the banner, which has a life of its own as well as a cooldown -- it is taken down
      // the frame it runs out rather than being left standing for the army to ignore.
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.banner && this.time >= this.banner.until) this.clearBanner();
      this.hud.setBanner(verbs, this.bannerT / CFG.banner.cooldown, this.bannerT, !!this.bannerStanding());
      // #234: and Wren's, which stands down with the rest of them (`verbs`) for the same reason.
      //
      // Her mode is derived HERE rather than in the HUD, the way the mount's is: the HUD does not
      // know whether there is a Keep to put her in and should not learn. The button is shown once
      // the run has started and she is not in somebody's hands -- before a Keep is built she is out
      // by default, and the meter still fills, which is where a first run meets this at all.
      const q = this.queen;
      const wrenMode = q.charge >= 1 ? 'hold' : q.inKeep ? 'out' : 'in';
      const canShelter = !!this.keep && this.keep.state === 'built';
      const wrenShow = verbs && !q.captive && (canShelter || q.charge > 0);
      // #240: MOUNT AND WREN SHARE ONE SLOT. Four buttons along the bottom edge were 244 of a
      // phone's 390 px, and the joystick is a pointerdown anywhere on the canvas UNDER them -- a
      // thumb resting where thumbs rest landed on a button before it could start a drag. Both
      // elements stay (the element sheet shows both) and both sit at the same `right`, so the slot
      // changes its icon and never its place.
      //
      // NOT the ticket's literal rule, which was "Wren's whenever her button would show, else the
      // horse". Her button shows for the whole of a run once a Keep stands, so that rule would have
      // taken the horse off the phone for good. Wren has the slot while she has a job on it: her
      // meter is full, she is out, or she is sheltered and it is night, which is when taking her
      // out is the point (the meter fills while raiders are near her). Sheltered by day is the
      // horse's time -- the mining trip -- and it takes the slot then, if there is a horse to take
      // it; without one her Out stays. So every verb is reachable by touch at the moment it is for.
      const wrenSlot = wrenShow && (wrenMode !== 'out' || this.night || !this.hasHorse());
      this.hud.setWren(wrenSlot, wrenMode, q.charge,
        // STALLED is out, at night, and nothing near enough to charge her. Not simply "not
        // charging": in the Keep or in daylight the ring is meant to be still, and dressing those as
        // a stall would cry wolf for two thirds of a run.
        !q.inKeep && this.night && !q.charging && q.charge < 1);
      // #217: the mount button, which stands down with the other two for the same reason. Its
      // mode is derived here rather than in the HUD, because the HUD does not know how far away a
      // horse is and should not learn.
      this.hud.setMount(verbs && this.hasHorse() && !wrenSlot,
        this.mounted ? 'dismount' : this.royalHorseDist() <= CFG.horse.royal.mountAt ? 'mount' : 'call');
      this.hud.setCoinTier(this.coinTier());
      // #119: with one number on the HUD instead of two, the one case it could lie about is a player
      // falling behind -- the raid is fought at `raidLevel()`, which runs ahead of the Keep when the
      // nights outpace it. The cell says so itself rather than leaving it to be inferred.
      this.hud.setStall(this.raidLevel() > this.baseLevel);
      this.hud.setHearts(this.king.hp / this.king.maxHp);
      // #129: the bag filling UP is the event, and it had no voice. There was a line and it was the
      // right words, but it lived in the branch that runs when the King walks onto a pile he cannot
      // pick up -- a refusal, not a notice. So the moment the bag actually filled nothing was said,
      // the swings went on landing, and the player found out later by stepping on a heap.
      // Edge-checked here rather than at each place the load can rise, because there are three of
      // them (a heap scooped, a mined chip landing, a villager's delivery) and a rule that has to be
      // remembered at three call sites is a rule that will be missed at a fourth. `loadTotal` is a
      // reduce over five keys, which `setLoad` on the next line is about to do anyway.
      this.checkBagFull();
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army, between ? this.waveTimer : null, this.finaleOpen ? 'camp' : `${this.baseLevel}/${CFG.finale.level}`, this.res, this.score, this.loadCap());
      this.updateIndicators(dt);
      this.perfT -= dt;
      if (this.perfT <= 0) {
        this.perfT = 2;
        this.perfLog.push(this.perfSample());
        if (this.perfLog.length > 1800) this.perfLog.shift();
      }
    }
    this.world.focus.copy(this.king.mesh.position);
    this.updateGrassFeet();   // #200
    // #81: the weather clock stops when the game does, the way the day clock already does, and it
    // does not start until the Queen is home. updateDaylight reads the level it leaves behind, so
    // this has to run before it.
    this.world.rain.run = this.running && !this.queen.captive;
    this.world.update(dt);
    audio.setRain(this.world.rain.level);
    // Said once a run, on the first shower. A regrow bonus nobody is told about is a buff that does
    // not exist, and a weather report every time it comes on is a notice you learn to dismiss.
    if (this.running && !this.rainTold && this.world.rain.level > 0.15) {
      this.rainTold = true;
      this.hud.toast('Rain. The woods and the wheat come back faster while it falls.', 3400, 'Weather');
    }
    this.updateDaylight(dt);
    // characters far from the King (at or beyond the screen edge) animate at half rate
    const kp = this.king.mesh.position;
    this.animFrame = (this.animFrame || 0) + 1;
    let idx = 0;
    // Scratch, refilled in place. Spreading the three lists into a fresh array here meant allocating
    // a couple of hundred slots every frame purely to walk them once; `length = 0` keeps the backing
    // store, so after the first frame this allocates nothing.
    const ents = this._ents || (this._ents = []);
    ents.length = 0;
    for (const u of this.units) ents.push(u);
    for (const e of this.enemies) ents.push(e);
    for (const t of this.turrets) ents.push(t);
    for (const ent of ents) {
      const rig = ent.mesh.userData.rig;
      if (!rig) continue;
      idx++;
      if (ent.mesh.position.distanceToSquared(kp) > 18 * 18) {
        ent.animAcc = (ent.animAcc || 0) + dt;
        if ((this.animFrame + idx) & 1) continue;
        rig.mixer.update(ent.animAcc);
        ent.animAcc = 0;
      } else rig.mixer.update(dt);
      // #117: a rider's rig is the rig on his horse's group, and a seated man does not walk -- Idle
      // is near enough the saddle, and the horse's own legs carry the movement.
      if (!ent.rigOnce || ent.rigOnce <= this.time) rig.play(ent.moving && !ent.mounted ? 'Walk' : 'Idle');
      // #55: and at the speed it is actually travelling. Everything shared one Walk cycle at one
      // rate, across speeds from the boss's 2.3 to an army archer's 9.0, so most of the field was
      // either moonwalking or paddling. The stride is baked into the clip, so the rate that stops
      // the feet sliding is just speed / the speed it was baked for -- see CFG.walkAnim.
      if (rig.setRate) rig.setRate(ent.moving && !ent.mounted ? this.walkRate(ent) : 1);
    }
    // Instanced characters have a mixer that does nothing, so the loop above costs them a call and
    // leaves. Their poses come from here instead: one matrix and four floats each, no skeletons.
    updateCrowd(dt, this.camera);
    this.updateFx(dt);
    this.updateEffects(dt);
    this.updateStack(dt);
    this.updateBlobs();
    this.updateCamera(dt);
    // #178: the character sheet owns the camera and its own mixer while it is up, so it runs after
    // `updateCamera` rather than before -- otherwise the camera it just set is overwritten every
    // frame by the one following a King who is not on screen.
    this.updateCharView(dt);
    this.bars.update(this.camera, this.camDist * 1.7, this.camDist * 2.8);
    if (!this.contextLost) {
      // #189: `renderer.info` resets itself at the top of every `render()`, and a composer calls
      // render once per pass -- so after a composed frame it reports the LAST PASS, which is one
      // full-screen quad. That silently turns the perf overlay's draw-call number into 1 and, worse,
      // disarms `watchRender`: its test for a dead renderer is `calls === 0`, and the OutputPass
      // quad on its own satisfies it while the scene draws nothing. So the reset is taken over here
      // and done once a frame, and the number means the whole frame again.
      this.renderer.info.reset();
      if (this.post) this.post.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.frames = (this.frames || 0) + 1;
    }
  }

  updateTaken(dt) {
    const q = this.queen;
    const lead = (q.escort || []).find((e) => this.enemies.includes(e));
    if (!lead) return this.rescueTaken();
    const lp = lead.mesh.position;
    // carried just behind the leader
    tmp.set(lp.x - Math.sin(lead.mesh.rotation.y) * 0.9, 0, lp.z - Math.cos(lead.mesh.rotation.y) * 0.9);
    q.mesh.position.lerp(tmp, 1 - Math.exp(-dt * 12));
    q.mesh.position.y = 0;
    q.mesh.rotation.y = lead.mesh.rotation.y;
    q.moving = true;
    this.animateWalk(q, 1, dt);
    q.bar.visible = false;
    // #152: the opening's chase ends at the camp's picket rather than at the edge of the world.
    // Checked here and not in `updateEscort`: this runs once a frame on the one escort that is
    // actually carrying her, where `updateEscort` runs on each of them from inside a walk of
    // `this.enemies` -- and the hand-off empties that array of escorts as its first act.
    if (lead.premise) {
      const pk = CFG.opening.picket;
      if (Math.hypot(lp.x - pk[0], lp.z - pk[1]) < 1.6) this.handOffAtPicket();
    }
  }

  rescueTaken() {
    const q = this.queen;
    q.taken = false;
    q.captive = false;
    this.beginRun();   // #232: the other way the prologue can end
    q.escort = null;
    // #83: she has no wounds to come back with, so the cost of a rescue is that they still half have
    // her -- the bar comes back down and climbs out of it over the next couple of seconds. The Keep
    // paying below is the part that lasts.
    q.seize = CFG.queen.seize.shaken;
    q.held = false;
    setHealthBar(q.bar, 1 - q.seize);
    tmp.copy(q.mesh.position).setY(1.0);
    this.heartFx(tmp, 8, 0.9);
    this.addScore(CFG.score.recapture);
    if (this.keep && this.keep.state === 'built') {
      this.keep.hp = Math.max(1, this.keep.hp - this.keep.maxHp * CFG.rescue.keepCost);
      setHealthBar(this.keep.bar, this.keep.hp / this.keep.maxHp);
      this.hud.toast('Wren is back. "I am not hurt. The Keep took that for me."', 3400, 'Wren');
    } else this.hud.toast('Wren is back, and furious. "Find me a door."', 3200, 'Wren');
    audio.unlock();
  }

  // Sapper: straight for the nearest standing wall (or the Keep), and it goes off on contact.
  updateSapper(e, dt) {
    const p = e.mesh.position;
    if (!e.target || e.target.state !== 'built' || e.retarget <= 0) {
      e.retarget = 1.5;
      let best = null;
      let bd = Infinity;
      for (const w of this.walls) {
        if (w.state !== 'built') continue;
        const mx = w.alongX ? (w.a0 + w.a1) / 2 : w.fixed;
        const mz = w.alongX ? w.fixed : (w.a0 + w.a1) / 2;
        const d = (mx - p.x) ** 2 + (mz - p.z) ** 2;
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      e.target = best || (this.keep && this.keep.state === 'built' ? this.keep : this.king);
    }
    e.retarget -= dt;
    const t = e.target;
    const tx = t.isKeep ? t.x : t.alongX !== undefined ? (t.alongX ? (t.a0 + t.a1) / 2 : t.fixed) : t.mesh.position.x;
    const tz = t.isKeep ? t.z : t.alongX !== undefined ? (t.alongX ? t.fixed : (t.a0 + t.a1) / 2) : t.mesh.position.z;
    tmp2.set(tx - p.x, 0, tz - p.z);
    const d = tmp2.length();
    this.faceTowards(e.mesh, tmp.set(tx, 0, tz), dt, 10);
    if (d > 0.05) {
      tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d));
      p.add(tmp2);
    }
    const hit = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
    this.collideRiver(p, e.radius);
    e.moving = true;
    this.animateWalk(e, 1, dt);
    const reachedKeep = t.isKeep && d < CFG.keep.half + e.radius + 0.6;
    const reachedKing = t === this.king && d < 1.2;
    if (hit || reachedKeep || reachedKing) {
      // boom
      const wall = hit || (reachedKeep ? this.keep : null);
      if (wall) this.damageWall(wall, e.damage * e.stats.blast);
      // #55: a sapper's blast throws everyone it catches outwards from where it went off
      for (const u of this.units) if (u.mesh.position.distanceTo(p) < 2.2) this.damageUnit(u, e.damage, p);
      this.burstFx(tmp.copy(p).setY(1.0), '#ffb347', 5, 0.45);
      this.shake = 0.3;
      audio.wallHit();
      e.hp = 0;
      this.killEnemy(e, p);
    }
  }

}


// The rest of the class. These were cut out of this file to keep it readable; they are ordinary
// methods of Game and behave exactly as they did when they were written inline.
Object.assign(Game.prototype, BuildMethods, EnemiesMethods, UnitsMethods, ViewMethods, VillagerMethods, HorseMethods, SaveMethods, QualityMethods);
