// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 190 },
  // the grey mesas in the north-west; nothing spawns or walks here
  cliffs: { x: -14, z: -33 },

  king: { speed: 7.5, footSpeed: 5.6, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 3.0 },
  queen: { hp: 90, speed: 7.2, follow: 1.9, targetWeight: 0.55 },
  // Opening: the Queen has been carried off. Find her, clear her captors, and she follows you home.
  // Nobody attacks the King until he takes the Queen back: the raids are the enemy coming to get
  // her, so nothing spawns while she is captive and `firstRaid` is the grace period after the rescue.
  rescue: {
    pos: [-30, 9], captors: 3, freeRadius: 3.2, aggroRadius: 9, firstRaid: 22,
    penRadius: 3.4, // how far she can drift before the guards push her back
    noticeRadius: 15, // the King is spotted here: guards turn, she calls out
    alert: 1.1, // beat between being spotted and the charge
    queenSpeed: 2.2,
    guardSpeed: 2.6,
    // #16: losing her is a chase, not a lose screen. `escort` raiders carry her toward the map edge
    // at `escortSpeed`; catch them and she is back, wounded, and the Keep pays. `recaptures` times.
    escort: 2,
    escortSpeed: 4.0,
    recaptures: 1,
    keepCost: 0.4,
  },
  keep: { hp: 420, hpPerLevel: 90, radius: 2.1, half: 1.7, materialBonus: 420 },

  // The Keep is the base. Materials you mine go ONLY into the Keep; each level unlocks more.
  base: {
    maxLevel: 15,
    // materials needed to reach the NEXT level, indexed by the current level (level 0 = no keep yet)
    levels: [
      null,
      { wood: 10 }, // 1 -> 2   timber age
      { wood: 14, straw: 4 },
      { wood: 18, straw: 6 }, // 3 -> 4  unlocks stone
      { stone: 10, wood: 8 }, // 4 -> 5   stone age
      { stone: 14, wood: 10, straw: 6 },
      { stone: 18, wood: 12, straw: 8 },
      { stone: 24, wood: 14, straw: 10 }, // 7 -> 8  unlocks iron
      { iron: 10, stone: 12 }, // 8 -> 9   iron age
      { iron: 14, stone: 16, straw: 10 },
      { iron: 18, stone: 20, straw: 12 },
      { iron: 24, stone: 24, straw: 14 }, // 11 -> 12  unlocks diamond
      { diamond: 8, iron: 14 }, // 12 -> 13  diamond age
      { diamond: 12, iron: 18, stone: 20 },
      { diamond: 16, iron: 24, stone: 26 },
    ],
    // how many archers / swordsmen the Keep supports at each level (tower crews count as archers)
    archers: [4, 6, 9, 12, 15, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 60],
    swordsmen: [0, 0, 0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30],
    // archery speed multiplier: 1x at level 1, 2x at level 8, 3x at level 15 (archers, towers, the King)
    fireRate: (level) => 1 + (2 * Math.max(0, level - 1)) / 14,
    // Keep level at which every wall becomes wood / stone / iron / diamond, and at which each of
     // those materials becomes mineable. One boundary, so a level-up lands as one big moment.
    wallAt: [1, 4, 8, 12],
    materialAt: { wood: 0, stone: 4, iron: 8, diamond: 12 },
    // enemies grow with the Keep too, so a strong base always has a fight on its hands
    enemyHpPerLevel: 0.05,
    enemyDmgPerLevel: 0.04,
    unlocks: { 2: 'Expand Village unlocked', 3: 'Barracks unlocked', 4: 'Stone quarries open', 6: 'Second expansion unlocked', 8: 'Iron seams open', 12: 'Diamond found in the deep rock', 15: 'Max level!' },
  },

  mining: { radius: 2.8, tick: 0.55, regrow: 9 },

  score: { earlyWavePerSecond: 4, kill: { knight: 10, elite: 25, brute: 20, boss: 200, thief: 40 }, coin: 1, material: 2, buildPerCoin: 2, buildPerMaterial: 3, soldierPerWave: 2, waveClear: 50, levelUp: 60, rescue: 150, recapture: 90 },

  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  // watchtowers: level 1 -> 3. Each level adds crew slots and sharpens the tower's arrows.
  tower: {
    range: 14, fireRate: 0.7, damage: 12,
    levels: [{ slots: 3, damage: 1, range: 1 }, { slots: 5, damage: 1.35, range: 1.15 }, { slots: 7, damage: 1.8, range: 1.3 }],
    upgrade: [{ cost: 30 }, { cost: 60 }],
  },
  gatePost: { height: 1.55 },
  // #18: the King's one ability. The warhorn pulls the army to him and drives them for a few
  // seconds, and the blast shoves nearby raiders back and stuns them: an answer to a breach.
  horn: { cooldown: 22, duration: 6, radius: 7.5, push: 3.4, stun: 1.3, speed: 1.6, damage: 1.5, rallySpeed: 2.2 },
  // "Train Archers" pad at the range: each level makes every archer hit harder and tougher
  archerTraining: { damage: 0.25, hp: 0.2 },

  // One currency. Its look (and score value) climbs with the Keep: bronze, then silver at level 4,
  // gold at 8, platinum at 12. Enemies drop more coins the higher their rank.
  coins: {
    tiers: ['bronze', 'silver', 'gold', 'platinum'],
    tierAt: [0, 4, 8, 12],
    score: { bronze: 1, silver: 3, gold: 8, platinum: 20 },
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
  },

  // The day / night cycle is the game's metronome: daylight is for gathering and building, the raid
  // comes at nightfall. `length` is one full cycle in seconds and `nightStart` is the point in it the
  // sun goes down, so a day is about 45 seconds and a night about 30: long enough for a round trip to
  // the far mining nodes and back.
  cycle: { length: 75, nightStart: 0.6, dawn: 0.98, warn: 8 },

  waves: {
    goal: 30, // survive this many nights to secure the kingdom
    hpGrowthPerWave: 0.04, // ranks (CFG.ranks) and Keep level (CFG.base) carry most of the scaling now
    dmgGrowthPerWave: 0.03,
    bossEvery: 5,
    stagger: 0.35,
    // a wave is mostly the current rank plus some lower ranks; from wave `from` on, 0-`max` scouts of
    // the NEXT rank sneak in as a taste of what levelling the Keep brings
    scouts: { from: 5, max: 2 },
    // thieves join raids once the King is carrying enough to be worth robbing
    thieves: { fromWave: 3, minCoins: 25, chance: 0.55, max: 2, warn: 4 },
    // enemy types also wait for the Keep (with a late wave fallback so a stalled game still varies)
    bruteAt: { level: 2, wave: 10 },
    eliteAt: { level: 5, wave: 18 },
  },

  regen: { delay: 4, perSecond: 3 },

  // pads only take payment once you STOP on them (or hold for a moment), so walking past costs nothing
  spend: { tick: 0.07, fastTick: 0.022, crewTick: 0.28, padRadius: 1.7, arm: 0.25, walkHold: 0.8 },

  arrow: { speed: 30, life: 2.0 },

  // Wall materials, in upgrade order. Named for what you actually mine, so "stone walls" means the
  // walls are made of the stone you carried to the Keep.
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
    { id: 'south', points: [[0, -4], [0, 8], [1, 20], [1, 32], [1, 49], [3, 62], [12, 80], [22, 96]] },
    { id: 'east', points: [[-6, 2], [11, 1.5], [24, 2], [36, 3.8], [53, 3], [66, 0], [80, -14], [96, -30]] },
    { id: 'west', points: [[-18, 4], [-22, 4], [-34, 4], [-50, 6], [-64, 2], [-80, -10], [-96, -20]] },
    { id: 'north', points: [[2, -18], [2, -24], [2, -40], [8, -58], [16, -76], [22, -96]] },
  ],
  roadWidth: 4.2,
  fields: [{ pos: [35, 19], size: [10, 7] }, { pos: [-20, 25], size: [8, 6] }, { pos: [10, 62], size: [10, 8] }],
};

// Village tiers. The village starts as tier 0 and each "Expand Village" pad moves it up one.
// Walls are generated around `bounds`; `gates` lists the gap on each side (along that side's axis).
export const TIERS = [
  { bounds: { x0: -14, x1: 14, z0: -11, z1: 11 }, gates: { south: [-2, 2], east: [-2, 2] }, sectionLen: 4 },
  { bounds: { x0: -22, x1: 24, z0: -13, z1: 20 }, gates: { south: [-1, 3], east: [0, 4], west: [2, 6] }, sectionLen: 4 },
  { bounds: { x0: -34, x1: 36, z0: -24, z1: 32 }, gates: { south: [-1, 3], east: [2, 6], west: [2, 6], north: [0, 4] }, sectionLen: 4.5 },
];

// Build pads. `requires` are ids that must have been built at least once; `minLevel` is the Keep level
// a pad needs before it appears. cost = coins; crew = archers taken from your army instead of coins.
// Materials (wood / stone / straw) only ever feed the Keep (CFG.base). `desc` is shown on the info screen.
// `buildAt` is where a structure appears; its pad sits right in front of it (pads for units spawn on the
// pad). Watchtowers stand in the fort's corners: their pad turns into "man the tower" and then "upgrade"
// pads on the same spot. Gate Guards get small posts beside each gate.
const T = (id, tier, pos, cost, buildAt) => ({ id, tier, pos, cost, icon: 'tower', label: 'Watchtower', structure: 'tower', buildAt, desc: 'Corner watchtower. Man it with archers, then upgrade it for more crew and sharper arrows.', toast: 'Watchtower built. It needs a crew!' });
const W = (id, tier, pos, cost, side, label) => ({ id, tier, pos, cost, icon: 'wall', label, requires: [tier === 1 ? 'expand1' : 'expand2'], wall: { tier, side }, desc: 'Walls this side of the new plot. Raiders must break through.' });
export const PADS = [
  // ---- tier 0: the starting plot (28 x 22) ----
  { id: 'range', tier: 0, pos: [8.5, -4], cost: 5, icon: 'bow', label: 'Archery Range', structure: 'hut', buildAt: [8.5, -8], desc: 'Lets you recruit archers.', toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', tier: 0, pos: [-4, 3], cost: 5, growth: 1, icon: 'archer', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 }, desc: 'Two archers join the King. The Keep level caps how many you can have.' },
  { id: 'train', tier: 0, pos: [8.5, -0.5], cost: 12, growth: 8, maxBuys: 5, icon: 'arrows', label: 'Train Archers', requires: ['recruit'], repeatable: true, effect: 'archerPower', desc: 'Every archer, now and later: +25% damage and +20% health per level.', toast: 'Archers trained: +25% damage, +20% health' },
  { id: 'keep', tier: 0, pos: [1, -4], cost: 15, res: { wood: 6 }, icon: 'keep', label: 'Royal Keep', requires: ['range'], structure: 'keep', buildAt: [1, -8], desc: 'Shelters the Queen. Feed it materials to level up your whole kingdom.', toast: 'The Queen is safe in the Keep. Feed it wood and stone to level up!' },
  { ...T('tower-0-ne', 0, [11, -7], 20, [12.6, -9.6]), requires: ['recruit'] },
  { ...T('tower-0-nw', 0, [-11, -7], 20, [-12.6, -9.6]), requires: ['recruit'] },
  { ...T('tower-0-se', 0, [10.5, 6.5], 20, [12.6, 9.6]), requires: ['recruit'] },
  { ...T('tower-0-sw', 0, [-10.5, 6.5], 20, [-12.6, 9.6]), requires: ['recruit'] },
  { id: 'palisade', tier: 0, pos: [-7, 5.5], cost: 20, icon: 'wall', label: 'Palisade', requires: ['recruit'], wall: { tier: 0, side: 'all' }, desc: 'A wooden wall around the plot with two gates. Upgrades to brick, stone and iron as the Keep levels.', toast: 'Palisade raised. Raiders must break through!' },
  { id: 'crew-gates1', tier: 0, pos: [0, 8], crew: 4, icon: 'shield', label: 'Gate Guards', requires: ['palisade'], posts: true, spots: [[-3.6, 9.4], [3.6, 9.4], [12.4, -3.6], [12.4, 3.6]], desc: 'Four archers take posts beside the gates.', toast: 'Archers now watch the gates from their posts.' },
  { id: 'expand1', tier: 0, pos: [4, 4.5], cost: 60, minLevel: 2, icon: 'expand', label: 'Expand Village', requires: ['palisade', 'keep'], effect: 'expand', desc: 'Grows the village onto a bigger plot with new pads, towers and the barracks.', toast: 'The village grows! Wall the new ground.' },
  { id: 'stable', tier: 0, pos: [-11, 2], cost: 25, icon: 'horse', label: 'Warhorse', requires: ['keep'], effect: 'horse', desc: 'The King rides: much faster around the map.', toast: 'The King rides! Much faster now.' },
  { id: 'bridge-south', tier: 0, pos: [1, 44], cost: 30, icon: 'bridge', label: 'South Bridge', requires: ['palisade'], bridge: 'south', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },
  { id: 'bridge-east', tier: 0, pos: [47, 3], cost: 30, icon: 'bridge', label: 'East Bridge', requires: ['palisade'], bridge: 'east', desc: 'Crosses the river: new land to mine, and new directions raiders can come from.', toast: 'Bridge built. New lands, and new raiders, across the river.' },

  // ---- tier 1 ----
  W('wall2-south', 1, [-6, 15], 25, 'south', 'South Wall'),
  W('wall2-east', 1, [18, 8], 25, 'east', 'East Wall'),
  W('wall2-west', 1, [-17, 8], 25, 'west', 'West Wall'),
  W('wall2-north', 1, [16, -11], 25, 'north', 'North Wall'),
  { id: 'crew-gates2', tier: 1, pos: [2, 13], crew: 6, icon: 'shield', label: 'Gate Guards', requires: ['wall2-south', 'wall2-east', 'wall2-west'], posts: true, spots: [[-2.6, 18.4], [4.6, 18.4], [22.4, -1.6], [22.4, 5.6], [-20.4, 0.4], [-20.4, 7.6]], desc: 'Six archers take posts beside the new gates.', toast: 'Archers now watch the new gates.' },
  { ...T('tower-1-nw', 1, [-18, -9], 25, [-20.6, -11.6]), requires: ['expand1'] },
  { ...T('tower-1-ne', 1, [20, -9], 25, [22.6, -11.6]), requires: ['expand1'] },
  { ...T('tower-1-sw', 1, [-18, 16], 25, [-20.6, 18.6]), requires: ['expand1'] },
  { ...T('tower-1-se', 1, [20, 16], 25, [22.6, 18.6]), requires: ['expand1'] },
  { id: 'barracks', tier: 1, pos: [12, 13], cost: 40, minLevel: 3, icon: 'swords', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [12, 16.5], desc: 'Lets you recruit swordsmen.', toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [8, 13], cost: 8, growth: 2, icon: 'swordsman', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 }, desc: 'Two swordsmen: tough melee fighters who charge whatever comes near the King.' },
  { id: 'crown', tier: 1, pos: [-6, 11], cost: 35, growth: 25, maxBuys: 3, icon: 'crown', label: 'Royal Guard', requires: ['expand1'], repeatable: true, effect: 'kinghp', desc: 'King max HP +80 and a full heal.', toast: 'King max HP +80 and fully healed' },
  { id: 'expand2', tier: 1, pos: [10, -9], cost: 150, minLevel: 6, icon: 'expand', label: 'Expand Village', requires: ['wall2-south', 'wall2-east', 'wall2-west', 'wall2-north', 'crew-gates2'], effect: 'expand', desc: 'The biggest plot: outer walls, four more towers and veteran archers.', toast: 'The kingdom grows again!' },

  // ---- tier 2 ----
  W('wall3-south', 2, [0, 26], 50, 'south', 'South Wall'),
  W('wall3-east', 2, [30, 10], 50, 'east', 'East Wall'),
  W('wall3-west', 2, [-28, 10], 50, 'west', 'West Wall'),
  W('wall3-north', 2, [10, -19], 50, 'north', 'North Wall'),
  { id: 'crew-gates3', tier: 2, pos: [10, 24], crew: 8, icon: 'shield', label: 'Gate Guards', requires: ['wall3-south', 'wall3-east', 'wall3-west', 'wall3-north'], posts: true, spots: [[-2.6, 30.4], [4.6, 30.4], [34.4, 0.4], [34.4, 7.6], [-32.4, 0.4], [-32.4, 7.6], [-1.6, -22.4], [5.6, -22.4]], desc: 'Eight archers take posts beside the outer gates.', toast: 'Archers now watch the outer gates.' },
  { ...T('tower-2-nw', 2, [-30, -20], 30, [-32.6, -22.6]), requires: ['expand2'] },
  { ...T('tower-2-ne', 2, [32, -20], 30, [34.6, -22.6]), requires: ['expand2'] },
  { ...T('tower-2-sw', 2, [-30, 28], 30, [-32.6, 30.6]), requires: ['expand2'] },
  { ...T('tower-2-se', 2, [32, 28], 30, [34.6, 30.6]), requires: ['expand2'] },
  { id: 'recruit-vet', tier: 2, pos: [-28, -10], cost: 30, growth: 10, icon: 'archer', label: '+3 Veteran Archers', requires: ['expand2'], repeatable: true, units: { type: 'archer', count: 3, veteran: true }, desc: 'Three veteran archers in gold: one and a half times a normal archer.' },
];

// Resource nodes the King mines by standing next to them. `stock` regrows over time. A node only
// appears once the Keep can use its material (CFG.base.materialAt), so each level-up opens new ground.
export const NODES = [
  // wood: close to home, available immediately
  { type: 'wood', pos: [-14, 12], stock: 8 }, { type: 'wood', pos: [-16.5, 14.5], stock: 8 }, { type: 'wood', pos: [-12.5, 15.5], stock: 8 }, { type: 'wood', pos: [-15, 17.5], stock: 8 },
  { type: 'wood', pos: [15, -15], stock: 8 }, { type: 'wood', pos: [18, -17], stock: 8 }, { type: 'wood', pos: [14.5, -18.5], stock: 8 },
  { type: 'wood', pos: [-44, 28], stock: 10 }, { type: 'wood', pos: [-47, 31], stock: 10 }, { type: 'wood', pos: [-42, 32], stock: 10 },
  // straw: the light binder, needed in small amounts all the way up
  { type: 'straw', pos: [35, 19], stock: 16 }, { type: 'straw', pos: [-20, 25], stock: 14 }, { type: 'straw', pos: [10, 62], stock: 20 },
  // stone: a walk out to the quarries
  { type: 'stone', pos: [-6, -15], stock: 14 }, { type: 'stone', pos: [-26, -29], stock: 16 }, { type: 'stone', pos: [-40, -20], stock: 16 },
  { type: 'stone', pos: [66, 12], stock: 24 }, { type: 'stone', pos: [24, 66], stock: 24 },
  // iron: a seam along the foot of the north-west mesas. Keep these OUTSIDE the cliff box
  // (x < CFG.cliffs.x AND z < CFG.cliffs.z), which the King is pushed out of and cannot mine in.
  { type: 'iron', pos: [-20, -30], stock: 14 }, { type: 'iron', pos: [-28, -29], stock: 14 }, { type: 'iron', pos: [-36, -28], stock: 16 },
  { type: 'iron', pos: [-46, -27], stock: 18 }, { type: 'iron', pos: [-10, -42], stock: 18 },
  // diamond: the deep rock, far out and across the river
  { type: 'diamond', pos: [72, 30], stock: 14 }, { type: 'diamond', pos: [78, 20], stock: 14 },
  { type: 'diamond', pos: [40, 64], stock: 16 }, { type: 'diamond', pos: [30, 74], stock: 16 },
];
