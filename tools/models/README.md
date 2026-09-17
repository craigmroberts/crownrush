# Clips: authoring a death without Blender

`tools/models/clips.mjs` writes the `Death` and `Hit` animation clips into the character GLBs.

    node tools/models/clips.mjs            # add the clips to public/models
    node tools/models/clips.mjs --check    # say what would change, write nothing
    npm run models                         # afterwards, to re-compress

It is idempotent: a clip of the same name is replaced rather than added a second time, so running it
twice leaves the same file.

## Why this is not a `.blend` file

#55 says to add clips in `tools/blender/make_character.py`, which is where the existing Idle, Walk and
Attack come from, and that is the right home for anything an artist would pose by hand. But
`make_character.py` is a `bpy` script and there is no Blender binary in the environment this was
written in, so the choice was between no clips at all and clips authored as numbers.

Numbers are reasonable *here*, and that is a fact about this rig rather than about animation. It is
seven bones:

    root -> leg.L, leg.R, spine
    spine -> arm.L, arm.R, head

with the arms and legs bound at 180 degrees about X so they hang downward. No elbow, no knee, no
finger, no jaw. A death on a rig like that is four or five angles over half a second.

If Blender ever is available, a hand-posed clip of the same name should simply replace what this
writes. `bakeBones` takes whatever clips it finds and this adds nothing to the format.

## How to look at one

Neither clip was tuned by reasoning about it. Both were rendered and looked at, and both changed
substantially as a result -- see "What the frames changed" below. Two harnesses, in that order:

1. **A frame strip, out of the game.** A page that loads one GLB, plays one clip, and renders eight
   poses across it in scissored cells so no pose is lens-skewed by sitting at the edge of a wide
   strip. Render it with `?topple=1` as well: that applies the same tip curve `updateEffects` runs,
   which is the only way to see what actually reaches the screen, because the clip is only half of a
   death.
2. **The real game, stepped by hand.** Spawn a few raiders, kill them from four different directions,
   and walk the fall one update at a time.

The second one has a trap in it. A frame under SwiftShader takes about a second and `dt` is capped at
0.05, so a screenshot spans several rendered frames: shooting in a loop skipped most of a
half-second fall and shot 3 of 10 was already an empty field. Take the clock off `requestAnimationFrame`
and step it instead --

```js
window.__realUpdate = game.update.bind(game);
game.update = () => {};
window.__step = (dt) => window.__realUpdate(dt);
```

-- then one `__step(0.05)` per screenshot. Two more things worth knowing: the kill burst covers the
first third of the fall, so stub `burstFx` to look at the clip itself; and killing the enemies that
are already on the field wins the run and puts the victory screen over the shot, so spawn your own.

## What the frames changed

- **The first Death was too weak to see.** The spine peaked at 0.33 rad of forward bend and the arms
  ended near the bind pose, which at the game's camera distance was indistinguishable from the rigid
  topple it was meant to improve on.
- **The second was too strong in the wrong axis.** A forward curl composed with a forward topple puts
  the head through the floor: rendered at `topple=1` the second half was a pair of legs and no man.
  63 degrees of spine on top of 90 of topple is 153 from upright, which is face-down with the torso
  under the grass.
- **So the slump is a twist, not a curl.** The spine barely bends and the deadness is carried by
  things that read the same whichever way the body goes over -- a twist about Y, a side-bend about Z,
  the head lolled onto a shoulder, and above all the arms dropped wide.
- **Hit needed legs.** Without them the crowd path stood a staggering man's legs bolt upright for a
  fifth of a second, because a one-shot there replaces the looping clip rather than blending with it.

## What they cost

Measured, not estimated -- `bakeBones` is the only thing that knows how many rows a clip becomes.

| | before | after |
| --- | --- | --- |
| Rows per model | 115 (Idle 60, Walk 30, Attack 25) | 136 (+ Death 15, Hit 6) |
| Bone texture, per model | 50.3 kB | 59.5 kB |
| Bone textures, six crowd models | 301.9 kB | 357.0 kB (+18%) |
| Models on the wire, brotli'd | 3304 kB | 3317 kB (+13.7 kB) |

The ticket guessed 25-60 rows a clip; these are 15 and 6, because they are short. The bone texture is
RGBA float, four texels per bone, seven bones -- 28 texels a row at 16 bytes each.
