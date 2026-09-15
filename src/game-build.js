// Building: the pads, what they cost, what they put on the field, and the walls and Keep they
// put there. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, PADS, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeRigged } from './rig.js';
import { pickOffer } from './upgrades.js';
import {
  makeKing, makeKeep, makeResourceCube, makeArcher, makeSwordsman, makeCoin, makeHut, makeTower, makeBarracks, makeWallSegment, makeGate, makeRubble, makeBridge, makePad, drawPad, ghostify, makeHealthBar, setHealthBar, makeBank, makeGatePost,
} from './models.js';
import { V3, HAIR, plural, PAD_STYLE, rand } from './game-shared.js';

export const BuildMethods = {
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
  },

  padCost(def) {
    if (def.crew) return def.crew;
    const n = this.buyCount[def.id] || 0;
    return def.cost + (def.growth || 0) * n;
  },

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
  },

  padKind(def) {
    if (def.structure || def.wall || def.bridge || def.effect === 'expand' || def.repair || def.repairKeep) return 'build';
    if (def.units) return 'recruit';
    if (def.crew) return 'crew';
    if (def.exchange) return 'trade';
    if (def.feed) return 'feed';
    return 'upgrade';
  },

  // the level a marker shows, where the thing it points at has one
  padSub(def) {
    if (def.feed) return `Level ${this.baseLevel}`;
    if (def.towerUp && this.towers[def.towerUp]) return `Level ${this.towers[def.towerUp].level}`;
    if (def.tower && this.towers[def.tower]) return `Level ${this.towers[def.tower].level}`;
    if (def.maxBuys) return `${this.buyCount[def.id] || 0} of ${def.maxBuys}`;
    return null;
  },

  // the short name on the floor: the full label is often too long to read at a glance
  padName(def) {
    if (def.feed) return 'Royal Keep';
    if (def.towerUp) return 'Watchtower';
    return def.label;
  },

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
  },

  // the material the village is built in right now: follows the walls
  materialName() {
    return CFG.wallLevels[this.wallLevel].name.toLowerCase();
  },

  makeStructureMesh(kind, level = 1) {
    const m = this.materialName();
    if (kind === 'bank') return makeBank();
    if (kind === 'hut') return makeHut(m);
    if (kind === 'keep') return makeKeep(m);
    if (kind === 'tower') return makeTower(level, m);
    if (kind === 'barracks') return makeBarracks(m);
    return new THREE.Group();
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  keepHp() {
    // a flat climb per level, plus a real step each time the walls change material
    const tiers = CFG.base.wallAt.filter((lv) => lv <= this.baseLevel).length - 1;
    return CFG.keep.hp + Math.max(0, this.baseLevel - 1) * CFG.keep.hpPerLevel + Math.max(0, tiers) * CFG.keep.materialBonus;
  },

  // ---------- the Keep as the base: feed it materials to level up ----------
  levelReq() {
    return CFG.base.levels[this.baseLevel] || null;
  },

  addFeedPad() {
    // #34: rubble takes no materials. Without this the repair was optional: you could keep levelling
    // a Keep that was not standing, and losing it cost nothing.
    if (!this.keep || this.keep.state !== 'built' || !this.levelReq() || this.feedDef) return;
    // the feed pad sits at the Keep's front door
    this.feedDef = { id: 'feed', pos: [this.keep.x, this.keep.z + 3.7], cost: 0, icon: 'keep', label: 'Feed the Keep', repeatable: true, feed: true };
    this.dynamicPads.push(this.feedDef);
    this.refreshPads();
  },

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
  },

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
  },

  // Keep level needed before a recruit pad can add its units; null if it can recruit now
  padLocked(def) {
    if (!def.units) return null;
    const wanted = this.unitCount(def.units.type) + def.units.count;
    if (wanted <= this.unitCap(def.units.type)) return null;
    const t = def.units.type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    for (let l = 0; l < t.length; l++) if (t[l] >= wanted) return l;
    return CFG.base.maxLevel;
  },

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
        c.position.y = this.stackBase() + this.stackCount() * 0.11;
        this.root.add(c);
        this.flyCoins.push({ mesh: c, from: c.position.clone(), to: new V3(pad.mesh.position.x, 0.4, pad.mesh.position.z), t: 0, pad });
      }
      for (const g of pad.ghosts) if (!pad.def.wall && !pad.def.repair) g.position.y = Math.sin(this.time * 2 + g.position.x) * 0.06 + (pad.def.crew ? 0 : 0);
    }
  },

  padPaid(pad) {
    return pad.paid >= pad.cost && pad.res.every((r) => r.paid >= r.need);
  },

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
  },

  queenLeaveKeep() {
    const q = this.queen;
    if (!q.inKeep) return;
    q.inKeep = false;
    q.mesh.position.set(this.keep.x + 2.6, 0, this.keep.z + 2.6);
  },

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
  },

  // #34: the feed pad goes with the Keep and comes back with it
  dropFeedPad() {
    if (!this.feedDef) return;
    const i = this.dynamicPads.indexOf(this.feedDef);
    if (i >= 0) this.dynamicPads.splice(i, 1);
    this.feedDef = null;
    this.refreshPads();
  },

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
  },

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
  },

  expand() {
    if (this.tier < TIERS.length - 1) this.tier++;
  },

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
  },

  popIn(obj, delay = 0, baseScale = 1) {
    obj.scale.setScalar(0.01);
    obj.visible = delay <= 0;
    obj.userData.popT = 0.45 + delay;
    obj.userData.baseScale = baseScale;
    this.popping.push(obj);
  },

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
  },

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
  },

  wallHp(sec, level = this.wallLevel) {
    const lv = CFG.wallLevels[level];
    return (sec.gate ? lv.gateHp : lv.hp) * this.mods.wallHp;
  },

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
  },

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
  },

  removePadDef(def) {
    const pad = this.pads.find((p) => p.def === def);
    if (pad) {
      for (const g of pad.ghosts) this.root.remove(g);
      this.root.remove(pad.mesh);
      this.pads.splice(this.pads.indexOf(pad), 1);
    }
    const di = this.dynamicPads.indexOf(def);
    if (di >= 0) this.dynamicPads.splice(di, 1);
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  restoreWall(w) {
    this.rebuildWall(w, this.wallLevel);
  },

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
  },

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
  },

  // Give back the pause an offer took, and only that one: a pause the player asked for stays.
  endOfferPause() {
    if (!this.offerPaused || this.over || this.won) return;
    this.offerPaused = false;
    this.paused = false;
    this.running = true;
    this.hud.hidePause();
  },

  unitCount(type) {
    let n = 0;
    for (const u of this.units) if (u.type === type) n++;
    if (type === 'archer') n += this.turrets.length;
    return n;
  },

  unitCap(type) {
    const t = type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    return t[Math.min(this.baseLevel, t.length - 1)] + (type === 'archer' ? this.mods.towerSlots * 4 : 0);
  },
};
