// Shared helpers for the net-*.test.js files: a deterministic toy sim, a hash recorder, and a
// virtual-network harness that runs LockstepSessions over a MemoryHub frame by frame.

import { hashString } from '../../src/core/rng.js';
import { MemoryHub } from '../../src/net/memoryTransport.js';
import { LockstepSession } from '../../src/net/lockstep.js';

const mix = (x, v) => (Math.imul((x ^ (v | 0)) >>> 0, 16777619) ^ (x >>> 13)) >>> 0;

/**
 * Tiny deterministic sim with the lockstep sim interface. Every applied command changes the state,
 * so a command applied on a different tick (or not at all) changes every later hash.
 */
export class ToySim {
  constructor(seed = 'toy', { blob = 0 } = {}) {
    this.tick = 0;
    this.x = hashString(seed);
    this.queue = [];
    this.applied = []; // [{ tick, ...cmd }] in apply order
    this.blob = blob ? 'é'.repeat(blob) : ''; // makes snapshots big (multi-byte: tests chunking)
    this.restores = 0;
  }

  validate(cmd) {
    if (cmd.bad) return { ok: false, reason: 'Toy says no', code: 'bad' };
    return { ok: true };
  }

  command(cmd) {
    const v = this.validate(cmd);
    if (v.ok) this.queue.push(cmd);
    return v;
  }

  step() {
    for (const c of this.queue) {
      this.x = mix(this.x, hashString(JSON.stringify(c)));
      this.applied.push({ tick: this.tick, ...c });
    }
    this.queue = [];
    this.x = mix(this.x, this.tick);
    this.tick++;
  }

  hash() {
    return this.x.toString(16).padStart(8, '0');
  }

  snapshot() {
    return { tick: this.tick, x: this.x, applied: this.applied.map((a) => ({ ...a })), blob: this.blob };
  }

  restore(s) {
    this.tick = s.tick;
    this.x = s.x;
    this.applied = s.applied.map((a) => ({ ...a }));
    this.blob = s.blob;
    this.queue = [];
    this.restores++;
  }
}

/**
 * Wrap a sim so every `every` ticks its hash is recorded in `history` (tick -> hash), and every step
 * checks `guard()` (the confirmed tick) so a step past it is counted in `violations`.
 */
export function recorded(sim, every = 10) {
  const history = new Map();
  const w = {
    history,
    violations: 0,
    guard: null,
    inner: sim,
    get tick() { return sim.tick; },
    step() {
      if (w.guard && sim.tick >= w.guard()) w.violations++;
      sim.step();
      if (sim.tick % every === 0) history.set(sim.tick, sim.hash());
    },
    command: (c) => sim.command(c),
    validate: (c) => sim.validate(c),
    hash: () => sim.hash(),
    snapshot: () => sim.snapshot(),
    restore(s) {
      sim.restore(s);
      history.clear(); // states before the restore were (possibly) diverged
    },
  };
  return w;
}

/**
 * Build a room of n peers on a MemoryHub, each with its own (recorded) sim, and one LockstepSession
 * each. peer0 is the host.
 */
export async function lockstepRoom({ n = 3, net = {}, makeSim = (i) => new ToySim('room'), opts = {}, every = 10 } = {}) {
  const hub = new MemoryHub({ seed: 'room', ...net });
  const transports = [];
  for (let i = 0; i < n; i++) {
    const t = hub.transport(`peer${i}`);
    await t.join('ROOM', { name: `P${i}` });
    transports.push(t);
  }
  hub.advance(0); // presence settles
  const sims = [];
  const sessions = [];
  for (let i = 0; i < n; i++) {
    const sim = recorded(makeSim(i), every);
    const s = new LockstepSession({ transport: transports[i], hostId: 'peer0', sim, now: hub.clock, ...opts });
    if (i > 0) sim.guard = () => s.upTo;
    sims.push(sim);
    sessions.push(s);
  }
  return { hub, transports, sims, sessions };
}

/** Run `frames` frames of frameMs: the network moves, then every live session advances once. */
export function runFrames(hub, sessions, frames, { frameMs = 1000 / 60, steps = 1, onFrame } = {}) {
  for (let f = 0; f < frames; f++) {
    hub.advance(frameMs);
    for (const s of sessions) if (!s.ended) s.advance(steps);
    if (onFrame) onFrame(f);
  }
}

/** Ticks recorded by every sim, ascending. */
export function commonTicks(sims) {
  const [first, ...rest] = sims;
  return [...first.history.keys()].filter((t) => rest.every((s) => s.history.has(t))).sort((a, b) => a - b);
}

/** Ticks where some sim's recorded hash differs from the first sim's. */
export function hashMismatches(sims, fromTick = 0) {
  const bad = [];
  for (const t of commonTicks(sims)) {
    if (t < fromTick) continue;
    const h = sims[0].history.get(t);
    if (sims.some((s) => s.history.get(t) !== h)) bad.push(t);
  }
  return bad;
}

/** Record every event a session emits. */
export function recordEvents(session, names = ['desync', 'resync', 'peerJoined', 'peerLeft', 'hostLeft', 'stall', 'speed', 'paused', 'reject', 'start', 'error']) {
  const log = [];
  for (const name of names) session.on(name, (p) => log.push({ name, p }));
  log.of = (name) => log.filter((e) => e.name === name);
  return log;
}
