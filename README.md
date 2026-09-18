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

**Goal:** raise the Keep, then march on the raider camp and kill the Warlord. There are two run
lengths, chosen on the title screen (#58) — a **short run** of fifteen nights, about nineteen minutes,
and a **long run** of thirty, about thirty-seven. Both reach Marauders, Warlords and the camp: a
length changes when the camp opens and what a Keep level costs, and nothing else. After the war is won
the raids keep coming for a high score.

- The Queen follows the King and raiders go for her first. She cannot be hurt -- only carried off, by
  raiders who reach her and hold on. Build the Royal Keep and she shelters inside; raiders then bash the
  keep instead, and if it falls she is thrown out until you repair it. Keep HP grows with your wall
  upgrades.
- The King starts on foot and gathers wood, stone and straw by standing next to lumber groves, ore outcrops
  and wheat fields. Everything in the game is paid for in coin; what you mine is not spent anywhere, it is
  carried to the trade post and sold. That is the whole of what mining is for -- and the bag says so
  when it fills, once per fill, because filling it is the moment that sentence is worth reading. It
  used to be said only when you walked onto a heap you could not lift, which is a refusal rather than
  a notice: the moment the bag actually filled, nothing was said and the swings went on landing (#129).
- Roads grow out of the gates as you wall the village, and bridges over the river are built from pads at the
  crossings. Until a bridge exists, raiders only come from your side of the river.
- Unexplored land is hidden under fog that clears as the King travels. The minimap that read it is
  **parked** (#145, `CFG.minimap`) -- it owned the top-right corner and was not earning it. Off rather
  than deleted, the same shape as the run-length pills: a terrain bake, a fog layer and a big/small
  state are a lot to rebuild to find out, and turning the flag back on is the whole of bringing it
  back. The fog itself is untouched. When it is on, the map in the top-right (tap to
  enlarge) shows what you have discovered. After each wave there is a breather before the next, or press
  "Send next wave" for bonus points.
- A blue arrow points home whenever the village is off-screen, and a score tracks kills, coins, materials,
  builds, army size and waves cleared.
- The map has a river that raiders (and the King) can only cross at the bridges where the curved roads
  meet it, so each bridge is a natural choke point. Mesas and snow peaks sit to the north-west, with
  forests, boulders, barricades, a wheat field and flower patches across the meadow.
- **Wind, and what does not have it.** Only grass and wheat ever swayed, so the world read as a still
  photograph with an animated carpet on it. Canopies and bushes move now. The catch is that
  `swayMaterial` takes its phase from `instanceMatrix`, which a merged tree has not got -- every tree
  would have swung in unison, which is worse than standing still -- so the phase is baked per object
  into `uv.x`, an attribute every baked geometry carries and nothing reads. It cannot come from the
  vertex position: a canopy is two units across, so one side would lead the other by radians and the
  tree would shear. Both sway materials carry a `customProgramCacheKey`, because `onBeforeCompile` is
  not part of Three's program cache key and a material with matching DEFINES can silently be handed
  somebody else's compiled shader.
- **Contact shadows, which on a phone are the only ones.** `shadowMap.enabled` is
  `!(safe || (mobile && !hq))`, so on an ordinary phone nothing casts: characters get their instanced
  blob and every tree, rock, bush and bale floats. 671 instanced discs, sized from each object's own
  bounding box so nothing has to be plumbed through the call sites. Heavier (0.42) where they are the
  only shadow, fainter (0.2) where the sun casts too and they are doing ambient occlusion instead.
- **Grass, and where it is not.** 13,000 instanced tufts in one draw call. What is kept bare is the
  **citadel** -- the tight first ring the Keep and its three service buildings stand in, which is
  paved and walked over all game. Everything beyond it is countryside, including the ground inside the
  later walls, because those enclose farmland and homes rather than a city. The mats are kept clear
  too: `spend.padSize` is 3.6 across and grass is held 2.6 off, so nothing grows through a price.

  **Coverage is three layers and the models are the top one.** 9000 tufts on the old flat ground was
  already close to a reference's density and still read as a lawn with things stuck in it, which is
  the useful thing this taught: the ground BETWEEN the grass is what decides whether a field looks
  grown. So the ground texture carries most of it -- 512 rather than 256 at the same 16x repeat, so
  the tile is still 11.9 world units with twice the detail in it, mottled at the scale of metres,
  with earth showing faintly through and a fine speckle pass that mips away at distance. It is
  `anisotropy: 4`, because the far half of every frame is ground seen at 45 degrees and without it the
  speckle turns to porridge fifteen units out.

  **The tile period is broken now** (#162). At 11.9 units a frame held three copies of the same tile,
  which is where the eye starts reading a field as wallpaper, and it is why the earth patches had to
  be kept faint. The standard cure, done in a hook on the ground's standard material so lighting, fog
  and the daylight tint keep working: the same tile sampled a second time at a different scale, and
  the two mixed by a 128px mask of soft blobs whose period is about 135 units -- four frames wide --
  so within any one frame the ground is unique. No second image, no second upload, no extra draw.
  And the tufts are **dark at the root**: the contact-shadow pass skips the grass (its bounding box
  is the whole map), so a tuft met the ground with no contact at all. It is a colour attribute on the
  blade, 0.5 at the base to 1.0 at the tip, multiplied by the per-tuft green the shader already
  applies -- 13,000 discs would have been the other way, and this costs nothing per frame.
  And the small things a field has that a lawn does not: **clover** in tight patches of its own (3,600
  three-lobed sprigs, 9 triangles each, a darker bluer green so a patch reads as a patch from the
  camera's height) and **field stones** in small groups (320 flattened icosahedra, a shade greyer than
  the rock nodes so they are not mistaken for something to mine). One instanced draw each, and both
  thin with the grass under adaptive quality.

  The tufts themselves are **seven blades for the price of three**: the cones were closed, and a
  cone's base cap faces straight down at ground level where nothing can ever see it, so open-ending
  them halved the cost per blade. A seven-blade clump is 21 triangles where the old three-blade one
  was 18, and it has width -- the blades are spread on a golden angle over a 0.13 disc, so each clump
  covers ground rather than marking it. And they are **clumped rather than sprinkled**, 78% into
  patches, because uniform random gives every square metre the same amount of grass and real ground
  never does.

  **And every tuft is its own green.** 13,000 instances sharing one flat colour is what made a field
  read as one enormous object rather than as grass, and it is the thing density could never fix -- at
  a reference image's own clump density the old field still looked stamped. Hue carries it, 84 to 100
  degrees, with saturation and lightness widening the spread: 10,794 distinct colours across 13,000
  tufts, measured off the buffer. It is `instanceColor`, so it costs a buffer and no draw call and no
  second material. Width varies with height now too; it varied in height alone, which gave every tuft
  in the world the same footprint and a different stature -- oddly uniform seen from above, which is
  the angle this game is played at.

  It costs 273k triangles in a scene measuring 981k -- the largest single instanced cost in the world,
  next to 28 characters at 8,576 each for 240k (#52). `TUFTS` in `world.js` is the dial.
- The village starts as a small plot. "Expand Village" pads grow it in three stages, each with its own
  wall ring. When the outer ring is complete the old inner wall is torn down.
- Walls are real: raiders are blocked and bash at short sections. A battered section degrades to the
  previous material (iron to stone to brick to wood) before it finally falls and shows a repair pad.
  Walls are rebuilt from wood to brick, stone and iron automatically as the Keep levels up.
- The Keep has one mat, in one place, all game, and it always offers the Keep's next job: **Raise the
  Keep** while it stands, **Repair the Keep** while it is rubble, in the green of an upgrade or the
  brown of a build so you can tell which without reading it. Levelling a Keep that is not standing is
  not possible, which is the whole reason the repair takes the raise's place rather than sitting
  somewhere else. **The repair is priced in coin** -- 40, or 60 once the Keep has passed level 4
  (`CFG.keep.repair`), which is the old bill of 20 coins plus ten wood or ten stone, converted at
  `CFG.materials` rates. It asked for the material itself until #125, and before that for stone flat;
  stone does not exist in the world below level 4 (`CFG.base.materialAt`), so a Keep destroyed early
  could never be repaired and the same event took away the mat that would have levelled you to 4. In
  coin that dead end cannot come back at all: coin is never gated and never runs out of the world.
  The invariant lives next to the
  number in `repairCost`: never ask for a material the Keep level cannot open.
- Watchtowers are built empty. A "Man the Tower" pad next to each one takes archers from your army
  (the price is people, not coins). Gate guards work the same way.
- Red arrows at the screen edge point at raiders you can't see, with a count and a skull for bosses.
- The HUD floats on the scene: no plaque, no capsule, no panel behind any of it (#176 put the owner's
  small dark pills behind the counters -- the coin, the bag, the level, the clock -- and wooden rings
  round the three corner buttons; those are local to the number and the button, not furniture behind
  the HUD, and the hearts stay bare). The corner button is a **pause** now: it opens the pause window
  (#171) and Settings is a row inside it, the same tap with a clearer face. Everything that reads
  as *status* stacks down the top-left in three lines -- what you carry, then the King's health, then
  what is happening right now -- and coin and bag take the top-right corner that leaves (the minimap
  had it until #145 parked it). It used to be
  two groups held apart across the top, and splitting status across two corners meant reading two
  places to answer one question.
  - **Coin and bag.** The bag's ring is how full it is: one continuous arc running green to yellow to
    orange to red, so the cap is never a number anyone has to read.
  - **Five hearts**, each draining by eighths, so losing a little shows as losing a little.
  - **`Lv. 6`**, and beside it the countdown to nightfall. The night used to have a counter of its
    own up here and it was the same clock printed twice: on a run at the pace the finale expects, the
    night half never once changes what spawns. The nights still fall and the raids still come at
    night; what went is the counter. The one thing a single number could hide is a player falling
    behind, so it says that itself -- `Lv.` turns amber whenever the raid is being fought above the
    level the Keep stands at.

  The raid used to share that slot with the clock, as a 30px ring. It is a bar across the top of the
  screen now (#135) and the reason is that a ring in the corner competing with everything else on
  that line is easy to miss -- which is exactly what was reported.

  The middle of the screen is left empty on purpose. Every bar and pip is out of it; the only precise
  health readout is the one over the King's head, and that shows only when he is hurt, so no shape is
  drawn twice.
- **The raid runs across the top of the screen** (#135): who is out there, a bar of the health the
  night arrived with, and the number still standing. Three lines because they answer different
  questions -- the bar says "is this nearly over", the count is what a player acts on when it gets
  low, and the name is the only place the Warlord is ever called by it. Raiders who have not walked on
  yet are already counted, so it only falls, and it goes when the last one does -- which is the answer
  to "is that all of them?" without sweeping the map. The Warlord calling reinforcements is the one
  thing that puts it back up; the last three turn the bar amber, which is about counting down rather
  than about danger.

  It sits **first in `#hud`**, which is a flex column, so the top bar is pushed down by the flow
  rather than by a number that would have to be kept in step with the block's height. The minimap and
  the purse are `fixed` and cannot be pushed, so they are offset off a sibling selector -- the one
  place that height is written down, and the real price of the change: about 104px of the top of the
  screen while a raid is on.

  It **arrives and leaves** rather than appearing between two frames (#140), and three things have to
  move in step for that to read: the bar's own height, the top bar sliding under it, and those two
  `top` offsets easing to theirs. If only the bar animated, the map and the purse would still jump and
  the result would be worse than the pop. The height is a grid row going `0fr` to `1fr`, because
  `display: none` cannot be transitioned and the height is content-sized rather than a number.

  It is capped at **30rem** and centred (#143). Uncapped it filled the viewport less 32px, which at
  2560 wide is a 2528x5px hairline. 30rem is what `.panel` already caps itself at, so the bar and the
  sheets agree rather than this inventing a number.

  It is **not up for the rescue** (#146). The opening party used to be counted on the reasoning that
  the rescue is the first fight and "how many are left" is the same question -- fair for a 30px ring
  in the corner, wrong for a full-width bar reading "Raiders / Night 1 · 7 left" over a run nobody has
  started. They carry a flag set once at spawn and never cleared, rather than the night number: the
  camp wakes on proximity with no wave gate, so gating on the night would have hidden the bar for the
  one other fight that can happen before night 1.

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
- **The four corners.** Health, the Keep's level and the night's count hang from the top-left; the
  coin and the bag are top-right, in the corner the parked minimap left (#145); the settings cog is bottom-right above
  the warhorn, beside the thumb; and the skip button anchors bottom-left, so
  the two actions are on opposite thumbs. What is at the top is state you read, what is at the bottom
  is what changes while you play. The bottom-centre is left empty on purpose, because it is the only
  place a notice and a button would have to negotiate for space (#124, #131).
- Everything that speaks does it in the same place, at the bottom: the notice, the mat chip that says
  what the pad under the King costs, and the attack alarm, which used to be a solid red pill at the
  top of the screen and is now the same dark caption with the urgency in the colour of the words.
  Only one of them can have the line, and the one that cannot wait gets it -- a notice is timed and
  never comes back, the chip is on screen only because the King is standing somewhere and returns the
  moment he stands there again, so the chip stands down and takes its turn. The alarm is the exception
  and is meant to be: an alarm and a notice are the shout and the sentence, and several beats raise
  both, so the alarm keeps a slot directly above. That slot is measured rather than assumed -- it
  clears whatever is on the line, which is the only thing that holds when a notice can be one line or
  four. The line is at 147, and it has moved twice for the same reason: #124 found 116 pinned against
  a minimap that had already gone to the top-right, but the space was spent in the same breath by the
  purse (#131), so it went *up* to 129 rather than down. #133 then traded the purse for the settings
  cog in that corner -- a 48px thumb target where a 28px row of text had been -- and 147 is the first
  figure that clears the cog's box rather than its glyph. Which is the point of having one value: the
  number moved, and everything that speaks down there moved with it.
  Three things share that band and they queue rather than dodge each other: a notice goes first
  because it is timed and unrepeatable, then what a purchase just bought you, then the mat chip. The
  middle one is a notice too, but its countdown STOPS while it waits, so nothing runs out behind
  something else (#132).
  Everything in that band hides with `visibility` as well as opacity, and that is not tidiness: the
  drag that moves the King is bound to the canvas, so anything above it that is still hit-testable
  eats the whole gesture. The chip's head is a button, and `pointer-events: none` on the chip did not
  stop it -- an ancestor's `none` does not override a descendant's `auto`. That left 206x53 of the
  bottom-centre dead with nothing drawn in it, sized by whichever mat you last looked at, exactly
  where a thumb rests (#128).
- What you scoop off a heap flies to the bag in the corner and the bag bumps when it lands, so the
  armful you picked up and the number that changed are one event. The ledger is credited before the
  flight, not when it arrives: hanging a player's materials on a CSS transition completing would cost
  them the pickup on a backgrounded tab, and no animation is worth that.
- **Buying a capability does not stop the game.** It used to raise a panel, on the reasoning that a
  purchase only completes once the King has stopped. That premise was wrong: `updatePads` tests
  `!king.moving || holdT > walkHold`, an OR, so payment completes mid-walk and the panel was landing
  on a player in motion. It is a notice with a countdown border now -- the headline closed, the same
  numbers one tap away, the music never interrupted because nothing pauses. A second purchase
  replaces the first rather than queueing: the common case is the same mat twice, and "Training 4 of
  5" already contains everything "Training 3 of 5" was going to say (#132).
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
  pickups, the "ching" of coins being spent and wave horns. The speaker button mutes it. There is no
  build fanfare any more: a four-tone arpeggio played on every purchase, and because the level-up and
  capability news is raised BY a purchase, it was also the sound that came up to -- which
  is where it was reported from. It went from all four of its callers rather than being muted on two,
  so winning is quiet now as well; a purchase is not, because the coins ching the whole way in (#130).
  Anything that stops the game suspends the audio context, which stops the loop and freezes
  `ctx.currentTime` with it so the music comes back in phase rather than desynced -- but the music bus
  fades over 0.22s first, and the suspend waits for the ramp. Cutting a soundtrack dead between two
  frames is what a page does when something has broken, and a reward panel should not sound like one.
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
- The warhorn is the horn button bottom-right, or Space. The rally banner is the flag beside it, or B.
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

## What a lost run buys

Before #56, `reset()` rebuilt from constants every time and the only thing that outlived a run was two
numbers — so losing bought a number, which is not a reason to start a second run.

Four permanent unlocks, bought with **cumulative lifetime score** rather than a second currency. A
second currency would need earning, displaying and explaining; score is already earned, already shown,
and already the thing the player is trying to make bigger. Each one seeds `game.mods` at `reset()`
through the same door an in-run reward uses (`upgrades.js`), which is what keeps the whole feature
from touching gameplay code.

| at | | what it does |
| ---: | --- | --- |
| 4,000 | A fuller purse | 25 coins on the road instead of 10 |
| 14,000 | Word has spread | every recruit mat brings one extra soldier |
| 34,000 | Packhorses | carry 8 more before you have to sell |
| 70,000 | The stables stand | begin every run already mounted |

**Where the thresholds come from.** Most of a run's score is the wave-clear bonus, and that part is
exactly computable: `score.waveClear * wave` summed over a run is 50 × (1+…+15) = **6,000** for a
short run and 50 × (1+…+30) = **23,250** for a long one. Levelling the Keep to 13 adds 60 × (1+…+13) =
5,460, and the finale 1,500. So a *finished* short run clears 13,000 before a single kill or coin is
counted, and a long one 30,000; a run that dies around halfway is a few thousand.

That makes 4,000 reachable inside a first run even a bad one — the point is that the **first** loss
pays — and all four land somewhere around finishing the game a couple of times. The kill and coin
halves are not computable without playing, so these are a floor rather than a measurement. Move them
after playing, not before.

They are deliberately gentle, because the ticket's third rule is that a first-time player's run is
unchanged. Driven with nothing stored: the strip is hidden, the road has 10 coins, and every `mods`
entry is its default — byte for byte the screen and the run that existed before this. Driven at each
threshold, in order: 25 coins on the ground, `recruitBonus` 1, carry 18 → 26, mounted at the start.

The lifetime total lives in its own `localStorage` key for the same reason the scoreboard does — a
save format change must not take somebody's unlocks back — and it only ever goes up: a zero-score run
leaves it exactly where it was.

Both ending screens lead with what *this run* bought, because that is the ticket's first rule; the
title screen leads with what is in hand and what is next, because that is the reason to press Play.
The bar measures the gap between the unlock just passed and the next one rather than zero to next,
or a player holding three of four would always see a bar that is nearly full.

## How long a run is

Two lengths, picked on the title screen above the Play button and again on both ending screens — the
title screen is shown once a page load and never again, so the end of a run is the other place the
choice has to be reachable (#58).

|  | Nights | About | Keep level costs |
| --- | --- | --- | --- |
| Short run | 15 | 19 minutes | `costScale` of a long run's |
| Long run | 30 | 37 minutes | full price |

**A length changes two numbers and nothing else** (`CFG.lengths`): when the camp opens on the clock,
and what a Keep level costs. The rank gates, the pads' `minLevel`, the wall boundaries and the
finale's level 13 are left exactly where they are, so a short run is the same arc at a faster climb
rather than a different game with pieces missing — which is what keeps both lengths reaching
Marauders, Warlords and the camp. A short mode that stopped at level 8 would never meet a Warlord
(rank gate 11) and would be a demo.

The raid is fought on the long run's clock (`raidNight`, [src/game.js](src/game.js)). Every ramp in
`startWave` is spelled in nights and every one of them was pinned against thirty of them: how many
knights, when brutes and elites start, how many bosses, the growth in health and damage, and the
anti-turtle floor under the raid's rank (#49). Read off the calendar, a fifteen-night run would end
on what a long run calls night 15 — half the raid, against an army the compressed Keep costs let the
player build in full. The night the player counts is still the calendar's, and so is the boss rhythm:
every fifth night, which is 3 boss nights of 15 or 6 of 30, the same density either way. What scales
is how big each one is.

Scores are kept **per length**, ten rows each. Fifteen nights scores far less than thirty for the same
play, so one board would fill with long runs and make itself meaningless; the pills over the
scoreboard switch between them. A row stored before #58 has no length and reads as a long run, which
is what every run before it was — neither the scores format nor the save format had its version
bumped to add the field, because both discard everything on a mismatch and a label is no reason to
empty somebody's board or throw away the run they are in the middle of.

## Picking a run back up

A run is fifteen or thirty nights of about seventy-five seconds — nineteen minutes or thirty-seven —
and a phone browser throws away a backgrounded tab whenever it feels like it. Nineteen minutes is
still longer than a mobile tab reliably survives, which is why the short run is not a substitute for
this and the two were always separate problems. The run is written to `localStorage` at every dawn --
the beat the day cycle already has, so the cadence is not an invented one -- and the title
screen offers **Continue** above a Play button that now says *New run*, with the level and the score
under it. At most one cycle is ever lost.

What is stored is state rather than history. Replaying the pads that were bought would mean replaying
every toast, every coin of score and every reward choice over a game that has not started, so
everything the player *has* is written down directly and only five builders are replayed on load:
the buildings, the walls, the expansions, the bridges and the horse -- the ones whose output is a
mesh in a place rather than a number. Loose coins, arrows and half-mined piles are not stored --
seconds of value each, and a restored run starts without them, which is what a morning looks like.
**The raid in flight is** (#150): the enemies still standing, what is still queued to walk on, and
how big the night was at its worst, so the meter comes back reading what it read. It costs less than
it looks, because an enemy's target and its bridge waypoint are both recomputed on a 0.6 s timer --
so type, rank, hp and where it stood is the whole of an enemy, and `spawnEnemy` already takes those.
The fog of war is stored too, as a 256x256 PNG. That was for the minimap, which is parked now
(#145) -- the fog on the ground still reads off it, and it is stored anyway so that parking the map
is a flag rather than a save migration, because coming back blind would undo a good part of what the
player did. A saved run runs about 17 kB, and 70 kB at its very worst -- measured on a night-30 raid,
143 enemies and 40 more queued, on a map walked end to end. 54 kB of that worst case is the fog PNG
and 13 kB is the raid.

Replaying the five builders is what makes the one rule the restore has to hold: **after a load, the
Keep wears whichever mat its own state would have raised.** `rebuildVillage` puts up every structure
the run had, a whole Keep included, and the stored state is applied afterwards -- so a run saved while
the Keep was rubble came back looking like a castle, unrepairable (nothing had raised the repair mat),
with the Raise the Keep mat standing on it taking coin for levels of a heap of rubble. That is #78's
bug reached through the save instead of through the field, and it is reachable in ordinary play: the
dawn save asks only whether a run is in progress, and a Keep can fall without taking Wren with it. The
restore now calls the same `showKeepBroken` the field does -- the picture without the event, so no
horn, no notice and nothing done to Wren (#127).

One other thing asks for a save, since installing an update reloads the page (#84). It used to get one
only when the field *looked* like dawn -- daylight, nothing standing, nothing queued -- so installing
mid-raid rewound the run to the previous morning, which was the honest answer to a save that had no
room for a raid. Now that it has one, the test is down to a single condition: **not while they are
carrying Wren off.** Her capture is a beat with a beginning and cannot be resumed from the middle, and
the restore has no `seize` to resume it with. Everything else -- any night, any raid, mid-thief,
mid-march -- is saved and comes back, and the run picks up on the same night rather than the last
dawn (#150). The Settings row says which of the two you are getting before you tap it, along with
what the update does to the save format if it moves it.

The march on the camp is the one place the restore gives ground. Waking the camp clears the `camp`
flag on the whole garrison, so without care a reload would respawn all of them on top of the sleeping
garrison the reset had just rebuilt, and hand back a chief with none of its own make-up. So a reload
mid-march beds the camp down again, whole. That is the game's own rule rather than a compromise:
walk past the leash in ordinary play and `updateCampReturn` heals the garrison to full and puts it
back to sleep exactly the same way.

Winning or losing clears it, and so does starting a new run. See [src/game-save.js](src/game-save.js).

Finished runs are kept separately, in [src/scores.js](src/scores.js), under their own key and their own
**Settings › Wren's diary** is where the story is kept (#154). The game barks its story over play and
a player who missed a line had nowhere to go and get it; this is the one surface in the game that
holds a paragraph, because it is the one opened on purpose behind a pause the player asked for.

It is **written by Wren, who does not know what she is** -- the bible is explicit that nobody has told
her -- so her entries are vivid and specific and give nothing away, because she genuinely cannot
explain what she is describing. The act table hands the trick over ready-made: she starts dreaming at
Keep 7 and does not mention it, and says it out loud for the first time at Keep 13, so between those
two the player knows something the King does not.

**Settings › The cast** (#159) is who everyone is, and it is **unlocked by the diary** rather than by
a store of its own. A cast list is the one surface that could hand the player the twist for free --
the Rust has a name, and there is a statue of him in the square -- so an entry may only say what the
player already knows, and the cleanest way to guarantee that is to key each stage of each entry to a
Keep level and show it only once Wren's page for that level is open. The cast never says a word the
diary has not. Six people: the King and Wren from the start, the Rust from the first night, Bracken,
Bramble and Ilka as Wren writes about them; a character with no stage yet is a locked slot carrying
the Keep level it wants and nothing else. Portraits are the #100 faces where a model exists and a
lettered medallion where it does not. The row's count is people met, `2/6`, the way the diary's is
pages.

One entry per Keep level, because that is already the story clock and already on the HUD. The table
lives in `src/story.js` beside the mechanical beat it belongs to, so the two cannot drift and the
bark system can read the same table when it exists. Unlocks are **cross-run** in their own key
(`crownrush-diary`) -- a memory you lose by dying is a collectible, not a memory, and a save-format
bump is no reason to take them back. She cannot write while raiders have hold of her, so a level
raised while she is captive is **owed** rather than lost and lands the moment she is back.

The locked entries are drawn rather than hidden, carrying a Keep number and nothing else: a list that
grows from nothing gives no sense of how much story there is, and fifteen slots with three filled says
"there is more" without saying what. A new one is mentioned **at dawn**, in her voice, after "Dawn.
You held night N" -- the quietest slot in the game, because a diary entry is not urgent and the notice
lane already has three speakers with a queue rule. It is deliberately **not** a badge on the settings
cog: that dot means "an update is ready" (#120), and one dot with two meanings tells the player
neither. The row's own `3/15` is the standing signal.

version -- a save-format bump throws the run save away, and that is no reason to lose somebody's best
night. Ten are kept, by score rather than by recency: a board that forgets your best run because you
played ten bad ones afterwards is not a board. Every ending writes one, and the row says which of the
four it was, because a victory and a high-scoring loss are different achievements and sorting by score
alone flattens that. **Settings › Best runs** shows them, and the title screen leads with the top row
of that board -- `Best: Lv. 7 · 12,480 points`. A row carries the level it reached as well as the
night; rows written before it did fall back to the night, because the stored version is what says
whether a board can be read at all and bumping it to add a field would empty everybody's. Every read and write is wrapped: a browser
that refuses storage still plays the game, and still ends a run.

## The intro

The first time you press Play, four short steps explain the game one idea at a time (find the Queen,
fight and collect, build, raise the Keep) with Next and a Skip. Enter, Space or the right arrow also
advance. It is remembered in `localStorage`, so replays go straight in. The start screen itself is one
line.

## The buttons, and the palette they come from

One rule paints every call to action in the game -- Play, Continue, Play Again, Next, Back to the
game -- so the treatment is decided once. **#170 repainted it to the owner's window designs**: a
button is a dark green row with a hairline edge, an icon on the left where it has one, and an upright
bold label; the **primary** action of a panel -- one per panel -- is the same row in **gold**, dark
ink on a gold gradient with a hard bevel under it, so it is the one thing on the window wearing the
colour. Direct children of a panel stack full width, the way the reference stacks them; the offer
cards, the intro row and the sheets lay theirs out their own way.

The window itself is the same ticket: a dark green panel with a wooden frame and bracket corners
(eight gradient strips on one pseudo-element), a hexagonal wooden badge on the top edge carrying the
window's glyph with a leaf either side (`.panel.badged` makes the room; the hexagon is a clip-path on
an inner box so the shadow survives), a cream title over a hairline that fades at both ends, an inset
stat box of `icon · label …… value` rows for the endings, and a round close on a dark disc outside the
top-right corner. **This reverses #135's "no background, no border, no box"**: that was right for
light text on a blurred photograph, and the reference is a solid window, so the text-shadow that held
the type over a changing world came off with it. All of it is CSS; nothing arrives as a request. The
title screen keeps the world behind it until its own ticket (#175) decides.

**The pause window** (#171) is the first of the windows to take the reference's content as well as
its chrome: the ⏸ badge, *Paused*, one line of `☾ Night 3 · ★ Score 939`, and four stacked buttons.
**Resume** is the gold one. **Restart asks twice** -- the window is opened casually, by Esc, P or a
tab switch, and one stray tap must not throw away a run -- and disarms the moment it fires or the
window is left, not only on its four-second timer. **Settings** opens the sheet and closing it comes
back *here*, not to a stopped game with nothing on screen (the pause was the player's, not the
sheet's, so `hideSettings` has to be told). **Quit to Menu** writes the run down if it can -- the same
`quietEnoughToSave` rule the dawn save follows, and the save carries a live raid -- then stops the
world and redraws the title screen, so Continue picks the run up from where it was quit rather than
from the last dawn. Driven: Settings out and back keeps the pause; two taps restart with the score
at 0; quit saves score 650, shows the title with Continue, and Continue comes back running at 650.

**The two endings** (#172, #173) take the reference's shape: a skull or a crown on the badge, the
headline the game already had for how it ended (*The King Has Fallen*, *They Carried Wren Away*,
*The War Is Over*), one dim line of why under it, and the **stat box** -- night reached, Keep level
(or the army you marched with, on a win), score, gold collected, raiders defeated -- with the best
score, the legacy block (#56) and the run-length pills (#58) under it, then Try Again or Keep
Playing in gold over Main Menu. Raiders defeated is a new counter, `kills`, counted in `killEnemy`
because every death path comes through it, and in the save as an additive field (no `VERSION` bump;
an older save restores it as 0). The reference's "villagers lost" is not a number this game has --
villagers flee, they do not die -- so the row is the Keep level, which is what a run loses. Main
Menu from an ending is the pause window's Quit with nothing left to save.

**Settings** (#174) is the reference's tabbed sheet with every row the sheet already had sorted into
the tab it belongs to: **Game** (how to play, best runs, the diary, the cast, restart-asks-twice),
**Audio** (the sound toggle, and **music** and **effects** sliders that are new -- their own gain
nodes between each bus and the master, because the music bus is ramped by `rampMusic` and a user
volume written onto it would fight the ducking), **Video** (**Quality** as Auto / Full / Reduced,
which is #168's controller or a pinned tier, stored the way the sound is and read at boot behind the
URL's `?quality=`; **camera shake** and **damage numbers** as pill toggles, each a flag the thing it
governs reads -- gains still float with numbers off, only the hits go), and **About** (the update
row, the build, the screen line). The reference's "Controls" tab has nothing to hold on a one-thumb
game. There is no Apply: every control takes effect on the tap and is written down at once, so the
call to action is Back and not a promise. The last tab opened is remembered. Measured at 320×568:
every tab, every row reachable, the panel's right edge at 294 in a 320 viewport on all four -- it was
330 on two of them until the rows were allowed to shrink and the quality segment to wrap.

**The title screen** (#175) keeps the world behind it and puts the wordmark on a **wooden shield**
with a leaf either side -- the reference's treatment with this game's name and its gold. The shield
is a clip-path on the lockup with the shadow on a wrapper round it (the badge's trick); the King and
Wren still flank it, because they are the game's own faces and the reference had none to offer. Under
it: Continue when there is a run to pick up, the run-length pills, **Play** in gold, then **Settings**
and **Credits** on one row (the reference's Quit is not built: a web game has nothing to quit to),
with the best line, the legacy block and the update row as small lines under. Settings from here is
the same sheet with no run to pause; **Credits** is a new sheet -- who made it, what it is made of --
reached from here and from Settings > About, and closing it goes back to whichever opened it. At
320px the two-up row stacks; it overran the panel by 25px until it did.

**A reward card carries its figure** (#177): under the prose, a chip with what the card changes and
to what, as the number the player can already point at -- `Arrows hit for 10 → 13`, `Arrows per shot
1 → 2`, `The bag holds 18 → 26`. Every card, not only the countable ones: a multiplier is resolved
against the stat it scales, read off the game as it stands (`upgradeChange` in `game-build.js`), so
Volley reads 1 → 2 the first time and 2 → 3 the second, and the same numbers the purchase panel
(#105) shows afterwards are the ones the card promised. The key and the amount are hung on the
`mul`/`add` helpers themselves rather than written a second time, so the figure cannot drift from the
effect. The prose stays: #107's ladder of words says whether a change is big, the figure says what it
is. Verified on every one of the sixteen cards, and by taking one: a card promising 10 → 13 landed
on 13.

Before #170 the buttons were #135's repaint: a near-black fill with a hairline edge and an italic
label, no glyph, after a gold frame with a rotated diamond at each end had made every button wear the
full ornament and left a panel offering three of them no way to say *this one*. The emphasis that
ticket moved is still where it put it:

- **The primary action** of a panel -- one per panel -- is the one in gold. Play is findable on the
  title screen without looking, which is the one thing the old frame genuinely did well.
- **The press** takes a heavier accent ring. `:hover` is a state a touchscreen never enters and this
  game is played with a thumb, so an affordance that only appears on hover is one that never appears
  at all -- #121 learned that on the reward cards. A press is the one gesture a thumb always makes.
- **Unavailable** is its own material rather than the same button fainter: no fill of its own, a
  fainter edge, a muted label, so it never reads as something that would work if you pressed harder.

**One size, at every width.** The CTA is **18px** -- 1.125x the panel's 16px body. It was four
figures before #135 (22 here, 21 on the title screen, 20 on two of the sheets), which is this
ticket's whole problem in miniature: one component, four numbers, none of them written down. The
scale under it is **17** for a sheet row, **16** for the skip button, **15** for a run-length pill,
**13** for a hint -- so a row you scan past never outweighs the button you are being asked to press.

**One padding too: `10px 18px`, on every CTA and on the skip button.** That was three figures as well
-- 13/26 on the button, 11/24 on the title screen, 9/15 on the skip -- so one component came out three
shapes depending on which panel it landed in. 10/18 is the skip button's proportions, the tightest of
the three; it is not quite its own numbers, because at 9px that button measured **43px tall, one pixel
under the 44 a thumb wants**, and 10 buys the target back for every button including that one.

The height is the thumb target and it comes from the padding, not the type. Measured at 390x844:
**50-52px** for a CTA, **45px** for the skip button, **51px** for a sheet row, and nothing in the game
under 44. Shrinking the type does not shrink the target, which is why there is no narrow-screen button
rule any more -- the CTA is one shape at every width.

The palette behind it is **Emerald**: deep forest-teal panels with gold, so the HUD reads as part of
the meadow rather than a layer floating over it. Green UI on a green world is the hardest separation
to hold, so it leans on **value** rather than hue -- the panels are far darker than any terrain the
game draws, including the near-white diamond-age walls.

### The `:root` block is read now

This is the part worth knowing before changing a colour. The stylesheet has always had a `:root` block
that looked like a brand guide -- `--gold`, `--wood`, `--plaque`, `--rim` -- and **nothing read
thirteen of its sixteen properties**. Not the stylesheet, not the JS, not the markup. The values had
drifted into 361 literals across seven files, to the point where `--rim: #d8a83e` and the button
frame's `#d8a63c` were the same intended colour two shades apart, one of them unreachable.

It is a live contract now: `--accent`, `--frame-*`, `--fill-*`, `--btn-ink`, `--surface`,
`--surface-2`, `--ink`, `--ink-dim`, `--figure`, `--good`, `--emph`, `--scrim`, `--danger-*` and the
five `--pool-*`. **Anything added there has to be read by something**, or it is decoration pretending
to be a decision. The stylesheet is down to 93 hex literals from 107 and carries 96 `var()` reads
where it carried five; the rest are the 3D world's materials in `models.js` and `world.js`, which are
a separate palette and deliberately not part of this one yet.

### The world's palette, and the two things that were wrong with it

Separate from the UI's, and corrected against a BotW colour breakdown the owner brought in. Most of
that document was turned down on purpose -- its accent hexes are Sheikah-tech semiotics (`#00E1D9`
means "shrine", `#FF5500` means "a guardian is awake") and this game already spends saturated colour
on a language the player has to read under pressure: enemy **rank** is a colour, tan through to
black-and-gold, against a King in blue and gold. A second vocabulary would compete with it. Its
global 10-20% desaturation was turned down too -- these greens already sat at 38-53% against the
reference's 41-46%, so there was nothing to mute, and restraint reads as painterly in a naturalistic
open world where it reads as washed-out in a toy one.

Two things it did catch, and both were internal inconsistencies rather than differences of taste:

- **Stone was cold in a warm world.** `C.rock` and `C.cliff` sat at hue 210-213 and 4-6% saturation
  -- slate -- while the game's own roads are hue 36-39 at 47-62%. A mesa read as a slab dropped into
  the field rather than as part of it. Stone is hue 34 now at 18-25%: warm enough to belong, and
  deliberately well under the roads so a cliff never reads as a sand dune. The strata bands used to
  alternate warm and cool greys; they carry their contrast in value alone now.
- **The lighting was already chartreuse and the ground was not.** `hemi.groundColor` in the day keys
  has always been hue 90-93, which is exactly the reference's range for ground cover -- while the
  ground texture, the tufts, `C.grass` and `C.leaf` ran 101-140. So the light bouncing off the grass
  was a different green from the grass. The surfaces moved to the lighting: hue only, saturation and
  lightness untouched.

The fog colour moved with them, because `updateDaylight` copies it onto `scene.background` and the
far distance would otherwise be a different green from the ground underfoot. So did the page green
(`#699a3f` in `style.css`, `theme-color` and the manifest), which is the load screen and the
overscroll band -- a green that does not match the world is a flash on the way in and a seam at the
edges of a phone.

**Checked against the thing it could have broken:** rank is read by colour, and the ground those
colours are read against just moved. Measured, WCAG contrast of each rank's tunic against the grass:
Bandit 1.52 -> 1.59, Raider 2.14 -> 2.24, Marauder 2.62 -> 2.74, Warlord 6.70 -> 7.02. Every one
improves slightly, because the new grass is marginally lighter. Confirmed on screen with all four
ranks stood in open grass.

## Notices colour the half you act on

A notice is usually two halves: what happened, and what to do about it. The second half is wrapped in
`*asterisks*` in the string and takes `--emph` -- *"The sun is going down. **Get behind your
walls.**"* The markers are stripped in `typeInto` before the word is measured or drawn, so the spans
are the same shape either way and the letter-by-letter reveal is untouched.

The rule is **colour the thing to do, never the flavour**. Colour is the one channel a player can
read without reading, and spending it on atmosphere would leave nothing for the instruction.

## The opening: rescue the Queen

The run opens with an empty coin stack and the starting coins scattered along the road west, so
picking them up is the first thing you do and it teaches the pickup rule without a word.

The white circle under the King **is** that reach: one number (`CFG.king.pickupRadius`) is both what
coins are tested against and what the ring is drawn at, so they cannot drift apart. It used to be the
size of his retinue instead, which meant coins flew in from outside it from the very first pickup, and
from four times outside it once **Lodestone** was stacked. Lodestone now visibly widens the circle --
which is also why it multiplies by 1.35 rather than 1.8: at 1.8 the full stack reached 11.99 and the
circle ran off a phone screen entirely, leaving the King with no mark under him at all.

The Queen does not start captive any more — she is taken in front of you, and the chase is the rest of
the opening (#152). The four who come down the north road do not fight: they walk past the King, around
his archers, pick her up and **turn straight back north with her** at `CFG.opening.escortSpeed`, which
is above his speed on foot for the same reason their walk-in speed is. Every one you shoot off her on
the way is a pair of hands gone; kill the last of them and she is back on the spot, shaken.

Otherwise they reach the **picket** — the camp's outer guard post at the end of the north road
(`CFG.opening.picket`, 38 clear of `finale.wakeRadius`) — hand her over, and walk on. That is where the
opening's fight is, and **the camp is on the horizon behind it**: a promise made in minute five and paid
at night 30.

Six raiders and a Marauder captain circle her and she edges away from whichever is nearest, so the
scene reads as a capture from a distance rather than as seven figures standing in a field. A pink arrow
points to her. Come within sight and she calls out with a heart while the guards turn and square up,
then a beat later they charge. Free her and she goes up in a burst of hearts, with the odd one drifting
up between the two of them afterwards on a quiet day.

None of that guard behaviour is new: it is what every run before #152 opened with, orphaned when she
started beside him instead of already taken, and put back where the story wants it. The carriers are
taken off the field at the hand-off rather than standing into the fight — left as they were they
followed her north anyway (a collector has no target but her) and the rescue measured twelve in the
bar against the seven it was tuned for. Standing them in is the more interesting fight, and it turns
the hardest thing in the early game into a variable number, which wants playing rather than reasoning
about.

**Nothing happens until you go and get her.** No raiders spawn while she is captive, however long you
take, and no build pad will accept payment: pads stay visible but shut, marked "Free the Queen". The
raids are the enemy coming to take her back, so the rescue is what starts the war. Clear her guards,
reach her, and the first raid is on its way (`CFG.rescue.firstRaid`). She follows the King from then
on, and steps inside when he brings her to an intact Keep -- measured from the Keep's wall, against
*his* position rather than hers (`CFG.queen.doorReach`). Both of those are the point: she never walks
her own paths, so a radius she has to reach herself is one she never will.

One rule holds that together: **whenever Wren is free and the Keep is built, walking the King to the
door puts her inside, and there is no state in which that fails.** `inKeep` is the flag that could
strand her -- everything in `updateQueen` returns on it, so if it were ever true while she was drawn
outside, the game would believe she was home and nothing the player did could change its mind. It is
now checked once a frame rather than trusted: a Keep that has stopped standing under the flag clears
it, and a position that has drifted off the balcony the flag claims she is on is put back. Entering
sets the flag only after she has actually reached the balcony, not before -- the other order is how a
Keep mesh without one could have stranded her (#126).

## Reading the pads

Square pads BUILD something (structures, walls, bridges, expansions). Round pads do everything else,
with a coloured rim: blue recruits units or sends a crew, purple upgrades, green raises the Keep.

The marker on the ground carries identity only: a big icon, a short name, and a level where the thing
it points at has one ("Royal Keep · Level 4", "Watchtower · Level 2"). Nobody can read a price off the
floor at a sharp angle while running past, so the cost lives on a chip that appears above the controls
when you stop on a pad: what it is, what it costs against what you carry, and a bar for how far the
payment has got. It used to be a full sheet across the bottom edge, which is a lot of screen to cover
in a village made of mats -- the description and the fine print are behind a tap now, and what you
cannot play without stays on the face of it. Pads only take payment once the King has stopped (or held
for a moment, `CFG.spend`), so walking across one costs nothing.

A pad you can buy from twice puts a fresh one in its own place the moment it is paid, and that
replacement refuses money for a second before it starts taking coins again (`CFG.spend.bought`).
Without it the new mat took the next coin a quarter of a second after the purchase landed: the archer
mat completed a second batch 0.73s after the first, each one dearer than the last, and the Keep -- the
most expensive mat in the game to fire twice -- went from level 1 to level 4 in 5.3 seconds and 104
coins while the King stood still. During the second it says so: **Bought** on the mat in green where
the lock messages go red, and *Bought -- step off, or wait to buy another* in the chip. It runs down
whether or not you stay on the mat, so buying three batches in a row is still one stand; five archer
batches in a row cost 2.4s more than they used to, and nothing else changes.

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

- **One currency that grows with the Keep.** Coins are gold, always; what changes with the Keep is
  what one is worth -- 1, then 3 from level 4, 8 from 8, 20 from 12 (`CFG.coins`). The count is one
  number. Enemies of higher ranks drop more coins.
- **The gleaner, and coins that fade** (#169). A thirty-night soak with nobody collecting reached
  3,683 coins on the ground, the one thing a run retained without a ceiling. Two answers, the way the
  owner asked for them. A **gleaner** lives at the Keep -- villager-shaped, green, a basket on his hip,
  made the first frame the Keep stands and gone with the village when it falls -- and walks the field
  for what the King left lying. He leaves a coin alone for four seconds after it lands and never takes
  one at the King's feet, so the player never races his own helper; then the *oldest* first, which is
  the one about to go; a raider in sight sends him home like any villager, and he routes through the
  gates (#156). What he picks up flies to him and is banked exactly as the King's are. His speed is
  one number in `CFG.gleaner`, and the **Quick Feet** card in the economy pool multiplies it by 1.4,
  twice at most: 3.4, then 4.8, then 6.7, which is faster than a walking villager and nearly the
  mounted King, for the late run when the field is wide. And a coin on the ground lives 180
  seconds -- more than two nights -- fading over its last 40 (per-instance alpha on `CoinField`, the
  chimney smoke's trick) so it is seen going rather than found missing. The soak again: 657 coins at
  night 29 against 3,683, falling as well as rising night to night, and the run's retained heap
  growth halved. Every pad costs coins except crews, which are paid in
  archers. The Keep is paid in coin too -- `CFG.base.levelCost` is the old material lists priced at
  `CFG.materials` rates.
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
  ones already recruited (`CFG.archerTraining`). It is additive and capped at five buys, so a fully
  trained archer has twice the health and 2.25x the damage — which is what the mat itself promises,
  in words rather than in percentages (#107).

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

## Build previews fade, they do not pop

Every mat previews what it would buy — a wall along the edge, a translucent copy of the building it
puts up, a crew standing on the tower deck they would be sent to. **Not the recruit mats** (#142):
those used to stand two archers on the grass beside the mat, built from the real rig and ghostified,
so they had the same mesh, silhouette and size as the archers that fight for you. On a field with
your army walking about that is a unit the player keeps trying to command, and translucency is not a
strong enough signal at a glance. The mat's own canvas already carries the icon, the label and the
price, and the chip says it again — the ghosts were the third telling and the only one that could be
mistaken for a man. The crew mats keep theirs, because position does the work translucency could not:
a figure standing in mid-air on a tower deck is plainly a diagram, and hiding one of them per archer
dispatched is the only progress a crew mat shows.

**A mat shows when you are nearly standing on it** (#144). `spend.showRadius` was 10, which is almost
six times the 1.7 you have to be inside for it to take payment, and the field read as a car park of
floor markers. Measured on a field of eight pads, counting the most that stand up at once: **10 gives
3, 6 gives 2, 4 gives 1**, and 3 buys nothing further — so 4, chosen over 3 for the fade rather than
the count, since a mat reaches 0.95 opacity as the King crosses the pay circle and is full by 0.88
units out.

Cutting that radius on its own would trade one complaint for another, because **nothing points at a
build mat** — there are edge arrows for enemies, for home and for the camp, and none for a pad, so the
radius *was* the discovery. So a mat shows itself again for `showAfford` seconds the moment it becomes
payable, which is exactly when it is worth pointing at. A pulse on the transition, not a test: a mat
you can afford and have not bought would otherwise stand up forever and put the car park back.

The preview used to be switched on and off outright:

```js
for (const g of pad.ghosts) g.visible = pad.fade > 0.4;
```

The mat itself has always faded up as the King approaches and sunk back into the grass behind him.
The preview standing on it did not — it appeared and vanished at a hard threshold, so walking towards
and away from a mat made a translucent building blink on and off on that square. Reported twice as
the Archery Range "flickering to a different version of itself" (#111), the second time with the
trigger: *only while walking towards and away from it*.

It fades with the mat now. Measured across the crossing, one reading every other frame: `0, 0, 0,
0.088, 0.156, 0.21, 0.252, 0.284, 0.31` — seven distinct values where there used to be two.

That needed each mat's ghosts to own their material. `ghostify` assigns `GHOST_MAT`, a module-level
singleton every ghost in the game wears, so there was no way to fade one mat's preview without
fading all of them — which is what the snapping `visible` was standing in for. One clone per mat,
disposed with it. **This is the third time that singleton pattern in `models.js` has caused a bug in
this codebase** — `BAKED_STD` disposal in the rally banner, `GHOST_MAT` tinting in the placement
ghost, and now this.

And a mat no longer previews a building that is already standing. A translucent copy fading in and
out on top of the real one is the other half of that report, and a preview of something that exists
is wrong whether or not anybody is looking at it.

## The opening: you had a kingdom this morning

A run does not begin on an empty plot any more (#152). It begins inside a **finished village** —
walls, the Keep with the three service buildings around it, four manned watchtowers — with Wren
walking a step behind the King and nothing happening at all for `CFG.opening.calm` seconds.

Then they come from the north, **walk straight past him**, and take her. The walls come down with
her, and he wakes on the plot the game used to start on.

And they carry her back up the road they came down, to the camp's picket — see *The opening: rescue
the Queen* above for the chase and the fight at the end of it.

Three jobs in one scene, which is why it is the opening:

- **It explains the empty plot.** A king with no village needs a reason.
- **It is a tutorial that costs nothing.** The player has *seen* a working village, so every mat he
  later stands on is a thing he remembers having. No tooltip teaches that.
- **It plants the twist in behaviour.** `docs/story.md` turns on the raiders being collectors sent to
  fetch her; the clue used to be a line Bramble says twenty nights later. Now a collector will not look
  at anybody who is not her, and the player watches it in minute two. It also means the King cannot die
  in a beat he is scripted to lose, so nothing has to protect him specially.

It is the **real** village, not a set: `standOpeningVillage` marks the structural pads built and hands
them to `rebuildVillage`, which is the same function every resumed run uses. So laying the opening out
differently is a matter of which pads are in `built` — and eventually of playing a run and exporting
the save, which is the only way a tableau can be designed by playing it.

### Three things it took driving to find

**A knight cannot catch the King.** 3.8 against his 5.6 on foot, so a player who simply walked away
was never caught: the snatch never landed, the day clock never started (it is held until `snatched`),
and the run sat in its first minute for ever. `CFG.opening.speed` is 6.2 — above him on foot, below the
horse he does not have yet.

**The speed needed its own stats object.** `spawnEnemy` assigns `CFG.enemy[type]` straight onto the
enemy, so every knight in the game shares one; writing a speed onto it would have made every raider
for the rest of the run a sprinter. The same shape as #43's ghost material and #109's `BAKED_STD`.

**She was standing on the roof.** `buildStructure` ends a Keep with `queenEnterKeep`, and the King
spawns at its door — so she was inside on the first frame and stayed there, and the minute she is
meant to spend walking beside him was a minute of looking at a balcony. Taking her out was not enough;
the door rule (#106) put her straight back every frame, so it is gated on the premise having happened.
Every count in the state was correct and only a screenshot showed it.

### `?tour` — the morning holds

Add `?tour` to the address and nobody comes. The clock does not run, the village stays up, and it can
be walked around. It exists because the opening kingdom is meant to be **designed**, and it cannot be
argued with while it keeps being pulled down half a minute in. A badge across the top says so, since a
first minute that never ends and does not explain itself looks like a bug.

Same shape as `?safe=1`, `?hq=1` and `?perf=1`: read once, off by default.

### And it is measured against the budgets, because it moved them

A standing village is a great deal more on screen than an empty plot, and the first version was over.
**Tier 1** pulled in `expand2` as well and gave a two-ring city — 17 buildings, 72 wall sections, 8
towers, 24 crew:

| | draw calls | triangles |
| --- | --- | --- |
| tier 1, level 8 | 334 peak | **1097k** — over the README's 1M |
| tier 0, level 5 | 182 peak | 697k |
| *(empty plot, before this)* | 81 peak | 92k |

The probe asserts neither without `--crowd`, so the first version would have gone out quietly. Tier 0
also reads better: the plot he rebuilds is this plot, so showing him exactly it, finished, is a
sharper promise than a sprawl he never gets back to.

## Choosing where a building goes

> **PARKED (#152).** `CFG.placeBuildings` is `false`, so every building goes where `buildAt` says and
> nothing can be picked up. The rest of this section describes what the flag turns back on.
>
> Not because any of it was wrong. The opening is becoming a village that **stands and then falls**,
> and that village is a thing to be designed — a player who places freely diverges from an authored
> layout on the first watchtower, and then the tableau the game opens on and the village the player
> rebuilds are two different places with nothing to say to each other.
>
> Three gates read the flag and nothing else does: `completePad` (placed, or just built), `canMove`
> (which `beginMoving` and `longPressAt` both ask), and `nearMovable`, which needs its own because it
> keeps a second copy of the same `place` test rather than calling `canMove`. Gating the first two and
> assuming the third followed left the move button standing there offering something nothing would
> honour — found by driving it, not by reading it.

Watchtowers and villager homes are **placed by the player** (#43). `buildAt` in `src/config.js` is
still where each one suggests standing; it is no longer the only place it can stand. Pay for the mat
and a translucent ghost of the building appears — then walk to the spot and tap the hammer.

A building that moves takes **everything it owns** with it (#139): its own mats, the crew standing on
its deck, and the crew still walking to it. That last one is the least obvious and was the visible
half of the bug — a crew archer is not a turret yet, it is a unit with an absolute deck position that
becomes a turret on arrival, so one dispatched before a move and arriving after it used to be stood
up in mid-air over the ground the tower had left. Everything is found by **identity** now — the
tower's id on the archer, the home's id on the villager — rather than by comparing coordinates, which
is what all three halves of that bug had in common. A tower's mats also sit at `tower.padOffset` from
wherever it actually stands; they used to sit at the pad coordinate in `config.js`, which meant a
tower placed across the village had its upgrade mat 31 units away from it.

**Edit mode has three gestures** (#138), because #137's one was not enough: the whole canvas dragged
the ghost, the King is frozen while a placement is live and the camera is a fixed offset from him, so
you could only build on the patch of ground that happened to be on screen when you started. A drag on
the ghost moves the building; a drag on the ground pans the view; a **tap** on the ground puts the
building there.

That third one is not decoration. Pan far enough to find the spot and the ghost is off screen behind
you, so "drag the object" — the thing actually asked for — is a gesture you can no longer start. The
tap is what makes panning usable, and the target is the destination rather than the small thing being
moved. The ghost's grab box is its footprint plus `place.grab`, because a watchtower is 2.50 × 3.32
world units and at this camera that is about a thumb; nothing pans until the press has travelled
`longSlop`, so a tap is perfectly still. The pan is held to the tier's own bounds plus a margin — a
view you have to walk back from is worse than one that will not go there — and it is cleared in
`leaveEditMode`, which every way out of a placement already runs through, so a camera can never be
left somewhere the King is not.

It also retires an asymmetry: WASD moved the King during a placement and a phone had nothing, so a
desktop player could look around and a phone player could not.

**The ghost follows the finger** (#137), and getting there took two goes.

The first version had it follow the King: walk to the spot, tap to confirm. That was a deliberate
departure from what the ticket asked for, on a real objection — the game's only input is
drag-anywhere-to-move-him, so a cursor tracking the finger would be fighting the joystick for the same
gesture on the same canvas, which is the exact shape of #128, where something over the canvas
swallowed the drag and the King would not move.

What answers that objection is the thing the second ticket asked for almost in passing: **fade the
rest of the UI**. It reads like decoration and it is not. Making placement a mode — the stick
suspended, the keys quiet, everything but the two buttons at 12% — makes the two gestures
*sequential* rather than simultaneous, and then there is nothing left to fight over. The fade is what
buys the drag.

So a placement now takes the screen: the HUD stands down, a grid is drawn over exactly the ground a
building may stand on (the current tier's bounds, which is the same rectangle `placeOk` tests, so the
grid stopping **is** the rule), and the ghost snaps to it as the finger moves. `CFG.place.grid` is 2,
and the note beside it says why it is not 1 or 4: the footprints are measured off the real models and
are not modular, so what a grid buys is that centres line up, and at 4 two houses can only ever be 8
apart on a plot 38 across.

One rule was lost and had to be replaced. Following the King made it free that *a building can never
end up somewhere he could not reach*; a finger can reach anywhere on screen. In practice `placeOk`
already carries it — nothing outside the grounds, in the river, across a wall or on the mesas is
legal, and what is left is walkable — but it is now a property of that function rather than of the
input, which is where it should be written down.

The ghost is green where it may stand and red where it may not, and the tick button says the same
thing. (It was a hammer. A hammer says *build*, which is right for a new watchtower and wrong for a
house being nudged two squares left; a tick says *this spot, yes* either way, and it is the half of a
pair that the cross beside it only makes sense against.) A spot is refused if it would put the footprint outside the current grounds, on the mesas, in
the river, across a wall, on top of another building, or on a build mat — a mat you cannot stand on
is a mat you cannot buy from. The last two are footprint against footprint, from `CFG.footprint`,
which `tools/layout/check.mjs` now imports rather than keeping its own copy: two tables measured off
the same meshes is one table that goes stale.

`def.buildAt` is always a legal spot by construction, so there is no way to be stuck with a building
that cannot be put down.

Where each one was actually put is stored in the save (`placedAt`), because `rebuildVillage` replays
structural pads on a restore and would otherwise return every building to the coordinates in the
config. No save VERSION bump: a save from before this has no `placedAt` and falls back to `buildAt`,
which is exactly where that run's buildings were standing.

Two bugs worth recording, because both were the same mistake and neither was visible from reading the
code. `ghostify` assigns `GHOST_MAT`, a module-level material shared by **every** ghost in the game —
tinting it to say "this spot is taken" turned every preview in the village red at once. The placement
ghost gets its own clone now, and there is a check that the others stay white. (The rally banner had
the identical bug against `BAKED_STD`, one ticket earlier.)

### Moving one afterwards

Stand beside a tower or a home in daylight and a move button appears; tap it and the building is in
your hands, ghost and all, on exactly the same rules as placing it new.

Or **hold a finger on the building itself** (#137), which is what most people try first. A long press
is free to take: `input.js` needs a press under 200 ms that did not travel before it counts as a tap,
and a press that has not moved is steering the King nowhere, so nothing is given up by claiming it.
`CFG.place.longPress` is 450 ms — measured against 300, where a deliberate tap on a tower sometimes
lifted it, and 600, which reads as broken. The building comes up under a finger that is still down,
so that finger carries it straight on without lifting. The proximity button stays: it is how anyone
who already learned it still works, and it is the only route on a keyboard.

It is a **delta**, not a teardown and rebuild. Everything a building owns sits at an absolute
position — a tower's crew on its deck, a chimney's smoke, the villager whose home it is — so the
whole set shifts by the same vector and nothing has to be put back by hand. Rebuilding would have
lost the crew and the villager and then had to recreate them. Measured: a crewed tower carried from
`[13, -13]` to `[0, 14]` arrives with both archers still on it, and a home takes its smoke and its
villager with it.

The three questions the ticket left open, answered:

- **Does it cost anything?** No. The walk there and the walk back is the cost, and a coin fee on
  undoing your own mistake is a tax on learning the game.
- **During a raid?** No — daylight only. Not a balance number but a rule with a reason: a crewed
  watchtower that can be picked up mid-raid is a tower that dodges a sapper, and "builders do not work
  at night" explains itself. It is also why none of this has to think about what a raid is doing.
- **Does a tower keep its crew?** Yes, and that is most of why it is a delta.

### And a way back out

There was not one (#136). `cancelPlacing` existed and **nothing outside the module ever called it** —
the hammer and Enter both confirmed, and Escape fell through the chain in `main.js` to `togglePause`.
So tapping move on a tower to see what it did committed you to putting it down somewhere, on a
continuous coordinate space with no marker showing where it came from.

The cross restores the building to `from`, which `beginMoving` has recorded since the day it was
written and which nothing had ever read. It cannot refuse: the building was standing there a moment
ago, so the spot is legal by construction.

**Only on a move.** A new building has nowhere to go back to — `completePad` scores it, toasts it,
unlocks it and marks it built *before* `beginPlacing` is ever called, so by the time the ghost is in
hand the purchase is spent and the only open question is where it lands. Rather than a cross that
quietly means something else, there is no cross on that path, and Escape carries on down to the pause
it used to reach instead of dying silently.

One bug worth recording. `updatePopping` sets `visible = true` on everything still popping in, every
frame, so a building picked up within half a second of being built refused to disappear — the ghost
was in hand and the building was still standing there. Picking one up now takes it out of the pop-in
list first. Not reachable by walking to a building, but a save would have found it eventually.

## The army holds the grounds

Soldiers and archers do not follow the King any more (#116). They take posts on an ellipse just
inside the current wall — `TIERS[tier].bounds`, so the ring grows with each expansion and nothing has
to be told the village got bigger — and hold them until a raider comes inside. Then the **whole army
forms one block** on that raider, rather than each soldier fighting whatever is nearest to itself.

That last part is the ticket's own objection and it is the reason the feature nearly did not work.
Enemies retarget to the nearest unit every 0.4 s, so an army fighting individually is as many losing
fights as it has soldiers. Two things fix it: one shared target (the raider **deepest** into the
grounds — a sapper at the Keep matters more than a knight outside the gate), and a **standoff**.

The standoff is the number the whole idea turned on. The first version formed up *on* the raider,
which marched 30-hitpoint archers with a 9.5 range into contact. Measured, 12 soldiers against 20
raiders with the King away:

| standoff | soldiers lost | raiders left | Keep damage |
| --- | --- | --- | --- |
| 0 (on the raider) | **12 of 12** | 18/20 | 421 |
| **7** | **4 of 12** | 9/20 | **0** |
| 11 | 8 of 12 | 10/20 | 432 |

Too far back is nearly as bad as too far forward: at 11 the block sits behind the fight and the
column walks through to the Keep.

Against the old follow-the-King behaviour, soldiers lost and Keep damage over 45 game-seconds:

| raiders | King away, follow | King away, hold | King home, follow | King home, hold |
| --- | --- | --- | --- | --- |
| 12 | 0 lost, **−421** | 2 lost, −0 | 2 lost, −0 | 2 lost, −0 |
| 20 | 4 lost, **−421** | 7 lost, −89 | 9 lost, −19 | **3 lost, −0** |
| 28 | 10 lost, **−421** | 8 lost, −429 | **12 lost**, −113 | **4 lost, −0** |

The follow column only looks cheap because an army 34 units away with the King never fights at all —
and the Keep pays 421 for it every time. With the King at home it is not close: a formed block beats
a ring orbiting a man who keeps moving. (There is run-to-run variance; the direction is far bigger
than the noise.)

### The King's Guard

What follows him instead is bought, at the Barracks, two soldiers at a time on a rising price. They
are promoted out of the army rather than recruited, so a guard is **a soldier taken off the walls** —
which is the decision the ticket wanted. Swordsmen are promoted first: a bodyguard is a body between
him and a raider, and an archer is worth more on the wall it was standing on. The mat is shut, with a
reason, when there is nobody left to promote.

Measured with the King 34 units from the village: guards average **0.8** units from him, the rest of
the army **48.4** — holding the grounds.

Two things this renames or redefines. The old "Royal Guard" pad is now **Royal Armour**: it grants
+80 max HP and a full heal and never had anything to do with a guard, and two pads called Royal Guard
and King's Guard two mats apart would be a trap. And `A.lost` — the distance at which a soldier counts
as stuck and is put back — now returns him to his post rather than to the King, because a soldier
holding a breach has no business reappearing wherever the King happens to be.

`countFollowers` still counts everyone: the army cap is about how many soldiers the Keep supports, not
about where they are standing.

## The King's two verbs: the warhorn and the banner

Both live bottom-right, both recharge as a ring filling around their button -- which
**disappears the moment it completes** (#135), because a finished progress bar sitting there reads as
a permanent gold border, and a row of them made a row of hoops. The glyph coming up to full opacity
and the pulse already say "ready". Between
them they are everything the player does in a fight that is not choosing where to stand. Before #57
there was only the horn, on a twenty-two second cooldown — about a hundred button presses in a
thirty-seven minute run.

The **warhorn** (`CFG.horn`) — the horn button, or Space — rallies the army: every soldier runs to
the King and fights faster and harder for a few seconds, and the blast shoves nearby raiders back and
stuns them. It recharges over about twenty seconds, so using it at the right moment matters more than
using it often.

There was a third. The **dash** (#57) was a committed 0.3s burst at 2.8x walking speed — Shift, a
double-tap, or a bolt button between the other two — and #160 took it out: the owner's call was that
a few units of burst is not a feature worth a button, and the horn and the banner are the two verbs
that are decisions. The double-tap went with it, and nothing reads that gesture now; a player steering
in short stabs must not be burst forward for it.

What it was measured to do is kept here because whatever next touches the chase will want it. A dash
covered **4.44 units at 60fps** against a walk's 1.68 over the same 0.3s, and it was the thing that
made the **thief chase** winnable on foot: a thief flees at 8.2 (`enemy.thief.fleeSpeed`) against 5.6
on foot and 7.5 mounted, and a dash closed about 2.2 units of that, twice in one run. Without it the
chase is the speed check it was before #57 — the King's own bow and the towers answer a thief,
footspeed does not. `fleeSpeed` is left at 8.2 on purpose and is the one number to move if that turns
out to be the wrong call; the reasoning is on the line itself in `src/config.js`.

The **rally banner** (`CFG.banner`, #57) — the banner button or B — is the one that is a decision
about a *place*. The horn says "to me"; the banner says "hold here", and then lets him leave. It is
planted where he stands rather than aimed: a one-thumb game has no room for a targeting mode with a
raid running, and "walk to the breach and plant it" is the same decision with none of the interface.

While it stands, the army's formation centre is the banner instead of the King — the same ring
machinery, a different point — so he can leave a breach held and go and fetch the coin that pays for
the wall. It flies for eighteen seconds of a seventy-five second night and recharges in twenty-eight
*from when it is planted*, so the gap between one banner and the next is ten seconds of the army
being his again. That gap is the cost.

The horn **suspends** a standing banner rather than tearing it down: `rallied()` outranks it in the
formation centre, and when the six seconds are up the army goes back to the banner if it is still
there. Clearing it was the other option and it made the horn a trap — the emergency button would have
cost the player the order they had just spent a cooldown on.

Two things follow the banner rather than the King while it stands, and both matter: how far a melee
soldier may chase a raider before turning back, and where a genuinely stuck one reappears (`A.lost`).
A soldier holding a breach has no business running back to the King. With no banner both still read
off the King exactly as they did before, because the formation centre trails him by up to `A.trail`
and moving them to it would have been a balance change nobody asked for.

Driven, with ten soldiers and the King walked 25 units away: the army sits 1.9 units from the banner
and 33.4 from the King; the horn brings them to 0.9 from him; six seconds later they are 0.6 from the
banner again; when it falls they are 0.5 from him.

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

## Rain

It rains every two to four days, for between half a night and a whole one, and the timings are ranges
for the same reason the wolf only howls some nights: a shower that arrives on the hour is scenery, not
weather (`CFG.rain`). It is drawn from `Math.random` rather than the seeded generator the map is laid
out with — the map should be the same every run and the weather should not.

Most of the effect is the light, not the drops. The sun drops, the ambient lifts and the fog goes from
green to grey, all scaled by how hard it is falling so a shower carries itself in and out. The drops
are 520 instances in **one draw call and 1040 triangles**, and only while it is actually raining —
measured dry against wet on the phone path, the whole thing costs `+1 draw call, +1040 triangles` and
nothing at all when the sky is clear.

**It waters the living ground.** Wood and straw regrow at three times the rate while it falls, never
the rock — rain refilling a quarry reads as a bug, and keeping it to the two things that grow makes it
a rule you can guess instead of one you have to be told. `setNodeLook` already thins a node as it is
mined and fills it back in, so a tree visibly growing back in the rain needed no new art. Measured
over 18 seconds of game time: a drained wood node comes back 1 unit dry and **6 wet**, and a rock node
comes back 1 either way.

The multiplier is pinned against a whole run rather than picked round. At ×2 a tree drained when the
shower started stood at 0.73 of its height when the sky cleared, and a growth you have to remember the
start of is not one you can see. And it is not worth farming: a King parked between two home wood
nodes for all thirty nights gathers 543 units dry against 691 wet — 296 coin, against a maxed Keep's
3538, for standing in one place and ignoring every raid.

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

Every row that carries a number carries **both** of them -- `Army limit 15 archers, 6 swordsmen was
12 and 4` -- because nobody remembers what the limit was a level ago, and a total with nothing to
measure it against is trivia. The new figure takes the HUD's gold and the old one goes small behind
it, so the panel can be scanned in the second a fast game gives you for it. A row whose number did
not move is dropped rather than shown unchanged: claiming a gain that did not happen is worse on
this screen than on any other. `levelGains` returns `{icon, text, now, was}`; the Keep plaque and the
info screen compose it through one `gainBody` in `hud.js`, which wraps markup around escaped text so
a config string can never become an HTML channel.

On the level-up panel the same four fields are a **tile** rather than a sentence (`gainTile`, the same
escaping rule). A sentence puts the label, the figure and the old figure on one line, so the eye has
to read the line to find the number; a tile puts them on three, in three sizes, with a green arrow
against the old one. A row with no figure is an event -- *stone quarries are open* -- and stays a
sentence across the full width, because padding it out to look like a number it does not have would
be a lie about its shape. Two columns on a phone, three or four on a desktop, out of one
`minmax(128px, 1fr)` and no breakpoint.

Level 3 is the fullest level in the game at seven rows, measured across all fifteen, and as tiles that
is 334px of summary. It is capped at `24dvh` and scrolls, with the bottom of the list faded when there
is more below it, because the one thing that must never be pushed off the bottom is the choice: the
panel is 754px on a 390x844 phone against the 748px it was as flat rows, so all three cards stay on
screen. `dvh` and not `vh` -- an installed iOS PWA answers `vh` with the large viewport (#74 measured
`vh 956` against the `dvh 894` the overlay actually gets), so a `vh` cap would claim 7% more room than
exists.

You keep one of three rewards. The pool is in
[src/upgrades.js](src/upgrades.js) and covers five areas: your army, watchtowers, walls, the economy
and the King himself. Offers draw from different areas where they can, so a choice is never three
flavours of the same idea, and a few rewards are rare and change how a run plays rather than how fast
it goes.

A card says what you will see — *"Your walls and gates hold out far longer"* — rather than a
percentage against a number the game never shows you (#107); the multiplier sits on the same line as
the sentence, and the sentence has to stay true of it.

The area is printed above the name — **YOUR ARMY**, **WATCHTOWERS**, **THE KING** — because the names
are flavour and a player has a second to choose. `pool` was already on every upgrade and reached
nothing on screen, and since an offer takes one card per pool the three labels are always three
different ones: the label alone answers *archers or towers or walls tonight*, which is the decision
the panel is actually asking about. The names stay flavour behind it; the one that was changed was
changed for being wrong rather than for being flavour (#115).

The area is the card's **colour** too, so it can be read without being read: crimson, blue, brick,
green and purple for the five pools, as saturated blocks -- **and otherwise the same button as
everything else** (#135): hairline edge, 5px corner, the CTA's shadow, and the accent ring on press.
They carried a 5px dark bottom edge until then, sinking into it when pressed, which left them the last
raised thing in the game long after `.panel button` was moved off exactly that idiom. The colour stays
because the colour is the label; what went is the relief.

They were cream cards on a beige border before that, and the only two things about them that said
*button* -- a gold border and a lift -- were both on `:hover`, which a touchscreen never enters; on a
phone the cards had no button cues at all, ever. Everything that says button is in the resting state
now. White text clears 4.5:1 on all five at the lightest point of the gradient (5.14 to 5.78,
measured), which is why the five are as dark as they are. Gold is deliberately not among them: it
belongs to the primary button, and a gold card would read as the recommended one.

Rare used to *be* a colour -- a purple card -- and purple is a pool now, so Volley wears a gold **RARE**
badge instead. A word survives whatever colour is underneath it; a hue does not. #121 gave it a gold
ring as well; #135 took the ring off, because that ring now means *the one being pressed* on every
button in the game, and a card wearing it at rest was claiming to be chosen before anyone had chosen
it. The badge was always the half that did the work.

Behind the level number there is a burst of rays and four sparks, in CSS, because this panel is DOM
and `burstFx` cannot reach it. It is all visible at rest and only *moves* when it animates, so a
player mid-blink and a player who has asked the system for less motion both still get the moment. The
animation hangs off `#offer-screen:not(.hidden)` rather than off the element: a hidden overlay is
opacity and visibility, never `display: none`, so an animation declared on the element itself would
run itself out while the panel was invisible and open on its own tail.

Turn a phone sideways and the panel goes two columns -- the summary down the left, the question
answered on the right. Stacked it needs about 500px of height and a 844x390 landscape has 370, so all
three cards were off the bottom with no way to scroll to them: `.overlay` centred with `place-items`,
which grows the space above a too-tall panel as well as below it and puts both edges out of reach.
It centres with `align-content: safe center` now, which spills downward only, and scrolls.

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

The goal is no longer a night count. Reach Keep level 13 (or the run's last night, whichever comes
first — night 30 on a long run, night 15 on a short one) and the march opens: a toast, a swords arrow on the screen edge, and "march on the camp!" in the HUD. Walk in
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

Stand on the pad at its door and **pay coin into it**; when the level's price is met the Keep levels up
(1 to 15, `CFG.base.levelCost`). Each level raises how many archers and swordsmen the village supports
(`CFG.base.archers` / `swordsmen`; recruit pads lock with a "Needs Lv. N" chip when you hit the cap),
speeds up every bow (1x at level 1, 2x at level 8, 3x at level 15) and rebuilds all walls in the next
material at levels 4, 8 and 12 (`CFG.base.wallAt`). Some pads only appear at a Keep level
(`minLevel`: village expansions, barracks).

It took wood, stone and straw once, and half the game's copy went on saying so for a long time after it
stopped -- nine strings, including the tutorial step a new player reads first, which sent them mining
for a currency the Keep does not take (#125). The chip above the controls had been saying *coins* on
the same screen all along, because it reads the pad's own price. Materials now have exactly one use:
they are sold.

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

Three clips is all there is, and it is the gap in the game's motion: **there is no death, hit, run or
mine clip** (#55). `bakeBones` already takes an arbitrary number -- it names those three and appends
whatever else it finds -- and a clip costs 25 to 60 rows of the bone texture, tens of kilobytes. So
this is authoring work in the script above, not engineering. Two of the things that gap caused have
been fixed without clips, and are described under the crowd below: how a character falls over, and
the rate its walk cycle plays at.

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
see [tools/probe/README.md](tools/probe/README.md).

**The half that can show something growing** (#166). Every number above is this frame's work, and a
run that is slowly leaking looks identical to a healthy one there until it does not. Under it the
panel now prints the JS heap (Chrome only, which is the phone) with the last sixty seconds' direction
-- `heap 74.5 MB · 60s 73.8→74.5 (+0.7) min 73.8 max 74.6` -- then the arrays that fill and drain
(arrows and the pool, ground coins, popups, pile flies, chips, fx, dying, popping, spawn queue), the
instance counts that must not move (grass, flowers, contact shadows, pebbles, smoke, crowd), and the
GPU objects and for-ever caches (geometries, textures, programs; materials, tags, popups). A count
that only ever climbs across a run is the leak, named.

The numbers are sampled into `game.perfLog` every two seconds of game time, kept for an hour, whether
or not the overlay is up -- so a run that went wrong can be read afterwards from the console -- and
the **copy log** button on the panel puts the whole thing on the clipboard as CSV, for the same reason
#74 made the size line copyable: retyping a wall of numbers off a phone is how a digit gets lost. The
panel itself stays `pointer-events: none`; the first version took the tap and swallowed the Play
button on a phone, which is how that was found.

**Does a full run leak?** (#167) Measured rather than reasoned: thirty nights of game time driven
headlessly with the renderer stubbed out (SwiftShader would take a day and the JS heap does not need
pixels), the King and the Keep topped up by fiat so the base holds, every raider still spawning,
walking, fighting and dying through the real path, and the heap read after a forced GC every ten
game-seconds so what is left is what is *retained*. The post-GC heap at dawn went **67.4 → 75.5 MB
over 28 dawns, rising on 27 of them** -- a staircase, not a sawtooth -- and the sample table names
it: **ground coins, 10 → 3,106.** Nobody picks them up in a soak, and nothing else ever removes
one. Everything else held: arrows 0–4 live against a pool of 7, dying 0–3, fx 0–4, popups 0–3,
`matCache` flat at 69, the geometry count stepping up only as new enemy ranks were first baked (312 →
508, plateauing), and the one other climber -- `popupCache`, one canvas texture per distinct damage
number, 34 by night 28 -- is a disposing LRU now, the same fix #165 gave the tags. Attributed at the end of the run rather than inferred: with the run over at 76.2 MB, dropping the
coin list and collecting again gave back **4.9 MB** on its own; the rest is the 123 raiders alive at
that moment, the popup textures, and the rank variants, all of which have a ceiling. So the one
thing in the game that grows without one is a coin nobody walks over -- which is a design question
(do coins expire, or is the field capped?) rather than a bug, and is ticketed as one.
The soak is `soak167.mjs` in the session scratchpad and takes about five minutes.

**Adaptive quality** (#168). The game had one adaptive path -- `safeMode()`, which fires when a frame
draws *nothing* -- and no response at all between "fine" and "blank". Now `game-quality.js` reads the
**uncapped** frame delta (`dt` is capped at 0.05, so it cannot see below 20fps) and gives things up in
the order they cost the look, from `CFG.quality`: at a sustained 45fps the grass and flowers thin to
60%; below 35 the wind stops and the resolution eases to 0.85; below 28 the contact shadows go and the
resolution to 0.7. A frame over a quarter second is a hitch, not a rate, and is not counted -- which
is also what keeps SwiftShader, at a frame a second, from dropping the probe to the floor tier.
Hysteresis, because a switch that flaps is a world that visibly breathes: drop after three seconds
under the threshold, restore one tier only after twenty seconds a clear ten above it, and only one
tier at a time each way. Driven with synthetic deltas: 30fps drops to tier 2 and holds; 60 climbs back
one tier per twenty seconds; 40 drops once and sits in tier 1's band without moving; alternating
44/46 for a minute does not drop at all. `?quality=N` pins a tier (0 = full) for a probe or a
screenshot that needs the same picture every time, and `?perf=1` names the tier that is active.

`probe.mjs --assert` measures a run against the table below and exits non-zero naming whatever it
broke. Frame time is not among the asserted ones and cannot be: the probe renders through SwiftShader
on a CPU. Budgets:

| Metric | Aim for | Why |
| --- | --- | --- |
| Frame time | < 16 ms desktop, < 33 ms phone | 60 / 30 fps; anything slower feels laggy |
| Draw calls | < 400 late game | each one costs CPU time no matter how small it is |
| Triangles | < 1M late game | phones slow down past this, especially with shadows |
| Triangles per character | ~5k (King 6.5k) | 100+ characters can be on screen |
| Load | < 3 MB to the Play button | first play on mobile data; measured **on the wire**, which is what that reason means |

`.github/workflows/budgets.yml` runs that assertion and the linter on every pull request, at
`--crowd 120`, because "late game" is what the draw-call and triangle budgets mean and a plain run
never leaves night one. It does **not** run on pushes to `main`: a budget that fails after the merge
is a red deploy and the thing it was meant to stop has already happened.

Two of those budgets are **waived** rather than asserted today, named in `probe.mjs` with the ticket
that will lift them (#52 -- the crowd models came back from Meshy at ~8.7k triangles against a stated
~5k, and they are the ones drawn seventy times). A guard that is red for a reason everyone already
knows teaches everyone to stop reading the guard; waived, it goes green today and starts failing the
day something *new* breaks, which is the only state in which it is worth having.

`npm run lint` is the other half. It is **correctness rules only** -- a name that is not defined, a
key written twice, a branch that cannot be reached, a `const` assigned to. Nothing in it has an
opinion about how code looks, because this repo's style is written down in CLAUDE.md and is not
something a tool should argue with. That was the objection to adding a linter at all, and it turned
out to be an objection to a different linter: the correctness half found eight things on its first
run, every one of them dead code, and nothing else.

The two buildings that load **behind** the title screen -- the Barracks and the villager home -- carry
their base colour as KTX2/ETC1S rather than JPEG. JPEG decompresses to raw RGBA on upload, so 1024x1024
costs 5.59 MB of permanently resident video memory whatever the file weighed; ETC1S stays compressed on
the GPU at about a quarter of a byte per texel, which is 699 kB. Five buildings were 27.9 MB and are now
**18.2 MB**.

Only those two, and that is the whole design of it. A KTX2 texture needs the Basis transcoder, 577 kB
on the wire, fetched the first time one is decoded -- so compressing the three the opening needs in
hand would drag that download onto the critical path and put bytes-to-a-clickable-Play over a budget it
currently clears. The rule is: what the opening needs stays JPEG, everything after it is ETC1S, and
`tools/models/compress.mjs` holds the same split (#51). Measured: nothing of the transcoder arrives
before Play, and both devices report the same 3007 kB (2972 before the #55 clips added 31, 3003
before #135's palette block and raid bar added 3, and 3006 before the #138-#146 round added 1).
65 kB of headroom left against the 3072 budget, which is the figure to watch: nothing since #51 has
moved an asset, so every kilobyte of that drift is source.

How a character dies, and how it reacts (#55):

- **A death is two halves that compose.** The **topple** is code: the body goes over about its feet,
  *away from whatever killed it*, with gravity in the curve and one small bounce as it lands, and only
  sinks under the fade at the very end. The Euler order changes to `YXZ` for a body -- the default
  applies the tip before the facing, so a raider looking east would have fallen north whatever hit it.
  The **`Death` clip** is the body-local half: a snap back on the blow, the knees giving, the arms
  dropping wide, the head lolled onto a shoulder. The clip cannot do the topple, because which way a
  body goes over depends on where the blow came from and that is not knowable when the clip is baked;
  the topple cannot do the slump, because a rigid body has no slump. Together the field after a wave
  is bodies lying in four directions with their limbs sprawled, instead of planks at four angles.
- **A `Hit` clip replaces the squash, where it will read.** A flinch: rocked back, half turned, feet
  braced, and back to the bind pose by the end. It plays only on a character standing still, which is
  the crowd path's constraint rather than a taste call -- a one-shot there *replaces* the looping clip
  instead of blending with it, so playing it over a Walk snapped the legs out of mid-stride and back
  inside a fifth of a second. Anything moving keeps the old scale squash, which still says "that
  landed".
- **The walk cycle plays at the speed its owner is moving.** Speeds here run from the boss's 2.3 to an
  army archer's 9.0 and every one of them played the same cycle at the same rate, so most of the field
  was either moonwalking or paddling. The stride is baked into the clip, so the rate is
  `speed / CFG.walkAnim.refSpeed`, clamped. The crowd carries it as a per-instance attribute because
  an `InstancedMesh` has no mixer; the skinned path uses `timeScale`.

The clips are authored as numbers rather than posed in Blender, because there is no Blender here and
the rig is seven bones. `tools/models/clips.mjs` writes them into the GLBs and
[`tools/models/README.md`](tools/models/README.md) has how to look at one and what the frames changed.
They cost **21 rows of the bone texture per model** -- 115 to 136, 50.3 kB to 59.5 kB, so 301.9 kB to
357.0 kB across the six crowd models -- and **13.7 kB brotli'd on the wire**.

What keeps it fast:
- The crowd — raiders, archers, swordsmen, elites, brutes, the boss — is ONE instanced draw per model,
  animated on the GPU from a baked bone-matrix texture (`src/crowd.js`), each instance carrying its own
  clip, phase and **playback rate**. 181 characters cost 6 draw
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

Two different things decide whether the world reaches the edges of an iPhone, and only one of them
can produce the bands of flat page green that #74 is about.

**The CSS box** is what covers the screen. It is `100dvw` / `100dvh`, with `100vw` / `100vh` behind
them for anything without the dynamic units. An explicit size is required rather than tidy: a
`<canvas>` is a replaced element, so `inset: 0` with `width: auto` gives it its *intrinsic* size — the
drawing buffer — and a 390×844 phone ends up with a 1885×2652 canvas box. Measured, by trying it.

On an installed iPhone the page is handed a viewport smaller than the screen, and that turned out to
be the whole of #74. Read off the device:

    box 0,0 440x956 · vig 956 · win 440x894 · doc 440x894 · screen 440x956 · safe 62px/34px
    units lvh 956 dvh 894 svh 894 vh 956

The screen is 956 and the viewport is 894 — short by exactly one `safe-area-inset-top` — and iOS
paints the 62px left over itself. Both painting layers were sized to the glass with `100lvh`, which
`lvh` genuinely reaches, and **the strip did not move**. What it moved with, every time it was
tested, was the *root background*: dark when that was dark, green when it was green. Nothing a page
paints can reach outside its own viewport, and the only thing that paints there is the browser, with
the root element's background.

So the `lvh` sizing came back out — it bought nothing and cost something, since the canvas rendered
62px that was never displayed and `.overlay` centred its panels 31px low — and the strip is given a
colour instead, in `main.js`: the vignette's own tint, so it reads as the darkening at the edge of
the screen carrying on past it. It is held at the page green until the first frame exists, because
until then it is the whole screen and the load should not flash dark on its way into a green game.
`height=device-height` is on the viewport meta as the last lever that could change the viewport
itself. If the viewport ever comes back full-height, none of this is visible and none of it costs
anything.

**The drawing buffer** is how much detail is drawn into that box, sized from the largest of the
canvas's own box, `visualViewport` and `window.inner*`, then asked for again four times over the
first second and a half — iOS answers those three differently under `viewport-fit=cover`, and there
is no event for "the standalone box has settled". A buffer that comes up short cannot make bands: the
browser stretches whatever the buffer holds into the CSS box, so it shows as a soft picture, not a
green one.

`?perf=1` prints both, plus the canvas's actual rectangle, `documentElement`, `visualViewport`,
`screen`, the safe-area insets, and what each of `lvh`/`dvh`/`svh`/`vh` actually resolves to — the
whole history of this bug is iOS answering differently from the spec, so the units are measured on
the device rather than assumed. A headless browser has no safe areas and no standalone mode, so
that line is the only way to find out which of them went short on a real phone — and **the settings
sheet carries a short version of it**, because a home-screen app cannot be opened with a query string.
The shortcut launches at the manifest's `start_url`, so the one place these bugs happen was the one
place the numbers could not be read. It says the canvas's box, and the viewport too when the two
disagree; tapping it copies the whole line.

Getting there took one trick worth remembering. The bands were exactly `#3f9a5b`, and that colour is
three things at once — the page background, `theme-color`, and the manifest's `background_color` — so
no amount of looking could tell *a canvas coming up short* from *iOS painting its own chrome over the
safe areas*. Making the page background a different colour for one release split them: the bands went
dark, so it was the page, and the reading that came back with it had the numbers that finished the
job. Nothing can see the page background while the canvas is covering, which is what made it free to
change and free to change back.

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
at the foot of the sheet, so "Up to date" can be checked rather than believed. The row says so plainly
when there is no connection instead of reporting good news it does not have. Installing reloads the
page, so it takes a fresh save first when the field happens to be quiet enough for one — daylight,
nothing on the field, nothing queued. The game also checks by itself when it comes back to the
foreground, at most every fifteen minutes: that is the only moment a homescreen app reliably gives
you, because iOS *resumes* it to the page it was already on rather than navigating, so nothing
re-checks the worker and a phone can sit on one build for weeks.

A waiting build now says so outside the sheet: a **red dot on the settings cog**, and on the title
screen a row of its own, because the cog lives in the HUD and the title screen is both the one place
it could not be seen and the one moment when installing costs nothing at all. The dot does not pulse —
the attack alarm does, because it is about something the player has seconds to answer, and an update
has been waiting a while and will keep.

Under the row is **what installing costs**, which is three sentences off state the game already has:
nothing in progress and it costs nothing; a run the save can describe and *"your run is saved before
the game reloads"*; and the one case it cannot, which is Wren being carried off, where the line names
her and says you come back to the last dawn. It only ever warned before, and a player who was
perfectly safe got a build hash — so the one moment somebody is deciding whether to risk a run,
silence was all they had. The middle sentence used to mean daylight and an empty field, and every
night fell through to the third; since the raid is stored (#150) it is what a player mid-raid gets,
which is the whole of that ticket. Installing then says **"Run saved — installing…"** rather than
*"Installing…"* — one line and not two, because `applyUpdate` reloads the moment the worker takes
over and nobody gets through two states, and in the past tense because `saveRun` writes
`localStorage` synchronously and the run is already on disk by the time the words are set.

Over all three sits the case that would make any of them a lie. A build whose **save format** has
moved cannot read this one's save at all: `savedRun` returns null on a version mismatch and the run is
discarded rather than half-applied. The old page cannot know that from anything it holds — it is the
old build — so it asks. A worker in `waiting` is already installed and already receiving messages, and
its `SAVE_VERSION` is baked in at build time out of `game-save.js`, so it ships in the same commit as
the bundle it is waiting to serve. If it answers with a different one, the row says the run will not
survive; if it does not answer at all — a build from before this existed — nothing is claimed either
way. A reassurance that turns out to be false once is worse than no reassurance at all.

Cache lookups pass `ignoreVary`. Without it the shell loads offline and the bundle does not: a server
answering `Vary: Accept-Encoding` makes the browser compare request headers against the ones that
filled the cache, and a module script does not ask the way the install-time fetch did.

Registration is skipped in `npm run dev`, where a worker caching the bundle would fight Vite's
reloading.

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages through the workflow in
`.github/workflows/deploy.yml`. `npm run build` produces the same static site in `dist/` if you want to host
it elsewhere.
