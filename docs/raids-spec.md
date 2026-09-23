# Raids mode — architecture spec, iteration 1

**Status:** locked for iteration 1. The owner answered the five open questions on 2026-09-23; the
decisions are in section 11 and folded into every section they touch. Nothing here is built yet. The
story edition is untouched and stays the default; the fallback is the branch
`release/7-before-overhaul` (b46ca35, the build Pages served when this was written, 47 of 47 checks).

**What this is.** An endless, score-chased run: the King moves across an overworld map from castle to
castle, defends each one against a short burst of raids, earns allies, and spends them at boss
castles. Death ends the run. Allies last one run. The legacy tree carries over. No story.

**How it ships.** Behind `?mode=raids`, as a second mode beside the story edition, so both can be
played and the funnel (#251) can compare them with real players before anything is deleted.

Every number below is a **starting proposal** unless it says *measured* or *decided*. The decisions
that set how the mode feels are the owner's, and are recorded in section 11.

---

## 1. The loop, on one screen

```
 Title ── Play (Raids) ──> MAP ──tap a node──> CASTLE ──cleared──> REWARD ──> MAP ─┐
                            ^                     │                                 │
                            │                  King falls                           │
                            │                     v                                 │
                            └──── one tap ─── VERDICT: score, breakdown, legacy <───┘
                                        (five castles, then a BOSS; the very first node is a starter castle)
```

| Unit | Target length | Why |
| --- | --- | --- |
| A castle | 60–90 s in region 1, 90–180 s after | The unit a phone session is built from. Today's smallest unit is a 75 s day inside a 37-minute pinned run |
| A region | 6 nodes: five castles, then a boss (*decided*) | The sawtooth: pressure builds to the boss, the next region opens easier |
| The first boss | reached at about 6–8 min | Five castles before a boss means region 1's castles have to be the short ones, or the first boss is 10–15 minutes away and most first runs never see one |
| A first run | 4–8 min | Long enough to meet the first boss if it goes well, short enough that dying is not a loss of an evening |
| A good run | 12–20 min | Where the difficulty curve is tuned to end it (section 7) |
| Death to next run | under 5 s, one tap | The arcade "one more go" window is seconds |

---

## 2. What the codebase already gives us, and the one constraint that shapes everything

**The constraint, measured in the code:** `buildWorld` runs **once per page load**
(`game.js:170`). A new run tears down `root` through `reset()` / `disposeRun()` and keeps the world.
So a castle is **not** a new world. It is a new *stage* on the existing plot, built and torn down the
way a run already is. That is cheaper and safer than generating terrain per castle, and it is why the
map is the variety layer rather than the terrain.

| Needed for raids | Already exists | Where |
| --- | --- | --- |
| Stand a finished castle instantly | `standOpeningVillage` marks structural pads built and hands them to `rebuildVillage` | `game-build.js:383` |
| Tear a stage down without leaking | `reset()` + `disposeRun(root)`, and the churn harness that catches steps and leaks | `game.js:426`, `tools/churn/` |
| Waves with ranks, types and bosses | `startWave`, `spawnEnemy`, `CFG.ranks`, `CFG.enemy`, the chief | `game-enemies.js` |
| Walls, gates, towers with crews | the whole build layer | `game-build.js` |
| Allies on the field | `spawnUnit('archer' / 'swordsman', …, veteran)`, the army AI, `unitCap` | `game-units.js` |
| Hundreds of characters on a phone | GPU-skinned instanced crowd | `crowd.js` |
| A draft of three with no repeats | `pickOffer(taken, n, seen)` over 23 cards, 6 of them rules | `upgrades.js` |
| The King's verbs | horn, banner, mount; Wren's release (`loosenWren`) is a ready-made area stun | `game-units.js` |
| Seeded maps | `?seed=N`, `mapSeed()` | `game.js:29` |
| Time of day and weather as variety | `?phase=`, blood moon, rain | `game-view.js` |
| Meta progression | legacy points = run score (`addLegacy`), 24 unlocks, pick 3 | `scores.js`, `CFG.legacy` |
| A run that survives a phone | save and resume, the black box | `game-save.js`, `report.js` |
| Where a first session stops | the funnel | `report.js` (#251) |
| Rigs to recast | king, king_mounted, queen, archer, swordsman, raider, elite, brute, boss | `public/board/cast.json` |

What does **not** exist: the map, the run-level state that spans castles, castle generation, the ally
roster between castles, the boss-spend mechanic, a castle-indexed difficulty curve, and a scoreboard
per mode.

---

## 3. Module layout

The rule this follows is the one `upgrades.js` and `tools/deck/reheat.mjs` proved last week: **the
parts that decide the design are pure functions of a seed**, so they can be simulated two thousand
times by a free check in milliseconds, with no browser. Only the parts that draw touch `Game`.

```
src/raids/
  run.js       pure   the run: seed, node index, roster, abilities, war chest, score. Serialisable.
  map.js       pure   region generation from a seed; reachability; node previews
  castle.js    pure   node -> CastleSpec (layout, waves, modifiers, reward table)
  allies.js    pure   roster rules: earn, cap, deploy, commit, lose
  scoring.js   pure   castle score, multipliers, the death breakdown
  curve.js     pure   difficulty D(n) and expected roster power P(n)
  director.js  glue   owns the mode: map -> castle -> reward -> map; talks to Game and Hud
src/overworld.js      the map screen (DOM/SVG overlay)
tools/raids/sim.mjs   runs director logic without a browser: run lengths, map constraints, curve
```

`Game` stays the combat engine. It gains three entry points and two events, and nothing in the story
edition's paths changes:

```js
game.startCastle(spec, deployed)   // reset the stage, stand the castle, place allies, arm the waves
game.pauseForMap()                 // stop the sim and the renderer while the map is up
game.endCastle()                   // tear the stage down
// events the director listens for
'castle:cleared' { survivors, wallsIntact, seconds, kills, coins }
'castle:fell'    { reason }
```

`CFG.mode` (`'story' | 'raids'`, from `?mode=`) gates the prologue, the day cycle, the pads and the
economy. The story edition reads `'story'` everywhere it does today.

---

## 4. The overworld map

**Shape.** A run is a chain of **regions**. A region is 6 **layers** left to right: five castle
layers, then a single boss (*decided*). Each castle layer has 2–3 nodes; each node links to 1–2 nodes
in the next layer. A muster sits in a castle layer, so a player who takes one fights four castles
before the boss instead of five; that is the price of the breather. Regions are generated **one
ahead**, so the map is endless and memory stays flat.

**The first node of a run is fixed** (*decided*): a single **starter castle**, the only node lit, two
gentle raids of knights, no modifiers. The forks open from the node after it. It is the first of
region 1's five castles, not an extra one.

```js
// map.js
Region { index, seed, layers: Node[][] }
Node {
  id, region, layer, lane,
  kind,          // 'castle' | 'fortress' | 'muster' | 'boss'
  modifiers,     // ['night', 'fog', 'no-towers', 'double-raid', ...]  (0–2)
  difficulty,    // D(n) from curve.js
  multiplier,    // score multiplier for choosing it
  reward,        // what clearing it pays: 'allies' | 'card' | 'chest' | 'ability'
  next: [ids]
}
```

| Node kind | What happens | Why it is on the map |
| --- | --- | --- |
| **castle** | Defend: 3 raids, 90–150 s | The bread and butter |
| **fortress** | A harder castle: more raiders, a modifier, ×1.5 score | The risk half of every fork |
| **muster** | No fight. Spend the war chest on recruits and abilities, swap the ability slot | The breather, and where coin becomes power. No repairs: each castle is stood fresh |
| **boss** | A castle with the chief and his guard; allies can be committed here | The spend point; the top of the sawtooth |

**Generation rules**, each a free check against 2,000 generated regions:

- Every layer offers a **real fork**: at least one node rated safer and one rated riskier than the other.
- A **muster is reachable** in every region, and never forced twice in a row.
- No path is **fortresses only**; no path is **musters only**.
- The boss is reachable from every node in the region.
- Region 1's first layer is exactly one node, the starter castle; every later layer is a fork.

**The screen.** A 2D board in the Mario Wonder manner: nodes on painted paths, the King as a token
on the node he is at, reachable nodes lit. Built as **DOM and SVG over a paused scene**, not 3D, for
iteration 1:

- It is the performance breather the owner asked for: **zero draw calls** while it is up, and the
  previous castle is disposed behind it.
- It is crisp and tappable at 390 × 844, where a 3D diorama would need camera work first.
- The board rule applies: it gets `?view=map` on the board in the same commit it lands.

Tap a lit node and a card rises: its kind, modifiers, multiplier and reward, and one **Ride** button.
Ride walks the token along the path in under a second and the castle loads. There is no travel time.

A 3D diorama of the map, using the real world's plateaus and river as scenery, is iteration 2 and
only if the 2D map is proven.

---

## 5. A castle

```js
// castle.js — node -> spec, pure
CastleSpec {
  seed,
  layout,        // which pads stand: ring tier, gates, towers, their level. Drawn from the node's difficulty
  material,      // wall level: wood -> stone -> iron..., by region
  phase,         // time of day, fixed for the castle: one of the palette's named phases
  weather,       // clear | rain
  modifiers,
  waves: [{ at, types[], ranks[], from: bearings[] }],   // 3 raids; a boss castle adds the chief
  reward
}
```

**How it plays, iteration 1:**

1. The map closes. `game.startCastle(spec, deployed)` resets the stage and **stands the castle**
   through the existing `standOpeningVillage` path with the spec's pad list.
2. The King and the deployed allies appear at the Keep. A 3-second countdown.
3. Three raids, on a timer, from the spec's bearings. The day cycle does not run; the phase is fixed.
4. **Cleared** when the third raid is dead. **Fallen** when the King dies. The Keep falling is a
   heavy score penalty, not a death, so a run does not end on a wall. The starter castle has two
   raids, not three.
5. `endCastle()` disposes the stage; the director shows the reward, then the map.

**A castle is defense only** (*decided*). Out, for iteration 1: mining, the trade post, the day
cycle, camps, caches, building from mats, and **repair and tower mats** too, because a building or
repair economy inside a 2-minute defense slows the pace the mode exists for. No mat stands in a
castle at all. Coin still drops, and it is two things only: **score**, and the run's **war chest**,
spent at musters on allies and abilities. A wall that falls stays down for the rest of that castle;
the next castle is stood fresh.

**Leaks are the known risk.** Twenty castles a run is twenty teardowns, and the bridge-mat leak (#190)
was exactly this shape. A churn check that runs 25 castles and asserts no step in geometries,
textures or heap is part of the castle ticket, not a follow-up.

---

## 6. Allies, and spending them

```js
// allies.js — pure
Roster { units: [{ id, type, veteran, hp }], cap }
```

| Rule | Proposal | Why |
| --- | --- | --- |
| **Earn** | A cleared castle pays 2–4 recruits, more for walls intact and a fast clear | Doing well has to be felt as more men, the same castle |
| **Cap** | 24 in the roster | Snowball control, and the crowd budget: 24 allies + 3 raids is well inside what `crowd.js` holds |
| **Deploy** | Choose up to 8 to garrison a castle; the rest wait | Makes every castle a small decision, and bounds the field |
| **Lose** | A deployed ally who dies is gone for the rest of the run (*decided*). A new run starts with a clean roster; nothing about allies carries between runs, only the legacy tree does | Without loss, allies are only ever a number going up |
| **Commit** | At a boss, commit any number to a **Call to Arms**: a charge from the gate that hits the boss's guard, then they are spent | The spend-or-save decision the concept is built on |
| **Wren** | A recruitable ally (*decided*), with no story attached. Offered at most once a run, as a muster purchase or a boss reward. Deployed, she carries the release stun as it works today (#234): her meter fills while raiders are near her, and one tap looses it. She can die like any ally, and is then gone for the run | Keeps the rig, the voice and the one mechanic that was already a power fantasy, and drops the rescue |
| **Other heroes** | The mounted King rig as a knight captain, if iteration 1 has room; otherwise iteration 2 | The same reuse, lower priority |

**Abilities** stay at three buttons, the lesson of #240: **horn**, **banner**, and **one ability slot**.
The slot is filled from a draft at musters and after bosses. The 23 existing cards become the
between-castle reward draft through `pickOffer` with its seen-rotation, so the deck work carries over
whole. Iteration 1 needs about 40 cards for a 20-castle run not to repeat; that is a content ticket,
not an architecture one.

**The reward screen** after each castle is one choice of three: **allies**, **a card**, or **coin for
the chest**. One tap, then the map.

---

## 7. Difficulty and score

**The curve is a sawtooth that steepens**, not a ramp:

```
D(n) = base(region) × (1 + 0.15 × layer) × modifiers,  and × 0.75 on the first castle after a boss
base(region) = 1.0, 1.35, 1.8, then × 1.25 per region
```

The target is that expected enemy strength **overtakes** expected roster power **P(n)** around region
3–4, so a good run ends between castle 12 and 20. `tools/raids/sim.mjs` plots D(n) against P(n) for
2,000 runs and a free check holds the median run length inside the target. Nobody tunes this by feel;
it is tuned by the sim, then by the funnel.

**Score**, all of it visible while playing:

```
castle score = (kills + coins + 50 × walls intact) × node multiplier × streak
streak       = +0.1 per consecutive castle cleared without losing an ally, reset on a loss
```

- **Fortress** ×1.5, **boss** ×2, a **modifier** ×1.2 each.
- **Clearing a boss without committing allies** doubles that castle's score: the bank-or-spend
  choice has a score on both sides.
- The **death screen** breaks the score down by castle and shows the gap to the personal best
  ("2 castles short of your best"). One button: **Ride again**.

---

## 8. Legacy, saving and scores

- **Legacy points** are the run score, as today (`addLegacy`). The same tree, the same pick-three.
- **Head starts** that assume a village (Trade Post standing, `startBuilt`) are **reinterpreted** for
  raids: `startArchers` becomes starting roster, `startCoins` becomes the opening war chest, and
  village head starts do nothing in raids and say so on the chooser.
- **Save** only on the map, between castles: `run.js` is small, pure and serialisable, and the map is
  the natural checkpoint. Quitting mid-castle resumes at the map node before it. A separate key from
  the story save, so neither mode can eat the other's run.
- **Scoreboards per mode.** Legacy power makes old scores incomparable over time; a **daily seeded
  run with a fixed kit** is the fair board and is iteration 2.

---

## 9. Budgets and measurement

| | Budget | Note |
| --- | --- | --- |
| Map screen | 0 draw calls | DOM/SVG; the renderer is stopped while it is up |
| A castle | the existing live budgets: < 400 draw calls, < 1M triangles | Allies are capped at 8 on the field |
| 25 castles in a row | no step in geometries, textures or heap | The churn check in the castle ticket |
| Download size | parked, per CLAUDE.md | Not a factor in any decision here |

**Funnel steps for raids** (`markFunnel`, #251): `play`, `castle1`, `boss1-reached`, `boss1-beaten`,
`ride-again`. The last is the number this whole mode exists to move.

---

## 10. Iteration 1, as tickets

In build order. Each lands behind `?mode=raids`, with its `?view=` on the board and a check that
proves it can fail.

| # | Slice | Done when | Model and effort |
| --- | --- | --- | --- |
| R1 | **Run state and map generation** (`run.js`, `map.js`, `curve.js`) and the sim | 2,000 generated regions pass the five map rules, the starter castle included; the sim prints run lengths and when the first boss is reached | Sonnet 5, medium — pure code with a clear spec; the sim is the check |
| R2 | **The map screen** (`overworld.js`, `?view=map`) | Tap, preview, Ride, on a phone frame, 0 draw calls while up | Sonnet 5, medium — a DOM panel under the house UI rules |
| R3 | **A castle stage** (`castle.js`, `startCastle`, `endCastle`, the director) | A seeded castle stands, three raids come, clear and fall both fire; 25 castles with no leak | Opus 5, high — it bends the core loop, and teardown has a leak history |
| R4 | **Roster, rewards and deploy** (`allies.js`, reward screen), Wren as a recruit | Earn, cap, deploy, lose, driven over a 5-castle run; Wren recruited once, her release fires in a castle | Sonnet 5, medium |
| R5 | **Bosses and the Call to Arms** | Commit n allies, they charge and are spent; the no-commit bonus scores | Opus 5, medium — the spend decision is the design's centre and is easy to make pointless |
| R6 | **Score, death screen, Ride again** | Breakdown by castle, gap to best, one tap to a new run under 5 s | Sonnet 5, medium |
| R7 | **Tuning the curve** with the sim | Median sim run ends between castle 12 and 20 | Opus 5, high — a wrong curve makes the mode quietly too easy or too hard without failing anything |
| R8 | **Legacy mapping and save at the map** | Picks apply as specified; a run resumes at its map node | Sonnet 5, medium |

**Out of iteration 1:** new biomes and art, the 3D map, the daily seeded run, online boards, more
boss types, the 40-card deck.

---

## 11. Decisions (owner, 2026-09-23)

These were the open questions. Each is answered and folded into the sections above.

| # | Question | Decision | Where it lands |
| --- | --- | --- | --- |
| 1 | Does a castle keep any economy? | **Defense only.** No building, no repair mats, no tower mats. Coin is score and the run's war chest, nothing else | Sections 4 and 5 |
| 2 | Do allies die permanently? | **For the run.** A deployed ally who dies is gone until the run ends; a new run starts clean. Long-term progression is the legacy tree only | Section 6 |
| 3 | How many castles to a boss? | **Five castles, then the boss.** A region is six nodes | Sections 1 and 4 |
| 4 | Is Wren an ally or a boss? | **An ally**, recruitable, with the release stun as her ability and no story | Section 6 |
| 5 | The first node of a run? | **A fixed, gentle starter castle**, the only node lit; the forks open after it | Section 4 |

**One consequence to watch.** Five castles before a boss puts the first boss 10–15 minutes into a run
at 90–180 s a castle, and most first runs would never reach one. So region 1's castles are the short
ones, 60–90 s, which brings the first boss to about 6–8 minutes. R1's sim reports when the first boss
is reached, and the funnel's `boss1-reached` step measures it with real players.
