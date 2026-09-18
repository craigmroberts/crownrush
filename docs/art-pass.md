# The art pass

The art-direction brief for the world: what the map, the terrain kit, the buildings and the enemies
were proposed to look like. It came **before** draft four of the story bible, which is why the two
sometimes disagree — see `docs/cast-review.md`, where the Rust is the clearest case.

This is a **proposal**, not a record of the game. What the game actually looks like is at
`/board/#/world` and `/board/#/cast`, live. What is written here is what somebody asked for.

The drawings live on a design canvas that is still an editable surface, so it has not been folded
into the board — a canvas is a place to work, not a page to read. This file is the written half,
kept in the repo so the decisions are findable without opening the canvas.

**Wall hit points are the one place to be careful.** The numbers below are what the art pass
proposed. The game's actual figures live in `CFG.wallLevels` and the board reads them from there;
where the two differ, the config is the game and this is a wish.

---

## The world map

Village at the centre, raiders arriving along the roads.

- **Rivers** wind across the map as natural walls. Raiders can only cross at the two wooden bridges,
  which become choke points worth guarding; the King crosses the same way.
- **Roads** are curved splines with a darker shoulder and wheel ruts, meeting at the village gates.
  Raiders follow them in, **so you can read an attack from the road it uses.** That is the load-
  bearing idea in this whole document: the map should tell you where the raid is coming from before
  you see it.
- **Mesas** stack in the north-west with snow-capped peaks behind. Forest, boulders, barricades, a
  wheat field and flower clusters fill the meadow between.

## The terrain kit

The set pieces the map is built from. Each becomes a low-poly piece in the same colours.

| Piece | Proposed |
| --- | --- |
| River | Sandy banks, two-tone water, drifting foam lines. Blocks all walking |
| Bridge | Plank deck with railings. The only crossings, so each is a natural tower site |
| Curved road | Spline ribbon with a darker shoulder and wheel ruts. Replaces the straight strips |
| Mesas and peaks | Stepped grey mesas with grass tops, snow-capped peaks behind for depth |
| Pines, bushes, hay | Three-tier pines in two sizes, round bushes, hay bales near the fields |
| Wheat field | Golden rows with a low fence. Sways gently; purely for life and colour |
| Boulders, barricades, flowers | Faceted rocks with a lit top face, crossed-stake barricades, tufts and flowers |
| Ground | Soft lighter and darker patches with grass tufts, instead of one flat green |

## Buildings and walls

More detail on the same footprints: planks, shingles, banners, lanterns.

| Building | Proposed |
| --- | --- |
| Archery range | Plank walls, shingled roof, a practice target and a lantern post |
| Watchtower | Cross-braced legs, railed platform, peaked roof with a blue pennant. **Crew visible on top** |
| Barracks | Stone-block walls, slate roof, crossed swords over the door, crates and a tall flag |

The four wall materials, as proposed:

| Material | Look | Proposed HP |
| --- | --- | --- |
| Wood | Pointed pickets on two rails | 140 |
| Brick | Flat red courses with mortar lines, square merlons | 340 |
| Stone | Rounded grey blocks, moss at the base | 750 |
| Iron | Riveted dark plates with spikes on top | 1,600 |

**The ladder shipped differently.** The game's ages are Wood, Stone, Iron and Diamond — brick never
arrived and diamond was never in the art pass — and the hit points are 140 / 360 / 820 / 1,800.
Wood is the only rung the two agree on. The board shows the live figures.

## The enemy cast

The per-enemy briefs are in `docs/cast-review.md`, beside what the story now says and what the model
actually is. Three rules were set for the cast as a whole and are worth keeping whatever else moves:

- **Shape language.** Raider = round, Elite = tall and angular, Brute = wide, Giant = huge. You
  should be able to read a wave from silhouettes alone.
- **Colour.** Enemies keep to red, black and pinkish bone so they never read as your blue-and-white
  army. Eyes become glowing slits on the armoured ones.
- **Animation.** The walk cycles exist. A wind-up lean before each strike and a stagger on hit is
  what would make them feel heavy. **Neither is built** — and `tools/blender/make_character.py`
  ships three clips (Idle, Walk, Attack), so this is authoring work, not engineering (#55).

---

## What has landed since

Not a complete audit — just the pieces that are plainly in the game now, so the list reads as a
backlog rather than a wishlist:

- The wheat field, hay bales, pines and bushes are built (`makeWheatField`, `makeHayBale`,
  `makeTree`, `makeBush`).
- Mesas and peaks are built (`makeCliff`, `makePeak`).
- The river and the bridge are built, and the bridge is the only crossing.
- The mottled ground arrived with the clover and field-stone pass (#162).
- Curved roads did not: the paths are still strips.
- The watchtower's visible crew did not.
