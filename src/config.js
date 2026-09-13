// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 190 },
  // the grey mesas in the north-west; nothing spawns or walks here
  cliffs: { x: -14, z: -33 },

  king: { speed: 7.5, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 3.0 },

  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  tower: { range: 14, fireRate: 0.7, damage: 12 },

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
    graceAfterClear: 4,
    hpGrowthPerWave: 0.08,
    dmgGrowthPerWave: 0.05,
    bossEvery: 5,
    stagger: 0.35,
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

// Village tiers. The village starts as tier 0 and each "Expand Village" pad moves it up one.
// Walls are generated around `bounds`; `gates` lists the gap on each side (along that side's axis).
export const TIERS = [
  { bounds: { x0: -11, x1: 11, z0: -9, z1: 9 }, gates: { south: [-2, 2], east: [-2, 2] }, sectionLen: 4 },
  { bounds: { x0: -22, x1: 24, z0: -13, z1: 20 }, gates: { south: [-1, 3], east: [0, 4], west: [2, 6] }, sectionLen: 4 },
  { bounds: { x0: -34, x1: 36, z0: -24, z1: 32 }, gates: { south: [-1, 3], east: [2, 6], west: [2, 6], north: [0, 4] }, sectionLen: 4.5 },
];

// Build pads. `requires` are ids that must have been built at least once.
// cost = coins; crew = archers taken from your army instead of coins.
// `buildAt` is where a structure appears (pads for units spawn on the pad itself).
export const PADS = [
  // ---- tier 0: the starting plot ----
  { id: 'range', tier: 0, pos: [-3, -5], cost: 5, icon: '🏹', label: 'Archery Range', structure: 'hut', buildAt: [-7.5, -5.5], toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', tier: 0, pos: [-3, -0.5], cost: 5, growth: 1, icon: '🏹', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 } },
  { id: 'bows', tier: 0, pos: [2, -6], cost: 12, growth: 12, maxBuys: 5, icon: '⬆️', label: 'Sharper Arrows', requires: ['range'], repeatable: true, effect: 'damage', toast: 'Arrows +40% damage' },
  { id: 'tower1', tier: 0, pos: [6, -2], cost: 20, icon: '🗼', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [7.5, -6], toast: 'Watchtower built. It needs a crew!' },
  { id: 'crew-tower1', tier: 0, pos: [6, 2], crew: 3, icon: '🏹', label: 'Man the Tower', requires: ['tower1'], tower: 'tower1', toast: 'Tower manned!' },
  { id: 'palisade', tier: 0, pos: [-7, 3.5], cost: 15, icon: '🪵', label: 'Palisade', requires: ['tower1'], wall: { tier: 0, side: 'all' }, toast: 'Palisade raised. Raiders must break through!' },
  { id: 'crew-gates1', tier: 0, pos: [-2, 5], crew: 4, icon: '🛡️', label: 'Gate Guards', requires: ['palisade'], spots: [[-3.2, 7.6, 0], [3.2, 7.6, 0], [9.6, -3.2, 0], [9.6, 3.2, 0]], toast: 'Archers now guard the gates.' },
  { id: 'brick', tier: 0, pos: [-7, -1], cost: 45, icon: '🧱', label: 'Brick Walls', requires: ['palisade'], effect: 'wallLevel', toast: 'Walls rebuilt in brick!' },
  { id: 'expand1', tier: 0, pos: [3, 5], cost: 50, icon: '🏰', label: 'Expand Village', requires: ['palisade', 'crew-tower1'], effect: 'expand', toast: 'The village grows! Wall the new ground.' },

  // ---- tier 1 ----
  { id: 'wall2-south', tier: 1, pos: [-6, 15], cost: 20, icon: '🪵', label: 'South Wall', requires: ['expand1'], wall: { tier: 1, side: 'south' } },
  { id: 'wall2-east', tier: 1, pos: [18, 8], cost: 20, icon: '🪵', label: 'East Wall', requires: ['expand1'], wall: { tier: 1, side: 'east' } },
  { id: 'wall2-west', tier: 1, pos: [-17, 8], cost: 20, icon: '🪵', label: 'West Wall', requires: ['expand1'], wall: { tier: 1, side: 'west' } },
  { id: 'wall2-north', tier: 1, pos: [16, -11], cost: 20, icon: '🪵', label: 'North Wall', requires: ['expand1'], wall: { tier: 1, side: 'north' } },
  { id: 'crew-gates2', tier: 1, pos: [2, 13], crew: 6, icon: '🛡️', label: 'Gate Guards', requires: ['wall2-south', 'wall2-east', 'wall2-west'], spots: [[-2.2, 18.6, 0], [4.2, 18.6, 0], [22.6, -1.3, 0], [22.6, 5.3, 0], [-20.6, 0.7, 0], [-20.6, 7.3, 0]], toast: 'Archers now guard the new gates.' },
  { id: 'tower2', tier: 1, pos: [-16, 0], cost: 30, icon: '🗼', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [-18, -4], toast: 'Watchtower built. It needs a crew!' },
  { id: 'crew-tower2', tier: 1, pos: [-16, 4], crew: 3, icon: '🏹', label: 'Man the Tower', requires: ['tower2'], tower: 'tower2', toast: 'Tower manned!' },
  { id: 'tower3', tier: 1, pos: [16, -6], cost: 35, icon: '🗼', label: 'Watchtower', requires: ['expand1'], structure: 'tower', buildAt: [19, -3], toast: 'Watchtower built. It needs a crew!' },
  { id: 'crew-tower3', tier: 1, pos: [14, -2], crew: 3, icon: '🏹', label: 'Man the Tower', requires: ['tower3'], tower: 'tower3', toast: 'Tower manned!' },
  { id: 'barracks', tier: 1, pos: [8, 14], cost: 40, icon: '⚔️', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [12, 16.5], toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [13, 12], cost: 8, growth: 2, icon: '⚔️', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 } },
  { id: 'crown', tier: 1, pos: [-6, 11], cost: 35, growth: 25, maxBuys: 3, icon: '👑', label: 'Royal Guard', requires: ['expand1'], repeatable: true, effect: 'kinghp', toast: 'King max HP +80 and fully healed' },
  { id: 'stone', tier: 1, pos: [-12, 14], cost: 110, icon: '🪨', label: 'Stone Walls', requires: ['brick', 'wall2-south', 'wall2-east', 'wall2-west', 'wall2-north'], effect: 'wallLevel', toast: 'Walls rebuilt in stone!' },
  { id: 'expand2', tier: 1, pos: [20, 15], cost: 130, icon: '🏰', label: 'Expand Village', requires: ['wall2-south', 'wall2-east', 'wall2-west', 'wall2-north', 'crew-gates2'], effect: 'expand', toast: 'The kingdom grows again!' },

  // ---- tier 2 ----
  { id: 'wall3-south', tier: 2, pos: [0, 26], cost: 40, icon: '🪵', label: 'South Wall', requires: ['expand2'], wall: { tier: 2, side: 'south' } },
  { id: 'wall3-east', tier: 2, pos: [30, 10], cost: 40, icon: '🪵', label: 'East Wall', requires: ['expand2'], wall: { tier: 2, side: 'east' } },
  { id: 'wall3-west', tier: 2, pos: [-28, 10], cost: 40, icon: '🪵', label: 'West Wall', requires: ['expand2'], wall: { tier: 2, side: 'west' } },
  { id: 'wall3-north', tier: 2, pos: [10, -19], cost: 40, icon: '🪵', label: 'North Wall', requires: ['expand2'], wall: { tier: 2, side: 'north' } },
  { id: 'crew-gates3', tier: 2, pos: [10, 24], crew: 8, icon: '🛡️', label: 'Gate Guards', requires: ['wall3-south', 'wall3-east', 'wall3-west', 'wall3-north'], spots: [[-2.2, 30.6, 0], [4.2, 30.6, 0], [34.6, 0.7, 0], [34.6, 7.3, 0], [-32.6, 0.7, 0], [-32.6, 7.3, 0], [-1.3, -22.6, 0], [5.3, -22.6, 0]], toast: 'Archers now guard the outer gates.' },
  { id: 'tower4', tier: 2, pos: [-28, 20], cost: 50, icon: '🗼', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [-30, 26], toast: 'Watchtower built. It needs a crew!' },
  { id: 'crew-tower4', tier: 2, pos: [-28, 16], crew: 3, icon: '🏹', label: 'Man the Tower', requires: ['tower4'], tower: 'tower4', toast: 'Tower manned!' },
  { id: 'tower5', tier: 2, pos: [30, -15], cost: 50, icon: '🗼', label: 'Watchtower', requires: ['expand2'], structure: 'tower', buildAt: [32, -20], toast: 'Watchtower built. It needs a crew!' },
  { id: 'crew-tower5', tier: 2, pos: [26, -15], crew: 3, icon: '🏹', label: 'Man the Tower', requires: ['tower5'], tower: 'tower5', toast: 'Tower manned!' },
  { id: 'recruit-elite', tier: 2, pos: [-28, -10], cost: 10, growth: 2, icon: '🏹', label: '+3 Archers', requires: ['expand2'], repeatable: true, units: { type: 'archer', count: 3 } },
  { id: 'iron', tier: 2, pos: [-28, 0], cost: 240, icon: '⚙️', label: 'Iron Walls', requires: ['stone', 'wall3-south', 'wall3-east', 'wall3-west', 'wall3-north'], effect: 'wallLevel', toast: 'Walls rebuilt in iron!' },
];
