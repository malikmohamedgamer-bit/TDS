// Fixed-timestep accumulator. Pure: the caller supplies real elapsed time.
// step(dt) runs the deterministic simulation; alpha is the interpolation factor for rendering.

export class FixedLoop {
  constructor({ step = 1 / 60, maxSteps = 5 } = {}) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.timeScale = 1;
    this.ticks = 0;
    this.dropped = 0; // simulated time discarded to avoid a spiral of death
  }

  /** Advance by real seconds; calls onStep(step) zero or more times. Returns alpha in [0,1). */
  advance(realDt, onStep) {
    if (!(realDt > 0)) realDt = 0;
    this.acc += Math.min(realDt, 0.25) * this.timeScale;
    let n = 0;
    const limit = this.maxSteps * Math.max(1, Math.ceil(this.timeScale));
    while (this.acc >= this.step - 1e-9 && n < limit) {
      onStep(this.step);
      this.acc = Math.max(0, this.acc - this.step);
      this.ticks++;
      n++;
    }
    if (this.acc >= this.step) {
      this.dropped += this.acc - (this.acc % this.step);
      this.acc %= this.step;
    }
    return this.acc / this.step;
  }
}
