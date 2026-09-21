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
// WHAT IS NOT SAVED. Coins on the ground, mined piles in transit, arrows, effects. Seconds of value
// each, and a restored run starts the morning without them, which is what the morning looks like.
//
// ENEMIES ARE SAVED NOW (#150). They were not, and the rule that followed from it was that a save
// could only be taken with the field empty -- so installing an update mid-raid rewound the run to the
// last dawn. The request was "start exactly where they left off", and the reason it could not be
// honoured was the stored shape rather than caution.
//
// It turned out much cheaper than it looks, and the reason is worth writing down: an enemy's TARGET
// is recomputed on a 0.6s timer (`retarget`), and so is its bridge waypoint, so none of the
// behaviour state has to be stored at all. What is left is type, rank, hp and where it stood, which
// `spawnEnemy` already takes.
import { CFG, PADS, NODES } from './config.js';
import { RELICS } from './upgrades.js';
import { setHealthBar } from './models.js';

// Exported because `mapSeed` in game.js has to read this before the save module exists to ask -- see
// the note there. One name for the key, in the file that owns it.
export const RUN_KEY = 'crownrush-run';
const KEY = RUN_KEY;
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

  // #84 asked for a save at a moment nobody chose -- installing an update, which reloads the page --
  // and #150 is what it costs now. It used to want daylight, an empty field and nothing queued,
  // because the stored shape had no room for a raid; a mid-raid install therefore rewound the run to
  // the last dawn, which is exactly the complaint.
  //
  // The raid is stored now, so the only thing left that a save cannot describe is HER BEING CARRIED
  // OFF. That is not a gap to close later: `runState` has no `seize`, and the comment beside the
  // Queen says why -- "a restore that started with raiders' hands already on her would be restoring a
  // moment that cannot happen". Her capture is a beat with a beginning; it cannot be resumed from the
  // middle. So one condition, and it is the honest one.
  quietEnoughToSave() {
    return this.inRun() && !this.queen.captive;
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
      // #219: WHICH MAP THIS RUN IS ON. Added without bumping VERSION, like `len` above: a save
      // written before this has no seed, and `applyRun` reads that as 0 -- the hand-placed layout,
      // which is the only map any of those runs was ever played on.
      //
      // It has to be stored because `nodes` below is an array indexed by position in `NODES`, and on
      // a seeded map `NODES` is what the generator made. Restoring index 11's stock onto a run whose
      // index 11 is a different node -- of a different material, somewhere else on the map -- is not
      // a wrong number, it is a wrong world, and nothing in the save would have said so.
      seed: this.seed,
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
      kills: this.kills,   // #172: additive, no VERSION bump -- an older save restores as 0
      score: this.score,
      res: { ...this.res },
      archerPower: this.archerPower,
      horseLevel: this.horseLevel,   // #82: additive, no VERSION bump -- an older save restores untrained
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
      // #150: the raid in flight, so an update installed mid-night comes back to the same night
      // rather than to the last dawn. Added WITHOUT bumping VERSION, the #119 trick: a save written
      // before this simply has no `raid`, and `applyRun` reads that as a quiet field -- which is
      // exactly what every save written before this WAS.
      //
      // Three lists and no behaviour. `target` and the bridge waypoint are recomputed on their own
      // timers within 0.6s of a restore, so storing them would be storing something the game is
      // about to throw away anyway.
      //
      // Excluded, each for its own reason: `camp` stands itself back up in `reset()`; `rescue` and
      // `captor` belong to an opening that a restore is past by definition; `escort` cannot be here
      // at all, because a run is never saved while she is captive.
      //
      // And `fromCamp`, which is the one that bites. Waking the camp sets `camp = false` on the whole
      // garrison and the chief, so without this term they read as ordinary raiders -- and a restore
      // would respawn every one of them ON TOP of the sleeping garrison `reset()` has just rebuilt,
      // handing the player two camps and a chief with none of its own make-up (`chief`, `chiefHp`,
      // the scale) because `spawnEnemy` only knows how to make a plain boss.
      //
      // So a reload mid-march puts the camp back to asleep and whole. That is not a compromise, it is
      // the game's own rule: `updateCampReturn` already heals the entire garrison to full and beds it
      // down again the moment the King walks past the leash. A reload is a break-off like any other,
      // and the run around it -- village, coin, score, the night -- comes back intact, which is the
      // part that used to be lost.
      raid: {
        // The raid meter reads tonight against the most this night ever held, and that peak is a
        // running maximum rather than anything derivable from the field -- the Warlord calls men in,
        // so it is not just "the biggest wave". One number, stored, and the bar comes back reading
        // what it read. Without it a restore seeds the peak from the survivors on the next frame and
        // a half-fought night reads as untouched.
        peak: round(this.raidPeak),
        queue: this.spawnQueue.map((j) => ({
          type: j.type, x: round(j.x), z: round(j.z), t: round(j.t), rank: j.rank || 0, warn: !!j.warn,
        })),
        live: this.enemies
          .filter((e) => !e.camp && !e.fromCamp && !e.captor && !e.rescue && !e.escort && e.hp > 0)
          .map((e) => ({
            type: e.type, rank: e.rank || 0, hp: round(e.hp), at: pos(e.mesh),
            // a thief that has already grabbed is mid-errand; `state` is the only bit of behaviour
            // that does not rebuild itself, because 'hunt' and 'flee' go to different places.
            state: e.state || null,
            // and what a thief is already holding, or the coins it took would simply vanish on a
            // reload -- which is the player paying for the update.
            carrying: e.carrying || 0,
          })),
      },
      typeSeen: { ...this.typeSeen },
      // the royals
      king: { hp: round(k.hp), maxHp: round(k.maxHp), at: pos(k.mesh) },
      // #83: no health, and `seize` is not stored either -- `quietEnoughToSave` refuses while she is
      // captive, so nobody has hold of her when a save is taken, and a restore that started with
      // raiders' hands already on her would be restoring a moment that cannot happen. Since #150
      // that is the ONLY thing the quiet test still refuses, which makes this the reason for it.
      queen: { at: pos(q.mesh), inKeep: !!q.inKeep, captive: !!q.captive },
      // the army. Anyone walking to a post is stored where they are going rather than where they got
      // to: they arrive on the next frame instead of the one after, and nobody is left mid-errand.
      units: this.units.filter((u) => u !== k && u !== q).map((u) => ({
        // #116: `guard` is who marches with the King rather than holding the grounds. Added without
        // bumping VERSION, like #58's `len` -- a save written before it simply has nobody in the
        // Guard, which is exactly what a run from before this ticket had.
        // #117: `mounted` the same way -- a save from before the Stable has nobody on a horse.
        type: u.type, veteran: !!u.veteran, guard: !!u.guard, mounted: !!u.mounted, hp: round(u.hp), maxHp: round(u.maxHp), at: pos(u.mesh),
      })),
      // #117: the yard's horses. A horse out on the way to a rider comes back as one walking home,
      // which forfeits that one mount purchase; it is a second or two of a run, and storing the
      // promise would mean storing which unit it was made to.
      // #217: the King's own horse is written down as his, wherever it had wandered to. Everything
      // else keeps the existing convention -- anything not in the yard saves as `home`, i.e. "it was
      // walking back" -- which a dawn save makes true: a horse standing in a field at dusk has
      // wandered home by morning. His does not go home, because he has not got back on it.
      horses: this.horses.map((h) => (h.royal
        ? { at: pos(h.mesh), state: 'roam', royal: true }
        : { at: pos(h.mesh), state: h.state === 'yard' ? 'yard' : 'home' })),
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
      // #218: which raider camps are broken and on which night, so a day spent clearing one is not
      // handed back by a restore. Keyed by id rather than positional, because the camps are seeded
      // per map (#219) and a list read by index is a list that silently means something else on a
      // map with a different number of them. Additive, no VERSION bump: a save from before this has
      // no `camps`, which reads as every camp standing -- exactly what those runs had.
      camps: (this.camps || []).filter((c) => c.cleared).map((c) => [c.id, c.clearedOn]),
      // #221: the caches found and dug, and which relics came out of them. By id for the same reason
      // the camps are -- the caches are seeded per map (#219) and a positional list quietly means
      // something else on a map with a different number of them.
      //
      // `relics` is stored rather than recomputed from `mods`, because a relic's `apply` is a
      // one-way function: `campsStay = true` cannot be read back as "the Broken Standard was found"
      // once anything else could also have set it. The list is the record; `applyRun` replays it.
      caches: (this.caches || []).filter((c) => c.found).map((c) => [c.id, c.dug ? 1 : 0]),
      relics: [...(this.relics || [])],
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
    // #219: A SAVE FROM ANOTHER MAP IS REFUSED, and it is refused HERE -- before `reset`, before a
    // single mesh is built -- because the failure it prevents is silent. `applyRun` restores node
    // stock by index into `NODES`, which on a seeded map is the list the generator made; hand it a
    // run from a different seed and every quarry comes back with some other quarry's contents. The
    // player gets a run that is subtly wrong and nothing anywhere says why.
    //
    // `mapSeed` reads the save before the world is built precisely so this cannot normally happen.
    // What it catches is the case that is left: `?seed=N` in the address, which overrules the save on
    // purpose. Starting a clean run on the map that was asked for is the honest answer there.
    if ((s.seed || 0) !== this.seed) {
      console.warn(`the saved run is on map ${s.seed || 0} and this is map ${this.seed}; starting clean`);
      this.clearRun();
      this.reset();
      return false;
    }
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
    // NOT `this.tier = s.tier`. The tier is what the expansions below replay: `rebuildVillage` calls
    // `expand()` for every Expand Village in `built`, from the 0 that `reset()` left, and setting it
    // from the save first counted each expansion twice -- a tier-1 run came back from every reload
    // at tier 2, with the outer plot's mats on the field and the army posted to a ring it had never
    // paid for. Measured: buy Expand Village, save, reload, tier 2. `s.tier` stays in the save as
    // the record; nothing reads it now.
    this.wallLevel = s.wallLevel;
    this.coinsCarried = s.coinsCarried;
    this.coinsEarned = s.coinsEarned;
    this.kills = s.kills || 0;
    this.score = s.score;
    this.res = { ...this.res, ...s.res };
    this.archerPower = s.archerPower;
    this.horseLevel = s.horseLevel || 0;   // #82
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
    // #117: and the horses, once there is a yard for them to stand in
    // #217: his is restored WITHOUT the Stable gate. The yard horses need somewhere to stand, but a
    // loose royal horse does not -- and the legacy unlock "Begin every run already mounted" starts a
    // run with no Stable at all, so gating it would lose the King's horse for exactly the player who
    // never built one.
    for (const h of s.horses || []) {
      if (!h.royal) continue;
      const r = this.addHorse(h.at[0], h.at[1], 'roam');
      r.royal = true;
    }
    if (this.stable) for (const h of s.horses || []) { if (!h.royal) this.addHorse(h.at[0], h.at[1], h.state); }

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
    // #232: `beginRun` is what these two lines were. It sets both, plus the phase that did not
    // exist when this was written -- and being the same call the rescue makes is the point: a
    // restored run and a rescued one are now in the same state because they went through the same
    // door, rather than because two places agree.
    this.beginRun();

    const q = this.queen;
    q.captive = false;   // a run is never saved with her taken: dawn cannot arrive while she is, and
                         // the one other caller is refused outright for it (quietEnoughToSave)
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
      if (u.mounted) this.mountUnit(spawned);   // #117: straight into the saddle, no walk
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

    // --- #150: the raid, put back. After the walls and towers exist, because an enemy that lands
    // mid-field retargets within 0.6s and the thing it picks has to be there to be picked.
    //
    // `|| {}` is the whole of reading a save written before this: no `raid` means a quiet field,
    // which is what every save before this actually was.
    const raid = s.raid || {};
    for (const j of raid.queue || []) {
      this.spawnQueue.push({ type: j.type, x: j.x, z: j.z, t: j.t, rank: j.rank || 0, warn: !!j.warn });
    }
    for (const e of raid.live || []) {
      const made = this.spawnEnemy(e.type, e.at[0], e.at[1], e.rank || 0);
      if (!made) continue;
      made.hp = Math.min(e.hp, made.maxHp);
      if (e.state) made.state = e.state;
      if (e.carrying) made.carrying = e.carrying;
      setHealthBar(made.bar, made.hp / made.maxHp);
    }
    // `|| 0` for a save from before the peak was stored: the meter then seeds itself from whatever
    // came back on the next frame, which is what those saves have always done.
    this.raidPeak = raid.peak || 0;

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
    // #218: the broken camps. `standCamp` in `reset` has already stood every one of them up with a
    // garrison, so clearing one here means taking its raiders off the board -- `removeEnemy` rather
    // than `killEnemy`, because these belong to a part of the run that already happened and paying
    // out their coins and score a second time is how a restore becomes a way to farm.
    for (const [id, on] of s.camps || []) {
      const c = (this.camps || []).find((x) => x.id === id);
      if (!c) continue;                     // a save from another map shape: that camp simply stands
      c.cleared = true;
      c.clearedOn = on;
      if (c.mesh) c.mesh.visible = false;
      for (const e of this.enemies.filter((x) => x.campId === id)) this.removeEnemy(e);
    }
    // #221: the caches, then the relics they paid out. Replayed through each relic's own `apply`
    // rather than by restoring `mods` wholesale, so a relic whose effect changes later is restored
    // as whatever it means NOW -- the same reason `rebuildVillage` replays the structural pads
    // instead of storing meshes.
    for (const [id, dug] of s.caches || []) {
      const c = (this.caches || []).find((x) => x.id === id);
      if (!c) continue;
      c.found = true;
      c.dug = !!dug;
      c.mesh.visible = !dug;
    }
    for (const id of s.relics || []) {
      const r = RELICS.find((x) => x.id === id);
      if (!r) continue;             // a relic retired since the save was written: skip it, do not throw
      this.relicsFound[id] = true;
      this.relics.push(id);
      r.apply(this);
    }
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
