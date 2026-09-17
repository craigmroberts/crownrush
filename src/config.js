// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 190 },
  // the grey mesas in the north-west; nothing spawns or walks here
  cliffs: { x: -14, z: -33 },

  // #103: `pickupRadius` is now also the radius of the ring drawn under the King -- the circle means
  // his reach, which is what a circle under a character has always meant to everyone who has ever
  // played anything. It used to mean the size of his retinue and nothing else, and the reach was
  // `3.0 * pickup + drawnRing * 0.3`, so coins flew in from outside the circle on the first pickup of
  // a new game (3.72 against a ring of 2.4) and from four times outside it with Lodestone stacked
  // (9.72 against 2.4).
  // 3.7 rather than 3.0 because 3.0 + 2.4 * 0.3 = 3.72 was the old reach with no followers, and this
  // is a change of what the player is told, not of how far the King can reach.
  // The retinue no longer widens it at all. That term existed so the circle stayed findable with a
  // hundred units standing on it, and 3.7 is already 54% wider than the 2.4 it used to start at, so
  // the job is done by the reach being honest rather than by a second rule on top of it. One number,
  // drawn and tested, is the whole point.
  king: { speed: 7.5, footSpeed: 5.6, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 3.7 },
  // #83: the Queen cannot be hurt. She has no health at all -- nothing in the game takes any off
  // her, because raiders take her by getting hold of her rather than by wearing her down. `seize` is
  // that grip, and the bar over her head shows it the same way round as a health bar: full is safe,
  // empty is gone. Every other bar in the game reads that way and this is not the one to be clever
  // with.
  //
  // `targetWeight` still makes raiders prefer her over the King -- it scales squared distance, so
  // below 1 she looks nearer to them than she is. It now means "they are coming to take her" rather
  // than "they are coming to kill her", which is closer to what that number was always for.
  queen: {
    speed: 7.2, follow: 1.9, targetWeight: 0.55,
    // #106: how near the Keep's WALL she has to be brought before she steps inside.
    //
    // It used to be 3.6 from the Keep's CENTRE, which is `CFG.keep.radius` -- the distance a unit that
    // walks to the Keep under its own steam is held at. She never walks her own paths. She follows the
    // King at `follow` behind him, and collideKeep holds HIM at `keep.half` plus his own 0.5, so the
    // nearest she can ever be is 2.9 + 0.5 + 1.9 = 5.3 from the centre. Driven from sixteen directions
    // after a real rescue: the King floors at 3.40 every time and she floors at 5.30 to 5.40. So 3.6
    // was unreachable from every side of the building, and a Wren taken from a standing Keep could
    // never get back into one -- which also meant raiders stopped attacking the Keep for the rest of
    // the run, because updateEnemies only targets it while she is in it.
    //
    // From the wall rather than the centre because the Keep has already been resized once -- the
    // imported castle is 6.03 x 5.38 where the built one was 3.44 square -- and a rule measured from
    // the centre breaks silently the next time that happens.
    //
    // Measured against the KING rather than against her, which is the second thing the first attempt
    // got wrong. She is glued 1.9 behind him and that offset points wherever he has just come from, so
    // a threshold on her position works from some approaches and not others: at 3.0 measured on her,
    // walking him onto the feed mat put her inside from only 2 of 16 directions. His own gap does not
    // swing about -- and it is his doing anyway. The rule is "the King brought her home".
    //
    // 4.8 is the far edge of the Keep's own mat. The mat sits at `keep.padOffset` and its centre is
    // 2.97 from the wall, but `spend.padRadius` is 1.7 and paying works anywhere on it, so the far
    // corner is 4.67 -- and standing at the door is exactly when she should go in. Nothing else is
    // swallowed: the next nearest mat is the recruit one at 7.34 from the wall.
    doorReach: 4.8,
    // grip: how far past its OWN size a raider still has hold of her. updateEnemy stops an enemy at
    // `e.radius + 0.7`, so 1.2 leaves half a unit of slack for the shoving that goes on when several
    // of them stack up. It has to scale with the enemy rather than be flat: a flat 1.7 was right for
    // a knight (radius 0.5) and quietly excused the boss, which stops 2.9 away and would have stood
    // there all night unable to touch her.
    //
    // grab: seconds for a single raider to take her outright -- measured at 3.42. perExtra: what
    // each further pair of hands adds to that rate; two take her in 2.20s, three in 1.63s, four in
    // 1.28s. slip: 2.00s to get the whole bar back once nobody has her, which is what replaced her
    // regen. shaken: how much of the bar an escort rescue costs, and what is left of "she comes back
    // wounded" now that there are no wounds to come back with.
    //
    // 3.42s is three answers to one raider rather than four. The King fires at 1.2/s for 10, so that
    // is four arrows -- two rank-0 knights; the horn shoves and stuns; and she moves at 7.2 with
    // him, so running works. Two raiders at 2.20s is two and a half arrows, which leaves the horn
    // and the Keep. Higher ranks carry more health, so the arrows stop being an answer first while
    // the horn and a closed door go on working, which is the right way round.
    //
    // perExtra is deliberately not capped. Driving two dozen raiders at him put eight hands on her
    // at once, which takes her in about 0.7s -- but eight raiders standing on the Queen is a rout
    // whatever the number says, and a cap would mean a horde could not take her faster than a pair,
    // which reads wrong. The range that was tuned is one to four, which is where a fight lives.
    seize: { grip: 1.2, grab: 3.4, perExtra: 0.55, slip: 2.0, shaken: 0.45 },
  },
  // Opening: the Queen has been carried off. Find her, clear her captors, and she follows you home.
  // Nobody attacks the King until he takes the Queen back: the raids are the enemy coming to get
  // her, so nothing spawns while she is captive and `firstRaid` is the grace period after the rescue.
  rescue: {
    // #30: the opening has to feel like a rescue. Six guards at Raider strength and a Marauder
    // captain holding her, rather than three bandits who fall over.
    pos: [-30, 9], captors: 6, captorRank: 1, captain: true, captainRank: 2,
    freeRadius: 3.2, aggroRadius: 9, firstRaid: 22,
    penRadius: 3.4, // how far she can drift before the guards push her back
    noticeRadius: 15, // the King is spotted here: guards turn, she calls out
    alert: 1.1, // beat between being spotted and the charge
    queenSpeed: 2.2,
    guardSpeed: 2.6,
    // #16: losing her is a chase, not a lose screen. `escort` raiders carry her toward the map edge
    // at `escortSpeed`; catch them and she is back, shaken, and the Keep pays. `recaptures` times.
    escort: 2,
    escortSpeed: 4.0,
    // #33: losing the Keep with her inside now spends one of these, so a run gets two chances
    recaptures: 2,
    keepCost: 0.4,
  },
  // half is the Keep's footprint from its centre and radius is how close a unit may get: both follow
  // what the model actually measures, so enemies hit its wall rather than standing inside it. The
  // imported castle is 6.03 x 5.38 where the built Keep was 3.44 square, which is the size a keep
  // should be next to a King of 2.3 and an Archery Range of 5.58 -- it was smaller than the hut.
  // padOffset: where the Keep's own pads sit relative to it. The castle stands on the crossroads, so
  // straight out of any face is the middle of a track -- the door faces the south-east corner instead.
  // #125: `repair` is what putting the Keep back up costs, in coin, now that nothing in the game is
  // paid for in anything else. It was 20 coins AND ten stone -- or ten wood below Keep level 4, where
  // stone cannot be mined yet -- so these are those two bills priced at `CFG.materials` rates and
  // added up: 20 + 10 wood at 2 = 40, and 20 + 10 stone at 4 = 60. The same cost, said in the one
  // currency the game has.
  //
  // The step stays where the material it replaces put it. It is not arbitrary now that the material
  // lock is gone: a Keep at level 4 is a Keep whose owner is several times richer than one at level
  // 1, and 60 coins against a 60-coin level is the same weight 40 was against a 20-coin one. What
  // the step must NOT do is keep climbing -- #108 capped the material at stone for exactly that
  // reason, because asking a level-12 King for ten diamond would make a late repair harder than an
  // early one, and the Keep falling is already the punishment.
  keep: { hp: 420, hpPerLevel: 90, radius: 3.6, half: 2.9, materialBonus: 420, padOffset: [-5, 5], repair: 40, repairLate: 60 },

  // The Keep is the base: pay coin into it and each level unlocks more. (It took materials once, which
  // is where `levelCost` comes from and what half the game's copy used to say -- #125.)
  base: {
    maxLevel: 15,
    // Coin to reach the NEXT level, indexed by the current level (level 0 = no keep yet). These are
    // the old material lists priced at CFG.materials rates, then smoothed so a level never costs
    // less than the one before it: the old dips were the material TYPE getting harder, and type no
    // longer means anything now that everything sells for coin.
    levelCost: [null, 20, 36, 48, 60, 88, 112, 144, 185, 230, 285, 350, 430, 530, 660],
    // how many archers / swordsmen the Keep supports at each level (tower crews count as archers)
    archers: [4, 6, 9, 12, 15, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 60],
    swordsmen: [0, 0, 0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30],
    // archery speed multiplier: 1x at level 1, 2x at level 8, 3x at level 15 (archers, towers, the King)
    fireRate: (level) => 1 + (2 * Math.max(0, level - 1)) / 14,
    // Keep level at which every wall becomes wood / stone / iron / diamond, and at which each of
     // those materials becomes mineable. One boundary, so a level-up lands as one big moment.
    wallAt: [1, 4, 8, 12],
    materialAt: { wood: 0, stone: 4, iron: 8, diamond: 12 },
    // #99: what the ground is called when a material opens, in one place. revealNodes says it to the
    // world and levelGains says it on the level-up modal, and they were two strings saying the same
    // thing in slightly different words.
    // each reads as the subject of "... are open", which the diamond one did not: "Diamond in the deep
    // rock are open" is what came out the first time both screens shared this string
    nodeName: { stone: 'Stone quarries', iron: 'Iron seams', diamond: 'Diamond seams in the deep rock' },
    // enemies grow with the Keep too, so a strong base always has a fight on its hands
    enemyHpPerLevel: 0.05,
    enemyDmgPerLevel: 0.04,
    unlocks: { 2: 'Expand Village unlocked', 3: 'Barracks unlocked', 4: 'Stone quarries open', 6: 'Second expansion unlocked', 8: 'Iron seams open', 12: 'Diamond found in the deep rock', 15: 'Max level!' },
  },

  mining: { radius: 2.8, tick: 0.55, regrow: 9 },

  // What each material is worth and what it costs you to get. Coin is the only currency now: the
  // materials are a journey to it, not a second ledger. Harder rock takes longer per swing and pays
  // more per unit, so the far seams are worth the walk without being required for anything -- which
  // is what keeps the map optional rather than gated.
  materials: {
    wood:    { mine: 0.45, coin: 2,  name: 'Wood' },
    straw:   { mine: 0.40, coin: 2,  name: 'Straw' },
    stone:   { mine: 0.70, coin: 4,  name: 'Stone' },
    iron:    { mine: 1.00, coin: 9,  name: 'Iron' },
    diamond: { mine: 1.40, coin: 20, name: 'Diamond' },
  },
  // How much he can carry before he has to walk it back. This is what makes the trade post a place
  // you go rather than a formality, and what gives a trip out to the diamonds something to lose.
  carry: { base: 18, perUpgrade: 8 },
  // #48: the villagers who gather. One moves into each home. They must not out-earn the King at his
  // own job -- he walks at 5.6 and carries 18 -- so they are slower on both halves of the trip and
  // paid at the cheapest rate their trade works. What they are for is the hours he is somewhere else.
  villager: { speed: 2.8, slow: 8, carry: 4, range: 46, flee: 13 },
  // The trade post, once built. Walk into it and whatever you are carrying becomes coin. It is the
  // first thing worth building -- you start with enough coin for it -- because until it stands the
  // heaps you make have nowhere to go.
  // where you stand to sell is the Trade Post's own mat, not a constant here; this is how near it counts
  trade: { radius: 3.0 },
  // Villager homes. The Keep level sets the floor on how big the army can be; every home built raises
  // it from there, which is what makes filling the settlement worth coin rather than only decoration.
  home: { archers: 3, swordsmen: 2 },
  // how close before a pile tells you what is in it, and how close before he picks it up
  pile: { showRadius: 7.0, pickRadius: 1.9 },

  // #125: `buildPerMaterial` currently scores nothing. It is the rate for the materials a pad asks
  // for, and since the Keep repair was priced in coin no pad asks for any -- `pad.res` is empty
  // everywhere, so the term it multiplies is always zero. Left rather than deleted because the
  // resource-payment path it belongs to is still whole and is what any future pad priced in
  // materials would use; said out loud here so nobody measures a balance change against it and
  // wonders why nothing moved. `material: 2` is untouched and still paid for every one mined.
  score: { earlyWavePerSecond: 4, kill: { knight: 10, elite: 25, brute: 20, boss: 200, thief: 40, sapper: 15, archer: 20, shield: 30 }, coin: 1, material: 2, buildPerCoin: 2, buildPerMaterial: 3, soldierPerWave: 2, waveClear: 50, levelUp: 60, rescue: 150, recapture: 90, finale: 1500 },

  // #69: the army FOLLOWS the King rather than orbiting him. Each soldier still gets a slot on a
  // ring -- that is what keeps a hundred of them from standing in each other -- but the slot is a
  // place to head for rather than a point to stand on, and the rings sit behind him rather than
  // around him. Before this they chased an exact coordinate on a carousel that rotated whether or
  // not he moved, at a speed that could always catch him, which is why they looked welded on.
  army: {
    trail: 2.4,   // how far behind the King the formation centre sits while he is moving
    slack: 1.15,  // how near its slot a soldier has to get before it stops walking
    ease: 4.0,    // the distance over which it eases back up to full speed (arrive, not skid)
    rallySlack: 0.3, // the horn gathers them tight: the one moment the formation SHOULD be rigid
    lost: 26,     // how far behind before a soldier counts as stuck and is put back on the King
  },
  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  // watchtowers: level 1 -> 3. Each level adds crew slots and sharpens the tower's arrows.
  turret: { hp: 40 },
  tower: {
    range: 14, fireRate: 0.7, damage: 12,
    levels: [{ slots: 3, damage: 1, range: 1 }, { slots: 5, damage: 1.35, range: 1.15 }, { slots: 7, damage: 1.8, range: 1.3 }],
    upgrade: [{ cost: 30 }, { cost: 60 }],
  },
  gatePost: { height: 1.55 },
  // #19: the raider camp. Raids come from it; the war ends when the King marches on it and kills
  // the Warlord. The march opens at Keep `level`, or on the run's last night, whichever comes first.
  // #58 took the night out of here: it was `night: 30` and there is no longer one answer, because a
  // run is fifteen nights or thirty. `lengths` below owns it, and `game.finaleNight()` is what reads
  // it. `level` stays here and stays 13 at both lengths -- it is a rung on the Keep, not a date.
  // `leash`: how far from the camp the King has to get before the garrison gives up and goes home.
  // Walking away has to be an answer, or an early visit to the camp ends the run (#28).
  finale: { pos: [-4, -74], radius: 9, garrison: 8, wakeRadius: 20, leash: 38, level: 13, chiefHp: 3.2, callEvery: 9, callCount: 3 },

  // #58: two run lengths, because 30 nights at 75 seconds is ~37 minutes and that was the only one on
  // offer -- a very large ask of somebody who opened a web game on a phone and does not yet know
  // whether they like it.
  //
  // What a length changes is exactly two numbers, and that is deliberate. `nights` is when the camp
  // opens on the clock, and `costScale` is what a Keep level costs. Everything else -- the rank gates,
  // the pads' `minLevel`, the wall boundaries, the finale level of 13 -- is untouched, so a short run
  // is the same arc at a faster climb rather than a different game with pieces missing. That is what
  // keeps the ticket's own rule: both lengths reach Marauders, Warlords and the camp. A short mode
  // that stops at level 8 would never meet a Warlord (rank gate 11) and would be a demo.
  //
  // The raid is fought on the long run's clock regardless (`game.raidNight`), so night 15 of a short
  // run is the same size of raid as night 30 of a long one. That is load-bearing for the number
  // below, and it is why a short run is not simply a cheaper run.
  //
  // WHERE 0.45 COMES FROM, and what is still unknown about it.
  //
  // Measured, by summing this table: reaching level 13 costs 1988 coin at full price and 896 at 0.45.
  // Reaching the cap at 15 costs 3178 and 1432. Buying every one-shot pad in `PADS` -- every wall,
  // tower, home, bridge and building -- costs 1567 coin on top, at either length, and the repeatable
  // recruit and crown mats are open-ended above that.
  //
  // The argument: at the same FRACTION of a run both lengths stand at about the same Keep level, so
  // the same materials are open and income per night is about the same. A short run just has half the
  // nights, so it earns about half the coin -- which on its own would say 0.5. What pulls it below is
  // that the 1567 does NOT halve: because the raid runs on the long clock, a short run's last nights
  // want the same army, walls and towers a long run's do, and it has to buy them out of half the
  // income. How far below 0.5 that squeeze reaches depends on how much of a run a given player spends
  // on the village rather than the Keep, which is a choice and not a number this file can hold. 0.45
  // is a deliberately gentle first cut: it is easier to argue a price down after playing than to
  // argue an impossible climb back up.
  //
  // So this is arithmetic plus a stated assumption, NOT a played run, and it is the one number here
  // that wants one. Tried and rejected: driving whole runs headlessly with a scripted player and the
  // renderer stubbed out, to read the Keep level off each night. It does not work in this sandbox --
  // even with `renderer.render` and `drawMinimap` replaced, stepping `update(0.05)` in a loop ran at
  // roughly a sixth of game time, so 900 seconds of wall clock bought two nights and a full run would
  // be hours; and a bot crude enough to write in an afternoon dies around night 2, so its numbers
  // would not have meant much anyway. The measurement that settles this is somebody playing it.
  //
  // Scores are kept per length (`scores.js` stores `len`), because comparing 15 nights against 30 on
  // one board makes the board meaningless.
  lengths: {
    short: { nights: 15, costScale: 0.45, name: 'Short run', sub: '15 nights · about 19 min' },
    long: { nights: 30, costScale: 1, name: 'Long run', sub: '30 nights · about 37 min' },
  },
  // Which one a player who has never chosen gets. Short, because that is the whole point of the
  // ticket: the long run is the thing you graduate to, not the entry fee.
  defaultLength: 'short',
  // #18: the King's one ability. The warhorn pulls the army to him and drives them for a few
  // seconds, and the blast shoves nearby raiders back and stuns them: an answer to a breach.
  horn: { cooldown: 22, duration: 6, radius: 7.5, push: 3.4, stun: 1.3, speed: 1.6, damage: 1.5, rallySpeed: 2.2 },

  // #57: the dash, and the King's second verb. The horn is about the next minute; this is about the
  // next second, which is the thing combat did not have.
  //
  // Measured rather than computed, because the continuous arithmetic (2.8 * 5.6 * 0.3 = 4.7 units)
  // is not what a stepped loop gives -- the interval is half-open, so the last frame falls outside
  // it. Driven at both ends of the frame budget:
  //
  //     60fps (dt 1/60)     18 frames   4.44 units
  //     the dt cap (0.05)    6 frames   3.92 units
  //
  // and against a walk over the same 0.3s, which is the comparison the player actually feels:
  //
  //     on foot     walk 1.68   dash 4.80     (2.9x)
  //     mounted     walk 2.38   dash 6.42     (2.7x)
  //
  // The two situations it is for, and where the numbers come from:
  //
  //   Surrounded. Nothing collides the King with a raider -- `updatePlayer` collides him against
  //   walls, the river and the Keep and nothing else -- so being surrounded is a damage problem
  //   rather than a movement one, and the answer is leaving the ring quickly. 4.44 units is just
  //   inside the warhorn's own 7.5 blast radius: far enough to be out of what he was standing in,
  //   short enough to be a step rather than a teleport.
  //
  //   The thief chase. A thief flees at 8.2 (`enemy.thief.fleeSpeed`) against 5.6 on foot and 7.5
  //   mounted, so without this it is a speed check the King loses on foot and barely wins mounted.
  //   A dash closes (2.8 * 5.6 - 8.2) * 0.3 = 2.2 units, and a thief's run is long enough for two of
  //   them at this cooldown. Two well-spent dashes catch one; two badly spent ones do not, which is
  //   the difference between a skill moment and a speed check.
  //
  // It is a velocity and never a teleport, so every collision the walk answers to still holds.
  // Driven: a dash straight at the Keep stops 3.4 units from its centre, which is exactly where a
  // walk into it stops, and a dash at the map edge ends on the clamp rather than past it.
  //
  // The direction is fixed at the moment it is pressed and does not steer. That is deliberate: a
  // steerable dash is a speed boost, and a committed one is a decision -- including the decision to
  // put it into a wall, where the collision above simply stops him and the cooldown is spent.
  //
  // 4.5s against the horn's 22 because they are different kinds of answer, and a verb the player
  // reaches for twice a minute is not a verb.
  dash: { speed: 2.8, duration: 0.3, cooldown: 4.5 },
  // "Train Archers" pad at the range: each level makes every archer hit harder and tougher
  archerTraining: { damage: 0.25, hp: 0.2 },

  // One currency, and enemies drop more of it the higher their rank.
  // Coins are gold, always. They used to change colour with the Keep (bronze, silver, gold,
  // platinum), which read as four currencies when there is only ever one. What that colour really
  // carried was score: a coin is worth more the higher the Keep stands, so that is kept and keyed to
  // the Keep level directly. `valueAt` are the levels at which a coin starts being worth `value`.
  coins: {
    valueAt: [0, 4, 8, 12],
    value: [1, 3, 8, 20],
    start: 10,
  },

  // Enemy ranks: the colour they wear says how dangerous they are. Each rank multiplies the type's
  // stats and decides which coins drop. A rank joins the raids when the Keep reaches `fromLevel`;
  // waves themselves only add numbers (plus up to `waves.scouts.max` scouts of the next rank).
  ranks: [
    { name: 'Bandit', fromLevel: 0, hp: 1, damage: 1, tunic: 0x9a8663, trim: 0x5b4a33, dark: 0x3d3226, light: 0xe3d7b8, coins: [1, 2] },
    { name: 'Raider', fromLevel: 3, hp: 1.5, damage: 1.35, tunic: 0xd8262c, trim: 0x8d1d22, dark: 0x2a2a30, light: 0xf0cfc4, coins: [2, 3] },
    { name: 'Marauder', fromLevel: 7, hp: 2.3, damage: 1.8, tunic: 0x7a3fd1, trim: 0x3a2263, dark: 0x201533, light: 0xd9c8f5, coins: [3, 5] },
    { name: 'Warlord', fromLevel: 11, hp: 3.6, damage: 2.5, tunic: 0x24232b, trim: 0xf5b800, dark: 0x101014, light: 0x4a4a55, coins: [5, 8] },
  ],

  enemy: {
    knight: { hp: 20, speed: 3.8, damage: 6, attackRate: 1.0, coins: [1, 2], radius: 0.5 },
    elite: { hp: 60, speed: 3.6, damage: 12, attackRate: 1.0, coins: [3, 4], radius: 0.55 },
    brute: { hp: 70, speed: 2.9, damage: 14, attackRate: 1.5, coins: [3, 5], radius: 0.8 },
    boss: { hp: 420, speed: 2.3, damage: 20, attackRate: 2.0, coins: [15, 22], radius: 2.2, aoe: 3.4 },
    // Fast, fragile, and not interested in fighting: it runs at the King, grabs coins off his stack
    // and bolts for the edge of the map. Walls do not stop it; archers do.
    thief: { hp: 26, speed: 6.6, damage: 0, attackRate: 1, coins: [0, 0], radius: 0.45, steal: 0.45, minSteal: 6, fleeSpeed: 8.2 },
    // #17: enemies that break a rule, each unlocked by Keep level (`fromLevel`) so they arrive one idea at a time.
    // Sapper: ignores your army, runs at the nearest wall and blows itself up against it.
    sapper: { hp: 18, speed: 5.2, damage: 10, attackRate: 1, coins: [0, 0], radius: 0.45, blast: 9, fromLevel: 3 },
    // Archer: holds at a range beyond a level-1 watchtower and shoots your soldiers and tower crews.
    archer: { hp: 24, speed: 3.8, damage: 7, attackRate: 0.8, coins: [0, 0], radius: 0.45, range: 15.5, fromLevel: 5 },
    // Shieldbearer: takes a quarter damage from the front. Flank it.
    shield: { hp: 95, speed: 3.0, damage: 12, attackRate: 0.9, coins: [0, 0], radius: 0.6, front: 0.25, fromLevel: 7 },
  },

  // The day / night cycle is the game's metronome: daylight is for gathering and building, the raid
  // comes at nightfall. `length` is one full cycle in seconds and `nightStart` is the point in it the
  // sun goes down, so a day is about 45 seconds and a night about 30: long enough for a round trip to
  // the far mining nodes and back.
  // #73: `holdDawn` is how long, in seconds, the sun will wait at the horizon while any of tonight's
  // raid is still standing. A night should be something you survive rather than something you wait
  // out, and dawn arriving over a Marauder still chewing on the wall said the opposite.
  //
  // It is capped rather than indefinite because plenty can survive without being reachable -- one
  // stuck the wrong side of a river, an archer holding at a range with nothing in range of it, a
  // thief most of the way to the map edge. Held forever, any of those is a run that cannot continue
  // and cannot be ended except by reloading. Forty seconds is long enough that clearing up is the
  // obvious move and short enough that giving up on a straggler is not a punishment.
  cycle: { length: 75, nightStart: 0.6, dawn: 0.98, warn: 8, holdDawn: 40 },

  // #81: weather. It rains now and then, and while it falls the living ground comes back faster --
  // wood and straw, not the rock. Rain refilling a quarry reads as a bug, and keeping the bonus to
  // the two things that actually grow is what makes it a rule a player can guess rather than a
  // number they have to be told. It also lands on the two materials gathered closest to home, which
  // is where the King is likely to be standing when it starts.
  //
  // gap and dur are seconds of game time, drawn uniformly from Math.random rather than the world's
  // seeded rng: the map is meant to be the same every run and the weather is meant not to be. A
  // cycle is `cycle.length` = 75s, so a gap of 150-330s is a shower every two to four days and
  // 26-46s of it is between half a night and a whole one. Both are ranges for the reason the wolf
  // only howls some nights (#32): a shower that arrives on the hour is scenery, not weather.
  // Driven over thirty nights (2250s of game time at the game's own capped dt), ten runs:
  // 8.5 showers a run on average (7-10), 305s of rain (238-372), 13.6% of the run wet (10.6-16.5%).
  //
  // fade: seconds for it to arrive and to clear. Six is long enough that the sky is what you notice
  // first and the drops second, which is the difference between weather and a particle effect; at
  // two it snapped on like a light switch.
  //
  // regrow: what a living node's clock runs at while it rains, scaled by how hard it is falling so a
  // shower carries the bonus in and out with it. THREE, pinned against what a shower is actually
  // worth rather than picked round:
  //   - It has to show. A wood node holds 8 and `mining.regrow` is 9s a unit, so a drained one is
  //     72s from full dry and 24s wet -- and `setNodeLook` scales the tree from 0.45 to 1 across
  //     that, so at x3 a tree emptied when the rain starts is visibly whole again before it stops
  //     (mean shower 36s). At x2 it is 36s, which is the whole shower for half a tree; measured on
  //     the field, a tree drained at the first drop stood at 0.73 of its height when the sky
  //     cleared, and a growth you have to remember the start of is not one you can see.
  //   - It must not be worth farming. A King parked between two home wood nodes is regrow-limited,
  //     not swing-limited (0.45s a swing against 4.5s a unit), so camping them is the most rain can
  //     ever pay. Driven for a full thirty nights with the rain schedule above: 543 units dry, 691
  //     wet -- 148 units, 296 coin over the whole run. A maxed Keep costs 3538 coin, so the best
  //     case is 8% of one, for thirty-seven minutes of standing in one place ignoring the raids.
  //     Played rather than farmed it is far less: the King empties an 8-node in 3.6s and carries 18.
  //   - x4 was tried and rejected. It refills a node in 18s, which is faster than the King can walk
  //     between the two he is working, so the rain stops being a bonus on gathering and becomes a
  //     reason not to move -- and a tree that springs back inside a swing looks broken rather than
  //     watered.
  rain: { gap: [150, 330], dur: [26, 46], fade: 6, regrow: 3, feeds: ['wood', 'straw'] },

  waves: {
    hpGrowthPerWave: 0.04, // ranks (CFG.ranks) and Keep level (CFG.base) carry most of the scaling now
    dmgGrowthPerWave: 0.03,
    bossEvery: 5,
    stagger: 0.35,
    // a wave is mostly the current rank plus some lower ranks; from wave `from` on, 0-`max` scouts of
    // the NEXT rank sneak in as a taste of what levelling the Keep brings
    scouts: { from: 5, max: 2 },
    // #35: thieves come for the King while he is actually carrying something worth taking. This used
    // to be judged once, as the night's wave was built, against coins in hand at that instant, and a
    // player who spends what he picks up is holding almost nothing then: thieves never came at all.
    // `every` is how often, in seconds, the game asks whether one should set out.
    thieves: { fromWave: 2, minCoins: 12, chance: 0.5, max: 2, warn: 4, every: 16 },
    // enemy types also wait for the Keep (with a late wave fallback so a stalled game still varies)
    bruteAt: { level: 2, wave: 10 },
    eliteAt: { level: 5, wave: 18 },
    // #49: nights per level of the floor under the raid's difficulty.
    //
    // Rank is the biggest multiplier in the game -- a Warlord has 3.6x a Bandit's health -- and it
    // used to be chosen from the Keep level and nothing else. The Keep is levelled only when the
    // player decides to carry materials to it, so that made the difficulty a dial they operated
    // themselves, and the best move was to leave it alone: stall at Keep 6 and Marauders and
    // Warlords never come, while the army, the towers and the walls all keep growing. The same gate
    // held back the sappers, the enemy archers and the shieldbearers, so turtling also skipped the
    // three most interesting enemies in the game.
    //
    // The raid now reads `max(keep level, night / rankFloor)`. Feeding the Keep is how you keep UP
    // with the raids rather than how you summon them. Brutes and elites have had a fallback like
    // this all along (`bruteAt`, `eliteAt` above); this is the same idea for everything else.
    //
    // 2.6 is pinned at both ends. Below it, the floor starts overtaking honest play; above 2.72 the
    // Warlords (rank 3, from level 11) never arrive at all before night 30, and a turtling run would
    // still finish without meeting them. 2.6 puts them on night 29, just inside the finale.
    //
    // Checked against three play styles, counting nights where the floor changes what actually
    // spawns rather than nights where it merely raises a number:
    //
    //     steady    (Keep 13 by night 30)    0 of 30 nights     <- the floor is invisible
    //     slow      (Keep 13 by night 40)   10 of 30
    //     very slow (Keep  8 by night 30)   20 of 30
    //
    // So a player levelling at the pace the finale expects never sees this at all, and it leans on
    // someone well behind that pace. Whether it should lean that hard on a player who is struggling
    // rather than stalling is the open question, and it is this one number: raise it and the game
    // is gentler on a slow run but a turtling one meets less; lower it and the reverse.
    rankFloor: 2.6,
  },

  regen: { delay: 4, perSecond: 3 },
  // #46: how the King shows a hit. A square wave rather than a fade, because a flicker reads as a
  // blow landing and a fade reads as a condition he is in.
  hurtFlash: { time: 0.34, blink: 0.08, amount: 0.85, colour: 0xff2a1e },

  // pads only take payment once you STOP on them (or hold for a moment), so walking past costs nothing
  // showRadius: how close before a build mat fades up out of the grass. The field reads better with
  // them hidden, but a mat nobody can see is a thing nobody builds, so a pad that has only just
  // appeared shows itself for showNew seconds wherever you are.
  // #122: `bought` is how long a repeatable mat refuses payment after it has just paid out. It is NOT
  // `arm`, and reusing `arm` for it was the bug: `arm` answers "how long before walking across a mat
  // counts as stopping on it", and 0.25s is right for that and far too short for "how long after a
  // purchase before we start taking money again".
  //
  // Measured on the recruit mat, King standing still, driving updateCoins + updatePads at 1/60.
  // Before: the replacement mat took the next coin 0.25s after the purchase landed and completed the
  // next batch 0.73s after it (then 0.80, 0.85, 0.90 -- the gap grows because `padCost` is
  // `cost + growth * buyCount`, so the accident always costs more than the purchase did). After:
  // 0.98s to the next coin, 1.37s to the next batch (then 1.40, 1.43, 1.47).
  //
  // The completion moved 0.63s, not the full 1.0, and that is right rather than a miss: `holdT` goes
  // on accruing through the hold, so the pour does not start over at `tick` when the hold lifts -- the
  // rate is lerped on `holdT / 1.5`, which at 1.0s is two thirds of the way to `fastTick`. A player
  // who MEANT to buy five batches back to back pays 2.4s for the whole run of them, and one who did
  // not wanted nothing at all.
  //
  // Pinned at the end that is still there. It used to be pinned at both: the floor was the length of
  // `audio.build()`, a 0.64s fanfare, on the grounds that a mat must not take money while the player
  // is still hearing the last purchase. #130 removed that sound, so that floor is gone with it and
  // this number now rests on the other end alone -- five batches back to back cost 2.4s more than
  // they used to, which is what a deliberate buyer pays for the protection, and it is nothing.
  // The purchase is not silent without the fanfare: `audio.ching()` runs per coin the whole way in,
  // so 1.0s still lands well clear of the sound of paying.
  //
  // The fixture trap, since the first set of numbers here was wrong because of it: the recruit mat
  // stands in the Archery Range mat's exact `pos`, so forcing `built.range` without taking the range
  // mat off the board leaves both under the King -- and `updatePads` pays every mat he is inside out
  // of one shared `spendTimer`. Everything measured that way is slow, and the range's own `toast` is
  // what hides the mat's tip.
  //
  // Every repeatable mat gets it. Three reach it with the game still running -- `recruit`,
  // `recruit-sword` and `recruit-vet` -- and those are exactly the mats a player stands on
  // repeatedly. `train`, `crown` and the feed mat put a panel up that pauses the game, which shields
  // them only while it is open: they all take coin, and the King is still standing on the mat when it
  // closes, so the hold is what covers the far side. The feed mat is the one that matters most there
  // -- see `addPad`, where it went 1 -> 4 in 5.3 seconds.
  spend: { tick: 0.07, fastTick: 0.022, crewTick: 0.28, padRadius: 1.7, arm: 0.25, bought: 1.0, walkHold: 0.8, showRadius: 10, showNew: 7 },

  // #55: the Walk clip plays at the speed its owner is actually moving.
  //
  // Every character shared one cycle at one rate. The speeds in this file run from the boss's 2.3 to
  // an army archer's 9.0 -- 3.9x apart -- so most of the field was either moonwalking (feet too slow
  // for the ground going past) or paddling. The stride length is baked into the clip, so the rate
  // that stops the feet sliding is speed / the speed it was baked for, and nothing else.
  //
  // `refSpeed` is that baked speed. 3.8 is the knight, which is both the median of the enemy table and
  // the character there are seventy of on a bad night -- so the commonest thing on screen plays at
  // exactly 1.0 and looks the way it always did. Everything else moves relative to it.
  //
  // Clamped at both ends because linear is only right in the middle. Below 0.55 a walk stops reading
  // as walking and becomes a mime; above 1.9 the legs blur and it reads as a bug rather than as
  // speed. The boss lands on the floor (2.3/3.8 = 0.61) and the army archer on the ceiling
  // (9.0/3.8 = 2.37 -> 1.9), which is the right way round: the extremes are the two the eye is least
  // often on.
  walkAnim: { refSpeed: 3.8, min: 0.55, max: 1.9 },

  // #95/#97: how a notice is read out.
  // `lines` is the cap: past three, the rest becomes another page behind a bobbing arrow. Three is
  // what fits over the world at phone width without the notice becoming the screen.
  // `letterMs` is the typing speed. 18ms is about 55 characters a second -- quick enough to read as
  // speech rather than as a stutter, and slow enough to see. A full three-line page at phone width is
  // around 115 characters, so the reveal costs ~2.1s of a hold that is 7s at that length.
  // `readBase` + `readPerChar` is the hold AFTER the typing finishes, capped by `readMax`. It used to
  // start when the notice appeared, which meant a long one spent a third of its life still arriving.
  notice: { lines: 3, letterMs: 18, readBase: 1400, readPerChar: 55, readMax: 7000 },

  arrow: { speed: 30, life: 2.0 },

  // #104: Wren's voice. `gap` is the least game time between two of her cries, on top of the alarm's
  // own six-second cooldown that they already sit inside. Fourteen because seven alarms can be raised
  // and some of them repeat -- thieves, tower crews -- and a character who cries out at every one of
  // them stops being a character and becomes wallpaper in about a minute.
  voice: { gap: 14 },

  // Wall materials, in upgrade order. Named for what you actually mine, so "stone walls" means the
  // walls are made of the stone you carried to the Keep.
  // Imported buildings are generated in one material (the Archery Range is a log cabin), so until
  // there is a generated version per village material they are recoloured to follow the walls.
  // Wood is the art as it came; the rest push its hue over while keeping its own light and shade.
  // Each colour is that material's own wall from MATERIALS, so an imported building agrees with the
  // walls and the Keep standing around it rather than being a fourth guess at "stone".
  structureTint: {
    wood: null,
    stone: { color: 0x9aa0a8, amount: 0.8 },
    iron: { color: 0x5b626c, amount: 0.85 },
    diamond: { color: 0xbde6f2, amount: 0.8 },
  },
  wallLevels: [
    { name: 'Wood', hp: 140, gateHp: 220, repair: 6 },
    { name: 'Stone', hp: 360, gateHp: 520, repair: 12 },
    { name: 'Iron', hp: 820, gateHp: 1150, repair: 22 },
    { name: 'Diamond', hp: 1800, gateHp: 2500, repair: 38 },
  ],
};

// The map: a river (centreline control points), roads (spline control points) and where they meet.
// Roads that cross the river get a bridge at the crossing; bridges are the only way over.
export const MAP = {
  river: {
    points: [[30, -96], [44, -70], [52, -40], [55, -12], [52, 12], [44, 32], [26, 46], [4, 50], [-18, 54], [-40, 62], [-70, 72], [-96, 82]],
    halfWidth: 3.6, // water half-width (the sandy bank extends another ~1.2)
    bridgeRadius: 6.5, // no river collision this close to a bridge centre
  },
  roads: [
    // Two roads crossing under the castle, kept as four entries because each half is revealed by a
    // different wall. Every one starts at the origin and is drawn full width there (taper: 'end'),
    // so north meets south and east meets west as one straight track through a crossroads rather
    // than four tapered stubs converging on a point.
    { id: 'south', points: [[0, 0], [0, 14], [0, 24], [0, 36], [1, 49], [3, 62], [12, 80], [22, 96]] },
    { id: 'east', points: [[0, 0], [14, 0], [24, 0], [38, 0], [53, 3], [66, 0], [80, -14], [96, -30]] },
    { id: 'west', points: [[0, 0], [-14, 0], [-24, 0], [-38, 0], [-50, 6], [-64, 2], [-80, -10], [-96, -20]] },
    { id: 'north', points: [[0, 0], [0, -14], [0, -24], [0, -38], [2, -52], [8, -68], [16, -82], [22, -96]] },
  ],
  roadWidth: 4.2,
  // half-width of the sandy shoulder: nothing in the village may stand inside this of a road
  roadClear: 2.8,
  fields: [{ pos: [45, -6], size: [10, 7] }, { pos: [-20, 38], size: [8, 6] }, { pos: [14, 62], size: [10, 8] },
    // the settlement's own farmland: the west strip between the citadel and the town wall, which is
    // the widest open ground inside the walls now that the citadel holds the buildings
    { pos: [-24, 12], size: [9, 7] }, { pos: [-24, 20], size: [8, 5] }],
};

// Village tiers. The village starts as tier 0 and each "Expand Village" pad moves it up one.
// Walls are generated around `bounds`; `gates` lists the gap on each side (along that side's axis).
// Two shapes, as the plan has them. The first wall is a ring: the citadel, tight around the castle
// with the four central towers inside it. Everything after that is a rectangle thrown round the
// whole settlement -- farmland, workshops, homes and all. `bounds` is the ring's bounding box in the
// first case and the wall itself in the others; the fog, the raid spawner and the scenery placer all
// want a rectangle either way. Every wall has a gate on each of the four sides.
const ring = (x, z, r, sectionLen, gateWidth = 6.2) => ({
  ring: { x, z, r },
  bounds: { x0: x - r, x1: x + r, z0: z - r, z1: z + r },
  sectionLen,
  gateWidth,
});
const box = (x0, x1, z0, z1, sectionLen) => ({
  bounds: { x0, x1, z0, z1 },
  gates: { north: [-3.1, 3.1], south: [-3.1, 3.1], east: [-3.1, 3.1], west: [-3.1, 3.1] },
  sectionLen,
});
// The citadel is sized to hold the castle and the three buildings that serve it -- the Archery Range,
// the Barracks and the Trade Post, one to a quarter between the roads -- which is what it is for.
// Every wall's gates sit where its sides cross an axis, so each one has to land on a straight run of
// road: the tracks run dead straight to 38 east and west and 36 north and south, and no wall goes
// past that. The outer wall also stays clear of the north-west mesas, whose box starts at z -33.
export const TIERS = [
  ring(0, 0, 19, 4.6),
  box(-30, 30, -26, 26, 4.8),
  box(-38, 38, -32, 32, 5.2),
];

// Build pads. `requires` are ids that must have been built at least once; `minLevel` is the Keep level
// a pad needs before it appears. cost = coins; crew = archers taken from your army instead of coins.
// Everything costs coin. Materials are mined, piled, carried and sold at the trade post; what comes
// back is coin, and coin is the only thing a pad ever asks for. `desc` is shown on the info screen.
// `buildAt` is where a structure appears; its pad sits right in front of it (pads for units spawn on the
// pad). Watchtowers stand in the fort's corners: their pad turns into "man the tower" and then "upgrade"
// pads on the same spot. Gate Guards get small posts beside each gate.
const T = (id, tier, pos, cost, buildAt) => ({ id, tier, pos, cost, icon: 'tower', label: 'Watchtower', structure: 'tower', buildAt, desc: 'Corner watchtower. Man it with archers, then upgrade it for more crew and sharper arrows.', toast: 'Watchtower built. It needs a crew!' });
// Villager homes. They are separate pads rather than one repeatable pad because each one stands in
// its own place: a repeatable pad builds at the same spot every time, and a village is the one thing
// that has to spread. Each needs the one before it, so only one home mat is ever on the field.
const HOME = (n, pos, cost, buildAt, requires) => ({
  id: `home-${n}`, tier: 1, pos, cost, icon: 'home', label: 'Villager Home', structure: 'house', buildAt, requires,
  desc: `A family moves in. Every home raises the army limit by ${CFG.home.archers} archers and ${CFG.home.swordsmen} swordsmen, on top of whatever your level allows.`,
  toast: 'A family moves in. Room for more soldiers.',
});
const W = (id, tier, pos, cost, side, label) => ({ id, tier, pos, cost, icon: 'wall', label, requires: [tier === 1 ? 'expand1' : 'expand2'], wall: { tier, side }, desc: 'Walls this side of the new plot. Raiders must break through.' });
export const PADS = [
  // ---- tier 0: the starting plot (28 x 22) ----
  { id: 'exchange', tier: 0, pos: [9.8, -6], cost: 8, afterRescue: true, icon: 'gold', label: 'Trade Post', structure: 'bank', buildAt: [9.8, -9.8], desc: 'Sell what you have mined. Until it stands there is nowhere to turn a heap into coin.', toast: 'Trade Post built! Bring your bag here to sell.' },
  { id: 'range', tier: 0, pos: [-9.8, -5.4], cost: 5, icon: 'bow', label: 'Archery Range', structure: 'hut', buildAt: [-9.8, -9.8], desc: 'Lets you recruit archers.', toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', tier: 0, pos: [-9.8, -5.4], cost: 5, growth: 1, icon: 'archer', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 }, desc: 'Two archers join the King. Your level caps how many you can have.' },
  // #107/#105: no percentage, and the mat says where the five levels get to rather than only what one
  // of them adds. "+25% damage per level" is a delta the player has to compound five times in his
  // head against an archer's damage, which is on no screen; `archerTraining` is additive, so the
  // fifth buy leaves an archer on exactly twice the health and 2.25x the damage, and those are round
  // enough to say out loud. The pad already counts itself ("2 of 5"), so "all five levels" is a state
  // the player can see he is walking towards.
  { id: 'train', tier: 0, pos: [-13.8, -5.4], cost: 12, growth: 8, maxBuys: 5, icon: 'arrows', label: 'Train Archers', requires: ['recruit'], repeatable: true, effect: 'archerPower', desc: 'Every archer, now and later, hits harder and stands longer. All five levels: twice the health, better than twice the damage.', toast: 'Archers trained: they all hit harder and stand longer.' },
  { id: 'keep', tier: 0, pos: [-5, 5], cost: 25, icon: 'keep', label: 'Royal Keep', requires: ['range'], structure: 'keep', buildAt: [0, 0], desc: 'A door for Wren, and the heart of the village. Pay coin into it to level up your whole kingdom.', toast: 'Wren has a door at last. Pay coin into it to level up!' },
  // The citadel's towers stand on the ring itself, on its four diagonals -- a round wall has no
  // corners, and its gateways are taken by the roads. Their pads sit in the half of each quarter the
  // Keep's own pads leave free, which is what keeps both clear of the crossroads.
  { ...T('tower-0-ne', 0, [8.6, -13.6], 20, [13.44, -13.44]), requires: ['recruit'] },
  { ...T('tower-0-nw', 0, [-7.6, -14.2], 20, [-11.73, -14.95]), requires: ['recruit'] },
  { ...T('tower-0-se', 0, [15.2, 5.6], 20, [14.95, 11.73]), requires: ['recruit'] },
  { ...T('tower-0-sw', 0, [-10, 12.4], 20, [-13.44, 13.44]), requires: ['recruit'] },
  { id: 'palisade', tier: 0, pos: [-5, 9], cost: 20, icon: 'wall', label: 'Palisade', requires: ['recruit'], wall: { tier: 0, side: 'all' }, desc: 'A wooden wall around the plot with two gates. Upgrades to brick, stone and iron as you level up.', toast: 'Palisade raised. Raiders must break through!' },
  { id: 'crew-gates1', tier: 0, pos: [5, -5], crew: 4, icon: 'shield', label: 'Gate Guards', requires: ['palisade'], posts: true, postTier: 0, desc: 'Four archers take posts beside the gates.', toast: 'Archers now watch the gates from their posts.' },
  { id: 'expand1', tier: 0, pos: [-5, 21], cost: 60, minLevel: 2, icon: 'expand', label: 'Expand Village', requires: ['palisade', 'keep'], effect: 'expand', desc: 'Grows the village onto a bigger plot with new pads, towers and the barracks.', toast: 'The village grows! Wall the new ground.' },
  { id: 'stable', tier: 0, pos: [-21, 5], cost: 25, icon: 'horse', label: 'Warhorse', requires: ['keep'], effect: 'horse', desc: 'The King rides: much faster around the map.', toast: 'The King rides! Much faster now.' },
  { id: 'bridge-south', tier: 0, pos: [6, 44], cost: 30, icon: 'bridge', label: 'South Bridge', requires: ['palisade'], bridge: 'south', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },
  { id: 'bridge-east', tier: 0, pos: [47, 7], cost: 30, icon: 'bridge', label: 'East Bridge', requires: ['palisade'], bridge: 'east', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },

  // ---- tier 1 ----
  W('wall2-south', 1, [-16, 21], 25, 'south', 'South Wall'),
  W('wall2-east', 1, [22, -4.8], 25, 'east', 'East Wall'),
  W('wall2-west', 1, [-23, -10], 25, 'west', 'West Wall'),
  W('wall2-north', 1, [6, -22], 25, 'north', 'North Wall'),
  { id: 'crew-gates2', tier: 1, pos: [21, 5], crew: 6, icon: 'shield', label: 'Gate Guards', requires: ['wall2-south', 'wall2-east', 'wall2-west'], posts: true, postTier: 1, desc: 'Six archers take posts beside the new gates.', toast: 'Archers now watch the new gates.' },
  { ...T('tower-1-nw', 1, [-26.2, -22.2], 25, [-30, -26]), requires: ['expand1'] },
  { ...T('tower-1-ne', 1, [25.2, -24], 25, [30, -26]), requires: ['expand1'] },
  { ...T('tower-1-sw', 1, [-26.2, 22.2], 25, [-30, 26]), requires: ['expand1'] },
  { ...T('tower-1-se', 1, [25.2, 24], 25, [30, 26]), requires: ['expand1'] },
  { id: 'barracks', tier: 1, pos: [5.2, 15.4], cost: 40, minLevel: 3, icon: 'swords', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [9.2, 9.2], desc: 'Lets you recruit swordsmen.', toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [5.2, 15.4], cost: 8, growth: 2, icon: 'swordsman', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 }, desc: 'Two swordsmen: tough melee fighters who charge whatever comes near the King.' },
  { id: 'crown', tier: 1, pos: [-12, -21], cost: 35, growth: 25, maxBuys: 3, icon: 'crown', label: 'Royal Guard', requires: ['expand1'], repeatable: true, effect: 'kinghp', desc: 'King max HP +80 and a full heal.', toast: 'King max HP +80 and fully healed' },
  // #47: the village street. Two rows of three, evenly spaced and facing the east road, mirrored
  // across it -- built out from the citadel, so the street fills in from the near end as it grows.
  // They stand off the road further than a street normally would because the citadel decides it: a
  // home and the mat in front of it need about nine units of depth, and the strip between the ring
  // and the town wall is seven, so the rows sit where the ring has curved out of the way.
  { ...HOME(1, [16.6, 16], 30, [16.6, 20], ['expand1']), minLevel: 3 },
  HOME(2, [16.6, -16], 45, [16.6, -20], ['home-1']),
  HOME(3, [21.9, 16], 62, [21.9, 20], ['home-2']),
  HOME(4, [21.9, -16], 82, [21.9, -20], ['home-3']),
  HOME(5, [27.2, 16], 105, [27.2, 20], ['home-4']),
  HOME(6, [27.2, -16], 130, [27.2, -20], ['home-5']),
  { id: 'expand2', tier: 1, pos: [5, 21], cost: 150, minLevel: 6, icon: 'expand', label: 'Expand Village', requires: ['wall2-south', 'wall2-east', 'wall2-west', 'wall2-north', 'crew-gates2'], effect: 'expand', desc: 'The biggest plot: outer walls, four more towers and veteran archers.', toast: 'The kingdom grows again!' },

  // ---- tier 2 ----
  W('wall3-south', 2, [-6, 29], 50, 'south', 'South Wall'),
  W('wall3-east', 2, [34, 10], 50, 'east', 'East Wall'),
  W('wall3-west', 2, [-34, 10], 50, 'west', 'West Wall'),
  W('wall3-north', 2, [10, -29], 50, 'north', 'North Wall'),
  { id: 'crew-gates3', tier: 2, pos: [12, 29], crew: 8, icon: 'shield', label: 'Gate Guards', requires: ['wall3-south', 'wall3-east', 'wall3-west', 'wall3-north'], posts: true, postTier: 2, desc: 'Eight archers take posts beside the outer gates.', toast: 'Archers now watch the outer gates.' },
  // The outer wall's towers: one on each corner, and one beside each gateway, which is where the
  // roads bring raiders in. The four inside the citadel and the four on tier 1's corners stay as
  // they are -- these are the last ring, and the only one with a tower at every way in.
  { ...T('tower-2-nw', 2, [-34.2, -28.2], 30, [-38, -32]), requires: ['expand2'] },
  { ...T('tower-2-ne', 2, [34.2, -28.2], 30, [38, -32]), requires: ['expand2'] },
  { ...T('tower-2-sw', 2, [-34.2, 28.2], 30, [-38, 32]), requires: ['expand2'] },
  { ...T('tower-2-se', 2, [34.2, 28.2], 30, [38, 32]), requires: ['expand2'] },
  { ...T('tower-2-gs', 2, [4.8, 28.2], 30, [4.8, 32]), requires: ['expand2'] },
  { ...T('tower-2-gn', 2, [-4.8, -28.2], 30, [-4.8, -32]), requires: ['expand2'] },
  { ...T('tower-2-ge', 2, [34.2, -4.8], 30, [38, -4.8]), requires: ['expand2'] },
  { ...T('tower-2-gw', 2, [-34.2, -4.8], 30, [-38, -4.8]), requires: ['expand2'] },
  { id: 'recruit-vet', tier: 2, pos: [-34, -10], cost: 30, growth: 10, icon: 'archer', label: '+3 Veteran Archers', requires: ['expand2'], repeatable: true, units: { type: 'archer', count: 3, veteran: true }, desc: 'Three veteran archers in gold: one and a half times a normal archer.' },
];

// Resource nodes the King mines by standing next to them. `stock` regrows over time. A node only
// appears once the Keep can use its material (CFG.base.materialAt), so each level-up opens new ground.
export const NODES = [
  // wood: close to home, available immediately
  { type: 'wood', pos: [-11, 22], stock: 8 }, { type: 'wood', pos: [-16.5, 14.5], stock: 8 }, { type: 'wood', pos: [-13, 18], stock: 8 }, { type: 'wood', pos: [-15, 17.5], stock: 8 },
  { type: 'wood', pos: [-15, -15], stock: 8 }, { type: 'wood', pos: [-18, -17], stock: 8 }, { type: 'wood', pos: [-14.5, -18.5], stock: 8 },
  { type: 'wood', pos: [-44, 28], stock: 10 }, { type: 'wood', pos: [-47, 31], stock: 10 }, { type: 'wood', pos: [-42, 32], stock: 10 },
  // straw: the light binder, needed in small amounts all the way up
  { type: 'straw', pos: [45, -6], stock: 16 }, { type: 'straw', pos: [-24, 12], stock: 14 }, { type: 'straw', pos: [14, 62], stock: 20 },
  { type: 'straw', pos: [-20, 38], stock: 10 }, { type: 'straw', pos: [-24, 20], stock: 6 },
  // stone: a walk out to the quarries
  { type: 'stone', pos: [-8, -23], stock: 14 }, { type: 'stone', pos: [-26, -29], stock: 16 }, { type: 'stone', pos: [-40, -20], stock: 16 },
  { type: 'stone', pos: [66, 12], stock: 24 }, { type: 'stone', pos: [24, 66], stock: 24 },
  // iron: a seam along the foot of the north-west mesas. Keep these OUTSIDE the cliff box
  // (x < CFG.cliffs.x AND z < CFG.cliffs.z), which the King is pushed out of and cannot mine in.
  { type: 'iron', pos: [-20, -30], stock: 14 }, { type: 'iron', pos: [-28, -29], stock: 14 }, { type: 'iron', pos: [-36, -28], stock: 16 },
  { type: 'iron', pos: [-46, -27], stock: 18 }, { type: 'iron', pos: [-10, -42], stock: 18 },
  // diamond: the deep rock, far out and across the river
  { type: 'diamond', pos: [72, 30], stock: 14 }, { type: 'diamond', pos: [78, 20], stock: 14 },
  { type: 'diamond', pos: [40, 64], stock: 16 }, { type: 'diamond', pos: [30, 74], stock: 16 },
];
