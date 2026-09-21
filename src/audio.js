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
// The music bus's resting level, and how long it takes to get there and back (#113). 0.22s is long
// enough that the ear hears a fade rather than a click, and short enough that the suspend it is
// waiting for still lands inside the beat the panel takes to arrive -- the overlay's own fade is
// 0.2s, so the music goes with the picture rather than after it.
const MUSIC = 0.55;
const FADE = 0.22;
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

// #174: a stored volume, or the default when there is none or it is nonsense
function readVol(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  } catch (e) {
    return fallback;
  }
}

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('crownrush-muted') === '1';
    // #174: music and effects volumes, 0..1, kept beside the mute. They are their own gain nodes
    // between each bus and the master rather than a scale on the buses' own gains, because the music
    // bus is ramped by `rampMusic` and the ducking would fight a user volume written onto it.
    this.musicVol = readVol('crownrush-music', 0.7);
    this.sfxVol = readVol('crownrush-sfx', 0.8);
    this.lastHit = 0;
    this.lastChing = 0;
    this.lastHurt = 0;
    this.lastTap = 0;
    this.events = [];
    this.nightOn = false;
    this.active = true;   // does the game want sound right now (see setActive)
    this.everRan = false; // has the context ever actually started? (see armResume)
    this.rain = null;     // #81: the shower's nodes while one is running, null while it is dry
    this.rainAt = 0;      // and how hard it was falling the last time anything was told about it
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
    this.music.gain.value = MUSIC;
    this.musicTarget = MUSIC;        // where `rampMusic` believes the bus is heading, so the first call is a no-op
    this.musicVolGain = this.ctx.createGain();
    this.musicVolGain.gain.value = this.musicVol;
    this.music.connect(this.musicVolGain);
    this.musicVolGain.connect(this.master);
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
    this.sfxVolGain = this.ctx.createGain();
    this.sfxVolGain.gain.value = this.sfxVol;
    this.sfx.connect(this.sfxVolGain);
    this.sfxVolGain.connect(this.master);
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
  // #113: and it fades rather than cutting. Reported of the level-up panel: "the level information
  // just pops up and stops the music abruptly... it kills the rhythm". The panel appearing was only
  // half of that -- the other half was the whole soundtrack disappearing between one frame and the
  // next, which is what a page does when something has gone wrong.
  //
  // A ramp AND THEN a suspend, in that order, because either alone is wrong. A ramp with no suspend
  // leaves the loop running silently and out of phase when it comes back; a suspend with no ramp is
  // what this is fixing, and a suspend scheduled alongside a ramp cuts the ramp off mid-way, since it
  // stops every scheduled voice at once. So the fade is scheduled, and the suspend waits for it.
  //
  // The wait is a real window: the game is stopped but the context is still running for another fifth
  // of a second, and the player can come back inside it (open the pause screen, close it again). The
  // timer re-reads `active` when it fires rather than trusting what was true when it was set -- the
  // same reason the rest of this method reconciles against `ctx.state` instead of a flag.
  setActive(on) {
    this.active = on;
    if (!this.ctx) return;
    if (this.ctx.state === 'running') this.everRan = true;
    const want = on && !document.hidden;
    if (want) {
      if (this.fadeOut) {
        clearTimeout(this.fadeOut);
        this.fadeOut = 0;
      }
      if (this.ctx.state === 'suspended') {
        // The gain is wherever the fade left it and `currentTime` is frozen, so the ramp cannot be
        // scheduled until the clock is running again. `musicTarget` is cleared so it is not taken for
        // a ramp already in flight.
        this.musicTarget = null;
        this.ctx.resume().then(() => this.rampMusic(MUSIC)).catch(() => {});
      } else this.rampMusic(MUSIC);
    } else if (this.ctx.state === 'running' && !this.fadeOut) {
      this.rampMusic(0);
      this.fadeOut = setTimeout(() => {
        this.fadeOut = 0;
        if (this.active && !document.hidden) this.rampMusic(MUSIC);      // they came back inside the fade
        else if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
      }, FADE * 1000 + 40);
    }
  }

  // One ramp at a time, and only when the target actually moves. `setActive` is called every frame
  // from `Game.update`, and re-scheduling a ramp sixty times a second is a staircase, not a fade.
  rampMusic(to) {
    if (!this.ctx || !this.music || this.musicTarget === to) return;
    this.musicTarget = to;
    const g = this.music.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);    // start from where the last ramp actually got to, not from the target
    g.linearRampToValueAtTime(to, t + FADE);
  }

  // Keep asking on any gesture until it takes. Cheap when it works first time: the listeners are
  // added once and removed the moment the context reports running.
  //
  // #76: the guard here used to be a flat `if (!this.active) return`, which was too broad and shut
  // off the only escape a stuck context had. `active` is false while the game is paused -- and the
  // sound toggle lives IN the settings sheet, which pauses the game, so it was false for the whole
  // time the toggle could be reached. Turning sound on is exactly the gesture that used to rescue a
  // context iOS had refused to start, and it could no longer do it.
  //
  // A context that has never run is stuck, not deliberately silenced, so the guard only applies once
  // one has genuinely started. `force` is for the explicit ask -- a player reaching into settings and
  // turning sound on means it.
  armResume(force = false) {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') {
      this.everRan = true;
      return;
    }
    if (!force && !this.active && this.everRan) return;
    this.ctx.resume().catch(() => {});
    if (this.resumeArmed) return;
    this.resumeArmed = true;
    const tryIt = () => {
      if (!this.ctx) return;
      this.ctx.resume().catch(() => {});
      if (this.ctx.state !== 'running') return;
      for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click']) window.removeEventListener(ev, tryIt, true);
      this.resumeArmed = false;
      this.everRan = true;
      // the loop was scheduled against a clock that was not moving; restart it on the one that is
      if (this.dayBus) this.startMusic();
      // Unlocked -- but that is a different question from whether it should be making a noise right
      // now. The unlock sticks; the pause does not have to be undone by it.
      if (!this.active) this.ctx.suspend().catch(() => {});
    };
    for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click']) window.addEventListener(ev, tryIt, true);
  }

  // #174: the two sliders. Set outright rather than ramped for the reason `setMasterGain` gives: the
  // context is suspended while the sheet that holds them is open, so there is no clock to ramp along.
  setMusicVolume(v) {
    this.musicVol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('crownrush-music', String(this.musicVol)); } catch (e) { /* private mode */ }
    if (this.musicVolGain) this.musicVolGain.gain.value = this.musicVol;
  }
  setSfxVolume(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('crownrush-sfx', String(this.sfxVol)); } catch (e) { /* private mode */ }
    if (this.sfxVolGain) this.sfxVolGain.gain.value = this.sfxVol;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('crownrush-muted', m ? '1' : '0'); } catch (e) { /* private mode */ }
    this.setMasterGain(m ? 0 : 0.6);
    // Turning sound back on is a gesture, and an explicit one: retry a stuck context even though the
    // settings sheet that holds this toggle has the game paused.
    if (!m) this.armResume(true);
  }

  // A ramp needs a clock. `setTargetAtTime` schedules against `ctx.currentTime`, which is FROZEN
  // while the context is suspended -- and it is suspended for the whole time the settings sheet is
  // open, which is the only place this is reachable from. Set the value outright when there is no
  // clock to ramp along, and ramp only when there is.
  setMasterGain(v) {
    if (!this.master || !this.ctx) return;
    if (this.ctx.state === 'running') this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    else this.master.gain.value = v;
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
    let filt = null;
    if (lp) {
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      o.connect(filt);
    }
    (filt || o).connect(g);
    g.connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    // #61: let the chain go when the note does. Chrome and Firefox collect a finished source and
    // whatever hangs off it on their own; Safari historically has not, and a game that advertises
    // Add to Home Screen is played on iOS for thirty-seven minutes at a stretch, synthesising every
    // arrow, coin and fanfare in it. Saying when the nodes die is cheaper than hoping.
    o.onended = () => {
      o.disconnect();
      if (filt) filt.disconnect();
      g.disconnect();
    };
  }

  // Half a second of white noise, made once and shared by everything that needs a hiss: arrows,
  // the pickaxe, the wolf's breath and the rain (#81, which is what pulled it out of noise()).
  noiseBuffer() {
    if (!this.noiseBuf) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 0.5;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  // #239: A SOUND WITH A PLACE. `pan` is -1 (hard left) to 1, already scaled by the caller from the
  // world (`game.panAt`). One StereoPannerNode per cue, between the cue and the SFX bus, let go after
  // the longest cue it could carry -- the same reason `tone` says when its nodes die (#61). Every
  // placed cue records `lastPan` and keeps `lastPanner` BEFORE it asks `ready()`, so a check can
  // read the direction back on a context that is suspended, which in headless Chromium it always is.
  // Panning is off the main thread; the cost is a node, not a frame.
  placed(pan = 0) {
    const p = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
    this.lastPan = p;
    if (!this.ctx) return null;
    if (p === 0 || !this.ctx.createStereoPanner) { this.lastPanner = null; return this.sfx; }
    const node = this.ctx.createStereoPanner();
    node.pan.value = p;
    node.connect(this.sfx);
    this.lastPanner = node;
    setTimeout(() => node.disconnect(), 3000);
    return node;
  }

  noise({ t, dur, gain = 0.2, type = 'bandpass', f = 1000, q = 1, bus }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {                       // #61, as in tone()
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
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
  howl(pan = 0) {
    const bus = this.placed(pan);
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
    g.connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.5);
    lfo.start(t);
    lfo.stop(t + dur + 0.5);
    // #61: both sources stop on the same tick, so one handler takes the lot. The vibrato chain goes
    // with it -- once the oscillator it was bending has ended there is nothing left for it to bend.
    o.onended = () => {
      o.disconnect();
      lfo.disconnect();
      lfoDepth.disconnect();
      lp.disconnect();
      g.disconnect();
    };
    this.noise({ t: t + 0.15, dur: 1.5, gain: 0.045, type: 'bandpass', f: 500, q: 0.7 });
  }

  // #81: the shower. Rain is noise with the top taken off it, so the bed is the same half-second
  // buffer the arrows and the pickaxe use, looped: a lowpass for the weight of it, and a quieter
  // band above for the drops on their own.
  //
  // Two sources rather than one, at playback rates that do not divide into each other. Half a second
  // of noise on loop IS a half-second pattern, and with the top rolled off you hear it come round --
  // the bed pulsed twice a second, which sounds like a fault rather than like weather. 0.61 against
  // 1.0 puts the two seams back in step about once a minute, by which time the shower is over.
  //
  // The slow LFO on the cutoff is it gusting. An unchanging noise stops being a place and becomes
  // tape hiss after a few seconds, and a shower is on for half a minute at a time.
  //
  // 0.1 through the sfx bus, so the mute button reaches it like everything else. Quieter than any
  // one-shot in this file (0.05 to 0.22) on purpose: those are heard once, this is sat under.
  startRain() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1000;
    lp.Q.value = 0.5;
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = 5200;
    hiss.Q.value = 0.5;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 300;
    lfo.connect(lfoDepth);
    lfoDepth.connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const srcs = [1, 0.61].map((rate) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer();
      s.loop = true;
      s.playbackRate.value = rate;
      s.connect(lp);
      s.connect(hiss);
      return s;
    });
    hiss.connect(hissGain);
    hissGain.connect(g);
    lp.connect(g);
    g.connect(this.sfx);
    const t = ctx.currentTime;
    for (const s of srcs) s.start(t);
    lfo.start(t);
    this.rain = { srcs, lfo, gain: g, nodes: [lp, hiss, hissGain, lfoDepth, g], stopping: false };
  }

  stopRain() {
    const r = this.rain;
    if (!r || r.stopping) return;
    r.stopping = true;
    const t = this.ctx.currentTime;
    r.gain.gain.cancelScheduledValues(t);
    r.gain.gain.setValueAtTime(Math.max(0.0001, r.gain.gain.value), t);
    r.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    for (const s of r.srcs) s.stop(t + 1.5);
    r.lfo.stop(t + 1.5);
    // #61, and this is the one in the game that would actually have shown: a run gets eight or nine
    // showers, and every one of them builds seven nodes and two looping sources. Both sources and the
    // LFO stop on the same tick, so the first to report in takes the lot, as in howl(). `this.rain`
    // is only cleared if it is still THIS shower: a new one starting inside the fade replaces it, and
    // the old chain must not then null out the new one's handle on its way out.
    r.srcs[0].onended = () => {
      for (const s of r.srcs) s.disconnect();
      r.lfo.disconnect();
      for (const n of r.nodes) n.disconnect();
      if (this.rain === r) this.rain = null;
    };
  }

  // How hard it is raining, 0 to 1, from the frame loop. Called every frame, so like Hud.set it has
  // to cost nothing when nothing has moved -- and the level is rounded to fiftieths first, because
  // the six-second fade would otherwise schedule a ramp on each of its three hundred-odd frames and
  // nobody can hear a fiftieth.
  //
  // The retry matters: the shower can begin while the context is still asleep or muted, and then the
  // only thing that will ever start it is the level moving again. So a wet sky with no sound is not
  // treated as settled, and the next hundredth of fade picks it up.
  setRain(level) {
    if (!this.ctx) return;
    const want = Math.round(Math.min(1, Math.max(0, level)) * 50) / 50;
    if (want === this.rainAt && (want === 0 || (this.rain && !this.rain.stopping))) return;
    this.rainAt = want;
    if (want > 0 && (!this.rain || this.rain.stopping) && this.ready()) this.startRain();
    const r = this.rain;
    if (!r || r.stopping) return;
    if (want > 0) r.gain.gain.setTargetAtTime(want * 0.1, this.ctx.currentTime, 0.6);
    else this.stopRain();
  }

  // #104: Wren calling out.
  //
  // There are no audio files in this game -- everything in here is synthesised at play time, which is
  // a large part of why it loads in about two and a half seconds -- so a voice has to be a pitch
  // contour and a pair of formants rather than a recording. It is not speech and is not trying to be;
  // games have said "someone over there needs you" without words for forty years.
  //
  // `speechSynthesis` was the other route and is the wrong one. The voice is whatever the device
  // happens to ship, so she would sound like a different screen reader on every phone; iOS will not
  // speak at all without a user gesture; and it does not go through the Web Audio graph, so it would
  // be the only sound in the game that the mute button and the volume slider cannot touch. `ready()`
  // already gates on `muted`, which is exactly the argument.
  //
  // `kind` is which of her two moments this is. 'call' is her shouting across the village for help,
  // open and rising before it falls; 'fear' is her being taken -- higher, tighter and dropping away.
  cry(kind = 'call', pan = 0) {
    const bus = this.placed(pan);
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const call = kind !== 'fear';
    const dur = call ? 0.62 : 0.46;
    // A voice is a buzz shaped by the mouth around it: the sawtooth is the buzz, and two bandpass
    // filters at a vowel's first two formants are the mouth. Roughly "ah" for the open call and "eh"
    // for the tighter one -- the second formant is most of what tells a listener they are different.
    const f0 = call ? 300 : 380;
    const [f1, f2] = call ? [800, 1180] : [560, 1760];
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.82, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (call ? 1.16 : 1.3), t + (call ? 0.17 : 0.08));
    o.frequency.exponentialRampToValueAtTime(f0 * (call ? 0.7 : 0.52), t + dur);
    // the wobble that stops it reading as a siren
    const lfo = ctx.createOscillator();
    lfo.frequency.value = call ? 5.6 : 7.8;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = call ? 9 : 15;
    lfo.connect(lfoDepth);
    lfoDepth.connect(o.frequency);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const parts = [];
    for (const [f, q, lvl] of [[f1, 7, 1], [f2, 9, 0.6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const lv = ctx.createGain();
      lv.gain.value = lvl;
      o.connect(bp);
      bp.connect(lv);
      lv.connect(mix);
      parts.push(bp, lv);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(call ? 0.26 : 0.3, t + 0.07);
    g.gain.setValueAtTime(call ? 0.26 : 0.3, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    mix.connect(g);
    g.connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.16);
    lfo.start(t);
    lfo.stop(t + dur + 0.16);
    // #61: both sources stop on the same tick, so one handler takes the lot -- the vibrato chain
    // included, because once the oscillator it was bending has ended there is nothing left to bend.
    o.onended = () => {
      o.disconnect();
      lfo.disconnect();
      lfoDepth.disconnect();
      for (const n of parts) n.disconnect();
      mix.disconnect();
      g.disconnect();
    };
  }

  // ---- sound effects ----
  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }
  hit(pan = 0) {
    const bus = this.placed(pan);
    if (!this.ready() || this.now - this.lastHit < 0.05) return;
    this.lastHit = this.now;
    const t = this.now;
    this.noise({ t, dur: 0.07, gain: 0.22, f: 1400, q: 0.8, bus });
    this.tone({ f: 220, slideTo: 70, t, dur: 0.09, type: 'sine', gain: 0.22, attack: 0.002, release: 0.06, bus });
  }
  wallHit(pan = 0) {
    const bus = this.placed(pan);
    if (!this.ready() || this.now - this.lastHit < 0.08) return;
    this.lastHit = this.now;
    const t = this.now;
    this.noise({ t, dur: 0.12, gain: 0.2, type: 'lowpass', f: 500, bus });
    this.tone({ f: 110, slideTo: 50, t, dur: 0.12, type: 'triangle', gain: 0.2, attack: 0.002, release: 0.08, bus });
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
  horn() {
    if (!this.ready()) return;
    const t = this.now;
    // two brassy notes with a slow rise, like a real horn call
    for (const [f, at, dur] of [[220, 0, 0.45], [330, 0.35, 0.7]]) {
      this.tone({ f: f * 0.94, t: t + at, dur, type: 'sawtooth', gain: 0.09, attack: 0.05, release: 0.25, lp: 1800, slideTo: f });
      this.tone({ f: f * 2 * 0.97, t: t + at, dur, type: 'square', gain: 0.03, attack: 0.05, release: 0.25, lp: 2400, slideTo: f * 2 });
    }
  }
  // #57: the banner going in. A low wooden knock and a short cloth snap -- the pole driven into the
  // ground, not a fanfare. The horn is the fanfare, and two of those a minute would fight.
  banner() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone({ f: 96, t, dur: 0.16, type: 'triangle', gain: 0.1, attack: 0.004, release: 0.12, lp: 900 });
    this.noise({ t: t + 0.03, dur: 0.22, gain: 0.05, type: 'bandpass', f: 1500, q: 0.6 });
  }
  unlock() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone({ f: freq('E6'), t, dur: 0.12, type: 'sine', gain: 0.12, attack: 0.004, release: 0.08 });
    this.tone({ f: freq('G6'), t: t + 0.1, dur: 0.2, type: 'sine', gain: 0.12, attack: 0.004, release: 0.15 });
  }
  enemyDie(pan = 0) {
    const bus = this.placed(pan);
    if (!this.ready()) return;
    const t = this.now;
    this.noise({ t, dur: 0.16, gain: 0.18, type: 'lowpass', f: 700, bus });
    this.tone({ f: 160, slideTo: 40, t, dur: 0.16, type: 'sine', gain: 0.18, attack: 0.002, release: 0.1, bus });
  }
  wave(boss = false) {
    if (!this.ready()) return;
    const t = this.now;
    const notes = boss ? ['D3', 'D3', 'A3'] : ['G3', 'C4'];
    notes.forEach((n, i) => this.tone({ f: freq(n), t: t + i * 0.22, dur: i === notes.length - 1 ? 0.5 : 0.2, type: 'sawtooth', gain: 0.12, attack: 0.02, release: 0.12, lp: 1200 }));
  }
  alarm(pan = 0) {
    const bus = this.placed(pan);
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      this.tone({ f: 660, t: t + i * 0.22, dur: 0.12, type: 'square', gain: 0.1, attack: 0.005, release: 0.06, lp: 1800, bus });
      this.tone({ f: 520, t: t + i * 0.22 + 0.11, dur: 0.1, type: 'square', gain: 0.1, attack: 0.005, release: 0.06, lp: 1800, bus });
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
  // #197: the interface, which had no voice at all. There are 58 click handlers in `src/` and `hud.js`
  // never called this file once -- so every button in the game was silent against a world that is
  // not, which reads as unfinished in a way that is hard to point at.
  //
  // TWO SOUNDS, NOT FIFTY-EIGHT, and the line between them is whether the press COMMITS to something:
  // `tap` is a press, `confirm` is a choice taken. A distinct noise per button is how an interface
  // becomes noisy -- and worse, it teaches nothing, because a sound only means something while it is
  // rare. Both sit well under the world's gains (0.05 and 0.07 against `hit`'s 0.22) because the UI
  // is tapped far more often than the world is hit, and neither may ever compete with the alarm.
  //
  // They route through `tone`'s default bus like everything else, which is what makes them obey
  // `setSfxVolume`, `setMuted` and the settings sheet without a line of their own.
  tap() {
    // Rate-limited for the same reason `hit` is: a fast double tap, or a drag that the browser
    // reports as two pointerdowns, should be one click and not a flam.
    if (!this.ready() || this.now - this.lastTap < 0.04) return;
    this.lastTap = this.now;
    const t = this.now;
    // A falling blip and a breath of high noise -- a click rather than a note. A FIXED PITCH was
    // tried first and is wrong here: at this rate the ear starts predicting the next one, and a
    // sound you can predict stops being heard. Sliding it down keeps it a physical knock.
    this.tone({ f: 620, slideTo: 380, t, dur: 0.045, type: 'triangle', gain: 0.05, attack: 0.001, release: 0.035, lp: 3000 });
    this.noise({ t, dur: 0.025, gain: 0.03, type: 'highpass', f: 2600 });
  }
  confirm() {
    if (!this.ready()) return;
    const t = this.now;
    // Up a fourth. Smaller than that and it reads as a second tap rather than an answer; bigger and
    // it starts to be a fanfare, and `unlock` is already the fanfare.
    this.tone({ f: freq('C5'), t, dur: 0.07, type: 'triangle', gain: 0.07, attack: 0.002, release: 0.05, lp: 4000 });
    this.tone({ f: freq('F5'), t: t + 0.055, dur: 0.16, type: 'triangle', gain: 0.07, attack: 0.002, release: 0.12, lp: 4000 });
  }
}

export const audio = new Audio();
