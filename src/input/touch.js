// On-screen touch controls: virtual joystick (left), drag-to-look and pinch-zoom (rest of the
// screen), and buttons (jump, sprint, camera). All targets are at least 44 px.

export class TouchControls {
  constructor(root, canvas, input, onAction) {
    this.input = input;
    this.canvas = canvas;
    this.onAction = onAction;
    this.el = document.createElement('div');
    this.el.className = 'touch-ui';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Touch controls');
    this.el.innerHTML = `
      <div class="joy" data-testid="joystick"><div class="joy-knob"></div></div>
      <div class="touch-buttons">
        <button class="tbtn tbtn-jump" data-act="jump" aria-label="Jump">⤒<span>Jump</span></button>
        <button class="tbtn" data-act="sprint" aria-label="Sprint" aria-pressed="false">»<span>Sprint</span></button>
      </div>
      <div class="touch-cams">
        <button class="tbtn small" data-act="firstPerson" aria-label="First person">👁<span>1st</span></button>
        <button class="tbtn small" data-act="freeCam" aria-label="Free camera">✥<span>Free</span></button>
        <button class="tbtn small" data-act="overview" aria-label="Overview">▦<span>Map</span></button>
        <button class="tbtn small" data-act="toCharacter" aria-label="Return to character">☺<span>Me</span></button>
        <button class="tbtn small" data-act="up" aria-label="Fly up">▲<span>Up</span></button>
        <button class="tbtn small" data-act="down" aria-label="Fly down">▼<span>Down</span></button>
      </div>`;
    root.appendChild(this.el);
    this.joy = this.el.querySelector('.joy');
    this.knob = this.el.querySelector('.joy-knob');
    this.joyId = null;
    this.lookTouches = new Map();
    this.pinchDist = 0;
    this.flyUp = 0;
    this._bind();
    this.setVisible(matchMedia('(pointer: coarse)').matches);
  }

  setVisible(v) {
    this.visible = v;
    this.el.classList.toggle('on', v);
    document.body.classList.toggle('touch', v);
  }

  _bind() {
    const joyRect = () => this.joy.getBoundingClientRect();
    this.joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this._joyMove(t, joyRect());
    }, { passive: false });
    this.joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.joyId) this._joyMove(t, joyRect());
    }, { passive: false });
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.input.touch.mx = 0;
          this.input.touch.my = 0;
          this.knob.style.transform = 'translate(-50%, -50%)';
        }
      }
    };
    this.joy.addEventListener('touchend', joyEnd);
    this.joy.addEventListener('touchcancel', joyEnd);

    for (const btn of this.el.querySelectorAll('[data-act]')) {
      const act = btn.dataset.act;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('down');
        if (act === 'jump') this.input.touch.jump = true;
        else if (act === 'sprint') {
          this.input.touch.sprint = !this.input.touch.sprint;
          btn.setAttribute('aria-pressed', String(this.input.touch.sprint));
          btn.classList.toggle('active', this.input.touch.sprint);
        } else if (act === 'up') this.input.keys.add('KeyE');
        else if (act === 'down') this.input.keys.add('KeyQ');
        else this.onAction(act);
      }, { passive: false });
      const up = () => {
        btn.classList.remove('down');
        if (act === 'up') this.input.keys.delete('KeyE');
        if (act === 'down') this.input.keys.delete('KeyQ');
      };
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
      // also allow mouse clicks (desktop testing of the touch layout)
      btn.addEventListener('click', () => {
        if (act === 'jump') this.input.touch.jump = true;
        else if (!['sprint', 'up', 'down'].includes(act)) this.onAction(act);
      });
    }

    // look + pinch on the canvas
    const c = this.canvas;
    c.addEventListener('touchstart', (e) => {
      if (!this.visible) this.setVisible(true);
      for (const t of e.changedTouches) this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now() });
      if (this.lookTouches.size === 2) this.pinchDist = this._pinch();
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.lookTouches.size >= 2) {
        for (const t of e.changedTouches) {
          const p = this.lookTouches.get(t.identifier);
          if (p) { p.x = t.clientX; p.y = t.clientY; }
        }
        const d = this._pinch();
        this.input.wheel += (this.pinchDist - d) * 4;
        this.pinchDist = d;
        return;
      }
      for (const t of e.changedTouches) {
        const p = this.lookTouches.get(t.identifier);
        if (!p) continue;
        this.input.look.dx += (t.clientX - p.x) * 1.4;
        this.input.look.dy += (t.clientY - p.y) * 1.4;
        p.x = t.clientX;
        p.y = t.clientY;
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        const p = this.lookTouches.get(t.identifier);
        // a short tap without movement acts like a click (tower placement / selection)
        if (p && this.lookTouches.size === 1 && performance.now() - p.t0 < 300 && Math.hypot(t.clientX - p.sx, t.clientY - p.sy) < 12) {
          this.input.clicks.push({ x: t.clientX, y: t.clientY, touch: true });
        }
        this.lookTouches.delete(t.identifier);
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  _pinch() {
    const [a, b] = [...this.lookTouches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  _joyMove(t, r) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.42;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const k = Math.min(1, len / max);
    const deadzone = 0.12;
    const s = k < deadzone ? 0 : (k - deadzone) / (1 - deadzone);
    this.input.touch.mx = len ? (dx / len) * s : 0;
    this.input.touch.my = len ? (-dy / len) * s : 0;
    this.input.touch.sprint = this.input.touch.sprint || false;
  }

  setMode(mode) {
    this.el.dataset.mode = mode;
  }
}
