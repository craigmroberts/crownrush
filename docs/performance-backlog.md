# Performance backlog

Five pieces of work from a review of the rendering stack, biggest win last because it is also the
biggest change. Budgets and the `?perf=1` overlay they are measured against are in the README under
[Performance](../README.md#performance).

Where the build stood when this was written: three.js r170, Vite 6, 233 kB gz of JavaScript, 644 kB of
Draco-compressed models behind a ~250 kB decoder, nine characters each drawn as their own skinned mesh
with their own `AnimationMixer`.

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

## 2. Self-host the web fonts

`index.html` pulled Baloo 2 and Nunito from `fonts.googleapis.com` through a render-blocking
stylesheet behind two `preconnect` hints. That is a third-party DNS lookup, TLS handshake and round
trip in front of the first frame of a game that otherwise loads from one origin. `src/main.js` waits
on `document.fonts.ready` before it enables Play, so the delay is felt directly.

Vendor the woff2 files, declare them with local `@font-face` rules and `font-display: swap`, drop the
`preconnect`s, subset to Latin.

**Done when** the built site makes no third-party requests and the faces are unchanged.

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

## 5. Split game.js

`src/game.js` is 3,633 lines. This one buys no frames; it buys the ability to keep working. Split
along the seams already there — waves and spawning, combat, building and pads, camera and daylight —
with no change in behaviour.
