import * as THREE from 'three';
import { CFG, PADS, TIERS, NODES } from './config.js';
import { audio } from './audio.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import {
  makeKing, makeKingFoot, makeLumberTree, makeOreRock, makeResourceCube, makeArcher, makeSwordsman, makeKnight, makeElite, makeBrute, makeBoss, makeCoin, makeArrow,
  makeHut, makeTower, makeBarracks, makeWallSegment, makeGate, makeRubble, makeBridge, makePad, drawPad, ghostify,
  makeHealthBar, setHealthBar, makePopup, makeRing,
} from './models.js';

const V3 = THREE.Vector3;
const tmp = new V3();
const tmp2 = new V3();
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200);
    this.input = new Input(canvas);
    const { sun } = setupLights(this.scene);
    this.sun = sun;
    this.world = buildWorld(this.scene);

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
    this.camDist = this.camera.aspect < 0.8 ? 26 : this.camera.aspect < 1.3 ? 21 : 18;
  }

  // ---------- lifecycle ----------
  reset() {
    if (this.root) this.scene.remove(this.root);
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
    this.mounted = false;
    this.res = { wood: 0, stone: 0, straw: 0 };
    this.flyRes = [];
    this.score = 0;
    this.bestScore = Number(localStorage.getItem('crownrush-best-score') || 0);
    this.mineTimer = 0;
    this.nodes = [];
    this.damageMul = 1;
    this.coinsCarried = 0;
    this.coinsEarned = 0;
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

    // king (on foot until he earns a horse)
    this.king = this.spawnUnit('king', 0, 2);
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
    this.ring = makeRing(2.4);
    this.ringRadius = 2.4;
    this.root.add(this.ring);

    // coin stack carried above the king
    this.stack = [];
    for (let i = 0; i < 70; i++) {
      const c = makeCoin();
      c.visible = false;
      this.root.add(c);
      this.stack.push(c);
    }

    this.refreshPads();
    this.hud.set(0, 1, 0, null, CFG.waves.goal, this.res, 0, 1);
    this.hud.setIndicators([]);
  }

  start() {
    this.reset();
    this.running = true;
    this.hud.hideStart();
    this.hud.hideGameOver();
    this.hud.hideVictory();
    this.hud.hidePause();
    this.hud.toast('Raiders incoming! Defend the King.', 2600);
    audio.init();
  }

  resume() {
    this.hud.hideVictory();
    this.running = true;
  }

  pause() {
    if (!this.running || this.over || this.won) return;
    this.running = false;
    this.paused = true;
    this.hud.showPause();
  }

  unpause() {
    if (!this.paused) return;
    this.paused = false;
    this.running = true;
    this.hud.hidePause();
  }

  togglePause() {
    if (this.paused) this.unpause();
    else this.pause();
  }

  gameOver() {
    this.over = true;
    this.running = false;
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('crownrush-best', String(this.best));
    }
    this.saveScore();
    audio.gameOver();
    setTimeout(() => this.hud.showGameOver(this.wave, this.coinsEarned, this.score, this.bestScore), 900);
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
    k.mesh = makeKing();
    k.mesh.position.copy(old.position);
    k.mesh.rotation.copy(old.rotation);
    this.root.remove(old);
    k.bar = makeHealthBar(1.6, true);
    k.bar.position.y = 3.2;
    k.mesh.add(k.bar);
    this.root.add(k.mesh);
    this.popIn(k.mesh);
  }

  // ---------- spawning ----------
  spawnUnit(type, x, z) {
    let mesh;
    let stats;
    if (type === 'king') {
      mesh = this.mounted ? makeKing() : makeKingFoot();
      stats = CFG.king;
    } else if (type === 'archer') {
      mesh = makeArcher();
      stats = CFG.archer;
    } else {
      mesh = makeSwordsman();
      stats = CFG.swordsman;
    }
    mesh.position.set(x, 0, z);
    const bar = makeHealthBar(type === 'king' ? 1.6 : 1.0, true);
    bar.position.y = type === 'king' ? (this.mounted ? 3.2 : 2.4) : 1.8;
    mesh.add(bar);
    this.root.add(mesh);
    const u = {
      type, mesh, bar, hp: stats.hp, maxHp: stats.hp, stats, cooldown: rand(0, 0.5), lastHit: -99,
      melee: type === 'swordsman', vel: new V3(), popT: type === 'king' ? 0 : 0.4, assign: null,
    };
    if (u.popT) mesh.scale.setScalar(0.01);
    this.units.push(u);
    return u;
  }

  spawnEnemy(type, x, z) {
    const stats = CFG.enemy[type];
    const mesh = type === 'boss' ? makeBoss() : type === 'brute' ? makeBrute() : type === 'elite' ? makeElite() : makeKnight();
    mesh.position.set(x, 0, z);
    const w = Math.max(1, this.wave);
    const hpMul = 1 + CFG.waves.hpGrowthPerWave * (w - 1);
    const dmgMul = 1 + CFG.waves.dmgGrowthPerWave * (w - 1);
    const bar = makeHealthBar(type === 'boss' ? 3.4 : type === 'brute' ? 1.5 : 1.0);
    bar.position.y = type === 'boss' ? 5.0 : type === 'brute' ? 2.7 : 1.9;
    mesh.add(bar);
    this.root.add(mesh);
    const e = {
      type, mesh, bar, stats, hp: stats.hp * hpMul, maxHp: stats.hp * hpMul, damage: stats.damage * dmgMul,
      cooldown: rand(0.2, 0.8), target: null, retarget: 0, flash: 0, radius: stats.radius,
    };
    this.enemies.push(e);
    return e;
  }

  startWave() {
    if (this.wave > 0) {
      const soldiers = this.units.length - 1 + this.turrets.length;
      this.addScore(CFG.score.waveClear * this.wave + soldiers * CFG.score.soldierPerWave);
    }
    this.wave++;
    const w = this.wave;
    const list = [];
    const knights = 4 + Math.round(w * 2.2);
    for (let i = 0; i < knights; i++) list.push('knight');
    if (w >= 3) for (let i = 0; i < Math.floor((w - 2) * 1.3); i++) list.push('brute');
    if (w >= 8) for (let i = 0; i < Math.floor((w - 6) * 0.8); i++) list.push('elite');
    if (w % CFG.waves.bossEvery === 0) for (let i = 0; i < Math.floor(w / 10) + 1; i++) list.push('boss');
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
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
      this.spawnQueue.push({ type, x, z, t: i * CFG.waves.stagger });
    });
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
    const pad = { def, mesh, canvas, tex, cost: this.padCost(def), paid: 0, ghosts: [], res: Object.entries(def.res || {}).map(([type, need]) => ({ type, need, paid: 0 })) };
    // ghost previews: units on the pad, structures where they'd be built, wall outlines along the edge
    if (def.units) {
      for (let i = 0; i < def.units.count; i++) {
        const g = ghostify(def.units.type === 'archer' ? makeArcher() : makeSwordsman());
        g.position.set(def.pos[0] - 0.6 + i * 0.7 + (i > 1 ? -1.1 : 0), 0, def.pos[1] + (i > 1 ? 0.8 : 0));
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.crew) {
      for (const [x, z, y] of this.crewSpots(def)) {
        const g = ghostify(makeArcher());
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
    this.drawPad(pad);
    this.pads.push(pad);
  }

  drawPad(pad) {
    const total = pad.cost + pad.res.reduce((a, r) => a + r.need, 0);
    const paidAll = pad.paid + pad.res.reduce((a, r) => a + r.paid, 0);
    drawPad(pad.canvas, pad.tex, {
      icon: pad.def.icon, label: pad.def.label, remaining: pad.cost - pad.paid, paid: paidAll / total,
      currency: pad.def.crew ? 'archers' : 'coins',
      res: pad.res.map((r) => ({ type: r.type, remaining: r.need - r.paid })),
    });
  }

  makeStructureMesh(kind) {
    if (kind === 'hut') return makeHut();
    if (kind === 'tower') return makeTower();
    if (kind === 'barracks') return makeBarracks();
    return new THREE.Group();
  }

  // where a crew pad sends its archers
  crewSpots(def) {
    if (def.spots) return def.spots;
    const t = this.towers[def.tower];
    if (!t) return [];
    const spots = [];
    for (let i = 0; i < def.crew; i++) {
      const a = (i / def.crew) * Math.PI * 2 + 0.5;
      spots.push([t.x + Math.cos(a) * 0.6, t.z + Math.sin(a) * 0.6, t.top]);
    }
    return spots;
  }

  completePad(pad) {
    const def = pad.def;
    this.built[def.id] = true;
    this.buyCount[def.id] = (this.buyCount[def.id] || 0) + 1;
    for (const g of pad.ghosts) this.root.remove(g);
    pad.ghosts = [];

    if (def.units) {
      for (let i = 0; i < def.units.count; i++) {
        this.spawnUnit(def.units.type, def.pos[0] + rand(-0.8, 0.8), def.pos[1] + rand(-0.8, 0.8));
      }
    }
    if (def.structure) this.buildStructure(def);
    if (def.wall) this.buildWall(def.wall.tier, def.wall.side);
    if (def.repair) this.restoreWall(def.repair);
    if (def.effect === 'damage') this.damageMul *= 1.4;
    if (def.effect === 'kinghp') {
      this.king.maxHp += 80;
      this.king.hp = this.king.maxHp;
    }
    if (def.effect === 'wallLevel') this.upgradeWalls();
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

    if (def.repeatable && !(def.maxBuys && this.buyCount[def.id] >= def.maxBuys)) {
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
    if (kind === 'tower') this.towers[def.id] = { x: def.buildAt[0], z: def.buildAt[1], top: m.userData.top };
  }

  expand() {
    if (this.tier < TIERS.length - 1) this.tier++;
  }

  addTurret(x, z, y) {
    const mesh = makeArcher();
    mesh.position.set(x, y, z);
    this.popIn(mesh);
    this.root.add(mesh);
    this.turrets.push({ mesh, cooldown: rand(0, 0.7), pos: new V3(x, y + 0.9, z) });
  }

  popIn(obj, delay = 0) {
    obj.scale.setScalar(0.01);
    obj.visible = delay <= 0;
    obj.userData.popT = 0.45 + delay;
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
    return sec.gate ? lv.gateHp : lv.hp;
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

  damageWall(w, dmg) {
    if (w.state !== 'built') return;
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
      id: `repair-${w.id}-${this.time.toFixed(0)}`, pos, cost: CFG.wallLevels[this.wallLevel].repair, icon: '🔨',
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
    setHealthBar(e.bar, Math.max(0, e.hp / e.maxHp));
    this.popup(`-${Math.round(dmg)}`, hitPos, e.type === 'boss' ? '#ffffff' : '#ffe27a', e.type === 'boss' ? 2.6 : 1.4);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    e.bar.visible = false;
    this.dying.push({ mesh: e.mesh, t: 0.5 });
    const n = randInt(e.stats.coins[0], e.stats.coins[1]);
    for (let i = 0; i < n; i++) this.dropCoin(e.mesh.position);
    audio.enemyDie();
    this.addScore(CFG.score.kill[e.type] || 10);
    if (e.type === 'boss') this.hud.toast('Boss defeated!', 1800);
  }

  dropCoin(pos) {
    const c = makeCoin();
    c.position.copy(pos);
    c.position.y = 0.6;
    this.root.add(c);
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4.5);
    this.coins.push({ mesh: c, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(4, 7), state: 'drop', t: 0 });
  }

  popup(text, pos, color, scale = 1.4) {
    const s = makePopup(text, color);
    s.position.copy(pos);
    s.position.y += 1.6;
    s.scale.set(scale, scale / 2, 1);
    this.root.add(s);
    this.popups.push({ mesh: s, t: 0.7 });
  }

  damageUnit(u, dmg) {
    if (u.hp <= 0) return;
    u.hp -= dmg;
    u.lastHit = this.time;
    if (u.type === 'king') audio.hurt();
    setHealthBar(u.bar, Math.max(0, u.hp / u.maxHp));
    if (u.hp <= 0) {
      if (u.type === 'king') {
        this.gameOver();
        return;
      }
      this.units.splice(this.units.indexOf(u), 1);
      u.bar.visible = false;
      this.dying.push({ mesh: u.mesh, t: 0.4 });
    }
  }

  nearestEnemy(pos, range) {
    let best = null;
    let bd = range * range;
    for (const e of this.enemies) {
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
      const army = this.units.filter((u) => u !== this.king && !u.assign).length;
      const between = this.enemies.length === 0 && this.spawnQueue.length === 0;
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army, between ? this.waveTimer : null, CFG.waves.goal, this.res, this.score, this.king.hp / this.king.maxHp);
      this.updateIndicators(dt);
    }
    this.world.update(dt);
    this.updateEffects(dt);
    this.updateStack(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updatePlayer(dt) {
    const k = this.king;
    const inp = this.input.read();
    const speed = this.mounted ? k.stats.speed : k.stats.footSpeed;
    k.vel.set(inp.x * speed, 0, inp.z * speed);
    if (k.mesh.userData.body.rotation.x > 0) k.mesh.userData.body.rotation.x = Math.max(0, k.mesh.userData.body.rotation.x - dt * 3);
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
    this.animateWalk(k, inp.mag, dt);
    // king fires his own bow
    k.cooldown -= dt;
    const target = this.nearestEnemy(p, k.stats.range);
    if (target) {
      this.faceTowards(k.mesh, target.mesh.position, dt, 14);
      if (k.cooldown <= 0) {
        k.cooldown = 1 / k.stats.fireRate;
        tmp.copy(p).y += 1.6;
        this.fireArrow(tmp, target, k.stats.damage * this.damageMul);
      }
    } else if (inp.mag > 0.05) {
      k.mesh.rotation.y = this.lerpAngle(k.mesh.rotation.y, Math.atan2(inp.x, inp.z), 1 - Math.exp(-dt * 12));
    }
    this.regen(k, dt);
    k.bar.visible = true;
    this.updateMining(dt);
    this.ring.position.set(p.x, 0.04, p.z);
    const followers = this.units.filter((u) => u !== this.king && !u.assign).length;
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
    if (this.mineTimer > 0) return;
    let best = null;
    let bd = CFG.mining.radius + 1.5;
    for (const n of this.nodes) {
      const d = kp.distanceTo(n.pos) - (n.type === 'straw' ? 4 : 0);
      if (d < bd && n.stock > 0) {
        bd = d;
        best = n;
      }
    }
    if (!best) return;
    this.mineTimer = CFG.mining.tick;
    best.stock--;
    this.setNodeLook(best);
    audio.mine(best.type);
    this.king.mesh.userData.body.rotation.x = 0.35;
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

  updateArmy(dt) {
    const kp = this.king.mesh.position;
    const followers = this.units.filter((u) => u !== this.king && !u.assign);
    followers.forEach((u, i) => {
      u.cooldown -= dt;
      if (u.popT > 0) {
        u.popT -= dt;
        const s = 1 - Math.max(0, u.popT / 0.4);
        u.mesh.scale.setScalar(0.01 + s * (1 + Math.sin(s * Math.PI) * 0.25));
        if (u.popT <= 0) u.mesh.scale.setScalar(1);
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
      if (d > 14) p.set(kp.x + rand(-1, 1), 0, kp.z + rand(-1, 1));
      this.animateWalk(u, moving, dt);

      // attack
      if (!u.melee) target = this.nearestEnemy(p, u.stats.range);
      if (target) {
        this.faceTowards(u.mesh, target.mesh.position, dt, 12);
        const dist = p.distanceTo(target.mesh.position) - target.radius;
        if (u.cooldown <= 0 && dist <= u.stats.range + 0.3) {
          u.cooldown = 1 / u.stats.fireRate;
          if (u.melee) {
            tmp.copy(target.mesh.position);
            tmp.y += 0.3;
            this.damageEnemy(target, u.stats.damage * this.damageMul, tmp);
            u.mesh.userData.body.rotation.x = 0.5;
          } else {
            tmp.copy(p).y += 0.9;
            this.fireArrow(tmp, target, u.stats.damage * this.damageMul);
          }
        }
      }
      if (u.mesh.userData.body.rotation.x > 0) u.mesh.userData.body.rotation.x = Math.max(0, u.mesh.userData.body.rotation.x - dt * 4);
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
        this.addTurret(x, z, y);
        continue;
      }
      tmp2.normalize().multiplyScalar(Math.min(u.stats.speed * dt, d));
      p.add(tmp2);
      this.collideWalls(p, 0.3, true);
      u.mesh.rotation.y = this.lerpAngle(u.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
      this.animateWalk(u, 1, dt);
    }
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.cooldown -= dt;
      const target = this.nearestEnemy(t.pos, CFG.tower.range);
      if (target) {
        this.faceTowards(t.mesh, target.mesh.position, dt, 10);
        if (t.cooldown <= 0) {
          t.cooldown = 1 / CFG.tower.fireRate;
          this.fireArrow(t.pos, target, CFG.tower.damage * this.damageMul);
        }
      }
    }
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      e.cooldown -= dt;
      e.retarget -= dt;
      if (e.retarget <= 0 || !e.target || e.target.hp <= 0) {
        e.retarget = 0.4;
        let best = null;
        let bd = Infinity;
        for (const u of this.units) {
          const d = e.mesh.position.distanceToSquared(u.mesh.position);
          if (d < bd) {
            bd = d;
            best = u;
          }
        }
        e.target = best;
      }
      const t = e.target;
      if (!t) continue;
      const p = e.mesh.position;
      tmp2.subVectors(t.mesh.position, p);
      tmp2.y = 0;
      const d = tmp2.length();
      const reach = e.radius + 0.7;
      // if the target is across the river, walk to the nearest bridge first
      const wp = this.bridgeWaypoint(e, t.mesh.position);
      let blocked = null;
      if (wp) {
        tmp2.set(wp.x - p.x, 0, wp.z - p.z);
        const wd = tmp2.length();
        this.faceTowards(e.mesh, tmp.set(wp.x, 0, wp.z), dt, 8);
        if (wd > 0.05) {
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, wd));
          p.add(tmp2);
        }
        blocked = this.collideWalls(p, e.radius, false);
        this.collideRiver(p, e.radius);
        this.animateWalk(e, 1, dt);
      } else {
        this.faceTowards(e.mesh, t.mesh.position, dt, 8);
        if (d > reach) {
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - reach + 0.01));
          p.add(tmp2);
          blocked = this.collideWalls(p, e.radius, false);
          this.collideRiver(p, e.radius);
          this.animateWalk(e, blocked ? 0.4 : 1, dt);
        }
      }
      if (blocked) {
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          e.mesh.userData.body.rotation.x = 0.6;
          this.damageWall(blocked, e.damage * (e.stats.aoe ? 2 : 1));
          if (e.stats.aoe) this.shake = 0.2;
        }
      } else if (!wp && d <= reach) {
        this.animateWalk(e, 0, dt);
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          e.mesh.userData.body.rotation.x = 0.6;
          if (e.stats.aoe) {
            for (const u of this.units) {
              if (u.mesh.position.distanceTo(p) < e.stats.aoe + 1) this.damageUnit(u, e.damage);
            }
            this.shake = 0.25;
          } else this.damageUnit(t, e.damage);
        }
      }
      if (e.mesh.userData.body.rotation.x > 0) e.mesh.userData.body.rotation.x = Math.max(0, e.mesh.userData.body.rotation.x - dt * 3);
      // simple separation so enemies don't stack into one blob
      for (const o of this.enemies) {
        if (o === e) continue;
        const dd = p.distanceTo(o.mesh.position);
        const min = e.radius + o.radius;
        if (dd < min && dd > 0.001) {
          tmp2.subVectors(p, o.mesh.position).multiplyScalar(((min - dd) / dd) * 0.5);
          p.add(tmp2);
        }
      }
      this.collideWalls(p, e.radius, false);
      this.collideRiver(p, e.radius);
      // hit flash squash
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.scale.set(1.15, 0.85, 1.15);
        if (e.flash <= 0) e.mesh.scale.setScalar(1);
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
        if (p.distanceTo(kp) < CFG.king.pickupRadius + this.ringRadius * 0.3) c.state = 'fly';
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
            this.addScore(CFG.score.coin);
            audio.coin(this.coinCombo++);
          }
          this.root.remove(c.mesh);
          this.coins.splice(i, 1);
        }
      }
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.coinCombo = 0;
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

  stackCount() {
    return Math.min(this.coinsCarried, this.stack.length);
  }

  updatePads(dt) {
    const kp = this.king.mesh.position;
    this.spendTimer = Math.max(this.spendTimer - dt, -0.1);
    for (const pad of this.pads) {
      // pop-in / settle animation
      const s = pad.mesh.scale.x;
      if (s < 1) pad.mesh.scale.setScalar(Math.min(1, s + dt * 4));
      else if (s > 1) pad.mesh.scale.setScalar(Math.max(1, s - dt * 0.8));
      const inside = kp.distanceTo(pad.mesh.position) < CFG.spend.padRadius;
      if (pad.def.crew) {
        // crew pads take archers from the army instead of coins
        if (inside && pad.paid < pad.cost && this.spendTimer <= 0) {
          const free = this.units.filter((u) => u.type === 'archer' && !u.assign);
          if (free.length) {
            this.spendTimer = CFG.spend.crewTick;
            free.sort((a, b) => a.mesh.position.distanceToSquared(kp) - b.mesh.position.distanceToSquared(kp));
            const spots = this.crewSpots(pad.def);
            free[0].assign = spots[pad.paid];
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
      // coins pour faster the longer the King stands on the pad, so big purchases don't drag
      pad.holdT = inside ? (pad.holdT || 0) + dt : 0;
      const tick = THREE.MathUtils.lerp(CFG.spend.tick, CFG.spend.fastTick, Math.min(1, pad.holdT / 1.5));
      // materials pour in alongside the coins
      for (const row of pad.res) {
        const pendingRes = this.flyRes.filter((f) => f.pad === pad && f.row === row).length;
        if (inside && this.res[row.type] > 0 && row.paid + pendingRes < row.need && (pad.resTimer || 0) <= 0) {
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
      while (inside && this.coinsCarried > 0 && pad.paid + pending < pad.cost && this.spendTimer <= 0) {
        this.spendTimer += tick;
        this.coinsCarried--;
        pending++;
        audio.ching();
        const c = makeCoin();
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
      if (s.t <= 0) {
        this.spawnEnemy(s.type, s.x, s.z);
        this.spawnQueue.splice(i, 1);
      }
    }
    const cleared = this.enemies.length === 0 && this.spawnQueue.length === 0;
    if (cleared && this.wave === CFG.waves.goal && !this.won) {
      this.victory();
      return;
    }
    this.waveTimer -= dt;
    if (cleared && this.wave > 0 && this.waveTimer > CFG.waves.graceAfterClear) {
      this.waveTimer = CFG.waves.graceAfterClear;
    }
    if (this.waveTimer <= 0) this.startWave();
  }

  // Red arrows at the screen edge pointing at off-screen enemies, grouped by direction.
  updateIndicators(dt) {
    this.indicatorTimer -= dt;
    if (this.indicatorTimer > 0) return;
    this.indicatorTimer = 0.1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bins = new Map();
    const all = [...this.enemies.map((e) => ({ pos: e.mesh.position, boss: e.type === 'boss' })), ...this.spawnQueue.map((s) => ({ pos: { x: s.x, y: 0, z: s.z }, boss: s.type === 'boss' }))];
    for (const it of all) {
      tmp.set(it.pos.x, 1, it.pos.z).project(this.camera);
      const sx = tmp.x * w * 0.5;
      const sy = -tmp.y * h * 0.5;
      if (Math.abs(sx) < w * 0.5 - 30 && Math.abs(sy) < h * 0.5 - 30 && tmp.z < 1) continue;
      const ang = Math.atan2(sy, sx);
      const bin = Math.round((ang / (Math.PI * 2)) * 16);
      const b = bins.get(bin) || { ax: 0, ay: 0, n: 0, boss: false };
      b.ax += Math.cos(ang);
      b.ay += Math.sin(ang);
      b.n++;
      b.boss = b.boss || it.boss;
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
    for (const b of bins.values()) {
      const ang = Math.atan2(b.ay, b.ax);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
      list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: b.n, boss: b.boss });
    }
    this.hud.setIndicators(list);
  }

  updateEffects(dt) {
    for (const w of this.walls) if (w.mesh && w.mesh.position.y > 0) w.mesh.position.y = Math.max(0, w.mesh.position.y - dt * 0.4);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t -= dt;
      d.mesh.rotation.x += dt * 4;
      d.mesh.position.y -= dt * 1.5;
      d.mesh.scale.multiplyScalar(1 - dt * 1.5);
      if (d.t <= 0) {
        this.root.remove(d.mesh);
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
        this.popups.splice(i, 1);
      }
    }
    for (let i = this.popping.length - 1; i >= 0; i--) {
      const o = this.popping[i];
      o.userData.popT -= dt;
      if (o.userData.popT > 0.45) continue;
      o.visible = true;
      const s = 1 - Math.max(0, o.userData.popT / 0.45);
      o.scale.setScalar(0.01 + s * (1 + Math.sin(s * Math.PI) * 0.2));
      if (o.userData.popT <= 0) {
        o.scale.setScalar(1);
        this.popping.splice(i, 1);
      }
    }
  }

  updateStack(dt) {
    const kp = this.king.mesh.position;
    const n = this.stackCount();
    const v = this.king.vel;
    for (let i = 0; i < this.stack.length; i++) {
      const c = this.stack[i];
      if (i >= n) {
        c.visible = false;
        continue;
      }
      c.visible = true;
      // the stack leans against the direction of travel, more the higher it goes
      const lean = 0.004 * Math.min(i, 30);
      tmp.set(kp.x - v.x * lean, 2.4 + i * 0.11, kp.z - v.z * lean);
      tmp.x += Math.sin(this.time * 2.5 + i * 0.2) * 0.004 * Math.min(i, 30);
      c.position.lerp(tmp, 1 - Math.exp(-dt * (18 - Math.min(10, i * 0.15))));
    }
  }

  updateCamera(dt) {
    const kp = this.king.mesh.position;
    const d = this.camDist;
    tmp.set(kp.x, d, kp.z + d * 0.62);
    if (this.shake > 0) {
      this.shake -= dt;
      tmp.x += (Math.random() - 0.5) * 0.5;
      tmp.z += (Math.random() - 0.5) * 0.5;
    }
    this.camera.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    tmp2.set(kp.x, 0, kp.z - 2);
    this.camera.lookAt(tmp2);
    this.sun.position.set(kp.x + 18, 34, kp.z + 12);
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
      u.hp = Math.min(u.maxHp, u.hp + CFG.regen.perSecond * dt);
      setHealthBar(u.bar, u.hp / u.maxHp);
    }
  }
}
