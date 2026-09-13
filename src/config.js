// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 170 },

  king: { speed: 7.5, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 3.0 },

  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  tower: { range: 14, fireRate: 0.7, damage: 12, archers: 3 },

  enemy: {
    knight: { hp: 20, speed: 3.8, damage: 6, attackRate: 1.0, coins: [1, 2], radius: 0.5 },
    brute: { hp: 70, speed: 2.9, damage: 14, attackRate: 1.5, coins: [3, 5], radius: 0.8 },
    boss: { hp: 420, speed: 2.3, damage: 20, attackRate: 2.0, coins: [15, 22], radius: 2.2, aoe: 3.4 },
  },

  waves: {
    firstDelay: 5,
    interval: 24,
    graceAfterClear: 4,
    hpGrowthPerWave: 0.08,
    bossEvery: 5,
    spawnRadius: [30, 36],
    stagger: 0.35,
  },

  regen: { delay: 4, perSecond: 4 },

  spend: { tick: 0.07, padRadius: 2.0 },

  arrow: { speed: 30, life: 2.0 },
};

// Build pads. `requires` are ids that must have been built at least once.
// `buildAt` is where the structure appears (pads for units spawn on the pad itself).
export const PADS = [
  { id: 'range', pos: [-4, -7], cost: 5, icon: '🏹', label: 'Archery Range', structure: 'hut', buildAt: [-9, -7], toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', pos: [-4, -2.5], cost: 5, growth: 2, icon: '🏹', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 } },
  { id: 'bows', pos: [1, -8], cost: 12, growth: 12, maxBuys: 5, icon: '⬆️', label: 'Sharper Arrows', requires: ['range'], repeatable: true, effect: 'damage', toast: 'Arrows +40% damage' },
  { id: 'tower1', pos: [7, -6], cost: 20, icon: '🗼', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [10.5, -8.5], toast: 'Watchtower built! Now wall the village.' },
  { id: 'wall-south', pos: [-9, 15], cost: 15, icon: '🪵', label: 'South Wall', requires: ['tower1'], structure: 'wall', wall: 'south', toast: 'South wall raised. Raiders must break through!' },
  { id: 'wall-east', pos: [19, 12], cost: 15, icon: '🪵', label: 'East Wall', requires: ['wall-south'], structure: 'wall', wall: 'east' },
  { id: 'wall-west', pos: [-18, 0], cost: 15, icon: '🪵', label: 'West Wall', requires: ['wall-south'], structure: 'wall', wall: 'west' },
  { id: 'wall-north', pos: [16, -10], cost: 15, icon: '🪵', label: 'North Wall', requires: ['wall-east'], structure: 'wall', wall: 'north' },
  { id: 'gate-guards', pos: [6, 12], cost: 20, icon: '🛡️', label: 'Gate Guards', requires: ['wall-south', 'wall-east'], turrets: [[-2.3, 18.6, 0], [4.3, 18.6, 0], [22.6, -1.3, 0], [22.6, 5.3, 0]], toast: 'Archers now guard the gates.' },
  { id: 'wall-towers', pos: [-9, 8], cost: 35, icon: '🗼', label: 'Wall Towers', requires: ['wall-north', 'wall-west'], structure: 'corner-towers', toast: 'Corner towers manned!' },
  { id: 'tower2', pos: [-9, 3], cost: 30, icon: '🗼', label: 'Watchtower', requires: ['wall-west'], structure: 'tower', buildAt: [-13, 5], toast: 'Watchtower built!' },
  { id: 'expand', pos: [2, 6], cost: 40, icon: '🏰', label: 'Expand Village', requires: ['wall-towers'], toast: 'Village expanded! New pads unlocked.' },
  { id: 'barracks', pos: [10, 5], cost: 40, icon: '⚔️', label: 'Barracks', requires: ['expand'], structure: 'barracks', buildAt: [15, 7], toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', pos: [10, 10], cost: 8, growth: 3, icon: '⚔️', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 } },
  { id: 'crown', pos: [-3, 11], cost: 35, growth: 25, maxBuys: 3, icon: '👑', label: 'Royal Guard', requires: ['expand'], repeatable: true, effect: 'kinghp', toast: 'King max HP +80 and fully healed' },
  { id: 'tower3', pos: [15, -1], cost: 45, icon: '🗼', label: 'Watchtower', requires: ['expand'], structure: 'tower', buildAt: [19, -4], toast: 'Watchtower built!' },
  { id: 'tower4', pos: [-12, 12], cost: 60, icon: '🗼', label: 'Watchtower', requires: ['tower3'], structure: 'tower', buildAt: [-16, 14], toast: 'Watchtower built!' },
  { id: 'recruit-elite', pos: [12, 15], cost: 10, growth: 3, icon: '🏹', label: '+3 Archers', requires: ['tower4'], repeatable: true, units: { type: 'archer', count: 3 } },
];

// The palisade. Each wall is a list of sections along one edge of the village rectangle;
// a section is [from, to] along the edge, or { gate: [from, to] } for a gate the King can walk through.
export const WALLS = {
  bounds: { x0: -22, x1: 24, z0: -13, z1: 20 },
  center: [1, 3],
  hp: 140,
  gateHp: 220,
  repairCost: 6,
  south: [[-22, -14], [-14, -6], [-6, -1], { gate: [-1, 3] }, [3, 10], [10, 17], [17, 24]],
  east: [[-13, -6], [-6, 0], { gate: [0, 4] }, [4, 12], [12, 20]],
  north: [[-22, -15], [-15, -8], [-8, 0], [0, 8], [8, 16], [16, 24]],
  west: [[-13, -5], [-5, 3], [3, 12], [12, 20]],
};
