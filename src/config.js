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
    // at `escortSpeed`; catch them and she is back, wounded, and the Keep pays. `recaptures` times.
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
  keep: { hp: 420, hpPerLevel: 90, radius: 3.6, half: 2.9, materialBonus: 420, padOffset: [-5, 5] },

  // The Keep is the base. Materials you mine go ONLY into the Keep; each level unlocks more.
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
  // The trade post, once built. Walk into it and whatever you are carrying becomes coin. It is the
  // first thing worth building -- you start with enough coin for it -- because until it stands the
  // heaps you make have nowhere to go.
  trade: { pos: [-8, -7], radius: 3.0 },
  // how close before a pile tells you what is in it, and how close before he picks it up
  pile: { showRadius: 7.0, pickRadius: 1.9 },

  score: { earlyWavePerSecond: 4, kill: { knight: 10, elite: 25, brute: 20, boss: 200, thief: 40, sapper: 15, archer: 20, shield: 30 }, coin: 1, material: 2, buildPerCoin: 2, buildPerMaterial: 3, soldierPerWave: 2, waveClear: 50, levelUp: 60, rescue: 150, recapture: 90, finale: 1500 },

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
  // the Warlord. The march opens at Keep `level` (or night `night`, whichever comes first).
  // `leash`: how far from the camp the King has to get before the garrison gives up and goes home.
  // Walking away has to be an answer, or an early visit to the camp ends the run (#28).
  finale: { pos: [-4, -74], radius: 9, garrison: 8, wakeRadius: 20, leash: 38, level: 13, night: 30, chiefHp: 3.2, callEvery: 9, callCount: 3 },
  // #18: the King's one ability. The warhorn pulls the army to him and drives them for a few
  // seconds, and the blast shoves nearby raiders back and stuns them: an answer to a breach.
  horn: { cooldown: 22, duration: 6, radius: 7.5, push: 3.4, stun: 1.3, speed: 1.6, damage: 1.5, rallySpeed: 2.2 },
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
  cycle: { length: 75, nightStart: 0.6, dawn: 0.98, warn: 8 },

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
  },

  regen: { delay: 4, perSecond: 3 },

  // pads only take payment once you STOP on them (or hold for a moment), so walking past costs nothing
  // showRadius: how close before a build mat fades up out of the grass. The field reads better with
  // them hidden, but a mat nobody can see is a thing nobody builds, so a pad that has only just
  // appeared shows itself for showNew seconds wherever you are.
  spend: { tick: 0.07, fastTick: 0.022, crewTick: 0.28, padRadius: 1.7, arm: 0.25, walkHold: 0.8, showRadius: 10, showNew: 7 },

  arrow: { speed: 30, life: 2.0 },

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
const W = (id, tier, pos, cost, side, label) => ({ id, tier, pos, cost, icon: 'wall', label, requires: [tier === 1 ? 'expand1' : 'expand2'], wall: { tier, side }, desc: 'Walls this side of the new plot. Raiders must break through.' });
export const PADS = [
  // ---- tier 0: the starting plot (28 x 22) ----
  { id: 'exchange', tier: 0, pos: [9.8, -6], cost: 8, afterRescue: true, icon: 'gold', label: 'Trade Post', structure: 'bank', buildAt: [9.8, -9.8], desc: 'Sell what you have mined. Until it stands there is nowhere to turn a heap into coin.', toast: 'Trade Post built! Bring your bag here to sell.' },
  { id: 'range', tier: 0, pos: [-9.8, -5.4], cost: 5, icon: 'bow', label: 'Archery Range', structure: 'hut', buildAt: [-9.8, -9.8], desc: 'Lets you recruit archers.', toast: 'Archery Range built! Recruit archers.' },
  { id: 'recruit', tier: 0, pos: [-9.8, -5.4], cost: 5, growth: 1, icon: 'archer', label: '+2 Archers', requires: ['range'], repeatable: true, units: { type: 'archer', count: 2 }, desc: 'Two archers join the King. The Keep level caps how many you can have.' },
  { id: 'train', tier: 0, pos: [-13.8, -5.4], cost: 12, growth: 8, maxBuys: 5, icon: 'arrows', label: 'Train Archers', requires: ['recruit'], repeatable: true, effect: 'archerPower', desc: 'Every archer, now and later: +25% damage and +20% health per level.', toast: 'Archers trained: +25% damage, +20% health' },
  { id: 'keep', tier: 0, pos: [-5, 5], cost: 25, icon: 'keep', label: 'Royal Keep', requires: ['range'], structure: 'keep', buildAt: [0, 0], desc: 'Shelters the Queen. Feed it materials to level up your whole kingdom.', toast: 'The Queen is safe in the Keep. Feed it wood and stone to level up!' },
  // The citadel's towers stand on the ring itself, on its four diagonals -- a round wall has no
  // corners, and its gateways are taken by the roads. Their pads sit in the half of each quarter the
  // Keep's own pads leave free, which is what keeps both clear of the crossroads.
  { ...T('tower-0-ne', 0, [8.6, -13.6], 20, [13.44, -13.44]), requires: ['recruit'] },
  { ...T('tower-0-nw', 0, [-7.6, -14.2], 20, [-11.73, -14.95]), requires: ['recruit'] },
  { ...T('tower-0-se', 0, [15.2, 5.6], 20, [14.95, 11.73]), requires: ['recruit'] },
  { ...T('tower-0-sw', 0, [-10, 12.4], 20, [-13.44, 13.44]), requires: ['recruit'] },
  { id: 'palisade', tier: 0, pos: [-5, 9], cost: 20, icon: 'wall', label: 'Palisade', requires: ['recruit'], wall: { tier: 0, side: 'all' }, desc: 'A wooden wall around the plot with two gates. Upgrades to brick, stone and iron as the Keep levels.', toast: 'Palisade raised. Raiders must break through!' },
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
  { ...T('tower-1-ne', 1, [26.2, -22.2], 25, [30, -26]), requires: ['expand1'] },
  { ...T('tower-1-sw', 1, [-26.2, 22.2], 25, [-30, 26]), requires: ['expand1'] },
  { ...T('tower-1-se', 1, [26.2, 22.2], 25, [30, 26]), requires: ['expand1'] },
  { id: 'barracks', tier: 1, pos: [5.2, 15.4], cost: 40, minLevel: 3, icon: 'swords', label: 'Barracks', requires: ['expand1'], structure: 'barracks', buildAt: [9.2, 9.2], desc: 'Lets you recruit swordsmen.', toast: 'Barracks built! Recruit swordsmen.' },
  { id: 'recruit-sword', tier: 1, pos: [5.2, 15.4], cost: 8, growth: 2, icon: 'swordsman', label: '+2 Swordsmen', requires: ['barracks'], repeatable: true, units: { type: 'swordsman', count: 2 }, desc: 'Two swordsmen: tough melee fighters who charge whatever comes near the King.' },
  { id: 'crown', tier: 1, pos: [-12, -21], cost: 35, growth: 25, maxBuys: 3, icon: 'crown', label: 'Royal Guard', requires: ['expand1'], repeatable: true, effect: 'kinghp', desc: 'King max HP +80 and a full heal.', toast: 'King max HP +80 and fully healed' },
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
  { type: 'wood', pos: [15, -15], stock: 8 }, { type: 'wood', pos: [18, -17], stock: 8 }, { type: 'wood', pos: [14.5, -18.5], stock: 8 },
  { type: 'wood', pos: [-44, 28], stock: 10 }, { type: 'wood', pos: [-47, 31], stock: 10 }, { type: 'wood', pos: [-42, 32], stock: 10 },
  // straw: the light binder, needed in small amounts all the way up
  { type: 'straw', pos: [45, -6], stock: 16 }, { type: 'straw', pos: [-24, 12], stock: 14 }, { type: 'straw', pos: [14, 62], stock: 20 },
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
