# Crown Rush

**Play it:** https://craigmroberts.github.io/crownrush/ (works on phones; add it to your home screen for full screen).

A simple, addictive low-poly defend-and-build game for the browser (desktop and phone).

Raiders have carried off Queen Wren. Taking her back is what starts the war, because every raid after
that is them coming for her again — and it ends at their camp, with the Warlord who sent them. That is
the whole of the story, and it is told in about a dozen lines at moments the game already had. The
loop underneath it:

1. Raiders attack. Lose the King, or lose Wren twice, and the run is over.
2. Shoot them down and grab the coins they drop.
3. Carry the coins to a build pad and stand on it to spend them.
4. Pads build your village: an archery range, more archers, watchtowers, a palisade, a barracks...
5. Every build unlocks new pads, so your army and village keep growing while the waves get harder.

**Goal:** survive 30 waves to secure the kingdom. After that the raids keep coming for a high score.

- The Queen follows the King and raiders go for her first. She cannot be hurt -- only carried off, by
  raiders who reach her and hold on. Build the Royal Keep and she shelters inside; raiders then bash the
  keep instead, and if it falls she is thrown out until you repair it. Keep HP grows with your wall
  upgrades.
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
- The Keep has one mat, in one place, all game, and it always offers the Keep's next job: **Raise the
  Keep** while it stands, **Repair the Keep** while it is rubble, in the green of an upgrade or the
  brown of a build so you can tell which without reading it. Levelling a Keep that is not standing is
  not possible, which is the whole reason the repair takes the raise's place rather than sitting
  somewhere else.
- Watchtowers are built empty. A "Man the Tower" pad next to each one takes archers from your army
  (the price is people, not coins). Gate guards work the same way.
- Red arrows at the screen edge point at raiders you can't see, with a count and a skull for bosses.
- The HUD floats on the scene: no plaque, no capsule, no panel behind any of it. Left is two short
  rows -- a crescent and the night beside a castle and the Keep level, with the King's health as five
  hearts under them -- five hearts, each draining by eighths, so losing a little shows as losing a
  little. Right is the coin count and the bag, whose ring is how full it is -- one continuous
  arc running green to yellow to orange to red, so the cap is never a number anyone has to read. The
  middle is left empty on purpose. Every bar and pip is out of it; the only precise health readout is
  the one over the King's head, and that shows only when he is hurt, so no shape is drawn twice.
- A meter under the night line says what is left of tonight's raid: a bar of the health it arrived
  with, and the number still standing. Raiders who have not walked on yet are already counted, so it
  only falls, and it goes when the last one does -- which is the answer to "is that all of them?"
  without sweeping the map. The Warlord calling reinforcements is the one thing that puts it back up.
  The King has no bar in the corner: his own is over his head, where everyone else's is.
- Nothing on the field carries a frame. The minimap and the settings gear both used to wear a gold
  ring; the gear is just a gear now, which is what let it grow to fill the space the border was using,
  and the map has no edge at all -- it fades out into the grass and is slightly see-through, so it
  sits in the world rather than on top of it. The fade is what separates it; a shadow needs an edge to
  hug and there is no longer one. The transparency is the element's own opacity rather than an alpha
  inside the drawing, because thinning the fog pass would thin it *relative to* the ground underneath
  and leak the shape of land you have not walked yet.
- A notice is a caption over the world rather than a card on top of it, rising in and then floating
  gently while it is up: no border, a dark translucent panel, light text, and a small label in the
  corner saying who is speaking or what it is about --
  **Wren**, **Raid**, **Keep**, **Village**, **Bag**. The few notices that are the game talking about
  itself rather than about the world (a lost graphics context) carry no label at all.
  Some of those labels are people and some are headings, and they no longer look the same. A speaker
  gets their own colour and their face beside their name; a category keeps the pale green it always
  had. The faces are rendered once at load, in the same block as the title portraits and before the
  second WebGL context is handed back -- a browser caps how many contexts a page may hold, and this
  game already carries a safe-mode recovery path for losing the one it needs, so standing another up
  every time Wren says something would trade that for a decoration. Measured: two extra renders while
  the renderer is already warm cost 3ms of a 2.36s load, and no context is created after the game
  starts. Who is a person lives in one table, so the Warlord is a row when he has a rig to render.
- A notice is one box. Always the same width, never more than three lines: a longer one becomes pages,
  with a bobbing arrow under the text saying there is more, and it turns the page on its own once
  there has been time to read it, or at once if you tap it. Tapping only does anything while there
  *is* another page -- the bottom centre of the screen is where a thumb already lives, and a notice
  is not worth taking a patch of that away permanently.
  The words type themselves out. They are all laid out at full size first and only their opacity is
  staggered, so the box cannot re-wrap or re-centre partway through; the hold starts when the last
  letter lands rather than when the notice appears. Reduced motion gets the whole line at once.
- Everything that speaks does it in the same place, at the bottom: the notice, the mat chip that says
  what the pad under the King costs, and the attack alarm, which used to be a solid red pill at the
  top of the screen and is now the same dark caption with the urgency in the colour of the words.
  Only one of them can have the line, and the one that cannot wait gets it -- a notice is timed and
  never comes back, the chip is on screen only because the King is standing somewhere and returns the
  moment he stands there again, so the chip stands down and takes its turn. The alarm is the exception
  and is meant to be: an alarm and a notice are the shout and the sentence, and several beats raise
  both, so the alarm keeps a slot directly above. That slot is measured rather than assumed -- it
  clears whatever is on the line, which is the only thing that holds when a notice can be one line or
  four.
- What you scoop off a heap flies to the bag in the corner and the bag bumps when it lands, so the
  armful you picked up and the number that changed are one event. The ledger is credited before the
  flight, not when it arrives: hanging a player's materials on a CSS transition completing would cost
  them the pickup on a backgrounded tab, and no animation is worth that.
- A sheet that takes the screen -- settings, how to play, the Keep, pause, a reward to choose -- is its
  content on a gaussian-blurred world rather than a card sitting on one: no panel, no border, light
  text. It rises in and settles on the way up and leaves quicker and downward, the curve everything
  else in the game uses. The blur is affordable there in a way it is not for a notice, because every
  one of these pauses the game: the canvas behind is a still picture, so it is computed once rather
  than sixty times a second.
  The four you open by choice have a close in the corner as well as at the bottom. The reward choice
  deliberately has neither -- a pending choice that could be dismissed once left the King stopped
  dead with nothing able to resume him.
- Sound is synthesised in the browser (no audio files): a looping background melody, arrow hits, coin
  pickups, the "ching" of coins being spent, build fanfares and wave horns. The speaker button mutes it.
  Wren has a voice, made the same way -- a sawtooth through two bandpass filters at a vowel's formants,
  which is a buzz shaped by the mouth around it, the same trick the wolf's howl uses. She calls out
  when the Keep is attacked and cries differently when raiders get hold of her, and not while she is
  the one being carried off. `speechSynthesis` would have said real words and was rejected: the voice
  is whatever the device ships, iOS will not speak without a gesture, and it does not go through the
  audio graph, so it would have been the only sound in the game the mute button could not reach.

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
bar counts in the eleven models the opening needs and hands over to the Play button once they are in.
The three heaviest — the mounted King, the Barracks and the villager home — are not among them: none
can appear for several minutes, so they download behind the title screen instead, and the service
worker precaches the lot after that. Waiting for all fourteen cost 12.0 s to a clickable Play button
on a throttled 4 Mbps / 100 ms connection; waiting for eleven, fetched in parallel rather than one
after another, costs 9.2 s.

## Picking a run back up

A full run is thirty nights of about seventy-five seconds, and a phone browser throws away a
backgrounded tab whenever it feels like it. The run is written to `localStorage` at every dawn --
the one beat where the field is quiet, the spawn queue empty and nothing in flight -- and the title
screen offers **Continue** above a Play button that now says *New run*, with the night, the Keep
level and the score under it. At most one cycle is ever lost.

What is stored is state rather than history. Replaying the pads that were bought would mean replaying
every toast, every coin of score and every reward choice over a game that has not started, so
everything the player *has* is written down directly and only five builders are replayed on load:
the buildings, the walls, the expansions, the bridges and the horse -- the ones whose output is a
mesh in a place rather than a number. Enemies, loose coins, arrows and half-mined piles are not
stored; at dawn there are none, which is what makes dawn the place to do this. The fog of war is,
as a 256x256 PNG, because the minimap is most of how the map gets read and coming back blind would
undo a good part of what the player did. A saved run runs about 17 kB.

One other thing asks for a save, since installing an update reloads the page. It only gets one when
the field *looks* like dawn -- daylight, nothing standing, nothing queued, the opening over -- and is
refused otherwise, which the Settings row says out loud before you tap it.

Winning or losing clears it, and so does starting a new run. See [src/game-save.js](src/game-save.js).

Finished runs are kept separately, in [src/scores.js](src/scores.js), under their own key and their own
version -- a save-format bump throws the run save away, and that is no reason to lose somebody's best
night. Ten are kept, by score rather than by recency: a board that forgets your best run because you
played ten bad ones afterwards is not a board. Every ending writes one, and the row says which of the
four it was, because a victory and a high-scoring loss are different achievements and sorting by score
alone flattens that. **Settings › Best runs** shows them. Every read and write is wrapped: a browser
that refuses storage still plays the game, and still ends a run.

## The intro

The first time you press Play, four short steps explain the game one idea at a time (find the Queen,
fight and collect, build, feed the Keep) with Next and a Skip. Enter, Space or the right arrow also
advance. It is remembered in `localStorage`, so replays go straight in. The start screen itself is one
line.

## The opening: rescue the Queen

The run opens with an empty coin stack and the starting coins scattered along the road west, so
picking them up is the first thing you do and it teaches the pickup rule without a word.

The white circle under the King **is** that reach: one number (`CFG.king.pickupRadius`) is both what
coins are tested against and what the ring is drawn at, so they cannot drift apart. It used to be the
size of his retinue instead, which meant coins flew in from outside it from the very first pickup, and
from four times outside it once **Lodestone** was stacked. Lodestone now visibly widens the circle --
which is also why it multiplies by 1.35 rather than 1.8: at 1.8 the full stack reached 11.99 and the
circle ran off a phone screen entirely, leaving the King with no mark under him at all.

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
floor at a sharp angle while running past, so the cost lives on a chip that appears above the controls
when you stop on a pad: what it is, what it costs against what you carry, and a bar for how far the
payment has got. It used to be a full sheet across the bottom edge, which is a lot of screen to cover
in a village made of mats -- the description and the fine print are behind a tap now, and what you
cannot play without stays on the face of it. Pads only take payment once the King has stopped (or held
for a moment, `CFG.spend`), so walking across one costs nothing.

Three mats change what you can *do* rather than what stands in the village: Train Archers, the
Warhorse and the Royal Guard -- the pads carrying an `effect` that is the player's rather than the
village's. Buying one stops the game and says where you have got to, and waits to be dismissed:
*Training 3 of 5*, what an arrow hits for now against an untrained archer's, how many are left on the
mat and what the next one costs (`capabilityGains` in [src/game-view.js](src/game-view.js)). It says
the state and not the delta, because a per-level percentage is a true sentence that answers nothing on
the third buy. Both places the game used to say it missed: the mat's own `desc` is behind a tap on
the chip, and the toast ran for 3.2 seconds over a game that kept playing, at the one moment the
player was least likely to be standing still and reading. It pauses regardless of what the raid is
doing, the way a Keep level does -- it can happen nine times in a whole run, and every one of them is
the player standing still on a mat by his own choice.

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

## The Queen is taken, never hurt

Nothing in the game takes health off the Queen, because she has none. Arrows and a sapper's blast go
straight through her -- neither can kidnap anybody -- and a raider that reaches her gets hold of her
instead. The bar over her head is that grip, not her health: it runs down while they have her and
climbs back the moment they do not, so it appears only when she is actually in trouble.

Only raiders that have *chosen* her count, which is what `CFG.queen.targetWeight` decides. She
follows the King closely enough that a scrum around him happens within arm's reach of her, so the
rule is that they came for her, not that they happen to be standing there: he faces the fight, and
they come round the back for her.

One raider takes her in 3.4 seconds, two in 2.2, three in 1.6 (`CFG.queen.seize`). That is time
enough for four of the King's arrows, or the horn, or simply running -- she moves at almost his
speed. Getting her through the Keep door clears the grip outright, which is the best save in the
game. Higher enemy ranks carry more health, so the arrows stop being an answer before the horn and
the door do.

Then it is a chase. Raiders pick her up and march her toward the map edge at a pace the King can
catch (`CFG.rescue.escort`, `escortSpeed`). The pink arrow points to her and nothing can be built
until she is back. Cut down the whole escort and she is freed, shaken -- they still half have her,
and it takes a couple of seconds to shake off -- and the Keep loses a chunk of its health for it. It
can happen once per run (`recaptures`); a second capture, or an escort reaching the edge, ends the
game.

She has a name and a voice, because a named person being carried off is a different event from "the
Queen" being carried off. The lines are short and there are not many -- the rescue, the recapture,
the Keep, the camp waking -- and they go out through `hud.toast`, which was already a queue that
holds long enough to read and scales its duration to the text. She is not a damsel and does not read
like one: she cannot be hurt, and coming back from an escort she says so.

The Warlord going down is the exception, and it is in the victory panel rather than a toast. A toast
there would have had six hundred milliseconds before the overlay covered it, which is not long enough
to read anything.

## Day and night

The sun is the clock. Daylight is for gathering, building, recruiting and repairing; the raid arrives
at nightfall and the wave counter is the night counter (`CFG.cycle`). One cycle runs about 75 seconds,
roughly 45 of day and 30 of night, which is long enough for a round trip to the far mining nodes.

The sun will not rise on a raid that is still standing: dawn waits at the horizon until the last
raider is down, for up to `CFG.cycle.holdDawn` seconds. The cap is there because plenty can survive
without being reachable -- one stuck across the river, an archer holding at range, a thief most of the
way to the map edge -- and a night held open forever is a run that cannot continue.

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

Every Keep level pauses the game and says what the level just gave -- the army limit, any material
that opened, the walls' new stuff, what a coin is now worth, any pad that has appeared -- before it
asks for a choice. That list is `levelGains(N)`, the same one the Keep plaque reads to answer *what
will the next level give me*; it was there all along and only one of the two screens was asking. The
level's news used to go out as toasts fired in the same tick as this panel, and `#toast` is z-index 4
against the panel's 10, so the game announced every level underneath the thing covering it.

You keep one of three rewards. The pool is in
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
binder needed in small amounts all the way up; every wheat field on the map can be cut, and the two
inside the walls carry the least, so the far ones stay worth the walk. The Keep also hardens in a real step at each boundary
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
src/game.js       the Game class: setting up, starting and stopping, and the one update loop
src/game-build.js   the pads, what they cost, and the walls and Keep they put on the field
src/game-enemies.js what a wave is made of, how each raider behaves, the Queen taken and got back
src/game-units.js   the King and the army: recruiting, moving, fighting
src/game-view.js    fog, minimap, time of day, camera, effects, popups, coins, resource nodes
src/game-shared.js  the few scratch values and helpers all of the above share
src/models.js     buildings, walls, scenery, pads, effects (and the baking helpers)
src/characters.js smooth toy-figure characters with painted faces (army, raiders, mounted king)
src/rig.js        loads rigged GLB characters and plays their animations
src/crowd.js      draws the crowd as one instanced mesh per model, skinned on the GPU
tools/blender/    Blender script that builds and exports rigged characters (public/models/*.glb)
tools/fit/        fits a character to a reference image, locally, with no AI in the loop
tools/icons/      draws the home-screen icons from the game's own crown (npm run icons)
tools/models/     re-compresses the exported characters with meshopt (see Making characters)
tools/probe/      drives the built game headless and reports what the renderer did (see its README)
tools/scout/      offline pass that studies the game and files improvement issues (see its README)
src/world.js      terrain, paths, cliffs, trees, lighting
src/input.js      virtual joystick + keyboard
src/hud.js        DOM overlay
src/icons.js      hand-drawn SVG icon set used by the HUD and rasterised for the build pads
src/audio.js      Web Audio synth: music loop and sound effects
src/config.js     balance and build tree
```

The four `game-*.js` files are the same class. They export plain objects of methods that
`game.js` puts on `Game.prototype`, so a method reads and behaves exactly as it did when all 3,651
lines were in one file — `this` is the same `this`. The split is about being able to find things.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other dependencies.

## Making characters in Blender

`tools/blender/make_character.py` builds a rigged chibi character from primitives, gives it Idle, Walk and
Attack clips, exports a GLB and renders a preview:

```bash
blender -b -P tools/blender/make_character.py -- king public/models/king.glb .shots/king.png
npm run models    # then re-compress; Blender cannot write the format the game loads
```

Every character (King on foot and mounted, Queen, archer, swordsman, raider, elite, brute, giant) comes from these
GLBs; the game falls back to the code-built figures if a model fails to load. Add a
`build_<name>()` function to the script to make a new character.

Blender writes them uncompressed and `tools/models/compress.mjs` re-encodes them with
`EXT_meshopt_compression`, because Blender cannot export that format itself. Measured across the nine
characters, brotli'd as a static host serves them: Draco was 341 kB of models behind a 57 kB decoder,
meshopt is 308 kB behind a 7 kB one, and no compression at all was 439 kB. Meshopt wins on both halves
of the sum and decodes faster, so the Draco decoder that used to sit in `public/draco` is gone.

## Performance

Open the game with `?perf=1` on the end of the URL (works on the live site and on a phone) to see a
live readout: fps, CPU ms per frame, draw calls, triangles and character count, plus a count of
exceptions the frame loop has swallowed and the last one's message. The `try/catch` around
`game.update` is the right call for shipping -- a throw costs one frame rather than the run -- and it
is also how a crash in the river foam went unnoticed for as long as it did (#54), so the overlay says
when it has happened. `npm run probe -- --crowd 120` collects the rest without you, on a fixed scene,
so a change can be measured rather than argued about --
see [tools/probe/README.md](tools/probe/README.md). Budgets:

| Metric | Aim for | Why |
| --- | --- | --- |
| Frame time | < 16 ms desktop, < 33 ms phone | 60 / 30 fps; anything slower feels laggy |
| Draw calls | < 400 late game | each one costs CPU time no matter how small it is |
| Triangles | < 1M late game | phones slow down past this, especially with shadows |
| Triangles per character | ~5k (King 6.5k) | 100+ characters can be on screen |
| Load | < 3 MB to the Play button | first play on mobile data |

What keeps it fast:
- The crowd — raiders, archers, swordsmen, elites, brutes, the boss — is ONE instanced draw per model,
  animated on the GPU from a baked bone-matrix texture (`src/crowd.js`). 181 characters cost 6 draw
  calls and no bone textures where they used to cost about 360 and one texture each. The King and the
  Queen stay on the skinned path. `?crowd=0` puts everything back on it.
- Every character on the skinned path is ONE skinned mesh with vertex colours and a per-vertex
  roughness/metalness attribute (`src/rig.js`), so a character costs one draw call instead of the
  8-11 primitives Blender exports.
- `tools/blender/make_character.py` bakes each part's modifiers before joining (join keeps only the
  first part's subdivision, which used to smooth the whole body to 17-62k triangles) and lowers
  sphere/cylinder resolution for small parts.
- Static scenery is merged into a few meshes; grass, pebbles, wheat, fence pickets and the King's coin
  stack are instanced. Off-screen characters are frustum-culled.
- Phones use blob shadows for characters (one instanced draw) instead of rendering every character
  into the shadow map, a 1024 shadow map and pixel ratio 1.5.
- Enemy separation uses a spatial grid; the river/bridge search is cached per enemy.
- Dead characters release their health-bar and skeleton textures.
- The characters are meshopt-compressed rather than Draco'd: smaller on the wire, and a 7 kB decoder
  bundled with the game instead of 245 kB of decoder fetched at run time.
- Coins on the ground are two instanced draws however many are lying about (`CoinField` in
  `src/models.js`). A night's worth of uncollected coins used to be a mesh each, face and rim, and
  cast shadows besides.

## Fitting a character to a reference image

`tools/fit/fit.py` runs inside Blender's own Python (numpy is bundled, nothing to install) and fits
a character to a front-view reference with no AI in the loop: rebuild, flat-render, score silhouette
and colour against the reference, nudge one proportion, keep it if better, stop when it stalls. It
writes the best parameters to `tools/fit/params/<who>.json`, which the model build picks up
automatically, and a reference | render | overlay report. See [tools/fit/README.md](tools/fit/README.md).

## Installing it like an app

The game is a progressive web app, so a phone can put it on the home screen and run it from there with
no browser around it and no connection.

- **iOS**: open it in Safari, Share, Add to Home Screen.
- **Android**: Chrome offers Install, or Add to Home Screen from the menu.
- **Desktop**: Chrome and Edge show an install control in the address bar.

The drawing buffer is sized from the largest of the canvas's own box, `visualViewport` and
`window.inner*`, and then asked for again four times over the first second and a half. That is not
belt and braces for its own sake: under `viewport-fit=cover` iOS answers those three differently, the
canvas is meant to cover the screen so a short answer is always the wrong one, and there is no event
for "the standalone box has settled". A buffer that comes up short shows as bands of flat page green
at the top and bottom with the HUD sitting on them. `?perf=1` prints all of those sizes plus the
safe-area insets on a second line, because a headless browser has no safe areas and no standalone
mode and cannot answer which source went short.

Once it has been opened with a connection, a service worker holds the whole thing — bundle, character
models and fonts, about three and a half megabytes — so it opens again without one. Verified by
loading it, pulling the network, and playing.

It registers last, after the models, rather than on `load`. Its install fetches every file with
`cache: 'reload'`, which deliberately ignores the browser's own cache, so registering it early put a
second full copy of every model on the wire beside the ones the game was still waiting on. What the
opening needs comes first, then what the next few minutes need, then what tomorrow needs.

Two pieces make that work, and both are generated rather than written by hand:

`public/manifest.webmanifest` names the app, sets the green the splash screen uses, and points at the
icons. `npm run icons` draws those from the game's own crown (`tools/icons/make-app-icons.mjs`) so they
stay on-brand, including the separate maskable one that Android crops to a circle.

The service worker is written at build time by a plugin in `vite.config.js`, because the list of files
to cache cannot be written by hand: Vite hashes the bundle's names on every build. The cache is named
after a hash of every file's name *and contents*, and a new worker deletes every cache that is not its
own, so a deploy replaces the lot rather than serving half of one version and half of another. That
costs a full re-download per deploy, which is the price of the files under `public/` — the character
models — being unhashed and otherwise uncacheable-safely. Hashing the contents is what makes a deploy
that only redraws a model count as a deploy: the names alone were identical, so the worker came out
byte-for-byte the same and nothing told the browser anything had changed.

A new worker installs and then **waits**. It used to call `skipWaiting()` and take over the page it
found, which is what made the row below impossible: an update that swaps itself in cannot be offered,
declined, or saved before. It also sat oddly with `activate` deleting every cache that is not the new
one — nothing breaks from that today only because the worker is registered *after* the last model has
been fetched, so a run in progress asks the cache for nothing. That is the current load order rather
than a guarantee. Now the page decides when to swap.

Settings has a **Check for updates** row for that, with the build the worker is answering with printed
underneath it, so "Up to date" can be checked rather than believed. The row says so plainly when there
is no connection instead of reporting good news it does not have. Installing reloads the page, so it
takes a fresh save first when the field happens to be quiet enough for one — daylight, nothing on the
field, nothing queued — and warns that the run picks up from the last dawn when it is not. The game
also checks by itself when it comes back to the foreground, at most every fifteen minutes: that is the
only moment a homescreen app reliably gives you, because iOS *resumes* it to the page it was already on
rather than navigating, so nothing re-checks the worker and a phone can sit on one build for weeks.

Cache lookups pass `ignoreVary`. Without it the shell loads offline and the bundle does not: a server
answering `Vary: Accept-Encoding` makes the browser compare request headers against the ones that
filled the cache, and a module script does not ask the way the install-time fetch did.

Registration is skipped in `npm run dev`, where a worker caching the bundle would fight Vite's
reloading.

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages through the workflow in
`.github/workflows/deploy.yml`. `npm run build` produces the same static site in `dist/` if you want to host
it elsewhere.
