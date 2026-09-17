// #50: saving a run, so a backgrounded tab does not cost thirty-seven minutes.
//
// A full run is 30 nights at 75 seconds. Nothing about one used to survive the page: `localStorage`
// held a best-night and a best-score and that was all, and mobile browsers discard backgrounded tabs
// as a matter of routine. A player who took a phone call on night 25 lost half an hour.
//
// WHEN. At dawn. The field is quiet, the spawn queue is empty, nothing is in flight, and it is
// already a beat in the day/night cycle rather than an invented one. That is what makes this
// tractable: a save taken mid-raid would have to capture arrows, spawn timers, thieves carrying
// stolen coins and half-finished payments on a build pad.
//
// One other caller asks for one (#84: installing an update reloads the page), and it may only have
// it when the field LOOKS like dawn -- see `quietEnoughToSave`. Otherwise it is refused and the
// player comes back to the last real dawn, which is the honest answer rather than a broken save.
//
// WHAT. State, not history. It would be tempting to store the list of pads bought and replay them on
// load, but `completePad` awards score, fires toasts and audio, and `levelUp` stops the game to offer
// a reward -- replaying a run's worth of that would be a fireworks display over a game that has not
// started. So everything the player HAS is stored directly, and only five genuinely structural
// builders are replayed: the buildings, the walls, the village expansions, the bridges and the horse.
// Those five are the ones whose output is a mesh in the right place rather than a number, and their
// input is already in `built`.
//
// WHAT IS NOT SAVED. Enemies, coins on the ground, mined piles in transit, arrows, effects. At dawn
// there are no enemies, and the rest is seconds of value. A restored run starts the morning with a
// clean field, which is what the morning looks like anyway.
import { CFG, PADS, NODES } from './config.js';
import { setHealthBar } from './models.js';

const KEY = 'crownrush-run';
// #58: which length the player last chose, kept apart from the run above. It has to outlive a run --
// it is read on the title screen before there is a game to ask -- and it must survive a save format
// bump, because a preference is not run state and losing it would silently put somebody back on the
// thirty-night default they had already turned down.
const LENGTH_KEY = 'crownrush-length';
// Bumped when the shape below changes, or when a balance change would make an old save unfair or
// broken. An unreadable save is discarded rather than half-applied.
const VERSION = 3;

export const SaveMethods = {
  // ---------- writing ----------

  // A run that could still be picked up. `running` on its own is not that: pause() clears it, and a
  // save asked for from inside the settings sheet -- which pauses -- is exactly the case #84 needs.
  inRun() {
    return (this.running || this.paused) && !this.over && !this.won;
  },

  // #84: what dawn LOOKS like, for the one caller that wants a save at a moment nobody chose --
  // installing an update, which reloads the page. Daylight, an empty field, nothing queued to walk
  // on, and the opening over. Everywhere else it declines, and the player comes back to the last
  // real dawn: the stored shape has no room for arrows, spawn timers or a thief halfway to the edge,
  // and restoring half a raid would be worse than losing the minute.
  quietEnoughToSave() {
    return this.inRun() && !this.night && !this.queen.captive
      && !this.anyActiveEnemy() && this.spawnQueue.length === 0;
  },

  // Returns whether it took one, so the caller can say which run the player is coming back to.
  saveBeforeReload() {
    if (!this.quietEnoughToSave()) return false;
    this.saveRun();
    return true;
  },

  // Called at dawn. Cheap enough to do on the beat and small enough for localStorage: the fog canvas
  // is the only part with any size to it, and it is a 256x256 PNG.
  saveRun() {
    if (!this.inRun()) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.runState()));
    } catch (e) {
      // private mode, or the quota is full. A run that cannot be saved still plays.
      console.warn('could not save the run:', e && e.message);
    }
  },

  runState() {
    const pos = (m) => [round(m.position.x), round(m.position.z)];
    const k = this.king;
    const q = this.queen;
    return {
      v: VERSION,
      // the clock
      // #58: the length, so a run picked up tomorrow is the one that was put down. Added WITHOUT
      // bumping VERSION -- every save written before it is a thirty-night run, which is exactly what
      // `s.len || 'long'` reads it as, so bumping would have thrown away live runs to add a word.
      len: this.runLength,
      time: round(this.time),
      wave: this.wave,
      dayPhase: round(this.dayPhase, 4),
      night: this.night,
      duskWarned: this.duskWarned,
      // the ledger
      baseLevel: this.baseLevel,
      tier: this.tier,
      wallLevel: this.wallLevel,
      coinsCarried: this.coinsCarried,
      coinsEarned: this.coinsEarned,
      score: this.score,
      res: { ...this.res },
      archerPower: this.archerPower,
      damageMul: this.damageMul,
      mounted: this.mounted,
      recaptures: this.recaptures,
      finaleOpen: this.finaleOpen,
      built: { ...this.built },
      // #43: and where they were put, for the ones the player chose. Added without bumping VERSION:
      // a save from before this has none, and `rebuildVillage` falls back to `def.buildAt`, which is
      // exactly where that run's buildings were standing.
      placedAt: { ...this.placedAt },
      buyCount: { ...this.buyCount },
      mods: { ...this.mods },
      taken: { ...this.taken },
      rankSeen: { ...this.rankSeen },
      typeSeen: { ...this.typeSeen },
      // the royals
      king: { hp: round(k.hp), maxHp: round(k.maxHp), at: pos(k.mesh) },
      // #83: no health, and `seize` is not stored either -- a save is taken with the field quiet, so
      // nobody has hold of her, and a restore that started with raiders' hands already on her would
      // be restoring a moment that cannot happen.
      queen: { at: pos(q.mesh), inKeep: !!q.inKeep, captive: !!q.captive },
      // the army. Anyone walking to a post is stored where they are going rather than where they got
      // to: they arrive on the next frame instead of the one after, and nobody is left mid-errand.
      units: this.units.filter((u) => u !== k && u !== q).map((u) => ({
        // #116: `guard` is who marches with the King rather than holding the grounds. Added without
        // bumping VERSION, like #58's `len` -- a save written before it simply has nobody in the
        // Guard, which is exactly what a run from before this ticket had.
        type: u.type, veteran: !!u.veteran, guard: !!u.guard, hp: round(u.hp), maxHp: round(u.maxHp), at: pos(u.mesh),
      })),
      turrets: this.turrets.map((t) => ({
        at: [round(t.pos.x), round(t.pos.y), round(t.pos.z)], tower: t.tower, hp: round(t.hp),
      })),
      towers: Object.fromEntries(Object.entries(this.towers).map(([id, t]) => [id, { level: t.level, crew: t.crew }])),
      // The wall sections are generated from TIERS, deterministically and in a fixed order, so only
      // what has happened TO them needs storing.
      walls: this.walls.map((w) => ({ hp: round(w.hp), state: w.state, level: w.level })),
      keep: this.keep ? { hp: round(this.keep.hp), state: this.keep.state, level: this.keep.level } : null,
      // stock, so a quarry worked flat does not come back full
      nodes: this.nodes.map((n) => [round(n.stock, 2), round(n.regrow, 2)]),
      // what has been walked. The minimap is most of how the map is read, and starting a restored run
      // blind would undo a good part of what the player did.
      fog: this.fog ? this.fog.canvas.toDataURL('image/png') : null,
    };
  },

  clearRun() {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  },

  // ---------- reading ----------

  // The stored run, or null if there is none, it is from an older shape, or it is unreadable. Never
  // throws: a corrupt save must not stop the game starting.
  savedRun() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== VERSION || typeof s.wave !== 'number') return null;
      return s;
    } catch (e) {
      return null;
    }
  },

  // ---------- restoring ----------

  // Rebuilds a run from `savedRun()`. Starts from `reset()`, so anything not restored below is
  // whatever a new run would have, and a field of enemies from a previous run cannot survive.
  restoreRun(s) {
    if (!s) return false;
    this.reset();
    this.restoring = true;
    this.hud.mute = true;
    try {
      this.applyRun(s);
    } catch (e) {
      // A save that half-applies is worse than none: the player would be handed a run with someone
      // else's walls. Start clean instead and say so.
      console.warn('could not restore the run:', e && e.message);
      this.clearRun();
      this.restoring = false;
      this.hud.mute = false;
      this.reset();
      return false;
    }
    this.restoring = false;
    this.hud.mute = false;
    return true;
  },

  applyRun(s) {
    // --- the plain state, before anything is built, because the builders read it
    this.runLength = s.len || 'long';   // #58: before anything reads levelReq() or the finale night
    this.time = s.time || 0;
    this.wave = s.wave;
    this.dayPhase = s.dayPhase;
    this.night = !!s.night;
    this.duskWarned = !!s.duskWarned;
    this.baseLevel = s.baseLevel;
    this.tier = s.tier;
    this.wallLevel = s.wallLevel;
    this.coinsCarried = s.coinsCarried;
    this.coinsEarned = s.coinsEarned;
    this.score = s.score;
    this.res = { ...this.res, ...s.res };
    this.archerPower = s.archerPower;
    this.damageMul = s.damageMul;
    this.recaptures = s.recaptures;
    this.finaleOpen = !!s.finaleOpen;
    this.built = { ...s.built };
    this.placedAt = { ...(s.placedAt || {}) };   // #43
    this.buyCount = { ...s.buyCount };
    this.mods = { ...this.mods, ...s.mods };
    this.taken = { ...s.taken };
    this.rankSeen = { ...s.rankSeen };
    this.typeSeen = { ...s.typeSeen };

    // The starting coins are scattered on the ground by reset() to teach the pickup rule. A run in
    // progress has been taught, and they would be a free handful every time the page reloads.
    this.clearGroundCoins();

    // --- the village, in pad order so an expansion happens before the walls it makes room for
    this.rebuildVillage(s);

    // --- the royals
    const k = this.king;
    k.maxHp = s.king.maxHp;
    k.hp = Math.min(s.king.hp, k.maxHp);
    k.mesh.position.set(s.king.at[0], 0, s.king.at[1]);
    setHealthBar(k.bar, k.hp / k.maxHp);
    if (s.mounted && !this.mounted) this.mountKing();

    // #152: a restored run is past its opening by definition, whatever the save says. A save CAN be
    // taken during the calm -- the field is quiet and she is not captive, which is all
    // `quietEnoughToSave` asks -- and coming back with `snatched` false would hold the day clock for
    // ever and then snatch her a second time out of a village that has already been rebuilt.
    this.snatched = true;
    this.openingDone = true;

    const q = this.queen;
    q.captive = false;   // a run is never saved with her taken: dawn cannot arrive while she is, and
                         // the one other caller refuses unless the field is empty (quietEnoughToSave)
    q.taken = false;
    q.escort = null;
    q.seize = 0;
    q.held = false;
    q.mesh.position.set(s.queen.at[0], 0, s.queen.at[1]);
    setHealthBar(q.bar, 1);
    // Her guards belong to an opening that is over.
    for (const e of [...this.enemies]) if (e.captor) this.removeEnemy(e);
    if (s.queen.inKeep) this.queenEnterKeep();

    // --- the army
    for (const u of s.units) {
      const spawned = this.spawnUnit(u.type, u.at[0], u.at[1], u.veteran);
      if (!spawned) continue;
      spawned.guard = !!u.guard;   // #116
      spawned.maxHp = u.maxHp;
      spawned.hp = Math.min(u.hp, u.maxHp);
      spawned.popT = 0;
      spawned.mesh.scale.setScalar(spawned.scale);
      setHealthBar(spawned.bar, spawned.hp / spawned.maxHp);
    }
    for (const t of s.turrets) {
      this.addTurret(t.at[0], t.at[2], t.at[1], t.tower);
      const made = this.turrets[this.turrets.length - 1];
      if (made) {
        made.hp = Math.min(t.hp, made.maxHp);
        setHealthBar(made.bar, made.hp / made.maxHp);
      }
    }
    for (const [id, t] of Object.entries(s.towers || {})) {
      if (this.towers[id]) Object.assign(this.towers[id], { level: t.level, crew: t.crew });
    }

    // --- damage taken, after the things that take it exist
    s.walls.forEach((w, i) => {
      const wall = this.walls[i];
      if (!wall) return;
      wall.level = w.level;
      wall.state = w.state;
      wall.hp = Math.min(w.hp, wall.maxHp);
      if (wall.bar) setHealthBar(wall.bar, wall.hp / wall.maxHp);
    });
    if (s.keep && this.keep) {
      this.keep.state = s.keep.state;
      this.keep.hp = Math.min(s.keep.hp, this.keep.maxHp);
      setHealthBar(this.keep.bar, this.keep.hp / this.keep.maxHp);
    }
    // #127: and if it was rubble when the run was saved, it comes back as rubble.
    //
    // `rebuildVillage` above builds every structure the run had, which includes a whole Keep, and the
    // two lines before this then set `state` to 'broken' behind it. Nothing else ran, so the player
    // came back to a Keep that LOOKED standing, could not be repaired -- `breakKeep` is what raises
    // the repair mat and it never happened -- and had the Raise the Keep mat on it taking coin for
    // levels of a heap of rubble, which is #78's bug reached through the save instead of the field.
    // Reachable in ordinary play: `saveRun` runs at dawn and asks only `inRun()`, and a Keep can fall
    // without taking Wren with it, so a night that ends with it down and the field clear saves this.
    //
    // `showKeepBroken` is the picture without the event: rubble, the repair mat, no feed mat, and
    // none of the horn, notice or capture that belong to the moment it fell. The invariant worth
    // holding is that after a restore the Keep wears whichever mat its own state would have raised.
    if (this.keep && this.keep.state !== 'built') this.showKeepBroken();

    // --- the world
    this.revealNodes();
    s.nodes.forEach(([stock, regrow], i) => {
      const n = this.nodes[i];
      if (!n || !NODES[i]) return;
      n.stock = Math.min(stock, n.max);
      n.regrow = regrow;
    });
    if (s.fog) this.restoreFog(s.fog);

    this.addFeedPad();
    this.refreshPads();
    for (const p of this.pads) this.drawPad(p);
  },

  // The five builders whose output is a mesh rather than a number. Everything else a pad does --
  // coins, score, army size, upgrades -- is restored as state above, which is why this does not
  // touch `completePad` and nothing here says anything to the player.
  rebuildVillage(s) {
    for (const def of PADS) {
      if (!s.built[def.id]) continue;
      if (def.effect === 'expand') this.expand();
      // #43: back where the player put it, not where the map suggested.
      if (def.structure) this.buildStructure(def, s.placedAt && s.placedAt[def.id] ? s.placedAt[def.id] : def.buildAt);
      if (def.wall) this.buildWall(def.wall.tier, def.wall.side);
      if (def.bridge && this.world.buildBridge) {
        const m = this.world.buildBridge(def.bridge);
        if (m) this.root.add(m);
      }
    }
  },

  // The fog canvas comes back as a PNG, which decodes asynchronously. Everything else is already in
  // place by the time it lands; until then the player sees a fully fogged map for a frame or two,
  // which is the same thing they would see if this failed altogether.
  restoreFog(url) {
    const img = new Image();
    img.onload = () => {
      if (!this.fog) return;
      const ctx = this.fog.canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, this.fog.canvas.width, this.fog.canvas.height);
      ctx.drawImage(img, 0, 0);
      this.fog.tex.needsUpdate = true;
      this.drawMinimap(true);
    };
    img.onerror = () => { /* keep the fresh fog; it clears again as he walks */ };
    img.src = url;
  },
};

// Two decimal places is more than a position, a hit point or a stock level needs, and it keeps the
// stored run small enough not to think about.
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export const SAVE_KEY = KEY;
export const SAVE_VERSION = VERSION;

// The chosen length, or the default for somebody who has never chosen. Guarded like every other read
// here: localStorage throws in private mode, and a game that will not start because it could not read
// a preference is worse than one that starts on the default.
export function readLength() {
  // #58 parked: while the pills are off there is one length, and it is not whatever a player happened
  // to choose before they went away. Asked here rather than at each of the five call sites, so the
  // pin cannot be honoured in some of them and forgotten in the rest.
  if (!CFG.lengthPick) return CFG.pinnedLength;
  try {
    const v = localStorage.getItem(LENGTH_KEY);
    return CFG.lengths[v] ? v : CFG.defaultLength;
  } catch (e) {
    return CFG.defaultLength;
  }
}

export function writeLength(len) {
  if (!CFG.lengths[len]) return;
  try { localStorage.setItem(LENGTH_KEY, len); } catch (e) { /* private mode: this run still honours it */ }
}
