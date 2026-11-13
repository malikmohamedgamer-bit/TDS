// Single-player golden values (multiplayer must not change single-player by a single bit) and the
// snapshot / restore property tests that the lockstep resync path relies on (docs/multiplayer.md).
//
// Re-record the golden fixture (only when a deliberate balance change lands):
//   TDS_UPDATE_GOLDEN=1 node --test test/unit/snapshot.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { createBot } from '../../src/sim/bot.js';
import { createScript, roadSpots } from './helpers/coopScript.js';

const C = await content();
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sp-golden.json');
// the balance baseline loadout (docs/HANDOFF.md)
const CORE12 = ['rifleman', 'marksman', 'gunner', 'rocket_battery', 'gunship', 'supply_depot', 'mine_layer', 'ember_adept', 'frost_weaver', 'storm_caller', 'rune_totem', 'spirit_summoner'];
const GOLDEN_MAPS = ['riftline', 'frostmere', 'gen_verdant_9'];
const GOLDEN_MODES = ['campaign', 'endless', 'boss_rush', 'mutation'];
const ENDLESS_WAVES = 40;
const MAX_TICKS = 60 * 60 * 40;

/** Plays one bot match (core 12, skill 0.7) and returns its fingerprint: final state plus a
 *  rolling digest of hash() every 30 ticks, so a divergence anywhere in the match is caught. */
function goldenRun(mapId, mode) {
  const m = new Match({ content: C, mapWorld: buildMapWorld(C.maps.get(mapId), C.props), seed: `gold-${mapId}-${mode}`, loadout: CORE12, options: { mode } });
  const bot = createBot(m, { loadout: CORE12, skill: 0.7, seed: `gold-${mapId}-${mode}` });
  let digest = 0;
  while (m.phase !== 'won' && m.phase !== 'lost' && m.tick < MAX_TICKS) {
    if (mode === 'endless' && m.wave > ENDLESS_WAVES) break;
    bot.update();
    m.step();
    m.drainEvents();
    if (m.tick % 30 === 0) digest = (Math.imul(digest ^ parseInt(m.hash(), 16), 16777619) >>> 0);
  }
  return { hash: m.hash(), digest: digest.toString(16), tick: m.tick, phase: m.phase, wave: m.wave, cash: m.cash, baseHp: m.baseHp, kills: m.stats.kills, towers: m.towers.length };
}

test('single-player golden values are unchanged (bit for bit)', async () => {
  const got = {};
  for (const mapId of GOLDEN_MAPS) for (const mode of GOLDEN_MODES) got[`${mapId}/${mode}`] = goldenRun(mapId, mode);
  if (process.env.TDS_UPDATE_GOLDEN) {
    await mkdir(dirname(FIXTURE), { recursive: true });
    await writeFile(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
    return;
  }
  const want = JSON.parse(await readFile(FIXTURE, 'utf8'));
  assert.deepEqual(got, want);
});

// ------------------------------------------------------------------ snapshot / restore -------
const world = (mapId) => buildMapWorld(C.maps.get(mapId), C.props);
const WINDOW = 2400; // ticks every restored copy runs beside the original (40 s of play)
const DEEP_EVERY = 300; // full snapshot comparison every n ticks (hash() is compared on every tick)

/** Snapshot of m, sent through JSON like a transport would, restored onto a fresh map world.
 *  Checks the round trips on the way: JSON is lossless, and restore + snapshot gives it back. */
function restoredCopy(m, mapId) {
  const snap = m.snapshot();
  const wire = JSON.parse(JSON.stringify(snap));
  assert.deepEqual(wire, snap, 'snapshot survives JSON unchanged');
  const copy = Match.restore(wire, { content: C, mapWorld: world(mapId) });
  assert.deepEqual(copy.snapshot(), snap, 'restore(snapshot).snapshot() equals the snapshot');
  assert.equal(copy.hash(), m.hash());
  return copy;
}

/**
 * Plays match A (drive(A) issues its commands each tick, a bot or a script). At the first tick
 * each trigger holds, a restored copy joins and is then stepped beside A for WINDOW ticks with
 * the same commands: hash() must agree on every tick, snapshots every DEEP_EVERY ticks and at
 * the end. A's command() and step() are wrapped so commands and steps the bot makes inside its
 * own think() reach the copies too.
 */
function propertyRun({ mapId, make, drive, triggers, maxTicks = 60 * 60 * 40 }) {
  const A = make(world(mapId));
  const mirrors = [];
  const fired = [];
  const realCommand = A.command.bind(A);
  const realStep = A.step.bind(A);
  A.command = (cmd) => {
    const r = realCommand(cmd);
    for (const mi of mirrors) assert.equal(mi.m.command(structuredClone(cmd)).ok, r.ok, `${mi.name}: same verdict for ${cmd.type} at tick ${A.tick}`);
    return r;
  };
  A.step = () => {
    realStep();
    A.drainEvents();
    for (let i = mirrors.length - 1; i >= 0; i--) {
      const mi = mirrors[i];
      mi.m.step();
      mi.m.drainEvents();
      mi.left--;
      if (mi.m.hash() !== A.hash()) assert.fail(`${mi.name}: hash differs at tick ${A.tick} (restored at ${mi.at})`);
      if (mi.left % DEEP_EVERY === 0 || mi.left === 0) assert.deepEqual(mi.m.snapshot(), A.snapshot(), `${mi.name}: state differs at tick ${A.tick}`);
      if (mi.left === 0) mirrors.splice(i, 1);
    }
  };
  while ((fired.length < triggers.length || mirrors.length) && A.tick < maxTicks) {
    for (const tr of triggers) {
      if (fired.includes(tr.name) || !tr.when(A)) continue;
      assert.ok(A.phase !== 'won' && A.phase !== 'lost', `${tr.name}: fired after the match ended`);
      fired.push(tr.name);
      mirrors.push({ name: tr.name, at: A.tick, m: restoredCopy(A, mapId), left: WINDOW });
    }
    drive(A);
    A.step();
  }
  assert.deepEqual([...fired].sort(), triggers.map((t) => t.name).sort(), 'every snapshot point was reached');
  assert.equal(mirrors.length, 0, 'every restored copy ran its full window');
  return A;
}

const botDriver = (seed) => {
  let bot = null;
  return (A) => { bot ??= createBot(A, { loadout: CORE12, skill: 0.7, seed }); bot.update(); };
};
const scriptDriver = (opts) => {
  let script = null;
  return (A) => { script ??= createScript(A, opts); for (const c of script(A)) A.command(c); };
};
const inWave = (m, n = 5) => m.phase === 'wave' && m.enemies.length >= n;
const bossUp = (m) => m.enemies.some((e) => e.boss && e.alive);

test('snapshot / restore: campaign with the bot (prep, mid-wave, boss phase)', () => {
  propertyRun({
    mapId: 'riftline',
    make: (mw) => new Match({ content: C, mapWorld: mw, seed: 'snap-campaign', loadout: CORE12 }),
    drive: botDriver('snap-campaign'),
    triggers: [
      { name: 'prep', when: (m) => m.tick === 120 },
      { name: 'mid-wave', when: (m) => m.wave >= 3 && inWave(m, 8) && m.projectiles.length > 0 },
      { name: 'boss phase', when: (m) => m.enemies.some((e) => e.boss && e.phase > 0) },
    ],
  });
});

test('snapshot / restore: boss rush (telegraphs and boss phases in flight)', () => {
  propertyRun({
    mapId: 'frostmere',
    make: (mw) => new Match({ content: C, mapWorld: mw, seed: 'snap-bossrush', loadout: CORE12, options: { mode: 'boss_rush' } }),
    drive: botDriver('snap-bossrush'),
    triggers: [
      { name: 'boss up', when: (m) => bossUp(m) && m.tick > 1200 },
      { name: 'telegraph', when: (m) => m.telegraphs.length > 0 },
    ],
  });
});

test('snapshot / restore: mutation mode (cached mutations) and endless (generated waves)', () => {
  propertyRun({
    mapId: 'gen_verdant_9',
    make: (mw) => new Match({ content: C, mapWorld: mw, seed: 'snap-mutation', loadout: CORE12, options: { mode: 'mutation' } }),
    drive: botDriver('snap-mutation'),
    triggers: [{ name: 'mutated wave', when: (m) => m.wave >= 3 && m.mutationFor(m.wave) && inWave(m) }],
  });
  const A = propertyRun({
    mapId: 'riftline',
    make: (mw) => new Match({ content: C, mapWorld: mw, seed: 'snap-endless', loadout: CORE12, options: { mode: 'endless', cashMul: 3 } }),
    drive: botDriver('snap-endless'),
    triggers: [{ name: 'generated wave', when: (m) => m.wave >= 21 && inWave(m, 3) }],
  });
  assert.ok(A.genWaves.size > 0);
});

const COOP_LOADOUT = ['rifleman', 'gunner', 'ember_adept', 'frost_weaver', 'storm_caller', 'mine_layer', 'spirit_summoner', 'rune_totem'];

test('snapshot / restore: 2-player co-op with scripted commands from both (summons, mines, skill allies)', () => {
  const A = propertyRun({
    mapId: 'riftline',
    make: (mw) => new Match({
      content: C, mapWorld: mw, seed: 'snap-coop2', difficulty: 'easy', loadout: COOP_LOADOUT, options: { mode: 'coop', cashMul: 2 },
      players: [{ pid: 'host', hero: 'sergeant_kade', name: 'Ada' }, { pid: 'guest', hero: 'grovewarden_nyra', name: 'Bo' }],
    }),
    drive: scriptDriver({ seed: 'coop2', favour: ['mine_layer', 'spirit_summoner'] }),
    triggers: [
      { name: 'prep', when: (m) => m.tick === 90 },
      { name: 'mines', when: (m) => m.mines.length >= 3 },
      { name: 'tower allies', when: (m) => m.allies.some((a) => a.owner >= 0) && inWave(m, 3) },
      { name: 'skill allies', when: (m) => m.allies.some((a) => a.owner === -1) },
      { name: 'boss', when: (m) => bossUp(m) },
    ],
  });
  const owners = new Set(A.towers.map((t) => t.owner));
  assert.ok(owners.has('host') && owners.has('guest'), 'both players built');
});

test('snapshot / restore: 3-player co-op with scripted commands (boss telegraphs)', () => {
  propertyRun({
    mapId: 'frostmere',
    make: (mw) => new Match({
      content: C, mapWorld: mw, seed: 'snap-coop3', difficulty: 'easy', loadout: COOP_LOADOUT, options: { mode: 'coop', cashMul: 2 },
      players: [{ pid: 'a', hero: 'archmage_seren' }, { pid: 'b', hero: 'warmaster_ryn' }, { pid: 'c', hero: 'shadowblade_vex' }],
    }),
    drive: scriptDriver({ seed: 'coop3', favour: ['spirit_summoner'] }),
    triggers: [
      { name: 'prep', when: (m) => m.tick === 30 },
      { name: 'boss', when: (m) => bossUp(m) && m.towers.length >= 6 },
      { name: 'telegraph', when: (m) => m.telegraphs.length > 0 },
    ],
  });
});

test('snapshot keeps queued commands, Infinity timers and sold burn sources', () => {
  const m = new Match({ content: C, mapWorld: world('riftline'), seed: 'snap-edge', options: { manualStart: true } });
  assert.equal(m.nextWaveAt, Infinity);
  m.command({ type: 'skip' });
  m.step();
  const spot = roadSpots(m).find((s) => m.canPlace('ember_adept', s.x, s.z).ok);
  m.command({ type: 'place', tower: 'ember_adept', x: spot.x, z: spot.z });
  // a command still in the queue travels with the snapshot
  const q = restoredCopy(m, 'riftline');
  assert.equal(q.queue.length, 1);
  m.step(); q.step();
  assert.equal(q.towers.length, 1);
  assert.equal(q.hash(), m.hash());
  // a burn whose tower was sold keeps crediting that tower (bounty, owner) after a restore
  const t = m.towers[0];
  const e = m.spawnEnemy([...C.enemies.values()].find((d) => !d.boss && !d.flying && !d.shield).id, { d: 5 });
  e.hp = 30;
  Object.assign(e, { burnDps: 20, burnUntil: m.time + 10, burnSrc: t, burnBy: t.owner });
  m.command({ type: 'sell', uid: t.uid });
  m.step();
  assert.equal(m.towers.length, 0);
  const snap = m.snapshot();
  assert.equal(snap.ghosts.length, 1);
  const r = Match.restore(JSON.parse(JSON.stringify(snap)), { content: C, mapWorld: world('riftline') });
  for (let i = 0; i < 200; i++) { m.step(); r.step(); assert.equal(r.hash(), m.hash()); }
  assert.equal(r.cash, m.cash);
  assert.ok(!m.enemies.includes(e), 'the burn finished the enemy');
  assert.deepEqual(r.snapshot(), m.snapshot());
});

test('restore refuses a snapshot for another map, content or format', () => {
  const m = new Match({ content: C, mapWorld: world('riftline'), seed: 'snap-bad' });
  const snap = m.snapshot();
  assert.throws(() => Match.restore(snap, { content: C, mapWorld: world('frostmere') }), /map/);
  assert.throws(() => Match.restore({ ...snap, v: 99 }, { content: C, mapWorld: world('riftline') }), /version/);
  assert.throws(() => Match.restore({ ...snap, contentVersion: 'other' }, { content: C, mapWorld: world('riftline') }), /content/);
  // the caller's snapshot is never aliased by the restored match
  const r = Match.restore(snap, { content: C, mapWorld: world('riftline') });
  r.wallets[0] += 1000;
  assert.equal(snap.wallets[0], m.cash);
});
