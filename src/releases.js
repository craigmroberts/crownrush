// #206: what changed, in the player's words, and the one surface that tells them it changed.
//
// WRITTEN, NOT MEASURED. Every other thing the board and the game report about themselves is counted
// at build time out of the thing itself -- bytes, draw calls, which rigs exist -- because a written
// copy of a number goes stale and nothing tells you. This is the other kind: a release note is a
// judgement about what a change means to somebody holding a phone, and there is nothing to count it
// from. A commit subject is written for whoever reads the diff next; "The tufts' cache key moved"
// means nothing to a player. So this is a person's file, like `docs/brand.md` and `src/story.js`,
// and it is the only copy of what it says.
//
// THE RULE THAT KEEPS IT HONEST: a release is added here in the same commit as the work it describes,
// or it does not get written at all -- nobody reconstructs a week of notes afterwards, and a list
// that skips a release is worse than no list, because it reads as "nothing changed" rather than as
// "nobody wrote it down".
//
// `id` IS THE IDENTITY AND IT ONLY GOES UP. It is a plain counter and deliberately not a version
// number: the game has no version scheme anybody honours -- `package.json` has said 0.1.0 since the
// first commit and the build the player is running is a content hash of the bundle (#84) -- so
// inventing "1.4.0" here would be a second thing to keep in step with nothing. What the player sees
// is the date and the title. What the code compares is the counter.
//
// `added` IS ANNOUNCED, `fixed` IS ONLY LISTED. That split is the whole of the ticket: a modal that
// interrupts to say four bugs were fixed is a modal that teaches people to dismiss modals. Fixes are
// worth writing down and worth reading when somebody goes looking -- they are the answer to "was
// that me?" -- so they live in the notes and never in the announcement.
//
// LENGTH: one line each, and the line says what is different to play, not what was done to the code.
export const RELEASES = [
  {
    id: 4,
    date: '2026-09-19',
    title: 'What changed, and where to read it',
    added: [
      'Release notes, under Settings \u203a About \u2014 what each update added and what it fixed. After an update installs, the game says what came with it.',
      'The mountains in the north-west are warm eroded rock now rather than stacked crates, with meadows and wildflowers on top of them.',
      'The kingdom ends in thick forest rather than in an invisible wall \u2014 walk far enough and you reach country you cannot get through, not the edge of the map.',
    ],
    fixed: [
      'An archer sent to man a tower or a gate could walk into a wall and stay there for the rest of the run. He takes the gate now.',
      'Archers on a watchtower are sized to the deck they stand on, so a full crew no longer has its heads through the roof.',
    ],
  },
  {
    id: 3,
    date: '2026-09-19',
    title: 'The ground underfoot',
    added: [
      'Grass parts around anyone standing in it, so a field reads as a surface people are on rather than blades they are inside.',
      'Report a bug from the pause menu. It carries the last few seconds of play, your device and the run’s numbers, and shows you all of it before anything is sent.',
    ],
    fixed: [
      'Archers in a tower stood on the roof instead of on the deck.',
      'A gate left a gap in the wall it was supposed to fill.',
      'The Keep’s and the Barracks’ build mats sat away from their doors.',
      'Wren walked through the King on her way round him.',
    ],
  },
  {
    id: 2,
    date: '2026-09-19',
    title: 'Counters that answer',
    added: [
      'Every counter on the interface runs up to its new value instead of jumping, so a coin picked up is something you can see arrive.',
    ],
    fixed: [
      'Restarting after a defeat handed back none of what the run had earned.',
      'The new lighting was making a phone work harder for each frame than it needed to.',
    ],
  },
  {
    id: 1,
    date: '2026-09-18',
    title: 'A new light',
    added: [
      'The whole world is shaded in bands now \u2014 ground, grass, water, buildings and people \u2014 so the game reads as one drawn thing rather than a lit one.',
      'Dusk shifts colour rather than draining it: a warm low sun against a blue fill, with the violet coming up underneath.',
      'A rim light on the far side of everything, and the river banded across its channel.',
    ],
    fixed: [
      'The birds were black rectangles.',
    ],
  },
];

// The last release this browser has been shown. Missing means a player who has never opened the game
// before -- which is NOT the same as one who is behind, and the difference is the whole reason this
// is read rather than assumed: a first-time player greeted by "what's new" is being told about a
// change to a game they have never seen. `markSeen` is called for them too, silently, so the first
// genuine update is their first announcement.
//
// WHICH MEANS THIS BUILD ANNOUNCES NOTHING TO ANYBODY, and that is correct rather than broken. The
// key does not exist yet, so every player alive -- including the ones who have been playing for
// weeks -- comes through as a first visit and is marked quietly. There is no way to tell those two
// apart from inside the browser, and of the two mistakes available, greeting a genuinely new player
// with a list of changes to a game they have never played is the worse one. It costs one release.
const SEEN_KEY = 'crownrush-release-seen';

// Every read and write is wrapped: localStorage throws in private mode and on a full quota, and a
// game that will not start because it could not remember which release notes were read is absurd.
// A browser that cannot store this simply never announces -- `unseen` comes back empty.
export function readSeen() {
  try {
    const v = parseInt(localStorage.getItem(SEEN_KEY), 10);
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return newestRelease().id;   // no storage: treat as up to date rather than announcing every load
  }
}

export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, String(newestRelease().id)); } catch (e) { /* private mode */ }
}

export function newestRelease() {
  return RELEASES[0];
}

// The releases this browser has not been shown, newest first. An unknown marker (a first visit, or a
// stored id from a build whose newest release has since been renumbered downwards, which should not
// happen but costs nothing to survive) yields nothing: there is no "before" to be behind.
export function unseenReleases(seen = readSeen()) {
  if (seen == null) return [];
  return RELEASES.filter((r) => r.id > seen);
}

// Whether an announcement is owed. Fixes alone never earn one -- see the `added`/`fixed` split above.
export function hasNews(seen = readSeen()) {
  return unseenReleases(seen).some((r) => r.added && r.added.length);
}
