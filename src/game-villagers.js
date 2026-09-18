// #48: the people who work. A farmer cuts the wheat, a lumberjack fells the trees, a miner works the
// rock and the seams. Each walks out to a node of its own type, works it, carries what it gets to the
// Trade Post and sells it, then goes again -- the same loop the King runs, slower, and while he is
// somewhere else.
//
// They are not in `units`. Everything in that array is something archers guard, enemies pick as a
// target and the army rallies to; a villager is none of those, and putting them there would have had
// raiders hunting the farm hands. They live in their own list with their own update, and the only
// thing the rest of the game knows about them is the coin they bring in.
import { CFG, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeVillager } from './models.js';
import { V3, tmp, rand } from './game-shared.js';

// which node types each trade will walk to
const WORKS = { farmer: ['straw'], lumberjack: ['wood'], miner: ['stone', 'iron', 'diamond'] };
// one per home, in the order the homes go up, so the first village has a bit of everything
const ORDER = ['farmer', 'lumberjack', 'miner', 'farmer', 'lumberjack', 'miner'];
// #156: how far either side of a gateway a routed villager aims. Wide enough that the far point is
// clear of the wall's collision (0.55 for a friendly) with room to turn; not so wide that the near
// point lands inside a building behind the gate. 1.8 -- 1.2 was tried and a tangential exit still
// grazed the next section's end.
const GATE_STANDOFF = 1.8;

export const VillagerMethods = {
  // A home is built: someone moves into it. The trade follows the order homes are raised in rather
  // than the home's position, so a village of two is a farmer and a lumberjack and not two farmers.
  addVillager(homeX, homeZ, homeId = null) {
    const kind = ORDER[this.villagers.length % ORDER.length];
    const mesh = makeVillager(kind);
    mesh.position.set(homeX + rand(-1.2, 1.2), 0, homeZ + rand(1.8, 2.6));
    mesh.scale.setScalar(0.01);
    this.root.add(mesh);
    const v = {
      kind, mesh, home: new V3(homeX, 0, homeZ), homeId, state: 'idle', node: null,
      carry: 0, work: 0, walkT: 0, popT: 0.5, scale: 1.05, idleT: rand(0, 2),
    };
    this.villagers.push(v);
    return v;
  },

  // The nearest node this trade will work that still has something in it, and that stands inside the
  // walls as they are built today. They have no escort: a farm hand who walked to the far quarries
  // would spend the day out where the raiders come from, and would be the first thing they met.
  villagerNode(v) {
    const types = WORKS[v.kind];
    const b = TIERS[this.tier].bounds;
    const kp = this.king.mesh.position;
    const p = v.mesh.position;
    let best = null;
    let bd = CFG.villager.range;
    for (const n of this.nodes) {
      if (!n.open || n.stock <= 0 || !types.includes(n.type)) continue;
      if (n.pos.x < b.x0 || n.pos.x > b.x1 || n.pos.z < b.z0 || n.pos.z > b.z1) continue;
      // and never the one the King is stood at. They share his nodes, and a node has a stock rather
      // than an endless supply, so without this the village would be helping by emptying the seam he
      // is halfway through.
      if (n.pos.distanceTo(kp) < CFG.mining.radius + 2) continue;
      const d = p.distanceTo(n.pos);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  },

  // Walk towards a point. Returns how far short it still is, so the caller decides what "arrived"
  // means: a node is worked from its mining radius, the Trade Post from its mat.
  // #156: through the gate, not the wall. This was the one mover in the game that never called
  // `collideWalls`, so villagers walked straight through the citadel to the quarries. Adding the
  // collision alone would have swapped that for grinding against the inside face, because the walk
  // steers in a straight line and nothing gave it a reason to aim at the gap -- so the gap is the
  // first target whenever the straight line would cross a solid section, and the real target after.
  //
  // Returns the distance to the REAL target, not to the gate. Every caller compares it to a reach
  // (`toNode` to the mining radius, `toPost` to the trade radius), and a villager two metres short
  // of a gate is not two metres from the quarry.
  villagerWalkTo(v, x, z, dt, speed = CFG.villager.speed) {
    const p = v.mesh.position;
    const via = this.villagerVia(v, x, z, dt);
    const tx = via ? via.x : x;
    const tz = via ? via.z : z;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.faceTowards(v.mesh, tmp.set(tx, 0, tz), dt, 8);
    }
    // the safety net under the routing: friendly, so a gate section lets them through
    this.collideWalls(p, 0.3, true);
    this.animateWalk(v, d > 0.2 ? 1 : 0, dt);
    return via ? Math.hypot(x - p.x, z - p.z) : d;
  },

  // Which gate to go through first, or null for a straight walk. Re-decided on a timer rather than a
  // frame, the way an enemy re-targets: a route that flips every frame at the gate mouth is a
  // villager who stands in it shuffling.
  //
  // The route is two points, not the gateway itself: one a short way in front of it on the
  // villager's side, one the same distance beyond it on the other. Aiming at the gateway's midpoint
  // was the first version and it jammed on a diagonal trip -- the midpoint of the chord sits a hair
  // INSIDE the ring, so a villager stood in it heading for a node off to one side had a straight line
  // that clipped the end of the next section, the timer sent it back to the gateway it was already
  // in, and it shuffled between the two for ever (measured: 150 seconds, 1.1 to 2.0 on x and back).
  // From a point clear of the wall on the far side the line to anything on that side is clear.
  villagerVia(v, x, z, dt) {
    v.viaT = (v.viaT || 0) - dt;
    const p = v.mesh.position;
    if (v.via && Math.hypot(v.via[0].x - p.x, v.via[0].z - p.z) < 1.1) {
      v.via.shift();
      if (!v.via.length) v.via = null;
    }
    if (v.viaT > 0 && v.viaX === x && v.viaZ === z) return v.via && v.via[0];
    v.viaT = 0.5;
    v.viaX = x;
    v.viaZ = z;
    v.via = null;
    if (!this.wallBetween(p.x, p.z, x, z)) return null;
    // the gate that makes the whole trip shortest, not the one nearest the villager -- nearest can be
    // on the wrong side of the ring and send them the long way round the outside
    let best = null;
    let bd = Infinity;
    for (const w of this.walls) {
      if (!w.gate || w.state !== 'built') continue;
      // the gateway's normal, pointed at the villager's side of it
      let nx = -(w.z1 - w.z0) / w.len;
      let nz = (w.x1 - w.x0) / w.len;
      const side = (p.x - w.mx) * nx + (p.z - w.mz) * nz < 0 ? -1 : 1;
      nx *= side * GATE_STANDOFF;
      nz *= side * GATE_STANDOFF;
      const near = { x: w.mx + nx, z: w.mz + nz };
      const far = { x: w.mx - nx, z: w.mz - nz };
      const cost = Math.hypot(near.x - p.x, near.z - p.z) + Math.hypot(x - far.x, z - far.z);
      if (cost < bd) {
        bd = cost;
        // already in the mouth of it: straight through, rather than a step back to line up
        best = Math.hypot(w.mx - p.x, w.mz - p.z) < 2.5 ? [far] : [near, far];
      }
    }
    v.via = best;
    return best && best[0];
  },

  // Does the straight line from (ax,az) to (bx,bz) cross a standing, solid wall section? Gate
  // sections do not count -- they are the way through. A plain 2D segment test against every section;
  // there are at most a few dozen and this runs twice a second per villager.
  wallBetween(ax, az, bx, bz) {
    const cross = (ox, oz, px, pz, qx, qz) => (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
    for (const w of this.walls) {
      if (w.gate || w.state !== 'built') continue;
      const d1 = cross(ax, az, bx, bz, w.x0, w.z0);
      const d2 = cross(ax, az, bx, bz, w.x1, w.z1);
      const d3 = cross(w.x0, w.z0, w.x1, w.z1, ax, az);
      const d4 = cross(w.x0, w.z0, w.x1, w.z1, bx, bz);
      if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
    }
    return false;
  },

  updateVillagers(dt) {
    if (!this.villagers.length) return;
    const raid = this.enemies.length > 0;
    for (const v of this.villagers) {
      if (v.popT > 0) {
        v.popT -= dt;
        v.mesh.scale.setScalar(v.scale * Math.max(0.01, 1 - v.popT / 0.5));
        if (v.popT <= 0) v.mesh.scale.setScalar(v.scale);
      }
      // A villager is not a soldier. Anything hostile within sight and they drop what they are doing
      // and make for their own door, and they stay there until the field is clear.
      if (raid && this.nearestEnemy(v.mesh.position, CFG.villager.flee)) {
        v.state = 'flee';
      } else if (v.state === 'flee') {
        v.state = 'idle';
      }
      this[`villager_${v.state}`](v, dt);
    }
  },

  // #169: the gleaner. Not in `villagers` -- they belong to homes and work nodes; he belongs to the
  // Keep and works the ground -- but he is a villager in every way that matters: same model shape,
  // same walk with its gate routing (#156), same rule that a raider in sight sends him home. He is
  // made the first frame the Keep stands, which also covers a restored run without a word in the
  // save, and `reset` drops him with the root.
  updateGleaner(dt) {
    const G = CFG.gleaner;
    // A standing Keep is what brings him; once he is here a Keep knocked down mid-run does not stop
    // him working (it stopped him dead, mid-field, in the first version -- the guard was on the
    // whole update). The fall of the village removes him outright, with the villagers.
    if (!this.gleaner && !(this.keep && this.keep.state === 'built')) return;
    if (!this.gleaner) {
      const mesh = makeVillager('gleaner');
      const home = new V3(this.keep.x + G.rest[0], 0, this.keep.z + G.rest[1]);
      mesh.position.copy(home);
      mesh.scale.setScalar(0.01);
      this.root.add(mesh);
      this.gleaner = { kind: 'gleaner', mesh, home, target: null, walkT: 0, popT: 0.5, scale: 1.05 };
    }
    const g = this.gleaner;
    if (g.popT > 0) {
      g.popT -= dt;
      g.mesh.scale.setScalar(g.scale * Math.max(0.01, 1 - g.popT / 0.5));
      if (g.popT <= 0) g.mesh.scale.setScalar(g.scale);
    }
    const p = g.mesh.position;
    if (this.enemies.length && this.nearestEnemy(p, G.flee)) {
      g.target = null;
      const d = this.villagerWalkTo(g, g.home.x, g.home.z, dt, G.speed * 1.4);
      if (d < 1) this.animateWalk(g, 0, dt);
      return;
    }
    if (g.target && (!this.coins.includes(g.target) || g.target.state !== 'ground')) g.target = null;
    // A coin he cannot get to -- one that landed where the walk will not take him -- would hold him
    // for the rest of the run. Twenty-five seconds is longer than any walk across the map at his
    // speed; past that the coin is marked and the next pick passes over it. Found by driving it:
    // a ring of test coins reached the raider camp, and he spent two minutes running at the one
    // beside it and running home again.
    if (g.target) {
      g.stuckT = (g.stuckT || 0) + dt;
      if (g.stuckT > 25) {
        g.target.gleanerSkip = true;
        g.target = null;
      }
    }
    if (!g.target) {
      g.target = this.gleanerPick();
      g.stuckT = 0;
    }
    if (!g.target) {
      const d = this.villagerWalkTo(g, g.home.x, g.home.z, dt, G.speed);
      if (d < 0.6) this.animateWalk(g, 0, dt);
      return;
    }
    const tp = g.target.mesh.position;
    if (this.villagerWalkTo(g, tp.x, tp.z, dt, G.speed) < G.reach) {
      // his, now: the coin flies to him and is banked the way the King's are, in `updateCoins`
      g.target.state = 'fly';
      g.target.to = g;
      g.target = null;
    }
  },

  // The oldest coin that has lain long enough and is not at the King's feet. Oldest rather than
  // nearest: nearest keeps him circling one heap while the far ones fade, and the far ones are the
  // whole reason he exists.
  gleanerPick() {
    const G = CFG.gleaner;
    const kp = this.king.mesh.position;
    let best = null;
    let age = -1;
    for (const c of this.coins) {
      if (c.state !== 'ground' || c.t < G.wait || c.t <= age || c.gleanerSkip) continue;
      if (c.mesh.position.distanceTo(kp) < this.ringRadius + G.keepOff) continue;
      // not one a raider is stood over: he would only run from it on arrival, and the coin will
      // still be there when the raider is not
      if (this.enemies.length && this.nearestEnemy(c.mesh.position, G.flee)) continue;
      age = c.t;
      best = c;
    }
    return best;
  },

  villager_flee(v, dt) {
    const d = this.villagerWalkTo(v, v.home.x, v.home.z + 1.6, dt, CFG.villager.speed * 1.6);
    if (d < 1) this.animateWalk(v, 0, dt);
  },

  villager_idle(v, dt) {
    v.idleT -= dt;
    // Nothing to do without somewhere to sell: the Trade Post is what turns a bag into coin, and
    // until it stands a villager would be carrying wood around for nothing.
    if (!this.tradePost || !this.tradePos) return this.villagerWalkTo(v, v.home.x, v.home.z + 2.2, dt);
    if (v.idleT > 0) return this.villagerWalkTo(v, v.home.x, v.home.z + 2.2, dt);
    v.idleT = 1.5;
    const n = this.villagerNode(v);
    if (!n) return this.villagerWalkTo(v, v.home.x, v.home.z + 2.2, dt);
    v.node = n;
    v.state = 'toNode';
  },

  villager_toNode(v, dt) {
    const n = v.node;
    if (!n || n.stock <= 0) {
      v.node = null;
      v.state = 'idle';
      return;
    }
    const reach = n.type === 'straw' ? 3.2 : CFG.mining.radius - 0.6;
    if (this.villagerWalkTo(v, n.pos.x, n.pos.z, dt) <= reach) {
      v.state = 'work';
      v.work = 0;
    }
  },

  villager_work(v, dt) {
    const n = v.node;
    if (n && n.stock > 0 && n.pos.distanceTo(this.king.mesh.position) < CFG.mining.radius + 1) {
      // he has walked up to the seam they are on: they stand off and find another
      v.state = v.carry > 0 ? 'toPost' : 'idle';
      v.node = null;
      return;
    }
    if (!n || n.stock <= 0) {
      v.state = v.carry > 0 ? 'toPost' : 'idle';
      v.node = null;
      return;
    }
    this.faceTowards(v.mesh, n.pos, dt, 8);
    this.animateWalk(v, 0, dt);
    // the tool swings: the arms are what animateWalk would drive, so driving them here reads as work
    v.work += dt;
    const arms = v.mesh.userData.arms;
    if (arms) arms.forEach((a) => (a.rotation.x = -0.6 - Math.sin(v.work * 7) * 0.8));
    const per = (CFG.materials[n.type] || CFG.mining).mine * CFG.villager.slow;
    if (v.work < per) return;
    v.work = 0;
    n.stock--;
    this.setNodeLook(n);
    v.carry++;
    if (n.type !== 'straw') n.shake = 0.3;
    this.throwChips(n.type, n.type === 'straw' ? v.mesh.position : n.pos, 3);
    if (v.carry >= CFG.villager.carry || n.stock <= 0) v.state = 'toPost';
  },

  villager_toPost(v, dt) {
    if (!this.tradePos) {
      v.state = 'idle';
      return;
    }
    if (this.villagerWalkTo(v, this.tradePos[0], this.tradePos[1], dt) > CFG.trade.radius - 0.6) return;
    // sold: a villager's load is worth what the King's is, and the whole of their trade is that they
    // are slower at filling it and they do it while he is elsewhere
    const paid = v.carry * this.villagerRate(v);
    v.carry = 0;
    this.coinsCarried += paid;
    this.coinsEarned += paid;
    this.addScore(CFG.score.material);
    audio.ching();
    tmp.set(this.tradePos[0], 1.9, this.tradePos[1]);
    this.popup(`+${paid}`, tmp, '#ffd23f', 1.2);
    v.state = 'idle';
    v.idleT = 0.4;
  },

  // What one unit in a villager's bag pays. They carry a mix and nobody wants a second ledger per
  // villager, so a trade is paid at the rate of the cheapest thing it works: a farmer is paid straw,
  // a miner stone, whatever the seam actually was. The far, dear materials stay the King's to fetch.
  villagerRate(v) {
    const types = WORKS[v.kind];
    let low = Infinity;
    for (const t of types) low = Math.min(low, (CFG.materials[t] || { coin: 1 }).coin);
    return low;
  },
};
