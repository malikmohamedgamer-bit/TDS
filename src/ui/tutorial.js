// First-match tutorial. Each step completes when the player actually does the thing.
// The first wave waits until the player starts it, so nobody is rushed while learning.

export const TUTORIAL_STEPS = [
  { id: 'walk', title: 'Walk around', text: 'Move with W A S D (or the joystick). Hold Shift to sprint, Space to jump.', done: (g) => g.heroMoved > 4 },
  { id: 'look', title: 'Look around', text: 'Hold the right mouse button and drag (or drag on the screen) to turn the camera. Mouse wheel / pinch zooms.', done: (g) => g.cameraTurned > 0.6 },
  { id: 'pick', title: 'Pick a tower', text: 'Press 1 or click the first tower in the bar at the bottom.', done: (g) => !!g.placing || g.match.towers.length > 0 },
  { id: 'place', title: 'Build it', text: 'Click the ground near the road. A green ring and ✓ mean you can build; a red dashed ring and ✕ tell you why not.', done: (g) => g.match.towers.length > 0 },
  { id: 'wave', title: 'Start the first wave', text: 'Press N or the Start wave button at the top. Enemies walk the road to your keep.', done: (g) => g.match.wave >= 1 },
  { id: 'upgrade', title: 'Upgrade', text: 'Click one of your towers, then Upgrade (or press U). Later you choose between two paths, and the last step evolves the tower.', done: (g) => g.match.towers.some((t) => t.tier > 0) },
  { id: 'ability', title: 'Use an ability', text: 'Press Z for an Airstrike, then click where it should land. Abilities can also be set to AUTO.', done: (g) => g.match.abilities.some((a) => a.ready > g.match.time || a.mode === 'auto') },
  { id: 'end', title: 'Hold the line', text: 'Survive all 20 waves. Bosses arrive on waves 10 and 20: watch for red warning circles. Good luck, Commander!', done: (g) => g.tutorialTimer > 6 },
];

export class Tutorial {
  constructor(root, onFinish) {
    this.onFinish = onFinish;
    this.step = 0;
    this.active = false;
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
    this.render();
  }

  render() {
    const s = TUTORIAL_STEPS[this.step];
    this.el.innerHTML = `<div class="tut-head"><span class="tut-n">Step ${this.step + 1}/${TUTORIAL_STEPS.length}</span><button class="link" data-act="skip">Skip tutorial</button></div>
      <h3>${s.title}</h3><p>${s.text}</p><div class="tut-bar"><span style="width:${(this.step / TUTORIAL_STEPS.length) * 100}%"></span></div>`;
    this.el.dataset.step = s.id;
  }

  update(g) {
    if (!this.active) return;
    const s = TUTORIAL_STEPS[this.step];
    if (s.id === 'end') g.tutorialTimer = (g.tutorialTimer || 0) + g.dt;
    if (s.done(g)) {
      this.step++;
      if (this.step >= TUTORIAL_STEPS.length) this.finish(false);
      else this.render();
    }
  }

  finish(skipped) {
    this.active = false;
    this.el.hidden = true;
    this.onFinish(skipped);
  }

  get current() {
    return this.active ? TUTORIAL_STEPS[this.step].id : null;
  }
}
