// Balance + tuning. Everything gameplay-related that you might want to tweak lives here.
export const CFG = {
  world: { size: 170 },

  king: { speed: 7.5, hp: 140, range: 8.5, fireRate: 1.2, damage: 10, pickupRadius: 2.4 },

  archer: { hp: 30, range: 9.5, fireRate: 0.9, damage: 10, speed: 9 },
  swordsman: { hp: 70, range: 1.4, fireRate: 1.1, damage: 14, speed: 8.5, aggro: 5 },

  tower: { range: 14, fireRate: 0.7, damage: 12, archers: 3 },

  enemy: {
    knight: { hp: 20, speed: 3.3, damage: 6, attackRate: 1.0, coins: [1, 2], radius: 0.5 },
    brute: { hp: 70, speed: 2.5, damage: 14, attackRate: 1.5, coins: [3, 5], radius: 0.8 },
    boss: { hp: 420, speed: 2.0, damage: 20, attackRate: 2.0, coins: [15, 22], radius: 2.2, aoe: 3.4 },
  },

  waves: {
    firstDelay: 5,
    interval: 24,
    graceAfterClear: 4,
    hpGrowthPerWave: 0.08,
    bossEvery: 5,
    spawnRadius: [24, 30],
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
  { id: 'tower1', pos: [7, -6], cost: 20, icon: '🗼', label: 'Watchtower', requires: ['recruit'], structure: 'tower', buildAt: [10.5, -8.5], toast: 'Watchtower built!' },
  { id: 'palisade', pos: [7, -1], cost: 25, icon: '🪵', label: 'Palisade', requires: ['tower1'], structure: 'palisade', toast: 'Palisade raised!' },
  { id: 'tower2', pos: [-9, 3], cost: 30, icon: '🗼', label: 'Watchtower', requires: ['palisade'], structure: 'tower', buildAt: [-13, 5], toast: 'Watchtower built!' },
  { id: 'expand', pos: [2, 6], cost: 40, icon: '🏰', label: 'Expand Village', requires: ['palisade'], toast: 'Village expanded! New pads unlocked.' },
  { id: 'barracks', pos: [10, 5], cost: 40, icon: '⚔️', label: 'Barracks', requires: ['expand'], structure: 'barracks', buildAt: [15, 7], toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', pos: [10, 10], cost: 8, growth: 3, icon: '⚔️', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 } },
  { id: 'crown', pos: [-3, 11], cost: 35, growth: 25, maxBuys: 3, icon: '👑', label: 'Royal Guard', requires: ['expand'], repeatable: true, effect: 'kinghp', toast: 'King max HP +80 and fully healed' },
  { id: 'tower3', pos: [15, -1], cost: 45, icon: '🗼', label: 'Watchtower', requires: ['expand'], structure: 'tower', buildAt: [19, -4], toast: 'Watchtower built!' },
  { id: 'tower4', pos: [-12, 12], cost: 60, icon: '🗼', label: 'Watchtower', requires: ['tower3'], structure: 'tower', buildAt: [-16, 14], toast: 'Watchtower built!' },
  { id: 'recruit-elite', pos: [3, 15], cost: 10, growth: 3, icon: '🏹', label: '+3 Archers', requires: ['tower4'], repeatable: true, units: { type: 'archer', count: 3 } },
];
