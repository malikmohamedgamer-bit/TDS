// Slot-machine presentation for summons. The result is decided first (src/meta/meta.js); the reels
// only present it: staggered stops (a sound each), a near-miss tease on low results, a jackpot
// flash and a rare-item reveal for epic+. Always skippable; short under reduced motion.

export const RARITY_SYMBOL = { common: '◆', uncommon: '❖', rare: '✦', epic: '★', legendary: '♛', mythic: '☄' };
export const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const STRIP = ['◆', '❖', '✦', '★', '♛', '❖', '◆', '✦', '◆', '★', '❖', '♛', '✦', '◆'];
const CELL = 72;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class SlotMachine {
  constructor(root, { sfx, settings }) {
    this.sfx = sfx;
    this.settings = settings;
    this.el = document.createElement('div');
    this.el.className = 'slot-machine';
    this.el.innerHTML = `
      <div class="sm-frame" data-testid="slot-machine">
        <div class="sm-lights" aria-hidden="true">${'<i></i>'.repeat(14)}</div>
        <div class="sm-reels" aria-hidden="true">${[0, 1, 2].map(() => `<div class="sm-reel"><div class="sm-strip">${[...STRIP, ...STRIP, ...STRIP].map((s) => `<span>${s}</span>`).join('')}</div></div>`).join('')}<div class="sm-line"></div></div>
        <div class="sm-status" role="status" aria-live="polite"></div>
      </div>`;
    root.appendChild(this.el);
    this.reels = [...this.el.querySelectorAll('.sm-strip')];
    this.status = this.el.querySelector('.sm-status');
    this.skipRequested = false;
  }

  /** Index in the strip of a symbol, in the middle copy, so the reel can land there. */
  _target(sym, reel) {
    const base = STRIP.length;
    const idx = STRIP.indexOf(sym, (reel * 3) % STRIP.length);
    return base + (idx >= 0 ? idx : STRIP.indexOf(sym));
  }

  _setPos(reel, y) {
    this.reels[reel].style.transform = `translateY(${-y + CELL}px)`;
  }

  /** Decide what the three reels show for a (best) rarity. */
  plan(rarity, rng = Math.random) {
    const sym = RARITY_SYMBOL[rarity];
    const ri = ORDER.indexOf(rarity);
    if (ri >= 3) return { symbols: [sym, sym, sym], jackpot: true, nearMiss: false };
    if (rng() < 0.35) {
      // near miss: two big symbols, the third just slips past
      return { symbols: ['★', '★', sym], jackpot: false, nearMiss: true };
    }
    return { symbols: [sym, sym, sym], jackpot: false, nearMiss: false };
  }

  skip() {
    this.skipRequested = true;
  }

  /** Animate to the planned symbols. Resolves when the reels have stopped (or were skipped). */
  async spin(plan) {
    this.skipRequested = false;
    this.el.classList.remove('jackpot', 'near');
    this.status.textContent = 'Spinning…';
    const reduced = this.settings.reducedMotion;
    const stops = reduced ? [0.25, 0.35, 0.45] : [1.0, 1.45, plan.nearMiss ? 2.6 : 1.95];
    const targets = plan.symbols.map((s, i) => this._target(s, i) * CELL);
    const start = performance.now();
    const pos = [0, 0, 0];
    const stopped = [false, false, false];
    this.sfx?.play('spin');
    await new Promise((resolve) => {
      const frame = (now) => {
        const t = (now - start) / 1000;
        for (let i = 0; i < 3; i++) {
          if (stopped[i]) continue;
          if (this.skipRequested || t >= stops[i]) {
            stopped[i] = true;
            pos[i] = targets[i];
            this._setPos(i, pos[i]);
            this.reels[i].parentElement.classList.add('stopped');
            this.sfx?.play('reel', null, { gap: 0 }, i);
            continue;
          }
          // fast spin, easing into the target during the last 0.5 s
          const left = stops[i] - t;
          const loop = STRIP.length * CELL;
          if (left > 0.5) pos[i] = (t * 2400 + i * 200) % loop;
          else {
            const k = 1 - left / 0.5;
            const from = targets[i] - loop * 0.5;
            pos[i] = from + (targets[i] - from) * (1 - (1 - k) ** 3) + (plan.nearMiss && i === 2 ? Math.sin(k * Math.PI) * CELL * 0.6 : 0);
          }
          this._setPos(i, pos[i]);
        }
        if (stopped.every(Boolean)) resolve();
        else requestAnimationFrame(frame);
      };
      for (const r of this.reels) r.parentElement.classList.remove('stopped');
      requestAnimationFrame(frame);
    });
    if (plan.jackpot) { this.el.classList.add('jackpot'); this.sfx?.play('jackpot'); this.status.textContent = 'JACKPOT!'; }
    else if (plan.nearMiss) { this.el.classList.add('near'); this.sfx?.play('nearMiss'); this.status.textContent = 'So close…'; }
    else this.status.textContent = '';
  }
}

/** Full-screen reveal for epic+ pulls ("rare-item cutscene"). Resolves on continue / skip. */
export function revealCutscene(root, { name, rarity, thumb, duplicate, crowns, reduced }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = `reveal r-${rarity}${reduced ? ' reduced' : ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${RARITY_LABEL[rarity]} ${name}`);
    el.dataset.testid = 'reveal';
    el.innerHTML = `<div class="rays" aria-hidden="true"></div>
      <div class="rv-card"><div class="rv-rar">${RARITY_SYMBOL[rarity]} ${RARITY_LABEL[rarity]}</div>
      <img alt="" src="${thumb || ''}"><h2>${esc(name)}</h2>
      <p>${duplicate ? `Duplicate: +${crowns} crowns` : '✚ NEW tower unlocked!'}</p>
      <button class="btn primary big" data-act="ok">Continue</button></div>`;
    root.appendChild(el);
    const done = () => { el.remove(); resolve(); };
    el.querySelector('[data-act="ok"]').addEventListener('click', done);
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') done(); });
    el.querySelector('[data-act="ok"]').focus();
  });
}
