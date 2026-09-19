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
    // #181: how fast the point she follows may swing round him (radians a second), how close he may
    // get before she steps aside, and how far off straight-out that step leans.
    //
    // Driven at a fixed 0.05 dt with the renderer stubbed, four scenes, closest approach in each:
    //
    //                       he spins 180   spins and walks   ordinary play   random jinking
    //   before #181              0.59            0.04            0.15             0.06
    //   the anchor alone         1.90            0.21            0.43             0.27
    //   all three                1.90            1.00            0.99             0.94
    //
    // THE ANCHOR IS THE FIX and the two columns say so: a spin on the spot goes from walking through
    // the middle of him to never coming closer than the follow distance at all. What it cannot fix is
    // the second column -- he turns round AND WALKS, so the place he is walking to is the place she is
    // standing, and no choice of target helps with being walked at.
    //
    // `kingGap` is two things, and the second one was nearly missed. It is the distance `collideKing`
    // holds, and it is also the radius `steerRoundKing` aims past -- and WITHOUT THE STEERING the
    // hold alone is a trap: the opening leaves her in front of a standing King, so the follow pulled
    // her in while the hold pushed her out and she sat dead in front of him at exactly this figure
    // for twenty seconds of game time, never getting round. Aiming at the tangent instead fixes that
    // in about a second and does most of the work everywhere else too: the hold now fires on 4% of
    // frames in ordinary play against 7% before it, and random jinking went 0.83 to 0.94.
    //
    // `followTurn` 3.0 swings her round a 180 in about a second and settles in 0.25s. Faster is
    // worse, not better: at 3.8 she cannot keep up with her own anchor and starts cutting the chord
    // again (jitter 0.69), which is the original bug at a smaller size. Slower reads as a lag and
    // 2.4 drops random jinking to 0.79, under what `queen-visible` asserts.
    //
    // `kingSide` 0.4 is about 22 degrees off straight-out, and the ceiling here is arithmetic rather
    // than taste: she walks 7.2 and he walks 5.6, so a step at angle t from straight-out gains
    // 7.2*cos(t) - 5.6 a second and goes NEGATIVE past 39 degrees. The first version leaned about 76
    // degrees -- almost pure sidestep, which looked right and measured 0.39, because a sidestep does
    // not open a gap at all while he is closing it.
    followTurn: 3.0, kingGap: 1.0, kingSide: 0.4,
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
  // #152: the opening is a SNATCH, not a pen. She starts beside him in the daylight, they come for
  // her, and the player watches it happen instead of arriving after it.
  //
  // `calm` is the minute before. Nothing spawns, the sun does not move, and she walks a step behind
  // him -- because you cannot feel a loss if you never had the thing, and the old opening began with
  // her already gone and a toast explaining it.
  //
  // THEY DO NOT TARGET THE KING. That is the whole of the twist, planted as behaviour rather than as
  // a line of dialogue twenty nights later: they walk past him, around him, through his archers, and
  // go to her. `docs/story.md` turns on the raiders being collectors sent to fetch her, and this is
  // what a collector looks like. It also means he cannot die in a beat he is scripted to lose, so
  // nothing has to protect him specially.
  //
  // `rank` is high on purpose. The loss has to be arithmetic the player can see -- no army yet
  // against four men two ranks above night one -- rather than a footrace he was too slow for. Nobody
  // who loses this thinks he was slow; he thinks he needs soldiers, which is the next half hour.
  opening: {
    // Long enough to walk the whole plot and look at it. 14 was the first guess and played short --
    // "the kingdom could stay up a while longer... so that the player can enjoy the scene and have a
    // look around" -- and the scene is doing three jobs at once (it is the premise, it is the tutorial
    // and it is the twist), none of which land if it is over before the player has turned round.
    //
    // 30 is about two laps of the tier-0 plot at `footSpeed` with stops. It is a lot of seconds to
    // spend on a run you have played before, which is what `?tour` below is partly for and what a way
    // to cut it short would be for -- see the note there.
    calm: 30,          // seconds of quiet before they come
    from: [0, -44],    // they walk in from the north, which is where the camp is
    spread: 7,         // how wide they come in
    collectors: 4,
    rank: 2,
    captain: true,
    captainRank: 3,
    // ABOVE `king.footSpeed` (5.6), and this is not a difficulty number -- it is what stops the
    // opening from having a hole in it. A knight moves at 3.8 and she follows him at his own pace, so
    // a player who simply walks away is never caught: the snatch never lands, the day clock never
    // starts (it is held until `snatched`), and the run sits in its first minute for ever.
    //
    // 6.2 rather than something enormous. It has to beat him on foot and it must not look like a
    // different kind of creature; the mounted King does 7.5, so a horse would still outrun them --
    // which is fine, because by the time anyone has a horse this beat is twenty minutes past.
    speed: 6.2,
    // #152: WHERE THEY ARE TAKING HER. The camp's outer guard post, not the edge of the map -- the
    // edge is still where a mid-run recapture runs to, because that one is a loss and this one is the
    // premise. They carry her back up the road they walked in on and hand her over there.
    //
    // [0, -36] is the end of the north road. The tracks run dead straight to 36 north and stop, which
    // is exactly where a picket belongs: the last place the kingdom's own road reaches. It also puts
    // it 14 clear of the north-west mesas (`cliffs`, x < -14 and z < -33), which nothing walks in.
    //
    // AND 38.2 FROM THE CAMP, which is the number that actually pins it. `finale.wakeRadius` is 20,
    // so a picket any further north stands the whole garrison up in minute three of a first run --
    // eight raiders at top rank and the chief, against one man with no walls. The camp is meant to be
    // SEEN from here and not reached; it is a promise made in minute five and paid at night 30.
    picket: [0, -36],
    // The escort carries her at the collectors' speed rather than `rescue.escortSpeed` (4.0), and
    // this is the same hole slice 1 found rather than a difficulty choice. At 4.0 the King closes at
    // 1.6/s from a standing start beside her, so he catches them in about two seconds and the picket
    // is never seen -- the whole of this beat would be unreachable code. At 6.2 they make it, which
    // is what the story asks for: the opening is meant to be lost. He can still shoot them off her on
    // the way, which is the branch that survives -- he falls back about 0.6/s, so they stay inside
    // his bow for the length of the chase.
    escortSpeed: 6.2,
    // WHAT THE KINGDOM IS, on the morning it ends. The STARTING plot, finished: walls, the Keep, the
    // three service buildings, four manned towers. Level 5, so the walls are stone and the Keep is
    // well up, but not the whole thirty-night arc.
    //
    // TIER 1 WAS TRIED FIRST AND MEASURED OVER BUDGET. Including the expansions pulled `expand2` in
    // too (it is a tier-1 pad), so the morning was a two-ring city: 17 buildings, 72 wall sections, 8
    // towers, 24 crew -- and 1097k triangles against the README's 1M, at 334 draw calls against 400.
    // The probe does not assert either without `--crowd`, so it would have gone out quietly.
    //
    // Tier 0 also reads better, which is the part worth keeping. The plot he rebuilds is this plot,
    // so showing him exactly it, finished, is a sharper promise than a sprawl he never gets back to.
    tier: 0,
    level: 5,
    skip: ['stable'],              // the horse is the player's to earn (and the Stable is tier 1 now, #82)
    // THE PEOPLE, placed by hand inside the starting plot. A morning with nobody living in it is not
    // a kingdom, and the homes are tier-1 pads standing at tier-1 coordinates -- outside the wall the
    // opening has.
    //
    // Raising the tier was tried and is what the budget will not take: tier 1 measures 1095k triangles
    // against the README's 1M, and it is the outer ring's own walls and towers rather than `expand2`.
    // Tier 0 is 697k. So the houses come inside instead, which is a design decision rather than a
    // compromise -- `rebuildVillage` already honours `placedAt`, and where a home stands in the
    // opening is exactly the sort of thing the morning exists to let somebody judge.
    homes: [
      ['home-1', -12.5, 11.5],
      ['home-2', -4.5, 13.5],
      ['home-3', 4.5, 13.5],
      ['home-4', 12.5, 11.5],
    ],
    // how long a heap lies where a building stood. Long enough to be walked past on the way out and
    // gone before the first mat is bought back, so nothing he rebuilds has to be put down on a ruin.
    ruinFade: 26,
    // #152: `?tour` holds the morning open for ever. Not a cheat and not a difficulty setting -- it is
    // there so the kingdom can be LOOKED AT, because it is meant to be designed and it cannot be
    // critiqued while it keeps being pulled down thirty seconds in. Same shape as `?safe=1`, `?hq=1`
    // and `?perf=1`: a query flag, read once, off by default, and it says so on screen so a run that
    // never starts is never a mystery.
    tourFlag: /[?&]tour/.test(typeof location === 'undefined' ? '' : location.search),
    // #178: and every `?view=` holds it too. A board frame is a display -- it was showing a village
    // that had been knocked down thirty seconds after the frame loaded, because `?view=map` is not
    // `?tour` and the clock was running. Anything being LOOKED at holds the morning; only `?tour`
    // gets the badge, because only `?tour` is a person walking around rather than a frame.
    holdFlag: /[?&](tour|view=)/.test(typeof location === 'undefined' ? '' : location.search),
  },

  // Opening: the Queen has been carried off. Find her, clear her captors, and she follows you home.
  // Nobody attacks the King until he takes the Queen back: the raids are the enemy coming to get
  // her, so nothing spawns while she is captive and `firstRaid` is the grace period after the rescue.
  rescue: {
    // #30: the opening has to feel like a rescue. Six guards at Raider strength and a Marauder
    // captain holding her, rather than three bandits who fall over.
    // #152: no `pos` any more. The rescue used to happen at a fixed spot west of the plot, because the
    // run opened with her already gone and she had to be somewhere. She is taken in front of the
    // player now, so where she is held is wherever they stopped carrying her -- `opening.picket`.
    captors: 6, captorRank: 1, captain: true, captainRank: 2,
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
    lost: 26,     // how far behind before a soldier counts as stuck and is put back where it belongs

    // #116: the army holds the GROUNDS rather than the King. `false` is the behaviour before this
    // ticket, and it is kept switchable because the ticket's own warning was that a scattered army
    // might simply be picked off one soldier at a time -- enemies retarget to the nearest unit every
    // 0.4s -- and that is a question for a measurement rather than an opinion.
    //
    // MEASURED. 12 soldiers, a fixed column from the south-west, 45 game-seconds, no other spawns,
    // soldiers lost and Keep damage:
    //
    //                           King away                 King at home
    //     raiders     follow          hold          follow          hold
    //        12       0 lost, -421    2 lost,  -0    2 lost, -0     2 lost, -0
    //        20       4 lost, -421    7 lost, -89    9 lost, -19    3 lost, -0
    //        28      10 lost, -421    8 lost, -429  12 lost, -113   4 lost, -0
    //
    // Holding is better or level everywhere except 28 raiders with the King away, where twelve
    // soldiers lose either way. The follow column only looks cheap because an army 34 units off with
    // the King never fights at all -- and the Keep pays 421 for it every time. With the King AT HOME
    // it is not even close: a formed block beats a ring orbiting a man who keeps moving.
    //
    // (There is run-to-run variance in these -- the raid rolls ranks and the aim wanders. The 12/away
    // row read 1 lost on one run and 0 on the next. The direction is far bigger than the noise.)
    holdGround: true,
    // Posts sit on an ellipse this fraction of the way out to the current wall. 0.72 puts them just
    // inside it. 0.4 was tried -- a tighter huddle near the Keep -- and was worse at 20 raiders
    // (6 lost against 4), because the far side of the grounds is then undefended long enough for a
    // column to walk in.
    postSpread: 0.72,
    // How far OUTSIDE the walls a raider still counts as the thing to go and fight. It has to be
    // more than an archer's 9.5 range or the army would stand at its posts being shot at.
    guardMargin: 12,
    // How far SHORT of the raider the block forms up, measured back towards the middle of the
    // grounds. THIS IS THE NUMBER THE WHOLE IDEA TURNED ON. The first version formed up ON him,
    // which marched thirty-hitpoint archers with a 9.5 range into contact, and the measurement was
    // brutal -- at 20 raiders the entire army died and the Keep fell anyway:
    //
    //     standoff  0   12 of 12 lost, 18 raiders left, Keep -421
    //     standoff  7    4 of 12 lost,  9 raiders left, Keep -0
    //     standoff 11    8 of 12 lost, 10 raiders left, Keep -432
    //
    // Too far back is nearly as bad as too far forward: at 11 the block sits behind the fight and
    // lets the column through to the Keep.
    standoff: 7,
  },
  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  // watchtowers: level 1 -> 3. Each level adds crew slots and sharpens the tower's arrows.
  turret: { hp: 40 },
  tower: {
    // #139: where the tower's own mats sit relative to it, the way `keep.padOffset` does for the
    // Keep. Before this the mats were placed at the pad coordinate out of this file while the tower
    // stood wherever the player put it -- a watchtower placed at [-12, 10] had its crew mat 31 units
    // away, which has been true since placement landed and only became easy to hit once a tower
    // could be dragged (#137).
    // 3.6 is the two halves plus air: the tower's footprint is 2.50 x 3.32 (1.66 deep from centre)
    // and a mat is `spend.padSize` 3.6 across (1.8), so 3.46 is touching and this clears it. South,
    // because that is the face the camera looks at and the side a player walks up to.
    padOffset: [0, 3.6],
    range: 14, fireRate: 0.7, damage: 12,
    levels: [{ slots: 3, damage: 1, range: 1 }, { slots: 5, damage: 1.35, range: 1.15 }, { slots: 7, damage: 1.8, range: 1.3 }],
    upgrade: [{ cost: 30 }, { cost: 60 }],
    // #203: WHERE A CREW STANDS, measured off the tower they stand on instead of inherited from the
    // one they used to. Reported off a phone as "the archers in the tower are standing on the roof".
    //
    // `slots` is nine because nine is the most the game can ever ask for -- level three is seven and
    // Wider Decks (upgrades.js) adds two -- and the ring was seven. Asked to seat nine it wrapped:
    // replaying the old arithmetic, archer #8 landed on #1 and #9 on #2, both 0.000 apart. A free
    // check holds the two numbers in step so the ring cannot fall behind the roster again.
    //
    // `radius` is 0.62 because the imported deck runs out past 0.65. Sampling eight directions on
    // tower_ai.glb: the floor is 2.99 the whole way round at r <= 0.65; at 0.75 one direction drops
    // to 2.54, which is a corner post rather than the deck; past 0.85 between two and four of the
    // eight have no floor under them at all. 0.75 was the BUILT tower's number and fits it fine --
    // its platform is 2.5 across against the import's 2.0.
    //
    // `order` is the fill order, and it is why three archers no longer huddle. Slots were handed out
    // 0, 1, 2: a 102 degree arc on one side of a deck with five sixths of its ring empty. Stride
    // three spreads every prefix -- three land 120 degrees apart, six land 60 apart, nine fill it.
    // #204: HOW BIG A MAN ON THE DECK IS, and it is a multiplier on his ordinary size rather than a
    // number about archers -- it exists because of the roof over him, so it lives with the deck.
    //
    // #203 put his feet on the planking and that is when this became visible: the old placement sank
    // him 0.27 THROUGH the floor, which bought just enough to keep his head under the eaves. It was
    // hiding a head clip by making a foot clip, and it held until nine men stood on one deck.
    //
    // Measured on the standing tower, at the nine places the ring actually uses (r = 0.62):
    //
    //   headroom   1.115  1.19  1.47-1.49 at five of them, and two open to the sky
    //   the archer 1.348 tall at scale 1 (1.55 to the crown at 1.15, from #204's own measuring)
    //
    // The tightest spot is what decides it: 1.348 x s <= 1.115 gives s <= 0.827. 0.76 puts the rig
    // at 0.798 absolute -- a crown at 1.076, so 0.04 of clearance at the worst place on the deck and
    // a quarter of a metre at the best. It is also, and not by coincidence, what makes nine bodies
    // fit a ring whose places are 0.424 apart: both constraints fall out of the same 2m square.
    //
    // The alternatives were capping the crew, which is a tower damage nerf because every turret
    // fires on its own, and regenerating the tower bigger, which is the root cause and needs the
    // model rather than a number. This is the one that costs no balance.
    deck: { slots: 9, radius: 0.62, order: [0, 3, 6, 1, 4, 7, 2, 5, 8], crewScale: 0.76 },
  },
  gatePost: { height: 1.55 },

  // #193: THE SHADOW MAP, AND WHETHER A PHONE CAN HAVE ONE.
  //
  // `shadowMap.enabled` has been `!(safe || (mobile && !hq))` since #26, when a Pixel Fold rendered a
  // white world and the map was one of three things turned off to find out why. So an ordinary phone
  // -- the device this game is played on -- has the contact discs and nothing else: no building
  // shadow, no tree shadow, no shadow under a wall. That was the right call with the evidence of the
  // day and it has been inherited ever since without being retested, on hardware two generations
  // newer.
  //
  // It is worth retesting because of what a real shadow does for the look. Where the mesas throw one
  // across the grass the scene gains depth and weight immediately, and that is the largest single
  // difference between this and the reference (#184).
  //
  // So there are two profiles rather than one, and a phone can be given the cheap one:
  //
  //             texels   extent   units/texel   cost
  //     full      1536     +-36      0.047      desktop, soft PCF, as it has always been
  //     cheap      768     +-30      0.078      a phone, hard PCF, a third of the texels
  //
  // The extent is what makes a small map usable: it is a box around the KING, who the sun follows
  // (`updateCamera` moves the light and its target with him), so it only ever has to cover the frame.
  // The frame reaches about 27 units ahead of him and 12 behind, so +-30 covers it with a margin and
  // spends nothing on the 190 x 190 the map used to be sized for. +-20 was the first guess and is too
  // tight: a tree 25 units out popped its shadow in as he walked at it.
  //
  // `normalBias` is the modern answer to acne and is free, which matters more at 0.078 units a texel
  // than at 0.047. It is new on the desktop path too, which never had one.
  //
  // THE GRASS RECEIVES NOW and did not before, which turns out to be most of what makes a map worth
  // its cost. A cast shadow lands on the ground, and since #191 the ground around the King is covered
  // in grass -- so the mesa's shadow fell across a field of blades that were all still in full sun,
  // and read as a stain rather than as shade. It still does not CAST: 13,000 instances through the
  // depth pass is the one shadow cost that would not be affordable anywhere.
  //
  // What went: `if (this.mobile) sun.shadow.mapSize.set(1024, 1024)`, a third profile that existed
  // only for `?hq=1` on a phone and was never measured against anything. `?hq=1` gets the real full
  // path now; `cheap` is the one to measure.
  //
  // THE CHOICE IS MADE AT LOAD, not by the adaptive controller (#168). Changing `shadowMap.enabled`
  // changes the shader defines, so every material in the scene has to recompile; doing that on a tier
  // drop means a stall of every program at the exact moment the device is already behind. The
  // controller has four cheaper dials and keeps them. `?shadows=off|cheap|full` picks a profile for a
  // run, which is what a measurement on a real phone needs.
  // #185 found `soft` to be a lie and it is gone. Three r186 has REMOVED PCFSoftShadowMap -- the
  // renderer logs "has been removed. Using PCFShadowMap instead." and quietly substitutes -- so the
  // full profile never got the soft filter #193 said it did, and neither did the desktop path before
  // #193 existed. `radius` is what actually separates the two now, and it always was: 4 against 1.
  shadowMap: {
    full: { size: 1536, extent: 36, radius: 4, bias: -0.0006, normalBias: 0.02 },
    cheap: { size: 768, extent: 30, radius: 1, bias: -0.0012, normalBias: 0.035 },
  },

  // #185: BANDED SHADING, and the one number that is not a hue. Every environment surface is a
  // MeshStandardMaterial under one sun and one hemisphere, and the lit-to-unlit ramp on all of them is
  // continuous -- which is what reads as a render rather than as a picture. These quantise it.
  //
  // WHERE THE CUT IS. `edge` and `val` are applied to `dotNL` INSIDE `RE_Direct_Physical`, before the
  // tone map and before exposure. That is deliberate and it is the whole reason this is not a
  // threshold on the final pixel: `exp` in `updateDaylight` runs 0.98 at dusk to 1.26 at noon and rain
  // dims it further, so a cut on the finished pixel would sit on a moving floor -- the same boundary
  // would collapse into one flat step at dusk and spread under the blood moon. Cut before exposure and
  // the steps are the same steps at every hour; exposure only moves where they land on screen.
  //
  // `val` is what each band is WORTH, not where it is -- which is how the tonal range widens without
  // touching a light. Everything in this scene sat in one mid band: nothing properly bright, nothing
  // properly dark. The top band is 1.24, ABOVE one, so a sunlit face is brighter than the sun alone
  // would make it; that is the lever, and it only touches the two surfaces this is hooked onto rather
  // than every material in the game. Moving `sun.intensity` instead would have reopened #194, whose
  // dusk keyframes are pinned by rank contrast.
  //
  // `fill` is the other half of the range and it works on the INDIRECT term: in the darkest band the
  // hemisphere's contribution is scaled to this, so shade is genuinely dark instead of the flat
  // hemisphere wash that made the old frames tonally narrow. It is an ambient-occlusion term in all
  // but name. 0.62 is as low as it goes before dusk grass loses the rank ladder -- see the README.
  //
  // `soft` is the half-width of a smoothstep at each boundary, in dotNL. NOT a softer look: at 0 the
  // band edge is a step function sampled once per pixel and it crawls with jagged stair-steps along
  // every blade of grass. 0.035 is about a pixel of edge at this camera and reads as hard.
  //
  // WHERE THE EDGES ARE IS NOT A TASTE DECISION. The ground is ONE FLAT PLANE, so its `dotNL` is a
  // single number per frame -- and `updateCamera` puts the sun at (18 + (34-h)*0.6, h, 12 + (34-h)*0.4),
  // which makes that number h/|v|: 0.94 at noon, 0.84 at dawn, 0.53 at golden hour, 0.36 at dusk,
  // 0.28 at night. The first edges tried were 0.26 and 0.55 and both of those land ON one: golden
  // hour sat astride the upper edge and night astride the lower, so the whole field was mid-crossing
  // at two of the five hours and night came out 17% darker than it had been. 0.20 and 0.48 put every
  // hour cleanly inside a band, which is what a step is for.
  bands: { edge: [0.20, 0.48], val: [0.0, 0.58, 1.20], fill: 0.62, soft: 0.035 },

  // #189: the one post pass. `vignette` is how far the corners fall and `grade` is how much of the
  // warm-highlight / cool-shadow split is applied, both 0 to 1.
  //
  // Both are deliberately UNDER what looks right in a still. A vignette is a thing you stop noticing
  // and then cannot unsee, and this frame already has a HUD in three of its corners -- at 0.45 the
  // purse and the wave counter sit in a shadow. 0.30 is the most that leaves them alone.
  //
  // The grade runs BEFORE the tone map, on linear light, which is why its numbers look small: a 7%
  // push on a linear highlight is a visible warmth after ACES, and the same figure applied to the
  // finished pixel would barely register.
  //
  // #196: WARM NEAR, COOL FAR. `from` and `to` are distances from the camera in world units, and
  // between them the grade slides from the warm tint to the cool one; `temp` is how much of it is
  // applied. This camera sits about 21 units from the King and the ground runs out around 55, so
  // 14 to 52 is the band the player actually looks at -- narrower and the near field is all one
  // temperature, wider and nothing in the frame reaches either end.
  //
  // IT LIVES IN THE POST PASS rather than the material hook, and #196 left that open. The deciding
  // argument is who it has to reach: enemies are mostly seen at distance and they are NOT banded --
  // characters are out of #184's scope -- so a depth tint in the material hook would separate the
  // grass from the far grass and leave the raiders standing on it untouched. In the pass it is one
  // place, it reaches everything the camera sees, and it costs no second program.
  post: { vignette: 0.30, grade: 0.65, from: 14, to: 52, temp: 0.42, near: 0xffd9b4, far: 0xb9d2f2 },

  // #191: THE GRASS FOLLOWS THE KING. 13,000 tufts used to be scattered once over the whole 190 x 190
  // map -- about one every 1.6 units -- and the camera shows roughly 35 units of ground, so the player
  // saw under 2% of them at a time and the other 98% were submitted every frame and never looked at.
  // That is why an open field read as scattered objects with bare ground between them rather than as
  // a surface: the density was set by the map's area, not by the frame's.
  //
  // The same tufts are placed in a window of cells around him instead, filled from a per-cell
  // deterministic seed and cached, so a field looks the same every time he walks back onto it. Same
  // count, same triangles, same one draw call -- roughly six times the density where he is standing.
  //
  // `cell` 8 and `radius` 6 is a 13 x 13 window, 104 units across, against a frame that reaches about
  // 27 units ahead of him on a phone and 20 on a desktop. `full` is the fraction of the radius at full
  // density (0.55 of 6 rings is everything inside 28 units, which is the whole of what is on screen);
  // past it the per-cell count tapers to `edge`, so the window has no boundary to see -- the taper
  // lands between 28 and 52 units out, where the scene fog (near 42 from a camera that sits 13 to 18
  // behind him) is already taking it.
  //
  // A cell is filled at most `fillPerFrame` at a time. Walking into new country brings 13 uncached
  // cells in at once and filling them all in one frame is a hitch on a phone; they arrive over the
  // next two, at the far edge of the window, behind the fog.
  //
  // `spread` and `clumped` are the old map-wide clumping, rebalanced: uniform random gives every
  // square metre the same amount of grass, which is the one thing real ground never does -- but the
  // old 78% into 240 patches of radius 5 was tuned at a fifth of this density, where the clumps were
  // the grass and the gaps were most of the field. At this density the same numbers left clump-shaped
  // voids four to six units across, which is the bare ground the ticket is about. Three smaller
  // patches per cell with 45% loose between them keeps the variation and closes them.
  //
  // `fill` is how hard a cell is packed against the buffer's cap, and 1.0 is the answer rather than
  // the default. A cell places what it can and `grassFree` turns much of it down -- the citadel, the
  // roads, the river, the mats -- so the window draws about 9,000 in the village and 11,600 in open
  // country against a buffer of 13,000, and the obvious move is to spend that difference. 1.1 was
  // tried and put the clover on its cap exactly (3,600 of 3,600) with the tufts 1.7% off theirs.
  // That is the one place the headroom must not go: the cap truncates the buffer from the far end,
  // and the far end is the taper that hides the window's edge.
  ground: {
    cell: 8, radius: 6, full: 0.55, edge: 0.1, fillPerFrame: 3, fill: 1,
    spread: 3.8, clumped: 0.55, patches: 3,
    // #200: the grass noticing feet. `radius` is how far from a foot a clump leans; `push` is how far
    // its TIP moves in world units, against the 0.14 the wind already moves it -- so 0.8 is about six
    // times the wind and reads as a different kind of thing. The root never moves: this material is
    // `rooted` and that is the whole point of it.
    //
    // Pinned by measuring rather than picked. The mean pixel change over a disc round his feet is a
    // bad guide -- it is diluted by whatever bare ground is in the disc -- so what was measured is the
    // SHARE of nearby pixels that moved by more than 8/255, at two different spots in open grass:
    //
    //     radius  push    visibly moved
    //       1.1   0.5     9.1%  9.1%
    //       1.8   0.9    14.3% 12.7%
    //       2.5   0.9    15.4% 14.6%
    //
    // 2.5 buys almost nothing over 1.8 and parts grass two and a half metres from a man, which reads
    // as a force field rather than as legs. 1.8 is about a stride and the swing of a leg.
    feet: { radius: 1.8, push: 0.8 },
    // A clover patch is a metre and a half across and half the cells have one, which is what makes it
    // read as a plant that spreads rather than as confetti. Stones come in groups of six to eight in
    // two cells out of five. `flowerChance` is per tuft: 900 flowers against 13,000 tufts is 6.9%,
    // which is what the old placement's per-colour cap of 300 actually produced.
    cloverChance: 0.5, cloverSpread: 1.6, stoneChance: 0.4, stoneSpread: 1.2, flowerChance: 0.069,
  },

  // #43: how much ground each building actually covers, width x depth, measured off the built meshes.
  // This lived only in `tools/layout/check.mjs`, which was fine while the only thing that needed it
  // was a script checking the hand-written plan. Now that a building can be put somewhere the plan
  // did not choose, the GAME needs the same numbers to say whether a spot is free -- and two copies
  // of a table measured off meshes is one copy that goes stale. The tool imports these.
  //
  // Update them when a model is re-baked at a different size, and re-run `node tools/layout/check.mjs`.
  footprint: {
    bank: [3.46, 3.46], barracks: [7.68, 7.96], hut: [5.58, 4.49],
    keep: [6.02, 5.38], tower: [2.50, 3.32], house: [4.03, 3.71],
    // #82: the Stable's footprint is the building AND the paddock in front of it -- one block, see
    // `CFG.stable` -- because the horses standing in the yard are the thing the building is for.
    stable: [6.2, 11.4],
  },
  // #82: how the Stable block is laid out, relative to its own origin, which is the centre of the
  // whole block so that `footprint.stable` is one rectangle about `buildAt`. The BUILDING is at the
  // back (north, -z) and the YARD in front, because the camera looks north over the King's shoulder:
  // a yard behind the building would be hidden by it, and the yard is the readout (#117). `gate` is
  // where the fence is open, on the yard's road side, so a horse leaving or coming home walks out
  // through a gap rather than through a rail. The placeholder building is `makeStable` in models.js
  // until the generated one lands; its door is on the +z face, looking into the yard.
  stable: { building: [5.6, 4.6], buildingAt: -3.1, yard: [6.0, 5.4], yardAt: 2.7, gate: [2.0, 2.7, 1.6] },
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
  // #58 IS PARKED. The pair of pills was reported as noise on a title screen that should offer two
  // things -- carry on, or start again -- so the choice is off and every run is `pinnedLength`.
  //
  // Off rather than deleted, and `defaultLength` below is left saying what it said. Nothing about the
  // feature was wrong: `CFG.lengths` still holds both, `costScale` and `nights` still work, the
  // scoreboard still keeps a board per length, and turning `lengthPick` back on is the whole of
  // bringing it back. Deleting it would mean rebuilding it to find that out.
  //
  // `pinnedLength` is the long run because short is the one being disabled, and because a stored
  // choice of 'short' must not strand anyone on a length they can no longer see or change:
  // `readLength` answers with this while the pills are off, rather than with what is in storage.
  lengthPick: false,
  pinnedLength: 'long',
  // #145: the minimap, parked. It owned the top-right corner and was not earning it -- "disable and
  // remove for now, it takes up too much space and isn't too useful at the moment".
  //
  // OFF RATHER THAN DELETED, the same shape as `lengthPick` above and for the same reason: "for now"
  // is in the request, and a minimap is a terrain bake, a fog layer and a big/small state to rebuild
  // from nothing if it comes back. Turning this back on is the whole of bringing it back.
  //
  // What goes with it is the overview of where you have walked, where the seams are and where the
  // camp is; the fog of war itself is `buildFog` and is untouched. The march on the camp (#19) is the
  // trip most likely to want it back, being the one that crosses the whole map.
  //
  // It also stops a 2D canvas being redrawn every half second all run. Not a budget item -- the probe
  // counts draw calls and triangles and this is neither -- but it is real CPU that stops.
  minimap: false,
  // Which one a player who has never chosen gets, when they are given the choice at all. Short,
  // because that is the whole point of the ticket: the long run is the thing you graduate to, not the
  // entry fee.
  defaultLength: 'short',
  // #56: what a lost run buys. Before this, `reset()` rebuilt from constants every time and the only
  // thing that outlived a run was two numbers -- so losing bought a number, which is not a reason to
  // start a second run.
  //
  // Four unlocks, permanent, bought with CUMULATIVE LIFETIME SCORE rather than a second currency. A
  // second currency would need earning, displaying and explaining; score is already earned, already
  // shown, and already the thing the player is trying to make bigger.
  //
  // Each one seeds `game.mods` (or one flag) at reset through the same door `upgrades.js` uses, which
  // is what keeps this from touching gameplay code at all -- see the comment at the top of that file.
  //
  // THE THRESHOLDS, and what they are pinned against. Most of a run's score is the wave-clear bonus,
  // and that part is exactly computable: `score.waveClear * wave` summed over a run is 50 * (1+..+15)
  // = 6,000 for a short run and 50 * (1+..+30) = 23,250 for a long one. Levelling the Keep to 13 adds
  // 60 * (1+..+13) = 5,460, and the finale 1,500. So a FINISHED short run clears 13,000 before a
  // single kill or coin is counted, and a long one 30,000; a run that dies around the halfway mark is
  // a few thousand.
  //
  //     first    4,000    inside a first run, even a bad one -- the point is that the FIRST loss pays
  //     second  14,000    about one finished short run
  //     third   34,000    two or three more
  //     fourth  70,000    a finished long run, or several short ones
  //
  // The kill and coin halves are not computable without playing, so these are a floor rather than a
  // measurement, and the shape is what matters: something on the first loss, everything by the time
  // somebody has finished the game a couple of times. Move them after playing, not before.
  //
  // They are deliberately gentle. The ticket's third rule is that a first-time player's run is
  // unchanged, and nothing here is required to win -- every one of them is a head start on something
  // the run already gives you.
  legacy: [
    { id: 'purse', at: 4000, icon: 'coin', name: 'A fuller purse', desc: 'Start with 25 coins on the road instead of 10.' },
    { id: 'volunteers', at: 14000, icon: 'person', name: 'Word has spread', desc: 'Every recruit mat brings one extra soldier, all run.' },
    { id: 'packs', at: 34000, icon: 'sack', name: 'Packhorses', desc: 'Carry 8 more before you have to sell.' },
    { id: 'stables', at: 70000, icon: 'horse', name: 'The stables stand', desc: 'Begin every run already mounted.' },
  ],

  // #18: the King's one ability. The warhorn pulls the army to him and drives them for a few
  // seconds, and the blast shoves nearby raiders back and stuns them: an answer to a breach.
  horn: { cooldown: 22, duration: 6, radius: 7.5, push: 3.4, stun: 1.3, speed: 1.6, damage: 1.5, rallySpeed: 2.2 },

  // #57: the rally banner, and the only one of the King's verbs that is a decision about a
  // PLACE rather than a moment. The horn says "to me"; this says "hold here", and then lets him
  // leave.
  //
  // It is planted where he STANDS rather than aimed. A one-thumb game has no room for a targeting
  // mode -- tap the button, then tap the ground, with a raid running -- and "walk to the breach and
  // plant it" is the same decision with none of that interface. It also means the banner cannot be
  // put somewhere the King could not reach, which is a rule that needs no code.
  //
  // `duration` against a 75-second night: 18s is about a quarter of one. Long enough to hold a
  // breach while he goes for the coin that pays for the wall, short enough to be a moment rather
  // than a mode -- a banner that outlasted the night would just be the army's new home.
  //
  // `cooldown` runs from when it is PLANTED, not from when it falls, so the gap between one banner
  // and the next is 28 - 18 = 10 seconds of the army being his again. That gap is the cost: an army
  // committed to a place is an army not behind the King, and he has to spend some of every minute
  // without the choice.
  //
  // The horn SUSPENDS a standing banner rather than tearing it down -- `rallied()` wins in the
  // formation centre, and when the six seconds are up the army goes back to the banner if it is
  // still there. Clearing it was the other option and it made the horn a trap: the emergency button
  // would have cost the player the order they had just spent a cooldown on.
  banner: { duration: 18, cooldown: 28 },
  // "Train Archers" pad at the range: each level makes every archer hit harder and tougher
  archerTraining: { damage: 0.25, hp: 0.2 },
  // #82: "Train the Horse" at the Stable, the same shape. Each level adds `speed` of the mounted
  // King's base speed, so four levels take 7.5 to 10.5 -- a third again, which is what the late
  // materials ask for: iron at the mesas and diamond across the river are round trips, and `carry`
  // caps a trip, so the run's longest walks are where a faster horse is felt. Additive rather than
  // compounding so the fourth level is worth exactly what the first was and the mat's price is the
  // only thing that rises. Every horse in the yard is trained too (#117): a mounted soldier rides at
  // its own `horse.soldierSpeed` times the same factor.
  horseTraining: { speed: 0.1 },
  // #117: the Stable's yard. `yard` is how many horses it holds, which is the number of soldiers that
  // can be put on horseback -- the paddock IS the capacity, read by looking at it. `soldierSpeed`
  // is what a horse does for a swordsman: 8.5 -> 12.75, above the mounted King's 7.5 untrained so a
  // rider always gets to a breach before he could. `walk` is a horse's own pace about the yard and
  // on the way to a rider; `home` is the trot back when its rider falls. `patrolLap` is how many
  // seconds a mounted soldier takes to ride the whole post ring (#116) while the grounds are quiet.
  horse: { yard: 4, soldierSpeed: 1.5, walk: 2.0, home: 4.6, patrolLap: 34, reach: 1.3, idle: [1.5, 4] },

  // One currency, and enemies drop more of it the higher their rank.
  // Coins are gold, always. They used to change colour with the Keep (bronze, silver, gold,
  // platinum), which read as four currencies when there is only ever one. What that colour really
  // carried was score: a coin is worth more the higher the Keep stands, so that is kept and keyed to
  // the Keep level directly. `valueAt` are the levels at which a coin starts being worth `value`.
  coins: {
    valueAt: [0, 4, 8, 12],
    value: [1, 3, 8, 20],
    start: 10,
    // #169: a coin on the ground lives `life` seconds and fades over its last `fade`. A thirty-night
    // soak with nobody collecting reached 3,683 coins and they were the one thing a run retained
    // without a ceiling. 180 is more than two nights: long enough that a coin dropped at the far wall
    // during a raid is still there after the morning's mining trip, and the fade is long enough to
    // be seen and walked to. The gleaner below is what makes this rarely happen; the fade is so that
    // when it does, it was seen going rather than found missing.
    life: 180, fade: 40,
  },
  // #169: the gleaner. One worker who lives at the Keep and walks the field for what the King left
  // lying, because a run that is going well drops more coin than one man can chase. He leaves a coin
  // alone for `wait` seconds after it lands and never takes one inside the King's ring plus `keepOff`,
  // so the player is never racing his own helper for the drop at his feet; then the OLDEST first,
  // which is the one about to fade. 3.4 against a villager's 2.8: he carries nothing heavy. `speed`
  // is what the Quick Feet card multiplies (`mods.gleanerSpeed`, x1.4, up to twice: 4.8 then 6.7).
  gleaner: { speed: 3.4, wait: 4, keepOff: 2, reach: 1.1, flee: 13, rest: [3.2, 4.0] },

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
    // #160: `fleeSpeed` 8.2 against the King's 5.6 on foot and 7.5 mounted, so a thief that has got
    // hold of his coin outruns him on foot and barely loses mounted. #57's dash was the answer to
    // that -- 2.8x speed for 0.3s closes (2.8 * 5.6 - 8.2) * 0.3 = 2.2 units, and a thief's run had
    // room for two of them -- and #160 removed the dash, so the chase is a speed check again, as it
    // was before #57. Left at 8.2 on purpose: the King's own bow and the towers still answer a
    // thief, and slowing it under 5.6 makes it a raider who politely waits to be caught. If that
    // turns out to be the wrong call this is the one number to move.
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
  // #43: `padSize` is the mat's own 3.6 x 3.6 footprint, which `tools/layout/check.mjs` has always
  // known and the game never had to, because nothing was ever placed near one by hand. A building the
  // player puts down has to keep off them -- a mat you cannot stand on is a mat you cannot buy from.
  // #43 AND #137 ARE PARKED. Buildings go where the map says again, and nothing can be picked up.
  //
  // Not because either was wrong -- the edit mode works and the drag is good -- but because the
  // opening is becoming a village that STANDS and then falls (#152), and that village is a thing to
  // be designed. A player who places freely diverges from an authored layout on the first watchtower,
  // and then the tableau the game opens on and the village the player rebuilds are two different
  // places with nothing to say to each other.
  //
  // Off rather than deleted, the same shape as `lengthPick` above. Three gates read this and nothing
  // else does: `completePad` decides whether a paid-for structure is placed or just built, `canMove`
  // decides whether anything can be lifted (and `beginMoving` and `longPressAt` both ask it), and
  // `nearMovable` needs its own because it keeps a second copy of the same `place` test rather than
  // calling `canMove`. Gating the first two and assuming the third followed left the move button
  // standing there offering something nothing would honour -- found by driving it, not by reading it.
  // Everything downstream -- the ghost, the grid, the tick and the cross, the camera pan -- never starts.
  //
  // `placedAt` is still honoured on a restore. A save made while this was on keeps its village where
  // the player put it rather than having its buildings jump to the map's coordinates on resume; what
  // the flag governs is where a NEW building lands.
  placeBuildings: false,

  // #137: the placement mode. The ghost is dragged with the finger now rather than carried by the
  // King, and these are the two numbers that decide how that feels.
  //
  // `grid` is what the ghost snaps to, and it is drawn at the same spacing while a placement is in
  // progress, so the squares on the ground are the squares it lands on -- a grid you snap to but
  // cannot see is just input lag with extra steps.
  //
  // 2 rather than 1 or 4. The footprints are measured off the real models and are not modular
  // (tower 2.50 x 3.32, house 4.03 x 3.71, barracks 7.68 x 7.96), so no spacing makes them tile; what
  // a grid buys here is that centres line up, which is what reads as a laid-out village from above.
  // At 1 the snap cannot be felt and the drawn lines are a haze at this camera distance. At 4 two
  // houses can only ever be 8 apart -- `placeOk` refuses the 4 that would touch -- and the tier-0
  // grounds are only about 38 across, so a quarter of the plot goes to gaps you did not choose.
  // At 2 the snap is unmistakable, the lines read, and two houses sit 6 apart, which is a street.
  //
  // `longPress` is how long a finger has to be still on one of your own buildings before it is picked
  // up. It has to clear TAP_TIME (200ms, input.js) by enough that a slow tap is never a pick-up, and
  // stay under the point where a player assumes nothing is going to happen. 450 was tried against 300
  // and 600: at 300 a deliberate tap on a tower sometimes lifted it, at 600 it reads as broken.
  // #138: `grab` is how far outside its own footprint a press still counts as grabbing the ghost, and
  // `panMargin` is how far past the buildable rectangle the view may be dragged.
  //
  // A press on the ghost moves the building; a press anywhere else pans the camera, which edit mode
  // had no way to do at all -- the King is frozen during a placement and the camera is a fixed offset
  // from him, so you could only build on the patch of ground that happened to be on screen when you
  // started. 1.2 because the smallest movable building is the watchtower at 2.50 x 3.32, and half of
  // the short side is 1.25: the margin roughly doubles the narrow axis rather than being a round
  // number picked off the buildable grid, which is 2.
  //
  // `panMargin` 6 lets the edge of the plot sit clear of the screen edge rather than exactly on it,
  // and stops the pan wandering to the far quarries -- a view you have to walk back from is worse
  // than one that will not go there.
  place: { grid: 2, longPress: 450, longSlop: 14, grab: 1.2, panMargin: 6 },

  // #144: `showRadius` was 10 and the field read as a car park of floor markers -- "they appear too
  // early and I can see a lot of mats". Swept on a field of eight pads, counting the most that stand
  // up at once with the King parked at each mat in turn:
  //
  //     showRadius 10 -> 3 mats up      6 -> 2      4 -> 1      3 -> 1
  //
  // So 4 is where it stops being a car park, and 3 buys nothing further. 4 over 3 is about the fade
  // rather than the count: walking in from 8 units, a mat is at 0.95 opacity as the King crosses
  // `padRadius` 1.7 -- the circle it takes payment in -- and full by 0.88. It is arrived by the time
  // he can use it, which at 3 it would still be doing.
  //
  // `showAfford` is the other half and is why the radius could be cut at all. NOTHING POINTS AT A
  // BUILD MAT -- `updateIndicators` draws arrows for enemies, for home and for the camp, and there is
  // no arrow for a pad -- so at 10 the radius WAS the discovery. Cutting it without replacing that
  // trades one complaint for another: a player who misses `showNew` has no way to be reminded a mat
  // exists short of walking the village. So a mat shows itself again for `showAfford` seconds the
  // moment it becomes payable, which is exactly the moment it is worth pointing at. A pulse on the
  // TRANSITION rather than a test of affordability: a mat you can afford and have not bought would
  // otherwise stand up forever and put the car park straight back.
  spend: { tick: 0.07, fastTick: 0.022, crewTick: 0.28, padRadius: 1.7, padSize: 3.6, arm: 0.25, bought: 1.0, walkHold: 0.8, showRadius: 4, showNew: 7, showAfford: 4 },

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

  // #168: what the game gives up when the frame rate drops, in the order it costs the look, and the
  // discipline for giving it up. `fps` is the rate a tier drops in at, held for `dropAfter` seconds
  // of counted frames; it is restored once the rate has sat `restoreMargin` above that for
  // `restoreAfter` seconds. A frame longer than `stall` is a hitch (or SwiftShader) and is not
  // counted at all. See game-quality.js for why each of those is what it is.
  //
  // The order: grass thins first because the ground texture carries most of the coverage since
  // 45f5aa0 and 13,000 tufts are the largest single instanced cost in the world (273k triangles);
  // then the wind stops and the resolution eases -- fill rate is what a phone GPU runs out of first,
  // and the phone already caps at 1.5x, so 0.85 of that is a fifth fewer pixels; the contact shadows
  // go last, because on a phone they are the only shadows there are. The thresholds are the advice's
  // (normal above ~55, fewer effects below ~45, fewer shadows below ~35), read against this game's
  // own floor of 30fps on a phone.
  quality: {
    // #189: `post` is the vignette and grade pass. It is a full-screen quad at the device's pixel
    // ratio, which is the largest per-pixel cost in the game on a phone, so the reduced tier drops
    // it with everything else. The composer itself stays in the path at every tier -- see post.js
    // for why turning it off would cost a recompile of the whole scene.
    tiers: [
      { fps: 45, grass: 0.6, flowers: 0.6, wind: true, shadows: true, dpr: 1, post: true },
      { fps: 35, grass: 0.4, flowers: 0.4, wind: false, shadows: true, dpr: 0.85, post: true },
      { fps: 28, grass: 0.25, flowers: 0.25, wind: false, shadows: false, dpr: 0.7, post: false },
    ],
    dropAfter: 3, restoreAfter: 20, restoreMargin: 10, stall: 0.25,
  },

  // #95/#97: how a notice is read out.
  // `lines` is the cap: past three, the rest becomes another page behind a bobbing arrow. Three is
  // what fits over the world at phone width without the notice becoming the screen.
  // `letterMs` is the typing speed. 18ms is about 55 characters a second -- quick enough to read as
  // speech rather than as a stutter, and slow enough to see. A full three-line page at phone width is
  // around 115 characters, so the reveal costs ~2.1s of a hold that is 7s at that length.
  // `readBase` + `readPerChar` is the hold AFTER the typing finishes, capped by `readMax`. It used to
  // start when the notice appeared, which meant a long one spent a third of its life still arriving.
  notice: { lines: 3, letterMs: 18, readBase: 1400, readPerChar: 55, readMax: 7000 },

  // #132: how long a capability notice stands before it closes itself. In GAME seconds, because it is
  // ticked from the game's own dt -- so a paused game does not tick it away behind the pause screen,
  // and one waiting its turn behind a toast keeps its full time.
  //
  // `ms` is the closed line: "Training 3 of 5 \u00B7 Your archers", 34 characters. The notice band next
  // door reads at `readBase` 1.4s plus 55ms a character, which puts that line at 3.3s -- and this one
  // has to be read AND decided about, since the chevron is an offer to open it. 5.5 is that plus the
  // two seconds it takes to notice something arrived and move a thumb to it.
  //
  // `openMs` is the rows, which is where the panel's content went: four lines averaging 95 characters,
  // so 6.6s of reading by the same measure. 12 leaves most of a second a line and does not strand a
  // player who opened it to check one number and then looked back at the field.
  //
  // Both are a floor rather than a limit -- the tap that opens it restarts the clock at `openMs`, and
  // a purchase arriving while one is up replaces it with a fresh one.
  gainNotice: { ms: 5.5, openMs: 12 },

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

// #202: A MAT SITS AT THE DOOR. Every building in `models.js` puts its door on the +z face -- the
// Keep's at z 1.72, the Barracks' at 1.53, the hut's at D/2, and `makeBarracks`'s comment says so
// outright -- because the camera looks north over the King's shoulder, so +z is the face you see.
// So a structural mat belongs square on +z from its `buildAt`, clear of the footprint by half a pad.
//
// Three of the five already did. The Keep's sat at (-5, 5) against a building at (0, 0), which is
// diagonally off a corner touching no face at all, and the Barracks' was 4 units off its centre line.
// Both now sit on the door's axis. The footprint is NOT what moved: `CFG.footprint` is what `placeOk`
// tests and what `pads-no-overlap` and `pads-buildat-in-bounds` assert, so moving a building is a
// balance change and a save question, where moving a mat is free.
// Build pads. `requires` are ids that must have been built at least once; `minLevel` is the Keep level
// a pad needs before it appears. cost = coins; crew = archers taken from your army instead of coins.
// Everything costs coin. Materials are mined, piled, carried and sold at the trade post; what comes
// back is coin, and coin is the only thing a pad ever asks for. `desc` is shown on the info screen.
// `buildAt` is where a structure appears; its pad sits right in front of it (pads for units spawn on the
// pad). Watchtowers stand in the fort's corners: their pad turns into "man the tower" and then "upgrade"
// pads on the same spot. Gate Guards get small posts beside each gate.
// #43: `place: true` -- where a watchtower stands is a tactical decision and the map was making it.
// `buildAt` is still the corner it suggests; the player may put it anywhere legal instead.
const T = (id, tier, pos, cost, buildAt) => ({ id, tier, pos, cost, place: true, icon: 'tower', label: 'Watchtower', structure: 'tower', buildAt, desc: 'Corner watchtower. Man it with archers, then upgrade it for more crew and sharper arrows.', toast: 'Watchtower built. It needs a crew!' });
// Villager homes. They are separate pads rather than one repeatable pad because each one stands in
// its own place: a repeatable pad builds at the same spot every time, and a village is the one thing
// that has to spread. Each needs the one before it, so only one home mat is ever on the field.
const HOME = (n, pos, cost, buildAt, requires) => ({
  // #43: homes are placeable too -- a villager walks to the nearest node from wherever the house is,
  // so where it stands is a real decision about which seams get worked.
  id: `home-${n}`, tier: 1, pos, cost, place: true, icon: 'home', label: 'Villager Home', structure: 'house', buildAt, requires,
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
  { id: 'keep', tier: 0, pos: [0, 4.8], cost: 25, icon: 'keep', label: 'Royal Keep', requires: ['range'], structure: 'keep', buildAt: [0, 0], desc: 'A door for Wren, and the heart of the village. Pay coin into it to level up your whole kingdom.', toast: 'Wren has a door at last. Pay coin into it to level up!' },
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
  { id: 'bridge-south', tier: 0, pos: [6, 44], cost: 30, icon: 'bridge', label: 'South Bridge', requires: ['palisade'], bridge: 'south', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },
  { id: 'bridge-east', tier: 0, pos: [47, 7], cost: 30, icon: 'bridge', label: 'East Bridge', requires: ['palisade'], bridge: 'east', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },

  // ---- tier 1 ----
  W('wall2-south', 1, [-16, 21], 25, 'south', 'South Wall'),
  W('wall2-east', 1, [22, -4.8], 25, 'east', 'East Wall'),
  // #82: south of the west road now, where the old Warhorse mat stood; the Stable block has the
  // shoulder north of it.
  W('wall2-west', 1, [-24, 5], 25, 'west', 'West Wall'),
  W('wall2-north', 1, [6, -22], 25, 'north', 'North Wall'),
  { id: 'crew-gates2', tier: 1, pos: [21, 5], crew: 6, icon: 'shield', label: 'Gate Guards', requires: ['wall2-south', 'wall2-east', 'wall2-west'], posts: true, postTier: 1, desc: 'Six archers take posts beside the new gates.', toast: 'Archers now watch the new gates.' },
  { ...T('tower-1-nw', 1, [-26.2, -22.2], 25, [-30, -26]), requires: ['expand1'] },
  { ...T('tower-1-ne', 1, [25.2, -24], 25, [30, -26]), requires: ['expand1'] },
  { ...T('tower-1-sw', 1, [-26.2, 22.2], 25, [-30, 26]), requires: ['expand1'] },
  { ...T('tower-1-se', 1, [25.2, 24], 25, [30, 26]), requires: ['expand1'] },
  { id: 'barracks', tier: 1, pos: [9.2, 15.4], cost: 40, minLevel: 3, icon: 'swords', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [9.2, 9.2], desc: 'Lets you recruit swordsmen.', toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [5.2, 15.4], cost: 8, growth: 2, icon: 'swordsman', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 }, desc: 'Two swordsmen: tough melee fighters who charge whatever comes near the King.' },
  // #116 renamed this from "Royal Guard". It grants the King eighty max HP and a full heal and has
  // never had anything to do with a guard -- and this ticket adds a pad that really is one, two mats
  // away. Two pads called Royal Guard and King's Guard, one of them an HP buff, is a trap.
  { id: 'crown', tier: 1, pos: [-12, -21], cost: 35, growth: 25, maxBuys: 3, icon: 'crown', label: 'Royal Armour', requires: ['expand1'], repeatable: true, effect: 'kinghp', desc: 'King max HP +80 and a full heal.', toast: 'King max HP +80 and fully healed' },
  // #82: the Stable. The Warhorse used to be a bare tier-0 mat at [-21, 5] with no building behind
  // it: 25 coins once, and the King's speed never moved again for thirty nights. Now the horse comes
  // from a building, like the archers from the Range, and the building keeps giving -- training on
  // a rising price (#82) and horses for the army (#117). It is the fourth building and the citadel
  // was sized for three (see TIERS), and a paddock needs more ground than a hall does, so it stands
  // in the west strip between the citadel and the town wall, north of the west road: the widest open
  // ground inside the walls once the town is walled, right outside the citadel's west gate. That
  // makes it tier 1, which is where the King's own line already lives (Royal Armour, the Guard).
  // The mats sit on the road's north shoulder in front of the yard and beside it: the citadel ring
  // crosses x -18.4 here, the town wall stands at -30, and a mat is 3.6 across, so there is room for
  // two in front and a column of them down the west side. `tools/layout/check.mjs` has the numbers.
  { id: 'stable', tier: 1, pos: [-22.8, -4.7], cost: 15, icon: 'horse', label: 'Stable', requires: ['expand1'], structure: 'stable', buildAt: [-22.8, -12.4], desc: 'A stable and a paddock. The horse comes from here, and so does everything that makes it faster.', toast: 'Stable built! Now for a horse.' },
  { id: 'warhorse', tier: 1, pos: [-22.8, -4.7], cost: 20, icon: 'horse', label: 'Warhorse', requires: ['stable'], effect: 'horse', desc: 'The King rides: much faster around the map.', toast: 'The King rides! Much faster now.' },
  { id: 'train-horse', tier: 1, pos: [-27.7, -4.7], cost: 15, growth: 10, maxBuys: 4, icon: 'horse', label: 'Train the Horse', requires: ['warhorse'], repeatable: true, effect: 'horseSpeed', desc: 'Every horse, now and later, runs faster. All four levels: a third again on the King, and on every soldier who rides.', toast: 'The horses are trained: faster, every one.' },
  // #117: the yard. A horse bought here stands in the paddock; the mat below puts a swordsman on
  // one, and the horse walks out of the yard to him. `maxBuys` is the yard's size and never comes
  // back, because a horse is never lost -- when its rider falls it walks home and is there to spend
  // again. Down the west side of the block, a column of two, so the yard has its mats beside it the
  // way the Range has the archers' beside it.
  { id: 'stable-horse', tier: 1, pos: [-27.7, -9], cost: 18, growth: 6, maxBuys: 4, icon: 'horse', label: 'A Horse for the Yard', requires: ['stable'], repeatable: true, effect: 'stableHorse', desc: 'Another horse in the paddock. Every horse standing there is a swordsman you can put on horseback.', toast: 'A new horse in the yard.' },
  { id: 'mount', tier: 1, pos: [-27.7, -13.2], cost: 8, icon: 'swordsman', label: 'Mount a Swordsman', requires: ['stable-horse'], repeatable: true, effect: 'mount', desc: 'A horse leaves the yard for a swordsman on the grounds. He rides half again as fast and patrols the ring of posts instead of standing at one. When he falls, the horse walks home.', toast: 'A horse leaves the yard for its rider.' },
  // #116: the retinue. Soldiers promoted here leave the grounds and stand with the King instead, so
  // this is a real choice rather than a free upgrade -- every guard is a soldier taken off the walls.
  { id: 'guard', tier: 1, pos: [-5.4, 15.4], cost: 26, growth: 18, maxBuys: 4, icon: 'shield', label: "King's Guard", requires: ['barracks'], repeatable: true, effect: 'guard', desc: 'Two soldiers leave their posts and march with the King wherever he goes. The rest of the army holds the grounds.', toast: 'Two soldiers join the King\u2019s Guard' },
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
