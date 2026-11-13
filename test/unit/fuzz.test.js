// Fuzz: hand-edited settings and hostile or random commands (co-op peers send commands too)
// must never crash the game or leave it in an impossible state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { Rng } from '../../src/core/rng.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { loadSettings, defaultSettings } from '../../src/save/settings.js';

const C = await content();
const JUNK = [null, undefined, true, false, 0, -1, 1e9, -1e9, 0.5, 3.7, '', 'x', 'NaN', '<b>hi</b>', [], [1, 2], {}, { a: 1 }, 'a'.repeat(5000)];

test('fuzz: settings from storage are always typed and in range', () => {
  const rng = new Rng('settings-fuzz');
  const keys = Object.keys(defaultSettings());
  for (let i = 0; i < 400; i++) {
    const raw = {};
    for (const k of keys) if (rng.next() < 0.6) raw[k] = JUNK[Math.floor(rng.next() * JUNK.length)];
    const text = rng.next() < 0.05 ? '{not json' : JSON.stringify(raw);
    const s = loadSettings({ get: () => text }, {});
    const d = defaultSettings();
    for (const k of keys) assert.equal(typeof s[k], typeof d[k], `${k} keeps its type`);
    for (const k of ['masterVolume', 'musicVolume', 'sfxVolume']) assert.ok(s[k] >= 0 && s[k] <= 1, `${k}=${s[k]}`);
    assert.ok(s.textScale >= 0.85 && s.textScale <= 1.5 && s.uiScale >= 0.85 && s.uiScale <= 1.25);
    assert.ok(s.resolutionScale >= 0.5 && s.resolutionScale <= 1 && s.mouseSensitivity >= 0.3 && s.mouseSensitivity <= 2.5);
    assert.ok([1, 2, 3, 4].includes(s.pixelation));
    assert.ok(s.playerName.length <= 24 && s.map.length <= 64);
  }
});

test('fuzz: random and hostile commands never throw or corrupt a match', () => {
  const map = C.maps.get('riftline');
  const m = new Match({ content: C, mapWorld: buildMapWorld(map, C.props), seed: 'cmd-fuzz', difficulty: 'normal' });
  const rng = new Rng('cmd-fuzz');
  const towers = [...C.towers.keys()];
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  const types = ['place', 'move', 'upgrade', 'sell', 'target', 'ability', 'abilityMode', 'skip', 'assistSkip', 'hero', 'nope', '', null, 42];
  const num = () => pick([rng.range(-80, 80), NaN, Infinity, -Infinity, 1e12, '3', null, undefined]);
  let accepted = 0;
  for (let i = 0; i < 3000; i++) {
    const uid = m.towers.length && rng.next() < 0.7 ? pick(m.towers).uid : pick([0, -1, 99999, 'x', null]);
    const cmd = { type: pick(types), tower: rng.next() < 0.8 ? pick(towers) : pick(JUNK), x: num(), z: num(), y: num(), uid,
      branch: pick([0, 1, 2, 'a', null]), mode: pick(['first', 'last', 'strong', 'close', 'auto', 'manual', 'bad', null]), id: pick(['airstrike', 'x', null]), pid: pick(['p1', 'p2', null]) };
    let r;
    assert.doesNotThrow(() => { r = m.validate(cmd); }, `validate ${JSON.stringify(cmd)}`);
    if (r?.ok) { assert.doesNotThrow(() => m.command(cmd), `command ${JSON.stringify(cmd)}`); accepted++; }
    if (i % 5 === 0) m.step();
    assert.ok(Number.isFinite(m.wallets[0]) && m.wallets[0] >= 0, `wallet ${m.wallets[0]} after ${JSON.stringify(cmd)}`);
    for (const t of m.towers) assert.ok(Number.isFinite(t.x) && Number.isFinite(t.z), `tower ${t.uid} at ${t.x},${t.z} after ${JSON.stringify(cmd)}`);
    if (m.phase === 'won' || m.phase === 'lost') break;
  }
  assert.ok(accepted > 5, `some commands were valid (${accepted})`);
});
