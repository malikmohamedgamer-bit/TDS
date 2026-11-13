// TDS relay server: a tiny WebSocket message relay for online co-op (docs/multiplayer.md,
// contract 4). It knows nothing about the game: peers join a room by code and the server forwards
// their JSON messages to the other peers in that room. The lockstep session (src/net/lockstep.js)
// does everything game related on the clients.
//
// Protocol (full description in server/README.md):
//   client -> server  {op:'join', room, peer, meta, secret?}   {op:'send', data, to?}   {op:'ping', ts}
//   server -> client  {op:'joined', peer, peers}  {op:'peers', peers}  {op:'msg', from, data}
//                     {op:'error', code, message}  {op:'pong', ts}
//
// Peer identity: the first socket to join a room as peer id P with secret S owns P in that room.
// Later joins as P must bring the same S (a reconnect or reload) or are refused with 'taken'. The
// claim is kept while P is connected and for PEER_GRACE_MS after P left, and dropped with the room.
// 'from' on relayed messages is always the sender socket's own peer id, never a client field.
//
// Run: `node relay.mjs` (or `npm start` in server/). Environment:
//   PORT              listen port (default 8787; 0 picks a free port, logged on start)
//   ALLOWED_ORIGINS   comma separated list of allowed page origins; empty = allow all
//   HEARTBEAT_MS      WebSocket ping interval (default 15000); a peer that misses one is dropped
//   MAX_CLIENTS       maximum simultaneous sockets (default 500)
//   RATE_PER_SEC, RATE_BURST   per-socket token bucket (default 60 messages/s, burst 120)
//   RATE_BYTES_PER_SEC, RATE_BYTES_BURST   per-socket byte bucket (default 1 MB/s, burst 2 MB)
//   MAX_BUFFERED_BYTES  a receiver with more than this queued and unread is terminated (default 2 MB)
//   PEER_GRACE_MS     how long a gone peer's id stays reserved for its secret (default 600000)
//   JOIN_TIMEOUT_MS   a socket that has not joined a room after this long is closed (default 30000)
//
// Only dependency: `ws`. Node 18+.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

/** Room codes: 4-12 characters, upper case letters and digits. */
export const ROOM_RE = /^[A-Z0-9]{4,12}$/;
/** Peer ids are chosen by the client: 1-64 characters of [A-Za-z0-9_-]. */
export const PEER_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Peer secrets are chosen by the client: 16-128 characters of [A-Za-z0-9_-] (the game sends 32 hex). */
export const SECRET_RE = /^[A-Za-z0-9_-]{16,128}$/;

export const DEFAULTS = Object.freeze({
  port: 8787,
  maxPeers: 4,                // peers per room
  maxBytes: 512 * 1024,       // largest accepted message (UTF-8 bytes), larger -> 'too_big'
  maxMetaBytes: 4 * 1024,     // largest join meta (JSON bytes)
  maxClients: 500,            // simultaneous sockets for the whole server
  ratePerSec: 60,             // token bucket refill per socket
  rateBurst: 120,             // token bucket size
  rateBytesPerSec: 1024 * 1024,   // byte bucket refill per socket (received bytes)
  rateBytesBurst: 2 * 1024 * 1024, // byte bucket size (never below maxBytes, so one big message can pass)
  maxBufferedBytes: 2 * 1024 * 1024, // unread bytes queued for one receiver before it is terminated
  peerGraceMs: 10 * 60 * 1000, // a gone peer's id stays reserved for its secret this long
  heartbeatMs: 15000,         // ping interval; a socket that did not pong since the last ping is dropped
  joinTimeoutMs: 30000,       // close sockets that never join a room
  allowedOrigins: [],         // empty = allow every origin
});

// Close codes sent to clients (4000-4999 is the application range).
export const CLOSE = Object.freeze({ JOIN_TIMEOUT: 4000, REPLACED: 4001, SHUTDOWN: 1001 });

/** Normalises an origin for comparison: lower case, no trailing slash. */
function normOrigin(o) {
  return String(o || '').trim().replace(/\/+$/, '').toLowerCase();
}

/** Parses ALLOWED_ORIGINS ("https://a.example, https://b.example") into a normalised list. */
export function parseOrigins(value) {
  return String(value || '').split(',').map(normOrigin).filter(Boolean);
}

/**
 * Creates a relay. Nothing listens until `listen()` is called, so tests and other hosts can embed it.
 * @param {Partial<typeof DEFAULTS> & { log?: (line: string) => void }} [options]
 */
export function createRelay(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const allowed = new Set((cfg.allowedOrigins || []).map(normOrigin).filter(Boolean));
  const log = cfg.log || ((line) => console.log(`[relay] ${line}`));

  const bytesBurst = Math.max(cfg.rateBytesBurst, cfg.maxBytes);

  /** @type {Map<string, Map<string, Peer>>} room code -> (peer id -> peer) */
  const rooms = new Map();
  /**
   * Identity claims: room code -> (peer id -> { secret, goneAt }). secret '' is a legacy client
   * that sent none (its id can be taken over, as before secrets existed). goneAt is 0 while the
   * peer is connected, else the time it left; claims older than peerGraceMs are dropped.
   * @type {Map<string, Map<string, { secret: string, goneAt: number }>>}
   */
  const claims = new Map();
  /** @type {Set<WebSocket>} */
  const sockets = new Set();

  // ---- HTTP: health check (Render / Fly / uptime monitors) and a plain landing response ------
  const server = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      const body = JSON.stringify({ ok: true, rooms: rooms.size, peers: countPeers() });
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('TDS relay: connect with a WebSocket. Health: /health\n');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  });

  // maxPayload is a hard cap above maxBytes so an oversize message still reaches our handler and
  // gets a polite 'too_big' error; only absurd frames (> 2x) make ws close the socket (code 1009).
  const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxBytes * 2, clientTracking: false });

  // Origin check and connection cap happen before the WebSocket handshake completes.
  server.on('upgrade', (req, socket, head) => {
    if (allowed.size && !allowed.has('*') && !allowed.has(normOrigin(req.headers.origin))) {
      reject(socket, 403, 'Forbidden');
      return;
    }
    if (sockets.size >= cfg.maxClients) {
      reject(socket, 503, 'Service Unavailable');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  function reject(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  function countPeers() {
    let n = 0;
    for (const r of rooms.values()) n += r.size;
    return n;
  }

  /**
   * Every outgoing frame goes through here. Backpressure: a socket whose unsent queue is already
   * over maxBufferedBytes is not reading (stalled tab, dead network, hostile client), so it is
   * terminated instead of buffering without limit. Its close handler removes it from its room; a
   * real client reconnects and the game resyncs it. Returns true when the frame was queued.
   */
  function push(ws, text) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    // only what is already queued counts: one big frame to a socket that keeps up is fine
    if (ws.bufferedAmount > cfg.maxBufferedBytes) {
      log(`terminating ${ws.tds && ws.tds.peer ? `peer ${ws.tds.peer}` : 'a socket'}: ${ws.bufferedAmount} bytes unread`);
      ws.terminate();
      return false;
    }
    ws.send(text);
    return true;
  }

  function sendJson(ws, obj) {
    push(ws, JSON.stringify(obj));
  }

  function sendError(ws, code, message) {
    sendJson(ws, { op: 'error', code, message });
  }

  /** The public peer list of a room, oldest first (join order; a reconnect keeps its place). */
  function peerList(room) {
    const r = rooms.get(room);
    if (!r) return [];
    return [...r.values()]
      .map((p) => ({ id: p.id, meta: p.meta, joinedAt: p.joinedAt }))
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Tells every peer in the room except `skip` about the current member list. */
  function broadcastPeers(room, skip) {
    const r = rooms.get(room);
    if (!r) return;
    const msg = JSON.stringify({ op: 'peers', peers: peerList(room) });
    for (const p of [...r.values()]) if (p.ws !== skip) push(p.ws, msg);
  }

  /** Drops the identity claims of peers that have been gone longer than peerGraceMs. */
  function pruneClaims(now = Date.now()) {
    for (const [room, c] of claims) {
      for (const [peer, claim] of c) if (claim.goneAt && now - claim.goneAt > cfg.peerGraceMs) c.delete(peer);
      if (c.size === 0) claims.delete(room);
    }
  }

  /** Constant-time comparison of two secrets. */
  function sameSecret(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  /** Removes a socket's peer from its room (no-op if the slot now belongs to a newer socket). */
  function leave(ws) {
    const st = ws.tds;
    if (!st || !st.room) return;
    const { room, peer } = st;
    st.room = null;
    st.peer = null;
    const r = rooms.get(room);
    if (!r) return;
    const p = r.get(peer);
    if (!p || p.ws !== ws) return; // replaced by a reconnect: the new socket owns the slot
    r.delete(peer);
    if (r.size === 0) {
      rooms.delete(room);
      claims.delete(room); // nobody is left to impersonate
    } else {
      const claim = claims.get(room)?.get(peer);
      if (claim) claim.goneAt = Date.now(); // keep the id reserved for its secret for a while
      broadcastPeers(room, null);
    }
  }

  // ---- message handlers --------------------------------------------------------------------------
  function onJoin(ws, msg) {
    const { room, peer } = msg;
    if (typeof room !== 'string' || !ROOM_RE.test(room)) return sendError(ws, 'bad_room', 'room code must be 4-12 characters A-Z 0-9');
    if (typeof peer !== 'string' || !PEER_RE.test(peer)) return sendError(ws, 'bad_peer', 'peer id must be 1-64 characters A-Z a-z 0-9 _ -');
    const meta = msg.meta == null ? {} : msg.meta;
    if (typeof meta !== 'object' || Array.isArray(meta)) return sendError(ws, 'bad_meta', 'meta must be an object');
    if (Buffer.byteLength(JSON.stringify(meta)) > cfg.maxMetaBytes) return sendError(ws, 'bad_meta', `meta is larger than ${cfg.maxMetaBytes} bytes`);
    // no secret (null / absent): a legacy client, whose id anyone can take over as before
    const secret = msg.secret == null ? '' : msg.secret;
    if (secret !== '' && (typeof secret !== 'string' || !SECRET_RE.test(secret))) {
      return sendError(ws, 'bad_secret', 'secret must be 16-128 characters A-Z a-z 0-9 _ -');
    }

    // Identity: a peer id that is (or recently was) in this room with a secret belongs to that
    // secret. Same secret = the same player reconnecting or reloading; anything else is refused.
    pruneClaims();
    const roomClaims = claims.get(room);
    const claim = roomClaims && roomClaims.get(peer);
    if (claim && claim.secret !== '' && !sameSecret(claim.secret, secret)) {
      return sendError(ws, 'taken', `peer id ${peer} is already used by another player in room ${room}`);
    }

    const st = ws.tds;
    if (st.room === room && st.peer === peer) {
      // same socket joining the same room again: just update meta
      rooms.get(room).get(peer).meta = meta;
      sendJson(ws, { op: 'joined', peer, peers: peerList(room) });
      broadcastPeers(room, ws);
      return;
    }
    const r = rooms.get(room);
    const existing = r && r.get(peer);
    // a socket moving to another peer id inside its own room frees its old slot first
    const taken = r ? r.size - (st.room === room ? 1 : 0) : 0;
    if (r && !existing && taken >= cfg.maxPeers) return sendError(ws, 'full', `room ${room} is full (${cfg.maxPeers} players)`);

    if (st.room) leave(ws); // moving this socket to another room
    clearTimeout(st.joinTimer);
    st.joinTimer = null;

    let joinedAt = Date.now();
    if (existing) {
      // Reconnect (same id, same secret): the new socket takes over the slot. The old socket is
      // told and closed; its close handler sees that it no longer owns the slot and does not
      // announce a leave. If the old socket was still alive this is a second tab or window with
      // the same identity (a duplicated tab copies sessionStorage): the client must not
      // reconnect on 'replaced', or the two would take the slot from each other forever.
      joinedAt = existing.joinedAt;
      if (existing.ws !== ws) {
        sendError(existing.ws, 'replaced', 'This room was opened in another tab or window');
        existing.ws.tds.room = null;
        existing.ws.tds.peer = null;
        existing.ws.close(CLOSE.REPLACED, 'replaced');
      }
    }
    let target = rooms.get(room); // re-read: leave() above may have deleted an emptied room
    if (!target) {
      target = new Map();
      rooms.set(room, target);
    }
    target.set(peer, { id: peer, meta, joinedAt, ws });
    let targetClaims = claims.get(room);
    if (!targetClaims) {
      targetClaims = new Map();
      claims.set(room, targetClaims);
    }
    targetClaims.set(peer, { secret, goneAt: 0 });
    st.room = room;
    st.peer = peer;
    sendJson(ws, { op: 'joined', peer, peers: peerList(room) });
    broadcastPeers(room, ws);
  }

  function onSend(ws, msg) {
    const st = ws.tds;
    if (!st.room) return sendError(ws, 'not_joined', 'join a room before sending');
    if (msg.data === undefined) return sendError(ws, 'bad_msg', 'send needs data');
    const r = rooms.get(st.room);
    // 'from' is the authenticated sender's own id; a 'from' field in the client frame is ignored
    const out = JSON.stringify({ op: 'msg', from: st.peer, data: msg.data });
    if (msg.to != null) {
      const p = typeof msg.to === 'string' ? r.get(msg.to) : null;
      if (!p) return sendError(ws, 'no_peer', `no peer ${String(msg.to).slice(0, 64)} in this room`);
      if (p.ws !== ws) push(p.ws, out);
      return;
    }
    for (const p of [...r.values()]) if (p.ws !== ws) push(p.ws, out);
  }

  /**
   * Two token buckets per socket: messages (refill ratePerSec up to rateBurst, one per message)
   * and received bytes (refill rateBytesPerSec up to rateBytesBurst, one per byte).
   * Returns '' when the message may pass, else which limit it hit ('messages' | 'bytes').
   */
  function takeTokens(st, bytes) {
    const now = Date.now();
    const dt = (now - st.refilledAt) / 1000;
    st.refilledAt = now;
    st.tokens = Math.min(cfg.rateBurst, st.tokens + dt * cfg.ratePerSec);
    st.byteTokens = Math.min(bytesBurst, st.byteTokens + dt * cfg.rateBytesPerSec);
    if (st.tokens < 1) return 'messages';
    if (st.byteTokens < bytes) return 'bytes';
    st.tokens -= 1;
    st.byteTokens -= bytes;
    return '';
  }

  function onMessage(ws, raw, isBinary) {
    const st = ws.tds;
    const bytes = raw.length;
    const limited = takeTokens(st, bytes);
    if (limited) {
      // drop; tell the client at most once a second so a flood does not create a reply flood
      const now = Date.now();
      if (now - st.rateErrorAt >= 1000) {
        st.rateErrorAt = now;
        sendError(ws, 'rate', limited === 'bytes'
          ? `more than ${cfg.rateBytesPerSec} bytes per second: message dropped`
          : `more than ${cfg.ratePerSec} messages per second: message dropped`);
      }
      return;
    }
    if (bytes > cfg.maxBytes) return sendError(ws, 'too_big', `message is ${bytes} bytes, the limit is ${cfg.maxBytes}`);
    if (isBinary) return sendError(ws, 'bad_json', 'binary frames are not supported');
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return sendError(ws, 'bad_json', 'message is not valid JSON');
    }
    if (!msg || typeof msg !== 'object') return sendError(ws, 'bad_json', 'message must be a JSON object');
    switch (msg.op) {
      case 'join': return onJoin(ws, msg);
      case 'send': return onSend(ws, msg);
      case 'ping': return sendJson(ws, { op: 'pong', ts: msg.ts });
      default: return sendError(ws, 'bad_op', `unknown op ${String(msg.op).slice(0, 32)}`);
    }
  }

  function onConnection(ws) {
    sockets.add(ws);
    ws.tds = {
      room: null,
      peer: null,
      alive: true,
      tokens: cfg.rateBurst,
      byteTokens: bytesBurst,
      refilledAt: Date.now(),
      rateErrorAt: 0,
      joinTimer: setTimeout(() => {
        if (!ws.tds.room) ws.close(CLOSE.JOIN_TIMEOUT, 'join timeout');
      }, cfg.joinTimeoutMs),
    };
    ws.on('pong', () => { ws.tds.alive = true; });
    ws.on('message', (raw, isBinary) => {
      try {
        onMessage(ws, raw, isBinary);
      } catch (err) {
        // a handler bug must never take the whole relay down
        log(`handler error: ${err && err.stack ? err.stack : err}`);
        sendError(ws, 'internal', 'server error');
      }
    });
    ws.on('error', () => { /* 'close' follows; nothing else to do */ });
    ws.on('close', () => {
      clearTimeout(ws.tds.joinTimer);
      sockets.delete(ws);
      leave(ws);
    });
  }

  // Heartbeat: every interval each socket must have answered the previous ping, or it is
  // terminated (its close handler then removes it from its room and tells the others).
  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (!ws.tds.alive) {
        ws.terminate();
        continue;
      }
      ws.tds.alive = false;
      try { ws.ping(); } catch { /* socket already closing */ }
    }
    pruneClaims();
  }, cfg.heartbeatMs);
  heartbeat.unref();

  return {
    server,
    /** Starts listening; resolves with the actual port (useful with port 0). */
    listen(port = cfg.port, host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address().port);
        });
      });
    },
    /** Closes every socket and the HTTP server. */
    close() {
      clearInterval(heartbeat);
      for (const ws of sockets) ws.close(CLOSE.SHUTDOWN, 'server shutting down');
      return new Promise((resolve) => {
        server.close(() => resolve());
        // sockets that do not finish the close handshake quickly are cut off
        setTimeout(() => { for (const ws of sockets) ws.terminate(); }, 1000).unref();
      });
    },
    stats: () => ({ rooms: rooms.size, peers: countPeers(), sockets: sockets.size }),
  };
}

/** Reads the configuration from environment variables (see the header comment). */
export function configFromEnv(env = process.env) {
  const num = (name, def) => {
    const v = env[name];
    if (v == null || v === '') return def;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got ${v}`);
    return n;
  };
  return {
    port: num('PORT', DEFAULTS.port),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    heartbeatMs: num('HEARTBEAT_MS', DEFAULTS.heartbeatMs),
    maxClients: num('MAX_CLIENTS', DEFAULTS.maxClients),
    ratePerSec: num('RATE_PER_SEC', DEFAULTS.ratePerSec),
    rateBurst: num('RATE_BURST', DEFAULTS.rateBurst),
    rateBytesPerSec: num('RATE_BYTES_PER_SEC', DEFAULTS.rateBytesPerSec),
    rateBytesBurst: num('RATE_BYTES_BURST', DEFAULTS.rateBytesBurst),
    maxBufferedBytes: num('MAX_BUFFERED_BYTES', DEFAULTS.maxBufferedBytes),
    peerGraceMs: num('PEER_GRACE_MS', DEFAULTS.peerGraceMs),
    joinTimeoutMs: num('JOIN_TIMEOUT_MS', DEFAULTS.joinTimeoutMs),
  };
}

// Started directly (`node relay.mjs`): listen on PORT and shut down cleanly on SIGINT / SIGTERM.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = configFromEnv();
  const relay = createRelay(cfg);
  const port = await relay.listen(cfg.port);
  const origins = cfg.allowedOrigins.length ? cfg.allowedOrigins.join(', ') : 'all origins';
  console.log(`[relay] listening on port ${port} (${origins})`);
  const stop = async (sig) => {
    console.log(`[relay] ${sig}: shutting down`);
    await relay.close();
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
