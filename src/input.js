// Virtual joystick (drag anywhere) + keyboard. Produces a normalized {x, z} move vector.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.dir = { x: 0, z: 0 };
    this.stick = null; // { id, ox, oy, x, y }
    this.maxR = 64;

    this.ui = document.createElement('div');
    this.ui.id = 'joystick';
    this.ui.innerHTML = '<div class="base"></div><div class="knob"></div>';
    Object.assign(this.ui.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'none', display: 'none', zIndex: 5,
    });
    const style = document.createElement('style');
    style.textContent = `
      #joystick .base { position:absolute; left:-64px; top:-64px; width:128px; height:128px; border-radius:50%;
        background: rgba(255,255,255,0.18); border: 3px solid rgba(255,255,255,0.55); }
      #joystick .knob { position:absolute; left:-26px; top:-26px; width:52px; height:52px; border-radius:50%;
        background: rgba(255,255,255,0.85); box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
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
    try { this.el.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    this.stick = null;
    this.ui.style.display = 'none';
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
    return { x, z, mag: Math.hypot(x, z) };
  }
}
