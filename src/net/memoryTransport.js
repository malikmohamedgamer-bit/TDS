// In-memory transport for tests and tools: a virtual network with configurable latency, jitter,
// message drop and (optionally) reordering, driven by a virtual clock so tests are fast and fully
// deterministic (seeded). Implements the transport contract (docs/multiplayer.md contract 2) plus
// test helpers. Pure: no DOM, no real timers.
//
//   const hub = new MemoryHub({ latency: [20, 300], jitter: 40, drop: 0.02, seed: 'x' });
//   const a = hub.transport('a'); await a.join('ROOM', { name: 'A' });
//   hub.advance(16);   // moves virtual time 16 ms, delivering due messages and running due timers

import { Rng } from '../core/rng.js';

let autoId = 0;

/** A virtual network shared by every MemoryTransport it creates. */
export class MemoryHub {
  /**
   * @param {object} [o]
   * @param {[number, number]} [o.latency]  one-way base latency range in ms; every directed link
   *                                        (a -> b) gets a fixed base picked from it
   * @param {number} [o.jitter]             extra random delay 0..jitter ms per message
   * @param {number} [o.drop]               probability 0..1 that a message is lost
   * @param {boolean} [o.ordered]           true (default): FIFO per link, like WebSocket and
   *                                        BroadcastChannel; false: jitter may reorder messages
   * @param {string} [o.seed]               seed for latency, jitter and drop decisions
   */
  constructor({ latency = [20, 60], jitter = 0, drop = 0, ordered = true, seed = 'memory-net' } = {}) {
    this.latency = latency;
    this.jitter = jitter;
    this.drop = drop;
    this.ordered = ordered;
    this.rng = new Rng(`${seed}:net`);
    this.now = 0;
    this.rooms = new Map(); // room -> Map(id -> transport)
    this.links = new Map(); // 'a>b' -> { base, last }
    this.queue = []; // sorted by (at, seq)
    this.seq = 0;
    this.timerId = 0;
    this.timerObjs = new Map();
    /** Optional test hook: (data, from, to) => false drops that message. */
    this.filter = null;
    this.stats = { sent: 0, dropped: 0, delivered: 0 };
    // timer functions bound to virtual time, for injecting into Lobby / transports
    this.timers = {
      setTimeout: (fn, ms) => this.setTimeout(fn, ms),
      clearTimeout: (h) => this.clearTimeout(h),
      setInterval: (fn, ms) => this.setInterval(fn, ms),
      clearInterval: (h) => this.clearTimeout(h),
    };
    this.clock = () => this.now;
  }

  /** Create a transport on this network. */
  transport(id) {
    return new MemoryTransport(this, id ?? `m${++autoId}`);
  }

  // ------------------------------------------------------------- virtual clock --------
  _schedule(at, fn, timer = null) {
    const ev = { at, seq: ++this.seq, fn, timer };
    // binary search insert keeps the queue sorted by (at, seq)
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const q = this.queue[mid];
      if (q.at < at || (q.at === at && q.seq < ev.seq)) lo = mid + 1; else hi = mid;
    }
    this.queue.splice(lo, 0, ev);
    return ev;
  }

  /** One-shot virtual timer. Returns a handle for clearTimeout. */
  setTimeout(fn, ms = 0) {
    const timer = { id: ++this.timerId, cancelled: false };
    this.timerObjs.set(timer.id, timer);
    this._schedule(this.now + Math.max(0, ms), () => { this.timerObjs.delete(timer.id); fn(); }, timer);
    return timer.id;
  }

  /** Repeating virtual timer. Returns a handle; clearTimeout / clearInterval stops it. */
  setInterval(fn, ms) {
    const period = Math.max(1, ms);
    const timer = { id: ++this.timerId, cancelled: false };
    this.timerObjs.set(timer.id, timer);
    const run = () => {
      this._schedule(this.now + period, run, timer);
      fn();
    };
    this._schedule(this.now + period, run, timer);
    return timer.id;
  }

  clearTimeout(handle) {
    const t = this.timerObjs.get(handle);
    if (t) { t.cancelled = true; this.timerObjs.delete(handle); }
  }

  /** Move virtual time forward by ms, running every message delivery and timer that falls due. */
  advance(ms) {
    const target = this.now + ms;
    while (this.queue.length && this.queue[0].at <= target) {
      const ev = this.queue.shift();
      this.now = Math.max(this.now, ev.at);
      if (ev.timer?.cancelled) continue;
      ev.fn();
    }
    this.now = target;
  }

  /** Run until nothing is queued (or maxMs elapse). Useful to settle presence and messages. */
  settle(maxMs = 10000) {
    const end = this.now + maxMs;
    while (this.queue.length && this.queue[0].at <= end) this.advance(this.queue[0].at - this.now);
  }

  // ------------------------------------------------------------- rooms and messages ---
  _members(room) {
    let m = this.rooms.get(room);
    if (!m) this.rooms.set(room, (m = new Map()));
    return m;
  }

  _peerList(room) {
    return [...this._members(room).values()].map((t) => ({ id: t.id, meta: t.meta, joinedAt: t.joinedAt }));
  }

  /** Presence changes reach every member right away (on the next clock run). */
  _presence(room) {
    this._schedule(this.now, () => {
      const list = this._peerList(room);
      for (const t of this._members(room).values()) t._emitPeers(list.map((p) => ({ ...p })));
    });
  }

  _link(from, to) {
    const key = `${from}>${to}`;
    let l = this.links.get(key);
    if (!l) {
      const [lo, hi] = this.latency;
      l = { base: lo + this.rng.next() * (hi - lo), last: 0 };
      this.links.set(key, l);
    }
    return l;
  }

  _send(from, room, data, to) {
    const members = this._members(room);
    const targets = to != null ? [members.get(to)].filter(Boolean) : [...members.values()].filter((t) => t.id !== from.id);
    let wire;
    try {
      wire = JSON.stringify(data); // simulate serialisation: what is not JSON does not arrive
    } catch {
      return;
    }
    for (const t of targets) {
      this.stats.sent++;
      if (this.filter && this.filter(data, from.id, t.id) === false) { this.stats.dropped++; continue; }
      if (this.drop > 0 && this.rng.next() < this.drop) { this.stats.dropped++; continue; }
      const l = this._link(from.id, t.id);
      let at = this.now + l.base + (this.jitter > 0 ? this.rng.next() * this.jitter : 0);
      if (this.ordered) at = Math.max(at, l.last);
      l.last = at;
      this._schedule(at, () => {
        // delivered only if both ends are still in the same room
        if (t.room !== room || !members.has(t.id)) return;
        this.stats.delivered++;
        t._emitMessage(JSON.parse(wire), from.id);
      });
    }
  }
}

/** Transport over a MemoryHub. Same API as LocalTransport / RelayTransport. */
export class MemoryTransport {
  constructor(hub, id) {
    this.hub = hub;
    this.id = id;
    this.room = null;
    this.meta = null;
    this.joinedAt = 0;
    this.msgFns = new Set();
    this.peerFns = new Set();
    this.statusFns = new Set();
    this.lastPeers = [];
  }

  /** Current room members including self (empty before join). */
  get peers() {
    return this.lastPeers.map((p) => ({ ...p }));
  }

  async join(room, meta = {}) {
    if (this.room) this.close();
    this.room = String(room);
    this.meta = meta;
    this.joinedAt = this.hub.now;
    this.hub._members(this.room).set(this.id, this);
    this.lastPeers = this.hub._peerList(this.room);
    this.hub._presence(this.room);
    this._emitStatus('open');
  }

  send(data, to) {
    if (!this.room) return;
    this.hub._send(this, this.room, data, to);
  }

  onMessage(fn) { this.msgFns.add(fn); return () => this.msgFns.delete(fn); }
  onPeers(fn) { this.peerFns.add(fn); return () => this.peerFns.delete(fn); }
  onStatus(fn) { this.statusFns.add(fn); return () => this.statusFns.delete(fn); }

  close() {
    if (!this.room) return;
    const room = this.room;
    this.hub._members(room).delete(this.id);
    this.room = null;
    this.lastPeers = [];
    this.hub._presence(room);
    this._emitStatus('closed');
  }

  _emitMessage(data, from) { for (const fn of [...this.msgFns]) fn(data, from); }
  _emitPeers(list) { this.lastPeers = list; for (const fn of [...this.peerFns]) fn(list); }
  _emitStatus(s) { for (const fn of [...this.statusFns]) fn(s); }
}
