// #256 (R3): THE CASTLE STAGE. Raids mode's half of `Game`, merged onto the prototype like every other
// game-*.js file, so `this` is the same game the story edition runs.
//
// A castle is not a new world. `buildWorld` runs once per page load (game.js), so a castle is a stage
// stood on the existing plot and torn down the way a run already is: `reset()` and `disposeRun()`,
// the path every restart has used and the churn harness has measured. `castles-do-not-leak` runs
// twenty-five of them in a row, because the bridge-mat leak (#190) was exactly this shape.
//
// WHAT THE STORY EDITION GIVES UP HERE, AND HOW. Everything below is gated on `this.mode === 'raids'`,
// which only `?mode=raids` sets; with no `?mode` not one line of this runs. In raids:
//   - the prologue is over before the castle starts (`beginRun`), and the escort is off, so neither of
//     Wren's endings can fire;
//   - Wren is in the Keep and off the stage. Raiders already skip anyone indoors, and a standing Keep
//     with her in it is what they attack -- so the Keep is the castle's objective with no change to how
//     a raider picks a target. Decision 4 brings her back as an ally in R4;
//   - no mats, no trade post, no camps, no caches, no mining: defense only (decision 1);
//   - no day cycle. The time of day is the castle's, held; raids come on the castle's own clock.
import { CFG, PADS } from './config.js';
import { UPGRADES } from './upgrades.js';
import { audio } from './audio.js';
import { rand } from './game-shared.js';
import { setHealthBar } from './models.js';

export const RaidsMethods = {
  // The director (src/raids/director.js) calls these three; the game calls back with two events.
  // `deployed` is the roster's men going in, `{ id, type }` (src/raids/allies.js); `cards` is the run's
  // reward cards by id, which `reset()` has just wiped from `mods` and which are put back here.
  // #258: `opts.committed` are the men of the Call to Arms, held back until the chief comes;
  // `opts.ability` is the run's third button.
  startCastle(spec, deployed = [], cards = {}, opts = {}) {
    this.mode = 'raids';
    this.frozen = false;
    this.reset();
    this.escort = false;
    this.running = true;
    this.watchRender();
    for (const h of ['hideStart', 'hideGameOver', 'hideVictory', 'hidePause', 'hideOffer', 'hideGain']) this.hud[h]();
    // the far country is not part of a castle: its camps and their sleeping garrisons, and the caches
    for (const e of [...this.enemies]) if (e.camp) this.removeEnemy(e);
    for (const c of this.camps || []) if (c.mesh) { this.root.remove(c.mesh); this.disposeEntity(c.mesh); }
    this.camps = [];
    for (const c of this.caches || []) { this.root.remove(c.mesh); this.disposeEntity(c.mesh); }
    this.caches = [];
    this.applyRunCards(cards);   // before the stand, so Wider Decks crews the towers it widens
    this.standCastle(spec);
    this.beginRun();   // after the stand, so the Keep going up is not counted as the player's (#251)
    // #257: the roster's men, each carrying the id that says who they are, so a death in here is a
    // name crossed off the roster and not just a number going down
    let wren = null;
    for (const a of deployed) {
      if (a.type === 'wren') { wren = a.id; continue; }
      const u = this.spawnUnit(a.type, rand(-3, 3), 7 + rand(0, 2), !!a.veteran);
      u.rosterId = a.id;
    }
    this.applyMods();
    this.wave = spec.night;
    this.setDayPhase(spec.phase, spec.blood || null);
    this.night = spec.phase >= CFG.cycle.nightStart && spec.phase < CFG.cycle.dawn;
    audio.init();
    audio.setActive(true);
    audio.setNight(this.night);
    this.castle = {
      spec, t: 0, next: 0, done: false, kills0: this.kills, keepFell: false, fell: [], wren: null, wrenLost: false, sent: deployed.length,
      committed: opts.committed || [], charged: false, chargeHit: false, ability: opts.ability || null, abilityUsed: false,
    };
    if (wren) this.deployWren(wren);
    // The horn and banner are taught once, in the starter castle (#249's line); not again every castle.
    if (!spec.starter) this.verbsSaid = true;
    this.castleLog = this.castleLog || [];
    const n = spec.raids.length;
    this.hud.toast(spec.starter ? `Hold the castle. *${n} raids are coming.*` : `${n} raids. *Hold the Keep.*`, 2600, 'Raid', true);
  },

  // #257: the run's reward cards, applied the way `takeUpgrade` applies one -- through the card's own
  // `apply`, counted in `taken` -- so a card means in a castle exactly what it means in the story.
  applyRunCards(cards) {
    for (const [id, n] of Object.entries(cards || {})) {
      const u = UPGRADES.find((x) => x.id === id);
      if (!u) continue;
      for (let i = 0; i < n; i++) u.apply(this);
      this.taken[id] = n;
    }
  },

  // #257: WREN, DEPLOYED (decision 4). Out of the Keep and on the field at the King's side, with the
  // release she has in the story (#234): the meter fills while raiders are near her and one tap on
  // her button looses it. She can still be put in the Keep with the same button, which makes the Keep
  // the thing they go for again. If they get hold of her for long enough she is lost for the run --
  // the seize meter she already had is her health here, and `captureQueen` sends it to
  // `castleWrenLost` instead of into the story's escort.
  deployWren(id) {
    const q = this.queen;
    this.castle.wren = id;
    q.inKeep = false;
    q.captive = false;
    q.seize = 0;
    q.held = false;
    q.charge = 0;
    q.charging = false;
    this.root.add(q.mesh);
    q.mesh.position.set(1.4, 0, 9.4);
    q.followAng = this.king.mesh.rotation.y;
    q.bar.visible = true;
  },

  castleWrenLost() {
    const c = this.castle;
    const q = this.queen;
    if (!c || !c.wren || c.wrenLost) return;
    c.wrenLost = true;
    c.fell.push(c.wren);
    const p = q.mesh.position;
    this.burstFx(p.clone().setY(1.4), '#cfe8ff', 9, 0.6);
    if (q.mesh.parent) q.mesh.parent.remove(q.mesh);
    q.inKeep = true;   // off the stage, the way she is in a castle she was not brought to
    q.seize = 0;
    q.held = false;
    q.charge = 0;
    q.bar.visible = false;
    for (const e of this.enemies) if (e.target === q) e.target = null;
    this.raiseAlarm('They have taken Wren. *She will not ride with you again.*', 'fear');
  },

  // #257: one of the roster's men fell, and is gone for the run (decision 2). Called from
  // `damageUnit`; the director crosses the names off when the castle ends.
  castleAllyFell(u) {
    if (this.castle && u.rosterId) this.castle.fell.push(u.rosterId);
  },

  // #257: the coin still lying on the field goes into the chest when a castle is held. Picking it up
  // was the story's economy -- a walk to a heap between raids -- and a castle has no between; the
  // alternative was a chest that stayed empty for anyone who spent the fight fighting.
  sweepCoins() {
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.resType) continue;
      this.coinsCarried++;
      this.coinsEarned++;
      this.root.remove(c.mesh);
      this.coins.splice(i, 1);
      n++;
    }
    if (n && this.coinField) this.coinField.update(this.coins);
    return n;
  },

  // The castle, stood whole: the tier-0 plot's structures and palisade, the homes the opening places,
  // the spec's towers with full crews. The trade post is left out, because its mat is a mat.
  standCastle(spec) {
    const O = CFG.opening;
    const built = {};
    for (const def of PADS) {
      if (def.tier !== 0) continue;
      if (!def.structure && !def.wall && def.effect !== 'expand') continue;
      if (def.structure === 'bank' || O.skip.includes(def.id)) continue;
      if (def.structure === 'tower' && !spec.towers.includes(def.id)) continue;
      built[def.id] = true;
    }
    const placedAt = {};
    for (const [id, x, z] of O.homes) {
      built[id] = true;
      placedAt[id] = [x, z];
    }
    this.baseLevel = spec.level;
    this.wallLevel = Math.min(CFG.wallLevels.length - 1, CFG.base.wallAt.filter((l) => l <= spec.level).length - 1);
    this.built = { ...built };
    this.rebuildVillage({ built, placedAt });
    for (const id of Object.keys(this.towers)) {
      const t = this.towers[id];
      for (const [x, z, y] of this.crewSpots({ tower: id, crew: this.towerLevel(t).slots + this.mods.towerSlots })) {
        this.addTurret(x, z, y, id);
        t.crew++;
      }
    }
    this.rebuildStructures(false);
    // Wren: in the Keep (the Keep's own build puts her there), and off the stage. Taking the mesh out
    // of the scene is what the crowd reads as "not drawn" (crowd.js gives the row back); `updateQueen`
    // does nothing in raids, so nothing puts her back.
    const q = this.queen;
    q.inKeep = true;
    if (q.mesh.parent) q.mesh.parent.remove(q.mesh);
    q.bar.visible = false;
    this.king.mesh.position.set(0, 0, 8);
    this.refreshPads();
  },

  // Each frame of a castle: arm the raids on the castle's clock, and call it cleared when the last
  // raid has come and nobody is left.
  updateCastle(dt) {
    const c = this.castle;
    if (!c || c.done) return;
    c.t += dt;
    const raids = c.spec.raids;
    while (c.next < raids.length && c.t >= raids[c.next].at) {
      this.queueCastleRaid(raids[c.next], c.next, raids.length);
      c.next++;
    }
    if (c.committed.length && !c.chargeHit) this.updateCharge();
    if (c.next >= raids.length && this.spawnQueue.length === 0 && !this.anyActiveEnemy()) this.castleCleared();
  },

  // #258 (R5): THE CALL TO ARMS. The committed men wait until the chief is on the field, then come out
  // of the gate nearest him at a run and go for his guard. The first of them to reach it lands the
  // charge -- a blow on every raider round him, harder for more men -- and after that they fight as
  // the army does. Whatever happens to them, they are spent: the director takes them off the roster
  // when the castle ends, alive or not.
  updateCharge() {
    const c = this.castle;
    const B = CFG.raids.boss;
    const boss = this.enemies.find((e) => e.type === 'boss' && e.hp > 0);
    if (!c.charged) {
      if (boss) this.callToArms(boss);
      return;
    }
    if (!boss) { c.chargeHit = true; return; }
    const bp = boss.mesh.position;
    for (const u of this.units) {
      if (!u.charge) continue;
      if (u.mesh.position.distanceToSquared(bp) > (B.radius + boss.radius) ** 2) continue;
      c.chargeHit = true;
      const dmg = B.impact + B.impactPer * c.committed.length;
      let hit = 0;
      for (const e of [...this.enemies]) {
        if (e.hp <= 0 || e.mesh.position.distanceToSquared(bp) > B.radius * B.radius) continue;
        this.damageEnemy(e, dmg, e.mesh.position);
        hit++;
      }
      audio.wave(false);
      this.spawnFx(bp.x, bp.z, 0xffd23d);
      this.burstFx(bp.clone().setY(1.4), '#ffe27a', 12, 0.8);
      this.hud.toast(`*The charge lands.* ${hit} of the guard struck.`, 2200, 'Raid');
      this.emitCastle('charge-hit', { hit, dmg });
      return;
    }
  },

  callToArms(boss) {
    const c = this.castle;
    const B = CFG.raids.boss;
    c.charged = true;
    const bp = boss.mesh.position;
    const gates = this.walls.filter((w) => w.gate && w.mesh);
    const gate = gates.reduce((a, w) => (!a || w.mesh.position.distanceToSquared(bp) < a.mesh.position.distanceToSquared(bp) ? w : a), null);
    const gx = gate ? gate.mesh.position.x : 0;
    const gz = gate ? gate.mesh.position.z : 0;
    for (const a of c.committed) {
      const u = this.spawnUnit(a.type, gx + rand(-1.2, 1.2), gz + rand(-1.2, 1.2), !!a.veteran);
      u.rosterId = a.id;
      u.charge = { boss };
      u.stats = { ...u.stats, speed: u.stats.speed * B.speed, aggro: B.aggro };
    }
    audio.horn();
    this.hud.toast(`*The Call to Arms!* ${c.committed.length} men charge the chief\u2019s guard.`, 2600, 'Raid', true);
    this.emitCastle('charge', { men: c.committed.length });
  },

  // #258 (R5): THE THIRD BUTTON. Once a castle, whatever is in the slot.
  useAbility() {
    const c = this.castle;
    if (!c || c.done || !c.ability || c.abilityUsed || !this.running) return false;
    const A = CFG.raids.abilities;
    const kp = this.king.mesh.position;
    c.abilityUsed = true;
    let said = '';
    if (c.ability === 'volley') {
      let n = 0;
      for (const e of [...this.enemies]) {
        if (e.hp <= 0 || e.mesh.position.distanceToSquared(kp) > A.volley.radius ** 2) continue;
        this.damageEnemy(e, A.volley.damage, e.mesh.position);
        this.burstFx(e.mesh.position.clone().setY(1.2), '#ffe27a', 3, 0.3);
        n++;
      }
      said = n ? `*Rain of arrows.* ${n} struck.` : '*Rain of arrows* \u2014 on nobody.';
    } else if (c.ability === 'hold') {
      let n = 0;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        e.cooldown = Math.max(e.cooldown, A.hold.seconds);
        e.retarget = Math.max(e.retarget, A.hold.seconds);
        e.flash = Math.max(e.flash || 0, 0.3);
        n++;
      }
      said = `*Hold fast!* ${n} held where they stand.`;
    } else if (c.ability === 'sally') {
      for (let i = 0; i < A.sally.men; i++) this.spawnUnit('swordsman', kp.x + rand(-2, 2), kp.z + rand(-2, 2));
      this.applyMods();
      said = `*Sally forth!* ${A.sally.men} swordsmen at your side.`;
    } else if (c.ability === 'mend') {
      let n = 0;
      for (const w of this.walls) {
        if (w.state === 'broken') { this.restoreWall(w); n++; } else if (w.state === 'built' && w.hp < w.maxHp) { w.hp = w.maxHp; setHealthBar(w.bar, 1); n++; }
      }
      this.refreshPads();
      said = n ? `*The masons are out.* ${n} ${n === 1 ? 'wall' : 'walls'} whole again.` : '*The masons are out* \u2014 but nothing was broken.';
    }
    audio.horn();
    this.spawnFx(kp.x, kp.z, 0x9ad0ff);
    this.hud.toast(said, 2400, 'The King');
    this.emitCastle('ability', { id: c.ability });
    return true;
  },

  queueCastleRaid(raid, i, of) {
    raid.types.forEach((type, k) => {
      const a = raid.bearings[k % raid.bearings.length] + rand(-0.35, 0.35);
      const { x, z } = this.spawnSpotAt(a);
      this.spawnQueue.push({ type, x, z, t: k * CFG.waves.stagger, rank: raid.rank });
    });
    const boss = raid.types.includes('boss');
    audio.wave(boss);
    const from = (a) => (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'east' : 'west') : (Math.sin(a) > 0 ? 'south' : 'north'));
    const sides = [...new Set(raid.bearings.map(from))].join(' and ');
    if (i > 0 || of === 1) this.hud.toast(`Raid ${i + 1} of ${of}${boss ? ', and their captain' : ''}. *From the ${sides}.*`, 2400, 'Raid');
  },

  // Seconds to the castle's next raid, for the HUD's hourglass; null once they have all come. In the
  // story the same slot counts down to nightfall, and between raids it read 0:00 here.
  castleNextIn() {
    const c = this.castle;
    if (!c || c.done || c.next >= c.spec.raids.length) return null;
    return Math.max(0, c.spec.raids[c.next].at - c.t);
  },

  castleResult() {
    const c = this.castle;
    const walls = this.walls.filter((w) => !w.isKeep);
    return {
      id: c.spec.id,
      seconds: +c.t.toFixed(1),
      kills: this.kills - c.kills0,
      coins: this.coinsCarried,
      wallsIntact: walls.length ? walls.filter((w) => w.state === 'built').length / walls.length : 1,
      keepStood: !c.keepFell,
      fell: [...c.fell],
      sent: c.sent,
    };
  },

  castleCleared() {
    const c = this.castle;
    c.done = true;
    this.sweepCoins();
    this.hud.toast('The castle holds.', 2200, 'Raid', true);
    audio.unlock();
    this.emitCastle('cleared', this.castleResult());
  },

  // The King fell. Called from `damageUnit` in place of `gameOver`, which belongs to the story edition
  // -- it records a story run, writes a story score and opens the story verdict. The body still falls;
  // the director decides what comes after (R6 builds the death screen).
  castleFell(reason = 'king') {
    const c = this.castle;
    if (!c || c.done) return;
    c.done = true;
    this.emitCastle('fell', { ...this.castleResult(), reason });
  },

  // The Keep falling is a heavy score penalty, not a death, so a run does not end on a wall.
  castleKeepFell() {
    if (this.castle) this.castle.keepFell = true;
    this.hud.toast('The Keep has fallen! *Hold on -- the castle is not lost while the King stands.*', 2800, 'Keep', true);
  },

  // Both to the director, and as a window event so a check can listen without being the director.
  emitCastle(type, detail) {
    this.castleLog = this.castleLog || [];
    this.castleLog.push({ type, detail });
    if (this.director) this.director.onCastle(type, detail);
    window.dispatchEvent(new CustomEvent(`castle:${type}`, { detail }));
  },

  // Tear the stage down: the same `reset()` every restart uses, which disposes the run's root. The map
  // is up over it, so a frame is never drawn of the empty plot.
  endCastle() {
    this.castle = null;
    this.running = false;
    this.spawnQueue.length = 0;
    this.reset();
  },

  // While the map is up the game does not simulate or draw at all: zero draw calls, and a phone gets
  // its breath between castles. `update` checks this first.
  freeze(on) {
    this.frozen = !!on;
    if (on) this.running = false;
  },
};
