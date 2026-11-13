// Deterministic lockstep session (docs/multiplayer.md contract 3). Pure: no DOM, no Three.js.
//
// Every player runs the same deterministic sim; only commands travel. The host owns the clock:
//  - it stamps every command (its own too) with the tick it applies on: hostTick + delayTicks;
//  - every turnTicks ticks it broadcasts a numbered turn { seq, upTo, hostTick, cmds, speed, paused }
//    meaning "every command for ticks < upTo is known"; clients never step past upTo (they stall);
//  - turns are kept (last 600) so a client that sees a gap in seq asks { t: 'resend', from };
//  - every hashEvery ticks clients report sim.hash(); on a mismatch the host sends a chunked
//    snapshot and the client restores it, keeping the commands it already has for later ticks;
//  - late joiners and reconnects get the same snapshot (plus the pending commands).
//
// Tick convention: commands stamped for tick T are handed to sim.command() while sim.tick === T,
// right before the sim.step() that moves T -> T + 1. Between steps the sim's own queue is empty, so
// a snapshot taken between advance() calls never misses a command.
//
// Wire messages (all JSON):
//   client -> host  { t: 'cmd', cmd, cid, sess, prev?: [{ cid, cmd }] }  (prev: older unacknowledged ones)
//                   { t: 'hash', tick, hash, epoch }   { t: 'hi', seq, tick, need, sess }
//                   { t: 'resend', from }           { t: 'need', epoch, id?, missing? }
//   host -> all     { t: 'turn', seq, upTo, hostTick, cmds: [{ tick, cmd, from, cid }], speed, paused }
//                   { t: 'bye' } (the host closed its session: the match is over for everyone)
//   host -> one     { t: 'reject', cid, reason, code }   { t: 'ack', cid, tick }   { t: 'snap', id, part, of, data }
//   both ways       { t: 'ping', ts }   { t: 'pong', ts }
// The snapshot payload (JSON string split into 'snap' parts) is
//   { id, reason, tick, upTo, seq, hostTick, speed, paused, cmds: [{ tick, cmd, from, cid }], snap }
// Messages with any other `t` (for example the lobby's) are ignored, so the lobby and the session
// can share one transport.

import { CHUNK_BYTES, Reassembler, splitUtf8 } from './chunk.js';

/** Turns the host keeps for resends (contract: last 600 turns). */
export const TURNS_KEPT = 600;
/** A client missing more turns than this gets a snapshot instead of a resend burst. */
export const RESEND_MAX = 40;
/** Host hashes kept for comparison with late client reports. */
export const HASHES_KEPT = 64;
/** Allowed game speeds (host only). */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;

/** Out-of-order turns a client buffers at most (more means it is hopelessly behind: snapshot). */
export const BUFFER_MAX = TURNS_KEPT;
/** Older unacknowledged commands that ride along with a new one (keeps messages small). */
export const PREV_MAX = 16;
/** Client: executed commands kept this many ticks back, to replay after a rewinding snapshot. */
export const KEEP_TICKS = 3600;

const MSG_TYPES = new Set(['cmd', 'hash', 'hi', 'resend', 'need', 'turn', 'reject', 'ack', 'snap', 'ping', 'pong', 'bye']);
let sessCounter = 0;

/** JSON round trip: the host applies exactly what clients receive (-0 -> 0, undefined dropped). */
const wire = (v) => JSON.parse(JSON.stringify(v));

export class LockstepSession {
  /**
   * @param {object} o
   * @param {object} o.transport      contract 2 transport (already joined)
   * @param {string} o.hostId         peer id of the host
   * @param {object} o.sim            { step(), command(cmd), validate(cmd), hash(), snapshot(), restore(snap), tick }
   * @param {number} [o.turnTicks]    ticks between turns (6 = 10 turns per second)
   * @param {number} [o.delayTicks]   input delay in ticks (12 = 200 ms)
   * @param {number} [o.hashEvery]    hash check period in ticks (120 = 2 s)
   * @param {string[]} [o.peers]      peer ids expected in the match (default: transport.peers)
   * @param {object} [o.peerPids]     { peerId: pid }: the host forces cmd.pid from the sender's id
   * @param {boolean} [o.awaitSnapshot]  client only: the sim is not at the match state yet (late
   *                                  join / reload); wait for the host's snapshot before stepping
   * @param {number} [o.startTimeoutMs]  host waits this long for every expected peer's hello (15000)
   * @param {number} [o.maxCatchUp]   default max steps per advance() when a client is behind (30)
   * @param {number} [o.tickRate]     sim ticks per second (60)
   * @param {number} [o.hostGraceMs]  client: how long the host may be missing from presence before
   *                                  'hostLeft' (3000; a closing host says bye, which is immediate)
   * @param {()=>number} [o.now]      clock in ms (default performance.now / Date.now)
   * Timing knobs (ms, rarely changed): pingMs 1000, resendMs 400 (min gap between resend asks),
   * cmdRetryMs 600, cmdTimeoutMs 10000, snapTimeoutMs 3000, snapMinGapMs 500, keepAliveMs 500
   * (host sends a turn at least this often, also while paused), helloMs 1000, chunkBytes 48 KB.
   */
  constructor({
    transport, hostId, sim, turnTicks = 6, delayTicks = 12, hashEvery = 120, peers, peerPids,
    awaitSnapshot = false, startTimeoutMs = 15000, maxCatchUp = 30, tickRate = 60, now,
    pingMs = 1000, resendMs = 400, cmdRetryMs = 600, cmdTimeoutMs = 10000, snapTimeoutMs = 3000,
    snapMinGapMs = 500, keepAliveMs = 500, helloMs = 1000, chunkBytes = CHUNK_BYTES, sessionId,
    hostGraceMs = 3000,
  }) {
    if (!transport || !sim || !hostId) throw new Error('LockstepSession needs transport, hostId and sim');
    if (!(turnTicks >= 1) || !(delayTicks >= turnTicks) || !(hashEvery >= 1)) throw new Error('Bad lockstep timing (need delayTicks >= turnTicks >= 1)');
    this.transport = transport;
    this.hostId = hostId;
    this.id = transport.id;
    this.isHost = transport.id === hostId;
    this.sim = sim;
    this.turnTicks = turnTicks;
    this.delayTicks = delayTicks;
    this.hashEvery = hashEvery;
    this.maxCatchUp = maxCatchUp;
    this.tickRate = tickRate;
    this.now = now || (() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()));
    this.cfg = { pingMs, resendMs, cmdRetryMs, cmdTimeoutMs, snapTimeoutMs, snapMinGapMs, keepAliveMs, helloMs, chunkBytes, startTimeoutMs, hostGraceMs };
    this.peerPids = new Map(Object.entries(peerPids || {}));
    this.sess = sessionId || `${Math.floor(this.now())}-${++sessCounter}`;

    this.handlers = new Map();
    this.schedule = new Map(); // tick -> [{ tick, cmd, from, cid }]
    this.upTo = sim.tick; // confirmed: every command for ticks < upTo is known
    this.speed = 1;
    this.paused = false;
    this.ended = false;
    this.endReason = null;
    this.resyncs = 0;
    this.stalled = null; // { since, reason } while stalled
    this.rttMs = 0;
    this.lastPingAt = -Infinity;
    this.created = this.now();

    // present: who the transport reports right now; expected peers that are not there yet only
    // delay the host's start (waiting), they never count as present
    const current = Array.isArray(transport.peers) ? transport.peers.map((p) => p.id) : [];
    const initial = peers || current;
    this.present = new Set([...current, this.id]);
    this.seen = new Set(this.present);
    this.hostGoneAt = null; // client: when the host vanished from presence (grace period)

    if (this.isHost) {
      this.started = false;
      this.seq = 0;
      this.turns = []; // ring of the last TURNS_KEPT turn messages
      this.lastTurnAt = -Infinity;
      this.hashes = new Map(); // tick -> own hash
      this.snapId = 0;
      this.peerState = new Map();
      this.waiting = new Set(initial.filter((id) => id !== this.id));
      for (const id of this.waiting) this._ps(id);
    } else {
      this.ready = !awaitSnapshot;
      this.lastSeq = 0;
      this.buffered = new Map(); // seq -> turn (out of order or before the snapshot)
      this.hostTick = sim.tick;
      this.hostTickAt = this.now();
      this.lastTurnAt = this.now();
      this.lastResendAt = -Infinity;
      this.lastHelloAt = -Infinity;
      this.lastNeedAt = this.now();
      this.greeted = false; // host has answered (turn or snapshot)
      this.epoch = 0;
      this.nextCid = 1;
      this.pending = new Map(); // cid -> { cmd, firstAt } until the host's turn (or ack / reject) answers
      this.lastCmdSentAt = -Infinity;
      this.snapIn = new Reassembler();
      this._hello();
    }

    this._unsub = [
      transport.onMessage((data, from) => this._onMessage(data, from)),
      transport.onPeers((list) => this._onPeers(list)),
    ].filter((f) => typeof f === 'function');
  }

  // ------------------------------------------------------------------ public API ----------

  /** Current sim tick. */
  get tick() {
    return this.sim.tick;
  }

  /** Subscribe: 'start' | 'desync' | 'resync' | 'peerJoined' | 'peerLeft' | 'hostLeft' | 'stall' |
   *  'speed' | 'paused' | 'reject' | 'error'. Returns an unsubscribe function. */
  on(name, fn) {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  off(name, fn) {
    this.handlers.get(name)?.delete(fn);
  }

  /**
   * The local player's command (pid filled by the caller). Host: validated and stamped at
   * hostTick + delayTicks, returns the validation result plus { tick }. Client: sent to the host
   * (retried until acknowledged), returns { ok: true, pending: true, cid }; a host refusal arrives
   * later as a 'reject' event.
   */
  issue(cmd) {
    if (this.ended) return { ok: false, reason: 'Session ended', code: 'ended' };
    if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return { ok: false, reason: 'Bad command', code: 'bad' };
    if (this.isHost) {
      const r = this._hostAccept(cmd, this.id, null);
      if (!r.ok) this._emit('reject', { cmd, reason: r.reason, code: r.code });
      return r;
    }
    const cid = this.nextCid++;
    const t = this.now();
    this.pending.set(cid, { cmd: wire(cmd), firstAt: t });
    this._sendPending(t);
    return { ok: true, pending: true, cid };
  }

  /**
   * Run up to n sim steps (n from the caller's frame time x speed). Never steps past the confirmed
   * tick. A client that is behind the host steps up to maxSteps instead of n to catch up. Also
   * does the session housekeeping (pings, resends, retries), so call it every frame, even paused
   * (advance(0) is fine). Returns the number of steps done.
   */
  advance(n = 1, maxSteps = this.maxCatchUp) {
    this._housekeep();
    if (this.ended) return 0;
    n = Math.max(0, Math.floor(n));
    return this.isHost ? this._advanceHost(n) : this._advanceClient(n, Math.max(n, maxSteps));
  }

  /** Host only: game speed 0.5-3, carried in turns. */
  setSpeed(x) {
    if (!this.isHost) return false;
    const v = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(x) || 1));
    if (v === this.speed) return true;
    this.speed = v;
    this._emit('speed', v);
    if (this.started) this._emitTurn();
    return true;
  }

  /** Host only: pause / resume everyone. */
  setPaused(b) {
    if (!this.isHost) return false;
    const v = !!b;
    if (v === this.paused) return true;
    this.paused = v;
    this._emit('paused', v);
    if (this.started) this._emitTurn();
    return true;
  }

  /** Host only: (re)bind a peer id to a player id, e.g. after a reconnect under a new peer id. */
  mapPeer(peerId, pid) {
    this.peerPids.set(peerId, pid);
  }

  /** Swap the sim object (for example after the UI rebuilt the match). Keeps the schedule. */
  setSim(sim) {
    this.sim = sim;
  }

  get stats() {
    const tick = this.sim.tick;
    let lag = 0;
    if (!this.isHost) lag = Math.max(0, Math.round(this._estHostTick() - tick));
    return {
      tick,
      confirmedTick: this.upTo,
      lagTicks: lag,
      rttMs: Math.round(this.rttMs),
      resyncs: this.resyncs,
      hostTick: this.isHost ? tick : this.hostTick,
      stalled: !!this.stalled,
      speed: this.speed,
      paused: this.paused,
      peers: this.present.size,
    };
  }

  /**
   * Leave the session and stop listening to the transport (the transport itself stays open; its
   * owner closes it). A host tells everyone, so their sessions end with 'hostLeft' at once.
   */
  close() {
    if (this.ended && !this._unsub.length) return;
    if (this.isHost && !this.ended) this._send({ t: 'bye' });
    this._end('closed');
  }

  // ------------------------------------------------------------------ internals: shared -----

  _emit(name, payload) {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[lockstep] ${name} handler failed`, err); }
    }
  }

  _end(reason) {
    if (!this.ended) {
      this.ended = true;
      this.endReason = reason;
    }
    for (const u of this._unsub) u();
    this._unsub = [];
  }

  _send(msg, to) {
    try {
      this.transport.send(msg, to);
    } catch (err) {
      this._emit('error', { reason: 'send failed', error: err });
    }
  }

  _sendHost(msg) {
    this._send(msg, this.hostId);
  }

  _schedule(entry) {
    let list = this.schedule.get(entry.tick);
    if (!list) this.schedule.set(entry.tick, (list = []));
    list.push(entry);
  }

  /**
   * Hand the commands for the current tick to the sim, then step once. The host forgets them; a
   * client keeps executed commands for KEEP_TICKS, because a snapshot may rewind it to an earlier
   * tick and those commands must then apply again (the snapshot only carries ticks < its upTo).
   */
  _stepOnce() {
    const t = this.sim.tick;
    const list = this.schedule.get(t);
    if (list) {
      if (this.isHost) this.schedule.delete(t);
      for (const e of list) this.sim.command(e.cmd);
    }
    this.sim.step();
    if (!this.isHost && t % this.turnTicks === 0) {
      for (const k of this.schedule.keys()) if (k < t - KEEP_TICKS) this.schedule.delete(k);
    }
  }

  _stall(reason) {
    if (this.stalled) return;
    this.stalled = { since: this.now(), reason };
    this._emit('stall', { stalled: true, reason, tick: this.sim.tick });
  }

  _unstall() {
    if (!this.stalled) return;
    const ms = this.now() - this.stalled.since;
    const reason = this.stalled.reason;
    this.stalled = null;
    this._emit('stall', { stalled: false, reason, tick: this.sim.tick, ms });
  }

  _rtt(sample, prev) {
    return prev > 0 ? prev * 0.75 + sample * 0.25 : sample;
  }

  _onPeers(list) {
    if (this.ended || !Array.isArray(list)) return;
    const now = new Set(list.map((p) => p?.id).filter((id) => typeof id === 'string'));
    now.add(this.id);
    for (const id of now) {
      if (this.present.has(id)) continue;
      this.present.add(id);
      const returning = this.seen.has(id);
      this.seen.add(id);
      if (id === this.hostId) this.hostGoneAt = null; // the host came back within the grace period
      this._emit('peerJoined', { id, returning });
      if (this.isHost) this._hostPeerJoined(id);
    }
    for (const id of [...this.present]) {
      if (now.has(id)) continue;
      this.present.delete(id);
      this._emit('peerLeft', { id });
      if (this.isHost) {
        this.waiting.delete(id);
      } else if (id === this.hostId) {
        this.hostGoneAt = this.now();
        if (this.cfg.hostGraceMs <= 0) { this._hostLeft('presence'); return; }
      }
    }
  }

  /** Client: the host is gone for good. No host migration: the match is over. */
  _hostLeft(reason) {
    if (this.ended) return;
    this._unstall();
    this._emit('hostLeft', { id: this.hostId, reason });
    this._end('hostLeft');
  }

  _onMessage(m, from) {
    if (this.ended || !m || typeof m !== 'object' || !MSG_TYPES.has(m.t) || typeof from !== 'string') return;
    if (m.t === 'ping') { this._send({ t: 'pong', ts: m.ts }, from); return; }
    if (this.isHost) this._hostMessage(m, from);
    else if (from === this.hostId) this._clientMessage(m);
  }

  _housekeep() {
    if (this.ended) return;
    const t = this.now();
    if (!this.isHost && this.hostGoneAt !== null && t - this.hostGoneAt >= this.cfg.hostGraceMs) {
      this._hostLeft('presence');
      return;
    }
    if (t - this.lastPingAt >= this.cfg.pingMs) {
      this.lastPingAt = t;
      if (this.isHost) { if (this.present.size > 1) this._send({ t: 'ping', ts: t }); } else this._sendHost({ t: 'ping', ts: t });
    }
    if (this.isHost) this._hostHousekeep(t); else this._clientHousekeep(t);
  }

  // ------------------------------------------------------------------ internals: host -------

  _ps(id) {
    let ps = this.peerState.get(id);
    if (!ps) {
      // results: cid -> answer (dedupes command retries); epoch: id of the last snapshot sent;
      // snapSess: the peer's session id when that snapshot went out; hashes: early client reports
      ps = {
        rtt: 0, results: new Map(), sess: null, epoch: 0, snapAt: -Infinity, snapWanted: null,
        snapReason: null, snapSess: null, snapOut: null, hashes: new Map(), greeted: false,
      };
      this.peerState.set(id, ps);
    }
    return ps;
  }

  _advanceHost(n) {
    if (!this.started) {
      if (this.waiting.size && this.now() - this.created < this.cfg.startTimeoutMs) {
        this._stall('waiting');
        return 0;
      }
      this._start();
    }
    if (this.paused) return 0;
    for (let i = 0; i < n; i++) this._hostStep();
    return n;
  }

  _start() {
    this.started = true;
    this.waiting.clear();
    this._unstall();
    this._emitTurn();
    this._emit('start', { tick: this.sim.tick });
  }

  _hostStep() {
    this._stepOnce();
    const t = this.sim.tick;
    if (t % this.hashEvery === 0) {
      const h = this.sim.hash();
      this.hashes.set(t, h);
      if (this.hashes.size > HASHES_KEPT) this.hashes.delete(this.hashes.keys().next().value);
      for (const [id, ps] of this.peerState) {
        const theirs = ps.hashes.get(t);
        if (theirs !== undefined) { ps.hashes.delete(t); this._compareHash(id, ps, t, theirs, h); }
      }
    }
    if (t % this.turnTicks === 0) this._emitTurn();
  }

  /** Broadcast the next turn: commands for ticks [previous upTo, hostTick + delayTicks). */
  _emitTurn() {
    const h = this.sim.tick;
    const upTo = Math.max(this.upTo, h + this.delayTicks);
    const cmds = [];
    for (let k = this.upTo; k < upTo; k++) {
      const list = this.schedule.get(k);
      if (list) for (const e of list) cmds.push(e);
    }
    this.upTo = upTo;
    const turn = { t: 'turn', seq: ++this.seq, upTo, hostTick: h, cmds, speed: this.speed, paused: this.paused };
    this.turns.push(turn);
    if (this.turns.length > TURNS_KEPT) this.turns.shift();
    this.lastTurnAt = this.now();
    if (this.present.size > 1) this._send(turn);
  }

  /** Validate and stamp a command (host's own or a client's). */
  _hostAccept(cmd, from, cid) {
    const c = wire(cmd);
    const pid = this.peerPids.get(from);
    if (pid !== undefined) c.pid = pid; // a client can only command its own player
    let v;
    try {
      v = this.sim.validate(c) || { ok: false, reason: 'Invalid command' };
    } catch (err) {
      v = { ok: false, reason: 'Invalid command', code: 'bad' };
    }
    if (!v.ok) return { ok: false, reason: v.reason || 'Rejected', code: v.code || 'rejected' };
    // never stamp a tick that was already confirmed (upTo can run ahead after a pause/speed turn)
    const tick = Math.max(this.sim.tick + this.delayTicks, this.upTo);
    this._schedule({ tick, cmd: c, from, cid });
    return { ok: true, tick };
  }

  _hostMessage(m, from) {
    const ps = this._ps(from);
    switch (m.t) {
      case 'cmd': {
        if (m.sess !== ps.sess) { ps.sess = m.sess; ps.results.clear(); }
        // earlier unacknowledged commands ride along (prev), so a lost message never reorders a
        // player's commands: handle them first, in issue order
        const list = Array.isArray(m.prev) ? m.prev.slice(0, PREV_MAX) : [];
        list.push({ cid: m.cid, cmd: m.cmd });
        list.sort((a, b) => a.cid - b.cid);
        for (const e of list) if (e && Number.isInteger(e.cid)) this._hostCommand(from, ps, e.cid, e.cmd);
        break;
      }
      case 'hash': {
        if (!Number.isInteger(m.tick) || (typeof m.hash !== 'string' && typeof m.hash !== 'number')) return;
        if (m.epoch !== ps.epoch) {
          // still reporting from before the last snapshot: if that is too old, the snapshot was lost
          if (ps.epoch > 0 && this.now() - ps.snapAt > this.cfg.snapTimeoutMs) this._wantSnapshot(from, ps.snapReason || 'desync');
          return;
        }
        ps.snapOut = null; // the client runs on the last snapshot: no more part resends needed
        const ours = this.hashes.get(m.tick);
        if (ours !== undefined) this._compareHash(from, ps, m.tick, m.hash, ours);
        else if (m.tick > this.sim.tick) {
          ps.hashes.set(m.tick, m.hash);
          if (ps.hashes.size > 8) ps.hashes.delete(ps.hashes.keys().next().value);
        }
        break;
      }
      case 'hi': {
        const first = !ps.greeted;
        ps.greeted = true;
        if (m.sess !== ps.sess) { ps.sess = m.sess; ps.results.clear(); }
        this.waiting.delete(from);
        if (!this.started) return;
        if (m.need) {
          // the presence path may already have sent this very session a snapshot; a snapshot sent
          // before the peer's session existed (other sess) was lost, so send another
          const fresh = ps.snapSess === ps.sess && this.now() - ps.snapAt < this.cfg.snapTimeoutMs;
          if (!fresh) this._wantSnapshot(from, 'join');
        } else if (first || (Number.isInteger(m.seq) && m.seq < this.seq)) {
          this._resend(from, (m.seq | 0) + 1);
        }
        break;
      }
      case 'resend': this._resend(from, m.from | 0); break;
      case 'need': {
        // parts of the snapshot in flight got lost: send just those again
        const out = ps.snapOut;
        if (out && m.id === out.id && Array.isArray(m.missing) && m.missing.length) {
          for (const i of m.missing.slice(0, out.parts.length)) {
            if (Number.isInteger(i) && i >= 0 && i < out.parts.length) this._send({ t: 'snap', id: out.id, part: i, of: out.parts.length, data: out.parts[i] }, from);
          }
          ps.snapAt = this.now(); // the transfer is alive
          return;
        }
        // nothing usable in flight (lost entirely, restore failed, late joiner): a fresh snapshot,
        // keeping the reason of an unconfirmed one so the client still reports a desync as such
        const unconfirmed = Number.isInteger(m.epoch) && m.epoch < ps.epoch;
        this._wantSnapshot(from, unconfirmed && ps.snapReason ? ps.snapReason : 'need');
        break;
      }
      case 'pong': if (Number.isFinite(m.ts)) ps.rtt = this._rtt(Math.max(0, this.now() - m.ts), ps.rtt); this._hostRtt(); break;
      default: break;
    }
  }

  /** One client command (cid unique per client session): validate + stamp once, answer retries. */
  _hostCommand(from, ps, cid, cmd) {
    const prev = ps.results.get(cid);
    if (prev) { // a retry: answer again, never schedule twice
      if (prev.ok) this._send({ t: 'ack', cid, tick: prev.tick }, from);
      else this._send({ t: 'reject', cid, reason: prev.reason, code: prev.code }, from);
      return;
    }
    let r;
    if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') r = { ok: false, reason: 'Bad command', code: 'bad' };
    else if (this.peerPids.size && !this.peerPids.has(from)) r = { ok: false, reason: 'Not a player in this match', code: 'player' };
    else r = this._hostAccept(cmd, from, cid);
    ps.results.set(cid, r);
    if (ps.results.size > 512) ps.results.delete(ps.results.keys().next().value);
    if (!r.ok) this._send({ t: 'reject', cid, reason: r.reason, code: r.code }, from);
  }

  _hostRtt() {
    let max = 0;
    for (const [id, ps] of this.peerState) if (this.present.has(id)) max = Math.max(max, ps.rtt);
    this.rttMs = max;
  }

  _compareHash(peer, ps, tick, theirs, ours) {
    if (theirs === ours) return;
    this._emit('desync', { peer, tick, ours, theirs });
    this._wantSnapshot(peer, 'desync');
  }

  _resend(peer, from) {
    if (!this.started || from > this.seq) return;
    const oldest = this.turns.length ? this.turns[0].seq : this.seq + 1;
    if (from < oldest) { this._wantSnapshot(peer, 'gap'); return; }
    // more than RESEND_MAX turns would be a burst that relay rate limits drop: a snapshot is one
    // (chunked) message and catches the peer up just as well
    if (this.seq - from + 1 > RESEND_MAX) { this._wantSnapshot(peer, 'gap'); return; }
    for (const turn of this.turns) if (turn.seq >= from) this._send(turn, peer);
  }

  _hostPeerJoined(id) {
    // before the start every peer simply says hello; during the match a new or returning peer
    // (late join, reconnect) gets the current state right away
    if (!this.started) return;
    this._ps(id).greeted = false;
    this._wantSnapshot(id, 'join');
  }

  _wantSnapshot(peer, reason) {
    const ps = this._ps(peer);
    ps.snapWanted = ps.snapWanted === 'desync' ? 'desync' : reason;
    this._flushSnapshot(peer, ps);
  }

  _flushSnapshot(peer, ps) {
    if (!ps.snapWanted || !this.started || !this.present.has(peer)) return;
    if (this.now() - ps.snapAt < this.cfg.snapMinGapMs) return; // throttled: housekeeping retries
    if (typeof this.sim.snapshot !== 'function') {
      ps.snapWanted = null;
      this._emit('error', { reason: 'sim has no snapshot(): cannot resync', peer });
      return;
    }
    const reason = ps.snapWanted;
    ps.snapWanted = null;
    let snap;
    try {
      snap = this.sim.snapshot();
    } catch (err) {
      this._emit('error', { reason: 'snapshot failed', peer, error: err });
      return;
    }
    const tick = this.sim.tick;
    const cmds = [];
    for (let k = tick; k < this.upTo; k++) {
      const list = this.schedule.get(k);
      if (list) for (const e of list) cmds.push(e);
    }
    const id = ++this.snapId;
    const payload = { id, reason, tick, upTo: this.upTo, seq: this.seq, hostTick: tick, speed: this.speed, paused: this.paused, cmds, snap };
    const parts = splitUtf8(JSON.stringify(payload), this.cfg.chunkBytes);
    for (let i = 0; i < parts.length; i++) this._send({ t: 'snap', id, part: i, of: parts.length, data: parts[i] }, peer);
    ps.snapOut = { id, parts }; // kept for resending lost parts until the client confirms
    ps.epoch = id;
    ps.snapAt = this.now();
    ps.snapReason = reason;
    ps.snapSess = ps.sess;
    ps.hashes.clear();
    if (reason === 'desync') this.resyncs++;
  }

  _hostHousekeep(t) {
    if (!this.started) return;
    if (t - this.lastTurnAt >= this.cfg.keepAliveMs) this._emitTurn(); // paused / slow host: keep clients informed
    for (const [id, ps] of this.peerState) if (ps.snapWanted) this._flushSnapshot(id, ps);
  }

  // ------------------------------------------------------------------ internals: client -----

  _hello() {
    this.lastHelloAt = this.now();
    this._sendHost({ t: 'hi', seq: this.lastSeq, tick: this.sim.tick, need: !this.ready, sess: this.sess });
  }

  /** Where the host probably is now: last reported host tick + time since, capped at upTo. */
  _estHostTick() {
    if (this.paused) return this.hostTick;
    const dt = (this.now() - this.hostTickAt) / 1000;
    return Math.min(this.upTo, this.hostTick + dt * this.tickRate * this.speed);
  }

  _advanceClient(n, maxSteps) {
    if (!this.ready) { this._stall('snapshot'); return 0; }
    const tick = this.sim.tick;
    let want;
    let limit = this.upTo;
    if (this.paused) {
      // paused: only catch up to where the host stopped
      limit = Math.min(limit, this.hostTick);
      want = Math.min(maxSteps, Math.max(0, this.hostTick - tick));
    } else {
      want = n;
      const lag = this._estHostTick() - tick;
      if (lag > 2 * this.turnTicks) want = Math.max(n, Math.min(maxSteps, Math.floor(lag - this.turnTicks)));
    }
    const steps = Math.max(0, Math.min(want, limit - tick));
    for (let i = 0; i < steps; i++) this._clientStep();
    if (steps < want && !this.paused) this._stall('turns');
    else if (steps > 0 || this.paused) this._unstall();
    return steps;
  }

  _clientStep() {
    this._stepOnce();
    const t = this.sim.tick;
    if (t % this.hashEvery === 0) this._sendHost({ t: 'hash', tick: t, hash: this.sim.hash(), epoch: this.epoch });
  }

  _clientMessage(m) {
    switch (m.t) {
      case 'turn': this._onTurn(m); break;
      case 'reject': {
        const p = this.pending.get(m.cid);
        if (!p) return;
        this.pending.delete(m.cid);
        this._emit('reject', { cmd: p.cmd, cid: m.cid, reason: m.reason, code: m.code });
        break;
      }
      case 'ack': this.pending.delete(m.cid); break;
      case 'snap': {
        if (!Number.isInteger(m.id) || m.id <= this.epoch) return;
        const whole = this.snapIn.add(m, this.now());
        if (whole !== null) this._onSnapshot(whole);
        break;
      }
      case 'pong': if (Number.isFinite(m.ts)) this.rttMs = this._rtt(Math.max(0, this.now() - m.ts), this.rttMs); break;
      case 'bye': this._hostLeft('bye'); break;
      default: break;
    }
  }

  _onTurn(turn) {
    if (!Number.isInteger(turn.seq) || !Number.isInteger(turn.upTo) || !Array.isArray(turn.cmds)) return;
    this.greeted = true;
    this.lastTurnAt = this.now();
    if (turn.seq <= this.lastSeq) return; // duplicate (resend overlap)
    if (!this.ready || turn.seq > this.lastSeq + 1) {
      this.buffered.set(turn.seq, turn);
      if (this.buffered.size > BUFFER_MAX) {
        // far too much is missing: drop the oldest buffered turn; a resend or snapshot fills in
        this.buffered.delete(Math.min(...this.buffered.keys()));
      }
      if (this.ready) this._askResend();
      return;
    }
    this._applyTurn(turn);
    this._drainBuffered();
  }

  _drainBuffered() {
    for (let next = this.buffered.get(this.lastSeq + 1); next; next = this.buffered.get(this.lastSeq + 1)) {
      this.buffered.delete(next.seq);
      this._applyTurn(next);
    }
    for (const s of this.buffered.keys()) if (s <= this.lastSeq) this.buffered.delete(s);
  }

  _applyTurn(turn) {
    this.lastSeq = turn.seq;
    const now = this.sim.tick;
    for (const e of turn.cmds) {
      if (!e || !Number.isInteger(e.tick) || !e.cmd) continue;
      if (e.from === this.id) this.pending.delete(e.cid);
      if (e.tick < now) continue; // already part of a restored snapshot
      this._schedule(e);
    }
    this.upTo = Math.max(this.upTo, turn.upTo);
    if (Number.isInteger(turn.hostTick) && turn.hostTick >= this.hostTick) {
      this.hostTick = turn.hostTick;
      this.hostTickAt = this.now();
    }
    this._follow(turn.speed, turn.paused);
  }

  _follow(speed, paused) {
    if (Number.isFinite(speed) && speed !== this.speed) { this.speed = speed; this._emit('speed', speed); }
    if (typeof paused === 'boolean' && paused !== this.paused) { this.paused = paused; this._emit('paused', paused); }
  }

  _askResend() {
    const t = this.now();
    if (t - this.lastResendAt < this.cfg.resendMs) return;
    this.lastResendAt = t;
    this._sendHost({ t: 'resend', from: this.lastSeq + 1 });
  }

  _onSnapshot(text) {
    let p;
    try {
      p = JSON.parse(text);
    } catch {
      return;
    }
    if (!p || !Number.isInteger(p.id) || p.id <= this.epoch || !Number.isInteger(p.tick)) return;
    try {
      this.sim.restore(p.snap);
    } catch (err) {
      this._emit('error', { reason: 'restore failed', error: err });
      this._sendHost({ t: 'need', epoch: this.epoch });
      return;
    }
    this.epoch = p.id;
    this.greeted = true;
    // keep commands for ticks the snapshot does not cover; the snapshot's own list replaces the rest
    for (const k of [...this.schedule.keys()]) if (k < p.upTo) this.schedule.delete(k);
    for (const e of p.cmds || []) {
      if (e.from === this.id) this.pending.delete(e.cid);
      if (e.tick >= p.tick) this._schedule(e);
    }
    this.upTo = Math.max(this.upTo, p.upTo);
    if (p.seq >= this.lastSeq) {
      this.lastSeq = p.seq;
      this.hostTick = p.hostTick;
      this.hostTickAt = this.now();
      this._follow(p.speed, p.paused);
    }
    this.ready = true;
    this._drainBuffered();
    if (this.buffered.size) this._askResend();
    this.resyncs++;
    if (p.reason === 'desync') this._emit('desync', { tick: p.tick });
    this._emit('resync', { tick: p.tick, reason: p.reason });
    this._unstall();
  }

  _clientHousekeep(t) {
    if (!this.greeted && t - this.lastHelloAt >= this.cfg.helloMs) this._hello();
    // stalled at the confirmed tick with no news, or holding out-of-order turns: ask again
    if (this.ready && this.greeted && (this.buffered.size || (this.sim.tick >= this.upTo && t - this.lastTurnAt >= this.cfg.resendMs))) this._askResend();
    // a snapshot whose parts stopped arriving: ask for exactly the missing ones
    const partWait = Math.max(this.cfg.resendMs, this.rttMs * 1.5);
    if (this.snapIn.pending) {
      if (t - this.snapIn.lastAt > partWait && t - this.lastNeedAt > partWait) {
        this.lastNeedAt = t;
        this._sendHost({ t: 'need', id: this.snapIn.id, missing: this.snapIn.missing(), epoch: this.epoch });
      }
    } else if (!this.ready && t - this.lastNeedAt > this.cfg.snapTimeoutMs) {
      // a late joiner still waiting for its first snapshot
      this.lastNeedAt = t;
      this._sendHost({ t: 'need', epoch: this.epoch });
    }
    // unacknowledged commands: give up after cmdTimeoutMs, otherwise resend them all together
    for (const [cid, p] of this.pending) {
      if (t - p.firstAt <= this.cfg.cmdTimeoutMs) continue;
      this.pending.delete(cid);
      this._emit('reject', { cmd: p.cmd, cid, reason: 'No answer from the host', code: 'timeout' });
    }
    if (this.pending.size && t - this.lastCmdSentAt >= Math.max(this.cfg.cmdRetryMs, this.rttMs * 2)) this._sendPending(t);
  }

  /**
   * Send the newest pending command with every older unacknowledged one riding along (prev), so the
   * host always sees a player's commands in issue order even when a message is lost.
   */
  _sendPending(t) {
    // Map keeps insertion (= cid) order; the oldest batch goes first, newer ones follow once acked
    const batch = [...this.pending.entries()].slice(0, PREV_MAX + 1);
    if (!batch.length) return;
    const [cid, last] = batch[batch.length - 1];
    const prev = batch.slice(0, -1).map(([c, p]) => ({ cid: c, cmd: p.cmd }));
    const msg = { t: 'cmd', cmd: last.cmd, cid, sess: this.sess };
    if (prev.length) msg.prev = prev;
    this.lastCmdSentAt = t;
    this._sendHost(msg);
  }
}

/**
 * Wrap a Match (src/sim/match.js) as a lockstep sim. restore() needs a fresh Match, so the caller
 * passes rebuild(snap) (typically `(s) => Match.restore(s, { content, mapWorld: buildMapWorld(map, content.props) })`)
 * and gets onReplace(newMatch, oldMatch) to rebind the view and HUD.
 */
export function matchSim(match, { rebuild, onReplace } = {}) {
  return {
    match,
    get tick() { return this.match.tick; },
    step() { this.match.step(); },
    command(cmd) { return this.match.command(cmd); },
    validate(cmd) { return this.match.validate(cmd); },
    hash() { return this.match.hash(); },
    snapshot() {
      if (typeof this.match.snapshot !== 'function') throw new Error('Match.snapshot() is not available');
      return this.match.snapshot();
    },
    restore(snap) {
      if (!rebuild) throw new Error('matchSim: no rebuild(snap) given');
      const old = this.match;
      this.match = rebuild(snap);
      if (onReplace) onReplace(this.match, old);
    },
  };
}
