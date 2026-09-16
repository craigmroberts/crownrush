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

// #107: a card says what the player will SEE, not what the multiplier is. "30% more damage" is an
// arithmetic instruction against `CFG.archer.damage`, a number that is on no screen in the game, in
// the two or three seconds a paused run gives you to choose one of three. The ask was for "1x
// faster"; taken literally that is a bug -- x1 is the speed you already have -- and "1.3x" reads
// worse than the percentage it would replace, so the wording below is neither.
//
// Size is carried by one ladder of words, anchored on the two cards that were already written this
// way and did not need changing: Lodestone's "much further" (x1.35) and Field Surgeon's "twice as
// fast" (x2).
//
//   x1.2 -> a bare comparative    x1.3-1.35 -> "much"    x1.4-1.5 -> "far"    x2 -> "twice"
//
// Two cards stay rankable because `pickOffer` takes one per pool: an offer never puts two cards
// about the same number beside each other, so the choice on screen is "archers or walls tonight",
// which the percentages were no help with either.
//
// Generating the sentence from the multiplier was tried and dropped. The coefficient knows 1.3; it
// does not know that raiders fall sooner, that a bag fills before dusk, or that a watchtower covers
// ground -- so a generated line is the percentage again with a vague word where the number was,
// which is the thing being removed. The rule is instead that the sentence and the multiplier share a
// line, and the sentence has to stay true of the number sitting next to it.
// #115: what a card TOUCHES, in the player's words. Reported from play: "i dont understand the titles
// quick enough for the options, i feel like they could be clearer."
//
// The names are flavour and the descriptions carry all the information, so three cards side by side
// mid-raid mean three descriptions read or none. The pool was already on every upgrade and reached
// nothing on screen -- and `pickOffer` takes one card per pool, so the three labels on an offer are
// always three different ones. That makes this label the actual decision the panel is asking about:
// archers or towers or walls tonight. It is the one thing that can be read without reading.
//
// Kept as a label rather than folded into the names. The names are the game's voice and they scan
// fine once the area is known -- "Deep Footings" is only opaque until something says "your walls".
// The alternative, plain functional titles ("Wall Health", "Tower Range"), was considered and is a
// bigger change to make on a guess; the label is free and reversible.
export const POOL_NAME = {
  army: 'Your army',
  towers: 'Watchtowers',
  walls: 'Your walls',
  economy: 'Coin and mining',
  king: 'The King',
};

export const UPGRADES = [
  // ---- army ----
  { id: 'keen-eye', pool: 'army', icon: 'arrows', name: 'Keen Eye', desc: 'Your archers hit much harder, and raiders drop sooner.', apply: mul('archerDamage', 1.3) },
  { id: 'hardened', pool: 'army', icon: 'archer', name: 'Hardened', desc: 'Your archers take far more punishment before they fall.', apply: mul('archerHp', 1.4) },
  { id: 'longbows', pool: 'army', icon: 'bow', name: 'Longbows', desc: 'Your archers open fire much sooner, before raiders can reach them.', apply: mul('archerRange', 1.3) },
  { id: 'volunteers', pool: 'army', icon: 'person', name: 'Volunteers', desc: 'Every recruit pad brings one extra soldier.', max: 3, apply: add('recruitBonus', 1) },

  // ---- towers ----
  { id: 'fletchers', pool: 'towers', icon: 'tower', name: "Fletcher's Workshop", desc: 'Watchtowers cut raiders down far faster.', apply: mul('towerDamage', 1.5) },
  { id: 'spotters', pool: 'towers', icon: 'tower', name: 'Spotters', desc: 'Watchtowers cover much more ground and shoot raiders further out.', apply: mul('towerRange', 1.3) },
  { id: 'wider-decks', pool: 'towers', icon: 'shield', name: 'Wider Decks', desc: 'Every watchtower holds one more archer.', max: 2, apply: add('towerSlots', 1) },

  // ---- walls ----
  { id: 'deep-footings', pool: 'walls', icon: 'wall', name: 'Deep Footings', desc: 'Your walls and gates hold out far longer.', apply: mul('wallHp', 1.4) },
  { id: 'spiked-walls', pool: 'walls', icon: 'wall', name: 'Spiked Walls', desc: 'Raiders hurt themselves attacking your walls.', max: 3, apply: add('wallThorns', 5) },

  // ---- economy ----
  // #103: 1.35, down from 1.8. The pickup radius is now the circle drawn under the King, so it has to
  // be a size that can be drawn: at 1.8 stacked twice the reach was 11.99 and the circle ran clean off
  // a phone screen, leaving the King with no mark under him at all -- measured, not guessed. 1.35
  // takes the full stack to 6.74, which fills most of the width and stays on it. Both stacks still
  // land (3.7 -> 5.0 -> 6.74) and the full stack is still 82% further than bare, which is what the
  // card promises. It is a real cut to how much ground a stacked Lodestone sweeps, and it buys the
  // player an upgrade whose effect is on the screen rather than in a number nobody can see.
  { id: 'lodestone', pool: 'economy', icon: 'coin', name: 'Lodestone', desc: 'Coins are pulled to you from much further away.', max: 2, apply: mul('pickup', 1.35) },
  { id: 'plunder', pool: 'economy', icon: 'coin', name: 'Plunder', desc: 'Every raider you kill drops an extra coin.', max: 3, apply: add('coinBonus', 1) },
  { id: 'sharp-tools', pool: 'economy', icon: 'hammer', name: 'Sharp Tools', desc: 'You mine far quicker, so a full bag takes less of the day.', max: 2, apply: mul('mineSpeed', 1.45) },
  { id: 'packhorse', pool: 'economy', icon: 'horse', name: 'Packhorse', desc: 'Carry 8 more before you have to sell at the trade post.', max: 3, apply: add('carryBonus', 1) },

  // ---- the King ----
  { id: 'swift', pool: 'king', icon: 'horse', name: 'Swift', desc: 'The King covers more ground in a day, on foot and mounted.', max: 3, apply: mul('kingSpeed', 1.2) },
  // #115: was "Split Shot", "The King looses an extra arrow with every shot." Two problems in one
  // line, and it was reported as reading like a drawback -- "ive never understood the King's split
  // shot, it seems like a negative option".
  //
  // "looses" is the correct archery verb and a homophone for "loses". Scanned in the second a raid
  // gives you, "the King looses an extra arrow" is the King throwing one away. And "split" says one
  // arrow divided -- the same damage shared out -- when each extra arrow carries his FULL damage at
  // a raider of its own. Both halves of the card were telling the player the opposite of the truth.
  //
  // "at full strength" stays in the sentence rather than being trimmed: the halved-damage reading is
  // what was actually reported, and one clause kills it.
  //
  // The `id` stays `split-shot`. It is a save key: `game-save.js` stores `taken` by id, and a renamed
  // one would drop off the "rewards you have taken" list AND read as untaken -- so a player mid-run
  // could take a maxed card twice more and finish with five arrows against the cap of three. The id
  // is never shown to anybody; the name is the part that had to change.
  { id: 'split-shot', pool: 'king', icon: 'arrows', name: 'Volley', desc: 'The King fires an extra arrow at another raider, at full strength.', max: 2, rare: true, apply: add('kingArrows', 1) },
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
