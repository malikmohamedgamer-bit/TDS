// First-match tutorial. Each step completes when the player actually does the thing.
// The first wave waits until the player starts it, so nobody is rushed while learning.
// Steps show touch or keyboard wording for the device, glow the control they talk about, and
// skip themselves when the mode makes them impossible (for example no abilities).

const glowSlot = '[data-testid="hotbar"] .slot';

export const TUTORIAL_STEPS = [
  {
    id: 'walk', title: 'Walk around',
    text: { key: 'Move with W A S D. Hold Shift to sprint, Space to jump.', touch: 'Move with the joystick at the bottom left. The ⤒ button jumps.' },
    glow: { touch: '[data-testid="joystick"]' },
    done: (g) => g.heroMoved > 4,
  },
  {
    id: 'look', title: 'Look around',
    text: { key: 'Hold the right mouse button and drag to turn the camera. The mouse wheel zooms.', touch: 'Drag anywhere on the screen to turn the camera. Pinch to zoom.' },
    done: (g) => g.cameraTurned > 0.6,
  },
  {
    id: 'pick', title: 'Pick a tower',
    text: { key: 'Press 1 or click the first tower in the glowing bar at the bottom.', touch: 'Tap the first tower in the glowing bar at the bottom.' },
    glow: { all: `${glowSlot}:first-child` },
    done: (g) => !!g.placing || g.match.towers.length > 0,
  },
  {
    id: 'place', title: 'Build it',
    text: { key: 'Click the ground near the road. A green ring and ✓ mean you can build; a red ring and ✕ tell you why not. Right click or Esc cancels.', touch: 'Tap the ground near the road. A green ring and ✓ mean you can build; a red ring and ✕ tell you why not.' },
    glow: { all: '[data-testid="place-hint"]' },
    done: (g) => g.match.towers.length > 0,
  },
  {
    id: 'wave', title: 'Start the first wave',
    text: { key: 'Press N or the glowing Start wave button at the top. Enemies walk the road to your keep.', touch: 'Tap the glowing Start wave button at the top. Enemies walk the road to your keep.' },
    glow: { all: '[data-testid="skip"]' },
    done: (g) => g.match.wave >= 1,
  },
  {
    id: 'upgrade', title: 'Upgrade',
    text: { key: 'Click one of your towers, then Upgrade (or press U). Later you choose between two paths, and the last step evolves the tower.', touch: 'Tap one of your towers, then Upgrade. Later you choose between two paths, and the last step evolves the tower.' },
    glow: { all: '[data-testid="upgrade"], [data-testid="tower-panel"] .branch' },
    done: (g) => g.match.towers.some((t) => t.tier > 0),
  },
  {
    id: 'ability', title: 'Use an ability',
    text: { key: 'Press Z (or click the glowing button) for an Airstrike, then click where it should land. AUTO casts it for you.', touch: 'Tap the glowing ability button, then tap where it should land. AUTO casts it for you.' },
    glow: { all: '[data-testid="abilities"] .abtn' },
    skip: (g) => g.match.abilities.length === 0,
    done: (g) => g.match.abilities.some((a) => a.ready > g.match.time || a.mode === 'auto'),
  },
  {
    id: 'end', title: 'Hold the line',
    text: { all: (g) => endText(g.match) },
    done: (g) => g.tutorialTimer > 6,
  },
];

function endText(m) {
  const n = m.waveCount();
  const bosses = [];
  if (Number.isFinite(n)) for (let w = 1; w <= n; w++) if (m.waveDef(w)?.boss) bosses.push(w);
  const goal = Number.isFinite(n) ? `Survive all ${n} waves.` : 'Survive as long as you can.';
  const boss = bosses.length && bosses.length <= 3 ? ` Bosses arrive on wave${bosses.length > 1 ? 's' : ''} ${bosses.join(' and ')}: watch for red warning circles.` : ' Watch for red warning circles under bosses.';
  return `${goal}${boss} Good luck, Commander!`;
}

export class Tutorial {
  constructor(root, onFinish, { touch } = {}) {
    this.root = root;
    this.onFinish = onFinish;
    this.touch = touch ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    this.step = 0;
    this.active = false;
    this.glowing = [];
    this.el = document.createElement('section');
    this.el.className = 'tutorial panel';
    this.el.setAttribute('aria-live', 'polite');
    this.el.dataset.testid = 'tutorial';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="skip"]')) this.finish(true);
    });
  }

  start() {
    this.active = true;
    this.step = 0;
    this.el.hidden = false;
    this.render({});
  }

  /** Hide without completing (match ended or left). */
  stop() {
    this.active = false;
    this.el.hidden = true;
    this.glow(null);
  }

  pick(v, g) {
    if (!v) return null;
    const x = this.touch ? (v.touch ?? v.all ?? v.key) : (v.key ?? v.all);
    return typeof x === 'function' ? x(g) : x;
  }

  render(g) {
    const s = TUTORIAL_STEPS[this.step];
    this.el.innerHTML = `<div class="tut-head"><span class="tut-n">Step ${this.step + 1}/${TUTORIAL_STEPS.length}</span><button class="link" data-act="skip">Skip tutorial</button></div>
      <h3>${s.title}</h3><p>${this.pick(s.text, g)}</p><div class="tut-bar"><span style="width:${(this.step / TUTORIAL_STEPS.length) * 100}%"></span></div>`;
    this.el.dataset.step = s.id;
    this.rendered = s.id;
  }

  /** Glow the control the current step talks about (the HUD re-renders, so re-apply each frame). */
  glow(g) {
    const sel = this.active ? this.pick(TUTORIAL_STEPS[this.step].glow, g) : null;
    const now = sel ? [...document.querySelectorAll(sel)].filter((el) => !el.hidden && el.offsetParent !== null) : [];
    for (const el of this.glowing) if (!now.includes(el)) el.classList.remove('tut-glow');
    for (const el of now) el.classList.add('tut-glow');
    this.glowing = now;
  }

  update(g) {
    if (!this.active) return;
    let s = TUTORIAL_STEPS[this.step];
    while (s && (s.skip?.(g) || s.done(g))) {
      this.step++;
      s = TUTORIAL_STEPS[this.step];
    }
    if (!s) { this.finish(false); return; }
    if (s.id === 'end') g.tutorialTimer = (g.tutorialTimer || 0) + g.dt;
    if (this.rendered !== s.id) this.render(g);
    this.glow(g);
  }

  finish(skipped) {
    this.active = false;
    this.el.hidden = true;
    this.glow(null);
    this.onFinish(skipped);
  }

  get current() {
    return this.active ? TUTORIAL_STEPS[this.step].id : null;
  }
}
