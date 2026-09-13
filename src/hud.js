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
    this.tip = document.getElementById('pad-tip');
    this.nextBtn = document.getElementById('next-wave-btn');
    this.minimap = document.getElementById('minimap');
    this.resEls = { wood: document.getElementById('res-wood'), stone: document.getElementById('res-stone'), straw: document.getElementById('res-straw') };
    this.scoreEl = document.getElementById('score-num');
    this.kingHpEl = document.getElementById('king-hp-fill');
    this.queenHpEl = document.getElementById('queen-hp-fill');
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastWave = -1;
    this.lastArmy = -1;
    this.lastNext = -1;
  }
  set(coins, wave, army, nextIn, goal, res, score, kingFrac, queenFrac) {
    if (queenFrac !== undefined) this.queenHpEl.style.width = `${Math.max(0, Math.min(1, queenFrac)) * 100}%`;
    if (res) {
      for (const k of ['wood', 'stone', 'straw']) {
        const el = this.resEls[k];
        if (el && el.textContent !== String(res[k])) el.textContent = res[k];
      }
    }
    if (score !== undefined && score !== this.lastScore) {
      this.scoreEl.textContent = score.toLocaleString();
      this.lastScore = score;
    }
    if (kingFrac !== undefined) this.kingHpEl.style.width = `${Math.max(0, Math.min(1, kingFrac)) * 100}%`;
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
  showGameOver(wave, coins, score, best, reason = 'king') {
    document.getElementById('gameover-title').textContent = reason === 'queen' ? 'The Queen Has Fallen' : 'The King Has Fallen';
    document.getElementById('final-wave').textContent = wave;
    document.getElementById('final-coins').textContent = coins;
    document.getElementById('final-score').textContent = score.toLocaleString();
    document.getElementById('final-best').textContent = best.toLocaleString();
    this.overScreen.classList.remove('hidden');
  }
  hideGameOver() {
    this.overScreen.classList.add('hidden');
  }
  // readable requirements card floating above the pad the King is near
  showPadTip(x, y, name, chips, note) {
    this.tip.classList.remove('hidden');
    this.tip.style.transform = `translate(calc(${Math.round(x)}px - 50%), calc(${Math.round(y)}px - 100%))`;
    if (this.tipKey !== name + chips.map((c) => c.text + c.state).join('|') + note) {
      this.tipKey = name + chips.map((c) => c.text + c.state).join('|') + note;
      this.tip.querySelector('.tip-name').textContent = name;
      this.tip.querySelector('.tip-costs').innerHTML = chips.map((c) => `<span class="chip ${c.state}">${c.text}</span>`).join('');
      let n = this.tip.querySelector('.tip-note');
      if (!n) {
        n = document.createElement('div');
        n.className = 'tip-note';
        this.tip.appendChild(n);
      }
      n.textContent = note;
    }
  }
  hidePadTip() {
    this.tip.classList.add('hidden');
    this.tipKey = null;
  }
  showNextWave(show) {
    this.nextBtn.classList.toggle('hidden', !show);
  }
  showPause() {
    document.getElementById('pause-screen').classList.remove('hidden');
  }
  hidePause() {
    document.getElementById('pause-screen').classList.add('hidden');
  }
  showVictory(coins, army, score) {
    document.getElementById('victory-coins').textContent = coins;
    document.getElementById('victory-army').textContent = army;
    document.getElementById('victory-score').textContent = score.toLocaleString();
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
      el.lastChild.textContent = it.home ? '🏰' : it.boss ? '💀' : it.count > 1 ? it.count : '';
      el.classList.toggle('boss', !!it.boss);
      el.classList.toggle('home', !!it.home);
    });
  }
}
