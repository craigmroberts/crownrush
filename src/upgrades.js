// Upgrades offered three at a time when the Keep levels up (see Game.offerUpgrades).
//
// Each one sets a multiplier or a flag on `game.mods`; the places that read those are the only
// gameplay code an upgrade touches, which keeps adding a new one cheap. `pool` exists so an offer
// can avoid showing three variations of the same idea.

export const MODS = {
  carryBonus: 0,
  archerDamage: 1,
  archerHp: 1,
  archerRange: 1,
  recruitBonus: 0,
  towerDamage: 1,
  towerRange: 1,
  towerSlots: 0,
  wallHp: 1,
  wallThorns: 0,
  pickup: 1,
  coinBonus: 0,
  mineSpeed: 1,
  kingSpeed: 1,
  kingArrows: 1,
  regen: 1,
};

const mul = (key, by) => (g) => { g.mods[key] *= by; };
const add = (key, by) => (g) => { g.mods[key] += by; };

export const UPGRADES = [
  // ---- army ----
  { id: 'keen-eye', pool: 'army', icon: 'arrows', name: 'Keen Eye', desc: 'Your archers deal 30% more damage.', apply: mul('archerDamage', 1.3) },
  { id: 'hardened', pool: 'army', icon: 'archer', name: 'Hardened', desc: 'Your archers have 40% more health.', apply: mul('archerHp', 1.4) },
  { id: 'longbows', pool: 'army', icon: 'bow', name: 'Longbows', desc: 'Your archers shoot 30% further.', apply: mul('archerRange', 1.3) },
  { id: 'volunteers', pool: 'army', icon: 'person', name: 'Volunteers', desc: 'Every recruit pad brings one extra soldier.', max: 3, apply: add('recruitBonus', 1) },

  // ---- towers ----
  { id: 'fletchers', pool: 'towers', icon: 'tower', name: "Fletcher's Workshop", desc: 'Watchtowers deal 50% more damage.', apply: mul('towerDamage', 1.5) },
  { id: 'spotters', pool: 'towers', icon: 'tower', name: 'Spotters', desc: 'Watchtowers see and shoot 30% further.', apply: mul('towerRange', 1.3) },
  { id: 'wider-decks', pool: 'towers', icon: 'shield', name: 'Wider Decks', desc: 'Every watchtower holds one more archer.', max: 2, apply: add('towerSlots', 1) },

  // ---- walls ----
  { id: 'deep-footings', pool: 'walls', icon: 'wall', name: 'Deep Footings', desc: 'Walls and gates have 40% more health.', apply: mul('wallHp', 1.4) },
  { id: 'spiked-walls', pool: 'walls', icon: 'wall', name: 'Spiked Walls', desc: 'Raiders hurt themselves attacking your walls.', max: 3, apply: add('wallThorns', 5) },

  // ---- economy ----
  { id: 'lodestone', pool: 'economy', icon: 'coin', name: 'Lodestone', desc: 'Coins are pulled to you from much further away.', max: 2, apply: mul('pickup', 1.8) },
  { id: 'plunder', pool: 'economy', icon: 'coin', name: 'Plunder', desc: 'Every raider you kill drops an extra coin.', max: 3, apply: add('coinBonus', 1) },
  { id: 'sharp-tools', pool: 'economy', icon: 'hammer', name: 'Sharp Tools', desc: 'You mine 45% faster.', max: 2, apply: mul('mineSpeed', 1.45) },
  { id: 'packhorse', pool: 'economy', icon: 'horse', name: 'Packhorse', desc: 'Carry 8 more before you have to sell at the trade post.', max: 3, apply: add('carryBonus', 1) },

  // ---- the King ----
  { id: 'swift', pool: 'king', icon: 'horse', name: 'Swift', desc: 'The King moves 20% faster on foot and mounted.', max: 3, apply: mul('kingSpeed', 1.2) },
  { id: 'split-shot', pool: 'king', icon: 'arrows', name: 'Split Shot', desc: 'The King looses an extra arrow with every shot.', max: 2, rare: true, apply: add('kingArrows', 1) },
  { id: 'field-surgeon', pool: 'king', icon: 'crown', name: 'Field Surgeon', desc: 'Everyone recovers health twice as fast.', apply: mul('regen', 2) },
];

// Three upgrades the player has not exhausted, from three different pools where possible.
export function pickOffer(taken, count = 3) {
  const available = UPGRADES.filter((u) => (taken[u.id] || 0) < (u.max || 1));
  const offer = [];
  const pools = new Set();
  const pass = (allowRepeatPool) => {
    const shuffled = available.filter((u) => !offer.includes(u)).sort(() => Math.random() - 0.5);
    for (const u of shuffled) {
      if (offer.length >= count) return;
      if (!allowRepeatPool && pools.has(u.pool)) continue;
      offer.push(u);
      pools.add(u.pool);
    }
  };
  pass(false); // one per pool first, so an offer is never three flavours of the same idea
  pass(true); // then fill if the pools ran dry
  return offer;
}
