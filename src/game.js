import * as THREE from 'three';
import { CFG, PADS, TIERS, NODES, MAP } from './config.js';
import { audio } from './audio.js';
import { makeRigged, setRigShadows } from './rig.js';
import { MODS, UPGRADES, pickOffer } from './upgrades.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import {
  makeKing, makeKingFoot, makeQueen, makeKeep, makeLumberTree, makeOreRock, makeIronSeam, makeGemNode, makeResourceCube, RES_MATS, CHIP_GEO, makeTool, makeArcher, makeSwordsman, makeKnight, makeElite, makeBrute, makeBoss, makeCoin, makeArrow,
  makeHut, makeTower, makeBarracks, makeWallSegment, makeGate, makeRubble, makeBridge, makePad, drawPad, ghostify,
  makeHealthBar, setHealthBar, HealthBars, disposeHealthBar, clearHealthBars, makePopup, makeRing, makeSpawnFx, makeBurst, makeCoinStack,
  makeBank, makeGatePost, makeHeart, makeCamp, COIN_TIER_COLORS,
} from './models.js';

const V3 = THREE.Vector3;
const tmp = new V3();
const tmp2 = new V3();
const tmpM = new THREE.Matrix4();
const HAIR = [0x5a3416, 0x2a1e16, 0x8a5a2b, 0x1c1c22, 0x6b3f1d];
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// pad look by what it does (see drawPad in models.js)
const PAD_STYLE = {
  build: { shape: 'square', rim: '#ffffff', tag: 'BUILD' },
  recruit: { shape: 'circle', rim: '#7fc8ff', tag: 'RECRUIT' },
  crew: { shape: 'circle', rim: '#7fc8ff', tag: 'CREW' },
  trade: { shape: 'circle', rim: '#ffd23f', tag: 'TRADE' },
  feed: { shape: 'circle', rim: '#9cf07a', tag: 'FEED' },
  upgrade: { shape: 'circle', rim: '#d59bff', tag: 'UPGRADE' },
};
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

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
    // Phones: characters get one instanced "blob" shadow each instead of rendering into the shadow map
    // (that pass cost a second draw call per character); buildings and trees keep real shadows.
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
      clearTimeout(this.contextTimer);
      this.contextTimer = setTimeout(() => {
        if (this.contextLost && window.__showError) window.__showError('The graphics context was lost and did not come back. A reload fixes it.');
      }, 6000);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      clearTimeout(this.contextTimer);
      this.resize();
      if (!this.over && !this.won && !this.offer && !this.infoOpen && !this.settingsOpen) this.unpause();
      this.hud.toast('Graphics restored.', 2000);
    });
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
    clearHealthBars();
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
    // world roads/bridges are scene-level: reset them
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
    this.hud.set(this.coinsCarried, 1, 0, null, `0/${CFG.finale.level}`, this.res, 0, 1, 1, 0);
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
    this.reset();
    this.running = true;
    this.watchRender();
    this.hud.hideStart();
    this.hud.hideGameOver();
    this.hud.hideVictory();
    this.hud.hidePause();
    this.hud.toast('The Queen has been taken! Follow the pink arrow and free her.', 3600);
    audio.init();
  }

  resume() {
    this.hud.hideVictory();
    this.running = true;
  }

  pause(silent = false) {
    if (!this.running || this.over || this.won) return;
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
    this.hud.hidePause();
    this.hud.hideInfo();
    this.infoOpen = false;
  }

  // The info screen: pauses the game and explains the next Keep level, the pads on offer and the enemy ranks.
  showInfo() {
    if (this.over || this.won || this.infoOpen || this.offer) return;  // #25: never cover a pending choice
    if (this.paused) this.hud.hidePause();
    else this.pause(true);
    this.infoOpen = true;
    this.hud.showInfo(this.infoData());
  }
  hideInfo() {
    if (!this.infoOpen) return;
    this.infoOpen = false;
    this.unpause();
  }

  // #23: the settings sheet. It holds what the sound, pause and info buttons used to do, and it
  // pauses while it is open, the same way the info screen does.
  showSettings() {
    if (this.over || this.won || this.settingsOpen || this.offer) return;
    this.settingsOpen = true;
    this.settingsPaused = this.running;
    if (this.settingsPaused) this.pause(true);
    this.hud.showSettings();
  }
  hideSettings(keepPaused = false) {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.hud.hideSettings();
    const wasPaused = this.settingsPaused;
    this.settingsPaused = false;
    if (wasPaused && !keepPaused) this.unpause();
  }
  toggleSettings() {
    if (this.settingsOpen) this.hideSettings();
    else this.showSettings();
  }
  toggleInfo() {
    if (this.infoOpen) this.hideInfo();
    else this.showInfo();
  }

  padDesc(def) {
    if (def.desc) return def.desc;
    if (def.feed) return 'Pour in wood, stone and straw to raise the Keep a level.';
    if (def.tower && def.crew) return 'Archers climb the tower and shoot from it (they leave your army).';
    if (def.towerUp) return 'More crew slots, sharper and longer-ranged arrows.';
    if (def.repair) return 'Rebuild this broken wall section.';
    if (def.repairKeep) return 'Repair the Keep so the Queen can shelter in it again.';
    return '';
  }

  infoData() {
    const L = this.baseLevel;
    const N = L + 1;
    const req = this.levelReq();
    const feed = this.pads.find((p) => p.def.feed);
    const need = req ? Object.entries(req).map(([type, n]) => {
      const row = feed && feed.res.find((r) => r.type === type);
      return { type, need: n - (row ? row.paid : 0), have: this.res[type] };
    }).filter((n) => n.need > 0) : [];
    const unlocks = [];
    if (!this.keep) unlocks.push('Build the Royal Keep first: feeding it levels up everything else.');
    else if (req) {
      if (CFG.base.unlocks[N]) unlocks.push(CFG.base.unlocks[N]);
      unlocks.push(`Army limit: ${CFG.base.archers[N]} archers, ${CFG.base.swordsmen[N]} swordsmen`);
      unlocks.push(`Arrow speed ${CFG.base.fireRate(N).toFixed(1)}x for archers, towers and the King`);
      if (CFG.base.wallAt.includes(N)) unlocks.push(`All walls rebuilt in ${CFG.wallLevels[CFG.base.wallAt.indexOf(N)].name.toLowerCase()}`);
      if (CFG.coins.valueAt.includes(N)) unlocks.push(`Every coin is worth ${CFG.coins.value[CFG.coins.valueAt.indexOf(N)]} score instead of ${this.coinValue()}`);
      const rank = CFG.ranks.find((r) => r.fromLevel === N);
      if (rank) unlocks.push(`${rank.name}s start raiding: tougher, but they drop more coins`);
      for (const def of PADS) if (def.minLevel === N) unlocks.push(`${def.label} pad appears`);
      if (N === CFG.finale.level) unlocks.push('The march on the raider camp opens: kill the Warlord to end the war');
      unlocks.push(`Keep health ${CFG.keep.hp + (N - 1) * CFG.keep.hpPerLevel}`);
    }
    const costText = (def, pad) => def.crew ? `${def.crew} archers` : def.feed ? 'materials' : `${pad ? pad.cost - pad.paid : this.padCost(def)} coins${def.res ? ' + ' + Object.entries(def.res).map(([t, n]) => `${n} ${t}`).join(', ') : ''}`;
    const padsNow = this.pads.map((p) => ({ icon: p.def.icon, label: p.def.label, cost: costText(p.def, p), desc: this.padDesc(p.def), locked: this.padLocked(p.def), kind: this.padKind(p.def) }));
    const later = PADS.filter((def) => def.minLevel && def.minLevel > L && def.tier <= this.tier + 1 && !this.built[def.id])
      .map((def) => ({ icon: def.icon, label: def.label, at: def.minLevel, desc: this.padDesc(def), kind: this.padKind(def) }));
    const ranks = CFG.ranks.map((r) => ({ name: r.name, color: `#${r.tunic.toString(16).padStart(6, '0')}`, at: r.fromLevel, active: r.fromLevel <= L }));
    const towers = Object.values(this.towers).map((t) => t.level);
    const army = {
      archers: this.unitCount('archer'), archerCap: this.unitCap('archer'), swords: this.unitCount('swordsman'), swordCap: this.unitCap('swordsman'),
      towers, fire: this.fireMul(), wall: CFG.wallLevels[this.wallLevel].name, keepHp: this.keep ? `${Math.round(this.keep.hp)} / ${this.keep.maxHp}` : null,
      training: this.archerPower,
    };
    const taken = UPGRADES.filter((u) => this.taken[u.id]).map((u) => ({ icon: u.icon, name: u.name, desc: u.desc, n: this.taken[u.id] }));
    const vi = CFG.coins.valueAt.reduce((acc, lv, i) => (this.baseLevel >= lv ? i : acc), 0);
    const coins = { count: this.coinsCarried, value: this.coinValue(), nextValue: CFG.coins.value[vi + 1] || null, nextAt: CFG.coins.valueAt[vi + 1] || null };
    return { taken, level: L, max: CFG.base.maxLevel, hasKeep: !!this.keep, queenCaptive: !!this.queen.captive, need, unlocks, padsNow, later, ranks, army, coins, wave: this.wave, finaleOpen: this.finaleOpen, finaleLevel: CFG.finale.level };
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
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('crownrush-best', String(this.best));
    }
    this.saveScore();
    audio.build();
    setTimeout(() => this.hud.showVictory(this.coinsEarned, this.units.length - 1 + this.turrets.length, this.score), 600);
  }

  // ---------- fog of war ----------
  buildFog() {
    const size = CFG.world.size;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 14;
    plane.renderOrder = 5;
    plane.frustumCulled = false;
    this.scene.add(plane);
    this.fog = { canvas, tex, plane, scale: 256 / size, half: size / 2 };
    // minimap terrain layer, drawn once
    const mm = document.createElement('canvas');
    mm.width = 256;
    mm.height = 256;
    const ctx = mm.getContext('2d');
    ctx.fillStyle = '#4aa566';
    ctx.fillRect(0, 0, 256, 256);
    const sc = this.fog.scale;
    const tx = (x) => (x + this.fog.half) * sc;
    const tz = (z) => (z + this.fog.half) * sc;
    ctx.fillStyle = '#5b5f63';
    ctx.fillRect(0, 0, tx(CFG.cliffs.x), tz(CFG.cliffs.z));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const poly = (pts, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tz(p.z)) : ctx.moveTo(tx(p.x), tz(p.z))));
      ctx.stroke();
    };
    poly(this.world.river.samples, '#d8cc9d', 12);
    poly(this.world.river.samples, '#3d9bd4', 9);
    this.fog.terrain = mm;
    this.fog.poly = poly;
    this.fog.tx = tx;
    this.fog.tz = tz;
  }

  resetFog() {
    const { canvas } = this.fog;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(38, 42, 48, 0.92)';
    ctx.fillRect(0, 0, 256, 256);
    const b = TIERS[0].bounds;
    this.revealFog((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 26);
  }

  revealFog(x, z, r) {
    const { canvas, tex, tx, tz, scale } = this.fog;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    const cx = tx(x);
    const cz = tz(z);
    const rr = r * scale;
    const g = ctx.createRadialGradient(cx, cz, rr * 0.55, cx, cz, rr);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cz, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  }

  updateFog(dt) {
    this.fogTimer -= dt;
    if (this.fogTimer > 0) return;
    this.fogTimer = 0.25;
    const kp = this.king.mesh.position;
    if (kp.distanceTo(this.lastFogPos) > 1.5) {
      this.lastFogPos.copy(kp);
      this.revealFog(kp.x, kp.z, 17);
    }
    this.minimapTimer -= 0.25;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.5;
      this.drawMinimap();
    }
  }

  drawMinimap(force) {
    const el = this.hud.minimap;
    if (!el) return;
    const big = el.classList.contains('big');
    const ctx = el.getContext('2d');
    const { canvas: fogCanvas, terrain, tx, tz, poly } = this.fog;
    ctx.clearRect(0, 0, 160, 160);
    ctx.save();
    ctx.scale(160 / 256, 160 / 256);
    ctx.drawImage(terrain, 0, 0);
    for (const r of this.world.roads) if (r.revealed) poly(r.samples, '#d9b27c', 4);
    // village
    const b = TIERS[this.tier].bounds;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(tx(b.x0), tz(b.z0), (b.x1 - b.x0) * this.fog.scale, (b.z1 - b.z0) * this.fog.scale);
    // resource nodes
    for (const n of this.nodes) {
      ctx.fillStyle = n.type === 'wood' ? '#8a5a2b' : n.type === 'stone' ? '#c7d2dc' : '#e0c25a';
      ctx.beginPath();
      ctx.arc(tx(n.pos.x), tz(n.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // fog mask on top
    ctx.drawImage(fogCanvas, 0, 0);
    // enemies (only in explored areas read from the fog alpha)
    const fctx = fogCanvas.getContext('2d');
    ctx.fillStyle = '#e8342a';
    for (const e of this.enemies) {
      const px = tx(e.mesh.position.x);
      const pz = tz(e.mesh.position.z);
      const a = fctx.getImageData(Math.max(0, Math.min(255, px | 0)), Math.max(0, Math.min(255, pz | 0)), 1, 1).data[3];
      if (a > 200) continue;
      ctx.beginPath();
      ctx.arc(px, pz, e.type === 'boss' ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // king
    const kp = this.king.mesh.position;
    ctx.fillStyle = '#f5b800';
    ctx.strokeStyle = '#1b1b24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx(kp.x), tz(kp.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  raiseAlarm(text) {
    this.alarmT = 3.5;
    this.alarmText = text;
    if (this.time - this.lastAlarm > 6) {
      this.lastAlarm = this.time;
      audio.alarm();
    }
  }

  addScore(n) {
    this.score += Math.round(n);
  }

  saveScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('crownrush-best-score', String(this.bestScore));
    }
  }

  mountKing() {
    if (this.mounted) return;
    this.mounted = true;
    const k = this.king;
    const old = k.mesh;
    const rig = makeRigged('king_mounted');
    k.mesh = rig ? rig.mesh : makeKing();
    k.mesh.position.copy(old.position);
    k.mesh.rotation.copy(old.rotation);
    k.mesh.scale.setScalar(k.scale);
    this.root.remove(old);
    k.bar = makeHealthBar(1.6, true);
    k.bar.position.y = 3.2;
    k.mesh.add(k.bar);
    this.root.add(k.mesh);
    this.popIn(k.mesh, 0, k.scale);
    this.spawnFx(k.mesh.position.x, k.mesh.position.z, 0xffd166);
  }

  // ---------- spawning ----------
  spawnUnit(type, x, z, veteran = false) {
    let mesh;
    let stats;
    if (type === 'king') {
      const rig = makeRigged(this.mounted ? 'king_mounted' : 'king');
      mesh = rig ? rig.mesh : this.mounted ? makeKing() : makeKingFoot();
      stats = CFG.king;
    } else if (type === 'queen' && makeRigged('queen')) {
      mesh = makeRigged('queen').mesh;
      stats = CFG.queen;
    } else if (type === 'archer') {
      const hair = HAIR[Math.floor(Math.random() * HAIR.length)];
      const rig = makeRigged('archer', veteran ? [['hair', hair], ['white', 0xf2d16b], ['blue', 0x8d1d22]] : [['hair', hair]]);
      mesh = rig ? rig.mesh : makeArcher();
      stats = this.archerStats(veteran);
    } else if (type === 'queen') {
      mesh = makeQueen();
      stats = CFG.queen;
    } else {
      const rig = makeRigged('swordsman');
      mesh = rig ? rig.mesh : makeSwordsman();
      stats = CFG.swordsman;
    }
    mesh.position.set(x, 0, z);
    const bar = makeHealthBar(type === 'king' || type === 'queen' ? 1.6 : 1.0, true);
    bar.position.y = type === 'king' ? (this.mounted ? 3.2 : 2.4) : type === 'queen' ? 2.5 : 1.8;
    mesh.add(bar);
    this.root.add(mesh);
    const royal = type === 'king' || type === 'queen';
    const u = {
      type, mesh, bar, hp: stats.hp, maxHp: stats.hp, stats, cooldown: rand(0, 0.5), lastHit: -99,
      melee: type === 'swordsman', vel: new V3(), popT: royal ? 0 : 0.5, assign: null, veteran,
      scale: royal ? 1.15 : mesh.userData.rig ? 1.05 : 1.2,
    };
    mesh.scale.setScalar(u.popT ? 0.01 : u.scale);
    if (u.popT && this.running) this.spawnFx(x, z);
    this.units.push(u);
    return u;
  }

  // archer stats grow with "Train Archers"; veterans (platinum recruits) are half again as strong
  archerStats(veteran = false) {
    const v = veteran ? 1.5 : 1;
    return {
      ...CFG.archer,
      damage: CFG.archer.damage * (1 + this.archerPower * CFG.archerTraining.damage) * v * this.mods.archerDamage,
      hp: CFG.archer.hp * (1 + this.archerPower * CFG.archerTraining.hp) * v * this.mods.archerHp,
      range: CFG.archer.range * this.mods.archerRange,
    };
  }

  // which parts of each enemy rig wear the rank colours
  rankTints(type, rk) {
    // the thief always wears the same green, whatever rank it came in with: it is a role, not a rank
    if (type === 'thief') return [['red', 0x2f8f5b], ['darkRed', 0x1c5638], ['hair', 0x23281f], ['boot', 0x1c5638]];
    if (type === 'sapper') return [['red', 0x3a3a40], ['darkRed', rk.tunic], ['hair', 0x23281f]];
    if (type === 'archer') return [['white', rk.tunic], ['blue', rk.trim], ['hair', 0x23281f], ['leather', rk.dark]];
    if (type === 'shield') return [['ink', 0x7d848e], ['darkRed', rk.tunic], ['steelDark', rk.trim]];
    if (type === 'knight') return [['red', rk.tunic], ['darkRed', rk.trim]];
    if (type === 'elite') return [['darkRed', rk.tunic], ['ink', rk.dark]];
    if (type === 'brute') return [['darkRed', rk.tunic], ['leather', rk.trim]];
    return [['bone', rk.light], ['boneDark', rk.trim]];
  }

  spawnEnemy(type, x, z, rank = 0) {
    const stats = CFG.enemy[type];
    rank = Math.min(rank, CFG.ranks.length - 1);
    const rk = CFG.ranks[rank];
    const rigName = { knight: 'raider', thief: 'raider', sapper: 'raider', archer: 'archer', shield: 'elite' }[type] || type;
    const rig = makeRigged(rigName, this.rankTints(type, rk));
    const mesh = rig ? rig.mesh : type === 'boss' ? makeBoss() : type === 'brute' ? makeBrute() : type === 'elite' ? makeElite() : makeKnight();
    mesh.position.set(x, 0, z);
    const w = Math.max(1, this.wave);
    const L = Math.max(0, this.baseLevel - 1);
    // waves, rank and Keep level all scale the enemy
    const hpMul = (1 + CFG.waves.hpGrowthPerWave * (w - 1)) * rk.hp * (1 + CFG.base.enemyHpPerLevel * L);
    const dmgMul = (1 + CFG.waves.dmgGrowthPerWave * (w - 1)) * rk.damage * (1 + CFG.base.enemyDmgPerLevel * L);
    if (!this.rankSeen[rank] && this.running) {
      this.rankSeen[rank] = true;
      if (rank > 0) this.hud.toast(`${rk.name}s have arrived! Watch for their colours.`, 2800);
    }
    const intro = { sapper: 'Sappers! They ignore your army and go for the walls.', archer: 'Enemy archers! They outrange a new tower and shoot the crews: go out and get them, or build the towers up.', shield: 'Shieldbearers! Arrows bounce off the front. Hit them from behind.' }[type];
    if (intro && !this.typeSeen[type] && this.running) {
      this.typeSeen[type] = true;
      this.hud.toast(intro, 3600);
    }
    const bar = makeHealthBar(type === 'boss' ? 3.4 : type === 'brute' ? 1.5 : 1.0);
    bar.position.y = type === 'boss' ? 5.0 : type === 'brute' ? 2.7 : 1.9;
    mesh.add(bar);
    this.root.add(mesh);
    const e = {
      type, rank, mesh, bar, stats, hp: stats.hp * hpMul, maxHp: stats.hp * hpMul, damage: stats.damage * dmgMul,
      cooldown: rand(0.2, 0.8), target: null, retarget: 0, flash: 0, radius: stats.radius,
      scale: rig ? { knight: 1.0, elite: 1.1, brute: 1.35, boss: 2.4, thief: 0.92, sapper: 0.95, archer: 1.0, shield: 1.15 }[type] : type === 'boss' ? 1 : 1.15,
    };
    mesh.scale.setScalar(e.scale);
    // the bar is a child of the scaled mesh: undo that scale so bar size/height are in world units
    bar.scale.x /= e.scale;
    bar.scale.y /= e.scale;
    bar.position.y /= e.scale;
    this.enemies.push(e);
    return e;
  }

  startWave() {
    if (this.wave > 0) {
      const soldiers = this.units.length - 2 + this.turrets.length;
      this.addScore(CFG.score.waveClear * this.wave + soldiers * CFG.score.soldierPerWave);
    }
    this.wave++;
    const w = this.wave;
    const list = [];
    const L = this.baseLevel;
    const knights = 4 + Math.round(w * 2.2);
    for (let i = 0; i < knights; i++) list.push('knight');
    const brutes = L >= CFG.waves.bruteAt.level || w >= CFG.waves.bruteAt.wave;
    const elites = L >= CFG.waves.eliteAt.level || w >= CFG.waves.eliteAt.wave;
    if (brutes && w >= 3) for (let i = 0; i < Math.floor((w - 2) * 1.3); i++) list.push('brute');
    if (elites && w >= 8) for (let i = 0; i < Math.floor((w - 6) * 0.8); i++) list.push('elite');
    // the rule-breakers, each once the Keep has reached its level
    if (L >= CFG.enemy.sapper.fromLevel && w >= 3) for (let i = 0; i < Math.min(4, 1 + Math.floor((w - 3) * 0.5)); i++) list.push('sapper');
    if (L >= CFG.enemy.archer.fromLevel && w >= 4) for (let i = 0; i < Math.min(5, 1 + Math.floor((w - 4) * 0.4)); i++) list.push('archer');
    if (L >= CFG.enemy.shield.fromLevel && w >= 5) for (let i = 0; i < Math.min(5, 1 + Math.floor((w - 5) * 0.4)); i++) list.push('shield');
    if (w % CFG.waves.bossEvery === 0) for (let i = 0; i < Math.floor(w / 10) + 1; i++) list.push('boss');
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    // ranks follow the Keep: mostly the current rank, some lower ranks, and at most a couple of
    // scouts from the next rank up so the player can see what is coming
    let top = 0;
    CFG.ranks.forEach((r, i) => { if (r.fromLevel <= L) top = i; });
    const scoutSet = new Set();
    if (top < CFG.ranks.length - 1 && w >= CFG.waves.scouts.from) {
      const n = randInt(0, CFG.waves.scouts.max);
      const candidates = list.map((t, i) => i).filter((i) => list[i] !== 'boss');
      for (let k = 0; k < n && candidates.length; k++) scoutSet.add(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
    }
    const pickRank = (type, i) => {
      if (scoutSet.has(i)) return top + 1;
      if (type === 'boss' || top === 0) return top;
      const roll = Math.random();
      if (top >= 2 && roll < 0.1) return top - 2;
      if (roll < 0.4) return top - 1;
      return top;
    };
    // raiding parties come from 1-3 directions
    const dirs = 1 + Math.min(2, Math.floor(w / 3));
    const b = TIERS[this.tier].bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    // the first party always comes from the camp's direction; later ones flank
    const angles = [Math.atan2(CFG.finale.pos[1] - cz, CFG.finale.pos[0] - cx)];
    for (let i = 1; i < dirs; i++) angles.push(rand(0, Math.PI * 2));
    const halfDiag = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const half = CFG.world.size / 2 - 8;
    list.forEach((type, i) => {
      let a = angles[i % dirs] + rand(-0.5, 0.5);
      let r = halfDiag + rand(10, 16);
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = THREE.MathUtils.clamp(cx + Math.cos(a) * r, -half, half);
        z = THREE.MathUtils.clamp(cz + Math.sin(a) * r, -half, half);
        const onCliff = x < CFG.cliffs.x && z < CFG.cliffs.z;
        const inside = x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3;
        const ri = this.world.riverInfo(x, z);
        const inRiver = ri.dist < this.world.river.halfWidth + 3;
        // without a bridge, raiders can only come from the village's side of the river
        const wrongSide = this.world.bridges.length === 0 && ri.side !== this.homeSide;
        if (!onCliff && !inside && !inRiver && !wrongSide) break;
        a += 0.9;
        r += 3;
      }
      this.spawnQueue.push({ type, x, z, t: i * CFG.waves.stagger, rank: pickRank(type, i) });
    });
    this.thiefTimer = CFG.waves.thieves.every * 0.6;   // #35: first chance shortly into the night
    const boss = list.includes('boss');
    audio.wave(boss);
    this.hud.toast(boss ? `Blood moon! Night ${w} brings a boss.` : `Night ${w} falls.`, 2200);
  }

  // ---------- pads ----------
  refreshPads() {
    let added = 0;
    for (const def of [...PADS, ...this.dynamicPads]) {
      if (this.pads.find((p) => p.def === def)) continue;
      if (!def.repeatable && this.built[def.id]) continue;
      if (def.tier !== undefined && def.tier > this.tier) continue;
      const okReq = (def.requires || []).every((id) => this.built[id]);
      if (!okReq) continue;
      if (def.minLevel && this.baseLevel < def.minLevel) continue;
      if (def.maxBuys && (this.buyCount[def.id] || 0) >= def.maxBuys) continue;
      this.addPad(def);
      added++;
    }
    if (added && this.running) audio.unlock();
  }

  padCost(def) {
    if (def.crew) return def.crew;
    const n = this.buyCount[def.id] || 0;
    return def.cost + (def.growth || 0) * n;
  }

  addPad(def) {
    const { mesh, canvas, tex } = makePad();
    mesh.position.set(def.pos[0], 0.03, def.pos[1]);
    mesh.scale.setScalar(0.01);
    this.root.add(mesh);
    const pad = { def, mesh, canvas, tex, cost: this.padCost(def), paid: 0, ghosts: [], res: Object.entries((def.feed ? this.levelReq() : def.res) || {}).map(([type, need]) => ({ type, need, paid: 0 })) };
    // ghost previews: units on the pad, structures where they'd be built, wall outlines along the edge
    if (def.units) {
      for (let i = 0; i < def.units.count; i++) {
        const r = makeRigged(def.units.type === 'archer' ? 'archer' : 'swordsman');
        const g = ghostify(r ? r.mesh : def.units.type === 'archer' ? makeArcher() : makeSwordsman());
        g.position.set(def.pos[0] - 0.6 + i * 0.7 + (i > 1 ? -1.1 : 0), 0, def.pos[1] + (i > 1 ? 0.8 : 0));
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.crew) {
      for (const [x, z, y] of this.crewSpots(def)) {
        const g = ghostify((makeRigged('archer') || { mesh: makeArcher() }).mesh);
        g.position.set(x, y, z);
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.wall) {
      for (const sec of this.wallSections(def.wall.tier, def.wall.side)) {
        const g = ghostify(this.makeWallMesh(sec));
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.repair) {
      const g = ghostify(this.makeWallMesh(def.repair));
      this.root.add(g);
      pad.ghosts.push(g);
    } else if (def.repairKeep) {
      const g = ghostify(makeKeep());
      g.position.set(this.keep.x, 0, this.keep.z);
      this.root.add(g);
      pad.ghosts.push(g);
    } else if (def.bridge) {
      const c = this.world.crossingFor(def.bridge);
      if (c) {
        const g = ghostify(makeBridge(this.world.river.halfWidth * 2 + 5, 4.8));
        g.position.set(c.x, 0, c.z);
        g.rotation.y = Math.atan2(c.dx, c.dz);
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.effect === 'horse') {
      const g = ghostify(makeKing());
      g.position.set(def.pos[0], 0, def.pos[1] - 1.2);
      this.root.add(g);
      pad.ghosts.push(g);
    } else if (def.structure && def.buildAt) {
      const g = ghostify(this.makeStructureMesh(def.structure));
      g.position.set(def.buildAt[0], 0, def.buildAt[1]);
      this.root.add(g);
      pad.ghosts.push(g);
    }
    // a fresh feed pad pauses for a beat so each level-up is a visible moment, not a blur
    if (def.feed) pad.resTimer = 0.9;
    this.drawPad(pad);
    this.pads.push(pad);
  }

  padKind(def) {
    if (def.structure || def.wall || def.bridge || def.effect === 'expand' || def.repair || def.repairKeep) return 'build';
    if (def.units) return 'recruit';
    if (def.crew) return 'crew';
    if (def.exchange) return 'trade';
    if (def.feed) return 'feed';
    return 'upgrade';
  }

  // the level a marker shows, where the thing it points at has one
  padSub(def) {
    if (def.feed) return `Level ${this.baseLevel}`;
    if (def.towerUp && this.towers[def.towerUp]) return `Level ${this.towers[def.towerUp].level}`;
    if (def.tower && this.towers[def.tower]) return `Level ${this.towers[def.tower].level}`;
    if (def.maxBuys) return `${this.buyCount[def.id] || 0} of ${def.maxBuys}`;
    return null;
  }

  // the short name on the floor: the full label is often too long to read at a glance
  padName(def) {
    if (def.feed) return 'Royal Keep';
    if (def.towerUp) return 'Watchtower';
    return def.label;
  }

  drawPad(pad) {
    const style = PAD_STYLE[this.padKind(pad.def)];
    const total = pad.cost + pad.res.reduce((a, r) => a + r.need, 0);
    const paidAll = pad.paid + pad.res.reduce((a, r) => a + r.paid, 0);
    drawPad(pad.canvas, pad.tex, {
      icon: pad.def.icon, label: this.padName(pad.def), paid: total ? paidAll / total : 0,
      active: !!pad.active,
      sub: this.padSub(pad.def),
      locked: pad.locked === 'rescue' ? 'Free the Queen' : pad.locked ? `Keep Lv ${pad.locked}` : null,
      lockIcon: pad.locked === 'rescue' ? 'tiara' : 'keep',
      shape: style.shape, rim: style.rim,
    });
  }

  // the material the village is built in right now: follows the walls
  materialName() {
    return CFG.wallLevels[this.wallLevel].name.toLowerCase();
  }

  makeStructureMesh(kind, level = 1) {
    const m = this.materialName();
    if (kind === 'bank') return makeBank();
    if (kind === 'hut') return makeHut(m);
    if (kind === 'keep') return makeKeep(m);
    if (kind === 'tower') return makeTower(level, m);
    if (kind === 'barracks') return makeBarracks(m);
    return new THREE.Group();
  }

  // #3: the Keep crossed a material boundary, so every standing building is rebuilt in the new one.
  // Towers keep their level and crew, the Keep keeps its health bar and the Queen on the balcony.
  rebuildStructures() {
    this.structures.forEach((s, i) => {
      if (s.kind === 'keep' && (!this.keep || this.keep.state !== 'built')) return;
      const t = s.kind === 'tower' ? this.towers[s.id] : null;
      const m = this.makeStructureMesh(s.kind, t ? t.level : 1);
      m.position.copy(s.mesh.position);
      m.rotation.copy(s.mesh.rotation);
      if (s.kind === 'keep' && this.keep) {
        this.keep.mesh.remove(this.keep.bar);
        m.add(this.keep.bar);
        this.keep.mesh = m;
        if (this.queen.inKeep) {
          const b = m.userData.balcony;
          this.queen.mesh.position.set(this.keep.x + b.x, b.y, this.keep.z + b.z);
        }
      }
      if (t) t.mesh = m;
      this.root.remove(s.mesh);
      this.root.add(m);
      this.popIn(m, i * 0.08);
      s.mesh = m;
    });
    if (this.structures.length) this.hud.toast(`The village is rebuilt in ${this.materialName()}.`, 2600);
  }

  // where a crew pad sends its archers: gate posts, or the next free spots around a tower top
  crewSpots(def) {
    if (def.spots) return def.spots.map((s) => [s[0], s[1], def.posts ? CFG.gatePost.height + 0.08 : s[2] || 0]);
    const t = this.towers[def.tower];
    if (!t) return [];
    const spots = [];
    for (let i = 0; i < def.crew; i++) {
      const a = (t.crew + i) * ((Math.PI * 2) / 7) + 0.5;
      spots.push([t.x + Math.cos(a) * 0.75, t.z + Math.sin(a) * 0.75, t.top]);
    }
    return spots;
  }

  // A tower's pad cycles: build -> man it -> upgrade -> man the new slots -> upgrade ... (3 levels)
  queueTowerPad(id, kind) {
    const t = this.towers[id];
    const lv = CFG.tower.levels[t.level - 1];
    if (kind === 'crew') {
      const add = lv.slots + this.mods.towerSlots - t.crew;
      if (add <= 0) return this.queueTowerPad(id, 'up');
      this.dynamicPads.push({ id: `crew-${id}-${t.level}`, pos: t.pos, crew: add, icon: 'archer', label: 'Man the Tower', tower: id, toast: 'Tower manned!' });
    } else if (t.level < CFG.tower.levels.length) {
      const up = CFG.tower.upgrade[t.level - 1];
      const next = CFG.tower.levels[t.level];
      this.dynamicPads.push({ id: `up-${id}-${t.level + 1}`, pos: t.pos, cost: up.cost, coin: up.coin, icon: 'tower', label: `Tower Level ${t.level + 1}`, towerUp: id, toast: `Watchtower level ${t.level + 1}: ${next.slots} crew, sharper arrows.` });
    }
    this.refreshPads();
  }

  completePad(pad) {
    const def = pad.def;
    this.built[def.id] = true;
    this.buyCount[def.id] = (this.buyCount[def.id] || 0) + 1;
    for (const g of pad.ghosts) this.root.remove(g);
    pad.ghosts = [];

    if (def.units) {
      const n = def.units.count + this.mods.recruitBonus;
      for (let i = 0; i < n; i++) {
        this.spawnUnit(def.units.type, def.pos[0] + rand(-0.8, 0.8), def.pos[1] + rand(-0.8, 0.8), !!def.units.veteran);
      }
    }
    if (def.effect === 'archerPower') {
      this.archerPower++;
      for (const u of this.units) {
        if (u.type !== 'archer') continue;
        const st = this.archerStats(u.veteran);
        u.hp = Math.min(st.hp, u.hp + (st.hp - u.maxHp));
        u.maxHp = st.hp;
        u.stats = st;
      }
    }
    if (def.crew && def.tower) {
      this.towers[def.tower].crew += def.crew;
      this.queueTowerPad(def.tower, 'up');
    }
    if (def.towerUp) {
      const t = this.towers[def.towerUp];
      t.level++;
      this.root.remove(t.mesh);
      t.mesh = makeTower(t.level, this.materialName());
      t.mesh.position.set(t.x, 0, t.z);
      const rec = this.structures.find((s) => s.id === def.towerUp);
      if (rec) rec.mesh = t.mesh;
      this.popIn(t.mesh);
      this.root.add(t.mesh);
      this.queueTowerPad(def.towerUp, 'crew');
    }
    if (def.posts) {
      for (const [x, z] of def.spots) {
        const m = makeGatePost();
        m.position.set(x, 0, z);
        this.popIn(m);
        this.root.add(m);
      }
    }
    if (def.structure) this.buildStructure(def);
    if (def.wall) this.buildWall(def.wall.tier, def.wall.side);
    if (def.repair) this.restoreWall(def.repair);
    if (def.repairKeep) this.restoreKeep();
    if (def.effect === 'damage') this.damageMul *= 1.4;
    if (def.effect === 'kinghp') {
      this.king.maxHp += 80;
      this.king.hp = this.king.maxHp;
    }
    if (def.effect === 'wallLevel') this.upgradeWalls();
    if (def.feed) this.levelUp();
    if (def.effect === 'expand') this.expand();
    if (def.effect === 'horse') this.mountKing();
    if (def.bridge) {
      const m = this.world.buildBridge(def.bridge);
      if (m) this.popIn(m);
    }
    if (def.wall) {
      // roads grow out of the gates as the walls go up
      if (def.wall.tier === 0) {
        this.world.revealRoad('south');
        this.world.revealRoad('east');
      }
      if (def.wall.side === 'west') this.world.revealRoad('west');
      if (def.wall.side === 'north') this.world.revealRoad('north');
    }
    if (!def.crew) this.addScore(pad.cost * CFG.score.buildPerCoin + pad.res.reduce((a, r) => a + r.need, 0) * CFG.score.buildPerMaterial);
    audio.build();
    if (def.toast) this.hud.toast(def.toast);

    const again = def.repeatable && !(def.maxBuys && this.buyCount[def.id] >= def.maxBuys) && !(def.feed && !this.levelReq());
    if (again) {
      this.root.remove(pad.mesh);
      this.pads.splice(this.pads.indexOf(pad), 1);
      this.addPad(def);
    } else {
      this.root.remove(pad.mesh);
      this.pads.splice(this.pads.indexOf(pad), 1);
      const di = this.dynamicPads.indexOf(def);
      if (di >= 0) this.dynamicPads.splice(di, 1);
    }
    this.refreshPads();
  }

  buildStructure(def) {
    const kind = def.structure;
    const m = this.makeStructureMesh(kind);
    m.position.set(def.buildAt[0], 0, def.buildAt[1]);
    this.popIn(m);
    this.root.add(m);
    if (kind !== 'bank') this.structures.push({ kind, id: def.id, mesh: m });
    if (kind === 'tower') {
      this.towers[def.id] = { id: def.id, x: def.buildAt[0], z: def.buildAt[1], top: m.userData.top, level: 1, mesh: m, crew: 0, pos: def.pos };
      this.queueTowerPad(def.id, 'crew');
    }
    if (m.userData.chimney) {
      const c = m.userData.chimney;
      this.world.addSmoker(def.buildAt[0] + c.x, c.y, def.buildAt[1] + c.z);
    }
    if (kind === 'keep') {
      this.keep = { isKeep: true, x: def.buildAt[0], z: def.buildAt[1], mesh: m, state: 'built', hp: 0, maxHp: 0, radius: CFG.keep.radius, level: this.wallLevel };
      this.keep.maxHp = this.keep.hp = this.keepHp();
      this.keep.bar = makeHealthBar(3.0);
      this.keep.bar.position.y = 4.4;
      m.add(this.keep.bar);
      this.queenEnterKeep();
      this.baseLevel = Math.max(1, this.baseLevel);
      this.addFeedPad();
    }
  }

  keepHp() {
    // a flat climb per level, plus a real step each time the walls change material
    const tiers = CFG.base.wallAt.filter((lv) => lv <= this.baseLevel).length - 1;
    return CFG.keep.hp + Math.max(0, this.baseLevel - 1) * CFG.keep.hpPerLevel + Math.max(0, tiers) * CFG.keep.materialBonus;
  }

  // ---------- the Keep as the base: feed it materials to level up ----------
  levelReq() {
    return CFG.base.levels[this.baseLevel] || null;
  }

  addFeedPad() {
    // #34: rubble takes no materials. Without this the repair was optional: you could keep levelling
    // a Keep that was not standing, and losing it cost nothing.
    if (!this.keep || this.keep.state !== 'built' || !this.levelReq() || this.feedDef) return;
    // the feed pad sits at the Keep's front door
    this.feedDef = { id: 'feed', pos: [this.keep.x, this.keep.z + 3.7], cost: 0, icon: 'keep', label: 'Feed the Keep', repeatable: true, feed: true };
    this.dynamicPads.push(this.feedDef);
    this.refreshPads();
  }

  levelUp() {
    this.baseLevel = Math.min(CFG.base.maxLevel, this.baseLevel + 1);
    const L = this.baseLevel;
    // walls follow the Keep: wood -> brick -> stone -> iron at the levels in CFG.base.wallAt
    const target = CFG.base.wallAt.filter((lv) => lv <= L).length - 1;
    while (this.wallLevel < target) this.upgradeWalls();
    if (this.keep && this.keep.state === 'built') {
      this.keep.maxHp = this.keepHp();
      this.keep.hp = this.keep.maxHp;
      setHealthBar(this.keep.bar, 1);
    }
    this.revealNodes();
    const newRank = CFG.ranks.find((r) => r.fromLevel === L);
    const coinNote = CFG.coins.valueAt.includes(L) && L > 0 ? `each coin is now worth ${this.coinValue()} score` : null;
    const notes = [CFG.base.unlocks[L], coinNote, newRank ? `${newRank.name}s now join the raids` : null, `${CFG.base.archers[L]} archers`, `${CFG.base.swordsmen[L]} swordsmen`, `arrows ${this.fireMul().toFixed(1)}x`].filter(Boolean);
    this.hud.toast(`Keep level ${L}! ${notes.join(' · ')}`, 4200);
    // #29: a playtester never worked out that raising the Keep is what opens new materials, so the
    // level that opens one says so on its own, after the rest of the level's news.
    const opened = Object.keys(CFG.base.materialAt).find((m) => CFG.base.materialAt[m] === L);
    if (opened) this.hud.toast(`${opened[0].toUpperCase() + opened.slice(1)} can now be gathered: look for new nodes out in the world.`, 5200);
    this.spawnFx(this.keep.x, this.keep.z, 0xffd23d);
    this.addScore(CFG.score.levelUp * L);
    audio.unlock();
    // #13: every level lets the player keep one of three upgrades. Levels can chain when the King
    // arrives with a big stockpile, so offers queue and are presented one at a time.
    this.offerQueue++;
    if (!this.offer) this.showOffer();
    if (!this.levelReq() && this.feedDef) this.feedDef = null;
  }

  // Present one upgrade choice. Pauses the game; `takeUpgrade` resumes it or shows the next in the queue.
  showOffer() {
    const list = this.over || this.won || this.offerQueue <= 0 ? [] : pickOffer(this.taken);
    // #25: nothing left to offer, which is where a long game ends up once every upgrade is maxed.
    // This used to return with the game still paused and no panel on screen: a permanent freeze.
    if (!list.length) {
      this.offerQueue = 0;
      this.offer = null;
      this.hud.hideOffer();
      this.endOfferPause();
      return;
    }
    this.offer = list;
    this.offerPaused = true;
    this.pause(true);
    this.hud.hideInfo();
    this.infoOpen = false;
    this.hud.showOffer(list, this.baseLevel, this.offerQueue);
  }

  takeUpgrade(id) {
    const u = (this.offer || []).find((x) => x.id === id);
    if (!u) return;
    this.taken[u.id] = (this.taken[u.id] || 0) + 1;
    u.apply(this);
    this.applyMods();
    this.offer = null;
    this.offerQueue = Math.max(0, this.offerQueue - 1);
    this.hud.hideOffer();
    audio.build();
    this.hud.toast(`${u.name}: ${u.desc}`, 3000);
    if (this.offerQueue > 0) this.showOffer();
    else this.endOfferPause();
  }

  // Give back the pause an offer took, and only that one: a pause the player asked for stays.
  endOfferPause() {
    if (!this.offerPaused || this.over || this.won) return;
    this.offerPaused = false;
    this.paused = false;
    this.running = true;
    this.hud.hidePause();
  }

  // Push modifier changes into things that were already built or recruited.
  applyMods() {
    for (const u of this.units) {
      if (u.type !== 'archer') continue;
      const st = this.archerStats(u.veteran);
      const frac = u.hp / u.maxHp;
      u.stats = st;
      u.maxHp = st.hp;
      u.hp = st.hp * frac;
      setHealthBar(u.bar, frac);
    }
    for (const w of this.walls) {
      if (w.state !== 'built') continue;
      const frac = w.hp / w.maxHp;
      w.maxHp = this.wallHp(w, w.level);
      w.hp = w.maxHp * frac;
      setHealthBar(w.bar, frac);
    }
    for (const id of Object.keys(this.towers)) {
      const t = this.towers[id];
      if (CFG.tower.levels[t.level - 1].slots + this.mods.towerSlots > t.crew) this.queueTowerPad(id, 'crew');
    }
  }

  // #18: the warhorn. Rallies the army to the King and drives them for a few seconds, and the blast
  // shoves nearby raiders back and stuns them. One button, used well or badly.
  useHorn() {
    if (!this.running || this.hornT > 0 || this.queen.captive && !this.queen.taken) return;
    const H = CFG.horn;
    this.hornT = H.cooldown;
    this.rallyUntil = this.time + H.duration;
    const kp = this.king.mesh.position;
    audio.horn();
    this.spawnFx(kp.x, kp.z, 0xffd23d);
    this.burstFx(tmp.copy(kp).setY(1.4), '#ffe27a', 7, 0.5);
    for (const e of this.enemies) {
      if (e.captor) continue;
      const p = e.mesh.position;
      tmp2.subVectors(p, kp).setY(0);
      const d = tmp2.length();
      if (d > H.radius) continue;
      const push = H.push * (1 - d / H.radius) * (e.type === 'boss' ? 0.3 : 1);
      p.addScaledVector(tmp2.normalize(), push);
      e.cooldown = Math.max(e.cooldown, H.stun);
      e.retarget = Math.max(e.retarget, H.stun);
      e.flash = Math.max(e.flash || 0, 0.25);
    }
    for (const u of this.units) if (!u.assign && u !== this.king && u !== this.queen) u.rallyT = this.time;
    this.hud.toast('To me!', 900);
  }

  rallied() {
    return this.time < this.rallyUntil;
  }

  // archery speed grows with the Keep (archers, towers and the King's own bow)
  fireMul() {
    return CFG.base.fireRate(this.baseLevel);
  }

  unitCount(type) {
    let n = 0;
    for (const u of this.units) if (u.type === type) n++;
    if (type === 'archer') n += this.turrets.length;
    return n;
  }

  unitCap(type) {
    const t = type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    return t[Math.min(this.baseLevel, t.length - 1)] + (type === 'archer' ? this.mods.towerSlots * 4 : 0);
  }

  // Keep level needed before a recruit pad can add its units; null if it can recruit now
  padLocked(def) {
    if (!def.units) return null;
    const wanted = this.unitCount(def.units.type) + def.units.count;
    if (wanted <= this.unitCap(def.units.type)) return null;
    const t = def.units.type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    for (let l = 0; l < t.length; l++) if (t[l] >= wanted) return l;
    return CFG.base.maxLevel;
  }

  queenEnterKeep() {
    const q = this.queen;
    if (!this.keep || this.keep.state !== 'built' || q.inKeep || q.captive) return;
    q.inKeep = true;
    q.hp = q.maxHp;
    setHealthBar(q.bar, 1);
    const b = this.keep.mesh.userData.balcony;
    q.mesh.position.set(this.keep.x + b.x, b.y, this.keep.z + b.z);
    q.mesh.rotation.y = 0;
    q.moving = false;
    this.hud.toast('The Queen is inside the keep.', 1500);
  }

  queenLeaveKeep() {
    const q = this.queen;
    if (!q.inKeep) return;
    q.inKeep = false;
    q.mesh.position.set(this.keep.x + 2.6, 0, this.keep.z + 2.6);
  }

  breakKeep() {
    const k = this.keep;
    const sheltering = this.queen.inKeep && !this.queen.captive;
    k.state = 'broken';
    this.queenLeaveKeep();
    this.root.remove(k.mesh);
    k.mesh = makeRubble(3.4, 2);
    k.mesh.position.set(k.x, 0, k.z);
    this.root.add(k.mesh);
    audio.wave(true);
    // #33: the walls coming down around her is how she is taken. Standing her outside the rubble as
    // an ordinary unit made the worst moment in the game a non-event; the raiders carry her off
    // instead, and the chase that already existed starts from here.
    if (sheltering) {
      this.hud.toast('The keep has fallen and the Queen is taken! Cut off the escort!', 3600);
      this.captureQueen();
    } else {
      this.hud.toast('The keep has fallen! Protect the Queen!', 2600);
    }
    this.dropFeedPad();
    this.dynamicPads.push({ id: `repair-keep-${this.time.toFixed(0)}`, pos: [k.x - 3.2, k.z + 3.2], cost: 20, res: { stone: 10 }, icon: 'hammer', label: 'Repair Keep', repairKeep: true });
    this.refreshPads();
  }

  // A stopped game with nothing on screen to explain it is the worst bug to report and the easiest
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

  // #34: the feed pad goes with the Keep and comes back with it
  dropFeedPad() {
    if (!this.feedDef) return;
    const i = this.dynamicPads.indexOf(this.feedDef);
    if (i >= 0) this.dynamicPads.splice(i, 1);
    this.feedDef = null;
    this.refreshPads();
  }

  restoreKeep() {
    const k = this.keep;
    this.root.remove(k.mesh);
    k.mesh = makeKeep(this.materialName());
    { const rec = this.structures.find((x) => x.kind === 'keep'); if (rec) rec.mesh = k.mesh; }
    k.mesh.position.set(k.x, 0, k.z);
    k.state = 'built';
    k.level = this.wallLevel;
    k.maxHp = k.hp = this.keepHp();
    k.bar = makeHealthBar(3.0);
    k.bar.position.y = 4.4;
    k.mesh.add(k.bar);
    this.popIn(k.mesh);
    this.root.add(k.mesh);
    this.queenEnterKeep();
    this.addFeedPad();          // #34: standing again, so it can be fed again
    this.hud.toast('The Keep stands again. You can raise its level once more.', 3200);
  }

  // Solid keep footprint: pushes a position out of the box. Returns the keep when it blocked.
  collideKeep(p, r) {
    const k = this.keep;
    if (!k || k.state !== 'built') return null;
    const h = CFG.keep.half + r;
    const dx = p.x - k.x;
    const dz = p.z - k.z;
    if (Math.abs(dx) >= h || Math.abs(dz) >= h) return null;
    if (h - Math.abs(dx) < h - Math.abs(dz)) p.x = k.x + Math.sign(dx || 1) * h;
    else p.z = k.z + Math.sign(dz || 1) * h;
    return k;
  }

  expand() {
    if (this.tier < TIERS.length - 1) this.tier++;
  }

  addTurret(x, z, y, towerId = null) {
    const rig = makeRigged('archer', [['hair', HAIR[Math.floor(Math.random() * HAIR.length)]]]);
    const mesh = rig ? rig.mesh : makeArcher();
    mesh.position.set(x, y, z);
    this.popIn(mesh, 0, rig ? 1.05 : 1.2);
    this.root.add(mesh);
    this.spawnFx(x, z, 0xff9a2e, y);
    const bar = makeHealthBar(1.0);
    bar.position.y = 1.8 / (rig ? 1.05 : 1.2);
    bar.scale.multiplyScalar(1 / (rig ? 1.05 : 1.2));
    mesh.add(bar);
    this.turrets.push({ isTurret: true, mesh, bar, hp: CFG.turret.hp, maxHp: CFG.turret.hp, cooldown: rand(0, 0.7), pos: new V3(x, y + 0.9, z), tower: towerId, radius: 0.5 });
  }

  popIn(obj, delay = 0, baseScale = 1) {
    obj.scale.setScalar(0.01);
    obj.visible = delay <= 0;
    obj.userData.popT = 0.45 + delay;
    obj.userData.baseScale = baseScale;
    this.popping.push(obj);
  }

  // ---------- walls ----------
  // Generate the sections along one side (or all sides) of a tier's rectangle, gates included.
  wallSections(tier, side) {
    const t = TIERS[tier];
    const b = t.bounds;
    const sides = side === 'all' ? ['south', 'east', 'north', 'west'] : [side];
    const out = [];
    for (const name of sides) {
      const alongX = name === 'south' || name === 'north';
      const fixed = name === 'south' ? b.z1 : name === 'north' ? b.z0 : name === 'east' ? b.x1 : b.x0;
      const from = alongX ? b.x0 : b.z0;
      const to = alongX ? b.x1 : b.z1;
      const gate = t.gates[name];
      const spans = gate ? [[from, gate[0]], [gate[1], to]] : [[from, to]];
      let idx = 0;
      const push = (a0, a1, isGate) => {
        out.push({ id: `${tier}-${name}-${idx++}`, tier, wall: name, alongX, a0, a1, fixed, gate: isGate });
      };
      spans.forEach((span, si) => {
        const len = span[1] - span[0];
        const n = Math.max(1, Math.round(len / t.sectionLen));
        for (let i = 0; i < n; i++) push(span[0] + (len * i) / n, span[0] + (len * (i + 1)) / n, false);
        if (gate && si === 0) push(gate[0], gate[1], true);
      });
    }
    return out;
  }

  makeWallMesh(sec, level = this.wallLevel) {
    const len = sec.a1 - sec.a0;
    const m = sec.gate ? makeGate(level) : makeWallSegment(len, level);
    const mid = (sec.a0 + sec.a1) / 2;
    if (sec.alongX) m.position.set(mid, 0, sec.fixed);
    else {
      m.position.set(sec.fixed, 0, mid);
      m.rotation.y = Math.PI / 2;
    }
    return m;
  }

  wallHp(sec, level = this.wallLevel) {
    const lv = CFG.wallLevels[level];
    return (sec.gate ? lv.gateHp : lv.hp) * this.mods.wallHp;
  }

  // (re)build a section's mesh at a given material level with full HP
  rebuildWall(w, level, delay = 0) {
    if (w.mesh) this.root.remove(w.mesh);
    w.state = 'built';
    w.level = level;
    w.maxHp = w.hp = this.wallHp(w, level);
    w.mesh = this.makeWallMesh(w, level);
    w.bar = makeHealthBar(2.2);
    w.bar.position.y = 2.2;
    w.mesh.add(w.bar);
    this.popIn(w.mesh, delay);
    this.root.add(w.mesh);
  }

  buildWall(tier, side) {
    this.wallSections(tier, side).forEach((sec, i) => {
      const w = { ...sec, hp: 0, maxHp: 0, state: 'built', mesh: null, bar: null, level: this.wallLevel };
      this.rebuildWall(w, this.wallLevel, i * 0.07);
      this.walls.push(w);
    });
    // once a full outer ring stands, the old inner wall is torn down for materials
    const sides = ['south', 'east', 'north', 'west'];
    const complete = sides.every((s) => this.walls.some((w) => w.tier === tier && w.wall === s));
    if (complete && this.walls.some((w) => w.tier < tier)) {
      for (const w of this.walls.filter((w) => w.tier < tier)) this.root.remove(w.mesh);
      this.walls = this.walls.filter((w) => w.tier >= tier);
      for (const def of [...this.dynamicPads]) if (def.repair && def.repair.tier < tier) this.removePadDef(def);
      this.hud.toast('Old inner wall torn down.', 1600);
    }
  }

  removePadDef(def) {
    const pad = this.pads.find((p) => p.def === def);
    if (pad) {
      for (const g of pad.ghosts) this.root.remove(g);
      this.root.remove(pad.mesh);
      this.pads.splice(this.pads.indexOf(pad), 1);
    }
    const di = this.dynamicPads.indexOf(def);
    if (di >= 0) this.dynamicPads.splice(di, 1);
  }

  upgradeWalls() {
    this.wallLevel = Math.min(CFG.wallLevels.length - 1, this.wallLevel + 1);
    for (const def of [...this.dynamicPads]) if (def.repair) this.removePadDef(def);
    this.walls.forEach((w, i) => this.rebuildWall(w, this.wallLevel, i * 0.035));
    this.rebuildStructures();
    if (this.keep && this.keep.state === 'built') {
      this.keep.level = this.wallLevel;
      this.keep.maxHp = this.keep.hp = this.keepHp();
      setHealthBar(this.keep.bar, 1);
    }
  }

  // Push a position out of any intact wall. Friendly units may pass through gates. Returns the wall hit.
  collideWalls(p, r, friendly) {
    let hit = null;
    for (const w of this.walls) {
      if (w.state !== 'built') continue;
      if (friendly && w.gate) continue;
      const thick = r + 0.25;
      if (w.alongX) {
        if (p.x < w.a0 - r || p.x > w.a1 + r) continue;
        const d = p.z - w.fixed;
        if (Math.abs(d) < thick) {
          p.z = w.fixed + Math.sign(d || 1) * thick;
          hit = w;
        }
      } else {
        if (p.z < w.a0 - r || p.z > w.a1 + r) continue;
        const d = p.x - w.fixed;
        if (Math.abs(d) < thick) {
          p.x = w.fixed + Math.sign(d || 1) * thick;
          hit = w;
        }
      }
    }
    return hit;
  }

  // Keep a position out of the river unless it is on a bridge. Returns true when it was pushed.
  collideRiver(p, r) {
    const info = this.world.riverInfo(p.x, p.z);
    const limit = this.world.river.halfWidth + 0.6 + r;
    if (info.dist >= limit) return false;
    if (this.world.nearBridge(p.x, p.z)) return false;
    let dx = p.x - info.qx;
    let dz = p.z - info.qz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    p.x = info.qx + dx * limit;
    p.z = info.qz + dz * limit;
    return true;
  }

  // Waypoint for an enemy whose target is across the river: the near end of the closest bridge,
  // then the far end once it gets there.
  bridgeWaypoint(e, targetPos) {
    const p = e.mesh.position;
    const mySide = this.world.riverInfo(p.x, p.z).side;
    const theirSide = this.world.riverInfo(targetPos.x, targetPos.z).side;
    if (mySide === theirSide || this.world.nearBridge(p.x, p.z)) {
      if (e.crossing && this.world.nearBridge(p.x, p.z)) {
        // keep heading to the far end until we are actually across
        const b = e.crossing;
        const far = this.world.riverInfo(b.x + b.dx * 9, b.z + b.dz * 9).side === theirSide ? 1 : -1;
        return { x: b.x + b.dx * 9 * far, z: b.z + b.dz * 9 * far };
      }
      e.crossing = null;
      return null;
    }
    let best = null;
    let bd = Infinity;
    for (const b of this.world.bridges) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) return null;
    e.crossing = best;
    // the near end sits inside the bridge zone so arriving there flips us to the far end
    const near = this.world.riverInfo(best.x + best.dx * 9, best.z + best.dz * 9).side === mySide ? 1 : -1;
    return { x: best.x + best.dx * 5 * near, z: best.z + best.dz * 5 * near };
  }

  damageWall(w, dmg, attacker = null) {
    if (w.state !== 'built') return;
    if (attacker && this.mods.wallThorns) this.damageEnemy(attacker, this.mods.wallThorns, attacker.mesh.position);
    if (w.isKeep) {
      this.raiseAlarm('The Keep is under attack!');
      w.hp -= dmg;
      setHealthBar(w.bar, Math.max(0, w.hp / w.maxHp));
      w.mesh.position.y = 0.06;
      audio.wallHit();
      if (w.hp <= 0) this.breakKeep(w);
      return;
    }
    w.hp -= dmg;
    setHealthBar(w.bar, Math.max(0, w.hp / w.maxHp));
    w.mesh.position.y = 0.06;
    audio.wallHit();
    if (w.hp > 0) return;
    if (w.level > 0) {
      // a battered wall degrades to the previous material before it finally falls
      const from = CFG.wallLevels[w.level].name;
      this.rebuildWall(w, w.level - 1);
      const to = CFG.wallLevels[w.level].name;
      this.hud.toast(`${from} ${w.gate ? 'gate' : 'wall'} battered down to ${to.toLowerCase()}!`, 1500);
    } else this.breakWall(w);
  }

  breakWall(w) {
    w.state = 'broken';
    this.root.remove(w.mesh);
    w.mesh = makeRubble(w.a1 - w.a0, w.level);
    const mid = (w.a0 + w.a1) / 2;
    if (w.alongX) w.mesh.position.set(mid, 0, w.fixed);
    else {
      w.mesh.position.set(w.fixed, 0, mid);
      w.mesh.rotation.y = Math.PI / 2;
    }
    this.root.add(w.mesh);
    this.hud.toast(w.gate ? 'The gate is down!' : 'A wall section has fallen!', 1600);
    // a repair pad appears just inside the gap
    const b = TIERS[w.tier].bounds;
    const c = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    const inward = w.alongX ? Math.sign(c[1] - w.fixed) : Math.sign(c[0] - w.fixed);
    const pos = w.alongX ? [mid, w.fixed + inward * 2.6] : [w.fixed + inward * 2.6, mid];
    this.dynamicPads.push({
      id: `repair-${w.id}-${this.time.toFixed(0)}`, pos, cost: CFG.wallLevels[this.wallLevel].repair, icon: 'hammer',
      label: w.gate ? 'Repair Gate' : 'Repair Wall', repair: w,
    });
    this.refreshPads();
  }

  restoreWall(w) {
    this.rebuildWall(w, this.wallLevel);
  }

  // ---------- combat helpers ----------
  fireArrow(from, target, damage, hostile = false) {
    const mesh = makeArrow();
    mesh.position.copy(from);
    this.root.add(mesh);
    this.arrows.push({ mesh, target, damage, life: CFG.arrow.life, dir: new V3(), from: from.clone(), hostile });
  }

  damageTurret(t, dmg) {
    t.hp -= dmg;
    setHealthBar(t.bar, Math.max(0, t.hp / t.maxHp));
    if (t.hp > 0) return;
    this.turrets.splice(this.turrets.indexOf(t), 1);
    this.dying.push({ mesh: t.mesh, t: 0.4 });
    if (t.tower && this.towers[t.tower]) {
      const tw = this.towers[t.tower];
      tw.crew = Math.max(0, tw.crew - 1);
      // reopen the crew pad once, so the slot can be refilled
      const open = [...this.dynamicPads, ...this.pads.map((p) => p.def)].some((d) => d.tower === t.tower && d.crew);
      if (!open) this.queueTowerPad(t.tower, 'crew');
    }
    this.raiseAlarm('A tower crew has fallen!');
  }

  damageEnemy(e, dmg, hitPos, from = null) {
    if (e.hp <= 0) return;
    if (e.type === 'shield' && from) {
      // facing is rotation.y; a hit from within 60 degrees of it is taken on the shield
      const fx = Math.sin(e.mesh.rotation.y);
      const fz = Math.cos(e.mesh.rotation.y);
      const dx = from.x - e.mesh.position.x;
      const dz = from.z - e.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / len > 0.5) {
        dmg *= e.stats.front;
        this.popup('blocked', hitPos, '#b9c2cc', 1.1, e, 0);
      }
    }
    e.hp -= dmg;
    e.flash = 0.12;
    audio.hit();
    this.burstFx(hitPos, '#dff4ff', 0.9, 0.18);
    setHealthBar(e.bar, Math.max(0, e.hp / e.maxHp));
    this.popup(`-${Math.round(dmg)}`, hitPos, e.type === 'boss' ? '#ffffff' : '#ffe27a', e.type === 'boss' ? 2.6 : 1.4, e, dmg);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    if (e.escort && this.queen.taken && !this.enemies.some((x) => x.escort)) this.rescueTaken();
    e.bar.visible = false;
    this.dying.push({ mesh: e.mesh, t: 0.5 });
    tmp.copy(e.mesh.position).setY(e.type === 'boss' ? 2.5 : 1.0);
    this.burstFx(tmp, '#ffffff', e.type === 'boss' ? 6 : 2.6, 0.38);
    if (e.carrying) {
      // everything it stole spills back out
      for (let i = 0; i < e.carrying; i++) this.dropCoin(e.mesh.position);
      this.hud.toast(`Thief cut down! ${e.carrying} coins recovered.`, 2400);
    }
    const rk = CFG.ranks[Math.min(e.rank || 0, CFG.ranks.length - 1)];
    const mult = e.type === 'boss' ? 4 : e.type === 'brute' || e.type === 'elite' || e.type === 'shield' ? 2 : 1;
    const n = randInt(rk.coins[0], rk.coins[1]) * mult + this.mods.coinBonus;
    for (let i = 0; i < n; i++) this.dropCoin(e.mesh.position);
    audio.enemyDie();
    this.addScore(CFG.score.kill[e.type] || 10);
    if (e.chief) {
      this.addScore(CFG.score.finale);
      this.victory();
    } else if (e.type === 'boss') this.hud.toast('Boss defeated!', 1800);
  }

  dropCoin(pos, tier = this.coinTier()) {
    const c = makeCoin(tier);
    c.position.copy(pos);
    c.position.y = 0.6;
    this.root.add(c);
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4.5);
    this.coins.push({ mesh: c, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(4, 7), state: 'drop', t: 0, tier });
  }


  // give each archer its own hair colour (the rig ships one)
  tintHair(mesh) {
    const colors = [0x5a3416, 0x2a1e16, 0x8a5a2b, 0x1c1c22, 0x6b3f1d];
    const c = colors[Math.floor(Math.random() * colors.length)];
    if (mesh.userData.rig && mesh.userData.rig.tint) {
      mesh.userData.rig.tint('hair', c);
      return mesh;
    }
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, i) => {
        if (m.name === 'hair') {
          const clone = m.clone();
          clone.color.setHex(c);
          if (Array.isArray(o.material)) o.material[i] = clone;
          else o.material = clone;
        }
      });
    });
    return mesh;
  }

  // one-shot attack: swing the rig's Attack clip, or nod the code model's body
  attackAnim(ent) {
    const rig = ent.mesh.userData.rig;
    if (rig) {
      rig.play('Attack', true);
      ent.rigOnce = this.time + 0.6;
    } else if (ent.mesh.userData.body) ent.mesh.userData.body.rotation.x = 0.6;
  }

  // fiery ring and glowing column when a unit appears
  spawnFx(x, z, color = 0xff9a2e, y = 0) {
    const g = makeSpawnFx(color);
    g.position.set(x, y, z);
    this.root.add(g);
    this.fx.push({ kind: 'spawn', mesh: g, t: 0, life: 1.1 });
  }

  // #10: the rescue gets hearts rather than the generic spawn flourish every purchase uses
  heartFx(pos, n = 10, spread = 1.1) {
    for (let i = 0; i < n; i++) {
      const s = makeHeart();
      s.position.copy(pos);
      s.position.x += rand(-spread, spread);
      s.position.z += rand(-spread, spread);
      s.position.y += rand(0.2, 1.2);
      const size = rand(0.5, 0.95);
      s.scale.setScalar(size);
      this.root.add(s);
      this.fx.push({ kind: 'heart', mesh: s, t: 0, life: rand(1.1, 1.9), size, vy: rand(1.5, 2.8), vx: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), sway: rand(0, 6.3) });
    }
  }

  burstFx(pos, color, size, life) {
    const s = makeBurst(color);
    s.position.copy(pos);
    s.scale.setScalar(size * 0.4);
    this.root.add(s);
    this.fx.push({ kind: 'burst', mesh: s, t: 0, life, size });
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      if (f.kind === 'spawn') {
        const { ring, ring2, column, glow, sparks } = f.mesh.userData;
        ring.scale.setScalar(0.4 + p * 1.8);
        ring.material.opacity = 0.95 * (1 - p);
        ring2.scale.setScalar(0.2 + p * 1.1);
        ring2.material.opacity = 0.8 * (1 - p);
        column.scale.set(1 - p * 0.5, 0.2 + Math.sin(p * Math.PI) * 0.9 + 0.1, 1 - p * 0.5);
        column.material.opacity = 0.55 * (1 - p * p);
        glow.material.opacity = 0.45 * (1 - p);
        for (const sp of sparks) {
          sp.position.x += sp.userData.vx * dt;
          sp.position.z += sp.userData.vz * dt;
          sp.position.y += sp.userData.vy * dt;
          sp.userData.vy -= 4 * dt;
          sp.material.opacity = 1 - p;
        }
      } else if (f.kind === 'heart') {
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.x += (f.vx + Math.sin(f.sway + f.t * 3) * 0.5) * dt;
        f.mesh.position.z += f.vz * dt;
        f.vy *= 1 - dt * 0.7;
        f.mesh.scale.setScalar(f.size * (0.4 + Math.min(1, p * 4) * 0.6) * (1 + p * 0.25));
        f.mesh.material.opacity = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
      } else {
        f.mesh.scale.setScalar(f.size * (0.4 + p * 0.8));
        f.mesh.material.opacity = 1 - p * p;
      }
      if (p >= 1) {
        this.root.remove(f.mesh);
        this.fx.splice(i, 1);
      }
    }
  }

  // Damage numbers. Hits on the same target within a quarter second merge into one bigger number:
  // a crowd of archers no longer spawns dozens of sprites a second.
  popup(text, pos, color, scale = 1.4, owner = null, value = 0) {
    if (owner) {
      const p = this.popups.find((q) => q.owner === owner && q.t > 0.45);
      if (p) {
        p.value += value;
        const s = makePopup(`-${Math.round(p.value)}`, color);
        s.position.copy(p.mesh.position);
        s.scale.copy(p.mesh.scale);
        this.root.remove(p.mesh);
        p.mesh.material.dispose();
        this.root.add(s);
        p.mesh = s;
        p.t = Math.max(p.t, 0.6);
        return;
      }
    }
    const s = makePopup(text, color);
    s.position.copy(pos);
    s.position.y += 1.6;
    s.scale.set(scale, scale / 2, 1);
    this.root.add(s);
    this.popups.push({ mesh: s, t: 0.7, owner, value });
  }

  // Free GPU resources of a character that left the scene (health-bar texture, skeleton bone texture).
  disposeEntity(mesh) {
    const rig = mesh.userData.rig;
    if (rig) {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(mesh);
    }
    mesh.traverse((o) => {
      if (o.isHealthBar) disposeHealthBar(o);
      else if (o.isSkinnedMesh) o.skeleton.dispose();
    });
  }

  damageUnit(u, dmg) {
    if (u.hp <= 0) return;
    if (u.inKeep || u.captive) return;
    u.hp -= dmg;
    u.lastHit = this.time;
    if (u.type === 'king' || u.type === 'queen') audio.hurt();
    if (u.type === 'queen') this.raiseAlarm('The Queen is under attack!');
    setHealthBar(u.bar, Math.max(0, u.hp / u.maxHp));
    if (u.hp <= 0) {
      if (u.type === 'queen') return this.captureQueen();
      if (u.type === 'king') {
        this.gameOver(u.type);
        return;
      }
      this.units.splice(this.units.indexOf(u), 1);
      u.bar.visible = false;
      this.dying.push({ mesh: u.mesh, t: 0.4 });
    }
  }

  nearestEnemy(pos, range, skip = null) {
    let best = null;
    let bd = range * range;
    for (const e of this.enemies) {
      if (e === skip || e.captor) continue;
      const d = pos.distanceToSquared(e.mesh.position);
      const r = d - e.radius * e.radius * 2;
      if (r < bd) {
        bd = r;
        best = e;
      }
    }
    return best;
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    this.watchStuck(dt);
    if (this.running) {
      this.updatePlayer(dt);
      this.updateArmy(dt);
      this.updateTurrets(dt);
      this.updateEnemies(dt);
      this.updateArrows(dt);
      this.updateCoins(dt);
      this.updatePads(dt);
      this.updateWaves(dt);
      this.updateFog(dt);
      this.updateChips(dt);
      const army = this.units.filter((u) => u !== this.king && u !== this.queen && !u.assign).length;
      const between = this.activeEnemies().length === 0 && this.spawnQueue.length === 0 && !this.queen.captive;
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
      this.hud.setMaterials(Object.keys(CFG.base.materialAt).filter((m) => this.baseLevel >= CFG.base.materialAt[m]).concat('straw'));
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army, between ? this.waveTimer : null, this.finaleOpen ? 'camp' : `${this.baseLevel}/${CFG.finale.level}`, this.res, this.score, this.king.hp / this.king.maxHp, this.queen.hp / this.queen.maxHp, this.baseLevel);
      this.updateIndicators(dt);
    }
    this.world.focus.copy(this.king.mesh.position);
    this.world.update(dt);
    this.updateDaylight(dt);
    // characters far from the King (at or beyond the screen edge) animate at half rate
    const kp = this.king.mesh.position;
    this.animFrame = (this.animFrame || 0) + 1;
    let idx = 0;
    for (const ent of [...this.units, ...this.enemies, ...this.turrets]) {
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
    this.updateFx(dt);
    this.updateEffects(dt);
    this.updateStack(dt);
    this.updateBlobs();
    this.updateCamera(dt);
    this.bars.update();
    if (!this.contextLost) {
      this.renderer.render(this.scene, this.camera);
      this.frames = (this.frames || 0) + 1;
    }
  }

  updatePlayer(dt) {
    const k = this.king;
    const inp = this.input.read();
    const speed = (this.mounted ? k.stats.speed : k.stats.footSpeed) * this.mods.kingSpeed;
    k.vel.set(inp.x * speed, 0, inp.z * speed);
    if (k.mesh.userData.body && k.mesh.userData.body.rotation.x > 0) k.mesh.userData.body.rotation.x = Math.max(0, k.mesh.userData.body.rotation.x - dt * 3);
    const p = k.mesh.position;
    p.x += k.vel.x * dt;
    p.z += k.vel.z * dt;
    const half = CFG.world.size / 2 - 3;
    p.x = THREE.MathUtils.clamp(p.x, -half, half);
    p.z = THREE.MathUtils.clamp(p.z, -half, half);
    // keep the king off the cliffs
    if (p.x < CFG.cliffs.x && p.z < CFG.cliffs.z) {
      if (CFG.cliffs.x - p.x < CFG.cliffs.z - p.z) p.x = CFG.cliffs.x;
      else p.z = CFG.cliffs.z;
    }
    this.collideWalls(p, 0.55, true);
    this.collideRiver(p, 0.5);
    this.collideKeep(p, 0.5);
    k.moving = inp.mag > 0.05;
    this.animateWalk(k, inp.mag, dt);
    // king fires his own bow
    k.cooldown -= dt;
    const target = this.nearestEnemy(p, k.stats.range);
    if (target) {
      this.faceTowards(k.mesh, target.mesh.position, dt, 14);
      if (k.cooldown <= 0) {
        k.cooldown = 1 / (k.stats.fireRate * this.fireMul());
        tmp.copy(p).y += 1.6;
        for (let i = 0; i < this.mods.kingArrows; i++) {
          const t2 = i === 0 ? target : this.nearestEnemy(p, k.stats.range, target) || target;
          this.fireArrow(tmp, t2, k.stats.damage * this.damageMul);
        }
        if (k.mesh.userData.rig) {
          k.mesh.userData.rig.play('Attack', true);
          k.rigOnce = this.time + 0.6;
        }
      }
    } else if (inp.mag > 0.05) {
      k.mesh.rotation.y = this.lerpAngle(k.mesh.rotation.y, Math.atan2(inp.x, inp.z), 1 - Math.exp(-dt * 12));
    }
    this.regen(k, dt);
    k.bar.visible = true;
    this.updateMining(dt);
    this.ring.position.set(p.x, 0.04, p.z);
    const followers = this.units.filter((u) => u !== this.king && u !== this.queen && !u.assign).length;
    const rr = 2.4 + Math.sqrt(followers) * 0.45;
    this.ring.scale.setScalar(rr / 2.4);
    this.ringRadius = rr;
  }

  // The King gathers wood, stone and straw by standing next to a node.
  updateMining(dt) {
    const kp = this.king.mesh.position;
    this.mineTimer -= dt;
    for (const n of this.nodes) {
      if (n.stock < n.max) {
        n.regrow += dt;
        if (n.regrow >= CFG.mining.regrow) {
          n.regrow = 0;
          n.stock++;
          this.setNodeLook(n);
        }
      }
    }
    let best = null;
    let bd = CFG.mining.radius + 1.5;
    for (const n of this.nodes) {
      if (!n.open) continue;
      const d = kp.distanceTo(n.pos) - (n.type === 'straw' ? 4 : 0);
      if (d < bd && n.stock > 0) {
        bd = d;
        best = n;
      }
    }
    // highlight ring around the node in range
    if (best) {
      this.nodeRing.visible = true;
      this.nodeRing.position.set(best.pos.x, 0.05, best.pos.z);
      const r = (best.type === 'straw' ? 2.2 : 1) * (1 + Math.sin(this.time * 5) * 0.04);
      this.nodeRing.scale.setScalar(r);
    } else this.nodeRing.visible = false;
    // tool swing animation
    if (this.swing > 0) {
      this.swing -= dt;
      const t = 1 - Math.max(0, this.swing / CFG.mining.tick);
      if (this.tool) this.tool.rotation.x = -1.3 + Math.sin(t * Math.PI) * 2.0;
      if (this.swing <= 0 && this.tool) this.tool.visible = false;
    }
    if (this.mineTimer > 0 || !best) return;
    this.mineTimer = CFG.mining.tick / this.mods.mineSpeed;
    best.stock--;
    this.setNodeLook(best);
    audio.mine(best.type);
    if (this.king.mesh.userData.body) this.king.mesh.userData.body.rotation.x = 0.35;
    else if (this.king.mesh.userData.rig) {
      this.king.mesh.userData.rig.play('Attack', true);
      this.king.rigOnce = this.time + 0.5;
    }
    // tool in hand, matching the material
    if (!this.tool || this.toolType !== best.type || this.tool.parent !== this.king.mesh) {
      if (this.tool && this.tool.parent) this.tool.parent.remove(this.tool);
      this.tool = makeTool(best.type);
      this.toolType = best.type;
      this.tool.position.set(0.42, this.mounted ? 1.5 : 0.62, 0.25);
      this.king.mesh.add(this.tool);
    }
    this.tool.visible = true;
    this.swing = CFG.mining.tick;
    this.faceTowards(this.king.mesh, best.pos, 1, 60);
    // the node shakes and throws chips
    if (best.type !== 'straw') best.shake = 0.3;
    const chipColor = best.type === 'wood' ? 0x9a6a3a : best.type === 'stone' ? 0xa9aeb5 : 0xe0c25a;
    for (let i = 0; i < 5; i++) {
      const ch = new THREE.Mesh(CHIP_GEO, RES_MATS[best.type]);
      ch.position.copy(best.type === 'straw' ? kp : best.pos).setY(0.9);
      ch.position.x += rand(-0.4, 0.4);
      ch.position.z += rand(-0.4, 0.4);
      this.root.add(ch);
      this.chips.push({ mesh: ch, vx: rand(-3, 3), vz: rand(-3, 3), vy: rand(3, 6), t: 0.7, color: chipColor });
    }
    tmp.copy(best.type === 'straw' ? kp : best.pos).setY(1.2);
    this.popup(`+1 ${{ wood: '🪵', stone: '🪨', straw: '🌾', iron: '⛏️', diamond: '💎' }[best.type] || ''}`, tmp, '#ffffff', 1.6);
    const c = makeResourceCube(best.type);
    c.position.copy(best.pos).setY(1.0);
    if (best.type === 'straw') c.position.set(kp.x + rand(-2, 2), 0.6, kp.z + rand(-2, 2));
    this.root.add(c);
    this.coins.push({ mesh: c, state: 'fly', resType: best.type, t: 0, vx: 0, vz: 0, vy: 0 });
  }

  makeNodeMesh(type) {
    if (type === 'wood') return makeLumberTree();
    if (type === 'stone') return makeOreRock();
    if (type === 'iron') return makeIronSeam();
    if (type === 'diamond') return makeGemNode();
    return new THREE.Group();
  }

  // A new material becomes mineable: its nodes appear across the map with a toast saying where.
  revealNodes() {
    const opened = new Set();
    for (const n of this.nodes) {
      if (n.open || this.baseLevel < n.from) continue;
      n.open = true;
      opened.add(n.type);
      if (n.type !== 'straw') {
        this.root.add(n.mesh);
        this.popIn(n.mesh, Math.random() * 0.4);
      }
    }
    for (const type of opened) {
      const where = { stone: 'Stone quarries', iron: 'Iron seams', diamond: 'Diamond in the deep rock' }[type] || cap(type);
      this.hud.toast(`${where} are open. Look for them on the map.`, 3200);
    }
    return opened.size > 0;
  }

  setNodeLook(n) {
    if (n.type === 'straw') return;
    const f = 0.45 + 0.55 * (n.stock / n.max);
    n.mesh.scale.setScalar(f);
  }

  updateChips(dt) {
    for (const n of this.nodes) {
      if (n.shake > 0) {
        n.shake -= dt;
        n.mesh.rotation.z = Math.sin(n.shake * 40) * 0.08 * n.shake;
        if (n.shake <= 0) n.mesh.rotation.z = 0;
      }
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.t -= dt;
      c.vy -= 18 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.position.y = Math.max(0.08, c.mesh.position.y + c.vy * dt);
      c.mesh.rotation.x += dt * 9;
      if (c.t <= 0) {
        this.root.remove(c.mesh);
        this.chips.splice(i, 1);
      }
    }
  }

  // The Queen trails the King until she has a keep to shelter in.
  // Captive Queen: stands still under guard. Captors wake when the King gets close; once they are
  // gone and he reaches her, she is free and follows him from then on.
  // #11: she is held, not parked. She edges away from whichever guard is nearest and they close
  // back in, which reads as a capture from a distance without needing the toast to explain it.
  updateCaptive(dt) {
    const q = this.queen;
    if (q.taken) return this.updateTaken(dt);
    const R = CFG.rescue;
    const p = q.mesh.position;
    const kp = this.king.mesh.position;
    const d = kp.distanceTo(p);
    const captors = this.enemies.filter((e) => e.captor);

    // spotted: the guards turn on him after a beat, and she calls out
    if (d < R.noticeRadius && !this.rescueSpotted) {
      this.rescueSpotted = true;
      this.alertT = R.alert;
      this.queenHop = 1;
      tmp.copy(p).setY(2.5);
      this.heartFx(tmp, 1, 0.05);
      audio.alarm();
    }
    if (this.rescueSpotted && this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) for (const e of captors) e.captor = false;
    }

    // she backs away from the nearest guard, but her pen pulls her back, so she paces
    let near = null;
    let nd = Infinity;
    for (const e of captors) {
      const dd = e.mesh.position.distanceToSquared(p);
      if (dd < nd) {
        nd = dd;
        near = e;
      }
    }
    let moving = 0;
    if (near) {
      tmp2.subVectors(p, near.mesh.position);
      tmp2.y = 0;
      const back = p.distanceTo(this._pen) / R.penRadius;
      tmp2.normalize().addScaledVector(this._penDir.subVectors(this._pen, p).setY(0).normalize(), back * 1.6);
      if (tmp2.lengthSq() > 1e-4) {
        tmp2.normalize().multiplyScalar(R.queenSpeed * dt);
        p.add(tmp2);
        moving = 0.7;
      }
    }
    this.collideRiver(p, 0.3);
    if (this.queenHop > 0) this.queenHop = Math.max(0, this.queenHop - dt * 1.6);
    p.y = this.queenHop > 0 ? Math.sin((1 - this.queenHop) * Math.PI) * 0.45 : 0;
    const look = d < R.noticeRadius ? kp : near ? near.mesh.position : this._pen;
    q.mesh.rotation.y = this.lerpAngle(q.mesh.rotation.y, Math.atan2(look.x - p.x, look.z - p.z), 1 - Math.exp(-dt * 6));
    q.moving = moving > 0;
    this.animateWalk(q, moving, dt);
    q.bar.visible = false;

    if (d < R.freeRadius && captors.length === 0) this.freeQueen();
  }

  // Guards circle their prisoner and close in when she drifts, rather than standing in a triangle.
  updateCaptor(e, dt) {
    const R = CFG.rescue;
    const q = this.queen.mesh.position;
    const p = e.mesh.position;
    if (this.rescueSpotted && this.alertT > 0) {
      // spotted him: turn and square up before the charge
      this.faceTowards(e.mesh, this.king.mesh.position, dt, 6);
      e.moving = false;
      this.animateWalk(e, 0, dt);
      return;
    }
    if (e.orbit === undefined) e.orbit = Math.atan2(p.z - q.z, p.x - q.x);
    e.orbit += dt * 0.32 * (e.orbitDir || 1);
    const ring = 2.3;
    tmp2.set(q.x + Math.cos(e.orbit) * ring - p.x, 0, q.z + Math.sin(e.orbit) * ring - p.z);
    const d = tmp2.length();
    let moving = 0;
    if (d > 0.12) {
      tmp2.normalize().multiplyScalar(Math.min(R.guardSpeed * dt, d));
      p.add(tmp2);
      moving = Math.min(1, d);
    }
    this.collideRiver(p, e.radius);
    this.faceTowards(e.mesh, q, dt, 5);
    e.moving = moving > 0.05;
    this.animateWalk(e, moving, dt);
  }

  freeQueen() {
    const q = this.queen;
    q.captive = false;
    q.hp = q.maxHp;
    setHealthBar(q.bar, 1);
    tmp.copy(q.mesh.position).setY(1.0);
    this.heartFx(tmp, 14, 1.2);
    this.heartTimer = 9;
    audio.unlock();
    this.addScore(CFG.score.rescue);
    // taking her back is what brings the raiders: wind the sun to just before dusk
    this.dayPhase = (CFG.cycle.nightStart - CFG.rescue.firstRaid / CFG.cycle.length + 1) % 1;
    this.duskWarned = false;
    this.hud.toast('The Queen is safe! Get her home before they come for her.', 3400);
    this.raidWarning = this.time + 3.6;
    this.refreshPads();
  }

  updateQueen(dt) {
    const q = this.queen;
    if (!q || q.inKeep) return;
    if (q.captive) return this.updateCaptive(dt);
    const k = this.king.mesh;
    const fx = Math.sin(k.rotation.y);
    const fz = Math.cos(k.rotation.y);
    tmp.set(k.position.x - fx * CFG.queen.follow, 0, k.position.z - fz * CFG.queen.follow);
    const p = q.mesh.position;
    tmp2.subVectors(tmp, p);
    tmp2.y = 0;
    const d = tmp2.length();
    let moving = 0;
    if (d > 0.25) {
      const sp = Math.min(q.stats.speed * (d > 5 ? 1.5 : 1), d / dt);
      tmp2.normalize().multiplyScalar(sp * dt);
      p.add(tmp2);
      moving = Math.min(1, d);
      q.mesh.rotation.y = this.lerpAngle(q.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
    }
    p.y = 0;
    this.collideWalls(p, 0.3, true);
    this.collideRiver(p, 0.3);
    this.collideKeep(p, 0.3);
    if (d > 16) p.set(k.position.x + rand(-1, 1), 0, k.position.z + rand(-1, 1));
    // a heart now and then while she is close and safe, rarely enough to stay charming
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = rand(16, 26);
      if (d < 4 && this.enemies.length === 0 && !this.night) {
        tmp.copy(p).setY(2.3).lerp(tmp2.copy(k.position).setY(2.3), 0.5);
        this.heartFx(tmp, 1, 0.25);
      }
    }
    // passing an intact Keep, she steps inside
    if (this.keep && this.keep.state === 'built' && Math.hypot(p.x - this.keep.x, p.z - this.keep.z) < 3.6) return this.queenEnterKeep();
    q.moving = moving > 0.05;
    this.animateWalk(q, moving, dt);
    this.regen(q, dt);
    q.bar.visible = true;
  }

  updateArmy(dt) {
    const kp = this.king.mesh.position;
    this.updateQueen(dt);
    const followers = this.units.filter((u) => u !== this.king && u !== this.queen && !u.assign);
    followers.forEach((u, i) => {
      u.cooldown -= dt;
      if (u.popT > 0) {
        u.popT -= dt;
        const s = 1 - Math.max(0, u.popT / 0.5);
        u.mesh.scale.setScalar(Math.max(0.01, u.scale * s * (1 + Math.sin(s * Math.PI) * 0.25)));
        if (u.popT <= 0) u.mesh.scale.setScalar(u.scale);
      }
      // formation slot: rings around the king
      const ring = Math.floor(Math.sqrt(i / 6));
      const perRing = 6 + ring * 6;
      const idxInRing = i - ring * ring * 6;
      const ang = (idxInRing / perRing) * Math.PI * 2 + ring * 0.4 + this.time * 0.15;
      const rad = 1.7 + ring * 1.3;
      tmp.set(kp.x + Math.cos(ang) * rad, 0, kp.z + Math.sin(ang) * rad);

      const p = u.mesh.position;
      let target = null;
      if (u.melee) {
        target = this.nearestEnemy(p, u.stats.aggro);
        if (target && target.mesh.position.distanceTo(kp) < u.stats.aggro + rad + 3) {
          tmp.copy(target.mesh.position);
        } else target = null;
      }
      tmp2.subVectors(tmp, p);
      tmp2.y = 0;
      const d = tmp2.length();
      const stopDist = target ? target.radius + 0.6 : 0.15;
      let moving = 0;
      if (d > stopDist) {
        const rally = this.rallied() ? CFG.horn.rallySpeed : 1;
        const sp = Math.min(u.stats.speed * (d > 6 ? 1.6 : 1) * rally, d / dt);
        tmp2.normalize().multiplyScalar(sp * dt);
        p.add(tmp2);
        moving = Math.min(1, d);
        if (!target) u.mesh.rotation.y = this.lerpAngle(u.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
      }
      this.collideWalls(p, 0.3, true);
      this.collideRiver(p, 0.3);
      this.collideKeep(p, 0.3);
      if (d > 14) p.set(kp.x + rand(-1, 1), 0, kp.z + rand(-1, 1));
      u.moving = moving > 0.05;
      this.animateWalk(u, moving, dt);

      // attack
      if (!u.melee) target = this.nearestEnemy(p, u.stats.range);
      if (target) {
        this.faceTowards(u.mesh, target.mesh.position, dt, 12);
        const dist = p.distanceTo(target.mesh.position) - target.radius;
        if (u.cooldown <= 0 && dist <= u.stats.range + 0.3) {
          u.cooldown = 1 / (u.stats.fireRate * this.fireMul());
          if (u.melee) {
            tmp.copy(target.mesh.position);
            tmp.y += 0.3;
            this.damageEnemy(target, u.stats.damage * this.damageMul * (this.rallied() ? CFG.horn.damage : 1), tmp, p);
            this.attackAnim(u);
          } else {
            tmp.copy(p).y += 0.9;
            this.fireArrow(tmp, target, u.stats.damage * this.damageMul * (this.rallied() ? CFG.horn.damage : 1));
            this.attackAnim(u);
          }
        }
      }
      if (u.mesh.userData.body && u.mesh.userData.body.rotation.x > 0) u.mesh.userData.body.rotation.x = Math.max(0, u.mesh.userData.body.rotation.x - dt * 4);
      this.regen(u, dt);
    });

    // archers walking off to man a tower or a gate
    for (const u of this.units.filter((u) => u.assign)) {
      const [x, z, y] = u.assign;
      const p = u.mesh.position;
      tmp2.set(x - p.x, 0, z - p.z);
      const d = tmp2.length();
      if (d < 0.5) {
        this.units.splice(this.units.indexOf(u), 1);
        this.root.remove(u.mesh);
        this.disposeEntity(u.mesh);
        this.addTurret(x, z, y, u.assignTower);
        continue;
      }
      tmp2.normalize().multiplyScalar(Math.min(u.stats.speed * dt, d));
      p.add(tmp2);
      this.collideWalls(p, 0.3, true);
      u.mesh.rotation.y = this.lerpAngle(u.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
      u.moving = true;
      this.animateWalk(u, 1, dt);
    }
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.cooldown -= dt;
      const lv = t.tower && this.towers[t.tower] ? CFG.tower.levels[this.towers[t.tower].level - 1] : CFG.tower.levels[0];
      const target = this.nearestEnemy(t.pos, CFG.tower.range * lv.range * this.mods.towerRange);
      if (target) {
        this.faceTowards(t.mesh, target.mesh.position, dt, 10);
        if (t.cooldown <= 0) {
          t.cooldown = 1 / (CFG.tower.fireRate * this.fireMul());
          this.fireArrow(t.pos, target, CFG.tower.damage * lv.damage * this.damageMul * this.mods.towerDamage);
          this.attackAnim(t);
        }
      }
    }
  }

  // Nearest map edge reachable WITHOUT crossing the river (a runner that had to cross would pin
  // itself against the bank and never leave).
  edgeExit(p) {
    const half = CFG.world.size / 2 - 4;
    const mySide = this.world.riverInfo(p.x, p.z).side;
    const cands = [{ x: half, z: p.z }, { x: -half, z: p.z }, { x: p.x, z: half }, { x: p.x, z: -half }];
    cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return cands.find((c) => this.world.riverInfo(c.x, c.z).side === mySide) || cands[0];
  }

  topRank() {
    let top = 0;
    CFG.ranks.forEach((r, i) => { if (r.fromLevel <= this.baseLevel) top = i; });
    return top;
  }

  // #16: losing the Queen starts a chase, not a lose screen. Raiders pick her up and carry her toward
  // the edge; cut the escort down before they get there and she is back, wounded, and the Keep pays.
  // It can happen once per run. The second time is the end.
  captureQueen() {
    const q = this.queen;
    if (this.recaptures >= CFG.rescue.recaptures) return this.gameOver('queen');
    this.recaptures++;
    q.captive = true;
    q.taken = true;
    q.inKeep = false;
    q.hp = q.maxHp * 0.25;
    q.bar.visible = false;
    const p = q.mesh.position;
    const exit = this.edgeExit(p);
    const rank = this.topRank();
    q.escort = [];
    for (let i = 0; i < CFG.rescue.escort; i++) {
      const e = this.spawnEnemy('knight', p.x + rand(-1.3, 1.3), p.z + rand(-1.3, 1.3), rank);
      e.escort = true;
      e.exit = exit;
      e.maxHp = e.hp = e.maxHp * 1.5;
      q.escort.push(e);
    }
    this.raiseAlarm('The Queen has been taken!');
    this.hud.toast('The Queen has been taken! Cut down her escort before they reach the edge.', 3800);
    audio.wave(true);
  }

  // escorts march for the edge with her; the first one alive is the one carrying her
  updateEscort(e, dt) {
    const p = e.mesh.position;
    const R = CFG.rescue;
    tmp2.set(e.exit.x - p.x, 0, e.exit.z - p.z);
    const d = tmp2.length();
    this.faceTowards(e.mesh, tmp.set(e.exit.x, 0, e.exit.z), dt, 8);
    if (d > 0.1) {
      tmp2.normalize().multiplyScalar(Math.min(R.escortSpeed * dt, d));
      p.add(tmp2);
    }
    this.collideRiver(p, e.radius);
    e.moving = true;
    this.animateWalk(e, 1, dt);
    const half = CFG.world.size / 2 - 4;
    if (Math.abs(p.x) > half - 0.5 || Math.abs(p.z) > half - 0.5) this.gameOver('taken');
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

  // Enemy archer: closes to just inside its range on the nearest soldier or tower crew, then holds and shoots.
  updateEnemyArcher(e, dt) {
    const p = e.mesh.position;
    e.cooldown -= dt;
    e.retarget -= dt;
    if (e.retarget <= 0 || !e.target || e.target.hp <= 0) {
      e.retarget = 0.6;
      let best = null;
      let bd = Infinity;
      for (const u of [...this.units, ...this.turrets]) {
        if (u.inKeep || u.captive) continue;
        const d = p.distanceToSquared(u.isTurret ? u.pos : u.mesh.position);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      e.target = best;
    }
    const t = e.target;
    if (!t) return;
    const tp = t.isTurret ? t.pos : t.mesh.position;
    tmp2.set(tp.x - p.x, 0, tp.z - p.z);
    const d = tmp2.length();
    this.faceTowards(e.mesh, tmp.set(tp.x, 0, tp.z), dt, 8);
    const hold = e.stats.range - 1.5;
    let blocked = null;
    if (d > hold) {
      tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - hold));
      p.add(tmp2);
      blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
      this.collideRiver(p, e.radius);
    }
    e.moving = d > hold && !blocked;
    this.animateWalk(e, e.moving ? 1 : 0, dt);
    if (d <= e.stats.range && e.cooldown <= 0) {
      e.cooldown = 1 / e.stats.attackRate;
      this.attackAnim(e);
      this.fireArrow(tmp.copy(p).setY(1.5), t, e.damage, true);
    } else if (blocked && e.cooldown <= 0) {
      e.cooldown = 1 / e.stats.attackRate;
      this.damageWall(blocked, e.damage, e);
    }
  }

  // enemies out raiding: not the Queen's guards, not the camp's sleeping garrison
  activeEnemies() {
    return this.enemies.filter((e) => !e.captor && !e.camp);
  }

  // #19: the camp wakes when the King comes for it
  updateCampSleeper(e, dt) {
    const F = CFG.finale;
    const kp = this.king.mesh.position;
    if (Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) < F.wakeRadius) {
      for (const x of this.enemies) if (x.camp) {
        x.camp = false;
        x.fromCamp = true;                                   // #28: and this is the post it returns to
        x.post = { x: x.mesh.position.x, z: x.mesh.position.z };
      }
      this.raiseAlarm('The camp is awake!');
      this.hud.toast(this.finaleOpen ? 'The Warlord rises. End this.' : 'You are not ready for this camp. Run!', 3000);
      audio.wave(true);
      return;
    }
    e.moving = false;
    this.animateWalk(e, 0, dt);
  }

  // #28: true while this one is disengaging, so the normal chase is skipped.
  updateCampReturn(e, dt) {
    const F = CFG.finale;
    const kp = this.king.mesh.position;
    const kingFar = Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) > F.leash;
    if (!kingFar && !e.returning) return false;
    if (!e.returning) {
      e.returning = true;
      if (!this.campCalm) {
        this.campCalm = true;
        this.raiseAlarm('');
        this.hud.toast('The camp breaks off the chase and falls back.', 3200);
      }
    }
    if (!kingFar && e.returning && Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) < F.leash * 0.7) {
      e.returning = false;    // he came back for them
      this.campCalm = false;
      return false;
    }
    const post = e.post || { x: F.pos[0], z: F.pos[1] };
    const dx = post.x - e.mesh.position.x;
    const dz = post.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {                       // home, rested and asleep again
      e.returning = false;
      e.camp = true;
      e.hp = e.maxHp;
      setHealthBar(e.bar, 1);
      e.moving = false;
      this.animateWalk(e, 0, dt);
      return true;
    }
    const sp = (e.speed || 3) * dt;
    e.mesh.position.x += (dx / d) * sp;
    e.mesh.position.z += (dz / d) * sp;
    e.mesh.rotation.y = Math.atan2(dx, dz);
    e.moving = true;
    this.animateWalk(e, sp, dt);
    return true;
  }

  // the Warlord calls reinforcements from his tents while he lives
  chiefCall(e) {
    const F = CFG.finale;
    e.lastCall = this.time;
    const top = this.topRank();
    for (let i = 0; i < F.callCount; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawnEnemy(i === 0 ? 'shield' : 'knight', F.pos[0] + Math.cos(a) * F.radius * 0.8, F.pos[1] + Math.sin(a) * F.radius * 0.8, top);
    }
    this.hud.toast('The Warlord calls his men from the tents!', 2200);
    audio.alarm();
  }

  // #35: send a thief when the King is carrying something worth stealing, asked repeatedly through
  // the night rather than decided once when the night began. A player who spends coins as he earns
  // them holds almost nothing at nightfall, which is why thieves were never seen.
  maybeSendThief(dt) {
    const th = CFG.waves.thieves;
    this.thiefTimer = (this.thiefTimer || 0) - dt;
    if (this.thiefTimer > 0) return;
    this.thiefTimer = th.every;
    if (!this.night || this.wave < th.fromWave || this.queen.captive || this.over || this.won) return;
    if (this.coinsCarried < th.minCoins) return;
    const out = this.enemies.filter((e) => e.type === 'thief').length + this.spawnQueue.filter((s) => s.type === 'thief').length;
    if (out >= th.max || Math.random() > th.chance) return;
    const kp = this.king.mesh.position;
    const half = CFG.world.size / 2 - 8;
    const a = rand(0, Math.PI * 2);
    const rr = 26 + rand(6, 12);
    this.spawnQueue.push({
      type: 'thief',
      x: THREE.MathUtils.clamp(kp.x + Math.cos(a) * rr, -half, half),
      z: THREE.MathUtils.clamp(kp.z + Math.sin(a) * rr, -half, half),
      t: th.warn, rank: 0, warn: true,
    });
  }

  // A thief runs at the King, grabs coins off his stack and bolts for the edge of the map. It ignores
  // walls and never fights, so the answer is archers and speed, not fortification.
  updateThief(e, dt) {
    const p = e.mesh.position;
    const half = CFG.world.size / 2 - 4;
    if (e.state === 'flee') {
      // head for whichever edge is nearest, carrying the loot in plain sight
      if (!e.exit) e.exit = this.edgeExit(p);
      tmp2.set(e.exit.x - p.x, 0, e.exit.z - p.z);
      const d = tmp2.length();
      this.faceTowards(e.mesh, tmp.set(e.exit.x, 0, e.exit.z), dt, 10);
      if (d > 0.1) {
        tmp2.normalize().multiplyScalar(Math.min(e.stats.fleeSpeed * dt, d));
        p.add(tmp2);
      }
      this.collideRiver(p, e.radius);
      e.moving = true;
      this.animateWalk(e, 1, dt);
      if (Math.abs(p.x) > half - 0.5 || Math.abs(p.z) > half - 0.5) this.thiefEscapes(e);
      return;
    }
    // hunting: straight for the King and his coin stack
    const kp = this.king.mesh.position;
    this.faceTowards(e.mesh, kp, dt, 10);
    tmp2.subVectors(kp, p);
    tmp2.y = 0;
    const d = tmp2.length();
    if (d > 1.1) {
      tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - 1.0));
      p.add(tmp2);
      this.collideRiver(p, e.radius);
    } else if (this.coinsCarried > 0) {
      const take = Math.max(1, Math.min(this.coinsCarried, Math.round(this.coinsCarried * e.stats.steal)));
      this.coinsCarried -= take;
      e.carrying = take;
      e.state = 'flee';
      this.attachLoot(e);
      this.raiseAlarm(`A thief took ${take} coins!`);
      this.hud.toast(`A thief has your coins! Cut them down before they reach the edge.`, 3000);
      this.popup(`-${take}`, p, '#ff9a9a', 1.8);
      audio.hurt();
    }
    e.moving = d > 1.1;
    this.animateWalk(e, e.moving ? 1 : 0, dt);
  }

  // the loot rides on the thief's back so the stakes are visible at a glance
  attachLoot(e) {
    const g = new THREE.Group();
    const n = Math.min(8, Math.max(2, Math.round(e.carrying / 3)));
    for (let i = 0; i < n; i++) {
      const c = makeCoin(this.coinTier());
      c.position.set(rand(-0.12, 0.12), 1.35 + i * 0.11, -0.28);
      c.scale.setScalar(0.8);
      g.add(c);
    }
    e.mesh.add(g);
    e.loot = g;
  }

  thiefEscapes(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.root.remove(e.mesh);
    this.disposeEntity(e.mesh);
    this.hud.toast(`The thief escaped with ${e.carrying} coins.`, 2600);
    audio.wallHit();
  }

  updateEnemies(dt) {
    // bucket enemies into cells so separation only checks neighbours (was O(n^2));
    // the cell must be at least two boss radii so a boss pair is never missed
    const cell = 4.5;
    const grid = new Map();
    for (const o of this.enemies) {
      const k = Math.floor(o.mesh.position.x / cell) * 4096 + Math.floor(o.mesh.position.z / cell);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(o);
    }
    for (const e of this.enemies) {
      if (e.captor) {
        this.updateCaptor(e, dt);
        continue;
      }
      if (e.camp) {
        this.updateCampSleeper(e, dt);
        continue;
      }
      // #28: the camp defends the camp. Get far enough away and it breaks off, walks back to its
      // posts and sleeps again, rather than chasing the King home and ending the run.
      if (e.fromCamp && this.updateCampReturn(e, dt)) continue;
      if (e.chief && this.time - e.lastCall > CFG.finale.callEvery && e.hp < e.maxHp) this.chiefCall(e);
      if (e.escort) {
        this.updateEscort(e, dt);
        continue;
      }
      if (e.type === 'thief') {
        this.updateThief(e, dt);
        continue;
      }
      if (e.type === 'sapper') {
        this.updateSapper(e, dt);
        continue;
      }
      if (e.type === 'archer') {
        this.updateEnemyArcher(e, dt);
        continue;
      }
      e.cooldown -= dt;
      e.retarget -= dt;
      if (e.retarget <= 0 || !e.target || e.target.hp <= 0 || (e.target.isKeep && (e.target.state !== 'built' || !this.queen.inKeep))) {
        e.retarget = 0.4;
        let best = null;
        let bd = Infinity;
        for (const u of this.units) {
          if (u.inKeep || u.captive) continue;
          let d = e.mesh.position.distanceToSquared(u.mesh.position);
          if (u.type === 'queen') d *= CFG.queen.targetWeight;
          if (d < bd) {
            bd = d;
            best = u;
          }
        }
        if (this.keep && this.keep.state === 'built' && this.queen.inKeep) {
          const d = e.mesh.position.distanceToSquared(this.keep.mesh.position) * 0.7;
          if (d < bd) best = this.keep;
        }
        e.target = best;
      }
      const t = e.target;
      if (!t) continue;
      const p = e.mesh.position;
      tmp2.subVectors(t.mesh.position, p);
      tmp2.y = 0;
      const d = tmp2.length();
      const reach = e.radius + 0.7 + (t.isKeep ? CFG.keep.half : 0);
      // if the target is across the river, walk to the nearest bridge first
      // (recomputed 5x a second, not every frame: it searches the whole river polyline)
      if (e.wpTarget !== t || this.time >= e.wpT) {
        e.wp = this.bridgeWaypoint(e, t.mesh.position);
        e.wpT = this.time + 0.2;
        e.wpTarget = t;
      }
      const wp = e.wp;
      let blocked = null;
      if (wp) {
        tmp2.set(wp.x - p.x, 0, wp.z - p.z);
        const wd = tmp2.length();
        this.faceTowards(e.mesh, tmp.set(wp.x, 0, wp.z), dt, 8);
        if (wd > 0.05) {
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, wd));
          p.add(tmp2);
        }
        blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
        this.animateWalk(e, 1, dt);
      } else {
        this.faceTowards(e.mesh, t.mesh.position, dt, 8);
        if (d > reach) {
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - reach + 0.01));
          p.add(tmp2);
          blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
          this.animateWalk(e, blocked ? 0.4 : 1, dt);
        }
      }
      e.moving = !!wp || (d > reach && !blocked);
      if (blocked) {
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          this.attackAnim(e);
          this.damageWall(blocked, e.damage * (e.stats.aoe ? 2 : 1), e);
          if (e.stats.aoe) this.shake = 0.2;
        }
      } else if (!wp && d <= reach) {
        this.animateWalk(e, 0, dt);
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          this.attackAnim(e);
          if (e.stats.aoe) {
            for (const u of this.units) {
              if (u.mesh.position.distanceTo(p) < e.stats.aoe + 1) this.damageUnit(u, e.damage);
            }
            if (this.keep && this.keep.state === 'built' && this.keep.mesh.position.distanceTo(p) < e.stats.aoe + 2.5) this.damageWall(this.keep, e.damage * 2);
            this.shake = 0.25;
          } else if (t.isKeep) this.damageWall(t, e.damage);
          else this.damageUnit(t, e.damage);
        }
      }
      if (e.mesh.userData.body && e.mesh.userData.body.rotation.x > 0) e.mesh.userData.body.rotation.x = Math.max(0, e.mesh.userData.body.rotation.x - dt * 3);
      // simple separation so enemies don't stack into one blob
      const cx = Math.floor(p.x / cell);
      const cz = Math.floor(p.z / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const arr = grid.get(gx * 4096 + gz);
          if (!arr) continue;
          for (const o of arr) {
            if (o === e) continue;
            const dd = p.distanceTo(o.mesh.position);
            const min = e.radius + o.radius;
            if (dd < min && dd > 0.001) {
              tmp2.subVectors(p, o.mesh.position).multiplyScalar(((min - dd) / dd) * 0.5);
              p.add(tmp2);
            }
          }
        }
      }
      this.collideWalls(p, e.radius, false);
      this.collideRiver(p, e.radius);
      this.collideKeep(p, e.radius);
      // hit flash squash
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.scale.set(e.scale * 1.12, e.scale * 0.88, e.scale * 1.12);
        if (e.flash <= 0) e.mesh.scale.setScalar(e.scale);
      }
    }
  }

  updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      const t = a.target;
      if (t && t.hp > 0) {
        tmp.copy(t.isTurret ? t.pos : t.mesh.position);
        tmp.y += t.type === 'boss' ? 2.0 : t.isTurret ? 0 : 0.8;
        a.dir.subVectors(tmp, a.mesh.position);
        const d = a.dir.length();
        if (d < CFG.arrow.speed * dt + (t.radius || 0.5) * 0.5) {
          if (a.hostile) {
            if (t.isTurret) this.damageTurret(t, a.damage);
            else this.damageUnit(t, a.damage);
          } else this.damageEnemy(t, a.damage, tmp, a.from);
          this.root.remove(a.mesh);
          this.arrows.splice(i, 1);
          continue;
        }
        a.dir.normalize();
      } else if (a.dir.lengthSq() === 0) {
        a.dir.set(0, 0, 1);
      }
      a.mesh.position.addScaledVector(a.dir, CFG.arrow.speed * dt);
      a.mesh.lookAt(tmp2.copy(a.mesh.position).add(a.dir));
      if (a.life <= 0 || a.mesh.position.y < 0) {
        this.root.remove(a.mesh);
        this.arrows.splice(i, 1);
      }
    }
  }

  updateCoins(dt) {
    const kp = this.king.mesh.position;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const p = c.mesh.position;
      c.t += dt;
      if (c.state === 'drop') {
        c.vy -= 22 * dt;
        p.x += c.vx * dt;
        p.z += c.vz * dt;
        p.y += c.vy * dt;
        c.mesh.rotation.y += dt * 6;
        if (p.y <= 0.12) {
          p.y = 0.12;
          if (Math.abs(c.vy) > 2) c.vy = -c.vy * 0.35;
          else {
            c.state = 'ground';
            c.vx = c.vz = 0;
          }
          c.vx *= 0.6;
          c.vz *= 0.6;
        }
      } else if (c.state === 'ground') {
        c.mesh.rotation.y += dt * 2;
        p.y = 0.12 + Math.sin(c.t * 4) * 0.04;
        if (p.distanceTo(kp) < CFG.king.pickupRadius * this.mods.pickup + this.ringRadius * 0.3) c.state = 'fly';
      } else {
        tmp.copy(kp);
        tmp.y = 2.4 + this.stackCount() * 0.11;
        p.lerp(tmp, 1 - Math.exp(-dt * 14));
        if (p.distanceTo(tmp) < 0.5) {
          if (c.resType) {
            this.res[c.resType]++;
            this.addScore(CFG.score.material);
          } else {
            this.coinsCarried++;
            this.coinsEarned++;
            this.comboTimer = 0.6;
            this.addScore(this.coinValue());
            audio.coin(this.coinCombo++);
          }
          this.root.remove(c.mesh);
          this.coins.splice(i, 1);
        }
      }
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.coinCombo = 0;
    // a sparkle now and then on coins lying about
    this.glintT = (this.glintT || 0) - dt;
    if (this.glintT <= 0) {
      this.glintT = 0.4;
      const ground = this.coins.filter((c) => c.state === 'ground');
      if (ground.length) {
        const c = ground[Math.floor(Math.random() * ground.length)];
        tmp.copy(c.mesh.position).setY(0.45);
        this.burstFx(tmp, '#ffffff', 0.7, 0.35);
      }
    }
    // coins flying from the stack into a pad
    for (let i = this.flyCoins.length - 1; i >= 0; i--) {
      const f = this.flyCoins[i];
      f.t += dt / 0.28;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.5;
      f.mesh.rotation.y += dt * 10;
      if (t >= 1) {
        this.root.remove(f.mesh);
        this.flyCoins.splice(i, 1);
        f.pad.paid++;
        this.drawPad(f.pad);
        f.pad.mesh.scale.setScalar(1.08);
        if (this.padPaid(f.pad) && this.pads.includes(f.pad)) this.completePad(f.pad);
      }
    }
    for (let i = this.flyRes.length - 1; i >= 0; i--) {
      const f = this.flyRes[i];
      f.t += dt / 0.3;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.4;
      f.mesh.rotation.y += dt * 8;
      if (t >= 1) {
        this.root.remove(f.mesh);
        this.flyRes.splice(i, 1);
        f.row.paid++;
        this.drawPad(f.pad);
        f.pad.mesh.scale.setScalar(1.08);
        if (this.padPaid(f.pad) && this.pads.includes(f.pad)) this.completePad(f.pad);
      }
    }
  }

  padPaid(pad) {
    return pad.paid >= pad.cost && pad.res.every((r) => r.paid >= r.need);
  }

  // the coin tier (look and score value) climbs with the Keep
  // one currency, one colour; what the Keep changes is what a coin is worth
  coinTier() {
    return 'gold';
  }
  coinValue() {
    let v = CFG.coins.value[0];
    CFG.coins.valueAt.forEach((lv, i) => { if (this.baseLevel >= lv) v = CFG.coins.value[i]; });
    return v;
  }

  stackCount() {
    return Math.min(this.coinsCarried, this.stack.length);
  }

  updatePads(dt) {
    const kp = this.king.mesh.position;
    this.spendTimer = Math.max(this.spendTimer - dt, -0.1);
    // #8: the costs panel belongs to the pad you are STANDING ON. The marker on the floor carries the
    // name; you only need the numbers once you have stopped, and stopping is what pays anyway.
    let nearest = null;
    let nd = CFG.spend.padRadius;
    for (const pad of this.pads) {
      const d = kp.distanceTo(pad.mesh.position);
      if (d < nd) {
        nd = d;
        nearest = pad;
      }
    }
    if (nearest) {
      const chips = [];
      const def = nearest.def;
      const locked = this.padLocked(def);
      if (this.queen.captive) chips.push({ icon: 'tiara', text: 'Free the Queen first', state: 'short' });
      if (def.crew) {
        const free = this.units.filter((u) => u.type === 'archer' && !u.assign).length;
        chips.push({ icon: 'person', text: plural(nearest.cost - nearest.paid, 'archer'), state: free > 0 ? 'ok' : 'short' });
      } else {
        const needC = nearest.cost - nearest.paid;
        const have = this.coinsCarried;
        if (nearest.cost > 0) chips.push({ icon: this.coinTier(), text: `${plural(needC, 'coin')} (have ${have})`, state: needC <= 0 ? 'ok' : have >= needC ? 'ok' : have > 0 ? '' : 'short' });
        for (const r of nearest.res) {
          const need = r.need - r.paid;
          chips.push({ icon: r.type, text: `${need} ${r.type} (have ${this.res[r.type]})`, state: need <= 0 || this.res[r.type] >= need ? 'ok' : this.res[r.type] > 0 ? '' : 'short' });
        }
        if (locked) chips.push({ icon: 'keep', text: `Keep level ${locked} needed`, state: 'short' });
        if (def.units) chips.push({ icon: def.units.type, text: `${this.unitCount(def.units.type)} / ${this.unitCap(def.units.type)} ${def.units.type}s`, state: locked ? 'short' : 'ok' });
      }
      const note = this.keep && this.keep.state !== 'built' && def.repairKeep ? 'The Keep must stand before it can be fed again'
        : this.queen.captive ? (this.queen.taken ? 'Cut off the escort and bring her back' : 'Rescue the Queen first') : locked ? 'Feed the Keep to raise the limit' : this.king.moving && (nearest.holdT || 0) < CFG.spend.walkHold ? 'Stop moving to pay' : def.feed ? `Pouring in materials…` : def.crew ? 'Sending archers…' : 'Paying…';
      const total = nearest.cost + nearest.res.reduce((a, r) => a + r.need, 0);
      const paidAll = nearest.paid + nearest.res.reduce((a, r) => a + r.paid, 0);
      this.hud.showPadTip({
        name: def.feed ? `Feed the Keep` : def.label,
        sub: this.padSub(def),
        desc: this.padDesc(def),
        chips,
        note,
        progress: total ? paidAll / total : 0,
      });
    } else this.hud.hidePadTip();
    for (const pad of this.pads) {
      // pop-in / settle animation
      const s = pad.mesh.scale.x;
      if (s < 1) pad.mesh.scale.setScalar(Math.min(1, s + dt * 4));
      else if (s > 1) pad.mesh.scale.setScalar(Math.max(1, s - dt * 0.8));
      const inside = kp.distanceTo(pad.mesh.position) < CFG.spend.padRadius;
      // #9: no pad can be paid until the Queen is free. They stay visible so the player can see what
      // the village will offer, but they are plainly shut.
      const locked = this.queen.captive ? 'rescue' : this.padLocked(pad.def);
      if (inside !== !!pad.active || locked !== (pad.locked || null)) {
        pad.active = inside;
        pad.locked = locked;
        this.drawPad(pad);
      }
      // coins pour faster the longer the King stands on the pad, so big purchases don't drag
      pad.holdT = inside ? (pad.holdT || 0) + dt : 0;
      // ...but only once he has actually stopped on it (or held for a moment): walking across is free
      const paying = inside && pad.holdT > CFG.spend.arm && (!this.king.moving || pad.holdT > CFG.spend.walkHold);
      if (pad.def.crew) {
        // crew pads take archers from the army instead of coins
        if (paying && !locked && pad.paid < pad.cost && this.spendTimer <= 0) {
          const free = this.units.filter((u) => u.type === 'archer' && !u.assign);
          if (free.length) {
            this.spendTimer = CFG.spend.crewTick;
            free.sort((a, b) => a.mesh.position.distanceToSquared(kp) - b.mesh.position.distanceToSquared(kp));
            const spots = this.crewSpots(pad.def);
            free[0].assign = spots[pad.paid];
            free[0].assignTower = pad.def.tower || null;
            const g = pad.ghosts[pad.paid];
            if (g) g.visible = false;
            pad.paid++;
            audio.ching();
            this.drawPad(pad);
            if (pad.paid >= pad.cost) this.completePad(pad);
          }
        }
        continue;
      }
      const tick = THREE.MathUtils.lerp(CFG.spend.tick, CFG.spend.fastTick, Math.min(1, pad.holdT / 1.5));
      // materials pour in alongside the coins
      for (const row of pad.res) {
        const pendingRes = this.flyRes.filter((f) => f.pad === pad && f.row === row).length;
        if (paying && !locked && this.res[row.type] > 0 && row.paid + pendingRes < row.need && (pad.resTimer || 0) <= 0) {
          pad.resTimer = tick * 1.6;
          this.res[row.type]--;
          audio.ching();
          const c = makeResourceCube(row.type);
          c.position.set(kp.x + rand(-0.6, 0.6), 1.2, kp.z + rand(-0.6, 0.6));
          this.root.add(c);
          this.flyRes.push({ mesh: c, from: c.position.clone(), to: new V3(pad.mesh.position.x, 0.4, pad.mesh.position.z), t: 0, pad, row });
        }
      }
      pad.resTimer = (pad.resTimer || 0) - dt;
      let pending = this.flyCoins.filter((f) => f.pad === pad).length;
      while (paying && !locked && this.coinsCarried > 0 && pad.paid + pending < pad.cost && this.spendTimer <= 0) {
        this.spendTimer += tick;
        this.coinsCarried--;
        pending++;
        audio.ching();
        const c = makeCoin(this.coinTier());
        c.position.copy(kp);
        c.position.y = 2.4 + this.stackCount() * 0.11;
        this.root.add(c);
        this.flyCoins.push({ mesh: c, from: c.position.clone(), to: new V3(pad.mesh.position.x, 0.4, pad.mesh.position.z), t: 0, pad });
      }
      for (const g of pad.ghosts) if (!pad.def.wall && !pad.def.repair) g.position.y = Math.sin(this.time * 2 + g.position.x) * 0.06 + (pad.def.crew ? 0 : 0);
    }
  }

  updateWaves(dt) {
    this.maybeSendThief(dt);
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.warn && s.t <= 2.5) {
        s.warn = false;
        this.raiseAlarm('Thieves are coming for your coins!');
      }
      if (s.t <= 0) {
        const sp = this.spawnEnemy(s.type, s.x, s.z, s.rank || 0);
        if (s.type === 'thief') sp.state = 'hunt';
        this.spawnQueue.splice(i, 1);
      }
    }
    const cleared = this.activeEnemies().length === 0 && this.spawnQueue.length === 0;
    // Nothing attacks the King until he takes the Queen back (#12): the raids ARE the enemy coming
    // for her, so while she is captive the clock stands still and it stays daylight.
    if (this.queen.captive) return;

    // #15: the sun is the timer. Raids come at nightfall and the wave number is the night number.
    const cy = CFG.cycle;
    const prev = this.dayPhase;
    this.dayPhase = (this.dayPhase + dt / cy.length) % 1;
    const crossed = (from, to, mark) => (from < mark && to >= mark) || (to < from && (from < mark || to >= mark));

    if (!this.night && this.dayPhase >= cy.nightStart - cy.warn / cy.length && this.dayPhase < cy.nightStart && !this.duskWarned) {
      this.duskWarned = true;
      this.hud.toast('The sun is going down. Get behind your walls.', 2600);
    }
    if (!this.night && crossed(prev, this.dayPhase, cy.nightStart)) {
      this.night = true;
      this.duskWarned = false;
      this.startWave();
      // #32: the music turns cold, and a wolf says so. Every night at first, then now and then, and
      // always under a blood moon: a sound that arrives on schedule forever stops being ominous.
      audio.setNight(true);
      const n = this.wave;
      if (n <= 3 || n % 3 === 0 || (n > 0 && n % CFG.waves.bossEvery === 0)) audio.howl();
    }
    if (this.night && crossed(prev, this.dayPhase, cy.dawn)) {
      this.night = false;
      audio.setNight(false);
      this.dawnBreaks(cleared);
    }
    // seconds until the sun goes down, for the HUD
    const toNight = (cy.nightStart - this.dayPhase + 1) % 1;
    this.waveTimer = this.night ? 0 : toNight * cy.length;
  }

  // The reward beat: you held the night, here is the day to rebuild in.
  dawnBreaks(cleared) {
    if (this.wave <= 0) return;
    if (cleared) {
      this.addScore(CFG.score.waveClear * this.wave);
      this.hud.toast(`Dawn. You held night ${this.wave}.`, 3000);
      audio.unlock();
    } else {
      this.hud.toast('Dawn, but raiders are still inside the walls.', 2800);
    }
  }

  // "Bring on the night": skip the rest of the daylight for points
  callWave() {
    if (!this.running || this.night || this.waveTimer <= 0 || this.queen.captive) return;
    const bonus = Math.floor(this.waveTimer) * CFG.score.earlyWavePerSecond;
    if (bonus > 0) {
      this.addScore(bonus);
      this.hud.toast(`Night called early: +${bonus} points`, 1400);
    }
    this.dayPhase = CFG.cycle.nightStart - 1e-4;
    this.duskWarned = false;
  }

  // Red arrows at the screen edge pointing at off-screen enemies, grouped by direction.
  updateIndicators(dt) {
    this.indicatorTimer -= dt;
    if (this.indicatorTimer > 0) return;
    this.indicatorTimer = 0.1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bins = new Map();
    const all = [...this.activeEnemies().map((e) => ({ pos: e.mesh.position, boss: e.type === 'boss', thief: e.type === 'thief' })), ...this.spawnQueue.map((s) => ({ pos: { x: s.x, y: 0, z: s.z }, boss: s.type === 'boss' }))];
    for (const it of all) {
      tmp.set(it.pos.x, 1, it.pos.z).project(this.camera);
      const sx = tmp.x * w * 0.5;
      const sy = -tmp.y * h * 0.5;
      if (Math.abs(sx) < w * 0.5 - 30 && Math.abs(sy) < h * 0.5 - 30 && tmp.z < 1) continue;
      const ang = Math.atan2(sy, sx);
      const bin = Math.round((ang / (Math.PI * 2)) * 16);
      const b = bins.get(bin) || { ax: 0, ay: 0, n: 0, boss: false, thief: false };
      b.ax += Math.cos(ang);
      b.ay += Math.sin(ang);
      b.n++;
      b.boss = b.boss || it.boss;
      b.thief = b.thief || it.thief;
      bins.set(bin, b);
    }
    const list = [];
    const margin = 44;
    // a blue arrow home whenever the village is off-screen
    const hb = TIERS[0].bounds;
    tmp.set((hb.x0 + hb.x1) / 2, 1, (hb.z0 + hb.z1) / 2).project(this.camera);
    const hx = tmp.x * w * 0.5;
    const hy = -tmp.y * h * 0.5;
    if (Math.abs(hx) > w * 0.5 - 30 || Math.abs(hy) > h * 0.5 - 30 || tmp.z >= 1) {
      const ang = Math.atan2(hy, hx);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
      list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, home: true });
    }
    if (this.finaleOpen && this.enemies.some((e) => e.chief)) {
      const F = CFG.finale;
      tmp.set(F.pos[0], 1, F.pos[1]).project(this.camera);
      const cxs = tmp.x * w * 0.5;
      const cys = -tmp.y * h * 0.5;
      if (Math.abs(cxs) > w * 0.5 - 30 || Math.abs(cys) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(cys, cxs);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, camp: true });
      }
    }
    if (this.queen.captive) {
      const qp = this.queen.mesh.position;
      tmp.set(qp.x, 1, qp.z).project(this.camera);
      const qx = tmp.x * w * 0.5;
      const qy = -tmp.y * h * 0.5;
      if (Math.abs(qx) > w * 0.5 - 30 || Math.abs(qy) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(qy, qx);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, queen: true });
      }
    }
    if (this.alarmT > 0) {
      const target = this.queen.inKeep && this.keep ? this.keep.mesh.position : this.queen.mesh.position;
      tmp.set(target.x, 1, target.z).project(this.camera);
      const kx = tmp.x * w * 0.5;
      const ky = -tmp.y * h * 0.5;
      if (Math.abs(kx) > w * 0.5 - 30 || Math.abs(ky) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(ky, kx);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, alarm: true });
      }
    }
    for (const b of bins.values()) {
      const ang = Math.atan2(b.ay, b.ax);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
      list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: b.n, boss: b.boss, thief: b.thief });
    }
    this.hud.setIndicators(list);
  }

  updateEffects(dt) {
    for (const w of this.walls) if (w.mesh && w.mesh.position.y > 0) w.mesh.position.y = Math.max(0, w.mesh.position.y - dt * 0.4);
    if (this.keep && this.keep.mesh.position.y > 0) this.keep.mesh.position.y = Math.max(0, this.keep.mesh.position.y - dt * 0.4);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t -= dt;
      d.mesh.rotation.x += dt * 4;
      d.mesh.position.y -= dt * 1.5;
      d.mesh.scale.multiplyScalar(1 - dt * 1.5);
      if (d.t <= 0) {
        this.root.remove(d.mesh);
        this.disposeEntity(d.mesh);
        this.dying.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t -= dt;
      p.mesh.position.y += dt * 2.2;
      p.mesh.material.opacity = Math.min(1, p.t * 3);
      if (p.t <= 0) {
        this.root.remove(p.mesh);
        p.mesh.material.dispose();
        this.popups.splice(i, 1);
      }
    }
    for (let i = this.popping.length - 1; i >= 0; i--) {
      const o = this.popping[i];
      o.userData.popT -= dt;
      if (o.userData.popT > 0.45) continue;
      o.visible = true;
      const s = 1 - Math.max(0, o.userData.popT / 0.45);
      const base = o.userData.baseScale || 1;
      o.scale.setScalar(Math.max(0.01, base * s * (1 + Math.sin(s * Math.PI) * 0.2)));
      if (o.userData.popT <= 0) {
        o.scale.setScalar(base);
        this.popping.splice(i, 1);
      }
    }
  }

  updateStack(dt) {
    const kp = this.king.mesh.position;
    const n = this.stackCount();
    const v = this.king.vel;
    const { outer, inner } = this.stackMesh;
    const col = COIN_TIER_COLORS[this.coinTier()];
    for (let i = 0; i < n; i++) {
      const c = this.stack[i];
      outer.setColorAt(i, col[0]);
      inner.setColorAt(i, col[1]);
      // the stack leans against the direction of travel, more the higher it goes
      const lean = 0.004 * Math.min(i, 30);
      tmp.set(kp.x - v.x * lean, 2.4 + i * 0.11, kp.z - v.z * lean);
      tmp.x += Math.sin(this.time * 2.5 + i * 0.2) * 0.004 * Math.min(i, 30);
      c.position.lerp(tmp, 1 - Math.exp(-dt * (18 - Math.min(10, i * 0.15))));
      tmpM.makeTranslation(c.position.x, c.position.y, c.position.z);
      outer.setMatrixAt(i, tmpM);
      inner.setMatrixAt(i, tmpM);
    }
    outer.count = inner.count = n;
    outer.instanceMatrix.needsUpdate = inner.instanceMatrix.needsUpdate = true;
    outer.instanceColor.needsUpdate = inner.instanceColor.needsUpdate = true;
  }

  // Mobile blob shadows: one disc per unit / enemy, all in a single instanced draw.
  updateBlobs() {
    const b = this.blobs;
    if (!b) return;
    let i = 0;
    const put = (ent, r) => {
      if (i >= 400 || ent.inKeep) return;
      const p = ent.mesh.position;
      tmpM.makeScale(r, 1, r).setPosition(p.x, 0, p.z);
      b.setMatrixAt(i++, tmpM);
    };
    for (const u of this.units) put(u, 0.5 * (u.scale || 1));
    for (const e of this.enemies) put(e, e.radius * 1.15 + 0.1);
    b.count = i;
    b.instanceMatrix.needsUpdate = true;
  }

  // Slow day cycle across waves: morning, noon, golden evening, dusk, then dawn again every 12 waves.
  updateDaylight(dt) {
    // One cycle: dawn, morning, noon, golden evening, then nightfall at CFG.cycle.nightStart (0.6).
    // #27: night stays cool and moonlit, never truly dark. A playtester could not read the field
    // after nightfall, so the night keys carry more light than the scene wants for realism: this is
    // a game you have to fight in at night, and losing sight of the raiders is not a fair difficulty.
    const blood = this.night && this.wave > 0 && this.wave % CFG.waves.bossEvery === 0;
    const keys = blood ? [
      { p: 0.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
      { p: 0.3, sun: 0xffffff, sunI: 1.42, sky: 0xffffff, ground: 0x9ec97a, fog: 0x74c45c, exp: 1.26, h: 42, tint: 0xffffff },
      { p: 0.52, sun: 0xffb36a, sunI: 1.25, sky: 0xffd9b0, ground: 0x7a9a5a, fog: 0x6fae4f, exp: 1.15, h: 20, tint: 0xffe4c8 },
      { p: 0.62, sun: 0xff7a5a, sunI: 1.0, sky: 0xffb0a0, ground: 0x7a4a42, fog: 0x8a4038, exp: 1.06, h: 14, tint: 0xffc8be },
      { p: 0.74, sun: 0xff8a76, sunI: 1.0, sky: 0xe09a90, ground: 0x7a4040, fog: 0x8f3a34, exp: 1.06, h: 11, tint: 0xf5bdb2 },
      { p: 0.94, sun: 0xff8a76, sunI: 1.0, sky: 0xe09a90, ground: 0x7a4040, fog: 0x8f3a34, exp: 1.06, h: 11, tint: 0xf5bdb2 },
      { p: 1.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
    ] : [
      { p: 0.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
      { p: 0.3, sun: 0xffffff, sunI: 1.42, sky: 0xffffff, ground: 0x9ec97a, fog: 0x74c45c, exp: 1.26, h: 42, tint: 0xffffff },
      { p: 0.52, sun: 0xffb36a, sunI: 1.25, sky: 0xffd9b0, ground: 0x7a9a5a, fog: 0x6fae4f, exp: 1.15, h: 20, tint: 0xffe4c8 },
      { p: 0.62, sun: 0xc9b6ff, sunI: 1.06, sky: 0xc3ccf8, ground: 0x5c7686, fog: 0x4e828a, exp: 1.08, h: 14, tint: 0xd8dcf7 },
      { p: 0.74, sun: 0xa8bcff, sunI: 0.92, sky: 0x9fb0e8, ground: 0x44607e, fog: 0x3c6389, exp: 1.02, h: 11, tint: 0xc0ccec },
      { p: 0.94, sun: 0xa8bcff, sunI: 0.92, sky: 0x9fb0e8, ground: 0x44607e, fog: 0x3c6389, exp: 1.02, h: 11, tint: 0xc0ccec },
      { p: 1.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
    ];
    // dayPhase is advanced by updateWaves, which owns the clock; this only paints it
    const ph = this.dayPhase;
    let a = keys[0];
    let b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) if (ph >= keys[i].p && ph <= keys[i + 1].p) {
      a = keys[i];
      b = keys[i + 1];
    }
    const t = (ph - a.p) / Math.max(1e-6, b.p - a.p);
    const lerpC = (c1, c2) => this._dc1.setHex(c1).lerp(this._dc2.setHex(c2), t);
    this._dc1 = this._dc1 || new THREE.Color();
    this._dc2 = this._dc2 || new THREE.Color();
    this.sun.color.copy(lerpC(a.sun, b.sun));
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.color.copy(lerpC(a.sky, b.sky));
    this.hemi.groundColor.copy(lerpC(a.ground, b.ground));
    this.scene.fog.color.copy(lerpC(a.fog, b.fog));
    this.scene.background.copy(this.scene.fog.color);
    this.renderer.toneMappingExposure = a.exp + (b.exp - a.exp) * t;
    this.sunHeight = a.h + (b.h - a.h) * t;
    if (this.world.groundMat) this.world.groundMat.color.copy(lerpC(a.tint, b.tint));
  }

  updateCamera(dt) {
    const kp = this.king.mesh.position;
    const d = this.camDist;
    tmp.set(kp.x, d * 0.92, kp.z + d * 0.8);
    if (this.shake > 0) {
      this.shake -= dt;
      tmp.x += (Math.random() - 0.5) * 0.5;
      tmp.z += (Math.random() - 0.5) * 0.5;
    }
    this.camera.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    tmp2.set(kp.x, 0, kp.z - 2);
    this.camera.lookAt(tmp2);
    this.sun.position.set(kp.x + 18 + (34 - this.sunHeight) * 0.6, this.sunHeight, kp.z + 12 + (34 - this.sunHeight) * 0.4);
    this.sun.target.position.set(kp.x, 0, kp.z);
  }

  // ---------- small helpers ----------
  animateWalk(ent, moving, dt) {
    const legs = ent.mesh.userData.legs;
    ent.walkT = (ent.walkT || 0) + dt * (moving ? 12 : 0);
    const amp = moving ? 0.6 * Math.min(1, moving) : 0;
    if (legs) {
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(ent.walkT + (i % 2) * Math.PI) * amp;
      });
    }
    const arms = ent.mesh.userData.arms;
    if (arms) arms.forEach((a, i) => (a.rotation.x = -Math.sin(ent.walkT + (i % 2) * Math.PI) * amp * 0.8));
    const body = ent.mesh.userData.body;
    if (body) body.position.y = body.userData.baseY ?? (body.userData.baseY = body.position.y);
    if (body && moving) body.position.y += Math.abs(Math.sin(ent.walkT)) * 0.05;
  }

  faceTowards(mesh, target, dt, speed) {
    const a = Math.atan2(target.x - mesh.position.x, target.z - mesh.position.z);
    mesh.rotation.y = this.lerpAngle(mesh.rotation.y, a, 1 - Math.exp(-dt * speed));
  }

  lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  regen(u, dt) {
    if (u.hp < u.maxHp && this.time - u.lastHit > CFG.regen.delay) {
      u.hp = Math.min(u.maxHp, u.hp + CFG.regen.perSecond * this.mods.regen * dt);
      setHealthBar(u.bar, u.hp / u.maxHp);
    }
  }
}
