// LockstepSession driving the real Match (src/sim/match.js): three peers, each with its own Match
// built from the same seed and options, over a lossy in-memory network. Uses the single-player
// Match API (commands without pid), which is all lockstep needs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Rng } from '../../src/core/rng.js';
import { Match } from '../../src/sim/match.js';
import { matchSim } from '../../src/net/lockstep.js';
import { lockstepRoom, runFrames, hashMismatches, commonTicks, recordEvents } from './net-kit.js';

const C = await content();
const MAP = C.maps.get('riftline');
const newMatch = () => new Match({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'coop-net', difficulty: 'normal' });
const hasSnapshot = typeof Match.prototype.snapshot === 'function' && typeof Match.restore === 'function';

// candidate build spots around the map (the host's validation decides which are legal)
const SPOTS = [[-4, -6], [-10, -12], [6, 8], [12, -4], [-14, 6], [4, -14], [16, 10], [-8, 14], [10, 16], [-16, -8]];
const cheapest = [...C.towers.values()].filter((t) => !t.generated).sort((a, b) => a.cost - b.cost)[0].id;

/** Per frame: each peer sometimes moves its hero, places towers, skips the prep timer. */
function players(sessions, sims) {
  const rng = new Rng('coop-players');
  let spot = 0;
  return (f) => {
    sessions.forEach((s, i) => {
      if (rng.next() < 0.02) s.issue({ type: 'hero', x: rng.range(-15, 15), z: rng.range(-15, 15), by: `peer${i}` });
      if (f % 240 === 40 * i + 20 && spot < SPOTS.length) {
        const [x, z] = SPOTS[spot++];
        s.issue({ type: 'place', tower: cheapest, x, z, rot: 0, by: `peer${i}` });
      }
      if (f === 90 && i === 2) s.issue({ type: 'skip', by: 'peer2' });
      if (f % 600 === 300 && i === 1) {
        const t = sims[i].inner.match.towers[0];
        if (t) s.issue({ type: 'target', uid: t.uid, mode: 'strong', by: 'peer1' });
      }
    });
  };
}

test('lockstep + Match: three peers stay identical for thousands of ticks over a lossy network', async () => {
  const { hub, sims, sessions } = await lockstepRoom({
    n: 3,
    net: { latency: [20, 300], jitter: 40, drop: 0.02, seed: 'coop-match' },
    makeSim: () => matchSim(newMatch()),
    every: 30,
  });
  const events = sessions.map((s) => recordEvents(s));
  runFrames(hub, sessions, 6000, { onFrame: players(sessions, sims) });
  const matches = sims.map((s) => s.inner.match);
  assert.ok(hub.stats.dropped > 20, `messages were dropped (${hub.stats.dropped})`);
  assert.ok(matches[0].tick > 5900, `host tick ${matches[0].tick}`);
  for (const m of matches.slice(1)) assert.ok(matches[0].tick - m.tick < 60, `client caught up (${m.tick})`);
  // the match really played: a wave ran and towers were built by several players
  assert.ok(matches[0].wave >= 2, `wave ${matches[0].wave}`);
  assert.ok(matches[0].towers.length >= 3, `towers ${matches[0].towers.length}`);
  // every recorded hash equal on every peer
  assert.ok(commonTicks(sims).length > 100);
  assert.deepEqual(hashMismatches(sims), []);
  // the same commands applied on the same ticks everywhere (Match.log keeps tick + command)
  const minTick = Math.min(...matches.map((m) => m.tick));
  const logs = matches.map((m) => m.log.filter((e) => e.tick < minTick));
  for (const l of logs.slice(1)) assert.deepEqual(l, logs[0]);
  for (let i = 0; i < 3; i++) assert.ok(logs[0].some((e) => e.by === `peer${i}`), `peer${i} commands applied`);
  assert.ok(logs[0].some((e) => e.type === 'place'), 'towers placed through lockstep');
  for (const s of sims.slice(1)) assert.equal(s.violations, 0, 'no client stepped past the confirmed tick');
  for (const e of events) assert.equal(e.of('desync').length, 0);
  // and the final states agree where every peer has been
  const at = minTick - (minTick % 30);
  assert.equal(sims[1].history.get(at), sims[0].history.get(at));
  assert.equal(sims[2].history.get(at), sims[0].history.get(at));
});

test('lockstep + Match: an invalid command is refused by the host and never reaches the sims', async () => {
  const { hub, sims, sessions } = await lockstepRoom({ n: 2, net: { latency: [30, 60] }, makeSim: () => matchSim(newMatch()) });
  const ev = recordEvents(sessions[1]);
  runFrames(hub, sessions, 30);
  sessions[1].issue({ type: 'place', tower: cheapest, x: 9999, z: 0, rot: 0 }); // outside the map
  sessions[1].issue({ type: 'nonsense' });
  runFrames(hub, sessions, 120);
  const rejects = ev.of('reject');
  assert.equal(rejects.length, 2);
  assert.equal(rejects[0].p.code, 'bounds');
  assert.equal(rejects[1].p.code, 'unknown');
  for (const s of sims) assert.equal(s.inner.match.log.length, 0);
  assert.deepEqual(hashMismatches(sims), []);
});

test('lockstep + Match: snapshot resync of a corrupted Match', { skip: hasSnapshot ? false : 'Match.snapshot() / Match.restore() not available yet (contract 1)' }, async () => {
  const rebuild = (snap) => Match.restore(snap, { content: C, mapWorld: buildMapWorld(MAP, C.props) });
  const { hub, sims, sessions } = await lockstepRoom({
    n: 3, net: { latency: [20, 300], jitter: 40, drop: 0.02, seed: 'coop-resync' },
    makeSim: () => matchSim(newMatch(), { rebuild }), every: 30,
  });
  const ev = recordEvents(sessions[2]);
  const play = players(sessions, sims);
  runFrames(hub, sessions, 900, { onFrame: play });
  sims[2].inner.match.cash += 500; // corrupt one peer
  runFrames(hub, sessions, 1200, { onFrame: play });
  assert.ok(ev.of('resync').some((e) => e.p.reason === 'desync'));
  assert.deepEqual(hashMismatches(sims), []);
});
