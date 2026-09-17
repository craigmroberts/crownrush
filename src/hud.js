import { iconSvg } from './icons.js';
import { CFG } from './config.js';
import { endName } from './scores.js';
import { POOL_NAME } from './upgrades.js';

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

// #113: one gain row, composed in one place. The level-up summary, the Keep plaque and the info
// screen all render the rows `levelGains` returns, so the delta is assembled here or two of the three
// drift apart the first time anyone touches it.
//
// `text` is the label, `now` is what the level makes it, `was` is what it is without it. The emphasis
// falls on the number and the direction, because that is what is being scanned -- the noun is the
// least interesting part of "Army limit 15 archers, 6 swordsmen", and the report was that none of it
// could be scanned at all: "everything must be short and easy to read with key words shown as another
// colour or bold... as this is a fast paced game".
//
// The strings stay escaped, which was the constraint. They are built from config and must never
// become an HTML channel, so this composes markup AROUND escaped text and a row carries none of its
// own. A row with no `now` is an event rather than a quantity and stays a plain sentence.
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function gainBody(u) {
  if (typeof u === 'string') return esc(u);
  if (!u.now) return esc(u.text);
  return `${esc(u.text)} <b>${esc(u.now)}</b>${u.was ? ` <em>was ${esc(u.was)}</em>` : ''}`;
}
// #121: the same four fields as a TILE, for the level-up panel and nowhere else. Reported as a panel
// of flat rows that could not be scanned: "too much text... should be closer to an infographic".
//
// A sentence puts the label, the figure and the old figure on one line, so the eye has to read the
// line to find the number. A tile puts them on three, in three sizes, and the number is the biggest
// thing in its own box -- which is what lets nine of these be taken in at a glance instead of read.
//
// `gainBody` stays and keeps its two callers, the Keep plaque's `.ks-row` and the info screen's
// `<li>`. Both are narrow lists where a grid of boxes would be wrong, and that is why this is a new
// component rather than a change to the shared one. The capability panel (#105) keeps `.og-row` too:
// `capabilityGains` emits no `now` at all, so every one of its rows would be the wide kind, and it is
// already a panel of nothing but rows.
//
// The escaping rule is `gainBody`'s: the strings come from config, markup is composed AROUND escaped
// text, and a row carries none of its own.
function gainTile(u) {
  if (typeof u === 'string') return `<div class="og-tile wide"><span class="ot-text">${esc(u)}</span></div>`;
  const icon = `<span class="ot-icon">${iconSvg(u.icon, 22)}</span>`;
  // An event row is a sentence with no figure in it, so it stays a sentence and takes the full width
  // rather than being padded out to look like a number it does not have.
  if (!u.now) return `<div class="og-tile wide">${icon}<span class="ot-text">${esc(u.text)}</span></div>`;
  // `was` is only ever an increase here -- every row `levelGains` gives a `was` to goes up -- so the
  // arrow beside it can point one way and be honest. It is drawn in CSS rather than added to the icon
  // set, because it is a 8x6 triangle and the set is for things with a subject.
  return `<div class="og-tile">${icon}<span class="ot-label">${esc(u.text)}</span>`
    + `<b class="ot-now">${esc(u.now)}</b>`
    + (u.was ? `<em class="ot-was">was ${esc(u.was)}</em>` : '')
    + '</div>';
}
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
    this.levelCell = document.getElementById('level-cell');
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
      const lv = m ? +m[1] : 0;
      // #119: nothing until the Keep stands. `baseLevel` is 0 for the whole rescue prologue, and
      // `Lv. 0` sitting there for two minutes is a number that means "not yet", said badly.
      this.levelCell.classList.toggle('hidden', goal !== 'camp' && lv < 1);
      this.levelEl.textContent = goal === 'camp' ? 'March!' : `Lv. ${lv}`;
    }
    if (coins !== this.lastCoins) {
      this.coinEl.textContent = coins;
      this.lastCoins = coins;
    }
    // #119: the night is no longer printed anywhere on the field, but it is still counted -- the pause
    // panel reports it, and it is still what the raid grows on. So the argument stays and only the
    // cell went, and with no DOM write left there is nothing for a dirty check to save.
    this.lastWave = wave;
    if (army !== this.lastArmy) {
      this.armyEl.textContent = army;
      this.lastArmy = army;
    }
  }

  // #119: the raid is being fought above the level the Keep stands at (`raidLevel() > baseLevel`).
  // That is the single case where one number instead of two would lie, so it is said outright rather
  // than left to be inferred. Measured in config.js: it happens on 0 of 30 nights at the pace the
  // finale expects, 10 of 30 on a slow run and 20 of 30 on a very slow one -- so this is the display
  // speaking exactly when the player is behind, and silent when they are not.
  //
  // Its own setter rather than another argument to `set`, because it is a new behaviour and belongs
  // where it can be named; dirty-checked like everything else that runs every frame.
  setStall(behind) {
    if (behind === this.lastStall) return;
    this.lastStall = behind;
    this.levelEl.classList.toggle('stall', behind);
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
    // #123: a `full` class used to be toggled here and there has never been a rule for it -- the bag
    // being full is already said by the ring, which runs the traffic lights to red at the cap. Gone
    // rather than given a meaning: inventing a second signal for the same fact is how two of them
    // end up disagreeing.
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
    // #132: three things can be on this line now, and the capability notice is the tall one when it
    // is open -- four rows of text, where the chip is two lines at most.
    const g = !this.gainEl || this.gainEl.classList.contains('hidden') ? 0 : this.gainEl.offsetHeight;
    const h = Math.max(t, p, g);
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
  // #119: `best` is the scoreboard's top row, or null before anyone has finished a run. It used to be
  // the best NIGHT, read from its own key -- which would have left the title screen as the one place
  // still keeping score in nights. Nothing new is stored for this: the board is already sorted by
  // score, so its first row IS the best run, and it carries the level now that runs record one.
  // A row from before #119 has no level, so it shows the points alone rather than inventing one.
  // #58: the two run lengths as a pair of pills, built from CFG.lengths rather than written into
  // index.html so the nights and the minutes are stated in exactly one place. `sub` is the second
  // line: the title screen wants it (that is where the choice is explained) and the scoreboard's
  // filter, which is picking a board rather than a run, does not.
  renderLengths(el, current, sub = false) {
    if (!el) return;
    el.innerHTML = Object.entries(CFG.lengths).map(([id, L]) => `
      <button type="button" class="seg-b${id === current ? ' on' : ''}" data-len="${id}" role="radio" aria-checked="${id === current}">
        <b>${esc(L.name)}</b>${sub ? `<span>${esc(L.sub)}</span>` : ''}
      </button>`).join('');
  }

  // #56: what previous runs have earned. One renderer for all three places it appears -- the title
  // screen, the game over screen and the victory screen -- because they are the same information and
  // three copies of it would drift.
  //
  // `mode` is 'title' or 'end'. The end screens lead with what THIS run added, because the ticket's
  // first rule is that a loss visibly advances something; the title screen leads with what is in hand
  // and what is next, because that is the reason to press Play.
  //
  // Hidden outright when nothing has been earned and nothing is unlocked, so a first-time player sees
  // exactly the screen they saw before this existed.
  renderLegacy(el, p, mode) {
    if (!el) return;
    const nothingYet = !p || (p.total <= 0 && !p.unlocked.length);
    el.classList.toggle('hidden', nothingYet);
    if (nothingYet) return;
    const badge = (u, cls) => `<span class="lg-badge ${cls}">${iconSvg(u.icon, 14)}${esc(u.name)}</span>`;
    const out = [];
    if (mode === 'end' && p.just.length) {
      out.push(`<div class="lg-line"><b>Unlocked for every run from now on</b></div>`);
      out.push(`<div class="lg-row">${p.just.map((u) => badge(u, 'new')).join('')}</div>`);
      out.push(`<div class="lg-line">${p.just.map((u) => esc(u.desc)).join(' ')}</div>`);
    } else if (p.unlocked.length) {
      out.push(`<div class="lg-row">${p.unlocked.map((u) => badge(u, 'on')).join('')}</div>`);
    }
    if (p.next) {
      // The bar measures the gap between the unlock just passed and the next one, not 0 to next --
      // otherwise a player who has three of four sees a bar that is always nearly full.
      const from = p.unlocked.length ? p.unlocked[p.unlocked.length - 1].at : 0;
      const frac = Math.max(0, Math.min(1, (p.total - from) / Math.max(1, p.next.at - from)));
      out.push(`<div class="lg-bar"><i style="width:${Math.round(frac * 100)}%"></i></div>`);
      // "9,850 more to word has spread" was the first wording and it does not survive the names --
      // half of them are sentences, not nouns. Naming the unlock as a thing works for all four.
      out.push(`<div class="lg-line">${mode === 'end' ? `This run earned <b>${p.gained.toLocaleString()}</b>. ` : ''}Next: <b>${esc(p.next.name)}</b>, <b>${p.toGo.toLocaleString()}</b> to go</div>`);
    } else {
      out.push(`<div class="lg-line">Every unlock earned \u2014 <b>${p.total.toLocaleString()}</b> lifetime</div>`);
    }
    el.innerHTML = out.join('');
  }

  // `len` is the length the next run will be played at, which is also the board `best` was read from.
  showStart(best, saved = null, len = CFG.defaultLength, legacy = null) {
    this.renderLengths(document.getElementById('length-pick'), len, true);
    this.renderLegacy(document.getElementById('legacy'), legacy, 'title');
    const line = document.getElementById('best-line');
    if (line) {
      line.classList.toggle('hidden', !best);
      if (best) {
        document.getElementById('best-run').textContent = best.level
          ? `Lv. ${best.level} · ${best.score.toLocaleString()} points`
          : `${best.score.toLocaleString()} points`;
      }
    }
    const cont = document.getElementById('continue-run-btn');
    const note = document.getElementById('continue-note');
    const start = document.getElementById('start-btn');
    if (cont && note && start) {
      cont.classList.toggle('hidden', !saved);
      note.classList.toggle('hidden', !saved);
      // #112: the LABEL, not the button. `start.textContent = ...` wiped the glyph beside it -- the
      // button is an icon and a span now, and assigning textContent to the button replaces both.
      // Measured: Play came up with no leaf on it and Continue kept its crown, which is the shape of
      // that mistake.
      const label = start.querySelector('span') || start;
      if (saved) {
        // #58: which length the stored run is, because the pills below offer the other one and
        // Continue does not obey them -- it picks the run back up as it was put down.
        const was = CFG.lengths[saved.len || 'long'];
        note.textContent = `Lv. ${saved.baseLevel} · ${saved.score.toLocaleString()} points · ${was.name}`;
        label.textContent = 'New run';
      } else {
        label.textContent = 'Play';
      }
    }
    this.startScreen.classList.remove('hidden');
  }
  hideStart() {
    this.startScreen.classList.add('hidden');
  }
  showGameOver(level, coins, score, best, reason = 'king', len = CFG.defaultLength, legacy = null) {
    this.renderLengths(document.getElementById('over-length'), len, true);
    this.renderLegacy(document.getElementById('over-legacy'), legacy, 'end');
    document.getElementById('gameover-title').textContent = reason === 'taken' ? 'They Carried Wren Away' : reason === 'queen' ? 'Wren Is Lost' : 'The King Has Fallen';
    // #119: a run that ended before the Keep was built has no level to report, and `Lv. 0` is not the
    // sentence to end it on -- the rescue is where it ended, so say that.
    document.getElementById('final-level').textContent = level > 0 ? `Lv. ${level}` : 'the rescue';
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
    // #132: and for the capability notice, which is the lane's third speaker -- see `syncGainLane`.
    if (this.toastShowing || this.gain) {
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

  // #57: the dash button. The same shape as `setHorn` above and dirty-checked the same way, because
  // this also runs every frame: three writes, each behind its own comparison.
  setDash(show, frac, secs) {
    const b = this.dashBtn || (this.dashBtn = document.getElementById('dash-btn'));
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const ready = frac <= 0;
    if (ready !== this.dashReady) {
      this.dashReady = ready;
      b.classList.toggle('ready', ready);
    }
    const pct = Math.round((1 - frac) * 100);
    if (pct !== this.dashPct) {
      this.dashPct = pct;
      b.style.setProperty('--cd', `${pct}%`);
    }
    // One decimal under a second: the horn counts whole seconds because it is gone for twenty-two of
    // them, and `Math.ceil` on a four-and-a-half second cooldown would read "5, 4, 3, 2, 1" and then
    // sit on 1 for a beat. This is a number the player is watching for.
    const label = ready ? '' : secs >= 1 ? String(Math.ceil(secs)) : secs.toFixed(1);
    if (label !== this.dashLabel) {
      this.dashLabel = label;
      document.getElementById('dash-cd').textContent = label;
    }
  }

  // #57: the banner button. Same shape as the two above, plus `flying` -- whether one is actually
  // standing, which the ring cannot say because it is filling both while the banner is up and for
  // the ten seconds after it falls. Dirty-checked like the rest: this runs every frame.
  setBanner(show, frac, secs, flying) {
    const b = this.bannerBtn || (this.bannerBtn = document.getElementById('banner-btn'));
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const ready = frac <= 0;
    if (ready !== this.bannerReady) {
      this.bannerReady = ready;
      b.classList.toggle('ready', ready);
    }
    if (flying !== this.bannerFlying) {
      this.bannerFlying = flying;
      b.classList.toggle('flying', flying);
    }
    const pct = Math.round((1 - frac) * 100);
    if (pct !== this.bannerPct) {
      this.bannerPct = pct;
      b.style.setProperty('--cd', `${pct}%`);
    }
    const label = ready ? '' : String(Math.ceil(secs));
    if (label !== this.bannerLabel) {
      this.bannerLabel = label;
      document.getElementById('banner-cd').textContent = label;
    }
  }

  // #43: the build-here button, and the horn getting out of its way. Dirty-checked like the rest --
  // `updatePlacing` calls this every frame a placement is in progress.
  setPlacing(on, ok = false) {
    const b = this.placeBtn || (this.placeBtn = document.getElementById('place-btn'));
    if (on !== this.placingOn) {
      this.placingOn = on;
      b.classList.toggle('hidden', !on);
    }
    if (!on) return;
    if (ok !== this.placingOk) {
      this.placingOk = ok;
      b.classList.toggle('ok', ok);
      b.classList.toggle('no', !ok);
    }
  }

  // #43: the move button. One class toggle behind a comparison, like everything else called per frame.
  setMove(on) {
    if (on === this.moveOn) return;
    this.moveOn = on;
    const b = this.moveBtn || (this.moveBtn = document.getElementById('move-btn'));
    b.classList.toggle('hidden', !on);
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
    const N = d.level + 1;
    document.getElementById('ks-title').textContent = d.level >= d.max ? `Level ${d.level} — max` : `Level ${d.level}`;
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
      h.push('<p class="ks-h">Paid in full. You level up on the next coin.</p>');
    }
    if (d.unlocks.length) {
      h.push(`<p class="ks-h">Level ${N} gives you</p><div class="ks-list">${d.unlocks.map((u) => {
        const t = typeof u === 'string' ? { icon: 'keep', text: u } : u;
        return `<div class="ks-row">${iconSvg(t.icon, 24)}<div>${gainBody(t)}</div></div>`;
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
    const chip = (icon, text, state = '') => `<span class="ichip ${state}">${iconSvg(icon, 16)}${esc(text)}</span>`;
    const h = [];
    if (d.queenCaptive) h.push('<p class="info-note">Wren is still captive. Follow the pink arrow, clear her guards and reach her. Nothing can be built, and no raiders will come, until she is free.</p>');
    h.push(d.finaleOpen ? '<p class="info-note">The march is open: the raiders\' camp lies to the north. Kill the Warlord to end the war.</p>' : `<p class="sub">Goal: reach level ${d.finaleLevel}, then march on the raider camp.</p>`);
    h.push(`<h2>${iconSvg('keep', 22)} Level ${d.level}${d.level >= d.max ? ' (max)' : ''}</h2>`);
    if (!d.hasKeep) h.push('<p>Not built yet. Stand on the Royal Keep pad in the village.</p>');
    else if (d.need.length) {
      h.push(`<p class="sub">To reach level ${d.level + 1}, pay into the Keep:</p><p>${d.need.map((n) => chip(n.type, `${n.need} ${n.type} (you carry ${n.have})`, n.have >= n.need ? 'ok' : n.have > 0 ? '' : 'short')).join(' ')}</p>`);
    }
    if (d.unlocks.length) h.push(`<p class="sub">Level ${d.level + 1} gives you:</p><ul>${d.unlocks.map((u) => `<li>${gainBody(u)}</li>`).join('')}</ul>`);
    h.push(`<h2>${iconSvg('archer', 22)} Your army</h2><p>${chip('archer', `${d.army.archers} / ${d.army.archerCap} archers`)} ${chip('swordsman', `${d.army.swords} / ${d.army.swordCap} swordsmen`)} ${chip('tower', d.army.towers.length ? `${d.army.towers.length} towers (levels ${d.army.towers.join(', ')})` : 'no towers yet')} ${chip('arrows', `arrows ${d.army.fire.toFixed(1)}x speed, training ${d.army.training}/5`)} ${chip('wall', `${d.army.wall.toLowerCase()} walls`)}${d.army.keepHp ? ' ' + chip('keep', `Keep ${d.army.keepHp}`) : ''}</p>`);
    h.push(`<h2>${iconSvg('gold', 22)} Coins</h2><p>You carry ${d.coins.count} coins, each worth ${d.coins.value} score.${d.coins.nextValue ? ` At level ${d.coins.nextAt} each one is worth ${d.coins.nextValue}.` : ''} Every pad costs coins except crews, which are paid in archers. What you mine is not spent anywhere: sell it at the trade post.</p>`);
    if (d.taken && d.taken.length) {
      h.push(`<h2>${iconSvg('star', 22)} Rewards you have taken</h2>`);
      for (const u of d.taken) h.push(`<div class="irow upgrade"><div class="iicon">${iconSvg(u.icon, 30)}</div><div><b>${esc(u.name)}</b>${u.n > 1 ? ` <span class="cost">x${u.n}</span>` : ''}<div class="desc">${esc(u.desc)}</div></div></div>`);
    }
    h.push(`<h2>${iconSvg('hammer', 22)} Pads right now</h2>`);
    if (!d.padsNow.length) h.push('<p>None yet.</p>');
    for (const p of d.padsNow) h.push(`<div class="irow ${p.kind}${p.locked ? ' locked' : ''}"><div class="iicon">${iconSvg(p.icon, 30)}</div><div><b>${esc(p.label)}</b> <span class="cost">${esc(p.cost)}</span>${p.locked ? ` <span class="ichip short">needs level ${p.locked}</span>` : ''}<div class="desc">${esc(p.desc)}</div></div></div>`);
    if (d.later.length) {
      h.push(`<h2>${iconSvg('expand', 22)} Coming with higher levels</h2>`);
      for (const p of d.later) h.push(`<div class="irow ${p.kind} later"><div class="iicon">${iconSvg(p.icon, 30)}</div><div><b>${esc(p.label)}</b> <span class="cost">Level ${p.at}</span><div class="desc">${esc(p.desc)}</div></div></div>`);
    }
    h.push(`<h2>${iconSvg('skull', 22)} Enemy ranks</h2><p class="sub">Their colour says how dangerous they are. New ranks appear as you level up.</p><p>${d.ranks.map((r) => `<span class="ichip ${r.active ? 'ok' : ''}"><i class="swatch" style="background:${r.color}"></i>${esc(r.name)} · ${r.at === 0 ? 'from the start' : `level ${r.at}`}</span>`).join(' ')}</p>`);
    h.push('<p class="sub">Shapes: square pads build things, round pads recruit (blue), upgrade (purple) or raise the Keep (green).</p>');
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
  // #118: is the title screen down? Before the first Play there is no run to recover, and the
  // stuck-game guard cannot tell that from a run that stopped unless it can see this screen.
  startHidden() {
    return this.startScreen.classList.contains('hidden');
  }
  showSettings() {
    document.getElementById('settings-screen').classList.remove('hidden');
  }
  // #94: the board, best first. Rebuilt on open rather than kept in sync -- it changes once a run, and
  // the only way to see it is to open it.
  showScores(runs, len = CFG.defaultLength) {
    this.renderLengths(document.getElementById('sc-pick'), len);
    const body = document.getElementById('sc-body');
    if (!runs.length) {
      // #58: named, because the board is now one of two and "no finished runs yet" beside a pill
      // that says Short run reads as though the whole board were empty.
      body.innerHTML = `<p class="hint">No finished ${esc(CFG.lengths[len].name.toLowerCase())}s yet. However a run ends, it lands here.</p>`;
    } else {
      const when = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      body.innerHTML = runs.map((r, i) => `
        <div class="sc-row${r.end === 'won' ? ' won' : ''}">
          <b class="sc-rank">${i + 1}</b>
          <div class="sc-mid">
            <b class="sc-score">${r.score.toLocaleString()}</b>
            <span class="sc-sub">${r.level ? `Lv. ${r.level}` : `night ${r.wave}`} · ${esc(endName(r.end))} · ${esc(when(r.at))}</span>
          </div>
          <span class="sc-army">${r.coins}<i class="sc-u">coins</i></span>
        </div>`).join('');
    }
    document.getElementById('scores-screen').classList.remove('hidden');
  }
  hideScores() {
    document.getElementById('scores-screen').classList.add('hidden');
  }
  hideKeep() {
    document.getElementById('keep-screen').classList.add('hidden');
  }

  // #110: everything that would paint over the end of a run. Every overlay shares `z-index: 10`
  // (style.css), so DOM order decides what covers what -- and `gameover-screen` is declared before the
  // offer, the capability panel and all four sheets, so any of them left up puts the verdict behind
  // it. A player looking at a panel over a stopped game with no Play Again in reach reports it as a
  // run that would not restart. Anything added to index.html after `gameover-screen` belongs here.
  hidePanels() {
    this.hideOffer();
    this.hideGain();
    this.hideKeep();
    this.hideInfo();
    this.hideSettings();
    this.hideScores();
    this.hidePause();
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
    document.getElementById('offer-level').textContent = level;
    const gv = document.getElementById('offer-gains');
    const gh = document.getElementById('offer-gave-h');
    if (gv) {
      gv.innerHTML = gains.map(gainTile).join('');
      // A second level-up would otherwise open on the first one's scroll position, part way down a
      // list it has never shown.
      gv.scrollTop = 0;
      // #121: say when there is more below. The summary is capped so the cards can never be pushed
      // off the bottom, which means at a full level it is a window onto a longer list -- and a phone
      // draws no scrollbar to say so. One forced layout per level-up, on a screen that opens once a
      // level and pauses the game while it is up; this is not a `Hud.set` frame path.
      gv.classList.toggle('more', gv.scrollHeight - gv.clientHeight > 2);
    }
    // #113: "Level 4 gave you" under an h1 that already says Level 4 is the same words twice, on the
    // screen the report asked to make shorter. Two words, and the rows say the rest.
    if (gh) gh.textContent = gains.length ? 'You gained' : '';
    document.getElementById('offer-more').textContent = queued > 1 ? `${queued - 1} more choice${queued > 2 ? 's' : ''} after this` : '';
    // #115: the pool above the name, and the text in a box of its own. The label is the only part of a
    // card that can be read without reading, and `pickOffer` takes one per pool so the three on screen
    // are always three different ones -- which is the decision the panel is actually asking about.
    //
    // `.otext` exists for the phone. Under 560px the card turns into a row, and the name and the
    // description were siblings in it: the name got a narrow column of its own and wrapped mid-name
    // ("Wider / Decks"), which is its own reason a title cannot be read quickly. Wrapped, the row is
    // icon and then a stack, which is the same shape the desktop card already had.
    //
    // #121: the pool is also the card's COLOUR now, which is why the class goes on. `pickOffer` takes
    // one per pool, so the three cards on screen are always three different colours -- the block of
    // colour is the label read without reading, and the label under it says which one it is. The five
    // are listed in the stylesheet with their contrast measured; `p-` is prefixed so a pool named
    // after an existing class can never collide with one.
    //
    // `rare` was a purple border and a purple fill, which is a colour, and colour now means pool. So
    // it says so in words on a badge instead -- the one channel that survives whatever the card
    // underneath is coloured.
    document.getElementById('offer-cards').innerHTML = list.map((u) => `
      <button class="offer-card p-${esc(u.pool)}${u.rare ? ' rare' : ''}" data-id="${esc(u.id)}">
        ${u.rare ? '<em class="orare">Rare</em>' : ''}
        <div class="oicon">${iconSvg(u.icon, 34)}</div>
        <div class="otext">
          <em class="opool">${esc(POOL_NAME[u.pool] || '')}</em>
          <b>${esc(u.name)}</b>
          <span>${esc(u.desc)}</span>
        </div>
      </button>`).join('');
    document.getElementById('offer-screen').classList.remove('hidden');
  }
  hideOffer() {
    document.getElementById('offer-screen').classList.add('hidden');
  }

  // #105: what a capability purchase leaves the player able to do. The rows are the level-up summary's
  // (`.og-row`) because it is the same kind of news. Like `showOffer` this runs on an event and not on
  // a frame, so the innerHTML here is not the per-frame rule `Hud.set` lives under.
  // #132: what a capability purchase raises. It used to be a panel that stopped the game; it is a
  // notice with a countdown now, in the mat chip's slot and wearing the mat chip's clothes.
  //
  // The closed line is `title · sub` -- "Training 3 of 5 · Your archers" -- which is the whole of
  // what most purchases need to say. The rows the panel used to show are behind the chevron,
  // unchanged, because they were the good part of it: numbers the player now HAS rather than deltas.
  showGain(gain) {
    if (!this.gainEls) {
      const el = document.getElementById('gain-note');
      this.gainEl = el;
      this.gainEls = {
        icon: el.querySelector('.tip-icon'),
        name: el.querySelector('.tip-name'),
        rows: el.querySelector('.gain-rows'),
        more: el.querySelector('.tip-more'),
        bar: el.querySelector('.tip-bar i'),
      };
      this.gainEls.more.innerHTML = iconSvg('chev', 16);
    }
    this.gain = gain;
    this.gainT = CFG.gainNotice.ms;
    this.gainFor = CFG.gainNotice.ms;
    this.gainEls.icon.innerHTML = iconSvg(gain.rows[0] ? gain.rows[0].icon : 'star', 26);
    this.gainEls.name.textContent = gain.sub ? `${gain.title} \u00B7 ${gain.sub}` : gain.title;
    this.gainEls.rows.innerHTML = gain.rows
      .map((r) => `<div class="og-row">${iconSvg(r.icon, 26)}<div>${esc(r.text)}</div></div>`).join('');
    // A new one always arrives closed, even replacing an open one: it is a different purchase and
    // the rows under it are different numbers.
    this.gainEl.classList.remove('open');
    this.gainEls.bar.style.width = '100%';
    this.syncGainLane();
  }
  hideGain() {
    this.gain = null;
    if (this.gainEl) {
      this.gainEl.classList.add('hidden');
      this.gainEl.classList.remove('open');
    }
    this.syncNoticeStack();
  }
  // Opened, it gets a longer clock rather than none at all. The ticket's own warning is the case
  // where the player taps to expand and then never taps again -- so there is no state here that
  // does not end by itself. A second tap closes it outright, which is the dismissal.
  toggleGain() {
    if (!this.gain || !this.gainEl) return;
    if (this.gainEl.classList.contains('open')) return true;   // caller dismisses
    this.gainEl.classList.add('open');
    this.gainT = CFG.gainNotice.openMs;
    this.gainFor = CFG.gainNotice.openMs;
    this.gainEls.bar.style.width = '100%';
    this.syncNoticeStack();
    return false;
  }
  // The lane, in one place. #102 gave it two speakers and a rule -- a notice goes first and the mat
  // chip takes its turn -- and this is the third. Same rule extended by the same reasoning: a toast
  // is timed and unrepeatable, so it goes first; this is timed too but it can wait, because its
  // clock STOPS while it waits rather than running out behind a notice nobody asked it to hide
  // behind; the chip is neither timed nor unrepeatable and goes last.
  syncGainLane() {
    if (!this.gain || !this.gainEl) return;
    const down = !!this.toastShowing;
    const was = this.gainEl.classList.contains('hidden');
    this.gainEl.classList.toggle('hidden', down);
    if (was !== down) this.syncNoticeStack();
  }
  // Driven by the game's own dt, so a paused game does not tick a notice away behind its pause
  // screen, and a notice waiting for a toast keeps its full time.
  tickGain(dt) {
    // `true` means "the game should clear its own `gain` too". Returning it when there is nothing
    // here makes the two states self-healing: `hidePanels` and a restart both hide this notice from
    // underneath the game, and neither should have to remember to tell it.
    if (!this.gain) return true;
    this.syncGainLane();
    if (this.toastShowing) return false;
    this.gainT -= dt;
    this.gainEls.bar.style.width = `${Math.max(0, Math.round((this.gainT / this.gainFor) * 100))}%`;
    return this.gainT <= 0;
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
  showVictory(coins, army, score, len = CFG.defaultLength, legacy = null) {
    this.renderLengths(document.getElementById('victory-length'), len, true);
    this.renderLegacy(document.getElementById('victory-legacy'), legacy, 'end');
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
