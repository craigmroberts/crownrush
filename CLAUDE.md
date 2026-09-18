# Working on Crown Rush

## Landing work

**Always merge finished work into `main`. Do not ask, and do not open a pull request unless one is
asked for.** Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes to GitHub
Pages — so merging is how the change reaches the phone it needs to be tested on. Work that sits on a
branch is invisible to the person who asked for it.

Finished means: it builds, it has been checked in the real game rather than only reasoned about, and
anything it made stale in the README has been fixed.

### One trap, worth knowing before the first merge

A fresh session's clone can have a local `main` whose history is **unrelated** to `origin/main` —
`git merge` refuses it outright with *"refusing to merge unrelated histories"*. That is the local ref
being wrong, not the work. Check before trusting it:

```bash
git merge-base --is-ancestor origin/main HEAD && echo "fast-forward is safe"
```

If that passes, push the branch tip straight at the remote ref and leave the stale local branch
alone:

```bash
git push origin HEAD:main
```

Then push the working branch as well, so the two do not drift.

## Checking a change

There is a linter and a CI budget check now (#53) -- `npm run lint` is correctness rules only, no
style opinions, and `.github/workflows/budgets.yml` runs it and the probe on every pull request.
There is still no test suite, so "verified" means driven in a real browser:

```bash
npm install && npm run build      # dist/
node tools/probe/probe.mjs        # draw calls, triangles, characters, bytes
```

Headless Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and needs
`--use-gl=swiftshader --enable-unsafe-swiftshader --no-sandbox`.

### The download size budget is parked

**Do not raise it, and do not let it shape a decision.** No flagging how close bytes-to-Play is to
the limit, no choosing a smaller asset to stay under it, no asking whether something is worth the
kilobytes. The game is still growing features; the owner will say when it is time to look at load
size again. It is waived in `tools/probe/probe.mjs` so CI cannot put the question back either.

The draw-call and triangle budgets are NOT parked -- those are about whether it runs on the phone.

**Wall-clock time is not game time under SwiftShader.** A frame takes about a second and `dt` is
capped at 0.05, so waiting ten seconds advances the simulation by about half. Anything that depends
on game time — regen, cooldowns, the day cycle — has to be driven directly rather than waited out.
`tools/probe/README.md` explains this; it has already produced one wrong bug report and two wrong
test failures.

## Every ticket says what it costs to do

A ticket ends with a **Model and effort** line, because the price of doing the work belongs on the
work and not in somebody's head. Judge cost per finished job, not per request — a cheaper model that
needs three more turns is not cheaper.

    **Model and effort:** Sonnet 5, medium — mechanical change, the verification is the hard part.

Rough shape, and say why in half a sentence rather than just naming one:

| | For |
| --- | --- |
| **Haiku 4.5** | Mechanical passes with an obvious right answer: a copy change, a rename, a lint sweep |
| **Sonnet 5** | Ordinary build-and-verify. Most tickets. A clear spec and a way to check it |
| **Opus 5** | Anything where being wrong is expensive or invisible — touching a system with a history, or a fix whose test would pass either way |
| **Fable 5.1** | Decisions with long tails: the story, an opening, a name, an architecture you will live with. Twice Opus per token, so it has to be earning it |

Effort is the second dial: `low` for the mechanical, `medium` as the default, `high` when correctness
matters more than tokens, `max` rarely. Lower effort on a stronger model often beats high effort on a
weaker one.

**The reason this rule exists:** three bugs in one session passed every assertion and were still
wrong — a character standing on a roof, a character standing inside another one, and a fix that
worked by deleting the thing it was meant to protect. None was a coding failure. That is the class of
ticket that wants a better model, and it is not always the one that looks hardest.

## The board, and keeping it honest

`public/board/` is the admin page, served at `/board/` with the game. It is built on one rule:
**nothing on it is a copy of something else.** The game views are `<iframe>`s of the real game at
`?view=…`, the tickets are fetched live from the GitHub API, the budgets point at the README. Nothing
there can go out of sync, because there is no second copy to drift.

If you add a thing worth looking at, add a `?view=` for it and frame it. Do not put a screenshot on
the board — a screenshot is a copy, and it starts rotting the moment it is taken.

### Measurements are measured; opinions are written

The board has two kinds of content and they live in different places on purpose.

| | Where | Regenerated by |
| --- | --- | --- |
| What the build weighs | `public/board/stats.json` | `npm run board` |
| Colour census, tokens, type, icons | `public/board/brand.json` | `npm run board` |
| Which rigs exist, who they play | `public/board/cast.json` | `npm run board` |
| Test results | `public/board/checks.json` | `npm run check` |
| Brand direction and decisions | `docs/brand.md` | a person |
| How each model reads against the story | `docs/cast-review.md` | a person |

The prose files are the ONLY copy of what they say — the board renders them, it does not hold its
own version. Editing the doc is editing the board.

**The figures are recounted every run because the last guide's were not.** A separate page once
reported "361 colours, 85 near-identical pairs, 13 dead tokens, and `font-weight: 900` asked of a
face that stops at 800". Every figure was true when written. By the time it was migrated the counts
were 395 and 90, the dead tokens were 3, and the font-weight bug had been fixed — and the page had
no way to know, because nothing it said was wired to anything. That is the whole argument for
`tools/board/`.

It is a plain white admin page on purpose. A tool that inspects the game should not be dressed as the
game: the branding makes it harder, not easier, to tell a control from the thing it is showing you.

### A check that could not run is not a check the game failed

`npm run check` writes `public/board/checks.json`, which is what the Tests page reads. A browser check
that throws — a `page.goto` timeout, a crashed context — comes back as `error`, and the board shows it
amber as **could not run**, separately from the red of an assertion that actually ran and was false.

That distinction is not decoration. Under SwiftShader a cold load of the real build measures **18
seconds** to `load` and 22 to a world with a King in it, on an idle machine; with a dev server up it
is slower still. A 60s timeout once turned the entire sweep red and had the board reporting that the
walls leaked, which they do not. The timeouts are 150s now, and wall clock is free here — no tokens,
no service. A false red is not free: it costs the one thing the page exists to have.

## House style

- Balance lives in `src/config.js`. A tuning number goes there with the measurements that pinned it
  written beside it, not in the code that reads it.
- The `game-*.js` files are all one class: each exports an object of methods that `game.js` puts on
  `Game.prototype`. `this` is the same `this` everywhere.
- Comments say **why**, and say what was tried and rejected. The existing ones are the best
  documentation in the repo — match them rather than summarising what the line already says.
- `Hud.set` runs every frame and dirty-checks everything it writes. Anything added to it must too:
  no `innerHTML` per frame, no restyling something that has not moved.
- The README carries the real budgets (load, draw calls, triangles). If a change moves one, change
  the README in the same commit.
