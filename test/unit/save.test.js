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
  assert.throws(() => importSave('hello', C), /Not a TDS save/);
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
