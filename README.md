# Crown Rush

**Play it:** https://craigmroberts.github.io/crownrush/ (works on phones; add it to your home screen for full screen).

A simple, addictive low-poly defend-and-build game for the browser (desktop and phone).
No storyline, just the loop:

1. Raiders attack. You start with the King and the Queen, and losing either ends the game.
2. Shoot them down and grab the coins they drop.
3. Carry the coins to a build pad and stand on it to spend them.
4. Pads build your village: an archery range, more archers, watchtowers, a palisade, a barracks...
5. Every build unlocks new pads, so your army and village keep growing while the waves get harder.

**Goal:** survive 30 waves to secure the kingdom. After that the raids keep coming for a high score.

- The Queen follows the King and raiders go for her first. Build the Royal Keep and she shelters inside;
  raiders then bash the keep instead, and if it falls she is thrown out until you repair it. Keep HP grows
  with your wall upgrades.
- The King starts on foot and gathers wood, stone and straw by standing next to lumber groves, ore outcrops
  and wheat fields. Materials feed the Keep and nothing else; everything on a build pad costs coins.
- Roads grow out of the gates as you wall the village, and bridges over the river are built from pads at the
  crossings. Until a bridge exists, raiders only come from your side of the river.
- Unexplored land is hidden under fog that clears as the King travels; the minimap in the corner (tap to
  enlarge) shows what you have discovered. After each wave there is a breather before the next, or press
  "Send next wave" for bonus points.
- A blue arrow points home whenever the village is off-screen, and a score tracks kills, coins, materials,
  builds, army size and waves cleared.
- The map has a river that raiders (and the King) can only cross at the bridges where the curved roads
  meet it, so each bridge is a natural choke point. Mesas and snow peaks sit to the north-west, with
  forests, boulders, barricades, a wheat field and flower patches across the meadow.
- The village starts as a small plot. "Expand Village" pads grow it in three stages, each with its own
  wall ring. When the outer ring is complete the old inner wall is torn down.
- Walls are real: raiders are blocked and bash at short sections. A battered section degrades to the
  previous material (iron to stone to brick to wood) before it finally falls and shows a repair pad.
  Walls are rebuilt from wood to brick, stone and iron automatically as the Keep levels up.
- Watchtowers are built empty. A "Man the Tower" pad next to each one takes archers from your army
  (the price is people, not coins). Gate guards work the same way.
- Red arrows at the screen edge point at raiders you can't see, with a count and a skull for bosses.
- Sound is synthesised in the browser (no audio files): a looping background melody, arrow hits, coin
  pickups, the "ching" of coins being spent, build fanfares and wave horns. The speaker button mutes it.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). To play on your phone, make sure it is on the
same Wi-Fi and open the "Network" URL that Vite prints instead.

## Controls

- Phone: drag anywhere on the screen to move the King (virtual joystick).
- Desktop: WASD or arrow keys, or drag with the mouse.
- Pause with the ⏸ button, P or Esc. The game also pauses when the tab goes into the background.
- Everything else is automatic: the King and his archers shoot the nearest enemy, coins are picked up by
  walking near them, and standing on a build pad spends coins one at a time.

## The title screen

The start panel shows the King and Queen either side of a gold "Crown Rush" lockup. The portraits are
rendered at load from the real character rigs in a throwaway renderer (`renderPortrait` in
[src/rig.js](src/rig.js)), so they always match the game and add nothing to the download. A loading
bar counts the nine character models in and hands over to the Play button when everything is ready.

## The intro

The first time you press Play, four short steps explain the game one idea at a time (find the Queen,
fight and collect, build, feed the Keep) with Next and a Skip. Enter, Space or the right arrow also
advance. It is remembered in `localStorage`, so replays go straight in. The start screen itself is one
line.

## The opening: rescue the Queen

The run opens with an empty coin stack and the starting coins scattered along the road west, so
picking them up is the first thing you do and it teaches the pickup rule without a word.

The Queen starts captive in the wilds (`CFG.rescue`). Three Bandits circle her and she edges away from
whichever is nearest, so the scene reads as a capture from a distance rather than as four figures
standing in a field. A pink arrow points to her. Come within sight and she calls out with a heart while
the guards turn and square up, then a beat later they charge. Free her and she goes up in a burst of
hearts, with the odd one drifting up between the two of them afterwards on a quiet day.

**Nothing happens until you go and get her.** No raiders spawn while she is captive, however long you
take, and no build pad will accept payment: pads stay visible but shut, marked "Free the Queen". The
raids are the enemy coming to take her back, so the rescue is what starts the war. Clear her guards,
reach her, and the first raid is on its way (`CFG.rescue.firstRaid`). She follows the King from then
on; passing an intact Keep she steps inside.

## Reading the pads

Square pads BUILD something (structures, walls, bridges, expansions). Round pads do everything else,
with a coloured rim: blue recruits units or sends a crew, purple upgrades, green feeds the Keep.

The marker on the ground carries identity only: a big icon, a short name, and a level where the thing
it points at has one ("Royal Keep · Level 4", "Watchtower · Level 2"). Nobody can read a price off the
floor at a sharp angle while running past, so costs live in a small panel that appears bottom-right
when you stop on a pad, showing what it does, what it costs against what you carry, and how far the
payment has got. Pads only take payment once the King has stopped (or held for a moment, `CFG.spend`),
so walking across one costs nothing.

## Coins, ranks and towers

- **One currency that grows with the Keep.** Coins are bronze to start, silver from Keep level 4, gold
  from 8, platinum from 12 (`CFG.coins`); the look and score value change, the count is one number.
  Enemies of higher ranks drop more coins. Every pad costs coins except crews (archers) and the Keep
  itself (materials).
- **Info screen.** The blue **i** button (or the I key) pauses the game and lists what the next Keep
  level needs and gives, your army against its caps, every pad on offer with its cost and what it does,
  what appears at higher levels, and the enemy rank colours.
- **Enemy ranks by colour, paced by the Keep.** Bandits (tan) from the start, Raiders (red) once the
  Keep reaches level 3, Marauders (purple) at 7, Warlords (black and gold) at 11 (`CFG.ranks`). A wave
  is mostly the current rank with some lower ranks, plus at most two scouts of the next rank from wave
  5 (`CFG.waves.scouts`). Brutes and elites also wait for Keep levels 2 and 5. Each rank multiplies HP
  and damage and drops the next coin tier; waves add numbers and a small per-wave growth.
- **Watchtowers stand in the fort's corners.** A tower's pad cycles through build → man it → upgrade →
  man the new slots, up to level 3 (3 / 5 / 7 archers, sharper and longer-ranged arrows, `CFG.tower`).
  Gate Guards stand on small posts flanking each gate.
- **Train Archers** at the range: +25% damage and +20% health per level for every archer, including
  ones already recruited (`CFG.archerTraining`).

## Enemies that break a rule

Beyond the ranks, three enemies each demand a different answer, and each arrives once the Keep reaches
its level (`CFG.enemy.*.fromLevel`) so you meet one idea at a time:

- **Sappers** (Keep 3) ignore your army entirely, run at the nearest wall and blow themselves up
  against it. An army that has drifted out of position gets punished, and wall repair matters.
- **Enemy archers** (Keep 5) hold at a range beyond a level-one watchtower and shoot your soldiers and
  tower crews. Crews have health now and a dead one reopens the tower's crew pad. Go out and get
  them, or build the towers up: a level-two tower out-ranges them.
- **Shieldbearers** (Keep 7) take a quarter damage from the front. Hits show "blocked". Flank them,
  or let the horn scatter the fight.

## The warhorn

The King's one ability (`CFG.horn`). The horn button bottom-right, or Space on a keyboard, rallies
the army: every soldier runs to the King and fights faster and harder for a few seconds, and the
blast shoves nearby raiders back and stuns them. It recharges over about twenty seconds, shown as a
ring filling around the button, so using it at the right moment matters more than using it often.

## Losing the Queen is a chase

If the Queen's health hits zero she is not killed: raiders pick her up and march her toward the map
edge at a pace the King can catch (`CFG.rescue.escort`, `escortSpeed`). The pink arrow points to her
and nothing can be built until she is back. Cut down the whole escort and she is freed, shaken, and
the Keep loses a chunk of its health for it. It can happen once per run (`recaptures`); a second
capture, or an escort reaching the edge, ends the game.

## Day and night

The sun is the clock. Daylight is for gathering, building, recruiting and repairing; the raid arrives
at nightfall and the wave counter is the night counter (`CFG.cycle`). One cycle runs about 75 seconds,
roughly 45 of day and 30 of night, which is long enough for a round trip to the far mining nodes.

You get a warning as the sun starts going down, and dawn is the reward beat: hold the night and the
game says so. Every fifth night is a blood moon, which brings a boss and turns the whole sky red. If
you would rather not wait out the daylight, "Bring on the night" skips the rest of it for points.

While the Queen is still captive the clock does not run at all, so the opening stays in permanent
daylight until you go and get her.

## Thieves

Once you are carrying enough to be worth robbing, raids bring thieves (`CFG.waves.thieves`). A thief
does not fight: it sprints straight at the King, takes a share of the coins off his stack and runs for
the nearest map edge carrying them in plain sight. Walls do not stop it, so archers and speed are the
only answer. Cut it down and everything it took spills back onto the ground; let it reach the edge and
those coins are gone for good.

They are announced before they arrive, they never show up before you have coins worth taking, and the
chase window is roughly ten seconds.

## Rewards: pick one of three

Every Keep level pauses the game and offers three rewards; you keep one. The pool is in
[src/upgrades.js](src/upgrades.js) and covers five areas: your army, watchtowers, walls, the economy
and the King himself. Offers draw from different areas where they can, so a choice is never three
flavours of the same idea, and a few rewards are rare and change how a run plays rather than how fast
it goes.

Each reward sets a multiplier or a flag on `game.mods`, and those are the only places gameplay code
has to read, so adding a new one is a single entry in that file. Rewards apply retroactively where it
matters: taking an archer reward upgrades the archers you already have, and a wall reward re-rates
walls already standing. Levels can chain when you arrive with a full stockpile, so offers queue and
come one at a time. The info screen lists everything you have taken.

## The ending: march on the camp

The raids come from a real place: the raider camp in the far north (`CFG.finale`), a ring of tents and
spikes around a fire under the Warlord's skull banner. The first raiding party of every night comes
from its direction. Its garrison sleeps until the King comes within reach, so a curious early visit
ends in a scramble.

The goal is no longer a night count. Reach Keep level 13 (or night 30, whichever comes first) and the
march opens: a toast, a swords arrow on the screen edge, and "march on the camp!" in the HUD. Walk in
and the camp wakes. The Warlord fights as a boss and calls men from the tents every few seconds while
he lives, so it is a fight against reinforcements, not a health bar. Kill him and the war is over.
Nights keep coming afterwards for a high score, but the story is done.

## Materials come in ages

Materials unlock with the Keep and the walls follow them, so a level-up is one moment rather than
three (`CFG.base.materialAt` and `wallAt`):

| Keep level | Material | Walls become |
| --- | --- | --- |
| 1 | Wood | wood |
| 4 | Stone | stone |
| 8 | Iron | iron |
| 12 | Diamond | diamond |

The buildings follow too: the hut, watchtowers, barracks and the Keep are rebuilt in the new
material when the Keep crosses a boundary (`MATERIALS` in [src/models.js](src/models.js)), so a
level-12 village of pale diamond walls and crystal roofs looks nothing like the timber plot you
started with. Towers keep their level and crew, the Keep keeps its health bar and the Queen on the
balcony, and build-pad ghosts preview the material you would build in right now.

A material's nodes do not exist on the map until the Keep can use it, so each age opens new ground:
stone quarries, then the iron seams at the foot of the north-west mesas, then diamond in the deep rock
across the river. Each band of Keep levels asks mainly for its newest material, so levelling always
sends you somewhere new instead of back to the same trees. Straw sits outside the chain as a light
binder needed in small amounts all the way up. The Keep also hardens in a real step at each boundary
rather than drifting up level by level.

## The Keep is the base

Wood, stone and straw you mine are spent on one thing only: **feeding the Keep**. Stand on the pad at
its door to pour in materials; when the level's requirement is met the Keep levels up (1 to 15,
`CFG.base.levels`). Each level raises how many archers and swordsmen the village supports
(`CFG.base.archers` / `swordsmen`; recruit pads lock with a "Keep Lv N" card when you hit the cap),
speeds up every bow (1x at level 1, 2x at level 8, 3x at level 15) and rebuilds all walls in the next
material at levels 4, 8 and 12 (`CFG.base.wallAt`). Some pads only appear at a Keep level
(`minLevel`: village expansions, barracks). Coins still buy everything else.

## Tuning the game

All balance lives in [`src/config.js`](src/config.js):

- `CFG` holds unit stats, wave pacing, enemy stats and the coin pickup radius.
- `PADS` is the build tree. Each pad has a position, a cost, an icon, what it requires, and what it does
  (spawn units, build a structure, or apply an upgrade). Add an entry and it appears in the game.
- `NODES` lists the resource nodes and their stock; `CFG.score` the points table.
- `MAP` is the terrain: river centreline, road splines and the wheat field. Bridges are placed automatically
  where a road crosses the river.
- `TIERS` is the village layout: the rectangle for each expansion stage, its gates, and wall section length.
- `CFG.wallLevels` sets HP and repair cost per wall material.

## Project layout

```
index.html        HUD + start / game-over screens
src/main.js       bootstraps the game loop
src/game.js       the whole simulation: player, army, enemies, waves, coins, pads, camera
src/models.js     buildings, walls, scenery, pads, effects (and the baking helpers)
src/characters.js smooth toy-figure characters with painted faces (army, raiders, mounted king)
src/rig.js        loads rigged GLB characters and plays their animations
tools/blender/    Blender script that builds and exports rigged characters (public/models/*.glb)
src/world.js      terrain, paths, cliffs, trees, lighting
src/input.js      virtual joystick + keyboard
src/hud.js        DOM overlay
src/icons.js      hand-drawn SVG icon set used by the HUD and rasterised for the build pads
src/audio.js      Web Audio synth: music loop and sound effects
src/config.js     balance and build tree
```

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other dependencies.

## Making characters in Blender

`tools/blender/make_character.py` builds a rigged chibi character from primitives, gives it Idle, Walk and
Attack clips, exports a GLB and renders a preview:

```bash
blender -b -P tools/blender/make_character.py -- king public/models/king.glb .shots/king.png
```

Every character (King on foot and mounted, Queen, archer, swordsman, raider, elite, brute, giant) comes from these
Draco-compressed GLBs; the game falls back to the code-built figures if a model fails to load. Add a
`build_<name>()` function to the script to make a new character.

## Performance

Open the game with `?perf=1` on the end of the URL (works on the live site and on a phone) to see a
live readout: fps, CPU ms per frame, draw calls, triangles and character count. Budgets:

| Metric | Aim for | Why |
| --- | --- | --- |
| Frame time | < 16 ms desktop, < 33 ms phone | 60 / 30 fps; anything slower feels laggy |
| Draw calls | < 400 late game | each one costs CPU time no matter how small it is |
| Triangles | < 1M late game | phones slow down past this, especially with shadows |
| Triangles per character | ~5k (King 6.5k) | 100+ characters can be on screen |
| Load | < 3 MB total | first play on mobile data |

What keeps it fast:
- Every character is ONE skinned mesh with vertex colours and a per-vertex roughness/metalness
  attribute (`src/rig.js`), so a character costs one draw call instead of the 8-11 primitives Blender
  exports.
- `tools/blender/make_character.py` bakes each part's modifiers before joining (join keeps only the
  first part's subdivision, which used to smooth the whole body to 17-62k triangles) and lowers
  sphere/cylinder resolution for small parts.
- Static scenery is merged into a few meshes; grass, pebbles, wheat, fence pickets and the King's coin
  stack are instanced. Off-screen characters are frustum-culled.
- Phones use blob shadows for characters (one instanced draw) instead of rendering every character
  into the shadow map, a 1024 shadow map and pixel ratio 1.5.
- Enemy separation uses a spatial grid; the river/bridge search is cached per enemy.
- Dead characters release their health-bar and skeleton textures.

## Fitting a character to a reference image

`tools/fit/fit.py` runs inside Blender's own Python (numpy is bundled, nothing to install) and fits
a character to a front-view reference with no AI in the loop: rebuild, flat-render, score silhouette
and colour against the reference, nudge one proportion, keep it if better, stop when it stalls. It
writes the best parameters to `tools/fit/params/<who>.json`, which the model build picks up
automatically, and a reference | render | overlay report. See [tools/fit/README.md](tools/fit/README.md).

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages through the workflow in
`.github/workflows/deploy.yml`. `npm run build` produces the same static site in `dist/` if you want to host
it elsewhere.
