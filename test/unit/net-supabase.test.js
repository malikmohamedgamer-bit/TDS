// SupabaseTransport and loadScript. No live Supabase project is available to the tests, so the
// transport runs against a fake Realtime hub with the same client API (createClient -> channel ->
// on / subscribe / track / send / presenceState, removeChannel). One test loads the real vendored
// UMD build in a VM and checks that it exposes exactly that API, so the fake cannot drift from it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SupabaseTransport, peersFromPresence, randomPeerId, SUPABASE_SCRIPT, EVENT } from '../../src/net/supabaseTransport.js';
import { loadScript } from '../../src/net/loadScript.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A fake Supabase Realtime: channels with the same topic share presence and broadcasts, like
 * clients of one project. `hub.fail` makes the next subscribe report CHANNEL_ERROR; `hub.silent`
 * makes subscribe never answer.
 */
function fakeSupabase() {
  const hub = { topics: new Map(), clients: [], fail: null, silent: false, trackResults: [] };
  const members = (topic) => {
    if (!hub.topics.has(topic)) hub.topics.set(topic, new Set());
    return hub.topics.get(topic);
  };
  const syncAll = (topic) => {
    for (const ch of members(topic)) for (const b of ch.bindings.filter((x) => x.type === 'presence' && x.filter.event === 'sync')) b.cb();
  };
  hub.createClient = (url, key, options) => {
    const client = {
      url, key, options, channels: [], disconnected: false,
      channel(topic, params) {
        let seq = 0;
        const ch = {
          topic, params, bindings: [], tracked: [], subscribed: false, sent: [], statusCb: null,
          on(type, filter, cb) { ch.bindings.push({ type, filter, cb }); return ch; },
          subscribe(cb) {
            ch.statusCb = cb;
            setTimeout(() => {
              if (hub.silent) return;
              if (hub.fail) { cb(hub.fail); hub.fail = null; return; }
              ch.subscribed = true;
              members(topic).add(ch);
              cb('SUBSCRIBED');
            }, 0);
            return ch;
          },
          async track(payload) {
            hub.trackCalls = (hub.trackCalls || 0) + 1;
            // hub.trackResults: scripted results ('timed out', 'error', an Error to throw), then 'ok'
            const scripted = hub.trackResults.shift();
            if (scripted instanceof Error) throw scripted;
            if (scripted && scripted !== 'ok') return scripted;
            ch.tracked = [{ ...payload, presence_ref: `ref${++seq}` }];
            syncAll(topic);
            return 'ok';
          },
          send(msg) {
            ch.sent.push(msg);
            const self = params.config.broadcast.self;
            for (const other of members(topic)) {
              if (other === ch && !self) continue;
              for (const b of other.bindings) {
                if (b.type === msg.type && b.filter.event === msg.event) b.cb({ type: msg.type, event: msg.event, payload: structuredClone(msg.payload) });
              }
            }
            return Promise.resolve('ok');
          },
          presenceState() {
            const state = {};
            for (const m of members(topic)) {
              if (!m.tracked.length) continue;
              const k = m.params.config.presence.key;
              state[k] = [...(state[k] || []), ...m.tracked];
            }
            return state;
          },
          unsubscribe() {
            members(topic).delete(ch);
            syncAll(topic);
            return Promise.resolve('ok');
          },
        };
        client.channels.push(ch);
        return ch;
      },
      async removeChannel(ch) { return ch.unsubscribe(); },
      realtime: { disconnect() { client.disconnected = true; } },
    };
    hub.clients.push(client);
    return client;
  };
  return hub;
}

const mk = (hub, id, extra = {}) => new SupabaseTransport({ url: 'https://demo.supabase.co', anonKey: 'anon-key', id, createClient: hub.createClient, ...extra });

describe('SupabaseTransport', () => {
  test('creates the client and channel with the contract settings', async () => {
    const hub = fakeSupabase();
    const t = mk(hub, 'pa');
    await t.join('ABC123', { name: 'A' });
    const [client] = hub.clients;
    assert.equal(client.url, 'https://demo.supabase.co');
    assert.equal(client.key, 'anon-key');
    assert.deepEqual(client.options.realtime, { params: { eventsPerSecond: 20 }, timeout: 20000 });
    const [ch] = client.channels;
    assert.equal(ch.topic, 'tds:ABC123');
    assert.deepEqual(ch.params, { config: { broadcast: { self: false, ack: false }, presence: { key: 'pa' } } });
    assert.ok(ch.bindings.some((b) => b.type === 'broadcast' && b.filter.event === EVENT));
    assert.ok(ch.bindings.some((b) => b.type === 'presence' && b.filter.event === 'sync'));
    assert.equal(t.status, 'open');
    t.close();
  });

  test('status goes connecting -> open -> closed and close disconnects', async () => {
    const hub = fakeSupabase();
    const t = mk(hub, 'pa');
    const seen = [];
    t.onStatus((s) => seen.push(s));
    await t.join('ROOM1', {});
    await t.close();
    assert.deepEqual(seen, ['connecting', 'open', 'closed']);
    assert.equal(hub.clients[0].disconnected, true);
    await t.close(); // idempotent
    assert.deepEqual(seen, ['connecting', 'open', 'closed']);
  });

  test('presence becomes the peer list (with self, oldest first, meta and joinedAt)', async () => {
    const hub = fakeSupabase();
    let clock = 1000;
    const now = () => (clock += 10);
    const a = mk(hub, 'pa', { now });
    const b = mk(hub, 'pb', { now });
    const listsA = [];
    a.onPeers((p) => listsA.push(p));
    await a.join('R', { name: 'A', hero: 'warden' });
    assert.deepEqual(listsA.at(-1), [{ id: 'pa', meta: { name: 'A', hero: 'warden' }, joinedAt: 1010 }]);
    const listsB = [];
    b.onPeers((p) => listsB.push(p));
    await b.join('R', { name: 'B' });
    const expected = [
      { id: 'pa', meta: { name: 'A', hero: 'warden' }, joinedAt: 1010 },
      { id: 'pb', meta: { name: 'B' }, joinedAt: 1020 },
    ];
    assert.deepEqual(listsA.at(-1), expected);
    assert.deepEqual(listsB.at(-1), expected);
    // leaving: the other side sees a shorter list
    await b.close();
    assert.deepEqual(listsA.at(-1), [expected[0]]);
    a.close();
  });

  test('presence sync without a change does not repeat onPeers', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa');
    let calls = 0;
    a.onPeers(() => calls++);
    await a.join('R', {});
    const before = calls;
    a._channel.bindings.find((x) => x.type === 'presence').cb(); // a sync with identical state
    assert.equal(calls, before);
    a.close();
  });

  test('broadcast reaches the others with the sender id, never the sender itself', async () => {
    const hub = fakeSupabase();
    const [a, b, c] = ['pa', 'pb', 'pc'].map((id) => mk(hub, id));
    const got = { pa: [], pb: [], pc: [] };
    for (const t of [a, b, c]) t.onMessage((data, from) => got[t.id].push([data, from]));
    for (const t of [a, b, c]) await t.join('R', {});
    assert.equal(a.send({ t: 'turn', upTo: 12 }), true);
    assert.deepEqual(got.pb, [[{ t: 'turn', upTo: 12 }, 'pa']]);
    assert.deepEqual(got.pc, [[{ t: 'turn', upTo: 12 }, 'pa']]);
    assert.deepEqual(got.pa, []);
    const wire = hub.clients[0].channels[0].sent[0];
    assert.deepEqual(wire, { type: 'broadcast', event: 'm', payload: { from: 'pa', data: { t: 'turn', upTo: 12 } } });
    for (const t of [a, b, c]) t.close();
  });

  test('a directed send is delivered to its target only', async () => {
    const hub = fakeSupabase();
    const [a, b, c] = ['pa', 'pb', 'pc'].map((id) => mk(hub, id));
    const got = { pa: [], pb: [], pc: [] };
    for (const t of [a, b, c]) t.onMessage((data, from) => got[t.id].push([data, from]));
    for (const t of [a, b, c]) await t.join('R', {});
    a.send({ t: 'snap', part: 0 }, 'pc');
    assert.deepEqual(got.pc, [[{ t: 'snap', part: 0 }, 'pa']]);
    assert.deepEqual(got.pb, []);
    assert.equal(hub.clients[0].channels[0].sent[0].payload.to, 'pc');
    for (const t of [a, b, c]) t.close();
  });

  test('malformed or self-addressed payloads are ignored', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa');
    const got = [];
    a.onMessage((d, f) => got.push([d, f]));
    await a.join('R', {});
    const cb = a._channel.bindings.find((x) => x.type === 'broadcast').cb;
    cb({ payload: null });
    cb({ payload: 'text' });
    cb({ payload: { data: 1 } });
    cb({ payload: { from: 'pa', data: 2 } });
    cb({ payload: { from: 'pb', to: 'pz', data: 3 } });
    cb({ payload: { from: 'pb', data: 4 } });
    assert.deepEqual(got, [[4, 'pb']]);
    a.close();
  });

  test('send before join or after close is dropped; oversize messages are dropped', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa', { maxPayloadChars: 200 });
    assert.equal(a.send({ x: 1 }), false);
    await a.join('R', {});
    const warn = console.warn;
    const warnings = [];
    console.warn = (m) => warnings.push(m);
    try {
      assert.equal(a.send({ big: 'y'.repeat(500) }), false);
      assert.equal(a.send({ big: 'y'.repeat(500) }), false);
    } finally {
      console.warn = warn;
    }
    assert.equal(warnings.length, 1, 'warns once');
    assert.equal(a.send({ ok: true }), true);
    a.close();
    assert.equal(a.send({ x: 1 }), false);
    assert.deepEqual(a.stats, { sent: 1, received: 0, dropped: 4 });
  });

  test('a channel error during join rejects and reports error', async () => {
    const hub = fakeSupabase();
    hub.fail = 'CHANNEL_ERROR';
    const a = mk(hub, 'pa');
    const seen = [];
    a.onStatus((s) => seen.push(s));
    await assert.rejects(a.join('R', {}), /could not join room R/);
    assert.deepEqual(seen, ['connecting', 'error']);
    assert.equal(hub.clients[0].disconnected, true, 'the failed client is cleaned up');
  });

  test('one TIMED_OUT is not a failure: the join waits for the client to retry', async () => {
    const hub = fakeSupabase();
    hub.fail = 'TIMED_OUT';
    const a = mk(hub, 'pa', { timeoutMs: 2000 });
    const seen = [];
    a.onStatus((s) => seen.push(s));
    const joined = a.join('R', {});
    await tick();
    await tick();
    assert.equal(a.status, 'connecting', 'still trying after TIMED_OUT');
    a._channel.statusCb('SUBSCRIBED'); // supabase-js rejoined by itself
    await joined;
    assert.equal(a.status, 'open');
    assert.ok(!seen.includes('error'));
  });

  test('a join that never answers times out', async () => {
    const hub = fakeSupabase();
    hub.silent = true;
    const a = mk(hub, 'pa', { timeoutMs: 30 });
    await assert.rejects(a.join('R', {}), /timed out/);
    assert.equal(a.status, 'error');
  });

  test('errors after joining are reported and a rejoin re-tracks presence and reopens', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa');
    const seen = [];
    a.onStatus((s) => seen.push(s));
    await a.join('R', { name: 'A' });
    const ch = a._channel;
    const joinedAt = ch.tracked[0].joinedAt;
    ch.statusCb('CHANNEL_ERROR');
    assert.equal(a.status, 'error');
    ch.tracked = [];
    ch.statusCb('SUBSCRIBED'); // the Realtime client rejoined by itself
    await tick();
    assert.equal(a.status, 'open');
    assert.equal(ch.tracked[0].joinedAt, joinedAt, 'joinedAt kept across the rejoin');
    assert.deepEqual(seen, ['connecting', 'open', 'error', 'open']);
    a.close();
  });

  test('a failed presence track is retried with backoff before the join succeeds', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa', { trackBackoffMs: 1 });
    const b = mk(hub, 'pb');
    await b.join('R', {});
    hub.trackResults = ['timed out', 'error'];
    const seenByB = [];
    b.onPeers((list) => seenByB.push(list.map((p) => p.id)));
    await a.join('R', { name: 'A' });
    assert.equal(a.status, 'open');
    assert.equal(hub.trackCalls, 4, 'b once, a three times');
    assert.equal(a.trackFailures, 2);
    assert.deepEqual(seenByB.at(-1), ['pb', 'pa'], 'the others see us once the track succeeded');
    a.close(); b.close();
  });

  test('a presence track that keeps failing fails the join with status error', async () => {
    const hub = fakeSupabase();
    hub.trackResults = ['timed out', 'timed out', new Error('socket gone'), 'timed out'];
    const a = mk(hub, 'pa', { trackBackoffMs: 1 });
    const seen = [];
    a.onStatus((s) => seen.push(s));
    await assert.rejects(a.join('R', {}), /presence track failed \(timed out\)/);
    assert.equal(hub.trackCalls, 4, 'first try plus 3 retries');
    assert.deepEqual(seen, ['connecting', 'error']);
    assert.equal(hub.clients[0].disconnected, true, 'cleaned up');
  });

  test('a failing re-track after an automatic rejoin reports status error', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa', { trackBackoffMs: 1, trackRetries: 1 });
    await a.join('R', {});
    const ch = a._channel;
    hub.trackResults = ['error', 'error'];
    ch.statusCb('SUBSCRIBED'); // the Realtime client rejoined by itself
    for (let i = 0; i < 20 && a.status !== 'error'; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(a.status, 'error');
    // the next successful rejoin recovers
    ch.statusCb('SUBSCRIBED');
    for (let i = 0; i < 20 && a.status !== 'open'; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(a.status, 'open');
    a.close();
  });

  test('missing configuration fails with a clear message', async () => {
    const t = new SupabaseTransport({ createClient: () => assert.fail('must not create a client') });
    await assert.rejects(t.join('R', {}), /data\/online\.json/);
  });

  test('joining twice is refused; a listener error does not stop the others', async () => {
    const hub = fakeSupabase();
    const a = mk(hub, 'pa');
    const b = mk(hub, 'pb');
    await a.join('R', {});
    await assert.rejects(a.join('R', {}), /already joined/);
    const got = [];
    const err = console.error;
    console.error = () => {};
    try {
      b.onMessage(() => { throw new Error('boom'); });
      const off = b.onMessage((d) => got.push(d));
      await b.join('R', {});
      a.send(1);
      off();
      a.send(2);
    } finally {
      console.error = err;
    }
    assert.deepEqual(got, [1]);
    a.close(); b.close();
  });

  test('loads the vendored client lazily through loadScript when no createClient is given', async () => {
    const hub = fakeSupabase();
    const added = [];
    const fakeDoc = {
      head: { appendChild(el) { added.push(el); setTimeout(() => { globalThis.supabase = { createClient: hub.createClient }; el.onload(); }, 0); } },
      createElement: () => ({}),
    };
    const prevDoc = globalThis.document;
    globalThis.document = fakeDoc;
    try {
      const t = new SupabaseTransport({ url: 'https://x.supabase.co', anonKey: 'k', id: 'pa' });
      assert.equal(added.length, 0, 'nothing loads before join');
      await t.join('R', {});
      assert.equal(added.length, 1);
      assert.equal(added[0].src, SUPABASE_SCRIPT);
      assert.match(SUPABASE_SCRIPT, /\/vendor\/supabase\/supabase\.js$/);
      const t2 = new SupabaseTransport({ url: 'https://x.supabase.co', anonKey: 'k', id: 'pb' });
      await t2.join('R', {});
      assert.equal(added.length, 1, 'the script loads once');
      t.close(); t2.close();
    } finally {
      globalThis.document = prevDoc;
      delete globalThis.supabase;
    }
  });
});

describe('helpers', () => {
  test('peersFromPresence merges duplicate keys (earliest joinedAt, newest meta) and sorts', () => {
    const peers = peersFromPresence({
      zed: [{ meta: { n: 1 }, joinedAt: 5, presence_ref: 'a' }],
      amy: [{ meta: { n: 'old' }, joinedAt: 9 }, { meta: { n: 'new' }, joinedAt: 12 }],
      bob: [{ meta: { n: 3 }, joinedAt: 5 }],
      empty: [],
      junk: [{ joinedAt: 'x' }],
    });
    assert.deepEqual(peers, [
      { id: 'junk', meta: {}, joinedAt: 0 },
      { id: 'bob', meta: { n: 3 }, joinedAt: 5 },
      { id: 'zed', meta: { n: 1 }, joinedAt: 5 },
      { id: 'amy', meta: { n: 'new' }, joinedAt: 9 },
    ]);
    assert.deepEqual(peersFromPresence(undefined), []);
  });

  test('randomPeerId is relay-compatible and varies', () => {
    const ids = new Set(Array.from({ length: 50 }, randomPeerId));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
  });

  test('loadScript: resolves an existing global without loading, retries after an error', async () => {
    const scope = { lib: { v: 1 } };
    assert.deepEqual(await loadScript('x.js', { globalName: 'lib', scope, doc: null }), { v: 1 });
    const els = [];
    const doc = { head: { appendChild: (el) => els.push(el) }, createElement: () => ({ remove() { this.removed = true; } }) };
    const s2 = {};
    const p1 = loadScript('y.js', { globalName: 'g', scope: s2, doc });
    assert.equal(loadScript('y.js', { globalName: 'g', scope: s2, doc }), p1, 'one load per URL');
    els[0].onerror();
    await assert.rejects(p1, /could not load y\.js/);
    assert.equal(els[0].removed, true);
    const p2 = loadScript('y.js', { globalName: 'g', scope: s2, doc });
    assert.equal(els.length, 2, 'a failed load is retried');
    s2.g = 'ok';
    els[1].onload();
    assert.equal(await p2, 'ok');
    // a script that loads but defines nothing is an error
    const p3 = loadScript('z.js', { globalName: 'nope', scope: s2, doc });
    els[2].onload();
    await assert.rejects(p3, /did not define nope/);
    await assert.rejects(loadScript('w.js', { doc: null, scope: {} }), /no document/);
  });

  test('the vendored UMD build exposes the client API the transport uses', () => {
    const code = readFileSync(new URL('../../vendor/supabase/supabase.js', import.meta.url), 'utf8');
    const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, Headers, Request, Response, AbortController, queueMicrotask };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    ctx.self = ctx;
    // the client needs a WebSocket class to exist; this one fails loudly if anything connects,
    // which proves nothing touches the network before subscribe()
    ctx.WebSocket = class NoSocket {
      constructor() { throw new Error('opened a socket before subscribe'); }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    assert.equal(typeof ctx.supabase.createClient, 'function');
    const client = ctx.supabase.createClient('https://example.supabase.co', 'anon', {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const ch = client.channel('tds:ABCD', { config: { broadcast: { self: false, ack: false }, presence: { key: 'pa' } } });
    for (const k of ['on', 'subscribe', 'track', 'send', 'presenceState', 'unsubscribe']) assert.equal(typeof ch[k], 'function', k);
    assert.equal(typeof client.removeChannel, 'function');
    assert.equal(typeof client.realtime.disconnect, 'function');
    assert.equal(ch.params.config.presence.key, 'pa');
    assert.equal(ch.params.config.broadcast.self, false);
    assert.deepEqual(JSON.parse(JSON.stringify(ch.presenceState())), {});
    // registering the two handlers the transport uses must not throw
    ch.on('broadcast', { event: 'm' }, () => {});
    ch.on('presence', { event: 'sync' }, () => {});
    // (removeChannel is not called: on a never-joined channel it waits for its 10 s leave timeout)
  });

  test('the vendored version is recorded', () => {
    const v = readFileSync(new URL('../../vendor/supabase/VERSION', import.meta.url), 'utf8');
    assert.match(v, /@supabase\/supabase-js \d+\.\d+\.\d+/);
    assert.match(readFileSync(new URL('../../vendor/supabase/LICENSE', import.meta.url), 'utf8'), /MIT License/);
  });
});
