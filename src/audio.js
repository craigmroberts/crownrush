// All sound is synthesised with the Web Audio API, so there are no audio files to load.
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const semi = NOTE[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

// --- the background loop: 8 bars, 96 bpm, C major. Tokens are eighth notes; '.' holds, '-' rests.
const BPM = 96;
const BEAT = 60 / BPM;
const LEAD = [
  'E5 G5 A5 G5 E5 D5 C5 -',
  'D5 E5 G5 . B4 D5 . -',
  'A4 C5 E5 D5 C5 A4 . -',
  'F4 A4 C5 A4 G4 A4 . -',
  'E5 G5 A5 G5 E5 D5 C5 .',
  'D5 E5 G5 A5 B5 . . .',
  'A5 G5 E5 D5 C5 D5 E5 .',
  'D5 . . . - G4 A4 B4',
];
const CHORDS = [
  ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'],
  ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'],
];
const BASS = [['C2', 'G2'], ['G2', 'D3'], ['A2', 'E3'], ['F2', 'C3'], ['C2', 'G2'], ['G2', 'D3'], ['F2', 'C3'], ['G2', 'D3']];

// #32: the same eight bars after dark. Same rhythm token for token, so the two loops line up bar for
// bar and can be cross-faded instead of swapped; what changes is that it is in A minor, sits an
// octave lower, and ends bars on E major rather than G, which is what makes it sound wrong-footed.
const NIGHT_LEAD = [
  'A4 C5 E5 C5 A4 G4 F4 -',
  'E4 G4 B4 . G4 E4 . -',
  'F4 A4 C5 B4 A4 F4 . -',
  'D4 F4 A4 F4 E4 F4 . -',
  'A4 C5 E5 C5 A4 G4 F4 .',
  'E4 G4 B4 C5 D5 . . .',
  'C5 B4 A4 G4 F4 G4 A4 .',
  'E4 . . . - A3 B3 C4',
];
const NIGHT_CHORDS = [
  ['A3', 'C4', 'E4'], ['E3', 'G3', 'B3'], ['F3', 'A3', 'C4'], ['D3', 'F3', 'A3'],
  ['A3', 'C4', 'E4'], ['E3', 'G3', 'B3'], ['F3', 'A3', 'C4'], ['E3', 'G#3', 'B3'],
];
const NIGHT_BASS = [['A2', 'E3'], ['E2', 'B2'], ['F2', 'C3'], ['D2', 'A2'], ['A2', 'E3'], ['E2', 'B2'], ['F2', 'C3'], ['E2', 'B2']];

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('crownrush-muted') === '1';
    this.lastHit = 0;
    this.lastChing = 0;
    this.lastHurt = 0;
    this.events = [];
    this.nightOn = false;
    this.active = true;   // does the game want sound right now (see setActive)
    this.loopLen = LEAD.length * 4 * BEAT;
  }

  // Must be called from a user gesture (the Play button) so mobile browsers allow sound.
  //
  // One call is not enough. A browser can hand back a context that is still `suspended` even when it
  // was created inside a gesture, and resume() is a promise that can settle late or not at all. The
  // only thing that ever revived it afterwards was the visibilitychange handler below, which is why
  // sound would arrive only after leaving the app and coming back. So every call re-arms a set of
  // gesture listeners that keep asking until the context is actually running, and then take
  // themselves off.
  init() {
    if (this.ctx) {
      this.armResume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);
    // #32: day and night play on the same clock into their own buses, and nightfall is a cross-fade
    // between the two rather than a swap, so no bar is ever cut short or restarted.
    this.dayBus = this.ctx.createGain();
    this.dayBus.gain.value = this.nightOn ? 0 : 1;
    this.dayBus.connect(this.music);
    this.nightBus = this.ctx.createGain();
    this.nightBus.gain.value = this.nightOn ? 1 : 0;
    this.nightBus.connect(this.music);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.buildLoop();
    this.startMusic();
    // Hiding the page has to suspend from here, because requestAnimationFrame stops with it and
    // setActive cannot run. Coming BACK does not resume here: the game is paused when the page
    // returns, and resuming on the event put music over the pause screen. setActive picks it up on
    // the first frame instead, and only if the game is actually running.
    document.addEventListener('visibilitychange', () => {
      if (this.ctx && document.hidden) this.ctx.suspend();
    });
    this.armResume();
  }

  // Whether the game wants sound at all: true while it is running, false while anything has stopped
  // it -- the pause screen, the settings or info sheets, a reward waiting to be chosen, the end of a
  // run. Suspending the context stops the music loop and every scheduled sound at once, and
  // `ctx.currentTime` freezes with it, so the loop comes back in phase rather than desynced.
  //
  // Reconciled against the context's real state rather than a remembered flag. A flag goes stale
  // while the page is hidden -- nothing is running to update it -- and the first thing that happens
  // on the way back is precisely the case this has to get right.
  setActive(on) {
    this.active = on;
    if (!this.ctx) return;
    const want = on && !document.hidden;
    if (want && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    else if (!want && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  // Keep asking on any gesture until it takes. Cheap when it works first time: the listeners are
  // added once and removed the moment the context reports running.
  armResume() {
    if (!this.ctx || this.ctx.state === 'running') return;
    if (!this.active) return;   // suspended on purpose; do not let a stray click undo it
    this.ctx.resume().catch(() => {});
    if (this.resumeArmed) return;
    this.resumeArmed = true;
    const tryIt = () => {
      if (!this.ctx) return;
      this.ctx.resume().catch(() => {});
      if (this.ctx.state !== 'running') return;
      for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click']) window.removeEventListener(ev, tryIt, true);
      this.resumeArmed = false;
      // the loop was scheduled against a clock that was not moving; restart it on the one that is
      if (this.dayBus) this.startMusic();
    };
    for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click']) window.addEventListener(ev, tryIt, true);
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('crownrush-muted', m ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
    if (!m) this.armResume();   // turning sound back on is a gesture: use it to retry a stuck context
  }

  // ---- synth helpers ----
  tone({ f, t, dur, type = 'sine', gain = 0.1, attack = 0.01, release = 0.1, lp = 0, bus, slideTo = 0, detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    let node = o;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      o.connect(filt);
      node = filt;
    }
    node.connect(g);
    g.connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ t, dur, gain = 0.2, type = 'bandpass', f = 1000, q = 1 }) {
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 0.5;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- music ----
  buildLoop() {
    const ev = [];
    LEAD.forEach((bar, b) => {
      const toks = bar.split(' ');
      let cur = null;
      toks.forEach((tok, i) => {
        const t = b * 4 * BEAT + i * BEAT * 0.5;
        if (tok === '.') {
          if (cur) cur.dur += BEAT * 0.5;
        } else if (tok === '-') {
          cur = null;
        } else {
          cur = { kind: 'lead', f: freq(tok), t, dur: BEAT * 0.5 };
          ev.push(cur);
        }
      });
      const chord = CHORDS[b];
      chord.forEach((n) => ev.push({ kind: 'pad', f: freq(n), t: b * 4 * BEAT, dur: 4 * BEAT }));
      const [root, fifth] = BASS[b];
      ev.push({ kind: 'bass', f: freq(root), t: b * 4 * BEAT, dur: BEAT * 1.4 });
      ev.push({ kind: 'bass', f: freq(fifth), t: b * 4 * BEAT + 2 * BEAT, dur: BEAT * 0.9 });
      ev.push({ kind: 'bass', f: freq(root), t: b * 4 * BEAT + 3 * BEAT, dur: BEAT * 0.9 });
      // gentle arpeggio under the melody
      for (let i = 0; i < 8; i++) {
        const n = chord[[0, 1, 2, 1][i % 4]];
        ev.push({ kind: 'arp', f: freq(n) * 2, t: b * 4 * BEAT + i * BEAT * 0.5 + 0.005, dur: BEAT * 0.45 });
      }
    });
    for (const e of ev) e.set = 'day';

    // the night arrangement: same bars, thinner. The bright arpeggio halves in speed and drops an
    // octave, and a drone sits under every other bar, which is most of where the dread comes from.
    NIGHT_LEAD.forEach((bar, b) => {
      const toks = bar.split(' ');
      let cur = null;
      toks.forEach((tok, i) => {
        const t = b * 4 * BEAT + i * BEAT * 0.5;
        if (tok === '.') {
          if (cur) cur.dur += BEAT * 0.5;
        } else if (tok === '-') {
          cur = null;
        } else {
          cur = { kind: 'lead', set: 'night', f: freq(tok), t, dur: BEAT * 0.5 };
          ev.push(cur);
        }
      });
      const chord = NIGHT_CHORDS[b];
      chord.forEach((n) => ev.push({ kind: 'pad', set: 'night', f: freq(n), t: b * 4 * BEAT, dur: 4 * BEAT }));
      const [root, fifth] = NIGHT_BASS[b];
      ev.push({ kind: 'bass', set: 'night', f: freq(root), t: b * 4 * BEAT, dur: BEAT * 1.6 });
      ev.push({ kind: 'bass', set: 'night', f: freq(fifth), t: b * 4 * BEAT + 2 * BEAT, dur: BEAT * 1.1 });
      for (let i = 0; i < 4; i++) {
        const n = chord[[0, 1, 2, 1][i % 4]];
        ev.push({ kind: 'arp', set: 'night', f: freq(n), t: b * 4 * BEAT + i * BEAT + 0.005, dur: BEAT * 0.9 });
      }
      if (b % 2 === 0) ev.push({ kind: 'drone', set: 'night', f: freq(NIGHT_BASS[b][0]) / 2, t: b * 4 * BEAT, dur: 8 * BEAT });
    });
    this.events = ev.sort((a, b) => a.t - b.t);
  }

  // #32: cross-fade to the other arrangement, starting on the next bar line so the pulse holds.
  setNight(on) {
    this.nightOn = !!on;
    if (!this.ctx || !this.dayBus) return;
    const bar = 4 * BEAT;
    const now = this.ctx.currentTime;
    const start = Math.max(now, this.loopStart + Math.ceil(Math.max(0, now - this.loopStart) / bar) * bar);
    for (const [bus, to] of [[this.dayBus, on ? 0 : 1], [this.nightBus, on ? 1 : 0]]) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, start);
      bus.gain.linearRampToValueAtTime(to, start + bar * 1.5);
    }
  }

  startMusic() {
    this.loopStart = this.ctx.currentTime + 0.1;
    this.nextIdx = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 90);
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.35;
    while (true) {
      if (this.nextIdx >= this.events.length) {
        this.nextIdx = 0;
        this.loopStart += this.loopLen;
      }
      const e = this.events[this.nextIdx];
      const t = this.loopStart + e.t;
      if (t > ahead) break;
      this.nextIdx++;
      if (t < this.ctx.currentTime - 0.05) continue;
      this.playEvent(e, t);
    }
  }

  playEvent(e, t) {
    const night = e.set === 'night';
    const bus = night ? this.nightBus : this.dayBus;
    if (!bus) return;
    // a silent bus still costs oscillators, so skip whichever arrangement is faded out and staying that way
    if (night !== this.nightOn && bus.gain.value < 0.001) return;
    if (night) {
      // darker voicing: softer attacks, longer tails, the low-pass pulled well down
      if (e.kind === 'lead') this.tone({ f: e.f, t, dur: e.dur, type: 'triangle', gain: 0.15, attack: 0.04, release: 0.32, lp: 1300, bus });
      else if (e.kind === 'pad') this.tone({ f: e.f, t, dur: e.dur, type: 'sine', gain: 0.05, attack: 0.9, release: 1.1, lp: 900, bus });
      else if (e.kind === 'bass') this.tone({ f: e.f, t, dur: e.dur, type: 'triangle', gain: 0.19, attack: 0.03, release: 0.4, lp: 320, bus });
      else if (e.kind === 'arp') this.tone({ f: e.f, t, dur: e.dur, type: 'sine', gain: 0.03, attack: 0.02, release: 0.5, lp: 1100, bus });
      else if (e.kind === 'drone') this.tone({ f: e.f, t, dur: e.dur, type: 'sine', gain: 0.075, attack: 1.6, release: 2.2, lp: 200, bus });
      return;
    }
    if (e.kind === 'lead') this.tone({ f: e.f, t, dur: e.dur, type: 'triangle', gain: 0.16, attack: 0.015, release: 0.12, lp: 2600, bus });
    else if (e.kind === 'pad') this.tone({ f: e.f, t, dur: e.dur, type: 'sine', gain: 0.035, attack: 0.5, release: 0.6, bus });
    else if (e.kind === 'bass') this.tone({ f: e.f, t, dur: e.dur, type: 'triangle', gain: 0.17, attack: 0.02, release: 0.15, lp: 500, bus });
    else if (e.kind === 'arp') this.tone({ f: e.f, t, dur: e.dur, type: 'sine', gain: 0.045, attack: 0.005, release: 0.2, bus });
  }

  // #32: the wolf. A sawtooth swept up and held before it falls away, with a slow vibrato, the
  // filter opening as it climbs, and a breath of noise beneath: nightfall you can hear coming.
  howl() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.03;
    const dur = 2.2;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(280, t);
    o.frequency.exponentialRampToValueAtTime(610, t + 0.6);
    o.frequency.setValueAtTime(610, t + 1.25);
    o.frequency.exponentialRampToValueAtTime(215, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.4;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 10;
    lfo.connect(lfoDepth);
    lfoDepth.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(760, t);
    lp.frequency.linearRampToValueAtTime(1600, t + 0.7);
    lp.frequency.linearRampToValueAtTime(620, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
    g.gain.setValueAtTime(0.2, t + 1.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.45);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.5);
    lfo.start(t);
    lfo.stop(t + dur + 0.5);
    this.noise({ t: t + 0.15, dur: 1.5, gain: 0.045, type: 'bandpass', f: 500, q: 0.7 });
  }

  // ---- sound effects ----
  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }
  hit() {
    if (!this.ready() || this.now - this.lastHit < 0.05) return;
    this.lastHit = this.now;
    const t = this.now;
    this.noise({ t, dur: 0.07, gain: 0.22, f: 1400, q: 0.8 });
    this.tone({ f: 220, slideTo: 70, t, dur: 0.09, type: 'sine', gain: 0.22, attack: 0.002, release: 0.06 });
  }
  wallHit() {
    if (!this.ready() || this.now - this.lastHit < 0.08) return;
    this.lastHit = this.now;
    const t = this.now;
    this.noise({ t, dur: 0.12, gain: 0.2, type: 'lowpass', f: 500 });
    this.tone({ f: 110, slideTo: 50, t, dur: 0.12, type: 'triangle', gain: 0.2, attack: 0.002, release: 0.08 });
  }
  coin(combo = 0) {
    if (!this.ready()) return;
    const t = this.now;
    const base = 988 * Math.pow(2, Math.min(combo, 12) / 24); // rises a little with each quick pickup
    this.tone({ f: base, t, dur: 0.05, type: 'square', gain: 0.07, attack: 0.002, release: 0.02, lp: 4000 });
    this.tone({ f: base * 1.335, t: t + 0.05, dur: 0.22, type: 'square', gain: 0.07, attack: 0.002, release: 0.16, lp: 4000 });
  }
  ching() {
    if (!this.ready() || this.now - this.lastChing < 0.045) return;
    this.lastChing = this.now;
    const t = this.now;
    const p = 0.95 + Math.random() * 0.1;
    this.tone({ f: 2300 * p, t, dur: 0.11, type: 'triangle', gain: 0.1, attack: 0.002, release: 0.09 });
    this.tone({ f: 3450 * p, t, dur: 0.08, type: 'sine', gain: 0.06, attack: 0.002, release: 0.06 });
    this.noise({ t, dur: 0.03, gain: 0.05, f: 6000, q: 2 });
  }
  mine(type) {
    if (!this.ready() || this.now - this.lastHit < 0.05) return;
    this.lastHit = this.now;
    const t = this.now;
    if (type === 'wood') {
      this.noise({ t, dur: 0.1, gain: 0.22, type: 'lowpass', f: 700 });
      this.tone({ f: 160, slideTo: 90, t, dur: 0.12, type: 'triangle', gain: 0.2, attack: 0.002, release: 0.08 });
    } else if (type === 'stone') {
      this.tone({ f: 1900 * (0.95 + Math.random() * 0.1), t, dur: 0.08, type: 'triangle', gain: 0.12, attack: 0.002, release: 0.06 });
      this.noise({ t, dur: 0.06, gain: 0.18, type: 'highpass', f: 2500 });
    } else {
      this.noise({ t, dur: 0.14, gain: 0.16, f: 3200, q: 0.7 });
    }
  }
  build() {
    if (!this.ready()) return;
    const t = this.now;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.tone({ f: freq(n), t: t + i * 0.07, dur: 0.25, type: 'triangle', gain: 0.18, attack: 0.005, release: 0.18, lp: 3000 }));
    this.noise({ t, dur: 0.18, gain: 0.12, type: 'lowpass', f: 600 });
  }
  horn() {
    if (!this.ready()) return;
    const t = this.now;
    // two brassy notes with a slow rise, like a real horn call
    for (const [f, at, dur] of [[220, 0, 0.45], [330, 0.35, 0.7]]) {
      this.tone({ f: f * 0.94, t: t + at, dur, type: 'sawtooth', gain: 0.09, attack: 0.05, release: 0.25, lp: 1800, slideTo: f });
      this.tone({ f: f * 2 * 0.97, t: t + at, dur, type: 'square', gain: 0.03, attack: 0.05, release: 0.25, lp: 2400, slideTo: f * 2 });
    }
  }
  unlock() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone({ f: freq('E6'), t, dur: 0.12, type: 'sine', gain: 0.12, attack: 0.004, release: 0.08 });
    this.tone({ f: freq('G6'), t: t + 0.1, dur: 0.2, type: 'sine', gain: 0.12, attack: 0.004, release: 0.15 });
  }
  enemyDie() {
    if (!this.ready()) return;
    const t = this.now;
    this.noise({ t, dur: 0.16, gain: 0.18, type: 'lowpass', f: 700 });
    this.tone({ f: 160, slideTo: 40, t, dur: 0.16, type: 'sine', gain: 0.18, attack: 0.002, release: 0.1 });
  }
  wave(boss = false) {
    if (!this.ready()) return;
    const t = this.now;
    const notes = boss ? ['D3', 'D3', 'A3'] : ['G3', 'C4'];
    notes.forEach((n, i) => this.tone({ f: freq(n), t: t + i * 0.22, dur: i === notes.length - 1 ? 0.5 : 0.2, type: 'sawtooth', gain: 0.12, attack: 0.02, release: 0.12, lp: 1200 }));
  }
  alarm() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      this.tone({ f: 660, t: t + i * 0.22, dur: 0.12, type: 'square', gain: 0.1, attack: 0.005, release: 0.06, lp: 1800 });
      this.tone({ f: 520, t: t + i * 0.22 + 0.11, dur: 0.1, type: 'square', gain: 0.1, attack: 0.005, release: 0.06, lp: 1800 });
    }
  }
  hurt() {
    if (!this.ready() || this.now - this.lastHurt < 0.25) return;
    this.lastHurt = this.now;
    this.tone({ f: 180, slideTo: 60, t: this.now, dur: 0.16, type: 'square', gain: 0.1, attack: 0.002, release: 0.1, lp: 900 });
  }
  gameOver() {
    if (!this.ready()) return;
    const t = this.now;
    ['E4', 'C4', 'A3', 'F3'].forEach((n, i) => this.tone({ f: freq(n), t: t + i * 0.3, dur: 0.45, type: 'triangle', gain: 0.18, attack: 0.01, release: 0.3, lp: 2000 }));
  }
}

export const audio = new Audio();
