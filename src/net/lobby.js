// Co-op lobby over a transport (docs/multiplayer.md "What the player gets"). Pure logic: no DOM.
//
//   const lobby = new Lobby({ transport, name, hero, version: content.version, gameVersion: '0.11.0' });
//   lobby.on('players', (list) => ...); lobby.on('start', (start) => ...);
//   const code = await lobby.createRoom();     // host
//   await lobby.joinRoom('K7PXQ2');            // everyone else
//
// The host is the room's creator (transport meta `creator: true`); when no creator is present (it
// left before the match), the member with the earliest joinedAt takes over with the last known state.
// The host is authoritative: it accepts hellos, seats at most MAX_PLAYERS players, and broadcasts the
// whole lobby state on every change and periodically (so a dropped message heals by itself).
//
// Wire messages, all { t: 'lobby', op, ... } (the lockstep session ignores them):
//   member -> host  { op: 'hello', name, hero, version, gameVersion, ready }   (sent again on changes)
//                   { op: 'ack', startId }                                       (got the start)
//   host -> all     { op: 'state', state }  state = { rev, host, version, gameVersion, settings,
//                                                    players: [{ id, name, hero, ready }], start }
//   host -> one     { op: 'refuse', code, reason }  (version | full | started | kicked)  { op: 'kick' }
// start = { id, seed, map, mode: 'coop', difficulty, players: [{ pid, hero, name }], peers: { peerId: pid },
//           hostId } (players in seat order, host first; identical for everyone).

/** Room code alphabet: no 0/O and no 1/I so codes read back unambiguously. 32 characters. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 4;

const PROFILE_MAX = 32; // characters kept of a name / hero id

/** Random bytes from crypto (falls back to Math.random outside browsers / modern Node). */
function randomBytes(n) {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * A new room code. 256 is a multiple of 32, so `byte % 32` is unbiased.
 * @param {(n:number)=>Uint8Array} [rand] random byte source (tests)
 */
export function newRoomCode(rand = randomBytes) {
  return Array.from(rand(ROOM_CODE_LENGTH), (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

/** What a player typed, cleaned: upper case, spaces and dashes removed. */
export function normalizeRoomCode(s) {
  return String(s ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

/** True for a well-formed (normalised) room code. */
export function isRoomCode(s) {
  if (typeof s !== 'string' || s.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of s) if (!ROOM_ALPHABET.includes(ch)) return false;
  return true;
}

/** A random match seed (string, as Match takes it). */
export function newSeed(rand = randomBytes) {
  return `coop-${Array.from(rand(8), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Host choice from a presence list: the earliest-joined creator, else the earliest-joined member.
 * Every member computes the same answer from the same list.
 * @param {{id:string, meta?:object, joinedAt:number}[]} peers
 */
export function pickHost(peers) {
  const order = (a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const list = [...(peers || [])].filter((p) => p && typeof p.id === 'string').sort(order);
  return (list.find((p) => p.meta?.creator) || list[0])?.id ?? null;
}

const clip = (s) => String(s ?? '').slice(0, PROFILE_MAX);
const versionReason = (field, host, mine) => (field === 'version'
  ? `Different game content: the host has ${host}, you have ${mine}. Both players need the same game version (reload the page to update).`
  : `Different game version: the host runs ${host}, you run ${mine}. Reload the page to update.`);

export class Lobby {
  /**
   * @param {object} o
   * @param {object} o.transport      contract 2 transport (not joined yet; the lobby joins it)
   * @param {string} o.name           player name
   * @param {string} o.hero           hero id
   * @param {string} o.version        content hash (content.version)
   * @param {string} [o.gameVersion]  app version (package.json version)
   * @param {object} [o.settings]     initial { map, difficulty } when hosting
   * @param {object} [o.timers]       { setTimeout, clearTimeout, setInterval, clearInterval } (tests)
   * @param {()=>number} [o.now]      clock in ms (tests)
   * @param {(n:number)=>Uint8Array} [o.rand]  random bytes (room codes, seeds; tests)
   * @param {number} [o.stateMs]      host state rebroadcast period (2000)
   * @param {number} [o.helloMs]      member hello retry period while not seated / out of date (1000)
   * @param {number} [o.joinTimeoutMs]  joinRoom() gives up after this without a host (8000)
   */
  constructor({
    transport, name, hero, map, version, gameVersion = '', settings, timers, now, rand,
    stateMs = 2000, helloMs = 1000, joinTimeoutMs = 8000,
  }) {
    if (!transport) throw new Error('Lobby needs a transport');
    this.transport = transport;
    this.id = transport.id;
    // map: the map this player's page has loaded (the world is built at page load, so a match can
    // only start when every player is on the lobby's map; see docs/multiplayer.md contract 5)
    this.profile = { name: clip(name) || 'Player', hero: clip(hero), ready: false, map: clip(map) };
    this.version = String(version ?? '');
    this.gameVersion = String(gameVersion ?? '');
    this.timers = timers || {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h),
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (h) => globalThis.clearInterval(h),
    };
    this.now = now || (() => Date.now());
    this.rand = rand || randomBytes;
    this.cfg = { stateMs, helloMs, joinTimeoutMs };
    this.initialSettings = { map: settings?.map ?? null, difficulty: settings?.difficulty ?? 'normal' };

    this.code = null;
    this.creator = false;
    this.phase = 'idle'; // idle | joining | lobby | started | refused | closed
    this.hostId = null;
    this.state = null; // last host state (members) / own state (host)
    this.peersNow = [];
    this.handlers = new Map();
    this.unsub = [];
    this.tickTimer = null;
    this.lastHelloAt = -Infinity;
    this.lastStateAt = -Infinity;
    this.joinWait = null; // { resolve, reject, timer }
    this.emittedStart = null; // start id already announced
    // host only
    this.members = new Map(); // peerId -> { id, name, hero, ready, seat }
    this.nextSeat = 1;
    this.banned = new Set();
    this.acks = new Set();
  }

  // ------------------------------------------------------------------ public API ----------

  /** 'players' | 'settings' | 'host' | 'start' | 'refused' | 'kicked' | 'error' | 'state'. */
  on(name, fn) {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** True while this player runs the lobby (it created the room, or took over before the start). */
  get isHost() {
    return this.state?.host === this.id && this.phase !== 'refused' && this.phase !== 'closed';
  }

  /** Seated players in seat order: [{ id, name, hero, ready, host, me }]. */
  get players() {
    const list = this.state?.players || [];
    return list.map((p) => ({ ...p, host: p.id === this.state.host, me: p.id === this.id }));
  }

  get settings() {
    return { ...(this.state?.settings || this.initialSettings) };
  }

  /** Create a room with a fresh code and host it. Resolves with the code. */
  async createRoom() {
    this.creator = true;
    const code = newRoomCode(this.rand);
    await this._enter(code);
    this.hostId = this.id;
    this.members.clear();
    this.members.set(this.id, { id: this.id, ...this.profile, seat: 0 });
    this.state = { rev: 0, host: this.id, version: this.version, gameVersion: this.gameVersion, settings: { ...this.initialSettings }, players: [], start: null };
    this.phase = 'lobby';
    this._hostPublish();
    return code;
  }

  /**
   * Join a room by code. Resolves with the lobby state once the host seated this player; rejects
   * with an Error whose `code` is 'badCode' | 'notFound' | 'version' | 'full' | 'started' | 'kicked'.
   */
  async joinRoom(input) {
    const code = normalizeRoomCode(input);
    if (!isRoomCode(code)) {
      throw Object.assign(new Error(`"${input}" is not a room code (6 letters and digits)`), { code: 'badCode' });
    }
    this.creator = false;
    const wait = new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        if (!this.joinWait) return;
        const anyone = this.peersNow.some((p) => p.id !== this.id);
        this._refused(anyone ? 'timeout' : 'notFound', anyone ? 'The host did not answer' : `Room ${code} was not found`);
      }, this.cfg.joinTimeoutMs);
      this.joinWait = { resolve, reject, timer };
    });
    await this._enter(code);
    this._hello(true);
    return wait;
  }

  /** Change name / hero / ready (members tell the host; the host applies at once). */
  setProfile({ name, hero, ready, map } = {}) {
    if (name !== undefined) this.profile.name = clip(name) || 'Player';
    if (hero !== undefined) this.profile.hero = clip(hero);
    if (ready !== undefined) this.profile.ready = !!ready;
    if (map !== undefined) this.profile.map = clip(map);
    if (this.isHost) {
      const me = this.members.get(this.id);
      if (me) Object.assign(me, this.profile);
      this._hostPublish();
    } else {
      this._hello(true);
    }
  }

  setReady(ready) { this.setProfile({ ready }); }
  setHero(hero) { this.setProfile({ hero }); }

  /** Host only: { map, difficulty } (either may be left out). */
  setSettings({ map, difficulty } = {}) {
    if (!this.isHost || this.state.start) return false;
    const s = this.state.settings;
    if (map !== undefined) s.map = map;
    if (difficulty !== undefined) s.difficulty = difficulty;
    this._hostPublish();
    return true;
  }

  /** True when the host could start now. */
  canStart() {
    return this._startProblem() === null;
  }

  /**
   * Host only: start the match. Broadcasts and returns the start payload (also emitted as 'start'
   * on every member). Returns { ok: false, reason } when it cannot start yet.
   * @param {object} [o]
   * @param {string} [o.seed]   default: random
   * @param {boolean} [o.force] start even if not everyone is ready
   */
  start({ seed, force = false } = {}) {
    const problem = this._startProblem(force);
    if (problem) return { ok: false, reason: problem };
    const seated = this._seated();
    const players = seated.map((m, i) => ({ pid: `p${i + 1}`, hero: m.hero, name: m.name }));
    const peers = Object.fromEntries(seated.map((m, i) => [m.id, `p${i + 1}`]));
    const s = this.state.settings;
    const start = {
      id: `${this.code}-${this.now()}`, seed: seed ?? newSeed(this.rand), map: s.map, mode: 'coop',
      difficulty: s.difficulty, players, peers, hostId: this.id,
    };
    this.state.start = start;
    this.acks = new Set([this.id]);
    this.phase = 'started';
    this._hostPublish();
    this._announceStart(start, false);
    return { ok: true, start };
  }

  /** Host only: remove a member (it gets 'kicked' and cannot rejoin this room). */
  kick(peerId) {
    if (!this.isHost || peerId === this.id) return false;
    this.banned.add(peerId);
    this.members.delete(peerId);
    this._send({ op: 'kick' }, peerId);
    this._hostPublish();
    return true;
  }

  /**
   * Stop the lobby's own traffic but keep the transport for the match (call after 'start' once the
   * LockstepSession runs). The host keeps answering rejoining players until stop() or leave().
   */
  stop() {
    this._stopTimer();
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  /** Leave the room: stops the lobby and closes the transport. */
  leave() {
    this.stop();
    this._settleJoin(Object.assign(new Error('Left the room'), { code: 'left' }));
    if (this.phase !== 'refused') this.phase = 'closed';
    try { this.transport.close(); } catch { /* already closed */ }
  }

  // ------------------------------------------------------------------ internals ------------

  _emit(name, payload) {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[lobby] ${name} handler failed`, err); }
    }
  }

  _send(body, to) {
    try {
      this.transport.send({ t: 'lobby', ...body }, to);
    } catch (err) {
      this._emit('error', { reason: 'send failed', error: err });
    }
  }

  async _enter(code) {
    this.stop();
    this.code = code;
    this.phase = 'joining';
    this.unsub = [
      this.transport.onMessage((d, from) => this._onMessage(d, from)),
      this.transport.onPeers((list) => this._onPeers(list)),
    ].filter((f) => typeof f === 'function');
    const meta = { name: this.profile.name, hero: this.profile.hero, version: this.version, gameVersion: this.gameVersion };
    if (this.creator) meta.creator = true;
    try {
      await this.transport.join(code, meta);
    } catch (err) {
      this.stop();
      this.phase = 'idle';
      this._settleJoin(err);
      throw err;
    }
    if (Array.isArray(this.transport.peers)) this.peersNow = this.transport.peers;
    this.tickTimer = this.timers.setInterval(() => this._tick(), Math.min(this.cfg.helloMs, this.cfg.stateMs) / 2);
  }

  _stopTimer() {
    if (this.tickTimer !== null) this.timers.clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  _settleJoin(err, value) {
    const w = this.joinWait;
    if (!w) return;
    this.joinWait = null;
    this.timers.clearTimeout(w.timer);
    if (err) w.reject(err); else w.resolve(value);
  }

  _refused(code, reason) {
    if (this.phase === 'refused' || this.phase === 'closed') return;
    this.phase = 'refused';
    this.stop();
    const info = { code, reason };
    this._emit(code === 'kicked' ? 'kicked' : 'refused', info);
    this._settleJoin(Object.assign(new Error(reason), { code }));
    try { this.transport.close(); } catch { /* already closed */ }
  }

  _tick() {
    const t = this.now();
    if (this.isHost) {
      if (!this.state) return;
      // periodic state keeps everyone in sync under message loss; after the start only until every
      // seated player confirmed it
      const pendingAcks = this.state.start && this._seated().some((m) => !this.acks.has(m.id));
      if ((!this.state.start || pendingAcks) && t - this.lastStateAt >= this.cfg.stateMs) this._broadcastState();
    } else if (this.phase === 'joining' || this.phase === 'lobby') {
      if (!this._inSync() && t - this.lastHelloAt >= this.cfg.helloMs) this._hello(true);
    }
  }

  /** Member: does the host's state show this player exactly as it is locally? */
  _inSync() {
    // a state from someone who is no longer the host (for example our own, after we briefly took
    // over while the creator's presence was lost) does not count: keep saying hello
    if (!this.state || this.state.host !== this.hostId) return false;
    const me = this.state.players?.find((p) => p.id === this.id);
    return !!me && me.name === this.profile.name && me.hero === this.profile.hero && me.ready === this.profile.ready && (me.map ?? '') === (this.profile.map ?? '');
  }

  _hello(force) {
    if (this.isHost || !this.hostId || (this.phase !== 'joining' && this.phase !== 'lobby')) return;
    if (!force && this._inSync()) return;
    this.lastHelloAt = this.now();
    this._send({ op: 'hello', ...this.profile, version: this.version, gameVersion: this.gameVersion }, this.hostId);
  }

  _onPeers(list) {
    if (!Array.isArray(list)) return;
    this.peersNow = list;
    const ids = new Set(list.map((p) => p.id));
    const prevHost = this.hostId;
    let host = pickHost(list);
    // a joiner never makes itself host of a room it has not seen yet (empty room = not found)
    if (host === this.id && !this.creator && !this.state) host = null;
    this.hostId = host;
    // we were only a stand-in host (the creator's presence was lost for a while) and the real host
    // is back: drop the stand-in room and rejoin theirs (hello until their state seats us)
    if (host && host !== this.id && this.state?.host === this.id && !this.creator && this.phase !== 'started') {
      this.state = null;
      this.members.clear();
    }
    if (this.phase === 'refused' || this.phase === 'closed') return;
    if (host !== prevHost && prevHost !== null) {
      this._emit('host', { id: host, previous: prevHost });
      // after the start the lobby is done: a lost host ends the match (LockstepSession 'hostLeft')
      if (host === this.id && this.phase !== 'started') this._takeOver();
    }
    if (this.isHost) {
      let changed = false;
      for (const id of [...this.members.keys()]) if (!ids.has(id)) { this.members.delete(id); changed = true; }
      if (changed) this._hostPublish();
    } else if (host && host !== prevHost) {
      this._hello(true);
    }
  }

  /** A member became host (the creator left before the match): continue from the last state. */
  _takeOver() {
    const last = this.state || { settings: { ...this.initialSettings }, players: [], start: null, rev: 0 };
    const present = new Set(this.peersNow.map((p) => p.id));
    this.members.clear();
    this.nextSeat = 1;
    for (const p of last.players || []) {
      if (!present.has(p.id)) continue;
      this.members.set(p.id, { id: p.id, name: p.name, hero: p.hero, ready: p.ready, seat: this.nextSeat++ });
    }
    const me = this.members.get(this.id);
    if (me) { me.seat = 0; Object.assign(me, this.profile); } else this.members.set(this.id, { id: this.id, ...this.profile, seat: 0 });
    this.state = {
      rev: (last.rev || 0) + 1, host: this.id, version: this.version, gameVersion: this.gameVersion,
      settings: { ...last.settings }, players: [], start: last.start || null,
    };
    if (this.phase === 'joining') this.phase = 'lobby';
    this._hostPublish();
  }

  _onMessage(d, from) {
    if (!d || d.t !== 'lobby' || typeof from !== 'string') return;
    if (this.phase === 'refused' || this.phase === 'closed') return;
    if (this.isHost) this._hostMessage(d, from);
    else if (from === this.hostId) this._memberMessage(d, from); // a stale host is ignored
  }

  // ------------------------------------------------------------------ host -----------------

  _seated() {
    return [...this.members.values()].sort((a, b) => a.seat - b.seat);
  }

  _startProblem(force = false) {
    if (!this.isHost) return 'Only the host can start';
    if (this.state.start) return 'Already started';
    if (!this.state.settings.map) return 'Pick a map first';
    if (!force && this._seated().some((m) => m.id !== this.id && !m.ready)) return 'Not everyone is ready';
    return null;
  }

  _hostMessage(d, from) {
    if (d.op === 'ack') {
      if (this.state.start && d.startId === this.state.start.id) this.acks.add(from);
      return;
    }
    if (d.op !== 'hello') return;
    const refuse = (code, reason) => this._send({ op: 'refuse', code, reason }, from);
    if (this.banned.has(from)) { refuse('kicked', 'The host removed you from this room'); return; }
    if (String(d.version ?? '') !== this.version) { refuse('version', versionReason('version', this.version, d.version)); return; }
    if (String(d.gameVersion ?? '') !== this.gameVersion) { refuse('version', versionReason('gameVersion', this.gameVersion, d.gameVersion)); return; }
    const start = this.state.start;
    let m = this.members.get(from);
    if (!m) {
      if (start && !start.peers[from]) { refuse('started', 'This match has already started'); return; }
      if (!start && this.members.size >= MAX_PLAYERS) { refuse('full', `The room is full (${MAX_PLAYERS} players)`); return; }
      m = { id: from, seat: this.nextSeat++ };
      this.members.set(from, m);
    }
    const next = { name: clip(d.name) || 'Player', hero: clip(d.hero), ready: !!d.ready, map: clip(d.map) };
    const changed = m.name !== next.name || m.hero !== next.hero || m.ready !== next.ready || m.map !== next.map;
    Object.assign(m, next);
    if (changed) this._hostPublish();
    // a repeated hello (our state got lost) or a rejoining player (reload during the match): answer
    // that player directly
    if (!changed || start) this._send({ op: 'state', state: this.state }, from);
  }

  /** Rebuild the public state from the members, then broadcast it and tell the local UI. */
  _hostPublish() {
    const prev = this.state;
    const players = this._seated().map(({ id, name, hero, ready, map }) => ({ id, name, hero, ready, map }));
    this.state = { ...prev, rev: prev.rev + 1, host: this.id, players, settings: { ...prev.settings } };
    this._broadcastState();
    this._applyState(this.state, prev);
  }

  _broadcastState() {
    this.lastStateAt = this.now();
    this._send({ op: 'state', state: this.state });
  }

  // ------------------------------------------------------------------ member ---------------

  _memberMessage(d, from) {
    switch (d.op) {
      case 'state': {
        const s = d.state;
        if (!s || !Array.isArray(s.players)) return;
        if (s.start && this.emittedStart === s.start.id) {
          // the host repeats the start until everyone confirmed it: our ack got lost
          this._send({ op: 'ack', startId: s.start.id }, from);
          return;
        }
        if (this.state && this.state.host === s.host && s.rev <= this.state.rev) return; // old or duplicate
        // version check on our side too, so a lost 'refuse' cannot leave us waiting
        if (s.version !== this.version) { this._refused('version', versionReason('version', s.version, this.version)); return; }
        if (s.gameVersion !== this.gameVersion) { this._refused('version', versionReason('gameVersion', s.gameVersion, this.gameVersion)); return; }
        const prev = this.state;
        const wasJoining = this.phase === 'joining';
        this.state = s;
        const seated = s.players.some((p) => p.id === this.id);
        if (seated && wasJoining) this.phase = 'lobby';
        this._applyState(s, prev);
        if (s.start) {
          if (s.start.peers?.[this.id]) {
            this._send({ op: 'ack', startId: s.start.id }, from);
            this.phase = 'started';
            // joined (or reloaded) after the start: the session must wait for a snapshot
            this._announceStart(s.start, wasJoining);
          } else if (wasJoining) {
            this._refused('started', 'This match has already started');
          }
        } else if (seated) {
          this._settleJoin(null, s);
        }
        break;
      }
      case 'refuse': this._refused(String(d.code || 'refused'), String(d.reason || 'The host refused to let you in')); break;
      case 'kick': this._refused('kicked', 'The host removed you from this room'); break;
      default: break;
    }
  }

  /** Emit UI events for what changed between two states. */
  _applyState(s, prev) {
    const sig = (p) => JSON.stringify(p?.players || []);
    if (!prev || sig(prev) !== sig(s)) this._emit('players', this.players);
    if (!prev || JSON.stringify(prev.settings) !== JSON.stringify(s.settings)) this._emit('settings', { ...s.settings });
    this._emit('state', s);
  }

  _announceStart(start, rejoin) {
    if (this.emittedStart === start.id) return;
    this.emittedStart = start.id;
    this._settleJoin(null, this.state);
    this._emit('start', { ...start, players: start.players.map((p) => ({ ...p })), peers: { ...start.peers }, rejoin });
  }
}
