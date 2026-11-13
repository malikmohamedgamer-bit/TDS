// SupabaseTransport: the co-op transport over Supabase Realtime (docs/multiplayer.md, contract 2).
// No database tables and no server code: a room is the Realtime channel `tds:<room>`, game messages
// are broadcast events `m`, and the member list is Realtime presence keyed by peer id.
//
//   const t = new SupabaseTransport({ url, anonKey });
//   t.onStatus((s) => ...);  t.onPeers((peers) => ...);  t.onMessage((data, from) => ...);
//   await t.join('ABC123', { name, hero, version });
//   t.send({ t: 'turn', ... });        // to everyone else in the room
//   t.send({ t: 'snap', ... }, peerId); // to one peer
//   t.close();
//
// Broadcast payload on the wire: { from, to?, data }. Directed messages still travel over the shared
// channel (Supabase has no per-client delivery), receivers drop those addressed to someone else.
// The vendored client (vendor/supabase/supabase.js) is loaded on first join, never before.
import { loadScript } from './loadScript.js';

/** URL of the vendored UMD build, resolved from this module so it works under any site sub-path. */
export const SUPABASE_SCRIPT = new URL('../../vendor/supabase/supabase.js', import.meta.url).href;

/** Broadcast event name used for every game message. */
export const EVENT = 'm';

/**
 * Supabase Realtime refuses broadcast payloads above its message size limit (256 KB on the free
 * plan at the time of writing). The session layer chunks snapshots well below this; anything larger
 * is dropped here with a warning instead of failing silently on the server.
 */
export const DEFAULT_MAX_PAYLOAD_CHARS = 250 * 1024;

/** A random peer id: 'p' + 12 base-36 characters (matches the relay's [A-Za-z0-9_-]{1,64}). */
export function randomPeerId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let s = 'p';
  for (const b of bytes) s += (b % 36).toString(36);
  return s;
}

/**
 * Turns a Supabase presence state ({ [key]: [{ meta, joinedAt, presence_ref }, ...] }) into the
 * transport peer list [{ id, meta, joinedAt }], oldest first. A key can carry several entries
 * (a quick reconnect overlapping the old connection): the earliest joinedAt and the newest meta win.
 */
export function peersFromPresence(state) {
  const out = [];
  for (const [id, metas] of Object.entries(state || {})) {
    if (!Array.isArray(metas) || metas.length === 0) continue;
    let joinedAt = Infinity;
    let meta = {};
    for (const m of metas) {
      const t = Number(m && m.joinedAt);
      if (Number.isFinite(t) && t < joinedAt) joinedAt = t;
      if (m && m.meta && typeof m.meta === 'object') meta = m.meta;
    }
    out.push({ id, meta, joinedAt: Number.isFinite(joinedAt) ? joinedAt : 0 });
  }
  return out.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export class SupabaseTransport {
  /**
   * @param {object} opts
   * @param {string} opts.url            Supabase project URL (https://<ref>.supabase.co)
   * @param {string} opts.anonKey        the project's public anon key
   * @param {string} [opts.id]           own peer id (default: random)
   * @param {Function} [opts.createClient] supabase.createClient; injected by tests, else loaded lazily
   * @param {string} [opts.scriptUrl]    where the vendored client lives (default SUPABASE_SCRIPT)
   * @param {number} [opts.eventsPerSecond] Realtime client rate (default 20)
   * @param {number} [opts.timeoutMs]    join gives up after this long (default 15000)
   * @param {number} [opts.maxPayloadChars] larger messages are dropped (default 250 KB)
   * @param {() => number} [opts.now]    clock for joinedAt (default Date.now)
   * @param {number} [opts.trackRetries] presence track retries after a failed one (default 3)
   * @param {number} [opts.trackBackoffMs] first retry delay, doubled per retry (default 500)
   */
  constructor(opts = {}) {
    this.url = opts.url || '';
    this.anonKey = opts.anonKey || '';
    this.id = opts.id || randomPeerId();
    this._createClient = opts.createClient || null;
    this._scriptUrl = opts.scriptUrl || SUPABASE_SCRIPT;
    this._eventsPerSecond = opts.eventsPerSecond ?? 20;
    // the whole join may take this long: on a busy phone or a slow network supabase-js reports
    // TIMED_OUT and retries by itself, so one TIMED_OUT is not a failure (see join)
    this._timeoutMs = opts.timeoutMs ?? 30000;
    this._maxPayloadChars = opts.maxPayloadChars ?? DEFAULT_MAX_PAYLOAD_CHARS;
    this._now = opts.now || (() => Date.now());
    this._trackRetries = opts.trackRetries ?? 3;
    this._trackBackoffMs = opts.trackBackoffMs ?? 500;
    this._trackGen = 0;

    this.room = null;
    /** 'idle' until join; then 'connecting' | 'open' | 'closed' | 'error' */
    this.status = 'idle';
    this.stats = { sent: 0, received: 0, dropped: 0 };
    /** presence track() calls that did not return 'ok' (each retried) */
    this.trackFailures = 0;

    this._client = null;
    this._channel = null;
    this._meta = null;
    this._joinedAt = 0;
    this._closed = false;
    this._lastPeersKey = '';
    this._warnedSize = false;
    this._listeners = { message: new Set(), peers: new Set(), status: new Set() };
  }

  // ---- listeners (each returns an unsubscribe function) ---------------------------------------
  /** fn(data, fromPeerId) for every message from another peer addressed to the room or to us. */
  onMessage(fn) { return this._on('message', fn); }
  /** fn([{ id, meta, joinedAt }]) whenever the member list changes; includes this peer. */
  onPeers(fn) { return this._on('peers', fn); }
  /** fn(status, detail?) with status 'connecting' | 'open' | 'closed' | 'error'. */
  onStatus(fn) { return this._on('status', fn); }

  _on(kind, fn) {
    this._listeners[kind].add(fn);
    return () => this._listeners[kind].delete(fn);
  }

  _emit(kind, ...args) {
    for (const fn of [...this._listeners[kind]]) {
      try {
        fn(...args);
      } catch (err) {
        // a listener bug must not break delivery to the others (or the Realtime client callback)
        console.error(`SupabaseTransport ${kind} listener failed`, err);
      }
    }
  }

  _setStatus(s, detail) {
    if (this.status === s) return;
    this.status = s;
    this._emit('status', s, detail);
  }

  // ---- join ----------------------------------------------------------------------------------
  /**
   * Joins room `room` with `meta` ({ name, hero, version }). Resolves once the channel is
   * subscribed and our presence is tracked; rejects on a channel error or after `timeoutMs`.
   */
  async join(room, meta = {}) {
    if (this._closed) throw new Error('SupabaseTransport: closed');
    if (this._channel) throw new Error('SupabaseTransport: already joined a room');
    if (typeof room !== 'string' || !room) throw new Error('SupabaseTransport: room code required');
    if (!this.url || !this.anonKey) {
      this._setStatus('error', 'not configured');
      throw new Error('Supabase is not configured: set supabaseUrl and supabaseAnonKey in data/online.json');
    }
    this.room = room;
    this._meta = meta || {};
    this._setStatus('connecting');

    let createClient = this._createClient;
    if (!createClient) {
      try {
        const lib = await loadScript(this._scriptUrl, { globalName: 'supabase' });
        createClient = lib.createClient;
      } catch (err) {
        this._setStatus('error', err.message);
        throw err;
      }
    }
    if (this._closed) throw new Error('SupabaseTransport: closed while loading');

    this._client = createClient(this.url, this.anonKey, {
      realtime: { params: { eventsPerSecond: this._eventsPerSecond }, timeout: 20000 },
      // no sign-in is used: keep the auth helper from touching storage or the page URL, so two
      // transports in one tab (tests, local co-op) do not fight over a stored session
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const channel = this._client.channel(`tds:${room}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.id } },
    });
    this._channel = channel;

    channel.on('broadcast', { event: EVENT }, (msg) => this._receive(msg && msg.payload));
    channel.on('presence', { event: 'sync' }, () => this._presenceSync());

    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(new Error(`Supabase: joining room ${room} timed out`)), this._timeoutMs);
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._setStatus('error', err.message);
        this._teardown();
        reject(err);
      };
      channel.subscribe(async (state, err) => {
        if (this._closed || this._channel !== channel) return;
        if (state === 'SUBSCRIBED') {
          // (Re)subscribed, also after an automatic rejoin: (re)announce ourselves. joinedAt is
          // fixed at the first subscribe so a reconnect keeps its place in the peer order.
          if (!this._joinedAt) this._joinedAt = this._now();
          const tracked = await this._track(channel);
          if (this._closed || this._channel !== channel || tracked === null) return; // closed, or superseded
          if (tracked !== 'ok') {
            if (!settled) fail(new Error(`Supabase: presence track failed (${tracked})`));
            else this._setStatus('error', `presence track failed (${tracked})`);
            return;
          }
          this._setStatus('open');
          this._presenceSync(); // make sure listeners see at least ourselves
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
        } else if (state === 'TIMED_OUT' && !settled) {
          // the server did not answer in time (busy device, slow network): supabase-js rejoins on
          // its own, so keep waiting until our own timeout instead of giving up on the first try
          this._setStatus('connecting', 'slow connection, still trying');
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          const detail = err && err.message ? err.message : state;
          // before the first success this is a failed join; afterwards the client retries on its own
          if (!settled) fail(new Error(`Supabase: could not join room ${room} (${detail})`));
          else this._setStatus('error', detail);
        } else if (state === 'CLOSED') {
          if (!settled) fail(new Error(`Supabase: channel closed while joining room ${room}`));
          else this._setStatus('closed');
        }
      });
    });
  }

  /**
   * Announces our presence. channel.track() resolves 'ok', 'timed out' or 'error' (it does not
   * throw for those), and without presence the others never see us join, so anything but 'ok' is
   * retried trackRetries times with backoff trackBackoffMs, 2x, 4x ... Resolves 'ok', the last
   * failure ('timed out' | 'error' | an exception message), or null when the transport closed or a
   * newer subscribe started its own track meanwhile.
   */
  async _track(channel) {
    const gen = ++this._trackGen;
    const stale = () => this._closed || this._channel !== channel || gen !== this._trackGen;
    let result = 'error';
    for (let attempt = 0; attempt <= this._trackRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, this._trackBackoffMs * 2 ** (attempt - 1)));
        if (stale()) return null;
      }
      try {
        const res = await channel.track({ meta: this._meta, joinedAt: this._joinedAt });
        // older clients resolved undefined on success; only an explicit failure string is one
        result = res === undefined || res === 'ok' ? 'ok' : String(res);
      } catch (e) {
        result = e && e.message ? e.message : String(e);
      }
      if (stale()) return null;
      if (result === 'ok') return 'ok';
      this.trackFailures++;
    }
    return result;
  }

  // ---- receive -------------------------------------------------------------------------------
  _receive(payload) {
    if (this._closed || !payload || typeof payload !== 'object') return;
    const { from, to, data } = payload;
    if (typeof from !== 'string' || from === this.id) return; // self: false already, belt and braces
    if (to != null && to !== this.id) return; // directed at another peer
    this.stats.received++;
    this._emit('message', data, from);
  }

  _presenceSync() {
    if (this._closed || !this._channel) return;
    const peers = peersFromPresence(this._channel.presenceState());
    // our own presence can lag behind the subscribe; the contract says the list includes self
    if (this._joinedAt && !peers.some((p) => p.id === this.id)) {
      peers.push({ id: this.id, meta: this._meta, joinedAt: this._joinedAt });
      peers.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    // presence sync also fires for changes that do not alter the list (a re-track): skip those
    const key = JSON.stringify(peers);
    if (key === this._lastPeersKey) return;
    this._lastPeersKey = key;
    this._emit('peers', peers);
  }

  // ---- send ----------------------------------------------------------------------------------
  /**
   * Broadcasts `data` to the other peers, or to `to` only. Returns false (and drops the message)
   * when not connected or when the message is over the size limit.
   */
  send(data, to) {
    if (this._closed || !this._channel || this.status !== 'open') {
      this.stats.dropped++;
      return false;
    }
    const payload = to != null ? { from: this.id, to, data } : { from: this.id, data };
    const size = JSON.stringify(payload).length;
    if (size > this._maxPayloadChars) {
      this.stats.dropped++;
      if (!this._warnedSize) {
        this._warnedSize = true;
        console.warn(`SupabaseTransport: dropped a ${size}-character message (limit ${this._maxPayloadChars}); chunk it smaller`);
      }
      return false;
    }
    this.stats.sent++;
    const res = this._channel.send({ type: 'broadcast', event: EVENT, payload });
    // ack is off, so this resolves at once; a rejection would only mean the socket is going away
    if (res && typeof res.catch === 'function') res.catch(() => { this.stats.dropped++; });
    return true;
  }

  // ---- close ---------------------------------------------------------------------------------
  /** Leaves the room (presence leave reaches the others) and disconnects. Safe to call twice. */
  close() {
    if (this._closed) return Promise.resolve();
    this._closed = true;
    const done = this._teardown();
    this._setStatus('closed');
    return done;
  }

  /** Removes the channel and disconnects the client; never throws. */
  _teardown() {
    const client = this._client;
    const channel = this._channel;
    this._channel = null;
    this._client = null;
    if (!client) return Promise.resolve();
    return (async () => {
      // removeChannel sends the leave (so the others see us go at once, not after a server
      // timeout) and waits for the reply; on a channel that never joined it would wait 10 s, so
      // the wait is capped before the socket is closed anyway
      try {
        if (channel) {
          let timer;
          await Promise.race([
            client.removeChannel(channel),
            new Promise((r) => { timer = setTimeout(r, 1500); }),
          ]);
          clearTimeout(timer);
        }
      } catch { /* already gone */ }
      try {
        client.realtime?.disconnect?.();
      } catch { /* already disconnected */ }
    })();
  }
}
