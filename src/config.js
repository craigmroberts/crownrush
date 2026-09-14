// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 190 },
  // the grey mesas in the north-west; nothing spawns or walks here
  cliffs: { x: -14, z: -33 },

  king: { speed: 7.5, footSpeed: 5.6, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 3.0 },
  queen: { hp: 90, speed: 7.2, follow: 1.9, targetWeight: 0.55 },
  keep: { hp: 420, hpPerLevel: 130, radius: 2.1, half: 1.7 },

  // The Keep is the base. Materials you mine go ONLY into the Keep; each level unlocks more.
  base: {
    maxLevel: 15,
    // materials needed to reach the NEXT level, indexed by the current level (level 0 = no keep yet)
    levels: [
      null,
      { wood: 10 },
      { wood: 12, stone: 6 },
      { wood: 14, stone: 10 },
      { wood: 16, stone: 12, straw: 6 },
      { wood: 18, stone: 14, straw: 8 },
      { wood: 20, stone: 16, straw: 10 },
      { wood: 22, stone: 20, straw: 12 },
      { wood: 24, stone: 22, straw: 14 },
      { wood: 26, stone: 26, straw: 16 },
      { wood: 30, stone: 30, straw: 18 },
      { wood: 34, stone: 34, straw: 20 },
      { wood: 38, stone: 38, straw: 24 },
      { wood: 42, stone: 42, straw: 28 },
      { wood: 46, stone: 46, straw: 32 },
    ],
    // how many archers / swordsmen the Keep supports at each level (tower crews count as archers)
    archers: [4, 6, 9, 12, 15, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 60],
    swordsmen: [0, 0, 0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30],
    // archery speed multiplier: 1x at level 1, 2x at level 8, 3x at level 15 (archers, towers, the King)
    fireRate: (level) => 1 + (2 * Math.max(0, level - 1)) / 14,
    // Keep level at which every wall becomes wood / brick / stone / iron (automatic, no wall pads)
    wallAt: [1, 4, 8, 12],
    // enemies grow with the Keep too, so a strong base always has a fight on its hands
    enemyHpPerLevel: 0.05,
    enemyDmgPerLevel: 0.04,
    unlocks: { 2: 'Expand Village unlocked', 3: 'Barracks unlocked', 4: 'Walls rebuilt in brick', 6: 'Second expansion unlocked', 8: 'Walls rebuilt in stone', 12: 'Walls rebuilt in iron', 15: 'Max level!' },
  },

  mining: { radius: 2.8, tick: 0.55, regrow: 9 },

  score: { earlyWavePerSecond: 4, kill: { knight: 10, elite: 25, brute: 20, boss: 200 }, coin: 1, material: 2, buildPerCoin: 2, buildPerMaterial: 3, soldierPerWave: 2, waveClear: 50, levelUp: 60 },

  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  // watchtowers: level 1 -> 3. Each level adds crew slots and sharpens the tower's arrows.
  tower: {
    range: 14, fireRate: 0.7, damage: 12,
    levels: [{ slots: 3, damage: 1, range: 1 }, { slots: 5, damage: 1.35, range: 1.15 }, { slots: 7, damage: 1.8, range: 1.3 }],
    upgrade: [{ cost: 6, coin: 'gold' }, { cost: 4, coin: 'platinum' }],
  },
  gatePost: { height: 1.55 },
  // "Train Archers" pad at the range: each level makes every archer hit harder and tougher
  archerTraining: { damage: 0.25, hp: 0.2 },

  // Coins come in four tiers. Enemies drop them by rank; pads charge a specific tier; the Exchange
  // converts cheap coins up at these rates.
  coins: {
    tiers: ['bronze', 'silver', 'gold', 'platinum'],
    score: { bronze: 1, silver: 3, gold: 8, platinum: 20 },
    exchange: [{ from: 'bronze', to: 'silver', rate: 5 }, { from: 'silver', to: 'gold', rate: 4 }, { from: 'gold', to: 'platinum', rate: 4 }],
    start: { bronze: 5, silver: 3, gold: 0, platinum: 0 },
  },

  // Enemy ranks: the colour they wear says how dangerous they are. Each rank multiplies the type's
  // stats and decides which coins drop. A rank joins the raids when the Keep reaches `fromLevel`;
  // waves themselves only add numbers (plus up to `waves.scouts.max` scouts of the next rank).
  ranks: [
    { name: 'Bandit', fromLevel: 0, hp: 1, damage: 1, tunic: 0x9a8663, trim: 0x5b4a33, dark: 0x3d3226, light: 0xe3d7b8, drops: { bronze: [1, 2] }, bonus: { silver: 0.3 } },
    { name: 'Raider', fromLevel: 3, hp: 1.5, damage: 1.35, tunic: 0xd8262c, trim: 0x8d1d22, dark: 0x2a2a30, light: 0xf0cfc4, drops: { silver: [1, 2], bronze: [1, 2] }, bonus: { gold: 0.15 } },
    { name: 'Marauder', fromLevel: 7, hp: 2.3, damage: 1.8, tunic: 0x7a3fd1, trim: 0x3a2263, dark: 0x201533, light: 0xd9c8f5, drops: { gold: [1, 2], silver: [1, 2] }, bonus: { platinum: 0.12 } },
    { name: 'Warlord', fromLevel: 11, hp: 3.6, damage: 2.5, tunic: 0x24232b, trim: 0xf5b800, dark: 0x101014, light: 0x4a4a55, drops: { platinum: [1, 2], gold: [1, 2] }, bonus: {} },
  ],

  enemy: {
    knight: { hp: 20, speed: 3.8, damage: 6, attackRate: 1.0, coins: [1, 2], radius: 0.5 },
    elite: { hp: 60, speed: 3.6, damage: 12, attackRate: 1.0, coins: [3, 4], radius: 0.55 },
    brute: { hp: 70, speed: 2.9, damage: 14, attackRate: 1.5, coins: [3, 5], radius: 0.8 },
    boss: { hp: 420, speed: 2.3, damage: 20, attackRate: 2.0, coins: [15, 22], radius: 2.2, aoe: 3.4 },
  },

  waves: {
    goal: 30, // clear this many waves to secure the kingdom
    firstDelay: 6,
    interval: 26,
    minInterval: 14,
    graceAfterClear: 25,
    hpGrowthPerWave: 0.04, // ranks (CFG.ranks) and Keep level (CFG.base) carry most of the scaling now
    dmgGrowthPerWave: 0.03,
    bossEvery: 5,
    stagger: 0.35,
    // a wave is mostly the current rank plus some lower ranks; from wave `from` on, 0-`max` scouts of
    // the NEXT rank sneak in as a taste of what levelling the Keep brings
    scouts: { from: 5, max: 2 },
    // enemy types also wait for the Keep (with a late wave fallback so a stalled game still varies)
    bruteAt: { level: 2, wave: 10 },
    eliteAt: { level: 5, wave: 18 },
  },

  regen: { delay: 4, perSecond: 3 },

  spend: { tick: 0.07, fastTick: 0.022, crewTick: 0.28, padRadius: 2.0 },

  arrow: { speed: 30, life: 2.0 },

  // wall materials, in upgrade order
  wallLevels: [
    { name: 'Wood', hp: 140, gateHp: 220, repair: 6 },
    { name: 'Brick', hp: 340, gateHp: 500, repair: 12 },
    { name: 'Stone', hp: 750, gateHp: 1050, repair: 20 },
    { name: 'Iron', hp: 1600, gateHp: 2200, repair: 35 },
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
// a pad needs before it appears. cost = coins of tier `coin` (bronze if omitted); crew = archers taken
// from your army instead of coins. Materials (wood / stone / straw) only ever feed the Keep (CFG.base).
// `buildAt` is where a structure appears; its pad sits right in front of it (pads for units spawn on the
// pad). Watchtowers stand in the fort's corners: their pad turns into "man the tower" and then "upgrade"
// pads on the same spot. Gate Guards get small posts beside each gate.
export const PADS = [
  // ---- tier 0: the starting plot (28 x 22) ----
  { id: 'range', tier: 0, pos: [8.5, -4], cost: 5, icon: 'bow', label: 'Archery Range', structure: 'hut', buildAt: [8.5, -8], toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', tier: 0, pos: [-4, 3], cost: 3, growth: 1, coin: 'silver', icon: 'archer', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 } },
  { id: 'train', tier: 0, pos: [8.5, -0.5], cost: 6, growth: 5, maxBuys: 5, coin: 'silver', icon: 'arrows', label: 'Train Archers', requires: ['recruit'], repeatable: true, effect: 'archerPower', toast: 'Archers trained: +25% damage, +20% health' },
  { id: 'keep', tier: 0, pos: [1, -4], cost: 15, res: { wood: 6 }, icon: 'keep', label: 'Royal Keep', requires: ['range'], structure: 'keep', buildAt: [1, -8], toast: 'The Queen is safe in the Keep. Feed it wood and stone to level up!' },
  { id: 'bank', tier: 0, pos: [-7, -4], cost: 10, icon: 'gold', label: 'Exchange', requires: ['range'], structure: 'bank', buildAt: [-7, -8], toast: 'Exchange open: trade small coins up for bigger ones.' },
  { id: 'tower-0-ne', tier: 0, pos: [11, -7], cost: 20, icon: 'tower', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [12.6, -9.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-0-nw', tier: 0, pos: [-11, -7], cost: 20, icon: 'tower', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [-12.6, -9.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-0-se', tier: 0, pos: [10.5, 6.5], cost: 20, icon: 'tower', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [12.6, 9.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-0-sw', tier: 0, pos: [-10.5, 6.5], cost: 20, icon: 'tower', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [-12.6, 9.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'palisade', tier: 0, pos: [-7, 5.5], cost: 20, icon: 'wall', label: 'Palisade', requires: ['recruit'], wall: { tier: 0, side: 'all' }, toast: 'Palisade raised. Raiders must break through!' },
  { id: 'crew-gates1', tier: 0, pos: [0, 8], crew: 4, icon: 'shield', label: 'Gate Guards', requires: ['palisade'], posts: true, spots: [[-3.6, 9.4], [3.6, 9.4], [12.4, -3.6], [12.4, 3.6]], toast: 'Archers now watch the gates from their posts.' },
  { id: 'expand1', tier: 0, pos: [4, 4.5], cost: 60, minLevel: 2, icon: 'expand', label: 'Expand Village', requires: ['palisade', 'keep'], effect: 'expand', toast: 'The village grows! Wall the new ground.' },
  { id: 'stable', tier: 0, pos: [-11, 2], cost: 12, coin: 'silver', icon: 'horse', label: 'Warhorse', requires: ['keep'], effect: 'horse', toast: 'The King rides! Much faster now.' },
  { id: 'bridge-south', tier: 0, pos: [1, 44], cost: 30, icon: 'bridge', label: 'South Bridge', requires: ['palisade'], bridge: 'south', toast: 'Bridge built. New lands, and new raiders, across the river.' },
  { id: 'bridge-east', tier: 0, pos: [47, 3], cost: 30, icon: 'bridge', label: 'East Bridge', requires: ['palisade'], bridge: 'east', toast: 'Bridge built. New lands, and new raiders, across the river.' },

  // ---- tier 1 ----
  { id: 'wall2-south', tier: 1, pos: [-6, 15], cost: 25, icon: 'wall', label: 'South Wall', requires: ['expand1'], wall: { tier: 1, side: 'south' } },
  { id: 'wall2-east', tier: 1, pos: [18, 8], cost: 25, icon: 'wall', label: 'East Wall', requires: ['expand1'], wall: { tier: 1, side: 'east' } },
  { id: 'wall2-west', tier: 1, pos: [-17, 8], cost: 25, icon: 'wall', label: 'West Wall', requires: ['expand1'], wall: { tier: 1, side: 'west' } },
  { id: 'wall2-north', tier: 1, pos: [16, -11], cost: 25, icon: 'wall', label: 'North Wall', requires: ['expand1'], wall: { tier: 1, side: 'north' } },
  { id: 'crew-gates2', tier: 1, pos: [2, 13], crew: 6, icon: 'shield', label: 'Gate Guards', requires: ['wall2-south', 'wall2-east', 'wall2-west'], posts: true, spots: [[-2.6, 18.4], [4.6, 18.4], [22.4, -1.6], [22.4, 5.6], [-20.4, 0.4], [-20.4, 7.6]], toast: 'Archers now watch the new gates.' },
  { id: 'tower-1-nw', tier: 1, pos: [-18, -9], cost: 25, icon: 'tower', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [-20.6, -11.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-1-ne', tier: 1, pos: [20, -9], cost: 25, icon: 'tower', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [22.6, -11.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-1-sw', tier: 1, pos: [-18, 16], cost: 25, icon: 'tower', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [-20.6, 18.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-1-se', tier: 1, pos: [20, 16], cost: 25, icon: 'tower', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [22.6, 18.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'barracks', tier: 1, pos: [12, 13], cost: 8, coin: 'gold', minLevel: 3, icon: 'swords', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [12, 16.5], toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [8, 13], cost: 3, growth: 1, coin: 'gold', icon: 'swordsman', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 } },
  { id: 'crown', tier: 1, pos: [-6, 11], cost: 10, growth: 8, maxBuys: 3, coin: 'gold', icon: 'crown', label: 'Royal Guard', requires: ['expand1'], repeatable: true, effect: 'kinghp', toast: 'King max HP +80 and fully healed' },
  { id: 'expand2', tier: 1, pos: [10, -9], cost: 150, minLevel: 6, icon: 'expand', label: 'Expand Village', requires: ['wall2-south', 'wall2-east', 'wall2-west', 'wall2-north', 'crew-gates2'], effect: 'expand', toast: 'The kingdom grows again!' },

  // ---- tier 2 ----
  { id: 'wall3-south', tier: 2, pos: [0, 26], cost: 50, icon: 'wall', label: 'South Wall', requires: ['expand2'], wall: { tier: 2, side: 'south' } },
  { id: 'wall3-east', tier: 2, pos: [30, 10], cost: 50, icon: 'wall', label: 'East Wall', requires: ['expand2'], wall: { tier: 2, side: 'east' } },
  { id: 'wall3-west', tier: 2, pos: [-28, 10], cost: 50, icon: 'wall', label: 'West Wall', requires: ['expand2'], wall: { tier: 2, side: 'west' } },
  { id: 'wall3-north', tier: 2, pos: [10, -19], cost: 50, icon: 'wall', label: 'North Wall', requires: ['expand2'], wall: { tier: 2, side: 'north' } },
  { id: 'crew-gates3', tier: 2, pos: [10, 24], crew: 8, icon: 'shield', label: 'Gate Guards', requires: ['wall3-south', 'wall3-east', 'wall3-west', 'wall3-north'], posts: true, spots: [[-2.6, 30.4], [4.6, 30.4], [34.4, 0.4], [34.4, 7.6], [-32.4, 0.4], [-32.4, 7.6], [-1.6, -22.4], [5.6, -22.4]], toast: 'Archers now watch the outer gates.' },
  { id: 'tower-2-nw', tier: 2, pos: [-30, -20], cost: 30, icon: 'tower', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [-32.6, -22.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-2-ne', tier: 2, pos: [32, -20], cost: 30, icon: 'tower', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [34.6, -22.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-2-sw', tier: 2, pos: [-30, 28], cost: 30, icon: 'tower', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [-32.6, 30.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'tower-2-se', tier: 2, pos: [32, 28], cost: 30, icon: 'tower', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [34.6, 30.6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'recruit-vet', tier: 2, pos: [-28, -10], cost: 2, growth: 1, coin: 'platinum', icon: 'archer', label: '+3 Veteran Archers', requires: ['expand2'], repeatable: true, units: { type: 'archer', count: 3, veteran: true } },
];

// Resource nodes the King mines by standing next to them. `stock` regrows over time.
export const NODES = [
  { type: 'wood', pos: [-14, 12], stock: 8 }, { type: 'wood', pos: [-16.5, 14.5], stock: 8 }, { type: 'wood', pos: [-12.5, 15.5], stock: 8 }, { type: 'wood', pos: [-15, 17.5], stock: 8 },
  { type: 'wood', pos: [15, -15], stock: 8 }, { type: 'wood', pos: [18, -17], stock: 8 }, { type: 'wood', pos: [14.5, -18.5], stock: 8 },
  { type: 'wood', pos: [-44, 28], stock: 10 }, { type: 'wood', pos: [-47, 31], stock: 10 }, { type: 'wood', pos: [-42, 32], stock: 10 },
  { type: 'stone', pos: [-6, -15], stock: 14 }, { type: 'stone', pos: [-26, -29], stock: 16 }, { type: 'stone', pos: [-40, -20], stock: 16 },
  { type: 'stone', pos: [66, 12], stock: 24 }, { type: 'stone', pos: [24, 66], stock: 24 },
  { type: 'straw', pos: [35, 19], stock: 16 }, { type: 'straw', pos: [-20, 25], stock: 14 }, { type: 'straw', pos: [10, 62], stock: 20 },
];
