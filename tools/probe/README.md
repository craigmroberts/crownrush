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
| `--seconds N` | 20 | How long to sample, per device. |
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
