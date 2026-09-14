import { Game } from './game.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { preloadRigs, renderPortrait, releasePortraitRenderer } from './rig.js';
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

hud.showStart(game.best);
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
const RIGS = ['king', 'queen', 'king_mounted', 'archer', 'swordsman', 'raider', 'elite', 'brute', 'boss'];
Promise.all([preloadIcons(), document.fonts ? document.fonts.ready : Promise.resolve(), preloadRigs(RIGS, (n, total) => setLoad(0.1 + (0.85 * n) / total, `Loading ${n} of ${total}…`))]).then(() => {
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
});
// #6: the first time through, Play opens a short stepped intro; after that it goes straight in
const INTRO_KEY = 'crownrush-intro-seen';
const INTRO = [
  { icon: 'tiara', title: 'Find the Queen', text: 'She has been taken. Follow the pink arrow, clear her guards and bring her home. Nothing can be built, and no raid comes, until she is free.' },
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
document.getElementById('info-close').addEventListener('click', () => game.hideInfo());

// #23: one gear instead of three buttons on the field. The sheet holds sound, pause and how to play.
const settingsScreen = document.getElementById('settings-screen');
const soundState = document.getElementById('set-sound-state');
const syncSound = () => {
  soundState.textContent = audio.muted ? 'Off' : 'On';
  document.querySelector('#set-sound .icon, #set-sound svg')?.replaceWith(
    Object.assign(document.createElement('span'), { innerHTML: iconSvg(audio.muted ? 'speakerOff' : 'speaker', 24) }).firstChild,
  );
};
document.getElementById('settings-btn').addEventListener('click', () => game.toggleSettings());
document.getElementById('set-close').addEventListener('click', () => game.hideSettings());
settingsScreen.addEventListener('click', (e) => {
  if (e.target === settingsScreen) game.hideSettings();  // tapping outside the sheet closes it
});
document.getElementById('set-sound').addEventListener('click', () => {
  audio.init();
  audio.setMuted(!audio.muted);
  syncSound();
});
document.getElementById('set-pause').addEventListener('click', () => {
  game.hideSettings(true);
  game.pause();
});
document.getElementById('set-info').addEventListener('click', () => {
  game.hideSettings(true);
  game.showInfo();
});
window.addEventListener('keydown', (e) => {
  if (hud.introOpen()) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') hud.introNext();
    return;
  }
  if (game.offer) return; // an upgrade choice must be made before anything else
  if (e.key === ' ' || e.key === 'e' || e.key === 'E') return game.useHorn();
  if (e.key === 'i' || e.key === 'I') game.toggleInfo();
  else if (e.key === 'Escape' && game.settingsOpen) game.hideSettings();
  else if (e.key === 'Escape' && game.infoOpen) game.hideInfo();
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') game.togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

syncSound();
// browsers only allow sound after a user gesture; catch the first one anywhere
window.addEventListener('pointerdown', () => audio.init(), { once: true });

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
      perf.textContent = `${(perfFrames / perfT).toFixed(0)} fps · ${ms.toFixed(1)} ms cpu · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${game.units.length + game.enemies.length} chars`
        + ` · ${c.width}x${c.height} buf @${game.renderer.getPixelRatio()}${game.contextLost ? ' · GL CONTEXT LOST' : ''}`;
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
