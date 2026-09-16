import { Game } from './game.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { preloadRigs, renderPortrait, releasePortraitRenderer } from './rig.js';
import { preloadProps } from './props.js';
import { preloadIcons, mountIcons, iconSvg } from './icons.js';

const canvas = document.getElementById('game');
const hud = new Hud();
let game;
try {
  game = new Game(canvas, hud);
} catch (err) {
  window.__showError(err && err.message ? err.message : String(err));
  throw err;
}

hud.showStart(game.best, game.savedRun());
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
  Promise.all([preloadRigs(LATER_RIGS), preloadProps(LATER_PROPS)])
    .catch((e) => console.warn('deferred models unavailable:', e && e.message))
    .then(registerServiceWorker);
});
// #6: the first time through, Play opens a short stepped intro; after that it goes straight in
const INTRO_KEY = 'crownrush-intro-seen';
const INTRO = [
  { icon: 'tiara', title: 'Find the Queen', text: 'Raiders have taken Wren, your Queen. Follow the pink arrow, clear her guards and bring her home. Nothing can be built, and no raid comes, until she is free.' },
  { icon: 'coin', title: 'Fight and collect', text: 'Your archers shoot on their own. Raiders drop coins: walk over them to pick them up. The colour a raider wears tells you how dangerous it is.' },
  { icon: 'horn', title: 'Sound the horn', text: 'The horn button (or Space) rallies your army to you and drives them for a few seconds, and the blast throws nearby raiders back. It takes a while to recharge, so save it for a breach.' },
  { icon: 'hammer', title: 'Build', text: 'Stop on a floor marker to spend coins. Square markers build; round ones recruit and upgrade. Walking across a marker costs nothing.' },
  { icon: 'keep', title: 'Feed the Keep', text: 'Wood, stone and straw go into the Keep only. Feeding it levels up the whole kingdom: a bigger army, faster arrows, stronger walls. Gather by day. The raid comes at night.' },
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
document.getElementById('horn-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.useHorn();
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
document.getElementById('carry-rail').addEventListener('click', () => game.toggleKeep());
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

document.getElementById('settings-btn').addEventListener('click', () => {
  disarmRestart();
  syncUpdateRow();     // whether a reload would cost anything depends on where the run is right now
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
let updateBusy = false;
let updateResult = '';    // '' | 'current' | 'failed'

function syncUpdateRow() {
  if (!swState.reg) return;                  // no worker to ask: the row stays hidden
  updateRow.classList.remove('hidden');
  const ready = !!swState.waiting;
  updateRow.classList.toggle('ready', ready);
  updateLabel.textContent = ready ? 'Update ready' : 'Check for updates';
  updateState.textContent = updateBusy ? 'Checking…'
    : ready ? 'Install'
    : updateResult === 'failed' ? 'No connection'
    : updateResult === 'current' ? 'Up to date'
    : '';
  // The warning goes where it is read: under the row, before the tap, and only when there is
  // something to lose. Installing reloads, and a run only survives a reload through a save.
  const warn = ready && game.inRun() && !game.quietEnoughToSave();
  versionLine.textContent = warn
    ? 'Installing reloads the game. Your run picks up from the last dawn.'
    : swState.version ? `Build ${swState.version}` : '';
  versionLine.classList.toggle('hidden', !versionLine.textContent);
}

updateRow.addEventListener('click', () => {
  if (updateBusy) return;
  if (swState.waiting) {
    // Take a fresh save first if the field happens to be quiet enough for one, then hand over. The
    // page reloads itself the moment the new worker takes control.
    game.saveBeforeReload();
    updateBusy = true;                  // the page is on its way out; a second tap does nothing
    updateState.textContent = 'Installing…';
    applyUpdate();
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
  if (e.key === ' ' || e.key === 'e' || e.key === 'E') return game.useHorn();
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
  return `css ${c.clientWidth}x${c.clientHeight} · win ${window.innerWidth}x${window.innerHeight}`
    + ` · vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}` : '-'}`
    + ` · screen ${screen.width}x${screen.height} · safe ${inset('--sat')}/${inset('--sab')}`
    + ` · standalone ${!!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches)}`;
}

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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = perf ? performance.now() : 0;
  try {
    game.update(dt);
  } catch (err) {
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
        + `\n${sizeReport()}`;
      perf.style.color = ms > 33 ? '#ff7a7a' : ms > 16 ? '#ffd27a' : '#b8ffb0';
      perfT = 0;
      perfFrames = 0;
      perfMs = 0;
    }
  }
  requestAnimationFrame(frame);
}
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
  lastCheck: 0,
};

function watchForUpdate(reg) {
  const offer = (worker) => {
    if (!worker || swState.waiting === worker) return;
    // An installed worker with nobody controlling the page is a FIRST install, not an update: there
    // is no older build to replace and nothing to tell anyone about.
    if (!navigator.serviceWorker.controller) return;
    swState.waiting = worker;
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
