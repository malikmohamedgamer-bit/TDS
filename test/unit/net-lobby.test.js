// Lobby protocol (src/net/lobby.js) over the in-memory network: rooms, codes, versions, seats,
// ready flags, settings, start, host hand-over, kicks and rejoins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryHub } from '../../src/net/memoryTransport.js';
import { LockstepSession } from '../../src/net/lockstep.js';
import { Rng } from '../../src/core/rng.js';
import { ToySim, recorded, runFrames, hashMismatches } from './net-kit.js';
import {
  Lobby, ROOM_ALPHABET, MAX_PLAYERS, newRoomCode, normalizeRoomCode, isRoomCode, pickHost, newSeed,
} from '../../src/net/lobby.js';

const VERSION = 'content-abc123';
const GAME = '0.11.0';

/** Deterministic random bytes for codes and seeds. */
function seqRand(start = 1) {
  let x = start;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 73 + 41) % 256));
}

function makeLobby(hub, id, o = {}) {
  const lobby = new Lobby({
    transport: hub.transport(id), name: o.name ?? id.toUpperCase(), hero: o.hero ?? `hero-${id}`,
    version: o.version ?? VERSION, gameVersion: o.gameVersion ?? GAME, timers: hub.timers, now: hub.clock,
    rand: seqRand(id.length + id.charCodeAt(0)), settings: o.settings,
  });
  const events = [];
  for (const name of ['players', 'settings', 'host', 'start', 'refused', 'kicked', 'error']) lobby.on(name, (p) => events.push({ name, p }));
  lobby.events = events;
  lobby.of = (name) => events.filter((e) => e.name === name).map((e) => e.p);
  return lobby;
}

/** Await a promise while the virtual network runs. */
async function settle(hub, promise, ms = 10000) {
  let done = false;
  let value;
  let error;
  promise.then((v) => { done = true; value = v; }, (e) => { done = true; error = e; });
  for (let t = 0; t < ms && !done; t += 50) {
    hub.advance(50);
    await Promise.resolve();
    await Promise.resolve();
  }
  if (!done) throw new Error('did not settle');
  if (error) throw error;
  return value;
}

async function room(hub, n, o = {}) {
  const host = makeLobby(hub, 'host', { settings: { map: 'riftline', difficulty: 'normal' }, ...o });
  const code = await settle(hub, host.createRoom());
  const members = [];
  for (let i = 1; i < n; i++) {
    hub.advance(30); // distinct joinedAt
    const m = makeLobby(hub, `m${i}`);
    await settle(hub, m.joinRoom(code));
    members.push(m);
  }
  hub.advance(500);
  return { host, members, code, all: [host, ...members] };
}

test('lobby: room codes use an unambiguous alphabet', () => {
  assert.equal(ROOM_ALPHABET.length, 32);
  for (const ch of '0O1I') assert.ok(!ROOM_ALPHABET.includes(ch), `no ${ch}`);
  const rand = seqRand(7);
  for (let i = 0; i < 500; i++) {
    const c = newRoomCode(rand);
    assert.equal(c.length, 6);
    assert.ok(isRoomCode(c), c);
  }
  assert.equal(normalizeRoomCode(' kp7-x2 q9 '), 'KP7X2Q9');
  assert.equal(normalizeRoomCode('ab c-23'), 'ABC23');
  assert.ok(isRoomCode('KP7X2Q'));
  assert.ok(!isRoomCode('KP7X2O'), 'O is not in the alphabet');
  assert.ok(!isRoomCode('KP7X21'), '1 is not in the alphabet');
  assert.ok(!isRoomCode('KP7X2'));
  assert.ok(!isRoomCode(null));
  assert.match(newSeed(seqRand(3)), /^coop-[0-9a-f]{16}$/);
  // host choice: the earliest creator, else the earliest member
  assert.equal(pickHost([{ id: 'b', joinedAt: 1 }, { id: 'a', joinedAt: 5, meta: { creator: true } }]), 'a');
  assert.equal(pickHost([{ id: 'b', joinedAt: 3 }, { id: 'a', joinedAt: 3 }, { id: 'c', joinedAt: 9 }]), 'a');
  assert.equal(pickHost([]), null);
});

test('lobby: create, join, ready, settings and a deterministic start', async () => {
  const hub = new MemoryHub({ latency: [20, 120], jitter: 20, seed: 'lobby-1' });
  const { host, members, code, all } = await room(hub, 4);
  assert.ok(isRoomCode(code));
  assert.equal(host.isHost, true);
  for (const m of members) assert.equal(m.isHost, false);
  // everyone sees the same seated players in seat order, host first
  const names = (l) => l.players.map((p) => p.name);
  for (const l of all) assert.deepEqual(names(l), ['HOST', 'M1', 'M2', 'M3']);
  assert.deepEqual(members[0].players.map((p) => [p.host, p.me]), [[true, false], [false, true], [false, false], [false, false]]);
  assert.equal(members[2].players[3].hero, 'hero-m3');

  // the host cannot start until everyone is ready
  assert.equal(host.canStart(), false);
  assert.deepEqual(host.start(), { ok: false, reason: 'Not everyone is ready' });
  assert.equal(members[0].start().ok, false, 'members cannot start');
  // settings: host only, everyone gets them
  assert.equal(members[0].setSettings({ map: 'other' }), false);
  host.setSettings({ map: 'crimson', difficulty: 'hard' });
  // ready flags and a hero change travel to the host and back to everyone
  members[0].setReady(true);
  members[1].setProfile({ ready: true, hero: 'hero-new' });
  members[2].setReady(true);
  hub.advance(800);
  for (const l of all) {
    assert.deepEqual(l.settings, { map: 'crimson', difficulty: 'hard' });
    assert.deepEqual(l.players.slice(1).map((p) => p.ready), [true, true, true]);
    assert.equal(l.players[2].hero, 'hero-new');
  }
  assert.ok(members[1].of('settings').some((s) => s.map === 'crimson'));
  assert.equal(host.canStart(), true);

  const r = host.start({ seed: 'fixed-seed' });
  assert.equal(r.ok, true);
  hub.advance(800);
  const starts = all.map((l) => l.of('start'));
  for (const s of starts) assert.equal(s.length, 1, 'start announced exactly once');
  const want = {
    seed: 'fixed-seed', map: 'crimson', mode: 'coop', difficulty: 'hard',
    players: [
      { pid: 'p1', hero: 'hero-host', name: 'HOST' }, { pid: 'p2', hero: 'hero-m1', name: 'M1' },
      { pid: 'p3', hero: 'hero-new', name: 'M2' }, { pid: 'p4', hero: 'hero-m3', name: 'M3' },
    ],
    peers: { host: 'p1', m1: 'p2', m2: 'p3', m3: 'p4' },
    hostId: 'host', rejoin: false,
  };
  for (const [s] of starts) {
    const { id, ...rest } = s;
    assert.equal(typeof id, 'string');
    assert.deepEqual(rest, want);
  }
  assert.equal(new Set(starts.map(([s]) => s.id)).size, 1, 'same start id everywhere');
  for (const l of all) assert.equal(l.phase, 'started');
  // every member confirmed: the host stops re-broadcasting
  hub.advance(3000);
  const sent = hub.stats.sent;
  hub.advance(10000);
  assert.equal(hub.stats.sent, sent, 'no lobby traffic once everyone has the start');
  for (const l of all) l.stop();
});

test('lobby: a version mismatch is refused with a clear reason', async () => {
  const hub = new MemoryHub({ latency: [20, 60], seed: 'lobby-v' });
  const { host, code } = await room(hub, 1);
  const old = makeLobby(hub, 'old', { version: 'content-OLD' });
  await assert.rejects(settle(hub, old.joinRoom(code)), (err) => err.code === 'version' && /game content/i.test(err.message) && /reload/i.test(err.message));
  assert.equal(old.of('refused')[0].code, 'version');
  assert.equal(old.phase, 'refused');
  const oldApp = makeLobby(hub, 'oldapp', { gameVersion: '0.10.0' });
  await assert.rejects(settle(hub, oldApp.joinRoom(code)), (err) => err.code === 'version' && /0\.11\.0/.test(err.message) && /0\.10\.0/.test(err.message));
  hub.advance(500);
  assert.deepEqual(host.players.map((p) => p.id), ['host'], 'refused players are not seated');
});

test('lobby: the fifth player is refused (max 4)', async () => {
  const hub = new MemoryHub({ latency: [20, 60], seed: 'lobby-5' });
  const { host, code, all } = await room(hub, MAX_PLAYERS);
  const fifth = makeLobby(hub, 'fifth');
  await assert.rejects(settle(hub, fifth.joinRoom(code)), (err) => err.code === 'full' && /full/.test(err.message));
  assert.equal(fifth.of('refused')[0].code, 'full');
  hub.advance(1000);
  for (const l of all) assert.equal(l.players.length, 4);
  assert.ok(!host.players.some((p) => p.id === 'fifth'));
  // once someone leaves there is room again
  all[2].leave();
  hub.advance(500);
  const next = makeLobby(hub, 'next');
  await settle(hub, next.joinRoom(code));
  assert.deepEqual(host.players.map((p) => p.id), ['host', 'm1', 'm3', 'next']);
});

test('lobby: bad codes and rooms that do not exist', async () => {
  const hub = new MemoryHub({ latency: [20, 60] });
  const l = makeLobby(hub, 'solo');
  await assert.rejects(l.joinRoom('nope'), (err) => err.code === 'badCode');
  await assert.rejects(l.joinRoom('ABCDE0'), (err) => err.code === 'badCode');
  const lost = makeLobby(hub, 'lost');
  await assert.rejects(settle(hub, lost.joinRoom('zz zz zz'), 20000), (err) => err.code === 'notFound');
  assert.equal(lost.isHost, false, 'a joiner never hosts an empty room');
  assert.equal(lost.of('refused')[0].code, 'notFound');
});

test('lobby: if the creator leaves before the start, the earliest member takes over', async () => {
  const hub = new MemoryHub({ latency: [20, 60], seed: 'lobby-h' });
  const { host, members } = await room(hub, 3);
  host.setSettings({ map: 'redrock', difficulty: 'easy' });
  members[0].setReady(true);
  members[1].setReady(true);
  hub.advance(500);
  host.leave();
  hub.advance(1500);
  const [m1, m2] = members;
  assert.equal(m1.isHost, true);
  assert.equal(m2.isHost, false);
  assert.ok(m2.of('host').some((h) => h.id === 'm1' && h.previous === 'host'));
  for (const l of members) {
    assert.deepEqual(l.players.map((p) => p.id), ['m1', 'm2']);
    assert.deepEqual(l.settings, { map: 'redrock', difficulty: 'easy' }, 'settings survive');
  }
  const r = m1.start({ seed: 's' });
  assert.equal(r.ok, true);
  hub.advance(500);
  assert.deepEqual(m2.of('start')[0].players.map((p) => p.name), ['M1', 'M2']);
  assert.equal(m2.of('start')[0].hostId, 'm1');
});

test('lobby: kicked players leave and cannot come back', async () => {
  const hub = new MemoryHub({ latency: [20, 60], seed: 'lobby-k' });
  const { host, members, code } = await room(hub, 3);
  assert.equal(members[0].kick('m2'), false, 'members cannot kick');
  assert.equal(host.kick('m1'), true);
  hub.advance(500);
  assert.equal(members[0].of('kicked').length, 1);
  assert.equal(members[0].phase, 'refused');
  assert.deepEqual(host.players.map((p) => p.id), ['host', 'm2']);
  assert.deepEqual(members[1].players.map((p) => p.id), ['host', 'm2']);
  const again = new Lobby({ transport: hub.transport('m1'), name: 'M1', hero: 'h', version: VERSION, gameVersion: GAME, timers: hub.timers, now: hub.clock });
  await assert.rejects(settle(hub, again.joinRoom(code)), (err) => err.code === 'kicked');
});

test('lobby: a seated player who reloads after the start gets the start again (rejoin)', async () => {
  const hub = new MemoryHub({ latency: [20, 60], seed: 'lobby-r' });
  const { host, members, code } = await room(hub, 3);
  for (const m of members) m.setReady(true);
  hub.advance(500);
  host.start({ seed: 'r' });
  hub.advance(500);
  members[1].leave(); // the page reloads ...
  hub.advance(300);
  const back = new Lobby({ transport: hub.transport('m2'), name: 'M2', hero: 'hero-m2', version: VERSION, gameVersion: GAME, timers: hub.timers, now: hub.clock });
  const starts = [];
  back.on('start', (s) => starts.push(s));
  await settle(hub, back.joinRoom(code));
  assert.equal(starts.length, 1);
  assert.equal(starts[0].rejoin, true, 'the session must wait for a snapshot');
  assert.equal(starts[0].peers.m2, 'p3');
  assert.equal(starts[0].seed, 'r');
  // someone new after the start is refused
  const stranger = makeLobby(hub, 'stranger');
  await assert.rejects(settle(hub, stranger.joinRoom(code)), (err) => err.code === 'started');
});

test('lobby: the whole flow converges over a lossy network', async () => {
  const hub = new MemoryHub({ latency: [20, 300], jitter: 60, drop: 0.25, seed: 'lobby-lossy' });
  const { host, members, all } = await room(hub, 4);
  for (const m of members) m.setReady(true);
  host.setSettings({ map: 'void', difficulty: 'hard' });
  hub.advance(6000);
  for (const l of all) {
    assert.deepEqual(l.players.map((p) => p.id), ['host', 'm1', 'm2', 'm3']);
    assert.deepEqual(l.settings, { map: 'void', difficulty: 'hard' });
  }
  assert.equal(host.canStart(), true);
  host.start({ seed: 'lossy' });
  hub.advance(10000);
  const ids = all.map((l) => l.of('start').map((s) => s.id));
  for (const s of ids) assert.equal(s.length, 1);
  assert.equal(new Set(ids.flat()).size, 1);
  assert.equal(host.acks.size, 4, 'every member confirmed the start');
  assert.ok(hub.stats.dropped > 5, `the network dropped messages (${hub.stats.dropped})`);
  for (const l of all) l.stop();
});

test('lobby -> lockstep: the start payload drives sessions on the same transports', async () => {
  const hub = new MemoryHub({ latency: [20, 200], jitter: 30, drop: 0.02, seed: 'lobby-ls' });
  const { host, members, all } = await room(hub, 3);
  for (const m of members) m.setReady(true);
  hub.advance(500);
  const sessions = [];
  const sims = [];
  for (const l of all) {
    l.on('start', (start) => {
      const sim = recorded(new ToySim(start.seed));
      sims.push(sim);
      sessions.push(new LockstepSession({
        transport: l.transport, hostId: start.hostId, sim, now: hub.clock,
        peers: Object.keys(start.peers), peerPids: start.peers, awaitSnapshot: start.rejoin,
      }));
    });
  }
  host.start({ seed: 'from-lobby' });
  runFrames(hub, sessions, 30);
  assert.equal(sessions.length, 3);
  const rng = new Rng('lobby-ls');
  runFrames(hub, sessions, 1800, {
    onFrame: () => sessions.forEach((s) => { if (rng.next() < 0.05) s.issue({ type: 'toy', v: 1 }); }),
  });
  assert.deepEqual(hashMismatches(sims), []);
  const pids = new Set(sims[0].inner.applied.map((a) => a.pid));
  assert.deepEqual([...pids].sort(), ['p1', 'p2', 'p3'], 'the host stamped each sender\'s pid');
  assert.ok(hub.stats.dropped > 0);
});

test('lobby: each player reports the map their page has loaded; everyone sees it', async () => {
  const hub = new MemoryHub({ latency: [20, 80], jitter: 10, seed: 'lobby-map' });
  const { host, members, all } = await room(hub, 3);
  host.setProfile({ map: 'riftline' });
  members[0].setProfile({ map: 'riftline' });
  members[1].setProfile({ map: 'frostmere' });
  hub.advance(3000);
  for (const l of all) assert.deepEqual(l.players.map((p) => p.map), ['riftline', 'riftline', 'frostmere']);
  members[1].setProfile({ map: 'riftline' });
  hub.advance(3000);
  for (const l of all) assert.ok(l.players.every((p) => p.map === 'riftline'));
});

test('lobby: a member that briefly took over while the creator vanished rejoins the creator when it returns', async () => {
  const hub = new MemoryHub({ latency: [20, 60], jitter: 10, seed: 'lobby-splitbrain' });
  const { host, members } = await room(hub, 2);
  const m = members[0];
  // the creator goes quiet: the member's presence list loses it and the member takes over
  const peersBefore = m.peersNow;
  m._onPeers(peersBefore.filter((p) => p.id !== host.id));
  assert.equal(m.isHost, true, 'took over while the creator was gone');
  // the creator dropped the member meanwhile
  host._onPeers(host.peersNow.filter((p) => p.id !== m.id));
  assert.deepEqual(host.players.map((p) => p.name), ['HOST']);
  // both reappear: the member must step down and get seated by the creator again
  m._onPeers(peersBefore);
  host._onPeers(peersBefore);
  hub.advance(5000);
  assert.equal(m.isHost, false);
  assert.deepEqual(host.players.map((p) => p.name), ['HOST', 'M1']);
  assert.deepEqual(m.players.map((p) => p.name), ['HOST', 'M1']);
});
