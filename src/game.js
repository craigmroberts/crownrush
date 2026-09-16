import * as THREE from 'three';
import { CFG, TIERS, NODES } from './config.js';
import { audio } from './audio.js';
import { setRigShadows, enableCrowd, updateCrowd, clearCrowd, crowdStats } from './rig.js';
import { MODS } from './upgrades.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import { setHealthBar, HealthBars, CoinField, clearHealthBars, makeRing, makeCoinStack, makeCamp } from './models.js';
import { V3, tmp, tmp2, cap, rand } from './game-shared.js';
import { BuildMethods } from './game-build.js';
import { EnemiesMethods } from './game-enemies.js';
import { UnitsMethods } from './game-units.js';
import { ViewMethods } from './game-view.js';
import { VillagerMethods } from './game-villagers.js';
import { SaveMethods } from './game-save.js';

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
    this.watchContext(canvas);

    this.running = false;
    this.time = 0;
    this.best = Number(localStorage.getItem('crownrush-best') || 1);
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
  setPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    let r = this.safe ? 1 : Math.min(dpr, this.mobile ? 1.5 : 2);
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const maxPixels = this.safe ? 1.6e6 : this.mobile ? 2.6e6 : 5e6;
    if (w * h * r * r > maxPixels) r = Math.max(1, Math.sqrt(maxPixels / (w * h)));
    this.renderer.setPixelRatio(r);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
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
    this.dynamicPads = [];
    this.built = {};
    this.buyCount = {};
    this.tier = 0;
    this.wallLevel = 0;
    this.baseLevel = 0; // Keep level: 0 until the Keep is built, then 1..CFG.base.maxLevel
    this.feedDef = null;
    this.mounted = false;
    this.res = { wood: 0, stone: 0, straw: 0, iron: 0, diamond: 0 };
    this.flyRes = [];
    this.score = 0;
    this.bestScore = Number(localStorage.getItem('crownrush-best-score') || 0);
    this.mineTimer = 0;
    this.nodes = [];
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
    this.rallyUntil = 0;
    this.alertT = 0;
    this.queenHop = 0;
    this.heartTimer = 0;
    this._pen = new V3(CFG.rescue.pos[0], 0, CFG.rescue.pos[1]);
    this._penDir = new V3();
    this.lastAlarm = -99;
    this.swing = 0;
    this.activePad = null;
    this.nodeRing = null;
    this.minimapTimer = 0;
    this.fogTimer = 0;
    this.lastFogPos = new V3(999, 0, 999);
    this.damageMul = 1;
    this.mods = { ...MODS };
    this.taken = {};
    this.offerQueue = 0;
    this.offer = null;
    this.offerPaused = false;
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
    // the Queen starts captive out in the wilds; the King's first job is to bring her home
    this.queen = this.spawnUnit('queen', CFG.rescue.pos[0], CFG.rescue.pos[1]);
    this.queen.inKeep = false;
    this.queen.captive = true;
    for (let i = 0; i < CFG.rescue.captors; i++) {
      const a = (i / CFG.rescue.captors) * Math.PI * 2 + 0.6;
      const e = this.spawnEnemy('knight', CFG.rescue.pos[0] + Math.cos(a) * 2.3, CFG.rescue.pos[1] + Math.sin(a) * 2.3, CFG.rescue.captorRank || 0);
      e.captor = true;
      e.orbit = a;
      e.orbitDir = i % 2 ? -1 : 1;
      e.mesh.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    }
    if (CFG.rescue.captain) {
      // #30: the one who actually holds her. A brute, so the rescue has to be fought rather than walked.
      const cap = this.spawnEnemy('brute', CFG.rescue.pos[0], CFG.rescue.pos[1] - 2.6, CFG.rescue.captainRank || 1);
      cap.captor = true;
      cap.orbit = -Math.PI / 2;
      cap.orbitDir = 1;
      cap.mesh.rotation.y = Math.PI;
    }
    const hc = TIERS[0].bounds;
    this.homeSide = this.world.riverInfo((hc.x0 + hc.x1) / 2, (hc.z0 + hc.z1) / 2).side;

    // resource nodes: hidden until the Keep can actually use the material they hold
    for (const def of NODES) {
      const mesh = this.makeNodeMesh(def.type);
      mesh.position.set(def.pos[0], 0, def.pos[1]);
      const from = CFG.base.materialAt[def.type] || 0;
      const open = this.baseLevel >= from;
      if (def.type !== 'straw' && open) this.root.add(mesh);
      this.nodes.push({ type: def.type, mesh, stock: def.stock, max: def.stock, regrow: 0, from, open, pos: new V3(def.pos[0], 0, def.pos[1]) });
    }
    // world roads/bridges/chimneys are scene-level: reset them
    if (this.world.clearSmokers) this.world.clearSmokers();
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
    this.ring = makeRing(2.4);
    this.ringRadius = 2.4;
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
    for (let i = 0; i < CFG.coins.start; i++) {
      const t = i / Math.max(1, CFG.coins.start - 1);
      tmp.set(-5 - t * 12 + rand(-1.2, 1.2), 0.6, 2 + t * 4 + rand(-1.6, 1.6));
      this.dropCoin(tmp);
    }
    this.refreshPads();
    this.hud.showNextWave(false);
    this.hud.hidePadTip();
    this.hud.set(this.coinsCarried, 1, 0, null, `0/${CFG.finale.level}`, this.res, 0, this.loadCap());
    this.hud.setRaid(0, 0);
    this.hud.setHearts(1);
    this.hud.setCoinTier(this.coinTier());
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

  start() {
    this.clearRun();
    this.reset();
    this.running = true;
    this.watchRender();
    this.hud.hideStart();
    this.hud.hideGameOver();
    this.hud.hideVictory();
    this.hud.hidePause();
    this.hud.toast('The Queen has been taken! Follow the pink arrow and free her.', 3600);
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
    this.hud.toast(`Night ${this.wave} again. Your kingdom stands.`, 3000);
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
      this.hud.showOffer(this.offer, this.baseLevel, this.offerQueue);
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
    this.clearRun();
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('crownrush-best', String(this.best));
    }
    this.saveScore();
    audio.gameOver();
    setTimeout(() => this.hud.showGameOver(this.wave, this.coinsEarned, this.score, this.bestScore, reason), 900);
  }

  victory() {
    this.won = true;
    this.running = false;
    this.clearRun();
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('crownrush-best', String(this.best));
    }
    this.saveScore();
    audio.build();
    setTimeout(() => this.hud.showVictory(this.coinsEarned, this.units.length - 1 + this.turrets.length, this.score), 600);
  }

  addScore(n) {
    if (this.restoring) return;   // a rebuilt village is not earned a second time
    this.score += Math.round(n);
  }

  saveScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('crownrush-best-score', String(this.bestScore));
    }
  }

  // Reported twice: once mid-run, once on night 14. A stopped game with nothing on screen to explain
  // it is the worst bug to report and the easiest
  // to recover from: every legitimate pause has something visible attached to it (the pause screen,
  // a reward to choose, the info or settings sheets, the end of the run, a lost graphics context).
  // If the world has stopped and none of those hold, something failed to hand the pause back, so
  // take it back here rather than leaving the player looking at a still picture.
  watchStuck(dt) {
    const excused = this.running || this.over || this.won || this.contextLost
      || this.offer || this.infoOpen || this.settingsOpen
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
    this.offer = null;
    this.offerPaused = false;
    this.hud.hideOffer();
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
      this.updatePads(dt);
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
      this.hud.setRaid(this.raidPeak > 0 ? raid.hp / this.raidPeak : 0, raid.count);
      // #19: the march on the camp opens at a Keep level or a night, whichever comes first
      if (!this.finaleOpen && (this.baseLevel >= CFG.finale.level || this.wave >= CFG.finale.night)) {
        this.finaleOpen = true;
        this.hud.toast('The raiders\' camp lies to the north. March on it and end the war!', 4200);
        audio.wave(true);
      }
      this.hud.showNextWave(between && this.wave > 0 && this.waveTimer > 3 && !this.won);
      if (this.raidWarning && this.time >= this.raidWarning) {
        this.raidWarning = 0;
        this.hud.toast('They want her back. Raiders are coming!', 3000);
      }
      this.alarmT -= dt;
      this.hud.showAlarm(this.alarmT > 0 ? this.alarmText : null);
      this.hornT = Math.max(0, this.hornT - dt);
      this.hud.setHorn(!this.queen.captive || this.queen.taken, this.hornT / CFG.horn.cooldown, this.hornT);
      this.hud.setCoinTier(this.coinTier());
      this.hud.setHearts(this.king.hp / this.king.maxHp);
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army, between ? this.waveTimer : null, this.finaleOpen ? 'camp' : `${this.baseLevel}/${CFG.finale.level}`, this.res, this.score, this.loadCap());
      this.updateIndicators(dt);
    }
    this.world.focus.copy(this.king.mesh.position);
    this.world.update(dt);
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
    q.hp = q.maxHp * 0.4;
    setHealthBar(q.bar, q.hp / q.maxHp);
    tmp.copy(q.mesh.position).setY(1.0);
    this.heartFx(tmp, 8, 0.9);
    this.addScore(CFG.score.recapture);
    if (this.keep && this.keep.state === 'built') {
      this.keep.hp = Math.max(1, this.keep.hp - this.keep.maxHp * CFG.rescue.keepCost);
      setHealthBar(this.keep.bar, this.keep.hp / this.keep.maxHp);
      this.hud.toast('The Queen is back, shaken. The Keep paid dearly for it.', 3400);
    } else this.hud.toast('The Queen is back, shaken. Get her somewhere safe.', 3200);
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
      for (const u of this.units) if (u.mesh.position.distanceTo(p) < 2.2) this.damageUnit(u, e.damage);
      this.burstFx(tmp.copy(p).setY(1.0), '#ffb347', 5, 0.45);
      this.shake = 0.3;
      audio.wallHit();
      e.hp = 0;
      this.killEnemy(e);
    }
  }

}


// The rest of the class. These were cut out of this file to keep it readable; they are ordinary
// methods of Game and behave exactly as they did when they were written inline.
Object.assign(Game.prototype, BuildMethods, EnemiesMethods, UnitsMethods, ViewMethods, VillagerMethods, SaveMethods);
