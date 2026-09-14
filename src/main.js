import { Game } from './game.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { preloadRigs } from './rig.js';
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
startBtn.textContent = 'Loading…';
mountIcons();
Promise.all([preloadIcons(), document.fonts ? document.fonts.ready : Promise.resolve(), preloadRigs(['king', 'queen', 'king_mounted', 'archer', 'swordsman', 'raider', 'elite', 'brute', 'boss'])]).then(() => {
  game.pads.forEach((p) => game.drawPad(p));
  startBtn.disabled = false;
  startBtn.textContent = 'Play';
});
document.getElementById('start-btn').addEventListener('click', () => game.start());
document.getElementById('restart-btn').addEventListener('click', () => game.start());
document.getElementById('continue-btn').addEventListener('click', () => game.resume());
document.getElementById('victory-restart').addEventListener('click', (e) => {
  e.preventDefault();
  game.start();
});

document.getElementById('pause-btn').addEventListener('click', () => game.togglePause());
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
document.getElementById('info-btn').addEventListener('click', () => game.toggleInfo());
document.getElementById('info-close').addEventListener('click', () => game.hideInfo());
window.addEventListener('keydown', (e) => {
  if (game.offer) return; // an upgrade choice must be made before anything else
  if (e.key === 'i' || e.key === 'I') game.toggleInfo();
  else if (e.key === 'Escape' && game.infoOpen) game.hideInfo();
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') game.togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

const muteBtn = document.getElementById('mute-btn');
const syncMute = () => (muteBtn.innerHTML = iconSvg(audio.muted ? 'speakerOff' : 'speaker', 22));
syncMute();
muteBtn.addEventListener('click', () => {
  audio.init();
  audio.setMuted(!audio.muted);
  syncMute();
});
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
      perf.textContent = `${(perfFrames / perfT).toFixed(0)} fps · ${ms.toFixed(1)} ms cpu · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${game.units.length + game.enemies.length} chars`;
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
