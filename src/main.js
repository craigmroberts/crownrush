import { Game } from './game.js';
import { Hud, SPEAKERS } from './hud.js';
import { audio } from './audio.js';
import { preloadRigs, renderPortrait, renderFace, releasePortraitRenderer } from './rig.js';
import { preloadProps, usePropRenderer, releasePropTranscoder } from './props.js';
import { preloadIcons, mountIcons, iconSvg } from './icons.js';
import { readScores } from './scores.js';
import { SAVE_VERSION, readLength, writeLength } from './game-save.js';

const canvas = document.getElementById('game');
const hud = new Hud();
let game;
try {
  game = new Game(canvas, hud);
} catch (err) {
  window.__showError(err && err.message ? err.message : String(err));
  throw err;
}

// #51: a KTX2 texture transcodes to whichever compressed format the device supports, and only a
// renderer can say which that is. This is the one the game will draw with.
usePropRenderer(game.renderer);

// #119: the board's top row IS the best run. #58: of the length that is SELECTED -- the two are
// ranked separately, so the best short run and the best long run are different rows. The selection
// is read back out of storage rather than off the game, because `game.runLength` belongs to the run
// being played and the title screen is asking about the next one.
const refreshStart = () => {
  const len = readLength();
  // #56: and what previous runs have earned. `legacyProgress` is read fresh rather than cached,
  // because the run that just ended is what changed it.
  hud.showStart(readScores(len)[0] || null, game.savedRun(), len, game.legacyProgress());
};
refreshStart();
const startBtn = document.getElementById('start-btn');
startBtn.disabled = true;
startBtn.classList.add('hidden');
mountIcons();
// #5: a real loading bar. The nine character models are most of the download, so they drive it.
const loadBar = document.getElementById('load-bar');
const setLoad = (frac, text) => {
  loadBar.firstElementChild.style.width = `${Math.round(frac * 100)}%`;
  document.getElementById('load-text').textContent = text;
};
setLoad(0.05, 'Loading…');
// What the opening actually needs in hand. The King and Queen for the title portraits and the rescue,
// the raider and the brute for her captors, the archer and swordsman for the crowd bake, and the
// three buildings the first few pads put up.
const RIGS = ['king', 'queen', 'archer', 'swordsman', 'raider', 'elite', 'brute', 'boss'];
// Imported buildings. They are loaded here rather than on demand because a pad builds its structure
// synchronously, and a ghost preview appears before that: both need the model already in hand.
const PROPS = ['hut', 'keep', 'tower'];
// The three heaviest models in the game, and none of them can appear for several minutes: the
// mounted King waits on a Warhorse bought after the Keep, the Barracks and the villager home on
// Keep level 3. Holding the Play button until they land cost about a megabyte of the download for
// nothing, so they come down behind the title screen instead. Every one of them falls back to its
// built version if it somehow has not arrived (makeStructure, mountKing), and a building that came
// up built is swapped for the import at the next material boundary anyway.
const LATER_RIGS = ['king_mounted'];
const LATER_PROPS = ['barracks', 'house'];
let loaded = 0;
const total = RIGS.length + PROPS.length;
const step = () => {
  loaded++;
  setLoad(0.1 + (0.85 * loaded) / total, `Loading ${loaded} of ${total}…`);
};
Promise.all([
  preloadIcons(),
  document.fonts ? document.fonts.ready : Promise.resolve(),
  preloadRigs(RIGS, step),
  preloadProps(PROPS, step),
]).then(() => {
  game.pads.forEach((p) => game.drawPad(p));
  // the title portraits come from the rigs that just loaded
  try {
    const k = renderPortrait('king');
    const q = renderPortrait('queen');
    if (k) document.getElementById('hero-king').src = k;
    if (q) document.getElementById('hero-queen').src = q;
    // #100: the little faces that go beside a speaker's name, taken here because this is the last
    // moment the portrait renderer exists. Two more small renders while it is already warm.
    const faces = {};
    for (const [who, spec] of Object.entries(SPEAKERS)) {
      if (!spec.rig) continue;
      const f = renderFace(spec.rig);
      if (f) faces[who] = f;
    }
    hud.setFaces(faces);
  } catch (e) {
    console.warn('portraits skipped', e);
  } finally {
    releasePortraitRenderer();  // hand the second WebGL context back before play starts
  }
  setLoad(1, 'Ready');
  loadBar.classList.add('done');
  startBtn.disabled = false;
  startBtn.classList.remove('hidden');
  // Play is live; fetch the rest while the title screen and the intro are being read, and only then
  // let the worker precache the lot for the next visit.
  //
  // #51: on the NEXT frame, not on this line. Source order already said "enable Play, then fetch",
  // but `startBtn.disabled = false` and these requests happen in the same tick, so the fetches are in
  // flight before anything can observe that Play went live -- and the probe's bytes-to-a-clickable-
  // Play then counts some of them. Measured: the phone run came out 3427 kB against a 3072 budget
  // with the deferred wave attributed to it, and 2972 without. One frame of daylight makes the thing
  // the comment already claimed true in fact rather than in reading order, and it is the better
  // behaviour anyway -- the browser is not competing for bandwidth at the instant the button appears.
  requestAnimationFrame(() => {
    Promise.all([preloadRigs(LATER_RIGS), preloadProps(LATER_PROPS)])
      .catch((e) => console.warn('deferred models unavailable:', e && e.message))
      // Every building is in hand, so the Basis transcoder and its worker can go, the same way the
      // portrait renderer does above. Nothing loads a texture after this point in a normal run.
      .then(releasePropTranscoder)
      .then(registerServiceWorker);
  });
});
// #6: the first time through, Play opens a short stepped intro; after that it goes straight in
const INTRO_KEY = 'crownrush-intro-seen';
const INTRO = [
  { icon: 'tiara', title: 'Find the Queen', text: 'Raiders have taken Wren, your Queen. Follow the pink arrow, clear her guards and bring her home. Nothing can be built, and no raid comes, until she is free.' },
  { icon: 'coin', title: 'Fight and collect', text: 'Your archers shoot on their own. Raiders drop coins: walk over them to pick them up. The colour a raider wears tells you how dangerous it is.' },
  // #57: two verbs, one step. A sixth card would make the opening longer for something the player
  // learns faster by pressing it, and these two belong together: they are the only buttons in the
  // game that are the King's own rather than a building's.
  { icon: 'horn', title: 'The King\u2019s three buttons', text: 'The horn (Space) rallies your army to you and throws nearby raiders back — save it for a breach. The bolt (Shift, or double-tap) is a short burst of speed: out of a scrum, or after a thief. The banner (B) plants where you stand and the army holds that spot instead of following you, so you can go and mine while they defend it.' },
  { icon: 'hammer', title: 'Build', text: 'Stop on a floor marker to spend coins. Square markers build; round ones recruit and upgrade. Walking across a marker costs nothing.' },
  // #125: this step used to say wood, stone and straw went into the Keep, which stopped being true
  // when the material lists were priced into coin -- the first thing a new player reads, sending them
  // mining for a currency the Keep does not take. It is also the only place with room to say what
  // mining IS for, which nothing in the game said at all.
  { icon: 'keep', title: 'Raise the Keep', text: 'Pay coin into the Keep and the whole kingdom levels up: a bigger army, faster arrows, stronger walls. What you mine is not spent — sell it at the trade post to turn a bag into coin. Gather by day. The raid comes at night.' },
];
const startGame = () => {
  try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* private mode */ }
  game.start();
};
document.getElementById('start-btn').addEventListener('click', () => {
  let seen = false;
  try { seen = !!localStorage.getItem(INTRO_KEY); } catch (e) { /* private mode */ }
  if (seen) return game.start();
  hud.hideStart();
  hud.showIntro(INTRO, startGame);
});
// #58: the run-length pills, on the title screen and on both endings. They change what the NEXT run
// is, so the choice is written DOWN rather than carried in a variable: `game.start()` reads it back
// out of localStorage at the moment Play is pressed, which is what makes it survive a reload as well.
//
// All three are views of one setting, so a click on any of them re-renders all three -- the title
// screen is shown once at load and never again, and leaving its pills stale behind a game over
// screen would make them lie the next time the page was opened without a reload.
const lengthPicks = [...document.querySelectorAll('.length-pick')];
const pickLength = (e) => {
  const b = e.target.closest('.seg-b');
  if (!b) return;
  writeLength(b.dataset.len);
  // Deliberately NOT `game.runLength`. These pills are also on the victory screen, where "Keep
  // Playing" carries on the run that was just won -- writing the choice onto the live game there
  // would change its finale night, its Keep prices and the clock its raid is fought on, mid-run.
  // The only two things that set a run's length are `start()` and a restore.
  for (const el of lengthPicks) hud.renderLengths(el, b.dataset.len, true);
  // `showStart` un-hides the title screen, so it may only be called while that screen is already up.
  // The best run under the pills is read off the selection too, which is why it is a refresh and not
  // just a re-render.
  if (!hud.startHidden()) refreshStart();
};
for (const el of lengthPicks) el.addEventListener('click', pickLength);
document.getElementById('intro-next').addEventListener('click', () => hud.introNext());
document.getElementById('intro-skip').addEventListener('click', (e) => {
  e.preventDefault();
  hud.finishIntro();
});
// #50: pick a run back up. If the save turns out unreadable, restoreRun clears it and starts clean
// rather than handing back half a village, so this always ends in a playable game.
document.getElementById('continue-run-btn').addEventListener('click', () => {
  const saved = game.savedRun();
  hud.hideStart();
  game.resumeRun(saved);
});
document.getElementById('restart-btn').addEventListener('click', () => game.start());
document.getElementById('continue-btn').addEventListener('click', () => game.resume());
document.getElementById('victory-restart').addEventListener('click', (e) => {
  e.preventDefault();
  game.start();
});

document.getElementById('next-wave-btn').addEventListener('click', () => game.callWave());
document.getElementById('minimap').addEventListener('click', (e) => {
  e.target.classList.toggle('big');
  game.drawMinimap(true);
});
document.getElementById('resume-btn').addEventListener('click', () => game.unpause());
document.getElementById('pause-restart').addEventListener('click', (e) => {
  e.preventDefault();
  game.start();
});
document.getElementById('offer-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.offer-card');
  if (card) game.takeUpgrade(card.dataset.id);
});
// #132: the capability notice. One tap opens it and restarts its clock at the longer figure; a
// second closes it outright, which is the dismissal. Every way off it still runs through
// `dismissGain`, including its own countdown running out.
document.getElementById('gain-toggle').addEventListener('click', () => {
  if (game.hud.toggleGain()) game.dismissGain();
});
document.getElementById('horn-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.useHorn();
});
// #57: the dash. `stopPropagation` for the same reason the horn has it -- the canvas under these
// buttons listens for the drag that moves the King, and a press that reaches it would start walking
// him at the same time (#128 is what that bug looks like from the player's side).
document.getElementById('dash-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.useDash();
});
document.getElementById('banner-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.plantBanner();
});
document.getElementById('place-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.confirmPlacing();
});
document.getElementById('move-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.beginMoving(game.movable);
});
// #75: the mat chip opens to its description rather than showing one unasked.
document.getElementById('tip-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  hud.togglePadTip();
});
document.getElementById('info-close').addEventListener('click', () => game.hideInfo());
// #92: the corner close does exactly what the button at the bottom does -- same handler, not a copy
document.getElementById('info-x').addEventListener('click', () => game.hideInfo());
document.getElementById('ks-x').addEventListener('click', () => game.hideKeep());
document.getElementById('pause-x').addEventListener('click', () => game.unpause());
// both plaques open the Keep sheet: the left one is the level, the right one is what feeds it
document.getElementById('keep-plaque').addEventListener('click', () => game.toggleKeep());
// #131: the carry rail was the other half of that button and is now the purse in the bottom-right,
// which is a readout rather than a control -- so there is nothing here to bind.
document.getElementById('ks-close').addEventListener('click', () => game.hideKeep());

// #23: one gear instead of three buttons on the field. The sheet holds sound, pause and how to play.
const settingsScreen = document.getElementById('settings-screen');
const soundState = document.getElementById('set-sound-state');
const syncSound = () => {
  soundState.textContent = audio.muted ? 'Off' : 'On';
  document.querySelector('#set-sound .icon, #set-sound svg')?.replaceWith(
    Object.assign(document.createElement('span'), { innerHTML: iconSvg(audio.muted ? 'speakerOff' : 'speaker', 24) }).firstChild,
  );
};
// Restart asks twice. It used to live behind the pause screen, which you only reach by deciding to
// stop; the settings sheet is opened to turn the sound off, and one stray tap there should not be
// able to throw away a run. The second tap has to come within a few seconds, so the row cannot sit
// armed and catch someone out the next time they open the sheet.
const restartRow = document.getElementById('set-restart');
const restartHint = document.getElementById('set-restart-hint');
let restartTimer = 0;
const disarmRestart = () => {
  clearTimeout(restartTimer);
  restartTimer = 0;
  restartRow.classList.remove('armed');
  restartHint.textContent = '';
};
restartRow.addEventListener('click', () => {
  if (!restartRow.classList.contains('armed')) {
    restartRow.classList.add('armed');
    restartHint.textContent = 'Tap again';
    restartTimer = setTimeout(disarmRestart, 4000);
    return;
  }
  disarmRestart();
  game.hideSettings(true);
  game.start();
});

const settingsBtn = document.getElementById('settings-btn');
const startUpdateBtn = document.getElementById('start-update');
const startUpdateNote = document.getElementById('start-update-note');
startUpdateBtn.addEventListener('click', installUpdate);
settingsBtn.addEventListener('click', () => {
  disarmRestart();
  syncUpdateRow();     // whether a reload would cost anything depends on where the run is right now
  syncSizeLine();
  game.hud.setScoreCount(readScores().length);
  game.toggleSettings();
});
const closeSettings = () => {
  disarmRestart();
  game.hideSettings();
};
document.getElementById('set-close').addEventListener('click', closeSettings);
document.getElementById('set-x').addEventListener('click', closeSettings);
settingsScreen.addEventListener('click', (e) => {
  if (e.target !== settingsScreen) return;   // tapping outside the sheet closes it
  disarmRestart();
  game.hideSettings();
});
document.getElementById('set-sound').addEventListener('click', () => {
  audio.init();
  audio.setMuted(!audio.muted);
  syncSound();
});
document.getElementById('set-info').addEventListener('click', () => {
  game.hideSettings(true);
  game.showInfo();
});
// #94: the board. Same shape as How to Play -- the sheet's pause is kept, and closing the board puts
// the sheet back rather than dropping the player into a game they did not ask to resume.
document.getElementById('set-scores').addEventListener('click', () => {
  game.hideSettings(true);
  game.showScores();
});
const closeScores = () => game.hideScores();
document.getElementById('sc-pick').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-b');
  if (b) game.setScoreLength(b.dataset.len);
});
document.getElementById('sc-close').addEventListener('click', closeScores);
document.getElementById('sc-x').addEventListener('click', closeScores);
document.getElementById('scores-screen').addEventListener('click', (e) => {
  if (e.target.id === 'scores-screen') closeScores();
});

// #84: the update row. Everything it talks to lives at the bottom of this file with the worker.
//
// It has one job the rest of the sheet does not: to be believable. "Up to date" is unfalsifiable on
// its own, and the whole reason this exists is somebody unable to tell which build their phone was
// running -- so the build the worker is actually answering with goes underneath, and the row says
// plainly when it could not reach the network rather than reporting good news it does not have.
const updateRow = document.getElementById('set-update');
const updateState = document.getElementById('set-update-state');
const updateLabel = updateRow.querySelector('.sheet-label');
const versionLine = document.getElementById('set-version');
const updateNote = document.getElementById('set-update-note');
let updateBusy = false;
let updateResult = '';    // '' | 'current' | 'failed'

// #120: what installing costs, in the player's terms.
//
// The line under the row used to speak only when there was something to LOSE -- anyone perfectly safe
// got a build hash. That is the reported gap: the game only ever warned and never reassured, so the
// one moment a player is deciding whether to risk a run, silence is all they had to go on.
//
// Three things it can be, off state the game already computes:
//
//   nothing in progress          -> installing costs nothing, and says so
//   a run, and the field is quiet -> `saveBeforeReload` will take one, so the run comes back
//   a run, mid-raid              -> the old line, which was already honest and stays word for word
//
// And over all three, the one that can make any of them a lie: a build whose save format has moved
// cannot read this one's save at all (`savedRun` returns null on a version mismatch and the run is
// discarded, not half-applied). That outranks everything, because it is the only case where the
// reassuring lines would be false -- and it is stated as a fact about the update rather than as a
// warning about the tap, since it is equally true of a run stored on disk and of the one being
// played. When the waiting worker has not answered (`waitingSave` null -- a build from before it
// could), nothing is claimed either way.
function updateCostLine() {
  const resets = swState.waitingSave !== null && swState.waitingSave !== SAVE_VERSION;
  const running = game.inRun();
  // a stored run is at stake too: a version bump throws it away the next time the title screen looks
  const atStake = running || !!game.savedRun();
  if (resets && atStake) return 'This update changes the save format, so your run will not survive it.';
  if (!running) return 'No run in progress, so installing costs you nothing.';
  if (game.quietEnoughToSave()) return 'Your run is saved before the game reloads.';
  return 'Installing reloads the game. Your run picks up from the last dawn.';
}

function syncUpdateRow() {
  const ready = !!swState.waiting;
  // #120: the signal OUTSIDE the sheet. `swState.waiting` is set the moment a build is ready and the
  // only thing that happened was this function repainting a row nobody was looking at. Here rather
  // than in `Hud.set`, which runs every frame: this changes on registration, `updatefound`, a manual
  // check and an install, and every one of those already calls this.
  settingsBtn.classList.toggle('update', ready);
  settingsBtn.title = ready ? 'Settings — an update is ready to install' : 'Settings';
  syncStartUpdate();
  if (!swState.reg) return;                  // no worker to ask: the row stays hidden
  updateRow.classList.remove('hidden');
  updateRow.classList.toggle('ready', ready);
  updateLabel.textContent = ready ? 'Update ready' : 'Check for updates';
  updateState.textContent = updateBusy ? 'Checking…'
    : ready ? 'Install'
    : updateResult === 'failed' ? 'No connection'
    : updateResult === 'current' ? 'Up to date'
    : '';
  // The line goes where it is read: under the row, before the tap -- which is a separate element
  // from the build hash now, because they are not the same kind of sentence and the hash belongs in
  // the footer with the screen details.
  updateNote.textContent = ready ? updateCostLine() : '';
  updateNote.classList.toggle('hidden', !updateNote.textContent);
  versionLine.textContent = swState.version ? `Build ${swState.version}` : '';
  versionLine.classList.toggle('hidden', !versionLine.textContent);
}

// #120: the same install from two places now -- the settings row and the title screen -- so it is one
// function. Take a fresh save first if the field happens to be quiet enough for one, then hand over;
// the page reloads itself the moment the new worker takes control.
function installUpdate() {
  if (updateBusy || !swState.waiting) return;
  game.saveBeforeReload();
  updateBusy = true;                    // the page is on its way out; a second tap does nothing
  updateState.textContent = 'Installing…';
  startUpdateBtn.textContent = 'Installing…';
  applyUpdate();
}

// #120: the title screen's own copy of the news. It is deliberately not a dot on something: there is
// nothing up here for a dot to sit on, and this screen has the room the HUD does not -- so it says
// what it is and what it costs, in the two lines the sheet would have taken a tap to reach.
//
// No check for whether the title screen is up. Both elements live INSIDE `#start-screen`, so the
// overlay takes them with it when it goes, and `showStart` is called once at load and never again --
// a game over restarts rather than returning here. One less thing to keep in step.
function syncStartUpdate() {
  const show = !!swState.waiting;
  startUpdateBtn.classList.toggle('hidden', !show);
  startUpdateNote.classList.toggle('hidden', !show);
  if (show && !updateBusy) startUpdateNote.textContent = updateCostLine();
}

updateRow.addEventListener('click', () => {
  if (updateBusy) return;
  if (swState.waiting) {
    installUpdate();
    return;
  }
  updateBusy = true;
  updateResult = '';
  syncUpdateRow();
  checkForUpdate().then((found) => {
    updateBusy = false;
    updateResult = found ? '' : 'current';
    syncUpdateRow();
  }).catch(() => {
    updateBusy = false;
    updateResult = 'failed';
    syncUpdateRow();
  });
});

window.addEventListener('keydown', (e) => {
  if (hud.introOpen()) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') hud.introNext();
    return;
  }
  if (game.offer) return; // an upgrade choice must be made before anything else
  // #132: the capability notice answers Escape and Enter and NOTHING else. It used to swallow the
  // whole keyboard, which was right for a panel holding the game still and is exactly wrong for a
  // notice over a game that is running: the player is playing, and every other key is his. Space is
  // still not one of the two -- it is the horn key, and a player holding it as the raid comes over
  // the wall would blow the notice away in the frame it appeared without ever seeing it.
  if (game.gain && (e.key === 'Escape' || e.key === 'Enter')) {
    game.dismissGain();
    return;
  }
  if (e.key === ' ' || e.key === 'e' || e.key === 'E') return game.useHorn();
  // #57: Shift, the binding every game with a sprint already uses, and next to WASD for either hand.
  // `e.repeat` because a held key fires until it is let go, which would spend the dash again on the
  // exact frame its cooldown ended, forever, without the player pressing anything.
  if (e.key === 'Shift' && !e.repeat) return game.useDash();
  // #57: B for banner. Not a modifier like the dash, because it is a deliberate order rather than a
  // reflex, and nothing else in the game uses it.
  if ((e.key === 'b' || e.key === 'B') && !e.repeat) return game.plantBanner();
  if (e.key === 'Enter' && game.placing) return game.confirmPlacing();   // #43
  if ((e.key === 'm' || e.key === 'M') && !e.repeat && game.movable) return game.beginMoving(game.movable);
  if (e.key === 'i' || e.key === 'I') game.toggleInfo();
  else if (e.key === 'k' || e.key === 'K') game.toggleKeep();
  else if (e.key === 'Escape' && game.settingsOpen) {
    disarmRestart();
    game.hideSettings();
  }
  else if (e.key === 'Escape' && game.keepOpen) game.hideKeep();
  else if (e.key === 'Escape' && game.infoOpen) game.hideInfo();
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') game.togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

syncSound();
// browsers only allow sound after a user gesture; catch the first one anywhere
window.addEventListener('pointerdown', () => audio.init(), { once: true });

// #74: every size the page can be asked for, on one line. The green bands at the top and bottom of
// the iOS home-screen app are a drawing buffer that does not cover the screen, and which of these
// comes back short is the whole question -- one that a headless browser cannot answer, because it has
// no safe areas and no standalone mode. A phone with ?perf=1 can, in one screenshot.
function sizeReport() {
  const c = document.getElementById('game');
  const vv = window.visualViewport;
  const cs = getComputedStyle(document.documentElement);
  const inset = (n) => (cs.getPropertyValue(n) || '0px').trim();
  // #74: where the canvas ACTUALLY is, not only how big it says it is. The bug this exists to settle
  // is the canvas failing to reach the top and bottom of the screen, and a size alone cannot show
  // that -- a box of 390x762 is only wrong once you know the screen is 844 tall and the box starts at
  // y=0. So the rect goes in, and `doc` beside it, because `documentElement.clientHeight` is the
  // number a percentage height resolves against and is the one suspected of being short.
  const r = c.getBoundingClientRect();
  return `css ${c.clientWidth}x${c.clientHeight} · box ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`
    + ` · buf ${c.width}x${c.height}`
    + ` · win ${window.innerWidth}x${window.innerHeight} · doc ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`
    + ` · vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}` : '-'}`
    + ` · screen ${screen.width}x${screen.height} · safe ${inset('--sat')}/${inset('--sab')}`
    + ` · units lvh ${unitPx('lvh')} dvh ${unitPx('dvh')} svh ${unitPx('svh')} vh ${unitPx('vh')}`
    // #74: the full-screen layers, because the canvas reaching the glass while one of them does not is
    // how the strip survived being fixed once already.
    + ` · layers vig ${Math.round(document.getElementById('vignette').getBoundingClientRect().height)}`
    + ` hud ${Math.round(document.getElementById('hud').getBoundingClientRect().height)}`
    + ` · standalone ${!!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches)}`;
}

// #74: the same numbers `?perf=1` prints, in the settings sheet, where a home-screen app can reach
// them. The overlay needs a query string and a shortcut launches at the manifest's `start_url`, so
// the one place the screen bugs actually happen is the one place the numbers could not be read.
//
// Short enough to be read off the screen, and the whole of `sizeReport()` on a tap, because "send me
// that line" is what this is for and retyping a wall of numbers off a phone is how a digit gets lost.
// The clipboard write is inside the tap handler because iOS grants it only to a gesture, and it is
// allowed to fail: the line is on screen either way and a screenshot is a fine second best.
// #74: what each viewport unit actually resolves to on this device. The reading from the iPhone says
// the layout viewport is 440x894 against a 440x956 screen -- the canvas fills the viewport exactly and
// the viewport is a status bar short of the glass -- so the question is no longer "is the canvas
// right" but "is there a unit that reaches the screen at all". `lvh` is the large viewport and should;
// `dvh` is the current one and demonstrably does not. Measured rather than assumed, because the whole
// history of this bug is iOS answering differently from the spec.
//
// An unsupported unit makes the declaration invalid, the div falls back to `height: auto` on an empty
// box, and this returns 0 -- which is how a browser without the unit tells us so.
function unitPx(unit) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:100${unit};visibility:hidden;pointer-events:none`;
  document.body.appendChild(d);
  const h = Math.round(d.getBoundingClientRect().height);
  d.remove();
  return h;
}

const sizeLine = document.getElementById('set-size');
function syncSizeLine() {
  if (!sizeLine) return;
  const c = document.getElementById('game');
  const cs = getComputedStyle(document.documentElement);
  const inset = (n) => parseInt(cs.getPropertyValue(n), 10) || 0;
  const standalone = !!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const r = c.getBoundingClientRect();
  // #74: the shortfall that matters is the canvas against the SCREEN, not against the viewport. The
  // iPhone reading had the canvas matching the viewport perfectly and both of them 62px short of the
  // glass, so a line that only compared those two reported everything was fine. Only in portrait:
  // iOS reports `screen` in portrait terms whichever way round the phone is.
  const portrait = window.innerHeight > window.innerWidth;
  const short = portrait ? Math.round(screen.height - r.height) : 0;
  sizeLine.textContent = `${Math.round(r.width)}\u00D7${Math.round(r.height)}`
    + (short > 1 ? ` of ${screen.width}\u00D7${screen.height} · SHORT BY ${short}` : '')
    + ` · safe ${inset('--sat')}/${inset('--sab')}`
    + (standalone ? ' · installed' : ' · browser')
    + ' · tap to copy';
}
sizeLine?.addEventListener('click', async () => {
  const text = sizeReport();
  try {
    await navigator.clipboard.writeText(text);
    sizeLine.textContent = 'Copied. Paste it into the bug report.';
  } catch (e) {
    sizeLine.textContent = text;     // no clipboard: put the whole thing on screen to be screenshotted
  }
});

// Performance overlay: add ?perf=1 to the URL to see frame time, draw calls and triangles live.
// Aim for under 16 ms (60 fps) on desktop and under 33 ms (30 fps) on phones.
let perf = null;
if (/[?&]perf=1/.test(location.search)) {
  perf = document.createElement('div');
  perf.id = 'perf';
  document.body.appendChild(perf);
}
let perfT = 0;
let perfFrames = 0;
let perfMs = 0;
// #54: the try/catch around game.update is the right call for shipping -- a throw costs one frame
// rather than the run -- and it is also exactly why a crash in the river foam sat unnoticed through
// however many sessions. Counting them changes nothing about the shipping behaviour and makes the
// next one visible to anyone holding a phone with ?perf=1 on it.
let caught = 0;
let lastError = '';

let last = performance.now();
function frame(now) {
  // #54: clamped at BOTH ends. `last` is set when this module is evaluated and the first rAF callback
  // is handed the timestamp of the frame that was already in flight -- which can predate it, so the
  // very first dt of a run can be negative. Measured across six cold loads here: one came back at
  // -0.002s. `Math.min(0.05, ...)` let that straight through, and a frame of negative time runs every
  // system in the game a little way backwards.
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  const t0 = perf ? performance.now() : 0;
  try {
    game.update(dt);
  } catch (err) {
    caught++;
    lastError = (err && err.message) || String(err);
    console.error(err);
  }
  if (perf) {
    perfMs += performance.now() - t0;
    perfFrames++;
    perfT += dt;
    if (perfT >= 0.5) {
      const info = game.renderer.info.render;
      const ms = perfMs / perfFrames;
      const c = game.canvas;
      const crowd = game.crowdStats();
      perf.textContent = `${(perfFrames / perfT).toFixed(0)} fps · ${ms.toFixed(1)} ms cpu · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${game.units.length + game.enemies.length} chars`
        + (crowd.characters ? ` (${crowd.drawn}/${crowd.characters} instanced in ${crowd.models} draws)` : '')
        + ` · ${c.width}x${c.height} buf @${game.renderer.getPixelRatio()}${game.contextLost ? ' · GL CONTEXT LOST' : ''}`
        + (caught ? `\n${caught} caught error${caught > 1 ? 's' : ''}: ${lastError}` : '')
        + `\n${sizeReport()}`;
      perf.style.color = ms > 33 ? '#ff7a7a' : ms > 16 ? '#ffd27a' : '#b8ffb0';
      perfT = 0;
      perfFrames = 0;
      perfMs = 0;
    }
  }
  // #74: the root background is the ONLY thing that can paint the strip an installed iPhone leaves at
  // the bottom of the screen. Measured, with the canvas and the vignette both sized to the glass and
  // the strip still there: it is outside the layout viewport, and nothing a page paints reaches
  // outside its own viewport. What the strip DID follow, every time, was this colour -- dark when the
  // page background was dark, green when it was green.
  //
  // So it gets a colour chosen for it: the vignette's own tint, so the strip reads as the darkening
  // at the edge of the screen carrying on past it rather than as a slab of a colour used nowhere
  // else. Held until a frame exists, because until then this is the whole screen and the load should
  // not flash dark on its way into a green game.
  //
  // If the viewport ever comes back full-height this is invisible and costs nothing, which is why it
  // is a colour and not a workaround.
  if (!strippedBg && game.frames > 0) {
    strippedBg = true;
    document.documentElement.style.backgroundColor = '#16210c';
  }
  requestAnimationFrame(frame);
}
let strippedBg = false;
requestAnimationFrame(frame);

// expose for poking around in the console
window.game = game;
window.audio = audio;

// Add to Home Screen. The service worker holds the whole game — the bundle, the models and the
// fonts — so once it has been opened with a connection it opens again without one.
//
// Registered LAST, not on window.load. Its install fetches every file with `cache: 'reload'`, which
// deliberately ignores the browser's own cache — so registering it early put a second, full copy of
// every model on the wire alongside the ones the game was still waiting on, and the player watched
// the loading bar pay for a download they would not use until their next visit. The order that
// matters to someone opening this for the first time is: what the opening needs, then what the next
// few minutes need, then what tomorrow needs.
//
// Only in a built site: in dev a worker caching the bundle would serve yesterday's code back over
// Vite's own reloading, which is a maddening thing to debug.
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      swState.reg = reg;
      watchForUpdate(reg);
      askVersion();
      syncUpdateRow();
    })
    .catch((e) => console.warn('offline play unavailable:', e && e.message));
}

// #84: keeping the game up to date, and being able to say that it is.
//
// The worker installs and waits rather than taking over (see vite.config.js), so everything below is
// about the gap between "a new build exists" and "this page is running it".
//
// Opening the site in a browser tab was never the problem: a navigation re-checks sw.js and the
// worker serves the page network-first, so a deploy arrives on its own. A homescreen PWA is the case
// that breaks, because iOS RESUMES it to the page it was already on -- no navigation, no check, and
// the phone can sit on one build for as long as the app stays in the switcher.
const swState = {
  reg: null,
  waiting: null,    // an installed worker holding for permission to take over
  version: '',      // the cache name of the build actually answering, e.g. crownrush-4f1c...
  // #120: the save format the WAITING build reads, asked of it directly. `null` is "not known",
  // which is a third state and not a synonym for "the same": a worker built before this existed
  // never answers, and the row has to stay quiet about survival rather than guess.
  waitingSave: null,
  lastCheck: 0,
};

function watchForUpdate(reg) {
  const offer = (worker) => {
    if (!worker || swState.waiting === worker) return;
    // An installed worker with nobody controlling the page is a FIRST install, not an update: there
    // is no older build to replace and nothing to tell anyone about.
    if (!navigator.serviceWorker.controller) return;
    swState.waiting = worker;
    swState.waitingSave = null;
    askWaitingBuild(worker);
    syncUpdateRow();
  };
  if (reg.waiting) offer(reg.waiting);      // one was already holding from a previous visit
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
  });
}

// Resolves with whether one is now waiting. Rejects if the check could not be made at all, which is
// the case the row has to report honestly rather than as good news.
function checkForUpdate() {
  if (!swState.reg) return Promise.reject(new Error('no worker'));
  // update() can resolve without having reached anything, and "Up to date" told to a phone with no
  // signal is the exact lie this row exists to stop telling. onLine being true is no promise that
  // the network works, but onLine being false is a promise that it does not.
  if (navigator.onLine === false) return Promise.reject(new Error('offline'));
  swState.lastCheck = Date.now();
  return swState.reg.update()
    .then(() => settled(swState.reg))
    .then(() => !!swState.waiting);
}

// update() can resolve while the new worker is still installing, and a row that says "up to date"
// half a second before one appears is worse than a row that takes half a second longer. The timeout
// is there because a worker that never finishes installing must not leave it spinning for good.
function settled(reg) {
  const w = reg.installing;
  if (!w) return Promise.resolve();
  return new Promise((done) => {
    const check = () => { if (w.state !== 'installing') done(); };
    w.addEventListener('statechange', check);
    setTimeout(done, 8000);
    check();
  });
}

function applyUpdate() {
  const w = swState.waiting;
  if (!w) return false;
  // The page reloads as soon as the new worker takes control, so that everything in memory and
  // everything it has yet to import come from the same build. `controllerchange` can fire for other
  // reasons, hence the latch: reload once, or not at all.
  let reloaded = false;
  const go = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', go);
  // If it never takes over, reload anyway rather than leaving the row saying "Installing…" for good.
  // A reload is a navigation, and the worker serves the page network-first, so the player ends up on
  // the new build either way -- the handover only decides whether the old cache is cleaned up now or
  // on the visit after.
  setTimeout(go, 6000);
  w.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

// #120: what the build that is WAITING will do to a run in progress.
//
// The page cannot know this from anything it holds -- it is the old build, and the answer lives in
// the new one's `game-save.js`. But a worker in `waiting` is already installed and already receiving
// messages, so it can be asked, and its baked `SAVE_VERSION` ships in the same commit as the bundle
// it is waiting to serve. Same `MessageChannel` shape as `askVersion`.
//
// Everything about the failure is deliberate. A worker built before this message existed never
// replies, so `waitingSave` stays null and the row says nothing about survival -- and there is a
// timeout because a channel nobody answers leaves no event to hang that on. Null is not "the same
// version": the whole point of the line is that a reassurance which turns out to be false once is
// worse than no reassurance at all.
function askWaitingBuild(worker) {
  const ch = new MessageChannel();
  let answered = false;
  ch.port1.onmessage = (e) => {
    answered = true;
    const save = e.data && e.data.save;
    swState.waitingSave = typeof save === 'number' ? save : null;
    syncUpdateRow();
  };
  setTimeout(() => { if (!answered) ch.port1.close(); }, 4000);
  try {
    worker.postMessage({ type: 'BUILD' }, [ch.port2]);
  } catch {
    // a worker that has already moved on (redundant, or taken over) cannot be messaged
    swState.waitingSave = null;
  }
}

// Which build is serving this page. Asked of the worker rather than baked in at build time, because
// the cache name is a hash of the file list and is only known once the bundle has been written --
// and because what matters is the build that is ANSWERING, not the one the page was compiled from.
function askVersion() {
  const c = navigator.serviceWorker.controller;
  // Nothing controls the page on a first visit until the worker has activated and claimed it, which
  // happens a moment after registering. Ask again when it does, rather than leaving the build line
  // blank until the next time the game is opened.
  if (!c) {
    navigator.serviceWorker.addEventListener('controllerchange', askVersion, { once: true });
    return;
  }
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    swState.version = String(e.data || '').replace(/^crownrush-/, '');
    syncUpdateRow();
  };
  c.postMessage({ type: 'VERSION' }, [ch.port2]);
}

// Coming back to the foreground is the only moment a resumed homescreen app reliably gives us, so it
// is when to look. Throttled hard: an app is foregrounded dozens of times a session and this is a
// network request. The row is still worth having on top of it -- it is the thing somebody can be
// TOLD to press when their phone is being stubborn.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !swState.reg) return;
  if (Date.now() - swState.lastCheck < 15 * 60 * 1000) return;
  checkForUpdate().then(() => syncUpdateRow()).catch(() => { /* offline; the row says so when asked */ });
});
