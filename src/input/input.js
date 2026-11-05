// Unified input: keyboard, mouse (right-drag or pointer-lock look, wheel zoom) and touch
// (virtual joystick, drag-to-look, pinch zoom, on-screen buttons). Produces one frame snapshot.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  up: ['KeyE'],
  down: ['KeyQ'],
};

// one-shot actions (edge triggered)
export const ACTION_KEYS = {
  KeyV: 'firstPerson',
  KeyF: 'freeCam',
  KeyT: 'overview',
  KeyC: 'toCharacter',
  KeyL: 'pointerLock',
  KeyH: 'help',
  Escape: 'menu',
  BracketLeft: 'slower',
  BracketRight: 'faster',
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.keyEdges = new Set();
    this.actions = new Set();
    this.jumpEdge = false;
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.rightDown = false;
    this.locked = false;
    this.pointer = { x: 0, y: 0, inside: false };
    this.clicks = [];
    this.touch = { mx: 0, my: 0, sprint: false, jump: false };
    this.enabled = true;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const isTyping = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        this.keyEdges.add(e.code);
        if (e.code === 'Space') this.jumpEdge = true;
        const act = ACTION_KEYS[e.code];
        // pointer lock must be requested inside the user-gesture handler itself
        if (act === 'pointerLock') this.togglePointerLock();
        else if (act) this.actions.add(act);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.rightDown = false; });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.rightDown = true;
      if (e.button === 1) { e.preventDefault(); this.togglePointerLock(); }
      if (e.button === 0) this.clicks.push({ x: e.clientX, y: e.clientY, locked: this.locked });
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.rightDown = false; });
    window.addEventListener('mousemove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      if (this.locked || this.rightDown) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    c.addEventListener('mouseenter', () => { this.pointer.inside = true; });
    c.addEventListener('mouseleave', () => { this.pointer.inside = false; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
    });
  }

  togglePointerLock() {
    if (this.locked) document.exitPointerLock?.();
    else this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  _axis(neg, pos) {
    let v = 0;
    if (BINDINGS[pos].some((k) => this.keys.has(k))) v += 1;
    if (BINDINGS[neg].some((k) => this.keys.has(k))) v -= 1;
    return v;
  }

  /** Snapshot for this frame; clears accumulated deltas and edges. */
  frame() {
    const sens = (this.settings.mouseSensitivity ?? 1) * 0.0032;
    let mx = this._axis('left', 'right') + this.touch.mx;
    let my = this._axis('back', 'forward') + this.touch.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const out = {
      move: { x: mx, y: my },
      up: this._axis('down', 'up'),
      jump: this.jumpEdge || this.touch.jump,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.sprint,
      look: { dx: this.look.dx * sens, dy: this.look.dy * sens },
      zoom: this.wheel,
      actions: this.actions,
      clicks: this.clicks,
      keyEdges: this.keyEdges,
    };
    this.keyEdges = new Set();
    this.jumpEdge = false;
    this.touch.jump = false;
    this.look.dx = this.look.dy = 0;
    this.wheel = 0;
    this.actions = new Set();
    this.clicks = [];
    if (!this.enabled) {
      out.move = { x: 0, y: 0 };
      out.jump = false;
      out.up = 0;
    }
    return out;
  }
}
