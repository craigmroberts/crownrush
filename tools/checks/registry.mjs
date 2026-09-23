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
    id: 'sounds-have-a-side', area: 'Sound', cost: 'cheap',
    asserts: 'A wall hit east of the King is heard on the right and one west of him on the left, through the game\'s own damage path; a cue at the King is down the middle with no panner made for it, and a position off the map or missing clamps rather than throws.',
    why: '#239. The game already tells you WHEN a wall is hit and not WHERE, and on a phone the screen is too small to show every wall at once. A pan is the cheapest possible direction and the easiest to lose: one call site passing nothing sounds exactly like one passing the wrong thing, so this drives the real damage path rather than the audio function.',
  },
  {
    id: 'cues-do-not-converge', area: 'Sound', cost: 'cheap',
    asserts: 'Wren\'s release, the dig and the relic each render into an OfflineAudioContext as a sound of their own — at least 0.18 from every other cue on an envelope-and-spectrum scale, the dig rising through the hole — and all three fall silent under the sound toggle and the effects slider.',
    why: '#238. Three mechanics shipped with a borrowed sound each, and the way that happens again is a new verb written by copying a neighbour and moving two numbers. The first dig written for this ticket was a low thud under low-passed noise, which is the raider death note for note: 0.10 apart on this scale, and this check is what said so before anyone with ears could.',
  },
  {
    id: 'village-falls-in-order', area: 'Opening', cost: 'cheap',
    asserts: 'The opening\'s village falls over the seconds the config names, first thing nearest the north road and last thing furthest, with nothing left standing.',
    why: '#248. It fell in one frame: 24 walls, the Keep, four towers and every house became scattered bricks between one frame and the next, no sound, no reason on screen, in the one second of the opening a player is guaranteed to be looking at. It read as a bug.',
  },
  {
    id: 'rescue-offers-a-card', area: 'Upgrades', cost: 'cheap',
    asserts: 'Freeing Wren puts the reward panel up within a second, headed "Wren is home" with no level number and three cards, paused; taking one records it and resumes the game.',
    why: '#252. The first offer needed the Trade Post, the range, the Keep and its first feed -- about 58 coins from a 10-coin start -- so a first run met the best-designed panel in the game on its second or third night. The rescue is the first thing a player does right.',
  },
  {
    id: 'funnel-counts-the-first-run', area: 'Tooling', cost: 'cheap',
    asserts: 'On a fresh profile the funnel counts Play, the first move and the rescue once each and one day, and the black box carries when he first moved, when she was freed and how often he fell at the picket.',
    why: '#251. Nothing in the build could say where players stop; the retention diagnostic had to drive bots. Five counters on the device, sent nowhere, readable from the report, are what that page needed.',
  },
  {
    id: 'objective-strip-while-held', area: 'HUD', cost: 'cheap',
    asserts: 'While Wren is held a strip above the notice lane says the verb, the direction and the paces; it reads "Go after them" while she is carried and "Take her back" at the picket, the paces fall as the King nears her, and it is gone within a second of her being freed.',
    why: '#250. Once she was at the picket the only rescue feedback was a pink arrow, and the notice lane was busy (#244). A player who did not already know what the arrow meant had nothing to go on: no direction in words, no distance, nothing that stayed.',
  },
  {
    id: 'overworld-rides', area: 'Raids', cost: 'cheap',
    asserts: 'From the title in raids mode the map is up over a frozen game that draws nothing for 30 frames; every node is at least a 44 px tap target; a new run lights only the starter; an unlit tap raises nothing; the lit one raises a card whose Ride puts the King on it and stands its castle.',
    why: '#255. The map is where every decision of a run is made, and it is also the breather between castles, so it has to cost nothing to draw. An unlit node that answers a tap is a promise the run cannot keep.',
  },
  {
    id: 'castle-stands-and-resolves', area: 'Raids', cost: 'cheap',
    asserts: 'A castle ridden from the map stands whole (24 walls, the Keep, crewed towers) with no mats, trade post, camps, caches or Wren; its raids come and clearing them fires castle:cleared and returns the map with the run on; the King falling in the next fires castle:fell, not the story\'s gameOver, and the map offers Ride again.',
    why: '#256. A castle is the story edition\'s village stood on the same plot with its economy switched off, and every switch is a place the story could leak in: a mat is decision 1 broken, and a gameOver would write a story defeat to the story scoreboard.',
  },
  {
    id: 'castles-do-not-leak', area: 'Raids', cost: 'cheap',
    asserts: 'Twenty-five castles ridden, drawn, cleared and torn down in a row leave geometries, textures, scene objects and heap flat between castle 5 and castle 25, and no castle draws 400 calls or more.',
    why: '#256. A run is twenty castles and each is a teardown; the bridge-mat leak (#190) was a copy per refresh that nobody saw until a phone ran out of memory at the river.',
  },
  {
    id: 'allies-five-castles', area: 'Raids', cost: 'cheap',
    asserts: 'Five castles of a fixed run: each fields the ride card\'s plan from the roster by id, never more than eight; a man killed in there is off the roster for good; the reward\'s men arrive; a card taken on the third reward is in force in the fourth and fifth castles.',
    why: '#257. Losing men for the run is what makes deploying a decision (decision 2), and a card that stopped at the castle it was taken in would be a reward that vanished.',
  },
  {
    id: 'wren-rides-and-releases', area: 'Raids', cost: 'cheap',
    asserts: 'Wren is offered at the first muster and bought; the next castle has her on the field with her button up; her meter fills with raiders beside her in daylight and her release, through the button, holds them; held on her, they take her, and she is off the roster and never offered again.',
    why: '#257, decision 4. She is the one ally with a story rig and a power, and every piece of her comes from the story edition, where each assumed a night, an escort, or a rescue to go back to.',
  },
  {
    id: 'boss-call-to-arms', area: 'Raids', cost: 'cheap',
    asserts: 'Region 1\'s boss twice on a fixed run with sixteen men: committing nobody brings no charge and scores the bank multiple; committing eight brings eight out of a gate when the chief comes, the charge lands on his guard, all eight are spent whether they lived or not, and the clear scores single. Both offer an ability.',
    why: '#258. The Call to Arms is the one decision the whole design is built around. A charge that never lands, or men who come back from being spent, and it is a number going down for nothing.',
  },
  {
    id: 'ability-once-a-castle', area: 'Raids', cost: 'cheap',
    asserts: 'With Hold Fast in the slot the ability button is up and ready in a castle; a tap holds every raider on the field; a second tap does nothing and the button reads Used; the next castle has it ready again.',
    why: '#258. Once a castle is the ability\'s whole rule (the lesson of #234): a slot that refilled would be a cooldown to tap, and one that did not reset would be a single use a run.',
  },
  {
    id: 'raids-commit-is-a-choice', area: 'Raids', cost: 'free',
    asserts: 'In 3,000 simulated runs each, a player who always commits every spare man to the Call to Arms and one who never commits are each better at one thing: neither holds more bosses AND scores more.',
    why: '#258. The spend-or-save decision is the design\'s centre, and the easiest part of it to make pointless: if one answer is always right it is a formality, and nothing else fails.',
  },
  {
    id: 'raids-roster-rules', area: 'Raids', cost: 'free',
    asserts: 'Over 300 simulated runs through src/raids/allies.js the roster never passes the cap, never holds an ally twice, never brings back one who fell, and never takes Wren twice; a new run starts empty. The rule helper refuses four rosters broken on purpose first.',
    why: '#257. Allies are what a run builds, and losing them for good is what makes deploying a decision (decision 2). A fallen man who comes back is the loss rule quietly deleted.',
  },
  {
    id: 'raids-map-rules', area: 'Raids', cost: 'free',
    asserts: 'Over 2,000 generated regions: the same seed gives the same region; five castle layers then one boss; 2-3 nodes a fork layer and 1-2 links a node; a real fork on every fork layer; a muster reachable and no layer of musters only; no all-fortress or all-muster path; everything reachable and the boss reachable from everything; region 0 opens on one starter castle.',
    why: '#254. The map is the run\'s decisions. A fork of two identical castles is not a choice, an unreachable node is a promise the map cannot keep, and a map that differs between two loads of the same seed cannot be saved. Written from the spec rather than by calling the generator\'s own validator, which the generator already re-rolls against.',
  },
  {
    id: 'raids-run-round-trips', area: 'Raids', cost: 'free',
    asserts: 'A run ridden across three regions is the same run, with the same choices, after JSON; a ride to a node that is not lit is refused, and so is a saved run on a node not on its map or from another version.',
    why: '#254. The run is the only thing raids mode will save (R8), and it stores a seed and a path rather than the map. If reading it back differs by one node, the King resumes somewhere the map does not have.',
  },
  {
    id: 'raids-first-boss-on-time', area: 'Raids', cost: 'free',
    asserts: 'In 2,000 simulated runs, the median time from Play to riding into the first boss is between 6 and 8 minutes.',
    why: '#254, and the owner\'s decision 3. Five castles before a boss at 90-180 s a castle would put the first boss 10-15 minutes in, where most first runs never arrive; region 1\'s castles are short to bring it in. Timing only: the survival half of the sim is a placeholder until R7.',
  },
  {
    id: 'first-minute-is-one-card', area: 'Opening', cost: 'cheap',
    asserts: 'A fresh profile gets one intro card with no key names and a Play button; the run\'s first notice is the morning line with nothing before it; a notice\'s first word is visible the frame its box is.',
    why: '#249 and #253. Five cards of text before the first frame, keys named to a thumb, a stale "Wren is inside the Keep" a second before "Wren walks with you", and every notice arriving as a labelled empty box: the first minute\'s reading, measured on the phone frame.',
  },
  {
    id: 'first-morning-is-full', area: 'Opening', cost: 'free',
    asserts: 'The grace after the rescue is at least a whole day of the cycle, and the first raid\'s size is a named number, not the night formula.',
    why: '#247. The first raid came 22 s after the rescue, 8 of them the walk home, onto an empty plot with no Keep, no walls and no archers. The competitor evidence says the complaint is never that a game is hard; it is the night where nothing had started working yet.',
  },
  {
    id: 'first-raid-after-a-day', area: 'Opening', cost: 'cheap',
    asserts: 'Driven from the opening: at the rescue the countdown to night reads a full day and is on screen, and the first raid comes a day later with exactly the knights the config names.',
    why: '#247. The number in config is only worth what the game does with it: `freeQueen` sets the phase and `startWave` reads the size, and either could drift from the config line without a driven check noticing.',
  },
  {
    id: 'rescue-line-on-time', area: 'Opening', cost: 'cheap',
    asserts: 'In a real run from Play, at most one wall notice is shown during the fall of the village, and "Go after them" and "Take her back" are on screen within a second of the moments they describe.',
    why: '#244. Measured on the deployed build with the lane logging what it showed: 24 wall notices from 30 s to 106 s, and the instruction to rescue her behind all of them, a minute after she was gone. The one text channel spent the whole first fight on masonry.',
  },
  {
    id: 'picket-is-survivable', area: 'Opening', cost: 'cheap',
    asserts: 'A King who walks up to the picket and stands still shooting frees Wren without falling, and is still hurt doing it.',
    why: '#245. Before the damage share the standing player was dead in 7.7 s at 55 s of game time, never having built or seen a raid, while a kiting player freed her in 40 s untouched. The first fight was binary on a skill nothing had said.',
  },
  {
    id: 'picket-restart-and-nudge', area: 'Opening', cost: 'cheap',
    asserts: 'A player who stands off after the hand-off is called by Wren at nudgeAfter and again at nudgeEvery; a King who falls at the picket stands up on the plot at full health with the guards posted again and the run not over, and a second attempt can free her.',
    why: '#246. Driven passive for four minutes, the game sat frozen on an empty plot with an arrow; driven standing, it ended at 55 s with "the raiders have the field". Neither player had met the loop. The restart is the hand-off again, and every gate in the prologue reads a flag it must leave right.',
  },
  {
    id: 'glut-levels-the-seams', area: 'Economy', cost: 'free',
    asserts: 'Every material has a glut, and no material at three tranches of it is worth more than twice any other material fresh, in coin per second of swinging.',
    why: '#236. Coin per swing-second was a fixed ladder and diamond was 3.2x wood at the top of it, so once the east bridge stood the only reason to mine anything else was that the Keep had not opened it yet -- a schedule, not a decision. This is the arithmetic that keeps the ladder from being put back one price at a time.',
  },
  {
    id: 'glut-resets-at-dawn', area: 'Economy', cost: 'cheap',
    asserts: 'Thirty diamond sold through the real trade post in one day pay 20, then 15, then 11 a unit; the first one after the dawn beat pays 20 again; and the panel at the post reads the list price and today\'s for a glutted material and one number for a fresh one.',
    why: '#236. The glut is a rule the player has to be able to see to plan a morning around, and a price that quietly compounds wrong -- or never resets -- makes a run too grindy or too easy without failing anything. Driven through updateTrade at its own rate rather than through sellPrice, because the count is kept by the sale.',
  },
  {
    id: 'deck-rotates', area: 'Upgrades', cost: 'free',
    asserts: 'Over 2000 simulated runs no offer is three cards the player has already read while an unread card is left; level 10 and 12 offers with nothing new on them stay under 20%; an offer repeated whole at level 15 stays under 10%.',
    why: '#235. Seventeen multipliers and three a level meant 55% of offers by level 10 had nothing on them the player had not seen, on the best-designed panel in the game. Level 15 is not held to a number because fifteen offers of three from twenty-three cards run out under any draw; a x3 weighting was measured to make that worse and is not in the code.',
  },
  {
    id: 'unseen-card-on-offer', area: 'Upgrades', cost: 'cheap',
    asserts: 'On the real level-up panel at level 12, with every card but one already seen, the one unseen card is on the offer and on the screen, six times over, and is recorded as seen afterwards.',
    why: '#235. The seen set is the game\'s to keep, not pickOffer\'s: a showOffer that forgot to pass it or to add the offer to it leaves the function correct and the panel reheated. Six in a row is what makes the sabotage a red rather than a 3-in-23 coin toss.',
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
