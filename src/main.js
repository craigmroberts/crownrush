import { Game } from './game.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const hud = new Hud();
const game = new Game(canvas, hud);

hud.showStart(game.best);
document.getElementById('start-btn').addEventListener('click', () => game.start());
document.getElementById('restart-btn').addEventListener('click', () => game.start());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for poking around in the console
window.game = game;
