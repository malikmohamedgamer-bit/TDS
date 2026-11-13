// Network transports (docs/multiplayer.md contract 2). Every transport has the same small API:
//
//   transport.id                      own peer id (string)
//   await transport.join(room, meta)  meta: { name, hero, version, ... } (JSON)
//   transport.send(data, to?)         JSON data; broadcast to the room (not to self) or to one peer
//   transport.onMessage(fn)           fn(data, fromPeerId); returns an unsubscribe function
//   transport.onPeers(fn)             fn([{ id, meta, joinedAt }]) on every room change (includes self)
//   transport.onStatus(fn)            fn('connecting' | 'open' | 'closed' | 'error')
//   transport.peers                   last known member list (includes self)
//   transport.close()
//
// LocalTransport: BroadcastChannel (two tabs of one browser, Playwright pages of one context).
// RelayTransport: WebSocket to server/relay.mjs. SupabaseTransport lives in ./supabaseTransport.js and
// is loaded on demand by createTransport(). Transports never chunk: the session layer does that.
// No DOM access here (only the BroadcastChannel / WebSocket globals, which can be injected).

/** Random peer id: 10 base-36 characters from crypto when available. */
export function newPeerId() {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** Small listener set helper: add returns an unsubscribe function. */
class Emitter {
  constructor() { this.fns = new Set(); }
  add(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  emit(...args) {
    for (const fn of [...this.fns]) {
      try { fn(...args); } catch (err) { console.error('[net] listener failed', err); }
    }
  }
}

const sortPeers = (list) => list.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const defaultTimers = () => ({
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h),
});

// =================================================================================================
// LocalTransport
// =================================================================================================

/**
 * Same-browser transport over BroadcastChannel `tds:<room>`. Presence is a heartbeat every
 * heartbeatMs; a peer that has not been heard from for timeoutMs is gone. A closing tab says "bye"
 * so others drop it at once.
 *
 * Wire format on the channel: { k: 'hb', id, meta, joinedAt, ask? } | { k: 'bye', id } |
 * { k: 'm', from, to?, data }.
 */
export class LocalTransport {
  /**
   * @param {object} [o]
   * @param {string} [o.id]               peer id (default: random)
   * @param {number} [o.heartbeatMs]      1000
   * @param {number} [o.timeoutMs]        10000
   * @param {(name:string)=>object} [o.channelFactory]  BroadcastChannel stand-in (tests)
   * @param {object} [o.timers]           { setInterval, clearInterval } (tests)
   * @param {()=>number} [o.clock]        wall clock in ms (joinedAt must compare across tabs)
   */
  // timeoutMs: generous, because a busy or hidden tab can miss several heartbeats
  constructor({ id, heartbeatMs = 1000, timeoutMs = 10000, channelFactory, timers, clock } = {}) {
    this.id = id || newPeerId();
    this.heartbeatMs = heartbeatMs;
    this.timeoutMs = timeoutMs;
    this.channelFactory = channelFactory || ((name) => new globalThis.BroadcastChannel(name));
    this.timers = timers || defaultTimers();
    this.clock = clock || (() => Date.now());
    this.room = null;
    this.meta = null;
    this.joinedAt = 0;
    this.channel = null;
    this.members = new Map(); // id -> { id, meta, joinedAt, seen }
    this.msg = new Emitter();
    this.peerEv = new Emitter();
    this.statusEv = new Emitter();
    this.status = 'closed';
    this.hbTimer = null;
  }

  /** True when this environment can use LocalTransport. */
  static available() {
    return typeof globalThis.BroadcastChannel === 'function';
  }

  get peers() {
    return this._list();
  }

  async join(room, meta = {}) {
    if (this.channel) this.close();
    this.room = String(room);
    this.meta = meta;
    this.joinedAt = this.clock();
    this._setStatus('connecting');
    this.channel = this.channelFactory(`tds:${this.room}`);
    this.channel.onmessage = (e) => this._onRaw(e.data);
    this.members.clear();
    this.members.set(this.id, { id: this.id, meta, joinedAt: this.joinedAt, seen: Infinity });
    this._post({ k: 'hb', id: this.id, meta, joinedAt: this.joinedAt, ask: true }); // others answer at once
    this.hbTimer = this.timers.setInterval(() => this._beat(), this.heartbeatMs);
    this._setStatus('open');
    this.peerEv.emit(this._list());
  }

  send(data, to) {
    if (!this.channel) return;
    this._post(to != null ? { k: 'm', from: this.id, to, data } : { k: 'm', from: this.id, data });
  }

  onMessage(fn) { return this.msg.add(fn); }
  onPeers(fn) { return this.peerEv.add(fn); }
  onStatus(fn) { return this.statusEv.add(fn); }

  close() {
    if (!this.channel) return;
    this._post({ k: 'bye', id: this.id });
    this.timers.clearInterval(this.hbTimer);
    this.hbTimer = null;
    try { this.channel.close(); } catch { /* already closed */ }
    this.channel = null;
    this.members.clear();
    this._setStatus('closed');
  }

  _post(m) {
    try {
      this.channel.postMessage(m);
    } catch (err) {
      console.error('[net] BroadcastChannel post failed', err);
      this._setStatus('error');
    }
  }

  _beat() {
    this._post({ k: 'hb', id: this.id, meta: this.meta, joinedAt: this.joinedAt });
    const now = this.clock();
    let changed = false;
    for (const [id, p] of this.members) {
      if (id !== this.id && now - p.seen > this.timeoutMs) { this.members.delete(id); changed = true; }
    }
    if (changed) this.peerEv.emit(this._list());
  }

  _onRaw(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'hb' && typeof m.id === 'string' && m.id !== this.id) {
      const known = this.members.get(m.id);
      const metaChanged = known && JSON.stringify(known.meta) !== JSON.stringify(m.meta);
      this.members.set(m.id, { id: m.id, meta: m.meta, joinedAt: Number(m.joinedAt) || 0, seen: this.clock() });
      if (m.ask) this._post({ k: 'hb', id: this.id, meta: this.meta, joinedAt: this.joinedAt });
      if (!known || metaChanged) this.peerEv.emit(this._list());
    } else if (m.k === 'bye' && this.members.delete(m.id)) {
      this.peerEv.emit(this._list());
    } else if (m.k === 'm' && typeof m.from === 'string' && m.from !== this.id) {
      if (m.to != null && m.to !== this.id) return;
      // a message proves the sender is alive (covers a missed heartbeat)
      const p = this.members.get(m.from);
      if (p) p.seen = this.clock();
      this.msg.emit(m.data, m.from);
    }
  }

  _list() {
    return sortPeers([...this.members.values()].map(({ id, meta, joinedAt }) => ({ id, meta, joinedAt })));
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.statusEv.emit(s);
  }
}

// =================================================================================================
// RelayTransport
// =================================================================================================

/**
 * WebSocket transport to the relay server (server/relay.mjs). Protocol, JSON text frames:
 *   client -> server  { op: 'join', room, peer, meta } | { op: 'send', data, to? } | { op: 'ping', ts }
 *   server -> client  { op: 'joined', peer, peers: [{ id, meta, joinedAt }] } | { op: 'peers', peers }
 *                     { op: 'msg', from, data } | { op: 'error', code, message } | { op: 'pong', ts }
 * A lost socket is retried with backoff 1 s, 2 s, 4 s ... capped at 10 s, rejoining the same room with
 * the same peer id. While reconnecting, sends are queued (bounded) and flushed after the rejoin; the
 * peer list is not changed until the server reports it again, so a short drop does not look like
 * everyone leaving.
 */
export class RelayTransport {
  /**
   * @param {string} url  ws:// or wss:// address of the relay
   * @param {object} [o]
   * @param {string} [o.id]               peer id (default: random)
   * @param {Function} [o.WebSocket]      WebSocket constructor (default: the global one; tests inject a fake)
   * @param {number} [o.backoffMs]        first retry delay, doubled per failure (1000)
   * @param {number} [o.maxBackoffMs]     cap (10000)
   * @param {number} [o.pingMs]           app-level ping period (10000)
   * @param {number} [o.deadMs]           silence after which the socket is treated as dead (30000)
   * @param {number} [o.joinTimeoutMs]    the first join() rejects after this (15000)
   * @param {number} [o.queueMax]         sends kept while disconnected (256, oldest dropped)
   * @param {object} [o.timers]           { setTimeout, clearTimeout, setInterval, clearInterval }
   * @param {()=>number} [o.clock]
   */
  constructor(url, {
    id, WebSocket: WS, backoffMs = 1000, maxBackoffMs = 10000, pingMs = 10000, deadMs = 30000,
    joinTimeoutMs = 15000, queueMax = 256, timers, clock,
  } = {}) {
    this.url = url;
    this.id = id || newPeerId();
    this.WS = WS === undefined ? globalThis.WebSocket : WS; // null: explicitly none
    this.backoffMs = backoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.pingMs = pingMs;
    this.deadMs = deadMs;
    this.joinTimeoutMs = joinTimeoutMs;
    this.queueMax = queueMax;
    this.timers = timers || defaultTimers();
    this.clock = clock || (() => Date.now());
    this.room = null;
    this.meta = null;
    this.ws = null;
    this.joined = false; // joined on the current socket
    this.everJoined = false;
    this.closed = true;
    this.attempt = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.lastRx = 0;
    this.rttMs = 0;
    this.queue = [];
    this.lastPeers = [];
    this.status = 'closed';
    this.lastError = null;
    this.msg = new Emitter();
    this.peerEv = new Emitter();
    this.statusEv = new Emitter();
    this.errorEv = new Emitter();
    this._pendingJoin = null;
  }

  get peers() {
    return this.lastPeers.map((p) => ({ ...p }));
  }

  /** Resolves once the server confirmed the join; rejects on a server error or after joinTimeoutMs. */
  join(room, meta = {}) {
    if (!this.WS) return Promise.reject(new Error('WebSocket is not available'));
    if (!this.closed) this.close();
    this.room = String(room);
    this.meta = meta;
    this.closed = false;
    this.everJoined = false;
    this.attempt = 0;
    this.queue = [];
    return new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        if (!this._pendingJoin) return;
        this._pendingJoin = null;
        this.close();
        reject(Object.assign(new Error('Could not reach the relay server'), { code: 'timeout' }));
      }, this.joinTimeoutMs);
      this._pendingJoin = {
        resolve: (v) => { this.timers.clearTimeout(timer); resolve(v); },
        reject: (e) => { this.timers.clearTimeout(timer); reject(e); },
      };
      this._connect();
      this.pingTimer = this.timers.setInterval(() => this._keepAlive(), this.pingMs);
    });
  }

  send(data, to) {
    if (this.closed) return;
    const frame = to != null ? { op: 'send', data, to } : { op: 'send', data };
    if (this.joined && this.ws && this.ws.readyState === 1) {
      this._raw(frame);
    } else {
      this.queue.push(frame);
      if (this.queue.length > this.queueMax) this.queue.shift();
    }
  }

  onMessage(fn) { return this.msg.add(fn); }
  onPeers(fn) { return this.peerEv.add(fn); }
  onStatus(fn) { return this.statusEv.add(fn); }
  /** fn({ code, message }) for server errors (rate limits, full room, bad message). */
  onError(fn) { return this.errorEv.add(fn); }

  close() {
    if (this.closed && !this.ws) return;
    this.closed = true;
    this.joined = false;
    this.timers.clearTimeout(this.retryTimer);
    this.timers.clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.queue = [];
    this._detach(1000, 'bye');
    this._setStatus('closed');
    if (this._pendingJoin) {
      const p = this._pendingJoin;
      this._pendingJoin = null;
      p.reject(Object.assign(new Error('Closed before joining'), { code: 'closed' }));
    }
  }

  /** Forget the current socket: no more events from it, then close it. */
  _detach(code, reason) {
    const ws = this.ws;
    this.ws = null;
    this.joined = false;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(code, reason); } catch { /* already closed */ }
  }

  /** The socket is lost or unusable: drop it and reconnect with backoff (unless closed). */
  _lost() {
    this._detach(4000, 'reconnect');
    if (this.closed) return;
    this._setStatus('closed');
    this._scheduleRetry();
  }

  /** Delay before reconnect attempt n (0-based): 1 s, 2 s, 4 s, ... capped. */
  backoff(n) {
    return Math.min(this.maxBackoffMs, this.backoffMs * 2 ** n);
  }

  _connect() {
    if (this.closed) return;
    this._setStatus('connecting');
    let ws;
    try {
      ws = new this.WS(this.url);
    } catch (err) {
      this.lastError = { code: 'socket', message: String(err?.message || err) };
      this._setStatus('error');
      this._scheduleRetry();
      return;
    }
    this.ws = ws;
    this.joined = false;
    ws.onopen = () => {
      this.lastRx = this.clock();
      this._raw({ op: 'join', room: this.room, peer: this.id, meta: this.meta });
    };
    ws.onmessage = (e) => this._onFrame(e.data);
    ws.onerror = () => {
      this.lastError = { code: 'socket', message: 'WebSocket error' };
      this._setStatus('error');
    };
    ws.onclose = () => {
      if (this.ws === ws) this._lost();
    };
  }

  _scheduleRetry() {
    if (this.closed || this.retryTimer) return;
    const delay = this.backoff(this.attempt++);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      this._connect();
    }, delay);
  }

  _raw(frame) {
    try {
      this.ws.send(JSON.stringify(frame));
    } catch (err) {
      console.error('[net] relay send failed', err);
    }
  }

  _keepAlive() {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (this.clock() - this.lastRx > this.deadMs) {
      // no traffic and no pong for too long: the socket is half-dead, force a reconnect
      this._lost();
      return;
    }
    this._raw({ op: 'ping', ts: this.clock() });
  }

  _onFrame(raw) {
    let m;
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    this.lastRx = this.clock();
    switch (m.op) {
      case 'joined': {
        this.joined = true;
        this.everJoined = true;
        this.attempt = 0;
        this._setPeers(m.peers);
        this._setStatus('open');
        const q = this.queue;
        this.queue = [];
        for (const f of q) this._raw(f);
        if (this._pendingJoin) { const p = this._pendingJoin; this._pendingJoin = null; p.resolve(); }
        break;
      }
      case 'peers': this._setPeers(m.peers); break;
      case 'msg': if (typeof m.from === 'string' && m.from !== this.id) this.msg.emit(m.data, m.from); break;
      case 'pong': if (Number.isFinite(m.ts)) this.rttMs = Math.max(0, this.clock() - m.ts); break;
      case 'error': {
        const err = { code: String(m.code || 'error'), message: String(m.message || 'Relay error') };
        this.lastError = err;
        this.errorEv.emit(err);
        this._setStatus('error');
        if (!this.joined) {
          if (!this.everJoined) {
            // refused on the first join (room full, bad room code ...): retrying cannot help
            const p = this._pendingJoin;
            this._pendingJoin = null;
            this.close();
            this._setStatus('error');
            if (p) p.reject(Object.assign(new Error(err.message), { code: err.code }));
          } else {
            // refused while rejoining (for example our old connection still holds the seat until
            // the server notices it is dead): try again with backoff
            this._lost();
          }
        }
        break;
      }
      default: break;
    }
  }

  _setPeers(list) {
    const peers = Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string')
      .map((p) => ({ id: p.id, meta: p.meta ?? {}, joinedAt: Number(p.joinedAt) || 0 })) : [];
    if (!peers.some((p) => p.id === this.id)) peers.push({ id: this.id, meta: this.meta, joinedAt: this.clock() });
    this.lastPeers = sortPeers(peers);
    this.peerEv.emit(this.peers);
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.statusEv.emit(s);
  }
}

// =================================================================================================
// Choosing a transport (data/online.json + URL overrides)
// =================================================================================================

const KINDS = ['local', 'relay', 'supabase'];

/**
 * Which transport to use: `?net=local|relay|supabase` overrides `config.transport`; default 'local'.
 * @param {object} config  data/online.json
 * @param {string} [search] location.search
 */
export function transportKind(config = {}, search = '') {
  const q = new URLSearchParams(search || '');
  const forced = q.get('net');
  if (KINDS.includes(forced)) return forced;
  return KINDS.includes(config.transport) ? config.transport : 'local';
}

/** Relay URL: `?relay=wss://...` (ws/wss only) overrides `config.relayUrl`. */
export function relayUrl(config = {}, search = '') {
  const q = new URLSearchParams(search || '');
  const forced = q.get('relay');
  if (forced && /^wss?:\/\//i.test(forced)) return forced;
  return config.relayUrl || '';
}

/**
 * Build the configured transport. Supabase is imported lazily so its client only loads when used.
 * @param {object} config  data/online.json
 * @param {object} [o]
 * @param {string} [o.search]  location.search (default: the page's)
 * @param {string} [o.id]      peer id to reuse (keeps the same identity across a page reload)
 */
export async function createTransport(config = {}, { search = globalThis.location?.search ?? '', id } = {}) {
  const kind = transportKind(config, search);
  if (kind === 'relay') {
    const url = relayUrl(config, search);
    if (!url) throw new Error('No relay URL configured (data/online.json relayUrl or ?relay=wss://...)');
    return new RelayTransport(url, { id });
  }
  if (kind === 'supabase') {
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Supabase is not configured (data/online.json supabaseUrl, supabaseAnonKey)');
    const { SupabaseTransport } = await import('./supabaseTransport.js');
    return new SupabaseTransport({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, id });
  }
  if (!LocalTransport.available()) throw new Error('This browser has no BroadcastChannel (needed for local play)');
  return new LocalTransport({ id });
}
