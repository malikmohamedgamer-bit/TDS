// Chunking of large session messages (src/net/chunk.js) and the in-memory test network
// (src/net/memoryTransport.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BYTES, splitUtf8, Reassembler } from '../../src/net/chunk.js';
import { MemoryHub } from '../../src/net/memoryTransport.js';

const utf8 = (s) => Buffer.byteLength(s, 'utf8');

test('chunk: splitUtf8 keeps parts under the byte limit and never splits a character', () => {
  assert.equal(CHUNK_BYTES, 48 * 1024);
  assert.deepEqual(splitUtf8(''), ['']);
  assert.deepEqual(splitUtf8('abc', 4), ['abc']);
  const text = `${'a'.repeat(100)}${'é'.repeat(70)}${'€'.repeat(50)}${'😀'.repeat(40)}x`;
  for (const max of [4, 5, 7, 64, 1000]) {
    const parts = splitUtf8(text, max);
    assert.equal(parts.join(''), text, `max ${max}`);
    for (const p of parts) {
      assert.ok(utf8(p) <= max, `part of ${utf8(p)} bytes > ${max}`);
      assert.equal(Buffer.from(p, 'utf8').toString('utf8'), p, 'valid on its own (no lone surrogate)');
    }
  }
  const big = 'x'.repeat(CHUNK_BYTES * 2 + 10);
  assert.deepEqual(splitUtf8(big).map((p) => p.length), [CHUNK_BYTES, CHUNK_BYTES, 10]);
  assert.throws(() => splitUtf8('abc', 3), /at least 4/);
});

test('chunk: Reassembler joins parts in any order, ignores duplicates and stale transfers', () => {
  const r = new Reassembler();
  const parts = splitUtf8('hello wörld, a longer message', 6);
  const msgs = parts.map((data, part) => ({ id: 3, part, of: parts.length, data }));
  const order = [...msgs].reverse();
  let whole = null;
  for (const [i, m] of order.entries()) {
    whole = r.add(m, i);
    if (i < order.length - 1) {
      assert.equal(whole, null);
      assert.equal(r.pending, true);
      assert.equal(r.add(m), null, 'duplicate ignored');
    }
  }
  assert.equal(whole, parts.join(''));
  assert.equal(r.pending, false);
  assert.equal(r.add(msgs[0]), null, 'a late duplicate of a finished transfer is ignored');
  assert.equal(r.add({ id: 2, part: 0, of: 1, data: 'old' }), null, 'older id rejected');
  // a newer transfer supersedes a partial one; missing() lists what is still out
  r.add({ id: 4, part: 0, of: 3, data: 'a' });
  r.add({ id: 4, part: 2, of: 3, data: 'c' });
  assert.deepEqual(r.missing(), [1]);
  assert.equal(r.add({ id: 5, part: 0, of: 2, data: 'x' }), null);
  assert.deepEqual(r.missing(), [1]);
  assert.equal(r.add({ id: 4, part: 1, of: 3, data: 'b' }), null, 'superseded transfer');
  assert.equal(r.add({ id: 5, part: 1, of: 2, data: 'y' }), 'xy');
  // malformed parts
  for (const bad of [null, { id: 6, part: 0, of: 0, data: '' }, { id: 6, part: 2, of: 2, data: '' }, { id: 6, part: 0, of: 1 }, { id: 6, part: 0.5, of: 1, data: '' }]) {
    assert.equal(r.add(bad), null);
  }
  r.add({ id: 7, part: 0, of: 2, data: 'p' });
  r.reset();
  assert.equal(r.pending, false);
  assert.equal(r.add({ id: 7, part: 1, of: 2, data: 'q' }), null, 'a reset transfer does not complete');
});

test('memory net: latency, FIFO order, drop rate and presence', async () => {
  const hub = new MemoryHub({ latency: [50, 100], jitter: 30, drop: 0, seed: 'm1' });
  const a = hub.transport('a');
  const b = hub.transport('b');
  const c = hub.transport('c');
  const peersB = [];
  b.onPeers((l) => peersB.push(l.map((p) => p.id)));
  await a.join('R', { name: 'A' });
  await b.join('R', { name: 'B' });
  hub.advance(0);
  assert.deepEqual(peersB.at(-1), ['a', 'b']);
  assert.deepEqual(b.peers.map((p) => p.meta.name), ['A', 'B']);
  const got = [];
  b.onMessage((d, from) => got.push([d.n, from, hub.now]));
  for (let n = 0; n < 50; n++) a.send({ n });
  a.send({ n: 'only-c' }, 'c'); // c is not in the room: nothing
  hub.advance(10);
  assert.equal(got.length, 0, 'nothing before the latency');
  hub.advance(200);
  assert.deepEqual(got.map((g) => g[0]), [...Array(50).keys()], 'FIFO per link');
  for (const [, from, at] of got) {
    assert.equal(from, 'a');
    assert.ok(at >= 50 && at <= 130.001, `delivered at ${at}`);
  }
  // not delivered to self; directed messages reach only their target
  const gotA = [];
  a.onMessage((d) => gotA.push(d));
  await c.join('R', {});
  hub.advance(0);
  const gotC = [];
  c.onMessage((d) => gotC.push(d));
  a.send({ to: 'c' }, 'c');
  hub.advance(300);
  assert.deepEqual(gotC, [{ to: 'c' }]);
  assert.equal(got.length, 50);
  assert.equal(gotA.length, 0);
  // leaving updates presence; messages in flight to a peer that left are not delivered
  a.send({ late: true });
  b.close();
  hub.advance(300);
  assert.deepEqual(c.peers.map((p) => p.id), ['a', 'c']);
  assert.equal(got.length, 50);

  // drop rate is close to the configured probability
  const lossy = new MemoryHub({ latency: [10, 10], drop: 0.1, seed: 'm2' });
  const x = lossy.transport('x');
  const y = lossy.transport('y');
  await x.join('R', {});
  await y.join('R', {});
  let n = 0;
  y.onMessage(() => n++);
  for (let i = 0; i < 5000; i++) x.send({ i });
  lossy.advance(100);
  assert.ok(n > 4300 && n < 4700, `delivered ${n} of 5000`);
  assert.equal(lossy.stats.dropped + n, 5000);
});

test('memory net: virtual timers run in order and can be cancelled', () => {
  const hub = new MemoryHub();
  const log = [];
  hub.setTimeout(() => log.push('t200'), 200);
  const cancel = hub.setTimeout(() => log.push('never'), 100);
  const iv = hub.timers.setInterval(() => log.push(`i${hub.now}`), 75);
  hub.clearTimeout(cancel);
  hub.advance(160);
  hub.timers.clearInterval(iv);
  hub.advance(1000);
  assert.deepEqual(log, ['i75', 'i150', 't200']);
  assert.equal(hub.clock(), 1160);
});
