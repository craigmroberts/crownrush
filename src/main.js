import { Game } from './game.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';

const canvas = document.getElementById('game');
const hud = new Hud();
const game = new Game(canvas, hud);

hud.showStart(game.best);
document.getElementById('start-btn').addEventListener('click', () => game.start());
document.getElementById('restart-btn').addEventListener('click', () => game.start());

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
