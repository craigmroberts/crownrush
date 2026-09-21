// Building: the pads, what they cost, what they put on the field, and the walls and Keep they
// put there. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, PADS, TIERS } from './config.js';
import { audio } from './audio.js';
import { makeRigged } from './rig.js';
import { pickOffer } from './upgrades.js';
import {
  makeKing, makeKeep, makeResourceCube, makeArcher, makeCoin, makeHut, makeTower, makeTowerLevelBits, makeBarracks, makeWallSegment, makeGate, makeRubble, makeBridge, makePad, drawPad, ghostify, makeHealthBar, setHealthBar, makeBank, makeGatePost, makeStable, makePaddock, makeHorse,
} from './models.js';
import { makeProp } from './props.js';
import { V3, HAIR, plural, PAD_STYLE, rand, tmp } from './game-shared.js';

// Clear of the castle's crown, which is the tallest thing on it. The built Keep is shorter, but the
// bar sitting a little high over it costs nothing and one number is easier to keep true than two.
const KEEP_BAR_Y = 11.3;

// #117: what a mat says on its face for the locks that are not a Keep level. `padLocked` answers a
// level number for a full army and one of these words otherwise; the Guard's read "Keep Lv noguard"
// on the mat before there was a table for it.
const LOCK_WORD = { noguard: 'Nobody to promote', nohorse: 'The yard is empty', norider: 'No swordsman to ride' };

export const BuildMethods = {
  // ---------- pads ----------
  refreshPads() {
    let added = 0;
    for (const def of [...PADS, ...this.dynamicPads]) {
      // #190: BY ID, NOT BY OBJECT. `addPad` hands a bridge def to `bridgeMatPos`, which returns a
      // `{ ...def, pos }` so the mat lands where the road actually crosses -- so the pad on the field
      // carries a COPY, `p.def === def` never matched, and this added the mat again. Every call, and
      // this runs on every purchase, every level and every restore. Measured: `game.pads` 34 -> 234
      // -> 434 -> 634 -> 834 over four hundred calls, two a call, one per bridge that is unlocked and
      // not yet bought -- which for at least one of the two is usually the whole run.
      //
      // It hid for the same reason it was expensive. The mats are AT THE RIVER, `renderer.info`
      // counts what has been UPLOADED, and nothing off-camera is -- so every GPU counter stayed flat
      // and only the JS heap moved. Then the King walks to the bridge:
      //
      //     at the village   pads 34    geo  214   tex  49   heap  95 MB
      //     800 mats later   pads 834   geo  219   tex  49   heap 137 MB
      //     at the bridge    pads 834   geo 1065   tex 456   heap 149 MB
      //
      // 407 canvas textures at 256x256x4 is about a hundred megabytes of GPU memory, asked for in the
      // frame you cross the river, on a phone, having shown no sign of itself until then.
      //
      // Ids are unique across `PADS` (53, checked) and the dynamic ones are already treated as unique
      // -- `towerPadOpen` matches them by id two hundred lines down. `removePadDef` still compares by
      // object and is safe where it stands, because it is only ever handed a dynamic def and those
      // are not copied; it is the copying that breaks identity, and only bridges copy.
      if (this.pads.some((p) => p.def.id === def.id)) continue;
      if (!def.repeatable && this.built[def.id]) continue;
      if (def.tier !== undefined && def.tier > this.tier) continue;
      const okReq = (def.requires || []).every((id) => this.built[id]);
      if (!okReq) continue;
      if (def.minLevel && this.baseLevel < def.minLevel) continue;
      // some pads have nothing to say until the Queen is home: showing them shut from the first
      // frame teaches nothing and adds a mat to walk over
      if (def.afterRescue && this.inPrologue()) continue;   // #232: the phase, not where she is
      if (def.maxBuys && (this.buyCount[def.id] || 0) >= def.maxBuys) continue;
      // #82: the Warhorse mat has nothing to sell a King who is already riding -- the legacy that
      // starts a run mounted, or a save from when the horse was a mat of its own with this id.
      // #217: and nothing to sell one whose horse is standing in the field either. The test used to
      // be `this.mounted`, so the first dismount would have put a 20-coin Warhorse mat back on the
      // ground and sold him a second horse. What it is really asking is whether he HAS one.
      if (def.effect === 'horse' && this.hasHorse()) continue;
      this.addPad(def);
      added++;
    }
    if (added && this.running) audio.unlock();
  },

  padCost(def) {
    if (def.feed) return this.levelReq() || 0;
    if (def.crew) return def.crew;
    const n = this.buyCount[def.id] || 0;
    return def.cost + (def.growth || 0) * n;
  },

  // #122: `justBought` is set only by the `again` branch of `completePad`, which destroys a finished
  // mat and puts a fresh one in its place. A mat that has just paid out is a different state from one
  // the King has wandered onto, and it wants a different answer.
  //
  // The feed mat gets it too, and the near miss is worth writing down: it LOOKS like the one mat that
  // should be left out -- the tip said "Pouring in materials", and the line below used to hold a
  // fresh one for 0.9s under a name from the resource loop. Both are leftovers from when the Keep took
  // wood and stone. Measured: a feed pad's cost is `levelReq()` in COIN and its `res` list is empty,
  // so `resTimer = 0.9` was gating an empty loop and doing nothing at all, and the mat took the next
  // coin 250ms after a level-up landed like every other one. Standing still on it went 1 -> 4 in 5.3
  // seconds and 104 coins, two levels of which nobody asked for. It is the most expensive mat in the
  // game to fire twice.
  addPad(def, justBought = false) {
    def = this.bridgeMatPos(def);   // #202: a bridge mat goes where the bridge goes
    const { mesh, canvas, tex } = makePad();
    mesh.position.set(def.pos[0], 0.03, def.pos[1]);
    mesh.scale.setScalar(0.01);
    this.root.add(mesh);
    const pad = { def, mesh, canvas, tex, cost: this.padCost(def), paid: 0, ghosts: [], bornAt: this.time, fade: 0, boughtT: justBought ? CFG.spend.bought : 0, res: Object.entries(def.res || {}).map(([type, need]) => ({ type, need, paid: 0 })) };
    // ghost previews: units on the pad, structures where they'd be built, wall outlines along the edge
    //
    // #62: `mine` is whether this ghost's geometry was made FOR it. A ghost built from a loaded model
    // borrows -- makeRigged hands back the rig's own buffers and makeProp shares the prop's -- and
    // freeing those would pull the model out from under every character and building still standing.
    // Anything built procedurally (the walls, the bridge, the fallback characters) is fresh per pad
    // and nobody else's, so it goes when the pad goes. Decided here, in the branch that has just
    // called the builder and knows which it was, rather than guessed at by traversal later.
    //
    // #111: and its own MATERIAL, one clone shared by this pad's ghosts. `ghostify` assigns
    // `GHOST_MAT`, a module-level singleton every ghost in the game wears, so there was no way to
    // fade one pad's preview without fading all of them -- which is what the snapping `visible`
    // below was standing in for, and what a player read as a building glitching.
    const ghost = (mesh, mine) => {
      const g = ghostify(mesh);
      g.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        pad.ghostMat = pad.ghostMat || o.material.clone();
        o.material = pad.ghostMat;
      });
      g.userData.ownGeometry = mine;
      this.root.add(g);
      pad.ghosts.push(g);
      return g;
    };
    // #142: NO GHOSTS ON A RECRUIT MAT. They used to stand two archers on the grass beside it, built
    // from the real rig and ghostified -- same mesh, same silhouette, same size as the archers that
    // fight for you, only translucent. On a field that already has your army walking about, that is a
    // unit the player keeps trying to command, and this game is played at a glance.
    //
    // Nothing is lost: `drawPad` paints the icon, the label and the price onto the mat's own canvas,
    // and the chip says it again with the description when the King stands there. The ghosts were the
    // third telling of the same thing and the only one that could be mistaken for a man.
    //
    // THE CREW MATS KEEP THEIRS, and that is a decision rather than an oversight -- the ticket asks
    // for it to be made. Two reasons. Position does the work translucency could not: a crew ghost
    // stands on the tower's deck at `t.top` (2.72, measured) or on a gate post, and a figure standing
    // in mid-air on a structure is plainly a diagram. And they are load-bearing -- `updatePads` hides
    // one per archer dispatched, which is the only per-archer progress a crew mat shows.
    if (def.crew) {
      for (const [x, z, y] of this.crewSpots(def)) {
        const r = makeRigged('archer');
        const g = ghost(r ? r.mesh : makeArcher(), !r);
        g.position.set(x, y, z);
      }
    } else if (def.wall) {
      for (const sec of this.wallSections(def.wall.tier, def.wall.side)) ghost(this.makeWallMesh(sec), true);
    } else if (def.repair) {
      ghost(this.makeWallMesh(def.repair), true);
    } else if (def.repairKeep) {
      const m = this.makeStructureMesh('keep');
      ghost(m, !m.userData.sharedGeometry).position.set(this.keep.x, 0, this.keep.z);
    } else if (def.bridge) {
      const c = this.world.crossingFor(def.bridge);
      if (c) {
        const g = ghost(makeBridge(this.world.river.halfWidth * 2 + 5, 4.8), true);
        g.position.set(c.x, 0, c.z);
        g.rotation.y = Math.atan2(c.dx, c.dz);
      }
    } else if (def.effect === 'horse') {
      ghost(makeKing(), true).position.set(def.pos[0], 0, def.pos[1] - 1.2);
    } else if (def.effect === 'stableHorse' || def.effect === 'mount') {
      // #117: a riderless horse on the mat's far side, the way the Warhorse shows the King mounted
      ghost(makeHorse(), true).position.set(def.pos[0], 0, def.pos[1] - 1.2);
    } else if (def.structure && def.buildAt && !this.structures.some((st) => st.id === def.id)) {
      // #111: and not when the thing it is previewing is already standing there. A translucent copy
      // of a building fading in and out ON TOP of the real one is the double-draw half of that
      // report, and a preview of something that exists is wrong whether or not anybody sees it.
      const m = this.makeStructureMesh(def.structure);
      ghost(m, !m.userData.sharedGeometry).position.set(def.buildAt[0], 0, def.buildAt[1]);
    }
    this.drawPad(pad);
    this.pads.push(pad);
  },

  // #202: A BRIDGE MAT SITS AT THE BRIDGE, and until now it sat wherever somebody typed.
  //
  // The two were positioned by unrelated mechanisms. The bridge is placed where the road ACTUALLY
  // meets the river -- `world.crossings`, sampled off the road curve -- while `pos` was a constant in
  // config. Measured: the crossings are (1.17, 50.58) and (54.32, 2.96), the mats were typed at
  // (6, 44) and (47, 7). Eight units out, each with one coordinate roughly right and the other
  // wrong, which is what "they only agree by luck" looks like when the luck runs out.
  //
  // The tell was already on screen and nobody had put it together: the GHOST preview of the bridge
  // has used `crossingFor` since it was written, so the translucent bridge stood in the river while
  // its own mat sat eight units away on the bank.
  //
  // Derived rather than re-typed, for the reason #139 gives about tower mats: a better constant is
  // still a constant, and it drifts the next time a road or the river moves. Stepped back from the
  // crossing toward the village -- the near bank, on the road, clear of the water by half a mat.
  //
  // A FRESH `def` with a fresh `pos` array, never the config's own. `def.pos` is shared with `CFG`
  // and mutating it would move the mat for every future run in this session, which is the same trap
  // #139 names.
  // #230: "I can't see the bridge mat fully and it's just taking loads of coins. Wondering if there
  // is an end to it or if it just sinks all my coins."
  //
  // Both halves of that are one fault. The mat carries its own name, its price and how much of it is
  // paid -- that is what `drawPad` writes on the floor -- and the near edge of it was under the
  // water, so the one surface that answers "is there an end to it" was the part you could not see.
  //
  // The setback used to be arithmetic: half the river, plus half the mat, plus air. It is right only
  // if the road meets the water square on, and neither crossing does -- both roads run at an angle,
  // so stepping 6.4 back ALONG the road moves you less than 6.4 away from the river, and a square
  // mat's corner is nearer still than its centre. Measured in a browser: the east mat's closest
  // corner sat 3.68 from the centreline against a half-width of 3.6. Eight centimetres of bank.
  //
  // So it steps back until the WHOLE mat is clear, asking `riverInfo` -- the river the world
  // actually built, wander and all -- rather than trusting a number. 0.8 is the strip of grass left
  // showing between the mat and the water, enough to read the mat as standing on the bank.
  bridgeMatPos(def) {
    if (!def.bridge || !this.world || !this.world.crossingFor) return def;
    const c = this.world.crossingFor(def.bridge);
    if (!c) return def;                       // no road reaches the river yet: keep what config said
    // Toward the origin along the road, so it lands on the side the player is standing on.
    const sign = (c.x * c.dx + c.z * c.dz) > 0 ? -1 : 1;
    const half = CFG.spend.padSize / 2;
    const want = this.world.river.halfWidth + 0.8;
    const start = this.world.river.halfWidth + 0.6 + half + 0.4;
    let pos = [c.x + c.dx * start * sign, c.z + c.dz * start * sign];
    for (let back = start; back <= start + 6; back += 0.2) {
      const x = c.x + c.dx * back * sign;
      const z = c.z + c.dz * back * sign;
      let near = Infinity;
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        near = Math.min(near, this.world.riverInfo(x + ix * half, z + iz * half).dist);
      }
      pos = [+x.toFixed(2), +z.toFixed(2)];
      if (near >= want) break;
    }
    // #190: NOTE THAT THIS IS A COPY. The mat the player walks onto carries THIS def, not the one
    // `config.js` holds, so anything asking "is this mat already down?" by object identity is asking
    // the wrong question -- see `refreshPads`, where that cost a hundred megabytes.
    return { ...def, pos };
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
    if (def.feed || def.repairKeep) return 'Royal Keep';   // #78: one mat, so one name on the floor
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
      locked: pad.locked === 'rescue' ? 'Free Wren' : typeof pad.locked === 'number' ? `Keep Lv ${pad.locked}` : pad.locked ? LOCK_WORD[pad.locked] : null,
      lockIcon: pad.locked === 'rescue' ? 'tiara' : 'keep',
      shape: style.shape, rim: style.rim,
      // #37: the cost lived only in the sheet along the bottom edge, and the eyes are on the King.
      // Coin pads carry it on the mat instead: what it costs, how far in you are, and anything in
      // the way sitting above the bar so the bar itself never moves.
      cost: pad.def.crew ? 0 : pad.cost,
      left: Math.max(0, pad.cost - pad.paid),
      // #122: the hold outranks a lock in the pill, because it is the newer news and the one the
      // player is owed an explanation for -- a mat that quietly ignores payment reads as the game
      // being laggy. The tip's note is the channel that is actually READ (measured: it is up and
      // correct for the whole hold); this is the redundancy, for the case where `showPadTip` has
      // stood down because a notice is being read (#102) -- a night falling, a thief in the coins,
      // Wren speaking -- and the note is off screen for the whole second.
      //
      // It carries the same legibility the lock messages have always had, which is not perfect: the
      // King stands on the mat and the ghost previews stand on it too, so at a sharp angle the pill
      // is half covered. It is the mat's FACE changing that does the work at that distance, the way
      // the price strip underneath already does.
      blocker: pad.boughtT > 0 ? 'Bought' : pad.locked === 'rescue' ? 'Free Wren first' : typeof pad.locked === 'number' ? `Needs Lv. ${pad.locked}` : pad.locked ? LOCK_WORD[pad.locked] : null,
      blockerOk: pad.boughtT > 0,
    });
  },

  // the material the village is built in right now: follows the walls
  materialName() {
    return CFG.wallLevels[this.wallLevel].name.toLowerCase();
  },

  makeStructureMesh(kind, level = 1) {
    const m = this.materialName();
    if (kind === 'bank') return makeBank();
    if (kind === 'hut') {
      // The generated cabin if it is loaded, the built one if it is not, exactly as the characters
      // fall back. The chimney is where world.addSmoker hangs the smoke, so the import has to say
      // where its own is; the built hut sets the same userData.
      const p = makeProp('hut', CFG.structureTint[m]);
      if (p) {
        p.userData.chimney = new THREE.Vector3(1.14, 5.8, -0.86);
        return p;
      }
      return makeHut(m);
    }
    if (kind === 'keep') {
      // The Queen stands on userData.balcony when she is rescued, so the import has to name a spot
      // for her the way the built Keep does: here it is the wall walk over the gate, between the two
      // front towers, rather than the built Keep's jutting ledge.
      const p = makeProp('keep', CFG.structureTint[m]);
      if (p) {
        p.userData.balcony = new THREE.Vector3(0, 3.3, 1.9);
        return p;
      }
      return makeKeep(m);
    }
    if (kind === 'house') {
      // A villager home. Small, and there are six of them, so it is the one building that gets the
      // generated model at a size below the Archery Range rather than above it. Its chimney is the
      // tallest thing on it, and naming the cap is what puts smoke over a village that is lived in.
      const p = makeProp('house', CFG.structureTint[m]);
      if (p) {
        p.userData.chimney = new THREE.Vector3(-0.03, 5.3, 0.26);
        return p;
      }
      return makeHut(m);
    }
    if (kind === 'tower') {
      // #203: THE IMPORT'S DECK IS NOT WHERE THE BUILT TOWER'S IS, and this line used to say it was:
      // "the import is sized to put it exactly where the built tower's is (2.72) and the crew code
      // needs no idea which one it got". It was not, and the crew code did need to know.
      //
      // The built tower's platform is a 0.22 slab centred on 2.60, so its floor is 2.71 and its own
      // `userData.top` of 2.72 is right. The import's planking runs 2.74 to 2.99 -- measured as
      // 4.09 m2 of flat, upward-facing surface at y=2.99, six times the area of the next band on the
      // model. Standing a crew at 2.72 put their feet under the floor: a ring of markers at that
      // height hangs in the open air beneath the deck, which is the picture on #203.
      //
      // Each model states its own, which is the arrangement that was claimed and never true.
      const p = makeProp('tower', CFG.structureTint[m]);
      if (p) {
        p.userData.top = 2.99;
        p.add(makeTowerLevelBits(level));
        return p;
      }
      return makeTower(level, m);
    }
    if (kind === 'barracks') return makeProp('barracks', CFG.structureTint[m]) || makeBarracks(m);
    if (kind === 'stable') {
      // #82: one block, two things. The building sits at the back and the paddock in front of it,
      // laid out by `CFG.stable` about the block's centre so the footprint is one rectangle. The
      // generated building (`stable_ai`) drops into the same slot as the built one; the yard is the
      // game's own either way, because the horses in it are gameplay (#117) and have to walk out
      // through a gap the game knows about rather than through whatever fence the model brought.
      const S = CFG.stable;
      const g = new THREE.Group();
      const b = makeProp('stable', CFG.structureTint[m]) || makeStable(m);
      b.position.z = S.buildingAt;
      g.add(b);
      const yard = makePaddock(S.yard[0], S.yard[1], S.gate);
      yard.position.z = S.yardAt;
      g.add(yard);
      return g;
    }
    return new THREE.Group();
  },

  // #152: the kingdom the player has for one minute, built through the same functions the player
  // builds through -- `rebuildVillage` replays every structural pad, wall, bridge and expansion,
  // which is exactly the job and is already written and tested because every resumed run does it.
  //
  // A SET WOULD HAVE BEEN CHEAPER and was rejected: "then i can also design it better when its fully
  // built". You cannot design a tableau by playing it. This stands real buildings on real coordinates
  // with real crews and real villagers, so laying the opening out differently later is a matter of
  // changing which pads are in `built` -- or, eventually, of playing a run and exporting the save.
  //
  // `announce: false` on the material pass, because nothing has happened yet as far as the player is
  // concerned: the village has always been here.
  standOpeningVillage() {
    const O = CFG.opening;
    const built = {};
    for (const def of PADS) {
      if (def.tier !== undefined && def.tier > O.tier) continue;
      if (!def.structure && !def.wall && def.effect !== 'expand') continue;
      if (O.skip.includes(def.id)) continue;
      built[def.id] = true;
    }
    // the homes are marked built and given a spot, so `rebuildVillage` stands them where the morning
    // wants them rather than where the tier-1 map would
    const placedAt = {};
    for (const [id, x, z] of O.homes) {
      built[id] = true;
      placedAt[id] = [x, z];
    }
    this.baseLevel = O.level;
    this.wallLevel = Math.min(CFG.wallLevels.length - 1, CFG.base.wallAt.filter((l) => l <= O.level).length - 1);
    this.built = { ...built };
    this.rebuildVillage({ built, placedAt });
    // the towers are manned. `addTurret` is what a crew mat ends in, so this is the same archer on
    // the same deck the player would have paid for.
    for (const id of Object.keys(this.towers)) {
      const t = this.towers[id];
      for (const [x, z, y] of this.crewSpots({ tower: id, crew: this.towerLevel(t).slots })) {   // #227
        this.addTurret(x, z, y, id);
        t.crew++;
      }
    }
    this.rebuildStructures(false);
    // SHE IS NOT IN THE KEEP. `buildStructure` ends a Keep with `queenEnterKeep`, which is right every
    // other time it runs and exactly wrong here: the whole of this minute is that she is walking
    // beside him, and a Wren standing on a balcony is a Wren the player never had. Caught in a
    // screenshot, not in the state -- every count was correct and she was on the roof.
    this.queenLeaveKeep();
    // AND HE STANDS CLEAR OF IT. `reset` spawns him at [0, 2], which is inside the Keep's own
    // footprint (`CFG.keep.half` is 2.9) -- fine on an empty plot, and on this morning `collideKeep`
    // shoves him to the door at z 3.4. Her follow point is 1.9 BEHIND him, which then lands inside the
    // Keep box too, so `collideKeep` squeezed her out sideways and she ended up 0.2 from him: standing
    // inside the King, invisible, on the one screen whose whole job is that she is beside him.
    //
    // Measured, not guessed: king [0, 3.4], queen [0, 3.2], 0.2 apart, both "visible" and both on
    // screen. Every count was right again.
    this.king.mesh.position.set(0, 0, 8);
    this.queen.mesh.position.set(0, 0, 10.2);
    this.refreshPads();
  },

  // #152: and then it comes down. Not a cut to an empty plot -- the player watches the thing he was
  // just walking around stop being there, which is the whole of why the next half hour is "rebuild"
  // rather than "build".
  //
  // Rubble first, state second. Every building becomes a heap on the spot it stood, every wall breaks,
  // the Keep breaks, and only then is the bookkeeping cleared -- so a frame of this is a ruin rather
  // than a blank field, and `reset()` is never involved (it would take the King, the Queen and the men
  // carrying her off with it).
  fallOfTheVillage() {
    for (const rec of this.structures) {
      const p = rec.mesh.position;
      this.root.remove(rec.mesh);
      const heap = makeRubble(3.4, this.wallLevel);
      heap.position.set(p.x, 0, p.z);
      this.root.add(heap);
      this.ruins.push({ mesh: heap, t: CFG.opening.ruinFade });
    }
    this.structures = [];
    for (const w of this.walls) if (w.state !== 'broken') this.breakWall(w);
    if (this.keep && this.keep.state === 'built') this.breakKeep();
    // the crews go with their towers, and the people with their homes
    for (const t of this.turrets) {
      this.root.remove(t.mesh);
      this.disposeEntity(t.mesh);
    }
    this.turrets = [];
    this.towers = {};
    for (const v of this.villagers) {
      this.root.remove(v.mesh);
      this.disposeEntity(v.mesh);
    }
    this.villagers = [];
    // #169: and the gleaner with the Keep he lives at. He is back the first frame it stands again.
    if (this.gleaner) {
      this.root.remove(this.gleaner.mesh);
      this.disposeEntity(this.gleaner.mesh);
      this.gleaner = null;
    }
    // #117: the horses with their yard (the Stable is tier 1 and never in the opening, so this is
    // for the record rather than for the morning)
    for (const h of this.horses) {
      this.root.remove(h.mesh);
      this.disposeEntity(h.mesh);
    }
    this.horses = [];
    this.stable = null;
    if (this.world.clearSmokers) this.world.clearSmokers();
    if (this.world.clearPaths) this.world.clearPaths();   // #180: the homes' paths go with the homes
    // and the ledger, so what he rebuilds he pays for
    this.built = {};
    this.buyCount = {};
    this.baseLevel = 0;
    this.wallLevel = 0;
    this.tier = 0;
    this.keep = null;
    this.feedDef = null;
    this.dynamicPads = [];
    for (const pad of this.pads) { this.root.remove(pad.mesh); this.disposePad(pad); }
    this.pads = [];
    this.refreshPads();
  },

  // #152: the heaps sink back into the grass. They are the only thing the fall leaves behind, and a
  // field of rubble the player has to build a village around would be the opening charging him rent
  // for its own drama.
  updateRuins(dt) {
    if (!this.ruins.length) return;
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const r = this.ruins[i];
      r.t -= dt;
      if (r.t > 1.2) continue;
      // the last beat is a sink rather than a fade: these are baked, opaque meshes and giving each one
      // its own transparent material clone to fade would cost more than the heap is worth
      r.mesh.position.y = Math.min(0, (r.t - 1.2) * 1.6);
      if (r.t > 0) continue;
      this.root.remove(r.mesh);
      this.disposeEntity(r.mesh);
      this.ruins.splice(i, 1);
    }
  },

  // #3: the Keep crossed a material boundary, so every standing building is rebuilt in the new one.
  // Towers keep their level and crew, the Keep keeps its health bar and the Queen on the balcony.
  rebuildStructures(announce = true) {
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
        // #126: through the same call the door uses, so the two paths cannot drift apart again. This
        // is the one moment in a run when the Keep's mesh identity changes under a Wren who may be
        // standing on its balcony -- levels 4, 8 and 12 (`CFG.base.wallAt`).
        if (this.queen.inKeep) this.queenToBalcony();
      }
      if (t) t.mesh = m;
      if (s.kind === 'stable' && this.stable) this.stable.mesh = m;   // #82
      this.root.remove(s.mesh);
      this.root.add(m);
      this.popIn(m, i * 0.08);
      s.mesh = m;
    });
    if (announce && this.structures.length) this.hud.toast(`The village is rebuilt in ${this.materialName()}.`, 2600, 'Village');
  },

  // where a crew pad sends its archers: gate posts, or the next free spots around a tower top
  crewSpots(def) {
    // Gate posts are read off the ring's own gates rather than written out by hand: a pair of posts
    // just inside each gateway, set either side of it. The hand-written list was rectangle corners
    // and had nothing to say about a wall that bends.
    if (def.posts) {
      const y = CFG.gatePost.height + 0.08;
      const T = TIERS[def.postTier ?? def.tier];
      const c = T.ring || { x: (T.bounds.x0 + T.bounds.x1) / 2, z: (T.bounds.z0 + T.bounds.z1) / 2 };
      const out = [];
      for (const sec of this.wallSections(def.postTier ?? def.tier, 'all')) {
        if (!sec.gate) continue;
        const ix = (c.x - sec.mx);
        const iz = (c.z - sec.mz);
        const il = Math.hypot(ix, iz) || 1;
        const px = sec.mx + (ix / il) * 1.5;      // a step inside the gateway
        const pz = sec.mz + (iz / il) * 1.5;
        const ax = Math.cos(sec.ang);
        const az = Math.sin(sec.ang);
        out.push([px - ax * 2.2, pz - az * 2.2, y], [px + ax * 2.2, pz + az * 2.2, y]);
      }
      return out.slice(0, def.crew || out.length);
    }
    if (def.spots) return def.spots.map((s) => [s[0], s[1], s[2] || 0]);
    const t = this.towers[def.tower];
    if (!t) return [];
    // #203: the places on the deck that nobody has yet, in fill order -- not "the next `crew`
    // angles", which is what `(t.crew + i)` was.
    //
    // Counting the crew to pick a slot is wrong the moment the crew is not the numbers 0..n-1, and
    // it stops being that the first time an archer is shot off a deck: `damageTurret` drops `crew`
    // by one, the hole the casualty left is never reused, and the replacement is handed the place a
    // survivor is already standing in. Replayed on the old arithmetic that is 0.000 apart -- two
    // archers on one coordinate, which is the bug class #179 was written about.
    //
    // Asking the deck who is on it cannot get that wrong, and it needs nothing kept in step: a
    // restored save puts its turrets back by coordinate (`restoreRun`) and a dragged tower moves
    // them bodily (`moveStructure`), so both come out right for free and no save format changes.
    const D = CFG.tower.deck;
    const ring = D.order.map((i) => {
      const a = i * ((Math.PI * 2) / D.slots) + 0.5;
      return [t.x + Math.cos(a) * D.radius, t.z + Math.sin(a) * D.radius, t.top];
    });
    return this.freeSpots(ring).slice(0, def.crew);
  },

  // #203: drop the spots somebody is standing on, or is on their way to. The threshold is half the
  // gap between neighbouring places on the ring, so a spot is only ever claimed by the man actually
  // on it and never by his neighbour.
  freeSpots(spots) {
    const D = CFG.tower.deck;
    const near = D.radius * Math.sin(Math.PI / D.slots);
    const held = [];
    for (const t of this.turrets) held.push(t.mesh.position.x, t.mesh.position.z);
    for (const u of this.units) if (u.assign) held.push(u.assign[0], u.assign[1]);
    return spots.filter(([x, z]) => {
      for (let i = 0; i < held.length; i += 2) if (Math.hypot(held[i] - x, held[i + 1] - z) < near) return false;
      return true;
    });
  },

  // A tower's pad cycles: build -> man it -> upgrade -> man the new slots -> upgrade ... (3 levels)
  // #227: THE SAME MAT, TWICE, IS A TOWER THAT UPGRADES TWICE.
  //
  // Reported as "the game has frozen when upgrading the archer tower", with 220 errors swallowed by
  // the update loop and `lv.range` on the end of them. Reproduced exactly: a level-2 tower with its
  // upgrade mat already standing, a crew member killed by a raid, the slot refilled -- the refill
  // path calls `queueTowerPad(id, 'up')` again and nothing checked that the mat was already there.
  // Two mats with the identical id, both payable, `t.level++` twice, level 4 against a table of
  // three. `CFG.tower.levels[3]` is undefined and `updateTurrets` reads `.range` off it every frame
  // for the rest of the run.
  //
  // The id was always unique per tower and level -- `up-tower-0-ne-3` -- so it was already saying
  // what it is; nothing was asking. A tower crew dies every raid on a long run, which is why this
  // took until night 6 to appear and why it appeared for good once it did.
  padQueued(padId) {
    if (this.dynamicPads.some((d) => d.id === padId)) return true;
    return this.pads.some((p) => p.def && p.def.id === padId);
  },

  queueTowerPad(id, kind) {
    const t = this.towers[id];
    const lv = this.towerLevel(t);
    if (kind === 'crew') {
      const add = lv.slots + this.mods.towerSlots - t.crew;
      if (add <= 0) return this.queueTowerPad(id, 'up');
      const padId = `crew-${id}-${t.level}`;
      if (this.padQueued(padId)) return;
      this.dynamicPads.push({ id: padId, pos: [t.pos[0], t.pos[1]], crew: add, icon: 'archer', label: 'Man the Tower', tower: id, toast: 'Tower manned!' });
    } else if (t.level < CFG.tower.levels.length) {
      const padId = `up-${id}-${t.level + 1}`;
      if (this.padQueued(padId)) return;
      const up = CFG.tower.upgrade[t.level - 1];
      const next = CFG.tower.levels[t.level];
      this.dynamicPads.push({ id: padId, pos: [t.pos[0], t.pos[1]], cost: up.cost, coin: up.coin, icon: 'tower', label: `Tower Level ${t.level + 1}`, towerUp: id, toast: `Watchtower level ${t.level + 1}: ${next.slots} crew, sharper arrows.` });
    }
    this.refreshPads();
  },

  // #227: a tower's rung on the table, whatever the tower thinks its level is.
  //
  // The duplicate mat above is the bug that was found; this is so that no OTHER way of getting a
  // level out of range can freeze the game again. A level comes out of a save file as well as out
  // of `t.level++` (`game-save.js` assigns it straight in), and a game that stops rendering is the
  // worst possible answer to a number being 4 when the table has three rows. There is no level 4,
  // so a tower claiming to be one is a tower at the top -- which is also true of one whose level
  // arrived as 0, undefined or NaN.
  towerLevel(t) {
    const L = CFG.tower.levels;
    const i = Math.round(t.level) - 1;
    return L[Number.isFinite(i) ? Math.max(0, Math.min(L.length - 1, i)) : 0];
  },

  completePad(pad) {
    const def = pad.def;
    this.built[def.id] = true;
    this.buyCount[def.id] = (this.buyCount[def.id] || 0) + 1;
    this.releaseGhosts(pad);

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
        setHealthBar(u.bar, u.hp / u.maxHp);
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
      t.mesh = this.makeStructureMesh('tower', t.level);
      t.mesh.position.set(t.x, 0, t.z);
      const rec = this.structures.find((s) => s.id === def.towerUp);
      if (rec) rec.mesh = t.mesh;
      this.popIn(t.mesh);
      this.root.add(t.mesh);
      this.queueTowerPad(def.towerUp, 'crew');
    }
    if (def.posts) {
      // crewSpots is where the posts come from -- def.spots is the hand-written override it falls back
      // to, and no pad has one, so reading it here threw and left the pad on the ground half-bought.
      for (const [x, z] of this.crewSpots(def)) {
        const m = makeGatePost();
        m.position.set(x, 0, z);
        this.popIn(m);
        this.root.add(m);
      }
    }
    // #43: a placeable structure is paid for here and PUT DOWN later -- the score, the toast and the
    // unlock all belong to the purchase, and only the spot is still an open question.
    // #152: parked behind `CFG.placeBuildings`. With it off a placeable structure is an ordinary one
    // and goes where the map says, which is the branch below -- so this is one condition rather than
    // a second path, and turning it back on restores #43 and #137 whole.
    if (def.structure && def.place && CFG.placeBuildings) this.beginPlacing(def);
    else if (def.structure) this.buildStructure(def, this.placedAt[def.id] || def.buildAt);
    if (def.wall) this.buildWall(def.wall.tier, def.wall.side);
    if (def.repair) this.restoreWall(def.repair);
    if (def.repairKeep) this.restoreKeep();
    if (def.effect === 'damage') this.damageMul *= 1.4;
    if (def.effect === 'kinghp') {
      this.king.maxHp += 80;
      this.king.hp = this.king.maxHp;
      setHealthBar(this.king.bar, 1);   // a full heal has to put the bar away, not just fill it
    }
    if (def.effect === 'wallLevel') this.upgradeWalls();
    if (def.feed) this.levelUp();
    if (def.effect === 'expand') this.expand();
    if (def.effect === 'horse') this.mountKing();
    if (def.effect === 'horseSpeed') this.trainHorses();
    if (def.effect === 'stableHorse') this.addYardHorse();   // #117
    if (def.effect === 'mount') this.sendHorse();
    if (def.effect === 'guard') this.promoteGuard(2);
    if (def.bridge) {
      const m = this.world.buildBridge(def.bridge);
      if (m) this.popIn(m);
    }
    if (!def.crew) this.addScore(pad.cost * CFG.score.buildPerCoin + pad.res.reduce((a, r) => a + r.need, 0) * CFG.score.buildPerMaterial);
    // #105: a mat that changed what the player can DO says so on a panel that takes the screen, and
    // the toast would fire underneath it -- `#toast` is z-index 4 against `.overlay`'s 10, which is
    // exactly the trap #99 found under the level-up modal. The pads that do not change a capability
    // (and any future `effect` this does not know how to describe) still speak in a toast.
    // Built here, where every effect above has already been applied, and shown at the bottom once the
    // mat is gone and `refreshPads` has run, so the world behind the blur is the world he bought.
    const gain = this.capabilityGains(def);
    if (def.toast && !gain) this.hud.toast(def.toast, 3200, 'Village');

    const again = def.repeatable && !(def.maxBuys && this.buyCount[def.id] >= def.maxBuys) && !(def.feed && !this.levelReq());
    if (again) {
      this.root.remove(pad.mesh);
      this.disposePad(pad);
      this.pads.splice(this.pads.indexOf(pad), 1);
      this.addPad(def, true);
    } else {
      this.root.remove(pad.mesh);
      this.disposePad(pad);
      this.pads.splice(this.pads.indexOf(pad), 1);
      const di = this.dynamicPads.indexOf(def);
      if (di >= 0) this.dynamicPads.splice(di, 1);
    }
    this.refreshPads();
    if (gain) this.showGain(gain);
  },

  // ---------- #43: putting a building where the player wants it ----------
  //
  // The ticket asks for a ghost that follows the finger. This follows the KING instead, and that is a
  // deliberate departure: the game's only input is drag-anywhere-to-move-him, so a cursor tracking
  // the finger would be fighting the joystick for the same gesture on the same canvas -- which is
  // exactly the shape of #128, where something over the canvas swallowed the drag and the King would
  // not move. Walking to the spot and confirming is the same decision without a second input mode,
  // it matches the rally banner (#57) which is planted where he stands, and it makes one rule free:
  // a building can never end up somewhere he could not reach.
  //
  // Opt-in per pad (`place: true`), which for this pass is the watchtowers and the homes. The
  // ticket's own line is that "towers especially want to be placed by the player", and the four
  // service buildings and the Keep are structural enough that moving them is a separate argument.

  beginPlacing(def, quiet = false) {
    this.cancelPlacing();
    const mesh = ghostify(this.makeStructureMesh(def.structure));
    // ITS OWN MATERIAL, and this is not a detail. `ghostify` assigns `GHOST_MAT`, which is a
    // module-level material shared by every ghost in the game -- the preview on each build mat is
    // wearing it too. Tinting that to say "this spot is taken" would have turned every ghost in the
    // village red at the same time. One clone, shared within this ghost only, disposed with it.
    let mat = null;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      mat = mat || o.material.clone();
      o.material = mat;
    });
    const kp = this.king.mesh.position;
    // #137: the ghost has a position of its own now instead of being pinned to the King every frame.
    // It starts where he is standing -- he has just paid for it there, or he is about to pick up the
    // building he is next to -- and from then on the finger owns it.
    const at = { x: this.snapPlace(kp.x), z: this.snapPlace(kp.z) };
    mesh.position.set(at.x, 0, at.z);
    this.root.add(mesh);
    this.placing = { def, mesh, mat, ok: null, at };
    this.enterEditMode();
    // `quiet` for the moving half, which says its own thing a line later: without it one pick-up fired
    // two notices, and the second had to wait out the first before it could be read.
    if (!quiet) this.hud.toast('Drag it where it should stand, then *tap the tick.*', 4200, 'Village');
  },

  // #137: centres land on multiples of `CFG.place.grid`, and the grid drawn under them is the same
  // spacing -- see the note in config.js for why 2 and not 1 or 4.
  snapPlace(v) {
    const g = CFG.place.grid;
    return Math.round(v / g) * g;
  },

  // #137: what makes the finger safe to use. The joystick is suspended for as long as a placement is
  // live, so the drag that moves the ghost is not also the drag that moves the King -- which is the
  // whole of #43's objection to finger-dragging, and it goes away once the two are sequential rather
  // than simultaneous. The class on `body` fades everything else (see style.css).
  enterEditMode() {
    if (this.input) {
      this.input.release();
      this.input.suspended = true;
    }
    document.body.classList.add('placing');
    this.showPlaceGrid();
  },

  leaveEditMode() {
    // #138: the pan goes with the mode. One place, because every way out of a placement -- confirm,
    // cancel, restart -- already runs through here, and a camera left off the King is a game whose
    // own player is off screen.
    this.camPan = null;
    if (this.input) this.input.suspended = false;
    document.body.classList.remove('placing');
    this.hidePlaceGrid();
  },

  // The squares, drawn over exactly the ground a building is allowed to stand on: the current tier's
  // bounds, which is the same rectangle `placeOk` tests against. So the grid stopping IS the rule,
  // rather than a decoration that happens to sit near it.
  //
  // One LineSegments, one draw call, and only while a placement is live -- the steady-state budget in
  // the README is untouched.
  showPlaceGrid() {
    this.hidePlaceGrid();
    const b = TIERS[this.tier].bounds;
    const g = CFG.place.grid;
    const pts = [];
    const y = 0.06;   // clear of the ground and under every mat, which sit at 0.03 and draw over it
    const x0 = Math.ceil(b.x0 / g) * g;
    const z0 = Math.ceil(b.z0 / g) * g;
    for (let x = x0; x <= b.x1; x += g) pts.push(x, y, b.z0, x, y, b.z1);
    for (let z = z0; z <= b.z1; z += g) pts.push(b.x0, y, z, b.x1, y, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xf4f7ec, transparent: true, opacity: 0.22, depthWrite: false });
    this.placeGrid = new THREE.LineSegments(geo, mat);
    this.root.add(this.placeGrid);
  },

  hidePlaceGrid() {
    if (!this.placeGrid) return;
    this.root.remove(this.placeGrid);
    this.placeGrid.geometry.dispose();
    this.placeGrid.material.dispose();
    this.placeGrid = null;
  },

  // #137: the finger moved. Screen point to ground point to grid square, and the ghost follows.
  // Refused off the ground plane (the sky above the horizon), where `groundAt` has no answer.
  dragPlacingTo(clientX, clientY) {
    const pl = this.placing;
    if (!pl) return;
    const g = this.groundAt(clientX, clientY);
    if (!g) return;
    pl.at.x = this.snapPlace(g.x);
    pl.at.z = this.snapPlace(g.z);
  },

  // #138: is this press on the ghost, or on the ground beside it? One box test decides which gesture
  // the drag is, which is the whole of giving edit mode two of them.
  //
  // The box is the footprint plus `CFG.place.grab`, and the margin is not politeness: a watchtower is
  // 2.50 x 3.32 world units, which at the game's camera is a target about a thumb wide and no more.
  // Without it the ghost would be the harder thing to hit of the two, and it is the one the player
  // came here to move.
  onPlacingGhost(clientX, clientY) {
    const pl = this.placing;
    if (!pl) return false;
    const g = this.groundAt(clientX, clientY);
    if (!g) return false;
    const [w, d] = CFG.footprint[pl.def.structure] || [3, 3];
    const m = CFG.place.grab;
    return Math.abs(g.x - pl.at.x) <= w / 2 + m && Math.abs(g.z - pl.at.z) <= d / 2 + m;
  },

  // #138: drag the ground and the ground follows the finger.
  //
  // The arithmetic is the self-correcting kind rather than a pixels-to-world scale, because the
  // camera it is reading through is the one it is moving. `groundAt` answers in the CURRENT camera's
  // space, and that space is the un-panned one shifted by `camPan` -- so the pan that puts the
  // grabbed world point back under the finger is `grabbed - (here - camPan)`. Any drift corrects
  // itself on the next move rather than accumulating.
  //
  // Held to the tier's own bounds, which is the rectangle a building may legally stand in and the
  // one the grid draws. A pan that can wander to the far quarries is a pan you have to walk back.
  panPlacingTo(clientX, clientY) {
    const pan = this.camPan;
    if (!pan) return;
    const here = this.groundAt(clientX, clientY);
    if (!here) return;
    const b = TIERS[this.tier].bounds;
    const m = CFG.place.panMargin;
    const kp = this.king.mesh.position;
    pan.x = Math.min(Math.max(pan.grabX - (here.x - pan.x), b.x0 - m - kp.x), b.x1 + m - kp.x);
    pan.z = Math.min(Math.max(pan.grabZ - (here.z - pan.z), b.z0 - m - kp.z), b.z1 + m - kp.z);
  },

  beginPlacingPan(clientX, clientY) {
    const g = this.groundAt(clientX, clientY);
    if (!g || !this.placing) return false;
    this.camPan = { x: this.camPan ? this.camPan.x : 0, z: this.camPan ? this.camPan.z : 0, grabX: g.x, grabZ: g.z };
    return true;
  },

  // #43, the moving half. A building already standing is picked up and put down again, and the
  // things it owns at an absolute position come with it -- a tower's crew, a chimney's smoke, the
  // villager whose home it is. Free, because the walk there and the walk back is the cost and a coin
  // fee on undoing your own mistake is a tax on learning the game.
  //
  // DAYTIME ONLY. Not a balance number, a rule with a reason: a crewed watchtower that can be picked
  // up mid-raid is a tower that dodges a sapper, and builders not working at night is a sentence that
  // explains itself. It is also why nothing here has to think about what a raid is doing.
  //
  // #152: `beginMoving` (the move button's handler) and `longPressAt` (a finger held on a building)
  // both ask this first, so the flag closes both. `nearMovable` does NOT -- it keeps its own copy of
  // the `place` test, and has its own gate for that reason.
  canMove(rec) {
    if (!CFG.placeBuildings) return false;
    return !!rec && !this.night && !this.placing && !!(PADS.find((d) => d.id === rec.id) || {}).place;
  },

  // The movable building he is standing next to, or null. One pass, once a frame.
  nearMovable() {
    // #152: its own gate, not `canMove`'s. This duplicates the `place` test rather than calling
    // `canMove(st)` -- which is why parking the feature at `canMove` alone left the move button
    // sitting there offering something nothing would honour. Caught by driving it; the flag has to be
    // read where the question is actually asked.
    if (!CFG.placeBuildings) return null;
    if (this.night || this.placing) return null;
    const kp = this.king.mesh.position;
    let best = null;
    let bd = 4.5;
    for (const st of this.structures) {
      const d = Math.hypot(st.mesh.position.x - kp.x, st.mesh.position.z - kp.z);
      if (d < bd && (PADS.find((x) => x.id === st.id) || {}).place) {
        bd = d;
        best = st;
      }
    }
    return best;
  },

  beginMoving(rec) {
    if (!this.canMove(rec)) return;
    const def = PADS.find((d) => d.id === rec.id);
    if (!def) return;
    this.beginPlacing(def, true);
    if (!this.placing) return;
    this.placing.moving = rec;
    this.placing.from = [rec.mesh.position.x, rec.mesh.position.z];
    // #137: a building being MOVED starts under the ghost that is already standing there, rather than
    // jumping to the King's feet the moment it is picked up. Not snapped: it goes back on cancel
    // exactly where it was, and a building placed before the grid existed (or by `def.buildAt`, which
    // is off-grid for most of them) must not shuffle sideways just for being touched.
    this.placing.at.x = rec.mesh.position.x;
    this.placing.at.z = rec.mesh.position.z;
    // Out of the pop-in animation first. `updatePopping` sets `visible = true` on everything still
    // popping, every frame, so a building picked up within half a second of being built would refuse
    // to disappear -- measured, `realHidden` came back false. Its pop is over as far as this is
    // concerned, so finish it rather than fight it.
    const i = this.popping.indexOf(rec.mesh);
    if (i >= 0) {
      this.popping.splice(i, 1);
      rec.mesh.scale.setScalar(rec.mesh.userData.baseScale || 1);
    }
    rec.mesh.visible = false;   // picked up: the ghost is where it is now
    this.hud.toast('Drag it somewhere else, then *tap the tick* — or the cross to leave it.', 4200, 'Village');
  },

  // Everything the building owns at an absolute position, shifted by the same delta. A delta rather
  // than a teardown and rebuild, because rebuilding would lose the tower's crew and the villager's
  // identity and would have to put both back by hand.
  moveStructure(rec, to) {
    const fx = rec.mesh.position.x;
    const fz = rec.mesh.position.z;
    const dx = to[0] - fx;
    const dz = to[1] - fz;
    rec.mesh.position.set(to[0], 0, to[1]);
    rec.mesh.visible = true;
    const t = this.towers[rec.id];
    if (t) {
      t.x = to[0];
      t.z = to[1];
      t.pos = [t.pos[0] + dx, t.pos[1] + dz];
      // the crew standing on its deck
      for (const tu of this.turrets) {
        if (tu.tower !== rec.id) continue;
        tu.mesh.position.x += dx;
        tu.mesh.position.z += dz;
        tu.pos.x += dx;
        tu.pos.z += dz;
      }
      // #139: and the crew still WALKING to it. A crew archer is not a turret yet -- `updatePads`
      // gives it an absolute deck position and it walks there under its own pass in `updateArmy`,
      // becoming a turret only on arrival. Nothing moved those, so an archer dispatched before the
      // move and arriving after it was stood up at `y = t.top` over the empty ground the tower used
      // to be on: an archer hanging in the air, which is exactly what was reported and why it was
      // "some of the archers" -- the ones already on the deck came along.
      //
      // Found by `assignTower` rather than by comparing its destination to the old deck. The ticket
      // is right that coordinate-matching is the shared cause of every bug in it.
      for (const u of this.units) {
        if (u.assignTower !== rec.id || !u.assign) continue;
        u.assign = [u.assign[0] + dx, u.assign[1] + dz, u.assign[2]];
      }
      // #139: and its MATS. `pos` is copied into each pad def rather than shared, so these are the
      // only references and one shift is one move. Ghosts go with them: a crew mat previews its
      // archers at `crewSpots`, which reads the deck this just moved.
      for (const d of this.dynamicPads) {
        if (d.tower !== rec.id && d.towerUp !== rec.id) continue;
        d.pos = [d.pos[0] + dx, d.pos[1] + dz];
      }
      for (const pad of this.pads) {
        if (pad.def.tower !== rec.id && pad.def.towerUp !== rec.id) continue;
        pad.mesh.position.x += dx;
        pad.mesh.position.z += dz;
        for (const g of pad.ghosts) { g.position.x += dx; g.position.z += dz; }
      }
    }
    const c = rec.mesh.userData.chimney;
    if (c && this.world.moveSmoker) this.world.moveSmoker(fx + c.x, fz + c.z, to[0] + c.x, to[1] + c.z);
    if (rec.kind === 'house') {
      for (const v of this.villagers) {
        // #139: by the home's id. Matching on the coordinate was safe -- two homes cannot stand on
        // one spot -- but it is the same "found by where it is rather than by what it is" that both
        // halves of this ticket were, and the ticket is right that an id retires all three.
        if (v.homeId !== rec.id) continue;
        v.home.set(to[0], 0, to[1]);
        v.mesh.position.x += dx;
        v.mesh.position.z += dz;
        v.node = null;     // it will pick the nearest seam to where it lives now
      }
    }
  },

  cancelPlacing() {
    if (!this.placing) return;
    // A move that never finished puts the building back. The only way here is a restart, but a
    // building left invisible because a run ended mid-carry is a bug waiting for a save to find it.
    if (this.placing.moving) this.placing.moving.mesh.visible = true;
    this.root.remove(this.placing.mesh);
    // The clone above is ours and nothing else refers to it. The GEOMETRY is not -- an imported
    // building's ghost borrows the loaded model's buffers, the same rule `releaseGhosts` follows --
    // so it is left exactly where it is.
    if (this.placing.mat) this.placing.mat.dispose();
    this.placing = null;
    this.leaveEditMode();
  },

  // #136: the way out, and the only one that existed was the hammer. `cancelPlacing` above is the
  // teardown and was never reachable from outside -- nothing bound it to a key or a button, and
  // `Escape` fell through the chain in main.js to `togglePause`. So a player who tapped move on a
  // tower to see what it did was committed to putting it down somewhere.
  //
  // A move goes back to `from`, which `beginMoving` has recorded since the day it was written and
  // nothing has ever read. It is a legal spot by construction -- the building was standing on it a
  // moment ago -- so this can never refuse.
  //
  // A NEW building has no way back: `completePad` scores it, toasts it, unlocks it and marks it built
  // before `beginPlacing` is ever called, so by the time the ghost is in hand the purchase is spent.
  // There is nothing to cancel, only somewhere to put it -- hence no cross on that path at all,
  // rather than a cross that quietly means something else.
  // Whether there is anything to abort, asked without doing it. main.js needs this to decide whether
  // Escape belongs to the placement or should carry on down the chain to `togglePause` -- swallowing
  // it either way would leave the key dead for the whole of a new building's placement.
  canAbortPlacing() {
    return !!(this.placing && this.placing.moving);
  },

  abortPlacing() {
    const pl = this.placing;
    if (!pl || !pl.moving) return false;
    const rec = pl.moving;
    const from = pl.from;
    this.cancelPlacing();
    this.hud.setPlacing(false);
    this.moveStructure(rec, from);
    this.hud.toast('Left where it was.', 2000, 'Village');
    return true;
  },

  // #137: hold a finger on one of your own buildings and it comes up in your hands. The proximity
  // button stays -- it is how anyone who has already learned it still works, and it is the only route
  // on a keyboard -- but reaching for the thing you want to move is what a player expects to do.
  //
  // A long press is free to take: it is not a tap (input.js needs one under 200ms that did not
  // travel), and a press that has not moved is steering the King nowhere, so nothing is given up.
  longPressAt(clientX, clientY) {
    if (this.placing || this.night || !this.running) return false;
    const rec = this.structureAt(clientX, clientY);
    if (!this.canMove(rec)) return false;
    this.beginMoving(rec);
    return !!this.placing;
  },

  // Is this a spot a building may stand on? Every rule here is one the player can see the reason for
  // once it is refused, which is why the ghost turns red rather than the button just going dead.
  placeOk(kind, x, z) {
    const b = TIERS[this.tier].bounds;
    const [w, d] = CFG.footprint[kind] || [3, 3];
    const half = Math.max(w, d) / 2;
    // inside the grounds, with its whole footprint
    if (x - half < b.x0 || x + half > b.x1 || z - half < b.z0 || z + half > b.z1) return false;
    // not on the mesas
    if (x - half < CFG.cliffs.x && z - half < CFG.cliffs.z) return false;
    // Not in the river, and not straddling a wall. Both are asked by running the real collision and
    // seeing whether it moved the point -- a second copy of either rule is a second copy to get
    // wrong, and these are the rules that already decide where the King himself may stand.
    tmp.set(x, 0, z);
    this.collideRiver(tmp, half);
    if (tmp.x !== x || tmp.z !== z) return false;
    tmp.set(x, 0, z);
    this.collideWalls(tmp, half, false);
    if (tmp.x !== x || tmp.z !== z) return false;
    // clear of anything already standing, its footprint against theirs. The one being MOVED does not
    // count against itself, or it would collide with the ground it is currently standing on and no
    // spot near home would ever be legal (#43).
    const self = this.placing && this.placing.moving;
    for (const st of this.structures) {
      if (st === self) continue;
      const [sw, sd] = CFG.footprint[st.kind] || [3, 3];
      if (Math.abs(st.mesh.position.x - x) < (w + sw) / 2 && Math.abs(st.mesh.position.z - z) < (d + sd) / 2) return false;
    }
    if (this.tradePost) {
      const [sw, sd] = CFG.footprint.bank;
      if (Math.abs(this.tradePost.position.x - x) < (w + sw) / 2 && Math.abs(this.tradePost.position.z - z) < (d + sd) / 2) return false;
    }
    // and clear of the mats, so a building never lands on something the player has to stand on
    for (const pad of this.pads) {
      if (Math.abs(pad.mesh.position.x - x) < (w + CFG.spend.padSize) / 2 && Math.abs(pad.mesh.position.z - z) < (d + CFG.spend.padSize) / 2) return false;
    }
    return true;
  },

  // Called every frame a placement is in progress: the ghost stands where he stands, and turns red
  // where it may not go.
  updatePlacing() {
    const pl = this.placing;
    if (!pl) {
      this.hud.setPlacing(false);   // also the path that clears the button after a restart
      this.movable = this.nearMovable();
      this.hud.setMove(!!this.movable);
      return;
    }
    this.movable = null;
    this.hud.setMove(false);
    // #137: where the finger left it, not where the King is standing.
    pl.mesh.position.set(pl.at.x, 0, pl.at.z);
    const ok = this.placeOk(pl.def.structure, pl.at.x, pl.at.z);
    if (ok !== pl.ok) {
      pl.ok = ok;
      if (pl.mat && pl.mat.color) pl.mat.color.setHex(ok ? 0x6fd36f : 0xe05a46);
    }
    // #136: the cross is only offered on a move, which is the only case with somewhere to go back to.
    this.hud.setPlacing(true, ok, !!pl.moving);
  },

  // The tap that puts it down. Refused on a red ghost, so the only way to finish is a legal spot --
  // and `def.buildAt` is always one of those, so there is no way to be stuck.
  confirmPlacing() {
    const pl = this.placing;
    if (!pl || !pl.ok) return;
    const at = [pl.mesh.position.x, pl.mesh.position.z];
    this.cancelPlacing();
    this.hud.setPlacing(false);
    // #43: remembered, because `rebuildVillage` replays structural pads on a restore and would
    // otherwise put every one of them back on the spot the map suggested.
    this.placedAt[pl.def.id] = at;
    if (pl.moving) this.moveStructure(pl.moving, at);
    else this.buildStructure(pl.def, at);
    this.refreshPads();
    for (const p2 of this.pads) this.drawPad(p2);
  },

  // #231: A TOWER'S MAT GOES SOMEWHERE THE KING CAN STAND, which is not the same as 3.6 to the south.
  //
  // Reported as "after extending the village twice the archers mat is in the water and I cannot
  // reach it", with a photograph of it. Reproduced by standing a tier-2 village up and measuring
  // every tower's mat against the river the game had actually built: `crew-tower-2-se-1` sits at
  // (38, 35.6), which is **0.71 from the river's centreline** against a half-width of 3.6. The mat
  // is under the water. The tower was paid for and its crew could never be hired.
  //
  // `CFG.tower.padOffset` is [0, 3.6] and it was applied to every tower unconditionally. South is
  // the right answer for a tower standing in the middle of the village -- it is the face the camera
  // looks at, which is the whole of #139's reasoning and still true. It is the wrong answer for a
  // tower standing ON a wall, because south of a south-wall tower is OUTSIDE the village, and at the
  // south-east corner of tier 2 outside the village is the river. The same measurement found three
  // more mats out beyond the wall -- `tower-2-sw`, `tower-2-gs`, and `tower-1-se` before the second
  // expansion -- each of them a walk out of the gate and round to man your own tower.
  //
  // So the offset is a PREFERENCE now rather than a rule. South if south works; otherwise step round
  // the tower and take the first direction that does, nearest-to-inward first. Written as a search
  // rather than as a table of which wall each tower is on, because a tower can be DRAGGED (#137) and
  // a map's river moves with the seed (#219) -- a table would be right about today's fifteen towers
  // and silent about the sixteenth.
  //
  // `tier` is the TOWER'S own tier rather than `this.tier`, and the difference is not academic: a
  // restore replays the expansions in order (`rebuildVillage`), so a tier-2 tower is stood up while
  // the game still thinks it is on tier 1 -- and judged against the tier-1 box there is nowhere
  // within reach of a corner tower at (38, 32) that counts as inside, so it fell straight back to
  // the old offset and the mat went back in the river. A tier-2 tower means the tier-2 wall, whether
  // or not the counter has caught up.
  towerMatPos(x, z, tier = this.tier) {
    const R = Math.hypot(CFG.tower.padOffset[0], CFG.tower.padOffset[1]);
    const lvl = Math.max(this.tier, tier || 0);
    // inward is toward the village centre, which is where the player is walking from
    const toMid = Math.atan2(-z, -x);
    const south = Math.atan2(CFG.tower.padOffset[1], CFG.tower.padOffset[0]);
    // south first, then the rest ordered by how close each is to inward. A tower in open ground
    // keeps the mat it has always had; only one with nowhere to put it south of itself moves.
    // `k = 0` is inward EXACTLY, and leaving it out is how this fix failed its first measurement:
    // the fan opened at toMid +/- 30 degrees and never tried toMid itself, which for the south-east
    // corner tower is the one direction of the twelve that works. The sweep said the mat was still
    // in the river while `matStandable` said the spot beside it was fine -- two true readings that
    // only add up to a bug when you check that the search can actually reach the spot.
    const ways = [south];
    for (let k = 0; k < 12; k++) ways.push(toMid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6));
    for (const r of [R, R + 1.6]) {
      for (const a of ways) {
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (this.matStandable(px, pz, lvl)) return [+px.toFixed(2), +pz.toFixed(2)];
      }
    }
    // Nothing clear anywhere round it: keep the old behaviour rather than inventing a spot. A mat
    // in the wrong place is a bad mat; a mat at NaN is a crash.
    return [x + CFG.tower.padOffset[0], z + CFG.tower.padOffset[1]];
  },

  // Can a 3.6 mat sit here with the King able to walk onto it? Three things say no: water, the far
  // side of the outermost wall, and standing on ANY wall -- including an inner one.
  //
  // That last clause is the second thing the sweep caught. Checking only the outermost wall passed
  // `crew-tower-1-nw-1` at (-30, -22.4), which is comfortably inside the tier-2 box and sits exactly
  // on the tier-1 WEST wall, because expanding the village does not pull the old walls down. The
  // tiers are tested from their geometry rather than from `this.walls`, so the answer does not
  // depend on how much of the village happens to be standing when a tower is registered -- during a
  // restore that is "not much".
  matStandable(x, z, tier = this.tier) {
    const HALF = 1.9;
    const lvl = Math.max(0, Math.min(TIERS.length - 1, tier));
    const r = this.world.riverInfo ? this.world.riverInfo(x, z) : null;
    if (r && r.dist < this.world.river.halfWidth + HALF) return false;
    // inside the outermost wall: a mat outside it is a walk out of the gate to man your own tower
    const out = TIERS[lvl];
    if (out.ring) { if (Math.hypot(x - out.ring.x, z - out.ring.z) > out.ring.r - HALF) return false; }
    else if (!(x > out.bounds.x0 + HALF && x < out.bounds.x1 - HALF && z > out.bounds.z0 + HALF && z < out.bounds.z1 - HALF)) return false;
    // and off every wall line the village has, old ones included
    const CLEAR = 2.2;
    for (let i = 0; i <= lvl; i++) {
      const t = TIERS[i];
      if (t.ring) {
        if (Math.abs(Math.hypot(x - t.ring.x, z - t.ring.z) - t.ring.r) < CLEAR) return false;
      } else {
        const b = t.bounds;
        // distance to the rectangle's OUTLINE -- inside it that is the nearest edge, outside it the
        // nearest point of the box
        const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
        const d = inside
          ? Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z)
          : Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
        if (d < CLEAR) return false;
      }
    }
    return true;
  },

  // #43: `at` is where it actually goes, and `def.buildAt` is only the suggestion it defaults to.
  // Every reader below used to go to `def.buildAt` directly -- the mesh, the tower's own x/z, the
  // villager who moves into a house, the chimney's smoke and the Keep's position, six of them -- so
  // the building stood where the map said and nothing else was possible. One parameter is the whole
  // of what makes a building placeable; the placement mode above it is just a way of choosing `at`.
  buildStructure(def, at = def.buildAt) {
    const kind = def.structure;
    const m = this.makeStructureMesh(kind);
    m.position.set(at[0], 0, at[1]);
    this.popIn(m);
    this.root.add(m);
    if (kind !== 'bank') this.structures.push({ kind, id: def.id, mesh: m });
    else {
      m.rotation.y = Math.PI * 0.12;
      this.tradePost = m;
      this.addTradeMat(def);
    }
    if (kind === 'tower') {
      // #139: `pos` is derived from where the tower ACTUALLY went, not read off the config. It used
      // to be `def.pos` -- the pad coordinate -- so a placed tower's mats stayed at the spot the
      // config nominated and the player had to walk back across the village to upgrade it. A fresh
      // array, never the config's own: `def.pos` is shared with `CFG` and mutating it would move the
      // mat for every future run in this session.
      this.towers[def.id] = { id: def.id, x: at[0], z: at[1], top: m.userData.top, level: 1, mesh: m, crew: 0, pos: this.towerMatPos(at[0], at[1], def.tier) };
      this.queueTowerPad(def.id, 'crew');
    }
    // #48: a home is not just a roof. Someone moves in, and they work.
    if (kind === 'house') {
      this.addVillager(at[0], at[1], def.id);
      // #180: and a path runs from the door to the road, so the house stands on the map rather than
      // beside it. Grown for a house that goes up mid-run; already there for one that was.
      if (this.world.addPath) this.world.addPath(at[0], at[1], this.restoring || !this.openingDone);
    }
    // #82: the Stable's yard, in world terms, is what the horses (#117) and their mats read.
    if (kind === 'stable') {
      const S = CFG.stable;
      this.stable = {
        x: at[0], z: at[1], mesh: m,
        yard: { x: at[0], z: at[1] + S.yardAt, w: S.yard[0], d: S.yard[1] },
        gate: { x: at[0] + S.gate[0], z: at[1] + S.yardAt + S.gate[1] },
      };
    }
    if (m.userData.chimney) {
      const c = m.userData.chimney;
      this.world.addSmoker(at[0] + c.x, c.y, at[1] + c.z);
    }
    if (kind === 'keep') {
      this.keep = { isKeep: true, x: at[0], z: at[1], mesh: m, state: 'built', hp: 0, maxHp: 0, radius: CFG.keep.radius, level: this.wallLevel };
      this.keep.maxHp = this.keep.hp = this.keepHp();
      this.keep.bar = makeHealthBar(3.0, false, true);
      this.keep.bar.position.y = KEEP_BAR_Y;
      m.add(this.keep.bar);
      this.queenEnterKeep();
      this.baseLevel = Math.max(1, this.baseLevel);
      this.addFeedPad();
    }
  },

  // The Trade Post's mat. Selling is somewhere you walk to with a full bag, so it needs a mark on the
  // floor like everywhere else you walk to. It stands where the pad that built the Trade Post stood,
  // which is the building's own front door and is already held clear of the roads by the layout.
  //
  // Where you stand to sell used to be a constant in config, which stopped matching the building the
  // first time the building moved -- and nothing showed you the spot, so there was no way to tell.
  // It is read off the mat now, so the two cannot drift apart again.
  addTradeMat(def) {
    if (this.tradeMat) return;
    const { mesh, canvas, tex } = makePad();
    drawPad(canvas, tex, { icon: 'gold', label: 'Sell', paid: 0, shape: PAD_STYLE.trade.shape, rim: PAD_STYLE.trade.rim });
    mesh.position.set(def.pos[0], 0.03, def.pos[1]);
    this.popIn(mesh);
    this.root.add(mesh);
    this.tradeMat = mesh;
    this.tradePos = [def.pos[0], def.pos[1]];
  },

  keepHp() {
    // a flat climb per level, plus a real step each time the walls change material
    const tiers = CFG.base.wallAt.filter((lv) => lv <= this.baseLevel).length - 1;
    return CFG.keep.hp + Math.max(0, this.baseLevel - 1) * CFG.keep.hpPerLevel + Math.max(0, tiers) * CFG.keep.materialBonus;
  },

  // ---------- the Keep as the base: pay coin into it to level up ----------
  //
  // #58: at a fraction of the price on a short run, because a short run has a fraction of the nights
  // to earn it in. This one number is what makes fifteen nights the same arc rather than half of one:
  // the rank gates, the pads' minLevel and the finale's level 13 are all left exactly where they are,
  // so both lengths still reach Warlords and the camp.
  //
  // Whole coin -- the mat reads the figure aloud and there is no such thing as half a coin here.
  // `null` at level 0 and at the cap is load-bearing: three callers use it as "is there a level to
  // buy at all", and `levelCost` is null at 0 and undefined past the end.
  levelReq() {
    const base = CFG.base.levelCost[this.baseLevel];
    return base ? Math.max(1, Math.round(base * this.lengthDef().costScale)) : null;
  },

  // What he is carrying, and how much of it he can carry. Mining fills a pile on the ground; the
  // pile fills this; the trade post empties it into coin.
  loadTotal() {
    return Object.values(this.res).reduce((a, b) => a + b, 0);
  },

  loadCap() {
    // #221: the Bottomless Sack. A big finite number rather than Infinity, because `loadCap` is
    // divided into and printed: the HUD draws `carried / cap` and a bar of `carried / cap`, and
    // Infinity makes that bar NaN wide and the label read "8/Infinity". 9999 is past anything a run
    // can mine and behaves like every other number on the way there.
    if (this.mods.noCap) return 9999;
    return CFG.carry.base + CFG.carry.perUpgrade * (this.mods.carryBonus || 0);
  },

  addFeedPad() {
    // #34: rubble takes no materials. Without this the repair was optional: you could keep levelling
    // a Keep that was not standing, and losing it cost nothing.
    if (!this.keep || this.keep.state !== 'built' || !this.levelReq() || this.feedDef) return;
    // The feed pad sits at the Keep's door, on the corner between two roads: the castle stands at the
    // crossroads, so straight out of any face of it is the middle of a track.
    this.feedDef = { id: 'feed', pos: [this.keep.x + CFG.keep.padOffset[0], this.keep.z + CFG.keep.padOffset[1]], cost: 0, icon: 'keep', label: 'Raise the Keep', repeatable: true, feed: true };
    this.dynamicPads.push(this.feedDef);
    this.refreshPads();
  },

  levelUp() {
    this.baseLevel = Math.min(CFG.base.maxLevel, this.baseLevel + 1);
    const L = this.baseLevel;
    // #154: the Keep level is the story clock, so raising it is what turns a page of Wren's diary.
    // Nothing is unlocked here directly -- `tickDiary` does it on the next quiet frame, because she
    // cannot write while they have hold of her and this can fire while she is being carried north.
    this.diaryDue = Math.max(this.diaryDue || 0, L);
    // walls follow the Keep: wood -> brick -> stone -> iron at the levels in CFG.base.wallAt
    const target = CFG.base.wallAt.filter((lv) => lv <= L).length - 1;
    while (this.wallLevel < target) this.upgradeWalls(false);
    if (this.keep && this.keep.state === 'built') {
      this.keep.maxHp = this.keepHp();
      this.keep.hp = this.keep.maxHp;
      setHealthBar(this.keep.bar, 1);
    }
    this.revealNodes(false);
    // #99: the level's news used to go out as two toasts fired in the same tick as the modal that
    // covers them -- `#toast` is z-index 4 and `.overlay` is 10, so every level announced itself
    // underneath the thing standing on top of it. The summary is on the modal now, built from the same
    // `levelGains` the Keep plaque reads, and there is nothing left for a toast to say.
    this.spawnFx(this.keep.x, this.keep.z, 0xffd23d);
    this.addScore(CFG.score.levelUp * L);
    audio.unlock();
    // #13: every level lets the player keep one of three upgrades. Levels can chain when the King
    // arrives with a big stockpile, so offers queue and are presented one at a time.
    // #99: the level each queued offer belongs to, not just how many are waiting. A King who levels
    // twice at once gets two summaries, and they have to be the two levels he actually passed rather
    // than the one he ended on twice.
    this.offerLevels = this.offerLevels || [];
    this.offerLevels.push(L);
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
      if (this.towerLevel(t).slots + this.mods.towerSlots > t.crew) this.queueTowerPad(id, 'crew');   // #227
    }
  },

  // Keep level needed before a recruit pad can add its units; null if it can recruit now
  // What to go and do about a mat that will not take your coin.
  //
  // #102: it used to open by naming the blocker -- "Keep level 3 is needed", "X is shut until Wren is
  // home" -- and the chip's own face has said exactly that since it grew a lock chip of its own, so
  // standing on a shut mat told you the same thing twice. The chip states the problem (the lock chip,
  // the 4 / 4 archers, "Free Wren first"); this states the answer, which is the one part of it the
  // chip keeps behind a tap, in `tip-note`. That split is what #38 wanted in the first place: the
  // strip on the mat has room for three words and this is where the rest of the sentence goes.
  lockReason(pad, locked) {
    const name = this.padName(pad.def);
    if (locked === 'rescue') {
      return this.queen.taken
        ? `Cut off Wren's escort and bring her home, then ${name} will open.`
        : `Follow the pink arrow and clear Wren's guards, then ${name} will open.`;
    }
    // "Your army is full" stays: the chip puts that as a count, and a count is not the same as being
    // told you have hit the ceiling.
    if (locked === 'noguard') return `There is nobody left to promote. Recruit soldiers first, then some of them can join the Guard.`;
    if (locked === 'nohorse') return `The yard is empty. Buy a horse for it on the mat beside this one, then a swordsman can ride.`;
    if (locked === 'norider') return `There is no swordsman to put on a horse. Recruit some at the Barracks first.`;
    if (pad.def.units) return `Your army is full. Pay coin into the Keep to raise the limit.`;
    return `Pay coin into the Keep to raise it, then ${name} will open.`;
  },

  // #116: how many soldiers could still be promoted to the Guard. Anything in the army that is not
  // already a guard and is not posted to a tower -- a turret is not a man any more (see `assign`).
  guardCandidates() {
    let n = 0;
    for (const u of this.units) if (u !== this.king && u !== this.queen && !u.assign && !u.guard) n++;
    return n;
  },

  // #116: two soldiers leave the grounds and march with the King. Swordsmen first -- a bodyguard is
  // a body between him and a raider, and an archer is worth more on the wall it was standing on.
  // Returns how many it actually promoted, which is never more than there are.
  promoteGuard(n) {
    const pick = this.units.filter((u) => u !== this.king && u !== this.queen && !u.assign && !u.guard)
      .sort((a, b) => (b.melee ? 1 : 0) - (a.melee ? 1 : 0));
    let done = 0;
    for (const u of pick) {
      if (done >= n) break;
      u.guard = true;
      done++;
    }
    return done;
  },

  padLocked(def) {
    // #116: the Guard PROMOTES rather than recruits, so its gate is "is there anybody to promote"
    // rather than a Keep level. A string where every other answer here is a level number or null:
    // the two places that read this -- the "Level N needed" chip and `lockReason` -- both check.
    if (def.effect === 'guard') return this.guardCandidates() > 0 ? null : 'noguard';
    // #117: the same shape twice over -- a horse standing in the yard, and a swordsman to put on it
    if (def.effect === 'mount') return this.yardHorses() === 0 ? 'nohorse' : this.riderCandidates().length ? null : 'norider';
    if (!def.units) return null;
    const wanted = this.unitCount(def.units.type) + def.units.count;
    if (wanted <= this.unitCap(def.units.type)) return null;
    const t = def.units.type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    for (let l = 0; l < t.length; l++) if (t[l] >= wanted) return l;
    return CFG.base.maxLevel;
  },

  updatePads(dt) {
    this.updatePlacing();   // #43: the ghost stands where he stands
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
      if (this.inPrologue()) chips.push({ icon: 'tiara', text: 'Free Wren first', state: 'short' });   // #232
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
        if (typeof locked === 'number') chips.push({ icon: 'keep', text: `Level ${locked} needed`, state: 'short' });
        // #116: the Guard says how big it already is, the way a recruit mat says how full the army is.
        if (def.effect === 'guard') chips.push({ icon: 'shield', text: `${this.units.filter((u) => u.guard).length} in the Guard`, state: locked ? 'short' : 'ok' });
        // #117: and the yard's mats say what is standing in it
        if (def.effect === 'stableHorse') chips.push({ icon: 'horse', text: `${this.buyCount[def.id] || 0} / ${CFG.horse.yard} horses`, state: 'ok' });
        if (def.effect === 'mount') chips.push({ icon: 'horse', text: `${this.yardHorses()} in the yard, ${this.riderCandidates().length} to ride`, state: locked ? 'short' : 'ok' });
        if (def.units) chips.push({ icon: def.units.type, text: `${this.unitCount(def.units.type)} / ${this.unitCap(def.units.type)} ${def.units.type}s`, state: locked ? 'short' : 'ok' });
      }
      // #122: the cooldown says so. A mat that quietly ignores payment for a second reads as the game
      // being laggy, and the note is where the mat already explains itself -- it is what says "stop
      // moving to pay". It goes above the blockers because it is the newest thing to have happened.
      const note = nearest.boughtT > 0 ? 'Bought — step off, or wait to buy another'
        : this.keep && this.keep.state !== 'built' && def.repairKeep ? 'It has to stand again before it can be raised'
        : this.inPrologue() ? (this.queen.taken ? 'Cut off the escort and bring her back' : 'Rescue Wren first') : locked === 'noguard' ? 'Recruit soldiers before promoting any' : locked === 'nohorse' ? 'Buy a horse for the yard first' : locked === 'norider' ? 'Recruit swordsmen first' : locked ? 'Feed the Keep to raise the limit' : this.king.moving && (nearest.holdT || 0) < CFG.spend.walkHold ? 'Stop moving to pay' : def.feed ? `Pouring in coin…` : def.crew ? 'Sending archers…' : 'Paying…';
      const total = nearest.cost + nearest.res.reduce((a, r) => a + r.need, 0);
      const paidAll = nearest.paid + nearest.res.reduce((a, r) => a + r.paid, 0);
      this.hud.showPadTip({
        icon: def.icon,
        // #125: the chip called it "Feed the Keep" while the mat under the King had "Raise the Keep"
        // painted on it -- two names for one thing, and the wrong one on the surface with room to be
        // read. `feedDef` has carried the right label all along, so the special case just goes.
        name: def.label,
        sub: this.padSub(def),
        desc: this.padDesc(def),
        chips,
        note,
        progress: total ? paidAll / total : 0,
      });
    } else if (!this.tradeTip()) this.hud.hidePadTip();   // #236
    for (const pad of this.pads) {
      // pop-in / settle animation
      const s = pad.mesh.scale.x;
      if (s < 1) pad.mesh.scale.setScalar(Math.min(1, s + dt * 4));
      else if (s > 1) pad.mesh.scale.setScalar(Math.max(1, s - dt * 0.8));
      const dist = kp.distanceTo(pad.mesh.position);
      // Mats fade up as you come near and sink back into the grass behind you: eleven of them
      // standing on the field at once is what made the village look like a car park. A pad you are
      // paying into stays up however far you drift, and a brand new one shows itself for a few
      // seconds wherever you are, because otherwise the only clue it exists is a toast.
      // #144: and again for a few seconds when it first becomes payable. See CFG.spend.showAfford --
      // the radius used to BE the discovery, and nothing else points at a build mat.
      const canPay = this.padAffordable(pad);
      if (canPay && !pad.couldPay) pad.affordT = CFG.spend.showAfford;
      pad.couldPay = canPay;
      if (pad.affordT > 0) pad.affordT -= dt;
      const show = dist < CFG.spend.showRadius || pad.active
        || this.time - pad.bornAt < CFG.spend.showNew || pad.affordT > 0;
      pad.fade += ((show ? 1 : 0) - pad.fade) * Math.min(1, dt * 7);
      pad.mesh.visible = pad.fade > 0.02;
      pad.mesh.material.opacity = pad.fade;
      // #111: FADED with the mat, not snapped on at a threshold. This used to be
      // `g.visible = pad.fade > 0.4`, so a preview appeared and vanished outright as the King walked
      // towards and away from a mat -- reported as a building "flickering to a different version",
      // and the trigger in the report was exactly that walk. The mat itself has always faded; the
      // preview standing on it was the one thing that did not.
      const gv = pad.fade * 0.4;   // 0.4 is GHOST_MAT's own opacity: full fade reaches what it always was
      if (pad.ghostMat) {
        pad.ghostMat.opacity = gv;
        for (const g of pad.ghosts) g.visible = gv > 0.02;
      }
      const inside = dist < CFG.spend.padRadius;
      // #9: no pad can be paid until the Queen is free. They stay visible so the player can see what
      // the village will offer, but they are plainly shut.
      const locked = this.inPrologue() ? 'rescue' : this.padLocked(pad.def);   // #232
      // #122: the hold is a third thing the mat's face depends on, and it is edge-triggered like the
      // other two. `drawPad` repaints a canvas texture, so it runs when something CHANGES and never
      // per frame; a fresh mat arrives with `held` undefined against a true hold, so the first frame
      // paints the pill and the frame the hold expires paints it out. Two repaints a purchase.
      const held = pad.boughtT > 0;
      if (inside !== !!pad.active || locked !== (pad.locked || null) || held !== !!pad.held) {
        pad.active = inside;
        pad.locked = locked;
        pad.held = held;
        this.drawPad(pad);
      }
      // #38: a shut mat says what it wants if you stand on it. The strip on the mat has room for
      // three words; this is where the rest of the sentence goes, and only for someone who waited
      // long enough to be actually asking.
      if (inside && locked) {
        pad.lockT = (pad.lockT || 0) + dt;
        if (pad.lockT > 1.1 && !pad.lockSaid) {
          pad.lockSaid = true;
          this.hud.toast(this.lockReason(pad, locked), 4200, 'Village');
        }
      } else {
        pad.lockT = 0;
        pad.lockSaid = false;
      }
      // coins pour faster the longer the King stands on the pad, so big purchases don't drag
      pad.holdT = inside ? (pad.holdT || 0) + dt : 0;
      // #122: and a mat that has just paid out holds its hand for a beat first. It runs down whether
      // or not the King is standing there, so buying three batches in a row is still one stand rather
      // than a walk away and back -- which is a real and reasonable thing to do, and a
      // must-step-off rule would have broken it.
      if (pad.boughtT > 0) pad.boughtT = Math.max(0, pad.boughtT - dt);
      // ...but only once he has actually stopped on it (or held for a moment): walking across is free
      const paying = inside && !pad.boughtT && pad.holdT > CFG.spend.arm && (!this.king.moving || pad.holdT > CFG.spend.walkHold);
      if (pad.def.crew) {
        // crew pads take archers from the army instead of coins
        if (paying && !locked && pad.paid < pad.cost && this.spendTimer <= 0) {
          const free = this.units.filter((u) => u.type === 'archer' && !u.assign);
          const spots = this.crewSpots(pad.def);
          // #203: a TOWER hands back the places that are free, so the next archer takes the first of
          // them and the list shrinks behind him. The GATE POSTS hand back all of theirs in a fixed
          // order and the next archer takes the next along -- that list must not shrink as archers
          // are dispatched, because `completePad` stands the posts themselves at exactly these
          // coordinates once the last archer is on his way, and a list emptied by the walk would
          // leave a gate with guards and no posts to guard from.
          const spot = pad.def.tower ? spots[0] : spots[pad.paid];
          if (free.length && spot) {
            this.spendTimer = CFG.spend.crewTick;
            free.sort((a, b) => a.mesh.position.distanceToSquared(kp) - b.mesh.position.distanceToSquared(kp));
            free[0].assign = spot;
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

  // #144: could the player pay the REST of this mat right now? What that means depends on what the
  // mat takes -- coin, materials, or archers out of the army -- and all three have to answer, because
  // a mat that only ever pulsed for coin would leave the wall and crew mats with no discovery at all
  // now the radius is 4. `locked` is deliberately not consulted: a mat you cannot buy yet because the
  // Keep is too low is not news, and it would pulse the moment the money arrived regardless.
  padAffordable(pad) {
    const def = pad.def;
    if (def.crew) return this.units.some((u) => u.type === 'archer' && !u.assign);
    for (const r of pad.res) if ((this.res[r.type] || 0) < r.need - r.paid) return false;
    return this.coinsCarried >= pad.cost - pad.paid;
  },

  // #126: the one place that knows where she stands when she is home. Three callers had their own
  // copy of it -- entering, the material rebuild, and now the drift guard -- and a copy is how they
  // came to disagree about what happens to her when the Keep's mesh is replaced underneath her.
  // Returns whether it could: a Keep mesh with no `balcony` in its userData is a mesh she cannot
  // stand on, and the honest answer is no rather than a throw.
  queenToBalcony() {
    const b = this.keep && this.keep.mesh && this.keep.mesh.userData.balcony;
    if (!b) return false;
    this.queen.mesh.position.set(this.keep.x + b.x, b.y, this.keep.z + b.z);
    return true;
  },

  queenEnterKeep() {
    const q = this.queen;
    if (!this.keep || this.keep.state !== 'built' || q.inKeep || q.captive) return;
    // #126: the balcony FIRST, and the flag only if she got there. It used to set `inKeep` and then
    // read `userData.balcony`, so any Keep mesh without one would leave the flag true with her never
    // moved -- and `updateQueen` returns immediately on `inKeep`, so she would be drawn outside while
    // the game believed she was home and no amount of walking the King to the door could fix it.
    // That is the exact shape of the report this came from, and it is now unreachable: the flag
    // cannot be set unless she is standing on the thing it claims she is standing on.
    if (!this.queenToBalcony()) return;
    q.inKeep = true;
    // #83: a door closed between her and them is the whole of the answer. Getting her to the Keep
    // with raiders already on her is the best save in the game, so it has to be a clean one.
    q.seize = 0;
    q.held = false;
    setHealthBar(q.bar, 1);
    q.mesh.rotation.y = 0;
    q.moving = false;
    this.hud.toast('Wren is inside the Keep.', 1500, 'Wren');
  },

  queenLeaveKeep() {
    const q = this.queen;
    if (!q.inKeep) return;
    q.inKeep = false;
    q.mesh.position.set(this.keep.x + 2.6, 0, this.keep.z + 2.6);
  },

  breakKeep() {
    const sheltering = this.queen.inKeep && !this.queen.captive;
    this.queenLeaveKeep();
    audio.wave(true);
    // #33: the walls coming down around her is how she is taken. Standing her outside the rubble as
    // an ordinary unit made the worst moment in the game a non-event; the raiders carry her off
    // instead, and the chase that already existed starts from here.
    if (sheltering) {
      this.hud.toast('The Keep is down and Wren with it. *Cut the escort off!*', 3600, 'Wren');
      this.captureQueen();
    } else {
      this.hud.toast('The Keep has fallen! *Get Wren behind something.*', 2600, 'Keep');
    }
    this.showKeepBroken();
  },

  // #127: everything a fallen Keep LOOKS like, with none of the things that only happen at the moment
  // it falls -- no horn, no notice, nothing done to Wren. Pulled out of `breakKeep` because the save
  // needs the same picture without the event: a run restored with `keep.state: 'broken'` was rebuilt
  // by `rebuildVillage` as a standing Keep and then had its state set to broken underneath, so the
  // player came back to a Keep that looked whole, could not be repaired, and had the RAISE mat
  // standing on it taking coin for levels. Measured before and after the fix, and on the code before
  // #125 as well, so it is not something that change introduced.
  //
  // #78: one Keep mat, in one place, all game. This used to drop the feed mat and raise a repair
  // mat at a different offset with a different icon, so the Keep had two markers doing two halves
  // of one job and the player had to notice the second one had moved. It stands where the feed mat
  // stood and wears the Keep's own icon; what changes with the Keep's state is the job it offers
  // and the colour that says so -- `build` while it is rubble, `feed` once it can be raised again.
  showKeepBroken() {
    const k = this.keep;
    if (!k) return;
    k.state = 'broken';
    // The mesh is swapped here rather than in `breakKeep`, so a restore gets the rubble too. Without
    // it the restored Keep was a whole castle with `state: 'broken'` behind it, which is the worst
    // of the two halves of that bug: nothing on screen disagreed with itself, so nothing said why
    // the mat underneath had changed its job.
    if (!k.rubble) {
      this.root.remove(k.mesh);
      k.mesh = makeRubble(3.4, 2);
      k.mesh.position.set(k.x, 0, k.z);
      this.root.add(k.mesh);
      k.rubble = true;
    }
    this.dropFeedPad();
    // #127: a counter, not `time.toFixed(0)`. The id is what `refreshPads` checks against `built` to
    // decide whether a def has already been used, and two breaks landing in the same game SECOND
    // produced the same id -- so the second one raised no mat at all. Minutes apart in real play;
    // it still cost a wrong reading while measuring this.
    this.keepRepairs = (this.keepRepairs || 0) + 1;
    this.dynamicPads.push({ id: `repair-keep-${this.keepRepairs}`, pos: [k.x + CFG.keep.padOffset[0], k.z + CFG.keep.padOffset[1]], cost: this.repairCost(), icon: 'keep', label: 'Repair the Keep', repairKeep: true });
    this.refreshPads();
  },

  // #125: what putting the Keep back up costs, in coin. Two figures because it always had two -- see
  // `CFG.keep.repair`, where they are the old material bills priced at `CFG.materials` rates.
  //
  // #108 is worth keeping in view, because this is the shape of the bug it fixed and the reason it
  // can no longer happen. The repair was a flat `{ stone: 10 }`, and stone does not exist in the
  // world below Keep level 4 -- `CFG.base.materialAt` gates the nodes and `updateMining` skips one
  // that is not open. So a Keep destroyed at level 1, 2 or 3 could never be repaired, and `breakKeep`
  // drops the feed mat in the same breath (#78), so there was no route to level 4 either: the
  // requirement and the only means of meeting it were removed by the same event. The run stayed
  // playable for several more minutes, was already lost, and never said so.
  //
  // The invariant it left behind -- never ask for a material the current Keep level cannot open --
  // is now structurally impossible to break rather than a rule somebody has to remember. Coin is
  // never gated, never runs out of the world, and a raider drops some every few seconds.
  repairCost() {
    return this.baseLevel >= CFG.base.materialAt.stone ? CFG.keep.repairLate : CFG.keep.repair;
  },

  // #34: the feed pad goes with the Keep and comes back with it
  dropFeedPad() {
    if (!this.feedDef) return;
    // #78: taking the def out of `dynamicPads` is not taking the mat off the field. refreshPads only
    // ever ADDS -- nothing walks `pads` looking for one whose def has gone -- so the feed mat stayed
    // where it was after the Keep fell: still payable, still levelling a Keep that was a heap of
    // rubble. That is the "I can still upgrade while the Queen is out of the castle" report, and the
    // guard in addFeedPad was never the problem: the mat it refuses to build was already standing.
    // It also meant repairing left TWO feed mats, because restoreKeep added one next to the orphan.
    this.removePadDef(this.feedDef);
    this.feedDef = null;
    this.refreshPads();
  },

  restoreKeep() {
    const k = this.keep;
    this.root.remove(k.mesh);
    // #126: the same builder every other path uses, which prefers the imported castle and falls back
    // to the built one. This said `makeKeep(this.materialName())` outright, so repairing the Keep
    // silently swapped the imported castle for the procedural one and it stayed swapped until the
    // next material boundary rebuilt it -- the same class as #111. It also put the collision box out
    // of step with what was drawn: `CFG.keep.half` is 2.9, sized for the import's 6.03 x 5.38, while
    // the built Keep is 3.44 square, so the King was held a metre clear of a wall that was not there.
    k.mesh = this.makeStructureMesh('keep');
    { const rec = this.structures.find((x) => x.kind === 'keep'); if (rec) rec.mesh = k.mesh; }
    k.mesh.position.set(k.x, 0, k.z);
    k.state = 'built';
    k.rubble = false;        // #127: standing again, so the next fall swaps the mesh again
    k.level = this.wallLevel;
    k.maxHp = k.hp = this.keepHp();
    k.bar = makeHealthBar(3.0, false, true);
    k.bar.position.y = 4.4;
    k.mesh.add(k.bar);
    this.popIn(k.mesh);
    this.root.add(k.mesh);
    this.queenEnterKeep();
    this.addFeedPad();          // #34: standing again, so it can be fed again
    this.hud.toast('The Keep stands again. *You can raise its level once more.*', 3200, 'Keep');
  },

  // #106: how far a point is from the Keep's WALL rather than from its centre -- 0 anywhere inside the
  // footprint. The same box collideKeep pushes out of, read instead of written.
  keepWallGap(p) {
    const k = this.keep;
    if (!k) return Infinity;
    const dx = Math.max(0, Math.abs(p.x - k.x) - CFG.keep.half);
    const dz = Math.max(0, Math.abs(p.z - k.z) - CFG.keep.half);
    return Math.hypot(dx, dz);
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

  // #213: THE ONE PLACE THAT KNOWS HOW BIG A MAN ON A DECK IS.
  //
  // It was two. `addTurret` worked it out, and the board's tower sheet carried a hardcoded `1.05`
  // with a comment saying it was "the scale `addTurret` pops a crew archer in at" -- true when it
  // was written and false the moment #204 changed the number. The board went on drawing the old
  // one, so the sheet whose whole job is to show what a building looks like was showing a crew a
  // quarter too big, with its heads through the roof, while the game underneath it was correct.
  //
  // That is the board's own rule broken from the inside: nothing on it is a copy of something else.
  // A comment asserting two numbers are equal is not a mechanism for keeping them equal.
  //
  // `natural` comes back too because the health bar needs the size he WOULD have been to sit on his
  // head rather than where the boards are.
  crewArcherScale(rig = true) {
    const natural = rig ? 1.05 : 1.2;
    return { natural, scale: natural * CFG.tower.deck.crewScale };
  },

  addTurret(x, z, y, towerId = null) {
    const rig = makeRigged('archer', [['hair', HAIR[Math.floor(Math.random() * HAIR.length)]]]);
    const mesh = rig ? rig.mesh : makeArcher();
    mesh.position.set(x, y, z);
    // #204: a man on a deck is smaller than the same man on the ground, because the roof over him is
    // 1.12 above the planking at the tightest of the nine places and he is 1.35 tall. See
    // `CFG.tower.deck.crewScale` for the measurements -- the number is there and not here because it
    // is a fact about the deck.
    const { natural, scale: base } = this.crewArcherScale(!!rig);
    this.popIn(mesh, 0, base);
    this.root.add(mesh);
    this.spawnFx(x, z, 0xff9a2e, y);
    const bar = makeHealthBar(1.0);
    // The bar follows his head rather than staying at a fixed height above the boards. Dividing by
    // `base` would pin it at 1.8 world units, which was a hand's breadth over a full-size archer and
    // is most of a body over this one -- a bar floating unattached to anybody. Dividing by `natural`
    // keeps it where it has always been ON HIM, and it is only ever visible when he is hurt (#44).
    // Its own size still divides by `base`, so a smaller man does not get a smaller bar to read.
    bar.position.y = 1.8 / natural;
    bar.scale.multiplyScalar(1 / base);
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
  // Which quarter of the ring an angle falls in. +z is south in this world, so the compass runs
  // east / south / west / north as the angle sweeps from 0.
  wallSideOf(ang) {
    const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < Math.PI / 4 || a >= Math.PI * 1.75) return 'east';
    if (a < Math.PI * 0.75) return 'south';
    if (a < Math.PI * 1.25) return 'west';
    return 'north';
  },

  // A section is a pair of endpoints, whatever shape the wall is, so everything downstream -- the
  // mesh, the collision, the rubble, the repair mat -- works the same for a ring and a rectangle.
  section(tier, id, wall, x0, z0, x1, z1, gate) {
    return {
      id: `${tier}-${id}`, tier, wall, gate,
      x0, z0, x1, z1, mx: (x0 + x1) / 2, mz: (z0 + z1) / 2,
      len: Math.hypot(x1 - x0, z1 - z0), ang: Math.atan2(z1 - z0, x1 - x0),
    };
  },

  wallSections(tier, side) {
    return TIERS[tier].ring ? this.ringSections(tier, side) : this.boxSections(tier, side);
  },

  // The outer walls: four straight sides with a gateway in the middle of each, which is what the
  // roads run through. This is the shape the village had before the citadel ring was added, rebuilt
  // to hand back the same endpoint-pair sections the ring does.
  boxSections(tier, side) {
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
        const p0 = alongX ? [a0, fixed] : [fixed, a0];
        const p1 = alongX ? [a1, fixed] : [fixed, a1];
        out.push(this.section(tier, `${name}-${idx++}`, name, p0[0], p0[1], p1[0], p1[1], isGate));
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

  // The citadel ring: four gateways laid down first, each one centred exactly on a compass point so
  // it lines up with the road that runs through it, then the arc between each pair filled with
  // whole segments. Picking the segment nearest a compass point instead -- which is what this did --
  // leaves the gate up to half a segment off the axis, and the road went through the wall beside it.
  ringSections(tier, side) {
    const t = TIERS[tier];
    const { x: cx, z: cz, r } = t.ring;
    const gw = t.gateWidth || 5;
    const half = Math.asin(Math.min(0.6, gw / (2 * r)));   // half-angle a gateway of that width spans
    const at = (a) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    const out = [];
    let idx = 0;
    const push = (a0, a1, gate) => {
      const [x0, z0] = at(a0);
      const [x1, z1] = at(a1);
      const wall = this.wallSideOf((a0 + a1) / 2);
      if (side !== 'all' && wall !== side) return;
      out.push(this.section(tier, idx, wall, x0, z0, x1, z1, gate));
    };
    for (let q = 0; q < 4; q++) {
      const axis = (q * Math.PI) / 2;                       // east, south, west, north
      push(axis - half, axis + half, true);
      idx++;
      const from = axis + half;
      const to = axis + Math.PI / 2 - half;
      const n = Math.max(1, Math.round((r * (to - from)) / t.sectionLen));
      for (let i = 0; i < n; i++) {
        push(from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n, false);
        idx++;
      }
    }
    return out;
  },

  makeWallMesh(sec, level = this.wallLevel) {
    const m = sec.gate ? makeGate(level, sec.len) : makeWallSegment(sec.len, level);   // #201: a gate fills its section, like every other piece
    m.position.set(sec.mx, 0, sec.mz);
    // the pieces are modelled along +X; rotating by -ang about Y aims them down the segment
    m.rotation.y = -sec.ang;
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
    w.bar = makeHealthBar(2.2, false, true);
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
    // Roads grow out of the gates as the walls go up. #180 moved this here from `completePad`, so
    // it happens however the wall was stood: bought, replayed from a save, or raised for the
    // opening. Before, a restored run came back with its walls and none of its roads, and the
    // opening village -- the kingdom the player is shown for a minute -- had no roads at all. A
    // village that was already there gets them at once rather than growing.
    const instant = this.restoring || !this.openingDone;
    if (tier === 0) {
      this.world.revealRoad('south', instant);
      this.world.revealRoad('east', instant);
    }
    if (side === 'west') this.world.revealRoad('west', instant);
    if (side === 'north') this.world.revealRoad('north', instant);
    // Once a full outer wall stands, the one it replaced comes down for materials -- but the citadel
    // is not one of those. It is the ring around the castle and it is meant to stand inside every
    // wall that goes up after it, which is a second line to fight on rather than a leftover.
    const sides = ['south', 'east', 'north', 'west'];
    const complete = sides.every((s) => this.walls.some((w) => w.tier === tier && w.wall === s));
    const spent = (w) => w.tier < tier && !TIERS[w.tier].ring;
    if (complete && this.walls.some(spent)) {
      for (const w of this.walls.filter(spent)) this.root.remove(w.mesh);
      this.walls = this.walls.filter((w) => !spent(w));
      for (const def of [...this.dynamicPads]) if (def.repair && spent(def.repair)) this.removePadDef(def);
      this.hud.toast('The old outer wall is torn down for materials.', 1600, 'Village');
    }
  },

  // Hands back what a pad owns on the GPU. makePad() builds a fresh 256x256 CanvasTexture, a plane
  // and a material for every pad, and a run creates far more pads than the board ever holds at once:
  // every repeatable buy replaces its own pad, every wall that falls raises a repair mat and drops it
  // again when it is paid. Removing the mesh from the scene graph does not free any of that -- three
  // .js only releases a texture when it is told to -- so without this a long run quietly hands the
  // driver tens of megabytes it can never reuse, and a phone answers that by taking the context away.
  //
  // The three things makePad() itself made, and the ghosts whose geometry was made for them.
  //
  // #62: every ghost shares GHOST_MAT, so no ghost material is ever freed here. Geometry is split:
  // addPad tagged each ghost with whether it built the buffers or borrowed them from a loaded rig or
  // prop, because a wall ghost is fresh per pad and leaks, while a unit ghost's belongs to every
  // character on the field. That flag is set where the builder was called; nothing here tries to
  // work it out, which is how you blank every character at once.
  disposePad(pad) {
    if (!pad || pad.disposed) return;
    pad.disposed = true;
    this.releaseGhosts(pad);
    pad.tex.dispose();
    pad.mesh.geometry.dispose();
    pad.mesh.material.dispose();
  },

  // Ghosts leave the field before the pad does: completePad drops them the moment it is paid, and
  // the pad itself lives another eighty lines. So this is where they are let go rather than in
  // disposePad -- both paths come through here, the array can still be emptied straight afterwards
  // the way it always was, and a second call finds nothing to do.
  releaseGhosts(pad) {
    for (const g of pad.ghosts) {
      this.root.remove(g);
      if (!g.userData.ownGeometry) continue;      // borrowed from a rig or a prop; not ours to free
      g.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      for (const geo of g.userData.droppedGeometry || []) geo.dispose();
    }
    pad.ghosts = [];
    // #111: the clone is this pad's and nothing else refers to it. Never `GHOST_MAT` itself.
    if (pad.ghostMat) {
      pad.ghostMat.dispose();
      pad.ghostMat = null;
    }
  },

  removePadDef(def) {
    const pad = this.pads.find((p) => p.def === def);
    if (pad) {
      this.root.remove(pad.mesh);
      this.disposePad(pad);
      this.pads.splice(this.pads.indexOf(pad), 1);
    }
    const di = this.dynamicPads.indexOf(def);
    if (di >= 0) this.dynamicPads.splice(di, 1);
  },

  // `announce` is off during a level-up: the modal that opens in the same tick already carries the
  // line, and a toast fired under it is drawn four z-index layers down (#99).
  upgradeWalls(announce = true) {
    this.wallLevel = Math.min(CFG.wallLevels.length - 1, this.wallLevel + 1);
    for (const def of [...this.dynamicPads]) if (def.repair) this.removePadDef(def);
    this.walls.forEach((w, i) => this.rebuildWall(w, this.wallLevel, i * 0.035));
    this.rebuildStructures(announce);
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
      // nearest point on the segment, then push straight out from it. A ring's sections sit at every
      // angle, so this replaces the axis-aligned test the rectangle used.
      const dx = w.x1 - w.x0;
      const dz = w.z1 - w.z0;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - w.x0) * dx + (p.z - w.z0) * dz) / L2));
      const qx = w.x0 + dx * t;
      const qz = w.z0 + dz * t;
      let ox = p.x - qx;
      let oz = p.z - qz;
      const d = Math.hypot(ox, oz);
      if (d >= thick) continue;
      if (d < 1e-4) {                       // dead on the line: push along its normal
        ox = -dz; oz = dx;
        const n = Math.hypot(ox, oz) || 1;
        ox /= n; oz /= n;
      } else { ox /= d; oz /= d; }
      p.x = qx + ox * thick;
      p.z = qz + oz * thick;
      hit = w;
    }
    return hit;
  },

  // #208: the way through a wall, for somebody walking to a fixed point on the other side of one.
  //
  // The twin of `bridgeWaypoint` below and for the same reason: a straight line at a destination is
  // right until a solid thing is across it, and then it is a man held against stone for ever. A gate
  // is what a wall has instead of a way round, and `collideWalls` already lets anyone friendly
  // through one -- so the whole of the detour is "head for the gateway first".
  //
  // The NEAREST built gate, which is not always the one that opens onto his post: a ring can have
  // four, and picking by distance is what somebody standing outside a wall would do. Getting that
  // wrong costs a longer walk and nothing else, because arrival is still judged on the post itself.
  gateWaypoint(p) {
    let best = null;
    let bestD = Infinity;
    for (const w of this.walls) {
      if (w.state !== 'built' || !w.gate) continue;
      const mx = (w.x0 + w.x1) / 2;
      const mz = (w.z0 + w.z1) / 2;
      const d = (p.x - mx) * (p.x - mx) + (p.z - mz) * (p.z - mz);
      if (d < bestD) { bestD = d; best = [mx, mz]; }
    }
    return best;
  },

  // Keep a position out of the river unless it is on a bridge. Returns true when it was pushed.
  // #215: THE NEAREST SOLID THING THAT IS IN THE WAY, or null.
  //
  // Trees, rocks and barricades, recorded by the scatter in `world.js` because `mergeGroup` merges
  // the objects themselves out of existence before the game ever runs. Bucketed at 6 units, so this
  // reads a 3x3 block of cells rather than all 415 of them -- the same trick `updateEnemies` uses.
  solidNear(x, z, r) {
    const W = this.world;
    if (!W.solidGrid) return null;
    const c = W.solidCell;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    let best = null;
    let bestPen = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const a = W.solidGrid.get(`${cx + i},${cz + j}`);
        if (!a) continue;
        for (const o of a) {
          const dx = x - o.x;
          const dz = z - o.z;
          const reach = o.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= reach * reach) continue;
          // the deepest overlap wins, not the nearest centre: two trunks touching a shoulder want
          // the one actually pushing hardest
          const pen = reach - Math.sqrt(d2);
          if (pen > bestPen) { bestPen = pen; best = o; }
        }
      }
    }
    return best;
  },

  // #215: the backstop, and ONLY the backstop. Push a mover out of a trunk it is already inside.
  //
  // #181 is the reason this is not the whole answer. "A separation pass was the obvious fix and is
  // the wrong one" -- correcting after the fact means what you see is a character sliding out of
  // something it was never meant to be in, and a unit walking dead-on at a trunk with only this to
  // stop it grinds against the bark for ever, which is worse than walking through. `steerRoundSolid`
  // below is what actually keeps them out; this catches what that cannot: a unit spawned in a wood,
  // one shoved into a trunk by `collideWalls`, the King held against one by a player's own thumb.
  collideScenery(p, r) {
    let pushed = false;
    // Up to three passes, because being pushed out of one trunk can put a shoulder inside the next.
    // `solidNear` answers with the DEEPEST overlap, so each pass takes the worst one and the next
    // pass sees what is left; measured over 30 dead-on approaches at the map's biggest solids, one
    // pass left 2 of them still touching something and three leaves none. It almost always exits on
    // the first pass -- scenery is scattered with a clearance margin, so genuine double contact is
    // rare and the loop is paid for only where it is needed.
    for (let i = 0; i < 3; i++) {
      const o = this.solidNear(p.x, p.z, r);
      if (!o) break;
      let dx = p.x - o.x;
      let dz = p.z - o.z;
      let d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        // dead centre has no direction to leave by, and a coin flip here would chatter on a frame
        // boundary. The +x edge, every time: arbitrary, but the same arbitrary answer each frame.
        dx = 1; dz = 0; d = 1;
      }
      const reach = o.r + r;
      p.x = o.x + (dx / d) * reach;
      p.z = o.z + (dz / d) * reach;
      pushed = true;
    }
    return pushed;
  },

  // #215: WALK ROUND IT, rather than into it and then out of it.
  //
  // The same shape as `steerRoundKing` (#181) and for the same reason it was written: fixing the
  // DIRECTION means there is nothing to correct afterwards. The obstacle is seen as a cone of some
  // angular half-width; if where the mover wants to go lies inside that cone, the direction is bent
  // to the edge of it, so it grazes past rather than aiming at the middle. Outside the cone the path
  // is already clear and nothing happens at all.
  //
  // `dir` is mutated in place and keeps its length, so the caller's speed is untouched -- this
  // changes where a unit is going, never how fast.
  steerRoundSolid(p, dir, d, r) {
    if (d < 1e-3) return false;
    const look = Math.min(d, CFG.scenery.look);
    // Look a little way down the intended path rather than at the feet: a trunk that is beside the
    // mover is not in its way, and steering round one it has already passed is how a unit ends up
    // orbiting a tree instead of leaving it behind.
    const ax = p.x + (dir.x / d) * look * 0.5;
    const az = p.z + (dir.z / d) * look * 0.5;
    const o = this.solidNear(ax, az, r + CFG.scenery.clear);
    if (!o) return false;
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const dk = Math.hypot(ox, oz);
    const gap = o.r + r + CFG.scenery.clear;
    if (dk < 1e-3 || dk - o.r >= d || dk <= gap * 0.35) return false;   // behind it, past it, or on top of it
    const halfWidth = Math.asin(Math.min(1, gap / dk));
    const ang = Math.atan2(dir.x, dir.z);
    const oang = Math.atan2(ox, oz);
    let rel = ((oang - ang + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) >= halfWidth) return false;                      // the corridor is clear
    // Dead ahead has no side and `%` would pick one on a coin flip, which chatters on a frame
    // boundary. Take the side the mover is already off-centre on -- the same tie-break, and the
    // same reason, as #181's.
    const side = rel > 0 ? -1 : 1;
    const a = oang + side * halfWidth;
    dir.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    return true;
  },

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

  // #223: the twin of `bridgeWaypoint`, for the other thing in this world that has exactly one way
  // through it. A river is crossed at a bridge; a plateau is climbed at its ramp.
  //
  // IT IS NOT OPTIONAL AND THAT IS THE MEASUREMENT. Eight raiders were sent at a King standing on a
  // plateau and given ninety seconds of game time: none reached the top, two ground against the rim
  // and the rest wandered off. `steerRoundSolid` bends round ONE solid at a time, and the rim is a
  // fence of forty of them -- it grazes along the rock for ever and never finds the gap. A plateau
  // without this is not scenery, it is a square the player cannot be touched on.
  //
  // Same contract as the bridge: `{x, z}` or null, recomputed five times a second by the caller. The
  // bridge goes first when both apply, because a ramp on the far bank is no use until you are across.
  rampWaypoint(e, targetPos) {
    const w = this.world;
    if (!w.plateaus || !w.plateaus.length) return null;
    const p = e.mesh.position;
    const mine = w.plateauAt(p.x, p.z);
    const theirs = w.plateauAt(targetPos.x, targetPos.z);
    if (mine === theirs) return null;                    // same floor, and usually both the valley
    const use = theirs || mine;                          // the one being climbed, or the one being left
    const r = w.rampAt(use, p.x, p.z);
    // Already on the slope: aim at the middle of the top going up, or at open ground going down, so
    // the last step off the ramp is not back into the rock.
    if (r.on && r.t > use.top - 1) return theirs ? { x: use.x, z: use.z } : null;
    // WALK ROUND THE DRUM, and this is the half I first left out. Aiming straight at the foot from
    // the far side walks into the rock: `steerRoundSolid` bends along the rim, finds an equilibrium
    // against the fence and stays there. Measured over 18 bearings a plateau, aiming at the foot:
    // 13/18, 12/18, 13/18 found the way up, and every failure was a contiguous arc on the side
    // OPPOSITE the ramp, stopped dead at d=9.0. Moving the aim point further out in front of the
    // ramp bought two bearings on one plateau and nothing on the others -- because the problem was
    // never where the mover was aiming, it was that the straight line went through a cliff.
    //
    // So when the way up is not in front of you, walk round to it: a point on a ring outside the
    // fence, a step of up to 40 degrees around, in the shorter direction. Which is what a person
    // does at the foot of a hill, and it needs no pathfinder because the obstacle is a circle.
    const here = Math.atan2(p.z - use.z, p.x - use.x);
    const rampAng = Math.atan2(use.uz, use.ux);
    let rel = ((rampAng - here + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) > 0.35) {
      const a = here + Math.sign(rel) * Math.min(Math.abs(rel), 0.7);
      const ring = use.top + CFG.plateaus.fence + 2.4;
      return { x: use.x + Math.cos(a) * ring, z: use.z + Math.sin(a) * ring };
    }
    const foot = use.top + use.rampLen - 0.8;            // just inside the bottom of the slope
    return { x: use.x + use.ux * foot, z: use.z + use.uz * foot };
  },

  damageWall(w, dmg, attacker = null) {
    if (w.state !== 'built') return;
    if (attacker && this.mods.wallThorns) this.damageEnemy(attacker, this.mods.wallThorns, attacker.mesh.position);
    if (w.isKeep) {
      // #104: her home, and her voice -- but not while she is the one being carried off. A woman
      // shouting about the masonry from the back of a raider's cart is not the moment.
      this.raiseAlarm('The Keep is under attack!', this.inPrologue() ? null : 'call');   // #232
      w.hp -= dmg;
      setHealthBar(w.bar, Math.max(0, w.hp / w.maxHp));
      w.mesh.position.y = 0.06;
      audio.wallHit(this.panAt(w.mesh.position.x));
      if (w.hp <= 0) this.breakKeep(w);
      return;
    }
    w.hp -= dmg;
    setHealthBar(w.bar, Math.max(0, w.hp / w.maxHp));
    w.mesh.position.y = 0.06;
    audio.wallHit(this.panAt(w.mesh.position.x));
    if (w.hp > 0) return;
    if (w.level > 0) {
      // a battered wall degrades to the previous material before it finally falls
      const from = CFG.wallLevels[w.level].name;
      this.rebuildWall(w, w.level - 1);
      const to = CFG.wallLevels[w.level].name;
      this.hud.toast(`${from} ${w.gate ? 'gate' : 'wall'} battered down to ${to.toLowerCase()}!`, 1500, 'Keep');
    } else this.breakWall(w);
  },

  breakWall(w) {
    w.state = 'broken';
    this.root.remove(w.mesh);
    w.mesh = makeRubble(w.len, w.level);
    w.mesh.position.set(w.mx, 0, w.mz);
    w.mesh.rotation.y = -w.ang;
    this.root.add(w.mesh);
    this.hud.toast(w.gate ? 'The gate is down!' : 'A wall section has fallen!', 1600, 'Keep');
    // a repair pad appears just inside the gap, on the line back to the middle of the ring
    const T = TIERS[w.tier];
    const c = T.ring || { x: (T.bounds.x0 + T.bounds.x1) / 2, z: (T.bounds.z0 + T.bounds.z1) / 2 };
    const ix = c.x - w.mx;
    const iz = c.z - w.mz;
    const il = Math.hypot(ix, iz) || 1;
    const pos = [w.mx + (ix / il) * 3.4, w.mz + (iz / il) * 3.4];
    this.dynamicPads.push({
      id: `repair-${w.id}-${this.time.toFixed(0)}`, pos, cost: CFG.wallLevels[this.wallLevel].repair, icon: 'hammer',
      label: w.gate ? 'Repair Gate' : 'Repair Wall', repair: w,
    });
    this.refreshPads();
  },

  restoreWall(w) {
    this.rebuildWall(w, this.wallLevel);
  },

  // #235: Fresh Mortar. Walls mend by day at a fraction of their own health a second, so a wall the
  // raid left at a quarter is whole again a third of the way through the morning (`CFG.mortar`),
  // and a wall the raid broke is not touched -- broken is broken, and the repair mat is the answer
  // to that. Not at night: mending under attack would be a second health bar the raiders have to
  // beat, which is a number, and this card is a rule about the day.
  mendWalls(dt) {
    if (!this.mods.wallsMend || this.night) return;
    const rate = CFG.mortar.perSecond * dt;
    for (const w of this.walls) {
      if (w.state !== 'built' || w.hp >= w.maxHp) continue;
      w.hp = Math.min(w.maxHp, w.hp + w.maxHp * rate);
      setHealthBar(w.bar, w.hp / w.maxHp);
    }
  },

  // #235: The Portcullis. A broken gate stands again at dawn, and the repair mat that appeared in
  // the gap goes with it, because a mat offering to sell you what you already have is the bug
  // `refreshPads` exists to avoid. Gates only: a wall is the player's to rebuild.
  raiseGates() {
    let n = 0;
    for (const w of this.walls) {
      if (!w.gate || w.state !== 'broken') continue;
      this.restoreWall(w);
      this.dynamicPads = this.dynamicPads.filter((d) => d.repair !== w);
      n++;
    }
    if (n) this.refreshPads();
    return n;
  },

  // #177: what a card changes, as the number the player can already point at -- "arrows hit for
  // 10 -> 13", not "x1.3". The multiplier is resolved against the stat it scales, read off the game
  // as it stands (`mods`, the archers' training, the wall level), so Volley reads 1 -> 2 the first
  // time it is offered and 2 -> 3 the second, and every card gets a figure or the one without it
  // reads as a bug. The same shape the purchase panel (#105) uses for the same numbers afterwards,
  // so a card promises what the panel then confirms. The prose stays beside it: the ladder of words
  // says whether a change is big, the figure says what it is.
  upgradeChange(u) {
    const a = u.apply;
    if (!a || !a.key) return null;
    const cur = this.mods[a.key];
    const next = a.op === 'mul' ? cur * a.by : cur + a.by;
    const one = (x) => String(Math.round(x * 10) / 10);
    const whole = (x) => String(Math.round(x));
    const trained = 1 + this.archerPower * CFG.archerTraining.damage;
    const hearty = 1 + this.archerPower * CFG.archerTraining.hp;
    const recruitBase = (PADS.find((d) => d.id === 'recruit') || { units: { count: 2 } }).units.count;
    const R = {
      archerDamage: ['Arrows hit for', (m) => one(CFG.archer.damage * trained * m)],
      archerHp: ['Archer health', (m) => whole(CFG.archer.hp * hearty * m)],
      archerRange: ['Archers shoot from', (m) => one(CFG.archer.range * m)],
      recruitBonus: ['Archers per recruit mat', (m) => whole(recruitBase + m)],
      towerDamage: ['Tower arrows hit for', (m) => one(CFG.tower.damage * this.damageMul * m)],
      towerRange: ['Towers shoot from', (m) => one(CFG.tower.range * m)],
      towerSlots: ['Archers per tower', (m) => whole(CFG.tower.levels[0].slots + m)],
      wallHp: ['Wall health', (m) => whole(CFG.wallLevels[this.wallLevel].hp * m)],
      wallThorns: ['Damage to a raider hitting a wall', (m) => whole(m)],
      pickup: ['Coins pulled from', (m) => one(CFG.king.pickupRadius * m)],
      coinBonus: ['Extra coin per raider', (m) => whole(m)],
      mineSpeed: ['A swing at wood takes', (m) => `${(CFG.materials.wood.mine / m).toFixed(2)}s`],
      carryBonus: ['The bag holds', (m) => whole(CFG.carry.base + CFG.carry.perUpgrade * m)],
      kingSpeed: ['The King walks at', (m) => one(CFG.king.footSpeed * m)],
      kingArrows: ['Arrows per shot', (m) => whole(m)],
      regen: ['Health back each second', (m) => one(CFG.regen.perSecond * m)],
      gleanerSpeed: ['The gleaner walks at', (m) => one(CFG.gleaner.speed * m)],
    };
    const r = R[a.key];
    if (!r) return null;
    return { label: r[0], now: r[1](cur), next: r[1](next) };
  },

  // the list the HUD gets: each card with its figure, and `apply` still on it for `takeUpgrade`
  offerForHud(list) {
    return list.map((u) => ({ ...u, change: this.upgradeChange(u) }));
  },

  // Present one upgrade choice. Pauses the game; `takeUpgrade` resumes it or shows the next in the queue.
  showOffer() {
    const list = this.over || this.won || this.offerQueue <= 0 ? [] : pickOffer(this.taken, 3 + (this.mods.offerCards || 0), this.seen);   // #221, #235
    for (const u of list) this.seen[u.id] = true;   // #235: shown is seen, taken or not
    // #25: nothing left to offer, which is where a long game ends up once every upgrade is maxed.
    // This used to return with the game still paused and no panel on screen: a permanent freeze.
    if (!list.length) {
      this.offerQueue = 0;
      this.offerLevels = [];
      this.offer = null;
      this.hud.hideOffer();
      this.endOfferPause();
      return;
    }
    this.offer = list;
    this.offerLevel = (this.offerLevels || []).shift() || this.baseLevel;
    this.offerPaused = true;
    this.pause(true);
    this.hud.hideInfo();
    this.infoOpen = false;
    this.hud.showOffer(this.offerForHud(list), this.offerLevel, this.offerQueue, this.levelGains(this.offerLevel));
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
    this.hud.toast(`${u.name}: ${u.desc}`, 3000, 'Village');
    if (this.offerQueue > 0) this.showOffer();
    else this.endOfferPause();
  },

  // #132: the capability notice. It used to be a panel that stopped the game, and the argument for
  // that is worth keeping because most of it still holds -- the answer to "what did I just buy"
  // should arrive attached to the thing it explains, not minutes later after the wave, and the night
  // holds open until the last raider is down (`CFG.cycle.holdDawn`) so "after the wave" is not a time
  // anyone can point at. What did not hold was the premise that it never lands on a moving King:
  //
  //     const paying = inside && pad.holdT > CFG.spend.arm
  //       && (!this.king.moving || pad.holdT > CFG.spend.walkHold);
  //
  // The second clause is an OR. Once `holdT` passes `walkHold` the payment completes WHILE HE IS
  // MOVING, so the panel was landing on a player mid-walk -- which is the "it interrupts my movement"
  // in the report, and the thing #105 believed could not happen.
  //
  // So the news stays attached to the moment and the stop goes. It arrives in the notice lane, says
  // the headline, and closes itself; the rows the panel carried are one tap away and unchanged. The
  // music never stops because `audio.setActive` follows `this.running`, which nothing here touches
  // any more.
  //
  // TWO IN QUICK SUCCESSION: the second REPLACES the first. The pause used to make this impossible --
  // no purchase could complete while one held the screen -- and without it a second can land while
  // the first is still up. Replacing is right rather than queueing because the common case by far is
  // the same mat twice (Training is five buys on one spot), and "Training 4 of 5" already contains
  // everything "Training 3 of 5" was going to say. A queue would make the player read a superseded
  // number before the true one.
  showGain(gain) {
    if (this.over || this.won) return;
    this.gain = gain;
    this.hud.showGain(gain);
  },

  // #25's guarantee -- every way off this ends with something able to move the King -- is now free
  // rather than arranged: nothing here ever stopped him.
  dismissGain() {
    if (!this.gain) return;
    this.gain = null;
    this.hud.hideGain();
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

  // How many homes stand. Counted off the field rather than kept as a number, so it cannot drift from
  // what is actually built -- a restart clears the structures and the count goes with them.
  homeCount() {
    let n = 0;
    for (const s of this.structures) if (s.kind === 'house') n++;
    return n;
  },

  // The Keep level is the floor; every villager home raises it from there.
  unitCap(type) {
    const t = type === 'archer' ? CFG.base.archers : CFG.base.swordsmen;
    const perHome = type === 'archer' ? CFG.home.archers : CFG.home.swordsmen;
    return t[Math.min(this.baseLevel, t.length - 1)] + this.homeCount() * perHome
      + (type === 'archer' ? this.mods.towerSlots * 4 : 0);
  },
};
