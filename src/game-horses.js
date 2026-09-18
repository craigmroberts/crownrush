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
import { CFG, PADS } from './config.js';
import { makeHorse } from './models.js';
import { V3, tmp, rand } from './game-shared.js';

// where the rider sits: the King's own seat on the same horse (characters.js), and his scale on it
const SEAT = [0, 0.95, -0.05];
const SEAT_SCALE = 0.92;

export const HorseMethods = {
  // horses standing in the yard: what "Mount a Swordsman" can still spend
  yardHorses() {
    let n = 0;
    for (const h of this.horses) if (h.state === 'yard') n++;
    return n;
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
    const h = this.horses.find((x) => x.state === 'yard');
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
