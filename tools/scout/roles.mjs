// The agents the scout runs. Each one is a separate headless Claude Code process with its own brief,
// its own tools, and a strict JSON answer. They are deliberately narrow: an agent asked for
// "improvements" returns mush, an agent asked "what does a new player misunderstand in the first
// three minutes, and what in this repository causes it" returns something you can act on.
//
// `tools` is passed to --allowed-tools. Keep it to the least each brief needs: an agent that cannot
// write files cannot damage the game, and this whole tool only ever writes GitHub issues.

const JSON_CONTRACT = `
Answer with JSON and nothing else. No preamble, no code fence, no commentary. The shape is:

[
  {
    "title": "one line, imperative, specific enough to search for later",
    "area": "one of: mechanics, progression, onboarding, feel, audio, ui, performance, retention",
    "impact": 1-5,
    "effort": 1-5,
    "confidence": 1-5,
    "why": "the observation that led here, in one or two sentences, naming what you actually read",
    "body": "a GitHub issue body in markdown: what is wrong or missing, why it matters to a player, a concrete plan referring to real files and settings, and acceptance criteria"
  }
]

Rules that matter more than volume:
- At most 4 entries. Three good ones beat ten guesses.
- Every entry must be specific to THIS game. If an entry would read the same for any tower defence, drop it.
- Name real files, real config keys and real numbers wherever you can. Vague tickets are worse than none.
- Do not propose anything already covered by the existing issues you were given.
- impact is what a player would feel; effort is developer work; confidence is how sure you are the
  problem is real. Be honest: a 5/5/5 on everything makes the ranking useless.
`;

export const ROLES = [
  {
    id: 'analyst',
    label: 'Systems analyst',
    tools: ['Read', 'Grep', 'Glob'],
    brief: `You are reading a small browser game's source to find where its systems fail to pay off.

Read src/config.js first: it holds the whole balance and build tree. Then src/game.js for how those
numbers are used. Look for systems that exist in the code but rarely reach the player, numbers that
make a feature unreachable in a normal run, progressions that flatten out, and rules the code
enforces that nothing on screen explains.

A worked example of the standard: thieves existed, were implemented well, and almost never spawned,
because the spawn test read the King's carried coins at the one moment a building player holds none.
That is the kind of finding worth a ticket: a real mechanism, a specific cause, a concrete fix.`,
  },
  {
    id: 'researcher',
    label: 'Genre researcher',
    tools: ['Read', 'WebSearch', 'WebFetch'],
    brief: `You know what keeps players in short-session action-strategy games: the advert-style
defend-and-build loop (Kingshot, Whiteout Survival, Rush Royale, Clash-like base games), roguelite
run structure, and idle progression.

Look up how comparable games structure a session and what they do in the first minute, at the first
loss, and at the point a run ends. Then judge THIS game against that, from its README and config.
Propose things that suit a self-contained browser game with no accounts, no monetisation and no
server. Reject anything that needs a backend, a login, notifications or a store.

Say in "why" which game or pattern the idea comes from and what this game does instead today.`,
  },
  {
    id: 'newcomer',
    label: 'First session',
    tools: ['Read', 'Grep'],
    brief: `You are watching someone play this for the first time, on a phone, for three minutes.

Read the intro steps and the pad, toast and info-screen text in src/main.js, src/hud.js and
src/game.js. Find what the game knows but never says, what it says at a moment the player cannot
read it, and what it lets a new player do that wastes their first run.

Real feedback from a playtester, already fixed, for calibration: notices vanished before they could
be read, and the player never learned that raising the Keep is what unlocks new materials. Look for
the next thing of that kind, not that one.`,
  },
  {
    id: 'feel',
    label: 'Moment to moment',
    tools: ['Read', 'Grep'],
    brief: `You care about how the game feels second to second: weight in a hit, clarity in a threat,
reward in a pickup, readability in a crowd.

Read src/game.js for combat, pickups and effects, src/audio.js for what is synthesised, and
src/models.js for what is drawn. Find moments the game passes over silently that a player would want
acknowledged, threats that arrive without warning, and feedback that fires for trivia but not for
what matters. Prefer cheap, precise additions over new systems.`,
  },
  {
    id: 'technical',
    label: 'Robustness',
    tools: ['Read', 'Grep', 'Glob'],
    brief: `You are looking for what will break or crawl on a mid-range Android phone, and for state
the game can get into and not get out of.

Read src/game.js, src/rig.js and src/models.js. Look for work that scales with entity count, state
machines with no way back, assumptions about screen size or input, and failure paths that leave a
player stuck with no explanation. Two real freezes have already been reported and guarded; find
causes rather than more guards.`,
  },
];

export const jsonContract = () => JSON_CONTRACT;
