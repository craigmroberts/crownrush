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
  carried to the trade post and sold -- and the post pays 0.75x for a material after every ten of it
  sold today, compounding, until dawn (#236: the glut, in `CFG.materials`, with the coin-per-second table
  that made diamond a schedule rather than a choice). That is the whole of what mining is for -- and the bag says so
  when it fills, once per fill, because filling it is the moment that sentence is worth reading. It
  used to be said only when you walked onto a heap you could not lift, which is a refusal rather than
  a notice: the moment the bag actually filled, nothing was said and the swings went on landing (#129).
- Roads grow out of the gates as you wall the village (#180: dirt tracks with ruts and a verge the
  grass creeps into, trails past the town wall, paths to every home), and bridges over the river are
  built from pads at the crossings. Until a bridge exists, raiders only come from your side of the river.
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
- **Contact shadows, which on a phone are the only ones.** On an ordinary phone nothing casts:
  characters get their instanced blob and every tree, rock, bush and bale floats. 671 instanced discs,
  sized from each object's own bounding box so nothing has to be plumbed through the call sites.
  Heavier (0.42) where they are the only shadow, fainter (0.2) where the sun casts too and they are
  doing ambient occlusion instead -- a setting now rather than a fact, because the shadow map is one
  too.
- **The shadow map, and whether a phone can have one** (#193). It has been off on phones since #26,
  when a Pixel Fold rendered a white world and the map was one of three things switched off to find
  out why -- inherited ever since, on hardware two generations newer, without being retested. There
  are two profiles now and `?shadows=off|cheap|full` picks one for a run:

  | | texels | extent | units a texel | PCF radius | fill |
  | --- | --- | --- | --- | --- | --- |
  | **full** | 1536 | ±36 | 0.047 | 4 | 2,359k |
  | **cheap** | 768 | ±30 | 0.078 | 1 | 590k |

  The filter is `PCFShadowMap` on both, and that is a correction #185 turned up rather than a choice:
  three r186 has **removed** `PCFSoftShadowMap` -- the renderer logs *"has been removed. Using
  PCFShadowMap instead"* and quietly substitutes. So the soft filter the desktop path asked for has
  not existed for some time, and `radius` is what actually separates the two profiles.

  The extent is what makes a small map usable: it is a box around the **King**, whom the sun follows,
  so it only has to cover the frame -- which reaches about 27 units ahead of him and 12 behind. ±20
  was the first guess and is too tight; a tree 25 units out popped its shadow in as he walked at it.
  It also replaced a third, unmeasured profile: `?hq=1` on a phone used to get 1024, and now gets the
  real full path.

  **The grass receives now, and that is most of what makes a map worth having.** A cast shadow lands
  on the ground, and since #191 the ground around the King is covered in grass — so the mesa's shadow
  fell across a field of blades that were all still in full sun, and read as a stain rather than as
  shade. It still does not cast: 13,000 instances through the depth pass is the one shadow cost that
  is affordable nowhere.

  **What it costs**, driven in a phone-sized frame with the opening village fully stood up:

  | | no map | cheap | full |
  | --- | --- | --- | --- |
  | village, draw calls | 87–94 | 220–225 | 229–243 |
  | village, triangles | 567–574k | 724–736k | 748–762k |
  | mesa edge, draw calls | 50–57 | 115–139 | 158–174 |

  Two sweeps, and the ranges are the union of them: a frame here costs about a second, so which
  three frames get sampled moves a count by ten either way. Nothing in the spread changes the shape.

  The extra is the shadow pass drawing every caster a **second time** — 130 to 150 draw calls in the
  village, where there are 154 separate casting meshes near the King for it to draw. That is the
  number to worry about against a budget of 400, and it is nearly the same for both profiles: what
  `cheap` actually saves is a **quarter of the fill** (590k texels against 2,359k), which is the part
  a phone GPU feels, plus ten or twenty calls from the tighter box. Merging the casters the way
  `mergeGroup` merges the scenery is the lever that would change the call count, and it is a separate
  piece of work.

  **The choice is made at load, not by the adaptive controller** (#168). Changing `shadowMap.enabled`
  changes the shader defines, so every material has to recompile; doing that on a tier drop stalls the
  whole program cache at the moment the device is already behind. The controller has four cheaper
  dials and keeps them. `?view=mesa` frames the one place terrain throws a real shadow across open
  ground, which is where this is worth judging, and `?perf=1` names the profile and its texel density.
  The default stays off on a phone until somebody has measured `cheap` on one.
- **Banded shading on the ground and the grass** (#185). The lit-to-unlit ramp on every surface was
  continuous, and a continuous ramp is what reads as a render rather than as a picture. `band()` in
  `models.js` quantises the diffuse light into three steps and is applied to exactly two materials:
  the ground and the 13,000 tufts.

  **It cuts `dotNL` inside `RE_Direct_Physical`, before the tone map and before exposure**, and that
  is the load-bearing decision. `exp` runs 0.98 at dusk to 1.26 at noon and rain dims it further, so a
  threshold on the finished pixel would sit on a moving floor. Driven by walking the sun through
  elevation and reading one patch of flat ground -- where `dotNL` *is* sin(elevation), so the steps
  can be checked against the constants -- the boundaries land at the same sun elevations at noon, at
  noon in full rain, and at dusk. Only the levels move.

  | | shade | mid | lit | range |
  | --- | --- | --- | --- | --- |
  | **before** | 0.267 | *(a smooth ramp, no steps)* | 0.456 | 1.7× |
  | **after** | 0.135 | 0.335 | 0.487 | **3.7×** |

  That doubling is the ticket's first prerequisite -- widen the tonal range before banding it --
  and it is done **without moving a light**, because moving `sun.intensity` would have reopened
  #194's dusk keyframes, which are pinned by rank contrast. The lit band is worth 1.20, above one, so
  a sunlit face is brighter than the sun alone makes it; the dark band pulls the *indirect* term down
  to `fill`, which is an ambient-occlusion term in all but name and is what makes shade properly dark.

  **The edges are not a taste decision.** The ground is one flat plane, so its `dotNL` is a single
  number per frame -- 0.94 at noon, 0.53 at golden hour, 0.36 at dusk, 0.28 at night. The first
  edges tried were 0.26 and 0.55, and both land *on* one of those: the whole field was mid-crossing
  at two of the five hours and night came out 17% darker. 0.20 and 0.48 put every hour cleanly inside
  a band.

  **Rank contrast**, measured with the four ranks stood in open grass and the sway frozen, because a
  waving blade is ±0.2 of noise on anything read off a grass pixel:

  | | Bandit | Raider | Marauder | Warlord |
  | --- | --- | --- | --- | --- |
  | noon | 2.20 → **2.45** | 4.53 → 4.50 | 6.19 → **6.94** | 6.38 → **6.56** |
  | golden hour | 2.23 → **2.46** | 3.08 → **3.28** | 4.79 → **5.27** | 3.80 → 3.69 |
  | dusk | 1.23 → **1.51** | 2.00 → **2.81** | 2.93 → **4.08** | 2.91 → **3.21** |
  | night | 1.14 → 1.07 | 1.60 → 1.58 | 1.56 → 1.56 | 2.04 → 1.99 |

  Dusk gains most and night is flat. **Draw calls and triangles are unchanged** -- 208 and 977k at
  noon either way, across every candidate tried; a shader change costs no geometry.

  Two traps, both of which have bitten before. `band()` **chains** whatever `onBeforeCompile` the
  material already has, because the ground's untile hook and the tufts' sway are both load-bearing;
  and it **appends** to `customProgramCacheKey` rather than replacing it, so the keys are
  `ground-untiled-patched+band` and `sway-tinted-rooted+band`. A key of plain `+band` would have the
  two racing for one program (#155). `bands-hooked` asserts both, because every way this fails is
  silent: if three renames the one line the patch rewrites, the replace is a no-op and the game
  renders un-banded with nothing in the console.

- **And then the rest of the world** (#186). The same helper and the same constants on every other
  environment surface: tree trunks, canopies, bushes, rocks, mesas, cliffs, the roads, the wheat, the
  clover, the field stones, the pebbles and the river bank. Most of it arrives at once, because
  `bake()` folds nearly every prop onto `BAKED_MAT`/`BAKED_STD` and the canopies onto `BAKED_SWAY`,
  so banding three singletons carries the bulk of it -- and reaches the built buildings and the
  procedural character fallbacks too, which is the global change #184 allows rather than an accident.
  The imported buildings carry their own materials from `props.js` and are untouched, and `GHOST_MAT`
  is a `MeshLambertMaterial`, which does not even compile the chunk this patches.

  **`mat()` was the hard part, not the shader.** It hands the same object to everyone who asks for a
  colour and several of those colours are computed at runtime -- a cliff's strata, a building's age
  palette -- so "band the clover's green" cannot be shown to band only clover. `mat()` takes a
  `banded` option now: it is stripped before the constructor sees it (three warns about parameters it
  does not know) and it is part of the cache key, so a banded material is a different entry from an
  unbanded one of the same colour and nothing can acquire it by accident.

  **Which surfaces are actually on the ramp is measured, not argued.** Walking the scene at
  `?view=map`: 25 lit materials carrying 512k triangles are banded. `bands-hooked` now asserts that
  every lit standard material with more than 200 triangles on it is banded, so a surface added later
  cannot quietly be the one thing left on a smooth ramp -- and the boundary it draws is **where the
  object lives**: `buildWorld` adds to the scene, everything a run spawns goes under `game.root`,
  and that line is exactly "environment" against "characters and props". Four things on the scene are
  exempt by name, each for its own reason: the crowd's meshes and the imported rigs and props (out of
  scope for #184), the coin field (a gameplay object, not a surface), the chimney smoke (a soft
  volumetric fake, which hard steps would read as a fault on) and the river (#188's). The last two
  were given cache keys so the sweep can name them instead of reporting an anonymous white surface --
  which is also the #155 guard they had been missing.

  **Draw calls do not move**, and that is structural rather than lucky: `mergeGroup` merges by
  material *identity*, and banding in place does not change identity. Measured on a frozen scene,
  before and after: 522 and 522 in the map frame, 275 and 275 on the phone, 61 and 61 on the phone
  road frame. Rank contrast is unchanged within noise, because the ranks are read against grass that
  #185 had already banded.

  One correction this turned up in #185's own helper: three's **default** `customProgramCacheKey`
  returns `this.onBeforeCompile.toString()`, so a material with no key of its own is identified by
  the source of its hook. Read that *after* the band wrapper is installed and every banded material
  reports the same string -- one function literal, and `toString` cannot see what it closes over.
  `band()` takes the base key before it replaces anything, which is #155 again wearing a third hat.
- **A rim light** (#187). One more `DirectionalLight`, dim and cool against the sun, with no shadow
  map. It catches the far edge of a tree, a rock or a man and lifts them off the ground they stand
  on, which is a large part of why a stylised scene reads as having depth.

  **It is on the far side, and the ticket suggested the near one.** "Low behind the camera",
  (−14, 12, 30). Both were built and looked at: a light behind the camera brightens the faces
  *turned toward the lens*, so at 0.9 it lifts the whole frame slightly and separates nothing — the
  surfaces it helps are the ones already facing you. An edge needs the light behind the **subject**,
  grazing the faces turned away, so what the camera catches is the lip where they turn. Same light,
  same cost, opposite side: (−14, 9, −30).

  **Its colour comes from the sky**, which is what it physically is, so it needs one keyframe column
  (`rimI`) rather than two. At noon the sun is white and there is no warm/cool contrast to have; at
  dusk the sun is amber and the sky is blue, so the split the rim exists to make arrives exactly when
  it is wanted and composes with #194 for nothing. Under the blood moon the sky is red, so the rim is
  a **red** edge and the night keeps its one colour instead of growing a blue lip it should not have.

  **It stays outside the bands**, which is the trap #185 left. A rim that is itself quantised is just
  a second lit band on the far edge of everything. `RE_Direct_Physical` runs once per directional
  light and cannot tell them apart, so the light loop sets a flag on its way past and
  `UNROLLED_LOOP_INDEX == 0` is the sun — three sorts lights so shadow casters come first
  (`shadowCastingAndTexturingLightsFirst`), the sun is the only caster, and that holds in every mode
  including a phone, where the shadow *map* is off but `sun.castShadow` is still true. Measured by
  pointing the same elevation sweep at each light: the sun's response has **6** steps across 42
  samples and the rim's has **29** — a staircase and a ramp, out of one shader.

  **Draw calls unchanged**: 522 in the map frame, 275 on the phone, 61 on the phone road frame,
  before and after. A light is per-fragment and costs no calls. What it does cost is one more light
  per fragment over the whole frame, and ms/frame for that needs a real phone — the same measurement
  #193 is still open for.
- **The river, banded across the channel** (#188). The land's bands quantise the **light** — `dotNL`,
  a cosine. A river is flat and level, so every fragment of it has the same `dotNL` and banding the
  light does nothing to it at all. What a river has instead is depth, and depth runs across the
  channel: `abs(uv.x - 0.5)` steps into a deep middle, a mid band and a pale shallow at each bank,
  with a light **foam line** where it meets the sand — two sines of different wavelength running
  opposite ways, so the line meanders instead of the whole river breathing in and out.

  **Its step constants are its own, and the ticket asked for the land's.** They are the same numbers
  meaning different things: 0.20 and 0.48 are thresholds on a cosine, and used across a channel they
  would put the deep water in the middle fifth and pale shallows over the other four — a dark stripe
  in a wide light river, which is backwards. A river is deep in the middle.

  The raw `uv` is carried as a varying rather than read from `vMapUv`, which is the same attribute
  **after** the texture transform — and that transform is exactly what scrolls this material every
  frame. Reading it there would slide the bands downstream with the highlights and the channel would
  appear to move sideways. The map itself is kept: the banded colour is multiplied by its luminance,
  so the scrolling streaks still run over the top of the bands rather than being painted out.

  It stays opaque, so it sorts against nothing, and the crossing stays legible — checked with the
  bridge built and with only its ghost, from the King's own camera on the east trail. Draw calls
  unchanged: 522 in the map frame either way.
- **One post pass: a vignette and a light grade** (#189, `src/post.js`). It is what makes a frame
  look shot rather than rendered, and its shape is decided by the **toggle**, not by the effect.

  The pass has to go off at the reduced quality tier and come back when the controller restores.
  The obvious structure — composer when on, `renderer.render` when off — cannot do that cheaply:
  three picks a material's tone-mapping function by whether the render target is the canvas
  (`currentRenderTarget === null ? toneMapping : NoToneMapping`), so switching paths changes the
  program every material compiles with, and the toggle costs a full recompile of the scene at the
  moment the device is already behind. That is the stall #193 refused for shadows. So **the composer
  is always the path when there is one, and only `grade.enabled` moves**. Safe mode gets no composer,
  decided once at load.

  **Tone mapping happens exactly once**, in `OutputPass`. The scene renders into a target, so three
  gives every material `NoToneMapping` by itself and the grade runs on linear light, which is where a
  grade belongs. `post-once` proves it with a ratio rather than an equality, because an equality does
  not work here: this frame is 13,000 grass blades, so almost every pixel is an edge and an HDR
  target differs from an 8-bit canvas at every one. The composer is compared against a direct ACES
  render *and* against one with tone mapping off — **0.38 away from the first, 27.18 from the
  second**. It also asserts the target kept its 4× MSAA and that toggling the grade moves the program
  count by zero.

  Both constants sit under what looks right in a still: a vignette is a thing you stop noticing and
  then cannot unsee, and this frame already has a HUD in three of its corners.
- **Warm near, cool far** (#196). Colour temperature keyed to distance from the camera: a warm bias on
  the ground at the King's feet sliding to a cool one across the field, composed **on top of** the fog
  rather than replacing it. The camera is close and nearly top-down, so there is no perspective
  convergence and almost never a horizon -- what is left to say "behind" rather than "beside" is value
  and hue, and #185 spent the value budget on bands.

  **It lives in the post pass and not in the material hook**, which the ticket left open. The deciding
  argument is who it has to reach: enemies are seen mostly at distance and they are **not** banded --
  characters are out of #184's scope -- so a depth tint in the hook would separate the near grass from
  the far grass and leave the raiders standing on it untouched. In the pass it is one place, it reaches
  everything the camera renders, and it costs no second program. `from` 14 and `to` 52 are the band, in
  world units: this camera sits about 21 units from the King and the ground runs out around 55.

  **The trap was which buffer holds the depth.** The composer's two targets are named the other way
  round from the way they read -- `writeBuffer` is `renderTarget1`, the target you passed in, and
  `readBuffer` is `renderTarget2`, a clone of it -- and `RenderPass` draws into `readBuffer`. So the
  scene's depth lands in the **clone's** depth texture, which `RenderTarget.copy` made as a separate
  object, and a uniform pinned to `target.depthTexture` samples something nothing ever rendered into.
  It comes back 0, `perspectiveDepthToViewZ` turns 0 into the near plane, and the whole screen gets
  `far = 0` -- the warm tint at every distance and no gradient at all. It looked plausible in a
  screenshot and the measurement is what caught it: ground at 17 units and ground at 39 both shifted
  14 toward warm. The uniform is taken from `readBuffer` every frame now, which follows the picture
  instead of guessing at it. Depth is linearised before it is used, because a tint keyed to raw depth
  puts the entire change in the first few units in front of the lens.

  **What it does to the frame.** Ground sampled along the view ray, as blue-minus-red against the same
  frame with the effect off, desktop road frame: **-12 at 17 units, -18 at 21, -8 at 25, -4 at 32, 0 at
  39**; the phone frame sees further and crosses over, **-10, -8, -3, -1, +4, +8 out to 49 units**.
  Monotonic, warm to cool, and it composes with the fog rather than fighting it.

  **What it costs the ranks**, which is the thing the ticket said to re-measure. Four ranks stood in
  open grass at (-33, 41), read through the real render path with the grade on against the identical
  frame with it off. At noon: Bandit **2.86 -> 3.01**, Raider **4.50 -> 4.26**, Marauder
  **6.95 -> 7.01**, Warlord **12.05 -> 11.36**. Across #194's four dusk phases:

  | | Bandit | Raider | Marauder | Warlord |
  | --- | --- | --- | --- | --- |
  | 0.52 | 2.39 → 2.39 | 2.73 → 2.50 | 5.09 → 4.86 | 7.31 → 6.64 |
  | 0.58 | 1.31 → 1.28 | 1.69 → 1.52 | 3.01 → 2.86 | 4.45 → 3.97 |
  | 0.62 | 1.27 → 1.23 | 1.59 → 1.43 | 2.65 → 2.51 | 3.97 → 3.53 |
  | 0.66 | 1.20 → 1.16 | 1.51 → 1.37 | 2.21 → 2.11 | 3.24 → 2.89 |

  Every rank loses a little at dusk and the Warlord loses the most, from the most headroom. The
  **order holds at every phase**, before and after, which is what a player reads. The worst number on
  the page is the Bandit at 1.16 against dusk grass, and he was at 1.20 before this and 1.3 before
  #194 -- that one is his tunic, and characters are out of #184's scope.

  **These absolutes are not #194's table and should not be laid against it.** They are this ticket's
  own instrument at a named spot, read through the post pass, on grass #185 has since banded; what is
  comparable is each pair, because both halves of it are the same pixels in the same frame with one
  uniform moved. Two earlier versions of the harness proved why that matters: one stood the Bandit
  against the castle's red brick and one put half the row in the wall's shadow, and both reported a
  ladder with the Warlord -- a near-black tunic -- **below** the Marauder, which cannot happen on
  grass. The open-grass spot is searched for now and the frame is the judge.

  **Budgets hold.** Road 227-251 calls and 821-833k triangles, the stable 317-358 and 796-965k, the
  phone road 180-199 and 749-770k, across all four phases -- under 400 and under 1M everywhere. Safe
  mode builds no composer, so the effect is off rather than broken: all three arms of the measurement
  come back identical to the digit and every delta is 0.00.

  One harness note, because it produced a wrong table before it produced a right one: `setDayPhase`
  ends by calling `updateDaylight`, so stubbing `updateDaylight` to stop the frame loop repainting and
  *then* asking for a phase sets `dayPhase` and changes no light at all. Four different phases came
  back as four copies of the first. The three measurement arms also have to run inside **one**
  `page.evaluate` -- run as three, they disagreed in safe mode, where no post pass exists and all
  three are literally the same call.
- **Grass, and where it is not.** 13,000 instanced tufts in one draw call. What is kept bare is the
  **citadel** -- the tight first ring the Keep and its three service buildings stand in, which is
  paved and walked over all game. Everything beyond it is countryside, including the ground inside the
  later walls, because those enclose farmland and homes rather than a city. The mats are kept clear
  too: `spend.padSize` is 3.6 across and grass is held 2.6 off, so nothing grows through a price.
  Grass has its own margins elsewhere as well, tighter than a tree's: it grows into a road's verge
  (#180) and up to a wheat field's fence, because a bald border round every farm is the one thing in
  an open field you cannot help looking at.

  **And it parts around feet** (#200). `swayMaterial` already did the hard part: `bend =
  max(transformed.y, 0.0)` is the height up the blade, which is why the material is called
  **rooted** — the tip moves and the root stays planted. Feet reuse it, so four world positions push
  a clump's tip away and the grass closes again behind you.

  **Push, not bend.** Pushing the tip away reads as grass being shouldered aside. Bending it *down*
  reads as trampling — and trampling wants to spring back, which needs state a vertex shader does not
  have. This recovers on distance alone: walk away and the blade is upright.

  **Four feet, and which four is the only real decision**, because the loop costs the same whether a
  slot is used or not. The King takes the first; Wren the second when she is out; the last two go to
  whoever is nearest **him** rather than nearest the camera, because a raider closing on the King is
  the thing in frame. Unused slots are parked far away instead of counted — a uniform count would make
  the loop dynamic.

  **The tufts opt in and the wheat does not.** A field is walked past; the lawn he is standing on is
  walked through. The cache key moves with the opt-in (`sway-tinted-rooted-feet`) or a wheat material
  and a grass one compile to matching defines with different hooks, which is #155 a fourth time.

  **The shove goes back into the clump's own frame, and that bug would have survived a screenshot.**
  `shove` is a world direction and `transformed` is local — and every tuft is planted with a *random*
  Y rotation. Adding a world vector to a local position makes each clump lean somewhere of its own
  choosing: it still looks like the grass is moving, and a pixel diff still goes green. XZ scale is
  uniform per clump, so the inverse is the transpose over the scale squared — one `inversesqrt`, no
  `normalize`, and the world displacement is the same whatever width the clump was rolled at.

  **The numbers were pinned by measuring, and the obvious measurement is the wrong one.** Mean pixel
  change over a disc round his feet is diluted by whatever bare ground is in the disc, so what was
  measured is the **share of nearby pixels that moved by more than 8/255**, at two spots in open
  grass:

  | radius | push | visibly moved |
  | ---: | ---: | --- |
  | 1.1 | 0.5 | 9.1% · 9.1% |
  | **1.8** | **0.9** | **14.3% · 12.7%** |
  | 2.5 | 0.9 | 15.4% · 14.6% |

  2.5 buys almost nothing over 1.8 and parts grass two and a half metres from a man, which reads as a
  force field rather than as legs. Shipped at **1.8 and 0.8** — about a stride and the swing of a leg,
  and a tip that moves about six times what the wind moves it.

  **It costs no draw call, no triangle and no program**: 172 → 172 calls and 48 → 48 programs on the
  desktop frame, 140 → 140 and 48 → 48 on the phone, toggling the uniform inside a single frame. The
  A/B is localised exactly where it should be — **0.717 mean change inside two units of his feet and
  0.000 across the rest of the field** — which is the test that matters when 13,000 blades make almost
  every pixel an edge.

  **And it follows the King** (#191). The tufts used to be scattered once over the whole 190 x 190
  map, one every 1.6 units -- and the camera shows about 35 units of ground, so the player saw under
  2% of them at a time and the rest were submitted every frame and never looked at. That is why an
  open field read as scattered objects with bare ground between them rather than as a surface, and
  raising the count cannot fix it: at 21 triangles a clump, the density that closes the gaps map-wide
  is several times the triangle budget and nearly all of it is spent on ground nobody sees. The same
  13,000 live in a **window of 8-unit cells** around him instead (`CFG.ground`), 13 cells either way,
  and the far field has none. Same count, same draw call, **about six times the density** where he is
  standing -- 11,600 tufts inside 52 units against 360 in the frame before.

  Three things make it hold together. A cell is placed from an rng **seeded by its own coordinates**,
  so walking away and back finds the same field (checked: 249 tufts within six units of him, identical
  after crossing the map four times); the result is cached, which is sound because `grassFree` is a
  pure function of a point -- the roads all exist from the first frame whether or not they have been
  revealed. Cells are written **nearest first** and each takes a fraction of what it holds, tapering
  from full inside 28 units to a tenth at 52, so there is no line where grass stops; the taper lands
  behind the fog, which starts 42 units from a camera that sits 13 to 18 behind him. And writing
  nearest first hands adaptive quality (#168) the right thing for free: `count` truncates the buffer,
  so thinning takes the **farthest** cells rather than a random scatter -- the farthest drawn tuft
  goes 64.6, 41.7, 35.7, 27.3 units across the four tiers and the ground under his feet keeps its
  grass at every one of them.

  It costs less than it replaced: **790-836k triangles** at the King's camera on the east road against
  885-929k before, and 230-234 draw calls against 238-240. Filling a cell the first time is the only
  work, three cells a frame, so walking into new country is 1.5 ms once and 0.1 ms a crossing after
  that. Clover, flowers and the field stones ride in the same window. The one thing it could break is
  **coins in grass** -- they rest at about y 0.25 and a blade stands 0.42 to 0.74 -- so they were
  checked on the phone frame with 26 dropped in open field, and they read.

  `?view=map` widens the window to 12 cells instead, which covers the board: the same budget over the
  whole map is what a map should show anyway -- everything, thinner.

  **Coverage is three layers and the models are the top one.** 9000 tufts on the old flat ground was
  already close to a reference's density and still read as a lawn with things stuck in it, which is
  the useful thing this taught: the ground BETWEEN the grass is what decides whether a field looks
  grown. So the ground texture carries most of it -- 512 rather than 256 at the same 16x repeat, so
  the tile is still 11.9 world units with twice the detail in it, mottled at the scale of metres,
  with earth showing faintly through and a fine speckle pass that mips away at distance. It is
  `anisotropy: 4`, because the far half of every frame is ground seen at 45 degrees and without it the
  speckle turns to porridge fifteen units out.

  **And earth with edges on top of it** (#192). Everything in that tile is a low-alpha ellipse with a
  gradual edge, so the ground had tone but no forms -- it read as a smudge, and wherever the grass does
  not cover there was nothing to look at. A second texture carries the shapes: patches of dry worn
  ground and turned earth with a faceted outline and a darker rim, at the scale of a few metres. It is
  its OWN texture because it has to be -- the ground tile is 11.9 units and a frame holds about fifty,
  so a shape big enough to read as a patch would be a dozen copies of itself on screen, which is the
  trap #162 named and the reason the earth passes in the tile are kept faint. This one tiles every 64
  units, and a second sample at 111 mixed by the same 135-unit mask keeps even the board's map view
  from coming out as a plaid.

  Two things about it are worth knowing before touching it. It is **mixed in, not multiplied**: a
  multiply can only take a colour toward black, so warm tints over green ground gave darker green --
  blotches of shadow rather than earth -- and no choice of tint fixes that, because raising red is
  exactly what a multiplier cannot do. The texel is the colour the earth should be, and the ground's
  own luminance is carried into it so the mottling, the speckle and the daylight tint still show
  through a patch. And the GLSL variable is called `earth` because **`patch` is a reserved word** in
  GLSL ES 3.00: the fragment shader silently failed to compile, the ground rendered as flat green with
  no texture at all, and there was no page error -- three's own message goes to the console, where
  nothing was listening. A harness that drives this game should listen to `console` as well as
  `pageerror`. The tile also has **grain** now: the same speckle sizes with a straight edge, little
  faceted chips at a third of a unit, which is the scale the eye reads as material rather than shapes.

  It costs one 512 texture and two more samples on the ground, which is one draw of a flat quad: 230
  to 233 draw calls at the King's camera on the east road, against 230 to 234 without it.

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

  It costs about 240k triangles in a scene measuring 830k -- still the largest single instanced cost in
  the world, next to 28 characters at 8,576 each for 240k (#52). `TUFTS` in `world.js` is the dial,
  and `CFG.ground` is where the window it is spread over lives.
- **The roads are dirt tracks now, not ribbons** (#180). A road used to be three flat ribbons stacked
  on each other with two thin rut lines -- six draw calls, one colour each, a hard ruled edge against a
  hard ruled line of grass, and the ribbons' own colour attribute never read, because `mat()` does not
  turn vertex colours on. It was the one thing in a screenshot that read as a placeholder. Each road is
  one mesh now, nine vertices across every sample and coloured per vertex: from the verge in, a verge
  that fades to alpha 0 into whatever ground is there (no green to match, and it stays matched when
  the daylight tints the ground), a darker seam where dirt meets grass, the edge, a rut, the crown
  between the ruts, and the same again. Along it the two edges wander on their own (the old wobble
  was mirrored, so the ribbon snaked at a constant width), the ruts wander, sit unevenly and fade out
  in stretches, and the tone drifts between light dirt, dark dirt and the odd patch of mud, with a
  different phase per lane so a patch is a patch and not a band. Grass creeps into the verge: a tuft is
  placed by how far in it would stand, sure of a place a unit out and thinning to nothing 0.3 inside
  the edge, and the flowers come with the tufts.

  **Three kinds of road, read off where a sample is.** Inside the settlement's outer plot the road is
  the castle road: full width, a firm edge, ruts, chips of stone on the surface. Past it the same road
  is a trail: narrower, a ragged verge, more mud, ruts fading, and a few tufts growing in it. And a
  **path** runs from every home's door to the nearest road, narrow and worn dark down the middle with
  no ruts at all, grown out from the house the way a road grows out from a gate; it goes under the
  road rather than meeting it, so the join is the road's own edge. The roads themselves are revealed
  by `buildWall` now rather than by the mat that bought the wall, which is also what fixed a restored
  run coming back with walls and no roads, and the opening village having none at all.

  Measured from the King's camera on the east road: 240 draw calls against 241 before and 928k
  triangles against 922k, on the phone frame 168 against 172; the map from above 608 against 588,
  inside a frame-to-frame swing of 47 from pop-ins and smoke. `?view=road` frames it on the board.
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
  Since #239 a sound comes from where it happened: a wall hit, an arrow landing, a raider dying,
  the alarm, the howl and Wren's voice each go through a `StereoPannerNode` set from the sound's
  offset east or west of the King, over `CFG.audio.panSpread` units to reach hard left or right.
  A cue at the King has no node made for it. The check `sounds-have-a-side` hits a real wall on
  each side of the ring and reads the direction back.
  Wren's release, a dig and a relic have sounds of their own (#238): the release is a low fifth
  swelling for 0.4s into a chime, the only cue in the game that swells rather than strikes; a dig
  swing is a knock and a scrape that rise as the hole deepens; a relic is four notes up. Each had
  been borrowing a neighbour (the warhorn, the stone chip, the raid horn), and
  `cues-do-not-converge` renders every cue offline and holds the new ones at least 0.18 from the
  rest on an envelope-and-spectrum scale, because the first dig written measured 0.10 from a raider
  dying. After dark the lead line also rests every other bar, so the night has space in it.

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

Those are the **noon** figures, and they are the best the ladder ever reads. At dusk every one of them
roughly halves, because the grass darkens and contrast is a luminance ratio -- at phase 0.58 the
Bandit is 1.29 against the grass and the Warlord 3.27. That is not new and #194 did not cause it; see
**Dusk shifts colour rather than draining it** for the dusk table and what moving the light costs
each rank.

## Counters run, and the interface answers (#197)

Two things were missing from a catalogue that was otherwise built. The coin already flew to the
counter, and then the counter snapped — **the arc was ending in nothing**, which is worse than not
having the arc, because the eye has been told where to look. And there are 58 click handlers in
`src/`; `hud.js` never called `audio.js` once, so every button in the game was silent against a world
that is not.

**The tally is its own thing, not a line in `Hud.set`.** That method runs every frame and
dirty-checks everything it writes, and an animation is a value that changes every frame by design —
so `Tally` holds its own state, writes **only** on the frame the displayed integer actually changes,
and stops. It runs on **wall time**, not the game's `dt`: a counter is interface, it should take the
same third of a second at 12fps as at 60, `dt` is capped at 0.05, and the end-of-run box has to count
up on a screen where the frame loop has stopped entirely. One `requestAnimationFrame` runs while
anything is moving and **none at all when nothing is**.

`min` is why it still feels instant. A coin at a time is +1, and a one-step tally is a snap with
machinery around it, so anything under the threshold lands immediately. What tallies is an armful
from a gleaner, a purchase coming off the stack, a wave arriving. Where they are: coins and the bag
(0.34s and 0.28s), the raid count (**0.2s**, because that number is tactical — it is what you read to
decide whether to keep fighting, and one that is wrong for a third of a second there is one that
lied), and the end-of-run box at 0.9s, which is read once with nothing waiting on it. Those four are
zeroed before the panel is shown: the elements are static markup still holding the last run's
figures, and tallying without the reset would run from a previous score to this one and report a
delta nobody asked about.

**Two sounds, not fifty-eight**, and the line between them is whether the press *commits* to
something: `tap` is a press, `confirm` is a choice taken — a reward card, or a panel's one gold
action. A distinct noise per button is how an interface becomes noisy, and worse, it teaches
nothing, because a sound only means something while it is rare. Both sit well under the world's
gains (0.05 and 0.07 against `hit`'s 0.22), because the UI is tapped far more often than the world is
hit and neither may ever compete with the alarm. The tap slides 620 → 380 rather than holding a
pitch: at this rate the ear starts predicting the next one, and a sound you can predict stops being
heard.

**One listener, not fifty-eight.** It is delegated at the document in the **capture** phase, for two
reasons. The horn and banner buttons call `stopPropagation` on pointerdown so the canvas under them
does not start walking the King, and a bubbling listener would never hear either of them; and capture
means a button added anywhere later is audible without anybody remembering to wire it — which is the
failure mode that left 58 handlers silent in the first place. `data-sfx="off"` opts an element out,
and those two use it, because they answer with a horn and a banner. It is `pointerdown` rather than
`click`, because the sound belongs with the finger going down — and because that is the gesture iOS
unlocks audio inside. The first press of a page load is silent and cannot not be: it is the gesture
that creates the context. Everything routes through `tone`'s default bus, which is what makes both
obey `setSfxVolume`, `setMuted` and the settings sheet without a line of their own.

**`hud-quiet` is the guard** (`npm run check`). The house rule had nothing enforcing it, and #197 put
an animation inside the one path where breaking it is invisible: a tally that forgot to stop would
look completely normal and cost a DOM write sixty times a second on the device that can least afford
one. The check **replays** `set`, `setLoad` and `setRaid` with the arguments the game last gave them
and asserts the HUD writes nothing — replaying rather than watching idle frames, which would pass
trivially on a frozen game and flake on a running one when the wave clock legitimately ticks. Then it
drives the curve with synthetic timestamps and asserts it starts where it was, is monotonic, has
real steps rather than one, lands exactly on the target, stops, and that a +1 does not animate at all. Driven rather than waited for, because a SwiftShader
frame is about a second and a 0.34s animation gets exactly one of them.

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

**A mat sits at the door** (#202). Every building in `models.js` puts its door on the **+z** face —
the Keep's at z 1.72, the Barracks' at 1.53, the hut's at `D / 2` — because the camera looks north
over the King's shoulder, so +z is the face you see. `makeBarracks` says so in its own comment. Three
of the five fixed mats already sat square on that axis; the Keep's sat at (−5, 5) against a building
at (0, 0), which is diagonally off a corner touching no face at all, and the Barracks' was 4 units
off its centre line.

**The bridges were the interesting half.** Their mats were constants in config while the bridge is
placed where the road *actually* meets the river — `world.crossings`, sampled off the road curve — so
the two were positioned by unrelated mechanisms and agreed only by luck. Measured: the crossings are
at (1.17, 50.58) and (54.32, 2.96) and the mats were typed at (6, 44) and (47, 7). **Eight units
out**, each with one coordinate roughly right and the other wrong. The tell had been on screen the
whole time and nobody had put it together — the *ghost preview* of the bridge has used `crossingFor`
since it was written, so a translucent bridge stood in the river while its own mat sat eight units
away on the bank.

So the mat is **derived**, not re-typed, for the reason #139 gives about tower mats: a better constant
is still a constant and it drifts the next time a road moves. `bridgeMatPos` steps back from the
crossing toward the village — the near bank, on the road, clear of the water by half a mat — onto a
**fresh `pos` array**, never `CFG`'s own, because mutating that would move the mat for every future
run in the session. Off the road's centre line: **5.47 → 0** and **3.75 → 0**.

`mats-at-doors` in `npm run check` holds both halves. It exempts **placeable** pads, and finding that
out is what stopped it being wrong: the first version asserted the rule over every pad with a
`structure` and went red on thirteen watchtowers and three villager homes, all of which carry
`place: true`. For those the player chooses the spot, the config position is a proposal and the mat is
derived from where the building actually landed — so a config coordinate is not the geometry, and
asserting against it measures nothing.

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

Four mats change what you can *do* rather than what stands in the village: Train Archers, the
Warhorse, Train the Horse and Royal Armour -- the pads carrying an `effect` that is the player's
rather than the village's. Buying one stops the game and says where you have got to, and waits to be dismissed:
*Training 3 of 5*, what an arrow hits for now against an untrained archer's, how many are left on the
mat and what the next one costs (`capabilityGains` in [src/game-view.js](src/game-view.js)). It says
the state and not the delta, because a per-level percentage is a true sentence that answers nothing on
the third buy. Both places the game used to say it missed: the mat's own `desc` is behind a tap on
the chip, and the toast ran for 3.2 seconds over a game that kept playing, at the one moment the
player was least likely to be standing still and reading. It pauses regardless of what the raid is
doing, the way a Keep level does -- it can happen nine times in a whole run, and every one of them is
the player standing still on a mat by his own choice.

## Coins, ranks and towers

- **Two things in the Display tab that can be turned off** (#216). The **pickup ring** is a hiding
  and only a hiding: #103 made the drawn circle and the collection reach one number, `ringRadius`, so
  a setting that touched the radius would be a balance change in a display setting's clothes. Proved
  with it hidden -- radius still 3.7, a coin at 3.4 still lifts, one at 5.2 does not. Worth knowing
  while it is off: the ring grows with the Lodestone upgrades and is the only thing that shows a
  reach upgrade arriving.
  The **coin stack** is the bigger one, and it gates on `stackCount()` returning 0 rather than on
  three separate branches. All three readers then do the right thing for nothing: `updateStack` draws
  an empty instanced mesh, and the coin a mat is paid with launches from `stackBase()` -- just clear
  of the crown -- instead of from the top of a stack that is not there. **The second animation the
  ticket expected to need was not needed**; the coins still pour into the mat, they just leave from
  his head. A picked-up coin instead takes the DOM flight wood already takes, with the coin counter
  on the end of it rather than the bag, which is the arc #197's `Tally` was written for: "the coin
  already flies to the counter, so the arc was ending in nothing." Measured both ways -- six coins in,
  six credited either way; stack on draws 6 and flies 0, stack off draws 0 and flies 6, all landing
  on `coin-cell`. What is lost while it is off is `COIN_TIER_COLORS`, the only place the coin tier is
  drawn as colour; that costs nothing while `coinTier()` returns only `'gold'`.
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

## Raids mode, in progress (#254-#261)

A second mode is being built beside the story edition, behind `?mode=raids`: an endless run across an
overworld map of castles, allies earned per castle and spent at bosses, the legacy tree carried over,
no story. The design, the owner's decisions and the eight tickets are in `docs/raids-spec.md`. The
story edition is untouched, and its last build before the overhaul is the branch
`release/7-before-overhaul`.

**R1 (#254) is the part that decides a run's shape, and it is pure code with no drawing.** `src/raids/`
holds the run state (`run.js`, a seed and a path, JSON, the only thing that will be saved), the map
(`map.js`: five castle layers then a boss, forks of 2-3, one starter castle to open a run) and the
curve (`curve.js`). Numbers are in `CFG.raids`. `npm run raids:sim` plays 2,000 runs per player type
through the real modules:

| player | reaches the first boss at, median | p25 to p90 |
| --- | --- | --- |
| takes any lit node | 6:25 | 5:51 to 7:39 |
| takes the safest | 5:45 | 4:51 to 6:57 |
| takes the biggest multiplier | 7:18 | 6:41 to 7:56 |

That is timing over the map's shape and the castle lengths R3 still has to hit. The sim's survival
figures run on a placeholder model until R7 fits one to real castles, and it says so when it prints.
Raw map draws kept all five rules 29% of the time at first; repairing same-kind forks and missing
musters at draw time, fixing an orphaned-link bug and letting the starter lead to every node of the
first fork brought that to 96%, 1.04 draws a region. `raids-map-rules`, `raids-run-round-trips` and
`raids-first-boss-on-time` hold it, and the first of those rejects four regions broken on purpose
before it checks the real ones.

**R2 (#255) draws the map, and R3 (#256) stands a castle on it.** Play in `?mode=raids` opens the map
(`src/overworld.js`): a region climbing a portrait screen, the starter at the bottom and the boss at the
top, the nodes the King can ride to lit and pulsing, each carrying its score multiplier. A tap raises
a card — kind, modifiers, multiplier, reward, one Ride button; an unlit node answers nothing. The map is
DOM over a frozen game: `update()` returns before it simulates or draws, so the map costs **no draw
calls**, which is the breather a phone gets between castles.

A castle is not a new world — `buildWorld` runs once a page load — but the tier-0 village stood on the
same plot (`src/game-raids.js`) with its economy switched off: walls, Keep, homes and the spec's crewed
towers; no mats, no trade post, no camps or caches, no mining (decision 1). Wren is in the Keep and off
the stage, so a standing Keep with her in it is what raiders go for, with no change to how one picks a
target. What a castle holds is `castleSpec(runSeed, node)` in `src/raids/castle.js`, a pure function of
the node: raid times, sizes and mix, rank, Keep level, time of day, towers. Clearing its raids fires
`castle:cleared` and the map comes back with the run a castle on; the King falling fires `castle:fell`
in place of the story's `gameOver`, and the map offers Ride again. `src/raids/director.js` is the glue:
map, castle, map. `?view=overworld` and `?view=castle` frame both on the board.

Every gate is `this.mode === 'raids'`, which only `startCastle` sets, so with no `?mode` the story runs
exactly as it did. `overworld-rides` (no draw in 30 frames of map, 44 px taps, one lit starter, the card
and Ride), `castle-stands-and-resolves` (the castle whole and its economy absent, a clear and a fall)
and `castles-do-not-leak` hold it — twenty-five castles in a row hold geometries at about 200 (198 to 199
in the last run) and textures at 36 between castle 5 and castle 25, with no castle above 219 draw calls; the same run with a teardown
that frees nothing reaches 2,617 geometries. The score on the map is an interim `(kills × 10 + coin)
× multiplier` until R6 builds the real one, and a muster passes straight through until R4 builds its
shop.

**R4 (#257) gives a run its men.** The roster is `src/raids/allies.js`, pure like the rest of
`src/raids/`: a clear earns 2–4 recruits (one more for walls still standing, one more for a quick
clear, one more at a fortress), the roster caps at 24, a castle takes up to eight, and **a man who
falls in one is gone for the run** (decision 2). A new run always starts with nobody.

- **Who goes in** is a row per kind on the ride card, a step either side, starting on the last
  castle's choice so nobody is asked twice.
- **The reward** after each clear is one tap of three: men, a card, or coin for the war chest. The
  one the node's map card promised pays more (two more men, double coin, or two cards to choose
  from). Cards come through `pickOffer` and its seen-rotation (#235), minus the eight that read a
  mat, a mine, a dawn or a Wren being carried off (`CFG.raids.allies.deckSkip`), and they are
  re-applied to every castle after `reset()`.
- **The muster** sells a swordsman (16), an archer (20), a card (45) and — the first time a run
  reaches one — Wren (60). No repairs. The field's coin is swept into the chest at every clear, which
  measured 45–90 a region-1 castle, and the prices are set from that.
- **Wren** (decision 4) is one unit on the same roster, offered once a run at a muster or a boss
  reward. Brought into a castle, she is on the field at the King's side with her button up; her meter
  fills with raiders near her, day or night, and her release holds them as it does in the story
  (#234). The seize meter she already had is her health here: held long enough, she is taken and gone
  for the run.

`raids-roster-rules` plays 300 runs through the roster rules (never over the cap, nobody twice,
nobody back from the dead, Wren once) after refusing four rosters broken on purpose.
`allies-five-castles` and `wren-rides-and-releases` drive the real thing. `?view=deploy`,
`?view=reward` and `?view=muster` frame the three screens on the board.

**R5 (#258) is the boss, and the decision the design is built on.** A boss's ride card has a **Call
to Arms** row above the deploy: commit any number of men (not Wren). When the chief is on the field
they come out of the gate nearest him at a run, go for his guard, and the first to reach it lands a
blow on every raider round him — harder for more men (`CFG.raids.boss`). Then they fight as the army
does, and **all of them are spent for the run**, alive or not. **Commit nobody and the boss scores
×2.** A boss pays an ability rather than the usual three, with Wren beside it if she has not been
offered yet.

**The ability slot** is the third button, above the banner beside pause rather than a fourth along the
bottom (#240's measurement). One ability at a time, filled after a boss or bought at a muster (50),
**once a castle**: Rain of Arrows, Hold Fast, Sally Forth, Mason's Call (`src/raids/abilities.js`).

Whether committing is a choice at all is measured, not assumed. `npm run raids:sim` now plays a commit
policy, and the charge's value in the placeholder survival model was swept for it: at 0.12 "always
commit" held 93% of bosses *and* out-scored "never commit", which makes the decision a formality. At
0.06 never commit scores 4% more and always commit holds 16 points more bosses (86% against 70%).
`raids-commit-is-a-choice` holds that shape and goes red at 0.12. `boss-call-to-arms` drives a boss
with nobody and with eight committed, and `ability-once-a-castle` the third button, each red under its
sabotage. `?view=commit` and `?view=bossreward` are on the board.

## The first two minutes, measured and fixed (#244, #245, #246)

A retention pass drove a new player's first four minutes on the deployed build, three ways: a player
who never touches the screen, one who walks up to the picket and stands and shoots, and one who
kites. What it found, with the toast lane instrumented to log what it **showed** rather than what
was queued:

| | before |
| --- | --- |
| the notice lane, 30 s to 106 s | 24 wall and gate notices, one after another |
| "Go after them" on screen | about 70 s after she was taken |
| standing still at the picket | dead in 7.7 s, "The King Has Fallen" at 55 s of game time |
| kiting at the picket | freed her in 40 s, never touched |
| doing nothing after the hand-off | four minutes on an empty plot with an arrow; the clock is held while she is captive, so nothing ever comes |

Three changes, one per ticket, each with a check that drives the real run from Play (`playFresh`
in `tools/checks/cheap.mjs` -- `?tour` holds the morning for ever and these need it to end):

- **The lane has an urgent notice (#244).** `toast(..., urgent)` replaces the queue and whatever
  page is up and shows now; the prologue's three instructions use it, nothing else does. The fall of
  the village breaks its walls quietly, and the opening's one line is the message. A repeat anywhere
  in the queue is merged, not only against the page on screen. The collectors' ranks are not
  announced in the prologue ("Warlords have arrived!" in minute one was noise); a raid announces them.
  `rescue-line-on-time`: at most one wall notice during the fall, and both instructions within a
  second of the moments they describe.
- **The guards' blows are a share at the picket (#245).** `CFG.rescue.kingDamage`, in the prologue
  only, with the table of shares tried beside it: 0.2 still lost to the captain, 0.12 frees her at
  about a third health. The first blow says the one thing nothing had said -- *they are slower than
  you, keep moving*. `picket-is-survivable` drives the standing bot and requires it to win, and to be
  hurt.
- **The first morning is a whole one (#247).** `rescue.firstRaid` is the day's length, so the clock
  reads dawn at the rescue and the countdown is up; the first raid is `waves.firstKnights` (four) by
  name rather than the night formula's six. `first-morning-is-full` reads the config back and
  `first-raid-after-a-day` drives the rescue and times the raid.
- **The village falls in order (#248).** `fallOfTheVillage` gives each wall, tower and house a moment
  by its distance from the riders' road and `updateFalling` lets it go over `opening.fallOver` (2.1 s)
  with a knock, chips and rubble, under `audio.fall`'s rumble. It was one frame. `village-falls-in-order`
  reads `fellAt` for the span and the direction.
- **The rescue offers a card (#252).** `rescue.offersCard`: `freeQueen` queues level 0, which
  `showOffer` heads "Wren is home" with no number and no gains. The first offer used to be the second
  or third night. `rescue-offers-a-card` drives it.
- **The funnel (#251).** `markFunnel` in `report.js` counts Play, the first move, the rescue, the
  Keep and the first night held, plus the days with a session, in localStorage and nowhere else; the
  black box carries `firstInput`, `rescued` and `picketDeaths` per run, and the bug report prints both
  (`?view=report`). `funnel-counts-the-first-run` drives a fresh profile through the first three.
- **An objective strip while she is held (#250).** `hud.setObjective` is one line above the notice
  stack -- *Go after them · north · 38 paces* while she is carried, *Take her back* once she is set
  down -- written every frame and dirty-checked to the pace. It does not queue, does not fade, and
  clears on `freeQueen`. `objective-strip-while-held` drives the snatch and reads it.
- **One intro card (#249), and the buttons taught when they appear.** Five cards were about 150
  words before the first frame, three of them about verbs minutes away, one naming keys to a thumb.
  The horn and banner get one line the first time they show (`verbsSaid`); a single card has no Skip.
  The tableau's "Wren is inside the Keep" line, which fired at t = 0 a second before "Wren walks
  with you", is quiet during the prologue.
- **The first word of a notice is instant (#253).** Every letter used to start at opacity 0 on its own
  delay, so a page came up as a labelled empty box for its first few hundred milliseconds.
- **A stall gets a nudge and a fall gets a restart (#246).** Outside the notice radius for
  `nudgeAfter` she calls out (voice, alarm arrow, one line), and again every `nudgeEvery`. A King who
  falls at the picket is not a run ending: the guards are posted again, he stands up on the plot at
  full health, and `gameOver('king')` is reachable only once `beginRun` has. `picket-restart-and-nudge`
  drives both, forcing the share to 1 for the fall.

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

**And a fourth, reported from a real run (#224): he can WIN the snatch.** The same hole
`opening.speed` closes, by the other route — that one stops a player walking away from the premise,
and nothing stopped him beating it. Archers bought during the calm cut the collecting party down
before it reached her, so `captureQueen` was never called; `snatched` was already true, so
`updateOpening` returned on its first line for the rest of the session. The village had already
fallen. A ruined kingdom, a Queen standing in it, every gate that reads `openingDone` shut, and
nothing left to do.

Reproduced before it was explained, on a build from before the fix: 140 seconds of game time after
the party was killed, `snatched` true, `captive` false, `openingDone` false, zero collectors on the
road. Nothing was coming.

The road sends another party now, 6 seconds later, and keeps sending them. **Size is what guarantees
it terminates, not rank** — rank runs out and men do not. `ranks` has four entries and the collectors
start at 2, so the first replacement is already at the top of the table and every one after it is the
same (measured: waves 1, 2 and 3 all report rank 3). Each party brings two more than the last: 5, 7,
9, 11. That also closes what would otherwise be a coin farm, since every rank carries `coins` and an
endless supply of identical parties arriving on a timer is an income.

Driven end to end in a real running game: three parties cut down, each replaced by a bigger one, and
the moment the player stops she is taken and `openingDone` is set. The uninterrupted opening is
unchanged — first party, `wave` 0, captive at frame 218.

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

## A gate fills its section

A gate is a wall section like any other and its span is the tier's `gateWidth` — 6.2 everywhere. But
`makeGate` took no length where `makeWallSegment` does, so it dropped a fixed **4.8**-wide structure
into a **6.2** hole: measured on all four citadel gates, section 6.2, mesh −2.4 … 2.4, **1.4 units of
nothing, 0.7 at each end** (#201).

**Worse than cosmetic.** `collideWalls` skips a gate entirely for anyone friendly, so the *passable*
opening was the whole 6.2 while the *visible* one was the 3.2 between the posts — probed at both ends
and the middle of all four gates, every sample walked through. And `roadWidth` is 4.2, so the road ran
visibly **through** the posts.

The posts sit at the section's own ends now, which fixes all three at once: no gap, the road passes
cleanly between them, and the opening is as wide as it looks. **Filling the ends with wall stubs was
rejected** — it makes the mismatch worse rather than better, because a friendly would then walk
through a piece of wall you can see. Dead space **1.4 → −0.08**, and the 8 cm is a decorative bracket
standing proud of its post, which is what a bracket does.

The check that exists to catch this had been told not to look. `wall-ring-unbroken` excused any hole
within **6 units** of a gate centre, and a gateway is 3.1 from its centre — so roughly three units of
ring either side of every gate could not be reported, and there was a hole in it the whole time. The
exclusion is `len / 2 + 0.6` now: the doorway, not its neighbourhood.

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

### The Stable, and the horses in its yard

The Warhorse used to be a bare mat outside the citadel's west gate: 25 coins once, `mountKing()`,
and the King's speed never moved again for thirty nights (#82). Now the horse comes from a
**Stable**, the way archers come from the Range, and the building keeps giving. It is a tier-1
building: the citadel was sized for three buildings and a paddock needs more ground than a hall, so
it stands in the west strip north of the west road, just outside the citadel's gate, where the
King's own line already lives (Royal Armour, the King's Guard). `tools/layout/check.mjs` has the
numbers, and the West Wall mat moved south of the road to make room. The block is laid out in
`CFG.stable` about its own centre -- building at the back, yard in front, because the camera looks
north and a yard behind the building would be hidden by it -- so `CFG.footprint.stable` is one
rectangle.

Three mats, in a chain. **Stable** (15) stands the block. **Warhorse** (20) is what the old mat did,
and it no longer appears for a King who is already riding. **Train the Horse** (15, +10 a level,
four levels) adds a tenth of the mounted speed per level, additive like Train Archers, so he rides at
7.5, then 10.5 after four -- measured over one game-second each, on open ground. `horseLevel` is
saved like `archerPower`, and the panel it opens says the state the way the archers' does: *You ride
at 10.5 instead of 7.5: 40% faster than an untrained horse*.

**And the army still follows, which is the thing the ticket was worried about.** `CFG.army.trail` was
tuned against a King at 7.5, and four levels of training put him at 10.5 — 40% past it. Driven at a
fixed dt on open ground, twelve soldiers, ten game-seconds of running flat out, distance from the
King:

| | King | median | p95 | worst | put back |
| --- | ---: | ---: | ---: | ---: | ---: |
| on foot | 5.6 | 6.52 | 7.98 | 7.98 | 0 |
| mounted, untrained | 7.5 | 7.90 | 9.34 | 9.38 | 0 |
| **mounted, trained ×4** | **10.5** | **12.13** | 16.63 | **18.29** | **0** |
| trained ×4, 24 soldiers | 10.5 | 12.08 | 16.85 | 18.33 | 0 |

The trail roughly doubles, and **nobody is ever put back**: `CFG.army.lost` is 26 and the worst single
soldier reaches 18.3, so the blink that reads worse than a lag never fires. Twice the army makes no
difference. `trail` did not need revisiting.

Those are with `holdGround` **off**, which is the pre-#116 behaviour and the only mode where the
question means anything — **the shipped army does not follow him at all**. It holds the grounds, so a
faster King stretches nothing: measured the same way with `holdGround: true`, the soldiers sit 41 to
55 units behind a departing King at every speed, with zero put back, because the distance that gets a
soldier picked up is measured against his **slot** and not against the King. #82's third done-when
was written before #116 landed, and #116 answered it by removing the coupling.

The yard (#117) is the block's front half, a post-and-rail paddock with a gap on the road side, and
**the horses standing in it are the capacity**. **A Horse for the Yard** (18, +6, four at most) puts
one there; **Mount a Swordsman** (8) sends the nearest one walking out through the gap to a swordsman
on the grounds. He rides at half again his speed, times the training, and instead of standing at his
post he rides the ring of them (#116), a lap in 34 seconds. When he falls he comes off where he sat
and goes over like anyone else, and the horse turns for home on its own -- the only word the game has
for a soldier dying somewhere the player is not looking -- walks in through the gap and is a yard
horse again. A horse is never spent, so the mat only ever shuts for a reason it can name: *The yard
is empty*, or *No swordsman to ride*.

Measured: the horse reached the first rider in 8.1 seconds from the yard; the rider does 17.85
against a footman's 8.5, trained four times; over ten quiet seconds he covered 35.8 units of the ring
while the posted footman beside him moved 0; killed, his horse was back in the yard 3.4 seconds
later. Save, reload, and it all comes back: the level, the three horses in the yard, the one still
riding. Four horses wandered the yard for fifteen seconds without one stepping outside the rails.

A riderless horse is `makeHorse()` -- the King's own from `makeKing()` with nobody on it -- and a
mounted soldier is that horse with the swordsman's rig seated where the King sits, on Idle rather
than Walk while the horse's legs carry him; the crowd renderer reads a rider's world matrix, so it
needs nothing new. The building is a built placeholder, `makeStable`, until the generated one lands;
the brief for it and the import steps are on #82. `?view=stable` frames the block on the board.

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

### She walks round him now, not through him (#181)

She follows a point `CFG.queen.follow` behind him, and that point used to be read straight off his
facing every frame. Fine until he turns round — and turning round is what the joystick is for. **The
point leapt to the other side of him, she took the straight line to it, and the straight line went
through the middle of him.** Closest approach **0.04 units** on a plain 180, many times a minute, for
about a fifth of a second each time. Over quickly, and exactly the kind of thing that reads as cheap
without anyone being able to say why.

**The anchor orbits him now.** It swings toward his facing at a capped rate (`followTurn`) instead of
teleporting to it, so the point it travels is a circle of radius `follow` around him — and what she
follows, she walks. Traced frame by frame through a 180: her radius holds at **1.90 the whole way**,
minimum and maximum, while her bearing sweeps 351° → 265° → 188° → 180°. She never approaches him at
all. A dead 180 has no short way round and the modulo would pick one arbitrarily, which is a coin
flip on a frame boundary and would visibly chatter, so it is broken toward the side she has already
drifted to.

**A separation pass was the obvious fix and is the wrong one.** One more line beside `collideWalls`
corrects *after* the fact, so what you see is her sliding out of his edge on a frame she was never
meant to be on — a bug that looks cheap turned into one that looks broken. Fixing the target means
there is nothing to correct.

There is still a `collideKing`, and it is for the **other** half, which no choice of target can help
with: he reverses *and walks*, so the place he is walking to is the place she is standing. Being
walked at is answered by getting out of the way, and that is what a person does. It leans 22° off
straight-out rather than sidestepping, and the ceiling there is arithmetic: she walks 7.2 and he
walks 5.6, so a step at angle *t* gains `7.2·cos(t) − 5.6` a second and goes **negative past 39°**.
The first version leaned about 76° — almost a pure sidestep, which looked right and measured 0.39,
because a sidestep does not open a gap at all while he is closing it.

**And the hold on its own was a trap, which measuring the opening is what caught.** The opening
leaves her in *front* of a standing King. The anchor is behind him, so the straight line to it goes
through him: the follow pulled her in, the hold pushed her out, and she sat **dead in front of him
at exactly the gap, bearing 0°, for twenty seconds of game time** and never got round. A check
asserting 0.8 passes that happily. It had turned "walks through him" into "stands in front of him for
ever" — the shape of fix this repo has been bitten by before, where the thing being protected is
what gets deleted.

So `steerRoundKing` aims at the **tangent** of his exclusion circle whenever he is inside the
corridor she is walking down — nearer than her target, and within the angle that circle subtends at
that range. She walks past him at arm's length and the anchor takes her round the back from there;
the opening now resolves in about a second. It is one `asin` and one `atan2`, and it is what "make
her go round" means in the general case. It does most of the work everywhere else too: the hold went
from firing on 7% of frames in ordinary play to **4%**, and random jinking from 0.83 to 0.94.

Measured at a fixed 0.05 dt with the renderer stubbed, closest approach in four scenes:

| | he spins 180 | spins and walks | ordinary play | random jinking |
| --- | --- | --- | --- | --- |
| **before** | 0.59 | 0.04 | 0.15 | 0.06 |
| **the anchor alone** | **1.90** | 0.21 | 0.43 | 0.27 |
| **all three** | **1.90** | **1.00** | **0.99** | **0.94** |

The hold fires on **4%** of frames in ordinary play and 8% under random jinking, which is a stress
scene rather than a description of anybody's thumb. `queen-visible` asserts they never come within
0.8 and is green again; it was right, and it was wrongly called a false positive twice before anybody
reproduced it.

**Every other follower still has the gap.** `updateArmy` moves soldiers to their own follow points
and nothing separates them from the King either — Wren is just the one who is always there, always
alone, and always looked at. `collideKing` is written to be reusable when that becomes a ticket.

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

## The spawn flourish leaked nine geometries, every time (#190)

Found by the churn harness, located to the line, and fixed.

**`makeSpawnFx` built a fresh `CircleGeometry` for its glow and a fresh `BoxGeometry` for each of
its eight sparks — nine new geometries per flourish, none ever disposed.** The rings and the column
had always shared one geometry each; these three did not, for no reason. `updateFx` takes the group
off the root when it expires and that is all it did, so every one of them stayed uploaded for the
rest of the run.

Measured through the game's own removal path — spawn a unit, remove it the way `game-units.js` does
with `disposeEntity`, settle two seconds, count:

| | before | after |
| --- | --- | --- |
| geometries left per unit | **9** | **0** |
| ten spawned and removed | 252 → 342 | 242 → 242 |
| churn `crowd` block | **+543.5/round** | **+3.5/round** |

**A spawn flourish plays constantly** — every recruit, every purchase, every villager, the dismount
(#217), the lanterns. It is the likeliest thing behind a phone's geometry count going 441 → 716 →
2044 across one run.

The fix is at the source rather than in the cleanup: the glow and spark geometries are module-level
constants now, identical every time as they always were, so **the leak cannot happen again by
construction**. The materials stay per instance because their opacity is animated per flourish, and
`updateFx` disposes those on the way out — which also stops hearts and bursts leaking a
`SpriteMaterial` apiece. Their textures are cached and shared, and `Material.dispose()` does not
touch a map, so that stays safe.

**Everything else in the churn is flat**: `rebuild`, `restore`, `popups` and `pads` do not move at
all across three rounds.

### The residuals were measured over more rounds, and there were none

Eight rounds a block instead of three. `rain` holds at **226** geometries, `rebuild` at **228**, and
`restore` *gives geometry back* and settles at **221** — so the "about one a round" the last pass
would not call either way was the first round of a cache filling, seen through too few rounds to tell.

`raiders` was the interesting one, and it is where the harness was caught being confidently wrong:

```
raiders  geometries  221 -> 227 -> 227 -> 227 -> 227 -> 227 -> 227 -> 232 -> 232   +0.7/round
         popups        0 ->   0 ->   0 ->   0 ->   0 ->   0 ->   0 ->   2 ->   3
         run      0/5/24/2 -> ... -> 0/5/24/2 -> 0/5/31/2 -> ...   (wave/level/enemies/units)
```

Six rounds flat, then a step. **Seven enemies arrive at round five** — the block spawns its knights at
(20…28, −20…−27) and a camp's `wakeRadius` is 14, so it wakes one — and two rounds later the first
blow lands, the popup cache fills for the first time, and a canvas texture and two programs go with
it. Paid once. The wave never moves, because the harness loads `?tour` and **nobody comes**.

Two things came out of that. Each block now prints `wave/level/enemies/units` beside its counters,
because the columns are what named it — I had written the step down as "a wave arriving with a raider
type nobody has seen", which `?tour` makes impossible, and no amount of staring at the geometry row
would have said so. And the verdict is no longer an average: **a leak climbs in most rounds, a step
climbs in one**, which lives in `tools/churn/verdict.mjs` and is pinned by
`churn-verdict-tells-a-step-from-a-leak` against six series the harness has actually printed. An
instrument that cries wolf is worse than one that says nothing, because the next real finding arrives
beside it and gets the same shrug — which is #179's lesson arriving through the tooling instead of the
checks.

## A spare bridge mat, laid every time anything changed (#190)

**The biggest thing the churn harness has found, and it was hiding behind the instrument.**

`refreshPads` runs on every purchase, every Keep level and every restore. It asks whether a mat is
already down with `this.pads.find((p) => p.def === def)` — **object identity** — and `addPad` hands a
bridge def to `bridgeMatPos`, which returns `{ ...def, pos }` so the mat lands where the road actually
crosses the river. So the pad on the field carries a *copy*, the test compared it against the object
`config.js` holds, and it never matched. Another mat, every call, for as long as a bridge is unlocked
and unbought — which for at least one of the two is usually the whole run.

```
after 100 calls   pads 234   addPad 200   drawPad 200   disposePad 0
after 400 calls   pads 834   addPad 800   drawPad 1400  disposePad 0
```

**Twelve duplicates were already down at boot**, before the player touched anything.

### Why nothing saw it

`renderer.info.memory` counts what has been **uploaded**, and the bridge mats are at the river. While
the King is in the village they are off-camera, so every GPU counter this ticket has ever read stayed
flat and only the JS heap moved — 3.3 MB per twenty calls, which is what the churn harness finally
caught, and only because the heap got a mark of its own. Then he walks to the bridge:

| | pads | geometries | textures | heap |
| --- | --- | --- | --- | --- |
| at the village | 34 | 214 | 49 | 95 MB |
| 800 mats later | 834 | 219 | 49 | 137 MB |
| **at the bridge** | 834 | **1,065** | **456** | 149 MB |

407 canvas textures at 256×256×4 is **about a hundred megabytes of GPU memory, asked for in the frame
you cross the river**, on a phone, having shown no sign of itself until then. That is the shape of the
out-of-memory kill #190 has been looking for. After the fix the same walk costs **+1 texture**.

### The fix, and what it is not

`refreshPads` matches **by id**. Ids are unique across `PADS` (53, checked) and the dynamic ones are
already treated as unique. Memoising `bridgeMatPos` was tried first and does nothing: making the copy
stable does not help a test that compares against the original, which is worth writing down because it
looks like the obvious fix.

`removePadDef` still compares by object and is safe where it stands — it is only ever handed a dynamic
def, and those are not copied. It is the copying that breaks identity, and only bridges copy.

`mats-do-not-multiply` holds it: forty refreshes, the same mats, once each, with both bridge mats still
on the field so that a "fix" which simply stopped adding them would not read as green. Its sabotage
makes the mats on the field stop answering to what `config.js` asks for — wrapping `addPad` was tried
and proved nothing, because it arms after boot has already put the mats down correctly.

## Plateaus: the first thing in the game with a Y axis (#223)

Three flat-topped platforms out in the country, with a ramp up one side. **Not terrain** — the ground
is still one plane and everything still assumes y 0 except three comparisons. They are discrete raised
regions, the same shape as the cliff box, except you can get on top of one.

**What landed is the walkable half, and that is a deliberate scope.** The ticket's gameplay — "a
watchtower built on one gets range" — is not reachable: `placeOk` confines every placeable building to
`TIERS[tier].bounds` (±38), and `CFG.placeBuildings` is `false` because #152 parked the whole
placeable-building system. The ticket was written believing #43's placeable towers were live.

### Where they are was measured, and the measurement moved all three

A grid of the built world was asked, every 2 units, whether a platform's whole footprint stands on
ground clear of the village, the four roads, the river, the cliff box, the camps and the hand-placed
seams — `world.free`, the same predicate the scatter uses:

| top radius | legal spots | nearest to the castle |
| --- | --- | --- |
| 7.5 | 102 | **50** |
| 6 | 169 | 49 |
| 5 | 244 | 48 |
| 4 | 315 | 41 |

**The band from the rings at 38 out to about 48 is full** — that is where the seams, the roads and the
river already are. So a plateau is a far-country feature at 49–68, and "a plateau near a gate is worth
walking materials to" is not something this map can offer.

My first three were hand-guessed. One had **three hand-placed seams inside its footprint**: at seed 0
the nodes come from `NODES` in `config.js`, which predate plateaus, so the generator's own "keep off a
plateau" rule never ran on them. Guessing a coordinate and checking it afterwards is how that happens.

### How the Y axis is paid for

`world.floorAt(x, z)` is the whole of it — the top inside the rim, the slope on the ramp, 0 everywhere
else. Three comparisons, exact, and asked by **`animateWalk`**, which is the one line every walking
thing in the game passes through each frame. One place to be right instead of eleven to forget. Only
meshes parented to the root: a rider is a child of its horse and its position is local to the saddle.

**The rim is a fence of solid circles with a gap at the ramp.** `collideScenery` pushes out of circles
and `steerRoundSolid` bends round them, and both already run on every mover every frame — so a ring of
overlapping circles is a wall the whole game already knows how to respect, for a few dozen entries in
a grid that holds 415. Driven: the King is stopped on all eight non-ramp bearings at d≈9.5, y=0, and
walks the ramp 0 → 3.20.

### The ramp waypoint is not optional

Before it existed, eight raiders were sent at a King standing on a plateau and given ninety seconds of
game time. **None reached the top**; two ground against the rim and the rest wandered off.
`steerRoundSolid` bends round *one* solid at a time and grazes a forty-circle fence for ever.

`rampWaypoint` is the twin of `bridgeWaypoint` and reads exactly like it: a river is crossed at a
bridge, a plateau is climbed at its ramp. The bridge wins when both apply, because a ramp on the far
bank is no use until you are across. With it, a raider summits in about ten seconds.

### What they cost

Measured against `main` with the same flags (`probe --crowd 120`), so the only difference is the
three platforms:

| | main | with plateaus |
| --- | --- | --- |
| draw calls, phone peak | 1,005 | **1,012** |
| draw calls, desktop peak | 1,330 | 1,331 |
| triangles, phone | 1,312k | **1,327k** |
| visible drawables | 543 | 555 |

About **+7 draw calls and +1.1% triangles on the phone profile**. Both budgets were already over and
waived under #52 before this — the crowd models are ~8.7k triangles against a ~5k budget — so this
does not change what is owed, it adds about one per cent to it. The village frames in the budget
table above do not move at all: the plateaus are 49–68 units out and are not in those shots.

They cost one draw call each rather than three because they are built into the same group as the
mesas and merged with them.

### And it has to be walkable, not just correct

Aiming at the foot of the ramp is not enough, and the first version did exactly that. Driven from
eighteen bearings a plateau, starting hard against the rock:

| route | found the way up |
| --- | --- |
| none at all | **0 / 18** — grinds along the fence for ever |
| straight at the ramp | **12–13 / 18** |
| round the drum, then the ramp | **18 / 18** |

Every failure in the middle row was a contiguous arc on the side *opposite* the ramp, stopped dead at
d = 9.0 — because the straight line to the foot goes through a cliff. So when the way up is not in
front of you, the waypoint steps round a ring outside the fence, up to 40° at a time, in the shorter
direction, until it is. Which is what a person does at the foot of a hill, and it needs no pathfinder
because the obstacle is a circle.

**A route that points at the right place and cannot be walked reads as correct from the outside**, so
`high-ground-holds` drives it rather than asserting on the waypoint. Its sabotage flattens `floorAt`
so the rock becomes a picture.

## A design review, measured (Wave 3)

A six-discipline review of the whole game, run as three waves: critique, measure, fix. The rule was
that every claim had to point at code, config or a frame, and the second wave existed to test the
first — which it did. Four confident claims from the critique did not survive measurement:

| claimed | measured | verdict |
| --- | --- | --- |
| `nearestEnemy` is O(n) from nine sites and severe | 118 calls, 13.7k tests, **0.65 ms** a frame at night 30 | retracted |
| the sim step costs 2.5 s | `update()` includes the render; steady state **11 ms**, one program built in ten frames | SwiftShader artefact |
| the deck is exhausted by level 8 | median run sees every card by 15; **55 % of offers reheated by level 10** | sharpened |
| six of forty raiders queue at a plateau rim | stale build; on `main` **38 on top by 20 s, 0 at the rim** | withdrawn |

**What was fixed, each driven:**

- **Three pairs of reward cards shared an icon** (Packhorse/Swift both a horse). 17 cards, 17 icons
  now — the icon is the first thing read in the seconds a paused raid gives you.
- **Non-text HUD failed contrast on the boss-night sky.** Measured brightest-tenth against
  darkest-tenth in each element's box: text passes everywhere (6:1 to 10:1, it sits on plaques); the
  hearts read **2.8:1**, the reach ring **2.3:1**, the home arrow **1.3:1** — hue carried it, luminance
  did not. An outline shadow on the hearts and the indicators, and a dark ring under the white one.
  After: arrow **3.2:1** (passes), hearts 2.9, ring 2.7 — the last two are capped by the heart's own
  red and by the white line's blend over red ground, and are an art call rather than a CSS one.
- **The plateau cap** had no tufts against `makeCliff`'s 38, and read as a felt-topped table.
- **A refused cross-map save was silent** — `console.warn` then `clearRun()`. It says so now.
- **Keyboard hints** ("Press K or Esc") shown on touch screens are hidden under `pointer: coarse`.
- **The reach ring is a group now** (line plus edge), so the upgrade that widens it rebuilds it whole
  rather than reaching for a geometry it no longer has — driven: Lodestone 3.7 → 5.92, no error.

**And one thing the review's own harness got wrong:** a family of probes pointed at a stale scratch
build. Every number above was retaken against `dist` before it was written down.

## Every check proves it can fail (#179)

`--prove` breaks the game the way each check exists to catch and expects the check to go **red**.
A check that stays green under its own sabotage is not covering what the registry says it covers.

**24 of 24 now prove they can fail, with no sabotage missing.** Each red is the check demonstrating
the bug it was written for:

| check | what its sabotage proved |
| --- | --- |
| `walls-solid` | the King reached 69.2 from the middle at 30°, 45° and 60° |
| `gates-passable` | every gate reported shut |
| `wall-ring-unbroken` | 268 points on the ring neither wall nor gate |
| `queen-visible` | Wren inside the King, 0.74 apart |
| `tower-crew-placed` | two archers 0.13 apart on a full deck |
| `post-once` | the composer target at 0 samples — multisampling not carried over |
| `opening-resolves` | *"she was never taken (openT 30.01, snatched true)"* |

**Three sabotages were wrong before they were right**, and only running them showed it — which is
the argument for `--prove`, made against `--prove` itself.

`bands-hooked` was armed on frame 0, before its shader had compiled, so `onBeforeCompile` wrote the
flag back and the check stayed green. `opening-resolves` was worse twice over: it pinned
`queen.captive` with a `defineProperty`, so `captureQueen` ran its whole body every frame without
the flag ever latching, rebuilding her escort thousands of times until the run died inside three's
**animation** mixer — `_cacheIndex` is `PropertyBinding`'s memory manager, which is what pointed at
it. Replaced with `CFG.opening.speed = 2`, it stayed green, and correctly: the check clamps the King
at ±18, so he stands still for most of its 2000 steps and a merely slow party still reaches a
stationary Queen. Zero is the honest version.

**And `asserts` has to describe the rule, not the field the code happens to read** — now written
into the registry header with the two checks that earned it. `rebuild-after-fall` asserted
`structures.length` grew, but `buildStructure` deliberately keeps the trade post out of that list,
so it reported "buying a mat built nothing" about a game that had built it. `pads-no-overlap`
asserted no two pads share a spot, but two on one spot *is* the design where one unlocks the other.

## A sabotage that arms too early proves nothing (#179)

`--prove` breaks the game the way each check exists to catch and expects the check to go **red**. A
check that stays green under its own sabotage is not covering what the registry says it covers.

**The harness was arming the sabotage on frame 0**, the first frame where `window.game.king` existed,
and that is too early for anything a shader touches. `bands-hooked` stayed green under its own
sabotage for exactly that reason: the sabotage cleared `userData.bandedShader`, the ground material
had not compiled yet, and `onBeforeCompile` wrote the flag straight back on first render. Measured —
sabotage at frame 0 hitting 1 material, flag `true` again by frame 21, cache key untouched.

**The frame it arms on is squeezed from both sides**, which is why it is a constant with a paragraph
next to it rather than a zero:

| | |
| --- | --- |
| late enough | a shader compiles on its **first render** and writes its flags then. Frames 1–2 draw everything, so anything before that gets undone |
| early enough | `boot()` hands over at `frames >= 14`, and `hud-quiet` wraps `hud.set` the moment it gets control. A sabotage that also wraps `hud.set` has to be **underneath** that |

Arming at `BOOT_MIN` was tried and races with `boot()` returning on the same frame — `hud-quiet` came
back green. **5** sits between the two with room either side: both now go red, `bands-hooked` with
*"ground: compiled without the patch"* and `hud-quiet` with *"the HUD wrote 10 times when replayed
with unchanged values"*.

This is the ticket's own point landing on the ticket's own tooling. Four checks were once wrong about
the game; the fix for that was `--prove`, and `--prove` was itself quietly not working for a whole
class of check. A check that has never failed on purpose has not been tested — and neither has the
thing that tests it.

## Getting off the horse (#217)

Mounting used to be one-way. `mountKing` opened with `this.mounted = true` and the only place it was
ever cleared was `reset()` — so a choice made in the first few minutes was permanent for the rest of
the run.

**A dismount cannot mirror `riderFell`.** There are two different mountings in this game and only one
of them reverses. A *soldier* is seated: `mountUnit` reparents his mesh onto the horse's, and falling
off is a detach. The *King* is replaced — his mesh becomes `king_mounted`, one model with the horse
built into it, so there is no horse object to hand back because there was never one to take. Getting
down swaps the mesh back and **creates** a horse beside him.

**The real work is everything else keyed off `this.mounted`**, and missing one is the exact shape of
bug this repo keeps writing down: every count still correct and a health bar floating above nothing.
Driven, on both sides of a dismount:

| | mounted | on foot |
| --- | --- | --- |
| health bar height | 3.2 | 2.4 |
| `stackBase` (carried coins) | 3.2 | 2.4 |
| speed | 7.5 | 5.6 |
| Warhorse mat offered | no | **no** |

That last row is the one that would have shipped broken. The mat is skipped on `this.mounted`, so the
first dismount would have put a 20-coin Warhorse mat back on the field and sold him a second horse.
It asks `hasHorse()` now — mounted, **or** one of his roaming.

**What the loose horse does.** It follows at his shoulder for 8 seconds (measured holding at exactly
the 2.2 gap), then loses interest and roams. Called, it gallops at 8.5 — `home` is 4.6 and that is a
trot, the wrong verb for "comes running over", and the bar it has to clear is the King **on foot at
5.6**, because a mounted King never calls one. It stops at 1.8, *beside* him: `reach` is 1.3 and that
is a mounting distance, not a standing one. **It does not put him on** — a horse that mounts you on
arrival takes the decision away at the moment you might have changed your mind. A press while it is
still closing is remembered and redeemed on arrival, so nobody waits out an animation.

**It roams the grounds, not the yard**, and that is not decoration. `TIERS[tier].bounds` is the
game's own answer to "the castle grounds" (#116) and grows with each expansion, shrunk to half about
its centre because the whole of tier 2 is 82 × 70 and a horse in the far corner is an eleven-second
wait. More importantly a loose horse then **never needs a Stable** — the legacy unlock "Begin every
run already mounted" starts a run without one, and `home` state bails on `if (!this.stable)`, so a
horse dismounted there would have stood still for ever. Verified with `stable` nulled: loose,
roaming, moving.

**A swordsman can never ride it.** `sendHorse` and `yardHorses` both take yard horses, and "the yard
IS the capacity" (#117) — so the King's horse entering that pool would hand the army a free horse it
never bought. It is flagged `royal`, excluded from both, and never enters `yard` state at all.

**It survives a save.** Saved as `{at, state: 'roam', royal: true}` and restored **without** the
Stable gate the yard horses have, or the legacy-unlock player loses his horse. Checked through a real
save and Continue: position preserved exactly, still loose, King still on foot.

The button is third in the bottom-right row, left of the banner, and its word is its state — Off,
Call, Ride. `H`, because Space, B, Enter, Esc and M are the warhorn, banner, place, cancel and move.

## Trees and rocks are solid (#215)

Nothing scattered on the map used to stop anybody. Now a trunk, a rock and a spike barricade do.

**Which ones, and why those.** A trunk and a rock are things you walk into; a bush is something you
push through and a hay bale is something you walk round because you can see it. Spikes are a
barricade and being stopped is the point of them. So: trees, rocks and spikes solid — 415 of them —
and bushes, bales and the wheat fields not.

**The radii are measured off the models, not guessed.** A trunk is `CylinderGeometry(0.16, 0.26)`
under `g.scale.setScalar(scale)`, so 0.26 × its scale — **the trunk and not the canopy**, which is
what keeps a wood walkable while the trees in it are not. A rock is a 0.55 dodecahedron scaled 1.2
across, so 0.66 × scale. Spikes are a 2.6-long beam rather than a disc at all; 1.1 blocks the middle
and leaves the last 0.2 of each end passable, which is a barricade you can get round the end of.
Measured in the running game: 415 solids, radii 0.199 to 1.1, and **none inside the tier-0 ring** —
`free()` already keeps scenery out of the village and off the roads, so this only ever bites in the
countryside.

**They have to be captured, because by the time the game runs they do not exist.** `mergeGroup`
collapses every tree, rock and barricade per material and per 30-unit cell — which is exactly why
the map can afford 660 of them and exactly why there is nothing left to ask "where are you". The
scatter records them as it places them; `place` already hands its maker the x and z, so it costs no
change to the scatter itself. Bucketed at 6 units, so a query reads a 3×3 block: checked against a
brute-force scan on 400 random probes, **0 mismatches**.

**Steering, not just push-out — and #181 is why.** "A separation pass was the obvious fix and is the
wrong one": correcting after the fact means what you see is a character sliding out of something it
was never meant to be in, and a unit walking dead-on at a trunk with only a push to stop it grinds
against the bark for ever. So `steerRoundSolid` bends the *direction* to graze past — the same shape
as `steerRoundKing`, for the same reason — and `collideScenery` is only the backstop for what that
cannot catch. The King is the exception: **he is blocked, never steered**, because bending the
direction of the one mover with a person driving him is the game taking the stick off the player.

Thirty dead-on approaches at the map's biggest solids, each the same 16-unit journey straight
through a trunk's centre:

| | arrived | frames | ever inside a trunk |
| --- | --- | --- | --- |
| steer + push | 30/30 | **124** | 1 |
| push only, for comparison | 30/30 | **268** | 1 |

The straight line is about 107 frames, so steering costs 16% on the worst case a unit can meet and
the naive fix costs 150%. That is the grinding the ticket predicted, with a number on it. The push
runs up to three passes because being pushed out of one trunk can put a shoulder inside the next —
one pass left 2 of 30 still touching, three leaves none of those.

**It costs the raid nothing.** Forty crossings of the countryside: 40 arrive either way, **0 stuck**,
**+0.0% path**. A 24-raider raid with the starting state pinned closes 20.3 with collision on against
20.3 with it off, the same 1 never-moved and the same 8 long-stalled raiders in both arms — those
pre-date this and are raiders stopping to fight, not snagging. The steer fires on 3.4% of
raider-frames and the push on 0.3%. No geometry is added, so the draw-call and triangle budgets
cannot move for this; the 210–220 spread between runs is where the King happens to be standing.

**A day was nearly lost to a bad test**, which is worth recording because it looked exactly like a
real regression. The first raid comparison said the raid closed 20.7 without the change and 7.0 with
it, reproducibly, three runs each. It was not the change: building the grid costs a millisecond at
load, the King had walked a different distance by the time the raid started, and the raiders chased
him somewhere else. Disabling the collision at runtime still gave 7.0 — `solidNear` called zero
times — which is what proved the test rather than the code was wrong. Pinning the King, the Queen
and the army before spawning made both arms agree. **A measurement that moves when the thing it
measures is switched off is measuring something else.**

## Wren comes out of the Keep (#234)

**She was pure liability and never a resource.** Her health bar is not health — it is how much of her
the raiders have got (#83) — and nothing she did made a night go better, only worse. So sheltering
her was always right, which meant the Keep was not a decision, it was a chore with a lid on it. In
Kingdom, the game this one is nearest, the horse and the crown and the coin in your hand are each a
cost *and* a capability; she was only ever the cost.

Now she can be brought **out**, and being out is what charges her. **The risk and the reward are the
same dial.**

### A hold, not a blast, and not a second fighter

A second fighter is damage per second, and damage per second is not a decision — you would simply
always take her out, and the old problem would be inverted rather than fixed. Three reasons a hold
beats damage: a damage number has to be balanced against four ranks across two run lengths and a hold
does not; a hold rewards **where you were standing**, which is what an escort is about; and a hold
opens a window the player fills with their own army, which makes the army feel good instead of
replacing it.

It reuses the warhorn's own line — `e.cooldown = Math.max(e.cooldown, hold)` — because that is a
proven way to stop a raider rather than a second one invented. No push: the horn shoves them off the
King, and this holds them where they are so the army can reach them.

| | horn | Wren |
| --- | --- | --- |
| stop | 1.3 s | **2.6 s** |
| radius | 7.5 | **9** |
| paid for by | a 22 s cooldown | one night of committing to it |

### Two gates, and the second is what makes it a bet

| | |
| --- | --- |
| **night only** | Charging in daylight would make the safe hours the profitable ones — walk her out at dawn, park her, and the night decision evaporates. |
| **in danger** | A living raider inside `danger`. Without it the optimal play is an empty corner and a farmed meter, which is the chore this ticket exists to delete. |

**A state, not a gradient.** It charges at one rate or not at all. A gradient is unreadable at a
glance on a phone and untunable; a binary explains itself, because a stalled ring says why by
standing still — and the button dims to say the stall is not a fault.

The control cost of the danger rule is **zero**, which is what makes it work: she follows the King,
so taking her toward danger is the player going toward danger, which he is doing anyway.

`danger` is 9 against a grab at about **2.4** (`e.radius + seize.grip`). That gap is the whole bet:
there is a band between the two where she is charging and not yet held, and playing it well is
keeping her in it. `charge` is 12 seconds of *qualifying* time against a 30-second night — roughly
one release a night, bought by committing to it.

### Driven, because the ticket said the verification is the hard part

```
daylight, a raider 4 away:      charge 0.00  charging=false
night, nearest raider 60 away:  charge 0.00  charging=false     <- the ring stalls
night, a raider 6 away, 3s:     charge 0.25                     <- 3/12, the config's own rate
...and filled:                  charge 1.00  mode 'hold'
release: 4 within 9, 1 at 40 -> held 4/4, the far one held=false
         the meter is spent:    charge 0.00
targeted but not held:          charge 0.81  ->  once HELD: 0.00
sheltered, a raider 1 away:     charge 0.00  charging=false
night, only a SLEEPING camp:    charge 0.00  charging=false
```

The last two are the ones worth having. Sheltering gives nothing however good the position looks, and
a camp's sleeping garrison (#218) is **not** danger — without that, parking her beside a camp in the
small hours would have been a free meter.

**Seized loses it** — `held`, hands actually on her (#83), not merely being targeted. Raiders walk at
her all night and that is the game working.

### What taking her out does to the raiders, which was already true

The ticket flags `queen.inKeep` as the sharp edge, and it is — but the behaviour needed no change.
`updateEnemy` already skips units with `inKeep`, weights her at `CFG.queen.targetWeight` **0.55**, and
only considers the Keep a target *while she is in it*. So taking her out already pulls raiders onto
her and off the Keep. That is the trade the mechanic wants, it was there all along, and what it needed
was to be understood rather than written.

### The corner, measured rather than guessed

The ticket's own arithmetic, confirmed in a 390 × 844 frame:

| | size | right |
| --- | --- | --- |
| Horn | 64 | 12 |
| Banner | 56 | 84 |
| Mount (#217) | 50 | 146 |
| **Wren** | **50** | **146, sharing the mount's slot (#240)** |

**#240 put mount and Wren in one slot.** Four buttons were 244 of a phone's 390 px along the bottom
edge, with the joystick a `pointerdown` anywhere on the canvas underneath them. Both elements stay
and both sit at `right: 146`; `game.js` shows one at a time, so the row is three buttons (184 px) and
the third changes its icon, never its place. Not the ticket's literal rule -- "Wren's whenever her
button would show" is the whole run once a Keep stands, and would have taken the horse off the phone
for good. Wren has the slot while she has a job on it (her meter is full, she is out, or she is
sheltered and it is night, when taking her out is the point); sheltered by day is the horse's, if
there is one. Whether a thumb can start a drag at the bottom-right quarter is the ticket's open
criterion, and only a phone answers it.

All four stand down during a placement, which was checked rather than assumed. The ring is **blue,
not gold**: gold at that corner has meant *"ready again"* for the whole game, and a third gold ring
meaning *"filling up"* would be a third meaning on one colour. It obeys `#banner-btn`'s rule verbatim
— **no pulse while filling**, which is most of a night; the pulse is earned and starts only at full.

`setWren` dirty-checks all four of the things that change on it, because `Hud.set` runs every frame
and a charge ring writing a percent sixty times a second is exactly what that rule exists to stop.

**Q, not W.** The first draft bound W — which walks the King, since `input.js` reads it for WASD and
the title screen tells the player so. It would have sent her in and out of the Keep every time
somebody walked north.

### And the element sheet was already one button behind

`?view=elements` builds its specimen list by hand, and **#217's mount button had never been added to
it** — the same gap `views-open` had for `?view=camp`. The corner is a four-button hierarchy and the
sheet was answering *"what does a tap target look like"* with three quarters of it. Both are in it
now.

### What is not here

**It does not scale with the Keep**, deliberately: the Keep level is already the story clock (#154)
and the age ladder, and a third meaning on one number is how a dial stops being legible. If this
should grow it grows through `src/upgrades.js`, where a mod costs one line and the player *chose* it
— and #220's legacy tree hooks the same door.

**Two lines, not a set.** One the first time she comes out in a run, one on release. Nothing per
night: a line that fires every night is a line players learn to stop hearing.

## The prologue gets a name, and the escort gets a flag (#232, #233)

`queen.captive` was being read at **29 sites across 6 files**, and most of them were not asking about
Wren. They were asking *has the prologue ended?* — the day/night clock, the rain, the diary, wave
spawning, which pads are offered, the King's verbs. None of that is a fact about a character. It is
the run's opening phase, spelled as a fact about the King's wife, and the cost was flexibility: every
change to the opening had to be routed through her.

### Reading the sites turned up three kinds, not two

The ticket expected a two-way split — the phase, and her. **Reading them rather than sweeping them
found a third, and it is the one that would have broken silently.**

| | | |
| --- | --- | --- |
| **the phase** | pads, the diary, the King's verbs, the alarm's call, the raid HUD, the wave timer, thieves | converted to `inPrologue()` |
| **held hostage** | the day clock, the rain | **left on `captive`** |
| **her own state** | the indicator arrow, the grass she parts, `updateQueen`, the save gate, the opening's own snatch | left on `captive` |

The middle row is the catch. Those stop while raiders have her **at any point in the run**, not only
in the prologue — #12's reasoning is that *"the raids ARE the enemy coming for her"*, so a recapture
on night 12 stands the clock still too. A phase flag would have quietly resumed the clock during a
mid-run recapture, and nothing on screen would have said so.

So `phase` is not a rename of `captive`. It is the name the first row never had. **14 sites
converted; the rest were right as they were.**

### One method, because two places were already deriving it by hand

`beginRun()` sets `phase`, `snatched` and `openingDone` together, and three things call it: the
rescue, the rescue-after-she-is-carried-off, and a restored save. That last one had been doing it
inline in `applyRun` with a paragraph explaining why — and a second hand-derivation is exactly how
two of them drift. A restored run and a rescued one are now in the same state because they went
through the same door, rather than because two places agree.

It does not go back. A recapture stands the clock still but is not a return to the prologue: the pads
stay bought, the diary stays open, the King keeps his verbs. *"The prologue happened"* is a fact about
the run, not about where Wren is standing.

### The escort, on a flag (#233)

`?escort=off` starts a run with Wren already home and the prologue skipped. **Nothing is deleted** —
not the collector branch, not the seize bar, not one of her lines. The ticket's own stopping rule was
that if turning it off needed a second path through `updateQueen`, it had grown into a rewrite and
should stop. It did not: `beginRun()` already existed by then, so the flag is five lines.

**Both of her endings come off the board with one guard.** `captureQueen` is the single entrance to
both — `gameOver('queen')` is inside it, and `gameOver('taken')` is only reachable from `updateTaken`
after it has run. Guarding the entrance rather than the two exits is why nothing forks.

Driven, with a control, because an assertion with no control proves nothing:

| | escort on | escort off |
| --- | --- | --- |
| phase | `prologue` | `run` |
| she is | beside the King | in the Keep |
| the clock, over 50 frames | **frozen** (0) | advancing (0.0333) |
| the King's verbs | blocked | available |
| two `captureQueen` calls | **ends the run**, `lost: queen` | `over: false` |

**The control had to be fixed before it proved anything.** Calling `captureQueen` once and seeing no
ending looked like success and was not: the first capture of a run is the premise (#152) and
deliberately costs nothing, so the escort-on control was reporting "no ending" because it had just
spent its free snatch. Twice is the honest test.

### What this is for, and it is not "is it easier"

Play three full short runs with it off and answer whether a night is **thinner** without her — fewer
things to think about at once. She is the only mechanic here that nothing in the genre next door has
(`docs/competitors.md`: Kingdom, Bad North, Brotato, Northgard — not one has an escort), and she is
also the most entangled thing in the game. Those two facts pull opposite ways and neither settles
anything, because nobody has played the game without her.

**It has to be played.** Wall clock is not game time under SwiftShader, so this cannot be driven
headless — it is a judgement, not an assertion. What is checked here is only that the flag puts the
game in the state it claims to.

## The legacy tree: twenty-four unlocks, of which you carry three (#220)

#56 built exactly the right mechanism and then put four things in it. Four unlocks, all automatic and
all passive, means **the start of run 9 is identical to the start of run 8** and there is nothing on
the title screen that is a decision.

Twenty-four automatic unlocks would not have fixed that — it would be a bigger drip, a difficulty
slide that makes the game easier every week and never more interesting. **So you pick three.** That
is the half of the ticket doing the work: it is a different run every time somebody sits down, chosen
by them before the first mat, and it makes the build order they have optimised over four runs wrong
again on purpose.

### Owning is no longer carrying, and that is the change

`applyLegacy` used to apply everything the player had earned. It now applies `picks()` — what they
chose, filtered by what they have earned. Driven, with `purse`/`tools`/`volunteers` chosen out of
twenty-one unlocked:

```
mineSpeed     1 -> 1.3     recruitBonus  0 -> 1      start coins  10 -> 25
archerDamage  1            wallHp        1           startMounted false
```

The second row is the assertion that matters: those are unlocks the player **owns** and did not pick,
and they stay at their defaults.

**A first-time player's run is untouched**, which is #56's rule and was checked rather than assumed:
a fresh profile reads `legacy=0`, the title block is `hidden`, `picks()` is empty and nothing is on
the field.

### Nothing trivialises a run, and it is arithmetic rather than opinion

The ticket's second rule — *"each unlock is a head start on something the run already gives you"* —
is checkable, because a legacy unlock and an upgrade card write to the **same `mods` key**. So
`legacy-is-a-head-start` runs every unlock's `apply` against a fresh `MODS`, sees what moved, and
holds it to **at most one buy** of the card that shadows it:

| | legacy | one card | |
| --- | --- | --- | --- |
| `archerDamage` | ×1.2 | ×1.3 (Keen Eye) | |
| `archerHp` | ×1.25 | ×1.4 (Hardened) | |
| `towerDamage` | ×1.3 | ×1.5 (Fletcher's Workshop) | |
| `wallHp` | ×1.25 | ×1.4 (Deep Footings) | |
| `mineSpeed` | ×1.3 | ×1.45 (Sharp Tools) | |
| `regen` | ×1.6 | ×2 (Field Surgeon) | |
| `kingSpeed` | ×1.15 | ×1.2 (Swift) | |
| the `+1`s | +1 | +1, max 2–3 | one buy of three |

**17 of 24 measured against their card, none stronger.** A player with three picks has had a head
start on three cards and can still go and buy all three. The other seven have no card to compare
against — the five head starts, plus `purse` and `armour` — and the check *names* them in its note
rather than skipping them silently, because "this one has nothing to measure it against" is a fact
whoever adds the twenty-fifth should have to read.

Proved it can fail: making one unlock ×1.9 gives `keen (Sharpened heads) moves archerDamage by 1.90,
more than one Keen Eye card at 1.3`, exit 1. (Free checks bypass the `--prove` path, which only
sabotages browser checks, so this one is proved by hand the way `tools/layout/check.mjs` is.)

The check also holds the ladder itself: ids unique, thresholds rising in order, and **at least four
unlocks inside one finished short run** — because the choosing is the feature, and a feature nobody
reaches is not one.

### Where the thresholds come from

#56's arithmetic still holds: a finished short run clears about 13,000 before a single kill is
counted, a long one about 30,000.

| | |
| --- | --- |
| the first three | by 6,000 — **inside a first short run** |
| eighteen of 24 | by 100,000 — about seven or eight finished runs |
| the last six | to 215,000 — long tail, and deliberately the head starts |

Front-loaded on purpose. The interesting thing is not owning twenty-four, it is choosing three, and
that starts the moment there are four to choose from. The head starts are the expensive end because
they are the only kind that changes the **shape** of an opening rather than a number inside it —
beginning with the palisade up is a different promise from archers who shoot harder.

### The panel was the risk, and it is a sheet

A pick-three-of-twenty-four chooser on a 390-wide screen, on a title screen whose whole complaint in
#58 was that two run-length pills were already too much noise.

So the title screen shows only **what you are carrying** — three badges — and a quiet row under them:
`Choose your three · 21 of 24 unlocked`. Everything else is behind it, which is what lets a player
who does not care press Play and never see a decision. The old block listed every unlock, which was
right at four and is twenty-four rows of badge at twenty-four.

The chooser is a sheet, grouped into the five pools the upgrade cards use, so a player who knows what
"Your walls" means on a level-up card knows what it means here. Measured at 390 × 844: **712 tall
against an 844 viewport**, 24 rows, 5 group headers, scrolling inside.

**It scrolls, and that is fine here where it was not fine on the level-up panel** (#221). This one is
opened on purpose, from a paused title screen, by somebody who came to read it; that one opens itself
mid-raid. Twenty-four rows always overflow at every phone size, so the bottom fade is unconditional
rather than a `.more` class toggled on measurement — there is no state in which this list fits, and a
row cut off by a hard edge reads as a layout bug where the same row under a fade reads as *there is
more*.

**Locked rows are shown, greyed, carrying their own threshold.** The ladder is the motivation, and
"what am I working toward" is the question this panel answers for somebody four runs in.

**Tapping a fourth drops the oldest** rather than refusing the tap. A chooser that does nothing when
you press it is one people press twice and then give up on; with three slots the intent behind a
fourth tap is obvious, and the pick chosen first is the one thought about least recently. Driven:
`keen,volunteers,hardened` → tap a fourth → `volunteers,hardened,fletchers`.

### And one thing this found in the checks themselves

`views-open`'s list of frames is **hand-written**, and that is its one weakness: a `?view=` added to
the game and to the board is not covered until somebody adds it here too, and nothing says so.
`?view=camp` shipped with #218 and went two tickets before the count not moving gave it away. Both
it and `?view=picks` are covered now — **21 views → 23** — and the number in the note is the tell:
if it does not go up when a frame is added, the frame is not being checked.

### What it cost the rest of the code

Still one place. `applyLegacy` is a loop over three `apply` functions, every one of which writes to
`mods` — the door `upgrades.js` already uses — so the twenty-fourth unlock cost what the fourth did.
The head starts that need a *field* (a mounted King, archers to recruit, a Trade Post to stand up)
set a flag there and are cashed in `applyHeadStarts` after `standOpeningVillage`, because a Trade
Post stood up before it would be a second Trade Post once it ran. That split is #56's; there are just
more of them than `purse` and `stables` now.

One trap worth naming: `mods.startBuilt` is an **array**, so `{ ...MODS }` would share one list
across every run in the session and the second run would open with the first run's head starts still
in it. It is copied fresh.

## Treasure in the fog, and relics that change a rule (#221)

> "maybe things like finding treasure in the rest of the world"

**There was nothing to find.** The day was mine, carry, sell, build — four verbs, all known in
advance — and the map outside the walls was a resource dispenser at memorised coordinates. Meanwhile
the fog was hiding ground the player had already learned by heart, which is a promise the game was
not keeping.

Five caches are buried out past the walls now. A cache is invisible until the King walks close
enough for the fog to lift off it; he stands on it and holds, the same stand-and-hold the mining
already uses, and what comes out is a **relic**.

### The reward is not coin, and that is the whole point

Coin is what the game already gives you, in amounts it has been balanced to give you, so a chest of
it is a slightly faster Tuesday. A rule change is what makes two runs with the same build order feel
different. Every relic has to pass three tests, and the second is the one that takes discipline:

1. **It must not be required.** Miss every cache and the run is exactly the run that ships.
2. **It must not be a number.** The moment one reads "+30% damage" it is an upgrade card found in a
   field. If it can be written as a multiplier it belongs in `upgrades.js`.
3. **Digging must cost daylight** — 3.6 seconds of standing still against a 45-second day, on top of
   the walk out.

| relic | the rule it changes | where it lands |
| --- | --- | --- |
| **The Quartermaster's Ledger** | Every Keep level offers **four** rewards instead of three | `pickOffer` already took a count and was never asked |
| **The Bottomless Sack** | The bag never fills | `loadCap` |
| **The Splitting Shaft** | Every arrow carries on through the raider **behind** the one it hits | `updateArrows` |
| **The Broken Standard** | A camp you break stays broken (#218) | `reoccupyCamps` |

The Shaft is the clearest illustration of the rule against numbers. Volley (an upgrade card) adds an
arrow; this changes what **one** arrow does when it lands. That is why one is a card and the other
is in a hole in the ground.

Once all four are found a cache still pays, in coin — a hole with nothing in it after a day's walk
is a punishment for exploring.

### "The flag is set" and "the arrow pierces" are different claims

The ticket said so, and it was right in a way that cost a bug.

**The Splitting Shaft set its flag correctly and still stopped working after a few shots.** Arrows
come off `arrowPool`, and an arrow that had pierced carried its `pierced` flag back onto the shelf —
so the relic worked for the opening of a run and then silently stopped. Nothing breaks; the player
just thinks they misremembered. A check reading `g.mods.pierce` would have passed the whole time.

So `relics-bite` measures **behaviour, twice over**. Driven down a column of three raiders, damage
from one arrow:

| | raider 1 | raider 2 | raider 3 |
| --- | --- | --- | --- |
| relic off | 40 | 0 | 0 |
| relic on | 40 | **40** | 0 |
| relic on, reusing a pooled arrow | 40 | **40** | 0 |

The third column is the assertion that matters as much as the second: it carries **through**, once,
rather than chaining down a column for ever. `pierceRange` is 5 — a little over two raiders' spacing
in a walking column — so a lone raider with nobody behind him stops the arrow.

The check's sabotage is the bug itself: every arrow is marked as having already pierced.

### A fourth card does not fit on a phone

Measured in the 390 × 844 frame, not reasoned about. Three cards make the panel **847** tall, which
is already the whole screen. Four make it **995**.

`.overlay` scrolls, so nothing was clipped — and that is *worse* than clipping. A reward the player
has to scroll to find, on a panel that opens mid-raid and pauses the game, is a reward most players
will never know was offered, and nothing looks wrong.

**The first fix was wrong, and the breakdown said so.** Capping the "You gained" recap saved
nothing: it renders 159px and the cap was 160. The height is in the cards — 138px each — and the
part of a card that can go is `.ochange`, the pill spelling the effect out in figures ("Towers shoot
from 14 → 18.2"). #107 settled that a card says what the player will *see* rather than what the
multiplier is, and the description above already does that in words; #177 added the figures as a
second opinion. With four cards competing for one screen, the words win and the arithmetic goes.
Three cards keep it.

**995 → 764 against a viewport of 844.**

### Two more things looking at it caught

**A tree was growing out of the first cache.** Caches are seeded before the scatter, but `free` did
not know they existed — and trunks are solid since #215, so a tree on a cache is a chest you cannot
stand on to dig, and a canopy over a small prop in tall grass is a chest you cannot see. `inCamp`
covers a cache's patch of ground now, the way it covers a camp's clearing.

**The chest was sized against itself rather than against the grass.** #191 put 13,000 tufts round
the King, about 0.7 tall, so a 0.86 chest half sunk in a mound showed a lid and a gold band above
the blades and read as litter. 1.24 across and a taller lid puts the whole thing above the grass
line at the distance the fog gives it up at.

### Where they go, and what they dodge

Caches are seeded with the rest of the hinterland (#219) between 42 and 84 units out — just past the
outer wall, reaching past the main camp. Unlike the camps there is **no sector rule**: a camp wants
to be one per direction, a cache wants to be somewhere you were not going, so the only spacing is
`apart`. They keep 4 units off a road rather than the seams' 2.5, because a chest beside a track is
a chest you would have tripped over on the way to work, and the whole reason this exists is to give
the player a reason to walk somewhere they did not plan to.

A cache is kept **out of** a camp's stockade, which is not what the owner first asked for — *"small
enemy camps that may be protecting it"* is the better game. A chest under a tent is a chest nobody
can see to dig, and the fight and the dig would run into each other. Beside a camp is what this
gives, and the camp is still the thing in the way.

**A found cache is findable again**: an indicator arrow while it is off screen and a gold dot on the
minimap, both only once it has been found, so a player who spots one at dusk and runs for the walls
has not lost it. Positions are the map's; found-and-dug is the run's, saved by id. The relics
themselves are saved as a **list of ids and replayed through each `apply`**, because a relic's effect
is a one-way function — `campsStay = true` cannot be read back as "the Broken Standard was found".

## The raid comes from camps standing on the map (#218)

> "i feel like its very singular decisions at the moment and you have to follow the story in a way
> but i think that can get boring after playing it for a few days... I think it needs some more
> complex strategy."

**The day had no teeth.** Daylight was a deterministic errand — walk to a node, hold, walk to the
trade post, stand on a mat — and nothing done out there changed what arrived at nightfall. The raid
was a pure function of the night count and the Keep level, so the strategic question each day was
"which mat next", and that question has a near-optimal answer that does not move between runs. That
is the boredom, and it is not fixed by adding more mats.

**Now three camps stand outside the walls, each sends a party of tonight's raid from its own
direction, and breaking one in daylight means that party does not come.** Mine, or take the King and
his Guard out and break the camp before dusk?

### What a camp costs to break, which is the whole of why it is a decision

A day is `cycle.length * cycle.nightStart` = **45 seconds**. The King walks at 5.6 and rides at 7.5,
so the round trip *alone* is:

| distance | on foot | mounted |
| --- | --- | --- |
| 46 | 16.4 s — 37% of the day | 12.3 s — 27% |
| 54 | 19.3 s — 43% | 14.4 s — 32% |
| 62 | 22.1 s — 49% | 16.5 s — 37% |

— before the fight, and before walking home with whatever he was carrying. `dist` is `[46, 62]`
because the outer wall is at 38 × 32 and a camp has to be outside it with room for a fight, and
because the main camp is at 74 and anything beyond that is a longer walk than the finale for a
fraction of the prize. A camp close enough to break for free is not a decision.

### The failure mode is "clear every camp, no raid ever"

Three guards, and all three are in `CFG.camps`:

1. **`share` is what one camp is worth, and `count * share` is deliberately under 1.** Three camps at
   0.2 leaves **0.4** — the floor, which always comes, aimed from the main camp's direction, which
   cannot be cleared before the finale. The camps modulate the raid; they do not constitute it.
2. **`reoccupy` puts a cleared camp back** after 2 nights. Clearing is a habit, not an errand.
3. **Clearing costs the day**, which is the table above.

### Measured, because "a run that finishes proves nothing here"

`npm run raids` drives the wave assembler at each raid night and reads what comes out — size, and
how many *sides* of the village it arrives on. Every cell is the mean of nine assemblies, because
the raid rolls ranks, shuffles its list and jitters every bearing; the first version of this table
moved 15% between runs on numbers that had not changed.

| raid night | all standing | one broken | all broken | all ÷ standing |
| --- | --- | --- | --- | --- |
| 1 | 6, 1 side | 6, 1 | 6, 1 | 100% |
| 2 | 8, 1 side | 8, 1 | 8, 1 | 100% |
| 3 | 13, 1.4 sides | 10, 1 | 10, 1 | 77% |
| 5 | 22, 1.6 sides | 18, 1 | 18, 1 | 82% |
| 6 | 25, 4 sides | 20, 3 | 15, 1 | 60% |
| 9 | 44, 3.9 sides | 35, 3 | 18, 1 | 41% |
| 12 | 58, 4 sides | 46, 3 | 23, 1 | 40% |
| 20 | 99, 4 sides | 79, 3 | 40, 1 | 40% |

**The opening is untouched**, which was a requirement rather than a hope. The assembler used to open
flanking directions on a ramp of its own — one direction, two from raid night 3, three from raid
night 6 — and `fromWave`/`everyWave` reproduce it exactly for the first two camps, so nights 1 and 2
read 100% at one side. The third camp arrives at raid night 9, and that fourth direction **is** a
change to the late game: one more side to watch, and one more camp that can be taken off the board.

**Three things the table says that are worth knowing before tuning it:**

- **The mechanic is weak early and strong late, and that is right.** Breaking the one camp at night 3
  buys you three fewer raiders for an entire day of lost mining — almost never worth it. By night 12
  it is twelve fewer, and breaking all three is 58 down to 23. It ramps with the army that makes it
  possible at all, so it gates itself.
- **Sides fall faster than numbers do.** All three broken is always **one** side, from raid night 6
  on. A night from one direction is most of what the player actually feels, and it is not in the
  raider count.
- **There is one dip in the curve, at raid night 9.** All-broken is 22 raiders at night 8 and 18 at
  night 9, because a third camp becomes active and the floor is a share of a list that has not grown
  enough to cover it. It costs 50% more daylight to hold the floor from that night on, so the dip is
  paid for; it is recorded here rather than smoothed away.

### Fifteen more standing characters cost four draw calls

The ticket flagged this: "camps are standing crowd that did not exist before — worth watching
against the draw-call budget and #64." Three garrisons of five sleep on the map from the first frame
of every run. The probe, at `seed=0`, against the same run before this landed:

| | before | after |
| --- | --- | --- |
| characters | 37 | **52** |
| crowd drawn / alive | 28 / 37 | **30 / 52** |
| draw calls, desktop | 269 median · 315 peak | 273 · **326** |
| draw calls, phone | 93 · 116 | 84 · **114** |
| triangles, desktop | 1094k | 1034k |
| scene drawables | 495 | 543 |

**Fifteen more characters for four more draw calls**, against a budget of 400. That is the crowd
instancing (#64) doing exactly what it is for — 30 drawn of 52 where it was 28 of 37 — and it is the
reason this mechanic is affordable at all. Triangles moved the wrong way by 60k, which is run-to-run
variance in what the camera happens to hold rather than a saving; nothing was removed.

### Two bugs the driving caught that the code did not look like it had

**Walking up to one picket woke every camp on the map.** `updateCampSleeper` woke `every` enemy with
`e.camp` set, which was correct while there was one camp and is the loudest possible bug with four —
approaching a picket in the west would have stood the Warlord up seventy units away in the north.
The wake is scoped to `e.campId` now. Driven and confirmed: King at camp 0 → `awake in camp0=5,
camp1=0, camp2=0, finale awake=0`.

**A sector can have no good ground in it at all.** Camps are placed one per sector of the circle so
three camps are three directions rather than a cluster — and on seed 42 that produced **two camps
instead of three**, silently, because one 120° slice was river on one side and the main camp's arc
on the other. Two camps is a quieter game and nothing said so; it is the same silent fallback that
stopped #219's wood varying. Anything the sectors cannot place now sweeps the whole circle instead,
with `apart` still holding. Eight seeds, three camps each, minimum separation 37.9 against a
required 30.

### Where the pieces live, and why

The camps are **one more `CFG.finale`**, not a new kind of thing: `campFor(e)` returns the finale or
the small camp an enemy belongs to, so `updateCampSleeper` and `updateCampReturn` stay single copies
of themselves. `wakeRadius` 14 and `leash` 26 are tighter than the finale's 20 and 38, because a
leash of 38 on something 46 units out would chase the King most of the way home.

**Positions are the map's; state is the run's** — the same split the resource seams have. Where a
camp stands is seeded with the rest of the hinterland (#219) and lives on `world.camps`; whether it
is broken and on which night lives on the game and is rebuilt every reset. The save stores the
broken ones **by id rather than by index**, because a list read positionally is a list that silently
means something else on a map with a different number of camps.

**They spawn on the usual ring, not at the camp.** A camp is 46–62 units out and a night is 30
seconds, so raiders walking the whole way would arrive after it. The *direction* is the truthful
part: what walks out of the dark comes from the thing you chose not to attack.

**The minimap draws them over the fog**, unlike the resource seams, and only once a camp has started
sending a party at you — at which point you have stood on your own wall and watched them walk in
from that direction, so the map is showing you something the King already knows. Under the fog it
would be a strategic layer nobody can act on until they have wandered 50 units into the dark on the
off-chance.

## A mat goes where the King can stand (#230, #231)

Two bug reports from a phone, one root cause each, and both found the same way: stand the village up
in a real browser and **measure every mat against the world the game actually built**, rather than
against the arithmetic that placed it.

### The archers' mat was in the river (#231)

> "After extending the village twice the archers mat is in the water and I cannot reach it."

`CFG.tower.padOffset` is `[0, 3.6]` and it was applied to every tower unconditionally. South is the
right answer for a tower standing in the middle of the village — it is the face the camera looks at,
which is the whole of #139's reasoning and still true. It is the wrong answer for a tower standing
**on a wall**, because south of a south-wall tower is *outside* the village, and at the south-east
corner of tier 2, outside the village is the river.

Measured, with every tower stood up and every mat sampled at its four corners against `riverInfo`:

| | mat | closest to the river centreline |
| --- | --- | --- |
| before | `crew-tower-2-se-1` at (38, 35.6) | **0.71** against a half-width of 3.6 — under the water |
| after | (35.3, 29.7) | 5.63 |

The same sweep found three more mats out beyond the wall — `tower-2-sw`, `tower-2-gs`, and
`tower-1-se` before the second expansion — each of them a walk out of the gate and back round to man
your own tower, and four more sitting on the wall line itself.

**The offset is a preference now, not a rule.** South if south works; otherwise step round the
tower and take the first direction that does, nearest-to-inward first. Written as a search rather
than as a table of which wall each tower is on, because a tower can be **dragged** (#137) and a map's
river **moves with the seed** (#219) — a table would be right about today's fifteen towers and silent
about the sixteenth.

`matStandable` is the whole of the rule, and it asks three things: not in the water, not outside the
outermost wall, and not on *any* wall line — including an inner one, which is the second thing the
sweep caught. Checking only the outermost wall passed `crew-tower-1-nw-1` at (−30, −22.4), which is
comfortably inside the tier-2 box and sits exactly on the tier-1 **west** wall, because expanding the
village does not pull the old walls down. The tiers are tested from their geometry rather than from
`this.walls`, so the answer does not depend on how much of the village happens to be standing when a
tower is registered — during a restore that is "not much".

**And one bug in the fix, which the measurement caught and reasoning did not.** The fan of directions
was written `for (let k = 1; ...)`, so it opened at inward ±30° and **never tried inward itself** —
which for the south-east corner tower is the one direction of the twelve that works. The sweep said
the mat was still in the river while `matStandable` said the spot beside it was fine. Two true
readings that only add up to a bug when you check that the search can reach the spot.

Result: **all sixteen towers, at every tier, get a mat that is dry, inside the walls and off every
wall line.** The four tier-0 mats are unchanged, because south already worked there.

### The bridge mat's price was under the water (#230)

> "I can't see the bridge mat fully and it's just taking loads of coins. Wondering if there is an end
> to it or if it just sinks all my coins."

Both halves of that are one fault. The mat carries its own name, its price and how much of it is paid
— that is what `drawPad` writes on the floor — so the one surface that answers *is there an end to
it* was the part you could not see.

The setback used to be arithmetic: half the river, plus half the mat, plus air, stepped back **along
the road**. That is right only if the road meets the water square on, and neither crossing does — so
6.4 along the road moves you less than 6.4 away from the river, and a square mat's corner is nearer
still than its centre.

| | closest corner to the centreline | bank showing |
| --- | --- | --- |
| before | 3.68 (east), against a half-width of 3.6 | **0.08** |
| after | 4.50 (both) | 0.90 |

It steps back until the whole mat is clear now, asking `riverInfo` — the river the world actually
built, wander and all — rather than trusting a number.

### What this did not change

The same report notes that *"some archer towers are built in the walls"*. They are, and it is the
layout the game has always had: corner and gate towers stand **on** the wall line, which
`tools/layout/check.mjs` names as deliberate ("corner towers straddle their own wall on purpose").
It reads oddly at tier 2 and it is an art call rather than a fault, so it is written down here rather
than quietly changed.

`tools/layout/check.mjs` also reports two problems that predate all of this and still stand:
`keep:pad` sits on the south road (all four roads meet under the castle) and `barracks:pad` straddles
the tier-0 citadel wall. A tool that prints "2 problems" on every run is a tool people stop reading.

## The village stays put; the land around it is seeded (#219)

**The map was the same every run, so the route was the same every run, and the route is the game.**
Learnability is the right thing to optimise for while a game is being built and exactly the thing
that expires: once you know the iron is at the mesa foot and the diamond is across the east bridge,
the walk is muscle memory and all that is left to improve is how fast you do it.

So: **fixed skeleton, seeded outfield.** Not a procedural map — a procedural *hinterland*.

| | |
| --- | --- |
| **Never moves** | The village plot, all three `TIERS`, every pad, the four roads, the river's course, the bridges, the cliff box, the raider camp |
| **The seed's** | Every resource node — where, how many, how rich — and every forest, boulder field, bush, barricade and hay bale |

The split is not a preference. Every measured number in `config.js` is measured against the fixed
layout, `tools/layout/check.mjs` exists because the pad positions are hand-fitted, and `CFG.footprint`
checks them against the models. Randomising any of that is a different game. Muscle memory for the
*build* survives whole, which is what makes moving the *route* safe.

### Nodes are seeded per material, inside a band, by rejection

The economy is balanced on distance — `CFG.base.materialAt` gates each material to a Keep level so
each level-up opens new ground — so a diamond that lands twelve units from the Keep does not make the
run different, it breaks it. `NODE_BANDS` gives each material the shape the hand-placed layout had:
a distance range, an arc, a count, a total stock, how many clumps, and what the opening is owed.

A candidate is generated and then **rejected**, never nudged. Nudging a bad point until it passes is
how a diamond ends up beside the Keep on one seed in four hundred and nobody finds out for a week. A
node has to clear the cliff box, the camp, the river, the roads, the citadel and the mats, and a
diamond has to be on the far bank — judged by `riverSideOf`, which is the same cross product
`world.riverInfo` uses, kept identical on purpose, because a seam judged across the water by one rule
and walked to by the other is a seam nobody can reach.

**And the floor is the map the game has always had.** Rejection is per material and so is the
fallback: a band that cannot be satisfied in sixty attempts keeps its hand-placed nodes. The worst a
seed can do is hand you the shipped layout for that one material. `world.seededNodes` says which
materials actually generated, because a fallback nobody can see is a fallback that quietly becomes
the normal case — which is precisely what happened, twice, and both times the sweep is what said so:

- **Wood is two bands, not one, and the arc matters as much as the distance.** The hand-placed ten
  are seven seams packed between 21.2 and 24.8 in two thickets, plus three out at 52–56. Asked for
  from a single `dist` of `[20, 58]` with a "six within 28" filter, the generator had to roll a clump
  into a narrow ring twice by luck: **wood fell back on seven seeds in ten**. `clumpDist` and
  `clumpArc` say it outright — two thickets by the gate, one wood out west — and when the far stand
  was still drawn from the whole arc it rolled past 210° at radius 52 on three seeds in ten and
  landed *inside the cliff box*. Per-clump bearings: **0 fallbacks in ten, 1 in forty.**
- **One unplaceable point threw away nine good ones.** `if (!placed) break` discarded every point
  after the first failure and failed the attempt with three of ten.

### Two bugs the sweep found that reasoning would not have

**The pad clearance was the grass rule.** Nodes were tested with `nearPad`, which is 2.6 — sized to
keep a *blade of grass* out of a mat's lettering. Measured off the real meshes in a browser, the
widest node spans 1.93 from its centre against a mat's half of 1.8, so **3.7** is the first distance
at which no part of a seam is over something the player has to read and tap. (The shipped wood sits
2.5 from the `crown` mat and does overlap it. That is a fact about the hand-placed layout, not a
licence for the generator to repeat it — so the sweep holds a material to that rule only when the
seed actually generated it.)

**A point was rounded after it was tested, not before.** `+x.toFixed(2)` was applied when the point
was stored, so the value that passed every check was not the value that got kept — and seed 123456
put an iron seam 3.6997 from `tower-1-nw`, which cleared the test unrounded and failed it rounded.
Test the number you are going to keep.

### The scatter's stream, and why seed 0 is untouched

`buildWorld` runs on one `rng(1337)` from top to bottom, and the scatter drew from it. Re-seeding
that stream would have moved the roads and the river's wander, which are on the "never moves" side.
So the scatter has its own — and `seed ? rng(...) : rand` is not a shortcut: **at seed 0 it is
literally the same generator object, consumed in the same order**, so `?seed=0` builds the identical
world it always has, down to the number. That is what every `?view=`, `?tour`, the check suite and
the probe are, and `probe.mjs` now pins `seed=0` outright — a budget check that measures a different
map each run is measuring the seed rather than the change.

### The map has a number, and the save knows it

The ending screen carries `Map 4821067 · tap to copy`, which copies the link that rebuilds it —
keeping whatever else was in the address, so a short run copies a short run. At seed 0 the line is
not drawn: there is no map number to give somebody for the map the game has always had.

**The save stores the seed**, and it has to. `runState().nodes` is an array indexed by position in
`NODES`, which on a seeded map is the list the generator made — hand a run to a different seed and
every quarry comes back with some other quarry's contents, of some other material, somewhere else on
the map, and nothing in the save would say so. Two things close it: `mapSeed()` reads the saved
run's seed *before* the world is built, so Continue gets its own map; and `restoreRun` refuses a save
whose seed is not this world's, before a single mesh is built. The case that leaves is `?seed=N` in
the address overruling a save on purpose, and starting clean on the map that was asked for is the
honest answer there.

### Still a seed per LOAD, not per run

Try Again in the same tab keeps the map. `buildWorld` runs once, in the constructor, and a new map
per restart means tearing the world down and building it again — every merged geometry, ground
shader, instanced field and texture handed back with it. #190 is the whole argument for not doing
that casually: dropping a root unparents everything and frees nothing. It is its own piece of work.
What a player gets today is a different map every time the game is opened, the same one for as long
as that tab lives, and the number on the ending screen to ask for either again.

### How it is checked

`npm run seeds` builds each map in a real browser and holds every node it made to the list above —
the generator runs inside `buildWorld`, reading the roads, river samples and pads it has actually
laid, so there is nothing out here to re-derive and nothing that can drift. Ten seeds by default,
`SEEDN=40` for the sweep. **All 40 legal, one wood fallback.**

One more thing that cost a sweep: `n.pos` on a live node is a `Vector3`, not the `[x, z]` pair in
`NODES`. Read as an array it gives `undefined` on both axes, every distance comes out `NaN`, and ten
seeds in ten report a constraint broken that none of them broke.

## The camera turns itself (#222)

There is no control to give it. The canvas has one gesture and it is spent: a drag is the joystick,
a long press is a building pick-up (#137), and #160 took the double-tap for the dash — "the only
spare gesture a one-thumb game has". A two-finger twist on a phone held in one hand is not a
control, it is a way to lose. So the camera earns its own angle.

**Every number in `CFG.camera` is a motion-sickness number**, and this is the one feature in the
repo where no assertion can find the failure — it happens in a person, minutes in. So: small clamp,
slow ease, rest as the default, off under `prefers-reduced-motion`, and a switch in Settings › Video
for the player who feels it anyway.

**Both biases read a LATERAL offset, not a bearing**, and that is the one real design decision here.
A bearing wraps at due north — which is exactly where the player walks most, because that is where
the camp is — so a heading-based target flips sign as he crosses it and the camera swings through
its whole range at the worst moment in the game. A lateral component has no wrap. Driven, at 0.05
steps:

| | yaw |
| --- | --- |
| standing still | 0.00° |
| walking dead north (the finale march) | **0.00°** |
| walking east, held 72s | −22.00°, and −22.00° |
| walking west | +22.00° |
| a 0.6 thumb wobble (deadzone is 0.9) | 0.00° |
| letting go: 2s, then 12s | −8.09°, −0.05° |
| raider to the west while walking east | **+22.00°** — the raid wins |
| that raider at 60 units (radius is 26) | −22.00° — back to the walking bias |
| the opening's captors, and the camp | 0.00° — neither is a raid |

One owner of the yaw at a time and the raid wins; the handover needs no code because both write the
same number through the same ease. A building in hand **freezes** the yaw rather than easing it —
`camPan` keeps the ground under the thumb (#138) and a camera turning under that drag is the one
thing the pan exists to prevent. Held at −21.97° through 15 seconds of placement.

**The distance breathes** 2% in by day to 5% out by night — 18.03 to 19.32 on the ground at the
phone's `camDist` of 23. It is a multiplier rather than a write, because `camDist` is re-derived on
every resize and pinned by `camLock`; writing to it would have the resize handler and the clock
overwriting each other.

**A `?view=` is a framed still, and `camLock` was not enough to say so.** Most views pin themselves
with `camLock` and got this for free, but `?view=road` and `?view=mesa` never set it — measured
breathing 18.03 by day to 19.32 at night, which would have put the board's five "Times of day"
frames at five different distances and made the one comparison that strip exists for a comparison of
two things at once. `game.framed` is set once in `startForView` for any `?view=`, so the rule covers
every view there will ever be rather than the ones somebody remembered. All four now differ by 0.001
between day and night, which is the follow lerp settling and not the clock. `?tour` is deliberately
not framed: it is play, and the camera should behave there as it does in a run.

**The three things that read screen position were driven rather than reasoned about**, because the
ticket is right that "should be fine" is the phrase that precedes the bug. A world point projected
to its pixel and unprojected back to the ground returns **0.0000 error** at −22°, 0° and +22°; the
coin-fly projection and the whole edge-arrow pass run clean at all three. They ask the camera rather
than assuming its angle, and now that is measured.

**Two still frames at different yaws do not compare by eye**, which cost a detour worth recording.
Side by side they look like the camera has moved *closer* — a different set of buildings dominates
the frame, because seeing round things is what orbiting does and is the whole reason #223 wants this
first. The arithmetic says a 22° orbit changes the distance to a point 6 units north of the King by
about 1%. Three independent measurements agree with the arithmetic and not with the impression: a
fixed 4-unit rod at the origin projects to **100.3, 100.5 and 100.5 pixels** at −22°, 0° and +22°;
the camera's ground distance to the King is 18.03 at all three; and the origin's screen position
moves 195 → 134 → 258 across in x with y unchanged. Pure lateral orbit, no scale change.

**What is NOT verified here**: the feel. The ticket's own test is ten minutes of play on a phone,
and the failure mode is nausea. Nothing above can stand in for that — which is why the switch and
the `prefers-reduced-motion` default exist.

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

### Dusk shifts colour rather than draining it (#194)

Dusk used to read as somebody turning the lights down: between 0.52 and 0.62 of the cycle every term
went cool and pale at once -- the sun lost its orange, the hemisphere went grey-blue, the fog went
grey-green -- so there was nothing warm left for the cool to be cool **against**.

The cause is not the hues, it is the geometry. The hemisphere light is the strong one and the day
cycle never used to write its intensity at all, while the sun is a single directional light that by
0.62 sits about 21° above the horizon -- so on flat ground its N·L is **0.36**, against 0.94 at noon.
The sun's share of the light on the ground is about a fifth, and the ground is very nearly whatever
colour the hemisphere is. With a pale blue-grey hemisphere, no choice of sun colour can be seen on it.

So the sun stays amber and goes **strong** through 0.52–0.68, and the blue moves into the fill
underneath it, which is now a keyframe column of its own. Measured as the hue between the frame lit
and the same pixels with the sun at zero -- which is exactly those surfaces in shade, through the same
tone map and the same encode:

| cycle phase | 0.52 | 0.58 | 0.62 | 0.66 | 0.70 |
| --- | --- | --- | --- | --- | --- |
| **was** | 6° | 12° | 6° | 2° | 0° |
| **now** | 13° | 32° | 59° | 64° | 26° |

The obvious reading of "a saturated blue" -- drop the fill and deepen it -- was tried and is wrong
twice over. It reaches 105° of split and ruins the picture: the ground loses the fill, gains almost
nothing from a sun at N·L 0.36, and goes dark, taking rank contrast with it, because contrast is a
**luminance** ratio. The Bandit measured 1.00 against the grass, which is invisible. The fill is
**raised** here, not dropped, and that is what buys the ranks back. Exposure turns out to be nearly
free -- across 1.14 to 1.38 the worst rank moved 1.15 to 1.18 -- so the fill does the readability and
the exposure does the hour.

**What it costs.** Warming the grass walks it toward the two warm tunics. WCAG of each tunic against
the grass at its own feet, both builds driven at the same phases:

| | Bandit | Raider | Marauder | Warlord |
| --- | --- | --- | --- | --- |
| 0.52 | 1.95 → **2.03** | 2.61 → **2.80** | 4.54 → **4.64** | 3.57 → **3.78** |
| 0.58 | 1.25 → **1.29** | 2.16 → **2.21** | 2.95 → **3.40** | 3.05 → **3.27** |
| 0.62 | 1.28 → **1.34** | 2.22 → 1.78 | 2.33 → **2.72** | 2.68 → **2.74** |
| 0.66 | 1.32 → **1.39** | 1.88 → 1.53 | 1.99 → **2.18** | 2.45 → 2.38 |

All four improve at 0.52 and 0.58. The **Raider** is the price: his tunic is pure red and an amber sun
walks the grass toward it, costing about 0.4 at 0.62–0.66. He still sits above the Bandit at every
phase, so the ladder's **order** holds -- which is what a player reads, and the ladder is a hue ladder
(tan, red, purple, black) that a luminance ratio cannot see at all. The Bandit at 1.3 against dusk
grass is bad, and was bad before this; fixing it means moving his tunic, and characters are out of
scope for #184.

Morning, noon and night are untouched: driven at every phase in 0.02 steps against a build from before
the change, the sky is identical below 0.32 and above 0.72. **The blood moon is unchanged** --
identical at all fifty phases, every light value -- because it is the twin this has to be told apart
from at a glance.

`?phase=0.6` pins the day cycle on any frame, and `&blood=1` forces the red sky that otherwise only a
boss night brings. Every `?view=` used to run at the opening morning, because the clock stands still
while the Queen is captive, so half the cycle had no frame anybody could look at. The board has the
same camera at five times of day under **Times of day**, and `views-open` asserts the phase actually
took -- a `?phase=` that quietly did nothing would show five copies of one sky under five labels.

### Fire at night: lanterns and torches (#212)

Nightfall used to be the same field with the light turned down. Now the village has lamps and some
raiders carry torches, so the dark has something burning in it.

**Neither is a light.** No `PointLight`, no shadow-casting source, nothing added to the light budget.
Every flame in the game shares ONE material, `LANTERN_FLAME`, and `updateDaylight` sets its
`emissiveIntensity` once a frame from the day phase:

| phase | 0.30 day | 0.62 dusk | 0.82 night | 0.99 dawn edge |
| --- | --- | --- | --- | --- |
| `emissiveIntensity` | 0.000 | 0.800 | 1.600 | 0.037 |
| torches drawn | 0 | 9 | 9 | 9 |

One assignment lights the whole world. The raiders' torches are a single `InstancedMesh` re-placed
each frame from whoever is carrying one, so a hundred torches cost what one does, and the field
collapses to `count = 0` by day rather than drawing invisible flames.

**Cost, measured on the phone frame**: 210 draw calls by day and 237 at night with twenty raiders on
the field, against a budget of 400. Nine lamps are nine draws — an emissive material skips both
`bake()` and `mergeGroup`, so a flame cannot merge with its neighbour — plus one for the torch field.
72 triangles in total.

**Nine of fourteen lamp stations take a post, and that was measured rather than assumed.** The first
version placed ZERO, silently: it asked `free()`, whose first clause is `!inVillage`, and `inVillage`
is the outer tier's 82-by-70 footprint, which contains the whole ring. Nothing errored; night simply
had no lanterns, and a traverse of the built scene for meshes sharing `LANTERN_FLAME` found exactly
one — the torch field. A lamp has its own rule now: off the mats, the roads, the river, the nodes and
the building footprints, but NOT excluded by a kind of ground. The citadel is bare of grass because
it is paved and walked over, which is the argument *for* standing a lamp there.

The five empty stations were each checked: one building footprint, three build mats, and the road
leaving the village due north. Real ground, not a bad margin — so the ring is broken where a
village's lamps would be missing anyway.

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

**The deck rotates (#235).** `game.seen` is every card a run has put on screen, and `pickOffer` never
returns an offer of three cards the player has already read while an unread one is left: it swaps
the last card for an unseen one. Measured over 2000 simulated runs (`tools/deck/reheat.mjs`): offers
with nothing new on them at level 10 went from 30% to 0% and at 12 from 46% to 4%. The ticket also
asked for unseen cards to be weighted x3 in the draw; that was written, measured and removed, because
a weighting front-loads the deck -- at x3 every card has been shown by level 11 and two thirds of the
offers at 12 are stale. Twenty-three cards over fifteen offers of three run out under any draw, so
level 15 is not held to a number; `deck-rotates` holds the rule itself (zero stale offers with a card
left) and that an offer is rarely the same three cards twice.

**Six of the cards are rules, not numbers**: the Muster (archers who fall are back at the Keep by
dawn), Fire Arrows (a tower's arrow leaves a raider burning, a quarter of the arrow every half second
for three seconds, restarted not stacked), Fresh Mortar (walls mend by day at 4% a second, never at
night and never a broken one), the Portcullis (a broken gate stands again at dawn and its repair mat
goes), the Tithe (every coin on the field at dawn is credited outright -- not flown, because a field
of two hundred coins is two hundred DOM flights) and the Huntsman (the King's own bow targets a raider
carrying Wren, whom `nearestEnemy` skips on purpose so the army does not shoot into him). Each is a
flag on `mods` read in exactly one place, the same shape as a relic, and wears a "Rule" badge where a
rare card wears "Rare". `dawnRules` in `game-enemies.js` is where the three that happen at dawn happen.

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

## Report a bug (#182)

The report that prompted this said: *"the gameplay has crashed but I am still able to use the menu,
just the game doesn't move when I move my finger."* The menus working is the useful half — if the
frame loop had stopped, the pause button would not have opened anything — so the page was alive and
something between the finger and the King was not. **At least four things do that and they want
completely different fixes:** the frame rate collapsed, `input.suspended` stuck on, a pointer capture
lost, or `game.running` false. One field tells you which. Guessing costs a day and lands on the wrong
one.

Almost all of it was already being measured — `perfSample` (#166), `perfCsv`, `qualityLabel` (#168),
the swallowed-error counter (#54), `sizeReport` (#74), `glReport`. What was missing was somewhere for
it to go.

**The ring is the point.** By the time anybody opens the pause sheet to report a bug, `game.paused` is
true and the stick has been let go — the state worth having is gone, and a report built at that moment
describes the reporting rather than the bug. So every frame writes into a ring of the last 600, and
what the report carries is the last stretch of **play**. Driven with the exact reported symptom — the
stick suspended while the game runs, then the pause sheet opened, which clears it:

```
now           running=true paused=true suspended=false stick=none stuckFor=0.00
while playing 17 frames · 883.3ms median (1fps) · 2550.0ms p95 · 2550.0ms worst
              suspended on 14 of them, stick held on 14
```

The live line says the flag is clear. The play window says it was set on 14 of the 17 frames before
the pause. **That contrast is the whole ticket**, and neither half means anything without the other.
It is two typed-array writes a frame — no allocation, no GC — and it is **not** behind `?perf=1`,
because the bug happens on somebody else's phone with no flag on it and a recorder you have to switch
on beforehand records nothing the first time.

**Where the button is** is the other decision. Settings is the safe answer and the wrong one: a player
who has gone looking through Settings has usually already cleared the state. It is a row in the pause
sheet, because pause is what a stuck game makes you press — and it **replaces** that sheet rather than
opening over it, the way Settings does from there.

**There is no backend**, so the report goes to the clipboard first (the path that cannot fail, and
already proven on iOS by #74's size line) with a GitHub issue link beside it carrying the summary but
not the sample log — a URL has a practical ceiling around 8 000 characters and the log passes that
within a minute of play. **There is deliberately no `mailto:`.** It would mean putting a personal
address in a public repository for anyone to scrape; one constant would add it if that is wanted.

The report is **shown before it is sent**. It carries a device profile and the run's numbers and the
player is entitled to read that first — and it is also the only way anyone can tell it captured the
right moment.

Two things the phone frame caught that the code could not, both in that box: the panel centres its
text, and a centred `pre` centres every line independently, so the label column came out ragged and
the padding was wasted. And the first version scrolled horizontally rather than wrapping, on the
argument that breaking `running=true paused=false suspended=true` mid-flag loses which value went
with which name — true, and beside the point, because at phone width it cut the right-hand half of
every line off the screenshot, and a screenshot is the fallback for exactly the player whose
clipboard did not work. **Visible beats aligned.**

It also answers the open question in #183: the `build` line is the hash the service worker is
*answering* with, so "am I even running the build I think I am" stops being unanswerable from a
screenshot.

### And a black box, because a crash takes the ring with it (#190)

The ring above is in memory. #190 asks whether the crashes are an **out-of-memory kill** by the OS —
which reloads the tab and looks like a crash — or a **lost WebGL context**, which is the game's own
`watchContext` path; they have completely different fixes, and from the next page load they look
identical. The ticket's plan for telling them apart is to copy `?perf=1` at ten, twenty and thirty
minutes, and **that plan cannot catch the thing it is aimed at**: the log is in the tab that died.

So a dozen fields go to `localStorage` every five seconds, and the next load reads them *before* it
writes its own. The field the question turns on is `ended`:

| | |
| --- | --- |
| `context-lost` | `webglcontextlost` fired. The page was alive and the GPU went away |
| `closed` | `pagehide` without bfcache — navigated away, or the tab was closed |
| `frozen` | `pagehide` **with** bfcache — backgrounded, not closed. A kill after this is still a kill |
| absent | none of those ever fired: the tab stopped between one five-second write and the next |

Driven in a browser, all three, read back through `?view=report` the way a person would:

```
last session  STOPPED WITHOUT WARNING -- no pagehide, no context loss, which is what an OS
              kill looks like · 0m01s into the run, 0m18s on the page · night 7 · 181
              geometries · 42 textures · heap 95.5 MB
```

The renderer was killed outright (`chrome://crash`) and **the record survived it**, with the run's
state intact — which is the whole premise, and was not obvious beforehand.

**The loss is sticky, and that is the bug this found.** The first version recorded `context-lost`
correctly and then `pagehide` wrote `closed` straight over the top of it when the tab was closed — the
one fact the ticket is trying to establish, erased by the most ordinary thing a player does next. The
game *recovers* from a loss and says so, so "it happened at 4m10s and play carried on" is a real and
separate answer from either ending, and it now outlives every later write.

Five seconds because the cost is a ~200-byte synchronous write and the resolution only has to be
finer than the thing being measured. Every access is wrapped: `localStorage` throws outright in a
private window rather than returning null.

`black-box-outlives-the-tab` holds it (`npm run check`): lose the context, navigate away the way a
player would, and read the line off the real report. Its sabotage is the record never landing.

## And then the report is rewritten as a ticket (#207)

The report above is the right shape for the person sending it and the wrong shape for the person
picking it up. Forty lines of device profile with one sentence of human at the bottom — *"the archers
in the tower are standing on the roof"* — is evidence, not a ticket, and the wish typed on a phone at
the other end of the range (*"it would be nice to have some release notes in the settings about
area"*) is not one either. **Both are exactly the right thing to send.** The cost of reporting has to
stay near zero or the reports stop; the work of turning one into something anybody can pick up cold
is separate work, and most of the answer to it is already in the repository.

So `.github/workflows/triage.yml` listens for `issues: opened` and runs `tools/triage/refine.mjs`,
which reads the issue, reads `CLAUDE.md`, and builds a map of every source file and tool out of the
first sentence of its own header comment — falling back, for the four that open with imports rather
than a comment, to the line the README's own project layout already keeps about them. Then it
rewrites the issue in place: what was asked, what it probably touches, what is genuinely ambiguous,
how anybody would know it was done, and the **Model and effort** line CLAUDE.md says every ticket
ends with.

Three things it does not do, and they are the design rather than the caveats:

- **It never throws away a word.** The report goes back into the body verbatim, under a fold. The
  rewrite is a *reading* of the report and can be wrong, and the only way anyone catches that is by
  having the thing it was read from.
- **It never invents a fact about the game.** Everything it asserts comes from the report, from
  CLAUDE.md or from the map; anything it cannot ground there it asks as a question instead. A
  confident wrong pointer costs more than no pointer, because somebody follows it.
- **It never decides.** No labels, no closing, no assigning, no priority, no reply. It has read one
  sentence from a person and a repository, and neither of those says whether the thing is worth
  doing. It also signs what it wrote, in visible prose rather than an HTML comment: anybody reading
  the issue is entitled to know a model wrote it, and a hidden marker means only the robot can tell.

It runs on `opened` **and nothing else**, because the rewrite is an edit and an `edited` trigger would
watch itself work. The marker it signs with is the second latch — a re-run, a replayed delivery or a
double dispatch all stop there rather than rewriting a rewrite — and `workflow_dispatch` takes an
issue number so an old one can be put through it, or a bad rewrite redone after the prompt is fixed.

Anybody can open an issue on a public repository, and the body goes into a prompt — so the system
prompt says in as many words that a report is data and that one telling it what to write gets
rewritten like any other. The defence that actually matters is the shape of the thing rather than
that sentence: no tools, one `PATCH`, the original kept, and nothing a stranger typed ever reaching a
shell — the workflow passes an issue *number*, and the title and body are fetched inside the script.

It wants an `ANTHROPIC_API_KEY` secret. **Without one it prints why and exits 0**: a repository that
has not been given a key should not collect a red cross on every issue anybody opens. The model is
Opus, for the reason CLAUDE.md gives for reaching for it — being wrong here is cheap to do and
expensive to catch, because a plausible, well-written, confidently wrong ticket reads exactly like a
good one right up until somebody has spent a morning on it.

## What the checks are worth (#179)

`npm run check` drives the real game in headless Chromium and writes `public/board/checks.json`,
which is what the board's Tests page reads. Four of those checks have been **wrong about the game**
rather than the other way round, and the cost of that is not the noise — it is that a suite which has
cried wolf teaches you to explain away the one real failure it finds. `queen-visible` was called a
false positive twice and was right both times (#181).

**The sleep is gone.** `boot()` waited for `game.king` and then slept 1200ms, and that one line is
behind three of the four. Measured in a real browser: `?tour` satisfies the wait at **frame 7** with
the King still on his opening mark at `[0, 2]`; he is moved to `[0, 8]` at **frame 11**, and Wren
walks in and settles at **frame 15** — 22 seconds of wall clock, because a SwiftShader frame is about
a second. **1200ms is a fraction of one frame.** Every check that started there was reading the
opening mid-placement and reporting what it saw as a bug.

It waits on the game's own clock now: the King not having moved for three consecutive animation
frames (`polling: 'raf'`, the only sampling rate that means anything here), with a frame floor
because he is already still *before* the opening moves him. And with a **ceiling**, which matters
more than it looks — some views walk him, and a King who never stops would never satisfy a settle
test. A check that is slightly early might be wrong; a 150-second timeout is a red beside "the walls
are solid" saying the walls leak.

**And a check can now prove it can fail.** Every one of the four passed review because the reasoning
looked right, and none had ever been run against a deliberately broken game to confirm it went red
for the reason claimed — a check that has never failed on purpose has not been tested.

```
npm run check -- --prove
```

breaks the game the way each check exists to catch and expects **red**.

**The first thing it found was a check written the day before.** `hud-quiet` (#197) replayed the
HUD's setters with unchanged arguments and asserted a `MutationObserver` saw no writes — and called
`ob.disconnect()` in the same synchronous block as the replay. A MutationObserver delivers its
callback as a **microtask**, and `disconnect()` empties the record queue, so the callback never ran
and `writes` was empty whatever the HUD did. Its headline assertion, the one guarding the house rule
that everything in `Hud.set` dirty-checks, **had never been capable of failing**. It takes
`ob.takeRecords()` before disconnecting now, and under sabotage it reports *"the HUD wrote 10 times
when replayed with unchanged values"* — ten writes for ten replays.

Two of the other three that came back red on the first prove run were the **sabotage** being wrong
rather than the check: `views-open` does its own eighteen navigations and never calls `boot()`, so
sabotage delivered through `boot` could never reach the check with the worst record. It goes through
`addInitScript` now and arms on every navigation, which is why where a check chooses to go is no
longer the harness's problem. The sabotage is aimed at the
specific thing the registry claims that check covers, never at "make the page throw", which any check
would notice and which proves nothing: `walls-solid` loses `collideWalls`, `bands-hooked` keeps its
hook and loses its flag, `queen-visible` gets #181 put back exactly as it was, `hud-quiet` gets a HUD
write on every frame. A check that stays green under its own sabotage is not covering what it says it
covers. A check with **no sabotage written** is reported as a gap rather than counted — the same
honesty the `judged` rows get, because a gap you can see beats a number that flatters. The prove run
writes nothing to the board: it is a question about the checks, not about the game.

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
public/board/     the admin page at /board/ -- dashboard, UI (incl. a phone view and the element
                  sheet), brand, cast, world, tools, tests, tickets, players. Check UI work at
                  /board/#/ui/<group>/phone before calling it done; see CLAUDE.md
tools/board/      measures dist/, the palette, the cast and the structures (npm run board)
docs/brand.md     the brand decisions and what is still open (the board renders it)
docs/cast-review.md  every character model against the story and the art pass
docs/art-pass.md  the art-direction brief for the world, and what of it landed
docs/competitors.md  what players say about the games nearest this one (/board/#/players)
tools/checks/     the check registry and its two runners, free and headless (npm run check)
tools/blender/    Blender script that builds and exports rigged characters (public/models/*.glb)
tools/fit/        fits a character to a reference image, locally, with no AI in the loop
tools/icons/      draws the home-screen icons from the game's own crown (npm run icons)
tools/models/     re-compresses the exported characters with meshopt (see Making characters)
tools/probe/      drives the built game headless and reports what the renderer did (see its README)
tools/scout/      offline pass that studies the game and files improvement issues (see its README)
tools/triage/     #207: rewrites a new issue as a ticket the moment it is opened (npm run triage)
src/world.js      terrain, paths, cliffs, trees, lighting
src/input.js      virtual joystick + keyboard
src/hud.js        DOM overlay
src/icons.js      hand-drawn SVG icon set used by the HUD and rasterised for the build pads
src/audio.js      Web Audio synth: music loop and sound effects
src/report.js     #182: the bug report, and the ring of recent frames it is built from
src/releases.js   #206: the release notes -- written, not measured, and the only copy of what they say
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
instance counts (contact shadows, pebbles, smoke and the crowd must not move; grass, clover, flowers
and stones breathe with the window around the King since #191), and the GPU objects and for-ever
caches (geometries, textures, programs; materials, tags, popups). A count that only ever climbs
across a run is the leak, named.

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

**And the soak could not see the biggest one** (#190). The answer above is right about the JS heap and
blind to the GPU, because it ran with `renderer.render` stubbed out -- and `renderer.info.memory`
counts what has been **uploaded**. With nothing rendering, nothing uploads, so a leak that is entirely
GPU-side reads as zero by construction, which is how "the geometry count plateaus" survived a thirty
night soak. Driven again with the renderer **on**, a restart cost **22.85 geometries** every time:
`reset()` dropped the old `game.root` out of the scene, and dropping a root unparents everything and
frees nothing. Thirty restarts left 520 geometries resident where a fresh page has 197.

`disposeRun` walks the outgoing root and disposes what the scene no longer holds. The keep-set is
built by traversing the scene **after** the root has been removed, so anything still reachable -- the
world, a cached mesh, a geometry two objects share -- is by definition not this run's to free.
Materials and textures are deliberately *not* swept: `mat()` hands one material to everyone who asks
for a colour and `bake()` puts half the world on three singletons, so a sweep there would dispose the
program the rest of the scene is drawn with and recompile it. The per-run ones are still freed by
name, which is why those three lines above it exist.

The other half was **bone textures**, which nothing in this repo makes and nothing was freeing. Three
builds a `DataTexture` of the bone matrices per *skeleton*, lazily, the first time a skinned mesh is
drawn, and `cloneSkeleton` gives every rig its own -- so each character on the field held an 8x8 float
texture the renderer knew about and the game did not. Named by hooking `Texture.prototype.source` at
construction and reading the creation stack: **0.8 a restart** on the instanced path and **3.45 in
safe mode**, where the crowd is off and every character is a real `SkinnedMesh`. `Skeleton.dispose()`
frees it and nulls it, and a skeleton that is somehow used again simply recomputes one.

Measured after, renderer on, three full rounds of rain, rebuilds, thirty restarts, 3,000 raiders,
portraits and resizes: a restart now gives geometry **back** (-10, -14, -14 across the three rounds)
instead of costing 22.85 each, textures settle at 48 and stay, programs at 51, materials at 73, and
the heap settles at 64 MB after the first round and does not move across the next two. **The one thing
still climbing is raiders** -- 3,000 spawned and killed adds 20-29 geometries, most of which the next
block of restarts gives back, leaving about +6 a round. That is not resolved and is on the ticket.

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

## How big the world can be (#211)

**It can be four times the size for nothing, and that is not the interesting part.**

Measured by setting `CFG.world.size` and reading `renderer.info` off a real run at `?tour`, once the
world had settled:

| `world.size` | draw calls | triangles | fog texel | King's clamp | meshes in the scene |
| --- | --- | --- | --- | --- | --- |
| 190 (today) | 274 | 1,106,481 | 0.74 u | ±92 | 451 |
| 380 (2×) | 254 | 1,083,059 | 1.48 u | ±187 | 606 |
| 760 (4×) | 252 | 1,083,221 | 2.97 u | ±377 | 755 |

**Draw calls and triangles do not move.** They fall slightly, because a wider world puts less in the
frustum at once. Three things already in the repo are why, and they are the answer to "will the game
cope":

- **The grass is a window, not a field** (#191). `setGrassWindow` follows the King, so the tuft count
  is 10,093 at every size above — identical, to the tuft.
- **Static scenery is merged.** `mergeGroup` collapses trees, rocks and cliffs into a handful of
  draws, so extent and draw calls are not the same axis.
- **Scenery is placed by fixed COUNTS, not by density.** `place(maker, count, …)` scatters a set
  number over `half = size / 2 - 6`.

That last one is why the honest answer is not "yes, go as big as you like". A bigger world is not
heavier — **it is emptier.** At 4× the same furniture is spread over sixteen times the ground. The
mesh count rises (451 → 755) only because the scatter's rejection tests fail less often when there is
more free space, so it gets closer to the counts it was always asking for. It is bounded by those
counts either way.

So the limit is content, not performance. What breaks first, in order:

1. **The fog of war and the minimap are 256 × 256 canvases stretched over the whole world**
   (`buildFog`, `fog.scale = 256 / size`). A fog texel is 0.74 units today and **2.97 at 4×** —
   coarser than a building is wide. This is the cheapest thing to break and the least obvious, and
   the fix is one number: the canvas costs a redraw, not a frame.
2. **Emptiness**, as above. Anything past 2× wants the scatter counts to scale with area, or the new
   ground is a lawn.
3. **`?view=map`** frames the board at a hard-coded `camDist 72`, chosen by projecting the tier-2
   corners. It would need redoing.

**And the thing worth knowing whatever happens to the size:** the King is clamped at
`CFG.world.size / 2 - 3`, so today he can walk to **±92** — far outside the tier-3 ring at ±38, into
open ground, until an invisible wall stops him. That clamp *is* the edge of the game a player can
feel, and it is a long way outside anything the game has put there. Making the world bigger moves the
wall further out; it does not stop it being a wall. That is #210's question, not this one's, and the
two should be decided together.

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

### And then it says what the update was for (#206)

An update row that can be believed still only answers *whether* you are current. Under it is
**What's new**, and the two are one story: a build is ready, here is what came with it, and the build
hash between them is the only honest way to tell which one you are on.

`src/releases.js` is the list, and it is a **written** file rather than a measured one — which makes
it the odd one out in a repository where the board's rule is that nothing on it is a copy of anything.
Everything else the game reports about itself is counted out of the thing itself, because a written
number goes stale and nothing tells you. A release note is the other kind: it is a judgement about
what a change means to somebody holding a phone, and there is nothing to count it from. *"The tufts'
cache key moved"* is written for whoever reads the diff next. So it lives beside `docs/brand.md` and
`src/story.js` as a person's file, under one rule that keeps it honest: **a release is added in the
same commit as the work it describes, or it does not get written at all.** Nobody reconstructs a week
of notes afterwards, and a list with a hole in it reads as *nothing changed* rather than as *nobody
wrote it down*.

Each release carries `added` and `fixed`, and that split is the whole of the ticket. **`added` is
announced; `fixed` is only listed.** After an update installs, the page reloads — so the build with
something to say is always the one booting — and the title screen gets a **What's new** window
holding only what is new, with the fixes counted into one line that says where the rest of them are.
A window that interrupts somebody to announce four bug fixes is a window that teaches them to dismiss
windows, and nobody reads the third one. The fixes are still worth writing down and still worth
reading: they are the answer to *"was that me?"*, and that is what the list under Settings is for.

The identity is a plain counter, deliberately **not** a version number. The game has no version
scheme anybody honours — `package.json` has said `0.1.0` since the first commit and the build a
player is running is a content hash of the bundle — so a `1.4.0` here would be a second thing to keep
in step with nothing. What the player sees is the date and the title; what the code compares is the
counter, against one key in `localStorage`.

Three cases come out of that key and only one of them opens anything. Nothing stored is a player who
has **never opened the game**: marked silently, so their first real update is their first greeting
rather than a window telling them what changed about a game they have not played. Unseen but fixes
only: no window, and the row in Settings carries a **New** mark instead — the standing signal goes in
the row, the way the diary's count does, because the dot on the settings cog belongs to #120 and one
dot with two meanings tells you neither. Unseen with something new: the greeting.

Which means **this build announces nothing to anybody**, and that is right rather than broken: the
key does not exist yet, so every player alive comes through as a first visit and is marked quietly.
Nothing in a browser can tell a new player from an existing one on the first build that looks, and of
the two available mistakes, greeting somebody with a list of changes to a game they have never played
is the worse one. It costs one release.

Two of those three failures are invisible to whoever they happen to, which is why `release-greeting`
is a check rather than a thing that was reasoned about. A greeting that never opens looks exactly like
a build with nothing to say; the one that greets a first-time player is something nobody with the game
already installed will ever see happen. It drives three cold loads with the marker moved between them,
and it goes red under a sabotage that stops the marker sticking.

Both shapes of the panel are on the board — `?view=releases` for the list, `?view=whatsnew` for the
greeting — and neither of them **writes**. A view is the real game on the real origin, so a frame that
marked the notes read would quietly eat the update greeting of whoever is playing in the other tab,
the same side effect `?view=defeat` exists to avoid by not calling `gameOver`.

Cache lookups pass `ignoreVary`. Without it the shell loads offline and the bundle does not: a server
answering `Vary: Accept-Encoding` makes the browser compare request headers against the ones that
filled the cache, and a module script does not ask the way the install-time fetch did.

Registration is skipped in `npm run dev`, where a worker caching the bundle would fight Vite's
reloading.

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages through the workflow in
`.github/workflows/deploy.yml`. `npm run build` produces the same static site in `dist/` if you want to host
it elsewhere.
