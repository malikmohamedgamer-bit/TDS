import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { createStorage } from '../../src/save/storage.js';
import { newSave, migrate, sanitize, exportSave, importSave, loadSave, writeSave, grantReward, SAVE_KEY, BACKUP_KEY, SAVE_SCHEMA } from '../../src/save/save.js';

const C = await content();
function memBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('storage falls back to memory when localStorage throws', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const s = createStorage(broken);
  assert.equal(s.persistent, false);
  s.set('a', '1');
  assert.equal(s.get('a'), '1');
  const none = createStorage(undefined);
  none.set('b', '2');
  assert.equal(none.get('b'), '2');
});

test('migrates a v1 prototype save to the current schema', () => {
  const v1 = { version: 1, gold: 250.7, towers: { rifleman: 3, marksman: 2 }, loadout: ['rifleman', 'marksman'], claimed: ['first_win'] };
  const s = sanitize(migrate(v1), C);
  assert.equal(s.schema, SAVE_SCHEMA);
  assert.equal(s.wallet.crowns, 250);
  assert.deepEqual(s.towers.owned.rifleman, { level: 3 });
  assert.deepEqual(s.towers.loadout, ['rifleman', 'marksman']);
  assert.deepEqual(s.claimed, ['first_win']);
  assert.throws(() => migrate({ schema: 999 }), /newer version/);
});

test('sanitize clamps bad values and drops unknown towers', () => {
  const s = sanitize({ schema: 2, wallet: { crowns: -50, sigils: 'x' }, towers: { owned: { rifleman: { level: 99 }, fake_tower: { level: 3 } }, loadout: ['rifleman', 'fake_tower'] }, profile: { xp: -1 } }, C);
  assert.equal(s.wallet.crowns, 0);
  assert.equal(s.wallet.sigils, 0);
  assert.equal(s.towers.owned.rifleman.level, 10);
  assert.equal(s.towers.owned.fake_tower, undefined);
  assert.deepEqual(s.towers.loadout, ['rifleman']);
  assert.equal(s.profile.xp, 0);
});

test('export / import round trip; tampering is rejected', () => {
  const s = newSave(123);
  s.wallet.crowns = 4321;
  const code = exportSave(s);
  assert.match(code, /^TDS1\./);
  const back = importSave(code, C);
  assert.equal(back.wallet.crowns, 4321);
  const parts = code.split('.');
  const tampered = `${parts[0]}.${Buffer.from(Buffer.from(parts[1], 'base64').toString().replace('4321', '999999')).toString('base64')}.${parts[2]}`;
  assert.throws(() => importSave(tampered, C), /checksum/);
  assert.throws(() => importSave('hello', C), /Not a Riftkeep save/);
});

test('write keeps a backup; a corrupt main save falls back to the backup', () => {
  const backend = memBackend();
  const st = createStorage(backend);
  const a = newSave(1);
  a.wallet.crowns = 10;
  writeSave(st, a, 1);
  const b = newSave(1);
  b.wallet.crowns = 20;
  writeSave(st, b, 2);
  assert.equal(JSON.parse(st.get(BACKUP_KEY)).wallet.crowns, 10);
  assert.equal(loadSave(st, C).save.wallet.crowns, 20);
  backend.setItem(SAVE_KEY, '{not json');
  const r = loadSave(st, C);
  assert.equal(r.source, 'backup');
  assert.equal(r.save.wallet.crowns, 10);
  backend.setItem(BACKUP_KEY, 'garbage');
  const r2 = loadSave(st, C);
  assert.equal(r2.source, 'fresh');
  assert.ok(r2.error);
});

test('rewards are granted exactly once', () => {
  const s = newSave();
  assert.equal(grantReward(s, 'quest:first_win', { crowns: 100, xp: 50, towers: ['marksman'] }), true);
  assert.equal(grantReward(s, 'quest:first_win', { crowns: 100, xp: 50 }), false);
  assert.equal(s.wallet.crowns, 100);
  assert.equal(s.profile.xp, 50);
  assert.ok(s.towers.owned.marksman);
  // survives an export / import round trip
  const back = importSave(exportSave(s), C);
  assert.equal(grantReward(back, 'quest:first_win', { crowns: 100 }), false);
});

test('fuzz: hand-edited and damaged saves never crash loading or the meta screens', async () => {
  const { Rng } = await import('../../src/core/rng.js');
  const meta = await import('../../src/meta/meta.js');
  const rng = new Rng('save-fuzz');
  const JUNK = [null, undefined, -1, 1e308, NaN, 'x', '', [], {}, true, [1, 2, 3], { level: 'a' }, '__proto__', 1.5, -0, '9'.repeat(400)];
  const mutate = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object') return rng.pick(JUNK);
    const keys = Object.keys(obj);
    if (!keys.length || rng.chance(0.15)) return rng.pick(JUNK);
    const k = rng.pick(keys);
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    copy[k] = depth < 3 && rng.chance(0.6) ? mutate(obj[k], depth + 1) : rng.pick(JUNK);
    if (rng.chance(0.2)) copy[`junk${rng.int(0, 9)}`] = rng.pick(JUNK);
    return copy;
  };
  const good = newSave(1);
  good.towers.owned = { rifleman: { level: 3 }, ember_adept: { level: 2 } };
  good.claimed = ['firstclear:riftline:easy:campaign', 'match:a'];
  good.progress.best = { riftline: { easy: 20 } };
  let repaired = 0;
  for (let i = 0; i < 400; i++) {
    let s = good;
    for (let n = rng.int(1, 4); n > 0; n--) s = mutate(s);
    const backend = memBackend();
    backend.setItem(SAVE_KEY, rng.chance(0.1) ? JSON.stringify(s ?? null).slice(0, rng.int(0, 200)) : JSON.stringify(s ?? null));
    const { save, source } = loadSave(createStorage(backend), C, 5);
    if (source === 'main') repaired++;
    assert.equal(save.schema, SAVE_SCHEMA);
    assert.ok(Number.isFinite(save.wallet.crowns) && save.wallet.crowns >= 0 && save.profile.level >= 1);
    // every screen that reads the save
    meta.questStatus(save, C.quests, C, '2026-11-11');
    meta.dailyStatus(save, C.meta, '2026-11-11');
    meta.levelForXp(C.meta, save.profile.xp);
    meta.applyMatchResult(save, { seed: `f${i}`, map: 'riftline', difficulty: 'easy', mode: 'campaign', won: true, wave: 20, waves: 20, stats: { kills: 5 }, seen: ['husk'], loadout: ['rifleman'] }, C, C.meta, '2026-11-11');
    writeSave(createStorage(backend), save, 6);
    assert.doesNotThrow(() => JSON.parse(backend.getItem(SAVE_KEY)));
  }
  assert.ok(repaired > 100, `most damaged saves are repaired, not reset (${repaired}/400)`);
});
