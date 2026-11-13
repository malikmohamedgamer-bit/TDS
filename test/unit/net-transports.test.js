// Transports (docs/multiplayer.md contract 2): LocalTransport over a fake (and the real Node)
// BroadcastChannel, RelayTransport against a scripted fake WebSocket speaking the relay protocol.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryHub } from '../../src/net/memoryTransport.js';
import { LocalTransport, RelayTransport, newPeerId, transportKind, relayUrl, createTransport } from '../../src/net/transports.js';

// ------------------------------------------------------------------ fakes -----------------------

/** BroadcastChannel stand-in on virtual time: async delivery to the other channels of a name. */
function channelBus(hub) {
  const open = new Set();
  return (name) => {
    const ch = {
      name,
      onmessage: null,
      postMessage(m) {
        const copy = structuredClone(m);
        for (const other of open) {
          if (other !== ch && other.name === name) hub.setTimeout(() => other.onmessage?.({ data: copy }), 1);
        }
      },
      close() { open.delete(ch); },
    };
    open.add(ch);
    return ch;
  };
}

/** A WebSocket class whose instances the test drives (open, receive frames, drop). */
function fakeSocketClass() {
  const sockets = [];
  class FakeWS {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closedWith = null;
      sockets.push(this);
    }

    send(s) { this.sent.push(JSON.parse(s)); }
    close(code, reason) { this.readyState = 3; this.closedWith = [code, reason]; }
    // test helpers
    open() { this.readyState = 1; this.onopen?.(); }
    recv(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
    drop() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
    ops() { return this.sent.map((f) => f.op); }
  }
  return { FakeWS, sockets };
}

const peer = (id, joinedAt, meta = {}) => ({ id, meta, joinedAt });

// ------------------------------------------------------------------ LocalTransport -------------

test('LocalTransport: presence, broadcast, directed messages, heartbeat timeout and bye', async () => {
  const hub = new MemoryHub();
  const bus = channelBus(hub);
  const mk = (id) => new LocalTransport({ id, channelFactory: bus, timers: hub.timers, clock: hub.clock });
  const a = mk('a');
  const b = mk('b');
  const c = mk('c');
  const status = [];
  a.onStatus((s) => status.push(s));
  const peersA = [];
  a.onPeers((l) => peersA.push(l.map((p) => p.id)));
  await a.join('ROOM', { name: 'A' });
  hub.advance(100);
  await b.join('ROOM', { name: 'B' });
  hub.advance(100);
  await c.join('ROOM', { name: 'C' });
  hub.advance(100);
  assert.deepEqual(status, ['connecting', 'open']);
  assert.deepEqual(peersA.at(-1), ['a', 'b', 'c'], 'joinedAt order, includes self');
  assert.deepEqual(c.peers.map((p) => [p.id, p.meta.name]), [['a', 'A'], ['b', 'B'], ['c', 'C']]);
  for (const t of [a, b]) assert.equal(t.peers.length, 3, 'the joiner is known at once (ask + answer)');

  const got = { a: [], b: [], c: [] };
  for (const [id, t] of [['a', a], ['b', b], ['c', c]]) t.onMessage((d, from) => got[id].push([d, from]));
  a.send({ hi: 1 });
  a.send({ only: 'c' }, 'c');
  hub.advance(10);
  assert.deepEqual(got.a, [], 'not to self');
  assert.deepEqual(got.b, [[{ hi: 1 }, 'a']]);
  assert.deepEqual(got.c, [[{ hi: 1 }, 'a'], [{ only: 'c' }, 'a']]);

  // b crashes (no bye, no heartbeat): gone after the 4 s timeout, not before
  hub.timers.clearInterval(b.hbTimer);
  b.channel.postMessage = () => {};
  hub.advance(3000);
  assert.equal(a.peers.length, 3);
  hub.advance(2100);
  assert.deepEqual(a.peers.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(c.peers.map((p) => p.id), ['a', 'c']);

  // c leaves politely: dropped at once
  c.close();
  hub.advance(10);
  assert.deepEqual(a.peers.map((p) => p.id), ['a']);
  assert.equal(c.status, 'closed');
  c.send({ after: 'close' }); // no-op, no throw
  a.close();
  assert.deepEqual(status, ['connecting', 'open', 'closed']);
});

test('LocalTransport: works over the real BroadcastChannel (Node has one)', { skip: LocalTransport.available() ? false : 'no BroadcastChannel' }, async () => {
  const a = new LocalTransport({ id: 'real-a', heartbeatMs: 50, timeoutMs: 200 });
  const b = new LocalTransport({ id: 'real-b', heartbeatMs: 50, timeoutMs: 200 });
  const room = `t${process.pid}`;
  try {
    await a.join(room, { name: 'A' });
    await b.join(room, { name: 'B' });
    const msg = new Promise((resolve) => b.onMessage((d, from) => resolve([d, from])));
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual(a.peers.map((p) => p.id).sort(), ['real-a', 'real-b']);
    a.send({ ping: 1 });
    assert.deepEqual(await msg, [{ ping: 1 }, 'real-a']);
  } finally {
    a.close();
    b.close();
  }
});

// ------------------------------------------------------------------ RelayTransport -------------

test('RelayTransport: join, peers, messages and the send queue follow the relay protocol', async () => {
  const hub = new MemoryHub();
  const { FakeWS, sockets } = fakeSocketClass();
  const t = new RelayTransport('wss://relay.test', { id: 'me', WebSocket: FakeWS, timers: hub.timers, clock: hub.clock });
  const status = [];
  t.onStatus((s) => status.push(s));
  const peerLists = [];
  t.onPeers((l) => peerLists.push(l.map((p) => p.id)));
  const msgs = [];
  t.onMessage((d, from) => msgs.push([d, from]));

  let joined = false;
  const p = t.join('ABC234', { name: 'Me', hero: 'h', version: 'v1' }).then(() => { joined = true; });
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://relay.test');
  t.send({ early: 1 }); // queued until joined
  sockets[0].open();
  assert.deepEqual(sockets[0].sent[0], { op: 'join', room: 'ABC234', peer: 'me', meta: { name: 'Me', hero: 'h', version: 'v1' } });
  await Promise.resolve();
  assert.equal(joined, false, 'not joined before the server says so');
  sockets[0].recv({ op: 'joined', peer: 'me', peers: [peer('host', 5, { name: 'H' }), peer('me', 9)] });
  await p;
  assert.equal(joined, true);
  assert.deepEqual(status, ['connecting', 'open']);
  assert.deepEqual(peerLists, [['host', 'me']]);
  assert.deepEqual(sockets[0].sent[1], { op: 'send', data: { early: 1 } }, 'queue flushed after the join');

  t.send({ a: 1 });
  t.send({ b: 2 }, 'host');
  assert.deepEqual(sockets[0].sent.slice(2), [{ op: 'send', data: { a: 1 } }, { op: 'send', data: { b: 2 }, to: 'host' }]);
  sockets[0].recv({ op: 'msg', from: 'host', data: { turn: 1 } });
  sockets[0].recv({ op: 'msg', from: 'me', data: { echo: true } }); // never from self
  sockets[0].onmessage({ data: 'not json' }); // ignored
  assert.deepEqual(msgs, [[{ turn: 1 }, 'host']]);
  sockets[0].recv({ op: 'peers', peers: [peer('host', 5), peer('me', 9), peer('x', 12)] });
  assert.deepEqual(peerLists.at(-1), ['host', 'me', 'x']);
  assert.deepEqual(t.peers.map((q) => q.id), ['host', 'me', 'x']);

  // app-level ping every pingMs; a pong gives the RTT
  hub.advance(10000);
  const ping = sockets[0].sent.at(-1);
  assert.equal(ping.op, 'ping');
  hub.advance(40);
  sockets[0].recv({ op: 'pong', ts: ping.ts });
  assert.equal(t.rttMs, 40);

  t.close();
  assert.equal(status.at(-1), 'closed');
  assert.deepEqual(sockets[0].closedWith, [1000, 'bye']);
  hub.advance(60000);
  assert.equal(sockets.length, 1, 'no reconnect after close()');
});

test('RelayTransport: reconnects with backoff 1 s, 2 s, 4 s ... max 10 s and rejoins the same room as the same peer', async () => {
  const hub = new MemoryHub();
  const { FakeWS, sockets } = fakeSocketClass();
  const t = new RelayTransport('wss://relay.test', { id: 'me', WebSocket: FakeWS, timers: hub.timers, clock: hub.clock });
  const status = [];
  t.onStatus((s) => status.push(s));
  const peerLists = [];
  t.onPeers((l) => peerLists.push(l.map((p) => p.id)));
  const p = t.join('ROOM22', { name: 'Me' });
  sockets[0].open();
  sockets[0].recv({ op: 'joined', peer: 'me', peers: [peer('h', 1), peer('me', 2)] });
  await p;

  // the socket drops; every retry fails at once; measure when each new socket is made
  sockets[0].drop();
  assert.equal(status.at(-1), 'closed');
  t.send({ queued: true });
  const madeAt = [];
  let last = sockets.length;
  for (let ms = 0; ms < 40000; ms += 50) {
    hub.advance(50);
    if (sockets.length > last) {
      madeAt.push(hub.now);
      last = sockets.length;
      if (madeAt.length < 6) sockets.at(-1).drop();
    }
  }
  const gaps = madeAt.map((at, i) => at - (i ? madeAt[i - 1] : 0));
  assert.deepEqual(gaps.slice(0, 6), [1000, 2000, 4000, 8000, 10000, 10000]);
  assert.deepEqual(madeAt.length, 6, 'the 6th socket is still connecting (not dropped)');
  assert.ok(status.includes('connecting'));
  assert.deepEqual(peerLists, [['h', 'me']], 'a drop does not empty the peer list');

  // the 6th attempt connects: rejoin with the same room and peer id, then the queue flushes
  const ws = sockets.at(-1);
  ws.open();
  assert.deepEqual(ws.sent[0], { op: 'join', room: 'ROOM22', peer: 'me', meta: { name: 'Me' } });
  ws.recv({ op: 'joined', peer: 'me', peers: [peer('h', 1), peer('me', 2), peer('n', 3)] });
  assert.equal(status.at(-1), 'open');
  assert.deepEqual(peerLists.at(-1), ['h', 'me', 'n'], 'peers update after the rejoin');
  assert.deepEqual(ws.sent[1], { op: 'send', data: { queued: true } });
  // the backoff starts over after a successful rejoin
  ws.drop();
  hub.advance(999);
  const before = sockets.length;
  hub.advance(2);
  assert.equal(sockets.length, before + 1);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => t.backoff(n)), [1000, 2000, 4000, 8000, 10000, 10000]);
  t.close();
});

test('RelayTransport: a refused first join rejects; a silent socket is replaced', async () => {
  const hub = new MemoryHub();
  const { FakeWS, sockets } = fakeSocketClass();
  const t = new RelayTransport('wss://relay.test', { id: 'me', WebSocket: FakeWS, timers: hub.timers, clock: hub.clock });
  const errors = [];
  t.onError((e) => errors.push(e));
  const status = [];
  t.onStatus((s) => status.push(s));
  const p = t.join('FULL22', {});
  sockets[0].open();
  sockets[0].recv({ op: 'error', code: 'full', message: 'Room is full' });
  await assert.rejects(p, (err) => err.code === 'full' && /full/.test(err.message));
  assert.deepEqual(errors, [{ code: 'full', message: 'Room is full' }]);
  assert.equal(status.at(-1), 'error');
  hub.advance(30000);
  assert.equal(sockets.length, 1, 'no retry after a refusal');

  // dead-socket detection: no traffic for deadMs while open -> reconnect
  const t2 = new RelayTransport('wss://relay.test', { id: 'me2', WebSocket: FakeWS, timers: hub.timers, clock: hub.clock, pingMs: 1000, deadMs: 5000 });
  const p2 = t2.join('ROOM22', {});
  const ws = sockets.at(-1);
  ws.open();
  ws.recv({ op: 'joined', peer: 'me2', peers: [] });
  await p2;
  assert.deepEqual(t2.peers.map((q) => q.id), ['me2'], 'self is always listed');
  const n = sockets.length;
  hub.advance(7000);
  assert.ok(ws.closedWith, 'the silent socket was closed');
  assert.ok(sockets.length > n, 'and replaced');
  t2.close();

  // a server error while rejoining is retried (the old seat may still be held)
  const t3 = new RelayTransport('wss://relay.test', { id: 'me3', WebSocket: FakeWS, timers: hub.timers, clock: hub.clock });
  const p3 = t3.join('ROOM22', {});
  sockets.at(-1).open();
  sockets.at(-1).recv({ op: 'joined', peer: 'me3', peers: [] });
  await p3;
  sockets.at(-1).drop();
  hub.advance(1000);
  const re = sockets.at(-1);
  re.open();
  re.recv({ op: 'error', code: 'full', message: 'Room is full' });
  const count = sockets.length;
  hub.advance(2000);
  assert.equal(sockets.length, count + 1, 'retried');
  t3.close();

  // join timeout and missing WebSocket
  const t4 = new RelayTransport('wss://relay.test', { WebSocket: FakeWS, timers: hub.timers, clock: hub.clock, joinTimeoutMs: 3000 });
  const p4 = t4.join('ROOM22', {});
  hub.advance(3001);
  await assert.rejects(p4, (err) => err.code === 'timeout');
  await assert.rejects(new RelayTransport('wss://x', { WebSocket: null }).join('R', {}), /WebSocket/);
});

// ------------------------------------------------------------------ helpers --------------------

test('transports: peer ids, transport choice and URL overrides', async () => {
  const ids = new Set(Array.from({ length: 200 }, () => newPeerId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-z]{10}$/);
  assert.equal(transportKind({}), 'local');
  assert.equal(transportKind({ transport: 'relay' }), 'relay');
  assert.equal(transportKind({ transport: 'relay' }, '?net=supabase'), 'supabase');
  assert.equal(transportKind({ transport: 'relay' }, '?net=bogus'), 'relay');
  assert.equal(relayUrl({ relayUrl: 'wss://a' }), 'wss://a');
  assert.equal(relayUrl({ relayUrl: 'wss://a' }, '?relay=ws://localhost:8787'), 'ws://localhost:8787');
  assert.equal(relayUrl({ relayUrl: 'wss://a' }, '?relay=javascript:alert(1)'), 'wss://a', 'only ws/wss overrides');
  const relay = await createTransport({ transport: 'relay', relayUrl: 'wss://r' }, { search: '', id: 'keep' });
  assert.ok(relay instanceof RelayTransport);
  assert.equal(relay.id, 'keep');
  await assert.rejects(createTransport({ transport: 'relay' }, { search: '' }), /relay URL/);
  await assert.rejects(createTransport({ transport: 'supabase' }, { search: '' }), /Supabase is not configured/);
  if (LocalTransport.available()) assert.ok((await createTransport({}, { search: '' })) instanceof LocalTransport);
});
