import { Game } from './game.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { preloadRigs } from './rig.js';

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
preloadRigs(['king', 'queen']).then(() => {
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
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') game.togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

const muteBtn = document.getElementById('mute-btn');
const syncMute = () => (muteBtn.textContent = audio.muted ? '🔇' : '🔊');
syncMute();
muteBtn.addEventListener('click', () => {
  audio.init();
  audio.setMuted(!audio.muted);
  syncMute();
});
// browsers only allow sound after a user gesture; catch the first one anywhere
window.addEventListener('pointerdown', () => audio.init(), { once: true });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    game.update(dt);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for poking around in the console
window.game = game;
