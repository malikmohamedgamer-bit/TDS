// Automatic quality step-down (pure, no DOM): fed one fps reading per half-second window. When the
// game runs below `minFps` for `windows` windows in a row during play, it asks for one quality tier
// lower, then waits `cooldown` windows before it may ask again. Never goes below the lowest tier.
// It only runs while the player has not picked a quality themselves (settings.qualityAuto).

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export class QualityGovernor {
  constructor({ minFps = 24, windows = 10, cooldown = 40, warmup = 6 } = {}) {
    Object.assign(this, { minFps, windows, cooldown, warmup });
    this.slow = 0;
    this.wait = warmup;
  }

  /** Call after a change of scene (match start): loading hitches must not count. */
  reset() {
    this.slow = 0;
    this.wait = this.warmup;
  }

  /**
   * @param {number} fps      average fps of the last window
   * @param {boolean} active  true during real play (not menus, pause or a hidden tab)
   * @param {string} quality  current tier
   * @returns {string|null}   the tier to switch to, or null
   */
  sample(fps, active, quality) {
    if (!active) { this.slow = 0; return null; }
    if (this.wait > 0) { this.wait--; return null; }
    this.slow = fps < this.minFps ? this.slow + 1 : 0;
    if (this.slow < this.windows) return null;
    const i = QUALITY_ORDER.indexOf(quality);
    this.slow = 0;
    this.wait = this.cooldown;
    return i > 0 ? QUALITY_ORDER[i - 1] : null;
  }
}

/** Starting tier for a device: touch screens and weak hardware start on Low. */
export function defaultQuality({ coarsePointer = false, deviceMemory, cores } = {}) {
  const weak = (deviceMemory && deviceMemory <= 4) || (cores && cores <= 4);
  return coarsePointer || weak ? 'low' : 'medium';
}
