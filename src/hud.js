export class Hud {
  constructor() {
    this.coinEl = document.getElementById('coin-count');
    this.waveEl = document.getElementById('wave-num');
    this.armyEl = document.getElementById('army-count');
    this.toastEl = document.getElementById('toast');
    this.startScreen = document.getElementById('start-screen');
    this.overScreen = document.getElementById('gameover-screen');
    this.toastTimer = null;
    this.nextEl = document.getElementById('next-wave');
    this.goalEl = document.getElementById('wave-goal');
    this.winScreen = document.getElementById('victory-screen');
    this.indicatorLayer = document.getElementById('indicators');
    this.indicators = [];
    this.lastCoins = -1;
    this.lastWave = -1;
    this.lastArmy = -1;
    this.lastNext = -1;
  }
  set(coins, wave, army, nextIn, goal) {
    const n = Math.max(0, Math.ceil(nextIn));
    if (n !== this.lastNext) {
      this.nextEl.textContent = nextIn === null ? '' : `next wave in ${n}s`;
      this.lastNext = n;
    }
    if (goal !== undefined) this.goalEl.textContent = wave > goal ? '· endless' : `/ ${goal}`;
    if (coins !== this.lastCoins) {
      this.coinEl.textContent = coins;
      this.lastCoins = coins;
    }
    if (wave !== this.lastWave) {
      this.waveEl.textContent = wave;
      this.lastWave = wave;
    }
    if (army !== this.lastArmy) {
      this.armyEl.textContent = army;
      this.lastArmy = army;
    }
  }
  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
  showStart(best) {
    document.getElementById('best-wave').textContent = best;
    this.startScreen.classList.remove('hidden');
  }
  hideStart() {
    this.startScreen.classList.add('hidden');
  }
  showGameOver(wave, coins) {
    document.getElementById('final-wave').textContent = wave;
    document.getElementById('final-coins').textContent = coins;
    this.overScreen.classList.remove('hidden');
  }
  hideGameOver() {
    this.overScreen.classList.add('hidden');
  }
  showPause() {
    document.getElementById('pause-screen').classList.remove('hidden');
  }
  hidePause() {
    document.getElementById('pause-screen').classList.add('hidden');
  }
  showVictory(coins, army) {
    document.getElementById('victory-coins').textContent = coins;
    document.getElementById('victory-army').textContent = army;
    this.winScreen.classList.remove('hidden');
  }
  hideVictory() {
    this.winScreen.classList.add('hidden');
  }

  // Edge arrows pointing at off-screen enemies. `list` = [{x, y, angle, count, boss}] in CSS pixels.
  setIndicators(list) {
    while (this.indicators.length < list.length) {
      const el = document.createElement('div');
      el.className = 'indicator';
      el.innerHTML = '<div class="arrow"></div><div class="count"></div>';
      this.indicatorLayer.appendChild(el);
      this.indicators.push(el);
    }
    this.indicators.forEach((el, i) => {
      const it = list[i];
      if (!it) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      el.firstChild.style.transform = `rotate(${it.angle}rad)`;
      el.lastChild.textContent = it.boss ? '💀' : it.count > 1 ? it.count : '';
      el.classList.toggle('boss', it.boss);
    });
  }
}
