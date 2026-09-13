import * as THREE from 'three';
import { CFG, PADS, WALLS } from './config.js';
import { audio } from './audio.js';
import { buildWorld, setupLights } from './world.js';
import { Input } from './input.js';
import {
  makeKing, makeArcher, makeSwordsman, makeKnight, makeBrute, makeBoss, makeCoin, makeArrow,
  makeHut, makeTower, makeBarracks, makeFence, makeGate, makePad, drawPad, ghostify,
  makeHealthBar, setHealthBar, makePopup, makeRing, makeRubble,
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
    buildWorld(this.scene);

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
    this.spawnQueue = [];
    this.walls = [];
    this.dynamicPads = [];
    this.coinCombo = 0;
    this.comboTimer = 0;
    this.built = {};
    this.buyCount = {};
    this.damageMul = 1;
    this.coinsCarried = 0;
    this.coinsEarned = 0;
    this.wave = 0;
    this.waveTimer = CFG.waves.firstDelay;
    this.spendTimer = 0;
    this.time = 0;
    this.over = false;

    // king
    this.king = this.spawnUnit('king', 0, 2);
    this.ring = makeRing(2.4);
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
    this.hud.set(0, 1, 0);
  }

  start() {
    this.reset();
    this.running = true;
    this.hud.hideStart();
    this.hud.hideGameOver();
    this.hud.toast('Raiders incoming! Defend the King.', 2600);
    audio.init();
  }

  gameOver() {
    this.over = true;
    this.running = false;
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('crownrush-best', String(this.best));
    }
    audio.gameOver();
    setTimeout(() => this.hud.showGameOver(this.wave, this.coinsEarned), 900);
  }

  // ---------- spawning ----------
  spawnUnit(type, x, z) {
    let mesh;
    let stats;
    if (type === 'king') {
      mesh = makeKing();
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
    bar.position.y = type === 'king' ? 3.2 : 1.8;
    mesh.add(bar);
    this.root.add(mesh);
    const u = {
      type, mesh, bar, hp: stats.hp, maxHp: stats.hp, stats, cooldown: rand(0, 0.5), lastHit: -99,
      melee: type === 'swordsman', vel: new V3(), popT: type === 'king' ? 0 : 0.4,
    };
    if (u.popT) mesh.scale.setScalar(0.01);
    this.units.push(u);
    return u;
  }

  spawnEnemy(type, x, z) {
    const stats = CFG.enemy[type];
    const mesh = type === 'boss' ? makeBoss() : type === 'brute' ? makeBrute() : makeKnight();
    mesh.position.set(x, 0, z);
    const hpMul = 1 + CFG.waves.hpGrowthPerWave * (this.wave - 1);
    const bar = makeHealthBar(type === 'boss' ? 3.4 : type === 'brute' ? 1.5 : 1.0);
    bar.position.y = type === 'boss' ? 5.0 : type === 'brute' ? 2.7 : 1.9;
    mesh.add(bar);
    this.root.add(mesh);
    const e = {
      type, mesh, bar, stats, hp: stats.hp * hpMul, maxHp: stats.hp * hpMul, cooldown: rand(0.2, 0.8),
      target: null, retarget: 0, flash: 0, radius: stats.radius,
    };
    this.enemies.push(e);
    return e;
  }

  startWave() {
    this.wave++;
    const w = this.wave;
    const list = [];
    const knights = 3 + w * 2;
    for (let i = 0; i < knights; i++) list.push('knight');
    if (w >= 3) for (let i = 0; i < Math.floor((w - 2) * 1.2); i++) list.push('brute');
    if (w % CFG.waves.bossEvery === 0) for (let i = 0; i < Math.floor(w / 10) + 1; i++) list.push('boss');
    // shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    // group spawns come from 1-3 directions so they feel like raiding parties
    const dirs = 1 + Math.min(2, Math.floor(w / 3));
    const angles = [];
    for (let i = 0; i < dirs; i++) angles.push(rand(0, Math.PI * 2));
    const kp = this.king.mesh.position;
    const b = WALLS.bounds;
    const inVillage = kp.x > b.x0 - 4 && kp.x < b.x1 + 4 && kp.z > b.z0 - 4 && kp.z < b.z1 + 4;
    const cx = inVillage ? WALLS.center[0] : kp.x;
    const cz = inVillage ? WALLS.center[1] : kp.z;
    const half = CFG.world.size / 2 - 8;
    list.forEach((type, i) => {
      let a = angles[i % dirs] + rand(-0.5, 0.5);
      let r = rand(CFG.waves.spawnRadius[0], CFG.waves.spawnRadius[1]);
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = THREE.MathUtils.clamp(cx + Math.cos(a) * r, -half, half);
        z = THREE.MathUtils.clamp(cz + Math.sin(a) * r, -half, half);
        const onCliff = x < -8 && z < -14;
        const inside = x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3;
        if (!onCliff && !inside) break;
        a += 0.9;
        r += 3;
      }
      this.spawnQueue.push({ type, x, z, t: i * CFG.waves.stagger });
    });
    const boss = list.includes('boss');
    audio.wave(boss);
    this.hud.toast(boss ? `Wave ${w} — BOSS!` : `Wave ${w}`, 1800);
    this.waveTimer = CFG.waves.interval + w * 1.5;
  }

  // ---------- pads ----------
  refreshPads() {
    let added = 0;
    for (const def of [...PADS, ...this.dynamicPads]) {
      if (this.pads.find((p) => p.def === def)) continue;
      if (!def.repeatable && this.built[def.id]) continue;
      const okReq = (def.requires || []).every((id) => this.built[id]);
      if (!okReq) continue;
      if (def.maxBuys && (this.buyCount[def.id] || 0) >= def.maxBuys) continue;
      this.addPad(def);
      added++;
    }
    if (added && this.running) audio.unlock();
  }

  padCost(def) {
    const n = this.buyCount[def.id] || 0;
    return def.cost + (def.growth || 0) * n;
  }

  addPad(def) {
    const { mesh, canvas, tex } = makePad();
    mesh.position.set(def.pos[0], 0.03, def.pos[1]);
    mesh.scale.setScalar(0.01);
    this.root.add(mesh);
    const pad = { def, mesh, canvas, tex, cost: this.padCost(def), paid: 0, popT: 0, ghosts: [] };
    // ghost preview: units stand on the pad, structures appear where they'd be built
    if (def.units) {
      for (let i = 0; i < def.units.count; i++) {
        const g = ghostify(def.units.type === 'archer' ? makeArcher() : makeSwordsman());
        g.position.set(def.pos[0] - 0.6 + i * 0.7 + (i > 1 ? -1.1 : 0), 0, def.pos[1] + (i > 1 ? 0.8 : 0));
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.structure === 'wall') {
      for (const sec of this.wallSections(def.wall)) {
        const g = ghostify(this.makeWallMesh(sec));
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.structure === 'corner-towers') {
      for (const [x, z] of this.cornerTowerSpots()) {
        const g = ghostify(makeTower());
        g.position.set(x, 0, z);
        this.root.add(g);
        pad.ghosts.push(g);
      }
    } else if (def.repair) {
      const g = ghostify(this.makeWallMesh(def.repair));
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
    drawPad(pad.canvas, pad.tex, {
      icon: pad.def.icon, label: pad.def.label, remaining: pad.cost - pad.paid, paid: pad.paid / pad.cost,
    });
  }

  makeStructureMesh(kind) {
    if (kind === 'hut') return makeHut();
    if (kind === 'tower') return makeTower();
    if (kind === 'barracks') return makeBarracks();
    return new THREE.Group();
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
    if (def.turrets) for (const [x, z, y] of def.turrets) this.addTurret(x, z, y);
    if (def.repair) this.restoreWall(def.repair);
    audio.build();
    if (def.effect === 'damage') this.damageMul *= 1.4;
    if (def.effect === 'kinghp') {
      this.king.maxHp += 80;
      this.king.hp = this.king.maxHp;
    }
    if (def.toast) this.hud.toast(def.toast);

    if (def.repeatable && !(def.maxBuys && this.buyCount[def.id] >= def.maxBuys)) {
      pad.cost = this.padCost(def);
      pad.paid = 0;
      pad.popT = 0.35;
      this.drawPad(pad);
      // re-add ghosts for the next purchase
      const idx = this.pads.indexOf(pad);
      this.pads.splice(idx, 1);
      this.root.remove(pad.mesh);
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
    if (kind === 'wall') {
      this.wallSections(def.wall).forEach((sec, i) => {
        const w = { ...sec, hp: sec.gate ? WALLS.gateHp : WALLS.hp, maxHp: sec.gate ? WALLS.gateHp : WALLS.hp, state: 'built', mesh: null, bar: null };
        w.maxHp = w.hp;
        w.mesh = this.makeWallMesh(w);
        w.bar = makeHealthBar(2.6);
        w.bar.position.y = 2.2;
        w.mesh.add(w.bar);
        this.popIn(w.mesh, i * 0.12);
        this.root.add(w.mesh);
        this.walls.push(w);
      });
      return;
    }
    if (kind === 'corner-towers') {
      this.cornerTowerSpots().forEach(([x, z], i) => {
        const t = makeTower();
        t.position.set(x, 0, z);
        this.popIn(t, i * 0.15);
        this.root.add(t);
        for (let k = 0; k < 2; k++) this.addTurret(x - 0.5 + k * 1.0, z, t.userData.top);
      });
      return;
    }
    const m = this.makeStructureMesh(kind);
    m.position.set(def.buildAt[0], 0, def.buildAt[1]);
    this.popIn(m);
    this.root.add(m);
    if (kind === 'tower') {
      const top = m.userData.top;
      const n = CFG.tower.archers;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5;
        this.addTurret(def.buildAt[0] + Math.cos(a) * 0.6, def.buildAt[1] + Math.sin(a) * 0.6, top);
      }
    }
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
    this.popping = this.popping || [];
    this.popping.push(obj);
  }

  // ---------- walls ----------
  wallSections(name) {
    const b = WALLS.bounds;
    return WALLS[name].map((sec, i) => {
      const gate = !!sec.gate;
      const [a0, a1] = gate ? sec.gate : sec;
      const alongX = name === 'south' || name === 'north';
      const fixed = name === 'south' ? b.z1 : name === 'north' ? b.z0 : name === 'east' ? b.x1 : b.x0;
      return { id: `${name}-${i}`, wall: name, alongX, a0, a1, fixed, gate };
    });
  }

  cornerTowerSpots() {
    const b = WALLS.bounds;
    return [[b.x0 + 1.6, b.z0 + 1.6], [b.x1 - 1.6, b.z0 + 1.6], [b.x1 - 1.6, b.z1 - 1.6], [b.x0 + 1.6, b.z1 - 1.6]];
  }

  makeWallMesh(sec) {
    const len = sec.a1 - sec.a0;
    const m = sec.gate ? makeGate() : makeFence(len);
    const mid = (sec.a0 + sec.a1) / 2;
    if (sec.alongX) m.position.set(mid, 0, sec.fixed);
    else {
      m.position.set(sec.fixed, 0, mid);
      m.rotation.y = Math.PI / 2;
    }
    return m;
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

  damageWall(w, dmg) {
    if (w.state !== 'built') return;
    w.hp -= dmg;
    setHealthBar(w.bar, Math.max(0, w.hp / w.maxHp));
    w.mesh.position.y = 0.06;
    audio.wallHit();
    if (w.hp <= 0) this.breakWall(w);
  }

  breakWall(w) {
    w.state = 'broken';
    this.root.remove(w.mesh);
    w.mesh = makeRubble(w.a1 - w.a0);
    const mid = (w.a0 + w.a1) / 2;
    if (w.alongX) w.mesh.position.set(mid, 0, w.fixed);
    else {
      w.mesh.position.set(w.fixed, 0, mid);
      w.mesh.rotation.y = Math.PI / 2;
    }
    this.root.add(w.mesh);
    this.hud.toast(w.gate ? 'The gate is down!' : 'A wall section has fallen!', 1600);
    // a repair pad appears just inside the gap
    const c = WALLS.center;
    const inward = w.alongX ? Math.sign(c[1] - w.fixed) : Math.sign(c[0] - w.fixed);
    const pos = w.alongX ? [mid, w.fixed + inward * 2.6] : [w.fixed + inward * 2.6, mid];
    this.dynamicPads.push({ id: `repair-${w.id}-${this.time.toFixed(0)}`, pos, cost: WALLS.repairCost, icon: '🔨', label: w.gate ? 'Repair Gate' : 'Repair Wall', repair: w });
    this.refreshPads();
  }

  restoreWall(w) {
    this.root.remove(w.mesh);
    w.state = 'built';
    w.hp = w.maxHp;
    w.mesh = this.makeWallMesh(w);
    w.bar = makeHealthBar(2.6);
    w.bar.position.y = 2.2;
    w.mesh.add(w.bar);
    this.popIn(w.mesh);
    this.root.add(w.mesh);
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
      const army = this.units.length - 1;
      this.hud.set(this.coinsCarried, Math.max(1, this.wave), army);
    }
    this.updateEffects(dt);
    this.updateStack(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updatePlayer(dt) {
    const k = this.king;
    const inp = this.input.read();
    const speed = k.stats.speed;
    k.vel.set(inp.x * speed, 0, inp.z * speed);
    const p = k.mesh.position;
    p.x += k.vel.x * dt;
    p.z += k.vel.z * dt;
    const half = CFG.world.size / 2 - 3;
    p.x = THREE.MathUtils.clamp(p.x, -half, half);
    p.z = THREE.MathUtils.clamp(p.z, -half, half);
    // keep the king off the cliffs
    if (p.x < -8 && p.z < -14) {
      if (-8 - p.x < -14 - p.z) p.x = -8;
      else p.z = -14;
    }
    this.collideWalls(p, 0.55, true);
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
    this.ring.position.set(p.x, 0.04, p.z);
    const rr = 2.4 + Math.sqrt(Math.max(0, this.units.length - 1)) * 0.45;
    this.ring.scale.setScalar(rr / 2.4);
    this.ringRadius = rr;
  }

  updateArmy(dt) {
    const kp = this.king.mesh.position;
    const followers = this.units.filter((u) => u !== this.king);
    followers.forEach((u, i) => {
      u.cooldown -= dt;
      if (u.popT > 0) {
        u.popT -= dt;
        const s = 1 - Math.max(0, u.popT / 0.4);
        u.mesh.scale.setScalar(0.01 + s * (1 + Math.sin(s * Math.PI) * 0.25));
        if (u.popT <= 0) u.mesh.scale.setScalar(1);
      }
      // formation slot: rings around the king; swordsmen take the front/outer slots
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
      this.faceTowards(e.mesh, t.mesh.position, dt, 8);
      let blocked = null;
      if (d > reach) {
        tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - reach + 0.01));
        p.add(tmp2);
        blocked = this.collideWalls(p, e.radius, false);
        this.animateWalk(e, blocked ? 0.4 : 1, dt);
      }
      if (blocked) {
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          e.mesh.userData.body.rotation.x = 0.6;
          this.damageWall(blocked, e.stats.damage * (e.stats.aoe ? 2 : 1));
          if (e.stats.aoe) this.shake = 0.2;
        }
      } else if (d <= reach) {
        this.animateWalk(e, 0, dt);
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          e.mesh.userData.body.rotation.x = 0.6;
          if (e.stats.aoe) {
            for (const u of this.units) {
              if (u.mesh.position.distanceTo(p) < e.stats.aoe + 1) this.damageUnit(u, e.stats.damage);
            }
            this.shake = 0.25;
          } else this.damageUnit(t, e.stats.damage);
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
      // hit flash squash
      if (e.flash > 0) {
        e.flash -= dt;
        const s = e.type === 'boss' ? 1 : 1;
        e.mesh.scale.set(s * 1.15, s * 0.85, s * 1.15);
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
          this.coinsCarried++;
          this.coinsEarned++;
          this.comboTimer = 0.6;
          audio.coin(this.coinCombo++);
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
        if (f.pad.paid >= f.pad.cost && this.pads.includes(f.pad)) this.completePad(f.pad);
      }
    }
  }

  stackCount() {
    return Math.min(this.coinsCarried, this.stack.length);
  }

  updatePads(dt) {
    const kp = this.king.mesh.position;
    this.spendTimer -= dt;
    for (const pad of this.pads) {
      // pop-in / settle animation
      const s = pad.mesh.scale.x;
      if (s < 1) pad.mesh.scale.setScalar(Math.min(1, s + dt * 4));
      else if (s > 1) pad.mesh.scale.setScalar(Math.max(1, s - dt * 0.8));
      const inside = kp.distanceTo(pad.mesh.position) < CFG.spend.padRadius;
      const pending = this.flyCoins.filter((f) => f.pad === pad).length;
      if (inside && this.coinsCarried > 0 && pad.paid + pending < pad.cost && this.spendTimer <= 0) {
        this.spendTimer = CFG.spend.tick;
        this.coinsCarried--;
        audio.ching();
        const c = makeCoin();
        c.position.copy(kp);
        c.position.y = 2.4 + this.stackCount() * 0.11;
        this.root.add(c);
        this.flyCoins.push({ mesh: c, from: c.position.clone(), to: new V3(pad.mesh.position.x, 0.4, pad.mesh.position.z), t: 0, pad });
      }
      for (const g of pad.ghosts) g.position.y = Math.sin(this.time * 2 + g.position.x) * 0.06;
    }
  }

  updateWaves(dt) {
    // trickle in queued spawns
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.spawnEnemy(s.type, s.x, s.z);
        this.spawnQueue.splice(i, 1);
      }
    }
    this.waveTimer -= dt;
    if (this.enemies.length === 0 && this.spawnQueue.length === 0 && this.wave > 0 && this.waveTimer > CFG.waves.graceAfterClear) {
      this.waveTimer = CFG.waves.graceAfterClear;
    }
    if (this.waveTimer <= 0) this.startWave();
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
    if (this.popping) {
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
