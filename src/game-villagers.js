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

export const VillagerMethods = {
  // A home is built: someone moves into it. The trade follows the order homes are raised in rather
  // than the home's position, so a village of two is a farmer and a lumberjack and not two farmers.
  addVillager(homeX, homeZ) {
    const kind = ORDER[this.villagers.length % ORDER.length];
    const mesh = makeVillager(kind);
    mesh.position.set(homeX + rand(-1.2, 1.2), 0, homeZ + rand(1.8, 2.6));
    mesh.scale.setScalar(0.01);
    this.root.add(mesh);
    const v = {
      kind, mesh, home: new V3(homeX, 0, homeZ), state: 'idle', node: null,
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
  villagerWalkTo(v, x, z, dt, speed = CFG.villager.speed) {
    const p = v.mesh.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.faceTowards(v.mesh, tmp.set(x, 0, z), dt, 8);
    }
    this.animateWalk(v, d > 0.2 ? 1 : 0, dt);
    return d;
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
