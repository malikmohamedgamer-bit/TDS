// TDS relay server: a tiny WebSocket message relay for online co-op (docs/multiplayer.md,
// contract 4). It knows nothing about the game: peers join a room by code and the server forwards
// their JSON messages to the other peers in that room. The lockstep session (src/net/lockstep.js)
// does everything game related on the clients.
//
// Protocol (full description in server/README.md):
//   client -> server  {op:'join', room, peer, meta}   {op:'send', data, to?}   {op:'ping', ts}
//   server -> client  {op:'joined', peer, peers}  {op:'peers', peers}  {op:'msg', from, data}
//                     {op:'error', code, message}  {op:'pong', ts}
//
// Run: `node relay.mjs` (or `npm start` in server/). Environment:
//   PORT              listen port (default 8787; 0 picks a free port, logged on start)
//   ALLOWED_ORIGINS   comma separated list of allowed page origins; empty = allow all
//   HEARTBEAT_MS      WebSocket ping interval (default 15000); a peer that misses one is dropped
//   MAX_CLIENTS       maximum simultaneous sockets (default 500)
//   RATE_PER_SEC, RATE_BURST   per-socket token bucket (default 60 messages/s, burst 120)
//   JOIN_TIMEOUT_MS   a socket that has not joined a room after this long is closed (default 30000)
//
// Only dependency: `ws`. Node 18+.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

/** Room codes: 4-12 characters, upper case letters and digits. */
export const ROOM_RE = /^[A-Z0-9]{4,12}$/;
/** Peer ids are chosen by the client: 1-64 characters of [A-Za-z0-9_-]. */
export const PEER_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const DEFAULTS = Object.freeze({
  port: 8787,
  maxPeers: 4,                // peers per room
  maxBytes: 512 * 1024,       // largest accepted message (UTF-8 bytes), larger -> 'too_big'
  maxMetaBytes: 4 * 1024,     // largest join meta (JSON bytes)
  maxClients: 500,            // simultaneous sockets for the whole server
  ratePerSec: 60,             // token bucket refill per socket
  rateBurst: 120,             // token bucket size
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

  /** @type {Map<string, Map<string, Peer>>} room code -> (peer id -> peer) */
  const rooms = new Map();
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

  function sendJson(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
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
    for (const p of r.values()) if (p.ws !== skip && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
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
    if (r.size === 0) rooms.delete(room);
    else broadcastPeers(room, null);
  }

  // ---- message handlers --------------------------------------------------------------------------
  function onJoin(ws, msg) {
    const { room, peer } = msg;
    if (typeof room !== 'string' || !ROOM_RE.test(room)) return sendError(ws, 'bad_room', 'room code must be 4-12 characters A-Z 0-9');
    if (typeof peer !== 'string' || !PEER_RE.test(peer)) return sendError(ws, 'bad_peer', 'peer id must be 1-64 characters A-Z a-z 0-9 _ -');
    const meta = msg.meta == null ? {} : msg.meta;
    if (typeof meta !== 'object' || Array.isArray(meta)) return sendError(ws, 'bad_meta', 'meta must be an object');
    if (Buffer.byteLength(JSON.stringify(meta)) > cfg.maxMetaBytes) return sendError(ws, 'bad_meta', `meta is larger than ${cfg.maxMetaBytes} bytes`);

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
      // Reconnect: the same peer id takes over its slot. The old socket is told and closed; its
      // close handler sees that it no longer owns the slot and does not announce a leave.
      joinedAt = existing.joinedAt;
      if (existing.ws !== ws) {
        sendError(existing.ws, 'replaced', 'this peer id connected again from another socket');
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
    const out = JSON.stringify({ op: 'msg', from: st.peer, data: msg.data });
    if (msg.to != null) {
      const p = typeof msg.to === 'string' ? r.get(msg.to) : null;
      if (!p) return sendError(ws, 'no_peer', `no peer ${String(msg.to).slice(0, 64)} in this room`);
      if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(out);
      return;
    }
    for (const p of r.values()) if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(out);
  }

  /** Token bucket: refills `ratePerSec` per second up to `rateBurst`; one message costs one token. */
  function takeToken(st) {
    const now = Date.now();
    st.tokens = Math.min(cfg.rateBurst, st.tokens + ((now - st.refilledAt) / 1000) * cfg.ratePerSec);
    st.refilledAt = now;
    if (st.tokens < 1) return false;
    st.tokens -= 1;
    return true;
  }

  function onMessage(ws, raw, isBinary) {
    const st = ws.tds;
    if (!takeToken(st)) {
      // drop; tell the client at most once a second so a flood does not create a reply flood
      const now = Date.now();
      if (now - st.rateErrorAt >= 1000) {
        st.rateErrorAt = now;
        sendError(ws, 'rate', `more than ${cfg.ratePerSec} messages per second: message dropped`);
      }
      return;
    }
    const bytes = raw.length;
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
