# Probe: what the renderer actually did

`?perf=1` shows you the numbers while you play. The probe collects the same numbers without you, so a
change can be measured instead of argued about.

From anywhere inside this repository:

    node tools/probe/probe.mjs                    # build, serve, play 20 s, print a report
    node tools/probe/probe.mjs --crowd 120        # hold 120 raiders on the field the whole time
    node tools/probe/probe.mjs --json before.json # keep the report
    node tools/probe/probe.mjs --json after.json --compare before.json

It builds the site, serves the build, drives it in headless Chromium at desktop and phone sizes, and
reports draw calls, triangles, characters, GPU objects, bytes and frame time for each. Screenshots
land in `.shots/`.

## Which numbers to trust

Headless Chromium here renders through SwiftShader, on the CPU. **Frames per second means nothing in
this environment.** Frame time is worth reading only as one run against another on the same machine,
which is why `--compare` exists and why the budget table in the README is not repeated here.

`--seconds` counts **game** time, not wall-clock time, and the report prints both so the gap between
them stays visible. This is not a detail. A frame here takes about a second, and the game caps `dt` at
0.05s, so ten seconds of waiting advances the simulation by about half a second. Anything short-lived
— spawn effects, hit sparks, arrows in flight, coins before they are picked up — then sits on the
field for the whole sample and is counted as though it were permanent. An earlier version of this tool
paced by wall-clock and reported 660 draw calls of spawn effect where a real device would have had
four; a ticket was written against that number before the mistake was found.

The same trap catches the HUD, and it is worth knowing because it does not look like the one above.
**A CSS animation or transition advances on rendered frames, not on `performance.now()`.** At about a
frame a second, `getComputedStyle` on something mid-animation reads the value from the last frame, so
a reveal that is meant to take two seconds reports as not started for one second and then most of the
way through. Measured directly: a typewriter reveal's first letter sat at `currentTime: 0` with
`playState: "running"` for 1.2 seconds of `performance.now()` and then jumped past 1.4 seconds in one
step.

So a rect or a computed style read partway through an animation is a frame, not a moment. Two ways
out, and both are better than waiting longer:

- Run the context with `reducedMotion: 'reduce'`. Every transition is off, so a rect read straight
  after a change is the settled layout. This is how #90's notice clearances were measured after a
  first attempt reported 27px of overlap that was really a notice still on its way up.
- Believe the screenshot. It is the browser's own rendering and it cannot be out of date.

What is exact, and what a change should be judged on:

| Number | Why it is trustworthy |
| --- | --- |
| Draw calls | Counted by three.js, not by the driver |
| Triangles | Same |
| Characters on the field | Read straight out of the game |
| GPU programs, geometries, textures | Same |
| Bytes and requests | Counted from the network, though decoded rather than on the wire |

## `--crowd N`

A plain run never leaves night one: the Queen is still captive, `callWave` refuses, and eighteen
characters is not a crowd. `--crowd N` frees her, puts N raiders and N/2 soldiers on the field, and
tops the field back up every second as they kill each other, so both builds in a comparison see the
same scene rather than whichever one happened to thin out first. It keeps the King alive for the same
reason, and places every raider from a fixed seed rather than `Math.random`, so two runs are two
measurements of one scene and not of two.

This is a measuring instrument, not a way to play: it reaches into the game object directly.

## Options

| Flag | Default | What it does |
| --- | --- | --- |
| `--seconds N` | 20 | How much **game** time to sample, per device. Wall-clock will be far longer. |
| `--crowd N` | off | Hold N raiders on the field for the whole sample. |
| `--device D` | both | `desktop`, `phone`, or `both`. One device halves the run. |
| `--query Q` | — | Query string for the page, e.g. `safe=1` or `hq=1`, to measure one of the game's own rendering paths deliberately. |
| `--json PATH` | — | Write the report as JSON. |
| `--compare PATH` | — | Print the change from an earlier report against `--json`. Measures nothing itself. |
| `--no-build` | off | Serve whatever is already in `dist/`. |
| `--port N` | 4319 | Preview server port. |

## Chromium

It uses a Chromium already on the machine, looked up under `PLAYWRIGHT_BROWSERS_PATH`, and falls back
to Playwright's own download if there is none. Sandboxes and CI images usually ship one.
