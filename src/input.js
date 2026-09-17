// Virtual joystick (drag anywhere) + keyboard. Produces a normalized {x, z} move vector.

// #57: what counts as a double-tap. A press under TAP_TIME that travelled less than TAP_SLOP is a
// tap; a second one within TAP_GAP of it, and within TAP_SLOP of where it landed, is a dash.
const TAP_TIME = 200;
const TAP_GAP = 280;
const TAP_SLOP = 40;
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.stick = null; // { id, ox, oy, x, y }
    this.maxR = 64;
    // #65: read() fills this rather than returning a new object. It is called once a frame from
    // updatePlayer and there is exactly one caller, which is what makes handing back the same object
    // safe -- nobody holds on to last frame's.
    this.move = { x: 0, z: 0, mag: 0 };
    // #57: double-tap to dash, which is the only spare gesture a one-thumb game has. A tap is a drag
    // that went nowhere, so the two do not fight: the second press still starts a stick and still
    // steers him, it just also spends the dash. `dashTap` is raised here and taken by the game --
    // `takeDash()` -- rather than calling into it, because Input has no reference to the game and
    // should not grow one for this.
    this.tapAt = 0;      // when the last press that qualified as a TAP was released
    this.tapX = 0;
    this.tapY = 0;
    this.downAt = 0;     // when the press now in progress went down
    this.dashTap = false;

    // #65: styled from src/style.css like everything else. It used to build a <style> element here
    // and append it to the head, which put the joystick outside both the stylesheet and the media
    // queries the rest of the HUD answers to.
    this.ui = document.createElement('div');
    this.ui.id = 'joystick';
    this.ui.innerHTML = '<div class="base"></div><div class="knob"></div>';
    document.body.appendChild(this.ui);
    // Looked up once. This used to be a querySelector inside updateKnob, which runs on every
    // pointermove -- and a phone samples touch at up to 120 Hz while the thumb is down.
    this.knob = this.ui.querySelector('.knob');

    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  onDown(e) {
    if (this.stick) return;
    // #57: a second tap, soon enough and close enough to the last one, is a dash. The thresholds are
    // the usual double-tap ones and they have to stay tight: a player walking with short repeated
    // stabs at the screen must not dash by accident, and 40px is about a thumb.
    const now = performance.now();
    if (now - this.tapAt < TAP_GAP && Math.hypot(e.clientX - this.tapX, e.clientY - this.tapY) < TAP_SLOP) {
      this.dashTap = true;
      this.tapAt = 0;   // three taps are two gestures, not three dashes
    }
    this.downAt = now;
    this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    // Without capture, a drag that leaves the window never delivers its pointerup and the stick stays
    // held: the King walks off on his own until the next tap. Captured events still bubble to the
    // window listeners below, so nothing else changes.
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable; window still sees it */ }
    this.ui.style.display = 'block';
    this.place(e.clientX, e.clientY);
    this.updateKnob();
  }

  // The stick's origin. A transform rather than left/top: both move the same pixels, but left/top are
  // layout properties, so setting them on a drag invalidates layout at touch sample rate for a thing
  // that is only ever moved around the screen.
  place(x, y) {
    this.ui.style.transform = `translate(${x}px, ${y}px)`;
  }
  onMove(e) {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    this.stick.x = e.clientX;
    this.stick.y = e.clientY;
    // let the base follow if the finger drifts far (feels better on phones)
    const dx = this.stick.x - this.stick.ox;
    const dy = this.stick.y - this.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.maxR) {
      this.stick.ox = this.stick.x - (dx / d) * this.maxR;
      this.stick.oy = this.stick.y - (dy / d) * this.maxR;
      this.place(this.stick.ox, this.stick.oy);
    }
    this.updateKnob();
  }
  onUp(e) {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    // #57: was that press a TAP? Short, and it did not travel. A drag that ends is not half of a
    // double-tap, however quickly the next one starts -- otherwise steering him around a corner and
    // setting off again would dash.
    const now = performance.now();
    const moved = Math.hypot(e.clientX - this.stick.ox, e.clientY - this.stick.oy);
    if (now - this.downAt < TAP_TIME && moved < TAP_SLOP) {
      this.tapAt = now;
      this.tapX = e.clientX;
      this.tapY = e.clientY;
    } else this.tapAt = 0;
    try { this.el.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    this.stick = null;
    this.ui.style.display = 'none';
  }

  // Raised by a double-tap and cleared by whoever asks, so one gesture is one dash however many
  // frames pass before the game gets to it.
  takeDash() {
    const d = this.dashTap;
    this.dashTap = false;
    return d;
  }
  updateKnob() {
    const dx = this.stick.x - this.stick.ox;
    const dy = this.stick.y - this.stick.oy;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Returns {x, z, mag}: screen-up maps to world -Z, screen-right to world +X.
  read() {
    let x = 0;
    let z = 0;
    if (this.stick) {
      const dx = this.stick.x - this.stick.ox;
      const dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const m = Math.min(1, d / this.maxR);
        x = (dx / d) * m;
        z = (dy / d) * m;
      }
    } else {
      const k = this.keys;
      if (k.has('w') || k.has('arrowup')) z -= 1;
      if (k.has('s') || k.has('arrowdown')) z += 1;
      if (k.has('a') || k.has('arrowleft')) x -= 1;
      if (k.has('d') || k.has('arrowright')) x += 1;
      const d = Math.hypot(x, z);
      if (d > 0) {
        x /= d;
        z /= d;
      }
    }
    this.move.x = x;
    this.move.z = z;
    this.move.mag = Math.hypot(x, z);
    return this.move;
  }
}
