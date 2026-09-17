// The raiders: what a wave is made of, how each kind behaves, and the Queen being taken and
// got back. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeRigged } from './rig.js';
import { makeKnight, makeElite, makeBrute, makeBoss, makeCoin, makeHealthBar, setHealthBar } from './models.js';
import { tmp, tmp2, rand, randInt } from './game-shared.js';

export const EnemiesMethods = {
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
  },

  spawnEnemy(type, x, z, rank = 0) {
    const stats = CFG.enemy[type];
    rank = Math.min(rank, CFG.ranks.length - 1);
    const rk = CFG.ranks[rank];
    const rigName = { knight: 'raider', thief: 'raider', sapper: 'raider', archer: 'archer', shield: 'elite' }[type] || type;
    const rig = makeRigged(rigName, this.rankTints(type, rk));
    const mesh = rig ? rig.mesh : type === 'boss' ? makeBoss() : type === 'brute' ? makeBrute() : type === 'elite' ? makeElite() : makeKnight();
    mesh.position.set(x, 0, z);
    const w = Math.max(1, this.raidNight());   // #58: the raid's clock, not the calendar's
    const L = Math.max(0, this.baseLevel - 1);
    // waves, rank and Keep level all scale the enemy
    const hpMul = this.enemyHpMul(rank);
    const dmgMul = (1 + CFG.waves.dmgGrowthPerWave * (w - 1)) * rk.damage * (1 + CFG.base.enemyDmgPerLevel * L);
    if (!this.rankSeen[rank] && this.running) {
      this.rankSeen[rank] = true;
      if (rank > 0) this.hud.toast(`${rk.name}s have arrived! Watch for their colours.`, 2800, 'Raid');
    }
    const intro = { sapper: 'Sappers! They ignore your army and go for the walls.', archer: 'Enemy archers! They outrange a new tower and shoot the crews: go out and get them, or build the towers up.', shield: 'Shieldbearers! Arrows bounce off the front. Hit them from behind.' }[type];
    if (intro && !this.typeSeen[type] && this.running) {
      this.typeSeen[type] = true;
      this.hud.toast(intro, 3600, 'Raid');
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
  },

  startWave() {
    if (this.wave > 0) {
      const soldiers = this.units.length - 2 + this.turrets.length;
      this.addScore(CFG.score.waveClear * this.wave + soldiers * CFG.score.soldierPerWave);
    }
    this.wave++;
    const w = this.wave;
    // #58: every ramp below is "by night N of thirty" and is read off the raid's clock rather than
    // the calendar, so a short run gets the whole curve in half the nights instead of half the curve.
    // `w` is still the calendar: the toast at the bottom, and the boss rhythm, which is a beat the
    // player counts ("every fifth night") and lands at the same density either way -- 3 boss nights
    // of 15, 6 of 30. What scales is how big each one is.
    const rw = this.raidNight();
    const list = [];
    const L = this.baseLevel;
    const knights = 4 + Math.round(rw * 2.2);
    for (let i = 0; i < knights; i++) list.push('knight');
    const brutes = L >= CFG.waves.bruteAt.level || rw >= CFG.waves.bruteAt.wave;
    const elites = L >= CFG.waves.eliteAt.level || rw >= CFG.waves.eliteAt.wave;
    if (brutes && rw >= 3) for (let i = 0; i < Math.floor((rw - 2) * 1.3); i++) list.push('brute');
    if (elites && rw >= 8) for (let i = 0; i < Math.floor((rw - 6) * 0.8); i++) list.push('elite');
    // the rule-breakers, each once the RAID has reached its level -- the Keep's if it is ahead, the
    // night count's if the Keep has stalled, so declining to level no longer skips them entirely
    const RL = this.raidLevel();
    if (RL >= CFG.enemy.sapper.fromLevel && rw >= 3) for (let i = 0; i < Math.min(4, 1 + Math.floor((rw - 3) * 0.5)); i++) list.push('sapper');
    if (RL >= CFG.enemy.archer.fromLevel && rw >= 4) for (let i = 0; i < Math.min(5, 1 + Math.floor((rw - 4) * 0.4)); i++) list.push('archer');
    if (RL >= CFG.enemy.shield.fromLevel && rw >= 5) for (let i = 0; i < Math.min(5, 1 + Math.floor((rw - 5) * 0.4)); i++) list.push('shield');
    if (w % CFG.waves.bossEvery === 0) for (let i = 0; i < Math.floor(rw / 10) + 1; i++) list.push('boss');
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    // mostly the current rank, some lower ranks, and at most a couple of scouts from the next rank
    // up so the player can see what is coming
    const top = this.topRank();
    const scoutSet = new Set();
    if (top < CFG.ranks.length - 1 && rw >= CFG.waves.scouts.from) {
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
    // raiding parties come from 1-3 directions -- on the raid's clock like every other night ramp,
    // so full flanking arrives a fifth of the way into the run at either length rather than at an
    // absolute night 6 that is a fifth of a long run and a third of a short one.
    const dirs = 1 + Math.min(2, Math.floor(rw / 3));
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
    this.hud.toast(boss ? `Blood moon! Night ${w} brings a boss.` : `Night ${w} falls.`, 2200, 'Raid');
  },

  // The level the RAID is fought at, as opposed to the level the Keep stands at. The higher of the
  // two, so the Keep can carry the player ahead of the nights but never behind them (#49).
  raidLevel() {
    // #58: on the raid's clock, like every other nights-per-something number. `rankFloor` is pinned
    // against a thirty-night run (config.js), so read off the calendar the floor at fifteen nights
    // would top out at level 5 and the anti-turtle guard #49 exists for would not apply to half the
    // game's runs -- a short run could stall at Keep 6 and never meet a Marauder.
    return Math.max(this.baseLevel, Math.floor(this.raidNight() / CFG.waves.rankFloor));
  },

  topRank() {
    let top = 0;
    CFG.ranks.forEach((r, i) => { if (r.fromLevel <= this.raidLevel()) top = i; });
    return top;
  },

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
    q.seize = 0;
    q.held = false;
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
    this.raiseAlarm('They have Wren!', 'fear');
    this.hud.toast('They are carrying Wren to the edge of the map. Cut the escort down.', 3800, 'Wren');
    audio.wave(true);
  },

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
  },

  // Enemy archer: closes to just inside its range on the nearest soldier or tower crew, then holds and shoots.
  updateEnemyArcher(e, dt) {
    const p = e.mesh.position;
    e.cooldown -= dt;
    e.retarget -= dt;
    if (e.retarget <= 0 || !e.target || e.target.hp <= 0) {
      e.retarget = 0.6;
      let best = null;
      let bd = Infinity;
      const shootable = this._shootable || (this._shootable = []);
      shootable.length = 0;
      for (const u of this.units) shootable.push(u);
      for (const t of this.turrets) shootable.push(t);
      for (const u of shootable) {
        if (u.inKeep || u.captive) continue;
        // #83: she cannot be hurt, and an archer holding at 15 units cannot get hold of her either,
        // so one that picked her would stand there shooting a target it can never affect for the
        // rest of the night. Let it find something it can actually do something about.
        if (u.type === 'queen') continue;
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
  },

  // What a raider of this rank arrives with, as a multiple of its type's base HP. Shared with the
  // raid meter, which has to price the ones still walking in.
  enemyHpMul(rank) {
    const rk = CFG.ranks[Math.min(rank, CFG.ranks.length - 1)];
    const w = Math.max(1, this.raidNight());   // #58: the raid's clock, not the calendar's
    const L = Math.max(0, this.baseLevel - 1);
    return (1 + CFG.waves.hpGrowthPerWave * (w - 1)) * rk.hp * (1 + CFG.base.enemyHpPerLevel * L);
  },

  enemyMaxHp(type, rank) {
    const stats = CFG.enemy[type];
    return stats ? stats.hp * this.enemyHpMul(rank) : 0;
  },

  // What is left of tonight's raid: health still standing, plus health still on its way in, and a
  // head count of both. Written into a scratch object rather than a fresh one, because this runs
  // every frame.
  //
  // The spawn queue counts. A wave arrives staggered over several seconds, and a meter that ignored
  // what had not landed yet would climb while they walked on and only then start falling -- it would
  // be measuring the spawner rather than the fight.
  //
  // The Queen's guards count. They are not a raid, but they are a fight -- the FIRST one, before
  // anything has been explained -- and "how many are left" is the same question there. Leaving them
  // out taught a new player that the meter does not apply to fights before they learned it applies
  // to raids. The camp is different and stays out while it sleeps: its garrison stands across the
  // map from the opening frame, and counting it would put a meter on screen for a fight nobody is
  // in. It counts itself in the moment updateCampSleeper wakes it and clears `camp`.
  raidRemaining(out) {
    out.hp = 0;
    out.count = 0;
    for (const e of this.enemies) {
      if (e.camp) continue;
      out.hp += Math.max(0, e.hp);
      out.count++;
    }
    for (const s of this.spawnQueue) {
      out.hp += this.enemyMaxHp(s.type, s.rank || 0);
      out.count++;
    }
    return out;
  },

  // enemies out raiding: not the Queen's guards, not the camp's sleeping garrison
  activeEnemies() {
    return this.enemies.filter((e) => !e.captor && !e.camp);
  },

  // Is anyone out raiding? The callers that ask this only ever compared the list's length to zero,
  // which built and threw away an array of every enemy on the field to answer a yes or no -- once a
  // frame, on the list that is longest exactly when the game is busiest.
  anyActiveEnemy() {
    for (const e of this.enemies) if (!e.captor && !e.camp) return true;
    return false;
  },

  // Did the day phase pass `mark` between these two readings, wrap included?
  crossedPhase(from, to, mark) {
    return (from < mark && to >= mark) || (to < from && (from < mark || to >= mark));
  },

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
      this.hud.toast(this.finaleOpen ? 'The Warlord stands. He has been waiting for this.' : 'The whole camp is up and you are one man. Run.', 3000, 'Raid');
      audio.wave(true);
      return;
    }
    e.moving = false;
    this.animateWalk(e, 0, dt);
  },

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
        this.hud.toast('The camp breaks off the chase and falls back.', 3200, 'Raid');
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
  },

  // the Warlord calls reinforcements from his tents while he lives
  chiefCall(e) {
    const F = CFG.finale;
    e.lastCall = this.time;
    const top = this.topRank();
    for (let i = 0; i < F.callCount; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawnEnemy(i === 0 ? 'shield' : 'knight', F.pos[0] + Math.cos(a) * F.radius * 0.8, F.pos[1] + Math.sin(a) * F.radius * 0.8, top);
    }
    this.hud.toast('The Warlord calls his men from the tents!', 2200, 'Raid');
    audio.alarm();
  },

  // #35: send a thief when the King is carrying something worth stealing, asked repeatedly through
  // the night rather than decided once when the night began. A player who spends coins as he earns
  // them holds almost nothing at nightfall, which is why thieves were never seen.
  maybeSendThief(dt) {
    const th = CFG.waves.thieves;
    this.thiefTimer = (this.thiefTimer || 0) - dt;
    if (this.thiefTimer > 0) return;
    this.thiefTimer = th.every;
    // #58: the calendar, deliberately, and the one nights-number in the file that is NOT on the raid's
    // clock. `fromWave: 2` is not a difficulty ramp -- it is "not on the player's first night", a
    // grace that reads the same at either length. On the raid's clock a short run would have thieves
    // from night 1, which is the first night anybody ever plays, since short is the default.
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
  },

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
      this.hud.toast(`A thief has your coins! Cut them down before they reach the edge.`, 3000, 'Raid');
      this.popup(`-${take}`, p, '#ff9a9a', 1.8);
      audio.hurt();
    }
    e.moving = d > 1.1;
    this.animateWalk(e, e.moving ? 1 : 0, dt);
  },

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
  },

  thiefEscapes(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.root.remove(e.mesh);
    this.disposeEntity(e.mesh);
    this.hud.toast(`The thief escaped with ${e.carrying} coins.`, 2600, 'Raid');
    audio.wallHit();
  },

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
              if (u.mesh.position.distanceTo(p) < e.stats.aoe + 1) this.damageUnit(u, e.damage, p);
            }
            if (this.keep && this.keep.state === 'built' && this.keep.mesh.position.distanceTo(p) < e.stats.aoe + 2.5) this.damageWall(this.keep, e.damage * 2);
            this.shake = 0.25;
          } else if (t.isKeep) this.damageWall(t, e.damage);
          else this.damageUnit(t, e.damage, e.mesh.position);
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
  },

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
    const cleared = !this.anyActiveEnemy() && this.spawnQueue.length === 0;
    // Nothing attacks the King until he takes the Queen back (#12): the raids ARE the enemy coming
    // for her, so while she is captive the clock stands still and it stays daylight.
    if (this.queen.captive) return;

    // #15: the sun is the timer. Raids come at nightfall and the wave number is the night number.
    const cy = CFG.cycle;
    const prev = this.dayPhase;
    let next = (this.dayPhase + dt / cy.length) % 1;
    // #73: hold the sun at the horizon while the raid is still standing, up to `holdDawn` seconds.
    // The clamp sits a hair short of dawn so the crossing test keeps firing every frame it is held;
    // the moment the field clears -- or the cap runs out -- the clamp lifts and the frame after it
    // crosses for real.
    if (this.night && !cleared && this.crossedPhase(prev, next, cy.dawn) && this.dawnHeld < cy.holdDawn) {
      this.dawnHeld += dt;
      next = cy.dawn - 1e-4;
      if (!this.dawnHolding) {
        this.dawnHolding = true;
        this.hud.toast('The sun waits. Finish them before it rises.', 3000, 'Raid');
      }
    }
    this.dayPhase = next;
    const crossed = (from, to, mark) => this.crossedPhase(from, to, mark);

    if (!this.night && this.dayPhase >= cy.nightStart - cy.warn / cy.length && this.dayPhase < cy.nightStart && !this.duskWarned) {
      this.duskWarned = true;
      this.hud.toast('The sun is going down. Get behind your walls.', 2600, 'Raid');
    }
    if (!this.night && crossed(prev, this.dayPhase, cy.nightStart)) {
      this.night = true;
      this.duskWarned = false;
      this.dawnHeld = 0;
      this.dawnHolding = false;
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
  },

  // The reward beat: you held the night, here is the day to rebuild in.
  dawnBreaks(cleared) {
    this.dawnHolding = false;
    if (this.wave <= 0) return;
    // #50: the run is written down here, on the one beat where there is nothing in flight to write.
    this.saveRun();
    if (cleared) {
      this.addScore(CFG.score.waveClear * this.wave);
      this.hud.toast(`Dawn. You held night ${this.wave}.`, 3000, 'Raid');
      audio.unlock();
    } else {
      this.hud.toast('Dawn, but raiders are still inside the walls.', 2800, 'Raid');
    }
  },

  // "Bring on the night": skip the rest of the daylight for points
  callWave() {
    if (!this.running || this.night || this.waveTimer <= 0 || this.queen.captive) return;
    const bonus = Math.floor(this.waveTimer) * CFG.score.earlyWavePerSecond;
    if (bonus > 0) {
      this.addScore(bonus);
      this.hud.toast(`Night called early: +${bonus} points`, 1400, 'Raid');
    }
    this.dayPhase = CFG.cycle.nightStart - 1e-4;
    this.duskWarned = false;
  },

  // Nearest map edge reachable WITHOUT crossing the river (a runner that had to cross would pin
  // itself against the bank and never leave).
  edgeExit(p) {
    const half = CFG.world.size / 2 - 4;
    const mySide = this.world.riverInfo(p.x, p.z).side;
    const cands = [{ x: half, z: p.z }, { x: -half, z: p.z }, { x: p.x, z: half }, { x: p.x, z: -half }];
    cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return cands.find((c) => this.world.riverInfo(c.x, c.z).side === mySide) || cands[0];
  },

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
  },

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
  },

  freeQueen() {
    const q = this.queen;
    q.captive = false;
    this.refreshPads();          // pads held back until the rescue can appear now
    q.seize = 0;
    q.held = false;
    setHealthBar(q.bar, 1);
    tmp.copy(q.mesh.position).setY(1.0);
    this.heartFx(tmp, 14, 1.2);
    this.heartTimer = 9;
    audio.unlock();
    this.addScore(CFG.score.rescue);
    // taking her back is what brings the raiders: wind the sun to just before dusk
    this.dayPhase = (CFG.cycle.nightStart - CFG.rescue.firstRaid / CFG.cycle.length + 1) % 1;
    this.duskWarned = false;
    this.hud.toast('Wren is on her feet. "Get me home -- then we settle this."', 3400, 'Wren');
    this.raidWarning = this.time + 3.6;
    this.refreshPads();
  },

  // #83: how the Queen is lost now. Raiders that have chosen her and reached her get hold of her,
  // and enough of them holding on for long enough carry her off. She is never hurt on the way.
  //
  // Only raiders that are actually AFTER her count, not every body standing near her. She follows
  // the King at 1.9 (CFG.queen.follow) and a knight's grip reaches 1.7, so anyone fighting HIM from
  // her side of the scrum is already inside it: counting bodies would have handed her over in the
  // middle of a fight he was winning, with nothing on screen to explain why. Requiring that they
  // chose her is what turns `targetWeight` into the rule it always looked like -- he faces the
  // fight, and they come round the back for her.
  //
  // Returns true if they got her, because the rest of updateQueen would then be walking a Queen who
  // is already halfway to the map edge.
  updateSeize(dt) {
    const q = this.queen;
    const S = CFG.queen.seize;
    const p = q.mesh.position;
    let hands = 0;
    for (const e of this.enemies) {
      if (e.target !== q) continue;
      // Measured off its own size, because that is what updateEnemy stops it at. A boss halts 2.9
      // away and a knight 1.2, so one number for both would have let the biggest thing in the game
      // stand next to her doing nothing at all.
      const r = e.radius + S.grip;
      if (e.mesh.position.distanceToSquared(p) < r * r) hands++;
    }
    // On hands going from none to some, not on the meter leaving zero: after a rescue she starts
    // part-way down (`shaken`), and that is exactly when a second grab must still be announced. The
    // old alarm fired on every point of damage she took, so the warning arrived as a stutter during
    // the emergency rather than at the start of it.
    if (hands > 0 && !q.held) this.raiseAlarm('They have hold of Wren!', 'fear');
    q.held = hands > 0;

    const was = q.seize;
    q.seize = hands > 0
      ? Math.min(1, was + dt * (1 + (hands - 1) * S.perExtra) / S.grab)
      : Math.max(0, was - dt / S.slip);
    if (q.seize === was) return false;     // at rest, which is most frames: nothing to redraw
    // `1 - seize` rather than `seize`: this is the bar the player has spent the whole run reading as
    // "how much of them is left", and setHealthBar hides itself at full -- so she carries nothing
    // over her head until somebody has her, which is the only moment it has anything to say.
    setHealthBar(q.bar, 1 - q.seize);
    if (q.seize >= 1) {
      this.captureQueen();
      return true;
    }
    return false;
  },

  updateQueen(dt) {
    const q = this.queen;
    if (!q) return;
    // #126: the invariant, checked rather than assumed -- whenever Wren is free and the Keep is
    // built, walking the King to the door has to put her inside, and there must be no state in which
    // that fails. `inKeep` is the flag that can strand her: everything below returns immediately on
    // it, so if it is ever true while she is standing outside, the game believes she is home and the
    // player has no way left to get her there. That is the report this came from.
    //
    // Two ways it can go wrong, and both are answered here rather than hunted down one at a time:
    // the Keep stops being built underneath the flag, and her position drifts off the balcony the
    // flag claims she is on (a mesh replaced, a restore, anything future). A squared compare against
    // the balcony, once a frame, on a check that already returns on the same line.
    if (q.inKeep) {
      if (!this.keep || this.keep.state !== 'built') this.queenLeaveKeep();
      else {
        const b = this.keep.mesh && this.keep.mesh.userData.balcony;
        if (!b) this.queenLeaveKeep();
        else {
          tmp.set(this.keep.x + b.x, b.y, this.keep.z + b.z);
          if (q.mesh.position.distanceToSquared(tmp) > 0.01) this.queenToBalcony();
        }
      }
      return;
    }
    if (q.captive) return this.updateCaptive(dt);
    if (this.updateSeize(dt)) return;
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
    // passing an intact Keep, she steps inside (#106: measured to its wall, and a distance she can
    // actually reach -- see CFG.queen.doorReach)
    if (this.keep && this.keep.state === 'built' && this.keepWallGap(k.position) < CFG.queen.doorReach) return this.queenEnterKeep();
    q.moving = moving > 0.05;
    this.animateWalk(q, moving, dt);
  },

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
    // #55: a real flinch if it will read, the old squash if it will not. `hitAnim` declines on
    // anything mid-stride and the squash covers exactly that case -- see there for why.
    if (this.hitAnim(e)) {
      // Cancelling a squash has to UNDO it as well. The scale is only put back on the frame `flash`
      // crosses zero, so setting it to zero from anywhere above skips that frame and leaves the
      // body squashed for good -- which is two arrows, one landing while it walks and one after it
      // has stopped.
      if (e.flash > 0) e.mesh.scale.setScalar(e.scale);
      e.flash = 0;
    } else e.flash = 0.12;
    audio.hit();
    this.burstFx(hitPos, '#dff4ff', 0.9, 0.18);
    setHealthBar(e.bar, Math.max(0, e.hp / e.maxHp));
    this.popup(`-${Math.round(dmg)}`, hitPos, e.type === 'boss' ? '#ffffff' : '#ffe27a', e.type === 'boss' ? 2.6 : 1.4, e, dmg);
    // #55: the body falls away from whatever killed it, so the blow is readable in the fall
    if (e.hp <= 0) this.killEnemy(e, (from && from.mesh && from.mesh.position) || hitPos || null);
  },

  killEnemy(e, from = null) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    if (e.escort && this.queen.taken && !this.enemies.some((x) => x.escort)) this.rescueTaken();
    e.bar.visible = false;
    this.fell(e.mesh, from, 0.5);
    tmp.copy(e.mesh.position).setY(e.type === 'boss' ? 2.5 : 1.0);
    this.burstFx(tmp, '#ffffff', e.type === 'boss' ? 6 : 2.6, 0.38);
    if (e.carrying) {
      // everything it stole spills back out
      for (let i = 0; i < e.carrying; i++) this.dropCoin(e.mesh.position);
      this.hud.toast(`Thief cut down! ${e.carrying} coins recovered.`, 2400, 'Raid');
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
    } else if (e.type === 'boss') this.hud.toast('Boss defeated!', 1800, 'Raid');
  },

  // Take an enemy off the board without killing it: no coins, no score, no sound, no death spin.
  // killEnemy is what happens when the player earns it; this is what happens when an enemy belongs
  // to a part of the run that is over, which on a restore is the Queen's captors.
  removeEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    this.root.remove(e.mesh);
    this.disposeEntity(e.mesh);
  },

  // #115: `skip` is one enemy or a list of them. A list is what the King's Volley needs -- one arrow
  // per raider means each shot has to avoid everything the volley has already picked, not just the
  // first. An array is always short (three at the most), so `includes` costs less than a Set would.
  nearestEnemy(pos, range, skip = null) {
    let best = null;
    let bd = range * range;
    const skipped = (e) => (Array.isArray(skip) ? skip.includes(e) : e === skip);
    for (const e of this.enemies) {
      if (skipped(e) || e.captor) continue;
      const d = pos.distanceToSquared(e.mesh.position);
      const r = d - e.radius * e.radius * 2;
      if (r < bd) {
        bd = r;
        best = e;
      }
    }
    return best;
  },
};
