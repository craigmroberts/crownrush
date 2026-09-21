// #179: what the game is supposed to be true about itself.
//
// This file is the COVERAGE, not the runner. It lists everything worth asserting, whether or not
// anybody has written the assertion yet -- because "how thoroughly has this been tested" is a
// question about the gaps as much as the passes, and a suite that only lists what it already checks
// answers the wrong half of it.
//
// Every entry carries `cost`, and that is the field this file exists for:
//
//   free   -- pure reading. Parses config and source, runs in milliseconds, no browser, no tokens.
//   cheap  -- drives the real game in headless Chromium. Seconds to a minute. Still no tokens.
//   judged -- cannot be automated at all: it is a question about feel, taste or fiction. Needs a
//             person playing, or a model reading. These have no runner ON PURPOSE. They are listed
//             so the board can say "this is not covered" rather than quietly implying it is.
//
// A `judged` row is not a failure and never fails a run. It is an honest gap.
//
// AND `asserts` HAS TO DESCRIBE THE RULE, NOT THE FIELD THE CODE HAPPENS TO READ.
//
// Two of the four checks that were wrong about the game (#179) were wrong in the same way: they
// asserted one shape of a right answer because it is the shape MOST answers take.
//
//   rebuild-after-fall  asserted `structures.length` grew, because that is where most buildings
//                       land. `buildStructure` deliberately keeps the trade post OUT of it and
//                       hangs it on `tradePost`, since it is not a thing raiders attack. The check
//                       reported "buying a mat built nothing" about a game that had built it.
//   pads-no-overlap     asserted no two pads share a spot, because that is true of most pads. Two
//                       on one spot IS the design where one unlocks the other -- they are never on
//                       the field together.
//
// So: an assertion that names one field of one data structure has to say what the OTHER shapes are,
// or ask the game a question instead of reading its furniture. `completePad` builds; where the
// record lands is an implementation detail, and a check that knows it is coupled to it. Writing
// `asserts` as the rule in English is the cheapest guard there is -- the sentence and the code have
// to agree, and they cannot both be wrong quietly.
export const CHECKS = [
  // ---- free: config and source, no browser ----
  {
    id: 'pads-requires-exist', area: 'Build', cost: 'free',
    asserts: 'Every pad `requires` names a pad that exists.',
    why: 'A typo here silently makes a pad unreachable for a whole run.',
  },
  {
    id: 'pads-buildat-in-bounds', area: 'Build', cost: 'free',
    asserts: 'Every structure pad\'s `buildAt` sits inside its tier, with its whole footprint.',
    why: 'A building half outside the wall is a building raiders walk past.',
  },
  {
    id: 'pads-no-overlap', area: 'Build', cost: 'free',
    asserts: 'No two build mats overlap each other.',
    why: 'Two mats on one spot means one of them can never be paid.',
  },
  {
    id: 'opening-homes-legal', area: 'Opening', cost: 'free',
    asserts: 'The hand-placed opening homes are inside the tier-0 plot and clear of each other.',
    why: 'They are coordinates typed by hand (#152), which is exactly what drifts.',
  },
  {
    id: 'tokens-resolve', area: 'Brand', cost: 'free',
    asserts: 'No `:root` token is defined as itself; any nothing reads is named.',
    why: '`--figure: var(--figure)` shipped -- a cycle, so six rules fell back to inherit and no number was gold.',
  },
  {
    id: 'icons-unique', area: 'Brand', cost: 'free',
    asserts: 'No icon name is declared twice in the icon set.',
    why: '`ICONS.iron` was an ingot and then a wall; the wall won, and the iron chip showed a wall.',
  },
  {
    id: 'icons-exist', area: 'UI', cost: 'free',
    asserts: 'Every `icon:` named in config exists in the icon set.',
    why: 'A missing icon draws nothing and says nothing.',
  },
  {
    id: 'deck-seats-the-crew', area: 'Build', cost: 'free',
    asserts: 'A tower deck has at least as many places on it as the biggest crew the game can send.',
    why: 'It had seven for a roster of nine, so #8 and #9 wrapped onto #1 and #2 -- two archers on one coordinate, and every tally in the game still added up (#203).',
  },
  {
    id: 'upgrade-mods-exist', area: 'Upgrades', cost: 'free',
    asserts: 'Every upgrade writes a mod that exists in MODS.',
    why: 'An upgrade onto a misspelled key is a reward that does nothing, and nothing says so.',
  },
  {
    id: 'legacy-is-a-head-start', area: 'Build', cost: 'free',
    asserts: 'Every legacy unlock changes something, and no unlock is worth more than ONE buy of the upgrade card writing the same mod \u2014 plus the ladder rises in order and starts inside one finished short run.',
    why: 'Twenty-four unlocks chosen three at a time is longevity; twenty-four that beat the cards they shadow is a run that starts past its own upgrade path. Both sides write to `mods`, so the rule is arithmetic rather than opinion.',
  },
  {
    id: 'churn-verdict-tells-a-step-from-a-leak', area: 'Tooling', cost: 'free',
    asserts: 'The churn harness calls a counter that climbs in most rounds a leak, and one that climbs once a step \u2014 held to six series it has actually printed.',
    why: '#190. It reported "+0.7/round, CLIMB" about a camp waking and the first damage number being drawn, which is paid once. An instrument that cries wolf is worse than one that says nothing: the next real finding arrives beside it and gets the same shrug.',
  },
  {
    id: 'footprints-cover-kinds', area: 'Build', cost: 'free',
    asserts: 'Every structure kind a pad can build has a footprint.',
    why: '`placeOk` falls back to 3x3 for anything missing, which silently mis-sizes collisions.',
  },

  // ---- cheap: the real game, headless, no tokens ----
  {
    id: 'views-open', area: 'Tooling', cost: 'cheap',
    asserts: 'Every `?view=` URL reaches a running game with its panel open and filled.',
    why: 'The board is iframes of these. A frame that opens on the wrong thing looks exactly like one that opened on the right thing.',
  },
  {
    id: 'bands-hooked', area: 'Render', cost: 'cheap',
    asserts: 'Every lit environment surface is banded, and the ground, tufts and canopies keep the cache keys they had.',
    why: 'Every way this fails is silent. If three renames the line the hook patches, the replace is a no-op and the game renders un-banded with no error; if the cache key were overwritten instead of appended, two materials with matching defines get handed each other\'s program (#155). The sweep is so that a surface added later cannot be the one thing left on a smooth ramp.',
  },
  {
    id: 'hud-quiet', area: 'HUD', cost: 'cheap',
    asserts: 'The HUD writes nothing while nothing changes, and a counter tally runs to its number and then stops.',
    why: '`Hud.set` runs every frame and the rule that everything in it dirty-checks had nothing enforcing it. #197 put an animation inside that path: a tally that forgets to stop looks completely normal and costs a DOM write sixty times a second on the device that can least afford one.',
  },
  {
    id: 'mats-at-doors', area: 'Build', cost: 'cheap',
    asserts: 'Every structural mat sits square on its building\'s door axis, and every bridge mat sits on the road at the crossing.',
    why: 'A mat is the game\'s one "you can build here" affordance and it is read at a glance. The Keep\'s sat diagonally off a corner touching no face, and the bridge mats were typed constants eight units from where the bridge actually goes -- positioned by a different mechanism from the thing they build, so they agreed only by luck.',
  },
  {
    id: 'tower-crew-placed', area: 'Build', cost: 'cheap',
    asserts: 'Every archer on a tower deck has the deck under his feet, and no two stand in the same place -- on a full deck, and after a casualty has been replaced.',
    why: 'Reported from a phone as "standing on the roof" (#203). Three ways to get it wrong were live at once and none of them moved a number the game keeps: feet 0.27 under the planking, a ring too small for the roster, and a replacement handed the place a survivor was standing in.',
  },
  {
    id: 'post-once', area: 'Render', cost: 'cheap',
    asserts: 'The post pass tone-maps exactly once, keeps the canvas multisampling, and toggles without changing the program set.',
    why: 'All three failures are silent: a doubled or missing tone map is just a different picture, lost MSAA is a jaggier one, and a toggle that swaps the render path recompiles the whole scene at the moment the device is already behind.',
  },
  {
    id: 'walls-solid', area: 'Walls', cost: 'cheap',
    asserts: 'The King cannot cross a wall section: pushed at it from every side, he stays out.',
    why: 'Asked for by name. A wall that can be walked through is not a wall.',
  },
  {
    id: 'gates-passable', area: 'Walls', cost: 'cheap',
    asserts: 'Every gate can be walked through, in both directions.',
    why: 'The other half of the same question -- a wall with no way in is a cage.',
  },
  {
    id: 'wall-ring-unbroken', area: 'Walls', cost: 'cheap',
    asserts: 'Sampling the whole wall ring, every point is either solid or a known gate.',
    why: 'Asked for by name: "there is no gaps between gates".',
  },
  {
    id: 'opening-resolves', area: 'Opening', cost: 'cheap',
    asserts: 'The snatch lands even if the King runs flat out from the moment it starts.',
    why: 'It did not, for one commit: knights are slower than he is and the run stalled for ever.',
  },
  {
    id: 'queen-visible', area: 'Opening', cost: 'cheap',
    asserts: 'Through the whole calm, Wren is on the ground, outside the Keep, and not inside the King.',
    why: 'Both bugs this scene has had were invisible to every other assertion.',
  },
  {
    id: 'release-greeting', area: 'UI', cost: 'cheap',
    asserts: 'The update greeting is quiet for a new player, opens once for a browser that is behind, and is quiet again after.',
    why: 'Two of its three failures are invisible to whoever they happen to: a greeting that never opens looks like a build with nothing to say, and the one that greets a first-time player is something no installed phone will ever show anyone (#206).',
  },
  {
    id: 'post-walk-unblocked', area: 'Build', cost: 'cheap',
    asserts: 'An archer sent to man a tower or a gate reaches his post even when a wall is between him and it.',
    why: 'Reported from a phone as "an archer just walking into the wall he seems stuck" (#208). He is picked for being nearest the King, so a post across a wall is ordinary; the walk was a straight line with no way round and no recovery, and he played his walk animation into the stone for the rest of the run.',
  },
  {
    id: 'relics-bite', area: 'World', cost: 'cheap',
    asserts: 'A cache stays hidden until the fog reaches it, costs a full dig to open, and every relic it pays out changes the rule it claims to \u2014 measured as behaviour, twice over for the pierce so a pooled arrow has to do it again.',
    why: '"The flag is set" and "the arrow pierces" are different claims, and the difference cost a bug: the Splitting Shaft set its flag correctly and stopped working after a few shots because arrows come off a pool carrying the last flight\'s state. A check reading `mods.pierce` would have passed throughout.',
  },
  {
    id: 'black-box-outlives-the-tab', area: 'Render', cost: 'cheap',
    asserts: 'A session that loses its WebGL context leaves a record of it that the NEXT page load can read, in the report a person would paste into an issue.',
    why: '#190 asks whether the crashes are an OS kill or a lost context, and the plan for answering it \u2014 copy the perf log at ten, twenty and thirty minutes \u2014 cannot, because the log is in the tab that died. The record is the answer, and it is worthless if the next ordinary thing a player does writes over it: the first version was erased by `pagehide` when the tab was closed.',
  },
  {
    id: 'one-live-context', area: 'Render', cost: 'cheap',
    asserts: 'The page holds exactly one live WebGL context once play starts \u2014 the game canvas \u2014 and the title portraits were drawn on the second one before it was handed back.',
    why: '#190. A browser allows a handful of live contexts and drops the OLDEST when the limit is hit, which is the game\'s own canvas: the world goes blank while the HUD keeps drawing. `releasePortraitRenderer` guards against it and nothing checked that it worked; the portraits are asserted alongside because a render that threw would leave one context, no pictures, and a green check.',
  },
  {
    id: 'high-ground-holds', area: 'World', cost: 'cheap',
    asserts: 'A plateau is a floor on top and a wall on every side but one, the ramp raises you to exactly the top, and a raider at the rock face finds its way round to the ramp from every bearing.',
    why: '#223. It is the first thing in the game with a Y axis, and the failure this repo keeps recording is a character on a roof or inside something. The route matters most, and it has been wrong twice: with no waypoint, none of eight raiders reached a King on a plateau in ninety seconds; aimed straight at the ramp, 12-13 of 18 bearings made it and the rest stopped dead on the far side, because the line to the foot goes through a cliff. Walking round the drum is 18 of 18. A route that points at the right place and cannot be walked reads as correct from the outside, so this is driven rather than asserted on the waypoint.',
  },
  {
    id: 'mats-do-not-multiply', area: 'Build', cost: 'cheap',
    asserts: 'Refreshing the mats leaves the same mats on the field, once each \u2014 forty calls change nothing.',
    why: '#190. `refreshPads` runs on every purchase, level and restore, and it re-added the two bridge mats on each call because the pad on the field carries a moved COPY of its def and the test was object identity. Twelve duplicates were down at boot; the cost was invisible until the King reached the river, where 407 canvas textures uploaded in one frame.',
  },
  {
    id: 'rebuild-after-fall', area: 'Opening', cost: 'cheap',
    asserts: 'After the fall the plot is empty, the ledger is clear, and the first mat can be bought.',
    why: 'The fall clears a lot of state by hand; anything it misses is unreachable progress.',
  },

  // ---- judged: no runner, and that is the point ----
  {
    id: 'opening-feel', area: 'Opening', cost: 'judged',
    asserts: 'The calm is long enough to look around and short enough to replay.',
    why: 'Thirty seconds is reasoned, not played. Only somebody playing it knows.',
  },
  {
    id: 'kingdom-layout', area: 'Opening', cost: 'judged',
    asserts: 'The opening kingdom looks like a place somebody lives.',
    why: 'Four homes in a row along the south is a first guess. `/board/` exists to judge it.',
  },
  {
    id: 'reward-copy', area: 'Upgrades', cost: 'judged',
    asserts: 'A reward card can be read and ranked in the seconds a paused raid gives you.',
    why: '#107, #115 and #177 are all the same complaint arriving again.',
  },
  {
    id: 'brand-consistency', area: 'UI', cost: 'judged',
    asserts: 'The game looks like one thing: one palette, one button, one voice.',
    why: '#135. A machine cannot tell you the game has drifted from its own guide.',
  },
];

export const AREAS = [...new Set(CHECKS.map((c) => c.area))];
