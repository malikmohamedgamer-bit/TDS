// LockstepSession (docs/multiplayer.md contract 3) with a deterministic toy sim over the in-memory
// network: latency, jitter, drops, gaps, stalls, resyncs, late joins and the host leaving.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/rng.js';
import { MemoryHub } from '../../src/net/memoryTransport.js';
import { LockstepSession, matchSim, TURNS_KEPT } from '../../src/net/lockstep.js';
import { ToySim, recorded, lockstepRoom, runFrames, hashMismatches, commonTicks, recordEvents } from './net-kit.js';

const LOSSY = { latency: [20, 300], jitter: 40, drop: 0.02 };

/** Applied-command logs cut to the ticks every sim has passed. */
function appliedUpTo(sims) {
  const minTick = Math.min(...sims.map((s) => s.tick));
  return sims.map((s) => s.inner.applied.filter((a) => a.tick < minTick));
}

/** Each frame, every session issues a command with probability p (seeded). */
function randomIssuer(sessions, p = 0.03, seed = 'issue') {
  const rng = new Rng(seed);
  let n = 0;
  return () => {
    for (let i = 0; i < sessions.length; i++) {
      if (!sessions[i].ended && rng.next() < p) sessions[i].issue({ type: 'toy', v: n++, by: `peer${i}` });
    }
  };
}

test('lockstep: thousands of ticks over a lossy network give identical hashes and command ticks', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 3, net: { ...LOSSY, seed: 'lossy-1' } });
  const events = sessions.map((s) => recordEvents(s));
  runFrames(hub, sessions, 6000, { onFrame: randomIssuer(sessions) });
  assert.ok(hub.stats.dropped > 50, `the network really dropped messages (${hub.stats.dropped})`);
  assert.ok(sessions[0].tick >= 5900, `host ran (almost) every frame (${sessions[0].tick})`);
  for (const s of sessions.slice(1)) assert.ok(sessions[0].tick - s.tick < 60, `client caught up (${s.tick} vs ${sessions[0].tick})`);
  assert.ok(commonTicks(sims).length > 500);
  assert.deepEqual(hashMismatches(sims), []);
  const applied = appliedUpTo(sims);
  assert.ok(applied[0].length > 300, `commands applied: ${applied[0].length}`);
  for (const a of applied.slice(1)) assert.deepEqual(a, applied[0]);
  for (let i = 0; i < 3; i++) assert.ok(applied[0].some((c) => c.by === `peer${i}`), `commands from peer${i}`);
  for (const s of sims.slice(1)) assert.equal(s.violations, 0, 'never stepped past the confirmed tick');
  for (const e of events) assert.equal(e.of('desync').length, 0);
  for (const s of sessions) assert.equal(s.stats.resyncs, 0);
});

test('lockstep: the host stamps its own commands at hostTick + delayTicks too', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [30, 30] } });
  runFrames(hub, sessions, 60);
  const at = sessions[0].tick;
  const r = sessions[0].issue({ type: 'toy', v: 7 });
  assert.deepEqual(r, { ok: true, tick: at + 12 });
  runFrames(hub, sessions, 120);
  for (const s of sims) assert.deepEqual(s.inner.applied.map((a) => a.tick), [at + 12]);
  // a client's command goes to the host and is stamped with the host's tick + delay
  const c = sessions[1].issue({ type: 'toy', v: 8 });
  assert.equal(c.ok, true);
  assert.equal(c.pending, true);
  runFrames(hub, sessions, 120);
  const ticks = sims.map((s) => s.inner.applied.map((a) => a.tick));
  assert.deepEqual(ticks[1], ticks[0]);
  assert.equal(ticks[0].length, 2);
  assert.equal(sessions[1].pending.size, 0, 'the turn acknowledged the command');
});

test('lockstep: a client stalls at the confirmed tick when turns stop, then catches up', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 3, net: { latency: [40, 80], seed: 'stall' } });
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 300, { onFrame: randomIssuer(sessions, 0.05, 'st') });
  let blocked = true;
  hub.filter = (data, from, to) => !(blocked && to === 'peer1' && data.t === 'turn');
  let maxPast = 0;
  runFrames(hub, sessions, 180, {
    onFrame: () => { maxPast = Math.max(maxPast, sessions[1].tick - sessions[1].upTo); },
  });
  const stallStart = ev.of('stall').find((e) => e.p.stalled);
  assert.ok(stallStart, 'stall event');
  assert.equal(stallStart.p.reason, 'turns');
  assert.ok(maxPast <= 0, 'never past upTo');
  assert.ok(sessions[0].tick - sessions[1].tick > 150, 'client stood still');
  assert.equal(sessions[1].stats.stalled, true);
  blocked = false;
  runFrames(hub, sessions, 300, { onFrame: randomIssuer(sessions, 0.05, 'st2') });
  assert.ok(ev.of('stall').some((e) => !e.p.stalled), 'unstall event');
  assert.ok(sessions[0].tick - sessions[1].tick < 40, `caught up: lag ${sessions[0].tick - sessions[1].tick}`);
  assert.deepEqual(hashMismatches(sims), []);
  assert.equal(sims[1].violations, 0);
});

test('lockstep: a client that sees a gap in turn numbers asks for a resend and gets it', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [50, 50] } });
  const dropped = new Set();
  const resends = [];
  hub.filter = (data, from, to) => {
    if (data.t === 'resend') resends.push(data.from);
    if (data.t === 'turn' && to === 'peer1' && data.seq >= 20 && data.seq <= 24 && !dropped.has(data.seq)) {
      dropped.add(data.seq);
      return false;
    }
    return true;
  };
  runFrames(hub, sessions, 600, { onFrame: randomIssuer(sessions, 0.1, 'gap') });
  assert.equal(dropped.size, 5);
  assert.ok(resends.includes(20), `asked from seq 20 (${resends})`);
  assert.deepEqual(hashMismatches(sims), []);
  const applied = appliedUpTo(sims);
  assert.deepEqual(applied[1], applied[0]);
  assert.equal(sessions[1].stats.resyncs, 0, 'a resend, not a snapshot');
});

test('lockstep: a gap older than the kept turns falls back to a snapshot', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [20, 20] }, opts: { keepAliveMs: 100000 } });
  runFrames(hub, sessions, 60);
  // peer1 hears nothing for more than TURNS_KEPT turns
  let blocked = true;
  hub.filter = (data, from, to) => !(blocked && to === 'peer1');
  runFrames(hub, sessions, (TURNS_KEPT + 50) * 6);
  blocked = false;
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 300);
  assert.ok(ev.of('resync').length >= 1, 'resynced from a snapshot');
  assert.ok(sessions[0].tick - sessions[1].tick < 40);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: a stale hello from a busy but running client is not answered with a snapshot', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [20, 20] } });
  runFrames(hub, sessions, 400); // the host is far past RESEND_MAX turns
  const c = sessions[1];
  // what a tab whose queued turns were not delivered yet sends: hello, still at seq 0
  const staleHello = () => c._send({ t: 'hi', seq: 0, tick: 0, need: false, sess: c.sess }, c.hostId);
  staleHello();
  runFrames(hub, sessions, 60);
  assert.equal(c.stats.resyncs, 0, 'a one-off stale hello costs nothing');
  assert.ok(!sessions[0].trace.some((e) => e.includes('snap?')), sessions[0].trace.join(' | '));
  // the same hello for longer than snapTimeoutMs from a client that reports no progress: answered
  let silent = true;
  hub.filter = (data, from) => !(silent && from === 'peer1' && data.t === 'hash');
  runFrames(hub, sessions, 240, { onFrame: (f) => { if (f % 30 === 0) staleHello(); } });
  silent = false;
  runFrames(hub, sessions, 120);
  assert.ok(c.stats.resyncs >= 1, 'a persisting stale hello is answered (resend became a snapshot)');
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: lost commands are retried, applied exactly once and in issue order', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [150, 150] } });
  // the first message (cid 1) is lost: the second one carries cid 1 along, so 1 still comes first
  let drop = 1;
  const cmdsSeen = [];
  hub.filter = (data, from) => {
    if (data.t === 'cmd' && from === 'peer1') {
      cmdsSeen.push([data.cid, ...(data.prev || []).map((p) => p.cid)]);
      if (drop > 0) { drop--; return false; }
    }
    return true;
  };
  runFrames(hub, sessions, 60);
  sessions[1].issue({ type: 'toy', v: 1 });
  sessions[1].issue({ type: 'toy', v: 2 });
  runFrames(hub, sessions, 120);
  assert.deepEqual(cmdsSeen.slice(0, 2), [[1], [2, 1]]);
  for (const s of sims) assert.deepEqual(s.inner.applied.map((a) => a.v), [1, 2]);
  // every message lost for a while: the client retries until the host has them, never twice
  drop = 3;
  cmdsSeen.length = 0;
  sessions[1].issue({ type: 'toy', v: 3 });
  sessions[1].issue({ type: 'toy', v: 4 });
  runFrames(hub, sessions, 300);
  assert.ok(cmdsSeen.length >= 3, `retried (${JSON.stringify(cmdsSeen)})`);
  for (const s of sims) assert.deepEqual(s.inner.applied.map((a) => a.v), [1, 2, 3, 4]);
  assert.equal(sessions[1].pending.size, 0);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: a command the host never answers times out as a reject', async () => {
  const { hub, sessions } = await lockstepRoom({ n: 2, net: { latency: [30, 30] }, opts: { cmdTimeoutMs: 2000 } });
  const ev = recordEvents(sessions[1]);
  hub.filter = (data) => data.t !== 'cmd';
  runFrames(hub, sessions, 30);
  sessions[1].issue({ type: 'toy', v: 1 });
  runFrames(hub, sessions, 150);
  assert.equal(ev.of('reject')[0]?.p.code, 'timeout');
  assert.equal(sessions[1].pending.size, 0);
});

test('lockstep: a rejected command is answered to the issuer only', async () => {
  const { hub, sessions } = await lockstepRoom({ n: 3, net: { latency: [30, 60] } });
  const ev = sessions.map((s) => recordEvents(s));
  const rejectsTo = [];
  hub.filter = (data, from, to) => { if (data.t === 'reject') rejectsTo.push(to); return true; };
  runFrames(hub, sessions, 30);
  sessions[1].issue({ type: 'toy', bad: true });
  runFrames(hub, sessions, 60);
  assert.deepEqual(rejectsTo, ['peer1']);
  const r = ev[1].of('reject');
  assert.equal(r.length, 1);
  assert.equal(r[0].p.reason, 'Toy says no');
  assert.equal(r[0].p.code, 'bad');
  assert.equal(ev[2].of('reject').length, 0);
  assert.equal(ev[0].of('reject').length, 0);
  // the host's own rejected command: returned and emitted locally, nothing sent
  const own = sessions[0].issue({ type: 'toy', bad: true });
  assert.equal(own.ok, false);
  assert.equal(ev[0].of('reject').length, 1);
  assert.deepEqual(sessions[0].issue(null), { ok: false, reason: 'Bad command', code: 'bad' });
});

test('lockstep: speed and pause are host-only and carried in turns', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 3, net: { ...LOSSY, seed: 'speed' } });
  const ev = sessions.map((s) => recordEvents(s));
  runFrames(hub, sessions, 120);
  assert.equal(sessions[1].setSpeed(2), false, 'clients cannot set the speed');
  assert.equal(sessions[1].setPaused(true), false);
  sessions[0].setSpeed(2);
  runFrames(hub, sessions, 60);
  for (const s of sessions) assert.equal(s.stats.speed, 2);
  for (const e of ev) assert.deepEqual(e.of('speed').map((x) => x.p), [2]);
  sessions[0].setSpeed(10);
  assert.equal(sessions[0].speed, 3, 'clamped to 3');
  sessions[0].setSpeed(0.1);
  assert.equal(sessions[0].speed, 0.5, 'clamped to 0.5');
  sessions[0].setPaused(true);
  const pausedAt = sessions[0].tick;
  runFrames(hub, sessions, 240, { onFrame: randomIssuer(sessions, 0.05, 'p') });
  assert.equal(sessions[0].tick, pausedAt, 'host stands still while paused');
  for (const s of sessions) {
    assert.equal(s.stats.paused, true);
    assert.equal(s.tick, pausedAt, 'clients catch up to the paused tick and stop there');
  }
  for (const e of ev.slice(1)) assert.deepEqual(e.of('paused').map((x) => x.p), [true]);
  sessions[0].setPaused(false);
  runFrames(hub, sessions, 600, { onFrame: randomIssuer(sessions, 0.05, 'p2') });
  for (const s of sessions) assert.equal(s.stats.paused, false);
  assert.ok(sessions[0].tick > pausedAt + 500);
  assert.deepEqual(hashMismatches(sims), []);
  const applied = appliedUpTo(sims);
  for (const a of applied.slice(1)) assert.deepEqual(a, applied[0]);
});

test('lockstep: ping / pong measures the round trip', async () => {
  const { hub, sessions } = await lockstepRoom({ n: 2, net: { latency: [100, 100] } });
  runFrames(hub, sessions, 600);
  for (const s of sessions) {
    const rtt = s.stats.rttMs;
    assert.ok(rtt >= 195 && rtt <= 240, `rtt ${rtt}`);
  }
  const st = sessions[1].stats;
  assert.deepEqual(Object.keys(st).slice(0, 5), ['tick', 'confirmedTick', 'lagTicks', 'rttMs', 'resyncs']);
  assert.ok(st.confirmedTick > st.tick - 1);
});

test('lockstep: an induced desync is detected by hash and healed by a chunked snapshot', async () => {
  // big snapshots (~6 KB) in 1 KB chunks over a lossy network
  const { hub, sims, sessions } = await lockstepRoom({
    n: 3, net: { ...LOSSY, seed: 'desync' }, makeSim: () => new ToySim('room', { blob: 3000 }), opts: { chunkBytes: 1024 },
  });
  const hostEv = recordEvents(sessions[0]);
  const ev2 = recordEvents(sessions[2]);
  const snapParts = new Set();
  hub.filter = (data) => { if (data.t === 'snap') snapParts.add(`${data.id}:${data.part}/${data.of}`); return true; };
  const issue = randomIssuer(sessions, 0.04, 'ds');
  runFrames(hub, sessions, 1500, { onFrame: issue });
  assert.deepEqual(hashMismatches(sims), []);
  sims[2].inner.x ^= 0xdead; // corrupt one client's state
  const corruptedAt = sims[2].tick;
  runFrames(hub, sessions, 1500, { onFrame: issue });
  const d = hostEv.of('desync');
  assert.ok(d.length >= 1, 'host saw the desync');
  assert.equal(d[0].p.peer, 'peer2');
  assert.ok(d[0].p.tick >= corruptedAt && d[0].p.tick <= corruptedAt + 120 + 12, `found at the next hash check (${d[0].p.tick})`);
  assert.ok(ev2.of('desync').length >= 1);
  const rs = ev2.of('resync');
  assert.ok(rs.length >= 1);
  assert.equal(rs[0].p.reason, 'desync');
  assert.ok(sessions[2].stats.resyncs >= 1);
  assert.ok(sessions[0].stats.resyncs >= 1);
  assert.ok([...snapParts].some((s) => !s.endsWith('/1')), 'the snapshot was split into chunks');
  assert.ok(sims[2].inner.restores >= 1);
  // after the restore every recorded hash matches, and the clean client never needed one
  assert.ok(commonTicks(sims).length > 50);
  assert.deepEqual(hashMismatches(sims), []);
  assert.equal(sims[1].inner.restores, 0);
  const applied = appliedUpTo(sims);
  for (const a of applied.slice(1)) assert.deepEqual(a, applied[0]);
});

test('lockstep: a snapshot keeps already-received future commands', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [20, 20] } });
  runFrames(hub, sessions, 240);
  // a client command is scheduled and confirmed on the client, then a desync forces a snapshot
  // before it applies; it must still apply exactly once on the original tick
  const r = sessions[0].issue({ type: 'toy', v: 99 });
  runFrames(hub, sessions, 3);
  assert.ok(sessions[1].schedule.size > 0, 'client holds the future command');
  sessions[0]._wantSnapshot('peer1', 'desync');
  runFrames(hub, sessions, 120);
  assert.ok(sims[1].inner.restores >= 1);
  for (const s of sims) assert.deepEqual(s.inner.applied.filter((a) => a.v === 99).map((a) => a.tick), [r.tick]);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: lost snapshot parts are resent selectively; a late snapshot rewinds and replays', async () => {
  const { hub, sims, sessions } = await lockstepRoom({
    n: 2, net: { latency: [60, 60] }, makeSim: () => new ToySim('room', { blob: 3000 }), opts: { chunkBytes: 1024 },
  });
  const needs = [];
  let dropPart = true;
  hub.filter = (data, from, to) => {
    if (data.t === 'need') needs.push(data);
    // the first transfer loses part 1, so the client keeps simulating (diverged) meanwhile
    if (data.t === 'snap' && to === 'peer1' && data.part === 1 && dropPart) { dropPart = false; return false; }
    return true;
  };
  const issue = randomIssuer(sessions, 0.2, 'rewind');
  runFrames(hub, sessions, 300, { onFrame: issue });
  sims[1].inner.x ^= 5;
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 900, { onFrame: issue });
  const need = needs.find((n) => Array.isArray(n.missing));
  assert.ok(need, 'asked for the missing part');
  assert.deepEqual(need.missing, [1]);
  const rs = ev.of('resync');
  assert.equal(rs.length, 1, 'one resync, no loop');
  assert.ok(rs[0].p.tick < sims[1].tick);
  assert.deepEqual(hashMismatches(sims), []);
  const applied = appliedUpTo(sims);
  assert.deepEqual(applied[1], applied[0], 'commands the client had already run were replayed after the rewind');
});

test('lockstep: a late joiner gets a snapshot plus the pending turns', async () => {
  const hub = new MemoryHub({ ...LOSSY, seed: 'late' });
  const t0 = hub.transport('peer0');
  const t1 = hub.transport('peer1');
  await t0.join('ROOM', {});
  await t1.join('ROOM', {});
  hub.advance(0);
  const sims = [recorded(new ToySim('late')), recorded(new ToySim('late'))];
  const sessions = [
    new LockstepSession({ transport: t0, hostId: 'peer0', sim: sims[0], now: hub.clock }),
    new LockstepSession({ transport: t1, hostId: 'peer0', sim: sims[1], now: hub.clock }),
  ];
  const hostEv = recordEvents(sessions[0]);
  runFrames(hub, sessions, 1200, { onFrame: randomIssuer(sessions, 0.04, 'late') });
  // peer2 joins mid-match; its session starts only after a while, so the snapshot the host sent on
  // presence is lost and the joiner's own hello (need) has to bring one
  const t2 = hub.transport('peer2');
  await t2.join('ROOM', {});
  runFrames(hub, sessions, 30);
  assert.ok(hostEv.of('peerJoined').some((e) => e.p.id === 'peer2'));
  const sim2 = recorded(new ToySim('late'));
  const s2 = new LockstepSession({ transport: t2, hostId: 'peer0', sim: sim2, now: hub.clock, awaitSnapshot: true });
  const ev2 = recordEvents(s2);
  sessions.push(s2);
  sims.push(sim2);
  assert.equal(s2.advance(5), 0, 'waits for the snapshot');
  assert.equal(ev2.of('stall')[0].p.reason, 'snapshot');
  runFrames(hub, sessions, 900, { onFrame: randomIssuer(sessions, 0.04, 'late2') });
  const rs = ev2.of('resync');
  assert.ok(rs.length >= 1);
  assert.equal(rs[0].p.reason, 'join');
  assert.ok(rs[0].p.tick > 1200, `snapshot at the match tick (${rs[0].p.tick})`);
  assert.ok(sessions[0].tick - s2.tick < 40, 'the late joiner caught up');
  assert.ok(commonTicks(sims).length > 40);
  assert.deepEqual(hashMismatches(sims), []);
  const applied = appliedUpTo(sims);
  for (const a of applied.slice(1)) assert.deepEqual(a, applied[0]);
  assert.ok(applied[0].some((c) => c.by === 'peer2'), 'the late joiner can play');
});

test('lockstep: a reconnect under the same peer id gets a snapshot and continues', async () => {
  const { hub, transports, sims, sessions } = await lockstepRoom({ n: 3, net: { ...LOSSY, seed: 'recon' } });
  const hostEv = recordEvents(sessions[0]);
  const ev1 = recordEvents(sessions[1]);
  const issue = randomIssuer(sessions, 0.04, 'rc');
  runFrames(hub, sessions, 600, { onFrame: issue });
  transports[1].close();
  runFrames(hub, sessions, 120, { onFrame: issue });
  assert.ok(hostEv.of('peerLeft').some((e) => e.p.id === 'peer1'));
  await transports[1].join('ROOM', {});
  runFrames(hub, sessions, 600, { onFrame: issue });
  assert.ok(hostEv.of('peerJoined').some((e) => e.p.id === 'peer1' && e.p.returning));
  assert.ok(ev1.of('resync').some((e) => e.p.reason === 'join'));
  assert.ok(sessions[0].tick - sessions[1].tick < 40);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: the host closing ends the match for everyone at once (hostLeft)', async () => {
  const { hub, sessions } = await lockstepRoom({ n: 3, net: { latency: [30, 90] } });
  const ev = sessions.map((s) => recordEvents(s));
  runFrames(hub, sessions, 120);
  sessions[0].close();
  hub.advance(200);
  for (const i of [1, 2]) {
    const h = ev[i].of('hostLeft');
    assert.equal(h.length, 1);
    assert.equal(h[0].p.id, 'peer0');
    assert.equal(h[0].p.reason, 'bye');
    assert.equal(sessions[i].ended, true);
    assert.equal(sessions[i].advance(5), 0);
    assert.equal(sessions[i].issue({ type: 'toy' }).code, 'ended');
  }
});

test('lockstep: a host that vanishes from presence ends the match after the grace period', async () => {
  const { hub, transports, sessions } = await lockstepRoom({ n: 2, net: { latency: [30, 30] } });
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 120);
  transports[0].close(); // crash: no bye
  runFrames(hub, sessions.slice(1), 60); // 1 s
  assert.ok(ev.of('peerLeft').some((e) => e.p.id === 'peer0'));
  assert.equal(ev.of('hostLeft').length, 0, 'a short drop is tolerated');
  runFrames(hub, sessions.slice(1), 150); // 3.5 s total
  assert.equal(ev.of('hostLeft').length, 1);
  assert.equal(ev.of('hostLeft')[0].p.reason, 'presence');
  assert.equal(sessions[1].ended, true);
});

test('lockstep: a host back within the grace period keeps the match going', async () => {
  const { hub, transports, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [30, 30] } });
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 120);
  transports[0].close();
  runFrames(hub, sessions.slice(1), 60);
  await transports[0].join('ROOM', {});
  runFrames(hub, sessions, 400);
  assert.equal(ev.of('hostLeft').length, 0);
  assert.equal(sessions[1].ended, false);
  assert.ok(sessions[0].tick - sessions[1].tick < 40);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep: the host waits for every expected peer (or the start timeout) before starting', async () => {
  const hub = new MemoryHub({ latency: [50, 50] });
  const ts = ['peer0', 'peer1', 'peer2'].map((id) => hub.transport(id));
  for (const t of ts) await t.join('ROOM', {});
  hub.advance(0);
  const peers = ['peer0', 'peer1', 'peer2'];
  const host = new LockstepSession({ transport: ts[0], hostId: 'peer0', sim: new ToySim(), now: hub.clock, peers });
  const c1 = new LockstepSession({ transport: ts[1], hostId: 'peer0', sim: new ToySim(), now: hub.clock });
  const hostEv = recordEvents(host);
  runFrames(hub, [host, c1], 60);
  assert.equal(host.tick, 0, 'peer2 has not said hello yet');
  assert.equal(host.stats.stalled, true);
  const c2 = new LockstepSession({ transport: ts[2], hostId: 'peer0', sim: new ToySim(), now: hub.clock });
  runFrames(hub, [host, c1, c2], 60);
  assert.equal(hostEv.of('start').length, 1);
  assert.ok(host.tick > 40);
  assert.ok(c2.tick > 20, 'late session got the turns it missed');

  // a peer that never answers: the host starts after startTimeoutMs anyway
  const hub2 = new MemoryHub({ latency: [50, 50] });
  const a = hub2.transport('a');
  const b = hub2.transport('b');
  await a.join('R', {});
  await b.join('R', {});
  hub2.advance(0);
  const lone = new LockstepSession({ transport: a, hostId: 'a', sim: new ToySim(), now: hub2.clock, startTimeoutMs: 2000 });
  runFrames(hub2, [lone], 60);
  assert.equal(lone.tick, 0);
  runFrames(hub2, [lone], 90);
  assert.ok(lone.tick > 0, 'started after the timeout');
});

test('lockstep: the host forces each command to the sender\'s player id', async () => {
  const peerPids = { peer0: 'p1', peer1: 'p2', peer2: 'p3' };
  const { hub, sims, sessions } = await lockstepRoom({ n: 3, net: { latency: [30, 60] }, opts: { peerPids } });
  runFrames(hub, sessions, 30);
  sessions[1].issue({ type: 'toy', v: 1, pid: 'p1' }); // tries to act for the host
  sessions[2].issue({ type: 'toy', v: 2 });
  sessions[0].issue({ type: 'toy', v: 3 });
  runFrames(hub, sessions, 120);
  const byV = Object.fromEntries(sims[0].inner.applied.map((a) => [a.v, a.pid]));
  assert.deepEqual(byV, { 1: 'p2', 2: 'p3', 3: 'p1' });
  for (const s of sims.slice(1)) assert.deepEqual(s.inner.applied, sims[0].inner.applied);
  // a peer that is not a player is refused
  const t9 = hub.transport('peer9');
  await t9.join('ROOM', {});
  const s9 = new LockstepSession({ transport: t9, hostId: 'peer0', sim: new ToySim(), now: hub.clock, awaitSnapshot: true });
  const ev9 = recordEvents(s9);
  s9.issue({ type: 'toy', v: 4 });
  runFrames(hub, [...sessions, s9], 60);
  assert.equal(ev9.of('reject')[0]?.p.code, 'player');
});

test('lockstep: constructor checks and the Match adapter', () => {
  const hub = new MemoryHub();
  const t = hub.transport('x');
  assert.throws(() => new LockstepSession({ transport: t, sim: new ToySim() }), /hostId/);
  assert.throws(() => new LockstepSession({ transport: t, hostId: 'x', sim: new ToySim(), turnTicks: 6, delayTicks: 3 }), /timing/);
  // matchSim forwards to the match and swaps it on restore
  const calls = [];
  const fake = (n) => ({
    tick: n, step() { this.tick++; }, command: (c) => { calls.push(c); return { ok: true }; }, validate: () => ({ ok: true }),
    hash: () => `h${n}`, snapshot: () => ({ n }),
  });
  const replaced = [];
  const sim = matchSim(fake(5), { rebuild: (s) => fake(s.n + 100), onReplace: (m, old) => replaced.push([m.tick, old.tick]) });
  assert.equal(sim.tick, 5);
  sim.step();
  assert.equal(sim.tick, 6);
  sim.command({ type: 'a' });
  assert.deepEqual(calls, [{ type: 'a' }]);
  assert.deepEqual(sim.snapshot(), { n: 5 });
  sim.restore({ n: 1 });
  assert.equal(sim.tick, 101);
  assert.deepEqual(replaced, [[101, 6]]);
  assert.throws(() => matchSim(fake(0)).restore({}), /rebuild/);
  assert.throws(() => matchSim({ tick: 0 }).snapshot(), /snapshot/);
});
