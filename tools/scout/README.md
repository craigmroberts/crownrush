# Scout: an offline pass that proposes improvements and files them

    node tools/scout/scout.mjs --dry-run     # see what it would raise, raise nothing
    node tools/scout/scout.mjs               # a full run: two rounds, at most 5 issues
    node tools/scout/scout.mjs --prioritise  # rank the open scout issues now

The scout studies this game, proposes improvements, files them as GitHub issues labelled `scout`, and
once the backlog is big enough to need an order, ranks it. It does not touch the game: the only thing
it ever writes is issues, plus its own notes under `state/`.

## How it works

1. **A digest of the game** is built from the repository itself: every source file and its size, the
   top-level keys of `src/config.js`, what the README documents, the last 25 commits, and every issue
   title, open and closed. This is read from disk, not guessed, and every agent gets the same copy.
2. **Five agents run in parallel**, each a separate headless Claude Code process with a narrow brief
   and only the tools that brief needs:
   - *Systems analyst* reads the balance and build tree for systems that never reach the player.
   - *Genre researcher* looks up how comparable games structure a session, and judges this one
     against that. It is the only agent allowed to search the web.
   - *First session* watches the opening three minutes on a phone for what the game knows but never
     says.
   - *Moment to moment* looks for feedback the game withholds and threats that arrive unannounced.
   - *Robustness* looks for what breaks or crawls on a mid-range Android, and for states with no way
     out.
   Each returns at most four ideas as JSON, with impact, effort and confidence.
3. **Rounds are recursive.** Round two is given what round one proposed and told to take the best
   idea apart into concrete pieces or find what the others missed. Repeating an earlier idea in
   different words is the one answer it is told is useless.
4. **Duplicates are dropped** against every existing issue and against everything proposed earlier in
   the run. Word containment catches restatements, character trigrams catch the morphology ("thieves
   never appear" and "thief never spawns" are one ticket). Paraphrases with no shared words will slip
   through, which is why the agents are also handed every existing title and told not to repeat them.
5. **The best survive.** Ideas are ordered by impact times confidence over effort, and only the top
   few are filed. `--max-issues` sets how many; the default is 5.
6. **Ranking** runs by itself once there are `--prioritise-at` open scout issues, 8 by default. It
   labels each `p1`, `p2` or `p3`, at most a third of them `p1`, and writes the full order to
   `state/order.md`.

## Options

| Flag | Default | What it does |
| --- | --- | --- |
| `--dry-run` | off | Propose and report, file nothing. The full text lands in `state/last-run.md`. |
| `--rounds N` | 2 | How many times to go round, each deeper than the last. |
| `--max-issues N` | 5 | Cap on issues filed in one run. |
| `--prioritise-at N` | 8 | Open scout issues needed before ranking runs on its own. |
| `--prioritise` | off | Rank now and do nothing else. |
| `--roles a,b` | all | Run only these agents: `analyst`, `researcher`, `newcomer`, `feel`, `technical`. |
| `--model NAME` | CLI default | Model for the agents. |
| `--timeout SECS` | 600 | Per-agent limit. |

## What it costs, and how to keep it honest

Every agent call is a real model call, billed to whoever is signed in. A run prints its total when it
finishes. The caps exist because an unbounded idea generator produces a backlog nobody reads: five
issues a run that are worth doing beat fifty that are not.

Start with `--dry-run`. Read `state/last-run.md`. If the ideas are not good enough to act on, the
briefs in `roles.mjs` are the thing to change, not the number of agents.

## Running it unattended

The agents sign in as you do, so the session has to be valid. If a run reports `OAuth session
expired`, open `claude` once interactively and run the scout again.

To have it look at the game every Monday morning, a crontab line is enough:

    0 9 * * 1 cd ~/Projects/crownrush && /usr/local/bin/node tools/scout/scout.mjs >> /tmp/scout.log 2>&1

## Testing it without spending anything

`SCOUT_FAKE=<dir>` answers each agent from `<dir>/<role>.json` instead of calling one, which
exercises parsing, deduplication, ranking and filing for free.

## State

`state/` holds the digest, the last run's full text, what has been filed, and the current ranking. It
is not committed: it is a working note, not part of the game.
