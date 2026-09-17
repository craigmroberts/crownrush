import * as THREE from 'three';
import { CFG, TIERS, NODES } from './config.js';
import { audio } from './audio.js';
import { setRigShadows, enableCrowd, updateCrowd, clearCrowd, crowdStats } from './rig.js';
import { MODS } from './upgrades.js';
import { recordRun, readNumber, writeNumber, readLegacy, addLegacy, unlockDiary } from './scores.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import { setHealthBar, HealthBars, CoinField, clearHealthBars, makeRing, makeCoinStack, makeCamp } from './models.js';
import { V3, tmp, tmp2, rand } from './game-shared.js';
import { BuildMethods } from './game-build.js';
import { EnemiesMethods } from './game-enemies.js';
import { UnitsMethods } from './game-units.js';
import { ViewMethods } from './game-view.js';
import { VillagerMethods } from './game-villagers.js';
import { SaveMethods, readLength } from './game-save.js';

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
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile && !this.safe,
      powerPreference: plain ? 'default' : 'high-performance',
    });
    this.setPixelRatio();
    this.renderer.shadowMap.enabled = !plain;
    this.renderer.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200);
    this.input = new Input(canvas);
    const { sun, hemi } = setupLights(this.scene);
    this.sun = sun;
    this.hemi = hemi;
    // #81: what the sky is worth when it is dry. updateDaylight writes the sun, the hemisphere
    // colours, the fog colour and the exposure every frame, so rain can just scale those on its way
    // past -- but these four it never touches, so something has to remember them to put them back.
    // Read off the lights rather than repeated in CFG, because two places holding the same number is
    // how one of them goes stale.
    this.dry = { hemi: hemi.intensity, fogNear: this.scene.fog.near, fogFar: this.scene.fog.far, shadow: sun.shadow.intensity };
    this.dayPhase = 0.05; // the run opens in early morning
    this.night = false;
    this.sunHeight = 34;
    if (this.mobile) sun.shadow.mapSize.set(1024, 1024);
    this.world = buildWorld(this.scene);
    this.buildFog();
    // every health bar in the game is drawn by this one instanced mesh
    this.bars = new HealthBars(600);
    this.scene.add(this.bars.mesh);
    // every coin on the ground is drawn by these two instanced meshes; see CoinField
    this.coinField = new CoinField(400);
    this.coinField.add(this.scene);
    // Phones: characters get one instanced "blob" shadow each instead of rendering into the shadow map
    // (that pass cost a second draw call per character); buildings and trees keep real shadows.
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

  setPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    let r = this.safe ? 1 : Math.min(dpr, this.mobile ? 1.5 : 2);
    const { w, h } = this.viewSize();
    const maxPixels = this.safe ? 1.6e6 : this.mobile ? 2.6e6 : 5e6;
    if (w * h * r * r > maxPixels) r = Math.max(1, Math.sqrt(maxPixels / (w * h)));
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // portrait phones need a higher camera to see the same play area
    this.camDist = this.camera.aspect < 0.8 ? 23 : this.camera.aspect < 1.3 ? 19 : 16.5;
  }

  // ---------- lifecycle ----------
  reset() {
    if (this.root) this.scene.remove(this.root);
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
    this.feedDef = null;
    this.mounted = false;
    this.res = { wood: 0, stone: 0, straw: 0, iron: 0, diamond: 0 };
    this.flyRes = [];
    this.score = 0;
    this.bestScore = readNumber('crownrush-best-score', 0);
    this.mineTimer = 0;
    this.nodes = [];
    this.ruins = [];        // #152: heaps where the opening's buildings stood, until they fade
    this.villagers = [];    // #48: one gatherer per villager home, working on their own
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
    // #57: the dash. `dashT` is the cooldown, `dashUntil` the moment it ends, and dashX/dashZ the
    // direction it was committed to -- fixed when it is pressed, because a steerable dash is a speed
    // boost and a committed one is a decision.
    this.dashT = 0;
    this.dashUntil = 0;
    this.dashX = 0;
    this.dashZ = 1;
    // #57: the rally banner. `banner` is { x, z, until, mesh } while one stands, null otherwise; the
    // mesh itself was disposed at the top of this function, before the old root was dropped.
    this.banner = null;
    this.bannerT = 0;
    this.rallyUntil = 0;
    this.alertT = 0;
    this.queenHop = 0;
    this.heartTimer = 0;
    this._pen = new V3(CFG.rescue.pos[0], 0, CFG.rescue.pos[1]);
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
    this.mods = { ...MODS };
    // #56: and then whatever previous runs have earned, through the same door an in-run upgrade uses.
    // Read fresh every reset rather than cached, so a run that ends and unlocks something hands the
    // next one the benefit without a reload.
    this.legacy = readLegacy();
    this.applyLegacy();
    this.taken = {};
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
    // #152: the opening clock. `openT` counts the calm out; `snatched` is what the rest of the game
    // reads to know the premise has happened -- the day does not start until it has.
    this.openT = 0;
    this.snatched = false;
    this.openWarned = false;
    this.openingDone = false;
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
    this.ringRadius = CFG.king.pickupRadius;
    this.root.add(this.ring);

    // coin stack carried above the king
    this.stack = [];
    this.stackMesh = makeCoinStack(70);
    this.root.add(this.stackMesh.outer, this.stackMesh.inner);
    for (let i = 0; i < 70; i++) this.stack.push({ position: new V3(0, 2.4 + i * 0.11, 0) });

    this.nodeRing = makeRing(3.2);
    this.nodeRing.visible = false;
    this.root.add(this.nodeRing);
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
        this.renderer.shadowMap.enabled = false;
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

  // The next one to come, or null once they are all in hand.
  nextUnlock() {
    return CFG.legacy.find((u) => this.legacy < u.at) || null;
  }

  has(id) {
    const u = CFG.legacy.find((x) => x.id === id);
    return !!u && this.legacy >= u.at;
  }

  applyLegacy() {
    if (this.has('volunteers')) this.mods.recruitBonus += 1;
    if (this.has('packs')) this.mods.carryBonus += 1;
    // `purse` is read where the coins are scattered, and `stables` in `start()` -- `mountKing` needs
    // a King to mount, and this runs from `reset()` before the field exists.
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
      of: CFG.legacy.length,
    };
  }

  // How many coins lie on the road at the start. #56's first unlock, and its only reader.
  startCoins() {
    return CFG.coins.start + (this.has('purse') ? 15 : 0);
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
    if (this.has('stables')) this.mountKing();
    // #152: the kingdom he has this morning. In `start` and not in `reset`, because `resumeRun` calls
    // `reset` too and a restored run is a village that already exists -- standing this one up under it
    // would put a second Keep on the field.
    this.standOpeningVillage();
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
      this.hud.showOffer(this.offer, lv, this.offerQueue, this.levelGains(lv));
      return;
    }
    this.paused = false;
    this.running = true;
    audio.setActive(true);
    this.hud.hidePause();
    this.hud.hideInfo();
    this.infoOpen = false;
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
    this.settingsOpen = false;
    this.settingsPaused = false;
    this.infoOpen = false;
    this.hud.hidePanels();
      // #58: the pills on the end screen say what Play Again will start, which is the stored preference
    // rather than this run's length -- they differ after a Continue, where the run being finished is
    // whatever was saved and the next one is whatever the player last chose.
    this.hud.showGameOver(this.baseLevel, this.coinsEarned, this.score, this.bestScore, reason, readLength(), this.legacyProgress());
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
    setTimeout(() => this.hud.showVictory(this.coinsEarned, this.units.length - 1 + this.turrets.length, this.score, readLength(), legacy), 600);
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
    if (!this.diaryDue || this.queen.captive) return;
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
      || this.keepOpen || this.scoresOpen || this.diaryOpen
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
      this.updateEnemies(dt);
      this.updateArrows(dt);
      this.updateCoins(dt);
      this.updatePileFlies(dt);
      this.updatePiles(dt);
      this.updateTrade(dt);
      this.updateVillagers(dt);
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
      const between = raid.count === 0 && !this.queen.captive;
      // The meter is read against the most the night ever held, so it only ever falls -- except when
      // the Warlord calls more men in, which is the one time it SHOULD climb, because that is exactly
      // what is happening. It resets when the field goes quiet, so each night is measured against its
      // own size rather than against the biggest night so far.
      if (raid.hp > this.raidPeak) this.raidPeak = raid.hp;
      if (raid.count === 0) this.raidPeak = 0;
      this.hud.setRaid(this.raidPeak > 0 ? raid.hp / this.raidPeak : 0, raid.count, this.wave, raid.boss, this.queen.captive);
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
      // #43: and all three stand down while a building is being put down -- the place button takes
      // the horn's own corner, and choosing between a warhorn and a tick is not a choice anyone
      // should be offered mid-placement. #137: the cross takes the dash's slot for the same reason,
      // which is why all three of these have to stand down and not only the horn.
      const verbs = (!this.queen.captive || this.queen.taken) && !this.placing;
      this.hud.setHorn(verbs, this.hornT / CFG.horn.cooldown, this.hornT);
      // #57: the dash sits beside the horn and follows the same rule about when it is offered -- both
      // are the King's own verbs, and neither is his while somebody else has hold of Wren.
      this.dashT = Math.max(0, this.dashT - dt);
      this.hud.setDash(verbs, this.dashT / CFG.dash.cooldown, this.dashT);
      // #57: and the banner, which has a life of its own as well as a cooldown -- it is taken down
      // the frame it runs out rather than being left standing for the army to ignore.
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.banner && this.time >= this.banner.until) this.clearBanner();
      this.hud.setBanner(verbs, this.bannerT / CFG.banner.cooldown, this.bannerT, !!this.bannerStanding());
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
    }
    this.world.focus.copy(this.king.mesh.position);
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
      if (!ent.rigOnce || ent.rigOnce <= this.time) rig.play(ent.moving ? 'Walk' : 'Idle');
      // #55: and at the speed it is actually travelling. Everything shared one Walk cycle at one
      // rate, across speeds from the boss's 2.3 to an army archer's 9.0, so most of the field was
      // either moonwalking or paddling. The stride is baked into the clip, so the rate that stops
      // the feet sliding is just speed / the speed it was baked for -- see CFG.walkAnim.
      if (rig.setRate) rig.setRate(ent.moving ? this.walkRate(ent) : 1);
    }
    // Instanced characters have a mixer that does nothing, so the loop above costs them a call and
    // leaves. Their poses come from here instead: one matrix and four floats each, no skeletons.
    updateCrowd(dt, this.camera);
    this.updateFx(dt);
    this.updateEffects(dt);
    this.updateStack(dt);
    this.updateBlobs();
    this.updateCamera(dt);
    this.bars.update(this.camera, this.camDist * 1.7, this.camDist * 2.8);
    if (!this.contextLost) {
      this.renderer.render(this.scene, this.camera);
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
  }

  rescueTaken() {
    const q = this.queen;
    q.taken = false;
    q.captive = false;
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
Object.assign(Game.prototype, BuildMethods, EnemiesMethods, UnitsMethods, ViewMethods, VillagerMethods, SaveMethods);
