// The raiders: what a wave is made of, how each kind behaves, and the Queen being taken and
// got back. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, TIERS } from './config.js';
import { audio } from './audio.js';
import { beatFor } from './story.js';
import { makeRigged } from './rig.js';
import { makeKnight, makeElite, makeBrute, makeBoss, makeCoin, makeHealthBar, setHealthBar, makeCamp, LANTERN_FLAME } from './models.js';
import { tmp, tmp2, tmpM, rand, randInt } from './game-shared.js';

export const EnemiesMethods = {
  // which parts of each enemy rig wear the rank colours
  rankTints(type, rk) {
    // the thief always wears the same green, whatever rank it came in with: it is a role, not a rank
    if (type === 'thief') return [['red', 0x2f8f5b], ['darkRed', 0x1c5638], ['hair', 0x23281f], ['boot', 0x1c5638]];
    if (type === 'sapper') return [['red', 0x3a3a40], ['darkRed', rk.tunic], ['hair', 0x23281f]];
    if (type === 'archer') return [['white', rk.tunic], ['blue', rk.trim], ['hair', 0x23281f], ['leather', rk.dark]];
    if (type === 'shield') return [['ink', 0x7d848e], ['darkRed', rk.tunic], ['steelDark', rk.trim]];
    if (type === 'knight') return [['red', rk.tunic], ['darkRed', rk.trim]];
    if (type === 'elite') return [['darkRed', rk.tunic], ['ink', rk.dark]];
    if (type === 'brute') return [['darkRed', rk.tunic], ['leather', rk.trim]];
    return [['bone', rk.light], ['boneDark', rk.trim]];
  },

  spawnEnemy(type, x, z, rank = 0) {
    const stats = CFG.enemy[type];
    rank = Math.min(rank, CFG.ranks.length - 1);
    const rk = CFG.ranks[rank];
    const rigName = { knight: 'raider', thief: 'raider', sapper: 'raider', archer: 'archer', shield: 'elite' }[type] || type;
    // #212: one raider in `every` carries fire. A stride over a counter rather than a coin flip, so a
    // wave always has the same proportion lit -- see the note on `CFG.torches`.
    this._torchN = (this._torchN || 0) + 1;
    const torch = this._torchN % CFG.torches.every === 0;
    const rig = makeRigged(rigName, this.rankTints(type, rk));
    const mesh = rig ? rig.mesh : type === 'boss' ? makeBoss() : type === 'brute' ? makeBrute() : type === 'elite' ? makeElite() : makeKnight();
    mesh.position.set(x, 0, z);
    const w = Math.max(1, this.raidNight());   // #58: the raid's clock, not the calendar's
    const L = Math.max(0, this.baseLevel - 1);
    // waves, rank and Keep level all scale the enemy
    const hpMul = this.enemyHpMul(rank);
    const dmgMul = (1 + CFG.waves.dmgGrowthPerWave * (w - 1)) * rk.damage * (1 + CFG.base.enemyDmgPerLevel * L);
    if (!this.rankSeen[rank] && this.running) {
      this.rankSeen[rank] = true;
      if (rank > 0) this.hud.toast(`${rk.name}s have arrived! *Watch for their colours.*`, 2800, 'Raid');
    }
    const intro = { sapper: 'Sappers! They ignore your army and go for the walls.', archer: 'Enemy archers! They outrange a new tower and shoot the crews: go out and get them, or build the towers up.', shield: 'Shieldbearers! Arrows bounce off the front. Hit them from behind.' }[type];
    if (intro && !this.typeSeen[type] && this.running) {
      this.typeSeen[type] = true;
      this.hud.toast(intro, 3600, 'Raid');
    }
    const bar = makeHealthBar(type === 'boss' ? 3.4 : type === 'brute' ? 1.5 : 1.0);
    bar.position.y = type === 'boss' ? 5.0 : type === 'brute' ? 2.7 : 1.9;
    mesh.add(bar);
    this.root.add(mesh);
    const e = {
      type, rank, mesh, bar, stats, hp: stats.hp * hpMul, maxHp: stats.hp * hpMul, damage: stats.damage * dmgMul,
      cooldown: rand(0.2, 0.8), target: null, retarget: 0, flash: 0, radius: stats.radius,
      torch, torchPhase: rand(0, Math.PI * 2),   // #212
      scale: rig ? { knight: 1.0, elite: 1.1, brute: 1.35, boss: 2.4, thief: 0.92, sapper: 0.95, archer: 1.0, shield: 1.15 }[type] : type === 'boss' ? 1 : 1.15,
    };
    mesh.scale.setScalar(e.scale);
    // the bar is a child of the scaled mesh: undo that scale so bar size/height are in world units
    bar.scale.x /= e.scale;
    bar.scale.y /= e.scale;
    bar.position.y /= e.scale;
    this.enemies.push(e);
    return e;
  },

  startWave() {
    if (this.wave > 0) {
      const soldiers = this.units.length - 2 + this.turrets.length;
      this.addScore(CFG.score.waveClear * this.wave + soldiers * CFG.score.soldierPerWave);
    }
    this.wave++;
    const w = this.wave;
    // #218: raiders move back into the camps they were driven out of, BEFORE tonight's parties are
    // worked out below -- so a camp whose nights are up is standing again and sends its party
    // tonight. A camp broken this morning is still empty for this one, which is the reward.
    this.reoccupyCamps();
    // #58: every ramp below is "by night N of thirty" and is read off the raid's clock rather than
    // the calendar, so a short run gets the whole curve in half the nights instead of half the curve.
    // `w` is still the calendar: the toast at the bottom, and the boss rhythm, which is a beat the
    // player counts ("every fifth night") and lands at the same density either way -- 3 boss nights
    // of 15, 6 of 30. What scales is how big each one is.
    const rw = this.raidNight();
    const list = [];
    const L = this.baseLevel;
    const knights = 4 + Math.round(rw * 2.2);
    for (let i = 0; i < knights; i++) list.push('knight');
    const brutes = L >= CFG.waves.bruteAt.level || rw >= CFG.waves.bruteAt.wave;
    const elites = L >= CFG.waves.eliteAt.level || rw >= CFG.waves.eliteAt.wave;
    if (brutes && rw >= 3) for (let i = 0; i < Math.floor((rw - 2) * 1.3); i++) list.push('brute');
    if (elites && rw >= 8) for (let i = 0; i < Math.floor((rw - 6) * 0.8); i++) list.push('elite');
    // the rule-breakers, each once the RAID has reached its level -- the Keep's if it is ahead, the
    // night count's if the Keep has stalled, so declining to level no longer skips them entirely
    const RL = this.raidLevel();
    if (RL >= CFG.enemy.sapper.fromLevel && rw >= 3) for (let i = 0; i < Math.min(4, 1 + Math.floor((rw - 3) * 0.5)); i++) list.push('sapper');
    if (RL >= CFG.enemy.archer.fromLevel && rw >= 4) for (let i = 0; i < Math.min(5, 1 + Math.floor((rw - 4) * 0.4)); i++) list.push('archer');
    if (RL >= CFG.enemy.shield.fromLevel && rw >= 5) for (let i = 0; i < Math.min(5, 1 + Math.floor((rw - 5) * 0.4)); i++) list.push('shield');
    if (w % CFG.waves.bossEvery === 0) for (let i = 0; i < Math.floor(rw / 10) + 1; i++) list.push('boss');
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    // mostly the current rank, some lower ranks, and at most a couple of scouts from the next rank
    // up so the player can see what is coming
    const top = this.topRank();
    const scoutSet = new Set();
    if (top < CFG.ranks.length - 1 && rw >= CFG.waves.scouts.from) {
      const n = randInt(0, CFG.waves.scouts.max);
      const candidates = list.map((t, i) => i).filter((i) => list[i] !== 'boss');
      for (let k = 0; k < n && candidates.length; k++) scoutSet.add(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
    }
    const pickRank = (type, i) => {
      if (scoutSet.has(i)) return top + 1;
      if (type === 'boss' || top === 0) return top;
      const roll = Math.random();
      if (top >= 2 && roll < 0.1) return top - 2;
      if (roll < 0.4) return top - 1;
      return top;
    };
    const b = TIERS[this.tier].bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    // #218: THE PARTIES ARE THE CAMPS NOW, and this is the balance spine of the whole ticket.
    //
    // It used to be `dirs = 1 + min(2, floor(rw / 3))` -- one direction, two from raid night 3,
    // three from raid night 6 -- with the first aimed from the main camp and the rest at random
    // angles. The shape is kept exactly: `fromWave` and `everyWave` open camps on 3 and 6, so the
    // first two thirds of a run has the direction count it always had. What changes is that a
    // direction is now a PLACE, and a place can be taken off the board.
    //
    // `active` is every camp whose night has come, standing or not. `standing` is the ones that
    // still have a garrison. A camp that was broken this morning is active and not standing, so it
    // contributes no party and no share -- which is the entire mechanic in one line.
    const active = (this.camps || []).filter((c) => rw >= CFG.camps.fromWave + c.index * CFG.camps.everyWave);
    const standing = active.filter((c) => !c.cleared);
    // WHAT THE RAID IS WORTH TONIGHT. Each standing camp is `share` of it; the rest is the floor,
    // which always comes. With three camps at 0.2 the floor is 0.4, so a player who has broken
    // everything still fights a real night -- they have just bought themselves the smallest one the
    // game can produce, at the cost of every daylight hour it took.
    const scale = Math.min(1, 1 - active.length * CFG.camps.share + standing.length * CFG.camps.share);
    if (scale < 1) {
      // TRIMMED FROM THE SHUFFLED LIST, BOSSES KEPT. A boss night is a beat the player counts, and
      // a raid that drops the boss because three camps were cleared would read as the game losing
      // track rather than as a reward. Everything else is fair game.
      const keep = Math.max(1, Math.round(list.length * scale));
      const bosses = list.filter((t) => t === 'boss');
      const rest = list.filter((t) => t !== 'boss').slice(0, Math.max(0, keep - bosses.length));
      list.length = 0;
      for (const t of bosses) list.push(t);
      for (const t of rest) list.push(t);
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    // The floor party comes from the main camp, as it always has; each standing camp aims one from
    // where it actually stands. They spawn on the usual ring rather than at the camp itself: a camp
    // is 46 to 62 units out and a night is 30 seconds, so raiders walking the whole way would arrive
    // after it. The DIRECTION is the truthful part -- what walks out of the dark comes from the
    // thing you chose not to attack.
    const angles = [Math.atan2(CFG.finale.pos[1] - cz, CFG.finale.pos[0] - cx)];
    const weights = [Math.max(0.0001, 1 - active.length * CFG.camps.share)];
    for (const c of standing) {
      angles.push(Math.atan2(c.z - cz, c.x - cx));
      weights.push(CFG.camps.share);
    }
    // Which party each raider belongs to, by weight rather than round-robin: the floor is twice a
    // camp's share, so the main thrust stays the main thrust and the camps read as flanks.
    const total = weights.reduce((a, w) => a + w, 0);
    const partyOf = (i) => {
      let t = ((i + 0.5) / list.length) * total;
      for (let k = 0; k < weights.length; k++) { t -= weights[k]; if (t <= 0) return k; }
      return 0;
    };
    const halfDiag = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const half = CFG.world.size / 2 - 8;
    list.forEach((type, i) => {
      let a = angles[partyOf(i)] + rand(-0.5, 0.5);
      let r = halfDiag + rand(10, 16);
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = THREE.MathUtils.clamp(cx + Math.cos(a) * r, -half, half);
        z = THREE.MathUtils.clamp(cz + Math.sin(a) * r, -half, half);
        const onCliff = x < CFG.cliffs.x && z < CFG.cliffs.z;
        const inside = x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3;
        const ri = this.world.riverInfo(x, z);
        const inRiver = ri.dist < this.world.river.halfWidth + 3;
        // without a bridge, raiders can only come from the village's side of the river
        const wrongSide = this.world.bridges.length === 0 && ri.side !== this.homeSide;
        if (!onCliff && !inside && !inRiver && !wrongSide) break;
        a += 0.9;
        r += 3;
      }
      this.spawnQueue.push({ type, x, z, t: i * CFG.waves.stagger, rank: pickRank(type, i) });
    });
    // #218: THE ONE TIME THE MECHANIC IS EXPLAINED, on the night the first camp starts sending.
    //
    // Said once, when it first becomes true, and never again -- the rule CLAUDE.md sets for the
    // release greeting and for the same reason. A player who is told every night that camps can be
    // broken is a player who stops reading toasts. The compass word is worth the four lines it
    // costs: "a camp is out there somewhere" is not something anyone can act on before dusk.
    if (!this.campsTaught && standing.length) {
      this.campsTaught = true;
      const c = standing[0];
      const dir = Math.abs(c.x) > Math.abs(c.z) ? (c.x > 0 ? 'east' : 'west') : (c.z > 0 ? 'south' : 'north');
      this.hud.toast(`Part of tonight's raid marched from a camp to the ${dir}. *Break it in daylight and it sends nobody.*`, 4200, 'Raid');
    }
    this.thiefTimer = CFG.waves.thieves.every * 0.6;   // #35: first chance shortly into the night
    const boss = list.includes('boss');
    audio.wave(boss);
    // #149: night one has the red sky and no boss, so "Night 1 falls." would be the game declining to
    // explain the most dramatic thing on screen. It gets the reason instead -- the first raid is not
    // weather, it is the Warlord hearing what happened this morning and answering it.
    this.hud.toast(
      w === 1 ? 'The sky is wrong tonight. *He has heard what you did.*'
        : boss ? `Blood moon! Night ${w} brings a boss.`
          : `Night ${w} falls.`,
      w === 1 ? 3000 : 2200, 'Raid',
    );
  },

  // The level the RAID is fought at, as opposed to the level the Keep stands at. The higher of the
  // two, so the Keep can carry the player ahead of the nights but never behind them (#49).
  raidLevel() {
    // #58: on the raid's clock, like every other nights-per-something number. `rankFloor` is pinned
    // against a thirty-night run (config.js), so read off the calendar the floor at fifteen nights
    // would top out at level 5 and the anti-turtle guard #49 exists for would not apply to half the
    // game's runs -- a short run could stall at Keep 6 and never meet a Marauder.
    return Math.max(this.baseLevel, Math.floor(this.raidNight() / CFG.waves.rankFloor));
  },

  topRank() {
    let top = 0;
    CFG.ranks.forEach((r, i) => { if (r.fromLevel <= this.raidLevel()) top = i; });
    return top;
  },

  // #16: losing the Queen starts a chase, not a lose screen. Raiders pick her up and carry her toward
  // the edge; cut the escort down before they get there and she is back, wounded, and the Keep pays.
  // It can happen once per run. The second time is the end.
  // #152: the calm, and then the men who come for her. Called every frame of a run that has not had
  // its premise yet, and does nothing for `CFG.opening.calm` seconds -- that silence is the point.
  //
  // They come from the north because that is where the camp is, they walk in abreast, and they are
  // marked `rescue` so the raid bar leaves them alone: this is a scripted beat with an outcome, not a
  // fight to be measured, and a progress bar on something the player cannot win is a cruelty.
  updateOpening(dt) {
    // #224: once she is captive the beat is over and this never runs again. Before that, being
    // `snatched` is NOT the end of this method's job -- it used to be, and that was the bug: the
    // party could be killed on its way to her, and then nothing in the game was trying to take her
    // any more while every gate that waits on `openingDone` stayed shut. See `sendCollectors`.
    if (this.queen.captive) return;
    if (this.snatched) return this.updateSnatch(dt);
    const O = CFG.opening;
    // #152: `?tour` holds the morning open. The kingdom is meant to be designed and it cannot be
    // judged while it keeps being pulled down half a minute in -- so the clock simply does not run,
    // nobody comes, and the village stays up to be walked around and argued with.
    if (O.holdFlag) return;
    this.openT += dt;
    if (this.openT < O.calm) {
      // one line, once, a beat before they appear -- so the quiet has an edge on it rather than
      // simply ending
      if (this.openT >= O.calm - 3 && !this.openWarned) {
        this.openWarned = true;
        this.hud.toast('Riders on the north road.', 2600, 'Wren');
        audio.alarm();
      }
      return;
    }
    this.snatched = true;
    // #152: and the kingdom goes with her. The player has spent the calm walking around this.
    this.fallOfTheVillage();
    this.sendCollectors(0);
  },

  // #224: WATCHING FOR A PARTY THAT IS NOT COMING ANY MORE.
  //
  // Runs every frame between the snatch and the capture, which is a window of a few seconds in
  // almost every run and unbounded in the one that reported this. The test is not "are they dead" --
  // it is "is anything still walking at her", which is the thing the premise actually needs to be
  // true. A collector stops being a collector the moment he takes hold of her (`captureQueen` clears
  // the flag on the whole party), so this cannot fire in the frame she is being carried off.
  updateSnatch(dt) {
    if (this.enemies.some((e) => e.collector)) { this.openRetryT = 0; return; }
    this.openRetryT = (this.openRetryT || 0) + dt;
    if (this.openRetryT < CFG.opening.retry) return;
    this.openRetryT = 0;
    this.sendCollectors((this.openWave || 0) + 1);
  },

  // The collecting party, and every replacement for it. Pulled out of `updateOpening` for #224 --
  // it was inline there, which is part of why there was no way to send a second one.
  sendCollectors(wave) {
    const O = CFG.opening;
    this.openWave = wave;
    const up = wave * O.retryRank;
    audio.wave(true);
    const [fx, fz] = O.from;
    const make = (type, x, z, rank) => {
      const e = this.spawnEnemy(type, x, z, rank);
      // #152: a collector wants one thing and it is not him. `updateEnemy` walks an enemy at whatever
      // `target` it was given, and the retarget pass below refuses to give these anything but her.
      e.collector = true;
      // out of the raid count: this is the premise, not a raid (#146's flag, reused for the same
      // reason it was added -- it is never cleared).
      e.rescue = true;
      // ITS OWN STATS OBJECT. `spawnEnemy` assigns `CFG.enemy[type]` straight onto the enemy, so
      // every knight in the game shares one -- writing a speed onto it here would have made every
      // raider for the rest of the run a sprinter. Same shape as the ghost material in #43 and
      // BAKED_STD in #109: a shared thing quietly mutated per-object.
      e.stats = { ...e.stats, speed: O.speed };
      return e;
    };
    // #224: and the party grows. Rank tops out at the first replacement (see `retryRank`); numbers
    // are what actually make each one harder than the last. The spread grows with it so eight men do
    // not walk in as one column -- `spread` is the width of the line, not a gap between the men.
    const n = O.collectors + wave * O.retryMore;
    const spread = O.spread * (n / O.collectors);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      make('knight', fx + (t - 0.5) * spread, fz, O.rank + up);
    }
    if (O.captain) make('brute', fx, fz - 2.4, O.captainRank + up);
    // The first party is the fall of the kingdom and says so. A replacement is a different sentence:
    // the player has just won a fight and needs to be told why it did not settle anything, or the
    // next party reads as the game ignoring him rather than as them not stopping.
    if (wave === 0) {
      this.raiseAlarm('They are coming for Wren!', 'fear');
      this.hud.toast('The walls are down and they are not stopping for you. *Get her away from them.*', 4200, 'Wren');
    } else {
      this.raiseAlarm('More on the north road.', 'fear');
      this.hud.toast('You put that party down and the road sent another. *They are not going home without her.*', 3800, 'Wren');
    }
  },

  captureQueen() {
    const q = this.queen;
    // #233: with the escort parked she is never taken, which is what takes BOTH of her endings off
    // the board in one line -- `gameOver('queen')` is four lines below, and `gameOver('taken')` is
    // reached from `updateTaken` only after this has run. Guarding the entrance rather than the two
    // exits is why the flag does not fork anything.
    if (!this.escort) return;
    // #152: the opening snatch is the premise and not a mistake, so it does not spend one of the two
    // chances a run gets. `recaptures` is what ends a run when she is lost for the third time; taking
    // her in the first two minutes must not start the player one short of everybody who played before
    // this.
    const premise = !this.openingDone;
    if (premise) this.openingDone = true;
    else {
      if (this.recaptures >= CFG.rescue.recaptures) return this.gameOver('queen');
      this.recaptures++;
    }
    q.captive = true;
    q.taken = true;
    q.inKeep = false;
    q.seize = 0;
    q.held = false;
    q.bar.visible = false;
    const p = q.mesh.position;
    // #152: the premise goes NORTH, to the camp's picket. A mid-run recapture still runs for the
    // nearest map edge, because that one is a loss with a lose screen on the end of it and this one
    // is the story -- they were sent to fetch her and they are taking her back the way they came.
    const O = CFG.opening;
    const exit = premise ? { x: O.picket[0], z: O.picket[1] } : this.edgeExit(p);
    const rank = this.topRank();
    q.escort = [];
    // #152: IN THE OPENING THE CARRIERS ARE THE COLLECTORS. Not two fresh knights spawned beside her
    // -- the four who walked down the north road and went round his archers to reach her are the four
    // who carry her back up it. One party, from the fall to the hand-off.
    //
    // It is not only tidier. Left as ordinary enemies they follow her anyway (slice 1's retarget line
    // gives a collector no target but her), so they arrived at the picket a beat behind her and stood
    // into the rescue -- measured, twelve in the bar against the seven that fight was tuned for
    // (#147). And it makes shooting them on the way north matter: every one that goes down is one
    // fewer pair of hands on her, and if they all go down she is back before the picket is reached.
    const party = premise ? this.enemies.filter((e) => e.collector) : [];
    for (const e of party) {
      e.collector = false;              // their errand is over; they are carrying now
      e.escort = true;
      e.exit = exit;
      // marks the whole beat, not just the destination: it picks the speed, it is what says arriving
      // is a hand-off rather than a lose screen, and it keeps `gameOver('taken')` off this one.
      e.premise = true;
      q.escort.push(e);
    }
    // The recapture's own escort, and the premise's fallback if he somehow cut every collector down
    // in the two frames between the last one reaching her and this -- she must not be left standing
    // with nobody holding her.
    for (let i = q.escort.length; i < CFG.rescue.escort; i++) {
      const e = this.spawnEnemy('knight', p.x + rand(-1.3, 1.3), p.z + rand(-1.3, 1.3), rank);
      e.escort = true;
      e.exit = exit;
      e.premise = premise;
      e.maxHp = e.hp = e.maxHp * 1.5;
      q.escort.push(e);
    }
    this.raiseAlarm('They have Wren!', 'fear');
    this.hud.toast(premise
      ? 'They are carrying Wren north. *Go after them.*'
      : 'They are carrying Wren to the edge of the map. *Cut the escort down.*', 3800, 'Wren');
    audio.wave(true);
  },

  // #152, beat six: the picket. They reach the camp's outer guard post and hand her over, and the
  // opening ends in the fight the game already had written for it.
  //
  // NOTHING NEW IS BUILT HERE. The captor machinery -- guards orbiting a prisoner, her pacing inside
  // a pen, the beat where they spot him and turn, `freeQueen` winding the sun to just before dusk --
  // is what every run before slice 1 opened with, and slice 1 left all of it orphaned when she
  // started beside him instead of already taken. This is the same fight, put where the story wants
  // it: at the end of the north road, with the camp on the horizon behind it.
  //
  // `rescue` as well as `captor`, and the two are not the same flag. `captor` is the behaviour and it
  // is cleared the instant they charge; `rescue` is what keeps them out of the raid bar until
  // `rescueSpotted`, so the bar arrives when the fight does and not while he is still walking up the
  // road to it (#147).
  handOffAtPicket() {
    const q = this.queen;
    const R = CFG.rescue;
    // The party goes with her: they hand her over and walk on to the camp. They are taken off the
    // field rather than stood into the fight, so the rescue is the seven it was tuned for (#147)
    // rather than seven plus however many of them the player failed to shoot on the way north.
    //
    // The other way round is the more interesting fight -- the carriers stay and the size of the
    // rescue is what the chase left of them -- but it changes the hardest thing in the early game
    // from a fixed seven at rank 1 to a variable eight-to-twelve at rank 2, and that is a number
    // that wants playing rather than reasoning about.
    for (const e of [...this.enemies]) if (e.escort) this.removeEnemy(e);
    q.escort = null;
    q.taken = false;      // set down, not carried: `updateCaptive` takes it from here
    q.seize = 0;
    q.held = false;
    // The pen is where they actually stopped rather than where the config says the post is: she is
    // carried here by a runner that was dodging a river bank, and a pen a metre off her would have
    // her pacing towards a point she is not standing on.
    const p = q.mesh.position;
    this._pen.set(p.x, 0, p.z);
    this.rescueSpotted = false;
    this.alertT = 0;
    for (let i = 0; i < R.captors; i++) {
      const a = (i / R.captors) * Math.PI * 2;
      const e = this.spawnEnemy('knight', p.x + Math.cos(a) * 2.3, p.z + Math.sin(a) * 2.3, R.captorRank);
      e.captor = true;
      e.rescue = true;
      e.orbit = a;
      e.orbitDir = i % 2 ? 1 : -1;
    }
    if (R.captain) {
      const c = this.spawnEnemy('brute', p.x, p.z - 2.9, R.captainRank);
      c.captor = true;
      c.rescue = true;
      c.orbitDir = 1;
    }
    this.raiseAlarm('', 'fear');
    this.hud.toast('They have handed her to the camp\'s picket. *Take her back.*', 3800, 'Wren');
  },

  // escorts march for the edge with her; the first one alive is the one carrying her
  updateEscort(e, dt) {
    const p = e.mesh.position;
    const R = CFG.rescue;
    // #152: the opening's escort runs at the collectors' speed. See `CFG.opening.escortSpeed` -- at
    // 4.0 the King catches them in two seconds and the picket is unreachable code.
    const speed = e.premise ? CFG.opening.escortSpeed : R.escortSpeed;
    tmp2.set(e.exit.x - p.x, 0, e.exit.z - p.z);
    const d = tmp2.length();
    this.faceTowards(e.mesh, tmp.set(e.exit.x, 0, e.exit.z), dt, 8);
    // #226: "they walked straight through a wall together instead of using the gate". They did: this
    // was the ONE mover in the game that only ever asked about the river. Every other raider is put
    // through `collideWalls` and `collideKeep` as well, and the escort skipped both -- so a party
    // carrying the Queen off walked through the player's walls at the exact moment the walls are the
    // only thing that matters.
    //
    // It reads as an opening bug and is worse than that. `fallOfTheVillage` breaks every wall before
    // the premise escort exists, so at the opening there is usually nothing there to pass through;
    // the case that really bit is a MID-RUN RECAPTURE, where the walls are standing, the player has
    // paid for them, and she was carried out through the stonework.
    //
    // Blocked, they attack it, which is what a raider does and what a wall is for. Deliberately NOT
    // a gate detour: an enemy is stopped by a gate too (`collideWalls`'s `friendly` flag is what
    // lets a gate pass your own men and not theirs), so routing them to one would walk a party into
    // the strongest section rather than round it. A wall that holds her escort is a wall buying the
    // player the seconds to catch them, and that is the whole point of having built it.
    if (d > 0.1) {
      tmp2.normalize().multiplyScalar(Math.min(speed * dt, d));
      p.add(tmp2);
    }
    const blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
    this.collideRiver(p, e.radius);
    this.collideScenery(p, e.radius);                       // #215
    if (blocked) {
      e.cooldown -= dt;
      if (e.cooldown <= 0) {
        e.cooldown = 1 / e.stats.attackRate;
        this.attackAnim(e);
        this.damageWall(blocked, e.damage * (e.stats.aoe ? 2 : 1), e);
      }
    }
    e.moving = !blocked;
    this.animateWalk(e, blocked ? 0 : 1, dt);
    // The premise never ends a run: it ends at the picket, which `updateTaken` watches for -- once,
    // on the one escort that is actually carrying her, rather than once per escort from in here
    // while this loop is walking the array the hand-off is about to empty.
    if (e.premise) return;
    const half = CFG.world.size / 2 - 4;
    if (Math.abs(p.x) > half - 0.5 || Math.abs(p.z) > half - 0.5) this.gameOver('taken');
  },

  // Enemy archer: closes to just inside its range on the nearest soldier or tower crew, then holds and shoots.
  updateEnemyArcher(e, dt) {
    const p = e.mesh.position;
    e.cooldown -= dt;
    e.retarget -= dt;
    if (e.retarget <= 0 || !e.target || e.target.hp <= 0) {
      e.retarget = 0.6;
      let best = null;
      let bd = Infinity;
      const shootable = this._shootable || (this._shootable = []);
      shootable.length = 0;
      for (const u of this.units) shootable.push(u);
      for (const t of this.turrets) shootable.push(t);
      for (const u of shootable) {
        if (u.inKeep || u.captive) continue;
        // #83: she cannot be hurt, and an archer holding at 15 units cannot get hold of her either,
        // so one that picked her would stand there shooting a target it can never affect for the
        // rest of the night. Let it find something it can actually do something about.
        if (u.type === 'queen') continue;
        const d = p.distanceToSquared(u.isTurret ? u.pos : u.mesh.position);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      e.target = best;
    }
    const t = e.target;
    if (!t) return;
    const tp = t.isTurret ? t.pos : t.mesh.position;
    tmp2.set(tp.x - p.x, 0, tp.z - p.z);
    const d = tmp2.length();
    this.faceTowards(e.mesh, tmp.set(tp.x, 0, tp.z), dt, 8);
    const hold = e.stats.range - 1.5;
    let blocked = null;
    if (d > hold) {
      tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - hold));
      p.add(tmp2);
      blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
      this.collideRiver(p, e.radius);
    }
    e.moving = d > hold && !blocked;
    this.animateWalk(e, e.moving ? 1 : 0, dt);
    if (d <= e.stats.range && e.cooldown <= 0) {
      e.cooldown = 1 / e.stats.attackRate;
      this.attackAnim(e);
      this.fireArrow(tmp.copy(p).setY(1.5), t, e.damage, true);
    } else if (blocked && e.cooldown <= 0) {
      e.cooldown = 1 / e.stats.attackRate;
      this.damageWall(blocked, e.damage, e);
    }
  },

  // What a raider of this rank arrives with, as a multiple of its type's base HP. Shared with the
  // raid meter, which has to price the ones still walking in.
  enemyHpMul(rank) {
    const rk = CFG.ranks[Math.min(rank, CFG.ranks.length - 1)];
    const w = Math.max(1, this.raidNight());   // #58: the raid's clock, not the calendar's
    const L = Math.max(0, this.baseLevel - 1);
    return (1 + CFG.waves.hpGrowthPerWave * (w - 1)) * rk.hp * (1 + CFG.base.enemyHpPerLevel * L);
  },

  enemyMaxHp(type, rank) {
    const stats = CFG.enemy[type];
    return stats ? stats.hp * this.enemyHpMul(rank) : 0;
  },

  // What is left of tonight's raid: health still standing, plus health still on its way in, and a
  // head count of both. Written into a scratch object rather than a fresh one, because this runs
  // every frame.
  //
  // The spawn queue counts. A wave arrives staggered over several seconds, and a meter that ignored
  // what had not landed yet would climb while they walked on and only then start falling -- it would
  // be measuring the spawner rather than the fight.
  //
  // Two kinds of enemy are out of it, for the same reason by different routes: nobody is fighting
  // them yet.
  //
  // The CAMP stands across the map from the opening frame and counting it would put a bar on screen
  // for a fight nobody is in. It counts itself in the moment `updateCampSleeper` wakes it and clears
  // `camp`.
  //
  // The QUEEN'S GUARDS used to count, deliberately, and #146 is that decision being wrong now. The
  // argument was that the rescue is the first fight and "how many are left" is the same question
  // there -- which was fair when this was a ring in the corner of the top bar, and is not once it is
  // a full-width bar reading "Night 1 / Raiders / 7 left" over a run the player has not started. The
  // report is exactly that: "the enemy meter is shown before i interact".
  //
  // `rescue` rather than `captor`, and rather than the `night > 0` the ticket proposed. `captor` is
  // cleared the moment the guards charge, so it would hide the bar until the King is spotted and then
  // raise it mid-rescue -- the same bug arriving late. `night > 0` looks right and quietly breaks the
  // one other fight that can happen before night 1: walking north wakes the camp on proximity alone
  // (`updateCampSleeper`, no wave gate -- there is a toast written for it, "The whole camp is up and
  // you are one man"), and that is a fight where the count matters a great deal. `rescue` is set once
  // at spawn and never cleared, so it means the opening party and nothing else: a mid-run recapture
  // chase (#16) is ordinary raiders and keeps its bar.
  raidRemaining(out) {
    out.hp = 0;
    out.count = 0;
    // #135: and who it is. The raid bar names what is on the field, and the Warlord is the one
    // enemy the player has a word for -- so the name is worth a flag on a loop that already runs
    // rather than a second pass over the same list.
    out.boss = false;
    for (const e of this.enemies) {
      // #147: the rescue party is out of the count while the player is still walking out to it, and
      // in it the moment the guards turn. #146 took them out for the WHOLE opening, which also took
      // the bar off the fight itself -- seven enemies and the hardest thing in the early game, with
      // nothing on screen saying how much of it was left.
      //
      // `rescueSpotted` and not `captor`: the flag `captor` is cleared the instant they charge, and
      // this has to answer for the rest of the fight. It is set once, at `noticeRadius`, by the same
      // beat that turns them and sounds the alarm -- so the bar arrives when the fight does.
      if (e.camp || (e.rescue && !this.rescueSpotted)) continue;
      out.hp += Math.max(0, e.hp);
      out.count++;
      if (e.type === 'boss') out.boss = true;
    }
    for (const s of this.spawnQueue) {
      out.hp += this.enemyMaxHp(s.type, s.rank || 0);
      out.count++;
      if (s.type === 'boss') out.boss = true;
    }
    return out;
  },

  // enemies out raiding: not the Queen's guards, not the camp's sleeping garrison
  activeEnemies() {
    return this.enemies.filter((e) => !e.captor && !e.camp);
  },

  // Is anyone out raiding? The callers that ask this only ever compared the list's length to zero,
  // which built and threw away an array of every enemy on the field to answer a yes or no -- once a
  // frame, on the list that is longest exactly when the game is busiest.
  anyActiveEnemy() {
    for (const e of this.enemies) if (!e.captor && !e.camp) return true;
    return false;
  },

  // Did the day phase pass `mark` between these two readings, wrap included?
  crossedPhase(from, to, mark) {
    return (from < mark && to >= mark) || (to < from && (from < mark || to >= mark));
  },

  // #19: the camp wakes when the King comes for it
  updateCampSleeper(e, dt) {
    const F = this.campFor(e);            // #218: the finale, or the small camp this one belongs to
    const kp = this.king.mesh.position;
    if (Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) < F.wakeRadius) {
      // ONLY THIS CAMP WAKES. It used to be every sleeper on the map, which was correct while there
      // was one camp and is the loudest possible bug with four: walking up to a picket in the west
      // would have stood the Warlord up seventy units away in the north.
      for (const x of this.enemies) if (x.camp && x.campId === e.campId) {
        x.camp = false;
        x.fromCamp = true;                                   // #28: and this is the post it returns to
        x.post = { x: x.mesh.position.x, z: x.mesh.position.z };
      }
      this.raiseAlarm('The camp is awake!');
      this.hud.toast(F.small ? 'The camp is up. *Break it before dusk and that party will not come.*'
        : this.finaleOpen ? 'The Warlord stands. He has been waiting for this.'
          : 'The whole camp is up and you are one man. Run.', 3000, 'Raid');
      audio.wave(true);
      return;
    }
    e.moving = false;
    this.animateWalk(e, 0, dt);
  },

  // #218: put a camp on the field -- tents and a sleeping garrison.
  //
  // `first` is the run's opening build, where nothing should be announced: the camps have always
  // been there as far as the player is concerned. A reoccupation mid-run is news, and says so.
  standCamp(c, first = false) {
    const C = CFG.camps;
    if (!c.mesh) {
      c.mesh = makeCamp(C.radius);
      c.mesh.position.set(c.x, 0, c.z);
      this.root.add(c.mesh);
    }
    c.mesh.visible = true;
    c.cleared = false;
    // One rank under the raid. A picket rather than the war party -- and a camp that fights at full
    // rank is one the early King cannot break at all, which turns the mechanic off for exactly the
    // players it is meant to give something to do.
    const rank = Math.max(0, this.topRank() - C.rankUnder);
    for (let i = 0; i < C.garrison; i++) {
      const a = (i / C.garrison) * Math.PI * 2;
      const e = this.spawnEnemy(i % 3 === 0 ? 'brute' : 'knight',
        c.x + Math.cos(a) * C.radius * 0.75, c.z + Math.sin(a) * C.radius * 0.75, rank);
      e.camp = true;
      e.campId = c.id;
      e.mesh.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    }
    if (!first) this.hud.toast('Raiders have moved back into a camp you cleared.', 2600, 'Raid');
  },

  // The camp a sleeping or returning raider belongs to, as a shape with a position, a wake radius
  // and a leash. The finale is one of these -- it is the big one rather than a different kind of
  // thing -- which is what lets `updateCampSleeper` and `updateCampReturn` stay single copies of
  // themselves instead of growing a second, nearly identical pair for the small camps.
  campFor(e) {
    if (!e.campId) return CFG.finale;
    const c = this.camps && this.camps.find((x) => x.id === e.campId);
    if (!c) return CFG.finale;
    const C = CFG.camps;
    return { pos: [c.x, c.z], radius: C.radius, wakeRadius: C.wakeRadius, leash: C.leash, small: c };
  },

  // #218: the last raider of a garrison is down, so that camp sends nobody tonight.
  //
  // Checked here rather than on a timer because `killEnemy` is the one death path in the game
  // (#172's comment says so and it is still true), so there is no way for a garrison to empty
  // without passing through it.
  campCleared(campId) {
    const c = this.camps && this.camps.find((x) => x.id === campId);
    if (!c || c.cleared) return;
    if (this.enemies.some((e) => e.campId === campId)) return;
    c.cleared = true;
    c.clearedOn = this.wave;
    if (c.mesh) c.mesh.visible = false;
    const left = this.camps.filter((x) => !x.cleared).length;
    this.hud.toast(left
      ? `Camp broken! That party will not come tonight. *${left} still standing.*`
      : 'Every camp is broken. *Tonight they come from the main camp alone.*', 3200, 'Raid');
    this.addScore(CFG.score.campClear);
  },

  // Raiders move back in after `reoccupy` nights. Called at nightfall, so a camp broken today is
  // gone tonight -- which is the reward -- and comes back on a night the player can count.
  reoccupyCamps() {
    if (this.mods.campsStay) return;   // #221: the Broken Standard -- they do not move back in
    for (const c of this.camps || []) {
      if (c.cleared && this.wave - c.clearedOn >= CFG.camps.reoccupy) this.standCamp(c);
    }
  },

  // #28: true while this one is disengaging, so the normal chase is skipped.
  updateCampReturn(e, dt) {
    const F = this.campFor(e);            // #218
    const kp = this.king.mesh.position;
    const kingFar = Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) > F.leash;
    if (!kingFar && !e.returning) return false;
    if (!e.returning) {
      e.returning = true;
      if (!this.campCalm && !F.small) {
        this.campCalm = true;
        this.raiseAlarm('');
        this.hud.toast('The camp breaks off the chase and falls back.', 3200, 'Raid');
      }
    }
    if (!kingFar && e.returning && Math.hypot(kp.x - F.pos[0], kp.z - F.pos[1]) < F.leash * 0.7) {
      e.returning = false;    // he came back for them
      if (!F.small) this.campCalm = false;
      return false;
    }
    const post = e.post || { x: F.pos[0], z: F.pos[1] };
    const dx = post.x - e.mesh.position.x;
    const dz = post.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {                       // home, rested and asleep again
      e.returning = false;
      e.camp = true;
      e.hp = e.maxHp;
      setHealthBar(e.bar, 1);
      e.moving = false;
      this.animateWalk(e, 0, dt);
      return true;
    }
    const sp = (e.speed || 3) * dt;
    e.mesh.position.x += (dx / d) * sp;
    e.mesh.position.z += (dz / d) * sp;
    e.mesh.rotation.y = Math.atan2(dx, dz);
    e.moving = true;
    this.animateWalk(e, sp, dt);
    return true;
  },

  // the Warlord calls reinforcements from his tents while he lives
  chiefCall(e) {
    const F = CFG.finale;
    e.lastCall = this.time;
    const top = this.topRank();
    for (let i = 0; i < F.callCount; i++) {
      const a = rand(0, Math.PI * 2);
      this.spawnEnemy(i === 0 ? 'shield' : 'knight', F.pos[0] + Math.cos(a) * F.radius * 0.8, F.pos[1] + Math.sin(a) * F.radius * 0.8, top);
    }
    this.hud.toast('The Warlord calls his men from the tents!', 2200, 'Raid');
    audio.alarm();
  },

  // #35: send a thief when the King is carrying something worth stealing, asked repeatedly through
  // the night rather than decided once when the night began. A player who spends coins as he earns
  // them holds almost nothing at nightfall, which is why thieves were never seen.
  maybeSendThief(dt) {
    const th = CFG.waves.thieves;
    this.thiefTimer = (this.thiefTimer || 0) - dt;
    if (this.thiefTimer > 0) return;
    this.thiefTimer = th.every;
    // #58: the calendar, deliberately, and the one nights-number in the file that is NOT on the raid's
    // clock. `fromWave: 2` is not a difficulty ramp -- it is "not on the player's first night", a
    // grace that reads the same at either length. On the raid's clock a short run would have thieves
    // from night 1, which is the first night anybody ever plays, since short is the default.
    if (!this.night || this.wave < th.fromWave || this.inPrologue() || this.queen.captive || this.over || this.won) return;
    if (this.coinsCarried < th.minCoins) return;
    const out = this.enemies.filter((e) => e.type === 'thief').length + this.spawnQueue.filter((s) => s.type === 'thief').length;
    if (out >= th.max || Math.random() > th.chance) return;
    const kp = this.king.mesh.position;
    const half = CFG.world.size / 2 - 8;
    const a = rand(0, Math.PI * 2);
    const rr = 26 + rand(6, 12);
    this.spawnQueue.push({
      type: 'thief',
      x: THREE.MathUtils.clamp(kp.x + Math.cos(a) * rr, -half, half),
      z: THREE.MathUtils.clamp(kp.z + Math.sin(a) * rr, -half, half),
      t: th.warn, rank: 0, warn: true,
    });
  },

  // A thief runs at the King, grabs coins off his stack and bolts for the edge of the map. It ignores
  // walls and never fights, so the answer is archers and speed, not fortification.
  updateThief(e, dt) {
    const p = e.mesh.position;
    const half = CFG.world.size / 2 - 4;
    if (e.state === 'flee') {
      // head for whichever edge is nearest, carrying the loot in plain sight
      if (!e.exit) e.exit = this.edgeExit(p);
      tmp2.set(e.exit.x - p.x, 0, e.exit.z - p.z);
      const d = tmp2.length();
      this.faceTowards(e.mesh, tmp.set(e.exit.x, 0, e.exit.z), dt, 10);
      if (d > 0.1) {
        tmp2.normalize().multiplyScalar(Math.min(e.stats.fleeSpeed * dt, d));
        p.add(tmp2);
      }
      this.collideRiver(p, e.radius);
      e.moving = true;
      this.animateWalk(e, 1, dt);
      if (Math.abs(p.x) > half - 0.5 || Math.abs(p.z) > half - 0.5) this.thiefEscapes(e);
      return;
    }
    // hunting: straight for the King and his coin stack
    const kp = this.king.mesh.position;
    this.faceTowards(e.mesh, kp, dt, 10);
    tmp2.subVectors(kp, p);
    tmp2.y = 0;
    const d = tmp2.length();
    if (d > 1.1) {
      tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - 1.0));
      p.add(tmp2);
      this.collideRiver(p, e.radius);
    } else if (this.coinsCarried > 0) {
      const take = Math.max(1, Math.min(this.coinsCarried, Math.round(this.coinsCarried * e.stats.steal)));
      this.coinsCarried -= take;
      e.carrying = take;
      e.state = 'flee';
      this.attachLoot(e);
      this.raiseAlarm(`A thief took ${take} coins!`);
      this.hud.toast(`A thief has your coins! *Cut them down before they reach the edge.*`, 3000, 'Raid');
      this.popup(`-${take}`, p, '#ff9a9a', 1.8);
      audio.hurt();
    }
    e.moving = d > 1.1;
    this.animateWalk(e, e.moving ? 1 : 0, dt);
  },

  // the loot rides on the thief's back so the stakes are visible at a glance
  attachLoot(e) {
    const g = new THREE.Group();
    const n = Math.min(8, Math.max(2, Math.round(e.carrying / 3)));
    for (let i = 0; i < n; i++) {
      const c = makeCoin(this.coinTier());
      c.position.set(rand(-0.12, 0.12), 1.35 + i * 0.11, -0.28);
      c.scale.setScalar(0.8);
      g.add(c);
    }
    e.mesh.add(g);
    e.loot = g;
  },

  thiefEscapes(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.root.remove(e.mesh);
    this.disposeEntity(e.mesh);
    this.hud.toast(`The thief escaped with ${e.carrying} coins.`, 2600, 'Raid');
    audio.wallHit();
  },

  // #212: put a flame in the hand of everyone carrying one, in one pass and one draw call.
  //
  // Driven off the SAME `LANTERN_FLAME` intensity the village lanterns use, so a torch is dark by day
  // and burning by night without this needing to know anything about the clock. When it is out there
  // is nothing to place, so the whole pass costs one float comparison in daylight -- which is most of
  // a run.
  //
  // `count` is set rather than the mesh being rebuilt: an InstancedMesh draws its first `count`
  // instances, so a wave that shrinks leaves stale matrices sitting unused beyond the mark rather
  // than on screen.
  updateTorches() {
    const t = this.torches;
    if (!t) return;
    if (LANTERN_FLAME.emissiveIntensity < 0.02) {
      t.count = 0;
      return;
    }
    const lift = CFG.torches.lift;
    let n = 0;
    for (const e of this.enemies) {
      if (!e.torch || n >= t.instanceMatrix.count) continue;
      const p = e.mesh.position;
      // a little sway, so a line of them is not a row of identical dots
      const w = Math.sin(this.time * 3 + e.torchPhase) * 0.06;
      tmpM.makeTranslation(p.x + w, p.y + lift, p.z);
      t.setMatrixAt(n++, tmpM);
    }
    t.count = n;
    if (n) t.instanceMatrix.needsUpdate = true;
  },

  updateEnemies(dt) {
    // bucket enemies into cells so separation only checks neighbours (was O(n^2));
    // the cell must be at least two boss radii so a boss pair is never missed
    const cell = 4.5;
    const grid = new Map();
    for (const o of this.enemies) {
      const k = Math.floor(o.mesh.position.x / cell) * 4096 + Math.floor(o.mesh.position.z / cell);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(o);
    }
    for (const e of this.enemies) {
      if (e.captor) {
        this.updateCaptor(e, dt);
        continue;
      }
      if (e.camp) {
        this.updateCampSleeper(e, dt);
        continue;
      }
      // #28: the camp defends the camp. Get far enough away and it breaks off, walks back to its
      // posts and sleeps again, rather than chasing the King home and ending the run.
      if (e.fromCamp && this.updateCampReturn(e, dt)) continue;
      if (e.chief && this.time - e.lastCall > CFG.finale.callEvery && e.hp < e.maxHp) this.chiefCall(e);
      if (e.escort) {
        this.updateEscort(e, dt);
        continue;
      }
      if (e.type === 'thief') {
        this.updateThief(e, dt);
        continue;
      }
      if (e.type === 'sapper') {
        this.updateSapper(e, dt);
        continue;
      }
      if (e.type === 'archer') {
        this.updateEnemyArcher(e, dt);
        continue;
      }
      e.cooldown -= dt;
      e.retarget -= dt;
      if (e.retarget <= 0 || !e.target || e.target.hp <= 0 || (e.target.isKeep && (e.target.state !== 'built' || !this.queen.inKeep))) {
        e.retarget = 0.4;
        let best = null;
        let bd = Infinity;
        for (const u of this.units) {
          if (u.inKeep || u.captive) continue;
          // #152: a collector will not look at anybody else. He walks past the King, around the
          // archers shooting him, and goes to her -- which is the twist, shown rather than told, two
          // minutes into the first run.
          if (e.collector && u.type !== 'queen') continue;
          let d = e.mesh.position.distanceToSquared(u.mesh.position);
          if (u.type === 'queen') d *= CFG.queen.targetWeight;
          if (d < bd) {
            bd = d;
            best = u;
          }
        }
        if (this.keep && this.keep.state === 'built' && this.queen.inKeep) {
          const d = e.mesh.position.distanceToSquared(this.keep.mesh.position) * 0.7;
          if (d < bd) best = this.keep;
        }
        e.target = best;
      }
      const t = e.target;
      if (!t) continue;
      const p = e.mesh.position;
      tmp2.subVectors(t.mesh.position, p);
      tmp2.y = 0;
      const d = tmp2.length();
      const reach = e.radius + 0.7 + (t.isKeep ? CFG.keep.half : 0);
      // if the target is across the river, walk to the nearest bridge first
      // (recomputed 5x a second, not every frame: it searches the whole river polyline)
      if (e.wpTarget !== t || this.time >= e.wpT) {
        e.wp = this.bridgeWaypoint(e, t.mesh.position);
        e.wpT = this.time + 0.2;
        e.wpTarget = t;
      }
      const wp = e.wp;
      let blocked = null;
      if (wp) {
        tmp2.set(wp.x - p.x, 0, wp.z - p.z);
        const wd = tmp2.length();
        this.steerRoundSolid(p, tmp2, wd, e.radius);   // #215
        this.faceTowards(e.mesh, tmp.set(wp.x, 0, wp.z), dt, 8);
        if (wd > 0.05) {
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, wd));
          p.add(tmp2);
        }
        blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
        this.animateWalk(e, 1, dt);
      } else {
        this.faceTowards(e.mesh, t.mesh.position, dt, 8);
        if (d > reach) {
          // #215: bend round a trunk before stepping, not after. A raider walks in a straight line
          // at whatever it is attacking, which is exactly the mover the ticket warns would grind
          // against bark for ever on a push-out alone.
          this.steerRoundSolid(p, tmp2, d, e.radius);
          tmp2.normalize().multiplyScalar(Math.min(e.stats.speed * dt, d - reach + 0.01));
          p.add(tmp2);
          blocked = this.collideWalls(p, e.radius, false) || this.collideKeep(p, e.radius);
          this.animateWalk(e, blocked ? 0.4 : 1, dt);
        }
      }
      e.moving = !!wp || (d > reach && !blocked);
      if (blocked) {
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          this.attackAnim(e);
          this.damageWall(blocked, e.damage * (e.stats.aoe ? 2 : 1), e);
          if (e.stats.aoe && this.shakeOn) this.shake = 0.2;   // #174: unless the sheet says no
        }
      } else if (!wp && d <= reach) {
        this.animateWalk(e, 0, dt);
        if (e.cooldown <= 0) {
          e.cooldown = 1 / e.stats.attackRate;
          this.attackAnim(e);
          if (e.stats.aoe) {
            for (const u of this.units) {
              if (u.mesh.position.distanceTo(p) < e.stats.aoe + 1) this.damageUnit(u, e.damage, p);
            }
            if (this.keep && this.keep.state === 'built' && this.keep.mesh.position.distanceTo(p) < e.stats.aoe + 2.5) this.damageWall(this.keep, e.damage * 2);
            if (this.shakeOn) this.shake = 0.25;
          } else if (t.isKeep) this.damageWall(t, e.damage);
          else this.damageUnit(t, e.damage, e.mesh.position);
        }
      }
      if (e.mesh.userData.body && e.mesh.userData.body.rotation.x > 0) e.mesh.userData.body.rotation.x = Math.max(0, e.mesh.userData.body.rotation.x - dt * 3);
      // simple separation so enemies don't stack into one blob
      const cx = Math.floor(p.x / cell);
      const cz = Math.floor(p.z / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const arr = grid.get(gx * 4096 + gz);
          if (!arr) continue;
          for (const o of arr) {
            if (o === e) continue;
            const dd = p.distanceTo(o.mesh.position);
            const min = e.radius + o.radius;
            if (dd < min && dd > 0.001) {
              tmp2.subVectors(p, o.mesh.position).multiplyScalar(((min - dd) / dd) * 0.5);
              p.add(tmp2);
            }
          }
        }
      }
      this.collideWalls(p, e.radius, false);
      this.collideRiver(p, e.radius);
      this.collideKeep(p, e.radius);
      this.collideScenery(p, e.radius);   // #215
      // hit flash squash
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.scale.set(e.scale * 1.12, e.scale * 0.88, e.scale * 1.12);
        if (e.flash <= 0) e.mesh.scale.setScalar(e.scale);
      }
    }
  },

  updateWaves(dt) {
    this.maybeSendThief(dt);
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.warn && s.t <= 2.5) {
        s.warn = false;
        this.raiseAlarm('Thieves are coming for your coins!');
      }
      if (s.t <= 0) {
        const sp = this.spawnEnemy(s.type, s.x, s.z, s.rank || 0);
        if (s.type === 'thief') sp.state = 'hunt';
        this.spawnQueue.splice(i, 1);
      }
    }
    const cleared = !this.anyActiveEnemy() && this.spawnQueue.length === 0;
    // Nothing attacks the King until he takes the Queen back (#12): the raids ARE the enemy coming
    // for her, so while she is captive the clock stands still and it stays daylight.
    // #152: and it does not start before the premise either. The calm at the top of a run is a held
    // morning, not a day ticking away toward a night the player has not been told about yet.
    if (this.queen.captive || !this.snatched) return;

    // #15: the sun is the timer. Raids come at nightfall and the wave number is the night number.
    const cy = CFG.cycle;
    const prev = this.dayPhase;
    let next = (this.dayPhase + dt / cy.length) % 1;
    // #73: hold the sun at the horizon while the raid is still standing, up to `holdDawn` seconds.
    // The clamp sits a hair short of dawn so the crossing test keeps firing every frame it is held;
    // the moment the field clears -- or the cap runs out -- the clamp lifts and the frame after it
    // crosses for real.
    if (this.night && !cleared && this.crossedPhase(prev, next, cy.dawn) && this.dawnHeld < cy.holdDawn) {
      this.dawnHeld += dt;
      next = cy.dawn - 1e-4;
      if (!this.dawnHolding) {
        this.dawnHolding = true;
        this.hud.toast('The sun waits. *Finish them before it rises.*', 3000, 'Raid');
      }
    }
    this.dayPhase = next;
    const crossed = (from, to, mark) => this.crossedPhase(from, to, mark);

    if (!this.night && this.dayPhase >= cy.nightStart - cy.warn / cy.length && this.dayPhase < cy.nightStart && !this.duskWarned) {
      this.duskWarned = true;
      this.hud.toast('The sun is going down. *Get behind your walls.*', 2600, 'Raid');
    }
    if (!this.night && crossed(prev, this.dayPhase, cy.nightStart)) {
      this.night = true;
      this.duskWarned = false;
      this.dawnHeld = 0;
      this.dawnHolding = false;
      this.startWave();
      // #32: the music turns cold, and a wolf says so. Every night at first, then now and then, and
      // always under a blood moon: a sound that arrives on schedule forever stops being ominous.
      audio.setNight(true);
      const n = this.wave;
      if (n <= 3 || n % 3 === 0 || (n > 0 && n % CFG.waves.bossEvery === 0)) audio.howl();
    }
    if (this.night && crossed(prev, this.dayPhase, cy.dawn)) {
      this.night = false;
      audio.setNight(false);
      this.dawnBreaks(cleared);
    }
    // seconds until the sun goes down, for the HUD
    const toNight = (cy.nightStart - this.dayPhase + 1) % 1;
    this.waveTimer = this.night ? 0 : toNight * cy.length;
  },

  // The reward beat: you held the night, here is the day to rebuild in.
  dawnBreaks(cleared) {
    this.dawnHolding = false;
    if (this.wave <= 0) return;
    // #50: the run is written down here, on the one beat where there is nothing in flight to write.
    this.saveRun();
    if (cleared) {
      this.addScore(CFG.score.waveClear * this.wave);
      this.hud.toast(`Dawn. You held night ${this.wave}.`, 3000, 'Raid');
      audio.unlock();
    } else {
      this.hud.toast('Dawn, but raiders are still inside the walls.', 2800, 'Raid');
    }
    // #154: and if Wren wrote something, dawn is when it is mentioned. Deliberately the quietest
    // slot in the game: a new diary entry is not urgent, it keeps, and the notice lane already has
    // three speakers with a queue rule (#102, #132) -- a fourth arriving mid-raid would be competing
    // with the one thing the player cannot ignore. Here it lands after "Dawn. You held night N",
    // which is already the beat where the game talks about what just happened.
    //
    // NOT a badge on the settings cog: #120 owns that dot for "an update is ready to install", and a
    // second meaning on one dot tells the player neither. The row's own count is the standing signal.
    if (this.diaryNew) {
      const b = beatFor(this.diaryNew);
      this.diaryNew = 0;
      if (b) this.hud.toast(`I've written up ${b.title.toLowerCase()}. It's in the diary if you want it.`, 3600, 'Wren');
    }
  },

  // "Bring on the night": skip the rest of the daylight for points
  callWave() {
    if (!this.running || this.night || this.waveTimer <= 0 || this.inPrologue() || this.queen.captive) return;
    const bonus = Math.floor(this.waveTimer) * CFG.score.earlyWavePerSecond;
    if (bonus > 0) {
      this.addScore(bonus);
      this.hud.toast(`Night called early: +${bonus} points`, 1400, 'Raid');
    }
    this.dayPhase = CFG.cycle.nightStart - 1e-4;
    this.duskWarned = false;
  },

  // Nearest map edge reachable WITHOUT crossing the river (a runner that had to cross would pin
  // itself against the bank and never leave).
  edgeExit(p) {
    const half = CFG.world.size / 2 - 4;
    const mySide = this.world.riverInfo(p.x, p.z).side;
    const cands = [{ x: half, z: p.z }, { x: -half, z: p.z }, { x: p.x, z: half }, { x: p.x, z: -half }];
    cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return cands.find((c) => this.world.riverInfo(c.x, c.z).side === mySide) || cands[0];
  },

  // The Queen trails the King until she has a keep to shelter in.
  // Captive Queen: stands still under guard. Captors wake when the King gets close; once they are
  // gone and he reaches her, she is free and follows him from then on.
  // #11: she is held, not parked. She edges away from whichever guard is nearest and they close
  // back in, which reads as a capture from a distance without needing the toast to explain it.
  updateCaptive(dt) {
    const q = this.queen;
    if (q.taken) return this.updateTaken(dt);
    const R = CFG.rescue;
    const p = q.mesh.position;
    const kp = this.king.mesh.position;
    const d = kp.distanceTo(p);
    const captors = this.enemies.filter((e) => e.captor);

    // spotted: the guards turn on him after a beat, and she calls out
    if (d < R.noticeRadius && !this.rescueSpotted) {
      this.rescueSpotted = true;
      this.alertT = R.alert;
      this.queenHop = 1;
      tmp.copy(p).setY(2.5);
      this.heartFx(tmp, 1, 0.05);
      audio.alarm();
    }
    if (this.rescueSpotted && this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) for (const e of captors) e.captor = false;
    }

    // she backs away from the nearest guard, but her pen pulls her back, so she paces
    let near = null;
    let nd = Infinity;
    for (const e of captors) {
      const dd = e.mesh.position.distanceToSquared(p);
      if (dd < nd) {
        nd = dd;
        near = e;
      }
    }
    let moving = 0;
    if (near) {
      tmp2.subVectors(p, near.mesh.position);
      tmp2.y = 0;
      const back = p.distanceTo(this._pen) / R.penRadius;
      tmp2.normalize().addScaledVector(this._penDir.subVectors(this._pen, p).setY(0).normalize(), back * 1.6);
      if (tmp2.lengthSq() > 1e-4) {
        tmp2.normalize().multiplyScalar(R.queenSpeed * dt);
        p.add(tmp2);
        moving = 0.7;
      }
    }
    this.collideRiver(p, 0.3);
    if (this.queenHop > 0) this.queenHop = Math.max(0, this.queenHop - dt * 1.6);
    p.y = this.queenHop > 0 ? Math.sin((1 - this.queenHop) * Math.PI) * 0.45 : 0;
    const look = d < R.noticeRadius ? kp : near ? near.mesh.position : this._pen;
    q.mesh.rotation.y = this.lerpAngle(q.mesh.rotation.y, Math.atan2(look.x - p.x, look.z - p.z), 1 - Math.exp(-dt * 6));
    q.moving = moving > 0;
    this.animateWalk(q, moving, dt);
    q.bar.visible = false;

    if (d < R.freeRadius && captors.length === 0) this.freeQueen();
  },

  // Guards circle their prisoner and close in when she drifts, rather than standing in a triangle.
  updateCaptor(e, dt) {
    const R = CFG.rescue;
    const q = this.queen.mesh.position;
    const p = e.mesh.position;
    if (this.rescueSpotted && this.alertT > 0) {
      // spotted him: turn and square up before the charge
      this.faceTowards(e.mesh, this.king.mesh.position, dt, 6);
      e.moving = false;
      this.animateWalk(e, 0, dt);
      return;
    }
    if (e.orbit === undefined) e.orbit = Math.atan2(p.z - q.z, p.x - q.x);
    e.orbit += dt * 0.32 * (e.orbitDir || 1);
    const ring = 2.3;
    tmp2.set(q.x + Math.cos(e.orbit) * ring - p.x, 0, q.z + Math.sin(e.orbit) * ring - p.z);
    const d = tmp2.length();
    let moving = 0;
    if (d > 0.12) {
      tmp2.normalize().multiplyScalar(Math.min(R.guardSpeed * dt, d));
      p.add(tmp2);
      moving = Math.min(1, d);
    }
    this.collideRiver(p, e.radius);
    this.faceTowards(e.mesh, q, dt, 5);
    e.moving = moving > 0.05;
    this.animateWalk(e, moving, dt);
  },

  freeQueen() {
    const q = this.queen;
    q.captive = false;
    this.beginRun();   // #232: the prologue is over, and this is the only thing that says so
    this.refreshPads();          // pads held back until the rescue can appear now
    q.seize = 0;
    q.held = false;
    setHealthBar(q.bar, 1);
    tmp.copy(q.mesh.position).setY(1.0);
    this.heartFx(tmp, 14, 1.2);
    this.heartTimer = 9;
    audio.unlock();
    this.addScore(CFG.score.rescue);
    // taking her back is what brings the raiders: wind the sun to just before dusk
    this.dayPhase = (CFG.cycle.nightStart - CFG.rescue.firstRaid / CFG.cycle.length + 1) % 1;
    this.duskWarned = false;
    this.hud.toast('Wren is on her feet. "Get me home -- then we settle this."', 3400, 'Wren');
    this.raidWarning = this.time + 3.6;
    this.refreshPads();
  },

  // #83: how the Queen is lost now. Raiders that have chosen her and reached her get hold of her,
  // and enough of them holding on for long enough carry her off. She is never hurt on the way.
  //
  // Only raiders that are actually AFTER her count, not every body standing near her. She follows
  // the King at 1.9 (CFG.queen.follow) and a knight's grip reaches 1.7, so anyone fighting HIM from
  // her side of the scrum is already inside it: counting bodies would have handed her over in the
  // middle of a fight he was winning, with nothing on screen to explain why. Requiring that they
  // chose her is what turns `targetWeight` into the rule it always looked like -- he faces the
  // fight, and they come round the back for her.
  //
  // Returns true if they got her, because the rest of updateQueen would then be walking a Queen who
  // is already halfway to the map edge.
  // #234: THE CHARGE. Being out at night, with something to be out AMONG, is what fills it.
  //
  // Two gates, and the second is the one that makes this a bet rather than a chore:
  //
  //   NIGHT ONLY   -- charging in daylight would make the safe hours the profitable ones. You would
  //                   walk her out at dawn, park her somewhere empty and the night decision would
  //                   evaporate.
  //   IN DANGER    -- a living raider inside `danger`. Without it the optimal play is to walk her to
  //                   an empty corner and farm the meter in safety, which turns the bet back into
  //                   the chore this ticket exists to delete.
  //
  // A STATE, NOT A GRADIENT. It charges at one rate or not at all. A gradient is unreadable at a
  // glance on a phone and untunable; a binary explains itself, because a stalled ring says why by
  // standing still.
  //
  // The control cost of the danger rule is ZERO, which is what makes it work: she follows the King,
  // so taking her toward danger is the player going toward danger, which he is doing anyway. There
  // is no second thing to drive.
  updateWrenCharge(dt) {
    const q = this.queen;
    const W = CFG.wren;
    if (q.inKeep || q.captive || this.inPrologue()) { q.charging = false; return; }
    // #234: SEIZED LOSES IT. `held` is hands actually on her (#83), not merely being targeted --
    // raiders walk at her all night and that is the game working. It keeps the bet honest and it is
    // one sentence to explain.
    if (q.held && q.charge > 0) {
      q.charge = 0;
      q.charging = false;
      this.hud.toast('They have her, and the moment is gone.', 2000, 'Wren');
      return;
    }
    if (!this.night || q.charge >= 1) { q.charging = false; return; }
    const p = q.mesh.position;
    let near = false;
    for (const e of this.enemies) {
      if (e.camp || e.captor || e.hp <= 0) continue;   // a sleeping garrison is not danger
      if (e.mesh.position.distanceToSquared(p) < W.danger * W.danger) { near = true; break; }
    }
    q.charging = near;
    if (!near) return;
    q.charge = Math.min(1, q.charge + dt / W.charge);
    if (q.charge >= 1) {
      audio.levelUp ? audio.levelUp() : audio.wave(false);
      this.hud.toast('*Wren has it.* Let her loose when they are close.', 2600, 'Wren');
    }
  },

  updateSeize(dt) {
    const q = this.queen;
    const S = CFG.queen.seize;
    const p = q.mesh.position;
    let hands = 0;
    for (const e of this.enemies) {
      if (e.target !== q) continue;
      // Measured off its own size, because that is what updateEnemy stops it at. A boss halts 2.9
      // away and a knight 1.2, so one number for both would have let the biggest thing in the game
      // stand next to her doing nothing at all.
      const r = e.radius + S.grip;
      if (e.mesh.position.distanceToSquared(p) < r * r) hands++;
    }
    // On hands going from none to some, not on the meter leaving zero: after a rescue she starts
    // part-way down (`shaken`), and that is exactly when a second grab must still be announced. The
    // old alarm fired on every point of damage she took, so the warning arrived as a stutter during
    // the emergency rather than at the start of it.
    if (hands > 0 && !q.held) this.raiseAlarm('They have hold of Wren!', 'fear');
    q.held = hands > 0;

    const was = q.seize;
    q.seize = hands > 0
      ? Math.min(1, was + dt * (1 + (hands - 1) * S.perExtra) / S.grab)
      : Math.max(0, was - dt / S.slip);
    if (q.seize === was) return false;     // at rest, which is most frames: nothing to redraw
    // `1 - seize` rather than `seize`: this is the bar the player has spent the whole run reading as
    // "how much of them is left", and setHealthBar hides itself at full -- so she carries nothing
    // over her head until somebody has her, which is the only moment it has anything to say.
    setHealthBar(q.bar, 1 - q.seize);
    if (q.seize >= 1) {
      this.captureQueen();
      return true;
    }
    return false;
  },

  // #181: and she AIMS round him, which is the half the orbiting anchor does not cover.
  //
  // Found by measuring the opening rather than by reading the code, and it is the more interesting
  // bug of the two. The opening puts her in FRONT of him and he stands still: the anchor is behind
  // him, so the straight line to it goes through him, and `collideKing` -- which was the whole
  // answer at that point -- pushed her back out every frame while the follow pulled her in. She sat
  // dead in front of him at exactly the gap, bearing 0 degrees, for TWENTY SECONDS of game time and
  // never got round. A check asserting 0.8 passes that happily. It had turned "walks through him"
  // into "stands in front of him for ever", which is the shape of fix CLAUDE.md warns about: the
  // thing it was meant to protect, deleted.
  //
  // So when he is inside the corridor she is walking down -- nearer than her target and within the
  // angle his exclusion circle subtends at that range -- she aims at the TANGENT of that circle
  // instead of at the target. She walks past him at arm's length and the anchor takes her round the
  // back from there. It is one asin and one atan2, and it is what "make her go round" means.
  steerRoundKing(p, dir, d) {
    const k = this.king.mesh.position;
    const kx = k.x - p.x, kz = k.z - p.z;
    const dk = Math.hypot(kx, kz);
    const gap = CFG.queen.kingGap;
    if (dk < 1e-3 || dk >= d || dk <= gap) return false;   // not between her and where she is going
    const halfWidth = Math.asin(Math.min(1, gap / dk));
    const ang = Math.atan2(dir.x, dir.z);
    const kang = Math.atan2(kx, kz);
    let rel = ((kang - ang + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) >= halfWidth) return false;          // the corridor is clear, walk straight
    // Dead ahead has no side, and `%` would pick one on a coin flip. Take the side of his centreline
    // she is already standing on, which is the same tie-break the anchor uses and for the same reason.
    let side = rel > 1e-3 ? -1 : rel < -1e-3 ? 1 : 0;
    if (!side) {
      const fx = Math.sin(this.king.mesh.rotation.y), fz = Math.cos(this.king.mesh.rotation.y);
      side = (kx * fz - kz * fx) >= 0 ? 1 : -1;
    }
    const a = kang + side * halfWidth;
    dir.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    return true;
  },

  // #181: she yields rather than being walked through.
  //
  // This is NOT the fix for the ticket's bug -- the orbiting anchor in `updateQueen` is, and with it
  // a 180 on the spot never brings them closer than the follow distance at all. What is left is the
  // other half: the King REVERSES AND WALKS, and the place he walks to is the place she is standing,
  // because "behind him" became "in front of him" the moment he turned. Nothing about the target she
  // follows can fix being walked at; she has to get out of the way.
  //
  // Which is why it reads differently from the push this ticket rejected. Correcting a teleport looks
  // like a character sliding through a frame she was never meant to be in; stepping aside from
  // someone walking into you is what a person does, and it is the only thing she CAN do.
  //
  // Radial plus a tangential bias, and the bias is the part that matters. A purely radial push on a
  // head-on approach points straight down his line of travel, so he bulldozes her ahead of him for as
  // long as he holds the stick -- measured, and it looks exactly as bad as it sounds. The tangential
  // term grows with how head-on the approach is, so a glancing pass pushes her out and a dead-on one
  // pushes her sideways, off his line, which is where she wants to be anyway.
  //
  // Capped at her own speed: she cannot be displaced faster than she could walk, so there is no frame
  // where she jumps. If he out-runs the cap she is briefly inside him, which is better than teleporting
  // -- and he cannot, at 5.6 on foot against her 7.2.
  collideKing(p, dt) {
    const k = this.king.mesh.position;
    let dx = p.x - k.x, dz = p.z - k.z;
    let d = Math.hypot(dx, dz);
    const gap = CFG.queen.kingGap;
    if (d >= gap) return false;
    if (d < 1e-4) { dx = Math.sin(this.king.mesh.rotation.y + Math.PI / 2); dz = Math.cos(this.king.mesh.rotation.y + Math.PI / 2); d = 1; }
    const ux = dx / d, uz = dz / d;
    // how head-on he is: 1 when he is walking straight at her, 0 when she is off to one side
    const fx = Math.sin(this.king.mesh.rotation.y), fz = Math.cos(this.king.mesh.rotation.y);
    const head = Math.max(0, -(ux * fx + uz * fz));
    // the side she is already on, so she keeps going that way instead of picking one each frame
    const side = (ux * fz - uz * fx) < 0 ? -1 : 1;
    const tx = -fz * side, tz = fx * side;
    const w = head * CFG.queen.kingSide;
    const mx = ux + tx * w, mz = uz + tz * w;
    const ml = Math.hypot(mx, mz) || 1;
    // Sideways does not open the gap as fast as straight out does, so this converges over a few
    // frames rather than restoring `gap` in one. That is the point: a hard snap to the exact figure
    // is the teleport this is trying not to be.
    const step = Math.min(gap - d, this.queen.stats.speed * dt);
    p.x += (mx / ml) * step;
    p.z += (mz / ml) * step;
    return true;
  },

  updateQueen(dt) {
    const q = this.queen;
    if (!q) return;
    // #126: the invariant, checked rather than assumed -- whenever Wren is free and the Keep is
    // built, walking the King to the door has to put her inside, and there must be no state in which
    // that fails. `inKeep` is the flag that can strand her: everything below returns immediately on
    // it, so if it is ever true while she is standing outside, the game believes she is home and the
    // player has no way left to get her there. That is the report this came from.
    //
    // Two ways it can go wrong, and both are answered here rather than hunted down one at a time:
    // the Keep stops being built underneath the flag, and her position drifts off the balcony the
    // flag claims she is on (a mesh replaced, a restore, anything future). A squared compare against
    // the balcony, once a frame, on a check that already returns on the same line.
    if (q.inKeep) {
      if (!this.keep || this.keep.state !== 'built') this.queenLeaveKeep();
      else {
        const b = this.keep.mesh && this.keep.mesh.userData.balcony;
        if (!b) this.queenLeaveKeep();
        else {
          tmp.set(this.keep.x + b.x, b.y, this.keep.z + b.z);
          if (q.mesh.position.distanceToSquared(tmp) > 0.01) this.queenToBalcony();
        }
      }
      return;
    }
    if (q.captive) return this.updateCaptive(dt);
    if (this.updateSeize(dt)) return;
    // #234: AFTER `updateSeize`, so `held` is this frame's answer rather than last frame's -- the
    // charge is a bet against exactly that flag, and reading it one frame stale would let a grab and
    // a fill happen on the same tick.
    this.updateWrenCharge(dt);
    const k = this.king.mesh;
    const p = q.mesh.position;
    // #181: THE POINT SHE FOLLOWS ORBITS HIM, it does not jump across him.
    //
    // It used to be read straight off his facing -- `follow` units behind whichever way he happened
    // to be pointing this frame. That is fine until he turns round, and turning round is what the
    // joystick is for: the point leaps to the other side of him, she takes the straight line to it,
    // and the straight line goes through the middle of him. Measured at closest approach 0.04 units
    // on a plain 180, many times a minute, for about a fifth of a second each time. Over quickly and
    // exactly the kind of thing that reads as cheap without anyone being able to say why.
    //
    // A SEPARATION PASS WAS THE OBVIOUS FIX AND IS THE WRONG ONE. One more line beside collideWalls
    // -- push her out if she is inside him -- corrects after the fact, so what you see is her
    // sliding round his edge on a frame she was never meant to be there. It would turn a bug that
    // looks cheap into a bug that looks broken. Fixing the TARGET instead means there is nothing to
    // correct: the anchor walks the circle, so she walks the circle.
    //
    // `followTurn` caps how fast that anchor may swing, which is the whole tuning surface. Too fast
    // and she cannot keep up with it and cuts the chord again -- the bug back at a smaller size; too
    // slow and she trails a second behind every turn. See config.js for what was measured.
    const want = k.rotation.y;
    if (q.followAng === undefined) q.followAng = want;
    let turn = ((want - q.followAng + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (turn < -Math.PI) turn += Math.PI * 2;
    // A dead 180 has no short way round and `%` would pick one arbitrarily, which is a coin flip on
    // a frame boundary and would visibly chatter. Broken toward the side she has already drifted to,
    // so she carries on the way she was leaning rather than being swept across his front.
    if (Math.abs(Math.abs(turn) - Math.PI) < 0.06) {
      let side = ((Math.atan2(p.x - k.position.x, p.z - k.position.z) - q.followAng + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (side < -Math.PI) side += Math.PI * 2;
      turn = (side < 0 ? -1 : 1) * Math.abs(turn);
    }
    const cap = CFG.queen.followTurn * dt;
    q.followAng += Math.max(-cap, Math.min(cap, turn));
    const fx = Math.sin(q.followAng);
    const fz = Math.cos(q.followAng);
    tmp.set(k.position.x - fx * CFG.queen.follow, 0, k.position.z - fz * CFG.queen.follow);
    tmp2.subVectors(tmp, p);
    tmp2.y = 0;
    const d = tmp2.length();
    this.steerRoundKing(p, tmp2, d);
    let moving = 0;
    if (d > 0.25) {
      const sp = Math.min(q.stats.speed * (d > 5 ? 1.5 : 1), d / dt);
      tmp2.normalize().multiplyScalar(sp * dt);
      p.add(tmp2);
      moving = Math.min(1, d);
      q.mesh.rotation.y = this.lerpAngle(q.mesh.rotation.y, Math.atan2(tmp2.x, tmp2.z), 1 - Math.exp(-dt * 10));
    }
    p.y = 0;
    this.collideWalls(p, 0.3, true);
    this.collideRiver(p, 0.3);
    this.collideKeep(p, 0.3);
    this.collideKing(p, dt);
    if (d > 16) { p.set(k.position.x + rand(-1, 1), 0, k.position.z + rand(-1, 1)); q.followAng = k.rotation.y; }   // #181: the anchor goes with her
    // a heart now and then while she is close and safe, rarely enough to stay charming
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = rand(16, 26);
      if (d < 4 && this.enemies.length === 0 && !this.night) {
        tmp.copy(p).setY(2.3).lerp(tmp2.copy(k.position).setY(2.3), 0.5);
        this.heartFx(tmp, 1, 0.25);
      }
    }
    // passing an intact Keep, she steps inside (#106: measured to its wall, and a distance she can
    // actually reach -- see CFG.queen.doorReach)
    // #152: not before the premise. The door rule (#106) is for getting her away from raiders, and on
    // the opening morning there are none -- the King starts at the Keep's own door, so without this
    // she was inside on the first frame and stayed there, which makes the minute she is supposed to
    // spend walking beside him a minute of looking at a balcony. Taking her out in
    // `standOpeningVillage` was not enough: this put her straight back, every frame.
    if (this.snatched && this.keep && this.keep.state === 'built' && this.keepWallGap(k.position) < CFG.queen.doorReach) return this.queenEnterKeep();
    q.moving = moving > 0.05;
    this.animateWalk(q, moving, dt);
  },

  damageEnemy(e, dmg, hitPos, from = null) {
    if (e.hp <= 0) return;
    if (e.type === 'shield' && from) {
      // facing is rotation.y; a hit from within 60 degrees of it is taken on the shield
      const fx = Math.sin(e.mesh.rotation.y);
      const fz = Math.cos(e.mesh.rotation.y);
      const dx = from.x - e.mesh.position.x;
      const dz = from.z - e.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / len > 0.5) {
        dmg *= e.stats.front;
        this.popup('blocked', hitPos, '#b9c2cc', 1.1, e, 0);
      }
    }
    e.hp -= dmg;
    // #55: a real flinch if it will read, the old squash if it will not. `hitAnim` declines on
    // anything mid-stride and the squash covers exactly that case -- see there for why.
    if (this.hitAnim(e)) {
      // Cancelling a squash has to UNDO it as well. The scale is only put back on the frame `flash`
      // crosses zero, so setting it to zero from anywhere above skips that frame and leaves the
      // body squashed for good -- which is two arrows, one landing while it walks and one after it
      // has stopped.
      if (e.flash > 0) e.mesh.scale.setScalar(e.scale);
      e.flash = 0;
    } else e.flash = 0.12;
    audio.hit();
    this.burstFx(hitPos, '#dff4ff', 0.9, 0.18);
    setHealthBar(e.bar, Math.max(0, e.hp / e.maxHp));
    this.popup(`-${Math.round(dmg)}`, hitPos, e.type === 'boss' ? '#ffffff' : '#ffe27a', e.type === 'boss' ? 2.6 : 1.4, e, dmg);
    // #55: the body falls away from whatever killed it, so the blow is readable in the fall
    if (e.hp <= 0) this.killEnemy(e, (from && from.mesh && from.mesh.position) || hitPos || null);
  },

  killEnemy(e, from = null) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.kills++;   // #172: every death path comes through here, so this is the one place to count
    if (e.escort && this.queen.taken && !this.enemies.some((x) => x.escort)) this.rescueTaken();
    e.bar.visible = false;
    this.fell(e.mesh, from, 0.5);
    tmp.copy(e.mesh.position).setY(e.type === 'boss' ? 2.5 : 1.0);
    this.burstFx(tmp, '#ffffff', e.type === 'boss' ? 6 : 2.6, 0.38);
    if (e.carrying) {
      // everything it stole spills back out
      for (let i = 0; i < e.carrying; i++) this.dropCoin(e.mesh.position);
      this.hud.toast(`Thief cut down! ${e.carrying} coins recovered.`, 2400, 'Raid');
    }
    const rk = CFG.ranks[Math.min(e.rank || 0, CFG.ranks.length - 1)];
    const mult = e.type === 'boss' ? 4 : e.type === 'brute' || e.type === 'elite' || e.type === 'shield' ? 2 : 1;
    const n = randInt(rk.coins[0], rk.coins[1]) * mult + this.mods.coinBonus;
    for (let i = 0; i < n; i++) this.dropCoin(e.mesh.position);
    audio.enemyDie();
    this.addScore(CFG.score.kill[e.type] || 10);
    if (e.campId) this.campCleared(e.campId);   // #218: was that the last of that garrison?
    if (e.chief) {
      this.addScore(CFG.score.finale);
      this.victory();
    } else if (e.type === 'boss') this.hud.toast('Boss defeated!', 1800, 'Raid');
  },

  // Take an enemy off the board without killing it: no coins, no score, no sound, no death spin.
  // killEnemy is what happens when the player earns it; this is what happens when an enemy belongs
  // to a part of the run that is over, which on a restore is the Queen's captors.
  removeEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    this.root.remove(e.mesh);
    this.disposeEntity(e.mesh);
  },

  // #115: `skip` is one enemy or a list of them. A list is what the King's Volley needs -- one arrow
  // per raider means each shot has to avoid everything the volley has already picked, not just the
  // first. An array is always short (three at the most), so `includes` costs less than a Set would.
  nearestEnemy(pos, range, skip = null) {
    let best = null;
    let bd = range * range;
    const skipped = (e) => (Array.isArray(skip) ? skip.includes(e) : e === skip);
    for (const e of this.enemies) {
      if (skipped(e) || e.captor) continue;
      const d = pos.distanceToSquared(e.mesh.position);
      const r = d - e.radius * e.radius * 2;
      if (r < bd) {
        bd = r;
        best = e;
      }
    }
    return best;
  },
};
