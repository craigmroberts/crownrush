import { iconSvg } from './icons.js';

export class Hud {
  constructor() {
    this.coinEl = document.getElementById('coin-count');
    this.coinIcon = document.getElementById('coin-icon');
    this.coinTier = null;
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
    this.alarmEl = document.getElementById('alarm');
    this.minimap = document.getElementById('minimap');
    this.resEls = { wood: document.getElementById('res-wood'), stone: document.getElementById('res-stone'), straw: document.getElementById('res-straw') };
    this.scoreEl = document.getElementById('score-num');
    this.levelEl = document.getElementById('keep-level');
    this.kingHpEl = document.getElementById('king-hp-fill');
    this.queenHpEl = document.getElementById('queen-hp-fill');
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastWave = -1;
    this.lastArmy = -1;
    this.lastNext = -1;
  }
  set(coins, wave, army, nextIn, goal, res, score, kingFrac, queenFrac, level) {
    if (level !== undefined && level !== this.lastLevel) {
      this.levelEl.textContent = level;
      this.lastLevel = level;
    }
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
    (document.getElementById('toast-text') || this.toastEl).textContent = text;
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
      this.tip.querySelector('.tip-costs').innerHTML = chips.map((c) => `<span class="chip ${c.state}">${iconSvg(c.icon, 18)}${c.text}</span>`).join('');
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
  showAlarm(text) {
    const el = this.alarmEl;
    const on = !!text;
    if (on && el.textContent !== text) el.textContent = text;
    if (on !== !el.classList.contains('hidden')) el.classList.toggle('hidden', !on);
    document.getElementById('queen-hp').classList.toggle('hit', on);
  }
  showNextWave(show) {
    this.nextBtn.classList.toggle('hidden', !show);
  }
  setCoinTier(tier) {
    if (tier === this.coinTier) return;
    this.coinTier = tier;
    this.coinIcon.innerHTML = iconSvg(tier, 40);
  }

  showInfo(d) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const chip = (icon, text, state = '') => `<span class="ichip ${state}">${iconSvg(icon, 16)}${esc(text)}</span>`;
    const h = [];
    if (d.queenCaptive) h.push('<p class="info-note">The Queen is still captive. Follow the pink arrow, clear her guards and reach her. Nothing can be built, and no raiders will come, until she is free.</p>');
    h.push(`<h2>${iconSvg('keep', 22)} Keep level ${d.level}${d.level >= d.max ? ' (max)' : ''}</h2>`);
    if (!d.hasKeep) h.push('<p>Not built yet. Stand on the Royal Keep pad in the village.</p>');
    else if (d.need.length) {
      h.push(`<p class="sub">To reach level ${d.level + 1}, feed the Keep:</p><p>${d.need.map((n) => chip(n.type, `${n.need} ${n.type} (you carry ${n.have})`, n.have >= n.need ? 'ok' : n.have > 0 ? '' : 'short')).join(' ')}</p>`);
    }
    if (d.unlocks.length) h.push(`<p class="sub">Level ${d.level + 1} gives you:</p><ul>${d.unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>`);
    h.push(`<h2>${iconSvg('archer', 22)} Your army</h2><p>${chip('archer', `${d.army.archers} / ${d.army.archerCap} archers`)} ${chip('swordsman', `${d.army.swords} / ${d.army.swordCap} swordsmen`)} ${chip('tower', d.army.towers.length ? `${d.army.towers.length} towers (levels ${d.army.towers.join(', ')})` : 'no towers yet')} ${chip('arrows', `arrows ${d.army.fire.toFixed(1)}x speed, training ${d.army.training}/5`)} ${chip('wall', `${d.army.wall.toLowerCase()} walls`)}${d.army.keepHp ? ' ' + chip('keep', `Keep ${d.army.keepHp}`) : ''}</p>`);
    h.push(`<h2>${iconSvg(d.coins.tier, 22)} Coins</h2><p>You carry ${d.coins.count} ${d.coins.tier} coins.${d.coins.nextTier ? ` They turn ${d.coins.nextTier} at Keep level ${d.coins.nextAt}.` : ''} Every pad costs coins except crews (archers) and the Keep (materials).</p>`);
    if (d.taken && d.taken.length) {
      h.push(`<h2>${iconSvg('star', 22)} Rewards you have taken</h2>`);
      for (const u of d.taken) h.push(`<div class="irow upgrade"><div class="iicon">${iconSvg(u.icon, 30)}</div><div><b>${esc(u.name)}</b>${u.n > 1 ? ` <span class="cost">x${u.n}</span>` : ''}<div class="desc">${esc(u.desc)}</div></div></div>`);
    }
    h.push(`<h2>${iconSvg('hammer', 22)} Pads right now</h2>`);
    if (!d.padsNow.length) h.push('<p>None yet.</p>');
    for (const p of d.padsNow) h.push(`<div class="irow ${p.kind}${p.locked ? ' locked' : ''}"><div class="iicon">${iconSvg(p.icon, 30)}</div><div><b>${esc(p.label)}</b> <span class="cost">${esc(p.cost)}</span>${p.locked ? ` <span class="ichip short">needs Keep level ${p.locked}</span>` : ''}<div class="desc">${esc(p.desc)}</div></div></div>`);
    if (d.later.length) {
      h.push(`<h2>${iconSvg('expand', 22)} Coming with higher levels</h2>`);
      for (const p of d.later) h.push(`<div class="irow ${p.kind} later"><div class="iicon">${iconSvg(p.icon, 30)}</div><div><b>${esc(p.label)}</b> <span class="cost">Keep level ${p.at}</span><div class="desc">${esc(p.desc)}</div></div></div>`);
    }
    h.push(`<h2>${iconSvg('skull', 22)} Enemy ranks</h2><p class="sub">Their colour says how dangerous they are. New ranks appear when the Keep levels up.</p><p>${d.ranks.map((r) => `<span class="ichip ${r.active ? 'ok' : ''}"><i class="swatch" style="background:${r.color}"></i>${esc(r.name)} · ${r.at === 0 ? 'from the start' : `Keep level ${r.at}`}</span>`).join(' ')}</p>`);
    h.push('<p class="sub">Shapes: square pads build things, round pads recruit (blue), upgrade (purple) or feed the Keep (green).</p>');
    document.getElementById('info-body').innerHTML = h.join('');
    document.getElementById('info-screen').classList.remove('hidden');
    document.getElementById('info-screen').scrollTop = 0;
  }
  hideInfo() {
    document.getElementById('info-screen').classList.add('hidden');
  }

  showOffer(list, level, queued) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    document.getElementById('offer-level').textContent = level;
    document.getElementById('offer-more').textContent = queued > 1 ? `${queued - 1} more choice${queued > 2 ? 's' : ''} after this` : '';
    document.getElementById('offer-cards').innerHTML = list.map((u) => `
      <button class="offer-card${u.rare ? ' rare' : ''}" data-id="${esc(u.id)}">
        <div class="oicon">${iconSvg(u.icon, 40)}</div>
        <b>${esc(u.name)}</b>
        <span>${esc(u.desc)}</span>
      </button>`).join('');
    document.getElementById('offer-screen').classList.remove('hidden');
  }
  hideOffer() {
    document.getElementById('offer-screen').classList.add('hidden');
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
      el.lastChild.innerHTML = it.alarm ? iconSvg('alert', 22) : it.queen ? iconSvg('tiara', 22) : it.home ? iconSvg('home', 22) : it.boss ? iconSvg('skull', 22) : it.count > 1 ? it.count : '';
      el.classList.toggle('boss', !!it.boss);
      el.classList.toggle('home', !!it.home);
      el.classList.toggle('alarm', !!it.alarm);
      el.classList.toggle('queen', !!it.queen);
    });
  }
}
