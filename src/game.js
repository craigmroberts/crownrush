import * as THREE from 'three';
import { CFG, PADS, TIERS, NODES, MAP } from './config.js';
import { audio } from './audio.js';
import { makeRigged, setRigShadows } from './rig.js';
import { MODS, UPGRADES, pickOffer } from './upgrades.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import {
  makeKing, makeKingFoot, makeQueen, makeKeep, makeLumberTree, makeOreRock, makeResourceCube, RES_MATS, CHIP_GEO, makeTool, makeArcher, makeSwordsman, makeKnight, makeElite, makeBrute, makeBoss, makeCoin, makeArrow,
  makeHut, makeTower, makeBarracks, makeWallSegment, makeGate, makeRubble, makeBridge, makePad, drawPad, ghostify,
  makeHealthBar, setHealthBar, HealthBars, disposeHealthBar, clearHealthBars, makePopup, makeRing, makeSpawnFx, makeBurst, makeCoinStack,
  makeBank, makeGatePost, COIN_TIER_COLORS,
} from './models.js';

const V3 = THREE.Vector3;
const tmp = new V3();
const tmp2 = new V3();
const tmpM = new THREE.Matrix4();
const HAIR = [0x5a3416, 0x2a1e16, 0x8a5a2b, 0x1c1c22, 0x6b3f1d];
const cap = (t) => t[0].toUpperCase() + t.slice(1);
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
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
    this.dayPhase = 0;
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

    this.running = false;
    this.time = 0;
    this.best = Number(localStorage.getItem('crownrush-best') || 1);
    this.reset();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
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
    this.dynamicPads = [];
    this.built = {};
    this.buyCount = {};
    this.tier = 0;
    this.wallLevel = 0;
    this.baseLevel = 0; // Keep level: 0 until the Keep is built, then 1..CFG.base.maxLevel
    this.feedDef = null;
    this.mounted = false;
    this.res = { wood: 0, stone: 0, straw: 0 };
    this.flyRes = [];
    this.score = 0;
    this.bestScore = Number(localStorage.getItem('crownrush-best-score') || 0);
    this.mineTimer = 0;
    this.nodes = [];
    this.chips = [];
    this.fx = [];
    this.alarmT = 0;
    this.raidWarning = 0;
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
    this.coinsCarried = CFG.coins.start;
    this.coinsEarned = 0;
    this.archerPower = 0;
    this.rankSeen = {};
    this.coinCombo = 0;
    this.comboTimer = 0;
    this.wave = 0;
    this.waveTimer = CFG.waves.firstDelay;
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
      const e = this.spawnEnemy('knight', CFG.rescue.pos[0] + Math.cos(a) * 2.4, CFG.rescue.pos[1] + Math.sin(a) * 2.4, 0);
      e.captor = true;
      e.mesh.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    }
    const hc = TIERS[0].bounds;
    this.homeSide = this.world.riverInfo((hc.x0 + hc.x1) / 2, (hc.z0 + hc.z1) / 2).side;

    // resource nodes
    for (const def of NODES) {
      const mesh = def.type === 'wood' ? makeLumberTree() : def.type === 'stone' ? makeOreRock() : new THREE.Group();
      mesh.position.set(def.pos[0], 0, def.pos[1]);
      if (def.type !== 'straw') this.root.add(mesh);
      this.nodes.push({ type: def.type, mesh, stock: def.stock, max: def.stock, regrow: 0, pos: new V3(def.pos[0], 0, def.pos[1]) });
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
    this.resetFog();
    this.refreshPads();
    this.hud.showNextWave(false);
    this.hud.hidePadTip();
    this.hud.set(this.coinsCarried, 1, 0, null, CFG.waves.goal, this.res, 0, 1, 1, 0);
    this.hud.setCoinTier(this.coinTier());
    this.hud.setIndicators([]);
  }

  start() {
    this.reset();
    this.running = true;
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
    if (!this.paused || this.offer) return;
    this.paused = false;
    this.running = true;
    this.hud.hidePause();
    this.hud.hideInfo();
    this.infoOpen = false;
  }

  // The info screen: pauses the game and explains the next Keep level, the pads on offer and the enemy ranks.
  showInfo() {
    if (this.over || this.won || this.infoOpen) return;
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
      if (CFG.coins.tierAt.includes(N)) unlocks.push(`Coins turn ${CFG.coins.tiers[CFG.coins.tierAt.indexOf(N)]} (worth more score)`);
      const rank = CFG.ranks.find((r) => r.fromLevel === N);
      if (rank) unlocks.push(`${rank.name}s start raiding: tougher, but they drop more coins`);
      for (const def of PADS) if (def.minLevel === N) unlocks.push(`${def.label} pad appears`);
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
    const tierIdx = CFG.coins.tiers.indexOf(this.coinTier());
    const coins = { tier: this.coinTier(), count: this.coinsCarried, nextTier: CFG.coins.tiers[tierIdx + 1] || null, nextAt: CFG.coins.tierAt[tierIdx + 1] || null };
    return { taken, level: L, max: CFG.base.maxLevel, hasKeep: !!this.keep, queenCaptive: !!this.queen.captive, need, unlocks, padsNow, later, ranks, army, coins, wave: this.wave, goal: CFG.waves.goal };
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
    if (type === 'knight') return [['red', rk.tunic], ['darkRed', rk.trim]];
    if (type === 'elite') return [['darkRed', rk.tunic], ['ink', rk.dark]];
    if (type === 'brute') return [['darkRed', rk.tunic], ['leather', rk.trim]];
    return [['bone', rk.light], ['boneDark', rk.trim]];
  }

  spawnEnemy(type, x, z, rank = 0) {
    const stats = CFG.enemy[type];
    rank = Math.min(rank, CFG.ranks.length - 1);
    const rk = CFG.ranks[rank];
    const rig = makeRigged(type === 'knight' || type === 'thief' ? 'raider' : type, this.rankTints(type, rk));
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
    const bar = makeHealthBar(type === 'boss' ? 3.4 : type === 'brute' ? 1.5 : 1.0);
    bar.position.y = type === 'boss' ? 5.0 : type === 'brute' ? 2.7 : 1.9;
    mesh.add(bar);
    this.root.add(mesh);
    const e = {
      type, rank, mesh, bar, stats, hp: stats.hp * hpMul, maxHp: stats.hp * hpMul, damage: stats.damage * dmgMul,
      cooldown: rand(0.2, 0.8), target: null, retarget: 0, flash: 0, radius: stats.radius,
      scale: rig ? { knight: 1.0, elite: 1.1, brute: 1.35, boss: 2.4, thief: 0.92 }[type] : type === 'boss' ? 1 : 1.15,
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
    const angles = [];
    for (let i = 0; i < dirs; i++) angles.push(rand(0, Math.PI * 2));
    const b = TIERS[this.tier].bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
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
    // a thief joins once the King is worth robbing; they arrive after the fighting has started
    const th = CFG.waves.thieves;
    if (w >= th.fromWave && this.coinsCarried >= th.minCoins && Math.random() < th.chance) {
      const n = 1 + (Math.random() < 0.25 ? 1 : 0);
      for (let i = 0; i < Math.min(n, th.max); i++) {
        const a = rand(0, Math.PI * 2);
        const rr = halfDiag + rand(12, 18);
        this.spawnQueue.push({ type: 'thief', x: THREE.MathUtils.clamp(cx + Math.cos(a) * rr, -half, half), z: THREE.MathUtils.clamp(cz + Math.sin(a) * rr, -half, half), t: list.length * CFG.waves.stagger + th.warn + i * 2.5, rank: 0, warn: true });
      }
    }
    const boss = list.includes('boss');
    audio.wave(boss);
    this.hud.toast(boss ? `Wave ${w} — BOSS!` : w === CFG.waves.goal ? `Wave ${w} — the final stand!` : `Wave ${w}`, 1800);
    this.waveTimer = Math.max(CFG.waves.minInterval, CFG.waves.interval - w * 0.4) + list.length * CFG.waves.stagger;
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

  drawPad(pad) {
    const style = PAD_STYLE[this.padKind(pad.def)];
    const total = pad.cost + pad.res.reduce((a, r) => a + r.need, 0);
    const paidAll = pad.paid + pad.res.reduce((a, r) => a + r.paid, 0);
    drawPad(pad.canvas, pad.tex, {
      icon: pad.def.icon, label: pad.def.label, remaining: pad.def.feed ? null : pad.cost - pad.paid, paid: total ? paidAll / total : 0,
      currency: pad.def.crew ? 'archers' : this.coinTier(),
      res: pad.res.map((r) => ({ type: r.type, remaining: r.need - r.paid })),
      active: !!pad.active,
      sub: pad.def.feed ? `Level ${this.baseLevel} → ${this.baseLevel + 1}` : null,
      locked: pad.locked === 'rescue' ? 'Free the Queen' : pad.locked ? `Keep Lv ${pad.locked}` : null,
      lockIcon: pad.locked === 'rescue' ? 'tiara' : 'keep',
      shape: style.shape, rim: style.rim, tag: style.tag,
    });
  }

  makeStructureMesh(kind) {
    if (kind === 'bank') return makeBank();
    if (kind === 'hut') return makeHut();
    if (kind === 'keep') return makeKeep();
    if (kind === 'tower') return makeTower();
    if (kind === 'barracks') return makeBarracks();
    return new THREE.Group();
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
      t.mesh = makeTower(t.level);
      t.mesh.position.set(t.x, 0, t.z);
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
    return CFG.keep.hp + Math.max(0, this.baseLevel - 1) * CFG.keep.hpPerLevel;
  }

  // ---------- the Keep as the base: feed it materials to level up ----------
  levelReq() {
    return CFG.base.levels[this.baseLevel] || null;
  }

  addFeedPad() {
    if (!this.keep || !this.levelReq() || this.feedDef) return;
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
    const newRank = CFG.ranks.find((r) => r.fromLevel === L);
    const coinNote = CFG.coins.tierAt.includes(L) && L > 0 ? `coins are now ${this.coinTier()}` : null;
    const notes = [CFG.base.unlocks[L], coinNote, newRank ? `${newRank.name}s now join the raids` : null, `${CFG.base.archers[L]} archers`, `${CFG.base.swordsmen[L]} swordsmen`, `arrows ${this.fireMul().toFixed(1)}x`].filter(Boolean);
    this.hud.toast(`Keep level ${L}! ${notes.join(' · ')}`, 3400);
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
    if (this.over || this.won || this.offerQueue <= 0) return;
    const list = pickOffer(this.taken);
    if (!list.length) {
      this.offerQueue = 0;
      return;
    }
    this.offer = list;
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
    else {
      this.paused = false;
      this.running = true;
    }
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
    k.state = 'broken';
    this.queenLeaveKeep();
    this.root.remove(k.mesh);
    k.mesh = makeRubble(3.4, 2);
    k.mesh.position.set(k.x, 0, k.z);
    this.root.add(k.mesh);
    this.hud.toast('The keep has fallen! Protect the Queen!', 2200);
    audio.wave(true);
    this.dynamicPads.push({ id: `repair-keep-${this.time.toFixed(0)}`, pos: [k.x - 3.2, k.z + 3.2], cost: 20, res: { stone: 10 }, icon: 'hammer', label: 'Repair Keep', repairKeep: true });
    this.refreshPads();
  }

  restoreKeep() {
    const k = this.keep;
    this.root.remove(k.mesh);
    k.mesh = makeKeep();
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
    this.turrets.push({ mesh, cooldown: rand(0, 0.7), pos: new V3(x, y + 0.9, z), tower: towerId });
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
  fireArrow(from, target, damage) {
    const mesh = makeArrow();
    mesh.position.copy(from);
    this.root.add(mesh);
    this.arrows.push({ mesh, target, damage, life: CFG.arrow.life, dir: new V3() });
  }

  damageEnemy(e, dmg, hitPos) {
    if (e.hp <= 0) return;
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
    const mult = e.type === 'boss' ? 4 : e.type === 'brute' || e.type === 'elite' ? 2 : 1;
    const n = randInt(rk.coins[0], rk.coins[1]) * mult + this.mods.coinBonus;
    for (let i = 0; i < n; i++) this.dropCoin(e.mesh.position);
    audio.enemyDie();
    this.addScore(CFG.score.kill[e.type] || 10);
    if (e.type === 'boss') this.hud.toast('Boss defeated!', 1800);
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
      if (u.type === 'king' || u.type === 'queen') {
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
      const between = this.enemies.length === 0 && this.spawnQueue.length === 0 && !this.queen.captive;
      this.hud.showNextWave(between && this.wave > 0 && this.waveTimer > 3 && !this.won);
      if (this.raidWarning && this.time >= this.raidWarning) {
        this.raidWarning = 0;
        this.hud.toast('They want her back. Raiders are coming!', 3000);
      }
      this.alarmT -= dt;
      this.hud.showAlarm(this.alarmT > 0 ? this.alarmText : null);
      this.hud.setCoinTier(this.coinTier());
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army, between ? this.waveTimer : null, CFG.waves.goal, this.res, this.score, this.king.hp / this.king.maxHp, this.queen.hp / this.queen.maxHp, this.baseLevel);
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
    this.renderer.render(this.scene, this.camera);
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
    this.popup(best.type === 'wood' ? '+1 🪵' : best.type === 'stone' ? '+1 🪨' : '+1 🌾', tmp, '#ffffff', 1.6);
    const c = makeResourceCube(best.type);
    c.position.copy(best.pos).setY(1.0);
    if (best.type === 'straw') c.position.set(kp.x + rand(-2, 2), 0.6, kp.z + rand(-2, 2));
    this.root.add(c);
    this.coins.push({ mesh: c, state: 'fly', resType: best.type, t: 0, vx: 0, vz: 0, vy: 0 });
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
  updateCaptive(dt) {
    const q = this.queen;
    q.moving = false;
    this.animateWalk(q, 0, dt);
    q.bar.visible = false;
    const kp = this.king.mesh.position;
    const d = kp.distanceTo(q.mesh.position);
    if (d < 14) q.mesh.rotation.y = this.lerpAngle(q.mesh.rotation.y, Math.atan2(kp.x - q.mesh.position.x, kp.z - q.mesh.position.z), 1 - Math.exp(-dt * 6));
    if (d < CFG.rescue.aggroRadius) for (const e of this.enemies) if (e.captor) e.captor = false;
    const guarded = this.enemies.some((e) => e.mesh.position.distanceTo(q.mesh.position) < 10);
    if (d < CFG.rescue.freeRadius && !guarded) this.freeQueen();
  }

  freeQueen() {
    const q = this.queen;
    q.captive = false;
    q.hp = q.maxHp;
    setHealthBar(q.bar, 1);
    this.spawnFx(q.mesh.position.x, q.mesh.position.z, 0xf7a1c4);
    audio.unlock();
    this.addScore(CFG.score.rescue);
    // taking her back is what brings the raiders: the first raid is now on its way
    this.waveTimer = CFG.rescue.firstRaid;
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
        const sp = Math.min(u.stats.speed * (d > 6 ? 1.6 : 1), d / dt);
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
            this.damageEnemy(target, u.stats.damage * this.damageMul, tmp);
            this.attackAnim(u);
          } else {
            tmp.copy(p).y += 0.9;
            this.fireArrow(tmp, target, u.stats.damage * this.damageMul);
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

  // A thief runs at the King, grabs coins off his stack and bolts for the edge of the map. It ignores
  // walls and never fights, so the answer is archers and speed, not fortification.
  updateThief(e, dt) {
    const p = e.mesh.position;
    const half = CFG.world.size / 2 - 4;
    if (e.state === 'flee') {
      // head for whichever edge is nearest, carrying the loot in plain sight
      if (!e.exit) {
        // nearest edge it can reach WITHOUT crossing the river, or it would pin itself on the bank
        const mySide = this.world.riverInfo(p.x, p.z).side;
        const cands = [{ x: half, z: p.z }, { x: -half, z: p.z }, { x: p.x, z: half }, { x: p.x, z: -half }];
        cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        e.exit = cands.find((c) => this.world.riverInfo(c.x, c.z).side === mySide) || cands[0];
      }
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
        // guarding the Queen: stand still until the King comes close
        e.moving = false;
        this.animateWalk(e, 0, dt);
        continue;
      }
      if (e.type === 'thief') {
        this.updateThief(e, dt);
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
        tmp.copy(t.mesh.position);
        tmp.y += t.type === 'boss' ? 2.0 : 0.8;
        a.dir.subVectors(tmp, a.mesh.position);
        const d = a.dir.length();
        if (d < CFG.arrow.speed * dt + t.radius * 0.5) {
          this.damageEnemy(t, a.damage, tmp);
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
            this.addScore(CFG.coins.score[c.tier || 'bronze']);
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
  coinTier() {
    let t = 0;
    CFG.coins.tierAt.forEach((lv, i) => { if (this.baseLevel >= lv) t = i; });
    return CFG.coins.tiers[t];
  }

  stackCount() {
    return Math.min(this.coinsCarried, this.stack.length);
  }

  updatePads(dt) {
    const kp = this.king.mesh.position;
    this.spendTimer = Math.max(this.spendTimer - dt, -0.1);
    // nearest pad gets a readable requirements card; the one you stand on lights up
    let nearest = null;
    let nd = 7;
    for (const pad of this.pads) {
      const d = kp.distanceTo(pad.mesh.position);
      if (d < nd) {
        nd = d;
        nearest = pad;
      }
    }
    if (nearest) {
      tmp.copy(nearest.mesh.position).setY(0.2).project(this.camera);
      const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight - 30;
      const chips = [];
      const def = nearest.def;
      const locked = this.padLocked(def);
      if (this.queen.captive) chips.push({ icon: 'tiara', text: 'Free the Queen first', state: 'short' });
      if (def.crew) {
        const free = this.units.filter((u) => u.type === 'archer' && !u.assign).length;
        chips.push({ icon: 'person', text: `${nearest.cost - nearest.paid} archers`, state: free > 0 ? 'ok' : 'short' });
      } else {
        const needC = nearest.cost - nearest.paid;
        const have = this.coinsCarried;
        if (nearest.cost > 0) chips.push({ icon: this.coinTier(), text: `${needC} coins (have ${have})`, state: needC <= 0 ? 'ok' : have >= needC ? 'ok' : have > 0 ? '' : 'short' });
        for (const r of nearest.res) {
          const need = r.need - r.paid;
          chips.push({ icon: r.type, text: `${need} ${r.type} (have ${this.res[r.type]})`, state: need <= 0 || this.res[r.type] >= need ? 'ok' : this.res[r.type] > 0 ? '' : 'short' });
        }
        if (locked) chips.push({ icon: 'keep', text: `Keep level ${locked} needed`, state: 'short' });
        if (def.units) chips.push({ icon: def.units.type, text: `${this.unitCount(def.units.type)} / ${this.unitCap(def.units.type)} ${def.units.type}s`, state: locked ? 'short' : 'ok' });
      }
      const onPad = nd < CFG.spend.padRadius;
      const note = this.queen.captive ? 'Rescue the Queen before you build' : locked ? 'Feed the Keep to raise the limit' : onPad && this.king.moving && (nearest.holdT || 0) < CFG.spend.walkHold ? 'Stop here to pay' : def.feed ? `Stop here to pour in materials (level ${this.baseLevel} → ${this.baseLevel + 1})` : def.crew ? 'Stop here to send archers' : onPad ? 'Paying…' : 'Stop on the pad to pay';
      this.hud.showPadTip(sx, sy, def.feed ? `Feed the Keep · Lv ${this.baseLevel}` : def.label, chips, note);
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
    const cleared = this.enemies.length === 0 && this.spawnQueue.length === 0;
    if (cleared && this.wave === CFG.waves.goal && !this.won) {
      this.victory();
      return;
    }
    // Nothing attacks the King until he takes the Queen back (#12): the raids ARE the enemy coming
    // for her, so while she is captive the world stays quiet however long the player takes.
    if (this.queen.captive) return;
    this.waveTimer -= dt;
    if (cleared && this.wave > 0 && this.waveTimer > CFG.waves.graceAfterClear) {
      this.waveTimer = CFG.waves.graceAfterClear;
    }
    if (this.waveTimer <= 0) this.startWave();
  }

  callWave() {
    if (!this.running || this.waveTimer <= 0) return;
    const bonus = Math.floor(this.waveTimer) * CFG.score.earlyWavePerSecond;
    if (bonus > 0) {
      this.addScore(bonus);
      this.hud.toast(`Early call: +${bonus} points`, 1400);
    }
    this.waveTimer = 0;
  }

  // Red arrows at the screen edge pointing at off-screen enemies, grouped by direction.
  updateIndicators(dt) {
    this.indicatorTimer -= dt;
    if (this.indicatorTimer > 0) return;
    this.indicatorTimer = 0.1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bins = new Map();
    const all = [...this.enemies.map((e) => ({ pos: e.mesh.position, boss: e.type === 'boss', thief: e.type === 'thief' })), ...this.spawnQueue.map((s) => ({ pos: { x: s.x, y: 0, z: s.z }, boss: s.type === 'boss' }))];
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
    const keys = [
      { p: 0.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
      { p: 0.35, sun: 0xffffff, sunI: 1.42, sky: 0xffffff, ground: 0x9ec97a, fog: 0x74c45c, exp: 1.26, h: 42, tint: 0xffffff },
      { p: 0.7, sun: 0xffb36a, sunI: 1.25, sky: 0xffd9b0, ground: 0x7a9a5a, fog: 0x6fae4f, exp: 1.15, h: 20, tint: 0xffe4c8 },
      { p: 0.9, sun: 0xa9b8ff, sunI: 0.95, sky: 0xb9c6ff, ground: 0x4f6f52, fog: 0x4f8f60, exp: 1.06, h: 15, tint: 0xcbd4ff },
      { p: 1.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
    ];
    const target = ((Math.max(1, this.wave) - 1) % 12) / 12;
    let d = target - this.dayPhase;
    if (d < -0.5) d += 1;
    this.dayPhase = (this.dayPhase + Math.sign(d) * Math.min(Math.abs(d), dt * 0.03) + 1) % 1;
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
