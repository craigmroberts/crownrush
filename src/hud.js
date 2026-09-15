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
    this.winScreen = document.getElementById('victory-screen');
    this.indicatorLayer = document.getElementById('indicators');
    this.indicators = [];
    this.tip = document.getElementById('pad-tip');
    this.nextBtn = document.getElementById('next-wave-btn');
    this.alarmEl = document.getElementById('alarm');
    this.minimap = document.getElementById('minimap');
    this.matKey = '';
    this.loadTrack = document.getElementById('load-track');
    this.loadNow = document.getElementById('load-now');
    this.loadCapEl = document.getElementById('load-cap');
    this.levelEl = document.getElementById('keep-level');
    this.pipsEl = document.getElementById('keep-pips');
    this.carryRail = document.getElementById('carry-rail');
    this.btnTimeEl = document.getElementById('next-wave-btn-t');
    this.lastPips = -1;
    this.lastLoad = '';
    this.kingHpEl = document.getElementById('king-hp-fill');
    this.queenHpEl = document.getElementById('queen-hp-fill');
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastWave = -1;
    this.lastArmy = -1;
    this.lastNext = -1;
  }
  set(coins, wave, army, nextIn, goal, res, score, kingFrac, queenFrac, level, cap) {
    this.score = score;
    if (queenFrac !== undefined) this.queenHpEl.style.width = `${Math.max(0, Math.min(1, queenFrac)) * 100}%`;
    if (res) this.setLoad(res, cap);
    if (kingFrac !== undefined) this.kingHpEl.style.width = `${Math.max(0, Math.min(1, kingFrac)) * 100}%`;
    const n = Math.max(0, Math.ceil(nextIn));
    if (n !== this.lastNext || (nextIn === null) !== this.lastNextNull) {
      this.lastNext = n;
      this.lastNextNull = nextIn === null;
      const clock = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
      this.nextEl.classList.toggle('hidden', nextIn === null);
      this.nextEl.classList.toggle('soon', nextIn !== null && n <= 10);
      if (nextIn !== null) this.nextEl.textContent = `Night ${(wave || 0) + 1} in ${clock}`;
      if (this.btnTimeEl) this.btnTimeEl.textContent = clock;
    }
    if (goal !== this.lastGoal) {
      this.lastGoal = goal;
      // the goal is the pips now, not a sentence: one per Keep level, lit up to where you are
      const m = /^(\d+)\/(\d+)$/.exec(String(goal || ''));
      const at = m ? +m[1] : 0;
      const max = m ? +m[2] : 0;
      this.levelEl.textContent = goal === 'camp' ? 'March!' : `Keep ${at}`;
      if (max && max !== this.lastPips) {
        this.pipsEl.innerHTML = Array.from({ length: max }, () => '<i></i>').join('');
        this.lastPips = max;
      }
      [...this.pipsEl.children].forEach((el, i) => {
        el.className = i < at - 1 ? 'on' : i === at - 1 ? 'now' : '';
      });
    }
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

  // The bag: one number against its cap, beside the coin it is on its way to becoming.
  setLoad(res, cap) {
    if (!this.loadNow) return;
    const total = Object.values(res).reduce((a, b) => a + b, 0);
    const key = `${total}/${cap}`;
    if (key === this.lastLoad) return;
    this.lastLoad = key;
    this.loadNow.textContent = total;
    this.loadCapEl.textContent = `/${cap}`;
    this.carryRail.classList.toggle('full', cap > 0 && total >= cap);
  }
  // #29: notices queue rather than overwrite. A playtester missed the one telling him a pad wanted
  // stone, because the next notice replaced it before he had read it. Each one now waits its turn,
  // holds long enough to read, and is kept in a short log the info screen can show back.
  toast(text, ms = 3200) {
    if (!text) return;
    this.toastQueue = this.toastQueue || [];
    this.toastLog = this.toastLog || [];
    if (this.toastLog[0] !== text) this.toastLog.unshift(text);
    this.toastLog.length = Math.min(this.toastLog.length, 8);
    // the same notice arriving twice in a row just extends it; it does not queue behind itself
    if (this.toastShowing === text) {
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.nextToast(), ms);
      return;
    }
    this.toastQueue.push({ text, ms: Math.max(ms, Math.min(7000, 1400 + text.length * 55)) });
    if (!this.toastShowing) this.nextToast();
  }
  nextToast() {
    const next = (this.toastQueue || []).shift();
    clearTimeout(this.toastTimer);
    if (!next) {
      this.toastShowing = null;
      this.toastEl.classList.remove('show');
      return;
    }
    this.toastShowing = next.text;
    (document.getElementById('toast-text') || this.toastEl).textContent = next.text;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.nextToast(), next.ms);
  }
  recentNotices() {
    return this.toastLog || [];
  }
  // #6: a stepped intro. `steps` = [{icon, title, text}], `onDone` runs after the last step or Skip.
  showIntro(steps, onDone) {
    this.introSteps = steps;
    this.introDone = onDone;
    this.introAt = 0;
    document.getElementById('intro-screen').classList.remove('hidden');
    this.renderIntro();
  }
  renderIntro() {
    const i = this.introAt;
    const s = this.introSteps[i];
    document.getElementById('intro-icon').innerHTML = iconSvg(s.icon, 56);
    document.getElementById('intro-title').textContent = s.title;
    document.getElementById('intro-text').textContent = s.text;
    document.getElementById('intro-dots').innerHTML = this.introSteps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    document.getElementById('intro-next').textContent = i === this.introSteps.length - 1 ? 'Play' : 'Next';
    document.getElementById('intro-skip').style.visibility = i === 0 ? 'visible' : 'hidden';
  }
  introNext() {
    if (!this.introSteps) return;
    if (this.introAt < this.introSteps.length - 1) {
      this.introAt++;
      this.renderIntro();
    } else this.finishIntro();
  }
  finishIntro() {
    if (!this.introSteps) return;
    document.getElementById('intro-screen').classList.add('hidden');
    const done = this.introDone;
    this.introSteps = null;
    if (done) done();
  }
  introOpen() {
    return !!this.introSteps;
  }

  showStart(best) {
    document.getElementById('best-wave').textContent = best;
    this.startScreen.classList.remove('hidden');
  }
  hideStart() {
    this.startScreen.classList.add('hidden');
  }
  showGameOver(wave, coins, score, best, reason = 'king') {
    document.getElementById('gameover-title').textContent = reason === 'taken' ? 'The Queen Was Carried Away' : reason === 'queen' ? 'The Queen Was Lost' : 'The King Has Fallen';
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
  showPadTip({ name, sub, desc, chips, note, progress }) {
    this.tip.classList.remove('hidden');
    const key = name + sub + chips.map((c) => c.text + c.state).join('|') + note;
    if (this.tipKey !== key) {
      this.tipKey = key;
      this.tip.querySelector('.tip-name').textContent = sub ? `${name} · ${sub}` : name;
      this.tip.querySelector('.tip-desc').textContent = desc || '';
      this.tip.querySelector('.tip-costs').innerHTML = chips.map((c) => `<span class="chip ${c.state}">${iconSvg(c.icon, 18)}${c.text}</span>`).join('');
      this.tip.querySelector('.tip-note').textContent = note;
    }
    this.tip.querySelector('.tip-bar i').style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
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
  // Nothing to do since the five counters became one load bar: which materials are worth gathering
  // is said by the world -- the nodes appear when the Keep opens them -- not by the status bar.
  setMaterials() {}

  // #18: the warhorn button. `frac` is cooldown remaining 0..1; hidden until the game is running.
  setHorn(show, frac, secs) {
    const b = this.hornBtn || (this.hornBtn = document.getElementById('horn-btn'));
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const ready = frac <= 0;
    if (ready !== this.hornReady) {
      this.hornReady = ready;
      b.classList.toggle('ready', ready);
    }
    const pct = Math.round((1 - frac) * 100);
    if (pct !== this.hornPct) {
      this.hornPct = pct;
      b.style.setProperty('--cd', `${pct}%`);
    }
    const label = ready ? '' : String(Math.ceil(secs));
    if (label !== this.hornLabel) {
      this.hornLabel = label;
      document.getElementById('horn-cd').textContent = label;
    }
  }

  setCoinTier(tier) {
    if (tier === this.coinTier) return;
    this.coinTier = tier;
    this.coinIcon.innerHTML = iconSvg(tier, 40);
  }

  // The Keep sheet: where you are, what the next level costs against what you carry, what it gives,
  // and two levels past that. Every number here was already computed for the info screen; it was
  // just buried two thirds of the way down one long page, which is why nobody found it.
  showKeep(d) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const N = d.level + 1;
    document.getElementById('ks-title').textContent = d.level >= d.max ? `Keep level ${d.level} — max` : `Keep level ${d.level}`;
    document.getElementById('ks-goal').textContent = d.finaleOpen
      ? 'The march is open: kill the Warlord to end the war.'
      : `Level ${d.finaleLevel} opens the march on the raider camp.`;
    document.getElementById('ks-fill').style.width = `${Math.min(100, (d.level / d.finaleLevel) * 100)}%`;
    document.getElementById('ks-of').textContent = `${d.level} OF ${d.finaleLevel}`;
    const h = [];
    if (!d.hasKeep) {
      h.push('<p class="ks-h">Not built yet. Stand on the Royal Keep pad in the village.</p>');
    } else if (d.need.length) {
      h.push(`<p class="ks-h">To reach level ${N}, pay into the Keep</p><div class="ks-needs">${d.need.map((n) => {
        const state = n.have >= n.need ? 'done' : n.have > 0 ? '' : 'short';
        return `<span class="ks-need ${state}">${iconSvg(n.type, 16)}${Math.min(n.have, n.need)} / ${n.need}</span>`;
      }).join('')}</div>`);
    } else if (d.level < d.max) {
      h.push('<p class="ks-h">Everything is fed. The Keep levels on your next delivery.</p>');
    }
    if (d.unlocks.length) {
      h.push(`<p class="ks-h">Level ${N} gives you</p><div class="ks-list">${d.unlocks.map((u) => {
        const t = typeof u === 'string' ? { icon: 'keep', text: u } : u;
        return `<div class="ks-row">${iconSvg(t.icon, 24)}<div>${esc(t.text)}</div></div>`;
      }).join('')}</div>`);
    }
    if (d.later && d.later.length) {
      h.push(`<hr><p class="ks-h">Later</p><div class="ks-list later">${d.later.slice(0, 4).map((u) =>
        `<div class="ks-row">${iconSvg(u.icon, 24)}<div>${esc(u.label)} <span class="at">level ${u.at}</span></div></div>`).join('')}</div>`);
    }
    document.getElementById('ks-body').innerHTML = h.join('');
    document.getElementById('keep-screen').classList.remove('hidden');
  }

  showInfo(d) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const chip = (icon, text, state = '') => `<span class="ichip ${state}">${iconSvg(icon, 16)}${esc(text)}</span>`;
    const h = [];
    if (d.queenCaptive) h.push('<p class="info-note">The Queen is still captive. Follow the pink arrow, clear her guards and reach her. Nothing can be built, and no raiders will come, until she is free.</p>');
    h.push(d.finaleOpen ? '<p class="info-note">The march is open: the raiders\' camp lies to the north. Kill the Warlord to end the war.</p>' : `<p class="sub">Goal: reach Keep level ${d.finaleLevel}, then march on the raider camp.</p>`);
    h.push(`<h2>${iconSvg('keep', 22)} Keep level ${d.level}${d.level >= d.max ? ' (max)' : ''}</h2>`);
    if (!d.hasKeep) h.push('<p>Not built yet. Stand on the Royal Keep pad in the village.</p>');
    else if (d.need.length) {
      h.push(`<p class="sub">To reach level ${d.level + 1}, feed the Keep:</p><p>${d.need.map((n) => chip(n.type, `${n.need} ${n.type} (you carry ${n.have})`, n.have >= n.need ? 'ok' : n.have > 0 ? '' : 'short')).join(' ')}</p>`);
    }
    if (d.unlocks.length) h.push(`<p class="sub">Level ${d.level + 1} gives you:</p><ul>${d.unlocks.map((u) => `<li>${esc(typeof u === 'string' ? u : u.text)}</li>`).join('')}</ul>`);
    h.push(`<h2>${iconSvg('archer', 22)} Your army</h2><p>${chip('archer', `${d.army.archers} / ${d.army.archerCap} archers`)} ${chip('swordsman', `${d.army.swords} / ${d.army.swordCap} swordsmen`)} ${chip('tower', d.army.towers.length ? `${d.army.towers.length} towers (levels ${d.army.towers.join(', ')})` : 'no towers yet')} ${chip('arrows', `arrows ${d.army.fire.toFixed(1)}x speed, training ${d.army.training}/5`)} ${chip('wall', `${d.army.wall.toLowerCase()} walls`)}${d.army.keepHp ? ' ' + chip('keep', `Keep ${d.army.keepHp}`) : ''}</p>`);
    h.push(`<h2>${iconSvg('gold', 22)} Coins</h2><p>You carry ${d.coins.count} coins, each worth ${d.coins.value} score.${d.coins.nextValue ? ` At Keep level ${d.coins.nextAt} each one is worth ${d.coins.nextValue}.` : ''} Every pad costs coins except crews (archers) and the Keep (materials).</p>`);
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
    // #29: what the game told you recently, for when a notice went by before you could read it
    const notices = this.recentNotices();
    if (notices.length) {
      h.push(`<h2>${iconSvg('info', 22)} Recently announced</h2>`);
      for (const n of notices) h.push(`<div class="irow"><div>${esc(n)}</div></div>`);
    }
    document.getElementById('info-body').innerHTML = h.join('');
    document.getElementById('info-screen').classList.remove('hidden');
    document.getElementById('info-screen').scrollTop = 0;
  }
  hideInfo() {
    document.getElementById('info-screen').classList.add('hidden');
  }

  // is the pause screen down? the stuck-game guard uses this to tell a real pause from a lost one
  pauseHidden() {
    return document.getElementById('pause-screen').classList.contains('hidden');
  }
  showSettings() {
    document.getElementById('settings-screen').classList.remove('hidden');
  }
  hideSettings() {
    document.getElementById('settings-screen').classList.add('hidden');
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
    // score is not in the status bar any more: it grows without limit, it is read once at the end of
    // a run, and it was pushing live resource counts off the edge to earn its place there
    const sc = document.getElementById('pause-score');
    if (sc) sc.textContent = (this.score || 0).toLocaleString();
    const pw = document.getElementById('pause-wave');
    if (pw) pw.textContent = this.lastWave > 0 ? this.lastWave : 1;
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
      el.lastChild.innerHTML = it.alarm ? iconSvg('alert', 22) : it.queen ? iconSvg('tiara', 22) : it.home ? iconSvg('home', 22) : it.camp ? iconSvg('swords', 22) : it.boss ? iconSvg('skull', 22) : it.thief ? iconSvg('coin', 22) : it.count > 1 ? it.count : '';
      el.classList.toggle('boss', !!it.boss);
      el.classList.toggle('home', !!it.home);
      el.classList.toggle('alarm', !!it.alarm);
      el.classList.toggle('queen', !!it.queen);
      el.classList.toggle('thief', !!it.thief);
      el.classList.toggle('camp', !!it.camp);
    });
  }
}
