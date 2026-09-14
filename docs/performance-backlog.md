# Performance backlog

Five pieces of work from a review of the rendering stack, biggest win last because it is also the
biggest change. Budgets and the `?perf=1` overlay they are measured against are in the README under
[Performance](../README.md#performance).

Where the build stood when this was written: three.js r170, Vite 6, 233 kB gz of JavaScript, 644 kB of
Draco-compressed models behind a ~250 kB decoder, nine characters each drawn as their own skinned mesh
with their own `AnimationMixer`.

**All five are done.** What each one actually cost and bought is recorded under it. Everything was
measured with `tools/probe/probe.mjs` on the same seeded 183-character scene, so the numbers compare.
What is left to do is at the bottom.

## 1. Upgrade three.js from r170 to r186

`package.json` pinned `three@^0.170.0` and the lockfile resolved to 0.170.0, sixteen releases behind
the current 0.186.0 and missing a year of renderer fixes.

The things most likely to break across that many releases, and so the things to check:

- the `examples/jsm` imports: `GLTFLoader`, `DRACOLoader`, `SkeletonUtils.clone`,
  `BufferGeometryUtils.mergeGeometries`
- the `onBeforeCompile` shader patching in `src/rig.js`, which matches on chunk names
  (`roughnessmap_fragment`, `metalnessmap_fragment`, `emissivemap_fragment`, `begin_vertex`)
- `outputColorSpace` and `ACESFilmicToneMapping`: colour handling has moved before

**Done when** the game boots, the world looks the same, and `?perf=1` shows no regression.

**Done.** The chunk names all survived. Two things came out of it that were not expected: the bundle
grew 842 kB to 900 kB raw, and on desktop the same 183-character scene went from 835k triangles and
1048 draw calls to 1.70M and 1268 — about one extra draw of every character. The phone path, which has
no shadow map, was unchanged, so the difference is confined to the shadow pass: r186 renders the
characters into the shadow map where r170 did not. Which release changed that was not pinned down.
Ticket 4 is what makes it cheap again.

## 2. Self-host the web fonts

`index.html` pulled Baloo 2 and Nunito from `fonts.googleapis.com` through a render-blocking
stylesheet behind two `preconnect` hints. That is a third-party DNS lookup, TLS handshake and round
trip in front of the first frame of a game that otherwise loads from one origin. `src/main.js` waits
on `document.fonts.ready` before it enables Play, so the delay is felt directly.

Vendor the woff2 files, declare them with local `@font-face` rules and `font-display: swap`, drop the
`preconnect`s, subset to Latin.

**Done when** the built site makes no third-party requests and the faces are unchanged.

**Done.** Both families turned out to be variable fonts — one file covers 600 to 800 — so it is four
files, not twelve: two families in two character ranges, of which an English player fetches two,
72 kB. They live in `src/` rather than `public/` so Vite hashes them and writes URLs relative to the
stylesheet; an absolute `/fonts/` path would have 404'd on the project page, which is served under a
subpath. Verified in a headless browser: both `latin` faces load, both `latin-ext` stay unloaded, and
the build makes no third-party request at all.

## 3. Swap Draco for meshopt

The nine character GLBs total 644 kB with `KHR_draco_mesh_compression`, and decoding them costs a
192 kB wasm decoder plus a 58 kB wrapper. A quarter of a megabyte of decoder to save a fraction of
that on nine small models is the wrong trade, and Draco's decode is the slower of the two.

Re-encode with `EXT_meshopt_compression`, swap `DRACOLoader` for `MeshoptDecoder` in `src/rig.js`,
update the Blender export in `tools/blender/make_character.py`, delete `public/draco`.

**Measure before committing.** If meshopt turns out larger on the wire than Draco by more than the
decoder saves, the change is still worth it for decode time, but say so in the commit rather than
claiming a size win that is not there.

**Done when** total bytes to first playable frame are down and the characters are identical.

**Done, and meshopt won on both halves.** Brotli'd across the nine characters: Draco 341 kB of models
behind a 57 kB decoder, meshopt 308 kB behind a 7 kB one, no compression at all 439 kB. Time to
playable fell 4658 ms to 3600 ms and requests 20 to 14. Note the probe's byte figure moves the other
way, 1838 kB to 1898 kB, because it counts decoded bytes and a meshopt GLB is larger before
compression — the wire figures are the ones that reach a player. An unplanned bonus: r186's
`DRACOLoader` had begun emitting a second copy of the Draco decoder into `dist/`, about a megabyte
nothing ever fetched, and that went too.

## 4. Instance the crowd with baked bone textures

The ceiling on this game. Every unit gets its own skeleton clone (`src/rig.js`) and its own
`AnimationMixer`. At a hundred characters that is a hundred mixer updates, a hundred bone-texture
uploads and a hundred draw calls a frame, doubled on desktop by the shadow pass. The rate-halving in
`Game.update` for characters far from the King is a mitigation, not a fix.

Bake each rig's animation clips into a bone-matrix texture once at load — bones across, frames down,
which for thirty bones and seventy-odd frames is tens of kilobytes, not megabytes — then draw all
units of a type as one `InstancedMesh` whose vertex shader does the usual four-bone blend against
that texture. Per-instance attributes carry which clip, what phase, and the rank tint.

Crowd types only: `raider`, `elite`, `brute`, `archer`, `swordsman`. King, Queen and boss stay on the
real skinned path, because they need bone attachment and blending.

Build it behind a flag with the existing path as the fallback, so a device where it misbehaves has
somewhere to land.

**Done when** character draw calls fall from roughly one per character to one per type, CPU frame
time drops with it, and the crowd animates as it did before.

**Done** — `src/crowd.js`, six models, 165 of 181 instanced characters drawn in 6 calls.

    desktop   draw calls 1305 -> 966,  textures 195 -> 35,  triangles flat
    phone     draw calls  940 -> 862,  textures 158 -> 32

The phone gain is smaller because its narrow viewport already culled most of the crowd.

Three things were not obvious going in. The bones hang off an armature node rather than the character
root, so the bake has to clone the real hierarchy rather than rebuild the skeleton by hand. The depth
material needs the same skinning or every character casts a bind-pose shadow, and it has to build the
matrix at the top of `main()` because the depth shader's `beginnormal_vertex` sits inside
`#ifdef USE_DISPLACEMENTMAP`. And instancing gives up frustum culling — one instanced mesh is one
object to the renderer — which cost 10% more triangles until the instance writer started testing each
character against the view itself.

The King and the Queen stay skinned. `?crowd=0` puts everything back.

## 5. Split game.js

`src/game.js` is 3,633 lines. This one buys no frames; it buys the ability to keep working. Split
along the seams already there — waves and spawning, combat, building and pads, camera and daylight —
with no change in behaviour.

**Done.** 3,651 lines became 642, with the rest in four files of roughly 400 to 930 lines each:
`game-build.js`, `game-enemies.js`, `game-units.js`, `game-view.js`, plus `game-shared.js` for the
scratch values they all use.

They are still one class. Each file exports a plain object of methods and `game.js` puts them on
`Game.prototype`, because a class method and an object-literal method are written identically — so
every method moved verbatim and `this` is the same `this`. The cut was made by a script working from
method boundaries rather than by hand, and the built bundle changed by 190 bytes, which is about the
best evidence available that nothing was lost on the way.

What stayed in `game.js` is the frame: constructing the renderer, resetting, starting and stopping,
and the one `update` loop that calls everything else.

## 6. The 966 draw calls were not scenery, and mostly were not real

The five above left the desktop renderer drawing 966 calls on a 183-character scene, from 1,055
visible objects: 443 boxes, 236 unnamed buffer geometries, 119 circles, 111 rings. That was written up
as a scenery problem — issue #39 — on the reasonable assumption that a count of boxes meant boxes.

**The count was wrong, and the tool that produced it was at fault.** The probe paced its sample by
wall-clock. A frame here takes about a second under SwiftShader and the game caps `dt` at 0.05s, so
ten seconds of waiting advances the simulation by about half a second. Everything short-lived —
spawn effects, hit sparks, arrows in flight, coins before anyone picks them up — was therefore still
on the field at the end of every sample, and was counted as though it were permanent. The single
worst case: 660 draw calls of spawn effect, 55 live effects at twelve meshes each, where the same
scene given six seconds of real game time has **four**.

The probe now counts game time and prints both clocks, so the gap cannot hide again.

Measured properly — same seed, same scene, six seconds of game time, about a hundred characters —
the standing cost was:

    176  coins on the ground
     65  resource nodes
      7  popups
      4  spawn and hit effects
      3  arrows
    ~200  world scenery, most of it culled before it is drawn
    ---
    326  draw calls

Not scenery, and inside the README's 400 budget already. The one thing plainly worth fixing was the
coins: a coin was a Group of two meshes, face and rim, and the face cast a shadow, so the
eighty-eight coins a night of raiders leaves behind cost about 260 draws. They are all the same two
shapes in different places, and the King's carried stack had been drawing itself with instancing all
along. `CoinField` in `src/models.js` does the same for the ground.

**326 -> 83 draw calls.** The rest of the list is small enough to leave alone; an arrow is still three
meshes, which is worth remembering if arrows ever become numerous.

## What is left

Nothing urgent. The draw-call budget has plenty of headroom now, and the remaining items are only
worth doing if something makes them numerous:

- An arrow is three meshes — shaft, tip and streak. Fine at a dozen in flight, less fine at a hundred.
- The world's ~200 static meshes are mostly frustum-culled, so merging them would buy less than the
  count suggests. `BatchedMesh` is the right tool if it ever matters, because it keeps per-object
  culling that plain merging gives up.
- The WebGPU renderer would cut the per-call cost of whatever is left, but the `onBeforeCompile`
  patching in `rig.js` and `crowd.js` would have to be rewritten in TSL first.

The lesson worth keeping is the measurement one: a profiler that does not share the clock of the thing
it profiles will invent work that is not there.
