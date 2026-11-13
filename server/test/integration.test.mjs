// End-to-end co-op over the real relay: spawns `node relay.mjs` on a free port and drives the REAL
// client stack from src/net/ (createTransport -> RelayTransport over Node's global WebSocket,
// Lobby, LockstepSession, matchSim) with REAL co-op Matches built from the lobby's start payload
// exactly like MatchController.startOnline does (src/game/matchController.js).
// Every client runs in this one process, each with its own socket, lobby, session and Match; the
// frame loop below mimics the game's fixed 60 Hz loop (stepOnline: acc += speed, advance(floor)).
// Run: cd server && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { content } from '../../test/helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { createTransport } from '../../src/net/transports.js';
import { Lobby, MAX_PLAYERS } from '../../src/net/lobby.js';
import { LockstepSession, matchSim } from '../../src/net/lockstep.js';

const RELAY = fileURLToPath(new URL('../relay.mjs', import.meta.url));
const C = await content();
const MAP_ID = 'riftline';
const MAP = C.maps.get(MAP_ID);
const GAME_VERSION = 'it-1.0.0';
const HEROES = [...C.heroes.keys()];
const CONFIG = { turnTicks: 6, delayTicks: 12 }; // data/online.json defaults
const FRAME_MS = 1000 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

assert.ok(typeof globalThis.WebSocket === 'function', 'Node has a global WebSocket (Node 22+)');
assert.ok(MAP, `map ${MAP_ID} exists`);

/** Starts the relay on a free port; resolves { url, proc, stop }. */
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
        resolve({
          proc,
          url: `ws://localhost:${m[1]}`,
          stop: () => new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); proc.kill('SIGTERM'); } }),
        });
      }
    });
    proc.stderr.on('data', (d) => { out += d; });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error(`relay exited (${code}): ${out}`)); });
  });
}

let relay;
before(async () => { relay = await startRelay(); });
after(async () => { await relay?.stop(); });

/** Polls pred() until it is true (or fails after ms). */
async function waitFor(pred, ms, what) {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

// ------------------------------------------------------------------ one player (one "browser") ---

/** A player: real transport + lobby; the session and match appear when the host starts. */
async function newPlayer(name, hero) {
  const transport = await createTransport({ transport: 'relay', relayUrl: relay.url }, { search: '' });
  const lobby = new Lobby({
    transport, name, hero, map: MAP_ID, version: String(C.version), gameVersion: GAME_VERSION,
    settings: { map: MAP_ID, difficulty: 'normal' },
  });
  const p = { name, hero, transport, lobby, session: null, sim: null, start: null, localPid: null, acc: 0, heroSync: 0, heroAt: null, errors: [], ev: [] };
  transport.onError((e) => p.errors.push(e));
  lobby.on('start', (start) => startOnline(p, start));
  return p;
}

/** Mirrors MatchController.startOnline: the Match comes only from the start payload. */
function startOnline(p, start) {
  const localPid = start.peers?.[p.transport.id];
  if (!localPid || p.start?.id === start.id) return;
  const mw = buildMapWorld(MAP, C.props);
  const players = start.players.map((q) => ({ pid: q.pid, name: q.name, hero: C.heroes.has(q.hero) ? q.hero : [...C.heroes.keys()][0] }));
  const match = new Match({
    content: C, mapWorld: mw, difficulty: start.difficulty, seed: String(start.seed), players,
    loadout: [...C.towers.keys()], levels: {},
    options: { manualStart: true, mode: 'coop' },
  });
  const sim = matchSim(match, { rebuild: (snap) => Match.restore(snap, { content: C, mapWorld: buildMapWorld(MAP, C.props) }) });
  const session = new LockstepSession({
    transport: p.transport, hostId: start.hostId, sim,
    turnTicks: CONFIG.turnTicks, delayTicks: CONFIG.delayTicks, hashEvery: 120,
    peers: Object.keys(start.peers), peerPids: start.peers, awaitSnapshot: !!start.rejoin,
  });
  for (const name of ['desync', 'resync', 'peerLeft', 'peerJoined', 'hostLeft', 'reject', 'error']) {
    session.on(name, (e) => p.ev.push({ name, e }));
  }
  Object.assign(p, { start, localPid, sim, session, isHost: start.hostId === p.transport.id });
}

const evOf = (p, name) => p.ev.filter((x) => x.name === name).map((x) => x.e);
const matchOf = (p) => p.sim.match;

/** Host creates the room, everyone joins and readies, the host starts; resolves once all run. */
async function room(n) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await newPlayer(`P${i + 1}`, HEROES[i % HEROES.length]));
  const [host, ...rest] = ps;
  const code = await host.lobby.createRoom();
  for (const p of rest) await p.lobby.joinRoom(code);
  for (const p of rest) p.lobby.setReady(true);
  await waitFor(() => host.lobby.canStart() && host.lobby.players.length === n, 5000, 'everyone seated and ready');
  const r = host.lobby.start({ seed: `it-${n}-${Date.now()}` });
  assert.ok(r.ok, r.reason);
  await waitFor(() => ps.every((p) => p.session), 5000, 'every player received the start');
  ps.forEach((p, i) => assert.equal(p.localPid, `p${i + 1}`, 'seat order = join order'));
  return { ps, host, code };
}

/** One 60 Hz frame for one player, like MatchController.stepOnline. */
function frame(p) {
  const s = p.session;
  if (!s || s.ended) return;
  p.acc += s.paused ? 0 : s.speed;
  const k = Math.floor(p.acc);
  p.acc -= k;
  s.advance(k);
  // the view drains sim events every frame; keep the apply-time refusals for diagnostics
  for (const e of matchOf(p).drainEvents()) if (e.type === 'rejected') p.ev.push({ name: 'simRejected', e });
}

/** Runs `frames` frames in real time (catching up after slow wakes); onFrame(f) after each. */
async function run(ps, frames, onFrame) {
  const t0 = performance.now();
  let done = 0;
  while (done < frames) {
    await sleep(2);
    const due = Math.min(frames, Math.floor((performance.now() - t0) / FRAME_MS));
    while (done < due) {
      for (const p of ps) frame(p);
      onFrame?.(done);
      done++;
    }
  }
}

/** Host pauses; everyone keeps framing until all sims sit on the host's tick with nothing pending. */
async function settle(ps, host, ms = 15000) {
  host.session.setPaused(true);
  const end = Date.now() + ms;
  const live = ps.filter((p) => !p.session.ended);
  const done = () => live.every((p) => p.session.tick === host.session.tick && (p.isHost || (p.session.ready && p.session.pending.size === 0 && !p.session.snapIn.pending)));
  while (!done()) {
    if (Date.now() > end) {
      throw new Error(`did not settle: ${live.map((p) => `${p.localPid} tick ${p.session.tick} ready ${p.session.ready} pending ${p.session.pending?.size}`).join(', ')} host ${host.session.tick}`);
    }
    await sleep(5);
    for (const p of live) frame(p);
  }
  // one more keep-alive round so a hash report in flight cannot trigger a late snapshot unnoticed
  await sleep(100);
  for (const p of live) frame(p);
}

const towersOf = (m) => m.towers.map((t) => ({ uid: t.uid, owner: t.owner, defId: t.defId, up: { ...t.up } }));

function assertSame(ps) {
  const ref = matchOf(ps[0]);
  for (const p of ps.slice(1)) {
    const m = matchOf(p);
    assert.equal(m.tick, ref.tick, `${p.localPid} on the host's tick`);
    assert.equal(m.hash(), ref.hash(), `${p.localPid} hash equals the host's`);
    assert.deepEqual(towersOf(m), towersOf(ref), `${p.localPid} towers equal the host's`);
    assert.deepEqual(m.wallets, ref.wallets, `${p.localPid} wallets equal the host's`);
    assert.deepEqual(m.heroes.map((h) => [h.x, h.z, h.hp]), ref.heroes.map((h) => [h.x, h.z, h.hp]), `${p.localPid} heroes equal the host's`);
  }
}

function teardown(ps) {
  for (const p of ps) {
    try { p.session?.close(); } catch { /* closed */ }
    try { p.lobby.leave(); } catch { /* closed */ }
  }
}

// ------------------------------------------------------------------ scripted players -----------

const CORE = [...C.towers.values()].filter((t) => !t.generated && t.rarity !== 'legendary').sort((a, b) => a.cost - b.cost).map((t) => t.id);
const GRID = [];
for (let x = -30; x <= 30; x += 3) for (let z = -30; z <= 30; z += 3) GRID.push([x, z]);

/**
 * Issues a command like MatchController.commandOnline: validated against the local Match first,
 * then sent through the session with the local pid. Returns true when it was issued.
 */
function command(p, cmd, tally) {
  const full = { ...cmd, pid: p.localPid };
  if (!matchOf(p).validate(full).ok) return false;
  const r = p.session.issue(full);
  if (r.ok) tally[cmd.type] = (tally[cmd.type] || 0) + 1;
  return r.ok;
}

/** First grid spot (player-specific offset so players spread out) where the cheapest tower fits. */
function tryPlace(p, i, tally) {
  const m = matchOf(p);
  for (const tower of CORE.slice(0, 3)) {
    for (let k = 0; k < GRID.length; k++) {
      const [x, z] = GRID[(k * 7 + i * 61) % GRID.length];
      if (m.validate({ type: 'place', tower, x, z, rot: 0, pid: p.localPid }).ok) return command(p, { type: 'place', tower, x, z, rot: 0 }, tally);
    }
  }
  return false;
}

function tryUpgrade(p, tally) {
  const m = matchOf(p);
  for (const t of m.towers.filter((q) => q.owner === p.localPid)) {
    const v = m.validate({ type: 'upgrade', uid: t.uid, pid: p.localPid });
    if (v.ok) return command(p, { type: 'upgrade', uid: t.uid }, tally);
    if (v.code === 'branch') return command(p, { type: 'upgrade', uid: t.uid, branch: v.options[0] }, tally);
  }
  return false;
}

/**
 * Per-frame script for player i: hero walks a small circle (position sent every 6 frames when it
 * moved, like stepOnline), towers placed / upgraded / retargeted, waves skipped, abilities cast.
 */
function script(ps, tally, { from = 0 } = {}) {
  const modes = ['strong', 'first', 'last', 'close'];
  return (f) => {
    if (f < from) return;
    ps.forEach((p, i) => {
      const s = p.session;
      if (!s || s.ended || (!p.isHost && !s.ready)) return;
      const m = matchOf(p);
      const h = m.heroOf(p.localPid);
      if (h && ++p.heroSync >= 6) {
        p.heroSync = 0;
        p.home ??= { x: h.x, z: h.z };
        const a = (f + i * 40) / 50;
        const x = p.home.x + Math.cos(a) * 3;
        const z = p.home.z + Math.sin(a) * 3;
        if (!p.heroAt || Math.hypot(x - p.heroAt.x, z - p.heroAt.z) > 0.2) {
          p.heroAt = { x, z };
          command(p, { type: 'hero', x, y: h.y, z }, tally);
        }
      }
      const g = f + i * 13;
      if (g % 70 === 10 && m.towers.filter((t) => t.owner === p.localPid).length < 6) tryPlace(p, i, tally);
      if (g % 90 === 45) tryUpgrade(p, tally);
      if (g % 110 === 60) {
        const own = m.towers.filter((t) => t.owner === p.localPid);
        if (own.length) command(p, { type: 'target', uid: own[f % own.length].uid, mode: modes[(f / 110 | 0) % modes.length] }, tally);
      }
      // the host starts the first wave; a client calls the later ones early
      if ((i === 0 && f === 150) || (i === ps.length - 1 && f > 300 && f % 200 === 0)) command(p, { type: 'skip' }, tally);
      if (g % 120 === 80 && h) {
        const ab = m.abilitiesOf(p.localPid).find((x) => m.validate({ type: 'ability', id: x.id, x: h.x, z: h.z, pid: p.localPid }).ok);
        if (ab) command(p, { type: 'ability', id: ab.id, x: h.x + 2, z: h.z }, tally);
      }
    });
  };
}

/** Commands of each type that reached the host's Match log, by pid. */
function applied(m) {
  const by = {};
  for (const e of m.log) {
    if (e.type === 'autoAbility') continue;
    by[e.type] ??= new Set();
    by[e.type].add(e.pid);
  }
  return by;
}

const noRateErrors = (ps) => {
  for (const p of ps) assert.deepEqual(p.errors.filter((e) => e.code === 'rate'), [], `${p.name}: relay rate limit never hit`);
};

// ------------------------------------------------------------------ tests ----------------------

test('2 players over the relay: ~3000 ticks of real commands, identical state, zero resyncs', { timeout: 60000 }, async () => {
  const { ps, host } = await room(2);
  try {
    host.session.setSpeed(3); // the fastest the game allows: 3000 ticks in ~17 s real time
    const tally = {};
    await run(ps, 1000, script(ps, tally));
    await settle(ps, host);
    const m = matchOf(host);
    assert.ok(m.tick >= 2900, `host reached tick ${m.tick}`);
    assertSame(ps);
    // the same commands on the same ticks on both
    assert.deepEqual(matchOf(ps[1]).log, m.log, 'identical command logs');
    // every kind of command really travelled and applied, from both players where scripted
    const by = applied(m);
    for (const type of ['place', 'upgrade', 'target']) {
      assert.deepEqual([...(by[type] || [])].sort(), ['p1', 'p2'], `${type} applied for both players (${JSON.stringify(tally)})`);
    }
    // co-op hero positions are not kept in the replay log (they would bloat it): check the heroes
    const sp = m.map.playerSpawn;
    for (const pid of ['p1', 'p2']) {
      const h = m.heroOf(pid);
      assert.ok(Math.hypot(h.x - sp.x, h.z - sp.z) > 0.5, `hero of ${pid} moved (${JSON.stringify(tally)})`);
    }
    assert.ok(by.skip?.has('p1') && by.skip?.has('p2'), 'skip from host and client');
    assert.ok(by.ability?.size >= 1, `ability cast (${JSON.stringify(tally)})`);
    assert.ok(m.wave >= 2, `waves ran (wave ${m.wave})`);
    assert.ok(m.towers.some((t) => t.owner === 'p1') && m.towers.some((t) => t.owner === 'p2'), 'both own towers');
    for (const p of ps) {
      assert.equal(p.session.stats.resyncs, 0, `${p.localPid} never resynced`);
      assert.equal(evOf(p, 'desync').length, 0, `${p.localPid} no desync`);
      assert.equal(evOf(p, 'error').length, 0, `${p.localPid} no session errors`);
    }
    noRateErrors(ps);
  } finally {
    teardown(ps);
  }
});

test('3 players: a client socket drops mid-match, RelayTransport reconnects, state converges', { timeout: 60000 }, async () => {
  const { ps, host } = await room(3);
  try {
    host.session.setSpeed(2);
    const tally = {};
    const victim = ps[2];
    let dropped = false;
    const ids = ps.map((p) => p.transport.id);
    await run(ps, 900, (f) => {
      script(ps, tally)(f);
      if (f === 300) {
        // a network drop: kill the underlying socket (not session.close / transport.close)
        dropped = true;
        victim.transport.ws.close();
      }
    });
    assert.ok(dropped);
    await settle(ps, host, 20000);
    assert.equal(victim.transport.status, 'open', 'reconnected');
    assert.ok(evOf(host, 'peerLeft').some((e) => e.id === victim.transport.id), 'host saw the drop');
    assert.ok(evOf(host, 'peerJoined').some((e) => e.id === victim.transport.id && e.returning), 'host saw the return');
    assert.ok(evOf(victim, 'resync').length >= 1, 'the returning client was resynced');
    assert.equal(evOf(victim, 'hostLeft').length, 0);
    assertSame(ps);
    for (const p of ps) {
      assert.deepEqual(p.transport.peers.map((q) => q.id).sort(), [...ids].sort(), `${p.name} sees all 3 peers`);
      assert.ok(!p.session.ended, `${p.name} session still running`);
    }
    // the victim still commands its own player after the reconnect
    const vh = matchOf(host).heroOf(victim.localPid);
    const before = { x: vh.x, z: vh.z };
    host.session.setPaused(false);
    await run(ps, 120, script(ps, tally, { from: 0 }));
    await settle(ps, host);
    const after = matchOf(host).heroOf(victim.localPid);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.05, 'victim commands apply after the reconnect (its hero moved)');
    assertSame(ps);
    noRateErrors(ps);
  } finally {
    teardown(ps);
  }
});

test('desync injection: a mutated client wallet is detected, resynced and converges', { timeout: 60000 }, async () => {
  const { ps, host } = await room(2);
  try {
    host.session.setSpeed(3);
    const tally = {};
    const client = ps[1];
    await run(ps, 200, script(ps, tally));
    const pi = matchOf(client).playerIndex(client.localPid);
    const honest = matchOf(client).wallets[pi];
    matchOf(client).wallets[pi] += 777; // e.g. a float difference or a cheat: the hash now differs
    await run(ps, 200, script(ps, tally));
    await settle(ps, host);
    assert.ok(evOf(host, 'desync').length >= 1, 'host detected the mismatch');
    assert.ok(evOf(client, 'resync').some((e) => e.reason === 'desync'), 'client restored a desync snapshot');
    assert.ok(host.session.stats.resyncs >= 1 && client.session.stats.resyncs >= 1);
    assertSame(ps);
    assert.notEqual(matchOf(client).wallets[pi], honest + 777, 'the injected cash is gone');
  } finally {
    teardown(ps);
  }
});

test('host session.close(): every client gets hostLeft at once', { timeout: 30000 }, async () => {
  const { ps, host } = await room(3);
  try {
    await run(ps, 60);
    host.session.close();
    await waitFor(() => ps.slice(1).every((p) => evOf(p, 'hostLeft').length), 3000, 'hostLeft on every client');
    for (const p of ps.slice(1)) {
      assert.equal(evOf(p, 'hostLeft')[0].reason, 'bye', 'immediate (bye), not the presence timeout');
      assert.ok(p.session.ended);
    }
  } finally {
    teardown(ps);
  }
});

test(`a ${MAX_PLAYERS + 1}th player is refused and the room keeps its ${MAX_PLAYERS}`, { timeout: 30000 }, async () => {
  const ps = [];
  try {
    for (let i = 0; i < MAX_PLAYERS; i++) ps.push(await newPlayer(`P${i + 1}`, HEROES[i]));
    const code = await ps[0].lobby.createRoom();
    for (const p of ps.slice(1)) await p.lobby.joinRoom(code);
    const extra = await newPlayer('P5', HEROES[4]);
    ps.push(extra);
    await assert.rejects(extra.lobby.joinRoom(code), (err) => err.code === 'full');
    assert.notEqual(extra.lobby.phase, 'lobby');
    await sleep(300);
    for (const p of ps.slice(0, MAX_PLAYERS)) {
      assert.equal(p.lobby.players.length, MAX_PLAYERS, `${p.name} still sees ${MAX_PLAYERS} players`);
      assert.equal(p.transport.peers.length, MAX_PLAYERS);
    }
  } finally {
    teardown(ps);
  }
});
