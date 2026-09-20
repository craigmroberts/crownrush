// #117: the horses in the Stable's yard, and the soldiers who ride them.
//
// The yard IS the capacity. Every horse standing in it is a swordsman who can still be put on
// horseback, and buying a horse puts one in the yard; mounting takes the horse OUT of it -- it walks
// to its rider -- so what is standing there is what is left, not what is owned. When a rider falls
// the horse is a horse again and trots home on its own, and the capacity comes back with it: a horse
// is a lasting investment and losing a rider costs the rider. Both were decided on the ticket. The
// trot home is also the only diegetic word the game has for "a soldier died out there", which
// matters now the army holds the grounds (#116) rather than standing where the player is looking.
//
// They are not in `units`, for the reason the villagers are not (game-villagers.js): nothing should
// target, guard or rally a horse. A MOUNTED horse is not in this list either -- the unit's mesh is
// the horse with the rider seated on it, and `u.mounted` is the whole of what the army code needs
// to know. The record comes back to this list the moment the rider is off it.
import { CFG, PADS, TIERS } from './config.js';
import { makeHorse } from './models.js';
import { V3, tmp, rand } from './game-shared.js';

// where the rider sits: the King's own seat on the same horse (characters.js), and his scale on it
const SEAT = [0, 0.95, -0.05];
const SEAT_SCALE = 0.92;

export const HorseMethods = {
  // horses standing in the yard: what "Mount a Swordsman" can still spend
  yardHorses() {
    let n = 0;
    // #217: never the King's. `yardHorses` is the capacity -- "the yard IS the capacity" (#117) --
    // so counting his would hand the army a free horse it never bought. He never enters `yard`
    // state, and this holds anyway, because the day somebody lets him stable himself is the day
    // that stops being true by construction.
    for (const h of this.horses) if (h.state === 'yard' && !h.royal) n++;
    return n;
  },

  // #217: the King's own loose horse, or null. There is only ever one -- `mountKing` removes it and
  // `dismountKing` is the only thing that makes one.
  royalHorse() {
    for (const h of this.horses) if (h.royal) return h;
    return null;
  },

  // #217: somewhere in the castle grounds to wander to. See `CFG.horse.royal.roam` for why it is the
  // tier's bounds at half extent and not the Stable's yard -- the short version is that a loose
  // horse must not need a Stable, because the legacy unlock starts a run mounted without one.
  roamPoint(out) {
    const b = TIERS[Math.min(this.tier, TIERS.length - 1)].bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const k = CFG.horse.royal.roam;
    const hw = ((b.x1 - b.x0) / 2) * k;
    const hd = ((b.z1 - b.z0) / 2) * k;
    return out.set(rand(cx - hw, cx + hw), 0, rand(cz - hd, cz + hd));
  },

  // #217: whistle. It breaks off whatever it was doing and gallops at him.
  callHorse() {
    const h = this.royalHorse();
    if (!h) return false;
    h.state = 'come';
    h.target = null;
    h.stats.speed = CFG.horse.royal.called;
    return true;
  },

  // #217: how far the King's horse is, or Infinity when he has none. The button reads this every
  // frame, so it is a number rather than a branch.
  royalHorseDist() {
    const h = this.royalHorse();
    if (!h) return Infinity;
    const p = this.king.mesh.position;
    return Math.hypot(h.mesh.position.x - p.x, h.mesh.position.z - p.z);
  },

  // A place in the yard for horse `i`: a loose two-by-two inside the fence, so four horses stand as
  // a group rather than a queue; the trough's corner and the bale's are outside it.
  yardSpot(i, out) {
    const y = this.stable.yard;
    const col = i % 2;
    const row = Math.floor(i / 2) % 2;
    return out.set(y.x - y.w / 4 + col * (y.w / 2) + rand(-0.3, 0.3), 0, y.z - y.d / 4 + row * (y.d / 2) + rand(-0.3, 0.3));
  },

  // anywhere inside the fence with room to turn round
  yardPoint(out) {
    const y = this.stable.yard;
    const m = 0.9;
    return out.set(rand(y.x - y.w / 2 + m, y.x + y.w / 2 - m), 0, rand(y.z - y.d / 2 + m, y.z + y.d / 2 - m));
  },

  addHorse(x, z, state = 'yard') {
    const mesh = makeHorse();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rand(0, Math.PI * 2);
    this.root.add(mesh);
    // `stats.speed` is what `walkRate` reads; a horse has no rig, so it only ever feeds the legs.
    const h = { mesh, state, target: null, idleT: rand(...CFG.horse.idle), walkT: 0, rider: null, left: false, stats: { speed: CFG.horse.walk } };
    this.horses.push(h);
    return h;
  },

  // "A Horse for the Yard" was bought: it pops in on the next spot
  addYardHorse() {
    if (!this.stable) return null;
    this.yardSpot(this.horses.length, tmp);
    const h = this.addHorse(tmp.x, tmp.z, 'yard');
    this.popIn(h.mesh);
    this.spawnFx(tmp.x, tmp.z, 0xffd166);
    return h;
  },

  // Who could ride: a swordsman, not already riding or spoken for, not posted to a tower. The
  // grounds first and the Guard last -- a rider is for covering ground, and a guard has the King's.
  riderCandidates() {
    return this.units.filter((u) => u.type === 'swordsman' && !u.mounted && !u.assign && !u.horseComing)
      .sort((a, b) => (a.guard ? 1 : 0) - (b.guard ? 1 : 0));
  },

  // "Mount a Swordsman": a yard horse sets off for him. `horseComing` is the promise, so a second
  // buy sends the next horse to the next man rather than two horses to one.
  sendHorse() {
    const h = this.horses.find((x) => x.state === 'yard' && !x.royal);   // #217: never the King's
    const u = this.riderCandidates()[0];
    if (!h || !u) return false;
    h.state = 'out';
    h.rider = u;
    h.left = false;
    h.target = null;
    h.stats.speed = CFG.horse.home;
    u.horseComing = h;
    return true;
  },

  riderStats() {
    return { ...CFG.swordsman, speed: CFG.swordsman.speed * CFG.horse.soldierSpeed * this.horseFactor() };
  },

  // The horse has reached its rider, or a restored run puts him straight on: the unit's mesh becomes
  // the horse with the rider seated on it. The horse group carries the walk (its legs and body) and
  // the rider's rig carries the clips, so `animateWalk`, `attackAnim` and `hitAnim` read the unit as
  // they always have; game.js keeps a seated rig on Idle rather than Walk.
  mountUnit(u, h = null) {
    if (u.mounted) return;
    const horse = h ? h.mesh : makeHorse();
    if (h) this.horses.splice(this.horses.indexOf(h), 1);
    const rider = u.mesh;
    horse.position.copy(rider.position);
    horse.rotation.set(0, rider.rotation.y, 0);
    horse.scale.setScalar(1);
    this.root.remove(rider);
    horse.add(rider);
    rider.position.set(...SEAT);
    rider.rotation.set(0, 0, 0);
    rider.scale.setScalar(SEAT_SCALE);
    // the built swordsman bends his legs like the King; a rig sits Idle, which is near enough
    if (rider.userData.legs) rider.userData.legs.forEach((l) => (l.rotation.x = -0.9));
    horse.userData.rig = rider.userData.rig || null;
    if (horse.parent !== this.root) this.root.add(horse);
    u.mesh = horse;
    u.rider = rider;
    u.mounted = true;
    u.horseComing = null;
    u.stats = this.riderStats();
    u.scale = 1;
    u.patrol = 0;
  },

  // The rider fell. He comes off where he sat and the caller topples him like anyone else; the
  // horse is a horse again, back in this list, and heads home. Returns the rider for `fell`.
  riderFell(u) {
    const horse = u.mesh;
    const rider = u.rider;
    rider.getWorldPosition(tmp);
    horse.remove(rider);
    this.root.add(rider);
    rider.position.set(tmp.x, 0, tmp.z);
    rider.rotation.set(0, horse.rotation.y, 0);
    rider.scale.setScalar(rider.userData.rig ? 1.05 : 1.2);
    horse.userData.rig = null;
    u.mounted = false;
    u.rider = null;
    u.mesh = rider;
    this.horses.push({ mesh: horse, state: 'home', target: null, idleT: 0, walkT: 0, rider: null, left: true, stats: { speed: CFG.horse.home } });
    return rider;
  },

  updateHorses(dt) {
    if (!this.horses.length) return;
    const H = CFG.horse;
    const gate = this.stable && this.stable.gate;
    for (const h of this.horses) {
      if (h.state === 'yard') {
        // stands a while, walks to somewhere else in the yard, stands again
        if (!h.target) {
          h.idleT -= dt;
          this.animateWalk(h, 0, dt);
          if (h.idleT <= 0) h.target = this.yardPoint(new V3());
          continue;
        }
        if (this.villagerWalkTo(h, h.target.x, h.target.z, dt, H.walk) < 0.3) {
          h.target = null;
          h.idleT = rand(...H.idle);
        }
      } else if (h.state === 'out') {
        const u = h.rider;
        // the man it was sent to is gone -- fell, or was posted to a tower -- so it goes back
        if (!u || !this.units.includes(u) || u.mounted) {
          if (u) u.horseComing = null;
          h.state = 'home';
          h.left = true;
          continue;
        }
        // out through the gap in the fence first, then straight for him wherever he is now
        if (!h.left && gate) {
          if (this.villagerWalkTo(h, gate.x, gate.z + 0.8, dt, H.home) < 0.5) h.left = true;
          continue;
        }
        const p = u.mesh.position;
        if (this.villagerWalkTo(h, p.x, p.z, dt, H.home) < H.reach) this.mountUnit(u, h);
      } else if (h.state === 'follow') {
        // #217: at his shoulder for a few seconds after he gets down, then it loses interest. The
        // anchor is behind him and turns with him -- the same shape as the Queen's follow (#181),
        // which is there so a horse never cuts across his front on a turn.
        const R = H.royal;
        h.followT -= dt;
        const kp = this.king.mesh.position;
        const a = this.king.mesh.rotation.y;
        this.villagerWalkTo(h, kp.x - Math.sin(a) * R.gap, kp.z - Math.cos(a) * R.gap, dt, R.called * 0.8);
        if (h.followT <= 0) {
          h.state = 'roam';
          h.target = null;
          h.idleT = rand(...H.idle);
          h.stats.speed = H.walk;
        }
      } else if (h.state === 'roam') {
        // The yard's own behaviour -- stand, wander, stand -- over the grounds instead of the fence.
        if (!h.target) {
          h.idleT -= dt;
          this.animateWalk(h, 0, dt);
          if (h.idleT <= 0) h.target = this.roamPoint(new V3());
          continue;
        }
        if (this.villagerWalkTo(h, h.target.x, h.target.z, dt, H.walk) < 0.3) {
          h.target = null;
          h.idleT = rand(...H.idle);
        }
      } else if (h.state === 'come') {
        // #217: called. It runs at him and STOPS BESIDE him -- it does not put him on. A horse that
        // mounts you on arrival takes the decision away at the exact moment you might have changed
        // your mind.
        const R = H.royal;
        const kp = this.king.mesh.position;
        if (this.villagerWalkTo(h, kp.x, kp.z, dt, R.called) < R.stop) {
          // Unless he already pressed Mount while it was closing, in which case the press stands and
          // he gets on as it arrives -- no waiting for an animation to finish.
          if (this.mountQueued) this.mountKing();
          else { h.state = 'wait'; h.stats.speed = H.walk; }
        }
      } else if (h.state === 'wait') {
        const R = H.royal;
        this.animateWalk(h, 0, dt);
        const kp = this.king.mesh.position;
        const d = Math.hypot(h.mesh.position.x - kp.x, h.mesh.position.z - kp.z);
        if (this.mountQueued) this.mountKing();
        // He walked off while it was standing there. It follows rather than being abandoned -- and
        // the slack is what stops it twitching between the two states while he shuffles about.
        else if (d > R.mountAt + 1.2) { h.state = 'come'; h.stats.speed = R.called; }
      } else if (h.state === 'home') {
        if (!this.stable) continue;
        // to the gap, then to a spot inside, then it is a yard horse again
        if (!h.target) {
          if (this.villagerWalkTo(h, gate.x, gate.z + 0.8, dt, H.home) < 0.6) h.target = this.yardSpot(this.yardHorses(), new V3());
          continue;
        }
        if (this.villagerWalkTo(h, h.target.x, h.target.z, dt, H.walk) < 0.3) {
          h.state = 'yard';
          h.target = null;
          h.idleT = rand(...H.idle);
          h.stats.speed = H.walk;
        }
      }
    }
  },

  // #82: the board's window on the block: the Stable stood, three horses in the yard, one swordsman
  // riding the ring of posts, and the King beside the mats so the camera is on it. Everything
  // through the real builders, so it shows what the game does and not a mock of it.
  showStableView() {
    const def = PADS.find((d) => d.id === 'stable');
    this.tier = Math.max(this.tier, 1);
    this.built.stable = true;
    this.buildStructure(def);
    this.buyCount['stable-horse'] = 3;
    for (let i = 0; i < 3; i++) {
      this.yardSpot(i, tmp);
      this.addHorse(tmp.x, tmp.z, 'yard');
    }
    // in the Guard, so he stands by the King in the frame rather than riding the ring out of it
    const u = this.spawnUnit('swordsman', this.stable.x + 5, this.stable.z + 2);
    u.popT = 0;
    u.guard = true;
    this.mountUnit(u);
    this.king.mesh.position.set(this.stable.x + 2.4, 0, this.stable.z + 6.8);
    this.king.mesh.rotation.y = Math.PI * 0.75;
    this.camLock = 21;
    this.camDist = 21;
    this.refreshPads();
  },
};
