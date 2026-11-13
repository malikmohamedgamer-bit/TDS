// Relay server tests: every test talks to a real `node relay.mjs` child process on a free port
// (PORT=0, the chosen port is read from its start-up log line), over real WebSockets.
// Run: cd server && npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

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
async function joined(url, room, peer, meta = { name: peer }) {
  const c = client(url);
  await c.open();
  c.send({ op: 'join', room, peer, meta });
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
