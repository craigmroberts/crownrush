// The King and the army he leads: recruiting, moving, fighting, and the small animation helpers
// the code-built figures need. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeRigged } from './rig.js';
import {
  makeKing, makeKingFoot, makeQueen, makeArcher, makeSwordsman, makeArrow, makeHealthBar, setHealthBar,
  makeRallyBanner,
} from './models.js';
import { V3, tmp, tmp2, HAIR, rand } from './game-shared.js';

const HURT = new THREE.Color(CFG.hurtFlash.colour);

// #109: the hurt flash is a material SWAP, not a material write.
//
// The rule this exists to keep, and the one to reach for the next time something wants to tint one
// object: NOTHING PER-OBJECT MAY WRITE TO A MATERIAL A MODEL BUILDER HANDED OUT. Every material in
// this game is shared, by three separate mechanisms, and the King wears one from each depending on
// what has loaded:
//
//   - `RIG_MAT` (rig.js) is ONE material for every imported character in the game. Measured mid-run:
//     the rigged King wears exactly one material and it is that one. Writing emissive on it reddens
//     Wren, every raider on the field and the Warlord along with him.
//   - `BAKED_STD` (models.js) is one material for every baked model, with the colours carried in
//     vertex colours -- the palisade, the huts, the Keep. The King wears it whenever he falls back to
//     the code-built figure. Measured on the title screen, which is built that way throughout: the
//     King wore 6 materials and 171 of the other 226 meshes in the world wore one of them.
//   - `smat` (characters.js) is colour-keyed, so the built King's leather, gold and skin are the
//     leather, gold and skin of every code-built character standing near him.
//
// That is why this was reported as "the fence was flashing red". A flash that says *something,
// somewhere, is hurt* is not information.
//
// Swapping `o.material` to a clone instead touches nothing anyone else can see: the shared material is
// read once to make the clone and never written to. The clone is cached in a WeakMap keyed by the
// source material rather than on its `userData`, so the rule above has no exceptions to remember, and
// so the cache dies with the material it was made from.
const hurtMats = new WeakMap();
function hurtMaterial(m) {
  if (Array.isArray(m)) {
    let list = hurtMats.get(m);
    // The array is memoised too, or every blink would allocate one.
    if (!list) hurtMats.set(m, list = m.map((x) => hurtMaterial(x)));
    return list;
  }
  if (!m || !m.emissive) return m;     // an outline or a basic material: nothing to tint, so leave it
  let h = hurtMats.get(m);
  if (!h) {
    h = m.clone();
    // `Material.copy` copies a fixed list of fields, and anything ASSIGNED to a material instance is
    // not on it. rig.js assigns both of these to RIG_MAT -- the shader rewrite that reads roughness,
    // metalness and glow off a per-vertex attribute, and the cache key that lets every character share
    // one compiled program -- so a clone arrives without either and draws the King without his own
    // surface. Measured: without these two lines the first lit frame compiled a second shader program
    // (35 -> 36), which is a stall the first time the player is hit. With them the clone reports the
    // same cache key and reuses the program its source already has: the rig's row went from one user
    // to two and nothing was added (37 -> 37).
    h.onBeforeCompile = m.onBeforeCompile;
    h.customProgramCacheKey = m.customProgramCacheKey;
    // Emissive rather than base colour, because it has to show on the dark blue tunic and on the gold
    // alike (#46). Set once here: the tint never changes, so the blink is two references and no maths.
    h.emissive.lerp(HURT, CFG.hurtFlash.amount);
    hurtMats.set(m, h);
  }
  return h;
}

export const UnitsMethods = {
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
  },

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
    // #44: every bar hides itself at full, so a bar is only ever over someone in trouble.
    // #83: the Queen's is not a health bar at all any more -- it is how much of her the raiders have
    // (`updateSeize`). It runs down the same way, which is the whole reason for showing it there.
    const bar = makeHealthBar(type === 'king' || type === 'queen' ? 1.6 : 1.0, true);
    bar.position.y = type === 'king' ? (this.mounted ? 3.2 : 2.4) : type === 'queen' ? 2.5 : 1.8;
    mesh.add(bar);
    this.root.add(mesh);
    const royal = type === 'king' || type === 'queen';
    // #83: the Queen has no health, so there is no number here to take off. The nominal 1/1 is only
    // so that everything which asks a unit whether it is still standing -- enemy targeting, the
    // arrow's check on its mark -- keeps getting told yes. Nothing ever moves it.
    const hp = type === 'queen' ? 1 : stats.hp;
    const u = {
      type, mesh, bar, hp, maxHp: hp, stats, cooldown: rand(0, 0.5), lastHit: -99,
      melee: type === 'swordsman', vel: new V3(), popT: royal ? 0 : 0.5, assign: null, veteran,
      scale: royal ? 1.15 : mesh.userData.rig ? 1.05 : 1.2,
    };
    mesh.scale.setScalar(u.popT ? 0.01 : u.scale);
    if (u.popT && this.running) this.spawnFx(x, z);
    this.units.push(u);
    return u;
  },

  // archer stats grow with "Train Archers"; veterans (platinum recruits) are half again as strong
  archerStats(veteran = false) {
    const v = veteran ? 1.5 : 1;
    return {
      ...CFG.archer,
      damage: CFG.archer.damage * (1 + this.archerPower * CFG.archerTraining.damage) * v * this.mods.archerDamage,
      hp: CFG.archer.hp * (1 + this.archerPower * CFG.archerTraining.hp) * v * this.mods.archerHp,
      range: CFG.archer.range * this.mods.archerRange,
    };
  },

  updatePlayer(dt) {
    const k = this.king;
    // #57: the double-tap, taken BEFORE `k.vel` is overwritten below. `useDash` reads the direction
    // off the velocity, and the second tap of the gesture is a stick at zero displacement -- so
    // consuming it after the line below would dash him in whatever direction "not moving" means
    // rather than the one he was walking in when he asked.
    if (this.input.takeDash()) this.useDash();
    const inp = this.input.read();
    const speed = (this.mounted ? k.stats.speed : k.stats.footSpeed) * this.mods.kingSpeed;
    // #57: a dash overrides the stick for its third of a second, in the direction it was committed
    // to. Everything below is unchanged -- the same clamp, the same wall, river and Keep collision --
    // so a dash into a wall stops against it and the cooldown is spent, which is the cost of a bad
    // one. It is a velocity, never a teleport, for exactly that reason.
    const dashing = this.dashing();
    if (dashing) k.vel.set(this.dashX * speed * CFG.dash.speed, 0, this.dashZ * speed * CFG.dash.speed);
    else k.vel.set(inp.x * speed, 0, inp.z * speed);
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
    // #57: a dashing King is moving whatever the stick says -- a dash from a standstill would
    // otherwise slide him four units in his idle pose. `walkRate` (#55) scales the clip to how fast
    // he is actually going, so the legs whirl for the length of it without a clip of their own.
    k.moving = dashing || inp.mag > 0.05;
    this.animateWalk(k, dashing ? 1 : inp.mag, dt);
    // king fires his own bow
    k.cooldown -= dt;
    const target = this.nearestEnemy(p, k.stats.range);
    if (target) {
      this.faceTowards(k.mesh, target.mesh.position, dt, 14);
      if (k.cooldown <= 0) {
        k.cooldown = 1 / (k.stats.fireRate * this.fireMul());
        tmp.copy(p).y += 1.6;
        // #115: each arrow goes at a raider none of the others is already going at. `nearestEnemy`
        // skips ONE enemy, so the loop used to pass `target` every time and arrows two and three both
        // picked the same second-nearest raider -- at a full Volley the King never hit a third man,
        // which is not what the card says and not what a spread is for. `shot` accumulates instead,
        // and falls back to the main target once the field runs out, so a lone raider still takes all
        // of them.
        //
        // Total damage is unchanged in every case; only which raiders take it moves. Measured against
        // 1, 2, 3 and 5 raiders in front of the King.
        const shot = this._shot || (this._shot = []);
        shot.length = 0;
        for (let i = 0; i < this.mods.kingArrows; i++) {
          const t2 = i === 0 ? target : this.nearestEnemy(p, k.stats.range, shot) || target;
          shot.push(t2);
          this.fireArrow(tmp, t2, k.stats.damage * this.damageMul);
        }
        if (k.mesh.userData.rig) {
          k.mesh.userData.rig.play('Attack', true);
          k.rigOnce = this.time + 0.6;
        }
      }
    } else if (dashing) {
      // Snapped, not lerped: he is committed to this direction and the turn has already happened as
      // far as the player is concerned.
      k.mesh.rotation.y = Math.atan2(this.dashX, this.dashZ);
    } else if (inp.mag > 0.05) {
      k.mesh.rotation.y = this.lerpAngle(k.mesh.rotation.y, Math.atan2(inp.x, inp.z), 1 - Math.exp(-dt * 12));
    }
    this.regen(k, dt);
    this.flashHurt(k);
    this.updateMining(dt);
    this.ring.position.set(p.x, 0.04, p.z);
    // #103: one number for the circle and for the reach. `ringRadius` is what coins are tested
    // against (game-view.js) and what the ring is drawn at, so they cannot drift apart again.
    // #103: the radius only moves when an upgrade lands, so rebuild rather than scale. Scaling the
    // mesh scales its line too, and a Lodestone-stacked ring drawn at 2.8x wore a stroke nearly three
    // times the weight of the one the King starts with -- the circle got louder as it got wider, when
    // what it is saying is the same thing either way.
    const rr = CFG.king.pickupRadius * this.mods.pickup;
    if (rr !== this.ringRadius) {
      this.ring.geometry.dispose();
      this.ring.geometry = new THREE.RingGeometry(rr - 0.08, rr, 48);
      this.ringRadius = rr;
    }
  },

  // Everyone who marches with the King: the army, minus the royals and minus anyone already walking
  // off to a post. Counted rather than collected where only the number is wanted.
  // #116: where one soldier stands when there is nothing to fight. An ellipse just inside the current
  // wall, one slot per soldier, so the settlement is covered rather than the King. `TIERS[tier].bounds`
  // is the grounds and it grows with each expansion, so the ring grows with it and nothing has to be
  // told that the village got bigger.
  // `out` is written into rather than returned fresh -- this runs once per soldier per frame, and the
  // caller passes its own scratch because the one this file shares is about to be overwritten by the
  // formation slot on the very next line.
  postFor(i, n, out) {
    const b = TIERS[this.tier].bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const f = CFG.army.postSpread;
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    return out.set(cx + Math.cos(a) * ((b.x1 - b.x0) / 2) * f, 0, cz + Math.sin(a) * ((b.z1 - b.z0) / 2) * f);
  },

  // #116: the raider the army goes to meet, or null to stand at posts.
  //
  // This one method is the answer to the ticket's own objection. Enemies retarget to the NEAREST unit
  // every 0.4s, so an army that each fought whatever was closest to itself would spread into as many
  // losing fights as it has soldiers. Instead the whole army is given ONE target -- the raider
  // furthest INTO the grounds -- so a raid is met by a block rather than by whoever happened to be
  // posted nearest to it. Deepest rather than nearest because that is the one doing damage: a sapper
  // at the Keep matters more than a knight still outside the gate.
  //
  // Computed once a frame, not once a soldier.
  groundThreat() {
    const b = TIERS[this.tier].bounds;
    const m = CFG.army.guardMargin;
    let best = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.captor) continue;
      const p = e.mesh.position;
      if (p.x < b.x0 - m || p.x > b.x1 + m || p.z < b.z0 - m || p.z > b.z1 + m) continue;
      // depth = how far in, measured from the middle of the grounds
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const d = (p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  },

  countFollowers() {
    let n = 0;
    for (const u of this.units) if (u !== this.king && u !== this.queen && !u.assign) n++;
    return n;
  },

  updateArmy(dt) {
    const kp = this.king.mesh.position;
    this.updateQueen(dt);
    // Scratch lists, refilled in place each frame. The followers are indexed for their formation slot
    // so this one has to be a list; the assign pass splices `this.units` while it walks, so that one
    // needs a snapshot. Both used to be a fresh array a frame.
    const followers = this._followers || (this._followers = []);
    followers.length = 0;
    for (const u of this.units) if (u !== this.king && u !== this.queen && !u.assign) followers.push(u);
    // The formation centre trails the King rather than sitting on him, eased in and out so turning
    // swings the group round behind him instead of snapping it. His mesh rotation is his heading.
    const rallied = this.rallied();
    const A = CFG.army;
    const want = this.king.moving && !rallied ? A.trail : 0;
    this.armyTrail = (this.armyTrail || 0) + (want - (this.armyTrail || 0)) * (1 - Math.exp(-dt * 3.5));
    // #57: the formation centre, and the whole of what the rally banner does. A standing banner is
    // the centre instead of the King -- but the horn still outranks it, so "to me!" works while a
    // banner stands and the army goes back to it when the rally ends rather than the banner being
    // torn down (see CFG.banner for why suspending beats clearing).
    const banner = rallied ? null : this.bannerStanding();
    const ax = banner ? banner.x : kp.x - Math.sin(this.king.mesh.rotation.y) * this.armyTrail;
    const az = banner ? banner.z : kp.z - Math.cos(this.king.mesh.rotation.y) * this.armyTrail;
    // What a melee soldier is allowed to chase away from, and where a genuinely stuck one reappears.
    // The King when there is no banner -- byte for byte the behaviour before #57, because the two
    // differ by up to `A.trail` and that is a balance change nobody asked for -- the banner when
    // there is one, because a soldier holding a breach has no business running back to him.
    const cx = banner ? banner.x : kp.x;
    const cz = banner ? banner.z : kp.z;
    // #116: who is holding the grounds and who is at the King's shoulder. The horn outranks
    // everything (it is the one button that concentrates force) and a banner outranks the posts, so
    // holding the grounds is what the army does when nothing else has been asked of it.
    const hold = CFG.army.holdGround && !rallied && !banner;
    const threat = hold ? this.groundThreat() : null;
    // The unit vector from the threat back towards the middle of the grounds, worked out once rather
    // than once a soldier; the block forms up `A.standoff` along it.
    let mux = 0;
    let muz = 0;
    if (threat) {
      const b = TIERS[this.tier].bounds;
      const tx = (b.x0 + b.x1) / 2 - threat.mesh.position.x;
      const tz = (b.z0 + b.z1) / 2 - threat.mesh.position.z;
      const tl = Math.hypot(tx, tz) || 1;
      mux = tx / tl;
      muz = tz / tl;
    }
    // Slots are numbered within a GROUP, so the guard makes its own tidy ring around the King and the
    // troops make theirs -- rather than the guard taking slots 0..2 of one ring and the rest of the
    // army orbiting a gap.
    let nGuard = 0;
    let nTroop = 0;
    for (const u of followers) {
      if (hold && !u.guard) u.slot = nTroop++;
      else u.slot = nGuard++;
    }
    const troopN = nTroop;
    followers.forEach((u) => {
      const i = u.slot;
      const posted = hold && !u.guard;
      u.cooldown -= dt;
      if (u.popT > 0) {
        u.popT -= dt;
        const s = 1 - Math.max(0, u.popT / 0.5);
        u.mesh.scale.setScalar(Math.max(0.01, u.scale * s * (1 + Math.sin(s * Math.PI) * 0.25)));
        if (u.popT <= 0) u.mesh.scale.setScalar(u.scale);
      }
      // formation slot: rings around whatever the army is formed on
      const ring = Math.floor(Math.sqrt(i / 6));
      const perRing = 6 + ring * 6;
      const idxInRing = i - ring * ring * 6;
      // No `+ this.time * 0.15` any more: the ring used to rotate on its own, so the army shuffled
      // sideways even while the King stood still.
      const ang = (idxInRing / perRing) * Math.PI * 2 + ring * 0.4;
      const rad = 1.7 + ring * 1.3;
      // #116: a posted soldier stands at its own post while the grounds are quiet, and joins the
      // block on the deepest raider the moment one is inside. Everyone else forms on the King (or on
      // the banner, or on the King when the horn goes) exactly as before.
      let ox = ax;
      let oz = az;
      if (posted && threat) {
        // Form up SHORT of him, on the village side, so the archers in the block are shooting rather
        // than being stabbed. `standoff` is measured back towards the middle of the grounds.
        ox = threat.mesh.position.x + mux * A.standoff;
        oz = threat.mesh.position.z + muz * A.standoff;
      } else if (posted) {
        this.postFor(i, troopN, tmp2);
        ox = tmp2.x;
        oz = tmp2.z;
      }
      tmp.set(ox + Math.cos(ang) * rad, 0, oz + Math.sin(ang) * rad);

      const p = u.mesh.position;
      let target = null;
      if (u.melee) {
        target = this.nearestEnemy(p, u.stats.aggro);
        // What a melee soldier may chase away FROM: its own post or the block it is part of when it
        // is holding the grounds, the King or the banner otherwise. A soldier defending a wall has no
        // business running back to wherever the King happens to be standing.
        const hx = posted ? ox : cx;
        const hz = posted ? oz : cz;
        if (target && Math.hypot(target.mesh.position.x - hx, target.mesh.position.z - hz) < u.stats.aggro + rad + 3) {
          tmp.copy(target.mesh.position);
        } else target = null;
      }
      tmp2.subVectors(tmp, p);
      tmp2.y = 0;
      const d = tmp2.length();
      // A region, not a point. Stopping only within 15cm of an exact coordinate is what made them
      // fidget; a slot you are allowed to be near is a formation you are allowed to be loose in.
      const stopDist = target ? target.radius + 0.6 : rallied ? A.rallySlack : A.slack;
      let moving = 0;
      if (d > stopDist) {
        const rally = rallied ? CFG.horn.rallySpeed : 1;
        // Arrive rather than skid: full speed while there is ground to make up, easing down as the
        // slot comes in. The old `* 1.6` sprint is gone -- archers already outrun the King at 9
        // against his 7.5, so it only ever served to close the last few metres instantly.
        const ease = target ? 1 : Math.min(1, (d - stopDist) / A.ease);
        const sp = Math.min(u.stats.speed * rally * (0.4 + 0.6 * ease), d / dt);
        tmp2.normalize().multiplyScalar(sp * dt);
        p.add(tmp2);
        moving = Math.min(1, d);
        if (!target) u.mesh.rotation.y = this.lerpAngle(u.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
      }
      this.collideWalls(p, 0.3, true);
      this.collideRiver(p, 0.3);
      this.collideKeep(p, 0.3);
      // Only for the genuinely stuck -- the wrong side of a wall or a river. It used to fire at 14,
      // which a soldier allowed to trail properly reaches honestly, and a man blinking to the King's
      // feet reads far worse than one jogging to catch up.
      if (d > A.lost) p.set((posted ? ox : cx) + rand(-1, 1), 0, (posted ? oz : cz) + rand(-1, 1));
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
    const assigned = this._assigned || (this._assigned = []);
    assigned.length = 0;
    for (const u of this.units) if (u.assign) assigned.push(u);
    for (const u of assigned) {
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
  },

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
  },

  damageUnit(u, dmg, from = null) {
    // #83: nothing hurts the Queen. She used to be worn down like anyone else and her health
    // reaching zero was a capture wearing a health bar -- so she flinched, flashed red and cried out
    // on the way to a thing that was never a death. Raiders take her by getting hold of her instead
    // (`updateSeize`), which is also why this sits above everything rather than inside it: an arrow
    // or a sapper's blast cannot kidnap anybody, so they do not touch her at all.
    if (u.type === 'queen') return;
    if (u.hp <= 0) return;
    if (u.inKeep || u.captive) return;
    u.hp -= dmg;
    u.lastHit = this.time;
    this.hitAnim(u);
    if (u.type === 'king') audio.hurt();
    setHealthBar(u.bar, Math.max(0, u.hp / u.maxHp));
    if (u.hp <= 0) {
      // #110: the King leaves the field like anybody else. This branch used to end the run and
      // `return`, which skipped both lines below -- so a dead King stood exactly where he fell, at
      // full height, for the 900ms before the verdict and for as long as the player looked at it
      // afterwards. There is no death animation yet (#55), but toppling out of the world is the
      // vocabulary every other unit already dies in, and standing there is not a third option.
      //
      // `gameOver` runs BEFORE the splice: it records the run, and the army it records is
      // `units.length - 1` on the understanding that the King is one of them.
      if (u.type === 'king') this.gameOver(u.type);
      this.units.splice(this.units.indexOf(u), 1);
      u.bar.visible = false;
      this.fell(u.mesh, from, 0.5);
    }
  },

  // #46: the King flickers red for a moment after each hit. His bar is one small thing in a scrum of
  // twenty characters, so the blow itself has to read off the King.
  flashHurt(u) {
    const F = CFG.hurtFlash;
    const on = this.time - u.lastHit < F.time;
    if (!on && !u.flashing) return;      // nothing to do, and nothing left to put back
    u.flashing = on;
    this.tintHurt(u, on && Math.floor((this.time - u.lastHit) / F.blink) % 2 === 0);
  },

  // #110: putting the King back on his own materials is part of ENDING a run, not part of running one.
  // `flashHurt` is only ever called from inside `if (this.running)`, so the frame that kills him is
  // the last one that could clear the red -- and it cannot, because it stops the sim first. What the
  // player was left with was a corpse frozen mid-blink, and (before #109) a village frozen with it.
  // Anything that stands the King down has to call this: `gameOver` and `victory` both do.
  clearHurt(u) {
    if (!u || !u.flashing) return;
    u.flashing = false;
    this.tintHurt(u, false);
  },

  // The swap itself. `restMat` is read off the mesh on every frame the mesh is NOT tinted, rather than
  // remembered once: anything that legitimately re-materialises a character -- mounting, a model
  // arriving late, a level swapping a build for its imported version (#111) -- would otherwise be
  // quietly undone the next time a flash ended, and that is a bug nobody would think to look here for.
  tintHurt(u, lit) {
    u.mesh.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      if (!o.userData.hurtOn) o.userData.restMat = o.material;
      o.userData.hurtOn = lit;
      o.material = lit ? hurtMaterial(o.userData.restMat) : o.userData.restMat;
    });
  },

  regen(u, dt) {
    if (u.hp < u.maxHp && this.time - u.lastHit > CFG.regen.delay) {
      u.hp = Math.min(u.maxHp, u.hp + CFG.regen.perSecond * this.mods.regen * dt);
      setHealthBar(u.bar, u.hp / u.maxHp);
    }
  },

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
    this.hud.toast('To me!', 900, 'The King');
  },

  rallied() {
    return this.time < this.rallyUntil;
  },

  // #57: the dash. A short committed burst in the direction he is already going, or the way he is
  // facing if he is standing still -- a dash with no direction would be a cooldown thrown away, and
  // the facing is the one direction the player can see without guessing.
  //
  // The direction comes off `king.vel`, which `updatePlayer` filled from the stick this same frame,
  // rather than from `input.read()`: read() hands back one shared object to one caller by design
  // (#65), and a second reader in the same frame is exactly the kind of thing that stops being true
  // later.
  useDash() {
    if (!this.running || this.dashT > 0 || this.queen.captive && !this.queen.taken) return;
    const D = CFG.dash;
    const k = this.king;
    let dx = k.vel.x;
    let dz = k.vel.z;
    const m = Math.hypot(dx, dz);
    if (m > 0.05) {
      dx /= m;
      dz /= m;
    } else {
      dx = Math.sin(k.mesh.rotation.y);
      dz = Math.cos(k.mesh.rotation.y);
    }
    this.dashT = D.cooldown;
    this.dashUntil = this.time + D.duration;
    this.dashX = dx;
    this.dashZ = dz;
    audio.dash();
    // The dust goes where he LEFT, not where he is: the burst reads as a push-off that way, and by
    // the time it has faded he is the better part of five units away from it.
    this.burstFx(tmp.copy(k.mesh.position).setY(0.35), '#cfc09a', 5, 0.34);
  },

  dashing() {
    return this.time < this.dashUntil;
  },

  // #57: the rally banner. Planted at the King's feet -- see CFG.banner for why it is not aimed --
  // and from then on the army forms up on it rather than on him, until it falls.
  plantBanner() {
    if (!this.running || this.bannerT > 0 || this.queen.captive && !this.queen.taken) return;
    const B = CFG.banner;
    const kp = this.king.mesh.position;
    this.clearBanner();
    const mesh = makeRallyBanner();
    mesh.position.set(kp.x, 0, kp.z);
    this.root.add(mesh);
    this.banner = { x: kp.x, z: kp.z, until: this.time + B.duration, mesh };
    this.bannerT = B.cooldown;
    audio.banner();
    this.spawnFx(kp.x, kp.z, 0x2f6fd6);
    this.hud.toast('Hold here!', 1100, 'The King');
  },

  // Standing, or null. A banner that has run out is taken down the frame it does, by `update`.
  bannerStanding() {
    return this.banner && this.time < this.banner.until ? this.banner : null;
  },

  // Takes the banner with it. A run can plant dozens of these, and each one is a merged geometry
  // that nothing else refers to, so the field is not the place to leave them.
  //
  // GEOMETRY ONLY, and that is not a detail. `makeRallyBanner` ends in `bake()`, which returns the
  // GROUP with one merged mesh inside it -- not a mesh, which is the first thing this got wrong --
  // and that mesh wears `BAKED_STD`, a module-level material shared by every baked object in the
  // game. Disposing it here would take the walls, the towers, the Keep and the trees with it the
  // next time one was drawn. The geometry is this banner's alone; the material never is.
  clearBanner() {
    if (!this.banner) return;
    const g = this.banner.mesh;
    if (g) {
      this.root.remove(g);
      g.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this.banner = null;
  },

  // archery speed grows with the Keep (archers, towers and the King's own bow)
  fireMul() {
    return CFG.base.fireRate(this.baseLevel);
  },

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
  },

  // one-shot attack: swing the rig's Attack clip, or nod the code model's body
  attackAnim(ent) {
    const rig = ent.mesh.userData.rig;
    if (rig) {
      rig.play('Attack', true);
      ent.rigOnce = this.time + 0.6;
    } else if (ent.mesh.userData.body) ent.mesh.userData.body.rotation.x = 0.6;
  },

  // #55: a hit reaction, and the other half of what used to be a squash.
  //
  // ONLY ON A CHARACTER STANDING STILL, and that is the crowd path's constraint rather than a taste
  // call. A one-shot there REPLACES the looping clip for its duration instead of blending with it --
  // an InstancedMesh has no mixer to blend with -- so playing Hit over a Walk snaps the legs out of
  // mid-stride to the bind pose and back again inside a fifth of a second, on every arrow, all
  // night. Standing still the pose it comes from is Idle, which is near enough the bind pose that
  // there is nothing to see. The callers keep the squash for the moving case: it says "that landed"
  // where the clip cannot, and something has to.
  //
  // Returns whether it played, so the caller knows which of the two it got.
  hitAnim(ent) {
    const rig = ent.mesh.userData.rig;
    if (!rig || ent.moving) return false;
    rig.play('Hit', true);
    ent.rigOnce = this.time + 0.22;      // the clip's own length -- tools/models/clips.mjs
    return true;
  },

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
  },

  faceTowards(mesh, target, dt, speed) {
    const a = Math.atan2(target.x - mesh.position.x, target.z - mesh.position.z);
    mesh.rotation.y = this.lerpAngle(mesh.rotation.y, a, 1 - Math.exp(-dt * speed));
  },

  lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },

  // ---------- combat helpers ----------
  fireArrow(from, target, damage, hostile = false) {
    const mesh = makeArrow();
    mesh.position.copy(from);
    this.root.add(mesh);
    this.arrows.push({ mesh, target, damage, life: CFG.arrow.life, dir: new V3(), from: from.clone(), hostile });
  },

  damageTurret(t, dmg) {
    t.hp -= dmg;
    setHealthBar(t.bar, Math.max(0, t.hp / t.maxHp));
    if (t.hp > 0) return;
    this.turrets.splice(this.turrets.indexOf(t), 1);
    this.fell(t.mesh, null, 0.5);
    if (t.tower && this.towers[t.tower]) {
      const tw = this.towers[t.tower];
      tw.crew = Math.max(0, tw.crew - 1);
      // reopen the crew pad once, so the slot can be refilled
      const open = [...this.dynamicPads, ...this.pads.map((p) => p.def)].some((d) => d.tower === t.tower && d.crew);
      if (!open) this.queueTowerPad(t.tower, 'crew');
    }
    this.raiseAlarm('A tower crew has fallen!');
  },

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
            else this.damageUnit(t, a.damage, a.from && a.from.mesh ? a.from.mesh.position : null);
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
  },
};
