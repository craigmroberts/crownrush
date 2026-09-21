// Upgrades offered three at a time when the Keep levels up (see Game.offerUpgrades).
//
// Each one sets a multiplier or a flag on `game.mods`; the places that read those are the only
// gameplay code an upgrade touches, which keeps adding a new one cheap. `pool` exists so an offer
// can avoid showing three variations of the same idea.

export const MODS = {
  carryBonus: 0,
  // #221: the relics' flags. Separate from the multipliers above because that is the whole rule a
  // relic has to pass -- if it can be written as a number it is an upgrade card and belongs in
  // `UPGRADES`, not in a hole in the ground.
  offerCards: 0,     // extra cards on every Keep upgrade offer
  noCap: false,      // the bag never fills
  pierce: false,     // an arrow carries on through the raider behind the one it hits
  campsStay: false,  // a camp you break is never reoccupied (#218)
  // #235: the rule cards' flags. Same test as the relics: each is a sentence that could not be
  // written as a number, and each is read in exactly one place in the gameplay code.
  fallenRise: false,   // archers who fall in the night are back at the Keep by dawn
  towerFire: false,    // a tower's arrow leaves a raider burning
  wallsMend: false,    // walls mend themselves while the sun is up
  gatesRise: false,    // a broken gate stands again at dawn
  dawnTithe: false,    // every coin still lying on the field at dawn is yours
  kingHunts: false,    // the King's arrows go for a raider carrying Wren first

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
  gleanerSpeed: 1,   // #169: the gleaner's walk, multiplied by Quick Feet

  // #220: what the legacy tree seeds. They live here rather than on the game because `applyLegacy`
  // going through the same door as an upgrade card is the whole reason the meta-progression has
  // stayed cheap -- `mods` is reset from this object at the top of every run, so a legacy unlock
  // cannot leak from one run into the next by forgetting to clear something.
  //
  // `startBuilt` is an ARRAY and so gets a fresh copy per run; `{ ...MODS }` would share the one
  // declared here between every run in the session, and the second run would begin with the first
  // run's head starts still in it. `applyLegacy` copies it.
  startCoins: 0,      // extra coins scattered on the road
  startMounted: false,
  startArchers: 0,
  startBuilt: [],     // pad ids already standing when the run opens
  startCampsBroken: 0,
  kingHp: 0,          // added to the King's starting and maximum health
};

// #177: the key and the amount are hung on the function itself, so a card can be asked what it
// touches and by how much (`upgradeChange`) without a second description of each upgrade that could
// drift from the first. The closure is unchanged; it just carries its own facts.
const mul = (key, by) => Object.assign((g) => { g.mods[key] *= by; }, { key, by, op: 'mul' });
const add = (key, by) => Object.assign((g) => { g.mods[key] += by; }, { key, by, op: 'add' });
// #235: a rule card sets a flag. It carries `key` like the others so `upgrade-mods-exist` can see
// that the flag it writes is one the game reads; there is no figure to show, so `upgradeChange`
// has no row for it and the card wears a badge instead.
const rule = (key) => Object.assign((g) => { g.mods[key] = true; }, { key, by: 1, op: 'set' });

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
  { id: 'keen-eye', pool: 'army', icon: 'expand', name: 'Keen Eye', desc: 'Your archers hit much harder, and raiders drop sooner.', apply: mul('archerDamage', 1.3) },
  { id: 'hardened', pool: 'army', icon: 'archer', name: 'Hardened', desc: 'Your archers take far more punishment before they fall.', apply: mul('archerHp', 1.4) },
  { id: 'longbows', pool: 'army', icon: 'bow', name: 'Longbows', desc: 'Your archers open fire much sooner, before raiders can reach them.', apply: mul('archerRange', 1.3) },
  { id: 'volunteers', pool: 'army', icon: 'person', name: 'Volunteers', desc: 'Every recruit pad brings one extra soldier.', max: 3, apply: add('recruitBonus', 1) },
  // #235: RULE CARDS, one or two per pool. The deck was seventeen multipliers, and 500 simulated
  // runs said 55% of offers by level 10 had nothing in them the player had not already read. The
  // relics showed the shape of a card that is not a number -- "arrows carry through the raider
  // behind" -- and each of these is one of those: a sentence, a flag, and one place that reads it.
  { id: 'muster', pool: 'army', icon: 'restart', rule: true, name: 'The Muster', desc: 'Archers who fall in the night are back on their feet at the Keep by dawn.', apply: rule('fallenRise') },

  // ---- towers ----
  { id: 'fletchers', pool: 'towers', icon: 'arrows', name: "Fletcher's Workshop", desc: 'Watchtowers cut raiders down far faster.', apply: mul('towerDamage', 1.5) },
  { id: 'spotters', pool: 'towers', icon: 'tower', name: 'Spotters', desc: 'Watchtowers cover much more ground and shoot raiders further out.', apply: mul('towerRange', 1.3) },
  { id: 'wider-decks', pool: 'towers', icon: 'shield', name: 'Wider Decks', desc: 'Every watchtower holds one more archer.', max: 2, apply: add('towerSlots', 1) },
  { id: 'fire-arrows', pool: 'towers', icon: 'flame', rule: true, name: 'Fire Arrows', desc: 'A raider hit by a watchtower keeps burning after the arrow lands.', apply: rule('towerFire') },

  // ---- walls ----
  { id: 'deep-footings', pool: 'walls', icon: 'brick', name: 'Deep Footings', desc: 'Your walls and gates hold out far longer.', apply: mul('wallHp', 1.4) },
  { id: 'spiked-walls', pool: 'walls', icon: 'wall', name: 'Spiked Walls', desc: 'Raiders hurt themselves attacking your walls.', max: 3, apply: add('wallThorns', 5) },
  // two here, because the walls pool had two cards and the other four pools had three to five
  { id: 'mortar', pool: 'walls', icon: 'stonewall', rule: true, name: 'Fresh Mortar', desc: 'Your walls mend themselves while the sun is up.', apply: rule('wallsMend') },
  { id: 'portcullis', pool: 'walls', icon: 'door', rule: true, name: 'The Portcullis', desc: 'A gate the raiders break stands again at dawn, for nothing.', apply: rule('gatesRise') },

  // ---- economy ----
  // #103: 1.35, down from 1.8. The pickup radius is now the circle drawn under the King, so it has to
  // be a size that can be drawn: at 1.8 stacked twice the reach was 11.99 and the circle ran clean off
  // a phone screen, leaving the King with no mark under him at all -- measured, not guessed. 1.35
  // takes the full stack to 6.74, which fills most of the width and stays on it. Both stacks still
  // land (3.7 -> 5.0 -> 6.74) and the full stack is still 82% further than bare, which is what the
  // card promises. It is a real cut to how much ground a stacked Lodestone sweeps, and it buys the
  // player an upgrade whose effect is on the screen rather than in a number nobody can see.
  { id: 'lodestone', pool: 'economy', icon: 'coin', name: 'Lodestone', desc: 'Coins are pulled to you from much further away.', max: 2, apply: mul('pickup', 1.35) },
  { id: 'plunder', pool: 'economy', icon: 'gold', name: 'Plunder', desc: 'Every raider you kill drops an extra coin.', max: 3, apply: add('coinBonus', 1) },
  { id: 'sharp-tools', pool: 'economy', icon: 'hammer', name: 'Sharp Tools', desc: 'You mine far quicker, so a full bag takes less of the day.', max: 2, apply: mul('mineSpeed', 1.45) },
  { id: 'packhorse', pool: 'economy', icon: 'sack', name: 'Packhorse', desc: 'Carry 8 more before you have to sell at the trade post.', max: 3, apply: add('carryBonus', 1) },
  // #169: the owner asked for the gleaner's speed to be an upgrade. x1.4 is "far" on the ladder above,
  // and twice takes him from 3.4 to 6.7 -- past a walking villager and nearly the mounted King --
  // which is the point: late in a run the field is wide and the coin lies far from the Keep.
  { id: 'quick-feet', pool: 'economy', icon: 'hourglass', name: 'Quick Feet', desc: 'The gleaner walks the field far quicker, so less coin lies long enough to fade.', max: 2, apply: mul('gleanerSpeed', 1.4) },
  { id: 'tithe', pool: 'economy', icon: 'home', rule: true, name: 'The Tithe', desc: 'Every coin still lying on the field at dawn is yours, wherever it fell.', apply: rule('dawnTithe') },

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
  { id: 'split-shot', pool: 'king', icon: 'star', name: 'Volley', desc: 'The King fires an extra arrow at another raider, at full strength.', max: 2, rare: true, apply: add('kingArrows', 1) },
  { id: 'field-surgeon', pool: 'king', icon: 'crown', name: 'Field Surgeon', desc: 'Everyone recovers health twice as fast.', apply: mul('regen', 2) },
  // `nearestEnemy` skips a raider carrying Wren on purpose -- so that the army does not shoot into
  // the man holding her -- which means today the King's bow will not shoot him either. This is the
  // card that says the King, and only the King, does.
  { id: 'huntsman', pool: 'king', icon: 'skull', rule: true, name: 'The Huntsman', desc: 'The King\'s arrows go first for any raider carrying Wren away.', apply: rule('kingHunts') },
];

// #221: RELICS -- what is in the caches out in the fog.
//
// A relic changes a RULE. Not a multiplier: the moment one reads "+30% damage" it is an upgrade card
// found in a field, and the reason to walk out there instead of mining is gone. Every one of these
// is a sentence that could not be written as a number, and each is one line against a flag that the
// gameplay code already had a place for -- which is also the test of whether it is really a rule.
//
// They are NEVER REQUIRED. Miss every cache and the run is exactly the run that ships; nothing below
// is balanced against, only varied by.
//
// Named and described the way the upgrade cards are (#115): the name is flavour and the description
// carries all of the information, because a player reads one line in the two seconds after digging
// something out of the ground.
export const RELICS = [
  {
    id: 'ledger',
    icon: 'star',
    name: "The Quartermaster's Ledger",
    // Not "better upgrades" -- the SAME upgrades, one more of them to choose between. The rule it
    // changes is how many doors are open, which `pickOffer` has always been able to answer and was
    // never asked.
    desc: 'Every Keep level offers you four rewards to choose from instead of three.',
    apply: (g) => { g.mods.offerCards += 1; },
  },
  {
    id: 'sack',
    icon: 'sack',
    name: 'The Bottomless Sack',
    // The carry cap is the reason a mining trip ends. Removing it does not make mining faster; it
    // removes the walk back, which is a different shape of day rather than more of the same one.
    desc: 'You can carry as much as you can mine. The bag never fills.',
    apply: (g) => { g.mods.noCap = true; },
  },
  {
    id: 'shaft',
    icon: 'arrows',
    name: 'The Splitting Shaft',
    // Volley (upgrades.js) adds an arrow. This does not: it changes what ONE arrow does when it
    // lands, which is why it is a relic and Volley is a card.
    desc: 'Every arrow carries on through the raider behind the one it hits.',
    apply: (g) => { g.mods.pierce = true; },
  },
  {
    id: 'standard',
    icon: 'swords',
    name: 'The Broken Standard',
    // #218 gave camps a reoccupation timer on purpose, so clearing is a habit rather than a
    // one-time errand. This relic is the exception that proves it: the day you spend on a camp
    // stops being rent and becomes a purchase.
    desc: 'A raider camp you break stays broken. They do not move back in.',
    apply: (g) => { g.mods.campsStay = true; },
  },
];

// One relic the player has not already dug up, or null once they are all found.
export function pickRelic(found) {
  const left = RELICS.filter((r) => !found[r.id]);
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
}

// Three upgrades the player has not exhausted, from three different pools where possible.
//
// #235: AND THE DECK ROTATES. `seen` is every card this run has put on screen, offered or taken,
// and an offer is never all cards the player has already read while an unseen one is left: if the
// draw comes up that way, the last card is swapped for an unseen one. That is the whole rule.
//
// The ticket asked for unseen cards to be WEIGHTED x3 in the draw as well, and it was written and
// measured (`tools/deck/reheat.mjs`, 2000 runs, a random pick a level) and taken out again. A
// weighting front-loads the deck: at x3 every card has been shown by level 11 and two thirds of
// the offers at 12 have nothing new in them; the swap alone shows the last new card at level 14
// and reheats 0% at 10 and 4% at 12. Twenty-three cards over fifteen offers of three run out
// whatever the draw does -- level 15 is 80% reheated under any rule and 100% under the weighting --
// and a bigger deck is the only answer to that. Before the ticket it was 30% at 10 and 46% at 12,
// and the random deck's better number at 15 (64%) is cards it simply never showed.
//
// `seen` is per run and not saved: a restored run starts fresh, and the worst that does is show a
// card twice.
export function pickOffer(taken, count = 3, seen = {}) {
  const available = UPGRADES.filter((u) => (taken[u.id] || 0) < (u.max || 1));
  const offer = [];
  const pools = new Set();
  const draw = (list) => list.slice().sort(() => Math.random() - 0.5);
  const pass = (allowRepeatPool) => {
    for (const u of draw(available.filter((u) => !offer.includes(u)))) {
      if (offer.length >= count) return;
      if (!allowRepeatPool && pools.has(u.pool)) continue;
      offer.push(u);
      pools.add(u.pool);
    }
  };
  pass(false); // one per pool first, so an offer is never three flavours of the same idea
  pass(true); // then fill if the pools ran dry
  if (offer.length && offer.every((u) => seen[u.id])) {
    const unseen = available.filter((u) => !seen[u.id] && !offer.includes(u));
    if (unseen.length) {
      // prefer one from a pool the offer does not already show, so the swap keeps the one-per-pool shape
      const kept = new Set(offer.slice(0, -1).map((u) => u.pool));
      const fresh = draw(unseen.filter((u) => !kept.has(u.pool)))[0] || draw(unseen)[0];
      offer[offer.length - 1] = fresh;
    }
  }
  return offer;
}
