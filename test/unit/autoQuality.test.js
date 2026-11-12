import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QualityGovernor, defaultQuality } from '../../src/ui/autoQuality.js';
import { defaultSettings, loadSettings } from '../../src/save/settings.js';

test('quality governor: steps down one tier after sustained slow play, waits, never below low', () => {
  const g = new QualityGovernor({ minFps: 24, windows: 4, cooldown: 3, warmup: 2 });
  const run = (fps, n, active = true, q = 'high') => { let r = null; for (let i = 0; i < n && !r; i++) r = g.sample(fps, active, q); return r; };
  assert.equal(run(15, 2), null, 'warm-up windows are ignored');
  assert.equal(run(15, 3), null, 'not yet: 3 of 4 slow windows');
  assert.equal(g.sample(15, true, 'high'), 'medium');
  assert.equal(run(15, 3), null, 'cooldown');
  g.reset();
  assert.equal(run(15, 20, false), null, 'menus, pause and hidden tabs never count');
  assert.equal(run(40, 20), null, 'fast enough');
  g.reset();
  assert.equal(run(15, 6, true, 'low'), null, 'nothing below low');
  g.reset();
  // a fast window breaks the streak
  g.sample(15, true, 'medium'); g.sample(15, true, 'medium'); g.sample(15, true, 'medium');
  assert.equal(g.sample(15, true, 'medium'), null, 'still in warm-up after reset');
});

test('default quality: touch and weak hardware start on Low, others on Medium; auto stays on until the player picks', () => {
  assert.equal(defaultQuality({}), 'medium');
  assert.equal(defaultQuality({ coarsePointer: true }), 'low');
  assert.equal(defaultQuality({ deviceMemory: 4 }), 'low');
  assert.equal(defaultQuality({ cores: 2 }), 'low');
  assert.equal(defaultQuality({ deviceMemory: 8, cores: 8 }), 'medium');
  assert.equal(defaultSettings({ deviceMemory: 2 }).quality, 'low');
  assert.equal(defaultSettings({ deviceMemory: 16, cores: 12 }).quality, 'medium');
  assert.equal(defaultSettings({}).qualityAuto, true);
});

test('stored settings: an unknown quality falls back to the device default', () => {
  const store = (v) => ({ get: () => JSON.stringify(v), set() {} });
  assert.equal(loadSettings(store({ quality: '<b>x</b>' }), {}).quality, 'medium');
  assert.equal(loadSettings(store({ quality: 'ultra' }), {}).quality, 'ultra');
  assert.equal(loadSettings(store({ quality: 'nope' }), { coarsePointer: true }).quality, 'low');
});
