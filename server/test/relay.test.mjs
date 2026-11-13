// Relay server tests: every test talks to a real `node relay.mjs` child process on a free port
// (PORT=0, the chosen port is read from its start-up log line), over real WebSockets.
// Run: cd server && npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { RelayTransport } from '../../src/net/transports.js';

const RELAY = fileURLToPath(new URL('../relay.mjs', import.meta.url));

/** Starts the relay with extra env vars; resolves { url, http, proc, stop }. */
function startRelay(env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [RELAY], { env: { ...process.env, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`relay did not start: ${out}`)), 10000);
    proc.stdout.on('data', (d) => {
      out += d;
      const m = /listening on port (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        const port = Number(m[1]);
        resolve({
          proc,
          url: `ws://127.0.0.1:${port}`,
          http: `http://127.0.0.1:${port}`,
          stop: () => new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); }),
        });
      }
    });
    proc.stderr.on('data', (d) => { out += d; });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error(`relay exited (${code}): ${out}`)); });
  });
}

/**
 * A test client: collects every server message and lets a test wait for one matching a predicate.
 * Messages are consumed in order, so two waits for the same kind see two different messages.
 */
function client(url, opts = {}) {
  const ws = new WebSocket(url, opts);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const c = {
    ws,
    inbox,
    open: () => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }),
    send: (obj) => ws.send(JSON.stringify(obj)),
    /** Resolves with the next message for which pred(msg) is true (or rejects after ms). */
    next(pred, ms = 3000) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { clearTimeout(t); resolve(m); } };
        const t = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error('timed out waiting for a message'));
        }, ms);
        waiters.push(w);
      });
    },
    op: (name, ms) => c.next((m) => m.op === name, ms),
    closed: () => new Promise((res) => {
      if (ws.readyState === WebSocket.CLOSED) res({ code: -1 });
      else ws.once('close', (code, reason) => res({ code, reason: reason.toString() }));
    }),
    close: () => ws.close(),
  };
  return c;
}

/** Opens a client and joins `room` as `peer`; resolves [client, joinedMessage]. */
async function joined(url, room, peer, meta = { name: peer }, secret) {
  const c = client(url);
  await c.open();
  c.send(secret === undefined ? { op: 'join', room, peer, meta } : { op: 'join', room, peer, meta, secret });
  const msg = await c.next((m) => m.op === 'joined' || m.op === 'error');
  return [c, msg];
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let roomSeq = 0;
const room = () => `ROOM${String(++roomSeq).padStart(2, '0')}`;

describe('relay with default settings', () => {
  let R;
  before(async () => { R = await startRelay(); });
  after(async () => { await R.stop(); });

  test('join returns own id and the peer list; others get a peers update', async () => {
    const code = room();
    const [a, ja] = await joined(R.url, code, 'alice', { name: 'Alice', hero: 'warden' });
    assert.equal(ja.op, 'joined');
    assert.equal(ja.peer, 'alice');
    assert.equal(ja.peers.length, 1);
    assert.deepEqual(ja.peers[0].meta, { name: 'Alice', hero: 'warden' });
    assert.equal(typeof ja.peers[0].joinedAt, 'number');

    const [b, jb] = await joined(R.url, code, 'bob');
    assert.deepEqual(jb.peers.map((p) => p.id), ['alice', 'bob'], 'oldest first, includes self');
    const upd = await a.op('peers');
    assert.deepEqual(upd.peers.map((p) => p.id), ['alice', 'bob']);
    a.close(); b.close();
  });

  test('broadcast reaches the others but is never echoed to the sender', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a1');
    const [b] = await joined(R.url, code, 'b1');
    const [c] = await joined(R.url, code, 'c1');
    a.send({ op: 'send', data: { t: 'turn', upTo: 6 } });
    const mb = await b.op('msg');
    const mc = await c.op('msg');
    assert.deepEqual(mb, { op: 'msg', from: 'a1', data: { t: 'turn', upTo: 6 } });
    assert.deepEqual(mc, mb);
    // a ping round trip after the send proves the server is done with it; a got no echo
    a.send({ op: 'ping', ts: 42 });
    assert.deepEqual(await a.op('pong'), { op: 'pong', ts: 42 });
    assert.equal(a.inbox.filter((m) => m.op === 'msg').length, 0);
    a.close(); b.close(); c.close();
  });

  test('directed send delivers to one peer only; unknown target is an error', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a2');
    const [b] = await joined(R.url, code, 'b2');
    const [c] = await joined(R.url, code, 'c2');
    a.send({ op: 'send', data: 'for c', to: 'c2' });
    assert.deepEqual(await c.op('msg'), { op: 'msg', from: 'a2', data: 'for c' });
    b.send({ op: 'ping', ts: 1 });
    await b.op('pong');
    assert.equal(b.inbox.filter((m) => m.op === 'msg').length, 0, 'b must not see a message sent to c');
    a.send({ op: 'send', data: 1, to: 'nobody' });
    assert.equal((await a.op('error')).code, 'no_peer');
    a.close(); b.close(); c.close();
  });

  test('leaving updates the peers list; an empty room is deleted', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a3');
    const [b] = await joined(R.url, code, 'b3');
    await a.op('peers'); // b joined
    b.close();
    const upd = await a.op('peers');
    assert.deepEqual(upd.peers.map((p) => p.id), ['a3']);
    a.close();
    await a.closed();
    // earlier tests' sockets may still be closing: poll until the server has settled
    let h;
    for (let i = 0; i < 40; i++) {
      h = await (await fetch(`${R.http}/health`)).json();
      if (h.rooms === 0) break;
      await delay(50);
    }
    assert.equal(h.ok, true);
    assert.equal(h.rooms, 0, 'empty rooms are removed');
    assert.equal(h.peers, 0);
  });

  test('a 5th peer is refused with code full', async () => {
    const code = room();
    const cs = [];
    for (let i = 0; i < 4; i++) cs.push((await joined(R.url, code, `p${i}`))[0]);
    const [e, je] = await joined(R.url, code, 'p4');
    assert.equal(je.op, 'error');
    assert.equal(je.code, 'full');
    // the refused socket is not in the room: a broadcast does not reach it
    cs[0].send({ op: 'send', data: 'hi' });
    await cs[1].op('msg');
    e.send({ op: 'ping', ts: 2 });
    await e.op('pong');
    assert.equal(e.inbox.filter((m) => m.op === 'msg').length, 0);
    for (const c of [...cs, e]) c.close();
  });

  test('a message over 512 KB is refused with too_big and not relayed', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a5');
    const [b] = await joined(R.url, code, 'b5');
    a.send({ op: 'send', data: 'x'.repeat(512 * 1024 + 10) });
    assert.equal((await a.op('error')).code, 'too_big');
    a.send({ op: 'send', data: 'x'.repeat(400 * 1024) }); // under the limit: delivered
    assert.equal((await b.op('msg', 5000)).data.length, 400 * 1024);
    assert.equal(b.inbox.filter((m) => m.op === 'msg').length, 0, 'the oversize one never arrived');
    a.close(); b.close();
  });

  test('flooding past the rate limit drops messages and reports rate', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a6');
    const [b] = await joined(R.url, code, 'b6');
    for (let i = 0; i < 300; i++) a.send({ op: 'send', data: i });
    const err = await a.op('error');
    assert.equal(err.code, 'rate');
    await delay(500);
    const got = b.inbox.filter((m) => m.op === 'msg').length;
    // burst 120 (the join used one token) plus at most ~60/s of refill during the flood
    assert.ok(got >= 100 && got < 200, `delivered ${got} of 300`);
    // after a pause the bucket refills and messages flow again
    await delay(1000);
    b.inbox.length = 0;
    a.send({ op: 'send', data: 'after' });
    assert.equal((await b.next((m) => m.op === 'msg' && m.data === 'after')).data, 'after');
    a.close(); b.close();
  });

  test('the same peer id joining again replaces the old socket and keeps its slot', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a7');
    const [b1, j1] = await joined(R.url, code, 'b7', { name: 'old' });
    await a.op('peers');
    const firstJoinedAt = j1.peers.find((p) => p.id === 'b7').joinedAt;
    await delay(20);
    const [b2, j2] = await joined(R.url, code, 'b7', { name: 'new' });
    assert.equal(j2.op, 'joined');
    const me = j2.peers.find((p) => p.id === 'b7');
    assert.equal(j2.peers.length, 2);
    assert.equal(me.joinedAt, firstJoinedAt, 'reconnect keeps the original join time (and order)');
    assert.deepEqual(me.meta, { name: 'new' });
    assert.equal((await b1.op('error')).code, 'replaced');
    assert.equal((await b1.closed()).code, 4001);
    // the old socket closing must not remove the new one
    await delay(100);
    a.send({ op: 'send', data: 'still there?' });
    assert.equal((await b2.op('msg')).data, 'still there?');
    const lastPeers = a.inbox.filter((m) => m.op === 'peers').pop();
    if (lastPeers) assert.equal(lastPeers.peers.length, 2);
    a.close(); b2.close();
  });

  test('a peer id with a secret cannot be taken over with another secret (or none)', async () => {
    const code = room();
    const S1 = 'a'.repeat(32);
    const S2 = 'b'.repeat(32);
    const [host] = await joined(R.url, code, 'host9', { name: 'Host' }, S1);
    const [b] = await joined(R.url, code, 'b9', { name: 'B' }, 'c'.repeat(32));
    await host.op('peers');
    // impostors: another secret, no secret, or a bad one
    const [x, jx] = await joined(R.url, code, 'host9', { name: 'Evil' }, S2);
    assert.equal(jx.op, 'error');
    assert.equal(jx.code, 'taken');
    const [y, jy] = await joined(R.url, code, 'host9', { name: 'Evil' });
    assert.equal(jy.code, 'taken', 'a legacy join without a secret cannot take a secured id');
    const [z, jz] = await joined(R.url, code, 'host9', {}, 'short');
    assert.equal(jz.code, 'bad_secret');
    // the real host was not replaced and still gets messages
    b.send({ op: 'send', data: 'to host', to: 'host9' });
    assert.equal((await host.op('msg')).data, 'to host');
    assert.equal(host.inbox.filter((m) => m.op === 'error').length, 0, 'the host saw no replaced');
    // the same secret is the same player: it takes over the slot and the old socket is told why
    const [host2, j2] = await joined(R.url, code, 'host9', { name: 'Host' }, S1);
    assert.equal(j2.op, 'joined');
    const rep = await host.op('error');
    assert.deepEqual(rep, { op: 'error', code: 'replaced', message: 'This room was opened in another tab or window' });
    assert.equal((await host.closed()).code, 4001);
    // after the host left, its id stays reserved for its secret (grace period)
    host2.close();
    await b.next((m) => m.op === 'peers' && !m.peers.some((p) => p.id === 'host9'));
    const [w, jw] = await joined(R.url, code, 'host9', { name: 'Evil' }, S2);
    assert.equal(jw.code, 'taken', 'reserved while gone');
    const [host3, j3] = await joined(R.url, code, 'host9', { name: 'Host' }, S1);
    assert.equal(j3.op, 'joined', 'the owner gets back in (a page reload)');
    for (const c of [x, y, z, w, host3, b]) c.close();
  });

  test('from is always the sender socket, never a field the client sends', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a10', {}, 'd'.repeat(32));
    const [b] = await joined(R.url, code, 'b10', {}, 'e'.repeat(32));
    a.send({ op: 'send', from: 'b10', data: 'forged?' });
    assert.deepEqual(await b.op('msg'), { op: 'msg', from: 'a10', data: 'forged?' });
    a.close(); b.close();
  });

  test('an emptied room forgets its claims', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'solo', {}, 'f'.repeat(32));
    a.close();
    await a.closed();
    let j;
    for (let i = 0; i < 40; i++) {
      const [c, jc] = await joined(R.url, code, 'solo', {}, 'g'.repeat(32));
      c.close();
      j = jc;
      if (jc.op === 'joined') break;
      await delay(50); // the server may not have processed the close yet
    }
    assert.equal(j.op, 'joined');
  });

  test('bad input gets clear error codes', async () => {
    const c = client(R.url);
    await c.open();
    c.send({ op: 'send', data: 1 });
    assert.equal((await c.op('error')).code, 'not_joined');
    c.send({ op: 'join', room: 'ab', peer: 'x' });
    assert.equal((await c.op('error')).code, 'bad_room');
    c.send({ op: 'join', room: 'abcd', peer: 'x' });
    assert.equal((await c.op('error')).code, 'bad_room', 'lower case is not a room code');
    c.send({ op: 'join', room: 'ABCD', peer: 'bad id!' });
    assert.equal((await c.op('error')).code, 'bad_peer');
    c.send({ op: 'join', room: 'ABCD', peer: 'x', meta: { big: 'y'.repeat(5000) } });
    assert.equal((await c.op('error')).code, 'bad_meta');
    c.ws.send('not json');
    assert.equal((await c.op('error')).code, 'bad_json');
    c.send({ op: 'dance' });
    assert.equal((await c.op('error')).code, 'bad_op');
    c.close();
  });

  test('GET /health returns ok with room and peer counts; other paths 404', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a8');
    const [b] = await joined(R.url, code, 'b8');
    const res = await fetch(`${R.http}/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const h = await res.json();
    assert.equal(h.ok, true);
    assert.ok(h.rooms >= 1);
    assert.ok(h.peers >= 2);
    assert.equal((await fetch(`${R.http}/nope`)).status, 404);
    a.close(); b.close();
  });
});

describe('relay with ALLOWED_ORIGINS', () => {
  let R;
  before(async () => { R = await startRelay({ ALLOWED_ORIGINS: 'https://game.example, http://localhost:5173/' }); });
  after(async () => { await R.stop(); });

  test('an allowed origin connects (trailing slash and case are ignored)', async () => {
    const c = client(R.url, { origin: 'HTTP://localhost:5173' });
    await c.open();
    c.send({ op: 'ping', ts: 3 });
    assert.equal((await c.op('pong')).ts, 3);
    c.close();
    const d = client(R.url, { origin: 'https://game.example' });
    await d.open();
    d.close();
  });

  test('another origin, or none, is refused with 403 before the handshake', async () => {
    for (const origin of ['https://evil.example', undefined]) {
      const ws = new WebSocket(R.url, origin ? { origin } : {});
      const status = await new Promise((resolve) => {
        ws.once('unexpected-response', (req, res) => resolve(res.statusCode));
        ws.once('error', () => resolve('error'));
        ws.once('open', () => resolve('open'));
      });
      assert.equal(status, 403, `origin ${origin}`);
      ws.terminate();
    }
  });
});

describe('relay peer grace period', () => {
  let R;
  before(async () => { R = await startRelay({ PEER_GRACE_MS: '200' }); });
  after(async () => { await R.stop(); });

  test('a gone peer id is free for another secret after PEER_GRACE_MS', async () => {
    const code = room();
    const [stay] = await joined(R.url, code, 'stay', {}, 'h'.repeat(32));
    const [gone] = await joined(R.url, code, 'gone', {}, 'i'.repeat(32));
    await stay.op('peers');
    gone.close();
    await stay.op('peers');
    const [x, jx] = await joined(R.url, code, 'gone', {}, 'j'.repeat(32));
    assert.equal(jx.code, 'taken');
    x.close();
    await delay(350);
    const [y, jy] = await joined(R.url, code, 'gone', {}, 'j'.repeat(32));
    assert.equal(jy.op, 'joined');
    stay.close(); y.close();
  });
});

describe('relay byte rate limit', () => {
  let R;
  // the byte burst is raised to the 512 KB message limit, so 50 KB/s with burst 0 means 512 KB
  before(async () => { R = await startRelay({ RATE_BYTES_PER_SEC: '50000', RATE_BYTES_BURST: '0' }); });
  after(async () => { await R.stop(); });

  test('more bytes than the bucket allows are dropped with rate', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'a11');
    const [b] = await joined(R.url, code, 'b11');
    for (let i = 0; i < 10; i++) a.send({ op: 'send', data: 'x'.repeat(100000) });
    const err = await a.op('error');
    assert.equal(err.code, 'rate');
    assert.match(err.message, /bytes per second/);
    a.send({ op: 'ping', ts: 5 });
    await a.op('pong');
    await delay(200);
    const got = b.inbox.filter((m) => m.op === 'msg').length;
    assert.ok(got >= 4 && got <= 6, `delivered ${got} of 10 (about 512 KB)`);
    // small messages pass again once the bucket refilled a little
    await delay(1100);
    a.send({ op: 'send', data: 'small' });
    assert.equal((await b.next((m) => m.op === 'msg' && m.data === 'small')).data, 'small');
    a.close(); b.close();
  });
});

describe('relay backpressure', () => {
  let R;
  before(async () => {
    R = await startRelay({ MAX_BUFFERED_BYTES: String(256 * 1024), RATE_BYTES_PER_SEC: '1000000000', RATE_BYTES_BURST: '1000000000' });
  });
  after(async () => { await R.stop(); });

  test('a receiver that stops reading is terminated instead of buffered without limit', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'sender');
    const [r] = await joined(R.url, code, 'reader'); // keeps reading: must survive
    const [b] = await joined(R.url, code, 'stalled');
    await a.op('peers');
    await a.op('peers');
    b.ws.pause(); // stop reading: the kernel buffers fill, then the relay's send queue grows
    const chunk = 'x'.repeat(400 * 1024);
    const isDrop = (m) => m.op === 'peers' && !m.peers.some((p) => p.id === 'stalled');
    let sent = 0;
    for (; sent < 100 && !a.inbox.some(isDrop); sent++) {
      a.send({ op: 'send', data: chunk });
      await delay(10);
    }
    const dropped = await a.next(isDrop, 5000);
    assert.deepEqual(dropped.peers.map((p) => p.id), ['sender', 'reader']);
    assert.ok(sent > 1 && sent < 100, `terminated after ${sent} messages of 400 KB (the kernel buffers absorb the first ones)`);
    // the sender and the reading peer are unaffected; the reader got every message
    a.send({ op: 'send', data: 'last', to: 'reader' });
    await r.next((m) => m.op === 'msg' && m.data === 'last', 10000);
    assert.equal(r.inbox.filter((m) => m.op === 'msg').length, sent, 'the reader received all big messages');
    a.send({ op: 'ping', ts: 6 });
    assert.equal((await a.op('pong')).ts, 6);
    b.ws.resume();
    b.ws.terminate();
    a.close(); r.close();
  });
});

describe('relay heartbeat', () => {
  let R;
  before(async () => { R = await startRelay({ HEARTBEAT_MS: '150', JOIN_TIMEOUT_MS: '400' }); });
  after(async () => { await R.stop(); });

  test('a peer that stops answering pings is terminated and the room is told', async () => {
    const code = room();
    const [a] = await joined(R.url, code, 'alive');
    // autoPong false: this client never answers the server ping, like a dead connection
    const dead = client(R.url, { autoPong: false });
    await dead.open();
    dead.send({ op: 'join', room: code, peer: 'dead', meta: {} });
    await dead.op('joined');
    await a.op('peers'); // dead joined
    const upd = await a.op('peers', 3000); // dead dropped after missing a ping
    assert.deepEqual(upd.peers.map((p) => p.id), ['alive']);
    await dead.closed();
    // a live client (default autoPong) survives many heartbeats
    await delay(500);
    a.send({ op: 'ping', ts: 4 });
    assert.equal((await a.op('pong')).ts, 4);
    a.close();
  });

  test('a socket that never joins a room is closed after JOIN_TIMEOUT_MS', async () => {
    const c = client(R.url);
    await c.open();
    const t0 = Date.now();
    assert.equal((await c.closed()).code, 4000);
    assert.ok(Date.now() - t0 < 3000);
  });
});

describe('relay with the game client (src/net/transports.js RelayTransport)', () => {
  let R;
  before(async () => { R = await startRelay(); });
  after(async () => { await R.stop(); });

  /** A RelayTransport on the ws package (Node 18 has no global WebSocket). */
  const mkT = (id, secret) => new RelayTransport(R.url, { id, secret, WebSocket });
  const until = async (fn, ms = 3000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('timed out');
      await delay(10);
    }
  };

  test('impostor refused as taken, duplicated tab ends as replaced, reload rejoins', async () => {
    const code = room();
    const all = [];
    const mk = (id, secret) => { const t = mkT(id, secret); all.push(t); return t; };
    const host = mk('hostT');
    const guest = mk('guestT');
    try {
      const got = [];
      guest.onMessage((d, from) => got.push([d, from]));
      await host.join(code, { name: 'Host' });
      await guest.join(code, { name: 'Guest' });
      host.send({ hello: 1 });
      await until(() => got.length === 1);
      assert.deepEqual(got[0], [{ hello: 1 }, 'hostT']);

      // someone in the room tries to become the host with their own secret
      const evil = mk('hostT');
      await assert.rejects(evil.join(code, { name: 'Evil' }), (e) => e.code === 'taken');
      assert.equal(evil.status, 'error');
      host.send({ still: 'host' });
      await until(() => got.length === 2);
      assert.deepEqual(got[1], [{ still: 'host' }, 'hostT']);

      // a duplicated tab: same id and secret. The newer one wins, the older one stops for good.
      const dup = mk('hostT', host.secret);
      const hostErrors = [];
      host.onError((e) => hostErrors.push(e));
      await dup.join(code, { name: 'Host' });
      await until(() => host.status === 'replaced');
      assert.deepEqual(hostErrors.map((e) => e.code), ['replaced']);
      await delay(1500); // longer than the first reconnect backoff: the old tab must not come back
      assert.equal(host.status, 'replaced');
      assert.equal(dup.status, 'open');
      dup.send({ from: 'dup' });
      await until(() => got.length === 3);
      assert.deepEqual(got[2], [{ from: 'dup' }, 'hostT']);

      // a page reload: the tab closes, a new transport with the stored id + secret rejoins
      dup.close();
      await until(() => guest.peers.length === 1);
      const reloaded = mk('hostT', host.secret);
      await reloaded.join(code, { name: 'Host' });
      await until(() => guest.peers.length === 2);
      assert.deepEqual(guest.peers.map((p) => p.id).sort(), ['guestT', 'hostT']);
      assert.equal(reloaded.status, 'open');
    } finally {
      for (const t of all) t.close();
    }
  });
});
