// Animated reward / stat counters: every [data-count] under root counts up from 0 to its value.
// countValue() is pure (eased value at time t) so it is unit-tested; countUp() drives the DOM.

/** Eased counter value at elapsed time t (ms) of a duration; integer, never above target. */
export function countValue(target, t, duration = 900) {
  if (!(duration > 0) || t >= duration) return target;
  if (t <= 0) return 0;
  const k = t / duration;
  const e = 1 - (1 - k) ** 3; // ease-out cubic
  return Math.min(target, Math.round(target * e));
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function countUp(root, { duration = 900, reduced = false } = {}) {
  const els = [...root.querySelectorAll('[data-count]')].map((el) => ({ el, target: Number(el.dataset.count) || 0 }));
  if (!els.length) return;
  if (reduced || typeof requestAnimationFrame === 'undefined') {
    for (const { el, target } of els) el.textContent = fmt(target);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const t = now - t0;
    for (const { el, target } of els) el.textContent = fmt(countValue(target, t, duration));
    if (t < duration && root.isConnected) requestAnimationFrame(tick);
  };
  for (const { el } of els) el.textContent = '0';
  requestAnimationFrame(tick);
}
