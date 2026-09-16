import { iconSvg } from './icons.js';
import { CFG } from './config.js';
import { endName } from './scores.js';

// #68: how many hearts the King's health is cut into. Five is coarse on purpose -- the exact figure
// is the bar over his head, and a HUD readout that moved every frame would be a bar with gaps in it.
const HEARTS = 5;
// #77: how finely a heart drains. Five whole hearts made each one a 20% step, so at 140 max HP a
// 27-damage hit took a whole heart or none depending on where in the band it landed, and 81% looked
// the same as 99%. Eighths give forty steps across full health -- finer than the eye reads at 17px,
// and coarse enough that regen at 3 hp/s rewrites the row about once a second rather than sixty
// times, which is what `Hud.set`'s dirty-checking exists to avoid.
const HEART_STEPS = 8;
// #100: who is a person and who is a heading. #89 gave every notice a label and they were already two
// different kinds of thing -- `Wren` and `The King` are someone talking, `Raid` and `Keep` and
// `Village` and `Bag` are what the game is reporting -- but they all rendered identically, in one
// colour, which is what flattened the distinction.
//
// A table rather than a pair of `if`s: the Warlord is the obvious third and the camp waking is his
// moment, so when he has a rig to render he is a row here and nothing else changes.
// `rig` is what renderFace is asked for at load; a speaker with no rig still gets their colour.
// The colours have to hold over grass and over the near-white late-game walls, which is what the
// label's heavy shadow is already there for.
export const SPEAKERS = {
  Wren: { rig: 'queen', colour: '#ffb0cd' },
  'The King': { rig: 'king', colour: '#ffd27a' },
};
// The circumference of the r=17 circle both rings are drawn on, which is what the stylesheet's dash
// array is set to. Change one and change the other.
const RING_C = 106.81;
// Green when there is room, red when there is not, through yellow and orange on the way. Interpolated
// rather than stepped, so filling a bag is a colour moving rather than four colours taking turns.
const TRAFFIC_STOPS = [[0, 63, 212, 85], [0.55, 255, 210, 63], [0.8, 245, 150, 32], [1, 232, 52, 42]];
function TRAFFIC(f) {
  let a = TRAFFIC_STOPS[0];
  let b = TRAFFIC_STOPS[TRAFFIC_STOPS.length - 1];
  for (let i = 0; i < TRAFFIC_STOPS.length - 1; i++) {
    if (f >= TRAFFIC_STOPS[i][0] && f <= TRAFFIC_STOPS[i + 1][0]) { a = TRAFFIC_STOPS[i]; b = TRAFFIC_STOPS[i + 1]; break; }
  }
  const span = b[0] - a[0] || 1;
  const t = Math.max(0, Math.min(1, (f - a[0]) / span));
  const mix = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${mix(1)}, ${mix(2)}, ${mix(3)})`;
}


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
    this.nextTimeEl = document.getElementById('next-wave-t');
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
    this.levelEl = document.getElementById('keep-level');
    this.heartsEl = document.getElementById('king-hearts');
    this.ringEl = document.getElementById('load-ring');
    this.raidRingEl = document.getElementById('raid-ring');
    this.carryRail = document.getElementById('carry-rail');
    this.bagCell = document.getElementById('bag-cell');
    this.flying = [];          // #88: armfuls in the air between the world and the bag
    // #90: how tall whatever is on the notice line is, so the alarm above it knows what to clear.
    // A constant was tried first and measured wrong: 64px cleared a one-line notice, and a two-line
    // one ran twelve pixels into the alarm -- which is the exact collision #90 exists to stop, moved
    // up the screen rather than fixed. The observer is what makes measuring it cheap: it fires when a
    // notice really changes shape (longer text, the chip opening, a font swapping in, the phone
    // turning), not once a frame, so no layout is read on a frame where nothing moved.
    this.noticeStack = -1;
    // #95/#97: looked up once. nextToast runs on a timer, not a frame, but a querySelector per page
    // for the life of a run is still a querySelector nobody needs.
    this.toastText = document.getElementById('toast-text');
    this.toastMore = document.getElementById('toast-more');
    if (this.toastMore) this.toastMore.innerHTML = iconSvg('chev', 16);
    this.toastRest = '';
    this.kindEl = document.getElementById('toast-kind');
    this.kindText = document.getElementById('toast-kind-t');
    this.faceEl = document.getElementById('toast-face');
    this.faces = {};            // #100: speaker -> data URL, rendered once at load
    this.shownKind = null;
    // The panel only takes pointer events while there is another page (see `#toast.more` in the
    // stylesheet), so this cannot steal a drag meant for the King at any other time. Tapping the last
    // page deliberately does nothing: dismissing a notice early is not worth a dead patch of screen
    // where a thumb lives.
    const panel = document.getElementById('toast-panel');
    if (panel) panel.addEventListener('pointerdown', (e) => {
      if (!this.toastRest) return;
      e.preventDefault();
      this.nextToast();
    });
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.syncNoticeStack());
      ro.observe(this.toastEl);
      ro.observe(this.tip);
    }
    this.btnTimeEl = document.getElementById('next-wave-btn-t');
    this.lastLoad = '';
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastWave = -1;
    this.lastArmy = -1;
    this.lastNext = -1;
  }
  set(coins, wave, army, nextIn, goal, res, score, cap) {
    this.score = score;
    if (res) this.setLoad(res, cap);
    const n = Math.max(0, Math.ceil(nextIn));
    if (n !== this.lastNext || (nextIn === null) !== this.lastNextNull) {
      this.lastNext = n;
      this.lastNextNull = nextIn === null;
      const clock = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
      this.nextEl.classList.toggle('hidden', nextIn === null);
      this.nextEl.classList.toggle('soon', nextIn !== null && n <= 10);
      if (nextIn !== null && this.nextTimeEl) this.nextTimeEl.textContent = clock;
      if (this.btnTimeEl) this.btnTimeEl.textContent = clock;
    }
    if (goal !== this.lastGoal) {
      this.lastGoal = goal;
      const m = /^(\d+)\/(\d+)$/.exec(String(goal || ''));
      this.levelEl.textContent = goal === 'camp' ? 'March!' : `Keep ${m ? +m[1] : 0}`;
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

  // #68: the bag is a count inside a ring. The cap is not written down anywhere -- how full you are
  // is a thing to glance at, not a fraction to read, and the ring answers it without a number and
  // without asking anyone to remember what 18 was.
  setLoad(res, cap) {
    if (!this.loadNow) return;
    const total = Object.values(res).reduce((a, b) => a + b, 0);
    const key = `${total}/${cap}`;
    if (key === this.lastLoad) return;
    this.lastLoad = key;
    this.loadNow.textContent = total;
    this.setBagRing(cap > 0 ? total / cap : 0);
    this.carryRail.classList.toggle('full', cap > 0 && total >= cap);
  }
  // One continuous arc, never segmented: `frac` of the circle is drawn, and the colour runs the
  // traffic lights across it. The stops are interpolated rather than switched at thresholds, so a
  // bag filling up shifts through the colours instead of snapping between four of them.
  //
  // The circumference is 2*PI*r for the r=17 circle in the markup, which is what the stylesheet's
  // dash array is set to. Change one and change the other.
  setBagRing(frac) {
    if (!this.ringEl) return;
    const f = Math.max(0, Math.min(1, frac));
    this.ringEl.style.strokeDashoffset = RING_C * (1 - f);
    this.ringEl.style.stroke = TRAFFIC(f);
  }

  // Five hearts, and a row that never changes width: an empty heart keeps the full one's outline, so
  // losing one reads as that heart going out rather than as the row shrinking. Rounded UP, so any
  // health left at all is a heart still showing -- an empty row means dead, and nothing else.
  setHearts(frac) {
    if (!this.heartsEl) return;
    const f = Math.max(0, Math.min(1, frac));
    let q = Math.round(f * HEARTS * HEART_STEPS) / HEART_STEPS;
    // Any health at all is a visible heart. An empty row means dead and nothing else -- that was the
    // point of rounding up before, and it survives the change to partial fills.
    if (f > 0 && q <= 0) q = 1 / HEART_STEPS;
    if (q === this.lastHearts) return;
    this.lastHearts = q;
    // Built once: an empty heart with a full one clipped over it. The two share an outline, so a
    // draining row never shifts or changes weight -- only the red inside it moves.
    if (!this.heartEls) {
      this.heartsEl.innerHTML = Array.from({ length: HEARTS }, () =>
        `<span class="heart">${iconSvg('heartEmpty', 17)}<i class="fill">${iconSvg('heart', 17)}</i></span>`).join('');
      this.heartEls = [...this.heartsEl.querySelectorAll('.fill')];
    }
    this.heartEls.forEach((el, i) => {
      let v = Math.max(0, Math.min(1, q - i));
      // a sliver rather than a hairline, so the last of the health is something you can see
      if (v > 0 && v < 0.16) v = 0.16;
      const pct = `${Math.round(v * 100)}%`;
      if (el.style.width !== pct) el.style.width = pct;
    });
  }

  // #29: notices queue rather than overwrite. A playtester missed the one telling him a pad wanted
  // stone, because the next notice replaced it before he had read it. Each one now waits its turn,
  // holds long enough to read, and is kept in a short log the info screen can show back.
  // #89: `kind` is the label over the notice -- who is speaking, or what part of the game this is
  // about. Wren's lines carry her name, which is the whole point of the pattern; everything else
  // says which of the game's concerns it belongs to. Empty means no label, which is right for the
  // few notices that are the game talking about itself rather than about the world.
  toast(text, ms = 3200, kind = '') {
    if (!text || this.mute) return;
    this.toastQueue = this.toastQueue || [];
    this.toastLog = this.toastLog || [];
    if (!this.toastLog[0] || this.toastLog[0].text !== text) this.toastLog.unshift({ text, kind });
    this.toastLog.length = Math.min(this.toastLog.length, 8);
    // the same notice arriving twice in a row just extends it; it does not queue behind itself
    if (this.toastShowing === text) {
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.nextToast(), ms);
      return;
    }
    this.toastQueue.push({ text, kind, ms });
    if (!this.toastShowing) this.nextToast();
  }
  // #97: a notice is pages now, not a string. This advances within the current one before it advances
  // to the next, so a long message finishes being read before the queue moves on. The tap on the panel
  // and the timer both come through here, which is what makes "tap to skip ahead" nothing more than
  // the timer firing early.
  nextToast() {
    clearTimeout(this.toastTimer);
    if (this.toastRest) {
      this.showPage(this.toastRest, this.toastKind, this.toastMs);
      return;
    }
    const next = (this.toastQueue || []).shift();
    if (!next) {
      this.toastShowing = null;
      this.toastEl.classList.remove('show', 'more');
      this.syncNoticeStack();
      return;
    }
    // `toastShowing` stays the WHOLE message, not the page on screen: it is what the repeat check in
    // toast() compares against, and what showPadTip asks to know whether to stand down.
    this.toastShowing = next.text;
    this.toastKind = next.kind || '';
    this.toastMs = next.ms;
    this.setKind(this.toastKind);
    this.showPage(next.text, this.toastKind, next.ms);
  }
  // #100: the label, and whether it is a person. A speaker gets their own colour and their face; a
  // category keeps the pale green it has always had. The label is never typed out (#95) -- who is
  // speaking is there before they speak -- and the face belongs with the name, not with the words.
  //
  // Dirty-checked on the label itself rather than on each write: this runs once a notice, but the
  // three writes underneath are an image swap and two style changes, and swapping an `src` for the
  // same URL still costs a decode on some browsers.
  setKind(kind) {
    if (this.shownKind === kind) return;
    this.shownKind = kind;
    const el = this.kindEl;
    if (!el) return;
    el.classList.toggle('hidden', !kind);
    if (!kind) return;
    this.kindText.textContent = kind;
    const who = SPEAKERS[kind];
    el.style.color = who ? who.colour : '';
    el.classList.toggle('speaker', !!who);
    // A face is not always there: makeRigged returns null until the model has loaded and can hand back
    // a crowd instance instead, so renderFace returns null and a speaker keeps their colour without
    // one. It has to look deliberate rather than broken, which is why the img is hidden rather than
    // left showing a missing image.
    const src = who && this.faces[kind];
    this.faceEl.hidden = !src;
    if (src && this.faceEl.getAttribute('src') !== src) this.faceEl.src = src;
  }
  // #100: handed the faces rendered at load, while the portrait renderer was still up.
  setFaces(faces) {
    this.faces = faces || {};
    this.shownKind = null;      // so a label already on screen picks its face up
  }

  // One page: split off what fits, reveal it, and hold for as long as it takes to read what is now on
  // screen rather than the whole message.
  showPage(text, kind, ms) {
    const { page, rest } = this.fitPage(text);
    this.toastRest = rest;
    const revealMs = this.typeInto(this.toastText, page);
    this.toastEl.classList.toggle('more', !!rest);
    this.toastEl.classList.add('show');
    this.syncNoticeStack();
    const n = CFG.notice;
    const read = Math.max(ms, Math.min(n.readMax, n.readBase + page.length * n.readPerChar));
    // #95: the hold starts when the last letter lands, not when the notice appears -- otherwise a long
    // one spends the first fifth of its life still arriving and the rest being read in a hurry.
    this.toastTimer = setTimeout(() => this.nextToast(), revealMs + read);
  }
  // #97: how much of `text` fits in three lines, at the width the notice is actually being shown at.
  // Measured rather than counted -- the font is proportional and the box is one of two widths
  // depending on the screen, so the only honest answer is to lay it out and look. A binary search over
  // words costs about six layout reads, once per page. Nothing here runs on a frame.
  //
  // Measuring in the live element rather than an off-screen clone is deliberate: a clone has to be
  // given the same width, font, weight and padding, and the first of those to drift makes the split
  // wrong in a way nothing would catch. The reads all happen inside one task, so the browser never
  // paints the intermediate text.
  fitPage(text) {
    const el = this.toastText;
    const words = text.split(' ');
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const max = lh * CFG.notice.lines + 1;
    el.textContent = text;
    if (words.length < 2 || el.offsetHeight <= max) return { page: text, rest: '' };
    let lo = 1;
    let hi = words.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      el.textContent = words.slice(0, mid).join(' ');
      if (el.offsetHeight <= max) lo = mid;
      else hi = mid - 1;
    }
    return { page: words.slice(0, lo).join(' '), rest: words.slice(lo).join(' ') };
  }

  // #95: put the whole page in the box at full size, then stagger each letter's opacity. Appending to
  // textContent a letter at a time was the obvious way and is the wrong one: the box would re-wrap and
  // re-centre on every letter. Here the layout is final before the first letter appears, and the
  // reveal itself is a CSS animation -- the game's frame path never sees it.
  // Returns how long the reveal takes, so the hold can start when it ends.
  typeInto(el, text) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const ms = CFG.notice.letterMs;
    let i = 0;
    const html = text.split(' ').map((w, wi) => {
      const lead = wi ? ` ` : '';
      if (wi) i++;            // the space counts, or the pacing stutters at every word break
      return lead + `<span class="tw-w">${[...w].map((ch) => `<span style="animation-delay:${i++ * ms}ms">${esc(ch)}</span>`).join('')}</span>`;
    }).join('');
    el.innerHTML = html;
    return i * ms;
  }

  // #90: the tallest thing currently on the notice line, handed to CSS. Both notices stay in the
  // layout while they are down -- they have to, or they could not transition out -- so an element's
  // height is only its own to give while it is actually up.
  syncNoticeStack() {
    const t = this.toastEl.classList.contains('show') ? this.toastEl.offsetHeight : 0;
    const p = this.tip.classList.contains('hidden') ? 0 : this.tip.offsetHeight;
    const h = Math.max(t, p);
    if (h === this.noticeStack) return;
    this.noticeStack = h;
    document.documentElement.style.setProperty('--notice-stack', `${h}px`);
  }
  recentNotices() {
    return this.toastLog || [];
  }

  // #88: an armful flies from where it was picked up to the bag in the corner, so the thing you took
  // and the number that moved are visibly the same event. The game already does this everywhere else
  // -- a mined chunk is thrown from the rock to the heap, a coin arcs into the King's stack -- and
  // the hop into the HUD was the only one missing.
  //
  // The tween is a CSS transition rather than anything driven per frame. `set` runs every frame and
  // dirty-checks every value it writes; animating this from JS would put real work back into that
  // path for pure decoration. This makes an element, points it at the bag, and lets the compositor
  // do the rest.
  //
  // The ledger is credited by the caller BEFORE this runs, not when it lands. Hanging a player's
  // materials on a CSS transition completing means a backgrounded tab or a dropped `transitionend`
  // costs them the pickup, and no animation is worth that. The arrival still pays off -- the bag
  // bumps when it gets there.
  flyToBag(x, y, icon) {
    if (this.mute || !this.bagCell || document.hidden) return;
    if (this.flying.length >= 8) return;      // an armful, never a storm
    const r = this.bagCell.getBoundingClientRect();
    if (!r.width) return;                     // the HUD is not laid out yet
    const el = document.createElement('i');
    el.className = 'fly';
    el.innerHTML = iconSvg(icon, 20);
    el.style.transform = `translate(${Math.round(x - 10)}px, ${Math.round(y - 10)}px)`;
    document.body.appendChild(el);
    this.flying.push(el);
    const land = () => {
      if (!el.isConnected) return;
      el.remove();
      const i = this.flying.indexOf(el);
      if (i >= 0) this.flying.splice(i, 1);
      this.bumpBag();
    };
    el.addEventListener('transitionend', land, { once: true });
    // A transition that never starts never ends -- a hidden tab, or reduced motion taking it away
    // altogether. The timer is what guarantees the element goes either way.
    setTimeout(land, 900);
    requestAnimationFrame(() => {
      el.style.transform = `translate(${Math.round(r.left + r.width / 2 - 10)}px, ${Math.round(r.top + r.height / 2 - 10)}px) scale(0.5)`;
      el.style.opacity = '0';
    });
  }

  bumpBag() {
    if (!this.bagCell || this.bagCell.classList.contains('bump')) return;   // one bump at a time
    this.bagCell.classList.add('bump');
    this.bagCell.addEventListener('animationend', () => this.bagCell.classList.remove('bump'), { once: true });
  }

  // A run that ends mid-flight must not leave anything behind.
  clearFlights() {
    for (const el of this.flying) el.remove();
    this.flying.length = 0;
    if (this.bagCell) this.bagCell.classList.remove('bump');
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

  // `saved` is the stored run, or null. With one there, Continue is offered above Play and Play
  // says what it now means -- throwing the run away -- rather than looking like the same button.
  showStart(best, saved = null) {
    document.getElementById('best-wave').textContent = best;
    const cont = document.getElementById('continue-run-btn');
    const note = document.getElementById('continue-note');
    const start = document.getElementById('start-btn');
    if (cont && note && start) {
      cont.classList.toggle('hidden', !saved);
      note.classList.toggle('hidden', !saved);
      if (saved) {
        note.textContent = `Night ${saved.wave}, Keep ${saved.baseLevel} · ${saved.score} points`;
        start.textContent = 'New run';
      } else {
        start.textContent = 'Play';
      }
    }
    this.startScreen.classList.remove('hidden');
  }
  hideStart() {
    this.startScreen.classList.add('hidden');
  }
  showGameOver(wave, coins, score, best, reason = 'king') {
    document.getElementById('gameover-title').textContent = reason === 'taken' ? 'They Carried Wren Away' : reason === 'queen' ? 'Wren Is Lost' : 'The King Has Fallen';
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
  // #102: the mat chip waits while a notice is being read.
  //
  // A notice is timed and unrepeatable -- a night falling, Wren speaking, a thief in the coins. Miss
  // it and it is gone. The chip is neither: it is on screen because the King is standing on a mat,
  // and it comes back the moment he stands there again. So when both want the screen the notice goes
  // first and this one takes its turn, rather than the notice being lifted a hundred and seventy
  // pixels up the world to make room (which is what `over-tip` used to do).
  //
  // No re-trigger is needed on the other side. This is called every frame the King is on a mat, so
  // the first frame after the last notice clears puts the chip straight back up.
  showPadTip({ icon, name, sub, desc, chips, note, progress }) {
    if (this.toastShowing) {
      if (!this.tip.classList.contains('hidden')) this.hidePadTip();
      return;
    }
    // #90: coming up is the one change the resize observer cannot see -- `hidden` is opacity, not
    // size, so the box is the same either way. Ask for the height on that frame only; a resize takes
    // every frame after it. Reading it here rather than earlier is deliberate: the content below has
    // already been written by then, so the height is the one the player is about to see.
    const wasDown = this.tip.classList.contains('hidden');
    this.tip.classList.remove('hidden');
    // Called every frame the King is on a mat, so everything below the key check has to be cheap.
    const key = icon + name + sub + chips.map((c) => c.text + c.state).join('|') + note;
    if (this.tipKey !== key) {
      const firstPad = this.tipKey === null;
      this.tipKey = key;
      if (!this.tipEls) {
        this.tipEls = {
          icon: this.tip.querySelector('.tip-icon'),
          name: this.tip.querySelector('.tip-name'),
          desc: this.tip.querySelector('.tip-desc'),
          costs: this.tip.querySelector('.tip-costs'),
          note: this.tip.querySelector('.tip-note'),
          more: this.tip.querySelector('.tip-more'),
          bar: this.tip.querySelector('.tip-bar i'),
        };
        this.tipEls.more.innerHTML = iconSvg('chev', 16);
      }
      if (icon !== this.tipIcon) {
        this.tipIcon = icon;
        this.tipEls.icon.innerHTML = iconSvg(icon || 'star', 26);
      }
      this.tipEls.name.textContent = sub ? `${name} · ${sub}` : name;
      this.tipEls.desc.textContent = desc || '';
      this.tipEls.costs.innerHTML = chips.map((c) => `<span class="chip ${c.state}">${iconSvg(c.icon, 14)}${c.text}</span>`).join('');
      this.tipEls.note.textContent = note;
      // A different mat is a different thing: it comes up closed, so walking down a row of them does
      // not drag an opened panel along behind you.
      if (!firstPad) this.tip.classList.remove('open');
    }
    this.tipEls.bar.style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
    if (wasDown) this.syncNoticeStack();
  }
  hidePadTip() {
    this.tip.classList.add('hidden');
    this.tip.classList.remove('open');
    this.syncNoticeStack();
    this.tipKey = null;
  }
  togglePadTip() {
    this.tip.classList.toggle('open');
    this.syncNoticeStack();
  }
  showAlarm(text) {
    const el = this.alarmEl;
    const on = !!text;
    // #90: into a span, not onto the element. `el.textContent = text` replaced every child, and one
    // of those children is the alert icon mountIcons puts there -- so the glyph disappeared the first
    // time an alarm said anything other than what the markup shipped with.
    const t = this.alarmText || (this.alarmText = document.getElementById('alarm-text'));
    if (on && t && t.textContent !== text) t.textContent = text;
    if (on !== !el.classList.contains('hidden')) el.classList.toggle('hidden', !on);
  }

  // What is left of tonight's raid. `frac` is 0..1 of the HP the night arrived with, `count` is how
  // many raiders are still coming or still standing. The count is the part that answers "is it over"
  // outright; the bar is there because twelve raiders on their last legs and twelve fresh ones are
  // not the same news.
  setRaid(frac, count) {
    const el = this.raidEl || (this.raidEl = document.getElementById('raid-meter'));
    const show = count > 0;
    if (!show && !this.raidShown) return;
    // Fill and count are written BEFORE the meter is unhidden. A hidden element does not run CSS
    // transitions, so the new night's bar snaps to full while nobody is looking; setting it after
    // would show last night's leftover width sliding up to this one's, which reads as the raid
    // growing at the exact moment it has not started.
    if (show) {
      const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
      if (pct !== this.raidPct) {
        this.raidPct = pct;
        if (this.raidRingEl) this.raidRingEl.style.strokeDashoffset = RING_C * (1 - pct / 100);
      }
      if (count !== this.raidCount) {
        this.raidCount = count;
        (this.raidLeft || (this.raidLeft = document.getElementById('raid-left'))).textContent = count;
        el.classList.toggle('last', count <= 3);
      }
    }
    if (show !== this.raidShown) {
      this.raidShown = show;
      el.classList.toggle('hidden', !show);
    }
  }
  showNextWave(show) {
    this.nextBtn.classList.toggle('hidden', !show);
  }
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
    if (d.queenCaptive) h.push('<p class="info-note">Wren is still captive. Follow the pink arrow, clear her guards and reach her. Nothing can be built, and no raiders will come, until she is free.</p>');
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
  // #94: the board, best first. Rebuilt on open rather than kept in sync -- it changes once a run, and
  // the only way to see it is to open it.
  showScores(runs) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const body = document.getElementById('sc-body');
    if (!runs.length) {
      body.innerHTML = '<p class="hint">No finished runs yet. However a run ends, it lands here.</p>';
    } else {
      const when = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      body.innerHTML = runs.map((r, i) => `
        <div class="sc-row${r.end === 'won' ? ' won' : ''}">
          <b class="sc-rank">${i + 1}</b>
          <div class="sc-mid">
            <b class="sc-score">${r.score.toLocaleString()}</b>
            <span class="sc-sub">night ${r.wave} · ${esc(endName(r.end))} · ${esc(when(r.at))}</span>
          </div>
          <span class="sc-army">${r.coins}<i class="sc-u">coins</i></span>
        </div>`).join('');
    }
    document.getElementById('scores-screen').classList.remove('hidden');
  }
  hideScores() {
    document.getElementById('scores-screen').classList.add('hidden');
  }
  setScoreCount(n) {
    const el = document.getElementById('set-scores-n');
    const t = n ? String(n) : '';
    if (el && el.textContent !== t) el.textContent = t;
  }
  hideSettings() {
    document.getElementById('settings-screen').classList.add('hidden');
  }
  // #99: `gains` is what the level just gave, from the same `levelGains` the Keep plaque reads for the
  // level ahead. It goes above the cards because it is the answer to "what just happened", and the
  // cards are the question that follows it.
  showOffer(list, level, queued, gains = []) {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    document.getElementById('offer-level').textContent = level;
    const gv = document.getElementById('offer-gains');
    const gh = document.getElementById('offer-gave-h');
    if (gv) gv.innerHTML = gains.map((u) => `<div class="og-row">${iconSvg(u.icon, 22)}<div>${esc(u.text)}</div></div>`).join('');
    if (gh) gh.textContent = gains.length ? `Level ${level} gave you` : '';
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
      // Position and angle move every tick -- that is what an indicator is for -- and both are
      // compositor-only writes.
      el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      el.firstChild.style.transform = `rotate(${it.angle}rad)`;
      // What is INSIDE it almost never changes. This runs ten times a second, and an `innerHTML`
      // write throws the subtree away and re-parses the markup even when the markup is identical --
      // during a raid, with an arrow for every direction enemies are coming from, that was a hundred
      // and more SVG parses a second landing on the busiest frames of the game. Only write when the
      // thing being shown actually changed.
      const kind = it.alarm ? 'alert' : it.queen ? 'tiara' : it.home ? 'home' : it.camp ? 'swords'
        : it.boss ? 'skull' : it.thief ? 'coin' : '';
      const key = `${kind}|${kind ? '' : it.count > 1 ? it.count : ''}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.lastChild.innerHTML = kind ? iconSvg(kind, 22) : it.count > 1 ? it.count : '';
      el.classList.toggle('boss', !!it.boss);
      el.classList.toggle('home', !!it.home);
      el.classList.toggle('alarm', !!it.alarm);
      el.classList.toggle('queen', !!it.queen);
      el.classList.toggle('thief', !!it.thief);
      el.classList.toggle('camp', !!it.camp);
    });
  }
}
