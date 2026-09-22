// The King and the army he leads: recruiting, moving, fighting, and the small animation helpers
// the code-built figures need. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeRigged } from './rig.js';
import {
  makeKing, makeKingFoot, makeQueen, makeArcher, makeSwordsman, makeArrow, makeHealthBar, setHealthBar,
  makeRallyBanner, makeRing } from './models.js';
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
    // #217: if this is him getting back ON his own horse, the horse stops existing separately --
    // `king_mounted` is one model with the horse in it, which is the whole reason a dismount cannot
    // mirror `riderFell`. Taken out here rather than by the caller so every route on (the button,
    // the Warhorse mat, a restore) leaves exactly one horse in the world.
    const loose = this.royalHorse();
    if (loose) {
      this.horses.splice(this.horses.indexOf(loose), 1);
      this.root.remove(loose.mesh);
      this.disposeEntity(loose.mesh);
    }
    this.mountQueued = false;
    this.swapKingMesh('king_mounted', 3.2);
    this.spawnFx(this.king.mesh.position.x, this.king.mesh.position.z, 0xffd166);
    this.refreshPads();          // the Warhorse mat is skipped while he has a horse
  },

  // #217: GETTING OFF, which was never possible: `mountKing` set `this.mounted` and the only place
  // it was ever cleared was `reset()`. A choice made in the first few minutes was permanent.
  //
  // It cannot mirror `riderFell`, because the King is not SEATED the way a soldier is. A soldier's
  // mesh is the horse with the rider reparented onto it, so falling off is a detach. The King's mesh
  // is REPLACED by `king_mounted`, a single model with the horse built in -- there is no horse object
  // to hand back, because there was never one to take. So this swaps the mesh back and CREATES a
  // horse beside him.
  //
  // Everything keyed off `this.mounted` has to flip with it, and that is the real work: the health
  // bar's height (3.2 against 2.4), `stackBase` for the carried coins, his speed, and the Warhorse
  // mat, which is skipped while mounted and would otherwise reappear and sell him a second horse.
  // Missing one of those is the exact shape of bug this repo keeps writing down -- every count still
  // right and a health bar floating above nothing -- so the two heights live in `swapKingMesh` and
  // the mat asks `hasHorse()` rather than `mounted`.
  dismountKing() {
    if (!this.mounted) return null;
    this.mounted = false;
    this.swapKingMesh('king', 2.4);
    const k = this.king;
    const a = k.mesh.rotation.y;
    const p = k.mesh.position;
    // Behind and just to his left, which is the side a rider dismounts on.
    const h = this.addHorse(p.x - Math.sin(a) * 1.5 - Math.cos(a) * 0.8, p.z - Math.cos(a) * 1.5 + Math.sin(a) * 0.8, 'follow');
    h.royal = true;
    h.followT = CFG.horse.royal.follow;
    h.mesh.rotation.y = a;
    this.popIn(h.mesh);
    this.spawnFx(h.mesh.position.x, h.mesh.position.z, 0xffd166);
    this.refreshPads();
    return h;
  },

  // #217: the half of mounting and dismounting that is identical either way. It was inline in
  // `mountKing`; a second copy of it in `dismountKing` is how the bar height and the scale drift
  // apart later.
  swapKingMesh(rigName, barY) {
    const k = this.king;
    const old = k.mesh;
    const rig = makeRigged(rigName);
    k.mesh = rig ? rig.mesh : rigName === 'king_mounted' ? makeKing() : makeKingFoot();
    k.mesh.position.copy(old.position);
    k.mesh.rotation.copy(old.rotation);
    k.mesh.scale.setScalar(k.scale);
    this.root.remove(old);
    k.bar = makeHealthBar(1.6, true);
    k.bar.position.y = barY;
    // #217: and it carries his HEALTH across. A fresh bar starts full, so mounting while hurt used
    // to quietly show a full bar until the next hit moved it -- true of `mountKing` before this and
    // worth fixing here rather than reproducing on the way down.
    setHealthBar(k.bar, k.hp / k.maxHp);
    k.mesh.add(k.bar);
    this.root.add(k.mesh);
    this.popIn(k.mesh, 0, k.scale);
  },

  // #217: WHAT THE BUTTON DOES, in one place, because there are three ways to press it (the button,
  // the H key, and a press that lands while the horse is still closing) and they must not each carry
  // their own idea of what state the King is in.
  //
  // Mounted -> get down. Horse near -> get on. Horse away -> whistle, and a press during the gallop
  // is REMEMBERED rather than ignored: `mountQueued` is redeemed by `updateHorses` the moment the
  // horse arrives, so the player never has to press twice or wait out an approach.
  toggleMount() {
    if (this.mounted) { this.dismountKing(); return 'dismount'; }
    const h = this.royalHorse();
    if (!h) return null;
    if (this.royalHorseDist() <= CFG.horse.royal.mountAt) { this.mountKing(); return 'mount'; }
    this.mountQueued = true;
    this.callHorse();
    return 'call';
  },

  // #217: does he have a horse AT ALL -- sitting on it, or one of his own roaming the grounds. The
  // Warhorse mat asks this rather than `mounted`, or getting down would put a 20-coin mat back on
  // the field and sell him a second horse.
  hasHorse() {
    return this.mounted || !!this.royalHorse();
  },

  // #82: what the King's horse does, trained. `horseLevel` is the Stable's "Train the Horse" count,
  // stored in the save like `archerPower`; the factor is shared with every horse in the yard (#117).
  horseFactor() {
    return 1 + this.horseLevel * CFG.horseTraining.speed;
  },
  horseSpeed() {
    return CFG.king.speed * this.horseFactor();
  },
  // "Train the Horse" was bought: the level rises, and every horse already out is retrained with it,
  // the way Train Archers retrains the archers on the wall (#117 riders carry the factor in `stats`).
  trainHorses() {
    this.horseLevel++;
    for (const u of this.units) if (u.mounted) u.stats = this.riderStats();
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
      // #208: the walk to a post, and the two things that keep it from becoming permanent
      detour: null, stuckT: 0,
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
    const inp = this.input.read();
    const speed = (this.mounted ? this.horseSpeed() : k.stats.footSpeed) * this.mods.kingSpeed;
    k.vel.set(inp.x * speed, 0, inp.z * speed);
    if (k.mesh.userData.body && k.mesh.userData.body.rotation.x > 0) k.mesh.userData.body.rotation.x = Math.max(0, k.mesh.userData.body.rotation.x - dt * 3);
    const p = k.mesh.position;
    p.x += k.vel.x * dt;
    p.z += k.vel.z * dt;
    // #210: `CFG.world.edge` rather than a number worked out from the plane. This used to be
    // `size / 2 - 3`, which put the stop fifty units past the last ring across bare ground -- the
    // invisible wall the ticket is about. The band just outside it is cliffs and forest now
    // (`world.js`), so he is stopped by something he can see. The value is pinned by the finale
    // camp and by where Wren may be carried out; see the comment on `world` in config.js.
    const half = CFG.world.edge;
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
    // #215: THE KING IS BLOCKED, NEVER STEERED. He is the one mover with a person driving him, and
    // bending his direction round a trunk would be the game taking the stick off the player -- the
    // thumb says one thing and the man does another. A push-out is legible instead: he stops
    // against the tree, the player can see the tree, and a flick of the stick goes round it.
    this.collideScenery(p, 0.5);
    k.moving = inp.mag > 0.05;
    if (k.moving && this.firstInputAt == null) { this.firstInputAt = this.time; this.mark('moved'); }   // #251
    this.animateWalk(k, inp.mag, dt);
    // king fires his own bow
    k.cooldown -= dt;
    // #235: The Huntsman. `nearestEnemy` skips a raider carrying Wren so the army does not shoot
    // into him; with the card the King's own bow goes for him first, within his ordinary range.
    let target = null;
    if (this.mods.kingHunts) {
      let bd = k.stats.range * k.stats.range;
      for (const e of this.enemies) {
        if (!e.captor || e.hp <= 0) continue;
        const d = p.distanceToSquared(e.mesh.position);
        if (d < bd) { bd = d; target = e; }
      }
    }
    if (!target) target = this.nearestEnemy(p, k.stats.range);
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
    } else if (inp.mag > 0.05) {
      k.mesh.rotation.y = this.lerpAngle(k.mesh.rotation.y, Math.atan2(inp.x, inp.z), 1 - Math.exp(-dt * 12));
    }
    this.regen(k, dt);
    this.flashHurt(k);
    // #221: a King standing on a cache is digging, not mining -- and it costs the same daylight
    if (!this.updateDigging(dt)) this.updateMining(dt);
    // #216: moved and rebuilt even while hidden. Cheaper than it looks -- a position write and a
    // radius compare -- and it means turning the ring back on shows it already in the right place at
    // the right size rather than a frame behind.
    this.ring.position.set(p.x, p.y + 0.04, p.z);   // #223: on the floor he is standing on
    // #103: one number for the circle and for the reach. `ringRadius` is what coins are tested
    // against (game-view.js) and what the ring is drawn at, so they cannot drift apart again.
    // #103: the radius only moves when an upgrade lands, so rebuild rather than scale. Scaling the
    // mesh scales its line too, and a Lodestone-stacked ring drawn at 2.8x wore a stroke nearly three
    // times the weight of the one the King starts with -- the circle got louder as it got wider, when
    // what it is saying is the same thing either way.
    const rr = CFG.king.pickupRadius * this.mods.pickup;
    if (rr !== this.ringRadius) {
      // Wave 3: `makeRing` returns a group of two rings (the white line and the dark edge under it),
      // so it is replaced whole. `visible` and position carry over; the old geometries go.
      const old = this.ring;
      this.ring = makeRing(rr);
      this.ring.visible = old.visible;
      this.ring.position.copy(old.position);
      this.root.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this.root.add(this.ring);
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
        // #117: a rider does not stand at a post, he rides the ring of them. His slot slides round
        // it, a whole lap in `patrolLap` seconds, so a mounted soldier covers the ground between
        // the posts -- and reaches a breach sooner, which is what the horse buys him.
        if (u.mounted) u.patrol = (u.patrol || 0) + dt * (troopN / CFG.horse.patrolLap);
        this.postFor(i + (u.patrol || 0), troopN, tmp2);
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
      // #215: round the tree rather than into it. Before the move, so there is nothing to correct
      // after it -- the lesson #181 paid for.
      this.steerRoundSolid(p, tmp2, d, 0.3);
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
      this.collideScenery(p, 0.3);
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
    // #208: "There's an archer just walking into the wall he seems stuck", from a phone on night 6.
    //
    // This walk was a straight line at a fixed point, and the point is very often on the other side
    // of a wall from wherever the man was standing when he was picked -- he is chosen for being
    // nearest the KING, and the King is as happily outside the ring as in. `collideWalls` then holds
    // him against the stone, the line never changes because neither end of it moves, and he walks
    // into the wall until the run ends. Reproduced in a browser: he closes to 3.55 of his post,
    // stops dead, and is still on the same two coordinates thirty frames later with `moving` true,
    // so he plays the walk animation the whole time.
    //
    // It also quietly costs the deck a place: `freeSpots` holds a spot for anyone ON THE WAY to it,
    // so the tower he will never reach cannot be filled by anybody else either.
    //
    // The army's own follow has had an escape for this since it was written ("the wrong side of a
    // wall or a river") and this loop had none. Two things, in the order a person would try them:
    // head for the gateway, which is what a gate is for and what `bridgeWaypoint` already does for
    // the river -- and behind that a watchdog, so that nothing about this walk can be permanent
    // even if the detour is blocked too.
    for (const u of assigned) {
      const [x, z, y] = u.assign;
      const p = u.mesh.position;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 0.5) {
        this.units.splice(this.units.indexOf(u), 1);
        this.root.remove(u.mesh);
        this.disposeEntity(u.mesh);
        this.addTurret(x, z, y, u.assignTower);
        continue;
      }
      // Arrival is always judged on the POST, never on the detour, so a gate that happens to sit
      // near his destination cannot finish the walk early.
      if (u.detour && Math.hypot(u.detour[0] - p.x, u.detour[1] - p.z) < 1.2) u.detour = null;
      const goal = u.detour || u.assign;
      tmp2.set(goal[0] - p.x, 0, goal[1] - p.z);
      // #215: steer on the FULL distance to the post, not on this frame's step. `steerRoundSolid`
      // looks a little way down the path, and a step is about 0.15 -- it would be looking at his
      // own boots and never see the tree at all.
      const full = tmp2.length();
      this.steerRoundSolid(p, tmp2, full, 0.3);
      const want = Math.min(u.stats.speed * dt, full);
      tmp2.normalize().multiplyScalar(want);
      const wasX = p.x;
      const wasZ = p.z;
      p.add(tmp2);
      this.collideWalls(p, 0.3, true);
      this.collideScenery(p, 0.3);
      // What he actually made of the step he asked for. A man sliding along a wall still makes
      // ground and is not stuck; a man held square against one makes almost none.
      const made = Math.hypot(p.x - wasX, p.z - wasZ);
      u.stuckT = made < want * 0.35 ? (u.stuckT || 0) + dt : 0;
      if (u.stuckT > 0.5 && !u.detour) u.detour = this.gateWaypoint(p);
      // The backstop, and it is deliberately long: it is for the case the gate could not solve, and
      // a man who blinks to his post reads far worse than one who takes the long way round to it.
      if (u.stuckT > 6) { p.set(x, 0, z); u.stuckT = 0; u.detour = null; }
      u.mesh.rotation.y = this.lerpAngle(u.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
      u.moving = true;
      this.animateWalk(u, 1, dt);
    }
  },

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.cooldown -= dt;
      // #227: through `towerLevel`, which clamps. This line is where the freeze actually happened --
      // it reads the table every frame for every turret, so one bad level stops the whole game.
      const lv = t.tower && this.towers[t.tower] ? this.towerLevel(this.towers[t.tower]) : CFG.tower.levels[0];
      const target = this.nearestEnemy(t.pos, CFG.tower.range * lv.range * this.mods.towerRange);
      if (target) {
        this.faceTowards(t.mesh, target.mesh.position, dt, 10);
        if (t.cooldown <= 0) {
          t.cooldown = 1 / (CFG.tower.fireRate * this.fireMul());
          this.fireArrow(t.pos, target, CFG.tower.damage * lv.damage * this.damageMul * this.mods.towerDamage, false, this.mods.towerFire ? CFG.fire.duration : 0);   // #235
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
    // #245: THE SCRIPTED FIGHT CANNOT KILL HIM. While she is held in the prologue the only thing that
    // hits the King is the picket's guard, and he takes `rescue.kingDamage` of each blow -- the share
    // and the measurement that set it are in config.js. The first blow also says the one thing
    // nothing had said: he is faster than they are.
    const atPicket = u.type === 'king' && this.inPrologue() && this.queen.captive && !this.queen.taken;
    if (atPicket) {
      dmg *= CFG.rescue.kingDamage;
      if (!this.kiteHintSaid) {
        this.kiteHintSaid = true;
        this.hud.toast('They are slower than you. *Keep moving and shoot.*', 3200, 'Wren', true);
      }
    }
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
      if (u.type === 'king' && atPicket) return this.picketRestart();   // #246
      if (u.type === 'king') this.gameOver(u.type);
      // #235: The Muster counts him, and dawn brings him back (`musterFallen`)
      if (u.type === 'archer' && this.mods.fallenRise) this.fallen = (this.fallen || 0) + 1;
      this.units.splice(this.units.indexOf(u), 1);
      u.bar.visible = false;
      // #117: a rider comes off and falls where he sat; the horse is a horse again and goes home
      this.fell(u.mounted ? this.riderFell(u) : u.mesh, from, 0.5);
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
    if (!this.running || this.hornT > 0 || this.inPrologue() && !this.queen.taken) return;   // #232
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

  // #234: WREN'S ONE BUTTON, doing all three jobs -- send her out, call her in, or let her loose.
  //
  // One control because the corner has room for one more at 50px and no more (#217's mount is the
  // tier this matches), and because the three are never ambiguous: a full meter means the only
  // thing worth doing is spending it, and an empty one means the only question is whether she is
  // out. The panic case needs no second gesture -- release is instant, so `release, then tap again`
  // takes her in.
  useWren() {
    const q = this.queen;
    if (!this.running || this.inPrologue() || q.captive) return;
    if (q.charge >= 1) return this.loosenWren();
    if (q.inKeep) {
      this.queenLeaveKeep();
      // #234: ONE LINE THE FIRST TIME, and none after. A line every night is a line players learn to
      // stop hearing, the same way a window reporting four bug fixes teaches people to dismiss
      // windows. Her own "Get me home -- then we settle this" already licenses this direction.
      if (!this.wrenOutOnce) {
        this.wrenOutOnce = true;
        this.hud.toast('*Then we settle this.* Keep me near them and I will find it.', 4000, 'Wren');
      }
      return;
    }
    this.queenEnterKeep();
  },

  // The release. It spends the WHOLE meter: not a rhythm of small ones, because repetition is what
  // ends games in this genre -- "the game becomes very repetitive very fast" is what held Bad North's
  // user score down despite near-universal praise for its art (docs/competitors.md). One earned
  // moment a night is a memory; a power used every few seconds is more sameness.
  loosenWren() {
    const q = this.queen;
    const W = CFG.wren;
    if (q.charge < 1 || q.inKeep || q.captive) return;
    q.charge = 0;
    q.charging = false;
    const p = q.mesh.position;
    audio.wrenRelease();
    this.spawnFx(p.x, p.z, 0x9ad0ff);
    this.burstFx(tmp.copy(p).setY(1.4), '#cfe8ff', 9, 0.6);
    let held = 0;
    for (const e of this.enemies) {
      if (e.captor || e.camp) continue;
      if (e.mesh.position.distanceToSquared(p) > W.radius * W.radius) continue;
      // The warhorn's own line, and deliberately: `cooldown` is what `updateEnemy` reads before it
      // does anything, so raising it is a proven way to stop a raider without inventing a second
      // one. No push -- the horn shoves them off the King, and this holds them where they are so the
      // army can reach them.
      e.cooldown = Math.max(e.cooldown, W.hold);
      e.retarget = Math.max(e.retarget, W.hold);
      e.flash = Math.max(e.flash || 0, 0.3);
      held++;
    }
    this.hud.toast(held ? `*Wren holds them.* ${held} caught fast.` : '*Wren holds them* \u2014 but nobody was near.', 2400, 'Wren');
  },

  rallied() {
    return this.time < this.rallyUntil;
  },

  // #57: the rally banner. Planted at the King's feet -- see CFG.banner for why it is not aimed --
  // and from then on the army forms up on it rather than on him, until it falls.
  plantBanner() {
    if (!this.running || this.bannerT > 0 || this.inPrologue() && !this.queen.taken) return;   // #232
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
    // #223: AND THE FLOOR UNDER THE FEET, because this is the one line every walking thing in the
    // game goes through every frame -- the King, every unit, every raider, Wren. Putting the Y here
    // rather than in each of their movement blocks is the difference between one place to be right
    // and eleven places to forget, and the failure this repo keeps writing down is a character
    // standing on a roof or inside something.
    //
    // ONLY MESHES PARENTED TO THE ROOT. A rider is a child of its horse and its `position` is local
    // to the saddle; grounding that would put the man through the animal. `floorAt` is 0 everywhere
    // except the three plateaus, and it is three comparisons, so this costs nothing on flat ground.
    if (ent.mesh.parent === this.root && this.world && this.world.floorAt) {
      ent.mesh.position.y = this.world.floorAt(ent.mesh.position.x, ent.mesh.position.z);
    }
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
  // #164: pooled. An arrow is three meshes, a Group, two vectors and a record, and archers make one
  // every shot for a 37-minute run. The record is what gets reused -- its vectors and its mesh come
  // back with it -- so a fired arrow allocates nothing once the pool has warmed to the raid's peak.
  fireArrow(from, target, damage, hostile = false, burn = 0) {
    const a = this.arrowPool.pop() || { mesh: makeArrow(), dir: new V3(), from: new V3() };
    a.mesh.position.copy(from);
    a.target = target;
    a.damage = damage;
    a.life = CFG.arrow.life;
    a.dir.set(0, 0, 0);
    a.from.copy(from);
    a.hostile = hostile;
    // #221: POOLED ARROWS CARRY THEIR LAST FLIGHT'S FLAGS. Without this, an arrow that pierced once
    // comes back off `arrowPool` still marked as having done so and never pierces again -- the relic
    // would work for the first few shots of a run and then quietly stop, which is the worst kind of
    // bug to find because nothing breaks and the player just thinks they misremembered.
    a.pierced = false;
    a.burn = burn;   // #235: seconds the raider it lands in will burn, 0 for an ordinary arrow
    this.root.add(a.mesh);
    this.arrows.push(a);
  },

  // Off the field and back on the shelf. Both ways an arrow ends go through here, so the pool cannot
  // be starved by one path forgetting.
  retireArrow(i) {
    const a = this.arrows[i];
    this.root.remove(a.mesh);
    a.target = null;              // a dead raider must not be kept alive by a spent arrow
    this.arrows.splice(i, 1);
    this.arrowPool.push(a);
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
          } else {
            this.damageEnemy(t, a.damage, tmp, a.from);
            // #235: Fire Arrows. The burn is a share of the arrow that lit it, ticked in
            // `burnEnemies`; a second hit restarts the clock rather than stacking, so a tower
            // crew cannot turn one raider into a bonfire.
            if (a.burn && t.hp > 0) { t.burn = a.burn; t.burnDmg = a.damage * CFG.fire.share; }
          }
          // #221: the Splitting Shaft. The arrow does not stop at the first raider -- it looks for
          // the next one BEYOND the one it just hit and carries on into him.
          //
          // `pierced` so it does this once rather than chaining down a column for ever, and the
          // next target has to be in front: `nearestEnemy` would happily hand back somebody the
          // arrow has already flown past, and an arrow that turns round is a homing missile rather
          // than a shaft that went through. The dot product against the flight direction is what
          // makes it the raider BEHIND the one it hit, which is what the relic promises.
          if (!a.hostile && this.mods.pierce && !a.pierced) {
            const next = this.nearestEnemy(a.mesh.position, CFG.arrow.pierceRange, t);
            if (next && tmp2.subVectors(next.mesh.position, a.mesh.position).normalize().dot(a.dir) > 0.35) {
              a.pierced = true;
              a.target = next;
              continue;
            }
          }
          this.retireArrow(i);
          continue;
        }
        a.dir.normalize();
      } else if (a.dir.lengthSq() === 0) {
        a.dir.set(0, 0, 1);
      }
      a.mesh.position.addScaledVector(a.dir, CFG.arrow.speed * dt);
      a.mesh.lookAt(tmp2.copy(a.mesh.position).add(a.dir));
      if (a.life <= 0 || a.mesh.position.y < 0) this.retireArrow(i);
    }
  },
};
