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

**Wall-clock time is not game time under SwiftShader.** A frame takes about a second and `dt` is
capped at 0.05, so waiting ten seconds advances the simulation by about half. Anything that depends
on game time — regen, cooldowns, the day cycle — has to be driven directly rather than waited out.
`tools/probe/README.md` explains this; it has already produced one wrong bug report and two wrong
test failures.

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
